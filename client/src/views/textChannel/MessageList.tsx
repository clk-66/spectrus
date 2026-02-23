import { useRef, useEffect, useLayoutEffect, useMemo, useCallback } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import type { Message } from '../../types';
import { MessageItem, groupMessages } from './MessageItem';
import styles from './TextChannel.module.css';

interface Props {
  messages: Message[];
  hasMore: boolean;
  loadingMore: boolean;
  onLoadMore: () => void;
  /** Called just before a prepend so we can preserve scroll position. */
  onBeforePrepend?: (cb: () => void) => void;
}

export function MessageList({
  messages,
  hasMore,
  loadingMore,
  onLoadMore,
}: Props) {
  const parentRef = useRef<HTMLDivElement>(null);

  // Derived: messages grouped for visual collapsing
  const grouped = useMemo(() => groupMessages(messages), [messages]);

  const virtualizer = useVirtualizer({
    count: grouped.length,
    getScrollElement: () => parentRef.current,
    estimateSize: (i) => (grouped[i]?.isGroupStart ? 68 : 32),
    overscan: 8,
    measureElement: (el) => el.getBoundingClientRect().height,
  });

  // ---- Scroll-to-bottom on initial load ----------------------------------
  const prevCountRef   = useRef(0);
  const wasAtBottomRef = useRef(true);
  const isPrependingRef = useRef(false);
  // Stores { scrollTop, scrollHeight } captured just before a prepend
  const prependSnapRef = useRef<{ scrollTop: number; scrollHeight: number } | null>(null);

  // Track whether user is at the bottom
  useEffect(() => {
    const el = parentRef.current;
    if (!el) return;
    const onScroll = () => {
      wasAtBottomRef.current =
        el.scrollHeight - el.scrollTop - el.clientHeight < 120;

      // Load more when near the top
      if (el.scrollTop < 200 && hasMore && !loadingMore && !isPrependingRef.current) {
        // Capture scroll position before the store update changes the DOM
        prependSnapRef.current = {
          scrollTop:    el.scrollTop,
          scrollHeight: el.scrollHeight,
        };
        isPrependingRef.current = true;
        onLoadMore();
      }
    };
    el.addEventListener('scroll', onScroll, { passive: true });
    return () => el.removeEventListener('scroll', onScroll);
  }, [hasMore, loadingMore, onLoadMore]);

  // Auto-scroll to bottom when messages change
  useEffect(() => {
    const prevCount = prevCountRef.current;
    const curCount  = grouped.length;
    prevCountRef.current = curCount;

    if (curCount === 0) return;

    if (prevCount === 0) {
      // Initial load — always jump to bottom
      requestAnimationFrame(() => {
        virtualizer.scrollToIndex(curCount - 1, { align: 'end' });
        wasAtBottomRef.current = true;
      });
      return;
    }

    if (!isPrependingRef.current && curCount > prevCount && wasAtBottomRef.current) {
      // New message appended while at bottom
      requestAnimationFrame(() => {
        virtualizer.scrollToIndex(curCount - 1, { align: 'end' });
      });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [grouped.length]);

  // Preserve scroll position after prepend (runs synchronously after DOM update)
  useLayoutEffect(() => {
    if (!isPrependingRef.current || prependSnapRef.current === null) return;
    const el = parentRef.current;
    if (!el) return;

    const { scrollTop, scrollHeight } = prependSnapRef.current;
    const delta = el.scrollHeight - scrollHeight;
    if (delta > 0) {
      el.scrollTop = scrollTop + delta;
    }

    prependSnapRef.current  = null;
    isPrependingRef.current = false;
  }, [grouped.length]);

  const items = virtualizer.getVirtualItems();
  const totalSize = virtualizer.getTotalSize();

  const measureElement = useCallback(
    (el: Element | null) => {
      if (el) virtualizer.measureElement(el);
    },
    [virtualizer]
  );

  return (
    <div ref={parentRef} className={styles.listScroll}>
      {/* Total height container — virtual items are positioned inside */}
      <div className={styles.listInner} style={{ height: `${totalSize}px` }}>
        {/* Load-more spinner appears at the very top of the virtual content */}
        {(hasMore || loadingMore) && (
          <div
            className={styles.loadMoreArea}
            style={{ position: 'absolute', top: 0, left: 0, right: 0 }}
          >
            {loadingMore && <span className={styles.loadMoreSpinner} aria-label="Loading older messages" />}
          </div>
        )}

        {items.map((vi) => {
          const gm = grouped[vi.index];
          if (!gm) return null;
          return (
            <div
              key={vi.key}
              data-index={vi.index}
              ref={measureElement}
              style={{
                position:  'absolute',
                top:       0,
                left:      0,
                width:     '100%',
                transform: `translateY(${vi.start}px)`,
              }}
            >
              <MessageItem grouped={gm} />
            </div>
          );
        })}
      </div>
    </div>
  );
}
