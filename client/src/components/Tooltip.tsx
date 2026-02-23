import { useState, useRef, useEffect, useCallback, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import styles from './Tooltip.module.css';

interface TooltipProps {
  content: string;
  children: ReactNode;
  side?: 'right' | 'top' | 'bottom' | 'left';
  delay?: number;
}

/**
 * Tooltip that uses a portal so it's never clipped by overflow:hidden ancestors.
 * Position is calculated from the trigger element's bounding rect.
 */
export function Tooltip({ content, children, side = 'right', delay = 400 }: TooltipProps) {
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null);
  const triggerRef = useRef<HTMLSpanElement>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const show = useCallback(() => {
    timerRef.current = setTimeout(() => {
      if (!triggerRef.current) return;
      const r = triggerRef.current.getBoundingClientRect();
      let x = 0, y = 0;
      switch (side) {
        case 'right':  x = r.right + 8;            y = r.top + r.height / 2; break;
        case 'left':   x = r.left - 8;             y = r.top + r.height / 2; break;
        case 'top':    x = r.left + r.width / 2;   y = r.top - 8;            break;
        case 'bottom': x = r.left + r.width / 2;   y = r.bottom + 8;         break;
      }
      setPos({ x, y });
    }, delay);
  }, [side, delay]);

  const hide = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    setPos(null);
  }, []);

  // Clean up timer on unmount
  useEffect(() => () => { if (timerRef.current) clearTimeout(timerRef.current); }, []);

  return (
    <span
      ref={triggerRef}
      onMouseEnter={show}
      onMouseLeave={hide}
      onFocus={show}
      onBlur={hide}
      className={styles.wrapper}
    >
      {children}
      {pos && createPortal(
        <span
          className={`${styles.tip} ${styles[side]}`}
          style={{ '--tip-x': `${pos.x}px`, '--tip-y': `${pos.y}px` } as React.CSSProperties}
          role="tooltip"
        >
          {content}
        </span>,
        document.body
      )}
    </span>
  );
}
