#!/usr/bin/env node
/* MAKE THE CUT — tools/semanatest.js (owner: ui_main)
 * Prueba de «La situación de la semana» (js/semana.js) sin navegador: vm con un localStorage falso y js/retos.js + js/matchstats.js +
 * js/semana.js (+ js/recap.js para el modelo de la hoja final).
 *  1) Tabla congelada de 8 semanas (2026-47 … 2027-02): la situación exacta (si cambia, cambia para todos los jugadores: no se toca).
 *  2) 300 semanas seguidas: nunca un set ya ganado; |diferencia| ≤ 2; el líder como mucho en T-1 salvo el deuce; 3r set siempre a 15;
 *     playa a 21; 6v6 solo en pabellón con rotación 0-5 y control «Uno»; pesos de formato cerca de 50/30/20 y «por detrás» cerca del 70 %.
 *  3) Intentos: 3 al día y el 4º begin() da null; el cambio de día da 3 nuevos; el cambio de semana vacía el estado (menos la cadena);
 *     abandon() cuenta como perdido; un intento abierto de otra sesión se da por perdido; el mejor sale de la regla de orden; con dos
 *     pestañas abiertas, ninguna pisa lo que guardó la otra; peek() no cierra el intento de otra pestaña.
 *  4) Enlace: ida y vuelta exacta; un carácter cambiado → null; nombres con '@', '<' o largos, saneados; otra semana = solo lectura; tu
 *     entrada se sustituye y no se duplica; el tope de 8 tira la más antigua que no eres tú; mergeLink es idempotente.
 *  5) MatchStats.zonesOf con un registro sintético (saque a la 1, ataque a la 4, bloqueado = sin zona; 6v6 solo tu jugador).
 *  6) Guardado roto o con basura: se usa uno vacío sin romper nada.
 *  7) Recap.endModel con d.sit: título, bloque «Situación» y botones (Otro intento / Compartir / Ver el grupo / Menú principal).
 * Uso: node tools/semanatest.js   (sale con código 1 si algo falla)
 */
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm');
const ROOT = path.join(__dirname, '..');
let fails = 0, oks = 0;
function ok(name, cond, extra) { if (cond) { oks++; console.log('  ok   ' + name + (extra ? '  (' + extra + ')' : '')); } else { fails++; console.log('  FALLO ' + name + (extra ? '  (' + extra + ')' : '')); } }
function fakeStorage(init) {
  const m = new Map(Object.entries(init || {}));
  return { getItem: k => (m.has(k) ? m.get(k) : null), setItem: (k, v) => { m.set(k, String(v)); }, removeItem: k => { m.delete(k); }, _m: m };
}
function load(store) {
  const ctx = { console, Math, Date, JSON, localStorage: store, location: { origin: 'https://ejemplo.test', pathname: '/mtc/' } };
  ctx.window = ctx; ctx.globalThis = ctx;
  vm.createContext(ctx);
  for (const f of ['js/retos.js', 'js/matchstats.js', 'js/semana.js', 'js/recap.js']) vm.runInContext(fs.readFileSync(path.join(ROOT, f), 'utf8'), ctx, { filename: f });
  return ctx.VB;
}
const J = o => JSON.stringify(o);

// ------------------------------------------------------------------ 1) tabla congelada
console.log('1) Tabla congelada de 8 semanas');
{
  const VB = load(fakeStorage()), S = VB.Semana;
  const W = [202647, 202648, 202649, 202650, 202651, 202652, 202701, 202702];
  const row = s => [s.wk, s.fmt, s.kind, s.map, s.fam, s.score.join('-'), s.serving, s.srvIdx, s.six ? s.rot.join('') : '-', s.difficulty].join(' ');
  const got = W.map(w => row(S.situation(w)));
  if (process.env.SEM_PRINT) console.log(got.map(r => "    '" + r + "',").join('\n'));
  const FROZEN = [
    '202647 2v2 beach moll tercer 15-15 1 1 - hard',
    '202648 2v2 hall cupula tercer 14-15 1 1 - hard',
    '202649 2v2 hall canrebot tercer 12-14 0 0 - hard',
    '202650 6v6 hall canrebot unico 24-22 1 0 31 normal',
    '202651 2v2 hall palau unico 25-25 0 1 - hard',
    '202652 2v2 hall canrebot unico 23-23 0 0 - normal',
    '202701 2v2 beach fanals tercer 14-15 0 1 - hard',
    '202702 6v6 hall palau tercer 11-13 1 1 54 normal'
  ];
  if (FROZEN[0] === 'FROZEN') { console.log(got.join('\n')); ok('tabla (sin congelar aún)', false); }
  else for (let i = 0; i < W.length; i++) ok('semana ' + W[i] + ': ' + FROZEN[i], got[i] === FROZEN[i], got[i] !== FROZEN[i] ? 'sale ' + got[i] : '');
  const s47 = S.situation(202647);
  ok('situación determinista (dos veces lo mismo, sin g.rng)', J(S.situation(202647)) === J(s47));
  ok('texto largo con ordinales y dos puntos', /^(Set único a (25|21)|3r set a 15): \d+-\d+, (saca el rival|sacas tú|sacáis vosotros)$/.test(s47.label), s47.label);
}

// ------------------------------------------------------------------ 2) 300 semanas
console.log('2) 300 semanas seguidas');
{
  const VB = load(fakeStorage()), S = VB.Semana;
  let bad = [], n = 0, f = { '2v2hall': 0, '2v2beach': 0, '6v6hall': 0 }, behind = 0, tied = 0, fam3 = 0, hard = 0;
  let y = 2026, w = 1;
  for (let i = 0; i < 300; i++) {
    const wk = y * 100 + w; w++; if (w > 52) { w = 1; y++; }
    const s = S.situation(wk); n++;
    f[s.fmt + s.kind]++;
    const [a, b] = s.score, T = s.T, d = a - b, lead = Math.max(a, b);
    if (a < b) behind++; else if (a === b) tied++;
    if (s.fam === 'tercer') fam3++;
    if (s.difficulty === 'hard') hard++;
    const deuce = a >= T - 1 && b >= T - 1;
    if (Math.abs(d) > 2) bad.push(wk + ' dif ' + d);
    if (!deuce && lead > T - 1) bad.push(wk + ' líder ' + lead);
    if (deuce && Math.abs(d) > 1) bad.push(wk + ' deuce ' + a + '-' + b);
    if ((a >= T || b >= T) && Math.abs(d) >= 2) bad.push(wk + ' set ganado');
    if (s.fam === 'tercer' && (T !== 15 || s.setNo !== 3 || s.opts.start.bo1)) bad.push(wk + ' 3r set');
    if (s.fam === 'unico' && (s.setNo !== 1 || !s.opts.start.bo1 || T !== (s.kind === 'beach' ? 21 : 25))) bad.push(wk + ' set único');
    if (s.kind === 'beach' && s.opts.points !== 21) bad.push(wk + ' playa');
    if (s.six && (s.kind !== 'hall' || s.opts.ctrl !== 'one' || s.rot.some(k => k < 0 || k > 5) || !/^Rotación [1-6]$/.test(s.rotLbl))) bad.push(wk + ' 6v6');
    if (!s.six && s.opts.ctrl !== 'both') bad.push(wk + ' control');
    if (!s.opts.noAttrs || !s.opts.noBadges || s.opts.reto) bad.push(wk + ' parejos');
    if (!s.mapName || VB.Retos.MAPS[s.map].kind !== s.kind) bad.push(wk + ' sede');
  }
  ok('invariantes en 300 semanas', !bad.length, bad.slice(0, 6).join(', '));
  const p = k => f[k] / n;
  ok('formato cerca de 50/30/20', Math.abs(p('2v2hall') - 0.5) < 0.08 && Math.abs(p('2v2beach') - 0.3) < 0.08 && Math.abs(p('6v6hall') - 0.2) < 0.07, J(f));
  ok('«vas por detrás» cerca del 70 % (empate ~20 %)', Math.abs(behind / n - 0.7) < 0.08 && Math.abs(tied / n - 0.2) < 0.07, behind + '/' + tied + ' de ' + n);
  ok('3r set cerca del 40 % y Difícil cerca del 60 %', Math.abs(fam3 / n - 0.4) < 0.08 && Math.abs(hard / n - 0.6) < 0.08, fam3 + ' / ' + hard);
}

// ------------------------------------------------------------------ 3) intentos
console.log('3) Intentos, mejor y cambios de día y de semana');
{
  const st = fakeStorage(), VB = load(st), S = VB.Semana;
  S._now(20261123);   // lunes de la semana 48
  const sit = S.situation();
  ok('semana de la fecha fijada', sit.wk === 202648 && S.state().wk === 202648, String(sit.wk));
  ok('3 intentos al empezar', S.left() === 3);
  const o1 = S.begin();
  ok('begin() gasta el intento al empezar y da las opciones', o1 && o1.sit.i === 1 && S.left() === 2 && J(o1.start) === J(sit.opts.start) && o1.seed > 0, o1 && J(o1.sit));
  ok('la semilla es la misma para todos en el mismo intento', (load(fakeStorage()).Semana._hash('mtc-sem-' + sit.wk + '-1') & 0x7fffffff) === o1.seed);
  const T = sit.T, lose = { win: false, a: sit.score[0] + 1, b: Math.max(T, sit.score[0] + 3) };
  const r1 = S.finish({ sit: o1.sit }, lose);
  ok('finish() cierra el intento perdido y es el mejor (el primero)', r1 && r1.w === 0 && r1.isBest && r1.i === 1 && !S.state().open);
  S.begin(); ok('abandon() cuenta como perdido con el marcador que lleve', S.abandon({ sit: { wk: sit.wk, i: 2 }, score: [sit.score[0], sit.score[1] + 1] }) && S.state().tries === 2);
  ok('abandon() sin intento abierto no hace nada', !S.abandon(null));
  const o3 = S.begin(); ok('3r intento', o3 && o3.sit.i === 3 && S.left() === 0);
  const win = { win: true, a: Math.max(T, sit.score[1] + 2) + 2, b: Math.max(T, sit.score[1] + 2) };
  const r3 = S.finish({ sit: o3.sit }, win);
  ok('una ganada es mejor que una perdida', r3.isBest && S.state().best.w === 1 && S.state().best.a === win.a);
  ok('el 4º begin() da null', S.begin() === null && S.left() === 0);
  ok('hoy: 3 intentos, el último ganado', J(S.state().today.map(t => t.w)) === '[0,0,1]' && S.state().n === 3);
  S._now(20261124);
  ok('cambio de día: 3 nuevos y el mejor se queda', S.left() === 3 && S.state().best && S.state().best.w === 1);
  // regla de orden entre ganadas: menos puntos cedidos; entre perdidas: más ganados
  const b = (x, y) => S.better(x, y, { score: [22, 24] });
  ok('regla: ganada 26-24 mejor que ganada 27-25', b({ w: 1, a: 26, b: 24 }, { w: 1, a: 27, b: 25 }) && !b({ w: 1, a: 27, b: 25 }, { w: 1, a: 26, b: 24 }));
  ok('regla: perdida 24-26 mejor que perdida 22-25', b({ w: 0, a: 24, b: 26 }, { w: 0, a: 22, b: 25 }) && !b({ w: 0, a: 22, b: 25 }, { w: 0, a: 24, b: 26 }));
  ok('regla: empate no sustituye', !b({ w: 1, a: 26, b: 24 }, { w: 1, a: 26, b: 24 }));
  // intento abierto en otra sesión (pestaña cerrada a medias) → perdido con el marcador de arranque
  S.begin(); const raw = st.getItem(S.KEY);
  const VB2 = load(st), S2 = VB2.Semana; S2._now(20261124);
  const st2 = S2.state();
  ok('intento abierto de otra sesión: perdido con el marcador del arranque', !st2.open && st2.tries === 4 && st2.left === 2, 'tries ' + st2.tries);
  ok('el guardado no lleva nada de más', !!raw && raw.length < 2000 && JSON.parse(raw).v === 1, raw && raw.length + ' B');
  // dos pestañas abiertas a la vez: cada operación vuelve a leer lo que guardó la otra (antes cada una pisaba la copia de la otra)
  {
    const sh = fakeStorage(), A = load(sh).Semana, B = load(sh).Semana;
    A._now(20261125); B._now(20261125); A._sid('tabA'); B._sid('tabB');
    const sA = A.situation(), TT = sA.T, wn = { win: true, a: Math.max(TT, sA.score[1] + 2) + 2, b: Math.max(TT, sA.score[1] + 2) };
    const oA = A.begin(); B.state();   // B cierra el de A como perdido (otra sesión)
    A.finish({ sit: oA.sit }, wn);     // A gana después
    ok('dos pestañas: la victoria de A ve la derrota que apuntó B', A.state().tries === 2 && A.state().best && A.state().best.w === 1, 'tries ' + A.state().tries);
    const pk = B.peek(); ok('dos pestañas: peek() de B ve la victoria de A sin escribir', pk.best && pk.best.w === 1 && pk.left === 2);
    B.begin();
    const fin = JSON.parse(sh.getItem(A.KEY));
    ok('dos pestañas: el begin() de B no borra la victoria de A', fin.best && fin.best.w === 1 && fin.tries.length === 2 && fin.days['20261125'] === 2, sh.getItem(A.KEY));
    // peek() no cierra el intento abierto de otra pestaña
    const sh2 = fakeStorage(), C = load(sh2).Semana, D = load(sh2).Semana;
    C._now(20261125); D._now(20261125); C._sid('tabC'); D._sid('tabD'); C.begin(); D.peek();
    ok('peek() no cierra el intento abierto de otra pestaña', !!JSON.parse(sh2.getItem(C.KEY)).open);
  }
  // cambio de semana: todo a cero menos la cadena (que queda en solo lectura)
  S2.mergeLink(S2.link());
  S2._now(20261201);
  const s3 = S2.state();
  ok('cambio de semana: intentos y mejor a cero', s3.wk === 202649 && s3.left === 3 && !s3.best && s3.tries === 0);
  ok('cambio de semana: la cadena de la semana pasada queda en solo lectura', s3.group && s3.group.wk === 202648 && s3.groupOld);
  ok('sin XP ni medallas: Retos no cuenta un partido con g.sit', VB.Retos.endMatch({ sit: { wk: 1 }, demo: false, teams: [[], []], size: 2 }, { win: true }) === null);
}

// ------------------------------------------------------------------ 4) enlace
console.log('4) Enlace y mapa del grupo');
{
  const stA = fakeStorage({ 'make-the-cut.nick': 'Ana' }), A = load(stA).Semana; A._now(20261123);
  const sit = A.situation(), T = sit.T;
  A.begin(); A.finish({}, { win: true, a: T + 1, b: T - 1, zones: { S: [1, 6, 6], A: [4, 3] } });
  const la = A.link();
  ok('link(): ?sem= con semana, entrada y control', /^https:\/\/ejemplo\.test\/mtc\/\?sem=202648\.Ana~w\d+-\d+~S166~A43\.[0-9a-z]{4}$/.test(la), la);
  const rd = A.readLink(la);
  ok('ida y vuelta exacta', rd && rd.wk === 202648 && J(rd.list) === J([{ n: 'Ana', w: 1, a: T + 1, b: T - 1, S: '166', A: '43' }]), J(rd));
  const q = la.split('sem=')[1];
  const broken = q.slice(0, 12) + (q[12] === '1' ? '2' : '1') + q.slice(13);
  ok('un carácter cambiado: el control falla (null)', A.readLink(broken) === null && A.readLink(q.slice(0, -1)) === null && A.readLink('basura') === null);
  // Bea recibe el enlace, juega y lo pasa
  const stB = fakeStorage({ 'make-the-cut.nick': 'Bea<script>' }), B = load(stB).Semana; B._now(20261124);
  const mB = B.mergeLink(la);
  ok('mergeLink: «Tienes la cadena de Ana»', mB && !mB.old && mB.n === 1 && mB.from === 'Ana');
  ok('mergeLink es idempotente', J(B.mergeLink(la).list) === J(mB.list) && B.state().group.list.length === 1);
  B.begin(); B.finish({}, { win: false, a: sit.score[0] + 1, b: T + 1, zones: { S: [5], A: [2, 2] } });
  const lb = B.link(), rb = B.readLink(lb);
  ok('nombre saneado («Bea<script>» → «Beascript»)', rb && rb.list[1].n === 'Beascript' && B.myName() === 'Beascript', rb && rb.list.map(e => e.n).join());
  ok('tu entrada se añade al final', rb.list.length === 2 && rb.list[0].n === 'Ana');
  // Bea mejora y vuelve a compartir: se sustituye, no se duplica
  B.begin(); B.finish({}, { win: true, a: T + 2, b: T, zones: { S: [1], A: [4] } });
  const rb2 = B.readLink(B.link());
  ok('tu entrada se sustituye y no se duplica', rb2.list.length === 2 && rb2.list[1].w === 1 && rb2.list[1].S === '1');
  // nombres raros
  ok('nombre con @ (correo) no vale; largo se recorta a 12', A.cleanName('pepe@correo.es') === '' && A.cleanName('Nombre Muy Largo De Verdad') === 'Nombre_Muy_L' && A.cleanName('Àlex Ñu') === 'Àlex_Ñu');
  const stN = fakeStorage(), N = load(stN).Semana; N._now(20261123);
  ok('sin apodo: «Jugador_xxx» estable', /^Jugador_[a-z0-9]{3}$/.test(N.myName()) && N.myName() === N.myName());
  // tope de 8: se cae la más antigua que no eres tú
  const stC = fakeStorage({ 'make-the-cut.nick': 'Cesc' }), C = load(stC).Semana; C._now(20261123);
  C.begin(); C.finish({}, { win: true, a: T + 1, b: T - 1 }); C.link();   // Cesc el primero de la lista
  for (let i = 0; i < 9; i++) {
    const st = fakeStorage({ 'make-the-cut.nick': 'Amigo' + i }), X = load(st).Semana; X._now(20261123);
    X.begin(); X.finish({}, { win: i % 2 === 0, a: T - 2, b: T });
    C.mergeLink(X.link());
  }
  const lc = C.state().group.list.map(e => e.n);
  ok('tope de 8: sigues tú y se caen las más antiguas', lc.length === 8 && lc[0] === 'Cesc' && lc.indexOf('Amigo0') < 0 && lc.indexOf('Amigo1') < 0 && lc.indexOf('Amigo8') >= 0, lc.join());
  // otra semana: solo lectura, no pisa la de esta semana
  const old = C.readLink(la); const stD = fakeStorage(), D = load(stD).Semana; D._now(20261201);
  const mD = D.mergeLink(la);
  ok('enlace de otra semana: solo lectura', mD && mD.old && D.state().groupOld && D.state().group.wk === 202648 && !!old);
  D.begin(); D.finish({}, { win: true, a: 25, b: 23 }); D.link();
  D.mergeLink(la);
  ok('…y no pisa la cadena de la semana en curso', D.state().group.wk === 202649 && !D.state().groupOld);
  ok('texto para compartir', /^La situación de la semana 48: (set único a (25|21)|3r set a 15), .+\. Yo la gané \d+-\d+\. ¿Y tú\?$/.test(A.shareText()), A.shareText());
}

// ------------------------------------------------------------------ 5) zonesOf
console.log('5) MatchStats.zonesOf');
{
  const VB = load(fakeStorage()), M = VB.MatchStats;
  const d = { HL: 9, HW: 4.5, rallies: [
    // saque del equipo 0 que recibe el rival en su zona 1 (x < 0, detrás, a su derecha: y < 0, como zoneOf con s = -1)
    { c: [{ k: 'S', t: 0, p: 0, x: 8, y: 1 }, { k: 'P', t: 1, p: 2, x: -7, y: -3.5, rv: 1 }, { k: 'E', t: 1, p: 3, x: -2, y: 0 }, { k: 'A', t: 1, p: 2, x: -1, y: 1 }, { k: 'P', t: 0, p: 1, x: 6, y: 0 }], L: null },
    // ataque del equipo 0 (jugador 1) que cae dentro delante a la izquierda del rival (su zona 4)
    { c: [{ k: 'S', t: 1, p: 2, x: -9, y: 0 }, { k: 'P', t: 0, p: 1, x: 7, y: 0, rv: 1 }, { k: 'E', t: 0, p: 0, x: 2, y: 0 }, { k: 'A', t: 0, p: 1, x: 1, y: 0 }], L: [-2, 3.5, 1] },
    // ataque del equipo 0 bloqueado (stuff): sin zona
    { c: [{ k: 'S', t: 1, p: 2, x: -9, y: 0 }, { k: 'P', t: 0, p: 0, x: 7, y: 0, rv: 1 }, { k: 'A', t: 0, p: 0, x: 1, y: 0 }, { k: 'B', t: 1, p: 3, res: 'stuff', x: -0.3, y: 0 }], L: [1, 0, 1] }
  ] };
  const z = M.zonesOf(d, 0, -1), z1 = M.zonesOf(d, 0, 1);
  ok('equipo entero: saque a la 1, ataque a la 4, el bloqueado sin zona', J(z) === J({ S: [1], A: [4] }), J(z));
  ok('solo tu jugador (6v6): el ataque del n.º 1 y ningún saque', J(z1) === J({ S: [], A: [4] }), J(z1));
  ok('sin registro: listas vacías', J(M.zonesOf(null, 0, -1)) === J({ S: [], A: [] }));
}

// ------------------------------------------------------------------ 6) guardado roto
console.log('6) Guardado roto');
{
  for (const bad of ['{roto', '"texto"', J({ v: 1, wk: 'x', days: 7, tries: 'no', best: [1], group: { wk: 3, list: 'x' } }), J({ v: 1, wk: 202648, days: { 20261123: 99 }, tries: [{ w: 1, a: 1e9, b: -5 }], group: { wk: 202648, list: [{ n: '<b>', w: 1 }, null, { n: 'X@y' }] } })]) {
    let ex = null, st = null;
    try { const S = load(fakeStorage({ 'make-the-cut.semana': bad })).Semana; S._now(20261123); st = S.state(); S.begin(); } catch (e) { ex = e; }
    ok('guardado ' + bad.slice(0, 24) + '…: sin romper nada', !ex && st && st.left >= 0 && st.left <= 3, ex ? String(ex) : 'left ' + st.left);
  }
}

// ------------------------------------------------------------------ 7) hoja final (recap.js)
console.log('7) Hoja final con d.sit');
{
  const VB = load(fakeStorage()), R = VB.Recap;
  const base = { win: true, sets: [1, 0], setScores: [[26, 24]], pl: [], moments: [], spSaved: [], size: 2, seed: 1 };
  const M1 = R.endModel(Object.assign({ sit: { wn: 48, label: 'Set único a 25', start: [22, 24], a: 26, b: 24, win: true, i: 2, tries: 3, left: 1, best: { w: 1, a: 26, b: 24 }, isBest: true } }, base));
  ok('título «¡Salvada! 26-24» y sin titular', M1.title === '¡Salvada! 26-24' && !M1.headline && M1.blocks[0] === 'sit', M1.title + ' ' + M1.blocks.join());
  ok('bloque «Situación»', J(M1.sit.lines) === J(['Empezaste 22-24 (Set único a 25)', 'Intento 2 de 3 de hoy', '¡Nuevo mejor de la semana: ganada 26-24!']), J(M1.sit.lines));
  ok('botones: Otro intento | Compartir, Ver el grupo, Menú principal', M1.buttons.primary.id === 'again' && M1.buttons.primary.label === 'Otro intento' && J(M1.buttons.rest.map(b => b.id)) === J(['share', 'group', 'menu']));
  const M2 = R.endModel(Object.assign({}, base, { win: false, sets: [0, 1], setScores: [[23, 25]], sit: { wn: 48, label: '3r set a 15', start: [14, 13], a: 23, b: 25, win: false, i: 3, tries: 3, left: 0, best: { w: 1, a: 16, b: 14 }, isBest: false } }));
  ok('sin intentos: «Compartir» es el principal y «Se escapó: 23-25»', M2.buttons.primary.id === 'share' && J(M2.buttons.rest.map(b => b.id)) === J(['group', 'menu']) && M2.title === 'Se escapó: 23-25');
  const M3 = R.endModel(Object.assign({}, base, { sit: { wn: 48, label: '3r set a 15', start: [14, 13], a: 15, b: 13, win: true, i: 1, tries: 3, left: 2, best: null } }));
  ok('por delante y ganada: «¡Cerrada! 15-13»', M3.title === '¡Cerrada! 15-13' && M3.sit.lines.length === 2);
  const M4 = R.endModel(Object.assign({}, base, { win: false, sets: [0, 1], setScores: [[23, 25]], sit: { wn: 48, label: 'Set único a 25', start: [22, 24], a: 23, b: 25, win: false, i: 1, tries: 3, left: 2, best: { w: 0, a: 23, b: 25 }, isBest: true } }));
  ok('una derrota que es tu mejor no se celebra (sin «¡Nuevo mejor!» ni dorado)', M4.sit.lines[2] === 'Tu mejor de la semana: perdida 23-25' && !M4.sit.isBest, J(M4.sit.lines));
  ok('sin d.sit, la hoja de siempre', !R.endModel(base).sit && R.endModel(base).buttons.primary.label === 'Revancha');
}

console.log('\n' + (fails ? fails + ' FALLOS' : 'TODO OK') + ' (' + oks + ' bien)');
process.exit(fails ? 1 : 0);
