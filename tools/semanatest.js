#!/usr/bin/env node
/* TAKE THE COURT — tools/semanatest.js (owner: ui_main)
 * Prueba de «La jugada del día» (js/semana.js; antes «La situación de la semana») sin navegador: vm con un localStorage falso y
 * js/retos.js + js/matchstats.js + js/semana.js (+ js/recap.js para el modelo de la hoja final).
 *  1) Tabla congelada de 8 días (23 al 30-nov-2026): la jugada exacta (si cambia, cambia para todos los jugadores: no se toca).
 *  2) 400 días seguidos: nunca un set ya ganado; cada tipo con su forma (Salvar: el rival con bola de set; Cerrarlo: tú por delante;
 *     Remontada: 4 o más abajo; Empujón: 1-2 abajo sin bola de set en contra; Mano a mano: empate); el líder como mucho en T-1 salvo el
 *     deuce; 3r set siempre a 15; playa a 21; 6v6 solo en pista con rotación 0-5 y control «Uno»; pesos del formato (50/30/20), de los
 *     tipos (30/20/20/15/15), del 3r set (40 %) y de Difícil (60 %); días seguidos distintos.
 *  3) Intentos: 3 al día y el 4º begin() da null; el cambio de día da 3 nuevos y vacía el mejor; abandon() cuenta como perdido; un
 *     intento abierto de otra sesión se da por perdido; con dos pestañas, ninguna pisa lo que guardó la otra; peek() no cierra intentos.
 *  4) Racha: ganar la cumple (done, popWanted false) y sube 1 por día seguido; una 2ª victoria el mismo día no suma; un día sin cumplir
 *     la pone a 0 (la mejor se queda); sin intentos no hay ventana; finish en seco no guarda; el guardado v1 (semanal) se migra con el nombre.
 *  5) Enlace: ida y vuelta exacta; un carácter cambiado → null; nombres con '@', '<' o largos, saneados; otro día = solo lectura; el
 *     enlace semanal de antes se reconoce (gone) y no se guarda; tu entrada se sustituye y no se duplica; el tope de 8; idempotente.
 *  6) MatchStats.zonesOf con un registro sintético (saque a la 1, ataque a la 4, bloqueado = sin zona; 6v6 solo tu jugador).
 *  7) Guardado roto o con basura: se usa uno vacío sin romper nada.
 *  8) Recap.endModel con d.sit: título, bloque «Situación» (mejor de hoy o racha) y botones (Otro intento / Compartir / Ver el grupo / Menú).
 * Uso: node tools/semanatest.js   (sale con código 1 si algo falla; SEM_PRINT=1 imprime la tabla)
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
const winOf = sit => { const T = sit.T, w = Math.max(T, sit.score[1] + 2); return { win: true, a: w, b: w - 2 }; };
const loseOf = sit => { const T = sit.T; return { win: false, a: sit.score[0] + 1, b: Math.max(T, sit.score[0] + 3) }; };

// ------------------------------------------------------------------ 1) tabla congelada
console.log('1) Tabla congelada de 8 días');
{
  const VB = load(fakeStorage()), S = VB.Semana;
  const D = [20261123, 20261124, 20261125, 20261126, 20261127, 20261128, 20261129, 20261130];
  const row = s => [s.day, s.fmt, s.kind, s.map, s.fam, s.type, s.score.join('-'), s.serving, s.srvIdx, s.six ? s.rot.join('') : '-', s.difficulty].join(' ');
  const got = D.map(d => row(S.situation(d)));
  if (process.env.SEM_PRINT) console.log(got.map(r => "    '" + r + "',").join('\n'));
  const FROZEN = [
    '20261123 2v2 hall palau unico salvar 23-24 1 1 - hard',
    '20261124 2v2 beach fanals tercer mano 14-14 0 1 - normal',
    '20261125 2v2 beach moll unico salvar 18-20 1 1 - normal',
    '20261126 2v2 hall canrebot unico cerrar 24-22 0 0 - hard',
    '20261127 2v2 beach platja tercer remontar 7-12 1 0 - hard',
    '20261128 2v2 hall cupula tercer salvar 13-14 0 0 - hard',
    '20261129 2v2 hall palau tercer cerrar 14-13 1 0 - normal',
    '20261130 6v6 hall palau unico cerrar 23-22 0 0 11 hard'
  ];
  if (FROZEN[0] === 'FROZEN') { console.log(got.join('\n')); ok('tabla (sin congelar aún)', false); }
  else for (let i = 0; i < D.length; i++) ok('día ' + D[i] + ': ' + FROZEN[i], got[i] === FROZEN[i], got[i] !== FROZEN[i] ? 'sale ' + got[i] : '');
  const s0 = S.situation(20261123);
  ok('jugada determinista (dos veces lo mismo, sin g.rng)', J(S.situation(20261123)) === J(s0));
  ok('texto largo con ordinales y dos puntos', /^(Set único a (25|21)|3r set a 15): \d+-\d+, (saca el rival|sacas tú|sacáis vosotros)$/.test(s0.label), s0.label);
  ok('objetivo claro en una línea y día', /gana el set|Cierra el set desde el \d+-\d+/.test(s0.goal) && s0.goal.length <= 40 && s0.dayLbl === '23 nov' && s0.wk === 20261123, s0.goal);
}

// ------------------------------------------------------------------ 2) 400 días
console.log('2) 400 días seguidos');
{
  const VB = load(fakeStorage()), S = VB.Semana;
  let bad = [], n = 0, f = { '2v2hall': 0, '2v2beach': 0, '6v6hall': 0 }, ty = {}, fam3 = 0, hard = 0, same = 0, prev = '';
  let t = Date.UTC(2026, 10, 1);
  for (let i = 0; i < 400; i++, t += 864e5) {
    const d = new Date(t), k = d.getUTCFullYear() * 10000 + (d.getUTCMonth() + 1) * 100 + d.getUTCDate();
    const s = S.situation(k); n++;
    f[s.fmt + s.kind]++; ty[s.type] = (ty[s.type] || 0) + 1;
    if (s.label === prev) same++; prev = s.label;
    const [a, b] = s.score, T = s.T, dd = a - b, lead = Math.max(a, b);
    if (s.fam === 'tercer') fam3++;
    if (s.difficulty === 'hard') hard++;
    const deuce = a >= T - 1 && b >= T - 1;
    if (!deuce && lead > T - 1) bad.push(k + ' líder ' + lead);
    if (deuce && Math.abs(dd) > 1) bad.push(k + ' deuce ' + a + '-' + b);
    if ((a >= T || b >= T) && Math.abs(dd) >= 2) bad.push(k + ' set ganado');
    if (a < 0 || b < 0) bad.push(k + ' negativo');
    if (s.type === 'salvar' && !(a < b && b >= T - 1)) bad.push(k + ' salvar ' + a + '-' + b);
    if (s.type === 'cerrar' && !(a > b)) bad.push(k + ' cerrar ' + a + '-' + b);
    if (s.type === 'remontar' && !(b - a >= 4)) bad.push(k + ' remontar ' + a + '-' + b);
    if (s.type === 'empujon' && !(b - a >= 1 && b - a <= 2 && b <= T - 2)) bad.push(k + ' empujón ' + a + '-' + b);
    if (s.type === 'mano' && a !== b) bad.push(k + ' mano ' + a + '-' + b);
    if (!s.title || !s.goal || s.goal.indexOf(String(a)) < 0) bad.push(k + ' textos');
    if (s.fam === 'tercer' && (T !== 15 || s.setNo !== 3 || s.opts.start.bo1)) bad.push(k + ' 3r set');
    if (s.fam === 'unico' && (s.setNo !== 1 || !s.opts.start.bo1 || T !== (s.kind === 'beach' ? 21 : 25))) bad.push(k + ' set único');
    if (s.kind === 'beach' && s.opts.points !== 21) bad.push(k + ' playa');
    if (s.six && (s.kind !== 'hall' || s.opts.ctrl !== 'one' || s.rot.some(r => r < 0 || r > 5) || !/^Rotación [1-6]$/.test(s.rotLbl))) bad.push(k + ' 6v6');
    if (!s.six && s.opts.ctrl !== 'both') bad.push(k + ' control');
    if (!s.opts.noAttrs || !s.opts.noBadges || s.opts.reto) bad.push(k + ' parejos');
    if (!s.mapName || VB.Retos.MAPS[s.map].kind !== s.kind) bad.push(k + ' sede');
    if (s.opts.sit.wk !== k) bad.push(k + ' sit.wk');
  }
  ok('invariantes en 400 días', !bad.length, bad.slice(0, 6).join(', '));
  const p = k => f[k] / n, q = k => (ty[k] || 0) / n;
  ok('formato cerca de 50/30/20', Math.abs(p('2v2hall') - 0.5) < 0.07 && Math.abs(p('2v2beach') - 0.3) < 0.07 && Math.abs(p('6v6hall') - 0.2) < 0.06, J(f));
  ok('tipos cerca de 30/20/20/15/15', Math.abs(q('salvar') - 0.3) < 0.07 && Math.abs(q('remontar') - 0.2) < 0.06 && Math.abs(q('empujon') - 0.2) < 0.06 && Math.abs(q('mano') - 0.15) < 0.06 && Math.abs(q('cerrar') - 0.15) < 0.06, J(ty));
  ok('3r set cerca del 40 % y Difícil cerca del 60 %', Math.abs(fam3 / n - 0.4) < 0.07 && Math.abs(hard / n - 0.6) < 0.07, fam3 + ' / ' + hard);
  ok('cada día una distinta (casi nunca la misma que ayer)', same / n < 0.05, same + ' repetidas');
}

// ------------------------------------------------------------------ 3) intentos
console.log('3) Intentos, mejor y cambio de día');
{
  const st = fakeStorage(), VB = load(st), S = VB.Semana;
  S._now(20261123);
  const sit = S.situation();
  ok('jugada de la fecha fijada', sit.wk === 20261123 && S.state().wk === 20261123 && S.state().day === 20261123, String(sit.wk));
  ok('3 intentos al empezar', S.left() === 3);
  const o1 = S.begin();
  ok('begin() gasta el intento al empezar y da las opciones', o1 && o1.sit.i === 1 && o1.sit.wk === 20261123 && S.left() === 2 && J(o1.start) === J(sit.opts.start) && o1.seed > 0, o1 && J(o1.sit));
  ok('la semilla es la misma para todos en el mismo intento', (load(fakeStorage()).Semana._hash('mtc-dia-' + sit.wk + '-1') & 0x7fffffff) === o1.seed);
  const r1 = S.finish({ sit: o1.sit }, loseOf(sit));
  ok('finish() cierra el intento perdido y es el mejor (el primero)', r1 && r1.w === 0 && r1.isBest && r1.i === 1 && !S.state().open && !r1.done && !r1.up);
  S.begin(); ok('abandon() cuenta como perdido con el marcador que lleve', S.abandon({ sit: { wk: sit.wk, i: 2 }, score: [sit.score[0], sit.score[1] + 1] }) && S.state().tries === 2);
  ok('abandon() sin intento abierto no hace nada', !S.abandon(null));
  const o3 = S.begin(); ok('3r intento', o3 && o3.sit.i === 3 && S.left() === 0);
  const r3 = S.finish({ sit: o3.sit }, winOf(sit));
  ok('una ganada es mejor que una perdida', r3.isBest && S.state().best.w === 1);
  ok('el 4º begin() da null', S.begin() === null && S.left() === 0);
  ok('hoy: 3 intentos, el último ganado', J(S.state().today.map(t => t.w)) === '[0,0,1]' && S.state().n === 3);
  S._now(20261124);
  ok('cambio de día: 3 nuevos, otra jugada y el mejor a cero', S.left() === 3 && !S.state().best && S.state().tries === 0 && S.situation().label !== sit.label);
  ok('un intento empezado ayer no cuenta hoy', S.finish({ sit: { wk: 20261123, i: 1 } }, winOf(sit)) === null);
  const b = (x, y) => S.better(x, y, { score: [22, 24] });
  ok('regla: ganada 26-24 mejor que ganada 27-25', b({ w: 1, a: 26, b: 24 }, { w: 1, a: 27, b: 25 }) && !b({ w: 1, a: 27, b: 25 }, { w: 1, a: 26, b: 24 }));
  ok('regla: perdida 24-26 mejor que perdida 22-25', b({ w: 0, a: 24, b: 26 }, { w: 0, a: 22, b: 25 }) && !b({ w: 0, a: 22, b: 25 }, { w: 0, a: 24, b: 26 }));
  ok('regla: empate no sustituye', !b({ w: 1, a: 26, b: 24 }, { w: 1, a: 26, b: 24 }));
  // intento abierto en otra sesión (pestaña cerrada a medias) → perdido con el marcador de arranque
  S.begin(); const raw = st.getItem(S.KEY);
  const S2 = load(st).Semana; S2._now(20261124);
  const st2 = S2.state();
  ok('intento abierto de otra sesión: perdido con el marcador del arranque', !st2.open && st2.tries === 1 && st2.left === 2, 'tries ' + st2.tries);
  ok('el guardado no lleva nada de más', !!raw && raw.length < 1500 && JSON.parse(raw).v === 2, raw && raw.length + ' B');
  ok('peek() lee sin cerrar: popWanted con intentos y sin cumplir', S2.popWanted() === true);
  {
    const sh = fakeStorage(), A = load(sh).Semana, B = load(sh).Semana;
    A._now(20261125); B._now(20261125); A._sid('tabA'); B._sid('tabB');
    const sA = A.situation();
    const oA = A.begin(); B.state();   // B cierra el de A como perdido (otra sesión)
    A.finish({ sit: oA.sit }, winOf(sA));     // A gana después
    ok('dos pestañas: la victoria de A ve la derrota que apuntó B', A.state().tries === 2 && A.state().best && A.state().best.w === 1, 'tries ' + A.state().tries);
    const pk = B.peek(); ok('dos pestañas: peek() de B ve la victoria de A sin escribir', pk.best && pk.best.w === 1 && pk.left === 2 && pk.done);
    B.begin();
    const fin = JSON.parse(sh.getItem(A.KEY));
    ok('dos pestañas: el begin() de B no borra la victoria de A', fin.best && fin.best.w === 1 && fin.tries.length === 2 && fin.n === 2 && fin.streak.last === 20261125, sh.getItem(A.KEY));
    const sh2 = fakeStorage(), C = load(sh2).Semana, D = load(sh2).Semana;
    C._now(20261125); D._now(20261125); C._sid('tabC'); D._sid('tabD'); C.begin(); D.peek();
    ok('peek() no cierra el intento abierto de otra pestaña (y sin ventana mientras)', !!JSON.parse(sh2.getItem(C.KEY)).open && D.popWanted() === false);
  }
  ok('sin XP ni medallas: Retos no cuenta un partido con g.sit', VB.Retos.endMatch({ sit: { wk: 1 }, demo: false, teams: [[], []], size: 2 }, { win: true }) === null);
}

// ------------------------------------------------------------------ 4) racha
console.log('4) Racha de días seguidos');
{
  const st = fakeStorage(), S = load(st).Semana;
  const play = (k, wins) => { S._now(k); const s = S.situation(); let last = null; for (const w of wins) { const o = S.begin(); if (!o) break; last = S.finish({ sit: o.sit }, w ? winOf(s) : loseOf(s)); } return last; };
  S._now(20261201);
  ok('sin jugar: racha 0 y ventana', J(S.streak()) === J({ cur: 0, best: 0 }) && S.popWanted() && !S.peek().done);
  const d1 = play(20261201, [0, 1]);
  ok('día 1: perder y ganar la cumple (racha 1, up)', d1.up && d1.done && d1.streak.cur === 1 && S.peek().done && !S.popWanted(), J(d1.streak));
  const d1b = play(20261201, [1]);
  ok('2ª victoria el mismo día: no suma', d1b && !d1b.up && d1b.streak.cur === 1);
  const d2 = play(20261202, [1]);
  ok('día 2 seguido: racha 2', d2.up && d2.streak.cur === 2 && d2.streak.best === 2);
  S._now(20261203);
  ok('al día siguiente, antes de jugar, la racha sigue viva (2) y hay ventana', S.streak().cur === 2 && S.popWanted());
  const d3 = play(20261203, [0, 0, 0]);
  ok('día 3 sin cumplir (3 perdidas): sin ventana (no quedan intentos) y la racha aún cuenta hoy', !S.popWanted() && !d3.done && S.streak().cur === 2);
  S._now(20261204);
  ok('día 4: la racha se ha cortado (0) y la mejor se queda (2)', J(S.streak()) === J({ cur: 0, best: 2 }));
  const dry = (() => { const o = S.begin(); return S.finish({ sit: o.sit }, winOf(S.situation()), true); })();
  ok('finish en seco: dice lo que pasaría sin guardar', dry.dry && dry.up && dry.streak.cur === 1 && S.streak().cur === 0 && !S.peek().done);
  S.abandon(null);
  const d4 = play(20261204, [1]);
  ok('día 4 ganado: racha nueva de 1', d4.up && d4.streak.cur === 1 && d4.streak.best === 2);
  // saltar a otro mes y año: ayer bien calculado
  S._now(20261231); play(20261231, [1]); const y1 = play(20270101, [1]);
  ok('fin de año: 31-dic y 1-ene son seguidos', y1.streak.cur === 2 && S.yesterday(20270101) === 20261231 && S.yesterday(20270301) === 20270228);
  // migración del guardado semanal (v1): solo el nombre
  const v1 = J({ v: 1, wk: 202648, me: 'abc', days: { 20261123: 2 }, open: null, best: { w: 1, a: 26, b: 24, S: '1', A: '4' }, tries: [{ w: 1, a: 26, b: 24, k: 20261123 }], group: { wk: 202648, list: [{ n: 'Ana', w: 1, a: 26, b: 24, S: '', A: '' }] } });
  const M = load(fakeStorage({ 'make-the-cut.semana': v1 })).Semana; M._now(20261124);
  const ms = M.state();
  ok('guardado v1 (semanal): se queda el nombre y lo demás empieza de cero', M.myName() === 'Jugador_abc' && !ms.best && ms.left === 3 && !ms.group && ms.streak.cur === 0, J({ n: M.myName(), best: ms.best, g: ms.group }));
}

// ------------------------------------------------------------------ 5) enlace
console.log('5) Enlace y mapa del grupo');
{
  const stA = fakeStorage({ 'make-the-cut.nick': 'Ana' }), A = load(stA).Semana; A._now(20261123);
  const sit = A.situation(), T = sit.T;
  A.begin(); A.finish({}, { win: true, a: T + 1, b: T - 1, zones: { S: [1, 6, 6], A: [4, 3] } });
  const la = A.link();
  ok('link(): ?sem= con día, entrada y control', /^https:\/\/ejemplo\.test\/mtc\/\?sem=20261123\.Ana~w\d+-\d+~S166~A43\.[0-9a-z]{4}$/.test(la), la);
  const rd = A.readLink(la);
  ok('ida y vuelta exacta', rd && rd.wk === 20261123 && !rd.gone && J(rd.list) === J([{ n: 'Ana', w: 1, a: T + 1, b: T - 1, S: '166', A: '43' }]), J(rd));
  const q = la.split('sem=')[1];
  const broken = q.slice(0, 12) + (q[12] === '1' ? '2' : '1') + q.slice(13);
  ok('un carácter cambiado: el control falla (null)', A.readLink(broken) === null && A.readLink(q.slice(0, -1)) === null && A.readLink('basura') === null);
  const stB = fakeStorage({ 'make-the-cut.nick': 'Bea<script>' }), B = load(stB).Semana; B._now(20261123);
  const mB = B.mergeLink(la);
  ok('mergeLink: «Tienes la cadena de Ana»', mB && !mB.old && mB.n === 1 && mB.from === 'Ana');
  ok('mergeLink es idempotente', J(B.mergeLink(la).list) === J(mB.list) && B.state().group.list.length === 1);
  B.begin(); B.finish({}, { win: false, a: sit.score[0] + 1, b: T + 1, zones: { S: [5], A: [2, 2] } });
  const lb = B.link(), rb = B.readLink(lb);
  ok('nombre saneado («Bea<script>» → «Beascript»)', rb && rb.list[1].n === 'Beascript' && B.myName() === 'Beascript', rb && rb.list.map(e => e.n).join());
  ok('tu entrada se añade al final', rb.list.length === 2 && rb.list[0].n === 'Ana');
  B.begin(); B.finish({}, { win: true, a: T + 2, b: T, zones: { S: [1], A: [4] } });
  const rb2 = B.readLink(B.link());
  ok('tu entrada se sustituye y no se duplica', rb2.list.length === 2 && rb2.list[1].w === 1 && rb2.list[1].S === '1');
  ok('nombre con @ (correo) no vale; largo se recorta a 12', A.cleanName('pepe@correo.es') === '' && A.cleanName('Nombre Muy Largo De Verdad') === 'Nombre_Muy_L' && A.cleanName('Àlex Ñu') === 'Àlex_Ñu');
  const N = load(fakeStorage()).Semana; N._now(20261123);
  ok('sin apodo: «Jugador_xxx» estable', /^Jugador_[a-z0-9]{3}$/.test(N.myName()) && N.myName() === N.myName());
  const stC = fakeStorage({ 'make-the-cut.nick': 'Cesc' }), C = load(stC).Semana; C._now(20261123);
  C.begin(); C.finish({}, { win: true, a: T + 1, b: T - 1 }); C.link();
  for (let i = 0; i < 9; i++) {
    const X = load(fakeStorage({ 'make-the-cut.nick': 'Amigo' + i })).Semana; X._now(20261123);
    X.begin(); X.finish({}, { win: i % 2 === 0, a: T - 2, b: T });
    C.mergeLink(X.link());
  }
  const lc = C.state().group.list.map(e => e.n);
  ok('tope de 8: sigues tú y se caen las más antiguas', lc.length === 8 && lc[0] === 'Cesc' && lc.indexOf('Amigo0') < 0 && lc.indexOf('Amigo1') < 0 && lc.indexOf('Amigo8') >= 0, lc.join());
  const D = load(fakeStorage()).Semana; D._now(20261124);
  const mD = D.mergeLink(la);
  ok('enlace de otro día: solo lectura', mD && mD.old && !mD.gone && D.state().groupOld && D.state().group.wk === 20261123);
  D.begin(); D.finish({}, { win: true, a: 25, b: 23 }); D.link();
  D.mergeLink(la);
  ok('…y no pisa la cadena de hoy', D.state().group.wk === 20261124 && !D.state().groupOld);
  // enlace semanal de antes (AAAAWW): se reconoce y no se guarda nada
  const oldRaw = '202648.Ana~w26-24~S1~A4', h = A._hash('mtc-semlink|' + oldRaw) % 1679616, oldLink = '?sem=' + oldRaw + '.' + ('000' + h.toString(36)).slice(-4);
  const E = load(fakeStorage()).Semana; E._now(20261124);
  const mE = E.mergeLink(oldLink);
  ok('enlace semanal de antes: gone y sin guardar', mE && mE.gone && mE.old && !E.state().group, J(mE));
  ok('texto para compartir', /^La jugada del día \(23 nov\): .+ gana el set\. Yo la gané \d+-\d+\. ¿Y tú\?$/.test(A.shareText()), A.shareText());
}

// ------------------------------------------------------------------ 6) zonesOf
console.log("6) MatchStats.zonesOf");
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

// ------------------------------------------------------------------ 7) guardado roto
console.log('7) Guardado roto');
{
  for (const bad of ['{roto', '"texto"', J({ v: 2, day: 'x', n: 7, tries: 'no', best: [1], streak: 5, group: { wk: 3, list: 'x' } }),
    J({ v: 2, day: 20261123, n: 99, tries: [{ w: 1, a: 1e9, b: -5 }], streak: { cur: -4, best: 'x', last: 20991231 }, group: { wk: 20261123, list: [{ n: '<b>', w: 1 }, null, { n: 'X@y' }] } })]) {
    let ex = null, st = null;
    try { const S = load(fakeStorage({ 'make-the-cut.semana': bad })).Semana; S._now(20261123); st = S.state(); S.begin(); } catch (e) { ex = e; }
    ok('guardado ' + bad.slice(0, 24) + '…: sin romper nada', !ex && st && st.left >= 0 && st.left <= 3 && st.streak.cur >= 0, ex ? String(ex) : 'left ' + st.left + ' racha ' + J(st.streak));
  }
}

// ------------------------------------------------------------------ 8) hoja final (recap.js)
console.log('8) Hoja final con d.sit');
{
  const VB = load(fakeStorage()), R = VB.Recap;
  const base = { win: true, sets: [1, 0], setScores: [[26, 24]], pl: [], moments: [], spSaved: [], size: 2, seed: 1 };
  const M1 = R.endModel(Object.assign({ sit: { dayLbl: '24 nov', label: 'Set único a 25', start: [22, 24], a: 26, b: 24, win: true, i: 2, tries: 3, left: 1, best: { w: 1, a: 26, b: 24 }, isBest: true, streak: 3, up: true } }, base));
  ok('título «¡Salvada! 26-24» y sin titular', M1.title === '¡Salvada! 26-24' && !M1.headline && M1.blocks[0] === 'sit', M1.title + ' ' + M1.blocks.join());
  ok('bloque «Situación» con la racha que sube (en dorado)', J(M1.sit.lines) === J(['Empezaste 22-24 (Set único a 25)', 'Intento 2 de 3 de hoy', '¡Cumplida! Racha: 3 días seguidos']) && M1.sit.isBest && M1.sit.upLine === 2, J(M1.sit.lines));
  ok('botones: Otro intento | Compartir, Ver el grupo, Menú principal', M1.buttons.primary.id === 'again' && M1.buttons.primary.label === 'Otro intento' && J(M1.buttons.rest.map(b => b.id)) === J(['share', 'group', 'menu']));
  const M1b = R.endModel(Object.assign({ sit: { label: 'Set único a 25', start: [22, 24], a: 26, b: 24, win: true, i: 3, tries: 3, left: 0, best: { w: 1, a: 26, b: 24 }, isBest: true, streak: 3, up: false } }, base));
  ok('2ª victoria del día: «¡Nuevo mejor de hoy!» y sin racha', M1b.sit.lines[2] === '¡Nuevo mejor de hoy: ganada 26-24!' && M1b.sit.lines[1] === 'Intento 3 de 3 de hoy: mañana, otra jugada', J(M1b.sit.lines));
  const M2 = R.endModel(Object.assign({}, base, { win: false, sets: [0, 1], setScores: [[23, 25]], sit: { label: '3r set a 15', start: [14, 13], a: 23, b: 25, win: false, i: 3, tries: 3, left: 0, best: { w: 1, a: 16, b: 14 }, isBest: false } }));
  ok('sin intentos: «Compartir» es el principal y «Se escapó: 23-25»', M2.buttons.primary.id === 'share' && J(M2.buttons.rest.map(b => b.id)) === J(['group', 'menu']) && M2.title === 'Se escapó: 23-25');
  const M3 = R.endModel(Object.assign({}, base, { sit: { label: '3r set a 15', start: [14, 13], a: 15, b: 13, win: true, i: 1, tries: 3, left: 2, best: null } }));
  ok('por delante y ganada: «¡Cerrada! 15-13»', M3.title === '¡Cerrada! 15-13' && M3.sit.lines.length === 2);
  const M4 = R.endModel(Object.assign({}, base, { win: false, sets: [0, 1], setScores: [[23, 25]], sit: { label: 'Set único a 25', start: [22, 24], a: 23, b: 25, win: false, i: 1, tries: 3, left: 2, best: { w: 0, a: 23, b: 25 }, isBest: true } }));
  ok('una derrota que es tu mejor no se celebra (sin «¡Nuevo mejor!» ni dorado)', M4.sit.lines[2] === 'Tu mejor de hoy: perdida 23-25' && !M4.sit.isBest, J(M4.sit.lines));
  ok('sin d.sit, la hoja de siempre', !R.endModel(base).sit && R.endModel(base).buttons.primary.label === 'Revancha');
}

console.log('\n' + (fails ? fails + ' FALLOS' : 'TODO OK') + ' (' + oks + ' bien)');
process.exit(fails ? 1 : 0);
