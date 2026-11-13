import { useEffect, useMemo, useState } from 'react';
import { ExamEngine, ALL_GROUP } from '../engine/stats.ts';
import { downloadCsv, exportRecordsCsv } from '../engine/importExport.ts';
import type { Response } from '../engine/types.ts';
import { Filters } from './FilterBar.tsx';
import { OptionDistChart } from './OptionDistChart.tsx';
import { GroupCompareChart } from './GroupCompareChart.tsx';
import { issueCounts } from './QuestionTable.tsx';

function verdictOf(engine: ExamEngine, r: Response): { text: string; cls: string } {
  const rule = engine.resolveRule(r.questionId, r.paperVersion, r.submittedAt);
  if (!rule) return { text: '无效', cls: 'crit' };
  const bad = r.answer.some((a) => !rule.options.includes(a)) || r.answer.length > 1;
  if (bad) return { text: '无效', cls: 'crit' };
  if (r.answer.length === 0) return { text: '空答', cls: 'warn' };
  const ok = r.answer.length === rule.correct.length && rule.correct.every((c) => r.answer.includes(c));
  return ok ? { text: '正确', cls: 'ok' } : { text: '错误', cls: '' };
}

export function QuestionDrawer({
  engine,
  questionId,
  initialVersion,
  filters,
  onClose,
}: {
  engine: ExamEngine;
  questionId: string;
  initialVersion: string | '*';
  filters: Filters;
  onClose: () => void;
}) {
  const q = engine.questions.get(questionId);
  const placements = engine.placements(questionId);
  const [scope, setScope] = useState<string>(initialVersion);
  const [showAllRecords, setShowAllRecords] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const scopeIds = useMemo(
    () => (scope === '*' ? placements.map((p) => p.paperVersion) : [scope]),
    [scope, placements],
  );

  const stats = engine.statsAcross(questionId, scopeIds, filters.group);
  const issues = issueCounts(engine, questionId, scope === '*' ? [] : scopeIds);

  // 选项分布：聚合该范围内的选项计数；正确性标注取该范围内出现过的所有正确选项
  const optionData = useMemo(() => {
    const counts = stats.optionCounts;
    const keys = new Set<string>(Object.keys(counts));
    const labels = new Map<string, string>();
    const correctKeys = new Set<string>();
    for (const vid of scopeIds) {
      const pq = engine.paperQuestion(questionId, vid);
      for (const rule of pq?.rules ?? []) {
        for (const k of rule.options) keys.add(k);
        for (const [k, v] of Object.entries(rule.optionLabels)) labels.set(k, v);
        for (const c of rule.correct) correctKeys.add(c);
      }
    }
    const sorted = [...keys].sort();
    const multiRule = correctKeys.size > 1;
    return {
      rows: sorted.map((k) => ({
        key: k,
        label: labels.get(k) ?? '',
        count: counts[k] ?? 0,
        isCorrect: !multiRule && correctKeys.has(k),
      })),
      multiRule,
      correctKeys: [...correctKeys].sort(),
    };
  }, [engine, questionId, scopeIds, stats]);

  const groupData = engine
    .groupComparison(questionId, scope === '*' ? '*' : scope)
    .map(({ group, stats: gs }) => ({ group, rate: gs.correctRate, valid: gs.valid }));

  const records = useMemo(
    () => engine.recordsAcross(questionId, scopeIds, filters.group),
    [engine, questionId, scopeIds, filters.group],
  );
  const shownRecords = showAllRecords ? records : records.slice(0, 100);

  const qIssues = {
    invalid: engine.quality.invalid.filter((i) => i.questionId === questionId && scopeIds.includes(i.paperVersion)),
    missing: engine.quality.missing.filter((m) => m.questionId === questionId && scopeIds.includes(m.paperVersion)),
    duplicate: engine.quality.duplicate.filter((d) => d.questionId === questionId && scopeIds.includes(d.paperVersion)),
  };

  if (!q) return null;

  return (
    <>
      <div className="drawer-mask" onClick={onClose} />
      <aside className="drawer" role="dialog" aria-label={`题目 ${questionId} 详情`}>
        <div className="drawer-head">
          <h2>
            <span className="mono">{q.id}</span> · {q.title}
          </h2>
          <button className="drawer-close" onClick={onClose} aria-label="关闭">✕</button>
        </div>
        <div className="drawer-sub">
          知识点：{q.knowledge} · 口径：{filters.group === ALL_GROUP ? '全部群体' : filters.group}
        </div>

        <div className="kpi-row mb16">
          <div className="kpi"><div className="label">有效样本</div><div className="value">{stats.valid}</div></div>
          <div className="kpi">
            <div className="label">正确率</div>
            <div className="value">{stats.correctRate === null ? '—' : `${(stats.correctRate * 100).toFixed(1)}%`}</div>
            <div className="sub">答对 {stats.correct} / 有效 {stats.valid}</div>
          </div>
          <div className="kpi">
            <div className="label">空答率</div>
            <div className="value">{stats.blankRate === null ? '—' : `${(stats.blankRate * 100).toFixed(1)}%`}</div>
            <div className="sub">空答 {stats.blank} 条</div>
          </div>
          <div className="kpi">
            <div className="label">质量提示</div>
            <div className="value">{issues.invalid + issues.missing + issues.duplicate}</div>
            <div className="sub">无效 {issues.invalid} · 缺失 {issues.missing} · 重复 {issues.duplicate}</div>
          </div>
        </div>

        {/* 版本范围 */}
        <div className="flex mb16" style={{ flexWrap: 'wrap' }}>
          <span className="filter-label">统计范围</span>
          <button className={`chip ${scope === '*' ? 'on' : ''}`} onClick={() => setScope('*')}>全部版本</button>
          {placements.map((p) => (
            <button key={p.paperVersion} className={`chip ${scope === p.paperVersion ? 'on' : ''}`} onClick={() => setScope(p.paperVersion)}>
              {p.versionName.replace('2026 春季·', '')}（第 {p.position} 题）
            </button>
          ))}
        </div>

        {/* 在各试卷中的位置与规则修订 */}
        <div className="card">
          <h3>题目位置与评分规则 <small>按答题时间匹配当时生效的规则</small></h3>
          <table className="data">
            <thead>
              <tr><th>试卷版本</th><th className="num">题号</th><th>规则修订</th></tr>
            </thead>
            <tbody>
              {placements.map((p) => {
                const pq = engine.paperQuestion(questionId, p.paperVersion)!;
                return (
                  <tr key={p.paperVersion} className="no-click">
                    <td>{p.versionName}</td>
                    <td className="num">第 {p.position} 题</td>
                    <td>
                      {pq.rules.map((r, i) => (
                        <div key={i} className="small" style={{ marginBottom: 2 }}>
                          <span className="mono muted">{r.effectiveFrom.slice(0, 10)}</span> 起：
                          {r.options.length} 选项，答案 {r.correct.join('')}，{r.score} 分
                          {r.note && <span className="badge warn" style={{ marginLeft: 6 }}><span className="dot" />{r.note}</span>}
                        </div>
                      ))}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* 选项分布 */}
        <div className="card">
          <h3>
            选项分布
            <small>{scope === '*' ? '跨版本聚合' : placements.find((p) => p.paperVersion === scope)?.versionName}</small>
          </h3>
          {optionData.multiRule && (
            <div className="notice" style={{ marginBottom: 8 }}>
              该范围内评分规则发生过修订（历史正确选项：{optionData.correctKeys.join('、')}），统计已按答题时的规则分别判定，故不单一标注正确项。
            </div>
          )}
          {optionData.rows.length > 0 ? (
            <OptionDistChart data={optionData.rows} total={Object.values(stats.optionCounts).reduce((a, b) => a + b, 0)} />
          ) : (
            <span className="muted small">该范围内无作答</span>
          )}
        </div>

        {/* 群体差异 */}
        <div className="card">
          <h3>考生群体差异 <small>各群体正确率（同一统计范围）</small></h3>
          <GroupCompareChart data={groupData} />
        </div>

        {/* 该题质量提示 */}
        {(qIssues.invalid.length > 0 || qIssues.missing.length > 0 || qIssues.duplicate.length > 0) && (
          <div className="card">
            <h3>该题的数据质量提示 <small>无效 / 缺失 / 重复 分开列出，缺项不计为答错</small></h3>
            {qIssues.invalid.length > 0 && (
              <>
                <div className="section-title">无效答题（{qIssues.invalid.length}）</div>
                <div className="quality-list mb8">
                  <table>
                    <thead><tr><th>记录</th><th>考生</th><th>作答</th><th>原因</th></tr></thead>
                    <tbody>
                      {qIssues.invalid.map((i) => (
                        <tr key={i.responseId}>
                          <td className="mono">{i.responseId}</td>
                          <td className="mono">{i.candidateId}</td>
                          <td className="mono">{i.answer.join('|') || '(空)'}</td>
                          <td className="muted">{i.reason}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            )}
            {qIssues.missing.length > 0 && (
              <>
                <div className="section-title">缺失记录（{qIssues.missing.length}）——不计为答错</div>
                <div className="quality-list mb8">
                  <table>
                    <thead><tr><th>考生</th><th>版本</th><th>说明</th></tr></thead>
                    <tbody>
                      {qIssues.missing.map((m, i) => (
                        <tr key={i}>
                          <td className="mono">{m.candidateId ?? '—'}</td>
                          <td>{engine.paperVersions.get(m.paperVersion)?.name ?? m.paperVersion}</td>
                          <td className="muted">{m.reason}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            )}
            {qIssues.duplicate.length > 0 && (
              <>
                <div className="section-title">重复提交（{qIssues.duplicate.length}）——已取最新一条计入统计</div>
                <div className="quality-list">
                  <table>
                    <thead><tr><th>考生</th><th>保留记录</th><th>忽略记录</th></tr></thead>
                    <tbody>
                      {qIssues.duplicate.map((d, i) => (
                        <tr key={i}>
                          <td className="mono">{d.candidateId}</td>
                          <td className="mono">{d.keptResponseId}</td>
                          <td className="mono muted">{d.droppedResponseId}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </div>
        )}

        {/* 原始答题记录（溯源） */}
        <div className="card">
          <h3>
            原始答题记录
            <small>当前统计口径背后的全部 {records.length} 条样本</small>
          </h3>
          <div className="flex mb8">
            <button
              className="btn small"
              onClick={() => downloadCsv(`${questionId}_答题记录_${scope === '*' ? '全部版本' : scope}.csv`, exportRecordsCsv(engine, records))}
            >
              导出这些记录（CSV）
            </button>
            <span className="muted small">筛选条件可回溯：此处即当前口径的原始样本</span>
          </div>
          <div className="quality-list" style={{ maxHeight: 320 }}>
            <table>
              <thead>
                <tr><th>记录</th><th>考生(虚构)</th><th>群体</th><th>版本</th><th>作答</th><th>判定</th><th>提交时间</th><th>来源</th></tr>
              </thead>
              <tbody>
                {shownRecords.map((r) => {
                  const v = verdictOf(engine, r);
                  const cand = engine.candidates.get(r.candidateId);
                  return (
                    <tr key={r.id}>
                      <td className="mono">{r.id}</td>
                      <td className="mono">{r.candidateId}</td>
                      <td>{cand?.group ?? '未分组'}</td>
                      <td>{engine.paperVersions.get(r.paperVersion)?.name.replace('2026 春季·', '') ?? r.paperVersion}</td>
                      <td className="mono">{r.answer.join('|') || '(空)'}</td>
                      <td><span className={`badge ${v.cls}`}><span className="dot" />{v.text}</span></td>
                      <td className="mono muted">{r.submittedAt.slice(0, 16).replace('T', ' ')}</td>
                      <td>{r.source === 'backfill' ? '补录' : '原始'}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {records.length > 100 && !showAllRecords && (
            <button className="btn small mt8" onClick={() => setShowAllRecords(true)}>
              显示全部 {records.length} 条
            </button>
          )}
        </div>
      </aside>
    </>
  );
}
