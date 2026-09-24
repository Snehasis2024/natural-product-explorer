// Lazy singleton loader for RDKit.js (WebAssembly build of RDKit MinimalLib), bundled locally.
import initRDKitModule from '@rdkit/rdkit';
import wasmUrl from '@rdkit/rdkit/RDKit_minimal.wasm?url';

export type RDKitModule = any;
export type RDMol = any;

let promise: Promise<RDKitModule> | null = null;

export function loadRDKit(): Promise<RDKitModule> {
  if (!promise) {
    promise = (initRDKitModule as any)({ locateFile: () => wasmUrl }).catch((err: unknown) => {
      promise = null;
      throw new Error(`RDKit.js failed to load (WebAssembly): ${String(err)}`);
    });
  }
  return promise!;
}

/** Run fn with a molecule and always free the WASM memory afterwards. */
export async function withMol<T>(smiles: string, fn: (mol: RDMol, rdkit: RDKitModule) => T): Promise<T | null> {
  const rdkit = await loadRDKit();
  const mol = rdkit.get_mol(smiles);
  if (!mol) return null;
  try {
    if (!mol.is_valid()) return null;
    return fn(mol, rdkit);
  } finally {
    mol.delete();
  }
}

const svgCache = new Map<string, string>();

export async function depict(smiles: string, width = 320, height = 240, highlight: number[] = []): Promise<string | null> {
  const key = `${smiles}|${width}|${height}|${highlight.join(',')}`;
  const hit = svgCache.get(key);
  if (hit) return hit;
  const svg = await withMol(smiles, (mol) =>
    mol.get_svg_with_highlights(
      JSON.stringify({
        width, height, atoms: highlight, bondLineWidth: 1.4, addStereoAnnotation: true,
        highlightColour: [0.27, 0.76, 0.69], backgroundColour: [1, 1, 1, 0],
      }),
    ),
  );
  if (svg) {
    if (svgCache.size > 400) svgCache.clear();
    svgCache.set(key, svg);
  }
  return svg;
}
