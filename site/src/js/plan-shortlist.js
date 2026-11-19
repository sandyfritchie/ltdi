// ---------------------------------------------------------------------------------------- Plan ---
// Which languages next for a product: choose a technology and a starting point (nothing, a tracked
// service's list, or a pasted list); the languages not yet supported are ranked by the people they
// would reach online in five years, with what already exists for each, and a curve of the share of
// people reached as they're added. State lives in the address (#plan?t=...&from=...), so a plan can
// be shared.
const PLAN_TECHS = ['speech_input', 'tts', 'mt', 'llm', 'keyboard', 'interface', 'ocr', 'proofing', 'assistant'];
const PLAN_VOICE = new Set(['speech_input', 'tts', 'assistant']);
let plan = { t: 'speech_input', from: 'none', codes: '', ex: true, com: false, q: 'all', s: 'reach', fam: -1, n: 50, tg: 0 };
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
const SPEECH_KIND_LABELS = ['read', 'spontaneous', 'radio and video', 'test set'];
const hShort = h => h >= 10 ? Math.round(h).toLocaleString() : (+h).toFixed(1).replace(/\.0$/, '');
// Open speech hours by kind ([read, spontaneous, radio and video, test set]), following the
// commercial-use switch; training hours leave out benchmarks, which should stay out of training
const speechKinds = l => (plan.com ? l.skc || l.sk : l.sk) || (l.sh ? [l.sh, 0, 0, 0] : [0, 0, 0, 0]);
const trainHours = k => k[0] + k[1] + k[2];
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
  plan.s = 'reach';
  if (q.has('q') || full) plan.q = ['all', 'pub', 'ind'].includes(q.get('q')) ? q.get('q') : 'all';
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
    // well served: at least half the major services tracked offer it (a regional provider counting as one
    // more), the line the site uses everywhere; what's left is under-served
    for (const l of LANGS) if (levelOf(l, plan.t) === 'full') supported.add(l.code);
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
    .sort((a, b) => (plan.s === 'ready' ? b.rd.n / (b.rd.of || 1) - a.rd.n / (a.rd.of || 1) : 0) || b.r5 - a.r5);
  let cum = base;
  const rows = cands.map(r => { cum += r.r5; return { ...r, share: total ? cum / total : 0 }; });
  const groups = new Map();
  for (const l of LANGS) {
    if (!l._gp.length || !inRegion(l) || !inCountry(l) || supported.has(l.code) || (plan.ex && l.wi)) continue;
    const r = reach5(l);
    if (r > 0) for (const g of l._gp) { const x = groups.get(g) || [0, 0]; x[0]++; x[1] += r; groups.set(g, x); }
  }
  const famOpts = [...groups].filter(([, [n]]) => n >= 2).sort((a, b) => b[1][1] - a[1][1]).slice(0, 400);
  return { T, voice, rows, total, base, supported, unknown, baseName, famOpts, nSupported: considered.filter(l => supported.has(l.code)).length };
}
function planCells(r, T, sl = false) {
  const l = r.l, cons = [...(T.consumer || [])], baseId = !sl && plan.from.startsWith('svc:') ? plan.from.slice(4) : null;
  const others = cons.filter(id => id !== baseId), nOn = others.filter(id => l._offers.has(id)).length;
  const reg = (T.regional || []).filter(id => id !== baseId && l._offers.has(id)).length;
  const models = (T.open || []).filter(id => id !== baseId && l._offers.has(id) && !(plan.com && RES[id] && RES[id].commercial === 'no')).map(id => {
    const [name] = SVC[id] || [id], q = PLAN_Q[id], v = q && l.qv && l.qv[q[0]];
    const shown = v != null && qualityShown(id);
    const lic = RES[id] && RES[id].commercial === 'no' ? ', research licence' : '';
    return `${name}${shown ? ` (${q[1](v)}${lic})` : lic ? ` (${lic.slice(2)})` : ''}`;
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
  const need = short ? (PLAN_VOICE.has(plan.t) ? `${hShort(short)} h` : big(short)) : 'Met';
  // its countries in scope, most speakers first, leaving out those where only immigrant communities speak it
  // (unless those are all there is in scope: Tagalog with the United States chosen, say)
  const here = Object.entries(l._cs).filter(([c]) => sl || countryIn(c)).sort((a, b) => (b[1] || 0) - (a[1] || 0)).map(([c]) => c);
  const home = here.filter(c => !l._im.has(c));
  const cs = home.length ? home : here;
  const scriptsIn = c => l._csc[c] || l._sc.slice(0, 1);
  const scripts = [...new Set(cs.flatMap(scriptsIn))].sort((a, b) => l._sc.indexOf(a) - l._sc.indexOf(b));
  const locales = cs.flatMap(c => scriptsIn(c).map(sc => `${l.code}-${sc}-${c.toUpperCase()}`));
  if (!cs.length) scripts.push(...l._sc.slice(0, 1));
  return { scripts, locales, others: `${nOn} of ${others.length}${reg ? ' + regional' : ''}`, models: models.join('; ') || '—', data, kinds, short, need, countries: cs };
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
      <text x="${(L + W - R) / 2}" y="${H - 1}" text-anchor="middle">languages added, ${plan.s === 'ready' ? 'readiest first, then by reach' : 'most-reaching first'}</text></g>
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
  const head = ['rank', 'code', 'name', 'family', 'branch', 'official_in', 'wikipedia_views_12_months', 'hf_models', 'hf_model_downloads_30_days', 'scripts', 'engineering_flags', 'countries', 'locales', 'online_in_5_years', 'online_today', 'cumulative_share', 'ready', 'missing', 'other_services_offering', 'open_models', 'data', 'hours_read', 'hours_spontaneous', 'hours_radio_video', 'hours_test_set', 'target', 'short_of_target'];
  const q = v => /[",\n]/.test(v) ? `"${String(v).replace(/"/g, '""')}"` : v;
  const lines = [head.join(',')].concat(P.rows.map((r, i) => { const c = planCells(r, P.T, sl);
    return [i + 1, r.l.code, r.l.name, famName(r.l), branchName(r.l), Object.entries(r.l._of).map(([cc, st]) => cc.toUpperCase() + (st === 'o' ? '' : ':' + st)).join(' '),
      r.l.wv || '', r.l.hm || '', r.l.hd || '', c.scripts.join(' '), flagLabels(r.l).join('; '), c.countries.map(x => x.toUpperCase()).join(' '), c.locales.join(' '),
      Math.round(r.r5), Math.round(r.r0), r.share.toFixed(4), `${r.rd.n} of ${r.rd.of}`, r.rd.items.filter(x => !x.ok).map(x => x.label).join('; '), c.others, c.models, c.data, ...(c.kinds ? c.kinds.map(h => h.toFixed(1)) : ['', '', '', '']), planTarget(), c.short].map(q).join(','); }));
  return lines.join('\n') + '\n';
}
// The shortlist: languages a team is weighing for its next wave. Kept in the link (#shortlist?codes=...)
// so a colleague opens the same table, and in this browser so it survives moving between pages.
let shortlist = (() => { try { return JSON.parse(localStorage.getItem('ltdi-shortlist') || '[]').filter(c => BY[c]); } catch (e) { return []; } })();
const saveShortlist = () => { try { localStorage.setItem('ltdi-shortlist', JSON.stringify(shortlist)); } catch (e) { /* kept for this visit only */ } };
const onShortlist = code => shortlist.includes(code);
const slButton = l => { const on = onShortlist(l.code);
  return `<button type="button" class="slbtn" data-sl="${l.code}" aria-pressed="${on}" title="${on ? 'On your shortlist: select to remove' : 'Add to your shortlist'}" aria-label="${on ? 'Remove' : 'Add'} ${esc(l.name)} ${on ? 'from' : 'to'} the shortlist">${on ? '✓' : '+'}</button>`; };
const slWide = l => { const on = onShortlist(l.code);
  return `<button type="button" class="chip slwide" data-sl="${l.code}" aria-pressed="${on}">${on ? 'On your shortlist ✓' : 'Add to shortlist'}</button>`; };
function slHash() {
  const q = new URLSearchParams({ codes: shortlist.join(','), t: plan.t });
  if (plan.com) q.set('com', '1');
  if (plan.q !== 'all') q.set('q', plan.q);
  if (plan.s !== 'reach') q.set('s', plan.s);
  return '#shortlist?' + q.toString().replace(/%2C/g, ',');
}
function toggleShortlist(code) {
  shortlist = onShortlist(code) ? shortlist.filter(c => c !== code) : [...shortlist, code];
  saveShortlist();
  document.querySelectorAll(`[data-sl="${code}"]`).forEach(b => {
    const on = onShortlist(code), name = (BY[code] || {}).name || code;
    b.setAttribute('aria-pressed', String(on));
    if (b.classList.contains('slwide')) b.textContent = on ? 'On your shortlist ✓' : 'Add to shortlist';
    else { b.textContent = on ? '✓' : '+'; b.title = on ? 'On your shortlist: select to remove' : 'Add to your shortlist';
      b.setAttribute('aria-label', `${on ? 'Remove' : 'Add'} ${name} ${on ? 'from' : 'to'} the shortlist`); }
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
  plan.q = ['pub', 'ind'].includes(q.get('q')) ? q.get('q') : 'all';
  plan.s = 'reach';
}
function shortlistRows() {
  const T = CFG.tech.technologies[plan.t], voice = PLAN_VOICE.has(plan.t), o = { com: plan.com, q: plan.q };
  const r5 = l => (voice ? l.o5 : l.ot5) || 0, r0 = l => (voice ? l.online : l.ot) || 0;
  const total = LANGS.reduce((n, l) => n + r5(l), 0);
  let cum = 0;
  const rows = shortlist.map(c => BY[c]).filter(Boolean).map(l => ({ l, r5: r5(l), r0: r0(l), rd: readiness(l, plan.t, o) }))
    .sort((a, b) => (plan.s === 'ready' ? b.rd.n / (b.rd.of || 1) - a.rd.n / (a.rd.of || 1) : 0) || b.r5 - a.r5)
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
      <p class="sub">The languages you're weighing for a wave, side by side with the Plan tab's columns. Add them with the + beside a language in the Plan table or on its page, or type codes or names below. The link keeps the list, so a colleague who opens it sees the same table.</p>
      <div class="sl-controls">
        <label class="plan-l">Technology <select id="sl-t">${PLAN_TECHS.map(k => `<option value="${k}"${plan.t === k ? ' selected' : ''}>${esc(CFG.tech.technologies[k].label)}</option>`).join('')}</select></label>
        <label class="plan-l">Quality figures <select id="sl-q"><option value="all"${plan.q === 'all' ? ' selected' : ''}>All published</option><option value="pub"${plan.q === 'pub' ? ' selected' : ''}>On public test sets only</option><option value="ind"${plan.q === 'ind' ? ' selected' : ''}>Independently measured only</option></select></label>
        <label class="switch" title="Count only open data and models whose licence permits commercial use"><input type="checkbox" role="switch" id="sl-com"${plan.com ? ' checked' : ''}><span class="track" aria-hidden="true"></span>Commercially usable data and models only</label>
      </div>
      <form class="sl-add" id="sl-form"><input id="sl-in" type="text" autocomplete="off" aria-label="Languages to add" placeholder="Add languages: codes or names, such as yo, ha, Igbo"><button type="submit" class="chip">Add</button></form>
      <p class="note sl-msg" id="sl-msg" aria-live="polite"></p>
    </section>
    <section class="chart">
      <div class="plan-tablehead"><h3>${n ? `${n} ${n === 1 ? 'language' : 'languages'}: ${people(sum5)} ${who} in five years (${pct(sum5 / (P.total || 1))} of the world's), ${people(sum0)} today` : 'No languages yet'}</h3><span><button type="button" class="chip" id="sl-csv"${n ? '' : ' disabled'}>Download CSV</button> <button type="button" class="chip" id="sl-link"${n ? '' : ' disabled'}>Copy link</button> <button type="button" class="chip" id="sl-clear" style="min-width:8.5em"${n ? '' : ' disabled'}>Clear</button></span></div>
      ${n ? `<div class="tablebox">${planHead(T, P, who, 'the world', true)}<tbody>${P.rows.map((r, i) => planRow(r, i, T, true)).join('')}</tbody></table></div>`
          : `<p class="note">Nothing on the shortlist. Open the <a href="#plan">Plan tab</a> and select + beside the languages you want to compare, or add them above.</p>`}
      <p class="note">Reached is the share of ${who} worldwide in five years covered by the languages so far, in the table's order; speakers of several listed languages are counted in each. Ready counts the ingredients for building ${esc(T.label.toLowerCase())} recorded for each language (hover a figure for the list). The other columns are as in the Plan tab, for the whole world.</p>
    </section>`;
  const redraw = () => { history.replaceState(null, '', slHash()); const y = scrollY; shortlistPage(); scrollTo(0, y); };
  $('#sl-t').onchange = e => { plan.t = e.target.value; redraw(); };
  $('#sl-q').onchange = e => { plan.q = e.target.value; redraw(); };
  $('#sl-com').onchange = e => { plan.com = e.target.checked; redraw(); };
  $('#view').querySelectorAll('[data-psort]').forEach(b => b.onclick = () => { plan.s = b.dataset.psort; redraw(); });
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
function planHead(T, P, who, scopeName, sl) {
  const voice = PLAN_VOICE.has(plan.t), U = PLAN_TARGETS[planUnit(plan.t)];
  const data = voice
    ? `<th class="num pc-h" title="Open transcribed speech read aloud">Read (h)</th><th class="num pc-h" title="Open transcribed speech of people talking in their own words: answers, descriptions, conversation">Spontaneous (h)</th><th class="num pc-h" title="Radio news with transcripts, and videos with their uploaders' subtitles">Radio and video (h)</th><th class="num pc-h" title="Small sets built for measuring models (FLEURS); not counted towards the target">Test set (h)</th>`
    : `<th class="num pc-h">${plan.t === 'mt' ? 'Sentence pairs with English' : 'Words of web text'}</th>`;
  return `<table class="plantab"><thead><tr><th class="num pc-n">#</th><th class="pc-lang">Language</th><th class="pc-code" title="The code the Index uses: ISO 639-1 where there is one, otherwise ISO 639-3">Code</th><th class="pc-code" title="Its script in the countries listed, as ISO 15924 codes">Script</th><th class="pc-cty" title="Where it's spoken, most speakers first, as ISO 3166 country codes; countries where only immigrant communities speak it are left out">Countries</th><th class="num pc-now" title="Estimated ${who} in five years, in ${esc(scopeName)}, and their share of its speakers">Online in 5 years</th><th class="pc-mod" title="Open models listed for it, with their published quality where there is a figure">Open models</th>${data}<th class="num pc-need" title="How much more open data it needs to reach the target, ${esc(magn(planTarget()))} ${esc(U.label)}${voice ? ', not counting test sets' : ''}">Short of ${esc(magn(planTarget()))} ${{ hours: 'h', pairs: 'pairs', words: 'words' }[planUnit(plan.t)]}</th></tr></thead>`;
}
function planRow(r, i, T, sl) {
  const c = planCells(r, T, sl), l = r.l, voice = PLAN_VOICE.has(plan.t);
  const share = (voice ? l.o5s : l.ot5s) || 0;
  const onCell = `${people(r.r5)}${share ? ` <span class="pct p${pctBand(share)}">(${Math.round(share * 100)}%)</span>` : ''}`;
  const h = v => v >= 0.05 ? hShort(v) : '—';
  const data = voice ? c.kinds.map(v => `<td class="num">${h(v)}</td>`).join('')
    : `<td class="num">${(plan.t === 'mt' ? l.ps : l.ww) ? big(plan.t === 'mt' ? l.ps : l.ww) : '—'}</td>`;
  return `<tr><td class="num">${i + 1}</td><td>${slButton(l)}<a href="${LH(l.code)}" title="${esc([famName(l), branchName(l)].filter(Boolean).join(' › '))}">${esc(l.name)}</a></td><td class="pc-m">${l.code}</td><td class="pc-m">${c.scripts.join(' ') || '—'}</td><td class="pc-m" title="${esc(c.locales.join(' '))}">${planCodes(c.countries, l)}</td><td class="num">${onCell}</td><td class="small">${esc(c.models)}</td>${data}<td class="num${c.short ? '' : ' muted'}">${esc(c.need)}</td></tr>`;
}
function planPage() {
  const P = planRows(), T = P.T;
  const svcOpts = [...(T.consumer || []), ...(T.regional || []), ...(T.open || [])].filter(id => SVC[id])
    .map(id => `<option value="svc:${id}"${plan.from === 'svc:' + id ? ' selected' : ''}>${esc(SVC[id][0])}${SVC[id][1] ? ` · ${esc(SVC[id][1])}` : ''}</option>`).join('');
  const shown = P.rows.slice(0, plan.n);
  const pct = v => `${Math.round(v * 100)}%`;
  const scopeName = countrySel.size ? [...countrySel].map(c => COUNTRY_NAMES[c]).join(', ') : regionSel.size ? [...regionSel].join(', ') : 'the world';

  const who = P.voice ? 'people online' : 'people online and able to text';
  $('#view').innerHTML = `
    <div class="plan-top">
    <section class="chart planhead">
      <h2 class="plan-h">Plan which languages to add next</h2>
      <p class="sub">Choose a technology and what your product supports today. The languages it doesn't yet support are ranked by the ${who} they'd reach in five years, with what already exists for each.</p>
      <div class="plan-controls">
        <label class="plan-l">Technology <select id="pl-t">${PLAN_TECHS.map(k => `<option value="${k}"${plan.t === k ? ' selected' : ''}>${esc(CFG.tech.technologies[k].label)}</option>`).join('')}</select></label>
        <label class="plan-l">Starting from <select id="pl-from"><option value="none"${plan.from === 'none' ? ' selected' : ''}>Nothing yet</option><option value="under"${plan.from === 'under' ? ' selected' : ''} title="Leaves out languages that at least half the major services tracked for this technology already offer">Under-served languages</option><option value="list"${plan.from === 'list' ? ' selected' : ''}>A list I paste</option><optgroup label="This list">${svcOpts}</optgroup></select></label>
        <label class="plan-l">Data target, in ${esc(PLAN_TARGETS[planUnit(plan.t)].label)} <select id="pl-tg" title="The table shows how far each language is short of this much open data">${PLAN_TARGETS[planUnit(plan.t)].opts.map(n => `<option value="${n}"${planTarget() === n ? ' selected' : ''}>${magn(n)}</option>`).join('')}</select></label>
        <label class="plan-l">Quality figures <select id="pl-q" title="Which published quality figures to show for open models"><option value="all"${plan.q === 'all' ? ' selected' : ''}>All published</option><option value="pub"${plan.q === 'pub' ? ' selected' : ''}>On public test sets only</option><option value="ind"${plan.q === 'ind' ? ' selected' : ''}>Independently measured only</option></select></label>
        <label class="plan-l">Family or branch <input id="pl-fam" class="plan-in" list="pl-fams" autocomplete="off" placeholder="Any, or type one: Bantu, Indo-Aryan …" value="${plan.fam >= 0 ? esc(GN[plan.fam][1]) : ''}"></label>
        <datalist id="pl-fams">${P.famOpts.map(([g, [n, r]]) => `<option value="${esc(GN[g][1])}">${n.toLocaleString()} languages · ${people(r)}</option>`).join('')}</datalist>
        <div class="plan-scope"><span class="plan-l">Where</span><span id="plregwrap">${regionPicker()}</span><span id="plctrywrap">${countryPicker()}</span></div>
      </div>
      ${plan.from === 'list' ? `<div class="plan-paste"><textarea id="pl-codes" rows="3" placeholder="Language codes or names, separated by commas, spaces or new lines: en, es, yo, Hausa ...">${esc(plan.codes)}</textarea>
        <p class="note">${P.supported.size.toLocaleString()} recognised${P.unknown.length ? `; not recognised: ${esc(P.unknown.slice(0, 12).join(', '))}${P.unknown.length > 12 ? ' …' : ''}` : ''}.</p></div>` : ''}
      <div class="plan-toggles">
        <label class="switch" title="Count spoken varieties whose speakers mostly read and write a major standard language (Wu, Egyptian Arabic, Bhojpuri). When off, they're left out unless your list includes them"><input type="checkbox" role="switch" id="pl-ex"${plan.ex ? '' : ' checked'}><span class="track" aria-hidden="true"></span>Include varieties of major languages</label>
        <label class="switch" title="Count only open data and models whose licence permits commercial use"><input type="checkbox" role="switch" id="pl-com"${plan.com ? ' checked' : ''}><span class="track" aria-hidden="true"></span>Commercially usable data and models only</label>
      </div>
    </section>
    <section class="chart plangraph">
      <h3>${P.rows.length ? `From ${pct(P.base / (P.total || 1))} to 100% of ${who} in ${esc(scopeName)}` : 'Nothing left to add'}</h3>
      <p class="sub">${P.baseName ? `Starting from ${esc(P.baseName)}: ${P.nSupported.toLocaleString()} ${P.nSupported === 1 ? 'language' : 'languages'} reaching ${people(P.base)} of ${people(P.total)} in five years.` : `Starting from nothing: ${people(P.total)} ${who} in five years across ${P.rows.length.toLocaleString()} languages.`}${plan.fam >= 0 ? ` Only ${esc(GN[plan.fam][1])} languages are counted.` : ''}${plan.ex ? ' Varieties of major languages are left out of the list and the totals.' : ' Varieties of major languages are counted in the list and the totals.'} Each step adds the next language in the table below.</p>
      ${planCurve(P.rows, P.base, P.total)}
    </section>
    </div>
    <section class="chart">
      <div class="plan-tablehead"><h3>${plan.from === 'under' ? 'Under-served languages' : 'Languages to add'}, by reach</h3><span><a class="chip slchip" href="${slHash()}" title="The languages you've marked with +">Shortlist (<span class="slcount">${shortlist.length}</span>)</a> <button type="button" class="chip" id="pl-csv">Download CSV</button> <button type="button" class="chip" id="pl-link">Copy link</button></span></div>
      <div class="tablebox">${planHead(T, P, who, scopeName, false)}
      <tbody>${shown.map((r, i) => planRow(r, i, T, false)).join('')}</tbody></table></div>
      ${P.rows.length > shown.length ? `<button type="button" class="chip" id="pl-more">Show ${Math.min(50, P.rows.length - shown.length)} more of ${(P.rows.length - shown.length).toLocaleString()}</button>` : ''}
      <p class="note">People online in five years are estimates from LinguaMeta's speaker counts and the World Bank's connectivity data, with the share of the language's speakers beside them. Countries are ISO 3166 codes, most speakers first, leaving out countries where only immigrant communities speak it, so the code, script and a country give a locale (pnb-Arab-PK); hover the countries for the locales.</p>
      <p class="note">Open models show their published quality where there is a figure${plan.t === 'speech_input' ? ': character error rate (CER) for Omnilingual ASR, and word error rate (WER) on FLEURS for Whisper' : plan.t === 'mt' ? ': chrF on FLORES-200 for NLLB-200' : ''}. ${plan.t === 'speech_input' ? "Omnilingual ASR's figures are its makers' own, on test data that isn't public, so treat them with more caution than figures measured on FLEURS. " : ''}None of the open models' figures is independently measured yet; the Quality figures menu chooses which to show.</p>
      <p class="note">${P.voice ? `Open data is transcribed speech in the open datasets tracked. Read: Common Voice, Kathbath, NaijaVoices, Multilingual LibriSpeech. Spontaneous: Common Voice Spontaneous Speech, WAXAL, IndicVoices (its first release; the full dataset is larger), Vaani. Radio and video: Shrutilipi's radio news, and YouTube videos with their uploaders' subtitles in YODAS2, which nobody has checked. Test set: FLEURS, about 12 hours a language, built for measuring models, so it doesn't count towards the target.` : plan.t === 'mt' ? 'Open data is sentence pairs with English in OPUS.' : 'Open data is web text in FineWeb-2.'}${plan.com ? (P.voice ? ' Only datasets whose licence permits commercial use are counted.' : plan.t === 'mt' ? " OPUS corpora carry their own licences, which aren't checked here." : '') : ''} Licences are as each project publishes them; this isn't legal advice.${plan.from === 'under' ? ` Under-served means fewer than half of the major services tracked for ${esc(T.label.toLowerCase())} offer it (a regional provider counts as one more), the line the rest of the site uses for "most services".` : ''} The CSV adds each language's readiness and the commercial services that offer it.</p>
    </section>`;
  const redraw = () => { history.replaceState(null, '', planHash()); const y = scrollY; planPage(); scrollTo(0, y); };
  $('#pl-t').onchange = e => { plan.t = e.target.value; if (plan.from.startsWith('svc:')) plan.from = 'none'; plan.n = 50; plan.tg = 0; redraw(); };  // the target's unit changes too
  $('#pl-from').onchange = e => { plan.from = e.target.value; plan.n = 50; redraw(); };
  $('#pl-ex').onchange = e => { plan.ex = !e.target.checked; redraw(); };
  $('#pl-com').onchange = e => { plan.com = e.target.checked; redraw(); };
  $('#pl-q').onchange = e => { plan.q = e.target.value; redraw(); };
  $('#pl-tg').onchange = e => { plan.tg = +e.target.value; redraw(); };
  $('#pl-fam').onchange = e => {
    const v = e.target.value.trim().toLowerCase();
    if (!v) plan.fam = -1;
    else { const hit = P.famOpts.find(([g]) => GN[g][1].toLowerCase() === v) || P.famOpts.find(([g]) => GN[g][1].toLowerCase().includes(v)); if (hit) plan.fam = hit[0]; }
    plan.n = 50; redraw();
  };
  $('#view').querySelectorAll('[data-psort]').forEach(b => b.onclick = () => { plan.s = b.dataset.psort; redraw(); });
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

