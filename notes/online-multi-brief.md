# DESIGN BRIEF: Online 2v2 (up to 4 humans), Online 6v6 (up to 12 humans), Co-op Career

Worktree: C:/Users/Puru/FCVBARB/carpetas/take-the-court-online (branch online-multi, from main 1.21.0). This brief is read-only: no files were changed. I spot-checked the key lines below against the code, and they match: sim.js:4887 forces `n.format = '2v2'`; sim.js:4929 humSlot looks only at h[0]/h[1]; sim.js:4971 skipBoth; netfluid.js:151 `NPL = 2`; net.js:130, netfluid.js:262, net.js:700, main.js:681 all clamp `slot` to 0|1; replay.js:324 does the same, which none of the maps listed.

---

## 1. Current architecture in short

**Layers, bottom to top**
- **Transport.** js/netrtc.js `Link` is one RTCPeerConnection to one peer. It opens 2 negotiated channels: `in` (id 1, unordered, maxRetransmits 0) and `ctl` (id 2, reliable and ordered), netrtc.js:72-73. There is no trickle ICE: it waits for full gathering, up to GATHER_MS 3500 (netrtc.js:25, 118-138). Only STUN is configured (netrtc.js:24); `VB.NET_ICE=null` means no TURN (netconfig.js:18). `relayBad` is global to the module (netrtc.js:29).
- **Rooms and signalling.** Firestore over REST (js/netroom.js). The room doc id is the host's uid (rules:67). Fields: `{code,name,gname,host,guest,fmt:'2v2',venue,map,even,bo,pts,state,v,seen,net?}` (netroom.js:8, 81, 173). There is one `sig/offer` doc and one `sig/answer` doc (netroom.js:273-291). In the rules, `members(d)=[d.host,d.guest]` (rules:61), and one guest can join or leave (rules:74-81).
- **Lobby.** js/netlobby.js keeps a single `L.link/L.conn/L.rival` (netlobby.js:178). `newLink()` closes the previous link (276-281). `begin()` builds `humans:[host,guest]` (453-454) and calls `startOnline({slot: host?0:1})` (467).
- **Netcode, two models built for exactly 2 peers:**
  - **Precisa** (js/net.js): symmetric rollback, and only inputs travel. 120 Hz sim, input delay 2 ticks (17 ms), MAXPRED 24 (200 ms) before stalling, hash every 120 ticks, the host repairs with `snap`. The packet has no sender id (net.js:104-120), and there are only two rings, mine and theirs (net.js:145-146).
  - **Fluida** (js/netfluid.js + the FLUIDA block in sim.js:5080-5540): ownership per TEAM (`F.loc[2]`, `F.own` = team, sim.js:5149-5156). Input delay is 0. The rival team arrives as 30 Hz `S` snapshots with `NPL=2` players (netfluid.js:151) and is drawn 6-18 ticks in the past. Ball handoffs happen at `khAt`, hidden by flight time across the net. On a tie, the host wins (netfluid.js:674-677, 742-747).
- **View.** js/netview.js flips the canonical game 180° when `slot===1` (netview.js:169). It swaps hum only when `H.length===2` (151), and `inputToWorld` negates input for slot 1 (232).
- **Sim.** onlineOpts forces 2v2, ctrl 'one', difficulty normal and bench null (sim.js:4884-4899). initOnline builds `g.hum[t]` for t<2 with **slot == team** (sim.js:4900-4914). The active-slot model `act(g,t)` swaps 27 SLOT_S fields (sim.js:4916-4921), and `fin()` always restores slot 0 (4923).
- **main.js.** startOnline (676-692), netSession (694-708), netBuildView (888-913), netFrame (915-948), netHud (986-1053), netTag (1085-1102). Stats and records are indexed by `net.slot` as if it were a team (759, 819-822, 881). A Blob Worker heartbeat runs every 16 ms (956-980).

**Desktop Node measurements (expect phones 4-8x slower)**

| | step | copyGame | serialize | hash |
|---|---|---|---|---|
| online 2v2 | 19-21 µs | 130 µs | 9.6 KB | 21 µs |
| offline 6v6 | 29-31 µs | 155-191 µs | 16-17.6 KB | 42 µs |

A 24-tick rollback costs about 0.63 ms in 2v2 and about 0.94 ms in 6v6 offline on desktop, so roughly 3-8 ms on a phone. Online 6v6 with human slots has not been measured.

GPU is the tighter limit in 6v6: on low quality it already uses 35 draw calls on average and 37 at peak, against a provisional budget of 45 (tools/perf.js:13-15, notes/players.md:1629-1631).

---

## 2. Every "exactly 2 peers / 1 human per side" assumption, by file

### js/sim.js (the main blocker: slot == team)
- 4883 `slotIdx` returns only 0|1. 4887 forces format '2v2', ctrl 'one', difficulty normal and bench null. 4888-4889 and 4902-4903 set `prof=[DIFF.mate,DIFF.mate]`, rookie false and `TIMING.online`. 4893-4898 set attrs/badges only for the human of each team (a 2×2 matrix).
- 4900-4914 initOnline: `g.hum[t]` for t<2, `s.p = teams[t][slotIdx(H[t])]`. skipReq/tmoReq/tmoLeft are 2-element arrays indexed by team.
- 4916 `act(g,t)` and 4951 `jsetHum(g,t)` activate by team. 4923 `fin()` resets to slot 0, so `g.ctrl` ends up as the host's player.
- 4927 `humOn(g,t)` reads `g.hum[t]`. 4929 humSlot checks h[0]/h[1]. 4931 endSwingAll and 4941/4943 resetSlots loop s<2. 4937 aimOff names hum[0]/hum[1].
- 4971 skipBoth. 4974-4981 netBits treats slot as team for `challenge(g,s)`, `tmoReq[s]` and `skipReq[s]`. 4987-4992 tmoReady/startTmo.
- stepOnline: 5015 input loop s<2; 5056-5058 `act(g, server.team)`; 5063-5064 computeJob with act(0)/act(1); 5065-5071 human loop s<2; 5074 `act(g, p.team)` before each AI.update.
- 1523 setAim uses `g.hum[1-p.team].p`. 1648 streak cT. 1807 digTight `humOn(g,1-t)`. 1936 `hset(g,t,'lastGrade')` passes team where a slot is expected. 3089 challenge AI gate `g.hum[t].ai`. 3622 stepServe `sv.team===g.hT`. 3688 and 3732 serverIdx mirror from `g.hum[1].p.idx`. 3995 serveAimReset s<2. 4026, 4038, 4046 updateDefense `ht=g.hT`, `other(g,g.ctrl)`. 4081 and 4097 aim helpers `g.hum[g.hT].ai`.
- 6v6 is team 0 and single human only: 239-257 setCtrlRole uses lineup[0]/liberoFor[0]; 886 applyLibero `hb` only when t===0; 733 setTurn `g.jobs[0]`; 3454 posFault; 4031 `blockPlan(g,0)`; 4160 askOk; 3804/3824 ask. The globals hAct, ask6, ctrlBase, ctrlRole and ctrlOut are not in SLOT_S (4880-4882).
- Online disables features the Career needs: amb 397, start 446, zone/serveSig 459-460, scout 466.
- FLUIDA block: 5141 `mine = loc[p.team]`; 5149-5156 flInit per team; 5359 tie means the host wins; 5421-5432 flPose takes the whole rival team and the gesture only from `g.hum[team]`; 5459 `slotAI(g,1-F.me)`; 5467 and 5476 `_inS`/H indexed by team; 5513 "in 2v2 nobody else moves".

### js/ai.js / js/ai6.js
- ai.js reads `g.ctrl` as THE human of team t: 182-183, 199, 204, 286, 288, 302 (`jsetHum(g,opp)`), 315-316, 531.
- ai6.js: 169-176 `hu = t===0 ? g.ctrl : null`; 390 global `g.hAct`; 416 and 425 global `g.ask6`; 569, 582, 602, 677 subs/coach `hb = t===0 ? g.ctrlBase`.

### js/net.js (Precisa)
- 130-131 slot is 0|1 and there is one link and one rivalName. 145-146 two rings plus scalar rHave/remoteAck/remoteTick. 158 one myHash/theirHash pair. 164 `_ins` has 2 entries. 183-185 stepInputs [s0,s1].
- 104-120 the packet has **no slot/sender id**. 248-261 every packet goes into `theirs`.
- 453-460 confirm requires mine && theirs (`ot=1-me`). 631-645 predicts a single rival.
- 335-338, 375, 382-407 hash and snap host→single guest. 410-450 resync/applyResync for one remote slot. 473-476 recIn records 6 values. 582-586 frame advantage against a single remoteTick.
- 216-217, 356-366, 596 results are zero-sum, `win = gameOver.team === slot`. 124-127 sameRoom has no format field.
- 656-695 memPair returns exactly [A,B]. 700 BcLink slot is 0|1 with no `to` field. 729-788 `VB.Net.bot(team)` is per team and 2v2-only.

### js/netfluid.js (Fluida)
- 151 NPL=2; 158-193 encS/decS (179 rejects shorter buffers); 1253-1264 _snapMaybe. 262 slot is 0|1. 279 delay 0. 312 pOff/pShown/pExt have 2 entries; 319 `_poses [{},{}]`; 1123-1130 pose ring i<2.
- 1057, 1064, 1070 `_tick` uses `rm=1-me`. 1135 and 1266 use `F.loc[1-me]`.
- 563, 571, 896, 1213 `rival = 1-slot`. 576-598 sb/sbok score repair host→single guest. 674-677 and 742-747 the host wins ties. 913-917 resync undoes flTake for one team. 119-124 sameRoomF has no format. 325 _setOpts inherits '2v2'.

### js/netview.js
- 149-157 and 151 flip swaps hum only when H.length===2, and `v.ctrl=H[0].p`. 166-171 mirror flips when slot===1. 177-196 flRivalJob assumes exactly one local team. 204 mapEvents(slot). 230-234 inputToWorld negates when slot===1.

### js/main.js
- 681 `net.slot = o.slot===1?1:0`. 694-708 a single Session. 724-748 rematch uses want/rivalWants and the host decides. 759 `sets[net.slot]`; 760 `NetRec.end(rivalName)`. 817-826 netKit host/guest. 827-831 `net.cr={me,rival}`. 840 tallies. 881 netStatsResync `net.slot===1`. 892, 936, 939 mirror/mapEvents(net.slot). 923 inputToWorld(net.slot), which also **drops switchPlayer**, so ask6 cannot be sent online. 986-1053 netHud for a single rival. 1085-1102 netTag only over `v.hum[1].p`.
- Test entry: 781 slot is 0|1; 787 humans has 2 entries; 799-813 the first `pre` and a single rivalName.
- Career: 1255-1282 startCareerMatch with ctrl 'one' and ctrlIdx 0 (1266, 1291). 2181-2208 careerEvents. 2219-2250 and 2274 the ambient director runs outside the input stream.

### js/replay.js
- 324 `RP.me = RP.dual && o.slot===1 ? 1 : 0`. The dual replay is 2-sided (not in the maps; verified).

### js/netroom.js
- 8, 81, 173 host/guest/gname; `fmt:'2v2'` is hard-coded. 62-80 enc/dec handles scalars only, and 77 turns maps into null. 165, 249-251, 290 delete only offer/answer. 221-233 join requires a single free seat and sets state 'full'. 235-239 leave. 242-255 bye('host'|'guest'). 273-291 putSig uses fixed doc names.

### firebase/firestore.rules
- 50, 53 a single guest and gname. 54 `fmt in ['2v2']`. 61 members. 67 rid == host uid. 68 create with an empty guest. 75-77 join only when the guest is empty, which sets 'full'. 79-81 leave only from 'full'. 84-100 sig docs named offer/answer with `to == room().guest`. 103 delete uses members.

### js/netlobby.js
- 178 L holds one room/link/conn. 271-272 hostPoll one guest. 276-281 newLink closes the old link. 285 abortConn has a single timer set. 288-305 hostConnect one offer. 312-315 connFail resets the whole room. 375-389 guestListen polls the single sig/offer. 402 guestPoll. 418, 427 the 1:1 `pre` handshake. 444 the model-mismatch check is pairwise. 453-458, 466-468 humans, slot, look and expect. 474-490 relink. 491-498 matchClosed. 876-892 the ticket shows one `.fx-slot` ("Una plaza libre", 883). 858-866 and 902-910 help texts. 1070-1075 / 1167-1172 create rows: no format row, and mobile and PC order differ. 1081-1096 / 1178-1196 Tú VS Rival. 1408, 1428, 1441, 1457-1478 resume uses slot 1 / b.guest.

### js/netlog.js, js/netrec.js
- netlog 90, 175 `rol` from slot===0 and a single rival; 131-141 one link.info().
- netrec 58-68, 138 one rival name. 65-66 `rivalQuit`/`rivalGone` count as a **win**, which is wrong when the person who left is a teammate.

### UI / presentation (single local human, all keyed on g.ctrl and team 0)
- input.js:817-822 and 1302.
- camera.js:256-261, 338 (mateOf assumes teams[0]), 375, 2549-2574.
- players.js:1515, 2287, 2481, 2781 treat "the human" as `p===g.ctrl` on team 0, so a remote human teammate is animated as AI. players.js:5049-5087 draws one halo.
- ui.js: 597, 1101, 2498 netCr; 3975-3997 the final sheet and rematch for one rival; 6344-6353 role6 in localStorage, excluded online and in the Career.

### Career (js/career.js and extensions)
- 1264, 3703 ctrlIdx 0. 235, 932, 2381, 2828 ctrl 'one'. 1358-1381 newM has one Rating/Consignas. 1446-1450 slotOf: beach slot 1 is the mate, so stats are counted and then discarded; hall uses `pl===g.ctrl`, which breaks online because of fin(). 1655-1699 closeMine credits only c.player. 1719 `endMatch(...,[c.player,null])`. 3363-3366 hall badge via `indexOf(g.ctrl)`.
- Extensions read "me" as attrs[0][ctrlIdx]: career-life 1287-1291, career-injury 261-262, career-dev 481-483, career-allstar 556-578, career-natl 695-704.

### tools/
- nettest 76-135 and golden (2 slots); fluidtest 58, 88-89, 106-123, 209-210, 421-438; fluidscen 70, 104-105; net3test 150-360; netreplaytest; fluidchaltest; viewtest; mptest 151, 363-452; netdrive 72-115 (throws if there are fewer than 2 pages) and 200+; roomtest uses a single guest.

---

## 3. Candidate netcode architectures for N peers

### A) Host-authoritative star with client-side prediction of your own player
The host runs the authoritative sim of the whole match, including all AI and arbitration. Each guest sends inputs (or own-player poses) to the host and receives a per-tick bundle or snapshot. Each guest predicts its own player locally with 0 delay and draws everything else interpolated.
- **Latency.** Your own movement feels instant. Contacts by your own player are confirmed by the host after one RTT, unless the guest owns its touches (see the A+B hybrid). Remote players are about RTT/2 + buffer in the past. Guest-to-guest interaction pays 2 hops.
- **Bandwidth.** A guest sends ~1 KB/s of payload (~3.5 KB/s with overhead) and receives ~7.6-10 KB/s for a 12-player bundle at 30 Hz. The host sends ~100-110 KB/s in 6v6 with 11 guests, and ~30 KB/s in 2v2×4.
- **Complexity.** Medium-high: a new reconciliation path for the own player, plus a snapshot bundle format.
- **Determinism.** Not needed across peers, because the host is the authority. That removes hash, repair and fork logic.
- **Mobile CPU.** A guest runs only its own player plus interpolation, so it is cheap. The host runs one 6v6 sim (~30-60 µs/step on desktop) and the relay, which is fine even on a phone. Rendering 12 players is the real cost.
- **Connections.** N-1, all through the host. That is the least exposure to NAT failure.

### B) Fluida ownership generalised to per-player (a mesh, or a star with the host as arbiter)
Change `F.loc`/`F.own` from team to peer (or player id). Make NPL variable, with player ids in `S`. Each machine simulates its own human plus any AI players assigned to it. The ball owner decides contacts. Add an intra-team handoff rule: hand over at contact, with `khAt = contact + max(one-way latency, a fraction of the flight)`. One arbiter (the host) resolves forks instead of the pairwise rule "slot===1 loses ties".
- **Latency.** The lowest perceived. 0 input delay, never rolls back your own player, and the cross-net handoffs are already hidden by flight time. Intra-team passes (bump-set-spike between two human teammates on different machines) have short flights. That is the weak point: the handoff budget is small, so there will be visible corrections there.
- **Bandwidth.** Per peer ~31 B × 30 Hz upstream to each receiver. A star is cheap. A mesh at N=4 is fine and at N=12 it is not.
- **Complexity.** High. Fork cases multiply (multi-blocker blocks in 6v6), AI ownership has to migrate when a peer leaves, and the score digest must work N-way.
- **Determinism.** Not required. Consistency comes from per-point digests and host repair.
- **Mobile CPU.** Low. No rollback.

### C) Generalised rollback (Precisa), mesh or star
Add a slot id to `in`, use `ring[nSlots]`, keep remoteAck per peer, confirm when every HUMAN slot has its input (AI slots need none), predict each remote slot from its own last input, send hashes from everyone to the host, and let the host snap any guest.
- **Latency.** 2 ticks of input delay plus rollback. Depth and stalls are set by the WORST link across all peers, so one peer above ~200 ms stalls everyone (net.js:556). Misprediction pops grow with the number of remote humans. A star doubles guest↔guest latency, which makes rollbacks deeper.
- **Bandwidth.** Mesh: ~9-11 KB/s per link, so about 30 KB/s up per phone at N=4 and about 100-120 KB/s (~0.9 Mbit/s, 660 packets/s) at N=12, which is too much.
- **Complexity.** Lowest for N≤4, because the machinery exists and scales cleanly.
- **Determinism.** Required and already in place. stateHash and copyGame already loop over g.players.
- **Mobile CPU.** copyGame + depth×step: 2v2 ≈ 3-5 ms on a phone at depth 24. 6v6 ≈ 5-10 ms before render, which is too tight next to a 12-player render.

### Recommendation
Pick per mode, but share the sim refactor:
1. **Co-op Career (2 humans, same team, vs AI): Precisa (C) with 2 peers.** The ring/ack/hash machinery stays exactly as it is. Only the slot→player mapping, the mirror and the results change. Input delay stays at 17 ms. This is the lowest-risk first deliverable. For beach co-op, Fluida is excluded until per-player ownership exists.
2. **2v2 with up to 4 humans: Precisa-N (C) over a star with the host as hub, with an optional mesh later.** At N≤4 the rollback cost is fine. Add adaptive input delay, `clamp(round(maxRTT/2/STEP_MS)-16, 2, 8)` (notes/net.md:156-157), and per-peer ping in the HUD. The star keeps NAT exposure at 3 links. The mesh (6 links) can be an option measured once TURN exists. Lock the Conexión row to Precisa for cap>2 until B is ready, which is the opposite of what the transport map suggested. Reason: B's intra-team handoff problem appears exactly in 2v2 with two humans on one team, and C handles it for free.
3. **6v6 with up to 12 humans: A, host-authoritative star, with B-style ownership of your own player.** Every guest simulates and owns only its own human: 0 delay and its own touches are authoritative locally, with the host checking plausibility. The host simulates all AI players, the ball between human touches, rotation/subs/libero and the score, and broadcasts one 30 Hz bundle of all 12 poses plus the ball. Remote players are interpolated with the Fluida Dt formula (netfluid.js:1396). Ball handoffs to and from a guest-owned player use Fluida's `khAt` and warped painted-ball clock, so the existing 1v1 smoothing code is reused. Rollback is ruled out for 6v6 on mobile unless a real-phone benchmark of online 6v6 shows step×24 + copyGame under ~4 ms.
4. Keep 1v1 Precisa/Fluida exactly as it is, as the 2-seat case of the new seat model.

Gate before 6v6: deploy TURN with short-lived credentials. Until then, a seat that cannot connect plays as AI.

---

## 4. Room, signalling and rules changes

- **Schema v3, additive.** Keep the 1v1 rules branch byte-compatible for cached 1.21.0 clients. Add `roomOkMulti(d)` with `mode 'vs'|'coop'`, `cap 2|4|12`, `fmt in ['2v2','6v6']` (now the sim format), `seats {<uid>:{n,at}}`, `cnt` (written by the host), and an optional host-only `lineup`. Keep `guest:''` and `gname:''` in multi rooms. Bump `LOBBY` to 3 (netlobby.js:39) so old clients show "Otra versión".
- **Join.** PATCH with `updateMask.fieldPaths=seats.\`<uid>\`` and `currentDocument.exists`. The rules require: affectedKeys only `seats`, the seat diff only touches your own uid, `seats.size() <= cap-1`, not the host, state open, live, and nameOk. **Leave** removes your own key only. The host flips state and kicks through the existing host branch (rules:72-73).
- **Signalling per pair.** `sig/o_<uid>` (host→guest) and `sig/a_<uid>` (that guest's answer). Read access only for the addressee and the host. `members` becomes `uid==d.host || uid in d.seats`. Delete each pair doc as soon as its link opens. A mesh would use `<from>_<to>`, with the lower uid offering.
- **netroom.js.** enc/dec for mapValue; ROOM_KEYS add cap/mode/seats/cnt; `open(cfg)`; `joinMulti`/`leaveMulti`; putSig/getSig/delSig take `(id, kind, peerUid)`; _sweep/bye delete per-pair docs.
- **Lobby.** `L.links={uid:Link}`, with per-peer conn/gen/timers keyed `'sig:'+uid` and `'connT:'+uid`. The host creates offers in parallel, one per joiner as they arrive, because sequential offers to 11 peers take ~38 s. After a link opens, stop guestPoll and move roster, ready, seat choice and `pre` onto `ctl`, to save Firestore quota. Keep the 20 s host beat.
- **Start barrier.** The host waits for `pre` from every seated human, or PRE_MS plus a margin, then sends `{k:'go', lineup, seed, opts, names, looks}` on every link. Missing seats become AI. A seat that never connects is released as "no conecta" instead of resetting the room through connFail (netlobby.js:312-315).
- **No host migration this sprint.** The room id is the host's uid. A host leaving counts as hostGone ("no cuenta"). Extend the phase-6 host reload (hostBackSave/rejoinHost, netlobby.js:1457-1478) to a list of guests. A guest leaving mid-match means the AI takes their player.
- **Deploy order.** Rules first, verified with an extended roomtest against the emulator. Then the client.

---

## 5. UI changes (SPLAT style, mobile first, landscape 568×320 `.ph-s`)

- **Crear sala.** Add a first row, "Formato": 1 contra 1 / 2 contra 2 / 6 contra 6. For 6v6, lock Escenario to Pabellón. Lock Conexión per the recommendation (1v1 free choice; 2v2×4 Precisa; 6v6 the new model). Use the same row order on mobile and PC, which differ today (1074-1075 vs 1171-1172). Keep "Abrir sala" in the dock. Co-op rooms are created from the Career and are hidden from the public list (join by code or link).
- **List ticket.** Show "n/cap" plus the format instead of the single `.fx-slot`. aria becomes "k plazas libres". A room is joinable while cnt < cap-1.
- **Waiting room.** Replace `.ol-vs` with two team columns of seat chips (2 or 6 per side) in the team's kit colours, inside the scrolling `.ol-match`. Each chip shows a dorsal plus the role (6v6: Colocador, Receptor 1/2, Opuesto, Central 1/2) or "Jugador 1/2", one-line ellipsis, "Tú" highlighted, a ping dot from `link.info().rtt`, and a Listo tick. Tap to sit or stand up. The host can move or kick people and swap teams. "Empezar" is enabled when everyone seated is ready. Role rules: only one S and one OPP; OH and MB allow two each. role6 moves from localStorage into the seat.
- **In match.**
  - A pool of name tags (up to 11), positioned with `transform: translate3d` only, team coloured, with an AI badge when slotAI. Batch tags and floor rings into existing atlases or instanced meshes so 6v6 low stays at ≤45 draw calls.
  - Keep your own halo (players.js:5049).
  - netHud says "Equipo A vs Equipo B", shows your ping plus the worst ping, "Esperando a: X, Y", and "X se ha ido: lo lleva la IA".
  - "Continuar" goes by majority or timeout instead of skipBoth.
  - The scoreboard netCr shows team names.
  - A "Cargando: Ana ✓ · Luis …" screen during netBuildView, with a per-seat 12 s ready timeout.
  - 6v6 camera: '3p' follows `view.ctrl`, and 'tv' remains a local option.
- **Final sheet, rematch, NetRec.** Teammates and rivals are stored separately. Only an opponent quitting counts as a win.

---

## 6. Co-op Career integration plan

- **Model: strictly host-authoritative.** The co-op career IS the host's existing save plus `c.coop = {v:1,on,uid2,name2,p2:{name,num,pos,lvl,xp,pts,st,bp,bd,beq,age,matches},stats2,notes2,chem,look2,joined,lastSync}`. Implement it as a new extension `js/career-coop.js` in VB.CareerExt (CONTRACT.md:1245-1272): idempotent `ensure`, no VER bump, RNG only through `_rng(_hash(c.seed,'coop',...))`.
- **Guest view.** The guest receives the host's whole `c` as a snapshot over `sendApp`, in ≤16 KB chunks with a sequence number, gzipped where CompressionStream exists. Beach is 5-16 KB gzip; hall is 25-41 KB gzip. The guest renders it through a new swappable store seam, `VB.Career._useStore(memStore)` at career.js:209, plus `_reset` and a mode override. **The guest must never write it to localStorage**: account.js:65-83 would upload it over the guest's own cloud Career. Also guard career-story-ui foldSet (221) and the career-life legends write (693).
- **Guest intents.** A single gate at the top of the career-ui click switch (~2917) routes guest actions to `VB.CareerCoop.intent`. v1 allows the guest: bump/badge on p2, ready, chat. Everything else is greyed out.
- **Beach first.** In the `setup` hook (career.js:1283), replace attrs[0][1], badges[0][1], mate name/num and nums with p2, and set `out.coop={slot2:{team:0,idx:1}}`. Keep c.mate as the AI fallback. In closeMine and the `match` hook, credit `m.p[1]`, which slotOf already counts (1449), to p2 using the closeMine XP formula (1666). Skip mateFormStep, changeMate and the offer mateP while co-op is on.
- **Launch.** Add `ctx.actions.startCoopCareerMatch` next to main.js:1255. The host converts matchSetup into online opts: `humans:[{team:0,idx:0},{team:0,idx:1}]`, the full attrs/badges matrix, per-team difficulty/prof, rookie, kits, nums, `career:cs`. Only the host calls matchDone, and only from CONFIRMED events (the netConfirmed path, main.js:938/975). The guest waits for the post-match snapshot. v1 sets `cs.noAmb=true` and `cs.noZone=true` and turns scout off, because the ambient director's holdFor/penalty (main.js:2240-2250) sits outside the input stream and would desync.
- **Sim prerequisites** (shared with 2v2×4): humans[i].team plus idx, the full attrs matrix, per-team prof/rookie/timing, and a NetView flip keyed on my team (a co-op guest needs no flip).
- **Hall co-op** waits for online 6v6, plus a rule that keeps both humans on court (an extension of meRules6) and a "me2" slot in slotOf/newM.
- **Scope.** v1 covers league and cup fixtures only. Extension matches (natl, allstar, prologue, trials) stay host-solo.
- **Questions for Ferran.** (a) Can the career advance without the guest? (b) Does the guest vote on offers? (c) Does hall co-op wait for 6v6? Co-op requires an identical VB.VERSION.

---

## 7. Test strategy for 4 and 12 peers

- **Before any code.** Record a fp-6v6 behavioural fingerprint (a new fingerprint6.js variant). It does not exist today. Confirm fp-2v2, fp-mastery and fp-salto pass. Only after all four pass, `--rehash` SIM_BASE 'afb5ebee' (fluidsimtest.js:238). Put the new sim code in a marked `/* ==== MULTI ==== */` block that the fluidsimtest stripper skips, with single-line `if (g.mh…)` hooks.
- **Link layer.** `VB.Net.memMesh({n, rtt(i,j), jit, loss})` with a Shaper per directed pair, and `memStar` (guest↔guest = rtt(g1,h) + rtt(h,g2)). Keep memPair as a wrapper so the existing tests don't change.
- **New Node harnesses** `tools/net4test.js` and `net12test.js`: N vm contexts, `next[N]`, `k=argmin`, per-peer clock offsets and hitches, N slot-aware bots. The bot becomes `VB.Net.bot(slot)`, and in 6v6 an "AI-as-input" bot reads ai6. Metrics per peer: waitFrames, unstable %, a rollback-depth histogram, CPU per advance p50/p99, traffic per directed pair, hash agreement across N (C) or scoreboard and event agreement (A/B), and a golden offline replay with N input slots. Run seeds in parallel with worker_threads (8 cores).
- **mptest variants**: 4 slots in 2v2, 12 in 6v6, 2 humans on one team. Check slot ownership of touches, skip/challenge/tmo per team, single-slot AI takeover and rejoin, and serialize/copyGame round-trips. viewtest gets a "flip keyed on team" variant.
- **Chrome.** netdrive with N pages (`&slot=k&n=N`), BcLink gets a `to` field and a per-pair Shaper, and a `&norender=1` bot page. Configurations: 4 peers = 2 rendering + 2 norender; 12 peers = 1-2 rendering + 10 norender, or Node peers bridged in. Use `Emulation.setCPUThrottlingRate` (cdp.js:237) for one phone-like page. Run one test at a time on an idle PC, because freeze checks are load-sensitive (net.md:1257, 1333).
- Add a Shaper around RtcLink (`?netlag=&netjit=&netloss=`) so `--rtc` measures lag. Extend roomtest to multi-guest rules and count reads and writes per join.
- **Career.** A careertest-style coop test covering setup attrs, both XP ledgers, a snapshot round-trip that leaves localStorage untouched, determinism, and NOEXT equality.
- **Regression gate after every package**: simtest, fingerprint6 (4 variants), mptest, nettest, net3test, viewtest, netreplaytest, fluidsimtest, fluidtest --quick, fluidscen, fluidchaltest, roomtest, netlogtest, netdrive (both models).
- **Real-phone benchmark**: online 6v6 step and copyGame, plus `tools/perf.js EXTRA=format=6v6`.

---

## 8. Risks

1. **The offline regressions are the most likely ones.** Generalising isHuman, humOn, updateDefense, setTurn and the g.ctrl reads in ai.js/ai6.js touches offline paths. Mitigation: `humansOf(g,t)` returns exactly `[g.ctrl]` offline, with the same call order. Gate on all four fingerprints.
2. With several humans on one team, the AI gives the job bias and humanOwns only to the active slot (ai.js g.ctrl). That is a fairness bug if `humansOf` is not done properly.
3. **NAT.** STUN-only means each extra link can fail on its own. TURN is a precondition for 6v6, and AI fallback per seat is mandatory.
4. **Precisa-N worst link.** One bad peer stalls everyone. Mitigate with adaptive delay, an AI handover after UNSTABLE, and per-peer ping in the HUD.
5. **6v6 render budget.** Draw calls peak at 37 of 45. Tags and rings must be batched. A phone host also carries ~100 KB/s of upload, so recommend desktop or wifi for hosting.
6. Intra-team handoff under A/B (2 humans passing to each other) is unproven. Prototype it in Node first.
7. **Firestore quota.** Polling for 12 seats can cost thousands of reads per room. Move to the DataChannel as early as possible.
8. **Career clobbering through account.js**, and scope creep (story, offers, natl assume one protagonist).
9. **SCTP message size.** Keep career snapshots and 6v6 resyncs (17 KB) at ≤16 KB chunks; Safari is around 64 KB.
10. **Fluida is pairwise.** Tie-breaks and sb are 2-party. If B is generalised, a single arbiter is mandatory.
11. **The 6v6 bench and coach can substitute a human out.** The rule must be "humans are never substituted".

---

## 9. Work breakdown (8 packages, disjoint ownership where possible)

**Shared hotspots and serialisation**
- **sim.js** is owned by P1 alone. Everyone else asks P1 for hooks. The FLUIDA block is touched only by P5, and only after P1 merges.
- **main.js** is owned by P4. P7 adds only `startCoopCareerMatch`, merged after P4.
- **ui.js** gets only small edits: the final sheet goes to P6 and role6 is removed by P6.
- **career.js** gets the store seam and the slotOf changes from P7.
- **Merge order:** P0 → P1 → (P2 ∥ P3 ∥ P6-lobby part) → P4 → P5 → P7 → P8.

| # | Package | Owns | Depends on |
|---|---|---|---|
| **P0** | Baselines and harness: fp-6v6 variant, memMesh/memStar, N-slot bot, net4test/net12test skeleton, phone bench script | tools/fingerprint6.js, tools/net4test.js, tools/net12test.js, the test-helper part of js/net.js (memMesh/memStar/bot at net.js:656-788; coordinate with P2 or move them to a new js/nettest-links.js) | none |
| **P1** | Sim seat model: `g.hum[N]` with team/idx/role, `p.hs`, `g.humT[t]`, act by slot, every s<2 and team-indexed use from §2, `humansOf`, 6v6 fields into SLOT_S, per-team prof/rookie/timing, full attrs matrix, onlineOpts allows 6v6 and coop, MULTI block plus stripper; mptest variants | js/sim.js (outside FLUIDA), js/ai.js, js/ai6.js, tools/fluidsimtest.js (stripper), tools/mptest.js | P0 |
| **P2** | Precisa-N: slot id in the `in` packet, `ring[n]`, per-peer ack, confirm over human slots, per-slot prediction, all→host hashes and per-guest snap, per-slot resync, adaptive delay, star relay through the host, per-slot results, an ask6 bit | js/net.js (session part), tools/nettest.js, tools/net3test.js | P1 (API), P0 |
| **P3** | Rooms, rules, signalling: schema v3, roomOkMulti, joinMulti/leaveMulti, per-pair sig, enc/dec maps, LOBBY=3, roomtest multi | js/netroom.js, firebase/firestore.rules, tools/roomtest.js | none (can start right away) |
| **P4** | View and match glue: NetView keyed on myTeam/mySeat, `v.ctrl` = my seat, inputToWorld(team), mapEvents; main.js startOnline/netSession(N links)/netKit/netNames/netHud/tag pool/stats by team/rematch/ask6 passthrough; replay.js dual by team; players.js uses a seat map for "human" | js/netview.js, js/main.js (online sections), js/replay.js, js/players.js (human checks and rings), js/input.js:817, tools/viewtest.js, tools/netreplaytest.js | P1, P2 API |
| **P5** | 6v6 online model (A plus own-player ownership): bundle format, host-authoritative sim of AI and the ball, guest own-player sim, interpolation and khAt handoff reused from Fluida. New file js/nethost.js (Session), with only flagged hooks in the FLUIDA block | js/nethost.js (new), the sim.js FLUIDA block (after P1), tools/net12test.js scenarios | P1, P4, P0 |
| **P6** | Lobby UI and records: Formato row, n/cap tickets, the seat grid waiting room, the multi-link lobby (`L.links`, parallel offers, ctl roster, start barrier, AI fallback per seat), the resume list, netlog per-peer samples, NetRec teammates/rivals, final sheet (ui.js:3975-3997), role6 into the seat | js/netlobby.js, js/netlog.js, js/netrec.js, ui.js (final-sheet block only), tools/netlogtest.js | P3; P4 for startOnline opts |
| **P7** | Co-op Career: js/career-coop.js extension, the store seam `_useStore`, snapshot chunking over sendApp, the career-ui intent gate, slotOf/newM me2, startCoopCareerMatch, careertest coop. Beach first; hall after P5 | js/career-coop.js (new), js/career.js (seam, slotOf, closeMine hooks), js/career-ui.js (gate), js/career-story-ui.js/career-life.js (write guards), main.js (one action), index.html (script tag per notes/ui_main.md) | P1, P2 (2-peer coop works on the existing Precisa once P1 and P4 land), P4 |
| **P8** | Integration and lag QA: netdrive N pages plus norender, BcLink `to` plus a per-pair Shaper, a Shaper around RtcLink, CPU-throttle runs, real-phone perf for 6v6 online, TURN config (VB.NET_ICE), docs (notes/net.md, CONTRACT.md, TRASPASO.md) | tools/netdrive.js, tools/chrome.js, js/net.js BcLink (700-720), js/netrtc.js (Shaper wrapper only), js/netconfig.js, notes/* | everything else |

**Suggested delivery milestones**
- M1 = P0+P1+P3+P4: the seat model, with 1v1 unchanged.
- M2 = M1 + P7 (beach): co-op Career on 2-peer Precisa. This is the earliest user-visible win.
- M3 = M2 + P2 + P6: 2v2 with up to 4 humans.
- M4 = M3 + P5 + P8 (TURN): 6v6 with up to 12, then hall co-op.

**Files referenced:**
- C:/Users/Puru/FCVBARB/carpetas/take-the-court-online/js/sim.js
- C:/Users/Puru/FCVBARB/carpetas/take-the-court-online/js/net.js
- C:/Users/Puru/FCVBARB/carpetas/take-the-court-online/js/netfluid.js
- C:/Users/Puru/FCVBARB/carpetas/take-the-court-online/js/netview.js
- C:/Users/Puru/FCVBARB/carpetas/take-the-court-online/js/netroom.js
- C:/Users/Puru/FCVBARB/carpetas/take-the-court-online/js/netlobby.js
- C:/Users/Puru/FCVBARB/carpetas/take-the-court-online/js/netrtc.js
- C:/Users/Puru/FCVBARB/carpetas/take-the-court-online/js/main.js
- C:/Users/Puru/FCVBARB/carpetas/take-the-court-online/js/replay.js
- C:/Users/Puru/FCVBARB/carpetas/take-the-court-online/js/career.js
- C:/Users/Puru/FCVBARB/carpetas/take-the-court-online/firebase/firestore.rules
- C:/Users/Puru/FCVBARB/carpetas/take-the-court-online/tools/fluidsimtest.js
- C:/Users/Puru/FCVBARB/carpetas/take-the-court-online/tools/fingerprint6.js