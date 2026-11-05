// fl00r: launch a coin on Raydium LaunchLab at any starting market cap
(() => {
const $ = s => document.querySelector(s), $$ = s => [...document.querySelectorAll(s)];
const RM = matchMedia('(prefers-reduced-motion: reduce)').matches;
const esc = s => String(s || '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
// ---------------------------------------------------------------- the curve (identical to LaunchLab's constant product with these numbers)
const SUPPLY = 1e9, SELL = 690983005, POOL = SUPPLY - SELL, VTOK = 1.25e9, RAISE_K = 1.5451, FILL_K = 5;
const STD = { vSol: 30, vTok: 1.073e9 };                       // a standard launchpad curve, for comparison
const S = { start: 215, min: 19.5, max: 50000, sol: null, status: null, wallet: null, provider: null };
const vSol = M => M * 1.25;
const buyShare = (M, sol) => VTOK * (1 - vSol(M) / (vSol(M) + sol)) / SUPPLY;
const stdShare = sol => STD.vTok * (1 - STD.vSol / (STD.vSol + sol)) / SUPPLY;
const STD_START = SUPPLY * STD.vSol / STD.vTok;               // ≈ 27.96 SOL
const fromK = k => S.min * Math.pow(S.max / S.min, k / 1000), toK = M => Math.round(1000 * Math.log(M / S.min) / Math.log(S.max / S.min));
const trim = x => x.replace(/\.0+$|(\.\d*?)0+$/, '$1'); const fmtN = n => n >= 1e9 ? trim((n / 1e9).toFixed(2)) + 'B' : n >= 1e6 ? trim((n / 1e6).toFixed(n >= 1e7 ? 1 : 2)) + 'M' : n >= 1e3 ? trim((n / 1e3).toFixed(n >= 1e5 ? 0 : 1)) + 'K' : trim(n.toFixed(n >= 100 ? 0 : 1));
const usd = sol => S.sol ? '$' + fmtN(sol * S.sol) : fmtN(sol) + ' SOL';
const sol = n => (n >= 1000 ? Math.round(n).toLocaleString('en-US') : n >= 10 ? n.toFixed(1) : n.toFixed(2)) + ' SOL';
const pct = x => x >= .1 ? (x * 100).toFixed(1) + '%' : x >= .01 ? (x * 100).toFixed(2) + '%' : (x * 100).toFixed(3) + '%';
const toast = (m) => { const t = $('#toast'); t.textContent = m; t.classList.add('on'); clearTimeout(toast.t); toast.t = setTimeout(() => t.classList.remove('on'), 2600); };

// ---------------------------------------------------------------- intro: a terminal boots, reads LaunchLab live, then the floors build and the doors open
const statusP = api('status'); statusP.catch(() => {});
const intro = $('#intro');
const openIntro = () => { if (intro.classList.contains('open')) return; intro.classList.add('show', 'open'); document.body.classList.remove('booting'); setTimeout(() => document.body.classList.add('ready'), 350); setTimeout(() => intro.classList.add('gone'), 1100); };
const sleep = ms => new Promise(r => setTimeout(r, ms));
async function runBoot() {
  await sleep(120); if (intro.classList.contains('open')) return;
  intro.classList.add('show'); await sleep(2300); openIntro();
}
if (RM) { intro.classList.add('gone'); document.body.classList.remove('booting', ); document.body.classList.add('ready'); }
else { runBoot(); ['click', 'keydown', 'wheel', 'touchstart'].forEach(e => addEventListener(e, () => setTimeout(openIntro, 60), { once: true, passive: true })); }

// ---------------------------------------------------------------- nav, progress, reveals, active link
const nav = $('#nav'), prog = $('#prog');
const onScroll = () => { const h = document.documentElement, m = h.scrollHeight - h.clientHeight; prog.style.transform = `scaleX(${m > 0 ? h.scrollTop / m : 0})`; nav.classList.toggle('solid', h.scrollTop > 30); how(); };
addEventListener('scroll', onScroll, { passive: true });
const io = new IntersectionObserver(es => es.forEach(e => { if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); } }), { threshold: .15 });
$$('.rv').forEach((el, i) => { el.style.transitionDelay = (i % 3) * 70 + 'ms'; io.observe(el); });
const links = $$('#nav nav a'), secs = links.map(a => $(a.getAttribute('href')));
const lio = new IntersectionObserver(es => es.forEach(e => { if (e.isIntersecting) links.forEach(a => a.classList.toggle('on', a.getAttribute('href') === '#' + e.target.id)); }), { rootMargin: '-45% 0px -50% 0px' });
secs.forEach(s => s && lio.observe(s));

// ---------------------------------------------------------------- ranges: one start shared everywhere
const ranges = ['#bStart', '#cStart', '#lStart'].map(s => $(s));
const paintRange = r => r.style.setProperty('--p', (100 * (r.value - r.min) / (r.max - r.min)) + '%');
$$('input[type=range]').forEach(r => { paintRange(r); r.addEventListener('input', () => paintRange(r)); });
ranges.forEach(r => r.addEventListener('input', () => setStart(fromK(+r.value), r)));
function setStart(M, from) {
  S.start = Math.max(S.min, Math.min(S.max, M));
  ranges.forEach(r => { if (r !== from) { r.value = toK(S.start); paintRange(r); } });
  renderAll();
}

// ---------------------------------------------------------------- hero tower
const tower = $('#tower');
const floorsSol = () => { const p = S.sol || 93; const usdF = [2000, 5000, 20000, 100000, 1e6, 4.7e6]; return usdF.map(u => Math.max(S.min, Math.min(S.max, u / p))); };
function buildTower() {
  const F = floorsSol(), H = tower.clientHeight || 430, W = tower.clientWidth || 480, n = F.length, gap = (H - 60) / (n - 1), L = Math.min(260, W * .5), dx = Math.min(46, (W - L - 90) / (n - 1));
  tower.innerHTML = F.map((M, i) => { const y = H - 30 - i * gap, x = 90 + i * dx; return `<div class="fl" data-m="${M}" style="left:${x}px;top:${y - 11}px;width:${L}px" role="radio" tabindex="0" aria-label="${usd(M)}"></div><div class="lab" data-m="${M}" style="left:${x}px;top:${y}px">${usd(M)}</div>`; }).join('') + '<div class="coin" id="tcoin"></div>';
  tower._F = F; tower._geom = { H, gap, L, dx };
  $$('.tower .fl').forEach(el => { el.addEventListener('click', () => setStart(+el.dataset.m)); el.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') setStart(+el.dataset.m); }); });
  paintTower();
}
function paintTower() {
  const F = tower._F; if (!F) return; let best = 0; F.forEach((M, i) => { if (Math.abs(Math.log(M / S.start)) < Math.abs(Math.log(F[best] / S.start))) best = i; });
  const fls = $$('.tower .fl'), labs = $$('.tower .lab'); fls.forEach((el, i) => { el.classList.toggle('on', i === best); el.classList.toggle('up', i > best); el.setAttribute('aria-checked', i === best); }); labs.forEach((el, i) => el.classList.toggle('on', i === best));
  const el = fls[best], c = $('#tcoin'); if (el && c) { c.style.left = (parseFloat(el.style.left) + parseFloat(el.style.width) - 40) + 'px'; c.style.top = (parseFloat(el.style.top) - 36) + 'px'; }
}
// drag up and down the tower to change floors
let drag = null;
tower.addEventListener('pointerdown', e => { drag = { y: e.clientY }; tower.setPointerCapture(e.pointerId); });
tower.addEventListener('pointermove', e => { if (!drag) return; const r = tower.getBoundingClientRect(), F = tower._F, g = tower._geom; const i = Math.round((r.bottom - 30 - e.clientY) / g.gap); const j = Math.max(0, Math.min(F.length - 1, i)); if (Math.abs(F[j] - S.start) > 1e-9 && Math.abs(e.clientY - drag.y) > 6) setStart(F[j]); });
addEventListener('pointerup', () => drag = null);
tower.addEventListener('keydown', e => { const F = tower._F; let i = F.findIndex(M => Math.abs(M - S.start) < 1e-6); if (e.key === 'ArrowUp') { e.preventDefault(); setStart(F[Math.min(F.length - 1, i + 1)]); } if (e.key === 'ArrowDown') { e.preventDefault(); setStart(F[Math.max(0, i - 1)]); } });
addEventListener('resize', () => { buildTower(); drawCurve(); });

// ---------------------------------------------------------------- how it works: the car rides the shaft as you scroll
const lv = $('#lvls'), car = $('#car'), steps = $$('.step'), sh = $('#shaft');
lv.innerHTML = [0, 1, 2, 3].map(i => `<div class="lv" style="top:${(3 - i) * 33.3}%"></div>`).join('');
function how() {
  const box = $('.steps').getBoundingClientRect(), vh = innerHeight; const k = Math.max(0, Math.min(1, (vh * .5 - box.top - vh * .3) / (box.height - vh * .6)));
  const i = Math.min(3, Math.floor(k * 4 + .0001)), H = sh.clientHeight; car.style.top = (H * (1 - k) * .999 + 9) + 'px';
  $$('.lv').forEach((el, j) => el.classList.toggle('on', j === i)); steps.forEach((el, j) => el.classList.toggle('on', j === i)); $('#stepN').textContent = '0' + (i + 1);
}

// ---------------------------------------------------------------- snipers
function calc() {
  const b = +$('#bSol').value, n = +$('#bN').value, tot = b * n, a = stdShare(tot), y = buyShare(S.start, tot);
  $('#bSolV').textContent = b.toFixed(1); $('#bNV').textContent = n; $('#bStartV').textContent = usd(S.start);
  $('#cStd').style.width = Math.max(1, a * 100) + '%'; $('#cYou').style.width = Math.max(.6, y * 100) + '%';
  $('#cStdV').textContent = pct(a); $('#cYouV').textContent = pct(y); $('#cYouS').textContent = usd(S.start) + ' start'; $('#cStdS').textContent = '~' + usd(STD_START);
  $('#cNote').textContent = `${n} × ${b.toFixed(1)} SOL in the first block. at your start they get ${a / y >= 1.05 ? (a / y).toFixed(1) + '× less' : 'about the same'} than at a standard start. before fees.`;
}
['#bSol', '#bN'].forEach(s => $(s).addEventListener('input', calc));

// ---------------------------------------------------------------- the curve chart
const cvs = $('#cvs'), ctx = cvs.getContext('2d'), tip = $('#tip');
function curvePts(M, n = 120) { const pts = []; const vs = vSol(M), k = vs * VTOK; for (let i = 0; i <= n; i++) { const t = SELL * i / n, sold = VTOK - t, solIn = k / sold - vs, mc = SUPPLY * (k / (sold * sold)); pts.push({ f: i / n, solIn, mc, t }); } return pts; }
function drawCurve(hover) {
  const dpr = Math.min(2, devicePixelRatio || 1), w = cvs.clientWidth, h = w * 420 / 900; cvs.width = w * dpr; cvs.height = h * dpr; ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.clearRect(0, 0, w, h);
  const pad = { l: 70, r: 22, t: 26, b: 40 }, iw = w - pad.l - pad.r, ih = h - pad.t - pad.b, M = S.start, raise = M * RAISE_K, top = M * 5.5;
  const P = curvePts(M), X = s => pad.l + (s / raise) * iw, Y = mc => pad.t + ih - (mc / top) * ih;
  ctx.font = '11px JB, monospace'; ctx.fillStyle = '#6fa8a2'; ctx.strokeStyle = 'rgba(95,245,228,.08)'; ctx.lineWidth = 1;
  [1, 2, 3, 4, 5].forEach(k => { const y = Y(M * k); ctx.beginPath(); ctx.moveTo(pad.l, y); ctx.lineTo(w - pad.r, y); ctx.stroke(); ctx.fillText(usd(M * k), 6, y + 4); });
  [0, .25, .5, .75, 1].forEach(k => { const x = X(raise * k); ctx.fillText(sol(raise * k), Math.min(w - 90, Math.max(pad.l - 10, x - 24)), h - 14); });
  // the area under the curve, then the curve
  const fillG = ctx.createLinearGradient(0, pad.t, 0, pad.t + ih); fillG.addColorStop(0, 'rgba(95,245,228,.22)'); fillG.addColorStop(1, 'rgba(95,245,228,0)');
  ctx.beginPath(); ctx.moveTo(X(0), Y(0)); P.forEach(p => ctx.lineTo(X(p.solIn), Y(p.mc))); ctx.lineTo(X(raise), Y(0)); ctx.closePath(); ctx.fillStyle = fillG; ctx.fill();
  const g = ctx.createLinearGradient(pad.l, 0, w, 0); g.addColorStop(0, '#3c8f8a'); g.addColorStop(1, '#5ff5e4');
  ctx.beginPath(); P.forEach((p, i) => i ? ctx.lineTo(X(p.solIn), Y(p.mc)) : ctx.moveTo(X(p.solIn), Y(p.mc))); ctx.strokeStyle = g; ctx.lineWidth = 3.5; ctx.shadowColor = 'rgba(95,245,228,.6)'; ctx.shadowBlur = 14; ctx.stroke(); ctx.shadowBlur = 0;
  const end = P[P.length - 1]; ctx.fillStyle = '#5ff5e4'; ctx.beginPath(); ctx.arc(X(raise), Y(end.mc), 6, 0, 7); ctx.fill(); ctx.beginPath(); ctx.arc(X(0), Y(P[0].mc), 5, 0, 7); ctx.fill();
  ctx.fillStyle = '#effffc'; ctx.font = '600 12px JB, monospace'; ctx.fillText('start ' + usd(M), X(0) + 10, Y(P[0].mc) - 12); ctx.textAlign = 'right'; ctx.fillText('fills at ' + usd(end.mc) + ' → Raydium pool', X(raise) - 12, Y(end.mc) + 4); ctx.textAlign = 'left';
  if (hover != null) { const p = P[Math.round(hover * (P.length - 1))]; ctx.strokeStyle = 'rgba(95,245,228,.35)'; ctx.setLineDash([4, 4]); ctx.beginPath(); ctx.moveTo(X(p.solIn), pad.t); ctx.lineTo(X(p.solIn), h - pad.b); ctx.stroke(); ctx.setLineDash([]); ctx.fillStyle = '#5ff5e4'; ctx.beginPath(); ctx.arc(X(p.solIn), Y(p.mc), 5, 0, 7); ctx.fill();
    tip.innerHTML = `${sol(p.solIn)} raised<br>${(p.t / SELL * 100).toFixed(0)}% of the curve sold<br>market cap ${usd(p.mc)}`; tip.style.opacity = 1; tip.style.left = Math.min(w - 190, X(p.solIn) + 24) + 'px'; tip.style.top = Math.max(10, Y(p.mc) + 14) + 'px'; } else tip.style.opacity = 0;
}
cvs.addEventListener('pointermove', e => { const r = cvs.getBoundingClientRect(), x = (e.clientX - r.left - 70) / (r.width - 92); if (x < 0 || x > 1) return drawCurve(); const P = curvePts(S.start), target = x * S.start * RAISE_K; let k = 0; P.forEach((p, i) => { if (Math.abs(p.solIn - target) < Math.abs(P[k].solIn - target)) k = i; }); drawCurve(k / (P.length - 1)); });
cvs.addEventListener('pointerleave', () => drawCurve());
function facts() {
  const M = S.start;
  $('#facts').innerHTML = [['starts at', usd(M)], ['raises to fill', sol(M * RAISE_K)], ['fills at', usd(M * FILL_K)], ['sold on the curve', '690,983,005'], ['into the Raydium pool', '309,016,995'], ['1 SOL buys', pct(buyShare(M, 1))]].map(([k, v]) => `<div><small>${k}</small><b>${v}</b></div>`).join('');
}

// ---------------------------------------------------------------- hero readout and the launch numbers
function readouts() {
  const M = S.start;
  $('#heroRead').innerHTML = [['starts at', usd(M), 1], ['fills at', usd(M * FILL_K)], ['raise', sol(M * RAISE_K)], ['1 SOL buys', pct(buyShare(M, 1))]].map(([k, v, hi]) => `<div class="${hi ? 'hi' : ''}"><small>${k}</small><b>${v}</b></div>`).join('');
  $('#lStartV').textContent = usd(M) + (S.sol ? ` · ${sol(M)}` : '');
  $('#lNums').innerHTML = [['raise target', sol(M * RAISE_K)], ['fills at', usd(M * FILL_K)], ['1 SOL buys', pct(buyShare(M, 1))]].map(([k, v]) => `<div><small>${k}</small><b>${v}</b></div>`).join('');
  $('#pStart').textContent = usd(M); $('#pFill').textContent = usd(M * FILL_K);
  $('#p1').textContent = pct(stdShare(1)); $('#p10').textContent = pct(stdShare(10));
  $$('[data-k=minUsd]').forEach(el => el.textContent = usd(S.min)); $$('[data-k=maxUsd]').forEach(el => el.textContent = usd(S.max));
  const p = $('.pcard .big'); if (p) p.textContent = usd(STD_START);
}
function table() {
  const tb = $('#ntable tbody'); if (!tb) return; const F = floorsSol(); const rows = [...F]; if (!F.some(M => Math.abs(M - S.start) / S.start < .01)) rows.push(S.start); rows.sort((a, b) => a - b);
  tb.innerHTML = rows.map(M => `<tr data-m="${M}" class="${Math.abs(M - S.start) / S.start < .01 ? 'on' : ''}"><td>${usd(M)}</td><td>${sol(M)}</td><td>${sol(M * RAISE_K)}</td><td>${usd(M * FILL_K)}</td><td>${pct(buyShare(M, 1))}</td><td>${pct(buyShare(M, 10))}</td></tr>`).join('');
  $$('#ntable tbody tr').forEach(tr => tr.addEventListener('click', () => { setStart(+tr.dataset.m); toast('start set to ' + usd(+tr.dataset.m)); }));
}
function renderAll() { paintTower(); calc(); drawCurve(); facts(); readouts(); table(); }

// problem bar fills when seen
new IntersectionObserver((es, o) => es.forEach(e => { if (e.isIntersecting) { $('#botFill').style.width = (stdShare(10) * 100) + '%'; o.disconnect(); } }), { threshold: .5 }).observe($('.supply'));

// ---------------------------------------------------------------- live status from the chain
async function api(a, body) { const r = await fetch('/api/fl00r?a=' + a, body ? { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) } : {}); const j = await r.json().catch(() => ({ error: 'bad response' })); if (!r.ok || j.error) throw new Error(j.error || r.statusText); return j; }
async function status() {
  try {
    const s = await statusP; S.status = s; if (s.solUsd) S.sol = s.solUsd;
    if (s.minStartSol) S.min = s.minStartSol;
    $('#solPx').textContent = S.sol ? '$' + S.sol.toFixed(2) : '—'; $('#llState').textContent = s.launchlab ? 'live' : 'unreachable';
    if (s.tradeFeePct != null) $('#feeLine').textContent = `${+(s.tradeFeePct + (s.platformFeePct || 0) + (s.creatorFeePct || 0)).toFixed(2)}% per trade (${s.tradeFeePct}% LaunchLab, ${s.platformFeePct}% platform, ${s.creatorFeePct}% to the creator)`;
    if (s.lpRule) $('#lpRule').textContent = s.lpRule; if (s.tag) $('#tagAddr').textContent = 'tag ' + s.tag;
  } catch (e) { $('#llState').textContent = 'offline'; $('#lpRule').textContent = 'could not read the platform right now'; }
  ranges.forEach(r => { r.value = toK(S.start); paintRange(r); }); buildTower(); renderAll();
}
async function coins() {
  const g = $('#cgrid');
  try {
    const { coins } = await api('coins'); $('#coinCount').textContent = coins.length;
    if (!coins.length) { g.innerHTML = '<div class="empty">no fl00r coins yet. the first one launched here shows up here.</div>'; return; }
    g.innerHTML = coins.map(c => `<a class="cc" href="https://raydium.io/launchpad/token/?mint=${c.mint}" target="_blank" rel="noopener"><div class="h"><img src="${c.image || ''}" alt="" onerror="this.style.visibility='hidden'"><div><b>${esc(c.name)}</b><span>$${esc(c.symbol)}</span></div></div><div class="pbar"><i style="width:${Math.min(100, c.progress * 100).toFixed(1)}%"></i></div><div class="kv"><span>${c.graduated ? 'graduated' : (c.progress * 100).toFixed(1) + '% filled'}</span><b>started ${usd(c.startSol)}</b></div></a>`).join('');
  } catch (e) { $('#coinCount').textContent = '—'; g.innerHTML = `<div class="empty">couldn't read the chain right now (${esc(e.message)}). try again in a minute.</div>`; }
}

// ---------------------------------------------------------------- launch: preview, wallet, build, sign, send
const form = $('#lform'), stat = $('#lStat'), go = $('#goBtn');
const setStat = (m, cls = '') => { stat.className = 'lstat ' + cls; stat.innerHTML = m; };
form.addEventListener('input', () => { const f = new FormData(form); $('#pName').textContent = f.get('name') || 'my coin'; $('#pSym').textContent = '$' + (f.get('symbol') || 'COIN').toUpperCase(); const im = f.get('image'), img = $('#pImg'); if (im && /^https?:\/\//.test(im)) { img.onload = () => { img.classList.add('ok'); $('#pImgPh').style.display = 'none'; }; img.onerror = () => { img.classList.remove('ok'); $('#pImgPh').style.display = ''; $('#pImgPh').textContent = "can't load that image"; }; img.src = im; } });
const providers = () => [['Phantom', window.phantom && window.phantom.solana], ['Solflare', window.solflare], ['Backpack', window.backpack]].filter(([, p]) => p);
$('#wBtn').addEventListener('click', async () => {
  const ps = providers(); if (!ps.length) { toast('no Solana wallet found. install Phantom, Solflare or Backpack.'); return; }
  try { const [name, p] = ps[0]; const r = await p.connect(); const pk = (r && r.publicKey) || p.publicKey; S.wallet = pk.toString(); S.provider = p;
    $('#wAddr').textContent = name + ' · ' + S.wallet.slice(0, 4) + '…' + S.wallet.slice(-4); $('#wBtn').textContent = 'connected'; go.disabled = false; go.textContent = 'launch on Raydium'; } catch (e) { toast('wallet: ' + (e.message || e)); }
});
form.addEventListener('submit', async e => {
  e.preventDefault(); if (!S.wallet) return; const f = Object.fromEntries(new FormData(form));
  go.disabled = true; setStat('building the LaunchLab transaction…');
  try {
    const b = await api('build', { wallet: S.wallet, name: f.name.trim(), symbol: f.symbol.trim().toUpperCase(), image: f.image.trim(), desc: f.desc, twitter: f.twitter, website: f.website, startSol: S.start, buySol: +f.buy || 0 });
    setStat(`check it in your wallet: ${b.txs.length} transaction${b.txs.length > 1 ? 's' : ''}, creates ${esc(f.symbol.toUpperCase())} at ${usd(S.start)}.`);
    const { VersionedTransaction, Transaction } = solanaWeb3; const raw = b.txs.map(t => Uint8Array.from(atob(t), c => c.charCodeAt(0)));
    const txs = raw.map(r => { try { return VersionedTransaction.deserialize(r); } catch { return Transaction.from(r); } });
    const signed = S.provider.signAllTransactions ? await S.provider.signAllTransactions(txs) : [await S.provider.signTransaction(txs[0])];
    const out = signed.map(t => btoa(String.fromCharCode(...t.serialize())));
    setStat('sending…'); const s = await api('send', { txs: out });
    setStat(`launched on Raydium LaunchLab.\n<a href="https://raydium.io/launchpad/token/?mint=${b.mint}" target="_blank" rel="noopener">open on Raydium ↗</a> · <a href="https://solscan.io/tx/${s.sigs[s.sigs.length - 1]}" target="_blank" rel="noopener">transaction ↗</a>`, 'ok');
    setTimeout(coins, 4000);
  } catch (err) { setStat(esc(err.message || String(err)), 'err'); }
  go.disabled = false;
});

// ---------------------------------------------------------------- motion
// one sea behind the whole page: marine snow in three depths that sinks past you as you scroll,
// bubbles rising, flakes that part around the cursor, and a burst of bubbles where you click
(() => {
  const c = $('#snow'), spot = $('#spot'); if (!c) return; const g = c.getContext('2d'); let W, H, P = [], B = [];
  const mouse = { x: -9999, y: -9999 }; let lastY = scrollY, vel = 0, t0 = performance.now();
  const size = () => { const d = Math.min(2, devicePixelRatio || 1); W = innerWidth; H = innerHeight; c.width = W * d; c.height = H * d; g.setTransform(d, 0, 0, d, 0, 0);
    P = Array.from({ length: Math.min(260, Math.round(W * H / 6500)) }, () => { const z = Math.random(); return { x: Math.random() * W, y: Math.random() * H, z, r: .5 + z * 1.8, a: .12 + z * .45, ox: 0, oy: 0, p: Math.random() * 6.3 }; }); };
  size(); addEventListener('resize', size);
  addEventListener('pointermove', e => { mouse.x = e.clientX; mouse.y = e.clientY; document.body.classList.add('moved'); if (spot) { spot.style.left = e.clientX + 'px'; spot.style.top = e.clientY + 'px'; } }, { passive: true });
  addEventListener('pointerleave', () => { mouse.x = mouse.y = -9999; });
  addEventListener('pointerdown', e => { if (RM || e.target.closest('input,textarea,button,a,canvas#cvs,.term,.tower')) return; for (let i = 0; i < 14; i++) B.push({ x: e.clientX + (Math.random() - .5) * 30, y: e.clientY + (Math.random() - .5) * 20, r: 2 + Math.random() * 6, v: .6 + Math.random() * 1.6, w: Math.random() * 6.3, a: .7 }); }, { passive: true });
  const sy = () => { const h = document.documentElement, m = h.scrollHeight - h.clientHeight; document.documentElement.style.setProperty('--sy', (m > 0 ? h.scrollTop / m : 0).toFixed(4)); };
  addEventListener('scroll', sy, { passive: true }); sy();
  if (RM) return;
  for (let i = 0; i < 10; i++) B.push({ x: Math.random() * innerWidth, y: Math.random() * innerHeight, r: 1.5 + Math.random() * 4, v: .3 + Math.random() * .8, w: Math.random() * 6.3, a: .45, loop: true });
  let hidden = false; document.addEventListener('visibilitychange', () => hidden = document.hidden);
  const tick = now => {
    requestAnimationFrame(tick); if (hidden) return; const dt = Math.min(50, now - t0) / 16.7; t0 = now;
    const dy = scrollY - lastY; lastY = scrollY; vel += (dy - vel) * .15;
    g.clearRect(0, 0, W, H);
    for (const s of P) {
      // drift, sink with the scroll at a speed set by depth, sway
      s.y += (-.12 - s.z * .18) * dt - vel * (.15 + s.z * .55); s.x += Math.sin(now / 2400 + s.p) * .12 * dt;
      if (s.y < -10) { s.y = H + 10; s.x = Math.random() * W; } if (s.y > H + 10) { s.y = -10; s.x = Math.random() * W; }
      // part around the cursor
      const dx = s.x + s.ox - mouse.x, dy2 = s.y + s.oy - mouse.y, d2 = dx * dx + dy2 * dy2, R = 130;
      if (d2 < R * R) { const d = Math.sqrt(d2) || 1, f = (1 - d / R) * 22 * (.4 + s.z); s.ox += (dx / d * f - s.ox) * .12; s.oy += (dy2 / d * f - s.oy) * .12; } else { s.ox *= .94; s.oy *= .94; }
      const stretch = Math.min(6, Math.abs(vel) * (.2 + s.z));
      g.fillStyle = `rgba(207,238,233,${s.a})`; g.beginPath();
      if (stretch > .8) g.ellipse(s.x + s.ox, s.y + s.oy, s.r, s.r + stretch, 0, 0, 7); else g.arc(s.x + s.ox, s.y + s.oy, s.r, 0, 7); g.fill();
    }
    for (let i = B.length - 1; i >= 0; i--) { const b = B[i]; b.y -= b.v * dt; b.x += Math.sin(now / 500 + b.w) * .5; if (!b.loop) b.a -= .004 * dt;
      if (b.loop && b.y < -20) { b.y = H + 20; b.x = Math.random() * W; } if (!b.loop && (b.a <= 0 || b.y < -20)) { B.splice(i, 1); continue; }
      g.strokeStyle = `rgba(160,250,240,${b.a})`; g.lineWidth = 1.2; g.beginPath(); g.arc(b.x, b.y, b.r, 0, 7); g.stroke();
      g.fillStyle = `rgba(230,255,252,${b.a * .6})`; g.beginPath(); g.arc(b.x - b.r * .35, b.y - b.r * .35, b.r * .25, 0, 7); g.fill(); }
  };
  requestAnimationFrame(tick);
})();
// headings rise in word by word
$$('h2').forEach(h => { h.classList.add('split'); h.innerHTML = h.innerHTML.split(/(\s+)/).map(w => /^\s+$/.test(w) ? w : `<span class="w"><span>${w}</span></span>`).join(''); h.querySelectorAll('.w>span').forEach((s, i) => s.style.transitionDelay = (i * 55) + 'ms'); });
$$('.kicker').forEach(k => io.observe(k));
$$('h2.split').forEach(h => { if (!h.classList.contains('rv')) io.observe(h); });
// numbers count up when they come into view
const countUp = el => { const t = el.textContent, m = t.match(/^([^\d]*)([\d.]+)(.*)$/); if (!m || RM) return; const end = +m[2], dec = (m[2].split('.')[1] || '').length, t0 = performance.now(); const f = n => { const k = Math.min(1, (n - t0) / 1100), e = 1 - Math.pow(1 - k, 3); el.textContent = m[1] + (end * e).toFixed(dec) + m[3]; if (k < 1) requestAnimationFrame(f); }; requestAnimationFrame(f); };
new IntersectionObserver((es, o) => es.forEach(e => { if (e.isIntersecting) { countUp(e.target); o.unobserve(e.target); } }), { threshold: .6 }) && $$('.pcard .big').forEach(el => new IntersectionObserver((es, o) => es.forEach(e => { if (e.isIntersecting) { countUp(e.target); o.disconnect(); } }), { threshold: .6 }).observe(el));
// cards tilt toward the cursor
if (!RM && matchMedia('(hover: hover)').matches) $$('.pcard, .rcard, .dcard, .math div, .pcoin').forEach(el => { el.classList.add('tilt');
  el.addEventListener('pointermove', e => { const r = el.getBoundingClientRect(), x = (e.clientX - r.left) / r.width - .5, y = (e.clientY - r.top) / r.height - .5; el.style.transform = `perspective(900px) rotateX(${(-y * 5).toFixed(2)}deg) rotateY(${(x * 6).toFixed(2)}deg) translateY(-3px)`; });
  el.addEventListener('pointerleave', () => el.style.transform = ''); });
// buttons lean toward the cursor
if (!RM && matchMedia('(hover: hover)').matches) $$('.btn').forEach(b => { b.addEventListener('pointermove', e => { const r = b.getBoundingClientRect(); b.style.transform = `translate(${((e.clientX - r.left) / r.width - .5) * 8}px, ${((e.clientY - r.top) / r.height - .5) * 6 - 2}px)`; }); b.addEventListener('pointerleave', () => b.style.transform = ''); });
// the nav pill slides to the section you're in
(() => { const nv = $('#nav nav'); if (!nv) return; const pill = document.createElement('span'); pill.className = 'pill'; nv.prepend(pill);
  const move = a => { if (!a) { pill.style.opacity = 0; return; } pill.style.opacity = 1; pill.style.width = a.offsetWidth + 'px'; pill.style.transform = `translateX(${a.offsetLeft}px)`; };
  new MutationObserver(() => move(nv.querySelector('a.on'))).observe(nv, { subtree: true, attributes: true, attributeFilter: ['class'] });
  nv.addEventListener('pointerleave', () => move(nv.querySelector('a.on'))); $$('#nav nav a').forEach(a => a.addEventListener('pointerenter', () => move(a))); })();
// the terminal button steps aside at the faq and footer
(() => { const f = $('#tFab'); const o = new IntersectionObserver(es => { const any = es.some(e => e.isIntersecting); f.classList.toggle('away', any); }, { threshold: .05 }); ['#faq', '.foot'].forEach(s => $(s) && o.observe($(s))); })();
// the ticker
(() => { const tk = $('#tk'); if (!tk) return; const items = () => [['pick your fl00r', ''], ['launch on Raydium', ''], ...floorsSol().map(M => [usd(M), 'start']), ['fills at 5×', ''], ['graduates into a Raydium pool', ''], ['90% of the LP burned', ''], ['type / for the terminal', '']];
  const html = () => items().map(([a, b]) => `<span>${b ? `<i>${b}</i> ` : ''}<b>${a}</b></span><span>·</span>`).join(''); tk.innerHTML = html() + html(); statusP.then(() => tk.innerHTML = html() + html(), () => {}); })();

// ---------------------------------------------------------------- the fl00r terminal
const tOut = $('#tOut'), tIn = $('#tIn'), tCmd = $('#tCmd'), tWin = $('#termWin'), hist = []; let hi = -1;
const P = (h, cls = '') => { tOut.insertAdjacentHTML('beforeend', `<div class="${cls}">${h}</div>`); tOut.scrollTop = tOut.scrollHeight; };
const parseAmt = str => { if (!str) return null; const m = String(str).toLowerCase().replace(/[$,\s]/g, '').match(/^([\d.]+)(k|m)?(sol)?$/); if (!m) return null; let v = +m[1] * (m[2] === 'k' ? 1e3 : m[2] === 'm' ? 1e6 : 1); if (m[3]) return v; return S.sol ? v / S.sol : null; };
const pad = (a, n) => (a + ' '.repeat(n)).slice(0, n);
function asciiCurve(M) {
  const W = 46, H = 10, rows = Array.from({ length: H }, () => Array(W).fill(' ')); const P = curvePts(M, W - 1);
  P.forEach((p, i) => { const y = H - 1 - Math.round((p.mc / M - 1) / 4 * (H - 1)); rows[Math.max(0, Math.min(H - 1, y))][i] = '•'; });
  return rows.map((r, i) => `<span class="m">${pad(i === 0 ? usd(M * 5) : i === H - 1 ? usd(M) : '', 8)}│</span><span class="c">${r.join('')}</span>`).join('\n') + `\n<span class="m">${' '.repeat(8)}└${'─'.repeat(W)}\n${' '.repeat(9)}0 SOL${' '.repeat(W - 18)}${sol(M * RAISE_K)}</span>`;
}
const CMDS = {
  help: () => P(`<span class="w">commands</span>
  <span class="c">start</span> [20k | 215sol]    set or show your starting market cap
  <span class="c">floors</span>                  every floor and its numbers
  <span class="c">curve</span>                   draw the curve for your start
  <span class="c">snipe</span> [sol] [bots]      what a bundle buys, standard vs yours
  <span class="c">quote</span> [sol]             what that much SOL buys at your start
  <span class="c">at</span> [percent]            market cap when the curve is that full
  <span class="c">compare</span> 5k 100k          two starts side by side
  <span class="c">price</span>                   live SOL price
  <span class="c">raydium</span>                 LaunchLab program, config and platform, live
  <span class="c">coins</span>                   every coin launched on fl00r
  <span class="c">connect</span>                 connect your wallet
  <span class="c">launch</span> name TICKER img   fill the launch form (you sign in your wallet)
  <span class="c">goto</span> section             why, how, bots, curve, numbers, raydium, launch, coins, faq
  <span class="c">intro</span> · <span class="c">about</span> · <span class="c">clear</span> · <span class="c">history</span>`),
  start: a => { if (a[0]) { const v = parseAmt(a.join('')); if (!v) return P('give an amount like <span class="c">start 20k</span> or <span class="c">start 215sol</span>', 'e'); setStart(v); }
    const M = S.start; P(`start ........ <span class="w">${usd(M)}</span> <span class="m">(${sol(M)})</span>\nraise ........ ${sol(M * RAISE_K)}\nfills at ..... ${usd(M * FILL_K)} <span class="m">→ Raydium CPMM pool</span>\n1 SOL buys ... <span class="c">${pct(buyShare(M, 1))}</span> <span class="m">(standard start: ${pct(stdShare(1))})</span>`); },
  floors: () => P(`<span class="m">${pad('start', 10)}${pad('raise', 14)}${pad('fills at', 11)}1 SOL buys</span>\n` + floorsSol().map(M => `${Math.abs(M - S.start) / S.start < .01 ? '<span class="c">' : ''}${pad(usd(M), 10)}${pad(sol(M * RAISE_K), 14)}${pad(usd(M * FILL_K), 11)}${pct(buyShare(M, 1))}${Math.abs(M - S.start) / S.start < .01 ? '  ◂ yours</span>' : ''}`).join('\n')),
  curve: () => P(asciiCurve(S.start)),
  snipe: a => { const b = +a[0] || 1, n = Math.max(1, Math.round(+a[1] || 10)), t = b * n, x = stdShare(t), y = buyShare(S.start, t); const bar = v => '█'.repeat(Math.max(1, Math.round(v * 60))); P(`${n} × ${b} SOL in the first block\nstandard ${pad(usd(STD_START), 9)} <span class="e">${bar(x)}</span> ${pct(x)}\nyours    ${pad(usd(S.start), 9)} <span class="c">${bar(y)}</span> ${pct(y)}\n<span class="m">${x / y >= 1.05 ? (x / y).toFixed(1) + '× less at your start' : 'about the same as standard'}. before fees.</span>`); },
  quote: a => { const x = +a[0] || 1, sh = buyShare(S.start, x); P(`${x} SOL at a ${usd(S.start)} start buys about <span class="c">${Math.round(sh * SUPPLY).toLocaleString('en-US')}</span> tokens (${pct(sh)} of supply)\n<span class="m">the same ${x} SOL at a standard start: ${pct(stdShare(x))}. before fees.</span>`); },
  at: a => { const f = Math.max(0, Math.min(100, parseFloat(a[0]) || 50)) / 100, vs = vSol(S.start), k = vs * VTOK, sold = VTOK - SELL * f; P(`${(f * 100).toFixed(0)}% of the curve sold → market cap <span class="c">${usd(SUPPLY * k / (sold * sold))}</span>, ${sol(k / sold - vs)} raised`); },
  compare: a => { const xs = a.map(parseAmt).filter(Boolean); if (xs.length < 2) return P('usage: <span class="c">compare 5k 100k</span>', 'e'); P(`<span class="m">${pad('start', 10)}${pad('raise', 14)}${pad('fills at', 11)}1 SOL buys</span>\n` + xs.map(M => `${pad(usd(M), 10)}${pad(sol(M * RAISE_K), 14)}${pad(usd(M * FILL_K), 11)}${pct(buyShare(M, 1))}`).join('\n')); },
  price: () => P(S.sol ? `SOL <span class="w">$${S.sol.toFixed(2)}</span> <span class="m">· Jupiter price, read by the fl00r API</span>` : 'price unavailable right now', S.sol ? '' : 'e'),
  raydium: () => { const s = S.status; if (!s) return P('LaunchLab is unreachable right now. try again in a minute.', 'e');
    P(`program ...... <a href="https://solscan.io/account/${s.program}" target="_blank" rel="noopener">${s.program}</a>\nconfig ....... ${s.config}\nplatform ..... ${s.platform}${s.platformName ? ' <span class="m">(' + esc(s.platformName) + ')</span>' : ''}\nmin raise .... ${s.minRaiseSol} SOL <span class="m">→ lowest start ${sol(s.minStartSol)}</span>\ntrade fee .... ${s.tradeFeePct}%${s.platformFeePct != null ? ' <span class="m">+ platform ' + s.platformFeePct + '%</span>' : ''}\n${s.lpRule ? esc(s.lpRule) + '\n' : ''}tag .......... ${s.tag}`); },
  coins: async () => { P('reading the chain…', 'm'); try { const { coins } = await api('coins'); if (!coins.length) return P('no fl00r coins yet. the first one launched here shows up here.'); P(coins.map(c => `<a href="https://raydium.io/launchpad/token/?mint=${c.mint}" target="_blank" rel="noopener">$${esc(c.symbol)}</a> ${pad(esc(c.name), 18)} start ${pad(usd(c.startSol), 8)} ${c.graduated ? '<span class="c">graduated</span>' : (c.progress * 100).toFixed(1) + '% filled'}`).join('\n')); } catch (e) { P(esc(e.message), 'e'); } },
  connect: () => $('#wBtn').click(),
  launch: a => { if (a.length < 3) { P('usage: <span class="c">launch "My Coin" TICKER https://link/to/image.png</span>\nfills the form below. you review it and sign in your wallet.'); return goTo('launch'); }
    const img = a.pop(), tk = a.pop(), nm = a.join(' ').replace(/^"|"$/g, ''); form.name.value = nm; form.symbol.value = tk.toUpperCase(); form.image.value = img; form.dispatchEvent(new Event('input')); P(`form filled: <span class="w">${esc(nm)}</span> <span class="c">$${esc(tk.toUpperCase())}</span> at ${usd(S.start)}. review it and press launch.`); goTo('launch'); },
  goto: a => { if (!goTo(a[0])) P('sections: why, term, how, bots, curve, numbers, raydium, launch, coins, faq', 'e'); },
  intro: () => { intro.className = ''; document.body.classList.add('booting'); runBoot(); },
  about: () => P(`<span class="w">fl00r</span>: launch a coin on Raydium at any market cap.\nyou pick the start. LaunchLab runs the curve. it fills at 5× and graduates into a Raydium pool.\n<span class="m">independent. not affiliated with Raydium. not financial advice.</span>`),
  clear: () => { tOut.innerHTML = ''; },
  history: () => P(hist.length ? hist.map((h, i) => `${pad(String(i + 1), 4)}${esc(h)}`).join('\n') : 'no history yet', 'm'),
};
const ALIAS = { ls: 'floors', '?': 'help', bots: 'snipe', sol: 'price', wallet: 'connect', cls: 'clear', ray: 'raydium' };
function goTo(id) { const el = id && document.getElementById(id); if (!el) return false; tWin.classList.remove('float'); $('#tFab').classList.remove('on'); el.scrollIntoView({ behavior: 'smooth' }); return true; }
async function run(line) {
  P(`<span class="c">fl00r ▸</span> <span class="cmd">${esc(line)}</span>`);
  const parts = line.match(/"[^"]*"|\S+/g) || []; let c = (parts.shift() || '').toLowerCase(); c = ALIAS[c] || c;
  if (!c) return; if (!CMDS[c]) return P(`unknown command: ${esc(c)}. type <span class="c">help</span>`, 'e');
  try { await CMDS[c](parts.map(p => p.replace(/^"|"$/g, ''))); } catch (e) { P(esc(e.message || String(e)), 'e'); }
}
tIn.addEventListener('submit', e => { e.preventDefault(); const v = tCmd.value.trim(); tCmd.value = ''; if (!v) return; hist.push(v); hi = hist.length; run(v); });
tCmd.addEventListener('keydown', e => {
  if (e.key === 'ArrowUp') { e.preventDefault(); if (hi > 0) tCmd.value = hist[--hi] || ''; }
  else if (e.key === 'ArrowDown') { e.preventDefault(); hi = Math.min(hist.length, hi + 1); tCmd.value = hist[hi] || ''; }
  else if (e.key === 'Tab') { e.preventDefault(); const v = tCmd.value.toLowerCase(); const m = Object.keys(CMDS).filter(k => k.startsWith(v)); if (m.length === 1) tCmd.value = m[0] + ' '; else if (m.length) P(m.join('  '), 'm'); }
  else if (e.key === 'Escape') { tWin.classList.remove('float'); $('#tFab').classList.remove('on'); }
});
const toggleFloat = () => { const f = tWin.classList.toggle('float'); $('#tFab').classList.toggle('on', f); if (f) setTimeout(() => tCmd.focus(), 50); };
$('#tFab').addEventListener('click', toggleFloat); $('#tPop').addEventListener('click', toggleFloat);
tWin.addEventListener('click', e => { if (!e.target.closest('a,button')) tCmd.focus(); });
addEventListener('keydown', e => { if (e.key === '/' && !/input|textarea/i.test(document.activeElement.tagName)) { e.preventDefault(); if (!tWin.classList.contains('float')) toggleFloat(); else tCmd.focus(); } });
$('#tChips').innerHTML = ['help', 'start 20k', 'curve', 'snipe 1 10', 'floors', 'raydium', 'price', 'coins'].map(c => `<button type="button">${c}</button>`).join('');
$$('#tChips button').forEach(b => b.addEventListener('click', () => { run(b.textContent); }));
P(`<span class="w">fl00r terminal</span> <span class="m">· type</span> <span class="c">help</span> <span class="m">· ↑↓ history · tab completes</span>`);

// ---------------------------------------------------------------- go
buildTower(); renderAll(); onScroll(); status(); coins();
})();
