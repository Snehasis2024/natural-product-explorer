import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import clsx from 'clsx';
import { ArrowLeft, BookOpen, Check, Columns3, ExternalLink, FlaskConical, Leaf, Loader2, Search, XCircle } from 'lucide-react';
import { MAX_COMPARE, useApp, useEngineQuery } from '../lib/app-context';
import type { Compound, Properties, StructureResult } from '../lib/types';
import { MolViewer3D } from '../components/MolViewer3D';
import { PropertyDashboard } from '../components/Properties';
import { CompoundHierarchy } from '../components/Classification';
import { PredictionPanel } from '../components/Prediction';
import { Page } from '../components/Layout';
import {
  CopyButton, EmptyState, ErrorState, Formula, PathwayTag, ProvenanceBadge, SectionTitle, Skeleton, Structure2D, Tabs,
} from '../components/ui';
import { SearchBar } from '../components/SearchBar';

type Tab = 'overview' | 'properties' | 'classification' | 'source' | 'prediction' | 'literature';
const TABS: { id: Tab; label: string }[] = [
  { id: 'overview', label: 'Overview' },
  { id: 'properties', label: 'Properties' },
  { id: 'classification', label: 'Classification' },
  { id: 'source', label: 'Biological Source' },
  { id: 'prediction', label: 'AI Prediction' },
  { id: 'literature', label: 'Literature' },
];

function Field({ label, children, mono, copy, badge }: { label: string; children: ReactNode; mono?: boolean; copy?: string; badge?: ReactNode }) {
  return (
    <div className="space-y-0.5">
      <div className="flex items-center gap-2">
        <span className="label">{label}</span>
        {badge}
        {copy && <span className="ml-auto"><CopyButton text={copy} /></span>}
      </div>
      <div className={clsx('break-all text-ink', mono ? 'font-mono text-[12px] leading-snug' : 'text-[13.5px]')}>{children}</div>
    </div>
  );
}

function IdentityPanel({ c, s }: { c: Compound | null; s: StructureResult | Compound }) {
  const smiles = c?.smiles ?? (s as StructureResult).smiles;
  const ext = c?.external_ids || {};
  const wikidata = `https://www.wikidata.org/w/index.php?search=${encodeURIComponent(`haswbstatement:P235=${s.inchikey}`)}`;
  return (
    <div className="space-y-4">
      <div className="rounded-md border border-line bg-bg/30 p-2"><Structure2D smiles={smiles} width={320} height={240} title={c?.name} /></div>
      <Field label="Name">{c?.name ?? <span className="text-muted">Query structure (not in database)</span>}</Field>
      <Field label="Molecular formula" badge={<ProvenanceBadge kind="calculated" />}><Formula formula={s.formula} className="font-mono" /></Field>
      <Field label="Molecular weight" badge={<ProvenanceBadge kind="calculated" />}><span className="num font-mono">{s.molecular_weight.toFixed(2)}</span> <span className="text-muted">g/mol</span></Field>
      <Field label="SMILES" mono copy={smiles} badge={c ? <ProvenanceBadge kind="curated" /> : undefined}>{smiles}</Field>
      <Field label="Canonical SMILES" mono copy={s.canonical_smiles} badge={<ProvenanceBadge kind="calculated" />}>{s.canonical_smiles}</Field>
      <Field label="InChI" mono copy={s.inchi} badge={<ProvenanceBadge kind="calculated" />}>{s.inchi}</Field>
      <Field label="InChIKey" mono copy={s.inchikey} badge={<ProvenanceBadge kind="calculated" />}>{s.inchikey}</Field>
      <div className="space-y-1.5">
        <div className="flex items-center gap-2"><span className="label">Database IDs</span>{c && <ProvenanceBadge kind="curated" />}</div>
        <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-[12.5px]">
          {c && (<><dt className="text-muted">Internal</dt><dd className="font-mono">{c.compound_id} <span className="text-faint">({c.database})</span></dd></>)}
          <dt className="text-muted">PubChem CID</dt>
          <dd>{ext.pubchem_cid ? <a className="font-mono text-accent hover:underline" href={`https://pubchem.ncbi.nlm.nih.gov/compound/${ext.pubchem_cid}`} target="_blank" rel="noreferrer">{ext.pubchem_cid}</a> : <span className="text-faint">not curated</span>}</dd>
          <dt className="text-muted">ChEBI</dt>
          <dd>{ext.chebi_id ? <a className="font-mono text-accent hover:underline" href={`https://www.ebi.ac.uk/chebi/searchId.do?chebiId=${ext.chebi_id}`} target="_blank" rel="noreferrer">{ext.chebi_id}</a> : <span className="text-faint">not curated</span>}</dd>
          <dt className="text-muted">NPAtlas</dt><dd className="text-faint">{ext.npatlas_id ?? 'not curated'}</dd>
          <dt className="text-muted">COCONUT</dt><dd className="text-faint">{ext.coconut_id ?? 'not curated'}</dd>
        </dl>
        <div className="flex flex-wrap gap-x-3 gap-y-1 pt-1 text-[12px]">
          <a className="inline-flex items-center gap-1 text-accent hover:underline" href={`https://pubchem.ncbi.nlm.nih.gov/#query=${s.inchikey}`} target="_blank" rel="noreferrer">PubChem by InChIKey <ExternalLink className="h-3 w-3" /></a>
          <a className="inline-flex items-center gap-1 text-accent hover:underline" href={wikidata} target="_blank" rel="noreferrer">Wikidata / LOTUS <ExternalLink className="h-3 w-3" /></a>
        </div>
      </div>
    </div>
  );
}

function SourcePanel({ c }: { c: Compound | null }) {
  if (!c) return <EmptyState icon={<Leaf className="h-6 w-6" />} title="No source information" message="This structure is not in the local database, so there is no curated organism. With the API backend you can query LOTUS/NPAtlas from Search with “include external databases”." />;
  const o = c.organism;
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2"><ProvenanceBadge kind="curated" /><ProvenanceBadge kind="demo" /><span className="text-[12px] text-muted">Representative source organism (demo annotation)</span></div>
      {o ? (
        <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-[13px]">
          <dt className="text-muted">Organism</dt><dd className="italic text-ink">{o.name ?? '—'}</dd>
          <dt className="text-muted">Kingdom</dt><dd>{o.kingdom ?? '—'}</dd>
          <dt className="text-muted">Phylum</dt><dd>{o.phylum ?? '—'}</dd>
          <dt className="text-muted">Family</dt><dd>{o.family ?? '—'}</dd>
          <dt className="text-muted">Genus</dt><dd className="italic">{o.genus ?? '—'}</dd>
          <dt className="text-muted">Species</dt><dd className="italic">{o.species ?? '—'}</dd>
          <dt className="text-muted">Source organism</dt><dd className="italic">{o.name ?? 'Not assigned (widespread)'}</dd>
          <dt className="text-muted">Geographic origin</dt><dd>{o.geographic_origin ?? 'Not available'}</dd>
        </dl>
      ) : <p className="text-sm text-muted">No organism recorded.</p>}
      {c.biosynthesis && (
        <section className="space-y-1.5">
          <SectionTitle>Biosynthetic pathway</SectionTitle>
          <p className="text-[13px] leading-relaxed text-ink">{c.biosynthesis}</p>
        </section>
      )}
      <p className="text-[11.5px] text-faint">Geographic origin refers to the native or historic range of the source organism. For verified occurrence records query LOTUS (Wikidata) by InChIKey.</p>
    </div>
  );
}

function LiteraturePanel({ c, inchikey }: { c: Compound | null; inchikey: string }) {
  const refs = c?.literature || [];
  return (
    <div className="space-y-4">
      {refs.length > 0 ? (
        <>
          <div className="flex items-center gap-2"><ProvenanceBadge kind="curated" /><span className="text-[12px] text-muted">Primary reports (verify before citing)</span></div>
          <ol className="space-y-3">
            {refs.map((r, i) => (
              <li key={i} className="rounded-md border border-line p-3 text-[13px]">
                <p className="text-ink">{r.title}</p>
                <p className="mt-1 text-muted">{r.authors} · <i>{r.journal}</i> <b className="num">{r.year}</b>{r.volume ? `, ${r.volume}` : ''}{r.pages ? `, ${r.pages}` : ''}</p>
                {r.doi && <a className="mt-1 inline-flex items-center gap-1 font-mono text-[12px] text-accent hover:underline" href={`https://doi.org/${r.doi}`} target="_blank" rel="noreferrer">doi:{r.doi} <ExternalLink className="h-3 w-3" /></a>}
              </li>
            ))}
          </ol>
        </>
      ) : (
        <EmptyState icon={<BookOpen className="h-6 w-6" />} title="No curated references" message="References are only listed when they were curated for this dataset. Use the links below to find literature linked to this structure." />
      )}
      <div className="flex flex-wrap gap-3 text-[12.5px]">
        <a className="inline-flex items-center gap-1 text-accent hover:underline" href={`https://pubchem.ncbi.nlm.nih.gov/#query=${inchikey}`} target="_blank" rel="noreferrer">PubChem literature <ExternalLink className="h-3 w-3" /></a>
        <a className="inline-flex items-center gap-1 text-accent hover:underline" href={`https://www.wikidata.org/w/index.php?search=${encodeURIComponent(`haswbstatement:P235=${inchikey}`)}`} target="_blank" rel="noreferrer">LOTUS references (Wikidata) <ExternalLink className="h-3 w-3" /></a>
        {c && <a className="inline-flex items-center gap-1 text-accent hover:underline" href={`https://europepmc.org/search?query=${encodeURIComponent(`"${c.name.replace(/\s*\(.*\)$/, '')}"`)}`} target="_blank" rel="noreferrer">Europe PMC <ExternalLink className="h-3 w-3" /></a>}
      </div>
    </div>
  );
}

function Overview({ c, s, props, onTab }: { c: Compound | null; s: StructureResult | Compound; props: Properties; onTab: (t: Tab) => void }) {
  const kv = [
    ['MW', `${props.molecular_weight.toFixed(2)} g/mol`], ['LogP', props.logp.toFixed(2)], ['TPSA', `${props.tpsa.toFixed(1)} Å²`],
    ['HBD / HBA', `${props.hbd} / ${props.hba}`], ['Rot. bonds', String(props.rotatable_bonds)], ['Rings', String(props.rings)],
  ];
  return (
    <div className="space-y-5">
      {c?.description && <p className="text-[13.5px] leading-relaxed text-ink">{c.description}</p>}
      <div className="grid grid-cols-3 gap-2">
        {kv.map(([k, v]) => (
          <div key={k} className="rounded-md border border-line bg-bg/40 px-2.5 py-2">
            <div className="text-[11px] text-muted">{k}</div>
            <div className="num font-mono text-[13.5px] text-ink">{v}</div>
          </div>
        ))}
      </div>
      {c ? (
        <button className="w-full text-left" onClick={() => onTab('classification')}>
          <div className="label mb-1.5">Classification</div>
          <div className="space-y-1 font-mono text-[12.5px]">
            <div className="flex items-center gap-2"><PathwayTag pathway={c.pathway} /></div>
            <div className="pl-4 text-muted">└── <span className="text-ink">{c.superclass}</span></div>
            <div className="pl-10 text-muted">└── <span className="text-ink">{c.class}</span></div>
          </div>
        </button>
      ) : (
        <p className="text-[13px] text-muted">Not in the curated database. See <button className="text-accent hover:underline" onClick={() => onTab('prediction')}>AI Prediction</button> for a predicted classification.</p>
      )}
      {c?.organism?.name && (
        <button className="block text-left text-[13px]" onClick={() => onTab('source')}>
          <span className="label mr-2">Source</span><i className="text-ink">{c.organism.name}</i> <span className="text-muted">({c.organism.family})</span>
        </button>
      )}
      <div className="text-[12px] text-muted">Structure engine: {'engine' in s ? (s as StructureResult).engine : 'RDKit (precomputed)'}</div>
    </div>
  );
}

function Pipeline({ steps }: { steps: { label: string; state: 'done' | 'active' | 'error' | 'idle' }[] }) {
  return (
    <ol className="flex flex-wrap items-center gap-x-1 gap-y-2 text-[12px]" aria-label="Processing pipeline">
      {steps.map((s, i) => (
        <li key={s.label} className="flex items-center gap-1">
          <span className={clsx('inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1',
            s.state === 'done' && 'border-ok/40 text-ok', s.state === 'active' && 'border-accent/60 text-accent',
            s.state === 'error' && 'border-bad/50 text-bad', s.state === 'idle' && 'border-line text-faint')}>
            {s.state === 'done' && <Check className="h-3 w-3" />}{s.state === 'active' && <Loader2 className="h-3 w-3 animate-spin" />}{s.state === 'error' && <XCircle className="h-3 w-3" />}
            {s.label}
          </span>
          {i < steps.length - 1 && <span className="text-faint" aria-hidden>→</span>}
        </li>
      ))}
    </ol>
  );
}

function ExplorerLayout({ c, s, molblock, charges, method, loading3d, headerExtra }: {
  c: Compound | null; s: StructureResult | Compound; molblock: string | null; charges: number[] | null; method?: string; loading3d?: boolean; headerExtra?: ReactNode;
}) {
  const [tab, setTab] = useState<Tab>('overview');
  const { compare, toggleCompare } = useApp();
  const nav = useNavigate();
  const props: Properties = 'properties' in s ? (s as Compound).properties : (s as StructureResult);
  const smiles = c?.smiles ?? (s as StructureResult).smiles;
  const inCompare = c ? compare.includes(c.compound_id) : false;
  useEffect(() => setTab('overview'), [c?.compound_id, smiles]);

  return (
    <Page className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <button className="btn-icon h-8 w-8" onClick={() => nav(-1)} aria-label="Back"><ArrowLeft className="h-4 w-4" /></button>
        <h1 className="text-xl font-semibold tracking-tight text-ink sm:text-2xl">{c?.name ?? 'Structure analysis'}</h1>
        {c && <PathwayTag pathway={c.pathway} />}
        {c?.is_demo && <ProvenanceBadge kind="demo" />}
        <div className="ml-auto flex flex-wrap gap-2">
          <Link to={`/search?mode=similarity&smiles=${encodeURIComponent(s.canonical_smiles)}`} className="btn"><Search className="h-4 w-4" /> Similar</Link>
          {c && (
            <button className={clsx('btn', inCompare && 'border-accent text-accent')} onClick={() => toggleCompare(c.compound_id)} disabled={!inCompare && compare.length >= MAX_COMPARE}>
              <Columns3 className="h-4 w-4" /> {inCompare ? 'In comparison' : 'Compare'}
            </button>
          )}
        </div>
      </div>
      {headerExtra}
      <div className="grid gap-4 lg:grid-cols-[minmax(0,300px)_minmax(0,1fr)] xl:grid-cols-[minmax(0,300px)_minmax(0,1fr)_minmax(0,430px)]">
        <aside className="panel order-2 p-4 lg:order-1" aria-label="Compound information"><IdentityPanel c={c} s={s} /></aside>
        <section className="order-1 lg:order-2" aria-label="3D structure">
          <div className="relative">
            <MolViewer3D molblock={molblock} partialCharges={charges} method={method} title={c?.name ?? 'query'} fileName={c?.compound_id ?? s.inchikey}
              className="h-[380px] sm:h-[520px] xl:h-[calc(100vh-11rem)] xl:min-h-[560px]" />
            {loading3d && <div className="absolute inset-0 grid place-items-center rounded-panel bg-bg/60"><span className="flex items-center gap-2 text-sm text-muted"><Loader2 className="h-4 w-4 animate-spin text-accent" /> Generating 3D conformer…</span></div>}
          </div>
        </section>
        <section className="panel order-3 min-w-0 p-4 lg:col-span-2 xl:col-span-1" aria-label="Details">
          <Tabs tabs={TABS} value={tab} onChange={setTab} className="-mx-1 mb-4" />
          <div role="tabpanel" aria-labelledby={`tab-${tab}`}>
            {tab === 'overview' && <Overview c={c} s={s} props={props} onTab={setTab} />}
            {tab === 'properties' && <PropertyDashboard p={props} formula={s.formula} />}
            {tab === 'classification' && (c
              ? <CompoundHierarchy pathway={c.pathway} superclass={c.superclass} cls={c.class} />
              : <EmptyState title="No curated classification" message="This structure is not in the database. The AI Prediction tab estimates its pathway, superclass and class." action={<button className="btn mt-2" onClick={() => setTab('prediction')}>Open AI Prediction</button>} />)}
            {tab === 'source' && <SourcePanel c={c} />}
            {tab === 'prediction' && <PredictionPanel smiles={smiles} truth={c ? { pathway: c.pathway, superclass: c.superclass, class: c.class } : undefined} />}
            {tab === 'literature' && <LiteraturePanel c={c} inchikey={s.inchikey} />}
          </div>
        </section>
      </div>
    </Page>
  );
}

export function CompoundPage() {
  const { id = '' } = useParams();
  const { data: c, loading, error } = useEngineQuery((e) => e.compound(id), [id]);
  const conf = useEngineQuery(c ? (e) => e.conformer(c.compound_id) : null, [c?.compound_id]);
  if (loading) return <Page><div className="grid gap-4 xl:grid-cols-[300px_1fr_430px]"><Skeleton className="h-[560px]" /><Skeleton className="h-[560px]" /><Skeleton className="h-[560px]" /></div></Page>;
  if (error || !c) return <Page><ErrorState title="Compound not found" message={error || `No compound with ID “${id}”.`} action={<Link to="/search" className="btn mt-2">Search the database</Link>} /></Page>;
  return <ExplorerLayout c={c} s={c} molblock={conf.data?.molblock ?? null} charges={conf.data?.partial_charges ?? null} method={conf.data?.method} loading3d={conf.loading} />;
}

export function AnalyzePage() {
  const [params] = useSearchParams();
  const smiles = (params.get('smiles') || '').trim();
  const { engine } = useApp();
  const [state, setState] = useState<{ s: StructureResult | null; known: Compound | null; error: string | null; stage: number }>({ s: null, known: null, error: null, stage: 0 });

  useEffect(() => {
    if (!engine || !smiles) return;
    let alive = true;
    setState({ s: null, known: null, error: null, stage: 1 });
    (async () => {
      try {
        const s = await engine.structure(smiles);
        if (!alive) return;
        let known: Compound | null = null;
        try {
          const r = await engine.search({ q: smiles, page_size: 1 });
          const hit = r.results.find((x) => x.match_type === 'exact');
          if (hit) known = await engine.compound(hit.compound_id);
        } catch { /* lookup is optional */ }
        if (alive) setState({ s, known, error: null, stage: 4 });
      } catch (e: any) {
        if (alive) setState({ s: null, known: null, error: e?.message || String(e), stage: -1 });
      }
    })();
    return () => { alive = false; };
  }, [engine, smiles]);

  const steps = useMemo(() => {
    const labels = ['SMILES', 'Validate', 'Parse', '2D structure', '3D conformer', 'Properties', 'Classification', 'AI prediction'];
    return labels.map((label, i) => {
      if (state.stage === -1) return { label, state: (i <= 1 ? (i === 0 ? 'done' : 'error') : 'idle') as any };
      if (state.stage === 4) return { label, state: 'done' as const };
      return { label, state: (i === 0 ? 'done' : i === 1 || i === 2 || i === 4 ? 'active' : 'idle') as any };
    });
  }, [state.stage]);

  if (!smiles) {
    return (
      <Page className="max-w-3xl space-y-4">
        <h1 className="text-2xl font-semibold text-ink">Analyse a structure</h1>
        <p className="text-muted">Paste a SMILES string to generate the 2D depiction, a 3D conformer, calculated properties and a predicted classification.</p>
        <SearchBar size="lg" autoFocus />
      </Page>
    );
  }
  if (state.error) {
    return (
      <Page className="max-w-3xl space-y-4">
        <Pipeline steps={steps} />
        <ErrorState title="Invalid SMILES" message={state.error} action={<p className="pt-1 text-[12px] text-muted">Check ring-closure digits, parentheses, aromatic atoms (lower-case) and valences. Input: <code className="break-all font-mono text-ink">{smiles}</code></p>} />
        <SearchBar initial={smiles} />
      </Page>
    );
  }
  if (!state.s) {
    return (
      <Page className="space-y-4">
        <Pipeline steps={steps} />
        <div className="grid gap-4 xl:grid-cols-[300px_1fr_430px]"><Skeleton className="h-[520px]" /><div className="grid h-[520px] place-items-center rounded-panel border border-line"><span className="flex items-center gap-2 text-sm text-muted"><FlaskConical className="h-4 w-4 text-accent" /> Parsing structure and generating 3D conformer…</span></div><Skeleton className="h-[520px]" /></div>
      </Page>
    );
  }
  const banner = (
    <div className="space-y-2">
      <Pipeline steps={steps} />
      {state.known && (
        <div className="flex flex-wrap items-center gap-2 rounded-md border border-accent/40 bg-accent/10 px-3 py-2 text-[13px]">
          <Check className="h-4 w-4 text-accent" /> Exact match in the database: <b className="text-ink">{state.known.name}</b>
          <Link to={`/compound/${state.known.compound_id}`} className="ml-auto text-accent hover:underline">Open curated record →</Link>
        </div>
      )}
    </div>
  );
  return <ExplorerLayout c={null} s={state.s} molblock={state.s.molblock} charges={state.s.conformer?.partial_charges ?? null} method={state.s.conformer?.method} headerExtra={banner} />;
}
