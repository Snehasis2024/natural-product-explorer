import { useState } from 'react';
import { Link } from 'react-router-dom';
import clsx from 'clsx';
import { AlertTriangle, Info, Sparkles } from 'lucide-react';
import { useEngineQuery } from '../lib/app-context';
import { labelColor, pathwayColor, pct } from '../lib/format';
import type { PredictionResult } from '../lib/types';
import { ErrorState, ProbabilityBar, ProvenanceBadge, SectionTitle, Skeleton, Structure2D, Tabs } from './ui';

export function PredictionView({ result, compact, truth }: { result: PredictionResult; compact?: boolean; truth?: { pathway: string; superclass: string; class: string } }) {
  const [level, setLevel] = useState<'pathway' | 'superclass' | 'class'>('class');
  const [hl, setHl] = useState<number[]>([]);
  const demo = result.model.is_demo;
  const ad = result.explanation.applicability_domain;
  const rows = [
    { key: 'pathway' as const, label: 'Pathway', p: result.pathway, color: pathwayColor(result.pathway.label) },
    { key: 'superclass' as const, label: 'Superclass', p: result.superclass, color: labelColor(result.superclass.label) },
    { key: 'class' as const, label: 'Class', p: result.class, color: labelColor(result.class.label) },
  ];
  return (
    <div className="space-y-5">
      {demo ? (
        <div className="flex items-start gap-2.5 rounded-md border border-warn/50 bg-warn/10 px-3 py-2.5 text-[13px]" role="note">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-warn" aria-hidden />
          <div>
            <p className="font-semibold text-ink">{result.model.notice}</p>
            <p className="text-muted">
              Transparent baseline: similarity-weighted kNN over {result.model.reference_set_size} curated reference compounds. It is not NPC-BERT.
              Set <code className="font-mono text-[12px] text-ink">NPC_BERT_API_URL</code> on the API server to use a trained model.
            </p>
          </div>
        </div>
      ) : (
        <div className="flex items-center gap-2 text-[13px] text-muted"><Sparkles className="h-4 w-4 text-accent" /> {result.model.name} {result.model.version}</div>
      )}
      {result.fallback_reason && <ErrorState title="NPC-BERT unavailable" message={result.fallback_reason} />}

      <div className="flex flex-wrap items-center gap-2"><ProvenanceBadge kind="predicted" />{demo && <ProvenanceBadge kind="demo" />}</div>

      <div className="space-y-3.5">
        {rows.map((r) => (
          <div key={r.key}>
            <div className="label mb-1">{r.label} prediction</div>
            <ProbabilityBar value={r.p.confidence} label={r.p.label} color={r.color}
              sub={truth ? (truth[r.key] === r.p.label ? 'Matches curated annotation' : `Curated annotation: ${truth[r.key]}`) : undefined} />
          </div>
        ))}
      </div>

      {ad && (
        <p className={clsx('flex items-start gap-2 text-[12px]', ad.in_domain ? 'text-muted' : 'text-warn')}>
          <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
          Nearest reference Tanimoto {ad.max_similarity.toFixed(2)} · {ad.in_domain ? 'within applicability domain' : 'outside applicability domain; treat as unreliable'}.
        </p>
      )}

      <section className="space-y-2">
        <SectionTitle>Top-{Math.min(5, result.top_k_by_level[level]?.length || 0)} alternatives</SectionTitle>
        <Tabs tabs={[{ id: 'pathway', label: 'Pathway' }, { id: 'superclass', label: 'Superclass' }, { id: 'class', label: 'Class' }]} value={level} onChange={setLevel} />
        <ol className="space-y-1.5 pt-1">
          {(result.top_k_by_level[level] || []).map((t, i) => (
            <li key={t.label} className="grid grid-cols-[1.25rem_1fr_auto] items-center gap-2 text-[13px]">
              <span className="num text-faint">{i + 1}.</span>
              <div className="min-w-0">
                <div className="truncate text-ink">{t.label}</div>
                <div className="mt-0.5 h-1 rounded-full bg-raised"><div className="h-1 rounded-full" style={{ width: `${t.probability * 100}%`, background: level === 'pathway' ? pathwayColor(t.label) : labelColor(t.label) }} /></div>
              </div>
              <span className="num font-mono text-[12px] text-muted">{pct(t.probability)}</span>
            </li>
          ))}
        </ol>
      </section>

      {!compact && (
        <section className="space-y-3">
          <SectionTitle>Explain prediction</SectionTitle>
          {result.explanation.method && <p className="text-[12.5px] leading-relaxed text-muted">{result.explanation.method}</p>}
          {result.explanation.features && result.explanation.features.length > 0 && (
            <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_minmax(0,240px)]">
              <div>
                <div className="mb-1.5 text-[12px] text-muted">Structural features detected (hover to highlight):</div>
                <ul className="space-y-1">
                  {result.explanation.features.map((f) => (
                    <li key={f.name}>
                      <button onMouseEnter={() => setHl(f.atoms)} onFocus={() => setHl(f.atoms)} onMouseLeave={() => setHl([])} onBlur={() => setHl([])}
                        className="flex w-full items-center gap-2 rounded px-2 py-1 text-left text-[12.5px] hover:bg-raised">
                        <span className="text-ink">{f.name}</span>
                        <span className="num text-faint">×{f.count}</span>
                        <span className="ml-auto flex gap-1">{f.associated_pathways.map((p) => <span key={p} className="h-2 w-2 rounded-full" style={{ background: pathwayColor(p) }} title={`Typical of ${p}`} />)}</span>
                      </button>
                    </li>
                  ))}
                </ul>
                <p className="mt-1.5 text-[11px] text-faint">{result.explanation.features_note}</p>
              </div>
              <div className="rounded-md border border-line p-1"><Structure2D smiles={result.smiles} width={240} height={200} highlight={hl} /></div>
            </div>
          )}
          {result.explanation.nearest_neighbors && (
            <div>
              <div className="mb-1.5 text-[12px] text-muted">Reference compounds that voted:</div>
              <div className="overflow-x-auto">
                <table className="w-full text-[12.5px]">
                  <thead className="text-left text-[11px] uppercase tracking-wider text-faint">
                    <tr><th className="py-1 pr-2 font-medium">Compound</th><th className="pr-2 font-medium">Tanimoto</th><th className="pr-2 font-medium">Class</th></tr>
                  </thead>
                  <tbody>
                    {result.explanation.nearest_neighbors.map((n) => (
                      <tr key={n.compound_id} className="border-t border-line/60">
                        <td className="py-1 pr-2"><Link className="text-ink hover:text-accent" to={`/compound/${n.compound_id}`}>{n.name}</Link></td>
                        <td className="num pr-2 font-mono text-muted">{n.similarity.toFixed(3)}</td>
                        <td className="pr-2 text-muted">{n.class}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
          {result.explanation.note && <p className="text-[12px] text-muted">{result.explanation.note}</p>}
        </section>
      )}
    </div>
  );
}

export function PredictionPanel({ smiles, truth, compact }: { smiles: string; truth?: { pathway: string; superclass: string; class: string }; compact?: boolean }) {
  const { data, loading, error } = useEngineQuery((e) => e.predict(smiles), [smiles]);
  if (loading) return <div className="space-y-3"><Skeleton className="h-16" /><Skeleton className="h-10" /><Skeleton className="h-10" /><Skeleton className="h-10" /></div>;
  if (error) return <ErrorState title="Prediction failed" message={error} />;
  if (!data) return null;
  return <PredictionView result={data} truth={truth} compact={compact} />;
}
