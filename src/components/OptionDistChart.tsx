import { useTooltip } from './Tooltip.tsx';

interface OptionDatum {
  key: string;
  label: string;
  count: number;
  isCorrect: boolean;
}

/**
 * 选项分布：横向条形，正确选项用主色强调、干扰项用弱化灰（emphasis 形式）。
 * 条端直接标注数值；整行都是悬停/聚焦热区。
 */
export function OptionDistChart({ data, total }: { data: OptionDatum[]; total: number }) {
  const { show, hide, tooltip } = useTooltip();
  const max = Math.max(1, ...data.map((d) => d.count));
  const rowH = 30;
  const barH = 16;
  const labelW = 30;
  const valueW = 86;
  const width = 460;
  const barMax = width - labelW - valueW;

  return (
    <div>
      <div className="legend" aria-hidden="true">
        <span className="item"><span className="swatch" style={{ background: 'var(--series-1)' }} />正确选项</span>
        <span className="item"><span className="swatch" style={{ background: 'var(--deemph)' }} />干扰项</span>
      </div>
      <svg width={width} height={data.length * rowH} role="img" aria-label="选项分布图">
        {data.map((d, i) => {
          const y = i * rowH + (rowH - barH) / 2;
          const w = Math.max(d.count > 0 ? 3 : 0, (d.count / max) * barMax);
          const share = total > 0 ? (d.count / total) * 100 : 0;
          return (
            <g
              key={d.key}
              tabIndex={0}
              role="listitem"
              aria-label={`选项 ${d.key}：${d.count} 次，占 ${share.toFixed(1)}%${d.isCorrect ? '，正确选项' : ''}`}
              onPointerMove={(e) =>
                show(e, (
                  <div>
                    <div className="tip-title">选项 {d.key}{d.isCorrect ? '（正确）' : ''}</div>
                    <div className="tip-row"><span>{d.label}</span></div>
                    <div className="tip-row"><span className="muted">选择次数</span><span className="tip-val">{d.count}</span></div>
                    <div className="tip-row"><span className="muted">占比</span><span className="tip-val">{share.toFixed(1)}%</span></div>
                  </div>
                ))
              }
              onPointerLeave={hide}
              onFocus={(e) => {
                const rect = (e.currentTarget as SVGGElement).getBoundingClientRect();
                show({ clientX: rect.left + 60, clientY: rect.top }, (
                  <div>
                    <div className="tip-title">选项 {d.key}{d.isCorrect ? '（正确）' : ''}</div>
                    <div className="tip-row"><span className="muted">选择次数</span><span className="tip-val">{d.count}</span></div>
                    <div className="tip-row"><span className="muted">占比</span><span className="tip-val">{share.toFixed(1)}%</span></div>
                  </div>
                ));
              }}
              onBlur={hide}
              style={{ cursor: 'default', outline: 'none' }}
            >
              {/* 行热区（比条本身大） */}
              <rect x={0} y={i * rowH} width={width} height={rowH} fill="transparent" />
              <text x={0} y={y + barH / 2 + 4} fontSize={12} fill="var(--text-secondary)">{d.key}</text>
              <rect
                x={labelW}
                y={y}
                width={w}
                height={barH}
                rx={4}
                fill={d.isCorrect ? 'var(--series-1)' : 'var(--deemph)'}
              />
              <text
                x={labelW + w + 8}
                y={y + barH / 2 + 4}
                fontSize={12}
                fill="var(--text-primary)"
                style={{ fontVariantNumeric: 'tabular-nums' }}
              >
                {d.count}（{share.toFixed(1)}%）
              </text>
            </g>
          );
        })}
      </svg>
      {tooltip}
    </div>
  );
}
