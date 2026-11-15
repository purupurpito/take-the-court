#!/usr/bin/env node
/* VOLEY 3D — tools/animtest.js (owner: players)
 * E2 (sprint 5): variedad de la animación medida en partidos autopilot reales (por DevTools, tools/cdp.js).
 * Juega partidos de N s (pabellón y playa, varias semillas) llamando a VB.Players.update con los eventos de la sim y muestrea
 * VB.Players._anim en cada frame. Comprueba (spec E2 §6.2):
 *   - contactos: >= 6 cvar distintos por partido; 'dig' en >= 80 % de los hit.dig; spikeLine y spikeCross; 'pokey' con cada hit.pokey
 *   - plancha: 'miss' con cada dive.miss; 'side' >= 1 en el total
 *   - aterrizaje: 'stumble' en >= 50 % de los saques en salto; playa: <= 1 llamada a FX.dust por caída
 *   - celebraciones: >= 14 variantes distintas en total; 0 repeticiones seguidas por jugador
 *   - espera: >= 3 'idle' distintos por jugador (en total); ningún idle en 'rally' ni en el sacador
 *   - dejar pasar: 'leave' solo con la decisión de la IA (g._lv / VB.AI.leaving) en los 0,35 s anteriores
 *   - firma y rival: con setSignature/setRival salen 'firma', 'pique' o 'rabia'
 *   - gimnasio (si la sim tiene drills): tras drillStage, sin dvar/lvar ni celebración
 * S3 (sprint 234, T17: S3-C2 personalidad en pista y S3-C5 saludo de pareja), partidos completos a 11 en el pabellón:
 *   - neutro: con setMate(null), setBoss(null) y setPairChem(0) la secuencia de celebraciones (celV por punto, contactos de drainFx y
 *     celId del cierre) da la huella NEUTRAL_FP (la de antes de T17) y nunca hay convergencia de tipo 6
 *   - ganchos: setMate({fuego, martillo, grito}) y setBoss({n.º 1 rival, muralla, manotazo}): 'firma' con su sigId en el compañero y en el
 *     jefe; 'grito' del compañero solo con su error, bloqueado o set perdido; 'manotazo' del jefe solo en punto grande, set o error
 *     suyo; 0 repetidas seguidas; cierre con 'matchSig' en el ganador con firma y 'matchRage' antes de 'matchKneel'/'matchHeads' en el
 *     que pierde con rabia (el jefe que pierde, de rodillas)
 *   - pareja: setPairChem(3) + _pair(6) → en el siguiente punto tuyo cvType 6 y drainFx highfive, highfive, fistbump (0,24-0,32 s entre
 *     los dos primeros); setPairChem(2) → tipo 6 solo en set o highlight >= bigAt; 6v6 con setPairChem(3): nunca tipo 6
 *   - celebraciones con hash (R12): la misma semilla repetida da la misma secuencia
 *   NEUTRAL_FP=imprimir: solo imprime la huella neutra (para fijarla con VB_ROOT=<copia de antes>). S3=0 se salta esta parte.
 * Uso: node tools/animtest.js [s=240] [semillas=7,99] [mapas=hall,beach] [diff=hard]
 * Sale con 1 si algo falla. Imprime "TODO OK".
 */
'use strict';
const CDP = require('./cdp.js');
const [SECS = '240', SEEDS = '7,99', MAPS = 'hall,beach', DIFF = 'hard'] = process.argv.slice(2);
// huella neutra (S3): la de players.js antes de T17 (sprint 234, 15-nov-2026), partidos a 11, semillas 7 y 99, pabellón, 'hard'
const NEUTRAL_FP = 'a0837b709e6d3e5b';

function page(SECS, SEED, DIFF, VENUE, SIG, RIVAL) {
  var ctx = VB.ctx, S = VB.Sim, P = VB.Players, orig = P.__orig || P.update; P.__orig = orig;
  P.update = function () { if (window.__on) return orig.apply(P, arguments); };   // el bucle de main.js no pinta mientras medimos
  ctx.frozen = true;
  P.setVenue(VENUE === 'beach' ? 'beach' : 'hall');
  if (P.setSignature) P.setSignature(SIG || '');
  var g = S.createGame({ demo: false, autopilot: true, seed: SEED, difficulty: DIFF, venue: VENUE === 'beach' ? 'beach' : undefined }); ctx.game = g;
  if (P.setRival) P.setRival(RIVAL ? g.teams[1][0].num : -1);
  ['Arena', 'FX', 'Players'].forEach(function (m) { try { VB[m].onGameStart && VB[m].onGameStart(g); } catch (e) { } });
  var dustN = 0, dust0 = VB.FX && VB.FX.dust;
  if (dust0) VB.FX.dust = function () { dustN++; return dust0.apply(VB.FX, arguments); };
  var R = { cv: {}, cvN: 0, dig: [0, 0], pokey: [0, 0], line: 0, cross: 0, miss: [0, 0], side: 0, dv: {}, js: [0, 0], lvN: {}, dustBad: 0, lands: 0,
    cel: {}, celRep: 0, idle: {}, idleBad: [], leaveBad: 0, leaveN: 0, lvOnN: 0, fx: {}, firma: 0, pique: 0, rabia: 0, pts: 0, err: '' };
  var lastCel = [], lvT = [-9, -9], pending = [], ev = [], fxo = [];
  function A(p) { return P._anim(p); }
  try {
    for (var s = 0; s < 120 * SECS && !g.finished; s++) {
      S.step(g, 1 / 120, null); S.drainEvents(g, ev);
      if (s % 2) continue;
      // decisión de dejar pasar de la IA (para comparar con leave)
      for (var t = 0; t < 2; t++) {
        var on = false;
        if (VB.AI && VB.AI.leaving) on = !!VB.AI.leaving(g, t);
        else { var L = g._lv && g._lv[t]; on = !!(L && L.on && L.t === g.lastTouchT); }
        if (on) { lvT[t] = g.time; R.lvOnN++; }
      }
      var d0 = dustN, landsF = 0;
      for (var j = 0; j < ev.length; j++) if (ev[j].type === 'landPlayer') landsF++;
      window.__on = true;
      try { orig.call(P, g, 1 / 60, ev); } finally { window.__on = false; }
      if (VENUE === 'beach' && landsF) { R.lands += landsF; if (dustN - d0 > landsF) R.dustBad++; }
      fxo.length = 0; P.drainFx(fxo); for (var f = 0; f < fxo.length; f++) R.fx[fxo[f].type] = (R.fx[fxo[f].type] || 0) + 1;
      for (j = 0; j < ev.length; j++) {
        var e = ev[j], a = e.player ? A(e.player) : null;
        if (e.type === 'hit' && a) {
          if (a.cvar) { R.cv[a.cvar] = (R.cv[a.cvar] || 0) + 1; }
          if (e.dig) { R.dig[1]++; if (a.cvar === 'dig') R.dig[0]++; }
          if (e.pokey) { R.pokey[1]++; if (a.cvar === 'pokey') R.pokey[0]++; }
          if (a.cvar === 'spikeLine') R.line++; if (a.cvar === 'spikeCross') R.cross++;
          if (e.kind === 'serve' && e.shot === 'jump') pending.push({ p: e.player, t: g.time, k: 'js' });
        }
        if (e.type === 'dive' && a) { R.dv[a.dvar] = (R.dv[a.dvar] || 0) + 1; if (e.miss) { R.miss[1]++; if (a.dvar === 'miss') R.miss[0]++; } if (a.dvar === 'side') R.side++; }
        if (e.type === 'landPlayer' && a) {
          R.lvN[a.lvar] = (R.lvN[a.lvar] || 0) + 1;
          for (var q = pending.length - 1; q >= 0; q--) if (pending[q].p === e.player && pending[q].k === 'js') { R.js[1]++; if (a.lvar === 'stumble') R.js[0]++; pending.splice(q, 1); }
        }
        if (e.type === 'point' && !e.matchWon) {
          R.pts++;
          for (var k = 0; k < g.players.length; k++) {
            var ak = A(g.players[k]), id = ak.celV || ak.celId;
            if (!id) continue;
            R.cel[id] = (R.cel[id] || 0) + 1;
            if (lastCel[k] === id) R.celRep++;
            lastCel[k] = id;
            if (id === 'firma') R.firma++; if (id === 'pique') R.pique++; if (id === 'rabia') R.rabia++;
          }
        }
      }
      ev.length = 0;
      for (var pi = 0; pi < g.players.length; pi++) {
        var pl = g.players[pi], an = A(pl);
        if (an.idle) {
          var ki = pl.team + ':' + pl.idx; (R.idle[ki] = R.idle[ki] || {})[an.idle] = 1;
          if (g.mode === 'rally' || (g.mode === 'serve' && g.server === pl)) if (R.idleBad.length < 5) R.idleBad.push([g.mode, an.idle, pl.id]);
        }
        if (an.leave) { R.leaveN++; if (g.time - lvT[pl.team] > 0.35) R.leaveBad++; }
      }
    }
  } catch (e) { R.err = String(e && e.stack || e).slice(0, 400); }
  if (dust0) VB.FX.dust = dust0;
  R.time = +g.time.toFixed(1);
  return JSON.stringify(R);
}

function gymPage(SEED) {
  var ctx = VB.ctx, S = VB.Sim, P = VB.Players, orig = P.__orig || P.update; P.__orig = orig;
  P.update = function () { if (window.__on) return orig.apply(P, arguments); };
  if (!S.drillStage || !VB.DRILL) return JSON.stringify({ skip: 'sin drills en la sim' });
  ctx.frozen = true; P.setVenue('');
  var out = { kinds: {}, bad: [], stages: 0 };
  ['atk', 'block', 'recv'].forEach(function (kind) {
    var g; try { g = S.createGame({ demo: false, autopilot: true, seed: SEED, difficulty: 'normal', drill: kind }); } catch (e) { out.bad.push(kind + ': ' + e); return; }
    if (!g.drill) { out.bad.push(kind + ': sin g.drill'); return; }
    ctx.game = g; ['Arena', 'FX', 'Players'].forEach(function (m) { try { VB[m].onGameStart && VB[m].onGameStart(g); } catch (e) { } });
    var ev = [], n = 0, cel = 0;
    for (var s = 0; s < 120 * 90 && !g.drill.done; s++) {
      S.step(g, 1 / 120, null); S.drainEvents(g, ev); if (s % 2) continue;
      var st = ev.some(function (e) { return e.type === 'drillStage'; });
      window.__on = true; try { orig.call(P, g, 1 / 60, ev); } finally { window.__on = false; }
      ev.length = 0;
      for (var i = 0; i < g.players.length; i++) {
        var a = P._anim(g.players[i]);
        if (st && (a.dvar || a.lvar || a.celV || a.idle)) out.bad.push(kind + ' tras drillStage: ' + JSON.stringify(a));
        if (a.idle) out.bad.push(kind + ': idle en el gimnasio');
      }
      if (st) { n++; out.stages++; }
    }
    out.kinds[kind] = n;
  });
  out.bad = out.bad.slice(0, 6);
  return JSON.stringify(out);
}

/** S3: partido completo (pabellón, a 11) con los ganchos de MODE: 'neutral' | 'hooks' | 'pair2' | 'pair6' | 'six'. */
function s3Page(SEED, DIFF, MODE) {
  var ctx = VB.ctx, S = VB.Sim, P = VB.Players, orig = P.__orig || P.update; P.__orig = orig;
  P.update = function () { if (window.__on) return orig.apply(P, arguments); };
  ctx.frozen = true;
  P.setVenue('hall');
  if (P.setSignature) P.setSignature('');
  var six = MODE === 'six';
  var g = S.createGame({ demo: false, autopilot: true, seed: SEED, difficulty: DIFF, points: 11, format: six ? '6v6' : undefined }); ctx.game = g;
  if (P.setRival) P.setRival(-1);
  var api = !!(P.setMate && P.setBoss && P.setPairChem);
  if (api) {
    P.setMate(MODE === 'hooks' ? { num: g.teams[0][1].num, pers: 'fuego', sig: 'martillo', rage: 'grito' } : null);
    P.setBoss(MODE === 'hooks' ? { idx: 0, num: g.teams[1][0].num, fit: null, style: 'muro', pers: 'fuego', sig: 'muralla', rage: 'manotazo' } : null);
    P.setPairChem(MODE === 'pair6' || six ? 3 : MODE === 'pair2' ? 2 : 0);
  }
  ['Arena', 'FX', 'Players'].forEach(function (m) { try { VB[m].onGameStart && VB[m].onGameStart(g); } catch (e) { } });
  var bigAt = VB.HOLD && VB.HOLD.bigAt != null ? VB.HOLD.bigAt : 0.55;
  var R = { api: api, pts: 0, fp: 0, fpN: 0, t6: 0, t6bad: 0, celRep: 0, mateSig: 0, bossSig: 0, grito: 0, gritoBad: [], mano: 0, manoBad: [], close: {}, closeSeq: {},
    winTeam: -1, pair: null, err: '', time: 0, cel: {}, mw: [], long6: 0 };
  var h = 0x811c9dc5 >>> 0;
  function fp(str) { for (var i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; } R.fpN++; }
  var ev = [], fxo = [], lastCel = [], wonAt = -1, endT = -1, pairArm = MODE === 'pair6', pairWatch = null;
  if (pairArm && api) P._pair(6);
  function A(p) { return P._anim(p); }
  var mate = g.teams[0][1], boss = g.teams[1][0];
  try {
    for (var s = 0; s < 120 * 1500; s++) {
      if (endT < 0 && g.finished) endT = g.time;
      if (endT >= 0 && g.time - endT > 4) break;
      S.step(g, 1 / 120, null); S.drainEvents(g, ev);
      if (s % 2) continue;
      window.__on = true;
      try { orig.call(P, g, 1 / 60, ev); } finally { window.__on = false; }
      fxo.length = 0; P.drainFx(fxo);
      for (var f = 0; f < fxo.length; f++) {
        if (fxo[f].type === 'call') continue;
        fp('x' + fxo[f].type);
        if (pairWatch && pairWatch.fx.length < 6 && fxo[f].team === 0) pairWatch.fx.push([fxo[f].type, +(g.time - pairWatch.t).toFixed(3), +fxo[f].z.toFixed(2)]);
      }
      for (var j = 0; j < ev.length; j++) {
        var e = ev[j];
        if (e.type !== 'point') continue;
        R.pts++;
        var cvs = '';
        for (var k = 0; k < g.players.length; k++) {
          var ak = A(g.players[k]), id = ak.celV || ak.celId || '';
          fp('p' + k + ':' + (e.matchWon ? 'M' + id : id));
          if (ak.cvType === 6) { R.t6++; cvs = '6'; }
          if (e.matchWon || !id) continue;
          R.cel[id] = (R.cel[id] || 0) + 1;
          if (lastCel[k] === id) R.celRep++;
          lastCel[k] = id;
          var pl = g.players[k];
          if (pl === mate && id === 'firma' && ak.sigId === 'martillo') R.mateSig++;
          if (pl === boss && id === 'firma' && ak.sigId === 'muralla') R.bossSig++;
          if (id === 'grito') { R.grito++; if (pl !== mate || !(e.player === mate || e.how === 'block' || e.setWon)) R.gritoBad.push([pl.team, pl.idx, e.how, e.reason, !!e.setWon]); }
          if (id === 'manotazo') { R.mano++; if (pl !== boss || !(e.setWon || (e.highlight || 0) >= bigAt || e.player === boss)) R.manoBad.push([pl.team, pl.idx, e.how, +(e.highlight || 0).toFixed(2), !!e.setWon]); }
        }
        // tipo 6 fuera de su sitio: sin química, en 6v6, o con nivel 2 en un punto que no es grande
        if (cvs === '6' && (MODE === 'neutral' || MODE === 'hooks' || six || (MODE === 'pair2' && !e.matchWon && !(e.setWon || (e.highlight || 0) >= bigAt)) || e.team !== 0)) R.t6bad++;
        if (pairArm && e.team === 0 && !e.matchWon) { pairArm = false; pairWatch = { t: g.time, type: A(g.teams[0][0]).cvType, fx: [] }; }
        if (e.matchWon && cvs === '6') R.long6 = 1;
        if (e.matchWon) { wonAt = g.time; R.winTeam = e.team; R.mw.push(+g.time.toFixed(2)); }
      }
      ev.length = 0;
      if (wonAt >= 0) for (var q = 0; q < g.players.length; q++) {
        var aq = A(g.players[q]), kq = g.players[q].team + ':' + g.players[q].idx, sq = R.closeSeq[kq] = R.closeSeq[kq] || [];
        if (aq.celId && sq[sq.length - 1] !== aq.celId) { sq.push(aq.celId); fp('c' + kq + aq.celId); }
      }
    }
  } catch (e) { R.err = String(e && e.stack || e).slice(0, 400); }
  R.fp = ('00000000' + h.toString(16)).slice(-8);
  R.pair = pairWatch; R.time = +g.time.toFixed(1); R.finished = !!g.finished;
  if (api) { P.setMate(null); P.setBoss(null); P.setPairChem(0); }
  return JSON.stringify(R);
}

(async () => {
  const pg = await CDP.open({ size: '640x360' });
  let bad = 0;
  const fail = (m) => { bad++; console.log('  FALLO ' + m); };
  const tot = { cel: {}, idle: {}, side: 0, celRep: 0 };
  const runs = [];
  for (const map of MAPS.split(',')) for (const sd of SEEDS.split(',')) runs.push({ map, sd: +sd });
  let i = 0;
  for (const r of runs) {
    await pg.navigate('debug=rally&quality=low' + (r.map === 'beach' ? '&map=beach' : ''));
    await CDP.sleep(2500);
    // 1r partido de cada mapa con firma; el 2º con rival personal
    const sig = i % 2 === 0 ? 'saludo' : '', riv = i % 2 === 1;
    const res = await pg.evalJs('(' + page.toString() + `)(${+SECS}, ${r.sd}, '${DIFF}', '${r.map}', '${sig}', ${riv})`);
    i++;
    let o; try { o = JSON.parse(res); } catch (e) { fail('respuesta: ' + String(res).slice(0, 200)); continue; }
    const cvN = Object.keys(o.cv).length;
    console.log(`[${r.map} semilla ${r.sd}] ${o.time} s, ${o.pts} puntos${sig ? ', firma «' + sig + '»' : ''}${riv ? ', rival personal' : ''}`);
    console.log('  cvar ' + JSON.stringify(o.cv));
    console.log('  dive ' + JSON.stringify(o.dv) + '  land ' + JSON.stringify(o.lvN) + '  fx ' + JSON.stringify(o.fx));
    console.log('  cel  ' + JSON.stringify(o.cel));
    if (o.err) fail('excepción: ' + o.err);
    if (cvN < 6) fail(`solo ${cvN} cvar distintos (>= 6)`);
    if (o.dig[1] && o.dig[0] / o.dig[1] < 0.8) fail(`dig ${o.dig[0]}/${o.dig[1]} (< 80 %)`); else console.log(`  ok dig ${o.dig[0]}/${o.dig[1]}`);
    if (!(o.line > 0 && o.cross > 0)) fail(`remates paralela ${o.line} / diagonal ${o.cross} (deben salir los dos)`); else console.log(`  ok paralela ${o.line} · diagonal ${o.cross}`);
    if (o.pokey[0] !== o.pokey[1]) fail(`pokey ${o.pokey[0]}/${o.pokey[1]}`); else if (o.pokey[1]) console.log(`  ok pokey ${o.pokey[0]}/${o.pokey[1]}`);
    if (o.miss[0] !== o.miss[1]) fail(`plancha fallida ${o.miss[0]}/${o.miss[1]}`); else console.log(`  ok plancha fallida ${o.miss[0]}/${o.miss[1]}`);
    if (o.js[1] && o.js[0] / o.js[1] < 0.5) fail(`stumble en saque en salto ${o.js[0]}/${o.js[1]} (< 50 %)`); else console.log(`  ok stumble en saque en salto ${o.js[0]}/${o.js[1]}`);
    if (r.map === 'beach') { if (o.dustBad) fail(`polvo: ${o.dustBad} caídas con más de una llamada a FX.dust (de ${o.lands})`); else console.log(`  ok polvo <= 1 por caída (${o.lands} caídas)`); }
    if (o.idleBad.length) fail('idle fuera de la espera: ' + JSON.stringify(o.idleBad));
    if (o.leaveBad) fail(`leave sin decisión de la IA: ${o.leaveBad} frames (de ${o.leaveN})`); else console.log(`  ok leave ${o.leaveN} frames, siempre con la IA dejándola (IA ${o.lvOnN})`);
    if (sig && !o.firma) fail('la firma no salió'); else if (sig) console.log(`  ok firma ${o.firma}`);
    if (riv && !(o.pique + o.rabia)) fail('el rival personal no hizo pique ni rabia'); else if (riv) console.log(`  ok rival: pique ${o.pique} · rabia ${o.rabia}`);
    for (const k in o.cel) tot.cel[k] = (tot.cel[k] || 0) + o.cel[k];
    for (const k in o.idle) { tot.idle[k] = tot.idle[k] || {}; Object.assign(tot.idle[k], o.idle[k]); }
    tot.side += o.side; tot.celRep += o.celRep;
  }
  const celN = Object.keys(tot.cel).length;
  console.log('[total] celebraciones ' + celN + ' distintas: ' + JSON.stringify(tot.cel));
  if (celN < 14) fail(`solo ${celN} celebraciones distintas (>= 14)`);
  if (tot.celRep) fail(`${tot.celRep} celebraciones repetidas seguidas`); else console.log('  ok 0 repetidas seguidas');
  if (!tot.side) fail('ninguna plancha lateral'); else console.log(`  ok planchas laterales ${tot.side}`);
  const idleS = Object.keys(tot.idle).map(k => k + ':' + Object.keys(tot.idle[k]).length);
  console.log('  idle por jugador ' + JSON.stringify(tot.idle));
  for (const k in tot.idle) if (Object.keys(tot.idle[k]).length < 3) fail(`jugador ${k}: ${Object.keys(tot.idle[k]).length} idle distintos (>= 3)`);
  if (Object.keys(tot.idle).length < 4) fail('menos de 4 jugadores con gestos de espera: ' + idleS.join(' '));
  // S3 (T17): personalidad en pista y saludo de pareja
  if (process.env.S3 !== '0') {
    const s3 = async (sd, mode) => {
      await pg.navigate('debug=rally&quality=low'); await CDP.sleep(2000);
      const res = await pg.evalJs('(' + s3Page.toString() + `)(${sd}, '${DIFF}', '${mode}')`);
      try { return JSON.parse(res); } catch (e) { fail('S3 respuesta: ' + String(res).slice(0, 200)); return null; }
    };
    // neutro: huella de las dos semillas
    let nfp = '', napi = true;
    for (const sd of [7, 99]) {
      const o = await s3(sd, 'neutral'); if (!o) continue;
      if (o.err) fail('S3 neutro: ' + o.err);
      napi = napi && o.api;
      nfp += o.fp;
      console.log(`[S3 neutro semilla ${sd}] ${o.time} s, ${o.pts} puntos, ${o.finished ? 'acabado' : 'SIN ACABAR'}, gana ${o.winTeam}, huella ${o.fp} (${o.fpN} trazas), cierre ${JSON.stringify(o.closeSeq)}`);
      if (o.t6) fail(`S3 neutro: ${o.t6} convergencias de tipo 6 sin química`);
    }
    if (process.env.NEUTRAL_FP === 'imprimir') { console.log('NEUTRAL_FP ' + nfp); pg.close(); process.exit(0); }
    if (nfp === NEUTRAL_FP) console.log(`  ok huella neutra idéntica a la de antes de T17 (${nfp})`);
    else fail(`huella neutra ${nfp} (antes de T17: ${NEUTRAL_FP})`);
    if (!napi) fail('S3: faltan setMate / setBoss / setPairChem');
    // ganchos: compañero y jefe (varias semillas: hace falta un cierre ganado por cada lado)
    const won = {}; let mateSig = 0, bossSig = 0, grito = 0, mano = 0, rep = 0;
    for (const sd of [7, 99, 5, 11]) {
      if (won[0] && won[1] && sd !== 99 && sd !== 7) break;
      const o = await s3(sd, 'hooks'); if (!o) continue;
      if (o.err) fail('S3 ganchos: ' + o.err);
      console.log(`[S3 ganchos semilla ${sd}] ${o.time} s, ${o.pts} puntos, gana ${o.winTeam}: firma compañero ${o.mateSig} · firma jefe ${o.bossSig} · grito ${o.grito} · manotazo ${o.mano}`);
      console.log('  cel  ' + JSON.stringify(o.cel));
      console.log('  cierre ' + JSON.stringify(o.closeSeq));
      mateSig += o.mateSig; bossSig += o.bossSig; grito += o.grito; mano += o.mano; rep += o.celRep;
      if (o.gritoBad.length) fail('grito del compañero fuera de su sitio: ' + JSON.stringify(o.gritoBad.slice(0, 4)));
      if (o.manoBad.length) fail('manotazo del jefe fuera de su sitio: ' + JSON.stringify(o.manoBad.slice(0, 4)));
      if (o.t6) fail(`S3 ganchos: ${o.t6} convergencias de tipo 6 sin química`);
      if (o.winTeam === 0 || o.winTeam === 1) {
        const W = o.winTeam, wk = W === 0 ? '0:1' : '1:0', lk = W === 0 ? '1:0' : '0:1';   // ganador con firma / perdedor con rabia
        const ws = o.closeSeq[wk] || [], ls = o.closeSeq[lk] || [];
        if (ws.indexOf('matchSig') < 0) fail(`cierre: el ganador con firma (${wk}) no hizo matchSig: ${JSON.stringify(ws)}`);
        const ri = ls.indexOf('matchRage'), ki = ri < 0 ? -1 : ls.indexOf(W === 0 ? 'matchKneel' : 'matchHeads', ri);
        if (ri < 0 || ki < ri) fail(`cierre: el que pierde con rabia (${lk}) no hizo matchRage y luego ${W === 0 ? 'matchKneel' : 'matchHeads'}: ${JSON.stringify(ls)}`);
        if (W === 0 && (o.closeSeq['1:1'] || []).indexOf('matchKneel') >= 0) fail('cierre: con jefe, el otro rival también se arrodilla');
        if (ws.indexOf('matchSig') >= 0 && ri >= 0 && ki > ri) { won[W] = 1; console.log(`  ok cierre: ${wk} matchSig · ${lk} ${ls.join(' → ')}`); }
      }
    }
    if (!mateSig) fail('la firma del compañero (martillo) no salió'); else console.log(`  ok firma del compañero ${mateSig} · del jefe ${bossSig}`);
    if (!bossSig) fail('la firma del jefe (muralla) no salió');
    if (!grito) fail('la rabia del compañero (grito) no salió'); else console.log(`  ok rabias: grito ${grito} · manotazo ${mano}, siempre en su sitio`);
    if (!mano) fail('la rabia del jefe (manotazo) no salió');
    if (rep) fail(`S3 ganchos: ${rep} celebraciones repetidas seguidas`); else console.log('  ok 0 repetidas seguidas con ganchos');
    if (!won[0]) fail('cierre: ningún partido ganado por tu equipo (jefe que pierde)');
    if (!won[1]) console.log('  (aviso) ningún cierre ganado por el jefe en estas semillas');
    // pareja
    const p6 = await s3(99, 'pair6');
    if (p6) {
      if (p6.err) fail('S3 pareja: ' + p6.err);
      const w = p6.pair, fx = w ? w.fx.slice(0, 3) : [];
      console.log(`[S3 pareja nivel 3 + _pair(6)] tipo ${w && w.type} · contactos ${JSON.stringify(fx)} · tipo 6 en ${p6.t6} jugadores-punto de ${p6.pts} puntos`);
      const okSeq = fx.length === 3 && fx[0][0] === 'highfive' && fx[1][0] === 'highfive' && fx[2][0] === 'fistbump';
      const dt01 = okSeq ? fx[1][1] - fx[0][1] : -1;
      if (!w || w.type !== 6) fail('pareja: _pair(6) no dio cvType 6 en el punto siguiente');
      else if (!okSeq) fail('pareja: contactos ' + JSON.stringify(fx) + ' (highfive, highfive, fistbump)');
      else if (dt01 < 0.24 - 1e-6 || dt01 > 0.32 + 1e-6) fail(`pareja: ${dt01.toFixed(3)} s entre los dos choques (0,24-0,32)`);
      else console.log(`  ok saludo de pareja: highfive → highfive (${dt01.toFixed(3)} s) → fistbump; cierre ${JSON.stringify(p6.closeSeq)}`);
      if (p6.t6bad) fail(`pareja: ${p6.t6bad} puntos con tipo 6 fuera de su sitio`);
      if (p6.winTeam === 0) { if (!p6.long6) fail('pareja nivel 3: el partido ganado no cerró con el saludo largo (tipo 6)'); else console.log('  ok nivel 3: cierre con el saludo largo (tipo 6)'); }
    }
    const p2 = await s3(99, 'pair2');
    if (p2) {
      if (p2.err) fail('S3 pareja 2: ' + p2.err);
      console.log(`[S3 pareja nivel 2] tipo 6 en ${p2.t6} jugadores-punto de ${p2.pts} puntos`);
      if (p2.t6bad) fail(`pareja nivel 2: ${p2.t6bad} puntos normales con tipo 6`); else if (!p2.t6) fail('pareja nivel 2: ningún saludo en los puntos grandes'); else console.log('  ok nivel 2: tipo 6 solo en set o punto grande');
    }
    const p66 = await s3(7, 'six');
    if (p66) {
      if (p66.err) fail('S3 6v6: ' + p66.err);
      console.log(`[S3 6v6 con setPairChem(3)] ${p66.pts} puntos, tipo 6 en ${p66.t6}`);
      if (p66.t6) fail('6v6: convergencia de tipo 6'); else console.log('  ok 6v6: nunca tipo 6');
    }
    // R12: la misma semilla da la misma secuencia
    const again = await s3(7, 'neutral');
    if (again && nfp.slice(0, 8) !== again.fp) fail(`la misma semilla dio otra huella (${again.fp} frente a ${nfp.slice(0, 8)})`);
    else if (again) console.log('  ok misma semilla → misma secuencia de celebraciones (hash, nunca Math.random)');
  }
  // gimnasio
  await pg.navigate('debug=rally&quality=low'); await CDP.sleep(2000);
  const gy = JSON.parse(await pg.evalJs('(' + gymPage.toString() + ')(7)'));
  if (gy.skip) console.log('[gimnasio] SALTADO: ' + gy.skip);
  else { console.log('[gimnasio] drillStage por ejercicio ' + JSON.stringify(gy.kinds)); if (gy.bad.length) fail('gimnasio: ' + gy.bad.join(' | ')); else if (!gy.stages) fail('gimnasio: ningún drillStage'); else console.log('  ok tras drillStage sin dvar/lvar/celebración/idle'); }
  if (pg.errors.length) fail('errores JS: ' + pg.errors.slice(0, 3).join(' | '));
  pg.close();
  console.log(bad ? `== ${bad} FALLOS ==` : 'TODO OK');
  process.exit(bad ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
