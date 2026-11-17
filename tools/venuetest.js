#!/usr/bin/env node
/* MAKE THE CUT — tools/venuetest.js (owner: arena)
 * Ciclo de sedes sin fugas: en el menú (con la demo de fondo) recorre N vueltas de todas las sedes disponibles
 * (VB.Venues.list: pabellones y playas) como lo hace main.js al forzar una sede (onSettings de arena) y vuelve a Palau del Mar.
 * Al final renderer.info.memory.geometries / textures y el número de programas deben volver a los de partida (tolerancia 0).
 * Uso: [Q=low|medium|high] node tools/venuetest.js [vueltas=3] [WxH=960x540]   (SETTINGS=1: por ctx.actions.setSetting, que rehace la demo
 *      del menú con equipaciones al azar: el número de texturas de los atletas puede variar ±1-2 sin que haya fuga)
 *      GEN=n: además, n sedes GENERADAS por vuelta (js/venue-gen*.js; ids club:CC:SIGLAS, 3 de pista por cada 1 de playa, con al
 *      menos una piel de Palau H8/H9): con más de 4 por tipo la cola LRU de js/venues.js olvida las viejas (unregisterMap).
 * Sale con 1 si hay fugas o errores de JS en la página.
 */
'use strict';
const CDP = require('./cdp.js');
const LAPS = +(process.argv[2] || 3), SIZE = process.argv[3] || '960x540', GEN = +(process.env.GEN || 0);
setTimeout(() => { console.error('TIEMPO AGOTADO'); process.exit(2); }, 250000 + LAPS * GEN * 3000).unref();
const EXPR = `(async function (laps, ngen) {
  var c = VB.ctx, r = c.renderer, A = c.actions, V = VB.Venues, DIRECT = ${process.env.SETTINGS === '1' ? 'false' : 'true'};
  function wait(ms) { return new Promise(function (res) { setTimeout(res, ms); }); }
  function mem() { return { geo: r.info.memory.geometries, tex: r.info.memory.textures, prog: (r.info.programs || []).length, map: VB.Arena.map() }; }
  async function go(id) {
    var kind = V.kindOf(id);
    // como main.js forceVenue (sin rehacer la demo: su equipación al azar cambia el número de texturas de los atletas)
    if (DIRECT) VB.Arena.onSettings(Object.assign({}, c.settings, { arena: kind, forceMap: id }), 'arena');
    else { A.setSetting(kind === 'beach' ? 'mapBeach' : 'mapHall', id); A.setSetting('arena', kind); }
    await wait(700);
    if (VB.Arena.map() !== id) throw new Error('no montó ' + id + ' (está ' + VB.Arena.map() + ')');
  }
  var seq = V.list('hall').concat(V.list('beach'));
  // sedes generadas: clubes de VB.Leagues repartidos por el mundo (las primeras de pista, pieles de Palau H8/H9 si las hay)
  var gens = [];
  if (ngen > 0 && VB.VenueGen && V.parse) {
    var all = [], skin = [], plain = [];
    VB.Leagues.regions.forEach(function (rg) { (rg.countries || []).forEach(function (co) { (co.divisions || []).forEach(function (d) { (d.clubs || []).forEach(function (k) { all.push({ cc: co.code, name: k.name, city: k.city, short: k.short }); }); }); }); });
    for (var a = 0; a < all.length && (skin.length < 2 || plain.length < ngen); a += 7) {
      var sp = VB.VenueGen.spec(all[a], 'hall');
      (sp.p.skin === 'palau' ? skin : plain).push(all[a].cc + ':' + all[a].short);
    }
    var hallN = Math.max(1, ngen - Math.floor(ngen / 4)), pickH = skin.slice(0, 2).concat(plain).slice(0, hallN), pi = 0;
    for (var gi = 0; gi < ngen; gi++) gens.push(gi % 4 === 3 ? 'club:' + plain[(plain.length - 1 - gi) % plain.length] + ':b' : 'club:' + pickH[pi++ % pickH.length]);
  }
  async function goGen(str) { var id = V.parse(str); if (!id) throw new Error('no se generó ' + str); await go(id); return id; }
  // (base tras las fuentes y unos fotogramas más: un lienzo repintado con document.fonts.ready o una textura aún sin subir al tomar la
  //  base daba, de vez en cuando, una textura de diferencia sin fuga real: revisión de F3, 6 de 6 pasadas limpias con Q=low GEN=8)
  function frames(n) { return new Promise(function (res) { var k = 0; (function f() { if (++k > n) res(); else requestAnimationFrame(f); })(); }); }
  async function settle() { try { if (document.fonts && document.fonts.ready) await document.fonts.ready; } catch (e) { } await wait(500); await frames(4); }
  await go('palau'); await go('platja'); await go('palau'); await settle();
  var base = mem(), log = [];
  for (var l = 0; l < laps; l++) {
    for (var i = 0; i < seq.length; i++) { await go(seq[i]); log.push(seq[i] + ':' + JSON.stringify(mem())); }
    for (var j = 0; j < gens.length; j++) { var gid = await goGen(gens[j]); log.push(gens[j] + ' ' + gid + ':' + JSON.stringify(mem())); }
    await go('palau');
  }
  await settle();
  // (las pieles de los atletas, athleteSkin0..3: lienzos 1024², se rehacen al cambiar de sede y alguna se sube a la GPU unos
  //  fotogramas tarde: el fin daba a veces una textura MENOS que la base (2 de 5 pasadas, revisión de F5), que vuelve sola en
  //  ~1-3 s. Si el fin no cuadra se espera hasta 4 s más; una fuga de verdad no baja sola y sigue fallando)
  var extra = 0;
  for (var sw = 0; sw < 8; sw++) { var m = mem(); if (m.geo === base.geo && m.tex === base.tex && m.prog === base.prog) break; extra++; await settle(); }
  if (extra) log.push('fin tras ' + extra + ' esperas más (subida tardía de texturas)');
  return { seq: seq, gens: gens, base: base, end: mem(), log: log, reg: { hall: V.generated('hall'), beach: V.generated('beach'), maps: VB.Arena.maps().length,
    venues: Object.keys(VB.VENUES).length } };
})(${LAPS}, ${GEN})`;
(async () => {
  let code = 0, page;
  try {
    page = await CDP.open({ size: SIZE });
    await page.navigate('map=hall&seed=7' + (process.env.Q ? '&quality=' + process.env.Q : '')); await CDP.sleep(5000);   // (Q=low: impostores del público de las generadas)
    const v = await page.evalJs(EXPR, true);
    console.log('sedes:', v.seq.join(' → '));
    if (v.gens.length) console.log('generadas:', v.gens.join(' → ')); if (v.gens.length) console.log('registro al final:', JSON.stringify(v.reg));
    if (v.gens.length && (v.reg.hall.length > 4 || v.reg.beach.length > 4)) { console.log('== LRU: más de 4 sedes generadas por tipo =='); code = 1; }
    for (const ln of v.log) console.log('  ' + ln);
    console.log('base:', JSON.stringify(v.base)); console.log('fin: ', JSON.stringify(v.end));
    const ok = v.base.geo === v.end.geo && v.base.tex === v.end.tex && v.base.prog === v.end.prog;
    console.log(ok ? '== sin fugas ==' : '== FUGA ==');
    if (!ok) code = 1;
    if (page.errors.length) { console.error('ERRORES EN LA PÁGINA:\n' + page.errors.slice(0, 10).join('\n')); code = 1; }
  } catch (e) { console.error(e && e.message || e); code = 1; }
  if (page) page.close();
  process.exit(code);
})();
