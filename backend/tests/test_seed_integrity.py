"""The demo dataset must be internally consistent: recomputing from SMILES reproduces the stored values."""
import json
from pathlib import Path

from rdkit import Chem

SEED = Path(__file__).resolve().parents[2] / "database" / "seed" / "compounds.json"

# Standard InChIKeys of reference compounds (independent check of curated structures incl. stereochemistry)
REFERENCE_KEYS = {
    "caffeine": "RYYVLZVUVIJVGH-UHFFFAOYSA-N", "curcumin": "VFLDPWHFBUODDF-FCXRPNKRSA-N",
    "quercetin": "REFJWTPEDVJJIY-UHFFFAOYSA-N", "resveratrol": "LUKBXSAWLPMMSZ-OWOJBTEDSA-N",
    "paclitaxel": "RCINICONZNJXQF-MZXODVADSA-N", "artemisinin": "BLUAFEHZUWYNDE-NNWCWBAJSA-N",
    "penicillin_g": "JGSARLDLIJGVTE-MBNYWOFBSA-N", "vancomycin": "MYPYJXKWCTUITO-LYRMYLQWSA-N",
    "strychnine": "QMGVPVSNSZLJIA-FVWCLLPLSA-N", "morphine": "BQJCRHHNABKAKU-KBQPJGBKSA-N",
}


def test_seed_consistency():
    data = json.loads(SEED.read_text())["compounds"]
    keys = set()
    for r in data:
        mol = Chem.MolFromSmiles(r["smiles"])
        assert mol is not None, r["compound_id"]
        assert Chem.MolToInchiKey(mol) == r["inchikey"]
        assert r["inchikey"] not in keys
        keys.add(r["inchikey"])
        assert r["pathway"] and r["superclass"] and r["class"]
        assert r["is_demo"] is True and r["provenance"]["properties"] == "calculated"
    by_id = {r["compound_id"]: r for r in data}
    for cid, key in REFERENCE_KEYS.items():
        assert by_id[cid]["inchikey"] == key, cid
