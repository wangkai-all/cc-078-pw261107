/**
 * 统计引擎：
 * - 版本感知评分：按答题提交时间匹配当时生效的规则修订
 * - 增量更新：补录只重算受影响的统计桶，并留下审计记录
 * - 数据质量：无效 / 缺失 / 重复 分开检测，缺项不当作答错
 */
import { bucketKey } from './types.ts';
import type {
  BackfillAudit,
  Bucket,
  Candidate,
  Dataset,
  DuplicateIssue,
  PaperQuestion,
  PaperVersion,
  QualityReport,
  Question,
  QuestionVersionStats,
  Response,
  RuleRevision,
} from './types.ts';

export const ALL_GROUP = 'ALL';

const emptyBucket = (questionId: string, paperVersion: string, group: string): Bucket => ({
  questionId,
  paperVersion,
  group,
  valid: 0,
  blank: 0,
  correct: 0,
  invalid: 0,
  optionCounts: {},
  scoreSum: 0,
  responseIds: [],
});

export class ExamEngine {
  questions = new Map<string, Question>();
  paperVersions = new Map<string, PaperVersion>();
  candidates = new Map<string, Candidate>();
  responses = new Map<string, Response>();

  /** 去重后的有效记录索引：candidate|question|version -> responseId（提交时间最新者） */
  private canonical = new Map<string, string>();
  /** 统计桶 */
  private buckets = new Map<string, Bucket>();
  /** 数据质量报告 */
  quality: QualityReport = { invalid: [], missing: [], duplicate: [] };
  /** 补录审计日志 */
  audits: BackfillAudit[] = [];
  /** 被判定无效的记录 ID 集合 */
  private invalidIds = new Set<string>();

  constructor(dataset?: Dataset) {
    if (dataset) this.loadDataset(dataset);
  }

  // ---------- 规则解析 ----------

  /** 找到题目在某试卷版本中的配置 */
  paperQuestion(questionId: string, paperVersion: string): PaperQuestion | undefined {
    return this.paperVersions.get(paperVersion)?.questions.find((pq) => pq.questionId === questionId);
  }

  /** 按提交时间解析当时生效的规则修订（按当时版本计算） */
  resolveRule(questionId: string, paperVersion: string, submittedAt: string): RuleRevision | undefined {
    const pq = this.paperQuestion(questionId, paperVersion);
    if (!pq || pq.rules.length === 0) return undefined;
    const t = Date.parse(submittedAt);
    let active: RuleRevision | undefined;
    for (const rule of pq.rules) {
      if (Date.parse(rule.effectiveFrom) <= t) active = rule;
      else break;
    }
    return active ?? pq.rules[0];
  }

  // ---------- 数据装载 ----------

  loadDataset(ds: Dataset) {
    this.questions = new Map(ds.questions.map((q) => [q.id, q]));
    this.paperVersions = new Map(ds.paperVersions.map((v) => [v.id, v]));
    this.candidates = new Map(ds.candidates.map((c) => [c.id, c]));
    this.responses = new Map();
    this.canonical = new Map();
    this.buckets = new Map();
    this.quality = { invalid: [], missing: [], duplicate: [] };
    this.audits = [];
    this.invalidIds = new Set();

    for (const r of ds.responses) {
      this.responses.set(r.id, r);
      this.admitResponse(r, null);
    }
    this.detectMissing();
  }

  private canonicalKey(r: Response) {
    return `${r.candidateId}|${r.questionId}|${r.paperVersion}`;
  }

  /**
   * 接纳一条答题记录：处理去重、有效性判定、更新统计桶。
   * 返回受影响的桶 key；audit 非空时记录补录审计。
   */
  private admitResponse(r: Response, audit: BackfillAudit | null): string[] {
    const affected: string[] = [];
    const ck = this.canonicalKey(r);
    const existingId = this.canonical.get(ck);
    const existing = existingId ? this.responses.get(existingId) : undefined;

    if (existing) {
      // 重复提交：保留提交时间最新者（并列时保留 id 较大者，保证确定性）
      const keepNew =
        Date.parse(r.submittedAt) > Date.parse(existing.submittedAt) ||
        (r.submittedAt === existing.submittedAt && r.id > existing.id);
      const dup: DuplicateIssue = {
        kind: 'duplicate',
        candidateId: r.candidateId,
        questionId: r.questionId,
        paperVersion: r.paperVersion,
        keptResponseId: keepNew ? r.id : existing.id,
        droppedResponseId: keepNew ? existing.id : r.id,
      };
      this.quality.duplicate.push(dup);
      if (!keepNew) {
        if (audit) audit.duplicatesIgnored++;
        return affected; // 旧记录，忽略
      }
      // 新记录顶替旧记录：先从桶中减去旧记录
      if (audit) audit.superseded++;
      affected.push(...this.applyToBuckets(existing, -1));
      this.canonical.set(ck, r.id);
      affected.push(...this.applyToBuckets(r, +1));
      return affected;
    }

    this.canonical.set(ck, r.id);
    affected.push(...this.applyToBuckets(r, +1));
    return affected;
  }

  /** 将一条记录按 +1/-1 应用到对应统计桶（群体桶 + 全体桶） */
  private applyToBuckets(r: Response, sign: 1 | -1): string[] {
    const candidate = this.candidates.get(r.candidateId);
    const group = candidate?.group ?? '未分组';
    const keys = [bucketKey(r.questionId, r.paperVersion, group), bucketKey(r.questionId, r.paperVersion, ALL_GROUP)];

    // 有效性判定是确定性的：同一条记录无论累加还是回退，判定结果一致
    const rule = this.resolveRule(r.questionId, r.paperVersion, r.submittedAt);
    const invalidReason = this.validateAnswer(r, rule);
    const isInvalid = !!invalidReason;

    if (sign === +1 && isInvalid) {
      this.invalidIds.add(r.id);
      this.quality.invalid.push({
        kind: 'invalid',
        responseId: r.id,
        candidateId: r.candidateId,
        questionId: r.questionId,
        paperVersion: r.paperVersion,
        answer: r.answer,
        reason: invalidReason,
      });
    }
    if (sign === -1 && isInvalid) {
      this.invalidIds.delete(r.id);
      this.quality.invalid = this.quality.invalid.filter((i) => i.responseId !== r.id);
    }

    for (const key of keys) {
      const [qid, vid, grp] = key.split('|');
      let b = this.buckets.get(key);
      if (!b) {
        b = emptyBucket(qid, vid, grp);
        this.buckets.set(key, b);
      }
      if (isInvalid) {
        b.invalid += sign;
      } else {
        b.valid += sign;
        if (r.answer.length === 0) {
          b.blank += sign;
        } else {
          for (const opt of r.answer) {
            b.optionCounts[opt] = (b.optionCounts[opt] ?? 0) + sign;
            if (b.optionCounts[opt] === 0) delete b.optionCounts[opt];
          }
          if (rule && this.isCorrect(r.answer, rule)) {
            b.correct += sign;
            b.scoreSum += sign * rule.score;
          }
        }
      }
      if (sign === +1) b.responseIds.push(r.id);
      else b.responseIds = b.responseIds.filter((id) => id !== r.id);
    }
    return keys;
  }

  private isCorrect(answer: string[], rule: RuleRevision): boolean {
    if (answer.length !== rule.correct.length) return false;
    const set = new Set(answer);
    return rule.correct.every((c) => set.has(c));
  }

  /** 无效判定：题目不存在、试卷无此题、选项超出当时版本有效范围 */
  private validateAnswer(r: Response, rule: RuleRevision | undefined): string | null {
    if (!this.questions.has(r.questionId)) return `题目 ${r.questionId} 不在题库中`;
    if (!rule) return `试卷版本 ${r.paperVersion} 中不存在题目 ${r.questionId}`;
    if (r.answer.length === 0) return null; // 空答是有效作答
    const bad = r.answer.filter((a) => !rule.options.includes(a));
    if (bad.length > 0) return `选项 ${bad.join(',')} 不在当时版本的有效选项 [${rule.options.join(',')}] 内`;
    if (r.answer.length > 1) return `单选题提交了 ${r.answer.length} 个选项`;
    return null;
  }

  /** 缺失检测：试卷要求作答但考生无任何记录（缺项不当作答错，单独提示） */
  private detectMissing() {
    this.quality.missing = [];
    // 记录引用了题库中不存在的题目
    for (const r of this.responses.values()) {
      if (!this.questions.has(r.questionId)) {
        this.quality.missing.push({
          kind: 'missing',
          questionId: r.questionId,
          paperVersion: r.paperVersion,
          candidateId: r.candidateId,
          reason: `答题记录引用了题库中不存在的题目 ${r.questionId}`,
        });
      }
    }
    // 考生试卷中应有的题目缺少记录
    const candidatesByVersion = new Map<string, Set<string>>();
    for (const r of this.responses.values()) {
      if (!candidatesByVersion.has(r.paperVersion)) candidatesByVersion.set(r.paperVersion, new Set());
      candidatesByVersion.get(r.paperVersion)!.add(r.candidateId);
    }
    for (const [vid, cands] of candidatesByVersion) {
      const paper = this.paperVersions.get(vid);
      if (!paper) continue;
      for (const cid of cands) {
        for (const pq of paper.questions) {
          const ck = `${cid}|${pq.questionId}|${vid}`;
          if (!this.canonical.has(ck)) {
            this.quality.missing.push({
              kind: 'missing',
              candidateId: cid,
              questionId: pq.questionId,
              paperVersion: vid,
              reason: `考生 ${cid} 在 ${paper.name} 第 ${pq.position} 题无任何作答记录`,
            });
          }
        }
      }
    }
  }

  // ---------- 补录（增量更新） ----------

  /**
   * 补录成绩：只更新受影响的统计桶，返回审计记录。
   * 不触碰与补录记录无关的桶。
   */
  applyBackfill(newResponses: Response[], note = '成绩补录'): BackfillAudit {
    const audit: BackfillAudit = {
      id: `BF-${String(this.audits.length + 1).padStart(3, '0')}`,
      appliedAt: new Date().toISOString(),
      note,
      responseCount: newResponses.length,
      affectedBuckets: [],
      superseded: 0,
      duplicatesIgnored: 0,
    };
    const affectedSet = new Set<string>();
    for (const r of newResponses) {
      this.responses.set(r.id, r);
      for (const k of this.admitResponse(r, audit)) affectedSet.add(k);
    }
    audit.affectedBuckets = [...affectedSet].sort();
    // 补录可能填补缺失：重跑缺失检测（仅缺失列表，统计桶不受影响）
    this.detectMissing();
    this.audits.push(audit);
    return audit;
  }

  // ---------- 查询 ----------

  private getBucket(questionId: string, paperVersion: string, group: string): Bucket {
    return (
      this.buckets.get(bucketKey(questionId, paperVersion, group)) ??
      emptyBucket(questionId, paperVersion, group)
    );
  }

  /** 题目 × 版本 × 群体 的派生统计 */
  statsFor(questionId: string, paperVersion: string, group = ALL_GROUP): QuestionVersionStats {
    const b = this.getBucket(questionId, paperVersion, group);
    return {
      questionId,
      paperVersion,
      group,
      valid: b.valid,
      blank: b.blank,
      correct: b.correct,
      invalid: b.invalid,
      correctRate: b.valid > 0 ? b.correct / b.valid : null,
      blankRate: b.valid > 0 ? b.blank / b.valid : null,
      avgScore: b.correct > 0 ? b.scoreSum / b.valid : b.valid > 0 ? 0 : null,
      optionCounts: { ...b.optionCounts },
      responseIds: [...b.responseIds],
    };
  }

  /** 题目在指定版本集合上的聚合统计（正确性已按各版本当时规则判定，此处仅汇总计数） */
  statsAcross(questionId: string, versionIds: string[], group = ALL_GROUP): QuestionVersionStats {
    const versions = versionIds.filter((vid) => this.paperQuestion(questionId, vid));
    const merged = emptyBucket(questionId, '*', group);
    const ids: string[] = [];
    for (const vid of versions) {
      const b = this.getBucket(questionId, vid, group);
      merged.valid += b.valid;
      merged.blank += b.blank;
      merged.correct += b.correct;
      merged.invalid += b.invalid;
      merged.scoreSum += b.scoreSum;
      for (const [k, v] of Object.entries(b.optionCounts)) {
        merged.optionCounts[k] = (merged.optionCounts[k] ?? 0) + v;
      }
      ids.push(...b.responseIds);
    }
    return {
      questionId,
      paperVersion: '*',
      group,
      valid: merged.valid,
      blank: merged.blank,
      correct: merged.correct,
      invalid: merged.invalid,
      correctRate: merged.valid > 0 ? merged.correct / merged.valid : null,
      blankRate: merged.valid > 0 ? merged.blank / merged.valid : null,
      avgScore: merged.valid > 0 ? merged.scoreSum / merged.valid : null,
      optionCounts: merged.optionCounts,
      responseIds: ids,
    };
  }

  /** 题目跨全部版本聚合统计 */
  statsAggregated(questionId: string, group = ALL_GROUP): QuestionVersionStats {
    return this.statsAcross(questionId, [...this.paperVersions.keys()], group);
  }

  /** 群体对比：某题（可选限定版本）各群体正确率 */
  groupComparison(questionId: string, paperVersion: string | '*'): { group: string; stats: QuestionVersionStats }[] {
    const groups = [...new Set([...this.candidates.values()].map((c) => c.group))].sort();
    return groups.map((g) => ({
      group: g,
      stats: paperVersion === '*' ? this.statsAggregated(questionId, g) : this.statsFor(questionId, paperVersion, g),
    }));
  }

  /** 溯源：取某个统计口径背后的原始答题记录 */
  recordsBehind(questionId: string, paperVersion: string | '*', group = ALL_GROUP): Response[] {
    const stats = paperVersion === '*' ? this.statsAggregated(questionId, group) : this.statsFor(questionId, paperVersion, group);
    return stats.responseIds
      .map((id) => this.responses.get(id)!)
      .filter(Boolean)
      .sort((a, b) => a.candidateId.localeCompare(b.candidateId));
  }

  /** 溯源：指定版本集合 + 群体口径背后的原始答题记录 */
  recordsAcross(questionId: string, versionIds: string[], group = ALL_GROUP): Response[] {
    const stats = this.statsAcross(questionId, versionIds, group);
    return stats.responseIds
      .map((id) => this.responses.get(id)!)
      .filter(Boolean)
      .sort((a, b) => a.candidateId.localeCompare(b.candidateId));
  }

  /** 某题在各试卷版本中的位置 */
  placements(questionId: string): { paperVersion: string; versionName: string; position: number }[] {
    const out: { paperVersion: string; versionName: string; position: number }[] = [];
    for (const v of this.paperVersions.values()) {
      const pq = v.questions.find((q) => q.questionId === questionId);
      if (pq) out.push({ paperVersion: v.id, versionName: v.name, position: pq.position });
    }
    return out.sort((a, b) => a.paperVersion.localeCompare(b.paperVersion));
  }

  allGroups(): string[] {
    return [...new Set([...this.candidates.values()].map((c) => c.group))].sort();
  }

  allKnowledge(): string[] {
    return [...new Set([...this.questions.values()].map((q) => q.knowledge))].sort();
  }
}
