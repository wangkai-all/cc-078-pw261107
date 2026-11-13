/**
 * 统计引擎自测（node --experimental-strip-types 或直接 node 运行）。
 * 覆盖：版本感知评分、增量补录、无效/缺失/重复分离、缺项不计为答错。
 */
import { ExamEngine, ALL_GROUP } from './stats.ts';
import { generateSampleData } from './sampleData.ts';
import type { Dataset } from './types.ts';

let failures = 0;
function check(name: string, cond: boolean, detail = '') {
  if (cond) console.log(`  ✓ ${name}`);
  else {
    failures++;
    console.error(`  ✗ ${name} ${detail}`);
  }
}

// ---------- 最小构造数据集 ----------
const mini: Dataset = {
  questions: [
    { id: 'Q1', title: 't', knowledge: 'k', type: 'single' },
    { id: 'Q2', title: 't2', knowledge: 'k', type: 'single' },
  ],
  paperVersions: [
    {
      id: 'v1',
      name: 'V1',
      questions: [
        {
          questionId: 'Q1',
          position: 1,
          rules: [
            { effectiveFrom: '2026-01-01T00:00:00Z', options: ['A', 'B'], optionLabels: { A: 'a', B: 'b' }, correct: ['A'], score: 5 },
            { effectiveFrom: '2026-03-01T00:00:00Z', options: ['A', 'B'], optionLabels: { A: 'a', B: 'b' }, correct: ['B'], score: 5 },
          ],
        },
        {
          questionId: 'Q2',
          position: 2,
          rules: [{ effectiveFrom: '2026-01-01T00:00:00Z', options: ['A', 'B'], optionLabels: { A: 'a', B: 'b' }, correct: ['A'], score: 5 }],
        },
      ],
    },
  ],
  candidates: [
    { id: 'S1', group: 'G1' },
    { id: 'S2', group: 'G1' },
    { id: 'S3', group: 'G2' },
  ],
  responses: [
    // 规则变更前答 B → 当时规则下错误
    { id: 'r1', candidateId: 'S1', paperVersion: 'v1', questionId: 'Q1', answer: ['B'], submittedAt: '2026-02-01T10:00:00Z', source: 'initial' },
    // 规则变更后答 B → 当时规则下正确
    { id: 'r2', candidateId: 'S2', paperVersion: 'v1', questionId: 'Q1', answer: ['B'], submittedAt: '2026-03-02T10:00:00Z', source: 'initial' },
    // 空答
    { id: 'r3', candidateId: 'S3', paperVersion: 'v1', questionId: 'Q1', answer: [], submittedAt: '2026-03-02T10:00:00Z', source: 'initial' },
    // S3 在同卷另有 Q2 记录：删除 r3 后仍能判定 S3 缺 Q1（缺项而非未参考）
    { id: 'r4', candidateId: 'S3', paperVersion: 'v1', questionId: 'Q2', answer: ['A'], submittedAt: '2026-03-02T10:00:00Z', source: 'initial' },
  ],
};

console.log('版本感知评分（按当时版本计算）');
{
  const e = new ExamEngine(mini);
  const s = e.statsFor('Q1', 'v1', ALL_GROUP);
  check('有效作答=3', s.valid === 3, `got ${s.valid}`);
  check('正确=1（变更后的 B）', s.correct === 1, `got ${s.correct}`);
  check('空答=1', s.blank === 1, `got ${s.blank}`);
  check('正确率=1/3', Math.abs((s.correctRate ?? 0) - 1 / 3) < 1e-9);
  const g2 = e.statsFor('Q1', 'v1', 'G2');
  check('G2 空答率=100%', g2.blankRate === 1);
}

console.log('重复提交：取最新，旧的单独标记');
{
  const ds: Dataset = structuredClone(mini);
  ds.responses.push({ id: 'r2-old', candidateId: 'S2', paperVersion: 'v1', questionId: 'Q1', answer: ['A'], submittedAt: '2026-03-02T09:00:00Z', source: 'initial' });
  const e = new ExamEngine(ds);
  const s = e.statsFor('Q1', 'v1', ALL_GROUP);
  check('重复记录不重复计数 valid=3', s.valid === 3, `got ${s.valid}`);
  check('重复问题被标记 1 条', e.quality.duplicate.length === 1);
  check('保留的是较新记录 r2', e.quality.duplicate[0].keptResponseId === 'r2');
}

console.log('无效答题：不计入有效，不当作答错');
{
  const ds: Dataset = structuredClone(mini);
  ds.responses.push({ id: 'rX', candidateId: 'S1', paperVersion: 'v1', questionId: 'Q1', answer: ['Z'], submittedAt: '2026-03-02T11:00:00Z', source: 'initial' });
  // S1 已有 r1（更早），rX 更晚 → 顶替；rX 无效
  const e = new ExamEngine(ds);
  const s = e.statsFor('Q1', 'v1', ALL_GROUP);
  check('无效不计入 valid=2', s.valid === 2, `got ${s.valid}`);
  check('无效计数=1', s.invalid === 1, `got ${s.invalid}`);
  check('无效问题单独列出', e.quality.invalid.length === 1 && e.quality.invalid[0].responseId === 'rX');
}

console.log('缺失题目：缺项不当作答错');
{
  const ds: Dataset = structuredClone(mini);
  ds.responses = ds.responses.filter((r) => r.id !== 'r3'); // S3 整题无记录
  const e = new ExamEngine(ds);
  const s = e.statsFor('Q1', 'v1', ALL_GROUP);
  check('缺失不计入 valid=2', s.valid === 2, `got ${s.valid}`);
  check('缺失被单独提示', e.quality.missing.some((m) => m.candidateId === 'S3' && m.questionId === 'Q1'));
  check('正确率不受缺失影响=1/2', Math.abs((s.correctRate ?? 0) - 0.5) < 1e-9);
}

console.log('补录：只更新受影响的统计桶');
{
  const e = new ExamEngine(structuredClone(mini));
  const before = e.statsFor('Q1', 'v1', ALL_GROUP);
  const audit = e.applyBackfill([
    // 顶替 r3（空答 → 答对，按当时规则 B 正确）
    { id: 'bf1', candidateId: 'S3', paperVersion: 'v1', questionId: 'Q1', answer: ['B'], submittedAt: '2026-03-03T10:00:00Z', source: 'backfill' },
    // 过期重复，应被忽略
    { id: 'bf2', candidateId: 'S2', paperVersion: 'v1', questionId: 'Q1', answer: ['A'], submittedAt: '2026-03-01T10:00:00Z', source: 'backfill' },
  ], '测试补录');
  const after = e.statsFor('Q1', 'v1', ALL_GROUP);
  check('顶替 1 条', audit.superseded === 1, `got ${audit.superseded}`);
  check('忽略过期重复 1 条', audit.duplicatesIgnored === 1, `got ${audit.duplicatesIgnored}`);
  check('受影响桶仅 Q1|v1 的 G2 与 ALL', audit.affectedBuckets.length === 2 && audit.affectedBuckets.every((k) => k.startsWith('Q1|v1|')), audit.affectedBuckets.join(','));
  check('空答 1→0', before.blank === 1 && after.blank === 0, `before=${before.blank} after=${after.blank}`);
  check('正确 1→2', after.correct === 2, `got ${after.correct}`);
  check('溯源记录数与 valid 一致', e.recordsBehind('Q1', 'v1').length === after.valid);
}

console.log('示例数据：结构完整性');
{
  const { dataset, backfillBatch } = generateSampleData();
  const e = new ExamEngine(dataset);
  check('题目 12 道', e.questions.size === 12);
  check('版本 3 个', e.paperVersions.size === 3);
  check('考生 180 名（虚构）', e.candidates.size === 180);
  check('无效答题被检出', e.quality.invalid.length >= 8, `got ${e.quality.invalid.length}`);
  check('重复提交被检出', e.quality.duplicate.length >= 6, `got ${e.quality.duplicate.length}`);
  check('缺失记录被检出 15 条', e.quality.missing.filter((m) => m.reason.includes('无任何作答记录')).length === 15, `got ${e.quality.missing.filter((m) => m.reason.includes('无任何作答记录')).length}`);
  check('Q99 缺失题目被检出', e.quality.missing.filter((m) => m.questionId === 'Q99').length === 2);

  // Q08 在 v2 跨纠错规则：03-01 场次答 A 判错，03-08 场次答 A 判对
  const q08v2 = e.recordsBehind('Q08', 'v2');
  const early = q08v2.filter((r) => r.submittedAt < '2026-03-05T00:00:00Z' && r.answer[0] === 'A');
  const late = q08v2.filter((r) => r.submittedAt >= '2026-03-05T00:00:00Z' && r.answer[0] === 'A');
  check('Q08 两个场次都有答 A 的记录', early.length > 0 && late.length > 0, `early=${early.length} late=${late.length}`);
  const ruleEarly = e.resolveRule('Q08', 'v2', '2026-03-01T10:00:00Z');
  const ruleLate = e.resolveRule('Q08', 'v2', '2026-03-08T10:00:00Z');
  check('03-01 适用旧规则(答案C)', ruleEarly?.correct[0] === 'C');
  check('03-08 适用新规则(答案A)', ruleLate?.correct[0] === 'A');

  // Q05 跨版本选项不同
  const q05v1 = e.resolveRule('Q05', 'v1', '2026-03-01T10:00:00Z');
  const q05v2 = e.resolveRule('Q05', 'v2', '2026-03-01T10:00:00Z');
  check('Q05 v1 为 4 选项', q05v1?.options.length === 4);
  check('Q05 v2 为 5 选项', q05v2?.options.length === 5);

  // 补录后：缺失减少、统计变化、审计记录受影响桶
  const noRecord = () => e.quality.missing.filter((m) => m.reason.includes('无任何作答记录')).length;
  const missBefore = noRecord();
  const audit = e.applyBackfill(backfillBatch, '示例补录');
  const missAfter = noRecord();
  check('补录后缺失 15→5', missBefore === 15 && missAfter === 5, `before=${missBefore} after=${missAfter}`);
  check('补录顶替 3 条', audit.superseded === 3, `got ${audit.superseded}`);
  check('补录忽略过期重复 2 条', audit.duplicatesIgnored === 2, `got ${audit.duplicatesIgnored}`);
  check('受影响桶数量远小于总桶数（增量更新）', audit.affectedBuckets.length > 0 && audit.affectedBuckets.length <= 24, `affected=${audit.affectedBuckets.length}`);
  check('审计已记录', e.audits.length === 1 && e.audits[0].id === 'BF-001');
}

console.log(failures === 0 ? '\n全部通过' : `\n${failures} 项失败`);
process.exit(failures === 0 ? 0 : 1);
