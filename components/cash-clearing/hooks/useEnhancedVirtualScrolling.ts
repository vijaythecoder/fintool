'use client';

import { useState, useEffect, useMemo, useRef, useCallback } from 'react';

export interface EnhancedVirtualScrollConfig {
  itemHeight: number;
  containerHeight: number;
  overscan?: number;
  scrollThreshold?: number;
  enableDynamicHeight?: boolean;
  enableWebWorker?: boolean;
  bufferSize?: number;
  preloadPages?: number;
}

export interface VirtualItem<T> {
  index: number;
  start: number;
  size: number;
  item: T;
  isLoaded: boolean;
  isVisible: boolean;
}

export interface EnhancedVirtualScrollResult<T> {
  virtualItems: VirtualItem<T>[];
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
  loadedRange: { start: number; end: number };
  scrollToIndex: (index: number, align?: 'start' | 'center' | 'end') => void;
  scrollToTop: () => void;
  scrollToBottom: () => void;
  loadMore: () => Promise<void>;
  performance: {
    renderTime: number;
    scrollPerformance: number;
    memoryUsage: number;
  };
}

/**
 * Enhanced Virtual Scrolling Hook
 * Optimized for handling 1M+ items with smooth performance
 */
export function useEnhancedVirtualScrolling<T>(
  items: T[],
  config: EnhancedVirtualScrollConfig
): EnhancedVirtualScrollResult<T> {
  const {
    itemHeight,
    containerHeight,
    overscan = 10,
    scrollThreshold = 10,
    enableDynamicHeight = false,
    enableWebWorker = false,
    bufferSize = 10000,
    preloadPages = 2
  } = config;

  // State management
  const [scrollTop, setScrollTop] = useState(0);
  const [isScrolling, setIsScrolling] = useState(false);
  const [loadedRange, setLoadedRange] = useState({ start: 0, end: Math.min(bufferSize, items.length) });
  const [itemHeights, setItemHeights] = useState<Map<number, number>>(new Map());
  
  // Refs
  const scrollElementRef = useRef<HTMLDivElement>(null);
  const scrollTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const webWorkerRef = useRef<Worker | null>(null);
  const rafRef = useRef<number | null>(null);
  
  // Performance tracking
  const [performance, setPerformance] = useState({
    renderTime: 0,
    scrollPerformance: 0,
    memoryUsage: 0
  });

  // Initialize web worker for heavy calculations
  useEffect(() => {
    if (enableWebWorker && typeof Worker !== 'undefined') {
      try {
        // Create inline worker for virtual scrolling calculations
        const workerCode = `
          self.onmessage = function(e) {
            const { type, data } = e.data;
            
            if (type === 'CALCULATE_VISIBLE_RANGE') {
              const { scrollTop, itemHeight, containerHeight, overscan, totalItems } = data;
              
              const visibleStart = Math.floor(scrollTop / itemHeight);
              const visibleEnd = Math.min(
                visibleStart + Math.ceil(containerHeight / itemHeight),
                totalItems
              );
              
              const start = Math.max(0, visibleStart - overscan);
              const end = Math.min(totalItems, visibleEnd + overscan);
              
              self.postMessage({
                type: 'VISIBLE_RANGE_CALCULATED',
                data: { start, end, visibleStart, visibleEnd }
              });
            }
          };
        `;
        
        const blob = new Blob([workerCode], { type: 'application/javascript' });
        webWorkerRef.current = new Worker(URL.createObjectURL(blob));
        
        webWorkerRef.current.onmessage = (e) => {
          const { type, data } = e.data;
          if (type === 'VISIBLE_RANGE_CALCULATED') {
            // Handle worker response
            setLoadedRange({ start: data.start, end: data.end });
          }
        };
      } catch (error) {
        console.warn('Failed to initialize web worker for virtual scrolling:', error);
      }
    }

    return () => {
      if (webWorkerRef.current) {
        webWorkerRef.current.terminate();
      }
    };
  }, [enableWebWorker]);

  // Calculate total size with dynamic heights support
  const totalSize = useMemo(() => {
    if (!enableDynamicHeight) {
      return items.length * itemHeight;
    }

    let size = 0;
    for (let i = 0; i < items.length; i++) {
      size += itemHeights.get(i) || itemHeight;
    }
    return size;
  }, [items.length, itemHeight, enableDynamicHeight, itemHeights]);

  // Calculate visible items with performance optimization
  const virtualItems = useMemo(() => {
    const renderStartTime = window.performance ? window.performance.now() : Date.now();
    
    const visibleStart = Math.floor(scrollTop / itemHeight);
    const visibleEnd = Math.min(
      visibleStart + Math.ceil(containerHeight / itemHeight),
      items.length
    );

    const start = Math.max(0, visibleStart - overscan);
    const end = Math.min(items.length, visibleEnd + overscan);

    const virtualItems: VirtualItem<T>[] = [];
    let currentTop = 0;

    // Only process items in the loaded range for memory efficiency
    const rangeStart = Math.max(start, loadedRange.start);
    const rangeEnd = Math.min(end, loadedRange.end);

    // Calculate positions up to range start
    for (let i = 0; i < rangeStart; i++) {
      currentTop += enableDynamicHeight ? (itemHeights.get(i) || itemHeight) : itemHeight;
    }

    // Create virtual items for visible range
    for (let i = rangeStart; i < rangeEnd; i++) {
      const height = enableDynamicHeight ? (itemHeights.get(i) || itemHeight) : itemHeight;
      const isVisible = i >= visibleStart && i < visibleEnd;
      
      virtualItems.push({
        index: i,
        start: currentTop,
        size: height,
        item: items[i],
        isLoaded: i >= loadedRange.start && i < loadedRange.end,
        isVisible
      });

      currentTop += height;
    }

    const renderTime = (window.performance ? window.performance.now() : Date.now()) - renderStartTime;
    setPerformance(prev => ({ ...prev, renderTime }));

    return virtualItems;
  }, [
    items,
    itemHeight,
    containerHeight,
    scrollTop,
    overscan,
    enableDynamicHeight,
    itemHeights,
    loadedRange
  ]);

  // Optimized scroll handler with throttling
  const handleScroll = useCallback((e: React.UIEvent<HTMLDivElement>) => {
    const scrollPerformanceStart = window.performance ? window.performance.now() : Date.now();
    
    if (rafRef.current) {
      cancelAnimationFrame(rafRef.current);
    }

    rafRef.current = requestAnimationFrame(() => {
      const newScrollTop = e.currentTarget.scrollTop;
      setScrollTop(newScrollTop);
      setIsScrolling(true);

      // Clear existing timeout
      if (scrollTimeoutRef.current) {
        clearTimeout(scrollTimeoutRef.current);
      }

      // Set scrolling to false after delay
      scrollTimeoutRef.current = setTimeout(() => {
        setIsScrolling(false);
      }, 150);

      // Update loaded range if approaching boundaries
      const visibleStart = Math.floor(newScrollTop / itemHeight);
      const bufferThreshold = bufferSize * 0.2; // 20% threshold

      if (visibleStart < loadedRange.start + bufferThreshold) {
        // Load previous items
        const newStart = Math.max(0, loadedRange.start - bufferSize);
        setLoadedRange(prev => ({ ...prev, start: newStart }));
      } else if (visibleStart > loadedRange.end - bufferThreshold) {
        // Load next items
        const newEnd = Math.min(items.length, loadedRange.end + bufferSize);
        setLoadedRange(prev => ({ ...prev, end: newEnd }));
      }

      // Use web worker for heavy calculations if available
      if (webWorkerRef.current) {
        webWorkerRef.current.postMessage({
          type: 'CALCULATE_VISIBLE_RANGE',
          data: {
            scrollTop: newScrollTop,
            itemHeight,
            containerHeight,
            overscan,
            totalItems: items.length
          }
        });
      }

      const scrollPerformanceTime = (window.performance ? window.performance.now() : Date.now()) - scrollPerformanceStart;
      setPerformance(prev => ({ ...prev, scrollPerformance: scrollPerformanceTime }));
    });
  }, [itemHeight, containerHeight, overscan, items.length, loadedRange, bufferSize]);

  // Enhanced scroll to index with smooth animation
  const scrollToIndex = useCallback((
    index: number, 
    align: 'start' | 'center' | 'end' = 'start'
  ) => {
    if (!scrollElementRef.current) return;

    // Ensure the target index is in loaded range
    if (index < loadedRange.start || index >= loadedRange.end) {
      const newStart = Math.max(0, index - bufferSize / 2);
      const newEnd = Math.min(items.length, newStart + bufferSize);
      setLoadedRange({ start: newStart, end: newEnd });
    }

    const targetScrollTop = (() => {
      let position = 0;
      
      // Calculate position with dynamic heights
      if (enableDynamicHeight) {
        for (let i = 0; i < index; i++) {
          position += itemHeights.get(i) || itemHeight;
        }
      } else {
        position = index * itemHeight;
      }

      switch (align) {
        case 'start':
          return position;
        case 'center':
          return position - containerHeight / 2 + itemHeight / 2;
        case 'end':
          return position - containerHeight + itemHeight;
        default:
          return position;
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
  }, [itemHeight, containerHeight, totalSize, enableDynamicHeight, itemHeights, loadedRange, bufferSize, items.length]);

  // Optimized scroll to top
  const scrollToTop = useCallback(() => {
    if (!scrollElementRef.current) return;
    
    // Reset to first page
    setLoadedRange({ start: 0, end: Math.min(bufferSize, items.length) });
    
    scrollElementRef.current.scrollTo({ top: 0, behavior: 'smooth' });
  }, [bufferSize, items.length]);

  // Optimized scroll to bottom
  const scrollToBottom = useCallback(() => {
    if (!scrollElementRef.current) return;
    
    // Load last page
    const newStart = Math.max(0, items.length - bufferSize);
    setLoadedRange({ start: newStart, end: items.length });
    
    scrollElementRef.current.scrollTo({ 
      top: totalSize - containerHeight, 
      behavior: 'smooth' 
    });
  }, [totalSize, containerHeight, items.length, bufferSize]);

  // Load more items (for infinite scrolling)
  const loadMore = useCallback(async () => {
    const currentEnd = loadedRange.end;
    const newEnd = Math.min(items.length, currentEnd + bufferSize);
    
    if (newEnd > currentEnd) {
      setLoadedRange(prev => ({ ...prev, end: newEnd }));
    }
  }, [loadedRange.end, items.length, bufferSize]);

  // Update item height for dynamic sizing
  const updateItemHeight = useCallback((index: number, height: number) => {
    if (enableDynamicHeight) {
      setItemHeights(prev => new Map(prev.set(index, height)));
    }
  }, [enableDynamicHeight]);

  // Memory usage monitoring
  useEffect(() => {
    const calculateMemoryUsage = () => {
      // Estimate memory usage based on loaded items
      const loadedItemCount = loadedRange.end - loadedRange.start;
      const estimatedMemoryPerItem = 1024; // 1KB per item estimate
      const memoryUsage = (loadedItemCount * estimatedMemoryPerItem) / (1024 * 1024); // MB
      
      setPerformance(prev => ({ ...prev, memoryUsage }));
    };

    calculateMemoryUsage();
  }, [loadedRange]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (scrollTimeoutRef.current) {
        clearTimeout(scrollTimeoutRef.current);
      }
      if (rafRef.current) {
        cancelAnimationFrame(rafRef.current);
      }
      if (webWorkerRef.current) {
        webWorkerRef.current.terminate();
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
        width: '100%',
        // Performance optimizations
        willChange: 'scroll-position',
        contain: 'layout style paint'
      }
    },
    wrapperProps: {
      style: {
        height: totalSize,
        width: '100%',
        position: 'relative',
        // Performance optimizations
        contain: 'layout style paint'
      }
    },
    isScrolling,
    loadedRange,
    scrollToIndex,
    scrollToTop,
    scrollToBottom,
    loadMore,
    performance
  };
}

/**
 * Hook for measuring item heights dynamically
 */
export function useItemMeasure() {
  const measureRef = useRef<(index: number, element: HTMLElement) => void>();
  
  const measureElement = useCallback((index: number, element: HTMLElement) => {
    if (measureRef.current) {
      measureRef.current(index, element);
    }
  }, []);

  const setMeasureCallback = useCallback((callback: (index: number, element: HTMLElement) => void) => {
    measureRef.current = callback;
  }, []);

  return { measureElement, setMeasureCallback };
}