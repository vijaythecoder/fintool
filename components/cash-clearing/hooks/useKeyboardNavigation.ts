'use client';

import { useEffect, useCallback, useRef, useState } from 'react';

export interface KeyboardNavigationConfig {
  onArrowUp?: () => void;
  onArrowDown?: () => void;
  onArrowLeft?: () => void;
  onArrowRight?: () => void;
  onEnter?: () => void;
  onEscape?: () => void;
  onSpace?: () => void;
  onHome?: () => void;
  onEnd?: () => void;
  onPageUp?: () => void;
  onPageDown?: () => void;
  onSelectAll?: () => void; // Ctrl+A
  onDelete?: () => void;
  onBackspace?: () => void;
  onTab?: () => void;
  onShiftTab?: () => void;
  enabled?: boolean;
  preventDefault?: boolean;
  stopPropagation?: boolean;
}

export function useKeyboardNavigation(config: KeyboardNavigationConfig) {
  const {
    onArrowUp,
    onArrowDown,
    onArrowLeft,
    onArrowRight,
    onEnter,
    onEscape,
    onSpace,
    onHome,
    onEnd,
    onPageUp,
    onPageDown,
    onSelectAll,
    onDelete,
    onBackspace,
    onTab,
    onShiftTab,
    enabled = true,
    preventDefault = true,
    stopPropagation = true
  } = config;

  const elementRef = useRef<HTMLElement | null>(null);

  const handleKeyDown = useCallback((event: KeyboardEvent) => {
    if (!enabled) return;

    const { key, ctrlKey, metaKey, shiftKey } = event;
    const isModifierPressed = ctrlKey || metaKey;

    let handled = false;

    switch (key) {
      case 'ArrowUp':
        if (onArrowUp) {
          onArrowUp();
          handled = true;
        }
        break;
      case 'ArrowDown':
        if (onArrowDown) {
          onArrowDown();
          handled = true;
        }
        break;
      case 'ArrowLeft':
        if (onArrowLeft) {
          onArrowLeft();
          handled = true;
        }
        break;
      case 'ArrowRight':
        if (onArrowRight) {
          onArrowRight();
          handled = true;
        }
        break;
      case 'Enter':
        if (onEnter) {
          onEnter();
          handled = true;
        }
        break;
      case 'Escape':
        if (onEscape) {
          onEscape();
          handled = true;
        }
        break;
      case ' ':
        if (onSpace) {
          onSpace();
          handled = true;
        }
        break;
      case 'Home':
        if (onHome) {
          onHome();
          handled = true;
        }
        break;
      case 'End':
        if (onEnd) {
          onEnd();
          handled = true;
        }
        break;
      case 'PageUp':
        if (onPageUp) {
          onPageUp();
          handled = true;
        }
        break;
      case 'PageDown':
        if (onPageDown) {
          onPageDown();
          handled = true;
        }
        break;
      case 'a':
        if (isModifierPressed && onSelectAll) {
          onSelectAll();
          handled = true;
        }
        break;
      case 'Delete':
        if (onDelete) {
          onDelete();
          handled = true;
        }
        break;
      case 'Backspace':
        if (onBackspace) {
          onBackspace();
          handled = true;
        }
        break;
      case 'Tab':
        if (shiftKey) {
          if (onShiftTab) {
            onShiftTab();
            handled = true;
          }
        } else {
          if (onTab) {
            onTab();
            handled = true;
          }
        }
        break;
    }

    if (handled) {
      if (preventDefault) {
        event.preventDefault();
      }
      if (stopPropagation) {
        event.stopPropagation();
      }
    }
  }, [
    enabled,
    onArrowUp,
    onArrowDown,
    onArrowLeft,
    onArrowRight,
    onEnter,
    onEscape,
    onSpace,
    onHome,
    onEnd,
    onPageUp,
    onPageDown,
    onSelectAll,
    onDelete,
    onBackspace,
    onTab,
    onShiftTab,
    preventDefault,
    stopPropagation
  ]);

  const attachToElement = useCallback((element: HTMLElement | null) => {
    if (elementRef.current) {
      elementRef.current.removeEventListener('keydown', handleKeyDown);
    }

    if (element) {
      element.addEventListener('keydown', handleKeyDown);
      elementRef.current = element;
      
      // Ensure element can receive focus
      if (!element.hasAttribute('tabindex')) {
        element.setAttribute('tabindex', '0');
      }
    }
  }, [handleKeyDown]);

  const focus = useCallback(() => {
    if (elementRef.current) {
      elementRef.current.focus();
    }
  }, []);

  const blur = useCallback(() => {
    if (elementRef.current) {
      elementRef.current.blur();
    }
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (elementRef.current) {
        elementRef.current.removeEventListener('keydown', handleKeyDown);
      }
    };
  }, [handleKeyDown]);

  return {
    attachToElement,
    focus,
    blur,
    elementRef
  };
}

// Hook for managing selection state with keyboard navigation
export interface SelectionState<T> {
  selectedItems: Set<T>;
  focusedIndex: number;
  anchorIndex: number;
}

export interface SelectionActions<T> {
  selectItem: (item: T) => void;
  deselectItem: (item: T) => void;
  toggleSelection: (item: T) => void;
  selectRange: (startIndex: number, endIndex: number, items: T[]) => void;
  selectAll: (items: T[]) => void;
  clearSelection: () => void;
  setFocusedIndex: (index: number) => void;
  moveFocus: (direction: 'up' | 'down' | 'home' | 'end', itemCount: number) => void;
}

export function useSelection<T>(
  items: T[],
  getItemId: (item: T) => string,
  multiSelect = true
): [SelectionState<string>, SelectionActions<T>] {
  const [state, setState] = useState<SelectionState<string>>({
    selectedItems: new Set(),
    focusedIndex: 0,
    anchorIndex: 0
  });

  const selectItem = useCallback((item: T) => {
    const itemId = getItemId(item);
    setState(prev => ({
      ...prev,
      selectedItems: new Set([...(multiSelect ? prev.selectedItems : []), itemId])
    }));
  }, [getItemId, multiSelect]);

  const deselectItem = useCallback((item: T) => {
    const itemId = getItemId(item);
    setState(prev => {
      const newSelected = new Set(prev.selectedItems);
      newSelected.delete(itemId);
      return {
        ...prev,
        selectedItems: newSelected
      };
    });
  }, [getItemId]);

  const toggleSelection = useCallback((item: T) => {
    const itemId = getItemId(item);
    setState(prev => {
      const newSelected = new Set(prev.selectedItems);
      if (newSelected.has(itemId)) {
        newSelected.delete(itemId);
      } else {
        if (!multiSelect) {
          newSelected.clear();
        }
        newSelected.add(itemId);
      }
      return {
        ...prev,
        selectedItems: newSelected
      };
    });
  }, [getItemId, multiSelect]);

  const selectRange = useCallback((startIndex: number, endIndex: number, items: T[]) => {
    if (!multiSelect) return;

    const start = Math.min(startIndex, endIndex);
    const end = Math.max(startIndex, endIndex);
    const rangeItems = items.slice(start, end + 1).map(getItemId);

    setState(prev => ({
      ...prev,
      selectedItems: new Set([...prev.selectedItems, ...rangeItems])
    }));
  }, [getItemId, multiSelect]);

  const selectAll = useCallback((items: T[]) => {
    if (!multiSelect) return;

    setState(prev => ({
      ...prev,
      selectedItems: new Set(items.map(getItemId))
    }));
  }, [getItemId, multiSelect]);

  const clearSelection = useCallback(() => {
    setState(prev => ({
      ...prev,
      selectedItems: new Set()
    }));
  }, []);

  const setFocusedIndex = useCallback((index: number) => {
    setState(prev => ({
      ...prev,
      focusedIndex: Math.max(0, Math.min(index, items.length - 1)),
      anchorIndex: index
    }));
  }, [items.length]);

  const moveFocus = useCallback((direction: 'up' | 'down' | 'home' | 'end', itemCount: number) => {
    setState(prev => {
      let newIndex = prev.focusedIndex;

      switch (direction) {
        case 'up':
          newIndex = Math.max(0, prev.focusedIndex - 1);
          break;
        case 'down':
          newIndex = Math.min(itemCount - 1, prev.focusedIndex + 1);
          break;
        case 'home':
          newIndex = 0;
          break;
        case 'end':
          newIndex = itemCount - 1;
          break;
      }

      return {
        ...prev,
        focusedIndex: newIndex
      };
    });
  }, []);

  return [
    state,
    {
      selectItem,
      deselectItem,
      toggleSelection,
      selectRange,
      selectAll,
      clearSelection,
      setFocusedIndex,
      moveFocus
    }
  ];
}