import { useCallback, useRef, useMemo } from 'react';
import { CanvasViewport } from '../utils/canvas/types';
import { screenToCanvas, canvasToScreen, clampZoom } from '../utils/canvas/canvasUtils';
import { MIN_ZOOM, MAX_ZOOM } from '../utils/canvas/constants';

export const useCanvasCoordinates = (viewport: CanvasViewport) => {
  const canvasRef = useRef<HTMLDivElement>(null);

  const getScreenToCanvas = useCallback((screenX: number, screenY: number) => {
    const rect = canvasRef.current?.getBoundingClientRect() || null;
    return screenToCanvas(screenX, screenY, viewport, rect);
  }, [viewport]);

  const getCanvasToScreen = useCallback((canvasX: number, canvasY: number) => {
    const rect = canvasRef.current?.getBoundingClientRect() || null;
    return canvasToScreen(canvasX, canvasY, viewport, rect);
  }, [viewport]);

  return {
    canvasRef,
    screenToCanvas: getScreenToCanvas,
    canvasToScreen: getCanvasToScreen
  };
};

export const useZoomControls = (viewport: CanvasViewport, onViewportChange: (viewport: Partial<CanvasViewport>) => void) => {
  const zoomIn = useCallback(() => {
    const newZoom = clampZoom(viewport.zoom * 1.2, MIN_ZOOM, MAX_ZOOM);
    onViewportChange({ zoom: newZoom });
  }, [viewport.zoom, onViewportChange]);

  const zoomOut = useCallback(() => {
    const newZoom = clampZoom(viewport.zoom / 1.2, MIN_ZOOM, MAX_ZOOM);
    onViewportChange({ zoom: newZoom });
  }, [viewport.zoom, onViewportChange]);

  const resetZoom = useCallback(() => {
    onViewportChange({ zoom: 1 });
  }, [onViewportChange]);

  const setZoom = useCallback((zoom: number) => {
    const newZoom = clampZoom(zoom, MIN_ZOOM, MAX_ZOOM);
    onViewportChange({ zoom: newZoom });
  }, [onViewportChange]);

  return {
    zoomIn,
    zoomOut,
    resetZoom,
    setZoom,
    canZoomIn: viewport.zoom < MAX_ZOOM,
    canZoomOut: viewport.zoom > MIN_ZOOM
  };
};

export const usePanControls = (viewport: CanvasViewport, onViewportChange: (viewport: Partial<CanvasViewport>) => void) => {
  const pan = useCallback((deltaX: number, deltaY: number) => {
    onViewportChange({
      x: viewport.x + deltaX,
      y: viewport.y + deltaY
    });
  }, [viewport.x, viewport.y, onViewportChange]);

  const centerView = useCallback(() => {
    onViewportChange({ x: 100, y: 100 });
  }, [onViewportChange]);

  return {
    pan,
    centerView
  };
};