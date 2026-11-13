import { ExamEngine } from '../engine/stats.ts';
import { Filters } from './FilterBar.tsx';
import { RateBar } from './RateBar.tsx';

/** 某题在指定版本集合下的质量计数 */
export function issueCounts(engine: ExamEngine, questionId: string, versionIds: string[]) {
  const inScope = (vid: string) => versionIds.length === 0 || versionIds.includes(vid);
  return {
    invalid: engine.quality.invalid.filter((i) => i.questionId === questionId && inScope(i.paperVersion)).length,
    missing: engine.quality.missing.filter((m) => m.questionId === questionId && inScope(m.paperVersion)).length,
    duplicate: engine.quality.duplicate.filter((d) => d.questionId === questionId && inScope(d.paperVersion)).length,
  };
}

export function QuestionTable({
  engine,
  filters,
  onSelect,
}: {
  engine: ExamEngine;
  filters: Filters;
  onSelect: (questionId: string) => void;
}) {
  const versionIds = filters.versions.length > 0 ? filters.versions : [...engine.paperVersions.keys()];

  const rows = [...engine.questions.values()]
    .filter((q) => filters.knowledge === 'ALL' || q.knowledge === filters.knowledge)
    .map((q) => {
      const s = engine.statsAcross(q.id, versionIds, filters.group);
      const issues = issueCounts(engine, q.id, filters.versions);
      const placements = engine.placements(q.id).filter((p) => versionIds.includes(p.paperVersion));
      return { q, s, issues, placements };
    })
    .filter((r) => r.placements.length > 0)
    .filter((r) => r.s.correctRate === null || r.s.correctRate <= filters.maxRate)
    .filter((r) => !filters.onlyIssues || r.issues.invalid + r.issues.missing + r.issues.duplicate > 0)
    .sort((a, b) => a.q.id.localeCompare(b.q.id));

  return (
    <div className="card">
      <h3>
        题目正确率一览
        <small>
          {rows.length} 题 · 口径：{filters.versions.length > 0 ? `${filters.versions.length} 个版本` : '全部版本'} ×{' '}
          {filters.group === 'ALL' ? '全部群体' : filters.group} · 点击行下钻到原始记录
        </small>
      </h3>
      <table className="data">
        <thead>
          <tr>
            <th>题目</th>
            <th>题干摘要</th>
            <th>知识点</th>
            <th className="num">有效样本</th>
            <th>正确率</th>
            <th className="num">空答率</th>
            <th>质量提示</th>
            <th>出现于</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(({ q, s, issues, placements }) => (
            <tr key={q.id} onClick={() => onSelect(q.id)}>
              <td className="mono">{q.id}</td>
              <td>{q.title}</td>
              <td className="muted">{q.knowledge}</td>
              <td className="num">{s.valid}</td>
              <td>
                <RateBar rate={s.correctRate} />
              </td>
              <td className="num">{s.blankRate === null ? '—' : `${(s.blankRate * 100).toFixed(1)}%`}</td>
              <td>
                <span className="flex" style={{ gap: 4 }}>
                  {issues.invalid > 0 && <span className="badge crit"><span className="dot" />无效 {issues.invalid}</span>}
                  {issues.missing > 0 && <span className="badge warn"><span className="dot" />缺失 {issues.missing}</span>}
                  {issues.duplicate > 0 && <span className="badge info"><span className="dot" />重复 {issues.duplicate}</span>}
                  {issues.invalid + issues.missing + issues.duplicate === 0 && <span className="badge ok"><span className="dot" />正常</span>}
                </span>
              </td>
              <td className="muted small">
                {placements.map((p) => `${p.versionName.replace('2026 春季·', '')}#${p.position}`).join(' · ')}
              </td>
            </tr>
          ))}
          {rows.length === 0 && (
            <tr className="no-click">
              <td colSpan={8} className="muted" style={{ textAlign: 'center', padding: 24 }}>
                当前筛选条件下没有题目
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
