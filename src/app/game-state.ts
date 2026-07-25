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
export type PricePhase = typeof pricePhases[number];

// Never stop/state a END of a phase, always proceed to next Phase, so curPlayer is the next to take Action.
type SaveState = [ phase: Phase, cpndx: FactionId, prices: PricingToken[] ];

/** same cardinality as FactionId, but is index into allPlayers[pid]; represents Table Order! */
export type PlayerId = FactionId;


export class GameState extends GameStateLib {
  declare gamePlay: GamePlay;

  nPlayers: number = 2;

  _gunPlayer!: Player;
  /** Player currently with the FlareGun. */
  get gunPlayer() { return this._gunPlayer }
  set gunPlayer(plyr: Player) { this._gunPlayer = plyr }

  _round = 1;
  get roundNum() {
    return this._round;
  }
  nextRound() {
    this._round += 1;  // TODO -- other things.
  }

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
    this.gunPlayer = this.gamePlay.initialGunPlayer;
    super.start(startPhase, startArgs);
  }

  override startPhase = 'BeginRound';
  override startArgs: any[] = [1];

  // this.gamePlay.curPlayer
  override get curPlayer() { return super.curPlayer as Player }
  override get table() { return super.table as Table }

  // Oops: integrate with type SaveState above
  override saveState() {
    return [this.roundNum, this.state?.Aname, ]; // hexlib expects any tuple or array; TODO: include _round
  }
  override parseState(gameState: any[]): void {
    const [roundNum, stateName, args] = gameState;
    this._round = roundNum ?? 0;
    this.phase(stateName ?? this.startPhase, args ?? this.startArgs);
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
        this.doneButton(`Begin Round: ${this.roundNum}`);
        // this.table.doneButton.activate()
        // this.phase('SetPrices');
      },
      done: () => {
        this.phaseNdx = this.gunPlayer.index;     // SetPrices will change the gunPlayer!
        this.phase('SetPrices', this.gunPlayer.index);
      }
    },

    SetPrices: {
      start: (ndx: PlayerId) => {
        this.gamePlay.setPrice(ndx);
      },
      done: (ndx: number) => {
        const next = this.nextNdx(ndx);
        if (next !== this.phaseNdx) {
          this.state.start(next); // loop for each player
          return;
        }
        const openSlots = priceNames.filter(pn => !this.phasePrices[pn]).length; // HACK! Move has 2 slots...
        if (openSlots > this.nPlayers) {
          this.state.start(this.gunPlayer.index);     // restart with original gunPlayer when nPlayers == 2
          return;
        }
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
      done: () => { this.phase('BeginRound', this.roundNum); }
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
