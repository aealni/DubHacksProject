import React, { useState, useEffect } from 'react';

const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:8000';

interface ModelPanelProps {
  panel: {
    id: string;
    type: string;
    x: number;
    y: number;
    width: number;
    height: number;
    data: any;
    isExpanded?: boolean;
  };
  onPanelUpdate: (panelId: string, updates: any) => void;
  onCreateResultsPanel?: (resultsData: any) => void;
  isDragging?: boolean;
}

export const ModelPanel: React.FC<ModelPanelProps> = ({ panel, onPanelUpdate, onCreateResultsPanel, isDragging = false }) => {
  const [modelType, setModelType] = useState('linear_regression');
  const [targetColumn, setTargetColumn] = useState('');
  const [featureColumns, setFeatureColumns] = useState<string[]>([]);
  const [selectedXAxis, setSelectedXAxis] = useState(''); // For visualization when multiple features
  const [availableColumns, setAvailableColumns] = useState<string[]>([]);
  const [isTraining, setIsTraining] = useState(false);
  const [autoUpdate, setAutoUpdate] = useState(true); // Auto-update model on feature changes
  const [error, setError] = useState<string | null>(null);
  const [isResizing, setIsResizing] = useState(false);
  const [resizeType, setResizeType] = useState<string>(''); // 'n', 's', 'e', 'w', 'nw', 'ne', 'sw', 'se'
  const [resizeStart, setResizeStart] = useState({ x: 0, y: 0, width: 0, height: 0, panelX: 0, panelY: 0 });
  const [lastTrainedConfig, setLastTrainedConfig] = useState<{target: string, features: string[]} | null>(null);

  // Use the expanded state from the panel prop, default to false if not set
  const isExpanded = panel.isExpanded ?? true;
  
  // Function to toggle expand state
  const toggleExpanded = () => {
    onPanelUpdate(panel.id, { isExpanded: !isExpanded });
  };

  // Calculate optimal panel size based on content
  const calculateOptimalSize = () => {
    if (!isExpanded) {
      return { width: 320, height: 80 }; // Collapsed size - header only
    }
    
    // Large expanded size to show ALL model configuration
    let optimalWidth = 700;
    let optimalHeight = 500;
    
    if (availableColumns.length > 0) {
      // Space for column selection UI
      optimalHeight = Math.max(600, optimalHeight + Math.min(100, availableColumns.length * 5));
    }
    
    return { width: optimalWidth, height: optimalHeight };
  };

  // Calculate content scale based on panel size vs expanded size
  const getContentScale = () => {
    const expandedWidth = 700; // Base expanded width
    const expandedHeight = 500; // Base expanded height
    
    // Calculate scale based on width (use the smaller scale to maintain aspect ratio)
    const widthScale = panel.width / expandedWidth;
    const heightScale = (panel.height - 80) / (expandedHeight - 80); // Account for header height
    
    return Math.min(widthScale, heightScale);
  };

  // Auto-resize panel when content changes
  useEffect(() => {
    if (isExpanded && !isResizing) {
      const { width, height } = calculateOptimalSize();
      onPanelUpdate(panel.id, { width, height });
    }
  }, [isExpanded, availableColumns]);

  // Fetch available columns when panel is created or dataset changes
  useEffect(() => {
    const datasetId = panel.data?.datasetId;
    console.log('ModelPanel useEffect - datasetId:', datasetId);
    console.log('ModelPanel useEffect - panel.data:', panel.data);
    
    if (datasetId) {
      fetchAvailableColumns();
    } else {
      console.warn('No datasetId found in panel data');
    }
  }, [panel.data?.datasetId]);

  const fetchAvailableColumns = async () => {
    const datasetId = panel.data?.datasetId;
    console.log('fetchAvailableColumns called for dataset:', datasetId);
    
    if (!datasetId) {
      console.error('No datasetId available for fetching columns');
      setError('No dataset ID available');
      return;
    }
    
    try {
      const response = await fetch(`${BACKEND_URL}/datasets/${parseInt(datasetId)}/columns`);
      console.log('Columns response status:', response.status);
      if (response.ok) {
        const data = await response.json();
        console.log('Columns data received:', data);
        // Backend returns {numerical: [...], categorical: [...], datetime: [...], all: [...]}
        // We want to use 'all' which contains all column names
        const columns = data.all || data.columns || [];
        console.log('Parsed columns:', columns);
        setAvailableColumns(columns);
        // Auto-select first column as target if none selected
        if (!targetColumn && columns.length > 0) {
          setTargetColumn(columns[0]);
        }
      } else {
        console.error('Failed to fetch columns, status:', response.status);
        setError(`Failed to fetch columns (status: ${response.status})`);
      }
    } catch (error) {
      console.error('Error fetching columns:', error);
      setError('Failed to fetch columns');
    }
  };

  const trainModel = async () => {
    const datasetId = panel.data?.datasetId || panel.data?.dataset_id || panel.data?.id;
    console.log('trainModel called', { targetColumn, featureColumns, datasetId, panelData: panel.data });
    
    if (!datasetId) {
      console.error('No datasetId found in panel data:', panel.data);
      setError('No dataset ID available');
      return;
    }
    
    if (!targetColumn) {
      setError('Please select a target column');
      return;
    }

    if (featureColumns.length === 0) {
      setError('Please select at least one feature column');
      return;
    }

    console.log('Starting model training with:', {
      datasetId,
      model_type: modelType,
      target_column: targetColumn,
      feature_columns: featureColumns
    });

    setIsTraining(true);
    setError(null);

    try {
      const requestBody = {
        target: targetColumn,
        problem_type: 'regression', // Since we only support linear regression for now
        include_columns: featureColumns.length > 0 ? featureColumns : undefined,
        test_size: 0.2,
        random_state: 42,
        normalize_numeric: true,
        encode_categoricals: 'auto',
        feature_interactions: false // Keep it simple for now
      };
      
      console.log('Sending request to:', `${BACKEND_URL}/datasets/${parseInt(datasetId)}/model/runs`);
      console.log('Request body:', requestBody);
      
      const response = await fetch(`${BACKEND_URL}/datasets/${parseInt(datasetId)}/model/runs`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(requestBody),
      });

      console.log('Training response status:', response.status);

      if (response.ok) {
        const result = await response.json();
        console.log('Training result:', result);
        
        // Update last trained config for auto-update comparison
        setLastTrainedConfig({
          target: targetColumn,
          features: [...featureColumns]
        });
        
        // Create a new results panel with the model results
        if (onCreateResultsPanel) {
          const resultsData = {
            run_id: result.run_id,
            datasetId: result.dataset_id, // Use consistent naming
            dataset_id: result.dataset_id, // Keep original for compatibility
            metrics: result.metrics,
            summary: result.summary,
            feature_importance: result.feature_importance,
            sample_predictions: result.sample_predictions,
            status: result.status,
            target: result.target,
            problem_type: result.problem_type,
            created_at: result.created_at,
            completed_at: result.completed_at,
            autoCreateVisualization: true, // Always auto-create visualization
            modelConfig: {
              target: targetColumn,
              features: featureColumns,
              problem_type: 'regression',
              selectedXAxis: selectedXAxis
            }
          };
          
          onCreateResultsPanel(resultsData);
          
          // Always auto-create regression visualization for regression models
          // The InfiniteCanvas will handle this via the autoCreateVisualization flag
        } else {
          console.warn('onCreateResultsPanel callback not provided');
        }
        
      } else {
        const errorText = await response.text();
        console.error('Training failed with status:', response.status, 'Error:', errorText);
        try {
          const errorData = JSON.parse(errorText);
          setError(errorData.detail || 'Failed to train model');
        } catch {
          setError(`Failed to train model (status: ${response.status})`);
        }
      }
    } catch (error) {
      console.error('Training error:', error);
      setError('Failed to train model: ' + (error instanceof Error ? error.message : String(error)));
    } finally {
      setIsTraining(false);
    }
  };

  const modelTypes = [
    { value: 'linear_regression', label: 'Linear Regression', icon: '' }
  ];

  const handleColumnToggle = (column: string) => {
    const newFeatureColumns = featureColumns.includes(column) 
      ? featureColumns.filter(c => c !== column)
      : [...featureColumns, column];
    
    setFeatureColumns(newFeatureColumns);
    
    // Auto-select first feature as X-axis if none selected
    if (newFeatureColumns.length > 0 && !selectedXAxis) {
      setSelectedXAxis(newFeatureColumns[0]);
    }
    
    // Remove X-axis selection if the selected feature is unchecked
    if (selectedXAxis === column && !newFeatureColumns.includes(column)) {
      setSelectedXAxis(newFeatureColumns.length > 0 ? newFeatureColumns[0] : '');
    }
  };

  // Removed auto-update effect - no more automatic retraining on feature changes

  const handleSelectAllFeatures = () => {
    const allFeatures = availableColumns.filter(col => col !== targetColumn);
    setFeatureColumns(allFeatures);
    if (allFeatures.length > 0 && !selectedXAxis) {
      setSelectedXAxis(allFeatures[0]);
    }
  };

  const handleClearFeatures = () => {
    setFeatureColumns([]);
    setSelectedXAxis('');
  };

  // Resize handlers
  const handleResizeStart = (e: React.MouseEvent, type: string) => {
    e.preventDefault();
    e.stopPropagation();
    setIsResizing(true);
    setResizeType(type);
    setResizeStart({
      x: e.clientX,
      y: e.clientY,
      width: panel.width,
      height: panel.height,
      panelX: panel.x,
      panelY: panel.y,
    });
  };

  // Drag handlers - removed, handled by InfiniteCanvas
  
  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (isResizing) {
        const deltaX = e.clientX - resizeStart.x;
        const deltaY = e.clientY - resizeStart.y;
        
        let updates: any = {};
        
        if (resizeType.includes('e')) {
          updates.width = Math.max(200, resizeStart.width + deltaX);
        }
        if (resizeType.includes('w')) {
          const newWidth = Math.max(200, resizeStart.width - deltaX);
          const widthChange = newWidth - resizeStart.width;
          updates.width = newWidth;
          updates.x = resizeStart.panelX - widthChange;
        }
        if (resizeType.includes('s')) {
          updates.height = Math.max(150, resizeStart.height + deltaY);
        }
        if (resizeType.includes('n')) {
          const newHeight = Math.max(150, resizeStart.height - deltaY);
          const heightChange = newHeight - resizeStart.height;
          updates.height = newHeight;
          updates.y = resizeStart.panelY - heightChange;
        }
        
        onPanelUpdate(panel.id, updates);
      }
    };

    const handleMouseUp = () => {
      setIsResizing(false);
      setResizeType('');
    };

    if (isResizing) {
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
    }

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isResizing, resizeStart, resizeType, panel.id, onPanelUpdate]);

  return (
    <div
      className={`panel-content relative bg-white border border-purple-300 rounded-none shadow-xl overflow-hidden transition-all duration-300 ease-out ${
        isDragging ? 'opacity-90 shadow-2xl scale-105' : 'shadow-lg'
      }`}
      style={{
        width: panel.width,
        height: panel.height,
        pointerEvents: isDragging ? 'none' : 'auto'
      }}
    >
      {/* Header - simplified without action buttons */}
  <div className="bg-gradient-to-r from-purple-50 to-purple-100 px-4 py-3 pr-24 rounded-none border-b border-purple-200">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="w-3 h-3 bg-purple-500 rounded-none shadow-sm"></div>
            <div>
              <h3 className="font-semibold text-gray-800 text-sm">Model Training</h3>
              <div className="text-xs text-gray-600 mt-1">
                Dataset: {panel.data?.datasetName || panel.data?.datasetId}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Content */}
      <div 
        className="p-4 overflow-y-auto scrollable-content" 
        style={{ 
          transform: `scale(${getContentScale()})`,
          transformOrigin: 'top left',
          width: `${100 / getContentScale()}%`,
          height: `calc(${(panel.height - 80) / getContentScale()}px - 48px)`
        }}
      >
        {isExpanded && (
          <div className="space-y-6">
            {/* Header Section with Model Type and Auto-Update Toggle */}
            <div className="bg-gradient-to-r from-purple-50 to-indigo-50 rounded-none p-4 border border-purple-200">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-semibold text-purple-800">Model Configuration</h3>
                <div className="flex items-center space-x-2">
                  <label className="flex items-center space-x-2 text-sm">
                    <input
                      type="checkbox"
                      checked={autoUpdate}
                      onChange={(e) => setAutoUpdate(e.target.checked)}
                      className="rounded-none text-purple-600 focus:ring-purple-500"
                    />
                    <span className="text-gray-700">Auto-update</span>
                  </label>
                </div>
              </div>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Model Type Selection */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Model Type</label>
                  <select
                    value={modelType}
                    onChange={(e) => setModelType(e.target.value)}
                    className="w-full p-3 border border-gray-300 rounded-none text-sm focus:ring-2 focus:ring-purple-500 focus:border-purple-500"
                  >
                    {modelTypes.map((type) => (
                      <option key={type.value} value={type.value}>
                        {type.icon} {type.label}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Target Column Selection */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Target Column</label>
                  <select
                    value={targetColumn}
                    onChange={(e) => setTargetColumn(e.target.value)}
                    className="w-full p-3 border border-gray-300 rounded-none text-sm focus:ring-2 focus:ring-purple-500 focus:border-purple-500"
                  >
                    <option value="">Select target column...</option>
                    {availableColumns.map((column) => (
                      <option key={column} value={column}>{column}</option>
                    ))}
                  </select>
                </div>
              </div>
            </div>

            {/* Feature Selection Section */}
            <div className="bg-white rounded-none border border-gray-200 p-4">
              <div className="flex justify-between items-center mb-4">
                <div>
                  <h4 className="text-md font-semibold text-gray-800">
                    Feature Selection
                  </h4>
                  <p className="text-sm text-gray-600">
                    {featureColumns.length} of {availableColumns.filter(col => col !== targetColumn).length} features selected
                  </p>
                </div>
                <div className="flex space-x-2">
                  <button
                    onClick={handleSelectAllFeatures}
                    className="px-3 py-1.5 text-xs font-medium bg-purple-100 hover:bg-purple-200 text-purple-700 rounded-none transition-colors"
                  >
                    Select All
                  </button>
                  <button
                    onClick={handleClearFeatures}
                    className="px-3 py-1.5 text-xs font-medium bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-none transition-colors"
                  >
                    Clear All
                  </button>
                </div>
              </div>
              
              {/* Professional Multi-Column Feature Grid */}
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3 max-h-48 overflow-y-auto">
                {availableColumns
                  .filter(column => column !== targetColumn)
                  .map((column) => {
                    const isSelected = featureColumns.includes(column);
                    return (
                      <button
                        key={column}
                        type="button"
                        onClick={() => handleColumnToggle(column)}
                        className={`group relative flex items-center gap-2 p-3 rounded-none border-2 text-left transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-purple-500 ${
                          isSelected
                            ? 'border-purple-500 bg-purple-50 text-purple-800 shadow-sm'
                            : 'border-gray-200 bg-gray-50 hover:border-gray-300 hover:bg-gray-100 text-gray-700'
                        }`}
                        aria-pressed={isSelected}
                      >
                        <span className="text-sm font-medium truncate" title={column}>
                          {column}
                        </span>
                        <span
                          className={`ml-auto flex h-5 w-5 items-center justify-center rounded-none border transition-colors ${
                            isSelected
                              ? 'border-transparent bg-purple-500 text-white'
                              : 'border-gray-300 bg-white text-transparent'
                          }`}
                          aria-hidden="true"
                        >
                          <svg
                            className="h-3.5 w-3.5"
                            viewBox="0 0 20 20"
                            fill="currentColor"
                          >
                            <path
                              fillRule="evenodd"
                              d="M16.707 5.293a1 1 0 010 1.414l-7.25 7.25a1 1 0 01-1.414 0l-3.5-3.5a1 1 0 011.414-1.414L8.75 11.586l6.543-6.543a1 1 0 011.414 0z"
                              clipRule="evenodd"
                            />
                          </svg>
                        </span>
                      </button>
                    );
                  })}
              </div>
              
              {availableColumns.filter(col => col !== targetColumn).length === 0 && (
                <div className="text-center py-8 text-gray-500">
                  <p>No features available. Please select a target column first.</p>
                </div>
              )}
            </div>

            {/* X-Axis Selection for Visualization (when multiple features) */}
            {featureColumns.length > 1 && (
              <div className="bg-gradient-to-r from-indigo-50 to-blue-50 rounded-none p-4 border border-indigo-200">
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Visualization X-Axis (for regression plots)
                </label>
                <select
                  value={selectedXAxis}
                  onChange={(e) => setSelectedXAxis(e.target.value)}
                  className="w-full p-3 border border-gray-300 rounded-none text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                >
                  <option value="">Select feature for X-axis...</option>
                  {featureColumns.map((column) => (
                    <option key={column} value={column}>{column}</option>
                  ))}
                </select>
                <p className="text-xs text-gray-600 mt-1">
                  Choose which feature to plot on the X-axis for regression visualizations
                </p>
              </div>
            )}

            {/* Training Section */}
            <div className="space-y-3">
              <button
                onClick={() => trainModel()}
                disabled={isTraining || !targetColumn || featureColumns.length === 0}
                className={`w-full p-4 rounded-none text-sm font-medium transition-colors ${
                  isTraining || !targetColumn || featureColumns.length === 0
                    ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
                    : 'bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-700 hover:to-indigo-700 text-white shadow-md hover:shadow-lg'
                }`}
              >
                {isTraining ? (
                  <div className="flex items-center justify-center space-x-2">
                    <div className="animate-spin rounded-none h-4 w-4 border-2 border-white border-t-transparent"></div>
                    <span>Training Model...</span>
                  </div>
                ) : (
                  <div className="flex items-center justify-center space-x-2">
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                    </svg>
                    <span>Train Model & Create Visualization</span>
                  </div>
                )}
              </button>
              
              {/* Model Status */}
              {autoUpdate && (
                <div className="flex items-center space-x-2 text-xs text-gray-600 bg-blue-50 p-2 rounded-none">
                  <div className="w-2 h-2 bg-blue-500 rounded-none animate-pulse"></div>
                  <span>Auto-update enabled - model will retrain when features change</span>
                </div>
              )}
            </div>

            {/* Error Display */}
            {error && (
              <div className="p-4 bg-red-50 border border-red-200 rounded-none">
                <div className="flex items-start space-x-2">
                  <div className="flex-shrink-0">
                    <svg className="w-5 h-5 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L3.732 16.5c-.77.833.192 2.5 1.732 2.5z" />
                    </svg>
                  </div>
                  <div>
                    <h4 className="text-sm font-medium text-red-800">Training Error</h4>
                    <p className="text-sm text-red-700 mt-1">{error}</p>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
      
      {/* Resize handles - smaller and positioned to not overlap content */}
      {/* Corner handles */}
      <div
        className="absolute top-0 left-0 w-3 h-3 cursor-nw-resize bg-purple-200 opacity-50 hover:opacity-100"
        onMouseDown={(e) => handleResizeStart(e, 'nw')}
        title="Resize from top-left corner"
      />
      <div
        className="absolute top-0 right-0 w-3 h-3 cursor-ne-resize bg-purple-200 opacity-50 hover:opacity-100"
        onMouseDown={(e) => handleResizeStart(e, 'ne')}
        title="Resize from top-right corner"
      />
      <div
        className="absolute bottom-0 left-0 w-3 h-3 cursor-sw-resize bg-purple-200 opacity-50 hover:opacity-100"
        onMouseDown={(e) => handleResizeStart(e, 'sw')}
        title="Resize from bottom-left corner"
      />
      <div
        className="absolute bottom-0 right-0 w-3 h-3 cursor-se-resize bg-purple-200 opacity-50 hover:opacity-100"
        onMouseDown={(e) => handleResizeStart(e, 'se')}
        title="Resize from bottom-right corner"
      />
      
      {/* Edge handles - thinner */}
      <div
        className="absolute top-0 left-3 right-3 h-2 cursor-n-resize"
        onMouseDown={(e) => handleResizeStart(e, 'n')}
        title="Resize from top edge"
        style={{ background: 'transparent' }}
      />
      <div
        className="absolute bottom-0 left-3 right-3 h-2 cursor-s-resize"
        onMouseDown={(e) => handleResizeStart(e, 's')}
        title="Resize from bottom edge"
        style={{ background: 'transparent' }}
      />
      <div
        className="absolute left-0 top-3 bottom-3 w-2 cursor-w-resize"
        onMouseDown={(e) => handleResizeStart(e, 'w')}
        title="Resize from left edge"
        style={{ background: 'transparent' }}
      />
      <div
        className="absolute right-0 top-3 bottom-3 w-2 cursor-e-resize"
        onMouseDown={(e) => handleResizeStart(e, 'e')}
        title="Resize from right edge"
        style={{ background: 'transparent' }}
      />
    </div>
  );
};

export default ModelPanel;