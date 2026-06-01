import { GameState as GameStateLib, Phase, type Tile } from "@thegraid/hexlib";
import type { GamePlay } from "./game-play";
import type { TacticsCard } from "./tactics-card";
import { ChaosTable as Table } from "./chaos-table";
import type { ChaosTile } from "./chaos-tile";
import { Player } from "./player";

export type ActionIdent = 'Act0' | 'Act2';

export class GameState extends GameStateLib {
  declare gamePlay: GamePlay;

  constructor(gamePlay: GamePlay) {
    super(gamePlay)
    this.defineStates(this.states, false);
  }

   // this.gamePlay.curPlayer
  override get curPlayer() { return super.curPlayer as Player }
  override get table() { return super.table as Table }

  override parseState(gameState: any[]): void {
    return;
  }

  _tileDone?: ChaosTile = undefined;
  get tileDone() { return this._tileDone; }
  set tileDone(v) {
    this._tileDone = v;
    if (this.allDone) this.done();
  }

  /**
   * test if tile is special
   * @param tile Tile or Card to compare to doneTile or doneCard;
   * @returns true if given tile is NOT the current tileDone
   */
  notDoneTile(tile: Tile) {
    return ((this.tileDone && tile !== this.tileDone))
  }

  get allDone() { return this.tileDone }


  get panel() { return this.curPlayer.panel; }

  /** from Acquire, for reference; using base GameState for now */
  override readonly states: { [index: string]: Phase } = {
    BeginTurn: {
      start: () => {
        this.tileDone = undefined;
        this.gamePlay.saveGame();
        this.table.doneButton.activate()
        this.phase('ChooseAction');
      },
      done: () => {
        this.phase('ChooseAction');
      }
    },
    // ChooseAction:
    // if (allDone) phase(EndTurn)
    ChooseAction: {
      start: () => {
        if (this.tileDone) this.phase('EndTurn');
        this.doneButton(`End Turn`);
      },
      done: (ok = false) => {
        if (!ok && !this.allDone) {
          this.panel.areYouSure('You have an unused action.', () => {
            setTimeout(() => this.done(true), 50);
          }, () => {
            setTimeout(() => this.state.start(), 50);
          });
          return;
        }
        if (this.allDone || ok) this.phase('EndTurn');
      }
    },
    EndTurn: {
      start: () => {
        this.gamePlay.endTurn();
        this.phase('BeginTurn');
      },
    },
  }
}
