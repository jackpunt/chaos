import { stime } from "@thegraid/common-lib";
import { KeyBinder } from "@thegraid/easeljs-lib";
import { GamePlay as GamePlayLib, SetupElt, TP as TPLib } from "@thegraid/hexlib";
import type { HexMap2 } from "./chaos-hex";
import type { ChaosTable } from "./chaos-table";
import type { GameSetup } from "./game-setup";
import { GameState, priceNames, type PlayerId, type PriceName } from "./game-state";
import type { Player } from "./player";
import { ScenarioParser } from "./scenario-parser";
import { TP } from "./table-params";


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

  get initialGunPlayer() {
    const gunPlayer = this._allPlayers.slice().sort((a, b) => a.panel.factionId - b.panel.factionId)[0];
    return gunPlayer;
  }

  override startTurn() {
  }
  /** which faction priced the given Phase.
   * @param priceName includes MoveFirst & MoveLast
   */
  phasePricer(priceName: PriceName) {
   return this.gameState.phasePrices[priceName]?.facId;
  }

  setPrice(ndx: PlayerId) {
    const plyr = this.allPlayers[ndx]; // TODO: notify player & wait for callback
    const token = plyr.panel.priceTokens.filter(pt => !pt.onPhase).sort((a, b) => b.vid - a.vid)[0];
    const prices = this.gameState.phasePrices;
    const priceIndex = (!prices.MoveLast) ? 5 : priceNames.findIndex(pn => !prices[pn])
    token.setTokenOnPhase(priceIndex);
    token.stage.update();
    this.gameState.state.done!(ndx);
  }

  setPriceNeutral() {
    const plyr = this.neutralPlayer;
    plyr.panel.priceTokens; // [5,3] or [5,4,3,2]
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

  /** parseScenario() makes a new ScenarioParser for each invocation */
  override makeScenarioParser(hexMap = this.hexMap): ScenarioParser {
    return new ScenarioParser(hexMap, this);
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
