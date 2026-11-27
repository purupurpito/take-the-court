/* TAKE THE COURT — js/report.js (owner: net; auditoría legal del 25-nov-2026, pages/condiciones.html «Cómo denunciar»)
 * «Denunciar nombre» y «Bloquear» a otros jugadores del online.
 *
 *  - Denunciar: guarda en Firestore feedback/{id aleatorio de 20} (la colección de las sugerencias, reglas en firebase/firestore.rules
 *    «FEEDBACK», rama kind 'report') = {kind: 'report', uid (quien denuncia: hace falta sesión), ru (uid denunciado), rn (su nombre tal
 *    cual llegó, ≤ 40), room (código de la sala, ≤ 12), ver, t (hora del SERVIDOR, transformación REQUEST_TIME), state: 'nuevo',
 *    exp (ahora + 180 días: sin TTL en el plan gratuito: la borra la tarea diaria local ttc-netlogs del responsable)}. Lo lee solo admin().
 *    Una denuncia por uid y página (no se repite al pulsar dos veces). Sin sesión no se manda (el online ya la exige).
 *  - Bloquear: SOLO en este aparato, 'make-the-cut.netblock' = [{u, n, t}] (como mucho 200; nunca va a la cuenta ni a la nube).
 *    js/netlobby.js no enseña las salas donde está un bloqueado, no deja entrar por código en la de un anfitrión bloqueado y, si un
 *    bloqueado entra en la tuya, lo saca (1v1: rooms.unguest; varios: rooms.kick). Ajustes · Juego › «Desbloquear jugadores (n)».
 *  - sheet(people, o): hoja (VB.Splat.sheet) para elegir a quién (si hay varios) y «Denunciar nombre» / «Bloquear» / «Desbloquear».
 *    people = [{u: uid, n: nombre que se ve, raw: nombre tal cual (opcional)}]; o = {room: código, title}.
 *    La abren netlobby.js (lista de salas y sala de espera) y ui.js (hoja final de un partido online).
 * API (VB.Report): sheet · send(p, room) → Promise<'ok'|'dup'|'noacc'|'fail'> · blocked(uid) · block(uid, n) · unblock(uid) ·
 *   unblockAll() · blockedCount() · KEY. Sin THREE; localStorage en try/catch. tools/reporttest.js lo prueba (y las reglas, con el
 *   emulador).
 */
(function () {
  var root = typeof window !== 'undefined' ? window : globalThis;
  var VB = root.VB = root.VB || {};
  var KEY = 'make-the-cut.netblock', MAX = 200, KEEP_MS = 180 * 86400000;
  var B62 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  var sent = {};   // uid → true: ya denunciado en esta página

  function LS() { try { return root.localStorage || null; } catch (e) { return null; } }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function clean(s, n) { return String(s == null ? '' : s).replace(/[\u0000-\u001f<>]/g, '').trim().slice(0, n); }
  function okUid(u) { return typeof u === 'string' && u.length > 0 && u.length <= 128; }

  // ---------------------------------------------------------------- bloqueados (solo en este aparato)
  function list() {
    var l = LS(), v = null;
    try { v = l ? JSON.parse(l.getItem(KEY) || 'null') : null; } catch (e) { v = null; }
    return Array.isArray(v) ? v.filter(function (x) { return x && okUid(x.u); }).slice(-MAX) : [];
  }
  function save(a) { var l = LS(); try { if (l) { if (a.length) l.setItem(KEY, JSON.stringify(a.slice(-MAX))); else l.removeItem(KEY); } } catch (e) { } }
  function blocked(u) { if (!okUid(u)) return false; var a = list(); for (var i = 0; i < a.length; i++) if (a[i].u === u) return true; return false; }
  function block(u, n) { if (!okUid(u) || blocked(u)) return false; var a = list(); a.push({ u: u, n: clean(n, 40), t: Date.now() }); save(a); return true; }
  function unblock(u) { var a = list(), b = a.filter(function (x) { return x.u !== u; }); save(b); return b.length !== a.length; }
  function unblockAll() { save([]); }
  function blockedCount() { return list().length; }

  // ---------------------------------------------------------------- denunciar (Firestore feedback/{id})
  function rid() {
    var a = new Uint8Array(20), s = '';
    try { root.crypto.getRandomValues(a); } catch (e) { for (var j = 0; j < 20; j++) a[j] = Math.floor(Math.random() * 256); }
    for (var i = 0; i < 20; i++) s += B62.charAt(a[i] % 62);
    return s;
  }
  /** Una denuncia. p = {u, n, raw}; room = código. 'dup' si ya se denunció en esta página; 'noacc' sin sesión. */
  function send(p, room, opt) {
    opt = opt || {};
    if (!p || !okUid(p.u)) return Promise.resolve('fail');
    if (sent[p.u]) return Promise.resolve('dup');
    var A = VB.Account, F = opt.fetch || (typeof fetch === 'function' ? fetch.bind(root) : null);
    var base = String(opt.base || (A && A.FS_BASE) || '').replace(/\/+$/, '');
    var auth = opt.auth || (A && A.netAuth && (!A.isIn || A.isIn()) ? function () { return A.netAuth(); } : null);
    if (!base || !F || !auth) return Promise.resolve('noacc');
    return Promise.resolve().then(auth).then(function (a) {
      if (!a || !a.uid || !a.token) return 'noacc';
      var name = base.replace(/^https?:\/\/[^\/]+\/v1\//, '') + '/feedback/' + rid();
      var flds = { kind: { stringValue: 'report' }, uid: { stringValue: a.uid }, ru: { stringValue: p.u }, rn: { stringValue: clean(p.raw || p.n, 40) },
        room: { stringValue: clean(room, 12) }, ver: { stringValue: String(VB.VERSION || '').slice(0, 20) }, state: { stringValue: 'nuevo' },
        exp: { timestampValue: new Date(Date.now() + KEEP_MS).toISOString() } };
      var body = JSON.stringify({ writes: [{ update: { name: name, fields: flds }, updateTransforms: [{ fieldPath: 't', setToServerValue: 'REQUEST_TIME' }], currentDocument: { exists: false } }] });
      return F(base + ':commit', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + a.token }, body: body })
        .then(function (r) { if (r && r.ok) { sent[p.u] = true; return 'ok'; } return 'fail'; }, function () { return 'fail'; });
    }, function () { return 'noacc'; });
  }

  // ---------------------------------------------------------------- hoja
  function toast(t, bad) {
    var S = VB.Splat;
    if (S && S.toast) { try { S.toast(esc(t), { key: 'report', ms: 4500, cls: bad ? 'ol-tbad' : '' }); return; } catch (e) { } }
    try { if (root.console) console.info('[report] ' + t); } catch (e) { }
  }
  var MSG = { ok: 'Denuncia enviada. La revisaremos. Gracias.', dup: 'Ya has denunciado a este jugador.', noacc: 'Para denunciar necesitas tu cuenta.',
    fail: 'No se ha podido enviar. Prueba otra vez o escribe a help@takethecourt.com.' };
  /** Hoja de «Denunciar nombre». people: los demás jugadores (uid y nombre); o.room: código de la sala. */
  function css() {
    if (typeof document === 'undefined' || document.getElementById('rpCss')) return;
    var st = document.createElement('style'); st.id = 'rpCss';
    st.textContent = '.rp-sheet .rp-p{margin:0 0 10px;font:500 15px/1.4 var(--sp-ui,system-ui,sans-serif)}.rp-sheet .rp-p b{font:400 19px/1.2 var(--sp-pop,system-ui,sans-serif);overflow-wrap:anywhere}' +
      '.rp-sheet .rp-list{display:flex;flex-direction:column;align-items:stretch;gap:12px;padding:2px 6px 8px}.rp-sheet .rp-who{width:100%;justify-content:flex-start}.rp-sheet .rp-who .sp-t{overflow-wrap:anywhere;white-space:normal}';
    document.head.appendChild(st);
  }
  function sheet(people, o) {
    o = o || {}; css();
    var S = VB.Splat, seen = {}, P = [];
    (people || []).forEach(function (x) { if (x && okUid(x.u) && !seen[x.u]) { seen[x.u] = 1; P.push(x); } });
    if (!S || !S.sheet) return null;
    if (!P.length) { toast('No hay ningún jugador al que denunciar aquí.'); return null; }
    if (P.length === 1) return actSheet(P[0], o, null);
    var h = '<p class="rp-p">Elige al jugador:</p><div class="rp-list">' + P.map(function (x, i) {
      return '<button type="button" class="sp-btn sp-md sp-cream rp-who" data-shape="' + (i % 4) + '" data-i="' + i + '"><span class="sp-t">' + esc(x.n || 'Jugador') + (blocked(x.u) ? ' (bloqueado)' : '') + '</span></button>';
    }).join('') + '</div>';
    var api = S.sheet({ title: o.title || 'Denunciar nombre', html: h, cls: 'rp-sheet', dock: false });
    if (api && api.body) api.body.addEventListener('click', function (e) {
      var b = e.target && e.target.closest ? e.target.closest('[data-i]') : null; if (!b) return;
      var x = P[+b.getAttribute('data-i')]; if (x) actSheet(x, o, P);
    });
    return api;
  }
  function actSheet(x, o, all) {
    var S = VB.Splat, isB = blocked(x.u), done = !!sent[x.u];
    var h = '<p class="rp-p"><b>' + esc(x.n || 'Jugador') + '</b></p>' +
      '<p class="rp-p">Si su nombre es ofensivo o lleva datos personales, denúncialo: nos llega su nombre, su identificador y la sala, y lo revisamos. No le decimos quién ha sido.</p>' +
      '<p class="rp-p">Si lo bloqueas, no verás sus salas ni podrá entrar en las tuyas (solo en este dispositivo).</p>';
    var acts = [{ label: 'Cancelar', cls: 'sp-cream', fn: all && all.length > 1 ? function () { setTimeout(function () { sheet(all, o); }, 0); } : null },
      { label: isB ? 'Desbloquear' : 'Bloquear', cls: 'sp-ink', fn: function () {
        if (isB) { unblock(x.u); toast((x.n || 'Jugador') + ' ya no está bloqueado.'); }
        else { block(x.u, x.raw || x.n); toast((x.n || 'Jugador') + ' bloqueado. No volverás a coincidir con él.'); }
        if (o.onBlock) { try { o.onBlock(x, !isB); } catch (e) { } }
      } },
      { label: done ? 'Ya denunciado' : 'Denunciar nombre', cls: 'sp-danger', primary: true, id: 'rpSend', fn: function (api) {
        if (sent[x.u]) { toast(MSG.dup); return; }
        var b = api && api.el && api.el.querySelector('#rpSend'); if (b) { b.disabled = true; var t = b.querySelector('.sp-t'); if (t) t.textContent = 'Enviando…'; }
        send(x, o.room).then(function (r) { toast(MSG[r] || MSG.fail, r !== 'ok' && r !== 'dup'); if (api && api.open) api.close(); });
        return false;
      } }];
    return S.sheet({ title: 'Denunciar nombre', html: h, cls: 'rp-sheet', actions: acts });
  }

  VB.Report = { sheet: sheet, send: send, blocked: blocked, block: block, unblock: unblock, unblockAll: unblockAll, blockedCount: blockedCount, list: list, KEY: KEY,
    _reset: function () { sent = {}; } };
})();
