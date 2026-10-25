"""Grounding + bias safeguards, then one JSON file per city.

1. Citation checker: every quote must be found (fuzzy, normalized) on its cited page,
   else the citation is removed; a bullet with no surviving citation is dropped.
2. Number check: any number in a bullet's text must appear in its quote.
3. Caps: identical maximums for every candidate and for both sides of a measure.
4. Loaded-language pass (Gemma + wordlist): a flagged paraphrase is replaced by its
   attributed verbatim quote.
5. Relocation: shared statewide items are re-cited to each city's own state edition.
"""

import re
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone

from rapidfuzz import fuzz

from . import gemma
from .common import EXTRACTIONS, OUT, ROOT, load_config, normalize, page_count, page_label, page_text, read_json, write_json

THRESHOLD = 92
CAPS = {"summary": 3, "background": 5, "endorsements": 5, "measure_summary": 4, "themes": 3, "theme_citations": 4}
WORDLIST = [
    "radical", "extreme", "extremist", "disastrous", "disaster", "common-sense", "commonsense", "failed",
    "reckless", "heroic", "corrupt", "job-killing", "giveaway", "outrageous", "crazy", "insane", "scam",
    "slush", "woke", "socialist", "dangerous", "devastating", "shameful", "ridiculous",
]

_norm_cache = {}


def norm_page(doc, n):
    if (doc, n) not in _norm_cache:
        _norm_cache[(doc, n)] = normalize(page_text(doc, n))
    return _norm_cache[(doc, n)]


def quote_score(quote, haystack):
    q = normalize(quote)
    if len(q) < 15:
        return 100 if q in haystack else 0
    return fuzz.partial_ratio(q, haystack)


def find_quote(quote, doc, pages):
    """Return (page, score) of the best page among `pages`, cited page first."""
    best = (None, 0)
    for n in pages:
        score = quote_score(quote, norm_page(doc, n))
        if score >= THRESHOLD:
            return n, score
        best = max(best, (n, score), key=lambda t: t[1])
    return best


def numbers_ok(text, quote):
    q = normalize(quote)
    return all(num in q for num in re.findall(r"\d[\d,.]*\d|\d", text))


def make_citation(config, doc, n, quote):
    return {"doc": doc, "page": n, "page_label": page_label(config, doc, n), "url": f"{config['docs'][doc]['url']}#page={n}", "quote": quote}


def check_bullet(config, bullet, doc, allowed_pages, log, section):
    """Bullet from Gemma ({text, quote, page}) -> checked bullet, or None (logged) if unverifiable."""
    if len(bullet["quote"].split()) < 2:
        log["dropped"].append({"section": section, "text": bullet["text"], "reason": "quote too short to verify"})
        return None
    cited = bullet["page"]
    order = [cited] + [p for p in allowed_pages if p != cited] if cited in allowed_pages else list(allowed_pages)
    page, score = find_quote(bullet["quote"], doc, order)
    if score < THRESHOLD:
        log["dropped"].append({"section": section, "text": bullet["text"], "quote": bullet["quote"], "reason": f"quote not found on cited page (best match {score:.0f}%)"})
        return None
    if not numbers_ok(bullet["text"], bullet["quote"]):
        log["dropped"].append({"section": section, "text": bullet["text"], "quote": bullet["quote"], "reason": "number in summary not present in quote"})
        return None
    if page != cited:
        log["corrected"].append({"section": section, "text": bullet["text"], "cited_page": cited, "found_page": page})
    return {"text": bullet["text"], "citations": [make_citation(config, doc, page, bullet["quote"])], "loaded_terms": []}


def check_section(config, bullets, cap, doc, pages, log, section):
    out = [b for b in (check_bullet(config, b, doc, pages, log, section) for b in bullets) if b]
    if len(out) > cap:
        log["capped"].append({"section": section, "removed": len(out) - cap})
    return out[:cap]


def check_themes(config, themes, seg, side, log):
    args = {a["id"]: a for a in seg["arguments"] if a["side"] == side}
    out = []
    for theme in themes:
        cites, filers = [], []
        for c in theme["citations"][: CAPS["theme_citations"]]:
            arg = args.get(c["argument_id"])
            if not arg:
                log["dropped"].append({"section": f"{side} theme citation", "text": theme["text"], "reason": f"cites unknown argument {c['argument_id']}"})
                continue
            if quote_score(c["quote"], normalize(arg["text"])) < THRESHOLD:
                log["dropped"].append({"section": f"{side} theme citation", "text": theme["text"], "quote": c["quote"], "reason": f"quote not found in argument {arg['id']} ({arg['filed_by']})"})
                continue
            page, _ = find_quote(c["quote"], seg["doc"], arg["pages"])
            cite = make_citation(config, seg["doc"], page or arg["pages"][0], c["quote"])
            cite["argument_id"], cite["filed_by"] = arg["id"], arg["filed_by"]
            cites.append(cite)
            if arg["filed_by"] not in filers:
                filers.append(arg["filed_by"])
        if not cites:
            log["dropped"].append({"section": f"{side} theme", "text": theme["text"], "reason": "no citation survived the checker"})
            continue
        if not numbers_ok(theme["text"], " ".join(c["quote"] for c in cites)):
            log["dropped"].append({"section": f"{side} theme", "text": theme["text"], "reason": "number in summary not present in quotes"})
            continue
        out.append({"text": theme["text"], "citations": cites, "filed_by": filers, "loaded_terms": []})
    return out[: CAPS["themes"]]


def apply_loaded_pass(item, log):
    """Flag loaded language; replace flagged paraphrases with the attributed verbatim quote."""
    sections = ["summary", "background", "endorsements"] if item["type"] == "candidate" else ["summary", "for", "against"]
    bullets = [(s, b) for s in sections for b in item.get(s, [])]
    if not bullets:
        return
    cache = EXTRACTIONS / (item["id"].replace("/", "__") + ".loaded.json")
    texts = [b["text"] for _, b in bullets]
    prompt = gemma.loaded_prompt(texts)
    if cache.exists() and read_json(cache).get("hash") == gemma.key(prompt):
        flags = read_json(cache)["flags"]
    else:
        out, _model = gemma.generate(prompt, gemma.LoadedOut)
        flags = [f.model_dump() for f in out.flags]
        write_json(cache, {"hash": gemma.key(prompt), "flags": flags})
    terms = {f["index"]: f["loaded_terms"] for f in flags if f["loaded_terms"] and 0 <= f["index"] < len(bullets)}
    for i, (_, b) in enumerate(bullets):
        found = [w for w in WORDLIST if re.search(rf"\b{re.escape(w)}\b", b["text"], re.I)]
        terms[i] = sorted(set(terms.get(i, []) + found))
    for i, (section, b) in enumerate(bullets):
        if not terms[i]:
            continue
        original = b["text"]
        cite = b["citations"][0]
        if section in ("for", "against"):
            b["text"] = f"Argument filed by {cite['filed_by']}: “{cite['quote']}”"
        elif item["type"] == "candidate":
            b["text"] = f"In their statement: “{cite['quote']}”"
        else:
            b["text"] = f"Ballot title text: “{cite['quote']}”"
        b["loaded_terms"] = terms[i]
        log["flagged"].append({"section": section, "text": original, "loaded_terms": terms[i], "replaced_with": b["text"]})


def build_candidate(config, seg, raw):
    log = {"dropped": [], "flagged": [], "corrected": [], "capped": []}
    item = {k: seg[k] for k in ("id", "type", "name", "contest", "ballot_party_label", "ballot_order", "statement_filed")}
    item.update({"summary": [], "background": [], "endorsements": [], "furnished_by": None, "funding": None, "doc": seg["doc"], "pages": seg["pages"]})
    if seg["statement_filed"]:
        c = raw["candidate"]
        for section in ("summary", "background", "endorsements"):
            item[section] = check_section(config, c[section], CAPS[section], seg["doc"], seg["pages"], log, section)
        fb = c["furnished_by"].strip()
        item["furnished_by"] = fb if fb and any(normalize(fb) in norm_page(seg["doc"], n) for n in seg["pages"]) else None
        apply_loaded_pass(item, log)
    item["checks"] = log
    return item


def build_measure(config, seg, raw):
    log = {"dropped": [], "flagged": [], "corrected": [], "capped": []}
    m = raw["measure"]
    title = normalize(seg["title_text"])
    verbatim = lambda s: s if s and quote_score(s, title) >= THRESHOLD else None  # noqa: E731
    item = {
        "id": seg["id"], "type": "measure", "measure_number": seg["measure_number"], "jurisdiction": seg["jurisdiction"],
        "caption": verbatim(m["caption"]), "question": verbatim(m["question"]),
        "summary": check_section(config, m["summary"], CAPS["measure_summary"], seg["doc"], seg["title_pages"], log, "summary"),
        "arguments_filed": seg["arguments_filed"],
        "filers": {side: sorted({a["filed_by"] for a in seg["arguments"] if a["side"] == side}) for side in ("for", "against")},
        "for": check_themes(config, raw.get("themes_for", {}).get("themes", []), seg, "for", log),
        "against": check_themes(config, raw.get("themes_against", {}).get("themes", []), seg, "against", log),
        "no_arguments_note": seg["no_arguments_note"],
        "doc": seg["doc"], "pages": seg["title_pages"],
    }
    apply_loaded_pass(item, log)
    item["checks"] = log
    return item


def relocate(config, item, state_doc):
    """Re-cite a shared item (extracted from Book 4) to a city's own state edition."""
    item = {**item, "relocation": {"from": item["doc"], "to": state_doc, "found": 0, "missed": 0}}
    if state_doc == item["doc"]:
        return item
    if not item["statement_filed"]:
        return {**item, "doc": state_doc}
    # Pages carrying the candidate's name first, so a generic phrase can't match another race's page.
    all_pages = range(1, page_count(state_doc) + 1)
    named = [n for n in all_pages if normalize(item["name"]) in norm_page(state_doc, n)]
    pages = named + [n for n in all_pages if n not in named]
    new_pages = set()
    for section in ("summary", "background", "endorsements"):
        new_bullets = []
        for b in item[section]:
            cite = b["citations"][0]
            page, score = find_quote(cite["quote"], state_doc, pages)
            if score >= THRESHOLD:
                b = {**b, "citations": [make_citation(config, state_doc, page, cite["quote"])]}
                item["relocation"]["found"] += 1
                new_pages.add(page)
            else:
                item["relocation"]["missed"] += 1
            new_bullets.append(b)
        item[section] = new_bullets
    if new_pages:
        item["doc"], item["pages"] = state_doc, sorted(new_pages)
    return item


def finalize(config, item):
    doc = config["docs"][item["doc"]]
    first = item["pages"][0] if item["pages"] else None
    item["source"] = {"doc": item["doc"], "title": doc["title"], "publisher": doc["publisher"]}
    item["verify_url"] = f"{doc['url']}#page={first}" if first else doc["url"]
    item["verify_label"] = page_label(config, item["doc"], first) if first else None
    return item


def main():
    config = load_config()
    segments = {s["id"]: s for s in read_json(ROOT / "data" / "segments.json")}
    sources = read_json(ROOT / "data" / "sources.json")
    def build(seg):
        raw = read_json(EXTRACTIONS / (seg["id"].replace("/", "__") + ".json")) if seg.get("statement_filed", True) else None
        return build_measure(config, seg, raw) if seg["type"] == "measure" else build_candidate(config, seg, raw)

    with ThreadPoolExecutor(max_workers=4) as pool:
        built = dict(zip(segments, pool.map(build, segments.values())))

    shared = {c["id"]: c for c in config["shared_contests"]}
    totals = {"kept": 0, "dropped": 0, "flagged": 0, "corrected": 0}
    for city_id, city in config["cities"].items():
        contests = []
        for c in city["contests"]:
            spec = shared[c["shared"]] if "shared" in c else c
            if "measure" in spec:
                items = [finalize(config, dict(built[spec["id"]]))]
                name = f"Measure {spec['measure']}: {spec['jurisdiction']}"
            else:
                items = [b for sid, b in built.items() if sid.startswith(spec["id"] + "/")]
                items.sort(key=lambda b: b["ballot_order"])
                if "shared" in c:
                    items = [relocate(config, b, city["state_doc"]) for b in items]
                items = [finalize(config, b) for b in items]
                name = spec["contest"]
            contests.append({"id": spec["id"], "name": name, "type": "measure" if "measure" in spec else "candidates",
                             "district_label": spec.get("district_label"), "ranked_choice": spec.get("ranked_choice", False), "items": items})
        docs_used = {city["state_doc"], *([city["county_doc"]] if city["county_doc"] else []), *(i["doc"] for c in contests for i in c["items"])}
        out = {
            "city": city_id, "name": city["name"], "county": city["county"], "coverage_note": city["coverage_note"],
            "generated_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
            "sources": [{"doc": d, **config["docs"][d], "sha256": sources[d]["sha256"]} for d in sorted(docs_used)],
            "contests": contests,
        }
        write_json(OUT / f"{city_id}.json", out)
        print(f"validate: {city_id}: {sum(len(c['items']) for c in contests)} items in {len(contests)} contests")

    for item in built.values():
        log = item["checks"]
        sections = ["summary", "background", "endorsements"] if item["type"] == "candidate" else ["summary", "for", "against"]
        totals["kept"] += sum(len(item.get(s, [])) for s in sections)
        for k in ("dropped", "flagged", "corrected"):
            totals[k] += len(log[k])
    write_json(OUT / "checks.json", {"totals": totals, "items": {k: v["checks"] for k, v in built.items()}})
    print(f"validate: bullets kept {totals['kept']}, dropped {totals['dropped']}, flagged {totals['flagged']}, page-corrected {totals['corrected']}")


if __name__ == "__main__":
    main()
