import { GameState as GameStateLib, Phase, type Tile } from "@thegraid/hexlib";
import type { GamePlay } from "./game-play";
import type { PathCard } from "./path-card";
import { PathTable as Table } from "./path-table";
import type { PathTile } from "./path-tile";
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

  _tileDone?: PathTile = undefined;
  _cardDone?: PathCard = undefined;
  get tileDone() { return this._tileDone; }
  get cardDone() { return this._cardDone; }
  set tileDone(v) {
    this._tileDone = v;
    if (this.allDone) this.done();
  }
  set cardDone(v) {
    this._cardDone = v;
    this.table.cardBack.dim(!!v)
    if (this.allDone) this.done();
  }

  /**
   * test if tile is special
   * @param tile Tile or Card to compare to doneTile or doneCard;
   * @param card [false] false: check tileDone; true: check cardDone
   * @returns true if given tile/card is NOT the current tileDone/cardDone
   */
  notDoneTile(tile: Tile, card = false) {
    return (card
      ? (this.cardDone && tile !== this.cardDone)
      : (this.tileDone && tile !== this.tileDone))
  }

  get allDone() { return this.tileDone && this.cardDone }


  get panel() { return this.curPlayer.panel; }

  /** from Acquire, for reference; using base GameState for now */
  override readonly states: { [index: string]: Phase } = {
    BeginTurn: {
      start: () => {
        this.cardDone = this.tileDone = undefined;
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
        if (this.tileDone && this.cardDone) this.phase('EndTurn');
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
