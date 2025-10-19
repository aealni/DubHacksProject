import React from 'react';

interface Props { metadata: any }

export const MetadataCard: React.FC<Props> = ({ metadata }) => {
  if (!metadata) return null;
  
  const items: { label: string; value: any }[] = [
    { label: 'Duplicates Removed', value: metadata.duplicates_removed },
    { label: 'Rows Dropped (Missing)', value: metadata.rows_dropped_for_missing },
    { label: 'Date Columns Standardized', value: (metadata.date_columns_standardized || []).join(', ') || 'None' },
    { label: 'Processing Notes', value: (metadata.notes || []).length }
  ];
  
  return (
    <div className="bg-white/80 backdrop-blur-sm border rounded-xl shadow-lg p-6">
      <h3 style={{ color: '#111827' }} className="text-lg font-semibold mb-4">Data Processing Summary</h3>
      
      <div className="space-y-4">
        {items.map(item => (
          <div key={item.label} className="flex justify-between items-center py-2 border-b border-gray-100 last:border-b-0">
            <span style={{ color: '#6b7280' }} className="text-sm font-medium">{item.label}</span>
            <span style={{ color: '#111827' }} className="text-sm font-semibold">{item.value}</span>
          </div>
        ))}
      </div>
      
      {metadata.missing_by_column && (
        <div className="mt-6">
          <details className="group">
            <summary className="cursor-pointer text-indigo-600 hover:text-indigo-700 font-medium text-sm transition-colors flex items-center gap-2">
              <svg className="w-4 h-4 transition-transform group-open:rotate-90" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
              Missing Data by Column
            </summary>
            <div className="mt-3 bg-gray-50/70 rounded-lg p-4 border">
              <pre 
                className="text-xs max-h-48 overflow-auto font-mono whitespace-pre-wrap"
                style={{ color: '#374151' }}
              >
                {JSON.stringify(metadata.missing_by_column, null, 2)}
              </pre>
            </div>
          </details>
        </div>
      )}
      
      {metadata.dtype_inference && (
        <div className="mt-4">
          <details className="group">
            <summary className="cursor-pointer text-indigo-600 hover:text-indigo-700 font-medium text-sm transition-colors flex items-center gap-2">
              <svg className="w-4 h-4 transition-transform group-open:rotate-90" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
              Data Type Inference
            </summary>
            <div className="mt-3 bg-gray-50/70 rounded-lg p-4 border">
              <pre 
                className="text-xs max-h-48 overflow-auto font-mono whitespace-pre-wrap"
                style={{ color: '#374151' }}
              >
                {JSON.stringify(metadata.dtype_inference, null, 2)}
              </pre>
            </div>
          </details>
        </div>
      )}
      
      {metadata.notes && metadata.notes.length > 0 && (
        <div className="mt-4">
          <details className="group">
            <summary className="cursor-pointer text-indigo-600 hover:text-indigo-700 font-medium text-sm transition-colors flex items-center gap-2">
              <svg className="w-4 h-4 transition-transform group-open:rotate-90" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
              Processing Notes ({metadata.notes.length})
            </summary>
            <div className="mt-3 bg-gray-50/70 rounded-lg p-4 border">
              <ul className="space-y-2">
                {metadata.notes.map((note: string, index: number) => (
                  <li key={index} className="flex items-start gap-2">
                    <div className="w-1.5 h-1.5 rounded-full bg-indigo-600 mt-2 flex-shrink-0"></div>
                    <span style={{ color: '#374151' }} className="text-sm">{note}</span>
                  </li>
                ))}
              </ul>
            </div>
          </details>
        </div>
      )}
    </div>
  );
};

export default MetadataCard;
