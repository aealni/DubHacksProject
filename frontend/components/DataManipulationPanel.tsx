import React, { useState, useEffect, useRef } from 'react';

const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:8000';

type FilterOperator =
  | 'eq'
  | 'ne'
  | 'gt'
  | 'gte'
  | 'lt'
  | 'lte'
  | 'contains'
  | 'not_contains'
  | 'startswith'
  | 'endswith'
  | 'in'
  | 'not_in'
  | 'between'
  | 'is_null'
  | 'not_null';

interface ManipulationSummary {
  operation: string;
  details: Record<string, any>;
}

interface ManipulationResponse {
  operations_applied: ManipulationSummary[];
  row_count: number;
  column_count: number;
}

const FILTER_OPERATORS: { value: FilterOperator; label: string; needsValue?: boolean; needsSecond?: boolean; supportsCase?: boolean; acceptsList?: boolean }[] = [
  { value: 'eq', label: 'Equals', needsValue: true },
  { value: 'ne', label: 'Not Equal', needsValue: true },
  { value: 'gt', label: 'Greater Than', needsValue: true },
  { value: 'gte', label: 'Greater Than or Equal', needsValue: true },
  { value: 'lt', label: 'Less Than', needsValue: true },
  { value: 'lte', label: 'Less Than or Equal', needsValue: true },
  { value: 'contains', label: 'Contains', needsValue: true, supportsCase: true },
  { value: 'not_contains', label: 'Does Not Contain', needsValue: true, supportsCase: true },
  { value: 'startswith', label: 'Starts With', needsValue: true, supportsCase: true },
  { value: 'endswith', label: 'Ends With', needsValue: true, supportsCase: true },
  { value: 'in', label: 'In List', needsValue: true, acceptsList: true },
  { value: 'not_in', label: 'Not In List', needsValue: true, acceptsList: true },
  { value: 'between', label: 'Between', needsValue: true, needsSecond: true },
  { value: 'is_null', label: 'Is Null' },
  { value: 'not_null', label: 'Not Null' }
];

const FILL_STRATEGIES = [
  { value: 'mean', label: 'Mean (numeric columns)' },
  { value: 'median', label: 'Median (numeric columns)' },
  { value: 'mode', label: 'Mode (categorical)' },
  { value: 'constant', label: 'Constant Value' },
  { value: 'forward_fill', label: 'Forward Fill' },
  { value: 'backward_fill', label: 'Backward Fill' }
] as const;

const DTYPE_OPTIONS = [
  { value: 'int', label: 'Integer' },
  { value: 'float', label: 'Floating Point' },
  { value: 'string', label: 'Text' },
  { value: 'bool', label: 'Boolean' },
  { value: 'datetime', label: 'Datetime' }
] as const;

const ERROR_BEHAVIOR = [
  { value: 'coerce', label: 'Coerce (invalid becomes NaN/null)' },
  { value: 'raise', label: 'Raise (fail on invalid)' },
  { value: 'ignore', label: 'Ignore (leave values as-is)' }
] as const;

const KNN_WEIGHT_OPTIONS = [
  { value: 'uniform', label: 'Uniform weights' },
  { value: 'distance', label: 'Distance weights' }
] as const;

const NORMALIZE_METHODS = [
  { value: 'minmax', label: 'Min-Max (0-1)' },
  { value: 'zscore', label: 'Z-Score (mean 0, std 1)' }
] as const;

interface ColumnMultiSelectProps {
  columns: string[];
  selected: string[];
  onChange: (next: string[]) => void;
  placeholder?: string;
  emptyLabel?: string;
}

const ColumnMultiSelect: React.FC<ColumnMultiSelectProps> = ({
  columns,
  selected,
  onChange,
  placeholder = 'Select columns',
  emptyLabel = 'No columns available'
}) => {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const [menuAlign, setMenuAlign] = useState<'left' | 'right'>('left');

  useEffect(() => {
    if (!open) {
      return;
    }
    const handleClickAway = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickAway);
    return () => {
      document.removeEventListener('mousedown', handleClickAway);
    };
  }, [open]);

  useEffect(() => {
    if (!open) {
      return;
    }

    const updateAlignment = () => {
      const containerEl = containerRef.current;
      const menuEl = menuRef.current;
      if (!containerEl || !menuEl) {
        return;
      }

      const containerRect = containerEl.getBoundingClientRect();
      const menuWidth = menuEl.offsetWidth || 0;
      const viewportWidth = window.innerWidth;
      const viewportPadding = 16;

      const fitsRight = containerRect.left + menuWidth <= viewportWidth - viewportPadding;
      const fitsLeft = containerRect.right - menuWidth >= viewportPadding;

      if (!fitsRight && fitsLeft) {
        setMenuAlign('right');
      } else {
        setMenuAlign('left');
      }
    };

    const raf = requestAnimationFrame(updateAlignment);
    window.addEventListener('resize', updateAlignment);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', updateAlignment);
    };
  }, [open]);

  const toggleValue = (value: string) => {
    if (selected.includes(value)) {
      onChange(selected.filter((v) => v !== value));
    } else {
      onChange([...selected, value]);
    }
  };

  const handleSelectAll = () => {
    if (selected.length === columns.length) {
      onChange([]);
    } else {
      onChange(columns);
    }
  };

  const label = selected.length
    ? `${selected.length} column${selected.length === 1 ? '' : 's'} selected`
    : placeholder;

  return (
    <div
      className="relative inline-block text-left"
      ref={containerRef}
      data-no-canvas="true"
    >
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        className="inline-flex items-center justify-between gap-2 w-44 border border-gray-300 bg-white px-2 py-1 text-xs text-gray-700 shadow-sm hover:bg-gray-50 focus:outline-none focus:ring-1 focus:ring-gray-500"
      >
        <span className="truncate" title={selected.join(', ') || placeholder}>{label}</span>
        <svg
          className={`h-3 w-3 transform transition-transform ${open ? 'rotate-180' : 'rotate-0'}`}
          viewBox="0 0 20 20"
          fill="currentColor"
          aria-hidden="true"
        >
          <path
            fillRule="evenodd"
            d="M5.23 7.21a.75.75 0 011.06.02L10 11.17l3.71-3.94a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z"
            clipRule="evenodd"
          />
        </svg>
      </button>

      {open && (
        <div
          ref={menuRef}
          className={`absolute z-30 mt-1 w-60 rounded-none border border-gray-200 bg-white shadow-lg ${
            menuAlign === 'right' ? 'right-0 left-auto origin-top-right' : 'left-0 right-auto origin-top-left'
          }`}
          style={{ maxWidth: 'min(240px, calc(100vw - 32px))' }}
        >
          <div className="flex items-center justify-between px-2 py-1 border-b border-gray-100">
            <span className="text-[10px] text-gray-500">Click to toggle columns</span>
            <button
              onClick={handleSelectAll}
              className="text-[10px] text-gray-600 hover:text-gray-800"
            >
              {selected.length === columns.length ? 'Clear' : 'Select all'}
            </button>
          </div>
          <div className="max-h-48 overflow-y-auto p-2 space-y-1">
            {columns.length === 0 ? (
              <div className="text-[10px] text-gray-400 text-center py-4">{emptyLabel}</div>
            ) : (
              columns.map((col) => (
                <label key={col} className="flex items-center gap-2 text-[10px] text-gray-600">
                  <input
                    type="checkbox"
                    className="border-gray-300"
                    checked={selected.includes(col)}
                    onChange={() => toggleValue(col)}
                  />
                  <span className="truncate" title={col}>{col}</span>
                </label>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
};

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
  const [isProcessing, setIsProcessing] = useState(false);
  const [results, setResults] = useState<ManipulationResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [dropColumnsSelection, setDropColumnsSelection] = useState<string[]>([]);
  const [fillStrategy, setFillStrategy] = useState<(typeof FILL_STRATEGIES)[number]['value']>('mean');
  const [fillValue, setFillValue] = useState('');
  const [fillColumns, setFillColumns] = useState<string[]>([]);
  const [knnColumns, setKnnColumns] = useState<string[]>([]);
  const [knnNeighbors, setKnnNeighbors] = useState(5);
  const [knnWeights, setKnnWeights] = useState<(typeof KNN_WEIGHT_OPTIONS)[number]['value']>('uniform');
  const [dedupeSubset, setDedupeSubset] = useState<string[]>([]);
  const [dedupeKeep, setDedupeKeep] = useState<'first' | 'last' | 'none'>('first');
  const [sortColumn, setSortColumn] = useState('');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc');
  const [sortNaPosition, setSortNaPosition] = useState<'first' | 'last'>('last');
  const [renameColumn, setRenameColumn] = useState('');
  const [renameTo, setRenameTo] = useState('');
  const [convertColumn, setConvertColumn] = useState('');
  const [convertType, setConvertType] = useState<(typeof DTYPE_OPTIONS)[number]['value']>('string');
  const [convertErrors, setConvertErrors] = useState<(typeof ERROR_BEHAVIOR)[number]['value']>('coerce');
  const [normalizeColumns, setNormalizeColumns] = useState<string[]>([]);
  const [normalizeMethod, setNormalizeMethod] = useState<(typeof NORMALIZE_METHODS)[number]['value']>('minmax');
  const [customPandasCode, setCustomPandasCode] = useState('');
  const [customCodeLabel, setCustomCodeLabel] = useState('');
  const [filterColumn, setFilterColumn] = useState('');
  const [filterOperator, setFilterOperator] = useState<FilterOperator>('eq');
  const [filterValue, setFilterValue] = useState('');
  const [filterValueB, setFilterValueB] = useState('');
  const [filterCaseSensitive, setFilterCaseSensitive] = useState(false);
  const datasetLabel = panel.data?.datasetName ?? (panel.data?.datasetId ? `Dataset ${panel.data.datasetId}` : null);

  const pandasExampleSnippet = [
    '# Example: create a standardized score for numeric columns',
    "numeric_cols = df.select_dtypes(include='number').columns",
    'if len(numeric_cols) > 0:',
    "    df[numeric_cols] = (df[numeric_cols] - df[numeric_cols].mean()) / df[numeric_cols].std(ddof=0)",
    'result = df.head()'
  ].join('\n');
  
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

  useEffect(() => {
    const first = columns[0] ?? '';
    if (columns.length > 0) {
      setSortColumn((prev) => (prev && columns.includes(prev) ? prev : first));
      setFilterColumn((prev) => (prev && columns.includes(prev) ? prev : first));
      setRenameColumn((prev) => (prev && columns.includes(prev) ? prev : first));
      setConvertColumn((prev) => (prev && columns.includes(prev) ? prev : first));
      setFillColumns((prev) => {
        const filtered = prev.filter((col) => columns.includes(col));
        return filtered.length ? filtered : (first ? [first] : []);
      });
      setDropColumnsSelection((prev) => prev.filter((col) => columns.includes(col)));
      setDedupeSubset((prev) => prev.filter((col) => columns.includes(col)));
      setKnnColumns((prev) => {
        const filtered = prev.filter((col) => columns.includes(col));
        return filtered.length ? filtered : (first ? [first] : []);
      });
      setNormalizeColumns((prev) => {
        const filtered = prev.filter((col) => columns.includes(col));
        return filtered.length ? filtered : (first ? [first] : []);
      });
    } else {
      setSortColumn('');
      setFilterColumn('');
      setRenameColumn('');
      setConvertColumn('');
      setFillColumns([]);
      setDropColumnsSelection([]);
      setDedupeSubset([]);
      setKnnColumns([]);
      setNormalizeColumns([]);
    }
  }, [columns]);

  const loadDataPreview = async () => {
    try {
      const [previewRes, metadataRes] = await Promise.all([
        fetch(`${BACKEND_URL}/dataset/${panel.data.datasetId}/preview?limit=10`, { cache: 'no-store' }),
        fetch(`${BACKEND_URL}/dataset/${panel.data.datasetId}/metadata`, { cache: 'no-store' })
      ]);

      if (previewRes.ok && metadataRes.ok) {
        const preview = await previewRes.json();
        const metadata = await metadataRes.json();
        setDataPreview(preview.preview);
        const cols = preview.preview?.columns?.filter((c: string) => c !== '_rowid') || [];
        setColumns(cols);
      }
    } catch (error) {
      console.error('Failed to load data preview:', error);
    }
  };

  const applyOperations = async (operations: any[], onSuccess?: () => void) => {
    if (!panel.data?.datasetId) {
      setError('Panel is not linked to a dataset');
      return;
    }
    if (!operations.length) {
      setError('No operations specified');
      return;
    }

    setIsProcessing(true);
    setError(null);

    try {
      const response = await fetch(`${BACKEND_URL}/dataset/${panel.data.datasetId}/manipulate`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ operations }),
      });

      if (response.ok) {
        const result: ManipulationResponse = await response.json();
        setResults(result);
        onDataUpdated(panel.data.datasetId);
        loadDataPreview();
        if (onSuccess) {
          onSuccess();
        }
      } else {
        const errorData = await response.json().catch(() => ({}));
        setError(errorData.detail || 'Operation failed');
      }
    } catch (err) {
      console.error('Manipulation operation error:', err);
      setError('Operation failed');
    } finally {
      setIsProcessing(false);
    }
  };
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

            {/* Operations */}
            <div className="space-y-3">
              {activeTab === 'clean' && (
                <div className="space-y-3">
                  <div className="border border-gray-200 rounded-none p-3">
                    <div className="flex flex-col gap-3">
                      <div>
                        <div className="text-xs font-semibold text-gray-800">Fill Missing Values</div>
                        <p className="text-[10px] text-gray-500">Impute null entries in one or more columns using pandas-style strategies.</p>
                      </div>
                      <div className="flex flex-col md:flex-row md:items-center gap-2">
                        <ColumnMultiSelect
                          columns={columns}
                          selected={fillColumns}
                          onChange={setFillColumns}
                          placeholder="Columns to fill"
                        />
                        <select
                          value={fillStrategy}
                          onChange={(e) => setFillStrategy(e.target.value as typeof FILL_STRATEGIES[number]['value'])}
                          className="border border-gray-300 text-xs p-1 rounded-none"
                        >
                          {FILL_STRATEGIES.map((strategy) => (
                            <option key={strategy.value} value={strategy.value}>{strategy.label}</option>
                          ))}
                        </select>
                        {fillStrategy === 'constant' && (
                          <input
                            type="text"
                            value={fillValue}
                            onChange={(e) => setFillValue(e.target.value)}
                            placeholder="Constant value"
                            className="border border-gray-300 text-xs p-1 rounded-none"
                          />
                        )}
                        <button
                          onClick={() => {
                            if (!fillColumns.length) {
                              setError('Select at least one column to fill');
                              return;
                            }
                            const operations = fillColumns.map((col) => ({
                              type: 'fill_missing',
                              column: col,
                              strategy: fillStrategy,
                              value: fillStrategy === 'constant' ? fillValue : undefined
                            }));
                            applyOperations(operations, () => {
                              if (fillStrategy === 'constant') setFillValue('');
                            });
                          }}
                          disabled={isProcessing || !fillColumns.length || (fillStrategy === 'constant' && !fillValue)}
                          className="px-2 py-1 border border-gray-400 text-gray-700 hover:bg-gray-100 rounded-none text-[10px] disabled:opacity-50"
                        >
                          Apply
                        </button>
                      </div>
                    </div>
                  </div>
                  <div className="border border-gray-200 rounded-none p-3">
                    <div className="flex flex-col gap-3">
                      <div>
                        <div className="text-xs font-semibold text-gray-800">KNN Imputation</div>
                        <p className="text-[10px] text-gray-500">Use K-nearest neighbors to fill missing numeric values across multiple columns.</p>
                      </div>
                      <div className="flex flex-col lg:flex-row lg:items-start gap-2">
                        <ColumnMultiSelect
                          columns={columns}
                          selected={knnColumns}
                          onChange={setKnnColumns}
                          placeholder="Columns for KNN"
                        />
                        <label className="flex items-center gap-1 text-[10px] text-gray-600">
                          Neighbors
                          <input
                            type="number"
                            min={1}
                            max={25}
                            value={knnNeighbors}
                            onChange={(e) => setKnnNeighbors(Math.max(1, Number.parseInt(e.target.value, 10) || 1))}
                            className="border border-gray-300 text-xs p-1 rounded-none w-16"
                          />
                        </label>
                        <div className="flex flex-col gap-2">
                          <select
                            value={knnWeights}
                            onChange={(e) => setKnnWeights(e.target.value as (typeof KNN_WEIGHT_OPTIONS)[number]['value'])}
                            className="border border-gray-300 text-xs p-1 rounded-none"
                          >
                            {KNN_WEIGHT_OPTIONS.map((opt) => (
                              <option key={opt.value} value={opt.value}>{opt.label}</option>
                            ))}
                          </select>
                          <button
                            onClick={() => {
                              if (!knnColumns.length) {
                                setError('Select at least one column for KNN imputation');
                                return;
                              }
                              applyOperations([
                                {
                                  type: 'knn_impute',
                                  columns: knnColumns,
                                  n_neighbors: knnNeighbors,
                                  weights: knnWeights
                                }
                              ]);
                            }}
                            disabled={isProcessing || !knnColumns.length}
                            className="px-2 py-1 border border-gray-400 text-gray-700 hover:bg-gray-100 rounded-none text-[10px] disabled:opacity-50"
                          >
                            Impute
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="border border-gray-200 rounded-none p-3">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <div className="text-xs font-semibold text-gray-800">Drop Duplicates</div>
                        <p className="text-[10px] text-gray-500">Remove duplicate rows using an optional subset of columns.</p>
                      </div>
                      <div className="flex flex-col gap-2 items-end">
                        <div className="flex items-center gap-2 text-xs">
                          <span className="text-[10px] text-gray-500">Keep</span>
                          <select
                            value={dedupeKeep}
                            onChange={(e) => setDedupeKeep(e.target.value as 'first' | 'last' | 'none')}
                            className="border border-gray-300 text-xs p-1 rounded-none"
                          >
                            <option value="first">First</option>
                            <option value="last">Last</option>
                            <option value="none">None (drop all duplicates)</option>
                          </select>
                        </div>
                        <ColumnMultiSelect
                          columns={columns}
                          selected={dedupeSubset}
                          onChange={setDedupeSubset}
                          placeholder="Subset columns (optional)"
                        />
                        <button
                          onClick={() => applyOperations([
                            {
                              type: 'drop_duplicates',
                              subset: dedupeSubset.length ? dedupeSubset : undefined,
                              keep: dedupeKeep
                            }
                          ])}
                          disabled={isProcessing}
                          className="px-2 py-1 border border-gray-400 text-gray-700 hover:bg-gray-100 rounded-none text-[10px] disabled:opacity-50"
                        >
                          Apply
                        </button>
                      </div>
                    </div>
                  </div>

                  <div className="border border-gray-200 rounded-none p-3">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <div className="text-xs font-semibold text-gray-800">Drop Columns</div>
                        <p className="text-[10px] text-gray-500">Remove columns you no longer need. This action is irreversible.</p>
                      </div>
                      <div className="flex flex-col gap-2 items-end">
                        <ColumnMultiSelect
                          columns={columns}
                          selected={dropColumnsSelection}
                          onChange={setDropColumnsSelection}
                          placeholder="Columns to drop"
                        />
                        <button
                          onClick={() => applyOperations([
                            {
                              type: 'drop_columns',
                              columns: dropColumnsSelection
                            }
                          ], () => setDropColumnsSelection([]))}
                          disabled={isProcessing || dropColumnsSelection.length === 0}
                          className="px-2 py-1 border border-red-400 text-red-600 hover:bg-red-50 rounded-none text-[10px] disabled:opacity-50"
                        >
                          Drop Selected
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {activeTab === 'transform' && (
                <div className="space-y-3">
                  <div className="border border-gray-200 rounded-none p-3">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <div className="text-xs font-semibold text-gray-800">Sort Rows</div>
                        <p className="text-[10px] text-gray-500">Order rows by a selected column. Use descending to bring top values first.</p>
                      </div>
                      <div className="flex flex-wrap gap-2 justify-end">
                        <select
                          value={sortColumn}
                          onChange={(e) => setSortColumn(e.target.value)}
                          className="border border-gray-300 text-xs p-1 rounded-none"
                        >
                          {columns.map((col) => (
                            <option key={col} value={col}>{col}</option>
                          ))}
                        </select>
                        <select
                          value={sortDirection}
                          onChange={(e) => setSortDirection(e.target.value as 'asc' | 'desc')}
                          className="border border-gray-300 text-xs p-1 rounded-none"
                        >
                          <option value="asc">Ascending</option>
                          <option value="desc">Descending</option>
                        </select>
                        <select
                          value={sortNaPosition}
                          onChange={(e) => setSortNaPosition(e.target.value as 'first' | 'last')}
                          className="border border-gray-300 text-xs p-1 rounded-none"
                        >
                          <option value="last">NaN last</option>
                          <option value="first">NaN first</option>
                        </select>
                        <button
                          onClick={() => applyOperations([
                            {
                              type: 'sort_values',
                              keys: [
                                {
                                  column: sortColumn,
                                  ascending: sortDirection === 'asc'
                                }
                              ],
                              na_position: sortNaPosition
                            }
                          ])}
                          disabled={isProcessing || !sortColumn}
                          className="px-2 py-1 border border-gray-400 text-gray-700 hover:bg-gray-100 rounded-none text-[10px] disabled:opacity-50"
                        >
                          Apply
                        </button>
                      </div>
                    </div>
                  </div>

                  <div className="border border-gray-200 rounded-none p-3">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <div className="text-xs font-semibold text-gray-800">Rename Column</div>
                        <p className="text-[10px] text-gray-500">Give the selected column a clearer label.</p>
                      </div>
                      <div className="flex flex-col lg:flex-row lg:items-center gap-2">
                        <select
                          value={renameColumn}
                          onChange={(e) => setRenameColumn(e.target.value)}
                          className="border border-gray-300 text-xs p-1 rounded-none"
                        >
                          {columns.map((col) => (
                            <option key={col} value={col}>{col}</option>
                          ))}
                        </select>
                        <input
                          type="text"
                          value={renameTo}
                          onChange={(e) => setRenameTo(e.target.value)}
                          placeholder="New column name"
                          className="border border-gray-300 text-xs p-1 rounded-none"
                        />
                        <button
                          onClick={() => {
                            if (!renameColumn) {
                              setError('Choose a column to rename');
                              return;
                            }
                            if (!renameTo.trim()) {
                              setError('Enter a new column name');
                              return;
                            }
                            applyOperations([
                              {
                                type: 'rename_columns',
                                columns: { [renameColumn]: renameTo }
                              }
                            ], () => setRenameTo(''));
                          }}
                          disabled={isProcessing || !renameColumn || !renameTo.trim()}
                          className="px-2 py-1 border border-gray-400 text-gray-700 hover:bg-gray-100 rounded-none text-[10px] disabled:opacity-50"
                        >
                          Rename
                        </button>
                      </div>
                    </div>
                  </div>

                  <div className="border border-gray-200 rounded-none p-3">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <div className="text-xs font-semibold text-gray-800">Convert Data Type</div>
                        <p className="text-[10px] text-gray-500">Cast a column to a new data type while controlling error handling.</p>
                      </div>
                      <div className="flex flex-col lg:flex-row lg:items-center gap-2">
                        <select
                          value={convertColumn}
                          onChange={(e) => setConvertColumn(e.target.value)}
                          className="border border-gray-300 text-xs p-1 rounded-none"
                        >
                          {columns.map((col) => (
                            <option key={col} value={col}>{col}</option>
                          ))}
                        </select>
                        <select
                          value={convertType}
                          onChange={(e) => setConvertType(e.target.value as (typeof DTYPE_OPTIONS)[number]['value'])}
                          className="border border-gray-300 text-xs p-1 rounded-none"
                        >
                          {DTYPE_OPTIONS.map((opt) => (
                            <option key={opt.value} value={opt.value}>{opt.label}</option>
                          ))}
                        </select>
                        <select
                          value={convertErrors}
                          onChange={(e) => setConvertErrors(e.target.value as typeof ERROR_BEHAVIOR[number]['value'])}
                          className="border border-gray-300 text-xs p-1 rounded-none"
                        >
                          {ERROR_BEHAVIOR.map((opt) => (
                            <option key={opt.value} value={opt.value}>{opt.label}</option>
                          ))}
                        </select>
                        <button
                          onClick={() => applyOperations([
                            {
                              type: 'convert_type',
                              column: convertColumn,
                              dtype: convertType,
                              errors: convertErrors
                            }
                          ])}
                          disabled={isProcessing || !convertColumn}
                          className="px-2 py-1 border border-gray-400 text-gray-700 hover:bg-gray-100 rounded-none text-[10px] disabled:opacity-50"
                        >
                          Convert
                        </button>
                      </div>
                    </div>
                  </div>
                  <div className="border border-gray-200 rounded-none p-3">
                    <div className="flex flex-col gap-3">
                      <div>
                        <div className="text-xs font-semibold text-gray-800">Normalize Columns</div>
                        <p className="text-[10px] text-gray-500">Scale numeric columns using min-max or z-score normalization.</p>
                      </div>
                      <div className="flex flex-col md:flex-row md:items-center gap-2">
                        <ColumnMultiSelect
                          columns={columns}
                          selected={normalizeColumns}
                          onChange={setNormalizeColumns}
                          placeholder="Columns to normalize"
                        />
                        <select
                          value={normalizeMethod}
                          onChange={(e) => setNormalizeMethod(e.target.value as (typeof NORMALIZE_METHODS)[number]['value'])}
                          className="border border-gray-300 text-xs p-1 rounded-none"
                        >
                          {NORMALIZE_METHODS.map((opt) => (
                            <option key={opt.value} value={opt.value}>{opt.label}</option>
                          ))}
                        </select>
                        <button
                          onClick={() => {
                            if (!normalizeColumns.length) {
                              setError('Select at least one column to normalize');
                              return;
                            }
                            applyOperations([
                              {
                                type: 'normalize_columns',
                                columns: normalizeColumns,
                                method: normalizeMethod
                              }
                            ]);
                          }}
                          disabled={isProcessing || !normalizeColumns.length}
                          className="px-2 py-1 border border-gray-400 text-gray-700 hover:bg-gray-100 rounded-none text-[10px] disabled:opacity-50"
                        >
                          Normalize
                        </button>
                      </div>
                    </div>
                  </div>
                  <div className="border border-gray-200 rounded-none p-3">
                    <div className="flex flex-col gap-3">
                      <div>
                        <div className="text-xs font-semibold text-gray-800">Custom Pandas Commands</div>
                        <p className="text-[10px] text-gray-500">
                          Execute arbitrary pandas transformations. Work with the <code>df</code> variable to access the current dataset.
                          Assign to <code>df</code> (e.g. <code>df = df.query(...)</code>) to persist changes. Optionally set <code>result</code> to capture a preview in the summary.
                        </p>
                      </div>
                      <input
                        type="text"
                        value={customCodeLabel}
                        onChange={(e) => setCustomCodeLabel(e.target.value)}
                        placeholder="Name this step (optional)"
                        className="border border-gray-300 text-xs p-1 rounded-none"
                      />
                      <textarea
                        value={customPandasCode}
                        onChange={(e) => setCustomPandasCode(e.target.value)}
                        rows={6}
                        className="border border-gray-300 text-xs p-2 rounded-none font-mono"
                        placeholder={"# Example:\n# df['normalized'] = (df['value'] - df['value'].mean()) / df['value'].std()\n# result = df.head()"}
                      />
                      <div className="flex flex-wrap justify-end gap-2">
                        <button
                          type="button"
                          onClick={() => setCustomPandasCode(pandasExampleSnippet)}
                          className="px-2 py-1 border border-gray-300 text-gray-600 hover:bg-gray-100 rounded-none text-[10px]"
                        >
                          Insert example
                        </button>
                        <button
                          onClick={() => {
                            if (!customPandasCode.trim()) {
                              setError('Enter pandas code to execute');
                              return;
                            }
                            applyOperations([
                              {
                                type: 'pandas_code',
                                code: customPandasCode,
                                description: customCodeLabel.trim() || undefined
                              }
                            ], () => setCustomCodeLabel(''));
                          }}
                          disabled={isProcessing || !customPandasCode.trim()}
                          className="px-2 py-1 border border-gray-400 text-gray-700 hover:bg-gray-100 rounded-none text-[10px] disabled:opacity-50"
                        >
                          Run Code
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {activeTab === 'filter' && (
                <div className="border border-gray-200 rounded-none p-3 space-y-3">
                  <div>
                    <div className="text-xs font-semibold text-gray-800">Filter Rows</div>
                    <p className="text-[10px] text-gray-500">Build a single condition to keep only the rows you need. Combine multiple filters by applying them sequentially.</p>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                    <div className="flex flex-col gap-1">
                      <label className="text-[10px] text-gray-600">Column</label>
                      <select
                        value={filterColumn}
                        onChange={(e) => setFilterColumn(e.target.value)}
                        className="border border-gray-300 text-xs p-1 rounded-none"
                      >
                        {columns.map((col) => (
                          <option key={col} value={col}>{col}</option>
                        ))}
                      </select>
                    </div>
                    <div className="flex flex-col gap-1">
                      <label className="text-[10px] text-gray-600">Operator</label>
                      <select
                        value={filterOperator}
                        onChange={(e) => setFilterOperator(e.target.value as FilterOperator)}
                        className="border border-gray-300 text-xs p-1 rounded-none"
                      >
                        {FILTER_OPERATORS.map((op) => (
                          <option key={op.value} value={op.value}>{op.label}</option>
                        ))}
                      </select>
                    </div>
                  </div>
                  {(() => {
                    const config = FILTER_OPERATORS.find((op) => op.value === filterOperator);
                    const needsValue = !!config?.needsValue;
                    const needsSecond = !!config?.needsSecond;
                    const acceptsList = !!config?.acceptsList;
                    const supportsCase = !!config?.supportsCase;
                    return (
                      <>
                        {needsValue && (
                          <div className="flex flex-col gap-1">
                            <label className="text-[10px] text-gray-600">
                              {acceptsList ? 'Value(s) (comma separated)' : 'Value'}
                            </label>
                            <input
                              type="text"
                              value={filterValue}
                              onChange={(e) => setFilterValue(e.target.value)}
                              className="border border-gray-300 text-xs p-1 rounded-none"
                            />
                          </div>
                        )}
                        {needsSecond && (
                          <div className="flex flex-col gap-1">
                            <label className="text-[10px] text-gray-600">Upper Bound</label>
                            <input
                              type="text"
                              value={filterValueB}
                              onChange={(e) => setFilterValueB(e.target.value)}
                              className="border border-gray-300 text-xs p-1 rounded-none"
                            />
                          </div>
                        )}
                        {supportsCase && (
                          <label className="inline-flex items-center gap-2 text-[10px] text-gray-600">
                            <input
                              type="checkbox"
                              checked={filterCaseSensitive}
                              onChange={(e) => setFilterCaseSensitive(e.target.checked)}
                              className="border-gray-300"
                            />
                            Case sensitive
                          </label>
                        )}
                      </>
                    );
                  })()}
                  <div className="flex justify-end">
                    <button
                      onClick={() => {
                        const config = FILTER_OPERATORS.find((op) => op.value === filterOperator);
                        const needsValue = !!config?.needsValue;
                        const needsSecond = !!config?.needsSecond;
                        const acceptsList = !!config?.acceptsList;
                        if (!filterColumn) {
                          setError('Select a column to filter');
                          return;
                        }
                        if (needsValue && !filterValue.trim()) {
                          setError('Provide a value for the filter condition');
                          return;
                        }
                        if (needsSecond && !filterValueB.trim()) {
                          setError('Provide both bounds for between filters');
                          return;
                        }
                        const value = acceptsList
                          ? filterValue.split(',').map((item) => item.trim()).filter(Boolean)
                          : filterValue;
                        applyOperations([
                          {
                            type: 'filter_rows',
                            logic: 'and',
                            conditions: [
                              {
                                column: filterColumn,
                                operator: filterOperator,
                                value: config?.needsValue ? (acceptsList ? value : filterValue) : undefined,
                                value_b: config?.needsSecond ? filterValueB : undefined,
                                case_sensitive: filterCaseSensitive
                              }
                            ]
                          }
                        ], () => {
                          setFilterValue('');
                          setFilterValueB('');
                        });
                      }}
                      disabled={isProcessing}
                      className="px-2 py-1 border border-gray-400 text-gray-700 hover:bg-gray-100 rounded-none text-[10px] disabled:opacity-50"
                    >
                      Apply Filter
                    </button>
                  </div>
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
                <p className="text-xs text-gray-700 font-medium">
                  Applied {results.operations_applied.length} operation{results.operations_applied.length === 1 ? '' : 's'}
                </p>
                <p className="text-[10px] text-gray-600 mb-1">
                  New shape: {results.row_count.toLocaleString()} rows × {results.column_count.toLocaleString()} columns
                </p>
                <ul className="space-y-1">
                  {results.operations_applied.map((op, idx) => (
                    <li key={`${op.operation}-${idx}`} className="text-[10px] text-gray-600 border border-gray-200 bg-white px-2 py-1">
                      <span className="font-semibold text-gray-700 mr-1">{op.operation}</span>
                      <span className="text-gray-500">{JSON.stringify(op.details)}</span>
                    </li>
                  ))}
                </ul>
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