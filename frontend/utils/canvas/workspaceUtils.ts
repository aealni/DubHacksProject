import { CanvasState } from './types';

export interface WorkspaceState {
  viewport: { x: number; y: number; zoom: number };
  panels: any[];
  connections: any[];
  folders: any[];
  selectedPanelId: string | null;
  visiblePanels: string[];
  processedPanelIds: string[];
  panelInteractionOrder: string[];
  isLayersPanelCollapsed: boolean;
  timestamp: number;
}

export const saveWorkspace = (state: CanvasState) => {
  const workspaceState: WorkspaceState = {
    viewport: state.viewport,
    panels: state.panels,
    connections: state.connections,
    folders: state.folders,
    selectedPanelId: state.selectedPanelId,
    visiblePanels: Array.from(state.visiblePanels),
    processedPanelIds: Array.from(state.processedPanelIds),
    panelInteractionOrder: state.panelInteractionOrder,
    isLayersPanelCollapsed: state.isLayersPanelCollapsed,
    timestamp: Date.now()
  };
  
  try {
    localStorage.setItem('infinite-canvas-workspace', JSON.stringify(workspaceState));
    return true;
  } catch (error) {
    console.error('Failed to save workspace:', error);
    return false;
  }
};

export const loadWorkspace = (): Partial<CanvasState> | null => {
  try {
    const saved = localStorage.getItem('infinite-canvas-workspace');
    if (!saved) return null;
    
    const workspaceState = JSON.parse(saved) as WorkspaceState;
    
    return {
      viewport: workspaceState.viewport || { x: 0, y: 0, zoom: 1 },
      panels: workspaceState.panels || [],
      connections: workspaceState.connections || [],
      folders: workspaceState.folders || [],
      selectedPanelId: workspaceState.selectedPanelId || null,
      visiblePanels: new Set(workspaceState.visiblePanels || []),
      processedPanelIds: new Set(workspaceState.processedPanelIds || []),
      panelInteractionOrder: workspaceState.panelInteractionOrder || [],
      isLayersPanelCollapsed: workspaceState.isLayersPanelCollapsed ?? false
    };
  } catch (error) {
    console.error('Failed to load workspace:', error);
    return null;
  }
};

export const clearWorkspace = () => {
  try {
    localStorage.removeItem('infinite-canvas-workspace');
    return true;
  } catch (error) {
    console.error('Failed to clear workspace:', error);
    return false;
  }
};