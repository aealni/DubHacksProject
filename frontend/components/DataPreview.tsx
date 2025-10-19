"use client";
import React, { useState, useEffect } from 'react';
import DataPreviewTable from './DataPreviewTable';

const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:8000';

interface DataPreviewProps {
  file: File;
  onClose: () => void;
  onConfirm: () => void;
  title?: string;
  showUploadButton?: boolean;
}

interface PreviewData {
  preview: {
    columns: string[];
    rows: any[];
    total_rows: number;
  };
  report: {
    duplicates_removed: number;
    rows_dropped_for_missing: number;
    missing_by_column: Record<string, number>;
    dtype_inference: Record<string, string>;
    date_columns_standardized: string[];
    notes: string[];
    header_row_detected: boolean;
    header_quality_score: number;
  };
}

export const DataPreview: React.FC<DataPreviewProps> = ({
  file,
  onClose,
  onConfirm,
  title = "Data Preview",
  showUploadButton = true
}) => {
  const [previewData, setPreviewData] = useState<PreviewData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (file) {
      loadPreview();
    }
  }, [file]);

  const loadPreview = async () => {
    setLoading(true);
    setError(null);

    try {
      const formData = new FormData();
      formData.append('file', file);

      const res = await fetch(`${BACKEND_URL}/preview-file`, {
        method: 'POST',
        body: formData
      });

      if (!res.ok) {
        const errorData = await res.text();
        throw new Error(`Preview failed: ${errorData}`);
      }

      const data = await res.json();
      setPreviewData(data);
    } catch (err: any) {
      setError(err.message || 'Failed to preview file');
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
        <div className="bg-white rounded-lg p-8 max-w-md w-full mx-4">
          <div className="flex items-center justify-center space-x-2">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600"></div>
            <span className="text-gray-700">Loading preview...</span>
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
        <div className="bg-white rounded-lg p-6 max-w-md w-full mx-4">
          <h3 className="text-lg font-semibold text-red-700 mb-4">Preview Error</h3>
          <p className="text-gray-700 mb-4">{error}</p>
          <button
            onClick={onClose}
            className="w-full px-4 py-2 bg-gray-300 text-gray-700 rounded hover:bg-gray-400"
          >
            Close
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg max-w-6xl w-full max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="p-6 border-b">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-xl font-semibold text-gray-900">{title}</h3>
              <p className="text-sm text-gray-600 mt-1">
                📄 {file.name} ({(file.size / 1024 / 1024).toFixed(2)} MB)
              </p>
            </div>
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-gray-600"
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 p-6 overflow-auto">
          {previewData && (
            <div className="space-y-6">
              {/* Processing Summary */}
              <div className="bg-gray-50 rounded-lg p-4">
                <h4 className="font-medium text-gray-900 mb-3">Processing Summary</h4>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                  <div>
                    <span className="text-gray-600">Total Rows:</span>
                    <div className="font-semibold">{previewData.preview.total_rows.toLocaleString()}</div>
                  </div>
                  <div>
                    <span className="text-gray-600">Columns:</span>
                    <div className="font-semibold">{previewData.preview.columns.length}</div>
                  </div>
                  <div>
                    <span className="text-gray-600">Duplicates Removed:</span>
                    <div className="font-semibold">{previewData.report.duplicates_removed}</div>
                  </div>
                  <div>
                    <span className="text-gray-600">Missing Data Rows:</span>
                    <div className="font-semibold">{previewData.report.rows_dropped_for_missing}</div>
                  </div>
                </div>

                {previewData.report.date_columns_standardized.length > 0 && (
                  <div className="mt-3">
                    <span className="text-gray-600 text-sm">Date columns standardized:</span>
                    <div className="text-sm text-blue-600 font-medium">
                      {previewData.report.date_columns_standardized.join(', ')}
                    </div>
                  </div>
                )}
              </div>

              {/* Data Preview Table */}
              <div>
                <h4 className="font-medium text-gray-900 mb-3">Data Preview (First 10 rows)</h4>
                <div className="border rounded-lg overflow-hidden">
                  <DataPreviewTable
                    rows={previewData.preview.rows}
                    columns={previewData.preview.columns}
                    totalRows={previewData.preview.total_rows}
                    offset={0}
                    limit={10}
                    maxRows={10}
                  />
                </div>
              </div>

              {/* Column Types */}
              {Object.keys(previewData.report.dtype_inference).length > 0 && (
                <div>
                  <h4 className="font-medium text-gray-900 mb-3">Column Types Detected</h4>
                  <div className="bg-gray-50 rounded-lg p-4">
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2 text-sm">
                      {Object.entries(previewData.report.dtype_inference).map(([col, type]) => (
                        <div key={col} className="flex justify-between">
                          <span className="text-gray-700 truncate mr-2">{col}:</span>
                          <span className="font-medium text-blue-600">{type}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-6 border-t bg-gray-50">
          <div className="flex justify-end space-x-3">
            <button
              onClick={onClose}
              className="px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50"
            >
              Cancel
            </button>
            {showUploadButton && (
              <button
                onClick={onConfirm}
                className="px-6 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 font-medium"
              >
                Upload Dataset
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default DataPreview;