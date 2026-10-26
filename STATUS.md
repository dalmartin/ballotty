# Ballotty: Project Status

**Updated:** 2026-10-25 · **Phase:** MVP complete · **Overall:** 🟢 Live at https://ballotty-ps377.ondigitalocean.app (DO static site, $0) and https://dalmartin.github.io/ballotty/

**Legend:** ⬜ not started · 🔄 in progress · ✅ done · ⛔ blocked · ✂️ cut

## Checkpoints

| Target | Checkpoint | Status | Actual time | Notes |
|---|---|---|---|---|
| T+1:00 | Gemma 4 JSON call works and the DO hello-world is live | ✅ | | Gemma ✅; DO deploy done after billing + App Platform scope sign-in |
| T+2:00 | ~24 segments; 26-267 shows 15/15 arguments | ✅ | | 21 candidates + 3 measures; pages from config, verified automatically |
| T+3:15 | All Gemma extractions done | ✅ | | Nothing cut |
| T+4:00 | 3 city JSONs validated (checker, loaded-language pass, relocation) | ✅ | | 17/17 acceptance tests pass |
| T+5:00 | **MVP live for Eugene, Corvallis and Portland** | ✅ | | https://ballotty-ps377.ondigitalocean.app |
| T+6:30 | **Feature freeze**, tag `v1-demo` | ⬜ | | |
| T+7:45 | **Backup video recorded** | ⬜ | | |
| T+8:00 | Submitted to both prize tracks | ⬜ | | |

## MUST (MVP)

| # | Item | Status | Acceptance check |
|---|---|---|---|
| M1 | Gemma 4 call + Pydantic JSON | ✅ | `--test` passes validation |
| M2 | Public hosting | ✅ DigitalOcean App Platform free static site + GitHub Pages | `/api/{eugene,corvallis,portland}` return 200 |
| M3 | Text extraction, 6 PDFs | ✅ | Spot strings found on the expected pages |
| M4 | Segmentation (indexes + argument regex) | ✅ | 26-267 = 15/15, 2-159 = 3/3, 4 no-statement flags |
| M5 | Gemma extraction (candidates, summaries, themes) | ✅ | Caps respected; `filed_by` ⊆ regex filers |
| M6 | Citation checker | ✅ | Planted fake quote dropped |
| M7 | Loaded-language pass | ✅ | Planted "radical" flagged → shown as quote |
| M8 | Relocation of statewide items to each city's edition | ✅ | Kotek cites Book 4 / 6 / 13 by city |
| M9 | UI: quick ballot brief (topic finder, compare, picks, source drawer) | ✅ live | ≤3 clicks to the correct PDF page |
| M10 | No-info states, verify links, disclaimers | ✅ | Present on every item and view |

### MUST content by city

| City | Contests / measures | Sources |
|---|---|---|
| Shared statewide | US Senator (Smith, Merkley, Henry; Dye*), Governor (B. Smith, Kotek, Drazan) | Books 4 / 6 / 13 |
| Eugene | US Rep 4 (DeSpain, Hoyle, Filip), Council W3 (J. Smith), W4 (Yeh*), W5 (Clark, Aguiar), W6 (Evans*), **Measure 20-388** (no arguments) | Book 4, Lane ballot content p. 10 |
| Corvallis | US Rep 4 (reused), Mayor (4, ranked choice, pp. 13–14), **Measure 2-159** (3 for / 3 against, pp. 25–28) | Book 6, Benton VP |
| Portland | US Rep 3 (Dexter; Ayles*), **Measure 26-267** (15 for / 15 against, M-78–91) | Book 13, Multnomah VP |

\* = chose not to submit a statement

## SHOULD

| # | Item | Status |
|---|---|---|
| S1 | "How we checked" panel | ✅ (built into every card) |
| S2 | Portland Council D3/D4 (~30), Corvallis Wards 1–8, Measure 2-160 | ⬜ |
| S3 | Ranked-choice tag + official explainer link | ⬜ |
| S4 | `/api/extract` live rerun button | ⬜ |
| S5 | Scheduled GitHub Action for auto-updates (hash check → rebuild → PR) | ⬜ |

## CUT

| Item | Reason |
|---|---|
| ✂️ ORESTAR funding | No API or bulk download |
| ✂️ Address/district lookup | Needs GIS; contests are labeled by ward/district instead |
| ✂️ State legislative and county races | Vary by district; too many for a solo build |
| ✂️ Portland in Washington/Clackamas counties | Different county pamphlets |
| ✂️ Self-hosted Gemma on DO GPU | Time and risk |
| ✂️ Translations, accounts, DB | Not needed |

## Decisions log

| Date | Decision | Why |
|---|---|---|
| 2026-10-25 | Project name: **Ballotty** | User |
| 2026-10-25 | Solo; Python pipeline + FastAPI + vanilla JS; DO App Platform | Fastest path for one person |
| 2026-10-25 | Precompute Gemma output; commit the JSON | Rate limits; demo reliability |
| 2026-10-25 | Funding (ORESTAR) cut | No API |
| 2026-10-25 | Model: `gemma-4-31b-it`, fallback `gemma-4-26b-a4b-it` | The only Gemma 4 models on the Gemini API |
| 2026-10-25 | **Added a city switcher: Eugene, Corvallis, Portland** | User: relevant for participants |
| 2026-10-25 | Ward picker replaced by ward/district labels | Saves time for the extra cities |
| 2026-10-25 | Argument counts and filers come from regex, never the model | Deterministic and auditable symmetry |
| 2026-10-25 | Auto-updating via GitHub Action + PR review (S5) | Human gate before publishing election info |
| 2026-10-25 | **Primary model `gemma-4-26b-a4b-it`, fallback `gemma-4-31b-it`** | In testing 31B took ~50 s and returned 503s; 26B answered in <1 s. Both honor `response_schema`. |
| 2026-10-25 | Candidate pages listed in config and verified by name, not parsed from the indexes | Faster and more reliable (hand-segment fallback from the PRD, with automatic verification) |
| 2026-10-25 | Thin candidate answers retried on the other model | Uneven depth between candidates would read as bias |
| 2026-10-25 | **Frontend rewritten as a quick ballot brief** (short points + fixed-list topics, topic finder, compare by topic, private picks) | User: dashboard was "no different from the ballot itself" |
| 2026-10-25 | **Site made fully static (`docs/`); hosted on GitHub Pages and as a free DO App Platform static site** | User didn't want to pay for DO; the static site tier is $0 and keeps the DO prize track |
| 2026-10-25 | Raw PDFs not committed; pinned by sha256 in `data/sources.json` | `make data` refetches them |

## Open decisions (need your call)

1. **Official party nominations:** shown verbatim from the ballot (e.g. "Democrat, Working Families"). **Recommendation:** keep them. They're official ballot facts, not ideological labels.
2. **Portland Council (D3/D4, ~30 candidates):** in SHOULD as one background batch. **Recommendation:** keep it there, because a Portland participant may ask about it. If time is short, the measure alone carries the Portland demo.
3. **Portland scope:** Multnomah portion only, with a visible note. OK?

*(Resolved: measure arguments now exist for Corvallis and Portland, so the earlier "No arguments" question applies only to Eugene.)*

## Risks to watch

| Risk | Status | Fallback ready? |
|---|---|---|
| Gemma `response_schema` support | ✅ Works on both models (31B sometimes adds ``` fences; stripped) | — |
| API instability (503/500/timeouts seen) | 🔄 Real: batch runs took 7–10 min | 90 s timeout, retries, model fallback, per-item isolation, cache |
| 15+15 arguments produce poor themes | ⬜ | First 3 per side + "+12 more filed" |
| Two-column extraction order | ⬜ | pdfplumber column crop |
| Relocation misses | ⬜ | Cite Book 4 with "(Lane edition)" |
| DO deploy | ✅ Live. Uses public git source (DO GitHub app not connected), so no auto-deploy on push | Redeploy: `doctl apps create-deployment f9ac3d2b-4a71-46a9-b5a4-dace99f05d51` |

## Source files (verified 2026-10-25, all text PDFs)

| Doc ID | Pages | URL |
|---|---|---|
| book4 | 56 | https://sos.oregon.gov/elections/Voters-Pamphlet/Documents/VP_G26-Book4_web.pdf |
| lane_ballot | 12 | https://www.lanecounty.org/UserFiles/Servers/Server_3585797/File/County%20Clerk/Elections/Dated%20Elections/November%203,%202026/GE26_E_019%20Web.pdf |
| book6 | 44 | https://sos.oregon.gov/elections/Voters-Pamphlet/Documents/VP_G26-Book6_web.pdf |
| benton_vp | 40 | https://re.bentoncountyor.gov/wp-content/uploads/2026/09/2026Nov03-Benton-County-Voters-Pamphlet.pdf |
| book13 | 64 | https://sos.oregon.gov/elections/Voters-Pamphlet/Documents/VP_G26-Book13_web.pdf |
| multnomah_vp | 108 | https://multco.us/file/multnomah_county_voters'_pamphlet_-_november_2026_general_election/download |
