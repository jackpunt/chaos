import { C, permute, removeEltFromArray, S, stime, type XY } from "@thegraid/common-lib";
import { AliasLoader, NamedContainer, type Paintable, PathShape, PolyShape, RectShape } from "@thegraid/easeljs-lib";
import type { DisplayObject } from "@thegraid/easeljs-module";
import { type DragContext, type DragFuncs, H, type HasDragger, type HexDir, HexShape, type IHex2, MapTile, Player as PlayerLib, rightClickable, type Table, Tile, TP } from "@thegraid/hexlib";
import { type ChaosHex2, type ChaosHex2 as Hex2, type HexMap2 } from "./chaos-hex";
import { type ChaosTable } from "./chaos-table";
import { NumCounterHex } from "./counters";
import { Faction, type FactionId } from "./factions";
import { Foundation } from "./foundation";
import type { GamePlay } from "./game-play";
import type { AI_Trap, ChaosBuilding, Factory, Morale, Outposts, Relic, Stronghold } from "./meeples";
import { ChaosToken, Leader } from "./meeples";
import { superMethod } from "./mixins";
import type { Player } from "./player";
import type { FactionOnTileState } from "./scenario-parser";
import { bonusIcon, CO, pentagon } from "./table-params";

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

/** distance from origin (or given p0) */
function dist(pt: XY, p0 = { x: 0, y: 0 }) {
  return Math.hypot(pt.x - p0.x, pt.y - p0.y)
}

export type HexPair = [Hex2, Hex2];

/** A Graphic target straddling the border between two Regions */
export class PairTarget extends NamedContainer {
  static targets: PairTarget[] = [];

  /** create PairTarget and add to PairTarget.targets; and show on overCont. */
  constructor(public pair: HexPair, public dObj: DisplayObject) {
    const [fHex, tHex] = pair;
    const dir01 = fHex.findLinkHex(hex => (hex == tHex));
    if (!dir01) {
      throw(`new PairTarget: hexes ${pair} are not adjacent`);
    }
    const dx = TP.hexRad * .3, dy = dx*2;
    super(`PairTarget#${PairTarget.targets.length}`);
    this.addChild(dObj);
    PairTarget.targets.push(this);

    this.rotation = (H.dirRot[dir01]);
    fHex.edgePoint(dir01, 1, this);      // set RectShape on edge of Hex
    fHex.map.mapCont.overCont.addChild(this); // place on top of other tiles
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
const terrainIds = ['Mtn', 'Hills', 'Swamp', 'Plains', 'Lake', 'Base', 'Ldr'] as const;

// 'energy' is E2, 'energy1' is E1, 'recruit1' is 'R1'
// energy1 on AI Base; 'recruit1' on Oxataya Base
// Note: Tile.setNameText() converts '-' to newline
// board_HARVEST:          ['E2', 'G1', 'C']
// relic_Foundation bonus: ['E2', 'G1', 'C', '%', '-', ]  ('-' on Relic-6: never claimed)
// panel_Foundation bonus: ['-']
// panel_BgFound bonus:    [... various text...]
// panel_Building income:  ['E3', 'E2', 'G1', 'C']    // E3 for BldgFoundation[0] (base Income)
/** basic Bonus for Foundation and Harvest */
const bonusIds = ['-', 'E3', 'E2', 'E1', 'C', 'G1', 'R1', '%'] as const; //

// %, Energy, Gem, Card, Build, Recruit, Leader, Harvest, Move, Upgrade(leader), Attribute(upgrade)
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
export type FAME_BONUS = 'E1' | 'E2' | 'C' | 'G1' | '%' | 'R1' | 'R2' | 'M1' | 'Win' | 'End'; // M1 is Redeploy

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


const colorOfTerrain: Record<TERRAIN, string> = {
  Mtn: C.grey64,
  Hills: C.nameToRgbaString(C.dimYellow, .5),
  Swamp: C.nameToRgbaString(C.lightgreen, .5),
  Plains: C.nameToRgbaString(C.BROWN, .5),
  Lake: C.lightblue,
  Base: C.WHITE,  // color of temp Tiles placed on hexes reserved for 'Base' Tiles
  Ldr: C.WHITE,
}

export class MoveIcon extends ChaosToken {
  color: string;
  color2: string;
  constructor(player: Player, public srcTile: ChaosTile) {
    super(`FoT_${player.facId}-mover`, player)
    this.color = C.nameToRgbaString(this.player.color, .2);
    this.color2 = C.nameToRgbaString(C.white, .7);
    this.paint(this.color)
    this.makeDragable(player.gamePlay.table);
    this.mouseChildren = false;
    this.visible = false;  // only visible in Move phase
  }
  override makeShape(size?: number) {
    const rad = TP.hexRad * .2, fillc = C.WHITE;
    return new  PolyShape({ rad, nsides: 6, fillc })
  }
  override sendHome(): void {
    this.srcTile.getFoT(this.player).addChildOver(this);
  }
  override dragStart(ctx: DragContext): void {
    this.paint(this.player.hasMP ? this.color : this.color2)
    super.dragStart(ctx);
    this.fromHex = this.srcTile.chex;
  }
  get isFromSwamp() {
    return (this.srcTile.isSwampCnx)
  }
  isToSwamp(ctile: ChaosTile) {
    return ctile.isSwamp;
  }
  override isLegalTarget(toHex: Hex2, ctx: DragContext): boolean {
    if (this.player.facId !== 5 && toHex.ctile?.isLake) return false; // vs: !faction.canEnterLake
    if (this.player.facId === 3 && toHex.ctile?.isSwampCnx && this.isFromSwamp) return true; // Leyrein connects Swamps
    return this.fromHex.linkHexes.includes(toHex);
  }
  override dropFunc(targetHex: Hex2, ctx: DragContext) {
    if (this.player.hasMP) {
    const toRegion = targetHex?.ctile, srcTile = this.srcTile;
    if (toRegion && toRegion != srcTile) {
      this.player.newMoveInPlay(srcTile, toRegion);
    }
    }
    this.paint(this.color);
    this.sendHome();
  }
}
      // TODO: MoveInPlay details:
      // Arrow from FoT to Fot. Add FoT on dest
      // with a FighterCounter (FC) t0 show number of Fighters transfered.
      // Move [all] Units from src to dest;
      // rightclick to return units to srcTile
      // Internally: an FoT with the moved Leaders recorded but shown only on the toRegion.
      // click the arrow/FC to increment/decrement the by local FC and the target FC.
      // record state of Units before; keybinder to reset Units to beginning of phase.

/** used by MoveInPlay to count Fighters transfered from FoT to FoT */
export class FighterCounter extends NumCounterHex {
  constructor(public mip: MoveInPlay, name: string, initValue: number | string = 0, color?: string, fontSize?: number, fontName?: string, textColors?: string[]) {
    super(name, initValue, color, fontSize, fontName, textColors)
    // rightClick OR ctrl-key causes -5/-1 decrement:  [right & shift would result in +5/+1]
    rightClickable(this, (evt) => this.incValueOnClick(evt, -5, -1))
  }

  // transfer fighter(s) fromFot --> toFot; counting the number transfered.
  override incValue(incr: number) {
    const mip = this.mip;
    const incv = incr > 0 ? Math.min(incr, mip.fromFot.fighters) : -Math.min(-incr, mip.toFot.fighters, mip.toFot.fighters - mip.toFot.preFighters);
    mip.fromFot.fighterIcon.incValue(-incv);
    mip.toFot.fighterIcon.incValue(incv);
    super.incValue(incv);
    mip.toFot;    // set visible
    mip.fromFot;  // set visible
  }
}


/** Player uses a MovePoint to move Units from srcTile to toRegion  */
export class MoveInPlay extends NamedContainer {
  from: ChaosTile;
  to: ChaosTile;
  counter: FighterCounter;
  teleGraphic?: MoveInPlay.TeleGraphic; // iff this is Leyrien swamp move
  get fromFot() { return this.from.getFoT(this.player) }
  get toFot() { return this.to.getFoT(this.player) }

  constructor(public player: Player, from: ChaosTile, to: ChaosTile) {
    super(`${from.name}-${to.name}`)
    this.from = from;
    this.to = to;
    const counter = this.counter = new FighterCounter(this, `moveFighters`, 0, this.player.color); // (TP.hexSize * .2)
    this.addChild(counter);
    counter.y = -.04 * TP.hexRad;
    counter.clickToInc(true, 5, 1); // --> incValueOnClick(evt, ...) --> incValue(incv)
    counter.on('incr', (evt: Object) => {
      // const ve = evt as ValueEvent;
      if (this.counter.value == 0) {   // note: it never *increments* to zero, must have been ctrl|right click
        removeEltFromArray(this, this.player.movesInPlay);
        if (this.teleGraphic) {
          const tgs = this.teleGraphic.tgsOnTile(this.from);
          removeEltFromArray(this.teleGraphic, tgs)
        }
        // remove from fHex.map...overCont:
        this.parent.parent.removeChild(this.parent); // PairTarget(this) OR TeleGraphic(this, line)
        this.player.gamePlay.table.stage.update();
      }
    })
    this.addArrowGraphic();
    this.toFot;  // set visible
  }

  addArrowGraphic() {
    const pair = [this.from.chex, this.to.chex] as HexPair;
    if (pair[0].linkHexes.includes(pair[1])) {
      // AdjGraphic: container(pent, counter)
      const color = C.nameToRgbaString(this.player.color, .5);
      const pent = pentagon(TP.hexRad*.4, TP.hexRad*.3, color, 0, '');
      this.addChildAt(pent, 0);                       // under this.counter
      // overcont->PairTarget->this->[Arrow, Counter]
      const pairGraphic = new PairTarget(pair, this); // PT -> fHex.map...overCont @ fHex.edgePoint()
      this.counter.rotation = -pairGraphic.rotation;  // Arrow tilts, Counter stays vertical
    } else {
      // Leyrein in swamp! (Tunnels work as adjacent)
      // A Swamp has at most 5 normal adjacent neighbors (T4,3 T4,5 have adj Lake)
      // A Swamp has at most 6 "swamp adjacent" connections
      console.log(stime(this, `.addTeleGraphic:`), pair);
      const [fHex, tHex] = pair;
      // overcont->TG->[this->[Counter], line]
      this.teleGraphic = new MoveInPlay.TeleGraphic(this, pair); // TG -> fHex.map...overCont @ fHex.cornerXY
      return
    }
  }
  /** fromTile -> SwampGraphic(s) in use */
  static teleGraphics: Map<ChaosTile, MoveInPlay.TeleGraphic[]> = new Map<ChaosTile, MoveInPlay.TeleGraphic[]>();

  clearMovePairs() {

  }
  /** update Fighter counters: plus or minus */
  moveFighters(incr: number) {
    return this.counter.incValue(incr)
  }
}
export namespace MoveInPlay {
  // TeleGraphic for SwampCnx
  // There no HexDir or Edge associated with swamp teleportation.
  // place figherCounter in a corner of from Hex.

  /** Graphic indicating Leyrien teleportation via Swamp */
  // green hex with a fighterCounter, in 'a corner' of the fromHex
  // with a line pointing to the toHex.FoT(Leyrien)
  export class TeleGraphic extends NamedContainer {
    dir: HexDir;
    constructor(mip: MoveInPlay, pair: HexPair) {
      super('TeleGraphic')
      const [fHex, tHex] = pair;
      this.addChild(mip);
      const corner = this.pickCorner(pair);
      this.dir = corner.dir;
      this.x = corner.pt.x; this.y = corner.pt.y; // x,y on overCont: += (fHex.x, fHex.y)
      const fot = fHex.ctile?.hasFot(mip.player.facId)!;
      // find coords relative to fHex:
      const ptx = corner.pt.x - fHex.x, pty = corner.pt.y - fHex.y;
      const fx = 0, tx = (tHex.x - fHex.x) + fot.x -ptx;
      const fy = 0, ty = (tHex.y - fHex.y) + fot.y -pty;
      const points = this.pointsAtDistance(fx, fy, tx, ty, TP.hexRad * .25)
      const arrow = new PathShape({ points, fillc: C.BLACK, strokec: C.BLACK })
      // const arrow = new PathShape({ points: [[fx, fy], [fx+2, fy+2], [(fx+tx)/2, (fy+ty)/2], [tx, ty], [tx-2, ty-2]], fillc: C.BLACK, strokec: C.BLACK })
      this.addChild(arrow);
      fHex.map.mapCont.overCont.addChild(this); // TG -> fHex.map...overCont @ fHex.cornerXY
    }

    // subtract d from each end of line:
    pointsAtDistance(fx: number, fy: number, tx: number, ty: number, d: number) {
      const dx = tx - fx;
      const dy = ty - fy;
      const len = Math.hypot(dx, dy);
      const dux = d * dx / len;
      const duy = d * dy / len;
      return [[fx + dux, fy + duy], [ tx - dux, ty - duy ]] as [number, number][];

    }

    /** corner of pair.fHex that is empty and is closest to pair.tHex
     * @param pair
     * @returns { dir: ewDir, pt: XY }
     */
    pickCorner(pair: HexPair) {
      const [fHex, tHex] = pair;
      const tgs = this.tgsOnTile(fHex.ctile!);
      const rad = TP.hexRad * .8; // inside the corner
      const cdirs = H.ewDirs.filter(d => !tgs.find(tg => tg.dir == d)); // for nsTopo: corners are on ewDirs
      const pts = cdirs.map(cdir => ({ dir: cdir, pt: fHex.cornerXY(cdir, rad) }));
      const p0 = pts.map(cpt => (cpt.pt.x += fHex.x, cpt.pt.y += fHex.y, cpt))
        .sort((a, b) => dist(a.pt, tHex) - dist(b.pt, tHex))[0];
      tgs.push(this);
      return p0;
    }
    tgsOnTile(tile: ChaosTile) {
      let empty: MoveInPlay.TeleGraphic[];
      return MoveInPlay.teleGraphics.get(tile) ?? (empty = [], MoveInPlay.teleGraphics.set(tile, empty), empty);
    }
  }
}

/** NumCounterHex that is non-negative. */
export class FighterIcon extends NumCounterHex {
  hexRad!: number;

  constructor(player?: Player, name = 'FighterIcon', fontSize = TP.hexRad * .2) {
    super(name, 0, player?.color, fontSize);
  }
  override incValue(incr: number): void {
    super.incValue(incr)
    if (this.value < 0) this.value = 0;   // and maybe put watchpoint here, should not happen!
  }
}

/** per-Player bits in Region/ChaosTile; add one for each Player, in apprpriate place.
 *
 * @param player: indicates color of glyphs and sector (unless tile.isBase) for the Faction
 * @param tile: parent of FoT; (glyphs are on overCont above tile)
 */
export class FactionOnTile extends NamedContainer {

  buildings: ChaosBuilding[] = [];      // if this Faction has buildings on tile
  /**  number of fighters on tile */
  get fighters() { return this.fighterIcon.value };
  set fighters(n: number) { this.fighterIcon.value = n }
  get inRegion() { return this.tile }
  leaders: Leader[] = [ ];              // 2+ slots (own + Rhyzu), Zcharo: 4, Oxataya: 4
  strength = 0;                         // Apparent strength of Faction
  pins = 0;

  get facId() { return this.player.facId; }
  get index() { return this.player.index; }

  player: Player;
  tile: ChaosTile;
  fighterIcon: FighterIcon;
  moveIcon: MoveIcon;

  constructor(player: Player, tile: ChaosTile) {
    super(`FoT_${player.facId}-${tile.Aname}`);
    this.player = player;
    this.tile = tile;
    this.setXY();   // move to sector for player
    this.fighterIcon = new FighterIcon(player);
    this.tile.reCache(0);
    this.tile.addChild(this);
    this.moveIcon = new MoveIcon(player, tile);
    this.addChild(this.fighterIcon, this.moveIcon);  // update after BaseTile moves...
  }

  /** if (FoT.isBase) addChild(dObj) so dObj moves with Base Tile. */
  addChildOver(dObj: DisplayObject, x = 0, y = 0): DisplayObject {
    dObj.x = x; dObj.y = y;
    if (this.isBase) {
      return super.addChild(dObj);
    } else {
      const overCont = this.tile.hex!.map.mapCont.overCont
       // re-parent from non-dragable mapTile.FoT to overCont:
      this.localToLocal(dObj.x, dObj.y, overCont, dObj);
      return overCont.addChild(dObj);
    }
  }


  // methods to add/remove elements
  /**
   * Add or Remove a Leader from FoT
   * @param ldr
   * @param add true/false => add/remove
   */
  addLeader(ldr: Leader, add = true) {
    if (add) {
      if (!this.leaders.includes(ldr)) {
        // similar to Hex with tile/meep; we have array of slots for Leaders:
        this.leaders.push(ldr);
        ldr.factOnTile = this;
      }
    } else {
      removeEltFromArray(ldr, this.leaders);
      this.removeChild(ldr)
      // ldr.factOnTile = undefined;
    }
    this.update()
  }

  addFighter(n = 1) {
    this.fighters = Math.max(0, this.fighters + n);
    this.update();
  }

  addBuilding(bldg: ChaosBuilding, add = true) {
    // building graphics handled by ctile.foundations
    if (add) {
      this.buildings.push(bldg);
    } else {
      removeEltFromArray(bldg, this.buildings);
    }
  }
  /*  Sector layout:
  //  L1 L2 L3 .. LN
  //    ------
  //      FC


  //  2 -- 4 Players:
  //     11            22
  //    1111          2222
  //  11111111      22222222
  //
  //  44444444      33333333
  //    4444          3333
  //     44            33
  //
  //  5 Players:
  //     11  22222222  33
  //    1111   2222   3333
  //  11111111  22  33333333
  //
  //  55555555      44444444
  //    5555          4444
  //     55            44
  //
  */
  //                2  3  4  5
  static invert = [[2, 2, 2, 2],
                   [2, 2, 2, 0],
                   [0, 0, 0, 2],
                   [0, 0, 0, 0],
                   [0, 0, 0, 0],
                  ];
  static offset = [[0, 0, 0, 0],
                   [2, 2, 2, 1],
                   [0, 0, 2, 2],
                   [0, 0, 0, 2],
                   [0, 0, 0, 0],
                  ];
  // y orientation within the sector:
  get invert() { return -1 + (FactionOnTile.invert[this.index][TP.numPlayers - 2] ?? 0)};
  // x-offset of sector:
  get offset() { return -1 + (FactionOnTile.offset[this.index][TP.numPlayers - 2] ?? 0)};
  /** place where we always use top-center sector */
  get isBase() { return this.tile.isBase || this.tile.isLdr }
  /** move FoT to sector for isBase ? Base : player.index */
  setXY(rad = this.tile.radius) {
    const index = this.index;     // table order determines FoT placement
    // sx, sy: sector placement;
    const sx = (this.isBase ?  0 : this.offset); // -1: left side; offset[][] = 0
    const sy = (this.isBase ? -1 : [0, 1].includes(index) ? -1 : [3, 4].includes(index) ? 1 : TP.numPlayers == 5 ? -1 : 1);
    this.x = sx * rad / 2;
    this.y = sy * rad * H.sqrt3_2/2;
  }

  /** update graphics */
  update() {
    const rad = this.tile.radius, overCont = this.tile.hex!.map.mapCont.overCont;
    // invert: 1 --> leaders on top;  -1 --> leaders on bottom;
    const yh = (this.isBase ? -1 : this.invert) * rad * H.sqrt3_2;
    this.fighterIcon.y = yh * 0;
    if (this.leaders.length > 0) {
      // location of leader line:
      const yl = yh * .33; // assuming 2 of 5 orientation == Base!
      const lineWidth = rad * (this.leaders.length * .29); // Leader.box_width = (.2 * 1.4) * hex.radius
      const gap = lineWidth/this.leaders.length;
      const xl = gap/2 - lineWidth/2;
      this.leaders.forEach((ldr, n) => {
        this.addChildOver(ldr, xl + n * gap, yl); // to overCont or this depending on this.isBase
      })
    }
    this.stage.update();
  }

  preLeaders: Leader[] = [];
  preFighters = 0;
  /** record leaders & fighters */
  setPreMove() {
    this.preLeaders = this.leaders.slice();
    this.preFighters = this.fighters;
  }
  /** reset to preMove values; Note: must reset ALL presence FoTs */
  resetMove() {
    this.fighters = this.preFighters;
    this.leaders = this.preLeaders.slice();
  }
  /** maybe/beginning what we need to saveState of Map.
   *
   * @return FactionOnTileState for this Player.
   */
  getState() {
    const buildings = this.tile.buildings;
    const rv = {
      l: this.leaders.map(l => `${l.Aname}${l.upgraded ? '*': ''}`),
      f: this.fighters,
    } as FactionOnTileState;

    if (buildings && buildings[0].player == this.player) {
      rv.b = buildings.map(b => b.Aname[0]) as ('F'|'P'|'S')[];
    }
    if (this.tile.special) {
      rv.s = this.tile.special.status;
    }
    return rv
  }
}


/**
 * A MapTile with Terrain & Harvest icon; AKA: Region
 *
 * Has a FactionOnTile(player) for each Faction present.
 *
 * also: the extension tiles: 3 each of Yellow, Blue, Red
 *
 * Chaos does not need a 'source' of tiles.
 */
export class ChaosTile extends MapTile {

  static readonly allChaosTiles: ChaosTile[] = [];

  declare gamePlay: GamePlay;
  declare player: Player | undefined;
  declare fromHex: Hex2;
  /** this.hex as ChaosHex */
  get chex() { return super.hex as Hex2; }

  static curTable: ChaosTable;

  override toString(): string {
    super.toString;
    return `${this.Aname}`;
  }

  readonly terrain!: TERRAIN; // immutable
  harvest!: HARVEST;          // can place harvest buff token to change
  harvest_buff?: HARVEST;     // TODO: need additional HARVEST types

  /** Details of Faction Presence on Tile; index by FactionId */
  factions: FactionOnTile[] = [];

  /** set if there is a Relic on this Tile; */
  relic?: Relic;

  special?: Morale| AI_Trap;

  get isLdr() {return this.terrain == "Ldr"}
  get isMtn() {return this.terrain == "Mtn"}
  get isLake() {return this.terrain == "Lake"}
  get isHills() {return this.terrain == "Hills"}
  get isPlains() {return this.terrain == "Plains"}
  get isBase() {return this.terrain == "Base"}
  get isSwamp() {return this.terrain == "Swamp"}
  // Leyrien Base is not Swamp, but can be connected,
  // as can Leyrien Strongholds
  // caller must verify that Leyrien is the Faction in question
  get isSwampCnx() {
    return this.isSwamp ;  // for Leyrein tunneling || this.hasFot().buildings.includes('Stronghold')
  }

  // Note: "Zcharo may have up to 2 Outposts in each Region";
  // one [Zcharo?] Leader can build w/o foundation! we will place a pseudo-Foundation and remove if bldg is destroyed.
  // saveState reduces buildings to ('F'|'P'|'S')[]
  get buildings() {
    return this.foundations.map(f => f?.bldg).filter(b => !!b);
  }

  // Tiles: isLegalTarget(hex, ctx) => (hex.foundations.length < 3)
  foundations: [Foundation?, Foundation?, Foundation?] = [undefined, undefined, undefined]; // Factory, Baracks, Stronghold

  // Meeples: isLegalTarget(hex, ctx) => !hex[this.type] && foundations.find(f=>!f.bldg)
  Factory!: Factory;        //
  Outposts!: Outposts;      //
  Stronghold!: Stronghold;  //

  constructor(Aname: string, t: TERRAIN, h: HARVEST, player?: PlayerLib) {
    super(Aname, player);
    this.terrain = t;
    this.harvest = h;
    this.nameText.y = this.radius * .66;
    this.addChild(this.nameText);        // re-add above afHex
    this.addHarvest();
    // this.setPlayerAndPaint(player);
    this.paint();
    ChaosTile.allChaosTiles.push(this);
  }

  // paint the [terrain or base] color onto the baseShape;
  override paint(colorn = colorOfTerrain[this.terrain], force?: boolean): void {
    super.paint(colorn, force)
  }

  addHarvest() {
    const icon = bonusIcon(this.harvest)!;
    icon.y = this.radius * .41;
    this.addChild(icon);
  }

  override makeShape(): Paintable {
    return new HexShape(); // basic HexShape, not the TileShape
  }

  static makeAllTiles() {
    // GameSetup.initialize() -> AfHex.makeAllAfHex()
    // GameSetup.startScenario() -> layoutTable() -> makeAllPlayers()
    // make a Tile for each AfHex.
  }

  // Note: Foundations are ~never removed.
  ndxForFoundation() {
    return [1, 2, 0].find(ndx => this.foundations[ndx] == undefined);
  }

  canAddFoundation() {
    return this.ndxForFoundation() !== undefined;
  }

  // allocate room for 3 foundations; TODO: if user places more...?
  // "Each Region can contain no more than 3 Foundations"
  // --> Leader: no Foundation required: cons a null-foundation; (still limit 3 buildings?)
  addFoundation(f: Foundation, commit = true) {
    const ndx = this.ndxForFoundation();
    if (commit && ndx != undefined) {
      this.foundations[ndx] = f;
      f.onTile = this;   // record Foundation is onTile on the map.
      // Graphically above this.hex:
      const hex = this.chex, dx = f.radius * 1.03, dy = hex.radius * 2.34;   // <<< foundation.y
      f.scaleX = f.scaleY = Foundation.mapScale;  // scale down when drop on map
      f.x = hex.x + (ndx-1) * dx * f.scaleX;
      f.y = hex.y + dy * f.scaleY;
      f.faceUp(true);
      f.homeXY = { x: f.x, y: f.y };    // see Foundation.sendHome()
      this.chex.mapCont.overCont.addChild(f);
      f.mouseEnabled = false;
    }
    return ndx;
  }

  /** for Relic Foundations when Relic is D&D moved: */
  removeFoundation(f: Foundation) {
    f.parent?.removeChild(f);
    this.foundations[this.foundations.indexOf(f)] = undefined;
    f.onTile = undefined;
    f.sendHome();
  }

  override makeDragable(table: HasDragger & DragFuncs): void {
    return; // tiles not generally dragable
  }
  override isDragable(ctx?: DragContext): boolean {
    return false;   // User/GUI cannot rearrange MapTile
  }

  /** return the FoT(player) if this tile has one. */
  hasFot(facId: FactionId) {
    return this.factions[facId]
  }
  // TODO: specialize LeaderTile.getFoT() to provide FoT at Center
  /** get FoT(player) creating it if mecessary. visible = isMoving || (fot.fighters > 0) */
  getFoT(arg: Player | FactionId) {
    const facId = typeof arg == 'number' ? arg : arg.facId;
    const player = typeof arg == 'number' ? Faction.factionById.get(arg)!.player : arg;
    const fot = this.factions[facId] ?? (this.factions[facId] = new FactionOnTile(player, this));
    const isMoving = (this.gamePlay.movePlayer == player);
    fot.fighterIcon.visible = isMoving || (fot.fighters > 0);
    fot.moveIcon.visible = isMoving;
    return fot;
  }
  // Delegate FoT actions to the associated FoT.
  /** add or remove Leader on FoT */
  addLeader(ldr: Leader, add?: boolean) {
    this.getFoT(ldr.player).addLeader(ldr, add)
  }
  /** add or remove n Figheters onn FoT */
  addFighter(player: Player, n = 1 ) {
    this.getFoT(player).addFighter(n)
  }
  /** add or remove a Building on FoT (graphically on ctile.foundations) */
  addBuilding(bldg: ChaosBuilding, add?: boolean) {
    this.getFoT(bldg.player).addBuilding(bldg, add)
  }
}

export class BaseTile extends ChaosTile {
  declare player: Player;    // Assert that player is defined in super constructor
  override get isBase() { return true }
  override get isSwampCnx() { return this.player.facId == 3 && !!this.player.faction.attributes['expeditious']?.upgraded }
  constructor(faction: Faction) {
    super(`${faction.name}Base`, 'Base', faction.bh, faction.player);

    const image = AliasLoader.loader.getBitmap(faction.name);
    const si = .75;
    image.scaleX *= si;
    image.scaleY *= si;
    image.y += this.radius * .1;
    this.addChild(image)
  }
 override addHarvest() {
    const icon = bonusIcon(this.harvest)!;
    icon.y = this.radius * .61;
    this.addChild(icon);
  }

  // no Foundations allowed in Base
  override ndxForFoundation() {
    return undefined;
  }

  // The only draggable ChaosTile will be the BaseTiles;
  // Leaving this code for when we build them
  // Also drag Building (as meeps) to Build and self-drop
  override cantBeMovedBy(player: PlayerLib, ctx: DragContext): string | boolean | undefined {
    if (this.hex?.isOnMap && !ctx.lastShift) return 'Base is on map'; // TODO: disable Shift after PlaceBase phase
    return super.cantBeMovedBy(player, ctx);
  }

  override makeDragable(table: HasDragger & DragFuncs): void {
    superMethod(this, Tile, 'makeDragable', table)
  }

  override isDragable(ctx?: DragContext): boolean {
    return true;
  }

  override dragStart(ctx: DragContext): void {
    super.dragStart(ctx); // --> cantBeMovedBy()
    {
      // unlink base & remove baseFoundations! (because shiftkey-move)
      this.rmBaseFoundationsAndUnlink(ctx); // if is dragging...
    }
  }

  // dragStart -> markLegal; dragFunc(ctx.info.first) -> setLegalColors
  override markLegal(table: Table, setLegal = (hex: IHex2) => { hex.setIsLegal(false); }, ctx = table.dragContext) {
    table.hexMap.forEachHex(setLegal); // --> .isLegalTarget(toHex, ctx)
  }

  // constraints to drag/drop a ChaosTile (place a Base)
  override isLegalTarget(toHex: Hex2, ctx: DragContext): boolean {
    return !toHex.tile;
  }

  override dropFunc(targetHex: Hex2, ctx: DragContext): void {
    const dragMoved = dist(this, this.fromHex) > 1; // coordinate tranlation causes minor change
    super.dropFunc(targetHex, ctx);     // this.placeTile(targetHex)
    if (!dragMoved) return;  // not dragged (cantbemoved/dragStop), do not reset foundations
    if (!targetHex) return;
    this.addBaseFoundationsAndLink(targetHex, ctx);
  }

  /**
   * Link base Hex to map.
   *
   * If this Base is adjacent to > 2 Regions, select which to use (and place mountains)
   *
   * Then place faction's bf on the two Regions.
   */
  addBaseFoundationsAndLink(hex: Hex2, ctx: DragContext) {
    // link base hex to adjacent non-Mtn Hexes
    const map = this.hex!.map as HexMap2;
    map.link(hex);      // link to all adjacent hexes
    map.unlink(hex, (nHex) => !!nHex.ctile?.isMtn); // rm links to Mtn tiles
    const pairs = this.getAdjacentPairs(hex);  // find each pair of adjacent regions
    if (pairs.length == 0) {
      // on player panel; do nothing
    } else if (pairs.length == 1) {
      this.placeFactionBaseFoundations(pairs[0]);
    } else {
      this.chooseAdjacentPair(hex, pairs);
    }
  }

  getAdjacentPairs(hex: Hex2) {
    // cycle through hex.linkDirs[i], [i+1 % 6]
    const mapDirs = (hex.map as HexMap2).linkDirs;  // assume length == 6; [N, EN, ES, S, WS, WN ]
    const pairs: HexPair[] = [];  // push [hex1, hex2]
    const isRegion = (hex?: Hex2) => { return hex?.ctile && hex.ctile.terrain != 'Mtn' && hex.ctile.terrain != 'Lake'};
    const links = hex.links as Partial<Record<HexDir, Hex2>>; // avoid & Partial<Record<HexDir, any>>
    mapDirs.forEach((dir, ndx) => {
      const hex1 = links[dir];
      const hex2 = links[mapDirs[(ndx + 1) % 6]]; // next hex in rotation
      if (isRegion(hex1) && isRegion(hex2)) {
        pairs.push([hex1!, hex2!]);
      }
    })
    return pairs;
  }

  // Base must choose which pair of Hexes to use & add mountains
  chooseAdjacentPair(hex: Hex2, pairs: HexPair[]) {
    // put GUI selector on each pair; on(click) -->
    // --> place mountains on other side(s) of Base
    // --> placeFactionBaseFoundations(pairs[n])
    pairs.forEach(pair => {
      try {
        // Graphic target to indicate which Region Pair user wants for base foundations
        const dx = TP.hexRad * .3, dy = dx*2;
        const rect = new RectShape({ x: -dx/2, y: -dy/2, w: dx, h: dy }, CO.mauve, '');
        const pairTarget = new PairTarget(pair, rect);
        pairTarget.on(S.click, (evt) => this.chooseGivenPair(pair))
      } catch (msg) {
        console.warn(stime(this, `.addBaseFoundationsAndLink: ${msg}`))
      }
    });
  }

  /** establish Base Foundations on given pairTarget. */
  chooseGivenPair(pair: [ChaosHex2, ChaosHex2]) {
    // const pair = pairTarget.pair;
    const hex = this.chex!;   // assert: BaseTile has dropped on map
    const map = hex.map as HexMap2;
    this.gamePlay.removeTargets();  // all PairTargets
    const hexes = this.getAdjacentPairs(this.chex).flat();
    hexes.forEach(hex2 => pair.includes(hex2) || map.placeMtn(hex, hex2));
    this.placeFactionBaseFoundations(pair);
  }

  baseRegions?: HexPair;  // Note: only used by ChaosTile('Base')
  // ASSERT: adjRegions.length == 2
  placeFactionBaseFoundations(adjRegions: HexPair) {
    this.baseRegions = adjRegions;
    const faction = this.player.faction;
    const founds = permute(faction.bf).map((bonus, i) => new Foundation(`${faction.name}_bf${i}`, bonus))
    adjRegions.forEach((hex, n) => {
      const adjTile = hex.ctile!
      adjTile.addFoundation(founds[n]);
      // TODO: moveInPlay().moveFighters(1)
      this.getFoT(this.player).fighterIcon.incValue(-1);
      adjTile.getFoT(this.player).fighterIcon.incValue(1); // ...fighters += 1; ???
      adjTile.getFoT(this.player);  // update visibility of new value
    });
    // block Oxataya from any adjacent Lake:
    if (this.player?.facId == 5) {
      const hex0 = this.hex as Hex2, map = hex0.map as HexMap2;
      hex0.forEachLinkHex(hex1 => !!hex1.ctile?.isLake && map.placeMtn(hex0, hex1))
    }
    // block Circadians from all adjacent:
    if (this.player?.facId == 0) {
      const hex0 = this.hex as Hex2, map = hex0.map as HexMap2;
      hex0.forEachLinkHex(hex1 => !hex1.ctile?.isMtn && map.placeMtn(hex0, hex1))
    }
    this.hex?.map.update();
  }

  /** on this.dragStart(); undo previous placement, recall leaders, fighters & movesInPlay */
  rmBaseFoundationsAndUnlink(ctx: DragContext) {
    this.gamePlay.removeTargets(); // adjPairTargets or movesInPlay
    const hex = this.fromHex;
    if (!hex?.isOnMap) return;
    const map = hex.map as HexMap2;
    // remove any Mtn between hex and nHex; link thru Mtn is already removed...
    map.linkDirs.forEach(dir => {
      const nHex = map.getHex(map.nextRowCol(hex, dir));
      if (nHex) map.removeMtn(hex, nHex)
    })
    const movePlayer = this.gamePlay.movePlayer;
    this.gamePlay.movePlayer = undefined;       // indicate player is not moving (hide 0-fighters)
    const baseFot = this.getFoT(this.player)
    // return fighters and Leaders: (not just the adj foundation locations: all the map! for PlaceBaseAndMove tests)
    this.player.fotPresence.forEach(fot => {
      const nf = fot.fighters;
      baseFot.fighterIcon.incValue(nf);        // send fighters back to base
      fot.fighters = 0;
      fot.leaders.forEach(ldr => ldr.sendHome()); // return to LeaderCard
      fot.leaders.length = 0;
    })
    this.player.movesInPlay.length = 0;    // clear move-counter (re-enable Moves)
    this.player.presence;                  // vis on 0-sized fighters
    this.gamePlay.movePlayer = movePlayer; // restore curent movePlayer

    // remove Foundations that were placed adjacent to Base;
    this.baseRegions?.forEach(nHex => {
      // remove any foundation in nHex:
      nHex.ctile?.foundations.forEach((elt, n, ary) => {
        elt?.parent?.removeChild(elt);
        ary[n] = undefined;
      })
    });
    this.baseRegions = undefined; // remove historical references
    map.unlink(hex);
    map.update();
  }
}

export class LeaderTile extends ChaosTile {
  declare baseShape: Leader.LeaderCard;
  constructor(ldr: Leader, player: Player, pColor = player.color) {
    const Aname = `${ldr.Aname.substring(0,2)}_tile`
    // (name, terrain, harvest, player)
    super(Aname, 'Ldr', '-', player); // isBase: paints (baseShape) { 'Ldr': C.WHITE }
    this.baseShape.setLeader(ldr, true);

    this.paint(pColor)
    const fot = this.getFoT(player);
    fot.setXY(-this.radius * .66);    // Note: fot.isBase == true; --> x = 0; set y to place Icon btw stats & PhaseIcon
  }

  // disable cache, need full zoom/resolution
  override reCache(scale?: number): void { super.reCache(0)  }

  // LeaderCard for this Leader:
  override makeShape(): Paintable {
    return new Leader.LeaderCard();
  }
  // not a drop target for Foundations
  override ndxForFoundation(): number | undefined { return undefined }
}
