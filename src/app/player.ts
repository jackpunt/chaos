import { removeEltFromArray, stime } from "@thegraid/common-lib";
import { newPlanner, NumCounterBox, Player as PlayerLib, type Hex1, type NumCounter } from "@thegraid/hexlib";
import { GamePlay } from "./game-play";
import { CardPanel, PathCard } from "./path-card";
import { PathHex2 as Hex2 } from "./path-hex";
import { type PathTable as Table } from "./path-table";
import { PathTile } from "./path-tile";
import { TP } from "./table-params";

// do not conflict with AF.Colors
const playerColors = ['gold', 'lightblue', 'violet', 'blue', 'orange', ] as const;

export type PlayerColor = typeof playerColors[number];
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
    super.makePlayerBits()
    this.makeTileRack(this.gamePlay.table, .75, 3);
    this.makeCardRack(this.gamePlay.table, 2.5, 3); // Player's cards on playerPanel
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
  // here because: used by PathCard & PathTile; rack pro'ly belongs to this player
  rackSwap(fromHex: Hex1, toHex: Hex1, rack: Hex1[]) {
    return rack.includes(fromHex) && rack.includes(toHex)
  }

  readonly tileRack: Hex2[] = [];
  makeTileRack(table: Table, row = 0, ncols = 4) {
    const rack = table.hexesOnPanel(this.panel, row, ncols) as Hex2[];
    rack.forEach((hex, n) => hex.Aname = `${this.index}R${n}`)
    this.tileRack.splice(0, this.tileRack.length, ...rack); // replace all elements
  }
  get tiles() { return this.cardRack.map(hex => hex.tile) }

  /** placeTile on Player's panel, in empty hex. */
  addTile(tile?: PathTile ) {
    const hex2 = this.tileRack.find(hex => !hex.tile) as Hex2;
    if (!hex2) return;
    if (!tile) tile = PathTile.source.takeUnit();
    tile?.placeTile(hex2);
    return tile;
  }

  /** Draw tiles into tileRack until it is full. */
  fillTileRack() {
    while (this.tileRack.find(hex => !hex.tile) && this.addTile()) { }
  }

  readonly cardRack: Hex2[] = [];
  makeCardRack(table: Table, row = 0, ncols = 4) {
    const cardPanel = new CardPanel(table, 0, 0); // infintessimal 'panel'; just for XY.
    this.panel.addChild(cardPanel);
    cardPanel.fillAryWithCardHex(table, this.panel, this.cardRack, row, ncols)
  }

  addCard(card?: PathCard) {
    const hex2 = this.cardRack.find(hex => !hex.tile) as Hex2;
    if (!hex2) return;
    if (!card) card = PathCard.source.takeUnit();
    card?.placeTile(hex2);
    return card;

  }
  /** for ScenarioParser.saveState() */ // TODO: code cards with index, or string->card
  get cards() { return this.cardRack.map(hex => hex.tile) }

  /** rules in Player's cardRack */
  get cardRules() {
    return this.cardRack.filter(h => h.card).map(h => h.card!.rule);
  }

  get myTiles() { return PathTile.allPathTiles.filter(tile => tile.hex?.isOnMap && tile.player === this) }
  // Each of myTiles has a Network that appears in allNetworks:
  // ASSERT: tileToNetwork.values.forEach(net => allNetworks.includes(net));
  tileToNetwork = new Map<PathTile, Network>();
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
  adjustNetwork(tile: PathTile, add = tile.hex?.isOnMap && tile.player == this) {
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

  removeNetwork(tile: PathTile) {
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
  addToNetwork(tile: PathTile) {
    // assert: all OWNED tiles are on a Hex1 (even if not tile.isOnMap)
    const myLinks = (tile: PathTile) => (tile.hex as Hex1).linkHexes.filter(h => h.tile?.player == this) as HexT[];
    const myAdjTiles = (tile: PathTile) => myLinks(tile).map(hext => hext.tile);
    const newNet = (tile: PathTile) => {
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
type HexT = Hex1 & { tile: PathTile } // with definite PathTile
/** collection of Tiles mutually linked by adjacency, of same Player */
type Network = Array<PathTile>;
