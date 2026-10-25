PY ?= .venv/bin/python

.PHONY: setup data fetch extract segment gemma validate test serve

setup:
	uv venv .venv --python 3.11 && uv pip install --python $(PY) -r requirements-pipeline.txt

# Rebuild everything from the official PDFs. Gemma calls are cached per item.
data: fetch extract segment gemma validate

fetch:
	$(PY) -m pipeline.fetch
extract:
	$(PY) -m pipeline.extract
segment:
	$(PY) -m pipeline.segment
gemma:
	$(PY) -m pipeline.gemma
validate:
	$(PY) -m pipeline.validate

test:
	$(PY) -m pytest -q tests

serve:
	$(PY) -m uvicorn app.main:app --reload --port 8000
