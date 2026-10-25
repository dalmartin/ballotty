// Ballotty dashboard: renders precomputed, citation-checked ballot JSON. No model calls happen here.
const CITIES = [
  { id: "eugene", name: "Eugene" },
  { id: "corvallis", name: "Corvallis" },
  { id: "portland", name: "Portland" },
];
const ELECTION_DAY = new Date("2026-11-03T20:00:00-08:00");
const GROUPS = [
  ["federal", "Federal"],
  ["state", "Statewide"],
  ["local", "Local"],
  ["measures", "Measures"],
];
const ROWS = [
  ["summary", "What they say", true],
  ["background", "Background", true],
  ["endorsements", "Endorsements", true],
];

const clip = (s, n = 160) => (String(s).length > n ? String(s).slice(0, n).trimEnd() + "…" : String(s));
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const plural = (n, one, many = one + "s") => `${n} ${n === 1 ? one : many}`;
const $ = (id) => document.getElementById(id);

const state = { data: {}, city: null, contest: null, selected: null };
let sentenceIndex = new Map();

function group(contest) {
  if (contest.type === "measure") return "measures";
  if (contest.id.startsWith("us-")) return "federal";
  if (contest.id === "governor") return "state";
  return "local";
}

function sectionsOf(item) {
  return item.type === "candidate" ? ["summary", "background", "endorsements"] : ["summary", "for", "against"];
}

function cityStats(data) {
  const items = data.contests.flatMap((c) => c.items);
  const cands = items.filter((i) => i.type === "candidate");
  const sentences = items.reduce((n, i) => n + sectionsOf(i).reduce((m, s) => m + (i[s]?.length || 0), 0), 0);
  return {
    contests: data.contests.length,
    candidates: cands.length,
    statements: cands.filter((c) => c.statement_filed).length,
    measures: items.filter((i) => i.type === "measure").length,
    sentences,
    removed: items.reduce((n, i) => n + i.checks.dropped.length, 0),
    quoted: items.reduce((n, i) => n + i.checks.flagged.length, 0),
  };
}

function daysLeft() {
  const ms = ELECTION_DAY - new Date();
  if (ms <= 0) return "Election Day was November 3, 2026";
  const d = Math.ceil(ms / 86400000);
  return d === 1 ? "Election Day is tomorrow, November 3" : `${d} days until Election Day, November 3`;
}

/* ---------- Top: city switch + ledger ---------- */
function renderCities() {
  $("cities").innerHTML = CITIES.map(
    (c) => `<button type="button" role="tab" data-city="${c.id}" aria-selected="${c.id === state.city}">${c.name}</button>`
  ).join("");
}

function renderLedger(data) {
  const s = cityStats(data);
  $("ledger").innerHTML = `
    <span class="stat"><b>${s.contests}</b>contests</span>
    <span class="stat"><b>${s.candidates}</b>candidates, ${s.statements} filed statements</span>
    <span class="stat"><b>${s.measures}</b>${s.measures === 1 ? "measure" : "measures"}</span>
    <span class="stat verified" title="Every displayed sentence's quote was found on its cited page"><b>${s.sentences}</b>sentences traced to a page</span>
    <span class="stat removed" title="Sentences whose quote could not be found on the cited page were removed"><b>${s.removed}</b>removed by the citation check</span>
    <span class="stat removed" title="Paraphrases flagged for loaded language were replaced with the pamphlet's own words"><b>${s.quoted}</b>replaced with exact quotes</span>`;
  $("when").textContent = daysLeft();
}

/* ---------- Rail ---------- */
function railMeta(c) {
  if (c.type === "measure") {
    const m = c.items[0];
    const f = m.arguments_filed;
    return f.for + f.against ? `${f.for} arguments for, ${f.against} against` : "No arguments filed";
  }
  const filed = c.items.filter((i) => i.statement_filed).length;
  return `${plural(c.items.length, "candidate")}, ${filed} with statements`;
}

function renderRail(data) {
  $("rail").innerHTML = GROUPS.map(([g, label]) => {
    const cs = data.contests.filter((c) => group(c) === g);
    if (!cs.length) return "";
    return `<h2>${label}</h2>${cs
      .map((c) => `<button type="button" data-contest="${c.id}" aria-current="${c.id === state.contest}">
        <span class="r-name">${esc(c.type === "measure" ? `Measure ${c.items[0].measure_number}` : c.name)}</span>
        ${c.type === "measure" ? `<span class="r-meta">${esc(c.items[0].jurisdiction)}</span>` : c.district_label ? `<span class="r-meta">${esc(c.district_label)}</span>` : ""}
        <span class="r-meta">${esc(railMeta(c))}</span>
      </button>`)
      .join("")}`;
  }).join("");
}

/* ---------- Sentences ---------- */
function sentence(item, section, b, i) {
  const key = `${item.id}|${section}|${i}`;
  sentenceIndex.set(key, { item, section, bullet: b });
  const pages = [...new Set(b.citations.map((c) => c.page_label))];
  const verbatim = b.loaded_terms.length > 0;
  return `<li><button type="button" class="sent${verbatim ? " verbatim" : ""}" data-key="${esc(key)}" aria-pressed="${state.selected === key}">
    ${esc(b.text)}<span class="pg">${esc(pages.join(", "))}</span>${verbatim ? `<span class="vb">Shown in the pamphlet's own words</span>` : ""}
  </button></li>`;
}

function sentences(item, section, emptyText) {
  const list = item[section] || [];
  if (!list.length) return `<p class="none">${esc(emptyText)}</p>`;
  return `<ul class="sents">${list.map((b, i) => sentence(item, section, b, i)).join("")}</ul>`;
}

/* ---------- Candidates: comparison grid ---------- */
function candidateGrid(contest) {
  const items = contest.items;
  const cells = [`<div class="corner" style="--c:1;--r:1"></div>`];
  ROWS.forEach(([, label, self], r) => {
    cells.push(`<div class="row-label" style="--c:1;--r:${r + 2}">${label}${self ? "<small>self-reported</small>" : ""}</div>`);
  });
  items.forEach((item, k) => {
    const c = k + 2;
    cells.push(`<div class="head" style="--c:${c};--r:1">
      <span class="cand-order">Ballot position ${item.ballot_order}</span>
      <p class="cand-name">${esc(item.name)}</p>
      <p class="cand-ballot">${esc(item.ballot_party_label)}</p>
      ${item.furnished_by ? `<p class="cand-ballot"><span>Statement furnished by</span> ${esc(item.furnished_by)}</p>` : ""}
    </div>`);
    if (!item.statement_filed) {
      cells.push(`<div class="cell nostatement" style="--c:${c};--r:2;--span:3" data-label="Statement">Did not submit a statement to the voters' pamphlet. Ballotty leaves this blank rather than filling it in.</div>`);
      return;
    }
    ROWS.forEach(([section, label], r) => {
      cells.push(`<div class="cell" style="--c:${c};--r:${r + 2}" data-label="${label} (self-reported)">${sentences(item, section, "Nothing filed in the pamphlet.")}</div>`);
    });
  });
  return `<div class="compare" style="--n:${items.length}">${cells.join("")}</div>`;
}

/* ---------- Measures ---------- */
function measureView(m) {
  const f = m.arguments_filed;
  const max = Math.max(f.for, f.against, 1);
  const filersLine = (side) => (f[side] ? `from ${plural(m.filers[side].length, "filer")}` : "");
  const sideBody = (side) => {
    if (!f[side]) {
      return `<p class="none">${esc(m.no_arguments_note || `No arguments ${side === "for" ? "in favor" : "in opposition"} were filed for this measure.`)}</p>`;
    }
    if (!m[side].length) return `<p class="none">None of the condensed points passed the citation check. Read the arguments in the pamphlet.</p>`;
    return m[side]
      .map((t, i) => `<div class="theme"><ul class="sents">${sentence(m, side, t, i)}</ul><p class="by">Made in arguments filed by ${t.filed_by.map(esc).join("; ")}</p></div>`)
      .join("");
  };
  return `<div class="measure">
    <div class="title-block">
      ${m.caption ? `<p class="caption">${esc(m.caption)}</p>` : ""}
      ${m.question ? `<p class="question">${esc(m.question)}</p>` : ""}
      ${!m.caption && !m.question ? `<p class="none">The ballot title could not be matched to the source text. Read it on the linked page.</p>` : ""}
      <p class="attr">Ballot title, exactly as printed. ${esc(m.source.title)}, ${esc(m.verify_label)}.</p>
    </div>
    <div class="block"><h2>What it would do</h2>${sentences(m, "summary", "No summary passed the citation check.")}</div>
    <div class="block">
      <h2>Arguments filed in the official pamphlet</h2>
      <div class="balance" role="img" aria-label="${f.for} arguments in favor, ${f.against} in opposition">
        <span class="lbl"><b>${f.for}</b>in favor</span><span></span><span class="lbl right"><b>${f.against}</b>in opposition</span>
        <div class="bar"><div class="half l"><i style="width:${(f.for / max) * 100}%"></i></div><div class="mid"></div><div class="half r"><i style="width:${(f.against / max) * 100}%"></i></div></div>
        <div class="filers"><span>${filersLine("for")}</span><span>${filersLine("against")}</span></div>
      </div>
      <p class="method">Both sides are condensed with the same instructions into at most 3 points, and each point names who filed the arguments behind it.</p>
    </div>
    <div class="sides">
      <section><h3>In favor</h3>${sideBody("for")}</section>
      <section><h3>In opposition</h3>${sideBody("against")}</section>
    </div>
  </div>`;
}

/* ---------- Stage ---------- */
function renderStage(data) {
  sentenceIndex = new Map();
  const c = data.contests.find((x) => x.id === state.contest) || data.contests[0];
  const pills = [
    c.district_label && `<span class="pill">${esc(c.district_label)}</span>`,
    c.ranked_choice && `<span class="pill rcv">Ranked choice</span>`,
  ].filter(Boolean).join("");
  const title = c.type === "measure" ? `Measure ${c.items[0].measure_number}` : c.name;
  const sub = c.type === "measure"
    ? `${esc(c.items[0].jurisdiction)}. Click any sentence to see the exact pamphlet text it came from.`
    : `${plural(c.items.length, "candidate")} in ballot order. Click any sentence to see the exact pamphlet text it came from.`;
  $("stage").innerHTML = `
    ${data.coverage_note ? `<p class="coverage">${esc(data.coverage_note)}</p>` : ""}
    <div class="contest-head"><h1>${esc(title)}</h1>${pills}</div>
    <p class="contest-sub">${sub}</p>
    ${c.type === "measure" ? measureView(c.items[0]) : candidateGrid(c)}`;
  return c;
}

/* ---------- Inspector ---------- */
function checkLog(contest) {
  const rows = [];
  for (const item of contest.items) {
    const who = item.type === "candidate" ? item.name : `Measure ${item.measure_number}`;
    for (const d of item.checks.dropped) rows.push(`<li><span class="why">Removed: ${esc(d.reason)}</span>${esc(who)}: <q>${esc(clip(d.text))}</q></li>`);
    for (const f of item.checks.flagged) rows.push(`<li><span class="why">Loaded language (${esc(f.loaded_terms.join(", "))}), so the exact quote is shown</span>${esc(who)}: <q>${esc(clip(f.text))}</q></li>`);
  }
  const shown = contest.items.reduce((n, i) => n + sectionsOf(i).reduce((m, s) => m + (i[s]?.length || 0), 0), 0);
  return `<div class="ins-section"><h3>Checks for this contest</h3>
    <p class="check"><span class="dot"></span><span>${plural(shown, "sentence")} shown. Each one's quote was found on the page it cites.</span></p>
    ${rows.length ? `<p class="check warn"><span class="dot"></span><span>${rows.length} caught by the safeguards:</span></p><ul class="log">${rows.join("")}</ul>` : `<p class="check"><span class="dot"></span><span>Nothing was removed or rewritten.</span></p>`}
  </div>`;
}

function renderInspector(contest) {
  const sel = state.selected && sentenceIndex.get(state.selected);
  const first = contest.items.find((i) => i.verify_url);
  if (!sel) {
    $("inspector").innerHTML = `<h2>Source</h2>
      <p class="hint">Select any sentence to see the pamphlet's exact words and the page they are on.</p>
      ${first ? `<a class="open-pdf" href="${esc(first.verify_url)}" target="_blank" rel="noopener">Open the official pamphlet</a>` : ""}
      ${checkLog(contest)}`;
    return;
  }
  const { item, section, bullet } = sel;
  const quotes = bullet.citations
    .map((c) => `<blockquote class="src-quote fresh"><mark>${esc(c.quote)}</mark></blockquote>
      ${c.filed_by ? `<p class="src-said">From the argument filed by <b>${esc(c.filed_by)}</b></p>` : ""}
      <p class="check"><span class="dot"></span><span>Found on ${esc(c.page_label)} of ${esc(item.source.title)}</span></p>
      <a class="open-pdf" href="${esc(c.url)}" target="_blank" rel="noopener">Open ${esc(c.page_label)} in the PDF</a>`)
    .join(`<div class="ins-section"></div>`);
  const loaded = bullet.loaded_terms.length
    ? `<p class="check warn"><span class="dot"></span><span>Our summary used loaded language (${esc(bullet.loaded_terms.join(", "))}), so the pamphlet's own words are shown instead.</span></p>`
    : "";
  const who = item.type === "candidate" ? `${item.name}, ${section === "summary" ? "statement" : section}` : `Measure ${item.measure_number}, ${section === "summary" ? "summary" : section === "for" ? "arguments in favor" : "arguments in opposition"}`;
  $("inspector").innerHTML = `<button type="button" class="close" data-close aria-label="Close source">Close</button><h2>Source for this sentence</h2>
    <p class="src-doc">${esc(item.source.title)}</p>
    <p class="src-pub">${esc(item.source.publisher)}. ${esc(who)}.</p>
    <p class="src-said">Ballotty wrote: <b>${esc(bullet.text)}</b></p>
    ${loaded}${quotes}${checkLog(contest)}`;
  requestAnimationFrame(() => document.querySelectorAll(".src-quote.fresh").forEach((q) => q.classList.remove("fresh")));
}

function renderSources(data) {
  $("sources").innerHTML = `Official sources for ${esc(data.name)}:<ul>${data.sources
    .map((s) => `<li><a href="${esc(s.url)}" target="_blank" rel="noopener">${esc(s.title)}</a>, ${esc(s.publisher)} <code>sha256 ${esc(s.sha256.slice(0, 12))}</code></li>`)
    .join("")}</ul>`;
}

/* ---------- Routing ---------- */
function paint() {
  const data = state.data[state.city];
  $("inspector").classList.remove("sheet");
  renderCities();
  renderLedger(data);
  if (!data.contests.some((c) => c.id === state.contest)) state.contest = data.contests[0].id;
  renderRail(data);
  const contest = renderStage(data);
  renderInspector(contest);
  renderSources(data);
}

async function route() {
  const [city, contest] = location.hash.slice(1).split("/");
  state.city = CITIES.some((c) => c.id === city) ? city : "eugene";
  state.contest = contest || null;
  state.selected = null;
  if (!state.data[state.city]) {
    const res = await fetch(`/api/${state.city}`);
    if (!res.ok) {
      $("stage").innerHTML = `<p class="none">Could not load the ballot for this city (HTTP ${res.status}). Reload the page to try again.</p>`;
      return;
    }
    state.data[state.city] = await res.json();
  }
  paint();
}

document.addEventListener("click", (e) => {
  const city = e.target.closest("[data-city]");
  if (city) { location.hash = city.dataset.city; return; }
  const contest = e.target.closest("[data-contest]");
  if (contest) { location.hash = `${state.city}/${contest.dataset.contest}`; $("stage").focus({ preventScroll: true }); window.scrollTo({ top: 0 }); return; }
  const sent = e.target.closest(".sent");
  if (sent) {
    state.selected = state.selected === sent.dataset.key ? null : sent.dataset.key;
    document.querySelectorAll(".sent").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.key === state.selected)));
    const data = state.data[state.city];
    renderInspector(data.contests.find((c) => c.id === state.contest) || data.contests[0]);
    $("inspector").classList.toggle("sheet", Boolean(state.selected));
    if (state.selected && window.matchMedia("(max-width: 1180px) and (min-width: 761px)").matches) $("inspector").scrollIntoView({ behavior: "smooth", block: "start" });
    return;
  }
  if (e.target.closest("[data-close]")) {
    state.selected = null;
    document.querySelectorAll(".sent").forEach((b) => b.setAttribute("aria-pressed", "false"));
    $("inspector").classList.remove("sheet");
    const data = state.data[state.city];
    renderInspector(data.contests.find((c) => c.id === state.contest) || data.contests[0]);
  }
});
window.addEventListener("hashchange", route);
route();
