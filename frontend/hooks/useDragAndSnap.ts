import { useCallback, useMemo } from 'react';
import { Panel, SnapTarget, CanvasState } from '../utils/canvas/types';
import { calculateSnapTargets, getSnapPosition } from '../utils/canvas/snapUtils';
import { 
  SNAP_ACTIVATE_PX, 
  SNAP_SWITCH_PX, 
  SNAP_HYSTERESIS_PX, 
  DISCONNECT_DISTANCE_PX 
} from '../utils/canvas/constants';

export const useSnapBehavior = (
  draggedPanel: string | null,
  panels: Panel[],
  viewport: { zoom: number },
  snapTargets: SnapTarget[],
  isSnapping: boolean,
  snapTargetId: string | null
) => {
  const calculateSnaps = useCallback((newX: number, newY: number) => {
    if (!draggedPanel) return [];
    
    const draggedPanelData = panels.find(p => p.id === draggedPanel);
    if (!draggedPanelData) return [];
    
    return calculateSnapTargets(draggedPanelData, panels, newX, newY, viewport.zoom);
  }, [draggedPanel, panels, viewport.zoom]);

  const findBestSnapTarget = useCallback((targets: SnapTarget[]) => {
    if (!targets.length) return null;
    
    // If currently snapping, check if we should disconnect or switch
    if (isSnapping && snapTargetId) {
      const currentActive = targets.find(t => t.id === snapTargetId);
      
      if (currentActive) {
        // Check if we should disconnect (hysteresis)
        if (currentActive.distance > SNAP_HYSTERESIS_PX) {
          return null; // Disconnect
        }
        
        // Check if there's a closer target we should switch to
        const closest = targets.reduce((a, b) => (b.distance < a.distance ? b : a));
        if (closest.id !== snapTargetId && closest.distance < SNAP_SWITCH_PX) {
          return closest; // Switch to closer target
        }
        
        return currentActive; // Keep current snap
      }
    }
    
    // Find closest target within activation range
    const withinActivation = targets.filter(t => t.distance <= SNAP_ACTIVATE_PX);
    if (!withinActivation.length) return null;
    
    return withinActivation.reduce((a, b) => (b.distance < a.distance ? b : a));
  }, [isSnapping, snapTargetId]);

  const getSnapPosition = useCallback((panel: Panel, target: SnapTarget) => {
    return getSnapPosition(panel, target);
  }, []);

  return {
    calculateSnaps,
    findBestSnapTarget,
    getSnapPosition
  };
};

export const useDragBehavior = () => {
  const shouldEnterDragMode = useCallback((
    distance: number, 
    timeDiff: number, 
    distanceThreshold = 3, 
    timeThreshold = 150
  ) => {
    return distance > distanceThreshold || timeDiff > timeThreshold;
  }, []);

  const calculateDragDistance = useCallback((
    startX: number, 
    startY: number, 
    currentX: number, 
    currentY: number
  ) => {
    const distanceX = Math.abs(currentX - startX);
    const distanceY = Math.abs(currentY - startY);
    return Math.sqrt(distanceX * distanceX + distanceY * distanceY);
  }, []);

  const shouldDisconnectFromSnap = useCallback((
    snapX: number, 
    snapY: number, 
    currentX: number, 
    currentY: number
  ) => {
    const distance = Math.hypot(currentX - snapX, currentY - snapY);
    return distance > DISCONNECT_DISTANCE_PX;
  }, []);

  return {
    shouldEnterDragMode,
    calculateDragDistance,
    shouldDisconnectFromSnap
  };
};