import { C } from "@thegraid/common-lib";
import { CenterText, CircleShape, PaintableShape } from "@thegraid/easeljs-lib";
import { type DragContext, H, Hex2 as Hex2Lib, type HexMap, HexShape, type IHex2, MapTile, Player as PlayerLib, type Table, TileSource, TP } from "@thegraid/hexlib";
import type { GamePlay } from "./game-play";
import type { GameState } from "./game-state";
import { CardHex } from "./tactics-card";
import { type ChaosHex as Hex1, type ChaosHex2 as Hex2, type HexMap2 } from "./chaos-hex";
import { type ChaosTable } from "./chaos-table";
import { Player } from "./player";

const Hdirs = TP.useEwTopo ? H.ewDirs : H.nsDirs;

/** sufficient to layout tiles for map setup */
export type TileSpec = { row: number, col: number, thid: number }

/** the resource and/or action that can be harvested from a ChaosTile */
class HarvestToken {
  harvestId!: HARVEST;
  getValue(player: Player, id = this.harvestId): boolean {
    switch(id) {
      case 'energy':
        player.coins += 2;
        return false;
      case 'energy1':
        player.coins += 1;
        return false;
      case 'gem':
        player.gems += 1;
        return false;
      case 'recruit1':
        // single recruit action (AI Base)
        return true;
      case 'recruit3':
        // 3 recruit actions (the buff)
        return true;
    }
    return false;
  }
}
const terrainIds = ['Mtn', 'Hills', 'Swamp', 'Plains', 'Lake'] as const;
const resourceIds = ['none', 'energy', 'gem', 'card', 'energy1', 'recruit1', ] as const;
// energy1 on AI Base; 'recruit1' on Oxytaya Base
/** upgrade tokens which can be flipped */
const harvestTokenId = ['research', 'recruit3'] as const;

type TERRAIN = typeof terrainIds[number];
type RESOURCE = typeof resourceIds[number];
type HARVEST_UPGRADE = typeof harvestTokenId[number];
type HARVEST = RESOURCE | HARVEST_UPGRADE;

const flipBuff: Partial<Record<HARVEST_UPGRADE, string>> = {
  research: 'energy',
  recruit3: 'energy',
};

const colorOfTerrain: Record<TERRAIN, string> = {
  Mtn: C.grey32,
  Hills: C.nameToRgbaString(C.dimYellow, .5),
  Swamp: C.nameToRgbaString(C.BROWN, .5),
  Plains: C.nameToRgbaString(C.lightgreen, .5),
  Lake: C.BLUE,
}


/** MapTile
 * ChaosTile: Tile with Terrain & Harvest icon.
 *
 * also: the extension tiles: 3 each of Yellow, Blue, Red
 *
 * Chaos does not need a 'source' of tiles.
 */
export class ChaosTile extends MapTile {

  /** 9 TERRAIN x HARVEST combinations; convert thid [0..8] to [TERRAIN, HARVEST] */
  static h_t(thid: number): [HARVEST, TERRAIN] {
    const harv = Math.floor(thid / 10);
    const terr = thid % 10;
    return [resourceIds[harv], terrainIds[terr]];
  }

  static readonly allChaosTiles: ChaosTile[] = [];

  declare gamePlay: GamePlay;

  static curTable: ChaosTable;
  static source: TileSource<ChaosTile>;

  // make a source for the given PathTile[]
  static makeSource(hex: Hex2Lib, tiles = ChaosTile.allChaosTiles) {
    const source = ChaosTile.makeSource0(TileSource<ChaosTile>, ChaosTile, hex);
    tiles.forEach(unit => source.availUnit(unit));
    return source;
  }

  /** configure hexMap with terrain tiles, mountains, adjust adjacency, mark open base locations
   *
   * ['none' 'energy', 'gem', 'card', 'energy1', 'recruit1', ]
   *    0        1        2        3        4
   * ['Mtn', 'Hills', 'Swamp', 'Plains', 'Lake']
   */
  static setupMapTiles(map: HexMap<IHex2>, xtraTiles = [] as TileSpec[]) {
    const baseTiles: TileSpec[] = [
      {row: 2, col: 3, thid: 0}, // demo: mtn
      {row: 2, col: 5, thid: 0},
      {row: 3, col: 3, thid: 23}, // Plain:gem
      {row: 3, col: 4, thid: 32}, // Swamp:card
      {row: 3, col: 5, thid: 21}, // Hills:gem
      {row: 4, col: 3, thid: 32}, // S:card
      {row: 4, col: 4, thid: 11}, // H:en
      {row: 4, col: 5, thid: 22}, // swamp:gem
      {row: 5, col: 4, thid: 13}, // Plain:energy
    ];
    const placeTile = (tileSpec: TileSpec) => {
      const {row, col, thid} = tileSpec;
      const [h, t] = ChaosTile.h_t(thid);
      const tile = new ChaosTile(`T${row},${col}:${t.slice(0,1)}:${h}`, thid);
      const hex = map.getHex({row, col});
      tile.placeTile(hex);
      console.log(('ChaosTile'), thid, tile.toString(), tile.harvest);
    }

    baseTiles.forEach(ts => placeTile(ts));
    xtraTiles.forEach(ts => placeTile(ts));
    // TODO: set mountains and LINKS
  }

  override toString(): string {
    return `${this.Aname}`;
  }

  // use plyrDisk to show Player controlling Region
  readonly terrFill = new HexShape(TP.hexRad); // may want a plyrDisk later to show owner?
  readonly plyrDisk = new CircleShape(C.white, TP.hexRad * .5, '');
  readonly terrain!: TERRAIN; // immutable
  harvest!: HARVEST;          // can place harvest buff token to change
  harvest_buff?: HARVEST;     // TODO: need additional HARVEST types

  constructor(Aname: string, thid: number, player?: PlayerLib) {
    super(Aname, player);
    const [h, t] = ChaosTile.h_t(thid);
    this.terrain = t;
    this.harvest = h;
    this.nameText.y = this.radius * .66;
    this.addChild(this.terrFill);
    this.addChild(this.nameText);        // re-add above afHex
    // this.setPlayerAndPaint(player);
    this.paint();
    ChaosTile.allChaosTiles.push(this);
  }

  // paint the [player] color onto the plyrDisk; for baseShape use paintBase()
  override paint(colorn = colorOfTerrain[this.terrain], force?: boolean): void {
    if (force || colorn !== this.terrFill.colorn) {
      this.terrFill.paint(colorn, force);
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
    ;(table as ChaosTable).gamePlay.curPlayer.tileRack.forEach(setLegal)
    table.hexMap.forEachHex(setLegal);
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
    const hex2 = hex as Hex2 | undefined, table = ctx.gameState.table as ChaosTable; // hex2 is LEGAL hexUnder
    const hexAny = table.hexUnderObj(this, false);
    const hex3 = ((!hexAny || CardHex.allCardHex.includes(hexAny)) ? this.fromHex as Hex2 : hexAny);
    if (hex3 === this.targetHex) return;
    this.targetHex = hex3 as Hex2;
    super.dragFunc(hex, ctx);
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
export class PrintTile extends ChaosTile {
  static rotateBack = 0;
  static colorBack = C.WHITE;
  constructor(Aname: string, thid: number, color = C.WHITE) {
    const TP_hexRad = TP.hexRad, printRad = 200;
    TP.hexRad = printRad;
    super(Aname, thid, undefined)
    TP.hexRad = TP_hexRad;
    this.paintBase(color);
  }
  override paint(colorn = C.BLACK, force?: boolean): void {
    this.paintBase(colorn)
  }
}
