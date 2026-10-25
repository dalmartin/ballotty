# Ballotty — PRD (8-hour hackathon, solo build)

**Last updated:** 2026-10-25 · **Team:** 1 (solo, Python + JS) · **Demo:** live, 2 minutes, with a backup video
**Cities:** Eugene (Lane Co.) · Corvallis (Benton Co.) · Portland (Multnomah Co. portion)

---

## 0. Research findings (verified 2026-10-25)

| Question | Finding | Impact |
|---|---|---|
| **Gemma 4 on the Gemini API** | `gemma-4-31b-it` (dense) and `gemma-4-26b-a4b-it` (MoE), called with the `google-genai` SDK (`client.models.generate_content(model=..., config=types.GenerateContentConfig(system_instruction=...))`). 256K context. Structured JSON and function calling supported "at the model level". | Use 31B, fall back to 26B. **Not confirmed:** whether `response_mime_type` / `response_schema` work for Gemma. Test in hour 1. |
| **Rate limits** | No official Gemma 4 table. One secondary source says 15 RPM / 1,500 RPD (31B, free tier). Limits are per project. | Precompute everything offline. The demo makes no live LLM calls on its critical path. |
| **Pamphlet structure** | The state pamphlet ships as **one PDF per county** ("Book N"). The **county pamphlet is a separate PDF** that gets bound in for mailing. **No statewide measures** this election. All PDFs are **text-extractable** (InDesign, not scanned), and **printed page = PDF page index** in all of them (Multnomah's labels read `M-NN`). | Sources are a small set of static PDFs per city (see the table below). |
| **Lane County** | **Does not publish a county pamphlet.** Eugene Measure 20-388 appears only in the county's *Proof Ballot Content* PDF (p. 10), with **no official arguments**. | Eugene's measure shows its ballot title and "No arguments filed". |
| **Benton County** | Publishes its own pamphlet (40 pp.), with a table of contents mapping name → page on p. 3. Corvallis: Mayor (4 candidates, ranked choice, pp. 13–14), Wards 1–8 (pp. 15–21), **Measure 2-159** charter amendment (pp. 25–28: **3 for / 3 against**), and **Measure 2-160** 509J levy (pp. 29–32: 6 for / 0 against). | Best example of symmetric arguments. |
| **Multnomah County** | Publishes its own pamphlet (108 pp.), with a Candidate Index on M-30/31. Portland: Auditor (M-52), Council **District 3** (M-53–60) and **District 4** (M-61–66), about 30 candidates, ranked choice. **Measure 26-267** participatory budgeting (M-78–91: **15 for / 15 against**). Each argument has a heading ("ARGUMENT IN FAVOR/OPPOSITION") and a filer line ("This information furnished by X"). | Stress-tests condensing many arguments into a few themes with attribution. |
| **ORESTAR** | Public search UI with Excel export. Session-based legacy app, no API, no bulk download. | **Funding is CUT.** |

**Source PDFs per city** (`config/cities.yaml`):

| City | State edition | County pamphlet | Extra |
|---|---|---|---|
| Eugene | [Book 4 (Lane)](https://sos.oregon.gov/elections/Voters-Pamphlet/Documents/VP_G26-Book4_web.pdf), 56 pp. | none | [Lane ballot content](https://www.lanecounty.org/UserFiles/Servers/Server_3585797/File/County%20Clerk/Elections/Dated%20Elections/November%203,%202026/GE26_E_019%20Web.pdf), 12 pp. |
| Corvallis | [Book 6 (Benton)](https://sos.oregon.gov/elections/Voters-Pamphlet/Documents/VP_G26-Book6_web.pdf), 44 pp. | [Benton County VP](https://re.bentoncountyor.gov/wp-content/uploads/2026/09/2026Nov03-Benton-County-Voters-Pamphlet.pdf), 40 pp. | — |
| Portland | [Book 13 (Multnomah)](https://sos.oregon.gov/elections/Voters-Pamphlet/Documents/VP_G26-Book13_web.pdf), 64 pp. | [Multnomah County VP](https://multco.us/file/multnomah_county_voters'_pamphlet_-_november_2026_general_election/download), 108 pp. | — |

Other sources: [SOS current election](https://sos.oregon.gov/voting/pages/current-election.aspx) · [SOS Lane page](https://sos.oregon.gov/elections/Pages/vp-lane.aspx) · [Benton VP page](https://re.bentoncountyor.gov/elections/voters-pamphlet/) · [Gemma on Gemini API](https://ai.google.dev/gemma/docs/core/gemma_on_gemini_api) · [Gemma 4 guide](https://www.philschmid.de/gemma-4-gemini-api) · [ORESTAR search](https://secure.sos.state.or.us/orestar/gotoPublicTransactionSearch.do)

---

## 1. Problem and pitch

Oregon voters get a state pamphlet and a county pamphlet, together 100–170 pages, and most people don't read them. Third-party guides fill the gap, but you can't check where their claims come from.

**Pitch:** *Ballotty condenses your ballot (Eugene, Corvallis or Portland) into a one-screen brief where every sentence links to the page of the official voters' pamphlet it came from.*

The model condenses and attributes. It never adds claims, and anything it can't trace is dropped.

## 2. Target user and demo flow

**User:** a voter in one of the three cities who has 10 minutes. The hackathon audience lives in these cities.

**2-minute demo:**
1. **(0:00)** Open the DigitalOcean URL. The banner reads: "Every sentence links to the official pamphlet page." City switcher: **Eugene | Corvallis | Portland**.
2. **(0:10)** **Eugene → Governor.** Candidates in ballot order, each with ≤3 summary bullets, ≤5 *self-reported* background bullets and self-reported endorsements. Click a citation: the Lane County edition opens at that page.
3. **(0:35)** Switch to **Corvallis**. Governor stays the same, but its citations now point to *Book 6* pages, the Benton edition. Open **Measure 2-159**: an official summary, plus For (3 filed) and Against (3 filed) in equal-width columns, each point attributed to its filer.
4. **(1:00)** Switch to **Portland → Measure 26-267**. "15 arguments filed in favor · 15 in opposition", condensed into ≤3 themes per side, each listing which filers made the point. Click through to page M-87.
5. **(1:20)** **Eugene → Measure 20-388**: "No arguments filed in an official voters' pamphlet (Lane County does not publish one)." Then a candidate card with "Chose not to submit a statement". Nothing is filled in.
6. **(1:35)** **"How we checked"** panel: one bullet the citation checker dropped and one the loaded-language pass flagged.
7. **(1:50)** GitHub repo: `make data` rebuilds all three cities from the official PDFs. Disclaimer.

## 3. Scope tiers

### MUST: MVP, done by hour 5

| # | Item | Notes |
|---|---|---|
| M1 | Gemma 4 call, JSON validated by Pydantic | `gemma-4-31b-it`, temperature 0 |
| M2 | DO App Platform deploy from GitHub | FastAPI, auto-deploys on push |
| M3 | Per-page text extraction for the 6 PDFs | `pdftotext`; `pdfplumber` column crop if needed |
| M4 | Segmentation using each PDF's own index | **Statewide (shared):** US Senator (3 + Dye*), Governor (3). **Eugene:** US Rep 4 (3), Council W3 (1), W5 (2), W4/W6 no statement, Measure 20-388. **Corvallis:** US Rep 4 (reuses the Eugene extractions), Mayor (4), Measure 2-159. **Portland:** US Rep 3 (Dexter + Ayles*), Measure 26-267. About 17 candidate extractions, 3 measures, 4 no-statement cards. |
| M5 | Gemma extraction: candidates + measure summaries + argument themes | One template for all candidates; one template for both argument sides |
| M6 | Citation checker that drops unverifiable bullets | §6 |
| M7 | Loaded-language pass that flags bullets | §6 |
| M8 | **Relocation step**: shared statewide items get re-cited to each city's own state edition | Find the verified quote in Book 4, 6 or 13 and store that city's page. Same text, city-correct links. |
| M9 | UI: city switcher → contest list → item cards → citation links, with For/Against columns | Vanilla JS, no build step. City in the URL hash (`#corvallis`). |
| M10 | No-info states, a "Verify in official pamphlet" link per item, disclaimers | §6, §12 |

### SHOULD: hours 5–6.5 (in order)

| # | Item |
|---|---|
| S1 | "How we checked" panel (dropped and flagged bullets per item) |
| S2 | Portland Council District 3 and 4 (~30 statements, one background batch); Corvallis Wards 1–8; Measure 2-160 |
| S3 | "Ranked-choice contest" tag with a link to the official RCV explainer page (Benton p. 12, Multnomah M-17) |
| S4 | `/api/extract?doc=…&page=N` live rerun button for the demo (falls back to cached output) |
| S5 | Scheduled GitHub Action: detect changed PDFs by hash, rebuild, open a PR for review |

### CUT (with reasons)

| Item | Reason |
|---|---|
| ORESTAR top funders | No API or bulk export; committee matching is manual. More than 2 hours solo. |
| Address/ward/district lookup | Needs GIS data. Contests are labeled by ward/district ("Ward 5 voters") instead. |
| State legislative and county races | Vary by district; too many items for a solo build. The pipeline supports them. |
| Portland residents in Washington or Clackamas County | Different county pamphlets. Ballotty covers only the Multnomah portion and says so. |
| Other Oregon cities | The config supports them; adding one is a `cities.yaml` entry plus a batch run. |
| Self-hosted Gemma (DO GPU / Gradient) | Too much risk solo. Roadmap item. |
| Translations, accounts, database | Not needed. Output is a static JSON file per city. |
| Party-leaning or ideology labels | Never part of the design. Only official ballot party nominations, verbatim. |

## 4. Architecture

```
config/cities.yaml  (city → source PDFs, contests to include)
   │
pipeline/ (Python CLI, run offline)
   fetch.py     → data/raw/*.pdf + data/sources.json (url, sha256, retrieved_at)
   extract.py   → data/pages/{doc}/{page}.txt
   segment.py   → data/segments.json    (item → doc, pages, raw text; arguments split by regex)
   gemma.py     → data/raw_extractions/{id}.json
   validate.py  → citation check → loaded-language pass → relocate → data/{city}.json
   │
app/ (FastAPI) → index.html + app.js + /api/{city}  → DigitalOcean App Platform
```

**Stack and why:** Python 3.12, `google-genai` and Pydantic for the pipeline (best PDF tooling, free validation). `pdftotext`/`pdfplumber` because no OCR is needed. FastAPI plus one HTML page with vanilla JS: a single deploy unit, no build step. **Committed JSON** so the demo can't hit rate limits and every output is auditable. `rapidfuzz` for tolerant quote matching.

## 5. Data pipeline

1. **Fetch and extract:** download the 6 PDFs, record their sha256, run `pdftotext` per page. The page number is the source of truth.
2. **Segment:**
   - Candidates are mapped name → page from each PDF's own index (Book N p. 29, Benton p. 3, Multnomah M-30/31). Asterisks mark "no statement".
   - Measures are split by heading: `Ballot Title`, then `ARGUMENT IN FAVOR` / `ARGUMENT IN OPPOSITION` blocks, each ending in `(This information furnished by X)`. **Regex** gives each argument its filer and page, so argument counts are computed deterministically, not by the model.
   - Fallback: hand-write `segments.json` (decide by T+1:45).
3. **Gemma extraction:**
   - **Candidates:** one call per candidate, given the page text plus `{name, contest}`. The instruction is to extract ONLY that candidate's statement, which handles 2-candidate pages.
   - **Measure summary:** one call on the ballot title, explanatory statement and summary.
   - **Arguments:** one call **per side, with an identical prompt**. Input is a numbered list of the arguments with their filers. Output is ≤3 themes, each citing the argument IDs that support it.
4. **Validate:** Pydantic → citation check → loaded-language pass → caps → **relocate** statewide items into each city's state edition → write `data/{city}.json`.

**Shared types:**
```json
// Citation
{ "doc": "book4 | book6 | book13 | benton_vp | multnomah_vp | lane_ballot",
  "page": 87, "page_label": "M-87",
  "quote": "verbatim span, ≤40 words",
  "check": "pass | fail" }

// Bullet: every displayed sentence is one of these
{ "text": "plain language, ≤30 words",
  "citations": ["Citation (≥1)"],
  "loaded_terms": ["string"] }
```

**Candidate:**
```json
{ "id": "statewide/governor/tina-kotek", "type": "candidate", "scope": "statewide | city",
  "contest": "Governor", "district_label": null, "ranked_choice": false,
  "ballot_order": 2, "name": "Tina Kotek",
  "ballot_party_label": "Democrat, Working Families",
  "statement_filed": true,
  "summary": ["Bullet (max 3)"],
  "background": ["Bullet (max 5), shown as self-reported"],
  "endorsements": ["Bullet (max 5), shown as self-reported"],
  "furnished_by": "from '(This information furnished by …)' or null",
  "funding": null }
```

**Measure:**
```json
{ "id": "portland/measure-26-267", "type": "measure", "measure_number": "26-267",
  "jurisdiction": "City of Portland",
  "caption": "verbatim", "question": "verbatim",
  "summary": ["Bullet (max 4)"],
  "arguments_filed": { "for": 15, "against": 15 },
  "for": ["Theme (max 3)"], "against": ["Theme (max 3)"],
  "no_arguments_note": "verbatim pamphlet text, e.g. 'No arguments in opposition were filed for this measure.' or null" }
// Theme = Bullet + "filed_by": ["verbatim filer names"]  (one citation per supporting argument)
```

Each city file (`data/{city}.json`) holds `{city, sources[], contests[{name, district_label, items[]}]}`. Every citation is rendered as `{source_url}#page={page}`.

## 6. Grounding and bias safeguards (all MUST)

1. **Citation checker:** normalize the page text and quote (lowercase, collapse whitespace, rejoin hyphenated breaks, unify quote characters), then `rapidfuzz.partial_ratio ≥ 92` **against the cited page only**. A failing citation is removed. A bullet left with zero citations is **dropped**. Everything is logged to `checks.json`.
2. **Symmetry:**
   - One template and identical caps (3/5/5) for every candidate. Same template, same cap (3 themes) and same temperature for both argument sides.
   - The **filed counts are shown for both sides** and computed by regex.
   - The For and Against columns always render at equal width, even when one side is empty.
   - Candidates appear in **ballot order**, never ranked.
3. **Loaded-language pass:** a second Gemma call over each item's bullets returns `loaded_terms`, backed by a deterministic wordlist. A flagged paraphrase is **replaced with its verbatim quote**, attributed ("In their statement: '…'" or "Argument filed by X: '…'").
4. **No gap-filling:**
   - An empty field shows "No information filed in the official pamphlet".
   - An asterisked candidate shows "Chose not to submit a statement".
   - A measure with no arguments shows the pamphlet's own sentence (Benton, Multnomah) or "No arguments filed in an official voters' pamphlet (Lane County does not publish one)".
   - A section where every bullet was dropped shows "Could not verify — see official pamphlet".
5. **"Verify in official pamphlet"** link on every item. Every citation is a page link into that city's PDF.
6. **Prompt rules (system instruction):** "Only restate what the text says. Attribute every point: 'Says…', 'Lists…', 'Argues…'. No evaluative adjectives. Copy quotes verbatim. Return empty lists for missing fields."
7. **Theme honesty:** a theme may only cite arguments it actually paraphrases. Every cited argument's quote must pass the checker, and `filed_by` comes from the regex-extracted filer, never from the model.

## 7. Timeline (T+0 = when you start building; compress or skip SHOULD as needed)

| Time | Work | Checkpoint |
|---|---|---|
| 0:00–0:30 | Public repo (MIT), AI Studio key, Gemma hello call, **test JSON mode / response_schema** | ✅ Parseable JSON from Gemma |
| 0:30–1:00 | FastAPI hello world → DO App Platform, key as an env var | ✅ **H1: Gemma + live DO URL** |
| 1:00–2:00 | `fetch.py`, `extract.py`, `segment.py` (3 indexes + argument regex). **At 1:45, hand-segment if parsing is failing.** | ✅ ~24 segments; 26-267 shows 15/15 |
| 2:00–3:15 | Candidate prompt (iterate on Kotek), measure + theme prompt (iterate on 2-159), then batch everything | ✅ `raw_extractions/` complete |
| 3:15–4:00 | `validate.py`: checker, loaded-language pass, relocation, no-info states → 3 city JSONs | ✅ Planted fake quote is dropped |
| 4:00–5:00 | UI: city switcher, contests, cards, For/Against columns, links, disclaimers; deploy | ✅ **H5: MVP live for all 3 cities** |
| 5:00–6:30 | SHOULD in order S1 → S2 → S3 → S4 → S5 | — |
| **6:30** | **FEATURE FREEZE**, tag `v1-demo` | ✅ |
| 6:30–7:15 | README, Devpost text, rehearse ×3 | — |
| 7:15–7:45 | **Record the backup video** | ✅ Uploaded |
| 7:45–8:00 | Buffer, submit to both tracks | ✅ |

**If behind at T+3:15, cut in this order:** Corvallis Mayor → Eugene council wards → Portland US Rep. Keep all three measures; they carry the demo.

## 8. Task breakdown (solo)

Order matters more than parallelism, so run batches in the background. Kick off the Gemma batch (~25 calls at ≤15 RPM, about 2–3 minutes) and write `validate.py` while it runs. Run the S2 batch (~40 calls) while polishing the UI.

| Track | Tasks | Simplify first if behind |
|---|---|---|
| Infra | Repo, license, DO deploy, secrets | — |
| Pipeline | fetch → extract → segment → gemma → validate → relocate | Relocation becomes a hand-mapped page table for 6 items |
| UI | Switcher, cards, columns, links, disclaimer | Switcher becomes 3 static tabs |
| Story | README, Devpost, video, rehearsal | Never cut the video |

## 9. Risks and fallbacks

| Risk | Fallback |
|---|---|
| Gemma ignores `response_schema` or wraps JSON in fences | Schema in the prompt, strip fences, Pydantic, **one retry** with the error appended. Then mark "Could not verify". |
| Rate limits (429) | Precomputed JSON. Backoff, 4.5 s between calls, switch to `gemma-4-26b-a4b-it`. |
| Scanned PDF | All 6 are verified text PDFs. If a page comes back empty, hand-copy its text into `data/pages/`. |
| Two-column text order scrambled (Book 4 p. 31; Multnomah 2-up pages) | `pdfplumber` crop per column. Fuzzy partial matching tolerates small ordering noise. |
| 26-267's 15+15 arguments overflow the prompt or come back as poor themes | ~13 pages is roughly 12K tokens, well under the 256K limit. If themes come out poor, fall back to showing the **first 3 arguments per side in pamphlet order**, each condensed to one bullet, with a "+12 more filed" link. Still symmetric. |
| Argument regex misses a boundary | Split on the `(This information furnished by` line, which is consistent in both county pamphlets. Hand-fix in `segments.json`. |
| Relocation can't find a quote in Book 6/13 | Statewide statements are identical across editions. If a match fails, cite the Book 4 page with a "(Lane edition)" label. |
| Poor segmentation in general | Hand-segment the MUST items (~24, about 30 min). Decide by T+1:45. |
| DO deploy fails | Debug ≤20 min, then deploy as a DO **Static Site** with the JSON inlined. Last resort: localhost plus the deploy log. |
| Checker drops too much | Threshold down to 88; prompt "quote ≤25 words, copy exactly". Never disable it. |
| Network fails during the demo | Backup video. |

## 10. Acceptance criteria (MUST)

- **M1:** `python -m pipeline.gemma --test` returns an object that passes `Candidate` validation.
- **M2:** The DO URL returns 200 and `/api/eugene`, `/api/corvallis` and `/api/portland` serve JSON. A push to `main` redeploys in under 10 minutes.
- **M3:** `data/pages/book4/35.txt` contains "Tina Kotek". `multnomah_vp/78.txt` contains "26-267". `benton_vp/25.txt` contains "2-159".
- **M4:** Segments: 26-267 has 15 for and 15 against; 2-159 has 3 and 3; Dye, Yeh, Evans and Ayles have `statement_filed: false`. Spot-check 5 candidate pages against the indexes.
- **M5:** All city JSONs validate. No section exceeds its cap. Every bullet has ≥1 citation with page and quote. Every theme's `filed_by` is a subset of the regex filers.
- **M6:** A planted bullet with a fabricated quote is dropped. 100% of displayed citations have `check == "pass"`.
- **M7:** A planted "radical" bullet is flagged and rendered as an attributed verbatim quote.
- **M8:** Kotek's citations point to Book 4 in Eugene, Book 6 in Corvallis and Book 13 in Portland, and each quote is found on its cited page.
- **M9:** From the DO URL: switch city → open a measure → click a citation, and the correct PDF opens at the correct page, in 3 clicks or fewer. The For and Against columns render at equal width.
- **M10:** Every item has a "Verify" link. Empty fields show the no-info text. The disclaimer appears on every view.

## 11. Judging alignment

**Best Use of Gemma 4 (MLH / Google)**
- Gemma 4 31B does all the content work: per-candidate extraction from messy two-column pages, **condensing 15 vs 15 filed arguments into attributed themes**, and a second pass that audits its own output for loaded language.
- Grounding is visible: "How we checked" shows Gemma's output being verified against the page and some of it rejected.
- Open weights fit civic tech: counties and nonprofits can run and audit the same model on their own hardware (roadmap: self-host on DO).

**Best Open-Source AI Project (MLH / DigitalOcean)**
- Public MIT repo. `make data` rebuilds all three cities from official PDFs, and `sources.json` pins each source by hash.
- Hosted on **DigitalOcean App Platform** with GitHub auto-deploy. The S5 Action keeps it current through reviewable PRs.
- Adding a city is a `cities.yaml` entry: Oregon's state editions share one template, and county pamphlets share the same argument format.

## 12. Disclaimers (UI footer and README)

- Ballotty is **not affiliated** with the Oregon Secretary of State, Lane, Benton or Multnomah County Elections, the Cities of Eugene, Corvallis or Portland, or any campaign.
- Summaries are machine-generated from official documents and may contain errors. **Always verify with the official voters' pamphlet** (linked on every item).
- Candidate background and endorsements are **self-reported**. Measure arguments are **filed by the named individuals or groups** and were not verified for accuracy by the counties (the pamphlets say so).
- Portland coverage is the **Multnomah County portion only**. Your ballot may include contests not shown here.
- Ballotty makes **no voting recommendations** and does not rank or rate candidates or measures.
