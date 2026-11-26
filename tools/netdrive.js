#!/usr/bin/env node
/* TAKE THE COURT — tools/netdrive.js  (owner: net)
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
 * Online de varios (--multi, P8 del sprint online-multi): ver el bloque «--multi» al final (N páginas, BcLink de pareja, norender).
 * Carrera cooperativa (--coop): bloque «--coop» al final (lobby de verdad, emulador, WebRTC, de la tarjeta de la Carrera a la XP).
 * Banderas anti-frenado de Chrome (las dos páginas a la vez): --disable-background-timer-throttling --disable-renderer-backgrounding
 * --disable-backgrounding-occluded-windows. Memoria: un solo Chrome, 800×450 por página, calidad baja por defecto.
 */
'use strict';
const fs = require('fs'), os = require('os'), path = require('path');
const CH = require('./chrome.js'), CDP = require('./cdp.js');
const ROOT = path.join(__dirname, '..'), OUT = path.join(__dirname, 'out');
const RTC = process.argv.includes('--rtc'), GUION = process.argv.includes('--guion'), MULTI = process.argv.includes('--multi'), COOPX = process.argv.includes('--coop'), ARGV = process.argv.filter(a => a !== '--rtc' && a !== '--guion' && a !== '--multi' && a !== '--coop');
const SECS = +(ARGV[2] || (RTC ? 60 : 120)), LAG = +(ARGV[3] || 80), EXTRA = ARGV[4] != null ? ARGV[4] : 'quality=low';
const FLUIDA = /(^|&)model=fluida(&|$)/.test(EXTRA);   // (Online V2: la query extra llega a las dos páginas)
// (fase 4) NDW / NDH / NDTOUCH=1: tamaño y pantalla táctil del modo básico (p. ej. NDW=844 NDH=390 NDTOUCH=1: teléfono apaisado)
const W = +(process.env.NDW || 800), H = +(process.env.NDH || 450), TOUCH = process.env.NDTOUCH === '1';
fs.mkdirSync(OUT, { recursive: true });
const sleep = ms => new Promise(r => setTimeout(r, ms));
let chrome = null, prof = null;
function cleanup() { if (chrome) { CH.kill(chrome); chrome = null; } if (prof) { CDP.rmProfile(prof); prof = null; } }
process.on('exit', cleanup); process.on('SIGINT', () => process.exit(130)); process.on('SIGTERM', () => process.exit(143));
if (!GUION && !MULTI && !COOPX) setTimeout(() => { console.error('TIEMPO AGOTADO'); process.exit(2); }, (SECS + 150) * 1000).unref();

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

if (!RTC && !GUION && !MULTI && !COOPX) (async () => {
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
  // (P8: en el móvil y en 800×450 —html.ph— la ayuda va por páginas con «Siguiente»: se recorre entera y se junta el texto)
  const helpOn = await waitFor(P[0], "!!document.querySelector('#mpOnline [data-a=helpOk],#mpOnline [data-a=helpNext]')", 15000);
  let helpTxt = '';
  if (helpOn) console.log('  captura', await P[0].shot(path.join(OUT, 'netrtc-ayuda.png')));
  for (let k = 0; k < 2; k++) for (let i = 0; i < 12; i++) {
    const t = await ev(P[k], "(function(){var e=document.querySelector('#mpOnline .ol-help,#mpOnline .ol-hpp');var x=e?e.textContent:'';var b=document.querySelector('#mpOnline [data-a=helpNext]');if(b){b.click();return x;}var o=document.querySelector('#mpOnline [data-a=helpOk]');if(o)o.click();return '\u0001'+x;})()");
    if (k === 0) helpTxt += String(t || '').replace('\u0001', ' ');
    if (!t || String(t).charAt(0) === '\u0001') break;
    await sleep(150);
  }
  check('primera vez en Online: «Cómo funciona» (1 contra 1, sin pausa, 10 s entre sets, abandonar = derrota, la gorra)', helpOn && /n.º 1/.test(helpTxt) && /10 s/.test(helpTxt) && /derrota/.test(helpTxt) && /Estuve en la beta/.test(helpTxt), helpTxt.slice(0, 80));
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
  // (P8) NDRTCMODEL=fluida: la fila «Conexión» en Fluida (Online V2); el partido se mide aparte (bloque de abajo) y se acaba ahí
  const RFL = process.env.NDRTCMODEL === 'fluida';
  if (RFL) await ev(P[0], "(function(){var b=document.querySelector('#mpOnline [data-ol=net]');if(b&&!/Fluida/.test(b.textContent))b.click();})()");
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
  if (RFL) {   // Fluida por WebRTC de verdad (con el Shaper de netrtc.js si la query lo pide): juega SECS s con bots y mide
    check('las dos sesiones son Fluida', (await ev(P[0], 'VB.ctx.net.model')) === 'fluida' && (await ev(P[1], 'VB.ctx.net.model')) === 'fluida');
    for (let k = 0; k < 2; k++) await ev(P[k], "VB.ctx.netBot=VB.Net.bot(" + k + "," + (k + 1) + ",'bueno');(function(){var s=VB.ctx.net.sess,W=window.__nd={wait:0,frames:0,seq:[]};var a=s.advance;s.advance=function(now,inp){var r=a.call(this,now,inp);W.frames++;if(r.status==='waiting'&&r.waitMs>300)W.wait++;var g=this.confirmedGame(),k=g?(g.sets||[]).join('-')+'|'+(g.score||[]).join('-'):'';if(k&&W.seq[W.seq.length-1]!==k)W.seq.push(k);return r;};})()");
    await sleep(SECS * 1000);
    const F = []; for (const p of P) F.push(JSON.parse(await ev(p, "JSON.stringify({w:window.__nd.wait,f:window.__nd.frames,seq:window.__nd.seq,hud:(document.getElementById('netHud')||{}).textContent||''})") || 'null'));
    const sa = F[0].seq, sb = F[1].seq, m = Math.min(sa.length, sb.length); let pre = true; for (let i = 0; i < m; i++) if (sa[i] !== sb[i]) { pre = false; break; }
    check('Fluida por WebRTC: los dos marcadores pasan por los mismos resultados', pre && m >= 3 && Math.abs(sa.length - sb.length) <= 1, { anf: sa, inv: sb, vista: [await ev(P[0], "JSON.stringify(VB.ctx.net.view.score)"), await ev(P[0], "VB.ctx.net.r.status"), await ev(P[0], "typeof VB.ctx.netBot")] });
    check('Fluida por WebRTC: sin esperas de más de 0,3 s', F[0].w === 0 && F[1].w === 0, [F[0].w, F[1].w, F[0].hud, F[1].hud]);
    check('consola sin errores', !P[0].errors.length && !P[1].errors.length, [P[0].errors.slice(0, 3), P[1].errors.slice(0, 3)]);
    for (const p of P) p.close();
    cleanup(); killJava();
    console.log('\n' + oks + ' ok, ' + fails + ' fallos (' + ((Date.now() - t0) / 1000).toFixed(0) + ' s)');
    process.exit(fails ? 1 : 0);
  }
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
  check('la gorra «Estuve en la beta» se desbloquea al terminar el primer partido online (y sale en el resumen)', eA && eB && eB.cap && (eA.rec.cap || eB.rec.cap) && /Estuve en la beta/.test(eA.rec.cap ? eA.sum : eB.sum), { capA: eA && eA.rec.cap, capB: eB && eB.rec.cap });
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

/* ======================= --multi: online de varios con N páginas (P8 del sprint online-multi) =======================
 * node tools/netdrive.js --multi [n=4] [segundos=90] [lag=80] [query extra="quality=low"]
 *   N páginas del juego real en UN Chrome (?net=bc&n=N&slot=k, main.js startNetTestN): estrella con el anfitrión (página 0) de centro,
 *   un BcLink de pareja por invitado (canal y Shaper propios: lag = RTT de cada invitado con el anfitrión, ±15 ms, 2 % de pérdida en
 *   'in'), un bot por página. Variables:
 *     NDFMT=2v2|6v6 (por defecto 6v6 si n > 4) · NDMODEL=precisa|host (6v6: host) · NDCOOP=1 (todos en el equipo 0: Carrera coop sin
 *     la Carrera) · NDRENDER=k (las k primeras páginas pintan; el resto con &norender=1; por defecto 2) · NDCPU=4 (frena la CPU de una
 *     página, Emulation.setCPUThrottlingRate, como un móvil) y NDCPUPAGE=i (cuál; por defecto la 1) · NDLAGS=a,b,c (RTT por invitado) ·
 *     NDPOINTS=n (puntos del set; 1 set) · NDEND=1 (juega hasta el final aunque pase de los segundos, máx. 15 min) · NDJSON=fichero ·
 *     NDRTC=1: en vez de BroadcastChannel, por el LOBBY de verdad (sala de varios v3 en el emulador de Firestore: crear con «Formato»,
 *     entrar, sentarse, «Listo», «Empezar») y WebRTC local con el Shaper de netrtc.js (?netlag=&netjit=&netloss=).
 *     NDRELOAD=1 (o =k, la página; por defecto la 1) (lane A): a los NDRELOADAT s (20) de juego esa página de INVITADO se RECARGA en
 *     pleno partido y tiene que volver sola a su plaza. Con NDRTC=1 por el lobby de verdad (marca BACK en sessionStorage, hoja «Volviendo
 *     a la partida…», la siguiente oferta del anfitrión, sesión nueva sin opciones); sin él, la página de BcLink vuelve con &back=1
 *     (main.js startNetTestN: sesión nueva al momento). Comprueba: vuelve a 'playing', el anfitrión le devuelve su plaza (deja de
 *     llevarla la IA), huellas iguales después (Precisa-N) o los mismos puntos (modelo host), y mide cuánto tarda.
 *     NDHOST=away (lane A): a los NDRELOADAT s la página del ANFITRIÓN se oculta y se congela 15 s (Page.setWebLifecycleState, como un
 *     móvil en segundo plano): los invitados esperan con «X ha salido un momento de la app…» y, al volver, todos siguen jugando.
 *     NDJIT=ms / NDLOSS=% (estrés: jitter y pérdida de cada BcLink; por defecto 15 y 2) · NDBURST=1 (estrés: cortes de 300 ms cada
 *     8-12 s en cada enlace invitado ↔ anfitrión, solo BcLink).
 *     NDHOST=reload (con NDRTC=1): el anfitrión recarga en pleno partido: los invitados acaban en el acto con «X se ha ido: el partido
 *     no cuenta» (sin esperar 60 s) y la prueba termina ahí.
 *   Mide por página: frames en «waiting» (congelaciones de la sesión), «inestable», parones de frame (rAF > 100 ms), rollback (máx. y
 *   p95, Precisa-N), saltos del balón pintado (posición contra la extrapolada del frame anterior, > 0,6 m), coste de la sesión por
 *   frame y fps. Comprueba: todas juegan, huellas iguales (Precisa-N) o la misma secuencia de puntos (modelo host), cada una lleva a SU
 *   jugador (g.hum[plaza]) y lo ve en su equipo 0, final del partido en TODAS (estado 'over'), consola sin errores.
 *   Capturas tools/out/multi-*.png. Una prueba cada vez y con el PC en reposo (las congelaciones dependen de la carga). */
if (MULTI) (async () => {
  const t0 = Date.now();
  const N = Math.max(2, Math.min(12, +(ARGV[2] || 4))), MSECS = +(ARGV[3] || 90), MLAG = +(ARGV[4] || 80), MEXTRA = ARGV[5] != null ? ARGV[5] : 'quality=low';
  const FMT = process.env.NDFMT || (N > 4 ? '6v6' : '2v2'), MODEL = process.env.NDMODEL || (FMT === '6v6' ? 'host' : 'precisa'), COOP = process.env.NDCOOP === '1';
  const NREND = Math.max(0, Math.min(N, process.env.NDRENDER != null ? +process.env.NDRENDER : 2)), CPU = +process.env.NDCPU || 0, CPUPAGE = process.env.NDCPUPAGE != null ? +process.env.NDCPUPAGE : 1;
  const ENDALL = process.env.NDEND === '1', PTS = +process.env.NDPOINTS || 0;
  setTimeout(() => { console.error('TIEMPO AGOTADO (multi)'); process.exit(2); }, ((ENDALL ? 900 : MSECS) + 240) * 1000).unref();
  console.log('  ' + N + ' páginas · ' + FMT + (COOP ? ' coop' : '') + ' · modelo ' + MODEL + ' · RTT ' + (process.env.NDLAGS || MLAG) + ' ms · ' + NREND + ' pintan' + (CPU ? ' · CPU ×' + CPU + ' en la página ' + CPUPAGE : ''));
  prof = fs.mkdtempSync(path.join(os.tmpdir(), 'vb3m-'));
  chrome = CH.launch(prof, 0, W + ',' + (H + 160), ['--disable-background-timer-throttling', '--disable-renderer-backgrounding', '--disable-backgrounding-occluded-windows']);
  let port = 0;
  for (let i = 0; i < 75 && !port; i++) { await sleep(200); try { port = +fs.readFileSync(path.join(prof, 'DevToolsActivePort'), 'utf8').trim().split(/\s+/)[0] || 0; } catch (e) { } }
  if (!port) throw new Error('Chrome no arranca');
  const base = 'http://127.0.0.1:' + port;
  let list = [];
  for (let i = 0; i < 25 && !list.length; i++) { await sleep(200); try { list = (await (await fetch(base + '/json/list')).json()).filter(t => t.type === 'page'); } catch (e) { } }
  for (let k = 1; k < N; k++) { await fetch(base + '/json/new?about:blank', { method: 'PUT' }); await sleep(150); }
  await sleep(400);
  list = (await (await fetch(base + '/json/list')).json()).filter(t => t.type === 'page');
  if (list.length < N) throw new Error('solo ' + list.length + ' páginas');
  const P = list.slice(0, N).map((t, k) => page(t.webSocketDebuggerUrl, k ? 'inv' + k : 'anf'));
  if (process.env.NDLOG) process.on('exit', () => { for (const p of P) for (const l of p.logs) if (/\[VB\]/.test(l)) console.log(p.tag + ' ' + l.slice(0, 300)); });
  const room = 'mx' + Date.now().toString(36);
  const ev = (p, js) => p.evalJs(js).catch(e => { if (process.env.NDLOG) console.log('  (eval ' + p.tag + ': ' + e.message.slice(0, 160) + ')'); return null; });
  const J = async (p, js) => { const v = await ev(p, 'JSON.stringify(' + js + ')'); try { return JSON.parse(v); } catch (e) { return null; } };
  const MRTC = process.env.NDRTC === '1';
  if (MRTC && !(await startEmu())) { console.log('Sin emulador de Firestore (Java + jar).'); cleanup(); process.exit(3); }
  for (let k = 0; k < N; k++) {
    const p = P[k], rend = k < NREND; await p.ready;
    await p.send('Runtime.enable'); await p.send('Page.enable');
    await p.send('Emulation.setDeviceMetricsOverride', { width: rend || process.env.NDNRBIG ? W : 320, height: rend || process.env.NDNRBIG ? H : 180, deviceScaleFactor: 1, mobile: TOUCH && rend });
    await p.send('Emulation.setFocusEmulationEnabled', { enabled: true }).catch(() => { });
    if (CPU > 1 && k === CPUPAGE) await p.send('Emulation.setCPUThrottlingRate', { rate: CPU });
    if (MRTC) {   // NDRTC=1: por el LOBBY de verdad (sala de varios del esquema v3 en el emulador) y WebRTC local con el Shaper de netrtc.js
      const q = 'debug=menu&online=1&netemu=' + EMU_PORT + '&netuid=uidM' + k + '&netice=none&name=' + encodeURIComponent((k ? 'Invi' + k : 'Anfi') + ' M') +
        '&netlag=' + MLAG + '&netjit=15&netloss=2' + (rend ? '' : '&norender=1') + (MEXTRA ? '&' + MEXTRA : '');
      await p.send('Page.navigate', { url: CH.pageUrl(ROOT, q) });
      continue;
    }
    const q = 'net=bc&n=' + N + '&slot=' + k + '&room=' + room + '&fmt=' + FMT + '&model=' + MODEL + (COOP ? '&coop=1' : '') + '&lag=' + MLAG + (process.env.NDLAGS ? '&lags=' + process.env.NDLAGS : '') +
      '&jit=' + (process.env.NDJIT || 15) + '&loss=' + (process.env.NDLOSS || 2) + '&bot=1&botseed=' + (k * 7 + 3) + (PTS ? '&points=' + PTS : '') + (k ? '' : '&map=' + (FMT === '6v6' ? 'palau' : '')) + (rend ? '' : (process.env.NDNRWARM ? '&norender=1' : '&norender=1&prewarm=0&warmdraw=0')) + (MEXTRA ? '&' + MEXTRA : '');
    await p.send('Page.navigate', { url: CH.pageUrl(ROOT, q) });
  }
  // NDFRONT=k: la página k pasa a ser la pestaña de delante (las demás quedan detrás: Chrome les da requestAnimationFrame a trompicones,
  // parones de ~1 s que salen también en las que no pintan; sirve para ver si un parón es del juego o de la pestaña de detrás)
  if (process.env.NDFRONT != null && P[+process.env.NDFRONT]) await P[+process.env.NDFRONT].send('Page.bringToFront').catch(() => { });
  if (MRTC) {
    const waitFor = async (p, js, ms) => { const tEnd = Date.now() + ms; while (Date.now() < tEnd) { if (await ev(p, js)) return true; await sleep(250); } return false; };
    for (const p of P) await waitFor(p, "!!(window.VB&&VB.ctx&&VB.ctx.state==='menu'&&VB.UI&&VB.NetLobby)", 40000);
    for (const p of P) await ev(p, "VB.UI.menuGo('online')");
    // «Cómo funciona» (la primera vez; las páginas comparten localStorage: puede que solo salga en alguna) y a la lista
    for (const p of P) {
      await waitFor(p, "!!document.querySelector('#mpOnline [data-a=helpOk],#mpOnline [data-a=helpNext],#mpOnline [data-a=new]')", 15000);
      for (let i = 0; i < 12; i++) { const r = await ev(p, "(function(){var b=document.querySelector('#mpOnline [data-a=helpNext]');if(b){b.click();return 1;}var o=document.querySelector('#mpOnline [data-a=helpOk]');if(o){o.click();return 2;}return 0;})()"); if (r !== 1) break; await sleep(120); }
      await waitFor(p, "!!document.querySelector('#mpOnline [data-a=new]')", 15000);
    }
    // anfitrión: «Crear sala» con el formato pedido
    await ev(P[0], "document.querySelector('#mpOnline [data-a=new]').click()");
    await waitFor(P[0], "!!document.querySelector('#mpOnline [data-ol=fmt]')", 8000);
    for (let i = 0; i < 3; i++) { const f = await ev(P[0], "VB.NetLobby._state().cfg?VB.NetLobby._state().cfg.fmt:(document.querySelector('#mpOnline [data-ol=fmt]').textContent)"); if (String(f).indexOf(FMT === '6v6' ? '6' : '2') >= 0 && !/1v1|1 contra 1/.test(String(f))) break; await ev(P[0], "document.querySelector('#mpOnline [data-ol=fmt]').click()"); await sleep(250); }
    console.log('  captura', await P[0].shot(path.join(OUT, 'multi-rtc-crear-' + FMT + '.png')));
    await ev(P[0], "document.querySelector('#mpOnline [data-a=open]').click()");
    const open = await waitFor(P[0], "(function(){var s=VB.NetLobby._state();return s.view==='room'&&s.role==='host'&&s.room&&s.room.multi})()", 12000);
    check('lobby: el anfitrión abre una sala de varios (' + FMT + ') en el emulador con las reglas v3', open, await J(P[0], 'VB.NetLobby._state()'));
    if (!open) { for (const p of P) console.log(p.tag, p.errors.slice(0, 5), p.logs.slice(-6)); cleanup(); killJava(); process.exit(1); }
    // invitados: la ven en la lista, entran, se sientan en su sitio (k) y pulsan «Listo»
    for (let k = 1; k < N; k++) {
      const p = P[k];
      await ev(p, "document.querySelector('#mpOnline [data-a=refresh]').click()");
      await waitFor(p, "!!document.querySelector('#mpOnline [data-a=join][data-id=uidM0]')", 15000);
      await ev(p, "document.querySelector('#mpOnline [data-a=join][data-id=uidM0]').click()");
    }
    const inRoom = await Promise.all(P.slice(1).map(p => waitFor(p, "(function(){var s=VB.NetLobby._state();if(s.view!=='room'||s.role!=='guest'||!s.mx)return false;for(var u in s.mx.links)if(s.mx.links[u]==='open')return true;return false})()", 45000)));
    check('lobby: los ' + (N - 1) + ' invitados entran y conectan por WebRTC con el anfitrión (estrella, ofertas en paralelo)', inRoom.every(Boolean), inRoom);
    // (de uno en uno: quien no tiene sitio toca el primero libre; luego «Listo» si no lo está; con la sala que manda el anfitrión)
    const ME = "(function(){var s=VB.NetLobby._state(),x=s.mx;if(!x||!x.ro||!x.ro.m)return null;var me=null,t={};x.ro.m.forEach(function(m){if(m.c>=0)t[m.c]=1;if(m.u===x.me)me=m;});return{c:me?me.c:-2,r:me?!!me.r:false,t:Object.keys(t).map(Number)}})()";
    for (let k = 1; k < N; k++) {
      for (let i = 0; i < 40; i++) {
        const m = await J(P[k], ME); if (!m) { await sleep(250); continue; }
        if (m.c < 0) { let f = 0; while (m.t.indexOf(f) >= 0) f++; await ev(P[k], "VB.NetLobby._act('chair'," + f + ")"); await sleep(400); continue; }
        if (!m.r) { await ev(P[k], "VB.NetLobby._act('ready')"); await sleep(400); continue; }
        break;
      }
    }
    await sleep(1500);
    console.log('  captura', await P[0].shot(path.join(OUT, 'multi-rtc-sala-' + FMT + '.png')));
    if (NREND > 1) console.log('  captura', await P[1].shot(path.join(OUT, 'multi-rtc-sala-inv-' + FMT + '.png')));
    const canGo = await waitFor(P[0], "(function(){var b=document.querySelector('#mpOnline [data-a=start]');return !!(b&&!b.disabled)})()", 20000);
    check('lobby: todos sentados y listos: «Empezar» se enciende', canGo, await J(P[0], 'VB.NetLobby._mx&&VB.NetLobby._mx()&&VB.NetLobby._mx().ro'));
    await ev(P[0], "document.querySelector('#mpOnline [data-a=start]').click()");
  }
  // contadores en página (los dos modelos): esperas, parones de frame, rollback, saltos del balón, coste de la sesión
  const HOOK = "(function(){if(window.__mx)return;var W=window.__mx={vbN:0,vbJ:0,vbMax:0,vb:null,frames:0,wait:0,unst:0,ms:0,maxMs:0,cpu:[],dep:{},jumps:0,jMax:0,raf:0,rafBig:0,rafMax:0,H:{},pts:[],over:0,st:{},PJ:{D:pjN(),R:pjN()},raf1:[]};" +
    // saltos de los jugadores que no son el tuyo (L2): R = partida predicha (cruda, sin suavizar), D = vista PINTADA (la de net.view tal
    // como quedó el frame anterior: se lee al empezar el advance siguiente, antes de que el espejo la rehaga). Salto = distancia entre la
    // posición y la extrapolada del frame anterior (con la velocidad de antes o la de ahora, la menor), en 'rally' o 'serve' sin cambio de
    // modo; j = > 0,15 m, j5 = > 0,5 m. Solo en los advance de un frame (net.frameAt cambia): los del latido del Worker no repintan.
    "function pjN(){var h=[];for(var q=0;q<101;q++)h.push(0);return{x:[],y:[],z:[],vx:[],vy:[],vz:[],t:0,m:'',ok:0,n:0,j:0,j5:0,mx:0,sum:0,h:h};}" +
    "function pj(A,g,t,me){var ps=g&&g.players;if(!ps){A.ok=0;return;}var m=g.mode,dt=(t-A.t)/1000,use=A.ok&&A.m===m&&(m==='rally'||m==='serve')&&dt>0&&dt<0.1;" +
    "for(var i=0;i<ps.length;i++){var p=ps[i],z=p.z||0,vz=p.vz||0;if(use&&p.id!==me){var ax=A.x[i]+A.vx[i]*dt-p.x,ay=A.y[i]+A.vy[i]*dt-p.y,az=A.z[i]+A.vz[i]*dt-z,bx=A.x[i]+p.vx*dt-p.x,by=A.y[i]+p.vy*dt-p.y,bz=A.z[i]+vz*dt-z;" +
    "var j=Math.min(Math.sqrt(ax*ax+ay*ay+az*az),Math.sqrt(bx*bx+by*by+bz*bz));A.n++;A.sum+=j;A.h[Math.min(100,(j/0.01)|0)]++;if(j>0.15)A.j++;if(j>0.5){A.j5++;var ss=VB.ctx.net&&VB.ctx.net.sess;if(ss&&(p.id===ss._capBind||(ss.pDel&&ss.pDel[p.id]>0.01)))A.j5s=(A.j5s|0)+1;}if(j>A.mx)A.mx=j;}" +
    "A.x[i]=p.x;A.y[i]=p.y;A.z[i]=z;A.vx[i]=p.vx||0;A.vy[i]=p.vy||0;A.vz[i]=vz;}A.t=t;A.m=m;A.ok=1;}" +
    "var last=0;function raf(t){if(last&&VB.ctx.state==='playing'&&VB.ctx.net&&VB.ctx.net.r&&VB.ctx.net.r.status==='playing'){var d=t-last;W.raf++;if(d>100){W.rafBig++;if(W.raf1.length<40)W.raf1.push([Math.round((t-(W.t0||t))/100)/10,Math.round(d)]);}if(d>W.rafMax)W.rafMax=d;if(!W.t0)W.t0=t;}last=t;requestAnimationFrame(raf);}requestAnimationFrame(raf);" +
    "setInterval(function(){var n=VB.ctx.net;if(!n||!n.sess||n.sess.__mx)return;var s=n.sess;s.__mx=1;if(s.hstats&&!s.host)s.lateDbg=[];var o=s._hashTick;if(o)s._hashTick=function(){o.call(this);if(this.myHash)W.H[this.gcTick]=this.myHash[this.gcTick];};" +
    "var pb=null,pt=0,pm='',vt=0;var a=s.advance;s.advance=function(now,inp){var t=performance.now(),nn=VB.ctx.net,vw=nn&&nn.view,me=vw&&vw.ctrl?vw.ctrl.id:-1,live=nn&&nn.r&&nn.r.status==='playing',fr=!!nn&&nn.frameAt!==W.fa;if(fr){W.fa=nn.frameAt;if(vw&&live)pj(W.PJ.D,vw,vt,me);else W.PJ.D.ok=0;var vb=vw&&vw.ball;if(vb&&live&&vw.mode==='rally'&&W.vb&&W.vb[6]==='rally'){var vd=(vt-W.vb[7])/1000;if(vd>0&&vd<0.1){var ex=W.vb[0]+W.vb[3]*vd-vb.x,ey=W.vb[1]+W.vb[4]*vd-vb.y,ez=W.vb[2]+W.vb[5]*vd-4.9*vd*vd-vb.z,vj=Math.sqrt(ex*ex+ey*ey+ez*ez);W.vbN++;if(vj>0.5)W.vbJ++;if(vj>W.vbMax)W.vbMax=vj;}}W.vb=vb&&live?[vb.x,vb.y,vb.z,vb.vx||0,vb.vy||0,vb.vz||0,vw.mode,vt]:null;vt=t;}var r=a.call(this,now,inp),d=performance.now()-t;W.frames++;W.ms+=d;if(d>W.maxMs)W.maxMs=d;if(W.cpu.length<20000&&r.status==='playing')W.cpu.push(Math.round(d*1000));W.st[r.status]=(W.st[r.status]|0)+1;" +
    "if(fr){if(r.status==='playing')pj(W.PJ.R,r.g,t,me);else W.PJ.R.ok=0;}if(r.status==='waiting')W.wait++;if(r.unstable)W.unst++;if(this.stats&&this.stats.depth!=null&&r.status==='playing'){var k=this.stats.depth|0;W.dep[k]=(W.dep[k]|0)+1;if(this.stats.resim!=null){W.rsN=(W.rsN|0)+1;W.rsS=(W.rsS|0)+(this.stats.resim|0);}}" +
    "for(var i=0;i<r.confirmed.length;i++){var e=r.confirmed[i];if(e.type==='point')W.pts.push(e.team);if(e.type==='gameOver')W.over++;}" +
    "var g=r.g,b=g&&g.ball;if(b&&r.status==='playing'){var m=g.mode;if(pb&&m===pm&&m==='rally'){var dt=(t-pt)/1000,ex=pb[0]+pb[3]*dt,ey=pb[1]+pb[4]*dt,ez=pb[2]+pb[5]*dt-4.9*dt*dt,j=Math.sqrt((b.x-ex)*(b.x-ex)+(b.y-ey)*(b.y-ey)+(b.z-ez)*(b.z-ez));if(j>0.6&&dt<0.1){W.jumps++;if(j>W.jMax)W.jMax=j;if((W.jl=W.jl||[]).length<12)W.jl.push([Math.round(t/100)/10,+j.toFixed(2),+b.z.toFixed(2),+pb[5].toFixed(1),+(b.vz||0).toFixed(1),+Math.hypot(pb[3]-(b.vx||0),pb[4]-(b.vy||0)).toFixed(1),g.touches!=null?g.touches:(g.touch!=null?g.touch:''),g.lastTeam!=null?g.lastTeam:'',+(dt*1000).toFixed(0)]);}}" +
    "pb=[b.x,b.y,b.z,b.vx||0,b.vy||0,b.vz||0];pt=t;pm=m;}else pb=null;return r;};},50);})()";
  const ST = "(function(){var n=VB.ctx.net,r=n&&n.r;if(!n)return{st:VB.ctx.state};var s=n.sess,gc=s.confirmedGame&&s.confirmedGame();" +
    "return{hai:(function(){var g=n.sess.predictedGame&&n.sess.predictedGame();return g&&g.hum?g.hum.map(function(h){return h.ai?1:0}).join(''):''})(),vis:document.visibilityState,away:!!n.away0,st:VB.ctx.state,ns:r&&r.status,sc:gc&&gc.score,sets:gc&&gc.sets,ping:r&&r.ping,pings:r&&r.pings,wf:r&&r.waitFor,meAI:r&&r.meAI,delay:s.delay,fps:VB.ctx.fps}})()";
  const delayTxt = (d) => d == null ? (MODEL === 'host' ? '0 (host: tu jugador sin retraso)' : '—') : d;
  let all = false;
  for (let i = 0; i < 180 && !all; i++) {
    await sleep(500);
    const S = await Promise.all(P.map(p => J(p, ST)));
    if (MRTC) for (let k = 0; k < N; k++) if (S[k] && S[k].ns && !S[k].bot) await ev(P[k], "(function(){var n=VB.ctx.net;if(!n||VB.ctx.netBot)return;VB.ctx.netBot=VB.Net.bot(n.seat," + (k * 7 + 3) + ",'bueno',{team:n.team});})()");
    all = S.every(x => x && x.ns === 'playing');
    if (all) for (const p of P) await ev(p, HOOK);
    // NDDROPGO=k (L2): la página k no presenta nunca el evento gameOver (como un final confirmado en silencio por un resync): debe
    // llegar igual a la hoja final (main.js netFrame: status 'over' sin evento → 'over' a los 600 ms)
    if (all && process.env.NDDROPGO != null && P[+process.env.NDDROPGO]) await ev(P[+process.env.NDDROPGO], "(function(){var s=VB.ctx.net&&VB.ctx.net.sess;if(!s||!s._present||s.__dg)return;s.__dg=1;var o=s._present;s._present=function(out){var n=out.length;o.call(this,out);for(var i=out.length-1;i>=n;i--)if(out[i].type==='gameOver'){out.splice(i,1);window.__dgN=(window.__dgN|0)+1;}};})()");
    if (i % 10 === 9) console.log('  esperando…', JSON.stringify(S.map(x => x && (x.ns || x.st))));
  }
  check('las ' + N + ' páginas conectan (' + (MRTC ? 'lobby + WebRTC' : 'estrella de BcLink de pareja') + ') y juegan', all, MRTC ? await J(P[0], 'VB.ctx.net&&VB.ctx.net.model') : undefined);
  if (!all) { for (const p of P) console.log(p.tag, p.errors.slice(0, 5), p.logs.slice(-6)); cleanup(); killJava(); process.exit(1); }
  const t1 = Date.now(); let shots = 0;
  // (estrés) NDBURST=1: cada enlace invitado ↔ anfitrión se corta 300 ms cada 8-12 s (fase propia), en los dos sentidos (el Shaper del
  // BcLink de cada lado tira las entradas que llegan en ese rato y retrasa el control). Solo con BcLink (sin NDRTC).
  const BURST = { n: 0, next: [] };
  if (process.env.NDBURST === '1' && !MRTC) {
    for (let k = 1; k < N; k++) BURST.next[k] = Date.now() + 3000 + Math.random() * 10000;
    BURST.iv = setInterval(() => {
      for (let k = 1; k < N; k++) if (Date.now() >= BURST.next[k]) {
        BURST.next[k] = Date.now() + 8000 + Math.random() * 4000; BURST.n++;
        ev(P[k], "(function(){var s=VB.ctx.net&&VB.ctx.net.sess;if(s&&s.links)s.links.forEach(function(l){if(l&&l.shaper)l.shaper.down=performance.now()+300;});})()");
        ev(P[0], "(function(){var s=VB.ctx.net&&VB.ctx.net.sess;if(s&&s.links)s.links.forEach(function(l){if(l&&l.shaper&&l.to===" + k + ")l.shaper.down=performance.now()+300;});})()");
      }
    }, 100);
  }
  // (lane A) NDRELOAD: recarga de una página de invitado en pleno partido y vuelta a su plaza
  const RLD = process.env.NDRELOAD ? Math.max(1, Math.min(N - 1, +process.env.NDRELOAD || 1)) : 0, RLD_AT = +process.env.NDRELOADAT || 20;
  const RL = { done: false, t: 0, back: 0, seatBack: 0, sheet: '', hud: '', err: '' };
  const HOSTX = process.env.NDHOST === 'away' || process.env.NDHOST === 'reload' ? process.env.NDHOST : '';
  const HX = { done: false, hud: [], back: 0, endMs: [], err: '' };
  const HIDE = (h) => "(function(){if(" + h + "){Object.defineProperty(document,'hidden',{configurable:true,get:function(){return true}});Object.defineProperty(document,'visibilityState',{configurable:true,get:function(){return 'hidden'}});}" +
    "else{delete document.hidden;delete document.visibilityState;}document.dispatchEvent(new Event('visibilitychange'));})()";
  const HUDJ = "(function(){var h=document.getElementById('netHud'),n=window.VB&&VB.ctx&&VB.ctx.net;return{hud:h&&!h.hidden?(h.textContent||'').slice(0,120):'',ns:n&&n.r&&n.r.status,why:n&&n.r&&n.r.result&&n.r.result.why}})()";
  async function hostScenario() {
    HX.done = true;
    if (HOSTX === 'away') {
      console.log('  NDHOST=away: el anfitrión se oculta y se congela 15 s');
      await ev(P[0], HIDE(true));
      // (Chrome de escritorio no congela una pestaña de delante: la sesión del anfitrión deja de avanzar —ni lee ni manda nada—, como un
      //  móvil con la app en segundo plano; Page.setWebLifecycleState por si acaso)
      await ev(P[0], "(function(){var s=VB.ctx.net&&VB.ctx.net.sess;if(!s||s.__fz)return;s.__fz=s.advance;s.advance=function(){return VB.ctx.net.r;};})()");
      await P[0].send('Page.setWebLifecycleState', { state: 'frozen' }).catch(e => { HX.err = 'freeze: ' + e.message; });
      const tE = Date.now() + 15000;
      while (Date.now() < tE) { await sleep(1000); for (let k = 1; k < N; k++) { const o = await J(P[k], HUDJ); if (o && o.hud && HX.hud.indexOf(o.hud) < 0 && HX.hud.length < 12) HX.hud.push(o.hud); } }
      if (NREND > 1) console.log('  captura', await P[1].shot(path.join(OUT, 'multi-anf-fuera-' + FMT + '.png')));
      await P[0].send('Page.setWebLifecycleState', { state: 'active' }).catch(() => { });
      await ev(P[0], "(function(){var s=VB.ctx.net&&VB.ctx.net.sess;if(s&&s.__fz){s.advance=s.__fz;delete s.__fz;}})()");
      await ev(P[0], HIDE(false));
      const t0 = Date.now();
      for (let i = 0; i < 120; i++) { await sleep(250); const S = await Promise.all(P.map(q => J(q, ST))); if (S.every(x => x && x.ns === 'playing')) { HX.back = Date.now() - t0; break; } }
      return;
    }
    console.log('  NDHOST=reload: el anfitrión recarga en pleno partido');
    const t0 = Date.now();
    await P[0].send('Page.reload', {});
    for (let i = 0; i < 80; i++) {
      await sleep(250);
      for (let k = 1; k < N; k++) if (HX.endMs[k] == null) { const o = await J(P[k], HUDJ); if (o && o.ns === 'ended') { HX.endMs[k] = Date.now() - t0; HX.hud[k] = o.hud + ' [' + o.why + ']'; } }
      if (P.slice(1).every((q, k) => HX.endMs[k + 1] != null)) break;
    }
    if (NREND > 1) console.log('  captura', await P[1].shot(path.join(OUT, 'multi-anf-se-va-' + FMT + '.png')));
  }
  async function reloadGuest() {
    const k = RLD, p = P[k]; RL.done = true;
    const url = await ev(p, 'location.href');
    RL.t = Date.now();
    if (MRTC) await p.send('Page.reload', {});
    else await p.send('Page.navigate', { url: String(url).replace(/&back=1/, '') + '&back=1' });
    console.log('  NDRELOAD: la página ' + p.tag + ' se recarga en pleno partido (' + (MRTC ? 'lobby: vuelta tras recargar' : 'BcLink &back=1') + ')');
    // hoja «Volviendo a la partida…» (lobby) y HUD; luego, de vuelta a 'playing'
    const tEnd = Date.now() + 90000;
    while (Date.now() < tEnd) {
      await sleep(150);
      const o = await J(p, "(function(){var d=document.getElementById('olCoop'),h=document.getElementById('netHud'),n=window.VB&&VB.ctx&&VB.ctx.net;" +
        "return{sh:d&&!d.hidden?(d.textContent||'').slice(0,120):'',hud:h&&!h.hidden?(h.textContent||'').slice(0,80):'',ns:n&&n.r&&n.r.status,st:window.VB&&VB.ctx&&VB.ctx.state}})()");
      if (!o) continue;
      if (o.sh && !RL.sheet) { RL.sheet = o.sh; RL.tSheet = Date.now() - RL.t; console.log('  captura', await p.shot(path.join(OUT, 'multi-vuelta-hoja-' + FMT + '.png'))); }
      if (o.hud && /Volviendo/.test(o.hud) && !RL.hud) RL.hud = o.hud;
      if (MRTC && o.ns) await ev(p, "(function(){var n=VB.ctx.net;if(!n||VB.ctx.netBot)return;VB.ctx.netBot=VB.Net.bot(n.seat," + (k * 7 + 3) + ",'bueno',{team:n.team});})()");
      if (o.ns === 'playing') { RL.back = Date.now() - RL.t; break; }
      if (o.ns === 'ended') { RL.err = 'ended: ' + o.hud; break; }
    }
    if (!RL.back) return;
    await ev(p, HOOK);
    console.log('  captura', await p.shot(path.join(OUT, 'multi-vuelta-' + FMT + '.png')));
    // el anfitrión le devuelve su plaza (deja de llevarla la IA: Precisa-N tras el resync; modelo host en el siguiente balón muerto)
    const tE2 = Date.now() + 40000;
    while (Date.now() < tE2) { await sleep(250); const h = await J(P[0], ST); if (h && h.hai && h.hai[k] === '0') { RL.seatBack = Date.now() - RL.t; break; } }
  }
  while (Date.now() - t1 < (ENDALL ? 900 : MSECS) * 1000) {
    await sleep(5000);
    const S = await Promise.all(P.map(p => J(p, ST)));
    console.log('  ' + Math.round((Date.now() - t1) / 1000) + ' s · ' + S.map((x, k) => k + ':' + (x ? (x.ns || x.st) + (x.sc ? ' ' + x.sc.join('-') : '') + (x.fps ? ' ' + x.fps + 'fps' : '') + (x.meAI ? ' IA' : '') + (x.away ? ' AUSENTE' : '') + (x.hai ? ' ia=' + x.hai : '') + (x.vis && x.vis !== 'visible' ? ' ' + x.vis : '') : '?')).join(' · ') + ' · retraso ' + delayTxt(S[0] && S[0].delay));
    if (shots < 1 && Date.now() - t1 > 20000) { shots++; for (let k = 0; k < Math.min(NREND, 2); k++) console.log('  captura', await P[k].shot(path.join(OUT, 'multi-' + FMT + '-' + MODEL + '-' + k + '.png'))); }
    if (RLD && !RL.done && Date.now() - t1 > RLD_AT * 1000) await reloadGuest();
    if (HOSTX && !HX.done && Date.now() - t1 > RLD_AT * 1000) {
      await hostScenario();
      if (HOSTX === 'reload') {   // (la prueba acaba aquí: no hay partido que medir)
        console.log('  NDHOST=reload: invitados acabados a los ' + JSON.stringify(HX.endMs.slice(1)) + ' ms · ' + JSON.stringify(HX.hud.slice(1)));
        check('NDHOST=reload: los invitados acaban en el acto (< 8 s) con «… se ha ido: el partido no cuenta» (hostGone)', HX.endMs.slice(1).length === N - 1 && HX.endMs.slice(1).every(v => v != null && v < 8000) && HX.hud.slice(1).every(t => /se ha ido: el partido no cuenta/.test(t) && /hostGone/.test(t)), HX);
        check('consola sin errores', P.every(q => !q.errors.length), P.map(q => q.errors.slice(0, 2)));
        for (const q of P) q.close();
        cleanup(); killJava();
        console.log('\n' + oks + ' ok, ' + fails + ' fallos (' + ((Date.now() - t0) / 1000).toFixed(0) + ' s)');
        process.exit(fails ? 1 : 0);
      }
    }
    if (S.every(x => x && (x.st === 'over' || x.ns === 'over' || x.ns === 'ended'))) { await sleep(3000); break; }
  }
  if (BURST.iv) { clearInterval(BURST.iv); console.log('  NDBURST: ' + BURST.n + ' cortes de 300 ms'); }
  const FIN = "(function(){var n=VB.ctx.net,W=window.__mx||{},s=n&&n.sess,gc=s&&s.confirmedGame(),v=n&&n.view;" +
    "return{st:VB.ctx.state,ns:n&&n.r&&n.r.status,W:{frames:W.frames,wait:W.wait,unst:W.unst,ms:W.frames?W.ms/W.frames:0,maxMs:W.maxMs,dep:W.dep,rsAv:W.rsN?W.rsS/W.rsN:null,jumps:W.jumps,jMax:W.jMax,jl:W.jl,raf:W.raf,rafBig:W.rafBig,rafMax:W.rafMax,over:W.over,pts:W.pts,st:W.st,raf1:W.raf1,PJ:W.PJ&&{R:{n:W.PJ.R.n,j:W.PJ.R.j,j5:W.PJ.R.j5,mx:W.PJ.R.mx,av:W.PJ.R.n?W.PJ.R.sum/W.PJ.R.n:0},D:{n:W.PJ.D.n,j:W.PJ.D.j,j5:W.PJ.D.j5,j5s:W.PJ.D.j5s|0,mx:W.PJ.D.mx,av:W.PJ.D.n?W.PJ.D.sum/W.PJ.D.n:0,p99:(function(A){var c=0,k;for(k=0;k<101;k++){c+=A.h[k];if(c>=A.n*0.99)return k/100;}return 1;})(W.PJ.D)}},vbN:W.vbN,vbJ:W.vbJ,vbMax:W.vbMax}," +
    "cpu:(function(){var c=(W.cpu||[]).slice().sort(function(a,b){return a-b});return c.length?[c[c.length>>1],c[Math.floor(c.length*0.99)]]:[0,0]})(),H:W.H," +
    "sc:gc&&gc.score,sets:gc&&gc.sets,ss:gc&&gc.setScores,myP:gc&&gc.hum&&n&&gc.hum[n.seat]&&gc.hum[n.seat].p.id,viewCtrl:v&&v.ctrl&&v.ctrl.id,viewTeam:v&&v.ctrl&&v.ctrl.team,seat:n&&n.seat,team:n&&n.team," +
    "maxDepth:s&&s.stats&&s.stats.maxDepth,resyncs:s&&s.stats&&s.stats.resyncs,delay:s&&s.delay,hs:s&&s.hstats?{bJump:s.hstats.bJump,bJumpMax:s.hstats.bJumpMax,tcIn:s.hstats.tcIn,tcFork:s.hstats.tcFork,tcRej:s.hstats.tcRej,rescues:s.hstats.rescues,late:s.hstats.lateC,lateMax:s.hstats.lateMax,bundleMax:s.hstats.bundleMax}:null," +
    "bj:n&&n.bj|0,bjMax:n&&n.bjMax||0,ld:s&&s.lateDbg&&s.lateDbg.slice(0,12),bytesOut:s&&s.stats&&s.stats.bytesOut,fps:VB.ctx.fps,frameMs:VB.ctx.frameMs,tags:(function(){var e=document.getElementById('netTags');return e?e.textContent:''})(),hud:(function(){var e=document.getElementById('netHud');return e&&!e.hidden?e.textContent:''})()}})()";
  const R = await Promise.all(P.map(p => J(p, FIN)));
  const secs = (Date.now() - t1) / 1000;
  for (let k = 0; k < N; k++) {
    const r = R[k]; if (!r) { console.log('  ' + P[k].tag + ': sin datos'); continue; }
    const d = r.W.dep || {}, keys = Object.keys(d).map(Number).sort((a, b) => a - b); let tot = 0; for (const x of keys) tot += d[x];
    let acc = 0, p95 = 0; for (const x of keys) { acc += d[x]; if (acc >= tot * 0.95) { p95 = x; break; } }
    r.p95 = p95; acc = 0; let p99 = 0; for (const x of keys) { acc += d[x]; if (acc >= tot * 0.99) { p99 = x; break; } } r.p99 = p99;
    r.nLinks = MRTC ? (k ? 1 : N - 1) : (k ? 1 : N - 1); r.upLink = Math.round((r.bytesOut || 0) / secs / 1024 / r.nLinks * 10) / 10;
    // (P8) resumen de una línea para la tabla de medidas: esperas, rollback p99, jugadores pintados p99, balón pintado > 0,5 m, rAF, fps, subida por enlace
    console.log('  RESUMEN ' + P[k].tag + ' | esperas ' + r.W.wait + ' | rb p99 ' + (MODEL === 'precisa' ? p99 : '—') + ' | jug p99 ' + (r.W.PJ ? r.W.PJ.D.p99.toFixed(2) : '?') + ' m (máx ' + (r.W.PJ ? (+r.W.PJ.D.mx).toFixed(2) : '?') + ') | balón pintado >0,5 m ' + r.W.vbJ + ' (máx ' + (+r.W.vbMax || 0).toFixed(2) + ') | rAF>100 ' + r.W.rafBig + ' (máx ' + Math.round(r.W.rafMax) + ') | fps ' + r.fps + ' | sube ' + r.upLink + ' KB/s × ' + r.nLinks);
    console.log('  ' + P[k].tag + (k < NREND ? ' (pinta' + (CPU > 1 && k === CPUPAGE ? ', CPU ×' + CPU : '') + ')' : ' (sin dibujo' + (CPU > 1 && k === CPUPAGE ? ', CPU ×' + CPU : '') + ')') + ': esperas ' + r.W.wait + '/' + r.W.frames + ' frames · inestable ' + r.W.unst +
      ' · parones rAF>100 ms ' + r.W.rafBig + ' (máx ' + Math.round(r.W.rafMax) + ' ms) · rollback máx ' + r.maxDepth + ' p95 ' + p95 + (r.W.rsAv != null ? ' (tics rehechos por frame, media ' + r.W.rsAv.toFixed(1) + ')' : '') + ' · saltos del balón ' + r.W.jumps + ' (máx ' + (+r.W.jMax || 0).toFixed(2) + ' m)' +
      (r.hs ? ' · host: bJump ' + r.hs.bJump + ' (máx ' + (+r.hs.bJumpMax || 0).toFixed(2) + ') toques ' + r.hs.tcIn + ' forks ' + r.hs.tcFork + ' rech ' + r.hs.tcRej + ' rescates ' + r.hs.rescues + ' tarde ' + r.hs.late : '') +
      (MODEL === 'precisa' ? ' · tras suavizar ' + r.bj + ' (máx ' + (+r.bjMax || 0).toFixed(2) + ' m)' : '') + (r.W.PJ ? ' · jugadores: crudo ' + r.W.PJ.R.j + '>0,15/' + r.W.PJ.R.j5 + '>0,5 (máx ' + (+r.W.PJ.R.mx).toFixed(2) + ' m) pintado ' + r.W.PJ.D.j + '/' + r.W.PJ.D.j5 + (r.W.PJ.D.j5s ? ' [' + r.W.PJ.D.j5s + ' del que va con el reloj del balón]' : '') + ' (máx ' + (+r.W.PJ.D.mx).toFixed(2) + ' m)' : '') +
      ' · sesión ' + r.cpu[0] + '/' + r.cpu[1] + ' µs (p50/p99) · fps ' + r.fps + ' · frame JS ' + (+r.frameMs || 0).toFixed(1) + ' ms · retraso ' + delayTxt(r.delay) + ' · sube ' + Math.round((r.bytesOut || 0) / secs / 1024 * 10) / 10 + ' KB/s');
  }
  if (MODEL === 'precisa') {
    let n = 0, bad = 0;
    for (let k = 1; k < N; k++) { const A = R[0].H || {}, B = (R[k] || {}).H || {}; for (const t in A) if (B[t] !== undefined) { n++; if (A[t] !== B[t]) bad++; } }
    check('Precisa-N: huellas de la confirmada iguales en todas las páginas', n > 10 * (N - 1) && bad === 0, { controles: n, distintas: bad, resyncs: R.map(r => r && r.resyncs) });
  } else {
    const p0 = (R[0].W.pts || []).join(''), sameSeq = R.every(r => r && (p0.indexOf((r.W.pts || []).join('')) === 0 || (r.W.pts || []).join('').indexOf(p0) === 0));
    // (NDRELOAD: la página recargada solo ve los puntos desde que volvió: su secuencia es un trozo de la del anfitrión)
    const sameSeq2 = RLD ? R.every((r, k) => r && (k === RLD ? p0.indexOf((r.W.pts || []).join('')) >= 0 : (p0.indexOf((r.W.pts || []).join('')) === 0 || (r.W.pts || []).join('').indexOf(p0) === 0))) : sameSeq;
    check('modelo host: todas pasan por la misma secuencia de puntos', sameSeq2 && p0.length >= 3, R.map(r => r && (r.W.pts || []).length));
  }
  check('cada página lleva SU jugador (g.hum[plaza]) y lo ve en su equipo 0', R.every(r => r && r.myP === r.viewCtrl && r.viewTeam === 0), R.map(r => r && [r.seat, r.myP, r.viewCtrl, r.viewTeam]));
  const overAll = R.every(r => r && r.W.over > 0), overSt = R.every(r => r && r.st === 'over');
  if (overAll || ENDALL) check('final del partido en TODAS las páginas (hoja final: estado over)', overAll && overSt, R.map(r => r && [r.st, r.ns, r.W.over]));
  const wt = R.reduce((a, r) => a + (r ? r.W.wait : 0), 0);
  if (RLD || HOSTX) console.log('  (' + (RLD ? 'NDRELOAD' : 'NDHOST') + ': esperas por página ' + JSON.stringify(R.map(r => r && r.W.wait)) + ' — mientras la plaza recargada pasa a la IA, o el anfitrión está congelado, los demás esperan: no se comprueba)');
  else check('congelaciones de la sesión (frames en «waiting») con ' + MLAG + ' ms: como mucho 3 por página', wt <= N * 3, R.map(r => r && r.W.wait));
  if (HOSTX === 'away') {
    console.log('  NDHOST=away: HUD de los invitados ' + JSON.stringify(HX.hud) + ' · todos jugando otra vez a los ' + HX.back + ' ms' + (HX.err ? ' · ' + HX.err : ''));
    check('NDHOST=away: los invitados esperan con «… ha salido un momento de la app»', HX.hud.some(t => /ha salido un momento de la app/.test(t)), HX.hud);
    check('NDHOST=away: al volver el anfitrión, todos siguen jugando (nadie acaba)', HX.back > 0, HX.back);
  }
  if (RLD) {
    console.log('  NDRELOAD: hoja ' + (RL.sheet ? JSON.stringify(RL.sheet.slice(0, 60)) + ' a los ' + RL.tSheet + ' ms' : '—') + ' · HUD ' + JSON.stringify(RL.hud) + ' · de vuelta jugando a los ' + RL.back + ' ms · plaza devuelta (sin IA) a los ' + RL.seatBack + ' ms' + (RL.err ? ' · ' + RL.err : ''));
    check('NDRELOAD: la página recargada vuelve sola a jugar en su plaza', RL.done && RL.back > 0 && !RL.err, RL);
    check('NDRELOAD: el anfitrión le devuelve su plaza (deja de llevarla la IA)', RL.seatBack > 0, RL.seatBack);
    if (MRTC) check('NDRELOAD: «Volviendo a la partida…» a la vista mientras vuelve (hoja del lobby o HUD)', /Volviendo a la partida/.test(RL.sheet + ' ' + RL.hud), [RL.sheet, RL.hud]);
  }
  check('consola sin errores', P.every(p => !p.errors.length), P.map(p => p.errors.slice(0, 2)));
  if (process.env.NDDROPGO != null && P[+process.env.NDDROPGO]) console.log('  NDDROPGO: gameOver quitados en la página ' + process.env.NDDROPGO + ': ' + await ev(P[+process.env.NDDROPGO], 'window.__dgN|0') + ' · estado ' + (R[+process.env.NDDROPGO] || {}).st);
  for (let k = 0; k < N; k++) if (R[k] && R[k].W.raf1 && R[k].W.raf1.length) console.log('  ' + P[k].tag + ' parones rAF > 100 ms [s desde el 1r frame jugando, ms]: ' + JSON.stringify(R[k].W.raf1.slice(0, 12)));
  for (let k = 0; k < Math.min(NREND, 2); k++) console.log('  captura final', await P[k].shot(path.join(OUT, 'multi-' + FMT + '-' + MODEL + '-' + k + '-fin.png')));
  if (process.env.NDJSON) fs.writeFileSync(process.env.NDJSON, JSON.stringify({ N, FMT, MODEL, COOP, CPU, MLAG, secs, R: R.map(r => r && Object.assign({}, r, { H: undefined })) }, null, 1));
  for (const p of P) p.close();
  cleanup(); killJava();
  console.log('\n' + oks + ' ok, ' + fails + ' fallos (' + ((Date.now() - t0) / 1000).toFixed(0) + ' s)');
  process.exit(fails ? 1 : 0);
})().catch(e => { console.error(e); cleanup(); killJava(); process.exit(1); });

/* ======================= --coop: Carrera cooperativa de punta a punta (P8 del sprint online-multi) =======================
 * node tools/netdrive.js --coop — dos páginas del juego real, el LOBBY de verdad (VB.NetLobby.coop, sala 'coop' del esquema v3) contra el
 * emulador de Firestore (con las reglas de firebase/firestore.rules) y WebRTC local (?netice=none). El anfitrión tiene una Carrera de
 * playa y pulsa «Jugar en cooperativo» en Carrera › Partido; el invitado (con su propia Carrera) escribe el código en la misma tarjeta y
 * pulsa «Unirse», recibe la Carrera del anfitrión y pulsa «Listo»; el anfitrión pulsa «Jugar» y el partido cooperativo (Precisa, 2
 * plazas, equipo 0) se juega con bots (un solo set para que dure poco: matchOpts parcheado solo aquí; ~5 min). Comprueba: hoja final en las DOS
 * (sin «Revancha»), la jornada avanza solo en el anfitrión, XP del anfitrión y de p2 (en su Carrera y en la copia del invitado), al
 * volver la Carrera se abre en los dos con la foto nueva, el localStorage del invitado conserva SU Carrera, consola sin errores.
 * Capturas tools/out/coop-*.png.
 * NDRELOAD=1 (lane A): a los 15 s de partido el INVITADO recarga la página: vuelve solo al partido (lobby: marca BACK, hoja «Volviendo a la
 * partida…», la siguiente oferta del anfitrión, sesión nueva en su plaza con net.coopCareer) y el partido acaba en las dos con la jornada
 * avanzada y p2 acreditado en el anfitrión. Su Carrera en memoria no vuelve: al salir de la hoja, su adiós cierra la coop del anfitrión. */

if (COOPX) (async () => {
  const t0 = Date.now();
  setTimeout(() => { console.error('TIEMPO AGOTADO (coop)'); process.exit(2); }, 15 * 60 * 1000).unref();
  if (!(await startEmu())) { console.log('Sin emulador de Firestore (Java + jar).'); process.exit(3); }
  console.log('  emulador de Firestore en el puerto ' + EMU_PORT);
  // dos Chrome con perfiles distintos = dos aparatos (cada uno con su localStorage)
  const ch2 = { c: null, p: null };
  process.on('exit', () => { if (ch2.c) CH.kill(ch2.c); if (ch2.p) CDP.rmProfile(ch2.p); });
  const launchOne = async (tag) => {
    const pf = fs.mkdtempSync(path.join(os.tmpdir(), 'vb3k-'));
    const c = CH.launch(pf, 0, W + ',' + (H + 160), ['--disable-background-timer-throttling', '--disable-renderer-backgrounding', '--disable-backgrounding-occluded-windows']);
    let port = 0;
    for (let i = 0; i < 75 && !port; i++) { await sleep(200); try { port = +fs.readFileSync(path.join(pf, 'DevToolsActivePort'), 'utf8').trim().split(/\s+/)[0] || 0; } catch (e) { } }
    if (!port) throw new Error('Chrome no arranca');
    let list = [];
    for (let i = 0; i < 25 && !list.length; i++) { await sleep(200); try { list = (await (await fetch('http://127.0.0.1:' + port + '/json/list')).json()).filter(t => t.type === 'page'); } catch (e) { } }
    return { c, pf, pg: page(list[0].webSocketDebuggerUrl, tag) };
  };
  const A1 = await launchOne('anfitrión'); chrome = A1.c; prof = A1.pf;
  const A2 = await launchOne('invitado'); ch2.c = A2.c; ch2.p = A2.pf;
  const P = [A1.pg, A2.pg];
  if (process.env.NDLOG) process.on('exit', () => { for (const p of P) for (const l of p.logs.slice(-40)) console.log(p.tag + ' ' + l.slice(0, 300)); });
  const NAMES = ['Anfi Coop', 'Invi Coop'];
  for (let k = 0; k < 2; k++) {
    const p = P[k]; await p.ready;
    await p.send('Runtime.enable'); await p.send('Page.enable');
    await p.send('Emulation.setDeviceMetricsOverride', { width: W, height: H, deviceScaleFactor: 1, mobile: false });
    await p.send('Emulation.setFocusEmulationEnabled', { enabled: true }).catch(() => { });
    const q = 'debug=menu&online=1&netemu=' + EMU_PORT + '&netuid=uid' + (k ? 'InviC' : 'AnfiC') + '&netice=none&name=' + encodeURIComponent(NAMES[k]) + (EXTRA ? '&' + EXTRA : '');
    await p.send('Page.navigate', { url: CH.pageUrl(ROOT, q) });
  }
  const ev = (p, js) => p.evalJs(js).catch(e => { console.log('  (eval ' + p.tag + ': ' + e.message.slice(0, 200) + ')'); return null; });
  const J = async (p, js) => { const v = await ev(p, 'JSON.stringify(' + js + ')'); try { return JSON.parse(v); } catch (e) { return null; } };
  const waitFor = async (p, js, ms) => { const tEnd = Date.now() + ms; while (Date.now() < tEnd) { if (await ev(p, js)) return true; await sleep(250); } return false; };
  for (const p of P) await waitFor(p, "!!(window.VB&&VB.ctx&&VB.ctx.state==='menu'&&VB.CareerCoop&&VB.CareerUI&&VB.NetLobby)", 40000);
  // (invitado: se apunta cada clave que escribe en SU localStorage)
  await ev(P[1], "(function(){var o=Storage.prototype.setItem;Storage.prototype.setItem=function(k,v){if(this===window.localStorage)(window.__w=window.__w||[]).push(k);return o.call(this,k,v);};})()");
  const mk = (name, seed) => "(function(){var C=VB.Career;var c=C.create({mode:'beach',name:'" + name + "',num:7,role:'atk',seed:" + seed + ",now:Date.now()});C.acceptOffer(c.offers.findIndex(function(x){return !x.trial}),2);return C.load().player.name})()";
  check('el anfitrión tiene su Carrera de playa', (await ev(P[0], mk('Anfi Coop', 4242))) === 'Anfi Coop');
  check('el invitado tiene la suya (otro aparato: otro perfil de Chrome)', (await ev(P[1], mk('Invi Propia', 777))) === 'Invi Propia');
  const own = await ev(P[1], "localStorage.getItem('make-the-cut.career')");
  await ev(P[1], 'window.__w=[]');
  for (const p of P) await ev(p, "VB.CareerUI.open('hub',{from:'main'})");
  await sleep(800);
  const cardH = await waitFor(P[0], "!!document.querySelector('#crCoop [data-act=co-host]')", 8000);
  check('Carrera › Partido: tarjeta «Cooperativo» con «Jugar en cooperativo» y el código para unirse', cardH && await ev(P[1], "!!document.querySelector('#crCoop #coCode')"));
  console.log('  captura', await P[0].shot(path.join(OUT, 'coop-tarjeta.png')));
  await ev(P[0], "document.querySelector('#crCoop [data-act=co-host]').click()");
  const okCode = await waitFor(P[0], "!!(VB.NetLobby.coop.state()&&VB.NetLobby.coop.state().code)", 15000);
  const code = okCode ? await ev(P[0], 'VB.NetLobby.coop.state().code') : '';
  check('el anfitrión abre la sala cooperativa (código de 6)', /^[2-9A-HJKMNP-Z]{6}$/.test(code || ''), code);
  await ev(P[1], "(function(){var i=document.getElementById('coCode');i.value='" + code + "';i.dispatchEvent(new Event('input',{bubbles:true}));document.querySelector('#crCoop [data-act=co-join]').click();})()");
  const paired = await waitFor(P[0], 'VB.CareerCoop.paired()&&!!VB.CareerCoop._S.hi', 40000) && await waitFor(P[1], "VB.CareerCoop.paired()&&VB.Career.get()&&VB.Career.get().player.name==='Invi Coop'", 30000);
  check('el invitado entra con el código, se conectan por WebRTC y recibe la Carrera del anfitrión (él es la pareja)', paired, [await J(P[0], 'VB.NetLobby.coop.state()'), await J(P[1], 'VB.NetLobby.coop.state()')]);
  if (!paired) { for (const p of P) console.log(p.tag, p.errors.slice(0, 5), p.logs.slice(-10)); cleanup(); killJava(); process.exit(1); }
  await sleep(600);
  console.log('  captura', await P[1].shot(path.join(OUT, 'coop-invitado-hub.png')));
  const pre = await J(P[0], "(function(){var c=VB.Career.load();return{week:c.week,xp:c.player.xp,lvl:c.player.lvl,m:c.player.matches|0,p2:{xp:c.coop.p2.xp,lvl:c.coop.p2.lvl,m:c.coop.p2.matches|0}}})()");
  await ev(P[1], "document.querySelector('#crCoop [data-act=co-ready]').click()");
  check('«Listo» del invitado llega al anfitrión', await waitFor(P[0], 'VB.CareerCoop.ready()', 8000));
  // (solo en esta prueba: un solo set; las dos partes leen las opciones del anfitrión en el saludo de la sesión)
  await ev(P[0], "(function(){var CC=VB.CareerCoop,mo=CC.matchOpts;CC.matchOpts=function(o){var r=mo(o);if(r){r.opts.points=11;r.opts.bestOf=1;}return r;};})()");
  await ev(P[0], "(function(){var b=document.querySelector('#career [data-act=play]');if(b)b.click();})()");
  const both = await Promise.all(P.map(p => waitFor(p, "!!(VB.ctx.net&&VB.ctx.net.r&&VB.ctx.net.r.status==='playing'&&VB.ctx.net.view)", 40000)));
  check('«Jugar» del anfitrión: el partido cooperativo empieza en las dos (Precisa, 2 plazas en el equipo 0)', both[0] && both[1] && (await ev(P[0], 'VB.ctx.net.multi&&VB.ctx.net.coopCareer&&VB.ctx.net.team===0')) && (await ev(P[1], 'VB.ctx.net.seat===1&&VB.ctx.net.team===0')));
  if (!(both[0] && both[1])) { for (const p of P) console.log(p.tag, p.errors.slice(0, 5), p.logs.slice(-10)); cleanup(); killJava(); process.exit(1); }
  for (let k = 0; k < 2; k++) await ev(P[k], "VB.ctx.netBot=VB.Net.bot(" + k + "," + (k + 5) + ",'bueno',{team:0})");
  await sleep(15000);
  console.log('  captura', await P[1].shot(path.join(OUT, 'coop-partido-invitado.png')));
  const CRL = !!process.env.NDRELOAD, crl = { back: 0, seat: 0, sheet: '' };
  if (CRL) {   // (lane A) el invitado recarga en pleno partido cooperativo
    const tR = Date.now();
    await P[1].send('Page.reload', {});
    console.log('  NDRELOAD: el invitado recarga en pleno partido cooperativo');
    for (let i = 0; i < 360 && !crl.back; i++) {
      await sleep(250);
      const o = await J(P[1], "(function(){var d=document.getElementById('olCoop'),n=window.VB&&VB.ctx&&VB.ctx.net;return{sh:d&&!d.hidden?(d.textContent||'').slice(0,80):'',ns:n&&n.r&&n.r.status,cc:!!(n&&n.coopCareer),seat:n&&n.seat}})()");
      if (o && o.sh && !crl.sheet) crl.sheet = o.sh;
      if (o && o.ns === 'playing' && o.cc && o.seat === 1) crl.back = Date.now() - tR;
    }
    if (crl.back) await ev(P[1], "VB.ctx.netBot=VB.Net.bot(1,6,'bueno',{team:0})");
    for (let i = 0; i < 160 && crl.back && !crl.seat; i++) { await sleep(250); if (await ev(P[0], "(function(){var g=VB.ctx.net&&VB.ctx.net.sess.predictedGame();return !!(g&&g.hum&&g.hum[1]&&!g.hum[1].ai)})()")) crl.seat = Date.now() - tR; }
    console.log('  NDRELOAD: hoja ' + JSON.stringify(crl.sheet) + ' · de vuelta jugando a los ' + crl.back + ' ms · plaza devuelta a los ' + crl.seat + ' ms');
    check('NDRELOAD coop: el invitado vuelve solo a su plaza del partido cooperativo (net.coopCareer, plaza 1)', crl.back > 0 && /Volviendo a la partida/.test(crl.sheet), crl);
    check('NDRELOAD coop: el anfitrión le devuelve su plaza (deja de llevarla la IA)', crl.seat > 0, crl.seat);
  }
  let over = false; const tEnd = Date.now() + 9 * 60 * 1000;
  while (!over && Date.now() < tEnd) {
    await sleep(5000);
    const s = await Promise.all(P.map(p => J(p, "(function(){var n=VB.ctx.net;return{st:VB.ctx.state,ns:n&&n.r&&n.r.status,sc:n&&n.view&&n.view.score}})()")));
    console.log('  ' + JSON.stringify(s));
    over = s.every(x => x && x.st === 'over');
  }
  check('final: hoja final en las DOS páginas (estado over)', over);
  await sleep(2500);
  if (CRL) {   // (lane A) tras la vuelta: la jornada cuenta en el anfitrión y la coop se cierra al salir el invitado de la hoja
    const post = await J(P[0], "(function(){var c=VB.Career.load();return{week:c.week,m:c.player.matches|0,p2:{m:c.coop.p2.matches|0}}})()");
    check('NDRELOAD coop: la jornada avanza en el anfitrión y su pareja p2 suma el partido', pre && post && post.week === pre.week + 1 && post.p2.m === pre.p2.m + 1, [pre, post]);
    const sh = await J(P[1], "(function(){var a=document.getElementById('btnAgain');return{again:a?a.hidden:null}})()");
    check('NDRELOAD coop: hoja final del invitado sin «Revancha»', sh && sh.again === true, sh);
    await ev(P[1], "document.getElementById('btnMenu').click()");
    check('NDRELOAD coop: al salir el invitado de la hoja, la coop del anfitrión se cierra (su adiós)', await waitFor(P[0], '!VB.NetLobby.coop.state().on', 15000), await J(P[0], 'VB.NetLobby.coop.state()'));
    check('consola sin errores', !P[0].errors.length && !P[1].errors.length, [P[0].errors.slice(0, 3), P[1].errors.slice(0, 3)]);
    for (const p of P) p.close();
    if (ch2.c) { CH.kill(ch2.c); ch2.c = null; }
    cleanup(); killJava();
    console.log('\n' + oks + ' ok, ' + fails + ' fallos (' + ((Date.now() - t0) / 1000).toFixed(0) + ' s)');
    process.exit(fails ? 1 : 0);
  }
  const sheet = await Promise.all(P.map(p => J(p, "(function(){var a=document.getElementById('btnAgain'),m=document.getElementById('btnMenu');return{again:a?a.hidden:null,menu:m?m.textContent:''}})()")));
  check('hoja final del cooperativo sin «Revancha» y con «Volver a la Carrera»', sheet.every(x => x && x.again === true && /Carrera/.test(x.menu)), sheet);
  for (let k = 0; k < 2; k++) console.log('  captura', await P[k].shot(path.join(OUT, 'coop-hoja-' + (k ? 'invitado' : 'anfitrion') + '.png')));
  const post = await J(P[0], "(function(){var c=VB.Career.load();return{week:c.week,xp:c.player.xp,lvl:c.player.lvl,m:c.player.matches|0,p2:{xp:c.coop.p2.xp,lvl:c.coop.p2.lvl,m:c.coop.p2.matches|0},last:c.last&&{xp:c.last.xp,coop:c.last.coop&&c.last.coop.xp}}})()");
  check('la jornada avanza en la Carrera del anfitrión (' + (pre && pre.week) + ' → ' + (post && post.week) + ')', pre && post && post.week === pre.week + 1);
  check('XP del anfitrión (+' + (post && post.last && post.last.xp) + ') y de su pareja p2 (+' + (post && post.last && post.last.coop) + ')', pre && post && post.m === pre.m + 1 && post.p2.m === pre.p2.m + 1 && (post.xp !== pre.xp || post.lvl > pre.lvl) && (post.p2.xp !== pre.p2.xp || post.p2.lvl > pre.p2.lvl), [pre, post]);
  for (const p of P) await ev(p, "document.getElementById('btnMenu').click()");
  const hubs = await Promise.all(P.map(p => waitFor(p, 'VB.CareerUI.isOpen()', 20000)));
  check('«Volver a la Carrera»: la Carrera se abre otra vez en las dos', hubs[0] && hubs[1]);
  const gotSnap = await waitFor(P[1], "(function(){var c=VB.Career.get();return !!(c&&c.player&&c.player.matches>=" + ((pre && pre.p2.m) + 1) + ")})()", 20000);
  const gv = await J(P[1], "(function(){var c=VB.Career.get(),r=JSON.parse(localStorage.getItem('make-the-cut.coop.p2')||'null');return{name:c.player.name,m:c.player.matches,xp:c.player.xp,lvl:c.player.lvl,rec:r&&r.p2&&{m:r.p2.matches,xp:r.p2.xp,lvl:r.p2.lvl},w:window.__w}})()");
  check('el invitado recibe la foto nueva: ve SU XP (su jugador p2) y guarda la copia en make-the-cut.coop.p2', gotSnap && gv && post && gv.m === post.p2.m && gv.xp === post.p2.xp && gv.rec && gv.rec.xp === post.p2.xp, gv);
  check('el invitado conserva SU Carrera en su localStorage: de la Carrera solo escribe make-the-cut.coop.p2 (las de este aparato, como los consejos e1tips, valen)', (await ev(P[1], "localStorage.getItem('make-the-cut.career')")) === own && (gv.w || []).every(k => k === 'make-the-cut.coop.p2' || !/^make-the-cut.(career|hall|season|legend)/.test(k)), gv && gv.w);
  for (let k = 0; k < 2; k++) console.log('  captura', await P[k].shot(path.join(OUT, 'coop-vuelta-' + (k ? 'invitado' : 'anfitrion') + '.png')));
  check('consola sin errores', !P[0].errors.length && !P[1].errors.length, [P[0].errors.slice(0, 3), P[1].errors.slice(0, 3)]);
  for (const p of P) p.close();
  if (ch2.c) { CH.kill(ch2.c); ch2.c = null; }
  cleanup(); killJava();
  console.log('\n' + oks + ' ok, ' + fails + ' fallos (' + ((Date.now() - t0) / 1000).toFixed(0) + ' s)');
  process.exit(fails ? 1 : 0);
})().catch(e => { console.error(e); cleanup(); killJava(); process.exit(1); });
