import { useEffect, useState, useCallback } from 'react';
// Dynamic import for Chart.js only when interactive mode is used could be added later for bundle size optimization.
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  PointElement,
  LineElement,
  Tooltip,
  Legend,
  Filler,
  ArcElement
} from 'chart.js';
import { Bar, Line, Scatter } from 'react-chartjs-2';

ChartJS.register(CategoryScale, LinearScale, BarElement, PointElement, LineElement, Tooltip, Legend, Filler, ArcElement);

const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:8000';

interface AvailableColumnsResponse {
  numerical: string[];
  categorical: string[];
  datetime: string[];
  all: string[];
}

interface GraphConfigRequest {
  title?: string;
  xlabel?: string;
  ylabel?: string;
  color_palette?: string;
  figsize?: [number, number];
  dpi?: number;
  style?: string;
  font_size?: number;
  title_size?: number;
  label_size?: number;
  rotation_x?: number;
  rotation_y?: number;
  grid?: boolean;
  legend?: boolean;
  tight_layout?: boolean;
  custom_colors?: string[] | null;
  alpha?: number;
  line_width?: number;
  marker_size?: number;
  bins?: number;
}

interface CreateGraphRequest {
  chart_type: string;
  x_column?: string;
  y_column?: string;
  y_columns?: string[];
  column?: string;
  columns?: string[];
  color_by?: string;
  size_by?: string;
  group_by?: string;
  aggregation?: string;
  config?: GraphConfigRequest;
}

interface GraphResponse {
  chart_type: string;
  image_base64: string;
  parameters_used: Record<string, any>;
  data?: any;
}

interface GraphBuilderProps {
  datasetId: string | string[] | undefined;
}

const chartTypes: { value: CreateGraphRequest['chart_type']; label: string; hint: string }[] = [
  { value: 'bar', label: 'Bar', hint: 'Counts or aggregation per category' },
  { value: 'line', label: 'Line', hint: 'Trend over X (time or ordered numeric)' },
  { value: 'scatter', label: 'Scatter', hint: 'Relationship between two numeric variables' },
  { value: 'histogram', label: 'Histogram', hint: 'Distribution of a single numeric column' },
  { value: 'box', label: 'Box', hint: 'Distribution with quartiles (optionally by category)' },
  { value: 'violin', label: 'Violin', hint: 'Density + distribution (optionally by category)' },
  { value: 'pie', label: 'Pie', hint: 'Parts of a whole (categorical counts)' },
  { value: 'heatmap', label: 'Heatmap', hint: 'Matrix of correlations or values (selected columns)' },
  { value: 'correlation', label: 'Correlation Matrix', hint: 'Automatically computes correlations of numeric columns' },
  { value: 'pairplot', label: 'Pair Plot', hint: 'Scatter matrix for multiple numeric columns' },
  { value: 'area', label: 'Area', hint: 'Stacked / overlapping area over X' },
];

const defaultConfig: GraphConfigRequest = {
  color_palette: 'viridis',
  style: 'whitegrid',
  font_size: 12,
  title_size: 14,
  label_size: 10,
  rotation_x: 0,
  rotation_y: 0,
  grid: true,
  legend: true,
  tight_layout: true,
  alpha: 0.85,
  line_width: 2,
  marker_size: 50,
  bins: 30,
};

export default function GraphBuilder({ datasetId }: GraphBuilderProps) {
  const [columns, setColumns] = useState<AvailableColumnsResponse | null>(null);
  const [loadingCols, setLoadingCols] = useState(false);
  const [chartType, setChartType] = useState<string>('bar');
  const [xColumn, setXColumn] = useState('');
  const [yColumn, setYColumn] = useState('');
  const [yColumns, setYColumns] = useState<string[]>([]);
  const [singleColumn, setSingleColumn] = useState('');
  const [multiColumns, setMultiColumns] = useState<string[]>([]);
  const [colorBy, setColorBy] = useState('');
  const [sizeBy, setSizeBy] = useState('');
  const [groupBy, setGroupBy] = useState('');
  const [config, setConfig] = useState<GraphConfigRequest>(defaultConfig);
  const [title, setTitle] = useState('');
  const [xlabel, setXlabel] = useState('');
  const [ylabel, setYlabel] = useState('');
  const [preview, setPreview] = useState<GraphResponse | null>(null);
  const [loadingGraph, setLoadingGraph] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [lastRequest, setLastRequest] = useState<CreateGraphRequest | null>(null);
  const [showHelp, setShowHelp] = useState(false);
  const [aggregation, setAggregation] = useState<string>('count');
  const [customColorsInput, setCustomColorsInput] = useState<string>('');
  const [interactive, setInteractive] = useState<boolean>(false);

  const chartExplanations: Record<string, { title: string; purpose: string; requirements: string; goodFor: string; extras?: string; }> = {
    bar: {
      title: 'Bar Chart',
      purpose: 'Compare counts or aggregated values across discrete categories.',
      requirements: 'X: categorical (required). Optional Y: numeric – if provided bars represent aggregated values (default aggregation is implicit count otherwise).',
      goodFor: 'Category frequencies, comparing sales per region, etc.',
      extras: 'If no Y value is chosen, backend counts rows per category. If a Y column is chosen the backend will aggregate (currently default aggregation; future enhancement could allow sum/mean).'
    },
    line: {
      title: 'Line Chart',
      purpose: 'Show trends or changes of a numeric variable over an ordered X (often time).',
      requirements: 'X: ordered (time or numeric). Y: numeric.',
      goodFor: 'Time series (daily revenue), progression over index.',
      extras: 'Optional group_by splits multiple lines by a categorical column.'
    },
    scatter: {
      title: 'Scatter Plot',
      purpose: 'Reveal relationship / correlation between two numeric variables.',
      requirements: 'X: numeric. Y: numeric.',
      goodFor: 'Detecting linear/non-linear relationships, clusters, outliers.',
      extras: 'Optional color_by (categorical) groups points by color; size_by (numeric) scales marker sizes.'
    },
    histogram: {
      title: 'Histogram',
      purpose: 'Distribution of a single numeric variable via bins.',
      requirements: 'Column: numeric.',
      goodFor: 'Skew detection, modality, spread, rough normality check.',
      extras: 'Adjust bin count in future via config (bins currently fixed in UI but backend supports).'
    },
    box: {
      title: 'Box Plot',
      purpose: 'Summarize distribution (median, quartiles, potential outliers).',
      requirements: 'Y: numeric. Optional X: categorical to produce grouped boxes.',
      goodFor: 'Quick comparison of spread across groups.'
    },
    violin: {
      title: 'Violin Plot',
      purpose: 'Distribution shape + density for a numeric variable.',
      requirements: 'Y: numeric. Optional X: categorical for multiple violins.',
      goodFor: 'Comparing detailed distribution shapes between categories.'
    },
    pie: {
      title: 'Pie Chart',
      purpose: 'Show proportion of categories in a whole.',
      requirements: 'Column: categorical.',
      goodFor: 'Simple share breakdowns (limited number of categories).',
      extras: 'Avoid using with many categories; bar chart often clearer.'
    },
    heatmap: {
      title: 'Heatmap',
      purpose: 'Matrix of values (often correlations) between multiple numeric columns.',
      requirements: 'Columns: >=2 numeric.',
      goodFor: 'Correlation inspection, feature redundancy, clustering hints.'
    },
    correlation: {
      title: 'Correlation Matrix (Quick)',
      purpose: 'Automatic correlation of all numeric columns (no extra params).',
      requirements: 'None (uses all numeric).',
      goodFor: 'Immediate overview of linear relationships.'
    },
    pairplot: {
      title: 'Pair Plot',
      purpose: 'Grid of scatter plots + diagonals to explore pairwise relationships.',
      requirements: 'Columns: >=2 numeric.',
      goodFor: 'Visual multivariate exploration, correlation pattern spotting.',
      extras: 'Optional color_by overlays categorical grouping.'
    },
    area: {
      title: 'Area Chart',
      purpose: 'Emphasize cumulative magnitude over X for one or multiple series.',
      requirements: 'X: ordered. Y Series: one or more numeric.',
      goodFor: 'Composition over time (stacking visual).'
    }
  };

  // Fetch available columns
  useEffect(() => {
    if (!datasetId) return;
    (async () => {
      try {
        setLoadingCols(true);
        const res = await fetch(`${BACKEND_URL}/datasets/${datasetId}/columns`);
        if (!res.ok) throw new Error('Failed to load columns');
        const data = await res.json();
        setColumns(data);
        // Heuristics: pick first categorical as X for bar, first numeric as Y
        if (data.categorical.length) setXColumn(data.categorical[0]);
        if (data.numerical.length) {
          setYColumn(data.numerical[0]);
          setSingleColumn(data.numerical[0]);
          setYColumns(data.numerical.slice(0, Math.min(2, data.numerical.length)));
        }
      } catch (e: any) {
        setError(e.message);
      } finally {
        setLoadingCols(false);
      }
    })();
  }, [datasetId]);

  // Persist help panel visibility
  useEffect(() => {
    try {
      const saved = localStorage.getItem('mango_graph_help_visible');
      if (saved) setShowHelp(saved === 'true');
    } catch {/* ignore */}
  }, []);
  useEffect(() => {
    try { localStorage.setItem('mango_graph_help_visible', String(showHelp)); } catch {/* ignore */}
  }, [showHelp]);

  // Build request based on chart type
  const buildRequest = useCallback((): CreateGraphRequest | null => {
    if (!chartType) return null;
    const base: CreateGraphRequest = { chart_type: chartType };
    switch (chartType) {
      case 'bar':
        if (!xColumn) return null;
        base.x_column = xColumn;
        if (yColumn) base.y_column = yColumn; // optional aggregated measure
        base.aggregation = yColumn ? aggregation : 'count';
        break;
      case 'line':
        if (!xColumn || !yColumn) return null;
        base.x_column = xColumn; base.y_column = yColumn; if (groupBy) base.group_by = groupBy; break;
      case 'scatter':
        if (!xColumn || !yColumn) return null;
        base.x_column = xColumn; base.y_column = yColumn;
        if (colorBy) base.color_by = colorBy; if (sizeBy) base.size_by = sizeBy; break;
      case 'histogram':
        if (!singleColumn) return null; base.column = singleColumn; break;
      case 'box':
        if (!yColumn) return null; base.y_column = yColumn; if (xColumn) base.x_column = xColumn; break;
      case 'violin':
        if (!yColumn) return null; base.y_column = yColumn; if (xColumn) base.x_column = xColumn; break;
      case 'pie':
        if (!singleColumn) return null; base.column = singleColumn; break;
      case 'heatmap':
        if (!multiColumns.length) return null; base.columns = multiColumns; break;
      case 'correlation':
        // no params
        break;
      case 'pairplot':
        if (!multiColumns.length) return null; base.columns = multiColumns; if (colorBy) base.color_by = colorBy; break;
      case 'area':
        if (!xColumn || !yColumns.length) return null; base.x_column = xColumn; base.y_columns = yColumns; break;
      default:
        return null;
    }
    const finalConfig: GraphConfigRequest = {
      ...config,
      title: title || undefined,
      xlabel: xlabel || undefined,
      ylabel: ylabel || undefined,
    };
    if (customColorsInput.trim()) {
      const colors = customColorsInput.split(/[;,\s]+/).map(c=>c.trim()).filter(Boolean);
      if (colors.length) (finalConfig as any).custom_colors = colors;
    }
    base.config = finalConfig;
    return base;
  }, [chartType, xColumn, yColumn, yColumns, singleColumn, multiColumns, colorBy, sizeBy, groupBy, config, title, xlabel, ylabel, aggregation, customColorsInput]);

  // Debounced auto preview
  useEffect(() => {
    if (!autoRefresh) return;
    const h = setTimeout(() => { generateGraph(); }, 600);
    return () => clearTimeout(h);
    // Include 'interactive' so toggling it triggers regeneration with return_data when auto preview is enabled.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chartType, xColumn, yColumn, yColumns, singleColumn, multiColumns, colorBy, sizeBy, groupBy, config, title, xlabel, ylabel, autoRefresh, interactive]);

  // If user toggles interactive ON while auto preview is OFF, prompt a fresh fetch automatically
  useEffect(() => {
    if (interactive && !autoRefresh) {
      // Fire and forget; user can still press Render manually afterward
      generateGraph();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [interactive]);

  const generateGraph = async () => {
    if (!datasetId) return;
    const req = buildRequest();
    if (!req) { setError('Select required fields for this chart.'); return; }
    try {
      setLoadingGraph(true); setError(null);
      setLastRequest(req);
  const body = { ...req } as any;
  if (interactive) body.return_data = true;
  const res = await fetch(`${BACKEND_URL}/datasets/${datasetId}/graphs`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      if (!res.ok) {
        const text = await res.text();
        throw new Error(text || 'Graph generation failed');
      }
      const data: GraphResponse = await res.json();
      setPreview(data);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoadingGraph(false);
    }
  };

  const toggleInMulti = (col: string, setter: (v: string[]) => void, current: string[]) => {
    if (current.includes(col)) setter(current.filter(c => c !== col)); else setter([...current, col]);
  };

  const downloadImage = () => {
    if (!preview) return;
    const link = document.createElement('a');
    link.download = `dataset_${datasetId}_${preview.chart_type}.png`;
    link.href = `data:image/png;base64,${preview.image_base64}`;
    link.click();
  };

  const copyImage = async () => {
    if (!preview) return;
    try {
      const dataUrl = `data:image/png;base64,${preview.image_base64}`;
      const blob = await (await fetch(dataUrl)).blob();
      // @ts-ignore clipboard item may not exist in all browsers
      await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
    } catch (e) {
      alert('Copy failed (browser may not support): ' + (e as any).message);
    }
  };

  const sectionCls = 'p-4 border rounded bg-white shadow-sm space-y-3';
  const labelCls = 'text-[10px] font-semibold tracking-wide text-gray-600';
  const pillCls = (active: boolean) => `px-2 py-1 rounded text-xs border cursor-pointer hover:bg-indigo-50 ${active ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-gray-50'}`;

  // --- Interactive Chart Component ---
  const InteractiveChart = ({ preview }: { preview: GraphResponse }) => {
    const chartType = preview.chart_type;
    const pdata = preview.data || {};
    const palette = (config as any).custom_colors || [];
    const baseColors = palette.length ? palette : ['#2563eb', '#9333ea', '#059669', '#dc2626', '#f59e0b', '#0d9488'];

    if (chartType === 'bar' && pdata.labels && pdata.values) {
      return <Bar data={{ labels: pdata.labels, datasets: [{ label: pdata.metric || 'value', data: pdata.values, backgroundColor: baseColors.slice(0, pdata.values.length) }] }} options={{ responsive: true, plugins: { legend: { display: true }, tooltip: { enabled: true } } }} />;
    }
    if (chartType === 'line' && pdata.series) {
      return <Line data={{ labels: pdata.series[0]?.x || [], datasets: pdata.series.map((s: any, idx: number) => ({ label: s.group || 'series', data: s.y, borderColor: baseColors[idx % baseColors.length], backgroundColor: baseColors[idx % baseColors.length] + '55', tension: 0.2 })) }} options={{ responsive: true, interaction: { mode: 'nearest', intersect: false }, plugins: { legend: { display: true } } }} />;
    }
    if (chartType === 'line' && pdata.x && pdata.y) {
      return <Line data={{ labels: pdata.x, datasets: [{ label: 'value', data: pdata.y, borderColor: baseColors[0], backgroundColor: baseColors[0] + '55', tension: 0.2 }] }} options={{ responsive: true }} />;
    }
    if (chartType === 'scatter' && pdata.x && pdata.y) {
      const points = pdata.x.map((x: any, i: number) => ({ x, y: pdata.y[i], r: 4 }));
      return <Scatter data={{ datasets: [{ label: 'points', data: points, backgroundColor: baseColors[0] }] }} options={{ responsive: true, parsing: false, plugins: { tooltip: { callbacks: { label: (ctx:any) => `(${ctx.raw.x}, ${ctx.raw.y})` } } } }} />;
    }
    if (chartType === 'histogram' && pdata.bins && pdata.counts) {
      const binLabels = pdata.bins.slice(0, -1).map((b: number, i: number) => `${b.toFixed(2)} – ${pdata.bins[i+1].toFixed(2)}`);
      return <Bar data={{ labels: binLabels, datasets: [{ label: pdata.column, data: pdata.counts, backgroundColor: baseColors[0] }] }} options={{ responsive: true, plugins: { tooltip: { callbacks: { label: (ctx:any) => `${ctx.dataset.label}: ${ctx.formattedValue}` } } } }} />;
    }
    // Fallback for unsupported interactive types
    return <img src={`data:image/png;base64,${preview.image_base64}`} alt={`${preview.chart_type} chart`} className="max-w-full border rounded" />;
  };

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <h2 style={{ color: '#111827' }} className="text-xl font-semibold tracking-tight">
          Build a Graph
        </h2>
        <div className="flex items-center gap-3">
          <button 
            type="button" 
            onClick={() => setShowHelp(s => !s)} 
            className="px-4 py-2 rounded-lg border border-gray-200 bg-white hover:bg-gray-50 transition-colors text-sm font-medium shadow-sm" 
            aria-expanded={showHelp}
            style={{ color: '#374151' }}
          >
            {showHelp ? 'Hide Guide' : 'Show Guide'}
          </button>
          
          <label className="flex items-center gap-2 cursor-pointer select-none">
            <input 
              type="checkbox" 
              checked={autoRefresh} 
              onChange={e => setAutoRefresh(e.target.checked)} 
              className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
            />
            <span style={{ color: '#374151' }} className="text-sm font-medium">Auto Preview</span>
          </label>
          
          <label className="flex items-center gap-2 cursor-pointer select-none" title="Interactive mode enables hover tooltips via a client-side chart library.">
            <input 
              type="checkbox" 
              checked={interactive} 
              onChange={e => setInteractive(e.target.checked)} 
              className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
            />
            <span style={{ color: '#374151' }} className="text-sm font-medium">Interactive</span>
          </label>
          
          <button 
            onClick={generateGraph} 
            disabled={loadingGraph} 
            className="px-4 py-2 rounded-lg bg-gradient-to-r from-indigo-600 to-purple-600 text-white font-medium hover:from-indigo-700 hover:to-purple-700 disabled:opacity-40 disabled:cursor-not-allowed transition-all duration-200 shadow-sm hover:shadow-md text-sm"
          >
            {loadingGraph ? (
              <div className="flex items-center gap-2">
                <svg className="animate-spin h-4 w-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
                Rendering...
              </div>
            ) : (
              'Render Graph'
            )}
          </button>
        </div>
      </div>
      
      {showHelp && (
        <div className="bg-white/80 backdrop-blur-sm border rounded-xl p-6 shadow-lg">
          <h3 style={{ color: '#111827' }} className="font-semibold text-lg mb-4">Chart Types Reference</h3>
          <p style={{ color: '#6b7280' }} className="text-sm mb-6">
            Choose a chart type below. Bar charts with no Value column selected use counts; adding a Value makes bars represent an aggregated measure of that numeric column.
          </p>
          <div className="grid md:grid-cols-2 gap-6">
            {Object.entries(chartExplanations).map(([key, info]) => (
              <div key={key} className="border border-gray-200 rounded-lg p-4 bg-gray-50/50 space-y-3">
                <div style={{ color: '#111827' }} className="font-semibold text-base">{info.title}</div>
                <div className="space-y-2 text-sm">
                  <div><span style={{ color: '#374151' }} className="font-medium">Purpose:</span> <span style={{ color: '#6b7280' }}>{info.purpose}</span></div>
                  <div><span style={{ color: '#374151' }} className="font-medium">Requirements:</span> <span style={{ color: '#6b7280' }}>{info.requirements}</span></div>
                  <div><span style={{ color: '#374151' }} className="font-medium">Best For:</span> <span style={{ color: '#6b7280' }}>{info.goodFor}</span></div>
                  {info.extras && <div style={{ color: '#9ca3af' }} className="text-xs italic">{info.extras}</div>}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
      <div className="grid md:grid-cols-3 gap-8 items-start">
        <div className="md:col-span-1 space-y-8">
          <div className="bg-white/80 backdrop-blur-sm border rounded-xl shadow-lg p-6 space-y-6">
            <div>
              <label style={{ color: '#374151' }} className="block text-sm font-medium mb-3">Chart Type</label>
              <select 
                value={chartType} 
                onChange={e=>setChartType(e.target.value)} 
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-colors bg-white text-sm font-medium shadow-sm"
                style={{ color: '#111827' }}
              >
                {chartTypes.map(ct => <option key={ct.value} value={ct.value}>{ct.label}</option>)}
              </select>
              <p style={{ color: '#6b7280' }} className="text-xs mt-2">{chartTypes.find(c=>c.value===chartType)?.hint}</p>
            </div>
            {columns && (
              <div className="space-y-4">
                {(chartType === 'bar' || chartType === 'line' || chartType === 'scatter' || chartType === 'box' || chartType === 'violin' || chartType === 'area') && (
                  <div>
                    <label style={{ color: '#374151' }} className="block text-sm font-medium mb-3">
                      {chartType === 'bar' ? 'Category (X-Axis)' : 'X Column'}
                    </label>
                    <select 
                      value={xColumn} 
                      onChange={e=>setXColumn(e.target.value)} 
                      className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-colors bg-white text-sm font-medium shadow-sm"
                      style={{ color: '#111827' }}
                    >
                      <option value="">-- Select Column --</option>
                      {columns.all.filter(c=>c!=='_rowid').map(c=> <option key={c} value={c}>{c}</option>)}
                    </select>
                  </div>
                )}
                {(chartType === 'line' || chartType === 'scatter' || chartType === 'box' || chartType === 'violin') && (
                  <div>
                    <label style={{ color: '#374151' }} className="block text-sm font-medium mb-3">Y Column</label>
                    <select 
                      value={yColumn} 
                      onChange={e=>setYColumn(e.target.value)} 
                      className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-colors bg-white text-sm font-medium shadow-sm"
                      style={{ color: '#111827' }}
                    >
                      <option value="">-- Select Column --</option>
                      {columns.all.filter(c=>c!=='_rowid').map(c=> <option key={c} value={c}>{c}</option>)}
                    </select>
                  </div>
                )}
                {chartType === 'bar' && (
                  <div className="space-y-4">
                    <div title="Leave empty to count rows per category. Select a numeric column to plot aggregated values instead of counts.">
                      <label style={{ color: '#374151' }} className="block text-sm font-medium mb-3">
                        Value Column <span style={{ color: '#9ca3af' }} className="text-xs">(optional)</span>
                      </label>
                      <select 
                        value={yColumn} 
                        onChange={e=>setYColumn(e.target.value)} 
                        className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-colors bg-white text-sm font-medium shadow-sm"
                        style={{ color: '#111827' }}
                      >
                        <option value="">-- Use Counts --</option>
                        {columns.all.filter(c=>c!=='_rowid').map(c=> <option key={c} value={c}>{c}</option>)}
                      </select>
                      <p style={{ color: '#9ca3af' }} className="text-xs mt-2">Counts if blank; aggregated measure if selected.</p>
                    </div>
                    <div title="Aggregation function when a VALUE column is chosen.">
                      <label style={{ color: '#374151' }} className="block text-sm font-medium mb-3">Aggregation Method</label>
                      <select 
                        value={aggregation} 
                        onChange={e=>setAggregation(e.target.value)} 
                        className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-colors bg-white text-sm font-medium shadow-sm disabled:opacity-50 disabled:cursor-not-allowed"
                        style={{ color: '#111827' }}
                        disabled={!yColumn}
                      >
                        <option value="count">Count</option>
                        <option value="sum">Sum</option>
                        <option value="mean">Mean</option>
                        <option value="median">Median</option>
                        <option value="min">Minimum</option>
                        <option value="max">Maximum</option>
                      </select>
                      <p style={{ color: '#9ca3af' }} className="text-xs mt-2">Disabled when counting categories.</p>
                    </div>
                  </div>
                )}
                {chartType === 'scatter' && (
                  <>
                    <div>
                      <label style={{ color: '#374151' }} className="block text-sm font-medium mb-3">
                        Color By <span style={{ color: '#9ca3af' }} className="text-xs">(optional)</span>
                      </label>
                      <select 
                        value={colorBy} 
                        onChange={e=>setColorBy(e.target.value)} 
                        className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-colors bg-white text-sm font-medium shadow-sm"
                        style={{ color: '#111827' }}
                      >
                        <option value="">-- None --</option>
                        {columns.all.filter(c=>c!=='_rowid').map(c=> <option key={c} value={c}>{c}</option>)}
                      </select>
                    </div>
                    <div>
                      <label style={{ color: '#374151' }} className="block text-sm font-medium mb-3">
                        Size By <span style={{ color: '#9ca3af' }} className="text-xs">(optional)</span>
                      </label>
                      <select 
                        value={sizeBy} 
                        onChange={e=>setSizeBy(e.target.value)} 
                        className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-colors bg-white text-sm font-medium shadow-sm"
                        style={{ color: '#111827' }}
                      >
                        <option value="">-- None --</option>
                        {columns.numerical.map(c=> <option key={c} value={c}>{c}</option>)}
                      </select>
                    </div>
                  </>
                )}
                {chartType === 'line' && (
                  <div>
                    <label style={{ color: '#374151' }} className="block text-sm font-medium mb-3">
                      Group By <span style={{ color: '#9ca3af' }} className="text-xs">(optional)</span>
                    </label>
                    <select 
                      value={groupBy} 
                      onChange={e=>setGroupBy(e.target.value)} 
                      className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-colors bg-white text-sm font-medium shadow-sm"
                      style={{ color: '#111827' }}
                    >
                      <option value="">-- None --</option>
                      {columns.categorical.map(c=> <option key={c} value={c}>{c}</option>)}
                    </select>
                  </div>
                )}
                {(chartType === 'histogram' || chartType === 'pie') && (
                  <div>
                    <label style={{ color: '#374151' }} className="block text-sm font-medium mb-3">Column</label>
                    <select 
                      value={singleColumn} 
                      onChange={e=>setSingleColumn(e.target.value)} 
                      className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-colors bg-white text-sm font-medium shadow-sm"
                      style={{ color: '#111827' }}
                    >
                      <option value="">-- Select Column --</option>
                      {columns.all.filter(c=>c!=='_rowid').map(c=> <option key={c} value={c}>{c}</option>)}
                    </select>
                  </div>
                )}
                {(chartType === 'heatmap' || chartType === 'pairplot') && (
                  <div>
                    <label style={{ color: '#374151' }} className="block text-sm font-medium mb-3">Columns</label>
                    <div className="flex flex-wrap gap-2">
                      {columns.numerical.map(c => (
                        <button 
                          type="button" 
                          key={c} 
                          className={`px-3 py-2 rounded-lg text-sm font-medium transition-colors border ${
                            multiColumns.includes(c) 
                              ? 'bg-indigo-600 text-white border-indigo-600' 
                              : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'
                          }`}
                          onClick={()=>toggleInMulti(c,setMultiColumns,multiColumns)}
                        >
                          {c}
                        </button>
                      ))}
                    </div>
                    {chartType === 'pairplot' && (
                      <div className="mt-4">
                        <label style={{ color: '#374151' }} className="block text-sm font-medium mb-3">
                          Color By <span style={{ color: '#9ca3af' }} className="text-xs">(optional)</span>
                        </label>
                        <select 
                          value={colorBy} 
                          onChange={e=>setColorBy(e.target.value)} 
                          className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-colors bg-white text-sm font-medium shadow-sm"
                          style={{ color: '#111827' }}
                        >
                          <option value="">-- None --</option>
                          {columns.categorical.map(c=> <option key={c} value={c}>{c}</option>)}
                        </select>
                      </div>
                    )}
                  </div>
                )}
                {chartType === 'area' && (
                  <div>
                    <label style={{ color: '#374151' }} className="block text-sm font-medium mb-3">Y Series</label>
                    <div className="flex flex-wrap gap-2">
                      {columns.numerical.map(c => (
                        <button 
                          type="button" 
                          key={c} 
                          className={`px-3 py-2 rounded-lg text-sm font-medium transition-colors border ${
                            yColumns.includes(c) 
                              ? 'bg-indigo-600 text-white border-indigo-600' 
                              : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'
                          }`}
                          onClick={()=>toggleInMulti(c,setYColumns,yColumns)}
                        >
                          {c}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
          <div className="bg-white/80 backdrop-blur-sm border rounded-xl shadow-lg p-6 space-y-6">
            <h3 style={{ color: '#111827' }} className="text-lg font-semibold">Styling Options</h3>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label style={{ color: '#374151' }} className="block text-sm font-medium mb-3">Title</label>
                <input 
                  value={title} 
                  onChange={e=>setTitle(e.target.value)} 
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-colors bg-white text-sm font-medium shadow-sm"
                  style={{ color: '#111827' }}
                  placeholder="Chart title..."
                />
              </div>
              <div>
                <label style={{ color: '#374151' }} className="block text-sm font-medium mb-3">Color Palette</label>
                <select 
                  value={config.color_palette} 
                  onChange={e=>setConfig(c=>({...c,color_palette:e.target.value}))} 
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-colors bg-white text-sm font-medium shadow-sm"
                  style={{ color: '#111827' }}
                >
                  {['viridis','plasma','magma','inferno','cividis','coolwarm','Set1','Set2','Set3','Paired','tab10','tab20','Blues','Reds','Greens','Oranges','Purples'].map(p => <option key={p} value={p}>{p}</option>)}
                </select>
              </div>
              <div>
                <label style={{ color: '#374151' }} className="block text-sm font-medium mb-3">X-Axis Label</label>
                <input 
                  value={xlabel} 
                  onChange={e=>setXlabel(e.target.value)} 
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-colors bg-white text-sm font-medium shadow-sm"
                  style={{ color: '#111827' }}
                  placeholder="X-axis label..."
                />
              </div>
              <div>
                <label style={{ color: '#374151' }} className="block text-sm font-medium mb-3">Y-Axis Label</label>
                <input 
                  value={ylabel} 
                  onChange={e=>setYlabel(e.target.value)} 
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-colors bg-white text-sm font-medium shadow-sm"
                  style={{ color: '#111827' }}
                  placeholder="Y-axis label..."
                />
              </div>
            </div>
            <div className="col-span-2">
              <label 
                style={{ color: '#374151' }} 
                className="block text-sm font-medium mb-3"
                title="Comma, space, or semicolon separated custom colors (hex or CSS names). Overrides palette when provided."
              >
                Custom Colors <span style={{ color: '#9ca3af' }} className="text-xs">(optional)</span>
              </label>
              <input 
                value={customColorsInput} 
                onChange={e=>setCustomColorsInput(e.target.value)} 
                placeholder="#1f77b4, #ff7f0e, #2ca02c" 
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-colors bg-white text-sm font-medium shadow-sm"
                style={{ color: '#111827' }}
              />
            </div>
            <div className="space-y-3">
              <h4 style={{ color: '#374151' }} className="font-medium text-sm">Display Options</h4>
              <div className="space-y-3">
                <label className="flex items-center gap-3 cursor-pointer">
                  <input 
                    type="checkbox" 
                    checked={config.grid} 
                    onChange={e=>setConfig(c=>({...c,grid:e.target.checked}))}
                    className="w-4 h-4 text-indigo-600 border-gray-300 rounded focus:ring-indigo-500"
                  />
                  <span style={{ color: '#374151' }} className="text-sm font-medium">Show Grid Lines</span>
                </label>
                <label className="flex items-center gap-3 cursor-pointer">
                  <input 
                    type="checkbox" 
                    checked={config.legend} 
                    onChange={e=>setConfig(c=>({...c,legend:e.target.checked}))}
                    className="w-4 h-4 text-indigo-600 border-gray-300 rounded focus:ring-indigo-500"
                  />
                  <span style={{ color: '#374151' }} className="text-sm font-medium">Show Legend</span>
                </label>
              </div>
            </div>
          </div>
        </div>
        <div className="md:col-span-2 space-y-6">
          <div className="bg-white/80 backdrop-blur-sm border rounded-xl shadow-lg p-6">
            <div className="flex items-center justify-between mb-6">
              <h3 style={{ color: '#111827' }} className="text-lg font-semibold">Chart Preview</h3>
              <div className="flex gap-3">
                <button 
                  onClick={downloadImage} 
                  disabled={!preview} 
                  className="px-4 py-2 rounded-lg bg-gray-800 text-white disabled:opacity-40 disabled:cursor-not-allowed hover:bg-gray-900 transition-colors text-sm font-medium shadow-sm"
                >
                  Download PNG
                </button>
                <button 
                  onClick={copyImage} 
                  disabled={!preview} 
                  className="px-4 py-2 rounded-lg bg-gray-600 text-white disabled:opacity-40 disabled:cursor-not-allowed hover:bg-gray-700 transition-colors text-sm font-medium shadow-sm"
                >
                  Copy Image
                </button>
              </div>
            </div>
            {!preview && !loadingGraph && (
              <div className="text-center py-12">
                <p style={{ color: '#6b7280' }} className="text-sm">No graph yet. Adjust parameters and click "Render Graph" to preview.</p>
              </div>
            )}
            {loadingGraph && (
              <div className="text-center py-12">
                <div className="flex items-center justify-center gap-3">
                  <svg className="animate-spin h-5 w-5 text-indigo-600" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                  <p style={{ color: '#6b7280' }} className="text-sm">Rendering graph...</p>
                </div>
              </div>
            )}
            {error && (
              <div className="text-center py-8">
                <p style={{ color: '#dc2626' }} className="text-sm">{error}</p>
              </div>
            )}
            {preview && !loadingGraph && !interactive && (
              <div className="border border-gray-200 rounded-lg p-4 bg-gray-50/30">
                <img 
                  src={`data:image/png;base64,${preview.image_base64}`} 
                  alt={`${preview.chart_type} chart`} 
                  className="w-full h-auto rounded-lg shadow-sm" 
                />
              </div>
            )}
            {preview && !loadingGraph && interactive && (
              <div className="border border-gray-200 rounded-lg p-4 bg-gray-50/30">
                <InteractiveChart preview={preview} />
              </div>
            )}
            {preview && !loadingGraph && interactive && !preview.data && (
              <div className="text-center mt-4">
                <p style={{ color: '#9ca3af' }} className="text-xs">
                  Interactive data not yet loaded. {autoRefresh ? 'Awaiting refresh...' : 'Click Render to load interactive dataset.'}
                </p>
              </div>
            )}
            {lastRequest && (
              <details className="mt-6">
                <summary style={{ color: '#6b7280' }} className="cursor-pointer text-sm font-medium">Request JSON</summary>
                <pre className="bg-gray-100 p-4 rounded-lg border overflow-auto max-h-48 mt-3 text-xs whitespace-pre-wrap font-mono" style={{ color: '#374151' }}>
                  {JSON.stringify(lastRequest,null,2)}
                </pre>
              </details>
            )}
          </div>
          {columns && (
            <div className="bg-white/80 backdrop-blur-sm border rounded-xl shadow-lg p-6">
              <h3 style={{ color: '#111827' }} className="text-lg font-semibold mb-4">Column Summary</h3>
              <div className="grid md:grid-cols-3 gap-6">
                <div className="space-y-2">
                  <h4 style={{ color: '#6b7280' }} className="text-xs font-medium uppercase tracking-wider">Numeric Columns</h4>
                  <p style={{ color: '#374151' }} className="text-sm font-medium break-words">
                    {columns.numerical.join(', ') || 'None'}
                  </p>
                </div>
                <div className="space-y-2">
                  <h4 style={{ color: '#6b7280' }} className="text-xs font-medium uppercase tracking-wider">Categorical Columns</h4>
                  <p style={{ color: '#374151' }} className="text-sm font-medium break-words">
                    {columns.categorical.join(', ') || 'None'}
                  </p>
                </div>
                <div className="space-y-2">
                  <h4 style={{ color: '#6b7280' }} className="text-xs font-medium uppercase tracking-wider">Date/Time Columns</h4>
                  <p style={{ color: '#374151' }} className="text-sm font-medium break-words">
                    {columns.datetime.join(', ') || 'None'}
                  </p>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
