import { ApiEngine } from './api';
import { BrowserEngine } from './browser';
import type { Engine } from './types';

export type { Engine } from './types';
export { EngineError } from './types';

/**
 * VITE_ENGINE = auto | api | browser (default auto).
 * VITE_API_URL = API origin ('' = same origin, e.g. nginx proxy in docker-compose).
 * In auto mode the app probes /api/health and falls back to the in-browser RDKit.js engine.
 */
const MODE = (import.meta.env.VITE_ENGINE || 'auto') as 'auto' | 'api' | 'browser';
const API_URL = (import.meta.env.VITE_API_URL || '').replace(/\/$/, '');

export async function selectEngine(): Promise<Engine> {
  if (MODE === 'browser') return new BrowserEngine();
  const api = new ApiEngine(API_URL);
  if (MODE === 'api') return api;
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 2500);
    const res = await fetch(`${API_URL}/api/health`, { signal: ctrl.signal });
    clearTimeout(t);
    const ct = res.headers.get('content-type') || '';
    if (res.ok && ct.includes('json')) return api;
  } catch {
    /* fall through to browser engine */
  }
  return new BrowserEngine();
}
