/* =====================================================================
 * VOLEY 3D — js/netrtc.js   (owner: net)
 * Modo online, fase 2 (notes/net.md «Fase 2»): transporte real por WebRTC DataChannel entre dos navegadores.
 *   - Dos canales «negociados» (los crean los dos lados con el mismo id, sin esperar a ondatachannel):
 *       'in'  id 1, {ordered:false, maxRetransmits:0}  → entradas (no fiable: la redundancia la pone la sesión)
 *       'ctl' id 2, fiable y en orden                  → control (JSON)
 *   - STUN públicos y gratuitos (Google y Cloudflare). Sin TURN de momento (decisión D4 de Ferran): si las redes no dejan conectar
 *     directamente, el lobby lo dice. La SDP va COMPLETA (se espera a reunir los candidatos, como mucho GATHER_MS): una oferta y una
 *     respuesta por conexión, sin goteo de candidatos.
 *   - Mismo contrato que memPair/BcLink de js/net.js: {send(ch, data), poll(now) → [{ch, data}], close()}. Además:
 *       offer() → Promise<sdp> (anfitrión: conexión nueva), answer(sdpOferta) → Promise<sdp> (invitado), accept(sdpRespuesta)
 *       state: 'new' | 'connecting' | 'open' | 'down' | 'closed';  onstate(state) opcional;  info() → {type: 'host'|'srflx'|'relay'|'', rtt}
 *     Reconectar sin que la sesión se entere: si la conexión se cae ('down'), el lobby negocia otra (offer/answer con gen+1) sobre el
 *     MISMO objeto: la sesión sigue llamando a send/poll y, mientras tanto, las entradas se pierden (la sesión espera) y el control
 *     se guarda en cola (hasta CTL_MAX) y sale al reabrir.
 *   - Privacidad: las direcciones de red solo viajan dentro de la SDP (sala de Firestore que solo leen los dos jugadores); info()
 *     solo da el TIPO de par (para medir cuántas conexiones son directas). El juego nunca enseña una IP.
 * ===================================================================== */
(function () {
  'use strict';
  var root = (typeof window !== 'undefined') ? window : globalThis;
  var VB = root.VB = root.VB || {};

  var ICE = [{ urls: 'stun:stun.l.google.com:19302' }, { urls: 'stun:stun.cloudflare.com:3478' }];
  var GATHER_MS = 3500, CTL_MAX = 400, DOWN_MS = 4000;

  function Link(o) {
    o = o || {};
    this.ice = Array.isArray(o.iceServers) ? o.iceServers : ICE;
    this.q = []; this.pend = []; this.pc = null; this.dIn = null; this.dCtl = null;
    this.state = 'new'; this.onstate = typeof o.onstate === 'function' ? o.onstate : null;
    this.onclose = null; this._disc = 0; this._type = ''; this._rtt = 0; this.opens = 0;
    var self = this;
    this._tick = setInterval(function () { self._watch(); }, 500);
  }
  var LP = Link.prototype;
  LP._set = function (s) { if (this.state === s || this.state === 'closed') return; this.state = s; if (this.onstate) { try { this.onstate(s); } catch (e) { } } };
  LP._drop = function () {
    var pc = this.pc; this.pc = null;
    if (this.dIn) { this.dIn.onmessage = this.dIn.onopen = this.dIn.onclose = null; }
    if (this.dCtl) { this.dCtl.onmessage = this.dCtl.onopen = this.dCtl.onclose = null; }
    this.dIn = this.dCtl = null;
    if (pc) { pc.onconnectionstatechange = pc.oniceconnectionstatechange = null; try { pc.close(); } catch (e) { } }
  };
  LP._mk = function () {
    this._drop();
    var self = this, pc = new RTCPeerConnection({ iceServers: this.ice });
    this.pc = pc; this._disc = 0;
    var dIn = pc.createDataChannel('in', { negotiated: true, id: 1, ordered: false, maxRetransmits: 0 });
    var dCtl = pc.createDataChannel('ctl', { negotiated: true, id: 2, ordered: true });
    this.dIn = dIn; this.dCtl = dCtl;
    var onmsg = function (ch) {
      return function (ev) { if (self.pc !== pc) return; var d = ev.data; self.q.push({ ch: ch, data: typeof d === 'string' ? d : new Uint8Array(d) }); };
    };
    [dIn, dCtl].forEach(function (dc) {
      dc.binaryType = 'arraybuffer';
      dc.onmessage = onmsg(dc === dIn ? 'in' : 'ctl');
      dc.onopen = function () { if (self.pc === pc) self._opened(); };
      dc.onclose = function () { if (self.pc === pc && self.state === 'open') self._set('down'); };
    });
    pc.onconnectionstatechange = function () {
      if (self.pc !== pc) return;
      var s = pc.connectionState;
      if (s === 'failed' || s === 'closed') { if (self.state === 'open' || self.state === 'connecting') self._set('down'); }
      else if (s === 'disconnected') { if (!self._disc) self._disc = Date.now(); }
      else if (s === 'connected') self._disc = 0;
    };
    this._set('connecting');
    return pc;
  };
  LP._opened = function () {
    if (!this.dIn || !this.dCtl || this.dIn.readyState !== 'open' || this.dCtl.readyState !== 'open') return;
    this.opens++;
    this._set('open');
    var p = this.pend; this.pend = [];
    for (var i = 0; i < p.length; i++) this._sendCtl(p[i]);
    this._stats();
  };
  /** 'disconnected' que no se arregla solo en DOWN_MS = caída (el lobby renegocia). */
  LP._watch = function () { if (this.state === 'open' && this._disc && Date.now() - this._disc > DOWN_MS) this._set('down'); };
  LP._stats = function () {
    var self = this, pc = this.pc; if (!pc || !pc.getStats) return;
    pc.getStats().then(function (rep) {
      var pair = null, loc = {};
      rep.forEach(function (r) { if (r.type === 'candidate-pair' && (r.nominated || r.selected) && r.state === 'succeeded') pair = r; if (r.type === 'local-candidate') loc[r.id] = r; });
      if (pair) { var lc = loc[pair.localCandidateId]; self._type = lc ? String(lc.candidateType || '') : ''; self._rtt = pair.currentRoundTripTime ? Math.round(pair.currentRoundTripTime * 1000) : 0; }
    }).catch(function () { });
  };
  function gather(pc, ms) {
    return new Promise(function (ok) {
      if (pc.iceGatheringState === 'complete') return ok();
      var t = setTimeout(done, ms);
      function done() { clearTimeout(t); pc.removeEventListener('icegatheringstatechange', chk); ok(); }
      function chk() { if (pc.iceGatheringState === 'complete') done(); }
      pc.addEventListener('icegatheringstatechange', chk);
    });
  }
  /** Anfitrión: conexión nueva y su oferta completa (SDP). */
  LP.offer = function () {
    var pc = this._mk();
    return pc.createOffer().then(function (o) { return pc.setLocalDescription(o); }).then(function () { return gather(pc, GATHER_MS); })
      .then(function () { return pc.localDescription.sdp; });
  };
  /** Invitado: conexión nueva con la oferta del anfitrión; devuelve la respuesta completa. */
  LP.answer = function (sdp) {
    var pc = this._mk();
    return pc.setRemoteDescription({ type: 'offer', sdp: sdp }).then(function () { return pc.createAnswer(); }).then(function (a) { return pc.setLocalDescription(a); })
      .then(function () { return gather(pc, GATHER_MS); }).then(function () { return pc.localDescription.sdp; });
  };
  /** Anfitrión: aplica la respuesta del invitado. */
  LP.accept = function (sdp) { var pc = this.pc; if (!pc) return Promise.reject(new Error('sin conexión')); return pc.setRemoteDescription({ type: 'answer', sdp: sdp }); };
  LP._sendCtl = function (data) { try { this.dCtl.send(data); return true; } catch (e) { return false; } };
  LP.send = function (ch, data) {
    if (this.state === 'closed') return;
    var open = this.state === 'open';
    if (ch === 'in') { if (open && this.dIn && this.dIn.readyState === 'open') { try { this.dIn.send(data); } catch (e) { } } return; }   // (perdida: la sesión reenvía)
    if (open && this.dCtl && this.dCtl.readyState === 'open' && this._sendCtl(data)) return;
    if (this.pend.length < CTL_MAX) this.pend.push(data);
  };
  LP.poll = function () { if (!this.q.length) return []; var o = this.q; this.q = []; return o; };
  LP.info = function () { if (this.state === 'open') this._stats(); return { type: this._type, rtt: this._rtt, opens: this.opens }; };
  LP.close = function () {
    if (this.state === 'closed') return;
    clearInterval(this._tick);
    // (lo último del control —el adiós de la sesión— aún puede estar saliendo: se cierra un poco después)
    var self = this, busy = this.dCtl && this.dCtl.readyState === 'open' && this.dCtl.bufferedAmount > 0;
    this._set('closed'); this.q = []; this.pend = [];
    if (busy || this.state === 'closed') setTimeout(function () { self._drop(); }, 400); else this._drop();
    var f = this.onclose; this.onclose = null;
    if (f) { try { f(); } catch (e) { } }
  };
  /** Pruebas: simula una caída (cierra la conexión sin avisar al otro lado de nada más). */
  LP._kill = function () { this._drop(); if (this.state !== 'closed') this._set('down'); };

  VB.NetRtc = { Link: Link, ICE: ICE, GATHER_MS: GATHER_MS, supported: function () { return typeof RTCPeerConnection === 'function'; } };
})();
