import { arrayN, removeEltFromArray, S, stime, type Constructor } from "@thegraid/common-lib";
import { CenterText, NamedContainer } from "@thegraid/easeljs-lib";
import type { Phase } from "@thegraid/hexlib";
import type { ChaosHex2 as Hex2 } from "./chaos-hex";
import type { BONUS, ChaosTile, FactionOnTile, FAME_BONUS, HARVEST } from "./chaos-tile";
import type { Foundation } from "./foundation";
import { Leader, Morale, type ChaosBuilding } from "./meeples";
import type { Panel, Player } from "./player";
import { type ResearchLevel } from "./research-cell";
import { pricePhases, TP, type CB, type PricePhase } from "./table-params";
//
function expandArray<T>(rec: Record<number, T>): (T | undefined)[] {
  const length = Math.max(-1, ...Object.keys(rec).map(Number)) + 1; // .filter(k ->!isNan(k))
  return Array.from({ length }, (_, index) => rec[index]);
}
function expandArray0<T>(rec: Record<number, T>): (T | undefined)[] {
  const keys = Object.keys(rec).map(Number);
  const max = Math.max(-1, ...keys); // .filter(k ->!isNan(k))
  const rv: T[] = new Array(max + 1);
  keys.forEach(key => rv[key] = rec[key]);
  return rv;
}

/**                          Circadian   AI   Zcharo   Leyrien   JRayek   Oxataya   (& Neutral: brown) */
export const factionColors = ['gold', 'grey', 'blue', 'green', 'orange', 'violet', ] as const;
type FactionColor = typeof factionColors[number];

/** presentation name of each Faction */  // TODO: move these to Scenario & parser?
export const factionNames = ['Circadian', 'AI', 'Zcharo', 'Leyrien', 'Jrayek', 'Oxataya'] as const;
export const factionNeutral = ['Circadian', 'AI', 'Zcharo', 'Leyrien', 'Jrayek', 'Oxataya', 'Neutral'] as const;
export type FactionName = typeof factionNeutral[number];
export type FactionId = 0 | 1 | 2 | 3 | 4 | 5;  // at most 5 Factions in game

const attrNames = [
  'proficient', 'seclusive', 'resilient', 'tenacius', // zcharo
  'expeditious', 'optomistic', 'spirited', 'protective', // Leyrien
  'resourceful', 'subterranean', 'symbiotic', 'volatile', // Oxataya
  'aggressive', 'assertive', 'hostile', 'fortified',  // Jrayek
  'cunning', 'copious', 'destructive', 'ominous',     // AI
  'covert', 'militarized', 'tactical', 'mobile', 'perceptive', // Circadian
] as const;
type AttrName = typeof attrNames[number];
const factionAttrs = {
  Circadian: ['covert', 'militarized', 'tactical', 'mobile', 'perceptive'],
  AI: ['cunning', 'copious', 'destructive', 'ominous'],
  Zcharo: ['proficient', 'seclusive', 'resilient', 'tenacius'],
  Leyrien: ['expeditious', 'optomistic', 'spirited', 'protective'],
  Jrayek: ['aggressive', 'assertive', 'hostile', 'fortified'],
  Oxataya: ['resourceful', 'subterranean', 'symbiotic', 'volatile'],
 } as Record<FactionName, AttrName[]>;


export class Attribute {
  Aname!: AttrName;
  t1!: string;  // basic text
  t2!: string;  // upgraded text
  upgradeEffect!: string;
  upgraded = false;
  constructor() {

  }
}
/** bh: HARVEST in base, bf: beginning Foundations */
export type BaseSpec = {name: FactionName, bh?: HARVEST, bf?: [HARVEST, HARVEST] }
/** rb: RelicBonus, fg: foundation w/gem, serial [0..4], bg: building w/gemlock (index per type), nr: number in recruit, r3: alt_recruit
 *
 * bh: base_Harvest BONUS, bf: base_Foundations [HARVEST, HARVEST]
 */
export type FacSpec = {name: FactionName, rb: string[], fg: number, bg: number[][], nr: number[], ft: number, r3: BONUS } & BaseSpec;

export class Faction {
  //
  // Factory: Energy2, Baracks: Card, Stronghold: Gem (--> %)
  // Stronghold = sf?: () => void;
  // Circadian: Build:restrict, Income: +region
  // Zcharo: Combat: strength
  // AI: Move: trap, Income: reset
  // Leyrien: Build: restrict, Combat: +strength, Income: +Fame
  // Jrayek: Combat: +str, +shield
  // Oxataya: Recruit: placement option
  /** sparse Map of instantiated Factions */
  static factionById = new Map<FactionId, Faction>();

  /** Faction Constructor for FactionId */
  static facCbyId(facId: FactionId) {
    return factionsCbyName[factionNeutral[facId]];
  }

  /** Array of all extant Faction instances */
  static get allFactions() {
    return Array.from(Faction.factionById).map(([facId, fac]) => fac);
  }
  /** Array of names of extant Factions */
  static get allFactionNames() {
    return Array.from(Faction.factionById).map(([facId, fac]) => fac.name);
    // return Faction.allFactions.map(f => f.name)
  }

  // Relic bonus = rb: G: Gem, F: Fame, E: Energy, M: Morale, Up: Upgrade Attribute(flip),
  // Bldg gemlock= bg: [[0, 1, 1], [0, 0, 1, 1], [0, 1]] <== Zcharo! always 9 there are
  // Base income = bi?: 3 | undefined => 2/G
  // Num recruit = nr: [8, 6, 6] initial number of Fighters in each stage & base
  // Foundation w/gem = fg: 1-4 (0 is implicit) [gem->res, ubiq harv, ubiq adj, gemlock, handlim]
  static facSpecs: FacSpec[] = [
    { name: 'Circadian', rb: ['G1', 'Up', 'G1', 'Up', 'Up',], fg: 2, bg: [[3, 0, 0, 0], [0, 0, 0], [1, 1, 1]], nr: [6, 2, 0, 2], ft: 3, r3: 'G1', }, // no base; 10 Fighters
    { name: 'AI',        rb: ['F1', 'F2', 'F2', 'F3', 'F4',], fg: 2, bg: [[3, 0, 0, 0], [1, 1, 1], [0, 1, 1]], nr: [13, 7],    ft: 0, r3: 'G1',}, // +10 on copious
    { name: 'Zcharo',    rb: ['G1', 'G1', 'G1', 'G1', 'G1',], fg: 3, bg: [[2, 0, 1, 1], [0, 0, 1, 1], [0, 1]], nr: [9, 5, 6],  ft: 1, r3: 'C', },
    { name: 'Leyrien',   rb: ['M0', 'F2', 'F2', 'F3', 'F3',], fg: 1, bg: [[2, 0, 0, 1], [0, 0, 1], [1, 1, 1]], nr: [8, 6, 6],  ft: 1, r3: 'C',},
    { name: 'Jrayek',    rb: ['E2', 'F1', 'E3', 'F1', 'F1',], fg: 2, bg: [[2, 0, 0, 1], [0, 1, 1], [0, 0, 1]], nr: [10, 4, 6], ft: 1, r3: 'C', },
    { name: 'Oxataya',   rb: ['F1', 'F1', 'F1', 'F2', 'F3',], fg: 1, bg: [[2, 0, 1, 1], [0, 0, 1], [0, 1, 1]], nr: [12, 3, 5], ft: 1, r3: 'C', },
  ];

  // Base harvest= bh?: E1, E2, G1, R1
  // Base foundations = bf: [string, string]
  static baseSpecs: BaseSpec[] = [
    { name: 'Circadian', bh: '-',  bf: ['%', 'E2'] }, // no base; ship can do 1 harvest without a building
    { name: 'AI',        bh: 'E1', bf: ['G1', 'E2'] },
    { name: 'Zcharo',    bh: 'E2', bf: ['C', 'G1'] },
    { name: 'Leyrien',   bh: 'E2', bf: ['C', 'E2'] },
    { name: 'Jrayek',    bh: 'G1', bf: ['G1', '%'] },
    { name: 'Oxataya',   bh: 'R1', bf: ['C', 'C'] },
  ];

  /** identify bonuses awarded on each faction's fameTrack */
  static fameTrackSpecs: Record<number, FAME_BONUS>[] = [
    { 1: 'M1', 2: 'E1', 4: 'Win' },                              // Circadian
    { 5: 'E1', 10: 'G1', 13: 'R1', 18: 'Win' },                  // AI
    { 3: 'E1', 5: 'R1', 8: 'E1', 13: 'R1', 18: 'C', 20: 'End' }, // Zcharo
    { 1: 'R1', 3: 'R1', 5: '%', 7: 'R1', 8: 'R1', 11: 'G1', 14: 'Win' },  // Leyrien
    { 1: 'E2', 2: 'E2', 3: 'R2', 4: 'G1', 5: 'Win' },            // Jrayek
    { 1: 'E1', 3: 'G1', 5: '%', 7: 'C', 9: 'Win' },              // Oxataya
  ]

  static fameTracks = Faction.fameTrackSpecs.map((rec, n) => {
    const ft = expandArray0(rec);
    // console.log(stime('Faction', `.static: ft[${n}] =`), ft, ft[3])
    return ft;
  });

  static {
    // append/include baseSpecs in facSpecs:
    this.facSpecs.forEach((fs, ndx) => Object.assign(fs, this.baseSpecs[ndx]));
  }
  /** display name of Faction */
  name!: FactionName;
  /** Relic BONUS on Panel */
  rb!: BONUS[];
  /** Panel Foundation with Gemlock (other than 0: Stronghold_Gem -> Research) */
  fg!: number;
  /** Buildings w/Gemlock; bg[0][0] is Energy Bonus for Income; [[F0-Ex, Fg, Fg, Fg], [Og, Og, Og], [Sg, Sg, Sg]] */
  bg!: number[][];
  /** number of Fighters in each recruit stage */
  nr!: number[];
  /** Base Harvest Icon */
  bh!: BONUS;
  /** tuple: BONUS for the 2 starting Foundations */
  bf!: [BONUS, BONUS];
  /** ft: cost for Fast Track recruiting */
  ft!: number;
  /** r3: trade R3 for BONUS resource. */
  r3!: BONUS;
  attributes: Partial<Record<AttrName, Attribute>> = {};

  /** ResearchLevel for each Phase */
  researchLevelOfPhase!: Record<PricePhase, ResearchLevel>;

  /** available Leaders */
  leaders: Leader[] = [];

  get coins() { return this.player.coinCounter?.value; }
  set coins(v) { this.player.coinCounter?.updateValue(v); }

  get gems() { return this.player.coinCounter?.value; }
  set gems(v) { this.player.coinCounter?.updateValue(v); }

  facId!: FactionId;
  facName: FactionName = this.name;

  constructor(facId: FactionId, public player: Player) {
    this.facId = facId;
    const facSpec = Faction.facSpecs[facId] ?? { name: 'Neutral', bh: '-' };
    Object.assign(this, facSpec);        // initialize all facSpec fields
    Faction.factionById.set(facId, this);
    this.fameTrack = Faction.fameTracks[facId]
  }

  _fame = 0;
  fameTrack: (FAME_BONUS | undefined)[];

  get fame() { return this._fame; } // readonly

  factionPanel(panel: Panel) {
    // override for specific adds during layoutPanel
  }

  pins(fot: FactionOnTile) {
    return fot.fighters + fot.leaders.length; // each unit pins 1
  }

  incFame() {
    this._fame += 1;
    const bonus = this.fameTrack[this.fame];
    if (bonus) {
      // TODO: implement bonus
      switch (bonus) {
        case "E1": {
          this.coins += 1;
          break;
        }
        case "E2": {
          this.coins += 2;
          break;
        }
        case "G1": {
          this.gems += 1;
          break;
        }
        // TODO: Player choice/actions and completion:
        case "C": // draw, show, (maybe discard/play), wait for ack/continue
        case "%": // wait for click on track;
        case "R1": // wait for choice to fast-track
        case "R2": // wait for choice to fast-track
        case "M1": // wait for choice of Redeploy
        case 'Win': // signal instant win
      }
    }
  }

  // for given Phase: offer primary and aux;
  offerPrimaryAndAux(pName: PricePhase, activate = true) {
    const { phaseRow, level } = this.researchLevelOfPhase[pName];
    if (level < phaseRow.length) {
      const rc = phaseRow[level];
      if (activate) {
        rc.activateForAction(this, () => {}, () => {} ); // primary(this, cb), auxillary(this, cb)
      } else {
        rc.activateForAction(this);
      }
    }
  }

  // offer a Discovery action ('%')
  // for each phase, activate mid-row of next level; then turn them all off
  offerDiscoveryAction(pv = 1, cb: CB = () => {}) {
    pricePhases.forEach(pName => {
      const { phaseRow, level } = this.researchLevelOfPhase[pName];
      // in Discovery phase: augment activation of researching 'Discovery'
      const mcb =  (this.player.gamePlay.gameState.isPhase('Discovery') && pName == 'Discovery')
        ? () => {
          const nlevel = this.researchLevelOfPhase[pName].level;
          if (nlevel !== level) {
            // Note: if Discovery advances, there is not a second Discovery action!
            // If there IS a second Discovery action, Discovery cannot advance!
            phaseRow[level].aButton.activate(false); // disable lower-level Discovery
            phaseRow[nlevel].activateForAction(this, undefined, () => {}); // enable nlevel Aux-Discovery
          }
          this.deactivateDiscovery(cb);
        }
        : () => this.deactivateDiscovery(cb);

      if (level < phaseRow.length-1) {
        // TODO: stash & 'restore/recompute' status of enabled aButton
        // click -> rl.level = rc.level
        // TODO: do not activate if gemlock && player can't pay?
        phaseRow[level+1].activateForDiscovery(this, true, mcb);
      }
    })
  }

  deactivateDiscovery(cb: CB) {
    pricePhases.forEach(pName => {
      const { phaseRow, level } = this.researchLevelOfPhase[pName];
      if (level < phaseRow.length-1) {
        phaseRow[level+1].activateForDiscovery(this, false, () => {});
      }
    })
    cb();
  }

  /** not allowed to drag ChaosBuilding */
  onlyFoundation = false;

  /** allow drag from ProdTokenPool, then invoke CB */
  allowProdTokenPoolCB?: CB;

  /** allow Build Action (pv times) then run cb() */
  offerBuildAction(pv: number, cb: CB) {
    // allow pv Build actions:
    const newlyBuilt = TP.newlyBuilt;
    newlyBuilt.length = 0;
    TP.whenBuildingPlacedCB = (building: ChaosBuilding | Foundation, hex?: Hex2) => {
      const bldg = building as ChaosBuilding, found = building as Foundation;
      const [onMap, fromMap] = (building.isMeep) ? [!!bldg.found.onTile, !bldg.fromPanel] : [!!found.onTile, found.fromMap]
      console.log(stime(this, `.whenBuildingPlacedCB:`), building.Aname, {onMap, fromMap}, newlyBuilt);
      if (onMap && !fromMap) {
        newlyBuilt.push(building);  // will be newly placed on hex
        pvcb();
      } else if (!onMap && fromMap) {
        removeEltFromArray(building, newlyBuilt);  // unbuild; pvcb will see length changed
      } // else: ignore Move from map to map, or pick&drop on panel
    }
    const pvcb = () => {
      const panel = this.player.panel;
      if (pv - newlyBuilt.length > 0) {
        console.log(stime(this, `.buildAction(${pv}) ${pv - newlyBuilt.length}`))
        // ChaosBuilding.placeBuilding() --> TP.whenBuildingPlacedCB(bldg, hex)
        panel.setDoneButton(`Build Done ${pv}`, () => {
          console.log(stime(this, `.buildDone: ? newlyBuilt=)`), newlyBuilt)
          pvcb();
        });
        panel.setResetButton(`Reset Build`, () => {
          console.log(stime(this, `.resetBuild: newlyBuilt.forEach(b => b.sendHome() ?)`), newlyBuilt)
          pvcb();
        });
      } else {
        console.log(stime(this, `.pvcb: all MovePoints built:)`), newlyBuilt);
        panel.deactivateButtons();
        cb();
      }
    }
    pvcb(); // recursive loop until all BuildActions used and panel doneButton clicked.
  }

  offerHarvestActions(hv: number, cb: CB) {
    // enable UtilButton on each Tile where faction has harvest-enabled ChaosBuilding
    const allHarvest = !!this.player.panel.foundations['harvest'].hex?.isOnMap;
    const hfot = this.player.fotPresence.filter(fot => fot.tile.isBase || (allHarvest ? fot.buildings.length > 0 : fot.buildings.find(b => b.Aname.startsWith('F'))))
    let hdone = 0;
    const enableHarvest = (fot: FactionOnTile) => {
      const pToken = fot.tile.prodToken, ptb = pToken.baseShape;
      pToken.gamePlay.table.dragger.stopDragable(pToken);   // forever on its Tile; removeEventListeners
      pToken.gamePlay.table.dragger.stopDragable(fot.tile);  // forever on its Hex; removeEventListeners
      const clickToHarvest = (evt: Object) => {
        ptb.activate(false);
        this.doImmediateBonus(pToken.harvest, checkHarvestDone);
      }
      ptb.on(S.click, clickToHarvest, true);
      ptb.activate(true);
    }
    const checkHarvestDone = () => {
      if (++hdone < hv) return;
      disableAllHarvest();
      cb();
      return;
    }

    const disableAllHarvest = () => {
      hfot.forEach(fot => {
        const pToken = fot.tile.prodToken, ptb = pToken.baseShape;
        ptb.activate(false)
      })
    }

    // enableAllHarvest:
    hfot.forEach(fot => {
      enableHarvest(fot)
    })
  }

  // Discovery: En, Gn, Rn, C, (place) F, PT, UT;
  // Foundation: En, Gn, C, %
  // Income: from ProdToken!
  // Note: 'this' may be undefined! (from afterUpdate(..., panel))
  doImmediateBonus(bs: string, cb: CB) {
    const player = this.player;
    // use match to determine repetition value (v)
    let match: RegExpMatchArray | null, iv!: number;
    const matchv = (b: 'E'|'G'|'R') => {
      match = bs!.match(`${b}(\\d)`); // immediate is only benefit
      if (!match) return;
      iv = Number.parseInt(match[1])
      if (Number.isNaN(iv)) debugger;
      return iv;
    }
    console.log(stime(this, `.doImmediateBonus: bs=${bs}`));
    if (bs == 'C') {
      player.gainCard();
      cb();
    } else if (bs == '%') {
      this.offerDiscoveryAction(iv, cb)
    } else if (bs == 'F') {
      console.log(stime(this, `.doImmediateBonus: player.offerPlaceFoundation(cb)`));
      this.offerBuildAction(1, cb); // TODO: restrict to Foundation
    } else if (bs == 'PT') {
      console.log(stime(this, `.doImmediateBonus: player.offerProdToken(cb)`));
      this.allowProdTokenPoolCB = cb;
      // TODO: activate panelReset/Done(cb)
    } else if (bs == 'UT') {
      console.log(stime(this, `.doImmediateBonus: player.offerLeaderUpgrade(cb)`));
      cb();
    } else if (matchv('E')) {
      player.coins += iv;
      cb();
    } else if (matchv('G')) {
      player.gems += iv;
      cb();
    } else if (matchv('R')) {
      this.offerRecruit(iv, cb)
    } else {
      debugger;
    }
  }

  /** set nRecruit, activate Buttons for Reset & Done --> cb() */
  offerRecruit(nRecruit: number, cb: CB) {
    const player = this.player;
    const panel = player.panel;
    const reset = {
      recruits: panel.recruits.map(rc => rc.value),
      coins: player.coins,
      gems: player.gems,
      cards: player.cards,
    }
    // TODO: setResetButton() --> all the recruit counters, coins, cards/gems
    panel.setDoneButton(`Done Recruit ${nRecruit}`, () => {
      panel.deactivateButtons();
      this.moveRecruitsToBase();
      cb();
    })
    panel.setResetButton(`Reset`, () => {
      const { recruits, coins, gems, cards } = reset;
      panel.recruits.forEach((rc, n) => rc.value = recruits[n]);
      player.coins = coins;
      player.gems = gems;
      panel.cardPanel.resetCards(cards);
      this.offerRecruit(nRecruit, cb);
    })
    panel.recruitPoints = nRecruit;
  }

  moveRecruitsToBase(player = this.player) {
    // move fighters from Panel to Base; TODO: (facId == 5) allow recruit to Stronghold
    const panel = player.panel;
    const nRecruit = panel.baseRecruitCounter.value;
    panel.baseTile.getFoT(player).fighters += nRecruit;
    panel.baseTile.getFoT(player).setFighterVis(); // QQQ: see if new count shows
    panel.baseRecruitCounter.value = 0;
    panel.recruitPoints = 0;  // unused RPs are lost.
  }

  /** override for phase specific checks; Faction attributes */
  checkPhase(phase: Phase) {
  }
  fighterStr (fot: FactionOnTile) {
    return fot.fighters;
  }
  leaderStr(fot: FactionOnTile) {
    return Math.sum(...fot.leaders.map(ldr => ldr.stats[0]));
  }
  buildingStr(fot: FactionOnTile) {
    return Math.sum(...fot.buildings.map(b => b.strength));
  }

  // while computing Strength, also build a text block to explain the source
  /** sum of all  Strength components: Fighters, Leader(s), Rhyzu, Terrain/Faction effects */
  strengthInRegion(region: ChaosTile): [number, string] {
    const fot = region.hasFoT(this.facId);
    let str = 0, txt = '';
    if (fot) {
      const addStrength = (ds: number, src: string) => {
        str = str + ds;
        txt = `${txt}\n${src} ${ds}`;
      }
      addStrength(this.fighterStr (fot), 'Fighters: ');
      addStrength(this.leaderStr  (fot), 'Leaders:  ');
      addStrength(this.buildingStr(fot), 'Buildings:');
    }
    return [str, txt];
  }
}

class Circadian extends Faction {

  override fighterStr (fot: FactionOnTile) {
    return fot.fighters * (this.attributes['militarized']?.upgraded ? 3 : 2);
  }
}
class AI extends Faction {

}
class Zcharo extends Faction {

  override strengthInRegion(region: ChaosTile) {
    const [str, txt] = super.strengthInRegion(region)
    const res = (region.isPlains) ? (this.attributes['resilient']?.upgraded ? 2 : 1) : 0;
    const txr = (region.isPlains) ? `${txt}\non Plains: ${res}` : txt;
    return [str+res, txr] as [number, string];
  }
}
export class Leyrien extends Faction {

  mcCont!: NamedContainer;
  miCont!: NamedContainer;

  override factionPanel(panel: Panel): void {
    // row for Combat Morale, row for Income(Fame) Morale
    const wh = panel.wh, col = 8, rowc = 6, rowi = rowc+1, w = 5 * wh * .9;
    panel.addIconStripe(col, rowc, w, 'Combat');
    panel.addIconStripe(col, rowi, w, 'Income');

    const mcCont = this.mcCont = new NamedContainer('MoraleStr'); // Combat
    const miCont = this.miCont = new NamedContainer('MoraleFame'); // Income
    mcCont.y = (rowc+.55) * wh; miCont.y = (rowi+.55) * wh;
    mcCont.x = (col +1.5) * wh; miCont.x = (col +1.5) * wh;
    panel.addChild(this.mcCont, this.miCont);

    const baseSize = TP.meepleRad * .45;
    arrayN(8).forEach((c, i) => {
      const moralToken = new Morale(`Morale`, this.player);
      moralToken.sendHome(); // --> placeMoraleOnPanel
      const mbs = new NamedContainer('moraleBase');  // new MoraleBase(moralToken)
      mbs.addChild(moralToken.makeShape(baseSize));
      mbs.addChild(new CenterText(`${moralToken.onPanel}+${i==1?2:1}`, baseSize*.45))
      mbs.x = moralToken.x; moralToken.y = moralToken.y;
      moralToken.parent.addChildAt(mbs, 0);  // slide mb underneath all the moraleToken.
    });
  }

  // need array of [4] for each; D&D to place on Tile; keep balanced.
  moraleStr:  Morale[] = [];     // push 4 Morale
  moraleFame: Morale[] = [];     // push 4 Morale
  get moraleIncome() { return [5, 3, 2, 1, 0][this.moraleFame.length] }
  get moraleCombat() { return 4 - this.moraleStr.length }


  /**
   * Morale.sendHome()
   * @param moraleToken
   * @param auto 'str' | 'fame' | '' (choose)
   */
  placeMoraleOnPanel(moraleToken: Morale, auto = 'str' as 'str' | 'fame' | '') {
    const ms = this.moraleStr, mf = this.moraleFame;
    const place = (str: 'str' | 'fame' | '') => {
      moraleToken.onPanel = str;
      const ma = (str == 'str') ? ms : mf;
      const cont = (str == 'str') ? this.mcCont : this.miCont;
      ma.push(moraleToken); cont.addChild(moraleToken);
      moraleToken.x = (4 - ma.length) * this.player.panel.wh;
      moraleToken.y = 0;
      cont.stage.update();
    }

    moraleToken.onPanel = '';
    // include cb if necessary:
    const lcs = () => { place('str') }, rif = () => { place('fame') };
    (ms.length < mf.length) ? lcs() : (ms.length > mf.length) ? rif ()
      : (auto == 'str') ? lcs() : (auto == 'fame') ? rif()
      : this.player.panel.popupChoice('strength', 'fame', lcs, rif, 'Choose to Cover:')
    return moraleToken.onPanel;
  }

  removeFromStripe(moraleToken: Morale, ma: Morale[]) {
    const rm = removeEltFromArray(moraleToken, ma);
    if (rm.length > 0) ma.forEach((moraleToken, len) => {
      moraleToken.x = (3 - len) * this.player.panel.wh;
    })
  }

  override strengthInRegion(region: ChaosTile): [number, string] {
    const [str, txt] = super.strengthInRegion(region)
    const hasMor = (region.special?.isA('Morale'));
    const mor = hasMor ? this.moraleCombat : 0;
    const txm = hasMor ? `${txt}\nMorale: ${mor}` : txt;
    return [str + mor, txm] as [number, string];
  }
}
class Jrayek extends Faction {

  override pins(fot: FactionOnTile) {
    const renzo = Leader.allLeadersByName.get('Renzo')!, rup = renzo && renzo.upgraded;
    const rpins = (!fot.leaders.includes(renzo) ? 0 : rup ? 4 : 2); // +1 implicitly include
    return super.pins(fot) + rpins;
  }
}
class Oxataya extends Faction {

}

class Neutral extends Faction {}


/** alist of each Faction Constructor */
const factionsCbyName: Record<FactionName, Constructor<Faction>> = {
  Circadian: Circadian, AI: AI, Zcharo: Zcharo, Leyrien: Leyrien, Jrayek: Jrayek, Oxataya: Oxataya,
  Neutral: Neutral
} as const;

