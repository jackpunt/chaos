import { arrayN, C, F, type Constructor, type XY, type XYWH } from "@thegraid/common-lib";
import { AliasLoader, NamedContainer, ParamGUI, type NamedObject, type ParamItem, type RectShape } from "@thegraid/easeljs-lib";
import { Stage, type Container, type DisplayObject } from "@thegraid/easeljs-module";
import { Hex2, Table, Tile, TileSource, TP, type IHex2, type MapCont, type Player as PlayerLib } from "@thegraid/hexlib";
import { TokenHex, type ChaosHex2, type HexMap2 } from "./chaos-hex";
import { ChaosTile } from "./chaos-tile";
import { factionColors, factionNeutral, type FactionId } from "./factions";
import type { GamePlay } from "./game-play";
import { PTokenShape, Relic } from "./meeples";
import { Panel, Player } from "./player";
import { TacticsCard, type CardBack } from "./tactics-card";

export class ChaosTable extends Table {
  constructor(stage: Stage) {
    stage.removeAllChildren();  // prior scaleCont...
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
  override bgXYWH(x0?: number, y0?: number, w0 = 15, h0 = 1, dw?: number, dh?: number): { x: number; y: number; w: number; h: number; } {
    const { dxdc, dydr } = this.hexMap.xywh();
    const { height } = this.hexMap.mapCont.hexCont.getBounds(), h = height / dydr;
    const ph = this.panelHeight;
    const h1 = (Math.max(h, 3 * ph + .5) - h);
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
    super.layoutTable2();            // toggleText

    const row = 8.4, col = 1.8;       // position Panels on Neutral Panel

    const [source, discard] = TacticsCard.makeCardSources(this, { row, col })
    this.cardSource = source;
    this.cardDiscard = discard;

    TacticsCard.makeAllCards(); // populate PathCard.cardByName

    this.addDoneButton();
    this.doneButton.label.font = F.fontSpec(this.sr(20));
    this.doneButton.label.lineWidth = TP.hexRad * 1.15;
    this.setToRowCol(this.doneButton, 1.48, 5.9);

    this.vault = this.makeTokenVault();
    this.makeNeutralPanel();    // See also: Panel.layoutNeutralPanel()
    this.makeRelics();
    return;
  }
  vault!: Container;

  cardSource!: TileSource<TacticsCard>
  cardDiscard!: TileSource<TacticsCard>

  cardBack!: CardBack;    // created & set from tactics-card.makeCardSources

  // override to place on overCont and activate.
  override addDoneButton() {
    const cont = this.hexMap.mapCont.overCont;
    const rv = super.addDoneButton(cont, 0, 0); // see: gameState.doneButton('Done')
    this.doneButton.activate(true)
    return rv;
  }

  override get panelHeight() { return Math.max(super.panelHeight, 3.8) }
  override get panelWidth() { return 7 }

  override panelLocsForNp(np: number): number[] {
    return [[], [0], [0, 2], [0, 3, 2], [0, 3, 5, 2], [0, 3, 4, 5, 2], [0, 3, 4, 5, 2, 1]][np];
  }
  neutralPanelLoc(): [row: number, col: number, dir: 1 | -1] {
    const locs = super.getPanelLocs()
    // on top row, between left & right columns:
    return [locs[0][0], (locs[0][1] + locs[3][1])/2, +1];
  }

  neutralPanel!: Panel;
  makeNeutralPanel() {
    const [row, col, dir] = this.neutralPanelLoc();
    const nPlayer = this.gamePlay.neutralPlayer;
    const neutralPanel = this.neutralPanel = this.makePlayerPanel(this, nPlayer, this.panelHeight, this.panelWidth-.6, row, col+.5, dir)
    neutralPanel.vault.visible = false;
    neutralPanel.layoutNeutralPanel(this)
}

  // established by Panel.addPriceSlots()
  /** TokenHex[] to hold PriceToken when 'inplay' */
  priceHex = [] as TokenHex[];

  // constructor does: { mapCont.backCont.addChild(playerPanel); setToRowCol(this, row, col); ... }
  override makePlayerPanel(table: Table, player: PlayerLib, high: number, wide: number, row: number, col: number, dir = -1) {
    if (player.index === undefined) debugger;
    if (col > 0) col -= 1;  // inset Panels on the right-hand side
    const playerPanel = new Panel(table as ChaosTable, player as Player, high, wide, row - high / 2, col - wide / 2, dir);
    playerPanel.showPlayer(false); // trigger repaint with background and other content
    if (playerPanel.factionId !== 6 as FactionId) playerPanel.layoutPanel(this);
    return playerPanel;
  }

  override setBackground(parent: Container, bounds: XYWH, bgColor?: string): RectShape & NamedObject {
    const rect = super.setBackground(parent, bounds, bgColor)
    rect.x =- 50;
    return rect
  }

  /**
   * Make a new HexC() on the given map.mapCont
   * @param row
   * @param col
   * @param name hex.Aname
   * @param HexC (map, row, col, name)
   * @param map [this.hexMap] { mapCont: MapCont }
   * @returns
   */
  override newHex2<T extends IHex2>(row = 0, col = 0, name: string, HexC: Constructor<T> = this.hexC as Constructor<T>, map: { mapCont: MapCont } = this.hexMap) {
    const hex = new HexC(map, row, col, name) as T;
    hex.distText.text = name; // district text
    this.newHexes.push(hex);
    return hex
  }

  override startGame() {
    super.startGame();         // allTiles.makeDragable(); setNextPlayer()
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
      const tColor = C.pickTextColor(value); // is why we needed tile.paintBase()
      ChaosTile.allChaosTiles.forEach(tile => tile.paint(value))
    }
    const colors = [C.black, C.white];
    gui.makeParamSpec('color', colors).onChange = (item: ParamItem) => setColor(item.value);

    parent.addChild(gui)
    gui.x = x; gui.y = y
    gui.makeLines();
    setColor(colors[0]);
    return gui
  }

  override setupUndoButtons(): void {  }

  // TODO: see Ankh, player/god selection chooser
  override makeGUIs(scale?: number, cx = -154, cy = 210, dy?: number): void {
    this.guisToMake = []
    if (!this.stage.canvas) return;
    super.makeGUIs(scale, cx, cy);
  }

  tokenVault: NamedContainer[] = [];
  /** make a TokenHex, put it (& its legalMark) at location of dObj */
  makeTokenHexForObj(dObj: DisplayObject, label: string) {
    const thex = this.newHex2(0, 0, `${label}`, TokenHex); // hex on mapCont
    dObj.parent.localToLocal(dObj.x, dObj.y, this.hexMap.mapCont.hexCont, thex.cont)
    thex.legalMark.setOnHex(thex)
    return thex;
  }

  /** arrange slots on top for each faction */
  makeTokenVault() {
    // much like addPriceSlots()
    const wh = TP.hexRad * .8, x0 = wh * .1, wh0 = wh*1.1; // wh*(1.1*facId + .1)

    const vault = new NamedContainer('Vault'); // will only contain PTokens, 'invault'
    this.hexMap.mapCont.backCont.addChild(vault);

    factionNeutral.forEach((fn, facId) => {
      const fcont = new NamedContainer(`vault:${fn}`); // container for PriceTokens of Faction
      fcont.x = facId * wh0;
      fcont.y = 0;     // no real need to displace, will move 'vault' container
      vault.addChild(fcont);
      this.tokenVault[facId] = fcont; // roughly the same as vault.children
      const tShape = new PTokenShape(wh, 'white');
      tShape.paint(Player.colorScheme[factionColors[facId]]);
      fcont.addChild(tShape);
      fcont.visible = false;   // until a new PlayerPanel sets it visible
      if (fn == 'Neutral') {
        fcont.x = TP.hexRad * -1.37; // ?
      } else {
        const fImage = AliasLoader.loader.getBitmap(fn, { x: wh, y: wh });
        fcont.addChild(fImage)
      }
    })
    return vault;
  }

  /** make 6 numbered Relic buildings, place on the neutralPanel; D&D & auto-place on map */
  makeRelics() {
    const player = this.gamePlay.neutralPlayer;
    const panel = player.panel, wh = panel.wh, x0 = wh * 1.85, y0 = wh * 1.55, s1 = wh * 1.1;;
    arrayN(6).forEach(ndx => {
      const n = ndx+1;
      const fxy = { x: x0 + n * s1, y: y0 + 6 * wh }
      const relic = new Relic(n, player, fxy);
      // relic.sendHome()
      panel.addChild(relic);
    })
  }

  /** take card from top of deck (TacticsCard.souce) */
  takeCard() {
    const source = this.cardSource; // TacticsCard.source;
    if (source.numAvailable == 0) TacticsCard.reshuffle();
    source.nextUnit();
    return source.takeUnit(false);
  }
}
