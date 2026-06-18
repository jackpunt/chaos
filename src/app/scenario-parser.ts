import { stime } from "@thegraid/common-lib";
import { SetupElt as SetupEltLib, ScenarioParser as SPLib, } from "@thegraid/hexlib";
import type { HexMap2 } from "./chaos-hex";
import type { FactionId } from "./factions";
import type { GamePlay } from "./game-play";

type CardId = string; // from CardSpec.id

type LeaderS = string; // LeaderName | LeaderName* if upgraded; on Card unless appears in FactionOnTile
interface FactionState {
  coins: number;
  gems: number;
  cards: CardId[];
  leaders: LeaderS[]; // typeof keyof AllLeaderNames & Rhyzu!
  recruits: number[];  // fighters in each stage of recruit (& Base) see FactionSpec.nr
  relics: string[];    // "Rn" for each Relic collected
  // all from Player.playerBits
}

export interface FactionOnTileState {
  l?: LeaderS[];                   // 2 slots (own + Rhyzu), Zcharo: 4, Oxytaya: 4
  f?: number;                     // Fighters in region
  b?: ('F'|'B'|'S')[];            // if this Faction has buildings on tile, ordered by foundation index
  s?: 'M1' | 'M2' | 'T1' | 'T0';  // Morale: 'M1' | 'M2', AI_Trap: 'T1' | 'T0'
}

interface TileState {
  foundations?: string[];  // ["F5.1", "R0C"]    Relic Foundations: R1E, R2G, R3C, R4%, R5%, R6, R0E, R0G, R0C
  // pull foundations from Faction board, placement is monotonic.
  // install Relic if Round <= n; Assert: Phase < CheckRelic

  presence?: Record<FactionId, FactionOnTileState>;
}

type RCS = string; // Hex.rcs() Row, Col string: "[r,c]"
type TileStates = Record<RCS, TileState>;  // { "[1,1]" : { "1" : { leaders: [], fighters: 3, buildings: ["S"], special: "T1" } } }


// { name turn coins gameState }
// tablePlayers [0..nPlayers-1] the factionIndex
// curPlayer (index into tablePlayers, mod(len))
// playerStateAry (representing each player board: fighters to recruit, buildings, foundations, leaders upgrade, specials)
// factionAttribute state (which ones are upgraded)
// chaosHex: { terrain, harvest, foundation[], playerUnits: { fighters, buildings, leaders }[], ...}
// mapStateAry: for each Hex: { chaosHex, adjacency-LINKS }
// foundation: {bonus, building}; building: {type, owner, foundation, trap-status?} include Relic(N)!;
// layout: each Hex & adjacency (mtns, lakes, tunnels) <== prefer this to be in gameState.map & is invariant
// derived in initial setup, at top of log file.
// circadian ship has 2 adjacent hex locs

export interface SetupElt extends SetupEltLib {

  p6ary?: number[];        // permutations (0..5) of the xtraTiles for 3, 4 and 5 Player games
  Aname?: string;          // from initial setup
  gameState?: any[];       // from GameState.saveState()
  plyrStates?: FactionState[];
  tileStates?: TileStates;
}

export class ScenarioParser extends SPLib {
  // log each phase:
  // set prices: { player, phase, token, benefit }[]   (benefit if Gem or Energy or Card or FlareGun)
  // discovery: { player, delta1, delta2? }[]
  // build: { player, foundation -> hex, building -> foundation }[]
  // harvest: { player, energy, gain[], gem?}[]             // gain: Energy, Gem, Card, Recruit, Discovery, Leader upgrade|recruit
  // recruit: { player, from-to[], cost, benefit, upgrade? }[]  (cost if fasttrack, benefit if RA -> Energy|Card)
  // move: { player, from(hex, fighters, leaders)->to(hex)}
  // combat: { player, hex, defender; ... wheel, gem, dice; strengths & victor, wounds } []
  // income: { player, ... benefit, redeploy, upgrade attribute, gems }[]
  // relics: { player?, benefits[], move}

  /**
   * 3 cases of SetupElt[0]
   * a. (turn == undefined) initialize a new game, write out planetSpec/afSpec.
   * b. (turn == -1) special record with planetSpec/afSpec
   * c. (turn >= 0) normal start of turn; do NOT set planets/afSpec!
   *
   * @param setup
   */

  declare gamePlay: GamePlay;

  override parseScenario(setup: SetupElt): void {
    console.info(stime(this, `.parseScenario: curState =`), this.saveState()); // log current state for debug...
    console.log(stime(this, `.parseScenario: newState =`), setup);
    const { p6ary, plyrStates, gameState } = setup;
    const gamePlay = this.gamePlay, table = gamePlay.table;

    if (p6ary) {
      (gamePlay.hexMap as HexMap2).setupMapTiles( );
    }
    this.gamePlay.hexMap.update();
  }
}
