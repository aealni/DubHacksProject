import { create } from 'zustand';
import { subscribeWithSelector } from 'zustand/middleware';
import { 
  Tab, 
  TabType, 
  TabsStore, 
  TabEvent, 
  TabsPersistState,
  TAB_TYPES,
  STORAGE_KEYS,
  TAB_LIMITS
} from '../types/tabs';

// Helper functions
let tabIdCounter = 1;

const generateTabId = (): string => {
  if (typeof window === 'undefined') {
    // During SSR, use predictable IDs
    return `tab_${tabIdCounter++}`;
  }
  // On client, use timestamp for uniqueness
  return `tab_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
};

const createDefaultTab = (type: TabType, title?: string, order: number = 0, meta?: any): Tab => ({
  id: generateTabId(),
  type,
  title: title || TAB_TYPES[type].defaultTitle,
  meta,
  isCloseable: type !== 'canvas' || order > 0, // First canvas tab is not closeable
  isDirty: false,
  createdAt: Date.now(),
  lastAccessedAt: Date.now(),
  order
});

// Load persisted state
const loadPersistedState = (): Partial<TabsPersistState> => {
  if (typeof window === 'undefined') return {};
  
  try {
    const stored = localStorage.getItem(STORAGE_KEYS.TABS);
    if (!stored) return {};
    
    const parsed = JSON.parse(stored) as TabsPersistState;
    
    // Validate and migrate if needed
    if (!parsed.version || parsed.version < 1) {
      console.warn('Outdated tab state, resetting');
      return {};
    }
    
    return parsed;
  } catch (error) {
    console.error('Failed to load tab state:', error);
    return {};
  }
};

// Save state to localStorage
const saveStateToStorage = (state: TabsPersistState) => {
  if (typeof window === 'undefined') return;
  
  try {
    localStorage.setItem(STORAGE_KEYS.TABS, JSON.stringify(state));
  } catch (error) {
    console.error('Failed to save tab state:', error);
  }
};

// URL synchronization helpers
const getUrlParams = (): { tab?: string; tabId?: string } => {
  if (typeof window === 'undefined') return {};
  
  const params = new URLSearchParams(window.location.search);
  return {
    tab: params.get('tab') || undefined,
    tabId: params.get('tabId') || undefined
  };
};

const updateUrlParams = (activeTabId?: string) => {
  if (typeof window === 'undefined') return;
  
  const url = new URL(window.location.href);
  
  if (activeTabId) {
    url.searchParams.set('tab', activeTabId);
  } else {
    url.searchParams.delete('tab');
  }
  
  window.history.replaceState({}, '', url.toString());
};

// Initial state setup
const createInitialState = () => {
  // Always start with a basic state during SSR
  const defaultTab = createDefaultTab('canvas', 'Canvas 1', 0);
  
  return {
    tabs: [defaultTab],
    activeTabId: defaultTab.id,
    nextTabOrder: 1
  };
};

// Create the store
export const useTabsStore = create<TabsStore>()(
  subscribeWithSelector((set, get) => ({
    // Initial state
    ...createInitialState(),

    // Tab management actions
    createTab: (type: TabType, title?: string, meta?: any) => {
      const state = get();
      
      if (state.tabs.length >= TAB_LIMITS.MAX_TABS) {
        console.warn(`Maximum tab limit (${TAB_LIMITS.MAX_TABS}) reached`);
        return '';
      }
      
  const newTab = createDefaultTab(type, title, state.nextTabOrder, meta);
      
      // DEBUG: log tab creation with stack trace
      try {
        throw new Error('createTab called');
      } catch (e: any) {
        console.log('[tabsStore] createTab called', { type, title, meta });
        // Print an explicit trace for easier inspection in browser consoles
        console.trace('[tabsStore] createTab trace');
        // Also print raw stack string
        console.log(e.stack);
      }

      set({
        tabs: [...state.tabs, newTab],
        activeTabId: newTab.id,
        nextTabOrder: state.nextTabOrder + 1
      });
      
      // Emit event
      emitTabEvent({
        type: 'create',
        tabId: newTab.id,
        previousTabId: state.activeTabId || undefined
      });
      
  console.log('[tabsStore] createTab created', newTab.id);
      return newTab.id;
    },

    closeTab: (tabId: string, force: boolean = false) => {
      const state = get();
      const tabToClose = state.tabs.find(t => t.id === tabId);
      
      if (!tabToClose) return false;
      
      // Prevent closing if not closeable and not forced
      if (!tabToClose.isCloseable && !force) {
        return false;
      }
      
      // Prevent closing if dirty and not forced
      if (tabToClose.isDirty && !force) {
        // In a real app, you'd show a confirmation dialog here
        const shouldClose = window.confirm(
          `Tab "${tabToClose.title}" has unsaved changes. Close anyway?`
        );
        if (!shouldClose) return false;
      }
      
      // Don't allow closing the last tab
      if (state.tabs.length <= TAB_LIMITS.MIN_TABS && !force) {
        return false;
      }

      // Clean up canvas data if it's a canvas tab
      if (tabToClose.type === 'canvas' && typeof window !== 'undefined') {
        localStorage.removeItem(`infinite-canvas-workspace-${tabId}`);
      }

      const remainingTabs = state.tabs.filter(t => t.id !== tabId);
      let newActiveTabId = state.activeTabId;
      
      // If we're closing the active tab, find a new one
      if (state.activeTabId === tabId) {
        // Try to activate the tab to the right, then left, then first
        const currentIndex = state.tabs.findIndex(t => t.id === tabId);
        if (currentIndex < remainingTabs.length) {
          newActiveTabId = remainingTabs[currentIndex]?.id || null;
        } else if (currentIndex > 0) {
          newActiveTabId = remainingTabs[currentIndex - 1]?.id || null;
        } else {
          newActiveTabId = remainingTabs[0]?.id || null;
        }
      }
      
      set({
        tabs: remainingTabs,
        activeTabId: newActiveTabId
      });
      
      // Emit event
      emitTabEvent({
        type: 'close',
        tabId,
        previousTabId: state.activeTabId || undefined
      });
      
      return true;
    },

    switchToTab: (tabId: string) => {
      const state = get();
      const tab = state.tabs.find(t => t.id === tabId);
      
      if (!tab || state.activeTabId === tabId) return;
      
      // Update last accessed time
      const updatedTabs = state.tabs.map(t => 
        t.id === tabId 
          ? { ...t, lastAccessedAt: Date.now() }
          : t
      );
      
      const previousTabId = state.activeTabId;
      
      set({
        tabs: updatedTabs,
        activeTabId: tabId
      });
      
      // Emit event
      emitTabEvent({
        type: 'switch',
        tabId,
        previousTabId: previousTabId || undefined
      });
    },

    reorderTabs: (tabIds: string[]) => {
      const state = get();
      
      // Validate all tab IDs exist
      if (tabIds.length !== state.tabs.length || 
          !tabIds.every(id => state.tabs.some(t => t.id === id))) {
        console.warn('Invalid tab order provided');
        return;
      }
      
      // Reorder tabs maintaining their properties but updating order
      const reorderedTabs = tabIds.map((id, index) => {
        const tab = state.tabs.find(t => t.id === id)!;
        return { ...tab, order: index };
      });
      
      set({ tabs: reorderedTabs });
      
      // Emit event
      emitTabEvent({
        type: 'reorder',
        tabId: state.activeTabId || '',
        data: { newOrder: tabIds }
      });
    },

    // Tab property updates
    updateTabTitle: (tabId: string, title: string) => {
      const state = get();
      const trimmedTitle = title.trim().slice(0, TAB_LIMITS.MAX_TITLE_LENGTH);
      
      const updatedTabs = state.tabs.map(t => 
        t.id === tabId ? { ...t, title: trimmedTitle } : t
      );
      
      set({ tabs: updatedTabs });
    },

    markTabDirty: (tabId: string) => {
      const state = get();
      const updatedTabs = state.tabs.map(t => 
        t.id === tabId ? { ...t, isDirty: true } : t
      );
      
      set({ tabs: updatedTabs });
      
      emitTabEvent({
        type: 'dirty',
        tabId
      });
    },

    markTabClean: (tabId: string) => {
      const state = get();
      const updatedTabs = state.tabs.map(t => 
        t.id === tabId ? { ...t, isDirty: false } : t
      );
      
      set({ tabs: updatedTabs });
      
      emitTabEvent({
        type: 'clean',
        tabId
      });
    },

    // Shortcut actions
    switchToTabByIndex: (index: number) => {
      const state = get();
      const tab = state.tabs.sort((a, b) => a.order - b.order)[index];
      if (tab) {
        get().switchToTab(tab.id);
      }
    },

    createCanvasTab: () => {
      const state = get();
      const canvasTabCount = state.tabs.filter(t => t.type === 'canvas').length;
      const title = `Canvas ${canvasTabCount + 1}`;
      try {
        throw new Error('createCanvasTab invoked');
      } catch (e: any) {
        console.log('[tabsStore] createCanvasTab invoked');
        console.trace('[tabsStore] createCanvasTab trace');
        console.log(e.stack);
      }
      const id = get().createTab('canvas', title);
      console.log('[tabsStore] createCanvasTab created', id);
      return id;
    },

    closeActiveTab: (force: boolean = false) => {
      const state = get();
      return state.activeTabId ? get().closeTab(state.activeTabId, force) : false;
    },

    // Persistence
    loadFromStorage: () => {
      if (typeof window === 'undefined') return;
      
      const persisted = loadPersistedState();
      const urlParams = getUrlParams();
      const currentState = get();
      
      if (Object.keys(persisted).length > 0) {
        let activeTabId = persisted.activeTabId || currentState.activeTabId;
        
        // Override with URL if present and valid
        if (urlParams.tab && persisted.tabs?.find((t: Tab) => t.id === urlParams.tab)) {
          activeTabId = urlParams.tab;
        }
        
        set({
          tabs: persisted.tabs || currentState.tabs,
          activeTabId,
          nextTabOrder: persisted.nextTabOrder || currentState.nextTabOrder
        });
      } else {
        // If no persisted state, still check URL
        if (urlParams.tab && currentState.tabs.find((t: Tab) => t.id === urlParams.tab)) {
          get().switchToTab(urlParams.tab);
        }
      }
    },

    saveToStorage: () => {
      const state = get();
      const persistState: TabsPersistState = {
        tabs: state.tabs,
        activeTabId: state.activeTabId,
        nextTabOrder: state.nextTabOrder,
        version: 1
      };
      saveStateToStorage(persistState);
    },

    // URL synchronization
    syncWithUrl: () => {
      const urlParams = getUrlParams();
      const state = get();
      
      if (urlParams.tab && state.tabs.find(t => t.id === urlParams.tab)) {
        get().switchToTab(urlParams.tab);
      }
    },

    updateUrl: (tabId?: string) => {
      const state = get();
      updateUrlParams(tabId || state.activeTabId || undefined);
    }
  }))
);

// Event system for tab events
type TabEventListener = (event: TabEvent) => void;
const tabEventListeners = new Set<TabEventListener>();

export const onTabEvent = (listener: TabEventListener) => {
  tabEventListeners.add(listener);
  return () => tabEventListeners.delete(listener);
};

const emitTabEvent = (event: TabEvent) => {
  tabEventListeners.forEach(listener => {
    try {
      listener(event);
    } catch (error) {
      console.error('Tab event listener error:', error);
    }
  });
};

// Auto-save subscription
let isHydrated = false;

if (typeof window !== 'undefined') {
  useTabsStore.subscribe(
    (state) => state,
    (state) => {
      if (!isHydrated) {
        isHydrated = true;
        return;
      }
      
      // Auto-save to localStorage
      state.saveToStorage();
      
      // Sync URL
      state.updateUrl();
    }
  );
}

// Export convenient selectors
export const useActiveTab = () => useTabsStore(state => 
  state.tabs.find(t => t.id === state.activeTabId)
);

export const useTabById = (tabId: string) => useTabsStore(state => 
  state.tabs.find(t => t.id === tabId)
);

export const useTabsByType = (type: TabType) => useTabsStore(state => 
  state.tabs.filter(t => t.type === type)
);