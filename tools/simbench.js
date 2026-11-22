#!/usr/bin/env node
/* TAKE THE COURT — tools/simbench.js  (owner: net, P0 del sprint online-multi; notes/online-multi-brief.md §1 y §7)
 * Coste de la simulación para el online a N jugadores, en Node (escritorio; en un móvil, de 4 a 8 veces más): por configuración,
 * Sim.step (µs por paso: media, p50, p99), Sim.copyGame (µs), Sim.serialize (bytes del JSON y µs), Sim.deserialize (µs),
 * Sim.stateHash (µs) y el rollback de MAXPRED tics (copyGame + 24 pasos), también ×4 y ×8 (móvil).
 * Configuraciones:
 *   online 2v2      createGame({online, humans:[{},{}]}) con dos bots de entrada (VB.Net.bot por hueco), como una partida en red
 *   offline 2v2     humano simulado ausente (autopilot), referencia
 *   offline 6v6     autopilot 6v6 (la IA lleva a los 12), referencia del 6v6
 *   offline 6v6 banquillo   igual con banquillo y entrenador (cambios, líbero)
 *   online 6v6      createGame({online, format:'6v6', humans: 12 plazas}) con 12 bots por hueco: SOLO cuando el modelo de plazas (P1)
 *                   deje crear un 6v6 online (hoy onlineOpts fuerza el 2v2: sale «n/d»)
 * Uso: node tools/simbench.js [--secs 60] [--seeds 3] [--json salida.json] [--only online2v2,online6v6]
 * No comprueba nada (siempre código 0 salvo excepción): es una medida. Ejecutar con el PC en reposo y repetir si sale raro.
 */
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm');
const ROOT = path.join(__dirname, '..');
const argv = process.argv, arg = (k, d) => argv.includes(k) ? argv[argv.indexOf(k) + 1] : d;
const SECS = +arg('--secs', 60), SEEDS = +arg('--seeds', 3), JSON_OUT = arg('--json', ''), ONLY = arg('--only', '');

function load() {
  const ctx = { console, TextEncoder, TextDecoder };
  ctx.globalThis = ctx;
  vm.createContext(ctx);
  ctx.VB = { VERSION: 'bench' };
  for (const f of ['js/sim.js', 'js/ai.js', 'js/ai6.js', 'js/net.js']) vm.runInContext(fs.readFileSync(path.join(ROOT, f), 'utf8'), ctx, { filename: f });
  return ctx.VB;
}
const VB = load(), S = VB.Sim, DT = 1 / VB.C.SIM_HZ, MAXPRED = VB.Net.MAXPRED;
const pct = (a, q) => { if (!a.length) return 0; const b = Float64Array.from(a).sort(); return b[Math.min(b.length - 1, Math.floor(b.length * q))]; };
const ns = () => process.hrtime.bigint();
const us = (a, b) => Number(b - a) / 1000;
const BENCH = t => [{ role: 'OH', num: 14 + t }, { role: 'MB' }, { role: 'S' }, { role: 'OPP' }, { role: 'L' }];

const CONFIGS = {
  online2v2: { label: 'online 2v2', online: true, opts: s => ({ online: true, seed: 900 + s, venue: s % 2 ? 'hall' : 'beach', humans: [{}, {}], present: true, stats: true }) },
  offline2v2: { label: 'offline 2v2', opts: s => ({ seed: 900 + s, autopilot: true, difficulty: 'normal', stats: true }) },
  offline6v6: { label: 'offline 6v6', opts: s => ({ seed: 900 + s, format: '6v6', autopilot: true, difficulty: 'normal', stats: true }) },
  offline6v6b: { label: 'offline 6v6 banquillo', opts: s => ({ seed: 900 + s, format: '6v6', autopilot: true, difficulty: 'normal', stats: true, bench: [BENCH(0), BENCH(1)], coach: [{ iq: 3 }, { iq: 3 }] }) },
  // 12 plazas: 6 por equipo (team/idx); el modelo de plazas (P1) decidirá el formato exacto de humans; si no lo acepta, n/d
  online6v6: { label: 'online 6v6', online: true, six: true, opts: s => ({ online: true, seed: 900 + s, venue: 'hall', format: '6v6', present: true, stats: true,
    humans: Array.from({ length: 12 }, (_, i) => ({ team: i < 6 ? 0 : 1, idx: i % 6 })) }) }
};

function runCfg(key) {
  const C = CONFIGS[key], out = { key, label: C.label, steps: 0, step: [], copy: [], ser: [], serB: [], deser: [], hash: [], na: '' };
  for (let s = 1; s <= SEEDS; s++) {
    const opts = C.opts(s), g = S.createGame(opts);
    if (C.six && g.size !== 6) { out.na = 'onlineOpts fuerza el 2v2 (falta el modelo de plazas, P1)'; return out; }
    const nh = C.online ? (g.hum ? g.hum.length : 2) : 0;
    const bots = []; for (let k = 0; k < nh; k++) bots.push(VB.Net.bot(k, s * 17 + k, 'bueno'));
    const ins = []; for (let k = 0; k < nh; k++) ins.push({ move: [0, 0] });
    const scratch = S.createGame(opts);
    const steps = Math.round(SECS / DT);
    for (let i = 0; i < steps; i++) {
      let inp = null;
      if (nh) { for (let k = 0; k < nh; k++) { const b = bots[k](g); ins[k] = b; } inp = ins; }   // (los bots fuera del cronómetro)
      const a = ns(); S.step(g, DT, inp); const b = ns();
      g.events.length = 0;
      if (s === 1 && i < 1200) continue;   // (calentamiento del JIT: los 10 primeros segundos de la 1.ª semilla no cuentan)
      out.step.push(us(a, b)); out.steps++;
      if (i % 60 === 30) {   // dos veces por segundo: las otras medidas, sobre estados de partido reales
        let t0 = ns(); S.copyGame(scratch, g); let t1 = ns(); out.copy.push(us(t0, t1));
        t0 = ns(); const ser = JSON.stringify(S.serialize(g)); t1 = ns(); out.ser.push(us(t0, t1)); out.serB.push(ser.length);
        if (i % 600 === 30) { t0 = ns(); S.deserialize(JSON.parse(ser)); t1 = ns(); out.deser.push(us(t0, t1)); }
        t0 = ns(); S.stateHash(g); t1 = ns(); out.hash.push(us(t0, t1));
      }
      if (g.finished) break;
    }
  }
  return out;
}

function summary(o) {
  if (o.na) return { label: o.label, na: o.na };
  const avg = a => a.reduce((x, y) => x + y, 0) / (a.length || 1), r = v => Math.round(v * 100) / 100;
  const step = avg(o.step), copy = avg(o.copy), rb = copy + MAXPRED * step;
  return { label: o.label, steps: o.steps, stepAvg: r(step), stepP50: r(pct(o.step, 0.5)), stepP99: r(pct(o.step, 0.99)),
    copyAvg: r(copy), copyP99: r(pct(o.copy, 0.99)), serKB: r(avg(o.serB) / 1024), serMaxKB: r(Math.max(...o.serB) / 1024), serUs: r(avg(o.ser)),
    deserUs: r(avg(o.deser)), hashUs: r(avg(o.hash)), rollbackMs: r(rb / 1000), rollbackPhoneMs: [r(rb * 4 / 1000), r(rb * 8 / 1000)] };
}

function main() {
  const keys = ONLY ? ONLY.split(',') : Object.keys(CONFIGS);
  const res = [];
  console.log('simbench: ' + SEEDS + ' semillas × ' + SECS + ' s por configuración (Node ' + process.version + '; en un móvil, ×4 a ×8)');
  for (const k of keys) {
    if (!CONFIGS[k]) { console.log('  (configuración desconocida: ' + k + ')'); continue; }
    const s = summary(runCfg(k)); res.push(s);
    if (s.na) { console.log('  ' + s.label.padEnd(22) + ' n/d: ' + s.na); continue; }
    console.log('  ' + s.label.padEnd(22) + ' step ' + s.stepAvg + ' µs (p50 ' + s.stepP50 + ', p99 ' + s.stepP99 + ') · copyGame ' + s.copyAvg + ' µs (p99 ' + s.copyP99 + ')' +
      ' · serialize ' + s.serKB + ' KB (máx ' + s.serMaxKB + ') en ' + s.serUs + ' µs · deserialize ' + s.deserUs + ' µs · stateHash ' + s.hashUs + ' µs' +
      ' · rollback ' + MAXPRED + ' tics ' + s.rollbackMs + ' ms (móvil ' + s.rollbackPhoneMs.join('-') + ' ms)');
  }
  if (JSON_OUT) { fs.writeFileSync(JSON_OUT, JSON.stringify({ when: new Date().toISOString(), node: process.version, secs: SECS, seeds: SEEDS, res }, null, 1)); console.log('  → ' + JSON_OUT); }
  return 0;
}
if (require.main === module) process.exit(main());
module.exports = { runCfg, summary, CONFIGS };
