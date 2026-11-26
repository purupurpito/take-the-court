#!/usr/bin/env node
/* TAKE THE COURT — tools/storyuitest.js (owner: carrera)
 * Prueba de la interfaz de enlace de «Carrera con vida» (js/career-story-ui.js + las ediciones de js/career-ui.js; notes/carrera-vida.md
 * §2 S5, §3 P0 fase B y §4.3) en node puro (vm, document falso):
 *   1. career-ui.js se carga sin career-story y con él; VB.CareerStoryUI con toda la API.
 *   2. Avisos (S5): chips(c) PURO (la carrera no cambia, ni se crea c.story), de datos que ya existen (decisión, patrocinio, ventana,
 *      puntos, último año de contrato), de los sistemas, ordenados por p; chipsHTML enseña 4 como mucho y «Todo al día» sin nada.
 *   3. Delegación: los pintores sys.ui.* de los sistemas (week, wall, people, state, pass, stats, opts, inbox), has(), tagFor; un
 *      pintor que falla no tira la pantalla; sin sistema o sin núcleo, '' / [] / 0.
 *   4. Bandeja: el feed mezclado con c.inbox, botones de respuesta con su efecto, contestar por act (fx una vez y «Respondiste»),
 *      seen() solo marca lo que no pregunta, pending(); textos sin «{», «undefined», «NaN», «.er» ni «·» en playa y pista.
 *   5. Opciones «Cuánta vida» (st-freq-n) y plegables (plan y último partido) con localStorage (y sin él).
 *   6. Hub pintado de verdad (document falso con innerHTML): Partido con y sin career-story en playa y pista (chips, .cr-two,
 *      «Jugar partido» sigue, plan plegado/desplegado, sello del ticket), Mensajes, Club › Gente, Palmarés › Opciones y el
 *      calendario; sin career-story el HTML de Partido no lleva nada de story.
 * Uso: node tools/storyuitest.js   Sale con 1 si algo falla; acaba en «TODO OK».
 */
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm');
const H = require('./storyhelp.js');
let fails = 0, passes = 0;
function ok(c, msg) { if (!c) { fails++; console.log('  FALLO: ' + msg); } else { passes++; console.log('  ok: ' + msg); } }
function section(t) { console.log('\n== ' + t); }
const BAD = /\{|\}|undefined|NaN|\.er\b|·/;
/** Ejecuta fn con console.error callado (sistemas de prueba que fallan a propósito). */
function quiet(fn) { const e0 = console.error; console.error = () => { }; try { return fn(); } finally { console.error = e0; } }
const txt = (h) => String(h).replace(/<[^>]*>/g, ' ');   // (el texto que se ve, sin etiquetas ni atributos)

/** Sistema de prueba con pintores, avisos y sello (cumple las reglas: solo story). */
function fake(S, o) {
  o = o || {};
  return {
    id: 'tui', acts: ['tw'],
    tpl: {
      uq: { k: 'agent', t: ['Hola, {yo}', 'Qué tal, {yo}'], x: '{agent} con {club}. ¿Subimos el caché?', o: [{ t: 'Que esperen', e: { ag: 5 } }, { t: 'Sube el caché', e: { coach: 1, fam: -3 } }], c: '{agent}: «Vale, lo hablamos otro día»' },
      un: { k: 'fam', t: 'Tu gente', th: 'Tu gente en el pabellón', x: 'Te vimos, {yo}.' },
      uc: { k: 'coach', t: 'Charla con {coach}', x: 'Hablamos el lunes.', o: [{ t: 'Vale', e: { mood: 2 } }, { t: 'Mejor no', e: { mood: -1 } }] }
    },
    chips(c) { return o.chips ? o.chips(c) : []; },
    tagFor(c, f) { return o.tag ? o.tag(c, f) : ''; },
    ui: o.ui || {}
  };
}

/** Núcleo SOLO (sin los sistemas de verdad, que pueden estar a medias) más el sistema de prueba; story false: sin career-story. */
function bootUI(story, sysOpts) {
  const B = story ? H.boot({ files: H.BASE.concat(['js/career-story.js']) }) : H.boot({ story: false });
  if (story && B.S && sysOpts) B.S.use(fake(B.S, sysOpts));
  return B;
}

// ------------------------------------------------------------------ document falso con innerHTML (para pintar el hub de verdad)
function richDoc() {
  const mk = (tag) => {
    const kids = {};
    const el = {
      tagName: String(tag || 'div').toUpperCase(), style: {}, hidden: true, innerHTML: '', textContent: '', id: '', attrs: {},
      setAttribute(k, v) { this.attrs[k] = String(v); }, getAttribute(k) { return k in this.attrs ? this.attrs[k] : null; }, removeAttribute(k) { delete this.attrs[k]; },
      hasAttribute(k) { return k in this.attrs; },
      appendChild(x) { return x; }, removeChild() { }, addEventListener() { }, contains() { return true; }, closest() { return null; },
      querySelector(sel) { if (!kids[sel]) kids[sel] = mk('div'); return kids[sel]; }, querySelectorAll() { return []; },
      classList: { _s: new Set(), add(...a) { a.forEach(x => this._s.add(x)); }, remove(...a) { a.forEach(x => this._s.delete(x)); }, toggle(x, v) { if (v === undefined ? !this._s.has(x) : v) this._s.add(x); else this._s.delete(x); }, contains(x) { return this._s.has(x); } },
      scrollIntoView() { }, focus() { }, blur() { }, scrollWidth: 0, clientWidth: 0, offsetParent: null
    };
    return el;
  };
  const byId = {};
  const doc = { readyState: 'complete', hidden: false, activeElement: null, head: mk('head'), body: mk('body'), addEventListener() { }, removeEventListener() { },
    createElement: (t) => { const e = mk(t); return e; }, getElementById: (id) => byId[id] || null, querySelector: () => null, querySelectorAll: () => [] };
  return { doc, mk };
}
// ------------------------------------------------------------------ 1. carga
section('1. career-ui se carga sin career-story y con él; API de VB.CareerStoryUI');
{
  const B0 = H.boot({ story: false });
  const u0 = H.uiCtx(B0.VB, ['js/career-world-ui.js', 'js/career-ui.js']);
  ok(!u0.err && B0.VB.CareerUI && !B0.VB.CareerStoryUI, 'sin career-story: career-ui se carga' + (u0.err ? ' — ' + u0.err : ''));
  const B1 = H.boot({ story: true });
  const u1 = H.uiCtx(B1.VB, ['js/career-world-ui.js', H.STORY_UI, 'js/career-ui.js']);
  const SU = B1.VB.CareerStoryUI;
  ok(!u1.err && B1.VB.CareerUI && SU, 'con career-story: career-ui y career-story-ui se cargan' + (u1.err ? ' — ' + u1.err : ''));
  const API = ['chips', 'chipsHTML', 'weekCard', 'planChip', 'planOpen', 'lastOpen', 'inbox', 'seen', 'wall', 'people', 'state', 'pass', 'stats', 'has', 'optsHTML', 'tagFor', 'pending', 'act', 'css'];
  ok(API.every(k => typeof SU[k] === 'function'), 'API completa (' + API.length + ' funciones)');
  // career-story-ui sin núcleo: todo vacío y sin errores
  const B2 = H.boot({ story: false });
  const u2 = H.uiCtx(B2.VB, [H.STORY_UI]);
  const SN = B2.VB.CareerStoryUI, K2 = B2.C;
  const c2 = K2.create({ mode: 'beach', name: 'Sin Nucleo', num: 3, role: 'atk', seed: 5, now: 1 }); K2.acceptOffer(c2.offers.findIndex(x => !x.trial), 2);
  const cc = K2.load();
  ok(!u2.err && SN.inbox(cc, {}, () => '', {}) === '' && SN.weekCard(cc, {}) === '' && SN.optsHTML(cc, {}) === '' && SN.pending(cc) === 0 && SN.tagFor(cc, {}) === '' && SN.act('st-freq-0') === null && !SN.has('wall') && Array.isArray(SN.chips(cc)),
    'career-story-ui sin el núcleo: vacío, sin errores');
}

// ------------------------------------------------------------------ 2. avisos
section('2. Avisos (S5): chips puros, de datos existentes y de los sistemas');
{
  let sysChips = [];
  const B = bootUI(true, { chips: () => sysChips });
  H.uiCtx(B.VB, [H.STORY_UI]);
  const SU = B.VB.CareerStoryUI, K = B.C;
  let c = K.create({ mode: 'beach', name: 'Chips Prueba', num: 4, role: 'atk', seed: 41, now: 1 });
  ok(Array.isArray(SU.chips(c)) && SU.chips(null).length === 0 && SU.chips({}).length === 0, 'chips con la carrera recién creada, sin carrera y con un objeto vacío');
  K.acceptOffer(c.offers.findIndex(x => !x.trial), 2);
  for (let i = 0; i < 2; i++) K.simulateNext();
  c = K.load();
  // puro: ni cambia la carrera ni crea c.story
  const bare = JSON.parse(JSON.stringify(c)); delete bare.story;
  const j0 = JSON.stringify(c), jb = JSON.stringify(bare);
  SU.chips(c); SU.chipsHTML(c, {}); SU.chips(bare); SU.pending(c); SU.pending(bare); SU.tagFor(c, K.next(c));
  ok(JSON.stringify(c) === j0 && JSON.stringify(bare) === jb && !('story' in bare), 'chips/chipsHTML/pending/tagFor puros: la carrera igual y sin crear c.story');
  // datos existentes
  const x = JSON.parse(j0);
  x.player.pts = 3; x.life = x.life || {}; x.life.spOffers = [{ name: 'Marca' }]; x.window = 'mid'; x.offers = [{ club: 1 }, { club: 2 }];
  x.contract = Object.assign({}, x.contract, { left: 1 }); x.phase = 'league'; x.week = 10;
  const L = B.VB.CareerLife, evK = Object.keys(L.EVENTS).find(k => !L.EVENTS[k].only || L.EVENTS[k].only === 'beach');
  x.life.ev = { key: evK, id: 1 };
  const ch = SU.chips(x), ts = ch.map(y => y.t);
  ok(ch[0].p === 1 && /^Decisión: /.test(ch[0].t) && ch[0].act === 'st-jump' && ch[0].to === '.lf-ev', 'decisión pendiente, la primera y salta a su tarjeta (' + ch[0].t + ')');
  ok(ts.indexOf('2 clubes te quieren') >= 0 && ts.indexOf('Oferta de patrocinio') >= 0 && ts.indexOf('3 puntos') >= 0 && ts.indexOf('Último año de contrato') >= 0, 'ventana, patrocinio, puntos y contrato: ' + ts.join(' | '));
  ok(ch.every((y, i) => !i || (+ch[i - 1].p || 0) <= (+y.p || 0)), 'ordenados por p');
  x.week = 9; ok(SU.chips(x).every(y => y.t !== 'Último año de contrato'), 'el contrato avisa desde la jornada 10');
  const hx = SU.chipsHTML(x, {});
  ok((hx.match(/<button/g) || []).length === 4 && /data-act="st-jump" data-to="\.lf-ev"/.test(hx) && /data-tab="club" data-s="offers"/.test(hx) && /data-sp-row/.test(hx), 'chipsHTML: 4 botones como mucho, con data-tab/data-s o data-act');
  ok(!BAD.test(txt(hx)) && !/undefined|NaN/.test(hx), 'sin «undefined», «NaN», «{» ni «·» (' + txt(hx).replace(/\s+/g, ' ').trim().slice(0, 120) + '…)');
  // sin nada
  const y = JSON.parse(j0); y.player.pts = 0; y.life = Object.assign({}, y.life, { ev: null, spOffers: [] }); y.window = ''; y.offers = []; if (y.story) y.story.feed = [];
  ok(SU.chips(y).length === 0 && /Todo al día\./.test(SU.chipsHTML(y, {})), 'sin avisos: «Todo al día.»');
  // de los sistemas, y la bandeja genérica solo si ningún sistema avisa de ella
  sysChips = [{ p: 0, ic: '★', t: 'Candidatura a Figura del mes', x: 'Tu media 7,4', tab: 'honors', s: 'stats' }, { p: 9, t: '' }, null, { p: 5, t: 'x', ic: '?' }];
  const z = SU.chips(y);
  ok(z.length === 2 && z[0].t === 'Candidatura a Figura del mes' && z[1].t === 'x', 'chips de los sistemas (los vacíos o rotos fuera), ordenados');
  y.story.feed = [{ id: 1, k: 'agent', b: 'uq', vars: {}, o: 1, ans: -1, exp: y.story.mN + 2, mN: y.story.mN, s: 1, w: 2, ph: 'league', r: 0, sys: 'tui' }];
  ok(SU.chips(y).some(q => q.tab === 'inbox' && q.t === 'Un mensaje' && q.x === 'Por responder'), 'feed con pregunta y ningún sistema que avise: «Un mensaje / Por responder»');
  sysChips = [{ p: 2, ic: '✉', t: 'Cris Montoya te ha escrito', x: 'Responder', tab: 'inbox', s: 'box' }];
  ok(SU.chips(y).filter(q => q.tab === 'inbox').length === 1, 'si un sistema avisa de la bandeja, no se repite');
  sysChips = () => { throw new Error('roto'); };
  const B3 = bootUI(true, { chips: () => { throw new Error('roto'); } }); H.uiCtx(B3.VB, [H.STORY_UI]);
  ok(quiet(() => Array.isArray(B3.VB.CareerStoryUI.chips(y))), 'un sistema cuyo chips() falla no tira los avisos');
}

// ------------------------------------------------------------------ 3. delegación
section('3. Pintores de los sistemas (sys.ui.*), has() y tagFor');
{
  const seenH = {};
  const ui = {};
  ['week', 'wall', 'people', 'state', 'pass', 'stats', 'opts'].forEach(k => { ui[k] = function (c, Hx) { seenH[k] = Hx; return '<div class="card tui-' + k + '">' + k + '</div>'; }; });
  const B = bootUI(true, { ui, tag: (c, f) => (f && f.week === 3 ? { tag: 'Derbi', line: 'x' } : f && f.week === 4 ? 'Revancha' : '') });
  H.uiCtx(B.VB, [H.STORY_UI]);
  const SU = B.VB.CareerStoryUI, K = B.C;
  let c = K.create({ mode: 'beach', name: 'Pinta Prueba', num: 4, role: 'atk', seed: 42, now: 1 }); K.acceptOffer(c.offers.findIndex(x => !x.trial), 2); c = K.load();
  const HL = { esc: s => String(s), sp: a => a.join(', '), kitSw: () => '', crest: () => '' };
  ok(SU.weekCard(c, HL) === '<div class="card tui-week">week</div>' && SU.wall(c, HL).indexOf('tui-wall') > 0 && SU.people(c, HL).indexOf('tui-people') > 0 && SU.state(c, HL).indexOf('tui-state') > 0 &&
    SU.pass(c, HL).indexOf('tui-pass') > 0 && SU.stats(c, HL).indexOf('tui-stats') > 0 && SU.optsHTML(c, HL).indexOf('tui-opts') > 0, 'week, wall, people, state, pass, stats y opts delegan en sys.ui');
  ok(seenH.wall && typeof seenH.wall.arrow === 'function' && typeof seenH.wall.feedHTML === 'function' && typeof seenH.wall.btns === 'function' && typeof seenH.wall.kitSw === 'function', 'los pintores reciben el HLP de career-ui con arrow, feedHTML y btns');
  ok(['wall', 'people', 'pass', 'stats', 'state', 'week'].every(k => SU.has(k)) && !SU.has('nada') && !SU.has('inbox'), 'has(): lo que pinta algún sistema');
  ok(SU.tagFor(c, { week: 3 }) === 'Derbi' && SU.tagFor(c, { week: 4 }) === 'Revancha' && SU.tagFor(c, { week: 5 }) === '' && SU.tagFor(c, null) === '', 'tagFor: el del sistema (texto u objeto {tag}), \'\' sin sello');
  // un pintor que falla
  B.S.use(fake(B.S, { ui: { wall() { throw new Error('roto'); } } }));
  let e = ''; let w = '';
  try { w = quiet(() => SU.wall(c, HL)); } catch (x) { e = x.message; }
  ok(!e && w === '', 'un pintor que falla devuelve \'\' (sin tirar la pantalla)');
  // sin sistemas con pintores
  const B0 = bootUI(true, null); H.uiCtx(B0.VB, [H.STORY_UI]);
  const S0 = B0.VB.CareerStoryUI;
  ok(S0.weekCard(c, HL) === '' && S0.wall(c, HL) === '' && S0.people(c, HL) === '' && S0.pass(c, HL) === '' && S0.stats(c, HL) === '' && S0.state(c, HL) === '' && !S0.has('wall') && S0.tagFor(c, { week: 3 }) === '',
    'con los sistemas mínimos: nada que pintar y has() falso');
}

// ------------------------------------------------------------------ 4. bandeja
section('4. Bandeja: feed mezclado con los mensajes, respuestas, seen y pending');
for (const mode of ['beach', 'hall']) {
  const B = bootUI(true, {}); H.uiCtx(B.VB, [H.STORY_UI]);
  const SU = B.VB.CareerStoryUI, K = B.C, S = B.S;
  let c = mode === 'hall' ? K.create({ mode, name: 'Buzon Pista', num: 4, pos: 'OH', seed: 43, now: 1 }) : K.create({ mode, name: 'Buzon Playa', num: 4, role: 'atk', seed: 43, now: 1 });
  K.acceptOffer(c.offers.findIndex(x => !x.trial), 2);
  K.simulateNext(); K.simulateNext(); c = K.load();
  const msgHTML = (m, fr) => '<div class="msg' + (m.r && !(fr && fr[m.id]) ? '' : ' unread') + '"><b>' + m.t + '</b></div>';
  ok(SU.inbox(c, {}, msgHTML, {}) === '', mode + ': sin feed, \'\' (career-ui pinta su bandeja de siempre)');
  c.story.freq = 2; if (c.life) c.life.ev = null;
  const q1 = S.post(c, { b: 'uq', o: 1 }), n1 = S.post(c, { b: 'un' }), q2 = S.post(c, { b: 'uc', o: 1 });
  K.save(c);
  ok(q1 && n1 && q2 && SU.pending(c) === 3, mode + ': pending cuenta lo no leído del feed (' + SU.pending(c) + ')');
  const fr = {}; const nSeen = SU.seen(c, fr);
  ok(nSeen === 1 && fr['st' + n1.id] && fr['st' + q1.id] && n1.r === 1 && q1.r === 0 && q2.r === 0 && SU.pending(c) === 2, mode + ': seen marca leído solo lo que no pregunta (resaltado en este pintado)');
  K._reset(); c = K.load();
  ok(c.story.feed.find(x => x.id === n1.id).r === 1, mode + ': seen guarda');
  let h = SU.inbox(c, {}, msgHTML, fr);
  const nIn = (c.inbox || []).length;
  ok((h.match(/class="msg/g) || []).length === nIn + 3, mode + ': los ' + nIn + ' mensajes y las 3 entradas del feed juntos');
  ok(h.indexOf('data-act="st-ans-' + q1.id + '-0"') > 0 && h.indexOf('data-act="st-ans-' + q1.id + '-1"') > 0 && /st-up">Agente ▲/.test(h) && h.indexOf('data-act="st-ans-' + n1.id) < 0, mode + ': botones de respuesta con su efecto (▲/▼) solo en lo que pregunta');
  ok(h.indexOf('id="st-m-' + q2.id + '"') < h.indexOf('id="st-m-' + q1.id + '"'), mode + ': lo más nuevo arriba');
  ok(!BAD.test(txt(h)), mode + ': textos sin «{», «undefined», «NaN», «.er» ni «·»');
  if (mode === 'hall') ok(h.indexOf('Tu gente en el pabellón') > 0, 'pista: título de pabellón (th)');
  // contestar por act
  const coach0 = c.coach, ag0 = c.story.rel.ag;
  const r = SU.act('st-ans-' + q1.id + '-0', null);
  c = K.load();
  ok(r && r.render && r.focus === '[data-act^="st-ans-"]' && c.story.rel.ag === ag0 + 5 && c.coach === coach0, mode + ': contestar por act aplica el efecto una vez (Agente +5) y pide repintar');
  ok(SU.act('st-ans-' + q1.id + '-1', null) === null && c.story.rel.ag === ag0 + 5, mode + ': no se contesta dos veces');
  h = SU.inbox(c, {}, msgHTML, {});
  ok(/Respondiste: «Que esperen»\. Agente \+5\./.test(txt(h)) && h.indexOf('data-act="st-ans-' + q1.id) < 0, mode + ': «Respondiste» con el efecto y sin botones');
  ok(SU.pending(c) === 1, mode + ': pending baja al contestar (' + SU.pending(c) + ')');
  // caduca: la línea de cierre
  for (let i = 0; i < 3; i++) K.simulateNext();
  c = K.load(); h = SU.inbox(c, {}, msgHTML, {});
  ok(c.story.feed.find(x => x.id === q2.id).ans === -2 && h.indexOf('st-closed') > 0 && !BAD.test(txt(h)), mode + ': lo caducado sale cerrado, sin botones');
  // un sistema con su bandeja manda
  B.S.use(fake(B.S, { ui: { inbox: (cc, Hx, mh, f) => '<div class="card mine">' + (typeof mh === 'function') + '</div>' } }));
  ok(SU.inbox(c, {}, msgHTML, {}) === '<div class="card mine">true</div>', mode + ': sys.ui.inbox (P1) manda y recibe msgHTML');
}

// ------------------------------------------------------------------ 5. opciones y plegables
section('5. «Cuánta vida» y plegables');
{
  const B = bootUI(true, {}), U5 = H.uiCtx(B.VB, [H.STORY_UI]); U5.cx.localStorage = B.cx.localStorage;   // (la interfaz lee window.localStorage)
  const SU = B.VB.CareerStoryUI, K = B.C;
  let c = K.create({ mode: 'beach', name: 'Opciones Prueba', num: 4, role: 'atk', seed: 44, now: 1 }); K.acceptOffer(c.offers.findIndex(x => !x.trial), 2);
  K.simulateNext(); c = K.load();
  let h = SU.optsHTML(c, {});
  ok(/Cuánta vida/.test(h) && /data-act="st-freq-0" aria-pressed="false">Poca/.test(h) && /data-act="st-freq-1" aria-pressed="true">Normal/.test(h) && /data-act="st-freq-2" aria-pressed="false">Mucha/.test(h) && !BAD.test(txt(h)), 'Opciones: Poca / Normal / Mucha con Normal elegida');
  ok(SU.act('st-freq-2', null) && (K._reset(), K.load().story.freq === 2) && /st-freq-2" aria-pressed="true"/.test(SU.optsHTML(K.load(), {})), 'st-freq-2: Mucha, guardado');
  c = K.load();
  // plan: por defecto, desplegado con sesiones y sin automático; lo elegido manda en la jornada
  const fb = (v) => ({ getAttribute: (k) => (k === 'data-v' ? String(v) : null) });
  ok(SU.planOpen(c, { left: 2, max: 3, auto: false }) === true && SU.planOpen(c, { left: 0, max: 3 }) === false && SU.planOpen(c, { left: 2, max: 3, auto: true }) === false, 'plan: desplegado solo con sesiones pendientes y sin entreno automático');
  const ra = SU.act('st-plan', fb(1));
  ok(ra && ra.render && ra.focus === '[data-act="st-plan"]' && SU.planOpen(c, { left: 2, max: 3 }) === false, 'st-plan pliega (esta jornada) aunque queden sesiones');
  ok(SU.planOpen(c, { left: 2, max: 3 }, true) === true && SU.planOpen(c, { left: 2, max: 3 }) === true, 'al volver de un ejercicio («force»), desplegado y así se queda');
  SU.act('st-plan', fb(1)); K.simulateNext(); c = K.load();
  ok(SU.planOpen(c, { left: 3, max: 3 }) === true, 'jornada nueva: vuelve la regla por defecto (el plan plegado no esconde sesiones de otra jornada)');
  const pc = SU.planChip(c, { used: 1, left: 2, max: 3, fat: 40, auto: false }, false);
  ok(/data-act="st-plan" data-v="0" aria-expanded="false"/.test(pc) && /Plan 1 de 3/.test(pc) && /Fatiga 40/.test(pc) && !BAD.test(txt(pc)), 'chip del plan: «' + txt(pc).replace(/\s+/g, ' ').trim() + '»');
  // último partido
  ok(SU.lastOpen(c, false) === false && SU.lastOpen(c, true) === true && SU.lastOpen(c, false) === true, 'último partido: plegado salvo recién jugado (y así se queda en la jornada)');
  SU.act('st-fold-last', fb(1)); ok(SU.lastOpen(c, true) === false, 'st-fold-last lo pliega');
  ok(SU.act('st-jump', { getAttribute: k => (k === 'data-to' ? '.lf-ev' : null) }).focus === '.lf-ev button:not([disabled])', 'st-jump: foco en la tarjeta');
  // sin localStorage (o que tira): no rompe
  U5.cx.localStorage = { getItem() { throw new Error('no'); }, setItem() { throw new Error('no'); } };
  let e = ''; try { SU.planOpen(c, { left: 1, max: 3 }); SU.act('st-plan', fb(1)); SU.lastOpen(c, true); } catch (x) { e = x.message; }
  delete U5.cx.localStorage;
  try { SU.planOpen(c, { left: 1, max: 3 }); SU.lastOpen(c, true); } catch (x) { e = e || x.message; }
  ok(!e, 'sin localStorage (o que tira): sin errores');
}

// ------------------------------------------------------------------ 6. hub pintado
section('6. Hub pintado (document falso): Partido, Mensajes, Gente, Opciones y calendario');
for (const mode of ['beach', 'hall']) {
  for (const story of [false, true]) {
    const B = story ? bootUI(true, { ui: { people: () => '<div class="card tui-people">Gente</div>', week: () => '<div class="card tui-week">Tu semana</div>' }, tag: (c, f) => 'Derbi' }) : H.boot({ story: false });
    const K = B.C;
    let c = mode === 'hall' ? K.create({ mode, name: 'Hub Pista', num: 4, pos: 'OH', seed: 45, now: 1 }) : K.create({ mode, name: 'Hub Playa', num: 4, role: 'atk', seed: 45, now: 1 });
    K.acceptOffer(c.offers.findIndex(x => !x.trial), 2);
    for (let i = 0; i < 2; i++) K.simulateNext();
    c = K.load(); let g = 0; while (!K.next(c) && c.phase !== 'off' && g++ < 6) { K.simulateNext(); c = K.load(); }
    // document rico: el body del hub es el querySelector('.cr-body') del root; lo capturamos parcheando createElement
    const { doc, mk } = richDoc();
    let rootEl = null;
    doc.createElement = (t) => { const e = mk(t); if (!rootEl && t === 'div') rootEl = e; return e; };
    const errs = [];
    const con = Object.assign({}, console, { error: (...a) => { errs.push(a.map(String).join(' ')); } });
    const ux = { console: con, Math, Date, JSON, VB: B.VB, document: doc, setTimeout: () => 0, clearTimeout() { }, requestAnimationFrame: () => 0, performance: { now: () => 0 },
      addEventListener() { }, removeEventListener() { }, localStorage: B.cx.localStorage };
    ux.globalThis = ux; ux.window = ux; vm.createContext(ux);
    let err = '';
    for (const f of ['js/career-world-ui.js'].concat(story ? [H.STORY_UI] : []).concat(['js/career-ui.js'])) { try { vm.runInContext(fs.readFileSync(path.join(H.ROOT, f), 'utf8'), ux, { filename: f }); } catch (e) { err += f + ': ' + e.message + ' '; } }
    const CU = B.VB.CareerUI, tag = mode + (story ? ' con story' : ' sin story') + ': ';
    try { CU.open('hub', { fresh: true }); } catch (e) { err += 'open: ' + e.message; }
    const body = () => (rootEl ? rootEl.querySelector('.cr-body').innerHTML : '');
    const tabs = () => (rootEl ? rootEl.querySelector('.cr-tabs').innerHTML : '');
    const subs = () => (rootEl ? rootEl.querySelector('.cr-sub').innerHTML : '');
    let h = body();
    ok(!err && !errs.length && h && !/Guardado dañado/.test(h), tag + 'Partido se pinta sin errores' + (err || errs.length ? ' — ' + err + errs.join(' | ').slice(0, 300) : ''));
    ok(/data-act="play"|data-act="bench"/.test(h), tag + '«Jugar partido» (o «Ver la jornada») sigue ahí (el foco al volver va a él)');
    if (!story) {
      ok(!/class="st-|data-act="st-|cr-two|Todo al día/.test(h), tag + 'nada de career-story en Partido');
      ok(/cr-train|id="crTrain"/.test(h) || !K.trainInfo(c) || K.trainInfo(c).why === 'none', tag + 'el plan del entrenador como siempre (sin plegar)');
    } else {
      ok(/class="cr-two"/.test(h) && /class="st-side"/.test(h) && /class="cr-nd-w"/.test(h) && (/class="st-chips"/.test(h) || /Todo al día/.test(h)), tag + '.cr-two con los avisos y la hoja de detalles');
      ok(/tui-week/.test(h), tag + '«Tu semana» (sys.ui.week) en Partido');
      ok(/st-tagged/.test(h) && /st-tk-tag" aria-hidden="true">Derbi</.test(h), tag + 'sello «Derbi» en la esquina del ticket');
      ok(/data-act="st-plan"/.test(h), tag + 'chip del plan');
      const inf = K.trainInfo(c);
      ok(/id="crTrain"/.test(h) === (inf.left > 0 && !inf.auto), tag + 'plan ' + (/id="crTrain"/.test(h) ? 'desplegado' : 'plegado') + ' (quedan ' + inf.left + ', automático ' + !!inf.auto + ')');
      ok(/data-act="st-fold-last" data-v="1"/.test(h) && /Último partido: <b>/.test(h), tag + 'último partido plegable, abierto recién jugado');
      ok(!/undefined|NaN/.test(h), tag + 'HTML sin «undefined» ni «NaN»');
    }
    // Mensajes
    CU._tab('inbox'); h = body();
    ok(h && /Mensajes/.test(h) && !errs.length, tag + 'Mensajes se pinta' + (errs.length ? ' — ' + errs.join(' | ').slice(0, 200) : ''));
    ok(!/data-sub="wall"/.test(subs()) || story, tag + 'sin Redes en la barra' + (story ? ' (con story y sin pintor de muro tampoco)' : ''));
    if (story) ok(!/data-sub="wall"/.test(subs()), tag + 'Redes oculta mientras ningún sistema pinte el muro');
    // Club › Gente
    CU._tab('club', 'people'); h = body();
    if (story) ok(/data-sub="people"/.test(subs()) && /tui-people/.test(h), tag + 'Club › Gente con el pintor del sistema');
    else ok(!/data-sub="people"/.test(subs()) && !/tui-people/.test(h), tag + 'sin Club › Gente');
    // Palmarés › Estadísticas (sin pintor: oculta) y Opciones
    CU._tab('honors', 'opts'); h = body();
    ok(/Cuánta vida/.test(h) === story && !/data-sub="stats"/.test(subs()), tag + (story ? '«Cuánta vida» en Opciones' : 'Opciones sin «Cuánta vida»') + '; Estadísticas oculta sin pintor');
    // Jugador › Entreno / Estado
    CU._tab('player', 'train');
    ok(/>Entreno</.test(subs()) && !/>Estado</.test(subs()), tag + 'la sub-pestaña sigue llamándose «Entreno» mientras nadie pinte el Estado');
    // calendario
    CU._tab('league', 'cal'); h = body();
    ok(/class="cal"/.test(h) && (/st-cal-tag">Derbi/.test(h) === story), tag + (story ? 'sellos en el calendario (' + (h.match(/st-cal-tag/g) || []).length + ')' : 'calendario sin sellos'));
    if (story) ok((h.match(/st-cal-tag/g) || []).length <= 3, tag + 'sello solo en los 3 próximos');
    // contador de Mensajes con el feed
    if (story) {
      const cc = K.load(); cc.story.freq = 2; if (cc.life) cc.life.ev = null; B.S.post(cc, { b: 'uq', o: 1 }); K.save(cc);
      CU._tab('match'); const tb = tabs();
      const un = (K.unread ? K.unread(cc) : 0) + 1;
      ok(tb.indexOf('Mensajes (' + un + ')') >= 0, tag + 'el contador de Mensajes suma el feed sin leer (' + un + ')');
      CU._tab('inbox'); h = body();
      ok(h.indexOf('data-act="st-ans-') > 0, tag + 'la Bandeja enseña la pregunta con sus botones');
    }
    // _state: abierta en el hub
    ok(CU._state().open && CU._state().view === 'hub', tag + 'hub abierto');
  }
}

// ------------------------------------------------------------------ 7. con los sistemas de verdad
section('7. Con los sistemas de verdad (los que haya): todo se pinta sin errores');
for (const mode of ['beach', 'hall']) {
  const B = H.boot({ story: true }), K = B.C, S = B.S;
  H.autopilot(B, { mode, seasons: 1, seed: 777, feed: true, week: true });
  let cc = K.load(); let g = 0;
  while (!K.next(cc) && g++ < 8) { if (cc.phase === 'off') K.stay(1); else K.simulateNext(); cc = K.load(); }
  for (let i = 0; i < 3 && K.next(cc); i++) { K.simulateNext(); cc = K.load(); }
  const { doc, mk } = richDoc(); let rootEl = null;
  doc.createElement = (t) => { const e = mk(t); if (!rootEl && t === 'div') rootEl = e; return e; };
  const errs = [], con = Object.assign({}, console, { error: (...a) => { errs.push(a.map(String).join(' ')); } });
  const ux = { console: con, Math, Date, JSON, VB: B.VB, document: doc, setTimeout: () => 0, clearTimeout() { }, requestAnimationFrame: () => 0, performance: { now: () => 0 }, addEventListener() { }, removeEventListener() { }, localStorage: B.cx.localStorage };
  ux.globalThis = ux; ux.window = ux; vm.createContext(ux);
  let err = '';
  for (const f of ['js/career-life-ui.js', 'js/career-world-ui.js', H.STORY_UI, 'js/career-ui.js']) { try { vm.runInContext(fs.readFileSync(path.join(H.ROOT, f), 'utf8'), ux, { filename: f }); } catch (e) { err += f + ': ' + e.message + ' '; } }
  const CU = B.VB.CareerUI, SU = B.VB.CareerStoryUI, ids = S.systems().map(y => y.id).join(',');
  CU.open('hub', { fresh: true });
  const body = () => rootEl.querySelector('.cr-body').innerHTML, subs = () => rootEl.querySelector('.cr-sub').innerHTML;
  const seen = [], bad = [];
  const visit = (t, s) => { CU._tab(t, s); const h = body(); seen.push(t + (s ? '/' + s : '')); if (!h || /Guardado dañado/.test(h) || /undefined|NaN/.test(h) || /[{}]/.test(txt(h))) bad.push(t + '/' + s); return h; };
  visit('match'); visit('inbox', 'box'); if (SU.has('wall')) visit('inbox', 'wall'); visit('player', 'train'); visit('club', 'people'); visit('life', 'pass'); visit('honors', 'stats'); visit('honors', 'opts'); visit('league', 'cal');
  ok(!err && !errs.length && !bad.length, mode + ' (' + ids + '): ' + seen.length + ' pantallas sin errores ni «undefined», «NaN» o «{»' + (err || errs.length || bad.length ? ' — ' + err + errs.join(' | ').slice(0, 300) + ' ' + bad.join(',') : ''));
  [['wall', 'inbox'], ['people', 'club'], ['pass', 'life'], ['stats', 'honors']].forEach(([k, t]) => { CU._tab(t); ok(subs().indexOf('data-sub="' + k + '"') >= 0 === SU.has(k), mode + ': sub-pestaña ' + k + (SU.has(k) ? ' visible (hay pintor)' : ' oculta (sin pintor)')); });
  CU._tab('player'); ok(subs().indexOf(SU.has('state') ? '>Estado<' : '>Entreno<') >= 0, mode + ': Jugador › ' + (SU.has('state') ? 'Estado' : 'Entreno'));
  const tg = SU.tagFor(K.load(), K.next(K.load())), names = ['', 'Duelo', 'Final', 'Eliminatoria', 'Jefe', 'Derbi', 'Revancha', 'Televisado'];
  ok(names.indexOf(tg) >= 0, mode + ': sello del próximo partido en castellano («' + tg + '»)');
  const ch = SU.chips(K.load()), hx = SU.chipsHTML(K.load(), {});
  ok(Array.isArray(ch) && !BAD.test(txt(hx)) && !/undefined|NaN/.test(hx), mode + ': avisos de todos los sistemas sin «undefined», «NaN», «{» ni «·» (' + ch.map(x => x.t).join(' | ') + ')');
  const ib = SU.inbox(K.load(), {}, (m) => '<div class="msg"><b>' + m.t + '</b></div>', {});
  ok(!/undefined|NaN/.test(ib) && !/[{}]/.test(txt(ib)), mode + ': Bandeja sin «undefined», «NaN» ni «{» (' + (ib.match(/class="msg/g) || []).length + ' mensajes)');
  // elegir una carta de «Tu semana»: el efecto sale UNA vez en un aviso de la tarjeta y el foco va a él (en el móvil no salta arriba)
  if (SU.has('week')) {
    let wkI = -1; for (let i = 0; i < 3 && wkI < 0; i++) if (/data-act="st-wk-/.test(SU.weekCard(K.load(), {}))) wkI = i; else { K.simulateNext(); }
    const rw = wkI >= 0 ? SU.act('st-wk-0', null) : null;
    const w1 = SU.weekCard(K.load(), {}), w2 = SU.weekCard(K.load(), {});
    ok(wkI < 0 || (rw && rw.render && rw.focus === '.st-fx' && (w1.match(/class="st-fx"/g) || []).length === 1 && /<b>Hecho\.<\/b>/.test(w1) && w2.indexOf('st-fx') < 0 && !/undefined|NaN/.test(w1)),
      mode + ': tras elegir en «Tu semana», aviso con el efecto (una sola vez) y foco en él' + (wkI < 0 ? ' (sin cartas en estas jornadas)' : ' (' + txt(w1).replace(/\s+/g, ' ').slice(0, 80) + ')'));
  }
}

console.log('\n' + passes + ' comprobaciones bien' + (fails ? ', ' + fails + ' FALLOS' : ''));
if (fails) { console.log('\nHAY FALLOS'); process.exit(1); }
console.log('\nTODO OK');
