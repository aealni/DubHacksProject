import React, { useState, useEffect, useMemo, useRef } from 'react';

const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:8000';

type FieldRequirement = 'required' | 'optional' | 'unused';

interface GraphRequirements {
  x: FieldRequirement;
  y: FieldRequirement;
  column: FieldRequirement;
  columns: FieldRequirement;
  yColumns: FieldRequirement;
  groupBy: FieldRequirement;
  colorBy: FieldRequirement;
  sizeBy: FieldRequirement;
  aggregation: boolean;
  custom: boolean;
}

interface GraphTypeOption {
  value: string;
  label: string;
  description: string;
  requirements: GraphRequirements;
}

const GRAPH_TYPE_OPTIONS: GraphTypeOption[] = [
  {
    value: 'scatter',
    label: 'Scatter',
    description: 'Visualize the relationship between two numeric features with optional color and size encodings.',
    requirements: {
      x: 'required',
      y: 'required',
      column: 'unused',
      columns: 'unused',
      yColumns: 'unused',
      groupBy: 'optional',
      colorBy: 'optional',
      sizeBy: 'optional',
      aggregation: false,
      custom: false
    }
  },
  {
    value: 'line',
    label: 'Line',
    description: 'Plot dependent values across an ordered independent axis, with optional grouping.',
    requirements: {
      x: 'required',
      y: 'required',
      column: 'unused',
      columns: 'unused',
      yColumns: 'unused',
      groupBy: 'optional',
      colorBy: 'unused',
      sizeBy: 'unused',
      aggregation: false,
      custom: false
    }
  },
  {
    value: 'bar',
    label: 'Bar',
    description: 'Compare aggregated dependent values for each independent category.',
    requirements: {
      x: 'required',
      y: 'optional',
      column: 'unused',
      columns: 'unused',
      yColumns: 'unused',
      groupBy: 'unused',
      colorBy: 'unused',
      sizeBy: 'unused',
      aggregation: true,
      custom: false
    }
  },
  {
    value: 'histogram',
    label: 'Histogram',
    description: 'Inspect the distribution of a single numerical column.',
    requirements: {
      x: 'unused',
      y: 'unused',
      column: 'required',
      columns: 'unused',
      yColumns: 'unused',
      groupBy: 'unused',
      colorBy: 'unused',
      sizeBy: 'unused',
      aggregation: false,
      custom: false
    }
  },
  {
    value: 'box',
    label: 'Box',
    description: 'Summarize numerical distributions with optional categorical split.',
    requirements: {
      x: 'optional',
      y: 'required',
      column: 'unused',
      columns: 'unused',
      yColumns: 'unused',
      groupBy: 'unused',
      colorBy: 'unused',
      sizeBy: 'unused',
      aggregation: false,
      custom: false
    }
  },
  {
    value: 'violin',
    label: 'Violin',
    description: 'Visualize the full distribution shape, optionally grouped by a categorical column.',
    requirements: {
      x: 'optional',
      y: 'required',
      column: 'unused',
      columns: 'unused',
      yColumns: 'unused',
      groupBy: 'unused',
      colorBy: 'unused',
      sizeBy: 'unused',
      aggregation: false,
      custom: false
    }
  },
  {
    value: 'pie',
    label: 'Pie',
    description: 'Show proportional contribution of categories.',
    requirements: {
      x: 'unused',
      y: 'unused',
      column: 'required',
      columns: 'unused',
      yColumns: 'unused',
      groupBy: 'unused',
      colorBy: 'unused',
      sizeBy: 'unused',
      aggregation: false,
      custom: false
    }
  },
  {
    value: 'heatmap',
    label: 'Heatmap',
    description: 'Render a matrix-style heatmap from one or more columns.',
    requirements: {
      x: 'unused',
      y: 'unused',
      column: 'optional',
      columns: 'optional',
      yColumns: 'unused',
      groupBy: 'unused',
      colorBy: 'unused',
      sizeBy: 'unused',
      aggregation: false,
      custom: false
    }
  },
  {
    value: 'correlation',
    label: 'Correlation Matrix',
    description: 'Compute pairwise correlation across numeric columns.',
    requirements: {
      x: 'unused',
      y: 'unused',
      column: 'unused',
      columns: 'optional',
      yColumns: 'unused',
      groupBy: 'unused',
      colorBy: 'unused',
      sizeBy: 'unused',
      aggregation: false,
      custom: false
    }
  },
  {
    value: 'pairplot',
    label: 'Pairplot',
    description: 'Create a Seaborn pairplot with optional hue grouping.',
    requirements: {
      x: 'unused',
      y: 'unused',
      column: 'unused',
      columns: 'optional',
      yColumns: 'unused',
      groupBy: 'unused',
      colorBy: 'optional',
      sizeBy: 'unused',
      aggregation: false,
      custom: false
    }
  },
  {
    value: 'area',
    label: 'Area',
    description: 'Stack or layer multiple dependent series across an ordered independent axis.',
    requirements: {
      x: 'required',
      y: 'unused',
      column: 'unused',
      columns: 'unused',
      yColumns: 'required',
      groupBy: 'unused',
      colorBy: 'unused',
      sizeBy: 'unused',
      aggregation: false,
      custom: false
    }
  },
  {
    value: 'custom',
    label: 'Custom Matplotlib',
    description: 'Call any Matplotlib, Seaborn, or Pandas plotting function with dataset columns.',
    requirements: {
      x: 'optional',
      y: 'optional',
      column: 'optional',
      columns: 'optional',
      yColumns: 'optional',
      groupBy: 'optional',
      colorBy: 'optional',
      sizeBy: 'optional',
      aggregation: false,
      custom: true
    }
  }
];

const EMPTY_REQUIREMENTS: GraphRequirements = {
  x: 'unused',
  y: 'unused',
  column: 'unused',
  columns: 'unused',
  yColumns: 'unused',
  groupBy: 'unused',
  colorBy: 'unused',
  sizeBy: 'unused',
  aggregation: false,
  custom: false
};

interface GraphGenerationPayload {
  panelId: string;
  datasetId: number | string;
  datasetName?: string;
  graphType: string;
  title: string;
  graphData: any;
  titleOverride?: string;
  xLabelOverride?: string;
  yLabelOverride?: string;
  lineStyle?: string;
  lineColor?: string;
  xColumn?: string;
  yColumn?: string;
  column?: string;
  columns?: string[];
  yColumns?: string[];
  groupBy?: string;
  colorBy?: string;
  sizeBy?: string;
  aggregation?: string;
  customPlot?: {
    function: string;
    module: string;
    args?: any[];
    kwargs?: Record<string, any>;
  };
}

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
  onGraphGenerated: (payload: GraphGenerationPayload) => void;
  onFocusResultPanel?: (panelId: string) => void;
}

export const GraphPanel: React.FC<GraphPanelProps> = ({ panel, onPanelUpdate, onGraphGenerated, onFocusResultPanel }) => {
  const [availableColumns, setAvailableColumns] = useState<string[]>([]);
  const [selectedXColumn, setSelectedXColumn] = useState<string>(panel.data?.xColumn || '');
  const [selectedYColumn, setSelectedYColumn] = useState<string>(panel.data?.yColumn || '');
  const [selectedGraphType, setSelectedGraphType] = useState<string>(panel.data?.graphType || '');
  const [selectedColumn, setSelectedColumn] = useState<string>(panel.data?.column || '');
  const [selectedColumnsList, setSelectedColumnsList] = useState<string[]>(panel.data?.columns || []);
  const [selectedYColumns, setSelectedYColumns] = useState<string[]>(panel.data?.yColumns || []);
  const [groupByColumn, setGroupByColumn] = useState<string>(panel.data?.groupBy || '');
  const [colorByColumn, setColorByColumn] = useState<string>(panel.data?.colorBy || '');
  const [sizeByColumn, setSizeByColumn] = useState<string>(panel.data?.sizeBy || '');
  const [aggregation, setAggregation] = useState<string>(panel.data?.aggregation || 'mean');
  const [numericColumns, setNumericColumns] = useState<string[]>([]);
  const [categoricalColumns, setCategoricalColumns] = useState<string[]>([]);
  const [datetimeColumns, setDatetimeColumns] = useState<string[]>([]);
  const [customFunction, setCustomFunction] = useState<string>(panel.data?.customPlot?.function || 'plot');
  const [customModule, setCustomModule] = useState<string>(panel.data?.customPlot?.module || 'axes');
  const [customArgsText, setCustomArgsText] = useState<string>(() => {
    if (panel.data?.customArgsText) return panel.data.customArgsText;
    if (panel.data?.customPlot?.args) return JSON.stringify(panel.data.customPlot.args, null, 2);
    return '[]';
  });
  const [customKwargsText, setCustomKwargsText] = useState<string>(() => {
    if (panel.data?.customKwargsText) return panel.data.customKwargsText;
    if (panel.data?.customPlot?.kwargs) return JSON.stringify(panel.data.customPlot.kwargs, null, 2);
    return '{}';
  });
  const [customArgsPreview, setCustomArgsPreview] = useState<any[]>([]);
  const [customKwargsPreview, setCustomKwargsPreview] = useState<Record<string, any>>({});
  const [customArgsError, setCustomArgsError] = useState<string | null>(null);
  const [customKwargsError, setCustomKwargsError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isResizing, setIsResizing] = useState(false);
  const [resizeType, setResizeType] = useState<string>('');
  const [resizeStart, setResizeStart] = useState({ x: 0, y: 0, width: 0, height: 0, panelX: 0, panelY: 0 });
  const [showSuccessMessage, setShowSuccessMessage] = useState(false);
  const [titleOverride, setTitleOverride] = useState<string>(panel.data?.titleOverride || '');
  const [xLabelOverride, setXLabelOverride] = useState<string>(panel.data?.xLabelOverride || '');
  const [yLabelOverride, setYLabelOverride] = useState<string>(panel.data?.yLabelOverride || '');
  const [lineStyle, setLineStyle] = useState<string>(panel.data?.lineStyle || '');
  const [lineColor, setLineColor] = useState<string>(panel.data?.lineColor || '');
  const [isGraphMenuOpen, setIsGraphMenuOpen] = useState(false);
  const [isPresentationOpen, setIsPresentationOpen] = useState<boolean>(false);
  const successTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const graphMenuRef = useRef<HTMLDivElement | null>(null);

  const headerHeight = 56;

  useEffect(() => {
    if (selectedGraphType !== 'custom') {
      setCustomArgsError(null);
      setCustomKwargsError(null);
      return;
    }

    try {
      const parsedArgs = customArgsText.trim() ? JSON.parse(customArgsText) : [];
      if (!Array.isArray(parsedArgs)) {
        throw new Error('Custom arguments must be a JSON array.');
      }
      setCustomArgsPreview(parsedArgs);
      setCustomArgsError(null);
    } catch (err) {
      setCustomArgsError(err instanceof Error ? err.message : 'Unable to parse arguments JSON.');
    }
  }, [customArgsText, selectedGraphType]);

  useEffect(() => {
    if (selectedGraphType !== 'custom') {
      return;
    }

    try {
      const parsedKwargs = customKwargsText.trim() ? JSON.parse(customKwargsText) : {};
      if (parsedKwargs && typeof parsedKwargs !== 'object') {
        throw new Error('Keyword arguments must be a JSON object.');
      }
      setCustomKwargsPreview(parsedKwargs || {});
      setCustomKwargsError(null);
    } catch (err) {
      setCustomKwargsError(err instanceof Error ? err.message : 'Unable to parse keyword arguments JSON.');
    }
  }, [customKwargsText, selectedGraphType]);

  useEffect(() => {
    const timer = successTimeoutRef.current;
    return () => {
      if (timer) {
        clearTimeout(timer);
      }
    };
  }, []);

  useEffect(() => {
    if (panel.data?.resultPanelId) {
      setShowSuccessMessage(true);
      if (successTimeoutRef.current) {
        clearTimeout(successTimeoutRef.current);
      }
      successTimeoutRef.current = setTimeout(() => setShowSuccessMessage(false), 4000);
    }
  }, [panel.data?.resultPanelId]);

  useEffect(() => {
    if (panel.data?.datasetId) {
      loadDatasetColumns();
    }
  }, [panel.data?.datasetId]);

  useEffect(() => {
    if (panel.data?.graphType && panel.data.graphType !== selectedGraphType) {
      setSelectedGraphType(panel.data.graphType);
    }
    setSelectedXColumn(panel.data?.xColumn || '');
    setSelectedYColumn(panel.data?.yColumn || '');
    setSelectedColumn(panel.data?.column || '');
    setSelectedColumnsList(panel.data?.columns || []);
    setSelectedYColumns(panel.data?.yColumns || []);
    setGroupByColumn(panel.data?.groupBy || '');
    setColorByColumn(panel.data?.colorBy || '');
    setSizeByColumn(panel.data?.sizeBy || '');
    if (panel.data?.aggregation) {
      setAggregation(panel.data.aggregation);
    }
    if (panel.data?.customPlot?.function) {
      setCustomFunction(panel.data.customPlot.function);
    }
    if (panel.data?.customPlot?.module) {
      setCustomModule(panel.data.customPlot.module);
    }
    if (panel.data?.customArgsText) {
      setCustomArgsText(panel.data.customArgsText);
    } else if (panel.data?.customPlot?.args) {
      setCustomArgsText(JSON.stringify(panel.data.customPlot.args, null, 2));
    }
    if (panel.data?.customKwargsText) {
      setCustomKwargsText(panel.data.customKwargsText);
    } else if (panel.data?.customPlot?.kwargs) {
      setCustomKwargsText(JSON.stringify(panel.data.customPlot.kwargs, null, 2));
    }
    setTitleOverride(panel.data?.titleOverride || '');
    setXLabelOverride(panel.data?.xLabelOverride || '');
    setYLabelOverride(panel.data?.yLabelOverride || '');
    setLineStyle(panel.data?.lineStyle || '');
    setLineColor(panel.data?.lineColor || '');
  }, [panel.data, selectedGraphType]);

  useEffect(() => {
    if (!isGraphMenuOpen) return;

    const handleOutsideClick = (event: MouseEvent) => {
      if (!graphMenuRef.current) return;
      if (!graphMenuRef.current.contains(event.target as Node)) {
        setIsGraphMenuOpen(false);
      }
    };

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setIsGraphMenuOpen(false);
      }
    };

    document.addEventListener('mousedown', handleOutsideClick);
    document.addEventListener('keydown', handleEscape);

    return () => {
      document.removeEventListener('mousedown', handleOutsideClick);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [isGraphMenuOpen]);

  const getContentScale = () => {
    const expandedWidth = 560;
    const expandedHeight = 420;
    const widthScale = panel.width / expandedWidth;
    const heightScale = (panel.height - headerHeight) / (expandedHeight - headerHeight);
    return Math.min(widthScale, heightScale);
  };

  const autoResizePanel = () => {
    onPanelUpdate(panel.id, { width: 560, height: 420 });
  };

  useEffect(() => {
    autoResizePanel();
  }, []);

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

        const inferType = (col: string) => (metadata.report?.dtype_inference?.[col] || metadata.report?.column_types?.[col] || '').toString().toLowerCase();

        const numericCols = columns.filter(col => {
          const type = inferType(col);
          return type.includes('numeric') || type.includes('int') || type.includes('float') || type.includes('number');
        });

        const categoricalCols = columns.filter(col => {
          const type = inferType(col);
          return type.includes('object') || type.includes('string') || type.includes('category');
        });

        const datetimeCols = columns.filter(col => {
          const type = inferType(col);
          return type.includes('date') || type.includes('time');
        });

        setNumericColumns(numericCols);
        setCategoricalColumns(categoricalCols);
        setDatetimeColumns(datetimeCols);

        if (!selectedXColumn) {
          if (numericCols.length > 0) {
            setSelectedXColumn(numericCols[0]);
          } else if (filteredColumns.length > 0) {
            setSelectedXColumn(filteredColumns[0]);
          }
        }

        if (!selectedYColumn) {
          if (numericCols.length > 1) {
            setSelectedYColumn(numericCols[1]);
          } else if (filteredColumns.length > 1) {
            setSelectedYColumn(filteredColumns[1]);
          }
        }

        if (!selectedColumn) {
          if (numericCols.length > 0) {
            setSelectedColumn(numericCols[0]);
          } else if (filteredColumns.length > 0) {
            setSelectedColumn(filteredColumns[0]);
          }
        }

        if (selectedYColumns.length === 0 && numericCols.length >= 2) {
          setSelectedYColumns(numericCols.slice(0, Math.min(3, numericCols.length)));
        }

        if (selectedColumnsList.length === 0 && filteredColumns.length >= 2) {
          setSelectedColumnsList(filteredColumns.slice(0, Math.min(4, filteredColumns.length)));
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

  const generateGraph = async () => {
    if (availableColumns.length === 0) {
      setError('Columns are still loading. Please retry in a moment.');
      return;
    }

    if (!hasSelectedGraph || !activeGraphOption) {
      setError('Please select a graph template before generating.');
      return;
    }

    const missingFields: string[] = [];

    if (requiresXValue && !selectedXColumn) {
      missingFields.push('an independent (X) column');
    }
    if (requiresYValue && !selectedYColumn) {
      missingFields.push('a dependent (Y) column');
    }
    if (requiresSingleColumn && !selectedColumn) {
      missingFields.push('a column selection');
    }
    if (requiresColumnsList && selectedColumnsList.length === 0) {
      missingFields.push('at least one column');
    }
    if (requiresYColumnsValue && selectedYColumns.length === 0) {
      missingFields.push('one or more dependent columns');
    }
    if (selectedGraphType === 'custom') {
      if (!customFunction.trim()) {
        missingFields.push('a custom plotting function');
      }
      if (customArgsError) {
        setError(customArgsError);
        return;
      }
      if (customKwargsError) {
        setError(customKwargsError);
        return;
      }
    }

    if (missingFields.length > 0) {
      const message = `Please provide ${missingFields.join(', ').replace(/, ([^,]*)$/, ' and $1')}.`;
      setError(message);
      return;
    }

    setIsLoading(true);
    setError(null);

    const independentLabel = selectedXColumn || 'Independent Variable';
    const dependentPieces: string[] = [];
    if (selectedYColumn) {
      dependentPieces.push(selectedYColumn);
    }
    if (!selectedYColumn && selectedYColumns.length > 0) {
      dependentPieces.push(selectedYColumns.join(', '));
    }
    if (!selectedYColumn && dependentPieces.length === 0 && selectedColumn) {
      dependentPieces.push(selectedColumn);
    }

    const trimmedTitle = titleOverride.trim();
    const trimmedXLabel = xLabelOverride.trim();
    const trimmedYLabel = yLabelOverride.trim();
    const trimmedLineColor = lineColor.trim();
    const defaultGraphLabel = activeGraphOption?.label || 'Graph';

    let fallbackTitle: string;
    if (selectedGraphType === 'custom') {
      fallbackTitle = customFunction.trim() ? `Custom: ${customFunction.trim()}` : 'Custom Matplotlib Plot';
    } else if (selectedXColumn && dependentPieces.length > 0) {
      fallbackTitle = `${independentLabel} vs ${dependentPieces[0]}`;
    } else if (selectedColumn) {
      fallbackTitle = `${defaultGraphLabel}: ${selectedColumn}`;
    } else if (selectedColumnsList.length > 0) {
      fallbackTitle = `${defaultGraphLabel}: ${selectedColumnsList.join(', ')}`;
    } else {
      fallbackTitle = defaultGraphLabel;
    }

    const chartTitle = trimmedTitle || fallbackTitle;

    const configPayload: Record<string, any> = {
      title: chartTitle,
      color_palette: 'viridis'
    };
    if (trimmedXLabel) {
      configPayload.xlabel = trimmedXLabel;
    } else if (selectedXColumn) {
      configPayload.xlabel = selectedXColumn;
    }
    if (trimmedYLabel) {
      configPayload.ylabel = trimmedYLabel;
    } else if (selectedYColumn) {
      configPayload.ylabel = selectedYColumn;
    } else if (selectedYColumns.length > 0) {
      configPayload.ylabel = selectedYColumns.join(', ');
    }
    if (supportsLineStyling && lineStyle) {
      configPayload.line_style = lineStyle;
    }
    if (supportsLineStyling && trimmedLineColor) {
      configPayload.line_color = trimmedLineColor;
    }

    const requestPayload: Record<string, any> = {
      chart_type: selectedGraphType,
      config: configPayload
    };

    if (needsXColumn && selectedXColumn) {
      requestPayload.x_column = selectedXColumn;
    }
    if (needsYColumn && selectedYColumn) {
      requestPayload.y_column = selectedYColumn;
    }
    if (needsSingleColumn && selectedColumn) {
      requestPayload.column = selectedColumn;
    }
    if (needsColumnsList && selectedColumnsList.length > 0) {
      requestPayload.columns = selectedColumnsList;
    }
    if (needsYColumns && selectedYColumns.length > 0) {
      requestPayload.y_columns = selectedYColumns;
    }
    if (allowsGroupBy && groupByColumn) {
      requestPayload.group_by = groupByColumn;
    }
    if (allowsColorBy && colorByColumn) {
      requestPayload.color_by = colorByColumn;
    }
    if (allowsSizeBy && sizeByColumn) {
      requestPayload.size_by = sizeByColumn;
    }
    if (activeRequirements.aggregation && aggregation) {
      requestPayload.aggregation = aggregation;
    }

    let customPlotSpec: any;
    if (selectedGraphType === 'custom') {
      customPlotSpec = {
        function: customFunction.trim(),
        module: customModule,
        args: customArgsPreview,
        kwargs: customKwargsPreview,
        apply_formatting: true
      };
      requestPayload.custom_plot = customPlotSpec;
    }

    Object.keys(requestPayload).forEach((key) => {
      const value = requestPayload[key];
      if (value === undefined || value === null) {
        delete requestPayload[key];
      }
      if (Array.isArray(value) && value.length === 0) {
        delete requestPayload[key];
      }
      if (typeof value === 'object' && !Array.isArray(value) && Object.keys(value).length === 0) {
        delete requestPayload[key];
      }
    });

    try {
      const response = await fetch(`${BACKEND_URL}/datasets/${panel.data.datasetId}/graphs`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(requestPayload)
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.detail || 'Failed to generate graph');
      }

      const result = await response.json();

      const payloadForResult = {
        panelId: panel.id,
        datasetId: panel.data.datasetId,
        datasetName: panel.data.datasetName,
        graphType: selectedGraphType,
        titleOverride: trimmedTitle || undefined,
        xLabelOverride: trimmedXLabel || undefined,
        yLabelOverride: trimmedYLabel || undefined,
  lineStyle: supportsLineStyling && lineStyle ? lineStyle : undefined,
  lineColor: supportsLineStyling && trimmedLineColor ? trimmedLineColor : undefined,
        xColumn: selectedXColumn,
        yColumn: selectedYColumn,
        column: selectedColumn,
        columns: selectedColumnsList,
        yColumns: selectedYColumns,
        groupBy: groupByColumn,
        colorBy: colorByColumn,
        sizeBy: sizeByColumn,
        aggregation: activeRequirements.aggregation ? aggregation : undefined,
        title: chartTitle,
        graphData: result,
        customPlot: customPlotSpec
      };

      onGraphGenerated(payloadForResult);

      const updatedData: Record<string, any> = {
        ...panel.data,
        graphType: selectedGraphType,
        xColumn: selectedXColumn,
        yColumn: selectedYColumn,
        column: selectedColumn,
        columns: selectedColumnsList,
        yColumns: selectedYColumns,
        groupBy: groupByColumn,
        colorBy: colorByColumn,
        sizeBy: sizeByColumn,
        aggregation,
        customPlot: customPlotSpec,
        customArgsText,
        customKwargsText,
        customModule,
        customFunction,
        title: chartTitle,
        titleOverride: trimmedTitle,
        xLabelOverride: trimmedXLabel,
        yLabelOverride: trimmedYLabel,
        lineStyle: supportsLineStyling ? lineStyle : '',
        lineColor: supportsLineStyling ? trimmedLineColor : ''
      };

      if (selectedGraphType !== 'custom') {
        delete updatedData.customPlot;
      }

      onPanelUpdate(panel.id, { data: updatedData });

      setShowSuccessMessage(true);
      if (successTimeoutRef.current) {
        clearTimeout(successTimeoutRef.current);
      }
      successTimeoutRef.current = setTimeout(() => setShowSuccessMessage(false), 4000);
    } catch (err) {
      console.error(err);
      setError(err instanceof Error ? err.message : 'Failed to generate graph');
    } finally {
      setIsLoading(false);
    }
  };

  const getGraphTypeName = (type: string) => {
    if (!type) {
      return 'Graph Builder';
    }
    const match = GRAPH_TYPE_OPTIONS.find(option => option.value === type);
    return match ? match.label : 'Graph Builder';
  };

  const handleMultiSelectChange = (
    event: React.ChangeEvent<HTMLSelectElement>,
    setter: (values: string[]) => void
  ) => {
    const selectedValues = Array.from(event.target.selectedOptions).map(option => option.value);
    setter(selectedValues);
  };

  const handleGraphTypeChange = (value: string) => {
    setSelectedGraphType(value);
    setIsGraphMenuOpen(false);
    setError(null);

    if (value === 'correlation') {
      setSelectedXColumn('');
      setSelectedYColumn('');
      setSelectedColumn('');
      setSelectedColumnsList([]);
    } else if (value === 'histogram') {
      setSelectedYColumn('');
      if (!selectedColumn && numericColumns.length > 0) {
        setSelectedColumn(numericColumns[0]);
      }
    } else if (value === 'pie') {
      setSelectedXColumn('');
      setSelectedYColumn('');
      if (!selectedColumn && categoricalColumns.length > 0) {
        setSelectedColumn(categoricalColumns[0]);
      }
    } else if (value === 'area') {
      if (numericColumns.length >= 2) {
        setSelectedYColumns(prev => prev.length > 0 ? prev : numericColumns.slice(0, Math.min(3, numericColumns.length)));
      }
    }

    if (value !== 'custom') {
      setCustomArgsError(null);
      setCustomKwargsError(null);
    }

    if (!['line', 'scatter', 'area', 'custom'].includes(value)) {
      setLineStyle('');
      setLineColor('');
    }

    onPanelUpdate(panel.id, {
      data: {
        ...panel.data,
        graphType: value
      }
    });
  };

  const activeGraphOption = useMemo(() => {
    if (!selectedGraphType) return null;
    return GRAPH_TYPE_OPTIONS.find(option => option.value === selectedGraphType) || null;
  }, [selectedGraphType]);

  const activeRequirements = activeGraphOption?.requirements ?? EMPTY_REQUIREMENTS;

  const graphRequirementsCopy = useMemo(() => {
    if (!selectedGraphType || !activeGraphOption) {
      return 'Select a graph template to see the required inputs.';
    }
    if (selectedGraphType === 'custom') {
      return 'Reference dataset columns using "$column:ColumnName" inside your JSON arguments to call any Matplotlib, Seaborn, or Pandas plotting function.';
    }
    return activeGraphOption.description;
  }, [selectedGraphType, activeGraphOption]);

  const needsXColumn = activeRequirements.x !== 'unused';
  const needsYColumn = activeRequirements.y !== 'unused';
  const needsSingleColumn = activeRequirements.column !== 'unused';
  const needsColumnsList = activeRequirements.columns !== 'unused';
  const needsYColumns = activeRequirements.yColumns !== 'unused';
  const allowsGroupBy = activeRequirements.groupBy !== 'unused';
  const allowsColorBy = activeRequirements.colorBy !== 'unused';
  const allowsSizeBy = activeRequirements.sizeBy !== 'unused';
  const requiresXValue = activeRequirements.x === 'required';
  const requiresYValue = activeRequirements.y === 'required';
  const requiresSingleColumn = activeRequirements.column === 'required';
  const requiresColumnsList = activeRequirements.columns === 'required';
  const requiresYColumnsValue = activeRequirements.yColumns === 'required';
  const supportsLineStyling = selectedGraphType ? ['line', 'scatter', 'area', 'custom'].includes(selectedGraphType) : false;
  const hasSelectedGraph = Boolean(selectedGraphType && activeGraphOption);
  const generateDisabled = isLoading
    || !hasSelectedGraph
    || (requiresXValue && !selectedXColumn)
    || (requiresYValue && !selectedYColumn)
    || (requiresSingleColumn && !selectedColumn)
    || (requiresColumnsList && selectedColumnsList.length === 0)
    || (requiresYColumnsValue && selectedYColumns.length === 0)
    || (selectedGraphType === 'custom' && (!customFunction.trim() || !!customArgsError || !!customKwargsError));

  return (
    <div
      className="panel-content relative bg-white border border-gray-200 shadow-sm"
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
                {getGraphTypeName(selectedGraphType)}
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
        {showSuccessMessage && panel.data?.resultPanelId && (
          <div className="mb-3 flex items-start justify-between rounded border border-green-200 bg-green-50 px-3 py-2 text-xs text-green-700">
            <div>
              <p className="font-medium">Graph ready</p>
              <p className="mt-0.5 text-[11px] text-green-600">Open the result panel to view and download.</p>
            </div>
            {onFocusResultPanel && (
              <button
                type="button"
                onClick={() => onFocusResultPanel(panel.data.resultPanelId)}
                className="rounded border border-green-400 px-2 py-1 text-[11px] font-medium text-green-700 hover:bg-green-100"
              >
                View result
              </button>
            )}
          </div>
        )}

        <div className="mb-4 space-y-2 border-b border-gray-200 pb-3">
          <div className="flex items-center justify-between">
            <h4 className="text-xs font-medium text-gray-700">Graph type</h4>
            <span className="text-[10px] uppercase tracking-wide text-gray-400">Pick a template</span>
          </div>
          <div className="relative" ref={graphMenuRef}>
            <button
              type="button"
              aria-haspopup="listbox"
              aria-expanded={isGraphMenuOpen}
              onClick={() => setIsGraphMenuOpen(prev => !prev)}
              className={`flex w-full items-center justify-between gap-3 border px-3 py-2 text-left text-xs transition-colors focus:outline-none focus:ring-2 focus:ring-gray-400 ${
                hasSelectedGraph
                  ? 'border-gray-900 bg-gray-900 text-white'
                  : 'border-gray-300 bg-white text-gray-700 hover:border-gray-400'
              }`}
            >
              {hasSelectedGraph && activeGraphOption ? (
                <div>
                  <div className="font-semibold uppercase tracking-wide text-[11px]">{activeGraphOption.label}</div>
                  <div className="mt-1 text-[10px] leading-snug text-white/80">
                    {activeGraphOption.description}
                  </div>
                </div>
              ) : (
                <div>
                  <div className="font-semibold uppercase tracking-wide text-[11px] text-gray-500">Select a graph template</div>
                  <div className="mt-1 text-[10px] leading-snug text-gray-500/80">
                    Open the menu to browse graph cards.
                  </div>
                </div>
              )}
              <span className="text-[14px]">▾</span>
            </button>

            {isGraphMenuOpen && (
              <div className="absolute left-0 z-30 mt-2 w-full min-w-[240px] rounded border border-gray-200 bg-white shadow-xl">
                <div className="grid gap-2 p-2 sm:grid-cols-2">
                  {GRAPH_TYPE_OPTIONS.map(option => {
                    const isActive = option.value === selectedGraphType;
                    return (
                      <button
                        key={option.value}
                        type="button"
                        onClick={() => handleGraphTypeChange(option.value)}
                        className={`text-left border px-3 py-2 text-xs transition-colors ${
                          isActive
                            ? 'border-gray-900 bg-gray-900 text-white'
                            : 'border-gray-200 bg-white text-gray-700 hover:border-gray-400'
                        }`}
                      >
                        <div className="font-semibold uppercase tracking-wide text-[11px]">
                          {option.label}
                        </div>
                        <div className="mt-1 text-[10px] leading-snug text-current/80">
                          {option.description}
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
          <p className="text-[11px] text-gray-500">{graphRequirementsCopy}</p>
        </div>

        {!hasSelectedGraph ? (
          <div className="mb-4 rounded border border-dashed border-gray-300 bg-gray-50 px-3 py-4 text-center text-xs text-gray-600">
            Choose a graph template to unlock column inputs and styling options.
          </div>
        ) : (
          <div className="mb-4 space-y-3 border-b border-gray-200 pb-3">
          <div className="flex items-center justify-between">
            <h4 className="text-xs font-medium text-gray-700">Inputs & columns</h4>
            <span className="text-[10px] uppercase tracking-wide text-gray-400">
              {availableColumns.length > 0 ? `${availableColumns.length} columns` : 'loading...'}
            </span>
          </div>

          {availableColumns.length === 0 ? (
            <div className="py-2 text-xs text-gray-500">
              Loading columns from dataset {panel.data.datasetId}...
              <button
                onClick={loadDatasetColumns}
                className="ml-2 rounded border border-gray-300 px-2 py-1 text-xs text-gray-700 hover:bg-gray-100"
              >
                Retry
              </button>
            </div>
          ) : (
            <div className="space-y-3 text-xs">
              {needsXColumn && (
                <div>
                  <label className="mb-1 block text-gray-600">
                    Independent (X) column{requiresXValue ? ' *' : ''}
                  </label>
                  <select
                    value={selectedXColumn}
                    onChange={(e) => setSelectedXColumn(e.target.value)}
                    className="w-full border border-gray-300 p-1"
                  >
                    <option value="">Select column...</option>
                    {availableColumns.map(col => (
                      <option key={col} value={col}>{col}</option>
                    ))}
                  </select>
                </div>
              )}

              {needsYColumn && (
                <div>
                  <label className="mb-1 block text-gray-600">
                    Dependent (Y) column{requiresYValue ? ' *' : ''}
                  </label>
                  <select
                    value={selectedYColumn}
                    onChange={(e) => setSelectedYColumn(e.target.value)}
                    className="w-full border border-gray-300 p-1"
                  >
                    <option value="">Select column...</option>
                    {availableColumns.map(col => (
                      <option key={col} value={col}>{col}</option>
                    ))}
                  </select>
                </div>
              )}

              {needsSingleColumn && (
                <div>
                  <label className="mb-1 block text-gray-600">
                    Column selection{requiresSingleColumn ? ' *' : ''}
                  </label>
                  <select
                    value={selectedColumn}
                    onChange={(e) => setSelectedColumn(e.target.value)}
                    className="w-full border border-gray-300 p-1"
                  >
                    <option value="">Select column...</option>
                    {availableColumns.map(col => (
                      <option key={col} value={col}>{col}</option>
                    ))}
                  </select>
                </div>
              )}

              {needsYColumns && (
                <div>
                  <label className="mb-1 block text-gray-600">
                    Dependent columns{requiresYColumnsValue ? ' *' : ''}
                  </label>
                  <select
                    multiple
                    value={selectedYColumns}
                    onChange={(event) => handleMultiSelectChange(event, setSelectedYColumns)}
                    className="w-full border border-gray-300 p-1"
                    size={Math.min(8, Math.max(4, availableColumns.length))}
                  >
                    {availableColumns.map(col => (
                      <option key={col} value={col}>{col}</option>
                    ))}
                  </select>
                  <p className="mt-1 text-[10px] text-gray-500">Use ⌘/Ctrl + click to select multiple columns.</p>
                </div>
              )}

              {needsColumnsList && (
                <div>
                  <label className="mb-1 block text-gray-600">
                    Column set{requiresColumnsList ? ' *' : ''}
                  </label>
                  <select
                    multiple
                    value={selectedColumnsList}
                    onChange={(event) => handleMultiSelectChange(event, setSelectedColumnsList)}
                    className="w-full border border-gray-300 p-1"
                    size={Math.min(8, Math.max(4, availableColumns.length))}
                  >
                    {availableColumns.map(col => (
                      <option key={col} value={col}>{col}</option>
                    ))}
                  </select>
                  <p className="mt-1 text-[10px] text-gray-500">Select the columns to include in this visualization.</p>
                </div>
              )}
            </div>
          )}
          </div>
        )}

        {hasSelectedGraph && (allowsGroupBy || allowsColorBy || allowsSizeBy || activeRequirements.aggregation) && (
          <div className="mb-4 space-y-3 border-b border-gray-200 pb-3 text-xs">
            <h4 className="text-xs font-medium text-gray-700">Encoding & options</h4>
            <div className="grid grid-cols-1 gap-3">
              {allowsGroupBy && (
                <div>
                  <label className="mb-1 block text-gray-600">Group by column</label>
                  <select
                    value={groupByColumn}
                    onChange={(e) => setGroupByColumn(e.target.value)}
                    className="w-full border border-gray-300 p-1"
                  >
                    <option value="">None</option>
                    {availableColumns.map(col => (
                      <option key={col} value={col}>{col}</option>
                    ))}
                  </select>
                </div>
              )}
              {allowsColorBy && (
                <div>
                  <label className="mb-1 block text-gray-600">Color by column</label>
                  <select
                    value={colorByColumn}
                    onChange={(e) => setColorByColumn(e.target.value)}
                    className="w-full border border-gray-300 p-1"
                  >
                    <option value="">None</option>
                    {availableColumns.map(col => (
                      <option key={col} value={col}>{col}</option>
                    ))}
                  </select>
                </div>
              )}
              {allowsSizeBy && (
                <div>
                  <label className="mb-1 block text-gray-600">Size by column</label>
                  <select
                    value={sizeByColumn}
                    onChange={(e) => setSizeByColumn(e.target.value)}
                    className="w-full border border-gray-300 p-1"
                  >
                    <option value="">None</option>
                    {numericColumns.map(col => (
                      <option key={col} value={col}>{col}</option>
                    ))}
                  </select>
                </div>
              )}
              {activeRequirements.aggregation && (
                <div>
                  <label className="mb-1 block text-gray-600">Aggregation</label>
                  <select
                    value={aggregation}
                    onChange={(e) => setAggregation(e.target.value)}
                    className="w-full border border-gray-300 p-1"
                  >
                    <option value="count">Count</option>
                    <option value="sum">Sum</option>
                    <option value="mean">Mean</option>
                    <option value="median">Median</option>
                    <option value="min">Minimum</option>
                    <option value="max">Maximum</option>
                  </select>
                </div>
              )}
            </div>
          </div>
        )}

        {hasSelectedGraph && (
          <div className={`mb-4 border-b border-gray-200 text-xs ${isPresentationOpen ? 'pb-3' : 'pb-1'}`}>
            <button
              type="button"
              onClick={() => setIsPresentationOpen(prev => !prev)}
              aria-expanded={isPresentationOpen}
              className="flex w-full items-center justify-between gap-2 border border-transparent px-0 py-2 text-left text-xs font-medium text-gray-700 transition-colors hover:text-gray-900 focus:outline-none"
            >
              <span>Presentation & styling</span>
              <span className={`text-sm transition-transform duration-200 ${isPresentationOpen ? 'rotate-90' : ''}`}>
                ▸
              </span>
            </button>
            <p className="text-[10px] text-gray-500">Optional titles, labels, and appearance controls.</p>
            <div className={`mt-3 space-y-3 ${isPresentationOpen ? 'block' : 'hidden'}`}>
              <div>
                <label className="mb-1 block text-gray-600">Title (optional)</label>
                <input
                  value={titleOverride}
                  onChange={(e) => setTitleOverride(e.target.value)}
                  className="w-full border border-gray-300 p-1"
                  placeholder="Override the generated title"
                />
              </div>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                <div>
                  <label className="mb-1 block text-gray-600">X axis label</label>
                  <input
                    value={xLabelOverride}
                    onChange={(e) => setXLabelOverride(e.target.value)}
                    className="w-full border border-gray-300 p-1"
                    placeholder="Optional custom X label"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-gray-600">Y axis label</label>
                  <input
                    value={yLabelOverride}
                    onChange={(e) => setYLabelOverride(e.target.value)}
                    className="w-full border border-gray-300 p-1"
                    placeholder="Optional custom Y label"
                  />
                </div>
              </div>
              {supportsLineStyling && (
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                  <div>
                    <label className="mb-1 block text-gray-600">Line style</label>
                    <select
                      value={lineStyle}
                      onChange={(e) => setLineStyle(e.target.value)}
                      className="w-full border border-gray-300 p-1"
                    >
                      <option value="">Use default</option>
                      <option value="-">Solid</option>
                      <option value="--">Dashed</option>
                      <option value=":">Dotted</option>
                      <option value="-.">Dash-dot</option>
                      <option value="None">No line (markers only)</option>
                    </select>
                  </div>
                  <div>
                    <label className="mb-1 block text-gray-600">Line color</label>
                    <div className="flex items-center gap-2">
                      <input
                        value={lineColor}
                        onChange={(e) => setLineColor(e.target.value)}
                        className="w-full border border-gray-300 p-1"
                        placeholder="#1f77b4, steelblue, ..."
                      />
                      {lineColor.trim() && (
                        <span
                          className="inline-block h-5 w-5 rounded border border-gray-200"
                          style={{ backgroundColor: lineColor }}
                          aria-hidden="true"
                        />
                      )}
                    </div>
                    <p className="mt-1 text-[10px] text-gray-500">Hex codes or named Matplotlib colors are supported.</p>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {selectedGraphType === 'custom' && (
          <div className="mb-4 space-y-3 border-b border-gray-200 pb-3 text-xs">
            <div className="flex items-center justify-between">
              <h4 className="text-xs font-medium text-gray-700">Custom Matplotlib call</h4>
              <span className="text-[10px] uppercase tracking-wide text-gray-400">Advanced</span>
            </div>
            <div className="grid grid-cols-1 gap-3">
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="mb-1 block text-gray-600">Function name *</label>
                  <input
                    value={customFunction}
                    onChange={(e) => setCustomFunction(e.target.value)}
                    className="w-full border border-gray-300 p-1"
                    placeholder="plot, hexbin, kdeplot, ..."
                  />
                </div>
                <div>
                  <label className="mb-1 block text-gray-600">Module</label>
                  <select
                    value={customModule}
                    onChange={(e) => setCustomModule(e.target.value)}
                    className="w-full border border-gray-300 p-1"
                  >
                    <option value="axes">matplotlib.axes.Axes</option>
                    <option value="pyplot">matplotlib.pyplot</option>
                    <option value="seaborn">seaborn</option>
                    <option value="pandas">pandas.DataFrame.plot</option>
                    <option value="figure">matplotlib.figure.Figure</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="mb-1 block text-gray-600">Positional arguments (JSON array)</label>
                <textarea
                  value={customArgsText}
                  onChange={(e) => setCustomArgsText(e.target.value)}
                  className="w-full border border-gray-300 p-2 font-mono text-[11px] leading-relaxed"
                  rows={4}
                  spellCheck={false}
                />
                {customArgsError ? (
                  <p className="mt-1 text-[10px] text-red-600">{customArgsError}</p>
                ) : (
                  <p className="mt-1 text-[10px] text-gray-500">Use "$column:ColumnName" to inject dataset series, or "$dataframe" for the entire DataFrame.</p>
                )}
              </div>

              <div>
                <label className="mb-1 block text-gray-600">Keyword arguments (JSON object)</label>
                <textarea
                  value={customKwargsText}
                  onChange={(e) => setCustomKwargsText(e.target.value)}
                  className="w-full border border-gray-300 p-2 font-mono text-[11px] leading-relaxed"
                  rows={4}
                  spellCheck={false}
                />
                {customKwargsError ? (
                  <p className="mt-1 text-[10px] text-red-600">{customKwargsError}</p>
                ) : (
                  <p className="mt-1 text-[10px] text-gray-500">Example: {`{"x": "$column:sepal_length", "y": "$column:sepal_width"}`}</p>
                )}
              </div>
            </div>
          </div>
        )}

        <div className="mb-4">
          <button
            onClick={generateGraph}
            disabled={generateDisabled}
            className={`w-full px-3 py-2 text-xs font-semibold uppercase tracking-wide transition-colors ${
              generateDisabled
                ? 'cursor-not-allowed border border-gray-200 bg-gray-100 text-gray-400'
                : 'border border-gray-900 bg-gray-900 text-white hover:bg-gray-800'
            }`}
          >
            {isLoading ? 'Generating...' : 'Generate graph'}
          </button>
        </div>

        {isLoading && (
          <div className="flex flex-col items-center justify-center gap-2 rounded border border-gray-200 bg-gray-50 p-4 text-xs text-gray-600">
            <div className="h-6 w-6 animate-spin rounded-full border-2 border-gray-300 border-t-gray-700"></div>
            Generating graph...
          </div>
        )}

        {error && !isLoading && (
          <div className="rounded border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-600">
            <div className="font-medium">Something went wrong</div>
            <p className="mt-1 text-[11px]">{error}</p>
            <button
              onClick={generateGraph}
              className="mt-2 rounded border border-red-300 px-2 py-1 text-[11px] font-medium text-red-600 hover:bg-red-100"
            >
              Try again
            </button>
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