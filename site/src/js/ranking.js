// ---------------------------------------------------------------- ranking
let query = '', rankAll = false, sortBy = 'rank', sortDir = 1, sortChosen = false;  // until a column is chosen: by rank, or by speakers with a region or country chosen
const tierSel = new Set();  // tiers shown in the ranking; empty means all
let showGaps = false;       // only languages with something in the Gaps column
const endSel = new Set();   // endangerment levels shown; empty means every living language
// UNESCO's levels as LinguaMeta gives them; "extinct" covers languages LTDI keeps out of the ranking
const END_LEVELS = [['not_endangered', 'Not endangered'], ['vulnerable', 'Vulnerable'], ['definitely_endangered', 'Definitely endangered'],
  ['severely_endangered', 'Severely endangered'], ['critically_endangered', 'Critically endangered'], ['revitalizing', 'Revitalizing'],
  ['extinct', 'Extinct'], ['none', 'Not assessed']];
const END_LABEL = Object.fromEntries(END_LEVELS);
const END_SOURCE = { linguameta: 'from LinguaMeta', glottolog: 'from Glottolog 5.4 (LinguaMeta gives none)',
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
const RANK_PAGE = 100;  // rows shown before "Show all"; searching shows every match
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
const GAP_SHORT = { speech_input: 'Speech input', tts: 'Text-to-speech', mt: 'Translation', llm: 'LLM app lists', keyboard: 'Keyboard', assistant: 'Voice assistant' };
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
      <span id="endwrap" title="UNESCO's endangerment level, from LinguaMeta (Glottolog where LinguaMeta gives none). Extinct languages are listed only when chosen here">${endPicker()}</span>
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
    <div id="censusnote"></div>
    <p class="note"><strong>About this edition.</strong> ${LANGS.length < 100 ? `A ${LANGS.length}-language slice to test the method.` : `${LANGS.length.toLocaleString()} languages.`}${ALL.length > LANGS.length ? ` ${(ALL.length - LANGS.length).toLocaleString()} extinct languages are left out; choose Extinct in the endangerment drop-down to list them.` : ''} Each technology scores by the share of services that offer it, weighted by how fully each one does (features, voice types, error rates). The Gaps column shows which of the six main technologies (keyboard, speech input, text-to-speech, translation, LLMs, voice assistants) no commercial service offers; hover an icon for details. Languages with the same score share a rank, shown as =1,914. Select a language to see every value and its source. <a href="data/ltdi-${DATA.edition}.csv" target="_blank" rel="noopener">Download the scores (CSV)</a>.</p>`;
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
    const rows = rankAll || q ? all : all.slice(0, RANK_PAGE);
    $('#censusnote').innerHTML = censusCaveat();
    $('#rankmore').innerHTML = rows.length < all.length ? `<button class="chip more" id="rankall">Show all ${all.length.toLocaleString()} languages</button>` : '';
    const btn = $('#rankall'); if (btn) btn.onclick = () => { rankAll = true; draw(); };
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
  $('#resetf').onclick = () => { regionSel.clear(); countrySel.clear(); countryQuery = ''; tierSel.clear(); endSel.clear(); showGaps = false; query = ''; rankAll = false; sortChosen = false; ranking(); };
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

