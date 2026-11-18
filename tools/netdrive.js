#!/usr/bin/env node
/* MAKE THE CUT — tools/netdrive.js  (owner: net)
 * Fase 1c del online (notes/net.md): UN Chrome headless con DOS páginas del juego real (?net=bc: BroadcastChannel con latencia
 * simulada), una de anfitrión (hueco 0) y otra de invitado (hueco 1), cada una con un bot (&bot=1 → ctx.netBot) durante SECS s.
 * Comprueba: las dos conectan y juegan, huellas de la partida confirmada iguales en los dos lados (stateHash en los mismos tics),
 * cero congelaciones con 80 ms, el invitado se ve a sí mismo en x > 0 (vista espejo), marcador espejo, rótulo del rival con su
 * nombre, coste de frame y consola sin errores. Capturas de las dos vistas en tools/out/netdrive-*.png.
 * Uso: node tools/netdrive.js [segundos=120] [lag=80] [query extra, p. ej. "quality=low"]
 * Online V2 (notes/online-v2-spec.md): con «model=fluida» en la query extra las dos páginas juegan con la conexión Fluida
 *   (VB.NetFluid, ?net=bc&model=fluida). En vez de las huellas por tic (Fluida no las tiene) compara la secuencia de marcadores
 *   de la partida de cada lado (una debe ser prefijo de la otra y, al final, iguales salvo el punto en vuelo) y comprueba que
 *   el grabador de repeticiones está bloqueado ('net'). Ej.: node tools/netdrive.js 60 120 "quality=low&model=fluida"
 * Fase 2 (--rtc): node tools/netdrive.js --rtc [segundos=60] — las dos páginas pasan por el LOBBY de verdad (js/netlobby.js) contra el
 *   emulador de Firestore (Java + jar, ver tools/roomtest.js; ?netemu=PUERTO&netuid=…, solo desde file:// o localhost) y conectan por
 *   WebRTC local (RtcLink, sin STUN: ?netice=none). Comprueba: lista con la sala del anfitrión, entrar, sala de espera con el nombre del
 *   rival, conexión y partido, huellas iguales, caída de la conexión a mitad (se renegocia sola en la misma sala), nunca una IP en
 *   pantalla, abandono y sala borrada. Capturas tools/out/netrtc-*.png.
 * Fase 3 (--guion): node tools/netdrive.js --guion [lag=80] — partido completo con guion (ver el bloque del final): looks y equipaciones
 *   del rival, tiempo muerto (no existe), challenge, página oculta, corte con «Seguir contra la IA», pausa entre sets saltada por los
 *   dos, hoja final, récord online y gorra, revancha y abandono. Capturas tools/out/net3-*.png.
 * Banderas anti-frenado de Chrome (las dos páginas a la vez): --disable-background-timer-throttling --disable-renderer-backgrounding
 * --disable-backgrounding-occluded-windows. Memoria: un solo Chrome, 800×450 por página, calidad baja por defecto.
 */
'use strict';
const fs = require('fs'), os = require('os'), path = require('path');
const CH = require('./chrome.js'), CDP = require('./cdp.js');
const ROOT = path.join(__dirname, '..'), OUT = path.join(__dirname, 'out');
const RTC = process.argv.includes('--rtc'), GUION = process.argv.includes('--guion'), ARGV = process.argv.filter(a => a !== '--rtc' && a !== '--guion');
const SECS = +(ARGV[2] || (RTC ? 60 : 120)), LAG = +(ARGV[3] || 80), EXTRA = ARGV[4] != null ? ARGV[4] : 'quality=low';
const FLUIDA = /(^|&)model=fluida(&|$)/.test(EXTRA);   // (Online V2: la query extra llega a las dos páginas)
// (fase 4) NDW / NDH / NDTOUCH=1: tamaño y pantalla táctil del modo básico (p. ej. NDW=844 NDH=390 NDTOUCH=1: teléfono apaisado)
const W = +(process.env.NDW || 800), H = +(process.env.NDH || 450), TOUCH = process.env.NDTOUCH === '1';
fs.mkdirSync(OUT, { recursive: true });
const sleep = ms => new Promise(r => setTimeout(r, ms));
let chrome = null, prof = null;
function cleanup() { if (chrome) { CH.kill(chrome); chrome = null; } if (prof) { CDP.rmProfile(prof); prof = null; } }
process.on('exit', cleanup); process.on('SIGINT', () => process.exit(130)); process.on('SIGTERM', () => process.exit(143));
if (!GUION) setTimeout(() => { console.error('TIEMPO AGOTADO'); process.exit(2); }, (SECS + 150) * 1000).unref();

let fails = 0, oks = 0;
function check(name, ok, info) {
  if (ok) oks++; else fails++;
  console.log((ok ? '  ok   ' : '  FALLO ') + name + (info !== undefined ? ' ' + (typeof info === 'string' ? info : JSON.stringify(info)) : ''));
}
function page(wsUrl, tag) {
  const ws = new WebSocket(wsUrl), pending = new Map(), errors = [], logs = [];
  let id = 0;
  const ready = new Promise((r, j) => { ws.onopen = r; ws.onerror = j; });
  ws.onmessage = ev => {
    const m = JSON.parse(ev.data);
    if (m.id && pending.has(m.id)) { const p = pending.get(m.id); pending.delete(m.id); m.error ? p.rej(new Error(m.error.message)) : p.res(m.result); return; }
    if (m.method === 'Runtime.exceptionThrown') { const d = m.params.exceptionDetails; errors.push('Uncaught ' + (d.exception ? d.exception.description : d.text)); }
    if (m.method === 'Runtime.consoleAPICalled') {
      const txt = m.params.args.map(a => a.value !== undefined ? a.value : a.description).join(' ');
      logs.push(m.params.type + ': ' + txt);
      if (m.params.type === 'error' || /\[VB\]\[ERROR\]/.test(txt)) errors.push(txt);
    }
  };
  const send = (method, params) => new Promise((res, rej) => { const i = ++id; pending.set(i, { res, rej }); ws.send(JSON.stringify({ id: i, method, params: params || {} })); });
  const evalJs = async (expr) => { const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true }); if (r.exceptionDetails) throw new Error(r.exceptionDetails.text + ' ' + (r.exceptionDetails.exception && r.exceptionDetails.exception.description)); return r.result && r.result.value; };
  const shot = async (file) => { const r = await send('Page.captureScreenshot', { format: 'png' }); fs.writeFileSync(file, Buffer.from(r.data, 'base64')); return file; };
  return { tag, ready, send, evalJs, shot, errors, logs, close: () => { try { ws.close(); } catch (e) { } } };
}

if (!RTC && !GUION) (async () => {
  const t0 = Date.now();
  prof = fs.mkdtempSync(path.join(os.tmpdir(), 'vb3c-'));
  chrome = CH.launch(prof, 0, W + ',' + (H + 160), ['--disable-background-timer-throttling', '--disable-renderer-backgrounding', '--disable-backgrounding-occluded-windows']);
  let port = 0;
  for (let i = 0; i < 75 && !port; i++) { await sleep(200); try { port = +fs.readFileSync(path.join(prof, 'DevToolsActivePort'), 'utf8').trim().split(/\s+/)[0] || 0; } catch (e) { } }
  if (!port) throw new Error('Chrome no arranca');
  const base = 'http://127.0.0.1:' + port;
  // segunda página en el MISMO Chrome (ventana propia para que las dos pinten)
  let list = [];
  for (let i = 0; i < 25 && !list.length; i++) { await sleep(200); try { list = (await (await fetch(base + '/json/list')).json()).filter(t => t.type === 'page'); } catch (e) { } }
  await fetch(base + '/json/new?about:blank', { method: 'PUT' });
  await sleep(400);
  list = (await (await fetch(base + '/json/list')).json()).filter(t => t.type === 'page');
  if (list.length < 2) throw new Error('no hay dos páginas');
  const P = [page(list[0].webSocketDebuggerUrl, 'anfitrión'), page(list[1].webSocketDebuggerUrl, 'invitado')];
  if (process.env.NDLOG) process.on('exit', () => { for (const p of P) for (const l of p.logs) if ((process.env.NDLOG === '2' ? /\[netlog\]|\[VB\]/ : /\[netlog\]/).test(l)) console.log(p.tag + ' ' + l.slice(0, 400)); });   // (NDLOG=1: el informe de red, js/netlog.js con &netlog=1)
  const room = 'nd' + Date.now().toString(36);
  for (let k = 0; k < 2; k++) {
    const p = P[k]; await p.ready;
    await p.send('Runtime.enable'); await p.send('Page.enable');
    await p.send('Emulation.setDeviceMetricsOverride', { width: W, height: H, deviceScaleFactor: 1, mobile: TOUCH });
    if (TOUCH) await p.send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
    await p.send('Emulation.setFocusEmulationEnabled', { enabled: true }).catch(() => { });
    const q = 'net=bc&slot=' + k + '&room=' + room + '&lag=' + LAG + '&jit=15&loss=3&bot=1&name=' + encodeURIComponent(k ? 'Invi' : 'Anfi') + '&map=' + (k ? '' : 'palau') + (EXTRA ? '&' + EXTRA : '');
    await p.send('Page.navigate', { url: CH.pageUrl(ROOT, q) });
  }
  // espera a que las dos estén jugando
  const st = async p => JSON.parse(await p.evalJs("JSON.stringify((function(){var n=VB.ctx.net,r=n&&n.r;return{st:VB.ctx.state,ns:r&&r.status,tick:r&&r.tick,gc:r&&r.gcTick,ping:r&&r.ping,rival:n&&n.sess.rivalName}})())").catch(() => 'null'));
  let both = false;
  for (let i = 0; i < 120 && !both; i++) {
    await sleep(500);
    const a = await st(P[0]), b = await st(P[1]);
    both = a && b && a.ns === 'playing' && b.ns === 'playing';
    if (i % 10 === 9) console.log('  esperando…', JSON.stringify(a), JSON.stringify(b));
  }
  check('las dos páginas conectan por BroadcastChannel y juegan' + (FLUIDA ? ' (Fluida)' : ''), both);
  if (!both) { for (const p of P) console.log(p.tag, p.errors.slice(0, 5), p.logs.slice(-8)); cleanup(); process.exit(1); }
  // NDPROF=1: perfil de CPU del invitado durante el partido → tools/out/netdrive-invitado.cpuprofile (para buscar parones)
  if (process.env.NDPROF) { await P[1].send('Profiler.enable'); await P[1].send('Profiler.setSamplingInterval', { interval: 500 }); await P[1].send('Profiler.start'); }
  // contadores en página: congelaciones, huellas de la confirmada por tic, coste de frame
  // (Fluida: sin huellas por tic; cada cambio del marcador de la partida de esta máquina, sets|juegos|puntos, a window.__ndS)
  const HOOK = "(function(){var n=VB.ctx.net;if(!n||window.__nd)return;var s=n.sess,H=window.__ndH={},S=window.__ndS=[],W=window.__nd={wait:0,frames:0,ms:0,maxMs:0,unst:0};" +
    "var o=s._hashTick;if(o)s._hashTick=function(){o.call(this);H[this.gcTick]=this.myHash[this.gcTick];};" +
    "var mk=function(g){return g?(g.sets||[]).join('-')+'|'+JSON.stringify(g.setScores||[])+'|'+(g.score||[]).join('-'):'';};" +
    "var a=s.advance;s.advance=function(now,inp){var t=performance.now(),r=a.call(this,now,inp),d=performance.now()-t;W.frames++;W.ms+=d;if(d>W.maxMs)W.maxMs=d;if(r.status==='waiting')W.wait++;if(r.unstable)W.unst++;" +
    "var k=mk(this.confirmedGame());if(k&&S[S.length-1]!==k)S.push(k);return r;};})()";
  for (const p of P) await p.evalJs(HOOK);
  const t1 = Date.now();
  let shots = 0; const LTH = [{ tag: '', hud: '' }, { tag: '', hud: '' }];
  while (Date.now() - t1 < SECS * 1000) {
    await sleep(5000);
    const a = await st(P[0]), b = await st(P[1]);
    console.log('  ' + Math.round((Date.now() - t1) / 1000) + ' s · anfitrión ' + JSON.stringify(a) + ' · invitado ' + JSON.stringify(b));
    if (shots < 2 && Date.now() - t1 > (shots ? 40000 : 15000)) {
      shots++;
      for (let k = 0; k < 2; k++) console.log('  captura', await P[k].shot(path.join(OUT, 'netdrive-' + (k ? 'invitado' : 'anfitrion') + '-' + shots + '.png')));
    }
    // rótulo y HUD mientras se juega (con points=N el partido puede acabar antes y al final ya no están)
    for (let k = 0; k < 2; k++) {
      const th = await P[k].evalJs("JSON.stringify((function(){var t=document.getElementById('netTag'),h=document.getElementById('netHud');return{tag:t&&!t.hidden?t.textContent:'',hud:h&&!h.hidden?h.textContent:''}})())").then(JSON.parse).catch(() => null);
      if (th && th.tag) LTH[k].tag = th.tag; if (th && /ms/.test(th.hud)) LTH[k].hud = th.hud;
    }
    if (a && a.st === 'over' && b && b.st === 'over') break;
  }
  // (fase 4) en táctil: corte de 13 s; el aviso «Esperando a … Seguir contra la IA / Abandonar» cabe en la pantalla (baja de línea)
  let preW = null;   // (esperas antes del corte a propósito: las congelaciones se cuentan hasta ahí)
  if (TOUCH) {
    preW = await Promise.all(P.map(p => p.evalJs('(window.__nd||{}).wait||0').catch(() => 0)));
    await Promise.all(P.map(p => p.evalJs('VB.ctx.net.link.down(13000)').catch(() => null)));
    let offer = false; for (let i = 0; i < 64 && !offer; i++) { await sleep(250); offer = await P[0].evalJs("!!document.querySelector('#netHud button[data-n=ai]')").catch(() => false); }
    const box = JSON.parse(await P[0].evalJs("JSON.stringify((function(){var r=document.getElementById('netHud').getBoundingClientRect();return{l:r.left,r:r.right,b:r.bottom,w:innerWidth,h:innerHeight,t:document.getElementById('netHud').textContent}})())"));
    console.log('  captura', await P[0].shot(path.join(OUT, 'netdrive-movil-espera.png')));
    check('táctil: el aviso de espera con sus dos botones cabe en la pantalla', offer && box.l >= 0 && box.r <= box.w && box.b <= box.h, box);
    await sleep(5000);
  }
  // resultados
  const R = [];
  for (const p of P) R.push(JSON.parse(await p.evalJs("JSON.stringify((function(){var n=VB.ctx.net,s=n&&n.sess,v=n&&n.view,W=window.__nd||{};" +
    "var gc=s&&(s.gc||s.confirmedGame());" +
    "return{h:window.__ndH,seq:window.__ndS,model:s&&(s.model||'precisa'),rpWhy:VB.Replay&&VB.Replay._state?VB.Replay._state().why:'?',wait:W.wait,frames:W.frames,ms:W.frames?W.ms/W.frames:0,maxMs:W.maxMs,unst:W.unst,depth:s&&s.stats.maxDepth,mism:s&&s.mismatches,rep:s&&s.repaired," +
    "fps:VB.ctx.fps,frameMs:VB.ctx.frameMs,score:v&&v.score,cscore:gc&&gc.score,ctrlTeam:v&&v.ctrl&&v.ctrl.team,ctrlX:v&&v.ctrl&&v.ctrl.x,ctrlId:v&&v.ctrl&&v.ctrl.id," +
    "hum:gc&&[gc.hum[0].p.id,gc.hum[1].p.id],tag:(function(){var e=document.getElementById('netTag');return e&&!e.hidden?e.textContent:''})()," +
    "hud:(function(){var e=document.getElementById('netHud');return e&&!e.hidden?e.textContent:''})(),q:VB.ctx.quality&&VB.ctx.quality.level}})())")));
  const [A, B] = R;
  for (let k = 0; k < 2; k++) { if (!R[k].tag) R[k].tag = LTH[k].tag; if (!/ms/.test(R[k].hud)) R[k].hud = LTH[k].hud; }
  if (!FLUIDA) {
    let n = 0, bad = 0;
    for (const t in A.h) if (B.h[t] !== undefined) { n++; if (A.h[t] !== B.h[t]) bad++; }
    check('huellas de la confirmada iguales en los dos lados', n > 20 && bad === 0, { controles: n, distintas: bad, reparaciones: [A.rep, B.rep] });
  } else {
    // Fluida: cada máquina aplica los puntos cuando le llegan (una va como mucho un punto por delante); los marcadores por los que
    // pasan deben ser los mismos y en el mismo orden
    const sa = A.seq || [], sb = B.seq || [], m = Math.min(sa.length, sb.length);
    let pre = true; for (let i = 0; i < m; i++) if (sa[i] !== sb[i]) { pre = false; break; }
    check('Fluida: las dos sesiones son Fluida y sin repeticiones (grabador bloqueado)', A.model === 'fluida' && B.model === 'fluida' && A.rpWhy === 'net' && B.rpWhy === 'net', { modelo: [A.model, B.model], replay: [A.rpWhy, B.rpWhy] });
    check('Fluida: los dos marcadores pasan por los mismos resultados', pre && m >= 3 && Math.abs(sa.length - sb.length) <= 1, { anf: sa.length, inv: sb.length, ultimo: [sa[sa.length - 1], sb[sb.length - 1]] });
  }
  if (preW) { A.wait = preW[0]; B.wait = preW[1]; }
  check('cero congelaciones con ' + LAG + ' ms', A.wait === 0 && B.wait === 0, { anfitrion: A.wait, invitado: B.wait, inestable: [A.unst, B.unst] });
  check('el invitado se ve a sí mismo como equipo 0 (vista espejo) y lleva al jugador del equipo 1 de la canónica', B.ctrlTeam === 0 && B.ctrlId === B.hum[1] && A.ctrlId === A.hum[0], { inv: [B.ctrlTeam, B.ctrlId, B.hum], anf: [A.ctrlId] });
  check('marcador espejo en el invitado', B.score && B.cscore && B.score[0] === B.cscore[1] && B.score[1] === B.cscore[0], { vista: B.score, canonica: B.cscore });
  check('rótulo del rival con su nombre (nunca la IP)', /Invi/.test(A.tag) && /Anfi/.test(B.tag) && !/\d+\.\d+\.\d+\.\d+/.test(A.tag + B.tag + A.hud + B.hud), { anf: A.tag, inv: B.tag });
  check('HUD con el ping', /ms/.test(A.hud) && /ms/.test(B.hud), { anf: A.hud, inv: B.hud });
  check('consola sin errores', !P[0].errors.length && !P[1].errors.length, [P[0].errors.slice(0, 3), P[1].errors.slice(0, 3)]);
  if (process.env.NDPROF) { try { const pr = await P[1].send('Profiler.stop'); fs.mkdirSync(path.join(ROOT, 'tools', 'out'), { recursive: true }); fs.writeFileSync(path.join(ROOT, 'tools', 'out', 'netdrive-invitado.cpuprofile'), JSON.stringify(pr.profile)); console.log('  perfil: tools/out/netdrive-invitado.cpuprofile'); } catch (e) { console.log('  perfil: ' + e.message); } }
  console.log('  sesión por frame: anfitrión ' + A.ms.toFixed(3) + ' ms (máx ' + A.maxMs.toFixed(1) + '), invitado ' + B.ms.toFixed(3) + ' ms (máx ' + B.maxMs.toFixed(1) + ') · rollback máx ' + A.depth + '/' + B.depth +
    ' tics · fps ' + A.fps + '/' + B.fps + ' · frame JS ' + (+A.frameMs || 0).toFixed(1) + '/' + (+B.frameMs || 0).toFixed(1) + ' ms · calidad ' + A.q + '/' + B.q);
  console.log('  invitado: x de su jugador en la vista ' + (+B.ctrlX).toFixed(2) + ' (x > 0 = su campo de la vista)');
  for (let k = 0; k < 2; k++) console.log('  captura final', await P[k].shot(path.join(OUT, 'netdrive-' + (k ? 'invitado' : 'anfitrion') + '-fin.png')));
  for (const p of P) p.close();
  cleanup();
  console.log('\n' + oks + ' ok, ' + fails + ' fallos (' + ((Date.now() - t0) / 1000).toFixed(0) + ' s)');
  process.exit(fails ? 1 : 0);
})().catch(e => { console.error(e); cleanup(); process.exit(1); });

/* ======================= --rtc: lobby + WebRTC + emulador de Firestore ======================= */
const EMU_PORT = 8091;
let java = null;
function findJar() {
  const d = path.join(os.homedir(), '.cache', 'firebase', 'emulators');
  try { return fs.readdirSync(d).filter(f => /^cloud-firestore-emulator-.*\.jar$/.test(f)).sort().map(f => path.join(d, f)).pop() || null; } catch (e) { return null; }
}
/** En Windows `java` suele ser un lanzador: kill() dejaba vivo el java.exe hijo (seguía en el puerto con las reglas viejas). */
function killJava() {
  if (!java) return; const p = java; java = null;
  try { if (process.platform === 'win32') require('child_process').spawnSync('taskkill', ['/PID', String(p.pid), '/T', '/F'], { stdio: 'ignore', windowsHide: true }); else p.kill(); } catch (e) { }
}
async function startEmu() {
  const jar = findJar(); if (!jar) return false;
  try { await fetch('http://127.0.0.1:' + EMU_PORT + '/'); console.log('El puerto ' + EMU_PORT + ' ya está ocupado (¿un emulador de una pasada anterior?): ciérralo.'); process.exit(3); } catch (e) { }
  java = require('child_process').spawn('java', ['-Xmx384m', '-jar', jar, '--host', '127.0.0.1', '--port', String(EMU_PORT), '--rules', path.join(ROOT, 'firebase', 'firestore.rules'), '--project_id', 'demo-mtc'], { stdio: 'ignore', windowsHide: true });
  process.on('exit', () => killJava());
  for (let i = 0; i < 120; i++) { await sleep(500); try { const r = await fetch('http://127.0.0.1:' + EMU_PORT + '/'); if (r.status < 500) return true; } catch (e) { } }
  return false;
}
async function emuReq(method, p, body) { const r = await fetch('http://127.0.0.1:' + EMU_PORT + '/v1/projects/demo-mtc/databases/(default)/documents/' + p, { method, headers: { Authorization: 'Bearer owner', 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined }); return r; }
async function emuGet(p) { const r = await fetch('http://127.0.0.1:' + EMU_PORT + '/v1/projects/demo-mtc/databases/(default)/documents/' + p, { headers: { Authorization: 'Bearer owner' } }); return r.status; }
if (RTC) (async () => {
  const t0 = Date.now();
  if (!(await startEmu())) { console.log('Sin emulador de Firestore (Java + jar): instala el jar con «npx firebase-tools@13.29.1 setup:emulators:firestore».'); process.exit(3); }
  console.log('  emulador de Firestore en el puerto ' + EMU_PORT);
  prof = fs.mkdtempSync(path.join(os.tmpdir(), 'vb3r-'));
  chrome = CH.launch(prof, 0, W + ',' + (H + 160), ['--disable-background-timer-throttling', '--disable-renderer-backgrounding', '--disable-backgrounding-occluded-windows']);
  let port = 0;
  for (let i = 0; i < 75 && !port; i++) { await sleep(200); try { port = +fs.readFileSync(path.join(prof, 'DevToolsActivePort'), 'utf8').trim().split(/\s+/)[0] || 0; } catch (e) { } }
  if (!port) throw new Error('Chrome no arranca');
  const base = 'http://127.0.0.1:' + port;
  let list = [];
  for (let i = 0; i < 25 && !list.length; i++) { await sleep(200); try { list = (await (await fetch(base + '/json/list')).json()).filter(t => t.type === 'page'); } catch (e) { } }
  await fetch(base + '/json/new?about:blank', { method: 'PUT' });
  await sleep(400);
  list = (await (await fetch(base + '/json/list')).json()).filter(t => t.type === 'page');
  const P = [page(list[0].webSocketDebuggerUrl, 'anfitrión'), page(list[1].webSocketDebuggerUrl, 'invitado')];
  if (process.env.NDLOG) process.on('exit', () => { for (const p of P) for (const l of p.logs) if ((process.env.NDLOG === '2' ? /\[netlog\]|\[VB\]/ : /\[netlog\]/).test(l)) console.log(p.tag + ' ' + l.slice(0, 400)); });   // (NDLOG=1: el informe de red, js/netlog.js con &netlog=1)
  const NAMES = ['Anfi Prueba', 'Invi Prueba'];
  for (let k = 0; k < 2; k++) {
    const p = P[k]; await p.ready;
    await p.send('Runtime.enable'); await p.send('Page.enable');
    await p.send('Emulation.setDeviceMetricsOverride', { width: W, height: H, deviceScaleFactor: 1, mobile: false });
    await p.send('Emulation.setFocusEmulationEnabled', { enabled: true }).catch(() => { });
    const q = 'debug=menu&online=1&netemu=' + EMU_PORT + '&netuid=uid' + (k ? 'Invi' : 'Anfi') + '&netice=none&name=' + encodeURIComponent(NAMES[k]) + (EXTRA ? '&' + EXTRA : '');
    await p.send('Page.navigate', { url: CH.pageUrl(ROOT, q) });
  }
  const ev = (p, js) => p.evalJs(js).catch(e => { console.log('  (eval ' + p.tag + ': ' + e.message.slice(0, 160) + ')'); return null; });
  const lob = async p => JSON.parse(await ev(p, "JSON.stringify(VB.NetLobby&&VB.NetLobby._state())") || 'null');
  const waitFor = async (p, js, ms) => { const tEnd = Date.now() + ms; while (Date.now() < tEnd) { if (await ev(p, js)) return true; await sleep(250); } return false; };
  for (const p of P) await waitFor(p, "!!(window.VB&&VB.ctx&&VB.ctx.state==='menu'&&VB.UI&&VB.NetLobby)", 30000);
  check('tarjeta «Online» visible en Jugar (publicada: VB.NetLobby.menuOn)', await ev(P[0], "!document.getElementById('btnOnline').hidden"));
  for (const p of P) await ev(p, "VB.UI.menuGo('online')");
  // (fase 4) la primera vez sale «Cómo funciona» antes de la lista; «Entendido» lleva a la lista y no vuelve a salir
  const helpOn = await waitFor(P[0], "!!document.querySelector('#mpOnline [data-a=helpOk]')", 15000);
  const helpTxt = helpOn ? await ev(P[0], "document.querySelector('#mpOnline .ol-help').textContent") : '';
  check('primera vez en Online: «Cómo funciona» (1 contra 1, sin pausa, 10 s entre sets, abandonar = derrota, la gorra)', helpOn && /n.º 1/.test(helpTxt) && /10 s/.test(helpTxt) && /derrota/.test(helpTxt) && /Online Beta Tester/.test(helpTxt), helpTxt.slice(0, 80));
  if (helpOn) console.log('  captura', await P[0].shot(path.join(OUT, 'netrtc-ayuda.png')));
  for (const p of P) await ev(p, "(function(){var b=document.querySelector('#mpOnline [data-a=helpOk]');if(b)b.click();})()");
  await waitFor(P[0], "!!document.querySelector('#mpOnline [data-a=new]')", 15000);
  await waitFor(P[1], "!!document.querySelector('#mpOnline [data-a=new]')", 15000);
  check('las dos páginas en el lobby (lista de salas)', (await lob(P[0])).view === 'list' && (await lob(P[1])).view === 'list', [await lob(P[0]), await lob(P[1])]);
  await waitFor(P[1], "!!document.querySelector('#mpOnline .ol-empty')", 8000);
  console.log('  captura', await P[1].shot(path.join(OUT, 'netrtc-lista-vacia.png')));
  // (revisión F2 n.º 3) sala fantasma: su anfitrión cerró la pestaña sin avisar hace 40 s (aún sale en la lista: < 90 s). Quien entra no
  // espera 35 s ni le dicen que «vuestras redes no lo permiten»: a los 10 s sin oferta y con el latido atrasado, «… no responde» y vuelta
  // a la lista; el hueco queda libre.
  {
    const v = await ev(P[1], "VB.NetLobby._ver ? VB.NetLobby._ver() : (VB.Net?VB.Net.PROTO:0)+'|'+(VB.VERSION||'')"), S = x => ({ stringValue: x });
    await emuReq('PATCH', 'rooms/uidFant', { fields: { code: S('FANT22'), name: S('Sala Fantasma'), gname: S(''), host: S('uidFant'), guest: S(''), fmt: S('2v2'), venue: S('hall'), map: S(''),
      even: { booleanValue: false }, bo: { integerValue: '1' }, pts: { integerValue: '21' }, state: S('open'), v: S(v), seen: { timestampValue: new Date(Date.now() - 40000).toISOString() } } });
    await ev(P[1], "document.querySelector('#mpOnline [data-a=refresh]').click()");
    const seenF = await waitFor(P[1], "!!document.querySelector('#mpOnline [data-a=join][data-id=uidFant]')", 12000);
    const tj = Date.now();
    await ev(P[1], "document.querySelector('#mpOnline [data-a=join][data-id=uidFant]').click()");
    const gone = await waitFor(P[1], "(function(){var s=VB.NetLobby._state();return s.view==='list'&&!s.role&&/no responde/.test(s.msg)})()", 20000);
    const dt = Date.now() - tj, msg = (await lob(P[1])).msg;
    await sleep(800);
    const fr = await (await emuReq('GET', 'rooms/uidFant')).json();
    check('sala fantasma (anfitrión que cerró sin avisar): «no responde» en ~10 s, no «vuestras redes»; el hueco queda libre', seenF && gone && dt < 16000 && !/redes/.test(msg) && fr.fields && fr.fields.guest.stringValue === '', { ms: dt, msg });
    console.log('  captura', await P[1].shot(path.join(OUT, 'netrtc-sala-fantasma.png')));
    await emuReq('DELETE', 'rooms/uidFant');
    await ev(P[1], "document.querySelector('#mpOnline [data-a=refresh]').click()");
    await sleep(500);
  }
  // anfitrión: crear sala en la playa, 1 set
  await ev(P[0], "document.querySelector('#mpOnline [data-a=new]').click()");
  await waitFor(P[0], "!!document.querySelector('#mpOnline [data-ol=venue]')", 5000);
  await ev(P[0], "(function(){var b=document.querySelector('#mpOnline [data-ol=venue]');if(b&&!/Playa/.test(b.textContent))b.click();})()");
  await sleep(300);
  console.log('  captura', await P[0].shot(path.join(OUT, 'netrtc-crear.png')));
  await ev(P[0], "document.querySelector('#mpOnline [data-a=open]').click()");
  const okRoom = await waitFor(P[0], "(function(){var s=VB.NetLobby._state();return s.view==='room'&&s.role==='host'&&s.room&&s.room.code})()", 10000);
  const A0 = await lob(P[0]);
  check('el anfitrión abre su sala (código de 6)', okRoom && /^[2-9A-HJKMNP-Z]{6}$/.test(A0.room.code), A0.room);
  await sleep(300);
  console.log('  captura', await P[0].shot(path.join(OUT, 'netrtc-sala-espera.png')));
  // invitado: la ve en la lista
  await ev(P[1], "document.querySelector('#mpOnline [data-a=refresh]').click()");
  const seen = await waitFor(P[1], "VB.NetLobby._state().rooms.some(function(r){return r.id==='uidAnfi'})", 15000);
  await sleep(300);
  const txt = await ev(P[1], "document.querySelector('#mpOnline .ol-rooms').textContent");
  check('el invitado ve la sala en la lista con el nombre de quien la creó, la sede y el partido', seen && /Anfi Prueba/.test(txt) && /Playa/.test(txt) && /1 set a 21/.test(txt), txt);
  console.log('  captura', await P[1].shot(path.join(OUT, 'netrtc-lista.png')));
  await ev(P[1], "document.querySelector('#mpOnline [data-a=join][data-id=uidAnfi]').click()");
  const conn = await waitFor(P[0], "(function(){var s=VB.NetLobby._state();return s.rival==='Invi Prueba'})()", 10000);
  check('sala de espera del anfitrión con el nombre del rival', conn && /Invi Prueba/.test(await ev(P[0], "document.querySelector('#mpOnline .ol-vs').textContent")));
  const both = await Promise.all(P.map(p => waitFor(p, "!!(VB.ctx.net&&VB.ctx.net.r&&VB.ctx.net.r.status==='playing')", 40000)));
  const AL = await lob(P[0]), BL = await lob(P[1]);
  check('se conectan por WebRTC y empieza el partido en las dos', both[0] && both[1], [AL, BL]);
  if (!(both[0] && both[1])) { for (const p of P) console.log(p.tag, p.errors.slice(0, 5), p.logs.slice(-12)); cleanup(); process.exit(1); }
  {   // (fase 3) el «pre» del lobby lleva looks y equipación de cada uno; los dos ven las mismas equipaciones
    await sleep(1500);
    const K = "JSON.stringify((function(){var n=VB.ctx.net,g=VB.ctx.game,P=VB.Players,T=function(p){var r=P.rigOf(p);return r&&r.tc?r.tc.base:null};return{th:!!(n.look&&n.look.theirs&&n.look.theirs.kit),fits:!!(n.look&&n.look.theirs&&n.look.theirs.fits[0]),me:T(g.teams[0][0]),rv:T(g.teams[1][0])}})())";
    const ka = JSON.parse(await ev(P[0], K) || 'null'), kb = JSON.parse(await ev(P[1], K) || 'null');
    check('fase 3: el «pre» trae el look y la equipación del rival (saneados) y las dos pantallas visten igual', ka && kb && ka.th && kb.th && ka.fits && kb.fits && ka.me === kb.rv && ka.rv === kb.me, [ka, kb]);
  }
  check('cada uno ve el NOMBRE del rival (sesión y lobby)', AL.rival === 'Invi Prueba' && BL.rival === 'Anfi Prueba' &&
    (await ev(P[0], 'VB.ctx.net.sess.rivalName')) === 'Invi Prueba' && (await ev(P[1], 'VB.ctx.net.sess.rivalName')) === 'Anfi Prueba');
  check('el anfitrión es el hueco 0 y el invitado el 1', (await ev(P[0], 'VB.ctx.net.slot')) === 0 && (await ev(P[1], 'VB.ctx.net.slot')) === 1);
  await sleep(1500);
  check('al conectar se borra la señalización', (await emuGet('rooms/uidAnfi/sig/offer')) === 404 && (await emuGet('rooms/uidAnfi/sig/answer')) === 404);
  console.log('  par ICE', JSON.stringify(AL.linkInfo), JSON.stringify(BL.linkInfo));
  // bots en las dos y huellas
  for (let k = 0; k < 2; k++) await ev(P[k], "VB.ctx.netBot=VB.Net.bot(" + k + "," + (k + 1) + ",'bueno');" +
    "(function(){var n=VB.ctx.net,s=n.sess,H=window.__ndH={},W=window.__nd={wait:0,frames:0};var o=s._hashTick;s._hashTick=function(){o.call(this);H[this.gcTick]=this.myHash[this.gcTick];};" +
    "var a=s.advance;s.advance=function(now,inp){var r=a.call(this,now,inp);W.frames++;if(r.status==='waiting')W.wait++;return r;};})()");
  const st = async p => JSON.parse(await ev(p, "JSON.stringify((function(){var n=VB.ctx.net,r=n&&n.r;return{st:VB.ctx.state,ns:r&&r.status,tick:r&&r.tick,gc:r&&r.gcTick,ping:r&&r.ping,link:VB.NetLobby._state().link,sc:n&&n.view&&n.view.score}})())") || 'null');
  const half = Math.max(15, SECS / 2) * 1000, t1 = Date.now();
  while (Date.now() - t1 < half) { await sleep(5000); console.log('  ' + Math.round((Date.now() - t1) / 1000) + ' s · ' + JSON.stringify(await st(P[0])) + ' · ' + JSON.stringify(await st(P[1]))); }
  for (let k = 0; k < 2; k++) console.log('  captura', await P[k].shot(path.join(OUT, 'netrtc-' + (k ? 'invitado' : 'anfitrion') + '.png')));
  // caída de la conexión del invitado: se renegocia sola (gen + 1) en la misma sala
  const gen0 = await ev(P[0], 'VB.NetLobby._link().opens');
  await ev(P[1], 'VB.NetLobby._link()._kill()');
  console.log('  conexión del invitado cortada a mano');
  const back = await waitFor(P[0], "VB.NetLobby._link().opens>" + gen0 + "&&VB.NetLobby._state().link==='open'", 40000);
  const back2 = back && await waitFor(P[1], "VB.NetLobby._state().link==='open'&&VB.ctx.net.r.status==='playing'", 20000);
  check('la conexión se cae a mitad de partido y se renegocia sola (misma sala, misma sesión)', back && back2, [await lob(P[0]), await lob(P[1])]);
  await waitFor(P[0], "VB.ctx.net.r.status==='playing'", 15000);
  await sleep(4000);
  // y ahora se cae la del anfitrión
  const gen1 = await ev(P[1], 'VB.NetLobby._link().opens');
  await ev(P[0], 'VB.NetLobby._link()._kill()');
  console.log('  conexión del anfitrión cortada a mano');
  const back3 = await waitFor(P[1], "VB.NetLobby._link().opens>" + gen1 + "&&VB.NetLobby._state().link==='open'", 40000);
  const back4 = back3 && await waitFor(P[0], "VB.NetLobby._state().link==='open'&&VB.ctx.net.r.status==='playing'", 20000);
  check('también si se cae la del anfitrión', back3 && back4, [await lob(P[0]), await lob(P[1])]);
  console.log('  esperas de la sesión (frames en «waiting»): ' + JSON.stringify([await ev(P[0], 'window.__nd.wait'), await ev(P[1], 'window.__nd.wait')]) + ' · stats.waits ' + JSON.stringify([await ev(P[0], 'VB.ctx.net.sess.stats.waits'), await ev(P[1], 'VB.ctx.net.sess.stats.waits')]));
  const t2 = Date.now();
  while (Date.now() - t2 < half / 2) { await sleep(5000); console.log('  ' + Math.round((Date.now() - t2) / 1000) + ' s tras reconectar · ' + JSON.stringify(await st(P[0])) + ' · ' + JSON.stringify(await st(P[1]))); }
  const R = [];
  for (const p of P) R.push(JSON.parse(await ev(p, "JSON.stringify((function(){var n=VB.ctx.net,s=n&&n.sess,v=n&&n.view;return{h:window.__ndH,wait:window.__nd.wait,mism:s.mismatches,rep:s.repaired,res:s.stats.resyncs,score:v&&v.score,cscore:s.gc.score," +
    "tag:(function(){var e=document.getElementById('netTag');return e&&!e.hidden?e.textContent:''})(),hud:(function(){var e=document.getElementById('netHud');return e&&!e.hidden?e.textContent:''})(),body:document.body.innerText}})())") || 'null'));
  const [A, B] = R;
  let n = 0, bad = 0;
  for (const t in A.h) if (B.h[t] !== undefined) { n++; if (A.h[t] !== B.h[t]) bad++; }
  check('huellas de la confirmada iguales en los dos lados (antes y después de la caída)', n > 15 && bad === 0, { controles: n, distintas: bad, reparaciones: [A.rep, B.rep], resyncs: [A.res, B.res], esperas: [A.wait, B.wait] });
  check('marcador espejo en el invitado', B.score && B.cscore && B.score[0] === B.cscore[1] && B.score[1] === B.cscore[0], { vista: B.score, canonica: B.cscore });
  check('rótulo con el nombre del rival encima de su jugador', /Invi Prueba/.test(A.tag) && /Anfi Prueba/.test(B.tag), [A.tag, B.tag]);
  const ipRe = /\b\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}\b|[0-9a-f-]{36}\.local|candidate:/i;
  check('nunca se ve una IP, un .local ni un candidato ICE en pantalla', !ipRe.test(A.body + B.body + A.hud + B.hud), [A.hud, B.hud]);
  // (fase 6) volver al partido tras RECARGAR la página: primero el invitado, luego el anfitrión (su sala no se borra; adopta la
  // partida del invitado). Las dos veces sale «Volviendo al partido…» y después las huellas siguen cuadrando.
  {
    const HUD = "((document.getElementById('netHud')||{}).textContent||'')";
    const playing = "!!(VB.ctx.net&&VB.ctx.net.r&&VB.ctx.net.r.status==='playing'&&VB.NetLobby._state().link==='open')";
    for (const k of [1, 0]) {
      const who = k ? 'invitado' : 'anfitrión', res0 = await ev(P[1 - k], 'VB.ctx.net.sess.stats.resyncs');
      await P[k].send('Page.reload', {});
      console.log('  el ' + who + ' recarga la página');
      await sleep(800);
      const msg = await waitFor(P[k], "/Volviendo al partido/.test(" + HUD + ")", 20000);
      if (msg) console.log('  captura', await P[k].shot(path.join(OUT, 'f6-volviendo-' + (k ? 'inv' : 'anf') + '.png')));
      const ok = await waitFor(P[k], playing, 60000) && await waitFor(P[1 - k], playing, 20000);
      const info = JSON.parse(await ev(P[k], "JSON.stringify((function(){var s=VB.ctx.net&&VB.ctx.net.sess;return s&&{slot:s.slot,adopt:s.adopt,back:s.back,seed:s.opts&&s.opts.seed,valid:s.valid,res:s.stats.resyncs}})())") || 'null');
      const res1 = await ev(P[1 - k], 'VB.ctx.net.sess.stats.resyncs');
      check('fase 6: el ' + who + ' recarga y vuelve al partido (aviso «Volviendo al partido…», ' + (k ? 'resync del anfitrión' : 'el anfitrión adopta la partida del invitado') + ')',
        msg && ok && info && info.slot === k && !info.adopt && !info.back && info.valid && (k ? res1 > res0 : res1 > res0) && (await emuGet('rooms/uidAnfi')) === 200, { msg, ok, info, res: [res0, res1] });
      await ev(P[k], "VB.ctx.netBot=VB.Net.bot(" + k + "," + (k + 1) + ",'bueno')");
      if (ok) await sleep(3000);
    }
    for (let k = 0; k < 2; k++) await ev(P[k], "(function(){var s=VB.ctx.net.sess,H=window.__ndH2={};var o=s._hashTick;s._hashTick=function(){o.call(this);H[this.gcTick]=this.myHash[this.gcTick];};})()");
    await sleep(12000);
    const h0 = JSON.parse(await ev(P[0], 'JSON.stringify(window.__ndH2)') || '{}'), h1 = JSON.parse(await ev(P[1], 'JSON.stringify(window.__ndH2)') || '{}');
    let n2 = 0, bad2 = 0; for (const t in h0) if (h1[t] !== undefined) { n2++; if (h0[t] !== h1[t]) bad2++; }
    check('fase 6: tras las dos recargas las huellas siguen iguales', n2 >= 5 && bad2 === 0, { n2, bad2 });
    for (let k = 0; k < 2; k++) console.log('  captura', await P[k].shot(path.join(OUT, 'f6-vuelta-' + (k ? 'inv' : 'anf') + '.png')));
  }
  // abandono del anfitrión: el invitado gana; la sala se borra
  await ev(P[0], 'VB.ctx.actions.netQuit()');
  const rq = await waitFor(P[1], "!!(VB.ctx.net&&VB.ctx.net.r&&VB.ctx.net.r.status==='ended'&&VB.ctx.net.r.result&&VB.ctx.net.r.result.why==='rivalQuit')", 15000);
  check('el anfitrión abandona: el invitado gana al momento (rivalQuit)', rq, await ev(P[1], 'JSON.stringify(VB.ctx.net&&VB.ctx.net.r&&VB.ctx.net.r.result)'));
  // (auditoría) quien abandona ve «Has abandonado [Volver al menú]» (antes saltaba al menú sin decir nada); el botón (aquí Esc) sale y borra la sala
  const hq = await waitFor(P[0], "(function(){var h=document.getElementById('netHud');return !!(h&&!h.hidden&&/Has abandonado/.test(h.textContent)&&h.querySelector('button[data-n=menu]'))})()", 5000);
  check('quien abandona ve «Has abandonado [Volver al menú]»', hq, await ev(P[0], "(function(){var h=document.getElementById('netHud');return h?h.textContent:''})()"));
  await ev(P[0], 'VB.ctx.actions.pause()');
  check('… y Esc (o el botón) sale al menú', await waitFor(P[0], "VB.ctx.state==='menu'&&!VB.ctx.net", 5000), await ev(P[0], 'VB.ctx.state'));
  await sleep(1500);
  check('la sala del anfitrión se borra al salir', (await emuGet('rooms/uidAnfi')) === 404);
  console.log('  captura', await P[1].shot(path.join(OUT, 'netrtc-invitado-fin.png')));
  // (revisión F2 n.º 3) el anfitrión recarga y abre otra sala; luego cierra la pestaña (pagehide): la sala se borra al momento
  {
    const q = 'debug=menu&online=1&netemu=' + EMU_PORT + '&netuid=uidAnfi&netice=none&name=' + encodeURIComponent(NAMES[0]) + (EXTRA ? '&' + EXTRA : '');
    await P[0].send('Page.navigate', { url: CH.pageUrl(ROOT, q) });
    await sleep(1500);
    await waitFor(P[0], "!!(window.VB&&VB.ctx&&VB.ctx.state==='menu'&&VB.UI&&VB.NetLobby)", 30000);
    await ev(P[0], "VB.UI.menuGo('online')");
    await waitFor(P[0], "!!document.querySelector('#mpOnline [data-a=new]')", 15000);
    await ev(P[0], "document.querySelector('#mpOnline [data-a=new]').click()");
    await waitFor(P[0], "!!document.querySelector('#mpOnline [data-a=open]')", 5000);
    await ev(P[0], "document.querySelector('#mpOnline [data-a=open]').click()");
    const re = await waitFor(P[0], "(function(){var s=VB.NetLobby._state();return s.view==='room'&&s.role==='host'})()", 10000);
    const was = await emuGet('rooms/uidAnfi');
    await P[0].send('Page.navigate', { url: 'about:blank' });
    await sleep(1500);
    check('el anfitrión cierra la pestaña en su sala de espera: la sala desaparece al momento (no se queda en la lista)', re && was === 200 && (await emuGet('rooms/uidAnfi')) === 404, [re, was]);
  }
  check('consola sin errores', !P[0].errors.length && !P[1].errors.length, [P[0].errors.slice(0, 3), P[1].errors.slice(0, 3)]);
  for (const p of P) p.close();
  cleanup(); killJava();
  console.log('\n' + oks + ' ok, ' + fails + ' fallos (' + ((Date.now() - t0) / 1000).toFixed(0) + ' s)');
  process.exit(fails ? 1 : 0);
})().catch(e => { console.error(e); cleanup(); killJava(); process.exit(1); });

/* ======================= --guion: partido completo de la fase 3 (BroadcastChannel, dos páginas, bots) =======================
 * node tools/netdrive.js --guion [lag=80]  (~10-14 min): pabellón (Palau), mejor de 3 a 11, anfitrión con la gorra «MTC» y camiseta roja
 * (&netcap=1&kitshirt=e0383e), invitado con un bot flojo. Guion: equipaciones y looks del rival, tiempo muerto pedido (no existe: decisión
 * 5), challenge del invitado, página del invitado oculta (su jugador a la IA; la sesión sigue con el Worker) y de vuelta, corte de red de
 * 14 s con «Seguir contra la IA» del anfitrión y vuelta (resync), pausa de 10 s entre sets saltada por los dos («Continuar»), final con
 * la hoja (revancha, récord online y la gorra nueva), revancha pactada y abandono (= derrota). Capturas tools/out/net3-*.png. */
if (GUION) (async () => {
  const t0 = Date.now();
  setTimeout(() => { console.error('TIEMPO AGOTADO (guion)'); process.exit(2); }, 40 * 60 * 1000).unref();
  prof = fs.mkdtempSync(path.join(os.tmpdir(), 'vb3g-'));
  chrome = CH.launch(prof, 0, W + ',' + (H + 160), ['--disable-background-timer-throttling', '--disable-renderer-backgrounding', '--disable-backgrounding-occluded-windows']);
  let port = 0;
  for (let i = 0; i < 75 && !port; i++) { await sleep(200); try { port = +fs.readFileSync(path.join(prof, 'DevToolsActivePort'), 'utf8').trim().split(/\s+/)[0] || 0; } catch (e) { } }
  if (!port) throw new Error('Chrome no arranca');
  const base = 'http://127.0.0.1:' + port;
  let list = [];
  for (let i = 0; i < 25 && !list.length; i++) { await sleep(200); try { list = (await (await fetch(base + '/json/list')).json()).filter(t => t.type === 'page'); } catch (e) { } }
  await fetch(base + '/json/new?about:blank', { method: 'PUT' });
  await sleep(400);
  list = (await (await fetch(base + '/json/list')).json()).filter(t => t.type === 'page');
  const P = [page(list[0].webSocketDebuggerUrl, 'anfitrión'), page(list[1].webSocketDebuggerUrl, 'invitado')];
  if (process.env.NDLOG) process.on('exit', () => { for (const p of P) for (const l of p.logs) if ((process.env.NDLOG === '2' ? /\[netlog\]|\[VB\]/ : /\[netlog\]/).test(l)) console.log(p.tag + ' ' + l.slice(0, 400)); });   // (NDLOG=1: el informe de red, js/netlog.js con &netlog=1)
  P[0].tid = list[0].id; P[1].tid = list[1].id;
  const room = 'g3' + Date.now().toString(36);
  const ev = async (p, x) => { try { return await p.evalJs(x); } catch (e) { return null; } };
  const waitFor = async (p, x, ms, step) => { const end = Date.now() + ms; while (Date.now() < end) { if (await ev(p, x)) return true; await sleep(step || 200); } return false; };
  const J = async (p, x) => { const v = await ev(p, 'JSON.stringify(' + x + ')'); try { return JSON.parse(v); } catch (e) { return null; } };
  for (let k = 0; k < 2; k++) {
    const p = P[k]; await p.ready;
    await p.send('Runtime.enable'); await p.send('Page.enable');
    await p.send('Emulation.setDeviceMetricsOverride', { width: W, height: H, deviceScaleFactor: 1, mobile: false });
    await p.send('Emulation.setFocusEmulationEnabled', { enabled: true }).catch(() => { });
    const q = 'net=bc&slot=' + k + '&room=' + room + '&lag=' + LAG + '&jit=15&loss=3&bot=1&netrec=1&bo=3&points=11&name=' + (k ? 'Invi' : 'Anfi') +
      (k ? '&botprof=flojo' : '&map=palau&netcap=1&kitshirt=e0383e') + (EXTRA ? '&' + EXTRA : '');
    await p.send('Page.navigate', { url: CH.pageUrl(ROOT, q) });
  }
  const both = await Promise.all(P.map(p => waitFor(p, "!!(window.VB&&VB.ctx&&VB.ctx.net&&VB.ctx.net.r&&VB.ctx.net.r.status==='playing'&&VB.ctx.net.view)", 60000)));
  check('las dos páginas juegan (pabellón, mejor de 3 a 11)', both[0] && both[1]);
  if (!(both[0] && both[1])) { for (const p of P) console.log(p.tag, p.errors.slice(0, 5), p.logs.slice(-8)); cleanup(); process.exit(1); }
  // ayudantes en página: estado, eventos confirmados y huellas; el bot no pulsa «Continuar» cerca del final de un set (pausa entre sets)
  const HOOK = "(function(){if(window.__g3)return;var G=window.__g3={ev:[],H:{},noSkip:false};" +
    "setInterval(function(){var n=VB.ctx.net;if(!n||!n.sess)return;var s=n.sess;if(s.__g3)return;s.__g3=1;var o=s._hashTick;s._hashTick=function(){o.call(this);G.H[this.epoch+':'+this.gcTick]=this.myHash[this.gcTick];};" +
    "var a=s.advance;s.advance=function(now,inp){var r=a.call(this,now,inp);for(var i=0;i<r.confirmed.length;i++){var e=r.confirmed[i];if(G.ev.length<4000)G.ev.push({t:e.type,team:e.team,ep:this.epoch});}return r;};},50);" +
    "setInterval(function(){var n=VB.ctx.net;if(!n||!ctx0())return;var b=VB.ctx.netBot;if(b&&!b.__g3){var w=function(g){var i=b(g);if(i&&G.noSkip)i.skip=false;return i;};w.__g3=1;VB.ctx.netBot=w;}" +
    "var gc=n.sess.confirmedGame();if(gc&&!G.manual)G.noSkip=!!(gc.pendingSet||Math.max(gc.score[0],gc.score[1])>=(gc.target||11)-1);},50);function ctx0(){return VB.ctx&&VB.ctx.net&&VB.ctx.net.sess}})()";
  for (const p of P) await ev(p, HOOK);
  const ST = "(function(){var n=VB.ctx.net;if(!n)return{none:1,st:VB.ctx.state};var s=n.sess,r=n.r||{},gc=s.confirmedGame(),v=n.view,h=document.getElementById('netHud');" +
    "return{st:VB.ctx.state,ns:r.status,ep:n.epoch,seed:s.opts&&s.opts.seed,mode:gc&&gc.mode,pend:gc&&gc.pendingSet,sk:gc&&gc.skipReq,sets:gc&&gc.sets,score:gc&&gc.score,setNo:gc&&gc.setNo," +
    "chal:gc&&gc.challenges,tmo:gc&&!!gc.tmo,tmoLeft:gc&&gc.tmoLeft,ai:gc&&[gc.hum[0].ai,gc.hum[1].ai],solo:s.solo,resyncs:s.stats.resyncs,mism:s.mismatches,valid:s.valid,res:s.result," +
    "hud:h&&!h.hidden?h.textContent:'',bg:n.bgTicks|0,away:!!n.away0,vis:document.visibilityState,rival:s.rivalName}})()";
  const S = p => J(p, ST);
  const hashCmp = async (ep) => {
    const a = await J(P[0], 'window.__g3.H'), b = await J(P[1], 'window.__g3.H'); let n = 0, bad = 0;
    for (const t in a) if ((ep == null || t.indexOf(ep + ':') === 0) && b[t] !== undefined) { n++; if (a[t] !== b[t]) bad++; }
    return { n, bad };
  };
  // ---- equipaciones y looks del rival ----
  await sleep(2500);
  const LK = "(function(){var g=VB.ctx.game,P=VB.Players,L=function(p){var l=P._look(p);return l?l.acc:null},T=function(p){var r=P.rigOf(p);return r&&r.tc?r.tc.base:null};" +
    "return{me0:L(g.teams[0][0]),rv0:L(g.teams[1][0]),meK:T(g.teams[0][0]),rvK:T(g.teams[1][0]),names:[document.getElementById('sbName0').textContent,document.getElementById('sbName1').textContent]}})()";
  const la = await J(P[0], LK), lb = await J(P[1], LK);
  check('looks: el anfitrión lleva su gorra «MTC» y el invitado la ve en su rival (n.º 1 del equipo de enfrente)', la && lb && la.me0 === 'gorraMTC' && lb.rv0 === 'gorraMTC' && lb.me0 !== 'gorraMTC', { anf: la, inv: lb });
  check('equipaciones iguales en las dos pantallas (cada uno ve la suya y la del otro igual que el otro)', la && lb && la.meK === lb.rvK && la.rvK === lb.meK && la.meK !== la.rvK, { anf: [la && la.meK, la && la.rvK], inv: [lb && lb.meK, lb && lb.rvK] });
  check('marcador con el nombre del rival (TÚ / ANF, TÚ / INV), nunca «CPU»', la && lb && la.names[0] === 'TÚ' && la.names[1] === 'INV' && lb.names[1] === 'ANF', { anf: la && la.names, inv: lb && lb.names });
  // ---- tiempo muerto: no existe en el online (decisión 5: sin pausa durante el juego) ----
  await ev(P[0], "VB.ctx.net.sess.request('tmo')");
  await sleep(4000);
  const tmA = await S(P[0]), tmB = await S(P[1]);
  const tmEv = (await J(P[0], "window.__g3.ev.filter(function(e){return /^timeout/.test(e.t)}).length")) | 0;
  check('tiempo muerto pedido: no hay pausa (sin tiempos muertos en el online)', tmA && !tmA.tmo && !tmB.tmo && tmA.tmoLeft.join() === '0,0' && tmEv === 0 && tmA.ns === 'playing', { tmo: [tmA && tmA.tmo, tmB && tmB.tmo], left: tmA && tmA.tmoLeft, ev: tmEv });
  // ---- challenge del invitado en cuanto tenga ventana ----
  await ev(P[1], "window.__g3.chal=0;window.__g3.ci=setInterval(function(){var n=VB.ctx.net,gc=n&&n.sess.confirmedGame();if(!gc||window.__g3.chal)return;if(VB.Sim.canChallenge(gc,1)>0){window.__g3.chal={c:gc.challenges[1],t:performance.now()};n.sess.request('chal');}},30)");
  const gotWin = await waitFor(P[1], 'window.__g3.chal', 120000, 300);
  let chalOk = false, chalInfo = null;
  if (gotWin) {
    const c0 = await J(P[1], 'window.__g3.chal');
    chalOk = await waitFor(P[0], "window.__g3.ev.some(function(e){return e.t==='challenge'||e.t==='review'||e.t==='reviewStart'})||VB.ctx.net.sess.confirmedGame().challenges[1]<" + c0.c + "||!!VB.ctx.net.sess.confirmedGame().review", 4000, 100);
    chalInfo = { antes: c0.c, anf: (await S(P[0])).chal, inv: (await S(P[1])).chal, ev: await J(P[0], "window.__g3.ev.filter(function(e){return /chal|review/i.test(e.t)}).map(function(e){return e.t+':'+e.team})") };
    await ev(P[1], 'clearInterval(window.__g3.ci)');
  }
  check('challenge del invitado: llega al anfitrión y hay revisión en las dos partidas (si se acierta no se gasta)', gotWin && chalOk, chalInfo);
  // ---- página del invitado oculta: su jugador a la IA, la sesión sigue (Worker) y el anfitrión no espera ----
  let realHide = false;
  try {
    const w = await P[1].send('Browser.getWindowForTarget', { targetId: P[1].tid });
    await P[1].send('Browser.setWindowBounds', { windowId: w.windowId, bounds: { windowState: 'minimized' } });
    realHide = await waitFor(P[1], "document.visibilityState==='hidden'", 3000);
    P[1].win = w.windowId;
    // (Chrome headless minimiza la ventana sin pasar la página a oculta, pero deja de pintarla: se restaura y se emula)
    if (!realHide) { await P[1].send('Browser.setWindowBounds', { windowId: w.windowId, bounds: { windowState: 'normal' } }).catch(() => { }); await sleep(500); }
  } catch (e) { realHide = false; }
  if (!realHide) {   // (sin minimizar de verdad: se emula — visibilidad oculta y sin requestAnimationFrame, como una pestaña de fondo)
    await ev(P[1], "(function(){var raf=window.requestAnimationFrame;window.__g3.raf=raf;window.__g3.held=[];window.requestAnimationFrame=function(f){window.__g3.held.push(f);return 0};" +
      "Object.defineProperty(document,'visibilityState',{configurable:true,get:function(){return 'hidden'}});Object.defineProperty(document,'hidden',{configurable:true,get:function(){return true}});document.dispatchEvent(new Event('visibilitychange'))})()");
  }
  const wait0 = (await J(P[0], 'VB.ctx.net.sess.stats.waits')) | 0;
  await sleep(6000);
  const hA = await S(P[0]), hB = await S(P[1]);
  const wait1 = (await J(P[0], 'VB.ctx.net.sess.stats.waits')) | 0;
  check('página del invitado oculta (' + (realHide ? 'minimizada' : 'emulada') + '): su jugador lo lleva la IA en las dos partidas y la sesión sigue con el Worker', hA && hB && hA.ai[1] === true && hB.ai[1] === true && hB.bg > 100 && hB.away, { ai: [hA && hA.ai, hB && hB.ai], bgTicks: hB && hB.bg, vis: hB && hB.vis });
  check('el anfitrión sigue jugando sin esperar', hA && hA.ns === 'playing' && wait1 - wait0 <= 1, { st: hA && hA.ns, esperas: wait1 - wait0 });
  if (realHide) { await P[1].send('Browser.setWindowBounds', { windowId: P[1].win, bounds: { windowState: 'normal' } }).catch(() => { }); await waitFor(P[1], "document.visibilityState==='visible'", 3000); }
  else await ev(P[1], "(function(){delete document.visibilityState;delete document.hidden;window.requestAnimationFrame=window.__g3.raf;var h=window.__g3.held;window.__g3.held=[];document.dispatchEvent(new Event('visibilitychange'));h.forEach(function(f){window.requestAnimationFrame(f)})})()");
  const back = await waitFor(P[0], "!VB.ctx.net.sess.confirmedGame().hum[1].ai", 30000, 300) && await waitFor(P[1], "!VB.ctx.net.sess.confirmedGame().hum[1].ai&&!VB.ctx.net.away0", 5000);
  check('al volver a la página, el invitado recupera su jugador en el siguiente balón muerto', back, await S(P[1]));
  // ---- corte de red de 14 s: a los 10 s el anfitrión elige «Seguir contra la IA»; vuelve la red → resync, el mismo partido ----
  const rs0 = (await S(P[0])).resyncs;
  await Promise.all(P.map(p => ev(p, 'VB.ctx.net.link.down(14000)')));
  const offer = await waitFor(P[0], "!!document.querySelector('#netHud button[data-n=ai]')", 16000, 200);
  const hudW = (await S(P[0])).hud;
  if (offer) await ev(P[0], "document.querySelector('#netHud button[data-n=ai]').click()");
  const solo = await waitFor(P[0], 'VB.ctx.net.sess.solo', 2000);
  console.log('  captura', await P[0].shot(path.join(OUT, 'net3-anfitrion-contra-ia.png')));
  const resync = await waitFor(P[0], "VB.ctx.net.sess.stats.resyncs>" + rs0 + "&&!VB.ctx.net.sess.solo", 20000, 300) && await waitFor(P[1], "VB.ctx.net.r.status==='playing'", 5000);
  check('corte de 14 s: a los 10 s «Esperando a Invi…» con «Seguir contra la IA»; el anfitrión la elige', offer && solo && /Esperando a Invi/.test(hudW), hudW);
  check('vuelve la red: resync, el invitado recupera su jugador y siguen en el mismo partido', resync, { anf: await S(P[0]), inv: await S(P[1]) });
  // (revisión F3) la espera avisa: cuenta atrás de los 60 s y «Abandonar (cuenta como derrota)»; el ping tras volver la red no se infla
  check('la espera dice «Si no vuelve en N s, ganas tú» y el botón «Abandonar (cuenta como derrota)»', /Si no vuelve en \d+ s, ganas tú/.test(hudW) && /Abandonar \(cuenta como derrota\)/.test(hudW), hudW);
  let pingMax = 0, pingN = 0;
  for (let k = 0; k < 12; k++) { for (const p of P) { const q = await J(p, "VB.ctx.net&&VB.ctx.net.r&&VB.ctx.net.r.status==='playing'?VB.ctx.net.r.ping:-1"); if (q >= 0) { pingMax = Math.max(pingMax, q); pingN++; } } await sleep(250); }
  check('ping del HUD justo después de volver la red: por debajo de 200 ms (sin los pongs de antes del corte)', pingN > 0 && pingMax < 200, { pingMax, pingN });
  // ---- pausa entre sets (10 s): el invitado pulsa «Continuar» en el HUD; el anfitrión todavía no → sigue; pulsa → se salta ----
  console.log('  jugando hasta el final del primer set…');
  const pend = await waitFor(P[0], "VB.ctx.net.sess.confirmedGame().pendingSet&&VB.ctx.net.sess.confirmedGame().mode==='point'", 900000, 250) &&
    await waitFor(P[1], "VB.ctx.net.sess.confirmedGame().pendingSet", 5000, 100);
  let skipOk = false, skipInfo = null;
  if (pend) {
    for (const p of P) await ev(p, 'window.__g3.manual=true;window.__g3.noSkip=true');
    const tp = Date.now();
    await waitFor(P[1], "!!document.querySelector('#netHud button[data-n=skip]')", 3000, 100);
    console.log('  captura', await P[1].shot(path.join(OUT, 'net3-invitado-pausa-set.png')));
    await ev(P[1], "document.querySelector('#netHud button[data-n=skip]').click()");
    await sleep(2500);
    const mid = await S(P[0]), hudA = mid && mid.hud;
    console.log('  captura', await P[0].shot(path.join(OUT, 'net3-anfitrion-pausa-set.png')));
    await ev(P[0], "VB.ctx.actions.netSkip()");
    const gone = await waitFor(P[0], "!VB.ctx.net.sess.confirmedGame().pendingSet", 3000, 50) && await waitFor(P[1], "!VB.ctx.net.sess.confirmedGame().pendingSet", 2000, 50);
    const dt = (Date.now() - tp) / 1000, aft = await S(P[0]);
    skipOk = mid && mid.pend && gone && dt < 8.5 && aft.setNo === 2;
    skipInfo = { trasUno: mid && mid.pend, hud: hudA, saltada: gone, s: +dt.toFixed(1), set: aft.setNo, sets: aft.sets };
    for (const p of P) await ev(p, 'window.__g3.manual=false');
  }
  check('pausa de 10 s entre sets: con un «Continuar» sigue («Invi ya quiere seguir»); con los dos se salta', skipOk && /ya quiere seguir/.test(skipInfo.hud), skipInfo);
  // ---- hasta el final del partido: hoja final con «Revancha», récord online y la gorra ----
  console.log('  jugando hasta el final del partido…');
  const endOk = await waitFor(P[0], "VB.ctx.state==='over'", 1500000, 500) && await waitFor(P[1], "VB.ctx.state==='over'", 10000, 200);
  const hs = await hashCmp(0);
  check('partido entero: huellas iguales en los dos lados', hs.n > 100 && hs.bad === 0, hs);
  check('final del partido en las dos páginas', endOk, { anf: await S(P[0]), inv: await S(P[1]) });
  await sleep(3500);
  const END = "(function(){var e=document.getElementById('end'),a=document.getElementById('btnAgain'),m=document.getElementById('btnMenu'),n=VB.ctx.net;return{on:!!e&&!e.hidden,again:a&&a.textContent,act:a&&a.getAttribute('data-act'),menu:m&&!m.hidden?m.textContent:'',sum:(document.getElementById('endSum')||{}).textContent||'',rec:n&&n.recRes&&{cap:n.recRes.cap,w:n.recRes.entry.w,s:n.recRes.entry.s},res:n&&n.sess.result,stored:VB.NetRec.get(),cap:VB.Look.owned('gorraMTC')}})()";
  const eA = await J(P[0], END), eB = await J(P[1], END);
  check('hoja final online: «Revancha» y «Volver al menú»', eA && eB && eA.on && eB.on && eA.again === 'Revancha' && eB.act === 'rematch' && eA.menu === 'Volver al menú', { anf: eA && [eA.again, eA.menu], inv: eB && [eB.again, eB.menu] });
  // (las dos páginas comparten localStorage pero cada una en su proceso: dos escrituras casi a la vez pueden pisarse; se mira lo que apuntó cada una)
  check('récord online: cada lado apunta su resultado (uno ganado y otro perdido, con los sets)', eA && eB && eA.rec && eB.rec && eA.rec.w + eB.rec.w === 1 && eA.rec.w >= 0 && eB.rec.w >= 0 && /^\d-\d$/.test(eA.rec.s), { anf: eA && eA.rec, inv: eB && eB.rec, guardado: eB && eB.stored });
  check('la gorra «Online Beta Tester» se desbloquea al terminar el primer partido online (y sale en el resumen)', eA && eB && eB.cap && (eA.rec.cap || eB.rec.cap) && /Online Beta Tester/.test(eA.rec.cap ? eA.sum : eB.sum), { capA: eA && eA.rec.cap, capB: eB && eB.rec.cap });
  check('el resumen enseña tu récord online', eA && /Tu récord online/.test(eA.sum));
  for (let k = 0; k < 2; k++) console.log('  captura', await P[k].shot(path.join(OUT, 'net3-' + (k ? 'invitado' : 'anfitrion') + '-fin.png')));
  // ---- revancha pactada ----
  const seed0 = (await S(P[0])).seed;
  await ev(P[1], "document.getElementById('btnAgain').click()");
  await sleep(800);
  const rA = await J(P[0], "document.getElementById('btnAgain').textContent"), rB = await J(P[1], "document.getElementById('btnAgain').textContent+'|'+document.getElementById('btnAgain').disabled");
  check('revancha pedida por el invitado: «Esperando a Anfi…»; al anfitrión le sale «¡Revancha! (Invi quiere)»', /Esperando a Anfi/.test(rB) && /Invi quiere/.test(rA), [rA, rB]);
  await ev(P[0], "document.getElementById('btnAgain').click()");
  const re = await Promise.all(P.map(p => waitFor(p, "VB.ctx.state==='playing'&&VB.ctx.net&&VB.ctx.net.epoch===1&&VB.ctx.net.r&&VB.ctx.net.r.status==='playing'", 20000, 200)));
  const rsA = await S(P[0]), rsB = await S(P[1]);
  check('revancha: los dos en un partido nuevo (época 1, otra semilla, mismos nombres, marcador a cero)', re[0] && re[1] && rsA.seed !== seed0 && rsB.seed === rsA.seed && rsA.rival === 'Invi' && rsB.rival === 'Anfi' && rsA.sets.join() === '0,0', { anf: rsA, inv: rsB });
  await sleep(15000);
  const hs1 = await hashCmp(1);
  check('revancha: huellas iguales y sin reparaciones', hs1.n >= 10 && hs1.bad === 0 && !rsA.mism, hs1);
  // flechita con el nombre del rival encima de su jugador
  const tag = await J(P[1], "(function(){var e=document.getElementById('netTag');return e&&!e.hidden?{t:e.textContent,x:parseFloat(e.style.left),y:parseFloat(e.style.top)}:null})()");
  check('flechita con el nombre del rival encima de su jugador (sin IP)', tag && /Anfi/.test(tag.t) && /▼/.test(tag.t) && !/\d+\.\d+\.\d+\.\d+/.test(tag.t), tag);
  for (let k = 0; k < 2; k++) console.log('  captura', await P[k].shot(path.join(OUT, 'net3-' + (k ? 'invitado' : 'anfitrion') + '-revancha.png')));
  // ---- abandono en la revancha: el invitado se va → derrota en su récord; el anfitrión gana ----
  const r0 = await J(P[1], 'VB.NetRec.get()');
  await ev(P[1], 'VB.ctx.actions.pause()');
  await waitFor(P[1], "!!document.querySelector('#netHud button[data-n=quit]')", 2000);
  await ev(P[1], "document.querySelector('#netHud button[data-n=quit]').click()");
  const rq = await waitFor(P[0], "VB.ctx.net&&VB.ctx.net.r.status==='ended'&&VB.ctx.net.r.result.why==='rivalQuit'", 8000);
  // (auditoría, como en --rtc) quien abandona ve «Has abandonado [Volver al menú]»; Esc (o el botón) sale al menú
  const hqI = await waitFor(P[1], "(function(){var h=document.getElementById('netHud');return !!(h&&!h.hidden&&/Has abandonado/.test(h.textContent)&&h.querySelector('button[data-n=menu]'))})()", 5000);
  check('abandono: el invitado ve «Has abandonado [Volver al menú]»', hqI, await ev(P[1], "(function(){var h=document.getElementById('netHud');return h?h.textContent:''})()"));
  await ev(P[1], 'VB.ctx.actions.pause()');
  const mq = await waitFor(P[1], "VB.ctx.state==='menu'&&!VB.ctx.net", 5000);
  await sleep(500);
  const r1 = await J(P[1], 'VB.NetRec.get()'), hq = (await S(P[0])).hud;
  check('abandono: … Esc le lleva al menú y cuenta como derrota (abandono); al anfitrión, victoria', rq && mq && r1.played === r0.played + 2 && r1.quits === r0.quits + 1 && r1.wins === r0.wins + 1 && /ha abandonado: ganas tú/.test(hq), { menu: mq, antes: r0 && [r0.played, r0.wins, r0.quits], despues: r1 && [r1.played, r1.wins, r1.quits], hud: hq });
  console.log('  captura', await P[0].shot(path.join(OUT, 'net3-anfitrion-abandono.png')));
  check('consola sin errores', !P[0].errors.length && !P[1].errors.length, [P[0].errors.slice(0, 3), P[1].errors.slice(0, 3)]);
  // ---- capturas de la gorra en el Vestuario (pista y playa) ----
  for (const ven of ['hall', 'beach']) {
    await P[1].send('Page.navigate', { url: CH.pageUrl(ROOT, 'debug=look&tab=cabeza&item=gorraMTC&venue=' + ven + (EXTRA ? '&' + EXTRA : '')) });
    await sleep(1500);
    await waitFor(P[1], "!!(window.VB&&VB.ctx&&VB.ctx.state==='menu')", 30000);
    await sleep(3500);
    console.log('  captura', await P[1].shot(path.join(OUT, 'net3-gorra-' + ven + '.png')));
  }
  for (const p of P) p.close();
  cleanup();
  console.log('\n' + oks + ' ok, ' + fails + ' fallos (' + ((Date.now() - t0) / 1000).toFixed(0) + ' s)');
  process.exit(fails ? 1 : 0);
})().catch(e => { console.error(e); cleanup(); process.exit(1); });
