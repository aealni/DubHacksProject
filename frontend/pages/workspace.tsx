import React, { useEffect, useState } from 'react';
import Head from 'next/head';
import { useRouter } from 'next/router';
import BottomTabs from '../components/BottomTabs';
import WorkspaceOutlet from '../components/WorkspaceOutlet';
import EducationOverlay from '../components/EducationOverlay';
import { useTabsStore } from '../stores/tabsStore';
import { useTabKeyboardShortcuts } from '../hooks/useTabKeyboardShortcuts';

export default function Workspace() {
  const { loadFromStorage, syncWithUrl } = useTabsStore();
  const [isHydrated, setIsHydrated] = useState(false);
  const [showEducationOverlay, setShowEducationOverlay] = useState(false);
  const [educationModeEnabled, setEducationModeEnabled] = useState(false);
  const [isEducationDetailOpen, setIsEducationDetailOpen] = useState(false);
  const [lastEducationView, setLastEducationView] = useState<'main' | 'detail'>('main');
  const [lastDetailAnchor, setLastDetailAnchor] = useState<string | null>(null);
  const [targetEducationView, setTargetEducationView] = useState<'main' | 'detail' | null>(null);
  const router = useRouter();
  
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

  useEffect(() => {
    const mode = router.query?.mode;
    if (typeof mode === 'string' && mode.toLowerCase() === 'education') {
      setShowEducationOverlay(true);
      setEducationModeEnabled(true);
    }
  }, [router.query?.mode]);

  const handleCloseEducationOverlay = () => {
    setShowEducationOverlay(false);
    setEducationModeEnabled(true);
    setTargetEducationView(null);
  };

  const handleEducationOverlayStateChange = (state: 'main' | 'detail' | 'none') => {
    if (state === 'detail') {
      setIsEducationDetailOpen(true);
      setLastEducationView('detail');
    } else if (state === 'main') {
      setIsEducationDetailOpen(false);
      setLastEducationView('main');
    } else {
      setIsEducationDetailOpen(false);
    }

    setTargetEducationView(null);
  };

  const handleOpenEducation = () => {
    if (lastEducationView === 'detail' && lastDetailAnchor) {
      setTargetEducationView('detail');
    } else {
      setShowEducationOverlay(true);
      setTargetEducationView('main');
    }
  };

  // Show a loading state during hydration
  if (!isHydrated) {
    return (
      <div className="fixed inset-0 overflow-hidden">
        <Head>
          <title>Universal Data Cleaner - Workspace</title>
          <meta name="description" content="Interactive data cleaning and analysis workspace" />
        </Head>
        
        <div className="flex items-center justify-center h-full bg-gray-50 text-gray-900 dark:bg-slate-950 dark:text-slate-100 transition-colors">
          <div className="text-center">
            <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500 mb-4"></div>
            <p className="text-gray-600 dark:text-slate-300">Loading workspace...</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 overflow-hidden bg-gray-50 text-gray-900 transition-colors dark:bg-slate-950 dark:text-slate-100" suppressHydrationWarning>
      <Head>
        <title>Universal Data Cleaner - Workspace</title>
        <meta name="description" content="Interactive data cleaning and analysis workspace" />
      </Head>
      
      {/* Main workspace content */}
      <WorkspaceOutlet className="h-full w-full" />
      
      {/* Bottom tab bar */}
      <BottomTabs />

      <EducationOverlay
        isOpen={showEducationOverlay}
        onClose={handleCloseEducationOverlay}
        onOpenMainOverlay={() => setShowEducationOverlay(true)}
        onDetailPanelChange={setIsEducationDetailOpen}
        onOverlayStateChange={handleEducationOverlayStateChange}
        onRequestCloseMainOverlay={handleCloseEducationOverlay}
        onLastDetailAnchorChange={setLastDetailAnchor}
        targetView={targetEducationView}
      />

      {educationModeEnabled && !showEducationOverlay && !isEducationDetailOpen && targetEducationView !== 'detail' && (
        <button
          type="button"
          onClick={handleOpenEducation}
          className="fixed top-2 right-4 z-[2500] rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-900 shadow-lg transition hover:bg-gray-50 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100 dark:hover:bg-slate-700"
          aria-label="Open education overlay"
        >
          Open Education
        </button>
      )}
    </div>
  );
}