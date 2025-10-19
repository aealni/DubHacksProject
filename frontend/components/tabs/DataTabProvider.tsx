import React, { createContext, useContext, useEffect } from 'react';
import { create } from 'zustand';
import { subscribeWithSelector } from 'zustand/middleware';
import { TabProviderProps, DataTabContextValue } from '../../types/tabs';
import { useTabsStore } from '../../stores/tabsStore';

// Data grid store interface
interface DataTabStore {
  tabId: string;
  isDirty: boolean;
  
  // Data grid state
  datasets: any[];
  selectedDataset: any | null;
  gridData: any[];
  columns: any[];
  filters: any[];
  sortConfig: { column: string; direction: 'asc' | 'desc' } | null;
  
  // Actions
  markDirty: () => void;
  markClean: () => void;
  loadDataset: (datasetId: string) => void;
  updateCell: (rowIndex: number, columnKey: string, value: any) => void;
  addFilter: (filter: any) => void;
  removeFilter: (filterId: string) => void;
  setSortConfig: (config: any) => void;
  cleanup: () => void;
}

const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:8000';

// Create namespaced data store factory
const createDataTabStore = (tabId: string) => create<DataTabStore>()(
  subscribeWithSelector((set, get) => ({
    tabId,
    isDirty: false,
    datasets: [],
    selectedDataset: null,
    gridData: [],
    columns: [],
    filters: [],
    sortConfig: null,
    
    markDirty: () => {
      set({ isDirty: true });
      useTabsStore.getState().markTabDirty(tabId);
    },
    
    markClean: () => {
      set({ isDirty: false });
      useTabsStore.getState().markTabClean(tabId);
    },
    
    loadDataset: async (datasetId: string) => {
      try {
        // Fetch preview rows and metadata from backend
        const [pRes, mRes] = await Promise.all([
          fetch(`${BACKEND_URL}/dataset/${datasetId}/preview?limit=200&offset=0`),
          fetch(`${BACKEND_URL}/dataset/${datasetId}/metadata`)
        ]);
        if (!pRes.ok) throw new Error('Failed to load dataset preview');
        const pJson = await pRes.json();
        const preview = pJson.preview || pJson;
        const rows = preview.rows || [];
        const cols = (preview.columns || []).map((c: string) => ({ key: c, label: c, type: 'string' }));
        const meta = mRes.ok ? await mRes.json() : null;

        set({
          selectedDataset: { id: datasetId, name: meta?.name || meta?.title || `Dataset ${datasetId}`, meta },
          gridData: rows,
          columns: cols
        });
      } catch (error) {
        console.error('Failed to load dataset:', error);
      }
    },
    
    updateCell: (rowIndex: number, columnKey: string, value: any) => {
      const { gridData } = get();
      const newGridData = [...gridData];
      if (newGridData[rowIndex]) {
        newGridData[rowIndex] = { ...newGridData[rowIndex], [columnKey]: value };
        set({ gridData: newGridData });
        get().markDirty();
      }
    },
    
    addFilter: (filter: any) => {
      const { filters } = get();
      set({ filters: [...filters, filter] });
      get().markDirty();
    },
    
    removeFilter: (filterId: string) => {
      const { filters } = get();
      set({ filters: filters.filter(f => f.id !== filterId) });
      get().markDirty();
    },
    
    setSortConfig: (config: any) => {
      set({ sortConfig: config });
    },
    
    cleanup: () => {
      console.log(`Cleaning up data tab: ${tabId}`);
    }
  }))
);

// Store registry
const dataStoreRegistry = new Map<string, ReturnType<typeof createDataTabStore>>();

const getDataStore = (tabId: string) => {
  if (!dataStoreRegistry.has(tabId)) {
    dataStoreRegistry.set(tabId, createDataTabStore(tabId));
  }
  return dataStoreRegistry.get(tabId)!;
};

const cleanupDataStore = (tabId: string) => {
  const store = dataStoreRegistry.get(tabId);
  if (store) {
    store.getState().cleanup();
    dataStoreRegistry.delete(tabId);
  }
};

// Data tab context
const DataTabContext = createContext<DataTabContextValue | null>(null);

export const useDataTab = () => {
  const context = useContext(DataTabContext);
  if (!context) {
    throw new Error('useDataTab must be used within a DataTabProvider');
  }
  return context;
};

// Data grid component
const DataGridContent: React.FC<{ tabId: string }> = ({ tabId }) => {
  const dataStore = getDataStore(tabId);
  const { gridData, columns, selectedDataset, loadDataset } = dataStore();

  // Sample data for demonstration
  useEffect(() => {
    // Mock loading a dataset
    const mockColumns = [
      { key: 'id', label: 'ID', type: 'number' },
      { key: 'name', label: 'Name', type: 'string' },
      { key: 'email', label: 'Email', type: 'string' },
      { key: 'age', label: 'Age', type: 'number' },
      { key: 'city', label: 'City', type: 'string' }
    ];
    
    const mockData = Array.from({ length: 100 }, (_, i) => ({
      id: i + 1,
      name: `User ${i + 1}`,
      email: `user${i + 1}@example.com`,
      age: 20 + Math.floor(Math.random() * 50),
      city: ['New York', 'Los Angeles', 'Chicago', 'Houston', 'Phoenix'][Math.floor(Math.random() * 5)]
    }));

    dataStore.setState({ 
      columns: mockColumns, 
      gridData: mockData,
      selectedDataset: { id: 'mock', name: 'Sample Data' }
    });
  }, [tabId]);

  return (
    <div className="h-full w-full flex flex-col bg-white">
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-gray-200">
        <h2 className="text-lg font-semibold text-gray-900">
          Data Grid
        </h2>
        <div className="text-sm text-gray-500">
          {selectedDataset ? `Dataset: ${selectedDataset.name}` : 'No dataset loaded'}
        </div>
      </div>

      {/* Data grid */}
      <div className="flex-1 overflow-auto">
        {gridData.length > 0 ? (
          <table className="w-full border-collapse">
            <thead className="bg-gray-50 sticky top-0">
              <tr>
                {columns.map(column => (
                  <th
                    key={column.key}
                    className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider border-b border-gray-200"
                  >
                    {column.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {gridData.slice(0, 50).map((row, rowIndex) => (
                <tr key={rowIndex} className="hover:bg-gray-50">
                  {columns.map(column => (
                    <td
                      key={column.key}
                      className="px-4 py-3 text-sm text-gray-900 border-b border-gray-100"
                    >
                      {row[column.key]}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <div className="flex items-center justify-center h-full">
            <div className="text-center">
              <div className="text-gray-400 mb-2">
                <svg className="w-12 h-12 mx-auto" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M3 4a1 1 0 011-1h12a1 1 0 011 1v2a1 1 0 01-1 1H4a1 1 0 01-1-1V4zm0 4a1 1 0 011-1h12a1 1 0 011 1v2a1 1 0 01-1 1H4a1 1 0 01-1-1V8zm0 4a1 1 0 011-1h12a1 1 0 011 1v2a1 1 0 01-1 1H4a1 1 0 01-1-1v-2z" clipRule="evenodd" />
                </svg>
              </div>
              <p className="text-gray-600">No data loaded</p>
              <button className="mt-2 px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 transition-colors">
                Load Dataset
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Tab identifier */}
      <div className="absolute top-4 right-4 bg-black bg-opacity-50 text-white px-2 py-1 rounded text-xs">
        Data Tab: {tabId.slice(-8)}
      </div>
    </div>
  );
};

// Data tab provider
const DataTabProvider: React.FC<TabProviderProps> = ({ 
  tabId, 
  isActive, 
  children 
}) => {
  const dataStore = getDataStore(tabId);
  const state = dataStore();
  // Try to auto-load dataset if the tab has meta indicating a datasetId
  const tab = useTabsStore(state => state.tabs.find(t => t.id === tabId));

  React.useEffect(() => {
    if (tab?.meta?.datasetId) {
      // loadDataset expects a string id
      state.loadDataset(String(tab.meta.datasetId));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab?.meta?.datasetId, tabId]);

  useEffect(() => {
    return () => {
      if (!isActive) {
        cleanupDataStore(tabId);
      }
    };
  }, [tabId, isActive]);

  const contextValue: DataTabContextValue = {
    tabId: state.tabId,
    isDirty: state.isDirty,
    markDirty: state.markDirty,
    markClean: state.markClean,
    cleanup: state.cleanup,
    dataState: {
      datasets: state.datasets,
      selectedDataset: state.selectedDataset,
      gridData: state.gridData,
      columns: state.columns,
      filters: state.filters,
      sortConfig: state.sortConfig
    },
    dataActions: {
      loadDataset: state.loadDataset,
      updateCell: state.updateCell,
      addFilter: state.addFilter,
      removeFilter: state.removeFilter,
      setSortConfig: state.setSortConfig
    }
  };

  return (
    <DataTabContext.Provider value={contextValue}>
      <div className="h-full w-full">
        {children || <DataGridContent tabId={tabId} />}
      </div>
    </DataTabContext.Provider>
  );
};

export default DataTabProvider;
