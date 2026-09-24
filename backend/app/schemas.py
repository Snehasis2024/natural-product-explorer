"""Pydantic request/response models (the public API contract)."""
from __future__ import annotations

from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator

from .chem import MAX_SMILES_LENGTH, clean_text

Provenance = Literal["experimental", "database", "calculated", "predicted", "curated", "demo"]


class SmilesIn(BaseModel):
    smiles: str = Field(..., min_length=1, max_length=MAX_SMILES_LENGTH, examples=["Cn1cnc2c1c(=O)n(C)c(=O)n2C"])

    @field_validator("smiles")
    @classmethod
    def _clean(cls, v: str) -> str:
        return clean_text(v, MAX_SMILES_LENGTH)


class StructureIn(SmilesIn):
    include_3d: bool = True


class LipinskiRule(BaseModel):
    rule: str
    value: float
    limit: float
    # "pass" is a keyword, so it is aliased
    passed: bool = Field(alias="pass")
    model_config = ConfigDict(populate_by_name=True)


class StructureOut(BaseModel):
    smiles: str
    canonical_smiles: str
    inchi: str
    inchikey: str
    molblock: str | None = None
    sdf: str | None = None
    molblock_2d: str
    svg: str
    formula: str
    molecular_weight: float
    exact_mass: float
    logp: float
    tpsa: float
    hbd: int
    hba: int
    rotatable_bonds: int
    rings: int
    aromatic_rings: int
    heavy_atoms: int
    formal_charge: int
    stereocenters: int
    stereocenters_unassigned: int
    fsp3: float
    molar_refractivity: float
    complexity_bertz: float
    qed: float
    sa_score: float | None
    np_likeness: float | None
    lipinski: dict[str, Any]
    veber: dict[str, Any]
    conformer: dict[str, Any] | None = None
    provenance: Provenance = "calculated"
    engine: str = "rdkit-python"


class Prediction(BaseModel):
    label: str
    confidence: float = Field(ge=0, le=1)


class TopKItem(BaseModel):
    label: str
    probability: float = Field(ge=0, le=1)
    level: Literal["pathway", "superclass", "class"] = "class"


class ModelInfo(BaseModel):
    name: str
    version: str
    type: Literal["npc-bert", "demo-knn"]
    is_demo: bool
    notice: str
    reference_set_size: int | None = None


class PredictOut(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    smiles: str
    canonical_smiles: str
    model: ModelInfo
    pathway: Prediction
    superclass: Prediction
    class_: Prediction = Field(alias="class")
    top_k: list[TopKItem]
    top_k_by_level: dict[str, list[TopKItem]]
    explanation: dict[str, Any]
    fallback_reason: str | None = None
    provenance: Provenance = "predicted"


class SimilarityIn(SmilesIn):
    threshold: float = Field(0.3, ge=0.0, le=1.0)
    limit: int = Field(25, ge=1, le=200)


class SubstructureIn(BaseModel):
    query: str = Field(..., min_length=1, max_length=500, description="SMILES or SMARTS pattern")
    limit: int = Field(50, ge=1, le=500)

    @field_validator("query")
    @classmethod
    def _clean(cls, v: str) -> str:
        return clean_text(v, 500)


class CompareIn(BaseModel):
    ids: list[str] = Field(..., min_length=2, max_length=4)

    @field_validator("ids")
    @classmethod
    def _clean(cls, v: list[str]) -> list[str]:
        return [clean_text(i, 64) for i in v]


class ErrorOut(BaseModel):
    error: str
    detail: Any | None = None
