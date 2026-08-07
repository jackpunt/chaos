import { AliasLoader } from "@thegraid/easeljs-lib";
import type { Phase } from "@thegraid/hexlib";
import { ChaosTile, type BONUS, type FAME_BONUS, type HARVEST } from "./chaos-tile";
import type { LeaderName, PricingToken } from "./meeples";
import { type Player } from "./player";
import { TP } from "./table-params";
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

/**                          Circadian   AI   Zcharo   Leyrien   JRayek   Oxytaya   (& Neutral: brown) */
export const factionColors = ['gold', 'grey', 'blue', 'green', 'orange', 'violet', ] as const;
type FactionColor = typeof factionColors[number];

/** presentation name of each Faction */  // TODO: move these to Scenario & parser?
export const factionNames = ['Circadian', 'AI', 'Zcharo', 'Leyrien', 'Jrayek', 'Oxytaya'] as const;
export const factionNeutral = ['Circadian', 'AI', 'Zcharo', 'Leyrien', 'Jrayek', 'Oxytaya', 'Neutral'] as const;
export type FactionName = typeof factionNeutral[number];
export type FactionId = 0 | 1 | 2 | 3 | 4 | 5;  // at most 5 Factions in game

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
  // Oxytaya: Recruit: placement option
  static factionById = new Map<FactionId, Faction>();

  // Relic bonus = rb: G: Gem, F: Fame, E: Energy, M: Morale, Up: Upgrade Attribute(flip),
  // Bldg gemlock= bg: [[0, 1, 1], [0, 0, 1, 1], [0, 1]] <== Zcharo! always 9 there are
  // Base income = bi?: 3 | undefined => 2/G
  // Num recruit = nr: [8, 6, 6] initial number of Fighters in each stage & base
  // Foundation w/gem = fg: 1-4 (0 is implicit) [gem->res, ubiq harv, ubiq adj, gemlock, handlim]
  static facSpecs: FacSpec[] = [
    { name: 'Circadian', rb: ['G1', 'Up', 'G1', 'Up', 'Up',], fg: 2, bg: [[3, 0, 0, 0], [0, 0, 0], [1, 1, 1]], nr: [6, 2, 0, 2], ft: 3, r3: 'G1', }, // no base; 10 Fighters
    { name: 'AI', rb: ['F1', 'F2', 'F2', 'F3', 'F4',], fg: 2, bg: [[2, 0, 1, 1], [0, 0, 1, 1], [0, 1]], nr: [12, 8],       ft: 0, r3: 'G1',}, // +10 on copious
    { name: 'Zcharo', rb: ['G1', 'G1', 'G1', 'G1', 'G1',], fg: 3, bg: [[3, 0, 0, 0], [1, 1, 1], [0, 1, 1]], nr: [9, 5, 6], ft: 1, r3: 'C', },
    { name: 'Leyrien', rb: ['M0', 'F2', 'F2', 'F3', 'F3',], fg: 1, bg: [[2, 0, 0, 1], [0, 0, 1], [1, 1, 1]], nr: [8, 6, 6], ft: 1, r3: 'C',},
    { name: 'Jrayek', rb: ['E2', 'F1', 'E3', 'F1', 'F1',], fg: 2, bg: [[2, 0, 0, 1], [0, 1, 1], [0, 0, 1]], nr: [10, 4, 6], ft: 1, r3: 'C', },
    { name: 'Oxytaya', rb: ['F1', 'F1', 'F1', 'F2', 'F3',], fg: 1, bg: [[2, 0, 1, 1], [0, 0, 1], [0, 1, 1]], nr: [12, 3, 5], ft: 1, r3: 'C', },
  ];

  // Base harvest= bh?: E1, E2, G1, R1
  // Base foundations = bf: [string, string]
  static baseSpecs: BaseSpec[] = [
    { name: 'Circadian', bh: '-', bf: ['%', 'E2'] }, // no base; ship can do 1 harvest without a building
    { name: 'AI', bh: 'E1', bf: ['G1', 'E2'] },
    { name: 'Zcharo', bh: 'E2', bf: ['C', 'G1'] },
    { name: 'Leyrien', bh: 'E2', bf: ['C', 'E2'] },
    { name: 'Jrayek', bh: 'G1', bf: ['G1', '%'] },
    { name: 'Oxytaya', bh: 'R1', bf: ['C', 'C'] },
  ];

  /** identify bonuses awarded on each faction's fameTrack */
  static fameTrackSpecs: Record<number, FAME_BONUS>[] = [
    { 1: 'M1', 2: 'E1', 4: 'Win' },                              // Circadian
    { 5: 'E1', 10: 'G1', 13: 'R1', 18: 'Win' },                  // AI
    { 3: 'E1', 5: 'R1', 8: 'E1', 13: 'R1', 18: 'C', 20: 'End' }, // Zcharo
    { 1: 'R1', 3: 'R1', 5: '%', 7: 'R1', 8: 'R1', 11: 'G1', 14: 'Win' },  // Leyrien
    { 1: 'E2', 2: 'E2', 3: 'R2', 4: 'G1', 5: 'Win' },            // Jrayek
    { 1: 'E1', 3: 'G1', 5: '%', 7: 'C', 9: 'Win' },              // Oxytaya
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
  rb!: BONUS;
  /** Panel Foundation with Gemlock (other than 0: Stronghold_Gem -> Research) */
  fg!: number;
  /** Foundations w/Gemlock (for the 5 Panel Foundations) */
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

  constructor(facId: FactionId) {
    this.facId = facId;
    const facSpec = Faction.facSpecs[facId] ?? { name: 'Neutral', bh: '-' };
    Object.assign(this, facSpec);
    Faction.factionById.set(facId, this);
  }

  player!: Player;
  // PricingTokens available to play
  pTokens: PricingToken[] = [];

  leaders: LeaderName[] = [];

  get coins() { return this.player.coinCounter?.value; }
  set coins(v) { this.player.coinCounter?.updateValue(v); }

  get gems() { return this.player.coinCounter?.value; }
  set gems(v) { this.player.coinCounter?.updateValue(v); }

  facId!: FactionId;
  fColor = factionColors[this.facId];
  facName: FactionName = this.name;

  _fame = 0;
  fameTrack = [] as FAME_BONUS[];

  get fame() { return this._fame; } // readonly

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

  makeBaseTile(player: Player) {
    const bh = this.bh!;
    const base = new ChaosTile(`${this.name}Base`, 'Base', bh, player); // we really should be subclassing for Neutral... (& Circadian)
    const image = AliasLoader.loader.getBitmap(this.name);
    const si = .8;
    image.scaleX *= si;
    image.scaleY *= si;
    image.y  -= TP.hexRad * .3;
    base.addChild(image)
    return base;
  }

  /** override for phase specific checks; Faction attributes */
  checkPhase(phase: Phase) {
  }
}

