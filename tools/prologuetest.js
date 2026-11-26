#!/usr/bin/env node
/* TAKE THE COURT — tools/prologuetest.js (owner: carrera)
 * Prueba headless del prólogo juvenil (js/career-prologue.js; CONTRACT.md «Extensiones de la Carrera»). Node puro (vm, sin DOM).
 *  1. Contrato: sin o.prologue, con y sin el fichero cargado, 2 temporadas en autopilot dan la misma carrera (playa y pista, 3 semillas).
 *  2. o.prologue sin el fichero: crea con las ofertas de siempre.
 *  3. create({prologue}): 'intro', sin ofertas ni mensaje del agente; tras recargar sigue sin ofertas (sane respeta active).
 *  4. Determinismo: mismas acciones, mismo JSON; el fichero no usa el azar del navegador ni el de la partida.
 *  5. skip() en la presentación: las mismas ofertas que crear sin juvenil con la misma semilla (playa y pista).
 *  6. Recorrido simulado de 5 partidos: 5º = final o 3r puesto según la semi, tabla de 6 partidos, cara a cara, nota 0-100, informe.
 *  7. Niveles forzados (10, 30, 55, 75, 90): pruebas por nivel, ligas, tope de probabilidad, o.up, recarga y partidillo de prueba.
 *  8. Partido jugado con _doneWith (estadísticas falsas): objetivos stat/win/nota, quit deja el partido pendiente, setup 2×2 / 6×6.
 *  9. Rival: tras el informe pasa a c.life (kid, sin club, w-l = cara a cara); al fichar, a un club de tu liga y mensaje «vuelve».
 * 10. Personalidad: Currante, Artista y Líder se aplican una vez; Líder suma química al fichar.
 * 11. Guardados viejos (sin c.pro) cargan; c.pro dañado se repara (y en pick sin ofertas, ofertas base).
 * 12. Textos: todas las plantillas, variantes y modos sin «{», «undefined», «NaN», «1.er», «1º», «3º» ni «·», y ≤ 140 caracteres;
 *     sin género («Showman», «Campeones», «Entrenador: …») en el fichero.
 * 13. Interfaz con document falso: render de cada pantalla en playa y pista, cada data-act 'pro-' atendido, una sola .pri, CSS con
 *     el prefijo del móvil y nada por debajo de 12 px; hoja final y escenas de mobaudit (_demo, _endDemo).
 * 14. PROLOGUETEST_CAL=1: calibración rápida con estadísticas sintéticas por puesto (porcentaje de objetivos y nota del informe).
 * 15. PROLOGUETEST_SIM=1: calibración con recorridos jugados en la sim por los bots de simtest (novato, medio, bueno).
 * Uso: node tools/prologuetest.js   Sale con 1 si algo falla; acaba en «TODO OK».
 */
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm');
const Hp = require('./storyhelp');
const ROOT = Hp.ROOT, PRO = 'js/career-prologue.js';
let fails = 0, passes = 0;
function ok(c, msg) { if (!c) { fails++; console.log('  FALLO: ' + msg); } else passes++; }
function section(t) { console.log('\n== ' + t); }
const BASE = Hp.BASE.concat(Hp.STORY);
function boot(withPro, noStory) { return Hp.boot({ files: (noStory ? Hp.BASE : BASE).concat(withPro ? [PRO] : []) }); }
function mk(B, mode, seed, extra) {
  const o = mode === 'hall' ? { mode: 'hall', name: 'Ares Belmonte', num: 7, pos: 'OH', seed, now: 1 } : { mode: 'beach', name: 'Ares Belmonte', num: 7, role: 'cr', seed, now: 1 };
  return B.C.create(Object.assign(o, extra || {}));
}
function E(B, c) { return c.mode === 'hall' ? B.C.hall : B.C.beach; }
function clubOf(B, c, id) { return B.C.beach.club(c, id); }
function reload(B, c) { B.C._reset(); return E(B, c).load(); }
function toSeason(B, c, pers) { const P = B.VB.CareerPrologue; P.setPers(c, pers || 'work'); P.page(c, 1); P.page(c, 1); return P.page(c, 1); }
const STATS = { kills: 5, aces: 2, blocks: 2, digs: 6, assists: 8, errors: 1, recvP: 3, perfect: 3, good: 4, poor: 1, serves: 5 };

// ------------------------------------------------------------------ 1. contrato
section('1. Contrato: sin juvenil, la Carrera es idéntica con y sin el fichero');
for (const mode of ['beach', 'hall']) for (const seed of [11, 4242, 90210]) {
  const a = Hp.autopilot(boot(false), { mode, seasons: 2, seed }), b = Hp.autopilot(boot(true), { mode, seasons: 2, seed });
  ok(Hp.strip(a) === Hp.strip(b), mode + ' semilla ' + seed + ': misma carrera tras 2 temporadas');
  ok(b.pro === undefined, mode + ' semilla ' + seed + ': sin c.pro');
}
{
  const B = boot(true);
  ok(B.VB.CareerExt.some(x => x.id === 'pro') && B.VB.CareerUIExt.some(x => x.id === 'pro' && x.prefix === 'pro-'), 'registrado en VB.CareerExt y VB.CareerUIExt');
  ok(B.C.ext.get('pro') && typeof B.C.ext.get('pro')._demo === 'function', 'VB.Career.ext.get("pro") con _demo');
}

// ------------------------------------------------------------------ 2. sin el fichero
section('2. o.prologue sin js/career-prologue.js');
for (const mode of ['beach', 'hall']) {
  const B = boot(false), c = mk(B, mode, 77, { prologue: true }), B2 = boot(false), c2 = mk(B2, mode, 77);
  ok(c.offers.length >= 3 && JSON.stringify(c.offers) === JSON.stringify(c2.offers), mode + ': ofertas de siempre (' + c.offers.length + ')');
  ok(c.pro === undefined && (c.inbox || []).some(m => m.k === 'agent'), mode + ': sin c.pro y con el mensaje del agente');
}

// ------------------------------------------------------------------ 3. crear con juvenil
section('3. create({prologue: true})');
for (const mode of ['beach', 'hall']) {
  const B = boot(true), P = B.VB.CareerPrologue, c = mk(B, mode, 31, { prologue: true });
  ok(c.pro && c.pro.st === 'intro' && c.offers.length === 0, mode + ': intro y sin ofertas');
  ok(!(c.inbox || []).some(m => m.k === 'agent'), mode + ': sin mensaje del agente');
  ok(P.active(c) && c.phase === 'pick' && c.myClub === -1, mode + ': activo en la fase pick');
  ok(c.pro.cast.sch.length === 4 && new Set(c.pro.cast.sch.map(s => s.n)).size === 4 && new Set(c.pro.cast.sch.map(s => s.kit[0])).size === 4, mode + ': 4 institutos y 4 camisetas distintas');
  ok(c.pro.cast.city && c.pro.cast.comp.lg.indexOf(c.pro.cast.city) >= 0, mode + ': competición con tu ciudad (' + c.pro.cast.comp.lg + ')');
  ok(c.pro.chat.length === 3, mode + ': chat de bienvenida (' + c.pro.chat.length + ')');
  if (mode === 'hall') ok(c.pro.cast.mates.length === 4 && c.pro.cast.friend.pos === 'S', 'pista: 4 compañeros más y la amistad te coloca');
  else ok(c.pro.cast.friend.pos === 'atk', 'playa: tu pareja es bloqueador (tú defensor)');
  const r = reload(B, c);
  ok(r && r.pro && r.offers.length === 0 && r.pro.st === 'intro', mode + ': tras recargar sigue sin ofertas');
  const hero = P.hero(r); ok(hero && hero.title === 'Juvenil' && hero.chip === 'Presentación', mode + ': portada «Juvenil · Presentación»');
}

// ------------------------------------------------------------------ 4. determinismo
section('4. Determinismo');
for (const mode of ['beach', 'hall']) {
  const run = () => { const B = boot(true), P = B.VB.CareerPrologue, c = mk(B, mode, 555, { prologue: true }); toSeason(B, c, 'show'); P.sim(c); P._doneWith(c, { sets: [1, 0], setScores: [[15, 9]], win: true }, STATS, null, 24); P.skipRest(c); const x = JSON.parse(JSON.stringify(c)); delete x.created; return JSON.stringify(x); };
  ok(run() === run(), mode + ': mismas acciones, mismo JSON');
}
{
  const src = fs.readFileSync(path.join(ROOT, PRO), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
  ok(!/Math\.random/.test(src) && !/\bg\.rng\b/.test(src), 'el fichero no usa Math.random ni g.rng');
}

// ------------------------------------------------------------------ 5. skip
section('5. Ir directo a las pruebas');
for (const mode of ['beach', 'hall']) {
  const B = boot(true), P = B.VB.CareerPrologue, c = mk(B, mode, 2024, { prologue: true });
  const B2 = boot(true), c2 = mk(B2, mode, 2024);
  ok(P.skip(c) && c.pro.st === 'skip' && !P.active(c), mode + ': skip deja la fase de elegir club');
  ok(JSON.stringify(c.offers) === JSON.stringify(c2.offers), mode + ': las mismas ofertas que sin juvenil (' + c.offers.length + ')');
  const last = c.inbox[c.inbox.length - 1]; ok(last && last.k === 'agent' && /Cris Montoya/.test(last.x), mode + ': mensaje del agente (Cris Montoya con story)');
  const r = reload(B, c); ok(JSON.stringify(r.offers) === JSON.stringify(c2.offers), mode + ': tras recargar, las mismas');
  ok(!P.skip(r), mode + ': no se salta dos veces');
}
{
  const B = boot(true, true), P = B.VB.CareerPrologue, c = mk(B, 'beach', 3, { prologue: true }); P.skip(c);
  ok(/Soy tu agente/.test(c.inbox[c.inbox.length - 1].x), 'sin story: «Soy tu agente»');
}

// ------------------------------------------------------------------ 6. recorrido simulado
section('6. Recorrido simulado de 5 partidos');
for (const mode of ['beach', 'hall']) for (const seed of [1, 2, 3, 4, 5, 6]) {
  const B = boot(true), P = B.VB.CareerPrologue, c = mk(B, mode, seed, { prologue: true });
  ok(toSeason(B, c) === 'season' && c.pro.st === 'season', mode + '/' + seed + ': empieza la temporada');
  for (let j = 0; j < 3; j++) P.sim(c);
  const t = P.table(c); ok(t.reduce((s, r) => s + r.pj, 0) === 12 && t.reduce((s, r) => s + r.w, 0) === 6, mode + '/' + seed + ': liguilla de 6 partidos');
  ok(c.pro.m[3].opp >= 1, mode + '/' + seed + ': rival de la semi fijado');
  const mine = t.findIndex(r => r.t === 0), exp = [3, 2, 1, 0][mine]; ok(c.pro.m[3].opp === t[exp].t, mode + '/' + seed + ': semi 1º-4º / 2º-3º');
  P.sim(c);
  ok(c.pro.m[4].id === (c.pro.m[3].res.w ? 'f' : 'p3') && c.pro.m[4].pts === (c.pro.m[4].id === 'f' ? 21 : 15), mode + '/' + seed + ': 5º partido = ' + c.pro.m[4].id);
  P.sim(c);
  const h = c.pro.m.filter(m => m.opp === 3 && m.res), hw = h.filter(m => m.res.w).length;
  ok(c.pro.h2h[0] === hw && c.pro.h2h[1] === h.length - hw, mode + '/' + seed + ': cara a cara ' + c.pro.h2h.join('-'));
  ok(c.pro.st === 'scout' && c.offers.length >= 2 && P.active(c), mode + '/' + seed + ': informe con ofertas');
  ok(c.pro.score >= 0 && c.pro.score <= 100 && P.TIER_K.indexOf(c.pro.tier) >= 0, mode + '/' + seed + ': nota ' + c.pro.score + ' (' + c.pro.tier + ')');
  ok(c.pro.score < 50, mode + '/' + seed + ': simularlo todo no pasa de «Del montón» (' + c.pro.score + ')');
  const br = P.bracket(c); ok(br && br.semis.every(s => s.length === 4) && br.final && br.final.length === 4 && br.p3 && br.p3.length === 4, mode + '/' + seed + ': cuadro completo');
  const lst = c.inbox[c.inbox.length - 1], pre = c.inbox[c.inbox.length - 2]; ok(lst.k === 'agent' && pre && pre.k === 'pro', mode + '/' + seed + ': mensajes del entrenador y, el último, del agente');
  const r = reload(B, c); ok(r.pro.st === 'scout' && JSON.stringify(r.offers) === JSON.stringify(c.offers), mode + '/' + seed + ': recarga en el informe sin perder las ofertas');
  ok(P.hero(r).chip === 'Informe', mode + '/' + seed + ': portada «Informe»');
}

// ------------------------------------------------------------------ 7. niveles forzados
section('7. Niveles forzados');
for (const mode of ['beach', 'hall']) for (const S of [10, 30, 55, 75, 90]) {
  const B = boot(true), P = B.VB.CareerPrologue, c = mk(B, mode, 808, { prologue: true }), base = P.baseOffers(c);
  const tier = P.tierOf(S); c.pro.score = S;
  const offs = P.offers(c, tier), inv = offs.filter(o => o.pscout && typeof o.pscout === 'object'), tri = offs.filter(o => o.trial);
  const want = { nadie: 0, monton: base.filter(o => o.trial).length, inter: 1, promesa: 2, joya: 3 }[tier];
  ok(tri.length === want, mode + ' ' + S + ' (' + tier + '): ' + tri.length + ' pruebas (esperaba ' + want + ')');
  ok(offs.filter(o => !o.trial).length === base.filter(o => !o.trial).length, mode + ' ' + S + ': las ofertas normales de siempre');
  ok(inv.every(o => o.chance > 0 && o.chance <= 0.8 + 1e-9), mode + ' ' + S + ': probabilidad con tope 0,8');
  ok(new Set(offs.map(o => o.club)).size === offs.length, mode + ' ' + S + ': sin clubes repetidos');
  ok(inv.every(o => !o.scout), mode + ' ' + S + ': la invitación no lleva o.scout (career-ui ya pinta «Te vio un ojeador»; sale el offerLine)');
  if (mode === 'hall' && tier === 'joya') { const ov = inv.map(o => clubOf(B, c, o.club).ovr); ok(ov.length === 3 && Math.max.apply(null, ov) > Math.min.apply(null, ov), 'pista joya: una invitación en un club de arriba (' + ov.join(', ') + ')'); }
  ok(offs.every((o, j) => j === 0 || (offs[j - 1].trial ? 1 : 0) <= (o.trial ? 1 : 0)), mode + ' ' + S + ': pruebas al final');
  if (mode === 'beach') {
    ok(inv.every(o => o.lvl === (o.up === 2 ? 2 : 1) && clubOf(B, c, o.club).lvl === o.lvl), 'playa ' + S + ': Nacional (up 1) o Hiperliga (up 2)');
    ok((tier === 'joya') === inv.some(o => o.lvl === 2), 'playa ' + S + ': solo la joya va a la Hiperliga');
  } else ok(inv.every(o => clubOf(B, c, o.club).cc === c.cc && (o.up === 0 || o.up === 1)), 'pista ' + S + ': clubes de tu país, up ' + inv.map(o => o.up).join(','));
  // guardado con esas ofertas y en 'done': sane las conserva (también la de la Hiperliga)
  c.offers = offs; c.pro.st = 'done'; E(B, c).save(c);
  const r = reload(B, c); ok(JSON.stringify(r.offers) === JSON.stringify(offs), mode + ' ' + S + ': tras recargar (done), sane conserva las ofertas');
  if (inv.length) {
    const i = r.offers.indexOf(r.offers.find(o => o.pscout)), ts = E(B, r).trialSetup(i);
    ok(ts && ts.sets === 1 && ts.career && ts.career.trial, mode + ' ' + S + ': trialSetup monta el partidillo de la invitación');
    const rp = E(B, r).load(); rp.pick.trial = null; E(B, r).save(rp); B.C._reset(); const res = E(B, r).trialSim(i); ok(res && typeof res.pass === 'boolean', mode + ' ' + S + ': trialSim resuelve (' + (res && res.pass) + ')');
    const c3 = E(B, r).load(), m = c3.inbox[c3.inbox.length - 1];
    if (res && res.pass) ok(/categor/.test(m.x) === ((inv[0].up | 0) > 0), mode + ' ' + S + ': texto de aprobado según o.up (' + m.x.slice(-40) + ')');
  }
}

// ------------------------------------------------------------------ 8. partido jugado
section('8. Partido jugado (_doneWith), quit y setup');
for (const mode of ['beach', 'hall']) {
  const B = boot(true), P = B.VB.CareerPrologue, c = mk(B, mode, 99, { prologue: true }), K = E(B, c);
  ok(P.setup(c, 0) === null, mode + ': sin partido en la presentación');
  toSeason(B, c);
  const ms = P.setup(c, 0);
  ok(ms && ms.sets === 1 && ms.points === 15 && ms.career && ms.career.pro && ms.career.label, mode + ': setup a 1 set a 15');
  if (mode === 'hall') ok(ms.format === '6v6' && ms.attrs[0].length === 6 && ms.attrs[1].length === 6 && ms.nums[0][ms.ctrlIdx] === 7 && ms.names[0][ms.ctrlIdx] === 'Ares Belmonte' && ms.ctrlRole === 'OH', 'pista: 6 contra 6, tú en tu hueco');
  else ok(ms.attrs.length === 2 && ms.attrs[0].length === 2 && ms.attrs[1].length === 2 && ms.nums[0][0] === 7, 'playa: 2 contra 2');
  ok(ms.ref && ms.ref.chal === 0 && ms.kit && ms.rivalKit && ms.kit.kitShirt !== ms.rivalKit.kitShirt, mode + ': sin challenge y equipaciones distintas');
  ok(c.pro.live === 1 && P.setup(c, 1) === null, mode + ': live y solo el partido que toca');
  const again = P.setup(c, 0); ok(JSON.stringify(again.attrs) === JSON.stringify(ms.attrs), mode + ': setup reentrante (Reiniciar)');
  // dificultad: peldaño por la de la Carrera, la final uno más
  for (const [d, s] of [['easy', 0], ['normal', 0], ['hard', 1], ['expert', 2]]) { c.diff = d; ok(P._aiOf(c, 'j1').step === s && P._aiOf(c, 'f').step === s + 1, mode + ': IA en ' + d + ' = peldaño ' + s + ' (final ' + (s + 1) + ')'); }
  c.diff = 'normal';
  P.quit(c); ok(c.pro.live === 0 && c.pro.i === 0, mode + ': quit deja el partido pendiente');
  // j1: objetivo de estadística + «Gana el partido»
  const st = Object.assign({}, STATS);
  const out = P._doneWith(c, { sets: [1, 0], setScores: [[15, 11]], win: true }, st, null, 26);
  ok(out && out.win && out.nota > 5 && c.pro.i === 1 && c.pro.live === 0 && c.pro.m[0].res && !c.pro.m[0].res.sim, mode + ': j1 apuntado (nota ' + out.nota + ')');
  ok(out.goals.length === 2 && out.goals[1].ok === true && out.goals[0].ok === true && out.goals[0].v != null, mode + ': objetivos de j1 cumplidos (' + out.goals.map(g => g.txt + ' ' + g.ok).join('; ') + ')');
  // j2 (derbi): perder con muchos errores
  const out2 = P._doneWith(c, { sets: [0, 1], setScores: [[12, 15]], win: false }, Object.assign({}, STATS, { errors: 4 }), null, 27);
  ok(out2.goals[0].ok === false && out2.goals[1].ok === false && c.pro.h2h[1] === 1, mode + ': derbi perdido con 4 errores (✗ ✗) y cara a cara 0-1');
  // j3: 'nota' según la nota final
  const out3 = P._doneWith(c, { sets: [1, 0], setScores: [[15, 5]], win: true }, Object.assign({}, STATS, { kills: 9, digs: 9, perfect: 6, recvP: 6, assists: 12 }), null, 20);
  ok(out3.goals[1].ok === (out3.nota >= 6.5), mode + ': objetivo de nota coherente (' + out3.nota + ')');
  // la semi con 'nota' 6,8 y el 5º
  const sf = P.setup(c, 3); ok(sf && sf.points === 15, mode + ': semi a 15');
  P._doneWith(c, { sets: [1, 0], setScores: [[15, 13]], win: true }, STATS, null, 28);
  const f = P.setup(c, 4); ok(f && f.points === 21 && c.pro.m[4].id === 'f', mode + ': final a 21');
  P.quit(c);
  // nadie te ve: sin estadísticas
  const o5 = P._doneWith(c, { sets: [0, 1], setScores: [[17, 21]], win: false }, null, null, 38);
  ok(o5.sim && o5.goals.every(g => g.ok === null) && o5.nota <= 6.4, mode + ': «Mirar» / sin estadísticas = nadie te ve');
  ok(c.pro.st === 'scout', mode + ': informe tras el 5º');
  const sp = P.scoreParts(c); ok(sp.met === c.pro.m.reduce((s, m) => s + m.res.ok.filter(x => x === 1).length, 0), mode + ': objetivos del informe = los cumplidos (' + sp.met + ')');
}

// ------------------------------------------------------------------ 9. rival
section('9. Rival de la infancia → rival de la Carrera');
for (const mode of ['beach', 'hall']) {
  const B = boot(true), P = B.VB.CareerPrologue, c = mk(B, mode, 4040, { prologue: true }), K = E(B, c);
  toSeason(B, c); P.skipRest(c);
  const rv = c.life && c.life.rival;
  ok(rv && rv.kid === 1 && rv.club === -1 && rv.name === c.pro.cast.rival.n && rv.w === c.pro.h2h[0] && rv.l === c.pro.h2h[1], mode + ': rival kid sin club con el cara a cara ' + (rv && rv.w + '-' + rv.l));
  ok(P.kidRival(c).name === rv.name, mode + ': kidRival');
  c.pro.st = 'done'; K.save(c);
  const i = c.offers.findIndex(o => !o.trial); K.acceptOffer(i, 1);
  let r = K.load(); const me = B.C.beach.myClub(r), rk = r.life.rival && clubOf(B, r, r.life.rival.club);
  ok(r.phase !== 'pick' && rk && rk.id !== me.id && (mode === 'hall' ? rk.lid === me.lid : rk.lvl === me.lvl), mode + ': ficha por un club de tu liga (' + (rk && rk.name) + ')');
  ok(r.life.rival.name === rv.name && r.inbox.some(m => m.t === rv.name + ' vuelve'), mode + ': conserva el nombre y llega «vuelve»');
  const n0 = r.inbox.filter(m => /^Tienes un rival/.test(m.t)).length;
  for (let k = 0; k < 2; k++) { const n = K.next(K.load()); if (n && n.bench) K.benchNext(); else K.simulateNext(); }
  r = K.load(); ok(r.life.rival.name === rv.name && r.inbox.filter(m => /^Tienes un rival/.test(m.t)).length === n0, mode + ': career-life no crea otro rival en las primeras jornadas');
}

// ------------------------------------------------------------------ 10. personalidad
section('10. Personalidad');
for (const mode of ['beach', 'hall']) {
  for (const pers of ['work', 'show', 'lead']) {
    const B = boot(true), P = B.VB.CareerPrologue, c = mk(B, mode, 616, { prologue: true }), K = E(B, c);
    const tp0 = JSON.stringify(c.tp), fame0 = c.life ? c.life.fame : 0;
    toSeason(B, c, pers); P.skipRest(c);
    ok(c.pro.perk === 1, mode + ' ' + pers + ': aplicada');
    if (pers === 'work') ok(c.tp.phys === 25 && c.tp.def === 25 && c.tp.atk === 25, mode + ': Currante +25 de progreso (' + tp0 + ' → ' + JSON.stringify(c.tp) + ')');
    const fameT = { joya: 200, promesa: 120, inter: 60 }[c.pro.tier] || 0;
    if (pers === 'show') ok(Math.round(c.life.fame - fame0) === 150 + fameT, mode + ': Artista +150 seguidores (' + (c.life.fame - fame0) + ')');
    P.finish(c); ok(c.pro.perk === 1 && c.tp.phys <= 25, mode + ' ' + pers + ': finish no repite');
    c.pro.st = 'done'; K.save(c);
    K.acceptOffer(c.offers.findIndex(o => !o.trial), 1);
    const r = K.load(), chem = mode === 'hall' ? r.chem : r.mate.chem;
    if (pers === 'lead') ok(chem === 10 && r.pro.lead === 1, mode + ': Líder +10 de química al fichar (' + chem + ')');
    else ok(chem === 0 && r.pro.lead === 0, mode + ' ' + pers + ': sin química extra');
  }
}

// ------------------------------------------------------------------ 11. guardados viejos y reparación
section('11. Guardados viejos y c.pro dañado');
for (const mode of ['beach', 'hall']) {
  const B = boot(true), P = B.VB.CareerPrologue, c = mk(B, mode, 12, {});
  const r = reload(B, c); ok(r && r.pro === undefined && !P.active(r) && P.ensure(r) === null, mode + ': sin c.pro carga igual');
  const c2 = mk(B, mode, 13, { prologue: true }); c2.pro = 'roto'; E(B, c2).save(c2);
  const r2 = reload(B, c2); ok(r2 && P.ensure(r2) === null && r2.pro === undefined, mode + ': c.pro de texto se borra');
  const c3 = mk(B, mode, 14, { prologue: true }); c3.pro.st = 'raro'; E(B, c3).save(c3);
  const r3 = reload(B, c3); ok(r3 && r3.offers.length >= 3, mode + ': st desconocido → sane da ofertas base'); P.ensure(r3); ok(r3.pro.st === 'done', mode + ': st raro → done');
  const c4 = mk(B, mode, 15, { prologue: true }); c4.offers = []; c4.pro.st = 'zzz'; P.ensure(c4); ok(c4.offers.length >= 3, mode + ': ensure en pick sin ofertas → ofertas base');
  const c5 = mk(B, mode, 16, { prologue: true }); toSeason(B, c5); P.sim(c5); P.sim(c5);
  c5.pro.m = 'x'; c5.pro.chat = new Array(99).fill(0).map((_, j) => ({ b: 'post_w_friend', i: 0, r: 0 })); c5.pro.cast.sch = null; c5.pro.h2h = 'a'; c5.pro.pg = 9; c5.pro.tier = 'oro';
  E(B, c5).save(c5); const r5 = reload(B, c5); P.ensure(r5);
  ok(Array.isArray(r5.pro.m) && r5.pro.m.length === 5 && r5.pro.chat.length === 30 && r5.pro.cast.sch.length === 4 && r5.pro.pg === 2 && r5.pro.tier === '', mode + ': calendario, chat, reparto y campos reparados');
  ok(r5.pro.i === 0 && r5.pro.st === 'season' && P.active(r5), mode + ': sin resultados válidos, vuelve a la J1');
  const c6 = mk(B, mode, 17, { prologue: true }); toSeason(B, c6); P.sim(c6); P.sim(c6); P.sim(c6); const keep = JSON.stringify(c6.pro.m.slice(0, 3).map(m => m.res));
  c6.pro.m.length = 4; P.ensure(c6); ok(c6.pro.i === 3 && JSON.stringify(c6.pro.m.slice(0, 3).map(m => m.res)) === keep && c6.pro.m[3].opp >= 1, mode + ': calendario corto → se conservan los 3 resultados válidos');
  const s0 = JSON.stringify(c6.pro); P.ensure(c6); ok(JSON.stringify(c6.pro) === s0, mode + ': ensure idempotente');
  const c7 = mk(B, mode, 18, { prologue: true }); toSeason(B, c7); P.setup(c7, 0); ok(c7.pro.live === 1, mode + ': setup marca live');
  E(B, c7).save(c7); const r7 = reload(B, c7); P.ensure(r7); ok(r7.pro.live === 0 && r7.pro.i === 0, mode + ': al cargar, live 0 y el partido sigue pendiente');
  // guardado de la versión anterior: la invitación en o.scout (objeto) pasa a o.pscout
  const c8 = mk(B, mode, 19, { prologue: true }); c8.pro.score = 90; c8.offers = P.offers(c8, 'joya'); c8.pro.st = 'scout';
  c8.offers.forEach(o => { if (o.pscout) { o.scout = o.pscout; delete o.pscout; } }); P.ensure(c8);
  ok(c8.offers.filter(o => o.pscout).length === 3 && c8.offers.every(o => !o.scout), mode + ': o.scout viejo (objeto) → o.pscout');
}

// ------------------------------------------------------------------ 12. textos
section('12. Textos');
{
  const bad = s => /\{|undefined|NaN|1\.er|\b[13]º|·/.test(s);
  let n = 0, worst = '';
  for (const mode of ['beach', 'hall']) for (const seed of [1, 2, 3, 4, 5, 6, 7, 8]) {
    const B = boot(true), P = B.VB.CareerPrologue, c = mk(B, mode, seed, { prologue: true });
    for (const coach of Object.keys(P.COACHES)) for (const pers of ['work', 'show', 'lead']) {
      c.pro.cast.coach.p = coach; c.pro.pers = pers;
      for (const b of Object.keys(P.CH)) {
        const vs = P._variants(c, b);
        for (let j = 0; j < Math.max(1, vs.length) * 3; j++) {
          const t = P.text(c, { b, i: j % 6 }); n++;
          if (vs.length && (bad(t) || t.length > 140 || !t)) { ok(false, 'chat ' + b + ' (' + coach + '/' + pers + '): «' + t + '» (' + t.length + ')'); }
          if (t.length > worst.length) worst = t;
        }
      }
      for (const id of Object.keys(P.LINES)) { const t = P.LINES[id][coach]; ok(t && t.length <= 140 && !/·|1\.er|\b[13]º/.test(t), 'línea ' + id + '/' + coach); }
    }
    toSeason(B, c); P.skipRest(c);
    c.inbox.forEach(m => ok(!bad(m.t) && !bad(m.x), mode + '/' + seed + ': mensaje «' + m.t + '» limpio'));
  }
  ok(n > 1000, 'variantes probadas: ' + n + ' (la más larga: ' + worst.length + ')');
  const B = boot(true), P = B.VB.CareerPrologue;
  for (const k of Object.keys(P.AGENT_TX)) ok(!/·|1\.er|\b[13]º|undefined/.test(P.AGENT_TX[k]) && P.AGENT_TX[k].length <= 125, 'agente ' + k);
  const src = fs.readFileSync(path.join(ROOT, PRO), 'utf8');
  ok(!/·/.test(src) && !/1\.er|2\.º|3\.er|\b[13]º/.test(src), 'el fichero no usa «·», «1.er» ni «1º»/«3º»');
  ok(!/Showman|Campeones|Subcampeones|Entrenador: |desapercibido|vosotros/.test(src), 'sin textos con género («Showman», «Campeones», «Entrenador: …»)');
  ok(!/masculino|femenino/i.test(src), 'sin «masculino» ni «femenino»');
}

// ------------------------------------------------------------------ 13. interfaz
section('13. Interfaz (document falso)');
{
  const HLP = { esc: s => String(s == null ? '' : s).replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch])), sp: (a) => a.filter(x => x !== '' && x != null).join(' | '),
    kitSw: () => '<i class="cr-kit"></i>', q: (t) => '<button type="button" class="sp-q" data-q-title="' + t + '">?</button>', ph: () => false };
  for (const mode of ['beach', 'hall']) {
    const B = boot(true), U = Hp.uiCtx(B.VB, []), VB = B.VB, P = VB.CareerPrologue, UI = VB.CareerPrologueUI, X = VB.CareerUIExt.find(x => x.id === 'pro');
    // uiCtx comparte VB; las funciones de interfaz toleran el document falso (inyectan el estilo si pueden)
    B.cx.document = U.cx.document;
    const screens = [];
    const c = mk(B, mode, 4242, { prologue: true });
    const chk = (r, name) => {
      const html = (r.head || '') + (r.body || '');
      ok(html && !/undefined|NaN|\[object/.test(html), mode + ' ' + name + ': sin «undefined»');
      const pri = (r.body.match(/class="pri"/g) || []).length; ok(pri <= 1, mode + ' ' + name + ': como mucho una .pri (' + pri + ')');
      const acts = (r.body.match(/data-act="(pro-[^"]+)"/g) || []).map(s => s.slice(10, -1));
      acts.forEach(a => screens.push(a));
      ok(!/·/.test(html), mode + ' ' + name + ': sin «·»');
    };
    for (const pg of [0, 1, 2]) { c.pro.pg = pg; const r = UI.render(c, HLP, { tab: '', ph: false }); chk(r, 'intro p' + (pg + 1)); ok(r.view === 'intro' && !r.tabs.length && /x-go/.test(r.body), mode + ' intro p' + (pg + 1) + ': sin pestañas y con barra'); }
    c.pro.pg = 0; c.pro.pers = 'lead'; P.page(c, 1); P.page(c, 1); P.page(c, 1);
    for (const t of ['season', 'team', 'chat']) { const r = UI.render(c, HLP, { tab: t, ph: false }); chk(r, t); ok(r.tab === t && r.tabs.length === 3, mode + ' ' + t + ': 3 pestañas'); }
    ok(P.unread(c) === 0, mode + ': abrir el chat marca leído');
    P.sim(c); P._doneWith(c, { sets: [1, 0], setScores: [[15, 10]], win: true }, STATS, null, 25);
    let r = UI.render(c, HLP, { tab: 'season' }); chk(r, 'season J3'); ok(r.tabs[2][2] === true, mode + ': punto en el chat con mensajes nuevos');
    P.sim(c); r = UI.render(c, HLP, { tab: 'season' }); chk(r, 'season semi'); ok(/Semi/.test(r.body) && /Ojeadores/.test(r.body), mode + ': cuadro y ojeadores en la semi');
    P.skipRest(c); r = UI.render(c, HLP, { tab: 'season' }); chk(r, 'scout'); ok(r.view === 'scout' && /Informe de los ojeadores/.test(r.head) && /sp-heros/.test(r.body), mode + ': informe');
    ok(X.takeover(c) === true, mode + ': takeover en el informe');
    // acciones: cada data-act 'pro-' lo atiende act (con la Carrera activa)
    const seen = [...new Set(screens.concat(['pro-start', 'pro-tab-team']))];
    const c2 = mk(B, mode, 4243, { prologue: true });   // (la activa)
    const btn = v => ({ getAttribute: k => (k === 'data-v' ? v : null) });
    ok(UI.act('pro-next', btn()).focus && P.ensure(B.C.get()).pg === 0, mode + ': «Siguiente» sin personalidad pide elegirla');
    ok(UI.act('pro-pers-show', btn()).render && B.C.get().pro.pers === 'show', mode + ': elegir personalidad');
    UI.act('pro-next', btn()); UI.act('pro-prev', btn()); ok(B.C.get().pro.pg === 0, mode + ': siguiente y atrás');
    UI.act('pro-next', btn()); UI.act('pro-next', btn()); const rs = UI.act('pro-next', btn()); ok(rs && rs.tab === 'season' && B.C.get().pro.st === 'season', mode + ': «Empezar la temporada»');
    const pl = UI.act('pro-play', btn()); ok(pl && pl.play && pl.play.id === 'pro' && pl.play.arg === mode + ':0', mode + ': «Jugar partido» → {play}');
    const ext = VB.CareerExt.find(x => x.id === 'pro'), su = ext.setup(pl.play.arg);
    ok(su && su.career && su.career.mode === mode && su.career.pause && su.career.pause.quit === 'Volver al juvenil', mode + ': setup desde el registro');
    ext.quit({ mode, extArg: pl.play.arg }); ok(B.C.get().pro.live === 0, mode + ': quit desde el registro');
    // done desde el registro con la partida falsa: sin estadísticas de ingest → nadie te ve
    const dr = ext.done({ sets: [1, 0], setScores: [[15, 12]], win: true }, { career: { mode, extArg: pl.play.arg }, autopilot: true });
    ok(dr && dr.html && /pro-end/.test(dr.html) && dr.title === 'Victoria' && dr.back === 'Volver al juvenil', mode + ': hoja final del registro (' + (dr && dr.title) + ')');
    const dr2 = ext.done({ sets: [1, 0], setScores: [[15, 12]], win: true }, { career: { mode, extArg: pl.play.arg } }); ok(/ya estaba cerrado/.test(dr2.html), mode + ': un partido ya cerrado no se cuenta dos veces');
    ok(UI.act('pro-sim', btn()).render && /^Simulado: /.test(UI._note()) && B.C.get().pro.i === 2, mode + ': «Simular»');
    ok(UI.act('pro-tab-team', btn()).tab === 'team', mode + ': pestaña por acción');
    ok(UI.act('pro-rest', btn()).render && B.C.get().pro.st === 'season', mode + ': «Saltar el juvenil» pide un segundo toque');
    UI.act('pro-rest', btn()); ok(B.C.get().pro.st === 'scout', mode + ': y al segundo, informe');
    UI.act('pro-offers', btn()); ok(B.C.get().pro.st === 'done' && !X.takeover(B.C.get()), mode + ': «Ver ofertas» deja la pantalla de siempre');
    const c3 = mk(B, mode, 4244, { prologue: true });
    UI.act('pro-skip', btn()); ok(B.C.get().pro.st === 'intro', mode + ': «Ir directo a las pruebas» pide un segundo toque');
    UI.act('pro-skip', btn()); ok(B.C.get().pro.st === 'skip' && B.C.get().offers.length >= 3, mode + ': y al segundo, ofertas');
    const c4 = mk(B, mode, 4245, { prologue: true }); toSeason(B, c4);
    UI.act('pro-abandon', btn()); const ab = UI.act('pro-abandon', btn()); ok(ab && ab.view === 'create' && !E(B, c4).load(), mode + ': abandonar con dos toques');
    const form = {}; const row = X.createRow(form, mode === 'hall', HLP);
    ok(/Desde juvenil/.test(row) && /Directo a las pruebas/.test(row) && form.pro === 'pro', mode + ': fila «Inicio» con «Desde juvenil» marcado');
    ok(X.createLabel(form) === 'Crear y empezar el juvenil' && X.createOpts(form).prologue === true, mode + ': rótulo y opción de crear');
    UI.act('pro-start', btn('skip'), { form }); ok(form.pro === 'skip' && X.createLabel(form) === '' && X.createOpts(form).prologue === false, mode + ': «Directo a las pruebas»');
    seen.forEach(a => ok(['pro-start', 'pro-next', 'pro-prev', 'pro-skip', 'pro-play', 'pro-sim', 'pro-rest', 'pro-offers', 'pro-abandon'].indexOf(a) >= 0 || /^pro-(pers|tab)-/.test(a), mode + ': acción conocida ' + a));
    // línea en la oferta
    const c5 = mk(B, mode, 4246, { prologue: true }); c5.pro.score = 90; c5.offers = P.offers(c5, 'joya');
    ok(/Te vio en el/.test(X.offerLine(c5, c5.offers.find(o => o.pscout), HLP)) && X.offerLine(c5, c5.offers.find(o => !o.trial), HLP) === '', mode + ': «Te vio en el…» solo en las invitaciones');
    ok(X.msgK.pro === 'Juvenil', mode + ': rótulo del remitente');
    // escenas de mobaudit
    for (const st of ['intro', 'intro3', 'season', 'team', 'chat', 'scout']) {
      const okd = ext._demo(null, mode + ':' + st), cc = B.C.get(), rr = okd && UI.render(cc, HLP, { tab: '' });
      ok(okd && cc && cc.mode === (mode === 'hall' ? 'hall' : undefined) || (okd && cc && mode === 'beach' && !cc.mode), mode + ' _demo ' + st + ': crea la carrera');
      ok(rr && rr.view === ({ intro: 'intro', intro3: 'intro', season: 'season', team: 'team', chat: 'chat', scout: 'scout' })[st], mode + ' _demo ' + st + ': pantalla ' + (rr && rr.view));
      if (rr) chk(rr, '_demo ' + st);
    }
  }
  const B = boot(true), UI = B.VB.CareerPrologueUI, ext = B.VB.CareerExt.find(x => x.id === 'pro');
  const css = UI._css(), small = (css.match(/font(?:-size)?:[^;{}]*?(\d+(?:\.\d+)?)px/g) || []).filter(s => +s.match(/(\d+(?:\.\d+)?)px/)[1] < 12);
  ok(!small.length, 'CSS sin letra por debajo de 12 px (' + small.join(' ; ') + ')');
  ok(css.indexOf(':root.ph:not(#_):not(#_):not(#_) #career') >= 0 && css.indexOf(':root:not(#_):not(#_):not(#_) #career') >= 0, 'CSS con el prefijo del sistema y el del móvil');
  ok(!/\/\*(?![\s\S]*?\*\/)/.test(css), 'comentarios del CSS cerrados');
  for (const k of ['win', 'lose', 'final']) { const s = ext._endDemo(k); ok(s && s.html && s.title && s.kicker && s.back && /pro-en/.test(s.html) && !/undefined|NaN/.test(s.html), '_endDemo ' + k + ': ' + s.title); }
}

// ------------------------------------------------------------------ 14. calibración (opcional)
if (process.env.PROLOGUETEST_CAL) {
  section('14. Calibración (estadísticas sintéticas por puesto)');
  const PROF = { mal: 0.6, medio: 1, bien: 1.5 };
  for (const mode of ['beach', 'hall']) for (const pos of mode === 'hall' ? ['OH', 'OPP', 'MB', 'S'] : ['atk', 'uni', 'cr']) {
    const line = [];
    for (const [pn, f] of Object.entries(PROF)) {
      let sum = 0, met = 0, N = 12;
      for (let s = 0; s < N; s++) {
        const B = boot(true), P = B.VB.CareerPrologue, c = mk(B, mode, 7000 + s, Object.assign({ prologue: true }, mode === 'hall' ? { pos } : { role: pos }));
        toSeason(B, c);
        const r = B.C.beach._rng(B.C.beach._hash(s, 'cal', pos, pn));
        while (c.pro.st === 'season') {
          const m = c.pro.m[c.pro.i], win = r() < 0.45 + 0.15 * f;
          const g = k => Math.max(0, Math.round((r() * 2 + 1) * f * k));
          const st = { kills: g(1.6), aces: g(0.5), blocks: g(0.6), digs: g(2.2), assists: g(3), errors: Math.max(0, Math.round((1 + r() * 3) / f)), recvP: g(1.2), perfect: g(1.3), good: g(2), poor: g(1), serves: 5 };
          const pts = m.pts, sc = win ? [pts, Math.round(pts * (0.5 + r() * 0.35))] : [Math.round(pts * (0.5 + r() * 0.35)), pts];
          P._doneWith(c, { sets: win ? [1, 0] : [0, 1], setScores: [sc], win }, st, null, sc[0] + sc[1]);
        }
        sum += c.pro.score; met += P.scoreParts(c).met;
      }
      line.push(pn + ' ' + Math.round(sum / N) + ' (' + Math.round(met / N * 10) + ' % obj.)');
    }
    console.log('  ' + mode + ' ' + pos + ': ' + line.join(' | '));
  }
}

// ------------------------------------------------------------------ 15. calibración con la sim (opcional)
// PROLOGUETEST_SIM=1: recorridos enteros del juvenil jugados en la sim (js/sim.js + ai.js + ai6.js) con los bots de tools/simtest.js
// (novato, medio, bueno) llevando a tu jugador; ingest de career.js y _doneWith con sus estadísticas y la nota en directo.
// PROLOGUETEST_N=k recorridos por bot y modalidad (por defecto 3). Imprime notas, resultados, puntuación y nivel. Tarda unos minutos.
if (process.env.PROLOGUETEST_SIM) {
  section('15. Calibración con la sim (bots de simtest)');
  const N = Math.max(1, +(process.env.PROLOGUETEST_N || 3));
  for (const mode of ['beach', 'hall']) for (const botN of ['novato', 'medio', 'bueno']) {
    const tiers = [];
    for (let s = 1; s <= N; s++) {
      const B = Hp.boot({ files: ['js/sim.js', 'js/ai.js', 'js/ai6.js'].concat(Hp.BASE.slice(1), [PRO]) });
      B.cx.process = { env: {} };
      const VB = B.VB, S = VB.Sim, DT = 1 / VB.C.SIM_HZ, P = VB.CareerPrologue;
      const src = fs.readFileSync(path.join(ROOT, 'tools', 'simtest.js'), 'utf8'), a = src.indexOf('const BOTS = {'), b = src.indexOf('function topWhy(');
      const bots = vm.runInContext('(function (S, C, DT, VB) {' + src.slice(a, b) + '; return { BOTS: BOTS, makeBot: makeBot }; })', B.cx)(S, VB.C, DT, VB);
      const c = mk(B, mode, 100 + s * 17, mode === 'beach' ? { prologue: true, role: s % 2 ? 'atk' : 'cr' } : { prologue: true }), K = E(B, c), line = [];
      toSeason(B, c);
      for (let i = 0; i < 5; i++) {
        const m = P.setup(c, i); if (!m) { ok(false, mode + ' ' + botN + ' s' + s + ': setup ' + i); break; }
        const six = m.format === '6v6';
        const g = S.createGame({ seed: 5000 + s * 31 + i, career: m.career, attrs: m.attrs, badges: m.badges, points: m.points, sets: 1, difficulty: m.difficulty, rookie: !!m.rookie,
          ctrl: 'one', ctrlIdx: six ? m.ctrlIdx : 0, ref: m.ref, venue: m.venue || 'beach', format: six ? '6v6' : undefined, ctrlRole: m.ctrlRole, names: m.names, nums: m.nums });
        g.career = m.career;
        const bot = bots.makeBot(bots.BOTS[botN], 77 + s * 5 + i, six ? { six: true, role: m.ctrlRole } : null), ev = [];
        for (let k = 0; k < 3600 * 120 && !(g.finished && g.mode === 'over'); k++) { S.step(g, DT, bot(g)); ev.length = 0; S.drainEvents(g, ev); B.C.ingest(ev, g); }
        const M = B.C.beach._M();
        const r = P._doneWith(c, { sets: [g.sets[0], g.sets[1]], setScores: g.setScores.map(x => [x[0], x[1]]), win: g.sets[0] > g.sets[1] }, M.p[0], M.rt, M.rallies);
        if (B.C.abortMatch) B.C.abortMatch();
        line.push(r ? (r.win ? 'G' : 'P') + r.sc.join('-') + ' ' + String(r.nota).replace('.', ',') : '?');
      }
      tiers.push(c.pro.score + ' ' + c.pro.tier);
      console.log('  ' + mode + ' ' + botN + ' ' + s + ': ' + line.join(' | ') + ' → ' + c.pro.score + ' (' + c.pro.tier + ')');
    }
    console.log('  ' + mode + ' ' + botN + ': ' + tiers.join(', '));
  }
}

console.log('\n' + passes + ' comprobaciones, ' + fails + ' fallos');
if (fails) { console.log('HAY FALLOS'); process.exit(1); }
console.log('TODO OK');
process.exit(0);
