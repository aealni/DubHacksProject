import React, { useState, useEffect } from 'react';

interface EditMap { [key: string]: any }

interface Props {
  rows: any[];
  columns?: string[];
  maxRows?: number;
  totalRows?: number;
  offset?: number;
  limit?: number;
  onPageChange?: (newOffset: number) => void;
  // infinite scroll helper: when user scrolls near bottom, component will call onPageChange
  // to request the next offset. `isLoading` prevents duplicate requests.
  isLoading?: boolean;
  // Add / delete row/column handlers (optional). If absent, UI will hide/disable the action.
  onAddRow?: () => Promise<void> | void;
  onAddColumn?: (colName: string) => Promise<void> | void;
  onDeleteColumn?: (colName: string) => Promise<void> | void;
  // onSaveEdits now also receives pending column renames if any
  onSaveEdits?: (edits: { rowid: number; column: string; value: any }[], renames?: { old: string; next: string }[]) => Promise<void> | void;
  onRenameColumn?: (oldName: string, newName: string) => void; // legacy immediate rename (still supported but optional)
}
 
function deriveColumns(rows: any[]): string[] {
  if (!rows || rows.length === 0) return [];
  // Filter to plain objects (exclude null/arrays/functions)
  const objs = rows.filter(r => r && typeof r === 'object' && !Array.isArray(r));
  if (objs.length === 0) {
    // Fallback: treat primitive/array rows as single column 'value'
    return ['value'];
  }
  const keySet = new Set<string>();
  for (const o of objs) {
    Object.keys(o).forEach(k => keySet.add(k));
  }
  return Array.from(keySet);
}

export const DataPreviewTable: React.FC<Props> = ({ rows, columns, maxRows = 200, totalRows, offset = 0, limit = 10, onPageChange, onSaveEdits, onRenameColumn, isLoading, onAddRow, onAddColumn, onDeleteColumn }) => {
  const [editing, setEditing] = useState<EditMap>({});
  const [saving, setSaving] = useState(false);
  const [renamingCol, setRenamingCol] = useState<string | null>(null);
  const [renameVal, setRenameVal] = useState('');
  const [pendingRenames, setPendingRenames] = useState<{ old: string; next: string }[]>([]);
  const [displayRows, setDisplayRows] = useState<any[]>([]);
  const [lastRequestedOffset, setLastRequestedOffset] = useState<number | null>(null);
  const [autoSaveTimeout, setAutoSaveTimeout] = useState<NodeJS.Timeout | null>(null);
  useEffect(() => {
    setDisplayRows(rows);
    setEditing({});
    // allow infinite-scroll to request the same next page again after new rows arrive
    setLastRequestedOffset(null);
  }, [rows]);

  // Auto-save after 2 seconds of inactivity
  useEffect(() => {
    if (Object.keys(editing).length > 0 || pendingRenames.length > 0) {
      if (autoSaveTimeout) clearTimeout(autoSaveTimeout);
      const timeout = setTimeout(() => {
        applySave();
      }, 2000);
      setAutoSaveTimeout(timeout);
    } else {
      if (autoSaveTimeout) {
        clearTimeout(autoSaveTimeout);
        setAutoSaveTimeout(null);
      }
    }
    return () => {
      if (autoSaveTimeout) clearTimeout(autoSaveTimeout);
    };
  }, [editing, pendingRenames]);
  if (!Array.isArray(rows) || rows.length === 0) {
    return <p className="text-sm text-gray-500">No preview data.</p>;
  }

  let cols = columns && columns.length ? columns : deriveColumns(rows);
  // Remove internal _rowid from visible columns; we'll render a synthetic leading Row column.
  cols = cols.filter(c => c !== '_rowid');
  // Friendly display labels (Title Case, underscores/spaces collapsed) map
  const displayLabel = (col: string) => {
    return col
      .replace(/[_\s]+/g, ' ')
      .trim()
      .split(' ')
      .map(w => w ? w[0].toUpperCase() + w.slice(1) : '')
      .join(' ');
  };
  if (cols.length === 0) {
    return <p className="text-sm text-gray-500">No usable columns in preview.</p>;
  }

  // Normalize rows: if row is primitive or array, wrap into object
  const normalized = displayRows.slice(0, maxRows).map(r => {
    if (r && typeof r === 'object' && !Array.isArray(r)) return r;
    if (Array.isArray(r)) {
      const obj: Record<string, any> = {};
      r.forEach((val, idx) => { obj[`col_${idx}`] = val; });
      // expand columns if needed
      r.forEach((_, idx) => { const key = `col_${idx}`; if (!cols.includes(key)) cols.push(key); });
      return obj;
    }
    return { value: r };
  });

  const start = offset;
  const end = Math.min((offset || 0) + (limit || rows.length), totalRows || rows.length);

  const applySave = async () => {
    if (!onSaveEdits) return;
    const batch = Object.entries(editing).map(([k, value]) => {
      const [rid, col] = k.split('::');
      return { rowid: Number(rid), column: col, value };
    });
    if (batch.length === 0 && pendingRenames.length === 0) return;
    try {
      setSaving(true);
      await onSaveEdits(batch, pendingRenames.length ? pendingRenames : undefined);
      setEditing({});
      setPendingRenames([]);
    } finally {
      setSaving(false);
    }
  };

  // Infinite scroll handler: when the inner scrollable container nears the bottom,
  // request the next page via `onPageChange(offset + limit)`. Guard with isLoading
  // and lastRequestedOffset to avoid duplicate requests.
  const handleInnerScroll = (e: React.UIEvent<HTMLDivElement>) => {
    const el = e.currentTarget;
    const nearBottom = el.scrollTop + el.clientHeight >= el.scrollHeight - 200;
    if (!nearBottom) return;
    if (!onPageChange) return;
    const nextOffset = (offset || 0) + (limit || rows.length || 0);
    if (isLoading) return;
    if (lastRequestedOffset !== null && lastRequestedOffset === nextOffset) return;
    if (totalRows !== undefined && nextOffset >= totalRows) return;
    try {
      setLastRequestedOffset(nextOffset);
      onPageChange(nextOffset);
    } catch (e) {
      // ignore
    }
  };

  const handleAddRow = async () => {
    if (!onAddRow) return alert('Add row not available.');
    try {
      await onAddRow();
    } catch (e) {
      console.error('Failed to add row', e);
    }
  };

  const handleAddColumn = async () => {
    if (!onAddColumn) return alert('Add column not available.');
    const name = prompt('New column name');
    if (!name) return;
    try {
      await onAddColumn(name);
    } catch (e) {
      console.error('Failed to add column', e);
    }
  };

  const handleDeleteColumn = async (col: string) => {
    if (!onDeleteColumn) return alert('Delete column not available.');
    if (!confirm(`Delete column ${col}? This cannot be undone.`)) return;
    try {
      await onDeleteColumn(col);
    } catch (e) {
      console.error('Failed to delete column', e);
    }
  };


  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          {totalRows !== undefined && (
            <span style={{ color: '#374151' }} className="text-sm font-medium">
              Showing {start + 1} - {end} of {totalRows.toLocaleString()} rows
            </span>
          )}
        </div>
        
        <div className="flex items-center gap-3">
          {onSaveEdits && (Object.keys(editing).length > 0 || pendingRenames.length > 0) && (
            <span className="text-xs text-gray-500">Changes auto-save in 2 seconds</span>
          )}
          {onAddRow && (
            <div className="mr-4">
              <button onClick={handleAddRow} className="px-3 py-2 bg-gray-100 rounded-md text-sm">+ Row</button>
            </div>
          )}
          {onPageChange && (
            <div className="flex items-center gap-2">
              <button 
                disabled={offset <= 0} 
                onClick={() => onPageChange(Math.max(offset - limit, 0))} 
                className="px-4 py-2 text-sm font-medium border rounded-lg disabled:opacity-40 disabled:cursor-not-allowed hover:bg-gray-50 transition-colors"
                style={{ color: offset <= 0 ? '#9ca3af' : '#374151' }}
              >
                Previous
              </button>
              <button 
                disabled={end >= (totalRows || 0)} 
                onClick={() => onPageChange(offset + limit)} 
                className="px-4 py-2 text-sm font-medium border rounded-lg disabled:opacity-40 disabled:cursor-not-allowed hover:bg-gray-50 transition-colors"
                style={{ color: end >= (totalRows || 0) ? '#9ca3af' : '#374151' }}
              >
                Next
              </button>
            </div>
          )}
          
          {onSaveEdits && (
            <button
              disabled={saving || (Object.keys(editing).length === 0 && pendingRenames.length === 0)}
              onClick={applySave}
              className="px-4 py-2 bg-gradient-to-r from-blue-600 to-indigo-600 text-white font-medium rounded-lg hover:from-blue-700 hover:to-indigo-700 disabled:opacity-40 disabled:cursor-not-allowed transition-all duration-200 shadow-sm hover:shadow-md text-sm"
            >
              {saving ? (
                <div className="flex items-center gap-2">
                  <svg className="animate-spin h-4 w-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                  Auto-saving...
                </div>
              ) : (
                `Save Changes${pendingRenames.length ? ` (${pendingRenames.length} rename${pendingRenames.length > 1 ? 's' : ''})` : ''}${Object.keys(editing).length ? (pendingRenames.length ? ' & ' : ' (') + `${Object.keys(editing).length} edit${Object.keys(editing).length > 1 ? 's' : ''}${!pendingRenames.length ? ')' : ''}` : ''}`
              )}
            </button>
          )}
        </div>
      </div>
      
      <div className="bg-white rounded-xl border border-gray-200 shadow-lg overflow-hidden">
        <div className="overflow-x-auto">
          <div className="max-h-96 overflow-y-auto" onScroll={handleInnerScroll}>
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gradient-to-r from-gray-50 to-gray-100 sticky top-0 z-10">
                <tr>
                  {/* Synthetic Row column */}
                  <th className="px-6 py-4 text-left font-semibold whitespace-nowrap border-b border-gray-200">
                    <span style={{ color: '#111827' }} className="text-sm tracking-tight">Row</span>
                  </th>
                  {cols.map(c => {
                    const pending = pendingRenames.find(r => r.old === c);
                    const effectiveName = pending ? pending.next : c;
                    const friendly = displayLabel(effectiveName);
                    return (
                      <th key={c} className="px-6 py-4 text-left font-semibold whitespace-nowrap border-b border-gray-200 min-w-[120px]">
                        {onSaveEdits ? (
                          renamingCol === c ? (
                            <input
                              autoFocus
                              className="w-full px-3 py-2 text-sm border border-blue-300 rounded-lg bg-white shadow-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                              value={renameVal}
                              onChange={e => setRenameVal(e.target.value)}
                              onBlur={() => { setRenamingCol(null); setRenameVal(''); }}
                              onKeyDown={e => {
                                if (e.key === 'Enter') {
                                  if (renameVal && renameVal !== c) {
                                    setPendingRenames(prev => {
                                      const filtered = prev.filter(r => r.old !== c);
                                      return [...filtered, { old: c, next: renameVal }];
                                    });
                                  }
                                  setRenamingCol(null); setRenameVal('');
                                } else if (e.key === 'Escape') {
                                  setRenamingCol(null); setRenameVal('');
                                }
                              }}
                            />
                          ) : (
                            <button
                              className="group flex items-center gap-2 hover:bg-gray-100 p-2 rounded-lg transition-colors -m-2"
                              title={(pending ? `Pending rename → ${pending.next}` : 'Click to rename column') + ` | Display: ${friendly}`}
                              onClick={() => { setRenamingCol(c); setRenameVal(effectiveName); }}
                            >
                              <span style={{ color: '#111827' }} className="text-sm font-medium">
                                {effectiveName}
                              </span>
                              <svg className="w-4 h-4 text-gray-400 group-hover:text-gray-600 transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                              </svg>
                              {pending && (
                                <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                                  Renamed
                                </span>
                              )}
                            </button>
                          )
                        ) : (
                          <span style={{ color: '#111827' }} className="text-sm font-medium">
                            {effectiveName}
                          </span>
                        )}
                      </th>
                    );
                  })}
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-100">
                {normalized.map((r, i) => (
                  <tr key={i} className="hover:bg-gray-50 transition-colors duration-150">
                    {/* Synthetic row number / id cell */}
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span style={{ color: '#6b7280' }} className="text-sm font-mono">
                        {r._rowid ?? (offset + i + 1)}
                      </span>
                    </td>
                    {cols.map(c => (
                      <td key={c} className="px-6 py-4 whitespace-nowrap max-w-xs">
                        {onSaveEdits ? (
                          <input
                            className={`w-full px-3 py-2 text-sm border rounded-lg transition-all duration-200 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 ${
                              editing[`${r._rowid ?? (offset + i + 1)}::${c}`] !== undefined 
                                ? 'bg-yellow-50 border-yellow-300' 
                                : 'border-gray-200 hover:border-gray-300'
                            }`}
                            value={editing[`${r._rowid ?? (offset + i + 1)}::${c}`] !== undefined ? editing[`${r._rowid ?? (offset + i + 1)}::${c}`] : (r[c] === undefined || r[c] === null ? '' : String(r[c]))}
                            onChange={(e) => {
                              const key = `${r._rowid ?? (offset + i + 1)}::${c}`;
                              const val = e.target.value;
                              setEditing(prev => ({ ...prev, [key]: val }));
                            }}
                            style={{ color: '#111827' }}
                          />
                        ) : (
                          <span style={{ color: '#111827' }} className="text-sm truncate block">
                            {r[c] === undefined || r[c] === null ? (
                              <span style={{ color: '#9ca3af' }} className="italic">-</span>
                            ) : (
                              String(r[c])
                            )}
                          </span>
                        )}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
};

export default DataPreviewTable;
