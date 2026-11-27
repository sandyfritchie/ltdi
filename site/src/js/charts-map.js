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
  const dots = LANGS.filter(l => pt[l.code]).sort((a, b) => (a.code === mapFocus) - (b.code === mapFocus) || val(a) - val(b)).map(l => {
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
    const withArea = LANGS.filter(l => AREAS.paths[l.code] && inTiers(l));
    const order = Object.fromEntries([...keys].reverse().map((k, i) => [k, i]));  // best-covered drawn on top
    // One area the atlas draws for several LTDI languages (Serbian, Croatian, Bosnian, Montenegrin) is
    // drawn once, for the one on top, so the shared area isn't darkened by stacking
    const drawn = withArea.sort((a, b) => (a.code === mapFocus) - (b.code === mapFocus) || order[tierKey(a)] - order[tierKey(b)] || (AREAS.area[b.code] || 0) - (AREAS.area[a.code] || 0));
    const top = new Map(drawn.map(l => [AREAS.paths[l.code], l.code]));
    layer = `<g class="areas${mapFocus ? ' focusing' : ''}" filter="url(#soft)">${drawn.filter(l => top.get(AREAS.paths[l.code]) === l.code).map(l =>
      `<path d="${AREAS.paths[l.code]}" data-code="${l.code}"${l.code === mapFocus ? ' class="hit" filter="url(#soft)"' : ''} fill="var(${TIERC[tierKey(l)]})" fill-opacity="0.5" data-tip="<b>${esc(l.name)}</b><br>${tip(l)}"/>`).join('')}</g>`;
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
    <div class="maphead"><h3>The world's languages</h3>${toggle}</div>
    <div class="legend map">${legend}</div>
    ${focusBox}
    <div class="mapwrap"><div class="mapctl">
        <button id="zin" aria-label="Zoom in" title="Zoom in">+</button><button id="zout" aria-label="Zoom out" title="Zoom out">−</button><button id="zreset" class="reset" aria-label="Reset zoom" title="Reset">⟲</button>
      </div><svg id="worldmap"${F ? ' class="focusing"' : ''} viewBox="0 0 ${W} ${Hh}" role="img" aria-label="Map of ${GEO.points.length} languages; ${LANGS.length} scored">
      ${areasOn ? `<defs><filter id="soft" x="-20%" y="-20%" width="140%" height="140%"><feGaussianBlur id="softblur" stdDeviation="1"/></filter><clipPath id="landclip"><path d="${land}"/></clipPath></defs>` : ''}
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
      : `<p class="note">No history collected yet for ${esc(pn)}'s services. History so far comes from DeepL's docs, Meta's NLLB-200 and Belebele, OpenAI's Whisper, Common Voice and CLDR.</p>`;
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
  const stripTable = `<div class="tablebox"><table><thead><tr><th>Region</th><th class="num">Languages</th><th class="num">Mean ${P ? 'share' : 'LTDI'}</th><th class="num" title="Each language counted by its speakers: the score of the average speaker's language">Mean, by speakers</th><th>Highest</th><th>Lowest</th></tr></thead><tbody>${stripRows.map(([r, n, mean, wmean, hi, lo]) =>
    `<tr><td>${esc(r)}</td><td class="num">${n.toLocaleString()}</td><td class="num">${fmtS(mean)}</td><td class="num">${fmtS(wmean)}</td><td>${esc(hi)}</td><td>${esc(lo)}</td></tr>`).join('')}</tbody></table>
    <p class="note">Mean by speakers counts each language by its speakers, so it's the score of the average speaker's language; with all languages spoken in a region, the large international languages lift it.</p></div>`;

  $('#view').innerHTML = `<h2 class="sronly">Charts</h2>
    <div class="controls sticky"><span id="cregwrap">${regionPicker()}</span><span id="cctrywrap">${countryPicker()}</span><span id="ctierwrap">${tierPicker()}</span>${providerSelect('cpsel')}<span class="note" style="margin:0">${N.toLocaleString()} languages${P ? ` · ${esc(pn)}'s services only` : ''}</span>
      <button type="button" class="reset" id="cresetf"${!regionSel.size && !countrySel.size && !tierSel.size && !P ? ' hidden' : ''}>Reset filters</button></div>
    <section class="chart">
      <h3>How many languages each technology reaches today</h3>
      <p class="sub">${P ? `Each bar splits the ${N.toLocaleString()} languages by whether ${esc(pn)}'s services checked here offer them. Technologies are shown where ${esc(pn)} has at least one service we track.` : 'Each bar splits the ' + N.toLocaleString() + ' languages by how widely a technology is available in them. Widely available means offered by at least half of the services checked, or by at least ' + numWord(CFG.tech.full_min) + ' of them; for LLMs the services are the AI assistants\u2019 official language lists, and language identification counts open models. Text technologies count spoken varieties through the standard language their speakers write. The last two segments together are the speakers with no commercial service on the Ranking page.'} Hover a segment to see which languages.</p>
      <div class="legend ord">${LV.map(([lv, lab]) => `<span><i class="sw" style="background:var(--ord-${lv})"></i>${esc(lab)}</span>`).join('')}</div>
      <div class="covrows">${rows.map(r => r.html).join('')}</div>
      ${absent.length ? `<p class="note">No ${esc(pn)} service tracked for: ${esc(absent.join(', '))}.</p>` : ''}
      ${P ? `<p class="note">${COUNTING_NOTE} <a href="#providers">How companies' languages are counted, and how to correct them</a>.</p>` : ''}

      <details class="tbl"><summary>Show as a table</summary>${table1}</details>
    </section>
    <section class="chart">
      <h3>How many speakers each technology reaches today</h3>
      <p class="sub">The same split, with each language counted by its speakers: ${people(SP)} in all, added up per language, so people who speak several languages are counted in each.</p>
      <div class="legend ord">${LV.map(([lv, lab]) => `<span><i class="sw" style="background:var(--ord-${lv})"></i>${esc(lab)}</span>`).join('')}</div>
      <div class="covrows">${rowsS}</div>
      <details class="tbl"><summary>Show as a table</summary>${tableS}</details>
    </section>
    ${P && !Object.keys(H ? H.series : {}).some(k => SERIES_PROV[k] === provider) ? '' : `<section class="chart">
      <div class="plan-tablehead"><h3>How support has grown since 2019</h3><span class="chips" role="group" aria-label="Count">${[['langs', 'Languages'], ['speakers', 'Speakers']].map(([k, lab]) => `<button type="button" class="chip" data-hm="${k}" aria-pressed="${histMode === k}">${lab}</button>`).join('')}</span></div>
      <p class="sub">How many of these languages have each kind of support, or how many people speak them (added up per language), at mid-year and year-end. Lines start when the source's history does. Hover for the languages added.</p>
      ${multiples}
      <p class="note">Common Voice, CLDR, DeepL and Universal Dependencies from each project's release history. Open models and benchmarks are counted from their release dates using today's language lists.</p>
      <details class="tbl"><summary>Show as a table</summary>${table2}</details>
    </section>
    ${added ? `<section class="chart">
      <h3>When languages were added</h3>
      <p class="sub">The languages each source added in each half-year, or their speakers, on one scale, so the big expansions stand out, like Common Voice's September 2025 release and DeepL's additions that October. Hover a bar for the languages.</p>
      ${added}
      <p class="note">Counted from each source's own release records. A language counts in the half-year it first appears; one that dropped out and came back counts again when it returns. To follow additions as they happen, add <span class="code">https://langtechindex.org/changes.xml</span> to a feed reader.</p>
    </section>` : ''}`}
    <section class="chart">
      <div class="plan-tablehead"><h3>Where each language stands</h3><span class="chips" role="group" aria-label="Which languages">${[['all', 'All languages spoken there'], ['home', 'Languages from the region']].map(([k, lab]) => `<button type="button" class="chip" data-sm="${k}" aria-pressed="${stripMode === k}">${lab}</button>`).join('')}</span></div>
      <p class="sub">${P ? `Share of ${esc(pn)}'s ${provWhat(provider)} tracked here that cover each language, by region.` : 'Language Technology Development Index by region.'} Each dot is a language, with the lowest named below its row and the highest above; select one to open its profile. <b>All languages spoken there</b> puts a language in every region where it's spoken, so English, French and Spanish appear in several; <b>Languages from the region</b> puts each in its home region only (the region of the country it's from, or where most of its speakers live).</p>
      ${strip}
      <details class="tbl"><summary>Show as a table</summary>${stripTable}</details>
    </section>
    ${censusCaveat()}`;
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
    ${mapSection()}
    ${censusCaveat()}`;
  bindTips($('#view'));
  bindMap();
  wireMsel('mregwrap', regionPicker, regionSel, REGIONS.length, () => { const y = scrollY; mapView = null; mapPage(); reopen('mregwrap'); scrollTo(0, y); });
  wireCountries('mctrywrap', () => { const y = scrollY; mapView = null; mapPage(); reopenCountries('mctrywrap'); scrollTo(0, y); });
  wireMsel('mtierwrap', tierPicker, tierSel, TIER_KEYS.length, () => { const y = scrollY; mapPage(); reopen('mtierwrap'); scrollTo(0, y); });
  $('#mresetf').onclick = () => { const y = scrollY; regionSel.clear(); countrySel.clear(); countryQuery = ''; tierSel.clear(); mapView = null; mapPage(); scrollTo(0, y); };
  navBox('map', 'Find a language name or code');
  pinBar($('.controls.sticky'));
}

