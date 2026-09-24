#!/usr/bin/env python3
"""Build the demo dataset from curated sources.

Inputs  (hand-curated):  database/seed/curated_compounds.csv, annotations.json, ontology.json
Outputs (generated):     database/seed/compounds.json            – unified-schema records
                         database/seed/conformers/<id>.mol       – RDKit ETKDGv3+MMFF94 3D conformers
                         frontend/public/data/*                  – static copy for browser-only mode

Every property is calculated with RDKit from the curated SMILES; the script never invents
identifiers. Run from the repository root:  python database/scripts/build_seed.py
"""
from __future__ import annotations

import csv
import json
import shutil
import sys
from datetime import date
from pathlib import Path

import rdkit
from rdkit import Chem

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "backend"))

from app import analytics, chem  # noqa: E402

SEED = ROOT / "database" / "seed"
FRONT_DATA = ROOT / "frontend" / "public" / "data"


def main() -> None:
    annotations = json.loads((SEED / "annotations.json").read_text())["compounds"]
    ontology = json.loads((SEED / "ontology.json").read_text())
    rows = list(csv.DictReader((SEED / "curated_compounds.csv").open()))

    conf_dir = SEED / "conformers"
    conf_dir.mkdir(exist_ok=True)
    records = []
    seen_keys: dict[str, str] = {}
    for row in rows:
        slug = row["slug"]
        mol = chem.parse_smiles(row["smiles"])
        ids = chem.identifiers(mol)
        if ids["inchikey"] in seen_keys:
            raise SystemExit(f"Duplicate structure: {slug} == {seen_keys[ids['inchikey']]}")
        seen_keys[ids["inchikey"]] = slug
        props = chem.compute_properties(mol)
        conf = chem.conformer_3d(ids["canonical_smiles"])
        (conf_dir / f"{slug}.mol").write_text(conf["molblock"])
        (conf_dir / f"{slug}.charges.json").write_text(json.dumps(conf["partial_charges"]))

        ann = annotations.get(slug, {})
        cid = row["pubchem_cid"] or None
        external_ids = {
            "pubchem_cid": cid,
            "chebi_id": row["chebi_id"] or None,
            "npatlas_id": None,
            "coconut_id": None,
        }
        source_url = (
            f"https://pubchem.ncbi.nlm.nih.gov/compound/{cid}"
            if cid
            else f"https://pubchem.ncbi.nlm.nih.gov/#query={ids['inchikey']}"
        )
        organism = None
        if row["organism"] or row["kingdom"]:
            organism = {
                "name": row["organism"] or None,
                "kingdom": row["kingdom"] or None,
                "phylum": row["phylum"] or None,
                "family": row["family"] or None,
                "genus": row["genus"] or None,
                "species": row["species"] or None,
                "geographic_origin": row["geographic_origin"] or None,
            }
        records.append(
            {
                "compound_id": slug,
                "name": row["name"],
                "smiles": row["smiles"],
                **ids,
                "formula": props["formula"],
                "molecular_weight": props["molecular_weight"],
                "exact_mass": props["exact_mass"],
                "properties": props,
                "pathway": row["pathway"],
                "superclass": row["superclass"],
                "class": row["np_class"],
                "organism": organism,
                "database": "NPE demo set",
                "database_id": slug,
                "external_ids": external_ids,
                "literature": ann.get("literature", []),
                "source_url": source_url,
                "description": ann.get("description"),
                "biosynthesis": ann.get("biosynthesis"),
                "conformer_method": conf["method"],
                "is_demo": True,
                "provenance": {
                    "structure": "curated",
                    "identifiers": "calculated",
                    "properties": "calculated",
                    "classification": "curated",
                    "organism": "curated",
                    "external_ids": "curated",
                    "literature": "curated",
                    "conformer": "calculated",
                },
            }
        )
        stereo = Chem.FindMolChiralCenters(mol, useLegacyImplementation=False)
        if slug == "carvone":
            print(f"  carvone CIP: {stereo}")

    meta = {
        "generated": date.today().isoformat(),
        "rdkit_version": rdkit.__version__,
        "count": len(records),
        "fingerprint": f"Morgan radius {chem.FP_RADIUS}, {chem.FP_BITS} bits",
        "notice": "Demo dataset: curated structures and annotations; all properties calculated with RDKit.",
    }
    (SEED / "compounds.json").write_text(json.dumps({"meta": meta, "compounds": records}, indent=1, ensure_ascii=False))
    print(f"Wrote {len(records)} records to {SEED / 'compounds.json'}")

    # Static bundle for the browser-only deployment (GitHub Pages / artifact)
    stats = analytics.compute_statistics(records)
    ont = analytics.build_ontology(records, ontology)
    FRONT_DATA.mkdir(parents=True, exist_ok=True)
    slim = [{k: v for k, v in r.items()} for r in records]
    (FRONT_DATA / "compounds.json").write_text(json.dumps({"meta": meta, "compounds": slim}, ensure_ascii=False))
    (FRONT_DATA / "statistics.json").write_text(json.dumps(stats, ensure_ascii=False))
    (FRONT_DATA / "ontology.json").write_text(json.dumps(ont, ensure_ascii=False))
    shutil.copy(SEED / "np_features.json", FRONT_DATA / "np_features.json")
    front_conf = FRONT_DATA / "conformers"
    if front_conf.exists():
        shutil.rmtree(front_conf)
    shutil.copytree(conf_dir, front_conf)
    print(f"Exported static data to {FRONT_DATA}")


if __name__ == "__main__":
    main()
