"""RDKit cheminformatics core: parsing, descriptors, depiction, 3D conformers, fingerprints.

Everything here is *calculated* from the structure. Callers must label values accordingly.
"""
from __future__ import annotations

import os
import re
import sys
from dataclasses import dataclass
from functools import lru_cache
from typing import Any

from rdkit import Chem, DataStructs, RDConfig, RDLogger
from rdkit.Chem import AllChem, Crippen, Descriptors, GraphDescriptors, QED, rdMolDescriptors
from rdkit.Chem import rdFingerprintGenerator
from rdkit.Chem.Draw import rdMolDraw2D

RDLogger.DisableLog("rdApp.*")

# RDKit Contrib scorers (shipped with the rdkit wheel)
for sub in ("SA_Score", "NP_Score"):
    path = os.path.join(RDConfig.RDContribDir, sub)
    if path not in sys.path:
        sys.path.append(path)
try:  # pragma: no cover - availability depends on wheel layout
    import sascorer  # type: ignore
    import npscorer  # type: ignore

    _NP_MODEL = npscorer.readNPModel()
except Exception:  # noqa: BLE001
    sascorer = None
    npscorer = None
    _NP_MODEL = None

MAX_SMILES_LENGTH = 2000
MAX_HEAVY_ATOMS = 250
FP_RADIUS = 2
FP_BITS = 2048

_SMILES_CHARS = re.compile(r"^[A-Za-z0-9@+\-\[\]\(\)=#$:/\\.%*~&!;,]+$")
INCHIKEY_RE = re.compile(r"^[A-Z]{14}-[A-Z]{10}-[A-Z]$")
CID_RE = re.compile(r"^(?:CID[:\s]?)?(\d{1,10})$", re.IGNORECASE)
NPATLAS_RE = re.compile(r"^NPA\d{6}$", re.IGNORECASE)
COCONUT_RE = re.compile(r"^CNP\d{7}(?:\.\d+)?$", re.IGNORECASE)
CHEBI_RE = re.compile(r"^CHEBI:\d+$", re.IGNORECASE)

_morgan_gen = rdFingerprintGenerator.GetMorganGenerator(radius=FP_RADIUS, fpSize=FP_BITS)


class ChemError(ValueError):
    """Raised for invalid or unsupported chemical input."""


@dataclass(frozen=True)
class QueryType:
    kind: str  # smiles | inchi | inchikey | pubchem_cid | npatlas_id | coconut_id | chebi_id | name
    value: str


def clean_text(value: str, max_len: int = 4000) -> str:
    """Strip control characters and surrounding whitespace."""
    value = "".join(ch for ch in value if ch.isprintable())
    return value.strip()[:max_len]


def detect_query_type(query: str) -> QueryType:
    q = clean_text(query, 4000)
    if q.startswith("InChI="):
        return QueryType("inchi", q)
    if INCHIKEY_RE.match(q):
        return QueryType("inchikey", q)
    if NPATLAS_RE.match(q):
        return QueryType("npatlas_id", q.upper())
    if COCONUT_RE.match(q):
        return QueryType("coconut_id", q.upper())
    if CHEBI_RE.match(q):
        return QueryType("chebi_id", q.upper())
    m = CID_RE.match(q)
    if m:
        return QueryType("pubchem_cid", m.group(1))
    if " " not in q and len(q) > 1 and _SMILES_CHARS.match(q):
        # Ordinary names ("caffeine", "Taxol") are not valid SMILES; element-only
        # strings such as "CCO" are, and are deliberately treated as structures.
        if _quiet_parse(q) is not None:
            return QueryType("smiles", q)
    return QueryType("name", q)


def _quiet_parse(smiles: str) -> Chem.Mol | None:
    try:
        return Chem.MolFromSmiles(smiles)
    except Exception:  # noqa: BLE001
        return None


def parse_smiles(smiles: str) -> Chem.Mol:
    s = clean_text(smiles, MAX_SMILES_LENGTH + 1)
    if not s:
        raise ChemError("SMILES string is empty.")
    if len(s) > MAX_SMILES_LENGTH:
        raise ChemError(f"SMILES exceeds the maximum length of {MAX_SMILES_LENGTH} characters.")
    if not _SMILES_CHARS.match(s):
        raise ChemError("SMILES contains characters that are not allowed.")
    mol = Chem.MolFromSmiles(s)  # full sanitisation + stereo perception (incl. E/Z from / \ bonds)
    if mol is None:
        raw = Chem.MolFromSmiles(s, sanitize=False)
        if raw is None:
            raise ChemError("Could not parse SMILES: syntax error.")
        try:  # re-run sanitisation only to obtain a readable error message
            Chem.SanitizeMol(raw)
        except Exception as exc:  # noqa: BLE001 - RDKit raises several sanitisation errors
            raise ChemError(f"Invalid chemistry: {exc}") from exc
        raise ChemError("Invalid chemistry.")
    if mol.GetNumAtoms() == 0:
        raise ChemError("SMILES contains no atoms.")
    if mol.GetNumHeavyAtoms() > MAX_HEAVY_ATOMS:
        raise ChemError(f"Molecule exceeds {MAX_HEAVY_ATOMS} heavy atoms.")
    return mol


def parse_inchi(inchi: str) -> Chem.Mol:
    mol = Chem.MolFromInchi(clean_text(inchi), sanitize=True)
    if mol is None:
        raise ChemError("Could not parse InChI.")
    return mol


def parse_smarts(smarts: str) -> Chem.Mol:
    s = clean_text(smarts, 500)
    if not s:
        raise ChemError("Query is empty.")
    patt = Chem.MolFromSmarts(s)
    if patt is None:
        raise ChemError("Could not parse substructure query (SMILES/SMARTS).")
    return patt


def identifiers(mol: Chem.Mol) -> dict[str, str]:
    inchi = Chem.MolToInchi(mol) or ""
    return {
        "canonical_smiles": Chem.MolToSmiles(mol),
        "inchi": inchi,
        "inchikey": Chem.InchiToInchiKey(inchi) if inchi else "",
    }


def stereocenters(mol: Chem.Mol) -> dict[str, int]:
    info = Chem.FindMolChiralCenters(mol, includeUnassigned=True, useLegacyImplementation=False)
    assigned = sum(1 for _, label in info if label in ("R", "S"))
    stereo_bonds = sum(
        1 for b in mol.GetBonds() if b.GetStereo() in (Chem.BondStereo.STEREOE, Chem.BondStereo.STEREOZ)
    )
    return {"total": len(info), "assigned": assigned, "unassigned": len(info) - assigned, "double_bonds_ez": stereo_bonds}


def lipinski(props: dict[str, Any]) -> dict[str, Any]:
    rules = [
        {"rule": "Molecular weight ≤ 500 Da", "value": props["molecular_weight"], "limit": 500, "pass": props["molecular_weight"] <= 500},
        {"rule": "LogP ≤ 5", "value": props["logp"], "limit": 5, "pass": props["logp"] <= 5},
        {"rule": "H-bond donors ≤ 5", "value": props["hbd"], "limit": 5, "pass": props["hbd"] <= 5},
        {"rule": "H-bond acceptors ≤ 10", "value": props["hba"], "limit": 10, "pass": props["hba"] <= 10},
    ]
    violations = sum(1 for r in rules if not r["pass"])
    return {"rules": rules, "violations": violations, "pass": violations <= 1}


def veber(props: dict[str, Any]) -> dict[str, Any]:
    ok_rot = props["rotatable_bonds"] <= 10
    ok_tpsa = props["tpsa"] <= 140
    return {
        "rules": [
            {"rule": "Rotatable bonds ≤ 10", "value": props["rotatable_bonds"], "limit": 10, "pass": ok_rot},
            {"rule": "TPSA ≤ 140 Å²", "value": props["tpsa"], "limit": 140, "pass": ok_tpsa},
        ],
        "pass": ok_rot and ok_tpsa,
    }


def compute_properties(mol: Chem.Mol) -> dict[str, Any]:
    stereo = stereocenters(mol)
    props: dict[str, Any] = {
        "formula": rdMolDescriptors.CalcMolFormula(mol),
        "molecular_weight": round(Descriptors.MolWt(mol), 3),
        "exact_mass": round(rdMolDescriptors.CalcExactMolWt(mol), 5),
        "logp": round(Crippen.MolLogP(mol), 3),
        "tpsa": round(rdMolDescriptors.CalcTPSA(mol), 2),
        "hbd": rdMolDescriptors.CalcNumHBD(mol),
        "hba": rdMolDescriptors.CalcNumHBA(mol),
        "rotatable_bonds": rdMolDescriptors.CalcNumRotatableBonds(mol),
        "rings": rdMolDescriptors.CalcNumRings(mol),
        "aromatic_rings": rdMolDescriptors.CalcNumAromaticRings(mol),
        "heavy_atoms": mol.GetNumHeavyAtoms(),
        "formal_charge": Chem.GetFormalCharge(mol),
        "stereocenters": stereo["total"],
        "stereocenters_unassigned": stereo["unassigned"],
        "fsp3": round(rdMolDescriptors.CalcFractionCSP3(mol), 3),
        "molar_refractivity": round(Crippen.MolMR(mol), 2),
        "complexity_bertz": round(GraphDescriptors.BertzCT(mol), 1),
        "qed": round(QED.qed(mol), 3),
        "sa_score": round(sascorer.calculateScore(mol), 2) if sascorer else None,
        "np_likeness": round(npscorer.scoreMol(mol, _NP_MODEL), 2) if npscorer and _NP_MODEL else None,
    }
    props["lipinski"] = lipinski(props)
    props["veber"] = veber(props)
    return props


def depict_svg(mol: Chem.Mol, width: int = 420, height: int = 320, highlight: list[int] | None = None) -> str:
    m = Chem.Mol(mol)
    AllChem.Compute2DCoords(m)
    drawer = rdMolDraw2D.MolDraw2DSVG(width, height)
    opts = drawer.drawOptions()
    opts.clearBackground = False
    opts.addStereoAnnotation = True
    rdMolDraw2D.PrepareAndDrawMolecule(drawer, m, highlightAtoms=highlight or [])
    drawer.FinishDrawing()
    return drawer.GetDrawingText()


def molblock_2d(mol: Chem.Mol) -> str:
    m = Chem.Mol(mol)
    AllChem.Compute2DCoords(m)
    return Chem.MolToMolBlock(m)


@lru_cache(maxsize=512)
def conformer_3d(canonical_smiles: str, seed: int = 0xF00D) -> dict[str, Any]:
    """ETKDGv3 embedding + MMFF94 (fallback UFF) optimisation. Cached by canonical SMILES."""
    mol = Chem.AddHs(Chem.MolFromSmiles(canonical_smiles))
    params = AllChem.ETKDGv3()
    params.randomSeed = seed
    params.maxIterations = 2000
    status = AllChem.EmbedMolecule(mol, params)
    if status != 0:
        params.useRandomCoords = True
        status = AllChem.EmbedMolecule(mol, params)
    if status != 0:
        raise ChemError("3D embedding failed for this structure.")
    method = "RDKit ETKDGv3"
    energy = None
    try:
        if AllChem.MMFFHasAllMoleculeParams(mol):
            props = AllChem.MMFFGetMoleculeProperties(mol)
            ff = AllChem.MMFFGetMoleculeForceField(mol, props)
            ff.Minimize(maxIts=2000)
            energy = ff.CalcEnergy()
            method += " + MMFF94 minimisation"
        else:
            ff = AllChem.UFFGetMoleculeForceField(mol)
            ff.Minimize(maxIts=2000)
            energy = ff.CalcEnergy()
            method += " + UFF minimisation"
    except Exception:  # noqa: BLE001
        method += " (unminimised)"
    molblock = Chem.MolToMolBlock(mol)
    return {
        "molblock": molblock,
        "partial_charges": gasteiger_charges(mol),
        "sdf": molblock + "$$$$\n",
        "method": method,
        "energy_kcal_mol": round(energy, 3) if energy is not None else None,
        "num_atoms_with_h": mol.GetNumAtoms(),
    }


def gasteiger_charges(mol: Chem.Mol) -> list[float]:
    """Gasteiger–Marsili partial charges, one per atom in molblock order (NaN → 0)."""
    m = Chem.Mol(mol)
    AllChem.ComputeGasteigerCharges(m)
    out = []
    for a in m.GetAtoms():
        q = a.GetDoubleProp("_GasteigerCharge") if a.HasProp("_GasteigerCharge") else 0.0
        out.append(round(q, 4) if q == q and abs(q) != float("inf") else 0.0)
    return out


def morgan_fp(mol: Chem.Mol) -> DataStructs.ExplicitBitVect:
    return _morgan_gen.GetFingerprint(mol)


def fp_to_bitstring(fp: DataStructs.ExplicitBitVect) -> str:
    return fp.ToBitString()


def tanimoto_bulk(query: DataStructs.ExplicitBitVect, fps: list[DataStructs.ExplicitBitVect]) -> list[float]:
    return list(DataStructs.BulkTanimotoSimilarity(query, fps))


def structure_record(mol: Chem.Mol, input_smiles: str | None = None, with_3d: bool = True) -> dict[str, Any]:
    ids = identifiers(mol)
    record: dict[str, Any] = {"smiles": input_smiles or ids["canonical_smiles"], **ids, **compute_properties(mol)}
    record["molblock_2d"] = molblock_2d(mol)
    record["svg"] = depict_svg(mol)
    if with_3d:
        conf = conformer_3d(ids["canonical_smiles"])
        record.update({
            "molblock": conf["molblock"], "sdf": conf["sdf"],
            "conformer": {k: conf[k] for k in ("method", "energy_kcal_mol", "num_atoms_with_h", "partial_charges")},
        })
    return record
