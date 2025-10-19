import React, { useState, useEffect } from 'react';

const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:8000';

interface DataEditorPanelProps {
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

export const DataEditorPanel: React.FC<DataEditorPanelProps> = ({
  panel,
  onPanelUpdate,
  onDataUpdated,
  isDragging = false
}) => {
  const [data, setData] = useState<any>(null);
  const [columns, setColumns] = useState<string[]>([]);
  const [editingCell, setEditingCell] = useState<{row: number, col: string} | null>(null);
  const [editingValue, setEditingValue] = useState('');
  const [editingColumn, setEditingColumn] = useState<string | null>(null);
  const [newColumnName, setNewColumnName] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [currentPage, setCurrentPage] = useState(0);
  const [totalRows, setTotalRows] = useState(0);
  const pageSize = 10;
  
  // Resize state
  const [isResizing, setIsResizing] = useState(false);
  const [resizeType, setResizeType] = useState<'n' | 's' | 'e' | 'w' | 'nw' | 'ne' | 'sw' | 'se' | null>(null);
  const [startPos, setStartPos] = useState({ x: 0, y: 0 });
  
  // Use the expanded state from the panel prop, default to false if not set
  const isExpanded = panel.isExpanded ?? false;
  
  // Function to toggle expand state
  const toggleExpanded = () => {
    onPanelUpdate(panel.id, { isExpanded: !isExpanded });
  };
  const [startSize, setStartSize] = useState({ width: 0, height: 0 });
  const [startPanelPos, setStartPanelPos] = useState({ x: 0, y: 0 });

  // Calculate optimal panel size based on content
  const calculateOptimalSize = () => {
    if (!isExpanded) {
      return { width: 320, height: 80 }; // Collapsed size - header only, standardized
    }
    
    // Base expanded size for data editor
    let optimalWidth = 800; // Wide for data table
    let optimalHeight = 500;
    
    // Adjust based on columns and data
    if (columns.length > 0) {
      optimalWidth = Math.max(400, Math.min(1200, columns.length * 120));
    }
    
    if (data?.length > 0) {
      optimalHeight = Math.max(400, Math.min(600, 200 + data.length * 40));
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
  }, [isExpanded, data, columns]);

  useEffect(() => {
    if (panel.data?.datasetId && isExpanded) {
      loadData();
    }
  }, [panel.data, isExpanded, currentPage]);

  const loadData = async () => {
    const datasetId = panel.data?.datasetId;
    if (!datasetId) return;

    setIsLoading(true);
    setError(null);
    try {
      const offset = currentPage * pageSize;
  const response = await fetch(`${BACKEND_URL}/dataset/${datasetId}/preview?limit=${pageSize}&offset=${offset}`, { cache: 'no-store' });
      
      if (response.ok) {
        const result = await response.json();
        setData(result.preview);
        setColumns(result.preview.columns.filter((c: string) => c !== '_rowid'));
        setTotalRows(result.preview.total_rows);
      } else {
        setError('Failed to load data');
      }
    } catch (error) {
      console.error('Failed to load data:', error);
      setError('Failed to load data');
    } finally {
      setIsLoading(false);
    }
  };

  const handleCellEdit = async (rowIndex: number, column: string, newValue: string) => {
    const datasetId = panel.data?.datasetId;
    if (!datasetId) return;

    try {
      // Get the actual row ID from the data
      const row = data.rows[rowIndex];
      const rowId = row._rowid || rowIndex;

      const response = await fetch(`${BACKEND_URL}/dataset/${datasetId}/update-cell`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          row_id: rowId,
          column_name: column,
          new_value: newValue
        }),
      });

      if (response.ok) {
        // Update local data
        const updatedRows = [...data.rows];
        updatedRows[rowIndex] = { ...updatedRows[rowIndex], [column]: newValue };
        setData({ ...data, rows: updatedRows });
        onDataUpdated(datasetId);
      } else {
        const errorData = await response.json();
        setError(errorData.detail || 'Failed to update cell');
      }
    } catch (error) {
      console.error('Cell update error:', error);
      setError('Failed to update cell');
    }
  };

  const handleColumnRename = async (oldName: string, newName: string) => {
    const datasetId = panel.data?.datasetId;
    if (!datasetId || !newName.trim() || oldName === newName) return;

    try {
      const response = await fetch(`${BACKEND_URL}/dataset/${datasetId}/rename-column`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          old_column_name: oldName,
          new_column_name: newName.trim()
        }),
      });

      if (response.ok) {
        // Update local column names
        const updatedColumns = columns.map(col => col === oldName ? newName.trim() : col);
        setColumns(updatedColumns);
        
        // Update data rows
        const updatedRows = data.rows.map((row: any) => {
          const newRow = { ...row };
          if (oldName in newRow) {
            newRow[newName.trim()] = newRow[oldName];
            delete newRow[oldName];
          }
          return newRow;
        });
        
        setData({ ...data, rows: updatedRows, columns: updatedColumns });
        onDataUpdated(datasetId);
        setEditingColumn(null);
        setNewColumnName('');
      } else {
        const errorData = await response.json();
        setError(errorData.detail || 'Failed to rename column');
      }
    } catch (error) {
      console.error('Column rename error:', error);
      setError('Failed to rename column');
    }
  };

  const startCellEdit = (rowIndex: number, column: string, currentValue: any) => {
    setEditingCell({ row: rowIndex, col: column });
    setEditingValue(String(currentValue || ''));
  };

  const saveCellEdit = () => {
    if (editingCell) {
      handleCellEdit(editingCell.row, editingCell.col, editingValue);
      setEditingCell(null);
      setEditingValue('');
    }
  };

  const cancelCellEdit = () => {
    setEditingCell(null);
    setEditingValue('');
  };

  const totalPages = Math.ceil(totalRows / pageSize);

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
        newWidth = Math.max(300, startSize.width + deltaX);
        break;
      case 'w': // West (left edge)
        newWidth = Math.max(300, startSize.width - deltaX);
        newX = startPanelPos.x + deltaX;
        if (newWidth === 300) newX = startPanelPos.x + startSize.width - 300;
        break;
      case 's': // South (bottom edge)
        newHeight = Math.max(200, startSize.height + deltaY);
        break;
      case 'n': // North (top edge)
        newHeight = Math.max(200, startSize.height - deltaY);
        newY = startPanelPos.y + deltaY;
        if (newHeight === 200) newY = startPanelPos.y + startSize.height - 200;
        break;
      case 'se': // Southeast (bottom-right corner)
        newWidth = Math.max(300, startSize.width + deltaX);
        newHeight = Math.max(200, startSize.height + deltaY);
        break;
      case 'sw': // Southwest (bottom-left corner)
        newWidth = Math.max(300, startSize.width - deltaX);
        newHeight = Math.max(200, startSize.height + deltaY);
        newX = startPanelPos.x + deltaX;
        if (newWidth === 300) newX = startPanelPos.x + startSize.width - 300;
        break;
      case 'ne': // Northeast (top-right corner)
        newWidth = Math.max(300, startSize.width + deltaX);
        newHeight = Math.max(200, startSize.height - deltaY);
        newY = startPanelPos.y + deltaY;
        if (newHeight === 200) newY = startPanelPos.y + startSize.height - 200;
        break;
      case 'nw': // Northwest (top-left corner)
        newWidth = Math.max(300, startSize.width - deltaX);
        newHeight = Math.max(200, startSize.height - deltaY);
        newX = startPanelPos.x + deltaX;
        newY = startPanelPos.y + deltaY;
        if (newWidth === 300) newX = startPanelPos.x + startSize.width - 300;
        if (newHeight === 200) newY = startPanelPos.y + startSize.height - 200;
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
      className={`panel-content relative bg-white border border-indigo-300 rounded-none shadow-xl overflow-hidden transition-all duration-300 ease-out ${
        isDragging ? 'opacity-90 shadow-2xl scale-105' : 'shadow-lg'
      }`}
      style={{
        width: panel.width,
        height: panel.height
      }}
    >
      {/* Header - simplified without action buttons */}
  <div className="bg-gradient-to-r from-indigo-50 to-blue-50 px-4 py-3 pr-24 rounded-none border-b border-gray-200">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="w-3 h-3 bg-indigo-500 rounded-none shadow-sm"></div>
            <div>
              <h3 className="font-semibold text-gray-800 text-sm">Data Editor</h3>
              <div className="text-xs text-gray-600 mt-1">
                Dataset: {panel.data?.datasetName || panel.data?.datasetId}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="p-3 overflow-auto scrollable-content" style={{ maxHeight: `${panel.height - 100}px` }}>
        {!isExpanded ? (
          <div className="text-center text-gray-500 text-sm">
            Click to edit data values and column names
          </div>
        ) : (
          <div className="space-y-3">
            {isLoading ? (
              <div className="text-center py-4">
                <div className="animate-spin rounded-none h-6 w-6 border-b-2 border-indigo-600 mx-auto"></div>
                <p className="text-sm text-gray-500 mt-2">Loading data...</p>
              </div>
            ) : error ? (
              <div className="text-center py-4">
                <p className="text-sm text-red-600">{error}</p>
                <button
                  onClick={loadData}
                  className="mt-2 px-3 py-1 bg-indigo-100 hover:bg-indigo-200 text-indigo-700 rounded-none text-xs"
                >
                  Retry
                </button>
              </div>
            ) : data && data.rows ? (
              <>
                {/* Data Table */}
                <div className="border rounded-none overflow-hidden">
                  <div className="overflow-x-auto max-h-96">
                    <table className="w-full text-xs">
                      <thead className="bg-gray-50 sticky top-0">
                        <tr>
                          {columns.map(column => (
                            <th key={column} className="px-2 py-2 text-left border-b border-gray-200">
                              {editingColumn === column ? (
                                <div className="flex items-center space-x-1">
                                  <input
                                    type="text"
                                    value={newColumnName}
                                    onChange={(e) => setNewColumnName(e.target.value)}
                                    className="px-1 py-0.5 border rounded-none text-xs w-20"
                                    onKeyDown={(e) => {
                                      if (e.key === 'Enter') {
                                        handleColumnRename(column, newColumnName);
                                      } else if (e.key === 'Escape') {
                                        setEditingColumn(null);
                                        setNewColumnName('');
                                      }
                                    }}
                                    autoFocus
                                  />
                                  <button
                                    onClick={() => handleColumnRename(column, newColumnName)}
                                    className="text-green-600 hover:text-green-800"
                                  >
                                    ✓
                                  </button>
                                  <button
                                    onClick={() => {
                                      setEditingColumn(null);
                                      setNewColumnName('');
                                    }}
                                    className="text-red-600 hover:text-red-800"
                                  >
                                    ✕
                                  </button>
                                </div>
                              ) : (
                                <div className="flex items-center space-x-1 group">
                                  <span>{column}</span>
                                  <button
                                    onClick={() => {
                                      setEditingColumn(column);
                                      setNewColumnName(column);
                                    }}
                                    className="opacity-0 group-hover:opacity-100 text-gray-400 hover:text-gray-600"
                                    title="Rename column"
                                  >
                                    ✏️
                                  </button>
                                </div>
                              )}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {data.rows.map((row: any, rowIndex: number) => (
                          <tr key={rowIndex} className="hover:bg-gray-50">
                            {columns.map(column => (
                              <td key={column} className="px-2 py-1 border-b border-gray-100">
                                {editingCell?.row === rowIndex && editingCell?.col === column ? (
                                  <div className="flex items-center space-x-1">
                                    <input
                                      type="text"
                                      value={editingValue}
                                      onChange={(e) => setEditingValue(e.target.value)}
                                      className="px-1 py-0.5 border rounded-none text-xs w-full"
                                      onKeyDown={(e) => {
                                        if (e.key === 'Enter') {
                                          saveCellEdit();
                                        } else if (e.key === 'Escape') {
                                          cancelCellEdit();
                                        }
                                      }}
                                      autoFocus
                                    />
                                    <button
                                      onClick={saveCellEdit}
                                      className="text-green-600 hover:text-green-800"
                                    >
                                      ✓
                                    </button>
                                    <button
                                      onClick={cancelCellEdit}
                                      className="text-red-600 hover:text-red-800"
                                    >
                                      ✕
                                    </button>
                                  </div>
                                ) : (
                                  <div
                                    onClick={() => startCellEdit(rowIndex, column, row[column])}
                                    className="cursor-pointer hover:bg-blue-50 px-1 py-0.5 rounded-none"
                                    title="Click to edit"
                                  >
                                    {String(row[column] || '')}
                                  </div>
                                )}
                              </td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* Pagination */}
                {totalPages > 1 && (
                  <div className="flex items-center justify-between text-xs">
                    <div>
                      Showing {currentPage * pageSize + 1} to {Math.min((currentPage + 1) * pageSize, totalRows)} of {totalRows} rows
                    </div>
                    <div className="flex space-x-1">
                      <button
                        onClick={() => setCurrentPage(Math.max(0, currentPage - 1))}
                        disabled={currentPage === 0}
                        className="px-2 py-1 border rounded-none disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        Previous
                      </button>
                      <span className="px-2 py-1">
                        Page {currentPage + 1} of {totalPages}
                      </span>
                      <button
                        onClick={() => setCurrentPage(Math.min(totalPages - 1, currentPage + 1))}
                        disabled={currentPage === totalPages - 1}
                        className="px-2 py-1 border rounded-none disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        Next
                      </button>
                    </div>
                  </div>
                )}
              </>
            ) : (
              <div className="text-center text-gray-500 text-sm">
                No data available
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