import React from 'react';

interface GraphResultPanelProps {
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
}

const PANEL_CLASS = 'panel-content relative bg-white border border-gray-200 shadow-sm';

export const GraphResultPanel: React.FC<GraphResultPanelProps> = ({ panel, isDragging = false }) => {
  const data = panel.data || {};
  const imageBase64: string | undefined = data.graphData?.image_base64 || data.response?.image_base64;
  const title: string = data.title || 'Independent Variable vs Dependent Variable';
  const datasetLabel: string = data.datasetName || data.datasetId || 'Dataset';
  const independent = data.xColumn || (data.columns?.length ? data.columns.join(', ') : data.column) || 'Independent Variable';
  const dependent = data.yColumn || (data.yColumns?.length ? data.yColumns.join(', ') : data.column) || 'Dependent Variable';
  const generatedAt = data.generatedAt ? new Date(data.generatedAt) : null;
  const metadataRows: Array<{ label: string; value: string }> = [];

  if (data.xColumn) {
    metadataRows.push({ label: 'X Column', value: data.xColumn });
  }
  if (data.yColumn) {
    metadataRows.push({ label: 'Y Column', value: data.yColumn });
  }
  if (!data.yColumn && data.yColumns?.length) {
    metadataRows.push({ label: 'Y Columns', value: data.yColumns.join(', ') });
  }
  if (!data.xColumn && data.columns?.length) {
    metadataRows.push({ label: 'Columns', value: data.columns.join(', ') });
  }
  if (data.groupBy) {
    metadataRows.push({ label: 'Group By', value: data.groupBy });
  }
  if (data.colorBy) {
    metadataRows.push({ label: 'Color By', value: data.colorBy });
  }
  if (data.sizeBy) {
    metadataRows.push({ label: 'Size By', value: data.sizeBy });
  }
  if (data.aggregation) {
    metadataRows.push({ label: 'Aggregation', value: data.aggregation });
  }
  if (data.xLabelOverride) {
    metadataRows.push({ label: 'X Axis Label', value: data.xLabelOverride });
  }
  if (data.yLabelOverride) {
    metadataRows.push({ label: 'Y Axis Label', value: data.yLabelOverride });
  }
  if (data.lineStyle) {
    metadataRows.push({ label: 'Line Style', value: data.lineStyle });
  }
  if (data.lineColor) {
    metadataRows.push({ label: 'Line Color', value: data.lineColor });
  }
  if (data.customPlot?.function) {
    metadataRows.push({ label: 'Custom Function', value: `${data.customPlot.function} (${data.customPlot.module})` });
  }

  return (
    <div
      className={`${PANEL_CLASS} ${isDragging ? 'opacity-90 shadow-md' : ''}`}
      style={{
        width: panel.width,
        height: panel.height,
        pointerEvents: isDragging ? 'none' : 'auto',
        borderRadius: 0
      }}
    >
      <div className="flex h-full flex-col">
        <div className="border-b border-gray-200 bg-gray-50 px-3 py-2">
          <h3 className="text-sm font-medium text-gray-800">{title}</h3>
          <div className="mt-0.5 text-[11px] text-gray-500">
            Dataset: {datasetLabel}
          </div>
          <div className="mt-0.5 text-[10px] uppercase tracking-wide text-gray-400">
            {independent} → {dependent}
          </div>
        </div>

        <div className="flex-1 overflow-auto px-3 py-3">
          {imageBase64 ? (
            <div className="flex h-full w-full flex-col">
              <div className="flex-1 items-center justify-center">
                <img
                  src={`data:image/png;base64,${imageBase64}`}
                  alt={title}
                  className="mx-auto max-h-[360px] max-w-full border border-gray-200 object-contain"
                />
              </div>
              <div className="mt-3 space-y-2 text-xs text-gray-600">
                <div className="flex items-center justify-between">
                  <span>Independent Variable:</span>
                  <span className="font-medium text-gray-800">{independent}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span>Dependent Variable:</span>
                  <span className="font-medium text-gray-800">{dependent}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span>Graph Type:</span>
                  <span className="font-medium text-gray-800">{data.graphType || 'Custom'}</span>
                </div>
                {metadataRows.map((row, index) => (
                  <div key={`${row.label}-${index}`} className="flex items-center justify-between">
                    <span>{row.label}:</span>
                    <span className="font-medium text-gray-800 text-right ml-2">{row.value}</span>
                  </div>
                ))}
                {generatedAt && (
                  <div className="flex items-center justify-between text-[11px] text-gray-500">
                    <span>Generated:</span>
                    <time dateTime={generatedAt.toISOString()}>{generatedAt.toLocaleTimeString()}</time>
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div className="flex h-full items-center justify-center text-sm text-gray-500">
              Graph preview unavailable.
            </div>
          )}
        </div>

        {imageBase64 && (
          <div className="border-t border-gray-200 bg-white px-3 py-2 text-xs">
            <button
              type="button"
              onClick={() => {
                const link = document.createElement('a');
                link.href = `data:image/png;base64,${imageBase64}`;
                link.download = `${title.replace(/\s+/g, '_').toLowerCase() || 'graph'}.png`;
                document.body.appendChild(link);
                link.click();
                document.body.removeChild(link);
              }}
              className="w-full border border-gray-300 px-3 py-2 font-medium uppercase tracking-wide text-gray-700 transition hover:bg-gray-100"
            >
              Download Graph
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

export default GraphResultPanel;
