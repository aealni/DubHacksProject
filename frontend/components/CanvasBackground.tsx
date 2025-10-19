"use client";
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { gaussianKernel, lerp, Particle, randBeta, randn, viridis } from '../utils/canvas';
import { useReducedMotion } from '../hooks/useReducedMotion';
import { useVisualSettings } from './SettingsPanel';

interface Props {}

// Debounce helper
function useDebouncedCallback(cb: () => void, delay: number) {
  const t = useRef<number | null>(null);
  return useCallback(() => {
    if (t.current) window.clearTimeout(t.current);
    t.current = window.setTimeout(cb, delay);
  }, [cb, delay]);
}

const CanvasBackground: React.FC<Props> = () => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const particlesRef = useRef<Particle[]>([]);
  const heatmapRef = useRef<Float32Array | null>(null);
  const rafRef = useRef<number | null>(null);
  const [settings, setSettings] = useVisualSettings();
  const reducedPref = useReducedMotion();
  const reduced = settings.reduced || reducedPref;
  const [mounted, setMounted] = useState(false);

  // Pointer state
  const pointer = useRef({ x: 0.5, y: 0.5, targetX: 0.5, targetY: 0.5, active: false });

  useEffect(() => { setMounted(true); }, []);

  const init = useCallback(() => {
    const canvas = canvasRef.current; if (!canvas) return;
    const ctx = canvas.getContext('2d'); if (!ctx) return;
    const dpr = window.devicePixelRatio || 1;
    const w = window.innerWidth; const h = window.innerHeight;
    canvas.width = w * dpr; canvas.height = h * dpr; canvas.style.width = w + 'px'; canvas.style.height = h + 'px';
    ctx.scale(dpr, dpr);

    // Grid for heatmap (64 x aspect scaled)
    const cols = 64; const cellW = w / cols; const rows = Math.round(h / cellW);
    heatmapRef.current = new Float32Array(cols * rows);

    // Particles
    const count = Math.min(Math.max(settings.particleCount, 50), 5000);
    particlesRef.current = new Array(count).fill(0).map(() => ({
      x: Math.random() * w,
      y: Math.random() * h,
      vx: 0,
      vy: 0,
      size: 1 + Math.random() * 2.5,
      hue: 190 + Math.random() * 60,
      alpha: 0.15 + Math.random() * 0.6,
    }));
  }, [settings.particleCount]);

  const debouncedInit = useDebouncedCallback(init, 250);

  useEffect(() => {
    init();
    window.addEventListener('resize', debouncedInit);
    return () => window.removeEventListener('resize', debouncedInit);
  }, [init, debouncedInit]);

  // Visibility pause
  useEffect(() => {
    const handler = () => {
      if (document.visibilityState === 'hidden' && rafRef.current) {
        cancelAnimationFrame(rafRef.current); rafRef.current = null;
      } else if (document.visibilityState === 'visible' && !rafRef.current) {
        loop();
      }
    };
    document.addEventListener('visibilitychange', handler);
    return () => document.removeEventListener('visibilitychange', handler);
  }, []);

  // Pointer events
  useEffect(() => {
    const update = (clientX: number, clientY: number) => {
      const w = window.innerWidth; const h = window.innerHeight;
      pointer.current.targetX = clientX / w; pointer.current.targetY = clientY / h; pointer.current.active = true;
    };
    const onMove = (e: MouseEvent) => update(e.clientX, e.clientY);
    const onTouch = (e: TouchEvent) => { if (e.touches[0]) update(e.touches[0].clientX, e.touches[0].clientY); };
    const onLeave = () => { pointer.current.active = false; };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('touchmove', onTouch, { passive: true });
    window.addEventListener('mouseleave', onLeave);
    window.addEventListener('touchend', onLeave);
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('touchmove', onTouch);
      window.removeEventListener('mouseleave', onLeave);
      window.removeEventListener('touchend', onLeave);
    };
  }, []);

  const loop = useCallback(() => {
    const canvas = canvasRef.current; const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;
    const w = canvas.clientWidth; const h = canvas.clientHeight;

    // Smooth pointer
    pointer.current.x = lerp(pointer.current.x, pointer.current.active ? pointer.current.targetX : 0.5, 0.05);
    pointer.current.y = lerp(pointer.current.y, pointer.current.active ? pointer.current.targetY : 0.5, 0.05);

    const cols = 64; const cellW = w / cols; const rows = Math.round(h / cellW);
    if (!heatmapRef.current || heatmapRef.current.length !== cols * rows) {
      heatmapRef.current = new Float32Array(cols * rows);
    }

    const heat = heatmapRef.current;
    // Fade heatmap
    for (let i = 0; i < heat.length; i++) heat[i] *= 0.96;

    // Inject heat around pointer
    if (settings.showHeatmap) {
      const px = pointer.current.x * w; const py = pointer.current.y * h;
      const radius = Math.min(w, h) * 0.25; const sigma = radius * 0.35;
      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          const cx = c * cellW + cellW / 2; const cy = r * cellW + cellW / 2;
            const dx = cx - px; const dy = cy - py; const dist = Math.sqrt(dx*dx + dy*dy);
            if (dist < radius) {
              const k = gaussianKernel(dist, sigma) * settings.heatmapIntensity;
              const idx = r * cols + c;
              heat[idx] = Math.min(1, heat[idx] + k * 0.35);
            }
        }
      }
    }

  ctx.clearRect(0, 0, w, h);

    // Clean white background
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0,0,w,h);

    // Enhanced dotted grid with animation and darker dots
    const gridSpacing = 40;
    const t = performance.now() * 0.0008 * settings.speed; // Animation time
    ctx.save();
    
    for (let gy = 0; gy < h; gy += gridSpacing) {
      for (let gx = 0; gx < w; gx += gridSpacing) {
        // Calculate distance from pointer for interaction
        const dx = gx - (pointer.current.x * w);
        const dy = gy - (pointer.current.y * h);
        const dist = Math.sqrt(dx * dx + dy * dy);
        
        // Base dot properties
        let dotSize = 1.2; // Slightly larger base size
        let opacity = 0.28; // Darker base opacity
        
        // Wave animation effect
        const wavePhase = t + (gx * 0.01) + (gy * 0.01);
        const waveIntensity = Math.sin(wavePhase) * 0.3 + Math.cos(wavePhase * 0.7) * 0.2;
        
        // Enhanced pointer interaction effect with darker dots
        if (pointer.current.active && dist < 250) { // Increased interaction radius
          const influence = 1 - (dist / 250);
          dotSize += influence * 1.5; // Even more growth near pointer
          opacity += influence * 0.7; // Much darker for better tracking
          
          // Add extra darkening for very close dots
          if (dist < 100) {
            opacity += (1 - dist / 100) * 0.5; // Extra darkness boost
          }
        }
        
        // Apply wave animation
        dotSize += Math.abs(waveIntensity) * 0.4;
        opacity += Math.abs(waveIntensity) * 0.15;
        
        // Breathing animation for some dots
        if ((Math.floor(gx / gridSpacing) + Math.floor(gy / gridSpacing)) % 3 === 0) {
          const breathe = Math.sin(t * 2 + gx * 0.01 + gy * 0.01) * 0.3;
          dotSize += Math.abs(breathe) * 0.3;
          opacity += Math.abs(breathe) * 0.1;
        }
        
        // Clamp values - allow darker opacity for better visibility
        dotSize = Math.max(0.8, Math.min(4, dotSize)); // Allow bigger dots
        opacity = Math.max(0.1, Math.min(1.0, opacity)); // Allow full opacity
        
        ctx.fillStyle = `rgba(0,0,0,${opacity})`;
        ctx.beginPath();
        ctx.arc(gx + 0.5, gy + 0.5, dotSize, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    ctx.restore();

    // Animated color waves layer (soft) replacing heavy cell heatmap
    if (settings.showHeatmap) {
      const t = performance.now() * 0.00025 * settings.speed;
      const waveAmp = 0.35;
      const waveScaleX = 0.0022;
      const waveScaleY = 0.0022;
      const px = pointer.current.x * w;
      const py = pointer.current.y * h;
      const gradLayer = ctx.createLinearGradient(0, 0, w, h);
      gradLayer.addColorStop(0, 'rgba(255,255,255,0)');
      gradLayer.addColorStop(1, 'rgba(255,255,255,0.15)');
      ctx.globalCompositeOperation = 'lighter';
      const sampleCols = 80; const sampleRows = Math.round(sampleCols * (h / w));
      const cellX = w / sampleCols; const cellY = h / sampleRows;
      for (let r = 0; r < sampleRows; r++) {
        for (let c = 0; c < sampleCols; c++) {
          const cx = c * cellX + cellX/2; const cy = r * cellY + cellY/2;
          const dx = cx - px; const dy = cy - py; const dist = Math.sqrt(dx*dx + dy*dy);
          const angle = Math.atan2(dy, dx);
          const wave = Math.sin(cx * waveScaleX + t * 2 + Math.cos(cy * waveScaleY + t) * 2) * 0.5 + 0.5;
          const radial = Math.exp(-(dist*dist) / (2 * (Math.min(w,h)*0.45)**2));
          const val = (wave * 0.6 + radial * 0.8) * waveAmp;
          if (val < 0.02) continue;
          // Map val to a pastel viridis
          const color = viridis(val * 0.9);
          const m = /rgb\((\d+),(\d+),(\d+)\)/.exec(color);
          if (!m) continue; let rr=+m[1], gg=+m[2], bb=+m[3];
          rr = Math.round(lerp(rr, 255, 0.6)); gg = Math.round(lerp(gg, 255, 0.6)); bb = Math.round(lerp(bb, 255, 0.6));
          ctx.fillStyle = `rgba(${rr},${gg},${bb},${Math.min(0.85, val*0.75)})`;
          ctx.fillRect(c * cellX, r * cellY, cellX+1, cellY+1);
        }
      }
      ctx.globalCompositeOperation = 'source-over';
      ctx.fillStyle = gradLayer; ctx.fillRect(0,0,w,h);
    }

    // Soft drifting blurred blobs (elegant ambient field) - DISABLED for cleaner grid-only look
    // Code removed for cleaner implementation

    // Enhanced particles with elegant motion and visual effects - DISABLED for cleaner look  
    // Code removed for cleaner implementation

    if (!reduced) {
      const targetFps = 60; // could adapt using performance
      const now = performance.now();
      // simple scheduling: always request next frame
      rafRef.current = requestAnimationFrame(loop);
    } else {
      // slower updates when reduced
      rafRef.current = requestAnimationFrame(loop);
    }
  }, [settings.showHeatmap, settings.showParticles, settings.heatmapIntensity, settings.speed, settings.particleCount, reduced]);

  useEffect(() => {
    if (!mounted) return;
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    rafRef.current = requestAnimationFrame(loop);
    return () => { if (rafRef.current) cancelAnimationFrame(rafRef.current); };
  }, [loop, mounted]);

  return (
    <canvas
      ref={canvasRef}
      aria-hidden="true"
      className="pointer-events-none fixed inset-0 w-full h-full z-0 bg-gradient-to-br from-neutral-50 via-white to-neutral-100 dark:from-neutral-950 dark:via-neutral-900 dark:to-neutral-950"
    />
  );
};

export default CanvasBackground;
