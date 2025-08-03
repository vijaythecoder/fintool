'use client';

import { useState, useEffect, useMemo, useRef, useCallback } from 'react';

export interface VirtualScrollConfig {
  itemHeight: number;
  containerHeight: number;
  overscan?: number;
  scrollThreshold?: number;
}

export interface VirtualScrollResult<T> {
  virtualItems: Array<{
    index: number;
    start: number;
    size: number;
    item: T;
  }>;
  totalSize: number;
  scrollElementProps: {
    ref: React.RefObject<HTMLDivElement>;
    onScroll: (e: React.UIEvent<HTMLDivElement>) => void;
    style: React.CSSProperties;
  };
  wrapperProps: {
    style: React.CSSProperties;
  };
  isScrolling: boolean;
  scrollToIndex: (index: number, align?: 'start' | 'center' | 'end') => void;
  scrollToTop: () => void;
  scrollToBottom: () => void;
}

export function useVirtualScrolling<T>(
  items: T[],
  config: VirtualScrollConfig
): VirtualScrollResult<T> {
  const {
    itemHeight,
    containerHeight,
    overscan = 5,
    scrollThreshold = 10
  } = config;

  const [scrollTop, setScrollTop] = useState(0);
  const [isScrolling, setIsScrolling] = useState(false);
  const scrollElementRef = useRef<HTMLDivElement>(null);
  const scrollTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const totalSize = items.length * itemHeight;

  const virtualItems = useMemo(() => {
    const visibleStart = Math.floor(scrollTop / itemHeight);
    const visibleEnd = Math.min(
      visibleStart + Math.ceil(containerHeight / itemHeight),
      items.length
    );

    const start = Math.max(0, visibleStart - overscan);
    const end = Math.min(items.length, visibleEnd + overscan);

    const virtualItems = [];
    for (let i = start; i < end; i++) {
      virtualItems.push({
        index: i,
        start: i * itemHeight,
        size: itemHeight,
        item: items[i]
      });
    }

    return virtualItems;
  }, [items, itemHeight, containerHeight, scrollTop, overscan]);

  const handleScroll = useCallback((e: React.UIEvent<HTMLDivElement>) => {
    const scrollTop = e.currentTarget.scrollTop;
    setScrollTop(scrollTop);
    setIsScrolling(true);

    // Clear existing timeout
    if (scrollTimeoutRef.current) {
      clearTimeout(scrollTimeoutRef.current);
    }

    // Set scrolling to false after a delay
    scrollTimeoutRef.current = setTimeout(() => {
      setIsScrolling(false);
    }, 150);
  }, []);

  const scrollToIndex = useCallback((
    index: number, 
    align: 'start' | 'center' | 'end' = 'start'
  ) => {
    if (!scrollElementRef.current) return;

    const targetScrollTop = (() => {
      switch (align) {
        case 'start':
          return index * itemHeight;
        case 'center':
          return index * itemHeight - containerHeight / 2 + itemHeight / 2;
        case 'end':
          return index * itemHeight - containerHeight + itemHeight;
        default:
          return index * itemHeight;
      }
    })();

    const clampedScrollTop = Math.max(
      0,
      Math.min(targetScrollTop, totalSize - containerHeight)
    );

    scrollElementRef.current.scrollTo({
      top: clampedScrollTop,
      behavior: 'smooth'
    });
  }, [itemHeight, containerHeight, totalSize]);

  const scrollToTop = useCallback(() => {
    if (!scrollElementRef.current) return;
    scrollElementRef.current.scrollTo({ top: 0, behavior: 'smooth' });
  }, []);

  const scrollToBottom = useCallback(() => {
    if (!scrollElementRef.current) return;
    scrollElementRef.current.scrollTo({ 
      top: totalSize - containerHeight, 
      behavior: 'smooth' 
    });
  }, [totalSize, containerHeight]);

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (scrollTimeoutRef.current) {
        clearTimeout(scrollTimeoutRef.current);
      }
    };
  }, []);

  return {
    virtualItems,
    totalSize,
    scrollElementProps: {
      ref: scrollElementRef,
      onScroll: handleScroll,
      style: {
        height: containerHeight,
        overflow: 'auto',
        width: '100%'
      }
    },
    wrapperProps: {
      style: {
        height: totalSize,
        width: '100%',
        position: 'relative'
      }
    },
    isScrolling,
    scrollToIndex,
    scrollToTop,
    scrollToBottom
  };
}