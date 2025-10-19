import React, { createContext, useContext, useEffect } from 'react';
import { create } from 'zustand';
import { subscribeWithSelector } from 'zustand/middleware';
import IsolatedCanvas from '../IsolatedCanvas';
import { TabProviderProps, CanvasTabContextValue } from '../../types/tabs';
import { useTabsStore } from '../../stores/tabsStore';
import { onTabEvent } from '../../stores/tabsStore';

// Canvas-specific store interface (extends the existing canvas logic)
interface CanvasTabStore {
  tabId: string;
  isDirty: boolean;
  
  // Canvas state would go here - for now, we'll use a simple structure
  // In a real implementation, this would include all the canvas state from InfiniteCanvas
  canvasData: any;
  
  // Actions
  markDirty: () => void;
  markClean: () => void;
  updateCanvasData: (data: any) => void;
  cleanup: () => void;
}

// Create namespaced canvas store factory
const createCanvasTabStore = (tabId: string) => create<CanvasTabStore>()(
  subscribeWithSelector((set, get) => ({
    tabId,
    isDirty: false,
    canvasData: null,
    
    markDirty: () => {
      set({ isDirty: true });
      useTabsStore.getState().markTabDirty(tabId);
    },
    
    markClean: () => {
      set({ isDirty: false });
      useTabsStore.getState().markTabClean(tabId);
    },
    
    updateCanvasData: (data: any) => {
      set({ canvasData: data });
      get().markDirty();
    },
    
    cleanup: () => {
      // Cleanup any canvas-specific resources
      console.log(`Cleaning up canvas tab: ${tabId}`);
    }
  }))
);

// Store registry to manage multiple canvas instances
const canvasStoreRegistry = new Map<string, ReturnType<typeof createCanvasTabStore>>();

const getCanvasStore = (tabId: string) => {
  if (!canvasStoreRegistry.has(tabId)) {
    canvasStoreRegistry.set(tabId, createCanvasTabStore(tabId));
  }
  return canvasStoreRegistry.get(tabId)!;
};

// Canvas tab context
const CanvasTabContext = createContext<CanvasTabContextValue | null>(null);

export const useCanvasTab = () => {
  const context = useContext(CanvasTabContext);
  if (!context) {
    throw new Error('useCanvasTab must be used within a CanvasTabProvider');
  }
  return context;
};

// Canvas wrapper component that creates isolated canvas instances
const CanvasTabContent: React.FC<{ tabId: string }> = ({ tabId }) => {
  const canvasStore = getCanvasStore(tabId);
  const { markDirty, markClean } = canvasStore();
  // Listen for tab switch events to proactively persist canvas state for this tab when it is being left
  useEffect(() => {
    const unsubscribe = onTabEvent((event) => {
      if (event.type === 'switch' && event.previousTabId === tabId) {
        // Mark clean to clear dirty indicator post-save
        try {
          // InfiniteCanvas already autosaves to localStorage; here we could trigger a custom event if needed
          markClean();
        } catch (e) {
          console.warn('CanvasTabProvider save-on-switch failed', e);
        }
      }
    });
    return () => { unsubscribe(); };
  }, [tabId, markClean]);

  // Use IsolatedCanvas to create completely separate canvas instances
  return (
    <div className="h-full w-full relative">
      {/* Create a unique IsolatedCanvas instance for this tab */}
      <div key={`canvas-${tabId}`} className="h-full w-full">
        <IsolatedCanvas key={`isolated-canvas-${tabId}`} tabId={tabId} />
      </div>
    </div>
  );
};

// Canvas tab provider component
const CanvasTabProvider: React.FC<TabProviderProps> = ({ 
  tabId, 
  isActive, 
  children 
}) => {
  const canvasStore = getCanvasStore(tabId);
  const state = canvasStore();

  const contextValue: CanvasTabContextValue = {
    tabId: state.tabId,
    isDirty: state.isDirty,
    markDirty: state.markDirty,
    markClean: state.markClean,
    cleanup: state.cleanup,
    canvasState: state.canvasData,
    canvasActions: {
      updateCanvasData: state.updateCanvasData
    }
  };

  return (
    <CanvasTabContext.Provider value={contextValue}>
      <div className="h-full w-full">
        {/* Render children if provided, otherwise render default canvas content */}
        {children || <CanvasTabContent tabId={tabId} />}
      </div>
    </CanvasTabContext.Provider>
  );
};

export default CanvasTabProvider;
