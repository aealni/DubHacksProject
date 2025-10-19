import React, { useState, useEffect, useCallback, useMemo } from 'react';

const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:8000';

type ModelOption = {
  value: string;
  label: string;
  description?: string;
};

type ProblemTypeOption = 'auto' | 'regression' | 'classification' | 'time_series';

const REGRESSION_MODEL_OPTIONS: ModelOption[] = [
  { value: 'linear_regression', label: 'Linear Regression' },
  { value: 'weighted_least_squares', label: 'Weighted Least Squares', description: 'Requires a weight column' },
  { value: 'ridge_regression', label: 'Ridge Regression', description: 'L2 regularization with alpha' },
  { value: 'lasso_regression', label: 'Lasso Regression', description: 'L1 regularization with alpha' },
  { value: 'polynomial_regression', label: 'Polynomial Regression', description: 'Expands numeric features using PolynomialFeatures' },
  { value: 'random_forest_regression', label: 'Random Forest Regressor' }
];

const CLASSIFICATION_MODEL_OPTIONS: ModelOption[] = [
  { value: 'logistic_regression', label: 'Logistic Regression' },
  { value: 'random_forest_classification', label: 'Random Forest Classifier' }
];

const TIME_SERIES_MODEL_OPTIONS: ModelOption[] = [
  { value: 'arima', label: 'ARIMA' },
  { value: 'sarima', label: 'SARIMA', description: 'Seasonal ARIMA with optional seasonal order' }
];

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
  const [problemType, setProblemType] = useState<ProblemTypeOption>('auto');
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
  const [hasManualResize, setHasManualResize] = useState(false);
  const [testSize, setTestSize] = useState(0.2);
  const [cvFolds, setCvFolds] = useState<number | ''>('');
  const [weightColumn, setWeightColumn] = useState('');
  const [alphaValue, setAlphaValue] = useState<string>('');
  const [polynomialDegree, setPolynomialDegree] = useState(2);
  const [nEstimators, setNEstimators] = useState<number | ''>('');
  const [maxDepth, setMaxDepth] = useState<number | ''>('');
  const [timeColumn, setTimeColumn] = useState('');
  const [forecastHorizon, setForecastHorizon] = useState<number | ''>('');
  const [arimaOrder, setArimaOrder] = useState('1,1,1');
  const [seasonalOrder, setSeasonalOrder] = useState('1,1,1,12');
  const [seasonalPeriods, setSeasonalPeriods] = useState<number | ''>('');
  const [returnDiagnostics, setReturnDiagnostics] = useState(true);

  // Use the expanded state from the panel prop, default to false if not set
  const isExpanded = panel.isExpanded ?? true;

  const availableModelOptions = useMemo(() => {
    if (problemType === 'classification') {
      return CLASSIFICATION_MODEL_OPTIONS;
    }
    if (problemType === 'time_series') {
      return TIME_SERIES_MODEL_OPTIONS;
    }
    return REGRESSION_MODEL_OPTIONS;
  }, [problemType]);

  const isTimeSeriesModel = problemType === 'time_series' || modelType === 'arima' || modelType === 'sarima';

  useEffect(() => {
    if (!availableModelOptions.some(option => option.value === modelType)) {
      const fallback = availableModelOptions[0]?.value ?? 'linear_regression';
      setModelType(fallback);
    }
  }, [availableModelOptions, modelType]);

  useEffect(() => {
    if (problemType === 'time_series') {
      setFeatureColumns([]);
      setSelectedXAxis('');
    }
  }, [problemType]);

  const availableFeatureColumns = useMemo(
    () => availableColumns.filter(column => column !== targetColumn && column !== weightColumn && column !== timeColumn),
    [availableColumns, targetColumn, weightColumn, timeColumn]
  );

  useEffect(() => {
    setFeatureColumns(prev => prev.filter(column => column !== targetColumn && column !== weightColumn && column !== timeColumn));
  }, [targetColumn, weightColumn, timeColumn]);

  useEffect(() => {
    if (selectedXAxis && !featureColumns.includes(selectedXAxis)) {
      setSelectedXAxis(featureColumns[0] ?? '');
    }
  }, [featureColumns, selectedXAxis]);

  const parseIntegerList = useCallback((input: string, expectedLength: number) => {
    const parts = input
      .split(',')
      .map(part => part.trim())
      .filter(Boolean);
    if (parts.length !== expectedLength) {
      throw new Error(`Expected ${expectedLength} comma-separated values`);
    }
    const values = parts.map(Number);
    if (values.some(value => Number.isNaN(value))) {
      throw new Error('All values must be integers');
    }
    return values.map(value => Math.trunc(value));
  }, []);
  
  // Function to toggle expand state
  const toggleExpanded = () => {
    const nextExpanded = !isExpanded;
    if (nextExpanded) {
      setHasManualResize(false);
    }
    onPanelUpdate(panel.id, { isExpanded: nextExpanded });
  };

  // Calculate optimal panel size based on content
  const calculateOptimalSize = () => {
    if (!isExpanded) {
      return { width: 300, height: 72 };
    }

    let optimalWidth = 540;
    let optimalHeight = 420;

    if (availableColumns.length > 0) {
      optimalHeight = Math.min(520, optimalHeight + Math.min(80, availableColumns.length * 4));
    }

    return { width: optimalWidth, height: optimalHeight };
  };

  // Calculate content scale based on panel size vs expanded size
  const headerHeight = 52;

  const getContentScale = () => {
    const expandedWidth = 540;
    const expandedHeight = 420;

    const widthScale = panel.width / expandedWidth;
    const heightScale = (panel.height - headerHeight) / (expandedHeight - headerHeight);

    return Math.min(widthScale, heightScale);
  };

  // Auto-resize panel when content changes
  useEffect(() => {
    if (isExpanded && !isResizing && !hasManualResize) {
      const { width, height } = calculateOptimalSize();
      onPanelUpdate(panel.id, { width, height });
    }
  }, [isExpanded, availableColumns, isResizing, hasManualResize, onPanelUpdate, panel.id]);

  const fetchAvailableColumns = useCallback(async () => {
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
      if (!response.ok) {
        console.error('Failed to fetch columns, status:', response.status);
        setError(`Failed to fetch columns (status: ${response.status})`);
        return;
      }

      const data = await response.json();
      console.log('Columns data received:', data);

      const combined = Array.from(
        new Set(
          [
            ...(Array.isArray(data?.all) ? data.all : []),
            ...(Array.isArray(data?.columns) ? data.columns : []),
            ...(Array.isArray(data?.numerical) ? data.numerical : []),
            ...(Array.isArray(data?.categorical) ? data.categorical : []),
            ...(Array.isArray(data?.datetime) ? data.datetime : [])
          ]
            .filter((col): col is string => typeof col === 'string')
            .map(col => col.trim())
            .filter(col => col && col !== '_rowid')
        )
      );

      console.log('Sanitized columns:', combined);
      setAvailableColumns(combined);

      setTargetColumn(prev => {
        if (prev && combined.includes(prev)) {
          return prev;
        }
        return combined[0] ?? '';
      });

      setWeightColumn(prev => (prev && combined.includes(prev) ? prev : ''));
      setTimeColumn(prev => (prev && combined.includes(prev) ? prev : ''));
      setFeatureColumns(prev => prev.filter(col => combined.includes(col)));
      setSelectedXAxis(prev => (prev && combined.includes(prev) ? prev : combined[0] ?? ''));
    } catch (error) {
      console.error('Error fetching columns:', error);
      setError('Failed to fetch columns');
    }
  }, [panel.data?.datasetId]);

  useEffect(() => {
    const datasetId = panel.data?.datasetId;
    console.log('ModelPanel useEffect - datasetId:', datasetId);
    console.log('ModelPanel useEffect - panel.data:', panel.data);

    if (datasetId) {
      void fetchAvailableColumns();
    } else {
      console.warn('No datasetId found in panel data');
    }
  }, [fetchAvailableColumns, panel.data?.datasetId]);

  const trainModel = async () => {
    const datasetId = panel.data?.datasetId || panel.data?.dataset_id || panel.data?.id;

    if (!datasetId) {
      setError('No dataset ID available');
      return;
    }

    if (!targetColumn) {
      setError('Please select a target column');
      return;
    }

    const isTimeSeriesModel = problemType === 'time_series' || modelType === 'arima' || modelType === 'sarima';
    const effectiveProblemType = isTimeSeriesModel ? 'time_series' : problemType;

    if (!isTimeSeriesModel && featureColumns.length === 0) {
      setError('Please select at least one feature column');
      return;
    }

    if (isTimeSeriesModel && !timeColumn) {
      setError('Time-series models require selecting a time column');
      return;
    }

    if (modelType === 'weighted_least_squares' && !weightColumn) {
      setError('Weighted least squares requires selecting a weight column');
      return;
    }

    if (weightColumn && weightColumn === targetColumn) {
      setError('Weight column cannot be the same as the target column');
      return;
    }

    const parsedTestSize = Number(testSize);
    if (Number.isNaN(parsedTestSize) || parsedTestSize <= 0 || parsedTestSize >= 0.9) {
      setError('Test size must be between 0 and 0.9');
      return;
    }

    let parsedCvFolds: number | undefined;
    if (cvFolds !== '') {
      parsedCvFolds = Number(cvFolds);
      if (!Number.isInteger(parsedCvFolds) || parsedCvFolds < 2) {
        setError('Cross-validation folds must be an integer greater than or equal to 2');
        return;
      }
    }

    let parsedAlpha: number | undefined;
    if (alphaValue.trim()) {
      parsedAlpha = Number(alphaValue);
      if (Number.isNaN(parsedAlpha) || parsedAlpha <= 0) {
        setError('Alpha must be a positive number');
        return;
      }
    }

    let parsedNEstimators: number | undefined;
    if (nEstimators !== '') {
      parsedNEstimators = Number(nEstimators);
      if (!Number.isInteger(parsedNEstimators) || parsedNEstimators <= 0) {
        setError('Number of estimators must be a positive integer');
        return;
      }
    }

    let parsedMaxDepth: number | undefined;
    if (maxDepth !== '') {
      parsedMaxDepth = Number(maxDepth);
      if (!Number.isInteger(parsedMaxDepth) || parsedMaxDepth <= 0) {
        setError('Max depth must be a positive integer');
        return;
      }
    }

    let parsedForecastHorizon: number | undefined;
    if (forecastHorizon !== '') {
      parsedForecastHorizon = Number(forecastHorizon);
      if (!Number.isInteger(parsedForecastHorizon) || parsedForecastHorizon <= 0) {
        setError('Forecast horizon must be a positive integer');
        return;
      }
    }

    let parsedSeasonalPeriods: number | undefined;
    if (seasonalPeriods !== '') {
      parsedSeasonalPeriods = Number(seasonalPeriods);
      if (!Number.isInteger(parsedSeasonalPeriods) || parsedSeasonalPeriods <= 0) {
        setError('Seasonal periods must be a positive integer');
        return;
      }
    }

    if (modelType === 'polynomial_regression' && (!Number.isInteger(polynomialDegree) || polynomialDegree < 2)) {
      setError('Polynomial degree must be an integer greater than or equal to 2');
      return;
    }

    let arimaOrderValues: number[] | undefined;
    let seasonalOrderValues: number[] | undefined;

    if (isTimeSeriesModel) {
      try {
        arimaOrderValues = parseIntegerList(arimaOrder, 3);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Invalid ARIMA order');
        return;
      }

      if (modelType === 'sarima') {
        try {
          seasonalOrderValues = parseIntegerList(seasonalOrder, 4);
        } catch (err) {
          setError(err instanceof Error ? err.message : 'Invalid seasonal order');
          return;
        }
      }
    }

    const payload: Record<string, unknown> = {
      target: targetColumn,
      problem_type: effectiveProblemType,
      model_type: modelType,
      include_columns: !isTimeSeriesModel && featureColumns.length > 0 ? featureColumns : undefined,
      test_size: parsedTestSize,
      random_state: 42,
      normalize_numeric: true,
      encode_categoricals: 'auto',
      feature_interactions: false,
      cv_folds: parsedCvFolds,
      weight_column: weightColumn || undefined,
      alpha: (modelType === 'ridge_regression' || modelType === 'lasso_regression') ? parsedAlpha : undefined,
      polynomial_degree: modelType === 'polynomial_regression' ? polynomialDegree : undefined,
      n_estimators: modelType.startsWith('random_forest') ? parsedNEstimators : undefined,
      max_depth: modelType.startsWith('random_forest') ? parsedMaxDepth : undefined,
      return_diagnostics: returnDiagnostics
    };

    if (isTimeSeriesModel) {
      payload.problem_type = 'time_series';
      payload.model_type = modelType;
      payload.time_column = timeColumn;
      payload.include_columns = undefined;
      payload.forecast_horizon = parsedForecastHorizon;
      payload.arima_order = arimaOrderValues;
      payload.seasonal_order = modelType === 'sarima' ? seasonalOrderValues : undefined;
      payload.seasonal_periods = modelType === 'sarima' ? parsedSeasonalPeriods : undefined;
      payload.cv_folds = undefined;
      payload.weight_column = undefined;
    }

    Object.keys(payload).forEach(key => {
      if (payload[key] === undefined || payload[key] === null) {
        delete payload[key];
      }
    });

    setIsTraining(true);
    setError(null);

    try {
      const response = await fetch(`${BACKEND_URL}/datasets/${parseInt(datasetId)}/model/runs`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });

      if (response.ok) {
        const result = await response.json();
        setLastTrainedConfig({
          target: targetColumn,
          features: [...featureColumns]
        });

        if (onCreateResultsPanel) {
          const resultsData = {
            run_id: result.run_id,
            datasetId: result.dataset_id,
            dataset_id: result.dataset_id,
            metrics: result.metrics,
            summary: result.summary,
            feature_importance: result.feature_importance,
            sample_predictions: result.sample_predictions,
            status: result.status,
            target: result.target,
            problem_type: result.problem_type,
            created_at: result.created_at,
            completed_at: result.completed_at,
            autoCreateVisualization: true,
            modelConfig: {
              target: targetColumn,
              features: featureColumns,
              problem_type: payload.problem_type,
              selectedXAxis
            }
          };

          onCreateResultsPanel(resultsData);
        }
      } else {
        const errorText = await response.text();
        try {
          const errorData = JSON.parse(errorText);
          setError(errorData.detail || 'Failed to train model');
        } catch {
          setError(`Failed to train model (status: ${response.status})`);
        }
      }
    } catch (err) {
      setError('Failed to train model: ' + (err instanceof Error ? err.message : String(err)));
    } finally {
      setIsTraining(false);
    }
  };

  const handleColumnToggle = (column: string) => {
    if (isTimeSeriesModel) {
      return;
    }
    if (!availableFeatureColumns.includes(column)) {
      return;
    }
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
    if (isTimeSeriesModel) {
      return;
    }
    const allFeatures = availableFeatureColumns;
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
  setHasManualResize(true);
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
      className={`panel-content relative bg-white border border-gray-200 shadow-sm overflow-hidden ${
        isDragging ? 'opacity-90 shadow-md' : ''
      }`}
      style={{
        width: panel.width,
        height: panel.height,
        pointerEvents: isDragging ? 'none' : 'auto',
        transition: 'width 0.25s ease, height 0.25s ease'
      }}
    >
      {/* Header - simplified without action buttons */}
  <div className="bg-gray-50 px-3 py-2 border-b border-gray-200">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="w-2.5 h-2.5 rounded-full bg-gray-500" />
            <div>
              <h3 className="font-medium text-gray-800 text-sm">Model Training</h3>
              <div className="text-[11px] text-gray-500 mt-0.5">
                Dataset: {panel.data?.datasetName || panel.data?.datasetId}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Content */}
      <div 
        className="p-3 overflow-y-auto scrollable-content" 
        style={{ 
          transform: `scale(${getContentScale()})`,
          transformOrigin: 'top left',
          width: `${100 / getContentScale()}%`,
          height: `calc(${Math.max(panel.height - headerHeight, 160) / getContentScale()}px)`
        }}
      >
        {isExpanded && (
          <div className="space-y-4 text-sm text-gray-700">
            <div className="border border-gray-200 bg-white p-3">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-medium text-gray-800">Configuration</h3>
                <div className="flex items-center gap-2 text-xs text-gray-500">
                  <label className="flex items-center space-x-2 text-sm">
                    <input
                      type="checkbox"
                      checked={autoUpdate}
                      onChange={(e) => setAutoUpdate(e.target.checked)}
                      className="h-3.5 w-3.5 border border-gray-300 text-gray-600 focus:ring-gray-500"
                    />
                    <span>Auto-update</span>
                  </label>
                </div>
              </div>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">Problem Type</label>
                  <select
                    value={problemType}
                    onChange={(e) => setProblemType(e.target.value as ProblemTypeOption)}
                    className="w-full border border-gray-300 bg-white px-2.5 py-2 text-sm focus:border-gray-500 focus:outline-none focus:ring-2 focus:ring-gray-200"
                  >
                    <option value="auto">Auto (let the backend infer)</option>
                    <option value="regression">Regression</option>
                    <option value="classification">Classification</option>
                    <option value="time_series">Time Series</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">Model Type</label>
                  <select
                    value={modelType}
                    onChange={(e) => setModelType(e.target.value)}
                    className="w-full border border-gray-300 bg-white px-2.5 py-2 text-sm focus:border-gray-500 focus:outline-none focus:ring-2 focus:ring-gray-200"
                  >
                    {availableModelOptions.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                  <p className="mt-1 text-[11px] text-gray-500">
                    {availableModelOptions.find(option => option.value === modelType)?.description || 'Select the algorithm you want to run.'}
                  </p>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">Target Column</label>
                  <select
                    value={targetColumn}
                    onChange={(e) => setTargetColumn(e.target.value)}
                    className="w-full border border-gray-300 bg-white px-2.5 py-2 text-sm focus:border-gray-500 focus:outline-none focus:ring-2 focus:ring-gray-200"
                  >
                    <option value="">Select target column...</option>
                    {availableColumns.map((column) => (
                      <option key={column} value={column}>{column}</option>
                    ))}
                  </select>
                </div>
                {isTimeSeriesModel ? (
                  <div>
                    <label className="block text-xs font-medium text-gray-500 mb-1">Time Column</label>
                    <select
                      value={timeColumn}
                      onChange={(e) => setTimeColumn(e.target.value)}
                      className="w-full border border-gray-300 bg-white px-2.5 py-2 text-sm focus:border-gray-500 focus:outline-none focus:ring-2 focus:ring-gray-200"
                    >
                      <option value="">Select time column...</option>
                      {availableColumns.map((column) => (
                        <option key={column} value={column}>{column}</option>
                      ))}
                    </select>
                    <p className="mt-1 text-[11px] text-gray-500">Used to order observations for ARIMA/SARIMA models.</p>
                  </div>
                ) : (
                  <div>
                    <label className="block text-xs font-medium text-gray-500 mb-1">Weight Column (optional)</label>
                    <select
                      value={weightColumn}
                      onChange={(e) => setWeightColumn(e.target.value)}
                      className="w-full border border-gray-300 bg-white px-2.5 py-2 text-sm focus:border-gray-500 focus:outline-none focus:ring-2 focus:ring-gray-200"
                    >
                      <option value="">No weights</option>
                      {availableColumns
                        .filter(column => column !== targetColumn && column !== timeColumn)
                        .map((column) => (
                          <option key={column} value={column}>{column}</option>
                        ))}
                    </select>
                    <p className="mt-1 text-[11px] text-gray-500">Required for weighted least squares, optional for other models.</p>
                  </div>
                )}
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">Test Size</label>
                  <input
                    type="number"
                    min={0.05}
                    max={0.9}
                    step={0.05}
                    value={testSize}
                    onChange={(e) => {
                      const value = e.target.value;
                      setTestSize(value === '' ? 0.2 : Number(value));
                    }}
                    className="w-full border border-gray-300 px-2.5 py-2 text-sm focus:border-gray-500 focus:outline-none focus:ring-2 focus:ring-gray-200"
                  />
                  <p className="mt-1 text-[11px] text-gray-500">Fraction of data reserved for evaluation.</p>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">Cross-Validation Folds</label>
                  <input
                    type="number"
                    min={2}
                    step={1}
                    value={cvFolds}
                    onChange={(e) => {
                      const value = e.target.value;
                      setCvFolds(value === '' ? '' : Number(value));
                    }}
                    placeholder="Optional"
                    disabled={isTimeSeriesModel}
                    className={`w-full border px-2.5 py-2 text-sm focus:border-gray-500 focus:outline-none focus:ring-2 focus:ring-gray-200 ${
                      isTimeSeriesModel ? 'border-gray-200 bg-gray-100 text-gray-400 cursor-not-allowed' : 'border-gray-300 bg-white'
                    }`}
                  />
                  {isTimeSeriesModel && (
                    <p className="mt-1 text-[11px] text-gray-500">
                      Cross-validation is not available for time-series models.
                    </p>
                  )}
                </div>
              </div>

              {(modelType === 'ridge_regression' || modelType === 'lasso_regression') && (
                <div className="mt-3">
                  <label className="block text-xs font-medium text-gray-500 mb-1">Regularization Strength (alpha)</label>
                  <input
                    type="number"
                    min={0.0001}
                    step={0.1}
                    value={alphaValue}
                    onChange={(e) => setAlphaValue(e.target.value)}
                    placeholder="Defaults to backend value if left blank"
                    className="w-full border border-gray-300 px-2.5 py-2 text-sm focus:border-gray-500 focus:outline-none focus:ring-2 focus:ring-gray-200"
                  />
                </div>
              )}

              {modelType === 'polynomial_regression' && (
                <div className="mt-3">
                  <label className="block text-xs font-medium text-gray-500 mb-1">Polynomial Degree</label>
                  <input
                    type="number"
                    min={2}
                    step={1}
                    value={polynomialDegree}
                    onChange={(e) => {
                      const value = Number(e.target.value);
                      setPolynomialDegree(Number.isNaN(value) ? 2 : Math.max(2, Math.round(value)));
                    }}
                    className="w-full border border-gray-300 px-2.5 py-2 text-sm focus:border-gray-500 focus:outline-none focus:ring-2 focus:ring-gray-200"
                  />
                </div>
              )}

              {modelType.startsWith('random_forest') && (
                <div className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-gray-500 mb-1">Estimators</label>
                    <input
                      type="number"
                      min={50}
                      step={50}
                      value={nEstimators}
                      onChange={(e) => {
                        const value = e.target.value;
                        setNEstimators(value === '' ? '' : Number(value));
                      }}
                      placeholder="Defaults to 300"
                      className="w-full border border-gray-300 px-2.5 py-2 text-sm focus:border-gray-500 focus:outline-none focus:ring-2 focus:ring-gray-200"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-500 mb-1">Max Depth</label>
                    <input
                      type="number"
                      min={1}
                      step={1}
                      value={maxDepth}
                      onChange={(e) => {
                        const value = e.target.value;
                        setMaxDepth(value === '' ? '' : Number(value));
                      }}
                      placeholder="Unlimited"
                      className="w-full border border-gray-300 px-2.5 py-2 text-sm focus:border-gray-500 focus:outline-none focus:ring-2 focus:ring-gray-200"
                    />
                  </div>
                </div>
              )}

              {isTimeSeriesModel && (
                <div className="mt-3 space-y-3">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-medium text-gray-500 mb-1">Forecast Horizon (steps)</label>
                      <input
                        type="number"
                        min={1}
                        step={1}
                        value={forecastHorizon}
                        onChange={(e) => {
                          const value = e.target.value;
                          setForecastHorizon(value === '' ? '' : Number(value));
                        }}
                        placeholder="Defaults to holdout or 12"
                        className="w-full border border-gray-300 px-2.5 py-2 text-sm focus:border-gray-500 focus:outline-none focus:ring-2 focus:ring-gray-200"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-500 mb-1">Return Diagnostics</label>
                      <div className="flex items-center space-x-2 text-sm">
                        <input
                          type="checkbox"
                          checked={returnDiagnostics}
                          onChange={(e) => setReturnDiagnostics(e.target.checked)}
                          className="h-3.5 w-3.5 border border-gray-300 text-gray-600 focus:ring-gray-500"
                        />
                        <span>Include ACF/PACF and residual checks</span>
                      </div>
                    </div>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-medium text-gray-500 mb-1">ARIMA Order (p,d,q)</label>
                      <input
                        type="text"
                        value={arimaOrder}
                        onChange={(e) => setArimaOrder(e.target.value)}
                        className="w-full border border-gray-300 px-2.5 py-2 text-sm focus:border-gray-500 focus:outline-none focus:ring-2 focus:ring-gray-200"
                      />
                    </div>
                    {modelType === 'sarima' && (
                      <div>
                        <label className="block text-xs font-medium text-gray-500 mb-1">Seasonal Order (P,D,Q,s)</label>
                        <input
                          type="text"
                          value={seasonalOrder}
                          onChange={(e) => setSeasonalOrder(e.target.value)}
                          className="w-full border border-gray-300 px-2.5 py-2 text-sm focus:border-gray-500 focus:outline-none focus:ring-2 focus:ring-gray-200"
                        />
                        <p className="mt-1 text-[11px] text-gray-500">Last value is the seasonal period.</p>
                      </div>
                    )}
                    {modelType === 'sarima' && (
                      <div>
                        <label className="block text-xs font-medium text-gray-500 mb-1">Seasonal Periods</label>
                        <input
                          type="number"
                          min={1}
                          step={1}
                          value={seasonalPeriods}
                          onChange={(e) => {
                            const value = e.target.value;
                            setSeasonalPeriods(value === '' ? '' : Number(value));
                          }}
                          placeholder="Optional if provided in seasonal order"
                          className="w-full border border-gray-300 px-2.5 py-2 text-sm focus:border-gray-500 focus:outline-none focus:ring-2 focus:ring-gray-200"
                        />
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* Feature Selection Section */}
            <div className="border border-gray-200 bg-white p-3">
              <div className="flex items-center justify-between mb-3">
                <div>
                  <h4 className="text-sm font-medium text-gray-800">Feature Selection</h4>
                  <p className="text-xs text-gray-500">
                    {featureColumns.length} of {availableFeatureColumns.length} features selected
                  </p>
                </div>
                <div className="flex space-x-2">
                  <button
                    onClick={handleSelectAllFeatures}
                    className={`border border-gray-300 px-2.5 py-1 text-xs font-medium text-gray-600 ${isTimeSeriesModel ? 'opacity-50 cursor-not-allowed' : 'hover:bg-gray-100'}`}
                    disabled={isTimeSeriesModel}
                  >
                    Select All
                  </button>
                  <button
                    onClick={handleClearFeatures}
                    className="border border-gray-300 px-2.5 py-1 text-xs font-medium text-gray-600 hover:bg-gray-100"
                  >
                    Clear All
                  </button>
                </div>
              </div>

              {!isTimeSeriesModel ? (
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 max-h-44 overflow-y-auto">
                  {availableFeatureColumns.map((column) => {
                    const isSelected = featureColumns.includes(column);
                    return (
                      <button
                        key={column}
                        type="button"
                        onClick={() => handleColumnToggle(column)}
                        className={`group relative flex items-center gap-2 border text-left px-2.5 py-2 text-xs transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-gray-300 ${
                          isSelected
                            ? 'border-gray-600 bg-gray-100 text-gray-800'
                            : 'border-gray-200 bg-white hover:border-gray-300 hover:bg-gray-50 text-gray-600'
                        }`}
                        aria-pressed={isSelected}
                      >
                        <span className="truncate" title={column}>
                          {column}
                        </span>
                        <span
                          className={`ml-auto flex h-4 w-4 items-center justify-center ${
                            isSelected
                              ? 'bg-gray-700 text-white'
                              : 'border border-gray-200 bg-white text-transparent'
                          }`}
                          aria-hidden="true"
                        >
                          <svg
                            className="h-3 w-3"
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
              ) : (
                <div className="py-6 text-center text-xs text-gray-500">
                  Feature selection is not required for time-series models.
                </div>
              )}

              {!isTimeSeriesModel && availableFeatureColumns.length === 0 && (
                <div className="py-6 text-center text-xs text-gray-500">
                  No features available. Please adjust your column selections.
                </div>
              )}
            </div>

            {/* X-Axis Selection for Visualization (when multiple features) */}
            {featureColumns.length > 1 && (
              <div className="border border-gray-200 bg-white p-3">
                <label className="block text-xs font-medium text-gray-500 mb-1">
                  Visualization X-Axis
                </label>
                <select
                  value={selectedXAxis}
                  onChange={(e) => setSelectedXAxis(e.target.value)}
                  className="w-full border border-gray-300 bg-white px-2.5 py-2 text-sm focus:border-gray-500 focus:outline-none focus:ring-2 focus:ring-gray-200"
                >
                  <option value="">Select feature for X-axis...</option>
                  {featureColumns.map((column) => (
                    <option key={column} value={column}>{column}</option>
                  ))}
                </select>
                <p className="mt-1 text-[11px] text-gray-500">
                  Choose which feature to plot on the X-axis for regression visualizations.
                </p>
              </div>
            )}

            {/* Training Section */}
            <div className="space-y-3">
              <button
                onClick={() => trainModel()}
                disabled={isTraining || !targetColumn || featureColumns.length === 0}
                className={`w-full px-3 py-2.5 text-sm font-medium transition-colors ${
                  isTraining || !targetColumn || featureColumns.length === 0
                    ? 'bg-gray-200 text-gray-500 cursor-not-allowed'
                    : 'bg-gray-900 text-white hover:bg-gray-700'
                }`}
              >
                {isTraining ? (
                  <div className="flex items-center justify-center space-x-2">
                    <div className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white border-t-transparent" />
                    <span>Training Model...</span>
                  </div>
                ) : (
                  <div className="flex items-center justify-center space-x-2">
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm6 0V9a2 2 0 00-2-2h-2a2 2 0 00-2 2v10m6 0a2 2 0 002 2h2a2 2 0 002-2V5a2 2 0 00-2-2h-2a2 2 0 00-2 2" />
                    </svg>
                    <span>Train Model & Create Visualization</span>
                  </div>
                )}
              </button>
              
              {/* Model Status */}
              {autoUpdate && (
                <div className="flex items-center gap-2 border border-gray-200 bg-gray-100 px-2.5 py-2 text-[11px] text-gray-600">
                  <div className="h-1.5 w-1.5 animate-pulse rounded-full bg-gray-600" />
                  <span>Auto-update enabled. The model retrains when features change.</span>
                </div>
              )}
            </div>

            {/* Error Display */}
            {error && (
              <div className="border border-gray-400 bg-gray-100 p-3 text-sm text-gray-700">
                <div className="flex items-start gap-2">
                  <div className="flex-shrink-0">
                    <svg className="w-5 h-5 text-gray-700" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L3.732 16.5c-.77.833.192 2.5 1.732 2.5z" />
                    </svg>
                  </div>
                  <div>
                    <h4 className="text-sm font-medium text-gray-800">Training Error</h4>
                    <p className="mt-1 text-xs">{error}</p>
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
        className="absolute top-0 left-0 w-3 h-3 cursor-nw-resize"
        style={{ background: 'transparent' }}
        onMouseDown={(e) => handleResizeStart(e, 'nw')}
        title="Resize from top-left corner"
      />
      <div
        className="absolute top-0 right-0 w-3 h-3 cursor-ne-resize"
        style={{ background: 'transparent' }}
        onMouseDown={(e) => handleResizeStart(e, 'ne')}
        title="Resize from top-right corner"
      />
      <div
        className="absolute bottom-0 left-0 w-3 h-3 cursor-sw-resize"
        style={{ background: 'transparent' }}
        onMouseDown={(e) => handleResizeStart(e, 'sw')}
        title="Resize from bottom-left corner"
      />
      <div
        className="absolute bottom-0 right-0 w-3 h-3 cursor-se-resize"
        style={{ background: 'transparent' }}
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