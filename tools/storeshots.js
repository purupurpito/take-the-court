#!/usr/bin/env node
/* TAKE THE COURT — tools/storeshots.js (owner: ui_main)
 * Gráficos de la ficha de Google Play sacados del juego DE VERDAD (Chrome headless, tools/cdp.js):
 *   - icono-512.png        512×512 PNG 32 bits: pages/icon.svg a sangre, con el dibujo un poco reducido (cabe en la máscara redonda)
 *   - icono-mascaras.png   solo para mirar: el icono con las máscaras de Play (esquinas 20 %) y de círculo
 *   - grafico-destacado.png 1024×500 PNG sin alfa: el juego de fondo (solo el 3D, sin HUD) + el logotipo (#mtcLogo de index.html)
 *   - movil-NN-*.png        capturas de móvil 1920×1080 (viewport 640×360 a DPR 3, táctil, UA de Android: modo html.ph)
 *   - tablet7-*.png / tablet10-*.png  capturas de tablet de 7" (960×540 a DPR 2 = 1920×1080) y 10" (1280×720 a DPR 2 = 2560×1440)
 * Las capturas y el gráfico destacado se guardan en PNG de 24 bits SIN canal alfa (Play lo pide así); el icono, en 32 bits.
 * Sin datos reales: cada carga lleva &ma_clean=1 (localStorage vacío, perfil temporal), el online va con &olmock=1 (sala de prueba en
 * memoria, sin Firestore) y la Carrera es una de muestra creada en la página (VB.Career). Mismos atajos que tools/revshots.js.
 * Uso: node tools/storeshots.js [--out notes/playstore/graficos] [--only regex] [--list]
 *   Env: GL=swiftshader (sin GPU).
 */
'use strict';
const fs = require('fs'), os = require('os'), path = require('path'), zlib = require('zlib');
const CDP = require('./cdp.js');
const PG = require('./mobaudit-page.js');

// ------------------------------------------------------------------------------------------------ argumentos
const argv = process.argv.slice(2), A = {};
for (let i = 0; i < argv.length; i++) {
  const a = argv[i];
  if (a === '--list') A.list = true;
  else if (a.startsWith('--')) { const k = a.slice(2), eq = k.indexOf('='); if (eq > 0) A[k.slice(0, eq)] = k.slice(eq + 1); else A[k] = argv[++i]; }
}
const ROOT = CDP.ROOT;
const OUT = path.resolve(A.out || path.join(ROOT, 'notes', 'playstore', 'graficos'));
const ONLY = A.only ? new RegExp(A.only, 'i') : null;

// ------------------------------------------------------------------------------------------------ dispositivos
const DEV = {
  movil: { size: '640x360', dpr: 3, touch: true },      // 1920×1080
  movil405: { size: '720x405', dpr: 1920 / 720, touch: true },   // 1920×1080: móvil un poco más alto (la sala online cabe entera)
  tablet7: { size: '960x540', dpr: 2, touch: true },    // 1920×1080
  tablet10: { size: '1280x720', dpr: 2, touch: true },  // 2560×1440
};

// ------------------------------------------------------------------------------------------------ capturas
const M0 = 'debug=menu';
const PLAYING = "return M.until(()=>VB.ctx.state==='playing',8000);";
const BEACH = '&map=beach';
const CLOSE_PANELS = "for (let i=0;i<6&&VB.UI.isPanelOpen();i++){M.click('#btnPanelBack'); await M.sleep(80);}";
// Carrera de muestra recién creada (sin jornadas simuladas: ningún aviso suelto encima), en la pestaña Partido
const CAREER = m => `if (!M.seedCareer('${m}')) return false; if (!(await M.career('match'))) return false;
  for (let i=0;i<8;i++){ const b=document.querySelector('#career .cw-mentor .cw-ok'); if(!b) break; M.click(b); await M.sleep(150); }
  return !document.querySelector('#career .cw-mentor');`;   // (la tarjeta del mentor se cierra con «Vale»: si no, sale cortada abajo)
// sala online de mentira (?olmock=1, sin Firestore): llega un rival con un apodo de ejemplo. A 640×360 la tarjeta de la sala
// desplaza y las reglas quedan bajo el difuminado de «hay más» (parece cortada): esta captura va en movil405 (720×405, también 16:9).
const ONLINE_ROOM = "if (!(await M.online('room'))) return false; const NL=VB.NetLobby; NL._mock({ arrive: 'Remate88' }); await M.sleep(900); if (!NL._state().rival) NL._mock({ rival: 'Remate88', status: 'connecting' }); await M.sleep(150); return NL._state().view === 'room';";

const SHOTS = [
  { id: 'movil-01-portada', dev: 'movil', q: M0, open: 'return M.ensureMenu();', wait: 900, what: 'Portada con el logotipo y los botones principales' },
  { id: 'movil-02-playa-2v2', dev: 'movil', q: 'debug=spike' + BEACH, open: PLAYING, wait: 700, what: 'Vóley playa 2 contra 2: remate con el balón en el aire' },
  { id: 'movil-03-pista-6v6', dev: 'movil', q: 'debug=rally6h', open: PLAYING, wait: 700, what: 'Pista 6 contra 6: colocación en pleno peloteo' },
  { id: 'movil-04-carrera', dev: 'movil', q: M0 + '&rv=ch', open: CAREER('hall'), wait: 600, what: 'Carrera en pista: tu club, el próximo partido y la temporada' },
  { id: 'movil-05-online-sala', dev: 'movil405', q: M0 + '&online=1&olmock=1', open: ONLINE_ROOM, wait: 600, what: 'Online: sala de espera con un rival que acaba de entrar' },
  { id: 'movil-06-estadisticas', dev: 'movil', q: 'debug=stats' + BEACH, open: 'return M.until(()=>VB.UI.isPanelOpen(),10000);', wait: 900, what: 'Estadística del partido: marcador por sets y cifras clave' },
  { id: 'movil-07-remate-6v6', dev: 'movil', q: 'debug=spike6', open: PLAYING, wait: 700, what: 'Pista 6 contra 6: remate' },
  { id: 'movil-08-final', dev: 'movil', q: 'debug=over' + BEACH, open: "await M.until(()=>VB.ctx.state==='over',8000); await M.sleep(700); M.click('#endTabs [data-tab=\"sum\"]'); return true;", wait: 700, what: 'Hoja final del partido' },
  { id: 'tablet7-01-playa-2v2', dev: 'tablet7', q: 'debug=spike' + BEACH, open: PLAYING, wait: 700, what: 'Tablet 7": vóley playa 2 contra 2' },
  { id: 'tablet7-02-carrera', dev: 'tablet7', q: M0 + '&rv=ch', open: CAREER('hall'), wait: 600, what: 'Tablet 7": Carrera' },
  { id: 'tablet10-01-pista-6v6', dev: 'tablet10', q: 'debug=rally6h', open: PLAYING, wait: 700, what: 'Tablet 10": pista 6 contra 6' },
  { id: 'tablet10-02-portada', dev: 'tablet10', q: M0, open: 'return M.ensureMenu();', wait: 900, what: 'Tablet 10": portada' },
];

// ------------------------------------------------------------------------------------------------ extras en la página
function extras() {
  var M = window.__MA; if (!M || M._ss) return true; M._ss = true;
  /** Carrera de muestra con n jornadas simuladas (igual que tools/revshots.js). */
  M.seedCareerN = function (mode, n) {
    if (!M.seedCareer(mode)) return false;
    var C = VB.Career, c = C.get();
    if (!c._rvN) {
      for (var i = 0; i < n && c && c.phase !== 'off' && C.simulateNext; i++) {
        try { if (C.simulateNext(c) === false) break; } catch (e) { break; }
        c = C.get();
      }
      c = C.get(); if (c) c._rvN = true;
    }
    try { if (VB.UI && VB.UI.refreshMenu) VB.UI.refreshMenu(); } catch (e) { }
    return !!C.get();
  };
  return true;
}

// ------------------------------------------------------------------------------------------------ PNG: canales
/** Decodifica un PNG de 8 bits sin entrelazar, RGB o RGBA (lo que da Chrome) → {w, h, px: RGBA}. */
function pngDecode(buf) {
  let p = 8, ihdr = null; const idat = [];
  while (p < buf.length) {
    const len = buf.readUInt32BE(p), type = buf.toString('ascii', p + 4, p + 8), data = buf.slice(p + 8, p + 8 + len);
    if (type === 'IHDR') ihdr = data; else if (type === 'IDAT') idat.push(data);
    p += 12 + len;
  }
  const w = ihdr.readUInt32BE(0), h = ihdr.readUInt32BE(4), depth = ihdr[8], ct = ihdr[9], inter = ihdr[12];
  if (depth !== 8 || (ct !== 6 && ct !== 2) || inter !== 0) throw new Error('PNG no esperado (profundidad ' + depth + ', tipo ' + ct + ')');
  const bpp = ct === 6 ? 4 : 3, stride = w * bpp, raw = zlib.inflateSync(Buffer.concat(idat));
  const px = Buffer.alloc(w * h * 4), prev = Buffer.alloc(stride), cur = Buffer.alloc(stride);
  for (let y = 0; y < h; y++) {
    const f = raw[y * (stride + 1)], row = raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1));
    for (let x = 0; x < stride; x++) {
      const a = x >= bpp ? cur[x - bpp] : 0, b = prev[x], c = x >= bpp ? prev[x - bpp] : 0;
      let v = row[x];
      if (f === 1) v += a; else if (f === 2) v += b; else if (f === 3) v += (a + b) >> 1;
      else if (f === 4) { const pp = a + b - c, pa = Math.abs(pp - a), pb = Math.abs(pp - b), pc = Math.abs(pp - c); v += (pa <= pb && pa <= pc) ? a : (pb <= pc ? b : c); }
      cur[x] = v & 255;
    }
    for (let x = 0; x < w; x++) { const o = (y * w + x) * 4; px[o] = cur[x * bpp]; px[o + 1] = cur[x * bpp + 1]; px[o + 2] = cur[x * bpp + 2]; px[o + 3] = bpp === 4 ? cur[x * bpp + 3] : 255; }
    cur.copy(prev);
  }
  return { w, h, px };
}
/** Codifica {w, h, px: RGBA} como PNG de 24 bits (alpha=false, sin canal alfa) o de 32 bits (alpha=true). */
function pngEncode(img, alpha) {
  const { w, h, px } = img, bpp = alpha ? 4 : 3, out = Buffer.alloc(h * (w * bpp + 1));
  for (let y = 0; y < h; y++) {
    const o = y * (w * bpp + 1); out[o] = 1;   // filtro Sub: comprime bastante mejor que sin filtro
    for (let x = 0; x < w; x++) for (let k = 0; k < bpp; k++) { const i = (y * w + x) * 4 + k; out[o + 1 + x * bpp + k] = (px[i] - (x ? px[i - 4] : 0)) & 255; }
  }
  const chunk = (type, data) => { const l = Buffer.alloc(4); l.writeUInt32BE(data.length); const td = Buffer.concat([Buffer.from(type, 'ascii'), data]); const c = Buffer.alloc(4); c.writeUInt32BE(crc32(td) >>> 0); return Buffer.concat([l, td, c]); };
  const ih = Buffer.alloc(13); ih.writeUInt32BE(w, 0); ih.writeUInt32BE(h, 4); ih[8] = 8; ih[9] = alpha ? 6 : 2;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ih), chunk('IDAT', zlib.deflateSync(out, { level: 9 })), chunk('IEND', Buffer.alloc(0))]);
}
let CRC_T = null;
function crc32(b) {
  if (!CRC_T) { CRC_T = new Int32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; CRC_T[n] = c; } }
  let c = -1; for (let i = 0; i < b.length; i++) c = CRC_T[(c ^ b[i]) & 255] ^ (c >>> 8); return c ^ -1;
}
function pngInfo(file) { const b = fs.readFileSync(file); return { w: b.readUInt32BE(16), h: b.readUInt32BE(20), ct: b[25], bytes: b.length }; }

// ------------------------------------------------------------------------------------------------ utilidades
const sleep = ms => new Promise(r => setTimeout(r, ms));
function withTimeout(p, ms, what) { let t; return Promise.race([p, new Promise((_, j) => { t = setTimeout(() => j(new Error('tiempo agotado: ' + what)), ms); })]).finally(() => clearTimeout(t)); }
const CLEAN = "if(/[?&]ma_clean=1/.test(location.search)){try{localStorage.clear();sessionStorage.clear()}catch(e){}}";

async function waitReady(page) {
  const ok = await page.evalJs(`new Promise(res=>{const t0=Date.now();(function f(){try{if(window.VB&&VB.UI&&VB.ctx&&VB.UI._boot&&VB.UI._boot().stage>=2&&document.fonts.status==='loaded')return res(true)}catch(e){} if(Date.now()-t0>25000)return res(false); setTimeout(f,100)})()})`, true).catch(() => false);
  await sleep(700);
  await page.evalJs('(' + PG.helpers.toString() + ')()');
  await page.evalJs('(' + extras.toString() + ')()');
  return ok;
}

/** Captura la pestaña; alpha=false → PNG de 24 bits sin alfa (capturas, gráfico destacado); alpha=true → PNG de 32 bits (icono). */
async function capture(page, file, alpha, clip) {
  const r = await page.send('Page.captureScreenshot', Object.assign({ format: 'png', captureBeyondViewport: false }, clip ? { clip } : {}));
  let buf = Buffer.from(r.data, 'base64');
  buf = pngEncode(pngDecode(buf), !!alpha);
  fs.writeFileSync(file, buf);
  return pngInfo(file);
}

/** Abre una página HTML suelta (fichero temporal) en la pestaña. */
async function openHtml(page, html) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'vbss-')), f = path.join(dir, 'p.html');
  fs.writeFileSync(f, html);
  const loaded = new Promise(r => page.on('Page.loadEventFired', r));
  await page.send('Page.navigate', { url: 'file:///' + f.replace(/\\/g, '/') });
  await Promise.race([loaded, sleep(20000)]);
  await sleep(500);
  return () => { try { fs.rmSync(dir, { recursive: true, force: true }); } catch (e) { } };
}

function logoDefs() {
  const src = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  const at = src.indexOf('id="mtcLogo"');
  if (at < 0) throw new Error('no encuentro #mtcLogo en index.html');
  const start = src.lastIndexOf('<svg', at), end = src.indexOf('</svg>', at);
  return src.slice(start, end + 6);
}

// ------------------------------------------------------------------------------------------------ icono
const ICON_SCALE = 0.82;   // el dibujo de icon.svg al 82 %: la «T» de la esquina entra en el círculo; el fondo y la red siguen a sangre
function iconSvg() {
  let s = fs.readFileSync(path.join(ROOT, 'pages', 'icon.svg'), 'utf8');
  const bg = '<rect width="240" height="240" fill="#12A99A"/>';
  if (s.indexOf(bg) < 0) throw new Error('icon.svg: no encuentro el fondo');
  s = s.replace(bg, bg + `<g transform="translate(120 120) scale(${ICON_SCALE}) translate(-120 -120)">`);
  s = s.replace(/<\/g><\/svg>\s*$/, '</g></g></svg>');
  return s;
}
async function makeIcon(page) {
  await page.setSize('512x512', false, 1);
  const svg = iconSvg();
  const done = await openHtml(page, `<!doctype html><html><head><meta charset="utf-8"><style>html,body{margin:0;width:512px;height:512px;overflow:hidden;background:transparent}svg{display:block;width:512px;height:512px}</style></head><body>${svg}</body></html>`);
  await page.send('Emulation.setDefaultBackgroundColorOverride', { color: { r: 0, g: 0, b: 0, a: 0 } });
  const f = path.join(OUT, 'icono-512.png');
  const i = await capture(page, f, true);
  done();
  // hoja de máscaras para mirar (no se sube)
  await page.setSize('1100x420', false, 1);
  const uri = 'data:image/png;base64,' + fs.readFileSync(f).toString('base64');
  const card = (lbl, st) => `<figure><img src="${uri}" style="${st}"><figcaption>${lbl}</figcaption></figure>`;
  const done2 = await openHtml(page, `<!doctype html><html><head><meta charset="utf-8"><style>
html,body{margin:0;width:1100px;height:420px;background:#e9edf2;font:600 18px system-ui,sans-serif;color:#10162B}
.row{display:flex;gap:28px;justify-content:center;align-items:flex-start;padding:30px 20px}
figure{margin:0;text-align:center}img{width:240px;height:240px;display:block}figcaption{margin-top:12px}
.dk{background:#1b1f27;padding:14px;border-radius:12px}</style></head><body><div class="row">
${card('Sin máscara', '')}${card('Play (esquinas 20 %)', 'border-radius:20%')}${card('Círculo', 'border-radius:50%')}
<figure><div class="dk"><img src="${uri}" style="border-radius:50%;width:96px;height:96px"></div><figcaption>Lanzador, 96 px</figcaption></figure>
</div></body></html>`);
  await capture(page, path.join(OUT, 'icono-mascaras.png'), false);
  done2();
  await page.send('Emulation.setDefaultBackgroundColorOverride', {});
  return i;
}

// ------------------------------------------------------------------------------------------------ gráfico destacado
const FEAT_W = 1600, FEAT_X = 70;   // ancho de la captura de fondo y recorte por la izquierda (px CSS)
async function makeFeature(page) {
  // 1) fondo: el juego de verdad (playa, bloqueo en la red), solo el lienzo 3D. Se captura más ancho (1600×500, DPR 2) y se recorta
  //    para que la jugada quede a la derecha del centro y el logotipo a la izquierda, sin taparla
  await page.setSize(FEAT_W + 'x500', false, 2);
  await page.navigate('ma_clean=1&uianim=0&debug=block' + BEACH);
  await waitReady(page);
  await page.evalJs("(async()=>{const M=window.__MA;" + PLAYING + "})()", true);
  await sleep(700);
  await page.evalJs("(function(){VB.ctx.frozen=true;var s=document.createElement('style');s.textContent='*{visibility:hidden!important}canvas{visibility:visible!important}';document.head.appendChild(s);})()");
  await sleep(500);
  const r = await page.send('Page.captureScreenshot', { format: 'png' });
  const bgUri = 'data:image/png;base64,' + r.data;
  // 2) composición: fondo oscurecido hacia los lados + logotipo centrado (zona segura), sin más texto que el del propio logotipo
  await page.setSize('1024x500', false, 1);
  const done = await openHtml(page, `<!doctype html><html lang="es"><head><meta charset="utf-8"><style>
html,body{margin:0;width:1024px;height:500px;overflow:hidden;background:#070b14}
.bg{position:absolute;inset:0;background:url(${bgUri}) -${FEAT_X}px 0/${FEAT_W}px 500px no-repeat;filter:saturate(1.08)}
.sh{position:absolute;inset:0;background:radial-gradient(ellipse 40% 70% at 32% 50%,rgba(7,11,20,.55) 0%,rgba(7,11,20,.25) 60%,rgba(7,11,20,0) 100%)}
.logo{position:absolute;left:330px;top:50%;width:440px;height:276px;transform:translate(-50%,-50%);filter:drop-shadow(0 6px 18px rgba(0,0,0,.55))}
</style></head><body>${logoDefs()}<div class="bg"></div><div class="sh"></div>
<svg class="logo" viewBox="0 0 780 490" aria-hidden="true"><use href="#mtcLogo"/></svg></body></html>`);
  const i = await capture(page, path.join(OUT, 'grafico-destacado.png'), false);
  done();
  return i;
}

// ------------------------------------------------------------------------------------------------ main
async function main() {
  const jobs = [{ id: 'icono-512', kind: 'icon', what: 'Icono de la app' }, { id: 'grafico-destacado', kind: 'feature', what: 'Gráfico destacado' }]
    .concat(SHOTS.map(s => Object.assign({ kind: 'shot' }, s))).filter(j => !ONLY || ONLY.test(j.id));
  if (A.list) { for (const j of jobs) console.log(j.id.padEnd(26) + ' ' + (j.dev || j.kind).padEnd(9) + ' ' + (j.q || '') + '  ' + j.what); return 0; }
  fs.mkdirSync(OUT, { recursive: true });
  const page = await CDP.open({ size: '1280x720', touch: false, init: [CLEAN] });
  const deskUA = String(await page.evalJs('navigator.userAgent')).replace('HeadlessChrome', 'Chrome');
  const res = []; let bad = 0;
  try {
    for (const j of jobs) {
      page.errors.length = 0;
      try {
        let info;
        if (j.kind === 'icon') { await page.send('Emulation.setUserAgentOverride', { userAgent: deskUA }); info = await makeIcon(page); }
        else if (j.kind === 'feature') { await page.send('Emulation.setUserAgentOverride', { userAgent: deskUA }); info = await makeFeature(page); }
        else {
          const d = DEV[j.dev];
          await page.send('Emulation.setUserAgentOverride', d.touch ? { userAgent: CDP.ANDROID_UA, platform: 'Linux armv8l' } : { userAgent: deskUA });
          await page.setSize(d.size, d.touch, d.dpr);
          await page.navigate('ma_clean=1&uianim=0&' + j.q);
          if (!await waitReady(page)) process.stderr.write('  (aviso) la página no dijo «lista» para ' + j.q + '\n');
          try { await page.evalJs('(' + PG.resetScroll.toString() + ')()'); } catch (e) { }
          const r = await withTimeout(page.evalJs('(async()=>{const M=window.__MA;' + j.open + '})()', true), 40000, j.id);
          if (r === false || r == null) throw new Error('no se pudo abrir');
          await sleep(j.wait == null ? 400 : j.wait);
          const st = await page.evalJs("({ph:document.documentElement.classList.contains('ph'),state:VB.ctx&&VB.ctx.state})");
          info = await capture(page, path.join(OUT, j.id + '.png'), false);
          info.ph = st.ph; info.state = st.state;
        }
        if (page.errors.length) info.jsErrors = page.errors.slice(0, 3);
        res.push(Object.assign({ id: j.id }, info));
        console.log('ok   ' + j.id.padEnd(26) + ' ' + info.w + '×' + info.h + ' ' + Math.round(info.bytes / 1024) + ' KB' + (info.ct === 6 ? ' (con alfa)' : '') + (info.ph != null ? ' ph=' + info.ph : '') + (info.jsErrors ? ' ERRORES JS: ' + info.jsErrors.join(' | ') : ''));
      } catch (e) { bad++; console.log('ERR  ' + j.id.padEnd(26) + ' ' + String(e && e.message || e).split('\n')[0]); }
    }
  } finally { page.close(); }
  console.log((bad ? bad + ' fallos' : 'todo bien') + ' → ' + OUT);
  return bad ? 1 : 0;
}

main().then(c => process.exit(c || 0), e => { console.error(e && e.stack || e); process.exit(1); });
