import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useVirtualizer } from '@tanstack/react-virtual';
import clsx from 'clsx';
import { ArrowDown, ArrowUp, ChevronLeft, ChevronRight, Database, Filter, FlaskConical, Globe, X } from 'lucide-react';
import { useApp, useDebounced, useEngineQuery } from '../lib/app-context';
import { QUERY_LABELS } from '../lib/query';
import type { CompoundSummary, SearchParams } from '../lib/types';
import { Page } from '../components/Layout';
import { ResultActions } from '../components/ResultActions';
import { EmptyState, ErrorState, Formula, PathwayDot, PathwayTag, Spinner, Structure2D, Tabs } from '../components/ui';

type Mode = 'database' | 'exact' | 'substructure' | 'similarity';

const COLUMNS: { key: string; label: string; sortable: boolean; className: string }[] = [
  { key: 'structure', label: 'Structure', sortable: false, className: 'w-[112px]' },
  { key: 'name', label: 'Compound', sortable: true, className: 'min-w-[160px] flex-[1.4]' },
  { key: 'formula', label: 'Formula', sortable: true, className: 'w-[120px]' },
  { key: 'molecular_weight', label: 'MW', sortable: true, className: 'w-[80px] text-right' },
  { key: 'pathway', label: 'Pathway', sortable: true, className: 'min-w-[150px] flex-1' },
  { key: 'superclass', label: 'Superclass', sortable: true, className: 'min-w-[130px] flex-1' },
  { key: 'class', label: 'Class', sortable: true, className: 'min-w-[140px] flex-1' },
  { key: 'organism', label: 'Source organism', sortable: true, className: 'min-w-[140px] flex-1' },
  { key: 'database', label: 'Database', sortable: true, className: 'w-[104px]' },
  { key: 'actions', label: 'Actions', sortable: false, className: 'w-[230px]' },
];

function num(v: string | null) {
  if (v === null || v === '') return undefined;
  const n = Number(v);
  return Number.isFinite(n) ? n : undefined;
}

function FacetGroup({ title, name, facets, selected, onToggle }: { title: string; name: string; facets: Record<string, number>; selected: string[]; onToggle: (k: string, v: string) => void }) {
  const [all, setAll] = useState(false);
  const entries = Object.entries(facets || {});
  if (!entries.length) return null;
  const shown = all ? entries : entries.slice(0, 7);
  return (
    <fieldset className="space-y-1">
      <legend className="label mb-1">{title}</legend>
      {shown.map(([v, c]) => (
        <label key={v} className="flex cursor-pointer items-center gap-2 rounded px-1 py-0.5 text-[12.5px] hover:bg-raised">
          <input type="checkbox" checked={selected.includes(v)} onChange={() => onToggle(name, v)} />
          {name === 'pathway' && <PathwayDot pathway={v} />}
          <span className="truncate text-ink" title={v}>{v}</span>
          <span className="num ml-auto text-[11px] text-faint">{c}</span>
        </label>
      ))}
      {entries.length > 7 && <button className="px-1 text-[12px] text-accent" onClick={() => setAll((a) => !a)}>{all ? 'Show fewer' : `Show all ${entries.length}`}</button>}
    </fieldset>
  );
}

function RangeFilter({ label, lo, hi, onChange, unit }: { label: string; lo?: number; hi?: number; unit?: string; onChange: (lo?: number, hi?: number) => void }) {
  const [a, setA] = useState(lo?.toString() ?? '');
  const [b, setB] = useState(hi?.toString() ?? '');
  const da = useDebounced(a, 450), db = useDebounced(b, 450);
  useEffect(() => { setA(lo?.toString() ?? ''); setB(hi?.toString() ?? ''); }, [lo, hi]);
  useEffect(() => {
    if (num(da) !== lo || num(db) !== hi) onChange(num(da), num(db));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [da, db]);
  const id = label.replace(/\W+/g, '-').toLowerCase();
  return (
    <fieldset>
      <legend className="label mb-1">{label}{unit && <span className="normal-case tracking-normal text-faint"> ({unit})</span>}</legend>
      <div className="flex items-center gap-1.5">
        <input id={`${id}-min`} aria-label={`${label} minimum`} className="input px-2 py-1 text-[12.5px]" inputMode="decimal" placeholder="min" value={a} onChange={(e) => setA(e.target.value)} />
        <span className="text-faint">–</span>
        <input id={`${id}-max`} aria-label={`${label} maximum`} className="input px-2 py-1 text-[12.5px]" inputMode="decimal" placeholder="max" value={b} onChange={(e) => setB(e.target.value)} />
      </div>
    </fieldset>
  );
}

function VirtualTable({ rows, sort, order, onSort }: { rows: CompoundSummary[]; sort: string; order: 'asc' | 'desc'; onSort: (k: string) => void }) {
  const parentRef = useRef<HTMLDivElement>(null);
  const v = useVirtualizer({ count: rows.length, getScrollElement: () => parentRef.current, estimateSize: () => 84, overscan: 6 });
  return (
    <div className="panel overflow-hidden">
      <div ref={parentRef} className="max-h-[70vh] overflow-auto" role="table" aria-label="Natural products" aria-rowcount={rows.length}>
        <div className="min-w-[1280px]">
          <div role="row" className="sticky top-0 z-10 flex items-center gap-3 border-b border-line bg-surface px-3 py-2 text-[11px] uppercase tracking-wider text-muted">
            {COLUMNS.map((c) => (
              <div key={c.key} role="columnheader" className={clsx('shrink-0', c.className)} aria-sort={sort === c.key ? (order === 'asc' ? 'ascending' : 'descending') : undefined}>
                {c.sortable ? (
                  <button className={clsx('inline-flex items-center gap-1 hover:text-ink', sort === c.key && 'text-accent')} onClick={() => onSort(c.key)}>
                    {c.label}{sort === c.key && (order === 'asc' ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />)}
                  </button>
                ) : c.label}
              </div>
            ))}
          </div>
          <div style={{ height: v.getTotalSize(), position: 'relative' }}>
            {v.getVirtualItems().map((vi) => {
              const r = rows[vi.index];
              return (
                <div key={r.compound_id} role="row" className="absolute left-0 flex w-full items-center gap-3 border-b border-line/60 px-3 text-[13px] hover:bg-raised/50"
                  style={{ height: vi.size, transform: `translateY(${vi.start}px)` }}>
                  <div role="cell" className={clsx('shrink-0', COLUMNS[0].className)}><Link to={`/compound/${r.compound_id}`} aria-label={`Open ${r.name}`}><Structure2D smiles={r.canonical_smiles} width={112} height={76} title={r.name} /></Link></div>
                  <div role="cell" className={clsx('shrink-0', COLUMNS[1].className)}>
                    <Link to={`/compound/${r.compound_id}`} className="font-medium text-ink hover:text-accent">{r.name}</Link>
                    {r.similarity !== undefined && <div className="num text-[11.5px] text-accent">Tanimoto {r.similarity.toFixed(3)}{r.match_type === 'exact' ? ' · exact' : ''}</div>}
                  </div>
                  <div role="cell" className={clsx('shrink-0 font-mono text-[12px]', COLUMNS[2].className)}><Formula formula={r.formula} /></div>
                  <div role="cell" className={clsx('num shrink-0 font-mono text-[12px]', COLUMNS[3].className)}>{r.molecular_weight.toFixed(2)}</div>
                  <div role="cell" className={clsx('shrink-0', COLUMNS[4].className)}><PathwayTag pathway={r.pathway} /></div>
                  <div role="cell" className={clsx('shrink-0 text-muted', COLUMNS[5].className)}>{r.superclass}</div>
                  <div role="cell" className={clsx('shrink-0 text-muted', COLUMNS[6].className)}>{r.class}</div>
                  <div role="cell" className={clsx('shrink-0 truncate italic text-muted', COLUMNS[7].className)} title={r.organism ?? ''}>{r.organism ?? '—'}</div>
                  <div role="cell" className={clsx('shrink-0 text-[12px] text-muted', COLUMNS[8].className)}>{r.database}</div>
                  <div role="cell" className={clsx('shrink-0', COLUMNS[9].className)}><ResultActions id={r.compound_id} name={r.name} dense /></div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

function DatabaseSearch() {
  const [sp, setSp] = useSearchParams();
  const [showFilters, setShowFilters] = useState(false);
  const { status } = useApp();
  const list = (k: string) => sp.getAll(k);
  const params: SearchParams = useMemo(() => ({
    q: sp.get('q') || '', pathway: list('pathway'), superclass: list('superclass'), class: list('class'), kingdom: list('kingdom'), database: list('database'),
    organism: sp.get('organism') || undefined, mw_min: num(sp.get('mw_min')), mw_max: num(sp.get('mw_max')), logp_min: num(sp.get('logp_min')), logp_max: num(sp.get('logp_max')),
    tpsa_min: num(sp.get('tpsa_min')), tpsa_max: num(sp.get('tpsa_max')), sort: sp.get('sort') || 'relevance', order: (sp.get('order') as 'asc' | 'desc') || 'asc',
    page: num(sp.get('page')) || 1, page_size: num(sp.get('page_size')) || 50, remote: sp.get('remote') === '1',
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [sp.toString()]);
  const { data, loading, error } = useEngineQuery((e) => e.search(params), [JSON.stringify(params)]);
  const [text, setText] = useState(params.q || '');
  const dText = useDebounced(text, 350);
  useEffect(() => setText(params.q || ''), [params.q]);

  const update = (mut: (p: URLSearchParams) => void, resetPage = true) => {
    const next = new URLSearchParams(sp);
    mut(next);
    if (resetPage) next.delete('page');
    setSp(next, { replace: true });
  };
  useEffect(() => {
    if (dText !== (params.q || '')) update((p) => (dText ? p.set('q', dText) : p.delete('q')));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dText]);
  const toggle = (k: string, v: string) => update((p) => {
    const cur = p.getAll(k);
    p.delete(k);
    (cur.includes(v) ? cur.filter((x) => x !== v) : [...cur, v]).forEach((x) => p.append(k, x));
  });
  const setRange = (a: string, b: string) => (lo?: number, hi?: number) => update((p) => {
    lo === undefined ? p.delete(a) : p.set(a, String(lo));
    hi === undefined ? p.delete(b) : p.set(b, String(hi));
  });
  const onSort = (k: string) => update((p) => {
    if (p.get('sort') === k) p.set('order', p.get('order') === 'desc' ? 'asc' : 'desc');
    else { p.set('sort', k); p.set('order', 'asc'); }
  }, false);
  const active = ['pathway', 'superclass', 'class', 'kingdom', 'database', 'organism', 'mw_min', 'mw_max', 'logp_min', 'logp_max', 'tpsa_min', 'tpsa_max'].filter((k) => sp.getAll(k).length);

  const filters = (
    <div className="space-y-4">
      <FacetGroup title="Pathway" name="pathway" facets={data?.facets.pathway || {}} selected={params.pathway || []} onToggle={toggle} />
      <FacetGroup title="Superclass" name="superclass" facets={data?.facets.superclass || {}} selected={params.superclass || []} onToggle={toggle} />
      <FacetGroup title="Class" name="class" facets={data?.facets.class || {}} selected={params.class || []} onToggle={toggle} />
      <FacetGroup title="Kingdom" name="kingdom" facets={data?.facets.kingdom || {}} selected={params.kingdom || []} onToggle={toggle} />
      <FacetGroup title="Database" name="database" facets={data?.facets.database || {}} selected={params.database || []} onToggle={toggle} />
      <fieldset>
        <legend className="label mb-1">Organism</legend>
        <input id="organism-filter" className="input py-1 text-[12.5px]" placeholder="e.g. Citrus" defaultValue={params.organism} key={params.organism}
          onKeyDown={(e) => { if (e.key === 'Enter') { const v = (e.target as HTMLInputElement).value; update((p) => (v ? p.set('organism', v) : p.delete('organism'))); } }}
          onBlur={(e) => { const v = e.target.value; if (v !== (params.organism || '')) update((p) => (v ? p.set('organism', v) : p.delete('organism'))); }} />
      </fieldset>
      <RangeFilter label="Molecular weight" unit="g/mol" lo={params.mw_min} hi={params.mw_max} onChange={setRange('mw_min', 'mw_max')} />
      <RangeFilter label="LogP" lo={params.logp_min} hi={params.logp_max} onChange={setRange('logp_min', 'logp_max')} />
      <RangeFilter label="TPSA" unit="Å²" lo={params.tpsa_min} hi={params.tpsa_max} onChange={setRange('tpsa_min', 'tpsa_max')} />
      {active.length > 0 && <button className="btn w-full" onClick={() => update((p) => active.forEach((k) => p.delete(k)))}><X className="h-3.5 w-3.5" /> Clear filters</button>}
    </div>
  );

  return (
    <div className="grid gap-4 lg:grid-cols-[240px_minmax(0,1fr)]">
      <aside className="hidden lg:block"><div className="panel sticky top-20 max-h-[calc(100vh-6rem)] overflow-y-auto p-3">{filters}</div></aside>
      <div className="min-w-0 space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <input id="db-search" className="input max-w-md" placeholder="Filter by name, class, organism, formula, SMILES, InChIKey, CID…" value={text} onChange={(e) => setText(e.target.value)} aria-label="Search the database" />
          <button className="btn lg:hidden" onClick={() => setShowFilters((s) => !s)} aria-expanded={showFilters}><Filter className="h-4 w-4" /> Filters{active.length ? ` (${active.length})` : ''}</button>
          <label className="flex items-center gap-2 text-[12.5px] text-muted" title={status?.mode === 'api' ? 'Query PubChem, NPAtlas, COCONUT, LOTUS and ChEBI adapters' : 'Requires the API backend'}>
            <input type="checkbox" checked={params.remote} onChange={(e) => update((p) => (e.target.checked ? p.set('remote', '1') : p.delete('remote')), false)} />
            <Globe className="h-3.5 w-3.5" /> Include external databases
          </label>
          <div className="ml-auto flex items-center gap-2 text-[12.5px] text-muted" aria-live="polite">
            {loading && <Spinner />}
            {data && <span><span className="num text-ink">{data.total}</span> result{data.total === 1 ? '' : 's'}{data.query && <> · query type <b className="text-ink">{QUERY_LABELS[data.query_type] ?? data.query_type}</b></>}</span>}
          </div>
        </div>
        {showFilters && <div className="panel p-3 lg:hidden">{filters}</div>}
        {error && <ErrorState title="Search failed" message={error} />}
        {data?.message && (
          <div className="flex flex-wrap items-center gap-2 rounded-md border border-line bg-raised/50 px-3 py-2 text-[13px] text-muted">
            {data.message}
            {data.structure && <Link className="btn ml-auto" to={`/analyze?smiles=${encodeURIComponent(data.structure.canonical_smiles)}`}><FlaskConical className="h-4 w-4" /> Analyse structure</Link>}
          </div>
        )}
        {data && data.results.length === 0 && !data.message && (
          <EmptyState title="No compounds match" message="Try a broader query, remove filters, or search by structure." action={active.length ? <button className="btn mt-2" onClick={() => update((p) => active.forEach((k) => p.delete(k)))}>Clear filters</button> : undefined} />
        )}
        {data && data.results.length > 0 && <VirtualTable rows={data.results} sort={params.sort || 'relevance'} order={params.order || 'asc'} onSort={onSort} />}
        {data && data.pages > 1 && (
          <nav className="flex items-center justify-center gap-2 text-[13px]" aria-label="Pagination">
            <button className="btn-icon h-8 w-8" disabled={data.page <= 1} onClick={() => update((p) => p.set('page', String(data.page - 1)), false)} aria-label="Previous page"><ChevronLeft className="h-4 w-4" /></button>
            <span className="num text-muted">Page <b className="text-ink">{data.page}</b> of {data.pages}</span>
            <button className="btn-icon h-8 w-8" disabled={data.page >= data.pages} onClick={() => update((p) => p.set('page', String(data.page + 1)), false)} aria-label="Next page"><ChevronRight className="h-4 w-4" /></button>
            <select id="page-size" aria-label="Rows per page" className="input w-auto py-1 text-[12.5px]" value={params.page_size} onChange={(e) => update((p) => p.set('page_size', e.target.value))}>
              {[25, 50, 100].map((n) => <option key={n} value={n}>{n} / page</option>)}
            </select>
          </nav>
        )}
        {data?.external && (
          <div className="panel space-y-2 p-3">
            <div className="flex items-center gap-2"><Database className="h-4 w-4 text-accent" /><span className="label">External databases</span></div>
            {!data.external.enabled ? <p className="text-[13px] text-muted">{data.external.message}</p> : (
              <>
                <div className="flex flex-wrap gap-2">{data.external.sources?.map((s) => <span key={s.name} className={clsx('chip', s.error && 'border-bad/50 text-bad')} title={s.error ?? ''}>{s.name}: {s.error ? 'error' : s.count}</span>)}</div>
                {data.external.results?.length ? (
                  <ul className="divide-y divide-line/60 text-[13px]">
                    {data.external.results.map((r: any) => (
                      <li key={r.compound_id} className="flex flex-wrap items-center gap-2 py-1.5">
                        <span className="chip">{r.database}</span>
                        <span className="text-ink">{r.name ?? r.database_id}</span>
                        {r.formula && <Formula formula={r.formula} className="font-mono text-[12px] text-muted" />}
                        {r.smiles && <Link className="text-[12px] text-accent hover:underline" to={`/analyze?smiles=${encodeURIComponent(r.smiles)}`}>Analyse</Link>}
                        {r.source_url && <a className="ml-auto text-[12px] text-accent hover:underline" href={r.source_url} target="_blank" rel="noreferrer">Source ↗</a>}
                      </li>
                    ))}
                  </ul>
                ) : <p className="text-[13px] text-muted">No external records returned.</p>}
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function ResultCard({ r, highlight }: { r: CompoundSummary; highlight?: number[] }) {
  return (
    <article className="panel flex flex-col gap-2 p-3">
      <Link to={`/compound/${r.compound_id}`} className="rounded-md border border-line/60 bg-bg/30 p-1"><Structure2D smiles={r.canonical_smiles} width={260} height={170} highlight={highlight} title={r.name} /></Link>
      <div className="flex items-start gap-2">
        <Link to={`/compound/${r.compound_id}`} className="font-medium text-ink hover:text-accent">{r.name}</Link>
        {r.similarity !== undefined && <span className="num ml-auto rounded bg-accent/15 px-1.5 py-0.5 font-mono text-[12px] text-accent">{r.similarity.toFixed(3)}</span>}
      </div>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px] text-muted">
        <Formula formula={r.formula} className="font-mono" /><span className="num">{r.molecular_weight.toFixed(2)} g/mol</span>
      </div>
      <div className="space-y-0.5 text-[12px]">
        <PathwayTag pathway={r.pathway} />
        <div className="text-muted">{r.superclass} › <span className="text-ink">{r.class}</span></div>
      </div>
      <div className="mt-auto pt-1"><ResultActions id={r.compound_id} name={r.name} dense /></div>
    </article>
  );
}

const STRUCTURE_EXAMPLES: Record<Exclude<Mode, 'database'>, { label: string; q: string }[]> = {
  exact: [{ label: 'Caffeine (Kekulé)', q: 'CN1C=NC2=C1C(=O)N(C(=O)N2C)C' }, { label: 'Quercetin', q: 'O=c1c(O)c(-c2ccc(O)c(O)c2)oc2cc(O)cc(O)c12' }],
  substructure: [{ label: 'Coumarin core', q: 'O=c1ccc2ccccc2o1' }, { label: 'β-Lactam', q: 'O=C1CCN1' }, { label: 'Catechol', q: 'c1ccc(O)c(O)c1' }, { label: 'Tropane', q: 'C1CC2CCC(C1)N2' }],
  similarity: [{ label: 'Apigenin', q: 'O=c1cc(-c2ccc(O)cc2)oc2cc(O)cc(O)c12' }, { label: 'Morphine', q: 'CN1CC[C@]23c4c5ccc(O)c4O[C@H]2[C@@H](O)C=C[C@H]3[C@H]1C5' }, { label: 'Farnesol', q: 'CC(C)=CCC/C(C)=C/CC/C(C)=C/CO' }],
};

function StructureSearch({ mode }: { mode: Exclude<Mode, 'database'> }) {
  const [sp, setSp] = useSearchParams();
  const initial = sp.get('smiles') || '';
  const [query, setQuery] = useState(initial);
  const [submitted, setSubmitted] = useState(initial);
  const [threshold, setThreshold] = useState(num(sp.get('t')) ?? 0.5);
  const dThreshold = useDebounced(threshold, 250);
  useEffect(() => { setQuery(initial); setSubmitted(initial); }, [initial, mode]);

  const run = (q = query) => {
    setSubmitted(q.trim());
    const next = new URLSearchParams(sp);
    next.set('smiles', q.trim());
    setSp(next, { replace: true });
  };
  const { data, loading, error } = useEngineQuery(
    submitted ? (e) => (mode === 'similarity' ? e.similarity(submitted, dThreshold, 100) : mode === 'substructure' ? e.substructure(submitted, 200) : e.search({ q: submitted, page_size: 5 }).then((r) => ({ results: r.results.filter((x) => x.match_type === 'exact' || x.match_type === 'identifier') }))) : null,
    [submitted, mode, mode === 'similarity' ? dThreshold : 0],
  );
  const help = {
    exact: 'Matches the full structure via its standard InChIKey, so any valid SMILES of the same molecule (Kekulé, aromatic, different atom order) is found.',
    substructure: 'Enter a SMILES or SMARTS fragment. Matching atoms are highlighted. Runs on RDKit substructure matching with pattern-fingerprint screening.',
    similarity: 'Morgan fingerprints (radius 2, 2048 bits) compared by Tanimoto similarity.',
  }[mode];

  return (
    <div className="space-y-4">
      <div className="panel space-y-3 p-4">
        <form className="flex flex-col gap-2 sm:flex-row" onSubmit={(e) => { e.preventDefault(); run(); }}>
          <input id={`structure-${mode}`} className="input font-mono" value={query} onChange={(e) => setQuery(e.target.value)} placeholder={mode === 'substructure' ? 'SMILES or SMARTS, e.g. O=c1ccc2ccccc2o1' : 'SMILES, e.g. O=c1cc(-c2ccc(O)cc2)oc2cc(O)cc(O)c12'} aria-label="Structure query" spellCheck={false} />
          <button className="btn-primary shrink-0" type="submit" disabled={!query.trim()}>Search</button>
        </form>
        <div className="flex flex-wrap items-center gap-2 text-[12px] text-muted">
          <span>Examples:</span>
          {STRUCTURE_EXAMPLES[mode].map((ex) => <button key={ex.label} className="chip hover:border-accent/60 hover:text-accent" onClick={() => { setQuery(ex.q); run(ex.q); }}>{ex.label}</button>)}
        </div>
        {mode === 'similarity' && (
          <div className="flex flex-wrap items-center gap-3">
            <label htmlFor="sim-threshold" className="text-[13px] text-ink">Similarity threshold</label>
            <input id="sim-threshold" type="range" min={0} max={1} step={0.01} value={threshold} onChange={(e) => setThreshold(+e.target.value)} className="w-56 accent-[rgb(var(--accent))]" aria-valuetext={threshold.toFixed(2)} />
            <span className="num w-12 font-mono text-[13px] text-accent">{threshold.toFixed(2)}</span>
            <span className="text-[12px] text-muted">Tanimoto · Morgan r=2</span>
          </div>
        )}
        <p className="text-[12px] text-faint">{help}</p>
      </div>
      {!submitted && <EmptyState icon={<FlaskConical className="h-6 w-6" />} title="Enter a structure to search" message="Pick an example above or paste your own SMILES." />}
      {loading && <Spinner label="Searching…" />}
      {error && <ErrorState title="Structure search failed" message={error} />}
      {data && submitted && (
        <>
          <div className="text-[13px] text-muted"><span className="num text-ink">{data.results.length}</span> hit{data.results.length === 1 ? '' : 's'}{'method' in data && data.method ? ` · ${data.method}` : ''}</div>
          {data.results.length === 0 ? (
            <EmptyState title="No matches" message={mode === 'similarity' ? 'Lower the threshold to include more distant analogues.' : mode === 'exact' ? 'This exact structure is not in the database. You can still analyse it.' : 'No compound contains this fragment.'}
              action={mode === 'exact' ? <Link className="btn mt-2" to={`/analyze?smiles=${encodeURIComponent(submitted)}`}>Analyse structure</Link> : undefined} />
          ) : (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
              {data.results.map((r: CompoundSummary) => <ResultCard key={r.compound_id} r={r} highlight={mode === 'substructure' ? r.match_atoms : undefined} />)}
            </div>
          )}
        </>
      )}
    </div>
  );
}

export function SearchPage() {
  const [sp, setSp] = useSearchParams();
  const mode = (sp.get('mode') as Mode) || 'database';
  return (
    <Page className="space-y-4">
      <div className="flex flex-wrap items-end gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-ink">Search</h1>
          <p className="text-[13px] text-muted">Browse the natural-product database or search by structure.</p>
        </div>
      </div>
      <Tabs
        tabs={[{ id: 'database', label: 'Database' }, { id: 'exact', label: 'Exact structure' }, { id: 'substructure', label: 'Substructure' }, { id: 'similarity', label: 'Similarity' }]}
        value={mode}
        onChange={(m) => {
          const next = new URLSearchParams();
          if (m !== 'database') { next.set('mode', m); const s = sp.get('smiles'); if (s) next.set('smiles', s); }
          setSp(next);
        }}
      />
      {mode === 'database' ? <DatabaseSearch /> : <StructureSearch mode={mode} />}
    </Page>
  );
}
