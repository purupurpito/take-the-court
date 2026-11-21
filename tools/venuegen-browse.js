#!/usr/bin/env node
/* TAKE THE COURT — tools/venuegen-browse.js (owner: arena)
 * Recorrido de las sedes GENERADAS de pabellón (plan «sedes-gen», F3) en el navegador (CDP, como venuetest): por cada calidad abre
 * ?debug=serve (cámara de juego) y monta cada sede como main.js forceVenue (VB.Arena.onSettings con forceMap). Por sede y calidad mide:
 *   - ms de setVenue (el montaje es síncrono dentro de onSettings);
 *   - renderer.info.render.calls y triangles tras 2 fotogramas, y los dibujos propios de la sede (mallas visibles de su grupo);
 *   - triángulos de la estática (genStatic) y de la emisiva (genEmissive);
 *   - geometrías, texturas y programas (renderer.info.memory / programs).
 * Asserts: 0 errores de JS; escena ≤ Palau en ese nivel (dibujos y triángulos; H9: + la cúpula, 1 dibujo); dibujos propios ≤ 6 en
 * baja y ≤ 9 en media/alta; estática ≤ 40 k y emisiva ≤ 4 k; programas sin subir tras la primera sede generada (salvo la primera vez
 * que sale un tipo de luz, de marcador o la cúpula de H9: sus materiales compilan una variante); vuelta a la base (Palau) con
 * tolerancia 0 en geometrías, texturas y programas al final de cada lote; montaje ≤ 120 ms en el PC y AVISO a partir de 400 ms con la
 * CPU ×4 (pasada aparte en baja, la de los móviles; NO4=1 la salta).
 * Muestra por defecto: 2 clubes por país (el primero y el del medio de su lista en VB.Leagues) + la primera piel H8 y la primera H9.
 * ALL=1: los 390 clubes, por lotes de 50 (página nueva por lote y calidad; tope de 600 s por lote). CLUBS=IT:PER,PL:SUW… = esa lista.
 * Salidas: tools/out/gen/report.json (todo) y tools/out/gen/stats.csv (las 10 peores de cada métrica).
 * Uso: node tools/venuegen-browse.js [calidades=low,medium,high] [WxH=1280x720]   Sale con 1 si algo falla.
 */
'use strict';
const fs = require('fs'), path = require('path');
const CDP = require('./cdp.js');
const QS = (process.argv[2] || 'low,medium,high').split(',').filter(Boolean), SIZE = process.argv[3] || '1280x720';
const ALL = process.env.ALL === '1', BATCH = 50, BATCH_MS = 600000, NO4 = process.env.NO4 === '1';
const OUT = path.join(__dirname, 'out', 'gen');
const LIM = { ownLow: 6, ownMid: 9, stat: 40000, emis: 4000, ms: 120, ms4: 400 };

/** En la página: lista de clubes (muestra o todos). */
function pickClubs(all) {
  var out = [], skin = { H8: null, H9: null };
  VB.Leagues.regions.forEach(function (rg) {
    (rg.countries || []).forEach(function (co) {
      var L = [];
      (co.divisions || []).forEach(function (d) { (d.clubs || []).forEach(function (k) { L.push([co.code + ':' + k.short, k]); }); });
      L.forEach(function (e, i) {
        if (all || i === 0 || i === Math.floor(L.length / 2)) out.push(e[0]);
        var sp = VB.VenueGen.spec(Object.assign({ cc: co.code }, e[1]), 'hall');
        if (skin[sp.arch] === null) skin[sp.arch] = e[0];
      });
    });
  });
  if (!all) ['H8', 'H9'].forEach(function (a) { if (skin[a] && out.indexOf(skin[a]) < 0) out.push(skin[a]); });
  return out;
}

/** En la página: monta un lote de sedes y mide. */
async function runBatch(clubs, timeOnly) {
  var c = VB.ctx, r = c.renderer, V = VB.Venues, G = VB.VenueGen;
  function wait(ms) { return new Promise(function (res) { setTimeout(res, ms); }); }
  function frames(n) { return new Promise(function (res) { var k = 0; (function f() { if (++k > n) res(); else requestAnimationFrame(f); })(); }); }
  function mem() { return { geo: r.info.memory.geometries, tex: r.info.memory.textures, prog: (r.info.programs || []).length }; }
  function scene() { var i = r.info.render; return { calls: i.calls, tris: i.triangles }; }
  function go(id) { var t0 = performance.now(); VB.Arena.onSettings(Object.assign({}, c.settings, { arena: V.kindOf(id), forceMap: id }), 'arena'); return performance.now() - t0; }
  async function settle() { await wait(250); await frames(2); }
  function own() {
    var g = c.scene.getObjectByName('map-' + VB.Arena.map()), o = { own: 0, stat: 0, emis: 0, dome: 0 };
    if (g) g.traverse(function (m) {
      if (!m.visible || !(m.isMesh || m.isPoints)) return; var p = m; while (p) { if (!p.visible) return; p = p.parent; }
      o.own++; if (m.name === 'genStatic') o.stat = m.geometry.index.count / 3; if (m.name === 'genEmissive') o.emis = m.geometry.index.count / 3;
      if (m.name === 'genDome') o.dome = m.geometry.index.count / 3;
    });
    return o;
  }
  go('palau'); await settle(); go('platja'); await settle(); go('palau'); await wait(500); await frames(3);
  var base = mem(), palau = scene(), rows = [], seen = {}, progMax = null;
  for (var i = 0; i < clubs.length; i++) {
    var id = V.parse('club:' + clubs[i]);
    if (!id) { rows.push({ club: clubs[i], err: 'sin id' }); continue; }
    var ms = go(id); await settle();
    var d = VB.Arena.mapDef(id), sp = d && d.spec, row = { club: clubs[i], id: id, arch: sp && sp.arch, flavor: sp && sp.flavor || '', skin: !!(d && d.skin), ms: Math.round(ms * 10) / 10 };
    if (VB.Arena.map() !== id) row.err = 'no montó (está ' + VB.Arena.map() + ')';
    if (!timeOnly) {
      Object.assign(row, own(), scene(), mem());
      // programas: solo pueden subir la primera vez que sale un tipo de luz / marcador / cúpula (variantes de los materiales del kit)
      var kind = sp ? (d.skin ? 'skin' + (sp.p.oculus ? '-dome' : '') : sp.p.light + '/' + sp.p.score + (sp.night ? '/n' : '')) : '?';
      row.progUp = seen[kind] && progMax != null ? Math.max(0, row.prog - progMax) : 0; seen[kind] = 1;
      progMax = Math.max(progMax == null ? 0 : progMax, row.prog);
    }
    rows.push(row);
  }
  go('palau'); await wait(500); await frames(3);
  return { q: c.quality && c.quality.level, base: base, end: mem(), palau: palau, rows: rows };
}

function chunk(a, n) { const o = []; for (let i = 0; i < a.length; i += n) o.push(a.slice(i, i + n)); return o; }
function withTimeout(p, ms, what) { let t; return Promise.race([p, new Promise((_, rej) => { t = setTimeout(() => rej(new Error('tiempo agotado: ' + what)), ms); })]).finally(() => clearTimeout(t)); }

(async () => {
  let code = 0;
  const report = { date: new Date().toISOString(), size: SIZE, qualities: QS, all: ALL, palau: {}, rows: [], batches: [], fails: [], warns: [] };
  function fail(m) { report.fails.push(m); code = 1; }
  function warn(m) { report.warns.push(m); }
  let clubs = process.env.CLUBS ? process.env.CLUBS.split(',') : null;
  const nBatches = clubs ? Math.ceil(clubs.length / BATCH) : ALL ? 8 : 2;
  setTimeout(() => { console.error('TIEMPO AGOTADO'); process.exit(2); }, (QS.length + (NO4 ? 0 : 1)) * nBatches * BATCH_MS + 120000).unref();
  try {
    if (!clubs) {
      const page = await CDP.open({ size: SIZE });
      await page.navigate('debug=menu'); await CDP.sleep(3500);
      clubs = await page.evalJs('(' + pickClubs.toString() + ')(' + ALL + ')');
      page.close();
    }
    const batches = chunk(clubs, BATCH);
    console.log('sedes: ' + clubs.length + ' en ' + batches.length + ' lote(s) × ' + QS.join(', ') + (NO4 ? '' : ' + CPU ×4 en baja'));
    const passes = QS.map(q => ({ q, cpu: 1 })).concat(NO4 ? [] : [{ q: 'low', cpu: 4 }]);
    for (const ps of passes) {
      for (let b = 0; b < batches.length; b++) {
        const page = await CDP.open({ size: SIZE });
        try {
          await page.navigate('debug=serve&quality=' + ps.q); await CDP.sleep(5000);
          if (ps.cpu > 1) await page.send('Emulation.setCPUThrottlingRate', { rate: ps.cpu });
          const v = await withTimeout(page.evalJs('(' + runBatch.toString() + ')(' + JSON.stringify(batches[b]) + ',' + (ps.cpu > 1) + ')', true), BATCH_MS, 'lote ' + (b + 1) + ' ' + ps.q);
          const tag = ps.cpu > 1 ? 'cpu4' : v.q;
          report.batches.push({ q: tag, batch: b + 1, base: v.base, end: v.end, palau: v.palau });
          if (ps.cpu === 1) report.palau[v.q] = v.palau;
          const leak = v.base.geo !== v.end.geo || v.base.tex !== v.end.tex || v.base.prog !== v.end.prog;
          console.log('\n== ' + tag + ' · lote ' + (b + 1) + '/' + batches.length + ' · Palau ' + v.palau.calls + ' dibujos / ' + Math.round(v.palau.tris / 1000) + ' k · base ' + JSON.stringify(v.base) + ' → fin ' + JSON.stringify(v.end) + (leak ? '  ← FUGA' : ''));
          if (leak) fail(tag + ' lote ' + (b + 1) + ': no vuelve a la base ' + JSON.stringify(v.base) + ' → ' + JSON.stringify(v.end));
          if (ps.cpu === 1) console.log('club        arq  flavor   ms   propios  estát.  emis  escena        geo/tex/prog  prog+');
          for (const r of v.rows) {
            const key = r.club + ' ' + tag;
            if (r.err) { fail(key + ': ' + r.err); console.log(r.club + ' ' + r.err); continue; }
            if (ps.cpu > 1) {
              const row = report.rows.find(x => x.club === r.club && x.q === 'low') || null;
              if (row) row.ms4 = r.ms; else report.rows.push({ club: r.club, id: r.id, arch: r.arch, q: 'low', ms4: r.ms });
              if (r.ms >= LIM.ms4) warn(key + ': montaje ' + r.ms + ' ms con CPU ×4 (≥ ' + LIM.ms4 + ')');
              continue;
            }
            const bad = [], lowQ = v.q === 'low', dome = r.dome ? 1 : 0;
            if (r.ms > LIM.ms) bad.push('montaje ' + r.ms + ' ms > ' + LIM.ms);
            if (!r.skin && r.own > (lowQ ? LIM.ownLow : LIM.ownMid)) bad.push('propios ' + r.own + ' > ' + (lowQ ? LIM.ownLow : LIM.ownMid));
            if (r.skin && r.own > dome) bad.push('piel con ' + r.own + ' dibujos propios');
            if (r.calls > v.palau.calls + dome) bad.push('dibujos ' + r.calls + ' > Palau ' + v.palau.calls + (dome ? ' + 1' : ''));
            if (r.tris > v.palau.tris + r.dome) bad.push('triángulos ' + Math.round(r.tris / 1000) + ' k > Palau ' + Math.round(v.palau.tris / 1000) + ' k');
            if (r.stat > LIM.stat) bad.push('estática > 40 k');
            if (r.emis > LIM.emis) bad.push('emisiva > 4 k');
            if (r.progUp > 0) bad.push('programas +' + r.progUp);
            bad.forEach(m => fail(key + ': ' + m));
            report.rows.push(Object.assign({ q: v.q }, r));
            console.log((r.club + '        ').slice(0, 11) + ' ' + (r.arch + '   ').slice(0, 4) + ' ' + (r.flavor + '       ').slice(0, 7) + String(r.ms).padStart(6) + String(r.own).padStart(7) + String(r.stat).padStart(9) +
              String(r.emis).padStart(6) + '  ' + (r.calls + '/' + Math.round(r.tris / 1000) + 'k').padStart(10) + '  ' + (r.geo + '/' + r.tex + '/' + r.prog).padStart(13) + String(r.progUp).padStart(6) + (bad.length ? '  ← ' + bad.join(', ') : ''));
          }
          if (ps.cpu > 1) { const ms = v.rows.map(r => r.ms).sort((a, b) => b - a); console.log('montaje con CPU ×4: máx ' + ms[0] + ' ms, mediana ' + ms[Math.floor(ms.length / 2)] + ' ms'); }
          if (page.errors.length) { fail(tag + ' lote ' + (b + 1) + ': errores de JS: ' + page.errors.slice(0, 5).join(' | ')); console.error('ERRORES EN LA PÁGINA:\n' + page.errors.slice(0, 10).join('\n')); }
        } catch (e) { fail(ps.q + ' lote ' + (b + 1) + ': ' + (e && e.message || e)); console.error(e && e.message || e); }
        page.close();
      }
    }
  } catch (e) { fail(String(e && e.message || e)); console.error(e && e.message || e); }
  // salidas
  fs.mkdirSync(OUT, { recursive: true });
  fs.writeFileSync(path.join(OUT, 'report.json'), JSON.stringify(report, null, 1));
  const metrics = [['ms', 'ms de setVenue'], ['ms4', 'ms con CPU ×4 (baja)'], ['calls', 'dibujos de la escena'], ['tris', 'triángulos de la escena'], ['own', 'dibujos propios'], ['stat', 'triángulos de la estática'], ['emis', 'triángulos de la emisiva']];
  const csv = ['metrica,puesto,club,id,arquetipo,calidad,valor'];
  for (const [m] of metrics) {
    report.rows.filter(r => r[m] != null).sort((a, b) => b[m] - a[m]).slice(0, 10).forEach((r, i) => csv.push([m, i + 1, r.club, r.id, r.arch, r.q, r[m]].join(',')));
  }
  fs.writeFileSync(path.join(OUT, 'stats.csv'), csv.join('\n') + '\n');
  console.log('\n' + path.relative(path.join(__dirname, '..'), path.join(OUT, 'report.json')) + ' · ' + path.relative(path.join(__dirname, '..'), path.join(OUT, 'stats.csv')));
  if (report.warns.length) console.log('AVISOS (' + report.warns.length + '):\n  ' + report.warns.slice(0, 20).join('\n  '));
  if (report.fails.length) console.log('FALLOS (' + report.fails.length + '):\n  ' + report.fails.slice(0, 40).join('\n  '));
  console.log(code ? '== HAY FALLOS ==' : '== TODO OK ==');
  process.exit(code);
})();
