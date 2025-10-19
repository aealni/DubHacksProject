import React, { Suspense, useMemo } from 'react';
import { useTabsStore, useActiveTab } from '../stores/tabsStore';
import { WorkspaceOutletProps } from '../types/tabs';
import { 
  CanvasTabProvider, 
  DataTabProvider, 
  GraphsTabProvider, 
  ModelsTabProvider 
} from './tabs';

// Loading component for tab content
const TabContentLoading: React.FC<{ tabType: string }> = ({ tabType }) => (
  <div className="flex items-center justify-center h-full bg-gray-50">
    <div className="text-center">
      <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500 mb-4"></div>
      <p className="text-gray-600">Loading {tabType}...</p>
    </div>
  </div>
);

// Error boundary for tab content
interface TabErrorBoundaryState {
  hasError: boolean;
  error?: Error;
}

class TabErrorBoundary extends React.Component<
  { children: React.ReactNode; tabId: string; tabType: string },
  TabErrorBoundaryState
> {
  constructor(props: any) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(error: Error): TabErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error(`Tab ${this.props.tabType} (${this.props.tabId}) error:`, error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex items-center justify-center h-full bg-red-50">
          <div className="text-center p-8">
            <div className="text-red-500 mb-4">
              <svg className="w-16 h-16 mx-auto" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
              </svg>
            </div>
            <h3 className="text-lg font-semibold text-red-800 mb-2">
              {this.props.tabType} Error
            </h3>
            <p className="text-red-600 mb-4">
              Something went wrong in this tab. You can try refreshing or closing the tab.
            </p>
            <button
              className="px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700 transition-colors"
              onClick={() => window.location.reload()}
            >
              Refresh Page
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

// Tab content renderer
const TabContent: React.FC<{ tabId: string; tabType: string }> = ({ tabId, tabType }) => {
  console.log(`TabContent rendering for tabId: ${tabId}, tabType: ${tabType}`);
  // Memoize the content component to prevent unnecessary re-renders
  const TabComponent = useMemo(() => {
    switch (tabType) {
      case 'canvas':
        return <CanvasTabProvider tabId={tabId} isActive={true} />;
      case 'data':
        return <DataTabProvider tabId={tabId} isActive={true} />;
      case 'graphs':
        return <GraphsTabProvider tabId={tabId} isActive={true} />;
      case 'models':
        return <ModelsTabProvider tabId={tabId} isActive={true} />;
      default:
        return (
          <div className="flex items-center justify-center h-full bg-gray-50">
            <div className="text-center">
              <p className="text-gray-600">Unknown tab type: {tabType}</p>
            </div>
          </div>
        );
    }
  }, [tabId, tabType]); // Add dependencies!

  return (
    <TabErrorBoundary tabId={tabId} tabType={tabType}>
      <Suspense fallback={<TabContentLoading tabType={tabType} />}>
        <div 
          id={`tabpanel-${tabId}`}
          role="tabpanel"
          aria-labelledby={`tab-${tabId}`}
          className="h-full w-full"
        >
          {TabComponent}
        </div>
      </Suspense>
    </TabErrorBoundary>
  );
};

// Main WorkspaceOutlet component
export const WorkspaceOutlet: React.FC<WorkspaceOutletProps> = ({ 
  className = '' 
}) => {
  const activeTab = useActiveTab();

  if (!activeTab) {
    return (
      <div className={`flex items-center justify-center h-full bg-gray-50 ${className}`}>
        <div className="text-center">
          <p className="text-gray-600 mb-4">No active tab</p>
          <button
            className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 transition-colors"
            onClick={() => {
              try { throw new Error('WorkspaceOutlet fallback create clicked'); } catch (err: any) { console.log('[WorkspaceOutlet] fallback create clicked', { stack: err.stack }); }
              try {
                const ev = new CustomEvent('open-plus-menu', { cancelable: true });
                const dispatched = window.dispatchEvent(ev);
                const handled = !dispatched;
                console.log('[WorkspaceOutlet] dispatched open-plus-menu', { handled });
                if (!handled) {
                  // Fallback if no listener handled the event
                  useTabsStore.getState().createCanvasTab();
                }
              } catch (e) {
                useTabsStore.getState().createCanvasTab();
              }
            }}
          >
            Create Canvas Tab
          </button>
        </div>
      </div>
    );
  }

  return (
    <div 
      className={`h-full w-full ${className}`}
      style={{ 
        // Reserve space for the bottom tab bar (48px)
        paddingBottom: '48px' 
      }}
    >
      <TabContent key={`tab-content-${activeTab.id}`} tabId={activeTab.id} tabType={activeTab.type} />
    </div>
  );
};

export default WorkspaceOutlet;
