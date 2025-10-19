import React from 'react';

interface StandardPanelControlsProps {
  isExpanded: boolean;
  onToggleExpand: () => void;
  title?: string;
  onClose?: () => void;
  className?: string;
}

export const StandardPanelControls: React.FC<StandardPanelControlsProps> = ({
  isExpanded,
  onToggleExpand,
  title,
  onClose,
  className = ""
}) => {
  return (
    <div className={`flex items-center justify-between bg-gray-50 border-b border-gray-200 px-2.5 py-2 dark:bg-slate-800 dark:border-slate-700 ${className}`}>
      <div className="flex items-center space-x-2">
        {title && (
          <h3 className="text-xs font-medium text-gray-700 truncate uppercase tracking-wide dark:text-slate-200">{title}</h3>
        )}
      </div>
      
      <div className="flex items-center space-x-1">
        {/* Expand/Collapse Button */}
        <button
          onClick={onToggleExpand}
          className="inline-flex h-6 w-6 items-center justify-center border border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700 transition-colors dark:text-slate-300 dark:hover:text-slate-100 dark:hover:border-slate-500"
          title={isExpanded ? "Collapse panel" : "Expand panel"}
        >
          <svg 
            className="w-3.5 h-3.5" 
            fill="none" 
            stroke="currentColor" 
            viewBox="0 0 24 24"
          >
            <path 
              strokeLinecap="round" 
              strokeLinejoin="round" 
              strokeWidth={2} 
              d={isExpanded ? "M19 9l-7 7-7-7" : "M9 5l7 7-7 7"} 
            />
          </svg>
        </button>
        
        {/* Close Button */}
        {onClose && (
          <button
            onClick={onClose}
            className="inline-flex h-6 w-6 items-center justify-center border border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700 transition-colors dark:text-slate-300 dark:hover:text-slate-100 dark:hover:border-slate-500"
            title="Close panel"
          >
            <svg 
              className="w-3.5 h-3.5" 
              fill="none" 
              stroke="currentColor" 
              viewBox="0 0 24 24"
            >
              <path 
                strokeLinecap="round" 
                strokeLinejoin="round" 
                strokeWidth={2} 
                d="M6 18L18 6M6 6l12 12" 
              />
            </svg>
          </button>
        )}
      </div>
    </div>
  );
};

interface StandardPanelWrapperProps {
  children: React.ReactNode;
  isExpanded: boolean;
  onToggleExpand: () => void;
  title?: string;
  onClose?: () => void;
  className?: string;
  expandedSize?: { width: number; height: number };
  collapsedSize?: { width: number; height: number };
  onPanelUpdate?: (updates: { width?: number; height?: number }) => void;
}

export const StandardPanelWrapper: React.FC<StandardPanelWrapperProps> = ({
  children,
  isExpanded,
  onToggleExpand,
  title,
  onClose,
  className = "",
  expandedSize,
  collapsedSize,
  onPanelUpdate
}) => {
  const handleToggleExpand = () => {
    const newExpanded = !isExpanded;
    onToggleExpand();
    
    // Auto-resize panel if sizes and update function are provided
    if (onPanelUpdate && expandedSize && collapsedSize) {
      const targetSize = newExpanded ? expandedSize : collapsedSize;
      onPanelUpdate(targetSize);
    }
  };

  return (
  <div className={`bg-white border border-gray-200 shadow-sm overflow-hidden dark:bg-slate-900 dark:border-slate-700 ${className}`}>
      <StandardPanelControls
        isExpanded={isExpanded}
        onToggleExpand={handleToggleExpand}
        title={title}
        onClose={onClose}
      />
      
      {/* Content Area */}
      <div className={`${isExpanded ? 'block' : 'hidden'}`}>
        {children}
      </div>
      
      {/* Collapsed Content */}
      {!isExpanded && (
        <div className="p-3 text-center">
          <p className="text-[11px] uppercase tracking-wide text-slate-400 dark:text-slate-500">Expand to view</p>
        </div>
      )}
    </div>
  );
};

// Standardized resize handles component
interface StandardResizeHandlesProps {
  onResizeStart: (e: React.MouseEvent, direction: string) => void;
}

export const StandardResizeHandles: React.FC<StandardResizeHandlesProps> = ({ onResizeStart }) => {
  const handleStyle = "absolute bg-transparent hover:bg-slate-400/30 transition-colors duration-150";
  
  return (
    <>
      {/* Corner handles */}
      <div 
        className={`${handleStyle} w-2.5 h-2.5 -top-1 -left-1 cursor-nw-resize`}
        onMouseDown={(e) => onResizeStart(e, 'nw')}
      />
      <div 
        className={`${handleStyle} w-2.5 h-2.5 -top-1 -right-1 cursor-ne-resize`}
        onMouseDown={(e) => onResizeStart(e, 'ne')}
      />
      <div 
        className={`${handleStyle} w-2.5 h-2.5 -bottom-1 -left-1 cursor-sw-resize`}
        onMouseDown={(e) => onResizeStart(e, 'sw')}
      />
      <div 
        className={`${handleStyle} w-2.5 h-2.5 -bottom-1 -right-1 cursor-se-resize`}
        onMouseDown={(e) => onResizeStart(e, 'se')}
      />
      
      {/* Edge handles */}
      <div 
        className={`${handleStyle} w-full h-1 -top-1 left-0 cursor-n-resize`}
        onMouseDown={(e) => onResizeStart(e, 'n')}
      />
      <div 
        className={`${handleStyle} w-full h-1 -bottom-1 left-0 cursor-s-resize`}
        onMouseDown={(e) => onResizeStart(e, 's')}
      />
      <div 
        className={`${handleStyle} w-1 h-full top-0 -left-1 cursor-w-resize`}
        onMouseDown={(e) => onResizeStart(e, 'w')}
      />
      <div 
        className={`${handleStyle} w-1 h-full top-0 -right-1 cursor-e-resize`}
        onMouseDown={(e) => onResizeStart(e, 'e')}
      />
    </>
  );
};