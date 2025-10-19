import React, { useState, useRef } from 'react';

const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:8000';

interface UploadDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onUploadSuccess: (dataset: any) => void;
  position: { x: number; y: number };
  existingDatasets?: Array<{id: number, name: string}>;
}

interface UploadOptions {
  missing_mode: 'drop_rows' | 'fill_mean' | 'fill_median' | 'fill_mode' | 'fill_forward' | 'fill_backward';
  drop_row_missing_pct: number;
  lowercase_categoricals: boolean;
  merge_with_existing?: number;
  merge_strategy?: 'append_below' | 'merge_on_column';
  merge_column?: string;
}

export const UploadDialog: React.FC<UploadDialogProps> = ({
  isOpen,
  onClose,
  onUploadSuccess,
  position,
  existingDatasets = []
}) => {
  const [file, setFile] = useState<File | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [uploadOptions, setUploadOptions] = useState<UploadOptions>({
    missing_mode: 'drop_rows',
    drop_row_missing_pct: 0.6,
    lowercase_categoricals: true
  });
  const [delimiterOption, setDelimiterOption] = useState<'auto' | 'comma' | 'tab' | 'semicolon' | 'space' | 'pipe' | 'custom'>('auto');
  const [customDelimiter, setCustomDelimiter] = useState('');
  const [availableMergeColumns, setAvailableMergeColumns] = useState<string[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = event.target.files?.[0];
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

  const handleDrop = (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    const droppedFile = event.dataTransfer.files[0];
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
  };

  const handleDragOver = (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
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

  const handleUpload = async () => {
    if (!file) return;
    if (delimiterOption === 'custom' && customDelimiter.length === 0) {
      setError('Please provide a custom delimiter before uploading.');
      return;
    }

    console.log('Starting upload...', { file: file.name, backendUrl: BACKEND_URL, options: uploadOptions });

    setIsUploading(true);
    setUploadProgress(0);
    setError(null);

    try {
      if (uploadOptions.merge_with_existing) {
        // Handle merge upload
        await handleMergeUpload();
      } else {
        // Handle regular upload
        await handleRegularUpload();
      }
    } catch (error) {
      console.error('Upload error:', error);
      setError(`Upload failed: ${error instanceof Error ? error.message : String(error)}. Please try again.`);
      setUploadProgress(0);
    } finally {
      setIsUploading(false);
    }
  };

  const handleRegularUpload = async () => {
    const formData = new FormData();
    formData.append('file', file!);
    formData.append('missing_mode', uploadOptions.missing_mode);
    formData.append('drop_row_missing_pct', uploadOptions.drop_row_missing_pct.toString());
    formData.append('lowercase_categoricals', uploadOptions.lowercase_categoricals.toString());
    const delimiterValue = resolveDelimiterValue();
    if (delimiterValue !== null) {
      formData.append('delimiter', delimiterValue);
    }

    // Simulate upload progress
    const progressInterval = setInterval(() => {
      setUploadProgress(prev => Math.min(prev + 10, 90));
    }, 100);

    console.log('Sending request to:', `${BACKEND_URL}/upload`);

    const response = await fetch(`${BACKEND_URL}/upload`, {
      method: 'POST',
      body: formData,
    });

    clearInterval(progressInterval);
    setUploadProgress(100);

    console.log('Upload response:', { status: response.status, ok: response.ok });

    if (response.ok) {
      const result = await response.json();
      console.log('Upload successful:', result);
      setTimeout(() => {
        onUploadSuccess(result);
        handleClose();
      }, 500);
    } else {
      const errorData = await response.json();
      console.error('Upload failed:', errorData);
      setError(errorData.detail || 'Upload failed');
      setUploadProgress(0);
    }
  };

  const handleMergeUpload = async () => {
    const formData = new FormData();
    formData.append('file', file!);
    const delimiterValue = resolveDelimiterValue();
    if (delimiterValue !== null) {
      formData.append('delimiter', delimiterValue);
    }
    
    // Simulate upload progress
    const progressInterval = setInterval(() => {
      setUploadProgress(prev => Math.min(prev + 10, 90));
    }, 100);

    const endpoint = uploadOptions.merge_strategy === 'merge_on_column' 
      ? `${BACKEND_URL}/dataset/${uploadOptions.merge_with_existing}/add-data`
      : `${BACKEND_URL}/dataset/${uploadOptions.merge_with_existing}/add-data`;

    const requestBody: any = {
      merge_strategy: uploadOptions.merge_strategy,
      missing_mode: uploadOptions.missing_mode,
      drop_row_missing_pct: uploadOptions.drop_row_missing_pct,
      lowercase_categoricals: uploadOptions.lowercase_categoricals
    };

    if (uploadOptions.merge_strategy === 'merge_on_column' && uploadOptions.merge_column) {
      requestBody.merge_column = uploadOptions.merge_column;
    }
    if (delimiterValue !== null) {
      requestBody.delimiter = delimiterValue;
    }

    formData.append('config', JSON.stringify(requestBody));

    console.log('Sending merge request to:', endpoint);

    const response = await fetch(endpoint, {
      method: 'POST',
      body: formData,
    });

    clearInterval(progressInterval);
    setUploadProgress(100);

    if (response.ok) {
      const result = await response.json();
      console.log('Merge upload successful:', result);
      setTimeout(() => {
        onUploadSuccess(result);
        handleClose();
      }, 500);
    } else {
      const errorData = await response.json();
      console.error('Merge upload failed:', errorData);
      setError(errorData.detail || 'Merge upload failed');
      setUploadProgress(0);
    }
  };

  const handleClose = () => {
    setFile(null);
    setIsUploading(false);
    setUploadProgress(0);
    setError(null);
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl max-w-md w-full mx-4">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-200">
          <h3 className="text-lg font-semibold text-gray-900">Upload Dataset</h3>
          <button
            onClick={handleClose}
            className="text-gray-400 hover:text-gray-600 transition-colors"
            disabled={isUploading}
          >
            ×
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-4">
          {/* File Drop Area */}
          <div
            onDrop={handleDrop}
            onDragOver={handleDragOver}
            className={`border-2 border-dashed rounded-lg p-8 text-center transition-colors ${
              file
                ? 'border-green-300 bg-green-50'
                : 'border-gray-300 hover:border-gray-400 bg-gray-50'
            }`}
          >
            {file ? (
              <div className="space-y-2">
                <div className="text-green-600 text-lg">✓</div>
                <p className="text-sm font-medium text-gray-900">{file.name}</p>
                <p className="text-xs text-gray-500">
                  {(file.size / 1024 / 1024).toFixed(2)} MB
                </p>
              </div>
            ) : (
              <div className="space-y-2">
                <div className="text-gray-400 text-2xl">File</div>
                <p className="text-sm text-gray-600">
                  Drag and drop a CSV, TSV, TXT, or Excel file here, or{' '}
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    className="text-blue-600 hover:text-blue-700 font-medium"
                  >
                    browse
                  </button>
                </p>
                <p className="text-xs text-gray-500">CSV, TSV, TXT, and Excel files are supported</p>
              </div>
            )}
          </div>

          {/* Hidden File Input */}
          <input
            ref={fileInputRef}
            type="file"
            accept=".csv,.tsv,.txt,.xlsx,.xls"
            onChange={handleFileSelect}
            className="hidden"
          />

          {/* Progress Bar */}
          {isUploading && (
            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-gray-600">Uploading...</span>
                <span className="text-gray-600">{uploadProgress}%</span>
              </div>
              <div className="w-full bg-gray-200 rounded-full h-2">
                <div
                  className="bg-blue-600 h-2 rounded-full transition-all duration-300"
                  style={{ width: `${uploadProgress}%` }}
                ></div>
              </div>
            </div>
          )}

          {/* Error Message */}
          {error && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-md">
              <p className="text-sm text-red-600">{error}</p>
            </div>
          )}

          {/* Advanced Options */}
          <div className="space-y-3">
            <button
              onClick={() => setShowAdvanced(!showAdvanced)}
              className="w-full flex items-center justify-between p-2 bg-gray-50 hover:bg-gray-100 rounded-md text-sm"
            >
              <span>Advanced Options</span>
              <span>{showAdvanced ? '▼' : '▶'}</span>
            </button>

            {showAdvanced && (
              <div className="space-y-3 border-l-2 border-blue-200 pl-4">
                {/* Delimiter Selection */}
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">
                    Delimiter
                  </label>
                  <select
                    value={delimiterOption}
                    onChange={(e) => setDelimiterOption(e.target.value as any)}
                    className="w-full p-2 border border-gray-300 rounded text-xs"
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
                    <div className="mt-2 space-y-1">
                      <input
                        type="text"
                        value={customDelimiter}
                        onChange={(e) => setCustomDelimiter(e.target.value)}
                        placeholder="Enter delimiter characters"
                        className="w-full p-2 border border-gray-300 rounded text-xs"
                      />
                      <p className="text-[11px] text-gray-500">
                        Leave blank to disable upload. Supports multi-character delimiters.
                      </p>
                    </div>
                  )}
                </div>

                {/* Missing Values Handling */}
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">
                    Handle Missing Values
                  </label>
                  <select
                    value={uploadOptions.missing_mode}
                    onChange={(e) => setUploadOptions(prev => ({
                      ...prev,
                      missing_mode: e.target.value as any
                    }))}
                    className="w-full p-2 border border-gray-300 rounded text-xs"
                  >
                    <option value="drop_rows">Drop rows with missing values</option>
                    <option value="fill_mean">Fill with column mean</option>
                    <option value="fill_median">Fill with column median</option>
                    <option value="fill_mode">Fill with most common value</option>
                    <option value="fill_forward">Forward fill</option>
                    <option value="fill_backward">Backward fill</option>
                  </select>
                </div>

                {/* Drop Row Threshold */}
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">
                    Drop Row Missing % Threshold: {(uploadOptions.drop_row_missing_pct * 100).toFixed(0)}%
                  </label>
                  <input
                    type="range"
                    min="0"
                    max="1"
                    step="0.1"
                    value={uploadOptions.drop_row_missing_pct}
                    onChange={(e) => setUploadOptions(prev => ({
                      ...prev,
                      drop_row_missing_pct: parseFloat(e.target.value)
                    }))}
                    className="w-full"
                  />
                </div>

                {/* Categorical Processing */}
                <div>
                  <label className="flex items-center space-x-2 text-xs">
                    <input
                      type="checkbox"
                      checked={uploadOptions.lowercase_categoricals}
                      onChange={(e) => setUploadOptions(prev => ({
                        ...prev,
                        lowercase_categoricals: e.target.checked
                      }))}
                    />
                    <span>Convert categorical values to lowercase</span>
                  </label>
                </div>

                {/* Merge Options */}
                {existingDatasets.length > 0 && (
                  <div className="border-t pt-3">
                    <label className="block text-xs font-medium text-gray-700 mb-2">
                      🔗 Merge with Existing Dataset
                    </label>
                    <select
                      value={uploadOptions.merge_with_existing || ''}
                      onChange={(e) => {
                        const datasetId = e.target.value ? parseInt(e.target.value) : undefined;
                        setUploadOptions(prev => ({
                          ...prev,
                          merge_with_existing: datasetId
                        }));
                      }}
                      className="w-full p-2 border border-gray-300 rounded text-xs mb-2"
                    >
                      <option value="">Create new dataset</option>
                      {existingDatasets.map(dataset => (
                        <option key={dataset.id} value={dataset.id}>
                          Merge with: {dataset.name}
                        </option>
                      ))}
                    </select>

                    {uploadOptions.merge_with_existing && (
                      <div className="space-y-2">
                        <select
                          value={uploadOptions.merge_strategy || ''}
                          onChange={(e) => setUploadOptions(prev => ({
                            ...prev,
                            merge_strategy: e.target.value as any
                          }))}
                          className="w-full p-2 border border-gray-300 rounded text-xs"
                        >
                          <option value="">Select merge strategy</option>
                          <option value="append_below">Append rows below</option>
                          <option value="merge_on_column">Merge on column</option>
                        </select>

                        {uploadOptions.merge_strategy === 'merge_on_column' && (
                          <input
                            type="text"
                            placeholder="Enter column name to merge on"
                            value={uploadOptions.merge_column || ''}
                            onChange={(e) => setUploadOptions(prev => ({
                              ...prev,
                              merge_column: e.target.value
                            }))}
                            className="w-full p-2 border border-gray-300 rounded text-xs"
                          />
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="flex justify-end space-x-3 p-6 border-t border-gray-200">
          <button
            onClick={handleClose}
            className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-md transition-colors"
            disabled={isUploading}
          >
            Cancel
          </button>
          <button
            onClick={handleUpload}
            disabled={!file || isUploading}
            className={`px-4 py-2 text-sm font-medium text-white rounded-md transition-colors ${
              file && !isUploading
                ? 'bg-blue-600 hover:bg-blue-700'
                : 'bg-gray-400 cursor-not-allowed'
            }`}
          >
            {isUploading ? 'Uploading...' : 'Upload'}
          </button>
        </div>
      </div>
    </div>
  );
};
