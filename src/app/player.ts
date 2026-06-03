import { C, Constructor, stime, type XY } from "@thegraid/common-lib";
import { RectShape, type Paintable } from "@thegraid/easeljs-lib";
import { HexMap, Meeple, newPlanner, NumCounter, Player as PlayerLib, PlayerPanel, type Hex1, type IHex2, type MapCont, type Table as TableLib, type TileSource } from "@thegraid/hexlib";
import { ChaosHex2 as Hex2, type ChaosHex2 } from "./chaos-hex";
import { type ChaosTable, type ChaosTable as Table } from "./chaos-table";
import { GamePlay } from "./game-play";
import type { Barracks, Factory, Leader, Stronghold, Warrior } from "./meeples";
import { TP } from "./table-params";
import { CardBack, CardPanel, TacticsCard } from "./tactics-card";
import { mixinHexMap } from "./game-setup";

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
  static initialCoins = 6;
  static initialGems = 0;

  // {gold: 'gold', lightblue: 'lightblue', violet: 'Violet', blue: 'blue', orange: 'orange' };
  static {
    PlayerLib.colorScheme = playerColors.reduce((pv, cv) => (pv[cv] = cv, pv), {} as Record<string, string>)
  }

  override get color(): PlayerColor { return super.color as PlayerColor; }
  override set color(c: PlayerColor) { super.color = c; }


  declare gamePlay: GamePlay;
  declare panel: ChaosPlayerPanel;
  declare table: ChaosTable;

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
    // TODO: make racks for: factory, barracks, stronghold, foundations, relics
    this.makeUnitRack(this.gamePlay.table, .75, 3);
    // this.makeCardRack(this.gamePlay.table, undefined, 6); // Player's cards on playerPanel
    // display coin counter:
    const { wide, gap } = this.panel.metrics;
    const fs = TP.hexRad * .5;
    const ic = Player.initialCoins;

    const cc = this.coinCounter = new NumCounter('coins', ic, C.YELLOW, fs); // TODO: lightening bolt?
    cc.x = 2 * gap; cc.y = cc.high / 2 + 2 * gap;
    cc.boxAlign('left');
    this.panel.addChild(cc);

    const ig = Player.initialGems;
    const gc = this.gemCounter = new NumCounter('gems', ig, C.RED, fs);
    gc.x = cc.wide + 3 * gap; gc.y = cc.high / 2 + 2 * gap;
    gc.boxAlign('left');
    this.panel.addChild(gc);
  }

  /** count gems for this player */
  gemCounter!: NumCounter;
  get gems() { return this.gemCounter?.value; }
  set gems(v) { this.gemCounter?.updateValue(v); }

  /** Hex2[] on which to place Tiles */
  readonly unitRack: Hex2[] = [];
  makeUnitRack(table: Table, row = 0, ncols = 4) {
    const rack = table.hexesOnPanel(this.panel, row, ncols) as Hex2[];
    rack.forEach((hex, n) => hex.Aname = `${this.index}R${n}`)
    this.unitRack.splice(0, this.unitRack.length, ...rack); // replace all elements
  }
  /** all Buildings on panel? make racks for each Building type? use simple array/stack? */
  get units() { return this.unitRack.map(hex => hex.tile) }

  get cardRack() { return this.panel.cardRack; }
  /** put cardRack on a movable CardPanel; PlayerPanel ISA HexMap, and cardPanel is its mapCont. */
  makeCardRack(table: Table, row?: number, ncols = 6) {
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
}

/** PlayerPanel with its own mapCont;
 * GameSetup hacks PlayerPanel.prototype to inherit HexMap
 * so ancillary methods can be found (topo, xywh)
 */
export class ChaosPlayerPanel extends PlayerPanel {
  declare mapCont: MapCont;            // player.makeCardRack() will set mapCont = cardPanel
  declare player: Player;
  readonly cardRack: Hex2[] = [];
  constructor(table: Table, player: PlayerLib, high: number, wide: number, row: number, col: number, dir?: number) {
    const hexMap = table.hexMap;
    super(table, player, high, wide, row, col, dir); // make a PlayerPanel
    Object.assign(this, hexMap);       // assign hexMap instance variables
    this.Aname = player.Aname;         // reset Aname
    this.addCardPanel(table)
  }

  addCardPanel(table: Table, row = 0, ncols = 6) {
    // ChaosPlayerPanel { this.mapCont = new CardPanel(table); this.addChild(this.mapCont); }
    const dydr = table.hexMap.xywh().dydr;
    const cardH = CardBack.bounds.height;
    const high = cardH * 1.05 / dydr;  // units of hex.dydr
    const wide = table.panelWidth;
    const cardPanel = new CardPanel(table, high, wide); // directly on table.mapCont! (so localToLocal works?)
    const pHeight = this.getBounds().height;
    row = (row !== undefined) ? row : - high * 1.025;   // dubious?
    cardPanel.y = (row < 0 ? row + pHeight/dydr : row) * dydr;
    cardPanel.makeDragable(table);
    this.mapCont = cardPanel;
    this.addChild(cardPanel); this.hexMap
    cardPanel.fillAryWithCardHex(this, this.cardRack, high/2, ncols)
  }

  // maybe a super-class of CardPanel? *any* mapCont?
  /**
   * array of colN hexes across the width of mapCont (CardPanel is the mapCont of ChaosPlayerPanel);
   *
   * Uses mapCont.getBounds(), to that must be set.
   *
   * @param cPanel panel to hold the row of hexes
   * @param row0 y coordinate of the row of hexes
   * @param colN number of hexes in the row
   * @param hexC class of hexes to create
   * @param opts { vis, gap }
   * @param gap - [0] either absolute dx OR per-unit fraction of dxdc
   * @param vis - [false] set hex.visibility
   * @returns IHex2[]
   */
  hexesOnMapCont(row0 = .75, colN = 4, hexC: Constructor<IHex2>, opts?: { vis?: boolean, gap?: number }) {
    const { vis, gap } = { vis: false, gap: 0, ...opts };
    const rv = [];
    const map = this as any as ChaosPlayerPanel & HexMap<Hex2>; // put hexes here
    const cPanel = map.mapCont;
    const table = this.player.gamePlay.table;
    // verify prototype functions and instance variables are installed:
    // GameSetup.static{} & ChaosPlayerPanel.constructor conspire to do this.
    // With backup in: table.makePlayerPanel(), and here: ChaosPlayerPanel.hexesOnMapCont
    if (!map.topo) {
      console.log(stime(this, `.assign(map=${map.name}, this.hexMap=${table.hexMap.Aname}`));
      Object.assign(map, table.hexMap);
      // assume for now that PlayerPanel has mixinAB(PlayerPanel, HexMap<Hex2>)
      if (typeof map.addToMapCont !== 'function') {
        debugger;
        mixinHexMap(PlayerPanel, HexMap<Hex2>)
      }
    }
    const { width: panelw } = cPanel.getBounds();
    const { x: xn, dydr, dxdc } = this.hexMap.xywh(undefined, 0, colN - 1); // x of last cell
    const gpix = gap < 1 ? gap * dxdc : gap;
    const dx = (panelw - xn - (colN - 1) * gpix) / 2; // allocate any extra space (width-xn) to either side
    const dy = row0 * dydr;   // y for row0
    for (let col = 0; col < colN; col++) {
        // make hex at row=0, then offset by row0 !? legacy from hextowns half-offset?
        const hex = table.newHex2(0, col, `CardPanel`, hexC, map); // child of map.mapCont.hexCont
        rv.push(hex);
        hex.cont.x += (dx + col * gpix);
        hex.cont.y = (dy);
        hex.cont.visible = vis;
        hex.legalMark.setOnHex(hex);
    }
    return rv;
  }

}
