"use client";
import React, { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/router';
import DataPreviewTable from './DataPreviewTable';
import MetadataCard from './MetadataCard';
import MergeUpload from './MergeUpload';
import { throttle } from '../utils/debounce';

const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:8000';

interface Dataset {
  id: number;
  name: string;
  original_filename: string;
  rows_clean: number;
  cols_clean: number;
  upload_date: string;
}

interface RelatedDataset {
  id: number;
  name: string;
  original_filename: string;
  rows_clean: number;
  cols_clean: number;
  relationship: string;
  source_dataset_id?: number;
}

interface DatasetWorkspaceProps {
  currentDatasetId: number;
  onDatasetChange?: (datasetId: number) => void;
}

export const DatasetWorkspace: React.FC<DatasetWorkspaceProps> = ({
  currentDatasetId,
  onDatasetChange
}) => {
  const router = useRouter();
  const mergeParam = router.query.merge;
  const [currentDataset, setCurrentDataset] = useState<Dataset | null>(null);
  const [relatedDatasets, setRelatedDatasets] = useState<RelatedDataset[]>([]);
  const [showSidebar, setShowSidebar] = useState(true);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Preview data states
  const [previewRows, setPreviewRows] = useState<any[]>([]);
  const [previewColumns, setPreviewColumns] = useState<string[]>([]);
  const [totalRows, setTotalRows] = useState<number>(0);
  const [offset, setOffset] = useState(0);
  const [limit, setLimit] = useState(10);
  const [report, setReport] = useState<any | null>(null);

  // All datasets for sidebar
  const [allDatasets, setAllDatasets] = useState<Dataset[]>([]);

  // Data manipulation states
  const [roundSpecs, setRoundSpecs] = useState<Record<string,string>>({});
  const [globalDecimals, setGlobalDecimals] = useState<string>('');
  const [imputeSpecs, setImputeSpecs] = useState<Record<string,string>>({});
  const [globalImputeStrategy, setGlobalImputeStrategy] = useState<string>('mean');
  const [globalImputeConstant, setGlobalImputeConstant] = useState<string>('');
  const [rounding, setRounding] = useState(false);
  const [imputing, setImputing] = useState(false);
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

  // History tracking
  const [showHistory, setShowHistory] = useState(false);
  const [historyEvents, setHistoryEvents] = useState<any[]>([]);

  // Delete confirmation and state
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [datasetToDelete, setDatasetToDelete] = useState<number | null>(null);
  const [deletingDatasets, setDeletingDatasets] = useState<Set<number>>(new Set());

  // Add data modal
  const [showAddData, setShowAddData] = useState(false);

  useEffect(() => {
    if (!router.isReady) return;
    if (!mergeParam) return;
    const shouldOpen = Array.isArray(mergeParam)
      ? mergeParam.some(value => value === '1' || value === 'true')
      : mergeParam === '1' || mergeParam === 'true';
    if (!shouldOpen) return;
    setShowAddData(true);
    const { merge: _merge, ...rest } = router.query;
    router.replace({ pathname: router.pathname, query: rest }, undefined, { shallow: true });
  }, [router.isReady, mergeParam, router.pathname]);

  useEffect(() => {
    if (currentDatasetId) {
      loadWorkspaceData();
      loadAllDatasets();
    }
  }, [currentDatasetId]);

  const loadAllDatasets = async () => {
    try {
      const res = await fetch(`${BACKEND_URL}/datasets?limit=1000`);
      if (res.ok) {
        const data = await res.json();
        setAllDatasets(data.datasets);
      }
    } catch (err) {
      console.error('Failed to load all datasets:', err);
    }
  };

  const loadWorkspaceData = async () => {
    setLoading(true);
    setError(null);

    try {
      // Load current dataset info
      const datasetRes = await fetch(`${BACKEND_URL}/dataset/${currentDatasetId}`);
      if (!datasetRes.ok) throw new Error('Failed to load dataset');
      const dataset = await datasetRes.json();
      setCurrentDataset(dataset);

      // Load related datasets (datasets created from this one or vice versa)
      const relatedRes = await fetch(`${BACKEND_URL}/dataset/${currentDatasetId}/related`);
      if (relatedRes.ok) {
        const related = await relatedRes.json();
        setRelatedDatasets(related);
      }

      // Load preview data
      await loadPreview();

    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const loadPreview = async () => {
    try {
      const [previewRes, metadataRes] = await Promise.all([
        fetch(`${BACKEND_URL}/dataset/${currentDatasetId}/preview?limit=${limit}&offset=${offset}`),
        fetch(`${BACKEND_URL}/dataset/${currentDatasetId}/metadata`)
      ]);
      
      if (!previewRes.ok) throw new Error('Failed to load preview');
      if (!metadataRes.ok) throw new Error('Failed to load metadata');
      
      const previewData = await previewRes.json();
      const metadataData = await metadataRes.json();
      
      setPreviewRows(previewData.preview.rows);
      setPreviewColumns(previewData.preview.columns);
      setTotalRows(previewData.preview.total_rows);
      setReport(metadataData.report);

      // Initialize date/time column selections
      const meta = metadataData.report || {};
      const allCols = previewData.preview.columns || [];
      const init: Record<string, boolean> = {};
      allCols.filter((c: string) => c !== '_rowid').forEach((c: string) => { init[c] = false; });
      if (meta.date_columns_standardized) {
        (meta.date_columns_standardized as string[]).forEach((c: string) => { 
          if (init[c] !== undefined) init[c] = true; 
        });
      }
      if (meta.dtype_inference) {
        Object.entries(meta.dtype_inference).forEach(([col, dt]: any) => {
          if (typeof dt === 'string' && dt.toLowerCase().includes('date') && init[col] !== undefined) {
            init[col] = true;
          }
        });
      }
      setTimeColsSelected(init);
    } catch (err: any) {
      console.error('Preview load error:', err);
    }
  };

  // Data manipulation functions
  const handlePageChange = (newOffset: number) => {
    setOffset(newOffset);
  };

  const saveEdits = async (edits: { rowid: number; column: string; value: any }[], renames?: { old: string; next: string }[]) => {
    try {
      if (edits.length) {
        await fetch(`${BACKEND_URL}/dataset/${currentDatasetId}/cells`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ edits })
        });
      }
      if (renames && renames.length) {
        await fetch(`${BACKEND_URL}/dataset/${currentDatasetId}/columns`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ renames: renames.map(r => ({ old: r.old, new: r.next })) })
        });
      }
      await refreshPreview();
      setOpMessage(`CHANGES SAVED: ${edits.length} VALUE EDIT(S)${renames && renames.length ? ` + ${renames.length} RENAME(S)` : ''}`);
    } catch (e: any) {
      setOpMessage(`Save failed: ${e.message}`);
    }
  };

  const refreshPreview = () => {
    loadPreview();
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
      await fetch(`${BACKEND_URL}/dataset/${currentDatasetId}/round`, { 
        method: 'PATCH', 
        headers: { 'Content-Type': 'application/json' }, 
        body: JSON.stringify({ rounds }) 
      });
      await refreshPreview();
      setOpMessage(`Rounded to ${dec} decimals.`);
      fetchHistory();
    } catch (e: any) {
      setOpMessage(`Rounding failed: ${e.message}`);
    } finally { 
      setRounding(false); 
    }
  };

  // Debounce rounding
  useEffect(() => {
    if (globalDecimals === '') return;
    const t = setTimeout(() => { applyGlobalRounding(globalDecimals); }, 500);
    return () => clearTimeout(t);
  }, [globalDecimals]);

  const applyImputation = async () => {
    const imputations = Object.entries(imputeSpecs).filter(([_, v]) => v !== '').map(([col, strat]) => ({ column: col, strategy: strat }));
    if (!imputations.length) return;
    setImputing(true);
    try {
      await fetch(`${BACKEND_URL}/dataset/${currentDatasetId}/impute`, { 
        method: 'PATCH', 
        headers: { 'Content-Type': 'application/json' }, 
        body: JSON.stringify({ imputations }) 
      });
      setImputeSpecs({});
      await refreshPreview();
      setOpMessage(`FILLED MISSING VALUES IN ${imputations.length} COLUMN(S).`);
      fetchHistory();
    } catch (e: any) {
      setOpMessage(`FILL FAILED: ${e.message}`);
    } finally { 
      setImputing(false); 
    }
  };

  const globalMeanImpute = async () => {
    if (!report || !report.dtype_inference) return;
    const numericCols = Object.entries(report.dtype_inference)
      .filter(([col, dtype]) => typeof dtype === 'string' && /int|float|double|numeric|number/i.test(dtype as string))
      .map(([col]) => col)
      .filter(c => c !== '_rowid');
    if (!numericCols.length) return;
    setImputing(true);
    try {
      const imputations = numericCols.map(c => ({ column: c, strategy: 'mean' }));
      await fetch(`${BACKEND_URL}/dataset/${currentDatasetId}/impute`, { 
        method: 'PATCH', 
        headers: { 'Content-Type': 'application/json' }, 
        body: JSON.stringify({ imputations }) 
      });
      await refreshPreview();
      setOpMessage(`FILLED ${numericCols.length} NUMERIC COLUMN(S) USING MEAN.`);
      fetchHistory();
    } catch (e: any) {
      setOpMessage(`MEAN FILL FAILED: ${e.message}`);
    } finally { 
      setImputing(false); 
    }
  };

  const applyGlobalImpute = async () => {
    if (!report || !report.dtype_inference) return;
    const strategy = globalImputeStrategy;
    const cols = Object.entries(report.dtype_inference)
      .filter(([_, dtype]) => {
        if (strategy === 'mode' || strategy === 'constant') return true;
        if (strategy === 'zero') return /int|float|double|numeric|number/i.test(String(dtype));
        return /int|float|double|numeric|number/i.test(String(dtype));
      })
      .map(([col]) => col)
      .filter(c => c !== '_rowid');
    if (!cols.length) return;
    setImputing(true);
    try {
      const imputations = cols.map(c => strategy === 'constant' ? 
        ({ column: c, strategy, constant: globalImputeConstant }) : 
        ({ column: c, strategy })
      );
      await fetch(`${BACKEND_URL}/dataset/${currentDatasetId}/impute`, { 
        method: 'PATCH', 
        headers: { 'Content-Type': 'application/json' }, 
        body: JSON.stringify({ imputations }) 
      });
      await refreshPreview();
      setOpMessage(`APPLIED GLOBAL FILL '${strategy.toUpperCase()}' TO ${cols.length} COLUMN(S).`);
      fetchHistory();
    } catch (e: any) {
      setOpMessage(`GLOBAL FILL FAILED: ${e.message}`);
    } finally { 
      setImputing(false); 
    }
  };

  const applyTimeFormatting = async () => {
    const cols = Object.entries(timeColsSelected).filter(([_, v]) => v).map(([c]) => c);
    if (!cols.length) { 
      setOpMessage('NO DATE/TIME COLUMNS SELECTED.'); 
      return; 
    }
    setTimeFormatting(true);
    try {
      const res = await fetch(`${BACKEND_URL}/dataset/${currentDatasetId}/timeformat`, { 
        method: 'PATCH', 
        headers: { 'Content-Type': 'application/json' }, 
        body: JSON.stringify({ columns: cols, format: timeFormat }) 
      });
      if (!res.ok) throw new Error('Time format failed');
      await refreshPreview();
      setOpMessage(`FORMATTED ${cols.length} DATE/TIME COLUMN(S) AS ${timeFormat.toUpperCase()}.`);
      fetchHistory();
    } catch (e: any) {
      setOpMessage(`TIME FORMATTING FAILED: ${e.message}`);
    } finally { 
      setTimeFormatting(false); 
    }
  };

  const fetchHistory = async () => {
    if (!currentDatasetId) return;
    try {
      const res = await fetch(`${BACKEND_URL}/dataset/${currentDatasetId}/history?limit=200`);
      if (res.ok) {
        const data = await res.json();
        setHistoryEvents(data.events || []);
      }
    } catch (e) {
      console.error('Failed to fetch history:', e);
    }
  };

  const applyReprocess = async () => {
    if (!currentDatasetId) return;
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
      const res = await fetch(`${BACKEND_URL}/dataset/${currentDatasetId}/reprocess`, { 
        method: 'PUT', 
        headers: { 'Content-Type': 'application/json' }, 
        body: JSON.stringify(body) 
      });
      if (!res.ok) throw new Error('Reprocess failed');
      await refreshPreview();
      setOpMessage('REBUILT FROM ORIGINAL DATA WITH NEW SETTINGS.');
      fetchHistory();
    } catch (e: any) {
      setOpMessage(e.message);
    } finally { 
      setReprocessing(false); 
    }
  };

  const deleteDataset = async (datasetId?: number) => {
    const targetId = datasetId || currentDatasetId;
    
    // Prevent multiple simultaneous delete requests
    if (deletingDatasets.has(targetId)) {
      return;
    }

    // Add to deleting set for optimistic UI
    setDeletingDatasets(prev => new Set(prev).add(targetId));
    
    try {
      // Optimistically update UI - remove from visible list
      setAllDatasets(prev => prev.filter(d => d.id !== targetId));
      setRelatedDatasets(prev => prev.filter(d => d.id !== targetId));
      
      const res = await fetch(`${BACKEND_URL}/dataset/${targetId}`, { 
        method: 'DELETE',
        signal: AbortSignal.timeout(10000) // 10 second timeout
      });
      
      if (!res.ok) {
        throw new Error(`Delete failed: ${res.status} ${res.statusText}`);
      }
      
      setOpMessage('DATASET DELETED SUCCESSFULLY');
      
      // If we deleted the current dataset, navigate to another one
      if (targetId === currentDatasetId) {
        const remainingDatasets = allDatasets.filter(d => d.id !== targetId);
        if (remainingDatasets.length > 0) {
          handleDatasetSwitch(remainingDatasets[0].id);
        } else {
          router.push('/');
        }
      }
      
    } catch (e: any) {
      // Revert optimistic update on error
      await loadAllDatasets();
      setOpMessage(`DELETE FAILED: ${e.message}`);
    } finally {
      // Remove from deleting set
      setDeletingDatasets(prev => {
        const newSet = new Set(prev);
        newSet.delete(targetId);
        return newSet;
      });
      setShowDeleteConfirm(false);
      setDatasetToDelete(null);
    }
  };

  // Throttled delete function to prevent rapid successive calls
  const throttledConfirmDelete = useCallback(
    throttle((datasetId: number, datasetName: string) => {
      // Prevent opening delete dialog if already deleting
      if (deletingDatasets.has(datasetId)) {
        return;
      }
      setDatasetToDelete(datasetId);
      setShowDeleteConfirm(true);
    }, 1000), // Limit to once per second
    [deletingDatasets]
  );

  const confirmDelete = (datasetId: number, datasetName: string) => {
    throttledConfirmDelete(datasetId, datasetName);
  };

  const handleDatasetSwitch = (datasetId: number) => {
    if (onDatasetChange) {
      onDatasetChange(datasetId);
    } else {
      router.push(`/dataset/${datasetId}`);
    }
  };

  useEffect(() => {
    if (currentDatasetId) {
      loadPreview();
    }
  }, [offset, limit, currentDatasetId]);

  useEffect(() => { 
    if (showHistory && currentDatasetId) fetchHistory(); 
  }, [showHistory, currentDatasetId]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600"></div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-4 bg-red-50 border border-red-200 rounded-lg">
        <p className="text-red-700">Error: {error}</p>
      </div>
    );
  }

  return (
    <div className="flex h-full bg-white/80 backdrop-blur-sm">
      {/* Sidebar */}
      <div className={`transition-all duration-300 ${showSidebar ? 'w-80' : 'w-12'} border-r border-gray-200 bg-white/60 backdrop-blur-sm`}>
        <div className="p-4">
          {/* Toggle Button */}
          <button
            onClick={() => setShowSidebar(!showSidebar)}
            className="mb-4 p-2 rounded-lg bg-gray-100 hover:bg-gray-200 transition-colors"
            title={showSidebar ? "Collapse sidebar" : "Expand sidebar"}
          >
            <svg 
              className={`w-5 h-5 transition-transform ${showSidebar ? 'rotate-180' : ''}`} 
              fill="none" 
              stroke="currentColor" 
              viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </button>

          {showSidebar && (
            <div className="space-y-4">
              {/* Current Dataset */}
              <div className="space-y-2">
                <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wide">Current Dataset</h3>

                <button
                  onClick={() => router.push(`/dataset/${currentDatasetId}/table`)}
                  className="w-full p-3 bg-yellow-50 hover:bg-yellow-100 border border-yellow-200 rounded-lg text-left transition-colors"
                >
                  <div className="font-medium text-yellow-900 text-sm">📋 Open Sheet</div>
                  <div className="text-xs text-yellow-700 mt-1">Open full spreadsheet view</div>
                </button>
                {currentDataset && (
                  <div className="p-3 bg-indigo-50 border border-indigo-200 rounded-lg">
                    <h4 className="font-medium text-indigo-900 text-sm">{currentDataset.name}</h4>
                    <p className="text-xs text-indigo-700 mt-1">{currentDataset.original_filename}</p>
                    <div className="flex justify-between text-xs text-indigo-600 mt-2">
                      <span>{currentDataset.rows_clean.toLocaleString()} rows</span>
                      <span>{currentDataset.cols_clean} cols</span>
                    </div>
                  </div>
                )}
              </div>

              {/* All Datasets */}
              <div className="space-y-2">
                <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wide">All Datasets</h3>
                <div className="space-y-2 max-h-96 overflow-y-auto">
                  {allDatasets.map((dataset) => (
                    <div
                      key={dataset.id}
                      className={`relative group border rounded-lg transition-colors ${
                        dataset.id === currentDatasetId 
                          ? 'bg-indigo-50 border-indigo-200' 
                          : 'bg-gray-50 hover:bg-gray-100 border-gray-200'
                      }`}
                    >
                      <button
                        onClick={() => handleDatasetSwitch(dataset.id)}
                        className="w-full text-left p-3"
                      >
                        <h4 className={`font-medium text-sm ${
                          dataset.id === currentDatasetId ? 'text-indigo-900' : 'text-gray-900'
                        }`}>
                          {dataset.name}
                        </h4>
                        <p className="text-xs text-gray-600 mt-1">{dataset.original_filename}</p>
                        <div className="flex justify-between text-xs text-gray-500 mt-2">
                          <span>{dataset.rows_clean.toLocaleString()} rows</span>
                          <span>{dataset.cols_clean} cols</span>
                        </div>
                      </button>
                      
                      {/* Hover Delete Button */}
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          confirmDelete(dataset.id, dataset.name);
                        }}
                        disabled={deletingDatasets.has(dataset.id)}
                        className={`absolute top-2 right-2 transition-opacity text-white rounded-full w-6 h-6 flex items-center justify-center text-xs ${
                          deletingDatasets.has(dataset.id)
                            ? 'opacity-100 bg-gray-400 cursor-not-allowed'
                            : 'opacity-0 group-hover:opacity-100 bg-red-500 hover:bg-red-600'
                        }`}
                        title={deletingDatasets.has(dataset.id) ? 'Deleting...' : `Delete ${dataset.name}`}
                      >
                        {deletingDatasets.has(dataset.id) ? '⏳' : '✕'}
                      </button>
                    </div>
                  ))}
                </div>
              </div>

              {/* Related Datasets */}
              {relatedDatasets.length > 0 && (
                <div className="space-y-2">
                  <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wide">Related Datasets</h3>
                  <div className="space-y-2 max-h-48 overflow-y-auto">
                    {relatedDatasets.map((dataset) => (
                      <div
                        key={dataset.id}
                        className="relative group bg-blue-50 hover:bg-blue-100 border border-blue-200 rounded-lg transition-colors"
                      >
                        <button
                          onClick={() => handleDatasetSwitch(dataset.id)}
                          className="w-full text-left p-3"
                        >
                          <h4 className="font-medium text-blue-900 text-sm">{dataset.name}</h4>
                          <p className="text-xs text-blue-700 mt-1">{dataset.original_filename}</p>
                          <div className="flex justify-between text-xs text-blue-600 mt-2">
                            <span>{dataset.rows_clean.toLocaleString()} rows</span>
                            <span>{dataset.cols_clean} cols</span>
                          </div>
                          <div className="text-xs text-blue-800 mt-1 font-medium">
                            {dataset.relationship}
                          </div>
                        </button>
                        
                        {/* Hover Delete Button */}
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            confirmDelete(dataset.id, dataset.name);
                          }}
                          disabled={deletingDatasets.has(dataset.id)}
                          className={`absolute top-2 right-2 transition-opacity text-white rounded-full w-6 h-6 flex items-center justify-center text-xs ${
                            deletingDatasets.has(dataset.id)
                              ? 'opacity-100 bg-gray-400 cursor-not-allowed'
                              : 'opacity-0 group-hover:opacity-100 bg-red-500 hover:bg-red-600'
                          }`}
                          title={deletingDatasets.has(dataset.id) ? 'Deleting...' : `Delete ${dataset.name}`}
                        >
                          {deletingDatasets.has(dataset.id) ? '⏳' : '✕'}
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Workspace Actions */}
              <div className="space-y-2">
                <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wide">Actions</h3>
                
                <button
                  onClick={() => setShowAddData(true)}
                  className="w-full p-3 bg-blue-50 hover:bg-blue-100 border border-blue-200 rounded-lg text-left transition-colors"
                >
                  <div className="font-medium text-blue-900 text-sm">📂 Add Data</div>
                  <div className="text-xs text-blue-700 mt-1">Merge or keep separate</div>
                </button>
                
                <button
                  onClick={() => router.push(`/dataset/${currentDatasetId}/graphs`)}
                  className="w-full p-3 bg-green-50 hover:bg-green-100 border border-green-200 rounded-lg text-left transition-colors"
                >
                  <div className="font-medium text-green-900 text-sm">📊 Create Graphs</div>
                  <div className="text-xs text-green-700 mt-1">Visualize your data</div>
                </button>
                
                <button
                  onClick={() => router.push(`/dataset/${currentDatasetId}/model`)}
                  className="w-full p-3 bg-purple-50 hover:bg-purple-100 border border-purple-200 rounded-lg text-left transition-colors"
                >
                  <div className="font-medium text-purple-900 text-sm">🤖 Model Lab</div>
                  <div className="text-xs text-purple-700 mt-1">Train ML models</div>
                </button>

                <button
                  onClick={() => confirmDelete(currentDatasetId, currentDataset?.name || '')}
                  className="w-full p-3 bg-red-50 hover:bg-red-100 border border-red-200 rounded-lg text-left transition-colors"
                >
                  <div className="font-medium text-red-900 text-sm">🗑️ Delete Dataset</div>
                  <div className="text-xs text-red-700 mt-1">Permanently remove</div>
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 p-6 overflow-auto">
        <div className="grid lg:grid-cols-3 gap-8 items-start">
          <div className="lg:col-span-2 space-y-8">
            {/* Dataset Header */}
            {currentDataset && (
              <div className="bg-white/80 backdrop-blur-sm border rounded-xl p-6 shadow-lg">
                <div className="flex items-center justify-between">
                  <div>
                    <h1 style={{ color: '#111827' }} className="text-2xl font-bold tracking-tight">
                      {currentDataset.name}
                    </h1>
                    <p style={{ color: '#6b7280' }} className="text-sm mt-1">
                      {currentDataset.original_filename}
                    </p>
                  </div>
                  <div className="flex items-center gap-3">
                    <a
                      href={`${BACKEND_URL}/dataset/${currentDatasetId}/download.csv`}
                      className="inline-block px-4 py-2 rounded-lg bg-blue-600 text-white text-sm hover:bg-blue-700 transition-colors shadow-sm"
                    >Download CSV</a>
                  </div>
                </div>
              </div>
            )}

            {/* Data Preview */}
            <div className="bg-white/80 backdrop-blur-sm border rounded-xl p-6 shadow-lg">
              <div className="flex items-center justify-between mb-4">
                <h2 style={{ color: '#111827' }} className="text-lg font-semibold">Data Preview</h2>
                <button onClick={() => router.push(`/dataset/${currentDatasetId}/table`)} className="text-sm text-yellow-700 underline">Open sheet</button>
              </div>
              <DataPreviewTable
                rows={previewRows}
                columns={previewColumns}
                totalRows={totalRows}
                offset={offset}
                limit={limit}
                onPageChange={handlePageChange}
                onSaveEdits={saveEdits}
              />
            </div>

            {/* Round Numbers */}
            <div className="bg-white/80 backdrop-blur-sm border rounded-xl p-6 shadow-lg space-y-4">
              <h3 style={{ color: '#111827' }} className="font-semibold text-lg">Round Numbers</h3>
              <div className="flex items-center gap-4 text-sm">
                <label className="flex items-center gap-3">
                  <span style={{ color: '#374151' }} className="font-medium">Decimals:</span>
                  <input 
                    type="number" 
                    min={0} 
                    max={10} 
                    value={globalDecimals} 
                    onChange={e => setGlobalDecimals(e.target.value)} 
                    className="border rounded-lg px-3 py-2 w-24 focus:ring-2 focus:ring-blue-500 focus:border-blue-500" 
                  />
                </label>
                <span style={{ color: '#6b7280' }} className="text-sm">
                  {rounding ? 'Rounding…' : (globalDecimals ? 'Auto applied' : 'Enter a value')}
                </span>
              </div>
              <p style={{ color: '#6b7280' }} className="text-sm">Set the number of decimal places for every numeric column.</p>
            </div>

            {/* Fill Missing Values */}
            <div className="bg-white/80 backdrop-blur-sm border rounded-xl p-6 shadow-lg space-y-6">
              <h3 style={{ color: '#111827' }} className="font-semibold text-lg">Fill Missing Values</h3>
              <p style={{ color: '#6b7280' }} className="text-sm leading-relaxed">
                Choose how to replace blank or missing cells. "Mean" and "Median" work best for numbers. "Mode" picks the most frequent value. "Zero" sets numbers to 0. "Constant" lets you define your own replacement value.
              </p>
              
              <div className="space-y-4">
                <div className="flex flex-wrap items-center gap-4">
                  <label className="flex items-center gap-3">
                    <span style={{ color: '#374151' }} className="font-medium text-sm">Strategy:</span>
                    <select 
                      value={globalImputeStrategy} 
                      onChange={e => setGlobalImputeStrategy(e.target.value)} 
                      className="border border-gray-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors" 
                    >
                      <option value="mean">Mean</option>
                      <option value="median">Median</option>
                      <option value="zero">Zero</option>
                      <option value="mode">Mode</option>
                      <option value="constant">Constant</option>
                    </select>
                  </label>
                  
                  {globalImputeStrategy === 'constant' && (
                    <label className="flex items-center gap-3">
                      <span style={{ color: '#374151' }} className="font-medium text-sm">Value:</span>
                      <input 
                        type="text" 
                        value={globalImputeConstant} 
                        onChange={e => setGlobalImputeConstant(e.target.value)} 
                        className="border border-gray-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors" 
                        placeholder="Enter replacement value"
                      />
                    </label>
                  )}
                  
                  <div className="flex gap-3">
                    <button 
                      onClick={applyGlobalImpute} 
                      disabled={imputing} 
                      className="px-4 py-2 rounded-lg bg-gradient-to-r from-gray-700 to-gray-800 text-white font-medium hover:from-gray-800 hover:to-gray-900 disabled:opacity-40 disabled:cursor-not-allowed transition-all duration-200 shadow-sm hover:shadow-md text-sm"
                    >
                      {imputing ? 'Applying...' : 'Apply Global'}
                    </button>
                    <button 
                      onClick={globalMeanImpute} 
                      disabled={imputing} 
                      className="px-4 py-2 rounded-lg bg-gradient-to-r from-gray-500 to-gray-600 text-white font-medium hover:from-gray-600 hover:to-gray-700 disabled:opacity-40 disabled:cursor-not-allowed transition-all duration-200 shadow-sm hover:shadow-md text-sm"
                    >
                      {imputing ? 'Applying...' : 'Quick Mean (Numeric)'}
                    </button>
                  </div>
                </div>
                
                <div className="border-t pt-4">
                  <p style={{ color: '#6b7280' }} className="text-sm mb-4">
                    Override the global strategy for specific columns:
                  </p>
                  <div className="grid md:grid-cols-3 gap-4">
                    {previewColumns.filter(c => c !== '_rowid').map(c => (
                      <label key={c} className="flex flex-col gap-2">
                        <span style={{ color: '#374151' }} className="text-sm font-medium capitalize">
                          {c.replace(/[_\s]+/g,' ')}
                        </span>
                        <select 
                          value={imputeSpecs[c] ?? ''} 
                          onChange={e => setImputeSpecs(p => ({ ...p, [c]: e.target.value }))} 
                          className="border border-gray-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors"
                        >
                          <option value="">(use global)</option>
                          <option value="mean">Mean</option>
                          <option value="median">Median</option>
                          <option value="zero">Zero</option>
                          <option value="mode">Mode</option>
                          <option value="constant">Constant</option>
                        </select>
                      </label>
                    ))}
                  </div>
                  <button 
                    onClick={applyImputation} 
                    disabled={imputing || Object.values(imputeSpecs).every(v => v==='')} 
                    className="mt-4 px-4 py-2 rounded-lg bg-gradient-to-r from-amber-600 to-orange-600 text-white font-medium hover:from-amber-700 hover:to-orange-700 disabled:opacity-40 disabled:cursor-not-allowed transition-all duration-200 shadow-sm hover:shadow-md text-sm"
                  >
                    {imputing ? 'Applying Column Overrides...' : 'Apply Column Overrides'}
                  </button>
                </div>
              </div>
            </div>
            
            {/* Standardize Dates & Times */}
            <div className="bg-white/80 backdrop-blur-sm border rounded-xl p-6 shadow-lg space-y-6">
              <h3 style={{ color: '#111827' }} className="font-semibold text-lg">Standardize Dates & Times</h3>
              <div className="flex flex-wrap gap-4 items-center">
                <label className="flex items-center gap-3">
                  <span style={{ color: '#374151' }} className="font-medium text-sm">Format:</span>
                  <select 
                    value={timeFormat} 
                    onChange={e => setTimeFormat(e.target.value)} 
                    className="border border-gray-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors"
                  >
                    <option value="iso">ISO 8601</option>
                    <option value="date">YYYY-MM-DD</option>
                    <option value="%Y-%m-%d %H:%M:%S">YYYY-MM-DD HH:mm:ss</option>
                    <option value="epoch_ms">Epoch (ms)</option>
                  </select>
                </label>
                <button 
                  onClick={applyTimeFormatting} 
                  disabled={timeFormatting} 
                  className="px-4 py-2 rounded-lg bg-gradient-to-r from-indigo-600 to-purple-600 text-white font-medium hover:from-indigo-700 hover:to-purple-700 disabled:opacity-40 disabled:cursor-not-allowed transition-all duration-200 shadow-sm hover:shadow-md text-sm"
                >
                  {timeFormatting ? 'Formatting...' : 'Apply Format'}
                </button>
              </div>
              
              <div>
                <p style={{ color: '#6b7280' }} className="text-sm mb-3">
                  Select detected date/time columns to convert to a unified format:
                </p>
                <div className="grid md:grid-cols-3 gap-3">
                  {Object.keys(timeColsSelected).length === 0 && (
                    <p style={{ color: '#9ca3af' }} className="text-sm italic col-span-3">
                      No date/time columns detected.
                    </p>
                  )}
                  {Object.keys(timeColsSelected).map(c => (
                    <label key={c} className="flex items-center gap-3 p-3 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors cursor-pointer">
                      <input 
                        type="checkbox" 
                        checked={!!timeColsSelected[c]} 
                        onChange={e => setTimeColsSelected(p => ({ ...p, [c]: e.target.checked }))} 
                        className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                      />
                      <span style={{ color: '#111827' }} className="text-sm font-medium">
                        {c}
                      </span>
                    </label>
                  ))}
                </div>
              </div>
            </div>

            {/* Reprocess */}
            <div className="mt-6 p-4 border rounded space-y-3 bg-white shadow-sm">
              <h3 className="font-semibold text-xs tracking-wide text-gray-700">REPROCESS (START OVER FROM ORIGINAL)</h3>
              <p className="text-[11px] text-amber-700 bg-amber-50 p-2 rounded">Reprocessing rebuilds the cleaned table from the original upload and ERASES manual edits.</p>
              <div className="grid md:grid-cols-3 gap-3 text-xs">
                <label className="flex flex-col gap-1">DROP ROW THRESHOLD
                  <input type="number" min={0} max={1} step={0.05} value={dropThreshold} onChange={e=>setDropThreshold(Number(e.target.value))} className="border rounded px-2 py-1" />
                </label>
                <label className="flex flex-col gap-1">MISSING HANDLING
                  <select value={missingMode} onChange={e=>setMissingMode(e.target.value)} className="border rounded px-2 py-1">
                    <option value="drop_rows">drop_rows</option>
                    <option value="impute_mean">impute_mean</option>
                    <option value="leave">leave</option>
                  </select>
                </label>
                <label className="flex flex-col gap-1">LOWERCASE TEXT
                  <input type="checkbox" checked={lowercaseCats} onChange={e=>setLowercaseCats(e.target.checked)} />
                </label>
                <label className="flex flex-col gap-1">NUMERIC FILL
                  <select value={numericFill} onChange={e=>setNumericFill(e.target.value)} className="border rounded px-2 py-1">
                    <option value="median">median</option>
                    <option value="mean">mean</option>
                    <option value="zero">zero</option>
                  </select>
                </label>
                <label className="flex flex-col gap-1">TEXT FILL
                  <select value={categoricalFill} onChange={e=>setCategoricalFill(e.target.value)} className="border rounded px-2 py-1">
                    <option value="mode">mode</option>
                    <option value="constant">constant</option>
                  </select>
                </label>
                {categoricalFill === 'constant' && (
                  <label className="flex flex-col gap-1">FILL VALUE
                    <input type="text" value={constantFillValue} onChange={e=>setConstantFillValue(e.target.value)} className="border rounded px-2 py-1" />
                  </label>
                )}
              </div>
              <button onClick={applyReprocess} disabled={reprocessing} className="px-3 py-1 rounded bg-purple-600 text-white text-xs disabled:opacity-40">
                {reprocessing ? 'REBUILDING...' : 'REBUILD FROM ORIGINAL'}
              </button>
            </div>
          </div>
          
          <div className="space-y-6">
            {/* Metadata Cards */}
            {report && <MetadataCard metadata={report} />}
            
            {/* Activity History */}
            <div className="p-4 border rounded space-y-3 bg-white shadow-sm">
              <div className="flex items-center justify-between">
                <h3 className="font-semibold text-xs tracking-wide text-gray-700">ACTIVITY HISTORY</h3>
                <button onClick={() => setShowHistory(s => !s)} className="text-xs underline">
                  {showHistory ? 'Hide' : 'Show'}
                </button>
              </div>
              {showHistory && (
                <div className="max-h-60 overflow-auto text-xs border rounded p-2 bg-gray-50 space-y-1">
                  {historyEvents.length === 0 && <p className="text-gray-500">No events.</p>}
                  {historyEvents.map(ev => (
                    <div key={ev.id} className="flex gap-2 items-center">
                      <span className="text-gray-600">#{ev.id}</span>
                      <span className="font-semibold">{ev.action_type}</span>
                      <span className="text-gray-500">{new Date(ev.created_at).toLocaleString()}</span>
                      {ev.action_type !== 'revert' && (
                        <button
                          className="ml-auto px-2 py-0.5 border rounded text-[10px] hover:bg-white bg-gray-100"
                          title="Revert dataset to state after this operation"
                          onClick={async () => {
                            if(!confirm('Revert dataset to this point? This creates a new history entry.')) return;
                            try {
                              const res = await fetch(`${BACKEND_URL}/dataset/${currentDatasetId}/revert/${ev.id}`, { method: 'PUT' });
                              if(!res.ok) throw new Error('Revert failed');
                              setOpMessage(`REVERTED TO LOG #${ev.id}.`);
                              await refreshPreview();
                              fetchHistory();
                            } catch(e: any) { 
                              setOpMessage('REVERT FAILED: ' + e.message); 
                            }
                          }}
                        >Revert</button>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Operation Messages */}
        {opMessage && (
          <div className={`fixed top-4 right-4 max-w-sm z-50 shadow-lg border rounded px-4 py-3 text-xs flex items-start gap-3 animate-fade-in
            ${/FAILED|ERROR/i.test(opMessage) ? 'bg-red-600 text-white border-red-700' : 'bg-green-600 text-white border-green-700'}`}
            role="status">
            <span className="flex-1 whitespace-pre-line">{opMessage}</span>
            <button aria-label="Close" onClick={() => setOpMessage(null)} className="opacity-80 hover:opacity-100">✕</button>
          </div>
        )}

        {/* Add Data Modal */}
        {showAddData && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-lg max-w-4xl w-full max-h-[90vh] overflow-y-auto">
              <div className="p-4 border-b flex items-center justify-between">
                <h2 className="text-lg font-semibold">Add Data to Dataset</h2>
                <button
                  onClick={() => setShowAddData(false)}
                  className="text-gray-400 hover:text-gray-600"
                >
                  ✕
                </button>
              </div>
              <div className="p-4">
                <MergeUpload
                  datasetId={currentDatasetId}
                  onSuccess={(result) => {
                    setShowAddData(false);
                    if (result.dataset_id === currentDatasetId) {
                      // Data was merged into current dataset
                      refreshPreview();
                      loadAllDatasets(); // Refresh dataset list
                    } else {
                      // New dataset was created (keep_separate)
                      handleDatasetSwitch(result.dataset_id);
                      loadAllDatasets(); // Refresh dataset list
                    }
                  }}
                  onCancel={() => setShowAddData(false)}
                />
              </div>
            </div>
          </div>
        )}

        {/* Delete Confirmation Modal */}
        {showDeleteConfirm && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-lg max-w-md w-full p-6">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">Delete Dataset</h3>
              <p className="text-gray-600 mb-6">
                Are you sure you want to delete{' '}
                <span className="font-semibold">
                  {allDatasets.find(d => d.id === datasetToDelete)?.name || 'this dataset'}
                </span>
                ? This action cannot be undone.
              </p>
              <div className="flex gap-3 justify-end">
                <button
                  onClick={() => {
                    setShowDeleteConfirm(false);
                    setDatasetToDelete(null);
                  }}
                  className="px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  onClick={() => deleteDataset(datasetToDelete || undefined)}
                  className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700"
                >
                  Delete
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default DatasetWorkspace;