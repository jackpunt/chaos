import { stime } from "@thegraid/common-lib";
import { KeyBinder } from "@thegraid/easeljs-lib";
import { GamePlay as GamePlayLib, SetupElt, TP as TPLib } from "@thegraid/hexlib";
import type { HexMap2 } from "./chaos-hex";
import type { ChaosTable } from "./chaos-table";
import type { GameSetup } from "./game-setup";
import { GameState, priceNames, pricePhases, type PlayerId } from "./game-state";
import type { PricingToken } from "./meeples";
import type { Player } from "./player";
import { ScenarioParser } from "./scenario-parser";
import { TP } from "./table-params";


export class GamePlay extends GamePlayLib {
  neutralPlayer!: Player;
  neutralTokes: PricingToken[] = [];

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

  override startTurn() {
  }

  setPrice(ndx: PlayerId) {
    const plyr = this.allPlayers[ndx];
    const token = plyr.panel.priceTokens[4]; // TODO: the real thing.
    const priceIndex = priceNames.findIndex(pn => !this.gameState.phasePrices[pn])
    const phaseName = priceNames[priceIndex];
    console.log(stime(this, `.setPrice: ${plyr.Aname} w/${token.Aname} ->`), phaseName )
    token.moveTo(this.table.priceHex[priceIndex]);
    this.gameState.phasePrices[phaseName] = token;
    token.stage.update();
    token.status = 'inplay';
    this.gameState.state.done!(ndx);
  }

  setPriceNeutral() {
    pricePhases.forEach(p => {

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
