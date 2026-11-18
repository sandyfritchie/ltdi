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
  const send = () => window.goatcounter.count && window.goatcounter.count({ path });
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
  countView();
  let m;
  if (h !== 'map') { mapFocus = null; mapView = null; }
  navBox('go', 'Find a language name or code');  // each view may give the box another job
  if (missing !== undefined) notFound(missing);
  else if ((m = h.match(/^lang-([a-z]+)$/)) && BY[m[1]]) language(m[1]);
  else if (m) notFound(m[1]);  // #lang-xx for a code the Index doesn't have
  else if ((m = h.match(/^compare-([a-z]+)-([a-z]+)$/))) compare(m[1], m[2]);
  else if (h === 'charts') { if (!HIST) $('#view').innerHTML = ''; histData().then(() => curRoute() === 'charts' && charts()); }
  else if (h === 'map') mapPage();
  else if (h === 'about') about();
  else if (h === 'opportunities') opportunities();
  else if ((m = h.match(/^opportunities-([a-z]+)$/))) opportunities(m[1]);
  else if ((m = h.match(/^opp-([a-z0-9-]+)$/))) oppDetail(m[1]);
  else if (h === 'plan' || h.startsWith('plan?')) { planFromHash(h); planPage(); }
  else if (h === 'shortlist' || h.startsWith('shortlist?')) { slFromHash(h); shortlistPage(); }
  else ranking();
  // From a language (or compare) page, the Opportunities tab opens that language's opportunities
  const cur = (h.match(/^(?:lang|opportunities)-([a-z]+)$/) || h.match(/^(?:compare|opp)-([a-z]+)-/) || [])[1];
  const otab = document.getElementById('tab-opportunities');
  if (otab) otab.setAttribute('href', cur ? '#opportunities-' + cur : '#opportunities');
  const tab = missing !== undefined ? '' : h.startsWith('opp') ? 'opportunities' : h.startsWith('plan') || h.startsWith('shortlist') ? 'plan' : ['charts', 'map', 'about'].includes(h) ? h : (h === '' || h === 'ranking') ? 'ranking' : '';
  tipHide();
  const lm = h.match(/^lang-([a-z0-9]+)$/), TT = { map: 'Map', charts: 'Charts', opportunities: 'Opportunities', plan: 'Plan', about: 'About' };
  document.title = missing !== undefined || (lm && !BY[lm[1]]) ? 'Not found · Language Technology Development Index'
    : lm && BY[lm[1]] ? `${BY[lm[1]].name}: language technology support · LTDI`
    : TT[tab] ? `${TT[tab]} · Language Technology Development Index` : 'Language Technology Development Index';
  for (const t of ['ranking', 'map', 'charts', 'opportunities', 'plan', 'about']) {
    const a = document.getElementById('tab-' + t);
    if (a) t === tab ? a.setAttribute('aria-current', 'page') : a.removeAttribute('aria-current');
  }
  window.scrollTo(0, 0);
}
addEventListener('hashchange', route);
addEventListener('popstate', route);
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
