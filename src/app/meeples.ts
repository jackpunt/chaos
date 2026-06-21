import { C, type XY, type XYWH } from "@thegraid/common-lib";
import { NamedContainer, PathShape, RectShape, TextInRect, type Paintable } from "@thegraid/easeljs-lib";
import type { Rectangle } from "@thegraid/easeljs-module";
import { Graphics } from "@thegraid/easeljs-module";
import { Meeple, MeepleShape, Tile, TP, type DragContext, type Hex, type HexM, type IHex2 } from "@thegraid/hexlib";
import type { ChaosHex2 as Hex2 } from "./chaos-hex";
import { type BONUS } from "./chaos-tile";
import type { FactionId } from "./factions";
import { Foundation } from "./foundation";
import type { PhaseName } from "./game-state";
import type { Player } from "./player";


type XYp = [x: number, y: number];

const chaosUnitType = ['Fighter', 'Leader'] as const;
export type ChaosUnitType = typeof chaosUnitType[number];

const chaosBuildingType = ['Factory', 'Outposts', 'Stronghold'] as const;
export type ChaosBuildingType = typeof chaosBuildingType[number];


export class PaintableCont extends NamedContainer implements Paintable {
  constructor(Aname = '', cx = 0, cy = 0) {
    super(Aname, cx, cy);
  }
  paint(colorn?: string, force?: boolean): Graphics {
    let rv = new Graphics();
    this.children.forEach(child => {
      const pc = child as Paintable;
      if (typeof pc.paint == 'function') {
        rv = pc.paint(colorn, force); // capture the last Paintable Graphics
      }
    })
    return rv;
  }

  calcBounds(): XYWH {
    const { x, y, width: w, height: h } = this.getBounds();
    return {x, y, w, h};
  }

  /** ensure PaintableCont is cached; uses getBounds() ?? calcBounds().
   *
   * copied from PaintableShape
   *
   * @param scale [1] scale to use if cache is created
   */
  setCacheID(scale = 1) {
    if (this.cacheID) return;  // also: if already cached, get/setBounds is useless
    let b = this.getBounds() as Pick<Rectangle, 'x' | 'y' | 'width' | 'height'>
    if (!b) {
      const { x, y, w, h } = this.calcBounds();
      b = { x, y, width: w, height: h }
    }
    this.cache(b.x, b.y, b.width, b.height, scale);
  }
}

/** constructor sets this.pColor, this.radius.
 *
 * subclass can override static pointAry, static get points, or mscgf(...)
 */
class PathShapeMeeple extends MeepleShape {
  /** points returned by static get points() */
  static pointAry: XYp[] = [[-1,0], [1,0], [1,1], [-1,1]];

  /** return this.pointAry [static] */
  static get points(): XYp[] { return  this.pointAry};

  morph(points: XYp[], radius = TP.meepleRad/4) {
    return points.map(([x,y]) => [x * radius, (y + 1) * radius] as XYp)
  }

  /** subclass override mscgf(...) for non-PathShape */
  override mscgf(fillc = this.pColor, ss?: number, rs?: number): Graphics {
    const points0 = (this.constructor as typeof PathShapeMeeple).points;
    const points = this.morph(points0, this.radius)
    return new PathShape({ points, fillc}, this.graphics).graphics;
  }

  // TODO: makeOverlay for backside Shape
  override makeOverlay(y0?: number): createjs.Shape {
    return super.makeOverlay(y0); // make an overlay shape for the backside of baseShape.
  }
}
class FactoryShape extends PathShapeMeeple {
  /** flatish pentagon */
  static override pointAry = [[-1,0], [-1, -1], [0, -1.25], [1,-1], [1, 0]] as XYp[];
}
class OutpostShape extends PathShapeMeeple {
  static makePointAry() {
    // enforce symmetry:
    const leftPts = [[-1, 0], [-1, -1.4], [-.8, -1.4], [-.8, -1], [0, -1.5]] as XYp[];
    const rightPts = leftPts.map(([x, y]) => [-x, y]).slice(0, -1).reverse() as XYp[];
    return leftPts.concat(rightPts);
  }
  /** larger, w/walls */
  static override pointAry = OutpostShape.makePointAry();
}
class StrongholdShape extends PathShapeMeeple {
  /** larget, w/tower */
  static override pointAry = [[-1, 0], [-1, -2], [-.8, -2], [-.8, -1.5], [0, -2], [1, -1.5], [1, 0]] as XYp[];
}




// change moveTo->unitCollision to allow send multiple meeps on hex:
// put a TileSource<Fighter> on each hex? then .get & .put & .available
// if !!meep.hex;  sourceHexUnit is the only one actually *on* the hex.
// the others are stacked on 'available'


// most ChaosMeeples have a TileSource<ChaosMeeple>
// homeHex = TileSource.hex
// other have unitary homeHex (LeaderCard)

/** ChaosMeeple comprises:
 * - ChaosUnit(Leader, Fighter) &
 * - Building(Factory, Outposts, Stronghold) &
 * - ChaosToken(Trap, Morale, Foundation, PricingToken, 'Relic', )
 */
export class ChaosMeeple extends Meeple {
  declare player: Player;

  /** invoke from startDrag() to prevent movement */
  stopDrag() {
    this.player.gamePlay.table.dragger.stopDrag()
  }

}
/** marker class denoting Faction presence in a Region */
export class ChaosPresence extends ChaosMeeple {}

class ChaosUnit extends ChaosPresence {

}

export class Fighter extends ChaosUnit {

}

export class Leader extends ChaosUnit {
  upgrade = false;  // set true when upgraded
}

// methods in common to Buildings
// player moves during Build phase, auto-move during Combat phase
// subtypes may contribute Strength
//
// Panel has FHex[9], FoundationTile has a FHex (when face up)
//
export class ChaosBuilding extends ChaosPresence {
  addStrength = 0;    // maybe something more general with Effects or Advice

  override get radius() { return TP.meepleRad; }
  readonly bText!: BONUS;           // 'E2' 'C' 'G1'
  homeAry!: Foundation[];  // buildings in residence (take/put from left)

  _found!: Foundation;
  /** Assert Building is always assigned to *some* Foundation: panel or map */
  get found() { return this._found }
  set found(f: Foundation) {
    if (this._found && this._found != f) {
      this._found.bldg = undefined;   // release that foundation.
    }
    this._found = f;
    f.bldg = this;       // inform foundation it is occupied.
  }

  constructor(Aname: string, player: Player, f: Foundation, homeAry: Foundation[]) {
    super(Aname, player);
    this.homeAry = homeAry;
    this.nameText.y += this.radius/4;
  }

  override makeShape(size = this.radius/2): Paintable {
    const bShape = this.makeShape0(size);
    return bShape;
  }

  makeShape0(size = 20): Paintable {
    return new RectShape({ x: -size/2, y: -size/2, w: size, h: size, }, 'rgba(0, 0, 0, 0.3)', 'black')
  }

  override isLegalTarget(toHex: Hex2, ctx?: DragContext): boolean {
    const tile = toHex.ctile;
    return !!tile?.foundations.find(f => f && (!f.bldg || f.bldg == this))
  }

  override sendHome(): void {
    super.sendHome
    const lim = this.homeAry.length - 1;
    // ASSERT there is always an open slot
    const rndx = this.homeAry.toReversed().findIndex(f => f.bldg == undefined || f.bldg == this);
    const ndx = lim - (rndx < 0 ? 0 : rndx);
    this.found = this.homeAry[ndx];
  }

  override dragStart(ctx: DragContext): void {
    const ndx = this.homeAry.findIndex(f => f.bldg == this); // Panel slot of this Building's current Foundation
    if (ndx < 0) {
      this.scaleX = this.scaleY = 1;  // not coming from Panel, undo mapScale
      return;        // OK to drag
    }
    const fndx = this.homeAry.findIndex(f => f.bldg !== undefined)
    if (ndx == fndx) {
      this.homeAry[ndx].bldg = undefined; // OK to drag; remove from Panel
    } else {
      this.stopDrag();          // leave on Panel
    }
  }

  zoomed = false;
  zoom(z = true, zf = Foundation.mapScale) {
    if (this.zoomed == z) return; // nothing to do
    if (this.zoomed) {
      this.zoomed = z; // true
      this.gamePlay.table.zoom(zf);
    } else {
      this.zoomed = z; // false
      this.gamePlay.table.zoom(1/zf);
    }
  }

  markMap?: HexM<Hex>;
  override showTargetMark(hex: IHex2 | undefined, ctx: DragContext) {
    if (ctx.targetHex) {
      this.markMap = ctx.targetHex.map;
      this.markMap.showMark(ctx.targetHex)
      this.zoom(true);
    } else {
      this.markMap?.showMark(undefined);
      this.zoom(false)
    }
  }

  override dropFunc(targetHex: Hex2, ctx: DragContext): void {
    if (!targetHex) {
      this.sendHome();
      return;
    }
    // on targetHex (on map), place on Foundation
    if (targetHex) {
      this.scaleX = this.scaleY = Foundation.mapScale
      const f = this.findFoundation(targetHex)
      f.bldg = this;   // mark Foundation occupied
      this.x = f.x; this.y = f.y;
      f.parent.addChild(this);
      return;
    }
  }
  // invoke before super.dropFunc -> moveTo(hex)
  // but after dragger.drop: dropCont.addChild(dobj)
  // this.parent = tileCont ie: meepleCont
  // this.hex = hexMap@[r,c]
  findFoundation(hex2: Hex2) {
    const ctile = hex2.ctile!;
    const p = this.parent.localToLocal(this.x, this.y, ctile.parent);
    // ASSERT: there is an empty Foundation, else not isLegalTarget!
    const fs = ctile?.foundations.filter(f => f && (!f.bldg || f.bldg == this)) as Foundation[];
    const f = fs.sort((a, b) => Math.abs(a.x - p.x) - Math.abs(b.x - p.x))[0];
    return f;  // the nearest Foundation
  }
}

export class Factory extends ChaosBuilding {
  override bText = 'E2' as BONUS;
  override makeShape0(size = TP.meepleRad): Paintable {
    const bs = new FactoryShape(undefined, size)
    return bs;
  }
}

export class Outposts extends ChaosBuilding {
  override bText = 'C' as BONUS;
  override makeShape0(size = TP.meepleRad): Paintable {
    return new OutpostShape(undefined, size)
  }
  override addStrength = 2;
}

export class Stronghold extends ChaosBuilding {
  override bText = 'G1' as BONUS;
  override makeShape0(size = TP.meepleRad): Paintable {
    return new StrongholdShape(undefined, size);
  }
}

// Meeple has unMove & faceUp

// These are more Tile-like: See also: Foundation (TODO: merge)
/** each subclass has a slot on ChaosHex, but does not confer faction 'presence' */
class ChaosToken extends Tile {
  homeXY!: XY;                // sendHome location, if needed

}

// Player moves only during initial game startup;
// Auto moves during Relics phase
export class Relic extends ChaosToken {

}

// Has a slot on ChaosHex
// Auto-drop mostly; player selects Strength or Fame when there is a choice.
export class Morale extends ChaosToken {
  status = 'M1' as "M1" | "M2";
}

// Drop Stronghold on hex/foundation and game can move the Trap.
// resetTile() during Income phase
export class AI_Trap extends ChaosToken {
  status = 'T1' as "T1" | "T0";   // T0 when triggered
}

// -------- not on a usual hex ---------

// Drop the Rhy-zu leader on a Base and game can handle the token.
// move it to JReyek player board in correct orientation.
export class RhyzuToken extends ChaosToken {

}

// Auto-move during Discovery phase (just click on track, players marker advances)
export class DiscoveryMark extends ChaosToken {

}

export type PriceId = 1 | 2 | 3 | 4 | 5 | 6;
export type PriceBonus = '^'|'C'|'>'|'%';
type VDIST = [ toFac: number, toBank: number, toLeft?: number, toRight?: number, expire?: number ];
type PT_Status = 'avail' | 'inplay' | 'invault';
// Auto-move during SetPrices phase (just click on track, place token)
export class PricingToken extends ChaosToken {
  bColor = 'rgb(150, 70, 0)';
  nColor = 'rgb(255, 140, 0)'; // neutral color

  static bonus35 = [ ['^', 'C'], ['>', '%']] as PriceBonus[][];
  static bonus_2 = [ ['^'], ['^']] as PriceBonus[][];

  static dist35 = [
    // ^C   [> %]    3      4      5     [6]
    [1, 0], [1,1], [1,2], [2,2], [2,3], [3,3],
  ]
  static dist2 = [
    // ^     [^]     3      4      5     [6]
    [1, 0], [2,0], [1,2], [2,2], [2,3], [3,3],
  ]
  static neutral35 = [
      [0,0,1,1,2], [0,3, 0, 0, 4], [0,2,1,1], [0,5],
  ]
  static neutral2 = [
      [0, 3, 0, 0, 4], [0, 5],
  ]

  faction?: FactionId;    // undefined for Neutral Tokens

  readonly vdist: VDIST;
  readonly bTexts?: PriceBonus[];

  // extra things that happen when used to price a phase; for ex: gain ('%' or 'C'), place Rhyzu or retrieve from vault
  effect() { }

  // when played to price: move to 'inplay'
  // at end of SetPrices phase: if vid==1 is 'inplay', move Tokens from 'invault' to 'avail'
  // at end of 'Move' (or 'Income' ?) phase: move from 'inplay' to 'invault'
  _status: PT_Status = 'avail';
  get status() { return this._status }
  set status(state: PT_Status) {
    this._status = state;
    // TODO: move to right place? remove from Panel?
  }
  // when 'inplay' onPhase is set:
  onPhase?: PhaseName; // subset of GameState.state.Aname

  wh: number;

  /**
   *
   * @param vid  1 .. 6 (or: 2, 3, 4, 5) (or: 3, 5)
   * @param facId [-1] is Neutral;
   */
  constructor(np: number, public vid: PriceId, xy: XY = { x: 0, y: 0 }, player?: Player) {
    const facId = player?.facId ?? -1;
    super(`F${facId}:PT${vid}`, player);        // construct baseShape
    this.wh = this.gamePlay.hexMap.xywh().dxdc;
    this.homeXY = xy;
    if (facId < 0) {
      this.vdist = (np == 2 ? PricingToken.neutral2 : PricingToken.neutral35)[vid-1] as VDIST;
    } else {
      this.vdist = (np == 2 ? PricingToken.dist2 : PricingToken.dist35)[vid-1] as VDIST;
    }
    this.bTexts = ((np == 2) ? PricingToken.bonus_2 : PricingToken.bonus35)[this.vid-1];
    this.fillCont(this);
    this.status = ['avail', 'invault', 'avail', 'avail', 'avail', 'invault'][vid-1] as PT_Status;
    // TODO: implement expiration, and (%) and retrieve(^) and card(C)
    this.effect = () => {};
  }

  // Supply color for neutral Tokens:
  override get pColor() { return this.player?.color ?? PTokenShape.nColor }

  // add content above the baseShape:
  fillCont(cont: NamedContainer, size = (this.baseShape as RectShape).getBounds().width) {
    const setTR = (tr: TextInRect, w = 10, x = 0, y = 0) => {
      tr.rectShape.setRectRad({ w, x: tr.rectShape.x - w/2 }) ;
      tr.x = x; tr.y = y;
      cont.addChild(tr);
      tr.paint(tr.bgColor, true)
    }
    const [ toFac, toBank, left, right ] = this.vdist;
    const s = size*.92, x1 = -s/4, x2 = +s/4, y1 = +s/4, y2 = -s/4;
    const fontSize = s * .2;
    if (left !== undefined) {
      const lt = new TextInRect(`${left}`, { bgColor: 'black', fontSize })
      const rt = new TextInRect(`${right}`, { bgColor: 'white', fontSize })
      lt.x = y1; lt.y = y1;
      rt.x = +s/3; rt.y = y1;
      cont.addChild(lt, rt);
    }
    if (toFac > 0 && toBank > 0) {
      const tf = new TextInRect(`${toFac}`, { bgColor: this.pColor, fontSize })
      setTR(tf, s*.45, x1, y1);
      const tb = new TextInRect(`${toBank}`, { bgColor: PTokenShape.nColor, fontSize })
      setTR(tb, s*.45, x2, y1);
    } else if (toFac > 0) {  // single payment to Faction:
      const tf = new TextInRect(`${toFac}`, { bgColor: this.pColor, fontSize })
      setTR(tf, s, 0, y1)
    } else if (toBank > 0) { // single payment to Bank
      const tb = new TextInRect(`${toBank}`, { bgColor: PTokenShape.nColor, fontSize })
      setTR(tb, s, 0, y2)
    }
    if (this.bTexts) {
      const text = this.bTexts.join('  ')
      const tir = new TextInRect(text, { bgColor: C.rgba(this.pColor, .6), fontSize })
      setTR(tir, s*.7, 0, y2);
    }
    // TODO: use bonusIcon(^, C, >, %)
    this.paint();
    return cont;
  }
  override makeShape(size = TP.meepleRad * 1.2): Paintable {
    return new PTokenShape(size)
  }

  override sendHome(): void {
    this.x = this.homeXY.x;
    this.y = this.homeXY.y;
    const parent = this.player?.panel ?? this.parent; // neutral tokens stay on table
    parent.addChild(this);
  }

  override dropFunc(targetHex: IHex2, ctx: DragContext): void {
    if (!targetHex) {
      this.sendHome();
    } else {
      this.x = 0; this.y = 0;
      this.moveTo(targetHex);
    }
  }
}

class PTokenShape extends RectShape {
  static bColor = 'rgb(150, 70, 0)';
  static nColor = 'rgb(255, 140, 0)'; // neutral color

  constructor(public size = 10, g0 = new Graphics) {
    super({ x: -size/2, y: -size/2,  w: size, h: size }, PTokenShape.bColor, 'black', g0);
  }
  override paint(colorn?: string, force?: boolean): Graphics {
    return super.paint(this.colorn, force)
  }
}

// Also: factory, outposts, stronghold, foundation, relic, discovery-marker?, fame-marker?
// and cardboard: rhy-zu-token, morale {fame, strength}, ai-trap,
