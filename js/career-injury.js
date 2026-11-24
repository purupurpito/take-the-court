/* TAKE THE COURT — js/career-injury.js (owner: lesiones)
 * Lesiones y estado físico de la Carrera (playa y pista): VB.CareerInjury.
 * Encargo de Ferran (20-nov-2026): «sí, pero baja probabilidad». API de extensiones: CONTRACT.md «Extensiones de la Carrera».
 *
 * Qué hace
 *  - «Carga» (c.inj.run): partidos seguidos que juegas sin ninguna sesión de Descansar (ni el enfoque Descanso). Con la fatiga, que ya
 *    existe (c.fatigue), decide el riesgo de lesión.
 *  - Tras cada partido tuyo en pista (jugado o simulado, el mismo riesgo) hay una tirada pequeña. Jugando como el piloto automático
 *    sale ~1 lesión cada temporada y media, casi siempre leve; muy cargado (fatiga > 80, sin descansar), ~2 por temporada.
 *  - Lesiones de vóley por zona (tobillo, rodilla, hombro, espalda, dedos), con pesos según tu puesto. Leves 1-2 partidos (80 %),
 *    medias 2-5 (18 %), graves 8-12 (2 %). Tono cartoon, sin gore.
 *  - De baja no juegas: la jornada va por el camino del banquillo (blocked → benchNext/benchNext6). Solo puedes Descansar, que es
 *    rehabilitación (cada 6 descansos, un partido menos). Decisiones con el fisio: «Volver antes» (la mitad, pero −2 dos partidos y
 *    riesgo de recaída) y «Fisio intensivo» (−1 partido, el doble del fisio de siempre).
 *  - Al volver de una media o grave, 2 partidos con −1 (falta de ritmo). El verano lo cura todo.
 *  - Tarjeta «Estado físico» en Jugador › Estado (con el ajuste Lesiones: Sí / No), línea en el último partido, mensajes en la bandeja y,
 *    con «Carrera con vida», avisos en Partido y ánimo del compañero (sistema de story 'inj', sin efectos).
 *
 * Reglas de la casa que cumple
 *  - Se carga sin DOM (vm en node). El CSS lo inyecta career-ui (css()).
 *  - Estado solo en c.inj, con ensure(c) idempotente y sin tiradas. No sube VER/VER6: los guardados viejos cargan con todo a cero.
 *  - Azar solo por hash de la semilla: K(c)._rng(K(c)._hash(c.seed, 'inj', c.inj.n)); cada tirada saca SIEMPRE 4 números.
 *    Nunca Math.random ni g.rng. No toca sim.js: la huella del partido no se mueve.
 *  - Sin el fichero (o con Lesiones: No desde el principio) la Carrera es idéntica.
 *
 * Datos (c.inj)
 *  { on: 1|0, n: tiradas, run: carga, rw: descansos de la última jornada cerrada, rf: enfoque Descanso en esa jornada,
 *    sh: el partido montado iba con molestias (career-life), cur: {id, left, tot, s, at, early, intens, reh, rl} | null,
 *    back: partidos «tocado» (−2), rust: partidos «falta de ritmo» (−1), re / reZ: partidos con riesgo de recaída y su zona,
 *    warn: aviso de carga dado en esta racha, mid: aviso de mitad dado, hist: [{id, s, tot, early, rl}] (12), cnt: [leves, medias,
 *    graves], miss: partidos perdidos por lesión }
 */
(function (root) {
  'use strict';
  var VB = root.VB = root.VB || {};
  var ID = 'inj', PRE = 'inj-';

  // ------------------------------------------------------------------ números
  var P_SEASON = 0.80;    // lesiones esperadas por temporada con todos los multiplicadores a 1 (Ferran: sube o baja aquí)
  var P_MAX = 0.25;       // tope por partido
  var F_FAT = [[20, 0.55], [40, 0.7], [60, 1.0], [80, 1.6], [100, 2.4]];   // fatiga (antes del entreno semanal) ≤ x → factor (≤ 20: muy descansado)
  var F_RUN = [[5, 1.0], [9, 1.3], [99, 1.6]];                 // carga (partidos seguidos sin descansar) ≤ x → factor
  var F_REST = 0.75, F_RE = 3, F_HURT = 1.5;
  var F_AGE = [[29, 1], [32, 1.15], [99, 1.3]];
  var F_DIFF = { easy: 0.7, normal: 1, hard: 1.15, expert: 1.3 };
  var SEV = [0.80, 0.18, 0.02], SEV_HI = [0.68, 0.27, 0.05];   // leve / media / grave (con fatiga > 80 o recaída, SEV_HI)
  var REH_N = 6, BACK_N = 2, RUST_N = 2, RE_N = 4, WARN_RUN = 8, WARN_FAT = 60, HIST_MAX = 12, RUN_MAX = 99;
  var LV = [[0.8, 'Bajo'], [1.4, 'Normal'], [2.5, 'Alto'], [1e9, 'Muy alto']];

  var ZK = ['tob', 'rod', 'hom', 'esp', 'ded'];
  var ZONES = { tob: 'tobillo', rod: 'rodilla', hom: 'hombro', esp: 'espalda', ded: 'dedos' };
  var ZART = { tob: 'El tobillo', rod: 'La rodilla', hom: 'El hombro', esp: 'La espalda', ded: 'Los dedos' };
  var ZDEL = { tob: 'el tobillo', rod: 'la rodilla', hom: 'el hombro', esp: 'la espalda', ded: 'los dedos' };
  var CAT = {
    tob1: { z: 'tob', s: 1, name: 'Torcedura de tobillo', d: [1, 2] },
    tob2: { z: 'tob', s: 2, name: 'Esguince de tobillo', d: [3, 4] },
    tob3: { z: 'tob', s: 3, name: 'Esguince grave de tobillo', d: [8, 10] },
    rod1: { z: 'rod', s: 1, name: 'Rodilla cargada', d: [1, 2] },
    rod2: { z: 'rod', s: 2, name: 'Rodilla de saltador', d: [3, 5] },
    rod3: { z: 'rod', s: 3, name: 'Ligamento de la rodilla', d: [10, 12] },
    hom1: { z: 'hom', s: 1, name: 'Hombro cargado', d: [1, 2] },
    hom2: { z: 'hom', s: 2, name: 'Tendinitis de hombro', d: [3, 5] },
    hom3: { z: 'hom', s: 3, name: 'Lesión de hombro', d: [8, 10] },
    esp1: { z: 'esp', s: 1, name: 'Sobrecarga lumbar', d: [1, 2] },
    esp2: { z: 'esp', s: 2, name: 'Contractura de espalda', d: [2, 4] },
    ded1: { z: 'ded', s: 1, name: 'Dedo torcido', d: [1, 1] },
    ded2: { z: 'ded', s: 2, name: 'Esguince de dedo', d: [2, 3] }
  };
  // pesos de zona (tob/rod/hom/esp/ded) por puesto (player.roleKey, leído en vivo: vale con «Cambio de puesto»)
  var ZW = {
    beach: { atk: [2, 2, 3, 3, 1], uni: [2, 2, 2, 3, 1], cr: [2, 1, 1, 3, 3] },
    hall: { OH: [3, 2, 3, 2, 1], OPP: [2, 2, 4, 2, 1], MB: [4, 3, 1, 1, 2], S: [2, 1, 1, 2, 4] },
    def: [3, 2, 2, 2, 1]
  };
  var LINES = {
    tob: ['Caíste sobre el pie de un rival al bloquear.', 'Un mal apoyo en la recepción.'],
    rod: ['Tanto salto pasa factura.', 'Aterrizaste raro tras un remate.'],
    hom: ['Demasiados remates a tope.', 'Un saque de más en el calentamiento.'],
    esp: ['Un giro brusco en defensa.', 'Te lanzaste a por un balón imposible.'],
    ded: ['Un bloqueo te dobló el dedo.', 'Un balonazo en la colocación.']
  };

  // ------------------------------------------------------------------ utilidades
  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function int(v, a, b) { v = +v; return v >= 0 && isFinite(v) ? clamp(Math.floor(v), a, b) : a; }
  function plural(n, a, b) { return n + ' ' + (n === 1 ? a : b); }
  function eur(v) { return String(Math.round(v)).replace(/\B(?=(\d{3})+(?!\d))/g, '.') + ' €'; }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (ch) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]; }); }
  function obj(o) { return !!o && typeof o === 'object' && !Array.isArray(o); }
  function hall(c) { return !!(c && c.mode === 'hall'); }
  function lc(s) { return String(s).charAt(0).toLowerCase() + String(s).slice(1); }
  function step(tab, v) { for (var i = 0; i < tab.length; i++) if (v <= tab[i][0]) return tab[i][1]; return tab[tab.length - 1][1]; }
  /** Motor de la carrera c (como K(c) de career-life.js): playa, o la vista «pista sobre playa» (lo común sale de la playa). */
  var HV = null, HVsrc = null;
  function K(c) {
    var C = VB.Career; if (!C || !C.beach) return C || null;
    if (!hall(c) || !C.hall) return C.beach;
    if (HVsrc !== C.hall) { HVsrc = C.hall; HV = {}; var k; for (k in C.beach) HV[k] = C.beach[k]; for (k in C.hall) HV[k] = C.hall[k]; }
    return HV;
  }
  function rngOf(c, n, tag) { var E = K(c); return tag ? E._rng(E._hash(c.seed | 0, 'inj', n, tag)) : E._rng(E._hash(c.seed | 0, 'inj', n)); }
  function msg(c, k, t, x) { var E = K(c); if (E && E._msg) E._msg(c, k, t, x); }

  // ------------------------------------------------------------------ estado
  function fresh() { return { on: 1, n: 0, run: 0, rw: 0, rf: 0, sh: 0, cur: null, back: 0, rust: 0, re: 0, reZ: '', warn: 0, mid: 0, hist: [], cnt: [0, 0, 0], miss: 0 }; }
  function saneCur(x) {
    if (!obj(x) || !CAT[x.id]) return null;
    if (typeof x.tot !== 'number' || typeof x.left !== 'number') return null;
    var tot = x.tot, left = x.left;
    if (!(tot >= 1 && isFinite(tot)) || !(left >= 0 && isFinite(left))) return null;
    tot = clamp(Math.floor(tot), 1, 30);
    return { id: x.id, left: clamp(Math.floor(left), 1, tot), tot: tot, s: int(x.s, 0, 999), at: typeof x.at === 'string' ? x.at.slice(0, 60) : '',
      early: x.early ? 1 : 0, intens: x.intens ? 1 : 0, reh: int(x.reh, 0, REH_N - 1), rl: x.rl ? 1 : 0 };
  }
  /** Crea o repara c.inj (idempotente, sin tiradas). Devuelve c.inj (o null sin carrera). */
  function ensure(c) {
    if (!obj(c)) return null;
    var o = c.inj;
    if (!obj(o)) { c.inj = fresh(); return c.inj; }
    o.on = o.on === 0 || o.on === false ? 0 : 1;
    ['n', 'miss'].forEach(function (k) { o[k] = int(o[k], 0, 1e9); });
    o.run = int(o.run, 0, RUN_MAX); o.rw = int(o.rw, 0, 9); o.rf = o.rf ? 1 : 0; o.sh = o.sh ? 1 : 0;
    o.back = int(o.back, 0, BACK_N); o.rust = int(o.rust, 0, RUST_N); o.re = int(o.re, 0, RE_N);
    o.reZ = ZONES[o.reZ] ? o.reZ : ''; if (!o.reZ) o.re = 0;
    o.warn = o.warn ? 1 : 0; o.mid = o.mid ? 1 : 0;
    o.cur = saneCur(o.cur);
    o.hist = Array.isArray(o.hist) ? o.hist.filter(function (h) { return obj(h) && CAT[h.id]; }).slice(-HIST_MAX).map(function (h) {
      return { id: h.id, s: int(h.s, 0, 999), tot: int(h.tot, 0, 30), early: h.early ? 1 : 0, rl: h.rl ? 1 : 0 };
    }) : [];
    var cn = Array.isArray(o.cnt) ? o.cnt : []; o.cnt = [int(cn[0], 0, 1e6), int(cn[1], 0, 1e6), int(cn[2], 0, 1e6)];
    return o;
  }
  /** Lectura pura: c.inj si es un objeto (con lecturas defensivas en cada uso), o los valores por defecto. */
  function peek(c) { return c && obj(c.inj) ? c.inj : fresh(); }
  function curOf(c) { var o = peek(c); return saneCur(o.cur); }

  // ------------------------------------------------------------------ riesgo
  function mps(c) {
    var E = K(c), k = null;
    try { k = E && c.myClub >= 0 ? E.myClub(c) : null; } catch (e) { k = null; }
    if (hall(c)) { var w = 0; try { w = k && E.weeksOf ? E.weeksOf(c, k.lid) | 0 : 0; } catch (e) { w = 0; } return Math.max(8, (w || 14) + 1); }
    return ((VB.Career && VB.Career.beach && VB.Career.beach.WEEKS) || 14) + 1;
  }
  /** Exposición de un partido (sum): 0 sin pisar la pista, 1 de inicio; pista desde el banquillo, la parte jugada (mín. 0,3). */
  function exposure(sum) {
    if (!sum || sum.out) return 0;
    var pt = sum.part;
    if (pt) {
      if (pt.status === 'start') return 1;
      if (pt.status === 'sub' && (pt.meR | 0) > 0) return Math.max(0.3, clamp((pt.meR | 0) / Math.max(1, pt.rallies | 0), 0, 1));
      return 0;
    }
    return sum.bench ? 0 : 1;
  }
  function diffK(c) { var d = 'normal'; try { var E = K(c); d = E && E.diffOf ? E.diffOf(c) : c.diff; } catch (e) { d = c && c.diff; } return F_DIFF[d] || 1; }
  /** Factores del riesgo. o = {fat, run, rested, re, hurt} (lo que falte, de ahora). */
  function factors(c, o) {
    o = o || {}; var I = peek(c);
    var fat = o.fat != null ? +o.fat || 0 : c ? c.fatigue | 0 : 0, run = o.run != null ? o.run | 0 : I.run | 0;
    var rested = !!o.rested, re = o.re != null ? o.re | 0 : I.re | 0, hurt = !!o.hurt;
    var age = c && c.player ? c.player.age | 0 : 18;
    var f = { fFat: step(F_FAT, fat), fRun: rested ? 1 : step(F_RUN, run), fRest: rested ? F_REST : 1, fRe: re > 0 ? F_RE : 1, fHurt: hurt ? F_HURT : 1,
      fAge: step(F_AGE, age), fDiff: diffK(c), mps: mps(c) };
    f.rel = f.fFat * f.fRun * f.fRest * f.fRe * f.fHurt;
    f.p = function (e) { return Math.min(P_MAX, P_SEASON / f.mps * (e == null ? 1 : e) * f.rel * f.fAge * f.fDiff); };
    return f;
  }
  /** Descansos de la jornada en curso (sesiones 'rest') y si el enfoque es Descanso. */
  function restNow(c) {
    var n = 0;
    try { var inf = K(c).trainInfo(c); (inf && inf.log || []).forEach(function (x) { if (x && x.how === 'rest') n++; }); } catch (e) { n = 0; }
    return { n: n, focus: !!(c && c.train === 'rest') };
  }
  /** Riesgo de ahora para la UI: {rel, lv ('Bajo'…), hi (Alto o Muy alto), p (por partido), f}. Puro. */
  function risk(c, e) {
    var I = peek(c), rn = restNow(c), hurt = !!(c && c.life && c.life.hurt);
    var f = factors(c, { fat: c ? c.fatigue | 0 : 0, run: I.run | 0, rested: rn.n > 0 || rn.focus, re: I.re | 0, hurt: hurt });
    var lv = LV[LV.length - 1][1];
    for (var i = 0; i < LV.length; i++) if (f.rel < LV[i][0]) { lv = LV[i][1]; break; }
    return { rel: Math.round(f.rel * 100) / 100, lv: lv, hi: lv === 'Alto' || lv === 'Muy alto', top: lv === 'Muy alto', p: f.p(e == null ? 1 : e), f: f, rested: rn.n > 0 || rn.focus };
  }

  // ------------------------------------------------------------------ tirada y lesión
  function pickW(w, r) { var s = 0, i; for (i = 0; i < w.length; i++) s += w[i]; var x = r * s; for (i = 0; i < w.length; i++) { x -= w[i]; if (x < 0) return i; } return w.length - 1; }
  function zoneW(c) {
    var rk = c && c.player ? c.player.roleKey : '', t = hall(c) ? ZW.hall : ZW.beach;
    return t[rk] || ZW.def;
  }
  /** De los 4 números (r2 gravedad, r3 zona, r4 duración y frase) a {id, dur, line}. relZ: recaída en esa zona (gravedad +1). */
  function build(c, r2, r3, r4, hi, relZ) {
    var sev = pickW(hi ? SEV_HI : SEV, r2) + 1, z;
    if (relZ) {
      z = relZ; sev = Math.min(3, sev + 1);
      if (!CAT[z + sev]) sev = 2;   // (espalda y dedos no tienen grave)
    } else {
      z = ZK[pickW(zoneW(c), r3)];
      if (!CAT[z + sev]) z = ['tob', 'rod', 'hom'][Math.floor(r3 * 3) % 3];   // grave en espalda o dedos: a tobillo, rodilla u hombro
    }
    var id = z + sev, d = CAT[id].d, dur;
    if (sev === 1 && d[1] === d[0] + 1) dur = r4 < 0.6 ? d[0] : d[1];
    else dur = d[0] + Math.min(d[1] - d[0], Math.floor(r4 * (d[1] - d[0] + 1)));
    var line = LINES[z][Math.floor(r4 * 7919) % LINES[z].length];
    return { id: id, dur: dur, line: line };
  }
  /** Una tirada (4 números siempre). e = exposición; o = {fat, run, rested, hurt, label, season, tag}. Lesiona si toca. → info o null. */
  function roll(c, e, tag, o) {
    var I = ensure(c); if (!I || !(e > 0) || I.on !== 1 || I.cur) return null;
    o = o || {};
    var n = I.n; I.n = n + 1;
    var r = rngOf(c, n, tag && tag !== 'liga' ? tag : ''), r1 = r(), r2 = r(), r3 = r(), r4 = r();
    var fat = o.fat != null ? +o.fat || 0 : c.fatigue | 0;
    var f = factors(c, { fat: fat, run: o.run != null ? o.run : I.run, rested: !!o.rested, re: I.re, hurt: !!o.hurt });
    if (!(r1 < f.p(e))) return null;
    var relZ = I.re > 0 && I.reZ ? I.reZ : '';
    var b = build(c, r2, r3, r4, fat > 80 || !!relZ, relZ);
    return injure(c, b.id, b.dur, { line: b.line, rl: !!relZ, label: o.label, season: o.season });
  }
  /** Pone la lesión (mensajes incluidos). → {id, name, zone, sev, n, rl}. */
  function injure(c, id, dur, o) {
    var I = ensure(c), C0 = CAT[id]; if (!I || !C0) return null;
    o = o || {};
    dur = clamp(dur | 0 || C0.d[0], 1, 30);
    I.cur = { id: id, left: dur, tot: dur, s: o.season != null ? o.season | 0 : c.season | 0, at: String(o.label || '').slice(0, 60), early: 0, intens: 0, reh: 0, rl: o.rl ? 1 : 0 };
    I.cnt[C0.s - 1]++; I.re = 0; I.reZ = ''; I.back = 0; I.rust = 0; I.mid = 0; I.warn = 0;
    if (!o.quiet) {
      var line = o.line || LINES[C0.z][0];
      if (o.rl) msg(c, 'train', 'Recaída: ' + lc(C0.name), (C0.z === 'ded' ? 'Los dedos no estaban' : ZART[C0.z] + ' no estaba') + ' del todo. Esta vez son ' + plural(dur, 'partido', 'partidos') + '.');
      else msg(c, 'train', 'Lesión: ' + lc(C0.name), C0.s === 1 ? line + ' Nada serio, dice el fisio: te pierdes ' + plural(dur, 'partido', 'partidos') + '.'
        : C0.s === 2 ? line + ' Toca parar ' + plural(dur, 'partido', 'partidos') + '. En Jugador › Estado puedes hablar con el fisio.'
        : line + ' Es de las largas: unos ' + dur + ' partidos fuera. El club te cuida y volverás a tope.');
    }
    return { id: id, name: C0.name, zone: C0.z, sev: C0.s, n: dur, rl: o.rl ? 1 : 0 };
  }
  function heal(c, quiet) {
    var I = c.inj, cur = I.cur; if (!cur) return null;
    var C0 = CAT[cur.id];
    I.hist.push({ id: cur.id, s: cur.s, tot: cur.tot, early: cur.early, rl: cur.rl }); if (I.hist.length > HIST_MAX) I.hist = I.hist.slice(-HIST_MAX);
    I.cur = null; I.run = 0; I.warn = 0; I.mid = 0;
    if (cur.early) { I.back = BACK_N; I.re = RE_N; I.reZ = C0.z; I.rust = 0; }
    else I.rust = C0.s >= 2 ? RUST_N : 0;
    if (!quiet) msg(c, 'coach', 'Alta médica', 'Ya estás para jugar.' + (cur.early ? ' Vas con vendaje: los 2 primeros partidos irás tocado (−2).'
      : I.rust ? ' Los 2 primeros partidos irás algo falto de ritmo (−1).' : ' Vuelves a la lista.'));
    return { id: cur.id, rust: I.rust, back: I.back };
  }

  // ------------------------------------------------------------------ ganchos del núcleo (VB.CareerExt)
  function hook(c, kind, a, b) {
    if (!obj(c)) return;
    if (kind === 'create') { ensure(c); return; }
    if (kind === 'setup') { onSetup(c, a); return; }
    if (kind === 'match') { onMatch(c, a, b); return; }
    if (kind === 'newSeason') { onNewSeason(c); return; }
  }
  /** Partido jugado: molestias de career-life (para el riesgo) y «tocado» (−2) o «falta de ritmo» (−1) en tus atributos. */
  function onSetup(c, m) {
    var I = ensure(c); if (!I || !obj(m)) return;
    I.sh = (m.hurt | 0) > 0 ? 1 : 0;
    var d = I.back > 0 ? 2 : I.rust > 0 ? 1 : 0;
    m.injMod = { back: I.back, rust: I.rust, d: d };
    if (!d) return;
    var ix = m.format === '6v6' ? m.ctrlIdx | 0 : 0;
    var st = m.meOn === false && m.bench && m.bench[0] && m.bench[0][m.meBench | 0] ? m.bench[0][m.meBench | 0].st : m.attrs && m.attrs[0] ? m.attrs[0][ix] : null;
    if (!obj(st)) return;
    Object.keys(st).forEach(function (k) { if (typeof st[k] === 'number') st[k] = clamp(Math.round(st[k] - d), 1, 99); });
  }
  /** Al cerrar la jornada (career.js sessClose, antes de vaciar el contador): descansos = carga a 0 y rehabilitación. */
  function sessClose(c, rests, n, bye) {
    var I = ensure(c); if (!I) return;
    if (bye) {   // jornada de descanso (pista): no hay partido, pero ningún Descansar se pierde
      var rb = int(rests, 0, 9);
      if (I.cur) {   // rehabilitación, como en onMatch (la vuelta siempre es en un partido: left no baja de 1)
        var cb = I.cur; cb.reh += rb;
        while (cb.reh >= REH_N && cb.left > 1) { cb.reh -= REH_N; cb.left--; }
        cb.reh = clamp(cb.reh, 0, REH_N - 1);
      } else if (rb >= 1 || c.train === 'rest') { I.run = 0; I.warn = 0; }
      return;
    }
    I.rw = int(rests, 0, 9); I.rf = c.train === 'rest' ? 1 : 0;
  }
  function onMatch(c, sum, f) {
    var I = ensure(c); if (!I || !obj(sum)) return;
    var rw = I.rw, rf = I.rf, sh = I.sh; I.rw = 0; I.rf = 0; I.sh = 0;
    if (I.cur) {   // jornada de baja: un partido menos (más la rehabilitación); de baja no se tira
      var cur = I.cur, half = Math.floor(cur.tot / 2), was = cur.left;
      cur.left--; I.miss++;
      cur.reh += rw;
      if (cur.reh >= REH_N) { cur.reh -= REH_N; cur.left--; }
      cur.reh = clamp(cur.reh, 0, REH_N - 1);
      if (cur.left <= 0) {
        var hb = heal(c);
        if (hb) sum.injBack = { id: hb.id, rust: hb.rust, back: hb.back };
      } else if (CAT[cur.id].s === 3 && !I.mid && was > half && cur.left <= half) {
        I.mid = 1; msg(c, 'train', 'Vas bien', 'Ya corres sin molestias. Aguanta: queda la mitad.');
      }
      return;
    }
    var rested = rw >= 1 || !!rf;
    if (rested) I.run = 0;
    var e = exposure(sum);
    if (e > 0 && I.on === 1 && c.phase !== 'off') {   // (el último partido de la temporada no lesiona: el verano lo cura todo)
      var fat0 = sum.train && typeof sum.train.fat0 === 'number' ? sum.train.fat0 : c.fatigue | 0;
      var hurt = sum.sim ? !!(c.life && c.life.hurt) : !!sh;
      var inj = roll(c, e, '', { fat: fat0, run: I.run, rested: rested, hurt: hurt, label: sum.label, season: sum.season });
      if (inj) { sum.inj = inj; return; }
    }
    if (e >= 0.3) I.run = Math.min(RUN_MAX, I.run + 1); else if (e <= 0) I.run = 0;
    if (e > 0) { if (I.back > 0) I.back--; if (I.rust > 0) I.rust--; if (I.re > 0) { I.re--; if (!I.re) I.reZ = ''; } }
    if (I.run === 0) I.warn = 0;
    if (I.on === 1 && !I.warn && I.run >= WARN_RUN && (c.fatigue | 0) >= WARN_FAT && c.phase !== 'off') {
      I.warn = 1;
      msg(c, 'train', 'Vas muy cargado', 'Llevas ' + I.run + ' partidos sin descansar y fatiga ' + (c.fatigue | 0) + '. El riesgo de lesión sube. Una sesión de Descansar lo corta.');
    }
  }
  function onNewSeason(c) {
    var I = ensure(c); if (!I) return;
    if (I.cur) {
      var cur = I.cur;
      I.hist.push({ id: cur.id, s: cur.s, tot: cur.tot, early: cur.early, rl: cur.rl }); if (I.hist.length > HIST_MAX) I.hist = I.hist.slice(-HIST_MAX);
      msg(c, 'coach', 'Recuperado en verano', 'Las vacaciones han hecho su trabajo: empiezas la temporada sano.');
    }
    I.cur = null; I.run = 0; I.back = 0; I.rust = 0; I.re = 0; I.reZ = ''; I.warn = 0; I.mid = 0; I.rw = 0; I.rf = 0; I.sh = 0;
  }
  /** Baja de la jornada (puro). null o {id:'inj', head, why, tail, tag, act, actT}. En verano (fase 'off') no bloquea: se cura. */
  function blocked(c, f) {
    var cur = c && c.phase !== 'off' ? curOf(c) : null; if (!cur) return null;
    var C0 = CAT[cur.id];
    return { id: ID, head: 'De baja.', why: C0.name + ': vuelves en ' + plural(cur.left, 'partido', 'partidos') + '.', tail: 'Tú, a recuperarte.', tag: 'De baja', act: 'inj-go', actT: 'Ver recuperación' };
  }
  /** Lesión activa para otras funciones (selección, Estrellas, cesiones): {id, name, zone, sev, left, tot} o null. Puro. */
  function out(c) { var cur = c && c.phase !== 'off' ? curOf(c) : null; if (!cur) return null; var C0 = CAT[cur.id]; return { id: cur.id, name: C0.name, zone: C0.z, sev: C0.s, left: cur.left, tot: cur.tot }; }

  // ------------------------------------------------------------------ decisiones con el fisio
  var ask = '', note = '';
  function intCost(c) { var E = K(c), v = 0; try { v = E && E.physioCost ? E.physioCost(c) : 0; } catch (e) { v = 0; } return 2 * (v || 300); }
  function canEarly(cur) { return !!cur && cur.left >= 2 && !cur.early; }
  function canInt(c, cur) { return !!cur && cur.left >= 2 && !cur.intens && (+c.money || 0) >= intCost(c); }
  function save(c) { var E = K(c); if (E && E.save) E.save(c); }
  /** Acciones 'inj-…' de la UI sobre la Carrera activa. → {render, ok, snd} | {tab, s} | null. */
  function act(a) {
    if (typeof a !== 'string' || a.indexOf(PRE) !== 0) return null;
    if (a === 'inj-go') return { tab: 'player', s: 'train' };
    var c = VB.Career && VB.Career.load ? VB.Career.load() : null; if (!c) return null;
    var I = ensure(c), cur = I.cur, fail = function (t) { note = t; ask = ''; return { render: true, ok: false }; };
    if (a === 'inj-no') { ask = ''; note = ''; return { render: true, focus: '.inj .acts button' }; }
    if (a === 'inj-opt-1' || a === 'inj-opt-0') {
      var v = a === 'inj-opt-1' ? 1 : 0; if (I.on === v) return { render: true };
      I.on = v; save(c);
      note = v ? 'Lesiones encendidas.' : 'Lesiones apagadas.' + (cur ? ' La que tienes sigue su curso.' : '');
      return { render: true, snd: 'select' };
    }
    if (a === 'inj-early') {
      if (!canEarly(cur) || c.phase === 'off') return fail('Ya no se puede adelantar la vuelta.');
      ask = 'early'; note = ''; return { render: true, focus: '.inj .acts button' };
    }
    if (a === 'inj-early-ok') {
      if (!canEarly(cur) || c.phase === 'off') return fail('Ya no se puede adelantar la vuelta.');
      cur.left = Math.max(1, Math.floor(cur.left / 2)); cur.early = 1; ask = '';
      msg(c, 'train', 'Vuelves antes', 'Vendaje y adelante. Los 2 primeros partidos irás tocado (−2) y ' + ZDEL[CAT[cur.id].z] + ' puede resentirse.');
      save(c); note = 'Hecho: vuelves en ' + plural(cur.left, 'partido', 'partidos') + '.';
      return { render: true, focus: '.inj .note' };
    }
    if (a === 'inj-int') {
      if (!cur || c.phase === 'off') return fail('No estás de baja.');
      if (cur.intens) return fail('El fisio intensivo ya está hecho.');
      if (cur.left < 2) return fail('Te queda un partido: no hace falta.');
      var cost = intCost(c);
      if ((+c.money || 0) < cost) return fail('No te llega: cuesta ' + eur(cost) + '.');
      c.money = Math.round(c.money - cost); cur.left--; cur.intens = 1; ask = '';
      save(c); note = 'Fisio intensivo: vuelves en ' + plural(cur.left, 'partido', 'partidos') + '.';
      return { render: true };
    }
    return null;
  }

  // ------------------------------------------------------------------ interfaz (HTML como cadenas)
  function chips(list) {
    return list.filter(Boolean).map(function (p) { return '<span class="chip' + (p.c ? ' ' + p.c : '') + '">' + p.h + '</span>'; }).join('<span class="sr">, </span>');
  }
  function sepD(a, b) { return a + '<span class="sep sep-d"><span class="sr">, </span></span>' + b; }
  function qB(HLP, t, x) { return HLP && typeof HLP.q === 'function' ? HLP.q(t, x) : ''; }
  var HELP = 'Tras cada partido que juegas hay un riesgo pequeño de lesión. Lo normal es una leve cada temporada o dos. ' +
    'Sube con la fatiga y con la carga: los partidos seguidos sin una sesión de Descansar. Un Descansar corta la carga. ' +
    'De baja no juegas y solo puedes descansar: cada 6 descansos, un partido menos. En verano se cura todo.';
  function lastTxt(h) {
    var C0 = CAT[h.id]; return C0 ? 'T' + h.s + ', ' + ZONES[C0.z] + (h.tot ? ' (' + plural(h.tot, 'partido', 'partidos') + ')' : '') : '';
  }
  function doll(z) {
    var P = { tob: [35, 75], rod: [34, 63], hom: [37, 27], esp: [28, 42], ded: [47, 50] }[z] || [28, 42];
    var limbs = 'M20 27 L9 49 M36 27 L47 49 M23 50 L21 77 M33 50 L35 77';
    return '<svg class="inj-doll" viewBox="0 0 56 84" width="64" height="96" aria-hidden="true" focusable="false">' +
      '<ellipse cx="28" cy="81" rx="15" ry="2.6" class="sh"/>' +
      '<path d="' + limbs + '" class="lo"/><path d="' + limbs + '" class="lm"/>' +
      '<rect x="17" y="21" width="22" height="31" rx="10" class="bd"/>' +
      '<circle cx="28" cy="11" r="8.5" class="bd"/>' +
      '<path d="M24.5 11.5 h1.5 M30 11.5 h1.5 M25 15.6 q3 -2 6 0" class="fc"/>' +
      '<circle cx="' + P[0] + '" cy="' + P[1] + '" r="9" class="zn"/>' +
      '<g transform="translate(' + P[0] + ' ' + P[1] + ') rotate(-18)"><rect x="-7.5" y="-3.4" width="15" height="6.8" rx="2" class="bn"/>' +
      '<path d="M-3 -3.4 v6.8 M1.5 -3.4 v6.8" class="bl"/></g></svg>';
  }
  function tagLine(I) {
    if (I.back > 0) return '<p class="inj-mod"><span class="tag r">Tocado (−2)</span> ' + plural(I.back, 'partido', 'partidos') + ' más con vendaje.</p>';
    if (I.rust > 0) return '<p class="inj-mod"><span class="tag y">Falta de ritmo (−1)</span> ' + plural(I.rust, 'partido', 'partidos') + ' más.</p>';
    return '';
  }
  /** Jugador › Estado: tarjeta «Estado físico» (sano o de baja). HLP: ayudas de career-ui (q, esc). */
  function uiState(c, HLP) {
    if (!c || !c.player || c.phase === 'pick') return '';
    var I = peek(c), cur = curOf(c), nt = note; note = '';
    var noteP = '<p class="note" role="status" aria-live="polite">' + esc(nt) + '</p>';
    if (cur) {
      var C0 = CAT[cur.id], off = c.phase === 'off', done = cur.tot - cur.left, ph = isPh(HLP);
      // (móvil, movil-aire §5.3: el muñeco de 40 px dentro del sello, la barra y «Vuelves en 3» en una fila y la rehabilitación tras «?»)
      var h = ph ? '<div class="card inj inj-out inj-ph"><h3>' + doll(C0.z) + sepD('De baja', esc(C0.name)) + qB(HLP, 'Lesiones', HELP + (off ? '' : ' Rehabilitación: ' + cur.reh + ' de ' + REH_N + ' descansos.')) + '</h3>'
        : '<div class="card inj inj-out"><h3>' + sepD('De baja', esc(C0.name)) + qB(HLP, 'Lesiones', HELP) + '</h3>' + doll(C0.z);
      if (off) {
        h += '<p><b>Se cura en verano.</b> Las vacaciones hacen su trabajo: empiezas la próxima temporada sano.</p>';
      } else if (ph) {
        h += '<div class="pbar inj-pb"><span><b>Vuelves en ' + plural(cur.left, 'partido', 'partidos') + '</b></span><span class="bar"><i style="width:' + Math.round(100 * done / cur.tot) + '%"></i></span><b>' + done + '/' + cur.tot + '</b></div>';
      } else {
        h += '<p><b>Vuelves en ' + plural(cur.left, 'partido', 'partidos') + '</b> (' + (cur.left === 1 ? 'una semana' : 'unas ' + cur.left + ' semanas') + ').</p>' +
          '<div class="pbar"><span>Recuperación</span><span class="bar"><i style="width:' + Math.round(100 * done / cur.tot) + '%"></i></span><b>' + done + ' de ' + cur.tot + '</b></div>' +
          '<p class="muted">Rehabilitación: ' + cur.reh + ' de ' + REH_N + ' descansos. Cada ' + REH_N + ', un partido menos.</p>';
      }
      if (!off) {
        var ok1 = canEarly(cur), cost = intCost(c), money = +c.money || 0;
        if (ask === 'early' && ok1) {
          h += '<p class="inj-ask"><b>¿Volver ya?</b> Irás tocado (−2) 2 partidos y con riesgo de recaída.</p>' +
            '<div class="acts"><button class="warn" data-act="inj-early-ok">Sí, vuelvo</button><button data-act="inj-no">Mejor no</button></div>';
        } else {
          var why2 = cur.intens ? 'Ya está hecho' : cur.left < 2 ? 'Te queda un partido' : money < cost ? 'No te llega el dinero' : '';
          h += '<div class="acts">' +
            (ok1 ? '<button class="warn" data-act="inj-early">Volver antes <small>(la mitad, a tu riesgo)</small></button>' : '') +
            '<button data-act="inj-int"' + (why2 ? ' disabled title="' + esc(why2) + '"' : '') + '>Fisio intensivo <small>(−1 partido, ' + eur(cost) + ')</small></button>' +
            '</div>';
          var used = [cur.early ? 'Vuelves antes: −2 los 2 primeros partidos.' : '', cur.intens ? 'Fisio intensivo hecho.' : ''].filter(Boolean).join(' ');
          h += '<p class="muted">' + (used || 'Descansar en los entrenos acelera la vuelta.') + ' Ahorros: ' + eur(money) + '.' +
            (why2 && !cur.intens ? ' Fisio intensivo: ' + lc(why2) + '.' : '') + '</p>';
        }
      }
      return h + noteP + '</div>';
    }
    var on = I.on !== 0, rk = risk(c), run = I.run | 0, fat = c.fatigue | 0;
    var cn = Array.isArray(I.cnt) ? (I.cnt[0] | 0) + (I.cnt[1] | 0) + (I.cnt[2] | 0) : 0, hl = Array.isArray(I.hist) && I.hist.length ? I.hist[I.hist.length - 1] : null;
    var s = '<div class="card inj"><h3>Estado físico' + qB(HLP, 'Lesiones', HELP) + '</h3>' +
      '<p class="inj-chips">' + chips([{ h: 'Sano', c: 'dv g' }, { h: 'Carga ' + run }, on ? { h: 'Riesgo ' + rk.lv, c: rk.hi ? 'dv r' : '' } : { h: 'Lesiones apagadas' }]) + '</p>';
    if (on) s += '<p class="muted">' + (rk.rested ? 'Hoy has descansado: la carga vuelve a 0 y el riesgo baja.'
      : run >= 6 ? 'Llevas ' + run + ' partidos seguidos sin descansar. Una sesión de Descansar corta la carga.'
      : fat > 60 ? 'Con fatiga alta el riesgo se dispara: Descansar o fisio.'
      : 'Vas bien. Lo normal es una lesión leve cada temporada o dos.') + '</p>';
    else s += '<p class="muted">Sin lesiones nuevas. Vuelve a encenderlas cuando quieras.</p>';
    s += tagLine(I);
    if (!isPh(HLP)) s += '<div class="inj-opt"><span class="inj-lbl">Lesiones</span><div class="seg" role="group" aria-label="Lesiones">' +
      '<button data-act="inj-opt-1" aria-pressed="' + (on ? 'true' : 'false') + '">Sí</button><button data-act="inj-opt-0" aria-pressed="' + (on ? 'false' : 'true') + '">No</button></div></div>';
    s += '<p class="muted inj-sum">' + (cn ? plural(cn, 'lesión', 'lesiones') + ' en la Carrera' + (hl ? '. La última: ' + esc(lastTxt(hl)) + '.' : '.') : 'Ninguna lesión en la Carrera.') + '</p>';
    return s + noteP + '</div>';
  }
  function isPh(HLP) { return !!(HLP && typeof HLP.ph === 'function' && HLP.ph()); }
  /** Móvil (movil-aire §5.3): el interruptor «Lesiones Sí/No» va en Vida › Ajustes (en PC sigue en Jugador › Estado). */
  function uiOpts(c, HLP) {
    if (!c || !c.player || c.phase === 'pick' || !isPh(HLP)) return '';
    var on = peek(c).on !== 0;
    return '<div class="card inj inj-optc"><h3>Lesiones</h3><div class="inj-opt"><span class="inj-lbl">Lesiones</span><div class="seg" role="group" aria-label="Lesiones">' +
      '<button data-act="inj-opt-1" aria-pressed="' + (on ? 'true' : 'false') + '">Sí</button><button data-act="inj-opt-0" aria-pressed="' + (on ? 'false' : 'true') + '">No</button></div></div>' +
      '<p class="muted">' + (on ? 'Tras cada partido hay un riesgo pequeño de lesión.' : 'Sin lesiones nuevas.') + '</p></div>';
  }
  /** Línea en la tarjeta del último partido (c.last.inj / injBack). '' si no hay nada. */
  function uiLast(c) {
    var s = c && c.last; if (!s) return '';
    if (s.inj && CAT[s.inj.id]) return '<p class="inj-last"><span class="tag r">' + (s.inj.rl ? 'Recaída' : 'Lesión') + '</span> ' + esc(CAT[s.inj.id].name) + ': ' + plural(s.inj.n | 0, 'partido', 'partidos') + ' de baja.</p>';
    if (s.injBack) return '<p class="inj-last"><span class="tag g">Alta</span> Vuelves a estar disponible.' + (s.injBack.back ? ' Tocado (−2) 2 partidos.' : s.injBack.rust ? ' Falta de ritmo (−1) 2 partidos.' : '') + '</p>';
    return '';
  }
  var Q = ':root:not(#_):not(#_):not(#_) #career', PQ = ':root.ph:not(#_):not(#_):not(#_) #career';
  function css() {
    return [
      Q + ' .inj h3{display:flex;align-items:center;flex-wrap:wrap;gap:4px 8px}',
      Q + ' .inj .inj-chips{margin:4px 0 6px}',
      Q + ' .inj .inj-doll{float:right;width:64px;height:auto;margin:0 4px 6px 14px;transform:rotate(4deg);overflow:visible}',
      Q + ' .inj .inj-doll .sh{fill:rgba(0,0,0,.35)}',
      Q + ' .inj .inj-doll .bd{fill:var(--sp-cream,#fff4dc);stroke:var(--sp-ink,#15102a);stroke-width:2.5}',
      Q + ' .inj .inj-doll .lo{stroke:var(--sp-ink,#15102a);stroke-width:10;stroke-linecap:round;fill:none}',
      Q + ' .inj .inj-doll .lm{stroke:var(--sp-cream,#fff4dc);stroke-width:5.5;stroke-linecap:round;fill:none}',
      Q + ' .inj .inj-doll .fc{stroke:var(--sp-ink,#15102a);stroke-width:1.6;stroke-linecap:round;fill:none}',
      Q + ' .inj .inj-doll .zn{fill:var(--sp-danger,#e0435a);opacity:.6}',
      Q + ' .inj .inj-doll .bn{fill:#fffaf0;stroke:var(--sp-ink,#15102a);stroke-width:1.8}',
      Q + ' .inj .inj-doll .bl{stroke:var(--sp-danger,#e0435a);stroke-width:1.4}',
      Q + ' .inj .pbar{clear:none}',
      Q + ' .inj .acts{clear:both;margin:10px 0 18px}',
      Q + ' .inj .sp-btn .sp-s{font-size:12px}',
      Q + ' .inj .inj-opt{display:flex;align-items:center;flex-wrap:wrap;gap:8px 12px;margin:10px 0 4px}',
      Q + ' .inj .inj-lbl{font:800 13px var(--sp-ui,var(--ui));letter-spacing:.06em;text-transform:uppercase;color:var(--sp-gold,var(--gold))}',
      Q + ' .inj .inj-opt .seg{flex:0 1 auto;gap:10px}',
      Q + ' .inj .inj-opt .seg button{min-width:64px;min-height:44px}',
      Q + ' .inj .inj-ask{margin:8px 0 4px;padding:6px 10px;border-radius:10px 14px 11px 15px;background:rgba(255,90,110,.16);border-left:4px solid var(--sp-danger,#e0435a)}',
      Q + ' .inj .inj-mod{margin:6px 0}',
      Q + ' .inj-last{margin:6px 0 0}',
      PQ + ' .inj h3{font-size:var(--ph-head)}',
      PQ + ' .inj p{font-size:var(--ph-body)}',
      PQ + ' .inj .chip,' + PQ + ' .inj .tag{font-size:var(--ph-cap)}',
      PQ + ' .inj .pbar span,' + PQ + ' .inj .pbar b,' + PQ + ' .inj .inj-lbl{font-size:var(--ph-label)}',
      PQ + ' .inj .acts{display:grid;grid-template-columns:1fr 1fr;gap:var(--ph-hit-gap)}',
      PQ + ' .inj .acts>*{min-height:44px;max-width:none;min-width:0}',
      PQ + ' .card.inj{margin-top:var(--ph-s3,12px)}',
      PQ + ' .inj .inj-doll{width:clamp(52px,7.5vw,68px)}',
      PQ + ' .inj .sp-btn .sp-s{font-size:var(--ph-cap)}',
      PQ + ' .inj .inj-opt .seg{gap:var(--ph-hit-gap,10px)}',
      PQ + ' .inj .inj-opt .seg button{min-height:44px;min-width:52px}',
      PQ + ' .inj .note{font-size:var(--ph-cap)}',
      PQ + ' .inj-last{font-size:var(--ph-body)}'
    ].join('\n');
  }

  // ------------------------------------------------------------------ pruebas y capturas
  function engineOf(mode) { var C = VB.Career; return C ? (mode === 'hall' ? C.hall : C.beach) : null; }
  /** Pruebas: lesiona a la carrera guardada del modo (id del catálogo; left = partidos que faltan). true si lo ha hecho. */
  function debugInjure(mode, id, left, o) {
    var E = engineOf(mode), c = E && E.load ? E.load() : null; if (!c || !CAT[id]) return false;
    var C0 = CAT[id], tot = Math.max(C0.d[1], left | 0 || C0.d[1]);
    ensure(c); injure(c, id, tot, { quiet: true, label: 'Jornada ' + ((c.week | 0) + 1), season: c.season });
    var cur = c.inj.cur; cur.left = clamp(left | 0 || tot, 1, tot);
    if (o && typeof o.reh === 'number') cur.reh = clamp(o.reh | 0, 0, REH_N - 1);
    ask = ''; note = '';
    E.save(c); return true;
  }
  /** mobaudit: deja la carrera c lesionada con id (pantalla de muestra a media recuperación) y la guarda. */
  function demo(c, tipo) {
    if (!c || !c.player || !CAT[tipo]) return false;
    var C0 = CAT[tipo], tot = C0.d[1], left = Math.max(1, Math.ceil(tot * 0.6));
    ensure(c); injure(c, tipo, tot, { quiet: true, label: 'Jornada ' + Math.max(1, c.week | 0), season: c.season });
    c.inj.cur.left = left; c.inj.cur.reh = Math.min(REH_N - 1, 2);
    if (!(+c.money >= intCost(c))) c.money = intCost(c) + 500;
    ask = ''; note = '';
    save(c); return true;
  }

  // ------------------------------------------------------------------ «Carrera con vida»: avisos y ánimo del compañero (sin efectos)
  var STORY = {
    id: 'inj',
    tpl: {
      'inj-mate': { k: 'mate', t: ['¡Ánimo, {yo}!', 'Te esperamos, {yo}'], x: ['¡Ánimo, {yo}! Te guardamos el sitio. Vuelve pronto.', 'Cuídate, {yo}. Esto sin ti no es lo mismo. Vuelve pronto.'] },
      'inj-mate3': { k: 'mate', t: ['Esto lo sacamos juntos', 'Aquí estamos, {yo}'], x: ['Esto lo sacamos juntos. Te esperamos.', 'Paso a paso, {yo}. Te esperamos.'] },
      'inj-back': { k: 'mate', t: ['¡Por fin, {yo}!', 'De vuelta'], x: ['¡Por fin! Te echábamos de menos en la pista.', '¡Ya era hora! El equipo te echaba de menos.'] }
    },
    ensure: function () { },
    onMatch: function (c, sum) {
      var S = VB.CareerStory; if (!S || !S.post || !sum) return;
      if (sum.inj && CAT[sum.inj.id]) S.post(c, { k: 'mate', b: CAT[sum.inj.id].s === 3 ? 'inj-mate3' : 'inj-mate', o: 0 });
      else if (sum.injBack) S.post(c, { k: 'mate', b: 'inj-back', o: 0 });
    },
    chips: function (c) {
      var cur = c && c.phase !== 'off' && c.phase !== 'pick' ? curOf(c) : null;
      if (cur) return [{ p: 2, ic: '✚', t: 'De baja: ' + plural(cur.left, 'partido', 'partidos'), x: 'Recuperación', tab: 'player', s: 'train' }];
      if (!c || c.phase === 'off' || c.phase === 'pick') return [];
      var I = peek(c);
      if (I.on !== 0) { var rk = risk(c); if (rk.hi) return [{ p: 5, ic: '!', t: rk.top ? 'Riesgo de lesión muy alto' : 'Riesgo de lesión alto', x: 'Descansar', tab: 'player', s: 'train' }]; }
      if (I.back > 0) return [{ p: 7, ic: '✚', t: 'Vuelves tocado (−2)', x: 'Estado físico', tab: 'player', s: 'train' }];
      if (I.rust > 0) return [{ p: 7, ic: '✚', t: 'Falta de ritmo (−1)', x: 'Estado físico', tab: 'player', s: 'train' }];
      return [];
    }
  };

  // ------------------------------------------------------------------ registro
  var X = {
    id: ID, hook: hook, blocked: blocked, sessClose: sessClose,
    _demo: demo
  };
  var U = {
    id: ID, prefix: PRE,
    state: function (c, HLP) { return uiState(c, HLP); },
    opts: function (c, HLP) { return uiOpts(c, HLP); },
    last: function (c) { return uiLast(c); },
    act: function (a) { return act(a); },
    css: css
  };
  VB.CareerInjury = {
    id: ID, pre: PRE, hook: hook, blocked: blocked, sessClose: sessClose, ensure: ensure, out: out, risk: risk, roll: roll, act: act,
    exposure: exposure, factors: factors,
    ui: { state: uiState, last: uiLast, css: css },
    CAT: CAT, ZONES: ZONES, ZW: ZW, LINES: LINES, P_SEASON: P_SEASON, P_MAX: P_MAX, F_FAT: F_FAT, F_RUN: F_RUN, SEV: SEV, SEV_HI: SEV_HI, REH_N: REH_N,
    _debugInjure: debugInjure, _demo: demo, _build: build, _ext: X, _uiExt: U, _story: STORY,
    _reset: function () { ask = ''; note = ''; }
  };
  (VB.CareerExt = VB.CareerExt || []).push(X);
  (VB.CareerUIExt = VB.CareerUIExt || []).push(U);
  if (VB.CareerStory && typeof VB.CareerStory.use === 'function') { try { VB.CareerStory.use(STORY); } catch (e) { } }
})(typeof window !== 'undefined' ? window : globalThis);
