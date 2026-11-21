#!/usr/bin/env node
/* MAKE THE CUT — tools/audiotest.js   (owner: audio)
 *
 * Nobody can listen during the build, so the audio is MEASURED.
 *
 *  1. Synth: every sound of js/audio.js (all variants) is synthesised in node and measured:
 *     sample peak, true peak (4x oversampled), RMS, K-weighted loudness (ITU-R BS.1770 filter;
 *     integrated with gates for long sounds, momentary-max 400 ms for one-shots), spectral centroid,
 *     high-frequency share, duration, edge clicks (first/last sample, first-ms slope), clicks anywhere
 *     inside the sound (2nd difference vs local RMS; net/netTape grains allowlisted), DC offset, NaN.
 *     WAVs go to tools/out/audio/<name>.wav (variant 0) so a human can listen later.
 *  2. Mix plan: the real engine runs in node against a mock AudioContext that records the graph.
 *     Representative game events (a pass, a spike, a whistle, a home point...) are fed to
 *     VB.Audio.handle()/update(); every BufferSource that starts is rendered through the gains,
 *     filters and stereo panners it is connected to (reverb returns and the master compressor
 *     excluded) and measured in LUFS at the mix bus. Each scenario has a target per category;
 *     PASS = within ±1.5 LU. Stereo balance (L-R) is reported too.
 *  3. Match: a real Chrome renders a full match mix offline (OfflineAudioContext, suspended every
 *     768 samples to step the real sim and feed its events to the real engine, compressor included).
 *     Three deterministic passes (full mix, whistle stem, crowd stem) give: loudness over time,
 *     sample/true peaks, clipping, voice counts and whistle-vs-crowd masking in the whistle band.
 *     The full mix is written to tools/out/audio/match.wav.
 *
 *  4. Robustness: the engine against a mock AudioContext whose params throw on non-finite values.
 *  8. Xaranga (the stand brass band): where it plays (XAR_WHEN), triggers, ducking, whistle hole, volume 0 (mock engine).
 *  5. Cold start: the real game (index.html) on an emulated mid-range phone (CPU x4), JUGAR 1 s after load: synthesis
 *     Worker on, sounds lost in the first 20 s, fallback without Worker / with a CSP that blocks it, bit-identical bank.
 *
 * Usage:  node tools/audiotest.js [options]
 *   --file <path>     audio.js to test (default js/audio.js)
 *   --before <path>   also test that file and print a before/after table
 *   --secs <n>        match length in Chrome (default 60)   --seed <n> sim seed (default 7)
 *   --no-chrome       skip part 3      --no-wav   do not write WAVs     --json <path> dump results
 *   --synth-only      part 1 only      --only a,b  restrict part 1 to these sounds (quick sound design)
 *   --calibrate       print the LEVEL table for js/audio.js that puts every scenario on its target
 *   --no-cold         skip part 5 (cold start in the real game: synthesis Worker, fallback, CSP, bit-identical bank)
 *   --cold-only       run part 5 only
 *   --no-endui        skip part 6 (AUD-08: end sheet and menus in the real game)   --endui-only  run part 6 only
 *   --rot-only        part 7 «rótulos» only (S3-C4: kinetic banner hit + second crowd wave; mock engine, ~20 s)
 *   --s234-only       part 7 whole (S2-S4 / T6: rótulos, new ui() kinds, medal, introStart(dur), replay(on))
 *   --xar-only        part 8 only (xaranga: the stand brass band; mock engine, ~30 s)
 * Exits 1 if a sound has NaN, peaks over 1, edge or inner clicks, a mix target miss, a clip in the match
 * or a masked whistle.
 */
'use strict';
const fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..');
const OUT = path.join(ROOT, 'tools', 'out', 'audio');
const argv = process.argv.slice(2);
function opt(k, d) { const i = argv.indexOf(k); return i >= 0 && i + 1 < argv.length ? argv[i + 1] : d; }
const has = k => argv.includes(k);
const FILE = path.resolve(ROOT, opt('--file', 'js/audio.js'));
const BEFORE = opt('--before', null) && path.resolve(ROOT, opt('--before'));
const SECS = +opt('--secs', 60), SEED = +opt('--seed', 7);
/** AUD-09: integrated loudness of the 60 s match (seed 7) at the end of polish wave 2 (8-nov-2026); the mix must stay within ±1 LU. */
const MATCH_REF = -18.8;

/* ====================================================================
 * Metrics (pure; also injected into the Chrome page as source text)
 * ==================================================================== */
function METRICS() {
  const TAU = Math.PI * 2;
  function biquad(b0, b1, b2, a0, a1, a2) { return { b0: b0 / a0, b1: b1 / a0, b2: b2 / a0, a1: a1 / a0, a2: a2 / a0 }; }
  function runBq(c, x) {
    const y = new Float32Array(x.length); let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
    for (let i = 0; i < x.length; i++) { const v = c.b0 * x[i] + c.b1 * x1 + c.b2 * x2 - c.a1 * y1 - c.a2 * y2; x2 = x1; x1 = x[i]; y2 = y1; y1 = v; y[i] = v; }
    return y;
  }
  /** BS.1770 K-weighting for any sample rate (shelf + RLB high-pass, analog prototypes as in libebur128/pyloudnorm). */
  function kCoefs(sr) {
    let G = 3.999843853973347, f0 = 1681.974450955533, Q = 0.7071752369554196;
    let K = Math.tan(Math.PI * f0 / sr), Vh = Math.pow(10, G / 20), Vb = Math.pow(Vh, 0.4996667741545416);
    const a0 = 1 + K / Q + K * K;
    const sh = biquad((Vh + Vb * K / Q + K * K), 2 * (K * K - Vh), (Vh - Vb * K / Q + K * K), a0, 2 * (K * K - 1), (1 - K / Q + K * K));
    f0 = 38.13547087602444; Q = 0.5003270373238773; K = Math.tan(Math.PI * f0 / sr);
    const hp = biquad(1, -2, 1, 1, 2 * (K * K - 1) / (1 + K / Q + K * K), (1 - K / Q + K * K) / (1 + K / Q + K * K));
    hp.a1 = 2 * (K * K - 1) / (1 + K / Q + K * K); hp.a2 = (1 - K / Q + K * K) / (1 + K / Q + K * K);
    return [sh, hp];
  }
  function kWeight(x, sr) { const c = kCoefs(sr); return runBq(c[1], runBq(c[0], x)); }
  const LU = p => p > 1e-20 ? -0.691 + 10 * Math.log10(p) : -120;
  /** Mean-square blocks of the K-weighted channels summed (channel weights 1). win/hop in s. */
  function blocks(chs, sr, win, hop) {
    const kw = chs.map(c => kWeight(c, sr)), n = chs[0].length, W = Math.round(win * sr), H = Math.round(hop * sr), out = [];
    // pad: a sound shorter than the window is measured inside one zero-padded window (BS.1770 momentary)
    const last = Math.max(0, n - W);
    for (let s = 0; s <= last + 1e-9; s += H) {
      let p = 0;
      for (const k of kw) { let a = 0; const e = Math.min(n, s + W); for (let i = s; i < e; i++) a += k[i] * k[i]; p += a / W; }
      out.push(p);
      if (n <= W) break;
    }
    return out;
  }
  /** Integrated loudness (400 ms blocks, 75 % overlap, -70 LUFS absolute gate, -10 LU relative gate). */
  function integrated(chs, sr) {
    const b = blocks(chs, sr, 0.4, 0.1);
    let g = b.filter(p => LU(p) > -70); if (!g.length) return -120;
    const rel = LU(g.reduce((a, c) => a + c, 0) / g.length) - 10;
    g = g.filter(p => LU(p) > rel); if (!g.length) return -120;
    return LU(g.reduce((a, c) => a + c, 0) / g.length);
  }
  function momentaryMax(chs, sr) { return LU(Math.max.apply(null, blocks(chs, sr, 0.4, 0.01))); }
  function shortTerm(chs, sr, hop) { return blocks(chs, sr, 3, hop || 1).map(LU); }
  /** True peak: 4x oversampling with a 48-tap-per-phase windowed sinc (BS.1770-4 annex 2 style). */
  const TP = (function () {
    const P = 4, T = 12, ph = [];
    for (let p = 0; p < P; p++) {
      const h = new Float32Array(2 * T);
      for (let k = -T + 1; k <= T; k++) {
        const t = k - p / P, w = 0.5 + 0.5 * Math.cos(Math.PI * t / (T + 1));
        h[k + T - 1] = (Math.abs(t) < 1e-9 ? 1 : Math.sin(Math.PI * t) / (Math.PI * t)) * w;
      }
      ph.push(h);
    }
    return { P, T, ph };
  })();
  function truePeak(chs) {
    let m = 0;
    for (const x of chs) {
      const n = x.length;
      for (let i = 0; i < n; i++) {
        const a = Math.abs(x[i]); if (a > m) m = a;
        for (let p = 1; p < TP.P; p++) {
          const h = TP.ph[p]; let s = 0;
          for (let k = 0; k < h.length; k++) { const j = i + k - TP.T + 1; if (j >= 0 && j < n) s += x[j] * h[k]; }
          if (s > m) m = s; else if (-s > m) m = -s;
        }
      }
    }
    return m;
  }
  function peak(chs) { let m = 0; for (const x of chs) for (let i = 0; i < x.length; i++) { const a = Math.abs(x[i]); if (a > m) m = a; } return m; }
  function rms(chs) { let s = 0, n = 0; for (const x of chs) { for (let i = 0; i < x.length; i++) s += x[i] * x[i]; n += x.length; } return Math.sqrt(s / Math.max(1, n)); }
  function dc(chs) { let m = 0; for (const x of chs) { let s = 0; for (let i = 0; i < x.length; i++) s += x[i]; m = Math.max(m, Math.abs(s / x.length)); } return m; }
  function fft(re, im) {
    const n = re.length;
    for (let i = 1, j = 0; i < n; i++) { let b = n >> 1; for (; j & b; b >>= 1) j ^= b; j ^= b; if (i < j) { let t = re[i]; re[i] = re[j]; re[j] = t; t = im[i]; im[i] = im[j]; im[j] = t; } }
    for (let len = 2; len <= n; len <<= 1) {
      const a = -TAU / len, wr = Math.cos(a), wi = Math.sin(a);
      for (let i = 0; i < n; i += len) {
        let cr = 1, ci = 0;
        for (let k = 0; k < len / 2; k++) {
          const ur = re[i + k], ui = im[i + k], vr = re[i + k + len / 2] * cr - im[i + k + len / 2] * ci, vi = re[i + k + len / 2] * ci + im[i + k + len / 2] * cr;
          re[i + k] = ur + vr; im[i + k] = ui + vi; re[i + k + len / 2] = ur - vr; im[i + k + len / 2] = ui - vi;
          const t = cr * wr - ci * wi; ci = cr * wi + ci * wr; cr = t;
        }
      }
    }
  }
  /** Power spectrum summed over Hann frames (mono mix of the channels). Returns {pow, binHz}. */
  function spectrum(chs, sr, N) {
    N = N || 2048; const n = chs[0].length, H = N / 2, pow = new Float64Array(N / 2), re = new Float64Array(N), im = new Float64Array(N);
    for (let s = 0; s < Math.max(1, n - H); s += H) {
      for (let i = 0; i < N; i++) { let v = 0; for (const c of chs) v += (c[s + i] || 0); re[i] = v * (0.5 - 0.5 * Math.cos(TAU * i / N)); im[i] = 0; }
      fft(re, im);
      for (let k = 0; k < N / 2; k++) pow[k] += re[k] * re[k] + im[k] * im[k];
    }
    return { pow, binHz: sr / N };
  }
  /** Spectral centroid (magnitude weighted) and share of energy above 6 kHz / below 150 Hz. */
  function spectral(chs, sr) {
    const sp = spectrum(chs, sr, 2048); let sm = 0, sw = 0, tot = 0, hi = 0, lo = 0;
    for (let k = 1; k < sp.pow.length; k++) {
      const f = k * sp.binHz, p = sp.pow[k], m = Math.sqrt(p);
      sm += m; sw += m * f; tot += p; if (f > 6000) hi += p; if (f < 150) lo += p;
    }
    return { centroid: sw / Math.max(1e-12, sm), hf: hi / Math.max(1e-20, tot), lf: lo / Math.max(1e-20, tot) };
  }
  /** Edge clicks: |first|,|last| sample and the largest step in the first/last ms, relative to the peak. */
  function clicks(chs, sr) {
    const pk = Math.max(1e-9, peak(chs)); let edge = 0, slope = 0; const W = Math.max(2, Math.round(0.001 * sr));
    for (const x of chs) {
      const n = x.length; edge = Math.max(edge, Math.abs(x[0]), Math.abs(x[n - 1]));
      for (let i = 1; i < Math.min(W, n); i++) slope = Math.max(slope, Math.abs(x[i] - x[i - 1]), Math.abs(x[n - i] - x[n - i - 1]));
    }
    return { edge: edge / pk, edgeAbs: edge, slope: slope / pk };
  }
  /** Clicks anywhere in the sound: |2nd difference| (emphasises > ~8 kHz) against the local RMS of the
   *  2nd difference in a +-5 ms window (centre +-2 samples excluded). A hit is |d2| > 0.02 and > 8x local.
   *  Same rule as the round-1 verifier's wavcheck.js, so a pass here means a pass there. */
  function innerClicks(chs, sr) {
    let worst = 0, at = 0, cnt = 0; const W = Math.round(0.005 * sr);
    for (const x of chs) {
      const n = x.length, d = new Float64Array(n), cs = new Float64Array(n + 1);
      for (let i = 1; i < n - 1; i++) d[i] = Math.abs(x[i + 1] - 2 * x[i] + x[i - 1]);
      for (let i = 0; i < n; i++) cs[i + 1] = cs[i] + d[i] * d[i];
      for (let i = 2; i < n - 2; i++) {
        if (d[i] <= 0.02) continue;
        const a = Math.max(0, i - W), b = Math.min(n, i + W);
        const e = cs[b] - cs[a] - (cs[Math.min(n, i + 3)] - cs[Math.max(0, i - 2)]), m = Math.max(1, b - a - 5);
        const ratio = d[i] / Math.max(Math.sqrt(Math.max(0, e) / m), 1e-4);
        if (ratio > 8) cnt++;
        if (ratio > worst) { worst = ratio; at = i / sr; }
      }
    }
    return { worst, at, cnt };
  }
  /** Energy of a band [f0,f1] in a window (s) via FFT of the whole window (mono sum). */
  function bandEnergy(chs, sr, t0, t1, f0, f1) {
    const a = Math.max(0, Math.round(t0 * sr)), b = Math.min(chs[0].length, Math.round(t1 * sr)); if (b - a < 64) return 0;
    let N = 1; while (N < b - a) N <<= 1;
    const re = new Float64Array(N), im = new Float64Array(N);
    for (let i = a; i < b; i++) { let v = 0; for (const c of chs) v += c[i]; re[i - a] = v * (0.5 - 0.5 * Math.cos(TAU * (i - a) / (b - a))); }
    fft(re, im); let e = 0; const bin = sr / N;
    for (let k = Math.ceil(f0 / bin); k <= Math.floor(f1 / bin) && k < N / 2; k++) e += re[k] * re[k] + im[k] * im[k];
    return e;
  }
  /** Small speaker (phone/laptop): 4th-order high-pass at 250 Hz. Returns the filtered channels. */
  function smallSpeaker(chs, sr) {
    const K = Math.tan(Math.PI * 250 / sr), q = Math.SQRT1_2, n0 = 1 / (1 + K / q + K * K);
    const c = biquad(1, -2, 1, 1, 2 * (K * K - 1) * n0, (1 - K / q + K * K) * n0); c.b0 = n0; c.b1 = -2 * n0; c.b2 = n0;
    return chs.map(x => runBq(c, runBq(c, x)));
  }
  const db = v => v > 1e-12 ? 20 * Math.log10(v) : -240;
  return { smallSpeaker, kWeight, integrated, momentaryMax, shortTerm, truePeak, peak, rms, dc, spectral, spectrum, clicks, innerClicks, bandEnergy, LU, db, blocks };
}
const M = METRICS();
const r1 = v => Math.round(v * 10) / 10, r2 = v => Math.round(v * 100) / 100;

/* ====================================================================
 * WAV writer (16-bit PCM)
 * ==================================================================== */
function wav(file, chs, sr) {
  const n = chs[0].length, C = chs.length, buf = Buffer.alloc(44 + n * C * 2);
  buf.write('RIFF', 0); buf.writeUInt32LE(36 + n * C * 2, 4); buf.write('WAVEfmt ', 8); buf.writeUInt32LE(16, 16);
  buf.writeUInt16LE(1, 20); buf.writeUInt16LE(C, 22); buf.writeUInt32LE(sr, 24); buf.writeUInt32LE(sr * C * 2, 28);
  buf.writeUInt16LE(C * 2, 32); buf.writeUInt16LE(16, 34); buf.write('data', 36); buf.writeUInt32LE(n * C * 2, 40);
  let o = 44;
  for (let i = 0; i < n; i++) for (let c = 0; c < C; c++) { const v = Math.max(-1, Math.min(1, chs[c][i])); buf.writeInt16LE(Math.round(v * 32767), o); o += 2; }
  fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, buf);
}

/* ====================================================================
 * Load a copy of audio.js in node (fresh VB each time)
 * ==================================================================== */
function loadAudio(file) {
  const src = fs.readFileSync(file, 'utf8');
  const VB = {}; const sandboxRoot = { VB };
  // the module does: root = window || globalThis; VB = root.VB. Run it with a private globalThis-like object.
  const fn = new Function('window', 'globalThis', 'document', src);
  const g = Object.create(globalThis); g.VB = VB;
  fn.call(g, undefined, g, undefined);
  return { VB, root: g, sandboxRoot };
}

/* ====================================================================
 * Part 1: per-sound synthesis metrics
 * ==================================================================== */
function synthReport(file, writeWav) {
  const { VB } = loadAudio(file); const A = VB.Audio, rows = [];
  const ONLY = opt('--only', '') ? opt('--only').split(',') : null;
  for (const name of A.SOUNDS) {
    if (name === 'ir' || (ONLY && !ONLY.includes(name))) continue;
    const sr = A.synthRate(name, 48000);
    for (let v = 0; v < 6; v++) {
      const t0 = Date.now(); const chs = A.synth(name, v, 48000); const ms = Date.now() - t0;
      if (!chs) break;
      // variants beyond the catalogue repeat with new seeds; only measure what the engine builds
      const nan = chs.some(c => c.some(x => !isFinite(x)));
      const dur = chs[0].length / sr, sp = M.spectral(chs, sr), ck = M.clicks(chs, sr), ic = M.innerClicks(chs, sr);
      rows.push({ name, v, sr, ch: chs.length, dur: r2(dur), peak: M.peak(chs), tp: M.truePeak(chs), rms: M.rms(chs),
        I: dur >= 1 ? M.integrated(chs, sr) : null, Mmax: M.momentaryMax(chs, sr), phone: M.momentaryMax(chs, sr) - M.momentaryMax(M.smallSpeaker(chs, sr), sr), centroid: Math.round(sp.centroid), hf: sp.hf, lf: sp.lf,
        edge: ck.edge, slope: ck.slope, click: ic.cnt, clickWorst: ic.worst, clickAt: ic.at, dc: M.dc(chs), nan, ms, loop: LOOPS.includes(name), seam: seamOf(chs) });
      if (writeWav && v === 0) wav(path.join(OUT, name + '.wav'), chs, sr);
      if (v + 1 >= variantsOf(A, name)) break;
    }
  }
  return rows;
}
const LOOPS = ['murmur', 'excite', 'whistleStorm', 'xarPasa', 'xarRedoble'];
/** Sounds whose short transients are the sound itself (net cord/tape rattle grains): innerClicks not enforced. */
const CLICK_GRAINS = ['net', 'netTape'];
/** Loop seam: jump across the wrap (last→first sample) relative to the typical sample-to-sample step. */
function seamOf(chs) { let w = 0; for (const x of chs) { let st = 0; for (let i = 1; i < x.length; i++) st += Math.abs(x[i] - x[i - 1]); st /= x.length - 1; w = Math.max(w, Math.abs(x[0] - x[x.length - 1]) / Math.max(1e-9, st) / 10); } return w; }
function variantsOf(A, name) { return (A.VARIANTS && A.VARIANTS[name]) || ({ pass: 3, set: 3, free: 3, serve: 3, spike: 3, block: 3, land: 3, slam: 3, bounce: 3, feet: 3, net: 2, netTape: 2, whistle: 2, whistleLong: 2, squeak: 5, scuff: 2, whoosh: 2, slide: 2, roar: 2 })[name] || 1; }

/* ====================================================================
 * Part 2: mix plan through a mock AudioContext
 * ==================================================================== */
const MOCK_SR = 48000;
function makeMock() {
  const started = [];
  class Param { constructor(v) { this.value = v; } setTargetAtTime(v) { this.value = v; } setValueAtTime(v) { this.value = v; } linearRampToValueAtTime(v) { this.value = v; } exponentialRampToValueAtTime(v) { this.value = v; } cancelScheduledValues() { } cancelAndHoldAtTime() { } }
  class Node { constructor(ctx, type) { this.context = ctx; this.type0 = type; this.outs = []; } connect(d) { this.outs.push(d); return d; } disconnect() { this.outs = []; } }
  class Buf { constructor(c, n, sr) { this.numberOfChannels = c; this.length = n; this.sampleRate = sr; this.duration = n / sr; this.d = []; for (let i = 0; i < c; i++) this.d.push(new Float32Array(n)); } copyToChannel(a, c) { this.d[c].set(a); } getChannelData(c) { return this.d[c]; } }
  class Ctx {
    constructor() { this.sampleRate = MOCK_SR; this.currentTime = 0; this.state = 'running'; this.destination = new Node(this, 'dest'); }
    createBuffer(c, n, sr) { return new Buf(c, n, sr); }
    createGain() { const n = new Node(this, 'gain'); n.gain = new Param(1); return n; }
    createBiquadFilter() { const n = new Node(this, 'biquad'); n.type = 'lowpass'; n.frequency = new Param(350); n.Q = new Param(1); n.gain = new Param(0); return n; }
    createDynamicsCompressor() { const n = new Node(this, 'comp'); for (const k of ['threshold', 'knee', 'ratio', 'attack', 'release']) n[k] = new Param(0); return n; }
    createWaveShaper() { const n = new Node(this, 'shaper'); n.curve = null; n.oversample = 'none'; return n; }
    createConvolver() { const n = new Node(this, 'conv'); n.normalize = true; n.buffer = null; return n; }
    createDelay() { const n = new Node(this, 'delay'); n.delayTime = new Param(0); return n; }
    createStereoPanner() { const n = new Node(this, 'pan'); n.pan = new Param(0); return n; }
    createBufferSource() {
      const n = new Node(this, 'src'), ctx = this; n.buffer = null; n.loop = false; n.playbackRate = new Param(1); n.detune = new Param(0);
      n.start = function (w, off) { const r = { src: n, when: w || ctx.currentTime, at: ctx.currentTime }; n.rec = r; started.push(r); };
      n.stop = function (w) { if (n.rec && (w || ctx.currentTime) <= n.rec.when) n.rec.cancelled = true; }; return n;
    }
    suspend() { this.state = 'suspended'; return Promise.resolve(); }
    resume() { this.state = 'running'; return Promise.resolve(); }
  }
  return { Ctx, started };
}
/** Renders one started source through the graph to the destination (stereo). Reverb (convolvers) and the compressor's
 *  dynamics are excluded; gains, biquads (lowpass/highpass, WebAudio Q in dB) and StereoPanner are applied. */
function renderSource(s, Biq) {
  const b = s.src.buffer; if (!b) return null;
  const outL = new Float32Array(b.length), outR = new Float32Array(b.length);
  let reached = false;
  function walk(node, chs) {
    for (const d of node.outs) {
      let c = chs;
      switch (d.type0) {
        case 'gain': c = chs.map(x => x.map(v => v * d.gain.value)); break;
        case 'biquad': {
          const q = Math.pow(10, d.Q.value / 20);
          if (d.type === 'peaking' && Math.abs(d.gain.value) < 0.01) break; // flat
          c = chs.map(x => { const f = d.type === 'peaking' ? new Biq('peak', d.frequency.value, d.Q.value, b.sampleRate, d.gain.value) : new Biq(d.type === 'highpass' ? 'hp' : 'lp', d.frequency.value, q, b.sampleRate); const y = new Float32Array(x.length); for (let i = 0; i < x.length; i++) y[i] = f.p(x[i]); return y; });
          break;
        }
        case 'pan': {
          const p = Math.max(-1, Math.min(1, d.pan.value));
          if (chs.length === 1) { const x = (p + 1) / 2, gl = Math.cos(x * Math.PI / 2), gr = Math.sin(x * Math.PI / 2); c = [chs[0].map(v => v * gl), chs[0].map(v => v * gr)]; }
          else if (p <= 0) { const x = p + 1, gl = Math.cos(x * Math.PI / 2), gr = Math.sin(x * Math.PI / 2); c = [chs[0].map((v, i) => v + chs[1][i] * gl), chs[1].map(v => v * gr)]; }
          else { const gl = Math.cos(p * Math.PI / 2), gr = Math.sin(p * Math.PI / 2); c = [chs[0].map(v => v * gl), chs[1].map((v, i) => v + chs[0][i] * gr)]; }
          break;
        }
        case 'conv': continue;
        case 'shaper': {
          if (d.curve) { const cv = d.curve, L = cv.length - 1; c = chs.map(x => x.map(v => { const u = (Math.max(-1, Math.min(1, v)) + 1) / 2 * L, i = Math.min(L - 1, Math.floor(u)), f = u - i; return cv[i] * (1 - f) + cv[i + 1] * f; })); }
          break;
        }
        case 'dest': {
          reached = true;
          const L = c[0], R = c.length > 1 ? c[1] : c[0];
          for (let i = 0; i < L.length; i++) { outL[i] += L[i]; outR[i] += R[i]; }
          continue;
        }
        case 'comp': { const g = compMakeup(d); c = chs.map(x => x.map(v => v * g)); break; }
        default: break; // delay: pass through
      }
      walk(d, c);
    }
  }
  walk(s.src, b.d);
  return reached ? { L: outL, R: outR, sr: b.sampleRate } : null;
}
/** Small-signal gain of a DynamicsCompressorNode = its automatic makeup gain (Chrome/WebKit always apply it).
 *  Measured in Chrome with a 1 kHz sine at -40 dBFS (tools/out/audio/compmeasure.js). Gain reduction itself is not
 *  modelled here: part 3 renders the real compressor. */
const MAKEUP_DB = { '-14,10,4.5': 4.42, '-10,8,4': 2.91, '-12,10,3': 2.88, '-8,6,4': 2.45 };
function compMakeup(d) {
  const k = [d.threshold.value, d.knee.value, d.ratio.value].join(',');
  if (!(k in MAKEUP_DB)) { console.log('WARNING: compressor ' + k + ' not measured; assuming 0 dB makeup'); MAKEUP_DB[k] = 0; }
  return Math.pow(10, MAKEUP_DB[k] / 20);
}
/** Minimal RBJ biquad for the mock (same maths as audio.js). */
function Biq(type, f, q, sr, gdb) {
  f = Math.max(10, Math.min(f, sr * 0.45)); const w = 2 * Math.PI * f / sr, c = Math.cos(w), s = Math.sin(w), a = s / (2 * (q || 0.707));
  let a0 = 1 + a, b0, b1, b2;
  if (type === 'peak') { const A = Math.pow(10, (gdb || 0) / 40); b0 = 1 + a * A; b1 = -2 * c; b2 = 1 - a * A; a0 = 1 + a / A; this.b0 = b0 / a0; this.b1 = b1 / a0; this.b2 = b2 / a0; this.a1 = -2 * c / a0; this.a2 = (1 - a / A) / a0; this.x1 = this.x2 = this.y1 = this.y2 = 0; return; }
  if (type === 'lp') { b0 = (1 - c) / 2; b1 = 1 - c; b2 = b0; } else if (type === 'hp') { b0 = (1 + c) / 2; b1 = -(1 + c); b2 = b0; } else { b0 = a; b1 = 0; b2 = -a; }
  this.b0 = b0 / a0; this.b1 = b1 / a0; this.b2 = b2 / a0; this.a1 = -2 * c / a0; this.a2 = (1 - a) / a0; this.x1 = this.x2 = this.y1 = this.y2 = 0;
}
Biq.prototype.p = function (x) { const y = this.b0 * x + this.b1 * this.x1 + this.b2 * this.x2 - this.a1 * this.y1 - this.a2 * this.y2; this.x2 = this.x1; this.x1 = x; this.y2 = this.y1; this.y1 = y; return y; };

/* Loudness plan (LUFS at the OUTPUT for signals under the compressor threshold: gains, filters, panners and the
 * compressor's automatic makeup gain are included, its gain reduction is not; stereo sum; positional sounds measured on
 * the home court ~8 m in front of the camera). 'metric': M = momentary max (one-shots), I = integrated (beds, long). */
const PLAN = {
  ui: { target: -24, desc: 'menu clicks' }, uiSoft: { target: -28, desc: 'hover / player switch' },
  touch: { target: -18, desc: 'pass, free ball, float serve' }, touchSoft: { target: -21, desc: 'set, tip (fingertips)' }, spike: { target: -14, desc: 'spike, jump serve' },
  impact: { target: -15, desc: 'stuff block, spike slamming the floor' }, ball: { target: -18, desc: 'ball on the floor, net' },
  whistle: { target: -16, desc: 'referee whistle' }, foley: { target: -24, desc: 'sneakers, steps, arm swing' },
  deadBall: { target: -26, desc: 'dead-ball bounces' }, bed: { target: -26, desc: 'crowd beds (murmur + excitement)' },
  react: { target: -20, desc: 'crowd reactions (roar, groan, applause)' }, chant: { target: -22, desc: 'stand claps + bass drum, heartbeat' },
  sting: { target: -16, desc: 'set / match stings' }, glint: { target: -26, desc: '"perfect" glint' },
  chantSoft: { target: -27, desc: 'heartbeat on a set-point serve (0.6x, 1.0 s)' }, tick: { target: -25, desc: 'serve clock tick (last 3 s)' },
  // polish wave 2 (AUD-05/06)
  foleySoft: { target: -27, desc: 'one player clapping encouragement (60 ms transient: reads louder than its 400 ms LUFS)' },
  dribble: { target: -23, desc: 'serve-ritual bounce (softer than a rally bounce -18, above dead-ball bounces -26)' },
  trans: { target: -25, desc: 'transition wipe (almost every point: discreet)' },
  introSting: { target: -19, desc: 'presentation brand sting (soft: under the -16 match stings)' },
  introCrowd: { target: -21, desc: 'presentation crowd swell (a build, just under the -20 reactions)' },
  intro: { target: -17, desc: 'presentation: sting + crowd swell together' },
  // polish wave 3 (AUD-08): end sheet and menus
  uiTick: { target: -29, desc: 'end-sheet count-up ticks (the whole 600 ms train; under the hover -28)' },
  uiLock: { target: -25, desc: 'count-up end: the numbers lock ("clac")' },
  mvp: { target: -19, desc: 'MVP reveal sting (as soft as the presentation sting: it lands on the tail of the match sting)' },
  endUi: { target: -19, desc: 'final de partido: the whole end-sheet UI layer (ticks + lock + MVP sting)' },
  // sprint challenge (B8): bench-tablet horn, tense murmur during the review, reaction to the result
  horn: { target: -17, desc: 'challenge horn (fills the hall like the whistle, just under it)' },
  reviewBed: { target: -21, desc: 'tense murmur during the video review (+5 dB over the calm bed, no excitement layer)' },
  reactBig: { target: -18, desc: 'reaction to an overturned call (louder than a normal point reaction)' },
  // sprint cartoon: cartoon layers under the usual hit (colour, not a second hit) and the perfect-spike «¡PAM!» stinger
  toon: { target: -25, desc: 'cartoon «bonk» under a touch (7 LU under the -18 touch)' },
  toonHit: { target: -21, desc: 'cartoon «whack» under a spike (7 LU under the -14 spike)' },
  toonZip: { target: -24, desc: 'speed-line whizz of a hard spike' },
  toonBoing: { target: -24, desc: 'subtle spring when the ball bounces off the block or the net (6 LU under the -18 net)' },
  stinger: { target: -21, desc: 'perfect-spike «¡PAM!» brass hit (a reward: like a moderate crowd reaction, under the -16 set stings)' },
  // sprints 2-4 (T6, S2-B4/B5/B6): new interface sounds
  uiTab: { target: -26, desc: 'tab change / panel open-close (near the click: -28..-24)' },
  uiBeat: { target: -20, desc: 'TV-style intro beat (B, C)' },
  uiRank: { target: -19, desc: 'table arrow / unlock in the summary (under the -16 stings)' },
  // ambiente de Carrera (P2, 18-nov-2026): silbidos al saque rival (bucle hasta el golpe), campanita de megafonía
  ambWhistles: { target: -23, desc: 'whistles at the away server (loop until the serve: above the -26 bed, under the -20 reactions)' },
  pa: { target: -24, desc: 'PA chime before the speaker (like a menu confirmation)' },
  // xaranga (21-nov-2026): the stand brass band, at the default 60 % volume
  xarPasa: { target: -24, desc: 'brass band street march between points (under the -20 reactions, over the -26 bed)' },
  xarRed: { target: -25, desc: 'snare roll on a set/match-point serve (full level, after its 0.65 s crescendo)' },
  xarDes: { target: -22, desc: 'out-of-tune trumpet when the rival misses the serve (lands as the cheer fades)' },
  xarEns: { target: -27, desc: 'band rehearsing in the menu (only with XAR_WHEN.menu)' }
};
/** The end-sheet count-up of ui.js (UI-11: 600 ms, cubic ease-out, one rAF per frame) with AUD-08 wired as notes/ui_main.md asks:
 *  ui('count', u) on every frame where a displayed number changes, and on the last frame (u = 1). Returns [[t, u], ...] (s from
 *  the first frame). vals = the numbers on the sheet (a typical 2-0 win). */
const END_VALS = [2, 0, 50, 38, 30, 21, 5, 4, 3, 2, 12, 13, 6, 4, 28, 18, 6, 4, 20, 14, 3, 3];
function countUpCalls(vals, fps, dur) {
  vals = vals || END_VALS; fps = fps || 60; dur = dur || 0.6;
  const cur = vals.map(() => '0'), out = [];
  for (let f = 0; ; f++) {
    const t = f / fps, u = Math.max(0, Math.min(1, t / dur)), e = 1 - Math.pow(1 - u, 3); let chg = false;
    for (let j = 0; j < vals.length; j++) { const tv = String(Math.round(vals[j] * e)); if (cur[j] !== tv) { cur[j] = tv; chg = true; } }
    if (chg || u >= 1) out.push([t, u]);
    if (u >= 1) return out;
  }
}
function runCount(A, C, calls) { const t0 = C.currentTime; for (const c of calls) { C.currentTime = t0 + c[0]; A.ui('count', c[1], (t0 + c[0]) * 1000); } }
const HOME = { x: 6, y: 1.5 }, CAM = { x: 14, y: 0, z: 0 };
function hitE(kind, extra) { return Object.assign({ type: 'hit', kind, x: HOME.x, y: HOME.y, z: 2, quality: 0.8, speed: 10, power: 0.5, human: false, grade: 'good', team: 0, touch: 1, t: 10 }, extra || {}); }
const P0 = { x: HOME.x, y: HOME.y, z: 0, team: 0, lastAction: '' };
const SCEN = [
  { id: 'pass', cat: 'touch', only: ['pass'], ev: [hitE('pass')] },
  { id: 'set', cat: 'touchSoft', only: ['set'], ev: [hitE('set', { touch: 2 })] },
  { id: 'free', cat: 'touch', only: ['free'], ev: [hitE('free', { touch: 3 })] },
  { id: 'serve float', cat: 'touch', only: ['serve'], ev: [hitE('serve', { shot: 'float', speed: 14, touch: 0, x: 9.5 })] },
  { id: 'spike', cat: 'spike', only: ['spike'], ev: [hitE('spike', { touch: 3, speed: 22 })] },
  { id: 'jump serve', cat: 'spike', only: ['spike'], ev: [hitE('serve', { shot: 'jump', speed: 20, touch: 0, x: 9.5 })] },
  { id: 'block stuff', cat: 'impact', only: ['block'], ev: [{ type: 'block', result: 'stuff', x: 0.3, y: 1, z: 3, team: 1, player: { x: -0.4, y: 1, z: 0.5, team: 1 } }] },
  { id: 'slam (spike lands)', cat: 'impact', only: ['slam'], g: { lastKind: 'spike' }, ev: [{ type: 'land', x: HOME.x, y: HOME.y, inside: true, team: 0, speed: 16 }] },
  { id: 'land', cat: 'ball', only: ['land'], g: { lastKind: 'free' }, ev: [{ type: 'land', x: HOME.x, y: HOME.y, inside: true, team: 0, speed: 8 }] },
  { id: 'net', cat: 'ball', only: ['net'], ev: [{ type: 'net', x: 0, y: 1, z: 2.2, tape: false }] },
  { id: 'net tape', cat: 'ball', only: ['netTape'], ev: [{ type: 'net', x: 0, y: 1, z: 2.4, tape: true }] },
  { id: 'whistle serve', cat: 'whistle', only: ['whistle'], ev: [{ type: 'whistle', reason: 'serve' }] },
  { id: 'whistle point', cat: 'whistle', only: ['whistleLong'], ev: [{ type: 'whistle', reason: 'point' }] },
  { id: 'whistle end', cat: 'whistle', only: ['whistleEnd'], ev: [{ type: 'whistle', reason: 'point' }, { type: 'point', team: 1, setWon: true, reason: 'in', rallyHits: 3 }] },
  { id: 'squeak', cat: 'foley', only: ['squeak'], ev: [{ type: 'dive', player: P0, x: HOME.x, y: HOME.y }], tries: 30 },
  { id: 'jump scuff', cat: 'foley', only: ['scuff'], ev: [{ type: 'jump', player: P0 }] },
  { id: 'feet (landing)', cat: 'foley', only: ['feet'], ev: [{ type: 'landPlayer', player: P0 }] },
  { id: 'swing whoosh', cat: 'foley', only: ['whoosh'], ev: [{ type: 'swing', player: P0, shot: '' }] },
  { id: 'dive slide', cat: 'foley', only: ['slide'], ev: [{ type: 'dive', player: P0, x: HOME.x, y: HOME.y }] },
  { id: 'high five (celebration)', cat: 'foley', only: ['slap'], ev: [{ type: 'fx:highfive', team: 0, x: HOME.x, y: HOME.y, z: 2, strength: 1 }] },
  { id: 'fist bump (celebration)', cat: 'foley', only: ['fist'], ev: [{ type: 'fx:fistbump', team: 0, x: HOME.x, y: HOME.y, z: 1.3, strength: 0.55 }] },
  { id: 'chest bump (match win)', cat: 'foley', only: ['chest'], ev: [{ type: 'fx:chestbump', team: 0, x: HOME.x, y: HOME.y, z: 1.4, strength: 1 }] },
  { id: 'clap (encouragement)', cat: 'foleySoft', only: ['handclap'], ev: [{ type: 'fx:clap', team: 1, x: HOME.x, y: HOME.y, z: 1.2, strength: 0.6 }] },
  { id: 'dribble (serve ritual)', cat: 'dribble', only: ['dribble'], ev: [{ type: 'dribble', team: 0, x: HOME.x, y: HOME.y, player: P0 }] },
  { id: 'cortinilla (wipe)', cat: 'trans', only: ['wipe'], api: A => A.ui('wipe') },
  // polish wave 3 (AUD-08): end sheet (count-up of the numbers, lock, MVP reveal) and the menu arrows / settings toggles
  { id: 'cuenta de la hoja final (tics)', cat: 'uiTick', only: ['cntTick'], api: (A, C) => runCount(A, C, countUpCalls()) },
  { id: 'cuenta: clac final', cat: 'uiLock', only: ['cntLock'], api: (A, C) => runCount(A, C, countUpCalls()) },
  { id: 'MVP (gana el humano)', cat: 'mvp', only: ['mvpWin'], api: A => A.ui('mvp', true) },
  { id: 'MVP (gana la CPU)', cat: 'mvp', only: ['mvpLose'], api: A => A.ui('mvp', false) },
  { id: 'final de partido: hoja (tics + clac + MVP)', cat: 'endUi', only: ['cntTick', 'cntLock', 'mvpWin'], api: (A, C) => { A.ui('mvp', true); runCount(A, C, countUpCalls()); } },
  { id: 'flecha de dificultad: hover', cat: 'uiSoft', only: ['arwHover'], api: A => A.ui('arrowHover', 1) },
  { id: 'flecha de dificultad: paso', cat: 'ui', only: ['stepUp'], api: A => A.ui('arrow', 1, 2, 4) },
  { id: 'flecha de dificultad: paso abajo', cat: 'ui', only: ['stepDown'], api: A => A.ui('arrow', -1, 1, 4) },
  { id: 'flecha de dificultad: tope', cat: 'ui', only: ['arwEdge'], api: A => A.ui('arrowEdge', -1) },
  { id: 'ajustes: hover de fila', cat: 'uiSoft', only: ['optHover'], api: A => A.ui('optHover') },
  { id: 'ajustes: interruptor a Sí', cat: 'ui', only: ['tglOn'], api: A => A.ui('toggle', true) },
  { id: 'ajustes: interruptor a No', cat: 'ui', only: ['tglOff'], api: A => A.ui('toggle', false) },
  { id: 'ajustes: opción de varios valores', cat: 'ui', only: ['optSel'], api: A => A.ui('select', 1, 4) },
  { id: 'ajustes: deslizador (un paso)', cat: 'uiSoft', only: ['cntTick'], api: A => A.ui('slide', 0.5) },
  { id: 'presentación: firma', cat: 'introSting', only: ['introSting'], api: A => A.sting('intro') },
  { id: 'presentación: grada', cat: 'introCrowd', only: ['introSwell'], api: A => A.sting('intro') },
  { id: 'presentación', cat: 'intro', only: ['introSting', 'introSwell'], api: A => A.sting('intro') },
  { id: 'dead bounce', cat: 'deadBall', only: ['bounce'], ev: [{ type: 'bounce', x: HOME.x, y: HOME.y, speed: 3 }] },
  // crowd reactions at the median highlight of a human match (0.35: notes/sim.md SIM-01, bot medio vs Normal p50); the
  // highlight → loudness curve itself is gated in part 2b (AUD-07, Spearman over 30 real points)
  { id: 'roar (home kill)', cat: 'react', only: ['roar'], ev: [{ type: 'point', team: 0, reason: 'in', how: 'kill', rallyHits: 4, lastKind: 'spike', highlight: 0.35 }] },
  { id: 'groan (home error)', cat: 'react', only: ['groan'], ev: [{ type: 'point', team: 1, reason: 'out', how: 'error', rallyHits: 3, highlight: 0.35 }] },
  { id: 'applause (home point)', cat: 'react', only: ['applause'], ev: [{ type: 'point', team: 0, reason: 'in', how: 'kill', rallyHits: 4, lastKind: 'spike', highlight: 0.35 }] },
  { id: 'ooh (dig)', cat: 'react', only: ['ooh'], ev: [hitE('spike', { team: 1, t: 10 }), hitE('pass', { team: 0, t: 10.6 })] },
  { id: 'setWin sting', cat: 'sting', only: ['setWin'], ev: [{ type: 'set', team: 0, sets: [1, 0] }] },
  { id: 'setLose sting', cat: 'sting', only: ['setLose'], ev: [{ type: 'set', team: 1, sets: [0, 1] }] },
  { id: 'matchWin sting', cat: 'sting', only: ['matchWin'], ev: [{ type: 'match', team: 0 }] },
  { id: 'matchLose sting', cat: 'sting', only: ['matchLose'], ev: [{ type: 'match', team: 1 }] },
  { id: 'perfect glint', cat: 'glint', only: ['perfect'], ev: [hitE('pass', { human: true, grade: 'perfect' })] },
  { id: 'click', cat: 'ui', api: A => A.click() }, { id: 'ui back', cat: 'ui', api: A => A.ui('back') },
  { id: 'ui start', cat: 'ui', api: A => A.ui('start') }, { id: 'hover', cat: 'uiSoft', api: A => A.hover() },
  { id: 'switch tick', cat: 'uiSoft', ev: [{ type: 'switch', auto: false }] },
  { id: 'claps + drum (home serve)', cat: 'chant', update: 'serve', only: ['palmas', 'bombo'] },
  { id: 'heartbeat (match point)', cat: 'chant', update: 'mp', only: ['beat'] },
  { id: 'heartbeat (set point)', cat: 'chantSoft', update: 'sp', only: ['beat'] },
  { id: 'serve clock ticks', cat: 'tick', update: 'clock', only: ['tick'] },
  { id: 'remate perfecto (humano)', cat: 'spike', only: ['spike', 'spikeHero', 'sub', 'perfect'], ev: [hitE('spike', { touch: 3, speed: 20, power: 0.8, human: true, grade: 'perfect' })], info: true },
  { id: 'bloqueo directo (humano)', cat: 'impact', only: ['block', 'blockHero', 'sub'], ev: [{ type: 'block', result: 'stuff', human: true, x: 0.3, y: 1, z: 3, team: 0, player: { x: 0.4, y: 1, z: 0.5, team: 0 } }], info: true },
  { id: 'slam fuerte dentro (22 m/s)', cat: 'impact', only: ['slam', 'slamSub'], g: { lastKind: 'spike' }, ev: [{ type: 'land', x: HOME.x, y: HOME.y, inside: true, team: 0, speed: 22 }], info: true },
  { id: 'crowd bed (rally, 4 hits)', cat: 'bed', update: 'rally', only: ['murmur', 'excite'] },
  { id: 'crowd bed (home serve)', cat: 'bed', update: 'serveCalm', only: ['murmur', 'excite'], info: true },
  { id: 'crowd bed (long rally, set point)', cat: 'bed', update: 'hot', only: ['murmur', 'excite'], info: true },
  { id: 'challenge: bocina', cat: 'horn', only: ['horn'], ev: [{ type: 'challenge', team: 0, x: 4, y: 4.4 }] },
  { id: 'challenge: murmullo de la revisión', cat: 'reviewBed', update: 'review', only: ['murmur', 'excite'] },
  { id: 'challenge: se anula (a favor local)', cat: 'reactBig', only: ['roar', 'applause', 'bombo'], ev: [{ type: 'challengeResult', team: 0, overturned: true, dist: -0.02, truthIn: false, calledIn: true, x: 4, y: 4.4, left: [2, 2] }] },
  // sim (B2): al anular, el punto corregido se pita en el mismo frame que challengeResult; sin doble reacción sigue en -18
  { id: 'challenge: punto corregido + resultado', cat: 'reactBig', only: ['roar', 'applause', 'bombo', 'groan', 'ooh'], ev: [{ type: 'point', team: 0, reason: 'in', how: 'kill', rallyHits: 4, lastKind: 'spike', highlight: 0.35 }, { type: 'challengeResult', team: 0, overturned: true, dist: 0.02, truthIn: true, calledIn: false, x: 4, y: 4.4, left: [2, 2] }] },
  { id: 'challenge: se anula (en contra)', cat: 'reactBig', only: ['groan', 'applause'], ev: [{ type: 'challengeResult', team: 1, overturned: true, dist: 0.01, truthIn: true, calledIn: false, x: -4, y: 4.4, left: [2, 2] }] },
  { id: 'challenge: se mantiene (local)', cat: 'react', only: ['groan', 'applause'], ev: [{ type: 'challengeResult', team: 0, overturned: false, dist: 0.04, truthIn: true, calledIn: true, x: 4, y: 4.4, left: [1, 2] }] },
  { id: 'challenge: se mantiene (CPU)', cat: 'react', only: ['roar', 'applause'], ev: [{ type: 'challengeResult', team: 1, overturned: false, dist: -0.04, truthIn: false, calledIn: false, x: -4, y: 4.4, left: [2, 1] }] },
  { id: 'crowd bed (set-point serve, HP)', cat: 'bed', update: 'sp', only: ['murmur', 'excite'], info: true },
  // sprint cartoon
  { id: 'cartoon: bonk de la recepción', cat: 'toon', only: ['toonPop'], ev: [hitE('pass')] },
  { id: 'cartoon: pip de la colocación', cat: 'toon', only: ['toonPop'], ev: [hitE('set', { touch: 2 })], info: true },
  { id: 'cartoon: zas del remate', cat: 'toonHit', only: ['toonWhack'], ev: [hitE('spike', { touch: 3, speed: 16, power: 0.5 })] },
  { id: 'cartoon: zumbido del remate fuerte', cat: 'toonZip', only: ['toonZip'], ev: [hitE('spike', { touch: 3, speed: 24, power: 0.9 })] },
  { id: 'cartoon: muelle del bloqueo (toque)', cat: 'toonBoing', only: ['boing'], ev: [{ type: 'block', result: 'soft', x: 0.3, y: 1, z: 3, team: 1, player: { x: -0.4, y: 1, z: 0.5, team: 1 } }] },
  { id: 'cartoon: muelle de la red', cat: 'toonBoing', only: ['boing'], ev: [{ type: 'net', x: 0, y: 1, z: 2.2, tape: false }] },
  { id: 'cartoon: ¡PAM! del remate perfecto', cat: 'stinger', only: ['pamSting'], ev: [hitE('spike', { touch: 3, speed: 20, power: 0.8, human: true, grade: 'perfect' })] },
  { id: 'cartoon: remate perfecto entero', cat: 'spike', only: ['spike', 'spikeHero', 'sub', 'perfect', 'toonWhack', 'toonZip', 'pamSting'], ev: [hitE('spike', { touch: 3, speed: 20, power: 0.8, human: true, grade: 'perfect' })], info: true },
  // sprints 2-4 (T6): ui('tab'|'panelIn'|'panelOut'|'beat'|'rank'|'unlock'|'medal')
  { id: 's234: pestaña', cat: 'uiTab', only: ['optSel'], api: A => A.ui('tab') },
  { id: 's234: abrir panel', cat: 'uiTab', only: ['whoosh'], api: A => A.ui('panelIn') },
  { id: 's234: cerrar panel', cat: 'uiTab', only: ['whoosh'], api: A => A.ui('panelOut') },
  { id: 's234: beat de la previa (B)', cat: 'uiBeat', only: ['cntLock', 'slamSub'], api: A => A.ui('beat', 1) },
  { id: 's234: beat de la previa (C)', cat: 'uiBeat', only: ['cntLock', 'slamSub'], api: A => A.ui('beat', 2) },
  { id: 's234: clasificación sube', cat: 'uiRank', only: ['stepUp', 'perfect'], api: A => A.ui('rank', 1) },
  { id: 's234: clasificación baja', cat: 'uiRank', only: ['stepDown'], api: A => A.ui('rank', -1) },
  { id: 's234: desbloqueo', cat: 'uiRank', only: ['optSel', 'perfect'], api: A => A.ui('unlock') },
  { id: 's234: medalla de oro (hoja)', cat: 'sting', only: ['setWin'], api: A => A.ui('medal', 3), info: true },
  { id: 's234: medalla de plata (hoja)', cat: 'mvp', only: ['mvpWin'], api: A => A.ui('medal', 2), info: true },
  { id: 's234: medalla de bronce (hoja)', cat: 'uiLock', only: ['cntLock'], api: A => A.ui('medal', 1), info: true },
  // ambiente de Carrera (P2): eventos amb:* (sin amb:start: calor 0, local = equipo 0)
  { id: 'ambiente: pitada', cat: 'react', only: ['boo'], ev: [{ type: 'amb:boo', amb: true, target: 'ref', by: 0, k: 0.6, dur: 2.5 }] },
  { id: 'ambiente: silbidos al saque rival', cat: 'ambWhistles', only: ['whistleStorm'], ev: [{ type: 'amb:whistles', amb: true, team: 1, k: 0.7 }] },
  { id: 'ambiente: cántico «¡Va-mos!»', cat: 'chant', only: ['chantVamos'], ev: [{ type: 'amb:chant', amb: true, team: 0, kind: 'vamos', k: 0.8, dur: 2.4 }] },
  { id: 'ambiente: cántico «¡O-é!»', cat: 'chant', only: ['chantOe'], ev: [{ type: 'amb:chant', amb: true, team: 0, kind: 'oe', k: 0.8, dur: 2.4 }] },
  { id: 'ambiente: cántico «¡De-fen-sa!»', cat: 'chant', only: ['chantDefensa'], ev: [{ type: 'amb:chant', amb: true, team: 0, kind: 'defensa', k: 0.8, dur: 2.4 }] },
  { id: 'ambiente: palmas 3+2', cat: 'chant', only: ['palmas32'], ev: [{ type: 'amb:chant', amb: true, team: 0, kind: 'palmas', k: 0.8, dur: 2.1 }] },
  { id: 'ambiente: campanita de megafonía', cat: 'pa', only: ['paChime'], ev: [{ type: 'amb:say', amb: true, who: 'speaker', name: 'Megafonía', team: -1, pid: -1, text: '¡Arriba!', dur: 2, pri: 1 }] },
  { id: 'ambiente: pitido de tarjeta', cat: 'whistle', only: ['cardWhistle'], ev: [{ type: 'amb:card', amb: true, team: 1, pid: -1, color: 'yellow', reason: 'protesta' }] },
  { id: 'ambiente: punto del local fuera de casa (grada rival)', cat: 'react', only: ['roar'], ev: [{ type: 'amb:start', amb: true, home: 1, heat: 0.4, fans: [0.15, 0.55] }, { type: 'point', team: 1, reason: 'in', how: 'kill', rallyHits: 4, lastKind: 'spike', highlight: 0.35 }], info: true },
  // xaranga (21-nov-2026): partido Difícil (fuera de la Carrera solo suena en Difícil y Experto)
  { id: 'xaranga: pasacalles (racha local)', cat: 'xarPasa', only: ['xarPasa'], g: { difficulty: 'hard', mode: 'point' }, ev: [{ type: 'point', team: 0, reason: 'in', how: 'kill', rallyHits: 4, lastKind: 'spike', highlight: 0.45, streak: 3, hold: 2.4 }] },
  { id: 'xaranga: redoble (punto de set)', cat: 'xarRed', only: ['xarRedoble'], g: { difficulty: 'hard', mode: 'serve' }, ev: [{ type: 'serveReady', team: 0, player: P0, setPoint: 0, matchPoint: -1 }] },
  { id: 'xaranga: desafinada (saque rival fallado)', cat: 'xarDes', only: ['xarDesafina'], g: { difficulty: 'hard', mode: 'point' }, ev: [{ type: 'point', team: 0, reason: 'out', how: 'error', rallyHits: 1, lastKind: 'serve', highlight: 0.15, streak: 1 }] },
  { id: 'xaranga: ensayo 1 (afinando)', cat: 'xarEns', only: ['xarEns1'], api: A => A._xarPlay('xarEns1', 0.55, 0.7) },
  { id: 'xaranga: ensayo 2 (desde el principio)', cat: 'xarEns', only: ['xarEns2'], api: A => A._xarPlay('xarEns2', 0.55, 0.7) },
  { id: 'xaranga: ensayo 3 (bombo y caja)', cat: 'xarEns', only: ['xarEns3'], api: A => A._xarPlay('xarEns3', 0.55, 0.7) }
];
/** Xaranga: encola sus 6 piezas (los ensayos del menú también, aunque XAR_WHEN.menu esté apagado). */
function xarPrepAll(A) { if (!A.xarPrep) return; const w = A.XAR_WHEN, m0 = w.menu; w.menu = true; A.xarPrep(); w.menu = m0; }
function seeded(seed) { let s = seed >>> 0 || 1; return function () { s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; }; }

async function mixReport(file) {
  const { VB, root } = loadAudio(file); const A = VB.Audio;
  const mock = makeMock();
  root.AudioContext = mock.Ctx;
  root.requestIdleCallback = fn => setImmediate(() => fn({ timeRemaining: () => 50, didTimeout: false }));
  root.setTimeout = setTimeout; root.clearTimeout = clearTimeout;
  const vctx = { camera: { position: { x: CAM.x, y: 4, z: -CAM.y } }, state: 'playing', timeScale: 1, settings: {} };
  const realRandom = Math.random;
  A.init(vctx); if (A.ambPrep) A.ambPrep(); xarPrepAll(A); A.onGameStart({ demo: false }); A.onState('playing');   // (ambiente y xaranga: sus sonidos también)
  A.unlock();
  for (let i = 0; i < 20000 && (A.ready() < 1); i++) await new Promise(r => setImmediate(r));
  const ctx = mock.started.length ? mock.started[0].src.context : null;
  const AC = ctx || null;
  // find the context instance through a started source or the destination
  let C = AC; if (!C) { A.click(); C = mock.started[mock.started.length - 1].src.context; }
  const rows = [];
  for (const sc of SCEN) {
    const tries = sc.tries || 6, energies = [], bal = []; let pk = 0;
    let n0 = 0;
    for (let k = 0; k < tries; k++) {
      Math.random = seeded(1000 + k * 77 + sc.id.length);
      A.onGameStart({ demo: false });
      C.currentTime += 20; // past every anti-repeat gap and voice slot
      const mark = mock.started.length;
      const g = Object.assign({ mode: 'rally', players: [], rally: { t: 3, hits: 3 }, serving: 0, matchPoint: -1, setPoint: -1, lastKind: 'pass' }, sc.g || {});
      if (sc.api) sc.api(A, C, vctx);
      else if (sc.ev) A.handle(sc.ev.map(e => Object.assign({}, e)), g);
      if (sc.update) {
        // continuous-state scenarios: drive update() like the game loop
        const dt = 1 / 60, gs = { players: [], rally: { t: 0, hits: 0 }, matchPoint: -1, setPoint: -1, serving: 0, mode: 'rally' };
        if (sc.update === 'rally') { gs.mode = 'rally'; gs.rally = { t: 4, hits: 4 }; }
        if (sc.update === 'hot') { gs.mode = 'rally'; gs.rally = { t: 12, hits: 12 }; gs.setPoint = 0; }
        if (sc.update === 'serveCalm') { gs.mode = 'serve'; gs.serving = 0; }
        if (sc.update === 'review') { gs.mode = 'point'; gs.review = { team: 0, t: 2.25, dur: 4.5, x: 4, y: 4.4, dist: 0.02, truthIn: true, calledIn: false, overturned: true }; }
        if (sc.update === 'serve' || sc.update === 'mp' || sc.update === 'sp') {
          gs.mode = 'serve'; gs.serving = 0;
          A.handle([{ type: 'serveReady', team: 0, player: P0, setPoint: sc.update === 'sp' ? 0 : -1, matchPoint: sc.update === 'mp' ? 0 : -1 }], gs);
        }
        if (sc.update === 'clock') { serveClockRun(A, C, { team: 0 }); }
        else for (let f = 0; f < 600; f++) { A.update(gs, dt); C.currentTime += dt; }
      }
      const news = mock.started.slice(mark);
      const isBed = sc.cat === 'bed' || sc.cat === 'reviewBed';
      const pick = isBed ? mock.started.filter(s => s.src.loop && sc.only.includes(nameOfBuf(A, s.src.buffer))) : news.filter(s => !s.cancelled && (!sc.only || sc.only.includes(nameOfBuf(A, s.src.buffer))));
      n0 += pick.length;
      if (!pick.length) continue;
      // mix the picked sources on one timeline
      let t0 = Math.min.apply(null, pick.map(s => s.when)), len = 0;
      const rs = pick.map(s => { const r = renderSource(s, Biq); if (r) len = Math.max(len, Math.round((s.when - t0) * r.sr) + r.L.length); return { s, r }; }).filter(o => o.r);
      if (!rs.length) continue;
      const sr = rs[0].r.sr, L = new Float32Array(len), R = new Float32Array(len);
      for (const o of rs) { const off = isBed ? 0 : Math.round((o.s.when - t0) * sr); for (let i = 0; i < o.r.L.length && off + i < len; i++) { L[off + i] += o.r.L[i]; R[off + i] += o.r.R[i]; } }
      const lu = (isBed || len / sr >= 1.2 && sc.cat !== 'spike') ? M.integrated([L, R], sr) : M.momentaryMax([L, R], sr);
      energies.push(Math.pow(10, (lu + 0.691) / 10)); pk = Math.max(pk, M.peak([L, R]));
      bal.push(M.integrated([L], sr) - M.integrated([R], sr));
      if (isBed) break;
    }
    Math.random = realRandom;
    const lu = energies.length ? M.LU(energies.reduce((a, c) => a + c, 0) / energies.length) : -120;
    const tgt = PLAN[sc.cat].target;
    rows.push({ id: sc.id, cat: sc.cat, target: tgt, lufs: r1(lu), delta: r1(lu - tgt), pass: Math.abs(lu - tgt) <= 1.5 || !!sc.info, info: !!sc.info,
      peak: r1(M.db(pk)), balance: bal.length ? r1(bal.filter(isFinite).reduce((a, c) => a + c, 0) / bal.length) : 0, voices: n0 / (sc.cat === 'bed' || sc.cat === 'reviewBed' ? 1 : (sc.tries || 6)) });
  }
  return rows;
}
/** Drives one serve wait like the game loop (60 fps; game time = real time): referee whistle at 0.7 s, then the 8 s clock
 *  runs down while the server is 'ready'. o = {team, tossAt (clock value at which the server tosses; null = never → 8 s fault),
 *  forceClock (run the clock for a CPU server too, to prove the engine checks the team), autopilot, opts}.
 *  Returns the times at which the clock passed 3, 2 and 1. */
function serveClockRun(A, C, o) {
  const dt = 1 / 60, P = { x: 9.5, y: 0, z: 0, team: o.team, lastAction: '' };
  const gs = { mode: 'serve', serving: o.team, serveState: 'ready', serveAuth: false, server: P, serveClock: 8, opts: o.opts || {}, autopilot: !!o.autopilot,
    demo: false, players: [], rally: { t: 0, hits: 0 }, matchPoint: -1, setPoint: -1, lastKind: '' };
  A.handle([{ type: 'serveReady', team: o.team, player: P, setPoint: -1, matchPoint: -1 }], gs);
  let t = 0, paused = 0, pausedOnce = false; const cross = [], ev = [];
  for (let f = 0; f < 60 * 14; f++) {
    ev.length = 0;
    if (paused > 0) { // o.pauseAt: the player pauses when the clock reaches that value (o.pauseFor s); the sim stops
      paused -= dt; if (paused <= 0) { o.vc.state = 'playing'; A.onState('playing'); }
      A.update(gs, dt); C.currentTime += dt; continue;
    }
    if (o.pauseAt != null && !pausedOnce && gs.serveClock <= o.pauseAt) { pausedOnce = true; paused = o.pauseFor || 2; o.vc.state = 'paused'; A.onState('paused'); A.update(gs, dt); C.currentTime += dt; continue; }
    if (gs.mode === 'serve') {
      if (!gs.serveAuth && t >= 0.7) { gs.serveAuth = true; ev.push({ type: 'whistle', reason: 'serve' }); }
      else if (gs.serveAuth && gs.serveState === 'ready' && (o.team === 0 || o.forceClock)) {
        const prev = gs.serveClock; gs.serveClock = Math.max(0, gs.serveClock - dt);
        for (let n = 3; n >= 1; n--) if (prev > n && gs.serveClock <= n) cross.push(C.currentTime + (gs.serveClock - n)); // when the clock passed n (game = real)
        if (o.tossAt != null && gs.serveClock <= o.tossAt) { gs.serveState = 'toss'; ev.push({ type: 'toss', player: P, team: o.team, jump: false, human: o.team === 0 }); }
        else if (gs.serveClock <= 0) { gs.mode = 'point'; ev.push({ type: 'whistle', reason: 'point' }, { type: 'point', team: 1 - o.team, reason: 'serve', how: 'error', rallyHits: 0, text: 'Falta de saque: 8 segundos' }); }
      }
    }
    if (ev.length) A.handle(ev.map(e => Object.assign({ t: t }, e)), gs);
    A.update(gs, dt); C.currentTime += dt; t += dt;
  }
  return { gs, cross };
}
/** Engine on the mock context with the bank built (shared by the feature report). */
async function mockEngine(file) {
  const { VB, root } = loadAudio(file); const A = VB.Audio, mock = makeMock();
  root.AudioContext = mock.Ctx;
  root.requestIdleCallback = fn => setImmediate(() => fn({ timeRemaining: () => 50, didTimeout: false }));
  root.setTimeout = setTimeout; root.clearTimeout = clearTimeout;
  const vctx = { camera: { position: { x: CAM.x, y: 4, z: -CAM.y } }, state: 'playing', timeScale: 1, settings: {} };
  A.init(vctx); if (A.ambPrep) A.ambPrep(); xarPrepAll(A); A.onGameStart({ demo: false }); A.onState('playing'); A.unlock();
  for (let i = 0; i < 20000 && (A.ready() < 1); i++) await new Promise(r => setImmediate(r));
  const C = mock.started[0].src.context; // the iOS unlock buffer started inside unlock()
  return { A, C, mock, vctx };
}
/** Mixes started records on one timeline (through the recorded graph). */
function mixRecords(recs) {
  if (!recs.length) return null;
  const t0 = Math.min.apply(null, recs.map(s => s.when)); let len = 0;
  const rs = recs.map(s => { const r = renderSource(s, Biq); if (r) len = Math.max(len, Math.round((s.when - t0) * r.sr) + r.L.length); return { s, r }; }).filter(o => o.r);
  if (!rs.length) return null;
  const sr = rs[0].r.sr, L = new Float32Array(len), R = new Float32Array(len);
  for (const o of rs) { const off = Math.round((o.s.when - t0) * sr); for (let i = 0; i < o.r.L.length && off + i < len; i++) { L[off + i] += o.r.L[i]; R[off + i] += o.r.R[i]; } }
  return { L, R, sr, t0 };
}
/** Short-term loudness of the first `win` s (K-weighted mean square of both channels, BS.1770 channel sum). */
function stLoud(m, win) {
  const W = Math.round(win * m.sr), n = Math.min(m.L.length, W); let p = 0;
  for (const x of [M.kWeight(m.L, m.sr), M.kWeight(m.R, m.sr)]) { let a = 0; for (let i = 0; i < n; i++) a += x[i] * x[i]; p += a / W; }
  return M.LU(p);
}

/* ====================================================================
 * Part 2b: new-feature scenarios (polish wave 1)
 *  AUD-01  perfect-spike / stuff-block sweetener: short-term loudness in the 150 ms after contact, perfect vs good
 *          (same power, speed and position: only the grade differs), true peak of the perfect mix; kill landing layer.
 *  AUD-02  set-point heartbeat vs match point; the beat stops at the toss (pending beats cancelled).
 *  AUD-03  serve clock: ticks before an 8 s fault, none when the human serves at 3.5 s, none for a CPU server.
 * ==================================================================== */
async function featureReport(file) {
  const { A, C, mock, vctx: VC } = await mockEngine(file);
  const res = [], ok = (id, pass, info, val) => res.push({ id, pass: !!pass, info: info || '', val });
  const realRandom = Math.random;
  /** Mean short-term (150 ms) loudness and worst true peak of an event over N tries (same random seeds for every case). */
  function pairOf(evs, names, g, tries) {
    const en = []; let tp = 0;
    for (let k = 0; k < (tries || 12); k++) {
      Math.random = seeded(4242 + k * 131);
      A.onGameStart({ demo: false }); C.currentTime += 20;
      const mark = mock.started.length;
      A.handle(evs.map(e => Object.assign({}, e)), Object.assign({ mode: 'rally', players: [], rally: { t: 3, hits: 3 }, serving: 0, matchPoint: -1, setPoint: -1, lastKind: 'pass' }, g || {}));
      const m = mixRecords(mock.started.slice(mark).filter(s => !s.cancelled && names.includes(nameOfBuf(A, s.src.buffer))));
      if (!m) continue;
      en.push(Math.pow(10, (stLoud(m, 0.15) + 0.691) / 10)); tp = Math.max(tp, M.truePeak([m.L, m.R]));
    }
    Math.random = realRandom;
    return { st: en.length ? M.LU(en.reduce((a, c) => a + c, 0) / en.length) : -120, tp: M.db(tp) };
  }
  const SP = { touch: 3, speed: 20, power: 0.8, human: true };
  // pre-compressor small-signal model (like every other mix-plan number); peaks are judged in part 3 (real chain)
  const good = pairOf([hitE('spike', Object.assign({ grade: 'good' }, SP))], ['spike', 'spikeHero', 'sub', 'perfect']);
  const perf = pairOf([hitE('spike', Object.assign({ grade: 'perfect' }, SP))], ['spike', 'spikeHero', 'sub', 'perfect']);
  // info: the hero path's gain IS the compressor bypass, which this small-signal model does not see; the gate is part 3
  ok('AUD-01 remate perfecto vs bueno, pre-compressor model (info; gate = output, part 3)', true, 'good ' + r1(good.st) + ' / perfect ' + r1(perf.st) + ' LUFS → +' + r1(perf.st - good.st) + ' LU (pre-comp TP ' + r1(good.tp) + ' / ' + r1(perf.tp) + ' dBTP; output peaks: part 3)', r1(perf.st - good.st));
  const BL = { type: 'block', result: 'stuff', x: 0.3, y: 1, z: 3, team: 0, player: { x: 0.4, y: 1, z: 0.5, team: 0 } };
  const bc = pairOf([Object.assign({ human: false }, BL)], ['block', 'blockHero', 'net', 'sub']), bh = pairOf([Object.assign({ human: true }, BL)], ['block', 'blockHero', 'net', 'sub']);
  ok('AUD-01 bloqueo directo humano vs CPU (info: its gain is the compressor bypass, part 3)', true, 'cpu ' + r1(bc.st) + ' / human ' + r1(bh.st) + ' → +' + r1(bh.st - bc.st) + ' LU', r1(bh.st - bc.st));
  const JS = { touch: 0, speed: 20, power: 0.8, human: true, shot: 'jump', x: 9.5 };
  const jg = pairOf([hitE('serve', Object.assign({ grade: 'good' }, JS))], ['spike', 'spikeHero', 'sub', 'perfect']), jp = pairOf([hitE('serve', Object.assign({ grade: 'perfect' }, JS))], ['spike', 'spikeHero', 'sub', 'perfect']);
  const jd = jp.st - jg.st;
  ok('AUD-01 saque en salto perfecto, pre-compressor model (info; gate = output, part 3)', true, 'good ' + r1(jg.st) + ' / perfect ' + r1(jp.st) + ' → +' + r1(jd) + ' LU', r1(jd));
  const LD = sp => ({ type: 'land', x: HOME.x, y: HOME.y, inside: true, team: 0, speed: sp });
  const s13 = pairOf([LD(13)], ['slam', 'slamSub'], { lastKind: 'spike' }), s17 = pairOf([LD(17.5)], ['slam', 'slamSub'], { lastKind: 'spike' }), s22 = pairOf([LD(22)], ['slam', 'slamSub'], { lastKind: 'spike' });
  const s22n = pairOf([LD(22)], ['slam', 'slamSub'], { lastKind: 'free' }), s22o = pairOf([Object.assign(LD(22), { inside: false })], ['slam', 'slamSub'], { lastKind: 'spike' });
  ok('AUD-01 remate al suelo: capa de tarima que crece con la velocidad', s22.st > s17.st && s17.st > s13.st && s22.st - s22n.st >= 1 && Math.abs(s22o.st - s22n.st) < 0.3,
    '13 m/s ' + r1(s13.st) + ' · 17.5 ' + r1(s17.st) + ' · 22 ' + r1(s22.st) + ' LUFS (capa +' + r1(s22.st - s22n.st) + ' LU; fuera +' + r1(s22o.st - s22n.st) + '), TP ' + r1(s22.tp) + ' dBTP');

  // AUD-02: heartbeat at set point vs match point; stops at the toss
  function beatRun(mp, sp, tossAt) {
    A.onGameStart({ demo: false }); C.currentTime += 20;
    const mark = mock.started.length, dt = 1 / 60, P = { x: 9.5, y: 0, z: 0, team: 0 };
    const gs = { mode: 'serve', serving: 0, serveState: 'ready', players: [], rally: { t: 0, hits: 0 }, matchPoint: mp, setPoint: sp, server: P, serveAuth: true, serveClock: 8, opts: { serveClock: false } };
    A.handle([{ type: 'serveReady', team: 0, player: P, setPoint: sp, matchPoint: mp }], gs);
    let tossT = 1e9;
    for (let f = 0; f < 600; f++) {
      if (tossAt != null && f === Math.round(tossAt * 60)) { tossT = C.currentTime; gs.serveState = 'toss'; A.handle([{ type: 'toss', player: P, team: 0, jump: false }], gs); }
      A.update(gs, dt); C.currentTime += dt;
    }
    const beats = mock.started.slice(mark).filter(s => nameOfBuf(A, s.src.buffer) === 'beat');
    const live = beats.filter(s => !s.cancelled);
    return { beats, live, tossT, m: mixRecords(live) };
  }
  const bmp = beatRun(0, -1, null), bsp = beatRun(-1, 0, null), bboth = beatRun(0, 0, null);
  const lum = r => r.m ? M.integrated([r.m.L, r.m.R], r.m.sr) : -120;
  const lubs = r => r.live.filter(s => Math.abs(s.src.playbackRate.value - 1) < 0.01).map(s => s.when);
  const per = a => a.length > 1 ? (a[a.length - 1] - a[0]) / (a.length - 1) : 0;
  ok('AUD-02 latido en punto de set: presente y >= 3 LU bajo el de partido', bsp.live.length >= 8 && lum(bmp) - lum(bsp) >= 3,
    'partido ' + r1(lum(bmp)) + ' / set ' + r1(lum(bsp)) + ' LUFS (−' + r1(lum(bmp) - lum(bsp)) + ' LU); periodo ' + per(lubs(bmp)).toFixed(2) + ' / ' + per(lubs(bsp)).toFixed(2) + ' s', r1(lum(bmp) - lum(bsp)));
  ok('AUD-02 punto de set y de partido a la vez → latido de partido', Math.abs(lum(bboth) - lum(bmp)) < 0.2, r1(lum(bboth)) + ' LUFS');
  { // a long pause during a match-point serve must not release a burst of beats on resume
    A.onGameStart({ demo: false }); C.currentTime += 20;
    const mark = mock.started.length, dt = 1 / 60, P = { x: 9.5, y: 0, z: 0, team: 0 };
    const gs = { mode: 'serve', serving: 0, serveState: 'ready', players: [], rally: { t: 0, hits: 0 }, matchPoint: 0, setPoint: -1, server: P, serveAuth: true, serveClock: 8, opts: { serveClock: false } };
    A.handle([{ type: 'serveReady', team: 0, player: P, setPoint: -1, matchPoint: 0 }], gs);
    for (let f = 0; f < 60; f++) { A.update(gs, dt); C.currentTime += dt; }
    VC.state = 'paused'; A.onState('paused'); for (let f = 0; f < 180; f++) { A.update(gs, dt); C.currentTime += dt; }
    VC.state = 'playing'; A.onState('playing'); const tr = C.currentTime;
    for (let f = 0; f < 60; f++) { A.update(gs, dt); C.currentTime += dt; }
    const burst = mock.started.slice(mark).filter(s => !s.cancelled && nameOfBuf(A, s.src.buffer) === 'beat' && s.when >= tr && s.when < tr + 0.6).length;
    ok('AUD-02 tras una pausa larga el latido sigue a su ritmo (sin ráfaga)', burst <= 2, burst + ' golpes en los 0,6 s tras reanudar (antes del arreglo: 8)');
  }
  const tsp = beatRun(-1, 0, 1.45), tmp = beatRun(0, -1, 1.45);
  const after = r => r.live.filter(s => s.when > r.tossT + 0.003).length, cancelled = r => r.beats.filter(s => s.cancelled).length;
  ok('AUD-02 el latido para al lanzar (también el ya programado)', after(tsp) === 0 && after(tmp) === 0 && tsp.live.length > 0,
    'tras lanzar: set ' + after(tsp) + ', partido ' + after(tmp) + ' (cancelados ' + cancelled(tsp) + ' / ' + cancelled(tmp) + '); antes: ' + tsp.live.length + ' / ' + tmp.live.length);

  // AUD-03: serve clock ticks
  function clockRun(o) {
    A.onGameStart({ demo: false }); C.currentTime += 20;
    const mark = mock.started.length, r = serveClockRun(A, C, o);
    const ticks = mock.started.slice(mark).filter(s => nameOfBuf(A, s.src.buffer) === 'tick');
    return { live: ticks.filter(s => !s.cancelled), all: ticks, cross: r.cross };
  }
  const fault = clockRun({ team: 0 }), early = clockRun({ team: 0, tossAt: 3.5 }), late = clockRun({ team: 0, tossAt: 2.5 }), edge = clockRun({ team: 0, tossAt: 3.025 });
  const pz = clockRun({ team: 0, pauseAt: 2.04, pauseFor: 2, vc: VC }); // pauses one frame after the tick for 2 s was scheduled (lead 33 ms)
  ok('AUD-03 pausa con un toc programado: no suena en pausa y se repite al volver', pz.live.length === 3 && pz.all.length === 4 && pz.live.every((s, i) => i === 0 || s.when - pz.live[i - 1].when > 0.9),
    pz.all.length + ' programados, ' + pz.live.length + ' suenan, separados ' + pz.live.slice(1).map((s, i) => r2(s.when - pz.live[i].when) + ' s').join(' / '));
  const cpu = clockRun({ team: 1, forceClock: true }), auto = clockRun({ team: 0, autopilot: true }), off = clockRun({ team: 0, opts: { serveClock: false } });
  const err = fault.live.map((s, i) => Math.abs(s.when - (fault.cross[i] == null ? 1e9 : fault.cross[i]))), last = fault.live[2];
  ok('AUD-03 reloj de saque: 3 toc antes de la falta de 8 s, a tiempo', fault.live.length === 3 && Math.max.apply(null, err) < 0.002 && last && last.src.playbackRate.value > 1.1,
    fault.live.length + ' toc a ' + fault.live.map(s => r2(3 - (s.when - fault.live[0].when)) + ' s').join(', ') + ' (error máx. ' + (Math.max.apply(null, err) * 1000).toFixed(1) + ' ms; último ×' + (last ? last.src.playbackRate.value.toFixed(2) : '-') + ')');
  ok('AUD-03 saca a 3,5 s: 0 toc', early.live.length === 0, early.live.length + ' toc');
  ok('AUD-03 saca a 2,5 s: solo el del 3', late.live.length === 1, late.live.length + ' toc');
  ok('AUD-03 saca a 3,02 s: el toc ya programado se cancela', edge.live.length === 0, edge.all.length + ' programados, ' + edge.live.length + ' suenan');
  ok('AUD-03 nunca para CPU / autopilot / sin regla de 8 s', cpu.live.length === 0 && auto.live.length === 0 && off.live.length === 0, 'cpu ' + cpu.live.length + ', autopilot ' + auto.live.length + ', serveClock:false ' + off.live.length);
  // AUD-04 (mock side): a real slow-motion (match point, 0.28 for 1.9 s) still drops the pitch of new sounds once it has
  // lasted SLOW_HOLD (0.2 s); a 70 ms freeze never does
  {
    const E = await mockEngine(file), A2 = E.A, C2 = E.C, m2 = E.mock, vc = E.vctx;
    const g = { mode: 'rally', players: [], rally: { t: 3, hits: 3 }, serving: 0, matchPoint: -1, setPoint: -1 };
    const rateAt = (ts, secs) => {
      vc.timeScale = 1; for (let f = 0; f < 30; f++) { A2.update(g, 1 / 60); C2.currentTime += 1 / 60; }
      vc.timeScale = ts; for (let f = 0; f < Math.round(secs * 60); f++) { A2.update(g, 1 / 60); C2.currentTime += 1 / 60; }
      Math.random = () => 0.5; const mark = m2.started.length;
      A2.handle([hitE('pass')], g); Math.random = realRandom;
      const r = m2.started.slice(mark).find(s => nameOfBuf(A2, s.src.buffer) === 'pass');
      vc.timeScale = 1; return r ? r.src.playbackRate.value : NaN;
    };
    const r0 = rateAt(0, 0.07), r1s = rateAt(0.25, 0.22), rSlow = rateAt(0.28, 0.4), rLongFreeze = rateAt(0, 0.5);
    ok('AUD-04 hit-stop no cambia el tono; la cámara lenta sí (tras 0,25 s)', Math.abs(r0 - 1) < 0.08 && Math.abs(r1s - 1) < 0.08 && rSlow < 0.7 && Math.abs(rLongFreeze - 1) < 0.08,
      'rate after 0 x 70 ms ' + r0.toFixed(2) + ', 0.25 x 220 ms ' + r1s.toFixed(2) + ', slow-mo 0.28 x 0.4 s ' + rSlow.toFixed(2) + ', freeze 0 x 0.5 s ' + rLongFreeze.toFixed(2));
  }

  // sprint cartoon: which layers sound for which event, the switches, and the «¡PAM!» dedupe with an fx event
  {
    const TOONS = ['toonPop', 'toonWhack', 'toonZip', 'boing', 'pamSting', 'perfect'];
    const names = (evs, o) => {
      o = o || {}; A.onGameStart({ demo: !!o.demo }); C.currentTime += 20; VC.settings = o.settings || {};
      const mark = mock.started.length;
      for (const step of evs) { if (step.dt) C.currentTime += step.dt; A.handle([Object.assign({}, step.e)], { mode: 'rally', players: [], rally: { t: 3, hits: 3 }, serving: 0, matchPoint: -1, setPoint: -1, lastKind: 'pass' }); }
      VC.settings = {};
      const out = mock.started.slice(mark).filter(s => !s.cancelled).map(s => nameOfBuf(A, s.src.buffer)).filter(n => TOONS.includes(n));
      return out.sort().join(',');
    };
    const PS = hitE('spike', { touch: 3, speed: 20, power: 0.8, human: true, grade: 'perfect' }), GS = hitE('spike', { touch: 3, speed: 16, power: 0.5 });
    const HS = hitE('spike', { touch: 3, speed: 24, power: 0.9 }), TIP = hitE('free', { touch: 3, shot: 'tip', human: true, grade: 'perfect' });
    const SOFT = { type: 'block', result: 'soft', x: 0.3, y: 1, z: 3, team: 1, player: { x: -0.4, y: 1, z: 0.5, team: 1 } };
    const r = {
      pass: names([{ e: hitE('pass') }]), set: names([{ e: hitE('set', { touch: 2 }) }]), spike: names([{ e: GS }]), hard: names([{ e: HS }]),
      perf: names([{ e: PS }]), tip: names([{ e: TIP }]), soft: names([{ e: SOFT }]), net: names([{ e: { type: 'net', x: 0, y: 1, z: 2.2 } }]),
      perfFx: names([{ e: PS }, { e: { type: 'fx:onoma', team: 0, x: HOME.x, y: HOME.y, z: 3 }, dt: 0.1 }]),
      fxOnly: names([{ e: { type: 'fx:pam', team: 0, x: HOME.x, y: HOME.y, z: 3 } }]),
      fxCpu: names([{ e: { type: 'fx:onoma', team: 1, x: -HOME.x, y: HOME.y, z: 3 } }]),
      perfLater: names([{ e: PS }, { e: PS, dt: 1.5 }]),
      off: names([{ e: PS }, { e: SOFT }, { e: hitE('pass') }], { settings: { toonSfx: false } }),
      noOnoma: names([{ e: PS }], { settings: { onoma: false } }),
      demo: names([{ e: PS }], { demo: true })
    };
    A.setToon(false); const api = names([{ e: HS }, { e: SOFT }]); A.setToon(true);
    const pass = r.pass === 'toonPop' && r.set === 'toonPop' && r.spike === 'toonWhack' && r.hard === 'toonWhack,toonZip' &&
      r.perf === 'pamSting,toonWhack,toonZip' && r.tip === 'perfect,toonPop' && r.soft === 'boing' && r.net === 'boing' &&
      r.perfFx === 'pamSting,toonWhack,toonZip' && r.fxOnly === 'pamSting' && r.fxCpu === '' && r.perfLater === 'pamSting,pamSting,toonWhack,toonWhack,toonZip,toonZip' &&
      r.off === 'perfect' && api === '' && r.noOnoma === 'perfect,toonWhack,toonZip' && r.demo === 'toonWhack,toonZip';
    ok('cartoon: capas por evento, interruptores y «¡PAM!» sin repetir', pass, Object.keys(r).map(k => k + '[' + r[k] + ']').join(' ') + ' setToon(false)[' + api + ']');
  }
  return res;
}
/* ====================================================================
 * Part 2c: polish wave 2 (mock context)
 *  AUD-05  'celebración': high five + encouragement claps of the other team IN THE SAME FRAME, a second clap, a fist bump
 *          and a chest bump → exactly one sound each, the right sound, all through the voice-strip pool (no gain/panner
 *          node created per contact); 12 contacts in one frame → still 12 sounds (pool overflow falls back to play()).
 *          'ritual de saque': 3 dribbles of a CPU server and 3 of a human server → 3 + 3 dribble sounds; a dribble sits
 *          ≥ 3 LU under a rally bounce and over a dead-ball bounce (mix plan).
 *  AUD-06  presentation: newMatch + sting('intro') in one frame → the welcome roar never sounds, sting + swell do; the bed
 *          ducks ≥ 6 dB under the card and comes back after ui('introEnd'); the first serve whistle releases it; a skip fades
 *          the swell; timeout. Wipe: one sound per wipe (anti-repeat 0.25 s).
 *  AUD-07  30 real home points (sim, autopilot, Normal; distinct highlights across the range) rendered through the mix
 *          model: crowd-reaction loudness over 5 s vs highlight, Spearman ≥ 0.8. Away points: info.
 * ==================================================================== */
/** Point events from the real sim (node, pure). Returns plain objects (no player refs). */
function realPoints(seeds, mins) {
  const VBs = {}, g = Object.create(globalThis); g.VB = VBs;
  for (const f of ['js/sim.js', 'js/ai.js']) new Function('window', 'globalThis', 'document', fs.readFileSync(path.join(ROOT, f), 'utf8')).call(g, undefined, g, undefined);
  const S = VBs.Sim, out = [], ev = [], input = { move: [0, 0], hit: false, jump: false, switchPlayer: false };
  const K = ['team', 'reason', 'how', 'rallyHits', 'highlight', 'digs', 'streak', 'savedSetPoint', 'setWon', 'matchWon', 'hold', 'lastKind', 'sideout'];
  for (const seed of seeds) {
    const gm = S.createGame({ autopilot: true, seed, difficulty: 'normal', present: true });
    for (let i = 0; i < mins * 60 * 120 && !gm.finished; i++) {
      S.step(gm, 1 / 120, input); ev.length = 0; S.drainEvents(gm, ev);
      for (const e of ev) if (e.type === 'point') { const o = { type: 'point', seed }; for (const k of K) if (e[k] !== undefined) o[k] = e[k]; out.push(o); }
    }
  }
  return out;
}
/** 30 points with distinct highlights spread over the range (deterministic: sorted by highlight, evenly spaced picks). */
function spreadPick(pts, n) {
  const by = new Map(); for (const p of pts) { const k = Math.round(p.highlight * 100); if (!by.has(k)) by.set(k, p); }
  const uniq = [...by.values()].sort((a, b) => a.highlight - b.highlight);
  const src = uniq.length >= n ? uniq : pts.slice().sort((a, b) => a.highlight - b.highlight);
  const out = []; for (let i = 0; i < n; i++) out.push(src[Math.round(i * (src.length - 1) / Math.max(1, n - 1))]);
  return out;
}
function spearman(x, y) {
  const rank = a => { const idx = a.map((v, i) => [v, i]).sort((p, q) => p[0] - q[0]), r = new Array(a.length); for (let i = 0; i < idx.length;) { let j = i; while (j + 1 < idx.length && idx[j + 1][0] === idx[i][0]) j++; for (let k = i; k <= j; k++) r[idx[k][1]] = (i + j) / 2 + 1; i = j + 1; } return r; };
  const rx = rank(x), ry = rank(y), n = x.length, mx = rx.reduce((a, c) => a + c, 0) / n, my = ry.reduce((a, c) => a + c, 0) / n;
  let sxy = 0, sxx = 0, syy = 0; for (let i = 0; i < n; i++) { sxy += (rx[i] - mx) * (ry[i] - my); sxx += (rx[i] - mx) ** 2; syy += (ry[i] - my) ** 2; }
  return sxy / Math.sqrt(sxx * syy);
}
const REACT = ['roar', 'applause', 'ooh', 'groan', 'palmas', 'bombo'];
let PTS_CACHE = null;
function reactionPoints() {
  if (PTS_CACHE) return PTS_CACHE;
  const all = realPoints([3, 7, 11, 19, 23, 31], 14);
  const home = all.filter(p => p.team === 0 && !p.matchWon), away = all.filter(p => p.team === 1 && !p.matchWon);
  PTS_CACHE = { all, home: spreadPick(home, 30), away: spreadPick(away, 30) };
  return PTS_CACHE;
}
async function wave2Report(file, mixRows) {
  const res = [], ok = (id, pass, info, val) => res.push({ id, pass: !!pass, info: info || '', val });
  const realRandom = Math.random;
  const G = () => ({ mode: 'point', players: [], rally: { t: 3, hits: 3, digs: 0 }, serving: 0, matchPoint: -1, setPoint: -1, lastKind: 'pass' });
  // ---------- AUD-05 celebración
  {
    const { A, C, mock } = await mockEngine(file);
    let gains = 0, pans = 0; const og = C.createGain.bind(C), op = C.createStereoPanner.bind(C);
    A.onGameStart({ demo: false }); C.currentTime += 20;
    C.createGain = function () { gains++; return og(); }; C.createStereoPanner = function () { pans++; return op(); };
    const mark = mock.started.length, st0 = Object.assign({}, A.stats), g = G();
    const FX = (type, team, x, y, s) => ({ type: 'fx:' + type, team, x, y, z: 1.6, strength: s, t: 0 });
    const seq = [[0, [FX('highfive', 0, 5.2, 1.1, 1), FX('clap', 1, -4.6, -0.8, 0.6)]], [0.3, [FX('clap', 1, -4.6, -0.8, 0.6)]], [0.9, [FX('fistbump', 0, 5.0, 1.3, 0.55)]], [1.5, [FX('chestbump', 0, 5.1, 1.2, 1)]]];
    let tt = 0; for (const [at, evs] of seq) { while (tt < at - 1e-9) { A.update(g, 1 / 60); C.currentTime += 1 / 60; tt += 1 / 60; } A.handle(evs, g); }
    const got = mock.started.slice(mark).filter(s => !s.cancelled).map(s => nameOfBuf(A, s.src.buffer));
    const want = ['slap', 'handclap', 'handclap', 'fist', 'chest'], st = A.stats;
    ok('AUD-05 celebración: un sonido por contacto (choque + palmada en el mismo frame)', JSON.stringify(got) === JSON.stringify(want) && st.fxIn - st0.fxIn === 5 && st.fxOut - st0.fxOut === 5,
      'sonidos ' + got.join(', ') + ' · fxIn ' + (st.fxIn - st0.fxIn) + ' fxOut ' + (st.fxOut - st0.fxOut));
    ok('AUD-05 celebración: por el pool de tiras (0 nodos de ganancia/paneo por contacto)', gains === 0 && pans === 0 && st.pooled - st0.pooled === 5,
      'createGain ' + gains + ', createStereoPanner ' + pans + ', por el pool ' + (st.pooled - st0.pooled) + ' de 5');
    // flood: 12 contacts in one frame (more than the 8 strips) → 12 sounds
    C.currentTime += 5; const m2 = mock.started.length, f0 = st.fxOut, pf0 = st.poolFull, many = [];
    for (let k = 0; k < 12; k++) many.push(FX(k % 3 === 0 ? 'clap' : 'highfive', k & 1, 4 - k * 0.3, k * 0.2 - 1, 0.8));
    A.handle(many, g);
    const n2 = mock.started.slice(m2).filter(s => !s.cancelled).length;
    ok('AUD-05 12 contactos en un frame → 12 sonidos (el pool desborda a play())', n2 === 12 && st.fxOut - f0 === 12, n2 + ' sonidos, pool lleno ' + (st.poolFull - pf0) + ' veces');
    C.createGain = og; C.createStereoPanner = op;
    // pool strips free again once every contact has rung out; voices back to 0
    for (let f = 0; f < 120; f++) { A.update(g, 1 / 60); C.currentTime += 1 / 60; }
    const dbg = A._debug();
    ok('AUD-05 sin fugas: tiras libres y 0 voces al acabar', dbg.poolFree === dbg.pool && dbg.pool === 8 && dbg.voices === 0, 'tiras libres ' + dbg.poolFree + '/' + dbg.pool + ', voces ' + dbg.voices + ', máx. ' + st.voicesMax);
  }
  // ---------- AUD-05 ritual de saque
  {
    const { A, C, mock } = await mockEngine(file);
    A.onGameStart({ demo: false }); C.currentTime += 20;
    const g = G(); g.mode = 'serve'; const mark = mock.started.length, s0 = A.stats.dribOut;
    const run = (team, x) => { const P = { x, y: 1, z: 0, team }; A.handle([{ type: 'serveReady', team, player: P, setPoint: -1, matchPoint: -1 }], g);
      for (let k = 0; k < 3; k++) { for (let f = 0; f < 33; f++) { A.update(g, 1 / 60); C.currentTime += 1 / 60; } A.handle([{ type: 'dribble', team, player: P, x: x + (team ? 0.5 : -0.5), y: 1.1 }], g); } };
    run(1, -9.6); C.currentTime += 3; run(0, 9.6);
    const got = mock.started.slice(mark).filter(s => !s.cancelled).map(s => nameOfBuf(A, s.src.buffer)).filter(n => n !== 'palmas' && n !== 'bombo');
    const lv = id => (mixRows.find(r => r.id === id) || {}).lufs;
    const dr = lv('dribble (serve ritual)'), ld = lv('land'), db = lv('dead bounce');
    ok('AUD-05 ritual de saque: 3 + 3 botes → 6 sonidos de bote', got.length === 6 && got.every(n => n === 'dribble') && A.stats.dribOut - s0 === 6 && A.stats.dribIn === 6, got.join(', ') + ' · dribIn ' + A.stats.dribIn + ' dribOut ' + (A.stats.dribOut - s0));
    ok('AUD-05 bote del ritual: ≥ 3 LU bajo un bote de peloteo y por encima de uno muerto', ld - dr >= 3 && dr > db, 'peloteo ' + ld + ' / ritual ' + dr + ' / muerto ' + db + ' LUFS');
  }
  // ---------- AUD-06 presentación y cortinilla
  {
    const { A, C, mock, vctx } = await mockEngine(file);
    A.onGameStart({ demo: false }); C.currentTime += 20;
    const g = G(); g.mode = 'serve';
    const step = s => { for (let f = 0; f < Math.round(s * 60); f++) { A.update(g, 1 / 60); C.currentTime += 1 / 60; } };
    step(1); const bed0 = A._debug().bed;
    let mark = mock.started.length;
    A.handle([{ type: 'newMatch', demo: false }, { type: 'serveReady', team: 0, player: P0, setPoint: -1, matchPoint: -1 }], g); A.sting('intro');
    step(1.5); const bedIn = A._debug().bed;
    const names = () => mock.started.slice(mark).filter(s => !s.cancelled).map(s => nameOfBuf(A, s.src.buffer));
    const n1 = names(), cancelled = mock.started.slice(mark).filter(s => s.cancelled).map(s => nameOfBuf(A, s.src.buffer));
    ok('AUD-06 newMatch + presentación en el mismo frame: sin ovación de bienvenida', n1.includes('introSting') && n1.includes('introSwell') && !n1.includes('roar') && !n1.includes('applause'),
      'suenan ' + n1.join(', ') + ' · canceladas ' + (cancelled.join(', ') || 'ninguna'));
    const duck = 20 * Math.log10(bedIn / bed0);
    A.ui('introEnd'); step(2.5); const bedOut = A._debug().bed;
    ok('AUD-06 lecho de grada agachado bajo la tarjeta y de vuelta tras introEnd', duck <= -6 && Math.abs(20 * Math.log10(bedOut / bed0)) < 0.5 && !A._debug().intro.on,
      'lecho ' + r1(duck) + ' dB bajo la tarjeta, ' + r1(20 * Math.log10(bedOut / bed0)) + ' dB después');
    // presentation BEFORE newMatch (UI calls it on JUGAR): welcome skipped
    C.currentTime += 10; A.onGameStart({ demo: false }); mark = mock.started.length;
    A.sting('intro'); A.handle([{ type: 'newMatch', demo: false }], g); step(1.2);
    const n2 = names();
    // the first serve whistle releases the duck
    A.handle([{ type: 'whistle', reason: 'serve' }], g); const offW = !A._debug().intro.on;
    ok('AUD-06 presentación antes de newMatch: sin bienvenida; el 1.er silbato la suelta', !n2.includes('roar') && n2.includes('introSwell') && offW, 'suenan ' + n2.join(', ') + ' · suelta con el silbato ' + offW);
    // skip fades the swell; timeout
    C.currentTime += 10; A.sting('intro'); step(0.5);
    const swell = mock.started.filter(s => !s.cancelled && nameOfBuf(A, s.src.buffer) === 'introSwell').pop(), gn = swell && swell.src.outs[0];
    const before = gn ? gn.gain.value : -1; A.ui('introSkip'); const after = gn ? gn.gain.value : -1;
    C.currentTime += 10; A.sting('intro'); step(7); const to = !A._debug().intro.on;
    ok('AUD-06 saltar apaga la grada de la presentación; se suelta sola a los 6,5 s', before > 0 && after === 0 && to, 'ganancia ' + r2(before) + ' → ' + after + ', tiempo agotado ' + to);
    // wipe: one sound per wipe
    C.currentTime += 10; mark = mock.started.length;
    A.ui('wipe'); A.ui('wipe'); step(0.1); A.ui('wipe'); step(0.4); A.ui('wipe');
    const nw = names().filter(n => n === 'wipe').length;
    ok('AUD-06 cortinilla: un sonido por cortinilla (anti-repetición 0,25 s)', nw === 2, nw + ' sonidos para 2 cortinillas (4 llamadas)');
    vctx.state = 'playing';
  }
  // ---------- AUD-07 "uuuh" que crece con cada defensa; cántico de racha que enlaza con las palmas del saque
  {
    const { A, C, mock } = await mockEngine(file);
    A.onGameStart({ demo: false }); C.currentTime += 20; Math.random = () => 0.5;
    const g = G(); g.mode = 'rally'; const mark = mock.started.length; let t = 10;
    for (let d = 1; d <= 3; d++) { // three rival spikes, each dug: g.rally.digs as sim.js counts it
      A.handle([hitE('spike', { team: 1, t })], g); C.currentTime += 0.6; t += 0.6; g.rally.digs = d;
      A.handle([hitE('pass', { team: 0, t })], g); C.currentTime += 2; t += 2;
    }
    const oohs = mock.started.slice(mark).filter(s => !s.cancelled && nameOfBuf(A, s.src.buffer) === 'ooh').map(s => s.src.outs[0].gain.value);
    ok('AUD-07 "uuuh" de la grada que crece con cada defensa del peloteo', oohs.length === 3 && oohs[1] > oohs[0] * 1.15 && oohs[2] > oohs[1] * 1.1, 'ganancias ' + oohs.map(r2).join(' → '));
    // home streak of 4, 1.9 s hold, then serveReady for the home server: the claps never stop and never double
    C.currentTime += 10; const m2 = mock.started.length, t0 = C.currentTime;
    A.handle([{ type: 'point', team: 0, reason: 'in', how: 'kill', rallyHits: 3, highlight: 0.35, streak: 4, hold: 1.9 }], g);
    const gs = { mode: 'point', players: [], rally: { t: 0, hits: 0 }, matchPoint: -1, setPoint: -1, serving: 0 };
    for (let f = 0; f < 600; f++) {
      if (f === Math.round(1.9 * 60)) { gs.mode = 'serve'; A.handle([{ type: 'serveReady', team: 0, player: P0, setPoint: -1, matchPoint: -1 }], gs); }
      A.update(gs, 1 / 60); C.currentTime += 1 / 60;
    }
    const pal = mock.started.slice(m2).filter(s => !s.cancelled && nameOfBuf(A, s.src.buffer) === 'palmas').map(s => s.when - t0).sort((a, b) => a - b);
    const gaps = pal.slice(1).map((v, i) => v - pal[i]), maxGap = Math.max(...gaps), minGap = Math.min(...gaps);
    ok('AUD-07 racha: palmas del cántico → palmas del saque sin hueco ni golpe doble', pal.length >= 8 && pal[0] < 1.3 && maxGap <= 0.85 && minGap >= 0.4,
      pal.length + ' palmas desde ' + r2(pal[0]) + ' s, separación ' + r2(minGap) + '–' + r2(maxGap) + ' s (rejilla 0,42; el silencio del 4.º tiempo = 0,84)');
    Math.random = realRandom;
  }
  // ---------- AUD-07 reacción ∝ highlight
  {
    const { A, C, mock } = await mockEngine(file), P = reactionPoints();
    const loud = pts => pts.map((p, k) => {
      Math.random = seeded(9000 + k * 37); A.onGameStart({ demo: false }); C.currentTime += 20;
      const mark = mock.started.length; A.handle([Object.assign({}, p)], G());
      const m = mixRecords(mock.started.slice(mark).filter(s => !s.cancelled && REACT.includes(nameOfBuf(A, s.src.buffer))));
      Math.random = realRandom; return m ? stLoud(m, 5) : -120;
    });
    const lh = loud(P.home), la = loud(P.away), hh = P.home.map(p => p.highlight), ha = P.away.map(p => p.highlight);
    const rho = spearman(hh, lh), rhoA = spearman(ha, la);
    ok('AUD-07 reacción local ∝ highlight: Spearman ≥ 0,8 (30 puntos reales, modelo)', rho >= 0.8,
      'ρ = ' + rho.toFixed(3) + ' · highlight ' + r2(Math.min(...hh)) + '–' + r2(Math.max(...hh)) + ' → ' + r1(Math.min(...lh)) + '…' + r1(Math.max(...lh)) + ' LUFS (5 s)', rho);
    ok('AUD-07 puntos rivales (info: el error local duele más que el acierto rival)', true, 'ρ = ' + rhoA.toFixed(3) + ' · ' + r1(Math.min(...la)) + '…' + r1(Math.max(...la)) + ' LUFS', rhoA);
    res.points = { home: P.home.map((p, i) => [p.highlight, r1(lh[i]), p.how, p.digs | 0, p.streak | 0, !!p.savedSetPoint, !!p.setWon]), n: P.all.length };
  }
  return res;
}
/* Polish wave 3 (AUD-08) in the mock engine: the end-sheet count-up as ui.js runs it (one call per changed frame, rAF stamps) at
 * 30/60/120/144 Hz: ticks ≤ 20 per second, spaced like the numbers (they slow down), the last sound ("clac") exactly on the last frame
 * and nothing after it; MVP sting choice; crowd focus on the sheet; menu arrows / toggles; everything a no-op before the gesture. */
async function wave3Report(file) {
  const res = [], ok = (id, pass, info) => res.push({ id, pass: !!pass, info: info || '' });
  const names = (A, mock, mark) => mock.started.slice(mark).filter(s => !s.cancelled).map(s => ({ n: nameOfBuf(A, s.src.buffer), w: s.when, r: s.src.playbackRate.value }));
  {
    const { A, C, mock, vctx } = await mockEngine(file);
    for (const fps of [60, 30, 120, 144]) {
      A.onGameStart({ demo: false }); C.currentTime += 20; vctx.state = 'over'; A.onState('over');
      const calls = countUpCalls(null, fps), mark = mock.started.length, t0 = C.currentTime;
      runCount(A, C, calls);
      const end = t0 + calls[calls.length - 1][0], got = names(A, mock, mark), ticks = got.filter(x => x.n === 'cntTick').map(x => x.w - t0), lock = got.filter(x => x.n === 'cntLock');
      const iv = ticks.slice(1).map((t, i) => t - ticks[i]);
      let win = 0; for (const a of ticks) win = Math.max(win, ticks.filter(b => b >= a && b < a + 1).length);
      const lastAt = Math.max.apply(null, got.map(x => x.w)), frame = 1 / fps;
      const slows = iv.length < 2 || iv[iv.length - 1] >= iv[0] - 1e-6;
      ok('AUD-08 cuenta a ' + fps + ' Hz: tics ≤ 20/s que se frenan; «clac» en el último frame, nada después',
        ticks.length >= 4 && Math.min.apply(null, iv) >= 0.0485 && win <= 20 && slows && lock.length === 1 && Math.abs(lock[0].w - end) < 1e-9 && lastAt <= end + 1e-9 && ticks[ticks.length - 1] < end - t0 + frame,
        ticks.length + ' tics a ' + ticks.map(t => Math.round(t * 1000)).join(' ') + ' ms, clac ' + (lock.length ? Math.round((lock[0].w - t0) * 1000) : '-') + ' ms (fin ' + Math.round((end - t0) * 1000) + '), intervalo mín. ' + Math.round(Math.min.apply(null, iv) * 1000) + ' ms, máx./s ' + win + ', tono ' + got.filter(x => x.n === 'cntTick').map(x => x.r.toFixed(2)).join('→'));
    }
    // a frame that comes 1 ms early does not skip a tick; jittery 60 Hz stamps keep ≤ 20/s
    {
      A.onGameStart({ demo: false }); C.currentTime += 20; vctx.state = 'over'; A.onState('over');
      const calls = countUpCalls(null, 60).map((c, i) => [c[0] + (i % 2 ? -0.001 : 0.0007), c[1]]), mark = mock.started.length, t0 = C.currentTime;
      runCount(A, C, calls);
      const tk = names(A, mock, mark).filter(x => x.n === 'cntTick').map(x => x.w - t0), iv = tk.slice(1).map((t, i) => t - tk[i]);
      ok('AUD-08 cuenta con sellos de rAF con ±1 ms de ruido: mismo ritmo, ≤ 20/s', tk.length >= 5 && Math.min.apply(null, iv) >= 0.045,
        tk.length + ' tics, intervalos ' + iv.map(t => Math.round(t * 1000)).join(' ') + ' ms');
    }
    // crowd focus: ducks while the sheet is up, comes back in the menu
    {
      A.onGameStart({ demo: false }); C.currentTime += 20; vctx.state = 'over'; A.onState('over');
      const g = { mode: 'over', players: [], rally: { t: 0, hits: 0 }, matchPoint: -1, setPoint: -1, serving: 0 };
      for (let f = 0; f < 30; f++) { A.update(g, 1 / 60); C.currentTime += 1 / 60; }
      const before = A._debug().crowd;
      A.ui('mvp', true); A.ui('count', 0.1, C.currentTime * 1000);
      for (let f = 0; f < 30; f++) { A.update(g, 1 / 60); C.currentTime += 1 / 60; }
      const during = A._debug().crowd;
      vctx.state = 'menu'; A.onState('menu');
      for (let f = 0; f < 30; f++) { A.update(g, 1 / 60); C.currentTime += 1 / 60; }
      const menu = A._debug().crowd;
      ok('AUD-08 hoja final: la grada baja 6 dB mientras se ve (≈ -3 dB a la salida) y vuelve en el menú', Math.abs(20 * Math.log10(during / before) + 6) < 0.6 && Math.abs(menu / before - 0.6) < 0.02,
        'grada ' + before.toFixed(3) + ' → ' + during.toFixed(3) + ' (' + (20 * Math.log10(during / before)).toFixed(1) + ' dB) → menú ' + menu.toFixed(3) + ' (×0,6 del menú, como antes)');
    }
    // MVP: explicit win/lose, default = the 'match' event, anti-repeat
    {
      A.onGameStart({ demo: false }); C.currentTime += 20;
      A.handle([{ type: 'match', team: 1 }], { mode: 'over' }); C.currentTime += 5;
      let mark = mock.started.length;
      A.ui('mvp'); const d1 = names(A, mock, mark).map(x => x.n);
      C.currentTime += 0.5; mark = mock.started.length; A.ui('mvp', true); const rep = names(A, mock, mark).length;
      C.currentTime += 5; mark = mock.started.length; A.ui('mvp', true); const w1 = names(A, mock, mark).map(x => x.n);
      ok('AUD-08 MVP: gana → mvpWin, pierde → mvpLose (sin dato: el del evento match); anti-repetición 1,5 s', d1.join() === 'mvpLose' && rep === 0 && w1.join() === 'mvpWin',
        'sin dato tras match CPU: ' + d1.join() + ' · repetido a 0,5 s: ' + rep + ' · gana: ' + w1.join());
    }
    // a lone countEnd (no count) is silent; count(1) + countEnd → one clac
    {
      A.onGameStart({ demo: false }); C.currentTime += 20; let mark = mock.started.length;
      A.ui('countEnd'); const lone = names(A, mock, mark).length;
      mark = mock.started.length; A.ui('count', 0.2, C.currentTime * 1000); C.currentTime += 0.6; A.ui('count', 1, C.currentTime * 1000); A.ui('countEnd');
      const seq = names(A, mock, mark).map(x => x.n);
      ok('AUD-08 «clac» solo al acabar una cuenta, y una sola vez', lone === 0 && seq.join() === 'cntTick,cntLock', 'countEnd suelto: ' + lone + ' · cuenta: ' + seq.join(', '));
    }
    // menus: arrows follow the level, edge, toggles, select, hovers
    {
      A.onGameStart({ demo: false }); C.currentTime += 20; vctx.state = 'menu'; A.onState('menu');
      const one = (fn) => { C.currentTime += 1; const m = mock.started.length; fn(); return names(A, mock, m); };
      const up = [1, 2, 3].map(j => one(() => A.ui('arrow', 1, j, 4))[0]), dn = [2, 1, 0].map(j => one(() => A.ui('arrow', -1, j, 4))[0]);
      const edge = one(() => A.ui('arrowEdge', -1)), on = one(() => A.ui('toggle', true)), off = one(() => A.ui('toggle', false));
      const sel = [0, 1, 2, 3].map(i => one(() => A.ui('select', i, 4))[0]), ah = one(() => { A.ui('arrowHover', -1); A.ui('arrowHover', -1); }), oh = one(() => A.ui('optHover'));
      const rising = a => a.every((x, i) => i === 0 || x.r > a[i - 1].r);
      ok('AUD-08 flechas: paso arriba/abajo con la nota del nivel de destino; tope', up.every(x => x.n === 'stepUp') && dn.every(x => x.n === 'stepDown') && rising(up) && rising(dn.slice().reverse()) && edge.length === 1 && edge[0].n === 'arwEdge',
        'arriba ' + up.map(x => x.r.toFixed(2)).join('→') + ' · abajo ' + dn.map(x => x.r.toFixed(2)).join('→') + ' · tope ' + edge.map(x => x.n).join());
      ok('AUD-08 ajustes: Sí/No distintos, opción sube con el índice, hovers propios (anti-repetición 40 ms)', on.length === 1 && on[0].n === 'tglOn' && off[0].n === 'tglOff' && rising(sel) && sel.every(x => x.n === 'optSel') && ah.length === 1 && ah[0].n === 'arwHover' && oh[0].n === 'optHover',
        'Sí ' + on[0].n + ' · No ' + off[0].n + ' · opción ' + sel.map(x => x.r.toFixed(2)).join('→') + ' · hover flecha ' + ah.length + ' (2 llamadas) · fila ' + oh.map(x => x.n).join());
    }
  }
  // before the first gesture: everything is a silent no-op without errors
  {
    const { VB, root } = loadAudio(file); const A = VB.Audio, mock = makeMock(); root.AudioContext = mock.Ctx;
    let err = '';
    try { A.init({ state: 'over', settings: {} }); A.ui('count', 0.3); A.ui('count', 1); A.ui('countEnd'); A.ui('mvp', true); A.ui('arrow', 1, 2, 4); A.ui('arrowHover', 1); A.ui('arrowEdge', 1); A.ui('toggle', true); A.ui('select', 2, 4); A.ui('optHover'); A.ui('slide', 0.5); A.update(null, 0.016); } catch (e) { err = e.message; }
    ok('AUD-08 API antes del primer gesto: no-op sin error', !err && mock.started.length === 0 && A.contextState() === 'none', 'fuentes ' + mock.started.length + ', contexto ' + A.contextState() + (err ? ', error ' + err : ''));
  }
  return res;
}
function wave3Table(rows) {
  console.log('\n== 2d. Polish wave 3 (AUD-08; mock context) ==');
  let bad = 0;
  for (const r of rows) { console.log(pad(r.id, 82) + (r.pass ? 'OK  ' : 'FAIL') + '  ' + r.info); if (!r.pass) bad++; }
  return bad;
}
/* AUD-09: the mix hierarchy, from the part-2 rows (LUFS at the output). Each rule is a relation between two scenarios that the
 * plan's per-category targets imply but nothing else checks once layers pile up: a new layer may sit on its own target and still
 * end up louder than what it decorates. a/b = scenario ids; the rule passes if lufs(a) - lufs(b) is inside [lo, hi]. */
const HIER = [
  ['serve clock ticks', 'whistle serve', -99, -6, 'serve clock tick ≥ 6 LU under the whistle'],
  ['cuenta de la hoja final (tics)', 'hover', -99, 0, 'count-up ticks never above a menu hover'],
  ['cuenta de la hoja final (tics)', 'MVP (gana el humano)', -99, -8, 'count-up ticks ≥ 8 LU under the MVP sting'],
  ['MVP (gana el humano)', 'matchWin sting', -99, -2, 'MVP sting ≥ 2 LU under the match sting it lands on'],
  ['cuenta: clac final', 'MVP (gana el humano)', -99, -4, 'the clac under the MVP accent'],
  ['cortinilla (wipe)', 'pass', -99, -5, 'wipe ≥ 5 LU under a touch (it plays almost every point)'],
  ['presentación', 'matchWin sting', -99, 0, 'presentation never louder than a match sting'],
  ['high five (celebration)', 'pass', -99, -4, 'celebration contacts ≥ 4 LU under a touch'],
  ['chest bump (match win)', 'pass', -99, -4, 'chest bump ≥ 4 LU under a touch'],
  ['clap (encouragement)', 'high five (celebration)', -99, 0, 'encouragement clap under the high five'],
  ['dribble (serve ritual)', 'land', -99, -3, 'ritual dribble ≥ 3 LU under a rally bounce'],
  ['dribble (serve ritual)', 'dead bounce', 0, 99, 'ritual dribble above a dead-ball bounce'],
  ['heartbeat (set point)', 'heartbeat (match point)', -99, -3, 'set-point heartbeat ≥ 3 LU under the match-point one'],
  ['heartbeat (match point)', 'whistle serve', -99, -4, 'heartbeat ≥ 4 LU under the whistle'],
  ['perfect glint', 'pass', -99, -6, 'perfect glint ≥ 6 LU under the touch it decorates'],
  ['remate perfecto (humano)', 'spike', 1, 6, 'perfect spike (model) 1-6 LU over a good one'],
  ['flecha de dificultad: paso', 'ui start', -1.5, 1.5, 'arrow step at the level of the other menu confirmations'],
  ['ajustes: interruptor a Sí', 'ajustes: interruptor a No', -1.5, 1.5, 'Sí and No equally loud (only the gesture differs)'],
  ['flecha de dificultad: hover', 'hover', -1.5, 1.5, 'arrow hover at the level of the button hover'],
  ['crowd bed (rally, 4 hits)', 'pass', -99, -6, 'crowd bed ≥ 6 LU under a touch'],
  // sprint cartoon: the cartoon layers colour the hit, they never become a second hit; the «¡PAM!» is a reward, not the hit
  ['cartoon: bonk de la recepción', 'pass', -99, -5, 'cartoon bonk ≥ 5 LU under the pass it colours'],
  ['cartoon: pip de la colocación', 'set', -99, -4, 'cartoon pip ≥ 4 LU under the set'],
  ['cartoon: zas del remate', 'spike', -99, -5, 'cartoon whack ≥ 5 LU under the spike'],
  ['cartoon: zumbido del remate fuerte', 'spike', -99, -8, 'speed whizz ≥ 8 LU under the spike'],
  ['cartoon: muelle de la red', 'net', -99, -4, 'net spring ≥ 4 LU under the net rattle'],
  ['cartoon: muelle del bloqueo (toque)', 'block stuff', -99, -6, 'block spring ≥ 6 LU under a stuff block'],
  ['cartoon: ¡PAM! del remate perfecto', 'remate perfecto (humano)', -99, -6, '«¡PAM!» ≥ 6 LU under the perfect spike itself'],
  ['cartoon: ¡PAM! del remate perfecto', 'setWin sting', -99, -3, '«¡PAM!» ≥ 3 LU under a set sting'],
  ['cartoon: ¡PAM! del remate perfecto', 'perfect glint', 3, 99, '«¡PAM!» ≥ 3 LU over the small perfect glint'],
  // xaranga: music of the stand, never above the referee nor a crowd reaction
  ['xaranga: pasacalles (racha local)', 'whistle serve', -99, -6, 'brass band march ≥ 6 LU under the whistle'],
  ['xaranga: desafinada (saque rival fallado)', 'whistle serve', -99, -4, 'out-of-tune trumpet ≥ 4 LU under the whistle'],
  ['xaranga: pasacalles (racha local)', 'crowd bed (home serve)', 0, 99, 'brass band march over the crowd bed between points']
];
function hierReport(mix) {
  const by = {}; for (const r of mix) by[r.id] = r.lufs;
  return HIER.map(h => {
    const a = by[h[0]], b = by[h[1]], d = a - b;
    return { id: h[4], pass: isFinite(d) && d >= h[2] && d <= h[3], info: h[0] + ' ' + r1(a) + ' vs ' + h[1] + ' ' + r1(b) + ' → ' + (d > 0 ? '+' : '') + r1(d) + ' LU' };
  });
}
function hierTable(rows) {
  console.log('\n== 2e. Mix hierarchy (AUD-09: relations between layers, LUFS at the output) ==');
  let bad = 0;
  for (const r of rows) { console.log(pad(r.id, 62) + (r.pass ? 'OK  ' : 'FAIL') + '  ' + r.info); if (!r.pass) bad++; }
  return bad;
}
function wave2Table(rows) {
  console.log('\n== 2c. Polish wave 2 (AUD-05..07; mock context) ==');
  let bad = 0;
  for (const r of rows) { console.log(pad(r.id, 74) + (r.pass ? 'OK  ' : 'FAIL') + '  ' + r.info); if (!r.pass) bad++; }
  if (rows.points) console.log('   AUD-07 home points (highlight → LUFS, how, digs, streak, saved, setWon), from ' + rows.points.n + ' real points:\n   ' +
    rows.points.home.map(p => p[0] + '→' + p[1] + (p[2] ? ' ' + p[2] : '') + (p[3] ? ' d' + p[3] : '') + (p[4] >= 3 ? ' s' + p[4] : '') + (p[5] ? ' SP' : '') + (p[6] ? ' SET' : '')).join(' · '));
  return bad;
}
function featureTable(rows, mixRows) {
  console.log('\n== 2b. Polish wave 1 (AUD-01..03; mock context, same seeds per pair) ==');
  let bad = 0;
  for (const r of rows) { console.log(pad(r.id, 66) + (r.pass ? 'OK  ' : 'FAIL') + '  ' + r.info); if (!r.pass) bad++; }
  const tk = mixRows.find(r => r.id === 'serve clock ticks'), wh = mixRows.find(r => r.id === 'whistle serve');
  if (tk && wh) {
    const pass = wh.lufs - tk.lufs >= 6;
    console.log(pad('AUD-03 toc >= 6 LU bajo el silbato', 66) + (pass ? 'OK  ' : 'FAIL') + '  toc ' + tk.lufs + ' / silbato ' + wh.lufs + ' LUFS (' + r1(wh.lufs - tk.lufs) + ' LU)');
    if (!pass) bad++;
  }
  return bad;
}
/** Identify a buffer by content: synthesise each catalogue sound (cached) and compare a fingerprint. */
const FP = new WeakMap(); let FPT = null;
function fpOf(d) { const n = d.length; return n + ':' + Math.round(d[Math.min(n - 1, 777)] * 1e6) + ':' + Math.round(d[Math.min(n - 1, 5001)] * 1e6); }
function nameOfBuf(A, b) {
  if (!b) return '';
  if (FP.has(b)) return FP.get(b);
  if (!FPT || FPT.A !== A) {
    FPT = { A, map: new Map() };
    for (const name of A.SOUNDS) { if (name === 'ir') continue; for (let v = 0; v < variantsOf(A, name); v++) { const c = A.synth(name, v, MOCK_SR); FPT.map.set(fpOf(c[0]), name); } }
  }
  const nm = FPT.map.get(fpOf(b.getChannelData(0))) || '?';
  FP.set(b, nm); return nm;
}

/* ====================================================================
 * Part 3: full match rendered offline in real Chrome
 * ==================================================================== */
function pageHtml(audioFile) {
  const u = f => require('url').pathToFileURL(f).href;
  return '<!doctype html><meta charset="utf-8"><title>audiotest</title>' +
    ['js/sim.js', 'js/ai.js'].map(f => '<script src="' + u(path.join(ROOT, f)) + '"></script>').join('') +
    '<script src="' + u(audioFile) + '"></script>';
}
/** Runs in the page. opts = {secs, seed, solo:[names]|null, variants:{name:n}} → result (+ base64 PCM of the mix). */
async function PAGE_RUN(opts) {
  const M = (0, eval)('(' + opts.metrics + ')')();
  const SR = 48000, FR = 768, A = VB.Audio;
  // deterministic Math.random for the engine (jitter, variant choice)
  let s = 0x1234567 ^ opts.seed; Math.random = function () { s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; };
  const off = new OfflineAudioContext(2, SR * opts.secs, SR);
  Object.defineProperty(off, 'state', { get: () => 'running', configurable: true });
  // fingerprint table: buffer content -> sound name
  const fp = d => { const n = d.length; return n + ':' + Math.round(d[Math.min(n - 1, 777)] * 1e6) + ':' + Math.round(d[Math.min(n - 1, 5001)] * 1e6); };
  const table = new Map();
  for (const name of A.SOUNDS) { if (name === 'ir') continue; for (let v = 0; v < (opts.variants[name] || 1); v++) table.set(fp(A.synth(name, v, SR)[0]), name); }
  const log = [], cbs = off.createBufferSource.bind(off);
  off.createBufferSource = function () {
    const src = cbs(), st = src.start.bind(src), sp = src.stop.bind(src);
    let rec = null;
    // stop() before the scheduled start = the source never sounds (e.g. the welcome roar cancelled by the presentation)
    src.stop = function (w) { if (rec && off.currentTime < rec.w - 1e-6) rec.cancelled = true; return sp(w); };
    src.start = function (w, o) {
      const nm = src.buffer ? (table.get(fp(src.buffer.getChannelData(0))) || '?') : '?';
      const when = Math.max(off.currentTime, w || 0);
      rec = { nm, w: when, d: src.loop ? 1e9 : src.buffer.duration / src.playbackRate.value }; log.push(rec);
      if (opts.solo && opts.solo.indexOf(nm) < 0) return;
      if (opts.mute && opts.mute.indexOf(nm) >= 0) return;   // everything except these (stems: 'the rest of the mix')
      return st(w || 0, o);
    };
    return src;
  };
  window.AudioContext = function () { return off; };
  const g = VB.Sim.createGame({ autopilot: true, seed: opts.seed, difficulty: 'normal' });
  if (opts.gset) Object.assign(g, opts.gset); // controlled scenes: game fields the engine reads (e.g. lastKind before a 'land')
  const fctx = { state: 'playing', timeScale: 1, camera: { position: { x: 14, y: 4, z: 0 } }, game: g, settings: {} };
  A.init(fctx); A.onGameStart(g); A.onState('playing'); A.unlock();
  const t0 = performance.now();
  while (!(A.ready() >= 1 && A.stats.reverbAt > 0) && performance.now() - t0 < 60000) await new Promise(r => setTimeout(r, 20));
  const genWait = performance.now() - t0;
  const ev = [], input = { move: [0, 0], hit: false, jump: false, switchPlayer: false };
  let acc = 0, frames = 0, points = 0, maxScore = '';
  // polish wave 2: celebration contacts as players.js emits them (PLY-07: high five / low five / fist bump of the scorers ~0.9 s
  // after the point, two encouragement claps of the other pair at 0.55 and 0.85 s; chest bump on the match point) and, while
  // the sim has no serve ritual of its own (SIM-04), two dribbles of each CPU server before its toss. fxq: [{at, e}]
  const fxq = [], syn = { highfive: 0, fistbump: 0, chestbump: 0, clap: 0, dribble: 0, native: 0 }; let fxk = 0;
  function frame() {
    const dt = FR / SR;
    // forced hit-stop / slow-mo (opts.freeze = {t, dur, ts, sim}): ctx.timeScale as camera.js would set it, in the same
    // frame as the injected contact (camera updates before audio); sim: true also stops the simulation like main.js
    const F = opts.freeze, ft = F ? off.currentTime - F.t : -1;
    const fz = F && ft >= -1e-9 && ft < F.dur;
    // ease (CAM-04): after the freeze, timeScale returns from 0.25 to 1 over F.ease s (smoothstep)
    const fe = F && F.ease && ft >= F.dur && ft < F.dur + F.ease ? (u => 0.25 + 0.75 * u * u * (3 - 2 * u))((ft - F.dur) / F.ease) : 1;
    fctx.timeScale = fz ? F.ts : fe;
    if (!opts.nosim && !(fz && opts.freeze.sim)) { acc += dt; while (acc >= 1 / 120) { VB.Sim.step(g, 1 / 120, input); acc -= 1 / 120; } }
    ev.length = 0; VB.Sim.drainEvents(g, ev);
    if (opts.nosim) ev.length = 0; // controlled scene: crowd beds + injected events only (no welcome roar from newMatch)
    const quiet = opts.tail && off.currentTime > opts.secs - opts.tail; // last seconds: no events at all (voices must drain)
    if (quiet) ev.length = 0;
    if (opts.fxSynth && !quiet) {
      const tn = off.currentTime;
      for (const e of ev) {
        if (e.type === 'dribble') syn.native++;
        if (e.type === 'point') {
          const w = e.team, sc = g.players.filter(p => p.team === w), ot = g.players.filter(p => p.team !== w), m = (a, b) => [(a.x + b.x) / 2, (a.y + b.y) / 2];
          const kind = e.matchWon ? 'chestbump' : (fxk++ % 3 === 2 ? 'fistbump' : 'highfive'), mw = m(sc[0], sc[1]);
          fxq.push({ at: tn + 0.9, e: { type: 'fx:' + kind, team: w, x: mw[0], y: mw[1], z: 1.6, strength: kind === 'fistbump' ? 0.55 : (fxk & 1 ? 1 : 0.75) } });
          fxq.push({ at: tn + 0.55, e: { type: 'fx:clap', team: 1 - w, x: ot[0].x, y: ot[0].y, z: 1.2, strength: 0.6 } }, { at: tn + 0.85, e: { type: 'fx:clap', team: 1 - w, x: ot[0].x, y: ot[0].y, z: 1.2, strength: 0.6 } });
        }
        if (e.type === 'serveReady' && e.team === 1 && !syn.native) {
          const P = e.player || g.server; if (P) for (const d of [0.25, 0.8]) fxq.push({ at: tn + d, e: { type: 'dribble', team: 1, x: P.x + 0.45, y: P.y, player: P } });
        }
      }
      for (let k = fxq.length - 1; k >= 0; k--) if (fxq[k].at <= tn) { const x = fxq.splice(k, 1)[0].e; if (x.type === 'dribble' && g.mode !== 'serve') continue; syn[x.type.replace('fx:', '')]++; ev.push(Object.assign({ t: g.time }, x)); }
    }
    if (opts.inject) for (const it of opts.inject) if (!it.done && off.currentTime >= it.t) { it.done = true; for (const e of it.events) ev.push(Object.assign({ t: g.time }, e)); }
    for (const e of ev) if (e.type === 'point') points++;
    // camera behind the controlled player (approximation of camera.js)
    const c = g.ctrl || g.players[0];
    if (opts.cam) { fctx.camera.position.x = opts.cam[0]; fctx.camera.position.z = -opts.cam[1]; } // fixed camera (controlled scenes)
    else if (c) { fctx.camera.position.x = Math.max(9.5, c.x + 7); fctx.camera.position.z = -(c.y * 0.6); }
    A.handle(ev, g);
    // UI calls (after handle, like ui.js): it.args (several arguments) or it.arg; fn '__state' = the game state changes (ctx.state + onState)
    if (opts.api) for (const it of opts.api) if (!it.done && off.currentTime >= it.t - 1e-9) {
      it.done = true;
      if (it.fn === '__state') { fctx.state = it.arg; A.onState(it.arg); } else if (it.fn === '__gset') Object.assign(g, it.arg); else A[it.fn].apply(A, it.args || [it.arg]);
    }
    A.update(g, dt); frames++;
  }
  frame();
  const N = Math.floor(SR * opts.secs / FR) - 1;
  for (let k = 1; k <= N; k++) off.suspend(k * FR / SR).then(() => { frame(); off.resume(); });
  const rs = performance.now();
  const buf = await off.startRendering();
  const renderMs = performance.now() - rs;
  const L = buf.getChannelData(0), R = buf.getChannelData(1), chs = [L, R];
  maxScore = g.score.join('-') + ' sets ' + g.sets.join('-');
  // voices over time (from the log of started sources, beds included)
  const ends = log.filter(o => o.nm !== '?' && !o.cancelled).map(o => [o.w, o.w + o.d]);
  let vmax = 0, vsum = 0, vn = 0;
  for (let t = 0; t < opts.secs; t += 0.05) { let c = 0; for (const e of ends) if (e[0] <= t && e[1] > t) c++; vmax = Math.max(vmax, c); vsum += c; vn++; }
  const st = A.stats, dbg = A._debug ? A._debug() : {};
  const res = { genWait: Math.round(genWait), renderMs: Math.round(renderMs), frames, points, score: maxScore, stats: { played: st.played, skipped: st.skipped, lateDrop: st.lateDrop,
      fxIn: st.fxIn, fxOut: st.fxOut, dribIn: st.dribIn, dribOut: st.dribOut, pooled: st.pooled, poolFull: st.poolFull, voicesMax: st.voicesMax, react: st.react, intro: st.intro, wipe: st.wipe },
    end: { voices: dbg.voices, poolFree: dbg.poolFree, pool: dbg.pool }, syn,
    voicesMax: vmax, voicesAvg: Math.round(vsum / vn * 10) / 10, starts: log.length, log: opts.wantLog ? log.filter(o => o.nm !== '?') : undefined };
  if (opts.analyse) {
    res.I = M.integrated(chs, SR); res.peak = M.peak(chs); res.tp = M.truePeak(chs); res.clip = 0;
    for (const x of chs) for (let i = 0; i < x.length; i++) if (Math.abs(x[i]) >= 0.999) res.clip++;
    res.short = M.shortTerm(chs, SR, 1).map(v => Math.round(v * 10) / 10);
    res.Mmax = M.momentaryMax(chs, SR); res.balance = M.integrated([L], SR) - M.integrated([R], SR);
    res.dc = M.dc(chs);
  }
  if (opts.band) { // whistle-band energies at the given windows
    res.band = opts.band.map(w => M.bandEnergy(chs, SR, w[0], w[1], w[2], w[3]));
  }
  if (opts.pcm) { // full mix as base64 int16 for the WAV
    const i16 = new Int16Array(L.length * 2);
    for (let i = 0; i < L.length; i++) { i16[2 * i] = Math.max(-32768, Math.min(32767, Math.round(L[i] * 32767))); i16[2 * i + 1] = Math.max(-32768, Math.min(32767, Math.round(R[i] * 32767))); }
    const u8 = new Uint8Array(i16.buffer); let bin = '';
    for (let i = 0; i < u8.length; i += 0x8000) bin += String.fromCharCode.apply(null, u8.subarray(i, i + 0x8000));
    res.pcm = btoa(bin);
  }
  return res;
}
async function chromeReport(file, tag) {
  const CDP = require('./cdp.js');
  const html = path.join(OUT, 'mix-' + tag + '.html'); fs.mkdirSync(OUT, { recursive: true });
  fs.writeFileSync(html, pageHtml(file));
  const url = require('url').pathToFileURL(html).href;
  const { VB } = loadAudio(file), variants = {};
  for (const n of VB.Audio.SOUNDS) variants[n] = variantsOf(VB.Audio, n);
  const page = await CDP.open({ size: '640x360', flags: ['--autoplay-policy=no-user-gesture-required'] });
  async function pass(o) {
    await page.send('Page.navigate', { url }); await CDP.sleep(600);
    const js = '(' + PAGE_RUN.toString() + ')(' + JSON.stringify(Object.assign({ secs: SECS, seed: SEED, variants, metrics: METRICS.toString() }, o)) + ')';
    return page.evalJs(js, true);
  }
  try {
    if (has('--w3-only')) return { w3: await chromeWave3(pass) };
    if (has('--sweep-only')) return { sweep: await chromeSweep(pass) };   // quick loop on the 'final de partido' scene
    const full = await pass({ analyse: true, pcm: true, wantLog: true });
    const WH = ['whistle', 'whistleLong', 'whistleEnd'], CR = ['murmur', 'excite', 'roar', 'groan', 'ooh', 'applause', 'palmas', 'bombo'];
    // whistle windows: from 30 ms after the start to the end of the sustained tone; band 2.6-4.2 kHz (both chambers + 2nd partial region)
    const wins = full.log.filter(o => WH.includes(o.nm)).map(o => [o.w + 0.03, o.w + Math.min(o.d - 0.12, 0.9), 2600, 4200]).filter(w => w[1] < SECS);
    const wst = await pass({ solo: WH, band: wins });
    const cst = await pass({ solo: CR, band: wins, analyse: true });
    const nst = await pass({ solo: VB.Audio.SOUNDS.filter(n => !WH.includes(n)), band: wins });
    const mask = wins.map((w, i) => ({ t: r2(w[0]), whistle: r1(10 * Math.log10(wst.band[i] / Math.max(1e-20, cst.band[i]))), others: r1(10 * Math.log10(wst.band[i] / Math.max(1e-20, nst.band[i]))) }));
    const pcm = Buffer.from(full.pcm, 'base64'), i16 = new Int16Array(pcm.buffer, pcm.byteOffset, pcm.length / 2);
    const L = new Float32Array(i16.length / 2), R = new Float32Array(i16.length / 2);
    for (let i = 0; i < L.length; i++) { L[i] = i16[2 * i] / 32767; R[i] = i16[2 * i + 1] / 32767; }
    if (!has('--no-wav')) wav(path.join(OUT, 'match-' + tag + '.wav'), [L, R], 48000);
    const counts = {}; for (const o of full.log) counts[o.nm] = (counts[o.nm] || 0) + 1;
    delete full.pcm; const log = full.log; delete full.log;
    // climax: the loudest moment the game can produce (spike, slam on the floor, final whistle, double roar,
    // applause and the match sting at once) through the real master chain: must not clip
    const P = { x: 6, y: 1, z: 3, team: 0 };
    const climax = await pass({ secs: 8, analyse: true, inject: [
      { t: 0.5, events: [{ type: 'hit', kind: 'spike', x: -2, y: 1, z: 3.2, team: 1, power: 1, speed: 26, player: { x: -2, y: 1, z: 3.2, team: 1 } }] },
      { t: 0.8, events: [{ type: 'block', result: 'tool', x: 0.2, y: 1, z: 3, team: 0, player: P }] },
      { t: 1.1, events: [{ type: 'land', x: 6, y: 1, inside: true, team: 0, speed: 19 }, { type: 'whistle', reason: 'point' },
        { type: 'point', team: 0, reason: 'in', how: 'kill', rallyHits: 10, setWon: true, matchWon: true }, { type: 'match', team: 0 }] }] });
    const extra = await chromeFeatures(pass);
    const w2 = has('--no-w2') ? null : await chromeWave2(pass);
    const w3 = has('--no-w3') ? null : await chromeWave3(pass);
    const sweep = has('--no-sweep') ? null : await chromeSweep(pass);
    return { w2, w3, sweep, climax: { I: climax.I, Mmax: climax.Mmax, peak: climax.peak, tp: climax.tp, clip: climax.clip, short: climax.short }, full, crowd: { I: cst.I, peak: cst.peak }, mask, counts, errors: page.errors.slice(0, 5), whistles: log.filter(o => WH.includes(o.nm)).length, extra };
  } finally { page.close(); }
}

function pcmOf(res) {
  const pcm = Buffer.from(res.pcm, 'base64'), i16 = new Int16Array(pcm.buffer, pcm.byteOffset, pcm.length / 2);
  const L = new Float32Array(i16.length / 2), R = new Float32Array(i16.length / 2);
  for (let i = 0; i < L.length; i++) { L[i] = i16[2 * i] / 32767; R[i] = i16[2 * i + 1] / 32767; }
  return [L, R];
}
/** K-weighted loudness of [t0, t1) of a stereo render (filters warmed up on the 100 ms before). */
function winLoud(chs, sr, t0, t1) {
  const a = Math.round(t0 * sr), b = Math.round(t1 * sr), a0 = Math.max(0, a - 4800); let p = 0;
  for (const c of chs) { const k = M.kWeight(c.subarray(a0, b), sr); let s = 0; for (let i = a - a0; i < k.length; i++) s += k[i] * k[i]; p += s / (b - a); }
  return M.LU(p);
}
/** Discontinuities ("clicks") above an absolute level: |2nd difference| > thr (default -30 dBFS) and > 8x its local RMS
 *  (same shape rule as innerClicks). Returns the times (s) inside [t0, t1). */
function clickTimes(chs, sr, t0, t1, thr) {
  thr = thr || Math.pow(10, -30 / 20); const out = [], W = Math.round(0.005 * sr), a = Math.max(2, Math.round(t0 * sr)), b = Math.round(t1 * sr);
  for (const x of chs) {
    for (let i = a; i < b && i < x.length - 2; i++) {
      const d = Math.abs(x[i + 1] - 2 * x[i] + x[i - 1]); if (d <= thr) continue;
      let e = 0, m = 0; for (let j = Math.max(1, i - W); j < Math.min(x.length - 1, i + W); j++) { if (Math.abs(j - i) <= 2) continue; const dj = x[j + 1] - 2 * x[j] + x[j - 1]; e += dj * dj; m++; }
      if (d > 8 * Math.max(Math.sqrt(e / Math.max(1, m)), 1e-4)) out.push(i / sr);
    }
  }
  return out;
}
/* Polish wave 1 in the real Chrome chain (compressor + soft clipper), controlled scenes: the sim is NOT stepped (crowd
 * beds + the injected events only), so every render is deterministic and two renders can be compared sample by sample.
 *  AUD-01  perfect vs good human spike (and human stuff block): ST loudness 150 ms after contact, true peak of the output.
 *  AUD-04  forced hit-stop on a human spike: timeScale 0 for 70 ms (CAM-04) and the current camera hit-stop (0.3 for 120 ms),
 *          with the sim running and with it frozen as main.js does: difference vs no freeze, clicks > -30 dBFS that the
 *          freeze adds, crowd-bed loudness over the freeze, stats.lateDrop. */
async function chromeFeatures(pass) {
  const T = 2.0, SECS4 = 4, SR = 48000, P0c = { x: 1.2, y: 0.4, z: 3.1, team: 0 };
  const spike = grade => ({ type: 'hit', kind: 'spike', human: true, grade, touch: 3, team: 0, x: 1.2, y: 0.4, z: 3.1, speed: 20, power: 0.8, player: P0c });
  // camera ~6 m behind the spiker, as the third-person rig frames a human attack at the net
  const scene = (events, o) => pass(Object.assign({ secs: SECS4, nosim: true, pcm: true, cam: [7, 0], inject: [{ t: T, events }] }, o || {}));
  const out = {};
  const sg = pcmOf(await scene([spike('good')])), sp = pcmOf(await scene([spike('perfect')]));
  const BLc = h => ({ type: 'block', result: 'stuff', human: h, team: 0, x: 0.3, y: 0.5, z: 3, player: { x: 0.4, y: 0.5, z: 0.5, team: 0 } });
  const bc = pcmOf(await scene([BLc(false)])), bh = pcmOf(await scene([BLc(true)]));
  const jsv = grade => ({ type: 'hit', kind: 'serve', shot: 'jump', human: true, grade, touch: 0, team: 0, x: 9.6, y: 0.5, z: 3.2, speed: 21, power: 0.85, player: { x: 9.6, y: 0.5, z: 3.2, team: 0 } });
  const jg = pcmOf(await scene([jsv('good')], { cam: [14, 0] })), jp = pcmOf(await scene([jsv('perfect')], { cam: [14, 0] }));
  const sl = pcmOf(await scene([{ type: 'land', x: -6, y: 1, inside: true, team: 1, speed: 23 }], { gset: { lastKind: 'spike' }, cam: [4, 0] }));
  out.sweet = { good: winLoud(sg, SR, T, T + 0.15), perfect: winLoud(sp, SR, T, T + 0.15), tpGood: M.db(M.truePeak(sg)), tpPerfect: M.db(M.truePeak(sp)),
    blockCpu: winLoud(bc, SR, T, T + 0.15), blockHuman: winLoud(bh, SR, T, T + 0.15), tpBlock: M.db(M.truePeak(bh)),
    jumpGood: winLoud(jg, SR, T, T + 0.15), jumpPerfect: winLoud(jp, SR, T, T + 0.15), tpJump: M.db(M.truePeak(jp)), tpSlam: M.db(M.truePeak(sl)) };
  if (!has('--no-wav')) { wav(path.join(OUT, 'remate-bueno.wav'), sg, SR); wav(path.join(OUT, 'remate-perfecto.wav'), sp, SR); }
  // AUD-04
  const BED = ['murmur', 'excite'];
  const base = await scene([spike('perfect')]), baseBed = await scene([spike('perfect')], { solo: BED });
  const B = pcmOf(base), BB = pcmOf(baseBed), baseClicks = clickTimes(B, SR, T - 0.05, T + 0.6);
  const cases = [{ id: 'hit-stop 0 x 70 ms (forced)', f: { t: T, dur: 0.07, ts: 0 } }, { id: 'CAM-04 0 x 70 ms + 80 ms ease, sim frozen', f: { t: T, dur: 0.07, ts: 0, ease: 0.08, sim: true } },
    { id: 'CAM-04 API max: 0 x 150 ms + 80 ms ease', f: { t: T, dur: 0.15, ts: 0, ease: 0.08, sim: true } }, { id: 'old camera hit-stop 0.3 x 120 ms', f: { t: T, dur: 0.12, ts: 0.3 } }];
  out.freeze = [];
  for (const c of cases) {
    const r = await scene([spike('perfect')], { freeze: c.f }), rb = await scene([spike('perfect')], { freeze: c.f, solo: BED });
    const X = pcmOf(r), XB = pcmOf(rb);
    let dmax = 0; for (let ch = 0; ch < 2; ch++) for (let i = 0; i < X[ch].length; i++) dmax = Math.max(dmax, Math.abs(X[ch][i] - B[ch][i]));
    const cl = clickTimes(X, SR, T - 0.05, T + 0.6), added = cl.filter(t => !baseClicks.some(u => Math.abs(u - t) < 0.002));
    let bedMax = 0; for (let t = T; t < T + 0.5; t += 0.01) bedMax = Math.max(bedMax, Math.abs(winLoud(XB, SR, t, t + 0.1) - winLoud(BB, SR, t, t + 0.1)));
    out.freeze.push({ id: c.id, diff: M.db(dmax), clicks: added.length, bedDelta: bedMax, lateDrop: r.stats.lateDrop, lateDropBase: base.stats.lateDrop });
  }
  return out;
}

/* Polish wave 2 in the real Chrome chain (compressor + soft clipper).
 *  AUD-06  'cortinilla': crowd beds + ui('wipe') → true peak of the output, loudness of the wipe alone.
 *          'presentación': newMatch + sting('intro') in the same frame, ui('introEnd') 3.2 s later → true peak, the welcome roar
 *          never starts, the bed (solo) ducks under the card and comes back.
 *  AUD-07  the same 30 real home points injected 6.5 s apart (sim not stepped): reaction loudness (solo, 5 s windows) vs
 *          highlight, Spearman; full mix with beds + a maximal point (h 1, 5 digs, streak 4, set point saved, set won) for peaks.
 *  AUD-05  240 s match (real sim, autopilot) with celebration contacts and CPU dribbles as players/sim emit them: every contact
 *          and dribble sounds exactly once, voices drain to 0 and the 8 strips are free after a quiet 6 s tail, no clipping. */
async function chromeWave2(pass) {
  const SR = 48000, out = {}, T = 2.0, BED = ['murmur', 'excite'];
  // AUD-06 cortinilla
  const cw = await pass({ secs: 4, nosim: true, analyse: true, cam: [14, 0], api: [{ t: T, fn: 'ui', arg: 'wipe' }] });
  const cwS = pcmOf(await pass({ secs: 4, nosim: true, pcm: true, solo: ['wipe'], cam: [14, 0], api: [{ t: T, fn: 'ui', arg: 'wipe' }] }));
  out.wipe = { tp: M.db(cw.tp), clip: cw.clip, Mmax: M.momentaryMax(cwS, SR), n: cw.stats.wipe };
  // AUD-06 presentación (secs 9: card 3.2 s, then the bed comes back)
  const IN = { secs: 9, nosim: true, cam: [14, 0], inject: [{ t: T, events: [{ type: 'newMatch', demo: false }] }], api: [{ t: T, fn: 'sting', arg: 'intro' }, { t: T + 3.2, fn: 'ui', arg: 'introEnd' }] };
  const pr = await pass(Object.assign({ analyse: true, pcm: true, wantLog: true }, JSON.parse(JSON.stringify(IN))));
  const prB = pcmOf(await pass(Object.assign({ pcm: true, solo: BED }, JSON.parse(JSON.stringify(IN)))));
  const prM = pcmOf(pr);
  const cnt = n => pr.log.filter(o => o.nm === n && o.w >= T - 0.01 && !o.cancelled).length;
  out.intro = { tp: M.db(pr.tp), clip: pr.clip, I: winLoud(prM, SR, T, T + 3.2), roar: cnt('roar'), applause: cnt('applause'), sting: cnt('introSting'), swell: cnt('introSwell'),
    bedBefore: winLoud(prB, SR, T - 1.6, T - 0.1), bedIn: winLoud(prB, SR, T + 0.9, T + 3.0), bedAfter: winLoud(prB, SR, T + 4.8, T + 6.8) };
  if (!has('--no-wav')) wav(path.join(OUT, 'presentacion.wav'), prM, SR);
  // AUD-07: 30 real home points
  const P = reactionPoints(), GAP = 6.5, T0 = 1;
  const inj = P.home.map((p, k) => ({ t: T0 + k * GAP, events: [Object.assign({}, p)] }));
  const secs7 = T0 + P.home.length * GAP + 1;
  const rs = pcmOf(await pass({ secs: secs7, nosim: true, pcm: true, solo: REACT, cam: [14, 0], inject: JSON.parse(JSON.stringify(inj)) }));
  const lz = P.home.map((p, k) => winLoud(rs, SR, T0 + k * GAP, T0 + k * GAP + 5));
  const maxPt = { type: 'point', team: 0, reason: 'in', how: 'kill', rallyHits: 16, highlight: 1, digs: 5, streak: 4, savedSetPoint: true, setWon: true, hold: 3.4 };
  const full = await pass({ secs: secs7 + GAP, nosim: true, analyse: true, cam: [14, 0], inject: JSON.parse(JSON.stringify(inj)).concat([{ t: secs7, events: [maxPt] }]) });
  out.react = { rho: spearman(P.home.map(p => p.highlight), lz), lo: Math.min(...lz), hi: Math.max(...lz), tp: M.db(full.tp), clip: full.clip, Mmax: full.Mmax, n: lz.length,
    pts: P.home.map((p, k) => [p.highlight, r1(lz[k])]) }; // per point (JSON: --json)
  // AUD-05: 240 s match with contacts and dribbles
  const mt = await pass({ secs: 240, fxSynth: true, tail: 6, analyse: true, wantLog: true });
  const lc = n => mt.log.filter(o => o.nm === n).length;
  out.match240 = { stats: mt.stats, end: mt.end, syn: mt.syn, tp: M.db(mt.tp), clip: mt.clip, I: mt.I, points: mt.points,
    logs: { slap: lc('slap'), fist: lc('fist'), chest: lc('chest'), handclap: lc('handclap'), dribble: lc('dribble') }, renderMs: mt.renderMs };
  return out;
}

/* Polish wave 3 (AUD-08) in the real Chrome chain: 'final de partido'. The loudest end of a match the game can produce, then the end
 * sheet on top of it: match point won at T (final whistle, double roar, ovation, match sting 0.85 s later), chest bump at T+0.9, state
 * 'over' + transition wipe at T+2.5, end sheet at T+2.8 (MVP sting + the 600 ms count-up at 62.5 fps with its rAF stamps).
 *  - true peak ≤ -1 dBTP and no clipped sample over the whole scene;
 *  - the ticks stop when the count-up ends (no tick source starts after the "clac"; the clac on the last count-up frame);
 *  - the crowd yields to the sheet (crowd stem with vs without the end-sheet calls, same scene);
 *  - the sheet is heard: each tick vs everything else in 2.5-6 kHz (30 ms), and the MVP accent vs everything else (info + floor). */
async function chromeWave3(pass) {
  const SR = 48000, T = 1.0, TS = T + 1.8, SECS = 8, out = {};
  const calls = countUpCalls(null, 62.5);
  const endT = TS + calls[calls.length - 1][0];
  const base = [{ t: T + 1.5, fn: '__state', arg: 'over' }, { t: T + 1.5, fn: 'ui', arg: 'wipe' }];
  const sheet = [{ t: TS, fn: 'ui', args: ['mvp', true] }].concat(calls.map(c => ({ t: TS + c[0], fn: 'ui', args: ['count', c[1], (TS + c[0]) * 1000] })));
  const P = { x: 6, y: 1, z: 0, team: 0 };
  const inject = () => [{ t: T, events: [{ type: 'whistle', reason: 'point' }, { type: 'land', x: -6, y: 1, inside: true, team: 1, speed: 19 },
      { type: 'point', team: 0, reason: 'in', how: 'kill', rallyHits: 9, highlight: 0.95, digs: 2, streak: 3, setWon: true, matchWon: true, hold: 3.4 }, { type: 'match', team: 0 }] },
    { t: T + 0.9, events: [{ type: 'fx:chestbump', team: 0, x: P.x, y: P.y, z: 1.4, strength: 1 }] }];
  const scene = (api, o) => pass(Object.assign({ secs: SECS, nosim: true, cam: [14, 0], gset: { lastKind: 'spike' }, inject: inject(), api: JSON.parse(JSON.stringify(api)) }, o || {}));
  const full = await scene(base.concat(sheet), { analyse: true, pcm: true, wantLog: true });
  const F = pcmOf(full);
  const UIS = ['cntTick', 'cntLock', 'mvpWin', 'mvpLose'], CR = ['murmur', 'excite', 'roar', 'groan', 'ooh', 'applause', 'palmas', 'bombo'];
  const tk = pcmOf(await scene(base.concat(sheet), { pcm: true, solo: ['cntTick'] }));
  const notTk = pcmOf(await scene(base.concat(sheet), { pcm: true, solo: null, mute: ['cntTick'] }));
  const mv = pcmOf(await scene(base.concat(sheet), { pcm: true, solo: ['mvpWin'] }));
  const notMv = pcmOf(await scene(base.concat(sheet), { pcm: true, mute: ['mvpWin'] }));
  const crW = pcmOf(await scene(base.concat(sheet), { pcm: true, solo: CR }));
  const crN = pcmOf(await scene(base, { pcm: true, solo: CR }));
  const L = full.log.filter(o => !o.cancelled), ticks = L.filter(o => o.nm === 'cntTick').map(o => o.w), lock = L.filter(o => o.nm === 'cntLock').map(o => o.w);
  // the tick's band (4-10 kHz: its partials 5.2 / 7.8 kHz and the 9 kHz click; the crowd is low-passed at 1.5-6.5 kHz)
  const bandDb = (a, b, t0, t1) => 10 * Math.log10(M.bandEnergy(a, SR, t0, t1, 4000, 10000) / Math.max(1e-20, M.bandEnergy(b, SR, t0, t1, 4000, 10000)));
  // 24 ms Hann window centred 4 ms after the onset (bandEnergy windows with a Hann: a window starting at the onset would hide the tick)
  const tickVs = ticks.map(t => bandDb(tk, notTk, t - 0.008, t + 0.016));
  const ms = pcmOf(await scene(base.concat(sheet), { pcm: true, solo: ['matchWin'] }));
  const med = a => a.slice().sort((x, y) => x - y)[a.length >> 1];
  out.diag = { vsCrowd: med(ticks.map(t => bandDb(tk, crW, t - 0.008, t + 0.016))), vsSting: med(ticks.map(t => bandDb(tk, ms, t, t + 0.03))), vsMvp: med(ticks.map(t => bandDb(tk, mv, t, t + 0.03))) };
  const accent = TS + 0.6;
  out.final = { tp: M.db(full.tp), clip: full.clip, I: winLoud(F, SR, T, SECS - 0.2), sheetI: winLoud(F, SR, TS, TS + 1.6),
    ticks: ticks.length, lock: lock.length, lockAt: lock.length ? lock[0] - TS : -1, endAt: endT - TS, lastTick: ticks.length ? Math.max.apply(null, ticks) - TS : -1,
    afterEnd: L.filter(o => o.nm === 'cntTick' && o.w > endT + 1e-6).length, mvp: L.filter(o => o.nm === 'mvpWin').length,
    tickVsMin: Math.min.apply(null, tickVs), tickVsMed: tickVs.slice().sort((a, b) => a - b)[tickVs.length >> 1],
    mvpVs: winLoud(mv, SR, accent, accent + 0.4) - winLoud(notMv, SR, accent, accent + 0.4),
    crowdDelta: winLoud(crW, SR, TS + 0.8, TS + 2.6) - winLoud(crN, SR, TS + 0.8, TS + 2.6),
    crowdBefore: winLoud(crW, SR, TS - 0.6, TS - 0.05) - winLoud(crN, SR, TS - 0.6, TS - 0.05) };
  if (!has('--no-wav')) wav(path.join(OUT, 'final-de-partido.wav'), F, SR);
  return out;
}

/* AUD-09: every event / API scenario of the mix plan (part 2) through the REAL Chrome master chain (compressor + clipper), over the
 * crowd beds, one after the other (4.5 s apart) in a single render, with the camera at the plan's ~8 m and again at ~3 m (the
 * player's own touches): the true peak of each window must stay ≤ -1 dBTP and no sample may clip. The plan's model only sees
 * small-signal loudness; this is where a layer that pumps the compressor or overshoots the clipper would show. The continuous-state
 * scenarios (claps, heartbeat, clock ticks, beds) are covered by the 60 s match render. */
const SWEEP_GAP = 4.5;
function sweepPlan() {
  const items = [], inject = [], api = []; let t = 1;
  for (const sc of SCEN) {
    if (sc.update) continue;
    const rec = [], Cp = { currentTime: 0 };
    if (sc.g) api.push({ t: t - 0.05, fn: '__gset', arg: sc.g });
    if (sc.ev) inject.push({ t, events: sc.ev.map(e => JSON.parse(JSON.stringify(e))) });
    if (sc.api) {
      const Ap = new Proxy({}, { get: (o, fn) => (...args) => { rec.push({ t: t + Cp.currentTime, fn, args }); return true; } });
      sc.api(Ap, Cp); for (const r of rec) api.push(r);
    }
    if (sc.g) api.push({ t: t + 0.5, fn: '__gset', arg: { lastKind: 'pass' } });
    items.push({ id: sc.id, t }); t += SWEEP_GAP;
  }
  return { items, inject, api, secs: t + 0.5 };
}
async function chromeSweep(pass) {
  const SR = 48000, P = sweepPlan(), out = [];
  for (const cam of [[CAM.x, CAM.y], [HOME.x + 3, HOME.y]]) {
    const r = await pass({ secs: P.secs, nosim: true, pcm: true, cam, inject: JSON.parse(JSON.stringify(P.inject)), api: JSON.parse(JSON.stringify(P.api)) });
    const X = pcmOf(r);
    for (const it of P.items) {
      const a = Math.round((it.t - 0.05) * SR), b = Math.min(X[0].length, Math.round((it.t + SWEEP_GAP - 0.05) * SR));
      const sl = X.map(c => c.subarray(a, b));
      let clip = 0; for (const c of sl) for (let i = 0; i < c.length; i++) if (Math.abs(c[i]) >= 0.999) clip++;
      out.push({ id: it.id, cam: Math.round(Math.hypot(cam[0] - HOME.x, cam[1] - HOME.y)), tp: M.db(M.truePeak(sl)), clip, Mmax: M.momentaryMax(sl, SR) });
    }
  }
  return out;
}

/* ====================================================================
 * Report
 * ==================================================================== */
function pad(s, n) { s = String(s); return s.length >= n ? s : s + ' '.repeat(n - s.length); }
function lpad(s, n) { s = String(s); return s.length >= n ? s : ' '.repeat(n - s.length) + s; }
function synthTable(rows) {
  console.log('\n== 1. Synth (48 kHz context; one row per variant 0, worst case across variants for flags) ==');
  console.log(pad('sound', 12) + lpad('sr', 6) + lpad('dur', 6) + lpad('peak', 7) + lpad('TP dB', 7) + lpad('RMS dB', 8) + lpad('Mmax', 7) + lpad('I', 7) + lpad('cent', 7) + lpad('HF%', 6) + lpad('LF%', 6) + lpad('phone', 7) + lpad('edge', 8) + lpad('DC', 9) + '  flags');
  const by = {};
  for (const r of rows) (by[r.name] = by[r.name] || []).push(r);
  let bad = 0;
  for (const n of Object.keys(by)) {
    const a = by[n], r = a[0];
    const flags = [];
    if (a.some(x => x.nan)) flags.push('NaN');
    if (a.some(x => x.peak > 1)) flags.push('PEAK>1');
    if (a.some(x => (x.loop ? x.seam > 0.2 : x.edge > 0.01))) flags.push(r.loop ? 'LOOP-SEAM' : 'EDGE-CLICK');
    if (a.some(x => x.dc > 0.01)) flags.push('DC');
    const ck = a.reduce((m, x) => (x.clickWorst > m.clickWorst ? x : m), a[0]);
    if (!CLICK_GRAINS.includes(n) && a.some(x => x.click > 0)) flags.push('CLICK@' + ck.clickAt.toFixed(3) + 's x' + ck.clickWorst.toFixed(1));
    if (flags.length) bad++;
    const tpw = Math.max.apply(null, a.map(x => x.tp));
    console.log(pad(n, 12) + lpad(r.sr, 6) + lpad(r.dur, 6) + lpad(r2(r.peak), 7) + lpad(r1(M.db(tpw)), 7) + lpad(r1(M.db(r.rms)), 8) + lpad(r1(r.Mmax), 7) + lpad(r.I == null ? '-' : r1(r.I), 7) +
      lpad(r.centroid, 7) + lpad(r1(r.hf * 100), 6) + lpad(r1(r.lf * 100), 6) + lpad('-' + r1(r.phone), 7) + lpad(r.edge.toExponential(0), 8) + lpad(r.dc.toExponential(0), 9) + '  ' + flags.join(' '));
  }
  return bad;
}
function mixTable(rows, before) {
  console.log('\n== 2. Mix plan (LUFS at the output, small-signal: makeup included, no gain reduction; target ±1.5 LU) ==');
  const bm = {}; if (before) for (const r of before) bm[r.id] = r;
  console.log(pad('scenario', 34) + pad('category', 9) + lpad('target', 7) + (before ? lpad('before', 8) : '') + lpad('LUFS', 7) + lpad('Δ', 6) + lpad('peak', 7) + lpad('L-R', 6) + '  ok');
  let bad = 0;
  for (const r of rows) {
    if (!r.pass) bad++;
    console.log(pad(r.id, 34) + pad(r.cat, 9) + lpad(r.target, 7) + (before ? lpad(bm[r.id] ? bm[r.id].lufs : '-', 8) : '') + lpad(r.lufs, 7) + lpad((r.delta > 0 ? '+' : '') + r.delta, 6) + lpad(r.peak, 7) + lpad(r.balance, 6) + '  ' + (r.info ? 'info' : r.pass ? 'OK' : 'MISS'));
  }
  return bad;
}
function chromeTable(c, before) {
  let bad = 0;
  console.log('\n== 3. Match mix in Chrome (' + SECS + ' s, seed ' + SEED + ', OfflineAudioContext 48 kHz, master compressor included) ==');
  const f = c.full, b = before && before.full;
  const row = (k, v, bv) => console.log(pad(k, 30) + (before ? lpad(bv, 14) : '') + lpad(v, 14));
  if (before) row('', 'after', 'before');
  row('integrated loudness (LUFS)', r1(f.I), b && r1(b.I));
  row('momentary max (LUFS)', r1(f.Mmax), b && r1(b.Mmax));
  row('sample peak (dBFS)', r1(M.db(f.peak)), b && r1(M.db(b.peak)));
  row('true peak (dBTP)', r1(M.db(f.tp)), b && r1(M.db(b.tp)));
  row('samples ≥ 0.999', f.clip, b && b.clip);
  row('L-R balance (LU)', r2(f.balance), b && r2(b.balance));
  row('crowd stem integrated', r1(c.crowd.I), before && r1(before.crowd.I));
  row('voices max / avg', f.voicesMax + ' / ' + f.voicesAvg, b && (b.voicesMax + ' / ' + b.voicesAvg));
  row('sources started / dropped', f.starts + ' / ' + f.stats.skipped, b && (b.starts + ' / ' + b.stats.skipped));
  row('points played', f.points, b && b.points);
  const mm = c.mask.length ? Math.min.apply(null, c.mask.map(m => m.whistle)) : NaN, mo = c.mask.length ? Math.min.apply(null, c.mask.map(m => m.others)) : NaN;
  const bm = before && before.mask.length ? Math.min.apply(null, before.mask.map(m => m.whistle)) : null, bo = before && before.mask.length ? Math.min.apply(null, before.mask.map(m => m.others)) : null;
  row('whistle/crowd band min (dB)', r1(mm), bm == null ? '' : r1(bm));
  row('whistle/everything min (dB)', r1(mo), bo == null ? '' : r1(bo));
  row('climax: momentary max (LUFS)', r1(c.climax.Mmax), before && before.climax && r1(before.climax.Mmax));
  row('climax: true peak (dBTP)', r1(M.db(c.climax.tp)), before && before.climax && r1(M.db(before.climax.tp)));
  row('climax: samples >= 0.999', c.climax.clip, before && before.climax && before.climax.clip);
  console.log('short-term loudness per second (LUFS):\n  ' + f.short.join(' '));
  const x = c.extra;
  if (x) {
    const sw = x.sweet, d = sw.perfect - sw.good, db = sw.blockHuman - sw.blockCpu;
    console.log('polish wave 1 (Chrome, real master chain, beds + injected events, sim not stepped):');
    const line = (k, pass, info) => { console.log('  ' + pad(k, 58) + (pass ? 'OK  ' : 'FAIL') + '  ' + info); if (!pass) bad++; };
    const dj = sw.jumpPerfect - sw.jumpGood;
    line('AUD-01 remate perfecto vs bueno: ST 150 ms >= +2.5 LU (output)', d >= 2.5, 'good ' + r1(sw.good) + ' / perfect ' + r1(sw.perfect) + ' LUFS -> +' + r1(d) + ' LU');
    line('AUD-01 remate perfecto: true peak of the output <= -1 dBTP', sw.tpPerfect <= -1, r1(sw.tpPerfect) + ' dBTP (good ' + r1(sw.tpGood) + ')');
    line('AUD-01 bloqueo directo humano vs CPU: >= +2 LU, TP <= -1', db >= 2 && sw.tpBlock <= -1, 'cpu ' + r1(sw.blockCpu) + ' / human ' + r1(sw.blockHuman) + ' -> +' + r1(db) + ' LU, TP ' + r1(sw.tpBlock) + ' dBTP');
    line('AUD-01 saque en salto perfecto: lighter (+0.5 LU..spike), TP <= -1', dj >= 0.5 && dj < d && sw.tpJump <= -1, 'good ' + r1(sw.jumpGood) + ' / perfect ' + r1(sw.jumpPerfect) + ' -> +' + r1(dj) + ' LU, TP ' + r1(sw.tpJump) + ' dBTP');
    line('AUD-01 remate que revienta dentro (23 m/s, 4 m): TP <= -1', sw.tpSlam <= -1, r1(sw.tpSlam) + ' dBTP');
    // the diff gate is the one that tells old from new: before the fix the 0.3 x 120 ms hit-stop changed the output by
    // -15 dBFS (fx low-pass closing on the crack) and the bed by 0.97 LU, still inside the spec's 1 LU
    for (const f of x.freeze) line('AUD-04 ' + f.id, f.clicks === 0 && f.bedDelta <= 1 && f.lateDrop === f.lateDropBase && f.diff <= -60,
      'diff vs no freeze ' + (f.diff < -200 ? '-inf' : r1(f.diff)) + ' dBFS, clicks added ' + f.clicks + ', bed delta max ' + r2(f.bedDelta) + ' LU, lateDrop ' + f.lateDrop + '/' + f.lateDropBase);
  }
  const w = c.w2;
  if (w) {
    console.log('polish wave 2 (Chrome, real master chain):');
    const line = (k, pass, info) => { console.log('  ' + pad(k, 66) + (pass ? 'OK  ' : 'FAIL') + '  ' + info); if (!pass) bad++; };
    line('AUD-06 cortinilla: true peak <= -1 dBTP, 0 clipped', w.wipe.tp <= -1 && w.wipe.clip === 0 && w.wipe.n === 1, 'TP ' + r1(w.wipe.tp) + ' dBTP (beds + wipe), wipe alone Mmax ' + r1(w.wipe.Mmax) + ' LUFS');
    const pi = w.intro, duck = pi.bedIn - pi.bedBefore, back = pi.bedAfter - pi.bedBefore;
    line('AUD-06 presentación: true peak <= -1 dBTP, 0 clipped', pi.tp <= -1 && pi.clip === 0, 'TP ' + r1(pi.tp) + ' dBTP, ' + r1(pi.I) + ' LUFS over the card (3.2 s)');
    line('AUD-06 presentación: sting + swell, no welcome roar', pi.sting === 1 && pi.swell === 1 && pi.roar === 0 && pi.applause === 0, 'sting ' + pi.sting + ', swell ' + pi.swell + ', welcome roar ' + pi.roar + ' / applause ' + pi.applause);
    line('AUD-06 presentación: bed ducks >= 5 dB under the card, back within 1 dB', duck <= -5 && Math.abs(back) <= 1, 'bed ' + r1(pi.bedBefore) + ' → ' + r1(pi.bedIn) + ' (' + r1(duck) + ' dB) → ' + r1(pi.bedAfter) + ' LUFS');
    const rr = w.react;
    line('AUD-07 reacción local ∝ highlight: Spearman >= 0.8 (30 real points, output)', rr.rho >= 0.8, 'ρ = ' + rr.rho.toFixed(3) + ', ' + r1(rr.lo) + '…' + r1(rr.hi) + ' LUFS (5 s, reactions solo)');
    line('AUD-07 30 points + maximal point (h 1) over the beds: TP <= -1 dBTP, 0 clipped', rr.tp <= -1 && rr.clip === 0, 'TP ' + r1(rr.tp) + ' dBTP, momentary max ' + r1(rr.Mmax) + ' LUFS');
    const m = w.match240, s5 = m.stats, sy = m.syn, lg = m.logs;
    const synOk = lg.slap === sy.highfive && lg.fist === sy.fistbump && lg.chest === sy.chestbump && lg.handclap === sy.clap && lg.dribble === sy.dribble + sy.native;
    line('AUD-05 240 s match: every contact / dribble sounds once', s5.fxIn === s5.fxOut && s5.dribIn === s5.dribOut && synOk && s5.fxIn > 20,
      'contacts ' + s5.fxIn + ' in / ' + s5.fxOut + ' out (slap ' + lg.slap + '/' + sy.highfive + ', fist ' + lg.fist + '/' + sy.fistbump + ', chest ' + lg.chest + '/' + sy.chestbump + ', clap ' + lg.handclap + '/' + sy.clap + '), dribbles ' + s5.dribIn + '/' + s5.dribOut + (sy.native ? ' (sim ' + sy.native + ')' : ' (synthesised: SIM-04 not in the sim yet)'));
    line('AUD-05 240 s match: no voice leak (0 voices, 8/8 strips free after 6 s quiet)', m.end.voices === 0 && m.end.poolFree === m.end.pool && m.end.pool === 8 && s5.voicesMax <= 32 && m.clip === 0,
      'voices at end ' + m.end.voices + ', strips free ' + m.end.poolFree + '/' + m.end.pool + ', voices max ' + s5.voicesMax + ', pooled ' + s5.pooled + ', pool full ' + s5.poolFull + ', ' + m.points + ' points, I ' + r1(m.I) + ' LUFS, TP ' + r1(m.tp) + ' dBTP, render ' + m.renderMs + ' ms');
  }
  const w3 = c.w3 && c.w3.final;
  if (w3) {
    console.log('polish wave 3 (Chrome, real master chain): final de partido (match point won, double roar, match sting, chest bump, wipe, end sheet)');
    const line = (k, pass, info) => { console.log('  ' + pad(k, 66) + (pass ? 'OK  ' : 'FAIL') + '  ' + info); if (!pass) bad++; };
    line('AUD-08 final de partido: true peak <= -1 dBTP, 0 clipped', w3.tp <= -1 && w3.clip === 0, 'TP ' + r1(w3.tp) + ' dBTP, ' + r1(w3.I) + ' LUFS over the scene, ' + r1(w3.sheetI) + ' LUFS over the sheet (1.6 s)');
    line('AUD-08 final de partido: ticks stop when the count-up ends', w3.ticks >= 4 && w3.lock === 1 && Math.abs(w3.lockAt - w3.endAt) < 0.0005 && w3.afterEnd === 0 && w3.mvp === 1,
      w3.ticks + ' ticks, last at ' + Math.round(w3.lastTick * 1000) + ' ms, clac at ' + Math.round(w3.lockAt * 1000) + ' ms = end of the count-up ' + Math.round(w3.endAt * 1000) + ' ms, ticks after it ' + w3.afterEnd + ', MVP ' + w3.mvp);
    line('AUD-08 final de partido: the crowd yields ~3 dB (output) to the sheet', w3.crowdDelta <= -2.5 && w3.crowdDelta >= -5 && Math.abs(w3.crowdBefore) < 0.3, 'crowd stem with vs without the sheet: ' + r1(w3.crowdBefore) + ' dB before it, ' + r1(w3.crowdDelta) + ' dB under it');
    line('AUD-08 final de partido: ticks and MVP accent heard over the celebration', w3.tickVsMed >= 0 && w3.mvpVs >= -3, 'ticks vs the rest in 4-10 kHz: median ' + r1(w3.tickVsMed) + ' dB (min ' + r1(w3.tickVsMin) + ') · MVP accent vs the rest ' + r1(w3.mvpVs) + ' LU');
  }
  if (c.sweep) {
    const w = c.sweep.slice().sort((a, b) => b.tp - a.tp), bad9 = w.filter(x => x.tp > -1 || x.clip);
    console.log('AUD-09 every mix-plan scenario through the real chain over the beds (' + (c.sweep.length / 2) + ' scenarios × camera at ~8 m and ~3 m):');
    console.log('  ' + pad('true peak <= -1 dBTP and 0 clipped in every window', 66) + (bad9.length ? 'FAIL' : 'OK  ') + '  worst: ' + w.slice(0, 4).map(x => x.id + ' @' + x.cam + ' m ' + r1(x.tp)).join(' · ') + ' dBTP' + (bad9.length ? ' · over: ' + bad9.map(x => x.id + ' @' + x.cam + ' m').join(', ') : ''));
    if (bad9.length) bad++;
  }
  console.log('whistles: ' + c.mask.map(m => m.t + 's ' + m.whistle + '/' + m.others + 'dB').join(', '));
  console.log('render ' + f.renderMs + ' ms, bank ready after ' + f.genWait + ' ms, score ' + f.score);
  if (c.errors.length) console.log('PAGE ERRORS: ' + c.errors.join(' | '));
  if (f.clip > 0 || f.tp > 1) { bad++; console.log('FAIL: clipping in the match mix'); }
  if (SECS === 60 && SEED === 7) {
    const dI = f.I - MATCH_REF, ok9 = Math.abs(dI) <= 1 && M.db(f.tp) <= -1 && M.db(c.climax.tp) <= -1;
    console.log('AUD-09 match: integrated within ±1 LU of the wave-2 reference (' + MATCH_REF + ' LUFS), TP <= -1 dBTP (match and climax): ' + (ok9 ? 'OK' : 'FAIL') + '  (' + r1(f.I) + ' LUFS, ' + (dI >= 0 ? '+' : '') + r1(dI) + ' LU; TP ' + r1(M.db(f.tp)) + ' / ' + r1(M.db(c.climax.tp)) + ' dBTP)');
    if (!ok9) bad++;
  }
  if (c.climax.clip > 0 || c.climax.tp > 1) { bad++; console.log('FAIL: clipping in the climax'); }
  if (!(mm >= 6)) { bad++; console.log('FAIL: whistle less than 6 dB above the crowd in its band'); }
  if (c.errors.length) bad++;
  return bad;
}

/* ====================================================================
 * Part 4: robustness of the engine (mock AudioContext whose params throw on non-finite values, like Chrome)
 *  a. play() with NaN / Infinity / negative arguments: no non-finite write, the sound still plays.
 *  b. a quick tap: whistle + newMatch arrive before the bank has their buffers → they are deferred (not skipped),
 *     their jobs jump the queue, and they play once built; a deferred whistle that arrives too late is dropped.
 *  c. the generation stays allocation-light: scavenges for the whole bank (node, 1 MB semi-space) vs output size.
 *  d. synthesis Worker protocol with a mock Worker: one that never answers (the queue keeps going, then falls back) and
 *     a working one (hello, dispatch, a sound requested with no buffer jumps its queue, results, Worker closed).
 * ==================================================================== */
async function robustReport(file) {
  const res = [];
  const ok = (name, pass, info) => res.push({ name, pass: !!pass, info: info || '' });
  function load() {
    const { VB, root } = loadAudio(file); const A = VB.Audio, mock = makeMock(), q = [];
    let bad = 0; const Orig = mock.Ctx.prototype.createGain;
    mock.Ctx.prototype.createGain = function () { const n = Orig.call(this); let v = n.gain.value; Object.defineProperty(n.gain, 'value', { get: () => v, set: x => { if (!isFinite(x)) { bad++; throw new TypeError('non-finite'); } v = x; } }); return n; };
    root.AudioContext = mock.Ctx;
    root.requestIdleCallback = fn => { q.push(fn); return q.length; }; root.cancelIdleCallback = () => { };
    root.setTimeout = (fn, ms) => { q.push(fn); return q.length; }; root.clearTimeout = () => { };
    const pump = (n) => { for (let i = 0; i < n && q.length; i++) q.shift()({ timeRemaining: () => 8, didTimeout: false }); };
    return { A, mock, pump, bad: () => bad, q };
  }
  // a. non-finite arguments
  {
    const t = load(); t.A.init({ camera: { position: { x: 0, y: 4, z: 12 } }, state: 'playing', settings: {} }); t.A.onGameStart({ demo: false }); t.A.onState('playing'); t.A.unlock();
    for (let i = 0; i < 50000 && t.A.ready() < 1; i++) t.pump(1);
    const before = t.mock.started.length; let r = 0;
    r += t.A.play('spike', NaN, NaN, NaN) ? 1 : 0; r += t.A.play('pass', Infinity, Infinity, -Infinity) ? 1 : 0;
    r += t.A.play('net', -3, 1e308, NaN) ? 1 : 0; r += t.A.play('roar', NaN) ? 1 : 0;
    r += t.A.play('constructor') ? 0 : 1; r += t.A.play('__proto__', 1) ? 0 : 1;
    ok('play() with NaN/Infinity/negative args', t.bad() === 0 && r === 6 && t.mock.started.length - before === 4, 'non-finite writes ' + t.bad() + ', played ' + (t.mock.started.length - before) + '/4');
  }
  // a2. polish wave 2 API before the first gesture (no AudioContext yet): silent no-ops, no exception, nothing created
  {
    const t = load(); let threw = '';
    t.A.init({ camera: { position: { x: 14, y: 4, z: 0 } }, state: 'menu', settings: {} });
    try {
      t.A.ui('wipe'); t.A.sting('intro'); t.A.ui('intro'); t.A.ui('introEnd'); t.A.ui('introSkip'); t.A.ui('reveal');
      t.A.handle([{ type: 'fx:highfive', team: 0, x: 5, y: 1, strength: 1 }, { type: 'fx:chestbump', team: 0, x: 5, y: 1 }, { type: 'fx:clap', team: 1 }, { type: 'fx:catch' },
        { type: 'dribble', team: 1, x: -9, y: 1, speed: 5 }, { type: 'dribble' }, { type: 'point', team: 0, highlight: 0.9, digs: 3, streak: 4, savedSetPoint: true, hold: 2.4 },
        { type: 'point', team: 1, highlight: NaN }, { type: 'newMatch' }, { type: 'whistle', reason: 'serve' }], { mode: 'point', players: [], rally: { t: 0, hits: 0 } });
      t.A.update({ mode: 'serve', players: [] }, 1 / 60); t.A.voices(); t.A.introInfo(); t.A._debug();
    } catch (e) { threw = String(e && e.message || e); }
    ok('wave 2 API before the first gesture: no-op', !threw && t.mock.started.length === 0 && t.A.contextState() === 'none',
      threw ? 'THREW ' + threw : 'started ' + t.mock.started.length + ', context ' + t.A.contextState() + ', fxIn ' + t.A.stats.fxIn + ' (counted, silent)');
  }
  // b. quick tap: events before the buffers exist
  {
    const t = load(); const C = () => t.mock.started.length ? t.mock.started[0].src.context : null;
    t.A.init({ state: 'playing', settings: {} }); t.A.onGameStart({ demo: false }); t.A.onState('playing'); t.A.unlock();
    const st = t.A.stats, sk0 = st.skipped;
    t.A.handle([{ type: 'newMatch' }, { type: 'whistle', reason: 'serve' }], { mode: 'serve' });
    const deferred = st.deferred, skippedAtTap = st.skipped - sk0;
    for (let i = 0; i < 50000 && !(st.played.whistle && st.played.roar && st.played.applause); i++) t.pump(1);
    ok('quick tap: whistle + welcome deferred, not skipped', deferred >= 3 && skippedAtTap === 0, 'deferred ' + deferred + ', skipped ' + skippedAtTap);
    ok('quick tap: they play once built', st.played.whistle === 1 && st.played.roar === 1 && st.played.applause === 1, 'whistle ' + (st.played.whistle | 0) + ' roar ' + (st.played.roar | 0) + ' applause ' + (st.played.applause | 0) + ' after ' + st.synth + '/' + st.total + ' sounds');
  }
  {
    const t = load(); t.A.init({ state: 'playing', settings: {} }); t.A.onGameStart({ demo: false }); t.A.onState('playing'); t.A.unlock();
    const st = t.A.stats; t.A.handle([{ type: 'whistle', reason: 'point' }], { mode: 'point' });
    const ctx = t.mock.started.length ? t.mock.started[0].src.context : null; // the iOS unlock buffer started inside unlock()
    if (ctx) ctx.currentTime += 1.5; // the bank takes 1.5 s: a whistle that late makes no sense any more
    for (let i = 0; i < 50000 && !st.played.whistleLong && !st.lateDrop; i++) t.pump(1);
    ok('late deferred whistle is dropped', !st.played.whistleLong && st.lateDrop === 1, 'played ' + (st.played.whistleLong | 0) + ', lateDrop ' + st.lateDrop);
  }
  // d. synthesis Worker protocol (node: a fake document so the engine thinks it is in a page, a mock Worker, one event queue)
  {
    function loadW(WorkerImpl) {
      const src = fs.readFileSync(file, 'utf8'), VB = {}, g = Object.create(globalThis); g.VB = VB;
      const mock = makeMock(), q = [];
      g.AudioContext = mock.Ctx;
      g.requestIdleCallback = fn => { q.push(fn); return q.length; }; g.cancelIdleCallback = () => { };
      g.setTimeout = (fn) => { q.push(fn); return q.length; }; g.clearTimeout = () => { };
      g.Blob = function (parts) { this.parts = parts; }; g.URL = { createObjectURL: b => { g.__blob = b; return 'blob:test'; }, revokeObjectURL: () => { g.__revoked = 1; } };
      if (WorkerImpl) g.Worker = WorkerImpl(q);
      new Function('window', 'globalThis', 'document', src).call(g, undefined, g, { hidden: false, addEventListener() { } });
      const pump = (n) => { for (let i = 0; i < n && q.length; i++) q.shift()({ timeRemaining: () => 8, didTimeout: false }); };
      return { A: VB.Audio, g, mock, q, pump };
    }
    // d1. a Worker that never answers (host blocks it silently): the time-sliced queue never stops; after the watchdog
    //     the engine gives up on it. Nothing is lost or synthesised twice.
    {
      let created = 0, posted = 0, term = 0;
      const t = loadW(() => function () { created++; this.postMessage = () => { posted++; }; this.terminate = () => { term++; }; });
      t.A.init({ state: 'playing', settings: {} }); t.A.onGameStart({ demo: false }); t.A.onState('playing'); t.A.unlock();
      for (let i = 0; i < 60000 && t.A.ready() < 1; i++) t.pump(1);
      const st = t.A.stats;
      ok('Worker that never answers: queue keeps going, falls back', created === 1 && posted === 0 && term === 1 && /^failed:timeout/.test(st.worker) && t.A.ready() === 1 && st.synth === st.total,
        'created ' + created + ', jobs posted ' + posted + ', worker ' + st.worker + ', built ' + st.built + '/' + st.total + ', synth ' + st.synth);
    }
    // d2. a working Worker (the module synthesises in a second copy, as the real one does): hello, every job dispatched
    //     after it, a sound requested without buffer jumps the Worker queue, results arrive transferred, Worker closed at the end.
    {
      const W = loadAudio(file).VB.Audio; let inst = null; const log = [];
      const t = loadW(q => function () {
        inst = this; const wq = []; let busy = false; this.terminated = false;
        const step = () => { busy = false; const j = wq.shift(); if (!j || this.terminated) return; const chs = W.synth(j.name, j.v, j.sr); log.push(j.name + '#' + j.v); q.push(() => this.onmessage && this.onmessage({ data: { id: j.id, chs, ms: 1 } })); pumpW(); };
        const pumpW = () => { if (!busy && wq.length) { busy = true; q.push(step); } };
        this.postMessage = m => { if (m.jobs) wq.push(...m.jobs); if (m.bump) { log.push('bump:' + m.bump); const k = wq.findIndex(x => x.name === m.bump); if (k > 0) wq.unshift(wq.splice(k, 1)[0]); } pumpW(); };
        this.terminate = () => { this.terminated = true; };
        q.push(() => this.onmessage && this.onmessage({ data: { hi: 1 } }));
      });
      t.A.init({ state: 'playing', settings: {} }); t.A.onGameStart({ demo: false }); t.A.onState('playing'); t.A.unlock();
      const st = t.A.stats;
      for (let i = 0; i < 40 && !(inst && st.worker === 'on'); i++) t.pump(1);
      t.A.play('slamSub', 0.5);          // not in the first pass, no buffer yet → skipped, jumps the queue
      for (let i = 0; i < 60000 && t.A.ready() < 1; i++) t.pump(1);
      const iBump = log.indexOf('bump:slamSub'), iSlam = log.findIndex(x => /^slamSub#/.test(x));
      const srcOk = t.g.__blob && /self\.__vbAudioWorker=1;\(function VBAudioModule\(\)/.test(t.g.__blob.parts[0]);
      ok('Worker: hello, dispatch, bump, results, close', st.worker === 'on' && t.A.ready() === 1 && st.synth === st.total && inst.terminated && t.g.__revoked && srcOk &&
        iBump >= 0 && iSlam === iBump + 1 && st.missed.slamSub === 1,
        'worker ' + st.worker + ', built ' + st.built + '/' + st.total + ', slamSub (requested with no buffer) synthesised ' + (iSlam === iBump + 1 ? 'next' : (iSlam - iBump - 1) + ' jobs later') + ', closed ' + !!inst.terminated + ', source ' + (srcOk ? 'ok' : 'BAD'));
    }
  }
  // c. allocation of the whole bank (child process: its own heap and semi-space)
  {
    const cp = require('child_process');
    const code = "globalThis.VB={};require(" + JSON.stringify(file) + ");const A=VB.Audio;let sc=0,out=0;const {PerformanceObserver}=require('perf_hooks');" +
      "new PerformanceObserver(l=>{for(const e of l.getEntries())if(e.detail&&e.detail.kind===1)sc++;}).observe({entryTypes:['gc']});const t=Date.now();" +
      "const X=A.XAR_SOUNDS||[],XO=process.argv.includes('xar');for(const n of A.SOUNDS){if(X.includes(n)!==XO)continue;for(let v=0;v<A.VARIANTS[n];v++){const it=A.synthSteps(n,v,48000);let r;do{r=it.next();}while(!r.done);for(const c of r.value)out+=c.length*4;}}" +
      "setTimeout(()=>console.log(JSON.stringify({sc,ms:Date.now()-t,mb:out/1048576})),30);";
    try {
      const r = JSON.parse(cp.execFileSync(process.execPath, ['--max-semi-space-size=1', '-e', code], { encoding: 'utf8' }).trim().split('\n').pop());
      // before the review-3 fix: ~870 scavenges (~740 MB of boxed doubles for 11 MB of audio); after: ~400 (mostly the first, unoptimised run of each generator)
      ok('bank generation allocation (node, 1 MB semi-space)', r.sc < 600, r.sc + ' scavenges, ' + r.ms + ' ms, output ' + r.mb.toFixed(1) + ' MB');
    } catch (e) { ok('bank generation allocation', false, String(e.message || e).slice(0, 120)); }
    // xaranga: its pieces are not in the usual bank (xarPrep); measured apart. Almost all of it is the first, unoptimised run of its
    // voices (a second run allocates ~0 scavenges)
    try {
      const r = JSON.parse(cp.execFileSync(process.execPath, ['--max-semi-space-size=1', '-e', code, 'xar'], { encoding: 'utf8' }).trim().split('\n').pop());
      ok('xaranga generation allocation (node, 1 MB semi-space)', r.mb === 0 || r.sc < 120, r.sc + ' scavenges, ' + r.ms + ' ms, output ' + r.mb.toFixed(1) + ' MB');
    } catch (e) { ok('xaranga generation allocation', false, String(e.message || e).slice(0, 120)); }
  }
  return res;
}
function robustTable(rows) {
  console.log('\n== 4. Robustness (mock AudioContext, params throw on non-finite values) ==');
  let bad = 0;
  for (const r of rows) { console.log(pad(r.name, 52) + (r.pass ? 'OK  ' : 'FAIL') + '  ' + r.info); if (!r.pass) bad++; }
  return bad;
}

/* ====================================================================
 * Part 5: cold start in the real game (index.html in Chrome, emulated mid-range phone)
 *  844x390, DPR 2.75, touch, Android UA, CPU x4 (as tools/perf.js). JUGAR (startMatch, autopilot, match HUD) 1 s
 *  after the page loads, then 20 s of live match; VB.Audio.stats is sampled every 2.5 s.
 *  a. normal path (synthesis Worker): worker 'on', the whole bank built ≤ 8 s after JUGAR (≈ 1 s with the PC idle),
 *     skipped ≤ 2, lateDrop 0. (Before the Worker, same run: skipped 25-29 in 20 s, 22-24 of 85 sounds built, 14-16 heard.)
 *  b. no Worker (window.__vbAudioNoWorker, the time-sliced queue with the core-first pass): skipped ≤ 18 in 20 s (7-14 measured).
 *  c. Worker blocked by a CSP (worker-src 'none', like a strict host page): falls back by itself ('failed:…'),
 *     bank keeps growing (≥ 10 sounds), skipped ≤ 15 (20 s).
 *  b/c: missed {} for every game sound (crowd and music excluded): the core-first pass holds all of them, and a deferred
 *     crowd sound (welcome ovation) is bumped BEHIND the cheap first-heard ones (ritual dribble, serve, feet...).
 *  Numbers depend on host load (other Chrome/node processes): fps is printed with each run.
 *  d. Worker output is bit-identical to the main-thread synthesis (every buffer of every sound, desktop page; with no tap
 *     the whole bank is synthesised BEFORE any gesture, ~1-3 s after load, no AudioContext; then a tap builds the AudioBuffers).
 *  The page is a copy of index.html (tools/out/audio/cold-*.html) with <base href> to the project, so --file and the CSP work.
 * ==================================================================== */
const CROWD_MUSIC = /^(murmur|excite|roar|applause|groan|ooh|palmas|bombo|introSting|introSwell|setWin|setLose|matchWin|matchLose|pamSting|ir)$/;
function coldPage(file, tag, csp) {
  const u = f => require('url').pathToFileURL(f).href;
  let html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  const head = '<base href="' + u(ROOT) + '/">' + (csp ? '<meta http-equiv="Content-Security-Policy" content="' + csp + '">' : '');
  html = html.replace(/^(<title>[^<]*<\/title>)/, '$1' + head).replace('<script src="js/audio.js"></script>', '<script src="' + u(file) + '"></script>');
  fs.mkdirSync(OUT, { recursive: true });
  const f = path.join(OUT, 'cold-' + tag + '.html'); fs.writeFileSync(f, html); return u(f);
}
const COLD_STATS = `(function(){var a=VB.Audio,st=a.stats,p=0;for(var k in st.played)p+=st.played[k];
  return {t:Math.round(performance.now()),mode:VB.ctx.game&&VB.ctx.game.mode,skipped:st.skipped,lateDrop:st.lateDrop,deferred:st.deferred,built:st.built,
  synth:st.synth,total:st.total,played:p,worker:st.worker,hi:st.workerHi,maxSlice:+st.maxSliceMs.toFixed(1),genMs:Math.round(st.genMs),missed:st.missed}})()`;
/** Navigate to a page URL and wait for the game to exist (like cdp.navigate, which only takes a query); a navigation can
 *  switch renderer process and lose the CPU throttle, so it is applied again. */
async function coldNav(page, url, thr) {
  await page.send('Page.navigate', { url });
  const t0 = Date.now();
  while (Date.now() - t0 < 30000) {
    await new Promise(r => setTimeout(r, 100));
    const okp = await page.evalJs("document.readyState==='complete'&&!!(window.VB&&VB.ctx&&VB.ctx.actions&&VB.Audio)").catch(() => false);
    if (okp) break;
  }
  if (thr > 1) await page.setThrottle(thr);
}
async function coldRun(file, tag, o) {
  const CDP = require('./cdp.js');
  const FPS = 'window.__cf={n:0,t0:0};(function f(t){requestAnimationFrame(f);if(window.__cf.t0)window.__cf.n++;})();';
  const page = await CDP.open({ size: '844x390', touch: true, dpr: 2.75, throttle: 4, ua: CDP.ANDROID_UA, flags: ['--autoplay-policy=no-user-gesture-required'], init: [FPS].concat(o.init || []) });
  try {
    await coldNav(page, coldPage(file, tag, o.csp), 4); await CDP.sleep(1000);
    await page.evalJs('(function(){VB.ctx.actions.startMatch({autopilot:true});VB.ctx.game.present=true;__cf.n=0;__cf.t0=performance.now();return VB.ctx.state})()');
    const t0 = Date.now(), rows = []; let fullAt = -1;
    while (Date.now() - t0 < o.secs * 1000) {
      await CDP.sleep(500);
      const s = await page.evalJs(COLD_STATS); s.at = (Date.now() - t0) / 1000;
      if (fullAt < 0 && s.built >= s.total) fullAt = s.at;
      if (!rows.length || s.at - rows[rows.length - 1].at >= 2.4) rows.push(s);
    }
    const last = await page.evalJs(COLD_STATS); last.at = (Date.now() - t0) / 1000; rows.push(last);
    last.fps = await page.evalJs('Math.round(__cf.n*1000/(performance.now()-__cf.t0))');
    return { rows, last, fullAt, errors: page.errors.filter(e => !/Content Security Policy/.test(e)) };
  } finally { page.close(); }
}
async function coldIdentical(file) {
  const CDP = require('./cdp.js');
  const page = await CDP.open({ size: '640x360', flags: ['--autoplay-policy=no-user-gesture-required'] });
  try {
    await coldNav(page, coldPage(file, 'ident'), 1);
    const tl = Date.now(); let pre;
    do { await CDP.sleep(250); pre = await page.evalJs('({synth:VB.Audio.stats.synth,total:VB.Audio.stats.total,worker:VB.Audio.stats.worker,ctx:VB.Audio.contextState()})'); }
    while (pre.synth < pre.total && Date.now() - tl < 15000);
    pre.secs = (Date.now() - tl) / 1000;
    await page.evalJs('VB.Audio.unlock()');
    const t0 = Date.now(); let r;
    do { await CDP.sleep(200); r = await page.evalJs('({b:VB.Audio.stats.built,t:VB.Audio.stats.total})'); } while (r.b < r.t && Date.now() - t0 < 20000);
    const builtMs = Date.now() - t0;
    const cmp = await page.evalJs(`(function(){var A=VB.Audio,bad=[],n=0,sr=48000;
      for(var i=0;i<A.SOUNDS.length;i++){var nm=A.SOUNDS[i];if(nm==='ir'||(A.AMB_SOUNDS&&A.AMB_SOUNDS.indexOf(nm)>=0)||(A.XAR_SOUNDS&&A.XAR_SOUNDS.indexOf(nm)>=0))continue;var list=A._bank(nm)||[];var V=A.VARIANTS[nm],ref=[];
        for(var v=0;v<V;v++)ref.push(A.synth(nm,v,sr));
        if(list.length!==V){bad.push(nm+':count '+list.length+'/'+V);continue;}
        for(var k=0;k<list.length;k++){var b=list[k],hit=false;
          for(var v2=0;v2<V&&!hit;v2++){var R=ref[v2];if(R.length!==b.numberOfChannels||R[0].length!==b.length||A.synthRate(nm,sr)!==b.sampleRate)continue;
            var same=true;for(var c=0;c<R.length&&same;c++){var d=b.getChannelData(c),x=R[c];for(var j=0;j<x.length;j++)if(d[j]!==x[j]){same=false;break;}}
            hit=same;}
          n++;if(!hit)bad.push(nm+'#'+k);}}
      return {n:n,bad:bad};})()`);
    return { pre, builtMs, cmp, errors: page.errors };
  } finally { page.close(); }
}
async function coldReport(file) {
  const res = [], ok = (name, pass, info, val) => res.push({ name, pass: !!pass, info: info || '', val });
  const fmt = r => 'skipped ' + r.last.skipped + ', lateDrop ' + r.last.lateDrop + ', built ' + r.last.built + '/' + r.last.total + ', heard ' + r.last.played +
    ', worker ' + r.last.worker + (r.last.hi >= 0 ? ' (hello ' + r.last.hi + ' ms)' : '') + ', ' + r.last.fps + ' fps, missed ' + JSON.stringify(r.last.missed) +
    (r.errors.length ? ', ' + r.errors.length + ' page error(s): ' + String(r.errors[0]).slice(0, 160) : '');
  const a = await coldRun(file, 'worker', { secs: 20 });
  ok('a. Worker: 20 s of match after a 1 s tap (CPU x4)', a.last.worker === 'on' && a.last.skipped <= 2 && a.last.lateDrop === 0 && !a.errors.length, fmt(a), a.last.skipped);
  ok('a. Worker: whole bank built ≤ 8 s after JUGAR', a.fullAt >= 0 && a.fullAt <= 8, a.fullAt >= 0 ? 'built ' + a.fullAt.toFixed(1) + ' s after JUGAR' : 'never: ' + a.last.built + '/' + a.last.total, a.fullAt);
  const b = await coldRun(file, 'noworker', { secs: 20, init: ['window.__vbAudioNoWorker=true;'] });
  ok('b. no Worker (time-sliced queue, core-first)', b.last.worker === 'off' && b.last.skipped <= 18 && !b.errors.length, fmt(b), b.last.skipped);
  const c = await coldRun(file, 'csp', { secs: 20, csp: "worker-src 'none'" });
  ok('c. Worker blocked by CSP: falls back by itself', /^failed/.test(c.last.worker) && c.last.built >= 10 && c.last.skipped <= 15 && !c.errors.length, fmt(c), c.last.skipped);
  // every game sound (sfx bus: contacts, whistles, ritual dribbles, feet, celebration, sweeteners, clock tick, wipe) is in the
  // core-first pass of the time-sliced queue, so none is ever asked for without its buffer; only crowd and music may still
  // be missing (they are deferred or have a bed). Measured before the fix: b {dribble:3, slide:1}, c {dribble:2, feet:3, scuff:1}.
  const gameMiss = r => { const o = {}; for (const k in r.last.missed) if (!CROWD_MUSIC.test(k)) o[k] = r.last.missed[k]; return o; };
  for (const [tag, r] of [['b. no Worker', b], ['c. Worker blocked by CSP', c]]) {
    // the target device runs the game at ≥ 55 fps (tools/perf.js); a run far below that means the host itself is saturated
    // (other Chrome/node processes: measured 19-38 fps) and only says so instead of failing
    const m = gameMiss(r), n = Object.keys(m).length, loaded = r.last.fps < 45;
    ok(tag + ': no game sound missed in 20 s', !n || loaded, 'missed ' + JSON.stringify(m) + ', built ' + r.last.built + '/' + r.last.total + ', ' + r.last.fps + ' fps' +
      (n && loaded ? ' (HOST LOADED: below 45 fps, not judged; rerun with the PC idle)' : ''), n);
  }
  const d = await coldIdentical(file);
  ok('d. bank synthesised before any gesture (Worker)', d.pre.worker === 'on' && d.pre.synth === d.pre.total && d.pre.ctx === 'none', 'synth ' + d.pre.synth + '/' + d.pre.total + ' ' + d.pre.secs.toFixed(1) + ' s after load, context ' + d.pre.ctx + ', worker ' + d.pre.worker + '; AudioBuffers ' + d.builtMs + ' ms after the tap');
  ok('d. Worker buffers bit-identical to main-thread synth', d.cmp.bad.length === 0 && d.cmp.n > 70 && !d.errors.length, d.cmp.n + ' buffers compared, ' + d.cmp.bad.length + ' differ' + (d.cmp.bad.length ? ': ' + d.cmp.bad.slice(0, 6).join(' ') : '') +
    (d.errors.length ? ', ' + d.errors.length + ' page error(s): ' + String(d.errors[0]).slice(0, 160) : ''));
  return { rows: res, runs: { a: a.rows, b: b.rows, c: c.rows } };
}
function coldTable(r) {
  console.log('\n== 5. Cold start in the real game (844x390 DPR 2.75, CPU x4, JUGAR 1 s after load) ==');
  let bad = 0;
  for (const x of r.rows) { console.log(pad(x.name, 52) + (x.pass ? 'OK  ' : 'FAIL') + '  ' + x.info); if (!x.pass) bad++; }
  for (const k of ['a', 'b']) console.log('   ' + k + ' timeline (s: skipped/built): ' + r.runs[k].map(s => s.at.toFixed(0) + ':' + s.skipped + '/' + s.built).join('  '));
  return bad;
}

/* ====================================================================
 * Part 6 (AUD-08): the end sheet and the menus in the REAL game (index.html, real ui.js count-up, real Chrome WebAudio)
 *  The wiring lives in js/ui.js (owner ui_main). If ui.js does not call VB.Audio.ui('count', …) yet, the exact snippet asked for in
 *  notes/ui_main.md (UI_PATCH below) is applied to a scratch copy of the project (tools/out/audio/endui-root) and that copy is tested;
 *  once ui_main has wired it, the real ui.js is tested as is. Test-only probes (a frame log and a hook to rerun the count-up once the
 *  bank is ready) are added to the copy in both cases.
 *  a. end sheet (?debug=end) at 1280x720 (docked) and 844x390 touch: ticks ≤ 20 per second, the last sound ("clac") in the last frame
 *     of the count-up (gate ±1 frame), no tick after it, the MVP sting once, crowd focus on.
 *  b. menu: difficulty arrows (step up / down, edge), settings rows (Sí/No toggle, multi-value option) → their own sounds.
 * ==================================================================== */
const UI_PATCH = [
  { id: 'cuenta: MVP al empezar',
    find: "    cancelAnimationFrame(cuRaf);\n    if (reduceMotion || !items.length) return;",
    repl: "    cancelAnimationFrame(cuRaf);\n    // AUD-08: revelación del MVP (el acento cae a 0,6 s, cuando se posan las cifras; con movimiento reducido, 0,6 s tras aparecer)\n    if (el.endMvp && el.endMvp.firstChild) { try { if (VB.Audio && VB.Audio.ui) VB.Audio.ui('mvp', root.classList.contains('win')); } catch (e) { } }\n    if (reduceMotion || !items.length) return;" },
  { id: 'cuenta: tics y clac',
    find: "      for (var j = 0; j < items.length; j++) { var tv = String(Math.round(items[j][1] * e2)); if (items[j][0].textContent !== tv) items[j][0].textContent = tv; }\n      if (u2 < 1) cuRaf = requestAnimationFrame(step);",
    repl: "      var chg = false;\n      for (var j = 0; j < items.length; j++) { var tv = String(Math.round(items[j][1] * e2)); if (items[j][0].textContent !== tv) { items[j][0].textContent = tv; chg = true; } }\n      // AUD-08: tic en los frames en que cambia alguna cifra (audio.js los espacia: ≤ 20/s, se frenan con la cuenta) y «clac» en el último\n      if (chg || u2 >= 1) { try { if (VB.Audio && VB.Audio.ui) VB.Audio.ui('count', u2, now); } catch (e) { } }\n      if (u2 < 1) cuRaf = requestAnimationFrame(step);" },
  { id: 'opciones: sonido según el tipo',
    find: "      ctx.actions.setSetting(k, o.vals[i]);\n    }\n    click();\n  }",
    repl: "      ctx.actions.setSetting(k, o.vals[i]);\n    }\n    optSound(k, arrowDir);\n  }\n  /** AUD-08: confirmación con el sonido de su tipo: flecha de dificultad (la nota sigue al nivel), Sí/No, varios valores, deslizador. */\n  function optSound(k, arrowDir) {\n    var A = VB.Audio; if (!A || !A.ui) return click();\n    try {\n      if (SLIDERS[k]) { if (k !== 'sfxVol') A.ui('slide', (slVal(k) - SLIDERS[k].min) / (SLIDERS[k].max - SLIDERS[k].min)); return; }\n      var o = OPT[k], i = optIndex(k);\n      if (arrowDir) A.ui('arrow', arrowDir, i, o.vals.length);\n      else if (o.labels.length === 2 && o.labels[0] === 'Sí') A.ui('toggle', i === 0);\n      else A.ui('select', i, o.vals.length);\n    } catch (e) { }\n  }\n  function uiSound2(kind, a) { try { if (VB.Audio && VB.Audio.ui) VB.Audio.ui(kind, a); } catch (e) { } }" },
  { id: 'opciones: firma con la flecha', find: "  function changeOpt(k, d, absIdx) {", repl: "  function changeOpt(k, d, absIdx, arrowDir) {" },
  { id: 'flechas: paso y tope',
    find: "uiSound('back'); return; }\n    changeOpt('difficulty', 0, j);",
    repl: "uiSound2('arrowEdge', d); return; }\n    changeOpt('difficulty', 0, j, d);" },
  { id: 'flechas: hover propio',
    find: "arrs[ai].addEventListener('pointerenter', function (ev) { if (ev.pointerType === 'mouse') hoverSound(); });",
    repl: "arrs[ai].addEventListener('pointerenter', function (ev) { if (ev.pointerType === 'mouse') uiSound2('arrowHover', +this.getAttribute('data-d') || 1); });" },
  { id: 'filas de Ajustes: hover propio',
    find: "hb[h].addEventListener('pointerenter', function (ev) { if (ev.pointerType === 'mouse') hoverSound(); });",
    repl: "hb[h].addEventListener('pointerenter', function (ev) { if (ev.pointerType === 'mouse') { if (this.classList.contains('opt')) uiSound2('optHover'); else hoverSound(); } });" },
  { id: 'filas de Ajustes: foco con mando/teclado',
    find: "    focusEl(list[i], true); hoverSound();",
    repl: "    focusEl(list[i], true); if (list[i].classList && list[i].classList.contains('opt')) uiSound2('optHover'); else hoverSound();" }
];
/** Test-only probes for the scratch copy: a log of every count-up frame and a hook to rerun the count-up. */
const UI_PROBE = [
  // (B6, sprint 2-4: countUp tiene dos relojes, el de la hoja (main) y el del Resumen repintado; solo se registra el de la hoja)
  { find: "      if (u2 < 1) { var r1 = requestAnimationFrame(step); if (main) cuRaf = r1; else cuRaf2 = r1; }",
    repl: "      if (main && window.__cuLog) { var S = VB.Audio.stats; window.__cuLog.push([now, performance.now(), u2, chg ? 1 : 0, S.count | 0, S.countEnd | 0, S.countAt || 0, S.countEndAt || 0]); }\n      if (u2 < 1) { var r1 = requestAnimationFrame(step); if (main) cuRaf = r1; else cuRaf2 = r1; }" },
  { find: "  // ---------- Flujo hasta la hoja final (UI-11 / UI-13) ----------",
    repl: "  window.__aud08CountUp = function () { var S = VB.Audio.stats; window.__cuBase = [S.count | 0, S.countEnd | 0]; window.__cuLog = []; countUp(el.end); };\n  // ---------- Flujo hasta la hoja final (UI-11 / UI-13) ----------" }
];
function enduiRoot() {
  const dst = path.join(OUT, 'endui-root'), js = path.join(dst, 'js');
  fs.rmSync(dst, { recursive: true, force: true }); fs.mkdirSync(js, { recursive: true });
  fs.copyFileSync(path.join(ROOT, 'index.html'), path.join(dst, 'index.html'));
  for (const f of fs.readdirSync(path.join(ROOT, 'js'))) if (/\.js$/.test(f)) fs.copyFileSync(path.join(ROOT, 'js', f), path.join(js, f));
  fs.copyFileSync(FILE, path.join(js, 'audio.js'));
  let ui = fs.readFileSync(path.join(ROOT, 'js', 'ui.js'), 'utf8').replace(/\r\n/g, '\n');
  const wired = ui.indexOf("VB.Audio.ui('count'") >= 0, missing = [];
  if (!wired) for (const p of UI_PATCH) { if (ui.indexOf(p.find) < 0) missing.push(p.id); else ui = ui.replace(p.find, p.repl); }
  let probe = true;
  for (const p of UI_PROBE) { if (ui.indexOf(p.find) < 0) probe = false; else ui = ui.replace(p.find, p.repl); }
  fs.writeFileSync(path.join(js, 'ui.js'), ui);
  return { dst, wired, missing, probe };
}
async function enduiReport() {
  const CDP = require('./cdp.js'), R = enduiRoot(), rows = [], ok = (name, pass, info) => rows.push({ name, pass: !!pass, info });
  if (R.missing.length) ok('ui.js snippet (notes/ui_main.md) applies', false, 'anchors not found: ' + R.missing.join(', ') + ' (ui.js changed: update UI_PATCH and the note)');
  else ok('ui.js snippet (notes/ui_main.md) applies', R.probe, R.wired ? 'ui.js already wired by ui_main: tested as is' : UI_PATCH.length + ' changes applied to a scratch copy' + (R.probe ? '' : ' · probes missing'));
  const url = q => require('url').pathToFileURL(path.join(R.dst, 'index.html')).href + '?' + q;
  const waitFor = async (page, expr, ms) => { const t = Date.now(); while (Date.now() - t < ms) { if (await page.evalJs(expr)) return true; await CDP.sleep(100); } return false; };
  const tap = async (page, x, y) => { for (const type of ['mousePressed', 'mouseReleased']) await page.send('Input.dispatchMouseEvent', { type, x, y, button: 'left', clickCount: 1 }); };
  for (const sz of [{ size: '1280x720', touch: false, at: [1150, 420] }, { size: '844x390', touch: true, at: [760, 60] }]) {
    const page = await CDP.open({ size: sz.size, touch: sz.touch, flags: ['--autoplay-policy=no-user-gesture-required'] });
    try {
      await page.send('Page.navigate', { url: url('debug=end') });
      await waitFor(page, "window.VB && VB.ctx && VB.ctx.state === 'over' && !document.getElementById('end').hidden", 20000);
      if (sz.touch) { await page.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: sz.at[0], y: sz.at[1] }] }); await page.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] }); }
      else await tap(page, sz.at[0], sz.at[1]);
      const ready = await waitFor(page, "VB.Audio.contextState() === 'running' && VB.Audio.ready() >= 1", 20000);
      await CDP.sleep(400);
      const r = await page.evalJs(`(async () => {
        const S = VB.Audio.stats, c0 = S.count | 0, e0 = S.countEnd | 0, m0 = S.mvp | 0;
        window.__aud08CountUp();
        await new Promise(r => setTimeout(r, 1400));
        const L = window.__cuLog || [], d = VB.Audio._debug();
        return { log: L, base: window.__cuBase || [c0, e0], ticks: (S.count | 0) - c0, locks: (S.countEnd | 0) - e0, mvp: (S.mvp | 0) - m0, endFocus: d.endFocus, win: document.getElementById('end').classList.contains('win'),
          mvpCards: document.querySelectorAll('#endMvp .mvp').length, played: { mvpWin: S.played.mvpWin | 0, mvpLose: S.played.mvpLose | 0 }, fps: 0 };
      })()`, true);
      const L = r.log, last = L[L.length - 1] || [], frame = L.length > 2 ? (L[L.length - 1][0] - L[0][0]) / (L.length - 1) : 16.7;
      const tickFrames = [], lockFrames = []; let pc = r.base[0], pe = r.base[1];
      for (const x of L) { if (x[4] > pc) tickFrames.push(x[0]); if (x[5] > pe) lockFrames.push(x[0]); pc = x[4]; pe = x[5]; }
      const iv = tickFrames.slice(1).map((t, i) => t - tickFrames[i]);
      let win = 0; for (const a of tickFrames) win = Math.max(win, tickFrames.filter(b => b >= a && b < a + 1000).length);
      const lockLag = lockFrames.length ? (lockFrames[0] - last[0]) / frame : NaN;                    // frames between the clac and the last count-up frame
      const audioLag = last[7] && last[1] ? (last[7] - last[1]) : NaN;                                 // ms: audio's clock of the clac vs the last frame
      const afterTicks = tickFrames.filter(t => t > last[0]).length;
      ok('a. ' + sz.size + (sz.touch ? ' touch' : '') + ': count-up ticks ≤ 20/s, spaced like the numbers',
        ready && r.ticks >= 4 && r.ticks <= 12 && (iv.length ? Math.min.apply(null, iv) >= 45 : false) && win <= 20,
        r.ticks + ' ticks over ' + L.length + ' frames (' + frame.toFixed(1) + ' ms), intervals ' + iv.map(Math.round).join(' ') + ' ms, max/s ' + win + (ready ? '' : ' · bank not ready'));
      ok('a. ' + sz.size + (sz.touch ? ' touch' : '') + ': ticks stop when the count-up ends (clac in its last frame, ±1 frame)',
        r.locks === 1 && Math.abs(lockLag) <= 1 && afterTicks === 0 && last[2] === 1 && Math.abs(audioLag) <= frame,
        'clac ' + (isFinite(lockLag) ? (lockLag === 0 ? 'in the last frame' : lockLag.toFixed(1) + ' frames off') : 'missing') + ' (audio clock ' + (isFinite(audioLag) ? audioLag.toFixed(1) : '?') + ' ms after the frame), ticks after the end ' + afterTicks + ', count-up ' + Math.round(last[0] - L[0][0]) + ' ms');
      ok('a. ' + sz.size + (sz.touch ? ' touch' : '') + ': MVP sting once, crowd focus on the sheet',
        r.mvp === 1 && r.endFocus && r.mvpCards > 0 && (r.win ? r.played.mvpWin : r.played.mvpLose) >= 1,
        'mvp ' + r.mvp + ' (' + (r.win ? 'mvpWin' : 'mvpLose') + ', ' + r.mvpCards + ' MVP cards), endFocus ' + r.endFocus);
      if (page.errors.length) ok('a. ' + sz.size + ': no page errors', false, page.errors.slice(0, 3).join(' | '));
    } finally { page.close(); }
  }
  // b. menu: arrows and settings in the real menu (audio unlocked by a real click on the empty right side of the menu)
  {
    const page = await CDP.open({ size: '1280x720', flags: ['--autoplay-policy=no-user-gesture-required'] });
    try {
      await page.send('Page.navigate', { url: url('debug=menu') });
      await waitFor(page, "window.VB && VB.ctx && VB.ctx.state === 'menu' && document.getElementById('optDiff')", 20000);
      await CDP.sleep(2500); await tap(page, 1180, 360);
      await waitFor(page, "VB.Audio.contextState() === 'running' && VB.Audio.ready() >= 1", 20000);
      const r = await page.evalJs(`(async () => {
        const S = VB.Audio.stats, UI = /^(click|hover|back|start|arwHover|optHover|stepUp|stepDown|arwEdge|tglOn|tglOff|optSel|cntTick|cntLock)$/; // UI sounds only (the menu demo plays its own game sounds)
        const P = () => Object.assign({}, S.played), d = (a, b) => { const o = {}; for (const k in b) if (UI.test(k) && (b[k] | 0) !== (a[k] | 0)) o[k] = (b[k] | 0) - (a[k] | 0); return o; };
        const w = ms => new Promise(r => setTimeout(r, ms)), out = {};
        const arr = s => document.querySelector('#optDiff .arr[data-d="' + s + '"]');
        VB.ctx.actions.setSetting('difficulty', 'easy'); await w(200);
        let p = P(); arr(-1).click(); await w(250); out.edge = d(p, P());
        p = P(); arr(1).click(); await w(250); out.up = d(p, P()); out.lvl = VB.ctx.settings.difficulty;
        p = P(); arr(-1).click(); await w(250); out.down = d(p, P());
        p = P(); arr(1).dispatchEvent(new PointerEvent('pointerenter', { pointerType: 'mouse' })); await w(150); out.hover = d(p, P());
        document.getElementById('btnSettings').click(); await w(700);
        const row = k => document.querySelector('#optList .opt[data-opt="' + k + '"]');
        p = P(); row('showHelp').click(); await w(250); out.toggle1 = d(p, P());
        p = P(); row('showHelp').click(); await w(250); out.toggle2 = d(p, P());
        p = P(); row('quality').click(); await w(250); out.select = d(p, P());
        p = P(); row('quality').dispatchEvent(new PointerEvent('pointerenter', { pointerType: 'mouse' })); await w(150); out.rowHover = d(p, P());
        VB.ctx.actions.setSetting('quality', 'auto'); VB.ctx.actions.setSetting('difficulty', 'normal');
        return out;
      })()`, true);
      const only = (o, k) => Object.keys(o).length === 1 && o[k] === 1;
      ok('b. menu: difficulty arrows → step up / step down / edge, own hover', only(r.edge, 'arwEdge') && only(r.up, 'stepUp') && only(r.down, 'stepDown') && r.lvl === 'normal' && (r.hover.arwHover | 0) === 1,
        'edge ' + JSON.stringify(r.edge) + ' · up ' + JSON.stringify(r.up) + ' (→ ' + r.lvl + ') · down ' + JSON.stringify(r.down) + ' · hover ' + JSON.stringify(r.hover));
      ok('b. settings: Sí/No toggle, multi-value option, own row hover', Object.keys(r.toggle1).length === 1 && Object.keys(r.toggle2).length === 1 && (r.toggle1.tglOn || r.toggle1.tglOff) && (r.toggle2.tglOn || r.toggle2.tglOff) && !(r.toggle1.tglOn && r.toggle2.tglOn) && only(r.select, 'optSel') && (r.rowHover.optHover | 0) === 1,
        'Ayudas ×2 ' + JSON.stringify(r.toggle1) + ' ' + JSON.stringify(r.toggle2) + ' · calidad ' + JSON.stringify(r.select) + ' · hover ' + JSON.stringify(r.rowHover));
      if (page.errors.length) ok('b. menu: no page errors', false, page.errors.slice(0, 3).join(' | '));
    } finally { page.close(); }
  }
  return rows;
}
function enduiTable(rows) {
  console.log('\n== 6. End sheet and menus in the real game (AUD-08: index.html + ui.js count-up, real WebAudio) ==');
  let bad = 0;
  for (const x of rows) { console.log(pad(x.name, 84) + (x.pass ? 'OK  ' : 'FAIL') + '  ' + x.info); if (!x.pass) bad++; }
  return bad;
}
/* ====================================================================
 * Part 7: sprints 2-4 (T6) on the mock engine
 *  rótulos (S3-C4): ui('rotulo', kind, team, delay) → true once, anti-repeat 0.5 s per kind, nothing in demo or before the
 *     gesture, ≤ 5 new voices (≤ 3 at low quality), layers per kind/team, toonSfx off drops the «clac», and the loudness of
 *     «ace con rótulo» (whistle + point, rótulo 0.6 s later) vs the usual ace: +0.5..+2 LU over 4 s; the hit's peak through the
 *     punch bus ≤ PUNCH_CEIL_LIGHT.
 *  rest (S2-B4/B5/B6, S3-C1, S4-D1): UI_KINDS, new ui() kinds (gaps, rank 0, beat pitch), medal(m) → the drillEnd sting,
 *     introStart(dur) keeps the bed half-ducked on a long intro (and is unchanged without dur), replay(on): crowd -6 dB and no
 *     crowd reaction / match state from events with e.replay.
 * ==================================================================== */
const ROT_DELTA = [0.5, 2.0], PUNCH_CEIL_LIGHT = 0.5;
async function s234Report(file, rotOnly) {
  const rows = [], ok = (name, pass, info) => rows.push({ name, pass: !!pass, info: info || '' });
  const { A, C, mock, vctx } = await mockEngine(file);
  const realRandom = Math.random;
  const fresh = () => { A.onGameStart({ demo: false }); A.onState('playing'); C.currentTime += 20; return mock.started.length; };
  const since = mark => mock.started.slice(mark).filter(s => !s.cancelled);
  const names = recs => recs.map(s => nameOfBuf(A, s.src.buffer));
  const count = (arr, n) => arr.filter(x => x === n).length;
  const G = { mode: 'point', players: [], rally: { t: 0, hits: 0 }, serving: 0, matchPoint: -1, setPoint: -1, lastKind: 'serve' };

  // ---------- rótulos ----------
  {
    let m = fresh(); const n0 = A._debug().rot.n;
    const r1st = A.ui('rotulo', 'ace', 0, 0.16), n1 = A._debug().rot.n, recs = names(since(m));
    C.currentTime += 0.2; const r2nd = A.ui('rotulo', 'ace', 0, 0.16);
    const rMuro = A.ui('rotulo', 'muro', 0, 0.16);                                             // another kind: its own anti-repeat
    C.currentTime += 0.4; const r3rd = A.ui('rotulo', 'ace', 0, 0.16);
    ok('rot a. ace → true, rot.n +1; again 0.2 s later → false; 0.6 s later → true', r1st && n1 === n0 + 1 && !r2nd && r3rd && A._debug().rot.last === 'ace',
      'first ' + r1st + ' (rot.n ' + n0 + '→' + n1 + ', layers ' + recs.join(' ') + '), +0.2 s ' + r2nd + ', muro at +0.2 s ' + rMuro + ', +0.6 s ' + r3rd);
    ok('rot a2. ace layers: slamSub + clac + 2 bombos + roar (≤ 5 voices)', recs.length <= 5 && count(recs, 'slamSub') === 1 && count(recs, 'cntLock') === 1 && count(recs, 'bombo') === 2 && count(recs, 'roar') === 1, recs.join(' '));
    // delay: the hit lands `delay` s after the call
    m = fresh(); A.ui('rotulo', 'ace', 0, 0.16); const hit = since(m).find(s => nameOfBuf(A, s.src.buffer) === 'slamSub');
    ok('rot a3. the hit lands with the text (delay 0.16 s)', hit && Math.abs(hit.when - hit.at - 0.16) < 1e-6, hit ? 'slamSub at +' + (hit.when - hit.at).toFixed(3) + ' s' : 'no slamSub');
    // demo / before the gesture
    A.onGameStart({ demo: true }); C.currentTime += 20; const rDemo = A.ui('rotulo', 'ace', 0, 0.16); A.onGameStart({ demo: false });
    const cold = loadAudio(file).VB.Audio; let rCold; try { rCold = cold.ui('rotulo', 'ace', 0, 0.16); } catch (e) { rCold = 'throws: ' + e.message; }
    ok('rot b. demo → false; before the first gesture → false (no throw)', rDemo === false && rCold === false, 'demo ' + rDemo + ', cold ' + rCold);
    // low quality
    A.setQuality({ rank: 0 }); m = fresh(); A.ui('rotulo', 'ace', 0, 0.16); const lowAce = names(since(m));
    m = fresh(); A.ui('rotulo', 'sp', 0, 0.16); const lowSp = names(since(m));
    m = fresh(); A.ui('rotulo', 'mp', 1, 0.16); const lowMp = names(since(m)); A.setQuality({ rank: 1 });
    ok('rot c. setQuality({rank:0}) → at most 3 new voices (ace / sp mine / mp rival)', lowAce.length <= 3 && lowSp.length <= 3 && lowMp.length <= 3 && lowAce.length > 0,
      'ace ' + lowAce.join(' ') + ' · sp ' + lowSp.join(' ') + ' · mp rival ' + lowMp.join(' '));
    // layers by team, toon off
    m = fresh(); A.ui('rotulo', 'sp', 0, 0.16); const spMine = names(since(m));
    m = fresh(); A.ui('rotulo', 'sp', 1, 0.16); const spRiv = names(since(m));
    A.setToon(false); m = fresh(); A.ui('rotulo', 'muro', 0, 0.05); const noToon = names(since(m)); A.setToon(true);
    const bad = A.ui('rotulo', 'nope', 0, 0.16);
    ok('rot d. sp mine → roar + bombo; sp rival → ooh; toonSfx off → no clac; unknown kind → false', count(spMine, 'roar') === 1 && count(spMine, 'bombo') === 1 && count(spRiv, 'ooh') === 1 && !spRiv.includes('roar') && !noToon.includes('cntLock') && noToon.includes('slamSub') && bad === false,
      'mine ' + spMine.join(' ') + ' · rival ' + spRiv.join(' ') + ' · toon off ' + noToon.join(' ') + ' · unknown ' + bad);
    // loudness: whistle + ace point, rótulo 0.6 s later, vs the usual ace (same variant picks: seeded Math.random)
    const ev = h => [{ type: 'whistle', reason: 'point' }, { type: 'point', team: 0, reason: 'in', how: 'ace', rallyHits: 1, lastKind: 'serve', highlight: h }];
    const res = [];
    for (const h of [0.35, 0.55, 0.8]) {
      let eB = 0, eR = 0, eBc = 0, eRc = 0, pk = 0;
      for (let k = 0; k < 6; k++) {
        for (const withRot of [false, true]) {
          Math.random = seeded(4242 + k * 31 + Math.round(h * 100));
          m = fresh(); A.handle(ev(h), G);
          if (withRot) { C.currentTime += 0.6; A.ui('rotulo', 'ace', 0, 0.16); C.currentTime -= 0.6; }
          const recs = since(m), mx = mixRecords(recs), crowd = mixRecords(recs.filter(s => /^(roar|applause|bombo|groan|ooh)$/.test(nameOfBuf(A, s.src.buffer))));
          const e = Math.pow(10, (stLoud(mx, 4) + 0.691) / 10), ec = crowd ? Math.pow(10, (stLoud(crowd, 4) + 0.691) / 10) : 0;
          if (withRot) { eR += e; eRc += ec; const sub = mixRecords(recs.filter(s => nameOfBuf(A, s.src.buffer) === 'slamSub')); if (sub) pk = Math.max(pk, M.peak([sub.L, sub.R])); }
          else { eB += e; eBc += ec; }
        }
      }
      Math.random = realRandom;
      res.push({ h, d: M.LU(eR / 6) - M.LU(eB / 6), dc: M.LU(eRc / 6) - M.LU(eBc / 6), base: M.LU(eB / 6), pk });
    }
    const worst = res.reduce((a, r) => Math.max(a, r.d), -99), least = res.filter(r => r.h < 0.8).reduce((a, r) => Math.min(a, r.d), 99), pkMax = res.reduce((a, r) => Math.max(a, r.pk), 0);
    ok('rot e. «ace con rótulo» vs ace: +' + ROT_DELTA[0] + '..+' + ROT_DELTA[1] + ' LU (4 s, whistle + point; h 0.35/0.55; h 0.8 ≤ +' + ROT_DELTA[1] + ')', least >= ROT_DELTA[0] && worst <= ROT_DELTA[1],
      res.map(r => 'h ' + r.h + ': ' + (r.d >= 0 ? '+' : '') + r1(r.d) + ' LU (ace ' + r1(r.base) + ' LUFS; crowd alone ' + (r.dc >= 0 ? '+' : '') + r1(r.dc) + ')').join(' · '));
    ok('rot f. the hit through the punch bus: peak ≤ PUNCH_CEIL_LIGHT (' + PUNCH_CEIL_LIGHT + ')', pkMax > 0 && pkMax <= PUNCH_CEIL_LIGHT * 1.001, 'peak ' + pkMax.toFixed(3) + ' (' + r1(M.db(pkMax)) + ' dBFS)');
  }
  if (rotOnly) return rows;

  // ---------- new ui() kinds ----------
  {
    const NEW = ['tab', 'panelIn', 'panelOut', 'beat', 'rank', 'unlock', 'rotulo', 'medal'];
    const K = A.UI_KINDS || [];
    ok('ui a. VB.Audio.UI_KINDS lists the 8 new kinds (frozen) and the old ones', Array.isArray(K) && NEW.every(k => K.includes(k)) && ['click', 'back', 'start', 'wipe', 'count', 'mvp', 'select'].every(k => K.includes(k)) && Object.isFrozen(K),
      K.length + ' kinds' + (Object.isFrozen(K) ? ', frozen' : ', NOT frozen'));
    const cold = loadAudio(file).VB.Audio; let coldOut = [];
    try { coldOut = ['tab', 'panelIn', 'panelOut', 'beat', 'rank', 'unlock', 'medal'].map(k => cold.ui(k, 1)); } catch (e) { coldOut = ['throws ' + e.message]; }
    ok('ui b. every new kind is a silent false before the first gesture', coldOut.every(x => x === false), coldOut.join(' '));
    let m = fresh(); const got = {};
    for (const k of ['tab', 'panelIn', 'panelOut', 'unlock']) { const mk = mock.started.length; got[k] = [A.ui(k), names(since(mk)).join('+')]; }
    let mk = mock.started.length; const b1 = A.ui('beat', 1), rb1 = since(mk).find(s => nameOfBuf(A, s.src.buffer) === 'cntLock');
    C.currentTime += 0.3; mk = mock.started.length; const b2 = A.ui('beat', 2), rb2 = since(mk).find(s => nameOfBuf(A, s.src.buffer) === 'cntLock');
    ok('ui c. tab / panelIn / panelOut / unlock sound once; beat C higher than beat B', Object.keys(got).every(k => got[k][0] === true) && b1 && b2 && rb1 && rb2 && rb2.src.playbackRate.value > rb1.src.playbackRate.value,
      Object.keys(got).map(k => k + ' ' + got[k][1]).join(' · ') + ' · beat B ×' + (rb1 ? rb1.src.playbackRate.value.toFixed(2) : '?') + ' C ×' + (rb2 ? rb2.src.playbackRate.value.toFixed(2) : '?'));
    m = fresh(); const t1 = A.ui('tab'); C.currentTime += 0.05; const t2 = A.ui('tab'); C.currentTime += 0.05; const t3 = A.ui('tab');
    const p1 = A.ui('panelIn'), p2 = A.ui('panelOut');
    ok('ui d. tab anti-repeat 0.08 s (each kind its own gap)', t1 && !t2 && t3 && p1 && p2, 'tab ' + t1 + ' / +0.05 ' + t2 + ' / +0.10 ' + t3 + ' · panelIn ' + p1 + ' panelOut ' + p2 + ' in the same instant');
    m = fresh(); const r0 = A.ui('rank', 0), n0 = since(m).length; const rU = A.ui('rank', 1), up = names(since(m)); C.currentTime += 0.3; mk = mock.started.length; const rD = A.ui('rank', -2), dn = names(since(mk));
    ok('ui e. rank 0 → nothing; rank > 0 → step up (+glint); rank < 0 → step down', r0 === false && n0 === 0 && rU && up.includes('stepUp') && rD && dn.includes('stepDown') && !dn.includes('stepUp'), 'rank0 ' + r0 + ' (' + n0 + ' voices) · up ' + up.join('+') + ' · down ' + dn.join('+'));
    const medal = {};
    for (const mm of [3, 2, 1, 0]) { fresh(); const mk2 = mock.started.length; medal[mm] = [A.ui('medal', mm), names(since(mk2)).join('+')]; }
    fresh(); A.ui('medal', 2); C.currentTime += 0.5; const mRep = A.ui('medal', 2);
    ok('ui f. medal(m): oro setWin, plata mvpWin, bronce clac, sin medalla mvpLose; anti-repeat 1 s', medal[3][1] === 'setWin' && medal[2][1] === 'mvpWin' && medal[1][1] === 'cntLock' && medal[0][1] === 'mvpLose' && [3, 2, 1, 0].every(x => medal[x][0]) && mRep === false,
      [3, 2, 1, 0].map(x => x + ' ' + medal[x][1]).join(' · ') + ' · again at +0.5 s ' + mRep);
    // drillEnd still plays the same burst (refactor)
    fresh(); mk = mock.started.length; A.handle([{ type: 'drillEnd', kind: 'serve', total: 30 }], G); const de = names(since(mk));
    ok('ui g. drillEnd unchanged (gold → setWin 0.4 s later)', de.join('+') === 'setWin' && Math.abs(since(mk)[0].when - since(mk)[0].at - 0.4) < 1e-6, de.join('+'));
  }

  // ---------- introStart(dur) ----------
  {
    const run = (fn, marks) => {
      fresh(); A.onState('playing'); const gs = { mode: 'serve', serving: 1, players: [], rally: { t: 0, hits: 0 }, matchPoint: -1, setPoint: -1, serveState: 'ready' };
      for (let f = 0; f < 120; f++) { A.update(gs, 1 / 60); C.currentTime += 1 / 60; }         // settle the bed
      const ref = A._debug().bed; fn(); const out = [];
      let t = 0, i = 0;
      for (let f = 0; f < 60 * 7.5 && i < marks.length; f++) { A.update(gs, 1 / 60); C.currentTime += 1 / 60; t += 1 / 60; if (t >= marks[i]) { out.push(A._debug().bed / ref); i++; } }
      return out;
    };
    const marks = [1, 4, 5.4, 7.2];
    const old = run(() => A.sting('intro'), marks), long = run(() => A.introStart(6), marks), short = run(() => A.introStart(2.5), marks), mid = run(() => A.introStart(4.5), marks);
    const f = a => a.map(x => x.toFixed(2)).join('/');
    const near = (a, b) => a.every((x, i) => Math.abs(x - b[i]) < 0.02);
    ok('intro a. introStart(6): bed ducked to 3 s, half (-3 dB) to 5.7 s, back after', long[0] < 0.55 && long[1] > 0.6 && long[1] < 0.8 && long[2] > 0.6 && long[2] < 0.8 && long[3] > 0.93,
      'bed vs before at 1/4/5.4/7.2 s: ' + f(long) + ' (old ' + f(old) + ')');
    ok('intro b. introStart(4.5): half to 4.2 s; introStart(2.5) and sting(\'intro\') unchanged', mid[1] > 0.6 && mid[1] < 0.8 && mid[2] > 0.9 && near(short, old) && old[1] > 0.93,
      '4.5 s: ' + f(mid) + ' · 2.5 s: ' + f(short) + ' · sting: ' + f(old));
    A.onState('menu'); A.onState('playing');
  }

  // ---------- replay(on) ----------
  {
    fresh(); const gs = { mode: 'point', players: [], rally: { t: 0, hits: 0 }, matchPoint: -1, setPoint: -1, serving: 0 };
    A.update(gs, 1 / 60); const c0 = A._debug().crowd;
    A.replay(true); A.update(gs, 1 / 60); const c1 = A._debug().crowd;
    const re0 = A.stats.react, mk = mock.started.length;
    A.handle([{ type: 'whistle', reason: 'point', replay: true }, { type: 'point', team: 0, reason: 'in', how: 'block', rallyHits: 6, highlight: 0.9, replay: true },
      hitE('spike', { touch: 3, speed: 22, replay: true }), { type: 'block', result: 'stuff', x: 0.3, y: 1, z: 3, team: 0, replay: true, player: { x: 0.4, y: 1, z: 0.5, team: 0 } },
      { type: 'set', team: 0, sets: [1, 0], replay: true }], gs);
    const nm = names(since(mk)), crowd = nm.filter(n => /^(roar|applause|groan|ooh|bombo|palmas)$/.test(n)), stings = nm.filter(n => /Win|Lose/.test(n));
    const dbg = A._debug().replay, re1 = A.stats.react;
    A.replay(false); A.update(gs, 1 / 60); const c2 = A._debug().crowd;
    fresh(); const mk2 = mock.started.length; A.handle([{ type: 'point', team: 0, reason: 'in', how: 'block', rallyHits: 6, highlight: 0.9 }], gs); const liveCrowd = names(since(mk2)).length;
    ok('replay a. replay(true): crowd bus -6 dB; replay(false) restores it', Math.abs(c1 / c0 - 0.5) < 0.01 && Math.abs(c2 - c0) < 1e-6 && dbg.on, 'crowd ' + c0.toFixed(3) + ' → ' + c1.toFixed(3) + ' → ' + c2.toFixed(3) + ' (replay n ' + dbg.n + ')');
    ok('replay b. events with e.replay: hits and whistle sound, no crowd reaction / stings / react', crowd.length === 0 && stings.length === 0 && re1 === re0 && nm.includes('spike') && nm.some(n => /^whistle/.test(n)) && liveCrowd > 0,
      'played ' + nm.join(' ') + ' · react ' + re0 + '→' + re1 + ' · cut ' + dbg.cut + ' · live point → ' + liveCrowd + ' crowd layers');
  }
  return rows;
}
function s234Table(rows) {
  console.log('\n== 7. Sprints 2-4 (T6): rótulos, new ui() kinds, medal, introStart(dur), replay(on) — mock engine ==');
  let bad = 0;
  for (const x of rows) { console.log(pad(x.name, 96) + (x.pass ? 'OK  ' : 'FAIL') + '  ' + x.info); if (!x.pass) bad++; }
  return bad;
}

/* ====================================================================
 * Part 8: xaranga (21-nov-2026) — the stand brass band. Engine logic on the mock context (VB.Audio.xarState()).
 * ==================================================================== */
async function xarReport(file) {
  const rows = [], ok = (name, pass, info) => rows.push({ name, pass: !!pass, info: info || '' });
  const { A, C, mock, vctx } = await mockEngine(file);
  if (!A.xarState) { ok('xaranga: VB.Audio.xarState() exists', false, 'missing'); return rows; }
  const r3 = v => Math.round(v * 1000) / 1000;
  const names = recs => recs.map(s => nameOfBuf(A, s.src.buffer));
  const since = mark => mock.started.slice(mark).filter(s => !s.cancelled);
  const HARD = { mode: 'point', players: [], rally: { t: 0, hits: 0 }, serving: 0, matchPoint: -1, setPoint: -1, lastKind: 'spike', difficulty: 'hard' };
  const g = o => Object.assign({}, HARD, o || {});
  const fresh = (gg) => { vctx.state = 'playing'; vctx.game = gg || g(); A.onGameStart(vctx.game); A.onState('playing'); C.currentTime += 30; A.update(vctx.game, 1 / 60); return mock.started.length; };
  const pt = (team, o) => Object.assign({ type: 'point', team, reason: 'in', how: 'kill', rallyHits: 4, lastKind: 'spike', highlight: 0.4, streak: 1, hold: 2.4 }, o || {});
  const xarRecs = mk => since(mk).filter(s => /^xar/.test(nameOfBuf(A, s.src.buffer)));

  // 0. where it plays: XAR_WHEN (Ferran: Career + «good» matches = Hard/Expert outside the Career)
  {
    const on = gg => { vctx.game = gg; A.onGameStart(gg); return A.xarState().on; };
    const res = { normal: on(g({ difficulty: 'normal' })), easy: on(g({ difficulty: 'easy' })), hard: on(g({ difficulty: 'hard' })), expert: on(g({ difficulty: 'expert' })),
      careerNormal: on(g({ difficulty: 'normal', career: { id: 1 } })), careerEasy: on(g({ difficulty: 'easy', career: { id: 1 } })), demo: on(g({ demo: true })), drill: on(g({ drill: { kind: 'serve' } })) };
    ok('xar 0. plays in the Career (any level) and in Hard/Expert matches; never Easy/Normal outside it, demo or drill',
      !res.normal && !res.easy && res.hard && res.expert && res.careerNormal && res.careerEasy && !res.demo && !res.drill, JSON.stringify(res) + ' · XAR_WHEN ' + JSON.stringify(A.XAR_WHEN));
  }
  // 1. home streak of 3 → march loop, on the chant grid
  let mk = fresh();
  A.handle([pt(0, { streak: 1 })], vctx.game); C.currentTime += 3; A.handle([pt(0, { streak: 2 })], vctx.game); C.currentTime += 3;
  const s1a = A.xarState().cur; A.handle([pt(0, { streak: 3 })], vctx.game);
  const st1 = A.xarState(), ch = A._debug().chant, pasa = xarRecs(mk).filter(s => nameOfBuf(A, s.src.buffer) === 'xarPasa');
  ok('xar 1. streak 3 of the home team → xarPasa in a loop, t0 = chant t0 (±1 ms); nothing before the 3rd point',
    s1a === null && st1.cur === 'xarPasa' && pasa.length === 1 && pasa[0].src.loop && Math.abs(st1.t0 - ch.t0) <= 0.001,
    'before ' + s1a + ' · cur ' + st1.cur + ' loop ' + (pasa[0] && pasa[0].src.loop) + ' · t0 ' + r3(st1.t0 - C.currentTime) + ' s vs chant ' + r3(ch.t0 - C.currentTime) + ' s');
  // 1b. another streak point while it plays: no second loop, the new claps land on the loop's grid
  C.currentTime += 3; const mk1b = mock.started.length;
  A.handle([pt(0, { streak: 4 })], vctx.game);
  const ch2 = A._debug().chant, grid = (ch2.t0 - st1.t0) / 0.42;
  ok('xar 1b. streak 4 while the march plays: same loop, the new chant claps on its beat grid', A.xarState().cur === 'xarPasa' && xarRecs(mk1b).length === 0 && Math.abs(grid - Math.round(grid)) < 1e-3,
    'new xar sources ' + xarRecs(mk1b).length + ' · chant t0 − loop t0 = ' + r3(grid) + ' beats');
  // 6. ducking: ball in play 0.3, pause 0.45, replay 0.5, back to 1
  {
    const gr = g({ mode: 'rally', rally: { t: 2, hits: 2 } }); A.update(gr, 1 / 60); const dR = A.xarState().duck;
    vctx.state = 'paused'; A.onState('paused'); A.update(gr, 1 / 60); const dP = A.xarState().duck;
    vctx.state = 'playing'; A.onState('playing'); A.replay(true); A.update(g(), 1 / 60); const dRp = A.xarState().duck; A.replay(false);
    A.update(g(), 1 / 60); const d1 = A.xarState().duck;
    ok('xar 6. ducking: ball in play 0.3 (-10 dB), pause 0.45, replay 0.5, between points 1; the march survives', dR === 0.3 && dP === 0.45 && dRp === 0.5 && d1 === 1 && A.xarState().cur === 'xarPasa',
      'rally ' + dR + ' · pause ' + dP + ' · replay ' + dRp + ' · point ' + d1 + ' · cur ' + A.xarState().cur);
  }
  // 5. every whistle opens a hole in the band (N.xarW to 0 during the whistle, back to 1)
  {
    const h0 = A.xarState().holes; A.handle([{ type: 'whistle', reason: 'serve' }], vctx.game); const h1 = A.xarState();
    A.handle([{ type: 'courtChange', why: 'eight' }], vctx.game); const h2 = A.xarState().holes;
    ok('xar 5. whistles open the hole (serve whistle and court change: 2 holes; back to 1 after)', h1.holes === h0 + 1 && h2 === h0 + 2 && h1.hole === 1, 'holes ' + h0 + ' → ' + h1.holes + ' → ' + h2 + ' · gain after ' + h1.hole);
  }
  // 2. rival point → the march stops within 0.5 s
  {
    const rec = pasa[0]; let stopAt = null; const st0 = rec.src.stop; rec.src.stop = function (w) { stopAt = w; return st0.call(this, w); };
    C.currentTime += 3; const t = C.currentTime; A.handle([pt(1)], vctx.game);
    ok('xar 2. rival point → the march deflates and stops (≤ 0.5 s)', A.xarState().cur === null && stopAt != null && stopAt - t <= 0.5, 'cur ' + A.xarState().cur + ' · stop at +' + (stopAt == null ? '-' : r3(stopAt - t)) + ' s');
  }
  // 3. set point serve → snare roll, crescendo; serve whistle → stops
  {
    const mk3 = fresh(); const gs = g({ mode: 'serve', setPoint: 0 });
    A.handle([{ type: 'serveReady', team: 0, player: P0, setPoint: 0, matchPoint: -1 }], gs); const c3 = A.xarState();
    const rr = xarRecs(mk3); C.currentTime += 0.7; A.handle([{ type: 'whistle', reason: 'serve' }], gs); const c3b = A.xarState();
    const mk3c = mock.started.length; A.handle([{ type: 'serveReady', team: 1, player: P0, setPoint: -1, matchPoint: -1 }], g({ mode: 'serve' }));
    ok('xar 3. serveReady on a set point → xarRedoble loop; serve whistle → silence; plain serveReady → nothing', c3.cur === 'xarRedoble' && rr.length === 1 && rr[0].src.loop && c3b.cur === null && xarRecs(mk3c).length === 0,
      'cur ' + c3.cur + ' → after whistle ' + c3b.cur + ' · plain serve ' + xarRecs(mk3c).length + ' sources');
  }
  // 4. rival serve error → out-of-tune trumpet at +0.75 s (lastKind or reason); never in a neutral venue
  {
    let m4 = fresh(); const ta = C.currentTime; let t = ta; A.handle([pt(0, { how: 'error', reason: 'out', lastKind: 'serve' })], vctx.game);
    const a = A.xarState(), ra = xarRecs(m4);
    C.currentTime += 3; m4 = mock.started.length; t = C.currentTime; A.handle([pt(0, { how: 'error', reason: 'serve', lastKind: '' })], vctx.game);
    const rb = xarRecs(m4), tb = rb.length ? rb[0].when - t : -1;
    C.currentTime += 3; m4 = mock.started.length; A.handle([pt(0, { how: 'error', reason: 'out', lastKind: 'spike' })], vctx.game); const rc = xarRecs(m4);
    fresh(); A.handle([{ type: 'amb:start', amb: true, home: -1, heat: 0.3 }], vctx.game); m4 = mock.started.length;
    A.handle([pt(0, { how: 'error', reason: 'out', lastKind: 'serve' })], vctx.game); const rn = xarRecs(m4);
    ok('xar 4. rival serve fault → xarDesafina at +0.75 s (lastKind serve or reason serve); spike error → nothing; neutral venue → nothing',
      a.shot === 'xarDesafina' && ra.length === 1 && Math.abs(ra[0].when - (a.shotT0)) < 1e-6 && Math.abs(a.shotT0 - (ta + 0.75)) < 1e-6 && rb.length === 1 && Math.abs(tb - 0.75) < 1e-6 && rc.length === 0 && rn.length === 0,
      'lastKind serve: ' + names(ra).join(' ') + ' · reason serve: +' + r3(tb) + ' s · spike error: ' + rc.length + ' · neutral: ' + rn.length);
  }
  // 4b. out-of-tune trumpet on a streak point: the march enters on the first free beat after it
  {
    const m = fresh(); A.handle([pt(0, { how: 'error', reason: 'out', lastKind: 'serve', streak: 3 })], vctx.game);
    const st = A.xarState(), rec = xarRecs(m), sh = rec.find(s => nameOfBuf(A, s.src.buffer) === 'xarDesafina'), pa = rec.find(s => nameOfBuf(A, s.src.buffer) === 'xarPasa');
    const shEnd = sh ? sh.when + sh.src.buffer.duration : 0, beats = pa ? (pa.when - A._debug().chant.t0) / 0.42 : NaN;
    ok('xar 4b. serve fault + streak 3: trumpet first, then the march on the chant grid, after the trumpet', sh && pa && pa.when >= shEnd - 1e-6 && Math.abs(beats - Math.round(beats)) < 1e-3 && st.cur === 'xarPasa',
      'trumpet ' + (sh ? r3(sh.when - C.currentTime) + '–' + r3(shEnd - C.currentTime) : '-') + ' s · march at ' + (pa ? r3(pa.when - C.currentTime) : '-') + ' s (' + r3(beats) + ' beats after the chant)');
  }
  // 10. away (amb home 1): the band is the rival's
  {
    let m = fresh(); A.handle([{ type: 'amb:start', amb: true, home: 1, heat: 0.4 }], vctx.game);
    A.handle([pt(0, { streak: 3 })], vctx.game); const mine = xarRecs(m).length;
    C.currentTime += 3; m = mock.started.length; A.handle([pt(1, { streak: 3 })], vctx.game); const riv = names(xarRecs(m));
    C.currentTime += 3; m = mock.started.length; A.handle([pt(1, { how: 'error', reason: 'out', lastKind: 'serve', streak: 4 })], vctx.game); const des = names(xarRecs(m));
    ok('xar 10. away: your streak → nothing; the home rival\'s streak → march; your serve fault → the out-of-tune trumpet', mine === 0 && riv.includes('xarPasa') && des.includes('xarDesafina'),
      'your streak ' + mine + ' · rival streak ' + riv.join(' ') + ' · your serve fault ' + des.join(' '));
  }
  // 10b. away in the Career with the Ambiente «Apagado» (no amb:start reaches audio.js): career.atHome false → still the rival's band
  {
    const ga = g({ difficulty: 'normal', career: { id: 1, atHome: false } });
    let m = fresh(ga); A.handle([pt(0, { streak: 3 })], ga); const mine = xarRecs(m).length;
    C.currentTime += 3; m = mock.started.length; A.handle([pt(1, { streak: 3 })], ga); const riv = names(xarRecs(m));
    ok('xar 10b. Career away with the Ambiente off: your streak → nothing; the home rival’s streak → march', mine === 0 && riv.includes('xarPasa'),
      'your streak ' + mine + ' · rival streak ' + riv.join(' '));
  }
  // 11. set or match won → the band stops, the stings play as always
  {
    const m = fresh(); A.handle([pt(0, { streak: 3 })], vctx.game); const before = A.xarState().cur; C.currentTime += 3;
    const m2 = mock.started.length; A.handle([pt(0, { streak: 5, setWon: true }), { type: 'set', team: 0, sets: [1, 0] }], vctx.game);
    const nm = names(since(m2));
    ok('xar 11. set won → band stops, setWin sting still plays', before === 'xarPasa' && A.xarState().cur === null && nm.includes('setWin') && !nm.some(n => /^xar/.test(n)), 'before ' + before + ' · after ' + A.xarState().cur + ' · ' + nm.filter(n => /Win|Lose|xar/.test(n)).join(' '));
  }
  // 7. never in the demo, a drill, the replay or under the presentation card
  {
    const cases = {};
    let m = fresh(g({ demo: true })); A.handle([pt(0, { streak: 3 }), pt(0, { how: 'error', lastKind: 'serve' })], vctx.game); cases.demo = xarRecs(m).length;
    m = fresh(g({ drill: { kind: 'free' } })); A.handle([pt(0, { streak: 3 })], vctx.game); cases.drill = xarRecs(m).length;
    m = fresh(); A.handle([pt(0, { streak: 3, replay: true })], vctx.game); cases.replay = xarRecs(m).length;
    m = fresh(); A.ui('intro'); A.handle([pt(0, { streak: 3 })], vctx.game); cases.intro = xarRecs(m).length; A.ui('introSkip');
    ok('xar 7. demo, drill, replay events and the presentation card → no band', cases.demo === 0 && cases.drill === 0 && cases.replay === 0 && cases.intro === 0, JSON.stringify(cases));
  }
  // 8. menu rehearsals: off by default (XAR_WHEN.menu); with it on, first at 4 s, never the same twice in a row
  {
    fresh(); vctx.state = 'menu'; A.onState('menu'); const gm = g({ demo: true, mode: 'rally' }); vctx.game = gm;
    let m = mock.started.length;
    for (let f = 0; f < 60 * 25; f++) { A.update(gm, 1 / 60); C.currentTime += 1 / 60; }
    const off = xarRecs(m).length;
    A.XAR_WHEN.menu = true; vctx.state = 'playing'; A.onState('playing'); A.update(g(), 1 / 60); vctx.state = 'menu'; A.onState('menu');
    m = mock.started.length; const t0 = C.currentTime;
    for (let f = 0; f < 60 * 45; f++) { A.update(gm, 1 / 60); C.currentTime += 1 / 60; }
    A.XAR_WHEN.menu = false;
    const rec = xarRecs(m), nm = names(rec), first = rec.length ? rec[0].when - t0 : -1;
    let rep = false; for (let i = 1; i < nm.length; i++) if (nm[i] === nm[i - 1]) rep = true;
    ok('xar 8. menu: no rehearsal with XAR_WHEN.menu off; on: first at 4 s (±0.1), then every 12-20 s, never the same twice', off === 0 && rec.length >= 2 && Math.abs(first - 4) <= 0.1 && !rep && nm.every(n => /^xarEns[123]$/.test(n)),
      'off ' + off + ' · on: ' + nm.join(' ') + ' · first at ' + r3(first) + ' s · menu duck ' + A.xarState().duck);
    vctx.state = 'playing'; A.onState('playing');
  }
  // 9. volume 0: nothing queued or played; raising it queues the pieces at the next qualifying match
  {
    const L = loadAudio(file), B = L.VB.Audio, mk9 = makeMock();
    L.root.AudioContext = mk9.Ctx; L.root.requestIdleCallback = fn => setImmediate(() => fn({ timeRemaining: () => 50, didTimeout: false })); L.root.setTimeout = setTimeout; L.root.clearTimeout = clearTimeout;
    const vc = { camera: { position: { x: CAM.x, y: 4, z: -CAM.y } }, state: 'playing', timeScale: 1, settings: { xarVol: 0 } };
    B.init(vc); const gg = g(); vc.game = gg; B.onGameStart(gg); B.onState('playing'); B.unlock();
    for (let i = 0; i < 20000 && (B.ready() < 1); i++) await new Promise(r => setImmediate(r));
    const C9 = mk9.started[0].src.context; C9.currentTime += 30;
    B.handle([pt(0, { streak: 3 }), pt(0, { how: 'error', lastKind: 'serve' })], gg);
    const q0 = B.xarState().queued, any0 = mk9.started.some(s => s.src.buffer && s.src.buffer.length > 30000 && /^xar/.test(nameOfBuf(B, s.src.buffer))), banked0 = B.XAR_SOUNDS.some(n => B._bank(n));
    B.onSettings({ xarVol: 0.6 }); const q1 = B.xarState().queued; B.handle([{ type: 'newMatch', demo: false, difficulty: 'hard' }], gg); const q2 = B.xarState().queued;
    for (let i = 0; i < 20000 && (B.ready() < 1); i++) await new Promise(r => setImmediate(r));
    ok('xar 9. xarVol 0 → no piece queued, synthesised or played; raised to 0.6 → queued at the next qualifying match (3 pieces, no rehearsals)',
      q0 === 0 && !any0 && !banked0 && B.getVolume('xaranga') === 0.6 && q2 === 3 && !!B._bank('xarPasa'),
      'vol 0: queued ' + q0 + ', banked ' + banked0 + ' · after raising: queued ' + q1 + ' → ' + q2 + ' at newMatch, xarPasa banked ' + !!B._bank('xarPasa'));
  }
  // 12. the slider sample: preview('xaranga') plays the first bar of the march and fades it at 0.9 s
  {
    fresh(); C.currentTime += 1; const m = mock.started.length; const p = A.preview('xaranga'); const rec = xarRecs(m);
    ok('xar 12. preview(\'xaranga\') → one xarPasa, not looped (slider sample)', p === true && rec.length === 1 && !rec[0].src.loop && nameOfBuf(A, rec[0].src.buffer) === 'xarPasa', 'preview ' + p + ' · ' + names(rec).join(' '));
  }
  // 13. no saturation: a big home streak point (ovation, bombo, chant claps) with the march on top, and the out-of-tune trumpet on
  //     a serve-fault point: the band adds ≤ 0.5 dB to the peak of the mix at the bus (before the compressor: the crowd of a big
  //     point already goes over 0 dBFS there and the master compressor + soft clip take it), and stays well under the crowd
  {
    const big = fresh(); A.update(vctx.game, 1 / 60);
    A.handle([pt(0, { streak: 5, highlight: 0.95, how: 'block', digs: 2 })], vctx.game);
    const recs = since(big), all = mixRecords(recs), band = mixRecords(recs.filter(s => /^xar/.test(nameOfBuf(A, s.src.buffer)))), crowd = mixRecords(recs.filter(s => !/^xar/.test(nameOfBuf(A, s.src.buffer))));
    const des = fresh(); A.handle([pt(0, { how: 'error', reason: 'out', lastKind: 'serve', highlight: 0.3, streak: 3 })], vctx.game); const all2 = mixRecords(since(des));
    const pk = all ? M.db(M.peak([all.L, all.R])) : 99, pk2 = all2 ? M.db(M.peak([all2.L, all2.R])) : 99, pc = crowd ? M.db(M.peak([crowd.L, crowd.R])) : 99, pb = band ? M.db(M.peak([band.L, band.R])) : 99;
    const lb = band ? M.integrated([band.L, band.R], band.sr) : -99, lc = crowd ? M.momentaryMax([crowd.L, crowd.R], crowd.sr) : -99;
    ok('xar 13. no saturation: the band adds ≤ 0.5 dB to the peak of a big streak point (bus, pre-compressor); band peak < -10 dBFS; serve-fault mix < -1 dBFS; band ≥ 4 LU under the ovation',
      band && pk - pc <= 0.5 && pb < -10 && pk2 < -1 && lb < lc - 4, 'streak: crowd peak ' + r1(pc) + ' → with band ' + r1(pk) + ' dBFS (band alone ' + r1(pb) + ') · serve-fault mix ' + r1(pk2) + ' dBFS · band ' + r1(lb) + ' LUFS vs ovation Mmax ' + r1(lc));
  }
  return rows;
}
function xarTable(rows) {
  console.log('\n== 8. Xaranga: the stand brass band (where it plays, triggers, ducking, whistle hole, volume 0) — mock engine ==');
  let bad = 0;
  for (const x of rows) { console.log(pad(x.name, 130) + (x.pass ? 'OK  ' : 'FAIL') + '  ' + x.info); if (!x.pass) bad++; }
  return bad;
}
module.exports = { makeMock, xarReport, s234Report, UI_PATCH, enduiReport, countUpCalls, METRICS, loadAudio, synthReport, mixReport, featureReport, chromeReport, robustReport, PLAN, pageHtml, PAGE_RUN, pcmOf, winLoud, clickTimes, variantsOf, chromeFeatures, coldReport, coldRun };
if (require.main === module) (async () => {
  let bad = 0; const out = {};
  console.log('audiotest: ' + path.relative(ROOT, FILE) + (BEFORE ? '  (before: ' + path.relative(ROOT, BEFORE) + ')' : ''));
  if (has('--cold-only')) { const cr = await coldReport(FILE); bad += coldTable(cr); console.log(bad ? 'FALLOS: ' + bad : 'TODO OK'); process.exit(bad ? 1 : 0); }
  if (has('--sweep-only')) { const c = await chromeReport(FILE, 'after'); const w = c.sweep.slice().sort((a, b) => b.tp - a.tp); console.log(w.slice(0, 12).map(x => x.id + ' @' + x.cam + 'm ' + r1(x.tp) + ' dBTP clip ' + x.clip).join('\n')); process.exit(w[0].tp <= -1 && !w.some(x => x.clip) ? 0 : 1); }
  if (has('--w3-only')) { const c = await chromeReport(FILE, 'after'); console.log(JSON.stringify(c.w3, (k, v) => typeof v === 'number' ? Math.round(v * 100) / 100 : v)); process.exit(0); }
  if (has('--endui-only')) { const er = await enduiReport(); bad += enduiTable(er); console.log(bad ? 'FALLOS: ' + bad : 'TODO OK'); process.exit(bad ? 1 : 0); }
  if (has('--xar-only')) { const xr = await xarReport(FILE); bad += xarTable(xr); console.log(bad ? 'FALLOS: ' + bad : 'TODO OK'); process.exit(bad ? 1 : 0); }
  if (has('--rot-only') || has('--s234-only')) { const sr = await s234Report(FILE, has('--rot-only')); bad += s234Table(sr); console.log(bad ? 'FALLOS: ' + bad : 'TODO OK'); process.exit(bad ? 1 : 0); }
  const syn = synthReport(FILE, !has('--no-wav')); out.synth = syn;
  bad += synthTable(syn);
  if (has('--synth-only')) { console.log(bad ? 'FALLOS: ' + bad : 'TODO OK'); process.exit(bad ? 1 : 0); }
  const mix = await mixReport(FILE); out.mix = mix;
  let mixB = null; if (BEFORE) { mixB = await mixReport(BEFORE); out.mixBefore = mixB; }
  bad += mixTable(mix, mixB);
  const hier = hierReport(mix); out.hier = hier;
  bad += hierTable(hier);
  const feat = await featureReport(FILE); out.features = feat;
  bad += featureTable(feat, mix);
  const w2 = await wave2Report(FILE, mix); out.wave2 = w2;
  bad += wave2Table(w2);
  const w3 = await wave3Report(FILE); out.wave3 = w3;
  bad += wave3Table(w3);
  const rob = await robustReport(FILE); out.robust = rob;
  bad += robustTable(rob);
  const s234 = await s234Report(FILE, false); out.s234 = s234;
  bad += s234Table(s234);
  const xr = await xarReport(FILE); out.xar = xr;
  bad += xarTable(xr);
  if (has('--calibrate')) { // suggested LEVEL table for js/audio.js: current level + (target - measured) of the first scenario of each sound
    const { VB } = loadAudio(FILE), cur = VB.Audio.LEVELS || {}, sug = {};
    for (const r of mix) { const sc = SCEN.find(x => x.id === r.id); if (!sc || r.info || !sc.only) continue; for (const n of sc.only) if (!(n in sug)) sug[n] = Math.round(((cur[n] || 0) - r.delta) * 10) / 10; }
    for (const n of Object.keys(cur)) if (!(n in sug)) sug[n] = cur[n];
    console.log('\nsuggested LEVEL: ' +JSON.stringify(sug).replace(/"/g, ''));
  }
  if (!has('--no-chrome')) {
    const c = await chromeReport(FILE, 'after'); out.chrome = c;
    let cb = null; if (BEFORE) { cb = await chromeReport(BEFORE, 'before'); out.chromeBefore = cb; }
    bad += chromeTable(c, cb);
    if (!has('--no-cold')) { const cr = await coldReport(FILE); out.cold = cr; bad += coldTable(cr); }
    if (!has('--no-endui')) { const er = await enduiReport(); out.endui = er; bad += enduiTable(er); }
  }
  if (opt('--json')) fs.writeFileSync(path.resolve(opt('--json')), JSON.stringify(out, null, 1));
  console.log('\nWAVs in ' + path.relative(ROOT, OUT));
  console.log(bad ? 'FALLOS: ' + bad : 'TODO OK');
  process.exit(bad ? 1 : 0);
})().catch(e => { console.error(e && e.stack || e); process.exit(2); });
