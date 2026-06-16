import { C } from "@thegraid/common-lib";
import { CenterText, CircleShape, NamedContainer, PaintableShape, RectShape } from "@thegraid/easeljs-lib";
import { Container } from "@thegraid/easeljs-module";
import { type DragContext, HexShape, type IHex2, MapTile, Player as PlayerLib, type Table, type TileSource, TP } from "@thegraid/hexlib";
import { type ChaosHex as Hex1, type ChaosHex2 as Hex2 } from "./chaos-hex";
import { type ChaosTable } from "./chaos-table";
import { Foundation } from "./foundation";
import type { GamePlay } from "./game-play";
import type { AI_Trap, Barracks, Factory, Fighter, Leader, Morale, Stronghold } from "./meeples";
import type { Player } from "./player";

declare module '@thegraid/easeljs-module' {
  interface Graphics {
    /**
    * Draws a polygon from array of point arrays.
    *
    *      myGraphics.beginFill("#FF0").drawPolygon([100, 100], [150, 50], [200,100], [200,200], [100,200]);
    *      // makes a house shape
    *
    * A tiny API method "pg" also exists.
    *
    * @method drawPolygon
    * @param {Array} points An array of [x,y] points.
    * @param {Boolean} close Whether to close the polygon - default is true.
    * @return {Graphics} The Graphics instance the method is called on (useful for chaining calls.)
    * @chainable
    **/
    drawPolygon(points: [number, number][], close: boolean): void;
    /** short form of drawPolygon */
    pg(points: [number, number][], close: boolean): void;
  }
}

/** the resource and/or action that can be harvested from a ChaosTile */
class HarvestToken {
  harvestId!: HARVEST;
  getValue(player: Player, id = this.harvestId): boolean {
    switch(id) {
      case 'E2':
        player.coins += 2;
        return false;
      case 'E1':
        player.coins += 1;
        return false;
      case 'G1':
        player.gems += 1;
        return false;
      case 'R1':
        // single recruit action (AI Base)
        return true;
      case 'R3':
        // 3 recruit actions (the buff)
        return true;
    }
    return false;
  }
}

// 'Base' tile marks space where a Faction Base can be placed (replacing the place-keeper)
const terrainIds = ['Mtn', 'Hills', 'Swamp', 'Plains', 'Lake', 'Base'] as const;

// 'energy' is E2, 'energy1' is E1, 'recruit1' is 'R1'
// energy1 on AI Base; 'recruit1' on Oxytaya Base
// Note: Tile.setNameText() converts '-' to newline
// board_HARVEST:          ['E2', 'G1', 'C']
// relic_Foundation bonus: ['E2', 'G1', 'C', '%', '-', ]  ('-' on Relic-6: never claimed)
// panel_Foundation bonus: ['-']
// panel_BgFound bonus:    [... various text...]
// panel_Building income:  ['E3', 'E2', 'G1', 'C']    // E3 for BldgFoundation[0] (base Income)
/** basic Bonus for Foundation and Harvest */
const bonusIds = ['-', 'E3', 'E2', 'E1', 'C', 'G1', 'R1', '%'] as const; //

/** upgrade tokens which can be flipped; Lm2: Leader deploy/upgrade for -2E; Bm1: Build for -1E */
const baseProdTokenIds = ['%', 'R3', 'G2', 'E4', 'E1C', 'R1C', 'Lm2', 'Bm1'] as const; // 8 basic
const upgradeProdTokenIds = ['%E2', 'R4', 'G2R1', 'E6', 'E3C', 'R2C', 'LE0', 'BG0'] as const;
// BG0: Build w/free gemlock (~B -2E if you have the unlock Foundation)

export type TERRAIN = typeof terrainIds[number];
export type BONUS = typeof bonusIds[number];
export type BASE_PROD_TOKEN = typeof baseProdTokenIds[number];
export type UPGRADE_PROD_TOKEN = typeof upgradeProdTokenIds[number];
export type PROD_TOKEN = BASE_PROD_TOKEN | UPGRADE_PROD_TOKEN;
export type HARVEST = BONUS | PROD_TOKEN;
export type FAME_BONUS = 'E1' | 'E2' | 'C' | 'G1' | '%' | 'R1' | 'R2' | 'M1' | 'Win'; // M1 is Redeploy

// the harvest token when upgraded gains the second
const flipBuff: Partial<Record<PROD_TOKEN, string>> = {
  '%': '%E2',
  R3: 'R4',
  G2: 'G2R1',
  E4: 'E6',
  E1C: 'E3C',
  R1C: 'R2C',
  Lm2: 'LE0',
  Bm1: 'BG0',
};

  /** also use for Income icons */ // TODO: maybe use TextTweaks to place the glyphs?
export function bonusIcon(harv: HARVEST, radius = TP.hexRad) {
    if (!bonusIds.includes(harv as BONUS)) return undefined;
    const spotmap = { E: 'yellow', G: 'red', C: 'white', R: 'orange', U: 'gold' };
    const icon = new Container();
    const h0 = harv[0] as keyof typeof spotmap;
    const cHarv = spotmap[h0] ?? C.transparent;
    const w = radius * .25, h = w * 1.4, fs = radius * .15;
    const cardRect = { x: -w / 2, y: -h / 2, w, h };
    const shape = (h0 == 'C' || h0 == 'U' ) ? new RectShape(cardRect, cHarv, '') : new CircleShape(cHarv, fs, '');
    const tColor = C.pickTextColor(cHarv, ['black', 'white']);
    const iText = new CenterText(h0 == 'C' ? '+' : harv, fs, tColor);
    if (harv !== '-') icon.addChild(shape, iText);
    return icon
  }

const colorOfTerrain: Record<TERRAIN, string> = {
  Mtn: C.grey64,
  Hills: C.nameToRgbaString(C.dimYellow, .5),
  Swamp: C.nameToRgbaString(C.lightgreen, .5),
  Plains: C.nameToRgbaString(C.BROWN, .5),
  Lake: C.lightblue,
  Base: C.WHITE,
}


/** per-Player bit on map Hex */
class FactionOnTile extends NamedContainer {
  constructor(player: Player) {
    super(`fac-${player.facId}`);
  }
  leaders: Leader[] = [ ];              // 2 slots (own + Rhyzu), Zcharo: 4, Oxytaya: 4
  Fighters!: TileSource<Fighter>;       // Fighter in slot, followed by Leader(s)
  strength = 0;                         // Apparent strength of Faction
  pins = 0;
  // TODO: methods to add/remove elements
}


/** MapTile
 * ChaosTile: Tile with Terrain & Harvest icon.
 *
 * also: the extension tiles: 3 each of Yellow, Blue, Red
 *
 * Chaos does not need a 'source' of tiles.
 */
export class ChaosTile extends MapTile {

  static readonly allChaosTiles: ChaosTile[] = [];

  declare gamePlay: GamePlay;
  get chex() { return super.hex as Hex2; }

  static curTable: ChaosTable;

  override toString(): string {
    super.toString();
    return `${this.Aname}`;
  }

  // use plyrDisk to show Player controlling Region
  readonly colorHex = new HexShape(TP.hexRad); // may want a plyrDisk later to show owner?
  readonly plyrDisk = new CircleShape(C.white, TP.hexRad * .5, '');
  readonly terrain!: TERRAIN; // immutable
  harvest!: HARVEST;          // can place harvest buff token to change
  harvest_buff?: HARVEST;     // TODO: need additional HARVEST types

  /** hold all the Faction Units; index by FactionId (or PlayerId?) */
  factions: FactionOnTile[] = [];
  special: { morale?: Morale, trap?: AI_Trap } = {}

  // Tiles: isLegalTarget(hex, ctx) => (hex.foundations.length < 3)
  foundations: [Foundation?, Foundation?, Foundation?] = [undefined, undefined, undefined]; // Factory, Baracks, Stronghold
  // Meeples: isLegalTarget(hex, ctx) => !hex[this.type] && foundations.find(f=>!f.bldg)
  Factory!: Factory;        //
  Barracks!: Barracks;      //
  Stronghold!: Stronghold;  //

  constructor(Aname: string, t: TERRAIN, h: HARVEST, player?: PlayerLib) {
    super(Aname, player);
    this.terrain = t;
    this.harvest = h;
    this.nameText.y = this.radius * .66;
    this.addChild(this.colorHex);
    this.addChild(this.nameText);        // re-add above afHex
    this.addHarvest();
    // this.setPlayerAndPaint(player);
    this.paint();
    ChaosTile.allChaosTiles.push(this);
  }

  // paint the [player] color onto the plyrDisk; for baseShape use paintBase()
  override paint(colorn = this.pColor ?? colorOfTerrain[this.terrain], force?: boolean): void {
    if (force || colorn !== this.colorHex.colorn) {
      this.colorHex.paint(colorn, force);
      this.updateCache();
    }
  }

  addHarvest() {
    const icon = bonusIcon(this.harvest)!;
    icon.y = this.radius * .37;
    this.addChild(icon);
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

  // The only draggable ChaosTile will be the BaseTiles;
  // Leaving this code for when we build them
  // Also drag Building (as meeps) to Build and self-drop
  override cantBeMovedBy(player: PlayerLib, ctx: DragContext): string | boolean | undefined {
    if (this.hex?.isOnMap && !ctx.lastShift) return 'tile on map';
    return super.cantBeMovedBy(player, ctx);
  }

  canAddFoundation(f: Foundation) {
    return this.addFoundation(f, false) !== undefined;
  }

  // allocate room for 3 foundations; TODO: if user places more...?
  addFoundation(f: Foundation, commit = true) {
    const ndx = [1, 2, 0].find(ndx => this.foundations[ndx] == undefined);
    if (commit && ndx != undefined) {
      this.foundations[ndx] = f;
      f.onTile = this;
      // Graphically above this.hex:
      const hex = this.chex, dx = f.radius * 1.03, dy = f.radius * 1.25;
      f.scaleX = f.scaleY = Foundation.mapScale;  // scale down when drop on map
      f.x = hex.x + (ndx-1) * dx * f.scaleX;
      f.y = hex.y + hex.radius - dy * f.scaleY;
      f.faceUp(true);
      f.homeXY = { x: f.x, y: f.y }
      this.chex.mapCont.overCont.addChild(f);
    }
    return ndx;
  }

  override isDragable(ctx?: DragContext): boolean {
    return !this.hex?.isOnMap || this.terrain == 'Base';
  }

  override dragStart(ctx: DragContext): void {
    super.dragStart(ctx); // --> cantBeMovedBy()
  }

  // dragStart -> markLegal; dragFunc(ctx.info.first) -> setLegalColors
  override markLegal(table: Table, setLegal = (hex: IHex2) => { hex.setIsLegal(false); }, ctx = table.dragContext) {
    table.hexMap.forEachHex(setLegal); // --> .isLegalTarget(toHex, ctx)
  }

  // constraints to drag/drop a ChaosTile (place a Base)
  override isLegalTarget(toHex: Hex1, ctx: DragContext): boolean {
    const tile = (toHex.tile as ChaosTile);
    const rv = !tile || tile.terrain == 'Base';
    return rv;
  }
  override dropFunc(targetHex: Hex2, ctx: DragContext): void {
    if (targetHex.tile) {
      targetHex.tile.sendHome();
    }
    super.dropFunc(targetHex, ctx);
  }
}

/** resize/repaint Tiles for TileExporter */
export class PrintTile extends ChaosTile {
  static rotateBack = 0;
  static colorBack = C.WHITE;
  constructor(Aname: string, t: TERRAIN, h: HARVEST, color = C.WHITE) {
    const TP_hexRad = TP.hexRad, printRad = 200;
    TP.hexRad = printRad;
    super(Aname, t, h, undefined)
    TP.hexRad = TP_hexRad;
    this.paintBase(color);
  }
  override paint(colorn = C.BLACK, force?: boolean): void {
    this.paintBase(colorn)
  }
}
