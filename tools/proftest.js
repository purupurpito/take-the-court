#!/usr/bin/env node
/* TAKE THE COURT — tools/proftest.js (owner: ui_main)
 * Pruebas de js/profile.js (S4-D2 tanda A, T13) y del contrato D4 de prog.js / gym.js. Node puro (vm + localStorage falso):
 *  1) curva need/levelOf · 2) noteMatch (fórmula por modo y dificultad) · 3) dos dispositivos y 500 casos aleatorios (LCG de semilla
 *  fija): mergeRaw conmutativa, idempotente y asociativa; el nivel nunca baja · 4) relleno inicial (930 XP con 30 partidos y 12
 *  victorias; dos cálculos fusionados no duplican) · 5) hitos con datos falsos (ninguno dos veces) · 6) premios de nivel con look.js
 *  real (s:'hito', lockText «Perfil: Nv N») · 7) álbum (totales por pestaña, huecos con how, conseguidos con t y src; retos solo con
 *  VB.Retos) · 8) vitrina (≤ 3, unpin, fusión por pt) · 9) migraciones (.bak + lost, v:2 solo lectura, tamaño < 4 KB) · 10) prog.js y
 *  gym.js: .bak, solo lectura, Gym.ATTR · 12) Cuaderno del árbitro (sen: noteSena, pestaña, pie, vitrina, fusión, solo lectura, tamaño).
 * Uso: node tools/proftest.js   (acaba en «TODO OK» o sale con 1).
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
const SRC = {};
function src(f) { return SRC[f] || (SRC[f] = fs.readFileSync(path.join(ROOT, f), 'utf8')); }
/** Contexto nuevo. files: ficheros reales; pre(VB): stubs antes de profile.js. */
function load(store, files, pre) {
  const ctx = { console, Math, Date, JSON, localStorage: store };
  ctx.window = ctx; ctx.globalThis = ctx;
  vm.createContext(ctx);
  for (const f of files || ['js/prog.js', 'js/badges.js', 'js/gym.js', 'js/venues.js']) vm.runInContext(src(f), ctx, { filename: f });
  ctx.VB = ctx.VB || {};
  if (pre) pre(ctx.VB);
  vm.runInContext(src('js/profile.js'), ctx, { filename: 'js/profile.js' });
  return ctx.VB;
}
const J = o => JSON.stringify(o);
let seed = 12345;
function rnd() { seed = (seed * 1103515245 + 12345) >>> 0; return seed / 4294967296; }   // LCG fija (nunca Math.random)
function ri(n) { return Math.floor(rnd() * n); }

// ------------------------------------------------------------------ 1) curva
console.log('1) Curva');
{
  const P = load(fakeStorage()).Profile;
  ok('need(1) = 80, need(10) = 260', P.need(1) === 80 && P.need(10) === 260);
  const tot = l => { let s = 0; for (let i = 1; i < l; i++) s += P.need(i); return s; };
  ok('Nv 2 = 80, Nv 10 = 1 440, Nv 30 = 10 440, Nv 50 = 27 440', tot(2) === 80 && tot(10) === 1440 && tot(30) === 10440 && tot(50) === 27440);
  ok('levelOf en los bordes (1, 2, 10, 30, 50)', P.levelOf(0).lvl === 1 && P.levelOf(79).lvl === 1 && P.levelOf(80).lvl === 2 && P.levelOf(1439).lvl === 9 &&
    P.levelOf(1440).lvl === 10 && P.levelOf(10440).lvl === 30 && P.levelOf(27440).lvl === 50);
  const l99 = P.levelOf(tot(99) + 5e6);
  ok('máximo 99 (next 0)', l99.lvl === 99 && l99.next === 0 && P.levelOf(tot(99) - 1).lvl === 98);
  const l = P.levelOf(1440 + 100);
  ok('into/next/total', l.into === 100 && l.next === 260 && l.total === 1540);
}

// ------------------------------------------------------------------ 2) noteMatch
console.log('2) noteMatch');
{
  const st = fakeStorage();
  const VB = load(st), P = VB.Profile;
  const a = P.noteMatch({ mode: '2v2', win: true, setsWon: 2, diff: 'normal', venue: 'palau' });
  const b = P.noteMatch({ mode: '6v6', win: false, setsWon: 1, diff: 'hard', venue: 'canrebot' });
  const c = P.noteMatch({ mode: 'career', win: true, setsWon: 2, diff: 'expert', venue: 'platja' });
  const d = P.noteMatch({ mode: '2v2', win: false, setsWon: 0, diff: 'easy' });
  ok('2v2 gana 2-0 Normal = 45; 6v6 pierde con 1 set Difícil = 30; Carrera gana Experto = 63; Fácil 0 sets = 16', a.xp === 45 && b.xp === 30 && c.xp === 63 && d.xp === 16, [a.xp, b.xp, c.xp, d.xp].join());
  const s = P.stats();
  ok('stats: 4 partidos, 2 victorias, m2/m6/mc y 3 sedes', s.m === 4 && s.w === 2 && s.m2 === 2 && s.m6 === 1 && s.mc === 1 && s.ven === 3 && s.venAll === 6, J(s));
  const o = JSON.parse(st.getItem('make-the-cut.profile'));
  const dv = Object.keys(o.dev);
  ok('un contador por dispositivo (make-the-cut.devid, que no está en el perfil como clave suelta)', dv.length === 1 && dv[0] === st.getItem('make-the-cut.devid') && /^d[a-z0-9]+$/.test(dv[0]) && o.dev[dv[0]][0] === 154 && o.dev[dv[0]].length === 7);
  ok('hitos sellados (debut, gira) y su XP en el total', !!o.hit.debut && !!o.hit.gira && P.xp() === 154 + 3 * 20 + 40 + 60, String(P.xp()));
  ok('lvl0/lvl1/lvlUp coherentes', a.lvl0 === 1 && c.lvl1 >= c.lvl0 && typeof a.lvlUp === 'boolean');
  const r = P.check();
  ok('check() devuelve los hitos sellados por noteMatch una vez y luego nada', r.hitos.indexOf('debut') >= 0 && r.hitos.indexOf('gira') >= 0 && P.check().hitos.length === 0, J(r.hitos));
  ok('addMatch es noteMatch (nombre del plan §3.1)', P.addMatch === P.noteMatch);
  const g = P.noteGym('serve');
  ok('noteGym suma gy (hito «modos» cuando hay de todo)', P.stats().gy === 1 && (g.hitos.indexOf('modos') >= 0 || !!JSON.parse(st.getItem('make-the-cut.profile')).hit.modos));
}

// ------------------------------------------------------------------ 3) dos dispositivos y 500 casos
console.log('3) Dos dispositivos y fusión');
{
  const mk = (dev, n, w) => {
    const st = fakeStorage({ 'make-the-cut.devid': dev });
    const P = load(st).Profile;
    for (let i = 0; i < n; i++) P.noteMatch({ mode: '2v2', win: i < w, setsWon: i < w ? 2 : 0, diff: 'normal', venue: 'palau' });
    return { P, raw: st.getItem('make-the-cut.profile') };
  };
  const A = mk('dA', 7, 3), B = mk('dB', 5, 4);
  const AB = A.P.mergeRaw(A.raw, B.raw), BA = A.P.mergeRaw(B.raw, A.raw);
  const st = fakeStorage({ 'make-the-cut.profile': AB, 'make-the-cut.devid': 'dC' }), P = load(st).Profile;
  ok('fusión de A (7) y B (5): 12 partidos y 7 victorias', P.stats().m === 12 && P.stats().w === 7, J(P.stats()));
  ok('conmutativa (AB = BA)', AB === BA);
  ok('idempotente (A ∪ A = A, texto local intacto)', A.P.mergeRaw(A.raw, A.raw) === A.raw && A.P.mergeRaw(AB, A.raw) === AB);
  ok('el total suma los dos dispositivos', P.xp() >= A.P.xp() && P.xp() >= B.P.xp());
  // 500 casos aleatorios (perfiles sintéticos)
  const VBx = load(fakeStorage()), M = VBx.Profile, C = r => J(M.clean(JSON.parse(r)));
  const ACH = ['m1', 'm50', 'w1', 'w50', 't1', 'b50', 'a50', 'up', 'mvp'], VEN = ['palau', 'canrebot', 'cupula', 'platja', 'moll', 'fanals'];
  const AIDS = ['bd:canon:1', 'gym:serve:2', 'ach:m1', 'ven:palau', 'hit:debut', 'look:tAzul'];
  function randProf() {
    const o = { v: 1, base: { xp: ri(3) * 300, m: ri(3) * 10, w: ri(3) * 4 }, dev: {}, px: ri(4) ? 0 : ri(5000), ven: {}, ach: {}, hit: {}, bd: {}, car: {}, ann: 1 + ri(12), pin: [], pt: ri(3) ? ri(4) * 1000 : 0, seen: {} };
    const nd = ri(4); for (let i = 0; i < nd; i++) o.dev['d' + ri(5)] = { xp: ri(900), m: ri(30), w: ri(20), m2: ri(9), m6: ri(9), mc: ri(9), gy: ri(5), t: ri(1e6) };
    VEN.forEach(v => { if (ri(3) === 0) o.ven[v] = 1 + ri(1e6); });
    ACH.forEach(v => { if (ri(3) === 0) o.ach[v] = ri(4) ? 1 + ri(1e6) : 1; });
    ['debut', 'm25', 'gira', 'bd1'].forEach(v => { if (ri(2)) o.hit[v] = 1 + ri(1e6); });
    ['canon', 'mira', 'muro', 'lider'].forEach(v => { if (ri(2)) o.bd[v] = 1 + ri(3); });
    const nc = ri(5); for (let i = 0; i < nc; i++) o.car[(ri(2) ? 'b:' : 'h:') + ri(8)] = { p: ri(200), w: ri(100), tit: ri(4), aw: ri(3) };
    const np = ri(4); for (let i = 0; i < np; i++) { const a = AIDS[ri(AIDS.length)]; if (o.pin.indexOf(a) < 0) o.pin.push(a); }
    AIDS.forEach(a => { if (ri(2)) o.seen[a] = 1; });
    return J(o);
  }
  let com = 0, idem = 0, asso = 0, mono = 0, sums = 0;
  for (let i = 0; i < 500; i++) {
    const a = randProf(), b = randProf(), c = randProf();
    const ab = M.mergeRaw(a, b), ba = M.mergeRaw(b, a);
    if (C(ab) === C(ba)) com++;
    if (C(M.mergeRaw(a, a)) === C(a) && C(M.mergeRaw(ab, b)) === C(ab)) idem++;
    if (C(M.mergeRaw(M.mergeRaw(a, b), c)) === C(M.mergeRaw(a, M.mergeRaw(b, c)))) asso++;
    const pa = JSON.parse(a), pb = JSON.parse(b), pm = M.clean(JSON.parse(ab));
    if (pm.px >= pa.px && pm.px >= pb.px && pm.ann >= pa.ann && pm.ann >= pb.ann) mono++;
    // contadores por dispositivo: la suma fusionada es la del máximo por dispositivo (nunca se duplica ni se pierde)
    const want = new Set([...Object.keys(pa.dev), ...Object.keys(pb.dev)]); let s = 0;
    want.forEach(k => { s += Math.max(pa.dev[k] ? pa.dev[k].m : 0, pb.dev[k] ? pb.dev[k].m : 0); });
    if (Object.values(pm.dev).reduce((x, d) => x + d.m, 0) === s) sums++;
  }
  ok('500 casos: conmutativa', com === 500, com + '/500');
  ok('500 casos: idempotente', idem === 500, idem + '/500');
  ok('500 casos: asociativa', asso === 500, asso + '/500');
  ok('500 casos: px y ann nunca bajan (el nivel no baja)', mono === 500, mono + '/500');
  ok('500 casos: contadores por dispositivo por máximo', sums === 500, sums + '/500');
  ok('un lado ilegible no cuenta', M.mergeRaw(A.raw, '{roto') === A.raw && C(M.mergeRaw(null, A.raw)) === C(A.raw) && M.mergeRaw(A.raw, null) === A.raw);
  // tope de 40 Carreras
  const big = JSON.parse(randProf()); big.car = {}; for (let i = 0; i < 45; i++) big.car['b:' + i] = { p: i, w: 0, tit: 0, aw: 0 };
  const cb = M.clean(big);
  ok('car ≤ 40 (fuera las de menos partidos)', Object.keys(cb.car).length === 40 && !cb.car['b:0'] && !!cb.car['b:44']);
}

// ------------------------------------------------------------------ 4) relleno inicial
console.log('4) Relleno inicial');
{
  const rec = J({ played: 30, wins: 12 });
  const s1 = fakeStorage({ 'make-the-cut.record': rec, 'make-the-cut.devid': 'd1' }), s2 = fakeStorage({ 'make-the-cut.record': rec, 'make-the-cut.devid': 'd2' });
  const P1 = load(s1).Profile, P2 = load(s2).Profile;
  P1.check(); P2.check();
  const o1 = JSON.parse(s1.getItem('make-the-cut.profile'));
  ok('récord 30 partidos / 12 victorias → base.xp = 930, m = 30, w = 12', o1.base.xp === 930 && o1.base.m === 30 && o1.base.w === 12, J(o1.base));
  const mg = JSON.parse(P1.mergeRaw(s1.getItem('make-the-cut.profile'), s2.getItem('make-the-cut.profile')));
  ok('dos cálculos fusionados no duplican (máximo)', mg.base.xp === 930 && mg.base.m === 30);
  ok('m25 y w10 cuentan la base', !!o1.hit.m25 && !!o1.hit.w10 && !o1.hit.m100);
  // con Carreras y Salón de la Fama
  const s3 = fakeStorage({ 'make-the-cut.record': rec, 'make-the-cut.legends': J([{ name: 'X', num: 4, date: 1, score: 50, played: 40 }]) });
  const P3 = load(s3, null, VB => { VB.Career = { beach: { get: () => ({ seed: 77, career: { played: 10, won: 6 }, life: { ach: {}, awards: [] }, trophies: [] }) }, hall: { get: () => null } }; }).Profile;
  P3.check();
  const o3 = JSON.parse(s3.getItem('make-the-cut.profile'));
  ok('Carrera (10) y Salón (40) entran en la base: 930 + 25·50', o3.base.xp === 930 + 25 * 50 && o3.base.m === 80 && o3.base.w === 18, J(o3.base));
}

// ------------------------------------------------------------------ 5) hitos
console.log('5) Hitos');
{
  const allBd = {}; ['canon', 'mira', 'rompemanos', 'seda', 'bombardero', 'flotador', 'muro', 'ancla', 'red', 'motor', 'sangrefria', 'lider'].forEach(k => { allBd[k] = 1; }); allBd.canon = 3;
  const ach = {}; ['m1', 'm50', 'w1', 'w50', 'p500', 'a50', 'b50', 'n9', 's5', 'up'].forEach((k, i) => { ach[k] = 1 + (i % 3); });
  const gym = { v: 1, d: {}, free: { rally: 0 }, xp: {} }; ['serve', 'recv', 'set', 'atk', 'block'].forEach(k => { gym.d[k] = { b: 30, m: 3, n: 2, t: 5 }; });
  const st = fakeStorage({ 'make-the-cut.gym': J(gym), 'make-the-cut.devid': 'dh' });
  const VB = load(st, null, VB => {
    VB.Career = { beach: { get: () => ({ seed: 'abc', career: { played: 3, won: 2 }, life: { ach: ach, awards: [{ id: 'mvp' }] }, trophies: [{ kind: 'liga', name: 'x' }, { kind: 'ascenso' }], player: { bd: { muro: 2 } } }) },
      hall: { get: () => ({ seed: 9, career: { played: 1, won: 0 }, life: { ach: { m1: 1 }, awards: [] }, trophies: [], player: { bd: {} } }) } };
  });
  const sq = VB.Prog.squad(); sq[0].bd = allBd; VB.Prog.save();
  const P = VB.Profile;
  ['palau', 'canrebot', 'cupula', 'platja', 'moll', 'fanals'].forEach((v, i) => P.noteMatch({ mode: i % 2 ? '6v6' : 'career', win: true, setsWon: 2, diff: 'normal', venue: v }));
  P.noteMatch({ mode: '2v2', win: false, setsWon: 0, diff: 'normal', venue: 'palau' });
  const o = JSON.parse(st.getItem('make-the-cut.profile'));
  const want = ['debut', 'gira', 'sedes', 'bd1', 'bd12', 'oro', 'gym5', 'gymoro', 'vida', 'titulo'];
  ok('debut, gira, sedes (6 sedes), bd12, oro, gym5, gymoro, vida y titulo', want.every(k => o.hit[k]), want.filter(k => !o.hit[k]).join() || 'todos');
  ok('modos: 2v2 + 6v6 + Carrera y, sin noteGym, los intentos que ya hay en VB.Gym cuentan como Entrenamiento', !!o.hit.modos);
  ok('m25 y w10 todavía no', !o.hit.m25 && !o.hit.w10);
  ok('car por Carrera (b:abc [p, w, tit, aw] con 1 título, h:9)', o.car['b:abc'] && o.car['b:abc'][2] === 1 && o.car['b:abc'][3] === 1 && !!o.car['h:9'], J(o.car));
  ok('bd por máximo entre atletas (canon 3, muro 2 de la Carrera)', o.bd.canon === 3 && o.bd.muro === 2);
  ok('ach: unión de las dos Carreras (11)', Object.keys(o.ach).length === 10 && !!o.ach.m1);
  const t0 = J(o.hit), r = P.check(), r2 = P.check();
  ok('ningún hito dos veces (check repetido no sella ni cambia horas)', r2.hitos.length === 0 && J(JSON.parse(st.getItem('make-the-cut.profile')).hit) === t0);
  const tot = P.xp();
  ok('XP derivada: medallas (5 oros = 500) + insignias + logros + títulos + sedes + hitos', tot > 500 + 12 * 15 + 10 * 30 + 50 + 6 * 20, String(tot));
}

// ------------------------------------------------------------------ 6) premios de nivel (look.js real)
console.log('6) Premios de nivel');
{
  const st = fakeStorage({ 'make-the-cut.devid': 'dp' });
  const VB = load(st, ['js/prog.js', 'js/badges.js', 'js/gym.js', 'js/venues.js', 'js/look.js']), L = VB.Look, P = VB.Profile;
  const items = L.CATALOG.filter(it => (it.unlock || []).some(u => u && u.lvl));
  if (!items.length) { console.log('  AVISO: look.js sin la alternativa {lvl} (T9): premios sin probar'); }
  else {
    const lv8 = items.find(it => it.unlock.some(u => u.lvl === 8));
    ok('hay premios por nivel en look.js (' + items.length + ')', items.length >= 8, items.map(it => it.id + '@' + it.unlock.find(u => u.lvl).lvl).join(' '));
    const g = L.checkGlobal({ lvl: 8, gym: {}, gymN: 0, rec: { wins: 0, played: 0, streak: 0 } });
    ok('checkGlobal({lvl:8}) concede manguitoRayas con s:\'hito\'', lv8 && lv8.id === 'manguitoRayas' && g.indexOf('manguitoRayas') >= 0 && L.owned('manguitoRayas') && L.load().own.manguitoRayas.s === 'hito', J(g));
    ok('y nada por encima del Nv 8', !L.owned('tAzul'));
    ok('lockText(\'tAzul\') contiene «Perfil: Nv 10»', /Perfil: Nv 10/.test(L.lockText('tAzul')), L.lockText('tAzul'));
    // por el perfil: con XP de Nv 10 el check concede los premios ≤ 10 y la siguiente es la de más arriba
    const st2 = fakeStorage({ 'make-the-cut.devid': 'dq', 'make-the-cut.record': J({ played: 40, wins: 10 }) });
    const VB2 = load(st2, ['js/prog.js', 'js/badges.js', 'js/gym.js', 'js/venues.js', 'js/look.js']);
    const r = VB2.Profile.check(), lv = VB2.Profile.level().lvl;
    const due = items.filter(it => it.unlock.find(u => u.lvl).lvl <= lv).map(it => it.id);
    ok('Profile.check() concede los premios de su nivel (' + lv + ') y los devuelve en grants', due.length > 0 && due.every(id => VB2.Look.owned(id)) && due.every(id => r.grants.indexOf(id) >= 0) && r.lvlUp.length === 1 && r.lvlUp[0] === lv, J(r));
    const np = VB2.Profile.nextPrize();
    ok('nextPrize() = el primer premio por encima', np && np.lvl > lv && np.name, J(np));
    ok('check() otra vez: sin grants nuevos', VB2.Profile.check().grants.length === 0);
    // noteMatch que cruza un nivel con premio
    const st3 = fakeStorage({ 'make-the-cut.devid': 'dr' }), VB3 = load(st3, ['js/prog.js', 'js/badges.js', 'js/gym.js', 'js/venues.js', 'js/look.js']);
    VB3.Profile.check();
    const r3 = VB3.Profile.noteMatch({ mode: '2v2', win: true, setsWon: 2, diff: 'expert', venue: 'palau' });   // 63 + debut 40 + sede 20 → Nv 2
    ok('noteMatch: Nv 2 con premio «Tira nasal»', r3.lvlUp && r3.lvl1 === 2 && r3.prize.indexOf('tiraNasal') >= 0 && r3.prizeName === 'Tira nasal', J(r3));
  }
}

// ------------------------------------------------------------------ 7) álbum
console.log('7) Álbum');
{
  const st = fakeStorage({ 'make-the-cut.devid': 'da' });
  let cl = null;
  try { const c = { console, Math, Date, JSON, localStorage: fakeStorage() }; c.window = c; vm.createContext(c); vm.runInContext(src('js/career-life.js'), c); cl = c.VB.CareerLife; } catch (e) { cl = null; }
  const achInfo = cl && Array.isArray(cl.ACH_INFO) ? cl.ACH_INFO : null;
  if (!achInfo) console.log('  AVISO: career-life.js aún sin ACH_INFO (T10): se usa una lista falsa de 31');
  const ACHL = achInfo || Array.from({ length: 31 }, (_, i) => ({ id: 'a' + i, name: 'Logro ' + i, d: 'Haz ' + i, only: i === 3 ? 'hall' : undefined }));
  const VB = load(st, ['js/prog.js', 'js/badges.js', 'js/gym.js', 'js/venues.js', 'js/look.js'], VB => { VB.CareerLife = { ACH_INFO: ACHL }; });
  const P = VB.Profile, L = VB.Look;
  P.noteMatch({ mode: '2v2', win: true, setsWon: 2, diff: 'normal', venue: 'moll' });
  const al = P.album(), by = {}; al.tabs.forEach(t => { by[t.id] = t; });
  const lockN = L.CATALOG.concat(L.PALETTE).filter(it => !L.isStart(it.id)).length;
  ok('pestañas en orden sin Retos: Vestuario, Insignias, Entreno, Carrera, Sedes, Hitos', al.tabs.map(t => t.label).join() === 'Vestuario,Insignias,Entreno,Carrera,Sedes,Hitos', al.tabs.map(t => t.label).join());
  ok('totales: Vestuario ' + lockN + ' (bloqueables), Insignias 36, Entreno 15, Carrera ' + ACHL.length + ', Sedes 6, Hitos 16',
    by.vestuario.total === lockN && by.insignias.total === 36 && by.entreno.total === 15 && by.carrera.total === ACHL.length && by.sedes.total === 6 && by.hitos.total === 16,
    al.tabs.map(t => t.id + ' ' + t.have + '/' + t.total).join(', '));
  ok('suma de have/total', al.total === al.tabs.reduce((a, t) => a + t.total, 0) && al.have === al.tabs.reduce((a, t) => a + t.have, 0));
  const moll = by.sedes.items.find(i => i.aid === 'ven:moll'), fan = by.sedes.items.find(i => i.aid === 'ven:fanals');
  ok('sede conseguida con t; hueco con «Juega un partido en Cala dels Fanals»', moll.have && moll.t > 0 && !fan.have && fan.how === 'Juega un partido en Cala dels Fanals');
  ok('pie: «Conseguido el D mes AAAA»', /^Conseguido el \d{1,2} (ene|feb|mar|abr|may|jun|jul|ago|sep|oct|nov|dic) \d{4}$/.test(P.footText(moll)), P.footText(moll));
  const lk = by.vestuario.items.find(i => i.aid === 'look:tAzul');
  ok('hueco del Vestuario: «Cómo se gana: …»', lk && !lk.have && /^Cómo se gana: /.test(lk.how), lk && lk.how);
  L.grant('tAzul', 'tienda');
  const lk2 = P.album().tabs[0].items.find(i => i.aid === 'look:tAzul');
  ok('conseguido del Vestuario con t y src (pie «… en la tienda»)', lk2.have && lk2.t > 0 && lk2.src === 'tienda' && / en la tienda$/.test(P.footText(lk2)) && lk2.isNew, P.footText(lk2));
  const pista = by.carrera.items.find(i => / \(pista\)$/.test(i.name));
  ok('logros solo de pista con «(pista)»', !!pista, pista && pista.name);
  ok('hitos: debut conseguido, how con la condición', by.hitos.items[0].have && by.hitos.items[1].how.indexOf('Juega 25 partidos') === 0);
  ok('items con la forma {aid, name, icon, have, tier, t, src, how, isNew}', al.tabs.every(t => t.items.every(i => typeof i.aid === 'string' && typeof i.name === 'string' && typeof i.have === 'boolean' && 'icon' in i && 'tier' in i && 't' in i && 'src' in i && 'how' in i && 'isNew' in i)));
  // con Retos
  const VB2 = load(fakeStorage(), ['js/prog.js', 'js/badges.js', 'js/gym.js', 'js/venues.js', 'js/look.js', 'js/retos.js'], VB => { VB.CareerLife = { ACH_INFO: ACHL }; });
  const al2 = VB2.Profile.album();
  ok('con VB.Retos: pestaña «Retos» (18) entre Carrera y Sedes', al2.tabs.map(t => t.id).join() === 'vestuario,insignias,entreno,carrera,retos,sedes,hitos' && al2.tabs[4].total === 18, al2.tabs.map(t => t.id + ' ' + t.total).join());
  const u0 = P.unseenCount(), m1 = P.markSeen(['ven:moll', 'hit:debut']), u1 = P.unseenCount(), m2 = P.markSeen(['ven:moll']);
  ok('unseenCount cuenta sellos del perfil; markSeen los quita (y no repite)', u0 >= 2 && m1 && u1 === u0 - 2 && !m2 && !P.album().tabs.find(t => t.id === 'sedes').items.find(i => i.aid === 'ven:moll').isNew, u0 + ' → ' + u1);
}

// ------------------------------------------------------------------ 8) vitrina
console.log('8) Vitrina');
{
  const st = fakeStorage({ 'make-the-cut.devid': 'dv' });
  const VB = load(st), P = VB.Profile;
  ['palau', 'canrebot', 'cupula', 'platja'].forEach(v => P.noteMatch({ mode: '2v2', win: true, setsWon: 2, diff: 'normal', venue: v }));
  ok('pin: solo lo conseguido', !P.pin('ven:fanals') && P.pin('ven:palau') && P.pin('ven:cupula') && P.pin('hit:debut'));
  ok('pin: como mucho 3 y sin repetir', !P.pin('ven:platja') && !P.pin('ven:palau') && J(P.vitrina()) === J(['ven:palau', 'ven:cupula', 'hit:debut']));
  ok('unpin', P.unpin('ven:cupula') && !P.unpin('ven:cupula') && P.vitrina().length === 2);
  const A = st.getItem('make-the-cut.profile');
  const o = JSON.parse(A); o.pin = ['ven:platja']; o.pt = o.pt + 1000; const B = J(o);
  ok('fusión de la vitrina: gana la pt mayor (los dos órdenes)', J(JSON.parse(P.mergeRaw(A, B)).pin) === '["ven:platja"]' && J(JSON.parse(P.mergeRaw(B, A)).pin) === '["ven:platja"]');
  const st2 = fakeStorage({ 'make-the-cut.devid': 'dw' }), P2 = load(st2).Profile;
  P2.noteMatch({ mode: '2v2', win: true, setsWon: 2, diff: 'normal', venue: 'palau' });
  ok('sin fijadas: vitrina automática (≤ 3)', Array.isArray(P2.vitrina()) && P2.vitrina().length <= 3);
}

// ------------------------------------------------------------------ 9) migraciones y tamaño
console.log('9) Migraciones');
{
  const st = fakeStorage({ 'make-the-cut.profile': '{roto', 'make-the-cut.devid': 'dm' });
  const P = load(st).Profile;
  ok('texto dañado → .bak y lost()', P.lost() && st.getItem('make-the-cut.profile.bak') === '{roto' && P.level().lvl === 1);
  P.noteMatch({ mode: '2v2', win: true, setsWon: 2, diff: 'normal' });
  ok('y se empieza en blanco (lost() sigue avisando)', JSON.parse(st.getItem('make-the-cut.profile')).v === 1 && P.lost() && st.getItem('make-the-cut.profile.bak') === '{roto');
  const v2 = J({ v: 2, base: { xp: 5000, m: 1, w: 1 }, nuevo: { x: 1 } });
  const s2 = fakeStorage({ 'make-the-cut.profile': v2, 'make-the-cut.devid': 'dn' }), P2 = load(s2).Profile;
  P2.noteMatch({ mode: '2v2', win: true, setsWon: 2, diff: 'normal' }); P2.pin('hit:debut'); P2.markSeen(['hit:debut']);
  ok('v:2 → readOnly(), sin escribir (el texto no cambia)', P2.readOnly() && s2.getItem('make-the-cut.profile') === v2);
  ok('v:2 → se ve el nivel de su copia saneada', P2.level().total >= 5000);
  ok('mergeRaw con v:2 devuelve el de v:2 (los dos órdenes)', P2.mergeRaw(v2, st.getItem('make-the-cut.profile')) === v2 && P2.mergeRaw(st.getItem('make-the-cut.profile'), v2) === v2);
  const v0 = J({ v: 0, base: { xp: 10, m: 1, w: 0 } });
  const s0 = fakeStorage({ 'make-the-cut.profile': v0 }), P0 = load(s0).Profile; P0.level();
  ok('v:0 → .bak {from:0, raw} y se migra a v1', J(JSON.parse(s0.getItem('make-the-cut.profile.bak'))) === J({ from: 0, raw: v0 }) && JSON.parse(s0.getItem('make-the-cut.profile')).v === 1);
  // tamaño: 24 dispositivos, 40 Carreras, todo conseguido
  const o = { v: 1, base: { xp: 99999, m: 9999, w: 9999 }, dev: {}, px: 999999, ven: {}, ach: {}, hit: {}, bd: {}, car: {}, ann: 60, pin: ['bd:canon:3', 'gym:serve:3', 'ach:t5'], pt: Date.now(), seen: {} };
  const T = Date.now();
  for (let i = 0; i < 24; i++) o.dev['d' + (T + i * 7777).toString(36) + 'ab' + i] = { xp: 99999, m: 9999, w: 9999, m2: 999, m6: 999, mc: 999, gy: 99, t: T };
  for (let i = 0; i < 40; i++) o.car['b:' + (1e9 + i * 7919)] = { p: 999, w: 999, tit: 99, aw: 99 };
  ['palau', 'canrebot', 'cupula', 'platja', 'moll', 'fanals'].forEach(k => { o.ven[k] = T; });
  for (let i = 0; i < 31; i++) o.ach['a' + i] = T;
  P.HITOS.forEach(h => { o.hit[h.id] = T; });
  ['canon', 'mira', 'rompemanos', 'seda', 'bombardero', 'flotador', 'muro', 'ancla', 'red', 'motor', 'sangrefria', 'lider'].forEach(k => { o.bd[k] = 3; });
  const len = J(P.pack(o)).length;
  ok('tamaño < 4 KB con 24 dispositivos y 40 Carreras (sin sellos vistos)', len < 4096, len + ' caracteres');
  ['canon', 'mira', 'rompemanos', 'seda', 'bombardero', 'flotador', 'muro', 'ancla', 'red', 'motor', 'sangrefria', 'lider'].forEach(k => { for (let l = 1; l <= 3; l++) o.seen['bd:' + k + ':' + l] = 1; });
  ['ven', 'ach', 'hit'].forEach(f => Object.keys(o[f]).forEach(k => { o.seen[f + ':' + k] = 1; }));
  const len2 = J(P.pack(o)).length;
  ok('con todos los sellos vistos sigue muy por debajo del tope de la nube (informativo < 8 KB)', len2 < 8192, len2 + ' caracteres');
}

// ------------------------------------------------------------------ 10) prog.js y gym.js (contrato D4)
console.log('10) prog.js y gym.js');
{
  const s1 = fakeStorage({ 'make-the-cut.squad': 'no es json' });
  const VB = load(s1);
  ok('escuadrón dañado → make-the-cut.squad.bak, lost() y no se reescribe al cargar', VB.Prog.squad()[0].lvl === 1 && VB.Prog.lost() && s1.getItem('make-the-cut.squad.bak') === 'no es json' && s1.getItem('make-the-cut.squad') === 'no es json');
  const s1b = fakeStorage({ 'make-the-cut.squad': J({ v: 3, x: 1 }) });
  ok('escuadrón sin la lista de atletas → .bak y lost()', load(s1b).Prog.lost() && s1b.getItem('make-the-cut.squad.bak') === J({ v: 3, x: 1 }));
  const v9 = J({ v: 9, a: [{ lvl: 30, xp: 5, st: { spike: 90 } }, { lvl: 20 }] });
  const s2 = fakeStorage({ 'make-the-cut.squad': v9 }), VB2 = load(s2);
  VB2.Prog.addXP(0, 500); VB2.Prog.bump(0, 'jump', 1);
  ok('escuadrón v:9 → readOnly(), se juega con la copia saneada y no se escribe', VB2.Prog.readOnly() && VB2.Prog.squad()[0].lvl >= 30 && s2.getItem('make-the-cut.squad') === v9);
  const v2 = J({ v: 2, a: [{ lvl: 3, st: { spike: 50 } }, { lvl: 2 }] });
  const s3 = fakeStorage({ 'make-the-cut.squad': v2 }), VB3 = load(s3); VB3.Prog.squad();
  ok('escuadrón v:2 → .bak {from:2, raw} antes de migrar y se guarda como v3', J(JSON.parse(s3.getItem('make-the-cut.squad.bak'))) === J({ from: 2, raw: v2 }) && JSON.parse(s3.getItem('make-the-cut.squad')).v === 3 && !VB3.Prog.lost());
  const s4 = fakeStorage(), VB4 = load(s4); VB4.Prog.squad();
  ok('sin guardado: ni lost ni .bak', !VB4.Prog.lost() && !VB4.Prog.readOnly() && s4.getItem('make-the-cut.squad.bak') === null);
  // gym
  const g9 = J({ v: 9, d: { serve: { b: 10, m: 0, n: 1, t: 1 } }, free: { rally: 3 }, xp: {} });
  const s5 = fakeStorage({ 'make-the-cut.gym': g9 }), VB5 = load(s5), xp0 = VB5.Prog.squad()[0].xp + VB5.Prog.squad()[0].lvl * 1000;
  const rr = VB5.Gym.record('serve', 30);
  ok('make-the-cut.gym v:9 → readOnly(), no se reescribe ni paga XP', VB5.Gym.readOnly() && s5.getItem('make-the-cut.gym') === g9 && rr.xp === 0 && VB5.Prog.squad()[0].xp + VB5.Prog.squad()[0].lvl * 1000 === xp0 && VB5.Gym.get('serve').b === 10);
  const s6 = fakeStorage({ 'make-the-cut.gym': '[1,2]' }), VB6 = load(s6);
  ok('make-the-cut.gym dañado → .bak y lost() (y vacío)', VB6.Gym.count() === 0 && VB6.Gym.lost() && s6.getItem('make-the-cut.gym.bak') === '[1,2]');
  VB6.Gym.record('block', 12);
  ok('…y se puede seguir entrenando (guarda v1 nuevo; el .bak se queda)', JSON.parse(s6.getItem('make-the-cut.gym')).v === 1 && s6.getItem('make-the-cut.gym.bak') === '[1,2]');
  ok('Gym.ATTR (R19)', J(VB.Gym.ATTR) === J({ serve: 'serve', recv: 'recv', set: 'set', atk: 'spike', block: 'block' }) && Object.values(VB.Gym.ATTR).every(k => VB.Prog.KEYS.indexOf(k) >= 0));
}

// ------------------------------------------------------------------ 11) sin almacenamiento ni módulos
console.log('11) Sin almacenamiento');
{
  const ctx = { console, Math, Date, JSON }; ctx.window = ctx; vm.createContext(ctx);
  Object.defineProperty(ctx, 'localStorage', { get() { throw new Error('bloqueado'); } });
  vm.runInContext(src('js/profile.js'), ctx);
  const P = ctx.VB.Profile;
  const r = P.noteMatch({ mode: '2v2', win: true, setsWon: 2, diff: 'normal', venue: 'palau' });
  ok('funciona en memoria sin localStorage ni otros módulos', r.xp === 45 && P.stats().m === 1 && P.album().tabs.length >= 4 && P.level().lvl >= 1);
}

// ------------------------------------------------------------------ 12) Cuaderno del árbitro (idea «senas»)
console.log('12) Cuaderno del árbitro');
{
  const FILES = ['js/prog.js', 'js/badges.js', 'js/gym.js', 'js/venues.js', 'js/senas.js'];
  const st = fakeStorage({ 'make-the-cut.devid': 'dS' }), VB = load(st, FILES), P = VB.Profile, S = VB.Senas;
  const raw0 = st.getItem('make-the-cut.profile');
  ok('sin señas: el perfil guardado no lleva «sen» (texto de siempre)', raw0 === null || !('sen' in JSON.parse(raw0)));
  ok('noteSena: nueva la 1.ª vez, no la 2.ª', P.noteSena('dobles') === true && P.noteSena('dobles') === false);
  ok('noteSena: id desconocido o mal formado no se apunta', P.noteSena('nada') === false && P.noteSena('a b') === false && P.noteSena(5) === false);
  const sv = JSON.parse(st.getItem('make-the-cut.profile'));
  ok('se guarda sen:{dobles:día}', sv.sen && sv.sen.dobles === Math.floor(Date.now() / 864e5) && Object.keys(sv.sen).length === 1, J(sv.sen));
  const alb = P.album(), tb = alb.tabs[alb.tabs.length - 1];
  ok('pestaña «cuaderno» la última, con las 11 señas', tb.id === 'cuaderno' && tb.short === 'Cuaderno' && tb.total === S.LIST.length && S.LIST.length === 11 && tb.have === 1, tb.id + ' ' + tb.have + '/' + tb.total);
  const it = tb.items.filter(x => x.aid === 'sen:dobles')[0], it2 = tb.items.filter(x => x.aid === 'sen:red')[0];
  ok('hueco conseguido: icono SVG, t, rule, isNew', it.have && it.icon.charAt(0) === '<' && it.t > 1e11 && it.rule === S.BY.dobles.rule && it.isNew);
  ok('hueco sin conseguir: how y sin isNew', !it2.have && /primera vez/.test(it2.how) && !it2.isNew);
  ok('footText: «Vista el …» + regla / how', /^Vista el \d+ [a-z]{3} \d{4}\. Regla 9\.3\.4/.test(P.footText(it)) && P.footText(it2) === it2.how, P.footText(it));
  const un0 = P.unseenCount(); P.markSeen(['sen:dobles']);
  ok('unseenCount cuenta la seña nueva y markSeen la quita', un0 >= 1 && P.unseenCount() === un0 - 1 && !P.album().tabs.filter(t => t.id === 'cuaderno')[0].items.filter(x => x.aid === 'sen:dobles')[0].isNew);
  ok('se puede fijar en la vitrina (haveAid sen:)', P.pin('sen:dobles') === true && P.vitrina().indexOf('sen:dobles') >= 0 && P.pin('sen:red') === false);
  ok('no da XP', (() => { const s2 = fakeStorage({ 'make-the-cut.devid': 'dT' }), P2 = load(s2, FILES).Profile; const x0 = P2.xp(); S.LIST.forEach(x => P2.noteSena(x.id)); return P2.xp() === x0; })());
  const ro = J({ v: 2, base: { xp: 0, m: 0, w: 0 } }), sr = fakeStorage({ 'make-the-cut.profile': ro }), Pr = load(sr, FILES).Profile;
  ok('perfil de solo lectura: noteSena no guarda', Pr.noteSena('fuera') === false && sr.getItem('make-the-cut.profile') === ro);
  ok('sin VB.Senas no hay pestaña cuaderno', !load(fakeStorage()).Profile.album().tabs.some(t => t.id === 'cuaderno'));
  // fusión con sen al azar: conmutativa, idempotente, asociativa; la fecha más antigua gana; un perfil viejo sin sen no la borra
  const M = P, C = r => J(M.clean(JSON.parse(r))), IDS = S.LIST.map(x => x.id);
  function rp() {
    const o = { v: 1, base: { xp: ri(3) * 100, m: 0, w: 0 }, dev: {}, px: 0, ven: {}, ach: {}, hit: {}, bd: {}, car: {}, ann: 1, pin: [], pt: 0, seen: {} };
    if (ri(4)) { o.sen = {}; IDS.forEach(k => { if (ri(3) === 0) o.sen[k] = 20000 + ri(400); }); }
    return J(o);
  }
  let com = 0, idem = 0, asso = 0, old = 0;
  for (let i = 0; i < 300; i++) {
    const a = rp(), b = rp(), c = rp(), ab = M.mergeRaw(a, b);
    if (C(ab) === C(M.mergeRaw(b, a))) com++;
    if (C(M.mergeRaw(a, a)) === C(a) && C(M.mergeRaw(ab, b)) === C(ab)) idem++;
    if (C(M.mergeRaw(M.mergeRaw(a, b), c)) === C(M.mergeRaw(a, M.mergeRaw(b, c)))) asso++;
    const pa = JSON.parse(a), pb = JSON.parse(b), pm = M.clean(JSON.parse(ab)), sa = pa.sen || {}, sb = pb.sen || {};
    if (IDS.every(k => (pm.sen[k] || 0) === (sa[k] && sb[k] ? Math.min(sa[k], sb[k]) : sa[k] || sb[k] || 0))) old++;
  }
  ok('300 casos con sen: conmutativa / idempotente / asociativa', com === 300 && idem === 300 && asso === 300, com + '/' + idem + '/' + asso);
  ok('300 casos con sen: la fecha más antigua y nada se pierde', old === 300, old + '/300');
  const viejo = J({ v: 1, base: { xp: 10, m: 1, w: 0 } }), nuevo = st.getItem('make-the-cut.profile');
  ok('un perfil viejo sin sen no se come el nuevo', JSON.parse(M.mergeRaw(nuevo, viejo)).sen.dobles > 0 && JSON.parse(M.mergeRaw(viejo, nuevo)).sen.dobles > 0);
  const sz = fakeStorage({ 'make-the-cut.devid': 'dZ' }), Pz = load(sz, FILES).Profile;
  for (let i = 0; i < 24; i++) Pz.noteMatch({ mode: '2v2', win: true, setsWon: 2, diff: 'normal', venue: 'palau' });
  S.LIST.forEach(x => Pz.noteSena(x.id));
  ok('tamaño < 4 KB con las 11 señas', sz.getItem('make-the-cut.profile').length < 4096, sz.getItem('make-the-cut.profile').length + ' B');
}

console.log(fails ? '\n' + fails + ' FALLOS (' + oks + ' ok)' : '\nTODO OK (' + oks + ' comprobaciones)');
process.exit(fails ? 1 : 0);
