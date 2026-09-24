import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ArrowRight, Atom, Boxes, BrainCircuit, ClipboardPaste, GitCompareArrows, Network, ScatterChart } from 'lucide-react';
import { useEngineQuery } from '../lib/app-context';
import { pathwayColor } from '../lib/format';
import { MolViewer3D } from '../components/MolViewer3D';
import { SearchBar } from '../components/SearchBar';
import { Formula, PathwayTag, Skeleton, Structure2D } from '../components/ui';

const HERO_IDS = ['artemisinin', 'paclitaxel', 'penicillin_g', 'quercetin', 'strychnine'];
const FEATURED = ['caffeine', 'curcumin', 'quercetin', 'resveratrol', 'paclitaxel', 'artemisinin', 'penicillin_g', 'vancomycin'];

function HeroMolecule() {
  const [i, setI] = useState(0);
  const id = HERO_IDS[i];
  const comp = useEngineQuery((e) => e.compound(id), [id]);
  const conf = useEngineQuery((e) => e.conformer(id), [id]);
  return (
    <div className="relative h-[340px] sm:h-[420px]">
      <MolViewer3D molblock={conf.data?.molblock ?? null} partialCharges={conf.data?.partial_charges} title={comp.data?.name} fileName={id} compact spin className="h-full border-line/60" initialRepresentation="ballstick" />
      <div className="pointer-events-none absolute inset-x-0 bottom-0 flex items-end justify-between gap-3 p-3">
        {comp.data && (
          <Link to={`/compound/${id}`} className="glass pointer-events-auto rounded-md border border-line px-3 py-2 text-[12.5px] hover:border-accent/60">
            <div className="font-medium text-ink">{comp.data.name}</div>
            <div className="text-muted"><Formula formula={comp.data.formula} className="font-mono" /> · {comp.data.class}</div>
          </Link>
        )}
        <div className="pointer-events-auto flex gap-1.5" role="group" aria-label="Choose hero molecule">
          {HERO_IDS.map((h, k) => (
            <button key={h} onClick={() => setI(k)} aria-label={`Show ${h.replace('_', ' ')}`} aria-pressed={k === i}
              className={`h-2 w-6 rounded-full transition-colors ${k === i ? 'bg-accent' : 'bg-line hover:bg-muted'}`} />
          ))}
        </div>
      </div>
    </div>
  );
}

const FEATURES = [
  { icon: Atom, title: '3D molecular viewer', text: 'Rotate, zoom and inspect atoms. Switch representations, surfaces, charges and labels.', to: '/compound/artemisinin' },
  { icon: Boxes, title: 'Structure search', text: 'Exact, substructure (SMARTS) and Tanimoto similarity search on Morgan fingerprints.', to: '/search?mode=similarity' },
  { icon: Network, title: 'NP classification', text: 'Pathway › superclass › class hierarchy with representative structures and sources.', to: '/explore?view=classification' },
  { icon: BrainCircuit, title: 'AI classification', text: 'Pathway, superclass and class probabilities with explanations. NPC-BERT ready.', to: '/predict' },
  { icon: GitCompareArrows, title: 'Compare compounds', text: 'Side-by-side properties and synchronised 3D viewers for 2–4 molecules.', to: '/compare?ids=quercetin,kaempferol,genistein' },
  { icon: ScatterChart, title: 'Chemical space', text: 'PCA and t-SNE projections of fingerprint space, coloured by biosynthetic origin.', to: '/explore' },
];

export function HomePage() {
  const nav = useNavigate();
  const stats = useEngineQuery((e) => e.statistics(), []);
  const featured = useEngineQuery((e) => Promise.all(FEATURED.map((id) => e.compound(id))), []);
  return (
    <div>
      <section className="relative overflow-hidden border-b border-line">
        <div aria-hidden className="pointer-events-none absolute inset-0 opacity-[0.35]" style={{ backgroundImage: 'radial-gradient(rgb(var(--line)) 1px, transparent 1px)', backgroundSize: '22px 22px', maskImage: 'linear-gradient(to bottom, black, transparent 85%)' }} />
        <div className="relative mx-auto grid max-w-[1500px] items-center gap-8 px-4 py-10 lg:grid-cols-[minmax(0,1.05fr)_minmax(0,1fr)] lg:py-14">
          <div className="space-y-6">
            <p className="label text-accent">Natural product cheminformatics</p>
            <h1 className="text-4xl font-semibold leading-[1.08] tracking-tight text-ink sm:text-5xl">Explore the Chemical Diversity of Nature</h1>
            <p className="max-w-xl text-[16px] leading-relaxed text-muted">Interactive 3D visualization, molecular analysis, natural-product classification, and AI-powered discovery.</p>
            <SearchBar size="lg" />
            <div className="flex flex-wrap gap-3">
              <Link to="/search" className="btn-primary px-4 py-2">Explore Natural Products <ArrowRight className="h-4 w-4" /></Link>
              <button className="btn px-4 py-2" onClick={() => nav('/analyze')}><ClipboardPaste className="h-4 w-4" /> Paste SMILES</button>
            </div>
          </div>
          <HeroMolecule />
        </div>
      </section>

      <section className="mx-auto max-w-[1500px] space-y-10 px-4 py-10">
        <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)]">
          <div className="space-y-2">
            <h2 className="text-lg font-semibold text-ink">Dataset at a glance</h2>
            <p className="text-[13px] leading-relaxed text-muted">
              A curated demonstration set of well-known natural products (caffeine to vancomycin). Structures are checked against their standard InChIKeys; every property is calculated with RDKit.
            </p>
          </div>
          {stats.data ? (
            <div className="space-y-2">
              <div className="flex h-3 overflow-hidden rounded-full" role="img" aria-label="Pathway distribution">
                {stats.data.pathway_distribution.map((p) => <div key={p.label} style={{ width: `${(p.count / stats.data!.total_compounds) * 100}%`, background: pathwayColor(p.label) }} title={`${p.label}: ${p.count}`} />)}
              </div>
              <div className="flex flex-wrap gap-x-4 gap-y-1 text-[12.5px]">
                <span className="text-ink"><b className="num">{stats.data.total_compounds}</b> compounds</span>
                {stats.data.pathway_distribution.map((p) => (
                  <Link key={p.label} to={`/search?pathway=${encodeURIComponent(p.label)}`} className="inline-flex items-center gap-1.5 text-muted hover:text-ink">
                    <span className="h-2 w-2 rounded-full" style={{ background: pathwayColor(p.label) }} />{p.label} <span className="num text-faint">{p.count}</span>
                  </Link>
                ))}
              </div>
            </div>
          ) : <Skeleton className="h-12" />}
        </div>

        <div>
          <div className="mb-3 flex items-baseline justify-between"><h2 className="text-lg font-semibold text-ink">Landmark natural products</h2><Link to="/search" className="text-[13px] text-accent hover:underline">Browse all →</Link></div>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            {(featured.data ?? []).map((c) => (
              <Link key={c.compound_id} to={`/compound/${c.compound_id}`} className="panel group flex flex-col gap-1.5 p-2.5 hover:border-accent/50">
                <Structure2D smiles={c.canonical_smiles} width={240} height={150} title={c.name} />
                <div className="flex items-baseline justify-between gap-2 px-1">
                  <span className="truncate font-medium text-ink group-hover:text-accent">{c.name}</span>
                  <span className="num shrink-0 font-mono text-[11.5px] text-muted">{c.molecular_weight.toFixed(1)}</span>
                </div>
                <div className="px-1"><PathwayTag pathway={c.pathway} /></div>
              </Link>
            ))}
            {featured.loading && FEATURED.map((f) => <Skeleton key={f} className="h-52" />)}
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map((f) => (
            <Link key={f.title} to={f.to} className="panel group flex gap-3 p-4 hover:border-accent/50">
              <f.icon className="mt-0.5 h-5 w-5 shrink-0 text-accent" aria-hidden />
              <div>
                <h3 className="font-medium text-ink group-hover:text-accent">{f.title}</h3>
                <p className="mt-1 text-[13px] leading-relaxed text-muted">{f.text}</p>
              </div>
            </Link>
          ))}
        </div>
      </section>
    </div>
  );
}
