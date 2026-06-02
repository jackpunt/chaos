import { C, stime } from "@thegraid/common-lib";
import { CircleShape, NamedContainer, PaintableShape, PathShape, PolyShape, RectShape } from "@thegraid/easeljs-lib";
import { Shape } from "@thegraid/easeljs-module";
import { type DragContext, H, Hex2 as Hex2Lib, type HexDir, type HexMap, HexShape, type IHex2, MapTile, Player as PlayerLib, type Table, TileSource, TP } from "@thegraid/hexlib";
import { type ChaosHex as Hex1, type ChaosHex2 as Hex2 } from "./chaos-hex";
import { type ChaosTable } from "./chaos-table";
import type { GamePlay } from "./game-play";
import type { GameState } from "./game-state";
import { Player } from "./player";
import { CardHex } from "./tactics-card";
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
const terrainIds = ['Mtn', 'Hills', 'Swamp', 'Plains', 'Lake', 'Base'] as const;
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
  Mtn: C.grey64,
  Hills: C.nameToRgbaString(C.dimYellow, .5),
  Swamp: C.nameToRgbaString(C.BROWN, .5),
  Plains: C.nameToRgbaString(C.lightgreen, .5),
  Lake: C.lightblue,
  Base: C.WHITE,
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

  /** configure hexMap with terrain tiles, mountains, adjust adjacency, mark open base locations
   *
   * ['none' 'energy', 'gem', 'card', 'energy1', 'recruit1', ]
   *    0        1        2        3        4       5
   * ['Mtn', 'Hills', 'Swamp', 'Plains', 'Lake', 'Base']
   */
  static setupMapTiles(map: HexMap<IHex2>, xtraTiles = [] as TileSpec[]) {
    const initTiles: TileSpec[] = [
      {row: 2, col: 5, thid: 5}, // Base
      {row: 4, col: 1, thid: 5}, // Base

      {row: 3, col: 3, thid: 23}, // Plain:gem
      {row: 3, col: 4, thid: 32}, // Swamp:card
      {row: 3, col: 5, thid: 21}, // Hills:gem
      {row: 4, col: 2, thid: 12}, // S:energy
      {row: 4, col: 3, thid: 32}, // S:card
      {row: 4, col: 4, thid: 11}, // H:en
      {row: 4, col: 5, thid: 22}, // swamp:gem
      {row: 5, col: 2, thid: 33}, // Plain:card
      {row: 5, col: 4, thid: 13}, // Plain:energy

      {row: 4, col: 6, thid:  4}, // Lake:none
      {row: 5, col: 3, thid:  4}, // Lake:none
      {row: 5, col: 5, thid: 31}, // Hills:card
      {row: 6, col: 4, thid:  5}, // Base2|P3
    ];
    const placeTunnel = (dir12: HexDir, hex1: IHex2, hex2: IHex2, fillc = C.BLUE) => {
      const points = (xs = TP.hexRad * .33, ys = TP.hexRad * .4) => {
        return [
          [-xs/2, ys/2],
          [ xs/2, ys/2],
          [ xs/2, 0],
          [ 0, -ys/2],
          [-xs/2, 0 ],
          [-xs/2, ys/2],
        ] as [x: number, y: number][];
      }
      const pent = (rad: number, fillc: string, tilt = 0, strokec = '') => {
        const cont = new NamedContainer('tunnel');
        const pent = new PathShape({ points: points(rad), fillc, strokec});
        cont.addChild(pent);
        cont.rotation = tilt;
        return cont;
      };

      const tunnelFrom = (dir12: HexDir, hex1: IHex2, hex2: IHex2, fillc = C.BLUE) => {
        hex1.links[dir12] = hex2;
        const tilt = H.dirRot[dir12], rad = TP.hexRad/3;
        const icon = pent(rad, fillc, tilt)
        hex1.edgePoint(dir12, 1.35, icon);
        hex1.map.mapCont.tileCont.addChild(icon);
      }
      tunnelFrom(dir12, hex1, hex2, fillc)
      tunnelFrom(H.dirRev[dir12], hex2, hex1, fillc)
    }
    const placeMtn = (hex1: IHex2, hex2: IHex2) => {
      const dir12 = hex1.findLinkHex(hex => (hex == hex2));
      if (!dir12) {
        console.log(stime(this, '.placeMtn: hexes not adjacent'), hex1, hex2);
        return;
      }
      const dx = TP.hexRad * .9, dy = dx/6;
      const mtn = new RectShape({x: -dx/2, y: -dy/2, w: dx, h: dy}, C.PURPLE, '');
      mtn.rotation = (H.dirRot[dir12]);
      const pt = hex1.edgePoint(dir12, 1, mtn);
      hex1.map.mapCont.tileCont.addChild(mtn); // set mountain on edge
      // remove adjacency links:
      delete hex1.links[dir12];
      delete hex2.links[H.dirRev[dir12]];
    }

    const placeTile = (tileSpec: TileSpec) => {
      const {row, col, thid} = tileSpec;
      const [h, t] = ChaosTile.h_t(thid);
      const tile = new ChaosTile(`T${row},${col}:${t.slice(0,1)}:${h}`, thid);
      const hex = map.getHex({row, col});
      if (!hex.occupied) {
        tile.placeTile(hex);
        // console.log(('ChaosTile'), thid, tile.toString());
      }
    }
    xtraTiles.forEach(ts => placeTile(ts));
    initTiles.forEach(ts => placeTile(ts));
    map.forEachHex(hex => {
      hex.occupied || placeTile({row: hex.row, col: hex.col, thid: 0}); // fill with Mtn
    })
    placeMtn(map.getHex({row: 4, col: 4}), map.getHex({row: 3, col: 4}) );
    placeMtn(map.getHex({row: 4, col: 4}), map.getHex({row: 4, col: 5}) );
    placeMtn(map.getHex({row: 4, col: 2}), map.getHex({row: 5, col: 2}) );
    placeTunnel(H.N, map.getHex({row: 3, col: 6}), map.getHex({row: 6, col: 2}), C.BLUE)
    placeTunnel(H.WN, map.getHex({row: 3, col: 1}), map.getHex({row: 6, col: 6}), C.RED)

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

  // The only draggable ChaosTile will be the BaseTiles;
  // Leaving this code for when we build them
  // Also drag Building (as meeps) to Build and self-drop
  override cantBeMovedBy(player: PlayerLib, ctx: DragContext): string | boolean | undefined {
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
    ;(table as ChaosTable).gamePlay.curPlayer.unitRack.forEach(setLegal)
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
      const ndx = plyr.unitRack.findIndex(hex => !hex.tile)
      if (ndx < 0) {
        otile.sendHome();  // discard to make slot empty
      } else {
        otile.moveTo(plyr.unitRack[ndx]) // move otile to open slot
      }
    }

    super.dropFunc(targetHex, ctx); // this.placeTile(targetHex)

    // maybe set gameState.tileDone;
    // For Chaos, dropping a Tile is not generally a turn-endiing event.
    // this is legacy from hexpath, where tile drop defined the 'Move' of a turn
    const selfDrop = (this.hex == this.fromHex)
    const rackSwap = this.rackSwap(this.fromHex, targetHex, plyr.unitRack)
    if (selfDrop || rackSwap) return;
    {
      setTimeout(() => {
        (ctx.gameState as GameState).tileDone = this; // return & markLegal() before setNextPlayer
      }, 1);
    }
  }

  /** predicate to recognize 'self-drop' back on to a rack.
   * Indicates to rearrange Tiles within rack.
   * Expect unitCollision to handle?
   */
  rackSwap(fromHex: IHex2, toHex: IHex2, rack: IHex2[]) {
    return rack.includes(fromHex) && rack.includes(toHex)
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
