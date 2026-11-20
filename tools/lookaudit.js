#!/usr/bin/env node
/* TAKE THE COURT — tools/lookaudit.js (auditoría del Vestuario, solo lectura: no toca js/ ni el guardado de nadie)
 * Abre UN Chrome (?debug=look) y:
 *  1) mide los triángulos de la vista previa por peinado, por gorro (con tupé) y por gafas en LOD0/1/2 (&quality=low|medium|high);
 *  2) hace capturas de cada peinado (de frente y de espaldas), de cada gorro, y de capas (brazos, piernas, cara) en el Vestuario;
 *  3) ejecuta VB.Doll.lookSelfTest() y guarda el resultado.
 * Uso: node tools/lookaudit.js [W=640] [H=360] [salida=tools/out/lookaudit]
 * Variables: SHOTS=0 sin capturas · TRIS=0 sin triángulos · SELF=0 sin lookSelfTest · TOUCH=1 táctil.
 */
'use strict';
const path = require('path'), fs = require('fs');
const CDP = require('./cdp.js');
const W = +(process.argv[2] || 640), H = +(process.argv[3] || 360);
const OUT = path.resolve(process.argv[4] || path.join(CDP.ROOT, 'tools', 'out', 'lookaudit'));
fs.mkdirSync(OUT, { recursive: true });
setTimeout(() => { console.error('TIEMPO AGOTADO'); process.exit(2); }, 15 * 60e3).unref();

const IN_PAGE = `
window.__la = {
  fit: function (patch, ven) {
    var Lk = VB.Look, f = JSON.parse(JSON.stringify(Lk.defaults(0)));
    Object.keys(patch || {}).forEach(function (k) {
      if (k === 'style' || k === 'hair' || k === 'skin') f[k] = patch[k];
      else if (k.indexOf('c:') === 0) f.colors[k.slice(2)] = patch[k];
      else f[ven][k] = patch[k];
    });
    return Lk.fix(f, ven, null).fit;
  },
  tris: function (patch, ven) {
    var L = VB.Look.resolve(this.fit(patch, ven), ven, VB.Players.kit(0));
    VB.Doll.preview.set(L, { beach: ven === 'beach' });
    var i = VB.Doll.preview.info(); return i ? i.tris : -1;
  }
};`;

(async () => {
  let page, bad = 0;
  const report = { size: W + 'x' + H, tris: {}, self: null, shots: [] };
  try {
    page = await CDP.open({ size: W + 'x' + H, touch: process.env.TOUCH === '1' });
    if (process.env.TRIS !== '0') {
      for (const [lod, q] of [[0, 'low'], [1, 'medium'], [2, 'high']]) {
        await page.navigate('debug=look&tab=pelo&venue=pista&quality=' + q);
        await CDP.sleep(4500);
        await page.evalJs(IN_PAGE);
        const r = await page.evalJs(`(function(){
          var o = { lod: VB.Doll.preview.info().lod, style: {}, head: {}, eyes: {}, base: 0, other: {} };
          o.base = __la.tris({ style: 'rapado', knees: '', socks: '', ankle: '' }, 'hall');
          VB.Look.STYLES.forEach(function (s) { o.style[s] = __la.tris({ style: s }, 'hall'); });
          VB.Look.items('head', null).forEach(function (h) { var ven = VB.Look.item(h).venue === 'Y' ? 'beach' : 'hall'; o.head[h + '@' + ven] = __la.tris({ style: 'tupe', head: h }, ven) - __la.tris({ style: 'tupe', head: '' }, ven); });
          VB.Look.items('eyes', null).forEach(function (e) { var ven = VB.Look.item(e).venue === 'Y' ? 'beach' : 'hall'; o.eyes[e + '@' + ven] = __la.tris({ style: 'tupe', head: '', eyes: e }, ven) - __la.tris({ style: 'tupe', head: '', eyes: '' }, ven); });
          o.other.tupeBeachNoHat = __la.tris({ style: 'tupe', head: '' }, 'beach');
          o.other.coletaGorra = __la.tris({ style: 'coleta', head: 'gorra' }, 'beach');
          o.other.trenzasGorra = __la.tris({ style: 'trenzas', head: 'gorra' }, 'beach');
          o.other.coletasGorra = __la.tris({ style: 'coletas', head: 'gorra' }, 'beach');
          return o; })()`);
        report.tris['lod' + lod] = r;
        console.log('LOD' + lod + ' (preview lod ' + r.lod + '):', JSON.stringify(r));
      }
    }
    if (process.env.SHOTS !== '0') {
      await page.navigate('debug=look&tab=pelo&venue=pista&quality=high');
      await CDP.sleep(4500);
      await page.evalJs(IN_PAGE);
      const shot = async (name, patch, ven, tab, yaw, wait) => {
        await page.evalJs(`(function(){ VB.UI.openLook({ tab: '${tab}', venue: '${ven === 'beach' ? 'playa' : 'pista'}' });
          var L = VB.Look.resolve(__la.fit(${JSON.stringify(patch)}, '${ven}'), '${ven}', VB.Players.kit(0));
          VB.Doll.preview.set(L, { beach: ${ven === 'beach'} }); VB.Doll.preview.yaw(${yaw || 0}); })()`);
        await CDP.sleep(wait || 900);
        const f = path.join(OUT, name + '.png'); await page.shot(f); report.shots.push(f);
      };
      const styles = await page.evalJs('VB.Look.STYLES.slice()');
      for (const s of styles) {
        await shot('style-' + s + '-front', { style: s }, 'hall', 'pelo', 0);
        await shot('style-' + s + '-back', { style: s }, 'hall', 'pelo', Math.PI);
        await shot('style-' + s + '-side', { style: s }, 'hall', 'pelo', Math.PI / 2);
      }
      const heads = await page.evalJs("VB.Look.items('head', null).map(function(h){return [h, VB.Look.item(h).venue];})");
      for (const [h, v] of heads) await shot('head-' + h, { style: 'tupe', head: h }, v === 'Y' ? 'beach' : 'hall', 'cabeza', 0.5);
      for (const [s, h] of [['coleta', 'gorra'], ['trenzas', 'gorra'], ['coletas', 'gorraAtras'], ['afro', 'visera'], ['afro', 'corona'], ['tupe', 'corona'], ['cresta', 'cinta'], ['afro', 'cinta'], ['mono', 'cintaRizo'], ['flequillo', 'pescador']])
        await shot('combo-' + s + '+' + h, { style: s, head: h }, ['gorra', 'gorraAtras', 'visera', 'pescador'].indexOf(h) >= 0 ? 'beach' : 'hall', 'cabeza', 0.6);
      for (const e of ['pasta', 'deporte', 'oscuras', 'espejo', 'frente']) await shot('eyes-' + e, { style: 'tupe', head: '', eyes: e }, e === 'pasta' || e === 'deporte' ? 'hall' : 'beach', 'cabeza', 0.3);
      await shot('face-all', { style: 'tupe', paint: 'estrella', marks: 'pecas', beard: 'tresDias', eyes: 'pasta' }, 'hall', 'cara', 0.2);
      await shot('face-zinc-bigote', { style: 'tupe', head: '', paint: 'zinc', marks: 'tiraNasal', beard: 'bigote' }, 'beach', 'cara', 0.2);
      await shot('face-rayas-perilla', { style: 'tupe', paint: 'rayas', marks: 'tirita', beard: 'perilla' }, 'hall', 'cara', 0.2);
      await shot('arms-termica-manguitos', { under: 'termica', armL: 'manguitoLlamas', armR: 'manguitoRayas', elbows: 'coderas', wristL: 'reloj', wristR: 'muneq', hands: 'dedos', band: 'capitan' }, 'hall', 'brazos', 0.7);
      await shot('arms-termica-manguitos-back', { under: 'termica', armL: 'manguitoLlamas', armR: 'manguitoRayas', elbows: 'coderas', wristL: 'reloj', wristR: 'muneq', hands: 'dedos', band: 'capitan' }, 'hall', 'brazos', Math.PI - 0.7);
      await shot('arms-licra-beach', { under: 'licra', armL: 'kinesio', band: 'capitan', hands: 'mitones', neck: 'conchas' }, 'beach', 'brazos', 0.5);
      await shot('legs-malla-altos', { legs: 'mallaLarga', socks: 'altos', knees: 'altas', shoes: 'neon' }, 'hall', 'piernas', 0.5);
      await shot('legs-bajadas-rayas', { legs: 'malla', socks: 'altosRayas', knees: 'bajadas', shoes: 'negras' }, 'hall', 'piernas', 0.5);
      await shot('legs-noknee-tob', { legs: 'mallaLarga', socks: 'tobilleros', knees: '', ankle: '', shoes: 'doradas' }, 'hall', 'piernas', 0.5);
      await shot('legs-beach-escarpines', { ankle: 'escarpines', legs: 'mallaLarga' }, 'beach', 'piernas', 0.5);
      await shot('body-medalla', { neck: 'medalla', under: 'termica' }, 'hall', 'cuerpo', 0.3);
    }
    if (process.env.SELF !== '0') {
      await page.navigate('debug=look&quality=high');
      await CDP.sleep(4500);
      const r = await page.evalJs('(function(){var r=VB.Doll.lookSelfTest(); return {ok:r.ok, fails:r.fails, items:r.items, today:r.today, worst:r.worst, draws:r.draws, ms:r.ms};})()');
      report.self = r;
      console.log('lookSelfTest:', JSON.stringify(r));
    }
    if (page.errors.length) { bad++; console.log('ERRORES JS:\n  ' + page.errors.slice(0, 8).join('\n  ')); }
  } catch (e) { bad++; console.error('ERROR:', e && e.stack || e); }
  if (page) page.close();
  fs.writeFileSync(path.join(OUT, 'report.json'), JSON.stringify(report, null, 1));
  console.log('→ ' + path.join(OUT, 'report.json'));
  process.exit(bad ? 1 : 0);
})();
