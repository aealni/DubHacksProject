import { useCallback, useRef, useEffect } from 'react';

export interface UseDragOptions {
  onDragStart?: (e: MouseEvent) => void;
  onDrag?: (e: MouseEvent, deltaX: number, deltaY: number) => void;
  onDragEnd?: (e: MouseEvent) => void;
  disabled?: boolean;
}

export interface UseDragResult {
  dragRef: React.RefObject<HTMLElement>;
  isDragging: boolean;
  handleMouseDown: (e: React.MouseEvent) => void;
}

export function useDrag(options: UseDragOptions = {}): UseDragResult {
  const { onDragStart, onDrag, onDragEnd, disabled = false } = options;
  const dragRef = useRef<HTMLElement>(null);
  const isDraggingRef = useRef(false);
  const lastPos = useRef({ x: 0, y: 0 });

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    if (disabled || e.button !== 0) return;

    e.preventDefault();
    e.stopPropagation();

    isDraggingRef.current = true;
    lastPos.current = { x: e.clientX, y: e.clientY };

    onDragStart?.(e.nativeEvent);

    const handleMouseMove = (e: MouseEvent) => {
      if (!isDraggingRef.current) return;

      const deltaX = e.clientX - lastPos.current.x;
      const deltaY = e.clientY - lastPos.current.y;

      onDrag?.(e, deltaX, deltaY);

      lastPos.current = { x: e.clientX, y: e.clientY };
    };

    const handleMouseUp = (e: MouseEvent) => {
      if (!isDraggingRef.current) return;

      isDraggingRef.current = false;
      onDragEnd?.(e);

      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
  }, [disabled, onDragStart, onDrag, onDragEnd]);

  return {
    dragRef,
    isDragging: isDraggingRef.current,
    handleMouseDown
  };
}

export interface UseResizeOptions {
  onResizeStart?: (e: MouseEvent) => void;
  onResize?: (e: MouseEvent, deltaX: number, deltaY: number) => void;
  onResizeEnd?: (e: MouseEvent) => void;
  minSize?: { width: number; height: number };
  maxSize?: { width: number; height: number };
  disabled?: boolean;
}

export interface UseResizeResult {
  resizeRef: React.RefObject<HTMLElement>;
  isResizing: boolean;
  handleMouseDown: (e: React.MouseEvent) => void;
}

export function useResize(options: UseResizeOptions = {}): UseResizeResult {
  const { onResizeStart, onResize, onResizeEnd, disabled = false } = options;
  const resizeRef = useRef<HTMLElement>(null);
  const isResizingRef = useRef(false);
  const lastPos = useRef({ x: 0, y: 0 });

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    if (disabled || e.button !== 0) return;

    e.preventDefault();
    e.stopPropagation();

    isResizingRef.current = true;
    lastPos.current = { x: e.clientX, y: e.clientY };

    onResizeStart?.(e.nativeEvent);

    const handleMouseMove = (e: MouseEvent) => {
      if (!isResizingRef.current) return;

      const deltaX = e.clientX - lastPos.current.x;
      const deltaY = e.clientY - lastPos.current.y;

      onResize?.(e, deltaX, deltaY);

      lastPos.current = { x: e.clientX, y: e.clientY };
    };

    const handleMouseUp = (e: MouseEvent) => {
      if (!isResizingRef.current) return;

      isResizingRef.current = false;
      onResizeEnd?.(e);

      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
  }, [disabled, onResizeStart, onResize, onResizeEnd]);

  return {
    resizeRef,
    isResizing: isResizingRef.current,
    handleMouseDown
  };
}

export interface UseClickOutsideOptions {
  onClickOutside: (e: Event) => void;
  disabled?: boolean;
}

export function useClickOutside(
  ref: React.RefObject<HTMLElement>,
  options: UseClickOutsideOptions
): void {
  const { onClickOutside, disabled = false } = options;

  useEffect(() => {
    if (disabled) return;

    const handleClickOutside = (event: Event) => {
      if (ref.current && !ref.current.contains(event.target as Node)) {
        onClickOutside(event);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('touchstart', handleClickOutside);

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('touchstart', handleClickOutside);
    };
  }, [ref, onClickOutside, disabled]);
}

export interface UseKeyboardShortcutsOptions {
  shortcuts: Record<string, () => void>;
  disabled?: boolean;
}

export function useKeyboardShortcuts(options: UseKeyboardShortcutsOptions): void {
  const { shortcuts, disabled = false } = options;

  useEffect(() => {
    if (disabled) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      const key = [
        e.ctrlKey && 'ctrl',
        e.shiftKey && 'shift',
        e.altKey && 'alt',
        e.metaKey && 'meta',
        e.key.toLowerCase()
      ].filter(Boolean).join('+');

      const handler = shortcuts[key];
      if (handler) {
        e.preventDefault();
        handler();
      }
    };

    document.addEventListener('keydown', handleKeyDown);

    return () => {
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [shortcuts, disabled]);
}

export default {
  useDrag,
  useResize,
  useClickOutside,
  useKeyboardShortcuts
};