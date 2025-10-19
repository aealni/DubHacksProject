// Tab system type definitions

export type TabType = 'canvas' | 'data' | 'graphs' | 'models';

export interface Tab {
  id: string;
  type: TabType;
  title: string;
  isCloseable: boolean;
  meta?: any;
  isDirty?: boolean; // Has unsaved changes
  createdAt: number;
  lastAccessedAt: number;
  order: number;
}

export interface TabState {
  tabs: Tab[];
  activeTabId: string | null;
  nextTabOrder: number;
}

// Per-tab store interface - each tab type implements this
export interface TabStore {
  tabId: string;
  isDirty: boolean;
  markDirty: () => void;
  markClean: () => void;
  cleanup: () => void; // Called when tab is unmounted
}

// Tab provider props
export interface TabProviderProps {
  tabId: string;
  isActive: boolean;
  children?: React.ReactNode;
}

// URL state for deep linking
export interface TabUrlState {
  tab?: string; // active tab ID
  tabId?: string; // specific tab content ID
}

// Persistence structure
export interface TabsPersistState {
  tabs: Tab[];
  activeTabId: string | null;
  nextTabOrder: number;
  version: number; // For migration handling
}

// Tab operations
export interface TabActions {
  // Tab management
  createTab: (type: TabType, title?: string, meta?: any) => string;
  closeTab: (tabId: string, force?: boolean) => boolean;
  switchToTab: (tabId: string) => void;
  reorderTabs: (tabIds: string[]) => void;
  
  // Tab properties
  updateTabTitle: (tabId: string, title: string) => void;
  markTabDirty: (tabId: string) => void;
  markTabClean: (tabId: string) => void;
  
  // Shortcuts
  switchToTabByIndex: (index: number) => void;
  createCanvasTab: () => string;
  closeActiveTab: (force?: boolean) => boolean;
  
  // Persistence
  loadFromStorage: () => void;
  saveToStorage: () => void;
  
  // URL sync
  syncWithUrl: () => void;
  updateUrl: (tabId?: string) => void;
}

// Combined store interface
export interface TabsStore extends TabState, TabActions {}

// Context types for tab providers
export interface CanvasTabContextValue extends TabStore {
  // Canvas-specific state
  canvasState: any; // Will be typed more specifically later
  canvasActions: any;
}

export interface DataTabContextValue extends TabStore {
  // Data grid state
  dataState: any;
  dataActions: any;
}

export interface GraphsTabContextValue extends TabStore {
  // Graphs/charts state
  graphsState: any;
  graphsActions: any;
}

export interface ModelsTabContextValue extends TabStore {
  // Models workspace state
  modelsState: any;
  modelsActions: any;
}

// Event types for tab system
export interface TabEvent {
  type: 'create' | 'close' | 'switch' | 'reorder' | 'dirty' | 'clean';
  tabId: string;
  previousTabId?: string;
  data?: any;
}

// Keyboard shortcut configuration
export interface TabShortcuts {
  newCanvasTab: string; // 'Ctrl+Alt+N' | 'Cmd+Alt+N'
  closeTab: string; // 'Ctrl+W' | 'Cmd+W'
  switchTab: string[]; // ['Ctrl+1', 'Ctrl+2', ...] | ['Cmd+1', 'Cmd+2', ...]
}

// Component props
export interface BottomTabsProps {
  className?: string;
  onTabEvent?: (event: TabEvent) => void;
}

export interface WorkspaceOutletProps {
  className?: string;
}

export interface TabButtonProps {
  tab: Tab;
  isActive: boolean;
  onSwitch: (tabId: string) => void;
  onClose: (tabId: string) => void;
  onContextMenu?: (event: React.MouseEvent, tabId: string) => void;
  isDraggable?: boolean;
}

// Constants
export const TAB_TYPES: Record<TabType, { label: string; icon?: string; defaultTitle: string }> = {
  canvas: { label: 'Canvas', defaultTitle: 'Canvas' },
  data: { label: 'Data', defaultTitle: 'Data Grid' },
  graphs: { label: 'Graphs', defaultTitle: 'Graphs' },
  models: { label: 'Models', defaultTitle: 'Models' }
};

export const STORAGE_KEYS = {
  TABS: 'mango.tabs.v1',
  PREFERENCES: 'mango.tabs.preferences.v1'
} as const;

export const TAB_LIMITS = {
  MAX_TABS: 20,
  MIN_TABS: 1,
  MAX_TITLE_LENGTH: 50
} as const;