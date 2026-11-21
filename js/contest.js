/* TAKE THE COURT — js/contest.js (owner: estrellas)
 * Concursos de habilidad (VB.Contest; puro, sin DOM, se carga en node con vm). Los usa el fin de semana de las Estrellas de la
 * Carrera (js/career-allstar.js), pero no sabe nada de la Carrera: reglas, marcas de los rivales, simulación de tu marca, ranking y
 * premios por puesto. Los minijuegos son los ejercicios del Entrenamiento que ya tiene la sim (VB.DRILL: serve / recv / atk, 10
 * repeticiones, de 0 a 3 puntos cada una): aquí no se toca la sim ni js/gym.js (los récords del Entrenamiento).
 *
 * API (VB.Contest):
 *   CONTESTS {srv, rcv, atk}: {id, drill, name, short, attr, base, k, sd, rule}; ORDER ['srv', 'rcv', 'atk']; MAX 30; TOP 40 (tope
 *   duro: el saque en salto perfecto suma +1); TRIES 2; N 6 (participantes); LV_MULT y SALARY (los de career-life.js, copiados).
 *   gauss(r) → normal aproximada (media 0, desviación ~1) con 3 tiradas de r.
 *   rivalScore(id, a, r) → marca de un rival de atributo a (0..MAX).
 *   simMine(id, a, r) → tu marca simulada (1,5 menos de media que la del rival con el mismo atributo: jugar renta más).
 *   rank(me, riv) → [{nm, s, me}] ordenado de mayor a menor; con empate, tú primero («desempate: el público»). me = null: solo rivales.
 *   placeOf(list) → tu puesto (1..N) o 0 si no estás.
 *   prize(rank, L) → {fame, money}: 1r 80 × LV_MULT[L] seguidores y medio sueldo; 2º 40 y 0,2; 3r 20 y 0,1; del 4º en adelante, nada.
 *   byDrill(drill) → id del concurso de ese ejercicio o ''.
 */
(function (root) {
  'use strict';
  var VB = root.VB = root.VB || {};

  var CONTESTS = {
    srv: { id: 'srv', drill: 'serve', name: 'Concurso de saques', short: 'Saques', attr: 'serve', base: 17, k: 0.22, sd: 3.2,
      rule: '10 saques a la diana: diana 3, cerca 2, dentro 1' },
    rcv: { id: 'rcv', drill: 'recv', name: 'Concurso de recepción', short: 'Recepción', attr: 'recv', base: 22, k: 0.20, sd: 3.0,
      rule: '10 saques: déjala en la zona del colocador' },
    atk: { id: 'atk', drill: 'atk', name: 'Concurso de remate', short: 'Remate', attr: 'spike', base: 15, k: 0.22, sd: 3.4,
      rule: '10 remates a zona; desde el 6º, con bloqueo' }
  };
  var ORDER = ['srv', 'rcv', 'atk'], MAX = 30, TOP = 40, TRIES = 2, N = 6;
  var LV_MULT = [1, 2, 4, 8, 15], SALARY = [600, 1500, 4000, 9000, 20000];
  var PRIZE = [[80, 0.5], [40, 0.2], [20, 0.1]];

  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function gauss(r) { return (r() + r() + r() - 1.5) * 2; }
  function def(id) { return CONTESTS[id] || null; }
  function rivalScore(id, a, r) {
    var d = def(id); if (!d) return 0;
    return clamp(Math.round(d.base + d.k * ((+a || 0) - 60) + d.sd * gauss(r)), 0, MAX);
  }
  function simMine(id, a, r) {
    var d = def(id); if (!d) return 0;
    return clamp(Math.round(d.base + d.k * ((+a || 0) - 60) + d.sd * gauss(r) - 1.5), 0, MAX);
  }
  function rank(me, riv) {
    var l = (riv || []).map(function (x, i) { return { nm: String(x.nm || ''), s: clamp(x.s | 0, 0, TOP), i: i + 1 }; });
    if (me != null) l.push({ nm: 'Tú', s: clamp(me | 0, 0, TOP), me: 1, i: 0 });
    l.sort(function (a, b) { return b.s - a.s || a.i - b.i; });   // (empate: tú primero; entre rivales, el orden de la lista)
    return l.map(function (x) { var o = { nm: x.nm, s: x.s }; if (x.me) o.me = 1; return o; });
  }
  function placeOf(list) { for (var i = 0; i < (list || []).length; i++) if (list[i].me) return i + 1; return 0; }
  function prize(rk, L) {
    L = clamp(L | 0, 0, 4); var p = PRIZE[(rk | 0) - 1];
    if (!p) return { fame: 0, money: 0 };
    return { fame: Math.round(p[0] * LV_MULT[L]), money: Math.round(p[1] * SALARY[L] / 10) * 10 };
  }
  function byDrill(drill) { for (var i = 0; i < ORDER.length; i++) if (CONTESTS[ORDER[i]].drill === drill) return ORDER[i]; return ''; }

  VB.Contest = { CONTESTS: CONTESTS, ORDER: ORDER, MAX: MAX, TOP: TOP, TRIES: TRIES, N: N, LV_MULT: LV_MULT, SALARY: SALARY, PRIZE: PRIZE,
    gauss: gauss, rivalScore: rivalScore, simMine: simMine, rank: rank, placeOf: placeOf, prize: prize, byDrill: byDrill };
})(typeof window !== 'undefined' ? window : globalThis);
