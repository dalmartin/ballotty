// Ballotty: a guided, one-decision-at-a-time ballot. Renders precomputed, citation-checked JSON.
const CITIES = [
  { id: "eugene", name: "Eugene", county: "Lane County" },
  { id: "corvallis", name: "Corvallis", county: "Benton County" },
  { id: "portland", name: "Portland", county: "Multnomah County" },
];
const MYVOTE = "https://sos.oregon.gov/elections/pages/myvote.aspx";
const TOPIC_ICON = {
  Housing: "house", "Cost of living": "wallet", Homelessness: "tent", Healthcare: "heart-pulse", Education: "graduation-cap",
  Childcare: "baby", "Public safety": "shield", "Jobs & economy": "briefcase", "Small business": "store", "Taxes & budget": "receipt",
  "Government accountability": "scale", "Environment & energy": "leaf", Transportation: "bus", Infrastructure: "construction",
  "Civil rights": "users", "Reproductive rights": "heart-handshake", "Labor & workers": "hard-hat", Immigration: "globe",
  "Agriculture & rural": "wheat", Veterans: "medal", "Seniors & Social Security": "hand-helping", "Elections & democracy": "vote",
  Other: "circle-dot",
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

const state = { data: {}, city: null, setup: { district: null, priorities: [] }, picks: {}, pair: {} };
const index = new Map();

/* ---------- Storage: per-viewer conveniences; the app works without them ---------- */
const store = {
  get(key, fallback) { try { return JSON.parse(localStorage.getItem(key)) ?? fallback; } catch { return fallback; } },
  set(key, value) { try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* private mode */ } },
};
const savePicks = () => store.set(`ballotty-picks-${state.city}`, state.picks);
const saveSetup = () => store.set(`ballotty-setup-${state.city}`, state.setup);

/* ---------- Data helpers ---------- */
function kindOf(c) {
  if (c.type === "measure") return "measure";
  if (c.id.startsWith("us-")) return "federal";
  if (c.id === "governor") return "state";
  return "local";
}
const districtName = (c) => c.district_label.replace(/ voters only$| voters$/, "");
const districtContests = (data) => data.contests.filter((c) => c.district_label);
function visibleContests(data) {
  const d = state.setup.district;
  return data.contests.filter((c) => !c.district_label || d === "all" || d === null || d === c.id);
}
const titleOf = (c) => (c.type === "measure" ? `Measure ${c.items[0].measure_number}` : c.name);
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
  const q = w.length > words ? w.slice(0, words).join(" ") + "…" : c.quote;
  return `${c.filed_by ? c.filed_by.split(",")[0] + ": " : ""}“${q}”`;
}
function register(item, section, b, i) {
  const key = `${item.id}|${section}|${i}`;
  index.set(key, { item, section, bullet: b });
  return key;
}
function primaryTopic(b) {
  const ts = b.topics || [];
  return ts.find((t) => state.setup.priorities.includes(t)) || ts[0] || "Other";
}
function cityTopics(data) {
  const counts = new Map();
  for (const c of data.contests) for (const item of c.items) {
    new Set((item.summary || []).flatMap((b) => b.topics || [])).forEach((t) => counts.set(t, (counts.get(t) || 0) + 1));
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).map(([t]) => t);
}

/* ---------- Shared chrome ---------- */
function topBar(contests, hereIndex) {
  const segs = contests.map((c, i) => `<button type="button" class="seg${state.picks[c.id] ? " done" : ""}${i === hereIndex ? " here" : ""}" style="--seg:${KINDS[kindOf(c)].color}" data-go="${i}" aria-label="${esc(titleOf(c))}${state.picks[c.id] ? ", decided" : ""}"></button>`).join("");
  const decided = contests.filter((c) => state.picks[c.id]).length;
  const city = CITIES.find((c) => c.id === state.city);
  return `<header class="bar"><div class="bar-inner">
    <a class="logo" href="#">Ballotty</a>
    <span class="where">${esc(city.name)} <button type="button" data-route="">change</button></span>
    <div class="segs">${segs}</div>
    <span class="count">${decided}/${contests.length}</span>
  </div></header>`;
}

/* ---------- Landing ---------- */
function renderLanding() {
  const cards = CITIES.map((c) => {
    const d = state.data[c.id];
    const n = d ? d.contests.length : null;
    return `<button type="button" class="city" data-route="${c.id}">
      <span><span class="name">${esc(c.name)}</span></span>
      <span><span class="meta">${esc(c.county)}${n ? `. ${plural(n, "decision")}` : ""}</span><br><span class="go">Start ${icon("arrow-right")}</span></span>
    </button>`;
  }).join("");
  $("app").innerHTML = `<div class="landing">
    <section class="hero"><div class="hero-inner">
      <h1>Your ballot,<br>one decision<br>at a time.</h1>
      <p>Oregon, November 3, 2026. About five minutes. <b>Every point links to the official pamphlet page it came from.</b></p>
    </div></section>
    <section class="cities"><div class="wrap">
      <h2>Where do you vote?</h2>
      <div class="city-grid">${cards}</div>
    </div></section>
    <footer class="fineprint"><div class="wrap">
      <p>Ballotty condenses the official Oregon state and county voters' pamphlets with Gemma 4, then checks every point against the page it cites. It is not affiliated with any election office or campaign and never recommends how to vote.</p>
      <p><a href="https://github.com/dalmartin/ballotty">Open source on GitHub</a></p>
    </div></footer>
  </div>`;
}

/* ---------- Setup: district, then priorities ---------- */
function renderDistrict(data) {
  const dcs = districtContests(data);
  const d = state.setup.district;
  const options = dcs.map((c) => `<button type="button" class="choice" data-district="${esc(c.id)}" aria-pressed="${d === c.id}">${esc(districtName(c))}<small>${esc(c.name)}</small></button>`).join("");
  $("app").innerHTML = `${topBar(visibleContests(data), -1)}
    <main class="setup">
      <h1>Which ${dcs[0].id.startsWith("us-rep") ? "district" : "ward"} are you in?</h1>
      <p class="lede">Some races are only on some ballots in ${esc(data.name)}. Pick yours and we'll skip the rest.</p>
      <div class="choices">${options}
        <button type="button" class="choice" data-district="none" aria-pressed="${d === "none"}">None of these<small>Skip these races</small></button>
        <button type="button" class="choice" data-district="all" aria-pressed="${d === "all"}">Not sure<small>Show all of them</small></button>
      </div>
      <p class="helper">Not sure? The race is printed on your ballot, or check your registration on <a href="${MYVOTE}" target="_blank" rel="noopener">MyVote</a>, Oregon's official voter site.</p>
      <div class="setup-actions"><button type="button" class="btn" data-route="${state.city}/priorities" ${d ? "" : "disabled"}>Next ${icon("arrow-right")}</button></div>
    </main>`;
}

function renderPriorities(data) {
  const topics = cityTopics(data);
  const chosen = state.setup.priorities;
  const tiles = topics.map((t) => {
    const on = chosen.includes(t);
    return `<button type="button" class="choice" data-prio="${esc(t)}" aria-pressed="${on}" ${!on && chosen.length >= 3 ? "disabled" : ""}>${icon(TOPIC_ICON[t] || "circle-dot")}${esc(t)}</button>`;
  }).join("");
  const n = visibleContests(data).length;
  $("app").innerHTML = `${topBar(visibleContests(data), -1)}
    <main class="setup">
      <h1>What matters most to you?</h1>
      <p class="lede">Pick up to 3. We'll highlight what candidates say about them. We never rank candidates or tell you who to pick.</p>
      <div class="choices">${tiles}</div>
      <div class="setup-actions">
        <button type="button" class="btn" data-route="${state.city}/c/0">${chosen.length ? "Start" : "Start without priorities"}: ${plural(n, "decision")} ${icon("arrow-right")}</button>
        ${districtContests(data).length ? `<button type="button" class="textlink" data-route="${state.city}/district">Back</button>` : ""}
      </div>
    </main>`;
}

/* ---------- Candidate race: always pairwise ---------- */
function pairFor(c) {
  const names = c.items.map((i) => i.name);
  let p = state.pair[c.id];
  if (!p || !p.every((n) => names.includes(n))) p = names.slice(0, 2);
  state.pair[c.id] = p;
  return p.map((n) => c.items.find((i) => i.name === n));
}

function headCell(c, item) {
  const prios = state.setup.priorities;
  const mentioned = item.statement_filed ? prios.filter((t) => item.summary.some((b) => (b.topics || []).includes(t))).length : 0;
  const job = item.statement_filed && item.background[0] ? label(item.background[0]) : null;
  return `<div class="head">
    <p class="nm">${esc(item.name)}</p>
    <p class="party">${esc(item.ballot_party_label)}</p>
    ${job ? `<p class="job">${icon("briefcase")}<span>${esc(job)}</span></p>` : ""}
    ${!item.statement_filed ? `<p class="job">${icon("file-x")}<span>Did not file a statement</span></p>` : ""}
    ${prios.length && item.statement_filed ? `<span class="badge${mentioned ? "" : " zero"}" title="Mentions ${mentioned} of your ${prios.length} priorities">${icon("star")}${mentioned}/${prios.length} of your priorities</span>` : ""}
  </div>`;
}

function topicCell(item, topic) {
  if (!item.statement_filed) return `<div class="cell"><p class="silent">—</p></div>`;
  const pts = item.summary.map((b, i) => [b, i]).filter(([b]) => primaryTopic(b) === topic);
  const prio = state.setup.priorities.includes(topic);
  if (!pts.length) return `<div class="cell${prio ? " prio-off" : ""}"><p class="silent">Doesn't mention</p></div>`;
  return `<div class="cell${prio ? " prio" : ""}">${pts.map(([b, i]) => {
    const key = register(item, "summary", b, i);
    const verbatim = b.loaded_terms?.length > 0;
    return `<button type="button" class="pt${verbatim ? " verbatim" : ""}" data-key="${esc(key)}">${esc(verbatim ? excerpt(b) : label(b))}</button>`;
  }).join("")}</div>`;
}

function footCell(c, item) {
  const picked = state.picks[c.id] === item.name;
  const first = item.name.split(" ")[0];
  const more = item.statement_filed
    ? `<div class="more"><button type="button" data-list="${esc(item.id)}" data-what="endorsements">${item.endorsements.length ? `Endorsements (${item.endorsements.length})` : "No endorsements listed"}</button><button type="button" data-list="${esc(item.id)}" data-what="all">Full statement</button></div>`
    : "";
  return `<div class="foot">${more}
    <button type="button" class="pick" data-pick="${esc(c.id)}" data-value="${esc(item.name)}" aria-pressed="${picked}"><span class="oval"></span>${picked ? (c.ranked_choice ? "Your 1st choice" : "Your pick") : `Pick ${esc(first)}`}</button>
  </div>`;
}

function candidateBody(c) {
  const pair = pairFor(c);
  const solo = c.items.length === 1;
  const shown = solo ? [c.items[0]] : pair;
  const order = [];
  const push = (t) => { if (!order.includes(t)) order.push(t); };
  state.setup.priorities.forEach((t) => { if (shown.some((i) => i.statement_filed && i.summary.some((b) => primaryTopic(b) === t))) push(t); });
  shown.forEach((i) => i.statement_filed && i.summary.forEach((b) => push(primaryTopic(b))));
  const rows = order.filter((t) => t !== "Other").concat(order.includes("Other") ? ["Other"] : []);
  const selector = c.items.length > 2
    ? `<div class="versus">
        <select data-side="0" data-contest="${esc(c.id)}" aria-label="First candidate">${c.items.map((i) => `<option ${i.name === pair[0].name ? "selected" : ""} ${i.name === pair[1].name ? "disabled" : ""}>${esc(i.name)}</option>`).join("")}</select>
        <span class="vs">vs</span>
        <select data-side="1" data-contest="${esc(c.id)}" aria-label="Second candidate">${c.items.map((i) => `<option ${i.name === pair[1].name ? "selected" : ""} ${i.name === pair[0].name ? "disabled" : ""}>${esc(i.name)}</option>`).join("")}</select>
      </div><p class="versus-note">Comparing 2 of ${c.items.length} candidates, listed in ballot order. Switch either side to compare others.</p>`
    : "";
  const grid = [
    ...shown.map((i) => headCell(c, i)),
    ...rows.flatMap((t) => [
      `<div class="topic-row${state.setup.priorities.includes(t) ? " prio" : ""}">${icon(TOPIC_ICON[t] || "circle-dot")}${esc(t === "Other" ? "Other points" : t)}${state.setup.priorities.includes(t) ? `<span class="star">Your priority</span>` : ""}</div>`,
      ...shown.map((i) => topicCell(i, t)),
    ]),
    ...(rows.length ? [] : shown.map((i) => (i.statement_filed ? `<div class="cell"><p class="silent">No points passed the citation check</p></div>` : `<div class="nostatement">No statement in the pamphlet, so there is nothing to summarize.</div>`))),
    ...shown.map((i) => footCell(c, i)),
  ].join("");
  const offscreenPick = state.picks[c.id] && !shown.some((i) => i.name === state.picks[c.id]);
  return `${selector}<div class="pair${solo ? " solo" : ""}">${grid}</div>
    ${offscreenPick ? `<p class="others">Your pick in this race: <b>${esc(state.picks[c.id])}</b></p>` : ""}
    ${solo ? `<p class="others">Only one candidate is on the ballot for this race.</p>` : ""}`;
}

/* ---------- Measure ---------- */
function measureBody(c) {
  const m = c.items[0];
  const f = m.arguments_filed;
  const max = Math.max(f.for, f.against, 1);
  const pick = state.picks[c.id];
  const pts = (section) => m[section].map((b, i) => {
    const key = register(m, section, b, i);
    const verbatim = b.loaded_terms?.length > 0;
    return `<li><button type="button" class="pt${verbatim ? " verbatim" : ""}" data-key="${esc(key)}">${esc(verbatim ? excerpt(b) : label(b))}</button></li>`;
  }).join("");
  const side = (key, title) => `<section class="side"><h2>${icon(key === "for" ? "thumbs-up" : "thumbs-down")}${title}</h2>${
    !f[key] ? `<p class="empty">${esc(m.no_arguments_note || `No arguments ${key === "for" ? "in favor" : "in opposition"} were filed.`)}</p>`
    : m[key].length ? `<ul>${pts(key)}</ul>` : `<p class="empty">No condensed point passed the citation check.</p>`}</section>`;
  const yn = (v) => `<button type="button" class="pick" data-pick="${esc(c.id)}" data-value="${v}" aria-pressed="${pick === v}"><span class="oval"></span>${pick === v ? `Your pick: ${v}` : v}</button>`;
  const filers = (k) => (f[k] ? `from ${plural(m.filers[k].length, "filer")}` : "none filed");
  return `<div class="title-card">
      ${m.caption ? `<p class="cap">${esc(m.caption)}</p>` : ""}
      <p class="src">Ballot title as printed. ${esc(m.source.title)}, ${esc(m.verify_label)}</p>
    </div>
    <section class="passes"><h2>${icon("check-circle")}If it passes</h2><ul>${pts("summary")}</ul></section>
    <section class="scale" aria-label="${f.for} arguments filed in favor, ${f.against} in opposition">
      <div class="scale-row">
        <span class="n">${f.for}<small>for</small></span>
        <div class="bar2"><div class="h l"><i style="width:${(f.for / max) * 100}%"></i></div><div class="m"></div><div class="h r"><i style="width:${(f.against / max) * 100}%"></i></div></div>
        <span class="n r">${f.against}<small>against</small></span>
      </div>
      <div class="note"><span>${filers("for")}</span><span>arguments filed in the pamphlet</span><span>${filers("against")}</span></div>
    </section>
    <div class="sides">${side("for", "Supporters argue")}${side("against", "Opponents argue")}</div>
    <p class="method">Both sides are condensed with the same instructions into at most 3 points.</p>
    <div class="yn">${yn("Yes")}${yn("No")}</div>`;
}

/* ---------- Contest screen ---------- */
function renderContest(data, i) {
  const contests = visibleContests(data);
  const c = contests[i];
  if (!c) return go(`${state.city}/sheet`);
  const kind = KINDS[kindOf(c)];
  const pills = [c.district_label && `<span class="pill">${esc(districtName(c))}</span>`, c.ranked_choice && `<span class="pill">Ranked choice</span>`, c.type === "measure" && `<span class="pill">${esc(c.items[0].jurisdiction)}</span>`].filter(Boolean).join("");
  const sub = c.type === "measure"
    ? "A yes-or-no question. Here's what it does and what each side argues."
    : c.items.length === 1 ? "One candidate is running." : `${plural(c.items.length, "candidate")}. Compare two at a time; tap any point to see where it came from.`;
  const last = i === contests.length - 1;
  $("app").innerHTML = `${topBar(contests, i)}
    <main class="screen" style="--accent:${kind.color}">
      <section class="block"><div class="block-inner">
        <div class="kind">${kind.label} ${pills}</div>
        <h1>${esc(titleOf(c))}</h1>
        <p class="q">${sub}</p>
      </div></section>
      <div class="body">${c.type === "measure" ? measureBody(c) : candidateBody(c)}
        ${data.coverage_note && i === 0 ? `<p class="method">${esc(data.coverage_note)}</p>` : ""}
      </div>
    </main>
    <nav class="nav" aria-label="Contest navigation"><div class="nav-inner">
      <button type="button" class="btn ghost" data-go="${i - 1}" ${i === 0 ? `data-route="${state.city}/priorities"` : ""}>${icon("arrow-left")}Back</button>
      <span class="status">${state.picks[c.id] ? `Your pick: <b>${esc(state.picks[c.id])}</b>` : "Not decided yet"}</span>
      <button type="button" class="btn" ${last ? `data-route="${state.city}/sheet"` : `data-go="${i + 1}"`}>${last ? "My cheat sheet" : state.picks[c.id] ? "Next" : "Skip"} ${icon("arrow-right")}</button>
    </div></nav>`;
}

/* ---------- Cheat sheet ---------- */
function renderSheet(data) {
  const contests = visibleContests(data);
  const decided = contests.filter((c) => state.picks[c.id]).length;
  const rows = contests.map((c, i) => `<div class="row"><span class="swatch" style="background:${KINDS[kindOf(c)].color}"></span>
    <div><div class="what">${esc(titleOf(c))}</div><div class="val${state.picks[c.id] ? "" : " open"}">${esc(state.picks[c.id] || "Not decided")}</div></div>
    <button type="button" class="edit" data-go="${i}">${state.picks[c.id] ? "Change" : "Decide"}</button></div>`).join("");
  $("app").innerHTML = `${topBar(contests, -1)}
    <main class="sheet-wrap">
      <h1>Your cheat sheet</h1>
      <p class="lede">${decided} of ${contests.length} decided. Take this with you while you fill in your ballot.</p>
      <div class="ticket">${rows}</div>
      <div class="sheet-actions">
        <button type="button" class="btn" data-print ${decided ? "" : "disabled"}>${icon("printer")}Print</button>
        <button type="button" class="btn ghost" data-go="0">Review from the start</button>
        <button type="button" class="textlink" data-clear>Clear my picks</button>
      </div>
      <p class="privacy">Your picks stay in this browser. Ballotty never sees them and never suggests a choice. Mail your ballot by November 3 or use an official drop box.</p>
      <p class="privacy">Sources: ${data.sources.map((s) => `<a href="${esc(s.url)}" target="_blank" rel="noopener">${esc(s.title)}</a>`).join("; ")}.</p>
    </main>`;
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
function openList(itemId, what) {
  const item = state.data[state.city].contests.flatMap((c) => c.items).find((i) => i.id === itemId);
  const section = (name, title) => {
    const list = item[name] || [];
    return `<h3>${title}</h3>${list.length ? `<ul class="list">${list.map((b, i) => {
      const key = register(item, name, b, i);
      return `<li><button type="button" data-key="${esc(key)}">${esc(plain(b.text))}</button><span class="pg">${esc([...new Set(b.citations.map((c) => c.page_label))].join(", "))}</span></li>`;
    }).join("")}</ul>` : `<p class="doc">Nothing listed in the pamphlet.</p>`}`;
  };
  const body = what === "endorsements"
    ? section("endorsements", "Endorsements they list")
    : section("summary", "What they say") + section("background", "Background they list") + section("endorsements", "Endorsements they list");
  showDrawer(`<h2>${esc(item.name)}</h2>
    <p class="said">Self-reported in the voters' pamphlet${item.furnished_by ? `, furnished by ${esc(item.furnished_by)}` : ""}. Tap a line to see the exact words.</p>
    ${body}
    <div class="sep"></div><a class="open" href="${esc(item.verify_url)}" target="_blank" rel="noopener">${icon("file-text")}Open the full statement, ${esc(item.verify_label)}</a>`);
}

/* ---------- Routing ---------- */
function go(route) { location.hash = route; }
async function loadCity(id) {
  if (state.data[id]) return state.data[id];
  const res = await fetch(`data/${id}.json`);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return (state.data[id] = await res.json());
}

async function render() {
  const [city, step, n] = location.hash.slice(1).split("/");
  try {
    if (!CITIES.some((c) => c.id === city)) {
      await Promise.all(CITIES.map((c) => loadCity(c.id).catch(() => null)));
      state.city = null;
      renderLanding();
    } else {
      const data = await loadCity(city);
      if (state.city !== city) {
        state.city = city;
        state.setup = store.get(`ballotty-setup-${city}`, { district: null, priorities: [] });
        state.picks = store.get(`ballotty-picks-${city}`, {});
      }
      if (!step) go(districtContests(data).length && !state.setup.district ? `${city}/district` : `${city}/priorities`);
      else if (step === "district") renderDistrict(data);
      else if (step === "priorities") renderPriorities(data);
      else if (step === "sheet") renderSheet(data);
      else renderContest(data, Number(n) || 0);
    }
  } catch (e) {
    $("app").innerHTML = `<p class="loading">Couldn't load the ballot data (${esc(e.message)}). Reload the page to try again.</p>`;
  }
  window.lucide?.createIcons();
}

function rerender() { const y = window.scrollY; render().then(() => window.scrollTo({ top: y })); }

document.addEventListener("click", (e) => {
  const el = (sel) => e.target.closest(sel);
  if (e.target === $("scrim") || el("[data-close]")) return closeDrawer();
  if (el("[data-key]")) return openSource(el("[data-key]").dataset.key);
  if (el("[data-list]")) return openList(el("[data-list]").dataset.list, el("[data-list]").dataset.what);
  if (el("[data-route]") && !el("[data-route]").disabled) { go(el("[data-route]").dataset.route); return window.scrollTo({ top: 0 }); }
  if (el("[data-go]")) { const i = Number(el("[data-go]").dataset.go); if (i >= 0) { go(`${state.city}/c/${i}`); window.scrollTo({ top: 0 }); } return; }
  if (el("[data-district]")) { state.setup.district = el("[data-district]").dataset.district; saveSetup(); return rerender(); }
  if (el("[data-prio]")) {
    const t = el("[data-prio]").dataset.prio;
    const p = state.setup.priorities;
    state.setup.priorities = p.includes(t) ? p.filter((x) => x !== t) : p.length < 3 ? [...p, t] : p;
    saveSetup();
    return rerender();
  }
  if (el("[data-pick]")) {
    const b = el("[data-pick]");
    if (state.picks[b.dataset.pick] === b.dataset.value) delete state.picks[b.dataset.pick];
    else state.picks[b.dataset.pick] = b.dataset.value;
    savePicks();
    return rerender();
  }
  if (el("[data-clear]")) { state.picks = {}; savePicks(); return rerender(); }
  if (el("[data-print]")) {
    const data = state.data[state.city];
    $("print-sheet").innerHTML = `<h1>My ballot picks: ${esc(data.name)}, November 3, 2026</h1><ol>${visibleContests(data).map((c) => `<li><b>${esc(titleOf(c))}</b>: ${esc(state.picks[c.id] || "not decided")}</li>`).join("")}</ol><p>Made with Ballotty. Ballotty does not recommend how to vote.</p>`;
    window.print();
  }
});
document.addEventListener("change", (e) => {
  const s = e.target.closest("select[data-side]");
  if (!s) return;
  const pair = state.pair[s.dataset.contest];
  pair[Number(s.dataset.side)] = s.value;
  rerender();
});
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && !$("drawer").hidden) return closeDrawer();
  if (!$("drawer").hidden || e.target.closest("select, input, textarea")) return;
  const [, step, n] = location.hash.slice(1).split("/");
  if (step !== "c") return;
  if (e.key === "ArrowRight") document.querySelector(".nav .btn:not(.ghost)")?.click();
  if (e.key === "ArrowLeft") document.querySelector(".nav .btn.ghost")?.click();
});
window.addEventListener("hashchange", () => render());
render();
