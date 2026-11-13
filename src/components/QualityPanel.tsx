import { useRef, useState } from 'react';
import { ExamEngine } from '../engine/stats.ts';
import { parseResponsesCsv } from '../engine/importExport.ts';
import type { Response } from '../engine/types.ts';

export function QualityPanel({
  engine,
  pendingBackfill,
  onApplyBackfill,
  onImportBackfill,
}: {
  engine: ExamEngine;
  pendingBackfill: Response[];
  onApplyBackfill: (records: Response[], note: string) => void;
  onImportBackfill: (records: Response[]) => void;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [importMsg, setImportMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const q = engine.quality;

  const handleFile = async (file: File) => {
    const text = await file.text();
    const result = parseResponsesCsv(text, 'backfill');
    if (!result.ok || !result.responses) {
      setImportMsg({ ok: false, text: `导入失败：\n${result.errors.join('\n')}` });
      return;
    }
    onImportBackfill(result.responses);
    setImportMsg({ ok: true, text: `已补录 ${result.responses.length} 条记录（增量更新完成）` });
  };

  return (
    <>
      <div className="quality-grid">
        <div className="quality-card">
          <h4><span className="badge crit"><span className="dot" />无效答题</span><span className="count">{q.invalid.length}</span></h4>
          <div className="desc">选项超出当时版本有效范围、单选多选等。不计入正确率分母，单独列出。</div>
          <div className="quality-list">
            <table>
              <thead><tr><th>记录</th><th>考生</th><th>题目</th><th>作答</th><th>原因</th></tr></thead>
              <tbody>
                {q.invalid.map((i) => (
                  <tr key={i.responseId}>
                    <td className="mono">{i.responseId}</td>
                    <td className="mono">{i.candidateId}</td>
                    <td className="mono">{i.questionId}</td>
                    <td className="mono">{i.answer.join('|')}</td>
                    <td className="muted">{i.reason}</td>
                  </tr>
                ))}
                {q.invalid.length === 0 && <tr><td colSpan={5} className="muted">无</td></tr>}
              </tbody>
            </table>
          </div>
        </div>

        <div className="quality-card">
          <h4><span className="badge warn"><span className="dot" />缺失题目</span><span className="count">{q.missing.length}</span></h4>
          <div className="desc">试卷要求作答但无任何记录，或记录引用了不存在的题目。缺项不计为答错。</div>
          <div className="quality-list">
            <table>
              <thead><tr><th>考生</th><th>题目</th><th>版本</th><th>说明</th></tr></thead>
              <tbody>
                {q.missing.map((m, i) => (
                  <tr key={i}>
                    <td className="mono">{m.candidateId ?? '—'}</td>
                    <td className="mono">{m.questionId}</td>
                    <td>{engine.paperVersions.get(m.paperVersion)?.name.replace('2026 春季·', '') ?? m.paperVersion}</td>
                    <td className="muted">{m.reason}</td>
                  </tr>
                ))}
                {q.missing.length === 0 && <tr><td colSpan={4} className="muted">无</td></tr>}
              </tbody>
            </table>
          </div>
        </div>

        <div className="quality-card">
          <h4><span className="badge info"><span className="dot" />重复提交</span><span className="count">{q.duplicate.length}</span></h4>
          <div className="desc">同一考生同一题同一版本多条记录，统计取提交时间最新者，其余单独列出。</div>
          <div className="quality-list">
            <table>
              <thead><tr><th>考生</th><th>题目</th><th>保留</th><th>忽略</th></tr></thead>
              <tbody>
                {q.duplicate.map((d, i) => (
                  <tr key={i}>
                    <td className="mono">{d.candidateId}</td>
                    <td className="mono">{d.questionId}</td>
                    <td className="mono">{d.keptResponseId}</td>
                    <td className="mono muted">{d.droppedResponseId}</td>
                  </tr>
                ))}
                {q.duplicate.length === 0 && <tr><td colSpan={4} className="muted">无</td></tr>}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <div className="card mt16">
        <h3>成绩补录 <small>增量更新：只重算受影响的统计桶，并留下审计记录</small></h3>
        <div className="flex mb8" style={{ flexWrap: 'wrap' }}>
          <button className="btn primary" disabled={pendingBackfill.length === 0} onClick={() => onApplyBackfill(pendingBackfill, '示例补录批次')}>
            应用示例补录批次（{pendingBackfill.length} 条）
          </button>
          <button className="btn" onClick={() => fileRef.current?.click()}>从 CSV 补录…</button>
          <input
            ref={fileRef}
            type="file"
            accept=".csv"
            style={{ display: 'none' }}
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) handleFile(f);
              e.target.value = '';
            }}
          />
          <span className="muted small">CSV 列：candidateId,paperVersion,questionId,answer,submittedAt</span>
        </div>
        {importMsg && <div className={importMsg.ok ? 'io-ok' : 'io-errors'}>{importMsg.text}</div>}
        {pendingBackfill.length > 0 && (
          <div className="notice">
            待应用批次包含：填补缺失 10 条、更正已有记录 3 条（顶替）、过期重复 2 条（将被忽略）。应用后仅受影响题目的统计会更新。
          </div>
        )}

        <div className="section-title">补录审计日志（{engine.audits.length}）</div>
        {engine.audits.length === 0 && <span className="muted small">尚未发生补录</span>}
        {engine.audits.map((a) => (
          <div key={a.id} className="audit-item">
            <div>
              <strong>{a.id}</strong> · {a.note} · {a.appliedAt.slice(0, 19).replace('T', ' ')} · 共 {a.responseCount} 条
              （顶替 {a.superseded} 条，忽略过期重复 {a.duplicatesIgnored} 条）
            </div>
            <div className="buckets">
              仅更新 {a.affectedBuckets.length} 个统计桶：{a.affectedBuckets.join('、')}
            </div>
          </div>
        ))}
      </div>
    </>
  );
}
