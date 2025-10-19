import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import DataPreviewTable from '../../../components/DataPreviewTable';

const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:8000';

export default function DatasetTablePage() {
  const router = useRouter();
  const { id } = router.query as { id?: string };
  const datasetId = Number(id);

  const [rows, setRows] = useState<any[]>([]);
  const [columns, setColumns] = useState<string[]>([]);
  const [totalRows, setTotalRows] = useState<number>(0);
  const [offset, setOffset] = useState<number>(0);
  const [limit, setLimit] = useState<number>(100);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!datasetId) return;
    loadPreview();
  }, [datasetId, offset, limit]);

  const loadPreview = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${BACKEND_URL}/dataset/${datasetId}/preview?limit=${limit}&offset=${offset}`);
      if (!res.ok) throw new Error('Failed to load preview');
      const data = await res.json();
      const preview = data.preview;
      // append when offset > 0 to support infinite scroll
      setRows(prev => (offset && offset > 0) ? [...prev, ...(preview.rows || [])] : (preview.rows || []));
      setColumns(preview.columns || []);
      setTotalRows(preview.total_rows || preview.rows.length || 0);
    } catch (e: any) {
      setError(e.message || 'Load failed');
    } finally {
      setLoading(false);
    }
  };

  const handlePageChange = (newOffset: number) => {
    setOffset(newOffset);
  };

  const handleSaveEdits = async (edits: { rowid: number; column: string; value: any }[], renames?: { old: string; next: string }[]) => {
    try {
      if (edits && edits.length) {
        await fetch(`${BACKEND_URL}/dataset/${datasetId}/cells`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ edits })
        });
      }
      if (renames && renames.length) {
        await fetch(`${BACKEND_URL}/dataset/${datasetId}/columns`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ renames: renames.map(r => ({ old: r.old, new: r.next })) })
        });
      }
      // reload after save
      loadPreview();
    } catch (e) {
      console.error('Save failed', e);
    }
  };

  // Add a new blank row at the end (backend-supported endpoint expected)
  const handleAddRow = async () => {
    try {
      const res = await fetch(`${BACKEND_URL}/dataset/${datasetId}/add-row`, {
        method: 'POST'
      });
      if (!res.ok) throw new Error('Failed to add row');
      // reset offset so the page reloads from the start (useEffect will call loadPreview)
      setOffset(0);
    } catch (err) {
      console.error('Add row error', err);
      setError('Failed to add row. Backend may not support add-row endpoint.');
    }
  };

  // Add a new column with a provided name
  const handleAddColumn = async (name: string) => {
    try {
      const res = await fetch(`${BACKEND_URL}/dataset/${datasetId}/add-column`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ column_name: name })
      });
      if (!res.ok) throw new Error('Failed to add column');
      setOffset(0);
    } catch (err) {
      console.error('Add column error', err);
      setError('Failed to add column. Backend may not support add-column endpoint.');
    }
  };

  // Delete a column by name
  const handleDeleteColumn = async (colName: string) => {
    try {
      const res = await fetch(`${BACKEND_URL}/dataset/${datasetId}/drop-column`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ column_name: colName })
      });
      if (!res.ok) throw new Error('Failed to delete column');
      setOffset(0);
    } catch (err) {
      console.error('Delete column error', err);
      setError('Failed to delete column. Backend may not support drop-column endpoint.');
    }
  };

  if (!datasetId) {
    return <div className="p-6">No dataset selected.</div>;
  }

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="max-w-[1200px] mx-auto">
        <div className="flex items-center justify-between mb-4">
          <h1 className="text-2xl font-semibold">Spreadsheet View</h1>
          <div className="flex gap-2">
            <button onClick={() => router.push(`/dataset/${datasetId}`)} className="px-3 py-2 border rounded">Back</button>
          </div>
        </div>

        <div className="bg-white p-4 rounded shadow">
          {loading ? (
            <div className="p-6">Loading…</div>
          ) : error ? (
            <div className="p-6 text-red-600">{error}</div>
          ) : (
            <DataPreviewTable
              rows={rows}
              columns={columns}
              totalRows={totalRows}
              offset={offset}
              limit={limit}
              onPageChange={handlePageChange}
              onSaveEdits={handleSaveEdits}
              isLoading={loading}
              onAddRow={handleAddRow}
              onAddColumn={handleAddColumn}
              onDeleteColumn={handleDeleteColumn}
            />
          )}
        </div>
      </div>
    </div>
  );
}
