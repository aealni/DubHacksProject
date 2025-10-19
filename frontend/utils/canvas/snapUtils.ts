import { Panel, SnapTarget } from './types';
import { SNAP_DETECT_PX } from './constants';

// Check if a panel position would overlap with existing panels
export const checkSnapCollision = (
  snapX: number, 
  snapY: number, 
  panelWidth: number, 
  panelHeight: number, 
  allPanels: Panel[], 
  excludePanelId: string
): boolean => {
  const snapRect = {
    left: snapX,
    right: snapX + panelWidth,
    top: snapY,
    bottom: snapY + panelHeight
  };

  // Add small buffer to prevent panels from being too close
  const COLLISION_BUFFER = 10;

  return allPanels.some(panel => {
    if (panel.id === excludePanelId) return false;
    
    const panelRect = {
      left: panel.x - COLLISION_BUFFER,
      right: panel.x + panel.width + COLLISION_BUFFER,
      top: panel.y - COLLISION_BUFFER,
      bottom: panel.y + panel.height + COLLISION_BUFFER
    };

    // Check for overlap
    return !(snapRect.right <= panelRect.left || 
             snapRect.left >= panelRect.right || 
             snapRect.bottom <= panelRect.top || 
             snapRect.top >= panelRect.bottom);
  });
};

// Advanced snap reasoning - determines if a snap makes logical sense
export const isSnapReasonable = (
  draggedPanel: Panel,
  targetPanel: Panel,
  snapX: number,
  snapY: number,
  side: 'top' | 'bottom' | 'left' | 'right',
  allPanels: Panel[]
): boolean => {
  // Candidate (snapped) rectangle & center
  const candidateRect = {
    left: snapX,
    right: snapX + draggedPanel.width,
    top: snapY,
    bottom: snapY + draggedPanel.height
  };
  const candidateCenter = {
    x: snapX + draggedPanel.width / 2,
    y: snapY + draggedPanel.height / 2
  };
  const targetCenter = {
    x: targetPanel.x + targetPanel.width / 2,
    y: targetPanel.y + targetPanel.height / 2
  };

  // 1. Collision at candidate position
  if (checkSnapCollision(snapX, snapY, draggedPanel.width, draggedPanel.height, allPanels, draggedPanel.id)) return false;

  // 2. Reasonable proximity based on candidate (allow a bit more for large layouts)
  const MAX_REASONABLE_DISTANCE = 500;
  const centerDistance = Math.hypot(candidateCenter.x - targetCenter.x, candidateCenter.y - targetCenter.y);
  if (centerDistance > MAX_REASONABLE_DISTANCE) return false;

  const targetRect = {
    left: targetPanel.x,
    right: targetPanel.x + targetPanel.width,
    top: targetPanel.y,
    bottom: targetPanel.y + targetPanel.height
  };

  // 3. Alignment overlap using candidate (reduced requirement to 10%)
  if (side === 'top' || side === 'bottom') {
    const horizontalOverlap = Math.min(candidateRect.right, targetRect.right) - Math.max(candidateRect.left, targetRect.left);
    const minOverlapRequired = Math.min(draggedPanel.width, targetPanel.width) * 0.1;
    if (horizontalOverlap < minOverlapRequired) return false;
  } else { // left/right
    const verticalOverlap = Math.min(candidateRect.bottom, targetRect.bottom) - Math.max(candidateRect.top, targetRect.top);
    const minOverlapRequired = Math.min(draggedPanel.height, targetPanel.height) * 0.1;
    if (verticalOverlap < minOverlapRequired) return false;
  }

  // 4. Intermediate obstruction check between target and candidate
  const hasIntermediatePanel = allPanels.some(panel => {
    if (panel.id === draggedPanel.id || panel.id === targetPanel.id) return false;
    const panelRect = { left: panel.x, right: panel.x + panel.width, top: panel.y, bottom: panel.y + panel.height };
    if (side === 'top' || side === 'bottom') {
      const spansHoriz = panelRect.left < Math.max(targetRect.right, candidateRect.right) && panelRect.right > Math.min(targetRect.left, candidateRect.left);
      if (!spansHoriz) return false;
      if (side === 'top') {
        return panelRect.top < targetRect.top && panelRect.bottom > candidateRect.bottom; // blocks vertical corridor
      }
      return panelRect.bottom > targetRect.bottom && panelRect.top < candidateRect.top;
    } else { // left/right
      const spansVert = panelRect.top < Math.max(targetRect.bottom, candidateRect.bottom) && panelRect.bottom > Math.min(targetRect.top, candidateRect.top);
      if (!spansVert) return false;
      if (side === 'left') {
        return panelRect.left < targetRect.left && panelRect.right > candidateRect.right;
      }
      return panelRect.right > targetRect.right && panelRect.left < candidateRect.left;
    }
  });
  if (hasIntermediatePanel) return false;

  return true;
};

// Snapping utility functions
// We measure raw gap distance in canvas units, then derive screenDistance = rawGap * zoomLevel for threshold comparisons.
export const calculateSnapTargets = (draggedPanel: Panel, allPanels: Panel[], newX: number, newY: number, zoomLevel: number = 1): SnapTarget[] => {
  const targets: SnapTarget[] = [];
  const draggedRect = {
    left: newX,
    right: newX + draggedPanel.width,
    top: newY,
    bottom: newY + draggedPanel.height,
    centerX: newX + draggedPanel.width / 2,
    centerY: newY + draggedPanel.height / 2
  };

  // Panel spacing for clean alignment
  const PANEL_SPACING = 40;

  allPanels.forEach(panel => {
    if (panel.id === draggedPanel.id) return;

    const panelRect = {
      left: panel.x,
      right: panel.x + panel.width,
      top: panel.y,
      bottom: panel.y + panel.height,
      centerX: panel.x + panel.width / 2,
      centerY: panel.y + panel.height / 2
    };

    // Calculate potential snap positions and their distances from current position
    const snapPositions = [
      // Snap to top of target panel (draggedPanel goes above)
      {
        side: 'top' as const,
        snapX: panelRect.centerX - draggedPanel.width / 2,
        snapY: panelRect.top - draggedPanel.height - PANEL_SPACING,
        // Distance from current position to snap position
        distance: Math.hypot(
          (panelRect.centerX - draggedPanel.width / 2) - draggedRect.left,
          (panelRect.top - draggedPanel.height - PANEL_SPACING) - draggedRect.top
        )
      },
      // Snap to bottom of target panel (draggedPanel goes below)
      {
        side: 'bottom' as const,
        snapX: panelRect.centerX - draggedPanel.width / 2,
        snapY: panelRect.bottom + PANEL_SPACING,
        distance: Math.hypot(
          (panelRect.centerX - draggedPanel.width / 2) - draggedRect.left,
          (panelRect.bottom + PANEL_SPACING) - draggedRect.top
        )
      },
      // Snap to left of target panel (draggedPanel goes to the left)
      {
        side: 'left' as const,
        snapX: panelRect.left - draggedPanel.width - PANEL_SPACING,
        snapY: panelRect.centerY - draggedPanel.height / 2,
        distance: Math.hypot(
          (panelRect.left - draggedPanel.width - PANEL_SPACING) - draggedRect.left,
          (panelRect.centerY - draggedPanel.height / 2) - draggedRect.top
        )
      },
      // Snap to right of target panel (draggedPanel goes to the right)
      {
        side: 'right' as const,
        snapX: panelRect.right + PANEL_SPACING,
        snapY: panelRect.centerY - draggedPanel.height / 2,
        distance: Math.hypot(
          (panelRect.right + PANEL_SPACING) - draggedRect.left,
          (panelRect.centerY - draggedPanel.height / 2) - draggedRect.top
        )
      }
    ];

    // Add snap targets that are within detection range
    snapPositions.forEach(({ side, snapX, snapY, distance }) => {
      const screenDistance = distance * zoomLevel;
      
      if (screenDistance <= SNAP_DETECT_PX) {
        // Use advanced reasoning to determine if this snap makes sense
        const isReasonable = isSnapReasonable(
          draggedPanel,
          panel,
          snapX,
          snapY,
          side,
          allPanels
        );

        // Only add snap target if it makes logical sense
        if (isReasonable) {
          targets.push({
            id: `${panel.id}-${side}`,
            panelId: panel.id,
            x: snapX,
            y: snapY,
            distance: screenDistance, // distance from current position to snap position
            side: side,
            draggedRect: {
              x: newX,
              y: newY,
              width: draggedPanel.width,
              height: draggedPanel.height
            }
          });
        }
      }
    });
  });

  return targets;
};

export const getSnapPosition = (draggedPanel: Panel, snapTarget: SnapTarget): { x: number; y: number } => {
  // The snap target already contains the calculated position
  return { x: snapTarget.x, y: snapTarget.y };
};