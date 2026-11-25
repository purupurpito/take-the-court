/* =====================================================================
 * TAKE THE COURT — js/netconfig.js   (owner: net)
 * Configuración OPCIONAL de la red del online. Vacía por defecto: el juego usa los STUN públicos de js/netrtc.js y la conexión
 * es directa (cada rival puede ver la dirección de red del otro dentro de la negociación de WebRTC; el juego nunca la enseña).
 *
 * TURN de respaldo (Imprescindible 4.1, notes/turn.md): con VB.NET_TURN_URL = 'https://turn.takethecourt.com/ice' el lobby pide,
 * justo antes de cada oferta/respuesta, credenciales TURN temporales (1 h) al Worker de turn-worker/ (que comprueba la sesión de
 * Firebase y las saca de Cloudflare Realtime TURN). Si no contesta en VB.NetRtc.TURN_WAIT_MS (2 s) se sigue solo con STUN. Con
 * credenciales, VB.NET_ICE = {turn, relayOnly:false, exp}: iceTransportPolicy 'all' (lo directo primero; el TURN solo si no hay
 * otra forma, así no sube el ping). Vacía ('') = apagado: no se hace ninguna petición. NO pongas aquí la URL hasta que el Worker
 * esté desplegado (pasos en turn-worker/README.md).
 *
 * TURN fijo (lo de antes, «Robustez y privacidad» de notes/net.md): si VB.NET_ICE trae servidores TURN con relayOnly:true,
 * js/netrtc.js los usa con iceTransportPolicy 'relay' (todo pasa por el TURN: el rival solo ve la dirección del TURN). Si con TURN
 * no conecta a tiempo, se vuelve a probar en directo (STUN) en la siguiente negociación.
 *   VB.NET_ICE = { turn: [{ urls: ['turn:…:3478?transport=udp', 'turns:…:443?transport=tcp'], username: '…', credential: '…' }],
 *                  relayOnly: true };
 * NUNCA pongas aquí credenciales fijas: el repositorio es público. Las temporales las da el Worker (sus claves son secretos del
 * Worker en Cloudflare, nunca en el repo).
 * ===================================================================== */
(function () {
  'use strict';
  var root = (typeof window !== 'undefined') ? window : globalThis;
  var VB = root.VB = root.VB || {};
  if (!VB.NET_ICE) VB.NET_ICE = null;              // (sin TURN fijo)
  if (!VB.NET_TURN_URL) VB.NET_TURN_URL = '';      // (sin Worker de TURN: apagado. Cuando esté: 'https://turn.takethecourt.com/ice')
})();
