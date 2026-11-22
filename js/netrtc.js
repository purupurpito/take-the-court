/* =====================================================================
 * TAKE THE COURT — js/netrtc.js   (owner: net)
 * Modo online, fase 2 (notes/net.md «Fase 2»): transporte real por WebRTC DataChannel entre dos navegadores.
 *   - Dos canales «negociados» (los crean los dos lados con el mismo id, sin esperar a ondatachannel):
 *       'in'  id 1, {ordered:false, maxRetransmits:0}  → entradas (no fiable: la redundancia la pone la sesión)
 *       'ctl' id 2, fiable y en orden                  → control (JSON)
 *   - STUN públicos y gratuitos (Google y Cloudflare). TURN opcional (js/netconfig.js, vacío por defecto; ver pcConfig): si las redes no dejan conectar
 *     directamente, el lobby lo dice. La SDP va COMPLETA (se espera a reunir los candidatos, como mucho GATHER_MS): una oferta y una
 *     respuesta por conexión, sin goteo de candidatos.
 *   - Mismo contrato que memPair/BcLink de js/net.js: {send(ch, data), poll(now) → [{ch, data}], close()}. Además:
 *       offer() → Promise<sdp> (anfitrión: conexión nueva), answer(sdpOferta) → Promise<sdp> (invitado), accept(sdpRespuesta)
 *       state: 'new' | 'connecting' | 'open' | 'down' | 'closed';  onstate(state) opcional;  info() → {type: 'host'|'srflx'|'relay'|'', rtt}
 *     Reconectar sin que la sesión se entere: si la conexión se cae ('down'), el lobby negocia otra (offer/answer con gen+1) sobre el
 *     MISMO objeto: la sesión sigue llamando a send/poll y, mientras tanto, las entradas se pierden (la sesión espera) y el control
 *     se guarda en cola (hasta CTL_MAX) y sale al reabrir.
 *   - Pruebas: ?netlag=&netjit=&netloss= (solo en local) retrasan y pierden lo que llega, como el Shaper de memPair / BcLink.
 *   - Privacidad: las direcciones de red solo viajan dentro de la SDP (sala de Firestore que solo leen los dos jugadores); info()
 *     solo da el TIPO de par (para medir cuántas conexiones son directas). El juego nunca enseña una IP.
 * ===================================================================== */
(function () {
  'use strict';
  var root = (typeof window !== 'undefined') ? window : globalThis;
  var VB = root.VB = root.VB || {};

  var ICE = [{ urls: 'stun:stun.l.google.com:19302' }, { urls: 'stun:stun.cloudflare.com:3478' }];
  var GATHER_MS = 3500, CTL_MAX = 400, DOWN_MS = 4000;
  /* TURN opcional (js/netconfig.js, VB.NET_ICE): con servidores TURN, iceTransportPolicy 'relay' (el rival solo ve la dirección del
   * TURN, nunca la tuya). Si una conexión por TURN se cae o se sustituye sin haber llegado a abrirse, esta página deja el TURN y
   * vuelve a lo normal (STUN, directa) en la siguiente negociación (relayBad). */
  var relayBad = false;
  function turnCfg() {
    var c = VB.NET_ICE;
    if (!c || !Array.isArray(c.turn)) return null;
    var L = c.turn.filter(function (s) { return s && (typeof s.urls === 'string' || Array.isArray(s.urls)) && /^turns?:/.test([].concat(s.urls)[0] || ''); });
    return L.length ? { servers: L, relay: c.relayOnly !== false } : null;
  }
  /** Configuración del RTCPeerConnection: (iceServers explícitos de las pruebas) > TURN (si lo hay y no ha fallado) > STUN. */
  function pcConfig(explicit) {
    if (explicit) return { cfg: { iceServers: explicit }, relay: false };
    var t = relayBad ? null : turnCfg();
    if (!t) return { cfg: { iceServers: ICE }, relay: false };
    var cfg = { iceServers: t.servers.concat(ICE) };
    if (t.relay) cfg.iceTransportPolicy = 'relay';
    return { cfg: cfg, relay: !!t.relay };
  }

  /* Simulador de red para las pruebas con WebRTC de verdad (P8 del sprint online-multi; tools/netdrive.js --rtc «netlag=80&netjit=15&
   * netloss=2»): ?netlag= (RTT añadido, ms; cada lado retrasa lo que RECIBE la mitad), ?netjit= (± ms por sentido), ?netloss= (% de
   * pérdida, solo en 'in'). El mismo Shaper de js/net.js (memPair / BcLink). Solo desde file:// o localhost: en la web publicada, nada. */
  function nowMs() { return typeof performance !== 'undefined' ? performance.now() : Date.now(); }
  var SH_Q = null;
  function shaperFor(o) {
    if (o.shape === false) return null;
    if (!SH_Q) {
      SH_Q = {};
      try {
        var L = root.location, local = L && (L.protocol === 'file:' || /^(localhost|127\.0\.0\.1)$/.test(L.hostname));
        if (local) String(L.search || '').replace(/^\?/, '').split('&').forEach(function (kv) { var a = kv.split('='); if (/^net(lag|jit|loss)$/.test(a[0])) SH_Q[a[0].slice(3)] = +decodeURIComponent(a[1] || '') || 0; });
      } catch (e) { }
    }
    var c = o.shape && typeof o.shape === 'object' ? o.shape : SH_Q, Sh = VB.Net && VB.Net.Shaper;
    if (!Sh || !(c.lag > 0 || c.jit > 0 || c.loss > 0)) return null;
    return new Sh({ lag: c.lag, jit: c.jit, loss: c.loss }, ((Math.random() * 1e9) | 0) + 1);
  }
  function Link(o) {
    o = o || {};
    this._sh = shaperFor(o);   // (pruebas: ?netlag=&netjit=&netloss=, solo en local)
    this.ice = Array.isArray(o.iceServers) ? o.iceServers : null;   // (null: netconfig/STUN, ver pcConfig)
    this._relay = false; this._pcOpened = false;
    this.q = []; this.pend = []; this.pc = null; this.dIn = null; this.dCtl = null;
    this.state = 'new'; this.onstate = typeof o.onstate === 'function' ? o.onstate : null;
    this.onclose = null; this._shN = 0; this._disc = 0; this._type = ''; this._rtt = 0; this.opens = 0;
    var self = this;
    this._tick = setInterval(function () { self._watch(); }, 500);
  }
  var LP = Link.prototype;
  LP._set = function (s) { if (this.state === s || this.state === 'closed') return; this.state = s; if (this.onstate) { try { this.onstate(s); } catch (e) { } } };
  LP._drop = function () {
    var pc = this.pc; this.pc = null;
    if (pc && this._relay && !this._pcOpened) relayBad = true;   // (TURN que no llegó a abrir: la siguiente, directa)
    if (this.dIn) { this.dIn.onmessage = this.dIn.onopen = this.dIn.onclose = null; }
    if (this.dCtl) { this.dCtl.onmessage = this.dCtl.onopen = this.dCtl.onclose = null; }
    this.dIn = this.dCtl = null;
    if (pc) { pc.onconnectionstatechange = pc.oniceconnectionstatechange = null; try { pc.close(); } catch (e) { } }
  };
  LP._mk = function () {
    this._drop();
    var pcc = pcConfig(this.ice), pc;
    try { pc = new RTCPeerConnection(pcc.cfg); } catch (e) { relayBad = true; pcc = pcConfig(this.ice); pc = new RTCPeerConnection(pcc.cfg); }   // (TURN mal escrito)
    var self = this;
    this.pc = pc; this._disc = 0; this._relay = pcc.relay; this._pcOpened = false;
    var dIn = pc.createDataChannel('in', { negotiated: true, id: 1, ordered: false, maxRetransmits: 0 });
    var dCtl = pc.createDataChannel('ctl', { negotiated: true, id: 2, ordered: true });
    this.dIn = dIn; this.dCtl = dCtl;
    var onmsg = function (ch) {
      return function (ev) {
        if (self.pc !== pc) return; var d = ev.data, m = { ch: ch, data: typeof d === 'string' ? d : new Uint8Array(d) };
        if (self._sh) { var at = self._sh.due(ch, nowMs()); if (at < 0) return; m.at = at; m.n = ++self._shN; }
        self.q.push(m);
      };
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
      if (s === 'failed' || s === 'closed') { if (self._relay && !self._pcOpened) relayBad = true; if (self.state === 'open' || self.state === 'connecting') self._set('down'); }
      else if (s === 'disconnected') { if (!self._disc) self._disc = Date.now(); }
      else if (s === 'connected') self._disc = 0;
    };
    this._set('connecting');
    return pc;
  };
  LP._opened = function () {
    if (!this.dIn || !this.dCtl || this.dIn.readyState !== 'open' || this.dCtl.readyState !== 'open') return;
    this.opens++; this._pcOpened = true;
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
      var pair = null, loc = {}, rem = {};
      rep.forEach(function (r) { if (r.type === 'candidate-pair' && (r.nominated || r.selected) && r.state === 'succeeded') pair = r; if (r.type === 'local-candidate') loc[r.id] = r; if (r.type === 'remote-candidate') rem[r.id] = r; });
      if (pair) {
        var lc = loc[pair.localCandidateId], rc = rem[pair.remoteCandidateId];
        self._type = lc ? String(lc.candidateType || '') : ''; self._rtt = pair.currentRoundTripTime ? Math.round(pair.currentRoundTripTime * 1000) : 0;
        // informe de red (js/netlog.js): tipos y protocolo, NUNCA direcciones ni puertos
        self._rtype = rc ? String(rc.candidateType || '') : ''; self._proto = lc ? String(lc.protocol || '') : '';
        self._relayProto = lc && lc.relayProtocol ? String(lc.relayProtocol) : '';
      }
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
  LP.poll = function () {
    if (!this.q.length) return [];
    if (this._sh) {   // (con el simulador de red: solo lo que ya «ha llegado», en orden de llegada)
      var t = nowMs(), out = [], keep = [], q = this.q;
      q.sort(function (a, b) { return a.at - b.at || a.n - b.n; });
      for (var i = 0; i < q.length; i++) { if (q[i].at <= t) out.push({ ch: q[i].ch, data: q[i].data }); else keep.push(q[i]); }
      this.q = keep; return out;
    }
    var o = this.q; this.q = []; return o;
  };
  LP.info = function () { if (this.state === 'open') this._stats(); return { type: this._type, rtt: this._rtt, opens: this.opens, rtype: this._rtype || '', proto: this._proto || '', relayProto: this._relayProto || '' }; };
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

  VB.NetRtc = { Link: Link, ICE: ICE, GATHER_MS: GATHER_MS, supported: function () { return typeof RTCPeerConnection === 'function'; },
    _pcConfig: pcConfig, relayOn: function () { return !relayBad && !!turnCfg(); }, _relayReset: function () { relayBad = false; } };
})();
