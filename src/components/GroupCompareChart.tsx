import { useTooltip } from './Tooltip.tsx';

interface GroupDatum {
  group: string;
  rate: number | null; // 正确率
  valid: number;
}

/**
 * 群体差异：各考生群体正确率柱状图（单系列单 hue，柱顶标注，发线网格）。
 */
export function GroupCompareChart({ data }: { data: GroupDatum[] }) {
  const { show, hide, tooltip } = useTooltip();
  const width = 460;
  const height = 190;
  const padL = 36;
  const padB = 26;
  const padT = 18;
  const plotW = width - padL - 10;
  const plotH = height - padT - padB;
  const slot = plotW / Math.max(1, data.length);
  const barW = Math.min(24, slot * 0.4);
  const ticks = [0, 0.25, 0.5, 0.75, 1];

  return (
    <div>
      <svg width={width} height={height} role="img" aria-label="各考生群体正确率对比">
        {/* 网格线与轴刻度 */}
        {ticks.map((t) => {
          const y = padT + plotH * (1 - t);
          return (
            <g key={t}>
              <line x1={padL} x2={width - 10} y1={y} y2={y} stroke="var(--gridline)" strokeWidth={1} />
              <text x={padL - 6} y={y + 4} fontSize={10} fill="var(--text-muted)" textAnchor="end">
                {Math.round(t * 100)}
              </text>
            </g>
          );
        })}
        {/* 基线 */}
        <line x1={padL} x2={width - 10} y1={padT + plotH} y2={padT + plotH} stroke="var(--baseline)" strokeWidth={1} />
        {data.map((d, i) => {
          const cx = padL + slot * i + slot / 2;
          const h = d.rate === null ? 0 : d.rate * plotH;
          const y = padT + plotH - h;
          return (
            <g
              key={d.group}
              tabIndex={0}
              aria-label={`${d.group}：正确率 ${d.rate === null ? '无样本' : (d.rate * 100).toFixed(1) + '%'}，有效样本 ${d.valid}`}
              onPointerMove={(e) =>
                show(e, (
                  <div>
                    <div className="tip-title">{d.group}</div>
                    <div className="tip-row"><span className="muted">正确率</span><span className="tip-val">{d.rate === null ? '—' : `${(d.rate * 100).toFixed(1)}%`}</span></div>
                    <div className="tip-row"><span className="muted">有效样本</span><span className="tip-val">{d.valid}</span></div>
                  </div>
                ))
              }
              onPointerLeave={hide}
              onFocus={(e) => {
                const rect = (e.currentTarget as SVGGElement).getBoundingClientRect();
                show({ clientX: rect.left + rect.width / 2, clientY: rect.top }, (
                  <div>
                    <div className="tip-title">{d.group}</div>
                    <div className="tip-row"><span className="muted">正确率</span><span className="tip-val">{d.rate === null ? '—' : `${(d.rate * 100).toFixed(1)}%`}</span></div>
                    <div className="tip-row"><span className="muted">有效样本</span><span className="tip-val">{d.valid}</span></div>
                  </div>
                ));
              }}
              onBlur={hide}
              style={{ cursor: 'default', outline: 'none' }}
            >
              <rect x={padL + slot * i} y={padT} width={slot} height={plotH + padB} fill="transparent" />
              {d.rate !== null && (
                <>
                  <rect x={cx - barW / 2} y={y} width={barW} height={Math.max(h, 2)} rx={4} fill="var(--series-1)" />
                  {/* 方柱顶端为数据端：上圆角下方角 */}
                  <rect x={cx - barW / 2} y={y + 4} width={barW} height={Math.max(h - 4, 0)} fill="var(--series-1)" />
                  <text
                    x={cx}
                    y={y - 5}
                    fontSize={11}
                    textAnchor="middle"
                    fill="var(--text-primary)"
                    style={{ fontVariantNumeric: 'tabular-nums' }}
                  >
                    {(d.rate * 100).toFixed(1)}%
                  </text>
                </>
              )}
              {d.rate === null && (
                <text x={cx} y={padT + plotH - 6} fontSize={10} textAnchor="middle" fill="var(--text-muted)">无样本</text>
              )}
              <text x={cx} y={height - 8} fontSize={12} textAnchor="middle" fill="var(--text-secondary)">{d.group}</text>
            </g>
          );
        })}
      </svg>
      {tooltip}
    </div>
  );
}
