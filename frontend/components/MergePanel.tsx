import React, { useEffect, useMemo, useState } from 'react';
import { MergeUpload } from './MergeUpload';

interface MergePanelProps {
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
  onMergeCompleted?: (result: any) => void;
  onOpenDataset?: (datasetId: number) => void;
  isDragging?: boolean;
}

export const MergePanel: React.FC<MergePanelProps> = ({
  panel,
  onPanelUpdate,
  onMergeCompleted,
  onOpenDataset,
  isDragging = false
}) => {
  const resolvedDatasetId = useMemo(() => {
    const rawId = panel.data?.datasetId ?? panel.data?.dataset_id ?? panel.data?.id;
    const numericId = Number(rawId);
    return Number.isFinite(numericId) ? numericId : null;
  }, [panel.data]);

  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [lastResult, setLastResult] = useState<any | null>(null);
  const [isResizing, setIsResizing] = useState(false);
  const [resizeType, setResizeType] = useState<string>('');
  const [resizeStart, setResizeStart] = useState({
    x: 0,
    y: 0,
    width: 0,
    height: 0,
    panelX: 0,
    panelY: 0
  });

  const isExpanded = panel.isExpanded ?? true;

  const handleResizeStart = (e: React.MouseEvent, type: string) => {
    e.preventDefault();
    e.stopPropagation();
    setIsResizing(true);
    setResizeType(type);
    setResizeStart({
      x: e.clientX,
      y: e.clientY,
      width: panel.width,
      height: panel.height,
      panelX: panel.x,
      panelY: panel.y
    });
  };

  useEffect(() => {
    if (!isResizing) return;

    const handleMouseMove = (e: MouseEvent) => {
      const deltaX = e.clientX - resizeStart.x;
      const deltaY = e.clientY - resizeStart.y;

      const updates: any = {};

      if (resizeType.includes('e')) {
        updates.width = Math.max(320, resizeStart.width + deltaX);
      }
      if (resizeType.includes('s')) {
        updates.height = Math.max(240, resizeStart.height + deltaY);
      }
      if (resizeType.includes('w')) {
        const newWidth = Math.max(320, resizeStart.width - deltaX);
        const widthDiff = newWidth - resizeStart.width;
        updates.width = newWidth;
        updates.x = resizeStart.panelX - widthDiff;
      }
      if (resizeType.includes('n')) {
        const newHeight = Math.max(200, resizeStart.height - deltaY);
        const heightDiff = newHeight - resizeStart.height;
        updates.height = newHeight;
        updates.y = resizeStart.panelY - heightDiff;
      }

      if (Object.keys(updates).length > 0) {
        onPanelUpdate(panel.id, updates);
      }
    };

    const handleMouseUp = () => {
      setIsResizing(false);
      setResizeType('');
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isResizing, resizeStart, resizeType, onPanelUpdate, panel.id]);

  const handleMergeSuccess = (result: any) => {
    setLastResult(result);
    setStatusMessage(result?.merge_summary || 'Merge completed successfully.');
    if (onMergeCompleted) {
      onMergeCompleted(result);
    }
  };

  const handleOpenMergedDataset = () => {
    if (!lastResult) return;
    const datasetId = Number(lastResult?.dataset_id);
    if (Number.isFinite(datasetId) && onOpenDataset) {
      onOpenDataset(datasetId);
    }
  };

  return (
    <div
      className={`panel-content relative bg-white border border-gray-200 shadow-sm overflow-hidden ${
        isDragging ? 'opacity-90 shadow-md' : ''
      }`}
      style={{
        width: panel.width,
        height: panel.height,
        pointerEvents: isDragging ? 'none' : 'auto'
      }}
    >
      <div className="flex h-full flex-col">
        <div className="bg-gray-50 px-3 py-2 border-b border-gray-200">
          <div className="flex items-center gap-2">
            <div className="h-2.5 w-2.5 bg-gray-400" />
            <h3 className="text-sm font-medium text-gray-800">Merge &amp; Join</h3>
          </div>
        </div>

        {isExpanded ? (
          <div className="scrollable-content flex-1 space-y-3 overflow-y-auto p-3">
            {!resolvedDatasetId ? (
              <div className="border border-gray-300 bg-gray-100 p-3 text-sm text-gray-700">
                Unable to determine the target dataset. Please reopen the merge panel from a dataset card.
              </div>
            ) : (
              <>
                {statusMessage && (
                  <div className="border border-gray-300 bg-gray-100 p-3 text-sm text-gray-700">
                    {statusMessage}
                  </div>
                )}

                <MergeUpload
                  datasetId={resolvedDatasetId}
                  onSuccess={handleMergeSuccess}
                  variant="panel"
                />

                {lastResult && (
                  <div className="space-y-2 border border-gray-300 bg-white p-3 text-sm text-gray-700">
                    <div className="text-sm font-semibold text-gray-800">Last merge summary</div>
                    <div className="text-xs text-gray-600">{lastResult.merge_summary}</div>
                    <div className="grid grid-cols-2 gap-2 text-[11px] text-gray-600">
                      <div>
                        <span className="block uppercase tracking-wide text-gray-500">Rows Added</span>
                        <span className="text-sm font-medium text-gray-800">{lastResult.rows_added?.toLocaleString?.() ?? String(lastResult.rows_added ?? '-')}</span>
                      </div>
                      <div>
                        <span className="block uppercase tracking-wide text-gray-500">Columns Added</span>
                        <span className="text-sm font-medium text-gray-800">{lastResult.cols_added ?? '-'}</span>
                      </div>
                      <div>
                        <span className="block uppercase tracking-wide text-gray-500">Total Rows</span>
                        <span className="text-sm font-medium text-gray-800">{lastResult.total_rows?.toLocaleString?.() ?? String(lastResult.total_rows ?? '-')}</span>
                      </div>
                      <div>
                        <span className="block uppercase tracking-wide text-gray-500">Strategy</span>
                        <span className="text-sm font-medium uppercase text-gray-800">{lastResult.merge_strategy}</span>
                      </div>
                    </div>
                    {onOpenDataset && (
                      <button
                        type="button"
                        onClick={handleOpenMergedDataset}
                        className="inline-flex items-center justify-center border border-gray-400 px-3 py-1.5 text-xs font-medium text-gray-700 transition hover:bg-gray-100"
                      >
                        Open resulting dataset
                      </button>
                    )}
                  </div>
                )}
              </>
            )}
          </div>
        ) : (
          <div className="flex-1 flex items-center justify-center text-xs text-gray-500">Panel collapsed</div>
        )}
      </div>

      {isExpanded && (
        <>
          <div
            className="absolute top-0 left-0 w-3 h-3 cursor-nw-resize"
            style={{ background: 'transparent' }}
            onMouseDown={(e) => handleResizeStart(e, 'nw')}
            title="Resize from top-left corner"
          />
          <div
            className="absolute top-0 right-0 w-3 h-3 cursor-ne-resize"
            style={{ background: 'transparent' }}
            onMouseDown={(e) => handleResizeStart(e, 'ne')}
            title="Resize from top-right corner"
          />
          <div
            className="absolute bottom-0 left-0 w-3 h-3 cursor-sw-resize"
            style={{ background: 'transparent' }}
            onMouseDown={(e) => handleResizeStart(e, 'sw')}
            title="Resize from bottom-left corner"
          />
          <div
            className="absolute bottom-0 right-0 w-3 h-3 cursor-se-resize"
            style={{ background: 'transparent' }}
            onMouseDown={(e) => handleResizeStart(e, 'se')}
            title="Resize from bottom-right corner"
          />

          <div
            className="absolute top-0 left-3 right-3 h-2 cursor-n-resize"
            style={{ background: 'transparent' }}
            onMouseDown={(e) => handleResizeStart(e, 'n')}
            title="Resize from top edge"
          />
          <div
            className="absolute bottom-0 left-3 right-3 h-2 cursor-s-resize"
            style={{ background: 'transparent' }}
            onMouseDown={(e) => handleResizeStart(e, 's')}
            title="Resize from bottom edge"
          />
          <div
            className="absolute left-0 top-3 bottom-3 w-2 cursor-w-resize"
            style={{ background: 'transparent' }}
            onMouseDown={(e) => handleResizeStart(e, 'w')}
            title="Resize from left edge"
          />
          <div
            className="absolute right-0 top-3 bottom-3 w-2 cursor-e-resize"
            style={{ background: 'transparent' }}
            onMouseDown={(e) => handleResizeStart(e, 'e')}
            title="Resize from right edge"
          />
        </>
      )}
    </div>
  );
};

export default MergePanel;
