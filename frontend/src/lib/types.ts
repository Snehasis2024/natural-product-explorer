export type Provenance = 'experimental' | 'database' | 'calculated' | 'predicted' | 'curated' | 'demo';

export interface RuleCheck { rule: string; value: number; limit: number; pass: boolean }

export interface Properties {
  formula: string;
  molecular_weight: number;
  exact_mass: number;
  logp: number;
  tpsa: number;
  hbd: number;
  hba: number;
  rotatable_bonds: number;
  rings: number;
  aromatic_rings: number;
  heavy_atoms: number;
  formal_charge: number;
  stereocenters: number;
  stereocenters_unassigned: number;
  fsp3: number;
  molar_refractivity: number;
  complexity_bertz: number | null;
  qed: number | null;
  sa_score: number | null;
  np_likeness: number | null;
  lipinski: { rules: RuleCheck[]; violations: number; pass: boolean };
  veber: { rules: RuleCheck[]; pass: boolean };
}

export interface Organism {
  name: string | null;
  kingdom: string | null;
  phylum: string | null;
  family: string | null;
  genus: string | null;
  species: string | null;
  geographic_origin: string | null;
}

export interface Reference {
  authors?: string;
  title?: string | null;
  journal?: string;
  year?: number;
  volume?: string;
  pages?: string;
  doi?: string | null;
}

export interface Compound {
  compound_id: string;
  name: string;
  smiles: string;
  canonical_smiles: string;
  inchi: string;
  inchikey: string;
  formula: string;
  molecular_weight: number;
  exact_mass: number;
  properties: Properties;
  pathway: string;
  superclass: string;
  class: string;
  organism: Organism | null;
  database: string;
  database_id: string;
  external_ids: Record<string, string | null>;
  literature: Reference[];
  source_url: string;
  description: string | null;
  biosynthesis: string | null;
  conformer_method: string;
  is_demo: boolean;
  provenance: Record<string, Provenance>;
}

export interface CompoundSummary {
  compound_id: string;
  name: string;
  formula: string;
  molecular_weight: number;
  canonical_smiles: string;
  pathway: string;
  superclass: string;
  class: string;
  database: string;
  organism: string | null;
  logp: number;
  tpsa: number;
  is_demo?: boolean;
  similarity?: number;
  match_type?: string;
  match_atoms?: number[];
}

export interface SearchParams {
  q?: string;
  pathway?: string[];
  superclass?: string[];
  class?: string[];
  kingdom?: string[];
  database?: string[];
  organism?: string;
  mw_min?: number; mw_max?: number;
  logp_min?: number; logp_max?: number;
  tpsa_min?: number; tpsa_max?: number;
  sort?: string;
  order?: 'asc' | 'desc';
  page?: number;
  page_size?: number;
  remote?: boolean;
}

export interface SearchResponse {
  query: string;
  query_type: string;
  total: number;
  page: number;
  page_size: number;
  pages: number;
  results: CompoundSummary[];
  facets: Record<string, Record<string, number>>;
  structure: { canonical_smiles: string; inchikey: string; valid: boolean } | null;
  message: string | null;
  external: { enabled: boolean; message?: string; results?: any[]; sources?: { name: string; count: number; error: string | null }[] } | null;
}

export interface StructureResult extends Properties {
  smiles: string;
  canonical_smiles: string;
  inchi: string;
  inchikey: string;
  molblock: string | null;
  conformer: { method: string; energy_kcal_mol: number | null; num_atoms_with_h: number; partial_charges?: number[] | null } | null;
  engine: string;
  provenance: Provenance;
}

export interface Prediction { label: string; confidence: number }
export interface TopKItem { label: string; probability: number; level: 'pathway' | 'superclass' | 'class' }
export interface Feature { name: string; smarts: string; count: number; atoms: number[]; associated_pathways: string[] }
export interface Neighbor { compound_id: string; name: string; similarity: number; pathway: string; superclass: string; class: string; smiles: string }

export interface PredictionResult {
  smiles: string;
  canonical_smiles: string;
  model: { name: string; version: string; type: 'npc-bert' | 'demo-knn'; is_demo: boolean; notice: string; reference_set_size: number | null };
  pathway: Prediction;
  superclass: Prediction;
  class: Prediction;
  top_k: TopKItem[];
  top_k_by_level: Record<'pathway' | 'superclass' | 'class', TopKItem[]>;
  explanation: {
    method?: string;
    nearest_neighbors?: Neighbor[];
    features?: Feature[];
    features_note?: string;
    applicability_domain?: { max_similarity: number; in_domain: boolean; note: string };
    note?: string;
  };
  fallback_reason?: string | null;
}

export interface SimilarityResponse { results: CompoundSummary[]; method: string; threshold: number; fingerprint: string }
export interface SubstructureResponse { results: CompoundSummary[] }

export interface HistBin { bin_start: number; bin_end: number; count: number }
export interface Statistics {
  total_compounds: number;
  pathway_distribution: { label: string; count: number }[];
  superclass_distribution: { label: string; count: number }[];
  class_distribution: { label: string; count: number }[];
  kingdom_distribution: { label: string; count: number }[];
  molecular_weight_histogram: HistBin[];
  logp_histogram: HistBin[];
  tpsa_histogram: HistBin[];
  chemical_space: {
    fingerprint: string;
    methods: string[];
    pca_explained_variance: number[];
    points: { compound_id: string; name: string; smiles: string; pathway: string; superclass: string; class: string; molecular_weight: number; pca: [number, number]; tsne?: [number, number] }[];
  };
}

export interface OntologyClass { name: string; level: 'class'; count: number; description: string | null; representatives: { compound_id: string; name: string; smiles: string }[]; organisms: string[]; related_pathways: string[] }
export interface OntologySuperclass { name: string; level: 'superclass'; count: number; description: string | null; children: OntologyClass[] }
export interface OntologyPathway { name: string; level: 'pathway'; count: number; description: string | null; precursors: string[]; children: OntologySuperclass[] }
export interface Ontology { provenance: string; pathways: OntologyPathway[] }

export interface DatabaseInfo {
  local: { name: string; count: number; storage: string; meta?: Record<string, unknown> };
  remote_enabled: boolean;
  adapters: { name: string; homepage: string; api_docs: string; description: string; supports: string[]; requires_key: boolean; status: string }[];
}

export interface EngineStatus { mode: 'api' | 'browser'; detail: string; npc_bert: boolean; compounds: number }
