import { useMemo, useCallback } from 'react';
import { Panel, CanvasViewport } from '../utils/canvas/types';
import { isPointInRect } from '../utils/canvas/canvasUtils';

interface ViewportBounds {
  left: number;
  right: number;
  top: number;
  bottom: number;
}

export const useVisiblePanels = (
  panels: Panel[],
  viewport: CanvasViewport,
  containerWidth: number = 1920,
  containerHeight: number = 1080,
  buffer: number = 200 // Extra buffer around viewport for smooth scrolling
) => {
  // Calculate viewport bounds with buffer
  const viewportBounds = useMemo((): ViewportBounds => {
    const left = (-viewport.x - buffer) / viewport.zoom;
    const right = (containerWidth - viewport.x + buffer) / viewport.zoom;
    const top = (-viewport.y - buffer) / viewport.zoom;
    const bottom = (containerHeight - viewport.y + buffer) / viewport.zoom;
    
    return { left, right, top, bottom };
  }, [viewport.x, viewport.y, viewport.zoom, containerWidth, containerHeight, buffer]);

  // Filter panels that are visible in current viewport
  const visiblePanels = useMemo(() => {
    return panels.filter(panel => {
      // Panel bounds
      const panelLeft = panel.x;
      const panelRight = panel.x + panel.width;
      const panelTop = panel.y;
      const panelBottom = panel.y + panel.height;
      
      // Check if panel intersects with viewport bounds
      return !(panelRight < viewportBounds.left || 
               panelLeft > viewportBounds.right ||
               panelBottom < viewportBounds.top ||
               panelTop > viewportBounds.bottom);
    });
  }, [panels, viewportBounds]);

  // Get panels sorted by z-index for rendering order
  const sortedVisiblePanels = useMemo(() => {
    return [...visiblePanels].sort((a, b) => (a.zIndex || 0) - (b.zIndex || 0));
  }, [visiblePanels]);

  // Helper to check if a specific panel is visible
  const isPanelVisible = useCallback((panelId: string) => {
    return visiblePanels.some(panel => panel.id === panelId);
  }, [visiblePanels]);

  // Get panels by type for optimization
  const panelsByType = useMemo(() => {
    return visiblePanels.reduce((acc, panel) => {
      if (!acc[panel.type]) {
        acc[panel.type] = [];
      }
      acc[panel.type].push(panel);
      return acc;
    }, {} as Record<string, Panel[]>);
  }, [visiblePanels]);

  return {
    visiblePanels,
    sortedVisiblePanels,
    viewportBounds,
    isPanelVisible,
    panelsByType,
    visibleCount: visiblePanels.length
  };
};

export const usePanelInteractions = (
  panels: Panel[],
  selectedPanelId: string | null,
  panelInteractionOrder: string[]
) => {
  // Get selected panel data
  const selectedPanel = useMemo(() => {
    return panels.find(panel => panel.id === selectedPanelId) || null;
  }, [panels, selectedPanelId]);

  // Get panels sorted by interaction order (most recently interacted first)
  const sortedByInteraction = useMemo(() => {
    return [...panels].sort((a, b) => {
      const aIndex = panelInteractionOrder.indexOf(a.id);
      const bIndex = panelInteractionOrder.indexOf(b.id);
      
      // Panels not in interaction order go to the end
      if (aIndex === -1 && bIndex === -1) return 0;
      if (aIndex === -1) return 1;
      if (bIndex === -1) return -1;
      
      // Higher index (more recent) comes first
      return bIndex - aIndex;
    });
  }, [panels, panelInteractionOrder]);

  // Get panel at specific position (for click detection)
  const getPanelAtPosition = useCallback((x: number, y: number) => {
    // Search in reverse z-index order (topmost first)
    const sortedPanels = [...panels].sort((a, b) => (b.zIndex || 0) - (a.zIndex || 0));
    
    return sortedPanels.find(panel => 
      isPointInRect(x, y, panel.x, panel.y, panel.width, panel.height)
    ) || null;
  }, [panels]);

  return {
    selectedPanel,
    sortedByInteraction,
    getPanelAtPosition
  };
};