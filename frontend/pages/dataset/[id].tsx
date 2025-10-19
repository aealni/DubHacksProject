import { useRouter } from 'next/router';
import { useEffect, useState } from 'react';
import DataPreviewTable from '../../components/DataPreviewTable';
import MetadataCard from '../../components/MetadataCard';
import MergeUpload from '../../components/MergeUpload';
import CanvasBackground from '../../components/CanvasBackground';
import DatasetWorkspace from '../../components/DatasetWorkspace';

const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:8000';

export default function DatasetPage() {
  const router = useRouter();
  const { id } = router.query;
  const [previewRows, setPreviewRows] = useState<any[]>([]);
  const [previewColumns, setPreviewColumns] = useState<string[]>([]);
  const [totalRows, setTotalRows] = useState<number | undefined>(undefined);
  const [offset, setOffset] = useState(0);
  const [limit, setLimit] = useState(10);
  const [report, setReport] = useState<any | null>(null);
  // Multi-source state
  const [mergeInfo, setMergeInfo] = useState<any | null>(null);
  const [showAddData, setShowAddData] = useState(false);
  const [showMergeHistory, setShowMergeHistory] = useState(false);
  // Batch rename state removed; inline header rename retained
  const [roundSpecs, setRoundSpecs] = useState<Record<string,string>>({});
  const [globalDecimals, setGlobalDecimals] = useState<string>('');
  const [imputeSpecs, setImputeSpecs] = useState<Record<string,string>>({});
  const [globalImputeStrategy, setGlobalImputeStrategy] = useState<string>('mean');
  const [globalImputeConstant, setGlobalImputeConstant] = useState<string>('');
  const [rounding, setRounding] = useState(false);
  const [imputing, setImputing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [opMessage, setOpMessage] = useState<string | null>(null);
  const [timeFormat, setTimeFormat] = useState<string>('iso');
  const [timeColsSelected, setTimeColsSelected] = useState<Record<string, boolean>>({});
  const [timeFormatting, setTimeFormatting] = useState(false);
  // Cleaning control state for reprocess
  const [dropThreshold, setDropThreshold] = useState<number>(0.6);
  const [missingMode, setMissingMode] = useState<string>('drop_rows');
  const [numericFill, setNumericFill] = useState<string>('median');
  const [categoricalFill, setCategoricalFill] = useState<string>('mode');
  const [constantFillValue, setConstantFillValue] = useState<string>('');
  const [lowercaseCats, setLowercaseCats] = useState<boolean>(true);
  const [reprocessing, setReprocessing] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [historyEvents, setHistoryEvents] = useState<any[]>([]);
  const [useWorkspaceView, setUseWorkspaceView] = useState(true);

  useEffect(() => {
    if (!id) return;
    refreshPreviewMetadata(offset);
    loadMergeInfo();
  }, [id]);

  const loadMergeInfo = async () => {
    if (!id) return;
    try {
      const res = await fetch(`${BACKEND_URL}/dataset/${id}/merge-info`);
      if (res.ok) {
        const data = await res.json();
        setMergeInfo(data);
      }
    } catch (e) {
      console.error('Failed to load merge info:', e);
    }
  };

  const refreshPreviewMetadata = async (ofs = offset) => {
    if (!id) return;
    setLoading(true);
    setError(null);
    try {
      const [pRes, mRes] = await Promise.all([
        fetch(`${BACKEND_URL}/dataset/${id}/preview?limit=${limit}&offset=${ofs}`),
        fetch(`${BACKEND_URL}/dataset/${id}/metadata`)
      ]);
      if (!pRes.ok) throw new Error('Preview request failed');
      if (!mRes.ok) throw new Error('Metadata request failed');
      const [pJson, mJson] = await Promise.all([pRes.json(), mRes.json()]);
      const pv = pJson.preview || pJson;
      setPreviewColumns(pv.columns || []);
      setPreviewRows(pv.rows || []);
      setTotalRows(pv.total_rows);
      setOffset(pv.offset || ofs);
      setReport(mJson.report || null);
      // Initialize date/time column selections if metadata contains date columns standardized list or dtype hints
      const meta = mJson.report || {};
      const allCols = (pv.columns || []) as string[];
      const init: Record<string, boolean> = {};
      allCols.filter(c => c !== '_rowid').forEach(c => { init[c] = false; });
      if (meta.date_columns_standardized) (meta.date_columns_standardized as string[]).forEach((c: string) => { if (init[c] !== undefined) init[c] = true; });
      if (meta.dtype_inference) {
        Object.entries(meta.dtype_inference).forEach(([col, dt]: any) => {
          if (typeof dt === 'string' && dt.toLowerCase().includes('date') && init[col] !== undefined) init[col] = true;
        });
      }
      setTimeColsSelected(init);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  const handlePageChange = (newOffset: number) => {
    if (newOffset < 0) newOffset = 0;
    refreshPreviewMetadata(newOffset);
  };

  const saveEdits = async (edits: { rowid: number; column: string; value: any }[], renames?: { old: string; next: string }[]) => {
    try {
      if (edits.length) {
        await fetch(`${BACKEND_URL}/dataset/${id}/cells`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ edits })
        });
      }
      if (renames && renames.length) {
        await fetch(`${BACKEND_URL}/dataset/${id}/columns`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ renames: renames.map(r => ({ old: r.old, new: r.next })) })
        });
      }
      await refreshPreviewMetadata(offset);
  setOpMessage(`CHANGES SAVED: ${edits.length} VALUE EDIT(S)${renames && renames.length ? ` + ${renames.length} RENAME(S)` : ''}`);
    } catch (e:any) {
      setOpMessage(`Save failed: ${e.message}`);
    }
  };

  // renameSingleColumn retained for legacy direct usage but no longer used by table (table supplies batched renames)
  const renameSingleColumn = (oldName: string, newName: string) => {
    (async () => {
      try {
        await fetch(`${BACKEND_URL}/dataset/${id}/columns`, {
          method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ renames: [{ old: oldName, new: newName }] })
        });
        await refreshPreviewMetadata(0);
      } catch (e:any) {
  setOpMessage(`RENAME FAILED: ${e.message}`);
      }
    })();
  };

  const applyGlobalRounding = async (decimalsOverride?: string) => {
    if (!report || !report.dtype_inference) return;
    const val = decimalsOverride ?? globalDecimals;
    const dec = Number(val);
    if (val === '' || isNaN(dec)) return;
    const numericCols = Object.entries(report.dtype_inference)
      .filter(([_, dtype]) => typeof dtype === 'string' && /int|float|double|numeric|number/i.test(String(dtype)))
      .map(([col]) => col)
      .filter(c => c !== '_rowid');
    if (!numericCols.length) return;
    setRounding(true);
    try {
      const rounds = numericCols.map(c => ({ column: c, decimals: dec }));
      await fetch(`${BACKEND_URL}/dataset/${id}/round`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ rounds }) });
      await refreshPreviewMetadata(offset);
      setOpMessage(`Rounded to ${dec} decimals.`);
      fetchHistory();
    } catch (e:any) {
      setOpMessage(`Rounding failed: ${e.message}`);
    } finally { setRounding(false); }
  };
  // Debounce rounding
  useEffect(() => {
    if (globalDecimals === '') return;
    const t = setTimeout(() => { applyGlobalRounding(globalDecimals); }, 500);
    return () => clearTimeout(t);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [globalDecimals]);

  const applyImputation = async () => {
    const imputations = Object.entries(imputeSpecs).filter(([_, v]) => v !== '').map(([col, strat]) => ({ column: col, strategy: strat }));
    if (!imputations.length) return;
    setImputing(true);
    try {
      await fetch(`${BACKEND_URL}/dataset/${id}/impute`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ imputations }) });
      setImputeSpecs({});
      await refreshPreviewMetadata(offset);
  setOpMessage(`FILLED MISSING VALUES IN ${imputations.length} COLUMN(S).`);
    } catch (e:any) {
  setOpMessage(`FILL FAILED: ${e.message}`);
    } finally { setImputing(false); }
  };

  const globalMeanImpute = async () => {
    if (!report || !report.dtype_inference) return;
    // Assume numeric columns have dtype entries like 'int' or 'float' or contain 'int'/'float' substring
    const numericCols = Object.entries(report.dtype_inference)
      .filter(([col, dtype]) => typeof dtype === 'string' && /int|float|double|numeric|number/i.test(dtype as string))
      .map(([col]) => col)
      .filter(c => c !== '_rowid');
    if (!numericCols.length) return;
    setImputing(true);
    try {
      const imputations = numericCols.map(c => ({ column: c, strategy: 'mean' }));
      await fetch(`${BACKEND_URL}/dataset/${id}/impute`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ imputations }) });
      await refreshPreviewMetadata(offset);
  setOpMessage(`FILLED ${numericCols.length} NUMERIC COLUMN(S) USING MEAN.`);
    } catch (e:any) {
  setOpMessage(`MEAN FILL FAILED: ${e.message}`);
    } finally { setImputing(false); }
  };

  const applyGlobalImpute = async () => {
    if (!report || !report.dtype_inference) return;
    const strategy = globalImputeStrategy;
    // If strategy is mean/median/mode/zero restrict to numeric where needed (mode can apply to any)
    const cols = Object.entries(report.dtype_inference)
      .filter(([_, dtype]) => {
        if (strategy === 'mode' || strategy === 'constant') return true; // allow all
        if (strategy === 'zero') return /int|float|double|numeric|number/i.test(String(dtype));
        // mean/median numeric only
        return /int|float|double|numeric|number/i.test(String(dtype));
      })
      .map(([col]) => col)
      .filter(c => c !== '_rowid');
    if (!cols.length) return;
    setImputing(true);
    try {
      const imputations = cols.map(c => strategy === 'constant' ? ({ column: c, strategy, constant: globalImputeConstant }) : ({ column: c, strategy }));
      await fetch(`${BACKEND_URL}/dataset/${id}/impute`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ imputations }) });
      await refreshPreviewMetadata(offset);
  setOpMessage(`APPLIED GLOBAL FILL '${strategy.toUpperCase()}' TO ${cols.length} COLUMN(S).`);
    } catch (e:any) {
  setOpMessage(`GLOBAL FILL FAILED: ${e.message}`);
    } finally { setImputing(false); }
  };

  const applyTimeFormatting = async () => {
    const cols = Object.entries(timeColsSelected).filter(([_, v]) => v).map(([c]) => c);
  if (!cols.length) { setOpMessage('NO DATE/TIME COLUMNS SELECTED.'); return; }
    setTimeFormatting(true);
    try {
      const res = await fetch(`${BACKEND_URL}/dataset/${id}/timeformat`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ columns: cols, format: timeFormat }) });
      if (!res.ok) throw new Error('Time format failed');
      await refreshPreviewMetadata(offset);
  setOpMessage(`FORMATTED ${cols.length} DATE/TIME COLUMN(S) AS ${timeFormat.toUpperCase()}.`);
    } catch (e:any) {
  setOpMessage(`TIME FORMATTING FAILED: ${e.message}`);
    } finally { setTimeFormatting(false); }
  };

  const fetchHistory = async () => {
    if (!id) return;
    try {
      const res = await fetch(`${BACKEND_URL}/dataset/${id}/history?limit=200`);
      if (res.ok) {
        const data = await res.json();
        setHistoryEvents(data.events || []);
      }
    } catch (e) {
      /* ignore */
    }
  };

  useEffect(() => { if (showHistory) fetchHistory(); }, [showHistory, id]);

  const applyReprocess = async () => {
    if (!id) return;
    setReprocessing(true);
    try {
      const body = {
        drop_row_missing_threshold: dropThreshold,
        missing_mode: missingMode,
        numeric_fill: numericFill,
        categorical_fill: categoricalFill,
        constant_fill_value: constantFillValue || null,
        lowercase_categoricals: lowercaseCats
      };
      const res = await fetch(`${BACKEND_URL}/dataset/${id}/reprocess`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      if (!res.ok) throw new Error('Reprocess failed');
      await refreshPreviewMetadata(offset);
  setOpMessage('REBUILT FROM ORIGINAL DATA WITH NEW SETTINGS.');
      fetchHistory();
    } catch (e:any) {
      setOpMessage(e.message);
    } finally { setReprocessing(false); }
  };

  return (
    <div className="relative min-h-screen">
      <CanvasBackground />
      <div className="relative z-10">
        {useWorkspaceView ? (
          // New Workspace View
          <div className="h-screen">
            <DatasetWorkspace 
              currentDatasetId={Number(id)} 
              onDatasetChange={(newId) => router.push(`/dataset/${newId}`)}
            />
          </div>
        ) : (
          // Original View (simplified for now)
          <div className="max-w-7xl mx-auto p-8 space-y-12">
            <div className="flex items-center justify-between flex-wrap gap-4">
              <h1 style={{ color: '#111827' }} className="text-3xl font-bold tracking-tight">Dataset #{id}</h1>
              <div className="flex items-center gap-3">
                <button
                  onClick={() => router.push(`/dataset/${id}/graphs`)}
                  className="inline-block px-4 py-2 rounded-lg bg-indigo-600 text-white text-sm hover:bg-indigo-700 transition-colors shadow-sm"
                >Graphs</button>
                <button
                  onClick={() => router.push(`/dataset/${id}/model`)}
                  className="inline-block px-4 py-2 rounded-lg bg-emerald-600 text-white text-sm hover:bg-emerald-700 transition-colors shadow-sm"
                >Model Lab</button>
                <a
                  href={`${BACKEND_URL}/dataset/${id}/download.csv`}
                  className="inline-block px-4 py-2 rounded-lg bg-blue-600 text-white text-sm hover:bg-blue-700 transition-colors shadow-sm"
                >Download CSV</a>
              </div>
            </div>
            
            {/* Basic data preview for original view */}
            {report && <MetadataCard metadata={report} />}
            
            <div className="bg-white/80 backdrop-blur-sm border rounded-xl p-6 shadow-lg">
              <h2 style={{ color: '#111827' }} className="text-lg font-semibold mb-4">Data Preview</h2>
              <DataPreviewTable
                rows={previewRows}
                columns={previewColumns}
                totalRows={totalRows}
                offset={offset}
                limit={limit}
                onPageChange={(newOffset) => {
                  setOffset(newOffset);
                  refreshPreviewMetadata(newOffset);
                }}
                onSaveEdits={saveEdits}
              />
            </div>
          </div>
        )}
        
        {/* Toggle Button */}
  <div className="fixed bottom-12 right-6 z-20">
          <button
            onClick={() => setUseWorkspaceView(!useWorkspaceView)}
            className="bg-indigo-600 hover:bg-indigo-700 text-white p-4 rounded-full shadow-lg transition-colors"
            title={useWorkspaceView ? "Switch to Classic View" : "Switch to Workspace View"}
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
            </svg>
          </button>
        </div>

  {/* Plus Panel for adding canvases/datasets (rendered globally in _app.tsx) */}
      </div>
    </div>
  );
}

