// Ballotty dashboard: the whole ballot on one page, searchable by issue. Renders precomputed,
// citation-checked JSON; no model calls happen in the browser.
const CITIES = [
  { id: "eugene", name: "Eugene", county: "Lane County" },
  { id: "corvallis", name: "Corvallis", county: "Benton County" },
  { id: "portland", name: "Portland", county: "Multnomah County" },
];
const TOPIC_ICON = {
  Housing: "house", "Cost of living": "wallet", Homelessness: "tent", Healthcare: "heart-pulse", Education: "graduation-cap",
  Childcare: "baby", "Public safety": "shield", "Jobs & economy": "briefcase", "Small business": "store", "Taxes & budget": "receipt",
  "Government accountability": "scale", "Environment & energy": "leaf", Transportation: "bus", Infrastructure: "construction",
  "Civil rights": "users", "Reproductive rights": "heart-handshake", "Labor & workers": "hard-hat", Immigration: "globe",
  "Agriculture & rural": "wheat", Veterans: "medal", "Seniors & Social Security": "hand-helping", "Elections & democracy": "vote",
};
// Everyday words people search with, mapped to the fixed topic list the pipeline tags with.
const SYNONYMS = {
  Housing: ["rent", "home", "homes", "housing", "afford", "apartment"],
  "Cost of living": ["cost", "prices", "inflation", "afford", "expensive"],
  Homelessness: ["homeless", "shelter", "unhoused", "camping"],
  Healthcare: ["health", "medical", "mental", "drug", "insurance", "hospital", "addiction"],
  Education: ["school", "teacher", "student", "preschool", "college", "classroom"],
  Childcare: ["child care", "childcare", "daycare", "kids"],
  "Public safety": ["police", "crime", "safety", "fire", "ambulance", "ems", "sheriff"],
  "Jobs & economy": ["job", "economy", "business", "growth"],
  "Small business": ["small business", "local business"],
  "Taxes & budget": ["tax", "budget", "fee", "spending", "levy", "money"],
  "Government accountability": ["corruption", "accountab", "audit", "transparen", "waste"],
  "Environment & energy": ["climate", "environment", "energy", "clean", "renewable", "fossil", "data center", "green"],
  Transportation: ["transit", "bus", "traffic", "transport", "bike"],
  Infrastructure: ["road", "infrastructure", "water", "bridge"],
  "Civil rights": ["civil rights", "equity", "discrimination", "rights"],
  "Reproductive rights": ["abortion", "reproductive", "birth control"],
  "Labor & workers": ["union", "wage", "worker", "labor", "minimum wage"],
  Immigration: ["immigra"],
  "Agriculture & rural": ["farm", "rural", "agricultur", "ranch"],
  Veterans: ["veteran", "military"],
  "Seniors & Social Security": ["social security", "senior", "medicare", "retire"],
  "Elections & democracy": ["election", "voting", "democracy", "term limit", "charter", "council"],
};
const KINDS = {
  federal: { label: "Federal", color: "var(--federal)" },
  state: { label: "Statewide", color: "var(--state)" },
  local: { label: "Local", color: "var(--local)" },
  measure: { label: "Measure", color: "var(--measure)" },
};

const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const plural = (n, one, many = one + "s") => `${n} ${n === 1 ? one : many}`;
const icon = (name) => `<i data-lucide="${name}" aria-hidden="true"></i>`;
const $ = (id) => document.getElementById(id);

const state = { data: {}, city: null, district: "all", picks: {}, query: "", compare: {} };
const index = new Map();

const store = {
  get(key, fallback) { try { return JSON.parse(localStorage.getItem(key)) ?? fallback; } catch { return fallback; } },
  set(key, value) { try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* private mode: lasts this visit */ } },
};

/* ---------- Data helpers ---------- */
function kindOf(c) {
  if (c.type === "measure") return "measure";
  if (c.id.startsWith("us-")) return "federal";
  if (c.id === "governor") return "state";
  return "local";
}
const titleOf = (c) => (c.type === "measure" ? `Measure ${c.items[0].measure_number}` : c.name);
const shortTitle = (c) => titleOf(c).replace(/^(Eugene|Corvallis|Portland) /, "").replace(/^US Representative, /, "US Rep, ");
const districtName = (c) => c.district_label.replace(/ voters only$| voters$/, "");
const districtContests = (data) => data.contests.filter((c) => c.district_label);
const visible = (data) => data.contests.filter((c) => !c.district_label || state.district === "all" || state.district === c.id);
function plain(text) {
  const t = text
    .replace(/^Lists\s+(?:[\w.'’-]+(?:'s|’s)\s+)?(?:occupation|occupational background|educational background|prior governmental experience)\s+(?:as|is|includes?)\s+/i, "")
    .replace(/^(?:Says|Lists)\s+(?:that\s+)?(?:[A-Z][\w.'’-]+\s+)?(?=[a-z])/, "")
    .replace(/^If approved, the measure would\s+/i, "");
  return (t.charAt(0).toUpperCase() + t.slice(1)).replace(/\.$/, "");
}
const label = (b) => b.short || plain(b.text);
function excerpt(b, words = 16) {
  const c = b.citations[0];
  const w = c.quote.split(/\s+/);
  return `${c.filed_by ? c.filed_by.split(",")[0] + ": " : ""}“${w.length > words ? w.slice(0, words).join(" ") + "…" : c.quote}”`;
}
function register(item, section, b, i) {
  const key = `${item.id}|${section}|${i}`;
  index.set(key, { item, section, bullet: b });
  return key;
}
function cityTopics(data) {
  const counts = new Map();
  for (const c of data.contests) for (const item of c.items) {
    new Set((item.summary || []).flatMap((b) => b.topics || [])).forEach((t) => counts.set(t, (counts.get(t) || 0) + 1));
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).map(([t]) => t);
}

/* ---------- Search ---------- */
function searchModel() {
  const q = state.query.trim().toLowerCase();
  if (q.length < 2) return null;
  const topics = Object.keys(SYNONYMS).filter((t) =>
    t.toLowerCase().includes(q) || (q.length >= 3 && SYNONYMS[t].some((s) => s.startsWith(q) || q.includes(s))));
  return { q, topics };
}
function pointMatches(m, b) {
  if (!m) return false;
  if ((b.topics || []).some((t) => m.topics.includes(t))) return true;
  if (m.q.length < 3) return false;
  return `${b.short || ""} ${b.text} ${b.citations.map((c) => c.quote).join(" ")}`.toLowerCase().includes(m.q);
}
const nameMatches = (m, item) => Boolean(m && item.name && item.name.toLowerCase().includes(m.q));
function itemHits(m, item) {
  const sections = item.type === "candidate" ? ["summary"] : ["summary", "for", "against"];
  return sections.reduce((n, s) => n + (item[s] || []).filter((b) => pointMatches(m, b)).length, 0);
}

/* ---------- Pieces ---------- */
function point(m, item, section, b, i, { withIcon = true } = {}) {
  const key = register(item, section, b, i);
  const verbatim = b.loaded_terms?.length > 0;
  const topic = (b.topics || [])[0];
  return `<li><button type="button" class="pt${verbatim ? " verbatim" : ""}${pointMatches(m, b) ? " match" : ""}" data-key="${esc(key)}" title="See the pamphlet text this came from">
    ${withIcon ? icon(TOPIC_ICON[topic] || "dot") : ""}
    <span><span class="t">${esc(verbatim ? excerpt(b) : label(b))}</span>${withIcon && b.topics?.length ? `<span class="tp">${b.topics.map(esc).join(", ")}</span>` : ""}</span>
  </button></li>`;
}

function candidateCard(m, c, item) {
  const picked = state.picks[c.id] === item.name;
  const dim = m && !nameMatches(m, item) && !itemHits(m, item);
  const pick = `<button type="button" class="pick" data-pick="${esc(c.id)}" data-value="${esc(item.name)}" aria-pressed="${picked}"><span class="oval"></span>${picked ? (c.ranked_choice ? "1st choice" : "Your pick") : "Pick"}</button>`;
  const head = `<div><h3>${esc(item.name)}</h3><p class="party">${esc(item.ballot_party_label)}</p></div>`;
  if (!item.statement_filed) {
    return `<article class="cand${picked ? " picked" : ""}${dim ? " dim" : ""}">${head}<p class="nost">Did not file a statement in the voters' pamphlet.</p><div class="cand-foot"><span></span>${pick}</div></article>`;
  }
  const job = item.background[0];
  return `<article class="cand${picked ? " picked" : ""}${dim ? " dim" : ""}">${head}
    ${job ? `<p class="job">${icon("briefcase")}<span>${esc(label(job))}</span></p>` : ""}
    ${item.summary.length ? `<ul class="points">${item.summary.map((b, i) => point(m, item, "summary", b, i)).join("")}</ul>` : `<p class="nost">No points passed the citation check.</p>`}
    <div class="cand-foot"><button type="button" class="linkish" data-list="${esc(item.id)}">${item.endorsements.length ? "Endorsements" : "Full statement"}</button>${pick}</div>
  </article>`;
}

function compareTable(m, c) {
  const filed = c.items.filter((i) => i.statement_filed);
  const topics = [...new Set(filed.flatMap((i) => i.summary.flatMap((b) => b.topics || [])))].sort();
  if (!topics.length) return "";
  const rows = topics.map((t) => `<tr class="${m && m.topics.includes(t) ? "match" : ""}"><th scope="row">${icon(TOPIC_ICON[t] || "dot")} ${esc(t)}</th>${filed.map((item) => {
    const i = item.summary.findIndex((b) => (b.topics || []).includes(t));
    if (i < 0) return `<td><span class="no" aria-label="Not mentioned">–</span></td>`;
    return `<td><button type="button" data-key="${esc(register(item, "summary", item.summary[i], i))}" aria-label="${esc(item.name)} on ${esc(t)}"></button></td>`;
  }).join("")}</tr>`).join("");
  return `<div class="compare"><table><thead><tr><th></th>${filed.map((i) => `<th scope="col">${esc(i.name)}</th>`).join("")}</tr></thead><tbody>${rows}</tbody></table></div>`;
}

function measureBody(m, c) {
  const item = c.items[0];
  const f = item.arguments_filed;
  const max = Math.max(f.for, f.against, 1);
  const pick = state.picks[c.id];
  const list = (section) => item[section].map((b, i) => point(m, item, section, b, i, { withIcon: false })).join("");
  const side = (key, title) => `<section class="side"><h4 class="sec-h">${icon(key === "for" ? "thumbs-up" : "thumbs-down")}${title}</h4>${
    !f[key] ? `<p class="empty">${esc(item.no_arguments_note || `No arguments ${key === "for" ? "in favor" : "in opposition"} were filed.`)}</p>`
    : item[key].length ? `<ul class="points">${list(key)}</ul>` : `<p class="empty">No condensed point passed the citation check.</p>`}</section>`;
  const yn = (v) => `<button type="button" class="pick" data-pick="${esc(c.id)}" data-value="${v}" aria-pressed="${pick === v}"><span class="oval"></span>${v}</button>`;
  const who = (k) => (f[k] ? plural(item.filers[k].length, "filer") : "none filed");
  return `<div class="m-grid">
    <div>${item.caption ? `<p class="cap">${esc(item.caption)}</p>` : ""}<p class="src">Ballot title as printed. ${esc(item.source.title)}, ${esc(item.verify_label)}</p></div>
    <div><h4 class="sec-h">${icon("check-circle")}If it passes</h4><ul class="tiles">${list("summary")}</ul></div>
    <div class="balance" aria-label="${f.for} arguments filed in favor, ${f.against} in opposition">
      <span class="n">${f.for}<small>for, ${who("for")}</small></span>
      <div class="bar2"><div class="h l"><i style="width:${(f.for / max) * 100}%"></i></div><div class="m"></div><div class="h r"><i style="width:${(f.against / max) * 100}%"></i></div></div>
      <span class="n r">${f.against}<small>against, ${who("against")}</small></span>
    </div>
    <div class="sides">${side("for", "Supporters argue")}${side("against", "Opponents argue")}</div>
    <div class="m-foot"><p class="method">Both sides condensed with the same instructions, at most 3 points each.</p><div class="yn">${yn("Yes")}${yn("No")}</div></div>
  </div>`;
}

function contestSection(m, c) {
  const kind = KINDS[kindOf(c)];
  const hits = m ? c.items.reduce((n, i) => n + itemHits(m, i) + (nameMatches(m, i) ? 1 : 0), 0) : 1;
  if (!hits) {
    return `<section class="contest quiet" id="c-${esc(c.id)}" style="--c:${kind.color}">
      <header class="c-head slim"><h2>${esc(titleOf(c))}</h2><span class="none-here">No mention of this search</span></header></section>`;
  }
  const filed = c.items.filter((i) => i.statement_filed).length;
  const pills = [
    c.district_label && `<span class="pill">${esc(districtName(c))}</span>`,
    c.ranked_choice && `<span class="pill">Ranked choice</span>`,
    c.type === "measure" && `<span class="pill">${esc(c.items[0].jurisdiction)}</span>`,
    c.type !== "measure" && `<span>${plural(c.items.length, "candidate")}, ballot order</span>`,
  ].filter(Boolean).join("");
  const open = state.compare[c.id];
  const actions = c.type !== "measure" && filed > 1
    ? `<div class="actions"><button type="button" class="ghost" data-compare="${esc(c.id)}" aria-pressed="${!!open}">${icon("table")}<span class="lbl">${open ? "Hide" : "Compare"} topics</span></button></div>` : "";
  const body = c.type === "measure"
    ? measureBody(m, c)
    : `<div class="cands">${c.items.map((i) => candidateCard(m, c, i)).join("")}</div>${open ? compareTable(m, c) : ""}`;
  return `<section class="contest" id="c-${esc(c.id)}" style="--c:${kind.color}">
    <header class="c-head"><div><div class="kind">${kind.label} ${pills}</div><h2>${esc(titleOf(c))}</h2></div>${actions}</header>
    <div class="c-body">${body}</div>
  </section>`;
}

/* ---------- Page ---------- */
function renderRail(data, m) {
  const cs = visible(data);
  $("rail").innerHTML = `<p class="r-title">Your ballot</p><ol>${cs.map((c) => {
    const hits = m ? c.items.reduce((n, i) => n + itemHits(m, i) + (nameMatches(m, i) ? 1 : 0), 0) : 0;
    const pick = state.picks[c.id];
    return `<li><a href="#c-${esc(c.id)}" data-jump="${esc(c.id)}" style="--c:${KINDS[kindOf(c)].color}"><span class="bar"></span>
      <span><span class="nm">${esc(shortTitle(c))}</span><span class="pk${pick ? "" : " open"}">${pick ? esc(pick) : "Not decided"}</span></span>
      ${hits ? `<span class="hit">${hits}</span>` : pick ? `<span class="ok">${icon("check")}</span>` : "<span></span>"}</a></li>`;
  }).join("")}</ol>
  <button type="button" class="btn ghost print" data-print>${icon("printer")}Print my picks</button>`;
}

function renderMain(data, m) {
  index.clear();
  const cs = visible(data);
  const decided = cs.filter((c) => state.picks[c.id]).length;
  const dcs = districtContests(data);
  const unit = dcs[0]?.id.startsWith("us-rep") ? "district" : "ward";
  const districtSelect = dcs.length
    ? `<select data-district aria-label="Your ${unit}">
        <option value="all" ${state.district === "all" ? "selected" : ""}>All ${unit}s</option>
        ${dcs.map((c) => `<option value="${esc(c.id)}" ${state.district === c.id ? "selected" : ""}>${esc(districtName(c))}</option>`).join("")}
        <option value="none" ${state.district === "none" ? "selected" : ""}>None of these</option>
      </select>` : "";
  let results = "";
  if (m) {
    const groups = cs.map((c) => {
      const names = c.items.filter((i) => itemHits(m, i) || nameMatches(m, i)).map((i) => i.name);
      return names.length ? { c, names } : null;
    }).filter(Boolean);
    const lead = m.topics.length ? m.topics.map((t) => `${icon(TOPIC_ICON[t] || "dot")} ${esc(t)}`).join(", ") : `“${esc(state.query.trim())}”`;
    results = groups.length
      ? `<div class="results"><p class="lead">${lead}<button type="button" class="clear" data-clear-search>Clear search</button></p>
          <div class="jumps">${groups.map(({ c, names }) => `<a href="#c-${esc(c.id)}" data-jump="${esc(c.id)}">${esc(titleOf(c))}${c.type === "measure" ? "" : `: ${esc(names.join(", "))}`}</a>`).join("")}</div></div>`
      : `<div class="results"><p class="lead">Nothing on this ballot mentions ${lead}.<button type="button" class="clear" data-clear-search>Clear search</button></p>
          <div class="chips">${cityTopics(data).slice(0, 8).map((t) => `<button type="button" class="chip" data-topic="${esc(t)}">${icon(TOPIC_ICON[t] || "dot")}${esc(t)}</button>`).join("")}</div></div>`;
  }
  const quick = m ? "" : `<div class="quick">Popular issues: ${cityTopics(data).slice(0, 7).map((t) => `<button type="button" class="chip" data-topic="${esc(t)}">${icon(TOPIC_ICON[t] || "dot")}${esc(t)}</button>`).join("")}</div>`;
  $("main").className = `main${m ? " searching" : ""}`;
  $("main").innerHTML = `
    <div class="page-head">
      <div><h1>${esc(data.name)} ballot</h1>
        <p class="sub">${plural(cs.length, "contest")} on the November 3, 2026 ballot. <b>Every point links to the official pamphlet page it came from;</b> tap one to see the source.</p></div>
      <div class="tools">${districtSelect}<span class="progress"><span class="meter"><i style="width:${cs.length ? (decided / cs.length) * 100 : 0}%"></i></span>${decided} of ${cs.length} decided</span></div>
    </div>
    ${data.coverage_note ? `<p class="note">${esc(data.coverage_note)}</p>` : ""}
    ${results}${quick}
    ${cs.map((c) => contestSection(m, c)).join("")}`;
}

function renderFoot(data) {
  $("foot").innerHTML = `<p>Ballotty is not affiliated with the Oregon Secretary of State, any county elections office, any city, or any campaign. Points are condensed by Gemma 4 from official documents and checked against the page they cite, but can still contain errors: open the source before relying on one. Candidate points are self-reported. Ballotty never recommends how to vote, and your picks stay in this browser.</p>
    <p>Sources for ${esc(data.name)}: ${data.sources.map((s) => `<a href="${esc(s.url)}" target="_blank" rel="noopener">${esc(s.title)}</a>`).join("; ")}. <a href="https://github.com/dalmartin/ballotty">Open source on GitHub</a>.</p>`;
}

function paint({ keepScroll = true } = {}) {
  const data = state.data[state.city];
  const m = searchModel();
  const y = window.scrollY;
  renderRail(data, m);
  renderMain(data, m);
  renderFoot(data);
  window.lucide?.createIcons();
  if (keepScroll) window.scrollTo({ top: y, behavior: "instant" });
}

/* ---------- Drawer ---------- */
let lastFocus = null;
function showDrawer(html) {
  lastFocus = document.activeElement;
  $("drawer").innerHTML = `<button type="button" class="close" data-close>Close</button>${html}`;
  $("drawer").hidden = false;
  $("scrim").hidden = false;
  window.lucide?.createIcons();
  $("drawer").querySelector(".close").focus();
}
function closeDrawer() {
  $("drawer").hidden = true;
  $("scrim").hidden = true;
  lastFocus?.focus();
}
function openSource(key) {
  const entry = index.get(key);
  if (!entry) return;
  const { item, section, bullet } = entry;
  const from = item.type === "candidate" ? `${item.name}'s statement` : section === "summary" ? `the Measure ${item.measure_number} ballot title` : `arguments ${section === "for" ? "in favor of" : "against"} Measure ${item.measure_number}`;
  const quotes = bullet.citations.map((c) => `<blockquote><mark>${esc(c.quote)}</mark></blockquote>
    ${c.filed_by ? `<p class="doc">Filed by ${esc(c.filed_by)}</p>` : ""}
    <p class="doc">${esc(item.source.title)}, ${esc(c.page_label)}</p>
    <p class="ok">${icon("badge-check")}Matched on this page by the citation check</p>
    <a class="open" href="${esc(c.url)}" target="_blank" rel="noopener">${icon("file-text")}Open ${esc(c.page_label)}</a>`).join(`<div class="sep"></div>`);
  showDrawer(`<h2>Where this came from</h2>
    <p class="said">From ${esc(from)}. Ballotty's summary: <b>${esc(bullet.text)}</b></p>
    ${bullet.loaded_terms?.length ? `<p class="warn">Our wording used loaded language (${esc(bullet.loaded_terms.join(", "))}), so the pamphlet's own words are shown instead.</p>` : ""}
    ${quotes}`);
}
function openList(itemId) {
  const item = state.data[state.city].contests.flatMap((c) => c.items).find((i) => i.id === itemId);
  const section = (name, title) => {
    const list = item[name] || [];
    return `<h3>${title}</h3>${list.length ? `<ul class="list">${list.map((b, i) => `<li><button type="button" data-key="${esc(register(item, name, b, i))}">${esc(plain(b.text))}</button><span class="pg">${esc([...new Set(b.citations.map((c) => c.page_label))].join(", "))}</span></li>`).join("")}</ul>` : `<p class="doc">Nothing listed in the pamphlet.</p>`}`;
  };
  showDrawer(`<h2>${esc(item.name)}</h2>
    <p class="said">Self-reported in the voters' pamphlet${item.furnished_by ? `, furnished by ${esc(item.furnished_by)}` : ""}. Tap a line to see the exact words.</p>
    ${section("endorsements", "Endorsements they list")}${section("summary", "What they say")}${section("background", "Background they list")}
    <div class="sep"></div><a class="open" href="${esc(item.verify_url)}" target="_blank" rel="noopener">${icon("file-text")}Open the full statement, ${esc(item.verify_label)}</a>`);
}

/* ---------- City + events ---------- */
async function loadCity(id) {
  if (state.data[id]) return state.data[id];
  const res = await fetch(`data/${id}.json`);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return (state.data[id] = await res.json());
}
async function setCity(id) {
  const city = CITIES.some((c) => c.id === id) ? id : store.get("ballotty-city", "eugene");
  try {
    await loadCity(city);
  } catch (e) {
    $("main").innerHTML = `<p class="loading">Couldn't load the ${esc(city)} ballot (${esc(e.message)}). Reload the page to try again.</p>`;
    return;
  }
  state.city = city;
  store.set("ballotty-city", city);
  state.picks = store.get(`ballotty-picks-${city}`, {});
  state.district = store.get(`ballotty-district-${city}`, "all");
  $("city").value = city;
  $("topic-list").innerHTML = cityTopics(state.data[city]).map((t) => `<option value="${esc(t)}">`).join("");
  paint({ keepScroll: false });
  window.scrollTo({ top: 0, behavior: "instant" });
}

$("city").innerHTML = CITIES.map((c) => `<option value="${c.id}">${c.name}</option>`).join("");
$("city").addEventListener("change", (e) => { history.replaceState(null, "", `#${e.target.value}`); setCity(e.target.value); });
$("q").placeholder = window.matchMedia("(max-width: 640px)").matches ? "Search" : "Search issues or candidates: housing, taxes, Kotek";
let typing;
$("q").addEventListener("input", (e) => {
  clearTimeout(typing);
  typing = setTimeout(() => { state.query = e.target.value; paint(); }, 120);
});

document.addEventListener("click", (e) => {
  const el = (sel) => e.target.closest(sel);
  if (e.target === $("scrim") || el("[data-close]")) return closeDrawer();
  if (el("[data-key]")) return openSource(el("[data-key]").dataset.key);
  if (el("[data-list]")) return openList(el("[data-list]").dataset.list);
  if (el("[data-jump]")) {
    // Scroll without touching the URL hash, which holds the city.
    e.preventDefault();
    return document.getElementById(`c-${el("[data-jump]").dataset.jump}`)?.scrollIntoView({ behavior: "smooth", block: "start" });
  }
  if (el("[data-topic]")) { state.query = $("q").value = el("[data-topic]").dataset.topic; return paint(); }
  if (el("[data-clear-search]")) { state.query = $("q").value = ""; return paint(); }
  if (el("[data-compare]")) { const id = el("[data-compare]").dataset.compare; state.compare[id] = !state.compare[id]; return paint(); }
  if (el("[data-pick]")) {
    const b = el("[data-pick]");
    if (state.picks[b.dataset.pick] === b.dataset.value) delete state.picks[b.dataset.pick];
    else state.picks[b.dataset.pick] = b.dataset.value;
    store.set(`ballotty-picks-${state.city}`, state.picks);
    return paint();
  }
  if (el("[data-print]")) {
    const data = state.data[state.city];
    $("print-sheet").innerHTML = `<h1>My ballot picks: ${esc(data.name)}, November 3, 2026</h1><ol>${visible(data).map((c) => `<li><b>${esc(titleOf(c))}</b>: ${esc(state.picks[c.id] || "not decided")}</li>`).join("")}</ol><p>Made with Ballotty. Ballotty does not recommend how to vote.</p>`;
    window.print();
  }
});
document.addEventListener("change", (e) => {
  if (!e.target.matches("[data-district]")) return;
  state.district = e.target.value;
  store.set(`ballotty-district-${state.city}`, state.district);
  paint();
});
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && !$("drawer").hidden) return closeDrawer();
  if (e.key === "/" && document.activeElement !== $("q")) { e.preventDefault(); $("q").focus(); }
});
window.addEventListener("hashchange", () => { const id = location.hash.slice(1); if (CITIES.some((c) => c.id === id)) setCity(id); });
setCity(location.hash.slice(1));
