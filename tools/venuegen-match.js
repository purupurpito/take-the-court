#!/usr/bin/env node
/* VOLEY 3D — tools/venuegen-match.js  (owner: arena; plan «sedes-gen» F5)
 * Qué sede sale en cada partido de la Carrera, en el juego real (Chrome headless, como tools/eval.js): crea una Carrera de pista
 * (semilla 3, a prueba en la 1ª española) y una de playa, arranca partidos con ctx.actions.startCareerMatch y mira VB.Arena.map(), el
 * nombre en la presentación y en el marcador, y que la sim juega en 'hall' / 'beach'. Las rondas de copa se prueban sustituyendo
 * VB.Career.next() sobre la jornada real (kind/comp/label). Uso: node tools/venuegen-match.js [WxH=1280x720]. Sale con 1 si algo falla.
 */
'use strict';
const CDP = require('./cdp.js');
const SIZE = process.argv[2] || '1280x720';
const EXPR = String.raw`
(async function () {
  var C = VB.Career, A = VB.ctx.actions, out = [], sl = function (ms) { return new Promise(function (r) { setTimeout(r, ms); }); };
  var realNext = Object.getOwnPropertyDescriptor(C, 'next');
  async function play(tag, n, expect) {
    if (n.fake) Object.defineProperty(C, 'next', { configurable: true, enumerable: true, get: function () { return function () { return n; }; } });
    A.startCareerMatch(); await sl(1500);
    var map = VB.Arena.map(), d = VB.VENUES[map] || {}, intro = (document.querySelector('#intro .in-k') || {}).textContent || '', sb = (document.querySelector('.sb-venue') || {}).textContent || '';
    var r = { tag: tag, label: n.label, atHome: n.atHome, home: (n.home.cc || '') + ':' + (n.home.short || n.home.name), beach: n.home.beach, map: map, name: d.name, tier: d.tier, intro: intro, sb: sb, gameVenue: VB.ctx.game && VB.ctx.game.venue, state: VB.ctx.state };
    r.ok = !!expect(r, d); out.push(r);
    A.toMenu(); await sl(500);
    if (n.fake) Object.defineProperty(C, 'next', realNext);
    r.after = VB.Arena.map();
  }
  var gen = function (cc) { return function (r, d) { return d.gen && r.map.indexOf('g-' + cc + '-') === 0 && r.intro.indexOf(r.name) === 0 && r.sb === r.name.toUpperCase() && r.gameVenue === 'hall'; }; };
  try {
    var c6 = C.create({ mode: 'hall', name: 'Prueba Sede', num: 9, pos: 'OH', seed: 3, points: 15 });
    C.acceptOffer(c6.offers.findIndex(function (o) { return o.trial; }), 2);
    var n = C.next(c6);
    await play('debut T1J1', n, function (r) { return r.map === 'canrebot'; });
    C.simulateNext(); n = C.next(c6);   // J2 fuera
    await play('fuera', n, gen(n.home.cc));
    C.simulateNext(); n = C.next(c6);   // J3 casa
    await play('casa', n, gen(n.home.cc));
    var base = n;
    function fake(over) { var x = Object.assign({}, base, over); x.fake = true; return x; }
    await play('final copa nacional', fake({ kind: 'ko', comp: 'cup', label: 'Copa de la Corona · Final', week: 0 }), function (r) { return r.map === 'palau'; });
    await play('final continental', fake({ kind: 'ko', comp: 'intl', label: 'Champions Cup · Final', week: 0 }), function (r) { return r.map === 'cupula'; });
    await play('cuartos continental (local 1ª)', fake({ kind: 'ko', comp: 'intl', label: 'Champions Cup · Cuartos', week: 0 }), function (r, d) { return gen(base.home.cc)(r, d) && d.tier >= 3; });
    await play('semifinal copa nacional', fake({ kind: 'ko', comp: 'cup', label: 'Copa de la Corona · Semifinal', week: 0 }), gen(base.home.cc));
    // playa
    var cb = C.create({ mode: 'beach', name: 'Prueba Playa', seed: 4321, autoClub: true });
    var nb = C.next(cb);
    await play('playa jornada', nb, function (r, d) { return d.gen && r.name === nb.home.beach && r.gameVenue === 'beach'; });
    C.simulateNext(); nb = C.next(cb);
    await play('playa jornada 2', nb, function (r, d) { return d.gen && r.name === nb.home.beach && r.gameVenue === 'beach'; });
    var bb = nb;
    var fb = function (o) { var x = Object.assign({}, bb, o); x.fake = true; return x; };
    await play('Open nivel 0', fb({ kind: 'cup', label: 'Open de Arenalta · Semifinal', me: Object.assign({}, bb.me, { lvl: 0 }) }), function (r) { return r.map === 'platja'; });
    await play('Open nivel 3', fb({ kind: 'cup', label: 'Open · Semifinal', me: Object.assign({}, bb.me, { lvl: 3 }) }), function (r) { return r.map === 'moll'; });
    await play('Open final', fb({ kind: 'cup', label: 'Open · Final', me: Object.assign({}, bb.me, { lvl: 1 }) }), function (r) { return r.map === 'fanals'; });
    out.push({ gens: VB.Venues.generated('hall').concat(VB.Venues.generated('beach')), info: VB.ctx.renderer.info.memory, progs: VB.ctx.renderer.info.programs.length });
  } catch (e) { out.push({ err: String(e && e.stack || e) }); }
  return JSON.stringify(out);
})()
`;
setTimeout(() => { console.error('TIEMPO AGOTADO'); process.exit(2); }, 150000).unref();
(async () => {
  let code = 0, page;
  try {
    page = await CDP.open({ size: SIZE });
    await page.navigate(''); await CDP.sleep(6000);
    const out = JSON.parse(await page.evalJs(EXPR, true));
    for (const r of out) {
      if (r.ok === undefined) { console.log(JSON.stringify(r)); if (r.err) code = 1; continue; }
      if (!r.ok) code = 1;
      console.log((r.ok ? 'ok   ' : 'MAL  ') + r.tag + ' | ' + r.label + ' | local ' + r.home + ' | ' + r.map + ' t' + r.tier + ' | ' + r.name + ' | ' + r.gameVenue + ' | luego ' + r.after);
    }
    if (page.errors.length) { code = 1; console.error('ERRORES EN LA PÁGINA:\n' + page.errors.slice(0, 10).join('\n')); }
  } catch (e) { console.error(e && e.message || e); code = 1; }
  if (page) page.close();
  console.log(code ? '== FALLOS ==' : '== TODO OK ==');
  process.exit(code);
})();
