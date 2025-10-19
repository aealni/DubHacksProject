import React, { useEffect, useMemo } from 'react';

const PANEL_WIDTH = 240;
const PANEL_HEIGHT = 150;
const BUTTON_CLASS = 'no-drag flex items-center justify-center w-full h-full min-h-0 min-w-0 bg-gray-400 text-white text-[11px] font-semibold uppercase tracking-wide border border-gray-400 rounded-none transition-colors hover:bg-gray-500 focus:outline-none focus-visible:ring-2 focus-visible:ring-gray-300 focus-visible:ring-offset-0 disabled:bg-gray-300 disabled:border-gray-300 disabled:text-gray-200 disabled:cursor-not-allowed';

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

const createButtonHandler = (action: () => void) => (event: React.MouseEvent<HTMLButtonElement>) => {
  event.stopPropagation();
  event.preventDefault();
  action();
};

export const DatasetPanel: React.FC<DatasetPanelProps> = ({
  panel,
  isDragging = false,
  onCreateGraph,
  onCreateModel,
  onOpenDataManipulation,
  onOpenDataEditor,
  onPanelUpdate
}) => {
  void onOpenDataEditor; // intentionally unused in the simplified layout

  const rawDatasetId = panel.data?.dataset_id ?? panel.data?.datasetId ?? panel.data?.id;
  const datasetId = typeof rawDatasetId === 'number' ? rawDatasetId : Number(rawDatasetId);
  const hasDataset = Number.isFinite(datasetId);

  useEffect(() => {
    if (!hasDataset) return;
    const width = PANEL_WIDTH;
    const height = PANEL_HEIGHT;
    if (panel.width !== width || panel.height !== height) {
      onPanelUpdate(panel.id, { width, height });
    }
  }, [hasDataset, panel.height, panel.id, panel.width, onPanelUpdate, panel.isExpanded]);

  const datasetName = panel.data?.name || panel.data?.original_filename || 'Dataset';
  const rows = panel.data?.rows_clean ?? panel.data?.rows ?? panel.data?.n_rows_clean;
  const cols = panel.data?.cols_clean ?? panel.data?.cols ?? panel.data?.n_cols_clean;

  const stats = useMemo(() => {
    const parts: string[] = [];
    if (rows !== undefined && rows !== null) {
      const numericRows = Number(rows);
      parts.push(`Rows: ${Number.isFinite(numericRows) ? numericRows.toLocaleString() : rows}`);
    }
    if (cols !== undefined && cols !== null) {
      const numericCols = Number(cols);
      parts.push(`Cols: ${Number.isFinite(numericCols) ? numericCols : cols}`);
    }
    return parts.join(' · ');
  }, [rows, cols]);

  const handleClean = createButtonHandler(() => {
    if (!hasDataset) return;
    onOpenDataManipulation(datasetId as number);
  });

  const handleMerge = createButtonHandler(() => {
    if (!hasDataset) return;
    if (typeof window !== 'undefined') {
      window.open(`/dataset/${datasetId}?merge=1`, '_blank', 'noopener');
    }
  });

  const handleGraph = createButtonHandler(() => {
    if (!hasDataset) return;
    onCreateGraph(datasetId as number, 'scatter');
  });

  const handleModel = createButtonHandler(() => {
    if (!hasDataset) return;
    onCreateModel(datasetId as number);
  });

  return (
    <div
      className={`panel-content relative bg-white border border-gray-400 shadow-sm rounded-none ${isDragging ? 'opacity-90' : ''}`}
      style={{
        width: panel.width,
        height: panel.height,
        pointerEvents: isDragging ? 'none' : 'auto',
        borderRadius: 0
      }}
    >
      <div className="flex h-full flex-col rounded-none">
        <div className="px-3 py-2 border-b border-gray-300 bg-gray-100 rounded-none">
          <h3 className="text-sm font-semibold text-gray-800 truncate">{datasetName}</h3>
          {stats && <p className="text-[11px] text-gray-500 mt-0.5 truncate">{stats}</p>}
        </div>
  <div className="flex-1 bg-gray-200 p-2 rounded-none">
          <div className="grid h-full grid-cols-2 grid-rows-2 auto-rows-fr gap-2">
            <button type="button" className={BUTTON_CLASS} onClick={handleClean} disabled={!hasDataset}>
              Clean Data
            </button>
            <button type="button" className={BUTTON_CLASS} onClick={handleMerge} disabled={!hasDataset}>
              Merge / Join
            </button>
            <button type="button" className={BUTTON_CLASS} onClick={handleGraph} disabled={!hasDataset}>
              Graph
            </button>
            <button type="button" className={BUTTON_CLASS} onClick={handleModel} disabled={!hasDataset}>
              Model
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default DatasetPanel;