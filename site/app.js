
// The public site loads its data as data/index.js (window.LTDI_DATA, LTDI_MAP, LTDI_LANGS) and gives each
// language its own address, /language/<code>; the preview inlines the data and uses #lang-<code>.
const DATA = window.LTDI_DATA || JSON.parse(document.getElementById('ltdi-data').textContent);
const PATHS = !!window.LTDI_DATA;
const LH = code => PATHS ? `/language/${code}` : `#lang-${code}`;  // a language page's address
// The current view: lang-yo for /language/yo, otherwise what follows the #
function curRoute() {
  const m = PATHS && location.pathname.match(/^\/language\/([a-z0-9]+)\/?$/);
  return m && (!location.hash || location.hash.startsWith('#lang-')) ? 'lang-' + m[1] : location.hash.slice(1);
}
// Go to a view: languages by their path, everything else by its # on the home page
function go(h) {
  if (!PATHS) { location.hash = h; return; }
  const m = h.match(/^lang-([a-z0-9]+)$/);
  history.pushState(null, '', m ? `/language/${m[1]}` : '/#' + h);
  route();
}
const REGION_OF = { A: 'Africa', S: 'South Asia', R: 'Rest of Asia', E: 'Europe', M: 'Americas', O: 'Oceania' };
// Extinct languages keep their pages and turn up in search, but are left out of the ranking, totals,
// charts and map (LANGS) unless chosen in the ranking's endangerment drop-down
const ALL = DATA.languages, BY = Object.fromEntries(ALL.map(l => [l.code, l]));
const LANGS = ALL.filter(l => !l.extinct);
const CFG = DATA.config.dimensions, L = DATA.labels;
const numWord = n => ['no', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten'][n] || String(n);
// The page carries an index (every language's scores, coverage and gaps, and the top opportunities).
// Each language's own detail (facts, opportunities, reach by country) is embedded when small,
// otherwise fetched the first time one of its pages opens, from data/lang/<shard>.json, which holds
// the detail of the languages in that shard (so the site is a few dozen files, not thousands).
const EMBED = window.LTDI_DATA ? window.LTDI_LANGS || null : JSON.parse(document.getElementById('ltdi-langs').textContent || 'null');
const SHARDS = {};
const shard = n => SHARDS[n] ??= fetch(`data/lang/${n}.json`).then(r => r.json());
const RULES = DATA.rules, RES = DATA.resources;
DATA.facts = {};
const LEVEL_CODE = { f: 'full', p: 'part', o: 'open', n: 'none' };
const GAP_CODE = { n: 'none', o: 'open' };
for (const l of ALL) {
  // the compact per-language fields (build_site.compact), back to their usual shape
  l.gaps = {};
  if (l.gx) [...l.gx].forEach((c, i) => { if (GAP_CODE[c]) l.gaps[DATA.gap_order[i]] = GAP_CODE[c]; });
  l.scores = Object.fromEntries(DATA.dim_order.map((k, i) => [k, l.s[i]]));
  l.raw = l.rw ? Object.fromEntries(DATA.dim_order.map((k, i) => [k, l.rw[i]]).filter(([, v]) => v != null)) : null;
  l.endangerment = l.en != null ? DATA.endangerment_levels[l.en] : null;
  l.opportunity_count = l.oc;
  // its countries, with speakers there where LinguaMeta gives them ("us:319000000 gb:64000000 jm")
  l._cs = Object.fromEntries((l.cc || '').split(' ').filter(Boolean).map(t => { const [c, n] = t.split(':'); return [c, n ? +n : null]; }));
  l._cc = new Set(Object.keys(l._cs));
  l._im = new Set((l.im || '').split(' ').filter(Boolean));  // countries where only immigrant communities speak it
  l._sc = (l.sc || '').split(' ').filter(Boolean);  // its scripts, main one first
  l._fx = (l.fx || '').split('');  // engineering flags (DATA.flags)
  l._of = Object.fromEntries((l.of || '').split(' ').filter(Boolean).map(t => { const [c, st] = t.split(':'); return [c, st || 'o']; }));  // official status by country (CLDR)
  l._gp = l.gp ? l.gp.split(' ').map(x => parseInt(x, 36)) : [];  // Glottolog groups above it, family first (DATA.gnodes)
  l._csc = Object.fromEntries((l.csc || '').split(' ').filter(Boolean).map(t => { const [c, v] = t.split('='); return [c, v.split(',')]; }));
  // every region it's spoken in, not just its home: English counts in the Americas and Oceania too
  l._rg = new Set([...(l.rg || '')].map(c => REGION_OF[c]).concat(l.region ? [l.region] : []));
  l._offers = new Set(l.offers.map(i => DATA.services[i].id));
  l.levels = Object.fromEntries(Object.keys(CFG.tech.technologies).map((t, i) => [t, LEVEL_CODE[l.levels[i]]]));
  if (typeof l.under === 'string') l.under = Object.fromEntries(Object.keys(CFG.tech.technologies).map((t, i) => [t, l.under[i] || 'a']));
  l.dimensions = Object.fromEntries(Object.entries(l.scores).map(([k, v]) => [k, { score: v, indicators: {} }]));
}
// An opportunity carries only what differs by language; the rest is on its rule
const withRule = (o, lang) => ({ ...RULES[o.key], ...o, id: `${lang}-${o.key}` });
// The top opportunities worldwide (data/top_opportunities.json), fetched when the Opportunities tab first needs them
let TOP = [], TOPP;
// every opportunity, its priorities worked out from b, u and m as ltdi.opportunities.rank does
const oppReach = n => Math.max(0, Math.log10(Math.max(n, 1)) - 4);
const topOpps = () => TOPP ??= fetch('data/top_opportunities.json').then(r => r.json()).catch(() => []).then(t => (TOP = t.map(o => withRule({ ...o,
  priority: oppReach(o.u[0]) * o.b, priority_now: oppReach(o.u[1]) * o.b, priority_5y: oppReach(o.u[2]) * o.b * o.m }, o.lang))));
// With countries or regions chosen, every opportunity of the languages spoken there (data/country_opportunities.json
// lists each country's languages and speakers, fetched once), ranked by reach there: each one's potential
// users scaled to the language's speakers in the countries chosen, then priority = reach x (gap x need x
// weight) [x momentum], as for the global list
let COPP = null;
// The over-time history, for the Charts page only (data/history.json), fetched when that first opens
let HIST = null, HISTP;
const histData = () => HISTP ??= fetch('data/history.json').then(r => r.json()).catch(() => null).then(h => (HIST = h));
const countryOpps = () => COPP ??= fetch('data/country_opportunities.json').then(r => r.json());
async function countryPool() {
  const [d] = await Promise.all([countryOpps(), topOpps()]), here = new Map();
  // the countries chosen, or every country in the regions chosen
  for (const [c, rows] of Object.entries(d.by_country)) if (countryIn(c)) for (const [lang, n] of rows) here.set(lang, (here.get(lang) || 0) + n);
  const reach = n => Math.max(0, Math.log10(Math.max(n, 1)) - 4);
  return TOP.filter(o => here.has(o.lang)).map(o => {
    const f = Math.min(1, here.get(o.lang) / (o.u[0] || here.get(o.lang)));
    return { o: { ...o, priority: reach(o.u[0] * f) * o.b, priority_now: reach(o.u[1] * f) * o.b, priority_5y: reach(o.u[2] * f) * o.b * o.m }, l: BY[o.lang], n: here.get(o.lang) };
  }).filter(x => x.l && inView(x.l));
}
async function need(...codes) {
  await Promise.all(codes.filter(c => BY[c] && !BY[c].opportunities).map(async c => {
    const d = EMBED ? EMBED[c] : (await shard(BY[c].shard))[c];
    const l = BY[c];
    const facts = { ...DATA.fact_defaults };
    for (const i of d.lacks || []) delete facts[i];
    const decode = fs => Object.fromEntries(Object.entries(fs).map(([i, [value, s, note]]) => {
      const [source, u, retrieved, method] = DATA.sources[s], url = u.replaceAll('{lang}', c);
      return [i, { value, unit: DATA.units[i], source, url, retrieved, method, note: note || '' }];
    }));
    DATA.facts[c] = decode({ ...facts, ...d.facts });
    // a spoken variety: the values counted from the standard it writes, beside its own
    if (d.via) { (DATA.via ||= {})[c] = decode(d.via.facts); l.via_dims = d.via.dimensions; }
    Object.assign(l, { dimensions: d.dimensions, reach_by_country: d.reach_by_country, countries: d.countries,
                       glottocode: d.glottocode, script_names: d.script_names, note: d.note, source: d.source, written_in: d.written_in, shares_written: d.shares_written,
                       script_source: d.script_source, endangerment_source: d.endangerment_source, joshi: d.joshi, ud: d.ud, census: d.census, sample: d.sample, hear: d.hear, evidence: d.evidence, unnamed: d.unnamed, licensed: d.licensed, lookalikes: d.lookalikes, literacy: d.literacy });
    l.opportunities = d.opportunities.map(o => ({ ...withRule(o, c), kit: o.kit.map(([i, size]) => ({ ...RES[i], id: i, size })) }));
  }));
}
// Language pickers: a text box with its own type-ahead list, since a menu of seven thousand names is
// too long to scroll. It matches other names too (Cantonese finds Yue Chinese) but shows only each
// language's name, autonym and code: other-name data is uneven, so it isn't displayed.
function langPicker(id, placeholder, current) {
  return `<span class="pickwrap"><input class="pick" id="${id}" autocomplete="off" role="combobox" aria-autocomplete="list"
    aria-expanded="false" aria-controls="${id}-list" aria-label="${esc(placeholder)}" placeholder="${esc(placeholder)}"
    value="${current ? esc(`${current.name} (${current.code})`) : ''}" onfocus="this.select()"><ul class="picklist" id="${id}-list" role="listbox" hidden></ul></span>`;
}
function pickMatches(q) {
  q = q.trim().toLowerCase();
  if (!q) return [];
  const rank = l => {
    const n = l.name.toLowerCase(), a = (l.autonym || '').toLowerCase();
    if (l.code.toLowerCase() === q || (l.iso_639_3 || '') === q) return 0;
    if (n.startsWith(q)) return 1;
    if (n.includes(q)) return 2;
    if (a.includes(q)) return 3;
    if (altNames(l).some(x => x.toLowerCase().includes(q))) return 4;
    return 9;
  };
  // A language found only by another name shows that one name ("also Cantonese"), as the ranking does
  return ALL.map(l => [rank(l), l]).filter(([r]) => r < 9)
    .sort((x, y) => x[0] - y[0] || (y[1].speakers || 0) - (x[1].speakers || 0)).slice(0, 12)
    .map(([r, l]) => ({ l, also: r === 4 ? altNames(l).find(x => x.toLowerCase().includes(q)) : null }));
}
(function wirePickers() {
  const listOf = inp => document.getElementById(inp.id + '-list');
  const close = inp => { const ul = listOf(inp); if (ul) { ul.hidden = true; inp.setAttribute('aria-expanded', 'false'); } };
  const choose = (inp, { l }) => { inp.value = `${l.name} (${l.code})`; close(inp); inp.dispatchEvent(new Event('change', { bubbles: true })); };
  const show = inp => {
    const ul = listOf(inp), found = pickMatches(inp.value);
    ul._found = found; ul._active = found.length ? 0 : -1;
    ul.innerHTML = found.map(({ l, also }, i) => `<li role="option" id="${inp.id}-o${i}" data-i="${i}" aria-selected="${i === 0}">${esc(l.name)}
      <span class="auto">${also ? `also ${esc(also)}` : esc(l.autonym && l.autonym !== l.name ? l.autonym : '')} [${l.code}]</span></li>`).join('')
      || '<li class="none" aria-disabled="true">No language found</li>';
    ul.hidden = !inp.value.trim();
    inp.setAttribute('aria-expanded', String(!ul.hidden));
  };
  const move = (inp, d) => {
    const ul = listOf(inp); if (ul.hidden || !ul._found?.length) return;
    ul._active = (ul._active + d + ul._found.length) % ul._found.length;
    ul.querySelectorAll('li[role=option]').forEach((li, i) => li.setAttribute('aria-selected', String(i === ul._active)));
    const li = ul.children[ul._active]; li.scrollIntoView({ block: 'nearest' }); inp.setAttribute('aria-activedescendant', li.id);
  };
  document.addEventListener('input', e => { if (e.target.matches?.('input.pick') && !(e.target.id === 'go' && navMode === 'filter')) show(e.target); });
  document.addEventListener('keydown', e => {
    const inp = e.target; if (!inp.matches?.('input.pick')) return;
    const ul = listOf(inp);
    if (inp.id === 'go' && navMode === 'filter') return;
    if (e.key === 'ArrowDown') { e.preventDefault(); ul.hidden ? show(inp) : move(inp, 1); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); move(inp, -1); }
    else if (e.key === 'Enter') { const l = ul?._found?.[ul._active]; if (!ul.hidden && l) { e.preventDefault(); choose(inp, l); } }
    else if (e.key === 'Escape') close(inp);
  });
  document.addEventListener('mousedown', e => {
    const li = e.target.closest?.('.picklist li[role=option]');
    if (!li) return;
    e.preventDefault();  // keep focus in the box until the choice is made
    const inp = li.closest('.pickwrap').querySelector('input.pick');
    choose(inp, listOf(inp)._found[+li.dataset.i]);
  });
  document.addEventListener('focusout', e => { if (e.target.matches?.('input.pick')) close(e.target); });
})();
const pickedCode = v => { const m = /\(([^()]+)\)\s*$/.exec(v || ''); return m && BY[m[1]] ? m[1] : null; };
// The search box beside the tabs does what suits the page (each view sets it with navBox):
//   filter   the ranking: filters the list as you type, no drop-down (navFilter redraws it)
//   opps     opportunities: the drop-down's choice filters them to that language
//   map      charts: the choice is found on the map
//   go       anywhere else: the choice's page opens
let navMode = 'go', navFilter = null;
function navBox(mode, placeholder, value = '') {
  const inp = document.getElementById('go');
  navMode = mode; navFilter = null;
  inp.placeholder = placeholder; inp.setAttribute('aria-label', placeholder);
  inp.setAttribute('role', mode === 'filter' ? 'searchbox' : 'combobox');
  inp.value = value;
  const ul = document.getElementById('go-list'); ul.hidden = true;
  // a combobox says whether its list is open; a plain search box has no list
  if (mode === 'filter') { inp.removeAttribute('aria-expanded'); inp.removeAttribute('aria-controls'); }
  else { inp.setAttribute('aria-expanded', 'false'); inp.setAttribute('aria-controls', 'go-list'); }
}
document.getElementById('go').addEventListener('input', e => {
  if (navMode === 'filter' && navFilter) navFilter(e.target.value);
  if (navMode === 'opps' && !e.target.value && /^opportunities-/.test(curRoute())) go('opportunities');  // cleared: all again
});
document.getElementById('go').addEventListener('change', e => {
  if (navMode === 'filter') return;
  const c = pickedCode(e.target.value);
  if (navMode === 'opps') {  // a language filters the opportunities; an empty box shows them all
    if (c) go('opportunities-' + c);
    else if (!e.target.value.trim()) go('opportunities');
    return;
  }
  if (!c) return;
  e.target.value = ''; e.target.blur();
  if (navMode === 'map' && GEO && document.getElementById('worldmap')) {
    mapFocus = c; mapFocusFresh = true;
    const y = scrollY; mapPage(); scrollTo(0, y);  // the page stays put, so the box stays in reach
  } else go('lang-' + c);
});
const DIMS = [['tech', 't', '--tech'], ['data', 'd', '--data']];  // the order on a language's page
const $ = (s, el = document) => el.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const OT = DATA.opportunity_types;
const OCOLOR = { share: '--tech', improve: '--tier-h', collect: '--data' };
const OBLURB = {
  share: 'Launch the product, or open up what exists.',
  improve: 'Support exists, but quality lags well behind English.',
  collect: 'The data really is scarce and has to be created.',
};
const TECHL = { keyboard: 'Keyboard', speech_input: 'Speech-to-text', tts: 'Text-to-speech', mt: 'Translation', llm: 'LLMs',
  interface: 'Interface language', ocr: 'Text recognition', proofing: 'Spelling and grammar', assistant: 'Voice assistant', langid: 'Language identification', locale: 'Locale data', writing: 'Writing system', data: 'Data' };
// Where the floor lifts a dimension, its unfloored score: what the rank goes by among languages the floor puts level
const rawText = l => l.raw ? `Before the floor of ${DATA.config.meta.floor}: ${DIMS.filter(([k]) => k in l.raw).map(([k]) => `${CFG[k].label.toLowerCase()} ${l.raw[k].toFixed(3)}`).join(', ')}` : '';

// A language's tier [key, label]; or of a tier key ("through German": the standard's tier)
const tierOf = l => { const k = typeof l === 'string' ? l : l.tier; return [k, TIER_LABEL[k] || k]; };
const tierChip = l => { const [c, t] = tierOf(l); return `<span class="tier ${c}"${TIER_DESC[c] ? ` title="${esc(TIER_DESC[c])}"` : ''}>${esc(t)}</span>`; };
function people(n) {
  if (!n) return '—';
  if (n >= 1e9) return (n / 1e9).toFixed(2) + 'B';
  if (n >= 1e6) return (n / 1e6).toFixed(n >= 1e8 ? 0 : 1) + 'M';
  if (n >= 1e3) return Math.round(n / 1e3) + 'K';
  return String(Math.round(n));
}
function big(n) {
  if (n >= 1e12) return (n / 1e12).toFixed(1) + 'T';
  if (n >= 1e9) return (n / 1e9).toFixed(1) + 'B';
  if (n >= 1e6) return (n / 1e6).toFixed(1) + 'M';
  if (n >= 1e3) return (n / 1e3).toFixed(1) + 'K';
  return n.toLocaleString();
}
function showValue(f) {
  if (!f) return 'not collected';
  const v = f.value;
  if (f.unit === 'bool') return v ? 'Yes' : 'No';
  if (f.unit === 'level 0-3') return ['Not in CLDR', 'Basic', 'Moderate', 'Modern'][v] ?? v;
  if (f.unit === 'words') return big(v) + ' words';
  if (f.unit === 'hours') return (v >= 100 ? Math.round(v).toLocaleString() : v.toFixed(1)) + ' h';
  if (f.unit === 'articles') return big(v) + ' articles';
  if (f.unit === '% of English') return v + '% of English';
  if (/^features of \d+$/.test(f.unit)) return `${v} of ${f.unit.split(' ').pop()} features`;
  if (f.unit === 'accuracy') return (v * 100).toFixed(1) + '% accuracy';
  if (/^types of/.test(f.unit)) return `${v} of ${f.unit.split(' ').pop()} voice types`;
  if (f.unit === '% WER') return v >= 100 ? 'No published WER under 50%' : v + '% WER';
  if (f.unit === 'WER band') return f.note.replace(/, as .*/, '');
  if (f.unit === 'editors') return big(v) + ' active editors';
  if (f.unit === 'sentence pairs') return big(v) + ' sentence pairs';
  if (f.unit === 'datasets') return big(v) + ' datasets';
  if (f.unit === 'datasets, weighted') return `${v >= 1000 ? big(v) : v >= 1 ? Math.round(v) : 'Under 1'} ${v >= 1.5 ? 'datasets' : 'dataset'}, weighted`;
  if (/^benchmarks of \d+$/.test(f.unit)) return `${v} of ${f.unit.split(' ').pop()}`;
  return v;
}
const bar = (v, color) => `<div class="bar"><i style="width:${(v * 100).toFixed(1)}%;${color ? `background:var(${color})` : ''}"></i></div>`;

// ---------------------------------------------------------- opportunities
const WEIGHT = {
  '5y': { key: 'priority_5y', label: 'Users in five years', note: 'speakers expected to be online in five years, with a boost where that number is growing fast' },
  now: { key: 'priority_now', label: 'Users today', note: 'speakers who are online today' },
  speakers: { key: 'priority', label: 'All speakers', note: 'every speaker, online or not' },
};
let weight = '5y';
const prio = o => o[WEIGHT[weight].key] ?? o.priority;

const TEAMS = DATA.teams;
const REGION_ORDER = ['Africa', 'South Asia', 'Rest of Asia', 'Europe', 'Americas', 'Oceania'];
const REGIONS = REGION_ORDER.filter(r => LANGS.some(l => l._rg.has(r)));
// Regions are tick-boxes, so several can be looked at together (all of Asia; Africa and South Asia).
// None ticked means every region; ticking them all clears the set.
const regionSel = new Set();
const inRegion = l => !regionSel.size || [...regionSel].some(r => l._rg.has(r));
// Countries: languages spoken there (LinguaMeta's country list), several at once like regions
const countrySel = new Set();
let countryQuery = '';  // what's typed in the country drop-down's search box
const inCountry = l => !countrySel.size || [...countrySel].some(c => l._cc.has(c));
// region, country and tier together (the tier set is shared by every page)
const inView = l => inRegion(l) && inCountry(l) && (!tierSel.size || tierSel.has(tierOf(l)[0]));
const COUNTRY_NAMES = DATA.country_names || {};
// A rank, with "=" where languages share a score (and so a rank): "=1,914"
// Where the rank falls in 90% of re-scorings with other reasonable weights, goalposts and floors (ltdi.sensitivity)
const rangeText = l => l.rr && l.rr[0] !== l.rr[1] ? `${l.rr[0].toLocaleString()}–${l.rr[1].toLocaleString()}` : '';
const rankTitle = l => [l.tied ? `Tied with ${l.tied.toLocaleString()} other ${l.tied === 1 ? 'language' : 'languages'}` : '',
  rangeText(l) ? `Ranks ${rangeText(l)} under other reasonable weightings` : ''].filter(Boolean).join('\n');
const rankLabel = l => l.rank ? `${l.tied ? '=' : ''}${l.rank.toLocaleString()}` : '–';
const COUNTRY_REGION = DATA.country_regions || {}, COUNTRY_ONLINE = DATA.country_online || {};
// Speakers in view: with a region or country chosen, a language counts only its speakers in the
// countries chosen (or the chosen regions' countries), from LinguaMeta's per-country figures; online,
// each country's share of people using the internet. English in Africa is its speakers in Nigeria,
// South Africa and the rest, not its world total.
const narrowed = () => regionSel.size > 0 || countrySel.size > 0;
const countryIn = c => (!countrySel.size || countrySel.has(c)) && (!regionSel.size || regionSel.has(REGION_OF[COUNTRY_REGION[c]]));
function inViewCounts(l) {
  const cs = Object.entries(l._cs), here = cs.filter(([c]) => countryIn(c)), known = here.filter(([, n]) => n);
  if (known.length) return known;
  // no per-country figure: the whole language if all of it is in view (or it has no countries listed)
  return (!cs.length || here.length === cs.length) && l.speakers ? null : [];
}
function vSpk(l) {
  if (!narrowed()) return l.speakers;
  const k = inViewCounts(l);
  return k === null ? l.speakers : k.reduce((n, [, x]) => n + x, 0);
}
function vOn(l) {
  if (!narrowed()) return l.online;
  const k = inViewCounts(l), rate = l.speakers && l.online ? l.online / l.speakers : null;
  if (k === null) return l.online;
  const on = k.reduce((n, [c, x]) => n + x * (COUNTRY_ONLINE[c] ?? rate ?? 0), 0);
  return on || (rate == null ? null : 0);
}
const COUNTRY_N = {};  // languages listed for each country
for (const l of LANGS) for (const c of l._cc) COUNTRY_N[c] = (COUNTRY_N[c] || 0) + 1;
const COUNTRIES = Object.keys(COUNTRY_N).filter(c => COUNTRY_NAMES[c]).sort((a, b) => COUNTRY_NAMES[a].localeCompare(COUNTRY_NAMES[b]));
// Names for the chosen countries' main languages on the areas map: the ten with the most speakers in
// each country (LinguaMeta's per-country figures, then the area they cover there), at the most central
// point of their largest piece inside it (from the areas step)
function areaLabels() {
  const L = (AREAS && AREAS.labels) || {}, seen = new Set(), out = [];
  for (const c of countrySel) {
    const rows = (L[c] || []).filter(([code]) => BY[code] && !BY[code].extinct && inView(BY[code]) && onMap(BY[code]));
    rows.sort((a, b) => (BY[b[0]]._cs[c] || 0) - (BY[a[0]]._cs[c] || 0) || b[3] - a[3]);
    for (const r of rows.slice(0, 10)) if (!seen.has(r[0])) { seen.add(r[0]); out.push(r); }
  }
  return out;
}
// Two hundred countries: the drop-down has a search box, and lists the ticked ones first
function countryPicker() {
  const opts = [...COUNTRIES].sort((a, b) => countrySel.has(b) - countrySel.has(a));
  const label = !countrySel.size ? 'All countries' : COUNTRIES.filter(c => countrySel.has(c)).map(c => COUNTRY_NAMES[c]).join(', ');
  const q = countryQuery.trim().toLowerCase();
  return `<details class="msel" id="ctrysel"><summary aria-label="Countries">${esc(label)}</summary><div class="msel-pop long">
    <input type="search" class="msel-find" placeholder="Find a country" aria-label="Find a country" value="${esc(countryQuery)}">
    ${opts.map(c => `<label data-name="${esc(COUNTRY_NAMES[c].toLowerCase())} ${c}"${q && !COUNTRY_NAMES[c].toLowerCase().includes(q) && c !== q && !countrySel.has(c) ? ' hidden' : ''}><input type="checkbox" value="${c}"${countrySel.has(c) ? ' checked' : ''}>${esc(COUNTRY_NAMES[c])} <span class="cnt">${COUNTRY_N[c].toLocaleString()}</span></label>`).join('')}
    ${countrySel.size ? '<button type="button" class="msel-clear">Show all countries</button>' : ''}</div></details>`;
}
// The country drop-down: as wireMsel, plus its search box, which filters the list as you type and
// keeps its text and focus when ticking redraws the list
function wireCountries(wrap, draw) {
  const d = $(`#${wrap} details`), find = d.querySelector('.msel-find');
  const filter = () => {
    const q = find.value.trim().toLowerCase(); countryQuery = find.value;
    d.querySelectorAll('label[data-name]').forEach(lab => {
      lab.hidden = !!q && !lab.dataset.name.includes(q) && !lab.querySelector('input').checked;
    });
  };
  find.oninput = filter;
  d.ontoggle = () => { if (d.open && document.activeElement !== find) find.focus(); };  // opened: type straight away
  find.onkeydown = e => {  // Enter ticks the first country shown
    if (e.key !== 'Enter') return;
    e.preventDefault();
    const q = find.value.trim().toLowerCase();
    const shown = [...d.querySelectorAll('label[data-name]')].filter(lab => !lab.hidden && !lab.querySelector('input').checked);
    const first = shown.find(lab => lab.dataset.name.startsWith(q)) || shown.find(lab => lab.dataset.name.split(' ').pop() === q) || shown[0];
    if (first) { const box = first.querySelector('input'); box.checked = true; box.dispatchEvent(new Event('change', { bubbles: true })); }
  };
  const redraw = () => {
    $(`#${wrap}`).innerHTML = countryPicker(); const nd = $(`#${wrap} details`); nd.open = true;
    wireCountries(wrap, draw); const f = nd.querySelector('.msel-find'); f.focus(); f.setSelectionRange(f.value.length, f.value.length);
  };
  d.onchange = e => {
    if (e.target.type !== 'checkbox') return;
    if (e.target.checked) { countrySel.add(e.target.value); countryQuery = ''; } else countrySel.delete(e.target.value);
    redraw(); draw();
  };
  d.onclick = e => { if (e.target.closest('.msel-clear')) { countrySel.clear(); countryQuery = ''; redraw(); draw(); } };
}
const regionPicker = () => msel('regsel', regionSel, REGIONS.map(r => [r, r, '', ` <span class="cnt">${LANGS.filter(l => l._rg.has(r)).length.toLocaleString()}</span>`]),
  'All regions', 'All regions', '', 'Show all regions');
const regionNames = () => { const r = countrySel.size ? COUNTRIES.filter(c => countrySel.has(c)).map(c => COUNTRY_NAMES[c]) : REGIONS.filter(x => regionSel.has(x)); return r.length < 3 ? r.join(' and ') : `${r.slice(0, -1).join(', ')} and ${r.at(-1)}`; };
// The map frame for the countries ticked (their outlines, and a box around their mainlands), else
// for the regions ticked: their outlines together, and a box around them all
function regionFrame() {
  const C = GEO.basemap.countries, cs = C ? [...countrySel].map(c => C[c]).filter(Boolean) : [];
  const R = GEO.basemap.regions, fs = cs.length ? cs : R ? [...regionSel].map(r => R[r]).filter(Boolean) : [];
  if (!fs.length) return null;
  if (fs.length === 1) return fs[0];
  return { outline: fs.map(f => f.outline).join(''), box: [Math.min(...fs.map(f => f.box[0])), Math.min(...fs.map(f => f.box[1])),
    Math.max(...fs.map(f => f.box[2])), Math.max(...fs.map(f => f.box[3]))] };
}
// After a view redraws itself, open its drop-down again so several boxes can be ticked in a row
document.addEventListener('click', e => {
  document.querySelectorAll('details.msel[open], details.info[open]').forEach(d => { if (!d.contains(e.target)) d.open = false; });
});
document.addEventListener('keydown', e => {
  if (e.key === 'Escape') document.querySelectorAll('details.msel[open], details.info[open]').forEach(d => { d.open = false; d.querySelector('summary')?.focus(); });
});
// A small "i" after a fact, opening a note about it (where its figures come from, how it's counted)
function infoTip(label, html) {
  return `<details class="info"><summary aria-label="${esc(label)}" title="${esc(label)}">i</summary><div class="info-pop" role="note">${html}</div></details>`;
}
// keep an opened note inside the window
document.addEventListener('toggle', e => {
  const d = e.target;
  if (!(d instanceof HTMLElement) || !d.matches('details.info') || !d.open) return;
  const pop = d.querySelector('.info-pop');
  pop.style.left = '';
  const r = pop.getBoundingClientRect(), over = r.right - (document.documentElement.clientWidth - 12);
  if (over > 0) pop.style.left = `${-8 - over}px`;
}, true);
const reopen = wrap => { const d = $(`#${wrap} details`); if (d) d.open = true; };
const reopenCountries = wrap => { const d = $(`#${wrap} details`); if (!d) return; d.open = true;
  const f = d.querySelector('.msel-find'); if (f) { f.focus(); f.setSelectionRange(f.value.length, f.value.length); } };
// One opportunity as on a language's page: the action, its one line and its size; the language named
// above it where the list spans languages
function oppItem(o, l, showLang) {
  return `<a class="otile" href="#opp-${o.id}" title="${esc(o.title)}">
    <span class="osize" title="Effort, from what's openly available">${esc(o.size)}</span>${showLang ? `<span class="olang">${esc(l.name)}</span>` : ''}<b>${esc(o.short || o.title)}</b>${o.fact ? `<small>${esc(o.fact)}</small>` : ''}${provider !== 'All' ? provMissing(o, l, provider).map(n => `<small class="opp-prov"><span class="xmark" aria-label="Not in">\u2717</span>${esc(n)}</small>`).join('') : ''}</a>`;
}

// Grouped by language, each language where its best opportunity ranks; languages whose one opportunity is
// to start documenting them share a group at the end, named by that action, with the languages as links
function oppGroups(list) {
  const by = new Map();
  for (const x of list) {
    if (!by.has(x.l.code)) by.set(x.l.code, { l: x.l, n: x.n, items: [] });
    by.get(x.l.code).items.push(x.o);
  }
  const out = [], doc = { doc: true, langs: [] };
  for (const g of by.values()) (g.items.length === 1 && g.items[0].key === 'document' ? doc.langs : out).push(g);
  return doc.langs.length ? [...out, doc] : out;  // the documentation list always last
}
const GROUPS_SHOWN = 20, DOC_SHOWN = 60;
// speakers, after the name: in the countries or regions chosen, else everywhere
const spk = g => { const n = g.n ?? g.l.speakers; return n ? ` <span class="ospk">${people(n)}</span>` : ''; };
function oppGroup(g) {
  if (!g.doc) return `<section class="ogroup"><h2 class="ogh"><a href="${LH(g.l.code)}">${esc(g.l.name)}</a>${spk(g)}</h2>
    <div class="otiles" style="--c:var(--opp)">${g.items.map(o => oppItem(o, g.l, false)).join('')}</div></section>`;
  const names = docAll ? g.langs : g.langs.slice(0, DOC_SHOWN);
  return `<section class="ogroup"><h2 class="ogh">Start documenting it</h2>
    <div class="ochips" style="--c:var(--opp)">${names.map(x => `<a class="ochip" href="#opp-${x.items[0].id}">${esc(x.l.name)}${spk(x)}</a>`).join('')}${g.langs.length > names.length ? `<button type="button" class="chip" id="docall">And ${(g.langs.length - names.length).toLocaleString()} more</button>` : ''}</div></section>`;
}

let team = 'all', shownGroups = GROUPS_SHOWN, docAll = false;
let withVarieties = false;  // varieties whose speakers write a major standard (Egyptian Arabic, Wu): off by default, as on the Plan page
async function opportunities(lang) {
  const focus = lang && BY[lang] ? BY[lang] : null;
  if (focus) await need(focus.code);
  else if (!narrowed()) await topOpps();
  // with countries or regions chosen, ranked by reach there: each language's speakers in those places
  const pool = focus ? focus.opportunities.map(o => ({ o, l: focus })) : narrowed() ? await countryPool()
    : TOP.map(o => ({ o, l: BY[o.lang] })).filter(x => inView(x.l));
  const all = pool
    .filter(x => provider === 'All' || provMissing(x.o, x.l, provider).length)
    .filter(x => withVarieties || !x.l.wi || focus)
    .sort((a, b) => prio(b.o) - prio(a.o));
  const byTeam = all.filter(x => team === 'all' || x.o.teams.includes(team));
  const tcount = Object.fromEntries(Object.keys(TEAMS).map(k => [k, all.filter(x => x.o.teams.includes(k)).length]));
  const groups = oppGroups(byTeam), shown = groups.slice(0, shownGroups);
  const filtered = regionSel.size || ((tierSel.size || countrySel.size) && !focus) || provider !== 'All' || team !== 'all' || withVarieties || focus;
  $('#view').innerHTML = `
    <div class="controls">
      ${focus ? '' : `<span id="orwrap">${regionPicker()}</span><span id="octrywrap">${countryPicker()}</span><span id="otierwrap">${tierPicker()}</span>`}
      ${providerSelect('opsel')}
      <select id="tmsel" aria-label="What your team works on"><option value="all">Every team (${all.length})</option>${Object.entries(TEAMS).filter(([k]) => tcount[k]).map(([k, t]) => `<option value="${k}"${team === k ? ' selected' : ''}>${esc(t)} (${tcount[k]})</option>`).join('')}</select>
      <label class="switch wrap"><input type="checkbox" role="switch" id="op-var"${withVarieties ? ' checked' : ''}><span class="track" aria-hidden="true"></span>Include varieties of major languages</label>
      <button type="button" class="reset" id="oresetf"${filtered ? '' : ' hidden'}>Reset filters</button>
    </div>
    ${focus ? `<div class="lhead"><h2>${esc(focus.name)} <span class="auto">${all.length} opportunities</span></h2><a href="${LH(focus.code)}">Language profile</a></div>` : ''}
    ${shown.length ? `<div class="opp-list">${shown.map(oppGroup).join('')}</div>` : '<p class="note">Nothing matches these filters.</p>'}
    ${groups.length > shown.length ? `<button class="chip more" id="showmore">Show more languages</button>` : ''}`;
  $('#op-var').onchange = e => { withVarieties = e.target.checked; shownGroups = GROUPS_SHOWN; docAll = false; opportunities(lang); };
  $('#tmsel').onchange = e => { team = e.target.value; shownGroups = GROUPS_SHOWN; docAll = false; opportunities(lang); };
  $('#oresetf').onclick = () => { regionSel.clear(); countrySel.clear(); countryQuery = ''; tierSel.clear(); provider = 'All'; team = 'all'; withVarieties = false; shownGroups = GROUPS_SHOWN; docAll = false;
    if (lang) go('opportunities'); else opportunities(); };
  if ($('#orwrap')) wireMsel('orwrap', regionPicker, regionSel, REGIONS.length, async () => { shownGroups = GROUPS_SHOWN; docAll = false; await opportunities(lang); reopen('orwrap'); });
  if ($('#octrywrap')) wireCountries('octrywrap', async () => { shownGroups = GROUPS_SHOWN; docAll = false; await opportunities(lang); reopenCountries('octrywrap'); });
  if ($('#otierwrap')) wireMsel('otierwrap', tierPicker, tierSel, TIER_KEYS.length, async () => { shownGroups = GROUPS_SHOWN; docAll = false; await opportunities(lang); reopen('otierwrap'); });
  $('#opsel').onchange = e => { provider = e.target.value; team = 'all'; shownGroups = GROUPS_SHOWN; docAll = false; opportunities(lang); };
  const more = $('#showmore'); if (more) more.onclick = () => { shownGroups += GROUPS_SHOWN; opportunities(lang); };
  const da = $('#docall'); if (da) da.onclick = () => { docAll = true; opportunities(lang); };
  navBox('opps', 'Find a language name or code', focus ? `${focus.name} (${focus.code})` : '');
}

// The kind of resource, for the starter kit's subheadings (shown when a kit holds more than one kind)
const KIT_GROUP = [[/^asr_open_/, 'Speech-to-text models'], [/^tts_open_/, 'Text-to-speech voices'],
  [/^llm_/, 'LLMs'], [/^mt_open_/, 'Translation models'], [/^ocr_open_/, 'Text recognition models'],
  [/^kb_open_/, 'Keyboard layouts'], [/^proof_/, 'Spell-checkers'], [/^ui_/, 'Volunteer translations'],
  [/^massive_/, 'Voice assistant data'], [/^(speech_fleurs|flores|belebele)/, 'Test sets'], [/^(cv_|speech_|open_speech)/, 'Speech data'],
  [/^parallel_/, 'Parallel text'], [/^(web_text|wikipedia|ud_)/, 'Text'], [/^cldr/, 'Locale data'], [/^font_/, 'Fonts']];
function kitGroups(kit) {
  const out = new Map();
  for (const k of kit) {
    const g = (KIT_GROUP.find(([re]) => re.test(k.id)) || [, 'Other resources'])[1];
    out.set(g, [...(out.get(g) || []), k]);
  }
  return [...out];
}

async function oppDetail(id) {
  const l = BY[id.split('-')[0]];
  if (!l) return opportunities();
  await need(l.code);
  const o = l.opportunities.find(y => y.id === id);
  if (!o) return opportunities();
  const facts = DATA.facts[l.code] || {};
  // people, then their share in the ranking table's colours
  // where it's spoken in more than one country, the totals under the counts
  const total = cs => {
    if (cs.length < 2) return '';
    const spk = cs.reduce((a, c) => a + (c.speakers || 0), 0);
    const col = k => { const known = cs.filter(c => c[k] != null); return known.length ? known.reduce((a, c) => a + c.speakers * c[k], 0) / spk : null; };
    return `<tfoot><tr><th scope="row">Total</th><td class="num">${people(spk)}</td>${['online', 'text', 'online_5y'].map(k => `<td class="num">${share(spk, col(k))}</td>`).join('')}</tr></tfoot>`;
  };
  const share = (n, v) => v == null ? '—' : `${people(n * v)} <span class="pct p${pctBand(v)}">(${Math.round(v * 100)}%)</span>`;
  const kit = o.kit.length ? `<div class="tablebox"><table class="otab">
      <thead><tr><th>Resource</th><th>What it is</th><th>Quantity/Availability</th><th>Licence</th><th>Commercial use</th></tr></thead>
      <tbody>${kitGroups(o.kit).map(([g, ks], _, all) => (all.length > 1 ? `<tr class="kgroup"><th colspan="5" scope="colgroup">${esc(g)}</th></tr>` : '')
        + ks.map(k => `<tr><td><a href="${esc(k.link)}" target="_blank" rel="noopener">${esc(k.name)}</a></td><td>${esc(k.what)}</td><td class="nw">${esc(k.size)}</td><td class="nw">${esc(k.licence || '—')}</td><td class="nw">${esc(COMMERCIAL[k.commercial] || '—')}</td></tr>`).join('')).join('')}</tbody></table></div>`
    : '<p class="note">No open resources found yet in the sources tracked.</p>';
  const countries = l.reach_by_country.length ? `<div class="tablebox"><table class="otab opp-reach">
      <thead><tr><th>Country</th><th class="num">Speakers</th><th class="num">Online today</th><th class="num">Online and able to text</th><th class="num">Online in five years</th></tr></thead>
      <tbody>${l.reach_by_country.map(c => `<tr><td>${esc(c.name)}</td><td class="num">${people(c.speakers)}</td>${[c.online, c.text, c.online_5y].map(v => `<td class="num">${share(c.speakers, v)}</td>`).join('')}</tr>`).join('')}</tbody>${total(l.reach_by_country)}</table></div>` : '';
  // every source this card checked, with what it records for the language (or that it doesn't list it)
  // Yes first, then the other sources that record something, then those with no result for the language
  // services and benchmarks only: datasets are linked in "Ready to use" above
  const kitIds = new Set(o.kit.map(k => k.id));
  const isData = i => i in CFG.data.indicators || /^(cv_|speech_|massive_)/.test(i);
  const ids = (o.checked || o.evidence).filter(i => !kitIds.has(i) && !isData(i));
  const yes = i => facts[i] && showValue(facts[i]) === 'Yes';
  const checked = [...ids.filter(yes), ...ids.filter(i => facts[i] && !yes(i)), ...ids.filter(i => !facts[i])].map(i => {
    const f = facts[i], name = (SVC[i] ? `${SVC[i][0]}${SVC[i][1] ? ` \u2013 ${SVC[i][1]}` : ''}` : '') || L[i] || (f && f.source) || i;
    if (!f) return `<tr><td>${esc(name)}</td><td class="muted">${ROLE_OF[i] === 'measured' ? 'No published result' : 'Not listed'}</td><td class="nw">—</td><td></td></tr>`;
    const v = showValue(f), yn = v === 'Yes' ? ' class="yn-yes"' : v === 'No' ? ' class="yn-no"' : '';
    return `<tr><td><a href="${esc(f.url.split(' ')[0])}" target="_blank" rel="noopener">${esc(name)}</a></td><td${yn}>${esc(v)}</td><td class="nw">${esc(fmtDay(f.retrieved))}</td><td class="onote">${esc(f.note || '')}</td></tr>`;
  }).join('');
  const needs = o.needs || [[o.gap_text || o.title, o.missing], ...(o.also || [])];
  $('#view').innerHTML = `
    <button class="back" id="back">← Back to ${esc(l.name)}</button>
    <div class="opp-hero" style="--c:var(--opp)">
      <h2>${esc(l.name)}: ${esc(o.short || o.title)}</h2>
      ${o.fact ? `<p class="why">${esc(o.fact)}</p>` : ''}
      <div class="opp-foot"><span></span><button class="chip" id="copylink">Copy link</button></div>
    </div>
    <h3 class="panel-h">Ready to use</h3>${kit}
    <h3 class="panel-h">Still needed</h3><div class="tablebox"><table class="otab">
      <thead><tr><th>Gap</th><th>Notes</th></tr></thead>
      <tbody>${needs.map(([g, w]) => `<tr><td>${esc(g)}</td><td>${esc(w)}</td></tr>`).join('')}</tbody></table></div>
    ${countries ? `<h3 class="panel-h">Who it would reach</h3>${countries}` : ''}
    <details class="osrc"><summary>${TW}<h3 class="panel-h">Sources checked</h3></summary>${checked ? `<div class="tablebox"><table class="otab">
      <thead><tr><th>Source</th><th>For ${esc(l.name)}</th><th>Retrieved</th><th>Notes</th></tr></thead>
      <tbody>${checked}</tbody></table></div>` : '<p class="note">Every data and technology source tracked here; none records anything for this language.</p>'}</details>
    <p class="note">Something here out of date, or a resource we've missed? <a href="${REPO_URL}/issues/new/choose" target="_blank" rel="noopener">Send a correction on GitHub</a> or email <span class="email">${CORRECTIONS_EMAIL}</span>.</p>`;
  $('#back').onclick = () => { go('lang-' + l.code); };
  $('#copylink').onclick = async e => {
    const url = location.href.split('#')[0] + '#opp-' + o.id;
    try { await navigator.clipboard.writeText(url); e.target.textContent = 'Link copied'; }
    catch { e.target.textContent = url; }
  };
}

// ---------------------------------------------------------------- ranking
let query = '', rankAll = false, rankShown = 100, sortBy = 'rank', sortDir = 1, sortChosen = false;  // until a column is chosen: by rank, or by speakers with a region or country chosen
const tierSel = new Set();  // tiers shown in the ranking; empty means all
let showGaps = false;       // only languages with something in the Gaps column
const endSel = new Set();   // endangerment levels shown; empty means every living language
// UNESCO's levels as LinguaMeta gives them; "extinct" covers languages LTDI keeps out of the ranking
const END_LEVELS = [['not_endangered', 'Not endangered'], ['vulnerable', 'Vulnerable'], ['definitely_endangered', 'Definitely endangered'],
  ['severely_endangered', 'Severely endangered'], ['critically_endangered', 'Critically endangered'], ['revitalizing', 'Revitalizing'],
  ['extinct', 'Extinct'], ['none', 'Not assessed']];
const END_LABEL = Object.fromEntries(END_LEVELS);
const END_SOURCE = { linguameta: 'from LinguaMeta', glottolog: 'from Glottolog 5.4',
  member: 'from its most-spoken member language', review: 'reviewed by the LTDI team' };
const endKey = l => l.extinct ? 'extinct' : l.endangerment || 'none';
const endPicker = () => msel('endsel', endSel, END_LEVELS.map(([k, t]) => [k, t, '']), 'Any endangerment', null, '', 'Clear');
// Tiers ([tiers] in the methodology): score cut-offs for the top three, then stages by what's recorded
const TIER_KEYS = [...DATA.config.tiers.cutoffs.map(([k, t]) => [k, t]), ...DATA.config.tiers.stages];
const TIER_LABEL = Object.fromEntries(TIER_KEYS);
// what each tier means, on hover: the score range for the top three, what's recorded for the stages
const TIER_DESC = Object.fromEntries([...DATA.config.tiers.cutoffs.map(([k, t, c], i, a) => [k, `${t}: LTDI ${c.toFixed(2)}${i ? `–${a[i - 1][2].toFixed(2)}` : ' and above'}`]),
  ...DATA.config.tiers.stages.map(([k, t, d]) => [k, `${t}: ${d.charAt(0).toLowerCase() + d.slice(1)}`])]);
// A drop-down of tick boxes, so several values can be chosen at once (Medium and Low, say)
function msel(id, sel, opts, none, all, prefix, clear) {
  const label = !sel.size ? none : sel.size === opts.length && all ? all
    : prefix + opts.filter(([k]) => sel.has(k)).map(([, t]) => t).join(', ');
  return `<details class="msel" id="${id}"><summary aria-label="${esc(none)}">${esc(label)}</summary><div class="msel-pop">
    ${opts.map(([k, t, mark, after = '']) => `<label><input type="checkbox" value="${k}"${sel.has(k) ? ' checked' : ''}>${mark}${esc(t)}${after}</label>`).join('')}
    ${sel.size ? `<button type="button" class="msel-clear">${esc(clear)}</button>` : ''}</div></details>`;
}
const tierPicker = () => msel('tiersel', tierSel, TIER_KEYS.map(([k, t]) => [k, t, `<i style="background:var(${TIERC[k]})"></i>`]),
  'All tiers', 'All tiers', '', 'Show all tiers');
// Wire a drop-down: ticking updates the set, redraws, and keeps the drop-down open
function wireMsel(wrap, make, sel, size, draw) {
  const d = $(`#${wrap} details`);
  d.onchange = e => {
    if (e.target.checked) sel.add(e.target.value); else sel.delete(e.target.value);
    if (size && sel.size === size) sel.clear();
    $(`#${wrap}`).innerHTML = make(); $(`#${wrap} details`).open = true; wireMsel(wrap, make, sel, size, draw); draw();
  };
  d.onclick = e => { if (e.target.closest('.msel-clear')) { sel.clear(); $(`#${wrap}`).innerHTML = make(); wireMsel(wrap, make, sel, size, draw); draw(); } };
}
// Sortable columns: [key, label, value for sorting, natural direction (1 = ascending first)]
const GAP_WEIGHT = { none: 2, open: 1 };
const SORTS = {
  rank: ['#', l => l.rank ?? 1e9, 1], name: ['Language', l => l.name.toLowerCase(), 1], speakers: ['Speakers', l => vSpk(l) || 0, -1],
  online: ['Online', l => vOn(l) || 0, -1],
  ltdi: ['LTDI', l => l.ltdi, -1], tier: ['Tier', l => l.ltdi, -1],
  gaps: ['Gaps', l => Object.values(l.gaps).reduce((n, g) => n + GAP_WEIGHT[g], 0) * 1e5 + (l.rank ?? 9e4), 1],  // fewest first
};
function sortBtn(key, inner = SORTS[key][0]) {
  const on = sortBy === key, arr = on ? (sortDir === SORTS[key][2] ? (SORTS[key][2] > 0 ? '▲' : '▼') : (SORTS[key][2] > 0 ? '▼' : '▲')) : '';
  return `<button class="sort" data-sort="${key}" aria-pressed="${on}" title="Sort by ${esc(SORTS[key][0].toLowerCase())}${on ? ' (select again to reverse)' : ''}">${inner}<span class="arr" aria-hidden="true">${arr}</span></button>`;
}
function rankHead() {
  const aria = k => sortBy === k ? ` aria-sort="${(sortDir === SORTS[k][2]) === (SORTS[k][2] > 0) ? 'ascending' : 'descending'}"` : '';
  return `<th class="c-rank"${aria('rank')}>${sortBtn('rank')}</th><th class="c-name"${aria('name')}>${sortBtn('name')}</th>
    <th class="num hide-sm hide-nar c-spk"${aria('speakers')}>${sortBtn('speakers')}</th><th class="num hide-sm c-onl" title="Estimated speakers online today, and their share of all speakers"${aria('online')}>${sortBtn('online')}</th>
    <th class="c-dim">Dimensions</th>
    <th class="num c-ltdi"${aria('ltdi')}>${sortBtn('ltdi')}</th><th class="c-tier hide-sm hide-tab"${aria('tier')}>${sortBtn('tier')}</th>
    <th class="hide-sm c-gaps" title="Main technologies no commercial service offers"${aria('gaps')}>${sortBtn('gaps')}</th>`;
}
const RANK_PAGE = 100;  // rows shown at first and added by "Show 100 more"; searching shows every match
// Ranking "Gaps" column: the main technologies that no commercial service offers
const MAIN_TECH = Object.entries(CFG.tech.technologies).filter(([, t]) => t.group !== 'more').map(([k]) => k);
const GAP_TECH = Object.entries(CFG.tech.technologies).filter(([, t]) => t.group !== 'more' || t.gap).map(([k]) => k);  // Gaps column
function gapsCell(l) {
  return `<div class="gaps">${GAP_TECH.filter(k => l.gaps[k]).map(k => {
    const t = CFG.tech.technologies[k], open = l.gaps[k] === 'open';
    const what = open ? (t.measured ? 'benchmark results only' : 'open model only') : 'nothing found';
    return `<span class="gap-i ${open ? 'open' : 'none'}" title="${esc(t.label)}: ${what}">${TICON[k]}<span class="sr">${esc(t.label)}: ${what}</span></span>`;
  }).join('')}</div>`;
}

// Totals for the languages in view: speakers and online (summed per language, so people who speak
// several are counted in each), the share of languages and of speakers in each tier, and the
// speakers whose language has no commercial service for each main technology
const pctBand = r => r >= 0.75 ? 4 : r >= 0.5 ? 3 : r >= 0.25 ? 2 : 1;  // share online, for colour
const GAP_SHORT = { speech_input: 'Speech-to-text', tts: 'Text-to-speech', mt: 'Translation', llm: 'LLM app lists', keyboard: 'Keyboard', assistant: 'Voice assistant' };
const GAP_TITLE = { llm: "Speakers whose language is in no major AI assistant's official language list (models may still answer in it)" };
// technologies counted through a spoken variety's written standard ([written_standard] in the methodology)
const WRITTEN_TECH = new Set(DATA.config.written_standard ? DATA.config.written_standard.technologies : []);
const GAP_GROUPS = [['Text', ['keyboard', 'mt']], ['Speech', ['speech_input', 'tts']], ['AI', ['llm', 'assistant']]];
function rankSummary(ls) {
  const sum = f => ls.reduce((n, l) => n + (f(l) || 0), 0);
  const sp = sum(vSpk), on = sum(vOn);
  const tiers = TIER_KEYS.map(([k]) => k), label = TIER_LABEL;
  const by = Object.fromEntries(tiers.map(t => [t, { n: 0, sp: 0 }]));
  for (const l of ls) { const t = tierOf(l)[0]; by[t].n++; by[t].sp += vSpk(l) || 0; }
  const pct = (x, of) => of ? x / of * 100 : 0;
  const fmtPct = v => v > 0 && v < 1 ? '<1%' : Math.round(v) + '%';
  const row = (name, key, total) => `<div class="tbar-row"><span class="tbar-k">${name}</span><div class="tbar">${tiers.map(t => {
      const v = pct(by[t][key], total);
      return v ? `<i style="width:${v}%;background:var(${TIERC[t]})" title="${label[t]}: ${fmtPct(v)} of ${key === 'n' ? 'languages' : 'speakers'}\n${by[t].n.toLocaleString()} ${by[t].n === 1 ? 'language' : 'languages'} with ${people(by[t].sp)} speakers"></i>` : '';
    }).join('')}</div></div>`;
  // Grouped by kind, two technologies each: no commercial or regional service (an open model or benchmark
  // alone still counts), the same definition as the Gaps column and the Charts bars' last two segments
  const noCommercial = (l, k) => !!l.gaps[k];
  const gapItem = k => {
    const t = CFG.tech.technologies[k], n = sum(l => noCommercial(l, k) ? vSpk(l) : 0);
    return `<span class="rgap" title="${esc(GAP_TITLE[k] || `Speakers whose language has no commercial ${t.label.toLowerCase()} service`)}${WRITTEN_TECH.has(k) ? '. Spoken varieties count through the standard language their speakers write' : ''}">
      <span class="gap-i none">${TICON[k]}</span><b>${n ? people(n) : '0'}</b><small>${esc(GAP_SHORT[k] || t.label)}</small></span>`;
  };
  const gaps = GAP_GROUPS.map(([g, ks]) => `<div class="rgcol" aria-label="${g}">${ks.map(gapItem).join('')}</div>`).join('');
  return `
    <div class="rsum-totals">
      <div><div class="eyebrow">Languages</div><b>${ls.length.toLocaleString()}</b></div>
      <div title="Each language's speakers added up, so people who speak several languages are counted once for each"><div class="eyebrow">Speakers*</div><b>${people(sp)}</b><small class="rs-sum">summed</small></div>
      <div title="Estimated speakers online today, added up the same way"><div class="eyebrow">Online*</div><b>${people(on)}</b><small class="rs-sum">summed</small></div>
      <p class="rsum-note">* Each language's speakers added up, so people who speak several languages are counted in each, and the totals exceed the population.${narrowed() ? ` Each language counts only its speakers in ${countrySel.size ? 'the countries' : 'the regions'} chosen.` : ''}</p>
    </div>
    <div class="rsum-tiers">
      <div class="eyebrow">Share by tier</div>
      ${row('Languages', 'n', ls.length)}${row('Speakers', 'sp', sp)}
      <div class="tbar-key">${tiers.map(t => `${t === DATA.config.tiers.stages[0][0] ? '<span class="tk-sep">below Medium, by what exists:</span>' : ''}<span${TIER_DESC[t] ? ` title="${esc(TIER_DESC[t])}"` : ''}><i style="background:var(${TIERC[t]})"></i>${label[t]}</span>`).join('')}</div>
    </div>
    <div class="rsum-gaps">
      <div class="eyebrow" title="No commercial or regional service found; an open model alone doesn't count. Text technologies count spoken varieties through the standard language their speakers write">Speakers with no commercial service found</div>
      <div class="rgaps">${gaps}</div>
    </div>
`;
}

// Search by name, autonym, code or any other English name LinguaMeta records ("Cantonese" finds Yue
// Chinese, "Buryat" the Buriat languages)
const altNames = l => l._alt ??= (l.alt ? l.alt.split('|') : []);
const matches = (l, q) => [l.name, l.autonym, l.code, l.iso_639_3].some(s => (s || '').toLowerCase().includes(q))
  || altNames(l).some(a => a.toLowerCase().includes(q));
const altHit = (l, q) => q && ![l.name, l.autonym, l.code, l.iso_639_3].some(s => (s || '').toLowerCase().includes(q))
  ? altNames(l).find(a => a.toLowerCase().includes(q)) : null;

function ranking() {
  $('#view').innerHTML = `
    <div class="controls">
      <span id="regwrap">${regionPicker()}</span>
      <span id="ctrywrap">${countryPicker()}</span>
      <span id="tierwrap">${tierPicker()}</span>
      <span id="endwrap" title="UNESCO's endangerment level, from LinguaMeta and Glottolog. Extinct languages are listed only when chosen here">${endPicker()}</span>
      <label class="switch" title="Show only languages with a gap: a main technology with no commercial service, or only an open model or benchmark"><input type="checkbox" role="switch" id="gapsw"${showGaps ? ' checked' : ''}><span class="track" aria-hidden="true"></span>Show gaps</label>
      <button type="button" class="reset" id="resetf" hidden>Reset filters</button>
    </div>
    <div class="rsum-wrap"><div id="rsum" class="rsum" aria-live="polite"></div></div>
    <div class="legend">
      ${DIMS.map(([k, , c]) => `<span><i class="sw" style="background:var(${c})"></i>${k === 'tech' ? 'Technology' : 'Data'}</span>`).join('\n      ')}
      <span class="hide-sm">Gaps:</span>
      <span class="hide-sm"><span class="gap-i none">${TICON.tts}</span>No service found</span>
      <span class="hide-sm"><span class="gap-i open">${TICON.tts}</span>Open model or benchmark only</span>
    </div>
    <div class="tablebox"><table class="ranktab">
      <thead><tr id="rankhead"></tr></thead>
      <tbody id="rows"></tbody>
    </table></div>
    <div id="rankmore"></div>
`;
  const draw = () => {
    const q = query.trim().toLowerCase();
    const all = (endSel.size ? ALL.filter(l => endSel.has(endKey(l))) : LANGS).filter(l => inView(l)
      && (!showGaps || GAP_TECH.some(k => l.gaps[k])) && (!q || matches(l, q)));
    if (!sortChosen) { sortBy = countrySel.size || regionSel.size ? 'speakers' : 'rank'; sortDir = SORTS[sortBy][2]; }
    const [, val, natural] = SORTS[sortBy], dir = sortDir;
    all.sort((a, b) => { const x = val(a), y = val(b); return (x < y ? -1 : x > y ? 1 : (a.rank ?? 1e9) - (b.rank ?? 1e9)) * dir; });
    $('#rsum').innerHTML = rankSummary(all);
    $('#resetf').hidden = !regionSel.size && !countrySel.size && !tierSel.size && !endSel.size && !showGaps && !q;
    $('#rankhead').innerHTML = rankHead();
    const rows = rankAll || q ? all : all.slice(0, rankShown);
    $('#rankmore').innerHTML = rows.length < all.length ? (all.length - rows.length > RANK_PAGE ? `<button class="chip more" id="rank100">Show ${RANK_PAGE} more</button> ` : '')
      + `<button class="chip more" id="rankall">Show all ${all.length.toLocaleString()} languages</button>` : '';
    const btn = $('#rankall'); if (btn) btn.onclick = () => { rankAll = true; draw(); };
    const more = $('#rank100'); if (more) more.onclick = () => { rankShown += RANK_PAGE; draw(); };
    $('#rows').innerHTML = rows.map(l => `
      <tr tabindex="0" data-code="${l.code}">
        <td class="rank"${rankTitle(l) ? ` title="${esc(rankTitle(l))}"` : ''}>${rankLabel(l)}</td>
        <td class="c-name" title="${esc(l.name)}${l.autonym && l.autonym !== l.name ? ' · ' + esc(l.autonym) : ''}"><div class="lname">${esc(l.name)}</div><div class="auto">${altHit(l, q) ? `also ${esc(altHit(l, q))}` : esc(l.autonym !== l.name ? l.autonym : '')} <span class="code">[${l.code}]</span></div></td>
        <td class="num hide-sm hide-nar">${people(vSpk(l))}</td>
        <td class="num hide-sm">${people(vOn(l))}${vOn(l) && vSpk(l) ? ` <span class="pct p${pctBand(vOn(l) / vSpk(l))}">(${Math.round(vOn(l) / vSpk(l) * 100)}%)</span>` : ''}</td>
        <td><div class="bars" role="img" aria-label="Data ${l.dimensions.data.score}, technology ${l.dimensions.tech.score}">
          ${DIMS.map(([k, , c]) => bar(l.dimensions[k].score, c)).join('')}</div></td>
        <td class="num score"${l.raw ? ` title="${esc(rawText(l))}"` : ''}>${l.ltdi.toFixed(3)}</td>
        <td class="hide-sm hide-tab">${tierChip(l)}</td>
        <td class="hide-sm">${gapsCell(l)}</td>
      </tr>`).join('') || `<tr><td colspan="8">No language matches “${esc(query)}”.</td></tr>`;
  };
  draw();
  wireMsel('regwrap', regionPicker, regionSel, REGIONS.length, draw);
  navBox('filter', 'Find a language name or code', query);
  navFilter = v => { query = v; draw(); };
  $('#resetf').onclick = () => { regionSel.clear(); countrySel.clear(); countryQuery = ''; tierSel.clear(); endSel.clear(); showGaps = false; query = ''; rankAll = false; rankShown = RANK_PAGE; sortChosen = false; ranking(); };
  wireMsel('tierwrap', tierPicker, tierSel, TIER_KEYS.length, draw);
  wireCountries('ctrywrap', draw);
  wireMsel('endwrap', endPicker, endSel, 0, draw);
  $('#gapsw').onchange = e => { showGaps = e.target.checked; draw(); };
  if (!ranking.closer) {  // once: a click elsewhere closes the drop-downs
    ranking.closer = e => document.querySelectorAll('details.msel[open]').forEach(d => { if (!d.contains(e.target)) d.open = false; });
    document.addEventListener('click', ranking.closer);
  }
  $('#rows').onclick = e => { const tr = e.target.closest('tr[data-code]'); if (tr) go('lang-' + tr.dataset.code); };
  $('#rankhead').onclick = e => {
    const b = e.target.closest('[data-sort]'); if (!b) return;
    const k = b.dataset.sort;
    if (sortBy === k) sortDir = -sortDir; else { sortBy = k; sortDir = SORTS[k][2]; }
    sortChosen = true;
    draw();
    $(`#rankhead [data-sort="${k}"]`)?.focus();
  };
  $('#rows').onkeydown = e => { if (e.key === 'Enter') { const tr = e.target.closest('tr[data-code]'); if (tr) go('lang-' + tr.dataset.code); } };
}

// --------------------------------------------------------------- language

// Service tiles on the technology panel: plain names (no logos), status, and what each offers
// Service names, kinds and providers come from config/services.csv
// a kind with a qualifier ("Open model, languages its paper evaluates"): the tile shows what comes before the comma,
// the sources table's notes the rest
const kindParts = k => { const i = k.search(/, [a-z]/); return i < 0 ? [k, ''] : [k.slice(0, i), k.slice(i + 2)]; };  // not "MMMLU, 2025"
const SVC = Object.fromEntries(DATA.services.map(s => [s.id, [s.name, kindParts(s.kind)[0], s.provider, kindParts(s.kind)[1]]]));
// Commitment signatories first (Gates Foundation, Sept 2026), then other large companies, smaller ones, open source; tiles follow this order
const PROV = { google: 'Google', microsoft: 'Microsoft', amazon: 'Amazon', openai: 'OpenAI', anthropic: 'Anthropic', apple: 'Apple', meta: 'Meta', deepl: 'DeepL', mistral: 'Mistral AI', alibaba: 'Alibaba', elevenlabs: 'ElevenLabs', deepgram: 'Deepgram', assemblyai: 'AssemblyAI', speechmatics: 'Speechmatics', abbyy: 'ABBYY', cohere: 'Cohere', xai: 'xAI', samsung: 'Samsung', open: 'Open source' };
// Regional providers: one highlight chip for them all on language pages (most readers know the global ones)
const REGIONAL = { yandex: 'Yandex', baidu: 'Baidu', naver: 'Naver', sarvam: 'Sarvam AI', lelapa: 'Lelapa AI', ghananlp: 'GhanaNLP', sunbird: 'Sunbird AI', bhashini: 'Bhashini', intron: 'Intron' };
const PROV_ALL = { ...PROV, ...REGIONAL };
// Tile order: the global providers, then regional ones, then open source
const PROV_ORDER = [...Object.keys(PROV).filter(k => k !== 'open'), ...Object.keys(REGIONAL), 'open'];
// Provider highlight: dim every other provider's tiles (one rule per provider, so new providers just work)
document.head.insertAdjacentHTML('beforeend', `<style>${Object.keys(PROV).map(k =>
  `section.focus-${k} .tile[data-prov]:not([data-prov="${k}"]) { opacity: .3; }`).join('\n')}
  section.focus-regional .tile[data-prov]:not([data-regional]) { opacity: .3; }</style>`);
// what's open on a language page: kept while the page redraws, reset on another language
let provFocus = null, moreOpen = false, provsOpen = false, openFor = null;
const techOpen = new Set();  // the technologies whose services are shown
const dimOpen = new Set();  // the panels (tech, data) whose breakdown is shown
const ROLE_OF = Object.fromEntries(DATA.services.map(s => [s.id, s.role]));
const DEPTH_OF = Object.fromEntries(DATA.services.filter(s => s.depth).map(s => [s.id, s.depth]));
// A published quality measure that discounts a service where it's poor (services.csv: quality)
const QUALITY_OF = Object.fromEntries(DATA.services.filter(s => s.quality).map(s => [s.id, s]));
// Who measured each published quality figure, and on what (services.csv: quality_by, test_set, test_size, test_public)
const TEST_OF = Object.fromEntries(DATA.services.filter(s => s.test_set).map(s => [s.id, s]));
// Families (Glottolog): the groups above each language, and the nearest relatives with more support
const GN = DATA.gnodes, GN_BY = Object.fromEntries(GN.map(([g], i) => [g, i]));
const famName = l => l._gp.length ? GN[l._gp[0]][1] : l.giso ? 'Isolate' : '';
const branchName = l => l._gp.length > 1 ? GN[l._gp[l._gp.length - 1]][1] : '';
// Engineering flags: what makes building for a language cost more (ltdi.engineering)
const FLAG_SHORT = { r: 'RTL', s: 'Shaping', w: 'No spaces', i: 'IME', m: 'Scripts', l: 'Look-alikes' };
const flagLabels = l => l._fx.map(f => (DATA.flags[f] || [, f])[1]);
const flagTags = l => l._fx.length ? `<div class="ftags" title="${esc(flagLabels(l).join('\n'))}">${l._fx.map(f => FLAG_SHORT[f]).join(' · ')}</div>` : '';
// A figure passes the planner's quality filter: all, on public test sets, or independent only
const qualityOK = (id, q) => { const t = TEST_OF[id]; if (!t) return false;
  return q === 'pub' ? t.test_public !== 'no' : q === 'ind' ? t.quality_by === 'independent' : true; };
const qualityShown = id => qualityOK(id, plan.q);
// Readiness: for each technology, the ingredients a team would look for before building, and whether
// each is recorded here. o.com counts only commercially usable data and models; o.q is the quality filter.
const KB_ALL = ['kb_gboard', 'kb_apple', 'kb_swiftkey', 'kb_open_keyman'];
const LLM_RESULTS = ['llm_global_mmlu_rel', 'llm_mmmlu_openai', 'llm_afrobench_gpt4o', 'llm_afrobench_gemini'];
function readiness(l, t, o = { com: false, q: 'all' }) {
  const has = id => l._offers.has(id) && !(o.com && RES[id] && RES[id].commercial === 'no');
  const fl = k => (l.rk || '').includes(k), ww = l.ww || 0, qv = l.qv || {};
  const hours = ((o.com ? l.shc : l.sh) || 0) >= 10, use = o.com ? 'commercially usable ' : 'open ';
  const asrModel = ['asr_open_whisper', 'asr_open_mms', 'asr_open_omnilingual'].some(has);
  const voice = has('tts_open_mms');
  const llmResult = LLM_RESULTS.some(id => l._offers.has(id) && qualityOK(id, o.q));
  const unicode = ['Its script is in Unicode', fl('u')], cldr = ['Locale data in CLDR', fl('l')], text1m = ok => ['A million words of web text' + ok, ww >= 1e6];
  const list = {
    speech_input: [[`10 hours or more of ${use}transcribed speech`, hours], ['An open speech recognition model' + (o.com ? ' licensed for commercial use' : ''), asrModel],
      ['A published error rate on FLEURS', qv.asr_whisper_fleurs_wer != null && qualityOK('asr_open_whisper', o.q)],
      ['A public test set (FLEURS or Common Voice)', fl('f') || fl('c')], text1m(', for a language model')],
    tts: [[`10 hours or more of ${use}transcribed speech`, hours], ['An open voice' + (o.com ? ' licensed for commercial use' : ''), voice],
      ['A keyboard to type text with', KB_ALL.some(id => l._offers.has(id))], text1m(', for text normalisation')],
    mt: [['100,000 sentence pairs with English', (l.ps || 0) >= 1e5], ['The FLORES-200 evaluation set', fl('F')],
      ['An open translation model' + (o.com ? ' licensed for commercial use' : ''), has('mt_open_nllb') || has('mt_open_madlad')],
      ['A published quality score', (qv.mt_nllb_flores_chrf != null && qualityOK('mt_open_nllb', o.q)) || (qv.mt_google_flores_chrf != null && qualityOK('mt_google', o.q))]],
    llm: [['100 million words of web text', ww >= 1e8], ['Covered by a public benchmark', fl('b')], ['A published LLM result', llmResult]],
    keyboard: [unicode, ['An open keyboard layout (Keyman)', has('kb_open_keyman')], ['A spell-check dictionary or a million words of text', has('proof_hunspell') || ww >= 1e6],
      ['A word-frequency list, for predictions (Corpus Crawler)', fl('w')], cldr],
    interface: [unicode, cldr, ['Volunteer localisers (Firefox or MediaWiki is translated)', l._offers.has('ui_firefox') || l._offers.has('ui_mediawiki')]],
    ocr: [unicode, ['A Noto font', fl('n')], ['An open OCR model (Tesseract)', has('ocr_open_tesseract')], text1m(', for training')],
    proofing: [['An open spell checker (Hunspell or LanguageTool)', has('proof_hunspell') || has('proof_languagetool')], text1m(''),
      ['A word-frequency list (Corpus Crawler)', fl('w')], ['A Universal Dependencies treebank', fl('d')]],
    assistant: [['An open speech recognition model' + (o.com ? ' licensed for commercial use' : ''), asrModel], ['An open voice' + (o.com ? ' licensed for commercial use' : ''), voice],
      ['An LLM benchmark result or AI app listing', llmResult || ['llm_app_gemini', 'llm_app_copilot', 'llm_app_chatgpt'].some(id => l._offers.has(id))]],
  }[t] || [];
  return { items: list.map(([label, ok]) => ({ label, ok: !!ok })), n: list.filter(x => x[1]).length, of: list.length };
}
const readyTitle = r => r.items.map(x => `${x.ok ? '✓' : '–'} ${x.label}`).join('\n');
function qualityText(f, q) {
  if (!f) return '';
  if (f.unit === '% WER') return depthText(f, q.quality);
  if (f.unit === 'WER band') return f.note.replace(/, as .*/, '');  // 'Word error rate 25-50%'
  const v = f.value, poor = +q.quality_poor, good = +q.quality_good;
  const band = (v - poor) / (good - poor) >= 1 ? 'good' : (v - poor) / (good - poor) > 0.4 ? 'fair' : 'low';
  const year = ((f.source || '').match(/(\d{4})\)?$/) || [])[1];  // when it was measured, from the source
  return `${band[0].toUpperCase() + band.slice(1)} quality${year ? ` (${year})` : ''}`;
}
const ICON = p => `<svg class="ticon" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${p}</svg>`;
const TICON = {
  keyboard: ICON('<rect x="2.5" y="6" width="19" height="12" rx="2"/><path d="M6 10h.01M9.5 10h.01M13 10h.01M16.5 10h.01M7 14h10"/>'),
  speech_input: ICON('<rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5.5 11a6.5 6.5 0 0 0 13 0M12 17.5V21"/>'),
  tts: ICON('<path d="M4 10v4h3.5L12 18V6L7.5 10H4z"/><path d="M15.5 9a4 4 0 0 1 0 6M18 6.5a7.5 7.5 0 0 1 0 11"/>'),
  mt: ICON('<path d="M3.5 5.5h9v7h-5l-3 2.5v-2.5h-1z"/><path d="M12.5 9.5h8v7h-1V19l-3-2.5h-4z"/>'),
  llm: ICON('<path d="M4 5.5h16v10H9l-4 3.5v-3.5H4z"/><path d="M8.5 10.5h.01M12 10.5h.01M15.5 10.5h.01"/>'),
  interface: ICON('<rect x="3" y="4.5" width="18" height="12" rx="1.5"/><path d="M8.5 20h7M12 16.5V20M7 9h6M7 12h10"/>'),
  ocr: ICON('<path d="M4 8V5.5A1.5 1.5 0 0 1 5.5 4H8M16 4h2.5A1.5 1.5 0 0 1 20 5.5V8M20 16v2.5a1.5 1.5 0 0 1-1.5 1.5H16M8 20H5.5A1.5 1.5 0 0 1 4 18.5V16"/><path d="M8 9.5h8M8 12h8M8 14.5h5"/>'),
  proofing: ICON('<path d="M4 15l3.5-9L11 15M5.3 12h4.4"/><path d="M13 14.5l2.5 2.5 5-6"/>'),
  assistant: ICON('<path d="M12 3.5l1.6 3.9 3.9 1.6-3.9 1.6L12 14.5l-1.6-3.9L6.5 9l3.9-1.6z"/><path d="M5 17.5c1.5 1.8 4 3 7 3s5.5-1.2 7-3"/>'),
  langid: ICON('<circle cx="11" cy="11" r="6.5"/><path d="M15.8 15.8L20 20M8 11h6M11 8v6"/>'),
  locale: ICON('<rect x="3.5" y="5" width="17" height="15" rx="2"/><path d="M3.5 9.5h17M8.5 3v4M15.5 3v4M7.5 13.5h2M11 13.5h2M14.5 13.5h2M7.5 16.5h2M11 16.5h2"/>'),
};
function depthText(f, ind) {
  if (!f) return '';
  if (f.unit === '% WER') return f.value >= 100 ? 'No published error rate' : `${Math.round(f.value)}% word error rate`;
  if (f.unit === 'levels of 2') {
    if (ind === 'ocr_google_level') return f.value >= 2 ? '' : 'Experimental';
    return f.value >= 2 ? 'Fully translated' : 'Partly translated';
  }
  if (ind === 'ocr_azure_handwriting') return f.value ? 'Printed and handwriting' : 'Printed text only';
  if (/^features of/.test(f.unit) || /^types of/.test(f.unit)) {
    const has = (f.note || '').replace(/^Has: /, '');
    const what = /^types of/.test(f.unit) ? 'voice types' : 'features';
    const total = f.unit.split(' ').pop();
    return `${f.value} of ${total} ${what}`;
  }
  return showValue(f);
}
// Benchmarks of a few languages (AfroBench: African languages) show a tile only where they have a result
const ONLY_IF_MEASURED = new Set(['llm_afrobench_gpt4o', 'llm_afrobench_gemini']);
// Regional providers appear only where they offer the language: a row of 'not yet' tiles for every language would be noise
const LISTED_ONLY = new Set(Object.values(DATA.config.dimensions.tech.technologies).flatMap(t => t.listed_only || []));
const regionalOn = (t, facts) => (t.regional || []).filter(id => facts[id] && facts[id].value);
function svcTile(id, own, open, via, wname, unnamed, lname) {
  // a spoken variety: where it isn't offered itself but its written standard is, the tile shows that
  const ownOn = own[id] && (own[id].unit === 'bool' ? !!own[id].value : true);
  const thru = !ownOn && via && via[id] && (via[id].unit === 'bool' ? !!via[id].value : true);
  const facts = thru ? { ...own, ...via } : own;
  const f = facts[id], [name, kind, prov] = SVC[id] || [id, '', ''];
  const reg = prov in REGIONAL;
  const pv = prov ? ` data-prov="${prov}"${reg ? ' data-regional' : ''} style="--p:var(--prov-${reg ? 'regional' : prov})"` : '';
  const by = prov ? `<span class="by">${esc(PROV_ALL[prov] || prov)}</span>` : '';
  if (!f) return `<div class="tile off"${pv}><span class="mark" aria-hidden="true">–</span><div>${by}<b>${esc(name)}</b><small>${esc(kind)} · not benchmarked</small></div></div>`;
  const on = f.unit === 'bool' ? !!f.value : true;
  const lo = !on && LISTED_ONLY.has(id);  // an app's language setting: absence isn't a gap
  // a country locale for this variety that the company doesn't name as the variety: it counts for the standard
  const asStd = !on && unnamed && unnamed[id] ? (BY[unnamed[id]] || {}).name || unnamed[id] : '';
  const measured = ['% of English', 'accuracy', 'chrF'].includes(f.unit);
  // figures, features and levels are in "Sources, dates and notes", not on the tile; hover still has the source
  const hover = [f.source, asStd ? `The company lists ${asStd} for a country where ${lname} is spoken, but doesn\u2019t say it\u2019s ${lname}, so the Index counts it for ${asStd}. It may well handle ${lname} speech; the company doesn\u2019t say.` : '', lo ? 'Not in the app\u2019s language setting. The company says the assistant can be used in other languages too, so the Index leaves this out rather than counting it as missing.' : ''].filter(Boolean).join('\n');
  const detail = thru ? `Through ${wname}` : '';
  return `<a class="tile ${thru ? 'thru' : on ? 'on' : 'off'}"${pv} href="${esc(f.url.split(' ')[0])}" target="_blank" rel="noopener" title="${esc(hover)}">
    <span class="mark" aria-hidden="true">${thru ? '↳' : on ? '✓' : '–'}</span>
    <div>${by}<b>${esc(name)}</b><small>${lo ? `Not in ${esc(kind[0].toLowerCase() + kind.slice(1))}` : esc(kind)}${on || measured || lo ? '' : asStd ? ` · listed as ${esc(asStd)}` : ''}</small>${detail ? `<span class="det">${esc(detail)}</span>` : ''}</div></a>`;
}

// A technology's services, in tile order: the global providers, regional ones (where they offer it), open source,
// and benchmarks (some only where they cover the language)
function techIds(t, tk, facts) {
  const ids = [...(t.consumer || []), ...regionalOn(t, facts), ...(t.open || []),
    ...Object.keys(t.measured || {}).filter(id => facts[id] || !ONLY_IF_MEASURED.has(id)),
    // benchmarks that are shown but not scored (measured by the makers): only where they cover the language
    ...DATA.services.filter(s => s.technology === tk && s.role === 'measured' && !(s.id in (t.measured || {})) && facts[s.id]).map(s => s.id)];
  const rank = id => { const i = PROV_ORDER.indexOf((SVC[id] || [])[2]); return i < 0 ? PROV_ORDER.length : i; };
  return [...new Set(ids)].sort((a, b) => rank(a) - rank(b));
}
// Locale data: CLDR's coverage level, a tile of its own since no service offers it
const CLDR_LEVEL = ['Not in CLDR', 'Basic coverage', 'Moderate coverage', 'Modern coverage'];
function localeTile(f, vf, wname) {
  const thru = vf && (!f || vf.value > f.value);
  const g = thru ? vf : f;
  if (!g) return `<div class="tile off"><span class="mark" aria-hidden="true">–</span><div><span class="by">Unicode CLDR</span><b>Locale data</b><small>Dates, numbers, names · <span class="vis">Not in CLDR</span></small></div></div>`;
  const lv = Math.round(g.value), det = thru ? `Through ${wname}` : '';
  const below = !lv && /below basic/.test(g.note);
  return `<a class="tile ${thru ? 'thru' : lv ? 'on' : 'off'}" href="${esc(g.url.split(' ')[0])}" target="_blank" rel="noopener" title="${esc([g.source, g.note].filter(Boolean).join('\n'))}">
    <span class="mark" aria-hidden="true">${thru ? '↳' : lv ? '✓' : '–'}</span>
    <div><span class="by">Unicode CLDR</span><b>Locale data</b><small>Dates, numbers, names${lv ? '' : ` · <span class="vis">${below ? 'Below basic' : 'Not in CLDR'}</span>`}</small>${det ? `<span class="det">${esc(det)}</span>` : ''}</div></a>`;
}
// Commercial use: what each open resource's licence permits (resources.csv: yes, no, varies)
const fmtHours = h => h >= 10 ? `${Math.round(h).toLocaleString()} hours` : `${(+h).toFixed(1)} hours`;
// Licensed corpora shown on a page: the largest first (by hours where given), at most LICENSED_SHOWN
const LICENSED_SHOWN = 6;
const licensedShown = list => [...list].sort((a, b) => (+b[3] || 0) - (+a[3] || 0)).slice(0, LICENSED_SHOWN);
const COMMERCIAL = { yes: 'Permitted', no: 'Not permitted', varies: 'Varies' };
// How each speech dataset's hours were obtained (the record's method; ltdi/collectors/speech.py), as a mark on the
// hours: none where its makers publish them (or the Mozilla Data Collective lists them), a key under the table
const SPEECH_MARK = { measured: '*', sampled: '\u2020' };
const SPEECH_KEY = { '*': 'measured from its audio, clip by clip', '\u2020': 'measured from a sample of its clips and scaled to the whole' };
const fmtH = h => h >= 10 ? Math.round(h).toLocaleString() : (+h).toFixed(1);
const ptable = (cols, rows) => `<div class="ptable"><table><thead><tr>${cols.map(c => `<th scope="col"${c === 'Hours' ? ' class="num"' : ''}>${c}</th>`).join('')}</tr></thead><tbody>${rows.join('')}</tbody></table></div>`;
function speechSets(l, facts) {
  const sets = Object.entries(l.sd || {}).filter(([i]) => facts[i]).sort((a, b) => b[1] - a[1]);
  if (!sets.length) return '';
  const used = new Set();
  const rows = sets.map(([i, h]) => {
    const f = facts[i], R = RES[i] || {}, u = (f.url || '').split(' ')[0], mk = SPEECH_MARK[f.method] || '';
    if (mk) used.add(mk);
    const name = u ? `<a href="${esc(u)}" target="_blank" rel="noopener">${esc(R.name || f.source)}</a>` : esc(R.name || f.source);
    return `<tr><td>${name}</td><td class="num">${esc(fmtH(h))}${mk ? `<sup class="mk">${mk}</sup>` : ''}</td><td class="nw">${esc(COMMERCIAL[R.commercial] || '')}</td><td>${esc(f.note || '')}</td></tr>`;
  });
  return `<p class="prov-sub">Where these hours come from</p>${ptable(['Dataset', 'Hours', 'Commercial use', 'Notes'], rows)}
    <p class="mkey"><span>Hours as each dataset\u2019s makers publish them${used.size ? `, except: ${[...used].map(m => `${m} ${SPEECH_KEY[m]}`).join('; ')}` : ''}.</span></p>`;
}
// Open transcribed speech in detail, under its own heading in "Sources, dates and notes": how much is licensed for
// commercial use, the datasets the hours come from, and licensed corpora that are listed but not counted
function speechDetail(l, facts) {
  const sets = speechSets(l, facts);
  const usable = l.sh && l.shc < l.sh
    ? `<p>${l.shc >= 0.05 ? `${fmtHours(l.shc)} of the ${fmtHours(l.sh)} are licensed for commercial use.` : `None of the ${fmtHours(l.sh)} are licensed for commercial use.`}</p>` : '';
  const lic = l.licensed && l.licensed.length
    ? `<p class="prov-sub">Not counted, as it isn\u2019t open data</p>${ptable(['Dataset', 'Hours', 'Access', 'Notes'], licensedShown(l.licensed).map(([name, steward, task, h, licence, paid, url, where]) =>
      `<tr><td><a href="${esc(url)}" target="_blank" rel="noopener">${esc(name)}</a></td><td class="num">${h !== '' ? esc(fmtH(+h)) : ''}</td><td class="nw">${paid === 'yes' ? 'For a fee' : 'Data licence'}</td><td>${esc([steward, task, licence && licence[0].toLowerCase() + licence.slice(1), where && where !== 'the Mozilla Data Collective' ? `from ${where}` : 'on the Mozilla Data Collective'].filter(Boolean).join('; '))}</td></tr>`))}${l.licensed.length > LICENSED_SHOWN ? `<p class="mkey"><span>And ${l.licensed.length - LICENSED_SHOWN} more, listed in the database download</span></p>` : ''}` : '';
  if (!sets && !usable && !lic) return '';
  return `<div class="prov-speech"><h4>Transcribed speech</h4>${usable}${sets}${lic}</div>`;
}
// Every value's source, retrieval date and note, in a list that opens by click, tap or keyboard
// (the same details are on hover over each value, which touch and keyboard users can't reach)
const fmtDay = d => { try { return new Date(d + 'T12:00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }); } catch (e) { return d; } };
// One row of the sources table: what, any figure or detail, its source(s), when retrieved, and notes
const srcLink = f => { const u = (f.url || '').split(' ')[0]; return u ? `<a href="${esc(u)}" target="_blank" rel="noopener">${esc(f.source)}</a>` : esc(f.source); };
function provRow(label, f, o = {}) {
  const more = (o.extra || []).filter(g => g && g.source && g.source !== f.source);
  return `<tr><td><b>${esc(label)}</b>${o.thru ? ` <span class="muted">through ${esc(o.thru)}</span>` : ''}</td>
    <td>${[f, ...more].map(srcLink).join('<br>')}</td><td class="nw">${esc(fmtDay(f.retrieved))}</td>${o.detailCol ? `<td class="det">${o.detail || ''}</td>` : ''}<td>${esc([...new Set((o.notes || [f.note]).filter(Boolean))].join(' '))}</td></tr>`;
}
// Who measured a quality figure, as marks on it: * by its makers, † on test data that isn't public (a key under the table)
const MARKS = { own: '*', hidden: '\u2020' };
const marksOf = id => { const t = TEST_OF[id]; return t ? (t.quality_by === 'own' ? MARKS.own : '') + (t.test_public === 'no' ? MARKS.hidden : '') : ''; };
// A service's figures and details for its row: a measured result, its features or level, a quality figure
function svcFacts(id, facts) {
  const more = (SVC[id] || [])[3] && !(facts[id].source || '').toLowerCase().includes(SVC[id][3]) ? SVC[id][3] : '';  // unless the source's title says it
  const f = facts[id], out = { detail: '', notes: [more ? more[0].toUpperCase() + more.slice(1) + '.' : '', f.note], extra: [] };
  const on = f.unit === 'bool' ? !!f.value : true;
  const parts = [];
  if (f.unit === '% of English') parts.push(`${Math.round(f.value)}% of English`);
  else if (f.unit === 'accuracy') parts.push(`${Math.round(f.value * 100)}% accuracy`);
  else if (f.unit === 'chrF') parts.push(`${Math.round(f.value)} chrF from English`);
  const dp = on && DEPTH_OF[id] ? facts[DEPTH_OF[id]] : null;
  if (dp) { const t = depthText(dp, DEPTH_OF[id]); if (t) parts.push(t); out.notes.push(dp.note); out.extra.push(dp); }
  const q = QUALITY_OF[id], qf = on && q ? facts[q.quality] : null;
  if (qf) {
    // word error rates as WER (a key under the table)
    const fig = qf.unit === '% WER' ? depthText(qf, q.quality).replace('% word error rate', '% WER') : qf.unit === 'WER band' ? qf.note.replace(/, as .*/, '').replace(/^Word error rate /, 'WER ') : `${Math.round(qf.value)} ${qf.unit}, ${qualityText(qf, q).toLowerCase()}`;
    parts.push(fig);
    if (qf.unit !== 'WER band') { out.notes.push(qf.note); out.extra.push(qf); }  // a band: the service's own page, one link
  }
  const figure = ['% of English', 'accuracy', 'chrF'].includes(f.unit) || (qf && !(qf.unit === '% WER' && qf.value >= 100));
  const t = TEST_OF[id];
  if (figure && t && t.test_public !== 'no') out.notes.push(`Test set: ${t.test_set.replace(/^the /, '')}${t.test_size ? ` (${t.test_size})` : ''}.`);
  const said = parts.join('; ').toLowerCase();
  out.notes = out.notes.filter(n => n && n.toLowerCase() !== said);  // a note that only repeats the detail
  out.detail = esc(parts.join('; ')) + (figure ? `<sup class="mk">${marksOf(id)}</sup>` : '');
  out.marks = figure ? marksOf(id) : '';
  return out;
}
const markKey = used => [used.includes(MARKS.own) ? `${MARKS.own} Measured by the company that makes it, so shown but not scored` : '',
  used.includes(MARKS.hidden) ? `${MARKS.hidden} On test data that isn\u2019t public, so the figure can\u2019t be checked` : '',
  used.includes('W') ? 'WER = word error rate' : ''].filter(Boolean).map(t => `<span>${t}</span>`).join('');
// a disclosure triangle, drawn the same for every drop-down in the panels
const TW = '<span class="tw" aria-hidden="true"></span>';
function provList(l, key, facts, vfacts, wname) {
  let body = '', n = 0, marks = '';
  const head = cols => `<thead><tr>${cols.map(c => `<th scope="col">${c}</th>`).join('')}</tr></thead>`;
  if (key === 'tech') {  // a table, grouped by technology, so its name isn't repeated on every line
    const groups = [];
    for (const [tk, t] of Object.entries(CFG.tech.technologies)) {
      const rows = [];
      const add = (fs, thru) => {
        if (t.indicator) {
          const f = fs && fs[t.indicator];
          if (f) rows.push(provRow('Unicode CLDR', f, { thru, detailCol: true, detail: esc(CLDR_LEVEL[Math.round(f.value)] || '') }));
          return;
        }
        for (const id of techIds(t, tk, facts)) {
          const f = fs && fs[id];
          if (!f || (thru && f === facts[id])) continue;
          const x = svcFacts(id, fs);
          marks += x.marks + (/WER/.test(x.detail) ? 'W' : '');
          rows.push(provRow((SVC[id] || [])[0] || DATA.labels[id] || id, f, { thru, detailCol: true, detail: x.detail, notes: x.notes, extra: x.extra }));
        }
      };
      add(facts); if (vfacts) add(vfacts, wname);
      if (rows.length) groups.push(`<tbody><tr class="pg"><th colspan="5" scope="rowgroup">${TICON[tk] || ''}${esc(t.label)}</th></tr>${rows.join('')}</tbody>`);
      n += rows.length;
    }
    if (groups.length) body = `<div class="ptable"><table>${head(['Service', 'Source', 'Retrieved', 'Detail', 'Notes'])}${groups.join('')}</table></div>${marks ? `<p class="mkey">${markKey(marks)}</p>` : ''}`;
  } else {
    const rows = [];
    const add = (label, id) => {
      if (facts[id]) rows.push(provRow(label, facts[id]));
      if (vfacts && vfacts[id] && vfacts[id] !== facts[id]) rows.push(provRow(label, vfacts[id], { thru: wname }));
    };
    for (const [ik, spec] of Object.entries(CFG[key].indicators)) {
      add(spec.label, ik);
      if (spec.narrowed_by) add(spec.label + ' · Bible-site share', spec.narrowed_by);
    }
    if (key === 'data') add('Word-frequency list (not scored; in the keyboard and spelling checklists)', 'wordlist_corpuscrawler');
    n = rows.length;
    if (rows.length) body = `<div class="ptable"><table>${head(['Indicator', 'Source', 'Retrieved', 'Notes'])}<tbody>${rows.join('')}</tbody></table></div>`;
  }
  const speech = key === 'data' ? speechDetail(l, facts) : '';
  if (!body && !speech) return '';
  return `<details class="prov"><summary>${TW}<span class="dd-title">Sources, dates and notes</span> <span class="muted">· ${n}</span></summary>${body}${speech}</details>`;
}
// the share card's icons (technology) and headline figures (data), beside the panel title
const SUM_TECH = ['keyboard', 'speech_input', 'tts', 'mt', 'llm', 'assistant'];
const SUM_FIGS = [['web_text_words', 'words', 'word'], ['parallel_sentences', 'sentence pairs', 'sentence pair'],
  ['wikipedia_articles', 'articles', 'article'], ['open_speech_hours', 'hours', 'hour']];
function compact(v) {
  if (v < 1) return v.toFixed(1);
  v = Number(v.toPrecision(2));
  for (const [n, u] of [[1e12, 'T'], [1e9, 'B'], [1e6, 'M'], [1e3, 'K'], [1, '']])
    if (v >= n) return (v / n < 10 ? (v / n).toFixed(1).replace(/\.0$/, '') : (v / n).toFixed(0)) + u;
}
function headSum(l, key, facts) {
  if (key === 'tech') {
    const t = SUM_TECH.filter(k => ['full', 'part', 'open'].includes(l.levels[k]));
    return t.length ? `<span class="hsum">${t.map(k => `<span class="hti ${l.levels[k] === 'open' ? 'o' : 'c'}" title="${esc(CFG.tech.technologies[k].label)}">${TICON[k] || ''}</span>`).join('')}</span>` : '';
  }
  const f = SUM_FIGS.filter(([k]) => facts[k] && facts[k].value > 0);
  return f.length ? `<span class="hsum">${f.map(([k, many, one]) => `<span class="hfig"><b>${compact(facts[k].value)}</b> ${facts[k].value === 1 ? one : many}</span>`).join('')}</span>` : '';
}
function dimPanel(l, key, color) {
  const d = l.dimensions[key], facts = DATA.facts[l.code] || {}, cfg = CFG[key];
  const vfacts = (DATA.via || {})[l.code], vd = l.via_dims && l.via_dims[key], w = BY[l.written_in], wname = w ? w.name : '';
  let body = '';
  if (key === 'tech') {
    const provs = `<details class="provs"${provsOpen ? ' open' : ''}><summary>${TW}<span class="dd-title">Providers</span></summary><div class="provkey" role="group" aria-label="Highlight a provider"><span>Highlight</span>${Object.entries({ ...PROV, ...(Object.values(cfg.technologies).some(t => regionalOn(t, facts).length) ? { regional: 'Regional providers' } : {}) }).map(([k, n]) =>
      `<button class="chip prov" id="pv-${k}" data-pv="${k}" aria-pressed="${provFocus === k}" style="--p:var(--prov-${k})"${k === 'regional' ? ` title="${esc(Object.values(REGIONAL).join(', '))}"` : ''}><i></i>${esc(n)}</button>`).join('')}</div></details>`;
    const main = [], more = [], peek = [];
    for (const [tk, t] of Object.entries(cfg.technologies)) {
      const s = d.indicators[tk], sv = s == null ? 'not measured' : s.toFixed(2);
      const tiles = t.indicator ? localeTile(facts[t.indicator], vfacts && vfacts[t.indicator], wname)
        : techIds(t, tk, facts).map(id => svcTile(id, facts, (t.open || []).includes(id), vfacts, wname, l.unnamed, l.name)).join('');
      // the score and bar always shown; the services it rests on behind the triangle
      const row = `<details class="techrow" data-tk="${tk}"${techOpen.has(tk) ? ' open' : ''}><summary>
        <div class="tech-h">${TW}${TICON[tk] || ''}<b>${esc(t.label)}</b><span class="ind-val">${sv}</span></div>
        ${s == null ? '' : bar(s)}</summary>
        ${t.help ? `<p class="tech-help">${esc(t.help.replace('{name}', l.name))}</p>` : ''}<div class="tiles">${tiles}</div></details>`;
      if (t.group === 'more') { more.push(row); peek.push(`<span title="${esc(t.label)}">${TICON[tk] || ''}<span class="sr">${esc(t.label)}</span>${sv}</span>`); }
      else main.push(row);
    }
    body += main.join('');
    if (more.length) body += `<details class="more-tech"${moreOpen ? ' open' : ''}>
      <summary>${TW}<span class="dd-title">More technologies</span><span class="mt-peek">${peek.join('')}</span></summary>${more.join('')}</details>`;
    body += provs;
  } else {
    body += '<div class="inds">';
    const inds = Object.entries(cfg.indicators);
    for (const [ik, spec] of inds) {
      const f = facts[ik], n = d.indicators[ik];
      const hover = f ? [f.source, 'Retrieved ' + f.retrieved, f.note].filter(Boolean).join('\n') : '';
      // web text comes from FineWeb-2, MADLAD-400 or HPLT 3.0, whichever holds most: the label names the one counted
      const name = ik === 'web_text_words' && f && f.source && ik in facts && f.source !== 'FineWeb' ? `Web text (${f.source.replace(' (clean)', '')} words)` : spec.label;
      const lab = f ? `<a class="indlink" href="${esc(f.url.split(' ')[0])}" target="_blank" rel="noopener" title="${esc(hover)}">${esc(name)}</a>` : esc(name);
      const nb = spec.narrowed_by && facts[spec.narrowed_by];  // e.g. how much of the web text is from Bible sites
      const narrow = nb && nb.value >= 0.1 && f && f.value
        ? `<div class="missing" title="${esc(nb.note)}">${/MADLAD/.test(nb.source) ? `${nb.value >= 1 ? 'Only' : 'Partly'} Bible or jw.org text` : `${Math.round(nb.value * 100)}% from Bible sites`}</div>` : '';
      const vf = vfacts && vfacts[ik], vn = vd && vd.indicators[ik];
      const vline = vf && vn != null && vn !== n ? `<div class="thru-line">Through <a href="${LH(w.code)}">${esc(wname)}</a>: ${esc(showValue(vf))}</div>` : '';
      body += `<div class="ind"><div class="ind-top"><b>${lab}</b><span class="ind-val">${esc(showValue(f))}</span></div>${vline}
        ${n == null ? '' : bar(n)}${narrow}</div>`;
    }
    const ms = facts.massive_utterances;
    if (ms && ms.value) body += `<div class="ind"><div class="ind-top"><b><a class="indlink" href="${esc(ms.url.split(' ')[0])}" target="_blank" rel="noopener" title="${esc(`${ms.source}: ${ms.note || ''}`)}">Voice assistant data</a></b>
        <span class="ind-val">${big(ms.value)} requests</span></div><div class="missing">Not scored.</div></div>`;
    body += '</div>';
  }
  body += provList(l, key, facts, vfacts, wname);
  // at first a single bar with "See breakdown"; the breakdown (and, for technology, Expand all and Hide all) behind it
  const open = dimOpen.has(key);
  return `<section class="dim wide${open ? ' open' : ''}${key === 'tech' ? ' techdim' : ''}${key === 'tech' && provFocus && body.includes(`id="pv-${provFocus}"`) ? ' focus-' + provFocus : ''}" style="--c:var(${color})"><div class="dim-top"><h3>${esc(CFG[key].label)}${headSum(l, key, facts)}<span class="h3r">${key === 'tech' ? '<span class="xall"><button type="button" class="chip" data-xall="1">Expand all</button><button type="button" class="chip" data-xall="0">Hide all</button></span>' : ''}<button type="button" class="chip bdbtn" data-bd="${key}" aria-expanded="${open}" aria-controls="bd-${key}">${open ? 'Hide breakdown' : 'See breakdown'}</button><span class="hs">${d.score.toFixed(2)}</span></span></h3>${bar(d.score)}</div>
    <div class="dim-body" id="bd-${key}">${vd && vd.score !== d.score ? `<div class="thru-dim">${esc(wname)}’s written resources counted in: ${vd.score.toFixed(2)}</div>` : ''}${d.raw < d.score ? `<div class="thru-dim">${d.raw.toFixed(3)} before the floor of ${DATA.config.meta.floor}</div>` : ''}${body}</div></section>`;
}

// The World Bank's internet-use page for the countries the figures are weighted by (named in the note)
function wbLink(f) {
  const cs = ((f.note || '').split(': ')[1] || '').replace('\u2026', '').split(', ').filter(c => /^[A-Z]{2}$/.test(c));
  return cs.length ? `${f.url}?locations=${cs.join('-')}` : f.url;
}
// The people: speakers, and how many are online now and in five years (World Bank internet use)
function peopleRow(l) {
  const f = DATA.facts[l.code] || {}, sp = l.speakers || 0;
  const n = k => f[k] ? sp * f[k].value : null, g = f.speaker_growth_5y ? f.speaker_growth_5y.value : 1;
  const wb = f.reach_voice_share && sp;
  return `<div class="facts">
    <span>${sp ? `Speakers <b>${people(sp)}</b>` : 'Speakers not recorded'}</span>
    ${wb ? `<span title="${esc(f.reach_voice_share.note)}">Online today <b>${people(n('reach_voice_share'))}</b></span>
    <span title="${esc(f.reach_voice_share_5y ? f.reach_voice_share_5y.note : '')}">Online in five years <b>${people(n('reach_voice_share_5y') * g)}</b></span>
    <a href="${esc(wbLink(f.reach_voice_share))}" target="_blank" rel="noopener">World Bank data</a>` : ''}</div>`;
}
// Its official status by country, most speakers first: "Mexico (in practice)", "India (in a region)"
function offList(l) {
  const spk = c => l._cs[c] || 0;
  return Object.entries(l._of).sort((a, b) => spk(b[0]) - spk(a[0]))
    .map(([c, st]) => `${COUNTRY_NAMES[c] || c.toUpperCase()}${st === 'o' ? '' : st === 'd' ? ' (in practice)' : ' (in a region)'}`);
}
// Where it's spoken: countries, official status, endangerment, adult literacy
function placeRow(l) {
  // official status, most speakers first, like the countries; adult literacy in up to three countries where it's
  // the most widely spoken language: CLDR's rate for the language there where recorded, else the country's
  const off = offList(l);
  const lit = litList(l);
  const wp = (DATA.facts[l.code] || {}).wikipedia_pageviews;
  const end = endKey(l);
  return `<div class="facts">
    <span><span id="where">${whereLine(l, false)}</span>${censusInfo(l)}</span>
    ${l.extinct ? '' : `<span title="Unicode CLDR territory data: official, official in practice, or official in a region.">${off.length ? `<span id="offl">${offLine(off, false)}</span>` : 'Not official in any country'}</span>`}
    ${!['none', 'not_endangered'].includes(end) ? `<span title="${end === 'revitalizing' ? `Listed as extinct or dormant in ${l.endangerment_source === 'glottolog' ? 'Glottolog' : 'LinguaMeta'}, but with speakers recorded today, often through revival` : `UNESCO's endangerment scale, ${esc(END_SOURCE[l.endangerment_source] || 'from LinguaMeta')}`}">Endangerment <b>${esc(END_LABEL[end])}</b></span>` : ''}
    ${lit.length ? `<span title="Unicode CLDR territory data" id="litl">${litLine(lit, false)}</span>` : ''}
    ${wp && wp.value ? `<span>Wikipedia page views <b>${big(wp.value)}</b> a year</span>` : ''}
    ${l.sample || !l.script_names.length ? '' : `<span>${l.script_names.length > 1 ? 'Scripts' : 'Script'} <b>${esc(l.script_names.join(', '))}</b>${unicodeNote(l)}${writtenInfo(l)}</span>`}</div>`;
}
// Its codes, each linking to where it's defined or described: a small box beside the endonym
function codesRow(l) {
  // no labels: each says what it is on hover
  const code = (title, href, text) => `<a class="code" href="${href}" target="_blank" rel="noopener" title="${title}">${esc(text)}</a>`;
  return `<span class="codes" aria-label="Codes">${[
    code('BCP 47 tag: in the IANA subtag registry', `https://r12a.github.io/app-subtags/?check=${encodeURIComponent(l.code)}`, l.code),
    l.iso_639_3 ? code('ISO 639-3 code: on Ethnologue', `https://www.ethnologue.com/language/${encodeURIComponent(l.iso_639_3)}/`, l.iso_639_3) : '',
    l.glottocode ? code('Glottocode: on Glottolog', `https://glottolog.org/resource/languoid/id/${encodeURIComponent(l.glottocode)}`, l.glottocode) : ''].filter(Boolean).join(' · ')}</span>`;
}

// A writing sample: Article 1 of the Universal Declaration of Human Rights, from UDHR in XML (the
// translations the UN human rights office collects, in one form), with the English for comparison
const UDHR = 'https://github.com/eric-muller/udhr';
const UDHR_COMMIT = '588b3f4b2d0467aff54842a4b926551b69d5a66a';
function sampleBlock(l) {
  if (!l.sample) return '';
  const [text, tag, dir, name, f, script, sname] = l.sample;
  const italic = ['Latn', 'Cyrl', 'Grek'].includes(script);  // scripts with an italic style
  return `<figure class="sample">
    <blockquote lang="${esc(tag)}" dir="${dir === 'rtl' ? 'rtl' : 'ltr'}"${italic ? ' class="it"' : ''}>${esc(text)}</blockquote>
    <figcaption title="${l.code === 'en' ? '' : 'All human beings are born free and equal in dignity and rights. They are endowed with reason and conscience and should act towards one another in a spirit of brotherhood.'}">Article 1 of the Universal Declaration of Human Rights, written in <a href="${UDHR}/blob/${UDHR_COMMIT}/data/udhr/udhr_${esc(f)}.xml" target="_blank" rel="noopener" title="${esc(`UDHR in XML: ${name}`)}">${esc(l.name)}</a> (${esc(sname || script)} script)${unicodeNote(l)}${writtenInfo(l)}</figcaption>
  </figure>`;
}
// Hear the language: a few words spoken by one speaker, from Lingua Libre (Wikimedia Commons, CC BY-SA)
function hearBlock(l) {
  const h = l.hear;
  if (!h || !h.clips.length) return '';
  const an = /^[AEIOU]/.test(l.name) ? 'an' : 'a';
  const clip = ([word, gloss, src]) => `<button type="button" class="clip" data-src="${esc(src)}" aria-label="Play ${esc(word)}"${gloss ? ` title="${esc(gloss)}"` : ''}>
      <span class="ico" aria-hidden="true"></span><span lang="${esc(l.code)}">${esc(word)}</span>${gloss && gloss.length <= 28 ? `<small>${esc(gloss)}</small>` : ''}</button>`;
  return `<div class="hear" role="group" aria-label="Hear ${an} ${esc(l.name)} speaker say">${TICON.tts}
    <div class="clips">${h.clips.map(clip).join('')}</div>
    <div class="hear-src">Recorded by <a href="https://commons.wikimedia.org/wiki/File:${encodeURIComponent(h.clips[0][3])}" target="_blank" rel="noopener">${esc(h.speaker)}</a> for <a href="https://lingualibre.org" target="_blank" rel="noopener">Lingua Libre</a></div></div>`;
}
let hearAudio = null;
function bindHear() {
  document.querySelectorAll('.hear .clip').forEach(b => b.onclick = () => {
    const same = hearAudio && hearAudio.dataset.src === b.dataset.src && !hearAudio.paused;
    if (hearAudio) { hearAudio.pause(); document.querySelectorAll('.hear .clip.playing').forEach(x => x.classList.remove('playing')); }
    if (same) return;  // a second press stops it
    hearAudio = new Audio(b.dataset.src); hearAudio.dataset.src = b.dataset.src;
    b.classList.add('playing');
    hearAudio.onended = hearAudio.onerror = () => b.classList.remove('playing');
    hearAudio.play().catch(() => b.classList.remove('playing'));
  });
}
// Where its speakers in a country are counted from a census (immigrant languages LinguaMeta doesn't
// list there): which countries, and the source
function censusInfo(l) {
  const cs = (l.census || []).filter(c => l.countries.includes(c[0]));  // only the countries the line shows
  if (!cs.length) return '';
  const year = c => (c[1].match(/(\d{4}(?:-\d{4})?)/) || [])[1];
  // the agency: the UN's tables, the American Community Survey, or a census office's own (config/census_extra.csv)
  const agency = c => c[1].startsWith('UN') ? 'UN Statistics Division' : /American Community|Census Bureau/.test(c[1]) ? 'US Census Bureau' : c[1].split(',')[0];
  const src = [...new Map(cs.map(c => [c[2], agency(c)])).entries()];
  return infoTip('Where these countries come from', `Countries and speaker numbers for the following ${cs.length > 1 ? 'countries come from national censuses' : 'country come from its national census'}:
    ${cs.map(c => `${esc(c[0])}${year(c) ? ` (${year(c).replace('-', '–')})` : ''}`).join(', ')}.
    <span class="info-src">${src.map(([u, n]) => `<a href="${esc(u)}" target="_blank" rel="noopener">${n}</a>`).join(' · ')}</span>`);
}
// Whether the main script is encoded in Unicode: reported, not scored
function unicodeNote(l) {
  const f = (DATA.facts[l.code] || {}).script_encoded;
  if (!f || f.value || !l.script_names.length) return '';  // nearly every recorded script is: only the exceptions are noted
  return ` <a class="uni no" href="${esc(f.url.split(' ')[0])}" target="_blank" rel="noopener" title="${esc([f.source, f.note].filter(Boolean).join('\n'))}">not yet in Unicode</a>`;
}
// Spoken varieties counted from a written standard for writing and text
function writtenInfo(l) {
  if (!l.written_in || !BY[l.written_in]) return '';
  const w = BY[l.written_in];
  if (l.shares_written) return infoTip('How writing is counted', `${esc(l.name)} is written in the standard form of <a href="${LH(w.code)}">${esc(w.name)}</a>, and sources label that text and its tools as ${esc(w.name)}, so ${esc(w.name)}’s written data and text technologies count as ${esc(l.name)}’s. Speech data and technologies are counted separately.`);
  return infoTip('How the standard is counted', `${esc(l.name)} speakers typically write the standard form of <a href="${LH(w.code)}">${esc(w.name)}</a>. The score and rank count only what exists for ${esc(l.name)} itself; a second score counts ${esc(w.name)}’s written data and text technologies too, as most speakers can use them. On this page, values marked “through ${esc(w.name)}” are ${esc(w.name)}’s.`);
}
// Under the score: a spoken variety's score through its written standard; the score before the floor
function scoreNotes(l) {
  const w = BY[l.written_in], out = [];
  if (l.via && w) {
    const [c, t] = tierOf(l.via[1]);
    out.push(`<div class="snote" title="Counting ${esc(w.name)}’s written data and text technologies, which ${esc(l.name)} speakers can typically use. The rank is on ${esc(l.name)}’s own score.">Through <a href="${LH(w.code)}">${esc(w.name)}</a> <b>${l.via[0].toFixed(3)}</b> <span class="tier ${c} sm">${esc(t)}</span></div>`);
  }
  if (l.raw && Object.values(l.raw).some(v => v > 0)) {
    const un = Math.sqrt(DIMS.reduce((p, [k]) => p * (k in l.raw ? l.raw[k] : l.scores[k]), 1));
    out.push(`<div class="snote" title="${esc(rawText(l))}. Ranks use the unfloored scores, so any recorded resource counts.">${un.toFixed(3)} before the floor</div>`);
  }
  return out.join('');
}
// Countries, by number of speakers: the top three, or all of them with a link back
// Adult literacy in the countries where it's the most widely spoken language, most speakers first: CLDR's rate
// for the language there where recorded, else the country's
function litList(l) {
  return Object.keys(l._cs).filter(c => DATA.country_top[c] === l.code).sort((a, b) => (l._cs[b] || 0) - (l._cs[a] || 0))
    .map(c => [c, l.literacy && l.literacy[c] != null ? l.literacy[c] : DATA.country_literacy[c]]).filter(([, v]) => v != null)
    .map(([c, v]) => `<b>${Math.round(v)}%</b> (${esc(COUNTRY_NAMES[c] || c.toUpperCase())})`);
}
// the first three, the rest behind "and N more", as in offLine
function litLine(lit, all) {
  const n = lit.length - 3;
  if (n <= 1) return `Adult literacy ${lit.join(' ')}`;
  return all ? `Adult literacy ${lit.join(' ')} <button class="linkish" data-more="0">less</button>`
             : `Adult literacy ${lit.slice(0, 3).join(' ')} <button class="linkish" data-more="1">and ${n} more</button>`;
}
// Official in: the first three, the rest behind "and N more", as in whereLine (a fourth is named, not "and 1 more")
function offLine(off, all) {
  const n = off.length - 3;
  if (n <= 1) return `Official in <b>${esc(off.join(', '))}</b>`;
  return all ? `Official in <b>${esc(off.join(', '))}</b> <button class="linkish" data-more="0">less</button>`
             : `Official in <b>${esc(off.slice(0, 3).join(', '))}</b> <button class="linkish" data-more="1">and ${n} more</button>`;
}
function whereLine(l, all) {
  const cs = l.countries, n = cs.length - 3;
  if (n <= 1) return `Mainly in <b>${cs.map(esc).join(', ')}</b>`;  // a fourth country is named, not "and 1 more"
  return all ? `Mainly in <b>${cs.map(esc).join(', ')}</b> <button class="linkish" data-more="0">less</button>`
             : `Mainly in <b>${cs.slice(0, 3).map(esc).join(', ')}</b> <button class="linkish" data-more="1">and ${n} more</button>`;
}
// Opportunities as a panel of compact cards, like the services on the technology panel: what to do, the one figure
// that matters, a link to the starter kit; coloured by kind of action, highest priority first
function oppPanel(l) {
  const os = [...l.opportunities].sort((a, b) => prio(b) - prio(a));
  const card = o => `<a class="otile" href="#opp-${o.id}" title="${esc(`${OT[o.type].label}: ${o.title}`)}">
      <span class="osize" title="Effort, from what's openly available">${esc(o.size)}</span><b>${esc(o.short || o.title)}</b>${o.fact ? `<small>${esc(o.fact)}</small>` : ''}</a>`;
  return `<section class="dim wide opps-panel" style="--c:var(--opp)">
    <h3>Opportunities</h3>
    ${os.length ? `<div class="otiles">${os.map(card).join('')}</div>`
      : `<p class="note">${l.extinct ? 'None listed; no speakers recorded.' : 'No gaps found in the indicators collected so far.'}</p>`}</section>`;
}
async function language(code) {
  if (code !== openFor) { provFocus = null; moreOpen = provsOpen = false; techOpen.clear(); dimOpen.clear(); openFor = code; }
  const l = BY[code];
  if (!l) return ranking();
  await need(code);
  $('#view').innerHTML = `
    <div class="lhead lang">
      <div class="lmain"><h2>${esc(l.name)} <span class="auto">${esc(l.autonym !== l.name ? l.autonym : '')}</span>${l.note ? infoTip('About this language', esc(l.note)) : ''} ${codesRow(l)}</h2>
        ${peopleRow(l)}
        ${placeRow(l)}
        ${sampleBlock(l)}
        ${hearBlock(l)}
      </div>
      <div class="lscore"><div class="big">${l.ltdi.toFixed(3)}</div>
        <div class="mapcol"><div class="lsub"><div class="lrk">${tierChip(l)}
          <div class="lrank"${l.tied ? ` title="Tied with ${l.tied.toLocaleString()} ${l.tied === 1 ? 'other language' : 'other languages'}"` : ''}>${!l.rank ? 'Extinct · not ranked' : `${l.tied ? '=' : ''}${l.rank.toLocaleString()} of ${LANGS.length.toLocaleString()}`}</div></div></div><div class="lnotes">${scoreNotes(l)}</div>${miniMap(l)}</div></div>
    </div>
    <div class="dims">${['tech', 'data'].map(k => dimPanel(l, k, DIMS.find(d => d[0] === k)[2])).join('')}</div>
    ${oppPanel(l)}
    <p class="note">Something out of date or missing for ${esc(l.name)}? Email <span class="email">${CORRECTIONS_EMAIL}</span> or <a href="${REPO_URL}/issues/new/choose" target="_blank" rel="noopener">send a correction on GitHub</a>.</p>`;
  bindMiniMap(l);
  bindHear();
  $('#where').onclick = e => { const b = e.target.closest('[data-more]'); if (b) $('#where').innerHTML = whereLine(l, b.dataset.more === '1'); };
  const litl = $('#litl');
  if (litl) { const all = litList(l); litl.onclick = e => { const b = e.target.closest('[data-more]'); if (b) litl.innerHTML = litLine(all, b.dataset.more === '1'); }; }
  const offl = $('#offl');
  if (offl) { const all = offList(l); offl.onclick = e => { const b = e.target.closest('[data-more]'); if (b) offl.innerHTML = offLine(all, b.dataset.more === '1'); }; }
  bindTechPanel();
  // the button, or a click anywhere else in the panel's top (its title, score and bar), opens or closes the breakdown
  $('#view').querySelectorAll('.dim-top').forEach(top => top.onclick = e => {
    if (e.target.closest('button:not(.bdbtn)')) return;  // Expand all and Hide all do their own thing
    const b = top.querySelector('.bdbtn'), sec = top.closest('section.dim'), open = !sec.classList.contains('open');
    sec.classList.toggle('open', open); open ? dimOpen.add(b.dataset.bd) : dimOpen.delete(b.dataset.bd);
    b.setAttribute('aria-expanded', String(open)); b.textContent = open ? 'Hide breakdown' : 'See breakdown';
  });
  $('#view').querySelectorAll('[data-pv]').forEach(b => b.onclick = () => {
    provFocus = provFocus === b.dataset.pv ? null : b.dataset.pv;
    const sec = $('section.dim.techdim');
    sec.className = sec.className.replace(/ focus-\w+/g, '') + (provFocus ? ' focus-' + provFocus : '');
    $('#view').querySelectorAll('[data-pv]').forEach(x => x.setAttribute('aria-pressed', String(x.dataset.pv === provFocus)));
  });
  navBox('go', 'Find another language');
}

// The technology panel's drop-downs: each technology's services, More technologies, Providers (remembered between
// languages) and the sources; Expand all opens every one but the sources, Hide all closes every one (each greyed out when there's nothing to do)
function bindTechPanel() {
  const sec = $('section.dim.techdim');
  if (!sec) return;
  const all = () => [...sec.querySelectorAll('details.techrow, details.more-tech, details.provs, details.prov')];
  const expandable = () => all().filter(d => !d.classList.contains('prov'));  // Expand all leaves the sources closed
  const sync = () => {
    sec.querySelector('[data-xall="1"]').disabled = expandable().every(d => d.open);
    sec.querySelector('[data-xall="0"]').disabled = !all().some(d => d.open);
  };
  for (const d of all()) d.addEventListener('toggle', () => {
    if (d.classList.contains('techrow')) d.open ? techOpen.add(d.dataset.tk) : techOpen.delete(d.dataset.tk);
    else if (d.classList.contains('more-tech')) moreOpen = d.open;
    else if (d.classList.contains('provs')) provsOpen = d.open;
    sync();
  });
  sec.querySelectorAll('[data-xall]').forEach(b => b.onclick = () => { const o = b.dataset.xall === '1'; for (const d of o ? expandable() : all()) d.open = o; });
  sync();
}



// ----------------------------------------------------------------- charts
const tipEl = () => document.getElementById('tip');
function tipShow(e, html) { const t = tipEl(); if (!t) return; t.innerHTML = html; t.hidden = false;
  const x = Math.min(e.clientX + 14, window.innerWidth - 300), y = e.clientY + 14; t.style.left = x + 'px'; t.style.top = y + 'px'; }
function tipHide() { const t = tipEl(); if (t) t.hidden = true; }
// The region chart: the nearest dot to the pointer within its radius shows its tip; selecting it opens the language
function bindStrip() {
  const svg = document.getElementById('strip'), hit = document.getElementById('strip-hit');
  if (!svg) return;
  const at = e => {
    const m = svg.getScreenCTM(); if (!m) return null;
    const p = new DOMPoint(e.clientX, e.clientY).matrixTransform(m.inverse());
    let best = null, bd = Infinity;
    for (const d of STRIP) { const dd = (d.x - p.x) ** 2 + (d.y - p.y) ** 2; if (dd < bd && dd <= (d.r + 2) ** 2) { bd = dd; best = d; } }
    return best;
  };
  svg.addEventListener('mousemove', e => {
    const d = at(e);
    svg.style.cursor = d ? 'pointer' : '';
    if (!d) { hit.setAttribute('visibility', 'hidden'); tipHide(); return; }
    hit.setAttribute('cx', d.x); hit.setAttribute('cy', d.y); hit.setAttribute('r', d.r + 1.5); hit.setAttribute('visibility', 'visible');
    tipShow(e, d.tip());
  });
  svg.addEventListener('mouseleave', () => { hit.setAttribute('visibility', 'hidden'); tipHide(); });
  svg.addEventListener('click', e => { const d = at(e); if (d) { tipHide(); go('lang-' + d.l.code); } });
}
function bindTips(root) {
  root.querySelectorAll('[data-tip]').forEach(el => {
    el.addEventListener('mousemove', e => tipShow(e, el.getAttribute('data-tip')));
    el.addEventListener('mouseleave', tipHide);
    el.addEventListener('focus', e => { const r = el.getBoundingClientRect(); tipShow({ clientX: r.left, clientY: r.bottom }, el.getAttribute('data-tip')); });
    el.addEventListener('blur', tipHide);
  });
}

const LEVELS = [['full', 'Widely available'], ['part', 'In some services'], ['open', 'Open model only'], ['none', 'None found']];
const levelOf = (l, key) => l.levels[key];  // worked out when scoring: full, part, open or none

// ---- provider filter (Charts) ----------------------------------------------
// A provider's view counts its own services only: how many languages each one offers.
let provider = 'All';
const SERIES_PROV = { deepl: 'deepl', open_mt: 'meta', reading_bench: 'meta', open_asr: 'openai' };
let histMode = 'langs';
let stripMode = 'all';
let STRIP = [];  // the region chart's dots: {x, y, r, l, tip}  // the region chart: every language spoken in a region, or only those from it  // the growth charts count languages, or their speakers
const offers = (l, id) => l._offers.has(id);
const provIds = (t, prov) => [...(t.consumer || []), ...(t.regional || []), ...(t.open || []), ...Object.keys(t.measured || {})].filter(id => (SVC[id] || [])[2] === prov);
const PLEVELS = [['full', 'Offered'], ['part', 'In some of its services'], ['none', 'Not found']];
function provLevel(l, ids) { const n = ids.filter(id => offers(l, id)).length; return n === ids.length ? 'full' : n ? 'part' : 'none'; }
const covCache = new Map();
function provCoverage(l, prov) {
  const key = prov + ' ' + l.code;
  if (!covCache.has(key)) {
    const ids = Object.values(CFG.tech.technologies).flatMap(t => provIds(t, prov));
    const n = ids.filter(id => offers(l, id)).length;
    covCache.set(key, { n, of: ids.length, share: ids.length ? n / ids.length : 0 });
  }
  return covCache.get(key);
}
const provBench = prov => Object.values(CFG.tech.technologies).some(t => Object.keys(t.measured || {}).some(id => (SVC[id] || [])[2] === prov));
const provWhat = prov => provBench(prov) ? 'services and benchmarks' : 'services';
const covTier = v => v >= 0.9 ? 'vh' : v >= 0.6 ? 'h' : v >= 0.3 ? 'm' : 'l';
function provMissing(o, l, prov) {  // the provider's services for this opportunity's technology that lack the language
  const t = CFG.tech.technologies[o.technology];
  const label = id => { const [name, kind] = SVC[id];
    if (t.measured && id in t.measured) return `${kind} results`;
    return /^(iOS|Google Cloud|Azure|Microsoft 365|YouTube)$/.test(name) ? `${name} ${/[A-Z]/.test(kind.slice(1)) ? kind : kind.toLowerCase()}` : name; };
  // a list of an app's language setting doesn't say a language is missing, only that the setting lacks it
  // products only: a missing benchmark result isn't a missing service
  return t ? provIds(t, prov).filter(id => !offers(l, id) && !(t.listed_only || []).includes(id) && !(t.measured && id in t.measured)).map(label) : [];
}
function providerSelect(id) {
  const opt = ([k, n]) => `<option value="${k}"${k === provider ? ' selected' : ''}>${esc(n)}</option>`;
  return `<select id="${id}" aria-label="Provider"><option value="All"${provider === 'All' ? ' selected' : ''}>All providers</option>${Object.entries(PROV).map(opt).join('')}
    <optgroup label="Regional providers">${Object.entries(REGIONAL).map(opt).join('')}</optgroup></select>`;
}

// The map's outlines, areas and points: inline in the preview; on the public site its own file
// (data/map.json), loaded once the first view is drawn, or at once for a view that draws a map
let GEO = window.LTDI_DATA ? null : JSON.parse(document.getElementById('ltdi-map').textContent || 'null');
let geoLoading = null;
const NOMAP = new Set(DATA.nomap || []);  // languages with no area or point: no small map on their pages
function loadGeo() {
  if (GEO || !window.LTDI_MAP_URL) return Promise.resolve(GEO);
  return geoLoading ??= fetch(window.LTDI_MAP_URL).then(r => r.json()).then(g => {
    GEO = g; AREAS = g && g.areas; OFFICIAL_AREA = new Set((AREAS && AREAS.official) || []);
    const h = curRoute(), m = h.match(/^lang-([a-z0-9]+)$/);
    if (h === 'map' && document.getElementById('mapwait')) mapPage();
    else if (m && BY[m[1]] && document.getElementById('minimap')) {  // fill in the small map, in the space kept for it
      document.getElementById('minimap').outerHTML = miniMap(BY[m[1]]); bindMiniMap(BY[m[1]]);
    }
    return GEO;
  }).catch(() => null);
}
const TIERC = { vh: '--t-vh', h: '--t-h', m: '--t-m', lc: '--t-lc', lo: '--t-lo', ld: '--t-ld', ln: '--t-ln', l: '--t-l' };
const bgDots = (pts, r) => pts.map(p => `M${(p[2] - r).toFixed(2)},${p[3]}a${r.toFixed(2)},${r.toFixed(2)} 0 1,0 ${(2 * r).toFixed(2)},0a${r.toFixed(2)},${r.toFixed(2)} 0 1,0 ${(-2 * r).toFixed(2)},0`).join('');
let mapR = null;  // base radii for the current render
let mapFocus = null, mapFocusFresh = false;  // a language found with the search box while the map is showing
// "Show major languages" off: English, French, Spanish and Portuguese left off the map
let mapMajors = true;
const MAP_MAJORS = new Set(['en', 'fr', 'es', 'pt']);
function onMap(l) { return mapMajors || !MAP_MAJORS.has(l.code) || l.code === mapFocus; }
let mapView = null;  // the map's zoom, kept while the map page redraws (switching areas and dots, say)
// Map view: the areas where languages are spoken, shaded by tier (Glottography), or a dot per language
let mapMode = 'areas';
const SOFT_MIN = 2400;  // the least blur of the language areas, as a fraction of the map's width
let AREAS = GEO && GEO.areas;  // embedded with the basemap
// Natural Earth 50m outlines (data/borders.json), fetched the first time the map is zoomed to chosen
// countries; until they arrive the world map's own (110m) are drawn, then the map redraws in place
let BORDERS = null, bordersLoading = null;
function loadBorders() {
  bordersLoading ??= fetch('data/borders.json').then(r => r.json()).then(d => {
    BORDERS = { ...d, all: Object.values(d.countries).join('') + d.other };
    if (countrySel.size && document.getElementById('worldmap') && curRoute() === 'map') {
      const y = scrollY, open = document.querySelector('#mctrywrap details')?.open;  // a drop-down left open stays open
      mapPage(); if (open) reopenCountries('mctrywrap'); scrollTo(0, y);
    }
  }).catch(() => {});
  return bordersLoading;
}
// Share of the land drawn where the best-covered language is in each tier: paint the areas, lowest
// tier first, on a small canvas and count pixels (Equal Earth keeps areas true)
function tierLandShares(ls, tierKey, frame, keys) {
  const { width: W0, height: H0, path } = GEO.basemap, c = document.createElement('canvas');
  const S = 3, W = W0 * S, H = H0 * S;  // drawn at three times the map's size, so edges are a small share
  c.width = W; c.height = H;
  const g = c.getContext('2d', { willReadFrequently: true });
  if (!g || typeof Path2D === 'undefined') return null;
  g.scale(S, S);
  if (frame) g.clip(new Path2D(frame));  // a region: only the land inside its frame counts
  // Each tier in its own colour, a corner of the colour cube, so none is a blend of two others and the
  // anti-aliased edges between areas (blends) match no tier and are left out rather than miscounted
  const CORNERS = [[0, 255, 0], [0, 0, 255], [255, 255, 0], [0, 255, 255], [255, 0, 255], [255, 255, 255], [0, 0, 0]];
  const COL = { none: [255, 0, 0], ...Object.fromEntries(keys.map((k, i) => [k, CORNERS[i]])) };
  const rgb = t => `rgb(${COL[t].join(',')})`;
  g.fillStyle = rgb('none'); g.fill(new Path2D(path));
  for (const t of [...keys].reverse()) {  // least-covered first, so the best-covered language in each place is on top
    g.fillStyle = rgb(t);
    for (const l of ls) if (tierKey(l) === t && AREAS.paths[l.code]) g.fill(new Path2D(AREAS.paths[l.code]));
  }
  const key = Object.fromEntries(Object.entries(COL).map(([t, c]) => [c.join(','), t]));
  const px = g.getImageData(0, 0, W, H).data, n = Object.fromEntries(Object.keys(COL).map(k => [k, 0]));
  for (let i = 0; i < px.length; i += 4) {
    if (px[i + 3] < 255) continue;
    const t = key[`${px[i]},${px[i + 1]},${px[i + 2]}`];
    if (t) n[t]++;
  }
  const land = Object.values(n).reduce((a, b) => a + b, 0) || 1;
  return Object.fromEntries(Object.entries(n).map(([k, v]) => [k, v / land]));
}
function mapSection() {
  if (!GEO) return '';
  const provider = 'All';  // the Map tab is coloured by tier; the provider filter is for the Charts
  const { width: W, height: Hh, path } = GEO.basemap;
  const scored = new Set(ALL.map(l => l.code));  // extinct languages: neither scored dots nor background
  const pt = Object.fromEntries(GEO.points.map(p => [p[0], p]));
  const bg = GEO.points.filter(p => !scored.has(p[0]));
  // keep dots a readable size on screen whatever the map's rendered width
  const px = Math.max(300, Math.min(1000, (window.innerWidth || 1000) - 70)) / W;
  const many = LANGS.length > 500;  // thousands of dots: smaller, so neighbours stay visible
  const r0 = Math.max(1.7, 0.9 / px), rs = many ? Math.max(3, 2.2 / px) : Math.max(6.5, 4.5 / px), sw = many ? Math.max(0.6, 0.5 / px) : Math.max(1.6, 1.1 / px);
  mapR = { r0, rs, sw };
  const bgPath = bgDots(bg, r0);
  const P = provider !== 'All', pn = P ? PROV_ALL[provider] : '';
  const val = l => P ? provCoverage(l, provider).share : l.ltdi;
  const tierKey = l => P ? covTier(val(l)) : tierOf(l)[0];
  const tip = l => { if (!P) return `LTDI ${l.ltdi.toFixed(3)} · ${tierOf(l)[1]} · rank ${rankLabel(l)}`;
    const c = provCoverage(l, provider); return `${esc(pn)}: ${c.n} of ${c.of} ${provWhat(provider)}`; };
  const dots = LANGS.filter(l => pt[l.code] && onMap(l)).sort((a, b) => (a.code === mapFocus) - (b.code === mapFocus) || val(a) - val(b)).map(l => {
    const c = tierKey(l), p = pt[l.code];
    return `<a href="${LH(l.code)}"><circle class="sdot${l.code === mapFocus ? ' hit' : ''}" cx="${p[2]}" cy="${p[3]}" r="${rs.toFixed(1)}" fill="var(${TIERC[c]})" stroke="var(--surface)" stroke-width="${sw.toFixed(1)}"
      opacity="${inView(l) ? 1 : 0.25}" tabindex="0" data-tip="<b>${esc(l.name)}</b><br>${tip(l)}"/></a>`;
  }).join('');
  const keys = P ? ['vh', 'h', 'm', 'l'] : TIER_KEYS.map(([k]) => k);
  const counts = Object.fromEntries(keys.map(k => [k, 0]));
  LANGS.filter(inView).forEach(l => counts[tierKey(l)]++);
  const legendLabels = P ? { vh: '90%+ of its services', h: '60–90%', m: '30–60%', l: 'Under 30%' } : TIER_LABEL;
  const areasOn = mapMode === 'areas' && AREAS;
  const toggle = AREAS ? `<div class="chips mapmode" role="group" aria-label="Map view">
      <button class="chip" data-mode="areas" aria-pressed="${!!areasOn}">Areas</button>
      <button class="chip" data-mode="dots" aria-pressed="${!areasOn}">Languages</button></div>` : '';
  let layer = dots, legend, sub;
  const colour = P ? `the share of the ${provCoverage(LANGS[0], provider).of} ${esc(pn)} ${provWhat(provider)} tracked here that cover each language${provBench(provider) ? ' (a benchmark counts where it publishes a result)' : ''}`
    : `LTDI tier (very high 0.90 and above, high 0.75–0.90, medium 0.60–0.75; below that, by what's recorded: commercial, some commercial support; open only; data only; or none recorded)`;
  if (areasOn) {
    // a region is a place here: its frame, with every area in it at full strength (English and Spanish
    // in the Americas, though their region group is Europe)
    const frame = regionFrame();
    const inTiers = l => !tierSel.size || tierSel.has(tierOf(l)[0]) || l.code === mapFocus;
    const withArea = LANGS.filter(l => AREAS.paths[l.code] && inTiers(l) && onMap(l));
    const order = Object.fromEntries([...keys].reverse().map((k, i) => [k, i]));  // best-covered drawn on top
    // One area the atlas draws for several LTDI languages (Serbian, Croatian, Bosnian, Montenegrin) is
    // drawn once, for the one on top, so the shared area isn't darkened by stacking
    const drawn = withArea.sort((a, b) => (a.code === mapFocus) - (b.code === mapFocus) || order[tierKey(a)] - order[tierKey(b)] || (AREAS.area[b.code] || 0) - (AREAS.area[a.code] || 0));
    const top = new Map(drawn.map(l => [AREAS.paths[l.code], l.code]));
    layer = `<g class="areas${mapFocus ? ' focusing' : ''}">${drawn.filter(l => top.get(AREAS.paths[l.code]) === l.code).map(l =>
      `<path d="${AREAS.paths[l.code]}" data-code="${l.code}"${l.code === mapFocus ? ' class="hit"' : ''} fill="var(${TIERC[tierKey(l)]})" fill-opacity="0.5" data-tip="<b>${esc(l.name)}</b><br>${tip(l)}"/>`).join('')}</g>`;
    const sh = tierLandShares(withArea, tierKey, frame && frame.outline, keys), pct = v => v == null ? '' : ` · ${v > 0 && v < 0.01 ? '<1' : Math.round(v * 100)}%`;
    legend = `${keys.map(c => `<span><i class="dot" style="background:var(${TIERC[c]})"></i>${legendLabels[c]}${sh ? pct(sh[c]) : ''}</span>`).join('')}
      ${sh ? `<span><i class="dot" style="background:var(--land);box-shadow:inset 0 0 0 1px var(--t-none-edge)"></i>No area in the atlas${pct(sh.none)}</span>` : ''}`;
    sub = `Where each language is spoken today: the ${withArea.length.toLocaleString()} languages with an area in the atlas, shaded by ${colour}. Areas overlap; each tier’s share of ${frame ? `the land in this view of ${esc(regionNames())}` : 'the world’s land'} counts the best-covered language in each place. ${countrySel.size ? `The main languages are named; to see every language spoken in ${countrySel.size > 1 ? 'these countries' : 'this country'}, switch to Languages.` : 'Hover for names.'} Areas from Glottography’s digitisations of Asher &amp; Moseley’s <i>Atlas of the World’s Languages</i> (2007), contemporary version, and, for ${officialNames()}, where they fit the countries their speakers live in better, of Wikipedia’s list of official languages by country (2024) (both CC BY 4.0); map from Natural Earth.`;
  } else {
    legend = `${keys.map(c => `<span><i class="dot" style="background:var(${TIERC[c]})"></i>${legendLabels[c]} · ${counts[c].toLocaleString()}</span>`).join('')}
      <span><i class="dot" style="background:var(--t-none);box-shadow:inset 0 0 0 1px var(--t-none-edge)"></i>Not scored · ${bg.length.toLocaleString()}</span>`;
    sub = `Each dot represents a language, placed in its traditional home. The ${LANGS.length.toLocaleString()} languages in the Index are coloured by ${colour}${bg.length ? `, with ${bg.length.toLocaleString()} other languages, not yet scored, in white` : ''}. Hover for names; select a dot for its profile. Locations from LinguaMeta; map from Natural Earth.`;
  }
  const F = mapFocus && BY[mapFocus], fp = F && pt[F.code];
  const C = countrySel.size > 0;  // countries chosen: borders, softened areas and the main languages named
  if (C && !BORDERS) loadBorders();
  const land = C && BORDERS ? BORDERS.all : path;  // detailed coasts when zoomed to countries
  const focusBox = F ? `<div class="mapfocus" role="status"><span><b>${esc(F.name)}</b> · ${F.extinct ? 'extinct, so not on the map'
      : `LTDI ${F.ltdi.toFixed(3)} · ${tierOf(F)[1]} · rank ${rankLabel(F)}${areasOn && !AREAS.paths[F.code] ? (fp ? ' · no area in the atlas, so shown at its location' : '') : ''}${!fp && !(areasOn && AREAS.paths[F.code]) ? ' · no location recorded, so not on the map' : ''}`}</span>
      <a href="${LH(F.code)}">Open its page</a><button class="x" id="mapunfocus" aria-label="Show the whole map" title="Show the whole map">×</button></div>` : '';
  return `<section class="chart">
    <div class="maphead"><h3>The world's languages</h3><div class="mapopts"><label class="switch" title="English, French, Spanish and Portuguese"><input type="checkbox" role="switch" id="mmajors"${mapMajors ? ' checked' : ''}><span class="track" aria-hidden="true"></span>Show major languages</label>${toggle}</div></div>
    <div class="legend map">${legend}</div>
    ${focusBox}
    <div class="mapwrap"><div class="mapctl">
        <button id="zin" aria-label="Zoom in" title="Zoom in">+</button><button id="zout" aria-label="Zoom out" title="Zoom out">−</button><button id="zreset" class="reset" aria-label="Reset zoom" title="Reset">⟲</button>
      </div><svg id="worldmap"${F ? ' class="focusing"' : ''} viewBox="0 0 ${W} ${Hh}" role="img" aria-label="Map of ${GEO.points.length} languages; ${LANGS.length} scored">
      ${areasOn ? `<defs><clipPath id="landclip"><path d="${land}"/></clipPath></defs>` : ''}
      <path d="${land}" fill="var(--land)" stroke="var(--surface)" stroke-width="0.8" vector-effect="non-scaling-stroke"/>
      ${areasOn ? `<g clip-path="url(#landclip)">${layer}</g>` : `<path id="bgdots" d="${bgPath}" fill="var(--t-none)" stroke="var(--t-none-edge)" stroke-width="0.4" fill-opacity="var(--t-none-op)" stroke-opacity="var(--t-none-op)"/>
      ${dots}`}
      ${C ? `<path class="borders" d="${land}"/><path class="cborders" d="${[...countrySel].map(c => (BORDERS && BORDERS.countries[c]) || (GEO.basemap.countries || {})[c]?.outline || '').join('')}"/>` : ''}
      ${C ? [...countrySel].map(c => (GEO.basemap.countries || {})[c]).filter(f => f && Math.max(f.box[2] - f.box[0], f.box[3] - f.box[1]) < W / 150)
        .map(f => `<circle class="cring" cx="${(f.box[0] + f.box[2]) / 2}" cy="${(f.box[1] + f.box[3]) / 2}" r="0"/>`).join('') : ''}
      ${C && areasOn ? `<g class="alabels">${areaLabels().map(([code, x, y]) => `<text x="${x}" y="${y}" data-code="${code}">${esc(BY[code].name)}</text>`).join('')}</g>` : ''}
      ${F && !F.extinct && areasOn && !AREAS.paths[F.code] && fp ? `<circle class="sdot hit" cx="${fp[2]}" cy="${fp[3]}" r="${rs.toFixed(1)}" fill="var(${TIERC[tierKey(F)]})" stroke="var(--surface)" stroke-width="${sw.toFixed(1)}"/>` : ''}
      ${F && !F.extinct && (fp || (areasOn && AREAS.paths[F.code])) ? '<circle id="focusring" r="0"/>' : ''}
    </svg></div>
    <p class="maphint">Drag to move · double-click or + to zoom in · Ctrl or ⌘ and scroll to zoom</p>
    <p class="sub mapsub">${sub}</p>
  </section>`;
}
function bindMap() {
  document.querySelectorAll('.mapmode [data-mode]').forEach(b => b.onclick = () => {
    mapMode = b.dataset.mode; const y = scrollY; mapPage(); scrollTo(0, y);  // same place, same zoom
  });
  const svg = document.getElementById('worldmap');
  if (!svg || !GEO || !svg.getScreenCTM) return;
  const scored = new Set(ALL.map(l => l.code));  // extinct languages: neither scored dots nor background
  const bg = GEO.points.filter(p => !scored.has(p[0]));
  const { width: W, height: H } = GEO.basemap;
  let vb = mapView ? { ...mapView } : { x: 0, y: 0, w: W, h: H }, raf = 0;
  const k = () => W / vb.w;
  const soft = document.getElementById('softblur');
  // Language names keep about 13px on screen; where two would overlap, the one listed first (more
  // speakers) stays
  const labs = [...svg.querySelectorAll('.alabels text')];
  const placeLabels = () => {
    if (!labs.length) return;
    const fs = vb.w / 80, kept = [];
    for (const t of labs) {
      t.setAttribute('font-size', fs.toFixed(3)); t.setAttribute('stroke-width', (fs * 0.28).toFixed(3));
      const x = +t.getAttribute('x'), y = +t.getAttribute('y'), w = t.textContent.length * fs * 0.56, h = fs * 1.1;
      const box = [x - w / 2, y - h / 2, x + w / 2, y + h / 2];
      const clash = kept.some(b => box[0] < b[2] && box[2] > b[0] && box[1] < b[3] && box[3] > b[1]);
      t.style.display = clash ? 'none' : '';
      if (!clash) kept.push(box);
    }
  };
  const apply = () => {
    svg.setAttribute('viewBox', `${vb.x} ${vb.y} ${vb.w} ${vb.h}`);
    mapView = { ...vb };
    // about 2px on screen at the whole-world view; zoomed in, never less than a fixed share of the map,
    // so the atlas's simplified outlines read as soft areas rather than angular polygons
    if (soft) soft.setAttribute('stdDeviation', Math.max(vb.w / 450, W / SOFT_MIN).toFixed(3));
    placeLabels();
    svg.querySelectorAll('.cring').forEach(c => c.setAttribute('r', (vb.w * 0.025).toFixed(3)));
    cancelAnimationFrame(raf);
    raf = requestAnimationFrame(() => {   // keep dots the same size on screen
      const z = k();
      svg.querySelectorAll('circle.sdot').forEach(c => { c.setAttribute('r', (mapR.rs / Math.sqrt(z)).toFixed(2)); c.setAttribute('stroke-width', (mapR.sw / Math.sqrt(z)).toFixed(2)); });
      const bgEl = document.getElementById('bgdots');
      if (bgEl) { bgEl.setAttribute('d', bgDots(bg, mapR.r0 / Math.sqrt(z))); bgEl.setAttribute('stroke-width', (0.4 / z).toFixed(3)); }
    });
  };
  const clamp = () => {
    vb.w = Math.min(W, Math.max(W / 16, vb.w)); vb.h = vb.w * H / W;
    vb.x = Math.min(W - vb.w, Math.max(0, vb.x)); vb.y = Math.min(H - vb.h, Math.max(0, vb.y));
  };
  const toMap = (cx, cy) => { const pnt = svg.createSVGPoint(); pnt.x = cx; pnt.y = cy; return pnt.matrixTransform(svg.getScreenCTM().inverse()); };
  const zoomAt = (factor, mx, my) => {
    const nw = Math.min(W, Math.max(W / 16, vb.w / factor)), nh = nw * H / W;
    vb.x = mx - (mx - vb.x) * nw / vb.w; vb.y = my - (my - vb.y) * nh / vb.h; vb.w = nw; vb.h = nh;
    clamp(); apply();
  };
  const centre = () => [vb.x + vb.w / 2, vb.y + vb.h / 2];
  // A region chosen in the filter: start framed on that region's land (boxes from ltdi.geo)
  const rv = !mapView && regionFrame();
  if (mapView) apply();
  else if (rv) {
    // a region fills the view; a country gets a margin, and a small one still shows its neighbours
    // (the view is never narrower than a twelfth of the world), centred on it
    const [x0, y0, x1, y1] = rv.box, fit = Math.max(x1 - x0, (y1 - y0) * W / H);
    const w = countrySel.size ? Math.min(W, Math.max(W / 12, fit * 1.3)) : fit * 1.04;
    vb = { x: (x0 + x1) / 2 - w / 2, y: (y0 + y1) / 2 - w * H / W / 2, w, h: w * H / W };
    clamp(); apply();
  }
  // A language found with the search box: zoom to its area. The area fills about two-fifths of the
  // view, but the view never narrows below an eighth of the world, so a small area still shows enough
  // coast and borders around it to tell where it is (and a ring marks it). The dots view uses the same
  // frame, ringing the dot; a language with no area is shown a third of the world across.
  const F = mapFocus && BY[mapFocus], ring = document.getElementById('focusring');
  if (F && ring) {
    const hit = svg.querySelector('.areas path.hit'), p = GEO.points.find(q => q[0] === F.code);
    // the area's outline frames the view in either mode (in the dots view it's measured, not drawn),
    // so switching views keeps the same frame; a language with no area gets a third of the world
    let area = hit;
    if (!area && AREAS && AREAS.paths[F.code]) {
      area = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      area.setAttribute('d', AREAS.paths[F.code]); area.setAttribute('visibility', 'hidden'); svg.appendChild(area);
    }
    let cx, cy, w, small = true;
    if (area) {
      const b = area.getBBox();
      if (area !== hit) area.remove();
      cx = b.x + b.width / 2; cy = b.y + b.height / 2;
      w = Math.min(W, Math.max(W / 8, Math.max(b.width, b.height * W / H) * 2.5));
      small = Math.max(b.width, b.height * W / H) < w / 12;
    } else { cx = p[2]; cy = p[3]; w = W / 3; }
    if (!hit && p) { small = true; ring.setAttribute('cx', p[2]); ring.setAttribute('cy', p[3]); }  // a dot is always ringed
    const target = { w, h: w * H / W, x: cx - w / 2, y: cy - w * H / W / 2 };
    target.x = Math.min(W - target.w, Math.max(0, target.x)); target.y = Math.min(H - target.h, Math.max(0, target.y));
    if (hit || !p) { ring.setAttribute('cx', cx); ring.setAttribute('cy', cy); }
    ring.setAttribute('r', small ? (w * 0.03).toFixed(2) : 0);
    const from = { ...vb }, t0 = performance.now(), ms = matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 700;
    if (!mapFocusFresh) { target.x = vb.x; target.y = vb.y; target.w = vb.w; target.h = vb.h; }  // a redraw keeps the view
    mapFocusFresh = false;
    const ease = t => t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2;
    const step = now => {
      const t = ms ? Math.min(1, (now - t0) / ms) : 1, e = ease(t);
      vb = Object.fromEntries(Object.keys(target).map(k2 => [k2, from[k2] + (target[k2] - from[k2]) * e]));
      apply();
      if (t < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }
  const unf = document.getElementById('mapunfocus');
  if (unf) unf.onclick = () => { mapFocus = null; const y = scrollY; mapPage(); scrollTo(0, y); };
  document.getElementById('zin').onclick = () => zoomAt(2, ...centre());
  document.getElementById('zout').onclick = () => zoomAt(0.5, ...centre());
  document.getElementById('zreset').onclick = () => { vb = { x: 0, y: 0, w: W, h: H }; apply(); };
  svg.addEventListener('dblclick', e => { e.preventDefault(); const q = toMap(e.clientX, e.clientY); zoomAt(2, q.x, q.y); });
  svg.addEventListener('wheel', e => {
    if (!(e.ctrlKey || e.metaKey)) return;   // plain scrolling scrolls the page
    e.preventDefault(); const q = toMap(e.clientX, e.clientY); zoomAt(Math.exp(-e.deltaY * 0.0025), q.x, q.y);
  }, { passive: false });
  // drag to pan, pinch to zoom
  const pts = new Map(); let last = null, moved = false, pinch = null;
  svg.addEventListener('pointerdown', e => { pts.set(e.pointerId, [e.clientX, e.clientY]); last = [e.clientX, e.clientY]; moved = false;
    if (pts.size === 2) { const [a, b] = [...pts.values()]; pinch = Math.hypot(a[0] - b[0], a[1] - b[1]); } });
  svg.addEventListener('pointermove', e => {
    if (!pts.has(e.pointerId)) return;
    pts.set(e.pointerId, [e.clientX, e.clientY]);
    if (pts.size === 2 && pinch) {
      const [a, b] = [...pts.values()], d = Math.hypot(a[0] - b[0], a[1] - b[1]);
      const q = toMap((a[0] + b[0]) / 2, (a[1] + b[1]) / 2); zoomAt(d / pinch, q.x, q.y); pinch = d; moved = true; return;
    }
    const dx = e.clientX - last[0], dy = e.clientY - last[1];
    if (!moved && Math.hypot(dx, dy) < 4) return;
    if (!moved) { moved = true; svg.setPointerCapture(e.pointerId); svg.classList.add('dragging'); tipHide(); }
    const s = vb.w / svg.getBoundingClientRect().width;
    vb.x -= dx * s; vb.y -= dy * s; last = [e.clientX, e.clientY]; clamp(); apply();
  });
  const end = e => { pts.delete(e.pointerId); if (pts.size < 2) pinch = null; svg.classList.remove('dragging'); };
  svg.addEventListener('pointerup', end); svg.addEventListener('pointercancel', end);
  svg.addEventListener('click', e => { if (moved) { e.preventDefault(); e.stopPropagation(); moved = false; } }, true);
  // an area opens its language (areas are plain paths, not links, so dragging doesn't leave a focus box)
  svg.addEventListener('click', e => { const a = e.target.closest('.areas path[data-code]'); if (a) go('lang-' + a.dataset.code); });
  // hover names for the unscored languages
  svg.addEventListener('mousemove', e => {
    if (svg.classList.contains('dragging') || e.target.closest('[data-tip]') || mapMode === 'areas') return;  // those have their own tips
    const q = toMap(e.clientX, e.clientY), lim = (6 / k()) ** 2;
    let best = null, bd = lim;
    for (const p of bg) { const d = (p[2] - q.x) ** 2 + (p[3] - q.y) ** 2; if (d < bd) { bd = d; best = p; } }
    if (best) tipShow(e, `<b>${esc(best[1])}</b><br>${best[4] ? people(best[4]) + ' speakers · ' : ''}not yet scored`); else tipHide();
  });
  svg.addEventListener('mouseleave', tipHide);
}

// The languages whose area is where they're official (Wikipedia, via Glottography) rather than the atlas's
let OFFICIAL_AREA = new Set((AREAS && AREAS.official) || []);
function officialNames() {
  const ns = [...OFFICIAL_AREA].filter(c => BY[c]).map(c => BY[c].name).sort();
  return ns.length > 1 ? `${ns.slice(0, -1).join(', ')} and ${ns[ns.length - 1]}` : ns[0] || '';
}
// A small map on a language's page: its area in the atlas, or its dot where it has none, framed as the
// Map tab frames a language found with the search box. Selecting it opens the language on the Map tab.
const MINI_ASPECT = 0.62;
function miniMap(l) {
  if (l.extinct || NOMAP.has(l.code)) return '';
  if (!GEO) {  // the map's file is still on its way: keep the small map's space (the basemap is 1000 wide)
    loadGeo();
    return `<a class="minimap" id="minimap" href="#map" aria-label="${esc(l.name)} on the map"><svg viewBox="0 0 1000 ${1000 * MINI_ASPECT}" aria-hidden="true"></svg></a>`;
  }
  const area = AREAS && AREAS.paths[l.code], p = GEO.points.find(q => q[0] === l.code);
  if (!area && !p) return '';
  const col = `var(${TIERC[tierOf(l)[0]]})`, land = GEO.basemap.path;
  const src = area ? (OFFICIAL_AREA.has(l.code) ? 'Countries where it’s an official language (Wikipedia, via Glottography)' : 'Where it’s spoken (Asher & Moseley’s atlas, via Glottography)') : 'Its location (LinguaMeta)';
  return `<a class="minimap" id="minimap" href="#map" title="${esc(src)}. Select to open on the map" aria-label="${esc(l.name)} on the map">
    <svg viewBox="0 0 ${GEO.basemap.width} ${GEO.basemap.width * MINI_ASPECT}" aria-hidden="true">
      <defs><filter id="msoft" x="-20%" y="-20%" width="140%" height="140%"><feGaussianBlur id="msoftblur" stdDeviation="1"/></filter></defs>
      <path class="land" d="${land}"/>
      ${area ? `<path class="marea" d="${area}" fill="${col}" filter="url(#msoft)"/>` : ''}
      <path class="mborders" d="${land}"/>
      ${area ? '' : `<circle class="mdot" cx="${p[2]}" cy="${p[3]}" r="0" fill="${col}"/>`}
      <circle class="mring" r="0"/>
    </svg></a>`;
}
// The small map grows to fill the height beside the language's facts (between MINI_MIN and MINI_MAX wide);
// once the header has wrapped (phones), it keeps its smallest size
const MINI_MIN = 240, MINI_MAX = 420;
function sizeMiniMap() {
  const a = document.getElementById('minimap'), head = a && a.closest('.lhead');
  if (!a) return;
  const main = head.querySelector('.lmain'), score = head.querySelector('.lscore');
  for (let i = 0; i < 3; i++) {  // its width changes the facts' wrapping, and so their height: settle
    if (score.offsetTop > main.offsetTop + 4) { a.style.width = ''; return; }  // wrapped below the facts
    const room = main.offsetHeight - (score.offsetHeight - a.offsetHeight);
    const w = Math.round(Math.min(MINI_MAX, Math.max(MINI_MIN, room / MINI_ASPECT)));
    if (Math.abs(w - a.offsetWidth) < 4) return;
    a.style.width = w + 'px';
  }
}
addEventListener('resize', () => { cancelAnimationFrame(sizeMiniMap.raf); sizeMiniMap.raf = requestAnimationFrame(sizeMiniMap); });
function bindMiniMap(l) {
  const a = document.getElementById('minimap'), svg = a && a.querySelector('svg');
  if (!svg) return;
  sizeMiniMap();
  if (!GEO) return;
  const { width: W, height: H } = GEO.basemap, area = svg.querySelector('.marea'), dot = svg.querySelector('.mdot');
  let cx, cy, w, small = true;
  if (area) {
    const b = area.getBBox(), size = Math.max(b.width, b.height / MINI_ASPECT);
    cx = b.x + b.width / 2; cy = b.y + b.height / 2;
    w = Math.min(W, Math.max(W / 8, size * 2.5)); small = size < w / 12;
  } else { cx = +dot.getAttribute('cx'); cy = +dot.getAttribute('cy'); w = W / 7; }
  const h = w * MINI_ASPECT;
  const x = w < W ? Math.min(W - w, Math.max(0, cx - w / 2)) : 0, y = h < H ? Math.min(H - h, Math.max(0, cy - h / 2)) : (H - h) / 2;
  svg.setAttribute('viewBox', `${x} ${y} ${w} ${h}`);
  document.getElementById('msoftblur').setAttribute('stdDeviation', (w / 250).toFixed(3));
  if (dot) dot.setAttribute('r', (w * 0.014).toFixed(3));
  const ring = svg.querySelector('.mring');
  ring.setAttribute('cx', cx); ring.setAttribute('cy', cy); ring.setAttribute('r', small ? (w * 0.06).toFixed(3) : 0);
  // zoomed in: the detailed coasts and borders (fetched once, as for countries on the Map tab)
  if (w < W / 3) loadBorders().then(() => {
    if (BORDERS && svg.isConnected) svg.querySelectorAll('.land, .mborders').forEach(e => e.setAttribute('d', BORDERS.all));
  });
  a.onclick = e => { e.preventDefault(); mapFocus = l.code; mapFocusFresh = true; go('map'); };
}

// Keep a bar of filters at the top of the window once it scrolls up there. Done in script rather than
// with position: sticky, which stops working when the page is hosted inside a frame or a container
// that clips overflow; a scroll listener on the document hears whichever element is scrolling.
function pinBar(bar) {
  if (!bar) return;
  const spot = document.createElement('div'); bar.before(spot);
  const update = () => {
    if (!bar.isConnected) { document.removeEventListener('scroll', update, true); removeEventListener('resize', update); return; }
    const r = spot.getBoundingClientRect(), pin = r.top < 0;
    if (pin !== bar.classList.contains('stuck')) {
      bar.classList.toggle('stuck', pin);
      spot.style.height = pin ? bar.offsetHeight + 'px' : '';
    }
    if (pin) { bar.style.left = r.left + 'px'; bar.style.width = r.width + 'px'; } else { bar.style.left = bar.style.width = ''; }
  };
  document.addEventListener('scroll', update, true);
  addEventListener('resize', update);
  update();
}

function charts() {
  const langs = LANGS.filter(inView), N = langs.length;
  const techs = Object.entries(CFG.tech.technologies);
  // tooltips name languages by speakers, up to 12, so they stay readable with thousands of languages
  const names = ls => {  // the 12 most spoken, picked in one pass rather than sorting the whole list
    let top = ls;
    if (ls.length > 12) { top = []; for (const l of ls) { const s = l.speakers || 0;
      if (top.length < 12 || s > (top[11].speakers || 0)) { let k = top.length; while (k && (top[k - 1].speakers || 0) < s) k--; top.splice(k, 0, l); if (top.length > 12) top.pop(); } } }
    return (top.map(l => esc(l.name)).join(', ') || '—') + (ls.length > 12 ? ` and ${(ls.length - 12).toLocaleString()} more` : ''); };

  // 1. Coverage now (for one provider: its own services only)
  const P = provider !== 'All', pn = P ? PROV_ALL[provider] : '';
  const LV = P ? PLEVELS : LEVELS;
  const shown = P ? techs.map(([k, t]) => [k, t, provIds(t, provider)]).filter(([, , ids]) => ids.length) : techs.map(([k, t]) => [k, t, null]);
  const absent = P ? techs.filter(([, t]) => !provIds(t, provider).length).map(([, t]) => t.label) : [];
  const rows = shown.map(([k, t, ids]) => {
    const lvl = l => P ? provLevel(l, ids) : levelOf(l, k, t);
    const by = Object.fromEntries(LV.map(([lv]) => [lv, langs.filter(l => lvl(l) === lv)]));
    const label = P ? `${t.label} (${ids.map(id => SVC[id][0]).join(', ')})` : t.label;
    const bench = P && ids.every(id => CFG.tech.technologies[k].measured && id in CFG.tech.technologies[k].measured);
    const segs = LV.filter(([lv]) => by[lv].length).map(([lv, lab0]) => {
      const n = by[lv].length, lab = bench ? { full: 'Benchmark result published', part: 'Some benchmark results', none: 'No published result' }[lv] : lab0;
      return `<div class="seg ${lv}" tabindex="0" style="flex:${n}" data-tip="<b>${esc(label)}: ${esc(lab)}</b><br>${n} of ${N}: ${names(by[lv])}">${n / N >= 0.08 ? n : ''}</div>`;
    }).join('');
    return { k, t, by, html: `<div class="lab" title="${esc(t.label)}">${esc(t.short || t.label)}${P ? `<small>${esc(ids.map(id => SVC[id][0]).join(', '))}</small>` : ''}</div><div class="stack" role="img" aria-label="${esc(label)}: ${LV.map(([lv, lab]) => `${by[lv].length} ${lab.toLowerCase()}`).join(', ')}">${segs}</div>` };
  });
  // 1b. The same split weighted by speakers: how many people each technology reaches
  const spk = ls => ls.reduce((n, l) => n + (vSpk(l) || 0), 0), SP = spk(langs) || 1;
  const pctS = v => { const p = v / SP * 100; return p > 0 && p < 1 ? '<1%' : Math.round(p) + '%'; };
  const rowsS = rows.map(r => {
    const segs = LV.filter(([lv]) => spk(r.by[lv])).map(([lv, lab]) => {
      const n = spk(r.by[lv]);
      return `<div class="seg ${lv}" tabindex="0" style="flex:${n}" data-tip="<b>${esc(r.t.label)}: ${esc(lab)}</b><br>${people(n)} speakers (${pctS(n)}) in ${r.by[lv].length.toLocaleString()} ${r.by[lv].length === 1 ? 'language' : 'languages'}: ${names(r.by[lv])}">${n / SP >= 0.08 ? people(n) : ''}</div>`;
    }).join('');
    return `<div class="lab" title="${esc(r.t.label)}">${esc(r.t.short || r.t.label)}</div><div class="stack" role="img" aria-label="${esc(r.t.label)}: ${LV.map(([lv, lab]) => `${people(spk(r.by[lv]))} speakers ${lab.toLowerCase()}`).join(', ')}">${segs}</div>`;
  }).join('');
  const tableS = `<div class="tablebox"><table><thead><tr><th>Technology</th>${LV.map(([, lab]) => `<th class="num">${esc(lab)}</th>`).join('')}</tr></thead>
    <tbody>${rows.map(r => `<tr><td>${esc(r.t.label)}</td>${LV.map(([lv]) => `<td class="num">${people(spk(r.by[lv]))} <span class="pct">(${pctS(spk(r.by[lv]))})</span></td>`).join('')}</tr>`).join('')}</tbody></table></div>`;
  const table1 = `<div class="tablebox"><table><thead><tr><th>Technology</th>${LV.map(([, lab]) => `<th class="num">${esc(lab)}</th>`).join('')}</tr></thead>
    <tbody>${rows.map(r => `<tr><td>${esc(r.t.label)}</td>${LV.map(([lv]) => `<td class="num" title="${names(r.by[lv])}">${r.by[lv].length}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`;

  // 2. Over time: small multiples
  const H = HIST;
  // one string per series and language: '1', '0' or '.' (no data) for each period
  const hv = (key, code, i) => { const c = ((H.values[key] || {})[code] || '')[i]; return c === '1' ? 1 : c === '0' ? 0 : null; };
  let multiples = '<p class="note">No history collected yet.</p>', added = '';
  if (H) {
    const spkMode = histMode === 'speakers';
    const P = H.periods, W = 300, Ht = 150, L = spkMode ? 38 : 30, R = spkMode ? 44 : 34, T = 12, B = 26;
    const axisN = v => !v ? '0' : v >= 1e9 ? `${+(v / 1e9).toFixed(1)}B` : v >= 1e6 ? `${+(v / 1e6).toFixed(1)}M` : v >= 1e3 ? `${+(v / 1e3).toFixed(1)}K` : `${v}`;
    const series = Object.entries(H.series).filter(([key]) => provider === 'All' || SERIES_PROV[key] === provider);  // P is the periods here
    const wt = histMode === 'speakers' ? (l => vSpk(l) || 0) : (() => 1), fmtH = histMode === 'speakers' ? people : (v => v.toLocaleString());
    // each language's history string per series, read once: '1' supported, '0' not, '.' no record
    const HS = Object.fromEntries(series.map(([key]) => { const vs = H.values[key] || {}; return [key, langs.map(l => vs[l.code] || '')]; }));
    const VALS = Object.fromEntries(series.map(([key]) => {
      const tot = P.map(() => 0), seen = P.map(() => false);
      HS[key].forEach((str, j) => { for (let i = 0; i < str.length; i++) { const c = str[i]; if (c === '1') { tot[i] += wt(langs[j]); seen[i] = true; } else if (c === '0') seen[i] = true; } });
      return [key, tot.map((v, i) => seen[i] ? v : null)];
    }));
    // the languages each series gained at each period, against its previous recorded period
    const GAINED = Object.fromEntries(series.map(([key]) => {
      const avail = P.map((p, i) => i).filter(i => VALS[key][i] != null), out = {};
      avail.slice(1).forEach((i, k) => { const prev = avail[k]; out[i] = HS[key].flatMap((str, j) => str[i] === '1' && str[prev] !== '1' ? [langs[j]] : []); });
      return [key, out];
    }));
    // one scale for all panels, up to a round number just above the largest count, so they compare
    const top = Math.max(1, ...Object.values(VALS).flat().filter(v => v != null));
    const mag = 10 ** Math.floor(Math.log10(top)), YMAX0 = [1, 2, 2.5, 5, 10].map(m => m * mag).find(v => v >= top), YMAX = histMode === 'speakers' ? YMAX0 : Math.min(N, YMAX0);
    const x = i => L + i * (W - L - R) / (P.length - 1), y = v => T + (Ht - T - B) * (1 - v / Math.max(YMAX, 1));
    const yearTicks = P.map((p, i) => [p, i]).filter(([p]) => p.endsWith('-12') && ['2019', '2022', '2025'].includes(p.slice(0, 4)));
    multiples = series.map(([key, label]) => {
      const vals = VALS[key];
      const pts = vals.map((v, i) => v == null ? null : [x(i), y(v), v, i]).filter(Boolean);
      if (!pts.length) return '';
      const step = pts.map(([px, py], j) => j ? `H${px.toFixed(1)}V${py.toFixed(1)}` : `M${px.toFixed(1)},${py.toFixed(1)}`).join('');
      const area = `${step}V${y(0)}H${pts[0][0].toFixed(1)}Z`;
      const last = pts[pts.length - 1];
      const hits = pts.map(([px, , v, i], j) => {
        const prev = j ? vals[pts[j - 1][3]] : null;
        const gained = j ? GAINED[key][i] || [] : [];
        const when = (P[i].endsWith('-06') ? 'Mid ' : 'End ') + P[i].slice(0, 4);
        const tip = `<b>${when}</b><br>${histMode === 'speakers' ? `${people(v)} speakers` : `${v} of ${N} languages`}${gained.length ? `<br>New: ${names(gained)}` : ''}`;
        const w = (W - L - R) / (P.length - 1);
        return `<rect x="${(px - w / 2).toFixed(1)}" y="${T}" width="${w.toFixed(1)}" height="${Ht - T - B}" fill="transparent" data-tip="${esc(tip)}"/>`;
      }).join('');
      return `<div class="panel"><h4>${esc(label)}</h4><div class="now">${histMode === 'speakers' ? `${people(last[2])} speakers now` : `${last[2]} of ${N.toLocaleString()} languages now`}</div>
        <svg viewBox="0 0 ${W} ${Ht}" role="img" aria-label="${esc(label)}: ${pts.map(([, , v, i]) => `${P[i]} ${v}`).join(', ')}">
          <g class="grid">${[0, YMAX / 2, YMAX].map(v => `<line x1="${L}" x2="${W - R}" y1="${y(v)}" y2="${y(v)}"/><text x="${L - 6}" y="${y(v) + 4}" text-anchor="end">${spkMode ? axisN(v) : v}</text>`).join('')}</g>
          <g class="axis">${yearTicks.map(([p, i]) => `<text x="${x(i)}" y="${Ht - 8}" text-anchor="middle">${p.slice(0, 4)}</text>`).join('')}</g>
          <path d="${area}" fill="var(--accent)" fill-opacity="0.12"/>
          <path d="${step}" fill="none" stroke="var(--accent)" stroke-width="2"/>
          <circle cx="${last[0]}" cy="${last[1]}" r="4.5" fill="var(--accent)" stroke="var(--surface)" stroke-width="2"/>
          <text x="${last[0] + 8}" y="${last[1] + 4}" fill="var(--ink)" font-size="12" font-weight="600">${spkMode ? axisN(last[2]) : last[2]}</text>
          ${hits}
        </svg></div>`;
    }).join('');
    // When languages were added: one row of bars per source, a bar for each half-year's additions
    const gains = series.map(([key, label]) => {
      const avail = P.map((p, i) => i).filter(i => VALS[key][i] != null);
      return [key, label, avail.slice(1).map(i => { const g = GAINED[key][i] || [];
        return [i, g, g.reduce((n, l) => n + wt(l), 0)]; })];
    }).filter(([, , gs]) => gs.some(g => g[1].length));  // sources that launched in one release add nothing later
    const gTop = Math.max(1, ...gains.flatMap(([, , gs]) => gs.map(g => g[2])));
    const AW = 720, AH = 64, AL = 8, AR = 8, AT = 16, AB = 4, bw = (AW - AL - AR) / P.length;
    const ax = i => AL + i * bw;
    added = gains.length ? `<div class="added">${gains.map(([key, label, gs]) => `<div class="added-row"><div class="added-lab">${esc(label)}</div>
      <svg viewBox="0 0 ${AW} ${AH}" role="img" aria-label="${esc(label)}: ${gs.filter(g => g[1].length).map(([i, g]) => `${P[i]} ${g.length}`).join(', ') || 'no additions'}">
        <line x1="${AL}" x2="${AW - AR}" y1="${AH - AB}" y2="${AH - AB}" stroke="var(--rule)"/>
        ${gs.map(([i, g, v]) => { const h = v ? Math.max(2, (AH - AT - AB) * v / gTop) : 0, when = (P[i].endsWith('-06') ? 'First half of ' : 'Second half of ') + P[i].slice(0, 4);
          return `${h ? `<rect x="${(ax(i) + 2).toFixed(1)}" y="${(AH - AB - h).toFixed(1)}" width="${(bw - 4).toFixed(1)}" height="${h.toFixed(1)}" rx="2" fill="var(--accent)"/>` : ''}${g.length && v / gTop > 0.06 ? `<text x="${(ax(i) + bw / 2).toFixed(1)}" y="${(AH - AB - h - 4).toFixed(1)}" text-anchor="middle" font-size="11" fill="var(--ink)">${histMode === 'speakers' ? people(v) : g.length}</text>` : ''}
            <rect x="${ax(i).toFixed(1)}" y="0" width="${bw.toFixed(1)}" height="${AH}" fill="transparent" data-tip="${esc(`<b>${when}</b><br>${g.length ? `${g.length} ${g.length === 1 ? 'language' : 'languages'} added${histMode === 'speakers' ? ` (${people(v)} speakers)` : ''}: ${names(g)}` : 'None added'}`)}"/>`; }).join('')}
      </svg></div>`).join('')}
      <div class="added-row"><div></div><svg viewBox="0 0 ${AW} 16" aria-hidden="true">${P.map((p, i) => p.endsWith('-12') ? `<text x="${(ax(i)).toFixed(1)}" y="12" text-anchor="middle" font-size="11" fill="var(--muted)">${p.slice(0, 4)}</text>` : '').join('')}</svg></div></div>` : '';
    multiples = series.length ? `<div class="multiples">${multiples}</div>`
      : `<p class="note">No history collected yet for ${esc(pn)}'s services.</p>`;
  }
  const table2 = H ? `<div class="tablebox"><table><thead><tr><th>Kind of support</th>${H.periods.filter(p => p.endsWith('-12')).map(p => `<th class="num">${p.slice(0, 4)}</th>`).join('')}</tr></thead>
    <tbody>${Object.entries(H.series).filter(([k]) => provider === 'All' || SERIES_PROV[k] === provider).map(([k, lab]) => `<tr><td>${esc(lab)}</td>${H.periods.map((p, pi) => [p, pi]).filter(([p]) => p.endsWith('-12')).map(([, pi]) => { const col = H.values[k] || {}; let n = 0, any = false;
      for (const l of langs) { const c = (col[l.code] || '')[pi]; if (c === '1') { n++; any = true; } else if (c === '0') any = true; }
      return `<td class="num">${any ? n : '—'}</td>`; }).join('')}</tr>`).join('')}</tbody></table></div>` : '';

  // 3. LTDI by region: dot strip
  const regs = REGIONS.filter(r => !regionSel.size || regionSel.has(r));
  const sval = l => P ? provCoverage(l, provider).share : l.ltdi;
  const SW = Math.max(340, Math.min(720, (window.innerWidth || 720) - 70)), lab = SW < 500 ? 92 : 120, top = 26, rowH = 58, x1 = 1.0;
  const x0 = P || LANGS.some(l => l.ltdi < 0.3) ? 0 : 0.3;  // start at 0 once any language scores that low
  const sx = v => lab + (Math.max(x0, v) - x0) / (x1 - x0) * (SW - lab - 30);
  const SH = top + regs.length * rowH + 24;
  // Each row's dots are a few shapes (crowded rows split in eight, so overlaps still darken where
  // languages cluster), and the dot under the pointer is found from STRIP (not one link per
  // dot, which would be thousands of elements, slow on phones and thousands of keyboard stops)
  STRIP = [];
  const stripRows = [];
  const tipOf = l => `<b>${esc(l.name)}</b><br>${P ? `${esc(pn)}: ${provCoverage(l, provider).n} of ${provCoverage(l, provider).of} ${provWhat(provider)}` : `LTDI ${l.ltdi.toFixed(3)} · rank ${rankLabel(l)}`}`;
  const strip = `<svg id="strip" viewBox="0 0 ${SW} ${SH}" role="img" aria-label="${esc(P ? `Share of ${pn}'s services covering each language, by region` : 'LTDI of each language, by region')}: one dot per language; the table below lists each region's figures" style="width:100%;height:auto">
    <g class="grid">${(P ? [0, 0.25, 0.5, 0.75, 1.0] : x0 ? [0.4, 0.6, 0.8, 1.0] : [0, 0.2, 0.4, 0.6, 0.8, 1.0]).map(v => `<line x1="${sx(v)}" x2="${sx(v)}" y1="${top - 6}" y2="${SH - 22}"/><text x="${sx(v)}" y="${SH - 6}" text-anchor="middle">${P ? Math.round(v * 100) + '%' : v.toFixed(1)}</text>`).join('')}</g>
    ${regs.map((r, i) => {
      const ls = LANGS.filter(l => stripMode === 'home' ? l.region === r : l._rg.has(r)).sort((a, b) => sval(a) - sval(b)), cy = top + i * rowH + rowH / 2;
      if (!ls.length) return `<text x="0" y="${cy + 4}" fill="var(--ink)" font-size="13" font-weight="600">${esc(r)}</text>`;
      const lo = ls[0], hi = ls[ls.length - 1];
      // where several share the lowest (or highest) value, say how many rather than name one of them
      const nLo = ls.filter(l => sval(l) === sval(lo)).length, nHi = ls.filter(l => sval(l) === sval(hi)).length;
      const loName = nLo > 1 ? `${nLo.toLocaleString()} tied lowest` : lo.name, hiName = nHi > 1 ? `${nHi.toLocaleString()} tied highest` : hi.name;
      // nudge dots that would overlap above and below the row line
      // crowded rows (many languages) get small, translucent dots spread vertically instead
      const crowd = ls.length > 60;
      let prevX = -99, flip = 1;
      const dots = ls.map((l, k) => { const x = sx(sval(l)); let dy = 0;
        if (crowd) dy = ((k * 7919) % 17 - 8) * 1.2;
        else if (x - prevX < 13) { dy = 6 * flip; flip = -flip; } else flip = 1;
        prevX = x; return { l, x, y: cy + dy }; });
      const rad = crowd ? 3 : 6.5;
      dots.forEach(d => STRIP.push({ x: d.x, y: d.y, r: rad, l: d.l, tip: () => tipOf(d.l) }));
      // the mean, and the mean weighted by speakers: the score of the average speaker's language
      const mean = ls.reduce((n, l) => n + sval(l), 0) / ls.length, spk = ls.reduce((n, l) => n + (l.speakers || 0), 0);
      const wmean = spk ? ls.reduce((n, l) => n + (l.speakers || 0) * sval(l), 0) / spk : null;
      stripRows.push([r, ls.length, mean, wmean, hiName, loName]);
      return `<text x="0" y="${cy + 4}" fill="var(--ink)" font-size="13" font-weight="600">${esc(r)}</text>
        ${[...Array(crowd ? 8 : 1).keys()].map(g => `<path d="${dots.filter((d, k) => !crowd || k % 8 === g).map(d => `M${(d.x - rad).toFixed(1)},${d.y}a${rad},${rad} 0 1,0 ${2 * rad},0a${rad},${rad} 0 1,0 ${-2 * rad},0`).join('')}" fill="var(--accent)" fill-opacity="${crowd ? 0.45 : 0.85}" stroke="var(--surface)" stroke-width="${crowd ? 0 : 2}"/>`).join('')}
        <text x="${sx(sval(lo))}" y="${cy + 24}" text-anchor="middle" fill="var(--muted)" font-size="11">${esc(loName)}</text>
        ${ls.length > 1 ? `<text x="${Math.min(sx(sval(hi)), SW - 4)}" y="${cy - 14}" text-anchor="${sx(sval(hi)) > SW - 40 ? 'end' : 'middle'}" fill="var(--muted)" font-size="11">${esc(hiName)}</text>` : ''}`;
    }).join('')}
    <circle id="strip-hit" r="7" fill="none" stroke="var(--ink)" stroke-width="2" visibility="hidden" pointer-events="none"/>
  </svg>`;
  const fmtS = v => v == null ? '—' : P ? Math.round(v * 100) + '%' : v.toFixed(3);
  const stripTable = `<div class="tablebox"><table><thead><tr><th>Region</th><th class="num">Languages</th><th class="num">Mean ${P ? 'share' : 'LTDI'}</th><th class="num">Mean, by speakers</th><th>Highest</th><th>Lowest</th></tr></thead><tbody>${stripRows.map(([r, n, mean, wmean, hi, lo]) =>
    `<tr><td>${esc(r)}</td><td class="num">${n.toLocaleString()}</td><td class="num">${fmtS(mean)}</td><td class="num">${fmtS(wmean)}</td><td>${esc(hi)}</td><td>${esc(lo)}</td></tr>`).join('')}</tbody></table></div>`;

  $('#view').innerHTML = `<h2 class="sronly">Charts</h2>
    <div class="controls sticky"><span id="cregwrap">${regionPicker()}</span><span id="cctrywrap">${countryPicker()}</span><span id="ctierwrap">${tierPicker()}</span>${providerSelect('cpsel')}<span class="note" style="margin:0">${N.toLocaleString()} languages${P ? ` · ${esc(pn)}'s services only` : ''}</span>
      <button type="button" class="reset" id="cresetf"${!regionSel.size && !countrySel.size && !tierSel.size && !P ? ' hidden' : ''}>Reset filters</button></div>
    <section class="chart">
      <h3>How many languages each technology reaches today</h3>
      <div class="legend ord">${LV.map(([lv, lab]) => `<span><i class="sw" style="background:var(--ord-${lv})"></i>${esc(lab)}</span>`).join('')}</div>
      <div class="covrows">${rows.map(r => r.html).join('')}</div>
      ${absent.length ? `<p class="note">No ${esc(pn)} service tracked for: ${esc(absent.join(', '))}.</p>` : ''}
      ${P ? `<p class="note">${COUNTING_NOTE} <a href="#providers">How companies' languages are counted, and how to correct them</a>.</p>` : ''}

      <details class="tbl"><summary>Show as a table</summary>${table1}</details>
    </section>
    <section class="chart">
      <h3>How many speakers each technology reaches today</h3>
      <div class="legend ord">${LV.map(([lv, lab]) => `<span><i class="sw" style="background:var(--ord-${lv})"></i>${esc(lab)}</span>`).join('')}</div>
      <div class="covrows">${rowsS}</div>
      <details class="tbl"><summary>Show as a table</summary>${tableS}</details>
    </section>
    ${P && !Object.keys(H ? H.series : {}).some(k => SERIES_PROV[k] === provider) ? '' : `<section class="chart">
      <div class="plan-tablehead"><h3>How support has grown since 2019</h3><span class="chips" role="group" aria-label="Count">${[['langs', 'Languages'], ['speakers', 'Speakers']].map(([k, lab]) => `<button type="button" class="chip" data-hm="${k}" aria-pressed="${histMode === k}">${lab}</button>`).join('')}</span></div>
      ${multiples}
      <details class="tbl"><summary>Show as a table</summary>${table2}</details>
    </section>
    ${added ? `<section class="chart">
      <h3>When languages were added</h3>
      ${added}
    </section>` : ''}`}
    <section class="chart">
      <div class="plan-tablehead"><h3>Where each language stands</h3><span class="chips" role="group" aria-label="Which languages">${[['all', 'All languages spoken there'], ['home', 'Languages from the region']].map(([k, lab]) => `<button type="button" class="chip" data-sm="${k}" aria-pressed="${stripMode === k}">${lab}</button>`).join('')}</span></div>
      ${strip}
      <details class="tbl"><summary>Show as a table</summary>${stripTable}</details>
    </section>`;
  bindTips($('#view'));
  bindStrip();
  // keep the page where it is when a filter redraws the charts below
  const keep = f => e => { const y = scrollY; f(e.target.value); charts(); scrollTo(0, y); };
  wireMsel('cregwrap', regionPicker, regionSel, REGIONS.length, () => { const y = scrollY; charts(); reopen('cregwrap'); scrollTo(0, y); });
  wireCountries('cctrywrap', () => { const y = scrollY; charts(); reopenCountries('cctrywrap'); scrollTo(0, y); });
  wireMsel('ctierwrap', tierPicker, tierSel, TIER_KEYS.length, () => { const y = scrollY; charts(); reopen('ctierwrap'); scrollTo(0, y); });
  $('#cpsel').onchange = keep(v => { provider = v; });
  $('#view').querySelectorAll('[data-sm]').forEach(b => b.onclick = () => { const y = scrollY; stripMode = b.dataset.sm; charts(); scrollTo(0, y); });
  $('#view').querySelectorAll('[data-hm]').forEach(b => b.onclick = () => { const y = scrollY; histMode = b.dataset.hm; charts(); scrollTo(0, y); });
  $('#cresetf').onclick = () => { const y = scrollY; regionSel.clear(); countrySel.clear(); countryQuery = ''; tierSel.clear(); provider = 'All'; charts(); scrollTo(0, y); };
  pinBar($('.controls.sticky'));
}

// ---------------------------------------------------------------- map
// The map has the region, country and tier filters; the search box finds a language on it
function mapPage() {
  if (!GEO && window.LTDI_MAP_URL) {  // the map's file is still on its way: draw the page when it arrives
    $('#view').innerHTML = '<div id="mapwait" class="muted" role="status" style="min-height:70vh">Loading the map\u2026</div>';
    loadGeo();
    return;
  }
  const N = LANGS.filter(inView).length;
  $('#view').innerHTML = `<h2 class="sronly">Map</h2>
    <div class="controls sticky"><span id="mregwrap">${regionPicker()}</span><span id="mctrywrap">${countryPicker()}</span><span id="mtierwrap">${tierPicker()}</span><span class="note" style="margin:0">${N.toLocaleString()} languages</span>
      <button type="button" class="reset" id="mresetf"${!regionSel.size && !countrySel.size && !tierSel.size ? ' hidden' : ''}>Reset filters</button></div>
    ${mapSection()}`;
  bindTips($('#view'));
  bindMap();
  wireMsel('mregwrap', regionPicker, regionSel, REGIONS.length, () => { const y = scrollY; mapView = null; mapPage(); reopen('mregwrap'); scrollTo(0, y); });
  wireCountries('mctrywrap', () => { const y = scrollY; mapView = null; mapPage(); reopenCountries('mctrywrap'); scrollTo(0, y); });
  wireMsel('mtierwrap', tierPicker, tierSel, TIER_KEYS.length, () => { const y = scrollY; mapPage(); reopen('mtierwrap'); scrollTo(0, y); });
  $('#mresetf').onclick = () => { const y = scrollY; regionSel.clear(); countrySel.clear(); countryQuery = ''; tierSel.clear(); mapView = null; mapPage(); scrollTo(0, y); };
  $('#mmajors').onchange = e => { mapMajors = e.target.checked; const y = scrollY; mapPage(); scrollTo(0, y); };
  navBox('map', 'Find a language name or code');
  pinBar($('.controls.sticky'));
}

// ---------------------------------------------------------------- about
// What's tracked, the rule for including a service, and what's known to be missing
function inclusionSection() {
  const S = DATA.services;
  const by = role => S.filter(s => s.role === role);
  const companies = new Set(by('consumer').map(s => s.provider));
  const regional = new Set(by('regional').map(s => s.provider));
  return `<h3>What's included and why</h3>
    <p>The Index tracks ${by('consumer').length} commercial services from ${companies.size} companies (${[...companies].map(p => esc(PROV_ALL[p] || p)).join(', ')}), ${regional.size} regional providers that focus on languages the large platforms serve less (${[...regional].map(p => esc(PROV_ALL[p] || p)).join(', ')}), ${by('open').length} open models and tools, and ${by('measured').length} published LLM benchmark results. Every service, with what it counts for, is in <a href="${REPO_URL}/blob/main/config/services.csv" target="_blank" rel="noopener">config/services.csv</a>.</p>
    <p>A service is included when it's a product or open tool people and developers use across many languages, and its maker publishes an official list of the languages it supports (or, for a benchmark, results per language) that can be read, cited and re-checked. Lists are read from those official pages, not from testing the products, so a service that works in a language it doesn't list isn't counted for it. Regional providers are included for the languages they list, and count together as one extra service.</p>
    <p>Services known to be missing, because their makers publish no list of languages, include Samsung Keyboard, the Facebook, WhatsApp and Google Search interfaces, and models whose makers give a number of languages but no names (Gemma, Muse Glimmer, DeepSeek and Grok's chat). They'll be added where an official language list can be read reliably; to propose one, send a link to its official language list (see below).</p>`;
}
// How much ranks depend on the method's working choices (ltdi.sensitivity)
function stabilitySection() {
  const S = DATA.sensitivity;
  if (!S) return '';
  return `<h3>How stable the ranks are</h3>
    <p>The weights, goalposts and floor are working choices. To see how much the ranking depends on them, every language was re-scored ${S.draws.toLocaleString()} times with different choices drawn at random: each weight from half to one and a half times its value, each data goal up to ten times higher or lower, and the floor from 0.025 to 0.075. The table shows how far ranks move in 90% of these re-scorings.</p>
    <div class="tablebox"><table class="covtab"><thead><tr><th>Ranks</th><th class="num">Languages</th><th class="num">Typical range</th><th class="num">Within ±10% of rank</th></tr></thead>
    <tbody>${S.bands.map(b => `<tr><td>${esc(b.ranks)}</td><td class="num">${b.languages.toLocaleString()}</td><td class="num">${b.median_range.toLocaleString()} places</td><td class="num">${Math.round(b.within_10pct * 100)}%</td></tr>`).join('')}</tbody></table></div>`;
}
// How LTDI compares with Joshi et al.'s resource classes and SIL's Digital Language Support levels
// (tools/validate.py): a table per classification, with LTDI's median and tiers in each group, and
// the languages where the two disagree most
function validationSection() {
  const V = DATA.validation;
  if (!V) return '';
  const order = TIER_KEYS.map(([k]) => k);
  const tierBar = t => {
    const n = Object.values(t).reduce((a, b) => a + b, 0) || 1;
    return `<span class="vbar">${order.filter(k => t[k]).map(k => `<i style="width:${(t[k] / n * 100).toFixed(1)}%;background:var(${TIERC[k]})" title="${esc(TIER_LABEL[k])}: ${t[k]}"></i>`).join('')}</span>`;
  };
  const table = (v, head) => `<div class="tablebox"><table class="covtab vtab"><thead><tr><th>${head}</th><th class="num">Languages</th><th class="num">Median LTDI</th><th>LTDI tiers</th></tr></thead>
    <tbody>${v.groups.map(g => `<tr><td>${esc(g.label)}</td><td class="num">${g.n.toLocaleString()}</td><td class="num">${g.median_ltdi == null ? '–' : g.median_ltdi.toFixed(3)}</td><td>${tierBar(g.tiers)}</td></tr>`).join('')}</tbody></table></div>`;
  const dis = (v, what) => `<details class="covsvc vdis"><summary>Where they disagree most <span class="muted">· ${v.disagreements.length} languages</span></summary>
    <ul>${v.disagreements.map(x => `<li><span><a href="${LH(x.code)}">${esc(x.name)}</a> <span class="muted">${x.gap > 0 ? 'higher in LTDI' : 'lower in LTDI'}</span></span><b>${x.ltdi.toFixed(3)} · ${esc(TIER_LABEL[x.tier] || x.tier)} <span class="muted">vs ${esc(what(x.other))}</span></b></li>`).join('')}</ul></details>`;
  const J = V.joshi, D = V.dls, B = V.between;
  const pair = (a, b, r) => `<tr><td>${a}</td><td>${b}</td><td class="num">${r.toFixed(2)}</td></tr>`;
  return `<h3>How it compares with other classifications</h3>
    <p>Two earlier studies classify languages by their digital resources. LTDI broadly agrees with both: its median score never falls from one of their groups to the next. No two such measures agree exactly, since each draws on different, incomplete sources from a different year.</p>
    <h4>Joshi et al. (2020), resource classes</h4>
    <p class="note"><a href="${J.source}" target="_blank" rel="noopener">The State and Fate of Linguistic Diversity and Inclusion in the NLP World</a>: six classes by labelled and unlabelled data. ${J.n.toLocaleString()} ranked languages have a class; rank correlation with LTDI ${J.spearman.toFixed(2)}.</p>
    ${table(J, 'Class')}${dis(J, o => `class ${o}`)}
    <h4>Simons, Thomas and White (2022), Digital Language Support</h4>
    <p class="note"><a href="${D.paper}" target="_blank" rel="noopener">Assessing Digital Language Support on a Global Scale</a>: five levels from 143 tools' language lists, ${esc(D.as_of)}. Only a 10% sample is public (<a href="${D.source}" target="_blank" rel="noopener">sil-ai/dls-results</a>), of which ${D.n.toLocaleString()} languages match ranked ones; rank correlation with their score ${D.spearman.toFixed(2)}, with their level ${D.spearman_level.toFixed(2)}.</p>
    ${table(D, 'Level')}${dis(D, o => o)}
    ${B ? `<h4>All three compared</h4>
    <p>The useful question is whether LTDI differs from them more than they differ from each other. On the ${B.n} languages all three cover, LTDI agrees with each study more closely than the two studies agree with each other (rank correlations; 1 would be the same order):</p>
    <div class="tablebox vpair"><table class="covtab"><thead><tr><th>Measure</th><th>Compared with</th><th class="num">Correlation</th></tr></thead>
    <tbody>${pair('Joshi et al.', 'Digital Language Support', B.joshi_dls)}${pair('LTDI', 'Joshi et al.', B.ltdi_joshi)}${pair('LTDI', 'Digital Language Support', B.ltdi_dls)}</tbody></table></div>` : ''}`;
}
// How a service's languages are counted, said wherever a count appears (About, Charts, For providers)
const COUNTING_NOTE = "Each count is the number of distinct languages in the company's own published list, read from the page linked on every language's profile. A list often has several entries for one language: English for each country, a language in two scripts, or both a language and its varieties. Those count once here, so a count is usually lower than the company's own figure, which may count them separately.";
const CORRECTIONS_EMAIL = 'corrections@langtechindex.org';
const SUPPORT_EMAIL = 'support@langtechindex.org';
const INDEPENDENCE = "The Index is maintained by Sandy Ritchie, an independent researcher previously at Google and Google DeepMind. The Index has no funding from, and no affiliation with, any company or organisation whose products or data it tracks, and every company is counted by the same rules.";
// For providers: how a company's numbers are made, which companies count, and how to correct them
function providersPage() {
  const C = DATA.coverage || { tech: [] }, T = DATA.config.dimensions.tech.technologies;
  const role = r => ({ consumer: 'Major', regional: 'Regional', open: 'Open model', quality: 'Benchmark' })[r] || r;
  // LLM lists differ in kind (an app's interface languages, or a model's), so say which each is
  const kindOf = (label, name, prov) => { if (label !== T.llm.label) return '';
    const s = DATA.services.find(x => x.technology === 'llm' && x.role === 'consumer' && x.name === name && x.provider === prov);
    return s ? `<br><span class="muted small">${esc(s.kind)}</span>` : ''; };
  const rows = C.tech.filter(([, , svcs]) => svcs.some(x => x[2] !== 'quality')).map(([label, , svcs]) => svcs.filter(x => x[2] !== 'quality')
    .map(([name, prov, r, n, ent], i) => `<tr>${i ? '' : `<td rowspan="${svcs.filter(x => x[2] !== 'quality').length}">${esc(label)}</td>`}<td>${esc(name)}${prov && PROV_ALL[prov] && !name.includes(PROV_ALL[prov]) && prov !== 'open' ? ` <span class="muted">${esc(PROV_ALL[prov])}</span>` : ''}${kindOf(label, name, prov)}</td><td>${role(r)}</td><td class="num">${n.toLocaleString()}</td><td class="num">${ent > n ? ent.toLocaleString() : ''}</td></tr>`).join('')).join('');
  $('#view').innerHTML = `<article class="about">
    <h2>For providers</h2>
    <p class="lede">If your company makes a product the Index tracks, this page explains how its numbers are made and how to correct them.</p>
    <h3>How a product's languages are counted</h3>
    <p>${COUNTING_NOTE}</p>
    <p>Lists are read from the company's own public pages: most automatically, when the site is rebuilt, and a few by hand where no page can be read automatically. Each language's profile links the exact page each value comes from, with the date it was read. A product counts for a language when its list names the language, whatever it calls it; a list that names only a country (Siri's, say) counts the country's main language. A speech locale counts for a spoken variety only where the list names the variety: "Egyptian Arabic, ar-EG" counts for Egyptian Arabic, but "Arabic (Egypt), ar-EG" counts for Arabic.</p>
    <p>The Index counts what companies document, so a product whose languages aren't written down anywhere can't be counted, however widely it ships. Where no list exists, the Index uses the nearest official source: Android's languages are read from the translations in the Android Open Source Project, and Meta AI's from Llama 4's model card.</p>
    <h3>Published quality</h3>
    <p>Where a service's accuracy for a language has been measured independently of the company that makes it, in the last ${numWord(DATA.config.dimensions.tech.quality_max_age)} years, the measurement scales the service's credit, from half for poor results to full for good ones. Figures a company publishes about its own service are shown on each language's page but don't change scores, so publishing accuracy never costs a company anything, and figures older than ${numWord(DATA.config.dimensions.tech.quality_max_age)} years are left out.</p>
    <p>For LLMs, the count is the languages each company documents, from its official list: for some companies the languages of its chat app's interface, for others the languages its model supports, as each publishes them (the table below says which). A language-setting list names the languages an app's interface is translated into, and both companies that publish one say their assistants can be used in others too, so a language missing from it isn't counted against the app: it counts where it names a language and is left out where it doesn't. A model may also work, unevenly, in languages its company doesn't list; the Index counts what each company commits to, the one thing it can check the same way for every company.</p>
    <h3>Which companies count, and how</h3>
    <p>A service counts as major when its company sells it worldwide, rather than mainly in one country or region, and publishes a list of the languages it supports. Every such service the Index has found is tracked; if one is missing, say so (below) and it will be added from the next edition.</p>
    <p>For each technology, a language is widely available when at least half of the major services tracked offer it, or at least ${numWord(DATA.config.dimensions.tech.full_min)} of them do; the second test keeps the bar from rising each time another service is tracked. A widely available language counts as well served if it's comfortably Medium or above overall, with an LTDI of at least ${DATA.config.dimensions.tech.served_min}. Below that it also has to have the open data the technology is built from (for speech, at least 1,000 hours of open transcribed speech; for translation, a million sentence pairs; for LLMs, a billion words of web text), with no independent measurement in the last ${numWord(DATA.config.dimensions.tech.quality_max_age)} years showing poor accuracy for it. Every other language is underrepresented for that technology, so being listed by several companies doesn't by itself take a language off that list. Regional providers, which serve mainly one country or region, count together as one extra service where any of them offers a language. Open models count for less than commercial services, and never as a major service.</p>
    <div class="tablebox"><table class="covtab provtab"><thead><tr><th>Technology</th><th>Service</th><th>Counted as</th><th class="num">Languages</th><th class="num">Entries in its list</th></tr></thead><tbody>${rows}</tbody></table></div>
    <p class="note">Languages are counted among the ${(DATA.coverage || {}).n?.toLocaleString() || ''} ranked languages. Entries in a list are shown where they're known.</p>
    <h3>Correcting a count, or sending an updated list</h3>
    <p>If a product's row is wrong or out of date, or you've launched new languages, email <span class="email">${CORRECTIONS_EMAIL}</span> or <a href="${REPO_URL}/issues/new/choose" target="_blank" rel="noopener">open a correction on GitHub</a> with a link to the public page that lists them, and they'll be added. The page can be anything public and official: documentation, a help article or an announcement. A list sent as a spreadsheet or file is welcome too, as long as it matches what you publish, since every value on the site links to its public source. Updates go into the site as soon as they're checked, and into the next edition's archive.</p>
    <h3>What companies can do</h3>
    <ul>
      <li><b>Publish a complete language list for each product</b>, with a code for each entry (BCP-47, such as sw or ar-EG) and the variety's name where a locale is a distinct variety ("Egyptian Arabic", not "Arabic (Egypt)"). A machine-readable table on a documentation page is easiest to keep in step with launches.</li>
      <li><b>Say what each list means:</b> the languages a model is meant to work in, the languages an app's interface is translated into, or both.</li>
      <li><b>Publish per-language accuracy on a public test set</b>, such as FLEURS for speech or FLORES-200 for translation, and better still have it measured independently. Only independent figures change scores, but your own help users judge where a product is ready.</li>
      <li><b>Look at the gaps.</b> The Opportunities page lists, for each language, the services that don't offer it yet and the open data that could get them started; filter it by company to see your own.</li>
      <li><b>Release data and models openly.</b> Open speech, text and evaluation data for underrepresented languages raise every company's starting point, and count towards the data dimension for those languages.</li>
    </ul>
    <p>Every change to the data, including each correction, is in the repository's public history, with its source.</p>
    <h3>Who makes the Index</h3>
    <p>${INDEPENDENCE} The method is open: the code, every value with its source, and every past edition are on <a href="${REPO_URL}" target="_blank" rel="noopener">GitHub</a>, so any count can be checked or reproduced.</p>
  </article>`;
}
// What the Index is for, how far each source reaches, and the limits of the data, sources and views
const REPO_URL = 'https://github.com/sandyfritchie/ltdi';
// The database download (ltdi/export.py writes the files and data/database.json when the site is published)
const DB_TABLES = [
  ['languages', 'One row per language or variety: codes, names, speakers, countries, scripts, endangerment'],
  ['technologies', 'The technologies tracked'],
  ['services', 'Each product, open model and benchmark result checked, with its maker and where its list is read'],
  ['service_languages', 'Which service offers which language, with the page it was read from, the date, and any published quality figure'],
  ['datasets', 'Each dataset: what it holds, who shares it, its licence, whether it allows commercial use'],
  ['dataset_languages', 'How much of each dataset each language has, how that was counted, and where to get it'],
  ['language_facts', 'Every other recorded value: Wikipedia, Hugging Face, fonts, Unicode, service features, connectivity'],
  ['not_collected', "Values the Index didn't collect for a language, so their absence means nothing"],
  ['indicators', 'What each value means, its unit, and the table it is in'],
];
let DB_INFO = null;
const dbCite = () => `Ritchie, Sandy (${DATA.edition.slice(0, 4)}). Language Technology Development Index (LTDI) database, edition ${DATA.edition}. https://langtechindex.org/#download`;
function downloadPage() {
  const ed = DATA.edition, csvFile = `data/ltdi-database-${ed}.zip`, sqlFile = `data/ltdi-database-${ed}-sqlite.zip`;
  const mb = b => b ? `${(b / 1e6).toFixed(1)} MB` : '';
  const fill = () => {
    if (!DB_INFO || curRoute() !== 'download') return;
    const rows = Object.fromEntries(DB_INFO.tables.map(t => [t.name, t]));
    for (const el of document.querySelectorAll('[data-db-rows]')) el.textContent = (rows[el.dataset.dbRows]?.rows ?? '').toLocaleString();
    for (const el of document.querySelectorAll('[data-db-size]')) el.textContent = mb(DB_INFO[el.dataset.dbSize]?.bytes);
    for (const el of document.querySelectorAll('[data-db-cols]')) {
      const t = rows[el.dataset.dbCols];
      el.innerHTML = t ? `<div class="tablebox"><table class="covtab dbcols"><thead><tr><th>Column</th><th>Type</th><th>Meaning</th></tr></thead><tbody>${t.columns.map(c => `<tr><td><span class="code">${esc(c.name)}</span></td><td class="muted">${esc(c.type)}</td><td>${esc(c.description)}</td></tr>`).join('')}</tbody></table></div>` : '';
    }
  };
  $('#view').innerHTML = `<article class="about dbpage">
    <h2>Download the database</h2>
    <p class="lede">Every data point the Index records, as plain tables for your own analysis or for finding data to build with: which products and open models support each language, what open data exists for it and where to get it, and the other facts on each language's page, each with its source and date.</p>
    <div class="dbfiles">
      <a class="dbfile" href="${csvFile}" download><span class="dbfmt">CSV</span><span><b>Tables as CSV files</b><br><span class="muted small">One file per table, with a README describing every column and a Data Package description · zip, <span data-db-size="csv"></span></span></span></a>
      <a class="dbfile" href="${sqlFile}" download><span class="dbfmt">SQL</span><span><b>One SQLite database</b><br><span class="muted small">The same tables, indexed, for SQL or any SQLite tool · zip, <span data-db-size="sqlite"></span></span></span></a>
    </div>
    <p class="muted small">Edition ${esc(ed)}, rebuilt with every edition. Licensed <a href="https://creativecommons.org/licenses/by-sa/4.0/" target="_blank" rel="noopener">CC BY-SA 4.0</a>, like the rest of the site's data. The Index's own scores aren't in it: they're in the <a href="#about">scores table on the About page</a>.</p>
    <h3>What's in it</h3>
    <div class="tablebox"><table class="covtab dbcols"><thead><tr><th>Table</th><th class="num">Rows</th><th>Each row</th></tr></thead><tbody>
      ${DB_TABLES.map(([t, d]) => `<tr><td><span class="code">${t}</span></td><td class="num" data-db-rows="${t}"></td><td>${d}</td></tr>`).join('')}
    </tbody></table></div>
    <p>Every table joins to <span class="code">languages</span> on the language's code, the same one in each language page's address. The columns of each table:</p>
    ${DB_TABLES.map(([t]) => `<details class="prov"><summary><span class="code">${t}</span></summary><div data-db-cols="${t}"></div></details>`).join('')}
    <h3>Getting the data itself</h3>
    <p>For each dataset and language, <span class="code">dataset_languages</span> says where to get it: <span class="code">repository</span> names where it's hosted (<span class="code">huggingface:google/fleurs</span>, <span class="code">commonvoice</span>, <span class="code">openslr</span>, <span class="code">mozilladatacollective</span>, or a website), <span class="code">subset</span> is what that repository calls the language (a Hugging Face config such as <span class="code">ha_ng</span>, a folder, a locale, or a download address), and <span class="code">access_url</span> is a page to start from. With the Hugging Face <span class="code">datasets</span> library, a repository and subset load as <span class="code">load_dataset("google/fleurs", "ha_ng")</span>. Some datasets ask you to accept their terms on their page first, and each keeps its own licence: check <span class="code">datasets.licence</span> and the dataset's own page before you use it. Datasets sold or shared under a data licence agreement are listed with <span class="code">access</span> set to <span class="code">licence</span> and aren't counted in the Index.</p>
    <p>For example, every openly licensed speech dataset for Hausa that permits commercial use, largest first:</p>
    <pre class="dbcode">SELECT d.name, dl.amount, dl.unit, d.licence, dl.repository, dl.subset
FROM dataset_languages dl JOIN datasets d ON d.id = dl.dataset
WHERE dl.language = 'ha' AND d.category = 'speech'
  AND d.counted AND d.commercial_use = 'yes'
ORDER BY dl.amount DESC;</pre>
    <p>Or, in Python with pandas, the languages with more than 100 hours of open speech and no speech recognition from a major company:</p>
    <pre class="dbcode">import pandas as pd
t = lambda n: pd.read_csv(f"ltdi-database-${esc(ed)}/{n}.csv")
langs, facts, svc, offers = t("languages"), t("language_facts"), t("services"), t("service_languages")
hours = facts[facts.indicator == "open_speech_hours"].set_index("language").value
major_asr = svc[(svc.technology == "speech_input") &amp; (svc.role == "consumer")].id
served = set(offers[offers.service.isin(major_asr) &amp; (offers.listing == "listed")].language)
print(langs[langs.code.map(hours).gt(100) &amp; ~langs.code.isin(served)][["code", "name", "speakers"]])</pre>
    <h3>Reading it carefully</h3>
    <ul>
      <li>A language with no row in <span class="code">service_languages</span> for a service isn't in that service's list. A language with no row in <span class="code">dataset_languages</span> for a dataset has none of it, or none the Index could find. Where a value wasn't collected for a language at all, <span class="code">not_collected</span> says so.</li>
      <li>Amounts are as each source states them or as the Index measured them, and <span class="code">how_counted</span> says which: <span class="code">measured</span> from every clip or document, <span class="code">sampled</span> from a sample and scaled up, <span class="code">published</span> by the dataset's makers, <span class="code">listing</span> read from a catalogue's text, or <span class="code">counted</span> from the source's own files.</li>
      <li>Datasets overlap: some are collections of others, and the same recordings can appear in more than one. The <span class="code">open_speech_hours</span> value in <span class="code">language_facts</span> is the Index's own total with known overlaps removed, so use it rather than summing a language's rows.</li>
      <li>A service's list counts what the company documents, not how well the service works. Where a list names only a country locale, the row is marked <span class="code">listed_as_standard</span> and counts for the standard language, not for the variety. Published quality figures are in <span class="code">result</span>, with who measured them and when.</li>
      <li>Values come from the sources named in each row, read on the date in <span class="code">retrieved</span>. Corrections are welcome: see <a href="#about">About</a>.</li>
    </ul>
    <h3>Cite</h3>
    <p class="cite">${esc(dbCite())}</p>
  </article>`;
  if (DB_INFO) fill();
  else fetch('data/database.json').then(r => r.ok ? r.json() : null).then(j => { if (j) { DB_INFO = j; fill(); } }).catch(() => {});
}
const citeText = () => `Ritchie, Sandy (${DATA.edition.slice(0, 4)}). Language Technology Development Index (LTDI), edition ${DATA.edition} (methodology ${DATA.config.meta.methodology_version}). https://langtechindex.org`;
function about() {
  const C = DATA.coverage || { n: LANGS.length, meta: [], data: [], tech: [] }, N = C.n;
  const pct = n => { const p = n / N * 100; return p > 0 && p < 1 ? '<1%' : Math.round(p) + '%'; };
  const row = (label, n, extra = '') => `<tr><td>${label}</td><td class="num">${n.toLocaleString()}</td>
    <td class="covbar"><span style="width:${Math.max(n ? 0.6 : 0, n / N * 100).toFixed(2)}%"></span></td><td class="num pct">${pct(n)}</td>${extra}</tr>`;
  const table = (rows, head = 'Source') => `<div class="tablebox"><table class="covtab"><thead><tr><th>${head}</th><th class="num">Languages</th><th class="covbar"><span class="sronly">Share of languages</span></th><th class="num">Share</th></tr></thead>
    <tbody>${rows}</tbody></table></div>`;
  const ROLE = { consumer: '', open: 'open', regional: 'regional', quality: 'quality measured' };
  const techRows = C.tech.map(([label, any, svcs]) => `<tr class="grp"><td><details class="covsvc"><summary>${esc(label)} <span class="muted">· any service</span></summary>
      <ul>${svcs.map(([name, prov, role, n, ent]) => `<li><span>${esc(name)}${prov && PROV_ALL[prov] && !name.includes(PROV_ALL[prov]) && prov !== 'open' ? ` <span class="muted">${esc(PROV_ALL[prov])}</span>` : ''}${ROLE[role] ? ` <span class="tag">${ROLE[role]}</span>` : ''}</span><b>${n.toLocaleString()}${ent > n ? ` <span class="muted" title="Entries in the company's own list, where several can be one language">of ${ent.toLocaleString()} entries</span>` : ''}</b></li>`).join('')}</ul></details></td>
    <td class="num">${any.toLocaleString()}</td><td class="covbar"><span style="width:${(any / N * 100).toFixed(2)}%"></span></td><td class="num pct">${pct(any)}</td></tr>`).join('');
  const nArea = (C.meta.find(m => /Area on the map/.test(m[0])) || [0, 0])[1];
  $('#view').innerHTML = `<article class="about">
    <h2>About the Index</h2>
    <p class="lede">The Language Technology Development Index tracks how well technology supports each of the world's languages, and how much data exists to build more. This edition, ${esc(DATA.edition)} (method version ${esc(DATA.config.meta.methodology_version)}), covers ${LANGS.length.toLocaleString()} living languages, each scored from 0 to 1 on two dimensions, data and technology, and placed in a tier.</p>
    <h3>What it's for</h3>
    <ul class="aims">
      <li><b>The whole picture.</b> Every language with a record, not only the hundred or so that technology companies and benchmarks usually report on, so the gap between the best- and least-served languages is visible.</li>
      <li><b>Gaps you can act on.</b> Which technologies, services and kinds of data a language lacks, one language at a time, with the Opportunities pages suggesting where builders, researchers and funders could make the most difference.</li>
      <li><b>Speakers, not just languages.</b> How many people each language reaches, where they live and how many are online, so the views can be weighed by people as well as by languages.</li>
      <li><b>Checkable.</b> Every value on a language's page links to its source, and the code and data are open on <a href="${REPO_URL}" target="_blank" rel="noopener">GitHub</a>.</li>
      <li><b>Change over time.</b> Where a source keeps a record, the Charts show how support has grown since 2019.</li>
    </ul>
    <h3>How a language is scored</h3>
    <p>Each dimension averages a few indicators, each scaled from 0 to 1 between a floor and a goal (most on a logarithmic scale, so the first thousand sentences count for more than the millionth). The two are combined with a geometric mean, LTDI = √(data × technology), as in the UN's Human Development Index, so a gap in either pulls the score down: a language with excellent data but no keyboard can't score highly. A technology scores by the share of the services checked that offer the language, weighted by how fully each does (features, voice types, published error rates), with open models counting for less than commercial services. Locale data (CLDR's dates, numbers and names, which software needs before it can support a language) counts as a technology; voice assistants count half as much as other technologies, since an assistant is built mostly from speech-to-text, text-to-speech and language models, which are already counted. Whether a language's script is encoded in Unicode is reported but not scored, as nearly every recorded script is.</p>
    <p>Each dimension has a floor of ${DATA.config.meta.floor}, so a language with nothing recorded in one still has a score, but ranks use the unfloored values: any language with something recorded ranks above every language with nothing, and a language's page shows its score before the floor where the floor lifts it.</p>
    <p>The top three tiers are set by score: ${DATA.config.tiers.cutoffs.map(([, t, c]) => `${t} from ${c}`).join(', ')}. Below Medium, where scores are close together and small differences mean little, a language's tier says what's recorded for it: ${DATA.config.tiers.stages.map(([, t, d]) => `<b>${esc(t)}</b>, ${esc(d.charAt(0).toLowerCase() + d.slice(1))}`).join('; ')}. These stages say what exists, not how much, so they aren't ordered by score: a language with open tools only can outscore one with a single commercial service.</p>
    <p>A spoken variety whose speakers typically write a standard language (Swiss German, Kölsch and Egyptian Arabic, say) is scored and ranked on what exists for it alone. Its page also gives a second score counting the standard's written data and text technologies, which most of its speakers can use, and marks those values “through” the standard. Dari and Southern Pashto are the exceptions: their written form is the standard itself (Persian as written in Afghanistan, standard Pashto), which sources label as Persian and Pashto, so those resources count as their own.</p>
    <h3>Why something is missing for a language</h3>
    <p>Most sources cover only a small share of the world's languages, so most values on most pages are missing. A missing value nearly always means a source doesn't list or measure the language, not that the language has nothing: a language may have speech data in an archive no source here counts, or a keyboard that isn't in any app store. These are the ${N.toLocaleString()} ranked languages each source covers.</p>
    <h4>Language information</h4>
    ${table(C.meta.map(([l, n]) => row(esc(l), n)).join(''), 'What the page shows')}
    <h4>Data</h4>
    ${table(C.data.map(([l, n]) => row(esc(l), n)).join(''), 'Indicator')}
    <h4>Technology</h4>
    ${table(techRows, 'Technology')}

    <h3>The Plan tab's columns</h3>
    <p>Online in 5 years is the number of a language's speakers expected to be online in five years (for text technologies, online and able to text), with their share of its speakers. Countries are ISO 3166 codes, most speakers first, leaving out countries where only immigrant communities speak it, so the code, script and a country give a locale (pnb-Arab-PK).</p>
    <p>Open models are those listed for the language; † marks a licence that doesn't permit commercial use, and the commercial-use switch leaves them out. Their makers publish quality figures, each on their own test data, which say too little to compare languages by, so they aren't shown.</p>
    <p>Speech is counted in hours of transcribed speech in the open datasets tracked, in three kinds. Read: Common Voice, Kathbath, NaijaVoices, Multilingual LibriSpeech, NCHLT Speech, and read speech shared on the Mozilla Data Collective (BibleTTS, Digital Divide Data and others). Spontaneous, people speaking in their own words: Common Voice Spontaneous Speech, WAXAL, AfriVoice, WaZoBiaSpeech, IndicVoices, SPRING-INX, Vaani. Media: Shrutilipi's radio news, VoxPopuli's European Parliament speeches, and YouTube videos with their uploaders' subtitles in YODAS2, counted by the share of a sample of subtitles that is in the language. Total hours adds the three. A tick under FLEURS test set means the language is one of the 102 in FLEURS, Google's public test set of about 12 hours of read speech a language; it stays out of training, so it doesn't count towards the data target.</p>
    <p>Sentence pairs with English are those in OPUS, plus those professionally translated for Google's SMOL and GATITOS. Words of web text are those in FineWeb-2, or MADLAD-400 or HPLT 3.0 where one holds more. Short of the target is how many more are needed to reach the data target chosen. With the commercial-use switch on, only speech datasets whose licence permits commercial use are counted; OPUS corpora carry their own licences, which aren't checked.</p>
    <p>The CSV adds each language's readiness and the commercial services that offer it.</p>
    <h3>Caveats and shortcomings</h3>
    <h4>Languages and speakers</h4>
    <ul>
      <li>The list of languages, their codes, names, countries, speaker counts, scripts and endangerment levels come from <a href="https://github.com/google-research/url-nlp/tree/main/linguameta" target="_blank" rel="noopener">LinguaMeta</a>, which brings together several sources of different dates. Speaker counts for widely used languages often include second-language speakers (English's 1.27 billion), and for others only first-language speakers, so they aren't strictly comparable.</li>
      <li>What counts as a language follows LinguaMeta, by ISO 639-3 code. Some macrolanguages are scored as one language (Arabic, Swahili, Persian), with a note on the language's page; spoken varieties whose speakers write a standard language (Yue Chinese and Mandarin, say) are ranked on their own resources, with a second score counting the standard's.</li>
      <li>Without a speaker count, a language's opportunities can't be ranked by reach.</li>
      <li>Endangerment levels sometimes belong to a minority variety rather than the whole language; clear cases are corrected. A language listed as extinct with no speakers recorded keeps its page but is left out of the ranking, totals and charts.</li>
    </ul>
    <h4>Countries</h4>
    <ul>
      <li>LinguaMeta lists the languages traditionally spoken in each country. Immigrant and diaspora languages come from national censuses: the UN Statistics Division's census tables and, for the United States, the American Community Survey. Many countries with large immigrant communities have no usable census figures on language (France, Germany, Spain, Italy, the Netherlands, the Gulf states, Japan, Brazil and Nigeria among them), so their views show only the languages LinguaMeta lists; a note says so when one is chosen.</li>
      <li>Censuses ask different questions (mother tongue, language spoken at home, main language), some are old, and some group languages ("Chinese"), so census counts aren't comparable between countries. They change only the country and region views, never the scores.</li>
    </ul>
    <h4>Data</h4>
    <ul>
      <li>Web-crawled text for underrepresented languages is often not in the language at all (Kreutzer et al., 2022). FineWeb-2 filters by language identification, MADLAD-400's authors checked a sample of every language by hand, and HPLT 3.0's language labels aren't audited, so the Index checks a sample of each of its languages with GlotLID and counts only the share in the language (it counts whichever of the three holds most for a language, never more than one); text mostly from Bible sites counts for less; OPUS's web-mined corpora are checked by language identification on a random sample, which catches the wrong language but not poor translations, so OPUS counts are an upper bound. Google's SMOL and GATITOS, translated by professionals for languages with little else, count in full.</li>
      <li>Wikipedia article counts include bot-generated stubs, so articles count only up to a limit per active editor. Hugging Face datasets are counted by their language tags, and datasets tagged with dozens of languages count in part.</li>
      <li>Open speech hours add up datasets of very different kinds: read speech, crowd-sourced recordings and video with uploaded subtitles. An hour of one person reading the Bible in a studio counts the same as an hour of many people talking about their day. Each language's page lists where its hours come from, under Sources, dates and notes, and how each figure was obtained: measured from the audio, as the makers publish it, or read from a listing. Only transcripts made or corrected by people count: hours transcribed by a model (GigaSpeech 2, WenetSpeech, YouTube's automatic captions, model-labelled sets) are left out. Datasets shared on the Mozilla Data Collective count with the hours each states, and only where they're free to download under an open or non-commercial licence; those sold for a fee or under a data licence agreement are listed on each language's page but not counted, as are corpora sold by other distributors, such as the Linguistic Data Consortium and ACLCLP.</li>
      <li>Font support is checked but not scored: Noto displays nearly every language whose letters are known.</li>
    </ul>
    <h4>Technology</h4>
    <ul>
      <li>Coverage is read from each company's published language lists, which can lag behind or run ahead of what a product actually does, and "supported" means different things to different vendors. A few lists are read by hand where no page could be read automatically.</li>
      <li>Quality is published for few languages. Only results measured independently of the service's maker, in the last ${numWord(DATA.config.dimensions.tech.quality_max_age)} years, change scores: a weak result counts for less, down to half. Elsewhere a listed service counts in full, however well it works. Companies' own figures and older results are shown on language pages but not scored. So for most services and languages the Index records whether a language is offered, not how well it works.</li>
      <li>LLM support means the languages each company documents for its chat app (ChatGPT, Gemini, Copilot), from its official list. A model may also work, unevenly, in languages its list doesn't name; the Index counts what each company commits to, which it can check the same way for every company.</li>
      <li>Regional providers count together as one extra service, and only for the languages they offer.</li>
      <li>Voice assistants count each company's assistant across its old and new generations: Google Assistant or Gemini for Home on speakers and displays, Siri, and Alexa or Alexa+. Gemini for Home and Alexa+ are in early access and so far cover only languages the older assistants already had. Amazon publishes no language list for Alexa+, so its languages are the ones Amazon's launch announcements name, or a country's main language where they name only the country. The row counts half as much as other technologies.</li>
      <li>LLM quality that changes scores comes from AfroBench's independent translation results for GPT-4o and Gemini 1.5 Pro (2025), each for one model at one time, so newer models may do better. Companies' own results, such as Claude Fable 5.2 on Global-MMLU (2026) and OpenAI o3 on MMMLU (2025), are shown but not scored.</li>
      <li>Speech services name varieties by country (ar-EG), so a speech locale counts for a spoken variety only where the service names the variety too ("Egyptian Arabic"); otherwise it counts for the standard language, as text services do, and the variety's page marks the service "listed as" the standard language.</li>
    </ul>
    <h4>Reach</h4>
    <ul><li>People online and able to text are estimated from the World Bank's national averages for each country a language is spoken in, which overstate connectivity for rural and minority-language speakers.</li></ul>
    <h4>Maps</h4>
    <ul>
      <li>Language areas come from Glottography's digitisation of Asher and Moseley's <i>Atlas of the World's Languages</i> (2007), drawn for a world map, so they're coarse and many overlap; ${nArea.toLocaleString()} languages have one. For ${officialNames() || 'a few languages'}, whose countries the atlas fits poorly, the areas are where they're official, from Wikipedia's list via Glottography.</li>
      <li>On the Languages map, each language is a single dot at a point LinguaMeta gives for it, so a language spoken across several countries appears in only one of them.</li>
      <li>The share of land in each tier counts, in each place, the best-covered language spoken there, so it shows where people can find some technology in a language they speak, not that everyone there can.</li>
    </ul>
    <h4>Language pages</h4>
    <ul><li>The writing sample is Article 1 of the Universal Declaration of Human Rights where there's a translation; the spoken words are volunteers' recordings for Lingua Libre, chosen automatically, so a name or an unusual word sometimes gets through.</li></ul>
    <h4>Opportunities</h4>
    <ul><li>Opportunities are gaps in the sources tracked here, ranked by the impact on the community if the technology existed: how many people could use it, how big the gap is and the technology's weight in the index. Each also has an effort size, S to XL, from the open models, data and test sets available for the language. The sizes are rough guides, not estimates, and a gap may already be filled by something no source here records.</li>
      <li>The Plan tab ranks the languages a product doesn't yet support by the people they'd reach online in five years. That's an estimate from LinguaMeta's speaker counts and national connectivity averages, so it favours large languages and overstates reach in rural areas; it says nothing about demand, cost or competition. "Commercially usable" follows each dataset's and model's published licence, and isn't legal advice.</li>
      <li>Each kind of opportunity is suggested only where its first step is possible: text technologies and benchmarks need some written text, a Wikipedia card needs a Wikipedia. A language with nothing recorded gets a single card about documentation and first recordings with its speakers. Before a language is chosen, the list shows at most two cards per language.</li></ul>

    ${stabilitySection()}
    ${validationSection()}
    ${inclusionSection()}
    <h3>Independence and accuracy</h3>
    <p>${INDEPENDENCE} It's offered as a way to explore the current state of technology and data for the world's languages, not as an authoritative record. There are very likely mistakes and omissions: it brings together only what could be found in open repositories and public documentation, and much work on many languages isn't published in either. For more detail on any language, follow the links to the source material on its page, or do your own research.</p>
    <h3>Corrections and feedback</h3>
    <p>If you spot a mistake, work on a product whose row is out of date, or know of a source we've missed, please email <span class="email">${CORRECTIONS_EMAIL}</span>, or, if you'd rather it be public, <a href="${REPO_URL}/issues/new/choose" target="_blank" rel="noopener">open an issue on GitHub</a> using the correction or new-source form. A link to the page that documents the change is the quickest way to get it fixed; corrections go into the next build with the source cited. Companies whose products are tracked will find how their numbers are made on the <a href="#providers">For providers</a> page. For anything else, email <span class="email">${SUPPORT_EMAIL}</span>.</p>
    ${PATHS && window.goatcounter ? `<h3>Privacy</h3>
    <p>The site counts visits with <a href="https://www.goatcounter.com" target="_blank" rel="noopener">GoatCounter</a>, which sets no cookies and records no personal information: only which page was opened, the referring site, and the browser, screen size and country in general terms. Nothing else is collected.</p>` : ''}

    <h3>Download and cite</h3>
    <p><b><a href="#download">Download the whole database</a></b>: every recorded value, with its source, and where to get each dataset, as CSV files or one SQLite file.</p>
    <p>The scores for this edition are a <a href="data/ltdi-${DATA.edition}.csv" target="_blank" rel="noopener">CSV file</a>: one row per language, with its rank, tier, both dimensions before and after the floor, each technology's score, and, for spoken varieties, the score through their written standard (<a href="data/ltdi-${DATA.edition}.json" target="_blank" rel="noopener">column descriptions and the method's hashes</a>). A second <a href="data/ltdi-${DATA.edition}-services.csv" target="_blank" rel="noopener">services table</a> gives, for every language, what each service and benchmark tracked records: 1 where it's offered, 0 where it isn't, or the measured result. Every value with its source, date and note is in the repository's <a href="${REPO_URL}/tree/main/data/records" target="_blank" rel="noopener">data/records</a> folder, and every edition in <a href="${REPO_URL}/tree/main/data/editions" target="_blank" rel="noopener">data/editions</a>, so editions can be compared. The data is licensed <a href="https://creativecommons.org/licenses/by-sa/4.0/" target="_blank" rel="noopener">CC BY-SA 4.0</a> and the code MIT.</p>
    <p class="cite">${esc(citeText())}</p>
    <h3>Data for your own tools</h3>
    <p>Each language is also a JSON file at a stable address, such as <span class="code">https://langtechindex.org/api/v1/languages/yo.json</span>, with its scores, the technologies and services that cover it, every recorded value with its source, its countries and locales, family, engineering flags and opportunities. <span class="code">api/v1/index.json</span> lists every language, and <span class="code">api/v1/schema.json</span> describes the files. Within version 1, fields are only added, never renamed or removed; values change with each edition, and a change of method raises the methodology version. Anything that would break a reader goes to version 2, with version 1 kept beside it for at least one edition.</p>
    <h3>Sources and credits</h3>
    <p>Language metadata from LinguaMeta, with scripts from <a href="https://github.com/WPoelman/qwanqwa" target="_blank" rel="noopener">QQ</a> (CC BY-SA 4.0, so data derived from it carries the same licence), endangerment from Glottolog where LinguaMeta gives none, and speaker counts from Wikipedia where neither does. Census figures from the UN Statistics Division, the US Census Bureau and national statistics offices; connectivity from the World Bank. Language areas from <a href="https://glottography.github.io" target="_blank" rel="noopener">Glottography</a> (CC BY 4.0); map from Natural Earth. Writing samples from <a href="https://github.com/eric-muller/udhr" target="_blank" rel="noopener">UDHR in XML</a>; spoken words from <a href="https://lingualibre.org" target="_blank" rel="noopener">Lingua Libre</a>, recorded by volunteers and shared on Wikimedia Commons under <a href="https://creativecommons.org/licenses/by-sa/4.0/" target="_blank" rel="noopener">CC BY-SA 4.0</a>. Every other value names its source on the language's page. The method builds on van Esch, Ritchie et al. (2024), <a href="https://aclanthology.org/2024.lrec-main.331/" target="_blank" rel="noopener">Connecting Language Technologies with Rich, Diverse Data Sources Covering Thousands of Languages</a>.</p>
  </article>`;
}

// ---------------------------------------------------------------------------------------- Plan ---
// Which languages next for a product: choose a technology and a starting point (nothing, a tracked
// service's list, or a pasted list); the languages not yet supported are ranked by the people they
// would reach online in five years, with what already exists for each, and a curve of the share of
// people reached as they're added. State lives in the address (#plan?t=...&from=...), so a plan can
// be shared.
const PLAN_TECHS = ['speech_input', 'tts', 'mt', 'llm', 'keyboard', 'interface', 'ocr', 'proofing', 'assistant'];
const PLAN_VOICE = new Set(['speech_input', 'tts', 'assistant']);
let plan = { t: 'speech_input', from: 'none', codes: '', ex: true, com: false, q: 'all', s: 'reach', d: 0, fam: -1, n: 50, tg: 0 };
// The data target: how much open data each language should have, in orders of magnitude of the unit the
// Open data column counts for the technology (0 in plan.tg: the technology's default)
const PLAN_TARGETS = {
  hours: { opts: [10, 100, 1e3, 1e4, 1e5, 1e6], def: 1e3, label: 'transcribed hours' },
  pairs: { opts: [1e4, 1e5, 1e6, 1e7, 1e8, 1e9], def: 1e6, label: 'sentence pairs with English' },
  words: { opts: [1e6, 1e7, 1e8, 1e9, 1e10, 1e11], def: 1e8, label: 'words of web text' },
};
const planUnit = t => PLAN_VOICE.has(t) ? 'hours' : t === 'mt' ? 'pairs' : 'words';
const planTarget = () => { const U = PLAN_TARGETS[planUnit(plan.t)]; return U.opts.includes(plan.tg) ? plan.tg : U.def; };
const magn = n => n >= 1e9 ? `${n / 1e9} billion` : n >= 1e6 ? `${n / 1e6} million` : n.toLocaleString();
const SPEECH_KIND_LABELS = ['read', 'spontaneous', 'media', 'test set'];
const hShort = h => h >= 10 ? Math.round(h).toLocaleString() : (+h).toFixed(1).replace(/\.0$/, '');
// Open speech hours by kind ([read, spontaneous, media, test set]), following the
// commercial-use switch; training hours leave out benchmarks, which should stay out of training
const speechKinds = l => (plan.com ? l.skc || l.sk : l.sk) || (l.sh ? [l.sh, 0, 0, 0] : [0, 0, 0, 0]);
const trainHours = k => k[0] + k[1] + k[2];
// The datasets behind one kind's hours, for the cell's hover text: name, hours and licence, largest first
function speechSources(l, kind) {
  return Object.entries(l.sd || {}).filter(([i]) => DATA.speech_kind[i] === kind && !(plan.com && RES[i] && RES[i].commercial !== 'yes'))
    .sort((a, b) => b[1] - a[1])
    .map(([i, v]) => { const R = RES[i] || {}; return `${R.name || i}: ${i === 'speech_fleurs' ? 'about ' : ''}${hShort(v)} hours${R.licence ? `, ${R.licence}` : ''}${R.commercial === 'no' ? ' (not for commercial use)' : ''}`; })
    .join('\n');
}
// No quality figures in the table: those published are each the makers' own, on their own test data, and
// say too little to compare languages by (a column per technology could go here: [indicator, label, format])
const PLAN_QCOL = {};
const PLAN_SHORT = { asr_open_omnilingual: 'OASR' };  // short names in the narrow models column
const planQual = l => { const Q = PLAN_QCOL[plan.t], v = Q && l.qv && l.qv[Q[0]]; return v != null ? Q[2](v) : '—'; };
const PLAN_Q = { asr_open_whisper: ['asr_whisper_fleurs_wer', v => `${Math.round(v)}% WER`], asr_open_omnilingual: ['asr_omnilingual_cer', v => `${v < 1 ? v.toFixed(1) : Math.round(v)}% CER`],
  mt_open_nllb: ['mt_nllb_flores_chrf', v => `chrF ${Math.round(v)}`] };
function planFromHash(h) {
  // A link with its settings (t=...) sets them all, a setting left out being the default, so a shared
  // link shows the same table to everyone; a bare #plan (the tab) keeps the settings already chosen
  const q = new URLSearchParams((h.split('?')[1]) || ''), full = q.has('t');
  if (q.get('t') && PLAN_TECHS.includes(q.get('t'))) plan.t = q.get('t');
  if (q.get('from')) plan.from = q.get('from'); else if (full) plan.from = 'none';
  if (q.has('codes') || full) plan.codes = q.get('codes') || '';
  if (q.has('ex') || full) plan.ex = q.get('ex') !== '0';
  if (q.has('com') || full) plan.com = q.get('com') === '1';
  plan.fam = q.has('fam') && q.get('fam') in GN_BY ? GN_BY[q.get('fam')] : -1;
  plan.s = q.get('s') in PLAN_SORTS ? q.get('s') : 'reach'; plan.d = q.get('d') === 'asc' ? 1 : q.get('d') === 'desc' ? -1 : 0;
  plan.q = 'all';
  if (q.has('tg') || full) plan.tg = +q.get('tg') || 0;
  if (q.has('r') || full) { regionSel.clear(); (q.get('r') || '').split('|').filter(r => REGIONS.includes(r)).forEach(r => regionSel.add(r)); }
  if (q.has('c') || full) { countrySel.clear(); (q.get('c') || '').split(',').filter(c => COUNTRY_NAMES[c]).forEach(c => countrySel.add(c)); }
}
function planHash() {
  const q = new URLSearchParams({ t: plan.t, from: plan.from });
  if (plan.from === 'list' && plan.codes.trim()) q.set('codes', plan.codes.trim().split(/[\s,;]+/).join(','));
  if (!plan.ex) q.set('ex', '0');
  if (plan.com) q.set('com', '1');
  if (plan.q !== 'all') q.set('q', plan.q);
  if (plan.s !== 'reach') q.set('s', plan.s);
  if (plan.d) q.set('d', plan.d > 0 ? 'asc' : 'desc');
  if (plan.tg && planTarget() === plan.tg && plan.tg !== PLAN_TARGETS[planUnit(plan.t)].def) q.set('tg', plan.tg);
  if (plan.fam >= 0) q.set('fam', GN[plan.fam][0]);
  if (regionSel.size) q.set('r', [...regionSel].join('|'));
  if (countrySel.size) q.set('c', [...countrySel].join(','));
  return '#plan?' + q.toString();
}
// Languages in a pasted list, by code, ISO 639-3 code or name
// vendors' codes and names for languages the Index names differently
const PLAN_ALIAS = { zh: 'cmn', 'zh-cn': 'cmn', 'zh-tw': 'cmn', 'zh-hans': 'cmn', 'zh-hant': 'cmn', 'zh-hk': 'yue', iw: 'he', in: 'id', ji: 'yi',
  tl: 'fil', no: 'nb', jw: 'jv', mo: 'ro', chinese: 'cmn', mandarin: 'cmn', cantonese: 'yue', farsi: 'fa', burmese: 'my', tagalog: 'fil',
  norwegian: 'nb', punjabi: 'pa', kurdish: 'ku', 'pa-arab': 'pnb' };
function planParse(text) {
  const found = new Set(), unknown = [];
  for (const raw of text.split(/[\n,;\t]+/).map(x => x.trim()).filter(Boolean)) {
    const k = raw.toLowerCase().replace(/_/g, '-');
    const l = BY[PLAN_ALIAS[k]] || BY[k] || ALL.find(x => (x.iso_639_3 || '') === k || x.name.toLowerCase() === k || (x.autonym || '').toLowerCase() === k
        || (x.alt || '').toLowerCase().split('|').includes(k))
      || BY[PLAN_ALIAS[k.split('-')[0]]] || BY[k.split('-')[0]];
    if (l) found.add(l.code); else unknown.push(raw);
  }
  return { found, unknown };
}
function planRows() {
  const T = CFG.tech.technologies[plan.t], voice = PLAN_VOICE.has(plan.t);
  const scale = l => !narrowed() ? 1 : l.speakers ? (vSpk(l) || 0) / l.speakers : 0;
  const reach5 = l => ((voice ? l.o5 : l.ot5) || 0) * scale(l), reachNow = l => ((voice ? l.online : l.ot) || 0) * scale(l);
  let supported = new Set(), unknown = [], baseName = '';
  if (plan.from.startsWith('svc:')) {
    const id = plan.from.slice(4);
    for (const l of LANGS) if (l._offers.has(id)) supported.add(l.code);
    baseName = (SVC[id] || [id])[0] + (SVC[id] && SVC[id][1] ? ` (${SVC[id][1]})` : '');
  } else if (plan.from === 'list') {
    ({ found: supported, unknown } = planParse(plan.codes));
    baseName = 'your list';
  } else if (plan.from === 'under') {
    // well served: widely available (at least half the major services tracked, or at least full_min of them),
    // and an LTDI of at least served_min, or else with enough open data and no poor accuracy (ltdi.score.coverage: under);
    // what's left is underrepresented
    for (const l of LANGS) if ((l.under ? l.under[plan.t] : levelOf(l, plan.t) === 'full' && 'w') === 'w') supported.add(l.code);
    baseName = 'the languages already well served';
  }
  const inScope = l => inRegion(l) && inCountry(l) && reach5(l) > 0 && (plan.fam < 0 || l._gp.includes(plan.fam));
  // varieties of major languages (those whose speakers write another language's standard) are left out,
  // from the list and the totals, unless the starting list includes them
  const considered = LANGS.filter(l => inScope(l) && !(plan.ex && l.wi && !supported.has(l.code)));
  const total = considered.reduce((n, l) => n + reach5(l), 0);
  const base = considered.filter(l => supported.has(l.code)).reduce((n, l) => n + reach5(l), 0);
  const o = { com: plan.com, q: plan.q };
  const cands = considered.filter(l => !supported.has(l.code)).map(l => ({ l, r5: reach5(l), r0: reachNow(l), rd: readiness(l, plan.t, o) }))
    .sort((a, b) => b.r5 - a.r5);
  let cum = base;
  const rows = cands.map(r => { cum += r.r5; return { ...r, share: total ? cum / total : 0 }; });
  const groups = new Map();
  for (const l of LANGS) {
    if (!l._gp.length || !inRegion(l) || !inCountry(l) || supported.has(l.code) || (plan.ex && l.wi)) continue;
    const r = reach5(l);
    if (r > 0) for (const g of l._gp) { const x = groups.get(g) || [0, 0]; x[0]++; x[1] += r; groups.set(g, x); }
  }
  const famOpts = [...groups].filter(([, [n]]) => n >= 2).sort((a, b) => b[1][1] - a[1][1]).slice(0, 400);
  // underrepresented though widely available: short of open data or with poor published accuracy
  const nAttention = plan.from === 'under' ? rows.filter(r => r.l.under && 'dq'.includes(r.l.under[plan.t])).length : 0;
  return { T, voice, rows, total, base, supported, unknown, baseName, famOpts, nAttention, nSupported: considered.filter(l => supported.has(l.code)).length };
}
function planCells(r, T, sl = false) {
  const l = r.l, cons = [...(T.consumer || [])], baseId = !sl && plan.from.startsWith('svc:') ? plan.from.slice(4) : null;
  const others = cons.filter(id => id !== baseId), nOn = others.filter(id => l._offers.has(id)).length;
  const reg = (T.regional || []).filter(id => id !== baseId && l._offers.has(id)).length;
  const models = (T.open || []).filter(id => id !== baseId && l._offers.has(id) && !(plan.com && RES[id] && RES[id].commercial === 'no')).map(id => {
    const name = PLAN_SHORT[id] || (SVC[id] || [id])[0];
    return name + (RES[id] && RES[id].commercial === 'no' ? '†' : '');
  });
  let data = '—', have, kinds = null;
  if (PLAN_VOICE.has(plan.t)) {
    kinds = speechKinds(l); have = trainHours(kinds);
    const parts = kinds.map((h, i) => h >= 0.05 ? `${hShort(h)} h ${SPEECH_KIND_LABELS[i]}` : '').filter(Boolean);
    const usable = !plan.com && l.skc ? trainHours(l.skc) : null;
    data = parts.length ? parts.join(' · ') + (usable != null ? ` (${hShort(usable)} h of the training data usable commercially)` : '') : '—';
  } else if (plan.t === 'mt') { have = l.ps || 0; data = l.ps ? big(l.ps) + ' sentence pairs' : '—'; }
  else { have = l.ww || 0; data = l.ww ? big(l.ww) + ' words of web text' : '—'; }
  const target = planTarget(), short = Math.max(0, target - have);
  const need = short ? (PLAN_VOICE.has(plan.t) ? hShort(short) : big(short)) : 'Met';
  // its countries in scope, most speakers first, leaving out those where only immigrant communities speak it
  // (unless those are all there is in scope: Tagalog with the United States chosen, say)
  const here = Object.entries(l._cs).filter(([c]) => sl || countryIn(c)).sort((a, b) => (b[1] || 0) - (a[1] || 0)).map(([c]) => c);
  const home = here.filter(c => !l._im.has(c));
  const cs = home.length ? home : here;
  const scriptsIn = c => l._csc[c] || l._sc.slice(0, 1);
  const scripts = [...new Set(cs.flatMap(scriptsIn))].sort((a, b) => l._sc.indexOf(a) - l._sc.indexOf(b));
  const locales = cs.flatMap(c => scriptsIn(c).map(sc => `${l.code}-${sc}-${c.toUpperCase()}`));
  if (!cs.length) scripts.push(...l._sc.slice(0, 1));
  return { scripts, locales, others: `${nOn} of ${others.length}${reg ? ' + regional' : ''}`, models: models.join(', ') || '—', data, kinds, short, need, countries: cs, qual: planQual(l) };
}
function planCurve(rows, base, total) {
  if (!rows.length || !total) return '';
  const W = 720, H = 300, L = 48, R = 16, Tp = 14, B = 34, N = rows.length;
  const sx = i => L + Math.sqrt(i / N) * (W - L - R), y0 = base / total;
  const lo = y0 > 0.3 ? Math.floor(y0 * 10) / 10 : 0;  // start the axis just below where the list starts
  const sy = v => Tp + (1 - (v - lo) / (1 - lo)) * (H - Tp - B);
  const yt = [0, .25, .5, .75, 1].map(f => lo + f * (1 - lo));
  const step = Math.max(1, Math.floor(N / 400));
  const pts = [[0, y0], ...rows.filter((_, i) => i % step === 0 || i === N - 1).map(r => [rows.indexOf(r) + 1, r.share])];
  const ticks = [0, 10, 25, 50, 100, 200, 500, 1000, 2000, 5000].filter(t => t < N * 0.9);
  const marks = [25, 50, 100, 200].filter(k => k <= N).map(k => [k, rows[k - 1].share]);
  return `<svg class="plancurve" viewBox="0 0 ${W} ${H}" role="img" aria-label="Share of people online reached as languages are added">
    <g class="grid">${yt.map(v => `<line x1="${L}" x2="${W - R}" y1="${sy(v)}" y2="${sy(v)}"/><text x="${L - 6}" y="${sy(v) + 4}" text-anchor="end">${Math.round(v * 100)}%</text>`).join('')}
      ${[...ticks, N].map(t => `<text x="${sx(t)}" y="${H - 14}" text-anchor="middle">${t === N ? N.toLocaleString() : t}</text>`).join('')}
      <text x="${(L + W - R) / 2}" y="${H - 1}" text-anchor="middle">languages added, most-reaching first</text></g>
    <polyline fill="none" stroke="var(--accent)" stroke-width="2.5" points="${pts.map(([i, v]) => `${sx(i).toFixed(1)},${sy(v).toFixed(1)}`).join(' ')}"/>
    <circle cx="${sx(0)}" cy="${sy(y0)}" r="4" fill="var(--accent)"/>
    ${marks.map(([k, v]) => `<circle cx="${sx(k)}" cy="${sy(v)}" r="3.5" fill="var(--accent)"/>`).join('')}
  </svg>
  <div class="plan-steps"><span>Today <b>${Math.round(y0 * 100)}%</b></span>${marks.map(([k, v]) => `<span>+${k} languages <b>${Math.round(v * 100)}%</b></span>`).join('')}<span>All ${N.toLocaleString()} <b>100%</b></span></div>`;
}
// up to four country codes, then how many more
// up to four country codes, then how many more; where it's official (CLDR) in bold
function planCodes(cs, l) {
  if (!cs.length) return '—';
  const up = cs.map(c => l && l._of[c] ? `<b title="${esc(OFFICIAL_LABEL[l._of[c]])}">${c.toUpperCase()}</b>` : c.toUpperCase());
  return up.slice(0, 4).join(' ') + (up.length > 4 ? ` <span class="muted">+${up.length - 4}</span>` : '');
}
const OFFICIAL_LABEL = { o: 'Official', d: 'Official in practice', r: 'Official in a region' };
const officialList = l => Object.entries(l._of).map(([c, st]) => `${(COUNTRY_NAMES[c] || c.toUpperCase())}${st === 'o' ? '' : st === 'd' ? ' (in practice)' : ' (in a region)'}`);
function planCSV(P, sl = false) {
  const head = ['rank', 'code', 'name', 'family', 'branch', 'official_in', 'wikipedia_views_12_months', 'hf_models', 'hf_model_downloads_30_days', 'scripts', 'engineering_flags', 'countries', 'locales', 'online_in_5_years', 'online_today', 'cumulative_share', 'ready', 'missing', 'other_services_offering', 'open_models', 'data', 'hours_read', 'hours_spontaneous', 'hours_media', 'fleurs_test_set', 'target', 'short_of_target'];
  const q = v => /[",\n]/.test(v) ? `"${String(v).replace(/"/g, '""')}"` : v;
  const lines = [head.join(',')].concat(P.rows.map((r, i) => { const c = planCells(r, P.T, sl);
    return [i + 1, r.l.code, r.l.name, famName(r.l), branchName(r.l), Object.entries(r.l._of).map(([cc, st]) => cc.toUpperCase() + (st === 'o' ? '' : ':' + st)).join(' '),
      r.l.wv || '', r.l.hm || '', r.l.hd || '', c.scripts.join(' '), flagLabels(r.l).join('; '), c.countries.map(x => x.toUpperCase()).join(' '), c.locales.join(' '),
      Math.round(r.r5), Math.round(r.r0), r.share.toFixed(4), `${r.rd.n} of ${r.rd.of}`, r.rd.items.filter(x => !x.ok).map(x => x.label).join('; '), c.others, c.models, c.data, ...(c.kinds ? [...c.kinds.slice(0, 3).map(h => h.toFixed(1)), c.kinds[3] >= 0.05 ? 'yes' : 'no'] : ['', '', '', '']), planTarget(), c.short].map(q).join(','); }));
  return lines.join('\n') + '\n';
}
// The shortlist: languages a team is weighing for its next wave. Kept in the link (#shortlist?codes=...)
// so a colleague opens the same table, and in this browser so it survives moving between pages.
let shortlist = (() => { try { return JSON.parse(localStorage.getItem('ltdi-shortlist') || '[]').filter(c => BY[c]); } catch (e) { return []; } })();
const saveShortlist = () => { try { localStorage.setItem('ltdi-shortlist', JSON.stringify(shortlist)); } catch (e) { /* kept for this visit only */ } };
const onShortlist = code => shortlist.includes(code);
const slButton = l => { const on = onShortlist(l.code);
  return `<button type="button" class="slbtn" data-sl="${l.code}" aria-pressed="${on}" title="${on ? 'On your shortlist: select to remove' : 'Add to your shortlist'}" aria-label="${on ? 'Remove' : 'Add'} ${esc(l.name)} ${on ? 'from' : 'to'} the shortlist">${on ? '✓' : '+'}</button>`; };
function slHash() {
  const q = new URLSearchParams({ codes: shortlist.join(','), t: plan.t });
  if (plan.com) q.set('com', '1');
  if (plan.q !== 'all') q.set('q', plan.q);
  if (plan.s !== 'reach') q.set('s', plan.s);
  if (plan.d) q.set('d', plan.d > 0 ? 'asc' : 'desc');
  return '#shortlist?' + q.toString().replace(/%2C/g, ',');
}
function toggleShortlist(code) {
  shortlist = onShortlist(code) ? shortlist.filter(c => c !== code) : [...shortlist, code];
  saveShortlist();
  document.querySelectorAll(`[data-sl="${code}"]`).forEach(b => {
    const on = onShortlist(code), name = (BY[code] || {}).name || code;
    b.setAttribute('aria-pressed', String(on));
    b.textContent = on ? '✓' : '+'; b.title = on ? 'On your shortlist: select to remove' : 'Add to your shortlist';
    b.setAttribute('aria-label', `${on ? 'Remove' : 'Add'} ${name} ${on ? 'from' : 'to'} the shortlist`);
  });
  document.querySelectorAll('.slcount').forEach(x => x.textContent = shortlist.length);
  document.querySelectorAll('a.slchip').forEach(a => a.setAttribute('href', slHash()));
}
document.addEventListener('click', e => {
  const b = e.target.closest('[data-sl]');
  if (!b) return;
  e.preventDefault();
  toggleShortlist(b.dataset.sl);
  if (curRoute().startsWith('shortlist')) { history.replaceState(null, '', slHash()); const y = scrollY; shortlistPage(); scrollTo(0, y); }
});
function slFromHash(h) {
  const q = new URLSearchParams((h.split('?')[1]) || '');
  if (q.has('codes')) { shortlist = [...new Set(q.get('codes').split(',').map(c => c.trim().toLowerCase()).filter(c => BY[c]))]; saveShortlist(); }
  if (q.get('t') && PLAN_TECHS.includes(q.get('t'))) plan.t = q.get('t');
  plan.com = q.get('com') === '1';
  plan.q = 'all';
  plan.s = q.get('s') in PLAN_SORTS ? q.get('s') : 'reach'; plan.d = q.get('d') === 'asc' ? 1 : q.get('d') === 'desc' ? -1 : 0;
}
function shortlistRows() {
  const T = CFG.tech.technologies[plan.t], voice = PLAN_VOICE.has(plan.t), o = { com: plan.com, q: plan.q };
  const r5 = l => (voice ? l.o5 : l.ot5) || 0, r0 = l => (voice ? l.online : l.ot) || 0;
  const total = LANGS.reduce((n, l) => n + r5(l), 0);
  let cum = 0;
  const rows = shortlist.map(c => BY[c]).filter(Boolean).map(l => ({ l, r5: r5(l), r0: r0(l), rd: readiness(l, plan.t, o) }))
    .sort((a, b) => b.r5 - a.r5)
    .map(r => { cum += r.r5; return { ...r, share: total ? cum / total : 0 }; });
  return { T, voice, rows, total, base: 0 };
}
function shortlistPage() {
  const P = shortlistRows(), T = P.T, who = P.voice ? 'people online' : 'people online and able to text';
  const sum5 = P.rows.reduce((n, r) => n + r.r5, 0), sum0 = P.rows.reduce((n, r) => n + r.r0, 0);
  const pct = v => `${Math.round(v * 100)}%`, n = P.rows.length;
  $('#view').innerHTML = `
    <section class="chart">
      <h2 class="plan-h">Shortlist</h2>
      <div class="sl-controls">
        <label class="plan-l">Technology <select id="sl-t">${PLAN_TECHS.map(k => `<option value="${k}"${plan.t === k ? ' selected' : ''}>${esc(CFG.tech.technologies[k].label)}</option>`).join('')}</select></label>
        <label class="switch" title="Count only open data and models whose licence permits commercial use"><input type="checkbox" role="switch" id="sl-com"${plan.com ? ' checked' : ''}><span class="track" aria-hidden="true"></span>Commercially usable data and models only</label>
      </div>
      <form class="sl-add" id="sl-form"><input id="sl-in" type="text" autocomplete="off" aria-label="Languages to add" placeholder="Add languages: codes or names, such as yo, ha, Igbo"><button type="submit" class="chip">Add</button></form>
      <p class="note sl-msg" id="sl-msg" aria-live="polite"></p>
    </section>
    <section class="chart">
      <div class="plan-tablehead"><h3>${n ? `${n} ${n === 1 ? 'language' : 'languages'}: ${people(sum5)} ${who} in five years (${pct(sum5 / (P.total || 1))} of the world's), ${people(sum0)} today` : 'No languages yet'}</h3><span><button type="button" class="chip" id="sl-csv"${n ? '' : ' disabled'}>Download CSV</button> <button type="button" class="chip" id="sl-link"${n ? '' : ' disabled'}>Copy link</button> <button type="button" class="chip" id="sl-clear" style="min-width:8.5em"${n ? '' : ' disabled'}>Clear</button></span></div>
      ${n ? `<div class="tablebox">${planHead(T, P, who, 'the world', true)}<tbody>${planSorted(P.rows, T, true).map((r, i) => planRow(r, i, T, true)).join('')}</tbody></table></div>`
          : `<p class="note">Nothing on the shortlist. Open the <a href="#plan">Plan tab</a> and select + beside the languages you want to compare, or add them above.</p>`}
    </section>`;
  const redraw = () => { history.replaceState(null, '', slHash()); const y = scrollY; shortlistPage(); scrollTo(0, y); };
  $('#sl-t').onchange = e => { plan.t = e.target.value; redraw(); };
  $('#sl-com').onchange = e => { plan.com = e.target.checked; redraw(); };
  $('#view').querySelectorAll('[data-psort]').forEach(b => b.onclick = () => { planSortClick(b.dataset.psort); redraw(); });
  $('#sl-form').onsubmit = e => {
    e.preventDefault();
    const { found, unknown } = planParse($('#sl-in').value), added = [...found].filter(c => !onShortlist(c));
    shortlist = [...shortlist, ...added]; saveShortlist(); redraw();
    $('#sl-msg').textContent = [added.length ? `Added ${added.length}.` : found.size ? 'Already on the shortlist.' : '', unknown.length ? `Not recognised: ${unknown.slice(0, 12).join(', ')}${unknown.length > 12 ? ' …' : ''}.` : ''].filter(Boolean).join(' ');
  };
  if ($('#sl-csv')) $('#sl-csv').onclick = () => {
    const blob = new Blob([planCSV(P, true)], { type: 'text/csv' }), a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = `ltdi-shortlist-${plan.t}.csv`; document.body.appendChild(a); a.click(); a.remove();
  };
  $('#sl-link').onclick = async e => {
    try { await navigator.clipboard.writeText(location.href.split('#')[0] + slHash()); e.target.textContent = 'Link copied'; } catch (err) { e.target.textContent = 'Copy the address bar'; }
  };
  $('#sl-clear').onclick = e => {
    if (e.target.dataset.armed) { shortlist = []; saveShortlist(); redraw(); }
    else { e.target.dataset.armed = '1'; e.target.textContent = 'Select to confirm'; }
  };
}

// The planner's table head and rows, shared by the Plan tab and the shortlist (sl: no starting list or scope)
// Every column of the table sorts it (the curve keeps the order of reach): [default direction, value];
// a missing value (null) sorts last either way
const PLAN_SORTS = {
  name: [1, r => r.l.name], code: [1, r => r.l.code], script: [1, (r, c) => c.scripts[0] || null],
  countries: [1, (r, c) => c.countries[0] || null], reach: [-1, r => r.r5],
  models: [-1, (r, c) => c.models === '—' ? 0 : c.models.split(', ').length],
  qual: [1, r => { const Q = PLAN_QCOL[plan.t], v = Q && r.l.qv && r.l.qv[Q[0]]; return v ?? null; }],
  read: [-1, (r, c) => c.kinds ? c.kinds[0] : null], spont: [-1, (r, c) => c.kinds ? c.kinds[1] : null],
  media: [-1, (r, c) => c.kinds ? c.kinds[2] : null], test: [-1, (r, c) => c.kinds ? +(c.kinds[3] >= 0.05) : null],
  data: [-1, r => (plan.t === 'mt' ? r.l.ps : r.l.ww) || 0], short: [-1, (r, c) => c.short],
  total: [-1, (r, c) => c.kinds ? trainHours(c.kinds) : null],
};
function planSorted(rows, T, sl) {
  const S = PLAN_SORTS[plan.s] || PLAN_SORTS.reach, dir = plan.d || S[0];
  const keyed = rows.map(r => ({ r, v: S[1](r, planCells(r, T, sl)) }));
  keyed.sort((a, b) => (a.v == null) - (b.v == null) || (a.v == null ? 0 : (typeof a.v === 'string' ? a.v.localeCompare(b.v, 'en', { ignorePunctuation: true, sensitivity: 'base' }) : a.v - b.v) * dir) || b.r.r5 - a.r.r5);
  return keyed.map(x => x.r);
}
function psBtn(key, label) {
  const on = plan.s === key, S = PLAN_SORTS[key], dir = plan.d || S[0];
  return `<button class="sort" data-psort="${key}" aria-pressed="${on}" title="Sort by this column${on ? ' (select again to reverse)' : ''}">${label}<span class="arr" aria-hidden="true">${on ? (dir > 0 ? '▲' : '▼') : ''}</span></button>`;
}
const psAria = key => plan.s === key ? ` aria-sort="${(plan.d || PLAN_SORTS[key][0]) > 0 ? 'ascending' : 'descending'}"` : '';
function planSortClick(key) {
  if (plan.s === key) plan.d = -(plan.d || PLAN_SORTS[key][0]);
  else { plan.s = key; plan.d = 0; }
  if (plan.d === PLAN_SORTS[key][0]) plan.d = 0;  // the column's own default direction needs no setting
}
function planHead(T, P, who, scopeName, sl) {
  const voice = PLAN_VOICE.has(plan.t), U = PLAN_TARGETS[planUnit(plan.t)];
  const data = voice
    ? `<th class="num pc-h"${psAria('read')}>${psBtn('read', 'Read')}</th><th class="num pc-h"${psAria('spont')}>${psBtn('spont', 'Spont&shy;aneous')}</th><th class="num pc-h"${psAria('media')}>${psBtn('media', 'Media')}</th><th class="pc-fl"${psAria('test')}>${psBtn('test', 'FLEURS test set')}</th>`
    : `<th class="num pc-h"${psAria('data')}>${psBtn('data', plan.t === 'mt' ? 'Sentence pairs with English' : 'Words of web text')}</th>`;
  return `<table class="plantab"><thead><tr><th class="num pc-n">#</th><th class="pc-lang"${psAria('name')}>${psBtn('name', 'Language')}</th><th class="pc-code"${psAria('code')}>${psBtn('code', 'Code')}</th><th class="pc-code"${psAria('script')}>${psBtn('script', 'Script')}</th><th class="pc-cty"${psAria('countries')}>${psBtn('countries', 'Countries')}</th><th class="num pc-now"${psAria('reach')}>${psBtn('reach', 'Online in 5 years')}</th><th class="pc-mod"${psAria('models')}>${psBtn('models', 'Open models')}</th>${PLAN_QCOL[plan.t] ? `<th class="num pc-q"${psAria('qual')}>${psBtn('qual', PLAN_QCOL[plan.t][1])}</th>` : ''}${data}${voice ? `<th class="num pc-need" title="Read, spontaneous and media hours together, not counting test sets"${psAria('total')}>${psBtn('total', 'Total hours')}</th>`
    : `<th class="num pc-need" title="How much more open data it needs to reach the target, ${esc(magn(planTarget()))} ${esc(U.label)}"${psAria('short')}>${psBtn('short', `Short of ${esc(magn(planTarget()))}`)}</th>`}</tr></thead>`;
}
function planRow(r, i, T, sl) {
  const c = planCells(r, T, sl), l = r.l, voice = PLAN_VOICE.has(plan.t);
  const share = (voice ? l.o5s : l.ot5s) || 0;
  const onCell = `${people(r.r5)}${share ? ` <span class="pct p${pctBand(share)}">(${Math.round(share * 100)}%)</span>` : ''}`;
  const h = v => v >= 0.05 ? hShort(v) : '—';
  const tip = k => { const t = speechSources(l, k); return t ? ` title="${esc(t)}"` : ''; };
  const data = voice ? c.kinds.slice(0, 3).map((v, k) => `<td class="num${v >= 0.05 ? ' pc-src' : ''}"${tip(k)}>${h(v)}</td>`).join('') + `<td class="pc-fl"${tip(3)}>${c.kinds[3] >= 0.05 ? '<span aria-label="yes">✓</span>' : '<span class="muted" aria-label="no">—</span>'}</td>`
    : `<td class="num">${(plan.t === 'mt' ? l.ps : l.ww) ? big(plan.t === 'mt' ? l.ps : l.ww) : '—'}</td>`;
  return `<tr><td class="num">${i + 1}</td><td class="pc-ln">${slButton(l)}<a href="${LH(l.code)}" title="${esc([famName(l), branchName(l)].filter(Boolean).join(' › '))}">${esc(l.name)}</a></td><td class="pc-m">${l.code}</td><td class="pc-m">${c.scripts.join(' ') || '—'}</td><td class="pc-m" title="${esc(c.locales.join(' '))}">${planCodes(c.countries, l)}</td><td class="num">${onCell}</td><td class="small">${esc(c.models)}</td>${PLAN_QCOL[plan.t] ? `<td class="num">${c.qual}</td>` : ''}${data}${voice ? `<td class="num" title="${esc(c.short ? `${hShort(c.short)} hours short of the target, ${magn(planTarget())}` : `Meets the target, ${magn(planTarget())} hours`)}">${trainHours(c.kinds) >= 0.05 ? hShort(trainHours(c.kinds)) : '—'}</td>`
    : `<td class="num${c.short ? '' : ' muted'}">${esc(c.need)}</td>`}</tr>`;
}
function planPage() {
  const P = planRows(), T = P.T;
  const svcOpts = [...(T.consumer || []), ...(T.regional || []), ...(T.open || [])].filter(id => SVC[id])
    .map(id => `<option value="svc:${id}"${plan.from === 'svc:' + id ? ' selected' : ''}>${esc(SVC[id][0])}${SVC[id][1] ? ` · ${esc(SVC[id][1])}` : ''}</option>`).join('');
  const shown = planSorted(P.rows, T, false).slice(0, plan.n);
  const pct = v => `${Math.round(v * 100)}%`;
  const scopeName = countrySel.size ? [...countrySel].map(c => COUNTRY_NAMES[c]).join(', ') : regionSel.size ? [...regionSel].join(', ') : 'the world';

  const who = P.voice ? 'people online' : 'people online and able to text';
  $('#view').innerHTML = `
    <div class="plan-top">
    <section class="chart planhead">
      <h2 class="plan-h">Plan which languages to add next</h2>
      <div class="plan-controls">
        <label class="plan-l">Technology <select id="pl-t">${PLAN_TECHS.map(k => `<option value="${k}"${plan.t === k ? ' selected' : ''}>${esc(CFG.tech.technologies[k].label)}</option>`).join('')}</select></label>
        <label class="plan-l">Starting from <select id="pl-from"><option value="none"${plan.from === 'none' ? ' selected' : ''}>Nothing yet</option><option value="under"${plan.from === 'under' ? ' selected' : ''} title="Leaves out only well-served languages: offered by most major services, and comfortably Medium or above overall, or with enough open data for the technology">Underrepresented languages</option><option value="list"${plan.from === 'list' ? ' selected' : ''}>A list I paste</option><optgroup label="This list">${svcOpts}</optgroup></select></label>
        <label class="plan-l">Data target, in ${esc(PLAN_TARGETS[planUnit(plan.t)].label)} <select id="pl-tg" title="The table shows how far each language is short of this much open data">${PLAN_TARGETS[planUnit(plan.t)].opts.map(n => `<option value="${n}"${planTarget() === n ? ' selected' : ''}>${magn(n)}</option>`).join('')}</select></label>
        <label class="plan-l">Family or branch <input id="pl-fam" class="plan-in" list="pl-fams" autocomplete="off" placeholder="Any, or type one: Bantu, Indo-Aryan …" value="${plan.fam >= 0 ? esc(GN[plan.fam][1]) : ''}"></label>
        <datalist id="pl-fams">${P.famOpts.map(([g, [n, r]]) => `<option value="${esc(GN[g][1])}">${n.toLocaleString()} languages · ${people(r)}</option>`).join('')}</datalist>
        <div class="plan-scope"><span class="plan-l">Where</span><span id="plregwrap">${regionPicker()}</span><span id="plctrywrap">${countryPicker()}</span></div>
      </div>
      ${plan.from === 'list' ? `<div class="plan-paste"><textarea id="pl-codes" rows="3" placeholder="Language codes or names, separated by commas, spaces or new lines: en, es, yo, Hausa ...">${esc(plan.codes)}</textarea>
        <p class="note">${P.supported.size.toLocaleString()} recognised${P.unknown.length ? `; not recognised: ${esc(P.unknown.slice(0, 12).join(', '))}${P.unknown.length > 12 ? ' …' : ''}` : ''}.</p></div>` : ''}
      <div class="plan-toggles">
        <label class="switch" title="Count spoken varieties whose speakers mostly read and write a major standard language (Wu, Egyptian Arabic, Bhojpuri)"><input type="checkbox" role="switch" id="pl-ex"${plan.ex ? '' : ' checked'}><span class="track" aria-hidden="true"></span>Include varieties of major languages</label>
        <label class="switch" title="Count only open data and models whose licence permits commercial use"><input type="checkbox" role="switch" id="pl-com"${plan.com ? ' checked' : ''}><span class="track" aria-hidden="true"></span>Commercially usable data and models only</label>
      </div>
    </section>
    <section class="chart plangraph">
      <h3>${P.rows.length ? `From ${pct(P.base / (P.total || 1))} to 100% of ${who} in ${esc(scopeName)}` : 'Nothing left to add'}</h3>
      ${planCurve(P.rows, P.base, P.total)}
    </section>
    </div>
    <section class="chart">
      <div class="plan-tablehead"><h3>${plan.from === 'under' ? 'Underrepresented languages' : 'Languages to add'}, by reach</h3><span><a class="chip slchip" href="${slHash()}" title="The languages you've marked with +">Shortlist (<span class="slcount">${shortlist.length}</span>)</a> <button type="button" class="chip" id="pl-csv">Download CSV</button> <button type="button" class="chip" id="pl-link">Copy link</button></span></div>
      <div class="tablebox">${planHead(T, P, who, scopeName, false)}
      <tbody>${shown.map((r, i) => planRow(r, i, T, false)).join('')}</tbody></table></div>
      ${P.rows.length > shown.length ? `<button type="button" class="chip" id="pl-more">Show ${Math.min(50, P.rows.length - shown.length)} more of ${(P.rows.length - shown.length).toLocaleString()}</button>` : ''}
    </section>`;
  const redraw = () => { history.replaceState(null, '', planHash()); const y = scrollY; planPage(); scrollTo(0, y); };
  $('#pl-t').onchange = e => { plan.t = e.target.value; if (plan.from.startsWith('svc:')) plan.from = 'none'; plan.n = 50; plan.tg = 0; redraw(); };  // the target's unit changes too
  $('#pl-from').onchange = e => { plan.from = e.target.value; plan.n = 50; redraw(); };
  $('#pl-ex').onchange = e => { plan.ex = !e.target.checked; redraw(); };
  $('#pl-com').onchange = e => { plan.com = e.target.checked; redraw(); };
  $('#pl-tg').onchange = e => { plan.tg = +e.target.value; redraw(); };
  $('#pl-fam').onchange = e => {
    const v = e.target.value.trim().toLowerCase();
    if (!v) plan.fam = -1;
    else { const hit = P.famOpts.find(([g]) => GN[g][1].toLowerCase() === v) || P.famOpts.find(([g]) => GN[g][1].toLowerCase().includes(v)); if (hit) plan.fam = hit[0]; }
    plan.n = 50; redraw();
  };
  $('#view').querySelectorAll('[data-psort]').forEach(b => b.onclick = () => { planSortClick(b.dataset.psort); redraw(); });
  const ta = $('#pl-codes');
  if (ta) ta.onchange = e => { plan.codes = e.target.value; plan.n = 50; redraw(); };
  if ($('#pl-more')) $('#pl-more').onclick = () => { plan.n += 50; redraw(); };
  $('#pl-csv').onclick = () => {
    const blob = new Blob([planCSV(P)], { type: 'text/csv' }), a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = `ltdi-plan-${plan.t}.csv`; document.body.appendChild(a); a.click(); a.remove();
  };
  $('#pl-link').onclick = async e => {
    const url = location.href.split('#')[0] + planHash();
    try { await navigator.clipboard.writeText(url); e.target.textContent = 'Link copied'; } catch (err) { e.target.textContent = 'Copy the address bar'; }
  };
  wireMsel('plregwrap', regionPicker, regionSel, REGIONS.length, () => { redraw(); reopen('plregwrap'); });
  wireCountries('plctrywrap', () => { redraw(); reopenCountries('plctrywrap'); });
}

// A language address that isn't a code the Index uses: its ISO 639-3 code, name, own name or another name
function resolveLang(raw) {
  let q;
  try { q = decodeURIComponent(raw); } catch (e) { q = raw; }
  q = q.toLowerCase().replace(/[_+]/g, ' ').replace(/ language$/, '').trim();
  if (BY[q]) return BY[q];
  const same = s => (s || '').toLowerCase() === q || (s || '').toLowerCase().replace(/-/g, ' ') === q.replace(/-/g, ' ');
  return ALL.find(l => l.iso_639_3 === q) || ALL.find(l => same(l.name) || same(l.autonym)) || ALL.find(l => altNames(l).some(same)) || null;
}
// Nothing at this address: say so, and suggest languages whose names or codes are close
function notFound(raw) {
  let q = raw;
  try { q = decodeURIComponent(raw || ''); } catch (e) { /* keep it as typed */ }
  q = (q || '').toLowerCase().replace(/[_+-]/g, ' ').replace(/ language$/, '').trim();
  // names that start with what was typed, or are a letter or two away from it (Yorba, Swahli)
  const edits = (a, b, max) => {  // edit distance, giving up past max
    if (Math.abs(a.length - b.length) > max) return max + 1;
    let prev = [...Array(b.length + 1).keys()];
    for (let i = 1; i <= a.length; i++) {
      const cur = [i];
      for (let j = 1; j <= b.length; j++) cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
      if (Math.min(...cur) > max) return max + 1;
      prev = cur;
    }
    return prev[b.length];
  };
  const names = l => [l.name, l.autonym, ...altNames(l)].filter(Boolean).map(n => n.toLowerCase());
  const near = q.length >= 3 ? ALL.filter(l => names(l).some(n => n.startsWith(q) || (q.length >= 4 && edits(q, n, q.length >= 7 ? 2 : 1) <= (q.length >= 7 ? 2 : 1))))
    .sort((a, b) => (b.speakers || 0) - (a.speakers || 0)).slice(0, 8) : [];
  $('#view').innerHTML = `<section class="chart">
    <h2 class="plan-h">${raw != null ? 'No language at this address' : 'Page not found'}</h2>
    <p class="sub">${raw != null ? `The Index has no language with the code or name <b>${esc(q || raw)}</b>. Language pages use the codes in the Index: ISO 639-1 where there is one (<a href="/language/yo">/language/yo</a> for Yoruba), otherwise ISO 639-3. An ISO 639-3 code or a language's name works too.`
      : `There's nothing at <span class="code">${esc(location.pathname)}</span>.`} The search box above finds any language by name or code.</p>
    ${near.length ? `<h3 class="panel-h">Did you mean</h3><ul class="rel-list">${near.map(l => `<li><a href="${LH(l.code)}">${esc(l.name)}</a> <span class="code">${l.code}</span> ${tierChip(l)}</li>`).join('')}</ul>` : ''}
    <p class="note"><a href="/#ranking">See all languages</a></p></section>`;
}
// Visits are counted on the public site with GoatCounter, when pages.py sets it up: no cookies and nothing
// personal, just the view's address (without a shortlist's codes or a plan's settings)
let lastCounted;
function countView() {
  const gc = window.goatcounter;
  if (!PATHS || !gc) return;
  const path = (location.pathname + location.hash).replace(/\?.*$/, '');
  if (path === lastCounted) return;
  lastCounted = path;
  const title = document.title;  // route() calls this once the view's title is set
  const send = () => window.goatcounter.count && window.goatcounter.count({ path, title });
  gc.count ? send() : addEventListener('load', send, { once: true });
}
function route() {
  let missing;  // set when the address names nothing: the language asked for, or null for any other path
  if (PATHS) {  // old /#lang-yo links move to /language/yo; a # view on a language's path moves home
    const lp = location.pathname.match(/^\/language\/([^/]+)\/?$/);
    if (location.hash.startsWith('#lang-')) history.replaceState(null, '', `/language/${location.hash.slice(6)}`);
    else if (location.hash && location.pathname !== '/') history.replaceState(null, '', '/' + location.hash);
    else if (lp && !BY[lp[1]]) {
      const hit = resolveLang(lp[1]);
      if (hit) history.replaceState(null, '', `/language/${hit.code}`); else missing = lp[1];
    } else if (location.pathname !== '/' && !lp) missing = null;
  }
  const h = missing !== undefined ? '' : curRoute();
  let m;
  if (h !== 'map') { mapFocus = null; mapView = null; }
  navBox('go', 'Find a language name or code');  // each view may give the box another job
  if (missing !== undefined) notFound(missing);
  else if ((m = h.match(/^lang-([a-z]+)$/)) && BY[m[1]]) language(m[1]);
  else if (m) notFound(m[1]);  // #lang-xx for a code the Index doesn't have
  else if ((m = h.match(/^compare-([a-z]+)-([a-z]+)$/))) go('lang-' + m[1]);  // comparison pages are gone: the first language
  else if (h === 'charts') { if (!HIST) $('#view').innerHTML = ''; histData().then(() => curRoute() === 'charts' && charts()); }
  else if (h === 'map') mapPage();
  else if (h === 'about') about();
  else if (h === 'providers') providersPage();
  else if (h === 'download') downloadPage();
  else if (h === 'opportunities') opportunities();
  else if ((m = h.match(/^opportunities-([a-z]+)$/))) opportunities(m[1]);
  else if ((m = h.match(/^opp-([a-z0-9-]+)$/))) oppDetail(m[1]);
  else if (h === 'plan' || h.startsWith('plan?')) { planFromHash(h); planPage(); }
  else if (h === 'shortlist' || h.startsWith('shortlist?')) { slFromHash(h); shortlistPage(); }
  else ranking();
  // The Opportunities tab always opens the full list, with the filters left as they were
  const otab = document.getElementById('tab-opportunities');
  if (otab) otab.setAttribute('href', '#opportunities');
  const tab = missing !== undefined ? '' : h.startsWith('opp') ? 'opportunities' : h.startsWith('plan') || h.startsWith('shortlist') ? 'plan' : ['charts', 'map', 'about'].includes(h) ? h : h === 'providers' || h === 'download' ? 'about' : (h === '' || h === 'ranking') ? 'ranking' : '';
  tipHide();
  const lm = h.match(/^lang-([a-z0-9]+)$/), TT = { map: 'Map', charts: 'Charts', opportunities: 'Opportunities', plan: 'Plan', about: 'About', providers: 'For providers', download: 'Download the database' };
  document.title = missing !== undefined || (lm && !BY[lm[1]]) ? 'Not found · Language Technology Development Index'
    : lm && BY[lm[1]] ? `${BY[lm[1]].name}: language technology support · LTDI`
    : TT[['providers', 'download'].includes(h) ? h : tab] ? `${TT[['providers', 'download'].includes(h) ? h : tab]} · Language Technology Development Index` : 'Language Technology Development Index';
  countView();
  for (const t of ['ranking', 'map', 'charts', 'opportunities', 'plan', 'about']) {
    const a = document.getElementById('tab-' + t);
    if (a) t === tab ? a.setAttribute('aria-current', 'page') : a.removeAttribute('aria-current');
  }
  window.scrollTo(0, 0);
}
addEventListener('hashchange', route);
addEventListener('popstate', route);
// once the first view is drawn, the map's file loads in the background, ready for the Map tab
addEventListener('load', () => setTimeout(loadGeo, 300));
// On the public site, links to the site's own views move between them without reloading the page
if (PATHS) document.addEventListener('click', e => {
  const a = e.target.closest('a[href]');
  if (!a || e.defaultPrevented || e.button || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || a.getAttribute('target')) return;
  const u = new URL(a.getAttribute('href'), document.baseURI);  // getAttribute: an SVG link's href isn't a string
  if (u.origin !== location.origin || !(u.pathname === '/' && u.hash || /^\/language\/[a-z0-9]+\/?$/.test(u.pathname))) return;
  e.preventDefault();
  if (u.href !== location.href) history.pushState(null, '', u.pathname + u.search + u.hash);
  route();
});
route();
