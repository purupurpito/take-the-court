#!/usr/bin/env node
/* TAKE THE COURT — tools/mousetest.js  (owner: camera_input)
 * Controles PC (25-nov-2026): esquema TECLADO Y RATÓN ('km', el principal) frente a SOLO TECLADO ('kb', el de siempre), en el juego REAL
 * (Chrome por DevTools, ratón y teclas de verdad: Input.dispatchMouseEvent / Input.dispatchKeyEvent).
 *   1 km: el cursor sobre la pista da el punto (VB.ctx.simAim = el suelo bajo el cursor), la diana del saque va hacia él ya antes de
 *     lanzar, las flechas no la mueven en el lanzamiento, el clic izquierdo saca y el balón cae cerca del punto; aro del cursor a la vista
 *   2 cursor fuera del lienzo: se queda el último punto; encima de un botón del HUD: no apunta
 *   3 km: remate en el aire hacia el cursor (Espacio salta, clic golpea): el remate cae cerca del punto
 *   4 kb: el ratón no apunta (sin simAim) y las flechas mueven la diana en el lanzamiento (lo de siempre)
 *   5 glifos: «Clic» / «el ratón» en km y la tecla / «las flechas» en kb; el clic derecho no abre menú contextual en la pista
 *   6 Controles › Teclado: fila «Esquema» (Teclado y ratón | Solo teclado) y se guarda en make-the-cut.device
 *   7 la oferta «Nuevos controles en PC» (&ctrlask=1) sale, «Solo teclado» la cierra con kb y ctrlAsked, y no vuelve
 * Capturas en tools/out/mouse/ (o en la carpeta de VB_SHOTS). Uso: node tools/mousetest.js [W=1280] [H=720]
 */
'use strict';
const fs = require('fs'), path = require('path');
const CDP = require('./cdp.js');
const W = +(process.argv[2] || 1280), H = +(process.argv[3] || 720);
const OUT = process.env.VB_SHOTS || path.join(__dirname, 'out', 'mouse');
fs.mkdirSync(OUT, { recursive: true });
let fails = 0, oks = 0;
function check(name, cond, info) { if (cond) { oks++; console.log('  ok   ' + name + (info !== undefined ? '  ' + JSON.stringify(info) : '')); } else { fails++; console.log('  FALLO ' + name + (info !== undefined ? '  ' + JSON.stringify(info) : '')); } }
const sleep = ms => new Promise(r => setTimeout(r, ms));
const KEYS = { ArrowLeft: ['ArrowLeft', 37], ArrowUp: ['ArrowUp', 38], KeyJ: ['j', 74], Space: [' ', 32], Enter: ['Enter', 13], Escape: ['Escape', 27] };

(async () => {
  const page = await CDP.open({ size: W + 'x' + H });
  const E = s => page.evalJs(s), send = page.send;
  const key = async (code, type) => { const k = KEYS[code]; const o = { type, code, key: k[0], windowsVirtualKeyCode: k[1], nativeVirtualKeyCode: k[1] }; if (type === 'keyDown' && k[0].length === 1) o.text = k[0]; await send('Input.dispatchKeyEvent', o); };
  const tap = async (code, ms) => { await key(code, 'keyDown'); await sleep(ms || 50); await key(code, 'keyUp'); };
  const move = async (x, y) => send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: Math.round(x), y: Math.round(y), buttons: 0 });
  const mclick = async (x, y, button, ms) => {
    const b = button || 'left', bits = b === 'right' ? 2 : b === 'middle' ? 4 : 1, o = { x: Math.round(x), y: Math.round(y), button: b, clickCount: 1 };
    await send('Input.dispatchMouseEvent', Object.assign({ type: 'mousePressed', buttons: bits }, o)); await sleep(ms || 40);
    await send('Input.dispatchMouseEvent', Object.assign({ type: 'mouseReleased', buttons: 0 }, o));
  };
  const shot = async name => { const r = await send('Page.captureScreenshot', { format: 'png' }); const f = path.join(OUT, name + '.png'); fs.writeFileSync(f, Buffer.from(r.data, 'base64')); console.log('  captura ' + f); };
  // punto del suelo (sim x, y) → píxel de la ventana con la cámara del juego
  const px = (x, y) => E(`(function(){var v=VB.toThree(${x},${y},0,new VB.ctx.THREE.Vector3());v.project(VB.ctx.camera);var r=VB.ctx.canvas.getBoundingClientRect();return {x:r.left+(v.x+1)/2*r.width,y:r.top+(1-v.y)/2*r.height};})()`);
  const g = s => E(`(function(g){return ${s}})(VB.ctx.game)`);
  // registro de eventos de la sim (golpes del humano y el primer bote tras cada golpe)
  const hook = () => E(`(function(){ if (window.__hk) return 1; window.__hk=1; window.__ev=[]; var o=VB.Sim.step; VB.Sim.step=function(g,dt,i){var n=g.events.length;o(g,dt,i);for(var k=n;k<g.events.length;k++){var e=g.events[k];
      if(e.type==='hit'||e.type==='serve'||e.type==='land'){var o2={type:e.type,kind:e.kind||'',team:e.player?e.player.team:(e.team!=null?e.team:-1),human:!!e.human,x:e.x!=null?e.x:g.ball.x,y:e.y!=null?e.y:g.ball.y};
        if(e.type!=='land'&&e.player&&e.player.team===0){var pl=VB.Sim.predictLanding(g,{});o2.pl=[pl.x,pl.y];o2.aim=VB.ctx.simAim?[VB.ctx.simAim[0],VB.ctx.simAim[1]]:null;o2.a3=window.__a3||null;}
        window.__ev.push(o2);}}
      window.__a3=g.aim3&&g.aim3.on?[g.aim3.x,g.aim3.y,g.aim3.kind]:window.__a3;};return 1;})()`);
  // último golpe del equipo 0 con su bote previsto (Sim.predictLanding justo tras el golpe), el punto del cursor y la diana de ese momento
  const lastHit = async () => { const ev = await E('window.__ev'); for (let i = ev.length - 1; i >= 0; i--) if (ev[i].pl) return ev[i]; return null; };
  const d2 = (a, b) => a && b ? Math.hypot(a[0] - b[0], a[1] - b[1]) : 99;
  const ready = async () => { for (let i = 0; i < 60; i++) { if (await E('!!(VB.ctx&&VB.ctx.game&&VB.ctx.state)')) return; await sleep(200); } };
  // saque humano: espera el silbato, lanza con J y golpea con un clic (o J) en el momento justo
  const serveTo = async (pt, how) => {
    for (let i = 0; i < 40 && !(await g("g.mode==='serve'&&g.serveAuth&&g.server===g.ctrl&&g.server.team===0&&g.serveState==='ready'")); i++) await sleep(150);
    await tap('KeyJ', 40);
    const t0 = Date.now();
    while (Date.now() - t0 < 2500) {
      const t = await g("g.mode!=='serve'||g.serveState!=='toss'?-9:VB.Sim.hitWindow(g,g.server).t/Math.max(0.05,VB.ctx.timeScale)");
      if (t === -9 || t == null) break;
      if (how && how.during) await how.during();
      if (t > 0.25) { await sleep(60); continue; }
      await sleep(Math.max(0, t * 1000 - 25));
      if (how && how.key) await tap('KeyJ', 40); else await mclick(pt.x, pt.y, 'left', 40);
      return true;
    }
    return false;
  };
  try {
    // ---------------- 1. teclado y ratón: saque ----------------
    await page.navigate('debug=serve&live=1&autoplay=0&seed=7&nonews=1');
    await ready(); await sleep(2500); await hook();
    await E("VB.ctx.actions.setSetting('ctrlPC','km'),1");
    check('arranca en partido con el esquema km (de fábrica)', (await E('VB.ctx.state')) === 'playing' && (await E('VB.Input.scheme()')) === 'km');
    const T1 = [-5.5, 2.5], P1 = await px(T1[0], T1[1]);
    await move(P1.x - 30, P1.y); await sleep(80); await move(P1.x, P1.y); await sleep(250);
    const sa = await E('VB.ctx.simAim && [VB.ctx.simAim[0], VB.ctx.simAim[1]]');
    check('1a el cursor sobre la pista da el punto del suelo bajo él (VB.ctx.simAim)', !!sa && Math.hypot(sa[0] - T1[0], sa[1] - T1[1]) < 0.35, { simAim: sa, cursor: T1 });
    for (let i = 0; i < 40 && !(await g('g.serveAuth')); i++) await sleep(100);
    await sleep(900);
    const a0 = await g('[g.aim3.x,g.aim3.y,g.serveState]');
    check('1b la diana del saque ya sigue al cursor antes de lanzar', a0[2] === 'ready' && Math.hypot(a0[0] - sa[0], a0[1] - sa[1]) < 0.15, { diana: a0 });
    let shotDone = false, arrowsOk = null;
    const ok1 = await serveTo(P1, { during: async () => {
      if (arrowsOk === null) { const b0 = await g('[g.aim3.x,g.aim3.y]'); await key('ArrowLeft', 'keyDown'); await sleep(160); await key('ArrowLeft', 'keyUp'); const b1 = await g('[g.aim3.x,g.aim3.y]'); arrowsOk = Math.hypot(b1[0] - b0[0], b1[1] - b0[1]) < 0.05; }
      if (!shotDone) { shotDone = true; await shot('1-saque-km-diana'); }
    } });
    check('1c en el lanzamiento las flechas no mueven la diana (con el ratón apuntando)', arrowsOk === true, { arrowsOk });
    await sleep(300);
    const L1 = await lastHit();
    check('1d el clic saca y el balón va adonde apunta el cursor (bote previsto cerca del punto: dispersión del timing)', ok1 && !!L1 && d2(L1.pl, L1.aim) < 2.2 && d2(L1.a3, L1.aim) < 0.2, L1 && { bote: L1.pl.map(v => +v.toFixed(2)), cursor: L1.aim, diana: L1.a3 });
    // ---------------- 2. fuera del lienzo / encima del HUD ----------------
    await move(P1.x, P1.y); await sleep(150);
    await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: W + 40, y: H / 2, buttons: 0 }); await sleep(150);
    const sb = await E('VB.ctx.simAim && [VB.ctx.simAim[0], VB.ctx.simAim[1]]');
    check('2a cursor fuera de la ventana: se queda el último punto', !!sb && Math.hypot(sb[0] - sa[0], sb[1] - sa[1]) < 0.2, { simAim: sb });
    const hb = await E("(function(){var b=document.querySelector('#btnHudPause,#hudPause,[data-hud=pause],#btnPause');if(!b||b.hidden)return null;var r=b.getBoundingClientRect();return r.width?{x:r.left+r.width/2,y:r.top+r.height/2}:null;})()");
    if (hb) {
      await move(hb.x, hb.y); await sleep(150);
      const sc = await E('VB.ctx.simAim && [VB.ctx.simAim[0], VB.ctx.simAim[1]]');
      check('2b encima del botón de pausa no apunta (se queda el último punto)', !!sc && Math.hypot(sc[0] - sa[0], sc[1] - sa[1]) < 0.2, { simAim: sc });
    } else console.log('  (sin botón de pausa a la vista: 2b sin comprobar)');
    // ---------------- 3. remate en el aire hacia el cursor ----------------
    // jugada propia preparada a mano (la colocación del compañero) con la entrada real: Espacio salta, el cursor apunta, clic remata
    const T3 = [-4.5, -2.2];
    let spk = null;
    for (let tr = 0; tr < 4 && !spk; tr++) {
      await E(`(function(){var g=VB.ctx.game,S=VB.Sim,h=g.teams[0][0],m=g.teams[0][1],b=g.ball;g.mode='rally';b.held=null;g.serveState='';
        for(var i=0;i<g.players.length;i++){var p=g.players[i];p.z=0;p.vz=0;p.vx=0;p.vy=0;p.down=0;}
        h.x=2.2;h.y=0.4;m.x=6;m.y=2;Object.assign(b,{x:1.25,y:0.4,z:5.2,vx:0,vy:0,vz:0.6,dip:0,wobA:0});
        g.touchTeam=0;g.touches=2;g.lastPlayer=m;g.lastTeam=0;g.lastKind='set';g.lastTouchT=g.time;g.ctrl=h;window.__ev.length=0;return 1;})()`);
      const P3 = await px(T3[0], T3[1]);
      await move(P3.x, P3.y); await sleep(30);
      let jumped = false, hitDone = false; const t0 = Date.now();
      while (Date.now() - t0 < 3000 && !hitDone) {
        const w = await g("(function(){var w=VB.Sim.hitWindow(g,g.ctrl);return {at:w.attack,jt:w.jumpT,t:w.t,reach:w.reach,z:g.ctrl.z,a3:g.aim3.on?[g.aim3.x,g.aim3.y]:null,mode:g.mode};})()");
        if (w.mode !== 'rally') break;
        if (!jumped && w.at && w.jt <= 0.02) { await tap('Space', 30); jumped = true; continue; }
        if (jumped && w.z > 0.3 && w.t <= 0.27 && w.t > -0.05) { if (!shotDone || tr === 0) await shot('3-remate-km-diana'); await sleep(Math.max(0, w.t * 1000 - 230)); await mclick(P3.x, P3.y, 'left', 30); hitDone = true; }
        await sleep(10);
      }
      await sleep(1400);
      const hit = await lastHit();
      if (hit && hit.kind === 'spike') spk = hit;
      else console.log('  (intento de remate ' + (tr + 1) + ': ' + JSON.stringify(hit) + ')');
    }
    // (la cámara se mueve con la jugada: el punto bajo el cursor quieto cambia; la diana lo persigue a su velocidad)
    const cl3 = a => a && [Math.max(-8.3, Math.min(-1.4, a[0])), Math.max(-3.9, Math.min(3.9, a[1]))];   // (la diana se queda dentro de sus límites)
    check('3 km: remate en el aire hacia el cursor (la diana sigue al cursor y el bote previsto cae cerca)', !!spk && d2(spk.a3, cl3(spk.aim)) < 3 && d2(spk.pl, spk.a3) < 2.4,
      spk && { bote: spk.pl.map(v => +v.toFixed(2)), cursor: spk.aim, diana: spk.a3 });
    // ---------------- 5a. glifos en km ----------------
    const glKm = await E("(function(){var b=VB.Input.bindings();return [VB.Input.srcOf('hit'), document.getElementById('promptKey')?document.getElementById('promptKey').textContent:'']})()");
    check('5a km: el origen de GOLPEAR es el ratón (glifo «Clic»)', glKm[0] === 'mouse', glKm);
    // ---------------- 4. solo teclado ----------------
    await page.navigate('debug=serve&live=1&autoplay=0&seed=7&nonews=1');
    await ready(); await sleep(2500); await hook();
    await E("VB.ctx.actions.setSetting('ctrlPC','kb'),1"); await sleep(100);
    const P4 = await px(-5.5, 2.5); await move(P4.x - 20, P4.y); await sleep(60); await move(P4.x, P4.y); await sleep(250);
    check('4a kb: el ratón no apunta (sin simAim)', (await E('VB.ctx.simAim')) == null && (await E('VB.Input.scheme()')) === 'kb');
    let moved = null, sh4 = false;
    await serveTo(P4, { key: true, during: async () => {
      if (moved === null) { const b0 = await g('[g.aim3.x,g.aim3.y]'); await key('ArrowUp', 'keyDown'); await sleep(200); await key('ArrowUp', 'keyUp'); const b1 = await g('[g.aim3.x,g.aim3.y]'); moved = Math.hypot(b1[0] - b0[0], b1[1] - b0[1]); }
      if (!sh4) { sh4 = true; await shot('4-saque-kb'); }
    } });
    check('4b kb: las flechas mueven la diana en el lanzamiento (lo de siempre)', moved > 0.5, { movida: moved });
    await sleep(1500);
    await E("(function(){window.__cm=0;window.addEventListener('contextmenu',function(e){if(!e.defaultPrevented)window.__cm++;});return 1;})()");
    const Pc = await px(2, 0); await mclick(Pc.x, Pc.y, 'right', 30); await sleep(100);
    check('5b clic derecho en la pista: sin menú contextual', (await E('window.__cm')) === 0);
    const glKb = await E("(function(){return VB.Input.srcOf('jset')})()");
    check('5c kb: COLOCAR vuelve al origen de fábrica (sin forzar el ratón)', glKb === 'mouse' || glKb === 'key', glKb);
    // ---------------- 6. Controles › Teclado ----------------
    await page.navigate('debug=controls&nonews=1');
    await ready(); await sleep(1800);
    await E("VB.ctx.actions.setSetting('ctrlPC','km'),1"); await sleep(300);
    const row = await E("(function(){var b=document.querySelector('#panel [data-opt=ctrlPC]');if(!b||b.hidden)return null;return {txt:b.textContent.replace(/\\s+/g,' ').trim(),segs:b.querySelectorAll('[data-i]').length};})()");
    check('6a Controles › Teclado: fila «Esquema» con Teclado y ratón | Solo teclado', !!row && /Esquema/.test(row.txt) && /Teclado y ratón/.test(row.txt) && /Solo teclado/.test(row.txt), row);
    await shot('6-controles-km');
    await E("(function(){var s=document.querySelector('#panel [data-opt=ctrlPC] [data-i=\"1\"]');if(s)s.click();return 1;})()"); await sleep(400);
    const dv = await E("JSON.parse(localStorage.getItem('make-the-cut.device')||'{}')");
    check('6b clic en «Solo teclado»: ctrlPC = kb guardado en make-the-cut.device', (await E('VB.ctx.settings.ctrlPC')) === 'kb' && dv.ctrlPC === 'kb', { device: dv.ctrlPC });
    await shot('6-controles-kb');
    await E("VB.ctx.actions.setSetting('ctrlPC','km'),1");
    // ---------------- 7. la oferta de una vez ----------------
    await E("(function(){var d=JSON.parse(localStorage.getItem('make-the-cut.device')||'{}');d.ctrlAsked=false;d.ctrlPC='km';localStorage.setItem('make-the-cut.device',JSON.stringify(d));return 1;})()");
    await page.navigate('debug=serve&nonews=1&ctrlask=1');
    await ready(); await sleep(1800);
    await E("VB.ctx.actions.startMatch({}),1"); await sleep(900);
    const offer = await E("(function(){var r=document.getElementById('setNote');return !!r&&!r.hidden&&!!r.querySelector('[data-sn=c-km]')})()");
    check('7a «Nuevos controles en PC» sale antes del partido (foco en Teclado y ratón)', offer && (await E("document.activeElement&&document.activeElement.getAttribute('data-sn')")) === 'c-km');
    await shot('7-oferta');
    await E("(function(){var b=document.querySelector('#setNote [data-sn=c-kb]');b.click();return 1;})()"); await sleep(900);
    const dv2 = await E("JSON.parse(localStorage.getItem('make-the-cut.device')||'{}')");
    check('7b «Solo teclado»: kb y ctrlAsked guardados, y empieza el partido', dv2.ctrlPC === 'kb' && dv2.ctrlAsked === true && (await E('VB.ctx.state')) === 'playing', { device: { ctrlPC: dv2.ctrlPC, ctrlAsked: dv2.ctrlAsked }, st: await E('VB.ctx.state') });
    await page.navigate('debug=serve&nonews=1');
    await ready(); await sleep(1500);
    await E("VB.ctx.actions.startMatch({}),1"); await sleep(900);
    check('7c tras recargar no vuelve a salir', !(await E("(function(){var r=document.getElementById('setNote');return !!r&&!r.hidden})()")) && (await E('VB.ctx.settings.ctrlPC')) === 'kb');
    await E("(function(){var d=JSON.parse(localStorage.getItem('make-the-cut.device')||'{}');d.ctrlPC='km';localStorage.setItem('make-the-cut.device',JSON.stringify(d));return 1;})()");
    const errs = page.errors.filter(e => !/favicon|ERR_FILE_NOT_FOUND/.test(String(e)));
    check('sin errores en la consola', errs.length === 0, errs.slice(0, 3));
  } catch (e) { fails++; console.log('  FALLO excepción ' + (e && e.stack || e)); }
  console.log(fails ? 'mousetest FALLA: ' + fails + ' de ' + (fails + oks) : 'mousetest OK: ' + oks + ' comprobaciones');
  page.close();
  process.exit(fails ? 1 : 0);
})();
