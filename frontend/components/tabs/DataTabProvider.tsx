import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { create } from 'zustand';
import { subscribeWithSelector } from 'zustand/middleware';
import { TabProviderProps, DataTabContextValue } from '../../types/tabs';
import { useTabsStore } from '../../stores/tabsStore';

// Data grid store interface
interface PendingEdit {
  rowid: number;
  column: string;
  value: any;
}

interface DataTabStore {
  tabId: string;
  datasetId: string | null;
  isDirty: boolean;

  // State
  datasets: any[];
  selectedDataset: any | null;
  gridData: any[];
  originalGridData: any[];
  rawOriginalGridData: any[];
  columns: Array<{ key: string; label: string; type?: string }>;
  filters: any[];
  sortConfig: { column: string; direction: 'asc' | 'desc' } | null;
  pendingEdits: Record<string, PendingEdit>;
  totalRows: number;
  totalColumns: number;
  isLoading: boolean;
  isSaving: boolean;
  error: string | null;

  // Actions
  markDirty: () => void;
  markClean: () => void;
  loadDataset: (datasetId: string) => Promise<void>;
  updateCell: (rowIndex: number, columnKey: string, value: string) => void;
  addFilter: (filter: any) => void;
  removeFilter: (filterId: string) => void;
  setSortConfig: (config: any) => void;
  savePendingEdits: () => Promise<boolean>;
  discardPendingEdits: () => Promise<void>;
  setError: (message: string | null) => void;
  cleanup: () => void;
}

const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:8000';

const broadcastDatasetUpdate = (datasetId: string | number | null | undefined, source: string) => {
  if (typeof window === 'undefined') {
    return;
  }

  if (datasetId === null || datasetId === undefined) {
    return;
  }

  const numericId = Number(datasetId);
  const payload = Number.isFinite(numericId) ? numericId : datasetId;

  try {
    window.dispatchEvent(new CustomEvent('dataset-updated', {
      detail: { datasetId: payload, source }
    }));
  } catch (error) {
    console.error('[DataTabProvider] Failed to broadcast dataset update', error);
  }
};

type ColumnDefinition = DataTabStore['columns'][number];
type GridRow = Record<string, any>;

// Create namespaced data store factory
const createDataTabStore = (tabId: string) => create<DataTabStore>()(
  subscribeWithSelector((set, get) => ({
    tabId,
    datasetId: null,
    isDirty: false,
    datasets: [],
    selectedDataset: null,
    gridData: [],
    originalGridData: [],
    rawOriginalGridData: [],
    columns: [],
    filters: [],
    sortConfig: null,
    pendingEdits: {},
  totalRows: 0,
  totalColumns: 0,
    isLoading: false,
    isSaving: false,
    error: null,

    markDirty: () => {
      set({ isDirty: true });
      useTabsStore.getState().markTabDirty(tabId);
    },

    markClean: () => {
      set({ isDirty: false });
      useTabsStore.getState().markTabClean(tabId);
    },

    setError: (message: string | null) => {
      set({ error: message });
    },

    loadDataset: async (datasetId: string) => {
      set({ isLoading: true, error: null, datasetId });
      try {
        const requestOptions: RequestInit = { cache: 'no-store' };
        const [previewRes, metadataRes, infoRes] = await Promise.all([
          fetch(`${BACKEND_URL}/dataset/${datasetId}/preview?limit=200&offset=0`, requestOptions),
          fetch(`${BACKEND_URL}/dataset/${datasetId}/metadata`, requestOptions),
          fetch(`${BACKEND_URL}/dataset/${datasetId}`, requestOptions)
        ]);

        if (!previewRes.ok) {
          throw new Error('Failed to load dataset preview');
        }

        const previewJson = await previewRes.json();
        const preview = previewJson.preview || previewJson;
        const rows = preview.rows || [];
        const columnsFromApi = preview.columns || [];
        const metadataJson = metadataRes.ok ? await metadataRes.json() : null;
        const infoJson = infoRes.ok ? await infoRes.json() : null;

        const normalizeRow = (row: any) => {
          const normalized: Record<string, any> = {};
          Object.entries(row).forEach(([key, value]) => {
            if (key === '_rowid') {
              normalized[key] = value;
            } else if (value === null || value === undefined) {
              normalized[key] = '';
            } else {
              normalized[key] = String(value);
            }
          });
          return normalized;
        };

        const normalizedRows = rows.map(normalizeRow);
        const columnDefs = columnsFromApi.map((key: string) => ({
          key,
          label: key,
          type: typeof rows[0]?.[key]
        }));

        const datasetName = infoJson?.name || infoJson?.original_filename || `Dataset ${datasetId}`;
        const totalRows = typeof preview.total_rows === 'number' ? preview.total_rows : normalizedRows.length;
        const totalColumns = columnDefs.length;

        set({
          selectedDataset: {
            id: datasetId,
            name: datasetName,
            meta: metadataJson
          },
          gridData: normalizedRows,
          originalGridData: normalizedRows.map((row: any) => ({ ...row })),
          rawOriginalGridData: rows.map((row: any) => ({ ...row })),
          columns: columnDefs,
          filters: [],
          sortConfig: null,
          pendingEdits: {},
          totalRows,
          totalColumns,
          isLoading: false,
          error: null
        });

        useTabsStore.getState().updateTabTitle(tabId, `Data · ${datasetName}`);
        get().markClean();
      } catch (error) {
        console.error('Failed to load dataset:', error);
        set({ isLoading: false, error: error instanceof Error ? error.message : 'Failed to load dataset' });
      }
    },

    updateCell: (rowIndex: number, columnKey: string, value: string) => {
      const {
        gridData,
        originalGridData,
        rawOriginalGridData,
        pendingEdits
      } = get();

      const currentRow = gridData[rowIndex];
      if (!currentRow || columnKey === '_rowid') return;

      const nextRows = [...gridData];
      const updatedRow = { ...currentRow, [columnKey]: value };
      nextRows[rowIndex] = updatedRow;

      const rowid = Number(currentRow._rowid ?? rawOriginalGridData[rowIndex]?._rowid);
      if (!Number.isFinite(rowid)) return;

      const originalNormalized = originalGridData[rowIndex]?.[columnKey] ?? '';
      const originalRaw = rawOriginalGridData[rowIndex]?.[columnKey];
      const editKey = `${rowid}:${columnKey}`;

      const coerceValueForSave = (input: string, original: any) => {
        const trimmed = input;
        if (trimmed === '') return null;
        if (typeof original === 'number') {
          const numeric = Number(trimmed);
          return Number.isNaN(numeric) ? trimmed : numeric;
        }
        if (typeof original === 'boolean') {
          const lowered = trimmed.toLowerCase();
          if (lowered === 'true' || lowered === 'false') {
            return lowered === 'true';
          }
        }
        return trimmed;
      };

      const nextPending = { ...pendingEdits };
      if (value === originalNormalized) {
        delete nextPending[editKey];
      } else {
        nextPending[editKey] = {
          rowid,
          column: columnKey,
          value: coerceValueForSave(value, originalRaw)
        };
      }

      set({ gridData: nextRows, pendingEdits: nextPending });

      if (Object.keys(nextPending).length > 0) {
        get().markDirty();
      } else {
        get().markClean();
      }
    },

    addFilter: (filter: any) => {
      const { filters } = get();
      set({ filters: [...filters, filter] });
      get().markDirty();
    },

    removeFilter: (filterId: string) => {
      const { filters } = get();
      set({ filters: filters.filter((f: any) => f.id !== filterId) });
      get().markDirty();
    },

    setSortConfig: (config: any) => {
      set({ sortConfig: config });
    },

    savePendingEdits: async () => {
      const {
        pendingEdits,
        selectedDataset,
        datasetId
      } = get();

      if (!selectedDataset?.id || Object.keys(pendingEdits).length === 0) {
        return false;
      }

      set({ isSaving: true, error: null });
      try {
        const response = await fetch(`${BACKEND_URL}/dataset/${selectedDataset.id}/cells`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({ edits: Object.values(pendingEdits) })
        });

        if (!response.ok) {
          const errorText = await response.text();
          throw new Error(errorText || 'Failed to save edits');
        }

        set({ pendingEdits: {}, isSaving: false });
        get().markClean();
        if (datasetId) {
          await get().loadDataset(datasetId);
        }
        broadcastDatasetUpdate(selectedDataset?.id ?? datasetId, 'data-tab');
        return true;
      } catch (error) {
        console.error('Failed to save dataset edits:', error);
        set({ isSaving: false, error: error instanceof Error ? error.message : 'Failed to save edits' });
        return false;
      }
    },

    discardPendingEdits: async () => {
      const { datasetId } = get();
      if (datasetId) {
        await get().loadDataset(datasetId);
      }
    },

    cleanup: () => {
      console.log(`Cleaning up data tab: ${tabId}`);
      set({
        datasetId: null,
        isDirty: false,
        datasets: [],
        selectedDataset: null,
        gridData: [],
        originalGridData: [],
        rawOriginalGridData: [],
        columns: [],
        filters: [],
        sortConfig: null,
        pendingEdits: {},
  totalRows: 0,
  totalColumns: 0,
        isLoading: false,
        isSaving: false,
        error: null
      });
    }
  }))
);

// Store registry
const dataStoreRegistry = new Map<string, ReturnType<typeof createDataTabStore>>();

const getDataStore = (tabId: string) => {
  if (!dataStoreRegistry.has(tabId)) {
    dataStoreRegistry.set(tabId, createDataTabStore(tabId));
  }
  return dataStoreRegistry.get(tabId)!;
};

const cleanupDataStore = (tabId: string) => {
  const store = dataStoreRegistry.get(tabId);
  if (store) {
    store.getState().cleanup();
    dataStoreRegistry.delete(tabId);
  }
};

// Data tab context
const DataTabContext = createContext<DataTabContextValue | null>(null);

export const useDataTab = () => {
  const context = useContext(DataTabContext);
  if (!context) {
    throw new Error('useDataTab must be used within a DataTabProvider');
  }
  return context;
};

// Data grid component
const DataGridContent: React.FC = () => {
  const { tabId, dataState, dataActions } = useDataTab();
  const {
    gridData,
    columns,
    selectedDataset,
    pendingEdits,
    isLoading,
    isSaving,
    error,
    totalRows,
    totalColumns
  } = dataState;

  const [lastSavedAt, setLastSavedAt] = useState<number | null>(null);

  const displayColumns = useMemo<ColumnDefinition[]>(
    () => columns.filter((column: ColumnDefinition) => column.key !== '_rowid'),
    [columns]
  );
  const displayRows = useMemo<GridRow[]>(() => gridData.slice(0, 200), [gridData]);
  const pendingCount = useMemo(() => Object.keys(pendingEdits).length, [pendingEdits]);
  const hasPendingChanges = pendingCount > 0;

  useEffect(() => {
    if (hasPendingChanges) {
      setLastSavedAt(null);
    }
  }, [hasPendingChanges]);

  const statusText = useMemo(() => {
    if (isSaving) {
      return 'Saving changes…';
    }
    if (hasPendingChanges) {
      return `${pendingCount} pending ${pendingCount === 1 ? 'change' : 'changes'}`;
    }
    if (lastSavedAt) {
      return `Saved at ${new Date(lastSavedAt).toLocaleTimeString()}`;
    }
    return 'No pending edits';
  }, [hasPendingChanges, isSaving, lastSavedAt, pendingCount]);

  const handleSave = async () => {
    if (isSaving || isLoading || !hasPendingChanges) {
      return;
    }
    const didSave = await dataActions.savePendingEdits();
    if (didSave) {
      setLastSavedAt(Date.now());
    }
  };

  const handleDiscard = async () => {
    if (isSaving || isLoading || !hasPendingChanges) {
      return;
    }
    await dataActions.discardPendingEdits();
    setLastSavedAt(null);
  };
  return (
    <div className="relative flex h-full w-full flex-col bg-white">
      <div className="flex items-center border-b border-gray-200 px-3 py-2">
        <div className="flex flex-col">
          <div className="flex items-center gap-2">
            <h2 className="text-sm font-semibold text-gray-900">Data Grid</h2>
            <span className="rounded border border-gray-300 bg-white px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-gray-500">
              Tab {tabId.slice(-4)}
            </span>
          </div>
          <div className="mt-0.5 text-xs text-gray-500">
            {selectedDataset ? (
              <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                <span className="font-medium text-gray-700">{selectedDataset.name}</span>
                <span className="text-gray-300">•</span>
                <span>{totalRows.toLocaleString()} rows</span>
                <span className="text-gray-300">•</span>
                <span>{totalColumns} columns</span>
              </div>
            ) : (
              'Select or upload a dataset to begin'
            )}
          </div>
        </div>
      </div>

      {error && (
        <div className="border-b border-gray-200 bg-gray-100 px-3 py-2 text-xs text-gray-700">
          {error}
        </div>
      )}

      {isLoading ? (
        <div className="flex flex-1 items-center justify-center text-sm text-gray-500">
          <div className="flex items-center gap-2">
            <div className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-gray-400 border-t-transparent" />
            <span>Loading dataset…</span>
          </div>
        </div>
      ) : !selectedDataset ? (
        <div className="flex flex-1 items-center justify-center px-6 text-center text-sm text-gray-500">
          <div>
            <p className="font-medium text-gray-600">No dataset loaded</p>
            <p className="text-xs text-gray-500">
              Upload a dataset or open one from the workspace to view and edit it here.
            </p>
          </div>
        </div>
      ) : displayRows.length === 0 ? (
        <div className="flex flex-1 items-center justify-center text-sm text-gray-500">
          No preview rows available.
        </div>
      ) : (
        <div className="flex-1 overflow-auto">
          <table className="min-w-full border-collapse text-sm">
            <thead className="sticky top-0 bg-gray-50">
              <tr>
                <th className="border-b border-gray-200 bg-gray-100 px-3 py-2 text-left text-[11px] font-medium uppercase tracking-wide text-gray-500">
                  Row
                </th>
                {displayColumns.map((column: ColumnDefinition) => (
                  <th
                    key={column.key}
                    className="border-b border-gray-200 px-3 py-2 text-left text-[11px] font-medium uppercase tracking-wide text-gray-500"
                  >
                    {column.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {displayRows.map((row: GridRow, rowIndex: number) => {
                const rowid = Number(row._rowid ?? rowIndex + 1);
                const rowLabel = Number.isFinite(rowid) ? rowid : rowIndex + 1;
                return (
                  <tr key={`${rowLabel}-${rowIndex}`} className="border-b border-gray-100">
                    <td className="bg-gray-50 px-3 py-2 text-[11px] font-mono text-gray-500">
                      {rowLabel}
                    </td>
                    {displayColumns.map((column: ColumnDefinition) => {
                      const cellKey = `${rowid}:${column.key}`;
                      const isEdited = Boolean(pendingEdits[cellKey]);
                      const value = row[column.key] ?? '';
                      return (
                        <td key={column.key} className="px-0 align-top">
                          <input
                            value={value}
                            onChange={(event) => dataActions.updateCell(rowIndex, column.key, event.target.value)}
                            className={`w-full border border-transparent px-3 py-2 text-sm text-gray-800 outline-none transition focus:border-gray-400 focus:bg-gray-50 ${
                              isEdited ? 'bg-gray-100 border-gray-400' : ''
                            }`}
                          />
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {selectedDataset && (
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-gray-200 bg-gray-50 px-3 py-2 text-[11px] text-gray-600">
          <div className="flex items-center gap-2">
            <span
              className={`font-medium ${
                isSaving
                  ? 'text-gray-800'
                  : hasPendingChanges
                    ? 'text-amber-700'
                    : 'text-gray-600'
              }`}
            >
              {statusText}
            </span>
            {hasPendingChanges && !isSaving && (
              <span className="rounded bg-amber-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-700">
                Unsaved
              </span>
            )}
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => void handleDiscard()}
              disabled={!hasPendingChanges || isSaving || isLoading}
              className="border border-gray-300 px-2.5 py-1 text-[11px] font-medium text-gray-600 transition hover:bg-gray-100 disabled:cursor-not-allowed disabled:border-gray-200 disabled:text-gray-400"
            >
              Discard
            </button>
            <button
              type="button"
              onClick={() => void handleSave()}
              disabled={!hasPendingChanges || isSaving || isLoading}
              className="border border-gray-900 bg-gray-900 px-3 py-1 text-[11px] font-semibold uppercase tracking-wide text-white transition hover:bg-black disabled:cursor-not-allowed disabled:border-gray-300 disabled:bg-gray-300 disabled:text-gray-500"
            >
              {isSaving ? 'Saving…' : 'Save'}
            </button>
          </div>
        </div>
      )}

    </div>
  );
};

// Data tab provider
const DataTabProvider: React.FC<TabProviderProps> = ({ 
  tabId, 
  isActive, 
  children 
}) => {
  const dataStore = getDataStore(tabId);
  const state = dataStore();
  // Try to auto-load dataset if the tab has meta indicating a datasetId
  const tab = useTabsStore(state => state.tabs.find(t => t.id === tabId));
  const [loadedDatasetId, setLoadedDatasetId] = useState<string | null>(null);

  React.useEffect(() => {
    const metaDatasetId = tab?.meta?.datasetId;
    if (!metaDatasetId) {
      return;
    }

    const desiredDatasetId = String(metaDatasetId);
    const currentState = dataStore.getState();

    if (currentState.datasetId === desiredDatasetId && currentState.gridData.length > 0) {
      if (loadedDatasetId !== desiredDatasetId) {
        setLoadedDatasetId(desiredDatasetId);
      }
      return;
    }

    if (loadedDatasetId === desiredDatasetId && currentState.isLoading) {
      return;
    }

    setLoadedDatasetId(desiredDatasetId);
    dataStore.getState().loadDataset(desiredDatasetId);
  }, [dataStore, tab?.meta?.datasetId, loadedDatasetId]);

  useEffect(() => {
    return () => {
      if (!isActive) {
        cleanupDataStore(tabId);
      }
    };
  }, [tabId, isActive]);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    const handleDatasetUpdated = (event: Event) => {
      const customEvent = event as CustomEvent<{ datasetId?: number | string; source?: string }>;
      const detail = customEvent.detail;
      if (!detail) return;

      const activeDatasetId = dataStore.getState().datasetId;
      if (!activeDatasetId) {
        return;
      }

      const eventDatasetIdRaw = detail.datasetId;
      if (eventDatasetIdRaw === undefined || eventDatasetIdRaw === null) {
        return;
      }

      const activeIdStr = String(activeDatasetId);
      const eventIdStr = String(eventDatasetIdRaw);

      if (activeIdStr !== eventIdStr) {
        return;
      }

      if (detail.source === 'data-tab') {
        return;
      }

      void dataStore.getState().loadDataset(String(activeDatasetId));
    };

    window.addEventListener('dataset-updated', handleDatasetUpdated as EventListener);
    return () => window.removeEventListener('dataset-updated', handleDatasetUpdated as EventListener);
  }, [dataStore]);

  const contextValue: DataTabContextValue = {
    tabId: state.tabId,
    isDirty: state.isDirty,
    markDirty: state.markDirty,
    markClean: state.markClean,
    cleanup: state.cleanup,
    dataState: {
      datasets: state.datasets,
      selectedDataset: state.selectedDataset,
      gridData: state.gridData,
      columns: state.columns,
      filters: state.filters,
      sortConfig: state.sortConfig,
      pendingEdits: state.pendingEdits,
      totalRows: state.totalRows,
      totalColumns: state.totalColumns,
      isLoading: state.isLoading,
      isSaving: state.isSaving,
      error: state.error
    },
    dataActions: {
      loadDataset: state.loadDataset,
      updateCell: state.updateCell,
      addFilter: state.addFilter,
      removeFilter: state.removeFilter,
      setSortConfig: state.setSortConfig,
      savePendingEdits: state.savePendingEdits,
      discardPendingEdits: state.discardPendingEdits,
      setError: state.setError
    }
  };

  return (
    <DataTabContext.Provider value={contextValue}>
      <div className="h-full w-full">
        {children || <DataGridContent />}
      </div>
    </DataTabContext.Provider>
  );
};

export default DataTabProvider;
