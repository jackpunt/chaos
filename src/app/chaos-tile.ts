import { C } from "@thegraid/common-lib";
import { CenterText, CircleShape, PaintableShape } from "@thegraid/easeljs-lib";
import { type DragContext, H, Hex2 as Hex2Lib, HexShape, type IHex2, MapTile, Player as PlayerLib, type Table, TileSource, TP } from "@thegraid/hexlib";
import type { GamePlay } from "./game-play";
import type { GameState } from "./game-state";
import { CardHex } from "./tactics-card";
import { type ChaosHex as Hex1, type ChaosHex2 as Hex2 } from "./chaos-hex";
import { type PathTable } from "./chaos-table";
import { Player } from "./player";

const Hdirs = TP.useEwTopo ? H.ewDirs : H.nsDirs;

// TODO: make a TileSource (bag of tile)
// specialize Player & PlayerPanel, also GameState (see hexmarket)
// dispense several PathTiles to each Player; to slots (see acquire)
// Create RuleCard: -- (see hexcity?) with Source, and Panel for placement (Pos or Neg slots)
// make a place on PlayerPanel for 'hand' of Rules
//
// may also have a deck of 'bonus' or 'goal' cards;
// dispense 2 or 3 as public;
// each player may acquire 1..3? private until reveal to claim points (& discard?)
// 'group of tiles sum to X', 'group of tiles in tri/hex/line'
// public bonus scored when tile is played
// private can be delayed until player is ready to reveal
// (risk that configuration may be broken)
//
// per turn:
// -- choose action: Tile or Rule
// DrawTile or PlaceTile (updating gameState) drag tile to map, rotate to satisfy Rules
// DrawRule or PlaceRule

/** MapTile
 * ChaosTile: Tile with Terrain & Harvest icon.
 *
 * also: the extension tiles: 3 each of Yellow, Blue, Red
 *
 * Chaos does not need a 'source' of tiles.
 */
export class PathTile extends MapTile {

  static readonly allPathTiles: PathTile[] = [];

  declare gamePlay: GamePlay;

  static curTable: PathTable;
  static source: TileSource<PathTile>;

  // make a source for the given PathTile[]
  static makeSource(hex: Hex2Lib, tiles = PathTile.allPathTiles) {
    const source = PathTile.makeSource0(TileSource<PathTile>, PathTile, hex);
    tiles.forEach(unit => source.availUnit(unit));
    return source;
  }

  readonly plyrDisk = new CircleShape(C.white, TP.hexRad * .5, '');
  readonly _valueText = new CenterText('', TP.hexRad * .5, C.WHITE);
  get valueText() { return this._valueText.text }
  set valueText(value: string) {
    this._valueText.text = value;
    this.reCache()
  }
  _placeValue = 0;
  /** last computed value from table rules this tile@rot on targetHex (as pulled from legalMark.valuesAtRot) */
  get placeValue() { return this._placeValue }
  set placeValue(v) {
    this._placeValue = v;
    this.valueText = (v < 0) ? '' :`${v}`;
  }

  constructor(Aname: string, player: PlayerLib | undefined) {
    super(Aname, player);
    this.nameText.y = this.radius * .66;
    this.addChild(this.nameText);        // re-add above afHex
    this.addChild(this.plyrDisk);
    this.addChild(this._valueText);
    this.setPlayerAndPaint(player);
    PathTile.allPathTiles.push(this);
  }

  // paint the [player] color onto the plyrDisk; for baseShape use paintBase()
  override paint(colorn = C.transparent, force?: boolean): void {
    if (force || colorn !== this.plyrDisk.colorn) {
      this._valueText.color = C.pickTextColor(colorn)
      this.plyrDisk.paint(colorn, force);
      this.updateCache();
    }
  }

  // invoked by ParamGUI:
  paintBase(colorn = C.black, tColor = C.pickTextColor(colorn)) {
    this.nameText.color = tColor;
    this.baseShape.paint(colorn)
    this.updateCache();
  }

  override makeShape(): PaintableShape {
    return new HexShape(); // basic HexShape, not the TileShape
  }

  static makeAllTiles() {
    // GameSetup.initialize() -> AfHex.makeAllAfHex()
    // GameSetup.startScenario() -> layoutTable() -> makeAllPlayers()
    // make a Tile for each AfHex.
  }

  override cantBeMovedBy(player: PlayerLib, ctx: DragContext): string | boolean | undefined {
    // if ((ctx.gameState as GameState).notDoneTile(this)) return 'cardDone';
    if (this.hex?.isOnMap && !ctx.lastShift) return 'tile on map';
    return super.cantBeMovedBy(player, ctx);
  }

  override dragStart(ctx: DragContext): void {
    super.dragStart(ctx); // --> cantBeMovedBy()
    this.targetHex = this.fromHex as Hex2; // for keybinder rotation
  }

  // dragStart -> markLegal; dragFunc(ctx.info.first) -> setLegalColors
  override markLegal(table: Table, setLegal = (hex: IHex2) => { hex.setIsLegal(false); }, ctx = table.dragContext) {
    this.maxV = -1;  // dragStart is before markLegal()
    ;(table as PathTable).gamePlay.curPlayer.tileRack.forEach(setLegal)
    table.hexMap.forEachHex(setLegal);
    if (ctx.tile) (ctx.tile as PathTile).placeValue = this.maxV;
  }

  /** max of maxV found during markLegal->isLegalTarget */
  maxV = 0;

  override isLegalTarget(toHex: Hex1, ctx: DragContext): boolean {
    const plyr = (ctx.gameState as GameState).curPlayer;
    return true;
  }

  targetHex!: Hex2; // latest targetHex from dragFunc -> ctx.targetHex;

  // dragStart->markLegal; dragFunc
  override dragFunc(hex: IHex2 | undefined, ctx: DragContext): void {
    const hex2 = hex as Hex2 | undefined, table = ctx.gameState.table as PathTable; // hex2 is LEGAL hexUnder
    const hexAny = table.hexUnderObj(this, false);
    const hex3 = ((!hexAny || CardHex.allCardHex.includes(hexAny)) ? this.fromHex as Hex2 : hexAny);
    if (ctx.info.first) this.setLegalColors();
    if (hex3 === this.targetHex) return;
    this.targetHex = hex3 as Hex2;
    super.dragFunc(hex, ctx);
  }

  setLegalColors(maxV = this.maxV, C_max = 'rgba(0,100,200,.3)', C_zero='rgba(200,200,0,.3)') {
    this.fromHex.map.forEachHex(hex => {
      const lm = (hex as Hex2).legalMark, mv = lm.maxV;
      if (hex.isLegal) lm.doGraphics(mv == maxV ? C_max : mv == 0 ? C_zero : undefined)
    })

  }
  override dropFunc(targetHex: IHex2, ctx: DragContext): void {
    const plyr = this.player as Player
    if (targetHex.tile && targetHex !== this.source.hex) {
      // collision on playerPanel:
      const otile = targetHex.tile;
      const ndx = plyr.tileRack.findIndex(hex => !hex.tile)
      if (ndx < 0) {
        otile.sendHome();  // discard to make slot empty
      } else {
        otile.moveTo(plyr.tileRack[ndx]) // move otile to open slot
      }
    }
    if (this.placeValue == -1) {
      targetHex = this.fromHex; // bad rotation: return to sender
    }
    super.dropFunc(targetHex, ctx); // this.placeTile(targetHex)

    // maybe set gameState.tileDone;
    const selfDrop = (this.hex == this.fromHex)
    const rackSwap = plyr.rackSwap(this.fromHex, targetHex, plyr.tileRack)
    if (selfDrop || rackSwap) return;
    {
      setTimeout(() => {
        (ctx.gameState as GameState).tileDone = this; // return & markLegal() before setNextPlayer
      }, 1);
    }
  }
}

/** resize/repaint Tiles for TileExporter */
export class PrintTile extends PathTile {
  static rotateBack = 0;
  static colorBack = C.WHITE;
  constructor(Aname: string, color: string) {
    const TP_hexRad = TP.hexRad, printRad = 200;
    TP.hexRad = printRad;
    super(Aname, undefined)
    TP.hexRad = TP_hexRad;
    this.paintBase(color);
  }
  override paint(colorn = C.BLACK, force?: boolean): void {
    this.plyrDisk.paint(C.transparent, true)
    this.paintBase(colorn)
  }
}
