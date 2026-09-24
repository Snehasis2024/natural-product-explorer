import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { selectEngine, type Engine } from './engine';
import type { EngineStatus } from './types';
import { safeStorage } from './format';

interface AppState {
  engine: Engine | null;
  status: EngineStatus | null;
  engineError: string | null;
  theme: 'dark' | 'light';
  toggleTheme: () => void;
  compare: string[];
  toggleCompare: (id: string) => void;
  clearCompare: () => void;
}

const Ctx = createContext<AppState | null>(null);
const store = safeStorage();
export const MAX_COMPARE = 4;

export function AppProvider({ children }: { children: ReactNode }) {
  const [engine, setEngine] = useState<Engine | null>(null);
  const [status, setStatus] = useState<EngineStatus | null>(null);
  const [engineError, setEngineError] = useState<string | null>(null);
  const [theme, setTheme] = useState<'dark' | 'light'>(() => (store.get('npe-theme') === 'light' ? 'light' : 'dark'));
  const [compare, setCompare] = useState<string[]>(() => {
    try { return JSON.parse(store.get('npe-compare') || '[]').slice(0, MAX_COMPARE); } catch { return []; }
  });

  useEffect(() => {
    let alive = true;
    selectEngine()
      .then(async (e) => {
        if (!alive) return;
        setEngine(e);
        try { setStatus(await e.status()); } catch (err) { setEngineError(String((err as Error).message || err)); }
      })
      .catch((err) => setEngineError(String(err)));
    return () => { alive = false; };
  }, []);

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    store.set('npe-theme', theme);
  }, [theme]);
  useEffect(() => store.set('npe-compare', JSON.stringify(compare)), [compare]);

  const toggleTheme = useCallback(() => setTheme((t) => (t === 'dark' ? 'light' : 'dark')), []);
  const toggleCompare = useCallback((id: string) => {
    setCompare((c) => (c.includes(id) ? c.filter((x) => x !== id) : c.length >= MAX_COMPARE ? c : [...c, id]));
  }, []);
  const clearCompare = useCallback(() => setCompare([]), []);

  const value = useMemo(() => ({ engine, status, engineError, theme, toggleTheme, compare, toggleCompare, clearCompare }), [engine, status, engineError, theme, toggleTheme, compare, toggleCompare, clearCompare]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useApp() {
  const v = useContext(Ctx);
  if (!v) throw new Error('useApp outside AppProvider');
  return v;
}

/** Run an engine call whenever deps change; exposes loading/error/data. */
export function useEngineQuery<T>(fn: ((e: Engine) => Promise<T>) | null, deps: unknown[]) {
  const { engine } = useApp();
  const [state, setState] = useState<{ data: T | null; loading: boolean; error: string | null }>({ data: null, loading: !!fn, error: null });
  useEffect(() => {
    if (!engine || !fn) {
      setState((s) => ({ ...s, loading: !!fn && !engine }));
      return;
    }
    let alive = true;
    setState((s) => ({ data: s.data, loading: true, error: null }));
    fn(engine)
      .then((data) => alive && setState({ data, loading: false, error: null }))
      .catch((err) => alive && setState({ data: null, loading: false, error: err?.message || String(err) }));
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [engine, ...deps]);
  return state;
}

export function useDebounced<T>(value: T, ms = 300): T {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}
