import React, { useState, useEffect } from 'react';

interface ModelVisualizationPanelProps {
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
}

export const ModelVisualizationPanel: React.FC<ModelVisualizationPanelProps> = ({ 
  panel, 
  onPanelUpdate 
}) => {
  const [isResizing, setIsResizing] = useState(false);
  const [resizeType, setResizeType] = useState<string>('');
  const [resizeStart, setResizeStart] = useState({ x: 0, y: 0, width: 0, height: 0, panelX: 0, panelY: 0 });

  // Use the expanded state from the panel prop, default to true for new panels
  const isExpanded = panel.isExpanded ?? true;
  
  // Function to toggle expand state
  const toggleExpanded = () => {
    onPanelUpdate(panel.id, { isExpanded: !isExpanded });
  };

  const visualizationData = panel.data;

  // Function to calculate optimal panel dimensions based on chart type
  const getOptimalDimensions = (chartType: string, data: any) => {
    const headerHeight = 60;
    const padding = 80; // Content padding
    const minWidth = 500; // Increased minimum width
    const minHeight = 400; // Increased minimum height
    
    switch (chartType) {
      case 'confusion_matrix':
        const matrixSize = data?.data?.labels?.length || 3;
        const cellSize = Math.max(60, Math.min(100, 600 / matrixSize)); // Larger cells
        return {
          width: Math.max(minWidth, matrixSize * cellSize + padding + 120),
          height: Math.max(minHeight, matrixSize * cellSize + headerHeight + padding + 120)
        };
      
      case 'feature_importance':
        const numFeatures = Math.min(20, data?.data?.features?.length || 10); // Show more features
        return {
          width: Math.max(minWidth, 700), // Wider for feature names
          height: Math.max(minHeight, headerHeight + numFeatures * 30 + 100) // More height per feature
        };
      
      case 'roc_curve':
      case 'qq_plot':
      case 'pred_vs_actual':
      case 'residuals_vs_fitted':
        return {
          width: Math.max(minWidth, 650), // Wider for better chart readability
          height: Math.max(minHeight, headerHeight + 500) // Taller for better aspect ratio
        };
      
      case 'residuals':
        return {
          width: Math.max(minWidth, 600),
          height: Math.max(minHeight, headerHeight + 450)
        };
      
      default:
        return {
          width: Math.max(minWidth, 600),
          height: Math.max(minHeight, headerHeight + 400)
        };
    }
  };

  // Auto-adjust panel size when visualization data changes (only when expanded)
  useEffect(() => {
    if (isExpanded && visualizationData && (visualizationData.activeType || visualizationData.kind)) {
      const chartType = visualizationData.activeType || visualizationData.kind;
      const optimalDims = getOptimalDimensions(chartType, visualizationData);
      
      // Only update if dimensions are significantly different
      const widthDiff = Math.abs(panel.width - optimalDims.width);
      const heightDiff = Math.abs(panel.height - optimalDims.height);
      
      if (widthDiff > 50 || heightDiff > 50) {
        onPanelUpdate(panel.id, {
          width: optimalDims.width,
          height: optimalDims.height
        });
      }
    }
  }, [visualizationData?.activeType, visualizationData?.kind, isExpanded]);

  // Auto-resize when panel is expanded to ensure full content is visible
  useEffect(() => {
    if (isExpanded && visualizationData && (visualizationData.activeType || visualizationData.kind)) {
      const chartType = visualizationData.activeType || visualizationData.kind;
      const optimalDims = getOptimalDimensions(chartType, visualizationData);
      
      // When expanding, ensure we have at least the optimal size
      const needsResize = (
        panel.width < optimalDims.width || 
        panel.height < optimalDims.height
      );
      
      if (needsResize) {
        onPanelUpdate(panel.id, {
          width: Math.max(panel.width, optimalDims.width),
          height: Math.max(panel.height, optimalDims.height)
        });
      }
    }
    
    // Handle collapsed state sizing (run only once when collapsing)
    if (!isExpanded && panel.height > 150) {
      const headerOnlyHeight = 72; // 60px header + 12px collapsed content
      onPanelUpdate(panel.id, {
        height: headerOnlyHeight
      });
    }
  }, [isExpanded]);

  // Auto-adjust panel size for PNG images (only when expanded)
  useEffect(() => {
    if (isExpanded && visualizationData?.image_base64) {
      // Create a temporary image to get dimensions
      const tempImg = new Image();
      tempImg.onload = () => {
        const imageWidth = tempImg.width;
        const imageHeight = tempImg.height;
        const headerHeight = 60;
        const padding = 40;
        
        // Calculate minimum required panel size
        const minRequiredWidth = imageWidth + padding;
        const minRequiredHeight = imageHeight + headerHeight + padding;
        
        // Check if we need to resize
        const needsResize = (
          panel.width < minRequiredWidth || 
          panel.height < minRequiredHeight
        );
        
        if (needsResize) {
          const newWidth = Math.max(panel.width, minRequiredWidth);
          const newHeight = Math.max(panel.height, minRequiredHeight);
          
          // Force immediate update
          onPanelUpdate(panel.id, {
            width: newWidth,
            height: newHeight
          });
        }
      };
      
      tempImg.onerror = (error) => {
        // Failed to load PNG image for sizing
      };
      
      // Load the image
      tempImg.src = `data:image/png;base64,${visualizationData.image_base64}`;
    }
  }, [visualizationData?.image_base64, isExpanded]);

  // Debug what data we're receiving

  // Function to render data-based visualizations
  const renderDataVisualization = (data: any) => {
    const kind = data.activeType || data.kind;
    const chartData = data.data;
    
    if (!chartData) {
      return <div className="text-gray-500 text-center">No data available for visualization</div>;
    }
    
    switch (kind) {
      case 'pred_vs_actual':
        return renderScatterPlot(chartData.actual, chartData.pred, 'Actual', 'Predicted', 'Predictions vs Actual Values');
      
      case 'residuals':
        return renderHistogram(chartData.residuals, 'Residuals', 'Frequency', 'Residuals Distribution');
        
      case 'residuals_vs_fitted':
        return renderScatterPlot(chartData.fitted, chartData.residuals, 'Fitted Values', 'Residuals', 'Residuals vs Fitted Values');
      
      case 'qq_plot':
        return chartData.theoretical && chartData.sample ? 
          renderQQPlot(chartData.theoretical, chartData.sample) : 
          renderError('Invalid Q-Q plot data');
        
      case 'feature_importance':
        return renderFeatureImportance(chartData);
        
      case 'confusion_matrix':
        return chartData.labels && chartData.matrix ? 
          renderConfusionMatrix(chartData.labels, chartData.matrix) : 
          renderError('Invalid confusion matrix data');
        
      case 'roc':
        return chartData.fpr && chartData.tpr ? 
          renderROCCurve(chartData.fpr, chartData.tpr) : 
          renderError('Invalid ROC curve data');
        
      default:
        return (
      <div className="bg-gray-50 p-4 rounded-none max-w-full">
            <h5 className="font-medium mb-2">Raw Data ({kind})</h5>
            <pre className="text-xs overflow-auto max-h-40 max-w-full">
              {JSON.stringify(chartData, null, 2)}
            </pre>
          </div>
        );
    }
  };

  // Enhanced scatter plot renderer with regression line
  const renderScatterPlot = (xData: number[], yData: number[], xLabel: string, yLabel: string, title?: string) => {
    const maxPoints = 200; // Increase for better detail
    const points = xData.slice(0, maxPoints).map((x, i) => ({ x, y: yData[i] }));
    
    // Calculate ranges for scaling
    const xMin = Math.min(...xData);
    const xMax = Math.max(...xData);
    const yMin = Math.min(...yData);
    const yMax = Math.max(...yData);
    
    const width = Math.min(panel.width - 80, 500);
    const height = Math.max(300, panel.height - 120); // Use more of the available height
    const margin = 60; // Increased margin for x-axis labels
    
    // Calculate regression line for pred_vs_actual plots
    let regressionLine = null;
    if (title?.includes('Predictions') || title?.includes('Actual')) {
      // Simple linear regression calculation
      const n = points.length;
      const sumX = points.reduce((sum, p) => sum + p.x, 0);
      const sumY = points.reduce((sum, p) => sum + p.y, 0);
      const sumXY = points.reduce((sum, p) => sum + p.x * p.y, 0);
      const sumXX = points.reduce((sum, p) => sum + p.x * p.x, 0);
      
      const slope = (n * sumXY - sumX * sumY) / (n * sumXX - sumX * sumX);
      const intercept = (sumY - slope * sumX) / n;
      
      // Calculate regression line points
      const regX1 = xMin;
      const regX2 = xMax;
      const regY1 = slope * regX1 + intercept;
      const regY2 = slope * regX2 + intercept;
      
      regressionLine = { x1: regX1, y1: regY1, x2: regX2, y2: regY2, slope, intercept };
    }
    
    return (
      <div className="flex flex-col items-center space-y-3">
        {title && <h4 className="text-sm font-medium text-gray-700">{title}</h4>}
  <div className="bg-white border border-gray-200 rounded-none p-4">
          <svg width={width} height={height} className="mx-auto">
            {/* Grid lines */}
            <defs>
              <pattern id="grid" width="20" height="20" patternUnits="userSpaceOnUse">
                <path d="M 20 0 L 0 0 0 20" fill="none" stroke="#f3f4f6" strokeWidth="1"/>
              </pattern>
            </defs>
            <rect width={width - 2 * margin} height={height - 2 * margin} 
                  x={margin} y={margin} fill="url(#grid)" opacity="0.3"/>
            
            {/* Plot points with hover */}
            {points.map((point, i) => {
              const x = margin + ((point.x - xMin) / (xMax - xMin)) * (width - 2 * margin);
              const y = height - margin - ((point.y - yMin) / (yMax - yMin)) * (height - 2 * margin);
              return (
                <circle 
                  key={i} 
                  cx={x} 
                  cy={y} 
                  r="3" 
                  fill="#3b82f6" 
                  opacity="0.7"
                  className="hover:opacity-100 hover:r-4 cursor-pointer"
                >
                  <title>{`${xLabel}: ${point.x.toFixed(3)}, ${yLabel}: ${point.y.toFixed(3)}`}</title>
                </circle>
              );
            })}
            
            {/* Regression line */}
            {regressionLine && (
              <>
                <line 
                  x1={margin + ((regressionLine.x1 - xMin) / (xMax - xMin)) * (width - 2 * margin)}
                  y1={height - margin - ((regressionLine.y1 - yMin) / (yMax - yMin)) * (height - 2 * margin)}
                  x2={margin + ((regressionLine.x2 - xMin) / (xMax - xMin)) * (width - 2 * margin)}
                  y2={height - margin - ((regressionLine.y2 - yMin) / (yMax - yMin)) * (height - 2 * margin)}
                  stroke="#ef4444" 
                  strokeWidth="3" 
                  strokeDasharray="none"
                  opacity="0.8"
                />
                {/* Regression equation */}
                <text 
                  x={width - margin - 10} 
                  y={margin + 20} 
                  textAnchor="end" 
                  className="text-xs fill-red-600 font-medium"
                >
                  y = {regressionLine.slope.toFixed(3)}x + {regressionLine.intercept.toFixed(3)}
                </text>
              </>
            )}
            
            {/* Reference line for perfect predictions */}
            {title?.includes('Predictions') && !regressionLine && (
              <line 
                x1={margin} 
                y1={height - margin} 
                x2={width - margin} 
                y2={margin} 
                stroke="#10b981" 
                strokeWidth="2" 
                strokeDasharray="5,5"
                opacity="0.7"
              />
            )}
            
            {/* Axes */}
            <line x1={margin} y1={height - margin} x2={width - margin} y2={height - margin} stroke="#374151" strokeWidth="2" />
            <line x1={margin} y1={margin} x2={margin} y2={height - margin} stroke="#374151" strokeWidth="2" />
            
            {/* Axis labels */}
            <text x={width / 2} y={height - 10} textAnchor="middle" className="text-sm fill-gray-700 font-medium">{xLabel}</text>
            <text x={20} y={height / 2} textAnchor="middle" transform={`rotate(-90 20 ${height / 2})`} className="text-sm fill-gray-700 font-medium">{yLabel}</text>
            
            {/* Axis ticks and values */}
            {[0, 0.25, 0.5, 0.75, 1].map(frac => {
              const xVal = xMin + frac * (xMax - xMin);
              const yVal = yMin + frac * (yMax - yMin);
              const xPos = margin + frac * (width - 2 * margin);
              const yPos = height - margin - frac * (height - 2 * margin);
              
              return (
                <g key={frac}>
                  <line x1={xPos} y1={height - margin} x2={xPos} y2={height - margin + 5} stroke="#374151" strokeWidth="1" />
                  <line x1={margin} y1={yPos} x2={margin - 5} y2={yPos} stroke="#374151" strokeWidth="1" />
                  <text x={xPos} y={height - margin + 18} textAnchor="middle" className="text-xs fill-gray-600">{xVal.toFixed(2)}</text>
                  <text x={margin - 8} y={yPos + 3} textAnchor="end" className="text-xs fill-gray-600">{yVal.toFixed(2)}</text>
                </g>
              );
            })}
          </svg>
        </div>
        <div className="text-xs text-gray-500 text-center space-y-1">
          <div>Showing {Math.min(maxPoints, xData.length)} of {xData.length} points • Hover points for details</div>
          {regressionLine && (
            <div className="text-red-600 font-medium">
              Regression line: y = {regressionLine.slope.toFixed(3)}x + {regressionLine.intercept.toFixed(3)}
            </div>
          )}
        </div>
      </div>
    );
  };

  // Enhanced histogram renderer
  const renderHistogram = (data: number[], xLabel: string, yLabel: string, title: string) => {
    const bins = 20;
    const min = Math.min(...data);
    const max = Math.max(...data);
    const binWidth = (max - min) / bins;
    
    const histogram = new Array(bins).fill(0);
    data.forEach(value => {
      const binIndex = Math.min(Math.floor((value - min) / binWidth), bins - 1);
      histogram[binIndex]++;
    });
    
    const maxCount = Math.max(...histogram);
    const width = Math.min(panel.width - 80, 500);
    const height = Math.max(300, panel.height - 120); // Use more of the available height
    const margin = 60; // Increased margin for x-axis labels
    
    // Calculate statistics for display
    const mean = data.reduce((sum, val) => sum + val, 0) / data.length;
    const median = [...data].sort((a, b) => a - b)[Math.floor(data.length / 2)];
    const std = Math.sqrt(data.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / data.length);
    
    return (
      <div className="flex flex-col items-center space-y-3">
        <h4 className="text-sm font-medium text-gray-700">{title}</h4>
  <div className="bg-white border border-gray-200 rounded-none p-4">
          <svg width={width} height={height} className="mx-auto">
            {/* Grid lines */}
            <defs>
              <pattern id="hist-grid" width="20" height="20" patternUnits="userSpaceOnUse">
                <path d="M 20 0 L 0 0 0 20" fill="none" stroke="#f3f4f6" strokeWidth="1"/>
              </pattern>
            </defs>
            <rect width={width - 2 * margin} height={height - 2 * margin} 
                  x={margin} y={margin} fill="url(#hist-grid)" opacity="0.3"/>
            
            {/* Bars */}
            {histogram.map((count, i) => {
              const barWidth = (width - 2 * margin) / bins;
              const barHeight = (count / maxCount) * (height - 2 * margin);
              const x = margin + i * barWidth;
              const y = height - margin - barHeight;
              
              return (
                <g key={i}>
                  <rect 
                    x={x} 
                    y={y} 
                    width={barWidth - 1} 
                    height={barHeight} 
                    fill="#10b981" 
                    opacity="0.7"
                    className="hover:opacity-100 cursor-pointer"
                  >
                    <title>{`Range: ${(min + i * binWidth).toFixed(3)} - ${(min + (i + 1) * binWidth).toFixed(3)}, Count: ${count}`}</title>
                  </rect>
                  {/* Bin labels for first, middle, and last */}
                  {(i === 0 || i === Math.floor(bins / 2) || i === bins - 1) && (
                    <text 
                      x={x + barWidth / 2} 
                      y={height - margin + 15} 
                      textAnchor="middle" 
                      className="text-xs fill-gray-600"
                    >
                      {(min + i * binWidth).toFixed(1)}
                    </text>
                  )}
                </g>
              );
            })}
            
            {/* Mean line */}
            <line 
              x1={margin + ((mean - min) / (max - min)) * (width - 2 * margin)}
              y1={margin}
              x2={margin + ((mean - min) / (max - min)) * (width - 2 * margin)}
              y2={height - margin}
              stroke="#ef4444"
              strokeWidth="2"
              strokeDasharray="5,5"
              opacity="0.8"
            />
            <text 
              x={margin + ((mean - min) / (max - min)) * (width - 2 * margin) + 5}
              y={margin + 15}
              className="text-xs fill-red-600 font-medium"
            >
              Mean: {mean.toFixed(3)}
            </text>
            
            {/* Median line */}
            <line 
              x1={margin + ((median - min) / (max - min)) * (width - 2 * margin)}
              y1={margin}
              x2={margin + ((median - min) / (max - min)) * (width - 2 * margin)}
              y2={height - margin}
              stroke="#f59e0b"
              strokeWidth="2"
              strokeDasharray="3,3"
              opacity="0.8"
            />
            <text 
              x={margin + ((median - min) / (max - min)) * (width - 2 * margin) + 5}
              y={margin + 30}
              className="text-xs fill-orange-600 font-medium"
            >
              Median: {median.toFixed(3)}
            </text>
            
            {/* Axes */}
            <line x1={margin} y1={height - margin} x2={width - margin} y2={height - margin} stroke="#374151" strokeWidth="2" />
            <line x1={margin} y1={margin} x2={margin} y2={height - margin} stroke="#374151" strokeWidth="2" />
            
            {/* Labels */}
            <text x={width / 2} y={height - 10} textAnchor="middle" className="text-sm fill-gray-700 font-medium">{xLabel}</text>
            <text x={20} y={height / 2} textAnchor="middle" transform={`rotate(-90 20 ${height / 2})`} className="text-sm fill-gray-700 font-medium">{yLabel}</text>
            
            {/* Y-axis ticks */}
            {[0, 0.25, 0.5, 0.75, 1].map(frac => {
              const count = frac * maxCount;
              const yPos = height - margin - frac * (height - 2 * margin);
              
              return (
                <g key={frac}>
                  <line x1={margin} y1={yPos} x2={margin - 5} y2={yPos} stroke="#374151" strokeWidth="1" />
                  <text x={margin - 8} y={yPos + 3} textAnchor="end" className="text-xs fill-gray-600">{Math.round(count)}</text>
                </g>
              );
            })}
          </svg>
        </div>
        <div className="text-xs text-gray-500 text-center space-y-1">
          <div>{data.length} data points • {bins} bins • Hover bars for details</div>
          <div className="flex justify-center space-x-4 text-xs">
            <span className="text-red-600">Mean: {mean.toFixed(3)}</span>
            <span className="text-orange-600">Median: {median.toFixed(3)}</span>
            <span className="text-blue-600">Std: {std.toFixed(3)}</span>
          </div>
        </div>
      </div>
    );
  };

  // Simple bar chart renderer  
  const renderBarChart = (labels: string[], values: number[], title: string) => {
    const maxBars = 15; // Increase for more features
    const data = labels.slice(0, maxBars).map((label, i) => ({ label, value: values[i] }));
    
    const maxValue = Math.max(...values);
    const width = Math.min(panel.width - 80, 600);
    const height = Math.max(300, panel.height - 120); // Use more of the available height
    const margin = 60;
    const barWidth = (width - 2 * margin) / data.length;
    
    return (
      <div className="flex flex-col items-center space-y-3">
        <h4 className="text-sm font-medium text-gray-700">{title}</h4>
  <div className="bg-white border border-gray-200 rounded-none p-4">
          <svg width={width} height={height} className="mx-auto">
            {/* Bars */}
            {data.map((item, i) => {
              const barHeight = (item.value / maxValue) * (height - 2 * margin);
              const x = margin + i * barWidth;
              const y = height - margin - barHeight;
              
              return (
                <g key={i}>
                  <rect 
                    x={x + 2} 
                    y={y} 
                    width={barWidth - 4} 
                    height={barHeight} 
                    fill="#10b981" 
                    opacity="0.8"
                    className="hover:opacity-100 cursor-pointer"
                  >
                    <title>{`${item.label}: ${item.value.toFixed(4)}`}</title>
                  </rect>
                  <text 
                    x={x + barWidth / 2} 
                    y={height - margin + 15} 
                    textAnchor="middle" 
                    className="text-xs fill-gray-600"
                    transform={`rotate(-45 ${x + barWidth / 2} ${height - margin + 15})`}
                  >
                    {item.label.length > 10 ? item.label.substring(0, 10) + '...' : item.label}
                  </text>
                </g>
              );
            })}
            
            {/* Axes */}
            <line x1={margin} y1={height - margin} x2={width - margin} y2={height - margin} stroke="#374151" strokeWidth="2" />
            <line x1={margin} y1={margin} x2={margin} y2={height - margin} stroke="#374151" strokeWidth="2" />
            
            {/* Y-axis labels */}
            <text x={20} y={height / 2} textAnchor="middle" transform={`rotate(-90 20 ${height / 2})`} className="text-sm fill-gray-700 font-medium">Importance</text>
          </svg>
        </div>
        <div className="text-xs text-gray-500 text-center">
          Showing top {Math.min(maxBars, labels.length)} features • Hover bars for exact values
        </div>
      </div>
    );
  };

  // Q-Q Plot renderer
  const renderQQPlot = (theoretical: number[], sample: number[]) => {
    const points = theoretical.map((x, i) => ({ x, y: sample[i] }));
    
    const xMin = Math.min(...theoretical);
    const xMax = Math.max(...theoretical);
    const yMin = Math.min(...sample);
    const yMax = Math.max(...sample);
    
    const width = Math.min(panel.width - 80, 500);
    const height = Math.max(300, panel.height - 120); // Use more of the available height
    const margin = 60; // Increased margin for x-axis labels
    
    return (
      <div className="flex flex-col items-center space-y-3">
        <h4 className="text-sm font-medium text-gray-700">Q-Q Plot (Normal Distribution)</h4>
  <div className="bg-white border border-gray-200 rounded-none p-4">
          <svg width={width} height={height} className="mx-auto">
            {/* Plot points */}
            {points.map((point, i) => {
              const x = margin + ((point.x - xMin) / (xMax - xMin)) * (width - 2 * margin);
              const y = height - margin - ((point.y - yMin) / (yMax - yMin)) * (height - 2 * margin);
              return (
                <circle 
                  key={i} 
                  cx={x} 
                  cy={y} 
                  r="2" 
                  fill="#3b82f6" 
                  opacity="0.7"
                  className="hover:opacity-100 cursor-pointer"
                >
                  <title>{`Theoretical: ${point.x.toFixed(3)}, Sample: ${point.y.toFixed(3)}`}</title>
                </circle>
              );
            })}
            
            {/* Reference line (perfect normal distribution) */}
            <line 
              x1={margin} 
              y1={height - margin} 
              x2={width - margin} 
              y2={margin} 
              stroke="#ef4444" 
              strokeWidth="2" 
              strokeDasharray="5,5"
              opacity="0.7"
            />
            
            {/* Axes */}
            <line x1={margin} y1={height - margin} x2={width - margin} y2={height - margin} stroke="#374151" strokeWidth="2" />
            <line x1={margin} y1={margin} x2={margin} y2={height - margin} stroke="#374151" strokeWidth="2" />
            
            {/* Labels */}
            <text x={width / 2} y={height - 15} textAnchor="middle" className="text-sm fill-gray-700 font-medium">Theoretical Quantiles</text>
            <text x={20} y={height / 2} textAnchor="middle" transform={`rotate(-90 20 ${height / 2})`} className="text-sm fill-gray-700 font-medium">Sample Quantiles</text>
          </svg>
        </div>
        <div className="text-xs text-gray-500 text-center">
          {points.length} points • Points close to red line indicate normal distribution
        </div>
      </div>
    );
  };

  // Confusion Matrix renderer
  const renderConfusionMatrix = (labels: string[], matrix: number[][]) => {
    const size = labels.length;
    const cellSize = Math.min(60, (panel.width - 100) / size);
    const width = size * cellSize + 100;
    const height = size * cellSize + 100;
    const maxValue = Math.max(...matrix.flat());
    
    return (
      <div className="flex flex-col items-center space-y-3">
        <h4 className="text-sm font-medium text-gray-700">Confusion Matrix</h4>
  <div className="bg-white border border-gray-200 rounded-none p-4">
          <svg width={width} height={height} className="mx-auto">
            {/* Matrix cells */}
            {matrix.map((row, i) => 
              row.map((value, j) => {
                const x = 50 + j * cellSize;
                const y = 50 + i * cellSize;
                const intensity = value / maxValue;
                
                return (
                  <g key={`${i}-${j}`}>
                    <rect
                      x={x}
                      y={y}
                      width={cellSize}
                      height={cellSize}
                      fill={`rgb(${255 - intensity * 200}, ${255 - intensity * 100}, 255)`}
                      stroke="#374151"
                      strokeWidth="1"
                      className="cursor-pointer"
                    >
                      <title>{`Actual: ${labels[i]}, Predicted: ${labels[j]}, Count: ${value}`}</title>
                    </rect>
                    <text
                      x={x + cellSize / 2}
                      y={y + cellSize / 2 + 5}
                      textAnchor="middle"
                      className="text-sm fill-gray-800 font-medium"
                    >
                      {value}
                    </text>
                  </g>
                );
              })
            )}
            
            {/* Labels */}
            {labels.map((label, i) => (
              <g key={i}>
                <text x={50 + i * cellSize + cellSize / 2} y={40} textAnchor="middle" className="text-sm fill-gray-700 font-medium">{label}</text>
                <text x={40} y={50 + i * cellSize + cellSize / 2 + 5} textAnchor="end" className="text-sm fill-gray-700 font-medium">{label}</text>
              </g>
            ))}
            
            <text x={width / 2} y={height - 10} textAnchor="middle" className="text-sm fill-gray-700 font-medium">Predicted</text>
            <text x={15} y={height / 2} textAnchor="middle" transform={`rotate(-90 15 ${height / 2})`} className="text-sm fill-gray-700 font-medium">Actual</text>
          </svg>
        </div>
        <div className="text-xs text-gray-500 text-center">
          Hover cells for details • Darker colors indicate higher counts
        </div>
      </div>
    );
  };

  // Enhanced ROC Curve renderer
  const renderROCCurve = (fpr: number[], tpr: number[]) => {
    const points = fpr.map((x, i) => ({ x, y: tpr[i] }));
    
    const width = Math.min(panel.width - 80, 500);
    const height = Math.max(300, panel.height - 120); // Use more of the available height
    const margin = 60; // Increased margin for x-axis labels
    
    // Calculate AUC (simple trapezoidal rule)
    let auc = 0;
    for (let i = 1; i < fpr.length; i++) {
      auc += (fpr[i] - fpr[i-1]) * (tpr[i] + tpr[i-1]) / 2;
    }
    
    // Calculate optimal threshold point (closest to top-left)
    let optimalIdx = 0;
    let minDistance = Infinity;
    points.forEach((point, i) => {
      const distance = Math.sqrt(Math.pow(point.x, 2) + Math.pow(1 - point.y, 2));
      if (distance < minDistance) {
        minDistance = distance;
        optimalIdx = i;
      }
    });
    
    return (
      <div className="flex flex-col items-center space-y-3">
        <div className="text-center">
          <h4 className="text-sm font-medium text-gray-700">ROC Curve</h4>
          <div className="text-xs text-gray-600 mt-1">
            Area Under Curve: <span className="font-mono font-medium text-blue-600">{auc.toFixed(4)}</span>
          </div>
        </div>
  <div className="bg-white border border-gray-200 rounded-none p-4">
          <svg width={width} height={height} className="mx-auto">
            {/* Grid lines */}
            <defs>
              <pattern id="roc-grid" width="40" height="40" patternUnits="userSpaceOnUse">
                <path d="M 40 0 L 0 0 0 40" fill="none" stroke="#f3f4f6" strokeWidth="1"/>
              </pattern>
            </defs>
            <rect width={width - 2 * margin} height={height - 2 * margin} 
                  x={margin} y={margin} fill="url(#roc-grid)" opacity="0.3"/>
            
            {/* ROC curve */}
            <polyline
              points={points.map((point, i) => {
                const x = margin + point.x * (width - 2 * margin);
                const y = height - margin - point.y * (height - 2 * margin);
                return `${x},${y}`;
              }).join(' ')}
              fill="none"
              stroke="#3b82f6"
              strokeWidth="3"
              className="cursor-pointer"
            >
              <title>ROC Curve</title>
            </polyline>
            
            {/* Optimal threshold point */}
            {points[optimalIdx] && (
              <circle
                cx={margin + points[optimalIdx].x * (width - 2 * margin)}
                cy={height - margin - points[optimalIdx].y * (height - 2 * margin)}
                r="6"
                fill="#ef4444"
                stroke="white"
                strokeWidth="2"
                className="cursor-pointer"
              >
                <title>Optimal Threshold Point</title>
              </circle>
            )}
            
            {/* Random classifier line */}
            <line 
              x1={margin} 
              y1={height - margin} 
              x2={width - margin} 
              y2={margin} 
              stroke="#ef4444" 
              strokeWidth="2" 
              strokeDasharray="5,5"
              opacity="0.7"
            />
            
            {/* Axes */}
            <line x1={margin} y1={height - margin} x2={width - margin} y2={height - margin} stroke="#374151" strokeWidth="2" />
            <line x1={margin} y1={margin} x2={margin} y2={height - margin} stroke="#374151" strokeWidth="2" />
            
            {/* Axis labels */}
            <text x={width / 2} y={height - 10} textAnchor="middle" className="text-sm fill-gray-700 font-medium">False Positive Rate</text>
            <text x={20} y={height / 2} textAnchor="middle" transform={`rotate(-90 20 ${height / 2})`} className="text-sm fill-gray-700 font-medium">True Positive Rate</text>
            
            {/* Axis ticks and grid */}
            {[0.2, 0.4, 0.6, 0.8].map(frac => (
              <g key={frac} opacity="0.5">
                <line x1={margin + frac * (width - 2 * margin)} y1={margin} x2={margin + frac * (width - 2 * margin)} y2={height - margin} stroke="#9ca3af" strokeWidth="1" />
                <line x1={margin} y1={height - margin - frac * (height - 2 * margin)} x2={width - margin} y2={height - margin - frac * (height - 2 * margin)} stroke="#9ca3af" strokeWidth="1" />
                <text x={margin + frac * (width - 2 * margin)} y={height - margin + 18} textAnchor="middle" className="text-xs fill-gray-600">{frac}</text>
                <text x={margin - 8} y={height - margin - frac * (height - 2 * margin) + 3} textAnchor="end" className="text-xs fill-gray-600">{frac}</text>
              </g>
            ))}
            
            {/* Corner labels */}
            <text x={margin - 5} y={height - margin + 18} textAnchor="middle" className="text-xs fill-gray-600 font-medium">(0,0)</text>
            <text x={width - margin + 5} y={margin - 5} textAnchor="middle" className="text-xs fill-gray-600 font-medium">(1,1)</text>
          </svg>
        </div>
        <div className="text-xs text-gray-500 text-center space-y-1">
          <div>AUC = {auc.toFixed(4)} • Red line shows random classifier</div>
          <div className="flex justify-center space-x-4 text-xs">
            <span className="text-blue-600">ROC Curve</span>
            <span className="text-red-600">Optimal Point</span>
            <span className="text-gray-500">Random Classifier</span>
          </div>
        </div>
      </div>
    );
  };

  // Error renderer
  const renderError = (message: string) => {
    return (
  <div className="flex flex-col items-center justify-center h-full space-y-2 p-6 bg-red-50 border border-red-200 rounded-none">
        <div className="text-red-600 font-bold text-lg">Error</div>
        <div className="text-red-800 font-medium text-center">{message}</div>
        <div className="text-red-600 text-sm text-center">
          Check the console for more details
        </div>
      </div>
    );
  };

  // Feature importance renderer
  const renderFeatureImportance = (data: any) => {
    if (!data || (!data.features && !data.feature_names) || (!data.importances && !data.importance)) {
      return renderError('Missing feature importance data');
    }

    const features = data.features || data.feature_names || [];
    const importances = data.importances || data.importance || [];
    
    if (features.length === 0 || importances.length === 0) {
      return renderError('No feature importance data available');
    }

    return renderBarChart(features, importances, 'Feature Importance');
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

  const getVisualizationTitle = (type: string) => {
    switch (type) {
      case 'pred_vs_actual': return 'Predicted vs Actual';
      case 'residuals': return 'Residuals Plot';
      case 'qq_plot': return 'Q-Q Plot';
      case 'residuals_vs_fitted': return 'Residuals vs Fitted';
      case 'confusion_matrix': return 'Confusion Matrix';
      case 'roc_curve': return 'ROC Curve';
      case 'feature_importance': return 'Feature Importance';
      default: return 'Model Visualization';
    }
  };

  const downloadImage = () => {
    if (visualizationData?.image_base64) {
      // Legacy image download
      const link = document.createElement('a');
      link.href = `data:image/png;base64,${visualizationData.image_base64}`;
      link.download = `${visualizationData.activeType || 'visualization'}.png`;
      link.click();
    } else {
      // Download SVG chart as PNG
      downloadSVGChart();
    }
  };

  const downloadSVGChart = () => {
    const chartType = visualizationData?.activeType || visualizationData?.kind || 'chart';
    const svgElement = document.querySelector(`#chart-container-${panel.id} svg`);
    
    if (!svgElement) {
      return;
    }

    // Create a canvas to convert SVG to PNG
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    const svgData = new XMLSerializer().serializeToString(svgElement);
    
    // Get SVG dimensions
    const svgRect = svgElement.getBoundingClientRect();
    canvas.width = svgRect.width * 2; // Higher resolution
    canvas.height = svgRect.height * 2;
    
    // Create image from SVG
    const img = new Image();
    const svgBlob = new Blob([svgData], { type: 'image/svg+xml;charset=utf-8' });
    const url = URL.createObjectURL(svgBlob);
    
    img.onload = () => {
      // Fill white background
      ctx!.fillStyle = 'white';
      ctx!.fillRect(0, 0, canvas.width, canvas.height);
      
      // Draw SVG on canvas
      ctx!.drawImage(img, 0, 0, canvas.width, canvas.height);
      
      // Download as PNG
      canvas.toBlob((blob) => {
        if (blob) {
          const link = document.createElement('a');
          link.href = URL.createObjectURL(blob);
          link.download = `${chartType}_chart.png`;
          link.click();
          URL.revokeObjectURL(link.href);
        }
      }, 'image/png');
      
      URL.revokeObjectURL(url);
    };
    
    img.src = url;
  };

  const downloadSVGFile = () => {
    const chartType = visualizationData?.activeType || visualizationData?.kind || 'chart';
    const svgElement = document.querySelector(`#chart-container-${panel.id} svg`);
    
    if (!svgElement) {
      return;
    }

    const svgData = new XMLSerializer().serializeToString(svgElement);
    const svgBlob = new Blob([svgData], { type: 'image/svg+xml;charset=utf-8' });
    const url = URL.createObjectURL(svgBlob);
    
    const link = document.createElement('a');
    link.href = url;
    link.download = `${chartType}_chart.svg`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const copyToClipboard = async () => {
    if (visualizationData?.image_base64) {
      try {
        const response = await fetch(`data:image/png;base64,${visualizationData.image_base64}`);
        const blob = await response.blob();
        await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
        // Could add a toast notification here
      } catch (error) {
        // Failed to copy to clipboard
      }
    }
  };

  const fitToImage = () => {
    if (visualizationData?.image_base64) {
      const tempImg = new Image();
      tempImg.onload = () => {
        const headerHeight = 60;
        const padding = 40;
        const newWidth = tempImg.width + padding;
        const newHeight = tempImg.height + headerHeight + padding;
        
        onPanelUpdate(panel.id, {
          width: newWidth,
          height: newHeight
        });
      };
      tempImg.src = `data:image/png;base64,${visualizationData.image_base64}`;
    }
  };

  return (
    <div
      className="panel-content bg-white border border-gray-300 rounded-none shadow-lg overflow-hidden relative"
      style={{ 
        width: panel.width, 
        height: panel.height,
        cursor: isResizing ? 'resizing' : 'default'
      }}
    >
      {/* Header - simplified with visualization-specific actions only */}
  <div className="bg-gradient-to-r from-purple-50 to-violet-50 p-4 pr-24 rounded-none border-b border-gray-200">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="w-4 h-4 bg-gradient-to-br from-purple-500 to-violet-600 rounded-none shadow-sm"></div>
            <div>
              <h3 className="font-semibold text-gray-800 text-sm">
                {getVisualizationTitle(visualizationData?.activeType)}
              </h3>
              {visualizationData?.data && (
                <p className="text-xs text-gray-500 mt-0.5">
                  {visualizationData.data.labels?.length || 
                   visualizationData.data.actual?.length || 
                   visualizationData.data.residuals?.length || 
                   visualizationData.data.features?.length || 0} data points
                </p>
              )}
            </div>
          </div>
          <div className="flex items-center space-x-2">
            {/* Visualization-specific actions only - standard actions moved to overlay */}
            
            {/* Fit to Image button for PNG images */}
            {visualizationData?.image_base64 && (
              <button
                onClick={fitToImage}
                className="p-2 rounded-none hover:bg-purple-100 text-purple-600 hover:text-purple-700 transition-all duration-200 text-xs"
                title="Fit Panel to Image Size"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 1v4m0 0h-4m4 0l-5-5" />
                </svg>
              </button>
            )}
            
            {/* Download buttons - show for both legacy images and new SVG charts */}
            {(visualizationData?.image_base64 || visualizationData?.data) && (
              <>
                <button
                  onClick={downloadImage}
                  className="p-2 rounded-none hover:bg-purple-100 text-purple-600 hover:text-purple-700 transition-all duration-200 text-xs"
                  title="Download PNG"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                </button>
                {/* SVG download only for data-based charts */}
                {visualizationData?.data && (
                  <button
                    onClick={downloadSVGFile}
                    className="p-2 rounded-none hover:bg-purple-100 text-purple-600 hover:text-purple-700 transition-all duration-200 text-xs"
                    title="Download SVG"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                    </svg>
                  </button>
                )}
              </>
            )}
            
            {visualizationData?.image_base64 && (
              <button
                onClick={copyToClipboard}
                className="p-2 rounded-none hover:bg-purple-100 text-purple-600 hover:text-purple-700 transition-all duration-200 text-xs"
                title="Copy to Clipboard"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                </svg>
              </button>
            )}
          </div>
        </div>
      </div>      {/* Content */}
      {isExpanded ? (
        <div 
          className="p-4" 
          style={{ 
            height: panel.height - 60,
            overflow: 'hidden'  // No scrolling when expanded
          }}
        >
          {visualizationData ? (
            <div className="space-y-4 h-full flex flex-col">
              {/* Check for image first (legacy support) */}
              {visualizationData.image_base64 ? (
                <div className="flex justify-center items-center flex-1">
                  <img
                    src={`data:image/png;base64,${visualizationData.image_base64}`}
                    alt={getVisualizationTitle(visualizationData.activeType)}
                    className="max-w-full max-h-full object-contain border border-gray-200 rounded-none"
                    style={{ 
                      maxWidth: '100%',
                      maxHeight: '100%'
                    }}
                  />
                </div>
              ) : visualizationData.data ? (
                /* Render chart from raw data */
                <div className="flex-1 flex flex-col">
                  <div className="text-center mb-2">
                    <h4 className="text-sm font-medium text-gray-700">
                      {getVisualizationTitle(visualizationData.activeType || visualizationData.kind)}
                    </h4>
                  </div>
                  <div id={`chart-container-${panel.id}`} className="flex-1">
                    {renderDataVisualization(visualizationData)}
                  </div>
                </div>
              ) : (
                <div className="flex items-center justify-center flex-1 text-gray-500">
                  No visualization data available
                </div>
              )}

              {/* Visualization Info */}
              {visualizationData.title && (
                <div className="text-center">
                  <h4 className="text-sm font-medium text-gray-700">{visualizationData.title}</h4>
                </div>
              )}

              {/* Metrics or Additional Info */}
              {visualizationData.metrics && (
                <div className="bg-gray-50 border border-gray-200 rounded-none p-3">
                  <h5 className="text-xs font-semibold text-gray-700 mb-2">Metrics</h5>
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    {Object.entries(visualizationData.metrics).map(([key, value]: [string, any]) => (
                      <div key={key}>
                        <span className="font-medium capitalize">{key.replace('_', ' ')}:</span>{' '}
                        <span className="text-gray-700">
                          {typeof value === 'number' ? value.toFixed(4) : String(value)}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Description */}
              {visualizationData.description && (
                <div className="text-xs text-gray-600 bg-gray-50 p-2 rounded-none">
                  {visualizationData.description}
                </div>
              )}
            </div>
          ) : (
            <div className="flex items-center justify-center flex-1 text-gray-500">
              Loading visualization...
            </div>
          )}
        </div>
      ) : (
        /* Collapsed state - show only header-like content */
        <div className="p-2 text-center bg-gray-50 border-t border-gray-200 h-12 flex items-center justify-center">
          <div className="text-xs text-gray-500 font-medium">
            {getVisualizationTitle(visualizationData?.activeType)} • 
            {visualizationData?.data ? 
              ` ${visualizationData.data.labels?.length || 
                visualizationData.data.actual?.length || 
                visualizationData.data.residuals?.length || 
                visualizationData.data.features?.length || 0} data points` : 
              ' Click expand to view'}
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

export default ModelVisualizationPanel;