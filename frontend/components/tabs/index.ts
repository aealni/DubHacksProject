// Re-export all tab providers for easier importing
export { default as CanvasTabProvider } from './CanvasTabProvider';
export { default as DataTabProvider } from './DataTabProvider';
export { default as GraphsTabProvider } from './GraphsTabProvider';
export { default as ModelsTabProvider } from './ModelsTabProvider';

// Re-export hooks as well
export { useCanvasTab } from './CanvasTabProvider';
export { useDataTab } from './DataTabProvider';
export { useGraphsTab } from './GraphsTabProvider';
export { useModelsTab } from './ModelsTabProvider';