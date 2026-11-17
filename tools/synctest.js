#!/usr/bin/env node
/* MAKE THE CUT — tools/synctest.js (owner: ui_main)
 * Pruebas de la sincronización de js/account.js (S4-D4, T13). Node con vm; account.js con stubs de window, document,
 * Storage.prototype, sessionStorage, location y fetch (Firestore falso en memoria): SIN RED.
 *  1) S4_SYNC = false: las claves nuevas no están en DOCS pero su escritura apunta la hora (TRACK); con true (texto del fichero
 *     reescrito antes de runInContext) sí están, con sus nombres.
 *  2) _merge con un remoto falso: profile (unión con VB.Profile.mergeRaw), legends (unión, top 20), career6 la primera vez (conflicto),
 *     career + career6 a la vez (dos en cola, resueltos uno a uno), cmode (LWW), gym/look (como hasta ahora), retos (VB.Retos.mergeRaw).
 *  3) .prev: al ganar el remoto en una Carrera, la local queda en '<clave>.prev' (que no va a DOCS ni a TRACK).
 *  4) Fuera del menú syncDown no baja nada; menuReady() lo aplica. Tras la primera recarga, ganchos (Prog._reload,
 *     Career.hall._reset, UI.refreshMenu) en vez de recargar; la primera vez, recarga.
 *  5) Tope de tamaño: 395 000 caracteres no generan PATCH, dejan el error «Tu Carrera es demasiado grande para la nube» y no se
 *     reintenta hasta el siguiente cambio.
 *  6) PATCH con {data, updatedAt, v}; readAll con pageSize=50; deleteAccount borra todo lo que lista readAll.
 *  7) Reglas al día: cada valor de DOCS (con GYM/LOOK/S4 encendidos) está en `key in [...]` de firebase/firestore.rules.
 * Uso: node tools/synctest.js   (acaba en «TODO OK» o sale con 1).
 */
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm');
const ROOT = path.join(__dirname, '..');
let fails = 0, oks = 0;
function ok(name, cond, extra) { if (cond) { oks++; console.log('  ok   ' + name + (extra ? '  (' + extra + ')' : '')); } else { fails++; console.log('  FALLO ' + name + (extra ? '  (' + extra + ')' : '')); } }
const J = o => JSON.stringify(o);
const sleep = ms => new Promise(r => setTimeout(r, ms));
const ACC_SRC = fs.readFileSync(path.join(ROOT, 'js/account.js'), 'utf8');

/** Navegador falso + Firestore en memoria. o = {s4, look, ls:{clave: texto}, remote:{nombre: {data, at}}, state, files:[js extra]} */
function boot(o) {
  o = o || {};
  class Storage {
    constructor() { this._m = new Map(); }
    getItem(k) { return this._m.has(k) ? this._m.get(k) : null; }
    setItem(k, v) { this._m.set(k, String(v)); }
    removeItem(k) { this._m.delete(k); }
  }
  const LS = new Storage(), SS = new Storage();
  Object.entries(o.ls || {}).forEach(([k, v]) => LS._m.set(k, v));
  LS._m.set('make-the-cut.account', J({ uid: 'u1', rt: 'r1', user: 'prueba', it: 'tok', ie: Date.now() + 3600e3 }));
  if (o.rl) SS._m.set('make-the-cut.account.rl', '1');
  const remote = new Map(Object.entries(o.remote || {}));
  const calls = [];
  const el = () => ({ setAttribute() { }, appendChild() { }, addEventListener() { }, querySelector() { return null; }, querySelectorAll() { return []; }, style: {}, hidden: true });
  const document = { readyState: 'loading', visibilityState: 'visible', addEventListener() { }, getElementById() { return null }, createElement: el, body: el(), head: el() };
  const res = (status, j) => ({ ok: status >= 200 && status < 300, status, json: async () => j });
  async function fetch(url, opt) {
    const m = (opt && opt.method) || 'GET';
    calls.push({ url, method: m, body: opt && opt.body ? JSON.parse(opt.body) : null });
    if (url.indexOf('identitytoolkit') >= 0) return res(200, {});
    const p = url.split('/documents/')[1] || '';
    if (m === 'GET' && /\/saves\?pageSize=/.test(url)) {
      return res(200, { documents: [...remote.entries()].map(([n, d]) => ({ name: 'projects/x/databases/(default)/documents/users/u1/saves/' + n, fields: { data: { stringValue: d.data }, updatedAt: { integerValue: String(d.at) } } })) });
    }
    const name = p.split('/').pop();
    if (m === 'PATCH') { const f = JSON.parse(opt.body).fields; remote.set(name, { data: f.data.stringValue, at: +f.updatedAt.integerValue }); return res(200, {}); }
    if (m === 'DELETE') { remote.delete(name); return res(200, {}); }
    return res(404, {});
  }
  let reloads = 0;
  const ctx = { console, Math, Date, JSON, Object, Array, Promise, setTimeout, clearTimeout, setInterval() { }, AbortController, Storage, localStorage: LS, sessionStorage: SS,
    document, fetch, location: { reload() { reloads++; } }, addEventListener() { } };
  ctx.window = ctx; ctx.globalThis = ctx;
  vm.createContext(ctx);
  ctx.VB = { ctx: { state: o.state || 'menu' } };
  (o.files || []).forEach(f => vm.runInContext(fs.readFileSync(path.join(ROOT, f), 'utf8'), ctx, { filename: f }));
  let src = ACC_SRC;
  if (o.s4) src = src.replace('var S4_SYNC = false;', 'var S4_SYNC = true;');
  if (o.look) src = src.replace('var LOOK_SYNC = false;', 'var LOOK_SYNC = true;');
  vm.runInContext(src, ctx, { filename: 'js/account.js' });
  return { ctx, VB: ctx.VB, A: ctx.VB.Account, LS, SS, remote, calls, reloads: () => reloads };
}
const S4 = { 'make-the-cut.profile': 'profile', 'make-the-cut.career6': 'career6', 'make-the-cut.career.mode': 'cmode', 'make-the-cut.legends': 'legends', 'make-the-cut.retos': 'retos' };

(async function main() {
  // ---------------------------------------------------------------- 1) interruptor
  console.log('1) S4_SYNC');
  {
    ok('el fichero trae S4_SYNC = false (no se despliega nada en este lote)', /var S4_SYNC = false;/.test(ACC_SRC));
    const b = boot();
    const d = b.A._docs(), t = b.A._track();
    ok('apagado: ninguna clave S4 en DOCS', Object.keys(S4).every(k => !d[k]) && b.A._s4Sync === false && b.A.S4_SYNC === false);
    ok('apagado: las 5 en TRACK; look ya en DOCS (LOOK_SYNC = true desde el 15-nov-2026)', Object.keys(S4).every(k => t[k]) && !t['make-the-cut.look'] && d['make-the-cut.look'] === 'look' && b.A._lookSync === true);
    ok('nunca en DOCS ni TRACK: .bak, .prev, devid, retostab', ['make-the-cut.squad.bak', 'make-the-cut.career.prev', 'make-the-cut.career6.prev', 'make-the-cut.devid', 'make-the-cut.retostab', 'make-the-cut.profile.bak', 'make-the-cut.retos.bak'].every(k => !d[k] && !t[k]));
    b.LS.setItem('make-the-cut.profile', '{"v":1}'); b.LS.setItem('make-the-cut.career6', '{"x":1}');
    const meta = JSON.parse(b.LS.getItem('make-the-cut.account.meta'));
    ok('escribir una clave S4 apunta la hora (make-the-cut.account.meta) sin subirla', meta['make-the-cut.profile'] > 0 && meta['make-the-cut.career6'] > 0);
    await b.A._push();
    ok('…y no genera PATCH', !b.calls.some(c => c.method === 'PATCH'));
    const on = boot({ s4: true }), d2 = on.A._docs();
    ok('encendido: las 5 en DOCS con sus nombres (profile, career6, cmode, legends, retos)', Object.keys(S4).every(k => d2[k] === S4[k]) && !Object.keys(S4).some(k => on.A._track()[k]), J(d2));
    ok('encendido: gym y look siguen (GYM_SYNC y LOOK_SYNC = true) y DOCS tiene las 11 claves', d2['make-the-cut.gym'] === 'gym' && d2['make-the-cut.look'] === 'look' && Object.keys(d2).length === 11 && on.A._gymSync === true);
  }

  // ---------------------------------------------------------------- 2) fusiones
  console.log('2) _merge');
  {
    const T = Date.now();
    // perfiles de dos dispositivos con profile.js real (en otro contexto)
    const pctx = { console, Math, Date, JSON, localStorage: { _m: {}, getItem(k) { return this._m[k] || null; }, setItem(k, v) { this._m[k] = String(v); }, removeItem(k) { delete this._m[k]; } } };
    pctx.window = pctx; vm.createContext(pctx); vm.runInContext(fs.readFileSync(path.join(ROOT, 'js/profile.js'), 'utf8'), pctx);
    const PA = pctx.VB.Profile; pctx.localStorage._m['make-the-cut.devid'] = 'dA'; PA._reload();
    PA.noteMatch({ mode: '2v2', win: true, setsWon: 2, diff: 'normal', venue: 'palau' }); PA.noteMatch({ mode: '2v2', win: false, setsWon: 0, diff: 'normal', venue: 'palau' });
    const profA = pctx.localStorage._m['make-the-cut.profile'];
    pctx.localStorage._m = { 'make-the-cut.devid': 'dB' }; PA._reload();
    PA.noteMatch({ mode: '6v6', win: true, setsWon: 3, diff: 'hard', venue: 'cupula' });
    const profB = pctx.localStorage._m['make-the-cut.profile'];
    const leg = (n, sc) => ({ name: n, num: 7, date: sc * 1000, score: sc, played: 10 });
    const legL = J([leg('A', 90), leg('B', 50)].concat(Array.from({ length: 12 }, (_, i) => leg('L' + i, 20 + i))));
    const legR = J([leg('A', 90), leg('C', 70)].concat(Array.from({ length: 12 }, (_, i) => leg('R' + i, 10 + i))));
    const gymL = J({ v: 1, d: { serve: { b: 20, m: 2, n: 3, t: 5 } }, free: { rally: 4 }, xp: { serve: 2 } });
    const gymR = J({ v: 1, d: { serve: { b: 25, m: 3, n: 1, t: 9 } }, free: { rally: 11 }, xp: { serve: 3 } });
    const b = boot({ s4: true, files: ['js/prog.js', 'js/badges.js', 'js/retos.js', 'js/profile.js'],
      ls: { 'make-the-cut.profile': profA, 'make-the-cut.legends': legL, 'make-the-cut.career.mode': 'beach', 'make-the-cut.gym': gymL, 'make-the-cut.look': J({ v: 1, own: { a: 1 } }),
        'make-the-cut.career6': J({ mode: 'hall', seed: 1, a: 'local' }), 'make-the-cut.retos': J({ v: 1, lv: { r_aces: 1 } }),
        'make-the-cut.account.meta': J({ 'make-the-cut.profile': T - 5000, 'make-the-cut.legends': T - 5000, 'make-the-cut.career.mode': T - 5000, 'make-the-cut.gym': T - 5000, 'make-the-cut.look': T - 5000, 'make-the-cut.career6': T - 5000 }) } });
    const R = { profile: { data: profB, at: T - 9000 }, legends: { data: legR, at: T - 9000 }, cmode: { data: 'hall', at: T - 1000 }, gym: { data: gymR, at: T - 9000 },
      career6: { data: J({ mode: 'hall', seed: 1, a: 'remota' }), at: T - 1000 } };
    const r = b.A._merge(R, false);
    const P = b.VB.Profile; P._reload();
    ok('profile: unión de los dos dispositivos (3 partidos, 2 victorias, 2 sedes)', P.stats().m === 3 && P.stats().w === 2 && P.stats().ven === 2, J(P.stats()));
    const lg = JSON.parse(b.LS.getItem('make-the-cut.legends'));
    ok('legends: unión sin repetir A, top 20 ordenado por score', lg.length === 20 && lg.filter(x => x.name === 'A').length === 1 && lg[0].name === 'A' && lg[1].name === 'C' && lg.every((x, i) => !i || lg[i - 1].score >= x.score));
    ok('_mergeLegends idempotente (L ∪ L = L, mismo texto)', b.A._mergeLegends(legL, legL) === legL);
    ok('cmode: LWW (remoto más nuevo gana)', b.LS.getItem('make-the-cut.career.mode') === 'hall');
    ok('gym: por máximo, como hasta ahora', J(JSON.parse(b.LS.getItem('make-the-cut.gym')).d.serve) === J({ b: 25, m: 3, n: 3, t: 9 }));
    ok('career6 (no es la primera vez): LWW, sin conflicto', JSON.parse(b.LS.getItem('make-the-cut.career6')).a === 'remota' && r.conflicts.length === 0);
    ok('.prev: la Carrera de pista local queda en make-the-cut.career6.prev', JSON.parse(b.LS.getItem('make-the-cut.career6.prev') || '{}').a === 'local');
    ok('_merge devuelve las claves cambiadas', r.changed && ['make-the-cut.profile', 'make-the-cut.legends', 'make-the-cut.career.mode', 'make-the-cut.gym', 'make-the-cut.career6'].every(k => r.keys.indexOf(k) >= 0), J(r.keys));
    // retos con VB.Retos.mergeRaw y gym/look en la primera entrada
    const id0 = b.VB.Retos.LIST[0].id, id1 = b.VB.Retos.LIST[1].id;
    b.LS._m.set('make-the-cut.retos', J({ v: 1, m: { [id0]: { l: 1, v: 3 } } }));
    const rr = b.A._merge({ retos: { data: J({ v: 1, m: { [id1]: { l: 2, v: 5 } } }), at: T } }, false);
    const rt = JSON.parse(b.LS.getItem('make-the-cut.retos'));
    ok('retos: VB.Retos.mergeRaw une los dos lados', rr.changed && rt.m[id0] && rt.m[id0].l === 1 && rt.m[id1] && rt.m[id1].l === 2, id0 + ' ' + id1);
    // look sin VB.Look: gana entero el más nuevo (regresión de mergeLook)
    const bl = boot({ look: true, ls: { 'make-the-cut.look': J({ v: 1, own: { a: { s: 'tienda', t: 1 } }, fits: [1] }), 'make-the-cut.account.meta': J({ 'make-the-cut.look': T - 5000 }) } });
    bl.A._merge({ look: { data: J({ v: 1, own: { b: { s: 'gym', t: 2 } }, fits: [2] }), at: T } }, false);
    ok('look (LOOK_SYNC encendido, sin js/look.js): gana el más reciente entero', JSON.parse(bl.LS.getItem('make-the-cut.look')).fits[0] === 2);
    // modMerge sin el módulo: LWW
    const bn = boot({ s4: true, ls: { 'make-the-cut.profile': profA, 'make-the-cut.account.meta': J({ 'make-the-cut.profile': T - 5000 }) } });
    bn.A._merge({ profile: { data: profB, at: T } }, false);
    ok('profile sin js/profile.js cargado: gana el más reciente', bn.LS.getItem('make-the-cut.profile') === profB);
  }

  // ---------------------------------------------------------------- 2b) conflictos en cola
  console.log('2b) Conflictos');
  {
    const T = Date.now();
    let hall = null;
    try {   // Carrera de pista de verdad (para careerInfo)
      const c = { console, Math, Date, JSON, Set, localStorage: { _m: {}, getItem(k) { return this._m[k] || null; }, setItem(k, v) { this._m[k] = String(v); }, removeItem(k) { delete this._m[k]; } } };
      c.window = c; c.globalThis = c; vm.createContext(c);
      ['js/sim.js', 'js/prog.js', 'js/badges.js', 'js/leagues.js', 'js/career.js', 'js/career-life.js'].forEach(f => vm.runInContext(fs.readFileSync(path.join(ROOT, f), 'utf8'), c, { filename: f }));
      c.VB.Career.hall.create({ name: 'Pista Prueba', num: 8, seed: 4242, autoClub: true });
      hall = c.localStorage._m['make-the-cut.career6'] || null;
    } catch (e) { console.log('  AVISO: no se pudo crear una Carrera de pista real (' + e.message + '): careerInfo con una sintética'); }
    const b = boot({ s4: true, ls: { 'make-the-cut.career': J({ season: 2, player: { name: 'Local playa' } }), 'make-the-cut.career6': J({ season: 1, player: { name: 'Local pista' } }) } });
    const r = b.A._merge({ career: { data: J({ season: 5, player: { name: 'Remota playa' } }), at: T }, career6: { data: hall || J({ season: 3, player: { name: 'Remota pista' }, clubs: [{ id: 0, name: 'Club Cero' }, { id: 1, name: 'Club Uno' }], myClub: 1 }), at: T } }, true);
    ok('primera vez con dos Carreras distintas: dos conflictos en cola (playa y pista)', r.conflicts.length === 2 && b.A._conflicts().length === 2 && r.conflicts[0].k === 'make-the-cut.career' && r.conflicts[1].k === 'make-the-cut.career6', J(r.conflicts.map(c => c.k)));
    ok('enter() devuelve {changed, conflicts} (y conflict = el primero)', 'changed' in r && Array.isArray(r.conflicts) && r.conflict === r.conflicts[0]);
    ok('nada se pisa mientras se decide', JSON.parse(b.LS.getItem('make-the-cut.career')).player.name === 'Local playa');
    const info = b.A._careerInfo(r.conflicts[1].remote);
    let club = '';
    try { const hc = JSON.parse(r.conflicts[1].remote); const k = hc.clubs[hc.myClub]; club = k && k.name; ok('Carrera de pista: clubs[myClub].id === myClub (el id coincide con el índice)', !k || k.id === hc.myClub, hc.myClub + ' / ' + (k && k.id)); } catch (e) { }
    ok('careerInfo sirve para la pista (nombre, temporada y club)', info.indexOf('temporada') >= 0 && (!club || info.indexOf(club) >= 0), info);
    const s1 = b.A._resolve('keepLocal');
    ok('resolver el 1º (keepLocal): pasa al siguiente', s1 === 'next' && b.A._conflicts().length === 1 && JSON.parse(b.LS.getItem('make-the-cut.career')).player.name === 'Local playa');
    const s2 = b.A._resolve('keepRemote');
    ok('resolver el 2º (keepRemote): aplica la remota y recarga al final', s2 === 'reload' && b.A._conflicts().length === 0 && b.LS.getItem('make-the-cut.career6') === r.conflicts[1].remote);
    ok('.prev de la pista local antes de pisarla', JSON.parse(b.LS.getItem('make-the-cut.career6.prev')).player.name === 'Local pista');
    await sleep(400);
    ok('recarga una vez', b.reloads() === 1);
    const t = b.A._track(), d = b.A._docs();
    ok('.prev nunca en DOCS ni TRACK', !t['make-the-cut.career6.prev'] && !d['make-the-cut.career6.prev']);
  }

  // ---------------------------------------------------------------- 4) solo en el menú
  console.log('4) Bajadas solo en el menú');
  {
    const T = Date.now();
    const remote = { squad: { data: J({ v: 3, a: [{ lvl: 9 }, { lvl: 4 }] }), at: T }, career6: { data: J({ season: 9 }), at: T } };
    const b = boot({ s4: true, state: 'playing', rl: true, remote, ls: { 'make-the-cut.squad': J({ v: 3, a: [{ lvl: 1 }, { lvl: 1 }] }), 'make-the-cut.account.meta': J({ 'make-the-cut.squad': T - 9000 }) } });
    const hooks = { prog: 0, hall: 0, beach: 0, menu: 0 };
    b.VB.Prog = { _reload() { hooks.prog++; } };
    b.VB.Career = { beach: { _reset() { hooks.beach++; } }, hall: { _reset() { hooks.hall++; } } };
    b.VB.UI = { refreshMenu() { hooks.menu++; } };
    await b.A.sync();
    ok('en partido: syncDown no pide ni aplica nada', !b.calls.some(c => c.method === 'GET') && JSON.parse(b.LS.getItem('make-the-cut.squad')).a[0].lvl === 1 && b.A._pendingDown());
    await b.A.menuReady();
    ok('menuReady() fuera del menú tampoco', !b.calls.some(c => c.method === 'GET'));
    b.VB.ctx.state = 'menu';
    await b.A.menuReady();
    ok('menuReady() en el menú: baja y aplica', b.calls.some(c => c.method === 'GET') && JSON.parse(b.LS.getItem('make-the-cut.squad')).a[0].lvl === 9 && b.LS.getItem('make-the-cut.career6') === J({ season: 9 }) && !b.A._pendingDown());
    await sleep(400);
    ok('tras la primera recarga: ganchos (Prog._reload, hall._reset, refreshMenu) y sin recargar', hooks.prog === 1 && hooks.hall === 1 && hooks.beach === 0 && hooks.menu === 1 && b.reloads() === 0, J(hooks));
    const n = b.calls.length; await b.A.menuReady();
    ok('menuReady() sin nada pendiente no hace nada', b.calls.length === n);
    // primera vez en la pestaña: recarga
    const b2 = boot({ remote: { squad: remote.squad }, ls: { 'make-the-cut.squad': J({ v: 3, a: [] }), 'make-the-cut.account.meta': J({ 'make-the-cut.squad': T - 9000 }) } });
    await b2.A.sync(); await sleep(400);
    ok('primera bajada con cambios en la pestaña: recarga', b2.reloads() === 1);
    // ajustes: recargan también después
    const b3 = boot({ rl: true, remote: { settings: { data: '{"q":2}', at: T } }, ls: { 'make-the-cut.settings': '{"q":1}', 'make-the-cut.account.meta': J({ 'make-the-cut.settings': T - 9000 }) } });
    await b3.A.sync(); await sleep(400);
    ok('si cambian los ajustes, se recarga aunque ya se recargara una vez', b3.reloads() === 1);
  }

  // ---------------------------------------------------------------- 5) tope de tamaño
  console.log('5) Tope de tamaño');
  {
    const b = boot();
    b.LS.setItem('make-the-cut.career', 'x'.repeat(395000));
    await b.A._push();
    ok('395 000 caracteres: sin PATCH, estado de error con su texto', !b.calls.some(c => c.method === 'PATCH') && b.A.status() === 'error' && b.A._lastErr() === 'Tu Carrera es demasiado grande para la nube', b.A._lastErr());
    await b.A._push();
    ok('no se reintenta en bucle (sigue sin PATCH)', !b.calls.some(c => c.method === 'PATCH'));
    b.LS.setItem('make-the-cut.squad', J({ v: 3, a: [] }));
    await b.A._push();
    ok('las demás claves suben igual', b.calls.filter(c => c.method === 'PATCH').map(c => c.url.split('/').pop()).join() === 'squad');
    await sleep(5);
    b.LS.setItem('make-the-cut.career', '{"v":3,"chica":1}');
    await b.A._push();
    ok('tras su siguiente cambio (ya pequeño), sube', b.calls.some(c => c.method === 'PATCH' && /saves\/career$/.test(c.url)));
  }

  // ---------------------------------------------------------------- 6) PATCH, readAll y borrar
  console.log('6) PATCH, readAll y borrar la cuenta');
  {
    const b = boot({ remote: { zzz: { data: '1', at: 1 }, career6: { data: '{}', at: 1 } } });
    b.LS.setItem('make-the-cut.record', '{"played":3}');
    await b.A._push();
    const p = b.calls.find(c => c.method === 'PATCH');
    ok('PATCH con {data, updatedAt, v}', p && J(Object.keys(p.body.fields).sort()) === J(['data', 'updatedAt', 'v']) && p.body.fields.data.stringValue === '{"played":3}' && p.body.fields.v.integerValue === '1');
    await b.A.sync();
    ok('readAll pide pageSize=50', b.calls.some(c => c.method === 'GET' && /pageSize=50$/.test(c.url)));
    await b.A._delete();
    const del = b.calls.filter(c => c.method === 'DELETE').map(c => c.url.split('/').pop()).sort();
    ok('deleteAccount borra todo lo que lista readAll (también lo que este cliente no conoce)', ['career6', 'record', 'zzz', 'squad', 'career', 'settings', 'gym'].every(n => del.indexOf(n) >= 0) && b.remote.size === 0, del.join());
    ok('y cierra la sesión', b.A.user() === null);
  }

  // ---------------------------------------------------------------- 7) reglas al día
  console.log('7) Reglas');
  {
    const rules = fs.readFileSync(path.join(ROOT, 'firebase/firestore.rules'), 'utf8');
    const m = rules.match(/key in \[([^\]]*)\]/);
    const keys = m ? m[1].split(',').map(s => s.trim().replace(/^'|'$/g, '')) : [];
    const all = boot({ s4: true, look: true }).A._docs(), names = Object.values(all);
    ok('reglas: 11 claves', keys.length === 11, keys.join(' '));
    ok('reglas ⊇ DOCS con GYM_SYNC, LOOK_SYNC y S4_SYNC encendidos', names.every(n => keys.indexOf(n) >= 0) && names.length === 11, names.filter(n => keys.indexOf(n) < 0).join() || names.join(' '));
    ok('tope de subida por debajo del de las reglas', /size\(\) <= 400000/.test(rules) && boot().A._MAX_RAW === 390000);
  }

  console.log(fails ? '\n' + fails + ' FALLOS (' + oks + ' ok)' : '\nTODO OK (' + oks + ' comprobaciones)');
  process.exit(fails ? 1 : 0);
})().catch(e => { console.error('ERROR', e); process.exit(1); });
