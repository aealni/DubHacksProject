// Canvas math & utilities: distributions, kernels, color mapping
import { interpolateViridis } from 'd3-scale-chromatic';

// Lightweight viridis fallback if d3-scale-chromatic not installed (will be tree-shaken if unused)
export function viridis(t: number): string {
  if (typeof interpolateViridis === 'function') return interpolateViridis(Math.min(1, Math.max(0, t)));
  // Fallback simple gradient
  const clamped = Math.min(1, Math.max(0, t));
  const r = Math.round(30 + 200 * clamped);
  const g = Math.round(50 + 100 * (1 - Math.abs(clamped - 0.5) * 2));
  const b = Math.round(60 + 180 * (1 - clamped));
  return `rgb(${r},${g},${b})`;
}

export interface Particle {
  x: number; y: number; vx: number; vy: number; size: number; hue: number; alpha: number;
}

export function gaussianKernel(dist: number, sigma: number): number {
  const s2 = sigma * sigma;
  return Math.exp(- (dist * dist) / (2 * s2));
}

// Random normal via Box-Muller
export function randn(mean=0, std=1) {
  let u = 0, v = 0;
  while (u === 0) u = Math.random();
  while (v === 0) v = Math.random();
  const mag = Math.sqrt(-2.0 * Math.log(u));
  const z0 = mag * Math.cos(2 * Math.PI * v);
  return z0 * std + mean;
}

// Approx Beta(α, β) using Gamma sampling (α, β > 0)
export function randBeta(a: number, b: number): number {
  const ga = randGamma(a, 1);
  const gb = randGamma(b, 1);
  return ga / (ga + gb);
}

// Marsaglia & Tsang gamma
export function randGamma(k: number, theta: number): number {
  if (k < 1) {
    const c = (1 / k);
    const d = randGamma(1 + k, theta) * Math.pow(Math.random(), c);
    return d;
  }
  const d = k - 1/3;
  const c = 1 / Math.sqrt(9 * d);
  while (true) {
    let x: number, v: number;
    do { x = randn(); v = 1 + c * x; } while (v <= 0);
    v = v * v * v;
    const u = Math.random();
    if (u < 1 - 0.0331 * (x * x) * (x * x)) return theta * d * v;
    if (Math.log(u) < 0.5 * x * x + d * (1 - v + Math.log(v))) return theta * d * v;
  }
}

export function lerp(a: number, b: number, t: number) { return a + (b - a) * t; }
