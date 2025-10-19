// Shared type definitions for the entire application
export interface Position {
  x: number;
  y: number;
}

export interface Size {
  width: number;
  height: number;
}

export interface Rectangle extends Position, Size {}

export interface DatasetInfo {
  id: number;
  name: string;
  original_filename: string;
  rows_clean: number;
  cols_clean: number;
  upload_date: string;
  file_size: number;
  status: 'uploaded' | 'processing' | 'ready' | 'error';
  [key: string]: any;
}

export interface PanelData {
  id: string;
  name?: string;
  dataset_id?: string;
  original_filename?: string;
  rows_clean?: number;
  cols_clean?: number;
  [key: string]: any;
}

export interface BasePanel {
  id: string;
  type: 'dataset' | 'graph' | 'model' | 'model-results' | 'model-visualization' | 'manipulation' | 'data-editor';
  x: number;
  y: number;
  width: number;
  height: number;
  data: PanelData;
  parentId?: string;
  customName?: string;
  folderId?: string;
  isExpanded?: boolean;
  zIndex?: number;
  lastInteraction?: number;
}

export interface PanelUpdateParams {
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  isExpanded?: boolean;
  [key: string]: any;
}

export interface BasePanelProps {
  panel: BasePanel;
  isDragging?: boolean;
  onPanelUpdate: (panelId: string, updates: PanelUpdateParams) => void;
  onClose?: () => void;
}

export interface ResizeState {
  isResizing: boolean;
  resizeType: 'n' | 's' | 'e' | 'w' | 'nw' | 'ne' | 'sw' | 'se' | '';
  startPos: Position;
  startSize: Size;
  startPanelPos: Position;
}

export interface LoadingState {
  isLoading: boolean;
  error: string | null;
}

export interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
}

export interface GraphConfig {
  type: string;
  x_column?: string;
  y_column?: string;
  title?: string;
  [key: string]: any;
}

export interface ModelConfig {
  algorithm: string;
  target_column: string;
  feature_columns: string[];
  hyperparameters?: Record<string, any>;
  [key: string]: any;
}

export interface CleaningConfig {
  remove_duplicates: boolean;
  handle_missing: 'drop' | 'fill' | 'interpolate';
  fill_strategy?: 'mean' | 'median' | 'mode' | 'constant';
  fill_value?: any;
  standardize_columns: boolean;
  lowercase_text: boolean;
  trim_whitespace: boolean;
  [key: string]: any;
}

export interface PreviewData {
  columns: string[];
  rows: any[][];
  total_rows: number;
}

export interface DataReport {
  duplicates_removed: number;
  rows_dropped_for_missing: number;
  missing_by_column: Record<string, number>;
  dtype_inference: Record<string, string>;
  date_columns_standardized: string[];
  notes: string[];
  header_row_detected: boolean;
  header_quality_score: number;
}

// Event handler types
export type PanelEventHandler = (panelId: string, updates: PanelUpdateParams) => void;
export type ClickHandler = () => void;
export type ErrorHandler = (error: string) => void;
export type LoadingHandler = (isLoading: boolean) => void;

// Utility types
export type Optional<T, K extends keyof T> = Omit<T, K> & Partial<Pick<T, K>>;
export type Merge<T, U> = Omit<T, keyof U> & U;