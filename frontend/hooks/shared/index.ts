// Async State Management
export { useAsyncState, useDatasets, useDataset, useDatasetUpload, useGraphs, useModels } from './useAsyncState';
export type { LoadingState, UseAsyncStateResult } from './useAsyncState';

// Panel State Management
export { usePanelState } from './usePanelState';
export type { 
  UsePanelStateOptions, 
  PanelState, 
  UsePanelStateResult 
} from './usePanelState';

// Interaction Hooks
export { 
  useDrag, 
  useResize, 
  useClickOutside, 
  useKeyboardShortcuts 
} from './useInteractions';
export type {
  UseDragOptions,
  UseDragResult,
  UseResizeOptions,
  UseResizeResult,
  UseClickOutsideOptions,
  UseKeyboardShortcutsOptions
} from './useInteractions';

// Re-export all hooks for convenience
import useAsyncStateModule from './useAsyncState';
import usePanelStateModule from './usePanelState';
import useInteractionsModule from './useInteractions';

export const SharedHooks = {
  ...useAsyncStateModule,
  ...usePanelStateModule,
  ...useInteractionsModule
};

export default SharedHooks;