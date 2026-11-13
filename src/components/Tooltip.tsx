import { ReactNode, useCallback, useState } from 'react';

export interface TipState {
  x: number;
  y: number;
  content: ReactNode;
}

/** 共享悬浮提示：hover 与键盘 focus 均触发；内容用 DOM 文本渲染，不拼接 HTML */
export function useTooltip() {
  const [tip, setTip] = useState<TipState | null>(null);

  const show = useCallback((e: { clientX: number; clientY: number }, content: ReactNode) => {
    setTip({ x: e.clientX, y: e.clientY, content });
  }, []);
  const hide = useCallback(() => setTip(null), []);

  const tooltip = tip ? (
    <div
      className="chart-tip"
      role="tooltip"
      style={{
        left: Math.min(tip.x + 14, window.innerWidth - 300),
        top: Math.max(tip.y - 12, 8),
      }}
    >
      {tip.content}
    </div>
  ) : null;

  return { show, hide, tooltip };
}
