import React from 'react';
import { AlertCircle, CheckCircle, Info, XCircle, Loader2 } from 'lucide-react';

export type AlertType = 'info' | 'success' | 'warning' | 'error';

export interface AlertProps {
  type: AlertType;
  title?: string;
  message: string;
  className?: string;
  onDismiss?: () => void;
  actions?: React.ReactNode;
}

export interface LoadingSpinnerProps {
  size?: 'sm' | 'md' | 'lg';
  className?: string;
  message?: string;
}

export interface EmptyStateProps {
  icon?: React.ReactNode;
  title: string;
  message: string;
  action?: React.ReactNode;
  className?: string;
}

const alertStyles = {
  info: 'bg-blue-900/20 border-blue-500/30 text-blue-200',
  success: 'bg-green-900/20 border-green-500/30 text-green-200',
  warning: 'bg-yellow-900/20 border-yellow-500/30 text-yellow-200',
  error: 'bg-red-900/20 border-red-500/30 text-red-200'
};

const alertIcons = {
  info: Info,
  success: CheckCircle,
  warning: AlertCircle,
  error: XCircle
};

export const Alert: React.FC<AlertProps> = ({
  type,
  title,
  message,
  className = '',
  onDismiss,
  actions
}) => {
  const Icon = alertIcons[type];
  
  return (
    <div className={`border rounded-lg p-4 ${alertStyles[type]} ${className}`}>
      <div className="flex items-start space-x-3">
        <Icon size={20} className="flex-shrink-0 mt-0.5" />
        <div className="flex-1">
          {title && <h4 className="font-medium mb-1">{title}</h4>}
          <p className="text-sm">{message}</p>
          {actions && <div className="mt-3">{actions}</div>}
        </div>
        {onDismiss && (
          <button
            onClick={onDismiss}
            className="text-gray-400 hover:text-white transition-colors"
          >
            <XCircle size={16} />
          </button>
        )}
      </div>
    </div>
  );
};

export const LoadingSpinner: React.FC<LoadingSpinnerProps> = ({
  size = 'md',
  className = '',
  message
}) => {
  const sizeClasses = {
    sm: 'w-4 h-4',
    md: 'w-6 h-6',
    lg: 'w-8 h-8'
  };

  return (
    <div className={`flex flex-col items-center justify-center space-y-2 ${className}`}>
      <Loader2 className={`animate-spin text-blue-400 ${sizeClasses[size]}`} />
      {message && <p className="text-gray-400 text-sm">{message}</p>}
    </div>
  );
};

export const EmptyState: React.FC<EmptyStateProps> = ({
  icon,
  title,
  message,
  action,
  className = ''
}) => {
  return (
    <div className={`flex flex-col items-center justify-center py-12 px-4 text-center ${className}`}>
      {icon && <div className="text-gray-500 mb-4">{icon}</div>}
      <h3 className="text-lg font-medium text-gray-300 mb-2">{title}</h3>
      <p className="text-gray-400 mb-6 max-w-sm">{message}</p>
      {action && <div>{action}</div>}
    </div>
  );
};

// Loading state for full panels
export const PanelLoading: React.FC<{ message?: string }> = ({ 
  message = 'Loading...' 
}) => (
  <div className="flex-1 flex items-center justify-center">
    <LoadingSpinner size="lg" message={message} />
  </div>
);

// Error state for full panels
export const PanelError: React.FC<{ 
  message: string; 
  onRetry?: () => void;
  onDismiss?: () => void;
}> = ({ message, onRetry, onDismiss }) => (
  <div className="flex-1 flex items-center justify-center p-4">
    <Alert
      type="error"
      title="Error"
      message={message}
      onDismiss={onDismiss}
      actions={
        onRetry ? (
          <button
            onClick={onRetry}
            className="px-3 py-1 bg-red-600 text-white rounded hover:bg-red-700 transition-colors text-sm"
          >
            Try Again
          </button>
        ) : undefined
      }
    />
  </div>
);

export default {
  Alert,
  LoadingSpinner,
  EmptyState,
  PanelLoading,
  PanelError
};
