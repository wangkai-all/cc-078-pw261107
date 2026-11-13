/**
 * 数据导入 / 导出。
 * 导入：题库+试卷版本（JSON）、答题记录（CSV 或 JSON）。
 * 导出：审阅表 CSV（按当前筛选）、原始样本 CSV（筛选可回溯到原始记录）。
 */
import { ExamEngine, ALL_GROUP } from './stats.ts';
import type { Dataset, Question, PaperVersion, Candidate, Response } from './types.ts';

// ---------- 导入 ----------

export interface ImportResult {
  ok: boolean;
  errors: string[];
  dataset?: Partial<Dataset>;
  responses?: Response[];
}

export function parseDatasetJson(text: string): ImportResult {
  const errors: string[] = [];
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch (e) {
    return { ok: false, errors: [`JSON 解析失败：${(e as Error).message}`] };
  }
  const obj = raw as Record<string, unknown>;
  const questions = (obj.questions ?? []) as Question[];
  const paperVersions = (obj.paperVersions ?? []) as PaperVersion[];
  const candidates = (obj.candidates ?? []) as Candidate[];

  if (!Array.isArray(questions) || questions.length === 0) errors.push('缺少 questions 数组（题库）');
  if (!Array.isArray(paperVersions) || paperVersions.length === 0) errors.push('缺少 paperVersions 数组（试卷版本）');
  if (!Array.isArray(candidates) || candidates.length === 0) errors.push('缺少 candidates 数组（考生，须为匿名编号）');

  const qids = new Set(questions.map((q) => q.id));
  for (const v of paperVersions) {
    for (const pq of v.questions ?? []) {
      if (!qids.has(pq.questionId)) errors.push(`试卷 ${v.id} 引用了题库中不存在的题目 ${pq.questionId}`);
      if (!Array.isArray(pq.rules) || pq.rules.length === 0) errors.push(`试卷 ${v.id} 题目 ${pq.questionId} 缺少评分规则 rules`);
    }
  }
  if (errors.length > 0) return { ok: false, errors };
  return { ok: true, errors, dataset: { questions, paperVersions, candidates } };
}

/** CSV 列：candidateId,paperVersion,questionId,answer,submittedAt[,source]；answer 为空即空答 */
export function parseResponsesCsv(text: string, defaultSource: 'initial' | 'backfill' = 'initial'): ImportResult {
  const errors: string[] = [];
  const responses: Response[] = [];
  const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (lines.length === 0) return { ok: false, errors: ['CSV 内容为空'] };

  const header = lines[0].split(',').map((h) => h.trim());
  const need = ['candidateId', 'paperVersion', 'questionId', 'answer', 'submittedAt'];
  for (const n of need) if (!header.includes(n)) errors.push(`缺少列：${n}`);
  if (errors.length > 0) return { ok: false, errors };

  const idx = Object.fromEntries(header.map((h, i) => [h, i]));
  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i].split(',').map((c) => c.trim());
    const answerRaw = cols[idx.answer] ?? '';
    const sourceRaw = idx.source !== undefined ? cols[idx.source] : '';
    const ts = Date.parse(cols[idx.submittedAt]);
    if (!cols[idx.candidateId] || !cols[idx.paperVersion] || !cols[idx.questionId] || Number.isNaN(ts)) {
      errors.push(`第 ${i + 1} 行字段不完整或时间格式错误`);
      continue;
    }
    const r: Response = {
      id: `IMP-${i}-${Date.now().toString(36)}`,
      candidateId: cols[idx.candidateId],
      paperVersion: cols[idx.paperVersion],
      questionId: cols[idx.questionId],
      answer: answerRaw === '' ? [] : answerRaw.split('|').map((s) => s.trim().toUpperCase()),
      submittedAt: new Date(ts).toISOString(),
      source: sourceRaw === 'backfill' ? 'backfill' : defaultSource,
    };
    responses.push(r);
  }
  return { ok: errors.length === 0, errors, responses };
}

// ---------- 导出 ----------

const csvEscape = (v: string | number | null): string => {
  if (v === null) return '';
  const s = String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

const pct = (x: number | null): string => (x === null ? '' : `${(x * 100).toFixed(1)}%`);

export function toCsv(rows: (string | number | null)[][]): string {
  // 带 BOM，Excel 打开中文不乱码
  return '\uFEFF' + rows.map((r) => r.map(csvEscape).join(',')).join('\n');
}

export interface ExportFilter {
  versions?: string[]; // 限定试卷版本集合；缺省为全部
  knowledge?: string;
}

/** 审阅表：题目 × 版本 一行，含正确率、空答率、选项分布、群体差异与质量计数 */
export function exportReviewCsv(engine: ExamEngine, filter: ExportFilter = {}): string {
  const header = [
    '题目ID', '题干摘要', '知识点', '试卷版本', '卷内题号',
    '有效作答', '正确数', '正确率', '空答数', '空答率', '无效数',
    '选项分布', '各群体正确率', '评分规则(当时生效)', '数据质量提示',
  ];
  const rows: (string | number | null)[][] = [header];
  const groups = engine.allGroups();

  for (const q of [...engine.questions.values()].sort((a, b) => a.id.localeCompare(b.id))) {
    if (filter.knowledge && q.knowledge !== filter.knowledge) continue;
    for (const v of engine.paperVersions.values()) {
      if (filter.versions && filter.versions.length > 0 && !filter.versions.includes(v.id)) continue;
      const pq = v.questions.find((x) => x.questionId === q.id);
      if (!pq) continue;
      const s = engine.statsFor(q.id, v.id, ALL_GROUP);
      const optDist = Object.entries(s.optionCounts)
        .sort()
        .map(([k, n]) => `${k}:${n}`)
        .join(' ');
      const groupRates = groups
        .map((g) => {
          const gs = engine.statsFor(q.id, v.id, g);
          return `${g}:${pct(gs.correctRate) || '—'}`;
        })
        .join(' ');
      const ruleDesc = pq.rules
        .map((r) => `${r.effectiveFrom.slice(0, 10)}起 答案${r.correct.join('')}/${r.options.length}选项`)
        .join('；');
      const issues: string[] = [];
      if (s.invalid > 0) issues.push(`无效${s.invalid}`);
      const miss = engine.quality.missing.filter((m) => m.questionId === q.id && m.paperVersion === v.id).length;
      if (miss > 0) issues.push(`缺失${miss}`);
      const dup = engine.quality.duplicate.filter((d) => d.questionId === q.id && d.paperVersion === v.id).length;
      if (dup > 0) issues.push(`重复${dup}`);
      rows.push([
        q.id, q.title, q.knowledge, v.name, pq.position,
        s.valid, s.correct, pct(s.correctRate), s.blank, pct(s.blankRate), s.invalid,
        optDist, groupRates, ruleDesc, issues.join(' ') || '无',
      ]);
    }
  }
  return toCsv(rows);
}

/** 原始样本：当前筛选口径背后的答题记录 */
export function exportRecordsCsv(engine: ExamEngine, records: Response[]): string {
  const header = ['记录ID', '考生编号(虚构)', '群体', '试卷版本', '题目ID', '作答', '判定', '提交时间', '来源'];
  const rows: (string | number | null)[][] = [header];
  for (const r of records) {
    const cand = engine.candidates.get(r.candidateId);
    const rule = engine.resolveRule(r.questionId, r.paperVersion, r.submittedAt);
    let verdict = '空答';
    if (r.answer.length > 0 && rule) {
      const ok = r.answer.length === rule.correct.length && rule.correct.every((c) => r.answer.includes(c));
      verdict = ok ? '正确' : '错误';
    }
    rows.push([
      r.id, r.candidateId, cand?.group ?? '未分组', engine.paperVersions.get(r.paperVersion)?.name ?? r.paperVersion,
      r.questionId, r.answer.join('|') || '(空)', verdict, r.submittedAt, r.source === 'backfill' ? '补录' : '原始',
    ]);
  }
  return toCsv(rows);
}

export function downloadCsv(filename: string, csv: string) {
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
