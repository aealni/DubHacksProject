import React from 'react';
import { X, Minimize2, Square, Minus } from 'lucide-react';

export interface PanelHeaderProps {
  title: string;
  subtitle?: string;
  icon?: React.ReactNode;
  onClose?: () => void;
  onMinimize?: () => void;
  onMaximize?: () => void;
  isMinimized?: boolean;
  isMaximized?: boolean;
  className?: string;
  rightContent?: React.ReactNode;
  actions?: React.ReactNode;
}

export const PanelHeader: React.FC<PanelHeaderProps> = ({
  title,
  subtitle,
  icon,
  onClose,
  onMinimize,
  onMaximize,
  isMinimized,
  isMaximized,
  className = '',
  rightContent,
  actions
}) => {
  return (
    <div className={`flex items-center justify-between p-3 bg-gray-800 border-b border-gray-700 ${className}`}>
      <div className="flex items-center space-x-2">
        {icon && <div className="text-blue-400">{icon}</div>}
        <div>
          <h3 className="text-white font-medium">{title}</h3>
          {subtitle && <p className="text-gray-400 text-sm">{subtitle}</p>}
        </div>
      </div>
      
      <div className="flex items-center space-x-2">
        {rightContent}
        {actions}
        
        <div className="flex items-center space-x-1">
          {onMinimize && (
            <button
              onClick={onMinimize}
              className="p-1 text-gray-400 hover:text-white hover:bg-gray-700 rounded transition-colors"
              title={isMinimized ? "Restore" : "Minimize"}
            >
              <Minus size={14} />
            </button>
          )}
          
          {onMaximize && (
            <button
              onClick={onMaximize}
              className="p-1 text-gray-400 hover:text-white hover:bg-gray-700 rounded transition-colors"
              title={isMaximized ? "Restore" : "Maximize"}
            >
              <Square size={14} />
            </button>
          )}
          
          {onClose && (
            <button
              onClick={onClose}
              className="p-1 text-gray-400 hover:text-red-400 hover:bg-gray-700 rounded transition-colors"
              title="Close"
            >
              <X size={14} />
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

export default PanelHeader;
