import type { Phase } from "@thegraid/hexlib";
import type { BONUS, FAME_BONUS, HARVEST } from "./chaos-tile";
import type { PricingToken } from "./meeples";
import { type Player } from "./player";

//                          Circadian   AI   Zcharo   Leyrein   JRayek   Oxytaya
export const factionColors = ['gold', 'grey', 'blue', 'green', 'orange', 'violet', ] as const;

/** presentation name of each Faction */  // TODO: move these to Scenario & parser?
export const factionNames = ['Circadian', 'AI', 'Zcharo', 'Leyrein', 'Jrayek', 'Oxytaya'] as const;
export type FactionName = typeof factionNames[number];
export type FactionId = 0 | 1 | 2 | 3 | 4 | 5;  // at most 5 Factions in game

/** bh: HARVEST in base, bf: beginning Foundations */
export type BaseSpec = {name: FactionName, bh?: BONUS, bf?: [HARVEST, HARVEST] }
/** rb: RelicBonus, fg: foundation w/gem, serial [0..4], bg: building w/gemlock (index per type), nr: number in recruit */
export type FacSpec = {name: FactionName, rb: string[], fg: number, bg: number[][], nr: number[], ft: number, r3: BONUS } & BaseSpec;

export class Faction {
  static factionById = new Map<FactionId, Faction>();

  // Relic bonus = rb: G: Gem, F: Fame, E: Energy, M: Morale, Up: Upgrade Attribute(flip),
  // Bldg gemlock= bg: [[0, 1, 1], [0, 0, 1, 1], [0, 1]] <== Zcharo! always 9 there are
  // Base income = bi?: 3 | undefined => 2/G
  // Num recruit = nr: [8, 6, 6] initial number of Fighters in each stage & base
  // Foundation w/gem = fg: 1-4 (0 is implicit) [gem->res, ubiq harv, ubiq adj, gemlock, handlim]
  //
  // Factory: Energy2, Baracks: Card, Stronghold: Gem (--> %)
  // Stronghold = sf?: () => void;
  // Circadian: Build:restrict, Income: +region
  // Zcharo: Combat: strength
  // AI: Move: trap, Income: reset
  // Leyrein: Build: restrict, Combat: +strength, Income: +Fame
  // Jrayek: Combat: +str, +shield
  // Oxytaya: Recruit: placement option
  static facSpecs: FacSpec[] = [
    { name: 'Circadian', rb: ['G1', 'Up', 'G1', 'Up', 'Up',], fg: 2, bg: [[3, 0, 0, 0], [0, 0, 0], [1, 1, 1]], nr: [6, 2, 0, 2], ft: 3, r3: 'G1', }, // no base; 10 Fighters
    { name: 'AI', rb: ['F1', 'F2', 'F2', 'F3', 'F4',], fg: 2, bg: [[2, 0, 1, 1], [0, 0, 1, 1], [0, 1]], nr: [12, 8],       ft: 0, r3: 'G1',}, // +10 on copious
    { name: 'Zcharo', rb: ['G1', 'G1', 'G1', 'G1', 'G1',], fg: 3, bg: [[3, 0, 0, 0], [1, 1, 1], [0, 1, 1]], nr: [9, 5, 6], ft: 1, r3: 'C', },
    { name: 'Leyrein', rb: ['M0', 'F2', 'F2', 'F3', 'F3',], fg: 1, bg: [[2, 0, 0, 1], [0, 0, 1], [1, 1, 1]], nr: [8, 6, 6], ft: 1, r3: 'C',},
    { name: 'Jrayek', rb: ['E2', 'F1', 'E3', 'F1', 'F1',], fg: 2, bg: [[2, 0, 0, 1], [0, 1, 1], [0, 0, 1]], nr: [10, 4, 6], ft: 1, r3: 'C', },
    { name: 'Oxytaya', rb: ['F1', 'F1', 'F1', 'F2', 'F3',], fg: 1, bg: [[2, 0, 1, 1], [0, 0, 1], [0, 1, 1]], nr: [12, 3, 5], ft: 1, r3: 'C', },
  ];

  // Base harvest= bh?: E1, E2, G1, R1
  // Base foundations = bf: [string, string]
  static baseSpecs: BaseSpec[] = [
    { name: 'Circadian', bh: '-', bf: ['%', 'E2'] }, // no base
    { name: 'AI', bh: 'E1', bf: ['G1', 'E2'] },
    { name: 'Zcharo', bh: 'E2', bf: ['C', 'G1'] },
    { name: 'Leyrein', bh: 'E2', bf: ['C', 'E2'] },
    { name: 'Jrayek', bh: 'G1', bf: ['G1', '%'] },
    { name: 'Oxytaya', bh: 'R1', bf: ['C', 'C'] },
  ];
  static {
    // append/include baseSpecs in facSpecs:
    this.facSpecs.forEach((fs, ndx) => Object.assign(this.baseSpecs[ndx], fs));
  }
  /** display name of Faction */
  name!: FactionName;
  /** Relic BONUS on Panel */
  rb!: BONUS;
  /** Panel Foundation with Gemlock (other than 0) */
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
    const facSpec = Faction.facSpecs[facId] ?? { name: 'neutral' };
    Object.assign(this, facSpec);
    Faction.factionById.set(facId, this);
  }

  player!: Player;
  // PricingTokens available to play
  pTokens: PricingToken[] = [];

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

  /** override for phase specific checks; Faction attributes */
  checkPhase(phase: Phase) {
  }
}

