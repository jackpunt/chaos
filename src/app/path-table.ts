import { C, type XY } from "@thegraid/common-lib";
import { ParamGUI, type DragInfo, type NamedObject, type ParamItem } from "@thegraid/easeljs-lib";
import { Stage, type Container, type DisplayObject } from "@thegraid/easeljs-module";
import { Hex2, Table, Tile, TileSource, TP, type DragContext, type IHex2 } from "@thegraid/hexlib";
import type { GamePlay } from "./game-play";
import type { Scenario } from "./game-setup";
import { CardPanel, PathCard, type CardBack } from "./path-card";
import { type HexMap2, type PathHex2 } from "./path-hex";
import { PathTile } from "./path-tile";

export class PathTable extends Table {
  constructor(stage: Stage) {
    super(stage);
    this.initialVis = true;
  }
  declare gamePlay: GamePlay;
  declare hexMap: HexMap2;
  // return type declaration:
  override hexUnderObj(dragObj: DisplayObject, legalOnly?: boolean) {
    return super.hexUnderObj(dragObj, legalOnly) as PathHex2 | undefined;
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
  override makePerPlayer(): void {
    super.makePerPlayer();
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
    const source = ms(hex);
    source.permuteAvailable();
    const { x: dx, y: dy } = { ... { x: .5, y: .5 }, ...counterXY }
    const { x, y, width, height } = hex.cont.getBounds()
    source.counter.x = hex.cont.x + (x + dx * width);
    source.counter.y = hex.cont.y + (y + dy * height);
    hex.distText.y = 0;
    return source;
  }

  override layoutTable2() {
    this.initialVis = false;
    super.layoutTable2();
    PathTile.makeAllTiles();      // populate PathTile.allTiles
    const toprow = Math.min(1, TP.nHexes - 5), lefcol = 1;
    this.makeSourceAtRowCol(PathTile.makeSource, 'tileBag', toprow, lefcol + 1.3, { y: +1.2 });
    PathTile.source.nextUnit();   // TODO: decide how many to expose; & saveState.

    const [source, discard] = PathCard.makeCardSources(this, {row: toprow + .9, col: lefcol})
    this.cardSource = source;
    this.cardDiscard = discard;

    PathCard.makeAllCards(); // populate PathCard.cardByName

    this.addDoneButton();
    this.setToRowCol(this.doneButton, toprow - .4, lefcol); // between cardDeck & discards
    this.addCardPanel();
    return;
  }

  cardSource!: TileSource<PathCard>
  cardDiscard!: TileSource<PathCard>

  cardBack!: CardBack;
  cardPanel!: CardPanel;
  get cardRack() { return this.cardPanel.cardRack }
  addCardPanel() {
    const np = 6, pindex = np; // in slot 1 (left-center)
    const [row, col, dir] = this.panelLoc(pindex, np);
    const high = this.panelHeight, wide = this.panelWidth; // aligned with PlayerPanel
    const cardPanel = this.cardPanel = new CardPanel(this, 1, wide, row - high / 2, col - wide / 2)
    cardPanel.paint(C.nameToRgbaString(C.grey128, .4))
    cardPanel.fillAryWithCardHex(this, cardPanel, cardPanel.cardRack, 1, 3)
    cardPanel.makeDragable(this)
    // interesting: cardPanel is in the display list, and is mouse sensitive,
    // but does not get painted:
    // hexCont is cached; so cardPanel does not get painted until hexCont.reCache
    // But cardPanel can be clicked and moved to dragCont where it is visible.
  }

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
  override get panelHeight() {
    return Math.max(super.panelHeight, 3.5)
  }

  override panelLocsForNp(np: number): number[] {
    return [[], [0], [0, 2], [0, 3, 2], [0, 3, 5, 2], [0, 3, 4, 5, 2], [0, 3, 4, 5, 2, 1]][np];
  }

  /** identify dragTile so it can be rotated by keybinding */
  get dragTile(): PathTile | undefined {
    const dragging = this.isDragging;
    return (dragging instanceof PathTile) ? dragging : undefined;
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
      PathTile.allPathTiles.forEach(tile => tile.paintBase(value, tColor))
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
