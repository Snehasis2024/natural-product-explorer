import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import clsx from 'clsx';
import { Columns3, Link2, Link2Off, Plus, X } from 'lucide-react';
import { MAX_COMPARE, useApp, useDebounced, useEngineQuery } from '../lib/app-context';
import { withMol } from '../lib/rdkit';
import type { Compound, CompoundSummary } from '../lib/types';
import { Page } from '../components/Layout';
import { MolViewer3D } from '../components/MolViewer3D';
import { EmptyState, ErrorState, Formula, PathwayTag, Skeleton, Structure2D } from '../components/ui';

function useFingerprintMatrix(smiles: string[]) {
  const [m, setM] = useState<number[][] | null>(null);
  useEffect(() => {
    let alive = true;
    Promise.all(smiles.map((s) => withMol(s, (mol) => mol.get_morgan_fp(JSON.stringify({ radius: 2, nBits: 2048 })) as string))).then((fps) => {
      if (!alive) return;
      const t = (a: string, b: string) => {
        let i = 0, u = 0;
        for (let k = 0; k < a.length; k++) { const x = a[k] === '1', y = b[k] === '1'; if (x && y) i++; if (x || y) u++; }
        return u ? i / u : 0;
      };
      setM(fps.map((a) => fps.map((b) => (a && b ? t(a, b) : 0))));
    });
    return () => { alive = false; };
  }, [smiles.join('|')]); // eslint-disable-line react-hooks/exhaustive-deps
  return m;
}

function AddCompound({ onAdd, exclude }: { onAdd: (id: string) => void; exclude: string[] }) {
  const [q, setQ] = useState('');
  const dq = useDebounced(q, 200);
  const { data } = useEngineQuery(dq.trim().length >= 2 ? (e) => e.search({ q: dq.trim(), page_size: 8 }) : null, [dq]);
  const opts = (data?.results || []).filter((r: CompoundSummary) => !exclude.includes(r.compound_id));
  return (
    <div className="relative w-full max-w-xs">
      <input id="compare-add" className="input" placeholder="Add compound by name…" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Add compound to comparison" />
      {q.trim().length >= 2 && opts.length > 0 && (
        <ul className="absolute inset-x-0 top-full z-30 mt-1 overflow-hidden rounded-md border border-line bg-surface shadow-xl">
          {opts.map((o) => (
            <li key={o.compound_id}><button className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-[13px] hover:bg-raised" onClick={() => { onAdd(o.compound_id); setQ(''); }}><Plus className="h-3.5 w-3.5 text-accent" />{o.name}<span className="ml-auto text-[11px] text-muted">{o.class}</span></button></li>
          ))}
        </ul>
      )}
    </div>
  );
}

const ROWS: { label: string; get: (c: Compound) => React.ReactNode; num?: (c: Compound) => number }[] = [
  { label: 'Formula', get: (c) => <Formula formula={c.formula} className="font-mono" /> },
  { label: 'MW (g/mol)', get: (c) => c.molecular_weight.toFixed(2), num: (c) => c.molecular_weight },
  { label: 'Exact mass', get: (c) => c.exact_mass.toFixed(4), num: (c) => c.exact_mass },
  { label: 'LogP', get: (c) => c.properties.logp.toFixed(2), num: (c) => c.properties.logp },
  { label: 'TPSA (Å²)', get: (c) => c.properties.tpsa.toFixed(1), num: (c) => c.properties.tpsa },
  { label: 'HBD', get: (c) => c.properties.hbd, num: (c) => c.properties.hbd },
  { label: 'HBA', get: (c) => c.properties.hba, num: (c) => c.properties.hba },
  { label: 'Rotatable bonds', get: (c) => c.properties.rotatable_bonds, num: (c) => c.properties.rotatable_bonds },
  { label: 'Rings', get: (c) => c.properties.rings, num: (c) => c.properties.rings },
  { label: 'Stereocentres', get: (c) => c.properties.stereocenters, num: (c) => c.properties.stereocenters },
  { label: 'Fsp³', get: (c) => c.properties.fsp3.toFixed(2), num: (c) => c.properties.fsp3 },
  { label: 'QED', get: (c) => c.properties.qed?.toFixed(2) ?? '—', num: (c) => c.properties.qed ?? 0 },
  { label: 'NP-likeness', get: (c) => c.properties.np_likeness?.toFixed(2) ?? '—', num: (c) => c.properties.np_likeness ?? 0 },
  { label: 'Lipinski violations', get: (c) => c.properties.lipinski.violations, num: (c) => c.properties.lipinski.violations },
  { label: 'Pathway', get: (c) => <PathwayTag pathway={c.pathway} /> },
  { label: 'Superclass', get: (c) => c.superclass },
  { label: 'Class', get: (c) => c.class },
  { label: 'Source organism', get: (c) => <i>{c.organism?.name ?? '—'}</i> },
];

export function ComparePage() {
  const [sp, setSp] = useSearchParams();
  const { compare, toggleCompare, clearCompare } = useApp();
  const ids = useMemo(() => {
    const fromUrl = (sp.get('ids') || '').split(',').map((s) => s.trim()).filter(Boolean);
    return (fromUrl.length ? fromUrl : compare).slice(0, MAX_COMPARE);
  }, [sp, compare]);
  const setIds = (next: string[]) => {
    setSp(next.length ? { ids: next.join(',') } : {}, { replace: true });
    // keep the compare tray in step with the page
    clearCompare();
    next.forEach((id) => toggleCompare(id));
  };
  const { data, loading, error } = useEngineQuery(ids.length ? (e) => Promise.all(ids.map((id) => e.compound(id))) : null, [ids.join(',')]);
  const confs = useEngineQuery(ids.length ? (e) => Promise.all(ids.map((id) => e.conformer(id))) : null, [ids.join(',')]);
  const matrix = useFingerprintMatrix((data || []).map((c) => c.canonical_smiles));
  const [sync, setSync] = useState(true);
  const viewers = useRef<Map<number, any>>(new Map());
  const syncing = useRef(false);
  const syncRef = useRef(sync);
  syncRef.current = sync;

  const register = (i: number) => (v: any) => {
    viewers.current.set(i, v);
    v.setViewChangeCallback?.(() => {
      if (!syncRef.current || syncing.current) return;
      syncing.current = true;
      const view = v.getView();
      viewers.current.forEach((o, j) => { if (j !== i) { o.setView(view); o.render(); } });
      syncing.current = false;
    });
  };

  return (
    <Page className="space-y-5">
      <div className="flex flex-wrap items-center gap-3">
        <Columns3 className="h-6 w-6 text-accent" aria-hidden />
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-ink">Compare compounds</h1>
          <p className="text-[13px] text-muted">Select 2–4 natural products. Rotating one molecule rotates all when sync is on.</p>
        </div>
        <div className="ml-auto flex flex-wrap items-center gap-2">
          {ids.length < MAX_COMPARE && <AddCompound exclude={ids} onAdd={(id) => setIds([...ids, id])} />}
          <button className={clsx('btn', sync && 'border-accent text-accent')} aria-pressed={sync} onClick={() => setSync((s) => !s)}>
            {sync ? <Link2 className="h-4 w-4" /> : <Link2Off className="h-4 w-4" />} Sync rotation
          </button>
        </div>
      </div>

      {ids.length === 0 && (
        <EmptyState title="Nothing to compare yet" message="Add compounds with the search box above, or use the Compare button on any compound or search result."
          action={<Link className="btn mt-2" to="/compare?ids=quercetin,kaempferol,genistein">Load example: three flavonoids</Link>} />
      )}
      {ids.length === 1 && <p className="text-[13px] text-warn">Add at least one more compound to compare.</p>}
      {loading && <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">{ids.map((i) => <Skeleton key={i} className="h-80" />)}</div>}
      {error && <ErrorState message={error} />}

      {data && (
        <>
          <div className={clsx('grid gap-3', data.length === 2 ? 'md:grid-cols-2' : data.length === 3 ? 'md:grid-cols-3' : 'md:grid-cols-2 xl:grid-cols-4')}>
            {data.map((c, i) => (
              <div key={c.compound_id} className="panel overflow-hidden">
                <div className="flex items-center gap-2 border-b border-line px-3 py-2">
                  <Link to={`/compound/${c.compound_id}`} className="truncate font-medium text-ink hover:text-accent">{c.name}</Link>
                  <button className="btn-icon ml-auto h-7 w-7" aria-label={`Remove ${c.name}`} onClick={() => setIds(ids.filter((x) => x !== c.compound_id))}><X className="h-3.5 w-3.5" /></button>
                </div>
                <div className="h-[300px]">
                  {confs.data?.[i] ? (
                    <MolViewer3D molblock={confs.data[i].molblock} partialCharges={confs.data[i].partial_charges} title={c.name} fileName={c.compound_id} compact className="h-full rounded-none border-0" initialRepresentation="stick" onReady={register(i)} />
                  ) : <Skeleton className="h-full rounded-none" />}
                </div>
                <div className="border-t border-line p-2"><Structure2D smiles={c.canonical_smiles} width={300} height={170} title={c.name} /></div>
              </div>
            ))}
          </div>

          <div className="panel overflow-x-auto">
            <table className="w-full min-w-[640px] text-[13px]">
              <thead>
                <tr className="border-b border-line text-left">
                  <th className="px-3 py-2 text-[11px] font-medium uppercase tracking-wider text-muted">Property</th>
                  {data.map((c) => <th key={c.compound_id} className="px-3 py-2 font-medium text-ink">{c.name}</th>)}
                </tr>
              </thead>
              <tbody>
                {ROWS.map((r) => {
                  const vals = r.num ? data.map(r.num) : null;
                  const max = vals ? Math.max(...vals) : 0, min = vals ? Math.min(...vals) : 0;
                  return (
                    <tr key={r.label} className="border-b border-line/50">
                      <th scope="row" className="whitespace-nowrap px-3 py-1.5 text-left font-normal text-muted">{r.label}</th>
                      {data.map((c, i) => (
                        <td key={c.compound_id} className={clsx('num px-3 py-1.5 font-mono text-[12.5px]', vals && max !== min && vals[i] === max && 'text-accent')}>{r.get(c)}</td>
                      ))}
                    </tr>
                  );
                })}
              </tbody>
            </table>
            <p className="px-3 py-2 text-[11px] text-faint">All values calculated with RDKit; classification and organism are curated demo annotations. Highest numeric value per row is highlighted.</p>
          </div>

          {matrix && matrix.length === data.length && data.length > 1 && (
            <div className="panel max-w-2xl p-3">
              <h2 className="label mb-2">Pairwise Tanimoto similarity (Morgan r=2, 2048 bits)</h2>
              <div className="overflow-x-auto">
                <table className="text-[12.5px]">
                  <thead><tr><th />{data.map((c) => <th key={c.compound_id} className="px-2 py-1 text-left font-normal text-muted">{c.name}</th>)}</tr></thead>
                  <tbody>
                    {data.map((a, i) => (
                      <tr key={a.compound_id}>
                        <th scope="row" className="pr-3 text-left font-normal text-muted">{a.name}</th>
                        {data.map((b, j) => (
                          <td key={b.compound_id} className="num px-2 py-1 text-center font-mono" style={{ background: `rgb(var(--accent) / ${(matrix[i][j] * 0.55).toFixed(2)})` }}>{matrix[i][j].toFixed(2)}</td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}
    </Page>
  );
}
