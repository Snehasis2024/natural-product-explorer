import type { Engine } from './types';
import { EngineError } from './types';
import type { SearchParams } from '../types';

export class ApiEngine implements Engine {
  constructor(private base: string) {}

  private async req<T>(path: string, init?: RequestInit): Promise<T> {
    let res: Response;
    try {
      res = await fetch(`${this.base}${path}`, {
        ...init,
        headers: { 'Content-Type': 'application/json', ...(init?.headers || {}) },
      });
    } catch (e) {
      throw new EngineError('The API server is not reachable. Check your connection and try again.', String(e));
    }
    const body = await res.json().catch(() => null);
    if (!res.ok) {
      const detail = body?.detail;
      const msg = typeof detail === 'string' ? detail : Array.isArray(detail) ? detail.map((d: any) => d.message).join('; ') : body?.error;
      throw new EngineError(msg || `Request failed (${res.status})`, detail, res.status);
    }
    return body as T;
  }

  private post<T>(path: string, data: unknown) {
    return this.req<T>(path, { method: 'POST', body: JSON.stringify(data) });
  }

  async status() {
    const h = await this.req<any>('/api/health');
    return { mode: 'api' as const, detail: `FastAPI + RDKit · ${h.storage}${h.pgvector ? ' + pgvector' : ''}`, npc_bert: h.npc_bert_configured, compounds: h.compounds };
  }

  search(p: SearchParams) {
    const qs = new URLSearchParams();
    Object.entries(p).forEach(([k, v]) => {
      if (v === undefined || v === null || v === '') return;
      if (Array.isArray(v)) v.forEach((x) => qs.append(k, String(x)));
      else qs.set(k, String(v));
    });
    return this.req<any>(`/api/search?${qs}`);
  }
  compound(id: string) { return this.req<any>(`/api/compound/${encodeURIComponent(id)}`); }
  conformer(id: string) { return this.req<any>(`/api/compound/${encodeURIComponent(id)}/conformer`); }
  async structure(smiles: string) { return { ...(await this.post<any>('/api/compound/structure', { smiles })), engine: 'RDKit (Python API)' }; }
  predict(smiles: string) { return this.post<any>('/api/predict', { smiles }); }
  similarity(smiles: string, threshold: number, limit = 50) { return this.post<any>('/api/similarity', { smiles, threshold, limit }); }
  substructure(query: string, limit = 100) { return this.post<any>('/api/substructure', { query, limit }); }
  statistics() { return this.req<any>('/api/statistics'); }
  ontology() { return this.req<any>('/api/ontology'); }
  databases() { return this.req<any>('/api/databases'); }
}
