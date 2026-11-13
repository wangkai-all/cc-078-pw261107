import { ExamEngine, ALL_GROUP } from '../engine/stats.ts';

export interface Filters {
  versions: string[]; // 空数组 = 全部版本
  group: string; // ALL_GROUP 或具体群体
  knowledge: string; // 'ALL' 或知识点
  maxRate: number; // 正确率上限（0..1）
  onlyIssues: boolean; // 仅看有质量问题的题
}

export function FilterBar({
  engine,
  filters,
  onChange,
}: {
  engine: ExamEngine;
  filters: Filters;
  onChange: (f: Filters) => void;
}) {
  const versions = [...engine.paperVersions.values()];
  const groups = engine.allGroups();
  const knowledges = engine.allKnowledge();

  const toggleVersion = (vid: string) => {
    const has = filters.versions.includes(vid);
    const next = has ? filters.versions.filter((v) => v !== vid) : [...filters.versions, vid];
    onChange({ ...filters, versions: next });
  };

  return (
    <div className="filter-bar">
      <div className="filter-group">
        <span className="filter-label">试卷版本</span>
        {versions.map((v) => (
          <button
            key={v.id}
            className={`chip ${filters.versions.length === 0 || filters.versions.includes(v.id) ? 'on' : ''}`}
            onClick={() => toggleVersion(v.id)}
            title={filters.versions.length === 0 ? '当前为全部版本；点击可单选' : undefined}
          >
            {v.name.replace('2026 春季·', '')}
          </button>
        ))}
        {filters.versions.length > 0 && (
          <button className="chip" onClick={() => onChange({ ...filters, versions: [] })}>全部</button>
        )}
      </div>

      <div className="filter-group">
        <span className="filter-label">考生群体</span>
        <select value={filters.group} onChange={(e) => onChange({ ...filters, group: e.target.value })}>
          <option value={ALL_GROUP}>全部群体</option>
          {groups.map((g) => (
            <option key={g} value={g}>{g}</option>
          ))}
        </select>
      </div>

      <div className="filter-group">
        <span className="filter-label">知识点</span>
        <select value={filters.knowledge} onChange={(e) => onChange({ ...filters, knowledge: e.target.value })}>
          <option value="ALL">全部知识点</option>
          {knowledges.map((k) => (
            <option key={k} value={k}>{k}</option>
          ))}
        </select>
      </div>

      <div className="filter-group">
        <span className="filter-label">正确率 ≤</span>
        <select value={filters.maxRate} onChange={(e) => onChange({ ...filters, maxRate: Number(e.target.value) })}>
          <option value={1}>不限</option>
          <option value={0.4}>40%</option>
          <option value={0.5}>50%</option>
          <option value={0.6}>60%</option>
          <option value={0.7}>70%</option>
        </select>
      </div>

      <div className="filter-group">
        <button
          className={`chip ${filters.onlyIssues ? 'on' : ''}`}
          onClick={() => onChange({ ...filters, onlyIssues: !filters.onlyIssues })}
        >
          仅看有质量提示的题
        </button>
      </div>
    </div>
  );
}
