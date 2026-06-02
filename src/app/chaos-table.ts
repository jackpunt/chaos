import { C, stime, type Constructor, type XY } from "@thegraid/common-lib";
import { ParamGUI, type DragInfo, type NamedObject, type ParamItem } from "@thegraid/easeljs-lib";
import { Stage, type Container, type DisplayObject } from "@thegraid/easeljs-module";
import { Hex2, HexMap, PlayerPanel, Table, Tile, TileSource, TP, type DragContext, type IHex2, type MapCont, type Player } from "@thegraid/hexlib";
import { type ChaosHex2, type HexMap2 } from "./chaos-hex";
import { ChaosTile } from "./chaos-tile";
import type { GamePlay } from "./game-play";
import { mixinHexMap } from "./game-setup";
import { ChaosPlayerPanel } from "./player";
import { CardPanel, TacticsCard, type CardBack } from "./tactics-card";

export class ChaosTable extends Table {
  constructor(stage: Stage) {
    super(stage);
    this.initialVis = true;
  }
  declare gamePlay: GamePlay;
  declare hexMap: HexMap2;
  // return type declaration:
  override hexUnderObj(dragObj: DisplayObject, legalOnly?: boolean) {
    return super.hexUnderObj(dragObj, legalOnly) as ChaosHex2 | undefined;
  }

  // bgRect tall enough for 3 X 3.5 player panels
  override bgXYWH(x0?: number, y0?: number, w0?: number, h0 = 1, dw?: number, dh?: number): { x: number; y: number; w: number; h: number; } {
    const { dxdc, dydr } = this.hexMap.xywh();
    const { height } = this.hexMap.mapCont.hexCont.getBounds(), h = height / dydr;
    const h1 = (Math.max(h, 3 * 3.5 + .5) - h);
    return super.bgXYWH(x0, y0, w0, h0 + h1, dw, dh)
  }

  override layoutTable(gamePlay: GamePlay): void {
    const { table, hexMap, gameSetup } = gamePlay;
    super.layoutTable(gamePlay);
  }

  // panel with Hex for each of PlayerBits
  override makePerPlayer(): void {
    super.makePerPlayer(); // makePlayerPanel(); makePlayerBits(); setPlayerScore
  }

  override toggleText(vis = !this.isVisible): void {
    this.newHexes.forEach(hex => hex.showText(vis))
    super.toggleText(vis);
  }

  makeSourceAtRowCol<T extends Tile>(ms: (hex: Hex2) => TileSource<T>,
    name = 'tileSource', row = 1, col = 1, counterXY?: Partial<XY>,
    hexC = this.hexC,
  ) {
    const hex = this.newHex2(row, col, name, hexC) as IHex2;
    this.setToRowCol(hex.cont, row, col); // on hexCont!??
    const source = ms(hex);     // some overload of Tile.makeSource0()
    source.permuteAvailable();
    const { x: dx, y: dy } = { x: .5, y: .5 , ...counterXY }
    const { x, y, width, height } = hex.cont.getBounds()
    source.counter.x = hex.cont.x + (x + dx * width);
    source.counter.y = hex.cont.y + (y + dy * height);
    hex.distText.y = 0;
    return source;
  }

  override layoutTable2() {
    this.initialVis = false;
    super.layoutTable2();
    const toprow = Math.min(1, TP.nHexes - 5), lefcol = 1;

    const [source, discard] = TacticsCard.makeCardSources(this, {row: toprow + .9, col: lefcol})
    this.cardSource = source;
    this.cardDiscard = discard;

    TacticsCard.makeAllCards(); // populate PathCard.cardByName

    this.addDoneButton();
    this.setToRowCol(this.doneButton, toprow - .4, lefcol); // between cardDeck & discards
    return;
  }

  cardSource!: TileSource<TacticsCard>
  cardDiscard!: TileSource<TacticsCard>

  cardBack!: CardBack;    // created & set from tactics-card.makeCardSources

  /**
   * last action of curPlayer is to draw their next tile.
   */
  override addDoneButton() {
    const rv = super.addDoneButton(undefined, 0, 0); // table.doneButton('Done')
    this.orig_doneClick = this.orig_doneClick ?? this.doneClicked; // override
    this.doneClicked = (evt) => {
      this.gamePlay.playerDone();
      this.orig_doneClick(evt);          // this.gamePlay.phaseDone();
    };
    this.doneButton.activate(true)
    return rv;
  }
  orig_doneClick!: (evt?: any) => void;

  override get panelHeight() { return Math.max(super.panelHeight, 3.8) }
  override get panelWidth() { return 6.5 }

  override panelLocsForNp(np: number): number[] {
    return [[], [0], [0, 2], [0, 3, 2], [0, 3, 5, 2], [0, 3, 4, 5, 2], [0, 3, 4, 5, 2, 1]][np];
  }

  declare playerPanel: ChaosPlayerPanel;

  override makePlayerPanel(table: Table, player: Player, high: number, wide: number, row: number, col: number, dir = -1): PlayerPanel {
    const playerPanel = new ChaosPlayerPanel(table, player, high, wide, row - high / 2, col - wide / 2, dir);
    return playerPanel;
  }

  // maybe a super-class of CardPanel? *any* mapCont?
  /** array of colN hexes across the width of panel, at row0 */
  /**
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
  hexesOnCardPanel(cPanel: CardPanel, row0 = .75, colN = 4, hexC: Constructor<IHex2>, opts?: { vis?: boolean, gap?: number }) {
    const { vis, gap } = { vis: false, gap: 0, ...opts };
    const rv = [];
    const map = cPanel.parent as PlayerPanel & HexMap<Hex2>; // put hexes here
    // verify prototype functions and instance variables are installed:
    // GameSetup.static{} & ChaosPlayerPanel.constructor conspire to do this.
    // With backup in: table.makePlayerPanel(), and here: table.hexesOnCardPanel
    if (!map.topo) {
      console.log(stime(this, `.assign(map=${map.name}, this.hexMap=${this.hexMap.Aname}`));
      Object.assign(map, this.hexMap);
      // assume for now that PlayerPanel has mixinAB(PlayerPanel, HexMap<Hex2>)
      if (typeof map.addToMapCont !== 'function') {
        debugger;
        mixinHexMap(PlayerPanel, HexMap<Hex2>)
      }
    }
    const x0 = 0, y0 = 0;
    // const { x: x0, y: y0 } = this.hexMap.xyFromMap(panel, 0, 0); // offset from hexCont to panel
    // when ON the panel, do not subtract x0, y0!
    const { width: panelw } = cPanel.getBounds();
    const { x: xn, dydr, dxdc } = this.hexMap.xywh(undefined, 0, colN - 1); // x of last cell
    const gpix = gap < 1 ? gap * dxdc : gap;
    const dx = (panelw - xn - (colN - 1) * gpix) / 2; // allocate any extra space (width-xn) to either side
    const dy = row0 * dydr;   // y for row0
    for (let col = 0; col < colN; col++) {
        // make hex at row=0, then offset by row0 !? legacy from hextowns half-offset?
        const hex = this.newHex2(0, col, `CardPanel`, hexC, map); // child of map.mapCont.hexCont
        rv.push(hex);
        hex.cont.x += (dx - x0 + col * gpix);
        hex.cont.y = (dy - y0);
        hex.cont.visible = vis;
        hex.legalMark.setOnHex(hex);
    }
    return rv;
  }

  /**
   * @param row
   * @param col
   * @param name
   * @param claz
   * @param map [this.hexMap] { mapCont: MapCont }
   * @returns
   */
  override newHex2(row = 0, col = 0, name: string, claz: Constructor<IHex2> = this.hexC, map: { mapCont: MapCont } = this.hexMap) {
    const hex = new claz(map, row, col, name);
    hex.distText.text = name;
    this.newHexes.push(hex);
    return hex
  }

  /** identify dragTile so it can be rotated by keybinding */
  get dragTile(): ChaosTile | undefined {
    const dragging = this.isDragging;
    return (dragging instanceof ChaosTile) ? dragging : undefined;
  }

  override startGame() {
    super.startGame();         // allTiles.makeDragable(); setNextPlayer()
    this.gamePlay.gameState.start();   // gamePlay.phase(startPhase); enable GUI to drive game
  }

  override markLegalHexes(tile: Tile, ctx: DragContext): number {
    ctx.gameState = this.gamePlay.gameState; // gameState->gamePlay->table->cardPanel->rules
    return super.markLegalHexes(tile, ctx);
  }

  // debug copy; do not keep
  override dragFunc(tile: Tile, info: DragInfo) {
    const hex = this.hexUnderObj(tile); // clickToDrag 'snaps' to non-original hex!
    this.dragFunc0(tile, info, hex);
  }

  override makeParamGUI(parent: Container, x = 0, y = 0) {
    const gui = new ParamGUI(TP, { textAlign: 'right' });
    gui.name = (gui as NamedObject).Aname = 'ParamGUI';
    const gameSetup = this.gamePlay.gameSetup;
    gui.makeParamSpec('hexRad', [30, 45, 60, 90,], { fontColor: 'red' }); TP.hexRad;
    gui.makeParamSpec('nHexes', [2, 3, 4, 5, 6, 7, 8, 9,], { fontColor: 'red' }); TP.nHexes;
    gui.spec("hexRad").onChange = (item: ParamItem) => { gameSetup.restart({ hexRad: item.value }) }
    gui.spec("nHexes").onChange = (item: ParamItem) => { gameSetup.restart({ nh: item.value }) }

    const setColor = (value: string) => {
      const tColor = C.pickTextColor(value);
      ChaosTile.allChaosTiles.forEach(tile => tile.paintBase(value, tColor))
    }
    const colors = [C.black, C.white];
    gui.makeParamSpec('color', colors).onChange = (item: ParamItem) => setColor(item.value);

    parent.addChild(gui)
    gui.x = x; gui.y = y
    gui.makeLines();
    setColor(colors[0]);
    return gui
    }
}
