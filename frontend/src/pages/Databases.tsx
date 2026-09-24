import clsx from 'clsx';
import { Database, ExternalLink, KeyRound } from 'lucide-react';
import { useApp, useEngineQuery } from '../lib/app-context';
import { Page } from '../components/Layout';
import { ErrorState, Skeleton } from '../components/ui';

const STATUS: Record<string, { label: string; cls: string }> = {
  enabled: { label: 'Enabled', cls: 'border-ok/50 text-ok' },
  disabled: { label: 'Disabled', cls: 'border-line text-muted' },
  needs_credentials: { label: 'Needs API token', cls: 'border-warn/60 text-warn' },
  requires_api: { label: 'Needs API backend', cls: 'border-line text-muted' },
};

const SCHEMA = ['compound_id', 'name', 'smiles', 'inchi', 'inchikey', 'formula', 'molecular_weight', 'exact_mass', 'pathway', 'superclass', 'class', 'organism', 'database', 'database_id', 'literature', 'source_url'];

export function DatabasesPage() {
  const { status } = useApp();
  const { data, loading, error } = useEngineQuery((e) => e.databases(), []);
  return (
    <Page className="space-y-5">
      <div className="flex items-start gap-3">
        <Database className="mt-1 h-6 w-6 text-accent" aria-hidden />
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-ink">Databases</h1>
          <p className="max-w-3xl text-[13px] text-muted">A local curated dataset plus adapters for public natural-product resources. Adapters call official APIs only (no scraping) and map results to one unified schema.</p>
        </div>
      </div>
      {loading && <Skeleton className="h-64" />}
      {error && <ErrorState message={error} />}
      {data && (
        <>
          <section className="panel flex flex-wrap items-center gap-x-8 gap-y-2 p-4 text-[13px]">
            <div><div className="label">Local dataset</div><div className="text-ink">{data.local.name}</div></div>
            <div><div className="label">Compounds</div><div className="num text-ink">{data.local.count}</div></div>
            <div><div className="label">Storage</div><div className="text-ink">{data.local.storage}</div></div>
            <div><div className="label">Engine</div><div className="text-ink">{status?.detail ?? '…'}</div></div>
            <div><div className="label">Remote adapters</div><div className="text-ink">{data.remote_enabled ? 'enabled' : 'disabled'}</div></div>
          </section>
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {data.adapters.map((a) => {
              const st = STATUS[a.status] ?? STATUS.disabled;
              return (
                <article key={a.name} className="panel flex flex-col gap-2 p-4">
                  <div className="flex items-center gap-2">
                    <h2 className="text-[15px] font-semibold text-ink">{a.name}</h2>
                    {a.requires_key && <KeyRound className="h-3.5 w-3.5 text-muted" aria-label="Requires API token" />}
                    <span className={clsx('chip ml-auto', st.cls)}>{st.label}</span>
                  </div>
                  <p className="text-[13px] text-muted">{a.description}</p>
                  <div className="flex flex-wrap gap-1">{a.supports.map((s) => <span key={s} className="chip font-mono">{s}</span>)}</div>
                  <div className="mt-auto flex gap-4 pt-1 text-[12.5px]">
                    <a className="inline-flex items-center gap-1 text-accent hover:underline" href={a.homepage} target="_blank" rel="noreferrer">Website <ExternalLink className="h-3 w-3" /></a>
                    <a className="inline-flex items-center gap-1 text-accent hover:underline" href={a.api_docs} target="_blank" rel="noreferrer">API docs <ExternalLink className="h-3 w-3" /></a>
                  </div>
                </article>
              );
            })}
          </div>
          <section className="panel space-y-2 p-4">
            <h2 className="label">Unified internal schema</h2>
            <div className="flex flex-wrap gap-1.5">{SCHEMA.map((f) => <code key={f} className="rounded bg-raised px-1.5 py-0.5 font-mono text-[12px] text-ink">{f}</code>)}</div>
            <p className="text-[12.5px] text-muted">Every record also carries <code className="font-mono text-ink">provenance</code> labels (calculated, curated, database, predicted, demo) so derived values are never mixed with database or experimental ones. Enable adapters on the API server with <code className="font-mono text-ink">ENABLE_REMOTE_ADAPTERS=true</code>; COCONUT additionally needs <code className="font-mono text-ink">COCONUT_API_TOKEN</code>.</p>
          </section>
        </>
      )}
    </Page>
  );
}
