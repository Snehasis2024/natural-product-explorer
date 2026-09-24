import { useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  Bar, BarChart, CartesianGrid, Cell, LabelList, ResponsiveContainer, Scatter, ScatterChart, Tooltip, XAxis, YAxis, ZAxis,
} from 'recharts';
import { useEngineQuery } from '../lib/app-context';
import { CATEGORICAL, OTHER_COLOR, pathwayColor } from '../lib/format';
import type { HistBin, Statistics } from '../lib/types';
import { Page } from '../components/Layout';
import { OntologyBrowser } from '../components/Classification';
import { ErrorState, Skeleton, Structure2D, Tabs } from '../components/ui';

const AXIS = { stroke: 'rgb(var(--line))', tick: { fill: 'rgb(var(--muted))', fontSize: 11 }, tickLine: false };
const GRID = <CartesianGrid stroke="rgb(var(--line))" strokeOpacity={0.5} vertical={false} />;

function ChartCard({ title, subtitle, children, className }: { title: string; subtitle?: string; children: React.ReactNode; className?: string }) {
  return (
    <section className={`panel p-4 ${className ?? ''}`}>
      <h2 className="text-[14px] font-semibold text-ink">{title}</h2>
      {subtitle && <p className="mb-2 text-[12px] text-muted">{subtitle}</p>}
      {children}
    </section>
  );
}

function TooltipBox({ children }: { children: React.ReactNode }) {
  return <div className="rounded-md border border-line bg-surface px-3 py-2 text-[12px] text-ink shadow-xl">{children}</div>;
}

function CountBars({ data, colorFor, height }: { data: { label: string; count: number; pathway?: string }[]; colorFor: (d: any) => string; height: number }) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data} layout="vertical" margin={{ left: 8, right: 36, top: 4, bottom: 4 }} barCategoryGap={4}>
        <XAxis type="number" allowDecimals={false} {...AXIS} />
        <YAxis type="category" dataKey="label" width={190} {...AXIS} axisLine={false} interval={0} />
        <Tooltip cursor={{ fill: 'rgb(var(--raised))' }} content={({ active, payload }) => active && payload?.length ? (
          <TooltipBox><b>{payload[0].payload.label}</b><div className="num text-muted">{payload[0].payload.count} compounds{payload[0].payload.pathway ? ` · ${payload[0].payload.pathway}` : ''}</div></TooltipBox>
        ) : null} />
        <Bar dataKey="count" radius={[0, 4, 4, 0]} isAnimationActive={false}>
          {data.map((d) => <Cell key={d.label} fill={colorFor(d)} />)}
          <LabelList dataKey="count" position="right" fill="rgb(var(--muted))" fontSize={11} />
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

function Histogram({ bins, unit }: { bins: HistBin[]; unit?: string }) {
  const data = bins.map((b) => ({ ...b, mid: `${b.bin_start.toFixed(0)} to ${b.bin_end.toFixed(0)}` }));
  return (
    <ResponsiveContainer width="100%" height={200}>
      <BarChart data={data} margin={{ left: -16, right: 8, top: 8, bottom: 0 }} barCategoryGap={2}>
        {GRID}
        <XAxis dataKey="mid" {...AXIS} interval="preserveStartEnd" />
        <YAxis allowDecimals={false} {...AXIS} axisLine={false} />
        <Tooltip cursor={{ fill: 'rgb(var(--raised))' }} content={({ active, payload }) => active && payload?.length ? (
          <TooltipBox><div className="num">{payload[0].payload.bin_start} – {payload[0].payload.bin_end}{unit ? ` ${unit}` : ''}</div><b className="num">{payload[0].payload.count} compounds</b></TooltipBox>
        ) : null} />
        <Bar dataKey="count" fill="rgb(var(--accent))" radius={[4, 4, 0, 0]} isAnimationActive={false} />
      </BarChart>
    </ResponsiveContainer>
  );
}

type ColorBy = 'pathway' | 'superclass' | 'class';

function ChemicalSpace({ stats }: { stats: Statistics }) {
  const nav = useNavigate();
  const [method, setMethod] = useState<'pca' | 'tsne'>('pca');
  const [colorBy, setColorBy] = useState<ColorBy>('pathway');
  const cs = stats.chemical_space;
  const { groups, legend } = useMemo(() => {
    const counts = new Map<string, number>();
    cs.points.forEach((p) => counts.set(p[colorBy], (counts.get(p[colorBy]) || 0) + 1));
    const order = colorBy === 'pathway'
      ? stats.pathway_distribution.map((d) => d.label)
      : [...counts.entries()].sort((a, b) => b[1] - a[1]).map(([k]) => k);
    const top = order.slice(0, 7);
    const colorOf = (label: string) => (colorBy === 'pathway' ? pathwayColor(label) : top.includes(label) ? CATEGORICAL[top.indexOf(label)] : OTHER_COLOR);
    const key = (label: string) => (top.includes(label) ? label : 'Other');
    const g = new Map<string, any[]>();
    cs.points.forEach((p) => {
      const coords = method === 'tsne' && p.tsne ? p.tsne : p.pca;
      const k = key(p[colorBy]);
      if (!g.has(k)) g.set(k, []);
      g.get(k)!.push({ ...p, x: coords[0], y: coords[1] });
    });
    const legendItems = [...top.filter((t) => g.has(t)), ...(g.has('Other') ? ['Other'] : [])].map((l) => ({ label: l, color: l === 'Other' ? OTHER_COLOR : colorOf(l), n: g.get(l)!.length }));
    return { groups: g, legend: legendItems };
  }, [cs, method, colorBy, stats.pathway_distribution]);

  return (
    <ChartCard title="Chemical space" subtitle={`${cs.fingerprint} fingerprints projected to 2D. ${method === 'pca' ? `PCA: PC1 ${(cs.pca_explained_variance[0] * 100).toFixed(1)}%, PC2 ${(cs.pca_explained_variance[1] * 100).toFixed(1)}% of variance.` : 't-SNE (Jaccard metric): distances are only meaningful locally.'} Click a point to open the compound.`}>
      <div className="mb-3 flex flex-wrap items-center gap-3 text-[12.5px]">
        <div className="flex gap-1" role="group" aria-label="Projection">
          {cs.methods.map((m) => <button key={m} className={`btn px-2 py-1 text-[12px] ${method === m ? 'border-accent text-accent' : ''}`} aria-pressed={method === m} onClick={() => setMethod(m as any)}>{m === 'pca' ? 'PCA' : 't-SNE'}</button>)}
          <span className="self-center pl-1 text-[11px] text-faint" title="UMAP is not computed for this dataset">UMAP: not computed</span>
        </div>
        <label className="flex items-center gap-2 whitespace-nowrap text-muted" htmlFor="color-by">Colour by
          <select id="color-by" className="input w-auto py-1 text-[12.5px]" value={colorBy} onChange={(e) => setColorBy(e.target.value as ColorBy)}>
            <option value="pathway">Pathway</option><option value="superclass">Superclass (top 7)</option><option value="class">Class (top 7)</option>
          </select>
        </label>
      </div>
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_220px]">
        <div className="h-[440px]">
          <ResponsiveContainer width="100%" height="100%">
            <ScatterChart margin={{ left: -12, right: 12, top: 8, bottom: 8 }}>
              <CartesianGrid stroke="rgb(var(--line))" strokeOpacity={0.4} />
              <XAxis type="number" dataKey="x" name={method === 'pca' ? 'PC1' : 't-SNE 1'} {...AXIS} tickFormatter={(v) => v.toFixed(1)} />
              <YAxis type="number" dataKey="y" name={method === 'pca' ? 'PC2' : 't-SNE 2'} {...AXIS} tickFormatter={(v) => v.toFixed(1)} />
              <ZAxis range={[70, 70]} />
              <Tooltip cursor={{ strokeDasharray: '3 3', stroke: 'rgb(var(--muted))' }} content={({ active, payload }) => active && payload?.length ? (() => {
                const p = payload[0].payload;
                return (
                  <TooltipBox>
                    <div className="w-52 space-y-1">
                      <b>{p.name}</b>
                      <div className="rounded bg-bg/40"><Structure2D smiles={p.smiles} width={200} height={130} /></div>
                      <div className="text-muted">{p.pathway}<br />{p.superclass} › {p.class}</div>
                    </div>
                  </TooltipBox>
                );
              })() : null} />
              {[...groups.entries()].map(([label, pts]) => (
                <Scatter key={label} name={label} data={pts} fill={legend.find((l) => l.label === label)?.color} stroke="rgb(var(--surface))" strokeWidth={2}
                  isAnimationActive={false} onClick={(d: any) => nav(`/compound/${d.compound_id ?? d.payload?.compound_id}`)} style={{ cursor: 'pointer' }} />
              ))}
            </ScatterChart>
          </ResponsiveContainer>
        </div>
        <ul className="space-y-1 text-[12.5px]" aria-label="Legend">
          {legend.map((l) => (
            <li key={l.label} className="flex items-center gap-2">
              <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: l.color }} aria-hidden />
              <span className="text-ink">{l.label}</span><span className="num ml-auto text-faint">{l.n}</span>
            </li>
          ))}
        </ul>
      </div>
    </ChartCard>
  );
}

function Landscape() {
  const { data: stats, loading, error } = useEngineQuery((e) => e.statistics(), []);
  const { data: ont } = useEngineQuery((e) => e.ontology(), []);
  const parent = useMemo(() => {
    const m = new Map<string, string>();
    ont?.pathways.forEach((p) => p.children.forEach((s) => { m.set(`s:${s.name}`, p.name); s.children.forEach((c) => m.set(`c:${c.name}`, p.name)); }));
    return m;
  }, [ont]);
  if (loading) return <div className="grid gap-4 lg:grid-cols-2"><Skeleton className="h-72" /><Skeleton className="h-72" /><Skeleton className="h-96 lg:col-span-2" /></div>;
  if (error || !stats) return <ErrorState message={error || 'Statistics unavailable'} />;
  const sc = stats.superclass_distribution.map((d) => ({ ...d, pathway: parent.get(`s:${d.label}`) }));
  const cl = stats.class_distribution.slice(0, 18).map((d) => ({ ...d, pathway: parent.get(`c:${d.label}`) }));
  return (
    <div className="space-y-4">
      <div className="grid gap-4 lg:grid-cols-2">
        <ChartCard title="Pathway distribution" subtitle={`${stats.total_compounds} compounds by biosynthetic pathway`}>
          <CountBars data={stats.pathway_distribution} colorFor={(d) => pathwayColor(d.label)} height={Math.max(160, stats.pathway_distribution.length * 34)} />
        </ChartCard>
        <ChartCard title="Kingdom of source organism" subtitle="Curated representative source organisms">
          <CountBars data={stats.kingdom_distribution} colorFor={() => 'rgb(var(--accent))'} height={Math.max(140, stats.kingdom_distribution.length * 34)} />
        </ChartCard>
        <ChartCard title="Superclass distribution" subtitle="Bar colour shows the parent pathway">
          <CountBars data={sc} colorFor={(d) => (d.pathway ? pathwayColor(d.pathway) : OTHER_COLOR)} height={sc.length * 26 + 30} />
        </ChartCard>
        <ChartCard title="Class distribution" subtitle={`Top ${cl.length} of ${stats.class_distribution.length} classes; colour shows the parent pathway`}>
          <CountBars data={cl} colorFor={(d) => (d.pathway ? pathwayColor(d.pathway) : OTHER_COLOR)} height={cl.length * 26 + 30} />
        </ChartCard>
      </div>
      <div className="grid gap-4 md:grid-cols-3">
        <ChartCard title="Molecular weight" subtitle="g/mol"><Histogram bins={stats.molecular_weight_histogram} unit="g/mol" /></ChartCard>
        <ChartCard title="LogP" subtitle="Wildman–Crippen"><Histogram bins={stats.logp_histogram} /></ChartCard>
        <ChartCard title="TPSA" subtitle="Å²"><Histogram bins={stats.tpsa_histogram} unit="Å²" /></ChartCard>
      </div>
      <ChemicalSpace stats={stats} />
      <p className="text-[11.5px] text-faint">All distributions are calculated from the demo dataset; classification counts reflect curated demo annotations.</p>
    </div>
  );
}

export function ExplorePage() {
  const [sp, setSp] = useSearchParams();
  const view = (sp.get('view') as 'landscape' | 'classification') || 'landscape';
  return (
    <Page className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-ink">Natural Product Landscape</h1>
        <p className="text-[13px] text-muted">Distributions, chemical space and the classification hierarchy of the dataset.</p>
      </div>
      <Tabs tabs={[{ id: 'landscape', label: 'Landscape & chemical space' }, { id: 'classification', label: 'Classification hierarchy' }]} value={view} onChange={(v) => setSp(v === 'landscape' ? {} : { view: v })} />
      {view === 'landscape' ? <Landscape /> : <OntologyBrowser />}
    </Page>
  );
}
