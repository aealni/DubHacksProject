"use client";
import React from 'react';
import { useLocalStorage } from '../hooks/useLocalStorage';

export interface VisualSettings {
  reduced: boolean;
  showHeatmap: boolean;
  showParticles: boolean;
  particleCount: number;
  heatmapIntensity: number; // 0-1
  speed: number; // multiplier 0.5 - 2
}

const DEFAULT_SETTINGS: VisualSettings = {
  reduced: false,
  showHeatmap: true,
  showParticles: true,
  particleCount: 900,
  heatmapIntensity: 0.55,
  speed: 1,
};

export function useVisualSettings() {
  return useLocalStorage<VisualSettings>('canvas-settings', DEFAULT_SETTINGS);
}

interface Props {
  open: boolean;
  onClose: () => void;
  settings: VisualSettings;
  setSettings: React.Dispatch<React.SetStateAction<VisualSettings>>;
}

const SettingsPanel: React.FC<Props> = ({ open, onClose, settings, setSettings }) => {
  return (
    <div className={`fixed top-4 right-4 z-50 w-72 max-w-[90vw] transition-transform ${open ? 'translate-x-0 opacity-100' : 'translate-x-4 opacity-0 pointer-events-none'}`}>
      <div className="rounded-2xl border border-neutral-200 dark:border-neutral-700 bg-white/80 dark:bg-neutral-900/80 backdrop-blur p-4 shadow-xl">
        <div className="flex items-center justify-between mb-2">
          <h4 className="font-semibold text-sm tracking-tight">Visual Settings</h4>
          <button onClick={onClose} className="text-xs px-2 py-1 rounded-md bg-neutral-200/60 dark:bg-neutral-700/60 hover:bg-neutral-300 dark:hover:bg-neutral-600 transition">✕</button>
        </div>
        <div className="space-y-4 max-h-[60vh] overflow-y-auto pr-1 text-xs">
          <Toggle label="Reduced visuals" value={settings.reduced} onChange={v => setSettings(s => ({ ...s, reduced: v }))} />
          <Toggle label="Show heatmap" value={settings.showHeatmap} onChange={v => setSettings(s => ({ ...s, showHeatmap: v }))} />
          <Toggle label="Show particles" value={settings.showParticles} onChange={v => setSettings(s => ({ ...s, showParticles: v }))} />
          <Slider label={`Particle count (${settings.particleCount})`} min={200} max={1500} step={50} value={settings.particleCount} onChange={v => setSettings(s => ({ ...s, particleCount: v }))} />
          <Slider label={`Heatmap intensity (${settings.heatmapIntensity.toFixed(2)})`} min={0} max={1} step={0.01} value={settings.heatmapIntensity} onChange={v => setSettings(s => ({ ...s, heatmapIntensity: v }))} />
          <Slider label={`Speed (${settings.speed.toFixed(2)}x)`} min={0.5} max={2} step={0.1} value={settings.speed} onChange={v => setSettings(s => ({ ...s, speed: v }))} />
        </div>
      </div>
    </div>
  );
};

const Toggle: React.FC<{ label: string; value: boolean; onChange: (v: boolean) => void; }> = ({ label, value, onChange }) => (
  <label className="flex items-center justify-between gap-4 cursor-pointer select-none">
    <span>{label}</span>
    <button type="button" onClick={() => onChange(!value)} className={`w-10 h-5 rounded-full relative transition-colors ${value ? 'bg-blue-600' : 'bg-neutral-400 dark:bg-neutral-600'}`}>\n      <span className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white shadow transform transition-transform ${value ? 'translate-x-5' : ''}`} />\n    </button>
  </label>
);

const Slider: React.FC<{ label: string; min: number; max: number; step: number; value: number; onChange: (v: number) => void; }> = ({ label, min, max, step, value, onChange }) => (
  <label className="flex flex-col gap-1">
    <span>{label}</span>
    <input type="range" min={min} max={max} step={step} value={value} onChange={e => onChange(Number(e.target.value))} className="w-full accent-blue-600" />
  </label>
);

export default SettingsPanel;
