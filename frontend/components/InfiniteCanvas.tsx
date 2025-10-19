import { createPortal } from 'react-dom';
import React, { useRef, useEffect, useCallback, useReducer, useMemo, useState } from 'react';
import { useRouter } from 'next/router';
import { Lock, Unlock, Eye, EyeOff } from 'lucide-react';
import { DatasetPanel } from './DatasetPanel';
import { GraphPanel } from './GraphPanel';
import { ModelPanel } from './ModelPanel';
import { DataManipulationPanel } from './DataManipulationPanel';
import { DataEditorPanel } from './DataEditorPanel';
import MergePanel from './MergePanel';
import { UploadDialog } from './UploadDialog';
import ModelResultsPanel from './ModelResultsPanel';
import ModelVisualizationPanel from './ModelVisualizationPanel';
import LayersPanel from './LayersPanel';
import FeatureBar, { CanvasTool } from './FeatureBar';
import { useTabsStore } from '../stores/tabsStore';

// Import extracted utilities
import { 
  CanvasState, 
  CanvasAction, 
  Panel, 
  Folder, 
  Connection, 
  SnapTarget,
  CanvasViewport,
  PanelData
} from '../utils/canvas/types';
import { canvasReducer, createInitialState } from '../utils/canvas/canvasReducer';
import { 
  calculateSnapTargets, 
  getSnapPosition, 
  checkSnapCollision 
} from '../utils/canvas/snapUtils';
import { 
  GRID_SIZE, 
  MIN_ZOOM, 
  MAX_ZOOM, 
  SNAP_DETECT_PX, 
  SNAP_ACTIVATE_PX,
  SNAP_SWITCH_PX,
  SNAP_HYSTERESIS_PX,
  DISCONNECT_DISTANCE_PX,
  ALIGN_THRESHOLD_PX,
  DEBUG_SNAP
} from '../utils/canvas/constants';
import { PANEL_SIZES } from '../utils/canvas/panelSizes';

interface InfiniteCanvasProps {
  storageKey?: string;
}

export const InfiniteCanvas: React.FC<InfiniteCanvasProps> = ({ 
  storageKey = 'infinite-canvas-workspace' 
}) => {
  /**
   * Persistence Model Overview
   * --------------------------------------------------
   * Each open canvas (e.g., each tab) uses a unique localStorage key (storageKey prop).
   * We persist the following pieces of state: viewport, panels, connections, folders,
   * selection, visibility, interaction order, processed panels, and collapse state.
   *
   * Triggers:
   *  - Debounced (600ms) save on any structural/content state change
   *  - Interval autosave every 30s (legacy safety net)
   *  - Immediate save on window beforeunload
   *  - Immediate save on component unmount (before clearing in-memory state)
   *
   * This ensures that rapid tab switching behaves like Google Sheets sheet switching:
   * data for each canvas is preserved and restored seamlessly without clearing.
   */
  const router = useRouter();
  const canvasRef = useRef<HTMLDivElement>(null);
  const marqueeRef = useRef<HTMLDivElement | null>(null);
  const [currentTool, setCurrentTool] = useState<CanvasTool>('select');
  const [isMarqueeSelecting, setIsMarqueeSelecting] = useState(false);
  const marqueeStart = useRef<{x:number;y:number}>();
  const pendingMarquee = useRef<{x:number;y:number}|null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const groupDragOrigin = useRef<{ baseX:number;baseY:number; offsets:{id:string;dx:number;dy:number;}[] } | null>(null);
  const groupDragFrame = useRef<number | null>(null);
  const pendingGroupDelta = useRef<{dx:number;dy:number} | null>(null);
  const snapDebounceTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Plus menu state
  const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:8000';
  const [openMenu, setOpenMenu] = useState(false);
  // Hover state for showing the menu only while hovering plus or menu
  const [isHovering, setIsHovering] = useState(false);
  const hoverTimeoutRef = useRef<number | null>(null);
  const plusButtonRef = useRef<HTMLButtonElement | null>(null);
  const [menuPos, setMenuPos] = useState<{ left: number; top: number } | null>(null);
  const [menuPersistent, setMenuPersistent] = useState(false);
  // Suppress the next document click when we open the menu so the opening click
  // doesn't immediately bubble to the document handler and close the menu.
  const suppressNextDocumentClickRef = useRef(false);
  
  const [showChooser, setShowChooser] = useState(false);
  const [datasets, setDatasets] = useState<any[]>([]);
  const [loadingDatasets, setLoadingDatasets] = useState(false);
  const [query, setQuery] = useState('');

  console.log(`InfiniteCanvas mounting with storageKey: ${storageKey}`);

  // Debug openMenu changes to help diagnose why menu might not appear
  useEffect(() => {
    console.log('[InfiniteCanvas] openMenu state changed', openMenu);
  }, [openMenu]);

  // When the menu opens, inspect its DOM to understand visibility/positioning
  useEffect(() => {
    if (!openMenu) return;
    const el = document.getElementById('infinite-plus-menu');
    if (!el) {
      console.log('[InfiniteCanvas] menu element not found in DOM');
      return;
    }
    const rect = el.getBoundingClientRect();
    const style = window.getComputedStyle(el);
    console.log('[InfiniteCanvas] menu DOM rect', rect);
    console.log('[InfiniteCanvas] menu computed style', {
      display: style.display,
      visibility: style.visibility,
      opacity: style.opacity,
      zIndex: style.zIndex,
      pointerEvents: style.pointerEvents
    });
  }, [openMenu]);

  // Recompute menu position when hovering begins or plus ref changes
  useEffect(() => {
    if (!isHovering) return;
    if (!plusButtonRef.current) return;
    const rect = plusButtonRef.current.getBoundingClientRect();
    // If the plus button appears to be outside the viewport (e.g. because
    // it's inside a transformed ancestor with large translations), don't
  // use the computed absolute coords - fall back to bottom-right placement.
    const inViewport = rect.left >= 0 && rect.top >= 0 && rect.left <= window.innerWidth && rect.top <= window.innerHeight;
    if (!inViewport) {
      setMenuPos(null);
      return;
    }
    // Position menu centered horizontally above the plus button
    const left = rect.left + rect.width / 2 - 96; // menu width ~192px (w-48)
    const top = rect.top - 8 - 54; // small gap + menu height (~54)
    setMenuPos({ left: Math.max(8, left), top: Math.max(8, top) });
  }, [isHovering]);

  // Listen for global requests to open the unified plus menu (dispatched from BottomTabs)
  useEffect(() => {
    const handler = (ev: Event) => {
      try {
        console.log('[InfiniteCanvas] received open-plus-menu event', ev);
        // If the event is cancelable, calling preventDefault() will cause
        // window.dispatchEvent to return false for the dispatcher. Use this
        // as a signal that the event was handled so callers don't fall back
        // to creating a new canvas immediately.
        if ((ev as any).cancelable) {
          try { ev.preventDefault(); } catch (_) {}
        }
        // Suppress the immediate next document click (the same click that dispatched the event)
        suppressNextDocumentClickRef.current = true;
        setOpenMenu(true);
        setIsHovering(true);
        setMenuPersistent(true);
        if (hoverTimeoutRef.current) {
          window.clearTimeout(hoverTimeoutRef.current as any);
          hoverTimeoutRef.current = null;
        }
        // Debug: after next paint, check that the menu DOM was created and where the plus button is
        setTimeout(() => {
          try {
            const plusRect = plusButtonRef.current ? plusButtonRef.current.getBoundingClientRect() : null;
            const menuEl = document.getElementById('infinite-plus-menu');
            const menuRect = menuEl ? menuEl.getBoundingClientRect() : null;
            const menuStyle = menuEl ? window.getComputedStyle(menuEl) : null;
            console.log('[InfiniteCanvas][DEBUG after open] plusRect:', plusRect, 'menuEl:', menuEl, 'menuRect:', menuRect, 'menuStyle:', menuStyle && { display: menuStyle.display, visibility: menuStyle.visibility, opacity: menuStyle.opacity, pointerEvents: menuStyle.pointerEvents, zIndex: menuStyle.zIndex });
          } catch (err) {
            console.error('[InfiniteCanvas][DEBUG after open] error checking menu DOM', err);
          }
        }, 50);
      } catch (err) {
        console.error('[InfiniteCanvas] error handling open-plus-menu', err);
      }
    };
    window.addEventListener('open-plus-menu', handler as EventListener);
    return () => window.removeEventListener('open-plus-menu', handler as EventListener);
  }, []);

  // Consolidated state management with useReducer - create unique initial state per instance
  const initialState = useMemo(() => createInitialState(), []);
  const [state, dispatch] = useReducer(canvasReducer, initialState);
  const panelsRef = useRef<Panel[]>(state.panels);
  // Instrumentation refs
  const lastPanelsRef = useRef<string[]>([]);
  const hasEverSavedRef = useRef(false);
  const lastNonEmptySnapshotRef = useRef<any | null>(null);

  // Extract commonly used state for easier access
  const {
    viewport,
    panels,
    connections,
    folders,
    selectedPanelId,
    visiblePanels,
    highlightedPanelId,
    isLayersPanelCollapsed,
    isDragging,
    draggedPanel,
    dragOffset,
    dragStartTime,
    dragStartPos,
    isDragMode,
    snapTargets,
    isSnapping,
    snapTargetId,
    snapPreview,
    showContextMenu,
    contextMenuPos,
    showUploadDialog,
    uploadPosition,
    panelInteractionOrder,
    processedPanelIds
  } = state;

  useEffect(() => {
    panelsRef.current = panels;
  }, [panels]);

  // Workspace persistence
  const saveWorkspace = useCallback(() => {
    // Guard: don't overwrite an existing non-empty snapshot with an empty one unless we've never saved
    const existingRaw = localStorage.getItem(storageKey);
    if (panels.length === 0 && existingRaw) {
      try {
        const existing = JSON.parse(existingRaw);
        if ((existing.panels?.length || 0) > 0) {
          console.log(`[Instrumentation] Skip save: preventing overwrite of non-empty snapshot (${existing.panels.length} panels) with empty state.`);
          return; // abort save
        }
      } catch { /* ignore parse errors */ }
    }
    console.log(`Saving workspace with storageKey: ${storageKey}, panels: ${panels.length}`);
    const workspaceState = {
      viewport,
      panels,
      connections,
      folders,
      selectedPanelId,
      visiblePanels: Array.from(visiblePanels),
      processedPanelIds: Array.from(processedPanelIds),
      panelInteractionOrder,
      isLayersPanelCollapsed,
      timestamp: Date.now()
    };
    if (panels.length > 0) {
      lastNonEmptySnapshotRef.current = workspaceState;
    }
    localStorage.setItem(storageKey, JSON.stringify(workspaceState));
    hasEverSavedRef.current = true;
    console.log(`Saved workspace data for ${storageKey}:`, { panelIds: panels.map(p=>p.id), count: panels.length });
  }, [viewport, panels, connections, folders, selectedPanelId, visiblePanels, processedPanelIds, panelInteractionOrder, isLayersPanelCollapsed, storageKey]);

  const loadWorkspace = useCallback(() => {
    try {
      console.log(`Loading workspace with storageKey: ${storageKey}`);
      const saved = localStorage.getItem(storageKey);
      if (saved) {
        const workspaceState = JSON.parse(saved);
        console.log(`Found saved data for ${storageKey}:`, workspaceState);
        dispatch({
          type: 'LOAD_WORKSPACE',
          payload: {
            viewport: workspaceState.viewport || { x: 0, y: 0, zoom: 1 },
            panels: workspaceState.panels || [],
            connections: workspaceState.connections || [],
            folders: workspaceState.folders || [],
            selectedPanelId: workspaceState.selectedPanelId || null,
            visiblePanels: new Set(workspaceState.visiblePanels || []),
            processedPanelIds: new Set(workspaceState.processedPanelIds || []),
            panelInteractionOrder: workspaceState.panelInteractionOrder || [],
            isLayersPanelCollapsed: workspaceState.isLayersPanelCollapsed || false
          }
        });
        console.log(`Loaded workspace for ${storageKey}, panels: ${workspaceState.panels?.length || 0}`);
        if ((workspaceState.panels?.length || 0) === 0) {
          console.log('[InfiniteCanvas] Loaded empty panel list; verify if this was intentional or a previous save occurred with no panels.');
        } else {
          console.log('[InfiniteCanvas] Panel IDs:', workspaceState.panels.map((p: any) => p.id));
        }
        return true;
      } else {
        console.log(`No saved data found for storageKey: ${storageKey}`);
      }
    } catch (error) {
      console.error('Failed to load workspace:', error);
    }
    return false;
  }, [storageKey]);

  const clearWorkspace = useCallback(() => {
    dispatch({ type: 'CLEAR_WORKSPACE' });
    localStorage.removeItem(storageKey);
  }, [storageKey]);

  // Dataset chooser functions
  const fetchDatasets = async () => {
    setLoadingDatasets(true);
    try {
      const res = await fetch(`${BACKEND_URL}/datasets?limit=200`);
      if (!res.ok) throw new Error('Failed to load datasets');
      const json = await res.json();
      const list = Array.isArray(json) ? json : (json.datasets ?? json.list ?? []);
      setDatasets(list);
    } catch (e) {
      setDatasets([]);
      console.error('Failed to fetch datasets', e);
    } finally { setLoadingDatasets(false); }
  };

  const onSelectDataset = (id: number | string) => {
    setShowChooser(false);
    // Prefer opening a centralized data tab (spreadsheet-like view) so DataTabProvider
    // can load and render the dataset. Fallback to route navigation if tab creation fails.
    try {
      const title = `Data ${id}`;
      const newTabId = useTabsStore.getState().createTab('data', title, { datasetId: String(id) });
      if (newTabId) {
        try { useTabsStore.getState().switchToTab(newTabId); } catch (e) { /* ignore */ }
      } else {
        // fallback route
        try { router.push(`/dataset/${id}/table`); } catch (e) { /* no-op */ }
      }
    } catch (e) {
      console.error('[InfiniteCanvas] failed to open data tab, falling back to route', e);
      try { router.push(`/dataset/${id}/table`); } catch (err) { /* no-op */ }
    }
  };

  useEffect(() => {
    if (showChooser) fetchDatasets();
  }, [showChooser]);

  // Auto-save workspace periodically
  useEffect(() => {
    const autoSaveInterval = setInterval(() => {
      if (panels.length > 0) {
        saveWorkspace();
      }
    }, 30000); // Auto-save every 30 seconds

    return () => clearInterval(autoSaveInterval);
  }, [panels, saveWorkspace]);

  // New: Debounced save on relevant state changes to avoid losing work when switching tabs quickly
  useEffect(() => {
    // We debounce frequent interactions (dragging panels, etc.) into a single save
    const debounce = setTimeout(() => {
      if (panels.length > 0) {
        saveWorkspace();
      }
    }, 600); // 600ms debounce after last change

    return () => clearTimeout(debounce);
  }, [panels, connections, folders, viewport.x, viewport.y, viewport.zoom, visiblePanels, processedPanelIds, panelInteractionOrder, isLayersPanelCollapsed, saveWorkspace]);

  // Panel diff instrumentation
  useEffect(() => {
    const prev = lastPanelsRef.current;
    const current = panels.map(p => p.id);
    if (prev.length || current.length) {
      const removed = prev.filter(id => !current.includes(id));
      const added = current.filter(id => !prev.includes(id));
      if (removed.length || added.length) {
        console.log('[Instrumentation] Panel diff', { storageKey, added, removed, newCount: current.length, prevCount: prev.length });
        if (prev.length > 0 && current.length === 0) {
          console.trace('[Instrumentation] Panels wiped (transition to zero). Trace above shows call stack.');
        }
      }
    }
    lastPanelsRef.current = current;
  }, [panels, storageKey]);

  // On mount, log existing localStorage size
  useEffect(() => {
    const raw = localStorage.getItem(storageKey);
    if (raw) {
      try {
        const parsed = JSON.parse(raw);
        console.log('[Instrumentation] Existing snapshot on mount', { storageKey, panelCount: parsed.panels?.length || 0, panelIds: parsed.panels?.map((p:any)=>p.id) });
      } catch (e) {
        console.warn('[Instrumentation] Failed to parse existing snapshot', e);
      }
    } else {
      console.log('[Instrumentation] No existing snapshot on mount', { storageKey });
    }
  }, [storageKey]);

  // Save before window unload (refresh/close)
  useEffect(() => {
    const handleBeforeUnload = () => {
      try {
        saveWorkspace();
      } catch (e) {
        // ignore
      }
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [saveWorkspace, panels.length]);

  // Z-index management functions
  const bringPanelToFront = useCallback((panelId: string) => {
    dispatch({ type: 'BRING_PANEL_TO_FRONT', payload: panelId });
  }, []);

  const getPanelZIndex = useCallback((panelId: string) => {
    const baseZIndex = 10;
    const orderIndex = panelInteractionOrder.indexOf(panelId);
    
    if (orderIndex === -1) {
      // Panel not in interaction order yet, use a low z-index
      return baseZIndex;
    }
    
    return baseZIndex + orderIndex;
  }, [panelInteractionOrder]);

  // Layer management functions
  const handlePanelSelect = useCallback((panelId: string) => {
    dispatch({ type: 'SET_SELECTED_PANEL', payload: panelId });
    dispatch({ type: 'SET_HIGHLIGHTED_PANEL', payload: panelId });
    bringPanelToFront(panelId);

    // Auto-focus on the selected panel by centering the viewport
    const panel = panels.find(p => p.id === panelId);
    if (panel) {
      // Calculate available canvas dimensions (subtract layers panel width)
      const layersPanelWidth = isLayersPanelCollapsed ? 48 : 320;
      const availableCanvasWidth = window.innerWidth - layersPanelWidth;
      const availableCanvasHeight = window.innerHeight;
      
      // Calculate the center point of the panel in world coordinates
      const panelCenterX = panel.x + panel.width / 2;
      const panelCenterY = panel.y + panel.height / 2;
      
      // Calculate the center point of the visible canvas area in screen coordinates
      const screenCenterX = availableCanvasWidth / 2;
      const screenCenterY = availableCanvasHeight / 2;
      
      // Calculate viewport offset to center the panel
      // The transform is: translate(viewport.x, viewport.y) scale(viewport.zoom)
      // We want: panelCenter * zoom + viewport = screenCenter
      // So: viewport = screenCenter - panelCenter * zoom
      const centerX = screenCenterX - (panelCenterX * viewport.zoom);
      const centerY = screenCenterY - (panelCenterY * viewport.zoom);

      dispatch({
        type: 'SET_VIEWPORT',
        payload: { x: centerX, y: centerY }
      });
    }

    // Clear highlight after 2 seconds
    setTimeout(() => {
      dispatch({ type: 'SET_HIGHLIGHTED_PANEL', payload: null });
    }, 2000);
  }, [panels, isLayersPanelCollapsed, bringPanelToFront, viewport.zoom]);

  const handlePanelVisibilityToggle = useCallback((panelId: string) => {
    dispatch({ type: 'TOGGLE_PANEL_VISIBILITY', payload: panelId });
  }, []);

  const handleLayersPanelToggle = useCallback(() => {
    dispatch({ type: 'TOGGLE_LAYERS_PANEL' });
  }, []);

  // Layer renaming and folder management functions
  const handlePanelRename = useCallback((panelId: string, newName: string) => {
    dispatch({
      type: 'UPDATE_PANEL',
      payload: {
        id: panelId,
        updates: { customName: newName.trim() || undefined }
      }
    });
  }, []);

  const handleCreateFolder = useCallback((name: string) => {
    const newFolder: Folder = {
      id: `folder-${Date.now()}`,
      name: name.trim(),
      isExpanded: true,
      color: `#${Math.floor(Math.random()*16777215).toString(16).padStart(6, '0')}`
    };
    dispatch({ type: 'ADD_FOLDER', payload: newFolder });
    return newFolder.id;
  }, []);

  const handleDeleteFolder = useCallback((folderId: string) => {
    // Remove all panels in the folder first
    const panelsToRemove = panels.filter(panel => panel.folderId === folderId);
    panelsToRemove.forEach(panel => {
      removePanel(panel.id);
    });

    // Then remove the folder itself
    dispatch({ type: 'REMOVE_FOLDER', payload: folderId });
  }, [panels]);

  const handleDeleteFolderOnly = useCallback((folderId: string) => {
    // Move panels out of the folder before deleting (original behavior)
    dispatch({
      type: 'SET_PANELS',
      payload: panels.map(panel =>
        panel.folderId === folderId
          ? { ...panel, folderId: undefined }
          : panel
      )
    });
    dispatch({ type: 'REMOVE_FOLDER', payload: folderId });
  }, [panels]);

  const handleRenameFolder = useCallback((folderId: string, newName: string) => {
    dispatch({
      type: 'UPDATE_FOLDER',
      payload: {
        id: folderId,
        updates: { name: newName.trim() }
      }
    });
  }, []);

  const handleToggleFolder = useCallback((folderId: string) => {
    dispatch({
      type: 'UPDATE_FOLDER',
      payload: {
        id: folderId,
        updates: { isExpanded: !folders.find(f => f.id === folderId)?.isExpanded }
      }
    });
  }, [folders]);

  const handleMovePanelToFolder = useCallback((panelId: string, folderId?: string) => {
    dispatch({
      type: 'UPDATE_PANEL',
      payload: {
        id: panelId,
        updates: { folderId }
      }
    });
  }, []);

  // Process new panels to make them visible by default
  const processNewPanels = useCallback(() => {
    const newVisiblePanels = new Set(state.visiblePanels);
    const newProcessedPanelIds = new Set(state.processedPanelIds);
    let hasChanges = false;

    panels.forEach(panel => {
      if (!newProcessedPanelIds.has(panel.id)) {
        // This is a new panel, make it visible and mark as processed
        newVisiblePanels.add(panel.id);
        newProcessedPanelIds.add(panel.id);
        hasChanges = true;
      }
    });

    // Clean up processed panel IDs for panels that no longer exist
    const existingIds = new Set(panels.map(p => p.id));
    const filteredProcessedIds = new Set([...Array.from(newProcessedPanelIds)].filter(id => existingIds.has(id)));

    if (hasChanges || filteredProcessedIds.size !== newProcessedPanelIds.size) {
      dispatch({ type: 'SET_VISIBLE_PANELS', payload: newVisiblePanels });
      dispatch({ type: 'SET_PROCESSED_PANEL_IDS', payload: filteredProcessedIds });
    }
  }, [panels, state.visiblePanels, state.processedPanelIds, dispatch]);

  // Ensure only NEW panels are visible by default
  useEffect(() => {
    processNewPanels();
  }, [processNewPanels]);

  const [isLoading, setIsLoading] = useState(true);

  // Load workspace on component mount and when storageKey changes
  useEffect(() => {
    console.log(`Loading workspace on mount/change for storageKey: ${storageKey}`);
    setIsLoading(true);
    const loaded = loadWorkspace();
    console.log(`Workspace load result for ${storageKey}: ${loaded}`);
    setIsLoading(false);
  }, [storageKey]); // Only depend on storageKey, not loadWorkspace to avoid infinite loops

  // Cleanup ONLY on real unmount (effect has empty dependency array so it will not run on storageKey change)
  useEffect(() => {
    return () => {
      // Only clear workspace on actual component unmount, not when storageKey changes
      // This prevents data loss when switching between tabs
      console.log(`InfiniteCanvas unmounting for storageKey: ${storageKey}`);
      // Ensure we persist latest state before clearing local reducer (CLEAR_WORKSPACE only affects in-memory state)
      try {
        console.log('[InfiniteCanvas] Saving workspace during unmount (panels:', panels.length, ')');
        saveWorkspace();
      } catch (e) {
        console.warn('Failed to save workspace on unmount', e);
      }
      dispatch({ type: 'CLEAR_WORKSPACE' });
    };
  }, []); // Intentionally empty deps

  // Convert screen coordinates to canvas coordinates
  const screenToCanvas = useCallback((screenX: number, screenY: number) => {
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return { x: 0, y: 0 };
    
    return {
      x: (screenX - rect.left - viewport.x) / viewport.zoom,
      y: (screenY - rect.top - viewport.y) / viewport.zoom
    };
  }, [viewport]);

  // Convert canvas coordinates to screen coordinates
  const canvasToScreen = useCallback((canvasX: number, canvasY: number) => {
    return {
      x: canvasX * viewport.zoom + viewport.x,
      y: canvasY * viewport.zoom + viewport.y
    };
  }, [viewport]);

  const getCanvasCenter = useCallback(() => {
    if (typeof window === 'undefined') {
      return { x: 0, y: 0 };
    }
    const centerX = (-viewport.x / viewport.zoom) + (window.innerWidth / 2) / viewport.zoom;
    const centerY = (-viewport.y / viewport.zoom) + (window.innerHeight / 2) / viewport.zoom;
    return { x: centerX, y: centerY };
  }, [viewport.x, viewport.y, viewport.zoom]);
  // Handle mouse wheel for zooming
  const handleWheel = useCallback((e: React.WheelEvent) => {
    // Check if mouse is over a panel content area
    const target = e.target as HTMLElement;
    const isOverPanel = target.closest('.panel-content');
    const isOverScrollableArea = target.closest('.scrollable-content, .overflow-auto, .overflow-y-auto, .overflow-x-auto');
    
    // If mouse is over a panel or scrollable content, don't zoom the canvas
    if (isOverPanel || isOverScrollableArea) {
      return; // Let the default scroll behavior handle this
    }
    
    e.preventDefault();
    
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;

    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;
    
    const delta = e.deltaY > 0 ? 0.9 : 1.1;
    const newZoom = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, viewport.zoom * delta));
    
    // Zoom towards mouse position
    const zoomRatio = newZoom / viewport.zoom;
    dispatch({
      type: 'SET_VIEWPORT',
      payload: {
        zoom: newZoom,
        x: mouseX - (mouseX - viewport.x) * zoomRatio,
        y: mouseY - (mouseY - viewport.y) * zoomRatio
      }
    });
  }, [viewport]);

  // Handle mouse down for panning / marquee
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    console.debug('[InfiniteCanvas] handleMouseDown', { button: e.button, target: (e.target as HTMLElement)?.className || (e.target as HTMLElement)?.tagName });
    if (draggedPanel) return; // Ignore if a panel is already flagged for drag

    const target = e.target as HTMLElement;
    // Check composedPath for elements marked to ignore canvas interactions
    const path = (e as unknown as { nativeEvent?: any }).nativeEvent?.composedPath ? (e as any).nativeEvent.composedPath() : (e as any).composedPath ? (e as any).composedPath() : [];
    const pathHasNoCanvas = Array.isArray(path) && path.some((n: any) => n && n.dataset && n.dataset.noCanvas === 'true');

    const isOverPanel = target.closest('.panel-content');
    const isOverInteractiveElement = target.closest('button, input, select, textarea, [contenteditable], .no-drag');
    const isMiddleButton = e.button === 1;

    // If the event originated from a UI control that should not trigger canvas actions, bail out early
    if (pathHasNoCanvas || (target && (target as HTMLElement).closest && (target as HTMLElement).closest('[data-no-canvas="true"]'))) {
      return;
    }

    if ((e.button === 0 && !isOverPanel && !isOverInteractiveElement) || isMiddleButton) {
      if (currentTool === 'hand' || isMiddleButton) {
        dispatch({
          type: 'SET_DRAGGING_STATE',
          payload: {
            isDragging: true,
            dragStartPos: { x: e.clientX - viewport.x, y: e.clientY - viewport.y }
          }
        });
      } else if (currentTool === 'select') {
        // Defer marquee until movement threshold; record start point.
        pendingMarquee.current = { x: e.clientX, y: e.clientY };
      }
    }
  }, [viewport.x, viewport.y, draggedPanel, currentTool]);

  // DEBUG: log global click handler activity

  // Handle mouse move for panning and panel dragging
  const latestMousePosRef = useRef<{x:number;y:number}>();
  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    console.log('[DEBUG] handleMouseMove called, isDragging:', isDragging, 'draggedPanel:', draggedPanel, 'isDragMode:', isDragMode);
    
    // Marquee selection update
    // Start marquee if threshold exceeded
    if (!isMarqueeSelecting && pendingMarquee.current && currentTool === 'select') {
      const dx = Math.abs(e.clientX - pendingMarquee.current.x);
      const dy = Math.abs(e.clientY - pendingMarquee.current.y);
      if (dx > 4 || dy > 4) {
        setIsMarqueeSelecting(true);
        marqueeStart.current = { ...pendingMarquee.current };
        if (!marqueeRef.current) {
          const el = document.createElement('div');
          el.className = 'fixed border border-blue-400/60 bg-blue-300/10 rounded pointer-events-none';
          document.body.appendChild(el);
          marqueeRef.current = el;
        }
        if (marqueeRef.current) {
          marqueeRef.current.style.left = marqueeStart.current.x + 'px';
          marqueeRef.current.style.top = marqueeStart.current.y + 'px';
          marqueeRef.current.style.width = '0px';
          marqueeRef.current.style.height = '0px';
          marqueeRef.current.style.display = 'block';
        }
      }
    }

    if (isMarqueeSelecting && marqueeStart.current && currentTool === 'select') {
      const sx = marqueeStart.current.x;
      const sy = marqueeStart.current.y;
      const ex = e.clientX;
      const ey = e.clientY;
      const left = Math.min(sx, ex);
      const top = Math.min(sy, ey);
      const width = Math.abs(ex - sx);
      const height = Math.abs(ey - sy);
      if (marqueeRef.current) {
        marqueeRef.current.style.left = left + 'px';
        marqueeRef.current.style.top = top + 'px';
        marqueeRef.current.style.width = width + 'px';
        marqueeRef.current.style.height = height + 'px';
      }
      latestMousePosRef.current = { x: ex, y: ey };
      return; // Do not process panning or panel drag when marqueeing
    }

    if (isDragging && !draggedPanel) {
      // Canvas panning - only if no panel is being dragged
      dispatch({
        type: 'SET_VIEWPORT',
        payload: {
          x: e.clientX - dragStartPos.x,
          y: e.clientY - dragStartPos.y
        }
      });
    } else if (draggedPanel && !isDragMode) {
      // Check if we should enter drag mode based on distance or time
      const currentTime = Date.now();
      const timeDiff = currentTime - dragStartTime;
      const distanceX = Math.abs(e.clientX - dragStartPos.x);
      const distanceY = Math.abs(e.clientY - dragStartPos.y);
      const distance = Math.sqrt(distanceX * distanceX + distanceY * distanceY);

      // Enter drag mode if mouse moved > 3px or held for > 150ms
      if (distance > 3 || timeDiff > 150) {
        dispatch({
          type: 'SET_DRAGGING_STATE',
          payload: { isDragMode: true, isDragging: true }
        });
      }
    } else if (draggedPanel && isDragMode) {
      // Panel dragging - prevent canvas panning
      e.stopPropagation();
      const canvasPos = screenToCanvas(e.clientX, e.clientY);
      const newX = canvasPos.x - dragOffset.x;
      const newY = canvasPos.y - dragOffset.y;

      if (selectedIds.size > 1 && selectedIds.has(draggedPanel)) {
        // Initialize baseline positions once
        if (!groupDragOrigin.current) {
          const draggedOriginal = panels.find(p => p.id === draggedPanel)!;
          groupDragOrigin.current = {
            baseX: draggedOriginal.x,
            baseY: draggedOriginal.y,
            offsets: Array.from(selectedIds).map(id => {
              const p = panels.find(pp => pp.id === id)!;
              return { id, dx: p.x, dy: p.y }; // store absolute original positions
            })
          };
        }
        const baseline = groupDragOrigin.current;
        const deltaX = newX - baseline.baseX;
        const deltaY = newY - baseline.baseY;
        pendingGroupDelta.current = { dx: deltaX, dy: deltaY };
        if (groupDragFrame.current == null) {
          groupDragFrame.current = requestAnimationFrame(() => {
            groupDragFrame.current = null;
            if (!groupDragOrigin.current || !pendingGroupDelta.current) return;
            const { dx, dy } = pendingGroupDelta.current;
            const base = groupDragOrigin.current;
            const updated = panels.map(p => {
              if (selectedIds.has(p.id)) {
                const off = base.offsets.find(o => o.id === p.id)!;
                return { ...p, x: off.dx + dx, y: off.dy + dy };
              }
              return p;
            });
            dispatch({ type: 'SET_PANELS', payload: updated });
          });
        }
      } else {
        dispatch({ type: 'UPDATE_PANEL', payload: { id: draggedPanel, updates: { x: newX, y: newY } } });
      }

      // Unified snapping detection (same algorithm for all panel types)
  const draggedPanelData = (selectedIds.size > 1 && selectedIds.has(draggedPanel)) ? null : panels.find(p => p.id === draggedPanel);
      if (draggedPanelData) {
        const snapTargets = calculateSnapTargets(draggedPanelData, panels, newX, newY, viewport.zoom);
        dispatch({ type: 'SET_SNAP_TARGETS', payload: snapTargets });
        
        // DEBUG: Always log snap targets
        console.log('[DEBUG] snapTargets generated:', snapTargets.length, snapTargets.map(t => ({ id: t.id, distance: t.distance.toFixed(1), side: t.side })));

        // Improved snapping logic with better disconnection and closest target prioritization
        if (snapTargets.length) {
          const closest = snapTargets.reduce((a, b) => (b.distance < a.distance ? b : a));
          
          if (isSnapping && snapTargetId) {
            // Currently snapped - check if we should disconnect or switch
            const currentActive = snapTargets.find(t => t.id === snapTargetId);
            
            if (currentActive) {
              // Check if we should disconnect (moved too far from snap point)
              const shouldDisconnect = currentActive.distance > DISCONNECT_DISTANCE_PX;
              
              // Check if there's a significantly closer target to switch to
              const hasCloserTarget = closest.id !== currentActive.id && 
                                    closest.distance < currentActive.distance * 0.7 && 
                                    closest.distance <= SNAP_SWITCH_PX;
              
              if (shouldDisconnect) {
                // Disconnect completely
                dispatch({ type: 'SET_SNAPPING_STATE', payload: { isSnapping: false, snapTargetId: null, snapPreview: null } });
              } else if (hasCloserTarget && closest.distance <= SNAP_ACTIVATE_PX) {
                // Switch to closer target
                const snapPosition = getSnapPosition(draggedPanelData, closest);
                dispatch({ type: 'SET_SNAPPING_STATE', payload: { isSnapping: true, snapTargetId: closest.id, snapPreview: snapPosition } });
              } else {
                // Maintain current snap
                const snapPosition = getSnapPosition(draggedPanelData, currentActive);
                dispatch({ type: 'SET_SNAPPING_STATE', payload: { isSnapping: true, snapTargetId: currentActive.id, snapPreview: snapPosition } });
              }
            } else {
              // Current target no longer available - try to snap to closest
              if (closest.distance <= SNAP_ACTIVATE_PX) {
                const snapPosition = getSnapPosition(draggedPanelData, closest);
                dispatch({ type: 'SET_SNAPPING_STATE', payload: { isSnapping: true, snapTargetId: closest.id, snapPreview: snapPosition } });
              } else {
                dispatch({ type: 'SET_SNAPPING_STATE', payload: { isSnapping: false, snapTargetId: null, snapPreview: null } });
              }
            }
          } else {
            // Not currently snapped - try to acquire new snap
            if (closest.distance <= SNAP_ACTIVATE_PX) {
              const snapPosition = getSnapPosition(draggedPanelData, closest);
              dispatch({ type: 'SET_SNAPPING_STATE', payload: { isSnapping: true, snapTargetId: closest.id, snapPreview: snapPosition } });
            } else {
              dispatch({ type: 'SET_SNAPPING_STATE', payload: { isSnapping: false, snapTargetId: null, snapPreview: null } });
            }
          }
        } else {
          dispatch({ type: 'SET_SNAPPING_STATE', payload: { isSnapping: false, snapTargetId: null, snapPreview: null } });
        }
      }
    }
  }, [isDragging, dragStartPos, draggedPanel, isDragMode, dragStartTime, screenToCanvas, dragOffset, panels, viewport.zoom, isSnapping, state.snapTargetId, selectedIds, currentTool, isMarqueeSelecting]);

  // Handle mouse up
  const handleMouseUp = useCallback((e: React.MouseEvent) => {
    groupDragOrigin.current = null;
    if (groupDragFrame.current) {
      cancelAnimationFrame(groupDragFrame.current);
      groupDragFrame.current = null;
    }
    pendingGroupDelta.current = null;
    if (isMarqueeSelecting && marqueeStart.current && currentTool === 'select') {
      const endX = e.clientX;
      const endY = e.clientY;
      const sx = marqueeStart.current.x;
      const sy = marqueeStart.current.y;
      const left = Math.min(sx, endX);
      const top = Math.min(sy, endY);
      const width = Math.abs(endX - sx);
      const height = Math.abs(endY - sy);
      const rect = canvasRef.current?.getBoundingClientRect();
      if (rect) {
        const canvasLeft = (left - rect.left - viewport.x) / viewport.zoom;
        const canvasTop = (top - rect.top - viewport.y) / viewport.zoom;
        const canvasRight = ((left + width) - rect.left - viewport.x) / viewport.zoom;
        const canvasBottom = ((top + height) - rect.top - viewport.y) / viewport.zoom;
        const newSel = new Set<string>();
        panels.forEach(p => {
          const inside = p.x + p.width > canvasLeft && p.x < canvasRight && p.y + p.height > canvasTop && p.y < canvasBottom;
          if (inside) newSel.add(p.id);
        });
        setSelectedIds(newSel);
      }
      setIsMarqueeSelecting(false);
      marqueeStart.current = undefined;
      if (marqueeRef.current) marqueeRef.current.style.display = 'none';
      pendingMarquee.current = null;
    } else if (currentTool === 'select') {
      // Click without marquee (e.g., empty space) clears selection
      const target = e.target as HTMLElement;
      const overPanel = target.closest('.panel-content');
      // Do not clear if this mouseup ends a drag operation
      if (!overPanel && selectedIds.size && !draggedPanel && !isDragMode) {
        setSelectedIds(new Set());
      }
      pendingMarquee.current = null;
    }
    // Clear any pending snap debounce
    if (snapDebounceTimeoutRef.current) {
      clearTimeout(snapDebounceTimeoutRef.current);
      snapDebounceTimeoutRef.current = null;
    }

    // Apply snap if we're currently snapping OR if there are valid snap targets nearby
    if (draggedPanel && snapTargets.length) {
      const draggedPanelData = panels.find(p => p.id === draggedPanel);
      if (draggedPanelData) {
        if (isSnapping && snapPreview) {
          // Commit active snap preview
            dispatch({
              type: 'UPDATE_PANEL',
              payload: { id: draggedPanel, updates: { x: snapPreview.x, y: snapPreview.y } }
            });
        } else {
          // Snap to closest within detection radius
          const withinDetect = snapTargets.filter(t => t.distance <= SNAP_DETECT_PX);
          if (withinDetect.length) {
            const closest = withinDetect.reduce((a, b) => (b.distance < a.distance ? b : a));
            const snapPosition = getSnapPosition(draggedPanelData, closest);
            dispatch({ type: 'UPDATE_PANEL', payload: { id: draggedPanel, updates: { x: snapPosition.x, y: snapPosition.y } } });
          }
        }
      }
    } else {
      // Not dragging - clear snap targets if any exist
      if (snapTargets.length > 0) {
        dispatch({ type: 'SET_SNAP_TARGETS', payload: [] });
      }
    }

    // Always stop dragging when mouse is released
    dispatch({ type: 'STOP_DRAGGING' });
    dispatch({ type: 'CLEAR_SNAPPING' });
  }, [isSnapping, snapPreview, draggedPanel, dispatch, snapTargets, panels]);

  // Handle right click for context menu
  const handleContextMenu = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    const canvasPos = screenToCanvas(e.clientX, e.clientY);
    dispatch({
      type: 'SET_CONTEXT_MENU',
      payload: {
        show: true,
        position: { x: e.clientX, y: e.clientY }
      }
    });
    dispatch({
      type: 'SET_UPLOAD_DIALOG',
      payload: {
        show: false,
        position: canvasPos
      }
    });
  }, [screenToCanvas]);

  // Close context menu when clicking elsewhere
  useEffect(() => {
    const handleClick = (ev?: MouseEvent) => {
      try {
        // If we just opened the menu, ignore the next document click which is
        // likely the same click that triggered opening (prevents immediate close)
        if (suppressNextDocumentClickRef.current) {
          suppressNextDocumentClickRef.current = false;
          return;
        }
        const target = ev?.target as HTMLElement | null;
        // If click originates from an element marked data-no-canvas, ignore
        if (target) {
          const path = (ev as any).composedPath ? (ev as any).composedPath() : undefined;
          const nodes = path || (target ? [target] : []);
          const fromNoCanvas = nodes.some((n: any) => n && n.getAttribute && n.getAttribute('data-no-canvas') === 'true');
          if (fromNoCanvas) return;
        }
        console.debug('[InfiniteCanvas] document click handler fired (closing context)', ev && { type: ev.type, target: (ev.target as HTMLElement)?.tagName });
        dispatch({ type: 'SET_CONTEXT_MENU', payload: { show: false } });
        // Close the plus menu if click was outside
        if (!target || !target.closest || !target.closest('#infinite-plus-menu')) {
          setIsHovering(false);
          setMenuPersistent(false);
          setOpenMenu(false);
        }
      } catch (err) {
        console.error('[InfiniteCanvas] error in document click handler', err);
      }
    };
    document.addEventListener('click', handleClick);
    return () => document.removeEventListener('click', handleClick);
  }, []);

  // Global mouse event listeners for canvas dragging
  useEffect(() => {
    const handleGlobalMouseMove = (e: MouseEvent) => {
      if (isDragging && !draggedPanel) {
        // Canvas panning - only if no panel is being dragged
        dispatch({
          type: 'SET_VIEWPORT',
          payload: {
            x: e.clientX - dragStartPos.x,
            y: e.clientY - dragStartPos.y
          }
        });
      }
    };

    const handleGlobalMouseUp = (e: MouseEvent) => {
      // Finalize marquee selection if active
      if (isMarqueeSelecting && marqueeStart.current && currentTool === 'select') {
        const endX = e.clientX;
        const endY = e.clientY;
        const sx = marqueeStart.current.x;
        const sy = marqueeStart.current.y;
        const left = Math.min(sx, endX);
        const top = Math.min(sy, endY);
        const width = Math.abs(endX - sx);
        const height = Math.abs(endY - sy);
        const rect = canvasRef.current?.getBoundingClientRect();
        if (rect) {
          const canvasLeft = (left - rect.left - viewport.x) / viewport.zoom;
          const canvasTop = (top - rect.top - viewport.y) / viewport.zoom;
          const canvasRight = ((left + width) - rect.left - viewport.x) / viewport.zoom;
          const canvasBottom = ((top + height) - rect.top - viewport.y) / viewport.zoom;
          const newSel = new Set<string>();
          panels.forEach(p => {
            const inside = p.x + p.width > canvasLeft && p.x < canvasRight && p.y + p.height > canvasTop && p.y < canvasBottom;
            if (inside) newSel.add(p.id);
          });
          setSelectedIds(newSel);
        }
        setIsMarqueeSelecting(false);
        marqueeStart.current = undefined;
        if (marqueeRef.current) marqueeRef.current.style.display = 'none';
        pendingMarquee.current = null;
      }
      // Always stop dragging when mouse is released globally
      if (isDragging) {
        dispatch({ type: 'STOP_DRAGGING' });
        dispatch({ type: 'CLEAR_SNAPPING' });
      }
    };

    // Add global listeners when any dragging is happening
    // Always listen for mouseup to ensure marquee is finalized even if released outside canvas
    document.addEventListener('mouseup', handleGlobalMouseUp);
    if (isDragging) {
      document.addEventListener('mousemove', handleGlobalMouseMove);
    }
    return () => {
      if (isDragging) {
        document.removeEventListener('mousemove', handleGlobalMouseMove);
      }
      document.removeEventListener('mouseup', handleGlobalMouseUp);
    };
  }, [isDragging, draggedPanel, dragStartPos]);

  // Helper function to get the appropriate panel size based on type and expanded state
  const getPanelSize = (panelType: Panel['type'], isExpanded: boolean) => {
    const sizeConfig = {
      'dataset': PANEL_SIZES.DATASET,
      'graph': PANEL_SIZES.GRAPH,
      'model': PANEL_SIZES.MODEL,
      'model-results': PANEL_SIZES.MODEL_RESULTS,
      'model-visualization': PANEL_SIZES.MODEL_VISUALIZATION,
      'manipulation': PANEL_SIZES.DATA_MANIPULATION,
      'data-editor': PANEL_SIZES.DATA_EDITOR,
      'merge': PANEL_SIZES.MERGE
    };
    
    const config = sizeConfig[panelType];
    return isExpanded ? config.expanded : config.collapsed;
  };

  // Centralized panel update function that handles size changes when expanded state changes
  const updatePanel = useCallback((panelId: string, updates: Partial<Panel>) => {
    const panel = panels.find(p => p.id === panelId);
    if (!panel) return;

    let finalUpdates = { ...updates };

    // If isExpanded changed, update the panel size accordingly
    if ('isExpanded' in updates && updates.isExpanded !== panel.isExpanded) {
      const newSize = getPanelSize(panel.type, updates.isExpanded!);
      finalUpdates.width = newSize.width;
      finalUpdates.height = newSize.height;
    }

    dispatch({
      type: 'UPDATE_PANEL',
      payload: {
        id: panelId,
        updates: finalUpdates
      }
    });
  }, [panels]);

  // Shared styling for small overlay icon buttons to ensure consistent hit area & avoid drag conflicts
  // Unified small icon button styling (match + / x: backgroundless, crisp icon)
  const overlayIconButtonClass = "no-drag inline-flex items-center justify-center h-5 w-5 rounded-none bg-transparent text-slate-600 hover:text-slate-900 transition-colors";

  // Remove panel function
  const removePanel = useCallback((panelId: string) => {
    dispatch({ type: 'REMOVE_PANEL', payload: panelId });

    // Remove connections involving this panel
    dispatch({
      type: 'SET_CONNECTIONS',
      payload: connections.filter(c => c.fromPanelId !== panelId && c.toPanelId !== panelId)
    });

    // Remove from visible panels
    const newVisiblePanels = new Set(visiblePanels);
    newVisiblePanels.delete(panelId);
    dispatch({ type: 'SET_VISIBLE_PANELS', payload: newVisiblePanels });

    // Remove from interaction order
    dispatch({
      type: 'SET_PANEL_INTERACTION_ORDER',
      payload: panelInteractionOrder.filter(id => id !== panelId)
    });

    // Clear selection if this panel was selected
    if (selectedPanelId === panelId) {
      dispatch({ type: 'SET_SELECTED_PANEL', payload: null });
    }
  }, [connections, visiblePanels, panelInteractionOrder, selectedPanelId]);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't trigger shortcuts if user is typing in an input
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement || (e.target as HTMLElement).contentEditable === 'true') {
        return;
      }

      switch (e.key) {
        case 'Delete':
        case 'Backspace':
          if (selectedPanelId) {
            e.preventDefault();
            removePanel(selectedPanelId);
          }
          break;
        case 'Escape':
          dispatch({ type: 'SET_SELECTED_PANEL', payload: null });
          dispatch({ type: 'SET_HIGHLIGHTED_PANEL', payload: null });
          // Stop any ongoing dragging operations
          if (isDragging) {
            dispatch({ type: 'STOP_DRAGGING' });
            dispatch({ type: 'CLEAR_SNAPPING' });
          }
          break;
        case '+':
        case '=':
          e.preventDefault();
          dispatch({
            type: 'SET_VIEWPORT',
            payload: {
              zoom: Math.min(MAX_ZOOM, viewport.zoom * 1.2)
            }
          });
          break;
        case '-':
          e.preventDefault();
          dispatch({
            type: 'SET_VIEWPORT',
            payload: {
              zoom: Math.max(MIN_ZOOM, viewport.zoom / 1.2)
            }
          });
          break;
        case '0':
          if (e.ctrlKey || e.metaKey) {
            e.preventDefault();
            dispatch({ type: 'SET_VIEWPORT', payload: { x: 0, y: 0, zoom: 1 } });
          }
          break;
        case 'z':
          if (e.ctrlKey || e.metaKey) {
            e.preventDefault();
            // TODO: Implement undo
          }
          break;
        case 'y':
          if (e.ctrlKey || e.metaKey) {
            e.preventDefault();
            // TODO: Implement redo
          }
          break;
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [selectedPanelId, viewport.zoom, removePanel]);

  // Standardized panel spacing
  const PANEL_SPACING = 40;

  // Add a new dataset panel
  const addDatasetPanel = useCallback((x: number, y: number, datasetData: any) => {
    const newPanel: Panel = {
      id: `dataset-${Date.now()}`,
      type: 'dataset',
      x,
      y,
      width: PANEL_SIZES.DATASET.collapsed.width,
      height: PANEL_SIZES.DATASET.collapsed.height,
      data: datasetData,
      isExpanded: false
    };
    dispatch({ type: 'ADD_PANEL', payload: newPanel });
    bringPanelToFront(newPanel.id); // Bring new panel to front
  }, [bringPanelToFront]);

  // Add a graph panel connected to a dataset
  const addGraphPanel = useCallback((datasetPanelId: string, graphData: any) => {
    const datasetPanel = panels.find(p => p.id === datasetPanelId);
    if (!datasetPanel) return;

    const newPanel: Panel = {
      id: `graph-${Date.now()}`,
      type: 'graph',
      x: datasetPanel.x + datasetPanel.width + PANEL_SPACING,
      y: datasetPanel.y,
      width: PANEL_SIZES.GRAPH.collapsed.width,
      height: PANEL_SIZES.GRAPH.collapsed.height,
      data: graphData,
      parentId: datasetPanelId,
      isExpanded: false
    };
    dispatch({ type: 'ADD_PANEL', payload: newPanel });
    bringPanelToFront(newPanel.id); // Bring new panel to front

    // Add connection
    const newConnection: Connection = {
      id: `conn-${Date.now()}`,
      fromPanelId: datasetPanelId,
      toPanelId: newPanel.id,
      type: 'derived-from'
    };
    dispatch({
      type: 'SET_CONNECTIONS',
      payload: [...connections, newConnection]
    });
  }, [panels, bringPanelToFront]);

  // Add a model panel connected to a dataset
  const addModelPanel = useCallback((datasetPanelId: string, modelData: any) => {
    const datasetPanel = panels.find(p => p.id === datasetPanelId);
    if (!datasetPanel) {
      console.error('Dataset panel not found:', datasetPanelId);
      return;
    }

    const newPanel: Panel = {
      id: `model-${Date.now()}`,
      type: 'model',
      x: datasetPanel.x + datasetPanel.width + PANEL_SPACING,
      y: datasetPanel.y,
      width: PANEL_SIZES.MODEL.expanded.width,
      height: PANEL_SIZES.MODEL.expanded.height,
      data: modelData,
      parentId: datasetPanelId,
      isExpanded: true
    };
    dispatch({ type: 'ADD_PANEL', payload: newPanel });
    bringPanelToFront(newPanel.id); // Bring new panel to front

    // Add connection
    const newConnection: Connection = {
      id: `conn-${Date.now()}`,
      fromPanelId: datasetPanelId,
      toPanelId: newPanel.id,
      type: 'derived-from'
    };
    dispatch({
      type: 'SET_CONNECTIONS',
      payload: [...connections, newConnection]
    });
  }, [panels, bringPanelToFront]);

  // Add a data manipulation panel connected to a dataset
  const addDataManipulationPanel = useCallback((datasetPanelId: string, manipulationData: any) => {
    const datasetPanel = panels.find(p => p.id === datasetPanelId);
    if (!datasetPanel) return;

    const newPanel: Panel = {
      id: `manipulation-${Date.now()}`,
      type: 'manipulation',
      x: datasetPanel.x - PANEL_SIZES.DATA_MANIPULATION.collapsed.width - PANEL_SPACING,
      y: datasetPanel.y,
      width: PANEL_SIZES.DATA_MANIPULATION.collapsed.width,
      height: PANEL_SIZES.DATA_MANIPULATION.collapsed.height,
      data: manipulationData,
      parentId: datasetPanelId,
      isExpanded: false
    };
    dispatch({ type: 'ADD_PANEL', payload: newPanel });
    bringPanelToFront(newPanel.id); // Bring new panel to front

    // Add connection
    const newConnection: Connection = {
      id: `conn-${Date.now()}`,
      fromPanelId: datasetPanelId,
      toPanelId: newPanel.id,
      type: 'data-flow'
    };
    dispatch({
      type: 'SET_CONNECTIONS',
      payload: [...connections, newConnection]
    });
  }, [panels, bringPanelToFront]);

  // Add a data editor panel connected to a dataset
  const addDataEditorPanel = useCallback((datasetPanelId: string, editorData: any) => {
    const datasetPanel = panels.find(p => p.id === datasetPanelId);
    if (!datasetPanel) return;

    const newPanel: Panel = {
      id: `data-editor-${Date.now()}`,
      type: 'data-editor',
      x: datasetPanel.x + datasetPanel.width + PANEL_SPACING,
      y: datasetPanel.y - 100,
      width: PANEL_SIZES.DATA_EDITOR.collapsed.width,
      height: PANEL_SIZES.DATA_EDITOR.collapsed.height,
      data: editorData,
      parentId: datasetPanelId,
      isExpanded: false
    };
    dispatch({ type: 'ADD_PANEL', payload: newPanel });

    // Add connection
    const newConnection: Connection = {
      id: `conn-${Date.now()}`,
      fromPanelId: datasetPanelId,
      toPanelId: newPanel.id,
      type: 'data-flow'
    };
    dispatch({
      type: 'SET_CONNECTIONS',
      payload: [...connections, newConnection]
    });
  }, [panels]);

  const addMergePanel = useCallback((datasetPanelId: string, mergeData: any = {}) => {
    const datasetPanel = panels.find(p => p.id === datasetPanelId);
    if (!datasetPanel) return;

    const inferredDatasetId = mergeData?.datasetId
      ?? datasetPanel.data?.datasetId
      ?? datasetPanel.data?.dataset_id
      ?? datasetPanel.data?.id;

    const normalizedData = {
      datasetId: inferredDatasetId,
      datasetName: mergeData?.datasetName
        ?? datasetPanel.data?.datasetName
        ?? datasetPanel.data?.name
        ?? datasetPanel.data?.original_filename,
      ...mergeData
    };

    const newPanel: Panel = {
      id: `merge-${Date.now()}`,
      type: 'merge',
      x: datasetPanel.x + datasetPanel.width + PANEL_SPACING,
      y: datasetPanel.y,
      width: PANEL_SIZES.MERGE.expanded.width,
      height: PANEL_SIZES.MERGE.expanded.height,
      data: normalizedData,
      parentId: datasetPanelId,
      isExpanded: true
    };

    dispatch({ type: 'ADD_PANEL', payload: newPanel });
    bringPanelToFront(newPanel.id);

    const newConnection: Connection = {
      id: `conn-${Date.now()}`,
      fromPanelId: datasetPanelId,
      toPanelId: newPanel.id,
      type: 'data-flow'
    };

    dispatch({
      type: 'SET_CONNECTIONS',
      payload: [...connections, newConnection]
    });

    return newPanel.id;
  }, [panels, bringPanelToFront, connections]);

  // Add a model results panel connected to a model panel
  const addModelResultsPanel = useCallback((modelPanelId: string, resultsData: any) => {
    const modelPanel = panels.find(p => p.id === modelPanelId);
    if (!modelPanel) return;

    const newPanel: Panel = {
      id: `model-results-${Date.now()}`,
      type: 'model-results',
      x: modelPanel.x + modelPanel.width + PANEL_SPACING,
      y: modelPanel.y,
      width: PANEL_SIZES.MODEL_RESULTS.expanded.width,
      height: PANEL_SIZES.MODEL_RESULTS.expanded.height,
      data: resultsData,
      parentId: modelPanelId,
      isExpanded: true
    };
    dispatch({ type: 'ADD_PANEL', payload: newPanel });
    bringPanelToFront(newPanel.id);

    // Add connection
    const newConnection: Connection = {
      id: `conn-${Date.now()}`,
      fromPanelId: modelPanelId,
      toPanelId: newPanel.id,
      type: 'derived-from'
    };
    dispatch({
      type: 'SET_CONNECTIONS',
      payload: [...connections, newConnection]
    });

    return newPanel.id;
  }, [panels, connections, bringPanelToFront]);

  // Add a model visualization panel connected to a model results panel
  const addModelVisualizationPanel = useCallback((modelResultsPanelId: string, visualizationData: any) => {
    const modelResultsPanel = panels.find(p => p.id === modelResultsPanelId);
    if (!modelResultsPanel) return;

    const newPanel: Panel = {
      id: `model-viz-${Date.now()}`,
      type: 'model-visualization',
      x: modelResultsPanel.x + modelResultsPanel.width + PANEL_SPACING,
      y: modelResultsPanel.y,
      width: PANEL_SIZES.MODEL_VISUALIZATION.expanded.width,
      height: PANEL_SIZES.MODEL_VISUALIZATION.expanded.height,
      data: visualizationData,
      parentId: modelResultsPanelId,
      isExpanded: true
    };
    dispatch({ type: 'ADD_PANEL', payload: newPanel });
    bringPanelToFront(newPanel.id);

    // Add connection
    const newConnection: Connection = {
      id: `conn-${Date.now()}`,
      fromPanelId: modelResultsPanelId,
      toPanelId: newPanel.id,
      type: 'derived-from'
    };
    dispatch({
      type: 'SET_CONNECTIONS',
      payload: [...connections, newConnection]
    });

    return newPanel.id;
  }, [panels, connections, bringPanelToFront]);

  const requestVisualizationForPanel = useCallback(async (panelId: string, visualizationType: string) => {
    const targetPanel = panelsRef.current.find(p => p.id === panelId);
    if (!targetPanel || targetPanel.type !== 'model-results') {
      console.error('[InfiniteCanvas] Visualization request aborted: target panel not found or incorrect type.', panelId);
      return;
    }

    const resultsData = targetPanel.data ?? {};
    const datasetIdRaw = resultsData.datasetId ?? resultsData.dataset_id;
    const runId = resultsData.run_id;

    if (!datasetIdRaw || !runId) {
      console.error('[InfiniteCanvas] Visualization request aborted: missing datasetId or runId.', { datasetIdRaw, runId });
      return;
    }

    const datasetId = Number(datasetIdRaw);
    if (Number.isNaN(datasetId)) {
      console.error('[InfiniteCanvas] Visualization request aborted: datasetId is not numeric.', datasetIdRaw);
      return;
    }

    try {
      const response = await fetch(`${BACKEND_URL}/datasets/${datasetId}/model/visual`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          run_id: String(runId),
          kind: visualizationType,
          max_points: 2000
        })
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error(`[InfiniteCanvas] Visualization request failed (${response.status}):`, errorText);
        return;
      }

      const result = await response.json();
      addModelVisualizationPanel(panelId, {
        ...result,
        activeType: visualizationType,
        datasetId,
        run_id: String(runId)
      });
    } catch (error) {
      console.error('[InfiniteCanvas] Visualization request error:', error);
    }
  }, [BACKEND_URL, addModelVisualizationPanel]);

  // Render grid background
  const memoizedGrid = useMemo(() => {
    const gridLines = [];
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return null;

    const gridSpacing = GRID_SIZE * viewport.zoom;
    const offsetX = viewport.x % gridSpacing;
    const offsetY = viewport.y % gridSpacing;

    // Calculate extended bounds for infinite grid
    const extendedWidth = rect.width + Math.abs(viewport.x) + 2000;
    const extendedHeight = rect.height + Math.abs(viewport.y) + 2000;
    const startX = Math.min(0, viewport.x - 1000);
    const startY = Math.min(0, viewport.y - 1000);

    // Vertical lines
    for (let x = offsetX + startX; x < extendedWidth; x += gridSpacing) {
      gridLines.push(
        <line
          key={`v-${x}`}
          x1={x}
          y1={startY}
          x2={x}
          y2={extendedHeight}
          stroke="#e5e7eb"
          strokeWidth={0.5}
        />
      );
    }

    // Horizontal lines
    for (let y = offsetY + startY; y < extendedHeight; y += gridSpacing) {
      gridLines.push(
        <line
          key={`h-${y}`}
          x1={startX}
          y1={y}
          x2={extendedWidth}
          y2={y}
          stroke="#e5e7eb"
          strokeWidth={0.5}
        />
      );
    }

    return (
      <svg className="absolute inset-0 pointer-events-none" style={{ overflow: 'visible' }}>
        {gridLines}
      </svg>
    );
  }, [viewport, canvasRef.current]);

  // Render connections between panels
  const renderConnections = () => {
    return connections.map(connection => {
      const fromPanel = panels.find(p => p.id === connection.fromPanelId);
      const toPanel = panels.find(p => p.id === connection.toPanelId);
      
      if (!fromPanel || !toPanel) return null;

      // Determine connection points based on panel types and positions
      let fromX, fromY, toX, toY;
      
      if (connection.type === 'data-flow') {
        // For data manipulation panels (left of dataset)
        fromX = fromPanel.x;
        fromY = fromPanel.y + fromPanel.height / 2;
        toX = toPanel.x + toPanel.width;
        toY = toPanel.y + toPanel.height / 2;
      } else {
        // For derived panels (right of dataset)
        fromX = fromPanel.x + fromPanel.width;
        fromY = fromPanel.y + fromPanel.height / 2;
        toX = toPanel.x;
        toY = toPanel.y + toPanel.height / 2;
      }

      const fromScreen = canvasToScreen(fromX, fromY);
      const toScreen = canvasToScreen(toX, toY);

      // Calculate control points for curved line
      const midX = (fromScreen.x + toScreen.x) / 2;
      const controlOffset = Math.abs(toScreen.x - fromScreen.x) * 0.5;
      
      const control1X = fromScreen.x + (fromScreen.x < toScreen.x ? controlOffset : -controlOffset);
      const control1Y = fromScreen.y;
      const control2X = toScreen.x + (fromScreen.x < toScreen.x ? -controlOffset : controlOffset);
      const control2Y = toScreen.y;

      // Generate SVG path for curved line
      const pathData = `M ${fromScreen.x} ${fromScreen.y} C ${control1X} ${control1Y}, ${control2X} ${control2Y}, ${toScreen.x} ${toScreen.y}`;

      // Determine connection color based on type and panel types
      let strokeColor = '#6b7280';
      let strokeWidth = 2;
      
      if (connection.type === 'data-flow') {
        strokeColor = '#f59e0b'; // Orange for data manipulation
        strokeWidth = 3;
      } else if (toPanel.type === 'graph') {
        strokeColor = '#10b981'; // Green for graphs
      } else if (toPanel.type === 'model') {
        strokeColor = '#8b5cf6'; // Purple for models
      } else if (toPanel.type === 'model-visualization') {
        strokeColor = '#3b82f6'; // Blue for model visualizations
        strokeWidth = 3; // Thicker for emphasis
      }

      return (
        <svg key={connection.id} className="absolute inset-0 pointer-events-none">
          <defs>
            <marker
              id={`arrowhead-${connection.id}`}
              markerWidth="10"
              markerHeight="7"
              refX="9"
              refY="3.5"
              orient="auto"
            >
              <polygon
                points="0 0, 10 3.5, 0 7"
                fill={strokeColor}
              />
            </marker>
            {/* Gradient for enhanced visual appeal */}
            <linearGradient id={`gradient-${connection.id}`} x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" style={{stopColor: strokeColor, stopOpacity: 0.8}} />
              <stop offset="50%" style={{stopColor: strokeColor, stopOpacity: 1}} />
              <stop offset="100%" style={{stopColor: strokeColor, stopOpacity: 0.8}} />
            </linearGradient>
          </defs>
          
          {/* Connection line with glow effect */}
          <path
            d={pathData}
            stroke={`url(#gradient-${connection.id})`}
            strokeWidth={strokeWidth + 2}
            fill="none"
            opacity="0.3"
          />
          <path
            d={pathData}
            stroke={strokeColor}
            strokeWidth={strokeWidth}
            fill="none"
            markerEnd={`url(#arrowhead-${connection.id})`}
            className="drop-shadow-sm"
          />
          
          {/* Connection type label */}
          <text
            x={midX}
            y={(fromScreen.y + toScreen.y) / 2 - 5}
            textAnchor="middle"
            className="text-xs fill-gray-600 font-medium"
            style={{ fontSize: '10px' }}
          >
            {connection.type === 'data-flow' ? '→' : connection.type === 'derived-from' ? '←' : ''}
          </text>
        </svg>
      );
    });
  };

  return (
    <div className="h-screen w-screen overflow-hidden bg-gray-50 relative">
      {isLoading ? (
        <div className="flex items-center justify-center h-full">
          <div className="text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
            <p className="text-gray-600">Loading canvas...</p>
          </div>
        </div>
      ) : (
        <>
          {/* Canvas */}
          <div
            ref={canvasRef}
            className={`w-full h-full relative select-none transition-all duration-300 ease-out ${
              draggedPanel ? 'cursor-grabbing' : isDragging ? 'cursor-grabbing' : 'cursor-move'
            }`}
            style={{
              marginLeft: isLayersPanelCollapsed ? '48px' : '320px'
            }}
            onWheel={handleWheel}
            onMouseDown={handleMouseDown}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
            onContextMenu={handleContextMenu}
            onDragOver={(e) => {
              // Allow drops from layers panel
              e.preventDefault();
            }}
            onDrop={(e) => {
              // Handle reposition drop from LayersPanel
              const panelId = e.dataTransfer.getData('text/plain') || e.dataTransfer.getData('application/x-panel-id');
              if (panelId) {
                const panel = panels.find(p => p.id === panelId);
                if (panel) {
                  const rect = canvasRef.current?.getBoundingClientRect();
                  if (!rect) return;
                  // Convert screen coords to canvas world coords respecting current viewport transform
                  const canvasX = (e.clientX - rect.left - viewport.x) / viewport.zoom;
                  const canvasY = (e.clientY - rect.top - viewport.y) / viewport.zoom;
                  dispatch({
                    type: 'UPDATE_PANEL',
                    payload: {
                      id: panelId,
                      updates: { x: canvasX - panel.width / 2, y: canvasY - panel.height / 2, folderId: undefined }
                    }
                  });
                }
              }
            }}
          >
        {/* Grid background */}
        {memoizedGrid}

        {/* Connections */}
        {renderConnections()}

        {/* Panels */}
        <div
          className="absolute"
          style={{
            transform: `translate(${viewport.x}px, ${viewport.y}px) scale(${viewport.zoom})`,
            transformOrigin: '0 0',
            width: '10000px',
            height: '10000px'
          }}
        >
          {panels.map(panel => {
            // Skip rendering if panel is not visible
            if (!visiblePanels.has(panel.id)) {
              return null;
            }
            
            const isHighlighted = highlightedPanelId === panel.id;
            const panelZIndex = getPanelZIndex(panel.id);
            const isDraggedPanel = draggedPanel === panel.id;
            
            return (
              <div
                key={panel.id}
                className={`absolute select-none ${
                  isDraggedPanel && isDragMode 
                    ? 'cursor-grabbing' 
                    : 'cursor-grab hover:cursor-grab'
                }`}
              style={{
                left: panel.x,
                top: panel.y,
                width: panel.width,
                height: panel.height,
                zIndex: isDraggedPanel && isDragMode ? 1000 : panelZIndex, // Maximum z-index when dragging
                transform: isDraggedPanel && isDragMode ? 'scale(1.03) translateZ(0)' : 'scale(1) translateZ(0)',
                transition: (isDraggedPanel || (isDragMode && selectedIds.size > 1 && selectedIds.has(panel.id))) ? 'none' : 'transform 0.2s cubic-bezier(0.4, 0, 0.2, 1), z-index 0.2s ease, left 0.2s cubic-bezier(0.4, 0, 0.2, 1), top 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
                filter: isDraggedPanel && isDragMode ? 'drop-shadow(0 20px 40px rgba(0,0,0,0.2)) brightness(1.02)' : 'none',
                // Keep dragged panel fully opaque even when a highlight dim effect is active
                opacity: (isDraggedPanel && isDragMode) ? 1 : (selectedIds.has(panel.id) ? 1 : (highlightedPanelId ? 0.7 : 1))
              }}
              onMouseDown={(e) => {
                // Allow dragging from anywhere on the panel, but not from interactive elements
                const target = e.target as HTMLElement;
                const isInteractiveElement = target.closest('button, input, select, textarea, [contenteditable], .no-drag');
                
                // Check if clicking near scrollbar area (within 15px of right edge of scrollable content)
                const scrollableElement = target.closest('.scrollable-content, .overflow-auto, .overflow-y-auto, .overflow-x-auto');
                let isNearScrollbar = false;
                if (scrollableElement) {
                  const rect = scrollableElement.getBoundingClientRect();
                  const clickX = e.clientX;
                  const rightEdge = rect.right;
                  isNearScrollbar = (rightEdge - clickX) <= 15; // Within 15px of right edge
                }
                
                // Prevent moving if locked
                if (panel.locked) {
                  // Still allow selection toggle but block drag init
                  if (currentTool === 'select') {
                    if (e.shiftKey) {
                      setSelectedIds(prev => {
                        const next = new Set(prev);
                        if (next.has(panel.id)) next.delete(panel.id); else next.add(panel.id);
                        return next;
                      });
                    } else if (!selectedIds.has(panel.id)) {
                      setSelectedIds(new Set([panel.id]));
                    }
                  } else {
                    setSelectedIds(new Set([panel.id]));
                  }
                  e.stopPropagation();
                  e.preventDefault();
                  return;
                }

                // Don't start dragging if clicking on interactive elements or near scrollbars
                if (isInteractiveElement || isNearScrollbar) {
                  return;
                }
                
                // Always stop propagation when clicking on a panel to prevent canvas panning
                e.stopPropagation();
                e.preventDefault();
                
                // Bring panel to front & manage selection
                bringPanelToFront(panel.id);
                // Multi-select logic
                if (currentTool === 'select') {
                  if (e.shiftKey) {
                    setSelectedIds(prev => {
                      const next = new Set(prev);
                      if (next.has(panel.id)) next.delete(panel.id); else next.add(panel.id);
                      return next;
                    });
                  } else if (!selectedIds.has(panel.id)) {
                    setSelectedIds(new Set([panel.id]));
                  }
                } else {
                  setSelectedIds(new Set([panel.id]));
                }
                
                const canvasPos = screenToCanvas(e.clientX, e.clientY);
                dispatch({
                  type: 'SET_DRAGGING_STATE',
                  payload: {
                    isDragging: true,
                    draggedPanel: panel.id,
                    dragStartTime: Date.now(),
                    dragStartPos: { x: e.clientX, y: e.clientY },
                    dragOffset: {
                      x: canvasPos.x - panel.x,
                      y: canvasPos.y - panel.y
                    }
                  }
                });
              }}
              onMouseUp={(e) => {
                // If we're not in drag mode and just released, it's a click for interaction
                if (draggedPanel === panel.id && !isDragMode) {
                  e.stopPropagation();
                  // Allow the click to propagate to child elements for interaction
                }
                dispatch({ type: 'STOP_DRAGGING' });
              }}
            >
              {/* Panel Overlay Controls - Compact row for long titles */}
              <div
                className="absolute top-1 right-1 flex items-center gap-0.5 z-50 bg-white/90 backdrop-blur-sm rounded-none px-1 py-0.5 shadow-sm"
                onMouseDown={(e) => { e.stopPropagation(); }}
                onClick={(e) => { e.stopPropagation(); }}
              >
                {/* Expand/Collapse toggle */}
                <button
                  className={overlayIconButtonClass}
                  title={panel.isExpanded ? "Collapse" : "Expand"}
                  onClick={(e) => {
                    e.stopPropagation();
                    updatePanel(panel.id, { isExpanded: !panel.isExpanded });
                  }}
                >
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={panel.isExpanded ? "M20 12H4" : "M12 4v16m8-8H4"} />
                  </svg>
                </button>
                {/* Lock toggle */}
                <button
                  className={overlayIconButtonClass}
                  title={panel.locked ? 'Unlock panel' : 'Lock panel'}
                  onClick={() => dispatch({ type: 'UPDATE_PANEL', payload: { id: panel.id, updates: { locked: !panel.locked } } })}
                >
                  {panel.locked ? (<Lock size={14} />) : (<Unlock size={14} />)}
                </button>
                {/* Hide toggle */}
                <button
                  className={overlayIconButtonClass}
                  title="Hide panel"
                  onClick={() => dispatch({ type: 'TOGGLE_PANEL_VISIBILITY', payload: panel.id })}
                >
                  <Eye size={14} />
                </button>
                {/* Remove button (from header) */}
                <button
                  className={overlayIconButtonClass}
                  title="Remove panel"
                  onClick={(e) => {
                    e.stopPropagation();
                    removePanel(panel.id);
                  }}
                >
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
              {panel.type === 'dataset' && (
                <DatasetPanel
                  panel={panel}
                  isDragging={draggedPanel === panel.id}
                  onCreateGraph={(datasetId, graphType) => {
                    addGraphPanel(panel.id, {
                      datasetId,
                      graphType,
                      datasetName: panel.data?.name || panel.data?.original_filename
                    });
                  }}
                  onCreateModel={(datasetId) => {
                    addModelPanel(panel.id, { 
                      datasetId,
                      datasetName: panel.data?.name || panel.data?.original_filename
                    });
                  }}
                  onOpenDataManipulation={(datasetId) => {
                    addDataManipulationPanel(panel.id, {
                      datasetId,
                      datasetName: panel.data?.name || panel.data?.original_filename
                    });
                  }}
                    onOpenMergePanel={(_, datasetId) => {
                      addMergePanel(panel.id, {
                        datasetId,
                        datasetName: panel.data?.name || panel.data?.original_filename
                      });
                    }}
                  onOpenDataEditor={(datasetId) => {
                    addDataEditorPanel(panel.id, {
                      datasetId,
                      datasetName: panel.data?.name || panel.data?.original_filename
                    });
                  }}
                  onPanelUpdate={(panelId, updates) => {
                    if (updates.remove) {
                      removePanel(panelId);
                    } else {
                      updatePanel(panelId, updates);
                    }
                  }}
                />
              )}
              {panel.type === 'graph' && (
                <GraphPanel
                  panel={panel}
                  onPanelUpdate={(panelId, updates) => {
                    if (updates.remove) {
                      removePanel(panelId);
                    } else {
                      updatePanel(panelId, updates);
                    }
                  }}
                />
              )}
              {panel.type === 'model' && (
                <ModelPanel
                  panel={panel}
                  isDragging={draggedPanel === panel.id}
                  onPanelUpdate={(panelId, updates) => {
                    if (updates.remove) {
                      removePanel(panelId);
                    } else {
                      updatePanel(panelId, updates);
                    }
                  }}
                  onCreateResultsPanel={(resultsData) => {
                    const resultsPanelId = addModelResultsPanel(panel.id, resultsData);

                    if (resultsPanelId && resultsData.autoCreateVisualization && resultsData.problem_type === 'regression') {
                      setTimeout(() => {
                        void requestVisualizationForPanel(resultsPanelId, 'pred_vs_actual');
                      }, 150);
                    }
                  }}
                />
              )}
              {panel.type === 'manipulation' && (
                <DataManipulationPanel
                  panel={panel}
                  isDragging={draggedPanel === panel.id}
                  onPanelUpdate={(panelId, updates) => {
                    if (updates.remove) {
                      removePanel(panelId);
                    } else {
                      updatePanel(panelId, updates);
                    }
                  }}
                  onDataUpdated={(datasetId) => {
                    // Refresh any connected panels
                  }}
                />
              )}
              {panel.type === 'data-editor' && (
                <DataEditorPanel
                  panel={panel}
                  isDragging={draggedPanel === panel.id}
                  onPanelUpdate={(panelId, updates) => {
                    if (updates.remove) {
                      removePanel(panelId);
                    } else {
                      updatePanel(panelId, updates);
                    }
                  }}
                  onDataUpdated={(datasetId) => {
                    // Refresh any connected panels
                  }}
                />
              )}
              {panel.type === 'merge' && (
                <MergePanel
                  panel={panel}
                  isDragging={draggedPanel === panel.id}
                  onPanelUpdate={(panelId, updates) => {
                    if (updates.remove) {
                      removePanel(panelId);
                    } else {
                      updatePanel(panelId, updates);
                    }
                  }}
                />
              )}
              {panel.type === 'model-results' && (
                <ModelResultsPanel
                  panel={panel}
                  isDragging={draggedPanel === panel.id}
                  onPanelUpdate={(panelId, updates) => {
                    if (updates.remove) {
                      removePanel(panelId);
                    } else {
                      updatePanel(panelId, updates);
                    }
                  }}
                  onCreateVisualizationPanel={(visualizationData) => {
                    addModelVisualizationPanel(panel.id, visualizationData);
                  }}
                />
              )}
              {panel.type === 'model-visualization' && (
                <ModelVisualizationPanel
                  panel={panel}
                  onPanelUpdate={(panelId, updates) => {
                    if (updates.remove) {
                      removePanel(panelId);
                    } else {
                      updatePanel(panelId, updates);
                    }
                  }}
                />
              )}
              
              {/* Highlight overlay for selected panels */}
              {(isHighlighted || selectedIds.has(panel.id)) && (
                <div className={`absolute inset-0 pointer-events-none rounded-none ${selectedIds.has(panel.id) ? 'border-2 border-blue-500 bg-blue-500/5' : 'border-4 border-blue-500 animate-pulse bg-blue-500/10'}`} />
              )}
            </div>
            );
          })}

          {panels.length === 0 && (
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
              <div className="pointer-events-auto text-center">
                <div className="mb-4 text-slate-500">This workspace has no panels yet.</div>
              </div>
            </div>
          )}

          {/* Always visible plus button for adding to canvas */}
          <div className="fixed bottom-12 right-6 z-[99999]">
            <div className="pointer-events-auto relative">
              <button
                ref={plusButtonRef}
                data-no-canvas="true"
                onPointerDown={(e) => { e.stopPropagation(); e.preventDefault(); }}
                onMouseDown={(e) => { e.stopPropagation(); e.preventDefault(); }}
                onMouseEnter={() => {
                  if (hoverTimeoutRef.current) { window.clearTimeout(hoverTimeoutRef.current as any); hoverTimeoutRef.current = null; }
                  setIsHovering(true);
                }}
                onMouseLeave={() => {
                  hoverTimeoutRef.current = window.setTimeout(() => { setIsHovering(false); if (!menuPersistent) setOpenMenu(false); hoverTimeoutRef.current = null; }, 150);
                }}
                onClick={(e) => { e.stopPropagation(); /* defer menu open to avoid click-through activating menu items */ try { throw new Error('plus-click'); } catch (err: any) { console.log('[InfiniteCanvas] plus clicked', { stack: err.stack }); } const willOpen = !openMenu; // suppress the next document click so the opening click doesn't close the menu
                  suppressNextDocumentClickRef.current = true; setOpenMenu(willOpen); setIsHovering(willOpen); setMenuPersistent(willOpen); }}
                className="bg-rose-600 hover:bg-rose-700 text-white p-4 rounded-full shadow-xl transition-colors"
                title="Add"
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                </svg>
              </button>
              {(isHovering || openMenu) && (typeof document !== 'undefined') && createPortal(
                <div id="infinite-plus-menu" data-no-canvas="true" role="dialog" aria-label="Add menu" style={{ position: 'fixed', left: menuPos ? `${menuPos.left}px` : undefined, top: menuPos ? `${menuPos.top}px` : undefined, right: menuPos ? undefined : 24, bottom: menuPos ? undefined : 80 }} className="bg-white rounded-lg shadow-lg p-2 w-48 text-sm text-gray-800 z-[120000] pointer-events-auto"
                  onMouseEnter={() => { if (hoverTimeoutRef.current) { window.clearTimeout(hoverTimeoutRef.current as any); hoverTimeoutRef.current = null; } setIsHovering(true); }}
                  onMouseLeave={() => { hoverTimeoutRef.current = window.setTimeout(() => { setIsHovering(false); if (!menuPersistent) setOpenMenu(false); hoverTimeoutRef.current = null; }, 150); }}
                >
                  <button
                    onPointerDown={(e) => { e.stopPropagation(); e.preventDefault(); /* don't perform actions on pointerdown to avoid accidental activation */ }}
                    onMouseDown={(e) => { e.stopPropagation(); e.preventDefault(); }}
                    onClick={(e) => {
                      e.stopPropagation();
                      try { throw new Error('menu-new-canvas-click'); } catch (err: any) { console.log('[InfiniteCanvas] menu New Canvas clicked', { stack: err.stack }); }
                      // Close the menu UI first
                      setMenuPersistent(false);
                      setIsHovering(false);
                      setOpenMenu(false);
                      // Create a new canvas tab centrally via the tabs store so the unified tab system tracks it
                      try {
                        const newId = useTabsStore.getState().createCanvasTab();
                        // Explicitly switch to the new tab to guarantee the active tab updates
                        try { useTabsStore.getState().switchToTab(newId); } catch (e) { /* ignore */ }
                        // Sync URL to the new active tab
                        try { useTabsStore.getState().updateUrl(newId); } catch (e) { console.warn('[InfiniteCanvas] failed to update URL for new tab', e); }
                        // Diagnostic: log current tabs and active id
                        try { console.log('[InfiniteCanvas] tabs after create', useTabsStore.getState().tabs.map(t=>t.id), 'active:', useTabsStore.getState().activeTabId); } catch (e) { /* ignore */ }
                      } catch (err) {
                        console.error('[InfiniteCanvas] failed to create canvas tab', err);
                        // As a fallback, navigate to the new-canvas route
                        try { router.push('/workspace/new-canvas'); } catch (e) { /* no-op */ }
                      }
                    }}
                    className="w-full text-left px-3 py-2 hover:bg-gray-100 rounded"
                  >New Canvas</button>
                  <button
                    onPointerDown={(e) => { e.stopPropagation(); e.preventDefault(); /* don't perform actions on pointerdown */ }}
                    onMouseDown={(e) => { e.stopPropagation(); e.preventDefault(); }}
                    onClick={(e) => {
                      e.stopPropagation();
                      try { throw new Error('menu-upload-click'); } catch (err: any) {
                        console.log('[InfiniteCanvas] menu Upload clicked', { stack: err.stack });
                      }
                      setOpenMenu(false);
                      const anchor = getCanvasCenter();
                      dispatch({ type: 'SET_UPLOAD_DIALOG', payload: { show: false, position: anchor } });
                      dispatch({ type: 'SET_UPLOAD_DIALOG', payload: { show: true } });
                    }}
                    className="w-full text-left px-3 py-2 hover:bg-gray-100 rounded"
                  >Upload Data</button>
                  <button
                    onPointerDown={(e) => { e.stopPropagation(); e.preventDefault(); /* don't perform actions on pointerdown */ }}
                    onMouseDown={(e) => { e.stopPropagation(); e.preventDefault(); }}
                    onClick={(e) => { e.stopPropagation(); try { throw new Error('menu-current-data-click'); } catch (err: any) { console.log('[InfiniteCanvas] menu Current Data clicked', { stack: err.stack }); } setMenuPersistent(false); setIsHovering(false); setOpenMenu(false); // Protect the chooser from the immediate document click
                      suppressNextDocumentClickRef.current = true; setShowChooser(true); }}
                    className="w-full text-left px-3 py-2 hover:bg-gray-100 rounded"
                  >Current Data</button>
                </div>
              , document.body)}
            </div>
          </div>
          
          {/* Unified Snapping Visual Feedback - DEBUG: Always show if snapTargets exist */}
          {snapTargets.length > 0 && (
            <svg
              className="absolute inset-0 pointer-events-none"
              style={{ width: '10000px', height: '10000px', zIndex: 40 }}
            >
              {snapTargets.filter(t => t.distance <= SNAP_DETECT_PX).map(target => {
                const targetPanel = panels.find(p => p.id === target.panelId);
                if (!targetPanel || !target.draggedRect) return null;
                const isActive = snapTargetId === target.id && target.distance <= SNAP_ACTIVATE_PX;
                const targetRect = { left: targetPanel.x, right: targetPanel.x + targetPanel.width, top: targetPanel.y, bottom: targetPanel.y + targetPanel.height };

                let indicatorX = 0, indicatorY = 0, indicatorWidth = 0, indicatorHeight = 0;
                switch (target.side) {
                  case 'top':
                    indicatorX = targetRect.left; 
                    indicatorY = targetRect.top - 3; 
                    indicatorWidth = targetPanel.width; 
                    indicatorHeight = 6; 
                    break;
                  case 'bottom':
                    indicatorX = targetRect.left; 
                    indicatorY = targetRect.bottom - 3; 
                    indicatorWidth = targetPanel.width; 
                    indicatorHeight = 6; 
                    break;
                  case 'left':
                    indicatorX = targetRect.left - 3; 
                    indicatorY = targetRect.top; 
                    indicatorWidth = 6; 
                    indicatorHeight = targetPanel.height; 
                    break;
                  case 'right':
                    indicatorX = targetRect.right - 3; 
                    indicatorY = targetRect.top; 
                    indicatorWidth = 6; 
                    indicatorHeight = targetPanel.height; 
                    break;
                }

                return (
                  <g key={target.id}>
                    {/* Blue snap line indicator */}
                    <rect
                      x={indicatorX}
                      y={indicatorY}
                      width={indicatorWidth}
                      height={indicatorHeight}
                      fill={isActive ? '#3b82f6' : '#60a5fa'}
                      fillOpacity={isActive ? 0.95 : 0.6}
                      rx={3}
                      className={isActive ? 'animate-pulse' : ''}
                    />
                    
                    {/* Connection line from dragged panel to target snap position */}
                    {isActive && (
                      <line
                        x1={target.draggedRect.x + target.draggedRect.width / 2}
                        y1={target.draggedRect.y + target.draggedRect.height / 2}
                        x2={target.x + target.draggedRect.width / 2}
                        y2={target.y + target.draggedRect.height / 2}
                        stroke="#3b82f6"
                        strokeWidth="2"
                        strokeDasharray="4,4"
                        opacity={0.8}
                      />
                    )}
                  </g>
                );
              })}
            </svg>
          )}

        </div>
      </div>


      {/* Context Menu */}
      {showContextMenu && (
        <div
          className="fixed bg-white rounded-lg shadow-lg border border-gray-200 py-2 z-50"
          style={{
            left: contextMenuPos.x,
            top: contextMenuPos.y
          }}
          onClick={(e) => e.stopPropagation()}
        >
          <button
            className="w-full px-4 py-2 text-left text-sm hover:bg-gray-100 flex items-center"
            onClick={() => {
              dispatch({ type: 'SET_UPLOAD_DIALOG', payload: { show: true } });
              dispatch({ type: 'SET_CONTEXT_MENU', payload: { show: false } });
            }}
          >
            Upload Dataset
          </button>
          <button
            className="w-full px-4 py-2 text-left text-sm hover:bg-gray-100 flex items-center"
            onClick={() => {
              // Test upload: add dataset centered on the current canvas viewport
              const testDataset = {
                dataset_id: 8,
                id: 8,
                name: `Synthetic Complete Data`,
                original_filename: 'synthetic_complete_data.csv',
                rows_clean: 2000,
                cols_clean: 8
              };
              const canvasCenterX = -viewport.x / viewport.zoom + (window.innerWidth / 2) / viewport.zoom;
              const canvasCenterY = -viewport.y / viewport.zoom + (window.innerHeight / 2) / viewport.zoom;
              addDatasetPanel(canvasCenterX, canvasCenterY, testDataset);
              dispatch({ type: 'SET_CONTEXT_MENU', payload: { show: false } });
            }}
          >
            Add Test Dataset
          </button>
        </div>
      )}

      {/* Upload Dialog */}
      <UploadDialog
        isOpen={showUploadDialog}
        onClose={() => dispatch({ type: 'SET_UPLOAD_DIALOG', payload: { show: false } })}
        onUploadSuccess={(dataset) => {
          try {
            const datasetId = dataset?.dataset_id ?? dataset?.id ?? Date.now();
            const normalizedData = {
              ...dataset,
              id: datasetId,
              dataset_id: datasetId,
              name: dataset?.name || dataset?.original_filename || `Dataset ${datasetId}`
            };

            const hasValidAnchor =
              typeof uploadPosition?.x === 'number' &&
              typeof uploadPosition?.y === 'number' &&
              !(uploadPosition.x === 0 && uploadPosition.y === 0 && panels.length > 0);

            const anchor = hasValidAnchor ? uploadPosition : getCanvasCenter();
            const datasetSize = PANEL_SIZES.DATASET.collapsed;
            const spawnX = (anchor?.x ?? 0) - datasetSize.width / 2;
            const spawnY = (anchor?.y ?? 0) - datasetSize.height / 2;

            addDatasetPanel(spawnX, spawnY, normalizedData);
          } catch (err) {
            console.error('[InfiniteCanvas] failed to add dataset panel after upload', err);
          }
        }}
        position={contextMenuPos}
        existingDatasets={panels
          .filter(p => p.type === 'dataset' && p.data?.dataset_id)
          .map(p => ({
            id: p.data.dataset_id ? parseInt(p.data.dataset_id.toString()) : 0,
            name: p.data.name || p.data.original_filename || `Dataset ${p.data.dataset_id}`
          }))
        }
      />

      {/* Dataset chooser modal */}
      {showChooser && (
        <div data-no-canvas="true" className="fixed inset-0 z-40 flex items-center justify-center" onPointerDown={(e) => { e.stopPropagation(); }}>
          <div data-no-canvas="true" className="absolute inset-0 bg-black/40" onClick={(e) => { e.stopPropagation(); setShowChooser(false); }} onPointerDown={(e) => { e.stopPropagation(); e.preventDefault(); setShowChooser(false); }} />
          <div data-no-canvas="true" className="relative bg-white rounded-lg shadow-2xl w-11/12 max-w-2xl p-4" onPointerDown={(e) => { e.stopPropagation(); }}>
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-lg font-semibold">Choose a dataset</h3>
              <button onPointerDown={(e) => { e.stopPropagation(); e.preventDefault(); setShowChooser(false); }} onClick={(e) => { e.stopPropagation(); setShowChooser(false); }} className="text-gray-600 hover:text-gray-900">Close</button>
            </div>
            <div className="mb-3">
              <input value={query} onChange={(e) => setQuery(e.target.value)} className="w-full border rounded px-3 py-2" placeholder="Search datasets..." />
            </div>
            <div className="max-h-72 overflow-auto">
              {loadingDatasets && <div className="p-3">Loading...</div>}
              {!loadingDatasets && datasets.length === 0 && <div className="p-3 text-sm text-gray-500">No datasets found.</div>}
              {!loadingDatasets && datasets.filter(d => `${d.name || d.title || ''}`.toLowerCase().includes(query.toLowerCase())).map(ds => (
                <div key={ds.id} className="p-2 border-b last:border-b-0 flex items-center justify-between" onPointerDown={(e) => { e.stopPropagation(); }}>
                  <div>
                    <div className="font-medium">{ds.name || ds.title || `Dataset ${ds.id}`}</div>
                    <div className="text-xs text-gray-500">Rows: {ds.row_count ?? ds.rows ?? '-'}</div>
                  </div>
                  <div>
                    <button onPointerDown={(e) => { e.stopPropagation(); e.preventDefault(); onSelectDataset(ds.id); }} onClick={(e) => { e.stopPropagation(); onSelectDataset(ds.id); }} className="bg-indigo-600 hover:bg-indigo-700 text-white px-3 py-1 rounded">Open</button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
      {/* Layers Panel */}
      <LayersPanel
        panels={panels}
        folders={folders}
        selectedPanelId={selectedPanelId}
        onPanelSelect={handlePanelSelect}
        onPanelVisibilityToggle={handlePanelVisibilityToggle}
        onPanelLockToggle={(panelId) => {
          const p = panels.find(pp => pp.id === panelId);
          if (!p) return;
          dispatch({ type: 'UPDATE_PANEL', payload: { id: panelId, updates: { locked: !p.locked } } });
        }}
        onPanelRename={handlePanelRename}
        onRemovePanel={removePanel}
  onReorderPanels={(newPanels) => dispatch({ type: 'SET_PANELS', payload: newPanels })}
        onCreateFolder={handleCreateFolder}
        onDeleteFolder={handleDeleteFolder}
        onDeleteFolderOnly={handleDeleteFolderOnly}
        onRenameFolder={handleRenameFolder}
        onToggleFolder={handleToggleFolder}
        onMovePanelToFolder={handleMovePanelToFolder}
        visiblePanels={visiblePanels}
        isCollapsed={isLayersPanelCollapsed}
        onToggleCollapse={handleLayersPanelToggle}
      />
      {/* Feature Bar */}
  <div className="fixed bottom-12 left-1/2 -translate-x-1/2 z-[2000] pointer-events-none select-none">
        <FeatureBar
          currentTool={currentTool}
          onChangeTool={(t) => setCurrentTool(t)}
          onClearWorkspace={() => {
            setSelectedIds(new Set());
            clearWorkspace();
          }}
        />
      </div>
        </>
      )}
    </div>
  );
};

export default React.memo(InfiniteCanvas);