import React, { useState, useRef, useCallback } from 'react';
import { MoreVertical, GripVertical } from 'lucide-react';

export interface ResizeHandleProps {
  direction: 'horizontal' | 'vertical' | 'corner';
  onResize: (deltaX: number, deltaY: number) => void;
  className?: string;
}

export interface DropdownMenuProps {
  trigger?: React.ReactNode;
  children: React.ReactNode;
  align?: 'left' | 'right';
  className?: string;
}

export interface DragHandleProps {
  onDragStart?: (e: React.MouseEvent) => void;
  onDrag?: (e: React.MouseEvent) => void;
  onDragEnd?: (e: React.MouseEvent) => void;
  className?: string;
  children?: React.ReactNode;
}

export const ResizeHandle: React.FC<ResizeHandleProps> = ({
  direction,
  onResize,
  className = ''
}) => {
  const [isResizing, setIsResizing] = useState(false);
  const startPos = useRef({ x: 0, y: 0 });

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    setIsResizing(true);
    startPos.current = { x: e.clientX, y: e.clientY };

    const handleMouseMove = (e: MouseEvent) => {
      const deltaX = e.clientX - startPos.current.x;
      const deltaY = e.clientY - startPos.current.y;
      onResize(deltaX, deltaY);
      startPos.current = { x: e.clientX, y: e.clientY };
    };

    const handleMouseUp = () => {
      setIsResizing(false);
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
  }, [onResize]);

  const directionClasses = {
    horizontal: 'w-1 h-full cursor-ew-resize',
    vertical: 'w-full h-1 cursor-ns-resize',
    corner: 'w-3 h-3 cursor-nw-resize'
  };

  return (
    <div
      className={`
        ${directionClasses[direction]}
        ${isResizing ? 'bg-blue-500' : 'bg-transparent hover:bg-gray-600'}
        transition-colors duration-150
        ${className}
      `}
      onMouseDown={handleMouseDown}
    />
  );
};

export const DropdownMenu: React.FC<DropdownMenuProps> = ({
  trigger,
  children,
  align = 'right',
  className = ''
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen]);

  const alignmentClasses = {
    left: 'left-0',
    right: 'right-0'
  };

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="p-1 text-gray-400 hover:text-white hover:bg-gray-700 rounded transition-colors"
      >
        {trigger || <MoreVertical size={16} />}
      </button>
      
      {isOpen && (
        <div
          className={`
            absolute top-full mt-1 min-w-48 z-50
            bg-gray-800 border border-gray-600 rounded-lg shadow-lg
            ${alignmentClasses[align]}
            ${className}
          `}
        >
          {children}
        </div>
      )}
    </div>
  );
};

export const DropdownItem: React.FC<{
  onClick?: () => void;
  children: React.ReactNode;
  icon?: React.ReactNode;
  danger?: boolean;
  disabled?: boolean;
}> = ({ onClick, children, icon, danger, disabled }) => (
  <button
    onClick={() => {
      if (!disabled && onClick) {
        onClick();
      }
    }}
    disabled={disabled}
    className={`
      w-full px-3 py-2 text-left flex items-center space-x-2
      ${disabled 
        ? 'text-gray-500 cursor-not-allowed' 
        : danger 
          ? 'text-red-400 hover:bg-red-900/20' 
          : 'text-gray-300 hover:bg-gray-700'
      }
      transition-colors duration-150
      first:rounded-t-lg last:rounded-b-lg
    `}
  >
    {icon && <span className="flex-shrink-0">{icon}</span>}
    <span>{children}</span>
  </button>
);

export const DragHandle: React.FC<DragHandleProps> = ({
  onDragStart,
  onDrag,
  onDragEnd,
  className = '',
  children
}) => {
  const [isDragging, setIsDragging] = useState(false);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    setIsDragging(true);
    onDragStart?.(e);

    const handleMouseMove = (e: MouseEvent) => {
      onDrag?.(e as any);
    };

    const handleMouseUp = (e: MouseEvent) => {
      setIsDragging(false);
      onDragEnd?.(e as any);
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
  }, [onDragStart, onDrag, onDragEnd]);

  return (
    <div
      className={`
        cursor-move select-none
        ${isDragging ? 'opacity-60' : ''}
        ${className}
      `}
      onMouseDown={handleMouseDown}
    >
      {children || <GripVertical size={16} className="text-gray-500" />}
    </div>
  );
};

// Separator for dropdown menus
export const DropdownSeparator: React.FC = () => (
  <div className="border-t border-gray-600 my-1" />
);

export default {
  ResizeHandle,
  DropdownMenu,
  DropdownItem,
  DropdownSeparator,
  DragHandle
};