MAPA TÉCNICO: prueba con partidillo y petos + entrenos rápido/manual (solo lectura, repo C:/Users/Puru/FCVBARB/carpetas/make-the-cut-pruebas)

Contexto que ya está en el repo:
- TRASPASO.md:241-246 ya apuntaba la idea «entrenamientos de la Carrera al estilo NBA 2K». Ferran pidió no duplicar el entreno automático actual, sino sustituirlo o mejorarlo.
- notes/carrera.md:852-908 (§Sesiones) tiene el diseño y las medidas actuales.
- Reglas de SIGUIENTE.md que afectan a esta tarea:
  - La huella 2v2 no puede cambiar (simtest dice «huella 2v2 idéntica»; también `fingerprint6 --variant mastery`).
  - Los agentes no hacen commit.
  - Si la publicación es visible, hay que subir VB.VERSION y VB.CHANGELOG (abouttest).
  - Ordinales con `ordn` y separadores con sepHTML/sep, nunca «·».

====================================================================
1. FLUJO ACTUAL DE LA PRUEBA (oferta con trial)
====================================================================
PLAYA (BEACH, js/career.js)
- create() (~750-778):
  - Crea la carrera con `phase:'pick'`, `myClub:-1`, `mate:null` y `pick:{round:0,more:false}`.
  - `c.offers = genStartOffers(c, 0)` (:769). El mensaje del agente dice «ficharte o probarte» (:770).
  - `o.autoClub` (:774) es solo para pruebas y nunca elige la prueba.
- genStartOffers(c, round) (:783-795):
  - Ofrece 3-4 clubes Regionales modestos.
  - Si `round===0 && r()<0.75`, añade una prueba en el peor club del Circuito Nacional: `startOffer(c, nat, 1, round, r, true)` (:791).
  - Las ofertas se ordenan con la prueba al final (:793).
- startOffer(c,k,lvl,round,r,trial) (:796-805):
  - Con prueba: `rl=0` (Rotación), `years=1` y `if (trial) { o.trial = true; o.chance = trialChance(c); }` (:803).
  - La oferta lleva `mateP` (el compañero ya generado).
- trialChance(c) (:807): `round1(clamp(0.3 + (playerOvr(c) - START_OVR)*0.04, 0.1, 0.75)*10)/10`. Se exporta en BEACH (:2971).
- acceptOffer(i, years) (:1467-1483), en la fase pick:
  ```
  if (o.trial) {
    var pass = rng(hash(c.seed,'trial',o.club,c.pick.round))() < o.chance;   // :1472 determinista
    if (!pass) { c.offers.splice(i,1); c.pick.fail = o.club; msg(...'Prueba no superada'...);
      if (!c.offers.length) c.offers = genStartOffers(c, ++c.pick.round); save(c); return false; }
    msg(c,'agent','¡Prueba superada!', ...) }
  joinClub(c, o, years); save(c); return true;
  ```
- joinClub (:809-829):
  - Pone myClub, el compañero (`o.mateP`), la plantilla, el contrato y la confianza.
  - Pone `sessSane(c).imp = 0` (la impresión de los entrenos vuelve a cero).
  - Pasa de la fase pick a league y llama a `life(c,'join',o)`.
- Otras funciones de la prueba:
  - moreTime (:849-861) nunca retira la prueba.
  - rejectAll (:839-845) trae ofertas nuevas sin prueba.
  - negotiate (:1514) no se puede usar con la prueba.

PISTA (HALL)
- create6 (~2250-2276):
  - `c.offers = genStartOffers6(c,0)` (:2265).
  - Mensaje del agente en :2268.
  - autoClub en :2272.
- genStartOffers6 (:2277-2290): la prueba es en el peor club de la 1ª de tu país, solo si hay 2ª división (`low !== c.cc+'1'`) y con `r()<0.75` (:2283-2286).
- startOffer6 (:2291-2299): `o.chance = round1(clamp(0.3 + (playerOvr(c) - START6)*0.04, 0.1, 0.75)*10)/10` (:2297). Es la misma fórmula, en línea.
- acceptOffer6 (:2833-2852): es igual que la de playa, con `hash(c.seed,'trial6',o.club,c.pick.round)` (:2838), y después joinClub6.
- La fachada HALL (:2943) exporta acceptOffer6 como acceptOffer.

UI (js/career-ui.js)
- Ficha de oferta de playa, offerCard (:740-766):
  - Texto de la prueba con la probabilidad: `Math.round(o.chance*100)` + trialAI(c) (:753). trialAI (:725-738) describe la IA rival del Circuito Nacional.
  - Botón `data-act="offer"`, con el texto 'Hacer la prueba' o 'Firmar' (:763).
  - Con prueba no se puede negociar (:755).
- Ficha de pista, offerCard6 (~1219-1238): texto de la prueba en :1227 y botón en :1236.
- renderPick (:1285-1315): pestañas por oferta con «(prueba)» (:1293), tabla Comparar (:1300-1301) y aviso de que, si rechazas todas, también se pierde la prueba (:1312).
- Manejador 'offer' (:1462-1471):
  ```
  var wasPick = c.phase==='pick', okf = C().acceptOffer(oi, yrs[of.club]);
  if (okf) {... tab='match'; render(); ...}
  if (wasPick && of.trial) { note = 'No has superado la prueba de ' + C().club(c, of.club).name + '. Te quedan las otras ofertas.'; sub.pick = 0; ... }
  ```
- Prueba en careertest (tools/careertest.js:48-90):
  - :55 «la prueba es del Circuito Nacional con probabilidad».
  - :71-82: 30 semillas, `passN>0 && failN>passN`. Al aprobar, lvl===1 y phase league. Al suspender, se quita la oferta y `pick.fail>=0`.
  - :624-625: en pista, la prueba está en ES1.

Para cambiarla a un partidillo hay que tener en cuenta:
- En la fase pick no hay club ni fixture. `next()` y `matchSetup()` devuelven null sin club (careertest:51), y `matchDone` sale con null porque `myFixture(c)` es null (career.js:1245; myFixture en :865).
- Hacen falta funciones propias, por ejemplo `trialSetup(i)` y `trialDone(i, res)`, en BEACH y HALL y expuestas en la fachada.
- main.js tiene que desviar el cierre de la prueba antes de `K.matchDone`.
- La tirada actual con rng/hash puede quedarse de reserva para «Simular la prueba», en línea con el modo rápido.

====================================================================
2. PARTIDO DE CARRERA EN main.js, VUELTA DEL RESULTADO Y EJERCICIO DE CARRERA
====================================================================
Arranque
- ctx.actions.startCareerMatch (main.js:582-600):
  - Llama a `K.matchSetup()`; si devuelve null, abre el hub.
  - Llama a `K.abortMatch()`.
  - Llama a `startMatch({career:m.career, attrs, badges, points, difficulty, rookie, ctrl:'one', ctrlIdx:0, ref, venue: m.venue||'beach', format: m.format==='6v6'?'6v6':undefined, ctrlRole, bench, meSlot, meBench, names, coach, kit: Object.assign({}, m.kit, {rival: m.rivalKit||null}), nums})`.
- ctx.actions.startMatch(opts) (:445-514):
  - Con `opts.drill` va a startDrill (:449-451).
  - Si es un partido de Carrera en curso: con «Revancha» va a toMenu y con «Reiniciar» a startCareerMatch (:454-456).
  - `cs = opts.career` (:463). `fmt` (formato) en :471. `cv` (sede): la Carrera fuerza 'beach' o 'hall' con forceVenue (:477-478).
  - Banquillo y entrenador de 6v6 (:484-488).
  - `Sim.createGame({... points: opts.points||..., ctrl, ctrlRole, attrs, badges, ref, nums, format, venue, mastery: !fmt && !auto ...})` (:489-499).
  - `if (cs) g.career = cs;` (:502).
  - `setGame(g, opts.kit||null, cs ? careerLookOpts(cs, cv==='hall') : ...)` (:505). setGame (:374-387) llama a `Players.setKit(kitWithLooks(kit))`.
- matchSetup de playa (career.js:1021-1052):
  - Devuelve `{attrs:[[stMe,stMate],[rivA,rivB]], badges, points:PTS(21), venue:'beach', difficulty, ctrl:'one', ctrlIdx:0, rookie, ref, kit:{kitShirt,kitAccent,kitShorts,kitPattern}, rivalKit:{...}, career:{season,phase,week,round,label,me,rival,venue,meName,rivalName,player,num,mate,mateNum,cdiff}}`.
  - Después llama a `life(c,'setup',out)`.
- matchSetup6 (career.js:2367-2410):
  - Devuelve `{format:'6v6', venue:'hall', ctrlRole, ctrlIdx, ctrl:'one', attrs:[a0,a1], nums, meOn, meSlot, meBench, names, bench:[b0,b1], coach:[...], points:c.points (15/21/25), difficulty, ref, kit:{...,kitLibero}, rivalKit:{...,kitLibero}, career:{mode:'hall',...}}`.
  - Los atributos de cada jugador se generan con `genSt(ovr+form, pos, r)` (stOf, :2375).

Vuelta del resultado
- Bucle de frame (main.js:1007-1010):
  - `g.finished && gameOver` pasa el estado a 'over'.
  - En un ejercicio, `g.drill.done && drillEnd` llama a careerDrillDone(g) y pasa a 'over'.
  - `if (g.career && !g.demo && frameEvents.length) careerEvents(g, frameEvents)`.
- careerEvents (main.js:1072-1080):
  - Llama a `K.ingest(evs,g)`.
  - Con gameOver: `careerEnd = K.matchDone({sets, setScores, win: e.team===0}, null, g)`.
- Fachada `VB.Career.matchDone` (career.js:3011) despacha por `g.career.mode`. `drillDone(mode,id,total)` (:3014) llama a `trainSession(id,'play',total)`.
- Hoja final:
  - main.js:1039 llama a `careerEndSheet(g, careerEnd)` (:624-667), que pone la nota, la XP, la línea de minutos (partLine), las insignias y el reto.
  - ui.js:2476-2478 no da XP al escuadrón si existe `g.career`.
- toMenu (main.js:688-706):
  - Si es Carrera y no hay careerEnd, llama a `abortMatch` (el partido queda pendiente).
  - Con `g.careerDrill`, abre `CareerUI.open('hub',{train:true,res:drillC.res})`. Si no, abre `CareerUI.open('hub',{fresh:!!careerEnd})`.
  - career-ui.js:1745: `opts.train` abre la pestaña Partido con trainNote.

Estadísticas e ingest
- ingest(evs,g) (career.js:1068-1126): solo cuenta si hay g.career y no es demo ni autopilot. En `M.p[0]` (tu jugador) cuenta kills, aces, blocks, assists, digs, errors, recvP, perfect, good y poor.
- En 6v6, slotOf (:1062) da 0 si es `g.ctrl` y 1 si es el resto del equipo. Además cuenta meR, sets, entered y pulled.

Ejercicio de Carrera (ya existe)
- career-ui.js:587-660, bloque «Entrenamiento» de la pestaña Partido:
  - trainCard(c) (:616-638) muestra los puntos de sesiones, una fila por ejercicio con los botones `data-act="tr-play"` «Jugar» y `data-act="tr-quick"` «Rápido» (:629-630), la última sesión (trainLast :599-606) y, en pista, la pelea por el puesto (trainFight6 :608-615).
  - trainPlay(id) (:641-646) cierra el hub y llama a `VB.ctx.actions.startCareerDrill(id)`.
  - trainResText (:647-652).
  - Manejadores (:1429-1433):
    - 'tr-play' llama a trainPlay.
    - 'tr-quick' llama a `C().trainSession(id,'quick')` y muestra el resultado al momento.
  - Se pinta en renderMatch (:681) y en el render de pista (:1077).
- main.js:
  - startCareerDrill(id, auto) (:548-554): `s = K.drillSetup(id)`; si devuelve null, abre el hub. Después llama a `startMatch({drill:id, careerDrill:s, autopilot})`.
  - startDrill(id,opts) (:517-545): `Sim.createGame({drill:id, venue: venueNow(), difficulty:'normal', ctrl:'one', attrs: cd.attrs, badges: cd.badges, mastery:!auto})`.
    - `g.careerDrill = {id, mode, n, max, attrName, done:false, res:null}` (:538).
    - `setGame(g, cd.kit)` viste la equipación del club.
  - careerDrillDone (:556-560) se ejecuta una sola vez y guarda `d.res = VB.Career.drillDone(d.mode, d.id, g.drill.total)`.
  - restart (:720) repite el ejercicio de Carrera sin gastar sesión.
- ui.js:
  - gymEndShow (:4561-4599): con careerDrill no graba make-the-cut.gym. careerDrillRec (:4602-4610) da progreso, fatiga e impresión. Quita «Repetir» y «Siguiente», y el botón pasa a «Volver a la Carrera».
  - :2413: el botón «Salir» de la pausa dice «Volver a la Carrera».
- career.js, bloque de sesiones (:579-717):
  - Constantes (:603-604): `TRAIN_SESS=3, SESS_NEED=100, SESS_MAX=15, SESS_EFF=[1,.85,.7], SESS_FAT=[3,4,6], SESS_FAT_MAX=80, SESS_QUICK=[.3,.85], SESS_IMP_A=.15, SESS_IMP_DECAY=.75, SESS_COACH=1`.
  - SESS_DRILL (:606-612) da el atributo que sube cada ejercicio: serve→serve, recv→recv, set→set, atk→spike, block→block.
  - SESS_BY (:614-615), ejercicios por puesto:
    - Playa: atk (4), cr (4), uni (5).
    - Pista: OH (4), OPP (3), MB (3), S (3), L (2: recv y set).
  - Funciones:
    - sessSane (:628), sessState (:639) y sessFixture (:640).
    - sessDrills (:642) y sessInfo (:651) devuelven `{max,used,left,can,why,fat,fatMax,nextFat,fatK,imp,last,drills,need,tot}`.
    - sessOk (:657).
    - sessQuick(c,id) (:664-668) es determinista: `m[2]*(clamp(.3+(v-35)/100,.3,.85) ± .08)` y nunca da oro.
    - sessDo(c,id,how,total) (:671-697): `q = total/oro`, `gain = SESS_MAX*(0.2+0.8q)*SESS_EFF[n]*fatK*cd(c).train`. Sube la fatiga y la impresión; en playa, también la confianza (c.ts.cf). En pista recalcula lineup6 y añade stat0, stat, sel y gap. Guarda `t.last`.
    - sessClose (:699) y drillSetup(c,id) (:706-717) devuelven `{id, mode, n, max, attrs:[[me(con fatiga), mate], null], badges, kit:{...}, player, club, attr, attrName}`.
  - Fachada: `trainInfo`, `trainSession(id,how,total)` y `drillSetup` en BEACH (:2985-2986) y HALL (:2953-2954); `trainQuick: sessQuick`.
- Entreno semanal automático, que conviven con las sesiones:
  - `TRAIN` (:116-122): bal, phys, def, atk y rest.
  - TGROUP (:128) y trainWeek(c) (:559-577), que se aplica tras cada partido en closeMine (:1223).
  - UI: «Enfoque de la semana» en career-ui.js:904-911 (data-act 'train', :1421).
  - Este es el «entreno automático» que el backlog pide no duplicar.
- Limitaciones de los ejercicios de Carrera:
  1. Son siempre 2v2: sim.js:245 `six = opts.format==='6v6' && !dk`. En la pista el ejercicio sale 2v2 con un compañero `genSt(k.ovr, id==='atk'?'S':'OH')`.
  2. La sede es la del ajuste: startDrill usa `venueNow()` y hace `unforceVenue()` (main.js:528/533). Un ejercicio de pista puede salir en la playa y al revés.
  3. No hay modo rápido para toda la semana ni plan del entrenador. Cada sesión se elige a mano, de 3 en 3.

====================================================================
3. EQUIPACIONES Y CÓMO DIBUJAR PETOS
====================================================================
Datos
- Club de playa: genClubs (career.js:376-386) da `kit:{shirt, accent, shorts, pattern: pick(r, PATTERNS)}`, con `PATTERNS=['diag','liso','franjas','rayas']` (:161).
- Club de pista: kit6(name, sh, s2, lb) (:1800-1802) da `{shirt, accent(2º color), shorts, pattern por hash, libero}`.
- Al juego llegan como `{kitShirt,kitAccent,kitShorts,kitPattern[,kitLibero]}` más `kit.rival`.

players.js
- mkKit(shirt,acc,sh,pat) (:109-116) devuelve `{base, top, accent, dark, trim, shorts, sole, band, pad, pattern, numFill}`.
- rivalPick (:119-132):
  - El rival viste su 1ª. Si choca (`kitDist<1.1`) y trae 'kitLibero' (pista), viste la 2ª: camiseta = kitAccent, `rk.alt`.
  - Si sigue chocando, `rk=null` y se usa la equipación de la CPU (CPU_KITS :87-90).
- kitFrom(st) (:137-143) es la vista previa del Vestuario.
- setKit(st) (:144-181):
  - Fija TEAMS[0] y TEAMS[1].
  - LIBC (líbero del club), los looks y la firma `sig` (:177).
  - Con un cambio, `flushCache()` reconstruye los atletas.
- liberoKit(team) (:222-246): usa el color del club si se distingue (≥0,8); si no, el mejor candidato de LIB_PAL. `pattern 'liso'`, `k.libero`.
- kitOf(p) (:248) da `p.role==='L' ? liberoKit : TEAMS[team]`.
- API (:4148-4179): setKit(st,g), kit(team), kitFrom, liberoColor, rivalKit(st) (devuelve kind '1a', '2a' o 'cpu') y kitColors.
- Prueba: tools/kittest.js (`node tools/kittest.js`) carga players.js en vm sin THREE. Comprueba el líbero del club y la 2ª del rival, más una huella de 400 casos sin kitLibero.

doll.js (pintura)
- Cada muñeco tiene una malla con piel y un atlas propio: ATLAS=512, PXK 2 o 1 (:216). Torso en las filas TR_R=[0,199], TR_SPLIT=142 (:353).
- paintBody(g,tc,L,numV,beach) (:395-447):
  - `pat = tc.libero ? 'liso' : tc.pattern||'diag'`.
  - Rama de playa con tirantes (:400-410): ignora el pattern.
  - Pabellón: 'diag' (tajo, :411-413), 'franjas' (:414), 'rayas' (:416).
  - Después: cuello, dorsales (:425-434), pantalón y paneles.
- Brazos y mangas: paintLimbs (:449), que usa tc.base y tc.accent.
- Firmas:
  - `TC_ATLAS = ['base','accent','dark','trim','shorts','pad','numFill','pattern','libero']`, que van al atlas.
  - `TC_GEO = ['base','accent','dark','shorts','pad','sole']`, que son colores por vértice y rehacen la malla (:184, geoSig :189, atlasSig :201).
- La cabecera de doll.js (:15-21) dice: «todo en la misma malla y el mismo atlas (cero dibujos y programas nuevos)».

Para dibujar PETOS sin draw calls nuevas (todo en el atlas)
- Opción mínima: un pattern nuevo 'peto' en paintBody.
  - Fondo = tc.base (camiseta de entreno, gris o color del club apagado).
  - Encima, el peto: paneles delante y detrás de color tc.accent (o un campo tc.bib) con los costados abiertos (franja de base visible en u≈0,25/0,75), cuello en V o redondo con ribete oscuro y dorsal grande del peto (numFill contrastado).
  - Si se usa un campo nuevo (tc.bib), hay que añadirlo a TC_ATLAS para que entre en atlasSig. Pasa lo mismo con la firma de setKit (`sig`, players.js:177), y kitFrom debe dejarlo pasar.
  - Las mangas siguen siendo la camiseta de entreno (paintLimbs con tc.base), que es el aspecto real de un peto encima de una camiseta.
  - El líbero fuerza 'liso' (`tc.libero`, :396 y liberoKit): en el partidillo conviene que el líbero también lleve peto, o forzar el pattern también en liberoKit.
- Playa: la rama `beach` ignora el pattern. Hay que añadir un peto sobre la camiseta de tirantes o una camiseta de tirantes de color liso.
- Los dos equipos del partidillo son del mismo club. Con `st.rival` = mismo club, rivalPick da `rk=null` y el rival vestiría la CPU.
  - Hace falta un modo explícito en setKit, por ejemplo `st.scrim = {bib0, bib1, base}` o `st.rival` con su propio `kitPattern:'peto'` y colores ya distintos (kitDist≥1,1), para que rivalPick lo acepte.
  - Ejemplos de colores del peto: naranja/amarillo fluor contra verde/azul.
  - kittest.js puede añadir casos de peto sin tocar la huella de 400 casos sin kitLibero.
- Coste: solo repintar el atlas, 0 dibujos y 0 programas.
  - Topes de perf.js: 6v6 media ≤350k triángulos y baja ≤45 dibujos.
  - Hay que verificarlo con `node tools/perf.js` y con el autotest de doll (VB.Doll.lookSelfTest, doll.js ~1866: paintAtlas con todos los ids).

====================================================================
4. PARTIDO CORTO Y NOTA INDIVIDUAL
====================================================================
- sim.js:
  - `SET_POINTS=[11,15,21,25]` (:236) y `setTarget(g)` = g.points; el 3r set va a `min(15, points)` (:238).
  - createGame: `points: beach ? 21 : SET_POINTS.indexOf(+opts.points)>=0 ? +opts.points : 25` (:299). En la playa siempre es a 21.
  - Fin del partido: `matchWon = setWon && g.sets[w] === 1` (:1993), así que siempre es al mejor de 3 (también en 6v6).
- No existe un partido a un solo set, ni «a N puntos», ni por tiempo.
  - En la pista ya vale `points:11` (se juega 11/11/11).
  - En la playa no hay forma de acortar el partido sin tocar la sim. Habría que añadir algo como `opts.sets:1` / `opts.short` con valor por defecto idéntico, para que la huella no cambie. Tocaría createGame (:299), setTarget (:238) y matchWon (:1993).
- Alternativa sin marcador: el ejercicio 'free' (peloteo libre: partido sin marcador, drillRep por punto; sim.js:2289-2297). No sirve como partidillo con resultado.
- El árbitro, el challenge y la presentación son opciones normales de createGame (ref, present). En el ejercicio son NOREF y sin challenge (sim.js:370).
- Nota: rating(me, r, rallies, kmul) (career.js:1134-1145).
  - `RATE_W = {kills:.055, aces:.2, blocks:.2, assists:.045, digs:.035, recvP:.03, perfect:.02, poor:-.015, errors:-.17}` (:1133).
  - `k = 40/max(24,rallies)*(kmul||1)`. En un partido de menos de 24 puntos la parte de estadísticas se escala como si fueran 24, así que penaliza un poco los partidillos muy cortos.
  - Resultado: 2-0 +0,9; 2-1 +0,6; 1-2 −0,3; 0-2 −0,6. Con 1 set, `[1,0]` cuenta como +0,9 y `[0,1]` como −0,3, porque solo mira `sets[1]===0` y `sets[0]===1`.
  - Techo suave por encima de 8,5.
- Pista:
  - `RATE6 = {OH:3.0, OPP:2.8, MB:3.4, S:2.0, L:4.0}` (:1678).
  - `NOTA_MIN_R=12` (:1705): por debajo de 12 puntos en pista no hay nota.
  - matchDone6 (:2737-2759) usa g.meR y g.rallyN de la sim (:3230/3279) y construye `part`.
- La cadena reutilizable para calificar la prueba con un partido real es ingest() + M.p[0] + rating().
  - Ejemplo de umbral: `pass = nota >= umbral(lvl)` o `nota + victoria`, que puede salir de `o.chance` / trialChance (media del jugador).
  - Hay que aislarlo de closeMine, que da XP, toca el entrenador y avanza la jornada.
  - Funciona sin g.career.mode especial, porque ingest solo pide g.career.

====================================================================
5. SISTEMA DE EJERCICIOS DE LA SIM
====================================================================
- `VB.DRILL` (sim.js:2060-2076): `hold:1.1`, `order:['serve','recv','set','atk','block','free']`.
- kinds:
  - serve: of 10, medals [12,18,24], 10 dianas.
  - recv: of 10, zone y r, medals [18,24,28], srvJump[] y jit.
  - set: of 10, medals [16,22,27].
  - atk: of 10, r 1.2, medals [12,18,23], 3 dianas, bloqueador desde la 6ª (blockFrom 5).
  - block: of 10, medals [6,11,16], sides[], net 2.
  - free: of 0.
- Hay 5 ejercicios con medallas. Cada repetición da 0-3 puntos y el máximo es 30 (VB.Gym.MAX).
- Textos: DRILL_TEXT (:2078).
- Funciones:
  - mkDrill (:2081).
  - drillStage (:2116), que monta la repetición y es pública.
  - drillIdle / drillJobs.
  - drillOnHit (:2237).
  - drillScore(kind,c) (:2189), pura y exportada (:3506).
  - drillPoint y drillFinish (:2268-2311), que emiten `drillRep {kind,n,of,pts,total,res,text,...}` y, en la última, `drillEnd {kind,total,reps,best}` con `d.done`.
- createGame({drill}) (sim.js:241-245):
  - dkp fuerza ctrl 'one' con el n.º 1, sin ayuda de primer partido y sin error arbitral.
  - Siempre 2v2.
- js/gym.js:
  - DRILLS (nombres), IDS y MEDALS (reserva igual que la sim).
  - XP [30,50,80] y record() → make-the-cut.gym más XP del escuadrón. La Carrera no lo usa.
  - medalsOf / medalOf.
- Ejercicios por puesto en la Carrera (SESS_BY, career.js:614):
  - OH: recv, atk, serve, block.
  - OPP: atk, block, serve.
  - MB: block, atk, serve.
  - S: set, serve, block.
  - L: recv, set.
  - Playa: atk (bloqueador): atk, block, serve, recv. cr (defensor): recv, set, serve, atk. uni: los 5.
- No hay ejercicios propios de 6v6 (pipe, primer tiempo, colocación a zona 2…). Todo es el gimnasio 2v2.

====================================================================
6. PRUEBAS AUTOMÁTICAS
====================================================================
- `node tools/careertest.js [temporadas=8]`: headless con vm y localStorage falso. Carga sim, prog, badges, leagues, career, career-life y career-world (:24). Acaba en «TODO OK».
  - Variantes: `NOWORLD=1` (sin career-world) y `LOOKJS=`.
  - Secciones clave:
    - :48 Inicio y prueba (las aserciones de la tirada de prueba están en :71-82 y habrá que adaptarlas).
    - :142 Partido jugado con eventos falsos: ingest, _M y matchDone (modelo de cómo probar un partidillo con eventos sintéticos).
    - :606/632 pista.
    - :1887 Sesiones de entrenamiento: límite, reinicio, rápido determinista, impresión y ME_EDGE.
- `node tools/gymtest.js [serve,recv,set,atk,block]`:
  - Parte 1 en vm (gym.js).
  - Partes 2-3 con Chrome vía tools/cdp.js (`?drill=<id>&gymauto=1&seed=7`). `NOCDP=1` las salta y `STRICT=1` las hace fallar si no se pueden correr.
  - No cubre startCareerDrill: no hay ninguna prueba de navegador del ejercicio de Carrera.
- `node tools/simtest.js [min=20] [seed] [minMatriz] [semillas]`:
  - Al final llama a fingerprint6 («huella 2v2 idéntica»).
  - `SIMTEST_ONLY=gym` es la sección del Gimnasio (E6).
  - `SIMTEST_MASTERY=1 SIMTEST_ONLY=matrix ...` es la matriz con maestría.
- `node tools/fingerprint6.js` compara con tools/fp-2v2.json. `--variant mastery` compara con fp-mastery.json.
  - Cualquier opción nueva de la sim (sets cortos) debe dejar estas huellas idénticas por defecto.
- `node tools/kittest.js` (equipaciones), `node tools/badgetest.js` y `node tools/abouttest.js` (versión y changelog).
- Navegador: `node tools/drive.js 1280 720 30`, `node tools/drive6.js 1280 720 60` (ROLE=, TOUCH=1), `bash tools/console.sh all` (EXTRA=format=6v6 / map=beach), `tools/perf.js` (topes de dibujos), `tools/shot.js <escena> W H out.png` y `tools/eval.js`.
- main.js tiene escenas de depuración de ejercicio (`drill_end`, :1373) útiles para capturas.

====================================================================
PUNTOS DE ENGANCHE RECOMENDADOS (resumen)
====================================================================
- Prueba con partidillo:
  1. career.js: añadir `trialSetup(c,i)` en BEACH y HALL. Podría reutilizar el núcleo de matchSetup/matchSetup6:
     - Atributos tuyos y del club de la prueba (o.mateP en playa; plantilla en pista).
     - Rival = otro grupo del mismo club.
     - `kit` y `rivalKit` con peto.
     - `career:{trial:true, mode, club:o.club, offer:i, ...}`.
     - points corto.
  2. Añadir `trialDone(i, res, g)`, que use ingest/M/rating y decida si apruebas (sin closeMine). Si apruebas, joinClub; si no, se quita la oferta (la lógica actual de :1471-1480).
  3. Fachada: `VB.Career.trialSetup` / `trialDone`. El despacho por modo es como drillDone (:3014).
  4. main.js: `ctx.actions.startCareerTrial(i)`, al estilo de startCareerMatch (:582).
     - careerEvents (:1072) debe desviar `g.career.trial` hacia trialDone.
     - careerEndSheet debe mostrar «Prueba superada» o «no superada».
     - toMenu debe volver a la fase pick.
     - restart y abandonar no deben consumir la prueba.
  5. career-ui.js: el botón 'offer' con trial (:1468) debe lanzar el partidillo, con una opción de «Simular la prueba» que conserve la tirada actual.
  6. players.js y doll.js: pattern 'peto' y un modo de partidillo en setKit (§3).
- Entrenos tipo EA FC / 2K: ampliar trainCard (career-ui.js:616) y sessDo/sessQuick (career.js:664-697) en vez de crear otro sistema:
  - Plan semanal: «Simular semana» = 3 sessQuick seguidas con los ejercicios propuestos por el entrenador según los puntos flojos (sessDrills ordena ya por puesto). Juntarlo con el enfoque semanal (TRAIN/trainWeek) para no duplicar.
  - Modo manual = el startCareerDrill de hoy.
  - En el ejercicio, forzar la sede de la Carrera (startDrill usa venueNow) y poner los petos de entreno en el ejercicio (drillSetup.kit, career.js:715).