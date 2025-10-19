import React, { useState, useRef, useEffect } from 'react';
import { useTabsStore } from '../stores/tabsStore';
import { Tab, BottomTabsProps, TAB_TYPES } from '../types/tabs';

// Individual tab button component
interface TabButtonProps {
  tab: Tab;
  isActive: boolean;
  onSwitch: (tabId: string) => void;
  onClose: (tabId: string) => void;
  onContextMenu?: (event: React.MouseEvent, tabId: string) => void;
}

const TabButton: React.FC<TabButtonProps> = ({
  tab,
  isActive,
  onSwitch,
  onClose,
  onContextMenu
}) => {
  const [isHovered, setIsHovered] = useState(false);

  const handleClick = (e: React.MouseEvent) => {
    e.preventDefault();
    onSwitch(tab.id);
  };

  const handleClose = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    onClose(tab.id);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      onSwitch(tab.id);
    } else if (e.key === 'Delete' && tab.isCloseable) {
      e.preventDefault();
      onClose(tab.id);
    }
  };

  return (
    <div
      className={`
        relative flex items-center min-w-0 max-w-48 h-full px-3 cursor-pointer
        transition-all duration-200 ease-in-out
        ${isActive 
          ? 'bg-white text-gray-900 border-t-2 border-blue-500' 
          : 'bg-gray-100 text-gray-600 hover:bg-gray-200 hover:text-gray-800'
        }
        ${isHovered ? 'shadow-sm' : ''}
        focus-within:outline-none focus-within:ring-2 focus-within:ring-blue-500 focus-within:ring-inset
      `}
      onClick={handleClick}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      onContextMenu={(e) => onContextMenu?.(e, tab.id)}
      role="tab"
      tabIndex={isActive ? 0 : -1}
      aria-selected={isActive}
      aria-controls={`tabpanel-${tab.id}`}
      onKeyDown={handleKeyDown}
    >
      {/* Tab content */}
      <div className="flex items-center min-w-0 flex-1">
        {/* Tab type icon */}
        <div className="flex-shrink-0 w-4 h-4 mr-2">
          {/* Simple SVG icons for each tab type */}
          {tab.type === 'canvas' && (
            <svg viewBox="0 0 16 16" fill="currentColor" className="w-4 h-4">
              <path d="M2 2h12v12H2V2zm1 1v10h10V3H3zm2 2h6v6H5V5z"/>
            </svg>
          )}
          {tab.type === 'data' && (
            <svg viewBox="0 0 16 16" fill="currentColor" className="w-4 h-4">
              <path d="M1 3h14v2H1V3zm0 3h14v2H1V6zm0 3h14v2H1V9zm0 3h14v2H1v-2z"/>
            </svg>
          )}
          {tab.type === 'graphs' && (
            <svg viewBox="0 0 16 16" fill="currentColor" className="w-4 h-4">
              <path d="M1 14h14v1H1v-1zm1-1h2V9H2v4zm3 0h2V6H5v7zm3 0h2V4H8v9zm3 0h2V2h-2v11z"/>
            </svg>
          )}
          {tab.type === 'models' && (
            <svg viewBox="0 0 16 16" fill="currentColor" className="w-4 h-4">
              <path d="M8 1L2 4v8l6 3 6-3V4L8 1zM7 4.7L3.5 6.5 7 8.3v5.4l-4-2V7.8l4 2.2zm2 0v5.6l4-2V7.8l-4 2.2V4.7zm4.5 1.8L9.5 4.7 8 3.9 6.5 4.7 2.5 6.5 8 9.1l5.5-2.6z"/>
            </svg>
          )}
        </div>

        {/* Tab title with truncation */}
        <span className="truncate text-sm font-medium">
          {tab.title}
        </span>

        {/* Dirty indicator */}
        {tab.isDirty && (
          <div className="flex-shrink-0 w-2 h-2 ml-2 bg-orange-500 rounded-full" 
               title="Unsaved changes"/>
        )}
      </div>

      {/* Close button */}
      {tab.isCloseable && (isHovered || isActive) && (
        <button
          className="flex-shrink-0 ml-2 p-1 rounded hover:bg-gray-300 transition-colors duration-150"
          onClick={handleClose}
          title={`Close ${tab.title}`}
          aria-label={`Close ${tab.title}`}
          tabIndex={-1}
        >
          <svg viewBox="0 0 16 16" fill="currentColor" className="w-3 h-3">
            <path d="M3.72 3.72a.75.75 0 011.06 0L8 6.94l3.22-3.22a.75.75 0 111.06 1.06L9.06 8l3.22 3.22a.75.75 0 11-1.06 1.06L8 9.06l-3.22 3.22a.75.75 0 01-1.06-1.06L6.94 8 3.72 4.78a.75.75 0 010-1.06z"/>
          </svg>
        </button>
      )}
    </div>
  );
};

// New tab button
const NewTabButton: React.FC<{ onNewTab: () => void }> = ({ onNewTab }) => {
  return (
    <button
      className="flex items-center justify-center w-8 h-full text-gray-500 hover:text-gray-700 hover:bg-gray-200 transition-colors duration-150"
      onClick={onNewTab}
      title="New Canvas Tab (Ctrl+Alt+N)"
      aria-label="New Canvas Tab"
    >
      <svg viewBox="0 0 16 16" fill="currentColor" className="w-4 h-4">
        <path d="M8 2a.5.5 0 01.5.5v5h5a.5.5 0 010 1h-5v5a.5.5 0 01-1 0v-5h-5a.5.5 0 010-1h5v-5A.5.5 0 018 2z"/>
      </svg>
    </button>
  );
};

// Main BottomTabs component
export const BottomTabs: React.FC<BottomTabsProps> = ({ 
  className = '', 
  onTabEvent 
}) => {
  const { 
    tabs, 
    activeTabId, 
    switchToTab, 
    closeTab, 
    createCanvasTab 
  } = useTabsStore();

  const tabsRef = useRef<HTMLDivElement>(null);
  const [showScrollButtons, setShowScrollButtons] = useState(false);

  // Check if tabs overflow and need scroll buttons
  useEffect(() => {
    const checkOverflow = () => {
      if (tabsRef.current) {
        const hasOverflow = tabsRef.current.scrollWidth > tabsRef.current.clientWidth;
        setShowScrollButtons(hasOverflow);
      }
    };

    checkOverflow();
    window.addEventListener('resize', checkOverflow);
    return () => window.removeEventListener('resize', checkOverflow);
  }, [tabs]);

  // Scroll tabs container
  const scrollTabs = (direction: 'left' | 'right') => {
    if (tabsRef.current) {
      const scrollAmount = 200;
      const currentScroll = tabsRef.current.scrollLeft;
      const newScroll = direction === 'left' 
        ? currentScroll - scrollAmount 
        : currentScroll + scrollAmount;
      
      tabsRef.current.scrollTo({
        left: newScroll,
        behavior: 'smooth'
      });
    }
  };

  // Ensure active tab is visible
  useEffect(() => {
    if (activeTabId && tabsRef.current) {
      const activeButton = tabsRef.current.querySelector(`[aria-controls="tabpanel-${activeTabId}"]`);
      if (activeButton) {
        activeButton.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'nearest' });
      }
    }
  }, [activeTabId]);

  const handleTabSwitch = (tabId: string) => {
    switchToTab(tabId);
    onTabEvent?.({ type: 'switch', tabId, previousTabId: activeTabId || undefined });
  };

  const handleTabClose = (tabId: string) => {
    const success = closeTab(tabId);
    if (success) {
      onTabEvent?.({ type: 'close', tabId, previousTabId: activeTabId || undefined });
    }
  };

  const handleNewTab = () => {
    try {
      throw new Error('BottomTabs NewTab invoked');
    } catch (err: any) {
      console.log('[BottomTabs] NewTab clicked', { stack: err.stack });
    }
    // Instead of directly creating a canvas tab here, dispatch a global event
    // that the unified plus/menu (in InfiniteCanvas) will listen for and open.
    try {
      // Make the event cancelable so the receiver can call preventDefault()
      // to signal that it handled the request.
      const ev = new CustomEvent('open-plus-menu', { cancelable: true });
      const dispatchResult = window.dispatchEvent(ev);
      // dispatchEvent returns false if preventDefault() was called by a listener.
      const handled = !dispatchResult;
      console.log('[BottomTabs] dispatched open-plus-menu event', { handled });
      if (!handled) {
  // No listener handled the event - fallback to creating a canvas tab
        const newTabId = createCanvasTab();
        onTabEvent?.({ type: 'create', tabId: newTabId, previousTabId: activeTabId || undefined });
      }
    } catch (e) {
      // Fallback: if dispatch throws for some reason, still create a canvas tab
      const newTabId = createCanvasTab();
      onTabEvent?.({ type: 'create', tabId: newTabId, previousTabId: activeTabId || undefined });
    }
  };

  const handleContextMenu = (event: React.MouseEvent, tabId: string) => {
    event.preventDefault();
    // Context menu implementation could go here
    // For now, we'll just focus the tab
    switchToTab(tabId);
  };

  return (
    <div 
      className={`
        fixed bottom-0 left-0 right-0 z-50 
        bg-gray-50 border-t border-gray-200 shadow-lg
        ${className}
      `}
      style={{ height: '48px' }}
    >
      {/* Tabs container */}
      <div className="flex h-full">
        {/* Left scroll button */}
        {showScrollButtons && (
          <button
            className="flex-shrink-0 px-2 text-gray-500 hover:text-gray-700 hover:bg-gray-200 transition-colors"
            onClick={() => scrollTabs('left')}
            aria-label="Scroll tabs left"
          >
            <svg viewBox="0 0 16 16" fill="currentColor" className="w-4 h-4">
              <path d="M10 2L4 8l6 6V2z"/>
            </svg>
          </button>
        )}

        {/* Tabs */}
        <div 
          ref={tabsRef}
          className="flex-1 flex overflow-x-auto scrollbar-none"
          role="tablist"
          aria-label="Workspace tabs"
        >
          {tabs
            .sort((a, b) => a.order - b.order)
            .map(tab => (
              <TabButton
                key={tab.id}
                tab={tab}
                isActive={tab.id === activeTabId}
                onSwitch={handleTabSwitch}
                onClose={handleTabClose}
                onContextMenu={handleContextMenu}
              />
            ))}
        </div>

        {/* Right scroll button */}
        {showScrollButtons && (
          <button
            className="flex-shrink-0 px-2 text-gray-500 hover:text-gray-700 hover:bg-gray-200 transition-colors"
            onClick={() => scrollTabs('right')}
            aria-label="Scroll tabs right"
          >
            <svg viewBox="0 0 16 16" fill="currentColor" className="w-4 h-4">
              <path d="M6 2l6 6-6 6V2z"/>
            </svg>
          </button>
        )}

        {/* New tab button */}
        <div className="flex-shrink-0 border-l border-gray-200">
          <NewTabButton onNewTab={handleNewTab} />
        </div>
      </div>
    </div>
  );
};

export default BottomTabs;