import { arrayN, C, stime } from "@thegraid/common-lib";
import { GameState as GameStateLib, TP, type Phase } from "@thegraid/hexlib";
import type { ChaosTable as Table } from "./chaos-table";
import { factionNames, type FactionId } from "./factions";
import type { Battle, GamePlay } from "./game-play";
import { Relic, type PriceToken } from "./meeples";
import type { Player } from "./player";
import { pentagon, priceNames, pricePhases, type PhaseName, type PriceName } from "./table-params";


// Never stop/state a END of a phase, always proceed to next Phase, so curPlayer is the next to take Action.
type SaveState = [ phase: Phase, cpndx: FactionId, prices: PriceToken[] ];

/** 0 -- maxPlayers; is index into allPlayers[pid]; represents Table Order! */
export type PlayerId = 0 | 1 | 2 | 3 | 4; // index into allPlayers


export class GameState extends GameStateLib {
  declare gamePlay: GamePlay;

  nPlayers: number = 2;

  gunIcon = pentagon(TP.hexRad * .4, TP.hexRad * .4, C.coinGold, 180, C.BLACK);
  _gunPlayer!: Player;
  /** Player currently with the FlareGun. */
  get gunPlayer() { return this._gunPlayer }
  set gunPlayer(plyr: Player) {
    this._gunPlayer = plyr;
    plyr.panel.moveToWH(this.gunIcon, 2, 2)
    plyr.panel.stage.update();
  }

  // presumably this highlights the proper Faction/Panel
  setCurPlayerNdx(ndx = this.gunPlayer.index) {
    this.gamePlay.setCurPlayer(this.gamePlay.allPlayers[ndx]);
    return ndx;
  }
  get curPlayerNdx () {
    return this.curPlayer.index;
  }

  _round = 1;
  get roundNum() {
    return this._round;
  }
  nextRound() {
    this._round += 1;  // TODO -- other things.
  }

  /** initiator for this Phase */
  phaseNdx: PlayerId = 0;

  /** Table Order: (ndx+1) mod nPlayers */
  nextNdx(ndx = 0, dn = 1) {
    return (ndx + dn) % this.nPlayers as PlayerId;
  }

  /** if this PlayerId has no Battles, then we are done. */
  lastBattleInitiator?: PlayerId;

  /**
   * find player of faction preceeding pid in vault order.
   * @param pid player index; [-1] to start, and consider Oxataya
   */
  vaultPlayerBeforePid(pid = -1) {
    const pfac = this.gamePlay.allPlayers[pid]?.facId ?? this.playerByFacId.length; // previous faction index
    const nfac =  arrayN(pfac).reverse().find(facId => this.playerByFacId[facId] !== undefined)
    return (nfac == undefined) ? nfac : this.playerByFacId[nfac];
  }

  /** simple map from facId to Player */
  playerByFacId: (Player|undefined)[] = [];

  phasePrices: Partial<Record<PriceName, PriceToken>> = {};

  constructor(gamePlay: GamePlay) {
    super(gamePlay)
    this.defineStates(this.states, false);
    this.table.overlayCont.addChild(this.gunIcon);
  }

  override start(startPhase?: string, startArgs?: any[]): void {
    this.nPlayers = this.gamePlay.allPlayers.length;
    this.playerByFacId = factionNames.map((fn, facId) => this.gamePlay.allPlayers.find(plyr => (plyr.facId == facId)))
    this.gunPlayer = this.playerByFacId.find(plyr => plyr !== undefined)!;
    super.start(startPhase, startArgs);
  }

  override startPhase = 'PlaceBase';
  override startArgs: any[] = [];

  // this.gamePlay.curPlayer
  override get curPlayer() { return super.curPlayer as Player }
  override get table() { return super.table as Table }

  firstMover() {
    const mfId = (this.gamePlay.phasePricer('MoveFirst'));
    const mlId = (this.gamePlay.phasePricer('MoveLast'));
    return (mfId !== undefined) ? mfId : this.nextNdx(mlId);
  }

  /** (phasePricer or gunPlayer).index */
  phaseLeader(phase: PhaseName) {
    // facId: "SetPrices" "Combat", "Income", "Relic" --> gunPlayer
    const facId = (phase == "Move") ? this.firstMover() : this.gamePlay.phasePricer(phase as PriceName);
    const plyr = this.playerByFacId[facId!] ?? this.gunPlayer;

    console.log(stime(this, `.phaseLeader: ${phase} --> ${plyr.index}: ${plyr.facName}`));
    this.setCurPlayerNdx(plyr.index);
    return this.curPlayer.index; // Assert: == plyr.index
  }

  // Record phaseLeader: set phaseNdx before invoking super.phase()
  override phase(phase: string, ...args: any[]): void {
    this.phaseNdx = this.phaseLeader(phase as PhaseName)
    super.phase(phase, ...args);
  }

  /** start(nextNdx) or phase(nextPhase, args) */
  startOrPhase(nextPhase: PhaseName | string, ...args: any[]) {
    const next = this.nextNdx(this.curPlayerNdx);
    if (next !== this.phaseNdx) {
      this.state.start(next); // loop for each player
      return;
    }
    this.phase(nextPhase, ...args);
  }

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
    PlaceBase: {
      // start(-1) ==> consider from Oxataya
      start: (pid = -1) => {         // and look backward from there
        const plyr = this.vaultPlayerBeforePid(pid)!; // last player in vault list, before pid (highest facId)
        if (plyr) {
          this.setCurPlayerNdx(plyr.index);
          this.doneButton(`PlaceBase: ${plyr.facName}`);
        } else {
          this.gunPlayer = this.gamePlay.allPlayers[pid];  // last to place Base is first with the Gun.
          this.phase('PlaceRelic');
        }
      },
      // done(this.player.index)
      done: (pid = this.curPlayer.index) => {
        this.state.start(pid); // loop for each player
      }
    },
    // In reverse table order, place a Relic on Region not adjacent to Factions starting foundations (>2-Moves from Base)
    PlaceRelic: {
      start: (index = TP.numPlayers) => {
        if (index > 0) {
          this.setCurPlayerNdx(index - 1 as PlayerId);
          this.doneButton(`PlaceRelic: ${this.curPlayer.facName}`);
        } else {
          this.gamePlay.placeInitialRelics();
          this.phase('BeginRound', 1); // begin with Round = 1
        }
      },
      done: (pid = this.curPlayer.index) => {
        this.state.start(pid); // loop for each player
      }
    },


    BeginRound: {
      // start(1)
      start: (round = this.roundNum) => {
        this._round = round;   // 'PlaceBase' & 'Relics' invoke with new roundNum
        this.gamePlay.saveGame();
        this.doneButton(`Begin Round: ${this.roundNum}`); // activate
      },
      done: () => {
        Relic.allRelics[0].toMapScale(true);
        this.phase('SetPrices');   // SetPrices will change the gunPlayer!
      }
    },

    // start(this.phaseNdx)
    SetPrices: {
      start: (ndx = this.phaseNdx) => {
        console.log(stime(this, `SetPrices.start: ndx=${ndx}`))
        this.setCurPlayerNdx(ndx);
        this.doneButton(`${this.state.Aname}: ${this.curPlayer.facName}`);
        // PriceToken.dropFunc()
      },
      done: () => {
        const next = this.nextNdx(this.curPlayerNdx);
        if (next !== this.phaseNdx) {
          this.state.start(next); // loop for each player
          return;
        }
        // this code block so SetPrices is run twice when only 2-Players
        const openSlots = priceNames.filter(pn => !this.phasePrices[pn]).length; // HACK! Move has 2 slots...
        if (openSlots > this.nPlayers) {
          this.state.start(this.phaseNdx);     // restart with original gunPlayer when nPlayers == 2
          return;
        }

        this.gamePlay.awardPriceBonuses();
        if (this.nPlayers < pricePhases.length) this.gamePlay.setPriceNeutral();
        this.gamePlay.movePendingToAvail();
        this.phase('Discovery');
      }
    },
    Discovery: {
      start: (ndx = this.phaseNdx) => {
        this.setCurPlayerNdx(ndx);
        this.doneButton(this.state.Aname);
        // click on ResearchCell --> done()
        // maybe buy auxilary (% or C)
      },
      // done: (ndx = this.curPlayerNdx) ??
      done: () => this.startOrPhase('Build'),
    },
    Build: {
      start: (ndx = this.phaseNdx) => {
        this.setCurPlayerNdx(ndx);
        this.doneButton(this.state.Aname);
        // for each Build point: D&D a Building or Foundation --> done()
        // maybe buy a aux Build | Card
      },
      done: () => this.startOrPhase('Harvest'),
    },
    Harvest: {
      start: (ndx = this.phaseNdx) => {
        this.setCurPlayerNdx(ndx);
        this.doneButton('Harvest');
        // add Energy; for each Gear: select BONUS
        // auto if no choices
      },
      done: () => this.startOrPhase('Recruit'),
    },
    Recruit: {
      start: (ndx = this.phaseNdx) => {
        this.setCurPlayerNdx(ndx);
        this.doneButton('Recruit');
        // set Panel.recruit points; wait for done?
       },
      done: () => this.startOrPhase('Move'),
    },
    Move: {
      // TODO: discriminate MoveFirst/MoveLast; phaseNdx currently gunplayer!
      start: (ndx = this.phaseNdx) => {
        this.setCurPlayerNdx(ndx);
        this.doneButton('Move');
        // for each MovePoint: click to drop 'move actions' on hex border from src to dest region
        // adjust nFighters, annotate with Leaders that also Move
       },
      done: () => this.startOrPhase('Combat', undefined, true), // first time: set lBI
    },
    Combat: {
      start: (ndx = this.phaseNdx, init: boolean = false) => {
        if (init) {
          this.lastBattleInitiator = this.nextNdx(ndx, this.nPlayers - 1); // plyr to the right
        }
        this.setCurPlayerNdx(ndx);
        // find Regions with conflict; for curPlayer highlight Battle Regions (if any)
        // class Battle(ctile, stat1, stat2); stat: { plyr, wheel, card }
        const battles = this.gamePlay.findBattles(this.curPlayerNdx);
        if (battles.length > 0) {
          // curPlayer select a Battle; --> Each Player selects Wheel & Card;
          this.curPlayer.chooseBattle(battles, (battle: Battle) => this.phase('Battle', battle))
          return;
        } else if (this.lastBattleInitiator == this.curPlayerNdx) {
          // all the way around and last player to initiate has no more battles;
          this.phase('Income');
          return;
        }
        this.doneButton('Combat');
       },
      done: () => this.startOrPhase('Income'),
    },
    Battle: {
      start: (battle: Battle) => {
        // select Wheel & Card (w/Gem)
        if (!battle.stat1.wheel) battle.stat1.plyr.setBattlePlan(battle, () => super.phase('Battle', battle))
        else if (!battle.stat2.wheel) battle.stat2.plyr.setBattlePlan(battle, () => super.phase('Battle', battle))
        else this.state.done!(battle);
        return;
      },
      done: (battle: Battle) => {
        // resolve battle
        // commit and resolve (lose: Leaders, Fighters, Buildings) (retreat: Leader, redeploy)
        // -- auto if no choices [or no conflict]
        // after Battle: advance Fame for Oxataya, JRayek, [Zcharo, AI, Leyrien]
        // -- test for WIN
        this.lastBattleInitiator = battle.stat1.plyr.index;
        this.state = this.states['Combat'];
        this.state.start(this.nextNdx(this.lastBattleInitiator));
      }
    },
    Income: {
      start: (ndx = this.phaseNdx) => {
        this.setCurPlayerNdx(ndx);
        this.doneButton('Income');
        // auto mostly? choice of E/G, G/%
        // Region Bonus: (C + E), redeploy, select Attribute card(s) | Gems
        // Leyrien
        // Circadians
      },
      done: () => this.startOrPhase('Relics'),
    },
    Relics: {
      start: (ndx = this.phaseNdx) => {
        this.setCurPlayerNdx(ndx);
        this.doneButton('Relics');
        // AllRelics?
        // Zcharo?
        // Award Relic: move troops, award Fame points, choose Research
        // -- check WIN
      },
      done: () => { this.startOrPhase('EndRound'); }
    },
    EndRound: {
      start: () => {
        this.gamePlay.moveInPlayToInVault();
        this.phase('BeginRound', this.roundNum + 1)
      },
      done: () => { }
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
