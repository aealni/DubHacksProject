import React, { createContext, useContext, useEffect } from 'react';
import { create } from 'zustand';
import { subscribeWithSelector } from 'zustand/middleware';
import { TabProviderProps, ModelsTabContextValue } from '../../types/tabs';
import { useTabsStore } from '../../stores/tabsStore';

// Models store interface
interface ModelsTabStore {
  tabId: string;
  isDirty: boolean;
  
  // Models state
  models: any[];
  selectedModel: any | null;
  availableAlgorithms: string[];
  trainingJobs: any[];
  predictions: any[];
  
  // Actions
  markDirty: () => void;
  markClean: () => void;
  createModel: (config: any) => void;
  updateModel: (modelId: string, config: any) => void;
  deleteModel: (modelId: string) => void;
  selectModel: (modelId: string) => void;
  trainModel: (modelId: string) => void;
  makePrediction: (modelId: string, data: any) => void;
  cleanup: () => void;
}

// Create namespaced models store factory
const createModelsTabStore = (tabId: string) => create<ModelsTabStore>()(
  subscribeWithSelector((set, get) => ({
    tabId,
    isDirty: false,
    models: [],
    selectedModel: null,
    availableAlgorithms: ['linear_regression', 'random_forest', 'neural_network', 'svm', 'naive_bayes'],
    trainingJobs: [],
    predictions: [],
    
    markDirty: () => {
      set({ isDirty: true });
      useTabsStore.getState().markTabDirty(tabId);
    },
    
    markClean: () => {
      set({ isDirty: false });
      useTabsStore.getState().markTabClean(tabId);
    },
    
    createModel: (config: any) => {
      const newModel = {
        id: `model_${Date.now()}`,
        ...config,
        status: 'draft',
        createdAt: Date.now(),
        accuracy: null,
        trainingTime: null
      };
      
      const { models } = get();
      set({ 
        models: [...models, newModel],
        selectedModel: newModel
      });
      get().markDirty();
    },
    
    updateModel: (modelId: string, config: any) => {
      const { models } = get();
      const updatedModels = models.map(model => 
        model.id === modelId ? { ...model, ...config, updatedAt: Date.now() } : model
      );
      set({ models: updatedModels });
      get().markDirty();
    },
    
    deleteModel: (modelId: string) => {
      const { models, selectedModel } = get();
      const updatedModels = models.filter(model => model.id !== modelId);
      const newSelectedModel = selectedModel?.id === modelId ? null : selectedModel;
      
      set({ 
        models: updatedModels,
        selectedModel: newSelectedModel
      });
      get().markDirty();
    },
    
    selectModel: (modelId: string) => {
      const { models } = get();
      const model = models.find(m => m.id === modelId);
      if (model) {
        set({ selectedModel: model });
      }
    },
    
    trainModel: async (modelId: string) => {
      const { models, trainingJobs } = get();
      
      // Create training job
      const trainingJob = {
        id: `job_${Date.now()}`,
        modelId,
        status: 'training',
        startedAt: Date.now(),
        progress: 0
      };
      
      set({ trainingJobs: [...trainingJobs, trainingJob] });
      
      // Update model status
      const updatedModels = models.map(model => 
        model.id === modelId ? { ...model, status: 'training' } : model
      );
      set({ models: updatedModels });
      
      // Simulate training (in real app, this would be an API call)
      setTimeout(() => {
        const finalModels = get().models.map(model => 
          model.id === modelId ? { 
            ...model, 
            status: 'trained',
            accuracy: 0.85 + Math.random() * 0.1,
            trainingTime: Math.floor(Math.random() * 300) + 60
          } : model
        );
        
        const finalJobs = get().trainingJobs.map(job => 
          job.id === trainingJob.id ? { 
            ...job, 
            status: 'completed',
            completedAt: Date.now(),
            progress: 100
          } : job
        );
        
        set({ models: finalModels, trainingJobs: finalJobs });
        get().markDirty();
      }, 3000);
      
      get().markDirty();
    },
    
    makePrediction: (modelId: string, data: any) => {
      const { predictions } = get();
      const newPrediction = {
        id: `pred_${Date.now()}`,
        modelId,
        input: data,
        output: Math.random() > 0.5 ? 'Positive' : 'Negative', // Mock prediction
        confidence: 0.7 + Math.random() * 0.3,
        createdAt: Date.now()
      };
      
      set({ predictions: [...predictions, newPrediction] });
      get().markDirty();
    },
    
    cleanup: () => {
      console.log(`Cleaning up models tab: ${tabId}`);
    }
  }))
);

// Store registry
const modelsStoreRegistry = new Map<string, ReturnType<typeof createModelsTabStore>>();

const getModelsStore = (tabId: string) => {
  if (!modelsStoreRegistry.has(tabId)) {
    modelsStoreRegistry.set(tabId, createModelsTabStore(tabId));
  }
  return modelsStoreRegistry.get(tabId)!;
};

const cleanupModelsStore = (tabId: string) => {
  const store = modelsStoreRegistry.get(tabId);
  if (store) {
    store.getState().cleanup();
    modelsStoreRegistry.delete(tabId);
  }
};

// Models tab context
const ModelsTabContext = createContext<ModelsTabContextValue | null>(null);

export const useModelsTab = () => {
  const context = useContext(ModelsTabContext);
  if (!context) {
    throw new Error('useModelsTab must be used within a ModelsTabProvider');
  }
  return context;
};

// Model card component
const ModelCard: React.FC<{ model: any; onSelect: () => void; onDelete: () => void; onTrain: () => void }> = ({ 
  model, 
  onSelect, 
  onDelete, 
  onTrain 
}) => {
  const getStatusColor = (status: string) => {
    switch (status) {
      case 'draft': return 'bg-gray-100 text-gray-800';
      case 'training': return 'bg-yellow-100 text-yellow-800';
      case 'trained': return 'bg-green-100 text-green-800';
      case 'error': return 'bg-red-100 text-red-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  return (
    <div className="bg-white rounded-lg border border-gray-200 p-4 hover:shadow-md transition-shadow cursor-pointer">
      <div onClick={onSelect}>
        <div className="flex items-start justify-between mb-3">
          <h3 className="text-lg font-semibold text-gray-900">{model.name || 'Untitled Model'}</h3>
          <span className={`px-2 py-1 rounded-full text-xs font-medium ${getStatusColor(model.status)}`}>
            {model.status}
          </span>
        </div>
        
        <p className="text-sm text-gray-600 mb-3">{model.algorithm}</p>
        
        {model.accuracy && (
          <div className="mb-3">
            <div className="flex justify-between text-sm text-gray-600 mb-1">
              <span>Accuracy</span>
              <span>{(model.accuracy * 100).toFixed(1)}%</span>
            </div>
            <div className="w-full bg-gray-200 rounded-full h-2">
              <div 
                className="bg-blue-600 h-2 rounded-full" 
                style={{ width: `${model.accuracy * 100}%` }}
              ></div>
            </div>
          </div>
        )}
        
        <div className="text-xs text-gray-500">
          Created: {new Date(model.createdAt).toLocaleDateString()}
        </div>
      </div>
      
      <div className="flex gap-2 mt-3 pt-3 border-t border-gray-100">
        {model.status === 'draft' && (
          <button
            onClick={(e) => { e.stopPropagation(); onTrain(); }}
            className="flex-1 px-3 py-1 bg-blue-600 text-white text-sm rounded hover:bg-blue-700 transition-colors"
          >
            Train
          </button>
        )}
        <button
          onClick={(e) => { e.stopPropagation(); onDelete(); }}
          className="px-3 py-1 bg-red-600 text-white text-sm rounded hover:bg-red-700 transition-colors"
        >
          Delete
        </button>
      </div>
    </div>
  );
};

// Models content component
const ModelsContent: React.FC<{ tabId: string }> = ({ tabId }) => {
  const modelsStore = getModelsStore(tabId);
  const { 
    models, 
    selectedModel, 
    availableAlgorithms, 
    trainingJobs,
    createModel, 
    deleteModel, 
    selectModel, 
    trainModel 
  } = modelsStore();

  // Sample models for demonstration
  useEffect(() => {
    if (models.length === 0) {
      const sampleModels = [
        {
          id: 'model_1',
          name: 'Customer Churn Predictor',
          algorithm: 'random_forest',
          status: 'trained',
          accuracy: 0.87,
          trainingTime: 120,
          createdAt: Date.now() - 86400000
        },
        {
          id: 'model_2',
          name: 'Sales Forecaster',
          algorithm: 'linear_regression',
          status: 'draft',
          createdAt: Date.now() - 43200000
        }
      ];
      
      modelsStore.setState({ models: sampleModels });
    }
  }, [tabId]);

  const handleCreateModel = () => {
    const algorithmIndex = Math.floor(Math.random() * availableAlgorithms.length);
    createModel({
      name: `Model ${models.length + 1}`,
      algorithm: availableAlgorithms[algorithmIndex],
      dataset: 'sample_data'
    });
  };

  const activeTrainingJobs = trainingJobs.filter(job => job.status === 'training');

  return (
    <div className="h-full w-full flex flex-col bg-gray-50">
      {/* Header */}
      <div className="flex items-center justify-between p-4 bg-white border-b border-gray-200">
        <div>
          <h2 className="text-lg font-semibold text-gray-900">
            Machine Learning Models
          </h2>
          {activeTrainingJobs.length > 0 && (
            <p className="text-sm text-blue-600">
              {activeTrainingJobs.length} model(s) training...
            </p>
          )}
        </div>
        <button
          onClick={handleCreateModel}
          className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 transition-colors"
        >
          New Model
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 p-4 overflow-auto">
        {models.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {models.map(model => (
              <ModelCard
                key={model.id}
                model={model}
                onSelect={() => selectModel(model.id)}
                onDelete={() => deleteModel(model.id)}
                onTrain={() => trainModel(model.id)}
              />
            ))}
          </div>
        ) : (
          <div className="flex items-center justify-center h-full">
            <div className="text-center">
              <div className="text-gray-400 mb-4">
                <svg className="w-16 h-16 mx-auto" fill="currentColor" viewBox="0 0 20 20">
                  <path d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
              <p className="text-gray-600 mb-4">No models created yet</p>
              <button
                onClick={handleCreateModel}
                className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 transition-colors"
              >
                Create Your First Model
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Tab identifier */}
      <div className="absolute top-4 right-4 bg-black bg-opacity-50 text-white px-2 py-1 rounded text-xs">
        Models Tab: {tabId.slice(-8)}
      </div>
    </div>
  );
};

// Models tab provider
const ModelsTabProvider: React.FC<TabProviderProps> = ({ 
  tabId, 
  isActive, 
  children 
}) => {
  const modelsStore = getModelsStore(tabId);
  const state = modelsStore();

  useEffect(() => {
    return () => {
      if (!isActive) {
        cleanupModelsStore(tabId);
      }
    };
  }, [tabId, isActive]);

  const contextValue: ModelsTabContextValue = {
    tabId: state.tabId,
    isDirty: state.isDirty,
    markDirty: state.markDirty,
    markClean: state.markClean,
    cleanup: state.cleanup,
    modelsState: {
      models: state.models,
      selectedModel: state.selectedModel,
      availableAlgorithms: state.availableAlgorithms,
      trainingJobs: state.trainingJobs,
      predictions: state.predictions
    },
    modelsActions: {
      createModel: state.createModel,
      updateModel: state.updateModel,
      deleteModel: state.deleteModel,
      selectModel: state.selectModel,
      trainModel: state.trainModel,
      makePrediction: state.makePrediction
    }
  };

  return (
    <ModelsTabContext.Provider value={contextValue}>
      <div className="h-full w-full">
        {children || <ModelsContent tabId={tabId} />}
      </div>
    </ModelsTabContext.Provider>
  );
};

export default ModelsTabProvider;
