import { arrayN, C, stime } from "@thegraid/common-lib";
import { GameState as GameStateLib, type Phase } from "@thegraid/hexlib";
import type { ChaosTable as Table } from "./chaos-table";
import type { FactionOnTile } from "./chaos-tile";
import { factionNames, type FactionId } from "./factions";
import { pentagon } from "./functions";
import type { Battle, GamePlay } from "./game-play";
import { Relic, type PriceToken } from "./meeples";
import type { Player } from "./player";
import { priceNames, pricePhases, TP, type CB, type PhaseName, type PriceName, type PricePhase } from "./table-params";

export type BattleFoTs = [FactionOnTile, FactionOnTile];
declare module '@thegraid/hexlib' {
  interface Phase {
    notDone?: () => string | undefined; // '' or reason/reminder of what needs to be done.
    battleFoTS?: BattleFoTs[];
  }
}

// Never stop/state a END of a phase, always proceed to next Phase, so curPlayer is the next to take Action.
type SaveState = [ phase: PhaseName, cpndx: FactionId, prices: PriceToken[] ];

/** 0 -- maxPlayers; is index into allPlayers[pid]; represents Table Order! */
export type PlayerId = 0 | 1 | 2 | 3 | 4; // index into allPlayers


export class GameState extends GameStateLib {
  declare gamePlay: GamePlay;

  nPlayers: number = 2;

  gunIcon = pentagon(TP.hexRad * .2, TP.hexRad * .2, C.coinGold, 180, C.BLACK);
  _gunPlayer!: Player;
  /** Player currently with the FlareGun. */
  get gunPlayer() { return this._gunPlayer }
  set gunPlayer(plyr: Player) {
    this._gunPlayer = plyr;
    plyr.panel.moveToWH(this.gunIcon, 2, 2)
    plyr.panel.stage.update();
  }

  advanceGun() {
    const pnxt = this.nextNdx(this.curPlayerNdx);
    const pndx = (pnxt != this.gunPlayer.index) ? pnxt : this.nextNdx(pnxt);
    this.gunPlayer = this.gamePlay.allPlayers[pndx];
  }

  // presumably this highlights the proper Faction/Panel
  // TODO: ChaosTable should override setNextPlayer() hexlib does way too much.
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

  /** initiator for this Phase, PlayerId */
  phaseNdx: PlayerId = 0;

  /**
   * Cycle through players in Table Order.
   * @param ndx (0) current index
   * @param dn  (1) generally +/- 1
   * @returns (ndx + dn) mod nPlayers
   */
  nextNdx(ndx = 0, dn = 1) {
    return (ndx + dn + this.nPlayers) % this.nPlayers as PlayerId;
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
    return this.playerByFacId[nfac ?? -1];
  }

  /** sparse array to map from facId to Player */
  playerByFacId: (Player|undefined)[] = [];
  /** packed array of Player in table order */
  get tablePlayers() { return this.gamePlay.allPlayers; }

  tokenOnPhase: Partial<Record<PriceName, PriceToken>> = {};
  priceToken(pName: PricePhase | PriceName) {
    return (pName == 'Move') ? this.tokenOnPhase.MoveFirst || this.tokenOnPhase.MoveLast : this.tokenOnPhase[pName];
  }

  constructor(gamePlay: GamePlay) {
    super(gamePlay)
    this.defineStates(this.states, false);
    this.table.overlayCont.addChild(this.gunIcon);
  }

  // Beginning of game game, from startPhase:
  override start(startPhase?: string, startArgs?: any[]): void {
    this.nPlayers = this.gamePlay.allPlayers.length;
    this.playerByFacId = factionNames.map((fn, facId) => this.gamePlay.playerByFacId(facId as FactionId))
    this.gunPlayer = this.tablePlayers[0];
    super.start(startPhase, startArgs);
  }

  /** ordinal of given PhaseName (or any key of this.states) */
  stateNdx(phase: string) { return Object.keys(this.states).indexOf(phase)}

  // autoPhases: string[] = ['PlaceBase', 'PlaceRelic', 'DeployLeaders', 'BeginRound', 'SetPrices', 'Discovery'];
  autoDiscover: PricePhase[] = ['Move', 'Recruit'];
  autoPhases: string[] = ['Recruit'] //['Build', 'Harvest', 'Recruit'];
  /** run auto placements until autoPhase */
  autoPhaseX?: string = 'Recruit';    // undefined for normal --> 'PlaceRelic' [manual Move is broken!]
  isAutoPhase(phase = this.state.Aname!) {
    // autoPhases implicitly includes all phase up to autoPhase:
    if (this.autoPhaseX && this.stateNdx(phase) < this.stateNdx(this.autoPhaseX)) return true;
    if (this.autoPhases.includes(phase)) return true;
    return false;
  }

  override startPhase = 'PlaceBase';
  override startArgs: any[] = [];

  // this.gamePlay.curPlayer
  override get curPlayer() { return super.curPlayer as Player }
  override get table() { return super.table as Table }

  get pricePhase() { return this.state.Aname as PricePhase }

  firstMover() {
    const mft = (this.priceToken('MoveFirst'));
    const mlt = (this.priceToken('MoveLast'));
    return (mft !== undefined) ? mft.facId : this.nextNdx(mlt?.facId);
  }

  /** (phasePricer or gunPlayer).index */
  phaseLeader(phase: PhaseName) {
    // facId: "SetPrices" "Combat", "Income", "Relic" --> gunPlayer
    const facId = (phase == "Move") ? this.firstMover() : this.priceToken(phase as PricePhase)?.facId;
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

  playerSaysDone = false;
  checkDone(nextPhase: PhaseName | string, ...args: any[]) {
    const notDone = this.state.notDone?.();
    if (notDone && !this.playerSaysDone) {
      if (notDone.endsWith('!')) { // Action required:
        // 'Confirm' and continue in phase
        this.curPlayer.panel.areYouSure(notDone, () => {
          console.log(stime(this, `${this.curPlayer.facName} not done with ${this.state.Aname}: ${notDone}`))
          this.state.start(this.curPlayerNdx);
        })
      } else {
        // Option to continue:
        this.curPlayer.panel.areYouSure(notDone, () => {
          this.playerSaysDone = true;
          this.startOrPhase(nextPhase, ...args);  // continuation of startOrPhase()
        }, () => {
          // ignore player's press of DoneButton
        })
      }
      return false;  // waiting for player to Confirm or proceed.
    }
    this.playerSaysDone = false;  // reset for future use
    return true;   // is done
  }

  /** start(nextNdx) or phase(nextPhase, args) */
  startOrPhase(nextPhase: PhaseName | string, ...args: any[]) {
    if (pricePhases.includes(this.pricePhase)) {
      // disable previous offer:
      this.curPlayer.faction.offerPrimaryAndAux(this.pricePhase, false);
    }
    if (!this.checkDone(nextPhase, ...args)) return;
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

  // provide common default label:
  override doneButton(label = `${this.state.Aname}:\n${this.curPlayer.facName}`, color?: string, afterPopup?: () => void) {
    return super.doneButton(label);
  }

  yesDone = () => { setTimeout(() => this.done(true), 50); }
  reStart = () => { setTimeout(() => this.state.start(), 50); }

  // confirmation that player is really 'done' with their Action
  get allDone() { return true; }  // TODO: count recruits? counts moves?


  get panel() { return this.curPlayer.panel; }

  /** define this.states */
  override readonly states: { [index: string]: Phase } = {
    // proforma:
    Initialize: {
      start: () => { this.phase(this.startPhase, ...this.startArgs) }
    },

    PlaceBase: {
      // start(-1) ==> consider from Oxataya
      start: (pid = -1) => {         // and look backward from there
        const plyr = this.vaultPlayerBeforePid(pid)!; // last player in vault list, before pid (highest facId)
        if (plyr) {
          this.setCurPlayerNdx(plyr.index);
          this.doneButton();
          if (this.isAutoPhase()) {
            this.curPlayer.autoPlaceBase(() => this.table.doneClicked());
          }
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
      start: (lastNdx = this.phaseNdx) => {     // gunPlayer.index
        const index = this.nextNdx(lastNdx, -1);
        this.setCurPlayerNdx(index as PlayerId);
        this.doneButton();
        if (this.isAutoPhase()) this.state.done!();  // --> placeInitialRelics()
      },
      done: (index = this.curPlayer.index) => {
        if (index !== this.phaseNdx) {
          this.state.start(index); // loop for each player
        } else {
          this.gamePlay.placeInitialRelics();
          this.phase('DeployLeaders'); // begin with Round = 1
        }
      }
    },

    /** in table order, place Leader & rest of fighters; movePoints = 2? OR set 2 movesInPlay or click? */
    DeployLeaders: {
      start: (pndx = this.gunPlayer.index) => {
        this.setCurPlayerNdx(pndx);
        const plyr = this.curPlayer, baseTile = plyr.panel.baseTile;
        baseTile.moveCounter.value = 0;
        plyr.faction.moveFaction(2); // move Fighters to 2 baseTile.baseRegions
        plyr.panel.baseTile.baseRegions?.find(hex => {
          plyr.newMoveInPlay(baseTile, hex.ctile!); // DeployLeaders & Warriors
        });
        this.doneButton();
        if(this.isAutoPhase()) {
          const plyr = this.curPlayer;
          const ldr = plyr.faction.leaders[0];
          const baseFot = plyr.panel.baseTile.getFoT(plyr);
          const ctile = plyr.panel.baseTile.baseRegions![0].ctile!;
          const toFoT = ctile.getFoT(plyr);
          toFoT.addLeader(ldr);
          const fighters = baseFot.fighters;
          toFoT.fighterIcon.incValue(fighters);
          baseFot.fighterIcon.incValue(-fighters);
          toFoT.update();
          baseFot.update();
          this.state.done!();
        }
      },
      done: () => {
        this.startOrPhase('BeginRound')
      },

      notDone: () => {
        const plyr = this.curPlayer, facId = plyr.facId, baseTile = plyr.panel.baseTile;;
        if (!baseTile.baseRegions?.find(hex => hex.ctile!.hasFoT(facId)!.leaders.length > 0)) {
          return "must place a Leader!";
        } if (baseTile.getFoT(plyr).fighters > 0) {
          return "must place fighters!"
        } else {
          // isDone:
          baseTile.moveCounter.value = 0;
          this.gamePlay.endMoveFaction(); //
        }
        return;
      },
    },


    BeginRound: {
      // start(1)
      start: (round = this.roundNum) => {
        this._round = round;   // 'PlaceBase' & 'Relics' invoke with new roundNum
        TP.freeAuxForOxataya = (this.nPlayers == 2) ? 'ask' : 'use';
        this.gamePlay.saveGame();
        this.gamePlay.logWriterLine0('round', { time: stime.fs(), round: this.roundNum, gunPlayer: this.gunPlayer.facName });
        this.doneButton(`Begin Round: ${this.roundNum}`); // activate
        if (this.isAutoPhase()) this.state.done!();
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
        this.doneButton();
        // PriceToken.dropFunc() --> PT.setTokenOnPhase(priceIndex);
        if (this.isAutoPhase()) {
          this.gamePlay.autoSetPrices(ndx); // --> this.state.done!()
        }
      },
      done: () => {
        const next = this.nextNdx(this.curPlayerNdx);
        if (next !== this.phaseNdx) {
          this.state.start(next); // loop for each player
          return;
        }
        // this code block so SetPrices is run twice when only 2-Players
        const openSlots = priceNames.filter(pn => !this.tokenOnPhase[pn]).length; // HACK! Move has 2 slots...
        if (openSlots > this.nPlayers) {
          this.state.start(this.phaseNdx);     // restart with original gunPlayer when nPlayers == 2
          return;
        }

        this.gamePlay.awardPriceBonuses();     // soon enough. player can't use bonus until Discovery...
        if (this.nPlayers < pricePhases.length) this.gamePlay.setPriceNeutral();
        this.gamePlay.movePendingToAvail();
        this.phase('Discovery');
      }
    },
    Discovery: {
      start: (ndx = this.phaseNdx) => {
        this.setCurPlayerNdx(ndx);
        this.curPlayer.faction.offerPrimaryAndAux(this.pricePhase); // 'Discovery'
        this.doneButton();
        if (this.isAutoPhase()) {
          const plyr = this.curPlayer, facId = plyr.facId, faction = plyr.faction;
          // do the research of choice:
          const panel = plyr.gamePlay.table.neutralPanel;
          const discPhase = this.autoDiscover;   // auto make mulitple Discovery:
          this.autoDiscover.forEach(discPhase => {
            const { phaseRow, level } = faction.researchLevelOfPhase[discPhase];
            if (level < phaseRow.length - 1)  {
              faction.researchLevelOfPhase[discPhase].level = level + 1;
              phaseRow[level+1].immediate(plyr.faction);
            }
          })
          this.state.done!(); // nobody buys this Phase
        }
        // TODO: discover something? [not required, can D&D tokens afterwards]
      },
      done: () => {
        this.startOrPhase('Build')}
        ,
    },
    Build: {
      start: (ndx = this.phaseNdx) => {
        this.setCurPlayerNdx(ndx);
        this.curPlayer.faction.offerPrimaryAndAux(this.pricePhase); // 'Build'
        // for each Build point: D&D a Building or Foundation --> done()
        // maybe buy a aux Build | Card
        this.doneButton();
        if (this.isAutoPhase()) {
          // TODO: place some Factory so we can Harvest!
          const plyr = this.curPlayer, facId = plyr.facId;
          // click on 'Build' button, to setup TP.whenBuildingPlacedCB --> bldg->FoT
          const panel = plyr.gamePlay.table.neutralPanel;
          const { phaseRow, level } = plyr.faction.researchLevelOfPhase['Build'];
          const rc = phaseRow[level];    // current Build cell
          const onClick = ((rc.pButton as any)._listeners['click'] as CB[])[0]; // first/only click listener
          onClick(); // request/run rc.primary()
          const bldg = plyr.panel.buildings.find(b => b.Aname.endsWith('1'))!; // Assert: no gemlock to pay for Factory${1}.
          // choose a baseRegion w/o '%'
          const hex = plyr.panel.baseTile.baseRegions?.find(hex => hex.ctile!.foundations[1]!.bonus !== '%');
          bldg.placeBuilding(hex);  // dragStartAndDrop(bldg, hex) --> placeBuilding(hex)
          this.state.done!();
        }
      },
      done: () => this.startOrPhase('Harvest'),
    },
    Harvest: {
      start: (ndx = this.phaseNdx) => {
        this.setCurPlayerNdx(ndx);
        this.curPlayer.faction.offerPrimaryAndAux(this.pricePhase); // 'Harvest'
        // add Energy; for each Gear: select BONUS
        // auto if no choices
        this.doneButton();
        if (this.isAutoPhase()) this.state.done!(); // nobody buys this Phase
      },
      done: () => {
        this.startOrPhase('Recruit')
      },
    },
    Recruit: {
      start: (ndx = this.phaseNdx) => {
        this.setCurPlayerNdx(ndx);
        this.curPlayer.faction.offerPrimaryAndAux(this.pricePhase); // 'Recruit'
        this.doneButton();
        if (this.isAutoPhase()) this.state.done!(); // nobody buys this Phase <-- TODO Fix: per-Faction auto-Recruit!
       },
      done: () => {
        this.startOrPhase('Move')
      },
      notDone: () => {
        const mps = this.curPlayer.panel.recruitPoints;
        return (mps > 0) ? `remaining move points: ${mps}` : undefined;
      },
    },
    Move: {
      // TODO: discriminate MoveFirst/MoveLast; phaseNdx currently gunplayer!
      start: (ndx = this.phaseNdx) => {
        this.setCurPlayerNdx(ndx);
        this.curPlayer.faction.offerPrimaryAndAux(this.pricePhase); // 'Move'
        this.doneButton();
        // for each MovePoint: click to drop 'move actions' on hex border from src to dest region
        // adjust nFighters, annotate with Leaders that also Move
        if (this.isAutoPhase()) {
          const plyr = this.curPlayer;
          // move plyr's Leader & minions to Relic1 hex:
          const toFoT = this.gamePlay.hexOfRelic(1)!.ctile!.getFoT(plyr);
          plyr.panel.baseTile.baseRegions?.forEach(hex => {
            const fromFoT = hex.ctile!.getFoT(plyr);
            const ldr = fromFoT.leaders[0];
            if (ldr) {
              toFoT.addLeader(ldr);
              toFoT.addFighter(fromFoT.fighters, fromFoT);
            }
          })
          this.state.done!()
        };
       },
      done: () => {
        this.gamePlay.endMoveFaction();
        this.startOrPhase('Combat', undefined, true); // first time: set lBI & cull FoTs
      },
      notDone: () => {
        const moves = this.curPlayer.movesLeft;
        return (moves > 0) ? `moves remaining: ${moves}` : undefined;
      },
    },
    Combat: {
      battleFoTS: [],
      start: (ndx = this.gunPlayer.index, init: boolean = false) => {
        if (init) {
          ndx = this.gunPlayer.index;            // maybe redundant...
          this.gamePlay.removeEmptyFoTs(); // when entering Combat phase, remove reference to empty FoTs
          this.lastBattleInitiator = this.nextNdx(ndx, this.nPlayers - 1); // plyr to the right
        } else {
          this.phaseNdx = this.lastBattleInitiator!;
        }
        this.setCurPlayerNdx(ndx);
        this.doneButton('Combat');
        const facId = this.curPlayer.facId;
        // find Tiles with conflict for curPlayer; highlight Conflict Tiles/FoTs (if any)
        const confTiles = this.gamePlay.conflictTiles(facId);
        const battleFoTs = this.state.battleFoTS = this.gamePlay.battleFoTs(confTiles, facId);
        if (battleFoTs.length > 0) {
          const doBattle = (bf: BattleFoTs) => this.phase('Battle', this.gamePlay.newBattle(bf))
          // curPlayer select a Battle; choose Tile & Opponent; then each Player selects Wheel & Card; resolve
          this.curPlayer.chooseBattleFoT(battleFoTs, doBattle)
        } else if (this.lastBattleInitiator == this.curPlayerNdx) {
          // all the way around and last player to initiate has no more battles;
          this.phase('Income');
        } else {
          this.state.done!();    // curPlayer has no Battle
        }
       },
      done: () => this.startOrPhase('Income'),
      notDone: () => (this.state.battleFoTS!.length > 0) ? 'choose a Battle!' : undefined,
    },
    // each Player choose their Tactic; then resolve: winner, casulaties, removal
    Battle: {
      // class Battle(ctile, stat1, stat2); stat: { plyr, wheel, card }
      start: (battle: Battle, i = 0) => {
        // battle has { fots, result }
        // Player selects fot.wheel (w/Gem) & fot.card;
        // alternate checking: first 0 & 1; then 1 & 0;  (so Oachra can defer)
        const checkOtherPlayer = () => super.phase('Battle', battle, 1-i);  // no prevPhase/phaseLeader; loop to restart
        if (!battle.fots[i].wheel) {
          this.gamePlay.setCurPlayer(battle.fots[i].player);
          battle.fots[i].player.setBattlePlan(battle, checkOtherPlayer);
        }
        else if (!battle.fots[1-i].wheel) checkOtherPlayer(); // loop to re-check other player [again]
        else this.state.done!(battle);
      },
      done: (battle: Battle) => {
        this.gamePlay.setCurPlayer(battle.fots[0].player);  // reset from setBattlePlan()
        this.lastBattleInitiator = this.curPlayerNdx;

        const nextNdx = this.nextNdx(this.lastBattleInitiator);
        const cb = () => {
          this.phase('Combat', nextNdx);    // sets phaseIndex, but we ignore that and use lastBattleInitiator
        }
        const strength = (fot: FactionOnTile) => fot.faction.strengthInRegion(fot.tile)[0];
        const strs = battle.fots.map(fot => `${fot.faction.facName}(${strength(fot)})` );
        console.log(stime(this, `.Battle: resolve`), strs[0], 'vs', strs[1], battle);
        this.gamePlay.resolveBattle(battle, cb);
      }
    },
    Income: {
      start: (ndx = this.gunPlayer.index) => {
        this.setCurPlayerNdx(ndx);
        this.doneButton();
        // auto mostly? choice of E/G, G/%
        // Region Bonus: (C + E), redeploy, select Attribute card(s) | Gems
        // Leyrien
        // Circadian
      },
      done: () => this.startOrPhase('Relics'),
    },
    Relics: {
      start: (ndx = this.phaseNdx) => {
        this.setCurPlayerNdx(ndx);
        this.doneButton(`Relics ${this.roundNum}`);
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
