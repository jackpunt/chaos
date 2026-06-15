import { type XY, type XYWH } from "@thegraid/common-lib";
import { NamedContainer, PathShape, RectShape, type Paintable } from "@thegraid/easeljs-lib";
import type { Rectangle } from "@thegraid/easeljs-module";
import { Graphics } from "@thegraid/easeljs-module";
import { Meeple, MeepleShape, Tile, TP, type DragContext, type IHex2 } from "@thegraid/hexlib";
import type { ChaosHex2 as Hex2 } from "./chaos-hex";
import type { RESOURCE } from "./chaos-tile";
import { Foundation } from "./foundation";
import type { Player } from "./player";


type XYp = [x: number, y: number];

const chaosUnitType = ['Fighter', 'Leader'] as const;
export type ChaosUnitType = typeof chaosUnitType[number];

const chaosBuildingType = ['Factory', 'Barracks', 'Stronghold'] as const;
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
class BarrackShape extends PathShapeMeeple {
  static makePointAry() {
    // enforce symmetry:
    const leftPts = [[-1, 0], [-1, -1.4], [-.8, -1.4], [-.8, -1], [0, -1.5]] as XYp[];
    const rightPts = leftPts.map(([x, y]) => [-x, y]).slice(0, -1).reverse() as XYp[];
    return leftPts.concat(rightPts);
  }
  /** larger, w/walls */
  static override pointAry = BarrackShape.makePointAry();
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
 * - Building(Factory, Barracks, Stronghold) &
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
  readonly bText!: RESOURCE;           // 'E2' 'C' 'G1'
  homeAry!: Foundation[];  // buildings in residence (take/put from left)
  homeXY!: XY;                // loc of leftmost slot

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
    return !!tile?.foundations.find(f => f && !f.bldg)
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

  override dragFunc(hex: IHex2 | undefined, ctx: DragContext): void {
    super.dragFunc(hex, ctx);
  }

  override dropFunc(targetHex: Hex2, ctx: DragContext): void {
    if (!targetHex) {
      this.sendHome();
      return;
    }
    // if drop on Panel then sendHome
    // if (this.parent === this.player.panel) {
    //   this.sendHome();
    //   return;
    // }
    // on targetHex (on map), place on Foundation
    if (targetHex) {
      this.scaleX = this.scaleY = Foundation.mapScale
      // super.dropFunc(targetHex, ctx);
      const ctile = targetHex.ctile
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
    const ctile = hex2.ctile;
    const x = this.x, y = this.y; // where it dropped
    // ASSERT: there is an empty Foundation, else not isLegalTarget!
    const fs = ctile?.foundations.filter(f => f && !f.bldg) as Foundation[];
    const f = fs.sort((a, b) => Math.abs(Math.abs(a.x - x) - Math.abs(b.x - x)))[0];
    return f;  // the nearest Foundation
  }
}

export class Factory extends ChaosBuilding {
  override bText = 'E2' as RESOURCE;
  override makeShape0(size = TP.meepleRad): Paintable {
    const bs = new FactoryShape(undefined, size)
    return bs;
  }
}

export class Barracks extends ChaosBuilding {
  override bText = 'C' as RESOURCE;
  override makeShape0(size = TP.meepleRad): Paintable {
    return new BarrackShape(undefined, size)
  }
  override addStrength = 2;
}

export class Stronghold extends ChaosBuilding {
  override bText = 'G1' as RESOURCE;
  override makeShape0(size = TP.meepleRad): Paintable {
    return new StrongholdShape(undefined, size);
  }
}

// Meeple has unMove & faceUp

// These are more Tile-like: See also: Foundation (TODO: merge)
/** each subclass has a slot on ChaosHex, but does not confer faction 'presence' */
class ChaosToken extends Tile {

}

// Player moves only during initial game startup;
// Auto moves during Relics phase
export class Relic extends ChaosToken {

}

// Has a slot on ChaosHex
// Auto-drop mostly; player selects Strength or Fame when there is a choice.
export class Morale extends ChaosToken {

}

// Drop Stronghold on hex/foundation and game can move the Trap.
// resetTile() during Income phase
export class AI_Trap extends ChaosToken {

}

// -------- not on a usual hex ---------

// Drop the Rhy-zu leader on a Base and game can handle the token.
// move it to JReyek player board in correct orientation.
export class RhyzuToken extends ChaosToken {

}

// Auto-move during Discovery phase (just click on track, players marker advances)
export class DiscoveryMark extends ChaosToken {

}

// Auto-move during SetPrices phase (just click on track, place token)
export class PricingToken extends ChaosToken {

}
// Also: factory, barracks, stronghold, foundation, relic, discovery-marker?, fame-marker?
// and cardboard: rhy-zu-token, morale {fame, strength}, ai-trap,
