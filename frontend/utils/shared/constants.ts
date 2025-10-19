// Shared constants for the entire application

// API Configuration
export const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:8000';

// Panel sizing constants
export const PANEL_SIZES = {
  // Default sizes for consistent aesthetics
  SMALL: { width: 320, height: 240 },
  MEDIUM: { width: 450, height: 360 },
  LARGE: { width: 600, height: 480 },
  XLARGE: { width: 750, height: 600 },
  
  // Collapsed sizes (same for all panel types)
  COLLAPSED: { width: 320, height: 80 },
  
  // Specific panel configurations
  DATASET: { 
    collapsed: { width: 320, height: 80 },
    expanded: { width: 600, height: 500 }
  },
  GRAPH: { 
    collapsed: { width: 320, height: 80 },
    expanded: { width: 650, height: 550 }
  },
  MODEL: { 
    collapsed: { width: 320, height: 80 },
    expanded: { width: 550, height: 450 }
  },
  MODEL_RESULTS: { 
    collapsed: { width: 320, height: 80 },
    expanded: { width: 700, height: 600 }
  },
  MODEL_VISUALIZATION: { 
    collapsed: { width: 320, height: 80 },
    expanded: { width: 550, height: 440 }
  },
  DATA_MANIPULATION: { 
    collapsed: { width: 320, height: 80 },
    expanded: { width: 450, height: 360 }
  },
  DATA_EDITOR: { 
    collapsed: { width: 320, height: 80 },
    expanded: { width: 450, height: 360 }
  }
} as const;

// Panel spacing
export const PANEL_SPACING = 40;

// Z-index layers
export const Z_INDEX = {
  BACKGROUND: 0,
  CANVAS: 1,
  PANELS: 10,
  DRAGGING_PANEL: 100,
  MODALS: 1000,
  TOOLTIPS: 1100,
  OVERLAYS: 1200
} as const;

// Animation durations (in milliseconds)
export const ANIMATION_DURATION = {
  FAST: 150,
  NORMAL: 300,
  SLOW: 500,
  VERY_SLOW: 1000
} as const;

// Color schemes
export const COLORS = {
  PRIMARY: '#3b82f6',
  SECONDARY: '#64748b',
  SUCCESS: '#10b981',
  WARNING: '#f59e0b',
  ERROR: '#ef4444',
  INFO: '#06b6d4'
} as const;

// File upload constants
export const FILE_UPLOAD = {
  MAX_SIZE: 10 * 1024 * 1024, // 10MB
  ALLOWED_TYPES: ['.csv', '.xlsx', '.xls'],
  MIME_TYPES: [
    'text/csv',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  ]
} as const;

// Validation rules
export const VALIDATION = {
  MIN_PANEL_SIZE: { width: 200, height: 60 },
  MAX_PANEL_SIZE: { width: 1200, height: 800 },
  MIN_DATASET_NAME_LENGTH: 1,
  MAX_DATASET_NAME_LENGTH: 100,
  MIN_PASSWORD_LENGTH: 8,
  MAX_PASSWORD_LENGTH: 128
} as const;

// Default configurations
export const DEFAULT_CONFIG = {
  CLEANING: {
    remove_duplicates: true,
    handle_missing: 'drop' as const,
    standardize_columns: true,
    lowercase_text: false,
    trim_whitespace: true
  },
  GRAPH: {
    theme: 'light',
    animation: true,
    responsive: true
  },
  MODEL: {
    test_size: 0.2,
    random_state: 42,
    cross_validation_folds: 5
  }
} as const;

// Error messages
export const ERROR_MESSAGES = {
  NETWORK_ERROR: 'Network error. Please check your connection.',
  UPLOAD_FAILED: 'File upload failed. Please try again.',
  INVALID_FILE_TYPE: 'Invalid file type. Please upload a CSV or Excel file.',
  FILE_TOO_LARGE: 'File is too large. Maximum size is 10MB.',
  PROCESSING_ERROR: 'Error processing your request. Please try again.',
  NOT_FOUND: 'The requested resource was not found.',
  UNAUTHORIZED: 'You are not authorized to perform this action.',
  VALIDATION_ERROR: 'Please check your input and try again.'
} as const;

// Success messages
export const SUCCESS_MESSAGES = {
  UPLOAD_SUCCESS: 'File uploaded successfully!',
  SAVE_SUCCESS: 'Changes saved successfully!',
  DELETE_SUCCESS: 'Item deleted successfully!',
  COPY_SUCCESS: 'Copied to clipboard!',
  EXPORT_SUCCESS: 'Data exported successfully!'
} as const;

// Keyboard shortcuts
export const KEYBOARD_SHORTCUTS = {
  SAVE: 'Ctrl+S',
  COPY: 'Ctrl+C',
  PASTE: 'Ctrl+V',
  UNDO: 'Ctrl+Z',
  REDO: 'Ctrl+Y',
  DELETE: 'Delete',
  ESCAPE: 'Escape',
  ZOOM_IN: '+',
  ZOOM_OUT: '-',
  RESET_ZOOM: '0'
} as const;

// Graph types and configurations
export const GRAPH_TYPES = {
  SCATTER: 'scatter',
  LINE: 'line',
  BAR: 'bar',
  HISTOGRAM: 'histogram',
  BOX: 'box',
  VIOLIN: 'violin',
  PIE: 'pie',
  HEATMAP: 'heatmap',
  CORRELATION: 'correlation',
  PAIRPLOT: 'pairplot'
} as const;

// Model algorithms
export const MODEL_ALGORITHMS = {
  LINEAR_REGRESSION: 'linear_regression',
  LOGISTIC_REGRESSION: 'logistic_regression',
  RANDOM_FOREST: 'random_forest',
  SVM: 'svm',
  DECISION_TREE: 'decision_tree',
  GRADIENT_BOOSTING: 'gradient_boosting',
  KNN: 'knn',
  NAIVE_BAYES: 'naive_bayes'
} as const;