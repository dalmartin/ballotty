"""Local dev server for Ballotty. Production is the static docs/ folder on GitHub Pages;
this serves the exact same files so local and published behave identically."""

from pathlib import Path

from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles

DOCS = Path(__file__).resolve().parent.parent / "docs"

app = FastAPI(title="Ballotty", docs_url=None, redoc_url=None)


@app.get("/healthz")
def healthz():
    return {"ok": True}


app.mount("/", StaticFiles(directory=DOCS, html=True), name="site")
