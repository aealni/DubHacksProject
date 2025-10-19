import React, { createContext, useContext, useEffect } from 'react';
import { create } from 'zustand';
import { subscribeWithSelector } from 'zustand/middleware';
import { TabProviderProps, GraphsTabContextValue } from '../../types/tabs';
import { useTabsStore } from '../../stores/tabsStore';

// Graphs store interface
interface GraphsTabStore {
  tabId: string;
  isDirty: boolean;
  
  // Graphs state
  charts: any[];
  selectedChart: any | null;
  availableDatasets: any[];
  chartTypes: string[];
  
  // Actions
  markDirty: () => void;
  markClean: () => void;
  createChart: (config: any) => void;
  updateChart: (chartId: string, config: any) => void;
  deleteChart: (chartId: string) => void;
  selectChart: (chartId: string) => void;
  cleanup: () => void;
}

// Create namespaced graphs store factory
const createGraphsTabStore = (tabId: string) => create<GraphsTabStore>()(
  subscribeWithSelector((set, get) => ({
    tabId,
    isDirty: false,
    charts: [],
    selectedChart: null,
    availableDatasets: [],
    chartTypes: ['bar', 'line', 'pie', 'scatter', 'histogram'],
    
    markDirty: () => {
      set({ isDirty: true });
      useTabsStore.getState().markTabDirty(tabId);
    },
    
    markClean: () => {
      set({ isDirty: false });
      useTabsStore.getState().markTabClean(tabId);
    },
    
    createChart: (config: any) => {
      const newChart = {
        id: `chart_${Date.now()}`,
        ...config,
        createdAt: Date.now()
      };
      
      const { charts } = get();
      set({ 
        charts: [...charts, newChart],
        selectedChart: newChart
      });
      get().markDirty();
    },
    
    updateChart: (chartId: string, config: any) => {
      const { charts } = get();
      const updatedCharts = charts.map(chart => 
        chart.id === chartId ? { ...chart, ...config, updatedAt: Date.now() } : chart
      );
      set({ charts: updatedCharts });
      get().markDirty();
    },
    
    deleteChart: (chartId: string) => {
      const { charts, selectedChart } = get();
      const updatedCharts = charts.filter(chart => chart.id !== chartId);
      const newSelectedChart = selectedChart?.id === chartId ? null : selectedChart;
      
      set({ 
        charts: updatedCharts,
        selectedChart: newSelectedChart
      });
      get().markDirty();
    },
    
    selectChart: (chartId: string) => {
      const { charts } = get();
      const chart = charts.find(c => c.id === chartId);
      if (chart) {
        set({ selectedChart: chart });
      }
    },
    
    cleanup: () => {
      console.log(`Cleaning up graphs tab: ${tabId}`);
    }
  }))
);

// Store registry
const graphsStoreRegistry = new Map<string, ReturnType<typeof createGraphsTabStore>>();

const getGraphsStore = (tabId: string) => {
  if (!graphsStoreRegistry.has(tabId)) {
    graphsStoreRegistry.set(tabId, createGraphsTabStore(tabId));
  }
  return graphsStoreRegistry.get(tabId)!;
};

const cleanupGraphsStore = (tabId: string) => {
  const store = graphsStoreRegistry.get(tabId);
  if (store) {
    store.getState().cleanup();
    graphsStoreRegistry.delete(tabId);
  }
};

// Graphs tab context
const GraphsTabContext = createContext<GraphsTabContextValue | null>(null);

export const useGraphsTab = () => {
  const context = useContext(GraphsTabContext);
  if (!context) {
    throw new Error('useGraphsTab must be used within a GraphsTabProvider');
  }
  return context;
};

// Simple chart component for demo
const SimpleChart: React.FC<{ chart: any }> = ({ chart }) => {
  return (
    <div className="bg-white rounded-lg border border-gray-200 p-4">
      <h3 className="text-lg font-semibold mb-2">{chart.title || 'Untitled Chart'}</h3>
      <div className="h-48 bg-gray-100 rounded flex items-center justify-center">
        <div className="text-center">
          <div className="text-gray-400 mb-2">
            <svg className="w-12 h-12 mx-auto" fill="currentColor" viewBox="0 0 20 20">
              <path d="M2 11a1 1 0 011-1h2a1 1 0 011 1v5a1 1 0 01-1 1H3a1 1 0 01-1-1v-5zM8 7a1 1 0 011-1h2a1 1 0 011 1v9a1 1 0 01-1 1H9a1 1 0 01-1-1V7zM14 4a1 1 0 011-1h2a1 1 0 011 1v12a1 1 0 01-1 1h-2a1 1 0 01-1-1V4z" />
            </svg>
          </div>
          <p className="text-gray-600">{chart.type} Chart</p>
          <p className="text-sm text-gray-500">Data: {chart.dataset || 'No dataset'}</p>
        </div>
      </div>
    </div>
  );
};

// Graphs content component
const GraphsContent: React.FC<{ tabId: string }> = ({ tabId }) => {
  const graphsStore = getGraphsStore(tabId);
  const { charts, selectedChart, createChart, deleteChart, selectChart } = graphsStore();

  // Sample charts for demonstration
  useEffect(() => {
    if (charts.length === 0) {
      const sampleCharts = [
        {
          id: 'chart_1',
          title: 'Sales Overview',
          type: 'bar',
          dataset: 'sales_data',
          createdAt: Date.now() - 86400000
        },
        {
          id: 'chart_2',
          title: 'User Growth',
          type: 'line',
          dataset: 'user_data',
          createdAt: Date.now() - 43200000
        },
        {
          id: 'chart_3',
          title: 'Revenue Distribution',
          type: 'pie',
          dataset: 'revenue_data',
          createdAt: Date.now()
        }
      ];
      
      graphsStore.setState({ charts: sampleCharts });
    }
  }, [tabId]);

  const handleCreateChart = () => {
    createChart({
      title: `New Chart ${charts.length + 1}`,
      type: 'bar',
      dataset: 'sample_data'
    });
  };

  return (
    <div className="h-full w-full flex flex-col bg-gray-50">
      {/* Header */}
      <div className="flex items-center justify-between p-4 bg-white border-b border-gray-200">
        <h2 className="text-lg font-semibold text-gray-900">
          Graphs & Charts
        </h2>
        <button
          onClick={handleCreateChart}
          className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 transition-colors"
        >
          New Chart
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 p-4 overflow-auto">
        {charts.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {charts.map(chart => (
              <div
                key={chart.id}
                className={`relative cursor-pointer transition-transform hover:scale-105 ${
                  selectedChart?.id === chart.id ? 'ring-2 ring-blue-500' : ''
                }`}
                onClick={() => selectChart(chart.id)}
              >
                <SimpleChart chart={chart} />
                
                {/* Chart actions */}
                <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      deleteChart(chart.id);
                    }}
                    className="p-1 bg-red-600 text-white rounded hover:bg-red-700"
                    title="Delete chart"
                  >
                    <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v6a1 1 0 102 0V8a1 1 0 00-1-1z" clipRule="evenodd" />
                    </svg>
                  </button>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="flex items-center justify-center h-full">
            <div className="text-center">
              <div className="text-gray-400 mb-4">
                <svg className="w-16 h-16 mx-auto" fill="currentColor" viewBox="0 0 20 20">
                  <path d="M2 11a1 1 0 011-1h2a1 1 0 011 1v5a1 1 0 01-1 1H3a1 1 0 01-1-1v-5zM8 7a1 1 0 011-1h2a1 1 0 011 1v9a1 1 0 01-1 1H9a1 1 0 01-1-1V7zM14 4a1 1 0 011-1h2a1 1 0 011 1v12a1 1 0 01-1 1h-2a1 1 0 01-1-1V4z" />
                </svg>
              </div>
              <p className="text-gray-600 mb-4">No charts created yet</p>
              <button
                onClick={handleCreateChart}
                className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 transition-colors"
              >
                Create Your First Chart
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Tab identifier */}
      <div className="absolute top-4 right-4 bg-black bg-opacity-50 text-white px-2 py-1 rounded text-xs">
        Graphs Tab: {tabId.slice(-8)}
      </div>
    </div>
  );
};

// Graphs tab provider
const GraphsTabProvider: React.FC<TabProviderProps> = ({ 
  tabId, 
  isActive, 
  children 
}) => {
  const graphsStore = getGraphsStore(tabId);
  const state = graphsStore();

  useEffect(() => {
    return () => {
      if (!isActive) {
        cleanupGraphsStore(tabId);
      }
    };
  }, [tabId, isActive]);

  const contextValue: GraphsTabContextValue = {
    tabId: state.tabId,
    isDirty: state.isDirty,
    markDirty: state.markDirty,
    markClean: state.markClean,
    cleanup: state.cleanup,
    graphsState: {
      charts: state.charts,
      selectedChart: state.selectedChart,
      availableDatasets: state.availableDatasets,
      chartTypes: state.chartTypes
    },
    graphsActions: {
      createChart: state.createChart,
      updateChart: state.updateChart,
      deleteChart: state.deleteChart,
      selectChart: state.selectChart
    }
  };

  return (
    <GraphsTabContext.Provider value={contextValue}>
      <div className="h-full w-full">
        {children || <GraphsContent tabId={tabId} />}
      </div>
    </GraphsTabContext.Provider>
  );
};

export default GraphsTabProvider;
