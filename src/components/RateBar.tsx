/** 内联正确率条（Meter）：轨道为网格线色，填充为主色 */
export function RateBar({ rate, width = 120 }: { rate: number | null; width?: number }) {
  if (rate === null) return <span className="muted small">无样本</span>;
  return (
    <span className="ratebar" role="img" aria-label={`正确率 ${(rate * 100).toFixed(1)}%`}>
      <span className="track" style={{ maxWidth: width }}>
        <span className="fill" style={{ width: `${(rate * 100).toFixed(1)}%`, display: 'block' }} />
      </span>
      <span className="val">{(rate * 100).toFixed(1)}%</span>
    </span>
  );
}
