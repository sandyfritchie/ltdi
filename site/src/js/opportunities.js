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
// Countries with census figures on language (immigrant languages counted); for the others a filtered
// view says their immigrant communities' languages are missing
const CENSUS = new Set(DATA.census_countries || []);
function censusCaveat() {
  const no = [...countrySel].filter(c => !CENSUS.has(c)).map(c => COUNTRY_NAMES[c] || c.toUpperCase()).sort();
  if (!no.length) return '';
  const list = no.length > 4 ? `${no.length} of the countries chosen` : no.length > 1 ? `${no.slice(0, -1).join(', ')} and ${no[no.length - 1]}` : no[0];
  return `<p class="note">We couldn't find census figures on language for ${esc(list)}, so the languages of ${no.length > 1 ? 'their' : 'its'} immigrant communities aren't included: only the languages LinguaMeta lists for ${no.length > 1 ? 'them' : 'it'}.</p>`;
}
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
    const rows = (L[c] || []).filter(([code]) => BY[code] && !BY[code].extinct && inView(BY[code]));
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
function oppItem(o, l, showLang) {
  return `<li class="opp" style="--c:var(${OCOLOR[o.type]})">
    <div class="prio">${prio(o).toFixed(2)}<small>priority</small></div>
    <div class="opp-head"><span class="otype">${esc(OT[o.type].label)}</span><span>${esc(TECHL[o.technology] || o.technology)}</span>
      ${showLang ? `<a href="${LH(l.code)}">${esc(l.name)}</a>` : ''}</div>
    <a class="opp-title" href="#opp-${o.id}">${esc(o.title)}</a>
    <div class="opp-detail">${esc(o.why)}</div>
    ${provider !== 'All' ? `<div class="opp-prov" style="--p:var(--prov-${provider})"><i></i>Not yet in ${esc(provMissing(o, l, provider).join(', '))}</div>` : ''}
    <div class="opp-foot"><span>${o.teams.map(t => esc(TEAMS[t])).join(' · ')}</span><a href="#opp-${o.id}">Starter kit and details →</a></div>
  </li>`;
}

let otype = 'all', team = 'all', showAll = false;
async function opportunities(lang) {
  const focus = lang && BY[lang] ? BY[lang] : null;
  if (focus) await need(focus.code);
  else if (!countrySel.size) await topOpps();
  const pool = focus ? focus.opportunities.map(o => ({ o, l: focus })) : countrySel.size ? await countryPool()
    : TOP.map(o => ({ o, l: BY[o.lang] })).filter(x => inView(x.l));
  const all = pool
    .filter(x => provider === 'All' || provMissing(x.o, x.l, provider).length)
    .sort((a, b) => prio(b.o) - prio(a.o));
  const byTeam = all.filter(x => team === 'all' || x.o.teams.includes(team));
  const tcount = Object.fromEntries(Object.keys(TEAMS).map(k => [k, all.filter(x => x.o.teams.includes(k)).length]));
  const counts = Object.fromEntries(Object.keys(OT).map(k => [k, byTeam.filter(x => x.o.type === k).length]));
  const list = byTeam.filter(x => otype === 'all' || x.o.type === otype);
  const shown = showAll ? list : list.slice(0, 25);
  const filtered = regionSel.size || ((tierSel.size || countrySel.size) && !focus) || provider !== 'All' || otype !== 'all' || team !== 'all' || focus;
  $('#view').innerHTML = `
    <div class="controls">
      ${focus ? '' : `<span id="orwrap">${regionPicker()}</span><span id="octrywrap">${countryPicker()}</span><span id="otierwrap">${tierPicker()}</span>`}
      ${providerSelect('opsel')}
      <select id="otsel" aria-label="Kind of action"><option value="all">Any kind of action</option>${Object.entries(OT).map(([k, t]) => `<option value="${k}"${otype === k ? ' selected' : ''}>${esc(t.label)} (${counts[k]})</option>`).join('')}</select>
      <button type="button" class="reset" id="oresetf"${filtered ? '' : ' hidden'}>Reset filters</button>
    </div>
    ${focus ? `<div class="lhead"><h2>${esc(focus.name)} <span class="auto">${all.length} opportunities</span></h2><a href="${LH(focus.code)}">Language profile</a></div>`
            : `<p class="lede ws-lede">Where a team can make the biggest difference next. Each opportunity says why it matters, which open resources are ready to start from, and what's still missing.</p>`}
    <div class="teampick"><span class="eyebrow">What does your team work on?</span>
      <div class="chips" role="group" aria-label="Team">
        <button class="chip" id="tm-all" data-tm="all" aria-pressed="${team === 'all'}">Everything · ${all.length}</button>
        ${Object.entries(TEAMS).filter(([k]) => tcount[k]).map(([k, t]) => `<button class="chip" id="tm-${k}" data-tm="${k}" aria-pressed="${team === k}">${esc(t)} · ${tcount[k]}</button>`).join('')}
      </div></div>
    ${provider !== 'All' ? `<p class="note" style="margin-top:0">Opportunities where a ${esc(PROV_ALL[provider])} service tracked here doesn't yet cover the language.</p>` : ''}
    ${!focus && countrySel.size ? `<p class="note">The top opportunities in ${esc(regionNames())}, ranked by reach there: each language counts only its speakers in ${countrySel.size > 1 ? 'these countries' : 'this country'}. Choose a language to see all of its own.</p>`
      : !focus && DATA.opportunity_total > TOP.length ? `<p class="note">Showing ${TOP.length.toLocaleString()} of ${DATA.opportunity_total.toLocaleString()} opportunities: the highest-priority ones, with the top ones of every kind of action. Choose a language to see all of its own.</p>` : ''}
    ${shown.length ? `<ol class="opps">${shown.map(x => oppItem(x.o, x.l, !focus)).join('')}</ol>` : '<p class="note">Nothing matches these filters.</p>'}
    ${list.length > shown.length ? `<button class="chip more" id="showall">Show all ${list.length}</button>` : ''}
    ${focus ? '' : censusCaveat()}
    <details class="method"><summary>How opportunities are ranked</summary>
      <div class="otypes">${Object.entries(OT).map(([k, t]) => `<div class="otype-card" style="--c:var(${OCOLOR[k]})"><b>${esc(t.label)}</b>${esc(OBLURB[k])}</div>`).join('')}</div>
      <p class="note">Priority weighs how many people could use the technology, how big the gap is, and how weak current support is, divided by the rough cost of acting: 1 for sharing, shipping, measuring or standardising, 2 for improving a model, 3 for collecting new data. Voice technologies count everyone online; text technologies count only those who can also read and write text on a phone. The costs are rough guides, not estimates.</p>
      <div class="weightbar"><span>Count potential users as</span><div class="chips" role="group" aria-label="Weighting">
        ${Object.entries(WEIGHT).map(([k, w]) => `<button class="chip" id="w-${k}" data-w="${k}" aria-pressed="${weight === k}">${esc(w.label)}</button>`).join('')}
      </div></div>
      <p class="note">Currently ranked by ${esc(WEIGHT[weight].note)}.</p>
    </details>`;
  $('#view').querySelectorAll('[data-tm]').forEach(b => b.onclick = () => { team = b.dataset.tm; otype = 'all'; showAll = false; opportunities(lang); });
  $('#view').querySelectorAll('[data-w]').forEach(b => b.onclick = () => { weight = b.dataset.w; opportunities(lang); const d = $('details.method'); if (d) d.open = true; });
  $('#otsel').onchange = e => { otype = e.target.value; showAll = false; opportunities(lang); };
  $('#oresetf').onclick = () => { regionSel.clear(); countrySel.clear(); countryQuery = ''; tierSel.clear(); provider = 'All'; otype = 'all'; team = 'all'; showAll = false;
    if (lang) go('opportunities'); else opportunities(); };
  if ($('#orwrap')) wireMsel('orwrap', regionPicker, regionSel, REGIONS.length, async () => { showAll = false; await opportunities(lang); reopen('orwrap'); });
  if ($('#octrywrap')) wireCountries('octrywrap', async () => { showAll = false; await opportunities(lang); reopenCountries('octrywrap'); });
  if ($('#otierwrap')) wireMsel('otierwrap', tierPicker, tierSel, TIER_KEYS.length, async () => { showAll = false; await opportunities(lang); reopen('otierwrap'); });
  $('#opsel').onchange = e => { provider = e.target.value; team = 'all'; otype = 'all'; showAll = false; opportunities(lang); };
  const more = $('#showall'); if (more) more.onclick = () => { showAll = true; opportunities(lang); };
  navBox('opps', 'Find a language name or code', focus ? `${focus.name} (${focus.code})` : '');
}

async function oppDetail(id) {
  const l = BY[id.split('-')[0]];
  if (!l) return opportunities();
  await need(l.code);
  const o = l.opportunities.find(y => y.id === id);
  if (!o) return opportunities();
  const facts = DATA.facts[l.code] || {};
  const pct = v => v == null ? '—' : Math.round(v * 100) + '%';
  const kit = o.kit.length ? `<div class="tablebox"><table>
      <thead><tr><th>Resource</th><th>What it is</th><th>For ${esc(l.name)}</th><th>Licence</th><th>Commercial use</th></tr></thead>
      <tbody>${o.kit.map(k => `<tr><td><a href="${esc(k.link)}" target="_blank" rel="noopener">${esc(k.name)}</a></td><td>${esc(k.what)}</td><td>${esc(k.size)}</td><td>${esc(k.licence || '—')}</td><td>${esc(COMMERCIAL[k.commercial] || '—')}</td></tr>`).join('')}</tbody></table></div>
      <p class="note">Licences as published by each project; check the terms for your use before building on them.</p>`
    : '<p class="note">No open resources found yet in the sources tracked.</p>';
  const countries = l.reach_by_country.length ? `<div class="tablebox"><table>
      <thead><tr><th>Country</th><th class="num">Speakers</th><th class="num">Online today</th><th class="num">Online and able to text</th><th class="num">Online in five years</th></tr></thead>
      <tbody>${l.reach_by_country.map(c => `<tr><td>${esc(c.name)}</td><td class="num">${people(c.speakers)}</td><td class="num">${pct(c.online)}</td><td class="num">${pct(c.text)}</td><td class="num">${pct(c.online_5y)}</td></tr>`).join('')}</tbody></table></div>
      <p class="note">Speaker counts from LinguaMeta; internet use, mobile texting and literacy from the World Bank. National averages overstate connectivity for rural and minority-language speakers.</p>` : '';
  // every source this card checked, with what it records for the language (or that it doesn't list it)
  const checked = (o.checked || o.evidence).map(i => {
    const f = facts[i], name = (SVC[i] ? `${SVC[i][0]}${SVC[i][1] ? ` (${SVC[i][1]})` : ''}` : '') || L[i] || (f && f.source) || i;
    if (!f) return `<li>${esc(name)}: <span class="muted">${ROLE_OF[i] === 'measured' ? 'no published result for this language' : 'not listed'}</span></li>`;
    return `<li><a href="${esc(f.url.split(' ')[0])}" target="_blank" rel="noopener">${esc(name)}</a>: ${esc(showValue(f))}, retrieved ${esc(fmtDay(f.retrieved))}${f.note ? ` <span class="muted">· ${esc(f.note)}</span>` : ''}</li>`;
  }).join('');
  const u = o.users || {};
  const factors = [
    ['Potential users counted', u.estimated ? `${people(u['5y'])} in five years (${people(u.now)} today) · ${u.kind === 'voice' ? 'voice: everyone online' : 'text: online and able to text'}` : `${people(u.speakers)} speakers`],
    ['Reach score', `${(o.reach || {})['5y']?.toFixed(2) ?? '—'} (log of users, 10K = 0, 1 billion = 5)`],
    ['Gap', `${o.gap.toFixed(2)} (how much of the problem is unsolved)`],
    ['Need', `${o.need?.toFixed(2) ?? '—'} (1 minus current score for ${esc(TECHL[o.technology] || o.technology)})`],
    ['Momentum', `${o.momentum.toFixed(2)} (boost for a fast-growing user base)`],
    ['Cost', `${o.cost} (${esc(OT[o.type].label)}${o.cost !== OT[o.type].cost ? ', a bigger build than most of its type' : ''})`],
    ['Priority', `${o.priority_5y.toFixed(2)} in five years · ${o.priority_now.toFixed(2)} today · ${o.priority.toFixed(2)} all speakers`],
  ];
  const others = l.opportunities.filter(x => x.id !== o.id);
  $('#view').innerHTML = `
    <button class="back" id="back">← ${esc(l.name)} opportunities</button>
    <div class="opp-hero" style="--c:var(${OCOLOR[o.type]})">
      <div class="opp-head"><span class="otype">${esc(OT[o.type].label)}</span><span>${esc(TECHL[o.technology] || o.technology)}</span><a href="${LH(l.code)}">${esc(l.name)}</a><span>${esc(o.workstream)}</span></div>
      <h2>${esc(o.title)}</h2>
      <p class="why">${esc(o.why.split(' Ready to use:')[0])}</p>
      <div class="opp-foot"><span>For teams working on ${o.teams.map(t => esc(/^[A-Z]{2}/.test(TEAMS[t]) ? TEAMS[t] : TEAMS[t][0].toLowerCase() + TEAMS[t].slice(1))).join(', ')}</span><button class="chip" id="copylink">Copy link</button></div>
    </div>
    <h3 class="panel-h">Ready to use</h3>${kit}
    <h3 class="panel-h">Still needed</h3><p class="needed">${esc(o.missing)}</p>
    <p class="note">${esc(o.detail)}</p>
    ${countries ? `<h3 class="panel-h">Who it would reach</h3>${countries}` : ''}
    <h3 class="panel-h">Sources checked</h3>${checked ? `<ul class="checked">${checked}</ul>` : '<p class="note">Every data and technology source tracked here; none records anything for this language.</p>'}
    <p class="note">Something here out of date, or a resource we've missed? <a href="${REPO_URL}/issues/new/choose" target="_blank" rel="noopener">Send a correction on GitHub</a> or email <span class="email">langtechindex@gmail.com</span>.</p>
    <details class="method"><summary>How this ranks</summary>
      <div class="tablebox"><table><tbody>${factors.map(([k, v]) => `<tr><td>${esc(k)}</td><td>${v}</td></tr>`).join('')}</tbody></table></div>
      <p class="note">Priority = reach × gap × need × momentum ÷ cost.</p></details>
    ${others.length ? `<h3 class="panel-h">Other opportunities for ${esc(l.name)}</h3><ol class="opps">${others.map(x => oppItem(x, l, false)).join('')}</ol>` : ''}`;
  $('#back').onclick = () => { go('opportunities-' + l.code); };
  $('#copylink').onclick = async e => {
    const url = location.href.split('#')[0] + '#opp-' + o.id;
    try { await navigator.clipboard.writeText(url); e.target.textContent = 'Link copied'; }
    catch { e.target.textContent = url; }
  };
}

