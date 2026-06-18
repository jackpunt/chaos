import { stime } from "@thegraid/common-lib";
import { KeyBinder } from "@thegraid/easeljs-lib";
import { GamePlay as GamePlayLib, Scenario, TP as TPLib } from "@thegraid/hexlib";
import type { HexMap2 } from "./chaos-hex";
import type { ChaosTable } from "./chaos-table";
import type { GameSetup } from "./game-setup";
import { GameState } from "./game-state";
import type { Player } from "./player";
import { ScenarioParser } from "./scenario-parser";
import { TP } from "./table-params";


export class GamePlay extends GamePlayLib {
  constructor (gameSetup: GameSetup, scenario: Scenario) {
    super(gameSetup, scenario);
  }
  override readonly gameState: GameState = new GameState(this);
  declare gameSetup: GameSetup;
  declare hexMap: HexMap2;
  declare table: ChaosTable;

  override get allPlayers() { return super.allPlayers as Player[] }

  override get curPlayer() { return super.curPlayer as Player; }
  override set curPlayer(plyr: Player) { this._curPlayer = plyr; } // proforma, must reassert the setter!

  override startTurn() {
  }

  /** parseScenario() makes a new ScenarioParser for each invocation */
  override makeScenarioParser(hexMap = this.hexMap): ScenarioParser {
    return new ScenarioParser(hexMap, this);
  }

  // Demo from Acquire to draw some tiles:
  playerDone() {
    const plyr = this.curPlayer;
    plyr.gamePlay.hexMap.update(); // TODO: this.playerDone(ev)
  }

  // during setNextPlayer; if we need to highlight something...
  override paintForPlayer(): void {
    // if (!ChaosTile.source?.sourceHexUnit) ChaosTile.source.nextUnit();
    // ChaosTile.source.sourceHexUnit?.setPlayerAndPaint(this.curPlayer);
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
