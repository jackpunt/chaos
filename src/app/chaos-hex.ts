import { C, Random, removeEltFromArray, stime, type Constructor, type XY } from "@thegraid/common-lib";
import { CircleShape, RectShape, type NamedObject, type Paintable } from "@thegraid/easeljs-lib";
import { H, Hex1 as Hex1Lib, Hex2Mixin, HexMap, HexMark, HexShape, LegalMark, TP, type HexDir, type HexM, type IdHex, type IHex2 } from "@thegraid/hexlib";
import { type ChaosTile, type HARVEST, type TERRAIN } from "./chaos-tile";
import { pentagon } from "./table-params";
import type { TacticsCard } from "./tactics-card";

/**
 * General interecpt for ray from center to secant of 2 points on circle
 * @param rad radius of circle
 * @param a1 angle to first point
 * @param a2 angle to secont point
 * @param a3 angle of intercept ray
 * @param pt XY point to set and return [{0, 0}]
 * @returns point of intersection of ray and secant
 */
function secantPoint(rad: number, a1: number, a2: number, a3: number, pt: XY = { x: 0, y: 0 }): XY {
  const toRad = (deg: number) => deg * (Math.PI / 180);
  const t1 = toRad(a1);
  const t2 = toRad(a2);
  const t3 = toRad(a3);

  // Distance from origin (0,0) along angle a3 to the line connecting p1 and p2
  const dist = (rad * Math.cos((t1 - t2) / 2)) / Math.cos(t3 - (t1 + t2) / 2);
  pt.x = dist * Math.cos(t3);
  pt.y = dist * Math.sin(t3);
  return pt;
}

// secantPoint adapted for screen coordinates (0-deg == -y), dir = (a1 + a2)/2
// and displacement from given hex coordinates.
/**
 * edgePoint with delta angle:
 * @param dir mid-angle between 60-degree corners
 * @param rad radius
 * @param pt [{0,0}] an XY to be set and returned
 * @param da angle from dir to the intercept ray (generally +/- < 30 degrees; positive: CW)
 * - a3 = (dir+da) = angle of intercept ray from center
 * @returns point of intersection with edge of hex.
 */
function edgePoint(dir: number, rad: number, pt: XY = { x: 0, y: 0 }, da = 0): XY {
  const toRad = (deg: number) => deg * (Math.PI / 180);
  const t1 = toRad(dir), t3 = toRad(dir + da);
  const dist = (rad * H.sqrt3_2) / Math.cos(t3 - t1);
  const dx = dist * Math.sin(t3), dy = dist * -Math.cos(t3);
  pt.x += dx;
  pt.y += dy;
  return pt;
}

// Hex1 has get/set tile/meep -> _tile/_meep
// Hex1 has get/set -> setUnit(unit, isMeep) & unitCollision(unit1, unit2)
export class ChaosHex extends Hex1Lib {

  constructor(map: HexM<Hex1Lib>, row: number, col: number, Aname?: string) {
    super(map, row, col, Aname);
  }

  override toString(color = (this.tile ?? this.meep)?.player?.plyrId) {
    color = color ?? this.ctile?.terrain.slice(0, 5) ?? 'Empty';
    return `${color}@${this.rcs}` // hex.toString => COLOR@[r,c] | COLOR@Skip , COLOR@Resign
  }
  // cannot override set/get tile(); prevents other components from setting a simple Tile.
  // Type 'Hex1 | undefined' is not assignable to type 'ChaosHex | undefined'.
  /** read hex.tile as ChaosTile */
  get ctile() { return super.tile as ChaosTile | undefined; }

  // TacticsCard is modeled as a Tile, placed on CardHex [tactics-card.ts] (from HexPath);
  // hexcity uses the way old CardContainer and card.useDropFunc
  // See CardPanel.makeDragable(table) -> table.dragger.makeDragable(... dropFunc)
  get card() { return super.meep as TacticsCard | undefined }
  set card(card) { super.meep = card; }
}

class ChaosHex2Lib extends Hex2Mixin(ChaosHex) {
  override_edgePoint(dir: HexDir, rad = 1, point: XY = { x: 0, y: 0 }, da = 0) {
    const a1 = H.dirRot[dir];
    point.x += this.x; point.y += this.y;
    return edgePoint(a1, rad * this.radius, point, da);
  }
  /** extend edgepoint for angle awayfrom HexDir
   *
   * @param dir a HexDir string
   * @param rad (1) per-unit radius (to be mulitplied by this.radius)
   * @param point ({0, 0}) calculated point to set an return (can be a DisplayObject) [{0, 0}]
   * @param da (0) offset angle, generally between +/- 30 degrees
   * @returns the given or created XY
   */
  override edgePoint(dir: HexDir, rad = 1, point: XY = { x: 0, y: 0 }, da = 0) {
    const a1 = H.dirRot[dir] * H.degToRadians, a2 = da * H.degToRadians;
    const t3 = a1 + a2;
    const h = rad * this.radius * H.sqrt3_2 / Math.cos(a2);
    point.x = this.x + Math.sin(t3) * h;
    point.y = this.y - Math.cos(t3) * h;
    return point;
  }
};

export class ChaosHex2 extends ChaosHex2Lib {
  // declare tile: ChaosTile | undefined; // must use get/set from Hex2Mixin(ChaosHex)
  // declare meep: ChaosCard | undefined;

  // type transmission from HexMixin
  override forEachLinkHex(func: (hex: this, dir: HexDir, hex0: this)=> unknown): void {
    super.forEachLinkHex(func)
  }

  // enlarge to remove dead-zone between hexes:
  override makeHexShape(colorn = C.grey224): Paintable {
    const hs = new HexShape(Math.ceil(this.radius * 60/59))
    hs.paint(colorn);
    return hs;
  }

  // smaller radius of circle
  override makeLegalMark(): LegalMark {
    return new class extends LegalMark {
      override doGraphics(): void {
        this.removeAllChildren();
        this.addChild(new CircleShape(C.legalGreen, this.hex2.radius * .3, '')); // @(0, 0)
      }
    }
  }
}
/** the way code typically imports ChaosHex2 */
type Hex2 = ChaosHex2;

/** RectShape Hex to hold PriceToken */
export class TokenHex extends ChaosHex2 {
  /** set to crosslink 'MoveFirst' & 'MoveLast' hexes */
  otherMoveHex: TokenHex | undefined = undefined;

  override makeHexShape(colorn?: string): Paintable {
    const wh = TP.meepleRad;
    const hs = new RectShape({ x: -wh/2, y: -wh/2, w: wh, h: wh}, 'rgba(192, 192, 192, 0.2)')
    return hs;
  }
}


/** mauve Mountain that breaks adjacency between 2 ChaosHex2. */
class Mountain extends RectShape {
  constructor(public hex0: IHex2, public hex1: IHex2) {
    const map = hex0.map as HexMap2;
    const dir01 = hex0.findLinkHex(hex => (hex == hex1));
    if (!dir01) {
      throw(`new Mountain: hexes ${hex0} & ${hex1} are not adjacent`);
    }

    const dx = TP.hexRad * .9, dy = dx/11;
    super({x: -dx/2, y: -dy/2, w: dx, h: dy}, C.PURPLE, ''); // or dmauve?

    map.mountains.push(this);
    this.rotation = (H.dirRot[dir01]);
    hex0.edgePoint(dir01, 1, this);      // set RectShape on edge of Hex
    // place Mtn above mapTiles but below BaseTiles:
    const tiles = map.mapCont.tileCont.children;
    const baseNdx = tiles.findIndex(tile => (tile as ChaosTile).terrain == 'Base');
    map.mapCont.tileCont.addChildAt(this, baseNdx > 0 ? baseNdx : tiles.length);
    // remove adjacency links:
    console.log(stime(this, `.new Mountain: ${hex0} -- ${hex1}`))
    delete hex0.links[dir01];
    delete hex1.links[H.dirRev[dir01]];
  }
};

/////////////////////////////////// HexMap2 ///////////////////////////////////////////////

/** specify Terrain & Harvest of map Region hexes */
type TileSpec = { row: number, col: number, ter: TERRAIN, h: HARVEST }

/** HexMap2 holds the playable ChaosTile for each Region, plus Base Regions & some Base Regions (2-3-4 Player) */
export class HexMap2 extends HexMap<ChaosHex2> {
  constructor(radius?: number, addToMapCont?: boolean, hexC: Constructor<ChaosHex2> = ChaosHex2, Aname?: string) {
    super(radius, addToMapCont, hexC, Aname)
  }

  // smaller radius
  override makeMark(rh = this.radius, rc = this.radius * .25) {
    return new HexMark(rh, rc);
  }

  // TODO: types for headless/non-GUI HexMap<ChaosHex>

  rmHex(hexMap: HexMap<ChaosHex2>, row: number, col: number) {
    const hex = hexMap[row][col] as ChaosHex2;
    hex.cont?.parent?.removeChild(hex.cont); // remove hex.cont from display list
    this.unlink(hex);
    delete hexMap[row][col];       // remove hex element from hexMap
  }

  /** remove each hex not used by Chaos map */
  sculptMap(hexMap = this) {
    hexMap[1].forEach(hex => this.rmHex(hexMap, hex.row, hex.col));
    this.rmHex(hexMap, 2, 1);
    this.rmHex(hexMap, 2, 2);
    this.rmHex(hexMap, 2, 4);
    this.rmHex(hexMap, 2, 6);
    this.rmHex(hexMap, 2, 7);
    this.rmHex(hexMap, 3, 7);
    this.rmHex(hexMap, 4, 7);
    this.rmHex(hexMap, 5, 7);
  }

  // record for saveState/parseScenario:
  // serialize with: Hex.aname(row, col)?
  // restore using: Hex.ofMap(IdHex, HexMap2)
  /** list of mountains placed on this HexMap2 */
  mountains: Mountain[] = [];

  findMtn(hex0: IdHex, hex1: IdHex) {
    const eq = (hex0: IdHex, hex1: IdHex) => (hex0.row == hex1.row) && (hex0.col == hex1.col);
    return this.mountains.find(elt => (eq(elt.hex0, hex0) && elt.hex1 == hex1) || (eq(elt.hex0, hex1) && eq(elt.hex1, hex0)))
  }

  removeMtn(hex0: Hex2, hex1: Hex2) {
    const mtn = this.findMtn(hex0, hex1);
    if (!mtn) return;
    this.mapCont.tileCont.removeChild(mtn);
    removeEltFromArray(mtn, this.mountains);
  }

  /* place a purple mountain between two Hexes */
  placeMtn(hex0: IHex2, hex1: IHex2) {
    if (this.findMtn(hex0, hex1)) return;
    try {
      new Mountain(hex0, hex1);
    } catch (msg) {
      console.warn(stime(this, `.placeMtn: ${msg}`))
    }
  }

  /** placeTile(row, col) after removing existing tile at row, col */
  replaceTile(tile: ChaosTile, row: number, col: number) {
    const hex = this.getHex({row, col});
    hex?.tile?.sendHome();
    tile.moveTo(hex);
  }

  /**
   * configure hexMap with terrain tiles, mountains, adjust adjacency, mark open base locations
   *
   * @param hexMap on which to put the ChaosTiles
   * @param p6ary permutation for xtraTiles for (3, 4, 5)-players; set by ScenarioParser
   * @param np = TP.numPlayers 2..5
   */
  setupMapTiles(chaosTile: Constructor<ChaosTile>, p6ary = [-1, -1, -1], np = TP.numPlayers) {
    const map = this;
    /** return the Nth (of 6) permutation of a 3 element array*/
    const permute6 = (ary3: any[], ndx: number) => {
      if (ndx < 0 || ndx > 5) ndx = Random.random(6);
      const p = [[0,1,2], [0,2,1], [1,0,2], [1,2,0], [2,0,1], [2,1,0]][ndx]
      return [ary3[p[0]], ary3[p[1]], ary3[p[2]]];  // could use ary3.reduce(), but why bother?
    }
    // splice in t & h
    const rct = (nspec: [number, number, { ter: TERRAIN, h?: HARVEST }][]) => nspec.map(([row, col, thid]) => ({ row, col, h: '-', ...thid } as TileSpec))

    // 'Base' terrain are placeholders, not actual Faction Bases
    const initTiles: TileSpec[] = [
      {row: 2, col: 5, ter: 'Base', h: '-'}, // Base
      {row: 4, col: 1, ter: 'Base', h: '-'}, // Base(2)|Mtn(3-5)

      {row: 3, col: 3, ter: 'Plains', h: 'G1'}, // Plain:gem
      {row: 3, col: 4, ter: 'Swamp', h: 'C'}, // Swamp:card
      {row: 3, col: 5, ter: 'Hills', h: 'G1'}, // Hills:gem
      {row: 4, col: 2, ter: 'Swamp', h: 'E2'}, // S:energy
      {row: 4, col: 3, ter: 'Swamp', h: 'C'}, // S:card
      {row: 4, col: 4, ter: 'Hills', h: 'E2'}, // H:energy
      {row: 4, col: 5, ter: 'Swamp', h: 'G1'}, // swamp:gem
      {row: 5, col: 2, ter: 'Plains', h: 'C'}, // Plain:card
      {row: 5, col: 4, ter: 'Plains', h: 'E2'}, // Plain:energy

      {row: 4, col: 6, ter: 'Lake', h: '-'}, // Lake:none
      {row: 5, col: 3, ter: 'Lake', h: '-'}, // Lake:none
      {row: 5, col: 5, ter: 'Hills', h: 'C'}, // Hills:card
      {row: 6, col: 4, ter: 'Base', h: '-'}, // Base(2)|xtile3
    ];
    const xtile3 = permute6([{ter: 'Hills', h: 'E2'}, {ter: 'Swamp', h: 'G1'}, {ter: 'Plains', h: 'C' }], p6ary[0])
    const xtile4 = permute6([{ter: 'Hills', h: 'C' }, {ter: 'Swamp', h: 'E2'}, {ter: 'Plains', h: 'G1'}], p6ary[1])
    const xtile5 = permute6([{ter: 'Hills', h: 'G1'}, {ter: 'Swamp', h: 'C' }, {ter: 'Plains', h: 'E2'}], p6ary[2])
    const xbase = (tid: TERRAIN) => ({ ter: tid });

    const tiles3: TileSpec[] = rct([
      [6, 2, xtile3[0]], [6, 3, xtile3[1]], [6, 4, xtile3[2]],
      [7, 4, xbase('Base')] , [3, 2, xbase('Base')], [5, 1, xbase('Base')], [4,  1, xbase('Mtn')], [5, 6, xbase('Base')],
    ]);
    const tiles4: TileSpec[] = rct([
      [6, 5, xtile4[0]], [6, 6, xtile4[1]], [3, 6, xtile4[2]],
    ]);
    const tiles5: TileSpec[] = rct([
      [3, 1, xtile5[0]], [4, 1, xtile5[1]], [2, 3, xtile5[2]],
    ]);
    const xtraTileAry = [[], [], [], tiles3, tiles4, tiles5, []]

    const placeTunnel = (dir12: HexDir, hex1: IHex2, hex2: IHex2, fillc = C.BLUE) => {

      const tunnelFrom = (dir12: HexDir, hex1: IHex2, hex2: IHex2, fillc = C.BLUE) => {
        hex1.links[dir12] = hex2;
        hex2.links[H.dirRev[dir12]] = hex1;
        const tilt = H.dirRot[dir12], rx = TP.hexRad * .33, ry = 0;
        const icon = pentagon(rx, ry, fillc, tilt); (icon as NamedObject).Aname = 'tunnel';
        hex1.edgePoint(dir12, 1.1, icon);
        map.mapCont.tileCont.addChild(icon); // QQQ: Is .tileCont the correct layer?
      }
      tunnelFrom(dir12, hex1, hex2, fillc)
      tunnelFrom(H.dirRev[dir12], hex2, hex1, fillc)
    }

    const placeTile = (tileSpec: TileSpec) => {
      const { row, col, ter, h } = tileSpec;
      const tile = new chaosTile(`T${row},${col}:${ter.slice(0,1)}:${h}`, ter, h); // player = undefined
      map.replaceTile(tile, row, col);
    }
    map.sculptMap();                                 // reshape to basic hexes
    initTiles.forEach(ts => placeTile(ts));          // place fixed tiles on basic hexes
    for (let ndx = 3; ndx <= np; ndx++ ) {
      xtraTileAry[ndx].forEach(ts => placeTile(ts)); // place extra (per player count) tiles, randomized
    }

    map.forEachHex(hex => {
      hex.tile || placeTile({ ... hex, ter: 'Mtn', h: '-' });   // cover unused hexes with Mtn
    })

    // place 3 standard adjacency-breaking mountains:
    this.placeMtn(map.getHex({row: 4, col: 4}), map.getHex({row: 3, col: 4}) );
    this.placeMtn(map.getHex({row: 4, col: 4}), map.getHex({row: 4, col: 5}) );
    this.placeMtn(map.getHex({row: 4, col: 2}), map.getHex({row: 5, col: 2}) );
    if (np > 3) placeTunnel(H.N, map.getHex({row: 3, col: 6}), map.getHex({row: 6, col: 2}), C.BLUE)
    if (np > 4) placeTunnel(H.N, map.getHex({row: 3, col: 1}), map.getHex({row: 6, col: 6}), C.RED)

    // set all Mtn & Base Tiles unreachable: (will re-link when actual Base is placed)
    map.forEachHex(hex => {
      const tile = hex.tile as ChaosTile;
      if (tile?.terrain == 'Mtn' || tile?.terrain == 'Base') {
        hex.forEachLinkHex((hex2, dir, hex0) => {
          delete hex0.links[dir!]
          delete hex2.links[H.dirRev[dir!]]
        })
      }
    })

    map.forEachHex(hex => {
      if (hex.ctile?.terrain == 'Base') hex.ctile.sendHome(); // remove 'Base' cover tiles
    })

  }
}
