import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import { StandardPanelWrapper, StandardResizeHandles } from './StandardPanelComponents';

const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:8000';

// Standardized panel sizes (matching InfiniteCanvas)
const PANEL_SIZES = {
  COLLAPSED: { width: 320, height: 80 },
  EXPANDED: { width: 600, height: 500 }  // Standardized size
};

interface DatasetPanelProps {
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
  isDragging?: boolean;
  onCreateGraph: (datasetId: number, graphType: string) => void;
  onCreateModel: (datasetId: number) => void;
  onOpenDataManipulation: (datasetId: number) => void;
  onOpenDataEditor: (datasetId: number) => void;
  onPanelUpdate: (panelId: string, updates: any) => void;
}

export const DatasetPanel: React.FC<DatasetPanelProps> = ({
  panel,
  isDragging = false,
  onCreateGraph,
  onCreateModel,
  onOpenDataManipulation,
  onOpenDataEditor,
  onPanelUpdate
}) => {
  const router = useRouter();
  const [showMenu, setShowMenu] = useState(false);
  const [datasetInfo, setDatasetInfo] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isResizing, setIsResizing] = useState(false);
  const [resizeType, setResizeType] = useState<string>(''); // 'n', 's', 'e', 'w', 'nw', 'ne', 'sw', 'se'
  const [resizeStart, setResizeStart] = useState({ x: 0, y: 0, width: 0, height: 0, panelX: 0, panelY: 0 });
  
  // Use the expanded state from the panel prop, default to false if not set
  const isExpanded = panel.isExpanded ?? false;
  
  // Function to toggle expand state
  const toggleExpanded = () => {
    onPanelUpdate(panel.id, { isExpanded: !isExpanded });
  };
  
  // Merge/Join functionality state
  const [showMergeSection, setShowMergeSection] = useState(false);
  const [mergeFile, setMergeFile] = useState<File | null>(null);
  const [mergeStrategy, setMergeStrategy] = useState<'append_below' | 'merge_on_column' | 'keep_separate'>('append_below');
  const [mergeColumn, setMergeColumn] = useState<string>('');
  const [availableColumns, setAvailableColumns] = useState<string[]>([]);
  const [joinType, setJoinType] = useState<'inner' | 'outer' | 'left' | 'right'>('outer');
  const [mergeLoading, setMergeLoading] = useState(false);

  // Calculate content scale based on panel size vs expanded size
  const getContentScale = () => {
    const expandedWidth = PANEL_SIZES.EXPANDED.width;
    const expandedHeight = PANEL_SIZES.EXPANDED.height;
    
    // Calculate scale based on width (use the smaller scale to maintain aspect ratio)
    const widthScale = panel.width / expandedWidth;
    const heightScale = (panel.height - 80) / (expandedHeight - 80); // Account for header height
    
    return Math.min(widthScale, heightScale);
  };

  // Calculate optimal panel size based on content
  const calculateOptimalSize = () => {
    if (!isExpanded) {
      return PANEL_SIZES.COLLAPSED;
    }
    
    // Base expanded size
    let optimalWidth = PANEL_SIZES.EXPANDED.width;
    let optimalHeight = PANEL_SIZES.EXPANDED.height;
    
    // Additional space for merge section if visible
    if (showMergeSection) {
      optimalHeight += 120; // Additional space for merge form
    }
    
    // Adjust for column count for better data preview
    if (datasetInfo?.preview?.columns) {
      const columnCount = datasetInfo.preview.columns.length;
      if (columnCount > 5) {
        optimalWidth = Math.max(optimalWidth, Math.min(columnCount * 80, 600));
      }
    }
    
    return { width: optimalWidth, height: optimalHeight };
  };

  // Auto-resize panel when content changes
  const autoResizePanel = () => {
    if (!isExpanded) {
      // When collapsed, use standard small size (header only)
      onPanelUpdate(panel.id, { 
        width: PANEL_SIZES.COLLAPSED.width, 
        height: PANEL_SIZES.COLLAPSED.height 
      });
    } else {
      // When expanded, use larger size to show all content
      onPanelUpdate(panel.id, { 
        width: PANEL_SIZES.EXPANDED.width, 
        height: PANEL_SIZES.EXPANDED.height 
      });
    }
  };

  // Auto-resize when expansion state changes
  // Load dataset info on mount for previewing when collapsed
  useEffect(() => {
    loadDatasetInfo();
  }, []);

  // Auto resize effect
  useEffect(() => {
    autoResizePanel();
  }, [isExpanded, showMergeSection, datasetInfo]);

  const handlePanelClick = () => {
    if (!isExpanded) {
      toggleExpanded();
    }
  };

  const loadDatasetInfo = async () => {
    const datasetId = panel.data?.dataset_id || panel.data?.id;
    if (!datasetId) {
      console.error('No dataset ID found:', panel.data);
      return;
    }
    
    setIsLoading(true);
    try {
      console.log('Loading dataset info for ID:', datasetId);
      const [previewRes, metadataRes] = await Promise.all([
        fetch(`${BACKEND_URL}/dataset/${datasetId}/preview?limit=5`),
        fetch(`${BACKEND_URL}/dataset/${datasetId}/metadata`)
      ]);

      console.log('Preview response:', previewRes.status, previewRes.ok);
      console.log('Metadata response:', metadataRes.status, metadataRes.ok);

      if (previewRes.ok && metadataRes.ok) {
        const preview = await previewRes.json();
        const metadata = await metadataRes.json();
        console.log('Loaded data:', { preview, metadata });
        setDatasetInfo({ preview: preview.preview, metadata: metadata.report });
      } else {
        console.error('Failed to load dataset info:', {
          previewStatus: previewRes.status,
          metadataStatus: metadataRes.status
        });
        setError('Failed to load dataset information');
      }
    } catch (error) {
      console.error('Failed to load dataset info:', error);
      setError('Failed to load dataset information');
    } finally {
      setIsLoading(false);
    }
  };

  // Load available columns for merge operations
  const loadAvailableColumns = async () => {
    const datasetId = panel.data?.dataset_id || panel.data?.id;
    if (!datasetId) return;

    try {
      const response = await fetch(`${BACKEND_URL}/dataset/${datasetId}/columns`);
      if (response.ok) {
        const data = await response.json();
        setAvailableColumns(data.columns || []);
      }
    } catch (error) {
      console.error('Failed to load columns:', error);
    }
  };

  // Handle file selection for merge
  const handleMergeFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setMergeFile(file);
    }
  };

  // Perform merge operation
  const handleMergeData = async () => {
    if (!mergeFile) {
      setError('Please select a file to merge');
      return;
    }

    const datasetId = panel.data?.dataset_id || panel.data?.id;
    if (!datasetId) {
      setError('Dataset ID not found');
      return;
    }

    setMergeLoading(true);
    setError(null);

    try {
      const formData = new FormData();
      formData.append('file', mergeFile);
      formData.append('merge_strategy', mergeStrategy);
      formData.append('join_type', joinType);
      formData.append('prefix_conflicting_columns', 'true');
      
      if (mergeStrategy === 'merge_on_column' && mergeColumn) {
        formData.append('merge_column', mergeColumn);
      }

      const response = await fetch(`${BACKEND_URL}/dataset/${datasetId}/add-data`, {
        method: 'POST',
        body: formData,
      });

      if (response.ok) {
        const result = await response.json();
        console.log('Merge result:', result);
        
        // Reset merge form
        setMergeFile(null);
        setShowMergeSection(false);
        
        // Reload dataset info to show updated data
        await loadDatasetInfo();
        
        // Update all panels that might be using this dataset
        onPanelUpdate(panel.id, { 
          data: { 
            ...panel.data, 
            rows_clean: result.final_dataset?.rows_clean,
            cols_clean: result.final_dataset?.cols_clean
          } 
        });
        
      } else {
        const errorData = await response.json();
        setError(errorData.detail || 'Merge operation failed');
      }
    } catch (error) {
      console.error('Merge error:', error);
      setError('Failed to merge data');
    } finally {
      setMergeLoading(false);
    }
  };

  // Load columns when merge section is opened
  useEffect(() => {
    if (showMergeSection) {
      loadAvailableColumns();
    }
  }, [showMergeSection]);

  // Simplified resize logic for testing
  const handleResizeStart = (e: React.MouseEvent, type: string) => {
    e.preventDefault();
    e.stopPropagation();
    
    console.log('=== RESIZE START ===', type);
    
    // Set initial state
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
    
    // Add event listeners immediately with closure over current values
    const handleMouseMove = (moveEvent: MouseEvent) => {
      console.log('=== RESIZE MOVE ===', type);
      
      const deltaX = moveEvent.clientX - startData.x;
      const deltaY = moveEvent.clientY - startData.y;
      
      let newWidth = startData.width;
      let newHeight = startData.height;
      let newX = startData.panelX;
      let newY = startData.panelY;
      
      // Handle all resize directions
      switch (type) {
        case 'nw': // Northwest
          newWidth = Math.max(200, startData.width - deltaX);
          newHeight = Math.max(150, startData.height - deltaY);
          newX = startData.panelX + (startData.width - newWidth);
          newY = startData.panelY + (startData.height - newHeight);
          break;
        case 'n': // North
          newHeight = Math.max(150, startData.height - deltaY);
          newY = startData.panelY + (startData.height - newHeight);
          break;
        case 'ne': // Northeast
          newWidth = Math.max(200, startData.width + deltaX);
          newHeight = Math.max(150, startData.height - deltaY);
          newY = startData.panelY + (startData.height - newHeight);
          break;
        case 'w': // West
          newWidth = Math.max(200, startData.width - deltaX);
          newX = startData.panelX + (startData.width - newWidth);
          break;
        case 'e': // East
          newWidth = Math.max(200, startData.width + deltaX);
          break;
        case 'sw': // Southwest
          newWidth = Math.max(200, startData.width - deltaX);
          newHeight = Math.max(150, startData.height + deltaY);
          newX = startData.panelX + (startData.width - newWidth);
          break;
        case 's': // South
          newHeight = Math.max(150, startData.height + deltaY);
          break;
        case 'se': // Southeast
          newWidth = Math.max(200, startData.width + deltaX);
          newHeight = Math.max(150, startData.height + deltaY);
          break;
      }
      
      console.log('=== NEW SIZE ===', { width: newWidth, height: newHeight, x: newX, y: newY });
      
      // Update panel with new dimensions and position
      const updates: any = { width: newWidth, height: newHeight };
      if (newX !== startData.panelX) updates.x = newX;
      if (newY !== startData.panelY) updates.y = newY;
      
      onPanelUpdate(panel.id, updates);
    };
    
    const handleMouseUp = () => {
      console.log('=== RESIZE END ===');
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
      setIsResizing(false);
      setResizeType('');
    };
    
    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
  };

  const graphTypes = [
    { id: 'bar', name: 'Bar Chart', icon: 'BAR' },
    { id: 'line', name: 'Line Chart', icon: 'LINE' },
    { id: 'scatter', name: 'Scatter Plot', icon: 'SCATTER' },
    { id: 'histogram', name: 'Histogram', icon: 'HIST' },
    { id: 'heatmap', name: 'Heatmap', icon: 'HEAT' },
    { id: 'correlation', name: 'Correlation', icon: 'CORR' }
  ];

  return (
    <div
      className={`panel-content relative bg-white rounded-xl shadow-xl border transition-all duration-300 ease-out ${
        isExpanded ? 'border-blue-400 shadow-2xl' : 'border-gray-200 hover:border-blue-300 shadow-lg'
      } ${isDragging ? 'opacity-90 shadow-2xl scale-105' : ''}`}
      style={{
        width: panel.width,
        height: panel.height,
        pointerEvents: isDragging ? 'none' : 'auto'
      }}
      onClick={handlePanelClick}
    >
      {/* Header - simplified without action buttons */}
      <div className="bg-gradient-to-r from-blue-50 to-indigo-50 px-4 py-2 pr-24 rounded-t-xl border-b border-gray-200">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="w-3 h-3 bg-blue-500 rounded-full shadow-sm"></div>
            <div>
              <h3 className="font-semibold text-gray-800 text-sm leading-tight">
                {panel.data?.name || panel.data?.original_filename || 'Dataset'}
              </h3>
              <div className="flex items-center space-x-4 text-[11px] text-gray-600 mt-0.5">
                <span><span className="font-medium">Rows:</span> {panel.data?.rows_clean?.toLocaleString() || 'N/A'}</span>
                <span><span className="font-medium">Cols:</span> {panel.data?.cols_clean || 'N/A'}</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Content Area - Only show when expanded */}
      {isExpanded && (
        <div 
          className="scrollable-content overflow-auto px-4 py-3" 
          style={{ 
            transform: `scale(${getContentScale()})`,
            transformOrigin: 'top left',
            width: `${100 / getContentScale()}%`,
            height: `${(panel.height - 80) / getContentScale()}px`
          }}
        >
          <div className="space-y-4">
            {/* Error Display */}
            {error && (
              <div className="p-3 bg-red-50 border border-red-200 rounded-lg">
                <div className="flex items-start">
                  <svg className="w-5 h-5 text-red-400 mr-2 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                  </svg>
                  <div className="flex-1">
                    <p className="text-sm text-red-700 font-medium">{error}</p>
                    <button
                      onClick={() => setError(null)}
                      className="no-drag text-xs text-red-600 hover:text-red-800 mt-1 underline"
                    >
                      Dismiss
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* Dataset Info */}
            {isLoading ? (
              <div className="flex items-center justify-center py-8">
                <div className="text-center">
                  <div className="animate-spin rounded-full h-8 w-8 border-2 border-blue-600 border-t-transparent mx-auto"></div>
                  <p className="text-sm text-gray-600 mt-3 font-medium">Loading dataset...</p>
                </div>
              </div>
            ) : datasetInfo ? (
              <div className="space-y-4">
                {/* Quick Actions */}
                <div className="grid grid-cols-2 gap-3">
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      const datasetId = panel.data?.dataset_id || panel.data?.id;
                      if (datasetId) {
                        onOpenDataManipulation(datasetId);
                      } else {
                        setError('Dataset ID not found');
                      }
                    }}
                    className="no-drag flex items-center justify-center p-3 bg-green-50 hover:bg-green-100 rounded-lg text-sm text-green-700 border border-green-200 transition-all hover:shadow-sm"
                  >
                    <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    Clean Data
                  </button>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      const datasetId = panel.data?.dataset_id || panel.data?.id;
                      if (datasetId) {
                        onOpenDataEditor(datasetId);
                      } else {
                        setError('Dataset ID not found');
                      }
                    }}
                    className="no-drag flex items-center justify-center p-3 bg-blue-50 hover:bg-blue-100 rounded-lg text-sm text-blue-700 border border-blue-200 transition-all hover:shadow-sm"
                  >
                    <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                    </svg>
                    Edit Data
                  </button>
                </div>
                
                <div className="grid grid-cols-1 gap-2">
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      const datasetId = panel.data?.dataset_id || panel.data?.id;
                      console.log('Create Model button clicked', {
                        datasetId,
                        panelData: panel.data,
                        onCreateModel: typeof onCreateModel
                      });
                      if (datasetId) {
                        console.log('Calling onCreateModel with datasetId:', datasetId);
                        try {
                          onCreateModel(datasetId);
                          console.log('onCreateModel called successfully');
                        } catch (error) {
                          console.error('Error calling onCreateModel:', error);
                        }
                      } else {
                        console.error('Dataset ID not found in panel data:', panel.data);
                        setError('Dataset ID not found');
                      }
                    }}
                    className="p-2 bg-purple-50 hover:bg-purple-100 rounded text-sm text-purple-700 border border-purple-200"
                  >
                    Create Model
                  </button>
                </div>

                {/* Merge/Join Data Section */}
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <h4 className="text-xs font-medium text-gray-700">Merge/Join Data</h4>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setShowMergeSection(!showMergeSection);
                      }}
                      className="text-xs text-blue-600 hover:text-blue-800"
                    >
                      {showMergeSection ? 'Hide' : 'Show'}
                    </button>
                  </div>
                  
                  {showMergeSection && (
                    <div className="space-y-3 p-3 bg-gray-50 rounded border">
                      {/* File Upload */}
                      <div>
                        <label className="text-xs font-medium text-gray-700 block mb-1">
                          Select File to Merge
                        </label>
                        <input
                          type="file"
                          accept=".csv,.xlsx,.xls"
                          onChange={handleMergeFileSelect}
                          className="text-xs w-full"
                          onClick={(e) => e.stopPropagation()}
                        />
                        {mergeFile && (
                          <p className="text-xs text-green-600 mt-1">
                            Selected: {mergeFile.name}
                          </p>
                        )}
                      </div>

                      {/* Merge Strategy */}
                      <div>
                        <label className="text-xs font-medium text-gray-700 block mb-1">
                          Merge Strategy
                        </label>
                        <select
                          value={mergeStrategy}
                          onChange={(e) => setMergeStrategy(e.target.value as any)}
                          className="text-xs w-full p-1 border rounded"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <option value="append_below">Append Below (Stack Vertically)</option>
                          <option value="merge_on_column">Join on Column</option>
                          <option value="keep_separate">Keep as Separate Dataset</option>
                        </select>
                      </div>

                      {/* Column Selection for Join */}
                      {mergeStrategy === 'merge_on_column' && (
                        <>
                          <div>
                            <label className="text-xs font-medium text-gray-700 block mb-1">
                              Join Column
                            </label>
                            <select
                              value={mergeColumn}
                              onChange={(e) => setMergeColumn(e.target.value)}
                              className="text-xs w-full p-1 border rounded"
                              onClick={(e) => e.stopPropagation()}
                            >
                              <option value="">Select column...</option>
                              {availableColumns.map(col => (
                                <option key={col} value={col}>{col}</option>
                              ))}
                            </select>
                          </div>

                          <div>
                            <label className="text-xs font-medium text-gray-700 block mb-1">
                              Join Type
                            </label>
                            <select
                              value={joinType}
                              onChange={(e) => setJoinType(e.target.value as any)}
                              className="text-xs w-full p-1 border rounded"
                              onClick={(e) => e.stopPropagation()}
                            >
                              <option value="outer">Outer Join (All Records)</option>
                              <option value="inner">Inner Join (Matching Only)</option>
                              <option value="left">Left Join (Keep Original)</option>
                              <option value="right">Right Join (Keep New)</option>
                            </select>
                          </div>
                        </>
                      )}

                      {/* Merge Button */}
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleMergeData();
                        }}
                        disabled={!mergeFile || mergeLoading}
                        className={`w-full p-2 text-xs rounded font-medium ${
                          mergeFile && !mergeLoading
                            ? 'bg-blue-600 hover:bg-blue-700 text-white'
                            : 'bg-gray-300 text-gray-500 cursor-not-allowed'
                        }`}
                      >
                        {mergeLoading ? 'Merging...' : 'Merge Data'}
                      </button>
                    </div>
                  )}
                </div>

                {/* Graph Creation */}
                <div>
                  <h4 className="text-xs font-medium text-gray-700 mb-2">Create Graphs</h4>
                  <div className="grid grid-cols-3 gap-1">
                    {graphTypes.map(graph => (
                      <button
                        key={graph.id}
                        onClick={(e) => {
                          e.stopPropagation();
                          const datasetId = panel.data?.dataset_id || panel.data?.id;
                          if (datasetId) {
                            onCreateGraph(datasetId, graph.id);
                          } else {
                            setError('Dataset ID not found');
                          }
                        }}
                        className="p-2 hover:bg-gray-100 rounded text-xs text-center border border-gray-200"
                        title={graph.name}
                      >
                        <div className="font-mono text-xs">{graph.icon}</div>
                        <div className="text-[10px] mt-1">{graph.name.split(' ')[0]}</div>
                      </button>
                    ))}
                  </div>
                </div>

                {/* Data Preview */}
                <div>
                  <h4 className="text-xs font-medium text-gray-700 mb-2">Data Preview</h4>
                  <div className="bg-gray-50 rounded border max-h-32 overflow-auto">
                    {datasetInfo.preview?.columns && (
                      <div className="text-[10px] p-2">
                        <div className="font-medium text-gray-600 mb-1">
                          Columns: {datasetInfo.preview.columns.filter((c: string) => c !== '_rowid').join(', ')}
                        </div>
                        {datasetInfo.preview.rows?.slice(0, 3).map((row: any, i: number) => (
                          <div key={i} className="text-gray-500 truncate">
                            {Object.entries(row)
                              .filter(([key]) => key !== '_rowid')
                              .map(([key, value]) => `${key}: ${value}`)
                              .join(', ')
                            }
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ) : (
              <div className="text-center text-gray-500 text-sm">
                No dataset data available
              </div>
            )}
          </div>
        </div>
      )}

      {/* Context Menu */}
      {showMenu && (
        <div className="absolute top-16 right-4 bg-white rounded-lg shadow-lg border border-gray-200 py-2 z-10">
          <button
            onClick={() => router.push(`/dataset/${panel.data?.dataset_id || panel.data?.id}`)}
            className="w-full px-4 py-2 text-left text-sm hover:bg-gray-100 flex items-center"
          >
            Open Full View
          </button>
          <button
            onClick={(e) => {
              e.stopPropagation();
              const datasetId = panel.data?.dataset_id || panel.data?.id;
              if (datasetId) {
                window.open(`${BACKEND_URL}/dataset/${datasetId}/download.csv`, '_blank');
              }
              setShowMenu(false);
            }}
            className="w-full px-4 py-2 text-left text-sm hover:bg-gray-100"
          >
            Download CSV
          </button>
          <hr className="my-1" />
          <button
            onClick={(e) => {
              e.stopPropagation();
              // TODO: Implement delete functionality
              setShowMenu(false);
            }}
            className="w-full px-4 py-2 text-left text-sm hover:bg-gray-100 text-red-600"
          >
            Remove Panel
          </button>
        </div>
      )}

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