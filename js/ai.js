/* =====================================================================
 * MAKE THE CUT — js/ai.js   (owner: sim)
 * IA de los jugadores (ambos equipos; en el humano, el compañero no
 * controlado). Pura: sin DOM/THREE. Depende de VB.Sim (js/sim.js).
 * La fuerza de cada equipo sale de g.prof[team] (VB.DIFF: easy/normal/hard/expert, mate, demo):
 * reacción, velocidad, precisión del timing, bloqueo, defensa, potencia.
 * ===================================================================== */
(function () {
  'use strict';
  var root = (typeof window !== 'undefined') ? window : globalThis;
  var VB = root.VB = root.VB || {};
  var S = VB.Sim, C = VB.C;
  var side = S.side, clamp = S.clamp, other = S.other;

  /** Apuntado aleatorio de la IA (disco unidad). */
  function aim(g) {
    var a = g.rng() * Math.PI * 2, r = Math.sqrt(g.rng());
    return [Math.cos(a) * r, Math.sin(a) * r];
  }

  /* «Te tienen estudiado» (Carrera jugada, g.scout de la sim; notes/carrera.md). Sin g.scout todo devuelve 0 y no suma nada, así que
   * la huella no cambia. Desplazamientos deterministas: nunca gastan g.rng (studytest lo comprueba con un contador).
   * BLK_SHIFT: m que su bloqueador se corre hacia dentro (te cierra la diagonal) o hacia fuera (la línea), × mk × (0,5 + 0,5·bloqueo).
   * DEF_LEAN: m que su defensor 2v2 se echa hacia el destino del carril cerrado (×mk); DEF_LEAN6 los zagueros 6v6. Calibrado con los bots
   * (tools/studytest.js): la defensa de la playa es muy sensible (0,2 m ya bajaba a la mitad los puntos en diagonal), por eso tan poco.
   * RIV_B: puntos de puntuación de openSpot, como mucho, para las zonas del carril de remate del rival (rivBonus: control sobre su reparto
   * en el partido, RIV_BAND de margen), calibrado en tools/studytest.js para que su reparto real quede cerca del % del informe. */
  var BLK_SHIFT = 0.3, DEF_LEAN = 0.08, DEF_LEAN6 = 0.15, RIV_B = 2.5, RIV_BAND = 0.08;
  function sgnS(v) { return v < 0 ? -1 : 1; }
  /** Puntos de openSpot para su carril: RIV_B × (objetivo − reparto actual) / RIV_BAND, entre −1 y 1 (sin remates aún, el objetivo). */
  function rivBonus(sc) {
    var n = sc.rn ? sc.rn.diag + sc.rn.line : 0, sh = n ? sc.rn[sc.riv] / n : sc.rp, e = (sc.rp - sh) / RIV_BAND;
    return RIV_B * (e > 1 ? 1 : e < -1 ? -1 : e);
  }
  /** ¿El ataque que viene es tuyo (el humano del equipo 0)? 2v2: g.jobs[0]; 6v6: el atacante del plan de colocación vigente. */
  function youAttack(g) {
    if (g.rot) { var pl = g.setPlan && g.setPlan[0]; return !!pl && pl.to === g.ctrl && pl.t === g.lastTouchT; }
    return g.jobs[0] === g.ctrl;
  }
  /** Signo del lado que te cierran (+ = hacia el lado del golpe = línea; − = hacia dentro = diagonal), o 0 si no toca. */
  function studySide(g, t) {
    var sc = g.scout; if (!sc || t !== 1 || !sc.me || !(sc.mk > 0)) return 0;
    var cs = g.cs || 1, y = g.pr3.y;
    if (Math.abs(y) < 1.2 * cs || !youAttack(g)) return 0;
    return sc.me === 'diag' ? -sgnS(y) : sgnS(y);
  }
  /** m que el bloqueador rival (equipo t) se corre contra tu remate estudiado (0 sin g.scout). */
  function studyShift(g, t) {
    var d = studySide(g, t); if (!d) return 0;
    return d * BLK_SHIFT * g.scout.mk * (0.5 + 0.5 * (g.prof[1].block || 0)) * (g.cs || 1);
  }
  /** m (coordenadas del mundo) que el defensor rival 2v2 se echa hacia el destino de tu carril cerrado (0 sin g.scout). */
  function studyLean(g, t) {
    var d = studySide(g, t); if (!d) return 0;
    return d * DEF_LEAN * g.scout.mk * (g.cs || 1);
  }
  /** Lo mismo para los zagueros 6v6, en las coordenadas locales de defPos (yl, que va × side(t)). */
  function studyLean6(g, t) {
    var d = studySide(g, t); if (!d) return 0;
    return d * side(t) * DEF_LEAN6 * g.scout.mk;
  }

  /* «Te leen» (24-nov-2026; sim.js RD / rdEv, notes/ia-variada.md): con la racha de remates del humano rival por el mismo carril
   * (g.aiMem.rd), la CPU del equipo t corre el bloqueo y la defensa hacia ese carril con las mismas constantes que «Te tienen estudiado»
   * (BLK_SHIFT, DEF_LEAN, DEF_LEAN6), × la fuerza de la racha (RD.part a la 3ª, 1 desde RD.full) × RD.k de la dificultad (Fácil 0).
   * Solo si el ataque que viene es de un humano y desde un ala. Si «Te tienen estudiado» ya cierra ese mismo carril, la lectura solo
   * añade lo que le falte hasta su fuerza (no se suman: como mucho, la mayor de las dos). Puro, sin g.rng. */
  /** ¿El ataque que viene del equipo opp es de un humano? 2v2: g.jobs[opp]; 6v6: el atacante del plan de colocación vigente. */
  function humAttack(g, opp) {
    var a = null;
    if (g.rot) { var pl = g.setPlan && g.setPlan[opp]; if (pl && pl.t === g.lastTouchT) a = pl.to; }
    else a = g.jobs && g.jobs[opp];
    return !!a && S.isHuman(g, a);
  }
  /** Lado y fuerza firmados (+ línea / − diagonal respecto al golpe) de la lectura del equipo t, ya sin lo que cubre g.scout (0 si nada). */
  function readSide(g, t) {
    var M = g.aiMem, R = M && M.rd && M.rd[1 - t]; if (!R || R[1] < S.RD.n) return 0;
    var cs = g.cs || 1, y = g.pr3.y, k = S.rdK(g, t);
    if (!(k > 0) || Math.abs(y) < 1.2 * cs || !humAttack(g, 1 - t)) return 0;
    var d = R[0] === 1 ? -sgnS(y) : sgnS(y), m = k * (R[1] >= S.RD.full ? 1 : S.RD.part), ds = studySide(g, t);
    if (ds === d) m = Math.max(0, m - g.scout.mk);
    return d * m;
  }
  // RDX: × sobre las constantes de «Te tienen estudiado» (blk bloqueo, lean defensor 2v2, lean6 zagueros 6v6); calibrado en studytest §8
  // (defensor 2v2 ×2,5: con ×1 el defensor apenas se movía 6 cm en Normal y la diagonal repetida hacía el mismo punto; con ×2,5, en racha,
  //  15,8 % → 12,6 % en la playa Normal, 40 partidos. En Experto la defensa ya llega a casi todo y no se mide diferencia en los puntos:
  //  solo más bloqueos. Pista 6v6 con ×1: ×0,7 en Normal)
  var RDX = { blk: 1, lean: 2.5, blk6: 1, lean6: 1 };
  /** m que el bloqueador del equipo t se corre por la lectura (0 sin racha). */
  function readShift(g, t) { var d = readSide(g, t); return d ? d * BLK_SHIFT * (g.rot ? RDX.blk6 : RDX.blk) * (0.5 + 0.5 * (g.prof[t].block || 0)) * (g.cs || 1) : 0; }
  /** m (mundo) que el defensor 2v2 se echa hacia el carril leído. */
  function readLean(g, t) { var d = readSide(g, t); return d ? d * DEF_LEAN * RDX.lean * (g.cs || 1) : 0; }
  /** Zagueros 6v6 (coordenadas locales de defPos). */
  function readLean6(g, t) { var d = readSide(g, t); return d ? d * side(t) * DEF_LEAN6 * RDX.lean6 : 0; }

  // Zonas candidatas del campo rival (profundidad desde la red, lateral; en la playa ×g.cs: pista 16×8)
  var DEPTHS = [2.2, 4.2, 6.2, 7.9], LATS = [-3.6, -1.8, 0, 1.8, 3.6];
  var _t2 = [0, 0];
  /* IA variada (1.22.0, imprescindible 4.8; notes/ia-variada.md): memoria corta por equipo en g.aiMem (sim.js createGame). Solo suma a
   * la puntuación de openSpot y a los pesos de la colocación: mismo bucle y mismas llamadas a g.rng (las huellas cambian porque cambian
   * los destinos, no la secuencia del azar). Determinista: vale en el online (Precisa: los dos lados la calculan igual y copyGame la
   * copia; Fluida: cada máquina decide solo los toques de su equipo y solo lee su memoria).
   * rep: puntos menos por cada vez que la casilla sale en los 3 últimos remates (o saques); lane: menos al carril (diagonal/línea) si
   * los 2 últimos remates fueron por él; rcv: menos a las casillas cuyo receptor más cercano recibió los 2 últimos saques; set (ai6.js):
   * peso × set al atacante de la IA que recibió las 2 últimas colocaciones; tol: m de puntuación (≈ m de hueco) que la IA está dispuesta
   * a ceder para variar (solo elige entre casillas casi tan buenas como la mejor). Calibrado con tools/variedadtest.js. */
  var MEM = { rep: 1.2, lane: 0.8, rcv: 0.8, set: 0.6, tol: 0.6 };
  var _ms = [], _mp = [], _mx = [], _my = [], _mn = 0; // (casillas puntuadas de la última openSpot con memoria)
  /** Casilla de openSpot (i profundidad, j lateral) relativa al lado del equipo (no cambia con el cambio de campo). */
  function cellKey(i, j, sd) { return i * 5 + (sd > 0 ? j : 4 - j); }
  /** Casilla más cercana a (x, y) del campo rival del equipo de lado sd. */
  function cellOf(g, sd, x, y) {
    var cs = g.cs || 1, bi = 0, bj = 0, i;
    for (i = 1; i < DEPTHS.length; i++) if (Math.abs(DEPTHS[i] * cs - Math.abs(x)) < Math.abs(DEPTHS[bi] * cs - Math.abs(x))) bi = i;
    for (i = 1; i < LATS.length; i++) if (Math.abs(LATS[i] * cs - y) < Math.abs(LATS[bj] * cs - y)) bj = i;
    return cellKey(bi, bj, sd);
  }
  function laneCode(hy, ty, cs) { var l = S.laneOf(hy, ty, cs); return l === 'diag' ? 1 : l === 'line' ? 2 : 0; }
  function push3(a, v) { a[2] = a[1]; a[1] = a[0]; a[0] = v; }
  function push2(a, v) { a[1] = a[0]; a[0] = v; }
  /** IA variada: apunta el destino (x, y) del remate ('atk', atacante p) o del saque ('srv', sacador p) del equipo de p en g.aiMem. */
  function remember(g, p, kind, x, y) {
    var M = g.aiMem; if (!M) return;
    var t = p.team, sd = side(t), cs = g.cs || 1;
    if (kind === 'atk') { push3(M.atk[t], cellOf(g, sd, x, y)); push2(M.lane[t], laneCode(p.y, y, cs)); return; }
    push3(M.srv[t], cellOf(g, sd, x, y));
    var opp = g.teams[1 - t], q = null, m = 1e9;
    for (var k = 0; k < opp.length; k++) { var d = Math.hypot(opp[k].x - x, opp[k].y - y); if (d < m) { m = d; q = opp[k]; } }
    push2(M.rcv[t], q ? q.id : -1);
  }
  /** Elige la zona libre del campo rival (lejos de los defensores), con ruido según dificultad. mem (IA variada): 'atk' = remate,
   *  'srv' = saque; resta puntos a lo repetido según g.aiMem (sin mem, lo de siempre). */
  function openSpot(g, p, minDepth, out, atk, mem) {
    var sd = side(p.team), opp = g.teams[1 - p.team], pr = (p.prof || g.prof[p.team]), best = -1e9;
    out = out || _t2; _mn = 0;
    // remate (atk): con un bloqueador rival arriba, evitar las líneas que cruzan la red por sus manos.
    // Cuanto mejor la IA (menos aimNoise), mejor "lee" el bloqueo y remata por fuera de él.
    var blk = null, read = clamp(1 - pr.aimNoise / 4.5, 0.1, 1);
    if (atk) for (var b2 = 0; b2 < opp.length; b2++) { var o2 = opp[b2]; if (o2.z > 0.15 && Math.abs(o2.x) < 1.2 && (!blk || Math.abs(o2.y - p.y) < Math.abs(blk.y - p.y))) blk = o2; }
    // 6v6: con doble bloqueo también se lee el segundo bloqueador (el más cercano después del primero). En 2v2, nunca
    var blk2 = null;
    if (atk && blk && g.rot) for (var b3 = 0; b3 < opp.length; b3++) { var o3 = opp[b3]; if (o3 !== blk && o3.z > 0.15 && Math.abs(o3.x) < 1.2 && (!blk2 || Math.abs(o3.y - p.y) < Math.abs(blk2.y - p.y))) blk2 = o3; }
    var cs = g.cs || 1;
    // «Te tienen estudiado»: el rival remata más por su carril (el del informe). Solo suma a la puntuación: mismo bucle y mismo azar
    // (desde un ala; control determinista sobre lo que llevan en el partido, g.scout.rn: por debajo del % del informe empuja hacia su
    //  carril y por encima lo aparta, así el reparto real queda cerca del % sea cual sea su tendencia de base en cada formato)
    var M = mem && g.aiMem, mc = M ? (mem === 'atk' ? M.atk[p.team] : M.srv[p.team]) : null;
    var mL = M && mem === 'atk' && M.lane[p.team][0] && M.lane[p.team][0] === M.lane[p.team][1] ? M.lane[p.team][0] : 0;
    var mR = M && mem === 'srv' && M.rcv[p.team][0] >= 0 && M.rcv[p.team][0] === M.rcv[p.team][1] ? M.rcv[p.team][0] : -1;
    var rivL = atk && g.scout && p.team === 1 && g.scout.riv && Math.abs(p.y) >= 1.2 * (g.cs || 1) ? g.scout.riv : '', rivB = rivL ? rivBonus(g.scout) : 0;
    for (var i = 0; i < DEPTHS.length; i++) {
      if (DEPTHS[i] < minDepth) continue;
      for (var j = 0; j < LATS.length; j++) {
        var x = -sd * DEPTHS[i] * cs, y = LATS[j] * cs, m = 1e9, mq = null;
        for (var k = 0; k < opp.length; k++) {
          var q = opp[k], dd = Math.hypot(q.x - x, q.y - y);
          if (q.z > 0.1 && Math.abs(q.x) < 1.2) dd += 1.2; // el bloqueador en el aire no defiende
          if (dd < m) { m = dd; mq = q; }
        }
        // la IA fácil apunta más al centro (menos riesgo, menos peligro)
        var risk = (Math.abs(LATS[j]) > 3 ? 0.6 : 0) + (DEPTHS[i] > 7.5 ? 0.5 : 0);
        var sc = m - risk * (pr.aimNoise > 2 ? 2 : 0.6) + S._rnd(g, pr.aimNoise);
        if (blk && Math.abs(x - p.x) > 0.5) { // dónde cruza la red la línea atacante -> zona
          var y0 = p.y + (y - p.y) * (0 - p.x) / (x - p.x), gapB = Math.abs(y0 - blk.y);
          if (gapB < 0.9) sc -= 3 * read * (1 - gapB / 0.9);
          if (blk2) { var gapC = Math.abs(y0 - blk2.y); if (gapC < 0.9) sc -= 3 * read * (1 - gapC / 0.9); }
        }
        if (rivL && S.laneOf(p.y, y, cs) === rivL) sc += rivB;
        if (mc) { // IA variada: la penalización de lo repetido se guarda aparte (abajo); determinista: no toca el azar
          var ck = cellKey(i, j, sd), pen = 0;
          for (var r = 0; r < 3; r++) if (mc[r] === ck) pen += MEM.rep;
          if (mL && laneCode(p.y, y, cs) === mL) pen += MEM.lane;
          if (mR >= 0 && mq && mq.id === mR) pen += MEM.rcv;
          _ms[_mn] = sc; _mp[_mn] = pen; _mx[_mn] = x; _my[_mn] = y; _mn++;
        }
        if (sc > best) { best = sc; out[0] = x; out[1] = y; }
      }
    }
    // IA variada: entre las casillas que puntúan como mucho MEM.tol por debajo de la mejor, la de menos repetición (con la mejor si
    // no hay otra parecida): varía sin regalar el punto (Experto, que lee muy bien el hueco, sigue rematando al hueco)
    if (mc && _mn) {
      var bv = -1e9;
      for (var c = 0; c < _mn; c++) if (_ms[c] >= best - MEM.tol && _ms[c] - _mp[c] > bv) { bv = _ms[c] - _mp[c]; out[0] = _mx[c]; out[1] = _my[c]; }
      _mn = 0;
    }
    return out;
  }
  /** Destino del saque de la IA. Según el perfil: a la zona libre (entre receptores, `seam`) o a por un
   *  receptor con ruido (`srvNoise`); el fácil saca casi siempre "a las manos". */
  function serveTarget(g, sv) {
    if (g.drill) { var dt = drillServe(g, sv); if (dt) return dt; } // E6 (Entrenamiento)
    var pr = (sv.prof || g.prof[sv.team]), sd = side(sv.team), opp = g.teams[1 - sv.team];
    if (g.rng() < (pr.seam != null ? pr.seam : 1)) { var st = openSpot(g, sv, 4, _t2, false, 'srv').slice(); remember(g, sv, 'srv', st[0], st[1]); return st; }
    var qi = Math.floor(g.rng() * opp.length), q = opp[qi], n = pr.srvNoise != null ? pr.srvNoise : 1;
    // IA variada: no a por el mismo receptor 3 veces seguidas (el siguiente de la lista; sin azar nuevo)
    var R = g.aiMem && g.aiMem.rcv[sv.team];
    if (R && opp.length > 1 && R[0] >= 0 && R[0] === R[1] && q.id === R[0]) q = opp[(qi + 1) % opp.length];
    var cs = g.cs || 1, depth = clamp(Math.abs(q.x) + S._rnd(g, 1.4), 4.2 * cs, 8.2 * cs);
    var y = clamp(q.y + S._rnd(g, n), -3.9 * cs, 3.9 * cs);
    remember(g, sv, 'srv', -sd * depth, y);
    return [-sd * depth, y];
  }

  /** E6: diana del saque de la IA en el Entrenamiento (o null = la de siempre). Recepción: a por el humano ± DRILL.kinds.recv.jit m
   *  (azar de g.rng: solo en el ejercicio); Saque con autopilot (pruebas de UI): a la diana del ejercicio. */
  function drillServe(g, sv) {
    var d = g.drill, cs = g.cs || 1, h = g.ctrl;
    if (d.kind === 'recv' && sv.team === 1) {
      var j = VB.DRILL.kinds.recv.jit;
      return [clamp(h.x + S._rnd(g, j), 2 * cs, 8.2 * cs), clamp(h.y + S._rnd(g, j), -3.9 * cs, 3.9 * cs)];
    }
    if (d.kind === 'serve' && sv.team === 0 && d.target) return [d.target.x, d.target.y];
    return null;
  }

  /** Segundos que tardaría p en plantarse en el punto (x,y): aterrizar (si está en el aire), levantarse
   *  (si está en el suelo tras una plancha) y correr. */
  function timeTo(g, p, x, y) {
    var G = C.G, tl = 0, px = p.x, py = p.y;
    if (p.z > 0 || p.vz > 0) {
      tl = (p.vz + Math.sqrt(p.vz * p.vz + 2 * G * Math.max(0, p.z))) / G;
      px += p.jvx * tl; py += p.jvy * tl; tl += 0.08; // amortigua la caída
    }
    if (p.down > 0) tl = Math.max(tl, p.down + 0.05);
    var d = Math.max(0, Math.hypot(px - x, py - y) - 0.45), vm = C.SPEED * (p.prof || g.prof[p.team]).speed;
    // IA (EFFORT): arranca desde parado con aceleración constante vm/aT (sim.js stepPlayer): tramo corto sqrt(2·d·aT/vm), largo
    // d/vm + aT/2. Así digMargin y quién va al balón ven la misma carrera que luego hace
    if (!S.isHuman(g, p)) {
      var aT = S.accTOf(g, p);
      return tl + (aT > 0 && d < vm * aT * 0.5 ? Math.sqrt(2 * d * aT / vm) : d / vm + aT * 0.5);
    }
    // humano con Velocidad < 50 (p.ak.accT > 0) arranca desde parado: pierde accT/2 s respecto a la carrera instantánea
    return tl + d / vm + (p.ak && p.ak.accT > 0 && d > 0 ? p.ak.accT * 0.5 : 0);
  }
  function airLand(g, p) { // s hasta que aterriza (0 en el suelo)
    return (p.z > 0 || p.vz > 0) ? (p.vz + Math.sqrt(p.vz * p.vz + 2 * C.G * Math.max(0, p.z))) / C.G : 0;
  }
  /** ¿Lleva un humano a q? Fuera del online de varios, q === g.ctrl (el de siempre: el de la plaza activa); con varias plazas
   *  (g.mh), cualquier plaza humana: a dos humanos del mismo equipo se les da la misma preferencia (notes/online-multi-brief.md §8.2). */
  function hu(g, q) { return g.mh ? S.humSlot(g, q) >= 0 : g.ctrl === q; }
  function jobCost(g, p, pr) {
    var c = timeTo(g, p, pr.x, pr.y);
    // en el aire y el balón llega antes de que pueda aterrizar y moverse: no puede ser él
    if (p.z > 0.3 && pr.t < airLand(g, p) + 0.15) c += 10;
    return c;
  }

  /** Quién de este equipo tiene que ir al balón (o null). Por tiempo hasta el balón (no por distancia),
   *  con memoria por trayectoria: solo se cambia si el otro llega claramente antes (0,3 s ~ 1,5 m),
   *  como mucho cada 0,5 s y nunca en los últimos 0,4 s (salvo que el elegido no llegue de ninguna manera). */
  function computeJob(g, t) {
    if (g.size !== 2 && VB.AI6 && VB.AI6.computeJob) return VB.AI6.computeJob(g, t); // 6v6 con su IA propia (sprint 2)
    var sd = side(t), b = g.ball, pr = g.pr1;
    if (g.mode !== 'rally' || b.held) return null;
    if (pr.x * sd <= 0) return null; // aún va al otro campo (la memoria se conserva para esta trayectoria)
    if (g.touchTeam === t && g.touches >= 3) return null;
    if (g.teams[t].length !== 2) return computeJobN(g, t, pr);
    if (g.touchTeam === t && g.touches >= 1 && g.lastPlayer) return other(g, g.lastPlayer);
    var mem = g.jobMem && g.jobMemT[t] === g.lastTouchT ? g.jobMem[t] : null;
    var a = g.teams[t][0], bb = g.teams[t][1];
    var ca = jobCost(g, a, pr), cb = jobCost(g, bb, pr), pick;
    if (mem) {
      var o = mem === a ? bb : a, cm = mem === a ? ca : cb, co = mem === a ? cb : ca;
      var clearly = co < cm - 0.3 && g.time - g.jobSwT[t] > 0.5 && pr.t > 0.4;
      // "no llega de ninguna manera": una sola vez por trayectoria (si no, al final de la jugada los dos
      // pueden parecer "sin remedio" por turnos y el control salta de uno a otro)
      var hopeless = pr.t > 0.15 && cm > pr.t + 0.35 && co < pr.t + 0.1 && co < cm - 0.2 && g.time - g.jobSwT[t] > 0.25 && !(g.jobHop && g.jobHop[t] === g.lastTouchT);
      if (hopeless && g.jobHop) g.jobHop[t] = g.lastTouchT;
      pick = (clearly || hopeless) ? o : mem;
    } else {
      // primera elección: a igualdad (±0,12 s), se queda el jugador que ya controla el humano (menos cambios de cámara)
      var bias = (g.online ? S.humOn(g, t) : t === 0) && !g.demo ? 0.12 : 0;
      pick = (ca - (hu(g, a) ? bias : 0)) <= (cb - (hu(g, bb) ? bias : 0)) ? a : bb;
    }
    if (g.jobMem) {
      if (!mem || pick !== mem) g.jobSwT[t] = g.time; // la primera elección también cuenta como cambio
      g.jobMem[t] = pick; g.jobMemT[t] = g.lastTouchT;
    }
    return pick;
  }

  /** computeJob con N jugadores (reserva genérica hasta VB.AI6): el mismo criterio que el de 2v2 (tiempo hasta el balón,
   *  memoria por trayectoria, cambio solo si otro llega claramente antes o el elegido no llega) entre todos los que pueden
   *  tocar (no repite el que acaba de tocar). Sin asignaciones. */
  function computeJobN(g, t, pr) {
    var tm = g.teams[t], excl = g.touchTeam === t && g.touches >= 1 ? g.lastPlayer : null;
    var mem = g.jobMem && g.jobMemT[t] === g.lastTouchT ? g.jobMem[t] : null;
    if (mem === excl) mem = null;
    var bias = (g.online ? S.humOn(g, t) : t === 0) && !g.demo ? 0.12 : 0, best = null, bc = 1e9, alt = null, ac = 1e9, cm = 1e9;
    for (var i = 0; i < tm.length; i++) {
      var q = tm[i]; if (q === excl) continue;
      var c = jobCost(g, q, pr);
      if (q === mem) { cm = c; continue; }
      var cb = c - (!mem && hu(g, q) ? bias : 0);
      if (cb < bc) { bc = cb; best = q; }
      if (c < ac) { ac = c; alt = q; }
    }
    var pick;
    if (mem) {
      var clearly = alt && ac < cm - 0.3 && g.time - g.jobSwT[t] > 0.5 && pr.t > 0.4;
      var hopeless = alt && pr.t > 0.15 && cm > pr.t + 0.35 && ac < pr.t + 0.1 && ac < cm - 0.2 && g.time - g.jobSwT[t] > 0.25 && !(g.jobHop && g.jobHop[t] === g.lastTouchT);
      if (hopeless && g.jobHop) g.jobHop[t] = g.lastTouchT;
      pick = (clearly || hopeless) ? alt : mem;
    } else pick = best;
    if (g.jobMem && pick) {
      if (!mem || pick !== mem) g.jobSwT[t] = g.time;
      g.jobMem[t] = pick; g.jobMemT[t] = g.lastTouchT;
    }
    return pick;
  }

  // Objetivo reutilizable (sin asignaciones por frame)
  var _tg = { x: 0, y: 0, attack: false, block: false };
  function setTg(x, y, attack, block) { _tg.x = x; _tg.y = y; _tg.attack = !!attack; _tg.block = !!block; return _tg; }

  /** Plan de la IA para el toque en curso cuando le toca el balón (2v2; una decisión por toque, p.aiPlT = g.lastTouchT):
   *  'safe' = bola de seguridad (no salta a rematar una colocación mala: la pasa desde el suelo al fondo rival),
   *  'jset' = colocación en salto (pase bueno y cerca de la red, compañero listo; prob. prof.jsetAI), '' = lo de siempre.
   *  Solo la llama pos() (y pos solo update), así el azar que gasta es determinista. Umbrales en VB.SETQ (sim.js). */
  function plan(g, p) {
    if (p.aiPlT === g.lastTouchT) return p.aiPl;
    var t = p.team, Q = VB.SETQ, pr = p.prof || g.prof[t], pl = '';
    if (Q && !g.rot && g.touchTeam === t) {
      if (S.atkPhase(g, t) && g.lastKind === 'set') {
        var sq = g.lastQ == null ? 1 : g.lastQ, ps = Q.safeP * clamp((Q.safeQ - sq) / (Q.safeQ - Q.safeLo), 0, 1);
        if (ps > 0 && g.rng() < ps) pl = 'safe';
      } else if (g.touches === 1 && g.lastKind === 'pass' && (g.lastQ == null ? 1 : g.lastQ) >= Q.jsQ && (pr.jsetAI || 0) > 0 &&
                 Math.abs(g.pr3.x) < Q.jsX && g.pr3.x * side(t) > 0.3 && g.pr3.z > 2.5) {
        var mate = other(g, p), sd = side(t);
        var ready = mate.down <= 0 && mate.z === 0 && timeTo(g, mate, sd * 1.85, clamp(mate.y, -3.6 * (g.cs || 1), 3.6 * (g.cs || 1))) < Q.jsMate &&
                    timeTo(g, p, g.pr3.x + sd * 0.35, g.pr3.y) < g.pr3.t - 0.5;
        if (ready && g.rng() < pr.jsetAI) pl = 'jset';
      }
    }
    p.aiPlT = g.lastTouchT; p.aiPl = pl;
    return pl;
  }
  /** Jugador de la IA del equipo t que está colocando en salto ahora mismo (plan 'jset' y ya en el aire), o null. */
  function aiJsetUp(g, t) {
    var q = g.jobs[t];
    return q && g.touchTeam === t && g.touches === 1 && q.aiPl === 'jset' && q.aiPlT === g.lastTouchT && q.z > 0.05 ? q : null;
  }

  var _pv = { x: 0, y: 0, tempo: '', ok: true, to: null, bx: 0, by: 0 }; // (C2: vista previa de la colocación del humano)
  var _ja = { on: false, x: 0, y: 0, ax: 0, ay: 0, tempo: '', apex: 0, moved: false, bx: 0, by: 0, ok: true }; // (salto con impulso: diana de la colocación en salto)
  /** Posición objetivo de un jugador según la fase del rally. */
  function pos(g, p) {
    if (g.size !== 2 && VB.AI6 && VB.AI6.pos) return VB.AI6.pos(g, p); // 6v6 con su IA propia (sprint 2)
    var t = p.team, sd = side(t), mate = other(g, p), job = g.jobs[t], idx = p.idx, mine = g.touchTeam === t, cs = g.cs || 1;
    if (job === p) {
      // a atacar: tras el 2º toque propio o tras una colocación en salto en el 1r (S.atkPhase); con una colocación mala, a veces
      // bola de seguridad (plan 'safe': no salta). Colocación en salto (plan 'jset'): salta como para rematar y coloca en el aire
      var pl = g.teams[t].length === 2 ? plan(g, p) : '';
      if (pl !== 'safe' && (S.atkPhase(g, t) || pl === 'jset') && Math.abs(g.pr3.x) < 3.8 && g.pr3.z > 2.5) return setTg(g.pr3.x + sd * 0.35, g.pr3.y, true, false);
      return setTg(g.pr1.x + sd * 0.2, g.pr1.y);
    }
    if (g.teams[t].length !== 2) return posN(g, p);
    if (job === mate) {
      if (!mine) {
        // El balón aún viene: no se abandona la defensa. Con un ataque o un saque potente en camino, el que no va
        // al balón cubre (el que está en la red, la dejada; el de atrás, el fondo contrario a su compañero).
        // Solo sale a colocar cuando el balón está a punto de llegar a su compañero.
        var hard = g.hardIn || g.lastKind === 'spike' || g.lastKind === 'block';
        if (hard || g.pr1.t > 0.75) {
          if (Math.abs(p.x) < 2.6 && g.lastKind !== 'serve') return setTg(sd * 1.9, clamp((g.pr1.y + p.y) * 0.5, -3.5 * cs, 3.5 * cs));
          var cy = clamp(mate.y + (mate.y > 0 ? -3.2 : 3.2) * cs, -3.6 * cs, 3.6 * cs);
          if (g.lastKind === 'serve') return setTg(sd * 6.2 * cs, (idx ? 2.2 : -2.2) * cs);
          return setTg(sd * clamp(Math.abs(p.x), 4.2 * cs, 6.5 * cs), cy);
        }
        return setTg(sd * 2, clamp(p.y, -1.5, 1.5)); // seré el colocador
      }
      if (g.touches === 0) return setTg(sd * 2, clamp(p.y, -1.5, 1.5)); // tras tocar nuestro bloqueo: colocador
      if (g.touches === 1 && g.lastKind !== 'set') { // seré el atacante (no tras mi colocación en salto)
        // C2 (colocar por destino, con g.mastery): el humano coloca y el marcador ya dice adónde; me voy a la batida de ese destino
        // (S.setPreview, lectura pura y sin azar; cambia si el humano cambia de dirección). Con él en el aire, lo de siempre
        if (g.mastery && (g.online ? S.humOn(g, t) : t === 0) && mate === g.ctrl && mate.z <= 0.05 && S.setPreview(g, _pv)) return setTg(_pv.bx, _pv.by);
        // salto con impulso (g.jsetAim): el humano en el aire ha movido la diana de su colocación en salto: a la batida de ese destino
        if (g.jsetAim && mate === g.ctrl && mate.z > 0.05 && S.jsetAimInfo && S.jsetAimInfo(g, _ja) && _ja.moved) return setTg(_ja.bx, _ja.by);
        return setTg(sd * 4.3 * cs, clamp(p.y, -3 * cs, 3 * cs));
      }
      return setTg(sd * 5.5 * cs, (idx ? 2 : -2) * cs);
    }
    var opp = 1 - t;
    // lectura de la colocación en salto: el humano rival salta junto a la red en un toque donde puede colocar en salto
    // (S.jsetReady; nunca en CPU contra CPU). El bloqueador no espera a la colocación: se va ya a la red frente a su atacante
    // (sin saltar mientras no se vea el gesto) y el otro a defender. Si el humano arma un ataque (GOLPEAR o dejada en el aire)
    // salta a bloquearle a él: si no, quedaba plantado en la red sin bloquear ni defender y el ataque en 2º toque ganaba
    // más (35 → 51 % en Normal). Sin esta lectura, tras una colocación en salto (0,8 s hasta el remate) el bloqueo no
    // llegaba nunca. Tras el toque sigue con este objetivo (reacción) y luego pasa al bloqueo normal de abajo.
    // La IA rival que coloca en salto (plan 'jset', ya en el aire) se lee igual, sin el gesto de ataque.
    // (online: el humano rival es el del otro hueco, S.jsetHum lo lee con su hueco activo y deja su gesto en S.jsetHumSw)
    var jsH = g.online && !S.atkPhase(g, opp) ? S.jsetHum(g, opp) : null;
    var jsP = !S.atkPhase(g, opp) ? (g.online ? jsH || aiJsetUp(g, opp) : (opp === 0 && S.jsetReady(g) ? g.ctrl : aiJsetUp(g, opp))) : null;
    if (jsP) {
      var hJs = g.online ? !!jsH && jsP === jsH : jsP === g.ctrl && opp === 0 && !g.demo && !g.autopilot;
      var ay0 = other(g, jsP).y, bl0 = ay0 < 0 ? g.teams[t][0] : g.teams[t][1];
      var atk0 = g.online ? hJs && S.jsetHumSw.live && S.jsetHumSw.shot !== 'jset' : hJs && g.swingLive && g.swingShot !== 'jset';
      if (p === bl0) return setTg(sd * 0.6, clamp(atk0 ? jsP.y : ay0, -4.2 * cs, 4.2 * cs), false, atk0);
      return setTg(sd * 5.4 * cs, clamp(-ay0 * 0.3, -2 * cs, 2 * cs));
    }
    if (S.atkPhase(g, opp) && g.pr3.x * side(opp) > 0) { // el rival va a atacar
      var bl = g.pr3.y < 0 ? g.teams[t][0] : g.teams[t][1];
      // con humano: el rol lo fija la sim al colocar la CPU (g.defRole: 'dig' = el humano defiende y bloquea su
      // compañero IA; 'block' = bloquea el humano). Antes de eso, el compañero IA bloquea si el humano está atrás.
      if (g.online ? S.humOn(g, t) : t === 0 && !g.demo && !g.autopilot) {
        var hc = g.ctrl, hm = other(g, hc);
        bl = g.defRole === 'block' ? hc : g.defRole === 'dig' ? hm : (Math.abs(hc.x) > 4 ? hm : hc);
      }
      if (t === 0 && g.drill) bl = g.ctrl; // E6 (Bloqueo, también con autopilot): bloquea el del humano
      if (p === bl) return setTg(sd * 0.6, clamp(g.pr3.y + g.blockOff[t] + (g.scout ? studyShift(g, t) : 0) + (S.isHuman(g, p) ? 0 : readShift(g, t)), -4.2 * cs, 4.2 * cs), false, true);
      // defensor: a media pista, algo hacia la diagonal (el bloqueo tapa parte de la paralela), sin dejar
      // vendida la línea: desde ahí llega a la diagonal y, lanzándose, a la paralela
      var ay = g.pr3.y;
      return setTg(sd * 5.4 * cs, clamp(-ay * 0.3 + (g.scout ? studyLean(g, t) : 0) + (S.isHuman(g, p) ? 0 : readLean(g, t)), -2 * cs, 2 * cs));
    }
    return setTg(sd * 6.2 * cs, (idx ? 2.2 : -2.2) * cs);
  }

  var _zp = { x: 0, y: 0 };
  /** pos con N jugadores (reserva genérica hasta VB.AI6) para quien no va al balón: con ataque rival en camino, el delantero
   *  más cercano a la colocación bloquea; el resto, a su zona base (S.zonePos). */
  function posN(g, p) {
    var t = p.team, sd = side(t), opp = 1 - t;
    if (S.atkPhase(g, opp) && g.pr3.x * side(opp) > 0 && p.front) {
      var tm = g.teams[t], bl = null, bd = 1e9;
      for (var i = 0; i < tm.length; i++) { var q = tm[i]; if (!q.front) continue; var d = Math.abs(q.y - g.pr3.y); if (d < bd) { bd = d; bl = q; } }
      if (bl === p) return setTg(sd * 0.6, clamp(g.pr3.y + g.blockOff[t], -4.2, 4.2), false, true);
    }
    S.zonePos(t, p.zone || 6, _zp);
    return setTg(_zp.x, _zp.y);
  }

  var SHANK_SURPRISE = 0.4; // s que tarda en reaccionar al balón desviado por su compañero
  var TEAM_GAP = 0.2;       // s mínimos entre el toque de un compañero y el siguiente toque de la IA (salvo balón que se va)
  var DODGE_R = 0.9;        // m: el que acaba de tocar se aparta de la caída de su propio balón (evita dobles de cuerpo)
  /** El jugador que acaba de tocar no puede volver a tocar (dobles): si su balón le va a caer encima (cruce a 1 m de
   *  altura en su campo, cerca de su objetivo), aparta el objetivo a DODGE_R del punto de caída. Muta tg. */
  function dodgeOwnBall(g, p, tg) {
    var pr = g.pr1, sd = side(p.team);
    if (pr.x * sd <= 0 || pr.t > 1.6) return;
    var dx = tg.x - pr.x, dy = tg.y - pr.y, d = Math.hypot(dx, dy);
    if (d >= DODGE_R) return;
    if (d < 0.05) { dx = p.x - pr.x; dy = p.y - pr.y; d = Math.hypot(dx, dy); }
    if (d < 0.05) { dx = sd; dy = 0; d = 1; }         // justo debajo: atrás, hacia su fondo
    tg.x = pr.x + dx / d * DODGE_R; tg.y = clamp(pr.y + dy / d * DODGE_R, -4.4 * (g.cs || 1), 4.4 * (g.cs || 1));
  }
  var _w = { t: 0, d: 0, dz: 0, reach: false, kind: '', zc: 0, x: 0, y: 0, z: 0, active: false, canReach: false };

  function aiJump(g, p) {
    var sd = side(p.team), pr = (p.prof || g.prof[p.team]);
    var jvx = p.vx * 0.3, jvy = p.vy * 0.3, jl = Math.hypot(jvx, jvy);
    if (jl > 0.6) { jvx *= 0.6 / jl; jvy *= 0.6 / jl; }
    // corrige la deriva hacia la red (salvo despiste ocasional)
    var land = (p.x + jvx * 0.98) * sd;
    if (land < 0.45 && jvx * sd < 0 && g.rng() >= pr.netErr) jvx = 0;
    S._jump(g, p, jvx, jvy);
  }

  /** ¿Deja botar el saque rival? Se decide UNA vez por saque, cuando el balón ya ha pasado a su campo, con el bote previsto
   *  (S.predictLanding, sin el baile del flotante) y S.lineDist (+ dentro, − fuera). Lejos de la línea acierta siempre; cerca
   *  se equivoca a veces (la juega aunque vaya fuera o la deja aunque entre), más cuanto peor recibe el perfil (pr.recv).
   *  La duda está centrada 10 cm por fuera: ante un balón dudoso el receptor prefiere jugarlo. */
  var _land = { x: 0, y: 0, z: 0, t: 0 };
  function leaveServe(g, p, pr) {
    var b = g.ball, sd = side(p.team), lv = g._lv || (g._lv = [{ t: -1, on: false }, { t: -1, on: false }]), L = lv[p.team];
    if (L.t === g.lastTouchT) return L.on;                   // una decisión por saque y equipo (aunque cambie quién va)
    if (b.x * sd <= 0.2) return false;                       // aún no ha pasado la red: todavía no decide
    L.t = g.lastTouchT; L.on = false;
    S.predictLanding(g, _land);
    if (_land.x * sd <= 0) return false;                     // se queda en la red / su propio campo
    var d = S.lineDist(_land.x, _land.y, g), w = 0.22 + (1 - (pr.recv || 0.8)) * 0.9;
    var x = clamp((d + 0.1 + w) / (2 * w), 0, 1), play = x * x * (3 - 2 * x);
    L.on = play < 1 && g.rng() >= play;
    return L.on;
  }

  /** E6 (Remate con bloqueador): el rival solo hace la rama de bloqueo de pos/update. Se planta en la red frente a la colocación
   *  (g.pr3 + su error g.blockOff) tras su reacción y salta cuando ve despegar al atacante, con el retardo de su perfil. Nunca juega el balón. */
  function blockOnly(g, p, dt) {
    var t = p.team, sd = side(t), pr = p.prof || g.prof[t], cs = g.cs || 1, mx = 0, my = 0;
    var atk = S.atkPhase(g, 1 - t) && g.pr3.x * side(1 - t) > 0;
    var tx = sd * 0.6, ty = atk ? clamp(g.pr3.y + g.blockOff[t], -4.2 * cs, 4.2 * cs) : p.y;
    if (g.time - g.lastTouchT < S.aiReact(g, p, pr)) ty = p.y;
    if (p.z === 0) {
      var dx = tx - p.x, dy = ty - p.y, dl = Math.hypot(dx, dy);
      if (dl > 0.05) { var f = Math.min(1, dl / 0.35) * pr.speed; mx = dx / dl * f; my = dy / dl * f; }
    }
    S._stepPlayer(g, p, dt, mx, my);
    if (g.mode !== 'rally' || !atk || p.z !== 0 || p.vz !== 0 || p.down > 0) return;
    var opp = g.teams[1 - t], up = false;
    for (var a = 0; a < opp.length && !up; a++) up = opp[a].z > 0.1 && Math.abs(opp[a].x) < 4;
    if (up && Math.abs(p.x) < 1.3) { p.bd += dt; if (p.bd > p.bdT) { aiJump(g, p); p.bd = 0; p.bdT = pr.blockReact + g.rng() * 0.1; } }
    else p.bd = 0;
  }

  /** E2: ¿deja pasar el equipo team el saque en curso? (lectura pura de la decisión de leaveServe, g._lv; false si no hay). */
  function leaving(g, team) {
    var L = g._lv && g._lv[team];
    return !!(L && L.on && L.t === g.lastTouchT);
  }

  /** ¿Juega p (IA, no es el que va al balón) un balón que va al suelo a su lado? Solo cuando el elegido (g.jobs, IA) ya no llega ni
   *  en plancha y p sí (de pie o en plancha), ya ha leído la jugada (react) y el balón baja en su campo. EFFORT (18-nov-2026): antes,
   *  en 6v6, el compañero que tenía el balón al alcance lo dejaba caer por no ser el elegido (AI6.computeJob elige por pr1 y no cambia
   *  en las últimas décimas): el «dejan que caiga» de Ferran. Pura (no gasta g.rng). */
  function rescue(g, p, react, since) {
    var t = p.team, J = g.jobs[t], b = g.ball;
    if (!J || J === p || S.isHuman(g, J) || since <= react || b.vz >= 0 || b.z > 1.3 || b.x * side(t) <= 0.2) return false;
    if (g.touchTeam === t && (g.touches >= 3 || g.lastPlayer === p)) return false;
    // solo defensa: balón del rival, rebote del bloqueo o desviada del compañero (nunca le roba al atacante su colocación)
    if (g.touchTeam === t && g.lastKind !== 'block' && g.lastShot !== 'shank' && g.lastShot !== 'body') return false;
    if (g.lastKind === 'serve' && leaving(g, t)) return false; // (el saque que el equipo deja botar porque se va fuera, E2)
    if (S.canReach(g, J) || S.canDive(g, J)) return false;
    return S.canReach(g, p) || (b.z < 0.95 && S.canDive(g, p));
  }

  /** Un paso de IA para el jugador p (mueve, salta, golpea). */
  function update(g, p, dt) {
    if (g.drill && g.drill.cpu === 'block' && p.team === 1) { blockOnly(g, p, dt); return; } // E6 (Remate desde la 6ª)
    var t = p.team, sd = side(t), pr = p.prof || g.prof[t], mx = 0, my = 0, b = g.ball;
    // insignias (Líder del compañero, Sangre fría): reacción y timing efectivos; sin insignias = los del perfil
    var react = S.aiReactEff(g, p, S.aiReact(g, p, pr)), timing = S.aiTiming(g, p, pr); // (reacción efectiva del modelo de esfuerzo, EFFORT)
    // E1 (maestría, solo con g.mastery): la CPU lee tarde la finta del humano (feintRead) y, en Difícil/Experto, antes la dejada a la
    // vista (tipRead). Sin azar: solo mueve el retardo de reacción
    // El que estaba en el aire al llegar la finta (el bloqueador que saltó contra el remate armado) sigue engañado feintRead s DESPUÉS
    // de caer: sin eso la dejada por encima del bloqueo la recogía siempre él al aterrizar, a 1-2 m, y la finta no valía nada
    if (g.feintOn && (g.online ? g.lastTeam === 1 - t : t === 1 && g.lastTeam === 0)) { // (g.feintOn: con g.mastery, o la finta sola del 6v6)
      if (g.feintT === g.lastTouchT) {
        if (p.e1T !== g.lastTouchT) { p.e1T = g.lastTouchT; p.e1Until = g.time + (pr.feintRead || 0) + (p.z > 0 ? (p.vz + Math.sqrt(p.vz * p.vz + 2 * C.G * p.z)) / C.G : 0); }
        react = Math.max(react + (pr.feintRead || 0), p.e1Until - g.lastTouchT);
        if (g.feintFool) react += VB.EFFORT.feintReact; // la finta que engaña (hk, sim.js): lee aún más tarde, pero corre a tope
      } else if (g.mastery && g.lastKind === 'free' && g.lastShot === 'tip') react = Math.max(0, react - (pr.tipRead || 0));
    }
    // MODELO DE ESFUERZO (EFFORT, sim.js, 18-nov-2026): ya no hay defensor «perdido» (antes, con el dado g.digOk en contra, leía
    // tarde y corría al 60 %, 30 % en 6v6). Siempre va a tope de sus stats; si no llega es por su reacción, su arrancada, su
    // velocidad y su alcance, y si llega, el dado de controlarla se tira en el contacto (sim.js effortFail)
    // reacción: tras cada toque, durante react (la efectiva, con spikeRead ante un remate) sigue con el objetivo anterior
    // EFFORT: la lectura de cada balón rival varía (como la reacción del humano): a veces lo lee pronto y llega cómodo, a veces tarde y
    // no llega aunque corra a tope. Solo con un balón rival por leer (S.preLate: remate, dejada o balón libre, bloqueo, o el que roza su
    // bloqueo; no el saque ni el juego propio). aiRk se muestrea con aiTe (abajo) en el primer paso del toque; hasta entonces, sin variación
    if (p.aiTeT === g.lastTouchT && S.preLate(g, p)) react *= p.aiRk || 1;
    var tx, ty, attack, block, since = g.time - g.lastTouchT;
    // recepción/defensa del compañero que sale desviada: sorpresa, tarda en leerla (no la intercepta al vuelo)
    var shankT = (g.lastShot === 'shank' || g.lastShot === 'body') && g.touchTeam === t ? SHANK_SURPRISE : 0;
    if (since < react + shankT) {
      if (p.tgTime != null && p.tgTime <= g.lastTouchT && g.lastTouchT - p.tgTime < 0.3) {
        tx = p.tgx; ty = p.tgy; attack = p.tgA; block = p.tgB; // sigue con lo que hacía
      } else { tx = p.x; ty = p.y; attack = block = false; }   // aún no ha leído la jugada
    } else {
      var tg = pos(g, p);
      if (g.touchTeam === t && g.lastPlayer === p && g.jobs[t] !== p) dodgeOwnBall(g, p, tg);
      tx = p.tgx = tg.x; ty = p.tgy = tg.y; attack = p.tgA = tg.attack; block = p.tgB = tg.block; p.tgTime = g.time;
    }
    if (p.z === 0) {
      var dx = tx - p.x, dy = ty - p.y, dl = Math.hypot(dx, dy);
      if (dl > 0.05) { var f = Math.min(1, dl / 0.35) * pr.speed; mx = dx / dl * f; my = dy / dl * f; }
    }
    S._stepPlayer(g, p, dt, mx, my);
    if (g.mode !== 'rally') return;
    // nuevo toque: muestrea los desfases de esta jugada
    if (p.aiTeT !== g.lastTouchT) {
      p.aiTeT = g.lastTouchT;
      p.aiTe = clamp(S._gauss(g) * timing, -0.25, 0.25);
      p.aiJt = clamp(S._gauss(g) * timing * 0.8, -0.15, 0.15);
      // EFFORT (lectura): ×lognormal(reactSd), recortado a ±2σ y como mucho ×rkHi (solo cuenta con el balón rival por leer, ver arriba). Con S.hk (hash del
      // estado y del jugador), no con g.rng: así la secuencia de g.rng no cambia y el resto del juego (saques, recepción...) sigue igual
      var EF = VB.EFFORT;
      if (EF.reactSd > 0) {
        var hs = 0xEF0 + p.id * 8 + (g.lastKind === 'block' ? 4 : 0); // (el bloqueo no suma g.rally.hits: otra sal para no repetir la del remate)
        var hz = (S.hk(g, hs) + S.hk(g, hs + 1) + S.hk(g, hs + 2) + S.hk(g, hs + 3) - 2) * 1.732; // ~N(0,1)
        p.aiRk = Math.min(EF.rkHi, Math.exp(clamp(hz, -2, 2) * EF.reactSd)); // (revisión 2: cola lenta recortada a ×rkHi)
      } else p.aiRk = 1;
    }
    if (p.z === 0 && p.vz === 0 && p.down <= 0) {
      if (attack && g.pr3.t < 0.47 * (p.ak ? p.ak.jump : 1) + p.aiJt && Math.hypot(g.pr3.x + sd * 0.35 - p.x, g.pr3.y - p.y) < 1) aiJump(g, p);
      if (block) {
        var opp = g.teams[1 - t], att = false;
        for (var a = 0; a < opp.length && !att; a++) att = opp[a].z > 0.1 && Math.abs(opp[a].x) < 4;
        if (att && Math.abs(p.x) < 1.3) { p.bd += dt; if (p.bd > p.bdT) { aiJump(g, p); p.bd = 0; p.bdT = pr.blockReact + g.rng() * 0.1; } }
        else p.bd = 0;
      }
    }
    if ((g.jobs[t] !== p && !rescue(g, p, react, since)) || p.cool > 0 || since < shankT) return;
    // no se ataca el saque rival por encima de la red (regla 13.3.4): en el aire, deja pasar el saque
    if (g.lastKind === 'serve' && p.z > 0.25 && b.z > C.NET_H) return;
    // saque rival que se va fuera: se deja botar (si no, apuntar a las líneas no tenía ningún riesgo)
    if (g.lastKind === 'serve' && g.touchTeam !== t && leaveServe(g, p, pr)) return;
    if (!S.canReach(g, p)) {
      // plancha: el balón se va al suelo fuera del alcance normal
      if (since > react && b.vz < 0 && b.z < 0.95 && S.canDive(g, p)) {
        var wd = S.hitWindow(g, p, _w);
        if (!wd.reach || b.z < 0.5) S._dive(g, p, null, -wd.t + p.aiTe * 0.5);
      } else if (since > Math.min(react, VB.EFFORT.missReact) && b.vz < 0 && !S.canDive(g, p) && S.canDiveMiss(g, p)) {
        // EFFORT: no llega ni en plancha, por poco: se tira igual (lo intenta). Es un reflejo (missReact): también si el balón le pasa
        // al lado antes de acabar su reacción (sin esto, en 6v6 y en la playa, con remates de ~0,4 s, se quedaba quieto mirándolo)
        S._diveMiss(g, p);
      }
      return;
    }
    var rx = b.x - p.x, ry = b.y - p.y, hd = Math.hypot(rx, ry);
    // EFFORT (preR): antes de leer el balón rival (since < react) solo saca de reflejo lo que le llega cerca del cuerpo (preR × su
    // alcance); lo que pasa más lejos le pilla sin reaccionar: se estira tarde (plancha fallida, el mismo gesto que diveMiss) y cae.
    // Sin esto el defensor quieto que aún no había leído el remate lo sacaba igual si le pasaba al alcance (6v6: casi todo)
    var pR = S.preROf(g);
    // REVISIÓN 2 (18-nov): nunca deja botar sin gesto un balón que le pasa al alcance. Antes el estirón solo salía con el balón por
    // debajo de missZ + 0,4 m, y en los remates rápidos de 6v6 (~0,3 s de vuelo) casi nunca a tiempo: 15 % de los que caían sin tocar
    // botaban al alcance de un defensor quieto. Ahora, pasado el reflejo (missReact), si el balón va a botar antes de que acabe de
    // leerlo y en menos de preT s, se tira (plancha fallida: lo intenta y no llega por su reacción)
    if (pR > 0 && since < react && hd > pR * S.reachOf(g, p) && S.preLate(g, p)) {
      if (since > VB.EFFORT.missReact && b.vz < 0 && S.missLands(g)) {
        var lt = S.landT(g);
        if (lt < VB.EFFORT.preT && lt < react - since) S._diveMiss(g, p);
      }
      return;
    }
    var w = S.hitWindow(g, p, _w);
    var exiting = (hd > C.REACH - 0.15 && rx * b.vx + ry * b.vy > 0) || (b.z - p.z < 0.3 && b.vz < 0) || (p.z > 0 && p.z < 0.3 && p.vz < 0);
    if (g.touchTeam === t && since < TEAM_GAP && !exiting) return; // el balón aún sale de las manos del compañero
    // C2 (con g.mastery): la colocación del humano va a un sitio de ataque; el compañero no la juega de pie cuando le pasa cerca al salir
    // (exiting): espera a rematarla en su batida (sin azar; solo lee el estado)
    if (g.mastery && (g.online ? S.humOn(g, t) : t === 0) && g.lastKind === 'set' && g.touches === 2 && g.lastPlayer === g.ctrl && p.z === 0 && g.pr3.t > 0.25 &&
        Math.abs(g.pr3.x) < 3.8 && g.pr3.z > 2.5) return;
    if (!(w.t <= -p.aiTe || exiting || !w.reach)) return;
    // ¿qué hace con el balón?
    var shot = '', tgt = null, count = g.touchTeam === t ? g.touches + 1 : 1;
    if (p.z > 0.25 && Math.abs(b.x) < 3.8 && b.z > C.NET_H + 0.1 && count === 2 && p.aiPl === 'jset' && p.aiPlT === g.lastTouchT) {
      shot = 'jset'; // colocación en salto de la IA (plan): hacia la zona de ataque del compañero (sim.js JSET)
    } else if (p.z > 0.25 && Math.abs(b.x) < 3.8 && b.z > C.NET_H + 0.1) {
      var opp2 = g.teams[1 - t], blockUp = false;
      for (var k = 0; k < opp2.length; k++) if (opp2[k].z > 0.3 && Math.abs(opp2[k].x) < 1.2 && Math.abs(opp2[k].y - p.y) < 1.2) blockUp = true;
      if (blockUp && g.rng() < pr.tip) { shot = 'tip'; tgt = [-sd * (1.3 + g.rng() * 1.4), clamp(-p.y * 0.6 + S._rnd(g, 1.5), -3.6 * (g.cs || 1), 3.6 * (g.cs || 1))]; } // playa: pokey (sim)
      // E1 (g.mastery): golpe colocado por encima del bloqueo, al fondo libre (decisión con S.hk: no gasta g.rng)
      else if (blockUp && g.mastery && S.hk(g, 0xE12) < (pr.roll || 0)) { shot = 'roll'; tgt = openSpot(g, p, 6.5, [0, 0], true, 'atk'); }
      else tgt = openSpot(g, p, 2.2, [0, 0], true, 'atk');
      if (shot !== 'tip') remember(g, p, 'atk', tgt[0], tgt[1]); // IA variada
      if (g.drill && t === 0 && g.drill.kind === 'atk' && g.drill.target && shot !== 'tip') { tgt = [g.drill.target.x, g.drill.target.y]; shot = ''; } // E6 (autopilot): a la diana
    } else if (count === 3) tgt = openSpot(g, p, 4, [0, 0]);
    S._hit(g, p, null, -w.t, shot, tgt);
  }

  VB.AI = { aim: aim, computeJob: computeJob, pos: pos, update: update, serveTarget: serveTarget, openSpot: openSpot, timeTo: timeTo,
    remember: remember, MEM: MEM, // IA variada (1.22.0): memoria corta de remate y saque (g.aiMem)
    leaving: leaving, // (E2: VB.AI.leaving(g, team))
    // «Te tienen estudiado» (sin g.scout, 0)
    studyShift: studyShift, studyLean: studyLean, studyLean6: studyLean6, readShift: readShift, readLean: readLean, readLean6: readLean6, readSide: readSide, RDX: RDX, BLK_SHIFT: BLK_SHIFT, DEF_LEAN: DEF_LEAN, DEF_LEAN6: DEF_LEAN6, RIV_B: RIV_B };
})();
