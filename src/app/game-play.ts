import { permute, stime } from "@thegraid/common-lib";
import { KeyBinder } from "@thegraid/easeljs-lib";
import { GamePlay as GamePlayLib, SetupElt, TP as TPLib } from "@thegraid/hexlib";
import type { HexMap2 } from "./chaos-hex";
import type { ChaosTable } from "./chaos-table";
import { MoveInPlay, PairTarget, type BONUS, type ChaosTile, type TERRAIN } from "./chaos-tile";
import type { Faction, FactionId } from "./factions";
import { BgFound } from "./foundation";
import type { GameSetup } from "./game-setup";
import { GameState, type PlayerId } from "./game-state";
import { Relic } from "./meeples";
import type { Player } from "./player";
import { ScenarioParser } from "./scenario-parser";
import { priceNames, TP, type CB } from "./table-params";
import type { TacticsCard } from "./tactics-card";


type Wheel = string;  // TBD: define names for the wheel slots
type BattleStat = { plyr: Player, wheel: Wheel, card: TacticsCard }
/** a Region in conflict and 2 contestant Player */
export class Battle {
  region!: ChaosTile;
  stat1!: BattleStat;
  stat2!: BattleStat;
}

export class GamePlay extends GamePlayLib {
  neutralPlayer!: Player;

  declare _allPlayers: Player[]

  constructor (gameSetup: GameSetup, scenario: SetupElt) {
    super(gameSetup, scenario);
  }
  override readonly gameState: GameState = new GameState(this);
  declare gameSetup: GameSetup;
  declare hexMap: HexMap2;
  declare table: ChaosTable;

  /** Players in table order; the order they were created. */
  override get allPlayers() { return super.allPlayers as Player[] }
  playerByFacId(facId: FactionId) {
    return this.allPlayers.find(plyr => (plyr.facId == facId))
  }

  override get curPlayer() { return super.curPlayer as Player; }
  override set curPlayer(plyr: Player) { this._curPlayer = plyr; } // proforma, must reassert the setter!

  /** highligh panel of curPlayer: */
  override setCurPlayer(player: Player): void {
    this.curPlayer?.panel?.showPlayer(false);
    super.setCurPlayer(player);
    this.curPlayer?.panel?.showPlayer(true);
  }

  override startTurn() {
  }

  get pairTargets() { return PairTarget.targets }

  /** placeBase or MoveInPlay */
  removeTargets() {
    this.pairTargets.forEach(pt => pt.parent?.removeChild(pt));
    this.pairTargets.length = 0;
  }

  // used during initial bringup: Faction chooses a PricePhase
  autoSetPrices(ndx: PlayerId) {
    const plyr = this.allPlayers[ndx];
    const tokens = plyr.panel.priceTokens;
    const tokensInPlay = tokens.filter(pt => pt.status == 'inplay');
    if (tokensInPlay.length <= (TP.numPlayers == 2 ? 1 : 0)) {
      const token = tokens.filter(pt => pt.status == 'avail').sort((a, b) => b.vid - a.vid)[0];
      const tokenOnPhase = this.gameState.tokenOnPhase;
      // choose MoveLast, Disc, Recruit, Build, Harvest (not optimal)
      const priceIndex = [5, 0, 3, 1, 2].find(ndx => !tokenOnPhase[priceNames[ndx]])!
      token.setTokenOnPhase(priceIndex);
      token.stage.update();
    }
    this.gameState.state.done!(ndx);
  }

  awardPriceBonuses() {
    this.gameState.tokenOnPhase['Build']?.player.gemCounter.incValue(1);
    this.gameState.tokenOnPhase['Recruit']?.player.coinCounter.incValue(2);
    this.gameState.tokenOnPhase['MoveFirst']?.player.gainCard();
  }

  setPriceNeutral() {
    const plyr = this.neutralPlayer;
    // plyr.panel.priceTokens; // [5,3] or [5,4,3,2]
    const p2a = [3], p2b = [5], p3a = [2, 4], p3b = [3, 4], p3c = [4, 5], p4a = [3], p4b = [5];
    // vs looking for a special attribute on the token:
    const plan = [[p2a, p2a, p2a, p2a, p2b, p2b], [p3a, p3a, p3b, p3b, p3c, p3c], [p4a, p4a, p4a, p4a, p4b, p4b]];
    const np2 = TP.numPlayers - 2, rn = this.gameState.roundNum;
    const tokens = plan[np2][rn];   // use 2 tokens when np == 3
    let tndx = 0;
    priceNames.forEach((priceName, ndx) => {
      if (this.gameState.priceToken(priceName) == undefined && tndx < tokens.length) {
        const tid = tokens[tndx++];   // assert: will never get to MoveLast
        const token = this.neutralPlayer.panel.priceTokens.find(pt => pt && pt.vid == tid)!;
        token.setTokenOnPhase(ndx);
      }
    })
  }

  /** end of SetPricing; cleanup */
  movePendingToAvail() {
    this.allPlayers.forEach(plyr => {
      plyr.panel.priceTokens.forEach(pt => {
        if (pt.status == 'pending') pt.status = 'avail';
      })
    })
  }

  moveInPlayToInVault() {
    priceNames.forEach(pn => {
      const pt = this.gameState.tokenOnPhase[pn];
      this.gameState.tokenOnPhase[pn] = undefined;
      if (!pt) return;
      pt.status = 'invault';
      pt.moveToVault();
    })
  }

  /** parseScenario() makes a new ScenarioParser for each invocation */
  override makeScenarioParser(hexMap = this.hexMap): ScenarioParser {
    return new ScenarioParser(hexMap, this);
  }
  // Note: at this point foundations[1] indicates 'ctile has a Relic OR baseFoundation'
  placeInitialRelics() {
    const map = this.hexMap;
    const relics = Relic.allRelics.filter(rel => !rel.foundation.onTile);
    const terr: TERRAIN[] = ['Hills', 'Swamp', 'Plains'];
    const hexes = map.filterEachHex(hex => terr.includes(hex.ctile?.terrain ?? 'Mtn') && (!hex.ctile!.foundations[1]) )
    permute(hexes);
    const empty = permute(['E2', 'G1', 'C'] as BONUS[]).map(b => new BgFound(`noR_${b}`, b));
    hexes.forEach(hex => {
      const relic = relics.pop();
      if (relic) {
        relic.placeRelic(hex);
      } else {
        hex.ctile?.addFoundation(empty.pop()!, true);
      }
    })
  }

  // TODO:
  // General: TacticsCard.onScreenRadius: use static makeShape()
  // General: MoveIcon mis-clicks?
  // General: AI moving to swamp through Mtn!
  // General: Ctl-click to show upgrade (Leaer & Attribute)
  // General: doImmediate ('L') ('U') Recruit:, Move:
  // General: show Circadian Ship: +2F, +1D;
  // Setup: Circadian Base [~done]
  // Setup: place Relics on Foundations; player choice? [8/17]
  // Setup: layout FactionOnTile (v & ^) [8/20]
  // Setup: Rhyzu.setPlayer() & popup-card [8/28] (8/29)
  // Setup: Leader as: Icon_on_FoT, Card-on-Panel, Card-popup [9/1]
  // Setup: choose Leaders & starting Leader 'DeployLeaders' [10/1]
  // Setup: place Leader on Map (on base Foundation Regions) -- manual [10/1]
  // Setup: place Fighters on Map (on base Foundation Regions) [10/1]
  // Setup: place Leader & Fighters in Base (Fighters as Counter, leader w/clicktext [8/26])
  // Setup/phase: show FlareGun indication on faction Panel [8/26]
  // SetPrices: Move --> FlareGun (gunPlayer) [8/26]
  // SetPrices: Recruit, Build, MoveLast --> Energy & Gem & Card [8/26]
  // SetPrices: JRayek: mark & recruit Rhyzu; assign Player & place on map
  // SetPrices: logic to place & show Rhyzu.Token when Rhyzu is recruited/onMap/assigned to Player
  // Each Phase: start with Pricer (or Neutral --> gunPlayer) [8/26]
  // Each Phase: player to pay or pass; pay for auxillary [~9/23]
  // Setup: display Production Tokens [10/1]
  // Discover: advancement bonus; give E,G,C; Move(3) R2; doImmediate: [10/1]
  // Discover: present Production Tokens, allow selection & placement for Harvest(2); Build(1,3) Foundation [10/1]
  // Discover: click to select Primary & Auxillary Research. (inc ResearchLevel) [~9/28]
  // Build: D&D a Foundation; D&D a Building; [~9/29] w/gemLocks
  // Harvest: click-to-Harvest (enable eligble Regions) E, G, C, R, %, etc (ProdToken) [~9/29]
  // Harvest: highlight harvestable ProdTokens [10/4]
  // Harvest: Circadians Harvest from Ship
  // Recruit: click-to-Recruit [done] (Oxataya: option to move Fighters to Strongholds)
  // Recruit: Aux: select/deploy (& pay gem) Leader: doImmediate('L')
  // Move: offerPrimaryAndAux() [10/6]
  // Move: select & show 'bridge' between src->dest Region. [9/16]
  // Move: select Fighters & Leaders, Drag to next Region. Fighters[9/16]
  // Move: delete moveInPlay when incr --> 0 (conservation of MovePoints) [~done]
  // Move: hack so swamps are adjacent for Leyrein: TeleGraphic [9/21]
  // Move: Aux: select Leader card to upgrade (& pay gem). [10/6]
  // Move: doImmediate('U')
  // Combat: choose opponent; choose wheel, card; commit --> reveal, (Ochara!)
  // Combat: auto resolve, remove casualties/buildings, assign Fame (AI, Zcharo, JReyak, Oxataya)
  // Combat: GUI for Retreat/Redeploy
  // Income: choose E/C, E/%;
  // Income: compute/choose Region Count (AI, Circadian); enable Redeploy,
  // Income: Attribute Upgrade (various effects)
  // Income: Faction specific Income: Ley,
  // Relics: Win?; assign Relic do Bonus (Research, Upgrade-Circadian)
  // ... next round

  /** move points from 'Move' action, for the given Faction, from ResearchLevel of Phase 'Move' */
  mpForFaction(faction: Faction) {
    const level = faction.researchLevelOfPhase['Move'].level;
    return [2, 3, 4, 5, 6][level];
  }
  /** Faction's turn to Move, with nMove movepoints */
  moveFaction(faction: Faction, nMove = this.mpForFaction(faction)) {
    this.movePoints = nMove;
    this.movePlayer = faction.player;
    const baseTile = faction.player.panel.baseTile;
    baseTile.moveCounter.value = (nMove);
    baseTile.moveCounter.visible = true;
    // set visibity on fot.moveIcon & fot.fighterIcon; set pre-Move state
    faction.player.presence.forEach(fot => { fot.setFighterVis(); fot.setPreMove(); });
    console.log(stime(this, `.moveFaction(n=${nMove}): preFighters=`), faction.player.presence.map(fot => fot.preFighters));
    baseTile.stage.update();
    // TODO: D&D stuff for MoveShape [8/12]
    // TODO: after 'done' find & clear all the MoveShape on all MapTile [8/12]
    // start() -> saveState(player, phase); state.restart() -> restore state(player, phase)
    // TODO: create "bridge" [srcTile, toRegion] with counter
    // TODO: more in chaos-tile.MoveShape
  }

  /** player currently enabled to Move (not always curPlayer!) controls visibility of MoveIcon & (fighters == 0) */
  movePlayer?: Player;
  movePoints = 0;

  /** endMove phase: erase movesInPlay, set FoT.fighterCounter vis */
  endMoveFaction() {
    if (!this.movePlayer) return;
    const faction = this.movePlayer.faction;
    this.movePlayer.movesInPlay.length = 0;
    this.movePlayer = undefined;
    const moveCounter = faction.player.panel.baseTile.moveCounter;
    moveCounter.value = 0;
    moveCounter.visible = false;
    if (faction.facId == 3) {
      const tgOfTile = MoveInPlay.teleGraphics
      const fotPres = faction.player.fotPresence;
      fotPres.forEach(fot => {
        // Leyrien: for each potential fHex.ctile, remove & delete any TeleGraphics
        tgOfTile.get(fot.tile)?.forEach(tg => tg.parent.removeChild(tg));
        tgOfTile.delete(fot.tile)
      })
    }
    faction.player.setAllFighterVis(); // touch all FoT, setting visibility
    this.removeTargets(); // remove all MoveInPlay
  }

  /** undo, stop and re-start moveFaction() */
  resetMove() {
    if (!this.movePlayer) return;
    const faction = this.movePlayer.faction
    this.movePlayer.fotPresence.forEach(fot => fot.resetMove());
    this.endMoveFaction();
    this.moveFaction(faction, this.movePoints);
    // this.movePlayer = faction.player;
    this.table.stage.update();
  }

  findBattles(pid: PlayerId) {
    return [] as Battle[];
  }

  brake = false; // for debugger
  /** for conditional breakpoints while dragging; inject into any object. */
  toggleBrake() {
    const brake = (this.brake = !this.brake);
    ;(this.table as any)['brake'] = brake;
    ;(this.hexMap.mapCont.markCont as any)['brake'] = brake;
    console.log(stime(this, `.toggleBreak:`), brake)
  }

  override bindKeys(): void {
    super.bindKeys();
    const table = this.table;
    KeyBinder.keyBinder.setKey('C-d', () => this.toggleBrake());
    KeyBinder.keyBinder.setKey('r', () => this.resetMove())
    KeyBinder.keyBinder.setKey('M-c', () => {
      const tp=TP, tpl=TPLib
      const scale = TP.cacheTiles
      table.reCacheTiles()}
    )
    KeyBinder.keyBinder.setKey('R', () => this.curPlayer.faction.offerRecruit(2, ()=>{}))
    KeyBinder.keyBinder.setKey('H', () => this.curPlayer.faction.offerHarvestActions(2, ()=>{}))
  }
}
