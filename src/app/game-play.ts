import { permute, stime } from "@thegraid/common-lib";
import { KeyBinder } from "@thegraid/easeljs-lib";
import { GamePlay as GamePlayLib, SetupElt, TP as TPLib } from "@thegraid/hexlib";
import type { HexMap2 } from "./chaos-hex";
import type { ChaosTable } from "./chaos-table";
import type { BONUS, ChaosTile, TERRAIN } from "./chaos-tile";
import type { Faction } from "./factions";
import { BgFound } from "./foundation";
import type { GameSetup } from "./game-setup";
import { GameState, type PlayerId } from "./game-state";
import { Relic } from "./meeples";
import type { Player } from "./player";
import { ScenarioParser } from "./scenario-parser";
import { priceNames, TP, type PriceName } from "./table-params";
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
  /** which faction priced the given Phase.
   * @param priceName includes MoveFirst & MoveLast
   */
  phasePricer(priceName: PriceName) {
   return this.gameState.phasePrices[priceName]?.facId;
  }

  // used during initial bringup
  autoSetPrices(ndx: PlayerId) {
    const plyr = this.allPlayers[ndx];
    const tokens = plyr.panel.priceTokens;
    const tokensInPlay = tokens.filter(pt => pt.status == 'inplay');
    if (tokensInPlay.length <= (TP.numPlayers == 2 ? 1 : 0)) {
      const token = tokens.filter(pt => pt.status == 'avail').sort((a, b) => b.vid - a.vid)[0];
      const prices = this.gameState.phasePrices;
      const priceIndex = (!prices.MoveLast) ? 5 : priceNames.findIndex(pn => !prices[pn])
      token.setTokenOnPhase(priceIndex);
      token.stage.update();
    }
    this.gameState.state.done!(ndx);
  }

  awardPriceBonuses() {
    this.gameState.phasePrices['Build']?.player.gemCounter.incValue(2);
    this.gameState.phasePrices['Recruit']?.player.coinCounter.incValue(2);
    this.gameState.phasePrices['MoveFirst']?.player.addCard();
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
      if (!this.phasePricer(priceName) && tndx < tokens.length) {
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
      const pt = this.gameState.phasePrices[pn];
      this.gameState.phasePrices[pn] = undefined;
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
  // Setup: Ciradian Base
  // Setup: place Relics on Foundations; player choice? [8/17]
  // Setup: layout FactionOnTile (v & ^) [8/20]
  // Setup: Rhyzu.setPlayer() & popup-card [8/28] (8/29)
  // Setup: Leader as: Icon_on_FoT, Card-on-Panel, Card-popup [9/1]
  // Setup: choose Leaders & starting Leader
  // Setup: place Leader & Fighters in Base (Fighters as Counter, leader w/clicktext [8/26])
  // Setup: place Leader on Map (on base Foundation Regions) -- manual
  // Setup: place Fighters on Map (on base Foundation Regions)
  // Setup/phase: show FlareGun indication on faction Panel [8/26]
  // SetPrices: Move --> FlareGun (gunPlayer) [8/26]
  // SetPrices: Recurit, Build, MoveLast --> Energy & Gem & Card [8/26]
  // Each Phase: start with Pricer (or Neutral --> gunPlayer) [8/26]
  // Each Phase: player to pay or pass; pay for auxillary
  // Discover: advancement bonus; give E,G,C; Move(3) R2;
  // Discover: present Production Tokens, allow selection & placement for Harvest(2); Build(1,3) Foundation
  // Discover: click to select Primary & Auxillary Research. (inc ResearchLevel)
  // Build: D&D a Foundation; D&D a Building; w/gemLocks
  // Harvest: click-to-Harvest (enable eligble Regions)
  // Recruit: click-to-Recruit (Oxataya: option to move Fighters to Strongholds)
  // Recruit: Aux: select/deploy (& pay gem) Leader
  // Move: select & show 'bridge' between src->dest Region.
  // Move: select warriors & Leaders, Drag to next Region.
  // Move: Aux: select Leader card to upgrade (& pay gem).
  // Combat: choose opponent; choose wheel, card; commit --> reveal, (Ochara!)
  // Combat: auto resolve, remove casualties/buildings, assign Fame (AI, Zcharo, JReyak, Oxataya)
  // Combat: GUI for Retreat/Redeploy
  // Income: choose E/C, E/%;
  // Income: compute/choose Region Count (AI, Circadian); enable Redeploy,
  // Income: Attribute Upgrade (various effects)
  // Income: Faction specific Income: Ley,
  // Relics: Win?; assign Relic do Bonus (Research, Upgrade-Circadian)
  // ... next round

  moveFaction(faction: Faction) {
    this.moveRegions = faction.player.regionSet;
    this.moveRegions.forEach(reg => {
      reg.getFoT(faction.player).moveShape.visible = true;
    })
    // TODO: D&D stuff for MoveShape
    // TODO: after 'done' find & clear all the MoveShape on all MapTile
    // start() -> saveState(player, phase); state.restart() -> restore state(player, phase)
  }
  /** regions with moveShape.visible */
  moveRegions!: ChaosTile[];

  unMoveFaction(faction: Faction) {
    this.moveRegions.forEach(reg => {
      reg.getFoT(faction.player).moveShape.visible = false;
    })
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
    // KeyBinder.keyBinder.setKey('C-z', () => this.undoCardDraw());
    KeyBinder.keyBinder.setKey('C-d', () => this.toggleBrake());
    // KeyBinder.keyBinder.setKey('w', () => table.dragTile?.rotateNext(-1))
    // KeyBinder.keyBinder.setKey('e', () => table.dragTile?.rotateNext( 1))
    KeyBinder.keyBinder.setKey('M-c', () => {
      const tp=TP, tpl=TPLib
      const scale = TP.cacheTiles
      table.reCacheTiles()}
    )
  }
}
