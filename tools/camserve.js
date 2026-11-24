#!/usr/bin/env node
/* TAKE THE COURT — tools/camserve.js  (owner: camera_input)
 * ¿Cuánto se mueve la cámara en el SAQUE? (24-nov-2026; Ferran: «En mi saque, la cámara se mueve demasiado … que sea "fija" excepto cuando
 * NECESITE moverse para encuadrar todo lo que pase»). Juega en vivo con autopilot (2v2: debug=rally&live=1; 6v6: startMatch autopilot, 3ª
 * persona) con el reloj de rAF ×SPEED y, frame a frame (sin cortes ni congelados), mide la cámara REAL por saque y por fase:
 *   - quien   yo (saca el jugador que llevas; en el 2v2 el plano serveUs vale para los dos de tu equipo) · comp (6v6: un compañero) · rival
 *   - fase    espera (balón en la mano, desde 0,5 s tras entrar en el saque: lo de antes es la llegada del corte/transición) · lanz (balón
 *             lanzado hasta el golpe) · vuelo (del golpe de saque al primer toque del que recibe o al bote)
 *   - por fase: m/s (media, p95, máx), giro °/s (cuaternión), lente °/s, % de frames QUIETOS (< 0,05 m/s, < 0,5 °/s, < 0,3 °/s) y
 *     balón fuera del cuadro (%); por saque, recorrido total (m) y giro total (°) de espera+lanz.
 * SHOTS=carpeta: una foto (NSHOT=n) de cada momento —espera, lanzamiento (flotante / en salto) y vuelo, de tu saque, del de un compañero y del
 * rival— congelando el juego un instante. WALK=1: en tu saque el sacador se desplaza a lo ancho como un humano (1,4 m/s durante 0,6 s, ida o vuelta) antes de lanzar (toca g:
 * solo para medir). Uso: node tools/camserve.js [2v2|6v6] [WxH=1280x720] [segundos=90] [semilla=11]
 *   SPEED=2 · MAP=beach · TOUCH=1 · JSON=fichero (añade una línea por pasada) · VB_ROOT=otra copia · LOG=1 (cada saque)
 */
'use strict';
const path = require('path'), fs = require('fs');
const CDP = require('./cdp.js');
const MODE = process.argv[2] === '6v6' ? '6v6' : '2v2', SIZE = process.argv[3] || '1280x720', SECS = +(process.argv[4] || 90), SEED = +(process.argv[5] || 11);
const SHOTS = process.env.SHOTS ? path.resolve(process.env.SHOTS) : '', NSHOT = +(process.env.NSHOT || 1);
const SPEED = +(process.env.SPEED || 2), MAP = process.env.MAP === 'beach' ? 'beach' : '', TOUCH = process.env.TOUCH === '1', WALK = process.env.WALK === '1';
setTimeout(() => { console.error('TIEMPO AGOTADO'); process.exit(2); }, SECS * 1000 / SPEED * 3 + 150000).unref();
const INIT = `(function(){ if(window.__csInit) return; window.__csInit=true; var SPEED=${SPEED};
  if(SPEED!==1){ var _raf=window.requestAnimationFrame.bind(window), t0=-1; window.requestAnimationFrame=function(cb){ return _raf(function(t){ if(t0<0) t0=t; cb(t0+(t-t0)*SPEED); }); }; } })();`;
const HOOK = `(function(){
  var c=VB.ctx, CR=VB.CameraRig, orig=CR.update, v=new c.THREE.Vector3(), WALK=${WALK};
  var M=window.__m={ph:{},sv:[],err:'',caps:[]}, last=null, lastCut=-1, cur=null, srvT=0, walkT=0, walkD=1, lastMode='', want=${SHOTS ? 'true' : 'false'}, caps={}, hitT=-9;
  function cap(name){ if(!want||(caps[name]||0)>=${NSHOT}||window.__cap) return; caps[name]=(caps[name]||0)+1; window.__cap=name+'-'+caps[name]; M.caps.push(window.__cap); c.frozen=true; }
  function P(k){ return M.ph[k]||(M.ph[k]={n:0,still:0,bOut:0,sp:[],yr:[],fr:[]}); }
  function who(g){ var t=g.serving; if(t!==0) return 'rival'; return (g.size===6&&g.server!==g.ctrl)?'comp':'yo'; }
  CR.update=function(g,dt,ev){
    // (WALK: el sacador de tu equipo se desplaza a lo ancho antes de que la CPU lance; la cámara lo ve como a un humano)
    if(WALK&&g&&!g.demo&&g.mode==='serve'&&g.serveState==='ready'&&g.serving===0&&g.server&&(g.size!==6||g.server===g.ctrl)&&c.state==='playing'&&!c.frozen){
      if(g.serveAuth){ walkT+=dt||0; if(walkT<0.6){ var sv=g.server, cs=g.cs||1; sv.y=Math.max(-4.3*cs,Math.min(4.3*cs,sv.y+walkD*1.4*(dt||0)*Math.min(1,(c.timeScale==null?1:c.timeScale)))); } }
    } else if(g&&g.mode!=='serve'){ if(walkT>0) walkD=-walkD; walkT=0; }
    orig.apply(CR,arguments);
    try{
      if(!g||g.demo) return;
      var d=CR.getDebug?CR.getDebug():{}, cam=c.camera; cam.updateMatrixWorld(true);
      var hitSrv=false, touchR=false, land=false;
      for(var i=0;i<ev.length;i++){ var e=ev[i]; if(e.type==='hit'&&e.kind==='serve') hitSrv=true; else if((e.type==='hit'||e.type==='block')&&cur&&cur.ph==='vuelo') touchR=true; else if(e.type==='land') land=true; }
      if(c.frozen){ last=null; return; }
      var cut=d.cutN!==lastCut; lastCut=d.cutN;
      // fase
      if(g.mode==='serve'){ if(lastMode!=='serve') srvT=0; srvT+=dt||0; }
      var ph='';
      if(g.mode==='serve') ph=g.serveState==='toss'?'lanz':(srvT>=0.5?'espera':'');
      if(hitSrv&&cur) { cur.ph='vuelo'; hitT=g.time; }
      if(g.mode==='rally'&&cur&&cur.ph==='vuelo'&&!touchR&&!land&&g.lastKind==='serve') ph='vuelo';
      if(g.mode==='serve'&&(!cur||cur.done||cur.ph==='vuelo')){ if(cur&&!cur.done) M.sv.push(cur); cur={who:who(g),ph:'',path:0,ang:0,fovS:0,n:0,done:false,map:g.map||'',jump:false}; }
      if(cur&&g.mode==='serve') { cur.ph=ph||cur.ph; cur.jump=cur.jump||!!g.serveJump; cur.who=who(g); }
      if((touchR||land||g.mode==='point')&&cur&&!cur.done){ cur.done=true; M.sv.push(cur); }
      lastMode=g.mode;
      if(want&&cur&&d.shot!=='cutaway'){ var b0=g.ball;
        if(ph==='espera'&&srvT>1.2) cap(cur.who+'-espera');
        else if(ph==='lanz'&&!b0.held&&b0.vz<0.3) cap(cur.who+'-lanz-'+(g.serveJump?'salto':'flot'));
        else if(ph==='vuelo'&&g.time-hitT>0.3) cap(cur.who+'-vuelo'); }
      var px=cam.position.x, py=-cam.position.z, pz=cam.position.y, qq=cam.quaternion;
      if(ph&&cur&&last&&!cut&&dt>0.004){
        var o=P(cur.who+'-'+ph+(d.shot==='cutaway'?'(plano sacador)':'')), sp=Math.hypot(px-last.x,py-last.y,pz-last.z)/dt, dq=Math.abs(qq.x*last.qx+qq.y*last.qy+qq.z*last.qz+qq.w*last.qw), yr=2*Math.acos(Math.min(1,dq))/dt*57.2958, fr=Math.abs(cam.fov-last.f)/dt;
        if(Math.abs(d.punch||0)>0.01) fr=0;
        o.n++; o.sp.push(+sp.toFixed(3)); o.yr.push(+yr.toFixed(2)); o.fr.push(+fr.toFixed(2)); if(sp<0.05&&yr<0.5&&fr<0.3) o.still++;
        var b=g.ball; VB.toThree(b.x,b.y,b.z,v); v.project(cam); var bo=v.z>1||Math.abs(v.x)>1||Math.abs(v.y)>1; if(bo) o.bOut++;
        if(${process.env.LOG ? 'true' : 'false'}&&d.shot!=='cutaway'&&((bo&&ph!=='espera')||yr>40||(sp>0.1&&ph==='espera'))&&(M.lg=M.lg||[]).length<60) M.lg.push([cur.who+'-'+ph,d.shot,'t'+g.time.toFixed(2),'sp',sp.toFixed(2),'yr',yr.toFixed(0),'fr',fr.toFixed(1),'b',b.x.toFixed(1),b.y.toFixed(1),b.z.toFixed(1),'v',Math.hypot(b.vx,b.vy,b.vz).toFixed(0),'ndc',v.z>1?'det':v.x.toFixed(2)+','+v.y.toFixed(2),'fx',d.fx?(d.fx.on?1:0)+d.fx.k+'/'+d.fx.why+'/'+d.fx.need+'/i'+d.fx.ini:'-','dt',dt.toFixed(3),'fov',cam.fov.toFixed(1),'fb',d.fb==null?'':d.fb.toFixed(2),'ct',d.ct?d.ct.e.toFixed(1)+'/'+d.ct.dp.toFixed(1):'-','ss',g.serveState,'lk',g.lastKind].join(' '));
        if(ph!=='vuelo'){ cur.path+=sp*dt; cur.ang+=yr*dt; cur.fovS+=fr*dt; cur.n++; }
      }
      last={x:px,y:py,z:pz,qx:qq.x,qy:qq.y,qz:qq.z,qw:qq.w,f:cam.fov};
    }catch(err){ M.err=String(err&&err.stack||err); }
  };
  ${TOUCH ? "try{ window.dispatchEvent(new TouchEvent('touchstart',{bubbles:true})); }catch(er){}" : ''}
  ${MODE === '6v6' ? "c.actions.startMatch({autopilot:true,format:'6v6',points:25});" : ''}
  return (c.game&&c.game.size)+' '+(c.game&&c.game.map||'');
})()`;
function pct(a, p) { if (!a.length) return 0; const s = a.slice().sort((x, y) => x - y); return s[Math.min(s.length - 1, Math.floor(s.length * p))]; }
const mean = a => a.length ? a.reduce((s, x) => s + x, 0) / a.length : 0;
(async () => {
  let page;
  try {
    page = await CDP.open({ size: SIZE, touch: TOUCH, init: [INIT] });
    const q = (MODE === '2v2' ? 'debug=rally&live=1&' : 'cam6=3p&intro=0&wipe=0&noinstall=1&nonews=1&') + 'seed=' + SEED + (MAP ? '&map=' + MAP : '');
    await page.navigate(q); await CDP.sleep(MODE === '2v2' ? 2500 : 3000);
    const info = await page.evalJs(HOOK);
    const tEnd = Date.now() + SECS * 1000 / SPEED;
    while (Date.now() < tEnd) {
      await CDP.sleep(80);
      const st = await page.evalJs('VB.ctx.state');
      if (st === 'paused') await page.evalJs('VB.ctx.actions.resume&&VB.ctx.actions.resume();1');
      else if (st !== 'playing') break;
      if (SHOTS) {
        const c0 = await page.evalJs('window.__cap||""');
        if (c0) { await CDP.sleep(150); fs.mkdirSync(SHOTS, { recursive: true }); await page.shot(path.join(SHOTS, MODE + '-' + SIZE + (TOUCH ? 't' : '') + (MAP ? '-' + MAP : '') + '-' + c0 + '.png')); await page.evalJs('window.__cap="";VB.ctx.frozen=false;1'); }
      }
    }
    const M = await page.evalJs('JSON.stringify(window.__m)').then(JSON.parse);
    const tag = MODE + ' ' + SIZE + (TOUCH ? ' táctil' : '') + ' ' + (MAP || 'pista') + ' s' + SEED + (WALK ? ' WALK' : '');
    console.log('camserve ' + tag + ' (' + info + ') ' + (process.env.VB_ROOT ? 'VB_ROOT=' + process.env.VB_ROOT : 'esta copia'));
    if (M.err) console.log('ERROR sonda: ' + M.err);
    console.log('fase            frames  quieto   m/s media/p95/máx      giro °/s media/p95/máx   lente °/s media/p95   balón fuera');
    const keys = Object.keys(M.ph).sort(), res = { tag, ph: {}, sv: {} };
    for (const k of keys) {
      const o = M.ph[k], n = Math.max(1, o.n);
      const r = { n: o.n, still: o.still / n, sp: mean(o.sp), sp95: pct(o.sp, 0.95), spMax: Math.max(0, ...o.sp), yr: mean(o.yr), yr95: pct(o.yr, 0.95), yrMax: Math.max(0, ...o.yr), fr: mean(o.fr), fr95: pct(o.fr, 0.95), bOut: o.bOut / n };
      res.ph[k] = r;
      console.log(k.padEnd(14) + String(o.n).padStart(7) + (100 * r.still).toFixed(0).padStart(7) + ' %   ' + [r.sp, r.sp95, r.spMax].map(x => x.toFixed(2)).join(' / ').padEnd(20) + [r.yr, r.yr95, r.yrMax].map(x => x.toFixed(1)).join(' / ').padEnd(25) + [r.fr, r.fr95].map(x => x.toFixed(2)).join(' / ').padEnd(16) + (100 * r.bOut).toFixed(1) + ' %');
    }
    for (const w of ['yo', 'comp', 'rival']) {
      const L = M.sv.filter(s => s.who === w && s.n > 5); if (!L.length) continue;
      res.sv[w] = { n: L.length, path: mean(L.map(s => s.path)), pathMax: Math.max(...L.map(s => s.path)), ang: mean(L.map(s => s.ang)), angMax: Math.max(...L.map(s => s.ang)), fov: mean(L.map(s => s.fovS)) };
      const s = res.sv[w];
      console.log('saques ' + w.padEnd(5) + ' ' + String(s.n).padStart(3) + ': recorrido espera+lanz ' + s.path.toFixed(2) + ' m (máx ' + s.pathMax.toFixed(2) + ') · giro ' + s.ang.toFixed(1) + '° (máx ' + s.angMax.toFixed(1) + ') · lente ' + s.fov.toFixed(1) + '°');
      if (process.env.LOG) for (const x of L) console.log('   ' + (x.jump ? 'salto ' : 'flot. ') + x.path.toFixed(2) + ' m ' + x.ang.toFixed(1) + '° ' + x.fovS.toFixed(1) + '°');
    }
    if (M.lg) console.log('  ' + M.lg.join('\n  '));
    if (page.errors.length) console.log('  ERRORES de página: ' + page.errors.slice(0, 5).join(' | '));
    if (process.env.JSON) fs.appendFileSync(process.env.JSON, JSON.stringify(res) + '\n');
  } catch (e) { console.error(e && e.stack || e); }
  if (page) await page.close();
  process.exit(0);
})();
