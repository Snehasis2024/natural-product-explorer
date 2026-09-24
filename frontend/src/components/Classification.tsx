import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import clsx from 'clsx';
import { ChevronRight, CornerDownRight } from 'lucide-react';
import { useEngineQuery } from '../lib/app-context';
import { labelColor, pathwayColor } from '../lib/format';
import type { Ontology, OntologyClass, OntologyPathway, OntologySuperclass } from '../lib/types';
import { ErrorState, PathwayDot, ProvenanceBadge, Skeleton, Structure2D } from './ui';

type Node = OntologyPathway | OntologySuperclass | OntologyClass;

export function findPath(ont: Ontology, pathway: string, superclass?: string, cls?: string) {
  const pw = ont.pathways.find((p) => p.name === pathway);
  const sc = pw?.children.find((s) => s.name === superclass);
  const c = sc?.children.find((x) => x.name === cls);
  return { pw, sc, c };
}

/** Detail card for any hierarchy node: counts, description, representatives, organisms, pathways. */
export function NodeDetail({ node, pathway }: { node: Node; pathway: string }) {
  const reps = node.level === 'class' ? node.representatives : node.level === 'superclass' ? node.children.flatMap((c) => c.representatives).slice(0, 6) : node.children.flatMap((s) => s.children.flatMap((c) => c.representatives)).slice(0, 6);
  const organisms = node.level === 'class' ? node.organisms : node.level === 'superclass' ? Array.from(new Set(node.children.flatMap((c) => c.organisms))) : Array.from(new Set(node.children.flatMap((s) => s.children.flatMap((c) => c.organisms))));
  return (
    <div className="space-y-4 rounded-panel border border-line bg-bg/40 p-4">
      <div className="flex flex-wrap items-center gap-2">
        <span className="label">{node.level}</span>
        <h4 className="text-[15px] font-semibold text-ink">{node.name}</h4>
        <span className="chip num ml-auto">{node.count} compound{node.count === 1 ? '' : 's'} in dataset</span>
      </div>
      {node.description && <p className="text-[13px] leading-relaxed text-muted">{node.description}</p>}
      {node.level === 'pathway' && node.precursors?.length > 0 && (
        <div className="flex flex-wrap gap-1.5 text-[12px]"><span className="text-muted">Precursors:</span>{node.precursors.map((p) => <span key={p} className="chip">{p}</span>)}</div>
      )}
      {node.level !== 'pathway' && (
        <div className="flex items-center gap-2 text-[12px] text-muted">Related pathway: <span className="inline-flex items-center gap-1.5 text-ink"><PathwayDot pathway={pathway} />{pathway}</span></div>
      )}
      {node.level !== 'class' && (
        <div className="flex flex-wrap gap-1.5">
          {node.children.map((c: any) => <span key={c.name} className="chip">{c.name} <span className="num text-faint">{c.count}</span></span>)}
        </div>
      )}
      <div>
        <div className="label mb-2">Representative structures</div>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {reps.map((r) => (
            <Link key={r.compound_id} to={`/compound/${r.compound_id}`} className="group rounded-md border border-line p-1.5 hover:border-accent/60">
              <Structure2D smiles={r.smiles} width={200} height={140} title={r.name} />
              <div className="truncate px-1 text-[12px] text-muted group-hover:text-accent">{r.name}</div>
            </Link>
          ))}
        </div>
      </div>
      {organisms.length > 0 && (
        <div className="text-[12px]">
          <div className="label mb-1.5">Known biological sources (dataset)</div>
          <p className="italic text-muted">{organisms.slice(0, 14).join(', ')}{organisms.length > 14 ? ` +${organisms.length - 14} more` : ''}</p>
        </div>
      )}
    </div>
  );
}

/** Pathway → Superclass → Class for one compound; each level is clickable. */
export function CompoundHierarchy({ pathway, superclass, cls, provenance = 'curated', note }: { pathway: string; superclass: string; cls: string; provenance?: 'curated' | 'predicted'; note?: string }) {
  const { data: ont, loading, error } = useEngineQuery((e) => e.ontology(), []);
  const [focus, setFocus] = useState<'pathway' | 'superclass' | 'class'>('class');
  const path = useMemo(() => (ont ? findPath(ont, pathway, superclass, cls) : null), [ont, pathway, superclass, cls]);
  const levels = [
    { key: 'pathway' as const, label: 'Pathway', name: pathway, color: pathwayColor(pathway) },
    { key: 'superclass' as const, label: 'Superclass', name: superclass, color: labelColor(superclass) },
    { key: 'class' as const, label: 'Class', name: cls, color: labelColor(cls) },
  ];
  const node = path ? (focus === 'pathway' ? path.pw : focus === 'superclass' ? path.sc : path.c) : null;
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <ProvenanceBadge kind={provenance} />
        <span className="text-[12px] text-muted">{note ?? 'Demo annotation following the NPClassifier pathway › superclass › class scheme.'}</span>
      </div>
      <ol className="space-y-1.5" aria-label="Classification hierarchy">
        {levels.map((l, i) => (
          <li key={l.key} style={{ paddingLeft: `${i * 1.25}rem` }}>
            <button
              onClick={() => setFocus(l.key)}
              aria-pressed={focus === l.key}
              className={clsx('flex w-full items-center gap-2 rounded-md border px-3 py-2 text-left transition-colors', focus === l.key ? 'border-accent/60 bg-accent/10' : 'border-line hover:border-accent/40')}
            >
              {i > 0 && <CornerDownRight className="h-3.5 w-3.5 text-faint" aria-hidden />}
              <span className="h-2.5 w-2.5 rounded-sm" style={{ background: l.color }} aria-hidden />
              <span className="w-20 shrink-0 text-[11px] uppercase tracking-wider text-muted">{l.label}</span>
              <span className="text-[13.5px] font-medium text-ink">{l.name}</span>
              <ChevronRight className="ml-auto h-4 w-4 text-faint" aria-hidden />
            </button>
          </li>
        ))}
      </ol>
      {loading && <Skeleton className="h-48" />}
      {error && <ErrorState message={error} />}
      {ont && !node && <p className="text-[12px] text-muted">This label is not present in the local ontology, so no dataset statistics are available.</p>}
      {node && <NodeDetail node={node} pathway={pathway} />}
    </div>
  );
}

/** Full interactive ontology browser (Explore page). */
export function OntologyBrowser() {
  const { data: ont, loading, error } = useEngineQuery((e) => e.ontology(), []);
  const [sel, setSel] = useState<{ pw: string; sc?: string; c?: string } | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  if (loading) return <Skeleton className="h-96" />;
  if (error || !ont) return <ErrorState message={error || 'Ontology unavailable'} />;
  const current = sel ?? { pw: ont.pathways[0].name };
  const path = findPath(ont, current.pw, current.sc, current.c);
  const node = path.c ?? path.sc ?? path.pw;
  const toggle = (k: string) => setExpanded((s) => { const n = new Set(s); n.has(k) ? n.delete(k) : n.add(k); return n; });
  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,360px)_1fr]">
      <div className="panel max-h-[640px] overflow-y-auto p-2" role="tree" aria-label="Natural product classification">
        {ont.pathways.map((pw) => (
          <div key={pw.name} role="treeitem" aria-expanded={expanded.has(pw.name)}>
            <button onClick={() => { toggle(pw.name); setSel({ pw: pw.name }); }}
              className={clsx('flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-[13px]', current.pw === pw.name && !current.sc ? 'bg-raised text-ink' : 'text-ink hover:bg-raised/60')}>
              <ChevronRight className={clsx('h-3.5 w-3.5 text-faint transition-transform', expanded.has(pw.name) && 'rotate-90')} aria-hidden />
              <PathwayDot pathway={pw.name} />
              <span className="font-medium">{pw.name}</span>
              <span className="num ml-auto text-[11px] text-faint">{pw.count}</span>
            </button>
            {expanded.has(pw.name) && pw.children.map((sc) => {
              const k = `${pw.name}/${sc.name}`;
              return (
                <div key={k} role="group" className="ml-4 border-l border-line pl-1">
                  <button onClick={() => { toggle(k); setSel({ pw: pw.name, sc: sc.name }); }}
                    className={clsx('flex w-full items-center gap-2 rounded px-2 py-1 text-left text-[12.5px]', current.sc === sc.name && !current.c ? 'bg-raised text-ink' : 'text-muted hover:text-ink')}>
                    <ChevronRight className={clsx('h-3 w-3 text-faint transition-transform', expanded.has(k) && 'rotate-90')} aria-hidden />
                    {sc.name}<span className="num ml-auto text-[11px] text-faint">{sc.count}</span>
                  </button>
                  {expanded.has(k) && sc.children.map((c) => (
                    <button key={c.name} onClick={() => setSel({ pw: pw.name, sc: sc.name, c: c.name })}
                      className={clsx('ml-5 flex w-[calc(100%-1.25rem)] items-center gap-2 rounded px-2 py-1 text-left text-[12px]', current.c === c.name ? 'bg-accent/15 text-accent' : 'text-muted hover:text-ink')}>
                      {c.name}<span className="num ml-auto text-[11px] text-faint">{c.count}</span>
                    </button>
                  ))}
                </div>
              );
            })}
          </div>
        ))}
      </div>
      {node && <NodeDetail node={node} pathway={current.pw} />}
    </div>
  );
}
