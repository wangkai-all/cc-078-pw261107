import { useMemo, useRef, useState } from 'react';
import { ExamEngine, ALL_GROUP } from './engine/stats.ts';
import { generateSampleData } from './engine/sampleData.ts';
import type { Response } from './engine/types.ts';
import { FilterBar, Filters } from './components/FilterBar.tsx';
import { QuestionTable } from './components/QuestionTable.tsx';
import { QuestionDrawer } from './components/QuestionDrawer.tsx';
import { VersionCompare } from './components/VersionCompare.tsx';
import { QualityPanel } from './components/QualityPanel.tsx';
import { ImportExport } from './components/ImportExport.tsx';

export interface Selected {
  questionId: string;
  version: string | '*';
}

type Tab = 'questions' | 'versions' | 'quality' | 'io';

export default function App() {
  // 示例数据只生成一次（确定性种子）；引擎实例稳定持有，dataVersion 递增触发重渲染
  const [sample] = useState(() => generateSampleData());
  const engineRef = useRef<ExamEngine | null>(null);
  if (!engineRef.current) {
    engineRef.current = new ExamEngine(sample.dataset);
  }
  const engine = engineRef.current;

  const [dataVersion, setDataVersion] = useState(0);
  const [tab, setTab] = useState<Tab>('questions');
  const [selected, setSelected] = useState<Selected | null>(null);
  const [theme, setTheme] = useState<'light' | 'dark' | ''>('');
  const [pendingBackfill, setPendingBackfill] = useState<Response[]>(sample.backfillBatch);
  const [filters, setFilters] = useState<Filters>({
    versions: [],
    group: ALL_GROUP,
    knowledge: 'ALL',
    maxRate: 1,
    onlyIssues: false,
  });

  const bump = () => setDataVersion((v) => v + 1);
  void dataVersion; // 仅作为重渲染信号

  const stats = useMemo(
    () => ({
      candidates: engine.candidates.size,
      responses: engine.responses.size,
      questions: engine.questions.size,
      issues: engine.quality.invalid.length + engine.quality.missing.length + engine.quality.duplicate.length,
    }),
    [engine, dataVersion],
  );

  const toggleTheme = () => {
    const next = theme === 'dark' ? 'light' : 'dark';
    setTheme(next);
    document.documentElement.dataset.theme = next;
  };

  return (
    <>
      <header className="app-header">
        <div className="app-title">
          考试数据分析台
          <span className="privacy-tag">全部数据为虚构</span>
        </div>
        <nav className="tabs">
          {(
            [
              ['questions', '题目分析'],
              ['versions', '版本比较'],
              ['quality', '数据质量与补录'],
              ['io', '数据与导出'],
            ] as [Tab, string][]
          ).map(([key, label]) => (
            <button key={key} className={`tab ${tab === key ? 'active' : ''}`} onClick={() => setTab(key)}>
              {label}
            </button>
          ))}
        </nav>
        <span className="header-meta">
          {stats.candidates} 名考生（虚构）· {stats.responses} 条记录 · {stats.questions} 题 · {stats.issues} 条质量提示
        </span>
        <button className="theme-toggle" onClick={toggleTheme}>{theme === 'dark' ? '浅色' : '深色'}</button>
      </header>

      <main className="main">
        <div className="notice">
          统计按<strong>答题时生效的试卷版本与评分规则</strong>计算；无效答题、缺失题目、重复提交单独提示，缺项不计为答错。
          点击任意题目可下钻到原始答题记录。
        </div>

        {tab !== 'io' && <FilterBar engine={engine} filters={filters} onChange={setFilters} />}

        {tab === 'questions' && (
          <QuestionTable engine={engine} filters={filters} onSelect={(questionId) => setSelected({ questionId, version: '*' })} />
        )}
        {tab === 'versions' && (
          <VersionCompare engine={engine} filters={filters} onSelect={(questionId, version) => setSelected({ questionId, version })} />
        )}
        {tab === 'quality' && (
          <QualityPanel
            engine={engine}
            pendingBackfill={pendingBackfill}
            onApplyBackfill={(records, note) => {
              engine.applyBackfill(records, note);
              setPendingBackfill([]);
              bump();
            }}
            onImportBackfill={(records) => {
              engine.applyBackfill(records, '文件补录');
              bump();
            }}
          />
        )}
        {tab === 'io' && (
          <ImportExport
            engine={engine}
            filters={filters}
            onLoadDataset={() => {
              setPendingBackfill([]);
              bump();
            }}
            onLoadSample={() => {
              const sample = generateSampleData();
              engine.loadDataset(sample.dataset);
              setPendingBackfill(sample.backfillBatch);
              bump();
            }}
          />
        )}
      </main>

      {selected && (
        <QuestionDrawer
          engine={engine}
          questionId={selected.questionId}
          initialVersion={selected.version}
          filters={filters}
          onClose={() => setSelected(null)}
        />
      )}
    </>
  );
}
