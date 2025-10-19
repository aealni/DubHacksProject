import { CanvasViewport } from './types';

// Convert screen coordinates to canvas coordinates
export const screenToCanvas = (
  screenX: number, 
  screenY: number, 
  viewport: CanvasViewport, 
  canvasRect: DOMRect | null
) => {
  if (!canvasRect) return { x: 0, y: 0 };
  
  return {
    x: (screenX - canvasRect.left - viewport.x) / viewport.zoom,
    y: (screenY - canvasRect.top - viewport.y) / viewport.zoom
  };
};

// Convert canvas coordinates to screen coordinates  
export const canvasToScreen = (
  canvasX: number,
  canvasY: number,
  viewport: CanvasViewport,
  canvasRect: DOMRect | null
) => {
  if (!canvasRect) return { x: 0, y: 0 };
  
  return {
    x: canvasX * viewport.zoom + viewport.x + canvasRect.left,
    y: canvasY * viewport.zoom + viewport.y + canvasRect.top
  };
};

// Clamp zoom level within bounds
export const clampZoom = (zoom: number, minZoom: number, maxZoom: number) => {
  return Math.max(minZoom, Math.min(maxZoom, zoom));
};

// Calculate distance between two points
export const distance = (x1: number, y1: number, x2: number, y2: number) => {
  return Math.hypot(x2 - x1, y2 - y1);
};

// Check if point is within rectangle
export const isPointInRect = (
  pointX: number, 
  pointY: number, 
  rectX: number, 
  rectY: number, 
  rectWidth: number, 
  rectHeight: number
) => {
  return pointX >= rectX && 
         pointX <= rectX + rectWidth && 
         pointY >= rectY && 
         pointY <= rectY + rectHeight;
};

// Calculate rectangle intersection
export const getRectIntersection = (
  rect1: { x: number; y: number; width: number; height: number },
  rect2: { x: number; y: number; width: number; height: number }
) => {
  const left = Math.max(rect1.x, rect2.x);
  const right = Math.min(rect1.x + rect1.width, rect2.x + rect2.width);
  const top = Math.max(rect1.y, rect2.y);
  const bottom = Math.min(rect1.y + rect1.height, rect2.y + rect2.height);
  
  if (left < right && top < bottom) {
    return {
      x: left,
      y: top,
      width: right - left,
      height: bottom - top
    };
  }
  
  return null; // No intersection
};

// Grid snapping utility
export const snapToGrid = (value: number, gridSize: number) => {
  return Math.round(value / gridSize) * gridSize;
};