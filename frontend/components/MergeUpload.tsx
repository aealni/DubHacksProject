import React, { useState, useCallback, useEffect } from 'react';
import { useRouter } from 'next/router';

const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:8000';

interface MergeUploadProps {
  datasetId: number;
  onSuccess?: (result: any) => void;
  onCancel?: () => void;
  variant?: 'page' | 'panel';
}

interface MergeInfo {
  current_columns: string[];
  current_rows: number;
  current_cols: number;
  is_multi_source: boolean;
  source_count: number;
  sources: any[];
}

interface PreviewData {
  success: boolean;
  error_message?: string;
  column_analysis: {
    common_columns: string[];
    existing_only: string[];
    new_only: string[];
  };
  new_data_shape: {
    rows: number;
    cols: number;
  };
  preview_rows: any[];
  estimated_result_shape?: {
    rows: number;
    cols: number;
  };
}

export const MergeUpload: React.FC<MergeUploadProps> = ({ datasetId, onSuccess, onCancel, variant = 'page' }) => {
  const router = useRouter();
  const [file, setFile] = useState<File | null>(null);
  const [dragging, setDragging] = useState(false);
  const [mergeStrategy, setMergeStrategy] = useState<'append_below' | 'merge_on_column' | 'keep_separate'>('append_below');
  const [mergeColumn, setMergeColumn] = useState<string>('');
  const [joinType, setJoinType] = useState<'inner' | 'left' | 'right' | 'outer'>('outer');
  const [prefixConflicting, setPrefixConflicting] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [mergeInfo, setMergeInfo] = useState<MergeInfo | null>(null);
  const [previewData, setPreviewData] = useState<PreviewData | null>(null);
  const [showPreview, setShowPreview] = useState(false);
  const [delimiterOption, setDelimiterOption] = useState<'auto' | 'comma' | 'tab' | 'semicolon' | 'space' | 'pipe' | 'custom'>('auto');
  const [customDelimiter, setCustomDelimiter] = useState('');

  // Load merge info on component mount
  useEffect(() => {
    loadMergeInfo();
  }, [datasetId]);

  const loadMergeInfo = async () => {
    try {
      const res = await fetch(`${BACKEND_URL}/dataset/${datasetId}/merge-info`);
      if (!res.ok) throw new Error('Failed to load merge info');
      const data = await res.json();
      setMergeInfo(data);
    } catch (err: any) {
      setError(err.message);
    }
  };

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    const droppedFile = e.dataTransfer.files?.[0];
    if (droppedFile) {
      const ext = droppedFile.name.split('.').pop()?.toLowerCase();
      const allowed = ['csv', 'tsv', 'txt', 'xlsx', 'xls'];
      if (ext && allowed.includes(ext)) {
        setFile(droppedFile);
        setError(null);
      } else {
        setError('Please select a CSV, TSV, TXT, or Excel file');
      }
    }
  }, []);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (selectedFile) {
      const ext = selectedFile.name.split('.').pop()?.toLowerCase();
      const allowed = ['csv', 'tsv', 'txt', 'xlsx', 'xls'];
      if (ext && allowed.includes(ext)) {
        setFile(selectedFile);
        setError(null);
      } else {
        setError('Please select a CSV, TSV, TXT, or Excel file');
      }
    }
  };

  const resolveDelimiterValue = () => {
    switch (delimiterOption) {
      case 'auto':
        return null;
      case 'comma':
        return ',';
      case 'tab':
        return '\\t';
      case 'semicolon':
        return ';';
      case 'space':
        return ' ';
      case 'pipe':
        return '|';
      case 'custom':
        return customDelimiter.length > 0 ? customDelimiter : null;
      default:
        return null;
    }
  };

  const previewMerge = async () => {
    if (!file) return;
    if (delimiterOption === 'custom' && customDelimiter.length === 0) {
      setError('Please provide a custom delimiter before previewing.');
      return;
    }
    
    setLoading(true);
    setError(null);

    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('merge_strategy', mergeStrategy);
      if (mergeColumn) formData.append('merge_column', mergeColumn);
      formData.append('join_type', joinType);
      const delimiterValue = resolveDelimiterValue();
      if (delimiterValue !== null) {
        formData.append('delimiter', delimiterValue);
      }

      const res = await fetch(`${BACKEND_URL}/dataset/${datasetId}/preview-merge`, {
        method: 'POST',
        body: formData
      });

      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.detail || 'Preview failed');
      }

      const data = await res.json();
      setPreviewData(data);
      setShowPreview(true);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const performMerge = async () => {
    if (!file) return;
    if (delimiterOption === 'custom' && customDelimiter.length === 0) {
      setError('Please provide a custom delimiter before uploading.');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('merge_strategy', mergeStrategy);
      if (mergeColumn) formData.append('merge_column', mergeColumn);
      formData.append('join_type', joinType);
      formData.append('prefix_conflicting_columns', prefixConflicting.toString());
      const delimiterValue = resolveDelimiterValue();
      if (delimiterValue !== null) {
        formData.append('delimiter', delimiterValue);
      }

      const res = await fetch(`${BACKEND_URL}/dataset/${datasetId}/add-data`, {
        method: 'POST',
        body: formData
      });

      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.detail || 'Upload failed');
      }

      const result = await res.json();
      
      if (onSuccess) {
        onSuccess(result);
      } else {
        // Navigate to the dataset (could be new dataset if keep_separate)
        router.push(`/dataset/${result.dataset_id}`);
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const getAvailableColumns = () => {
    if (!mergeInfo) return [];
    return mergeInfo.current_columns.filter(col => col !== '_rowid');
  };

  const renderStrategyOptions = () => (
    <div className="space-y-4">
      <div className="space-y-2">
        <label className="block text-sm font-medium text-gray-700">Merge Strategy</label>
        <div className="space-y-2">
          <label className="flex items-center">
            <input
              type="radio"
              value="append_below"
              checked={mergeStrategy === 'append_below'}
              onChange={(e) => setMergeStrategy(e.target.value as any)}
              className="mr-2"
            />
            <span className="text-sm">
              <strong>Append Below</strong> - Stack new data vertically below existing data
            </span>
          </label>
          
          <label className="flex items-center">
            <input
              type="radio"
              value="merge_on_column"
              checked={mergeStrategy === 'merge_on_column'}
              onChange={(e) => setMergeStrategy(e.target.value as any)}
              className="mr-2"
            />
            <span className="text-sm">
              <strong>Merge on Column</strong> - Join data horizontally using a common column
            </span>
          </label>
          
          <label className="flex items-center">
            <input
              type="radio"
              value="keep_separate"
              checked={mergeStrategy === 'keep_separate'}
              onChange={(e) => setMergeStrategy(e.target.value as any)}
              className="mr-2"
            />
            <span className="text-sm">
              <strong>Keep Separate</strong> - Create a new dataset (linked to this one)
            </span>
          </label>
        </div>
      </div>

      {mergeStrategy === 'merge_on_column' && (
        <div className="space-y-4 bg-gray-50 p-4 rounded">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Merge Column
            </label>
            <select
              value={mergeColumn}
              onChange={(e) => setMergeColumn(e.target.value)}
              className="w-full border border-gray-300 rounded px-3 py-2"
              required
            >
              <option value="">Select column to merge on...</option>
              {getAvailableColumns().map(col => (
                <option key={col} value={col}>{col}</option>
              ))}
            </select>
          </div>
          
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Join Type
            </label>
            <select
              value={joinType}
              onChange={(e) => setJoinType(e.target.value as any)}
              className="w-full border border-gray-300 rounded px-3 py-2"
            >
              <option value="outer">Outer Join (keep all rows)</option>
              <option value="inner">Inner Join (only matching rows)</option>
              <option value="left">Left Join (keep existing data rows)</option>
              <option value="right">Right Join (keep new data rows)</option>
            </select>
          </div>
          
          <label className="flex items-center">
            <input
              type="checkbox"
              checked={prefixConflicting}
              onChange={(e) => setPrefixConflicting(e.target.checked)}
              className="mr-2"
            />
            <span className="text-sm">Add prefix to conflicting column names</span>
          </label>
        </div>
      )}
    </div>
  );

  const renderCurrentDatasetInfo = () => (
    <div className={`bg-blue-50 p-4 rounded ${variant === 'panel' ? 'border border-blue-100 shadow-sm' : ''}`}>
      <h3 className="font-medium text-blue-900 mb-2">Current Dataset</h3>
      <div className="text-sm text-blue-800">
        <p><strong>Rows:</strong> {mergeInfo?.current_rows.toLocaleString()}</p>
        <p><strong>Columns:</strong> {mergeInfo?.current_cols}</p>
        {mergeInfo?.is_multi_source && (
          <p><strong>Sources:</strong> {mergeInfo.source_count} data sources</p>
        )}
      </div>
      {mergeInfo?.current_columns && (
        <details className="mt-2">
          <summary className="cursor-pointer text-sm text-blue-700">View columns</summary>
          <div className="mt-1 text-xs text-blue-600 max-h-20 overflow-y-auto">
            {mergeInfo.current_columns.filter(col => col !== '_rowid').join(', ')}
          </div>
        </details>
      )}
    </div>
  );

  const renderPreview = () => {
    if (!showPreview || !previewData) return null;

    return (
      <div className="mt-4 p-4 border rounded bg-gray-50">
        <h3 className="font-medium mb-2">Merge Preview</h3>
        
        {!previewData.success ? (
          <div className="text-red-600 text-sm">
            <strong>Error:</strong> {previewData.error_message}
          </div>
        ) : (
          <div className="space-y-2 text-sm">
            <div>
              <strong>New Data:</strong> {previewData.new_data_shape.rows.toLocaleString()} rows, {previewData.new_data_shape.cols} columns
            </div>
            
            {previewData.estimated_result_shape && (
              <div>
                <strong>Result:</strong> {previewData.estimated_result_shape.rows.toLocaleString()} rows, {previewData.estimated_result_shape.cols} columns
              </div>
            )}
            
            <div>
              <strong>Common Columns:</strong> {previewData.column_analysis.common_columns.length > 0 
                ? previewData.column_analysis.common_columns.join(', ')
                : 'None'}
            </div>
            
            {previewData.column_analysis.new_only.length > 0 && (
              <div>
                <strong>New Columns:</strong> {previewData.column_analysis.new_only.join(', ')}
              </div>
            )}
            
            {previewData.preview_rows.length > 0 && (
              <details>
                <summary className="cursor-pointer">Preview data</summary>
                <div className="mt-2 overflow-x-auto">
                  <table className="min-w-full text-xs">
                    <thead>
                      <tr>
                        {Object.keys(previewData.preview_rows[0]).map(col => (
                          <th key={col} className="border px-2 py-1 bg-gray-200">{col}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {previewData.preview_rows.slice(0, 3).map((row, i) => (
                        <tr key={i}>
                          {Object.values(row).map((val: any, j) => (
                            <td key={j} className="border px-2 py-1">
                              {val !== null && val !== undefined ? String(val) : ''}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </details>
            )}
          </div>
        )}
      </div>
    );
  };

  const containerClasses = variant === 'panel'
    ? 'w-full flex flex-col gap-6'
    : 'max-w-2xl mx-auto p-6 flex flex-col gap-6';

  return (
    <div className={containerClasses}>
      <div className="space-y-2">
        <h2 className="text-xl font-bold text-gray-900 mb-2">Add Data to Dataset</h2>
        <p className="text-gray-600 text-sm">
          Upload additional data and choose how to combine it with your existing dataset.
        </p>
      </div>

  {mergeInfo && variant !== 'panel' && renderCurrentDatasetInfo()}

      <div className="space-y-6">
        {/* File Upload Area */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Select File
          </label>
          <div
            onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
            onDragLeave={() => setDragging(false)}
            onDrop={onDrop}
            className={`border-2 border-dashed rounded p-6 text-center transition-colors ${
              dragging ? 'border-blue-500 bg-blue-50' : 'border-gray-300'
            }`}
          >
            {file ? (
              <div>
                <p className="font-medium text-green-600">📄 {file.name}</p>
                <p className="text-sm text-gray-500">
                  {(file.size / 1024 / 1024).toFixed(2)} MB
                </p>
                <button
                  onClick={() => setFile(null)}
                  className="mt-2 text-sm text-red-600 hover:underline"
                >
                  Remove file
                </button>
              </div>
            ) : (
              <div>
                <p className="mb-2">Drag & drop a CSV, TSV, TXT, or Excel file here</p>
                <p className="text-sm text-gray-500 mb-2">or</p>
                <input
                  type="file"
                  accept=".csv,.tsv,.txt,.xlsx,.xls"
                  onChange={handleFileSelect}
                  className="block w-full text-sm text-gray-500"
                />
              </div>
            )}
          </div>
          <div className="mt-4 space-y-2">
            <label className="block text-sm font-medium text-gray-700">
              Delimiter
            </label>
            <select
              value={delimiterOption}
              onChange={(e) => setDelimiterOption(e.target.value as any)}
              className="w-full border border-gray-300 rounded px-3 py-2 text-sm"
            >
              <option value="auto">Auto detect</option>
              <option value="comma">Comma (,)</option>
              <option value="tab">Tab (\\t)</option>
              <option value="semicolon">Semicolon (;)</option>
              <option value="space">Space</option>
              <option value="pipe">Pipe (|)</option>
              <option value="custom">Custom...</option>
            </select>
            {delimiterOption === 'custom' && (
              <div className="space-y-1">
                <input
                  type="text"
                  value={customDelimiter}
                  onChange={(e) => setCustomDelimiter(e.target.value)}
                  placeholder="Enter delimiter characters"
                  className="w-full border border-gray-300 rounded px-3 py-2 text-sm"
                />
                <p className="text-xs text-gray-500">
                  Leave blank to disable upload. Multi-character delimiters supported.
                </p>
              </div>
            )}
          </div>
        </div>

        {/* Strategy Selection */}
        {renderStrategyOptions()}

        {/* Actions */}
        <div className="flex space-x-3">
          {file && (
            <button
              onClick={previewMerge}
              disabled={loading || (mergeStrategy === 'merge_on_column' && !mergeColumn)}
              className="px-4 py-2 bg-blue-100 text-blue-700 rounded hover:bg-blue-200 disabled:opacity-50"
            >
              {loading ? 'Loading...' : 'Preview Merge'}
            </button>
          )}
          
          {file && showPreview && previewData?.success && (
            <button
              onClick={performMerge}
              disabled={loading || (mergeStrategy === 'merge_on_column' && !mergeColumn)}
              className="px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700 disabled:opacity-50"
            >
              {loading ? 'Uploading...' : 'Perform Merge'}
            </button>
          )}
          
          {onCancel && (
            <button
              onClick={onCancel}
              className="px-4 py-2 bg-gray-300 text-gray-700 rounded hover:bg-gray-400"
            >
              Cancel
            </button>
          )}
        </div>

        {error && (
          <div className="p-3 bg-red-50 border border-red-200 rounded text-red-700 text-sm">
            {error}
          </div>
        )}

        {renderPreview()}
      </div>
    </div>
  );
};

export default MergeUpload;