import { SetupElt as SetupEltLib, ScenarioParser as SPLib, type GamePlay, type Hex2, type HexMap } from "@thegraid/hexlib";



// { name turn coins gameState }
export interface SetupElt extends SetupEltLib {
  // tablePlayers [0..nPlayers-1] the factionIndex
  // curPlayer (index into tablePlayers, mod(len))
  // playerStateAry (representing each player board: warriors to recruit, buildings, foundations, leaders upgrade, specials)
  // factionAttribute state (which ones are upgraded)
  // chaosHex: { terrain, harvest, foundation[], playerUnits: { warriors, buildings, leaders }[], ...}
  // mapStateAry: for each Hex: { chaosHex, adjacency-LINKS }
  // foundation: {bonus, building}; building: {type, owner, foundation, trap-status?} include Relic(N)!;
  // layout: each Hex & adjacency (mtns, lakes, tunnels) <== prefer this to be in gameState.map & is invariant
  // derived in initial setup, at top of log file.
  // circadian ship has 2 adjacent hex locs
}

export class ScenarioParser extends SPLib {
  // log each phase:
  // set prices: { player, phase, token, benefit }[]   (benefit if Gem or Energy or Card or FlareGun)
  // discovery: { player, delta1, delta2? }[]
  // build: { player, foundation -> hex, building -> foundation }[]
  // harvest: { player, energy, gain[], gem?}[]             // gain: Energy, Gem, Card, Recruit, Discovery, Leader upgrade|recruit
  // recruit: { player, from-to[], cost, benefit, upgrade? }[]  (cost if fasttrack, benefit if RA -> Energy|Card)
  // move: { player, from(hex, warriors, leaders)->to(hex)}
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
}
