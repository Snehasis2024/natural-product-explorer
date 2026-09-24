import { loadRDKit } from './rdkit';

export type QueryKind = 'smiles' | 'inchi' | 'inchikey' | 'pubchem_cid' | 'npatlas_id' | 'coconut_id' | 'chebi_id' | 'name';

export const QUERY_LABELS: Record<string, string> = {
  smiles: 'SMILES', inchi: 'InChI', inchikey: 'InChIKey', pubchem_cid: 'PubChem CID', npatlas_id: 'NPAtlas ID',
  coconut_id: 'COCONUT ID', chebi_id: 'ChEBI ID', name: 'Name / text', all: 'All',
};

const SMILES_CHARS = /^[A-Za-z0-9@+\-[\]()=#$:/\\.%*~&!;,]+$/;

/** Pattern-only classification (synchronous); SMILES needs a parse to confirm. */
export function guessQueryKind(q: string): QueryKind | 'maybe-smiles' {
  const s = q.trim();
  if (s.startsWith('InChI=')) return 'inchi';
  if (/^[A-Z]{14}-[A-Z]{10}-[A-Z]$/.test(s)) return 'inchikey';
  if (/^NPA\d{6}$/i.test(s)) return 'npatlas_id';
  if (/^CNP\d{7}(\.\d+)?$/i.test(s)) return 'coconut_id';
  if (/^CHEBI:\d+$/i.test(s)) return 'chebi_id';
  if (/^(CID[:\s]?)?\d{1,10}$/i.test(s)) return 'pubchem_cid';
  // Pure words that use letters outside organic-subset SMILES (e.g. "artemisinin") are names.
  if (/^[A-Za-z]+$/.test(s) && /[^BCNOPSFIbcnopslr]/.test(s)) return 'name';
  if (!s.includes(' ') && s.length > 1 && SMILES_CHARS.test(s)) return 'maybe-smiles';
  return 'name';
}

export async function detectQueryType(q: string): Promise<{ kind: QueryKind; value: string }> {
  const s = q.trim();
  const g = guessQueryKind(s);
  if (g === 'pubchem_cid') return { kind: g, value: s.replace(/^CID[:\s]?/i, '') };
  if (g === 'npatlas_id' || g === 'coconut_id' || g === 'chebi_id') return { kind: g, value: s.toUpperCase() };
  if (g !== 'maybe-smiles') return { kind: g, value: s };
  const rdkit = await loadRDKit();
  const mol = rdkit.get_mol(s);
  const ok = !!mol && mol.is_valid();
  mol?.delete?.();
  return { kind: ok ? 'smiles' : 'name', value: s };
}
