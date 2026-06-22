import { GameState as GameStateLib, type Phase } from "@thegraid/hexlib";
import type { ChaosTable as Table } from "./chaos-table";
import type { FactionId } from "./factions";
import type { GamePlay } from "./game-play";
import type { PricingToken } from "./meeples";
import type { Player } from "./player";

export const phaseNames = ['SetPrices', 'Discovery', 'Build', 'Harvest', 'Recruit', 'Move', 'Combat', 'Income', 'Relics'] as const;
export type PhaseName = typeof phaseNames[number];
export const priceNames = ['Discovery', 'Build', 'Harvest', 'Recruit', 'MoveFirst', 'MoveLast'] as const;
export type PriceName = typeof priceNames[number];
export const pricePhases = ['Discovery', 'Build', 'Harvest', 'Recruit', 'Move'] as const;
export type PricePhases = typeof pricePhases[number];

// Never stop/state a END of a phase, always proceed to next Phase, so curPlayer is the next to take Action.
type SaveState = [ phase: Phase, cpndx: FactionId, prices: PricingToken[] ];

/** same cardinality as FactionId, but is index into allPlayers[pid] */
export type PlayerId = FactionId;


export class GameState extends GameStateLib {
  declare gamePlay: GamePlay;

  nPlayers: number = 2;

  _gunPlayer!: Player;
  /** Player currently with the FlareGun. */
  get gunPlayer() { return this._gunPlayer }
  set gunPlayer(plyr: Player) { this._gunPlayer = plyr }

  /** initiator for this Phase */
  phaseNdx: PlayerId = 0;

  /** (ndx+1) mod nPlayers */
  nextNdx(ndx = 0) {
    return (ndx + 1) % this.nPlayers
  }

  phasePrices: Partial<Record<PriceName, PricingToken>> = {};

  constructor(gamePlay: GamePlay) {
    super(gamePlay)
    this.defineStates(this.states, false);
  }

  override start(startPhase?: string, startArgs?: any[]): void {
    this.nPlayers = this.gamePlay.allPlayers.length;
    super.start(startPhase, startArgs);
  }

  override startPhase = 'BeginRound';

  // this.gamePlay.curPlayer
  override get curPlayer() { return super.curPlayer as Player }
  override get table() { return super.table as Table }

  override saveState() {
    return []; // hexlib expects any tuple or array
  }
  override parseState(gameState: any[]): void {
    return;
  }

  yesDone = () => { setTimeout(() => this.done(true), 50); }
  reStart = () => { setTimeout(() => this.state.start(), 50); }

  // confirmation that player is really 'done' with their Action
  get allDone() { return true; }  // TODO: count recruits? counts moves?


  get panel() { return this.curPlayer.panel; }

  /** define this.states */
  override readonly states: { [index: string]: Phase } = {
    BeginRound: {
      start: () => {
        this.gamePlay.saveGame();
        this.doneButton('Begin Round');
        // this.table.doneButton.activate()
        // this.phase('SetPrices');
      },
      done: () => {
        this.phase('SetPrices', 0);
      }
    },

    SetPrices: {
      start: (ndx: PlayerId) => {
        this.gamePlay.setPrice(ndx);
      },
      done: (ndx: number) => {
        const next = this.nextNdx(ndx);
        if (next !== this.phaseNdx) this.state.start(next); // loop for each player
        if (this.nPlayers < pricePhases.length) this.gamePlay.setPriceNeutral();
        this.phase('Discovery');
      }
    },
    Discovery: {
      start: () => {
        this.doneButton('Discover');
       },
      done: () => { this.phase('Build'); }
    },
    Build: {
      start: () => {
        this.doneButton('Build');
       },
      done: () => { this.phase('Harvest'); }
    },
    Harvest: {
      start: () => {
        this.doneButton('Harvest');
      },
      done: () => { this.phase('Recruit'); }
    },
    Recruit: {
      start: () => {
        this.doneButton('Recruit');
       },
      done: () => { this.phase('Move'); }
    },
    Move: {
      start: () => {
        this.doneButton('Move');
       },
      done: () => { this.phase('Combat'); }
    },
    Combat: {
      start: () => {
        this.doneButton('Battle');
       },
      done: () => { this.phase('Income'); }
    },
    Income: {
      start: () => {
        this.doneButton('Income');
      },
      done: () => { this.phase('Relics'); }
    },
    Relics: {
      start: () => {
        this.doneButton('Relics');
      },
      done: () => { this.phase('BeginRound'); }
    },


    // ChooseAction:
    // if (allDone) phase(EndTurn)
    ChooseAction: {
      start: () => {
        this.doneButton(`End Turn`);
      },
      done: (ok = false) => {
        if (!ok && !this.allDone) {
          this.panel.areYouSure('You have an unused action.', this.yesDone, this.reStart);
          return;
        }
        if (this.allDone || ok) this.phase('EndTurn');
      }
    },
    EndTurn: {
      start: () => {
        this.gamePlay.endTurn();
        this.phase('BeginRound');
      },
    },
  }
}
