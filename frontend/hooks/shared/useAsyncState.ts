import { useState, useCallback, useEffect } from 'react';
import { ApiResponse } from '../../types';
import { api } from '../../utils/shared/api';

export type LoadingState = 'idle' | 'loading' | 'success' | 'error';

export interface UseAsyncStateResult<T> {
  data: T | null;
  loading: boolean;
  error: string | null;
  loadingState: LoadingState;
  execute: (...args: any[]) => Promise<void>;
  reset: () => void;
  setData: (data: T | null) => void;
}

export function useAsyncState<T = any>(
  asyncFunction: (...args: any[]) => Promise<ApiResponse<T>>,
  immediate = false
): UseAsyncStateResult<T> {
  const [data, setData] = useState<T | null>(null);
  const [loadingState, setLoadingState] = useState<LoadingState>('idle');
  const [error, setError] = useState<string | null>(null);

  const execute = useCallback(async (...args: any[]) => {
    try {
      setLoadingState('loading');
      setError(null);
      
      const response = await asyncFunction(...args);
      
      if (response.success) {
        setData(response.data || null);
        setLoadingState('success');
      } else {
        setError(response.error || 'Unknown error occurred');
        setLoadingState('error');
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'An unexpected error occurred';
      setError(errorMessage);
      setLoadingState('error');
    }
  }, [asyncFunction]);

  const reset = useCallback(() => {
    setData(null);
    setLoadingState('idle');
    setError(null);
  }, []);

  // Execute immediately if requested
  useEffect(() => {
    if (immediate) {
      execute();
    }
  }, [execute, immediate]);

  return {
    data,
    loading: loadingState === 'loading',
    error,
    loadingState,
    execute,
    reset,
    setData
  };
}

// Specialized hooks for common API operations
export function useDatasets() {
  return useAsyncState(api.datasets.list, true);
}

export function useDataset(id: number | null) {
  const result = useAsyncState(api.datasets.get, false);
  
  useEffect(() => {
    if (id !== null) {
      result.execute(id);
    }
  }, [id, result.execute]);

  return result;
}

export function useDatasetUpload() {
  return useAsyncState(api.datasets.upload, false);
}

export function useGraphs(datasetId: number | null) {
  const result = useAsyncState(api.graphs.list, false);
  
  useEffect(() => {
    if (datasetId !== null) {
      result.execute(datasetId);
    }
  }, [datasetId, result.execute]);

  return result;
}

export function useModels(datasetId: number | null) {
  const result = useAsyncState(api.models.list, false);
  
  useEffect(() => {
    if (datasetId !== null) {
      result.execute(datasetId);
    }
  }, [datasetId, result.execute]);

  return result;
}

export default {
  useAsyncState,
  useDatasets,
  useDataset,
  useDatasetUpload,
  useGraphs,
  useModels
};