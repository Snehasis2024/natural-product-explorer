import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import clsx from 'clsx';
import { FlaskConical, Search } from 'lucide-react';
import { useApp, useDebounced } from '../lib/app-context';
import { detectQueryType, guessQueryKind, QUERY_LABELS } from '../lib/query';
import type { CompoundSummary } from '../lib/types';
import { PathwayDot } from './ui';

const EXAMPLES = [
  { label: 'Artemisinin', q: 'artemisinin' },
  { label: 'Curcumin SMILES', q: 'COc1cc(/C=C/C(=O)CC(=O)/C=C/c2ccc(O)c(OC)c2)ccc1O' },
  { label: 'InChIKey', q: 'RYYVLZVUVIJVGH-UHFFFAOYSA-N' },
  { label: 'CID 36314', q: '36314' },
];

/** Universal search: names show live suggestions; structures and identifiers route to the right view. */
export function SearchBar({ size = 'md', autoFocus, initial = '' }: { size?: 'md' | 'lg'; autoFocus?: boolean; initial?: string }) {
  const { engine } = useApp();
  const nav = useNavigate();
  const [q, setQ] = useState(initial);
  const [suggest, setSuggest] = useState<CompoundSummary[]>([]);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const dq = useDebounced(q, 220);
  const kind = useMemo(() => (q.trim() ? guessQueryKind(q) : null), [q]);
  const boxRef = useRef<HTMLDivElement>(null);

  useEffect(() => setQ(initial), [initial]);

  useEffect(() => {
    if (!engine || !dq.trim() || guessQueryKind(dq) !== 'name' || dq.trim().length < 2) { setSuggest([]); return; }
    let alive = true;
    engine.search({ q: dq.trim(), page_size: 6 }).then((r) => alive && setSuggest(r.results)).catch(() => alive && setSuggest([]));
    return () => { alive = false; };
  }, [dq, engine]);

  useEffect(() => {
    const close = (e: MouseEvent) => { if (!boxRef.current?.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, []);

  const submit = async (value = q) => {
    const v = value.trim();
    if (!v) return;
    setOpen(false);
    let k: string = guessQueryKind(v);
    if (k === 'maybe-smiles') k = (await detectQueryType(v).catch(() => ({ kind: 'name' }))).kind;
    if (k === 'smiles') nav(`/analyze?smiles=${encodeURIComponent(v)}`);
    else nav(`/search?q=${encodeURIComponent(v)}`);
  };

  const lg = size === 'lg';
  return (
    <div ref={boxRef} className="relative w-full">
      <form
        role="search"
        onSubmit={(e) => {
          e.preventDefault();
          if (open && active >= 0 && suggest[active]) nav(`/compound/${suggest[active].compound_id}`);
          else submit();
        }}
        className={clsx('flex items-center gap-2 rounded-lg border border-line bg-surface focus-within:border-accent focus-within:ring-1 focus-within:ring-accent/40', lg ? 'p-2 pl-4' : 'p-1 pl-3')}
      >
        <Search className={clsx('shrink-0 text-muted', lg ? 'h-5 w-5' : 'h-4 w-4')} aria-hidden />
        <input
          id={lg ? 'hero-search' : 'nav-search'}
          value={q}
          autoFocus={autoFocus}
          onChange={(e) => { setQ(e.target.value); setOpen(true); setActive(-1); }}
          onFocus={() => setOpen(true)}
          onKeyDown={(e) => {
            if (e.key === 'ArrowDown') { e.preventDefault(); setActive((a) => Math.min(a + 1, suggest.length - 1)); }
            if (e.key === 'ArrowUp') { e.preventDefault(); setActive((a) => Math.max(a - 1, -1)); }
            if (e.key === 'Escape') setOpen(false);
          }}
          placeholder="Search natural product, SMILES, InChIKey, PubChem CID…"
          aria-label="Search natural products by name, SMILES, InChI, InChIKey, PubChem CID, NPAtlas or COCONUT ID"
          autoComplete="off"
          spellCheck={false}
          className={clsx('min-w-0 flex-1 bg-transparent text-ink placeholder:text-faint focus:outline-none', lg ? 'text-base py-1.5' : 'text-sm py-1')}
        />
        {kind && (
          <span className="hidden shrink-0 rounded bg-raised px-2 py-0.5 text-[11px] text-muted sm:inline" aria-live="polite">
            {kind === 'maybe-smiles' ? 'SMILES → analyse' : QUERY_LABELS[kind]}
          </span>
        )}
        <button type="submit" className={clsx('btn-primary shrink-0', lg && 'px-4 py-2')}>
          {kind === 'maybe-smiles' ? <><FlaskConical className="h-4 w-4" /> Analyse</> : 'Search'}
        </button>
      </form>
      {open && suggest.length > 0 && (
        <ul role="listbox" className="absolute inset-x-0 top-full z-50 mt-1 overflow-hidden rounded-lg border border-line bg-surface shadow-2xl">
          {suggest.map((s, i) => (
            <li key={s.compound_id} role="option" aria-selected={i === active}>
              <button
                type="button"
                onMouseEnter={() => setActive(i)}
                onClick={() => { setOpen(false); nav(`/compound/${s.compound_id}`); }}
                className={clsx('flex w-full items-center gap-3 px-3 py-2 text-left text-sm', i === active ? 'bg-raised' : 'hover:bg-raised')}
              >
                <PathwayDot pathway={s.pathway} />
                <span className="text-ink">{s.name}</span>
                <span className="ml-auto truncate text-[12px] text-muted">{s.class}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
      {lg && (
        <div className="mt-3 flex flex-wrap items-center gap-2 text-[12px] text-muted">
          <span>Try:</span>
          {EXAMPLES.map((e) => (
            <button key={e.label} type="button" className="chip hover:border-accent/60 hover:text-accent" onClick={() => { setQ(e.q); submit(e.q); }}>{e.label}</button>
          ))}
        </div>
      )}
    </div>
  );
}
