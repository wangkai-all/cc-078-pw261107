import { useRef, useState } from 'react';
import { ExamEngine } from '../engine/stats.ts';
import {
  downloadCsv,
  exportRecordsCsv,
  exportReviewCsv,
  parseDatasetJson,
  parseResponsesCsv,
} from '../engine/importExport.ts';
import { Filters } from './FilterBar.tsx';

export function ImportExport({
  engine,
  filters,
  onLoadDataset,
  onLoadSample,
}: {
  engine: ExamEngine;
  filters: Filters;
  onLoadDataset: () => void;
  onLoadSample: () => void;
}) {
  const datasetRef = useRef<HTMLInputElement>(null);
  const responsesRef = useRef<HTMLInputElement>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const importDataset = async (file: File) => {
    const text = await file.text();
    const result = parseDatasetJson(text);
    if (!result.ok || !result.dataset) {
      setMsg({ ok: false, text: `数据集导入失败：\n${result.errors.join('\n')}` });
      return;
    }
    // 完整数据集 JSON 可同时包含 responses
    const raw = JSON.parse(text) as { responses?: unknown[] };
    engine.loadDataset({
      questions: result.dataset.questions!,
      paperVersions: result.dataset.paperVersions!,
      candidates: result.dataset.candidates!,
      responses: (raw.responses ?? []) as never[],
    });
    setMsg({ ok: true, text: `数据集已导入：${result.dataset.questions!.length} 题 / ${result.dataset.paperVersions!.length} 个版本 / ${result.dataset.candidates!.length} 名考生（须为虚构编号）` });
    onLoadDataset();
  };

  const importResponses = async (file: File) => {
    const text = await file.text();
    const result = parseResponsesCsv(text, 'initial');
    if (!result.ok || !result.responses) {
      setMsg({ ok: false, text: `答题记录导入失败：\n${result.errors.join('\n')}` });
      return;
    }
    engine.loadDataset({
      questions: [...engine.questions.values()],
      paperVersions: [...engine.paperVersions.values()],
      candidates: [...engine.candidates.values()],
      responses: result.responses,
    });
    setMsg({ ok: true, text: `已替换答题记录：${result.responses.length} 条` });
    onLoadDataset();
  };

  const exportReview = () => {
    const csv = exportReviewCsv(engine, {
      versions: filters.versions,
      knowledge: filters.knowledge === 'ALL' ? undefined : filters.knowledge,
    });
    downloadCsv('审阅表.csv', csv);
  };

  const exportRaw = () => {
    const versionIds = filters.versions.length > 0 ? filters.versions : [...engine.paperVersions.keys()];
    const seen = new Set<string>();
    const records = [];
    for (const q of engine.questions.values()) {
      if (filters.knowledge !== 'ALL' && q.knowledge !== filters.knowledge) continue;
      for (const r of engine.recordsAcross(q.id, versionIds, filters.group)) {
        if (seen.has(r.id)) continue;
        seen.add(r.id);
        records.push(r);
      }
    }
    downloadCsv('原始样本_当前筛选.csv', exportRecordsCsv(engine, records));
  };

  return (
    <div className="io-grid">
      <div className="io-box">
        <h4>虚构示例数据</h4>
        <p>一键载入 180 名虚构考生 × 3 个试卷版本 × 12 道题，含规则修订、补录与质量边界案例。</p>
        <button className="btn primary" onClick={onLoadSample}>重新载入示例数据</button>
      </div>

      <div className="io-box">
        <h4>导入完整数据集（JSON）</h4>
        <p>包含 questions / paperVersions / candidates / responses 四个数组。考生须使用匿名编号，请勿包含真实身份信息。</p>
        <button className="btn" onClick={() => datasetRef.current?.click()}>选择 JSON 文件…</button>
        <input
          ref={datasetRef}
          type="file"
          accept=".json"
          style={{ display: 'none' }}
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) importDataset(f);
            e.target.value = '';
          }}
        />
      </div>

      <div className="io-box">
        <h4>替换答题记录（CSV）</h4>
        <p>列：candidateId,paperVersion,questionId,answer,submittedAt。answer 为空表示空答；多选用 | 分隔。</p>
        <button className="btn" onClick={() => responsesRef.current?.click()}>选择 CSV 文件…</button>
        <input
          ref={responsesRef}
          type="file"
          accept=".csv"
          style={{ display: 'none' }}
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) importResponses(f);
            e.target.value = '';
          }}
        />
      </div>

      <div className="io-box">
        <h4>导出审阅表（CSV）</h4>
        <p>按当前筛选（版本 / 知识点）导出：每题每版本的正确率、空答率、选项分布、群体差异与质量计数。</p>
        <button className="btn" onClick={exportReview}>导出审阅表</button>
      </div>

      <div className="io-box">
        <h4>导出原始样本（CSV）</h4>
        <p>导出当前筛选条件（版本 / 群体 / 知识点）背后的全部原始答题记录，用于复核统计口径。</p>
        <button className="btn" onClick={exportRaw}>导出原始样本</button>
      </div>

      {msg && <div className={msg.ok ? 'io-ok' : 'io-errors'} style={{ gridColumn: '1 / -1' }}>{msg.text}</div>}
    </div>
  );
}
