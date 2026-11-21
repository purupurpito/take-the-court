#!/usr/bin/env node
/* TAKE THE COURT — tools/camball.js  (owner: camera_input)
 * ¿Pierde la cámara de juego el balón? ¿Cuánto se mueve? (17-nov-2026, v1.9.2; Ferran: «Quiero la cámara de antes … lo que se tiene que
 * hacer es NO PERDERLO»). Sirve para 2v2 y 6v6 (3ª persona), pista y playa, y para comparar copias del juego (VB_ROOT=carpeta).
 * Juega en vivo con autopilot (2v2: debug=rally&live=1; 6v6: startMatch autopilot) con el reloj de rAF ×SPEED y, en los frames de juego
 * (planos de juego del 2v2 o 'tp', peloteo, sin congelar), mide con Vector3.project y la cámara REAL:
 *   - FUERA    balón fuera del cuadro (|x| o |y| NDC > 1, o detrás de la cámara) · BORDE (> 0,85)
 *   - BLOQ     frames en los 1,5 s tras un bloqueo (de cualquiera) y, de ellos, DETRÁS: el balón más lejos de la red que tu jugador en su
 *              campo (|x balón| > |x jugador| + 0,5): el caso de Ferran
 *   - MOV      movimiento de la cámara fuera de los cortes: velocidad media y p95 (m/s), giro medio y p95 (°/s, cuaternión), lente (°/s)
 * Uso: node tools/camball.js [2v2|6v6] [WxH=1280x720] [segundos de juego=120] [semilla=11]
 *   SPEED=2 · MAP=beach · TOUCH=1 · JSON=fichero · SHOTS=carpeta (secuencia +0,25/+0,6/+1,0 s de los primeros NSHOT=3 bloqueos con el
 *   balón detrás de tu jugador; congela un instante) · VB_ROOT=otra copia (p. ej. la de antes de un cambio) · LOG=1 (motivos de la
 *   contención y frames con el balón fuera)
 */
'use strict';
const path = require('path'), fs = require('fs');
const CDP = require('./cdp.js');
const MODE = process.argv[2] === '6v6' ? '6v6' : '2v2', SIZE = process.argv[3] || '1280x720', SECS = +(process.argv[4] || 120), SEED = +(process.argv[5] || 11);
const SPEED = +(process.env.SPEED || 2), SHOTS = process.env.SHOTS ? path.resolve(process.env.SHOTS) : '', NSHOT = +(process.env.NSHOT || 3);
const MAP = process.env.MAP === 'beach' ? 'beach' : '', TOUCH = process.env.TOUCH === '1';
setTimeout(() => { console.error('TIEMPO AGOTADO'); process.exit(2); }, SECS * 1000 / SPEED * 3 + 150000).unref();
const INIT = `(function(){ if(window.__cbInit) return; window.__cbInit=true; var SPEED=${SPEED};
  if(SPEED!==1){ var _raf=window.requestAnimationFrame.bind(window), t0=-1; window.requestAnimationFrame=function(cb){ return _raf(function(t){ if(t0<0) t0=t; cb(t0+(t-t0)*SPEED); }); }; } })();`;
const HOOK = `(function(){
  var c=VB.ctx, CR=VB.CameraRig, orig=CR.update, v=new c.THREE.Vector3(), GP={rally:1,defend:1,attack:1,serveUs:1,serveThem:1,tp:1};
  var M=window.__m={n:0,out:0,edge:0,bN:0,bOut:0,bbN:0,bbOut:0,sp:[],yr:[],fr:[],gt:0,blocks:0,bbEv:0,caps:[],err:'',ct:0,log:[]};
  var last=null, lastCut=-1, blkT=-9, plan=[], shotsLeft=${SHOTS ? NSHOT : 0}, seen=0;
  function ndcOut(x,y,z){ VB.toThree(x,y,z,v); v.project(c.camera); return v.z>1?2:(Math.abs(v.x)>1||Math.abs(v.y)>1)?2:(Math.abs(v.x)>0.85||Math.abs(v.y)>0.85)?1:0; }
  CR.update=function(g,dt,ev){ orig.apply(CR,arguments);
    try{
      if(!g||g.demo) return;
      var d=CR.getDebug?CR.getDebug():{}, shot=d.shot, cam=c.camera; cam.updateMatrixWorld(true);
      for(var i=0;i<ev.length;i++){ var e=ev[i]; if(e.type==='block'){ blkT=g.time; M.blocks++; seen=0; } }
      if(c.frozen){ last=null; return; }
      var cut=d.cutN!==lastCut; lastCut=d.cutN;
      var play=GP[shot]&&g.mode==='rally'&&g.ctrl;
      if(play){
        var b=g.ball, p=g.ctrl, o=ndcOut(b.x,b.y,b.z); M.n++; if(o===2){ M.out++; if(g.time-(M.lo||-9)>0.5&&(M.ol=M.ol||[]).length<30){ M.lo=g.time; M.ol.push('fuera t'+g.time.toFixed(1)+' '+shot+' '+g.lastKind+(g.lastTeam===0?'-n':'-r')+' b('+b.x.toFixed(1)+','+b.y.toFixed(1)+','+b.z.toFixed(1)+') v'+Math.hypot(b.vx,b.vy,b.vz).toFixed(0)+' jug('+p.x.toFixed(1)+','+p.y.toFixed(1)+') ndc '+(v.z>1?'detras':v.x.toFixed(2)+','+v.y.toFixed(2))+(d.ct?' ct '+d.ct.e.toFixed(1)+'/'+d.ct.dp.toFixed(0)+'/'+d.ct.dy.toFixed(0):'')); } } else if(o===1) M.edge++;
        if(d.ct&&(d.ct.e>0.1||Math.abs(d.ct.dp)>0.5||Math.abs(d.ct.dy)>0.5)) M.ct++; if(d.ct&&d.ct.why&&d.ct.why!==M.lw){ M.lw=d.ct.why; if(M.log.length<40) M.log.push('why '+d.ct.why+' t'+g.time.toFixed(1)+' n'+g.lastKind); } if(d.ct){ M.cOn=(M.cOn||0)+(d.ct.on?1:0); M.cE=(M.cE||0)+(d.ct.e>0.01?1:0); M.cA=(M.cA||0)+((d.ct.dp||d.ct.dy)?1:0); }
        if(g.time-blkT<1.5){ M.bN++; if(o===2) M.bOut++;
          var behind=(b.x>0)===(p.x>0)&&Math.abs(b.x)>Math.abs(p.x)+0.5;
          if(behind){ M.bbN++; if(o===2){ M.bbOut++; if(M.log.length<12) M.log.push('t'+g.time.toFixed(1)+' b('+b.x.toFixed(1)+','+b.y.toFixed(1)+','+b.z.toFixed(1)+') jug('+p.x.toFixed(1)+','+p.y.toFixed(1)+') '+shot+(d.ct?' ct '+d.ct.e.toFixed(1):'')); }
            if(!seen){ seen=1; M.bbEv++; if(shotsLeft>0){ shotsLeft--; var k=M.bbEv; [0.25,0.6,1.0].forEach(function(dd,j){ plan.push({t:blkT+dd,name:'b'+k+'-'+(j+1)+'-t'+(blkT+dd).toFixed(2)}); }); } } }
        }
      }
      for(var q=0;q<plan.length;q++){ if(g.time>=plan[q].t&&!window.__cap){ window.__cap=plan[q].name; plan.splice(q,1); c.frozen=true; M.caps.push(window.__cap); break; } }
      var px=cam.position.x, py=-cam.position.z, pz=cam.position.y, qq=cam.quaternion;
      if(play&&last&&!cut&&dt>0.004){
        M.sp.push(Math.hypot(px-last.x,py-last.y,pz-last.z)/dt);
        var dq=Math.abs(qq.x*last.qx+qq.y*last.qy+qq.z*last.qz+qq.w*last.qw); M.yr.push(2*Math.acos(Math.min(1,dq))/dt*57.2958);
        M.fr.push(Math.abs(cam.fov-last.f)/dt); M.gt+=dt;
      }
      last=play?{x:px,y:py,z:pz,qx:qq.x,qy:qq.y,qz:qq.z,qw:qq.w,f:cam.fov}:null;
    }catch(err){ M.err=String(err&&err.stack||err); }
  };
  ${TOUCH ? "try{ window.dispatchEvent(new TouchEvent('touchstart',{bubbles:true})); }catch(er){}" : ''}
  ${MODE === '6v6' ? "c.actions.startMatch({autopilot:true,format:'6v6',points:25});" : ''}
  return (c.game&&c.game.size)+' '+(c.game&&c.game.map||'');
})()`;
function pct(a, p) { if (!a.length) return 0; const s = a.slice().sort((x, y) => x - y); return s[Math.min(s.length - 1, Math.floor(s.length * p))]; }
const mean = a => a.length ? a.reduce((s, x) => s + x, 0) / a.length : 0;
(async () => {
  let page, res = {};
  try {
    page = await CDP.open({ size: SIZE, touch: TOUCH, init: [INIT] });
    const q = (MODE === '2v2' ? 'debug=rally&live=1&' : 'cam6=3p&intro=0&wipe=0&noinstall=1&nonews=1&') + 'seed=' + SEED + (MAP ? '&map=' + MAP : '');
    await page.navigate(q); await CDP.sleep(MODE === '2v2' ? 2500 : 3000);
    const info = await page.evalJs(HOOK);
    if (SHOTS) fs.mkdirSync(SHOTS, { recursive: true });
    const tag = (process.env.TAG || 'x') + '-' + MODE + '-' + SIZE + (TOUCH ? 't' : '') + (MAP ? '-' + MAP : '');
    const tEnd = Date.now() + SECS * 1000 / SPEED;
    while (Date.now() < tEnd) {
      await CDP.sleep(60);
      const st = await page.evalJs('VB.ctx.state');
      if (st === 'paused') await page.evalJs('VB.ctx.actions.resume&&VB.ctx.actions.resume();1');
      else if (st !== 'playing') break;
      if (SHOTS) {
        const cap = await page.evalJs('window.__cap||""');
        if (cap) { await CDP.sleep(150); await page.shot(path.join(SHOTS, tag + '-' + cap + '.png')); await page.evalJs('window.__cap="";VB.ctx.frozen=false;1'); }
      }
    }
    const M = await page.evalJs('JSON.stringify(window.__m)').then(JSON.parse);
    const n = Math.max(1, M.n), f = x => (100 * x).toFixed(2) + ' %';
    res = { mode: MODE, size: SIZE, seed: SEED, map: MAP || 'hall', touch: TOUCH, frames: M.n, out: M.out / n, edge: M.edge / n, blkFrames: M.bN, blkOut: M.bOut / Math.max(1, M.bN),
      behindFrames: M.bbN, behindOut: M.bbOut / Math.max(1, M.bbN), blocks: M.blocks, behindEv: M.bbEv, ct: M.ct / n,
      spMean: mean(M.sp), sp95: pct(M.sp, 0.95), yrMean: mean(M.yr), yr95: pct(M.yr, 0.95), frMean: mean(M.fr), fr95: pct(M.fr, 0.95), playS: M.gt };
    console.log('camball ' + MODE + ' ' + SIZE + (TOUCH ? ' táctil' : '') + ' ' + res.map + ' semilla ' + SEED + ' (' + info + ') ' + (process.env.VB_ROOT ? 'VB_ROOT=' + process.env.VB_ROOT : 'esta copia'));
    if (M.err) console.log('ERROR sonda: ' + M.err);
    if (process.env.LOG) console.log('  ct on ' + M.cOn + ' e ' + M.cE + ' ang ' + M.cA);
    console.log('  frames de peloteo ' + M.n + ': FUERA ' + f(res.out) + ', borde ' + f(res.edge) + (M.ct ? ', contención activa ' + f(res.ct) : ''));
    console.log('  tras bloqueo (' + M.blocks + ' bloqueos): ' + M.bN + ' frames, fuera ' + f(res.blkOut) + ' · balón DETRÁS de tu jugador: ' + M.bbN + ' frames (' + M.bbEv + ' jugadas), fuera ' + f(res.behindOut));
    console.log('  movimiento: ' + res.spMean.toFixed(2) + ' m/s (p95 ' + res.sp95.toFixed(1) + '), giro ' + res.yrMean.toFixed(1) + ' °/s (p95 ' + res.yr95.toFixed(0) + '), lente ' + res.frMean.toFixed(2) + ' °/s (p95 ' + res.fr95.toFixed(1) + ')');
    if (process.env.LOG && M.log.length) console.log('  ' + M.log.join('\n  '));
    if (process.env.LOG && M.ol) console.log('  ' + M.ol.join('\n  '));
    if (M.caps.length) console.log('  capturas: ' + M.caps.join(', ') + ' → ' + SHOTS);
    if (page.errors.length) console.log('  ERRORES de página: ' + page.errors.slice(0, 5).join(' | '));
    if (process.env.JSON) fs.appendFileSync(process.env.JSON, JSON.stringify(Object.assign({ tag: process.env.TAG || '' }, res)) + '\n');
  } catch (e) { console.error(e && e.stack || e); }
  if (page) await page.close();
  process.exit(0);
})();
