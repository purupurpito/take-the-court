# Design B (deep sim ownership: separate stepFluid, contact-relative handover tick «kh» sent in each touch bundle, «fq» fault requests so exactly one machine calls point() per rally, «sr» serve gate). Grafted onto it:
- the speed-scaled net zone from A;
- the rival timeline and ball time-warp from C;
- own-pose rewind during catch-up from C;
- snapshot rebase of the ghost ball from C (cross-browser drift);
- solo delegating to the existing stepOnline from C;
- bundles sent on both channels from A/C.

Shown in the room rules as «Conexión: Precisa / Fluida».

Two of the three judges picked B. The third preferred A only because A changes sim.js less, and the grafts below answer each of that judge's blockers. What decided it:

1) Shared match state. B is the only design where exactly ONE machine calls point() per rally. Contacts, blocks, landings and ball faults are decided by the ball owner. Faults by the non-owner's own players (net touch at sim.js stepPlayer ~2589, early press at blockPress ~1133) do not score locally: they go to the owner as an «fq» request, and the owner accepts or drops it. Score conflicts and retracted whistles therefore cannot happen on the normal path; the only one left is the rare «fork» (see below), which always resolves the same way.

2) The handover tick is decided ONCE, by the owner, at the moment of contact. It travels in the touch bundle as kh, a number of half-steps after the contact. Both machines switch owner at the same shared half-step and the receiver never recomputes the trajectory. Cross-browser Math.cos/sin differences (the wobble at sim.js:1914) therefore cannot make the two machines disagree on who owns the ball. A small physical drift is corrected cosmetically: the ghost is rebased from the owner's snapshot ball when it drifts more than 3 cm.

3) Precisa stays byte-identical. stepOnline is not edited. Fluida gets its own stepFluid and a one-line dispatch in step(). Every edit inside an existing function is behind `if (g.fl` and draws no rng when g.fl is absent. g.fl is only created by an exported flInit, never in the createGame literal or in mkPlayer.

4) Near-net play keeps working. The handover zone scales with ball speed: L = clamp(0.12·|vx|, 0.25, 0.6) while the owning team may still touch the ball, and 0.6 m otherwise. Spikes, serves and third touches hand over as they enter checkBlock's 0.6 m zone, so blocks are judged on the blocker's own machine. Tight sets and slow balls stay with the attacking side until 0.25 m from the net.

5) Feel. Your own team and every ball on your side run at the present tick with no network in the loop. Rival players are drawn interpolated about 50–150 ms in the past, and the rival-owned ball is drawn on that same past timeline. After the rival's contact the ball is time-warped to the present by the handover tick, so the swing and the ball line up and the ball reaches your side «now». The local AI reads rival poses extrapolated to the present (capped at 100 ms), so it blocks on time; the screen never shows those extrapolated poses.

Names: «P2P / Server-side» would be wrong, because both modes are P2P and there is no server (GitHub Pages and Firestore only). «Precisa» = today's rollback (both machines see exactly the same thing). «Fluida» = your side responds instantly. The row is called «Conexión».

# Online V2 «Fluida» — implementation spec

Repo: `C:/Users/Puru/FCVBARB/carpetas/make-the-cut-rename`.
Code style: classic `<script>` files exposing `window.VB`, ES5-ish, comments and UI in Spanish.
UI texts follow notes/ui_main.md «Textos: guía de estilo»:
- no «·» used as glue;
- gender-neutral wording;
- everything must fit at 1280x720, 844x390 and 667x375.

## 0. Invariants (non-negotiable gates)

1. **Offline is unchanged.** `node tools/simtest.js` must still give identical fingerprints (tools/fp-2v2.json via fingerprint6.js, and fp-mastery.json). Run it after EVERY sim.js edit.
2. **Precisa is unchanged.** The js/net.js code path is untouched, except the one-line `sameRoom` addition in §9. tools/nettest.js, net3test.js, mptest.js, netreplaytest.js, viewtest.js, statstest.js and replaytest.js must pass.
3. **No new fields in the `createGame` literal (sim.js:308-404) or in `mkPlayer` (sim.js:193).** The only new game field is `g.fl`, created only by `VB.Sim.flInit`. Every line added inside an existing sim function sits inside `if (g.fl ...)` and draws no `g.rng` unless `g.fl` is truthy.
4. **Your own players are never corrected by the network.** Their physical fields are only written by:
   - local stepping;
   - the deterministic game-rule teleports (setupServe, nextSet), which run locally on both machines;
   - a full resync `rs` after a solo/vs-AI period or a reload adoption (the documented exception, same as Precisa).
5. **No game server.** Everything goes over the existing Link (netrtc.js WebRTC, or memPair/BcLink in tests).
6. **Fluida is opt-in per room.** The room field is absent for Precisa.

## 1. Vocabulary and coordinates

- All network data is in CANONICAL coordinates:
  - team 0 = host, plays on x>0; team 1 = guest, plays on x<0; the net is x=0;
  - `side(t)` = t===0 ? +1 : -1.
- The guest's view is still produced by `NetView.mirror`.
- `STEP = 1/120 s`; shared tick `T = floor((now - t0)/STEP_MS)`.
- Half-step index `hs = 2*T + h`, with h ∈ {0,1}; the rally ball runs as 2 half-steps per tick (as in stepOnline).
- `me` = local team (host 0, guest 1). `own` = team that owns the ball and rally state.
- `r` = rally number. It is incremented on both machines by every applied point.

## 2. Sim changes (js/sim.js) — all gated

### 2.1 State

New exported function `flInit(g, me)`, placed after `initOnline` (~sim.js:3798):
```js
g.fl = { me: me, loc: [me===0, me===1], own: g.server ? g.server.team : 0,
         T: 0, r: 0, seq: 0, par: 0, kh: -1, khAt: -1, bAge: 0,
         app: false, catch: false, peer: false, fq: [], pts: [] };
```
- `loc[t]` = team t is simulated here. After `flTake` (solo) it is [true, true].
- `khAt` = absolute half-step index at which ownership switches; -1 means none pending.
- `fq` = fault requests (plain data).
- `pts` = locally produced point records (plain data, no refs).
- The session drains both arrays after every step.

Only plain data goes inside `g.fl` (no player references), so `copyGame`, `serialize` and NetView 'as' copy it safely.

Helper:
```js
function mine(g, p) { return !g.fl || g.fl.loc[p.team]; }
```
- When there is no `g.fl` it always returns true.

(1.14.1: referee errors and challenges are ON in Fluida too, see notes/net.md «Challenge en la Fluida»; only timeouts stay off.) The session forced these room options for Fluida (lobby §7), so referee errors, challenges and timeouts were off; `refOf`/`chalOf` (sim.js 2004-2011) already support the zeros:
```js
opts.ref = {d1:0,p1:0,d2:0,p2:0,d3:0,p3:0,chal:0};
opts.timeouts = false;
opts.net = 'fluida';
```

### 2.2 Dispatch

In `step()` (sim.js:3045), change:
```js
if (g.online) return stepOnline(g, dt, input);
```
to:
```js
if (g.online) return g.fl && !g.fl.loc[1 - g.fl.me] ? stepFluid(g, dt, input) : stepOnline(g, dt, input);
```
- When both teams are local (solo/vs-AI after a drop), the existing stepOnline runs. It is the tested full-authority path (graft from C).
- For Precisa this adds one read of an undefined property.

### 2.3 New `stepFluid(g, dt, inputs)` (next to stepOnline)

It is a trimmed copy of stepOnline for the local team only. `inputs` is `[in0, in1]`; the session puts the local input in slot `me` and NOIN in the other slot.

- **Time:** `g.time = g.fl.T * dt;` replaces `g.time += dt`. It is identical on both machines at the same tick and makes catch-up at past ticks well-defined. Also run `g.blockCD -= dt`.
- **Slot loop:** like stepOnline, but only for `s === me`. The remote slot's gesture fields are left to `flPose`.
- **Bits:** `netBits(g, _inS)` with the remote input NOIN. Remote skip arrives through `flSkip`. review/tmo/cpuChal can never trigger (chal 0, tmo 0), but keep the `if (g.review)` branch for safety, stepping only `mine` players.
- **point/over branch:**
  - `if (skipBoth(g)) skipHold(g);`
  - `stepPlayer` only for `mine` players.
  - `stepBall(g, dt)` (dead ball, visual).
  - `g.timer -= dt`.
  - On `timer <= 0`:
    - `over`: emit `gameOver` exactly as stepOnline:3933-3936.
    - else, if `g.fl.loc[nextServerTeam(g)]`: `if (g.pendingSet) nextSet(g); setupServe(g);`.
    - else: `g.timer = 0; g.fl.wait = (g.fl.wait || 0) + dt;`. The session calls `flServe(g)` when `sr` arrives, or after `SR_FALLBACK` = 2.0 s of wait.
  - `nextServerTeam(g)` = the team that will serve after this point. `point()` has already set `g.serving`, so it is `g.serving`. Check this; in point(), `serving` is updated on sideout.
- **serve branch:**
  - If `g.fl.loc[g.server.team]`: `act(g, ts); stepServe(...)` exactly as stepOnline.
  - Otherwise: step the local players with the local human's move, using the same per-player loop stepServe uses at its end (~sim.js:2994) but with the human input, and the AI players with `stepPlayer(g,p,dt,0,0)`. Advance `g.serveT += dt`. Call `stepBall(g, dt)`: the held branch draws holdPos/ritual of the remote server from its overlaid pose, and the toss branch is pure flight.
  - Run no stepServe, no serve clocks and no faults.
- **rally branch:**
  - `g.rally.t += dt`.
  - `act(g, me); g.jobs[me] = AI.computeJob(g, me);`.
  - The opponent's job keeps its last value; computeJob for the remote team is not needed.
  - `humanStep` for `me` if `!H[me].ai`.
  - `AI.update` for players with `mine(g,p) && humSlot(g,p) < 0`.
  - Ball:
    ```js
    for (h = 0; h < 2 && g.mode === 'rally'; h++) {
      flHand(g, 2*g.fl.T + h);                // ownership switch at khAt (both machines)
      if (g.fl.own === g.fl.me) stepBall(g, dt/2); else flGhost(g, dt/2);
    }
    ```
  - `refreshPred(g); fin(g);`
- Remote players are NEVER passed to stepPlayer, AI.update or humanStep.

### 2.4 Ball age instead of `g.time - lastTouchT` for the wobble

In stepBall's rally integration (sim.js:1914):
```js
var ph = b.wobF * (g.fl ? g.fl.bAge : g.time - g.lastTouchT);
```
Right after the integration line (~1917):
```js
if (g.fl) g.fl.bAge += dt;
```
- `bAge` is reset to 0 by every contact (§2.6) and set from the bundle on receipt.
- The flight between contacts is then a pure function of (launch state, number of half-steps).
- `g.lastTouchT` itself is still written and read by hitWindow (sim.js:1020) and checkBody (1646/1656/1664). The bundle carries it as an AGE (§3.4), so those windows work on the receiver.

### 2.5 Ghost flight `flGhost(g, dt)` (new) + ghost gate

```js
function flGhost(g, dt) {        // pure flight, no rules, no events
  var b = g.ball; if (g.fl.frozen) return;
  /* exactly the rally integration lines of stepBall 1912-1917, with ph from g.fl.bAge; g.fl.bAge += dt */
  if (b.z <= C.BR) { b.z = C.BR; b.vx = b.vy = b.vz = 0; g.fl.frozen = true; }
}
```
- Implement it by extracting the shared lines into a function, BUT only if fingerprints stay identical. Otherwise duplicate the lines; duplication is the default.
- `g.fl.frozen` is cleared by `flApplyTc`.
- Export `flFly(ball, age, nHalf, dt, out)`. It runs the same integration on a scratch ball and is used for the kh computation, tests and display.

### 2.6 Contacts: `flContact(g, kind, h)` (new)

It is called (gated) at:
- the end of `hit()`, just before the `emit 'hit'` (~1509): `if (g.fl) flContact(g, 'hit');`
- the end of `doServe` (after mode='rally', ~2870): `'serve'`;
- `checkBlock` after an outcome changes the ball (not the fault returns): `'block'`;
- the stepBall net branch after `emit 'net'` (~1940): `'net'` or `'tape'`;
- `checkBody` after the rebound: `'body'`.

What it does:
```js
g.fl.par = g.fl.seq; g.fl.seq++;
if (kind !== 'net' && kind !== 'tape') g.fl.bAge = 0;
g.fl.cT = g.fl.T; g.fl.cH = g.fl.hs;   // contact half-step, written by stepFluid before each half
g.fl.kh = flKh(g);                      // half-steps after contact, or -1
g.fl.khAt = g.fl.kh < 0 ? -1 : 2*g.fl.cT + g.fl.cH + g.fl.kh;
g.fl.dirty = kind;                      // the session sends a 'tc' after the step
```
- The sim does NO serialisation. The session builds the bundle after the step from `g` (diff approach, graft from A).
- `flKh(g)` runs `flFly` on a scratch copy for up to 960 half-steps (4 s). It returns the first k for which:
  - `sign(vx) === side(other)`, AND
  - `|x| <= L`, where `L = canMore ? clamp(0.12*|vx|, 0.25, 0.6) : 0.6`, with `canMore = !(g.touchTeam === own && g.touches >= 3)`. After a serve, touches = 3, so serves hand over at 0.6.
- If the scratch ball reaches `z <= BR` on the owner's side first, it returns -1: the owner keeps the ball and calls land itself.
- Blocks and net bounce-backs: the ball moves toward the other team (the attacker), so kh is small or 0 and the ball returns at once.
- `flHand(g, hs)`:
  ```js
  if (g.fl.khAt >= 0 && hs >= g.fl.khAt) { g.fl.own = 1 - g.fl.own; g.fl.khAt = -1; g.fl.hand++; }
  ```
  It runs identically on both machines, because khAt arrived in the tc.

### 2.7 Ownership gates (first lines)

- `canReach` (967) and `canDive` (980):
  ```js
  if (g.fl && (g.fl.catch || g.fl.own !== p.team || !g.fl.loc[p.team])) return false;
  ```
- `hit` (1195):
  ```js
  if (g.fl && (g.fl.own !== p.team || !g.fl.loc[p.team])) return;
  ```
  This also covers ai.js:440/456 calling S._hit directly. The rng draw at ai.js:440 happens before the gate, which is harmless in Fluida.
- Same gate at the top of the dive function behind S._dive.
- `checkBlock` loop (1557) and `checkBody` loop: `if (g.fl && !g.fl.loc[q.team]) continue;`
- stepServe final loop (~2994): `if (p !== sv)` becomes `if (p !== sv && mine(g, p))`.

### 2.8 Fault redirection (non-owner's own players)

- stepPlayer net touch (~2589) and blockPress early press (~1133). Keep the `netTouch` emit, then:
  ```js
  if (g.fl && g.fl.own !== p.team) g.fl.fq.push({ r: g.fl.r, reason: 'net', pid: p.id, T: g.fl.T });
  else fault(...);  // unchanged call
  ```
- Keep the existing `g.rng` draw in blockPress where it is; in Fluida the rng streams are per-machine.
- All other faults happen on the owner already:
  - double/four and the beach finger double: you can only touch what you own;
  - 8 s and ball drop: the server owns the serve;
  - attack-on-serve, under, antenna, land: the ball owner.

### 2.9 point / setupServe hooks

- `point()` (2096), at the very top:
  ```js
  if (g.fl && !g.fl.app && g.fl.own !== g.fl.me && !g.fl.loc[g.fl.own]) return;
  ```
  This is defensive and must never be hit; tests count it.
- `point()`, after the score update, record the producer data in plain form:
  ```js
  if (g.fl && !g.fl.app) g.fl.pts.push({ r: g.fl.r, w: w, reason: reason, text: text, pid: p ? p.id : -1, sig: sig || null, T: g.fl.T });
  ```
- `point()`, at the end, on both the producer and the applier: `if (g.fl) { g.fl.r++; g.fl.seq = 0; g.fl.par = 0; g.fl.khAt = -1; }`.
- Note: point() clears `skipReq` (sim.js:2100). The session queues remote `sk` by r (§3.6).
- `setupServe` (2724), at the end:
  ```js
  if (g.fl) { g.fl.own = g.server.team; g.fl.bAge = 0; g.fl.frozen = false; g.fl.wait = 0; g.fl.peer = false; g.fl.sr = true; }
  ```
  The session sends `sr` when it sees `g.fl.sr`, then clears it.
- Serve whistle gate in stepServe (sim.js ~2947): add to the whistle condition
  ```js
  (!g.fl || g.fl.peer || g.serveT >= g.whistleAt + 1.5)
  ```
  `g.fl.peer` is set by the session when the peer's `sr` for the current r arrives.

### 2.10 Exported API (VB.Sim)

`flInit`, `flTake`, `flFly`, `flOwnerCheck`, `flBundle`, `flApplyTc`, `flApplyPt`, `flServe`, `flSkip`, `flPose`, `flDigest`, `flMatch`, `flCatchUp`.

- **`flTake(g)`** (solo / peer lost): `loc = [true, true]; hum[1-me].ai = true; own = me` (if the mode is rally and the ball is frozen, call `flReplay(g)`, i.e. setupServe with the current server and no point).
- **`flOwnerCheck(b)`**: pure function (A's `flOwner`) used only as a debug cross-check in tests and netlog.
- **`flBundle(g)`** returns a plain object:
  - `b: [x,y,z,vx,vy,vz,spin,speed,dip,wobA,wobF,wobP]`, `h: held ? held.id : -1`;
  - the rally bundle `m`: `touchTeam, touches, lp (lastPlayer id), lastTeam, lastKind, lastShot, lastQ, ltAge: g.time - g.lastTouchT, prevKind, netSince, bb (blockBy id), blockCD, atkServe (team, reason, text, pid) | null, antennaHit, digOk, digMargin, dw (_digWho id), hardIn, digTight, recvRisk, _rc, blockOff[2], atkTeam, atkHow, atkHits, atkHuman, atkGrade, as (atkSet id), atkMove, atkEdge, feintT, lastTempo, chain, chainH, rally{t,hits,digs}, lastLand`;
  - plus `bAge`, `mode`, and in serve `sv: {serveState, serveJump, serveT, tossT, jumpAt, serveAuth, serveNo, whistleAt}`.
  - Raw doubles are kept; JSON round-trips IEEE doubles exactly.
  - lastShot can be an object; copy it plainly.
- **`flApplyTc(g, m, nowT, rewind)`**:
  1. Drop it if `m.r < g.fl.r`, or if `m.s <= current seq` for the same chain.
  2. Fork check (§4.3).
  3. Write the ball and the bundle, resolving ids through `g.players`, and set `lastTouchT = (m.T*dt) - m.m.ltAge`.
  4. Set `g.fl.bAge = m.bAge`, `seq = m.s`, `par = m.par`, `own = m.own`, `khAt = m.khAt`, `frozen = false`.
  5. If mode is serve and the local mode is point (the serve tc arrived before local setupServe), call `flServe(g)` first.
  6. CATCH-UP from half-step `2*m.T + m.h + 1` up to the local current half-step, capped at 72 half-steps (300 ms):
     - for each half-step j: `flHand(g, j)`; if own === me, run full rules `stepBall(dt/2)` with `g.fl.catch = true` (no new contacts by humans or AI; blocks and body are still judged), else `flGhost`;
     - `g.time = floor(j/2)*dt` during it; restore afterwards;
     - when `rewind(j)` is given (own-pose ring, §4.4), write the past pose of my players before each half-step and restore the present ones at the end.
  7. Above the cap: fly without rules to now and count `late`.
- **`flApplyPt(g, m)`**:
  1. If `m.r !== g.fl.r`, the session queues it.
  2. Write the rally meta `m.m` (as in flApplyTc).
  3. If `g.mode` is not 'rally' or 'serve', set `g.mode = 'rally'` (point() needs it, sim.js:2098).
  4. `g.fl.app = true; point(g, m.w, m.reason, m.text, byId(m.pid), m.sig); g.fl.app = false;`. This re-emits point/whistle/sideout/set/match/courtChange locally, deterministically and without rng.
  5. Compare `flDigest(g)` with `m.d`. On mismatch return false; the session counts it and the host sends `sb` (§4.5).
- **`flServe(g)`**: `if (g.mode === 'point' && g.timer <= 0 || force) { if (g.pendingSet) nextSet(g); setupServe(g); }`. It is idempotent per r.
- **`flSkip(g, t)`**: sets `skipReq[t]`.
- **`flPose(g, team, poses)`**: writes `x,y,z,vx,vy,vz,jvx,jvy,anim,lastAction,actionT,shot,grade,onGround,down,pressEnd,cool` into the remote players. It writes `swingLive/swingShot` into `g.hum[team]` via `hset` (so ai.js jsetHum and pos() read the jump-set). It throws if `g.fl.loc[team]`.
- **`flDigest(g)`**: `[r, score0, score1, sets0, sets1, setNo, serving, serverIdx0, serverIdx1, pendingSet?1:0]`.
- **`flMatch(g, blk)`**: writes the match block (score, sets, setNo, setScores, serving, serverIdx, server id, pendingSet, finished, setPoint, matchPoint, streakTeam/N, courtSwap3/At, r). It never touches players.

### 2.11 netview.js

Add `fl: 'as'` to FIELDS. `'keep'` is NOT a valid class; the valid ones are as/team/swap/swapneg/pairs/pos/vec/ref/special. No new player fields, so PLAYER stays closed. The view never reads `fl`.

## 3. Session module: js/netfluid.js → `VB.NetFluid`

Exports: `VB.NetFluid = { Session, PROTO: 'F1', codec: {encS, decS}, C: constants }`.
Load it in index.html right after `js/net.js` (index.html:3720), and in any list in tools/build-pages.js or the service worker if one enumerates scripts.

### 3.1 Facade (same as VB.Net.Session; main.js depends on it)

- Constructor options: `{slot, link, opts|null, name, rivalName, epoch, expect, warm, log}`. `onTick` and `delay` are ignored.
- Methods:
  - `advance(now, inp)`;
  - `request('skip'|'chal'|'tmo')`: only skip does anything; the others are ignored;
  - `setAway(bool)`, `vsAI(force)`, `quit()`, `sendApp(obj)`;
  - `predictedGame()`: the LOCAL sim game `g`;
  - `confirmedGame()`: also `g`. Its sets/score/setScores/pendingSet/mode are authoritative;
  - `stepInputs()` → null;
  - `initEvents`.
- `advance` returns the same object shape as net.js:
  `{g: gd (display game), events, confirmed, app, status, tick, gcTick, ping, waitMs, unstable, canAI, goneIn, startIn, solo, valid, result, rivalSolo, gone, rivalLeft, info}`.
- Props:
  - `status` ∈ connecting|starting|playing|waiting|over|ended;
  - `opts, host, slot, back, epoch` (ALWAYS read `this.epoch` lazily: the lobby rewrites it);
  - `adopt, rivalName, rivalLeft, result, valid, goneFlag, solo, rivalSolo, gcTick` (= local tick), `repaired = 0`, `rsT`, `maxCatch`;
  - `delay = 0, rttSeq, rttLast, adv = 0, cmpOk, cmpBad = -1`;
  - `model = 'fluida'`;
  - `stats {frames, steps, sent, recv, bytesOut, waits, resyncs, rsIn, depth: undefined, maxDepth: undefined}`;
  - `flStats {snapOut, snapIn, kbOut, kbIn, interpMs, extrapTicks, stale, hand, forks, late, lateMaxMs, warpMax, snaps, drift, fqSent, fqOk, ptBad, sbFix, digestBad, khCheckBad}`.

### 3.2 Handshake (copied from net.js, NOT shared, so net.js stays untouched)

- Copy the hello/ping/ready/start, warm gating, CONNECT_MS 20 s, ADOPT 40 s, cap 60 s, START_MS 1500 and WARM_CAP_MS 5 s logic.
- hello: `{k:'hello', v:'F1', m:'f', ver: VB.VERSION, name, back?}`. The host answers `{..., cfg:{opts}, live}`.
- A Precisa Session receiving v:'F1' fails its PROTO check, and Fluida rejects `v !== 'F1'`; both send bye 'version'.
- The guest also runs `sameRoomF(cfg.opts, expect)`: net.js sameRoom plus `opts.net === 'fluida'`. If it fails: bye 'mismatch'.
- 8 pings 60 ms apart; clock offset = median of the 3 best RTTs; then ready, and `start {t0: now + 1500}`.
- During play, ping/pong every 1 s for `r.ping`. The offset drifts by ≤ 1 ms per pong (no jumps).
- After start: `g = Sim.createGame(opts)`, then `Sim.flInit(g, slot)`, then drain the initial events into initEvents the way net.js `_setOpts` does (net.js:176). Also create `gd = Sim.createGame(opts)` (display copy).

### 3.3 Per advance(now, inp)

1. Poll the link and decode messages; apply ctl messages in order (§3.5).
2. Target tick `Tt = floor((now - t0)/STEP_MS)`. Step while `T < Tt`, up to `maxCatch || 36` per call (150 when hidden):
   - set `g.fl.T = T+1`;
   - write the remote players with the SIM pose (`flPose`): extrapolated to the present tick, capped at 12 ticks (100 ms) (§5.2);
   - `Sim.step(g, STEP, [me===0?inp:NOIN, me===1?inp:NOIN])`;
   - record my players' poses in the own-pose ring (48 ticks);
   - drain `g.events` into the local event list, tagged with T (local entities only, by construction);
   - after the step:
     - if `g.fl.dirty`: send tc (§3.4) and clear it;
     - if `g.fl.sr`: send `sr`;
     - drain `g.fl.fq` into `fq` messages and `g.fl.pts` into `pt` messages (each pt carries `flBundle(g).m` taken BEFORE point()). Implementation note: the meta is identical before and after point() for these fields, but take the bundle at contact time and keep the last one; point() resets nothing that the bundle carries except skipReq. Verify this with fluidsimtest «applyPoint determinism».
   - On `g.fl.wait >= SR_FALLBACK` (2 s): call `Sim.flServe(g)` locally and log it.
3. Send snapshots by rate (§3.4).
4. Build the display game `gd` (§5).
5. Fill `out.events` (presented: local plus remote events whose display time has come; SENSORY older than 150 ms muted, the same rule as net.js _present) and `out.confirmed` (§6).
6. Update the status, waiting, canAI and goneIn timers (§8).
7. The status never freezes your own side: there is no MAXPRED.

### 3.4 Wire formats

**Snapshot «S»** on 'in', binary little-endian, «latest wins».
- Header, 10 B: `u8 type = 2 | (ep&15)<<4`, `u32 T`, `u16 r`, `u8 flags`, `u16 seqOut`.
  - flags: bit0 ball included, bit1 away (my human on AI), bit2 idle, bit3 solo, bit4 skipReq[me], bit5 teleport (setupServe since the last snapshot, so the receiver clears its buffer).
- Per local player (2, idx order), 22 B:
  - x, y, z as i16 in mm;
  - vx, vy, vz, jvx, jvy as i16 in cm/s;
  - anim u8 and lastAction u8 (enum tables ANIMS/ACTS in netfluid.js, last entry = «other»);
  - actionAge u8 (ticks, saturating at 255);
  - shot u8 (enum);
  - grade u8 (×100 clamp);
  - bits u8: onGround, down>0, swingLive, swingShot set, pressEnd>g.time, cool>0.
- Ball, 13 B, only when I own it in serve/rally, or when it is dead on my side: x, y, z, vx, vy, vz as i16, plus seq u8.
- Total about 54–67 B.
- Rates:
  - every 4 ticks (30 Hz) in serve/rally;
  - every 12 ticks (10 Hz) in point/over;
  - extra snapshot on the tick of a contact or handover;
  - never more than 30 ticks (250 ms) between packets, even when hidden;
  - expect ~2 KB/s payload per direction in rally and ~0.6 KB/s at a dead ball.
- Type 1 (Precisa) and unknown types are dropped and counted.

**Touch bundle 'tc'**:
`{k:'tc', r, s, par, T, h, kind, kh, khAt, own, b, bAge, mode, sv?, m, ev:[presentational events of that contact with ids]}`.
- Sent on 'ctl' (reliable), AND as `type 3 | ep<<4` + UTF-8 JSON on 'in' for latency.
- The receiver dedupes by (r, s).

**Other ctl messages** (JSON, all with `ep`):

| Message | Payload / meaning |
|---|---|
| `pt` | `{r, T, w, reason, text, pid, sig, m, d: digest-after}`, producer to peer |
| `pa` | `{r, d}`, acknowledgement with the receiver's digest |
| `fq` | `{r, reason:'net', pid, T}` |
| `fx` | `{r, pid}`, owner rejected the fq (informative) |
| `sr` | `{r}`, setupServe done |
| `sk` | `{r}`, «Continuar» |
| `ev` | `{T, l:[...]}`, non-contact events of my players: swing, jump, landPlayer, blockPress, netTouch, dive, miss, feint, toss, slotAI. Batched; at most one per 2 ticks; only when non-empty |
| `sb` | `{blk}`, host scoreboard repair |
| `rb` | `{r, tc}`, partial rollback to the winner of a fork: ball and bundle only |
| `rs` | `{id, T, d: Sim.serialize(g), own, khAt}`, full resync, repeated every 1.5 s up to 8 times until `rsok {id}` |
| `solo` | |
| `rejoin` | `{e}` |
| `fin` | `{sets, setScores, w}` |
| `bye` | `{why}` |
| `app` | `{d}` |
| `ping` / `pong` | `{t, th, id}` |

### 3.5 Applying incoming messages

- **tc** → `Sim.flApplyTc(g, m, T, rewindFn)`. Then:
  - inject `m.ev` (mapped to local refs) into the remote event queue at display time (§5.3);
  - set the display warp (§5.3);
  - count late arrivals.
- **pt**:
  - if `m.r === g.fl.r`: `flApplyPt`, then reply `pa`, then release confirmed (§6);
  - if `m.r > g.fl.r`: queue it (it must not happen, because ctl is ordered);
  - if `m.r < g.fl.r`: drop it.
  - If a local point for the same r already exists, this is a fork (§4.3).
- **fq**: accept only if `mode === 'rally' && m.r === g.fl.r && g.fl.own === me`. Then call `fault(g, 1 - team(pid), 'net', 'Toca la red', byId(pid))` (use the same text/reason strings as the local net-touch call at sim.js ~2589/1133). The produced pt goes out normally. Otherwise reply `fx`.
- **sr**: set `g.fl.peer = true` if `m.r === g.fl.r`. If local mode is point with `timer <= 0` and waiting, call `flServe(g)`.
- **sk**: if `m.r === g.fl.r`, call `flSkip(g, 1-me)`; if `m.r > g.fl.r`, hold it until point r has been applied (fixes the race where point() clears skipReq at sim.js:2100).
- **sb**: `flMatch`, `sbFix++`.

### 3.6 Skip

`request('skip')` sets `skipReq[me]` locally (via the input bit, as today) and sends `sk {r}`. skipHold runs locally on each machine when both bits are set.

## 4. Authority rules (summary for implementers)

### 4.1 Who decides what

| Thing | Authority |
|---|---|
| My 2 players (human + AI partner) | Me, always |
| Rival players | Never simulated here; overlaid from snapshots |
| Ball + rally bundle in serve | Serving team's machine (`own = server.team` from setupServe) |
| Ball in rally | `own`, which changes only at `khAt` (shared half-step) |
| Contacts, blocks, body, net/tape, under/antenna, land | Owner (the receiver once the ball is in the zone, so blocks use the blocker's true pose) |
| Net touch / early press by the non-owner's players | Sent as `fq` to the owner |
| Point | Exactly one machine: the one whose `point()` runs locally (`g.fl.pts`) |
| Dead-ball timer, nextSet, setupServe, gameOver | Local on both machines from the identical scoreboard; the serve start is gated by `sr` (2 s fallback) and the whistle by `peer` (1.5 s cap) |
| Scoreboard disagreement | Host wins (`sb`) |
| Final result | Both machines; must agree via `fin` |

### 4.2 Dice for the opponent

`digOk`, `digMargin`, `_digWho`, `digTight`, `recvRisk`, `hardIn`, `blockOff`, `_rc` are rolled by the hitter's machine (hit / doServe) exactly as today. They travel in `m`; the receiving AI uses them verbatim.

### 4.3 Forks (rare)

A fork happens when the old owner's teammate touches the ball shortly before khAt, and the tc arrives after the receiver has already switched and acted on the stale ghost.
- **Rule:** the contact with the earlier `(T, h)` wins; on a tie the previous owner wins.
- The old owner can only touch before khAt and the receiver only after it, so the old owner always wins. The rule is deterministic and needs no negotiation.
- **Receiver (loser):**
  - restore the ball and bundle from the winning tc and catch up;
  - play a 'miss' event on its player, which is never moved;
  - if it had produced a local point in that branch: restore `fl.pre` (the scoreboard snapshot taken by the session before applying any local point) and present no new whistle. The local point was never confirmed: it is confirmed only on `pa`.
- **Old owner:** rejects a `pt` whose r equals its current r when its chain has a contact newer than the pt's chain position. It replies `rb {r, tc}`; it does not send pa.
- **Never use `rs` (full serialize) for a fork.** It would overwrite the receiver's own players. Use only `flApplyTc` and `flMatch`.
- Count it in flStats.forks.

### 4.4 Lag-compensated catch-up (graft from C)

- Ring of 48 ticks of my players' kinematics: x, y, z, vx, vy, vz, onGround, pressEnd.
- During flApplyTc catch-up, write the pose for tick floor(j/2), step, then restore the present poses.
- `g.fl.catch` blocks canReach/canDive, so nobody can touch in the past. checkBlock and checkBody still judge my blockers where they really were.
- Feature flag `C.REWIND = true`; tests run both settings.

### 4.5 Score consistency (replaces fingerprints)

- `pt.d` is the producer's digest after the point. The applier compares its own after flApplyPt; on mismatch, `ptBad++`. If I am the host I send `sb` with my block; if I am the guest I wait for `sb`.
- `pa.d` lets the producer check as well.
- `cmpOk` = number of matching acks; `cmpBad` = -1, or the tick of the last unrepaired mismatch.
- At gameOver both send `fin`.
- `result.unverified = (no fin within 3 s) || fin disagrees || cmpOk === 0`.
- There are no hashes, no `snap` repair and no 3-repairs rule. `repaired = 0` always.

## 5. Smoothing and presentation

### 5.1 Display game

Each frame: `Sim.copyGame(gd, g)`, then overwrite the remote players with the DISPLAY pose (past, interpolated) and the ball with the display ball. Return `r.g = gd`.
- main.js keeps calling `NetView.mirror(view, r.g, slot)`, which is unchanged.
- The sim never sees display offsets.

### 5.2 Rival players

- Ring of 32 snapshots per remote team, keyed by sender T.
- **Display pose at `Tr = T - D`:**
  - `D` is adaptive: `clamp(snapInterval + 2*jitterEWMA + 1 tick, 6, 18)` ticks (50–150 ms), changing by at most 1 tick per second.
  - Hermite interpolation on x/y using the velocities. z is linear, plus a ballistic midpoint when airborne.
  - Discrete fields step at the snapshot whose T ≤ Tr. `actionT = g.time - age`, so animation phases stay continuous.
  - Starvation: extrapolate up to 12 ticks with velocity (and gravity for z), then hold. Count `extrapTicks`.
  - When data returns: decay the error offset with a 60 ms half-life. The teleport bit, or an error over 1.2 m, snaps with no blend.
- **Sim pose (for the local AI only):**
  - last snapshot extrapolated to the present T, capped at 12 ticks;
  - on the ground: `x += vx*τ*(1-e^(-a/τ))` with τ = 0.15 s;
  - in the air: ballistic, clamped to z = 0.
- The local AI's block, blockPress, openSpot and jsetHum reads are therefore on time without visual rubber-banding.

### 5.3 Ball

- **Owned by me:** drawn as simulated.
- **Owned by the rival, before its next contact:** drawn on the rival timeline at `Tr`, from the snapshot ball interpolated like the players, so the toss, set and swing stay coherent with the rival's hands.
- **After a rival contact at Tc, with switch half-step khAt (`Th = khAt/2`):**
  - draw at `display(t) = t - off(t)`, where `off(t) = Dpast * clamp((Th - t)/(Th - Tc), 0, 1)` and `Dpast = D + oneWay`;
  - playback speed = `1 + Dpast/(Th - Tc)`, capped by `WARP_MAX = 2.0`;
  - if that cap is exceeded (spike close to the net), set `off = 0` immediately with a 40 ms positional blend, and count `snaps`;
  - display positions are produced with `flFly` from the bundle (bit-exact on the same engine);
  - when `kh = -1` (the rival keeps it), stay on the rival timeline.
- **Ghost rebase:** when the owner's snapshot ball differs from my ghost at that T by more than 3 cm, rebase the ghost state, keeping bAge, and count `drift`. This covers Math.cos/sin differences between browsers. It never changes `own` or `khAt`.
- **Correction at an applied tc:** the difference between the old display ball and the new one goes into an offset that decays with τ = 100 ms, or 60 ms when the ball is within 3 m of my players. Snap when the difference is over 3 m.
- **Camera:** for 120 ms after a handover or a snap, limit the extra camera lerp speed to 6 m/s. The camera reads the display view, so nothing changes in camera code if main.js already uses the view's ball. Expose `gd.flCam` only if needed; prefer no change.
- **Remote events:**
  - from `tc.ev`: play when the display ball reaches the contact time. The hit sound happens when you SEE the contact;
  - from `ev`: play when `Tr` reaches their T;
  - land/point/whistle are presented when they arrive or are produced locally (they are already at the present);
  - SENSORY events more than 150 ms late are muted but still kept for stats.

## 6. Events, stats and confirmation

- `out.events` (presented): local events immediately; remote ones at display time; point-derived events from the local `point()` call, whether producer or applier.
- `out.confirmed` (stats, mastery, NetRec feed): a per-rally buffer of the local events plus the remote ones (tc.ev, ev), sorted by `(T, origin host-first, idx)`, with refs re-resolved to `g` players by id. Release it:
  - for a local point: when its `pa` arrives, or after 400 ms if the peer is alive but the ack is lost (the ctl channel is reliable, so it is mostly instant);
  - for a remote point: on apply.
- `gameOver`: presented once, when emitted locally (the 'over' timer). Confirmed once, after the deciding point has been confirmed.
- main.js `netConfirmed`, `VB.UI.netTally`, `netMastery` and the `stSnap` logic stay unchanged.

## 7. Lobby, room, rules

- **netroom.js:** add `'net'` to `ROOM_KEYS` (:80). In `open(cfg)` (:168-189) set `d.net = 'fluida'` ONLY when `cfg.net === 'fluida'`; otherwise leave the key out.
- **firestore.rules** `roomOk`:
  - add `'net'` to `hasOnly` but NOT to `hasAll`;
  - add `&& (!('net' in d) || d.net in ['fluida'])`.
  - Deploy order: Ferran deploys the rules first (`npx firebase-tools deploy --only firestore:rules` from firebase/), then publishes the client.
- **netlobby.js:**
  - `prefs()`/`savePrefs()` gain `model: 'precisa'|'fluida'` (default 'precisa').
  - Create view: a new row `selRow('net', 'Conexión', ...)` with values «Precisa» and «Fluida»:
    - hint for Precisa: «Los dos veis lo mismo»;
    - hint for Fluida: «Tu lado, sin retraso»;
    - put it after «Partido» and before «Igualado»;
    - `step('net', d)` toggles it; arrows and ←→ work through onClick/side() as for the other rows.
  - The `mk-tip` sentence for Fluida: «Tu equipo responde al instante y el rival se ve una pizca en diferido. Sin repeticiones ni ojo de halcón en esta versión.» For Precisa keep the current tip.
  - Preview `pr.net`.
  - `chips(r)`: add a third chip «Fluida» ONLY when `r.net === 'fluida'`. `cfgParts` (aria) adds «conexión fluida».
  - Check `.fx-chips` clipping at 667x375 and 844x390.
  - `createRoom()` passes `net: c.model === 'fluida' ? 'fluida' : undefined`.
  - If the API returns 'denied' while the model is fluida, show «La conexión Fluida aún no está activada.».
  - `begin()` (:380):
    - `model = r.net === 'fluida' ? 'fluida' : 'precisa'`;
    - for Fluida, `opts.net = 'fluida'`, `opts.ref = {d1:0,p1:0,d2:0,p2:0,d3:0,p3:0,chal:0}`, `opts.timeouts = false`;
    - `expect.net = r.net || undefined`;
    - startOnline gets `{..., model}`.
  - The 'pre' message carries `model` both ways. On the guest, a pre.model different from its room's model gives connFail with the 'mismatch' text.
  - `backSave`/`hostBackSave` store `model`; `rejoin`/`rejoinHost` pass `model` (from the BACK record, falling back to `r.net`).
  - HELP: add `['Conexión', 'Quien crea la sala elige. Precisa: los dos veis exactamente lo mismo, con algún tirón si hay mucho ping. Fluida: tu equipo responde al instante y el rival se ve una pizca en diferido.']`, and bump HELPK to `'make-the-cut.nethelp2'`.

## 8. Lifecycle

- **Status:** connecting → starting (startIn) → playing ↔ waiting → over | ended. The timings for connecting/noShow are as in net.js.
- **unstable:** no packet for more than 1 s. With the ≥ 4 Hz heartbeat it never trips while idle.
- **waiting:** no packet for more than 1.5 s, OR the rival owns the ball and has sent no snapshot for more than 0.5 s past khAt.
  - My side keeps playing.
  - A rival-owned ghost flies to the floor and freezes there.
  - My `pt`/`tc` messages queue on ctl (up to 400).
  - The lobby's `netWaiting` keeps working because the status is 'waiting'.
- **canAI** after 10 s of waiting. `vsAI()` → `Sim.flTake(g)`, ctl `solo`, `solo = true`; the guest gets `valid = false`. The dispatch then runs stepOnline (full authority).
- **gone** at 60 s: the host gets `rivalGone` (win), the guest gets `hostGone` (`valid = false`), and bye 'gone'. Same taxonomy as net.js.
- **Return** (packets heard again):
  - if either side was solo, or the gap was more than 3 s, the HOST sends `rs` until it gets `rsok`;
  - the receiver runs `Sim.deserialize` into g, then `flInit` again keeping `r`/`own`/`khAt` from the message, with loc reset to only me;
  - it sets `stats.rsIn++`, `stats.resyncs++` and `rsT = T` (main.js netStatsResync rebuilds the stats sheet);
  - for gaps under 3 s with no solo, nothing is needed: the queued ctl messages replay in order.
- **Host reload (adopt):** the host session is created with opts null and says hello with back:1. The guest (the one that stayed) answers with cfg and sends `rs` with its g; the host adopts it.
- **Late return** after gone: bye 'late'.
- **Hidden tab:** the Worker pulse (netBgTick) calls advance, which really steps and sends (maxCatch 150). setAway(true) sets `hum[me].ai` and snapshot flag bit1.
- **Quit:** cancel during connecting/starting; 'left' after over or gone; otherwise 'quit'.
- **Revancha:** app again/go as today. main.js creates a new Fluida session (epoch + 1) using `net.model`.

## 9. Changes in other files

- **net.js (the only Precisa line):** `sameRoom` also requires `(co.net || '') === (expect.net || '')`. When both are absent they compare equal, so Precisa is unchanged. Do NOT change the Precisa hello.
- **main.js:**
  - `startOnline` stores `net.model = o.model || 'precisa'`.
  - `netSession` (:646): `var Ses = net.model === 'fluida' ? VB.NetFluid.Session : VB.Net.Session`. For Fluida, do not pass onTick.
  - `netBuildView`, when Fluida: set `ctx.rpPre = v` (closes the setGame trap at main.js:400-401) and call `VB.Replay.reset(v, {fluida: true})`.
  - `netConfirmed` skips `RPL.onEvents` for Fluida.
  - `ctx.actions.challenge` does nothing when Fluida.
  - `startNetTest` (?net=bc) reads `&model=fluida` and builds opts.net/ref/timeouts.
  - netRematchGo/netApp reuse `net.model`.
  - netHud: optional small «Fluida» tag next to the ping.
- **replay.js:** `blockedWhy` returns `'net'` when the reset options have `o.fluida`. Then `ordN = 0` and bestCount() is 0, so «Jugadas» is hidden.
- **netlog.js:**
  - `report()` adds `modelo: s.model || 'precisa'`;
  - `frame()` copies `s.flStats` when present; depth/adv stay undefined (closeWin writes null);
  - the Fluida mismatch key is `'marcador_distinto'`;
  - pages/netlogs.html must tolerate missing rb/adv and the new keys.
- **netrec.js:** no change in the beta; one shared record (see the open questions).
- **version.js:** bump `VB.VERSION` (room.v already separates releases as «Otra versión») and add the novedad «Online V2: conexión Fluida» as a new feature (never as a fix).

## 10. Numbers / constants (netfluid.js `C`)

| Constant | Value |
|---|---|
| STEP_MS | 1000/120 |
| SNAP_RALLY | 4 ticks |
| SNAP_IDLE | 12 ticks |
| HEARTBEAT | 30 ticks |
| D | 6–18 ticks |
| EXTRAP_MAX | 12 ticks |
| BLEND_HALF | 60 ms (players) / 40 ms (ball) |
| WARP_MAX | 2.0 |
| CATCH_MAX | 72 half-steps |
| POSE_RING | 48 |
| REBASE | 0.03 m |
| SR_FALLBACK | 2.0 s |
| WHISTLE_CAP | 1.5 s (sim) |
| UNSTABLE | 1000 ms |
| WAIT | 1500 ms |
| WAIT_AI | 10 s |
| GONE | 60 s |
| RS_REPEAT | 1.5 s × 8 |
| PA_TIMEOUT | 400 ms |
| FIN_TIMEOUT | 3 s |
| Zone L | canMore ? clamp(0.12·\|vx\|, 0.25, 0.6) : 0.6 |
| kh search | 960 half-steps |

## Work packages
### WP1 Sim hooks and the fluid API (gated) [js/sim.js, js/netview.js, tools/fluidsimtest.js] deps 
Implement spec §2 exactly. Order of work:
1. Add flInit, mine and the step() dispatch line. Run simtest.
2. Add stepFluid as a copy of stepOnline. Do not edit stepOnline.
3. Add bAge in stepBall (the two gated lines), flGhost and flFly. Duplicate the integration lines rather than refactoring, unless fingerprints stay identical.
4. Add flContact and flKh (speed-scaled zone), flHand, and the flContact call sites in hit (end), doServe, checkBlock outcome, the net branch and checkBody.
5. Add the ownership gates: canReach, canDive, hit, the dive function, the checkBlock and checkBody loops, and the final stepServe loop.
6. Add the fq redirection at the stepPlayer net touch (~2589) and blockPress (~1133).
7. Add the point() top guard, the pts push and r++, the setupServe tail and the whistle gate (~2947).
8. Export flTake, flBundle, flApplyTc (with catch-up and the optional rewind callback, g.fl.catch, g.time per tick), flApplyPt (forces mode 'rally' if needed, fl.app around point()), flServe, flSkip, flPose (throws on a local team), flDigest, flMatch and flOwnerCheck.
9. netview.js: add FIELDS fl:'as'.

After EVERY step run: node tools/simtest.js (fp-2v2 and fp-mastery identical), nettest, net3test, mptest, netreplaytest and viewtest.

Write tools/fluidsimtest.js:
(a) createGame without net has no 'fl' key, and step() on it is unchanged.
(b) Flight equality: 5000 random launches, rule stepBall on an owner game (no players in reach) vs flGhost and flFly. Positions bit-identical until the first rule event. The kh found by flKh equals the first half-step where flOwnerCheck-style zone membership holds.
(c) Table tests for flKh: serve, spike, slow set at 1 m with touches left (no handover before 0.25 m), third touch at 0.5 m, block rebound, net bounce back, ball landing on own side (kh = -1).
(d) flApplyTc catch-up: the same block outcome kind as on-time ownership for delays of 6, 12 and 24 ticks with rewind on.
(e) flApplyPt determinism: 2000 recorded points, apply on a second game → identical digest, sideout/serverIdx/sets/courtChange events and lastPoint.how.
(f) A grep-style self-check: list each new line inside pre-existing functions and assert it contains 'g.fl'.

Guarantee: no new fields in the createGame literal or mkPlayer, and no rng call added or reordered on non-fl paths.

### WP2 Fluida session module [js/netfluid.js, tools/fluidtest.js] deps WP1
Implement spec §3, §4.3-4.5, §5, §6 and §8 as VB.NetFluid.Session, with the same facade as VB.Net.Session (read js/net.js fully first).
- Copy, do not share, the handshake, clock sync, warm gating and connect timeouts from net.js, with PROTO 'F1' and hello m:'f'.
- Snapshot codec with type byte 2|(ep&15)<<4, a tc echo on 'in' as type 3, and the ctl protocol: tc/pt/pa/fq/fx/sr/sk/ev/sb/rb/rs/rsok/solo/rejoin/fin/bye/app/ping/pong.
- Per-advance stepping with the remote SIM pose overlay (extrapolated to the present), the own-pose ring, events drain, tc/sr/fq/pt emission from g.fl flags, and the SR_FALLBACK.
- Display game gd: interpolated past rival poses, ball time-warp, ghost rebase above 3 cm, decaying offsets, camera-safe snaps.
- Per-rally confirmed buffer ordered by (T, host-first, idx), pa/400 ms release, gameOver once.
- Forks: the earlier contact wins and the loser restores fl.pre plus a partial rb (never rs).
- Digest check, sb from the host, fin and result.unverified.
- waiting/canAI/gone/solo/vsAI (Sim.flTake)/rejoin rs/adopt/hidden tab (maxCatch)/quit/revancha epochs. Read this.epoch lazily.
- flStats for NetLog.
Export VB.NetFluid.{Session, PROTO, codec, C}.

Write tools/fluidtest.js, a headless matrix (spec testPlan B) over VB.Net.memPair with a virtual clock, bots from VB.Net.bot over predictedGame(). Output JSON goes to tools/out/fluid-*.json.

Can be started in parallel with WP1 against the API contract in spec §2.10, stubbing Sim.fl* until WP1 lands.

### WP3 Lobby, room doc and Firestore rules [js/netlobby.js, js/netroom.js, firebase/firestore.rules, tools/roomtest.js] deps 
Implement spec §7.
netroom.js:
- ROOM_KEYS gets 'net';
- open() sets d.net = 'fluida' only for Fluida rooms.

Rules:
- 'net' goes in hasOnly only (not hasAll);
- add (!('net' in d) || d.net in ['fluida']).

netlobby.js:
- prefs model;
- the 'Conexión' row (Precisa/Fluida, with the hints), the step('net') toggle and the preview;
- the third chip «Fluida» only for Fluida rooms, plus the aria text;
- createRoom passes net only for Fluida, and the 'denied' text «La conexión Fluida aún no está activada.»;
- begin(): model from r.net, opts.net/ref zeros/timeouts false for Fluida, expect.net, startOnline({model});
- 'pre' carries model, and a guest mismatch gives connFail;
- backSave/hostBackSave/rejoin/rejoinHost carry model;
- the HELP 'Conexión' entry and HELPK 'make-the-cut.nethelp2';
- the mk-tip for Fluida.

roomtest.js: keep the old cases and add net='fluida' accepted, junk rejected, absent accepted, and net kept on beat/resume.

Screenshots of the create view, list cards and waiting room at 1280x720, 844x390 and 667x375 (chips not clipped, scroll OK).

Do NOT deploy the rules (Ferran deploys them before publishing).

### WP4 main.js integration, replay block and script loading [js/main.js, js/replay.js, index.html, tools/build-pages.js, tools/netdrive.js] deps WP2
Implement the main.js/replay.js parts of spec §9.
main.js:
- net.model in startOnline;
- the Session class choice in netSession (no onTick for Fluida);
- netBuildView for Fluida: rpPre = v and Replay.reset(v, {fluida: true});
- netConfirmed skips RPL.onEvents for Fluida;
- challenge action is a no-op for Fluida;
- netRematchGo/netApp reuse net.model;
- startNetTest &model=fluida (opts.net, ref zeros, timeouts false; also send model in its own 'pre');
- optional «Fluida» tag in netHud.

replay.js: blockedWhy returns 'net' when o.fluida.

index.html: add <script src="js/netfluid.js"> right after js/net.js (index.html:3720). Add it to tools/build-pages.js or any service-worker asset list if they enumerate scripts.

tools/netdrive.js: add a &model=fluida mode with BcLink lag/jit/loss.

Verify with ?net=bc in two tabs that Precisa is unchanged and that Fluida plays a full match.

### WP5 NetLog, Precisa sameRoom line, version and novedad [js/netlog.js, pages/netlogs.html, js/net.js, js/version.js, tools/netlogtest.js] deps 
- net.js: the ONLY change is that sameRoom also compares (co.net||'') === (expect.net||''). Run nettest, net3test and netreplaytest afterwards.
- netlog.js:
  - report() gets modelo: s.model || 'precisa';
  - frame() copies s.flStats when present (snapOut/In, kbOut/In, interpMs, extrapTicks, hand, forks, late, lateMaxMs, warpMax, snaps, drift, fqSent/fqOk, ptBad, sbFix, digestBad);
  - depth/adv may be undefined;
  - the Fluida mismatch key is 'marcador_distinto'.
- pages/netlogs.html: tolerate null rb/adv and the unknown keys; show modelo.
- Extend netlogtest for a fake Fluida session.
- version.js: bump VB.VERSION and add the novedad «Online V2: al crear sala eliges la conexión, Precisa o Fluida» (a feature, never a fix).

### WP6 Docs [notes/net.md, CONTRACT.md, TRASPASO.md] deps WP1,WP2,WP3,WP4
- notes/net.md: a new section «Online V2: Fluida» covering the authority table, kh/zone rule, protocol, smoothing, forks, the beta simplifications (no replays, no challenges or referee errors, no timeouts, digest instead of fingerprints) and the deploy order.
- CONTRACT.md: the VB.NetFluid module, the Sim fl* API, and the new netview field.
- TRASPASO.md backlog:
  - phase 2 tape replay;
  - challenges over ctl;
  - the m:'f' record tag;
  - tuning D/warp/zone with real ping.

## Test plan
A. REGRESSION GATES (blocking; run after every sim.js edit and again at the end)
- `node tools/simtest.js`: fp-2v2.json and fp-mastery.json identical.
- These must pass: nettest.js, net3test.js, mptest.js, netreplaytest.js, viewtest.js (with fl:'as'), statstest.js, replaytest.js, roomtest.js (old cases plus the new net cases) and netlogtest.js.
- fluidsimtest (a): createGame without opts.net has no 'fl' key.

B. tools/fluidsimtest.js (sim level, no network)
- Flight equality over 5000 random launches: ghost and owner are bit-identical until the first rule event.
- flKh table: serve, spike, slow set with touches left, third touch, block rebound, net bounce back, landing on own side.
- Catch-up with rewind: the block outcome matches on-time ownership at 6, 12 and 24 ticks of delay.
- flApplyPt determinism over 2000 points.
- Gate self-check: every new line inside an existing sim function contains `g.fl`.

C. tools/fluidtest.js (headless, two NetFluid Sessions over VB.Net.memPair, virtual clock, frames of 8-25 ms with occasional 100 ms hitches, bots via predictedGame)
Matrix:
- RTT {0, 60, 150, 250, 400};
- jitter {0, 20, 40};
- loss on 'in' {0, 2, 5, 10%} (with 1% reorder);
- venue beach/hall; bo1 at 11/21 and bo3;
- seeds 1-5.
CI subset at 11 points; full matrix nightly.

Assertions per match:
1. Completion: both sessions reach 'over' with why 'over' and exactly one gameOver in r.events and in r.confirmed.
2. Agreement:
   - identical sets, setScores and winner;
   - per-r point log identical on both machines;
   - fin agrees, so unverified is false;
   - sbFix = 0 at loss ≤ 5%;
   - ptBad reported;
   - point() top guard hit count = 0.
3. Own player never corrected:
   - hash my 2 players' kinematics after each step and again before the next step, after all message handling; they must be equal, except on ticks with setupServe/nextSet or an applied rs;
   - flPose throws on a local team;
   - per-tick displacement ≤ vmax·dt plus the jump terms.
4. Handover:
   - both machines switch at the same khAt for every (r, seq);
   - every rally that crosses has ≥ 1 handover;
   - blocks only ever happen on the receiver, and both machines record the same blocker id and kind;
   - one 'net' event per crossing across both streams;
   - forks = 0 at RTT ≤ 150 and reported above that, each resolved with agreement;
   - late (catch-up > 300 ms) = 0 at RTT ≤ 250.
   Scripted scenarios:
   - spike from 0.5 m with the rival blocker in the air at RTT 150;
   - tape ball;
   - net bounce back;
   - slow set at 0.4 m with touches left (the attacking side can still play it);
   - net touch by the non-owner's blocker (fq accepted → exactly one point);
   - forced fork at RTT 300.
5. No stalls:
   - |tick - floor((now-t0)/STEP)| ≤ 2 when not hidden;
   - never 'waiting' while the link delivers;
   - unstable on < 1% of frames at loss ≤ 2%;
   - the non-server enters serve within its point timer + RTT/2 + 50 ms;
   - SR_FALLBACK fires only when sr is dropped on purpose.
6. Smoothing (truth = the other machine's own ring at the same T):
   - rival display error against the true pose at Tr: RMS < 4 cm at RTT 60/jit 15/loss 2, < 10 cm at 150/40/10;
   - extrapolated frames < 2% (L1) and < 10% (RTT 250);
   - per-frame jump: ≤ 12 cm for players and ≤ 25 cm for the ball outside rival contacts;
   - warp p95 ≤ 1.6 on serves and free balls;
   - snaps only on near-net spikes;
   - drift rebase count reported.
7. Traffic: payload ≤ 2.5 KB/s per direction in rally, ≤ 0.8 KB/s at a dead ball, ≤ 35 packets/s, no gap over 250 ms between packets.
8. Events: no duplicate (r, T, id, type); confirmed sorted by T; a mini tally gives identical kills/aces/blocks on both machines (mirrored).

Scenarios:
- link.down(3000) mid-rally: 'waiting', own team keeps moving, remote ball freezes, then agreement afterwards.
- down(15000): canAI → vsAI → return → rs applied, rsIn++, agreement.
- down(70000): rivalGone/hostGone with the correct valid flags.
- Host reload adopt.
- Hidden side advancing only every 1 s with maxCatch 150: the other side never sees the ball frozen for more than 1.2 s.
- Revancha with epoch+1.
- Precisa Session against Fluida Session: bye 'version'/'mismatch' on both sides, no exceptions, packets never misparsed.
- Precisa Sessions on the same harness: results equal the current baseline.

D. BROWSER
- tools/netdrive.js &model=fluida: two Chrome pages through BcLink (lag 120, jit 20, loss 3) play a full bo1; scoreboards agree; screenshots of the guest mirror and of the HUD «Esperando…» during an induced cut.
- Background one page for 20 s: the other page still sees its players and the ball move.
- Lobby screenshots at 1280x720, 844x390 and 667x375: the Conexión row, the «Fluida» chip, the waiting room.
- ?net=bc with Precisa still works exactly as before.
- The netlog report includes modelo and flStats.

E. MANUAL (Ferran): two devices over real WebRTC, one Fluida match and one Precisa match, to compare the feel. Then the bug pass after publishing.

## Preguntas
- Names: «P2P» and «Server-side» are not accurate, because both modes are P2P and there is no server. I propose the row «Conexión» with «Precisa» (hint «Los dos veis lo mismo») and «Fluida» (hint «Tu lado, sin retraso»). Do you accept these, or would you like different words?
- Should Precisa remain the default in Crear sala, or should Fluida be the default once it has been tested?
- In this beta, Fluida rooms have no «Mejores jugadas» replay, no ojo de halcón or referee errors, and no tiempos muertos. Is that acceptable for V2? These go to the backlog as phase 2.
- Record: should Fluida matches count in the same online record as Precisa, or be tagged and counted separately (tag m:'f' in the record)?
- Firestore rules: you deploy the new rules (new optional room field 'net') BEFORE publishing the client. Until then, creating a Fluida room returns «La conexión Fluida aún no está activada.» Is that OK?
- Should the «Cómo funciona» help reappear once for everyone with the new «Conexión» entry (key bump), or only for new players?
- Gameplay in Fluida only: a slow ball moving toward the net within 0.25–0.6 m stays with the attacking side until it is very close, so a block cannot reach it any earlier. Fine for a first version, to be tuned after your tests?
- Should the «Online Beta Tester» cap work the same with Fluida, or do you want a separate V2 cap?

## Riesgos
- Fast spikes close to the net at high ping: the receiver learns of the contact RTT/2 late. Catch-up with own-pose rewind keeps the block outcome fair, but the attacker sees the block result late, and the incoming ball may snap visually (WARP_MAX 2x, 40 ms blend). Precisa remains the better choice above ~250 ms RTT.
- Forks: the old owner's teammate touches the ball just before the switch tick while the receiver has already acted. The rule is deterministic (the earlier contact always wins) but the code is hard, and it can show a whistle that is never confirmed. It is rare; the forced-fork test and the forks metric cover it.
- Cross-browser float differences in the wobble (Math.cos/sin): ownership never depends on them, because khAt travels in the tc. The ball can drift by a few cm, which the 3 cm snapshot rebase corrects cosmetically. Bit-exact asserts apply only to same-engine tests.
- Gating mistakes in sim.js would leak into offline or Precisa. Mitigation: simtest fingerprints and the Precisa suites after every edit, the gate self-check in fluidsimtest, and no changes to the createGame literal or mkPlayer.
- Fluida changes some gameplay compared with offline and Precisa: a team cannot touch a ball the other side owns, and the speed-scaled zone affects slow balls near the net. Tuning is needed with Ferran.
- The local AI partner reads rival poses extrapolated to the present (cap 100 ms). At high jitter its block timing may still be off. Sim pose and display pose are separate so the screen never rubber-bands.
- Dead-ball timing: the non-server learns of the point RTT/2 later. The sr gate (2 s fallback) and the whistle cap (1.5 s) hide this, but on a very bad link the serve can feel delayed.
- Hidden or throttled tab: your machine is the only authority for your side. If the Worker pulse is starved, the rival sees 'waiting' after 1.5 s and the 10 s / 60 s rules apply.
- Handshake and timeout code is duplicated between net.js and netfluid.js, so a future fix must go into both.
- Firestore rules must be deployed before the client is published, or creating a Fluida room returns 403. Precisa rooms omit the field and keep working.
- Lobby layout: a sixth selector row and a third chip can clip at 667x375. Screenshots are required.
- Scope: roughly 3,000 new lines (sim ~450, netfluid ~1,200, tests ~900, glue ~300). A first playable two-tab match is realistic after WP1+WP2. Feel tuning needs real-ping sessions with Ferran.