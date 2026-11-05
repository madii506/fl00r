// fl00r API: reads Raydium LaunchLab from the chain and builds unsigned LaunchLab transactions for the user's wallet.
// a=status · a=build (POST) · a=send (POST) · a=coins · a=m (token metadata JSON)
const { Connection, PublicKey, Keypair, SystemProgram, Transaction } = require('@solana/web3.js');
const BN = require('bn.js');
const R = require('@raydium-io/raydium-sdk-v2');

const RPC = process.env.RPC_URL || 'https://api.mainnet-beta.solana.com';
const WSOL = new PublicKey('So11111111111111111111111111111111111111112');
const PROGRAM = R.LAUNCHPAD_PROGRAM, PLATFORM = new PublicKey(process.env.FL00R_PLATFORM || R.LAUNCHPAD_PLATFORM.toBase58());
const CONFIG = R.getPdaLaunchpadConfigId(PROGRAM, WSOL, 0, 0).publicKey;
const TAG = new PublicKey(process.env.FL00R_TAG || 'G8b5CRjYgYj9jXT9qGHyqe49EjVqh5qisfDia1enDDTY');  // a public address every fl00r launch sends 0 SOL to, so the list can find them
const META_PROGRAM = new PublicKey('metaqbxxUerdq28cj1RJAWkYQm3ybzjb6a8bBuwy6NG');
// the curve: 1B supply, 69.1% sold, the raise target set from the start so the last price is exactly 5x the first
const SUPPLY = new BN('1000000000000000'), SELL = new BN('690983005000000'), RAISE_K = 1.545085, MAX_START = 50000;
const conn = new Connection(RPC, 'confirmed');

const send = (res, code, body, cache) => { res.statusCode = code; res.setHeader('content-type', 'application/json'); res.setHeader('cache-control', cache || 'no-store'); res.end(JSON.stringify(body)); };
const b64u = s => Buffer.from(s).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const unb64u = s => Buffer.from(String(s).replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString();
const host = req => process.env.FL00R_HOST || ('https://' + (req.headers['x-forwarded-host'] || req.headers.host));
const body = req => new Promise(ok => { if (req.body) return ok(typeof req.body === 'string' ? JSON.parse(req.body) : req.body); let d = ''; req.on('data', c => d += c); req.on('end', () => { try { ok(JSON.parse(d || '{}')); } catch { ok({}); } }); });

let cfgCache = null;
async function chainConfig() {
  if (cfgCache && Date.now() - cfgCache.t < 60000) return cfgCache.v;
  const [ca, pa] = await conn.getMultipleAccountsInfo([CONFIG, PLATFORM]);
  if (!ca) throw new Error('LaunchLab config not found');
  const cfg = R.LaunchpadConfig.decode(ca.data), pf = pa ? R.PlatformConfig.decode(pa.data) : null;
  const v = { cfg, pf, raw: { owner: ca.owner } }; cfgCache = { t: Date.now(), v }; return v;
}
async function solUsd() {
  try { const r = await fetch('https://lite-api.jup.ag/price/v3?ids=' + WSOL.toBase58(), { signal: AbortSignal.timeout(4000) }); const j = await r.json(); return +j[WSOL.toBase58()].usdPrice || null; } catch { return null; }
}
const scale = n => +n.toString() / 1e6;            // LaunchLab rates are parts per million

async function status() {
  const [{ cfg, pf }, px] = await Promise.all([chainConfig(), solUsd()]);
  const minRaise = +cfg.minFundRaisingB.toString() / 1e9;
  let lpRule = null;
  if (pf) { const p = scale(pf.platformScale) * 100, c = scale(pf.creatorScale) * 100, b = scale(pf.burnScale) * 100; lpRule = `pool LP at graduation: ${b.toFixed(0)}% burned, ${p.toFixed(0)}% platform, ${c.toFixed(0)}% creator`; }
  return {
    launchlab: true, program: PROGRAM.toBase58(), config: CONFIG.toBase58(), platform: PLATFORM.toBase58(), platformName: pf ? Buffer.from(pf.name).toString().replace(/\0/g, '').trim() : null,
    tag: TAG.toBase58(), solUsd: px, minRaiseSol: minRaise, minStartSol: Math.ceil(minRaise / RAISE_K * 100) / 100, maxStartSol: MAX_START,
    tradeFeePct: +(scale(cfg.tradeFeeRate) * 100).toFixed(2), platformFeePct: pf ? +(scale(pf.feeRate) * 100).toFixed(2) : null, creatorFeePct: pf ? +(scale(pf.creatorFeeRate) * 100).toFixed(2) : null,
    minSellPct: scale(cfg.minSellRateA) * 100, minMigratePct: scale(cfg.minMigrateRateA) * 100, lpRule,
  };
}

const clean = (s, n) => String(s || '').replace(/[\u0000-\u001f]/g, '').trim().slice(0, n);
async function build(req) {
  const b = await body(req);
  let wallet; try { wallet = new PublicKey(b.wallet); } catch { throw new Error('connect a wallet first'); }
  const name = clean(b.name, 32), symbol = clean(b.symbol, 10).toUpperCase(), image = clean(b.image, 300);
  if (!name || !symbol) throw new Error('give the coin a name and a ticker');
  if (!/^https?:\/\/\S+$/.test(image)) throw new Error('add an image link (https://…)');
  const { cfg } = await chainConfig();
  const minRaise = +cfg.minFundRaisingB.toString() / 1e9, start = +b.startSol;
  if (!(start > 0)) throw new Error('pick a starting market cap');
  if (start > MAX_START) throw new Error(`the highest start is ${MAX_START} SOL`);
  let raise = start * RAISE_K; if (raise < minRaise) throw new Error(`LaunchLab's minimum raise is ${minRaise} SOL, so the lowest start is ${(minRaise / RAISE_K).toFixed(2)} SOL`);
  const meta = { n: name, s: symbol, i: image }; const d = clean(b.desc, 240), t = clean(b.twitter, 120), w = clean(b.website, 120); if (d) meta.d = d; if (t) meta.t = t; if (w) meta.w = w;
  let uri = host(req) + '/api/fl00r?a=m&d=' + b64u(JSON.stringify(meta));
  if (uri.length > 200) { delete meta.d; uri = host(req) + '/api/fl00r?a=m&d=' + b64u(JSON.stringify(meta)); }
  if (uri.length > 200) { delete meta.t; delete meta.w; uri = host(req) + '/api/fl00r?a=m&d=' + b64u(JSON.stringify(meta)); }
  if (uri.length > 200) throw new Error('that image link is too long for on-chain metadata. use a shorter link (for example an imgur or ipfs link).');
  const buySol = Math.max(0, +b.buySol || 0); if (buySol > raise) throw new Error('the first buy is bigger than the whole curve');
  const mint = Keypair.generate();
  const raydium = await R.Raydium.load({ connection: conn, owner: wallet, cluster: 'mainnet', disableLoadToken: true, disableFeatureCheck: true, blockhashCommitment: 'confirmed' });
  if (module.exports._test && module.exports._test.onLoad) module.exports._test.onLoad(raydium);
  const { transactions, extInfo } = await raydium.launchpad.createLaunchpad({
    programId: PROGRAM, mintA: mint.publicKey, decimals: 6, name, symbol, uri, migrateType: 'cpmm',
    configId: CONFIG, configInfo: cfg, mintBDecimals: 9, platformId: PLATFORM, txVersion: R.TxVersion.LEGACY,
    slippage: new BN(100), buyAmount: new BN(Math.round(buySol * 1e9)), createOnly: buySol === 0,
    supply: SUPPLY, totalSellA: SELL, totalFundRaisingB: new BN(Math.round(raise * 1e9)), totalLockedAmount: new BN(0), cliffPeriod: new BN(0), unlockPeriod: new BN(0),
    extraSigners: [mint], feePayer: wallet, computeBudgetConfig: { units: 600000, microLamports: 60000 },
  });
  // add the 0-SOL note to the fl00r tag to the first transaction, then sign for the new mint
  const { blockhash } = await conn.getLatestBlockhash('confirmed');
  const tagIx = withMint => { const ix = SystemProgram.transfer({ fromPubkey: wallet, toPubkey: TAG, lamports: 0 }); if (withMint) ix.keys.push({ pubkey: mint.publicKey, isSigner: false, isWritable: false }); return ix; };
  const mk = ixs => { const t = new Transaction(); t.add(...ixs); t.feePayer = wallet; t.recentBlockhash = blockhash; if (t.instructions.some(ix => ix.keys.some(k => k.isSigner && k.pubkey.equals(mint.publicKey)))) t.partialSign(mint); return t; };
  const fits = t => { try { t.serialize({ requireAllSignatures: false, verifySignatures: false }); return true; } catch { return false; } };
  let out = transactions.map((tx, i) => mk(i === 0 ? [...tx.instructions, tagIx(false)] : tx.instructions));
  if (!fits(out[0])) { out = transactions.map(tx => mk(tx.instructions)); out.push(mk([tagIx(true)])); }   // no room: the 0-SOL note goes in its own small transaction after the launch
  let sim = null;
  if (b.simulate) sim = await Promise.all(out.slice(0, 1).map(async v => { const r = await conn.simulateTransaction(v); return { err: r.value.err, units: r.value.unitsConsumed, logs: (r.value.logs || []).slice(-14) }; }));
  const pool = extInfo && extInfo.address && extInfo.address.poolId ? extInfo.address.poolId.toBase58() : R.getPdaLaunchpadPoolId(PROGRAM, mint.publicKey, WSOL).publicKey.toBase58();
  return { mint: mint.publicKey.toBase58(), pool, raiseSol: raise, startSol: start, uri, txs: out.map(v => Buffer.from(v.serialize({ requireAllSignatures: false, verifySignatures: false })).toString('base64')), sim };
}

async function sendTxs(req) {
  const b = await body(req); if (!Array.isArray(b.txs) || !b.txs.length || b.txs.length > 4) throw new Error('nothing to send');
  const sigs = [];
  for (const t of b.txs) {
    const raw = Buffer.from(t, 'base64'); const sig = await conn.sendRawTransaction(raw, { skipPreflight: false, maxRetries: 3 }); sigs.push(sig);
    if (b.txs.length > 1) { for (let k = 0; k < 30; k++) { const s = (await conn.getSignatureStatuses([sig])).value[0]; if (s && s.err) throw new Error('transaction failed: ' + JSON.stringify(s.err)); if (s && (s.confirmationStatus === 'confirmed' || s.confirmationStatus === 'finalized')) break; await new Promise(r => setTimeout(r, 800)); } }
  }
  return { sigs };
}

function readStr(buf, o) { const n = buf.readUInt32LE(o); return [buf.slice(o + 4, o + 4 + n).toString().replace(/\0/g, '').trim(), o + 4 + n]; }
async function coins() {
  const sigs = await conn.getSignaturesForAddress(TAG, { limit: 80 });
  const ok = sigs.filter(s => !s.err).map(s => s.signature);
  const txs = [];
  for (let i = 0; i < ok.length; i += 20) txs.push(...await Promise.all(ok.slice(i, i + 20).map(s => conn.getTransaction(s, { maxSupportedTransactionVersion: 0 }).catch(() => null))));
  const mints = [...new Set(txs.filter(Boolean).map(t => {
    const m = t.transaction.message, keys = m.staticAccountKeys || m.accountKeys, ti = keys.findIndex(k => k.equals(TAG));
    const ix = (m.compiledInstructions || []).find(c => c.accountKeyIndexes.includes(ti) && keys[c.programIdIndex].equals(SystemProgram.programId));
    if (ix && ix.accountKeyIndexes.length >= 3) return keys[ix.accountKeyIndexes[2]].toBase58();
    return m.header.numRequiredSignatures >= 2 ? keys[1].toBase58() : null;
  }).filter(Boolean))];
  if (!mints.length) return { coins: [] };
  const pools = mints.map(m => R.getPdaLaunchpadPoolId(PROGRAM, new PublicKey(m), WSOL).publicKey);
  const metas = mints.map(m => PublicKey.findProgramAddressSync([Buffer.from('metadata'), META_PROGRAM.toBuffer(), new PublicKey(m).toBuffer()], META_PROGRAM)[0]);
  const accs = await conn.getMultipleAccountsInfo([...pools, ...metas]);
  const out = [];
  mints.forEach((m, i) => {
    const pa = accs[i], ma = accs[mints.length + i]; if (!pa) return;
    let p; try { p = R.LaunchpadPool.decode(pa.data); } catch { return; }
    let name = '', symbol = '', uri = '', image = '';
    if (ma) { try { let o = 1 + 32 + 32; [name, o] = readStr(ma.data, o); [symbol, o] = readStr(ma.data, o); [uri] = readStr(ma.data, o); } catch {} }
    try { const q = new URL(uri).searchParams.get('d'); if (q) image = JSON.parse(unb64u(q)).i || ''; } catch {}
    const vA = +p.virtualA.toString(), vB = +p.virtualB.toString(), sup = +p.supply.toString();
    out.push({ mint: m, pool: pools[i].toBase58(), name, symbol, image, status: p.status, graduated: p.status > 0, progress: +p.realB.toString() / +p.totalFundRaisingB.toString(), raisedSol: +p.realB.toString() / 1e9, raiseSol: +p.totalFundRaisingB.toString() / 1e9, startSol: sup * vB / vA / 1e9 });
  });
  return { coins: out };
}

module.exports = async (req, res) => {
  const a = new URL(req.url, 'http://x').searchParams.get('a');
  try {
    if (a === 'status') return send(res, 200, await status(), 's-maxage=30, stale-while-revalidate=120');
    if (a === 'coins') return send(res, 200, await coins(), 's-maxage=15, stale-while-revalidate=60');
    if (a === 'build' && req.method === 'POST') return send(res, 200, await build(req));
    if (a === 'send' && req.method === 'POST') return send(res, 200, await sendTxs(req));
    if (a === 'm') {
      const d = JSON.parse(unb64u(new URL(req.url, 'http://x').searchParams.get('d') || ''));
      return send(res, 200, { name: d.n, symbol: d.s, description: d.d || `${d.n} launched on fl00r, on Raydium LaunchLab.`, image: d.i, ...(d.t || d.w ? { extensions: { twitter: d.t, website: d.w } } : {}), createdOn: host(req) }, 'public, max-age=31536000, immutable');
    }
    return send(res, 404, { error: 'unknown action' });
  } catch (e) { return send(res, 400, { error: e.message || String(e) }); }
};
module.exports._test = { build, setCfg: v => { cfgCache = { t: Date.now() + 1e9, v }; }, conn };
