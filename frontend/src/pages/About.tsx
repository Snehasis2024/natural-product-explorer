import { ExternalLink } from 'lucide-react';
import { Page } from '../components/Layout';
import { ProvenanceBadge } from '../components/ui';

const REFS = [
  { t: 'Kim, H. W. et al. NPClassifier: a deep neural network-based structural classification tool for natural products. J. Nat. Prod. 2021, 84, 2795–2807.', doi: '10.1021/acs.jnatprod.1c00399' },
  { t: 'Rutz, A. et al. The LOTUS initiative for open knowledge management in natural products research. eLife 2022, 11, e70780.', doi: '10.7554/eLife.70780' },
  { t: 'Sorokina, M. et al. COCONUT online: Collection of Open Natural Products database. J. Cheminform. 2021, 13, 2.', doi: '10.1186/s13321-020-00478-9' },
  { t: 'van Santen, J. A. et al. The Natural Products Atlas: an open access knowledge base for microbial natural products discovery. ACS Cent. Sci. 2019, 5, 1824–1833.', doi: '10.1021/acscentsci.9b00806' },
];

export function AboutPage() {
  return (
    <Page className="max-w-4xl space-y-8">
      <section className="space-y-3">
        <h1 className="text-2xl font-semibold tracking-tight text-ink">About Natural Product Explorer</h1>
        <p className="text-[14px] leading-relaxed text-muted">
          A research and teaching platform for natural products. Search by name, SMILES, InChI, InChIKey or database identifier; inspect
          any structure in 3D; read its calculated properties, classification, biological source and literature; and obtain a predicted
          classification from an NPC-BERT service or a transparent baseline.
        </p>
      </section>
      <section className="space-y-3">
        <h2 className="text-lg font-semibold text-ink">What each label means</h2>
        <dl className="grid gap-3 text-[13px] sm:grid-cols-2">
          {([
            ['calculated', 'Computed from the structure with RDKit: descriptors, InChI/InChIKey, fingerprints, 3D conformers (ETKDGv3 + MMFF94), Gasteiger charges.'],
            ['curated', 'Entered by hand for the demo dataset: SMILES, classification, organism, identifiers, references. Structures of reference compounds are checked against their standard InChIKeys in the test suite.'],
            ['database', 'Retrieved live from an external database through its official API.'],
            ['predicted', 'Output of a predictive model (NPC-BERT when connected).'],
            ['demo', 'Demonstration content, including the kNN baseline prediction. Verify before scientific use.'],
            ['experimental', 'Measured values. This demo dataset contains none; the label is reserved for imported experimental data.'],
          ] as const).map(([k, v]) => (
            <div key={k} className="panel space-y-1.5 p-3"><ProvenanceBadge kind={k} /><p className="text-muted">{v}</p></div>
          ))}
        </dl>
      </section>
      <section className="space-y-3">
        <h2 className="text-lg font-semibold text-ink">Architecture</h2>
        <ul className="list-disc space-y-1.5 pl-5 text-[13.5px] text-muted">
          <li><b className="text-ink">Frontend</b>: React, TypeScript, Vite, Tailwind CSS, 3Dmol.js (3D), Recharts (charts), RDKit.js (2D depiction and in-browser cheminformatics).</li>
          <li><b className="text-ink">Backend</b>: Python FastAPI with RDKit, Pydantic validation, rate limiting, request-size limits, CORS and caching (Redis optional).</li>
          <li><b className="text-ink">Storage</b>: PostgreSQL with pgvector; Morgan fingerprints stored as <code className="font-mono">bit(2048)</code> for Jaccard/Tanimoto search.</li>
          <li><b className="text-ink">Two engines</b>: with the API the app uses Python RDKit; without it (e.g. static hosting) the same algorithms run in the browser with RDKit.js and OpenChemLib (3D conformers).</li>
        </ul>
      </section>
      <section className="space-y-3">
        <h2 className="text-lg font-semibold text-ink">Key resources</h2>
        <ol className="space-y-2 text-[13px] text-muted">
          {REFS.map((r) => (
            <li key={r.doi}>{r.t} <a className="inline-flex items-center gap-1 font-mono text-[12px] text-accent hover:underline" href={`https://doi.org/${r.doi}`} target="_blank" rel="noreferrer">doi:{r.doi}<ExternalLink className="h-3 w-3" /></a></li>
          ))}
        </ol>
      </section>
      <section className="space-y-2 text-[13px] text-muted">
        <h2 className="text-lg font-semibold text-ink">Limitations</h2>
        <p>The bundled dataset is a small curated demonstration set. Classifications are demo annotations in the NPClassifier style, not NPClassifier output. The kNN baseline is not a trained deep-learning model; its probabilities are neighbour vote shares. 3D structures are single computed conformers, not experimental geometries.</p>
      </section>
    </Page>
  );
}
