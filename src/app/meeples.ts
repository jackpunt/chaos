import type { XY } from "@thegraid/common-lib";
import { PathShape, type Paintable } from "@thegraid/easeljs-lib";
import type { Graphics } from "@thegraid/easeljs-module";
import { Meeple, MeepleShape, Tile, TP, type DragContext } from "@thegraid/hexlib";
import type { ChaosHex2 } from "./chaos-hex";
import type { RESOURCE } from "./chaos-tile";
import type { Player } from "./player";


type XYp = [x: number, y: number];

const chaosUnitType = ['Fighter', 'Leader'] as const;
export type ChaosUnitType = typeof chaosUnitType[number];

const chaosBuildingType = ['Factory', 'Barracks', 'Stronghold'] as const;
export type ChaosBuildingType = typeof chaosBuildingType[number];

/** constructor sets this.pColor, this.radius.
 *
 * subclass can override static pointAry, static get points, or mscgf(...)
 */
class PathShapeMeeple extends MeepleShape {
  /** points returned by static get points() */
  static pointAry: XYp[] = [[-1,0], [1,0], [1,1], [-1,1]];

  /** return this.pointAry [static] */
  static get points(): XYp[] { return  this.pointAry};

  /** subclass override mscgf(...) for non-PathShape */
  override mscgf(color = this.pColor, ss?: number, rs?: number): Graphics {
    return new PathShape({ points: (this.constructor as typeof PathShapeMeeple).points}, this.graphics).graphics;
  }
  // TODO: makeOverlay for backside Shape
}
class FactoryShape extends PathShapeMeeple {
  /** flatish pentagon */
  static override pointAry = [[-1,0], [-1, -1], [0, -1.25], [1,-1], [1, 0]] as XYp[];
}
class BarrackShape extends PathShapeMeeple {
  static makePointAry() {
    // enforce symmetry:
    const leftPts = [[-1, 0], [-1, -1.5], [-.9, -1.5], [-.9, -1], [0, -1.5]] as XYp[];
    const rightPts = leftPts.map(([x, y]) => [-x, y]).slice(0, -1).reverse() as XYp[];
    return leftPts.concat(...rightPts);
  }
  /** larger, w/walls */
  static override pointAry = BarrackShape.makePointAry();
}
class StrongholdShape extends PathShapeMeeple {
  /** larget, w/tower */
  static override pointAry = [[-1, 0], [-1, -2], [-.9, -2], [-.9, -1.5], [0, -2], [1, -1.5], [1, 0]] as XYp[];
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
  readonly bText!: RESOURCE;           // 'E2' 'C' 'G1'
  homeAry!: ChaosBuilding[];  // buildings in residence (take/put from left)
  homeXY!: XY;                // loc of leftmost slot
  addStrength = 0;
  constructor(Aname: string, player: Player, homeAry: ChaosBuilding[]) {
    super(Aname, player);
    this.homeAry = homeAry;
  }

  override isLegalTarget(toHex: ChaosHex2, ctx?: DragContext): boolean {
    const tile = toHex.ctile;
    return !!tile?.foundations.find(f => f && !f.bldg)
  }

  override sendHome(): void {
    super.sendHome
    // ASSERT there is always an open slot
    const lim = this.homeAry.length - 1;
    const fndx = (this.homeAry.findIndex(bldg => bldg == undefined));
    const wh = this.player!.panel.wh;
    const ndx = (fndx < 0) ? 0 : fndx;
    this.homeAry[ndx] = this;
    this.x = this.homeXY.x + (lim - ndx) * wh
    this.y = this.homeXY.y;
    this.player.panel.addChild(this); // set parent and raise to top of display list
  }

  override dragStart(ctx: DragContext): void {
    const ndx = this.homeAry.indexOf(this) ;
    delete this.homeAry[ndx];
  }
}

export class Factory extends ChaosBuilding {
  override bText = 'E2' as RESOURCE;
  override makeShape(size = TP.meepleRad/2): Paintable {
    const bs = new FactoryShape(undefined, size)
    return bs;
  }
}

export class Barracks extends ChaosBuilding {
  override bText = 'C' as RESOURCE;
  override makeShape(size = TP.meepleRad/2): Paintable {
    return new BarrackShape(undefined, size)
  }
  override addStrength = 2;
}

export class Stronghold extends ChaosBuilding {
  override bText = 'G1' as RESOURCE;
  override makeShape(size = TP.meepleRad/2): Paintable {
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
