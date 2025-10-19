import React, { useEffect, useState } from 'react';
import Head from 'next/head';
import BottomTabs from '../components/BottomTabs';
import WorkspaceOutlet from '../components/WorkspaceOutlet';
import { useTabsStore } from '../stores/tabsStore';
import { useTabKeyboardShortcuts } from '../hooks/useTabKeyboardShortcuts';

export default function Workspace() {
  const { loadFromStorage, syncWithUrl } = useTabsStore();
  const [isHydrated, setIsHydrated] = useState(false);
  
  // Enable keyboard shortcuts
  useTabKeyboardShortcuts();

  // Initialize tabs on mount (client-side only)
  useEffect(() => {
    // Load persisted state first
    loadFromStorage();
    
    // Then sync with URL if present
    syncWithUrl();
    
    // Mark as hydrated to prevent hydration mismatches
    setIsHydrated(true);
  }, [loadFromStorage, syncWithUrl]);

  // Show a loading state during hydration
  if (!isHydrated) {
    return (
      <div className="fixed inset-0 overflow-hidden">
        <Head>
          <title>Universal Data Cleaner - Workspace</title>
          <meta name="description" content="Interactive data cleaning and analysis workspace" />
        </Head>
        
        <div className="flex items-center justify-center h-full bg-gray-50">
          <div className="text-center">
            <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500 mb-4"></div>
            <p className="text-gray-600">Loading workspace...</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 overflow-hidden" suppressHydrationWarning>
      <Head>
        <title>Universal Data Cleaner - Workspace</title>
        <meta name="description" content="Interactive data cleaning and analysis workspace" />
      </Head>
      
      {/* Main workspace content */}
      <WorkspaceOutlet className="h-full w-full" />
      
      {/* Bottom tab bar */}
      <BottomTabs />
    </div>
  );
}