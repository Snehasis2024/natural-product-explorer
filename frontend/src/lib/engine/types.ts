import type {
  Compound, DatabaseInfo, EngineStatus, Ontology, PredictionResult, SearchParams, SearchResponse,
  SimilarityResponse, Statistics, StructureResult, SubstructureResponse,
} from '../types';

/** One interface, two implementations: the FastAPI backend, or RDKit.js running in the browser. */
export interface Engine {
  status(): Promise<EngineStatus>;
  search(p: SearchParams): Promise<SearchResponse>;
  compound(id: string): Promise<Compound>;
  conformer(id: string): Promise<{ molblock: string; method: string; partial_charges: number[] | null }>;
  structure(smiles: string): Promise<StructureResult>;
  predict(smiles: string): Promise<PredictionResult>;
  similarity(smiles: string, threshold: number, limit?: number): Promise<SimilarityResponse>;
  substructure(query: string, limit?: number): Promise<SubstructureResponse>;
  statistics(): Promise<Statistics>;
  ontology(): Promise<Ontology>;
  databases(): Promise<DatabaseInfo>;
}

export class EngineError extends Error {
  constructor(message: string, public detail?: unknown, public status?: number) {
    super(message);
  }
}
