/**
 * 虚构示例数据生成器。
 * 所有考生均为虚构匿名编号（S-0001…），不含任何真实信息。
 * 数据特意包含：跨版本改选项（Q05）、版本内中途改评分规则（Q08）、
 * 无效答题、重复提交、缺失记录，以及一个可手动应用的补录批次。
 */
import type { Candidate, Dataset, PaperVersion, Question, Response } from './types.ts';

/** 确定性伪随机数（mulberry32），保证每次生成的示例数据一致 */
function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const OPTS4 = ['A', 'B', 'C', 'D'];

interface QSpec {
  id: string;
  title: string;
  knowledge: string;
  labels: Record<string, string>;
  trueAnswer: string; // 真实正确答案（评分规则可能误标，见 Q08）
  difficulty: number; // 0..1，越大越难
  distractor: string; // 最具迷惑性的错误选项
}

const QSPECS: QSpec[] = [
  { id: 'Q01', title: '函数 f(x)=2x+1 在 x=3 处的值', knowledge: '函数', difficulty: 0.15, trueAnswer: 'C', distractor: 'B', labels: { A: '5', B: '6', C: '7', D: '8' } },
  { id: 'Q02', title: '方程 x²-5x+6=0 的较小根', knowledge: '方程', difficulty: 0.3, trueAnswer: 'B', distractor: 'C', labels: { A: '1', B: '2', C: '3', D: '6' } },
  { id: 'Q03', title: '直角三角形两直角边为 3 和 4，斜边长', knowledge: '几何', difficulty: 0.2, trueAnswer: 'A', distractor: 'B', labels: { A: '5', B: '6', C: '7', D: '√7' } },
  { id: 'Q04', title: '掷一枚均匀骰子，点数为偶数的概率', knowledge: '概率统计', difficulty: 0.25, trueAnswer: 'C', distractor: 'B', labels: { A: '1/6', B: '1/3', C: '1/2', D: '2/3' } },
  { id: 'Q05', title: '等差数列 2, 5, 8, … 的第 10 项', knowledge: '数列', difficulty: 0.4, trueAnswer: 'B', distractor: 'A', labels: { A: '27', B: '29', C: '31', D: '33', E: '35' } },
  { id: 'Q06', title: '函数 y=x² 图象的顶点坐标', knowledge: '函数', difficulty: 0.2, trueAnswer: 'A', distractor: 'C', labels: { A: '(0,0)', B: '(1,1)', C: '(0,1)', D: '(2,4)' } },
  { id: 'Q07', title: '半径为 2 的圆的面积', knowledge: '几何', difficulty: 0.3, trueAnswer: 'B', distractor: 'A', labels: { A: '2π', B: '4π', C: '8π', D: '16π' } },
  { id: 'Q08', title: '从 5 个不同的球中取出 2 个的组合数', knowledge: '概率统计', difficulty: 0.45, trueAnswer: 'A', distractor: 'B', labels: { A: '10', B: '20', C: '15', D: '25' } },
  { id: 'Q09', title: '不等式 2x-3>5 的解集', knowledge: '方程', difficulty: 0.35, trueAnswer: 'A', distractor: 'C', labels: { A: 'x>4', B: 'x<4', C: 'x>1', D: 'x≥4' } },
  { id: 'Q10', title: '等比数列 3, 6, 12, … 的第 6 项', knowledge: '数列', difficulty: 0.55, trueAnswer: 'B', distractor: 'A', labels: { A: '48', B: '96', C: '192', D: '36' } },
  { id: 'Q11', title: 'log₂8 的值', knowledge: '函数', difficulty: 0.4, trueAnswer: 'B', distractor: 'C', labels: { A: '2', B: '3', C: '4', D: '8' } },
  { id: 'Q12', title: '数据 1, 2, 3, 4, 5 的中位数', knowledge: '概率统计', difficulty: 0.15, trueAnswer: 'C', distractor: 'B', labels: { A: '2', B: '2.5', C: '3', D: '4' } },
];

const labelsOf = (qid: string, keys: string[]) => {
  const spec = QSPECS.find((s) => s.id === qid)!;
  return Object.fromEntries(keys.map((k) => [k, spec.labels[k]]));
};

/** 三个试卷版本：题目子集与排布不同；Q05 在 v2/v3 增加了 E 选项；Q08 在 v2 中途更正答案 */
function buildPaperVersions(): PaperVersion[] {
  const pq = (qid: string, position: number, options: string[], correct: string, effectiveFrom: string, note?: string) => ({
    questionId: qid,
    position,
    rules: [{ effectiveFrom, options, optionLabels: labelsOf(qid, options), correct: [correct], score: 5, ...(note ? { note } : {}) }],
  });

  const v1Order = ['Q01', 'Q02', 'Q03', 'Q04', 'Q05', 'Q06', 'Q07', 'Q08', 'Q09', 'Q10'];
  const v1: PaperVersion = {
    id: 'v1',
    name: '2026 春季·A 卷',
    questions: v1Order.map((qid, i) => pq(qid, i + 1, OPTS4, QSPECS.find((s) => s.id === qid)!.trueAnswer, '2026-01-01T00:00:00Z')),
  };

  // B 卷：顺序打乱；Q05 增加 E 选项；Q08 评分规则中途更正（03-05 前误标 C，之后更正为 A）
  const v2Order = ['Q03', 'Q07', 'Q01', 'Q09', 'Q05', 'Q02', 'Q08', 'Q04', 'Q10', 'Q06'];
  const v2: PaperVersion = {
    id: 'v2',
    name: '2026 春季·B 卷',
    questions: v2Order.map((qid, i) => {
      if (qid === 'Q05') {
        return pq(qid, i + 1, ['A', 'B', 'C', 'D', 'E'], 'B', '2026-01-01T00:00:00Z', '本版本起增加选项 E');
      }
      if (qid === 'Q08') {
        return {
          questionId: qid,
          position: i + 1,
          rules: [
            { effectiveFrom: '2026-01-01T00:00:00Z', options: OPTS4, optionLabels: labelsOf('Q08', OPTS4), correct: ['C'], score: 5, note: '初始评分规则（后查明误标）' },
            { effectiveFrom: '2026-03-05T00:00:00Z', options: OPTS4, optionLabels: labelsOf('Q08', OPTS4), correct: ['A'], score: 5, note: '纠错：正确答案由 C 更正为 A' },
          ],
        };
      }
      return pq(qid, i + 1, OPTS4, QSPECS.find((s) => s.id === qid)!.trueAnswer, '2026-01-01T00:00:00Z');
    }),
  };

  // C 卷：不同题目子集（Q03–Q12），Q05 同样为 5 选项
  const v3Order = ['Q11', 'Q04', 'Q08', 'Q03', 'Q12', 'Q06', 'Q09', 'Q05', 'Q07', 'Q10'];
  const v3: PaperVersion = {
    id: 'v3',
    name: '2026 春季·C 卷',
    questions: v3Order.map((qid, i) => {
      const opts = qid === 'Q05' ? ['A', 'B', 'C', 'D', 'E'] : OPTS4;
      return pq(qid, i + 1, opts, QSPECS.find((s) => s.id === qid)!.trueAnswer, '2026-01-01T00:00:00Z');
    }),
  };

  return [v1, v2, v3];
}

const GROUPS = ['甲班', '乙班', '丙班'] as const;
const GROUP_SKILL: Record<string, number> = { 甲班: 0.68, 乙班: 0.57, 丙班: 0.49 };

export interface SampleData {
  dataset: Dataset;
  /** 待应用的补录批次（在页面上手动触发，演示增量更新） */
  backfillBatch: Response[];
}

export function generateSampleData(seed = 20260301): SampleData {
  const rand = mulberry32(seed);
  const questions: Question[] = QSPECS.map((s) => ({ id: s.id, title: s.title, knowledge: s.knowledge, type: 'single' as const }));
  const paperVersions = buildPaperVersions();

  // 180 名虚构考生：编号轮转分配群体；每个版本 60 人（每个群体 20 人）
  const candidates: Candidate[] = [];
  for (let i = 1; i <= 180; i++) {
    candidates.push({ id: `S-${String(i).padStart(4, '0')}`, group: GROUPS[(i - 1) % 3] });
  }
  const versionOf = (idx: number) => (idx <= 60 ? 'v1' : idx <= 120 ? 'v2' : 'v3');

  // v2 分两个场次：03-01 与 03-08（Q08 纠错规则 03-05 生效，正好跨场次）
  const sessionOf = (vid: string, idx: number): [number, number] => {
    if (vid === 'v1') return [Date.UTC(2026, 2, 1, 9), Date.UTC(2026, 2, 1, 10, 30)];
    if (vid === 'v3') return [Date.UTC(2026, 2, 3, 9), Date.UTC(2026, 2, 3, 10, 30)];
    return idx <= 90
      ? [Date.UTC(2026, 2, 1, 9), Date.UTC(2026, 2, 1, 10, 30)]
      : [Date.UTC(2026, 2, 8, 9), Date.UTC(2026, 2, 8, 10, 30)];
  };

  const responses: Response[] = [];
  let rid = 0;
  const nextId = () => `R-${String(++rid).padStart(5, '0')}`;

  for (const cand of candidates) {
    const idx = Number(cand.id.slice(2));
    const vid = versionOf(idx);
    const paper = paperVersions.find((p) => p.id === vid)!;
    const skill = GROUP_SKILL[cand.group] + (rand() - 0.5) * 0.16;
    const [t0, t1] = sessionOf(vid, idx);

    for (const pq of paper.questions) {
      const spec = QSPECS.find((s) => s.id === pq.questionId)!;
      const submittedAt = new Date(t0 + rand() * (t1 - t0)).toISOString();
      // 空答概率 3%
      if (rand() < 0.03) {
        responses.push({ id: nextId(), candidateId: cand.id, paperVersion: vid, questionId: pq.questionId, answer: [], submittedAt, source: 'initial' });
        continue;
      }
      const pCorrect = Math.min(0.97, Math.max(0.05, skill * 0.55 + (1 - spec.difficulty) * 0.45));
      let answer: string;
      if (rand() < pCorrect) {
        answer = spec.trueAnswer;
      } else {
        const rule = pq.rules[0];
        const wrongs = rule.options.filter((o) => o !== spec.trueAnswer);
        answer = rand() < 0.5 && wrongs.includes(spec.distractor)
          ? spec.distractor
          : wrongs[Math.floor(rand() * wrongs.length)];
      }
      responses.push({ id: nextId(), candidateId: cand.id, paperVersion: vid, questionId: pq.questionId, answer: [answer], submittedAt, source: 'initial' });
    }
  }

  // ---- 注入数据质量边界情况 ----
  const nonBlank = responses.filter((r) => r.answer.length > 0);

  // 1) 无效答题 ×8：选项越界 / 单选多选
  for (let i = 0; i < 8; i++) {
    const r = nonBlank[Math.floor(rand() * nonBlank.length)];
    if (r.questionId === 'Q05' && r.paperVersion !== 'v1') {
      r.answer = ['Z']; // Q05 在 v2/v3 有 E，改用 Z 保证无效
    } else if (i % 2 === 0) {
      r.answer = ['E']; // 其余题只有 A–D
    } else {
      r.answer = ['A', 'B']; // 单选题多选
    }
  }

  // 2) 重复提交 ×6：同一考生同一题更早的另一条记录（统计取最新，早的标记为重复）
  for (let i = 0; i < 6; i++) {
    const base = nonBlank[Math.floor(rand() * nonBlank.length)];
    const earlier = new Date(Date.parse(base.submittedAt) - 10 * 60 * 1000).toISOString();
    responses.push({
      id: nextId(),
      candidateId: base.candidateId,
      paperVersion: base.paperVersion,
      questionId: base.questionId,
      answer: [base.answer[0] === 'A' ? 'B' : 'A'],
      submittedAt: earlier,
      source: 'initial',
    });
  }

  // 3) 缺失记录 ×15：整题无任何记录（缺项不当作答错，单独提示；其中 10 条由补录填补）
  const missingPool = responses.filter((r) => r.answer.length > 0 && !['E', 'Z'].includes(r.answer[0]));
  const missing: Response[] = [];
  const usedKey = new Set<string>();
  while (missing.length < 15) {
    const r = missingPool[Math.floor(rand() * missingPool.length)];
    const key = `${r.candidateId}|${r.questionId}`;
    if (usedKey.has(key)) continue;
    usedKey.add(key);
    missing.push(r);
  }
  const missingIds = new Set(missing.map((r) => r.id));
  const keptResponses = responses.filter((r) => !missingIds.has(r.id));

  // 4) 引用不存在题目 ×2（Q99 不在题库中）
  keptResponses.push(
    { id: nextId(), candidateId: 'S-0007', paperVersion: 'v1', questionId: 'Q99', answer: ['A'], submittedAt: '2026-03-01T09:40:00.000Z', source: 'initial' },
    { id: nextId(), candidateId: 'S-0066', paperVersion: 'v2', questionId: 'Q99', answer: ['C'], submittedAt: '2026-03-01T09:45:00.000Z', source: 'initial' },
  );

  // ---- 补录批次：10 条填补缺失 + 3 条更正（顶替现有记录）+ 2 条过期重复（被忽略） ----
  const backfillBatch: Response[] = [];
  let bid = 0;
  const nextBfId = () => `BF-R-${String(++bid).padStart(3, '0')}`;
  const bfTime = '2026-03-12T10:00:00.000Z';

  for (const m of missing.slice(0, 10)) {
    const spec = QSPECS.find((s) => s.id === m.questionId)!;
    backfillBatch.push({
      id: nextBfId(),
      candidateId: m.candidateId,
      paperVersion: m.paperVersion,
      questionId: m.questionId,
      answer: rand() < 0.6 ? [spec.trueAnswer] : [spec.distractor],
      submittedAt: bfTime,
      source: 'backfill',
    });
  }
  // 3 条更正：补录时间更晚，顶替原记录（答案改为正确项，能直观看到统计变化）
  const specOf = (qid: string) => QSPECS.find((s) => s.id === qid);
  const correctable = keptResponses.filter((r) => {
    const spec = specOf(r.questionId);
    return spec && r.answer.length > 0 && r.answer[0] !== spec.trueAnswer;
  }).slice(0, 3);
  for (const c of correctable) {
    const spec = QSPECS.find((s) => s.id === c.questionId)!;
    backfillBatch.push({ id: nextBfId(), candidateId: c.candidateId, paperVersion: c.paperVersion, questionId: c.questionId, answer: [spec.trueAnswer], submittedAt: bfTime, source: 'backfill' });
  }
  // 2 条过期重复：提交时间早于现有记录，应被忽略并标记
  const dupBase = keptResponses.filter((r) => specOf(r.questionId) && r.answer.length > 0).slice(10, 12);
  for (const d of dupBase) {
    backfillBatch.push({
      id: nextBfId(),
      candidateId: d.candidateId,
      paperVersion: d.paperVersion,
      questionId: d.questionId,
      answer: ['A'],
      submittedAt: new Date(Date.parse(d.submittedAt) - 3600_000).toISOString(),
      source: 'backfill',
    });
  }

  return {
    dataset: { questions, paperVersions, candidates, responses: keptResponses },
    backfillBatch,
  };
}
