import React, { useState, useEffect } from 'react';

const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:8000';

interface DataManipulationPanelProps {
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
  onDataUpdated: (datasetId: number) => void;
  isDragging?: boolean;
}

export const DataManipulationPanel: React.FC<DataManipulationPanelProps> = ({ 
  panel, 
  onPanelUpdate,
  onDataUpdated,
  isDragging = false
}) => {
  const [activeTab, setActiveTab] = useState<'clean' | 'filter' | 'transform'>('clean');
  const [dataPreview, setDataPreview] = useState<any>(null);
  const [columns, setColumns] = useState<string[]>([]);
  const [selectedColumn, setSelectedColumn] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [results, setResults] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const datasetLabel = panel.data?.datasetName ?? (panel.data?.datasetId ? `Dataset ${panel.data.datasetId}` : null);
  
  // Resize state
  const [isResizing, setIsResizing] = useState(false);
  const [resizeType, setResizeType] = useState<'n' | 's' | 'e' | 'w' | 'nw' | 'ne' | 'sw' | 'se' | null>(null);
  const [startPos, setStartPos] = useState({ x: 0, y: 0 });
  const [startSize, setStartSize] = useState({ width: 0, height: 0 });
  const [startPanelPos, setStartPanelPos] = useState({ x: 0, y: 0 });

  // Use the expanded state from the panel prop, default to false if not set
  const isExpanded = panel.isExpanded ?? false;
  
  // Function to toggle expand state
  const toggleExpanded = () => {
    onPanelUpdate(panel.id, { isExpanded: !isExpanded });
  };

  // Calculate optimal panel size based on content
  const calculateOptimalSize = () => {
    if (!isExpanded) {
      return { width: 320, height: 80 }; // Collapsed size - header only, standardized
    }
    
    // Base expanded size
    let optimalWidth = 500;
    let optimalHeight = 400;
    
    // Adjust based on content
    if (dataPreview?.data) {
      // More space for data preview table
      optimalHeight += Math.min(200, dataPreview.data.length * 30);
      optimalWidth = Math.max(600, optimalWidth);
    }
    
    if (results) {
      optimalHeight += 120; // Space for results display
    }
    
    return { width: optimalWidth, height: optimalHeight };
  };

  // Auto-resize panel when content changes
  const autoResizePanel = () => {
    const { width, height } = calculateOptimalSize();
    onPanelUpdate(panel.id, { width, height });
  };

  // Auto-resize when content state changes
  useEffect(() => {
    autoResizePanel();
  }, [isExpanded, dataPreview, results, activeTab]);

  useEffect(() => {
    if (panel.data?.datasetId && isExpanded) {
      loadDataPreview();
    }
  }, [panel.data, isExpanded]);

  const loadDataPreview = async () => {
    try {
      const [previewRes, metadataRes] = await Promise.all([
        fetch(`${BACKEND_URL}/dataset/${panel.data.datasetId}/preview?limit=10`),
        fetch(`${BACKEND_URL}/dataset/${panel.data.datasetId}/metadata`)
      ]);

      if (previewRes.ok && metadataRes.ok) {
        const preview = await previewRes.json();
        const metadata = await metadataRes.json();
        setDataPreview(preview.preview);
        const cols = preview.preview?.columns?.filter((c: string) => c !== '_rowid') || [];
        setColumns(cols);
        if (cols.length > 0) {
          setSelectedColumn(cols[0]);
        }
      }
    } catch (error) {
      console.error('Failed to load data preview:', error);
    }
  };

  const performCleaningOperation = async (operation: string, params: any = {}) => {
    if (!selectedColumn && operation !== 'remove_duplicates') {
      setError('Please select a column');
      return;
    }

    setIsProcessing(true);
    setError(null);

    try {
      const response = await fetch(`${BACKEND_URL}/dataset/${panel.data.datasetId}/clean`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          operation,
          column_name: selectedColumn,
          ...params
        }),
      });

      if (response.ok) {
        const result = await response.json();
        setResults(result);
        onDataUpdated(panel.data.datasetId);
        // Reload preview to show updated data
        setTimeout(() => loadDataPreview(), 1000);
      } else {
        const errorData = await response.json();
        setError(errorData.detail || 'Operation failed');
      }
    } catch (error) {
      console.error('Cleaning operation error:', error);
      setError('Operation failed');
    } finally {
      setIsProcessing(false);
    }
  };

  const cleaningOperations = [
    { id: 'remove_nulls', name: 'Remove Null Values', desc: 'Remove rows with null values in the selected column.' },
    { id: 'fill_nulls_mean', name: 'Fill with Mean', desc: 'Fill null values with the column mean.' },
    { id: 'fill_nulls_median', name: 'Fill with Median', desc: 'Fill null values with the column median.' },
    { id: 'remove_duplicates', name: 'Remove Duplicates', desc: 'Remove duplicate rows from the dataset.' },
    { id: 'normalize', name: 'Normalize', desc: 'Scale values in the selected column between 0 and 1.' },
    { id: 'standardize', name: 'Standardize', desc: 'Apply z-score normalization to the selected column.' }
  ];

  const transformOperations = [
    { id: 'uppercase', name: 'Uppercase', desc: 'Convert text to uppercase.' },
    { id: 'lowercase', name: 'Lowercase', desc: 'Convert text to lowercase.' },
    { id: 'trim_whitespace', name: 'Trim Spaces', desc: 'Remove leading and trailing whitespace.' },
    { id: 'round_numbers', name: 'Round Numbers', desc: 'Round numeric values to specified decimals.' }
  ];

  // Resize handlers
  const handleResizeStart = (e: React.MouseEvent, type: 'n' | 's' | 'e' | 'w' | 'nw' | 'ne' | 'sw' | 'se') => {
    e.preventDefault();
    e.stopPropagation();
    
    setIsResizing(true);
    setResizeType(type);
    setStartPos({ x: e.clientX, y: e.clientY });
    setStartSize({ width: panel.width, height: panel.height });
    setStartPanelPos({ x: panel.x, y: panel.y });
  };

  const handleMouseMove = (e: MouseEvent) => {
    if (!isResizing || !resizeType) return;

    const deltaX = e.clientX - startPos.x;
    const deltaY = e.clientY - startPos.y;

    let newWidth = startSize.width;
    let newHeight = startSize.height;
    let newX = startPanelPos.x;
    let newY = startPanelPos.y;

    // Handle different resize directions
    switch (resizeType) {
      case 'e': // East (right edge)
        newWidth = Math.max(200, startSize.width + deltaX);
        break;
      case 'w': // West (left edge)
        newWidth = Math.max(200, startSize.width - deltaX);
        newX = startPanelPos.x + deltaX;
        if (newWidth === 200) newX = startPanelPos.x + startSize.width - 200;
        break;
      case 's': // South (bottom edge)
        newHeight = Math.max(150, startSize.height + deltaY);
        break;
      case 'n': // North (top edge)
        newHeight = Math.max(150, startSize.height - deltaY);
        newY = startPanelPos.y + deltaY;
        if (newHeight === 150) newY = startPanelPos.y + startSize.height - 150;
        break;
      case 'se': // Southeast (bottom-right corner)
        newWidth = Math.max(200, startSize.width + deltaX);
        newHeight = Math.max(150, startSize.height + deltaY);
        break;
      case 'sw': // Southwest (bottom-left corner)
        newWidth = Math.max(200, startSize.width - deltaX);
        newHeight = Math.max(150, startSize.height + deltaY);
        newX = startPanelPos.x + deltaX;
        if (newWidth === 200) newX = startPanelPos.x + startSize.width - 200;
        break;
      case 'ne': // Northeast (top-right corner)
        newWidth = Math.max(200, startSize.width + deltaX);
        newHeight = Math.max(150, startSize.height - deltaY);
        newY = startPanelPos.y + deltaY;
        if (newHeight === 150) newY = startPanelPos.y + startSize.height - 150;
        break;
      case 'nw': // Northwest (top-left corner)
        newWidth = Math.max(200, startSize.width - deltaX);
        newHeight = Math.max(150, startSize.height - deltaY);
        newX = startPanelPos.x + deltaX;
        newY = startPanelPos.y + deltaY;
        if (newWidth === 200) newX = startPanelPos.x + startSize.width - 200;
        if (newHeight === 150) newY = startPanelPos.y + startSize.height - 150;
        break;
    }

    onPanelUpdate(panel.id, {
      width: newWidth,
      height: newHeight,
      x: newX,
      y: newY
    });
  };

  const handleMouseUp = () => {
    setIsResizing(false);
    setResizeType(null);
  };

  React.useEffect(() => {
    if (isResizing) {
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
      return () => {
        document.removeEventListener('mousemove', handleMouseMove);
        document.removeEventListener('mouseup', handleMouseUp);
      };
    }
  }, [isResizing]);

  const handleClose = () => {
    onPanelUpdate(panel.id, { remove: true });
  };

  return (
    <div
      className={`panel-content relative bg-white border border-gray-200 rounded-none shadow-sm overflow-hidden transition-all duration-200 ${
        isDragging ? 'opacity-90 shadow-md' : ''
      }`}
      style={{
        width: panel.width,
        height: panel.height
      }}
    >
      {/* Header - simplified without action buttons */}
      <div className="bg-gray-50 px-3 py-2 border-b border-gray-200">
        <div className="flex items-center gap-2">
          <div className="h-2.5 w-2.5 bg-gray-400" />
          <div>
            <h3 className="text-sm font-medium text-gray-800">Data Cleaning</h3>
            {datasetLabel && (
              <div className="text-[11px] text-gray-500">{datasetLabel}</div>
            )}
          </div>
        </div>
      </div>

      {/* Content */}
  <div className="p-3 overflow-auto scrollable-content" style={{ maxHeight: `${panel.height - 100}px` }}>
        {!isExpanded ? (
          <div className="text-center text-gray-500 text-sm">
            Click to open data manipulation tools
          </div>
        ) : (
          <div className="space-y-4">
            {/* Tabs */}
            <div className="flex items-center gap-1 border border-gray-200 bg-gray-50 p-1 rounded-none">
              {['clean', 'filter', 'transform'].map(tab => (
                <button
                  key={tab}
                  onClick={() => setActiveTab(tab as any)}
                  className={`flex-1 py-2 px-3 rounded-none text-xs font-medium transition-colors border ${
                    activeTab === tab
                      ? 'bg-white text-gray-800 border-gray-300'
                      : 'text-gray-500 hover:text-gray-700 border-transparent'
                  }`}
                >
                  {tab.charAt(0).toUpperCase() + tab.slice(1)}
                </button>
              ))}
            </div>

            {/* Column Selection */}
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">
                Select Column
              </label>
              <select
                value={selectedColumn}
                onChange={(e) => setSelectedColumn(e.target.value)}
                className="w-full p-2 border border-gray-300 rounded-none text-sm"
              >
                {columns.map(col => (
                  <option key={col} value={col}>{col}</option>
                ))}
              </select>
            </div>

            {/* Operations */}
            <div className="space-y-2 max-h-48 overflow-y-auto">
              {activeTab === 'clean' && cleaningOperations.map(op => (
                <div key={op.id} className="border border-gray-200 rounded-none p-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div className="h-2 w-2 bg-gray-500" />
                      <div>
                        <div className="text-xs font-medium text-gray-800">{op.name}</div>
                        <div className="text-[10px] text-gray-500">{op.desc}</div>
                      </div>
                    </div>
                    <button
                      onClick={() => performCleaningOperation(op.id)}
                      disabled={isProcessing}
                      className="px-2 py-1 border border-gray-400 text-gray-700 hover:bg-gray-100 rounded-none text-[10px] disabled:opacity-50"
                    >
                      Apply
                    </button>
                  </div>
                </div>
              ))}

              {activeTab === 'transform' && transformOperations.map(op => (
                <div key={op.id} className="border border-gray-200 rounded-none p-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div className="h-2 w-2 bg-gray-500" />
                      <div>
                        <div className="text-xs font-medium text-gray-800">{op.name}</div>
                        <div className="text-[10px] text-gray-500">{op.desc}</div>
                      </div>
                    </div>
                    <button
                      onClick={() => performCleaningOperation(op.id)}
                      disabled={isProcessing}
                      className="px-2 py-1 border border-gray-400 text-gray-700 hover:bg-gray-100 rounded-none text-[10px] disabled:opacity-50"
                    >
                      Apply
                    </button>
                  </div>
                </div>
              ))}

              {activeTab === 'filter' && (
                <div className="text-center text-gray-500 text-xs py-4">
                  Filter operations coming soon...
                </div>
              )}
            </div>

            {/* Processing Indicator */}
            {isProcessing && (
              <div className="flex items-center justify-center py-2">
                <div className="animate-spin rounded-none h-4 w-4 border-b-2 border-gray-600"></div>
                <span className="ml-2 text-xs text-gray-600">Processing...</span>
              </div>
            )}

            {/* Error Display */}
            {error && (
              <div className="p-2 bg-gray-100 border border-gray-300 rounded-none">
                <p className="text-xs text-gray-700">{error}</p>
              </div>
            )}

            {/* Results Display */}
            {results && (
              <div className="p-2 bg-gray-100 border border-gray-300 rounded-none">
                <p className="text-xs text-gray-700">
                  Operation completed successfully
                </p>
                {results.rows_affected && (
                  <p className="text-[10px] text-gray-600">
                    Rows affected: {results.rows_affected}
                  </p>
                )}
              </div>
            )}

            {/* Data Preview */}
            {dataPreview && dataPreview.rows && (
              <div>
                <h4 className="text-xs font-medium text-gray-700 mb-1">Data Preview</h4>
                <div className="bg-gray-50 rounded-none border max-h-24 overflow-auto">
                  <div className="text-[10px] p-1">
                    {dataPreview.rows.slice(0, 3).map((row: any, i: number) => (
                      <div key={i} className="text-gray-500 truncate">
                        {Object.entries(row)
                          .filter(([key]) => key !== '_rowid')
                          .slice(0, 3)
                          .map(([key, value]) => `${key}: ${value}`)
                          .join(', ')}
                        {Object.keys(row).length > 4 && '...'}
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
      
      {/* Resize handles */}
      {/* Corner handles */}
      <div
        className="absolute top-0 left-0 w-6 h-6 cursor-nw-resize"
        onMouseDown={(e) => handleResizeStart(e, 'nw')}
        title="Resize from top-left corner"
        style={{ background: 'transparent' }}
      />
      <div
        className="absolute top-0 right-0 w-6 h-6 cursor-ne-resize"
        onMouseDown={(e) => handleResizeStart(e, 'ne')}
        title="Resize from top-right corner"
        style={{ background: 'transparent' }}
      />
      <div
        className="absolute bottom-0 left-0 w-6 h-6 cursor-sw-resize"
        onMouseDown={(e) => handleResizeStart(e, 'sw')}
        title="Resize from bottom-left corner"
        style={{ background: 'transparent' }}
      />
      <div
        className="absolute bottom-0 right-0 w-6 h-6 cursor-se-resize"
        onMouseDown={(e) => handleResizeStart(e, 'se')}
        title="Resize from bottom-right corner"
        style={{ background: 'transparent' }}
      />
      
      {/* Edge handles */}
      <div
        className="absolute top-0 left-6 right-6 h-4 cursor-n-resize"
        onMouseDown={(e) => handleResizeStart(e, 'n')}
        title="Resize from top edge"
        style={{ background: 'transparent' }}
      />
      <div
        className="absolute bottom-0 left-6 right-6 h-4 cursor-s-resize"
        onMouseDown={(e) => handleResizeStart(e, 's')}
        title="Resize from bottom edge"
        style={{ background: 'transparent' }}
      />
      <div
        className="absolute left-0 top-6 bottom-6 w-4 cursor-w-resize"
        onMouseDown={(e) => handleResizeStart(e, 'w')}
        title="Resize from left edge"
        style={{ background: 'transparent' }}
      />
      <div
        className="absolute right-0 top-6 bottom-6 w-4 cursor-e-resize"
        onMouseDown={(e) => handleResizeStart(e, 'e')}
        title="Resize from right edge"
        style={{ background: 'transparent' }}
      />
    </div>
  );
};