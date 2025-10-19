import { CanvasState, CanvasAction, Panel } from './types';

export const createInitialState = (): CanvasState => ({
  viewport: { x: 100, y: 100, zoom: 1 },
  panels: [],
  connections: [],
  folders: [],
  selectedPanelId: null,
  visiblePanels: new Set(),
  highlightedPanelId: null,
  isLayersPanelCollapsed: false,
  isDragging: false,
  draggedPanel: null,
  dragOffset: { x: 0, y: 0 },
  dragStartTime: 0,
  dragStartPos: { x: 0, y: 0 },
  isDragMode: false,
  snapTargets: [],
  isSnapping: false,
  snapTargetId: null,
  snapPreview: null,
  showContextMenu: false,
  contextMenuPos: { x: 0, y: 0 },
  showUploadDialog: false,
  uploadPosition: { x: 0, y: 0 },
  panelInteractionOrder: [],
  processedPanelIds: new Set()
});

// Keep the old export for backward compatibility
export const initialState: CanvasState = createInitialState();

export function canvasReducer(state: CanvasState, action: CanvasAction): CanvasState {
  switch (action.type) {
    case 'SET_VIEWPORT':
      return { ...state, viewport: { ...state.viewport, ...action.payload } };

    case 'ADD_PANEL':
      const newPanel: Panel = {
        ...action.payload,
        id: `panel-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        zIndex: state.panels.length + 1,
        lastInteraction: Date.now()
      };
      return {
        ...state,
        panels: [...state.panels, newPanel],
        visiblePanels: new Set([...Array.from(state.visiblePanels), newPanel.id]),
        processedPanelIds: new Set([...Array.from(state.processedPanelIds), newPanel.id])
      };

    case 'UPDATE_PANEL':
      return {
        ...state,
        panels: state.panels.map(panel =>
          panel.id === action.payload.id
            ? { ...panel, ...action.payload.updates, lastInteraction: Date.now() }
            : panel
        )
      };

    case 'UPDATE_PANEL_WITH_SIZE':
      return {
        ...state,
        panels: state.panels.map(panel =>
          panel.id === action.payload.id
            ? { ...panel, ...action.payload.updates, lastInteraction: Date.now() }
            : panel
        )
      };

    case 'REMOVE_PANEL':
      return {
        ...state,
        panels: state.panels.filter(panel => panel.id !== action.payload),
        visiblePanels: new Set([...Array.from(state.visiblePanels)].filter(id => id !== action.payload)),
        selectedPanelId: state.selectedPanelId === action.payload ? null : state.selectedPanelId,
        panelInteractionOrder: state.panelInteractionOrder.filter(id => id !== action.payload)
      };

    case 'SET_PANELS':
      return { ...state, panels: action.payload };

    case 'SET_CONNECTIONS':
      return { ...state, connections: action.payload };

    case 'SET_FOLDERS':
      return { ...state, folders: action.payload };

    case 'ADD_FOLDER':
      return { ...state, folders: [...state.folders, action.payload] };

    case 'REMOVE_FOLDER':
      return { ...state, folders: state.folders.filter(folder => folder.id !== action.payload) };

    case 'UPDATE_FOLDER':
      return {
        ...state,
        folders: state.folders.map(folder =>
          folder.id === action.payload.id
            ? { ...folder, ...action.payload.updates }
            : folder
        )
      };

    case 'SET_SELECTED_PANEL':
      return { ...state, selectedPanelId: action.payload };

    case 'SET_VISIBLE_PANELS':
      return { ...state, visiblePanels: action.payload };

    case 'TOGGLE_PANEL_VISIBILITY':
      const newVisiblePanels = new Set(state.visiblePanels);
      if (newVisiblePanels.has(action.payload)) {
        newVisiblePanels.delete(action.payload);
      } else {
        newVisiblePanels.add(action.payload);
      }
      return { ...state, visiblePanels: newVisiblePanels };

    case 'SET_HIGHLIGHTED_PANEL':
      return { ...state, highlightedPanelId: action.payload };

    case 'SET_PROCESSED_PANEL_IDS':
      return { ...state, processedPanelIds: action.payload };

    case 'TOGGLE_LAYERS_PANEL':
      return { ...state, isLayersPanelCollapsed: !state.isLayersPanelCollapsed };

    case 'SET_DRAGGING_STATE':
      return {
        ...state,
        isDragging: action.payload.isDragging,
        draggedPanel: action.payload.draggedPanel ?? state.draggedPanel,
        dragOffset: action.payload.dragOffset ?? state.dragOffset,
        dragStartTime: action.payload.dragStartTime ?? state.dragStartTime,
        dragStartPos: action.payload.dragStartPos ?? state.dragStartPos,
        isDragMode: action.payload.isDragMode ?? state.isDragMode
      };

    case 'STOP_DRAGGING':
      return {
        ...state,
        isDragging: false,
        draggedPanel: null,
        dragOffset: { x: 0, y: 0 },
        dragStartTime: 0,
        dragStartPos: { x: 0, y: 0 },
        isDragMode: false,
        snapTargets: [],
        isSnapping: false,
        snapTargetId: null,
        snapPreview: null
      };

    case 'SET_SNAP_TARGETS':
      return { ...state, snapTargets: action.payload };

    case 'SET_SNAPPING_STATE':
      return { 
        ...state, 
        isSnapping: action.payload.isSnapping,
        snapTargetId: action.payload.snapTargetId ?? state.snapTargetId,
        snapPreview: action.payload.snapPreview ?? state.snapPreview
      };

    case 'CLEAR_SNAPPING':
      return {
        ...state,
        snapTargets: [],
        isSnapping: false,
        snapTargetId: null,
        snapPreview: null
      };

    case 'SET_CONTEXT_MENU':
      return {
        ...state,
        showContextMenu: action.payload.show,
        contextMenuPos: action.payload.position || state.contextMenuPos
      };

    case 'SET_UPLOAD_DIALOG':
      return {
        ...state,
        showUploadDialog: action.payload.show,
        uploadPosition: action.payload.position || state.uploadPosition
      };

    case 'BRING_PANEL_TO_FRONT':
      const updatedOrder = [...state.panelInteractionOrder.filter(id => id !== action.payload), action.payload];
      return {
        ...state,
        panelInteractionOrder: updatedOrder,
        panels: state.panels.map(panel =>
          panel.id === action.payload
            ? { ...panel, zIndex: Math.max(...state.panels.map(p => p.zIndex || 0)) + 1, lastInteraction: Date.now() }
            : panel
        )
      };

    case 'LOAD_WORKSPACE':
      return {
        ...state,
        ...action.payload,
        visiblePanels: new Set(action.payload.visiblePanels || []),
        processedPanelIds: new Set(action.payload.processedPanelIds || [])
      };

    case 'CLEAR_WORKSPACE':
      return {
        ...createInitialState(),
        viewport: { x: 100, y: 100, zoom: 1 }, // Keep a reasonable starting position
        visiblePanels: new Set(),
        processedPanelIds: new Set()
      };

    case 'SET_PANEL_INTERACTION_ORDER':
      return { ...state, panelInteractionOrder: action.payload };

    default:
      return state;
  }
}