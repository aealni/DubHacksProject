import React, { useState, useEffect } from 'react';

const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:8000';

interface GraphPanelProps {
  panel: {
    id: string;
    type: string;
    x: number;
    y: number;
    width: number;
    height: number;
    data: any;
  };
  onPanelUpdate: (panelId: string, updates: any) => void;
}

export const GraphPanel: React.FC<GraphPanelProps> = ({ panel, onPanelUpdate }) => {
  const [graphData, setGraphData] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isExpanded, setIsExpanded] = useState(true);
  const [availableColumns, setAvailableColumns] = useState<string[]>([]);
  const [selectedXColumn, setSelectedXColumn] = useState<string>('');
  const [selectedYColumn, setSelectedYColumn] = useState<string>('');
  const [showColumnSelection, setShowColumnSelection] = useState(false);
  const [isResizing, setIsResizing] = useState(false);
  const [resizeType, setResizeType] = useState<string>('');
  const [resizeStart, setResizeStart] = useState({ x: 0, y: 0, width: 0, height: 0, panelX: 0, panelY: 0 });
  const headerHeight = 56;

  // Calculate optimal panel size based on content
  const calculateOptimalSize = () => {
    if (!isExpanded) {
      return { width: 300, height: 72 };
    }

  let optimalWidth = 540;
  let optimalHeight = 400;

    if (showColumnSelection) {
      optimalHeight += 60;
    }

    if (graphData) {
      optimalHeight = Math.min(520, optimalHeight + 80);
      optimalWidth = Math.max(optimalWidth, 560);
    }

    return { width: optimalWidth, height: optimalHeight };
  };

  // Calculate content scale based on panel size vs expanded size
  const getContentScale = () => {
    const expandedWidth = 540;
    const expandedHeight = 400;

    const widthScale = panel.width / expandedWidth;
    const heightScale = (panel.height - headerHeight) / (expandedHeight - headerHeight);

    return Math.min(widthScale, heightScale);
  };

  // Auto-resize panel when content changes
  const autoResizePanel = () => {
    const { width, height } = calculateOptimalSize();
    onPanelUpdate(panel.id, { width, height });
  };

  // Auto-resize when content state changes
  useEffect(() => {
    autoResizePanel();
  }, [isExpanded, showColumnSelection, graphData]);

  useEffect(() => {
    console.log('GraphPanel: datasetId changed:', panel.data?.datasetId);
    if (panel.data?.datasetId) {
      loadDatasetColumns();
    }
  }, [panel.data?.datasetId]);

  useEffect(() => {
    console.log('GraphPanel: columns or expansion changed:', {
      selectedXColumn,
      selectedYColumn,
      isExpanded,
      graphType: panel.data?.graphType,
      datasetId: panel.data?.datasetId
    });
    
    // Auto-generate graph when columns are selected
    if (panel.data?.datasetId && isExpanded && availableColumns.length > 0) {
      const canGenerate = 
        panel.data.graphType === 'correlation' || 
        panel.data.graphType === 'histogram' && selectedXColumn ||
        ['scatter', 'line', 'bar'].includes(panel.data.graphType) && selectedXColumn && selectedYColumn;
      
      console.log('Can generate graph:', canGenerate);
      
      if (canGenerate && !graphData) {
        console.log('Auto-generating graph...');
        generateGraph();
      }
    }
  }, [selectedXColumn, selectedYColumn, isExpanded, panel.data, availableColumns]);

  // Handle resize start
  const handleResizeStart = (e: React.MouseEvent, type: string) => {
    e.preventDefault();
    e.stopPropagation();
    
    const startData = {
      x: e.clientX,
      y: e.clientY,
      width: panel.width,
      height: panel.height,
      panelX: panel.x,
      panelY: panel.y
    };
    
    setResizeStart(startData);
    setIsResizing(true);
    setResizeType(type);
  };

  // Handle resize during mouse move - using useCallback to avoid stale closures
  const handleResizeMove = React.useCallback((e: MouseEvent) => {
    if (!isResizing || !resizeType) return;
    
    const deltaX = e.clientX - resizeStart.x;
    const deltaY = e.clientY - resizeStart.y;
    
    let newWidth = resizeStart.width;
    let newHeight = resizeStart.height;
    let newX = resizeStart.panelX;
    let newY = resizeStart.panelY;
    
    // Handle horizontal resizing
    if (resizeType.includes('e')) { // East (right edge)
      newWidth = Math.max(300, resizeStart.width + deltaX);
    } else if (resizeType.includes('w')) { // West (left edge)
      newWidth = Math.max(300, resizeStart.width - deltaX);
      newX = resizeStart.panelX + (resizeStart.width - newWidth);
    }
    
    // Handle vertical resizing
    if (resizeType.includes('s')) { // South (bottom edge)
      newHeight = Math.max(200, resizeStart.height + deltaY);
    } else if (resizeType.includes('n')) { // North (top edge)
      newHeight = Math.max(200, resizeStart.height - deltaY);
      newY = resizeStart.panelY + (resizeStart.height - newHeight);
    }
    
    onPanelUpdate(panel.id, { 
      width: newWidth, 
      height: newHeight,
      x: newX,
      y: newY
    });
  }, [isResizing, resizeType, resizeStart, onPanelUpdate, panel.id]);

  // Handle resize end
  const handleResizeEnd = React.useCallback(() => {
    setIsResizing(false);
    setResizeType('');
  }, []);

  // Add global mouse event listeners for resizing
  useEffect(() => {
    if (isResizing) {
      document.addEventListener('mousemove', handleResizeMove);
      document.addEventListener('mouseup', handleResizeEnd);
    }

    return () => {
      document.removeEventListener('mousemove', handleResizeMove);
      document.removeEventListener('mouseup', handleResizeEnd);
    };
  }, [isResizing, handleResizeMove, handleResizeEnd]);

  const loadDatasetColumns = async () => {
    try {
      console.log('Loading columns for dataset:', panel.data.datasetId);
      const response = await fetch(`${BACKEND_URL}/dataset/${panel.data.datasetId}/metadata`);
      if (response.ok) {
        const metadata = await response.json();
        console.log('Metadata response:', metadata);
        
        // Try multiple possible column sources
        let columns: string[] = [];
        if (metadata.report?.dtype_inference) {
          columns = Object.keys(metadata.report.dtype_inference);
        } else if (metadata.report?.column_types) {
          columns = Object.keys(metadata.report.column_types);
        } else if (metadata.columns) {
          columns = metadata.columns;
        }
        
        console.log('Available columns:', columns);
        const filteredColumns = columns.filter(col => col !== '_rowid');
        setAvailableColumns(filteredColumns);
        
        // Auto-select first numeric columns if available
        const numericColumns = columns.filter(col => {
          const type = metadata.report?.dtype_inference?.[col] || metadata.report?.column_types?.[col];
          return type && (type.includes('numeric') || type.includes('int') || type.includes('float') || type.includes('number'));
        });
        
        console.log('Numeric columns:', numericColumns);
        
        if (numericColumns.length >= 2) {
          setSelectedXColumn(numericColumns[0]);
          setSelectedYColumn(numericColumns[1]);
        } else if (filteredColumns.length >= 2) {
          setSelectedXColumn(filteredColumns[0]);
          setSelectedYColumn(filteredColumns[1]);
        } else if (filteredColumns.length >= 1) {
          setSelectedXColumn(filteredColumns[0]);
        }
      } else {
        console.error('Failed to load metadata:', response.status);
        setError('Failed to load dataset columns');
      }
    } catch (error) {
      console.error('Failed to load dataset columns:', error);
      setError('Failed to load dataset columns');
    }
  };

  useEffect(() => {
    if (panel.data?.datasetId && panel.data?.graphType) {
      generateGraph();
    }
  }, [panel.data]);

  const generateGraph = async () => {
    console.log('Generating graph:', {
      graphType: panel.data.graphType,
      selectedXColumn,
      selectedYColumn,
      datasetId: panel.data.datasetId
    });
    
    if (!selectedXColumn && panel.data.graphType !== 'histogram' && panel.data.graphType !== 'correlation') {
      setError('Please select X column');
      return;
    }
    
    if (!selectedYColumn && ['scatter', 'line'].includes(panel.data.graphType)) {
      setError('Please select Y column');
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const requestBody: any = {
        chart_type: panel.data.graphType,
        title: panel.data.title || `${panel.data.graphType} Chart`,
        config: {
          title: panel.data.title || `${panel.data.graphType} Chart`,
          xlabel: selectedXColumn || 'X',
          ylabel: selectedYColumn || 'Y',
          color_palette: 'viridis'
        }
      };

      // Map parameters based on chart type
      const graphType = panel.data.graphType;
      
      if (graphType === 'histogram' || graphType === 'pie') {
        requestBody.column = selectedXColumn || panel.data.xColumn || null;
      } else if (graphType === 'box' || graphType === 'violin') {
        requestBody.y_column = selectedYColumn || panel.data.yColumn || null;
      } else if (graphType === 'scatter' || graphType === 'line') {
        requestBody.x_column = selectedXColumn || panel.data.xColumn || null;
        requestBody.y_column = selectedYColumn || panel.data.yColumn || null;
      } else if (graphType === 'bar') {
        requestBody.x_column = selectedXColumn || panel.data.xColumn || null;
        if (selectedYColumn || panel.data.yColumn) {
          requestBody.y_column = selectedYColumn || panel.data.yColumn;
        }
      }
      
      console.log('Graph request body:', requestBody);
      
      const response = await fetch(`${BACKEND_URL}/datasets/${panel.data.datasetId}/graphs`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(requestBody),
      });

      if (response.ok) {
        const result = await response.json();
        setGraphData(result);
      } else {
        const errorData = await response.json();
        setError(errorData.detail || 'Failed to generate graph');
      }
    } catch (error) {
      console.error('Graph generation error:', error);
      setError('Failed to generate graph');
    } finally {
      setIsLoading(false);
    }
  };

  const getGraphTypeIcon = (graphType: string) => {
    switch (graphType) {
      case 'scatter': return '';
      case 'bar': return '';
      case 'line': return '';
      case 'box': return '';
      case 'histogram': return '';
      case 'heatmap': return '';
      case 'violin': return '';
      default: return '';
    }
  };

  const getGraphTypeName = (type: string) => {
    switch (type) {
      case 'bar': return 'Bar Chart';
      case 'line': return 'Line Chart';
      case 'scatter': return 'Scatter Plot';
      case 'histogram': return 'Histogram';
      case 'heatmap': return 'Heatmap';
      case 'correlation': return 'Correlation Matrix';
      default: return 'Chart';
    }
  };

  return (
    <div
      className={`panel-content relative bg-white border border-gray-200 shadow-sm ${
        isExpanded ? 'ring-1 ring-gray-300/50' : ''
      }`}
      style={{
        width: panel.width,
        height: panel.height,
        pointerEvents: isResizing ? 'none' : 'auto',
        transition: 'width 0.25s ease, height 0.25s ease'
      }}
    >
      <div className="bg-gray-50 px-3 py-2 border-b border-gray-200">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="w-2.5 h-2.5 rounded-full bg-gray-500"></div>
            <div>
              <h3 className="text-sm font-medium text-gray-800">
                {getGraphTypeName(panel.data?.graphType)}
              </h3>
              <div className="mt-0.5 text-[11px] text-gray-500">
                Dataset: {panel.data?.datasetName || panel.data?.datasetId}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Content */}
      <div 
        className="scrollable-content overflow-y-auto overflow-x-hidden px-4 py-3" 
        style={{ 
          transform: `scale(${getContentScale()})`,
          transformOrigin: 'top left',
          width: `${100 / getContentScale()}%`,
          height: `${(panel.height - headerHeight) / getContentScale()}px`
        }}
      >
        {/* Column Selection */}
        {isExpanded && (
          <div className="mb-4 space-y-2 border-b border-gray-200 pb-3">
            <h4 className="text-xs font-medium text-gray-700">
              Column Selection 
              {availableColumns.length > 0 ? `(${availableColumns.length} available)` : '(loading...)'}
            </h4>
            
            {availableColumns.length === 0 ? (
              <div className="py-2 text-xs text-gray-500">
                Loading columns from dataset {panel.data.datasetId}...
                <button
                  onClick={loadDatasetColumns}
                  className="ml-2 border border-gray-300 px-2 py-1 text-xs text-gray-700 hover:bg-gray-100"
                >
                  Retry
                </button>
              </div>
            ) : (
              <>
                <div className="grid grid-cols-2 gap-2 text-xs">
                  {/* X Column */}
                  {panel.data.graphType !== 'correlation' && (
                    <div>
                      <label className="mb-1 block text-gray-600">X Column:</label>
                      <select
                        value={selectedXColumn}
                        onChange={(e) => setSelectedXColumn(e.target.value)}
                        className="w-full border border-gray-300 p-1 text-xs"
                      >
                        <option value="">Select column...</option>
                        {availableColumns.map(col => (
                          <option key={col} value={col}>{col}</option>
                        ))}
                      </select>
                    </div>
                  )}
                  
                  {/* Y Column */}
                  {['scatter', 'line', 'bar'].includes(panel.data.graphType) && (
                    <div>
                      <label className="mb-1 block text-gray-600">Y Column:</label>
                      <select
                        value={selectedYColumn}
                        onChange={(e) => setSelectedYColumn(e.target.value)}
                        className="w-full border border-gray-300 p-1 text-xs"
                      >
                        <option value="">Select column...</option>
                        {availableColumns.map(col => (
                          <option key={col} value={col}>{col}</option>
                        ))}
                      </select>
                    </div>
                  )}
                </div>
                
                {/* Generate Button */}
                <button
                  onClick={generateGraph}
                  disabled={isLoading || (!selectedXColumn && panel.data.graphType !== 'correlation')}
                  className={`w-full mt-2 px-3 py-1 text-xs font-medium transition-colors ${
                    isLoading || (!selectedXColumn && panel.data.graphType !== 'correlation')
                      ? 'bg-gray-200 text-gray-500 cursor-not-allowed'
                      : 'bg-gray-900 text-white hover:bg-gray-700'
                  }`}
                >
                  {isLoading ? 'Generating...' : 'Generate Graph'}
                </button>
              </>
            )}
          </div>
        )}
        
        {isLoading ? (
          <div className="flex flex-col items-center justify-center h-32">
            <div className="h-8 w-8 animate-spin rounded-none border-b-2 border-gray-600"></div>
            <p className="mt-2 text-sm text-gray-500">Generating graph...</p>
          </div>
        ) : error ? (
          <div className="flex flex-col items-center justify-center h-32 text-center">
            <div className="mb-2 text-lg font-semibold text-gray-700">Error</div>
            <p className="text-sm text-gray-600">{error}</p>
            <button
              onClick={generateGraph}
              className="mt-2 border border-gray-300 px-3 py-1 text-xs text-gray-700 hover:bg-gray-100"
            >
              Retry
            </button>
          </div>
        ) : graphData ? (
          <div className="space-y-2">
            {/* Graph Image */}
            {graphData.image_base64 && (
              <div className="text-center">
                <img
                  src={`data:image/png;base64,${graphData.image_base64}`}
                  alt={graphData.title || 'Graph'}
                  className={`rounded-none border max-w-full ${
                    isExpanded ? 'max-h-80' : 'max-h-32'
                  } object-contain mx-auto`}
                />
              </div>
            )}
            
            {/* Graph Details */}
            {isExpanded && (
              <div className="space-y-2 text-xs">
                {graphData.title && (
                  <div>
                    <span className="font-medium text-gray-700">Title:</span> {graphData.title}
                  </div>
                )}
                {graphData.x_label && (
                  <div>
                    <span className="font-medium text-gray-700">X-axis:</span> {graphData.x_label}
                  </div>
                )}
                {graphData.y_label && (
                  <div>
                    <span className="font-medium text-gray-700">Y-axis:</span> {graphData.y_label}
                  </div>
                )}
                
                {/* Action Buttons */}
                <div className="flex space-x-2 pt-2">
                  <button
                    onClick={() => {
                      const link = document.createElement('a');
                      link.href = `data:image/png;base64,${graphData.image_base64}`;
                      link.download = `${graphData.title || 'graph'}.png`;
                      link.click();
                    }}
                    className="px-2 py-1 bg-blue-100 hover:bg-blue-200 text-blue-700 rounded-none text-xs"
                  >
                    Download
                  </button>
                  <button
                    onClick={generateGraph}
                    className="px-2 py-1 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-none text-xs"
                  >
                    Regenerate
                  </button>
                </div>
              </div>
            )}
          </div>
        ) : (
          <div className="flex items-center justify-center h-32 text-gray-500 text-sm">
            Click to generate graph
          </div>
        )}
      </div>
      
      {/* Resize handles */}
      {/* Corner handles */}
      <div
        className="absolute top-0 left-0 w-6 h-6 cursor-nw-resize"
        onMouseDown={(e) => handleResizeStart(e, 'nw')}
        title="Resize from top-left corner"
      />
      <div
        className="absolute top-0 right-0 w-6 h-6 cursor-ne-resize"
        onMouseDown={(e) => handleResizeStart(e, 'ne')}
        title="Resize from top-right corner"
      />
      <div
        className="absolute bottom-0 left-0 w-6 h-6 cursor-sw-resize"
        onMouseDown={(e) => handleResizeStart(e, 'sw')}
        title="Resize from bottom-left corner"
      />
      <div
        className="absolute bottom-0 right-0 w-6 h-6 cursor-se-resize"
        onMouseDown={(e) => handleResizeStart(e, 'se')}
        title="Resize from bottom-right corner"
      />
      
      {/* Edge handles */}
      <div
        className="absolute top-0 left-6 right-6 h-4 cursor-n-resize"
        onMouseDown={(e) => handleResizeStart(e, 'n')}
        title="Resize from top edge"
      />
      <div
        className="absolute bottom-0 left-6 right-6 h-4 cursor-s-resize"
        onMouseDown={(e) => handleResizeStart(e, 's')}
        title="Resize from bottom edge"
      />
      <div
        className="absolute left-0 top-6 bottom-6 w-4 cursor-w-resize"
        onMouseDown={(e) => handleResizeStart(e, 'w')}
        title="Resize from left edge"
      />
      <div
        className="absolute right-0 top-6 bottom-6 w-4 cursor-e-resize"
        onMouseDown={(e) => handleResizeStart(e, 'e')}
        title="Resize from right edge"
      />
    </div>
  );
};