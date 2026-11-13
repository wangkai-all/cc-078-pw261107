import { ExamEngine } from '../engine/stats.ts';
import { Filters } from './FilterBar.tsx';
import { useTooltip } from './Tooltip.tsx';

const RAMP = ['var(--seq-100)', 'var(--seq-200)', 'var(--seq-300)', 'var(--seq-400)', 'var(--seq-500)', 'var(--seq-600)', 'var(--seq-700)'];

function rampOf(rate: number): string {
  const idx = Math.min(RAMP.length - 1, Math.max(0, Math.round(rate * (RAMP.length - 1))));
  return RAMP[idx];
}

export function VersionCompare({
  engine,
  filters,
  onSelect,
}: {
  engine: ExamEngine;
  filters: Filters;
  onSelect: (questionId: string, version: string) => void;
}) {
  const { show, hide, tooltip } = useTooltip();
  const versions = [...engine.paperVersions.values()].filter(
    (v) => filters.versions.length === 0 || filters.versions.includes(v.id),
  );
  const questions = [...engine.questions.values()]
    .filter((q) => filters.knowledge === 'ALL' || q.knowledge === filters.knowledge)
    .sort((a, b) => a.id.localeCompare(b.id));

  // 规则变更检测：选项数跨版本不同，或任一版本内有多次修订
  const ruleChanges = questions
    .map((q) => {
      const notes: string[] = [];
      const optionCounts = new Set<number>();
      for (const v of engine.paperVersions.values()) {
        const pq = v.questions.find((x) => x.questionId === q.id);
        if (!pq) continue;
        for (const r of pq.rules) optionCounts.add(r.options.length);
        if (pq.rules.length > 1) {
          notes.push(
            `${v.name}：${pq.rules.map((r) => `${r.effectiveFrom.slice(0, 10)} 起答案 ${r.correct.join('')}`).join(' → ')}`,
          );
        }
      }
      if (optionCounts.size > 1) notes.push(`选项数量跨版本不同：${[...optionCounts].sort().join(' / ')} 个`);
      return { q, notes };
    })
    .filter((x) => x.notes.length > 0);

  return (
    <>
      <div className="card">
        <h3>
          正确率热力图：题目 × 试卷版本
          <small>口径：{filters.group === 'ALL' ? '全部群体' : filters.group} · 颜色越深正确率越高 · 点击单元格下钻</small>
        </h3>
        <div className="flex mb8" style={{ gap: 4, alignItems: 'center' }}>
          <span className="muted small">0%</span>
          {RAMP.map((c) => (
            <span key={c} style={{ width: 28, height: 10, background: c, borderRadius: 2, display: 'inline-block' }} />
          ))}
          <span className="muted small">100%</span>
        </div>
        <table className="heatmap" role="grid" aria-label="题目乘版本正确率热力图">
          <thead>
            <tr>
              <th className="row-head">题目</th>
              {versions.map((v) => (
                <th key={v.id}>{v.name.replace('2026 春季·', '')}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {questions.map((q) => (
              <tr key={q.id}>
                <th className="row-head">
                  <span className="mono">{q.id}</span> <span className="muted small">{q.knowledge}</span>
                </th>
                {versions.map((v) => {
                  const pq = v.questions.find((x) => x.questionId === q.id);
                  if (!pq) return <td key={v.id} className="cell empty" aria-label={`${q.id} 不在 ${v.name}`}>—</td>;
                  const s = engine.statsFor(q.id, v.id, filters.group);
                  if (s.valid === 0)
                    return (
                      <td key={v.id} className="cell empty">
                        无样本
                      </td>
                    );
                  const rate = s.correctRate!;
                  const bg = rampOf(rate);
                  const dark = RAMP.indexOf(bg) >= 3;
                  return (
                    <td
                      key={v.id}
                      className="cell"
                      tabIndex={0}
                      role="button"
                      aria-label={`${q.id} 在 ${v.name}：正确率 ${(rate * 100).toFixed(1)}%，有效样本 ${s.valid}，点击下钻`}
                      style={{ background: bg, color: dark ? '#ffffff' : '#0b0b0b' }}
                      onClick={() => onSelect(q.id, v.id)}
                      onKeyDown={(e) => e.key === 'Enter' && onSelect(q.id, v.id)}
                      onPointerMove={(e) =>
                        show(e, (
                          <div>
                            <div className="tip-title">{q.id} · {v.name}</div>
                            <div className="tip-row"><span className="muted">正确率</span><span className="tip-val">{(rate * 100).toFixed(1)}%</span></div>
                            <div className="tip-row"><span className="muted">有效样本</span><span className="tip-val">{s.valid}</span></div>
                            <div className="tip-row"><span className="muted">空答率</span><span className="tip-val">{s.blankRate === null ? '—' : `${(s.blankRate * 100).toFixed(1)}%`}</span></div>
                            <div className="tip-row"><span className="muted">卷内题号</span><span className="tip-val">第 {pq.position} 题</span></div>
                          </div>
                        ))
                      }
                      onPointerLeave={hide}
                      onBlur={hide}
                    >
                      {(rate * 100).toFixed(0)}%
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
        {tooltip}

        {/* 表格孪生视图（可访问性） */}
        <details className="mt16">
          <summary className="small" style={{ cursor: 'pointer', color: 'var(--text-secondary)' }}>表格视图（相同数据）</summary>
          <table className="data mt8">
            <thead>
              <tr>
                <th>题目</th>
                {versions.map((v) => (
                  <th key={v.id} className="num">{v.name.replace('2026 春季·', '')} 正确率</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {questions.map((q) => (
                <tr key={q.id} className="no-click">
                  <td className="mono">{q.id}</td>
                  {versions.map((v) => {
                    const pq = v.questions.find((x) => x.questionId === q.id);
                    if (!pq) return <td key={v.id} className="num muted">—</td>;
                    const s = engine.statsFor(q.id, v.id, filters.group);
                    return (
                      <td key={v.id} className="num">
                        {s.correctRate === null ? '无样本' : `${(s.correctRate * 100).toFixed(1)}%（n=${s.valid}）`}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </details>
      </div>

      <div className="card">
        <h3>跨版本规则变更 <small>这些题目的统计已按各版本当时规则分别计算</small></h3>
        {ruleChanges.length === 0 && <span className="muted small">没有检测到规则变更</span>}
        {ruleChanges.map(({ q, notes }) => (
          <div key={q.id} className="flex mb8" style={{ alignItems: 'flex-start' }}>
            <button className="chip" onClick={() => onSelect(q.id, '*')}>{q.id}</button>
            <div className="small">
              {notes.map((n, i) => (
                <div key={i} className="muted">{n}</div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </>
  );
}
