#!/usr/bin/env node
/* TAKE THE COURT — tools/a11ymarktest.js (owner: ui_main)
 * Imprescindibles 4.6 «Marca del jugador controlado de tamaño ajustable» y 4.7 «Indicador de caída graduable» (notes/ui_main.md «Marca de tu jugador e indicador de caída»).
 * Con Chrome (tools/cdp.js), de una en una:
 *   a) ajustes: valores por defecto (normal / auto / auto), partidas viejas sin las claves y valores corruptos → por defecto
 *   b) VB.FX.landAidOf: auto = siempre en Fácil/Normal, se retira en Difícil/Experto; los explícitos mandan
 *   c) en un rally vivo (debug=rally): la marca escala ×0,8 / ×1 / ×1,4 (Players._marker().k) y cambia a alto contraste (hc);
 *      el aro de caída (landMarker) sale con «Siempre», sale menos con «Se retira» (y solo en el último tramo) y nunca con «No»;
 *      el aro amarillo de golpeo (focusRing) sigue saliendo con «No»
 *   d) Ajustes › Accesibilidad a 568×320 y 844×390: las tres filas visibles, la vista previa sigue al ajuste y la ayuda del indicador
 *      dice lo que hace ahora; aviso de una línea en la fila Dificultad al pasar de Normal a Difícil con «Auto»
 *   e) sin errores JS
 * Uso: node tools/a11ymarktest.js
 */
'use strict';
const CDP = require('./cdp.js');
const sleep = CDP.sleep;
let bad = 0, n = 0;
const ok = (c, m, extra) => { n++; if (c) console.log('  ok   ' + m); else { bad++; console.log('  FALLO ' + m + (extra ? ' — ' + extra : '')); } };
const waitFor = async (pg, expr, ms) => { const t = Date.now(); while (Date.now() - t < ms) { try { if (await pg.evalJs(expr)) return true; } catch (e) { } await sleep(100); } return false; };
const ready = pg => waitFor(pg, 'window.VB&&VB.ctx&&VB.ctx.state&&VB.UI', 25000);
const J = async (pg, js) => { const r = await pg.evalJs('JSON.stringify((function(){' + js + '})())'); try { return JSON.parse(r); } catch (e) { return { err: String(r) }; } };

// (el aro de caída no cuelga de la escena: lo pinta el lote de calcomanías; se busca en VB.FX._dbg().decOrder)
// cuenta, durante ms, los frames con el aro de caída / el aro amarillo visibles y el tiempo al bote más largo con el aro de caída
const COUNT = ms => `(function(){return new Promise(function(res){var sc=VB.ctx.scene,lm=sc.getObjectByName('landMarker')||(VB.FX._dbg().decOrder||[]).filter(function(o){return o&&o.name==='landMarker';})[0],fr=sc.getObjectByName('focusRing'),o={f:0,lm:0,fr:0,maxT:0},t0=performance.now(),L={x:0,y:0,z:0,t:0};
  (function tick(){var g=VB.ctx.game;o.f++;if(lm&&lm.visible){o.lm++;if(g&&VB.Sim.predictLanding){VB.Sim.predictLanding(g,L);if(L.t>o.maxT)o.maxT=L.t;}}if(fr&&fr.visible)o.fr++;
  if(performance.now()-t0<${ms})requestAnimationFrame(tick);else res(JSON.stringify(o));})();});})()`;

(async () => {
  let pg;
  try {
    // ---------------------------------------------------------------- a) ajustes
    console.log('a) ajustes');
    pg = await CDP.open({ size: '1280x720' });
    await pg.navigate(''); await ready(pg);
    let s = await J(pg, 'var s=VB.ctx.settings;return {m:s.ctrlMark,c:s.ctrlMarkCol,l:s.landAid}');
    ok(s.m === 'normal' && s.c === 'auto' && s.l === 'auto', 'por defecto: marca normal, sin contraste, indicador auto', JSON.stringify(s));
    // partida vieja (sin las claves) y valores corruptos
    await pg.evalJs(`localStorage.setItem('make-the-cut.settings', JSON.stringify({difficulty:'hard', setPoints:21, ctrlMark:'gigante', ctrlMarkCol:7, landAid:'quizá'}))`);
    await pg.navigate(''); await ready(pg);
    s = await J(pg, 'var s=VB.ctx.settings;return {m:s.ctrlMark,c:s.ctrlMarkCol,l:s.landAid,d:s.difficulty,p:s.setPoints}');
    ok(s.m === 'normal' && s.c === 'auto' && s.l === 'auto' && s.d === 'hard' && s.p === 21, 'valores corruptos → por defecto; lo demás se conserva', JSON.stringify(s));
    await pg.evalJs(`localStorage.setItem('make-the-cut.settings', JSON.stringify({difficulty:'normal', ctrlMark:'large', ctrlMarkCol:'contraste', landAid:'retira'}))`);
    await pg.navigate(''); await ready(pg);
    s = await J(pg, 'var s=VB.ctx.settings;return {m:s.ctrlMark,c:s.ctrlMarkCol,l:s.landAid}');
    ok(s.m === 'large' && s.c === 'contraste' && s.l === 'retira', 'los valores buenos sobreviven a la recarga', JSON.stringify(s));
    await pg.evalJs(`localStorage.setItem('make-the-cut.settings', JSON.stringify({difficulty:'normal'}))`);
    await pg.navigate(''); await ready(pg);
    s = await J(pg, 'var s=VB.ctx.settings;return {m:s.ctrlMark,c:s.ctrlMarkCol,l:s.landAid}');
    ok(s.m === 'normal' && s.c === 'auto' && s.l === 'siempre', 'partida vieja sin las claves nuevas: marca por defecto y el aro de caída entero (siempre, no auto: 22-nov)', JSON.stringify(s));

    // ---------------------------------------------------------------- b) landAidOf
    console.log('b) VB.FX.landAidOf');
    const la = await J(pg, "var f=VB.FX.landAidOf;return [f('auto','easy'),f('auto','normal'),f('auto','hard'),f('auto','expert'),f('siempre','expert'),f('retira','easy'),f('no','easy'),f('raro','hard'),f(undefined,'normal')]");
    ok(JSON.stringify(la) === JSON.stringify(['siempre', 'siempre', 'retira', 'retira', 'siempre', 'retira', 'no', 'retira', 'siempre']), 'auto/explícitos/corruptos', JSON.stringify(la));
    await pg.close(); pg = null;

    // ---------------------------------------------------------------- c) en partido
    console.log('c) rally vivo (debug=rally)');
    pg = await CDP.open({ size: '1280x720' });
    await pg.navigate('debug=rally&live=1&quality=low'); await ready(pg);
    await waitFor(pg, 'VB.ctx.game&&VB.Players&&VB.Players._marker&&VB.Players._marker()', 15000); await sleep(1500);
    const setS = (k, v) => pg.evalJs(`VB.ctx.actions.setSetting(${JSON.stringify(k)}, ${JSON.stringify(v)}); true`);
    const ks = {};
    for (const v of ['small', 'normal', 'large']) { await setS('ctrlMark', v); await sleep(250); ks[v] = await J(pg, 'return VB.Players._marker()'); }
    ok(ks.small.k === 0.8 && ks.normal.k === 1 && ks.large.k === 1.4, 'marca ×0,8 / ×1 / ×1,4', JSON.stringify([ks.small.k, ks.normal.k, ks.large.k]));
    await setS('ctrlMarkCol', 'contraste'); await sleep(250);
    let mk = await J(pg, 'return VB.Players._marker()');
    ok(mk.hc === true && mk.halo > 0, 'alto contraste: halo y galón cambian (hc)', JSON.stringify(mk));
    await setS('ctrlMarkCol', 'auto'); await sleep(250);
    mk = await J(pg, 'return VB.Players._marker()');
    ok(mk.hc === false, 'vuelve al normal sin contraste', JSON.stringify(mk));
    await setS('ctrlMark', 'normal');
    const diff = await pg.evalJs('VB.ctx.game.difficulty');
    const cnt = {};
    for (const v of ['siempre', 'retira', 'no']) {
      await setS('landAid', v); await sleep(200);
      try { cnt[v] = JSON.parse(await pg.evalJs(COUNT(14000), true)); } catch (e) { cnt[v] = { err: String(e) }; }
      console.log('       ' + v + ': ' + JSON.stringify(cnt[v]));
    }
    ok(cnt.siempre.lm > 20, '«Siempre»: el aro de caída sale (' + cnt.siempre.lm + ' frames)');
    ok(cnt.retira.lm > 0 && cnt.retira.lm / cnt.retira.f < cnt.siempre.lm / cnt.siempre.f, '«Se retira»: sale, y menos que con «Siempre»', JSON.stringify([cnt.retira.lm / cnt.retira.f, cnt.siempre.lm / cnt.siempre.f]));
    ok(cnt.retira.maxT <= 0.85, '«Se retira»: solo en el último tramo del vuelo (t al bote ≤ 0,8 s)', 'máx ' + cnt.retira.maxT);
    ok(cnt.no.lm === 0, '«No»: nunca sale el aro de caída', cnt.no.lm + ' frames');
    ok(cnt.siempre.fr + cnt.retira.fr + cnt.no.fr === 0 || cnt.no.fr > 0, '«No»: el aro amarillo de golpeo sigue saliendo', JSON.stringify([cnt.siempre.fr, cnt.retira.fr, cnt.no.fr]) + ' (dificultad ' + diff + ')');
    await setS('landAid', 'auto');
    ok(pg.errors.length === 0, 'sin errores JS en partido', pg.errors.slice(0, 3).join(' | '));
    await pg.close(); pg = null;

    // ---------------------------------------------------------------- d) Ajustes › Accesibilidad en el móvil
    for (const size of ['568x320', '844x390']) {
      console.log('d) Ajustes › Accesibilidad a ' + size);
      pg = await CDP.open({ size, touch: true });
      await pg.navigate('debug=settings&panel=set&nonews=1'); await ready(pg); await sleep(2500);
      await pg.evalJs(`VB.ctx.actions.setSetting('difficulty','normal'); VB.ctx.actions.setSetting('landAid','auto'); true`);
      const opened = await J(pg, `var t=document.getElementById('setTabs-a11y'); if(t) t.click(); return !!t`);
      await sleep(500);
      const vis = await J(pg, `var r={};['ctrlMark','ctrlMarkCol','landAid'].forEach(function(k){var e=document.querySelector('#optList [data-opt="'+k+'"]');if(!e){r[k]='falta';return;}var R=e.getBoundingClientRect();r[k]=!e.hidden&&R.width>0?Math.round(R.width):'oculta';});return r`);
      ok(opened && typeof vis.ctrlMark === 'number' && typeof vis.ctrlMarkCol === 'number' && typeof vis.landAid === 'number', 'las tres filas se ven', JSON.stringify(vis));
      const noScroll = await J(pg, 'return document.documentElement.scrollWidth<=innerWidth+1');
      ok(noScroll, 'sin desplazamiento horizontal');
      // la vista previa cabe dentro de su fila y sigue al ajuste
      await pg.evalJs(`VB.ctx.actions.setSetting('ctrlMark','large'); VB.ctx.actions.setSetting('ctrlMarkCol','contraste'); true`); await sleep(200);
      let pv = await J(pg, `var p=document.querySelector('#optList .a11y-pv[data-pv="mark"]'),row=p.closest('.opt').getBoundingClientRect(),R=p.getBoundingClientRect();return {k:p.style.getPropertyValue('--k'),hc:p.classList.contains('hc'),inRow:R.left>=row.left-1&&R.right<=row.right+1&&R.top>=row.top-1&&R.bottom<=row.bottom+1,w:R.width}`);
      ok(pv.k === '1.4' && pv.hc && (pv.w === 0 ? size === '568x320' : pv.inRow && pv.w >= 24), 'vista previa de la marca: grande y de contraste, dentro de la fila (a 568×320 no cabe y no sale)', JSON.stringify(pv));
      await pg.evalJs(`VB.ctx.actions.setSetting('ctrlMark','normal'); VB.ctx.actions.setSetting('ctrlMarkCol','auto'); VB.ctx.actions.setSetting('landAid','no'); true`); await sleep(200);
      pv = await J(pg, `var p=document.querySelector('#optList .a11y-pv[data-pv="land"]'),sm=document.querySelector('#optList [data-opt="landAid"] small');return {m:p.getAttribute('data-m'),h:sm.textContent}`);
      ok(pv.m === 'no' && /aro amarillo/.test(pv.h), '«No»: la vista previa sin aro y la ayuda avisa de que el aro amarillo sigue', JSON.stringify(pv));
      await pg.evalJs(`VB.ctx.actions.setSetting('landAid','auto'); true`); await sleep(200);
      pv = await J(pg, `var sm=document.querySelector('#optList [data-opt="landAid"] small');return sm.textContent`);
      ok(/^Auto \(Normal\)/.test(pv), 'ayuda de «Auto» con la dificultad de ahora', pv);
      // aviso de una línea al subir la dificultad con «Auto»
      await pg.evalJs(`VB.ctx.actions.setSetting('difficulty','hard'); true`); await sleep(250);
      const dh = await J(pg, `var e=document.getElementById('diffHelp');return e?e.textContent:''`);
      ok(/aro de caída/i.test(dh), 'Dificultad → Difícil con «Auto»: aviso «' + dh + '»');
      await J(pg, `var e=document.querySelector('#optList [data-opt="ctrlMark"]'); if(e) e.scrollIntoView({block:'start'}); return 1`); await sleep(300);
      try { await pg.shot(require('path').join(CDP.ROOT, 'tools', 'out', 'a11ymark-' + size + '.png')); } catch (e) { }
      await pg.evalJs(`VB.ctx.actions.setSetting('difficulty','normal'); true`);
      ok(pg.errors.length === 0, 'sin errores JS (' + size + ')', pg.errors.slice(0, 3).join(' | '));
      await pg.close(); pg = null;
    }
  } catch (e) { bad++; console.log('  FALLO excepción: ' + (e && e.stack || e)); }
  finally { if (pg) try { pg.close(); } catch (e) { } }
  console.log(bad ? `== a11ymarktest: ${bad} FALLOS de ${n} ==` : `== a11ymarktest OK (${n} comprobaciones) ==`);
  process.exit(bad ? 1 : 0);
})();
