// Global type declarations
declare global {
  interface Window {
    snapDebounceTimeout?: NodeJS.Timeout;
  }
}

// Enhanced type definitions
export interface CanvasViewport {
  x: number;
  y: number;
  zoom: number;
}

export interface PanelData {
  id: string;
  name?: string;
  dataset_id?: string;
  original_filename?: string;
  rows_clean?: number;
  cols_clean?: number;
  [key: string]: any;
}

export interface Panel {
  id: string;
  type: 'dataset' | 'graph' | 'model' | 'model-results' | 'model-visualization' | 'manipulation' | 'data-editor' | 'merge';
  x: number;
  y: number;
  width: number;
  height: number;
  data: PanelData;
  parentId?: string;
  customName?: string;
  folderId?: string;
  isExpanded?: boolean;
  zIndex?: number;
  lastInteraction?: number;
  locked?: boolean; // when true, panel cannot be moved
}

export interface Folder {
  id: string;
  name: string;
  isExpanded: boolean;
  color?: string;
  panelIds?: string[]; // Optional for backward compatibility
}

export interface Connection {
  id: string;
  fromPanelId: string;
  toPanelId: string;
  type: 'data-flow' | 'derived-from';
}

export interface SnapTarget {
  id: string;
  panelId: string; // reference panel id
  x: number; // proposed snapped x
  y: number; // proposed snapped y
  distance: number; // activation distance (screen px)
  side: 'top' | 'bottom' | 'left' | 'right' | 'align-x-center' | 'align-y-center' | 'align-left' | 'align-right' | 'align-top' | 'align-bottom';
  kind?: 'adjacent' | 'align';
  draggedRect?: { x: number; y: number; width: number; height: number };
}

// Comprehensive state interface
export interface CanvasState {
  // Core canvas state
  viewport: CanvasViewport;
  panels: Panel[];
  connections: Connection[];
  folders: Folder[];

  // UI state
  selectedPanelId: string | null;
  visiblePanels: Set<string>;
  highlightedPanelId: string | null;
  isLayersPanelCollapsed: boolean;

  // Interaction state
  isDragging: boolean;
  draggedPanel: string | null;
  dragOffset: { x: number; y: number };
  dragStartTime: number;
  dragStartPos: { x: number; y: number };
  isDragMode: boolean;

  // Snapping state
  snapTargets: SnapTarget[];
  isSnapping: boolean;
  snapTargetId: string | null;
  snapPreview: { x: number; y: number } | null;

  // Context menu state
  showContextMenu: boolean;
  contextMenuPos: { x: number; y: number };

  // Upload dialog state
  showUploadDialog: boolean;
  uploadPosition: { x: number; y: number };

  // Z-index management
  panelInteractionOrder: string[];
  processedPanelIds: Set<string>;
}

// Action types for reducer
export type CanvasAction =
  | { type: 'SET_VIEWPORT'; payload: Partial<CanvasViewport> }
  | { type: 'ADD_PANEL'; payload: Omit<Panel, 'id'> }
  | { type: 'UPDATE_PANEL'; payload: { id: string; updates: Partial<Panel> } }
  | { type: 'UPDATE_PANEL_WITH_SIZE'; payload: { id: string; updates: Partial<Panel> } }
  | { type: 'REMOVE_PANEL'; payload: string }
  | { type: 'SET_PANELS'; payload: Panel[] }
  | { type: 'SET_CONNECTIONS'; payload: Connection[] }
  | { type: 'SET_FOLDERS'; payload: Folder[] }
  | { type: 'ADD_FOLDER'; payload: Folder }
  | { type: 'REMOVE_FOLDER'; payload: string }
  | { type: 'UPDATE_FOLDER'; payload: { id: string; updates: Partial<Folder> } }
  | { type: 'SET_SELECTED_PANEL'; payload: string | null }
  | { type: 'SET_VISIBLE_PANELS'; payload: Set<string> }
  | { type: 'TOGGLE_PANEL_VISIBILITY'; payload: string }
  | { type: 'SET_HIGHLIGHTED_PANEL'; payload: string | null }
  | { type: 'SET_PROCESSED_PANEL_IDS'; payload: Set<string> }
  | { type: 'TOGGLE_LAYERS_PANEL' }
  | { type: 'SET_DRAGGING_STATE'; payload: { isDragging: boolean; draggedPanel?: string | null; dragOffset?: { x: number; y: number }; dragStartTime?: number; dragStartPos?: { x: number; y: number }; isDragMode?: boolean } }
  | { type: 'STOP_DRAGGING' }
  | { type: 'SET_SNAP_TARGETS'; payload: SnapTarget[] }
  | { type: 'SET_SNAPPING_STATE'; payload: { isSnapping: boolean; snapTargetId?: string | null; snapPreview?: { x: number; y: number } | null } }
  | { type: 'CLEAR_SNAPPING' }
  | { type: 'SET_CONTEXT_MENU'; payload: { show: boolean; position?: { x: number; y: number } } }
  | { type: 'SET_UPLOAD_DIALOG'; payload: { show: boolean; position?: { x: number; y: number } } }
  | { type: 'BRING_PANEL_TO_FRONT'; payload: string }
  | { type: 'LOAD_WORKSPACE'; payload: Partial<CanvasState> }
  | { type: 'CLEAR_WORKSPACE' }
  | { type: 'SET_PANEL_INTERACTION_ORDER'; payload: string[] };