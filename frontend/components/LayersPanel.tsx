import React, { useState } from 'react';
import { useRouter } from 'next/router';
import { Home, Lock, Unlock, Eye, EyeOff, Plus, X, GripVertical, GitMerge } from 'lucide-react';
import { Panel, Folder } from '../utils/canvas/types';
import ThemeToggle from './ThemeToggle';

interface LayersPanelProps {
  panels: Panel[];
  folders: Folder[];
  selectedPanelId: string | null;
  onPanelSelect: (panelId: string) => void;
  onPanelVisibilityToggle: (panelId: string) => void;
  onPanelRename: (panelId: string, newName: string) => void;
  onRemovePanel: (panelId: string) => void;
  onReorderPanels: (newPanels: Panel[]) => void;
  onCreateFolder: (name: string) => string;
  onDeleteFolder: (folderId: string) => void;
  onDeleteFolderOnly: (folderId: string) => void;
  onRenameFolder: (folderId: string, newName: string) => void;
  onToggleFolder: (folderId: string) => void;
  onMovePanelToFolder: (panelId: string, folderId?: string) => void;
  visiblePanels: Set<string>;
  isCollapsed: boolean;
  onToggleCollapse: () => void;
  onPanelLockToggle?: (panelId: string) => void;
}

export const LayersPanel: React.FC<LayersPanelProps> = ({
  panels,
  folders,
  selectedPanelId,
  onPanelSelect,
  onPanelVisibilityToggle,
  onPanelRename,
  onRemovePanel,
  onReorderPanels,
  onCreateFolder,
  onDeleteFolder,
  onDeleteFolderOnly,
  onRenameFolder,
  onToggleFolder,
  onMovePanelToFolder,
  visiblePanels,
  isCollapsed,
  onToggleCollapse,
  onPanelLockToggle
}) => {
  const router = useRouter();
  const [searchTerm, setSearchTerm] = useState('');
  const [editingPanelId, setEditingPanelId] = useState<string | null>(null);
  const [editingFolderId, setEditingFolderId] = useState<string | null>(null);
  const [newPanelName, setNewPanelName] = useState('');
  const [newFolderName, setNewFolderName] = useState('');
  const [showCreateFolder, setShowCreateFolder] = useState(false);
  const [draggedPanelId, setDraggedPanelId] = useState<string | null>(null);
  const [dragOverPanelId, setDragOverPanelId] = useState<string | null>(null);
  const [dragOverPosition, setDragOverPosition] = useState<'before' | 'after' | null>(null);
  const [dragOverFolderId, setDragOverFolderId] = useState<string | null>(null);
  const dragDisabled = searchTerm.trim().length > 0;
  const draggedPanel = panels.find(p => p.id === draggedPanelId);
  const headerActionsStyle: React.CSSProperties = isCollapsed
    ? { top: 'calc(100% + 0.75rem)', left: '50%', transform: 'translateX(-50%)' }
    : { top: '1rem', left: '1rem', transform: 'translateX(0)' };

  // Unified small icon button styling to match + / x visuals used across app
  const smallIconBtn = "inline-flex items-center justify-center h-7 w-7 rounded-md bg-white border border-slate-200 shadow-sm text-slate-600 hover:text-slate-900 hover:bg-slate-50 transition-colors dark:bg-slate-800 dark:border-slate-600 dark:text-slate-200 dark:hover:bg-slate-700";

  // Helper to build a full-size drag preview so the default semi-transparent small ghost is replaced
  const createDragPreview = (e: React.DragEvent, sourceEl: HTMLElement) => {
    const clone = sourceEl.cloneNode(true) as HTMLElement;
    clone.style.position = 'absolute';
    clone.style.top = '-10000px';
    clone.style.left = '-10000px';
    clone.style.width = sourceEl.offsetWidth + 'px';
    clone.style.pointerEvents = 'none';
    clone.style.boxShadow = '0 8px 24px rgba(0,0,0,0.25)';
    clone.style.opacity = '1';
    clone.style.transform = 'scale(1)';
    document.body.appendChild(clone);
    // Center cursor horizontally a bit inside the card
    e.dataTransfer.setDragImage(clone, Math.min(40, sourceEl.offsetWidth/3), 18);
    // Clean up at next tick so browser has time to snapshot the image
    setTimeout(() => {
      if (clone.parentNode) clone.parentNode.removeChild(clone);
    }, 0);
  };

  const getPanelIcon = (type: string) => {
    switch (type) {
      case 'dataset':
        return (
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
          </svg>
        );
      case 'graph':
        return (
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
          </svg>
        );
      case 'model':
        return (
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z" />
          </svg>
        );
      case 'merge':
        return <GitMerge className="w-4 h-4" />;
      default:
        return (
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 21a4 4 0 01-4-4V5a2 2 0 012-2h4a2 2 0 012 2v12a4 4 0 01-4 4zm0 0h12a2 2 0 002-2v-4a2 2 0 00-2-2h-2.343M11 7.343l1.657-1.657a2 2 0 012.828 0l2.829 2.829a2 2 0 010 2.828l-8.486 8.485M7 17v4a2 2 0 002 2h4M11 7.343V10a1 1 0 001 1h2.657" />
          </svg>
        );
    }
  };

  const getPanelName = (panel: Panel) => {
    if (panel.customName) return panel.customName;
    if (panel.data?.name) return panel.data.name;
    if (panel.data?.original_filename) return panel.data.original_filename;
    if (panel.data?.datasetName) return panel.data.datasetName;
    return `${panel.type.charAt(0).toUpperCase() + panel.type.slice(1)} Panel`;
  };

  const getPanelTypeColor = (type: string) => {
    switch (type) {
      case 'dataset':
        return 'text-blue-600 bg-blue-50';
      case 'graph':
        return 'text-green-600 bg-green-50';
      case 'model':
        return 'text-purple-600 bg-purple-50';
      case 'merge':
        return 'text-amber-600 bg-amber-50';
      default:
        return 'text-gray-600 bg-gray-50';
    }
  };

  const filteredPanels = panels.filter(panel =>
    getPanelName(panel).toLowerCase().includes(searchTerm.toLowerCase()) ||
    panel.type.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const handleStartRename = (panelId: string) => {
    const panel = panels.find(p => p.id === panelId);
    if (panel) {
      setEditingPanelId(panelId);
      setNewPanelName(getPanelName(panel));
    }
  };

  const handleConfirmRename = () => {
    if (editingPanelId && newPanelName.trim()) {
      onPanelRename(editingPanelId, newPanelName.trim());
    }
    setEditingPanelId(null);
    setNewPanelName('');
  };

  const handleCancelRename = () => {
    setEditingPanelId(null);
    setNewPanelName('');
  };

  const handleCreateFolderSubmit = () => {
    if (newFolderName.trim()) {
      onCreateFolder(newFolderName.trim());
      setNewFolderName('');
      setShowCreateFolder(false);
    }
  };

  const handleFolderRename = (folderId: string, name: string) => {
    setEditingFolderId(folderId);
    setNewFolderName(name);
  };

  const handleConfirmFolderRename = () => {
    if (editingFolderId && newFolderName.trim()) {
      onRenameFolder(editingFolderId, newFolderName.trim());
    }
    setEditingFolderId(null);
    setNewFolderName('');
  };

  // Auto-sorting functions
  const handleAutoSortByDataset = () => {
    // Group panels by their parent dataset or by being datasets themselves
    const datasetGroups = new Map<string, Panel[]>();
    
    panels.forEach(panel => {
      let groupKey = 'Ungrouped';
      
      if (panel.type === 'dataset') {
        groupKey = getPanelName(panel);
      } else if (panel.parentId) {
        const parentPanel = panels.find(p => p.id === panel.parentId);
        if (parentPanel) {
          groupKey = getPanelName(parentPanel);
        }
      }
      
      if (!datasetGroups.has(groupKey)) {
        datasetGroups.set(groupKey, []);
      }
      datasetGroups.get(groupKey)!.push(panel);
    });

    // Create folders for each group
    datasetGroups.forEach((groupPanels, groupName) => {
      if (groupPanels.length > 1) {
        const folderId = onCreateFolder(`Dataset: ${groupName}`);
        groupPanels.forEach(panel => {
          onMovePanelToFolder(panel.id, folderId);
        });
      }
    });
  };

  const handleAutoSortByType = () => {
    // Group panels by type
    const typeGroups = new Map<string, Panel[]>();
    
    panels.forEach(panel => {
      const typeKey = panel.type;
      if (!typeGroups.has(typeKey)) {
        typeGroups.set(typeKey, []);
      }
      typeGroups.get(typeKey)!.push(panel);
    });

    // Create folders for each type
    typeGroups.forEach((groupPanels, typeName) => {
      if (groupPanels.length > 1) {
        const typeNames = {
          'dataset': 'Datasets',
          'graph': 'Graphs',
          'model': 'Models',
          'model-results': 'Model Results',
          'model-visualization': 'Visualizations',
          'manipulation': 'Data Processing',
          'data-editor': 'Data Editors',
          'merge': 'Merge & Join'
        };
        const displayName = typeNames[typeName as keyof typeof typeNames] || typeName;
        
        const folderId = onCreateFolder(displayName);
        groupPanels.forEach(panel => {
          onMovePanelToFolder(panel.id, folderId);
        });
      }
    });
  };

  // Organize panels by folders
  const panelsInFolders = panels.filter(panel => panel.folderId);
  const panelsWithoutFolder = panels.filter(panel => !panel.folderId);

  return (
    <div 
      className={`fixed left-0 top-0 h-full bg-white shadow-xl border-r border-slate-200 transition-all duration-300 z-40 flex flex-col ${
        isCollapsed ? 'w-12' : 'w-80'
      }`}
      onWheel={(e) => {
        // Check if the wheel event is over a scrollable area within the layers panel
        const target = e.target as HTMLElement;
        const isOverScrollableArea = target.closest('.overflow-y-auto, .overflow-auto');
        
        // Only prevent propagation if not over a scrollable area (to allow normal scrolling)
        if (!isOverScrollableArea) {
          e.stopPropagation();
        }
      }}
      onMouseDown={(e) => {
        // Check if the mouse down event is over an interactive element
        const target = e.target as HTMLElement;
        const isOverInteractiveElement = target.closest('button, input, select, textarea, [contenteditable]');
        
        // Only prevent propagation if not over an interactive element
        if (!isOverInteractiveElement) {
          e.stopPropagation();
        }
      }}
    >
      {/* Header */}
      <div
        className={`relative flex items-center border-b border-slate-200 bg-slate-50 transition-all duration-300 ${
          isCollapsed ? 'p-3' : 'p-4 pl-14'
        }`}
      >
        {!isCollapsed && (
          <div className="flex items-center gap-3">
            <svg className="w-5 h-5 text-slate-700" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
            </svg>
            <h2 className="text-lg font-semibold text-slate-900">Layers</h2>
            <span className="text-sm text-slate-600 bg-slate-200 px-2.5 py-1 rounded-full font-medium">
              {panels.length}
            </span>
          </div>
        )}
        <button
          onClick={onToggleCollapse}
          className="ml-auto p-1.5 rounded-md hover:bg-slate-200 transition-colors"
          title={isCollapsed ? "Expand layers panel" : "Collapse layers panel"}
        >
          <svg className={`w-4 h-4 text-slate-600 transition-transform ${isCollapsed ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 19l-7-7 7-7m8 14l-7-7 7-7" />
          </svg>
        </button>
        <div
          className={`absolute flex gap-2 transition-all duration-300 ${isCollapsed ? 'flex-col items-center' : 'items-center'}`}
          style={headerActionsStyle}
        >
          <button
            type="button"
            onClick={() => router.push('/')}
            className={smallIconBtn}
            title="Go to home"
            aria-label="Go to home"
          >
            <Home className="w-4 h-4" />
          </button>
          <ThemeToggle variant="panel" className={smallIconBtn} />
        </div>
      </div>

      {!isCollapsed && (
        <>
          {/* Search */}
          <div className="p-4 border-b border-slate-200 bg-white">
            <div className="relative mb-3">
              <svg className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
              <input
                type="text"
                placeholder="Search layers..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-10 pr-4 py-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm transition-colors"
              />
            </div>
            
            {/* Management Buttons */}
            <div className="flex gap-2 mb-3">
              <button
                onClick={() => setShowCreateFolder(true)}
                className="flex-1 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2.5 rounded-lg text-sm font-medium transition-colors flex items-center justify-center gap-2"
                title="Create new folder"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                </svg>
                New Folder
              </button>
            </div>
            
            {/* Auto-sort Options */}
            <div className="flex gap-2">
              <button
                onClick={handleAutoSortByDataset}
                className="flex-1 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-200 px-3 py-2 rounded-md text-xs font-medium transition-colors"
                title="Group by dataset relationships"
              >
                By Dataset
              </button>
              <button
                onClick={handleAutoSortByType}
                className="flex-1 bg-violet-50 hover:bg-violet-100 text-violet-700 border border-violet-200 px-3 py-2 rounded-md text-xs font-medium transition-colors"
                title="Group by panel type"
              >
                By Type
              </button>
            </div>
          </div>

          {/* Create Folder Form */}
          {showCreateFolder && (
            <div className="p-4 bg-blue-50 border-b border-blue-200">
              <div className="flex items-center gap-2 mb-3">
                <input
                  type="text"
                  placeholder="Enter folder name..."
                  value={newFolderName}
                  onChange={(e) => setNewFolderName(e.target.value)}
                  onKeyPress={(e) => e.key === 'Enter' && handleCreateFolderSubmit()}
                  className="flex-1 px-3 py-2.5 border border-blue-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm"
                  autoFocus
                />
              </div>
              <div className="flex gap-2">
                <button
                  onClick={handleCreateFolderSubmit}
                  className="flex-1 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-md text-sm font-medium transition-colors"
                >
                  Create
                </button>
                <button
                  onClick={() => {
                    setShowCreateFolder(false);
                    setNewFolderName('');
                  }}
                  className="flex-1 bg-slate-200 hover:bg-slate-300 text-slate-700 px-4 py-2 rounded-md text-sm font-medium transition-colors"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}

          {/* Layers List */}
          <div className="flex-1 overflow-y-auto min-h-0">
            {filteredPanels.length === 0 ? (
              <div className="p-8 text-center text-slate-500">
                <svg className="w-12 h-12 mx-auto mb-4 text-slate-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
                </svg>
                <div className="text-sm font-medium text-slate-600 mb-1">
                  {searchTerm ? 'No layers match your search' : 'No layers yet'}
                </div>
                {!searchTerm && (
                  <div className="text-xs text-slate-400">
                    Upload data or create graphs to get started
                  </div>
                )}
              </div>
            ) : (
              <div className="p-2 space-y-1">
                {/* Folders */}
                {folders.map((folder) => {
                  const folderPanels = panelsInFolders.filter(panel => panel.folderId === folder.id);
                  // Always render folder, even if empty (so new folder appears immediately)
                  return (
                    <div key={folder.id} className="mb-3">
                      {/* Folder Header */}
                      <div 
                        className="flex items-center gap-3 p-3 rounded-lg bg-slate-50 border border-slate-200 hover:bg-slate-100 cursor-pointer group transition-all"
                        style={{ borderLeft: `4px solid ${folder.color}`, boxShadow: dragOverFolderId === folder.id && !dragOverPanelId ? 'inset 0 0 0 2px #3b82f6' : undefined }}
                        onDragOver={(e) => {
                          if (dragDisabled) return;
                          if (!draggedPanelId) return;
                          e.preventDefault();
                          setDragOverFolderId(folder.id);
                          setDragOverPanelId(null);
                          setDragOverPosition(null);
                        }}
                        onDrop={(e) => {
                          if (dragDisabled) return;
                          e.preventDefault();
                          const sourceId = e.dataTransfer.getData('text/plain');
                          if (!sourceId) return;
                          if (panels.find(p => p.id === sourceId)?.folderId === folder.id) return;
                          const newPanels = panels.map(p => p.id === sourceId ? { ...p, folderId: folder.id } : p);
                          onReorderPanels(newPanels);
                          setDraggedPanelId(null);
                          setDragOverFolderId(null);
                        }}
                      >
                        {/* Folder Icon and Name */}
                        <div className="flex items-center gap-3 flex-1 min-w-0">
                          <svg className="w-5 h-5 text-slate-600 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
                          </svg>
                          
                          {editingFolderId === folder.id ? (
                            <input
                              type="text"
                              value={newFolderName}
                              onChange={(e) => setNewFolderName(e.target.value)}
                              onKeyPress={(e) => e.key === 'Enter' && handleConfirmFolderRename()}
                              onBlur={handleConfirmFolderRename}
                              className="flex-1 px-3 py-1.5 border border-blue-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm text-slate-800 bg-white"
                              autoFocus
                            />
                          ) : (
                            <span className="flex-1 font-medium text-slate-800 text-sm truncate">{folder.name}</span>
                          )}
                        </div>
                        
                        {/* Folder Actions */}
                        <div className="flex items-center gap-1">
                          {/* Item Count */}
                          <span className="text-xs text-slate-600 bg-slate-200 px-2.5 py-1 rounded-full font-medium">
                            {folderPanels.length}
                          </span>

                          {/* Rename Button */}
                          <button
                            onClick={() => handleFolderRename(folder.id, folder.name)}
                            className="p-1.5 rounded-md text-slate-500 hover:text-slate-700 hover:bg-slate-200 transition-all"
                            title="Rename folder"
                          >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                            </svg>
                          </button>

                          {/* Delete Folder Contents Only */}
                          <button
                            onClick={() => onDeleteFolderOnly(folder.id)}
                            className="p-1.5 rounded-md text-orange-500 hover:text-orange-700 hover:bg-orange-50 transition-all"
                            title="Remove all items from folder (folder stays)"
                          >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 7h16m-1 0l-1 10a2 2 0 01-2 2H8a2 2 0 01-2-2L5 7m5 4v6m4-6v6M9 3h6a1 1 0 011 1v2H8V4a1 1 0 011-1z" />
                            </svg>
                          </button>

                          {/* Delete Folder and Contents */}
                          <button
                            onClick={() => onDeleteFolder(folder.id)}
                            className="p-1.5 rounded-md text-red-500 hover:text-red-700 hover:bg-red-50 transition-all"
                            title="Delete folder and all items"
                          >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                            </svg>
                          </button>

                          {/* Collapse/Expand Toggle */}
                          <button
                            onClick={() => onToggleFolder(folder.id)}
                            className="p-1.5 rounded-md text-slate-500 hover:text-slate-700 hover:bg-slate-200 transition-all"
                            title={folder.isExpanded ? "Collapse folder" : "Expand folder"}
                          >
                            <svg className={`w-4 h-4 transition-transform ${folder.isExpanded ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                            </svg>
                          </button>
                        </div>
                      </div>
                      
                      {/* Folder Contents */}
                      {folder.isExpanded && (
                        <div className="pl-6 space-y-1 mt-2">
                          {folderPanels.map((panel) => {
                            const isDragOver = dragOverPanelId === panel.id;
                            return (
                            <div
                              key={panel.id}
                              draggable={!dragDisabled}
                              onDragStart={(e) => {
                                if (dragDisabled) return;
                                e.dataTransfer.setData('text/plain', panel.id);
                                e.dataTransfer.setData('application/x-panel-id', panel.id);
                                e.dataTransfer.effectAllowed = 'move';
                                setDraggedPanelId(panel.id);
                                createDragPreview(e, e.currentTarget as HTMLElement);
                              }}
                              onDragEnd={() => {
                                setDraggedPanelId(null);
                                setDragOverPanelId(null);
                                setDragOverPosition(null);
                                setDragOverFolderId(null);
                              }}
                              onDragOver={(e) => {
                                if (dragDisabled) return;
                                if (!draggedPanelId || draggedPanelId === panel.id) return;
                                e.preventDefault();
                                const rect = (e.currentTarget as HTMLDivElement).getBoundingClientRect();
                                const offset = e.clientY - rect.top;
                                const pos = offset < rect.height / 2 ? 'before' : 'after';
                                setDragOverPanelId(panel.id);
                                setDragOverPosition(pos);
                                setDragOverFolderId(panel.folderId || null);
                              }}
                              onDrop={(e) => {
                                if (dragDisabled) return;
                                e.preventDefault();
                                const sourceId = e.dataTransfer.getData('text/plain');
                                if (!sourceId || sourceId === panel.id) return;
                                const sourcePanel = panels.find(p => p.id === sourceId);
                                if (!sourcePanel) return;
                                const targetFolderId = panel.folderId;
                                const updatedSource = { ...sourcePanel, folderId: targetFolderId };
                                const result: Panel[] = [];
                                panels.forEach(p => {
                                  if (p.id === sourceId) return;
                                  if (p.id === panel.id && dragOverPosition === 'before') {
                                    result.push(updatedSource);
                                  }
                                  result.push(p);
                                  if (p.id === panel.id && dragOverPosition === 'after') {
                                    result.push(updatedSource);
                                  }
                                });
                                onReorderPanels(result);
                                setDraggedPanelId(null);
                                setDragOverPanelId(null);
                                setDragOverPosition(null);
                              }}
                              className={`group relative flex items-center gap-3 p-3 rounded-lg cursor-pointer transition-all duration-200 border ${
                                selectedPanelId === panel.id 
                                  ? 'bg-blue-50 border-blue-200 shadow-sm' 
                                  : 'bg-white border-slate-200 hover:bg-slate-50 hover:border-slate-300'
                              } ${draggedPanelId === panel.id ? 'ring-2 ring-blue-400 shadow-lg scale-[1.01]' : ''}`}
                              style={{
                                // Make folder item span full width like a root item while visually keeping indentation via a left guideline
                                marginLeft: '-24px', // counteract pl-6 (24px) folder indentation for width
                                width: 'calc(100% + 24px)',
                                position: 'relative',
                                boxShadow: isDragOver && dragOverPosition === 'before' ? 'inset 0 3px 0 0 #3b82f6' : isDragOver && dragOverPosition === 'after' ? 'inset 0 -3px 0 0 #3b82f6' : undefined
                              }}
                              onClick={() => onPanelSelect(panel.id)}
                            >
                              {/* Indentation guide */}
                              <span className="absolute left-2 top-2 bottom-2 w-0.5 bg-slate-200 rounded" />
                              {/* Lock Toggle */}
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  onPanelLockToggle && onPanelLockToggle(panel.id);
                                }}
                                className={`flex-shrink-0 ${smallIconBtn}`}
                                title={panel.locked ? 'Unlock layer' : 'Lock layer'}
                              >
                                {panel.locked ? (<Lock size={16} />) : (<Unlock size={16} />)}
                              </button>
                              {/* Visibility Toggle */}
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  onPanelVisibilityToggle(panel.id);
                                }}
                                className={`flex-shrink-0 ${smallIconBtn} ${visiblePanels.has(panel.id) ? '' : 'opacity-60'}`}
                                title={visiblePanels.has(panel.id) ? 'Hide layer' : 'Show layer'}
                              >
                                {visiblePanels.has(panel.id) ? (<Eye size={16} />) : (<EyeOff size={16} />)}
                              </button>

                              {/* Panel Icon and Info */}
                              <div className="flex items-center gap-3 flex-1 min-w-0">
                                <div className={`flex-shrink-0 p-2 rounded-lg ${getPanelTypeColor(panel.type)}`}>
                                  {getPanelIcon(panel.type)}
                                </div>
                                <div className="min-w-0 flex-1">
                                  {editingPanelId === panel.id ? (
                                    <input
                                      type="text"
                                      value={newPanelName}
                                      onChange={(e) => setNewPanelName(e.target.value)}
                                      onKeyPress={(e) => e.key === 'Enter' && handleConfirmRename()}
                                      onBlur={handleConfirmRename}
                                      className="w-full px-3 py-1.5 border border-blue-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm"
                                      autoFocus
                                    />
                                  ) : (
                                    <div
                                      className="font-medium text-slate-900 truncate text-sm cursor-pointer hover:text-blue-600"
                                      onDoubleClick={() => handleStartRename(panel.id)}
                                      title="Double-click to rename"
                                    >
                                      {getPanelName(panel)}
                                    </div>
                                  )}
                                  <div className="text-xs text-slate-500 capitalize">
                                    {panel.type} • {Math.round(panel.x)}, {Math.round(panel.y)}
                                  </div>
                                </div>
                              </div>

                              {/* Panel Actions */}
                              <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                {/* Rename Button */}
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleStartRename(panel.id);
                                  }}
                                  className="p-1 rounded-md text-slate-500 hover:text-slate-700 hover:bg-slate-100 transition-all"
                                  title="Rename panel"
                                >
                                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                                  </svg>
                                </button>

                                {/* Remove from folder button */}
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    onMovePanelToFolder(panel.id, undefined);
                                  }}
                                  className="p-1 rounded-md text-orange-500 hover:text-orange-700 hover:bg-orange-50 transition-all"
                                  title="Remove from folder"
                                >
                                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                                  </svg>
                                </button>

                                {/* Delete Panel */}
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    onRemovePanel(panel.id);
                                  }}
                                  className="p-1 rounded-md text-red-500 hover:text-red-700 hover:bg-red-50 transition-all"
                                  title="Delete panel"
                                >
                                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                  </svg>
                                </button>
                              </div>

                              {/* Selection Indicator */}
                              {selectedPanelId === panel.id && (
                                <div className="flex-shrink-0 w-2 h-2 bg-blue-500 rounded-full"></div>
                              )}
                            </div>
                          )})}
                          
                          {folderPanels.length === 0 && (
                            <div className="text-center py-4 text-slate-600 text-sm border border-dashed border-slate-300 rounded-md bg-slate-50">
                              <div className="mb-2">Empty folder</div>
                              <div className="flex justify-center">
                                <button
                                  onClick={() => {
                                    // Navigate to new canvas to add panels (reuse global PlusPanel flow)
                                    try { window.location.href = '/workspace/new-canvas'; } catch (e) { /* no-op */ }
                                  }}
                                  className="inline-flex items-center gap-2 px-3 py-1 bg-rose-600 text-white rounded-md hover:bg-rose-700"
                                >
                                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                                  </svg>
                                  Add panel
                                </button>
                              </div>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}

                {/* Panels without folders */}
                {/* Root-level drop zone to pull panels out of folders */}
                {draggedPanel && draggedPanel.folderId && (
                  <div
                    onDragOver={(e) => {
                      if (dragDisabled) return;
                      e.preventDefault();
                      setDragOverFolderId('__ROOT__');
                    }}
                    onDrop={(e) => {
                      if (dragDisabled) return;
                      e.preventDefault();
                      const sourceId = e.dataTransfer.getData('text/plain') || e.dataTransfer.getData('application/x-panel-id');
                      if (!sourceId) return;
                      const sourcePanel = panels.find(p => p.id === sourceId);
                      if (!sourcePanel) return;
                      if (!sourcePanel.folderId) return; // already root
                      const updated = { ...sourcePanel, folderId: undefined };
                      const reordered: Panel[] = [];
                      panels.forEach(p => { if (p.id !== sourceId) reordered.push(p); });
                      reordered.push(updated); // append to end of root
                      onReorderPanels(reordered);
                      setDraggedPanelId(null);
                      setDragOverFolderId(null);
                    }}
                    className={`p-3 mb-2 rounded-md border-2 border-dashed text-xs text-center transition-colors ${dragOverFolderId === '__ROOT__' ? 'border-blue-400 bg-blue-50 text-blue-600' : 'border-slate-300 text-slate-400 bg-white'}`}
                  >
                    Drop here to move to root
                  </div>
                )}

                {panelsWithoutFolder.map((panel) => {
                                  const isDragOver = dragOverPanelId === panel.id;
                                  return (
                                  <div
                                    key={panel.id}
                                    draggable={!dragDisabled}
                                    onDragStart={(e) => {
                                      if (dragDisabled) return;
                                      e.dataTransfer.setData('text/plain', panel.id);
                                      e.dataTransfer.setData('application/x-panel-id', panel.id);
                                      e.dataTransfer.effectAllowed = 'move';
                                      setDraggedPanelId(panel.id);
                                      createDragPreview(e, e.currentTarget as HTMLElement);
                                    }}
                                    onDragEnd={() => {
                                      setDraggedPanelId(null);
                                      setDragOverPanelId(null);
                                      setDragOverPosition(null);
                                      setDragOverFolderId(null);
                                    }}
                                    onDragOver={(e) => {
                                      if (dragDisabled) return;
                                      if (!draggedPanelId || draggedPanelId === panel.id) return;
                                      e.preventDefault();
                                      const rect = (e.currentTarget as HTMLDivElement).getBoundingClientRect();
                                      const offset = e.clientY - rect.top;
                                      const pos = offset < rect.height / 2 ? 'before' : 'after';
                                      setDragOverPanelId(panel.id);
                                      setDragOverPosition(pos);
                                      setDragOverFolderId(null);
                                    }}
                                    onDrop={(e) => {
                                      if (dragDisabled) return;
                                      e.preventDefault();
                                      const sourceId = e.dataTransfer.getData('text/plain');
                                      if (!sourceId || sourceId === panel.id) return;
                                      const sourcePanel = panels.find(p => p.id === sourceId);
                                      if (!sourcePanel) return;
                                      const updatedSource = { ...sourcePanel, folderId: undefined };
                                      const result: Panel[] = [];
                                      panels.forEach(p => {
                                        if (p.id === sourceId) return;
                                        if (p.id === panel.id && dragOverPosition === 'before') result.push(updatedSource);
                                        result.push(p);
                                        if (p.id === panel.id && dragOverPosition === 'after') result.push(updatedSource);
                                      });
                                      onReorderPanels(result);
                                      setDraggedPanelId(null);
                                      setDragOverPanelId(null);
                                      setDragOverPosition(null);
                                    }}
                                    className={`group relative flex items-center gap-3 p-3 rounded-lg cursor-pointer transition-all duration-200 border ${
                                      selectedPanelId === panel.id 
                                        ? 'bg-blue-50 border-blue-200 shadow-sm' 
                                        : 'bg-white border-slate-200 hover:bg-slate-50 hover:border-slate-300'
                                    } ${draggedPanelId === panel.id ? 'ring-2 ring-blue-400 shadow-lg scale-[1.01]' : ''}`}
                                    style={{ boxShadow: isDragOver && dragOverPosition === 'before' ? 'inset 0 3px 0 0 #3b82f6' : isDragOver && dragOverPosition === 'after' ? 'inset 0 -3px 0 0 #3b82f6' : undefined }}
                                    onClick={() => onPanelSelect(panel.id)}
                                  >
                    {/* Lock Toggle */}
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        onPanelLockToggle && onPanelLockToggle(panel.id);
                      }}
                      className={`flex-shrink-0 ${smallIconBtn}`}
                      title={panel.locked ? 'Unlock layer' : 'Lock layer'}
                    >
                      {panel.locked ? (<Lock size={16} />) : (<Unlock size={16} />)}
                    </button>
                    {/* Visibility Toggle */}
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        onPanelVisibilityToggle(panel.id);
                      }}
                      className={`flex-shrink-0 ${smallIconBtn} ${visiblePanels.has(panel.id) ? '' : 'opacity-60'}`}
                      title={visiblePanels.has(panel.id) ? 'Hide layer' : 'Show layer'}
                    >
                      {visiblePanels.has(panel.id) ? (<Eye size={16} />) : (<EyeOff size={16} />)}
                    </button>

                    {/* Panel Icon and Info */}
                    <div className="flex items-center gap-3 flex-1 min-w-0">
                      <div className={`flex-shrink-0 p-2 rounded-lg ${getPanelTypeColor(panel.type)}`}>
                        {getPanelIcon(panel.type)}
                      </div>
                      <div className="min-w-0 flex-1">
                        {editingPanelId === panel.id ? (
                          <input
                            type="text"
                            value={newPanelName}
                            onChange={(e) => setNewPanelName(e.target.value)}
                            onKeyPress={(e) => e.key === 'Enter' && handleConfirmRename()}
                            onBlur={handleConfirmRename}
                            className="w-full px-3 py-1.5 border border-blue-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm"
                            autoFocus
                          />
                        ) : (
                          <div
                            className="font-medium text-slate-900 truncate text-sm cursor-pointer hover:text-blue-600"
                            onDoubleClick={() => handleStartRename(panel.id)}
                            title="Double-click to rename"
                          >
                            {getPanelName(panel)}
                          </div>
                        )}
                        <div className="text-xs text-slate-500 capitalize">
                          {panel.type} • {Math.round(panel.x)}, {Math.round(panel.y)}
                        </div>
                      </div>
                    </div>

                    {/* Panel Actions */}
                    <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      {/* Rename Button */}
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleStartRename(panel.id);
                        }}
                        className="p-1 rounded-md text-slate-500 hover:text-slate-700 hover:bg-slate-100 transition-all"
                        title="Rename panel"
                      >
                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                        </svg>
                      </button>

                      {/* Delete Panel */}
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          onRemovePanel(panel.id);
                        }}
                        className="p-1 rounded-md text-red-500 hover:text-red-700 hover:bg-red-50 transition-all"
                        title="Delete panel"
                      >
                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                        </svg>
                      </button>
                    </div>

                    {/* Selection Indicator */}
                    {selectedPanelId === panel.id && (
                      <div className="flex-shrink-0 w-2 h-2 bg-blue-500 rounded-full"></div>
                    )}
                  </div>
                )})}
              </div>
            )}
          </div>

          {/* Footer Stats */}
          <div className="border-t border-slate-200 p-4 bg-slate-50">
            <div className="text-xs text-slate-600 space-y-2">
              <div className="flex justify-between items-center">
                <span>Total Layers:</span>
                <span className="font-semibold text-slate-800 bg-slate-200 px-2 py-1 rounded-full">
                  {panels.length}
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span>Visible:</span>
                <span className="font-semibold text-emerald-700 bg-emerald-100 px-2 py-1 rounded-full">
                  {panels.filter(panel => visiblePanels.has(panel.id)).length}
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span>Folders:</span>
                <span className="font-semibold text-blue-700 bg-blue-100 px-2 py-1 rounded-full">
                  {folders.length}
                </span>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
};

export default LayersPanel;