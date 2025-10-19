import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/router';

const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:8000';

interface Dataset {
  id: number;
  name: string;
  original_filename: string;
  rows_raw: number;
  cols_raw: number;
  rows_clean: number;
  cols_clean: number;
  created_at: string;
}

interface DatasetSelectorProps {
  onDatasetSelect: (datasetId: number) => void;
  onNewDataset: () => void;
}

export const DatasetSelector: React.FC<DatasetSelectorProps> = ({ onDatasetSelect, onNewDataset }) => {
  const [datasets, setDatasets] = useState<Dataset[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');

  useEffect(() => {
    loadDatasets();
  }, []);

  const loadDatasets = async () => {
    try {
      const res = await fetch(`${BACKEND_URL}/datasets`);
      if (!res.ok) throw new Error('Failed to load datasets');
      const data = await res.json();
      setDatasets(data.datasets || []);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const filteredDatasets = datasets.filter(dataset =>
    dataset.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    dataset.original_filename.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString();
  };

  if (loading) {
    return (
      <div className="p-6 text-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"></div>
        <p className="mt-2 text-gray-600">Loading datasets...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-6 bg-red-50 border border-red-200 rounded">
        <p className="text-red-700">Error loading datasets: {error}</p>
        <button
          onClick={loadDatasets}
          className="mt-2 px-3 py-1 bg-red-100 text-red-700 rounded hover:bg-red-200"
        >
          Retry
        </button>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto p-6">
      <div className="mb-6">
        <h2 className="text-2xl font-bold text-gray-900 mb-2">Choose Upload Option</h2>
        <p className="text-gray-600">
          Add data to an existing dataset or create a new one.
        </p>
      </div>

      {/* New Dataset Option */}
      <div className="mb-6 p-4 border-2 border-dashed border-green-300 rounded-lg bg-green-50">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="font-semibold text-green-800">Create New Dataset</h3>
            <p className="text-sm text-green-700">Start fresh with a new dataset</p>
          </div>
          <button
            onClick={onNewDataset}
            className="px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700"
          >
            Upload New
          </button>
        </div>
      </div>

      {/* Existing Datasets */}
      {datasets.length > 0 && (
        <div>
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold text-gray-900">
              Add to Existing Dataset ({datasets.length})
            </h3>
            <div className="w-64">
              <input
                type="text"
                placeholder="Search datasets..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md"
              />
            </div>
          </div>

          {filteredDatasets.length === 0 ? (
            <p className="text-gray-500 text-center py-8">
              {searchTerm ? 'No datasets match your search.' : 'No datasets found.'}
            </p>
          ) : (
            <div className="space-y-3">
              {filteredDatasets.map((dataset) => (
                <div
                  key={dataset.id}
                  className="p-4 border rounded-lg hover:bg-gray-50 cursor-pointer transition-colors"
                  onClick={() => onDatasetSelect(dataset.id)}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex-1">
                      <div className="flex items-center space-x-3">
                        <h4 className="font-medium text-gray-900">{dataset.name}</h4>
                        <span className="text-xs bg-gray-200 px-2 py-1 rounded">
                          ID: {dataset.id}
                        </span>
                      </div>
                      <p className="text-sm text-gray-600 mt-1">
                        {dataset.original_filename}
                      </p>
                      <div className="flex items-center space-x-4 mt-2 text-xs text-gray-500">
                        <span>{dataset.rows_clean.toLocaleString()} rows</span>
                        <span>{dataset.cols_clean} columns</span>
                        <span>Created {formatDate(dataset.created_at)}</span>
                      </div>
                    </div>
                    <div className="text-right">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          onDatasetSelect(dataset.id);
                        }}
                        className="px-3 py-1 bg-blue-600 text-white rounded hover:bg-blue-700 text-sm"
                      >
                        Add Data
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {datasets.length === 0 && (
        <div className="text-center py-8">
          <p className="text-gray-500">No existing datasets found.</p>
          <p className="text-sm text-gray-400 mt-1">Upload your first dataset to get started.</p>
        </div>
      )}
    </div>
  );
};

export default DatasetSelector;