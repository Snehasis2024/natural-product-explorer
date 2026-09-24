import { useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { BrainCircuit, FileUp, Server } from 'lucide-react';
import { useApp, useEngineQuery } from '../lib/app-context';
import { Page } from '../components/Layout';
import { PredictionView } from '../components/Prediction';
import { EmptyState, ErrorState, Skeleton, Structure2D } from '../components/ui';

const EXAMPLES = [
  { name: 'Apigenin', smiles: 'O=c1cc(-c2ccc(O)cc2)oc2cc(O)cc(O)c12' },
  { name: 'Curcumin', smiles: 'COc1cc(/C=C/C(=O)CC(=O)/C=C/c2ccc(O)c(OC)c2)ccc1O' },
  { name: 'Artemisinin', smiles: 'C[C@@H]1CC[C@H]2[C@@H](C)C(=O)O[C@@H]3O[C@@]4(C)CC[C@@H]1[C@]32OO4' },
  { name: 'Theophylline', smiles: 'Cn1c(=O)c2[nH]cnc2n(C)c1=O' },
  { name: 'Emodin', smiles: 'Cc1cc(O)c2C(=O)c3c(O)cc(O)cc3C(=O)c2c1' },
];

const MAX_FILE_BYTES = 100 * 1024;

export function PredictPage() {
  const [sp, setSp] = useSearchParams();
  const { status } = useApp();
  const smiles = sp.get('smiles') || '';
  const [input, setInput] = useState(smiles);
  const [fileError, setFileError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const { data, loading, error } = useEngineQuery(smiles ? (e) => e.predict(smiles) : null, [smiles]);

  const run = (s: string) => {
    const v = s.trim();
    if (!v) return;
    setInput(v);
    setSp({ smiles: v });
  };

  const onFile = async (f: File | undefined) => {
    setFileError(null);
    if (!f) return;
    if (f.size > MAX_FILE_BYTES) { setFileError('File is larger than 100 KB.'); return; }
    if (!/\.(smi|smiles|txt|csv)$/i.test(f.name)) { setFileError('Upload a .smi, .smiles, .txt or .csv file.'); return; }
    const text = await f.text();
    const first = text.split(/\r?\n/).map((l) => l.trim()).find((l) => l && !/^smiles\b/i.test(l) && !l.startsWith('#'));
    if (!first) { setFileError('No SMILES found in the file.'); return; }
    run(first.split(/[\s,;]+/)[0]);
  };

  return (
    <Page className="space-y-5">
      <div className="flex flex-wrap items-start gap-3">
        <BrainCircuit className="mt-1 h-6 w-6 text-accent" aria-hidden />
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-ink">AI Classification</h1>
          <p className="max-w-2xl text-[13px] text-muted">Predict the biosynthetic pathway, superclass and class of any structure, with top-k alternatives and an explanation of the evidence.</p>
        </div>
        <div className="ml-auto flex items-center gap-2 rounded-md border border-line px-3 py-1.5 text-[12px] text-muted">
          <Server className="h-3.5 w-3.5" />
          {status?.npc_bert ? <span className="text-ok">NPC-BERT connected</span> : <span>NPC-BERT not connected · demo baseline active</span>}
        </div>
      </div>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,380px)_minmax(0,1fr)]">
        <div className="space-y-4">
          <form className="panel space-y-3 p-4" onSubmit={(e) => { e.preventDefault(); run(input); }}>
            <label htmlFor="predict-smiles" className="label">SMILES</label>
            <textarea id="predict-smiles" rows={4} className="input resize-y font-mono text-[12.5px]" value={input} onChange={(e) => setInput(e.target.value)} placeholder="Paste a SMILES string" spellCheck={false} />
            <div className="flex flex-wrap gap-2">
              <button type="submit" className="btn-primary" disabled={!input.trim()}>Predict</button>
              <button type="button" className="btn" onClick={() => fileRef.current?.click()}><FileUp className="h-4 w-4" /> Upload .smi</button>
              <input ref={fileRef} id="predict-file" type="file" accept=".smi,.smiles,.txt,.csv" className="hidden" onChange={(e) => onFile(e.target.files?.[0])} />
            </div>
            {fileError && <p className="text-[12px] text-bad" role="alert">{fileError}</p>}
            <div className="flex flex-wrap gap-1.5 pt-1 text-[12px]">
              {EXAMPLES.map((ex) => <button type="button" key={ex.name} className="chip hover:border-accent/60 hover:text-accent" onClick={() => run(ex.smiles)}>{ex.name}</button>)}
            </div>
          </form>
          {smiles && (
            <div className="panel space-y-2 p-3">
              <div className="rounded-md border border-line/60 bg-bg/30 p-1"><Structure2D smiles={smiles} width={360} height={260} /></div>
              <Link className="text-[13px] text-accent hover:underline" to={`/analyze?smiles=${encodeURIComponent(smiles)}`}>Open in 3D explorer →</Link>
            </div>
          )}
          <div className="panel space-y-2 p-4 text-[12.5px] leading-relaxed text-muted">
            <h2 className="label">Connecting NPC-BERT</h2>
            <p>The API forwards <code className="font-mono text-ink">POST /api/predict</code> to the service at <code className="font-mono text-ink">NPC_BERT_API_URL</code> and normalises its response. Credentials stay on the server (<code className="font-mono text-ink">NPC_BERT_API_KEY</code>). Without it, the transparent kNN baseline runs and every result is labelled as a demo.</p>
          </div>
        </div>

        <div className="panel min-w-0 p-4">
          {!smiles && <EmptyState icon={<BrainCircuit className="h-6 w-6" />} title="No structure yet" message="Paste a SMILES, upload a .smi file, or pick an example to see the prediction dashboard." />}
          {loading && <div className="space-y-3"><Skeleton className="h-16" /><Skeleton className="h-12" /><Skeleton className="h-12" /><Skeleton className="h-12" /><Skeleton className="h-40" /></div>}
          {error && <ErrorState title="Prediction failed" message={error} />}
          {data && !loading && <PredictionView result={data} />}
        </div>
      </div>
    </Page>
  );
}
