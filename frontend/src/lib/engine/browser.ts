/**
 * Browser engine: runs entirely client-side with RDKit.js (WASM) over the bundled demo dataset.
 * Used for static deployments (GitHub Pages) or whenever the API is unreachable.
 * Algorithms mirror backend/app (same Morgan r=2/2048 fingerprints, same kNN baseline, same
 * SMARTS features), so both engines return the same numbers for the same input.
 */
import type { Engine } from './types';
import { EngineError } from './types';
import { loadRDKit, withMol } from '../rdkit';
import { conformerFromSmiles } from '../ocl';
import { detectQueryType } from '../query';
import type {
  Compound, CompoundSummary, DatabaseInfo, Feature, Ontology, PredictionResult, Properties, SearchParams,
  SearchResponse, Statistics, StructureResult, TopKItem,
} from '../types';

const FP_OPTS = JSON.stringify({ radius: 2, nBits: 2048 });
const MAX_SMILES = 2000;
const SMILES_CHARS = /^[A-Za-z0-9@+\-[\]()=#$:/\\.%*~&!;,]+$/;

const ELEMENTS = ('H He Li Be B C N O F Ne Na Mg Al Si P S Cl Ar K Ca Sc Ti V Cr Mn Fe Co Ni Cu Zn Ga Ge As Se Br Kr Rb Sr Y Zr Nb Mo Tc Ru Rh Pd Ag Cd In Sn Sb Te I Xe Cs Ba La Ce Pr Nd Pm Sm Eu Gd Tb Dy Ho Er Tm Yb Lu Hf Ta W Re Os Ir Pt Au Hg Tl Pb Bi Po At Rn Fr Ra Ac Th Pa U Np Pu Am Cm Bk Cf Es Fm Md No Lr Rf Db Sg Bh Hs Mt Ds Rg Cn Nh Fl Mc Lv Ts Og').split(' ');

type Bits = Uint32Array;

function toBits(s: string): Bits {
  const out = new Uint32Array(64);
  for (let i = 0; i < s.length; i++) if (s.charCodeAt(i) === 49) out[i >> 5] |= 1 << (i & 31);
  return out;
}
function popcount(x: number) {
  x -= (x >>> 1) & 0x55555555;
  x = (x & 0x33333333) + ((x >>> 2) & 0x33333333);
  return (((x + (x >>> 4)) & 0x0f0f0f0f) * 0x01010101) >>> 24;
}
function tanimoto(a: Bits, b: Bits) {
  let inter = 0, union = 0;
  for (let i = 0; i < a.length; i++) {
    inter += popcount(a[i] & b[i]);
    union += popcount(a[i] | b[i]);
  }
  return union ? inter / union : 0;
}
const round = (x: number, d: number) => Math.round(x * 10 ** d) / 10 ** d;

async function getJSON<T>(path: string): Promise<T> {
  const res = await fetch(new URL(path, document.baseURI).toString());
  if (!res.ok) throw new EngineError(`Could not load ${path} (${res.status})`);
  return res.json();
}

function formulaFromJson(json: any): { formula: string; charge: number } {
  const mol = json.molecules[0];
  const defaults = json.defaults.atom;
  const counts: Record<string, number> = {};
  let charge = 0;
  for (const a of mol.atoms) {
    const z = a.z ?? defaults.z;
    const sym = ELEMENTS[z - 1] ?? '*';
    counts[sym] = (counts[sym] || 0) + 1;
    const h = a.impHs ?? defaults.impHs;
    if (h) counts.H = (counts.H || 0) + h;
    charge += a.chg ?? defaults.chg;
  }
  const order = counts.C ? ['C', 'H', ...Object.keys(counts).filter((e) => e !== 'C' && e !== 'H').sort()] : Object.keys(counts).sort();
  let formula = order.filter((e) => counts[e]).map((e) => (counts[e] === 1 ? e : `${e}${counts[e]}`)).join('');
  if (charge) formula += charge > 0 ? (charge === 1 ? '+' : `+${charge}`) : charge === -1 ? '-' : `${charge}`;
  return { formula, charge };
}

export class BrowserEngine implements Engine {
  private data: Promise<{ compounds: Compound[]; fps: Bits[]; mols: any[]; features: any[] }> | null = null;

  private load() {
    if (!this.data) {
      this.data = (async () => {
        const [rdkit, ds, feat] = await Promise.all([
          loadRDKit(),
          getJSON<{ compounds: Compound[] }>('data/compounds.json'),
          getJSON<{ features: { name: string; smarts: string; pathways: string[] }[] }>('data/np_features.json'),
        ]);
        const mols = ds.compounds.map((c) => rdkit.get_mol(c.canonical_smiles));
        const fps = mols.map((m: any) => toBits(m.get_morgan_fp(FP_OPTS)));
        const features = feat.features.map((f) => ({ ...f, q: rdkit.get_qmol(f.smarts) }));
        return { compounds: ds.compounds, fps, mols, features };
      })().catch((e) => {
        this.data = null;
        throw e;
      });
    }
    return this.data;
  }

  private parse(smiles: string) {
    const s = smiles.trim();
    if (!s) throw new EngineError('SMILES string is empty.');
    if (s.length > MAX_SMILES) throw new EngineError(`SMILES exceeds the maximum length of ${MAX_SMILES} characters.`);
    if (!SMILES_CHARS.test(s)) throw new EngineError('SMILES contains characters that are not allowed.');
    return s;
  }

  async status() {
    const d = await this.load();
    return { mode: 'browser' as const, detail: 'RDKit.js (WebAssembly) in your browser', npc_bert: false, compounds: d.compounds.length };
  }

  private summary(c: Compound, extra: Partial<CompoundSummary> = {}): CompoundSummary {
    return {
      compound_id: c.compound_id, name: c.name, formula: c.formula, molecular_weight: c.molecular_weight,
      canonical_smiles: c.canonical_smiles, pathway: c.pathway, superclass: c.superclass, class: c.class,
      database: c.database, organism: c.organism?.name ?? null, logp: c.properties.logp, tpsa: c.properties.tpsa,
      is_demo: c.is_demo, ...extra,
    };
  }

  private value(c: Compound, key: string): any {
    switch (key) {
      case 'organism': return c.organism?.name ?? '';
      case 'kingdom': return c.organism?.kingdom ?? '';
      case 'molecular_weight': case 'formula': case 'name': case 'pathway': case 'superclass': case 'class': case 'database':
        return (c as any)[key];
      default: return (c.properties as any)[key];
    }
  }

  private textScore(c: Compound, q: string) {
    const ql = q.toLowerCase();
    const name = c.name.toLowerCase();
    if (name === ql || c.compound_id.toLowerCase() === ql) return 100;
    if (name.startsWith(ql)) return 80;
    if (name.includes(ql)) return 60;
    const o = c.organism || ({} as any);
    const hay = [c.pathway, c.superclass, c.class, c.formula, c.description, o.name, o.family, o.genus, o.kingdom].filter(Boolean).join(' ').toLowerCase();
    return hay.includes(ql) ? 30 : 0;
  }

  async search(p: SearchParams): Promise<SearchResponse> {
    const d = await this.load();
    const rdkit = await loadRDKit();
    const q = (p.q || '').trim();
    const qt = q ? await detectQueryType(q) : { kind: 'all', value: '' };
    let scored: { c: Compound; score: number; extra: Partial<CompoundSummary> }[] = [];
    let message: string | null = null;
    let structure: SearchResponse['structure'] = null;

    if (qt.kind === 'all') scored = d.compounds.map((c) => ({ c, score: 0, extra: {} }));
    else if (qt.kind === 'name') {
      scored = d.compounds.map((c) => ({ c, score: this.textScore(c, qt.value), extra: { match_type: 'text' } })).filter((x) => x.score > 0);
    } else if (qt.kind === 'smiles' || qt.kind === 'inchi') {
      const mol = qt.kind === 'inchi' ? rdkit.get_mol(qt.value) : rdkit.get_mol(this.parse(qt.value));
      if (!mol || !mol.is_valid()) throw new EngineError('Could not parse the structure query.');
      try {
        const inchikey = rdkit.get_inchikey_for_inchi(mol.get_inchi());
        structure = { canonical_smiles: mol.get_smiles(), inchikey, valid: true };
        const qfp = toBits(mol.get_morgan_fp(FP_OPTS));
        d.compounds.forEach((c, i) => {
          if (c.inchikey === inchikey) scored.push({ c, score: 200, extra: { match_type: 'exact', similarity: 1 } });
          else {
            const s = tanimoto(qfp, d.fps[i]);
            if (s >= 0.35) scored.push({ c, score: 100 * s, extra: { match_type: 'similar', similarity: round(s, 4) } });
          }
        });
        if (!scored.length) message = 'Valid structure, not in the local database. Open it in the explorer to compute properties and predictions.';
      } finally {
        mol.delete();
      }
    } else if (qt.kind === 'inchikey') {
      scored = d.compounds.filter((c) => c.inchikey === qt.value.toUpperCase()).map((c) => ({ c, score: 200, extra: { match_type: 'exact' } }));
    } else {
      const val = qt.value.toUpperCase();
      scored = d.compounds.filter((c) => String(c.external_ids?.[qt.kind] ?? '').toUpperCase() === val).map((c) => ({ c, score: 200, extra: { match_type: 'identifier' } }));
      if (!scored.length) message = `No local record with this ${qt.kind.replace('_', ' ')}.`;
    }

    const facets: Record<string, Record<string, number>> = {};
    for (const key of ['pathway', 'superclass', 'class', 'database', 'kingdom']) {
      const counts: Record<string, number> = {};
      scored.forEach(({ c }) => {
        const v = this.value(c, key);
        if (v) counts[v] = (counts[v] || 0) + 1;
      });
      facets[key] = Object.fromEntries(Object.entries(counts).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])));
    }

    let items = scored;
    const inSet = (key: string, vals?: string[]) => {
      if (!vals?.length) return;
      const allowed = new Set(vals.map((v) => v.toLowerCase()));
      items = items.filter(({ c }) => allowed.has(String(this.value(c, key)).toLowerCase()));
    };
    inSet('pathway', p.pathway); inSet('superclass', p.superclass); inSet('class', p.class); inSet('kingdom', p.kingdom); inSet('database', p.database);
    if (p.organism) items = items.filter(({ c }) => String(this.value(c, 'organism')).toLowerCase().includes(p.organism!.toLowerCase()));
    const range = (key: string, lo?: number, hi?: number) => {
      if (lo !== undefined && lo !== null && !Number.isNaN(lo)) items = items.filter(({ c }) => this.value(c, key) >= lo);
      if (hi !== undefined && hi !== null && !Number.isNaN(hi)) items = items.filter(({ c }) => this.value(c, key) <= hi);
    };
    range('molecular_weight', p.mw_min, p.mw_max); range('logp', p.logp_min, p.logp_max); range('tpsa', p.tpsa_min, p.tpsa_max);

    const sort = p.sort || 'relevance';
    const dir = p.order === 'desc' ? -1 : 1;
    if (sort === 'relevance') items.sort((a, b) => b.score - a.score || a.c.name.localeCompare(b.c.name));
    else items.sort((a, b) => {
      const x = this.value(a.c, sort), y = this.value(b.c, sort);
      return (typeof x === 'string' ? x.localeCompare(y) : x - y) * dir;
    });

    const page = p.page || 1, size = p.page_size || 25;
    const total = items.length;
    return {
      query: q, query_type: qt.kind, total, page, page_size: size, pages: Math.max(1, Math.ceil(total / size)),
      results: items.slice((page - 1) * size, page * size).map(({ c, extra }) => this.summary(c, extra)),
      facets, structure, message,
      external: p.remote ? { enabled: false, message: 'External database search needs the API backend (browser-only mode).' } : null,
    };
  }

  async compound(id: string) {
    const d = await this.load();
    const c = d.compounds.find((x) => x.compound_id.toLowerCase() === id.toLowerCase());
    if (!c) throw new EngineError(`Compound '${id}' not found`, null, 404);
    return c;
  }

  async conformer(id: string) {
    const c = await this.compound(id);
    const res = await fetch(new URL(`data/conformers/${c.compound_id}.mol`, document.baseURI).toString());
    if (!res.ok) throw new EngineError('Conformer file missing');
    const ch = await fetch(new URL(`data/conformers/${c.compound_id}.charges.json`, document.baseURI).toString()).catch(() => null);
    const partial_charges = ch && ch.ok ? ((await ch.json()) as number[]) : null;
    return { molblock: await res.text(), method: c.conformer_method, partial_charges };
  }

  async structure(smiles: string): Promise<StructureResult> {
    const s = this.parse(smiles);
    const d = await this.load();
    const rdkit = await loadRDKit();
    const mol = rdkit.get_mol(s);
    if (!mol || !mol.is_valid()) {
      mol?.delete?.();
      throw new EngineError('Could not parse SMILES: invalid syntax or chemistry (valence, aromaticity or ring closure).');
    }
    try {
      if (mol.get_num_atoms?.() > 250 || JSON.parse(mol.get_descriptors()).NumHeavyAtoms > 250) throw new EngineError('Molecule exceeds 250 heavy atoms.');
      const desc = JSON.parse(mol.get_descriptors());
      const inchi = mol.get_inchi();
      const inchikey = rdkit.get_inchikey_for_inchi(inchi);
      const canonical = mol.get_smiles();
      const { formula, charge } = formulaFromJson(JSON.parse(mol.get_json()));
      const known = d.compounds.find((c) => c.inchikey === inchikey);
      const base: Properties = known
        ? known.properties
        : (() => {
            const props: any = {
              formula,
              molecular_weight: round(desc.amw, 3), exact_mass: round(desc.exactmw, 5), logp: round(desc.CrippenClogP, 3),
              tpsa: round(desc.tpsa, 2), hbd: desc.NumHBD, hba: desc.NumHBA, rotatable_bonds: desc.NumRotatableBonds,
              rings: desc.NumRings, aromatic_rings: desc.NumAromaticRings, heavy_atoms: desc.NumHeavyAtoms, formal_charge: charge,
              stereocenters: desc.NumAtomStereoCenters, stereocenters_unassigned: desc.NumUnspecifiedAtomStereoCenters,
              fsp3: round(desc.FractionCSP3, 3), molar_refractivity: round(desc.CrippenMR, 2),
              complexity_bertz: null, qed: null, sa_score: null, np_likeness: null,
            };
            const lip = [
              { rule: 'Molecular weight ≤ 500 Da', value: props.molecular_weight, limit: 500, pass: props.molecular_weight <= 500 },
              { rule: 'LogP ≤ 5', value: props.logp, limit: 5, pass: props.logp <= 5 },
              { rule: 'H-bond donors ≤ 5', value: props.hbd, limit: 5, pass: props.hbd <= 5 },
              { rule: 'H-bond acceptors ≤ 10', value: props.hba, limit: 10, pass: props.hba <= 10 },
            ];
            const violations = lip.filter((r) => !r.pass).length;
            props.lipinski = { rules: lip, violations, pass: violations <= 1 };
            const vr = [
              { rule: 'Rotatable bonds ≤ 10', value: props.rotatable_bonds, limit: 10, pass: props.rotatable_bonds <= 10 },
              { rule: 'TPSA ≤ 140 Å²', value: props.tpsa, limit: 140, pass: props.tpsa <= 140 },
            ];
            props.veber = { rules: vr, pass: vr.every((r) => r.pass) };
            return props as Properties;
          })();
      let molblock: string | null = null;
      let conformer: StructureResult['conformer'] = null;
      if (known) {
        const conf = await this.conformer(known.compound_id);
        molblock = conf.molblock;
        conformer = { method: `${conf.method} (precomputed)`, energy_kcal_mol: null, num_atoms_with_h: 0, partial_charges: conf.partial_charges };
      } else {
        const conf = await conformerFromSmiles(canonical);
        molblock = conf.molblock;
        conformer = { method: conf.method, energy_kcal_mol: conf.energy !== null ? round(conf.energy, 3) : null, num_atoms_with_h: 0 };
      }
      return {
        ...base, smiles: s, canonical_smiles: canonical, inchi, inchikey, molblock, conformer,
        engine: known ? 'RDKit (precomputed, Python) · RDKit.js' : 'RDKit.js (browser)', provenance: 'calculated',
      };
    } finally {
      mol.delete();
    }
  }

  async predict(smiles: string): Promise<PredictionResult> {
    const s = this.parse(smiles);
    const d = await this.load();
    const rdkit = await loadRDKit();
    const mol = rdkit.get_mol(s);
    if (!mol || !mol.is_valid()) {
      mol?.delete?.();
      throw new EngineError('Could not parse SMILES.');
    }
    try {
      const inchikey = rdkit.get_inchikey_for_inchi(mol.get_inchi());
      const qfp = toBits(mol.get_morgan_fp(FP_OPTS));
      const ranked = d.compounds
        .map((c, i) => ({ c, s: tanimoto(qfp, d.fps[i]) }))
        .filter((x) => x.c.inchikey !== inchikey)
        .sort((a, b) => b.s - a.s)
        .slice(0, 7);
      const levels = ['pathway', 'superclass', 'class'] as const;
      const scores: Record<string, Record<string, number>> = { pathway: {}, superclass: {}, class: {} };
      let total = 0;
      for (const { c, s: sim } of ranked) {
        const w = Math.max(sim, 1e-6) ** 2;
        total += w;
        for (const l of levels) scores[l][c[l]] = (scores[l][c[l]] || 0) + w;
      }
      const byLevel = Object.fromEntries(
        levels.map((l) => [l, Object.entries(scores[l]).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([label, v]) => ({ label, probability: round(v / total, 4), level: l }))]),
      ) as Record<(typeof levels)[number], TopKItem[]>;
      const features: Feature[] = [];
      for (const f of d.features) {
        if (!f.q) continue;
        const m = JSON.parse(mol.get_substruct_matches(f.q) || '[]');
        if (Array.isArray(m) && m.length) {
          const atoms = Array.from(new Set(m.flatMap((x: any) => x.atoms))).sort((a: any, b: any) => a - b) as number[];
          features.push({ name: f.name, smarts: f.smarts, count: m.length, atoms, associated_pathways: f.pathways });
        }
      }
      const maxSim = ranked[0]?.s ?? 0;
      return {
        smiles: s, canonical_smiles: mol.get_smiles(),
        model: { name: 'Similarity-weighted kNN baseline', version: '1.0', type: 'demo-knn', is_demo: true, notice: 'Demo prediction — connect NPC-BERT API', reference_set_size: d.compounds.length },
        pathway: { label: byLevel.pathway[0].label, confidence: byLevel.pathway[0].probability },
        superclass: { label: byLevel.superclass[0].label, confidence: byLevel.superclass[0].probability },
        class: { label: byLevel.class[0].label, confidence: byLevel.class[0].probability },
        top_k: byLevel.class, top_k_by_level: byLevel,
        explanation: {
          method: 'Votes of the 7 most similar reference compounds (Morgan r=2, 2048 bits, Tanimoto), weighted by similarity². Probabilities are vote shares, not calibrated model probabilities. The query itself is excluded (leave-one-out).',
          nearest_neighbors: ranked.map(({ c, s: sim }) => ({ compound_id: c.compound_id, name: c.name, similarity: round(sim, 4), pathway: c.pathway, superclass: c.superclass, class: c.class, smiles: c.canonical_smiles })),
          features, features_note: 'Structural motifs detected by SMARTS matching; descriptive only, not model weights.',
          applicability_domain: { max_similarity: round(maxSim, 4), in_domain: maxSim >= 0.35, note: 'Below 0.35 Tanimoto to every reference compound the vote is unreliable.' },
        },
        fallback_reason: null,
      };
    } finally {
      mol.delete();
    }
  }

  async similarity(smiles: string, threshold: number, limit = 50) {
    const s = this.parse(smiles);
    const d = await this.load();
    const qfp = await withMol(s, (m) => toBits(m.get_morgan_fp(FP_OPTS)));
    if (!qfp) throw new EngineError('Could not parse SMILES.');
    const results = d.compounds
      .map((c, i) => ({ c, s: tanimoto(qfp, d.fps[i]) }))
      .filter((x) => x.s >= threshold)
      .sort((a, b) => b.s - a.s)
      .slice(0, limit)
      .map(({ c, s: sim }) => this.summary(c, { similarity: round(sim, 4) }));
    return { results, method: 'RDKit.js Morgan fingerprints, exact Tanimoto (browser)', threshold, fingerprint: 'Morgan radius 2, 2048 bits' };
  }

  async substructure(query: string, limit = 100) {
    const d = await this.load();
    const rdkit = await loadRDKit();
    const q = query.trim();
    if (!q || q.length > 500) throw new EngineError('Enter a SMILES or SMARTS pattern (max 500 characters).');
    const qmol = rdkit.get_qmol(q);
    if (!qmol || !qmol.is_valid()) throw new EngineError('Could not parse substructure query (SMILES/SMARTS).');
    try {
      const results: CompoundSummary[] = [];
      d.mols.forEach((m: any, i: number) => {
        if (results.length >= limit) return;
        const match = JSON.parse(m.get_substruct_match(qmol) || '{}');
        if (match.atoms?.length) results.push(this.summary(d.compounds[i], { match_atoms: match.atoms }));
      });
      return { results };
    } finally {
      qmol.delete();
    }
  }

  statistics() { return getJSON<Statistics>('data/statistics.json'); }
  ontology() { return getJSON<Ontology>('data/ontology.json'); }

  async databases(): Promise<DatabaseInfo> {
    const d = await this.load();
    const adapters = [
      ['PubChem', 'https://pubchem.ncbi.nlm.nih.gov', 'https://pubchem.ncbi.nlm.nih.gov/docs/pug-rest', 'NCBI open chemistry database, PUG REST API.', ['name', 'pubchem_cid', 'inchikey', 'smiles', 'inchi'], false],
      ['NPAtlas', 'https://www.npatlas.org', 'https://www.npatlas.org/api/v1/docs', 'Curated microbial natural products with literature.', ['npatlas_id', 'inchikey', 'name'], false],
      ['COCONUT', 'https://coconut.naturalproducts.net', 'https://coconut.naturalproducts.net/api-documentation', 'Largest open aggregated natural-product collection.', ['coconut_id', 'inchikey', 'name'], true],
      ['LOTUS', 'https://lotus.naturalproducts.net', 'https://www.wikidata.org/wiki/Wikidata:SPARQL_query_service', 'Structure–organism pairs, queried from Wikidata.', ['inchikey'], false],
      ['ChEBI', 'https://www.ebi.ac.uk/chebi/', 'https://www.ebi.ac.uk/ols4/help', 'Chemical Entities of Biological Interest (EMBL-EBI).', ['name', 'chebi_id', 'inchikey'], false],
    ] as const;
    return {
      local: { name: 'NPE demo set', count: d.compounds.length, storage: 'static JSON (browser)' },
      remote_enabled: false,
      adapters: adapters.map(([name, homepage, api_docs, description, supports, requires_key]) => ({
        name, homepage, api_docs, description, supports: [...supports], requires_key, status: 'requires_api',
      })),
    };
  }
}
