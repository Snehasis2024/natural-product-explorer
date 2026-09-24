import { useState, type ReactNode } from 'react';
import { Link, NavLink, useLocation } from 'react-router-dom';
import clsx from 'clsx';
import { Columns3, Cpu, Globe, Menu, Moon, Sun, X } from 'lucide-react';
import { useApp } from '../lib/app-context';

const NAV = [
  { to: '/', label: 'Home', end: true },
  { to: '/explore', label: 'Explore' },
  { to: '/search', label: 'Search' },
  { to: '/predict', label: 'AI Classification' },
  { to: '/compare', label: 'Compare' },
  { to: '/databases', label: 'Databases' },
  { to: '/about', label: 'About' },
];

export function Logo({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={className} aria-hidden>
      <path d="M16 3l11 6.5v13L16 29 5 22.5v-13z" fill="none" stroke="currentColor" strokeWidth="2.2" />
      <path d="M16 9.5l5.6 3.25v6.5L16 22.5l-5.6-3.25v-6.5z" fill="none" stroke="currentColor" strokeWidth="1.3" opacity=".55" />
      <circle cx="16" cy="16" r="2.6" fill="currentColor" />
    </svg>
  );
}

function EngineBadge() {
  const { status, engineError } = useApp();
  if (engineError) return <span className="chip border-bad/50 text-bad" title={engineError}>Engine error</span>;
  if (!status) return <span className="chip">Starting engine…</span>;
  const api = status.mode === 'api';
  return (
    <span className="hidden md:block" title={status.detail}>
      <span className="chip">
        {api ? <Globe className="h-3 w-3 text-ok" /> : <Cpu className="h-3 w-3 text-accent" />}
        {api ? 'API' : 'Browser'} · {status.compounds}
      </span>
    </span>
  );
}

export function Layout({ children }: { children: ReactNode }) {
  const { theme, toggleTheme, compare, clearCompare } = useApp();
  const [open, setOpen] = useState(false);
  const loc = useLocation();
  const linkCls = ({ isActive }: { isActive: boolean }) =>
    clsx('rounded-md px-2.5 py-1.5 text-[13px] transition-colors', isActive ? 'bg-raised text-ink' : 'text-muted hover:text-ink');

  return (
    <div className="flex min-h-screen flex-col">
      <header className="glass sticky z-40 border-b border-line" style={{ top: 'env(safe-area-inset-top, 0px)' }}>
        <div className="mx-auto flex h-14 max-w-[1500px] items-center gap-4 px-4">
          <Link to="/" className="flex items-center gap-2 text-ink" onClick={() => setOpen(false)}>
            <Logo className="h-6 w-6 text-accent" />
            <span className="whitespace-nowrap text-[15px] font-semibold tracking-tight"><span className="sm:hidden">NP Explorer</span><span className="hidden sm:inline">Natural Product Explorer</span></span>
          </Link>
          <nav className="ml-4 hidden items-center gap-0.5 lg:flex" aria-label="Main">
            {NAV.map((n) => <NavLink key={n.to} to={n.to} end={n.end} className={linkCls}>{n.label}</NavLink>)}
          </nav>
          <div className="ml-auto flex items-center gap-2">
            <EngineBadge />
            <button className="btn-icon h-8 w-8" onClick={toggleTheme} aria-label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`} title="Toggle light/dark">
              {theme === 'dark' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
            </button>
            <button className="btn-icon h-8 w-8 lg:hidden" onClick={() => setOpen((o) => !o)} aria-label="Menu" aria-expanded={open}>
              {open ? <X className="h-4 w-4" /> : <Menu className="h-4 w-4" />}
            </button>
          </div>
        </div>
        {open && (
          <nav className="border-t border-line px-4 py-2 lg:hidden" aria-label="Mobile">
            <div className="grid grid-cols-2 gap-1">
              {NAV.map((n) => <NavLink key={n.to} to={n.to} end={n.end} className={linkCls} onClick={() => setOpen(false)}>{n.label}</NavLink>)}
            </div>
          </nav>
        )}
      </header>

      <main className="flex-1">{children}</main>

      {compare.length > 0 && !loc.pathname.startsWith('/compare') && (
        <div className="glass fixed inset-x-0 bottom-0 z-40 border-t border-line" style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}>
          <div className="mx-auto flex max-w-[1500px] items-center gap-3 px-4 py-2.5 text-sm">
            <Columns3 className="h-4 w-4 text-accent" aria-hidden />
            <span className="text-muted"><span className="num text-ink">{compare.length}</span>/4 selected for comparison</span>
            <button className="text-[12px] text-muted hover:text-ink" onClick={clearCompare}>Clear</button>
            <Link to={`/compare?ids=${compare.join(',')}`} className={clsx('btn-primary ml-auto', compare.length < 2 && 'pointer-events-none opacity-40')} aria-disabled={compare.length < 2}>
              Compare {compare.length >= 2 ? '' : '(select 2+)'}
            </Link>
          </div>
        </div>
      )}

      <footer className="border-t border-line">
        <div className="mx-auto flex max-w-[1500px] flex-wrap items-center gap-x-6 gap-y-2 px-4 py-5 text-[12px] text-muted">
          <span className="flex items-center gap-2"><Logo className="h-4 w-4 text-accent" /> Natural Product Explorer</span>
          <span>Demo dataset: curated structures; properties calculated with RDKit. Verify before scientific use.</span>
          <span className="ml-auto">Classification scheme after NPClassifier · 3D by 3Dmol.js</span>
        </div>
      </footer>
    </div>
  );
}

export function Page({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={clsx('mx-auto w-full max-w-[1500px] px-4 py-6 pb-24', className)}>{children}</div>;
}
