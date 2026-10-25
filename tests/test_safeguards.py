"""Acceptance tests for the grounding/bias safeguards (PRD §10). Run after `make data`."""

import pytest

from pipeline import gemma, validate
from pipeline.common import OUT, ROOT, load_config, normalize, page_text, read_json

CONFIG = load_config()
CITIES = ["eugene", "corvallis", "portland"]


def empty_log():
    return {"dropped": [], "flagged": [], "corrected": [], "capped": []}


def test_planted_fake_quote_is_dropped():
    log = empty_log()
    fake = {"text": "Says Kotek will abolish property taxes.", "quote": "I will abolish all property taxes on day one", "page": 35}
    assert validate.check_bullet(CONFIG, fake, "book4", [35], log, "summary") is None
    assert log["dropped"] and "not found" in log["dropped"][0]["reason"]


def test_real_quote_passes_across_line_breaks():
    log = empty_log()
    real = {"text": "Says Kotek started at Oregon Food Bank.", "quote": "She started her career at Oregon Food Bank because she believes no one should go hungry", "page": 35}
    assert validate.check_bullet(CONFIG, real, "book4", [35], log, "summary") is not None


def test_number_not_in_quote_is_dropped():
    log = empty_log()
    b = {"text": "Says Kotek raised the minimum wage 40 times.", "quote": "Tina has raised the minimum wage, passed paid family leave", "page": 35}
    assert validate.check_bullet(CONFIG, b, "book4", [35], log, "summary") is None
    assert "number" in log["dropped"][0]["reason"]


def test_planted_loaded_language_is_replaced_with_verbatim_quote(monkeypatch, tmp_path):
    monkeypatch.setattr(validate, "EXTRACTIONS", tmp_path)
    monkeypatch.setattr(gemma, "generate", lambda prompt, schema: (gemma.LoadedOut(flags=[]), "stub"))
    quote = "Tina has raised the minimum wage, passed paid family leave"
    item = {"id": "test/planted", "type": "candidate", "background": [], "endorsements": [],
            "summary": [{"text": "Says Kotek pushed a radical agenda.", "citations": [{"quote": quote}], "loaded_terms": []}]}
    log = empty_log()
    validate.apply_loaded_pass(item, log)
    assert item["summary"][0]["loaded_terms"] == ["radical"]
    assert item["summary"][0]["text"] == f"In their statement: “{quote}”"
    assert log["flagged"]


def test_argument_counts_are_deterministic():
    segs = {s["id"]: s for s in read_json(ROOT / "data" / "segments.json")}
    assert segs["measure-26-267"]["arguments_filed"] == {"for": 15, "against": 15}
    assert segs["measure-2-159"]["arguments_filed"] == {"for": 3, "against": 3}
    no_statement = {s["name"] for s in segs.values() if s["type"] == "candidate" and not s["statement_filed"]}
    assert no_statement == {"Gary Lyndon Dye", "Jennifer Yeh", "Greg Evans", "Loran Ayles"}


def all_items(city):
    data = read_json(OUT / f"{city}.json")
    return [i for c in data["contests"] for i in c["items"]]


@pytest.mark.parametrize("city", CITIES)
def test_every_displayed_citation_is_on_its_page(city):
    for item in all_items(city):
        for section in ("summary", "background", "endorsements", "for", "against"):
            for b in item.get(section, []):
                assert b["citations"], (item["id"], section, b["text"])
                for c in b["citations"]:
                    assert validate.quote_score(c["quote"], normalize(page_text(c["doc"], c["page"]))) >= validate.THRESHOLD, (item["id"], c)


@pytest.mark.parametrize("city", CITIES)
def test_caps_and_symmetry(city):
    for item in all_items(city):
        if item["type"] == "candidate":
            assert len(item["summary"]) <= 3 and len(item["background"]) <= 5 and len(item["endorsements"]) <= 5
        else:
            assert len(item["for"]) <= 3 and len(item["against"]) <= 3
            for side in ("for", "against"):
                for theme in item[side]:
                    assert set(theme["filed_by"]) <= set(item["filers"][side])


@pytest.mark.parametrize("city,doc", [("eugene", "book4"), ("corvallis", "book6"), ("portland", "book13")])
def test_statewide_items_are_cited_to_the_citys_own_edition(city, doc):
    kotek = next(i for i in all_items(city) if i.get("name") == "Tina Kotek")
    assert kotek["doc"] == doc
    assert all(c["doc"] == doc for s in ("summary", "background", "endorsements") for b in kotek[s] for c in b["citations"])


@pytest.mark.parametrize("city", CITIES)
def test_every_item_has_a_verify_link(city):
    for item in all_items(city):
        assert item["verify_url"].startswith("https://")
