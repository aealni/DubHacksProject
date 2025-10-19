// Panel Components
export { PanelHeader } from './PanelHeader';
export type { PanelHeaderProps } from './PanelHeader';

// Status Components
export {
  Alert,
  LoadingSpinner,
  EmptyState,
  PanelLoading,
  PanelError
} from './StatusComponents';
export type {
  AlertType,
  AlertProps,
  LoadingSpinnerProps,
  EmptyStateProps
} from './StatusComponents';

// Interaction Components
export {
  ResizeHandle,
  DropdownMenu,
  DropdownItem,
  DropdownSeparator,
  DragHandle
} from './InteractionComponents';
export type {
  ResizeHandleProps,
  DropdownMenuProps,
  DragHandleProps
} from './InteractionComponents';

// Re-export everything as default collections for convenience
import PanelHeaderComponents from './PanelHeader';
import StatusComponents from './StatusComponents';
import InteractionComponents from './InteractionComponents';

export const SharedComponents = {
  ...PanelHeaderComponents,
  ...StatusComponents,
  ...InteractionComponents
};

export default SharedComponents;