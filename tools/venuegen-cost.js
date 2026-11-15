#!/usr/bin/env node
/* MAKE THE CUT — tools/venuegen-cost.js (owner: arena)
 * Coste MEDIDO de las sedes generadas de pabellón (plan «sedes-gen», F2-F3) contra la estimación de la receta (VB.VenueGen.cost,
 * tabla COST de js/venue-gen.js) y contra Palau / Can Rebot en el mismo nivel de calidad.
 * Por cada calidad (URL quality=…) abre ?debug=serve y monta una muestra de clubes (club:CC:SIGLAS) como main.js forceVenue;
 * tras 2 fotogramas lee: triángulos de la estática (genStatic) y de la emisiva, dibujos y triángulos de la escena
 * (renderer.info.render) y los dibujos propios de la sede (mallas visibles de su grupo + tinta).
 * Asserts: 0 errores de JS; estática ≤ 40 k; emisiva ≤ 4 k; dibujos propios ≤ 6 (baja) / 9 (media y alta); escena ≤ Palau + 3
 * dibujos y ≤ Palau en triángulos; programas sin subir tras la primera sede generada; y, para los arquetipos con constructor
 * propio (BUILD_AS), estática medida dentro de ±15 % de la estimación en TODAS las calidades (en baja, cost().trisLow: lo que poda
 * lite) (aviso con WARN=1 en vez de fallo).
 * Uso: node tools/venuegen-cost.js [calidades=low,medium,high] [WxH=1280x720]   (CLUBS=IT:PER,PL:SUW… para otra muestra; SAMPLE=b =
 * clubes distintos de los de la calibración)
 */
'use strict';
const CDP = require('./cdp.js');
const QS = (process.argv[2] || 'low,medium,high').split(',').filter(Boolean), SIZE = process.argv[3] || '1280x720';
setTimeout(() => { console.error('TIEMPO AGOTADO'); process.exit(2); }, 600000).unref();
const EXPR = (clubs) => `(async function (clubs) {
  var c = VB.ctx, r = c.renderer, V = VB.Venues, G = VB.VenueGen;
  function wait(ms) { return new Promise(function (res) { setTimeout(res, ms); }); }
  function frames(n) { return new Promise(function (res) { var k = 0; (function f() { if (++k > n) res(); else requestAnimationFrame(f); })(); }); }
  async function go(id) { VB.Arena.onSettings(Object.assign({}, c.settings, { arena: 'hall', forceMap: id }), 'arena'); await wait(500); await frames(3); }
  function own() {
    var g = c.scene.getObjectByName('map-' + VB.Arena.map()), o = { draws: 0, stat: 0, emis: 0 };
    if (g) g.traverse(function (m) { if (!m.visible || !(m.isMesh || m.isPoints)) return; var p = m; while (p) { if (!p.visible) return; p = p.parent; }
      o.draws++; if (m.name === 'genStatic' || m.name === 'canrebotStatic') o.stat = m.geometry.index.count / 3; if (m.name === 'genEmissive') o.emis = m.geometry.index.count / 3; });
    // (la tinta de la estática, genStatic:ink, es hija de genStatic: ya la cuenta el recorrido del grupo. Antes se sumaba otra vez
    // aquí y salían 9 «propios» en media/alta donde hay 8: estática, tinta, emisiva, suelo, público, marcador, rótulos y haces o halos)
    return o;
  }
  function scene() { var i = r.info.render; return { calls: i.calls, tris: i.triangles, prog: (r.info.programs || []).length }; }
  var out = { q: c.quality && c.quality.level, rows: [] };
  await go('palau'); out.palau = scene(); await go('canrebot'); out.canrebot = Object.assign(scene(), own());
  var prog0 = null, seen = {};
  for (var i = 0; i < clubs.length; i++) {
    var id = V.parse('club:' + clubs[i]); if (!id) { out.rows.push({ club: clubs[i], err: 'sin id' }); continue; }
    var t0 = performance.now(); await go(id); var d = VB.Arena.mapDef(id), sp = d && d.spec, est = sp ? G.cost(sp) : null, low = c.quality && c.quality.rank === 0;
    var row = Object.assign({ club: clubs[i], id: id, arch: sp && sp.arch, built: d && (d.built || (d.skin ? 'skin' : '')), est: est && (low && est.trisLow ? est.trisLow : est.tris), estMid: est && est.drawsMid }, own(), scene());
    // programas: solo pueden subir la primera vez que aparece un tipo de luz (haces de sol, halos de noche) o de marcador
    var kind = (sp && sp.p.light) + '/' + (sp && sp.p.score);
    // (se compara con el máximo visto: el número baja y vuelve a subir cuando el motor suelta y recompila un programa que no es de la sede)
    row.progUp = seen[kind] && prog0 != null ? Math.max(0, row.prog - prog0) : 0; seen[kind] = 1; prog0 = Math.max(prog0 == null ? 0 : prog0, row.prog);
    out.rows.push(row);
  }
  return out;
})(${JSON.stringify(clubs)})`;

(async () => {
  let code = 0, page; const warnOnly = process.env.WARN === '1';
  let clubs = process.env.CLUBS ? process.env.CLUBS.split(',') : null;
  try {
    page = await CDP.open({ size: SIZE });
    if (!clubs) {   // muestra: hasta 3 clubes por arquetipo de la receta (H1-H7) repartidos por el mundo
      await page.navigate('debug=menu'); await CDP.sleep(3500);
      // SAMPLE=b: otra muestra (clubes que no se usaron para calibrar la tabla COST)
      const off = process.env.SAMPLE === 'b' ? 0.5 : 1 / 7;
      clubs = await page.evalJs(`(function(){var by={},out=[];VB.Leagues.regions.forEach(function(rg){(rg.countries||[]).forEach(function(co){(co.divisions||[]).forEach(function(d){(d.clubs||[]).forEach(function(k,i){
        var sp=VB.VenueGen.spec(Object.assign({cc:co.code},k),'hall');if(sp.p.skin)return;var a=sp.arch;by[a]=by[a]||[];by[a].push(co.code+':'+k.short);});});});});
        Object.keys(by).sort().forEach(function(a){var L=by[a];for(var j=0;j<3;j++)out.push(L[Math.floor((j*L.length)/3+L.length*${off})%L.length]);});return out;})()`);
    }
    const all = [];
    for (const q of QS) {
      page.errors.length = 0;
      await page.navigate('debug=serve&quality=' + q); await CDP.sleep(5000);
      const v = await page.evalJs(EXPR(clubs), true);
      console.log('\n== calidad ' + v.q + ' · Palau ' + v.palau.calls + ' dibujos / ' + Math.round(v.palau.tris / 1000) + ' k · Can Rebot ' + v.canrebot.calls + ' / ' + Math.round(v.canrebot.tris / 1000) + ' k (propios ' + v.canrebot.draws + ', estática ' + v.canrebot.stat + ')');
      console.log('club        arq→hecho  estát.  estim.   Δ%   emis  propios  escena      prog+');
      const lim = q === 'low' ? 6 : 9;
      for (const r of v.rows) {
        if (r.err) { console.log(r.club + ' ' + r.err); code = 1; continue; }
        const dp = r.est ? Math.round((r.stat - r.est) / r.est * 100) : 0, native = r.arch === r.built;
        const bad = [];
        if (r.stat > 40000) bad.push('estática > 40 k');
        if (r.emis > 4000) bad.push('emisiva > 4 k');
        if (r.draws > lim) bad.push('propios > ' + lim);
        if (r.tris > v.palau.tris) bad.push('triángulos > Palau');
        if (r.calls > v.palau.calls + 3) bad.push('dibujos > Palau + 3');
        if (r.progUp > 0) bad.push('programas +' + r.progUp);
        const costBad = native && Math.abs(dp) > 15;   // (en baja se compara con trisLow: la estimación descuenta la poda de lite)
        console.log((r.club + '        ').slice(0, 11) + ' ' + (r.arch + '→' + r.built + '      ').slice(0, 9) + ' ' + String(r.stat).padStart(6) + ' ' + String(r.est).padStart(7) + ' ' + String(dp).padStart(5) + (native ? ' ' : '*') +
          String(r.emis).padStart(5) + ' ' + String(r.draws).padStart(6) + '   ' + (r.calls + '/' + Math.round(r.tris / 1000) + 'k').padStart(9) + ' ' + String(r.progUp).padStart(5) + (bad.length ? '  ← ' + bad.join(', ') : '') + (costBad ? '  ← coste fuera de ±15 %' : ''));
        if (bad.length) code = 1;
        if (costBad && !warnOnly) code = 1;
        all.push(Object.assign({ q: v.q }, r));
      }
      if (page.errors.length) { console.error('ERRORES EN LA PÁGINA:\n' + page.errors.slice(0, 10).join('\n')); code = 1; }
    }
    console.log('\n(* = arquetipo sin constructor propio todavía: se monta con BUILD_AS; su Δ% no cuenta)');
    console.log(code ? '== HAY FALLOS ==' : '== TODO OK ==');
  } catch (e) { console.error(e && e.message || e); code = 1; }
  if (page) page.close();
  process.exit(code);
})();
