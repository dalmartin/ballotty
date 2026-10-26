"""Shared paths, config loading, and text normalization for the Ballotty pipeline."""

import json
import os
import re
from pathlib import Path

import yaml

ROOT = Path(__file__).resolve().parent.parent
CONFIG = ROOT / "config" / "cities.yaml"
RAW = ROOT / "data" / "raw"
PAGES = ROOT / "data" / "pages"
SEGMENTS = ROOT / "data" / "segments.json"
EXTRACTIONS = ROOT / "data" / "raw_extractions"
OUT = ROOT / "docs" / "data"  # published as-is by GitHub Pages


def load_env():
    env = ROOT / ".env"
    if env.exists():
        for line in env.read_text().splitlines():
            key, _, value = line.strip().partition("=")
            if key and not key.startswith("#"):
                os.environ.setdefault(key, value)


def load_config():
    return yaml.safe_load(CONFIG.read_text())


def page_text(doc, n):
    return (PAGES / doc / f"{n}.txt").read_text()


def page_count(doc):
    return len(list((PAGES / doc).glob("*.txt")))


def page_label(config, doc, n):
    return config["docs"][doc]["page_label"].format(n=n)


def read_json(path):
    return json.loads(Path(path).read_text())


def write_json(path, data):
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(data, indent=2, ensure_ascii=False) + "\n")


def slug(s):
    return re.sub(r"[^a-z0-9]+", "-", s.lower()).strip("-")


_QUOTES = str.maketrans({"’": "'", "‘": "'", "“": '"', "”": '"', "–": "-", "—": "-", "­": ""})


def normalize(s):
    """Lowercase, unify quotes/dashes, rejoin hyphenated line breaks, collapse whitespace."""
    s = s.translate(_QUOTES)
    s = re.sub(r"(\w)-\s*\n\s*(\w)", r"\1\2", s)
    s = re.sub(r"\s+", " ", s)
    return s.strip().lower()
