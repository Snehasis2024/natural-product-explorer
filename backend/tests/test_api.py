"""API and chemistry tests. Run from backend/:  pytest -q"""
import pytest
from fastapi.testclient import TestClient

from app import chem
from app.main import app


@pytest.fixture(scope="module")
def client():
    with TestClient(app) as c:
        yield c


# ---------- chemistry core ----------
@pytest.mark.parametrize("smiles,formula,mw", [
    ("Cn1cnc2c1c(=O)n(C)c(=O)n2C", "C8H10N4O2", 194.19),
    ("COc1cc(/C=C/C(=O)CC(=O)/C=C/c2ccc(O)c(OC)c2)ccc1O", "C21H20O6", 368.38),
    ("O=c1c(O)c(-c2ccc(O)c(O)c2)oc2cc(O)cc(O)c12", "C15H10O7", 302.24),
])
def test_properties(smiles, formula, mw):
    p = chem.compute_properties(chem.parse_smiles(smiles))
    assert p["formula"] == formula
    assert p["molecular_weight"] == pytest.approx(mw, abs=0.01)


@pytest.mark.parametrize("bad", ["", "C1CC((", "c1cccc1", "C" * 2100, "CC<script>"])
def test_invalid_smiles(bad):
    with pytest.raises(chem.ChemError):
        chem.parse_smiles(bad)


@pytest.mark.parametrize("query,kind", [
    ("caffeine", "name"), ("CCO", "smiles"), ("2519", "pubchem_cid"), ("CID 2519", "pubchem_cid"),
    ("RYYVLZVUVIJVGH-UHFFFAOYSA-N", "inchikey"), ("InChI=1S/CH4/h1H4", "inchi"),
    ("NPA012345", "npatlas_id"), ("CNP0123456", "coconut_id"), ("CHEBI:27732", "chebi_id"),
])
def test_query_detection(query, kind):
    assert chem.detect_query_type(query).kind == kind


def test_conformer_3d_has_hydrogens_and_z():
    conf = chem.conformer_3d("Cn1cnc2c1c(=O)n(C)c(=O)n2C")
    assert "MMFF94" in conf["method"]
    assert conf["num_atoms_with_h"] == 24
    zs = [float(line[20:30]) for line in conf["molblock"].splitlines()[4:28]]
    assert any(abs(z) > 0.1 for z in zs)


# ---------- API ----------
def test_health(client):
    assert client.get("/api/health").json()["compounds"] >= 70


def test_search_name_and_filters(client):
    d = client.get("/api/search", params={"q": "caffeine"}).json()
    assert d["results"][0]["compound_id"] == "caffeine"
    d = client.get("/api/search", params={"pathway": "Alkaloids", "mw_max": 200, "sort": "molecular_weight"}).json()
    assert all(r["pathway"] == "Alkaloids" and r["molecular_weight"] <= 200 for r in d["results"])
    assert [r["molecular_weight"] for r in d["results"]] == sorted(r["molecular_weight"] for r in d["results"])


def test_search_pagination(client):
    d = client.get("/api/search", params={"page_size": 10, "page": 2}).json()
    assert d["page"] == 2 and len(d["results"]) == 10 and d["pages"] == -(-d["total"] // 10)


def test_structure_endpoint(client):
    r = client.post("/api/compound/structure", json={"smiles": "Cn1cnc2c1c(=O)n(C)c(=O)n2C"})
    assert r.status_code == 200
    d = r.json()
    assert d["inchikey"] == "RYYVLZVUVIJVGH-UHFFFAOYSA-N" and d["molblock"] and d["svg"].startswith("<?xml")
    assert d["lipinski"]["violations"] == 0


def test_structure_invalid(client):
    r = client.post("/api/compound/structure", json={"smiles": "C1CC(("})
    assert r.status_code == 422 and r.json()["error"] == "Invalid chemical input"
    assert client.post("/api/compound/structure", json={"smiles": ""}).status_code == 422


def test_predict_demo_label(client):
    d = client.post("/api/predict", json={"smiles": "O=c1cc(-c2ccc(O)cc2)oc2cc(O)cc(O)c12"}).json()
    assert d["model"]["is_demo"] is True and d["model"]["notice"] == "Demo prediction — connect NPC-BERT API"
    assert d["superclass"]["label"] == "Flavonoids"
    assert 0 <= d["class"]["confidence"] <= 1 and len(d["top_k"]) >= 1
    # leave-one-out: apigenin itself must not be among its own neighbours
    assert all(n["compound_id"] != "apigenin" for n in d["explanation"]["nearest_neighbors"])


def test_npc_bert_normalisation():
    from app.predict import NPCBertClient
    out = NPCBertClient.normalise({
        "pathway": {"label": "Terpenoids", "confidence": 0.98},
        "superclass": {"label": "Sesquiterpenoids", "confidence": 0.95},
        "class": {"label": "Cadinane sesquiterpenoids", "confidence": 0.9},
        "top_k": [{"label": "Cadinane sesquiterpenoids", "confidence": 0.9}, {"label": "Germacranes", "confidence": 0.05}],
    }, "x", "x")
    assert out["model"]["is_demo"] is False and out["class"]["label"] == "Cadinane sesquiterpenoids"
    assert out["top_k"][1]["probability"] == 0.05


def test_similarity_substructure_exact_compare(client):
    d = client.post("/api/similarity", json={"smiles": "O=c1c(O)c(-c2ccc(O)c(O)c2)oc2cc(O)cc(O)c12", "threshold": 0.7}).json()
    assert d["results"][0]["compound_id"] == "quercetin" and all(r["similarity"] >= 0.7 for r in d["results"])
    d = client.post("/api/substructure", json={"query": "O=C1CCN1"}).json()
    assert [r["compound_id"] for r in d["results"]] == ["penicillin_g"]
    d = client.post("/api/exact", json={"smiles": "CN1C=NC2=C1C(=O)N(C(=O)N2C)C"}).json()
    assert d["results"][0]["compound_id"] == "caffeine"
    d = client.post("/api/compare", json={"ids": ["quercetin", "kaempferol"]}).json()
    assert d["similarity_matrix"][0][0] == 1.0
    assert client.post("/api/compare", json={"ids": ["quercetin"]}).status_code == 422
    assert client.post("/api/compare", json={"ids": ["quercetin", "unknown"]}).status_code == 404


def test_statistics_and_ontology(client):
    s = client.get("/api/statistics").json()
    assert sum(p["count"] for p in s["pathway_distribution"]) == s["total_compounds"]
    assert len(s["chemical_space"]["points"]) == s["total_compounds"]
    o = client.get("/api/ontology").json()
    assert sum(p["count"] for p in o["pathways"]) == s["total_compounds"]


def test_request_size_limit(client):
    r = client.post("/api/compound/structure", content=b"x" * 300_000, headers={"content-type": "application/json"})
    assert r.status_code == 413


def test_unknown_compound(client):
    assert client.get("/api/compound/does-not-exist").status_code == 404
