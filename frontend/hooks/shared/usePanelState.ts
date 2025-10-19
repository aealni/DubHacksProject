import { useState, useCallback, useRef, useEffect } from 'react';

export interface UsePanelStateOptions {
  initialPosition?: { x: number; y: number };
  initialSize?: { width: number; height: number };
  minSize?: { width: number; height: number };
  maxSize?: { width: number; height: number };
  initialMinimized?: boolean;
  initialMaximized?: boolean;
}

export interface PanelState {
  position: { x: number; y: number };
  size: { width: number; height: number };
  isMinimized: boolean;
  isMaximized: boolean;
  isDragging: boolean;
  isResizing: boolean;
  zIndex: number;
}

export interface UsePanelStateResult {
  state: PanelState;
  actions: {
    setPosition: (position: { x: number; y: number }) => void;
    setSize: (size: { width: number; height: number }) => void;
    minimize: () => void;
    maximize: () => void;
    restore: () => void;
    toggleMinimize: () => void;
    toggleMaximize: () => void;
    startDragging: () => void;
    stopDragging: () => void;
    startResizing: () => void;
    stopResizing: () => void;
    bringToFront: () => void;
    reset: () => void;
  };
}

let globalZIndex = 1000;

export function usePanelState(options: UsePanelStateOptions = {}): UsePanelStateResult {
  const {
    initialPosition = { x: 100, y: 100 },
    initialSize = { width: 400, height: 300 },
    minSize = { width: 200, height: 150 },
    maxSize = { width: 1200, height: 800 },
    initialMinimized = false,
    initialMaximized = false
  } = options;

  const initialState: PanelState = {
    position: initialPosition,
    size: initialSize,
    isMinimized: initialMinimized,
    isMaximized: initialMaximized,
    isDragging: false,
    isResizing: false,
    zIndex: ++globalZIndex
  };

  const [state, setState] = useState<PanelState>(initialState);
  const previousState = useRef<Partial<PanelState>>({});

  const setPosition = useCallback((position: { x: number; y: number }) => {
    setState(prev => ({ ...prev, position }));
  }, []);

  const setSize = useCallback((size: { width: number; height: number }) => {
    const constrainedSize = {
      width: Math.max(minSize.width, Math.min(maxSize.width, size.width)),
      height: Math.max(minSize.height, Math.min(maxSize.height, size.height))
    };
    setState(prev => ({ ...prev, size: constrainedSize }));
  }, [minSize, maxSize]);

  const minimize = useCallback(() => {
    setState(prev => {
      if (!prev.isMinimized) {
        previousState.current = { size: prev.size, position: prev.position };
      }
      return { ...prev, isMinimized: true, isMaximized: false };
    });
  }, []);

  const maximize = useCallback(() => {
    setState(prev => {
      if (!prev.isMaximized) {
        previousState.current = { size: prev.size, position: prev.position };
      }
      return {
        ...prev,
        isMaximized: true,
        isMinimized: false,
        position: { x: 0, y: 0 },
        size: { width: window.innerWidth, height: window.innerHeight }
      };
    });
  }, []);

  const restore = useCallback(() => {
    setState(prev => ({
      ...prev,
      isMinimized: false,
      isMaximized: false,
      size: previousState.current.size || initialSize,
      position: previousState.current.position || initialPosition
    }));
  }, [initialSize, initialPosition]);

  const toggleMinimize = useCallback(() => {
    setState(prev => {
      if (prev.isMinimized) {
        return {
          ...prev,
          isMinimized: false,
          size: previousState.current.size || initialSize,
          position: previousState.current.position || initialPosition
        };
      } else {
        previousState.current = { size: prev.size, position: prev.position };
        return { ...prev, isMinimized: true, isMaximized: false };
      }
    });
  }, [initialSize, initialPosition]);

  const toggleMaximize = useCallback(() => {
    setState(prev => {
      if (prev.isMaximized) {
        return {
          ...prev,
          isMaximized: false,
          size: previousState.current.size || initialSize,
          position: previousState.current.position || initialPosition
        };
      } else {
        previousState.current = { size: prev.size, position: prev.position };
        return {
          ...prev,
          isMaximized: true,
          isMinimized: false,
          position: { x: 0, y: 0 },
          size: { width: window.innerWidth, height: window.innerHeight }
        };
      }
    });
  }, [initialSize, initialPosition]);

  const startDragging = useCallback(() => {
    setState(prev => ({ ...prev, isDragging: true, zIndex: ++globalZIndex }));
  }, []);

  const stopDragging = useCallback(() => {
    setState(prev => ({ ...prev, isDragging: false }));
  }, []);

  const startResizing = useCallback(() => {
    setState(prev => ({ ...prev, isResizing: true, zIndex: ++globalZIndex }));
  }, []);

  const stopResizing = useCallback(() => {
    setState(prev => ({ ...prev, isResizing: false }));
  }, []);

  const bringToFront = useCallback(() => {
    setState(prev => ({ ...prev, zIndex: ++globalZIndex }));
  }, []);

  const reset = useCallback(() => {
    setState(initialState);
    previousState.current = {};
  }, [initialState]);

  return {
    state,
    actions: {
      setPosition,
      setSize,
      minimize,
      maximize,
      restore,
      toggleMinimize,
      toggleMaximize,
      startDragging,
      stopDragging,
      startResizing,
      stopResizing,
      bringToFront,
      reset
    }
  };
}

export default usePanelState;