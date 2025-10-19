import React, { useState, useEffect } from 'react';

const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:8000';

interface ModelResultsPanelProps {
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
  onCreateVisualizationPanel?: (visualizationData: any) => void;
  isDragging?: boolean;
}

export const ModelResultsPanel: React.FC<ModelResultsPanelProps> = ({ 
  panel, 
  onPanelUpdate, 
  onCreateVisualizationPanel,
  isDragging = false
}) => {
  const [loadingVisualization, setLoadingVisualization] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isResizing, setIsResizing] = useState(false);
  const [resizeType, setResizeType] = useState<string>('');
  const [resizeStart, setResizeStart] = useState({ x: 0, y: 0, width: 0, height: 0, panelX: 0, panelY: 0 });

  // Use the expanded state from the panel prop, default to false if not set
  const isExpanded = panel.isExpanded ?? true;
  
  // Function to toggle expand state
  const toggleExpanded = () => {
    onPanelUpdate(panel.id, { isExpanded: !isExpanded });
  };

  const modelResults = panel.data;
  const hasFeatureImportance = Array.isArray(modelResults?.feature_importance) && modelResults.feature_importance.length > 0;

  const formatStat = (value: unknown, digits = 3) => {
    const num = Number(value);
    return Number.isFinite(num) ? num.toFixed(digits) : 'N/A';
  };

  const getVisualizationTitle = (type: string) => {
    switch (type) {
      case 'pred_vs_actual':
        return 'Predicted vs Actual';
      case 'residuals':
        return 'Residuals Distribution';
      case 'qq_plot':
        return 'Q-Q Plot';
      case 'residuals_vs_fitted':
        return 'Residuals vs Fitted';
      case 'confusion_matrix':
        return 'Confusion Matrix';
      case 'roc':
      case 'roc_curve':
        return 'ROC Curve';
      case 'feature_importance':
        return 'Feature Importance';
      case 'acf':
        return 'Autocorrelation (ACF)';
      case 'pacf':
        return 'Partial Autocorrelation (PACF)';
      case 'ts_diagnostics':
        return 'Time-Series Diagnostics';
      case 'forecast':
        return 'Forecast';
      default:
        return 'Model Visualization';
    }
  };

  const requestVisualization = async (visualizationType: string) => {
    // Validate that we have model results
    if (!modelResults) {
      setError('No model results available. Please train a model first.');
      return;
    }

    if (!modelResults.run_id) {
      setError('Model run ID is missing. Please retrain the model.');
      return;
    }

    const normalizedType = visualizationType === 'roc_curve' ? 'roc' : visualizationType;

    // Validate visualization type is supported
    const supportedTypes = ['pred_vs_actual', 'residuals', 'qq_plot', 'residuals_vs_fitted', 'confusion_matrix', 'roc', 'feature_importance', 'acf', 'pacf', 'ts_diagnostics', 'forecast'];
    if (!supportedTypes.includes(normalizedType)) {
      setError(`Unsupported visualization type: ${visualizationType}`);
      return;
    }

    // Validate problem type compatibility
    if (modelResults.problem_type === 'regression' && ['confusion_matrix', 'roc'].includes(normalizedType)) {
      setError(`${visualizationType} is only available for classification models`);
      return;
    }

    if (modelResults.problem_type === 'classification' && ['residuals', 'qq_plot', 'residuals_vs_fitted', 'acf', 'pacf', 'ts_diagnostics', 'forecast'].includes(normalizedType)) {
      setError(`${visualizationType} is not available for classification models`);
      return;
    }

    if (modelResults.problem_type === 'time_series' && ['confusion_matrix', 'roc', 'qq_plot', 'residuals_vs_fitted'].includes(normalizedType)) {
      setError(`${visualizationType} is not available for time-series models`);
      return;
    }

    if (loadingVisualization) return;

    setLoadingVisualization(true);
    setError(null);

    try {
      // Get datasetId from multiple possible property names
      const datasetId = modelResults.datasetId || modelResults.dataset_id;
      const runId = modelResults.run_id;
      
      const response = await fetch(`${BACKEND_URL}/datasets/${parseInt(datasetId)}/model/visual`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          run_id: String(runId), // Backend expects string
          kind: normalizedType,
          max_points: 2000
        }),
      });

      if (response.ok) {
        const result = await response.json();
        const datasetId = modelResults.datasetId || modelResults.dataset_id;
        const runId = modelResults.run_id;
        
        const visualizationData = { 
          ...result, 
          activeType: normalizedType,
          datasetId: parseInt(datasetId),
          run_id: String(runId) // Keep as string for consistency
        };
        
        // Create a new visualization panel
        if (onCreateVisualizationPanel) {
          onCreateVisualizationPanel(visualizationData);
        }
      } else {
        const errorData = await response.json();
        // Handle error objects properly - check if detail is an array of error objects
        let errorMessage = 'Failed to generate visualization';
        if (errorData.detail) {
          if (Array.isArray(errorData.detail)) {
            // Pydantic validation errors are typically arrays
            errorMessage = errorData.detail.map((err: any) => err.msg || err).join(', ');
          } else if (typeof errorData.detail === 'string') {
            errorMessage = errorData.detail;
          } else if (typeof errorData.detail === 'object') {
            errorMessage = JSON.stringify(errorData.detail);
          }
        }
        setError(errorMessage);
      }
    } catch (error) {
      console.error('Visualization error:', error);
      let errorMessage = 'Failed to generate visualization';
      
      if (error instanceof TypeError && error.message.includes('fetch')) {
        errorMessage = 'Network error: Unable to connect to server. Please check your connection.';
      } else if (error instanceof Error) {
        errorMessage = `Visualization error: ${error.message}`;
      }
      
      setError(errorMessage);
      
      // Auto-clear error after 8 seconds
      setTimeout(() => {
        setError(null);
      }, 8000);
    } finally {
      setLoadingVisualization(false);
    }
  };

  const renderVisualizationButton = (
    type: string,
    label: string,
    options: { spanFull?: boolean; variant?: 'default' | 'emphasis'; disabled?: boolean } = {}
  ) => {
    const { spanFull = false, variant = 'default', disabled = false } = options;
    const baseClasses = 'px-3 py-2 border text-xs font-medium transition-colors rounded-none shadow-sm flex items-center justify-center space-x-2';
    const variantClasses = variant === 'emphasis'
      ? 'bg-gray-100 hover:bg-gray-200 border-gray-300 text-gray-800'
      : 'bg-white hover:bg-gray-100 border-gray-300 text-gray-700';
    const disabledState = disabled || loadingVisualization;

    return (
      <button
        key={type}
        onClick={() => requestVisualization(type)}
        disabled={disabledState}
        className={`${spanFull ? 'col-span-2 ' : ''}${baseClasses} ${variantClasses} disabled:opacity-50 disabled:cursor-not-allowed`}
      >
        <span className="font-medium">{label}</span>
      </button>
    );
  };

  // Handle resize start
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
      panelY: panel.y
    });
  };

  // Handle resize
  useEffect(() => {
    if (!isResizing) return;

    const handleResizeMove = (e: MouseEvent) => {
      if (!isResizing) return;

      const deltaX = e.clientX - resizeStart.x;
      const deltaY = e.clientY - resizeStart.y;

      let newWidth = resizeStart.width;
      let newHeight = resizeStart.height;
      let newX = resizeStart.panelX;
      let newY = resizeStart.panelY;

      if (resizeType.includes('e')) newWidth = Math.max(200, resizeStart.width + deltaX);
      if (resizeType.includes('w')) {
        newWidth = Math.max(200, resizeStart.width - deltaX);
        newX = resizeStart.panelX + deltaX;
      }
      if (resizeType.includes('s')) newHeight = Math.max(150, resizeStart.height + deltaY);
      if (resizeType.includes('n')) {
        newHeight = Math.max(150, resizeStart.height - deltaY);
        newY = resizeStart.panelY + deltaY;
      }

      onPanelUpdate(panel.id, { width: newWidth, height: newHeight, x: newX, y: newY });
    };

    const handleResizeEnd = () => {
      setIsResizing(false);
      setResizeType('');
    };

    document.addEventListener('mousemove', handleResizeMove);
    document.addEventListener('mouseup', handleResizeEnd);

    return () => {
      document.removeEventListener('mousemove', handleResizeMove);
      document.removeEventListener('mouseup', handleResizeEnd);
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
        cursor: isResizing ? 'resizing' : 'default',
        pointerEvents: isDragging ? 'none' : 'auto'
      }}
    >
      <div className="bg-gray-50 px-3 py-2 border-b border-gray-200">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="h-2.5 w-2.5 rounded-full bg-gray-500" />
            <h3 className="text-sm font-medium text-gray-800">Model Results</h3>
          </div>
        </div>
      </div>

      {/* Content */}
      {isExpanded ? (
        <div className="p-4 overflow-y-auto scrollable-content" style={{ height: panel.height - 60 }}>
          {error && (
            <div className="mb-4 border border-gray-300 bg-gray-50 p-4">
              <div className="flex items-start space-x-3 text-sm text-gray-700">
                <div className="flex-shrink-0">
                  <svg className="h-5 w-5 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L3.732 16.5c-.77.833.192 2.5 1.732 2.5z" />
                  </svg>
                </div>
                <div className="flex-1">
                  <h5 className="text-sm font-medium text-gray-800">Visualization Error</h5>
                  <p className="mt-1 text-sm">
                    {typeof error === 'string' ? error : JSON.stringify(error)}
                  </p>
                  <div className="flex space-x-2 mt-3">
                    <button
                      onClick={() => setError(null)}
                      className="border border-gray-300 px-3 py-1 text-xs text-gray-700 hover:bg-gray-100"
                    >
                      Dismiss
                    </button>
                    <button
                      onClick={() => {
                        setError(null);
                        // Could retry the last visualization request here
                      }}
                      className="border border-gray-800 px-3 py-1 text-xs font-medium text-white bg-gray-800 hover:bg-gray-700"
                    >
                      Try Again
                    </button>
                  </div>
                </div>
                <button
                  onClick={() => setError(null)}
                  className="flex-shrink-0 text-gray-400 hover:text-gray-600 transition-colors"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            </div>
          )}

          {modelResults && (
            <div className="space-y-4">
              <h4 className="text-sm font-medium text-gray-700">Training Results</h4>
              
              {/* Basic Metrics */}
              <div className="border border-gray-200 bg-white p-4">
                <div className="flex items-center justify-between mb-3">
                  <h5 className="flex items-center text-sm font-medium text-gray-800">
                    <svg className="mr-2 h-4 w-4 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    Model Performance
                  </h5>
                  {modelResults.metrics && (
                    <div className={`px-2 py-1 text-xs font-medium ${
                      modelResults.metrics.metric_value > 0.8 ? 'bg-gray-900 text-white' :
                      modelResults.metrics.metric_value > 0.6 ? 'bg-gray-600 text-white' :
                      'bg-gray-200 text-gray-700'
                    }`}>
                      {modelResults.metrics.metric_primary}: {modelResults.metrics.metric_value.toFixed(3)}
                    </div>
                  )}
                </div>
                <div className="grid grid-cols-2 gap-3 text-xs">
                  {modelResults.metrics && (
                    <>
                      <div className="flex items-center justify-between border p-2">
                        <span className="font-medium capitalize text-gray-600">{modelResults.metrics.metric_primary}:</span>
                        <span className="font-mono font-medium text-gray-800">
                          {modelResults.metrics.metric_value.toFixed(4)}
                        </span>
                      </div>
                      
                      {/* Additional metrics */}
                      {modelResults.metrics.additional && Object.entries(modelResults.metrics.additional).map(([key, value]: [string, any]) => (
                        <div key={key} className="flex items-center justify-between border p-2">
                          <span className="font-medium capitalize text-gray-600">{key.replace('_', ' ')}:</span>
                          <span className="font-mono font-medium text-gray-800">
                            {typeof value === 'number' ? value.toFixed(4) : 
                             typeof value === 'object' && value !== null ? JSON.stringify(value) : 
                             String(value)}
                          </span>
                        </div>
                      ))}
                    </>
                  )}
                </div>
              </div>

              {/* Comprehensive Summary Statistics */}
              {modelResults.summary && (
                <div className="border border-gray-200 bg-white p-4">
                  <div className="flex items-center justify-between mb-3">
                    <h5 className="flex items-center text-sm font-medium text-gray-800">
                      <svg className="mr-2 h-4 w-4 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                      </svg>
                      Model Summary
                    </h5>
                    <span className="border bg-gray-100 px-2 py-1 text-xs text-gray-600">
                      {modelResults.problem_type === 'regression' ? 'Regression' : 'Classification'}
                    </span>
                  </div>
                  
                  {/* Regression Statistics */}
                  {modelResults.summary.r_squared !== undefined && (
                    <div className="mb-3">
                      <div className="grid grid-cols-2 gap-2 text-xs mb-2">
                        <div>
                          <span className="font-medium">R²:</span>{' '}
                          <span className="text-gray-800">{modelResults.summary.r_squared.toFixed(4)}</span>
                        </div>
                        {modelResults.summary.adj_r_squared !== undefined && (
                          <div>
                            <span className="font-medium">Adj. R²:</span>{' '}
                            <span className="text-gray-800">{modelResults.summary.adj_r_squared.toFixed(4)}</span>
                          </div>
                        )}
                      </div>
                      
                      {/* F-statistic */}
                      {modelResults.summary.f_statistic !== undefined && (
                        <div className="grid grid-cols-1 text-xs">
                          <div>
                            <span className="font-medium">F-statistic:</span>{' '}
                            <span className="text-gray-800">{modelResults.summary.f_statistic.toFixed(3)}</span>
                            {modelResults.summary.f_p_value !== undefined && (
                              <span className="ml-1 text-gray-600">
                                (p-value: {modelResults.summary.f_p_value < 0.001 ? '<0.001' : modelResults.summary.f_p_value.toFixed(3)})
                              </span>
                            )}
                            {modelResults.summary.degrees_freedom && (
                              <span className="ml-1 text-xs text-gray-500">
                                on {modelResults.summary.degrees_freedom.model} and {modelResults.summary.degrees_freedom.residual} DF
                              </span>
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Residual Statistics */}
                  {modelResults.summary.residuals && (
                    <div className="mb-3">
                      <div className="mb-1 text-xs font-medium text-gray-700">Residuals:</div>
                      <div className="grid grid-cols-5 gap-1 text-xs text-gray-600">
                        <div><span className="font-medium text-gray-700">Min:</span> {modelResults.summary.residuals.min.toFixed(3)}</div>
                        <div><span className="font-medium text-gray-700">Q1:</span> {modelResults.summary.residuals.q1.toFixed(3)}</div>
                        <div><span className="font-medium text-gray-700">Med:</span> {modelResults.summary.residuals.median.toFixed(3)}</div>
                        <div><span className="font-medium text-gray-700">Q3:</span> {modelResults.summary.residuals.q3.toFixed(3)}</div>
                        <div><span className="font-medium text-gray-700">Max:</span> {modelResults.summary.residuals.max.toFixed(3)}</div>
                      </div>
                    </div>
                  )}

                  {/* Coefficients Table */}
                  {modelResults.summary.coefficients && modelResults.summary.coefficients.length > 0 && (
                    <div className="mb-3">
                      <div className="text-xs font-medium text-gray-700 mb-1">
                        Coefficients {modelResults.problem_type === 'classification' ? '(Log-Odds)' : ''}:
                      </div>
                      <div className="max-h-40 overflow-y-auto">
                        <table className="w-full text-xs">
                          <thead>
                            <tr className="border-b border-gray-200 bg-gray-50">
                              <th className="text-left py-1 px-1">Feature</th>
                              <th className="text-right py-1 px-1">Estimate</th>
                              {modelResults.summary.coefficients[0].std_error !== undefined && <th className="text-right py-1 px-1">Std. Error</th>}
                              {modelResults.summary.coefficients[0].t_value !== undefined && (
                                <th className="text-right py-1 px-1">
                                  {modelResults.problem_type === 'classification' ? 'z-value' : 't-value'}
                                </th>
                              )}
                              {modelResults.summary.coefficients[0].p_value !== undefined && <th className="text-right py-1 px-1">p-value</th>}
                              {modelResults.summary.coefficients[0].p_value !== undefined && <th className="text-center py-1 px-1">Sig.</th>}
                            </tr>
                          </thead>
                          <tbody>
                            {modelResults.summary.coefficients.map((coef: any, idx: number) => {
                              const getSignificance = (pValue: number) => {
                                if (pValue < 0.001) return '***';
                                if (pValue < 0.01) return '**';
                                if (pValue < 0.05) return '*';
                                if (pValue < 0.1) return '.';
                                return '';
                              };
                              
                              const pValueColor = coef.p_value !== undefined ? 
                                (coef.p_value < 0.05 ? 'text-gray-800 font-semibold' : 'text-gray-600') : 
                                'text-gray-600';
                              
                              return (
                                <tr key={idx} className="border-b border-gray-200 hover:bg-gray-50">
                                  <td className="py-1 px-1 truncate max-w-24" title={coef.feature}>
                                    {coef.feature}
                                  </td>
                                  <td className="text-right py-1 px-1 font-mono">
                                    {coef.estimate.toFixed(4)}
                                  </td>
                                  {coef.std_error !== undefined && (
                                    <td className="text-right py-1 px-1 font-mono text-gray-600">
                                      {coef.std_error.toFixed(4)}
                                    </td>
                                  )}
                                  {coef.t_value !== undefined && (
                                    <td className="text-right py-1 px-1 font-mono">
                                      {coef.t_value.toFixed(3)}
                                    </td>
                                  )}
                                  {coef.p_value !== undefined && (
                                    <td className={`text-right py-1 px-1 font-mono ${pValueColor}`}>
                                      {coef.p_value < 0.001 ? '<0.001' : coef.p_value.toFixed(3)}
                                    </td>
                                  )}
                                  {coef.p_value !== undefined && (
                                    <td className="text-center py-1 px-1 font-semibold text-gray-700">
                                      {getSignificance(coef.p_value)}
                                    </td>
                                  )}
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                        {modelResults.summary.coefficients[0].p_value !== undefined && (
                          <div className="text-xs text-gray-500 mt-1">
                            Significance codes: 0 '***' 0.001 '**' 0.01 '*' 0.05 '.' 0.1 ' ' 1
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Classification Report */}
                  {modelResults.summary.classification_report && (
                    <div className="mb-3">
                      <div className="text-xs font-medium text-gray-700 mb-1">Classification Report:</div>
                      <div className="text-xs">
                        <div className="grid grid-cols-3 gap-2 font-medium border-b border-gray-200 pb-1">
                          <span>Class</span>
                          <span>Precision</span>
                          <span>Recall</span>
                        </div>
                        {Object.entries(modelResults.summary.classification_report).map(([key, value]: [string, any]) => {
                          if (key === 'accuracy' || key === 'macro avg' || key === 'weighted avg') return null;
                          return (
                            <div key={key} className="grid grid-cols-3 gap-2 border-b border-gray-200">
                              <span className="truncate" title={key}>{key}</span>
                              <span>{value.precision?.toFixed(3) || 'N/A'}</span>
                              <span>{value.recall?.toFixed(3) || 'N/A'}</span>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Time-series details */}
              {modelResults.problem_type === 'time_series' && modelResults.time_series_details && (
                <div className="border border-gray-200 bg-white p-4">
                  <div className="flex items-center justify-between mb-3">
                    <h5 className="text-sm font-medium text-gray-800">Time-Series Model Details</h5>
                    <span className="text-xs text-gray-600 bg-gray-50 px-2 py-1 border border-gray-200 rounded-none">
                      {modelResults.time_series_details.model_type?.toUpperCase() || 'ARIMA'}
                    </span>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs text-gray-700">
                    <div>
                      <div className="font-medium text-gray-600 mb-1">Orders</div>
                      <div>ARIMA: {Array.isArray(modelResults.time_series_details.order) ? modelResults.time_series_details.order.join(', ') : '—'}</div>
                      {Array.isArray(modelResults.time_series_details.seasonal_order) && (
                        <div>Seasonal: {modelResults.time_series_details.seasonal_order.join(', ')}</div>
                      )}
                    </div>
                    <div>
                      <div className="font-medium text-gray-600 mb-1">Observations</div>
                      <div>Training: {modelResults.time_series_details.training_observations}</div>
                      <div>Holdout: {modelResults.time_series_details.holdout_observations}</div>
                    </div>
                    <div>
                      <div className="font-medium text-gray-600 mb-1">Date Range</div>
                      <div>{modelResults.time_series_details.train_start} → {modelResults.time_series_details.train_end}</div>
                      {modelResults.time_series_details.holdout_start && modelResults.time_series_details.holdout_end && (
                        <div>Holdout: {modelResults.time_series_details.holdout_start} → {modelResults.time_series_details.holdout_end}</div>
                      )}
                    </div>
                    <div>
                      <div className="font-medium text-gray-600 mb-1">Forecast Horizon</div>
                      <div>{modelResults.time_series_details.forecast_horizon} steps</div>
                    </div>
                  </div>
                  {modelResults.time_series_details.diagnostics?.ljung_box && (
                    <div className="mt-3 text-xs text-gray-700">
                      <div className="font-medium text-gray-600 mb-1">Ljung–Box Test</div>
                      <div>Statistic: {formatStat(modelResults.time_series_details.diagnostics.ljung_box.statistic)}</div>
                      <div>p-value: {formatStat(modelResults.time_series_details.diagnostics.ljung_box.p_value)}</div>
                      <div>Lags tested: {modelResults.time_series_details.diagnostics.ljung_box.lags_tested}</div>
                    </div>
                  )}
                </div>
              )}

              {/* Visualization Buttons */}
              <div className="bg-white border border-gray-200 rounded-none p-4 shadow-sm">
                <div className="flex items-center justify-between mb-3">
                  <h5 className="text-sm font-semibold text-gray-800 flex items-center">
                    <svg className="w-4 h-4 mr-2 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                    </svg>
                    Model Visualizations
                  </h5>
                  <span className="text-xs text-gray-600 bg-gray-50 px-2 py-1 rounded-none border border-gray-200">
                    {modelResults.problem_type === 'regression'
                      ? 'Regression'
                      : modelResults.problem_type === 'classification'
                      ? 'Classification'
                      : 'Time Series'}
                  </span>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  {renderVisualizationButton('pred_vs_actual', 'Pred vs Actual')}

                  {(modelResults.problem_type === 'regression' || modelResults.problem_type === 'time_series') &&
                    renderVisualizationButton('residuals', 'Residuals')}

                  {modelResults.problem_type === 'regression' && (
                    <>
                      {renderVisualizationButton('qq_plot', 'Q-Q Plot')}
                      {renderVisualizationButton('residuals_vs_fitted', 'Residuals vs Fitted')}
                    </>
                  )}

                  {modelResults.problem_type === 'classification' && (
                    <>
                      {renderVisualizationButton('confusion_matrix', 'Confusion Matrix')}
                      {renderVisualizationButton('roc', 'ROC Curve')}
                    </>
                  )}

                  {modelResults.problem_type === 'time_series' && (
                    <>
                      {renderVisualizationButton('acf', 'Autocorrelation (ACF)')}
                      {renderVisualizationButton('pacf', 'Partial Autocorrelation (PACF)')}
                      {renderVisualizationButton('ts_diagnostics', 'Diagnostics', { spanFull: true })}
                      {renderVisualizationButton('forecast', 'Forecast', { spanFull: true })}
                    </>
                  )}

                  {renderVisualizationButton('feature_importance', 'Feature Importance', {
                    spanFull: true,
                    variant: 'emphasis',
                    disabled: !hasFeatureImportance
                  })}
                </div>

                {!hasFeatureImportance && (
                  <div className="text-[11px] text-gray-500 mt-2">
                    Feature importance is not available for this model type.
                  </div>
                )}
                
                {loadingVisualization && (
                  <div className="flex items-center justify-center mt-3 space-x-2">
                    <div className="animate-spin rounded-full h-4 w-4 border-2 border-gray-300 border-t-gray-600"></div>
                    <div className="text-xs text-gray-600 font-medium">Creating visualization...</div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Model Comparison Section */}
          <div className="bg-white border border-gray-200 rounded-none p-4 shadow-sm">
            <div className="flex items-center justify-between mb-3">
              <h5 className="text-sm font-semibold text-gray-800 flex items-center">
                <svg className="w-4 h-4 mr-2 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                </svg>
                Model Comparison
              </h5>
              <span className="text-xs text-gray-600 bg-gray-50 px-2 py-1 rounded-none border border-gray-200">
                Compare Models
              </span>
            </div>
            
            <div className="space-y-3">
              <div className="text-xs text-gray-600 text-center">
                Compare this model with others from the same dataset
              </div>
              
              <div className="flex justify-center">
                <button
                  onClick={() => {
                    // This would open a model comparison panel
                    // For now, we'll show an alert
                    alert('Model comparison feature coming soon! This will allow you to compare multiple models side-by-side.');
                  }}
                  className="px-4 py-2 bg-gray-100 hover:bg-gray-200 border border-gray-300 text-gray-800 rounded-none text-xs font-semibold transition-colors shadow-sm"
                >
                  <div className="flex items-center justify-center space-x-2">
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                    </svg>
                    <span>Compare Models</span>
                  </div>
                </button>
              </div>
              
              <div className="text-xs text-gray-500 text-center">
                Feature includes: Side-by-side metrics, ROC curves, feature importance comparison
              </div>
            </div>
          </div>
        </div>
      ) : (
        /* Collapsed state - show minimal preview */
        <div 
          className="p-2 text-center bg-gray-50 border-t border-gray-200"
          style={{ height: Math.max(40, panel.height - 60) }}
        >
          <div className="text-xs text-gray-500 mb-1 font-medium">
            Model Results
          </div>
          <div className="text-xs text-gray-400">
            {modelResults ? 
              `${modelResults.problem_type || 'Unknown'} • ${modelResults.metrics?.metric_primary || 'No metrics'}` : 
              'Click expand to view'}
          </div>
        </div>
      )}

      {/* Resize handles */}
      <div className="absolute top-0 left-0 w-2 h-2 cursor-nw-resize" onMouseDown={(e) => handleResizeStart(e, 'nw')} />
      <div className="absolute top-0 right-0 w-2 h-2 cursor-ne-resize" onMouseDown={(e) => handleResizeStart(e, 'ne')} />
      <div className="absolute bottom-0 left-0 w-2 h-2 cursor-sw-resize" onMouseDown={(e) => handleResizeStart(e, 'sw')} />
      <div className="absolute bottom-0 right-0 w-2 h-2 cursor-se-resize" onMouseDown={(e) => handleResizeStart(e, 'se')} />
      <div className="absolute top-0 left-2 right-2 h-1 cursor-n-resize" onMouseDown={(e) => handleResizeStart(e, 'n')} />
      <div className="absolute bottom-0 left-2 right-2 h-1 cursor-s-resize" onMouseDown={(e) => handleResizeStart(e, 's')} />
      <div className="absolute left-0 top-2 bottom-2 w-1 cursor-w-resize" onMouseDown={(e) => handleResizeStart(e, 'w')} />
      <div className="absolute right-0 top-2 bottom-2 w-1 cursor-e-resize" onMouseDown={(e) => handleResizeStart(e, 'e')} />
    </div>
  );
};

export default ModelResultsPanel;