import { useEffect, useState, type ReactNode } from 'react';
import clsx from 'clsx';
import { AlertTriangle, Inbox, Loader2 } from 'lucide-react';
import { depict } from '../lib/rdkit';
import { formulaParts, pathwayColor, pct } from '../lib/format';
import type { Provenance } from '../lib/types';

const PROV_STYLE: Record<Provenance, { label: string; cls: string; title: string }> = {
  calculated: { label: 'Calculated', cls: 'border-sky-400/40 text-sky-300 [[data-theme=light]_&]:text-sky-700', title: 'Computed from the structure with RDKit' },
  curated: { label: 'Curated', cls: 'border-amber-400/40 text-amber-300 [[data-theme=light]_&]:text-amber-700', title: 'Manually curated annotation (demo dataset)' },
  database: { label: 'Database', cls: 'border-violet-400/40 text-violet-300 [[data-theme=light]_&]:text-violet-700', title: 'Retrieved from an external database' },
  predicted: { label: 'Predicted', cls: 'border-fuchsia-400/40 text-fuchsia-300 [[data-theme=light]_&]:text-fuchsia-700', title: 'Output of a predictive model' },
  experimental: { label: 'Experimental', cls: 'border-emerald-400/40 text-emerald-300 [[data-theme=light]_&]:text-emerald-700', title: 'Experimentally measured' },
  demo: { label: 'Demo', cls: 'border-rose-400/40 text-rose-300 [[data-theme=light]_&]:text-rose-700', title: 'Demonstration data — not for scientific use without verification' },
};

export function ProvenanceBadge({ kind, className }: { kind: Provenance; className?: string }) {
  const s = PROV_STYLE[kind];
  return (
    <span title={s.title} className={clsx('inline-flex items-center rounded border px-1.5 py-px text-[10px] font-medium uppercase tracking-wider', s.cls, className)}>
      {s.label}
    </span>
  );
}

export function Spinner({ label, className }: { label?: string; className?: string }) {
  return (
    <div role="status" className={clsx('flex items-center gap-2 text-sm text-muted', className)}>
      <Loader2 className="h-4 w-4 animate-spin text-accent" aria-hidden />
      {label && <span>{label}</span>}
    </div>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={clsx('animate-pulse rounded bg-raised', className)} />;
}

export function ErrorState({ title = 'Something went wrong', message, action }: { title?: string; message: string; action?: ReactNode }) {
  return (
    <div role="alert" className="flex items-start gap-3 rounded-panel border border-bad/40 bg-bad/10 p-4 text-sm">
      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-bad" aria-hidden />
      <div className="space-y-1">
        <p className="font-medium text-ink">{title}</p>
        <p className="text-muted break-words">{message}</p>
        {action}
      </div>
    </div>
  );
}

export function EmptyState({ title, message, action, icon }: { title: string; message?: string; action?: ReactNode; icon?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 rounded-panel border border-dashed border-line px-6 py-10 text-center">
      <div className="text-faint">{icon ?? <Inbox className="h-6 w-6" aria-hidden />}</div>
      <p className="text-sm font-medium text-ink">{title}</p>
      {message && <p className="max-w-md text-sm text-muted">{message}</p>}
      {action}
    </div>
  );
}

export function Formula({ formula, className }: { formula: string; className?: string }) {
  return (
    <span className={clsx('num', className)}>
      {formulaParts(formula).map((p, i) => (p.sub ? <sub key={i}>{p.text}</sub> : <span key={i}>{p.text}</span>))}
    </span>
  );
}

export function PathwayDot({ pathway }: { pathway: string }) {
  return <span aria-hidden className="inline-block h-2 w-2 shrink-0 rounded-full" style={{ background: pathwayColor(pathway) }} />;
}

export function PathwayTag({ pathway }: { pathway: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] font-medium" style={{ background: pathwayColor(pathway, 0.14), color: pathwayColor(pathway) }}>
      <PathwayDot pathway={pathway} />
      {pathway}
    </span>
  );
}

export function Tabs<T extends string>({ tabs, value, onChange, className }: { tabs: { id: T; label: string }[]; value: T; onChange: (t: T) => void; className?: string }) {
  return (
    <div role="tablist" className={clsx('flex gap-1 overflow-x-auto border-b border-line', className)}>
      {tabs.map((t) => (
        <button
          key={t.id}
          role="tab"
          id={`tab-${t.id}`}
          aria-selected={value === t.id}
          onClick={() => onChange(t.id)}
          className={clsx(
            '-mb-px whitespace-nowrap border-b-2 px-3 py-2 text-[13px] transition-colors',
            value === t.id ? 'border-accent text-ink' : 'border-transparent text-muted hover:text-ink',
          )}
        >
          {t.label}
        </button>
      ))}
    </div>
  );
}

/** 2D depiction rendered client-side by RDKit.js. */
export function Structure2D({ smiles, width = 320, height = 240, highlight, className, title }: { smiles: string; width?: number; height?: number; highlight?: number[]; className?: string; title?: string }) {
  const [svg, setSvg] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const hl = (highlight || []).join(',');
  useEffect(() => {
    let alive = true;
    setFailed(false);
    depict(smiles, width, height, highlight || [])
      .then((s) => alive && (s ? setSvg(s) : setFailed(true)))
      .catch(() => alive && setFailed(true));
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [smiles, width, height, hl]);
  if (failed) return <div className={clsx('grid place-items-center text-xs text-faint', className)} style={{ aspectRatio: `${width}/${height}` }}>No depiction</div>;
  if (!svg) return <Skeleton className={clsx('w-full', className)} />;
  return (
    <div
      role="img"
      aria-label={title ? `2D structure of ${title}` : '2D structure'}
      className={clsx('structure-svg w-full', className)}
      style={{ aspectRatio: `${width}/${height}`, maxWidth: '100%' }}
      dangerouslySetInnerHTML={{ __html: svg }}
    />
  );
}

export function ProbabilityBar({ value, color = 'rgb(var(--accent))', label, sub }: { value: number; color?: string; label: string; sub?: string }) {
  return (
    <div className="space-y-1">
      <div className="flex items-baseline justify-between gap-3 text-sm">
        <span className="truncate text-ink" title={label}>{label}</span>
        <span className="num font-mono text-[12.5px] text-muted">{pct(value)}</span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-raised" role="meter" aria-valuemin={0} aria-valuemax={1} aria-valuenow={value} aria-label={`${label} ${pct(value)}`}>
        <div className="h-full rounded-full transition-[width] duration-700" style={{ width: `${Math.max(1, value * 100)}%`, background: color }} />
      </div>
      {sub && <p className="text-[11px] text-faint">{sub}</p>}
    </div>
  );
}

export function CopyButton({ text, label = 'Copy' }: { text: string; label?: string }) {
  const [done, setDone] = useState(false);
  return (
    <button
      className="text-[11px] text-muted hover:text-accent"
      onClick={() => {
        navigator.clipboard?.writeText(text).then(() => { setDone(true); setTimeout(() => setDone(false), 1400); }).catch(() => undefined);
      }}
    >
      {done ? 'Copied' : label}
    </button>
  );
}

export function SectionTitle({ children, right, className }: { children: ReactNode; right?: ReactNode; className?: string }) {
  return (
    <div className={clsx('flex items-center justify-between gap-3', className)}>
      <h3 className="label">{children}</h3>
      {right}
    </div>
  );
}
