import React from 'react';
import InfiniteCanvas from './InfiniteCanvas';

interface IsolatedCanvasProps {
  tabId: string;
}

const IsolatedCanvas: React.FC<IsolatedCanvasProps> = ({ tabId }) => {
  // Generate a unique storage key for this canvas tab
  const storageKey = `infinite-canvas-workspace-${tabId}`;

  console.log(`IsolatedCanvas rendering for tabId: ${tabId}, storageKey: ${storageKey}`);

  return (
    <InfiniteCanvas storageKey={storageKey} />
  );
};

export default IsolatedCanvas;