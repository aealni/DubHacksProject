import { BACKEND_URL, ERROR_MESSAGES } from './constants';
import type { ApiResponse } from '../../types';

// Generic API utility functions
export async function apiRequest<T = any>(
  endpoint: string,
  options: RequestInit = {}
): Promise<ApiResponse<T>> {
  try {
    const url = endpoint.startsWith('http') ? endpoint : `${BACKEND_URL}${endpoint}`;
    
    const defaultOptions: RequestInit = {
      headers: {
        'Content-Type': 'application/json',
        ...options.headers,
      },
    };

    const response = await fetch(url, { ...defaultOptions, ...options });
    
    if (!response.ok) {
      const errorText = await response.text();
      let errorMessage: string = ERROR_MESSAGES.PROCESSING_ERROR;
      
      try {
        const errorData = JSON.parse(errorText);
        errorMessage = errorData.detail || errorData.message || ERROR_MESSAGES.PROCESSING_ERROR;
      } catch {
        // If text isn't parseable JSON, use the raw error text
        if (typeof errorText === 'string' && errorText.trim().length > 0) {
          errorMessage = errorText;
        }
      }
      
      return {
        success: false,
        error: errorMessage
      };
    }

    const data = await response.json();
    return {
      success: true,
      data
    };
  } catch (error) {
    console.error('API request failed:', error);
    return {
      success: false,
      error: ERROR_MESSAGES.NETWORK_ERROR
    };
  }
}

// Specific API functions
export const api = {
  // Dataset operations
  datasets: {
    list: () => apiRequest('/datasets/'),
    get: (id: number) => apiRequest(`/datasets/${id}`),
    upload: (formData: FormData) => 
      apiRequest('/datasets/upload', {
        method: 'POST',
        body: formData,
        headers: {} // Let browser set Content-Type for FormData
      }),
    delete: (id: number) => 
      apiRequest(`/datasets/${id}`, { method: 'DELETE' }),
    clean: (id: number, config: any) =>
      apiRequest(`/datasets/${id}/clean`, {
        method: 'POST',
        body: JSON.stringify(config)
      }),
    preview: (id: number) => apiRequest(`/datasets/${id}/preview`),
    download: (id: number) => apiRequest(`/datasets/${id}/download`),
    getColumns: (id: number) => apiRequest(`/datasets/${id}/columns`),
    merge: (id: number, formData: FormData) =>
      apiRequest(`/datasets/${id}/merge`, {
        method: 'POST',
        body: formData,
        headers: {} // Let browser set Content-Type for FormData
      })
  },

  // Graph operations
  graphs: {
    create: (datasetId: number, config: any) =>
      apiRequest('/graphs/create', {
        method: 'POST',
        body: JSON.stringify({ dataset_id: datasetId, ...config })
      }),
    get: (id: number) => apiRequest(`/graphs/${id}`),
    list: (datasetId: number) => apiRequest(`/graphs/?dataset_id=${datasetId}`)
  },

  // Model operations
  models: {
    create: (datasetId: number, config: any) =>
      apiRequest('/models/create', {
        method: 'POST',
        body: JSON.stringify({ dataset_id: datasetId, ...config })
      }),
    get: (id: number) => apiRequest(`/models/${id}`),
    list: (datasetId: number) => apiRequest(`/models/?dataset_id=${datasetId}`),
    predict: (id: number, data: any) =>
      apiRequest(`/models/${id}/predict`, {
        method: 'POST',
        body: JSON.stringify(data)
      })
  }
};

// File handling utilities
export function validateFile(file: File): { valid: boolean; error?: string } {
  const maxSize = 10 * 1024 * 1024; // 10MB
  const allowedTypes = ['.csv', '.xlsx', '.xls'];
  
  if (file.size > maxSize) {
    return { valid: false, error: ERROR_MESSAGES.FILE_TOO_LARGE };
  }
  
  const fileExtension = '.' + file.name.split('.').pop()?.toLowerCase();
  if (!allowedTypes.includes(fileExtension)) {
    return { valid: false, error: ERROR_MESSAGES.INVALID_FILE_TYPE };
  }
  
  return { valid: true };
}

export function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 Bytes';
  
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

// Date/time utilities
export function formatDate(date: string | Date): string {
  const d = new Date(date);
  return d.toLocaleDateString() + ' ' + d.toLocaleTimeString();
}

export function formatRelativeTime(date: string | Date): string {
  const now = new Date();
  const then = new Date(date);
  const diffMs = now.getTime() - then.getTime();
  
  const diffMins = Math.floor(diffMs / (1000 * 60));
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  
  if (diffMins < 1) return 'Just now';
  if (diffMins < 60) return `${diffMins} min ago`;
  if (diffHours < 24) return `${diffHours} hour${diffHours !== 1 ? 's' : ''} ago`;
  if (diffDays < 7) return `${diffDays} day${diffDays !== 1 ? 's' : ''} ago`;
  
  return formatDate(date);
}

// Number formatting utilities
export function formatNumber(num: number, decimals: number = 2): string {
  return num.toLocaleString(undefined, { 
    minimumFractionDigits: 0,
    maximumFractionDigits: decimals 
  });
}

export function formatPercentage(num: number, decimals: number = 1): string {
  return (num * 100).toFixed(decimals) + '%';
}

// String utilities
export function truncateText(text: string, maxLength: number = 50): string {
  if (text.length <= maxLength) return text;
  return text.substring(0, maxLength) + '...';
}

export function capitalizeFirst(str: string): string {
  return str.charAt(0).toUpperCase() + str.slice(1);
}

export function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\w ]+/g, '')
    .replace(/ +/g, '-');
}

// Object utilities
export function deepClone<T>(obj: T): T {
  return JSON.parse(JSON.stringify(obj));
}

export function isEmpty(obj: any): boolean {
  if (obj == null) return true;
  if (Array.isArray(obj) || typeof obj === 'string') return obj.length === 0;
  if (typeof obj === 'object') return Object.keys(obj).length === 0;
  return false;
}

// Array utilities
export function removeDuplicates<T>(array: T[], keyFn?: (item: T) => any): T[] {
  if (keyFn) {
    const seen = new Set();
    return array.filter(item => {
      const key = keyFn(item);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }
  return Array.from(new Set(array));
}

export function groupBy<T>(array: T[], keyFn: (item: T) => string): Record<string, T[]> {
  return array.reduce((groups, item) => {
    const key = keyFn(item);
    if (!groups[key]) groups[key] = [];
    groups[key].push(item);
    return groups;
  }, {} as Record<string, T[]>);
}

// DOM utilities
export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export function copyToClipboard(text: string): Promise<boolean> {
  if (navigator.clipboard) {
    return navigator.clipboard.writeText(text)
      .then(() => true)
      .catch(() => false);
  }
  
  // Fallback for older browsers
  try {
    const textArea = document.createElement('textarea');
    textArea.value = text;
    document.body.appendChild(textArea);
    textArea.select();
    document.execCommand('copy');
    document.body.removeChild(textArea);
    return Promise.resolve(true);
  } catch {
    return Promise.resolve(false);
  }
}

// Color utilities
export function hexToRgb(hex: string): { r: number; g: number; b: number } | null {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  return result ? {
    r: parseInt(result[1], 16),
    g: parseInt(result[2], 16),
    b: parseInt(result[3], 16)
  } : null;
}

export function generateRandomColor(): string {
  return '#' + Math.floor(Math.random() * 16777215).toString(16).padStart(6, '0');
}