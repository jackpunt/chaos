import { Constructor, removeEltFromArray, stime, type XY } from "@thegraid/common-lib";
import { RectShape, type Paintable } from "@thegraid/easeljs-lib";
import { Meeple, newPlanner, NumCounter, NumCounterBox, Player as PlayerLib, type Hex1, type TileSource } from "@thegraid/hexlib";
import { ChaosHex2 as Hex2, type ChaosHex2 } from "./chaos-hex";
import { type ChaosTable as Table } from "./chaos-table";
import { ChaosTile } from "./chaos-tile";
import { GamePlay } from "./game-play";
import type { Barracks, Factory, Leader, Stronghold, Warrior } from "./meeples";
import { TP } from "./table-params";
import { CardPanel, TacticsCard } from "./tactics-card";

// Faction colors, aligned with gameSetup.factionNames
//                  Circadian   AI       Zcharo    Leyrein   JRayek   Oxytaya
const playerColors = ['gold', 'grey', 'lightblue', 'green', 'orange', 'violet', ] as const;
export type PlayerColor = typeof playerColors[number];

// meeple.startHex retains initial hex for meeple.unMove
const fids = ['stronghold', 'gemlock', 'harvest', 'adjacent', 'handlimit'] as const;
type FoundationId = typeof fids[number];

/** per-Player bits on PlayerPanel */
class PlayerBits {
  leaders: Leader[] = [ ];              // LeaderCard is a Tile, leader.homeHex is tile.hex (tile: card, meep: leader)
  warriors!: TileSource<Warrior>[];     // TileSource[n] for each stage of Recruit (Base is ChaosTile, sans foundations)
  factorys!: TileSource<Factory>;       // Spread TileSource.filterUnits((u)=>!u.hex.isOnMap) across board
  barracks!: TileSource<Barracks>;      // Spread TileSource.filterUnits((u)=>!u.hex.isOnMap) across board
  strongholds!: TileSource<Stronghold>; // Spread TileSource.filterUnits((u)=>!u.hex.isOnMap) across board
  foundations!: Record<FoundationId, ChaosHex2>; // the 5 foundations in their places
  // extend with Morale[], AI_Trap[], RhyzuToken[]
}


/** Tile/Meeple with a player.rack on which to put them.
 *
 * for: factory, barrack, stronghold, foundation, relic (rhy-zu, morale-strength, morale-fame)
 */
class Rackable extends Meeple {
  /**
   *
   * @param Aname
   * @param player
   * @param opts
   * -- offset: XY on player board
   */
  constructor(Aname: string, player: Player, opts: { claz: Constructor<Meeple>, n: number, offset: XY }) {
    super(Aname, player);
  }
  /** @param size [1] meepleRadius, scale from default */
  override makeShape(size = 1): Paintable {
    // super.makeShape(size); // -> MeepleShape(size)
    const w = size, h = size, fillc = this.player?.color;
    return new RectShape({ x: -w/2, y: -h/2, w, h }, fillc, ''); // TODO: more explicit shapes for each...
  }
}


export class Player extends PlayerLib {
  static initialCoins = 400;
  // {gold: 'gold', lightblue: 'lightblue', violet: 'Violet', blue: 'blue', orange: 'orange' };
  static {
    PlayerLib.colorScheme = playerColors.reduce((pv, cv) => (pv[cv] = cv, pv), {} as Record<string, string>)
  }

  override get color(): PlayerColor { return super.color as PlayerColor; }
  override set color(c: PlayerColor) { super.color = c; }


  declare gamePlay: GamePlay;

  constructor(index: number, gamePlay: GamePlay) {
    super(index, gamePlay);
  }
  override get cname(): string | undefined {
    return this.gamePlay.gameSetup.factionNames[this.index];
  }

  /**
   * Before start each new game.
   *
   * [make newPlanner for this Player]
   */
  override newGame(gamePlay: GamePlay, url = TP.networkUrl) {
    super.newGame(gamePlay, url);
    this.planner = newPlanner(gamePlay.hexMap, this.index)
  }
  // only invoked on the newly curPlayer!
  override newTurn() {
    // nothing to do... until 'Move' action.
    // this.ships.forEach(ship => ship.newTurn());
    // return;
  }

  /** if Planner is not running, maybe start it; else wait for GUI */ // TODO: move Table.dragger to HumanPlanner
  override playerMove(useRobo = this.useRobo, incb = 0) {
    let running = this.plannerRunning
    // feedback for KeyMove:

    TP.log > 0 && console.log(stime(this, `(${this.plyrId}).playerMove(${useRobo}): useRobo=${this.useRobo}, running=${running}`))
    if (running) return
    if (useRobo || this.useRobo) {
      // continue any semi-auto moves
    }
    return      // robo or GUI will invoke gamePlay.doPlayerMove(...)
  }

  // Test/demo EditNumber
  override makePlayerBits(): void {
    super.makePlayerBits();  // this.coinCounter = new NumCounter('coins', 0)
    // make racks for: factory, barracks, stronghold, foundations, relics
    this.makeUnitRack(this.gamePlay.table, .75, 3);
    this.makeCardRack(this.gamePlay.table, 2.5, 6); // Player's cards on playerPanel
    // display coin counter:
    const { wide, gap } = this.panel.metrics;
    const fs = TP.hexRad * .7;
    const ic = this.coins;
    const cc = this.coinCounter = new NumCounterBox('coins', ic, undefined, fs);
    cc.x = wide - 2 * gap; cc.y = cc.high / 2 + 2 * gap;
    cc.boxAlign('right');
    this.panel.addChild(cc);

    const nn = this.netNumNetsCounter = new NumCounterBox('net', 0, 'violet', fs)
    nn.x = 2 * gap; nn.y = cc.high / 2 + 2 * gap;
    nn.boxAlign('left');
    this.panel.addChild(nn);

    const mnl = this.netMaxLenCounter = new NumCounterBox('net', 0, 'violet', fs)
    mnl.x = nn.wide + 3 * gap; mnl.y = cc.high / 2 + 2 * gap;
    mnl.boxAlign('left');
    this.panel.addChild(mnl);
  }

  /** count gems for this player */
  gemCounter = new NumCounter('gems', 0); // set by layoutCounters: `${'Coin'}Counter`
  get gems() { return this.gemCounter?.value; }
  set gems(v) { this.gemCounter?.updateValue(v); }


  netMaxLenCounter!: NumCounter;
  netNumNetsCounter!: NumCounter;

  updateNetCounters() {
    this.allNetworks.sort((a, b) => b.length - a.length); // descending length
    const nn = this.allNetworks.length;
    if (nn > 0) {
      this.netMaxLenCounter.updateValue(this.allNetworks[0].length)
      this.netNumNetsCounter.updateValue(nn)
    }
  }
  // here because: used by TacticsCard & ChaosTile; rack pro'ly belongs to this player
  rackSwap(fromHex: Hex1, toHex: Hex1, rack: Hex1[]) {
    return rack.includes(fromHex) && rack.includes(toHex)
  }

  /** Hex2[] on which to place Tiles */
  readonly unitRack: Hex2[] = [];
  makeUnitRack(table: Table, row = 0, ncols = 4) {
    const rack = table.hexesOnPanel(this.panel, row, ncols) as Hex2[];
    rack.forEach((hex, n) => hex.Aname = `${this.index}R${n}`)
    this.unitRack.splice(0, this.unitRack.length, ...rack); // replace all elements
  }
  /**
   * all buildings on panel?
   */
  get units() { return this.unitRack.map(hex => hex.tile) }

  readonly cardRack: Hex2[] = [];
  makeCardRack(table: Table, row = 0, ncols = 4) {
    const cardPanel = new CardPanel(table, 0, 0); // infintessimal 'panel'; just for XY.
    this.panel.addChild(cardPanel);
    cardPanel.fillAryWithCardHex(table, this.panel, this.cardRack, row, ncols)
  }

  addCard(card?: TacticsCard) {
    const hex2 = this.cardRack.find(hex => !hex.tile) as Hex2;
    if (!hex2) return;
    if (!card) card = TacticsCard.source.takeUnit();
    card?.placeTile(hex2);
    return card;

  }
  /** for ScenarioParser.saveState() */ // TODO: code cards with index, or string->card
  get cards() { return this.cardRack.map(hex => hex.tile) }

  /** rules in Player's cardRack */
  get cardRules() {
    return this.cardRack.filter(h => h.card).map(h => h.card!.phaseEffect);
  }

  get myTiles() { return ChaosTile.allChaosTiles.filter(tile => tile.hex?.isOnMap && tile.player === this) }
  // Each of myTiles has a Network that appears in allNetworks:
  // ASSERT: tileToNetwork.values.forEach(net => allNetworks.includes(net));
  tileToNetwork = new Map<ChaosTile, Network>();
  // Each of myTiles appears exactly ONCE in allNetworks.
  // ASSERT: elements are disjoint; concat(...allNetworks) === myTiles
  allNetworks: Array<Network> = [];

  /** map each Tile [owned by this Player] to a Network */
  mapAllNetworks() {
    this.tileToNetwork.clear();
    this.allNetworks.length = 0;
    this.myTiles.forEach(tile => this.addToNetwork(tile))
    this.updateNetCounters();
  };

  /** add or remove Tile from its Network */
  adjustNetwork(tile: ChaosTile, add = tile.hex?.isOnMap && tile.player == this) {
    if (add) {
      // if Shift-drop moves tile to new hex:
      if (this.tileToNetwork.get(tile)) this.removeNetwork(tile);
      // add tile to this Player's network:
      this.addToNetwork(tile);
    } else {
      // remove tile from this Player's network:
      this.removeNetwork(tile)
    }
    this.updateNetCounters();
  }

  removeNetwork(tile: ChaosTile) {
    const tileNet = this.tileToNetwork.get(tile);
    if (tileNet) {
      removeEltFromArray(tile, tileNet)
      this.tileToNetwork.delete(tile)
      if (tileNet.length === 0) {
        removeEltFromArray(tileNet, this.allNetworks)
      }
    }
  }

  /** when ADD tile to map */
  addToNetwork(tile: ChaosTile) {
    // assert: all OWNED tiles are on a Hex1 (even if not tile.isOnMap)
    const myLinks = (tile: ChaosTile) => (tile.hex as Hex1).linkHexes.filter(h => h.tile?.player == this) as HexT[];
    const myAdjTiles = (tile: ChaosTile) => myLinks(tile).map(hext => hext.tile);
    const newNet = (tile: ChaosTile) => {
      const net = [tile];
      this.allNetworks.push(net);
      this.tileToNetwork.set(tile, net);
      return net;
    }
    const tileN = this.tileToNetwork.get(tile) ?? newNet(tile);
    // merge all linked tiles into one Network
    const adjTiles = myAdjTiles(tile)
    adjTiles.forEach(tAdj => {
      const adjNet = this.tileToNetwork.get(tAdj); // expect at least [tAdj]
      // first time we find an element of adjNet, move ALL of them to tileN
      if (adjNet && this.allNetworks.includes(adjNet) && adjNet !== tileN) {
        removeEltFromArray(adjNet, this.allNetworks); // remove once
        tileN.push(...adjNet);
        adjNet.forEach(netT => this.tileToNetwork.set(netT, tileN)); // point to new network
      }
      // this.tileToNetwork.set(tAdj, tileN); // adjNet has been merged into tileN
    })
  };

}
type HexT = Hex1 & { tile: ChaosTile } // with definite PathTile
/** collection of Tiles mutually linked by adjacency, of same Player */
type Network = Array<ChaosTile>;
