#!/usr/bin/env node
/* TAKE THE COURT — tools/touchedittest.js (owner: camera_input)
 * Disposición táctil (1.22.0, imprescindible 4.2): ESPEJO para zurdos y EDITOR de disposición, con toques reales
 * (Input.dispatchTouchEvent → touch + pointer events de Chrome) sobre el overlay de js/input.js y sobre el editor.
 *   A) zurdos en partido: botones reflejados (misma distancia al borde contrario), pausa y lupa quietas, joystick en la mitad
 *      DERECHA (nace, se mueve, se hereda, no sale de su zona), mitad izquierda sin joystick, joystick + GOLPEAR a la vez,
 *      deslizar de SALTAR a GOLPEAR.
 *   B) editor (Ajustes › Controles › Táctil › Disposición de botones): se abre desde la fila, arrastrar (fracciones guardadas),
 *      clamp a la zona segura y fuera de la pausa, tamaño y opacidad por botón, Zurdos, Restablecer, Esc / Listo, guardado en
 *      make-the-cut.device (no en make-the-cut.settings, que es lo que se sincroniza).
 *   C) lo editado manda en el partido (posición, tamaño, opacidad; se pulsa donde está) y lo roto de una partida vieja no rompe nada.
 * Uso: node tools/touchedittest.js [WxH=844x390]
 */
'use strict';
const path = require('path');
const CDP = require(path.join(__dirname, 'cdp.js'));
const SIZE = process.argv[2] || '844x390';
const OUT = path.join(__dirname, 'out', 'ci', 'shots');
try { require('fs').mkdirSync(OUT, { recursive: true }); } catch (e) { }
let fails = 0, oks = 0;
function check(name, cond, info) { if (cond) { oks++; console.log('  ok   ' + name); } else { fails++; console.log('  FAIL ' + name + (info ? '  ' + JSON.stringify(info) : '')); } }
const near = (a, b, t) => Math.abs(a - b) <= (t == null ? 1.5 : t);
(async () => {
  const page = await CDP.open({ size: SIZE, touch: true, dpr: 1 });
  const { w: W, h: H } = CDP.parseSize(SIZE);
  const E = x => page.evalJs(x);
  const dbg = () => E('VB.Input._debug()');
  const ed = () => E('VB.Input._editState()');
  const wait = ms => CDP.sleep(ms || 60);
  const touch = async (type, pts) => { await page.send('Input.dispatchTouchEvent', { type, touchPoints: pts.map(p => ({ x: p[0], y: p[1], id: p[2], radiusX: 6, radiusY: 6, force: 1 })) }); await wait(50); };
  const drag = async (from, to, id, n) => { n = n || 8; await touch('touchStart', [[from[0], from[1], id]]); for (let i = 1; i <= n; i++) await touch('touchMove', [[from[0] + (to[0] - from[0]) * i / n, from[1] + (to[1] - from[1]) * i / n, id]]); await touch('touchEnd', []); await wait(80); };
  const store = async obj => E(`(function(){ try { localStorage.clear(); ${Object.keys(obj).map(k => `localStorage.setItem(${JSON.stringify(k)}, ${JSON.stringify(JSON.stringify(obj[k]))});`).join('')} } catch (e) {} return 1; })()`);
  const LS = async k => { const v = await E(`localStorage.getItem(${JSON.stringify(k)})`); try { return JSON.parse(v); } catch (e) { return v; } };
  const serve = async () => { await page.navigate('debug=serve&seed=7&nonews=1'); await wait(3500); };
  try {
    // ---------------------------------------------------------------- A) zurdos
    console.log('A) zurdos en partido');
    await page.navigate('nonews=1'); await wait(1500);
    await store({}); await serve();
    let d = await dbg();
    check('de fábrica: overlay visible, sin espejo ni disposición', d.shown && d.mirror === false && d.lay === null, { shown: d.shown, mirror: d.mirror, lay: d.lay });
    check('de fábrica: los botones sin estilos en línea (CSS de siempre)', await E(`['hit','jump','sw','set'].every(function(k){ var e=document.querySelector('#touch .vt-'+k); return !e.style.left && !e.style.width && !e.classList.contains('vt-op'); })`));
    const G0 = d.geo;
    await store({ 'make-the-cut.device': { touchMirror: true } }); await serve();
    d = await dbg();
    const G = d.geo;
    check('zurdos: touchMirror cargado de make-the-cut.device', d.mirror === true && (await E('VB.ctx.settings.touchMirror')) === true);
    for (const k of ['hit', 'jump', 'sw']) check('zurdos: ' + k + ' reflejado (cx = W - cx de fábrica, mismo alto y tamaño)', near(G[k].cx, W - G0[k].cx) && near(G[k].cy, G0[k].cy) && near(G[k].r, G0[k].r), { m: G[k], f: G0[k] });
    check('zurdos: pausa y lupa quietas arriba a la derecha', near(G.pause.cx, G0.pause.cx) && near(G.zoom.cx, G0.zoom.cx) && G.pause.cx > W * 0.8);
    check('zurdos: la guía del joystick, abajo a la derecha', await E(`(function(){ var b=document.querySelector('#touch .vt-base').getBoundingClientRect(); return b.left > innerWidth * 0.6 && b.top > innerHeight * 0.5; })()`));
    // la regla del espejo de .vt-zone se aplica (22-nov: una «}» de más en el @media (max-height:340px) la dejaba muerta)
    check('zurdos: .vt-zone en la mitad derecha (regla #touch.mirror .vt-zone viva)', await E(`(function(){ var z=document.querySelector('#touch .vt-zone'), r=z.getBoundingClientRect(); return getComputedStyle(z).right === '0px' && r.left >= innerWidth * 0.5 - 1; })()`));
    const hit = [G.hit.cx, G.hit.cy], jump = [G.jump.cx, G.jump.cy];
    // joystick en la mitad derecha
    await touch('touchStart', [[W - 180, H - 120, 1]]);
    d = await dbg(); check('dedo en la mitad derecha (fuera de botones): joystick', d.joy !== null && near(d.ox, W - 180, 2), { joy: d.joy, ox: d.ox });
    await touch('touchMove', [[W - 230, H - 120, 1]]); await touch('touchMove', [[W - 260, H - 120, 1]]);
    d = await dbg(); check('lo muevo a la izquierda: mx < -0,5', d.mx < -0.5, { mx: d.mx });
    // joystick + GOLPEAR (a la izquierda) a la vez
    let s0 = d.stats;
    await touch('touchStart', [[W - 260, H - 120, 1], [hit[0], hit[1], 2]]);
    d = await dbg(); check('joystick + GOLPEAR (a la izquierda) a la vez', d.joy !== null && d.hitDown && d.stats.press.hit === s0.press.hit + 1, { joy: d.joy, hitDown: d.hitDown });
    await touch('touchEnd', [[hit[0], hit[1], 2]]);
    await touch('touchEnd', []);
    d = await dbg(); check('suelto todo', d.joy === null && d.ptrs.length === 0 && !d.hitDown);
    // la mitad izquierda ya no es joystick
    await touch('touchStart', [[Math.round(W * 0.3), Math.round(H * 0.35), 3]]);
    d = await dbg(); check('dedo en la mitad izquierda vacía: ni joystick ni botón', d.joy === null && d.ptrs.length === 1 && d.ptrs[0].role === 'none', d.ptrs);
    await touch('touchEnd', []);
    // deslizar SALTAR → GOLPEAR
    s0 = (await dbg()).stats;
    await touch('touchStart', [[jump[0], jump[1], 4]]);
    for (let i = 1; i <= 6; i++) await touch('touchMove', [[jump[0] + (hit[0] - jump[0]) * i / 6, jump[1] + (hit[1] - jump[1]) * i / 6, 4]]);
    d = await dbg(); check('deslizar de SALTAR a GOLPEAR (reflejados): golpe pulsado, salto suelto', d.hitDown && !d.jumpDown && d.stats.slide === s0.slide + 1, { st: d.stats.slide });
    await touch('touchEnd', []);
    // herencia en la mitad derecha
    s0 = (await dbg()).stats;
    await touch('touchStart', [[W - 150, H - 110, 5]]);
    const x2 = Math.round(W * 0.6);
    await touch('touchStart', [[W - 150, H - 110, 5], [x2, H - 160, 6]]);
    await touch('touchEnd', [[W - 150, H - 110, 5]]);
    d = await dbg(); check('el 2.º dedo de la mitad derecha hereda el joystick', d.joy !== null && d.stats.promote === s0.promote + 1 && near(d.ox, x2, 2), { joy: d.joy, ox: d.ox });
    await touch('touchEnd', []);
    // la base no se sale de su zona
    await touch('touchStart', [[W - 4, H - 4, 7]]);
    d = await dbg(); check('joystick nacido en la esquina: base dentro (W - R - 8)', d.joy !== null && d.ox <= W - d.R - 8 + 0.5 && d.oy <= H - d.R - 8 + 0.5, { ox: d.ox, oy: d.oy, R: d.R });
    for (let i = 1; i <= 8; i++) await touch('touchMove', [[W - 4 - i * 60, H - 60, 7]]);
    d = await dbg(); check('arrastrado lejos a la izquierda: la base se para en el 38 % del ancho', d.ox >= W * 0.38 - 0.5, { ox: d.ox });
    await touch('touchEnd', []);
    await page.shot(path.join(OUT, 'touchedit-zurdos-' + SIZE + '.png'));

    // ---------------------------------------------------------------- B) editor
    console.log('B) editor de disposición');
    await store({}); await page.navigate('panel=ctl&tab=touch&nonews=1'); await wait(2500);
    const row = await E(`(function(){ var b=document.querySelector('[data-tedit]'); if(!b||b.closest('[hidden]'))return null; var r=b.getBoundingClientRect(); return {x:r.left+r.width/2,y:r.top+r.height/2,h:r.height,t:b.textContent}; })()`);
    check('Controles › Táctil: fila «Disposición de botones»', !!row && /Disposici/.test(row.t) && row.h >= 44, row);
    if (row) { await touch('touchStart', [[row.x, row.y, 10]]); await touch('touchEnd', []); await wait(300); }
    check('tocar la fila abre el editor', await E('VB.Input.editing()'));
    let e = await ed();
    check('editor: los 4 botones y el joystick colocados, nada elegido salvo GOLPEAR', e && e.P.hit && e.P.jump && e.P.set && e.P.sw && e.P.joy && e.sel === 'hit', e);
    check('editor de fábrica: GOLPEAR en el mismo sitio que en el partido', near(e.P.hit.cx, G0.hit.cx, 2) && near(e.P.hit.cy, G0.hit.cy, 2), { ed: e.P.hit, game: G0.hit });
    await page.shot(path.join(OUT, 'touchedit-editor-' + SIZE + '.png'));
    // arrastrar GOLPEAR al centro-derecha
    const tgt = [Math.round(W * 0.62), Math.round(H * 0.62)];
    await drag([e.P.hit.cx, e.P.hit.cy], tgt, 11);
    e = await ed();
    check('arrastrar GOLPEAR: queda donde se suelta', near(e.P.hit.cx, tgt[0], 2) && near(e.P.hit.cy, tgt[1], 2), e.P.hit);
    check('se guarda en fracciones de la zona segura', e.lay && e.lay.hit && near(e.lay.hit.x, tgt[0] / W, 0.004) && near(e.lay.hit.y, tgt[1] / H, 0.004), e.lay);
    let dv = await LS('make-the-cut.device'), st = await LS('make-the-cut.settings');
    check('guardado al momento en make-the-cut.device', dv && dv.touchLayout && dv.touchLayout.hit && near(dv.touchLayout.hit.x, tgt[0] / W, 0.004), dv);
    check('make-the-cut.settings (se sincroniza) sin touchLayout ni touchMirror', st && !('touchLayout' in st) && !('touchMirror' in st), st && Object.keys(st).filter(k => /touch/.test(k)));
    // clamp: arrastrado fuera de la pantalla
    await drag([e.P.hit.cx, e.P.hit.cy], [W + 40, H + 40], 12);
    e = await ed();
    check('arrastrado fuera: se queda dentro (clamp)', e.P.hit.cx + e.P.hit.r <= W - 4 + 0.5 && e.P.hit.cy + e.P.hit.r <= H - 4 + 0.5, e.P.hit);
    // encima de la pausa: se aparta
    const pz = await E(`(function(){ var b=document.querySelector('.vte .vt-pause'); return { cx: b.offsetLeft + b.offsetWidth/2, cy: b.offsetTop + b.offsetHeight/2, r: b.offsetWidth/2 }; })()`);
    await drag([e.P.hit.cx, e.P.hit.cy], [pz.cx, pz.cy], 13);
    e = await ed();
    check('soltado sobre la pausa: se aparta (no la tapa)', Math.hypot(e.P.hit.cx - pz.cx, e.P.hit.cy - pz.cy) >= e.P.hit.r + pz.r + 5, { hit: e.P.hit, pz });
    // tamaño y opacidad
    const r0 = e.P.hit.r;
    await E(`(function(){ var i=document.querySelector('.vte-s'); i.value='130'; i.dispatchEvent(new Event('input',{bubbles:true})); i.dispatchEvent(new Event('change',{bubbles:true})); return 1; })()`); await wait(80);
    e = await ed();
    const rr = await E(`document.querySelector('.vte .vt-hit').offsetWidth / 2`);
    check('Tamaño 130 %: GOLPEAR 1,3 veces más grande (medido)', e.lay.hit.s === 1.3 && near(e.P.hit.r, r0 * 1.3, 1) && near(rr, r0 * 1.3, 1), { s: e.lay.hit.s, r: e.P.hit.r, rr, r0 });
    await touch('touchStart', [[e.P.jump.cx, e.P.jump.cy, 14]]); await touch('touchEnd', []); await wait(60);
    e = await ed(); check('tocar SALTAR lo elige', e.sel === 'jump');
    await E(`(function(){ var i=document.querySelector('.vte-o'); i.value='50'; i.dispatchEvent(new Event('input',{bubbles:true})); i.dispatchEvent(new Event('change',{bubbles:true})); return 1; })()`); await wait(80);
    e = await ed();
    check('Opacidad 50 % en SALTAR (y solo en SALTAR)', e.lay.jump && e.lay.jump.o === 0.5 && !(e.lay.hit && e.lay.hit.o), e.lay);
    check('SALTAR del editor con la opacidad puesta (filter)', await E(`/opacity\\(0\\.5\\)/.test(getComputedStyle(document.querySelector('.vte .vt-jump')).filter)`));
    // el joystick: solo opacidad
    await touch('touchStart', [[e.P.joy.cx, e.P.joy.cy, 15]]); await touch('touchEnd', []); await wait(60);
    e = await ed(); check('tocar el joystick lo elige (sin tamaño: solo opacidad)', e.sel === 'joy' && (await E(`document.querySelector('.vte-ls').classList.contains('off')`)));
    // zurdos
    const before = e.P.hit.cx;
    await E(`document.querySelector('.vte-mir').click(), 1`); await wait(80);
    e = await ed();
    check('Zurdos: GOLPEAR reflejado y joystick a la derecha', e.mirror && near(e.P.hit.cx, W - before, 1.5) && e.P.joy.cx > W / 2, { hit: e.P.hit.cx, before, joy: e.P.joy });
    check('Zurdos guardado (touchMirror true)', (await E('VB.ctx.settings.touchMirror')) === true && (await LS('make-the-cut.device')).touchMirror === true);
    await page.shot(path.join(OUT, 'touchedit-editor-zurdos-' + SIZE + '.png'));
    // restablecer
    await E(`document.querySelector('.vte-rst').click(), 1`); await wait(80);
    e = await ed();
    check('Restablecer: disposición de fábrica (con zurdos todavía)', e.lay === null && e.mirror === true && (await E('VB.ctx.settings.touchLayout')) === null);
    check('Restablecer + zurdos: GOLPEAR en el reflejo de su sitio de fábrica', near(e.P.hit.cx, W - G0.hit.cx, 2) && near(e.P.hit.cy, G0.hit.cy, 2), { e: e.P.hit, g: G0.hit });
    // Esc cierra y el panel sigue abierto
    await page.send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 });
    await page.send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 }); await wait(200);
    check('Esc cierra el editor y Controles sigue abierto', !(await E('VB.Input.editing()')) && !(await E(`!!document.querySelector('.vte')`)) && (await E('VB.UI.isPanelOpen()')));
    check('la fila dice «Zurdos»', /Zurdos/.test(await E(`document.querySelector('[data-tedit]').textContent`)));

    // ---------------------------------------------------------------- C) lo editado manda en el partido
    console.log('C) disposición propia en partido');
    await store({ 'make-the-cut.device': { touchLayout: { hit: { x: 0.5, y: 0.6, s: 1.2 }, jump: { o: 0.5 } }, touchMirror: false } }); await serve();
    d = await dbg();
    check('partido: GOLPEAR en (0,5 ; 0,6) de la pantalla', near(d.geo.hit.cx, W * 0.5, 2) && near(d.geo.hit.cy, H * 0.6, 2), d.geo.hit);
    check('partido: GOLPEAR al 120 % del de fábrica', near(d.geo.hit.r, G0.hit.r * 1.2, 1.5), { r: d.geo.hit.r, r0: G0.hit.r });
    check('partido: SALTAR en su sitio de fábrica y al 50 % de opacidad', near(d.geo.jump.cx, G0.jump.cx, 1.5) && (await E(`/opacity\\(0\\.5\\)/.test(getComputedStyle(document.querySelector('#touch .vt-jump')).filter)`)), d.geo.jump);
    s0 = d.stats;
    await touch('touchStart', [[W * 0.5, H * 0.6, 20]]);
    d = await dbg(); check('tocar donde está GOLPEAR ahora lo pulsa', d.hitDown && d.stats.press.hit === s0.press.hit + 1);
    await touch('touchEnd', []);
    await touch('touchStart', [[G0.hit.cx, G0.hit.cy, 21]]);
    d = await dbg(); check('el sitio viejo de GOLPEAR ya no golpea', !d.hitDown, d.ptrs);
    await touch('touchEnd', []);
    await page.shot(path.join(OUT, 'touchedit-propia-' + SIZE + '.png'));
    // (22-nov-2026) GOLPEAR movido encima de COLOCAR (la disposición de mobaudit controles-touch-editor-zurdos): COLOCAR se aparta
    await store({ 'make-the-cut.device': { touchLayout: { hit: { x: 0.7, y: 0.55, s: 1.3 } }, touchMirror: true } }); await serve();
    d = await dbg();
    { const a = d.geo.hit, b = d.geo.set, dd = Math.hypot(a.cx - b.cx, a.cy - b.cy);
      check('GOLPEAR movido encima de COLOCAR: no se pisan (COLOCAR se aparta)', dd >= a.r + b.r + 4, { hit: a, set: b, dd: Math.round(dd) });
      check('GOLPEAR se queda donde lo pusiste (manda el movido)', near(a.cx, W - W * 0.7, 3) && near(a.cy, H * 0.55, 3), a); }
    // zonas seguras: el botón pegado al borde respeta el inset
    let saOk = true;
    try { await page.send('Emulation.setSafeAreaInsetsOverride', { insets: { left: 44, right: 44, top: 0, bottom: 21 } }); } catch (er) { saOk = false; }
    if (saOk) {
      await store({ 'make-the-cut.device': { touchLayout: { hit: { x: 1, y: 1 } } } }); await serve();
      d = await dbg();
      check('zona segura: GOLPEAR en la esquina (1 ; 1) no entra en el inset', d.safe.r === 44 && d.geo.hit.cx + d.geo.hit.r <= W - 44 - 4 + 0.5 && d.geo.hit.cy + d.geo.hit.r <= H - 21 - 4 + 0.5, { geo: d.geo.hit, safe: d.safe });
      await page.send('Emulation.setSafeAreaInsetsOverride', { insets: { left: 0, right: 0, top: 0, bottom: 0 } });
    } else console.log('  (sin Emulation.setSafeAreaInsetsOverride: zona segura sin comprobar)');
    // partidas viejas / valores rotos
    for (const bad of ['basura', [1, 2], { hit: { x: 'a', y: null, s: 'grande' } }, { hit: { x: 9, y: -3, s: 40, o: 0 } }, null]) {
      await store({ 'make-the-cut.device': { touchLayout: bad, touchMirror: 'si' } }); await serve();
      d = await dbg();
      const okBad = d.shown && d.mirror === false && page.errors.length === 0 && (bad && bad.hit && bad.hit.x === 9 ? (d.lay && d.lay.hit.x === 1 && d.lay.hit.y === 0 && d.lay.hit.s === 1.5 && d.lay.hit.o === 0.3) : d.lay === null);
      check('valor roto ' + JSON.stringify(bad) + ': carga, sin espejo, saneado', okBad, { lay: d.lay, mirror: d.mirror, err: page.errors.slice(0, 2) });
    }
    if (page.errors.length) { fails++; console.log('ERRORES EN LA PÁGINA:\n' + page.errors.join('\n')); }
  } catch (er) { fails++; console.log('EXCEPCIÓN', er && er.stack || er); }
  page.close();
  console.log((fails ? 'FALLOS: ' + fails : 'TODO OK') + ' (' + oks + ' ok)');
  process.exit(fails ? 1 : 0);
})();
