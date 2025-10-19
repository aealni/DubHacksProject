import React from 'react';

export type CanvasTool =  'hand' | 'select' | 'rect' | 'ellipse' | 'arrow' | 'text';

interface FeatureBarProps {
  currentTool: CanvasTool;
  onChangeTool: (tool: CanvasTool) => void;
  onZoomIn: () => void;
  onZoomOut: () => void;
}

const tools: { id: CanvasTool; label: string; icon: JSX.Element; hint?: string }[] = [
  { id: 'hand', label: 'Hand', hint: 'Space', icon: (
    <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M8 13V5a2 2 0 1 1 4 0v6"/><path d="M12 11V3a2 2 0 1 1 4 0v8"/><path d="M16 11V6a2 2 0 1 1 4 0v7a8 8 0 0 1-8 8h-1a7 7 0 0 1-7-7v-1a3 3 0 0 1 3-3h1"/></svg>
  )},
  { id: 'select', label: 'Select', hint: 'V', icon: (
    <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 4l7 16 2-6 6-2-15-8z" />
    </svg>
  )},
  { id: 'rect', label: 'Rect', icon: (
    <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="4" y="4" width="16" height="16" rx="2"/></svg>
  )},
  { id: 'ellipse', label: 'Ellipse', icon: (
    <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><ellipse cx="12" cy="12" rx="8" ry="6"/></svg>
  )},
  { id: 'arrow', label: 'Arrow', icon: (
    <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M5 12h11"/><path d="M12 5l7 7-7 7"/></svg>
  )},
  { id: 'text', label: 'Text', icon: (
    <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M4 7V5h16v2"/><path d="M10 19h4"/><path d="M12 5v14"/></svg>
  )}
];

export const FeatureBar: React.FC<FeatureBarProps> = ({ currentTool, onChangeTool, onZoomIn, onZoomOut }) => {
  return (
    <div className="pointer-events-auto flex items-center gap-1 px-3 py-2 rounded-full shadow-lg border border-slate-300/60 bg-white/80 backdrop-blur-md dark:border-slate-600/60 dark:bg-slate-800/80">
      {tools.map(tool => {
        const active = currentTool === tool.id;
        return (
          <button
            key={tool.id}
            onClick={() => onChangeTool(tool.id)}
            className={`relative group flex flex-col items-center justify-center px-2 py-1 rounded-md text-[11px] font-medium tracking-wide transition-all focus:outline-none ${active ? 'bg-blue-600 text-white shadow-inner' : 'text-slate-600 hover:bg-slate-200/70 active:bg-slate-300 dark:text-slate-200 dark:hover:bg-slate-700/60 dark:active:bg-slate-600/80'}`}
            title={`${tool.label}${tool.hint ? ` (${tool.hint})` : ''}`}
          >
            {tool.icon}
            <span className="mt-0.5 leading-none">{tool.label}</span>
            {active && <span className="absolute -bottom-1 inset-x-3 h-0.5 rounded-full bg-blue-300" />}
          </button>
        );
      })}
      <div className="w-px h-6 bg-slate-300 dark:bg-slate-600 mx-1" />
      <div className="flex items-center gap-1">
        <button
          type="button"
          onClick={onZoomOut}
          className="flex h-9 w-9 items-center justify-center rounded-md bg-slate-100 text-base font-semibold text-slate-600 transition hover:bg-slate-200 active:bg-slate-300 dark:bg-slate-700 dark:text-slate-200 dark:hover:bg-slate-600 dark:active:bg-slate-500"
          title="Zoom out (-)"
          aria-label="Zoom out"
        >
          -
        </button>
        <button
          type="button"
          onClick={onZoomIn}
          className="flex h-9 w-9 items-center justify-center rounded-md bg-slate-100 text-base font-semibold text-slate-600 transition hover:bg-slate-200 active:bg-slate-300 dark:bg-slate-700 dark:text-slate-200 dark:hover:bg-slate-600 dark:active:bg-slate-500"
          title="Zoom in (+)"
          aria-label="Zoom in"
        >
          +
        </button>
      </div>
    </div>
  );
};

export default FeatureBar;