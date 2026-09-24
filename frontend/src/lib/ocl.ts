// In-browser 3D conformer generation for arbitrary SMILES when no API backend is available.
// OpenChemLib ConformerGenerator (torsion-library based) followed by MMFF94s+ minimisation.
let ready: Promise<any> | null = null;

async function loadOCL() {
  if (!ready) {
    ready = (async () => {
      const mod: any = await import('openchemlib');
      const OCL = mod.default ?? mod;
      // Force-field/torsion resources are emitted next to the bundle by Vite.
      await OCL.Resources.registerFromUrl();
      return OCL;
    })().catch((e) => {
      ready = null;
      throw e;
    });
  }
  return ready;
}

export async function conformerFromSmiles(smiles: string, seed = 42): Promise<{ molblock: string; method: string; energy: number | null }> {
  const OCL = await loadOCL();
  const mol = OCL.Molecule.fromSmiles(smiles);
  const gen = new OCL.ConformerGenerator(seed);
  const conf = gen.getOneConformerAsMolecule(mol);
  if (!conf) throw new Error('3D conformer generation failed for this structure');
  let energy: number | null = null;
  let method = 'OpenChemLib ConformerGenerator (in-browser)';
  try {
    const ff = new OCL.ForceFieldMMFF94(conf, 'MMFF94s+', {});
    ff.minimise({ maxIts: 4000 });
    energy = ff.getTotalEnergy();
    method += ' + MMFF94s+ minimisation';
  } catch {
    method += ' (unminimised: MMFF94 parameters unavailable)';
  }
  return { molblock: conf.toMolfile(), method, energy };
}
