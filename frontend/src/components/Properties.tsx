import clsx from 'clsx';
import { Check, X } from 'lucide-react';
import type { Properties } from '../lib/types';
import { fmt } from '../lib/format';
import { Formula, ProvenanceBadge, SectionTitle } from './ui';

interface Card { label: string; value: string; unit?: string; hint?: string }

function cards(p: Properties): Card[] {
  return [
    { label: 'Molecular weight', value: fmt(p.molecular_weight, 2), unit: 'g/mol', hint: 'Average molecular mass (RDKit MolWt)' },
    { label: 'Exact mass', value: fmt(p.exact_mass, 4), unit: 'Da', hint: 'Monoisotopic mass' },
    { label: 'LogP', value: fmt(p.logp, 2), hint: 'Wildman–Crippen cLogP' },
    { label: 'TPSA', value: fmt(p.tpsa, 1), unit: 'Å²', hint: 'Topological polar surface area (Ertl)' },
    { label: 'H-bond donors', value: String(p.hbd), hint: 'Lipinski-style count (RDKit NumHBD)' },
    { label: 'H-bond acceptors', value: String(p.hba), hint: 'RDKit NumHBA' },
    { label: 'Rotatable bonds', value: String(p.rotatable_bonds) },
    { label: 'Rings', value: String(p.rings) },
    { label: 'Aromatic rings', value: String(p.aromatic_rings) },
    { label: 'Formal charge', value: p.formal_charge > 0 ? `+${p.formal_charge}` : String(p.formal_charge) },
    { label: 'Stereocentres', value: String(p.stereocenters), hint: p.stereocenters_unassigned ? `${p.stereocenters_unassigned} unassigned in the input structure` : 'All assigned' },
    { label: 'Fsp³', value: fmt(p.fsp3, 2), hint: 'Fraction of sp³ carbons; natural products are typically high' },
  ];
}

export function PropertyGrid({ p, columns = 3 }: { p: Properties; columns?: 2 | 3 | 4 }) {
  return (
    <div className={clsx('grid gap-2', columns === 2 ? 'grid-cols-2' : columns === 4 ? 'grid-cols-2 sm:grid-cols-4' : 'grid-cols-2 sm:grid-cols-3')}>
      {cards(p).map((c) => (
        <div key={c.label} className="rounded-md border border-line bg-bg/40 p-2.5" title={c.hint}>
          <div className="text-[11px] text-muted">{c.label}</div>
          <div className="mt-0.5 flex items-baseline gap-1">
            <span className="num font-mono text-[17px] text-ink">{c.value}</span>
            {c.unit && <span className="text-[11px] text-faint">{c.unit}</span>}
          </div>
        </div>
      ))}
    </div>
  );
}

function RuleRow({ rule, value, pass }: { rule: string; value: number; pass: boolean }) {
  return (
    <li className="flex items-center gap-2 text-[13px]">
      <span className={clsx('grid h-5 w-5 place-items-center rounded-full', pass ? 'bg-ok/15 text-ok' : 'bg-bad/15 text-bad')} aria-label={pass ? 'pass' : 'fail'}>
        {pass ? <Check className="h-3 w-3" /> : <X className="h-3 w-3" />}
      </span>
      <span className="text-ink">{rule}</span>
      <span className="num ml-auto font-mono text-[12px] text-muted">{Number.isInteger(value) ? value : value.toFixed(2)}</span>
    </li>
  );
}

function Gauge({ label, value, min, max, fmtd, low, high, hint }: { label: string; value: number | null; min: number; max: number; fmtd?: string; low: string; high: string; hint: string }) {
  const pos = value === null ? 0 : Math.min(1, Math.max(0, (value - min) / (max - min)));
  return (
    <div className="space-y-1.5" title={hint}>
      <div className="flex items-baseline justify-between text-[13px]">
        <span className="text-ink">{label}</span>
        <span className="num font-mono text-[12.5px] text-muted">{value === null ? 'API only' : fmtd ?? value.toFixed(2)}</span>
      </div>
      <div className="relative h-1.5 rounded-full bg-gradient-to-r from-line via-accent/40 to-accent">
        {value !== null && <span className="absolute top-1/2 h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-bg bg-ink" style={{ left: `${pos * 100}%` }} />}
      </div>
      <div className="flex justify-between text-[10.5px] text-faint"><span>{low}</span><span>{high}</span></div>
    </div>
  );
}

export function PropertyDashboard({ p, formula }: { p: Properties; formula?: string }) {
  const missing = p.qed === null;
  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-2">
        <ProvenanceBadge kind="calculated" />
        <span className="text-[12px] text-muted">All values computed from the structure with RDKit. This dataset holds no experimental measurements.</span>
      </div>
      {formula && (
        <div className="text-sm text-muted">Molecular formula <Formula formula={formula} className="ml-2 font-mono text-ink" /></div>
      )}
      <PropertyGrid p={p} />

      <section className="space-y-2">
        <SectionTitle right={<span className={clsx('chip', p.lipinski.pass ? 'border-ok/50 text-ok' : 'border-bad/50 text-bad')}>{p.lipinski.violations} violation{p.lipinski.violations === 1 ? '' : 's'} · {p.lipinski.pass ? 'passes' : 'fails'}</span>}>
          Lipinski rule of five
        </SectionTitle>
        <ul className="space-y-1.5">{p.lipinski.rules.map((r) => <RuleRow key={r.rule} {...r} />)}</ul>
        <p className="text-[11px] text-faint">Passes with at most one violation. Many natural-product drugs (e.g. taxol, vancomycin) lie outside Ro5 and are active transporter substrates.</p>
      </section>

      <section className="space-y-2">
        <SectionTitle right={<span className={clsx('chip', p.veber.pass ? 'border-ok/50 text-ok' : 'border-bad/50 text-bad')}>{p.veber.pass ? 'passes' : 'fails'}</span>}>Veber oral bioavailability</SectionTitle>
        <ul className="space-y-1.5">{p.veber.rules.map((r) => <RuleRow key={r.rule} {...r} />)}</ul>
      </section>

      <section className="space-y-3">
        <SectionTitle>Drug-likeness &amp; complexity</SectionTitle>
        <Gauge label="QED drug-likeness" value={p.qed} min={0} max={1} low="0 unfavourable" high="1 favourable" hint="Quantitative Estimate of Drug-likeness (Bickerton et al. 2012)" />
        <Gauge label="Synthetic accessibility" value={p.sa_score} min={1} max={10} low="1 easy" high="10 hard" hint="SA score (Ertl & Schuffenhauer 2009)" />
        <Gauge label="NP-likeness" value={p.np_likeness} min={-5} max={5} low="−5 synthetic-like" high="+5 natural-product-like" hint="Natural-product likeness score (Ertl et al. 2008)" />
        <div className="flex items-baseline justify-between text-[13px]" title="Bertz CT topological complexity index">
          <span className="text-ink">Bertz complexity (CT)</span>
          <span className="num font-mono text-[12.5px] text-muted">{p.complexity_bertz === null ? 'API only' : p.complexity_bertz.toFixed(1)}</span>
        </div>
        {missing && <p className="text-[11px] text-faint">QED, SA score, NP-likeness and Bertz complexity use RDKit Python modules. They are shown for database compounds and computed live when the API backend is connected.</p>}
      </section>
    </div>
  );
}
