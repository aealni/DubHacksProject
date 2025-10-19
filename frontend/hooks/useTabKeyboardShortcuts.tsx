import React, { useEffect } from 'react';
import { useTabsStore } from '../stores/tabsStore';

// Platform detection
const isMac = typeof window !== 'undefined' && navigator.platform.toUpperCase().indexOf('MAC') >= 0;

// Key combination helpers
const isModifierKey = (event: KeyboardEvent) => {
  return isMac ? event.metaKey : event.ctrlKey;
};

const isAltKey = (event: KeyboardEvent) => {
  return event.altKey;
};

// Keyboard shortcuts configuration
const SHORTCUTS = {
  NEW_CANVAS_TAB: { 
    key: 'n', 
    modifiers: ['mod', 'alt'], 
    description: `${isMac ? 'Cmd' : 'Ctrl'}+Alt+N - New Canvas Tab` 
  },
  CLOSE_TAB: { 
    key: 'w', 
    modifiers: ['mod'], 
    description: `${isMac ? 'Cmd' : 'Ctrl'}+W - Close Active Tab` 
  },
  SWITCH_TAB_1: { 
    key: '1', 
    modifiers: ['mod'], 
    description: `${isMac ? 'Cmd' : 'Ctrl'}+1 - Switch to Tab 1` 
  },
  SWITCH_TAB_2: { 
    key: '2', 
    modifiers: ['mod'], 
    description: `${isMac ? 'Cmd' : 'Ctrl'}+2 - Switch to Tab 2` 
  },
  SWITCH_TAB_3: { 
    key: '3', 
    modifiers: ['mod'], 
    description: `${isMac ? 'Cmd' : 'Ctrl'}+3 - Switch to Tab 3` 
  },
  SWITCH_TAB_4: { 
    key: '4', 
    modifiers: ['mod'], 
    description: `${isMac ? 'Cmd' : 'Ctrl'}+4 - Switch to Tab 4` 
  },
  SWITCH_TAB_5: { 
    key: '5', 
    modifiers: ['mod'], 
    description: `${isMac ? 'Cmd' : 'Ctrl'}+5 - Switch to Tab 5` 
  },
  SWITCH_TAB_6: { 
    key: '6', 
    modifiers: ['mod'], 
    description: `${isMac ? 'Cmd' : 'Ctrl'}+6 - Switch to Tab 6` 
  },
  SWITCH_TAB_7: { 
    key: '7', 
    modifiers: ['mod'], 
    description: `${isMac ? 'Cmd' : 'Ctrl'}+7 - Switch to Tab 7` 
  },
  SWITCH_TAB_8: { 
    key: '8', 
    modifiers: ['mod'], 
    description: `${isMac ? 'Cmd' : 'Ctrl'}+8 - Switch to Tab 8` 
  },
  SWITCH_TAB_9: { 
    key: '9', 
    modifiers: ['mod'], 
    description: `${isMac ? 'Cmd' : 'Ctrl'}+9 - Switch to Tab 9` 
  }
} as const;

// Check if event matches shortcut
const matchesShortcut = (event: KeyboardEvent, shortcut: typeof SHORTCUTS[keyof typeof SHORTCUTS]) => {
  const keyMatches = event.key.toLowerCase() === shortcut.key.toLowerCase();
  const mods = (shortcut.modifiers as unknown) as string[];
  const modMatches = mods.includes('mod') ? isModifierKey(event) : !isModifierKey(event);
  const altMatches = mods.includes('alt') ? isAltKey(event) : !isAltKey(event);
  
  return keyMatches && modMatches && altMatches;
};

// Main keyboard shortcuts hook
export const useTabKeyboardShortcuts = () => {
  const { 
    tabs, 
    activeTabId, 
    createCanvasTab, 
    closeActiveTab, 
    switchToTabByIndex 
  } = useTabsStore();

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      // Skip if user is typing in an input field
      const target = event.target as HTMLElement;
      if (target.tagName === 'INPUT' || 
          target.tagName === 'TEXTAREA' || 
          target.contentEditable === 'true') {
        return;
      }

      // New canvas tab shortcut
      if (matchesShortcut(event, SHORTCUTS.NEW_CANVAS_TAB)) {
        event.preventDefault();
        createCanvasTab();
        return;
      }

      // Close tab shortcut
      if (matchesShortcut(event, SHORTCUTS.CLOSE_TAB)) {
        event.preventDefault();
        closeActiveTab();
        return;
      }

      // Tab switching shortcuts (1-9)
      for (let i = 1; i <= 9; i++) {
        const shortcutKey = `SWITCH_TAB_${i}` as keyof typeof SHORTCUTS;
        if (matchesShortcut(event, SHORTCUTS[shortcutKey])) {
          event.preventDefault();
          switchToTabByIndex(i - 1); // 0-based index
          return;
        }
      }
    };

    // Add event listener
    document.addEventListener('keydown', handleKeyDown);

    // Cleanup
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [tabs, activeTabId, createCanvasTab, closeActiveTab, switchToTabByIndex]);

  // Return shortcuts info for help/documentation
  return {
    shortcuts: SHORTCUTS,
    platform: isMac ? 'mac' : 'windows'
  };
};

// Hook for displaying keyboard shortcuts help
export const useTabShortcutsHelp = () => {
  const { shortcuts, platform } = useTabKeyboardShortcuts();
  
  return {
    shortcuts: Object.values(shortcuts),
    platform,
    shortcutsList: [
      {
        category: 'Tab Management',
        items: [
          shortcuts.NEW_CANVAS_TAB.description,
          shortcuts.CLOSE_TAB.description
        ]
      },
      {
        category: 'Tab Navigation',
        items: [
          shortcuts.SWITCH_TAB_1.description,
          shortcuts.SWITCH_TAB_2.description,
          shortcuts.SWITCH_TAB_3.description,
          shortcuts.SWITCH_TAB_4.description,
          shortcuts.SWITCH_TAB_5.description,
          shortcuts.SWITCH_TAB_6.description,
          shortcuts.SWITCH_TAB_7.description,
          shortcuts.SWITCH_TAB_8.description,
          shortcuts.SWITCH_TAB_9.description
        ]
      }
    ]
  };
};

// Component for displaying shortcuts help
export const TabShortcutsHelp: React.FC<{ className?: string }> = ({ className = '' }) => {
  const { shortcutsList } = useTabShortcutsHelp();

  return (
    <div className={`bg-white rounded-lg border border-gray-200 p-4 ${className}`}>
      <h3 className="text-lg font-semibold text-gray-900 mb-4">Keyboard Shortcuts</h3>
      
      {shortcutsList.map((category, categoryIndex) => (
        <div key={categoryIndex} className="mb-4">
          <h4 className="text-sm font-medium text-gray-700 mb-2">{category.category}</h4>
          <ul className="space-y-1">
            {category.items.map((shortcut, index) => (
              <li key={index} className="text-sm text-gray-600 font-mono">
                {shortcut}
              </li>
            ))}
          </ul>
        </div>
      ))}
      
      <div className="mt-4 pt-4 border-t border-gray-200">
        <p className="text-xs text-gray-500">
          Shortcuts work when not typing in input fields or text areas.
        </p>
      </div>
    </div>
  );
};

export default useTabKeyboardShortcuts;