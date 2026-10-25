"""Ballotty web app: serves the static UI and the precomputed, citation-checked city JSON."""

import json
from pathlib import Path

from fastapi import FastAPI, HTTPException
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "data" / "out"
STATIC = Path(__file__).resolve().parent / "static"
CITIES = ["eugene", "corvallis", "portland"]

app = FastAPI(title="Ballotty", docs_url=None, redoc_url=None)


@app.get("/api/cities")
def cities():
    return [{"id": c, "name": json.loads((OUT / f"{c}.json").read_text())["name"]} for c in CITIES]


@app.get("/api/checks")
def checks():
    return json.loads((OUT / "checks.json").read_text())


@app.get("/api/{city}")
def city(city: str):
    if city not in CITIES:
        raise HTTPException(404, "unknown city")
    return json.loads((OUT / f"{city}.json").read_text())


@app.get("/healthz")
def healthz():
    return {"ok": True}


@app.get("/")
def index():
    return FileResponse(STATIC / "index.html")


app.mount("/static", StaticFiles(directory=STATIC), name="static")
