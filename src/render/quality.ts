/** Presentation budgets only; never imported by the simulation. */
export type Quality = 'low' | 'medium' | 'high' | 'ultra';
export const QUALITY = {
  low: { dpr: 1, shadow: 0, texture: 256, segments: 16, details: false, bloom: false, dof: false },
  medium: { dpr: 1.25, shadow: 1024, texture: 512, segments: 24, details: true, bloom: false, dof: false },
  high: { dpr: 1.5, shadow: 2048, texture: 1024, segments: 32, details: true, bloom: true, dof: false },
  ultra: { dpr: 2, shadow: 2048, texture: 1024, segments: 48, details: true, bloom: true, dof: true },
} as const;
export function autoQuality(): Quality {
  if (typeof navigator === 'undefined') return 'medium';
  const memory = (navigator as Navigator & { deviceMemory?: number }).deviceMemory ?? 4;
  const cores = navigator.hardwareConcurrency ?? 4;
  if (cores <= 2 || memory <= 2) return 'low';
  if (typeof matchMedia !== 'undefined' && matchMedia('(pointer: coarse)').matches) return 'medium';
  return cores >= 8 && memory >= 8 ? 'high' : 'medium';
}
let active: Quality = 'medium';
export const currentQuality = () => active;
export const setRenderQuality = (q: Quality) => { active = q; };
export const reducedMotion = () => typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches;
