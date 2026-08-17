import { C, F, stime, type XY, type XYWH } from "@thegraid/common-lib";
import { CenterText, NamedContainer, PathShape, RectShape, TextInRect, type Paintable } from "@thegraid/easeljs-lib";
import type { Rectangle } from "@thegraid/easeljs-module";
import { Graphics } from "@thegraid/easeljs-module";
import { Meeple, MeepleShape, Tile, TP, type DragContext, type Hex, type HexM, type IHex2 } from "@thegraid/hexlib";
import { TokenHex, type ChaosHex2 as Hex2, type HexMap2 } from "./chaos-hex";
import { type BONUS, type TERRAIN } from "./chaos-tile";
import { factionNeutral, type FactionId } from "./factions";
import { BgFound, Foundation } from "./foundation";
import type { GamePlay } from "./game-play";
import type { Player } from "./player";
import { priceNames, type PriceName } from "./table-params";


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
  declare gamePlay: GamePlay;
  declare player: Player;
  homeXY!: XY;                // sendHome location, if needed

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

/** maybe someday itemize them */
export type LeaderName = string;

type CombatStats = { str: number, atk: number, shield: number };
export interface ILeader {
  name: string;
  onBoard: boolean;     // false: not recruited/deployed
  upgraded: boolean;
  stats: CombatStats[]; // [0]: initial, [1]: upgraded
  isRhyzu: boolean;
  placeGem: number;
  upgradeGem: number;
  special: () => CombatStats; // also effects before-during-after combat, or move or recruit or ...
  // specialByPhase: Map<phase, function>
}

export class Leader extends ChaosUnit {
  static allLeadersByName = new Map<LeaderName, Leader>();
  upgraded = false;  // set true when upgraded
  onBoard = false;
  placeGem = 0;
  upgradeGem = 0;
  isRhyzu = false;

  constructor(Aname: string) {
    super(Aname); // TODO: inject Player/Faction
    Leader.allLeadersByName.set(Aname, this);
  }
}

// methods in common to Buildings
// TerraMystica-like filling of homeAry
//
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
    this.placeBuilding(targetHex);
  }

  placeBuilding(targetHex?: Hex2) {
    if (!targetHex) {
      this.sendHome();
    } else {
      // ASSERT: there is a Foundation! from isLegalTarget()
      // on targetHex (on map), place on Foundation.
      const f = this.findFoundation(targetHex)
      f.bldg = this;   // mark Foundation occupied
      this.scaleX = this.scaleY = Foundation.mapScale
      this.x = f.x; this.y = f.y;
      f.parent.addChild(this);
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

// Player moves only during initial game startup;
// Auto moves during Relics phase
export class Relic extends ChaosMeeple {
  static bonus = ['E2', 'G1', 'C', '%', '%', '-'] as BONUS[];

  static allRelics: Relic[] = [];

  bText = '%' as BONUS;   // placeholder
  override makeShape(size = TP.meepleRad): Paintable {
    return new RectShape({ x: -size/2, y: -size/2, w: size, h: size }, C.grey32);
  }
  foundation: Foundation; // placed on map hex by placeRelic(hex)

  constructor(n: number, player: Player, homeXY: XY) {
    const Aname = `Relic${n}`;
    super(Aname, player);
    this.homeXY = homeXY;
    const fs = this.baseShape.getBounds().height*.9;
    this.addChild(new CenterText(`${n}`, F.fontSpec(fs, 'Arial Rounded MT Bold'), C.WHITE));
    this.foundation = new BgFound(`RF_${n}`, Relic.bonus[n]);
    Relic.allRelics.push(this);
  }

  override sendHome(): void {
    const f = this.foundation;
    f.onTile?.removeFoundation(f);
    this.player.panel.addChild(this);
    this.scaleX = this.scaleY = 1;
    this.x = this.homeXY.x; this.y = this.homeXY.y;
    this.fromHex = undefined!;
  }

  isAdjacentCurPlayerBaseFoundations(toHex: Hex2) {
    const cpbf = this.player.gamePlay.curPlayer?.panel.baseTile.baseRegions;
    if (!cpbf) return false;
    return cpbf[0].linkHexes.includes(toHex) || cpbf[1].linkHexes.includes(toHex);
  }

  override cantBeMovedBy(player: Player, ctx: DragContext): string | boolean | undefined {
    if (ctx.lastShift) return false;
    if (this.foundation.onTile) {
      this.fromHex = this.foundation.onTile.chex; // table.stopDragging() will drop this on this.fromHex!
      return 'already in place';
    }
    if (ctx.gameState.isPhase('PlaceRelic') && ctx.gameState.curPlayer == player) return false;
    return 'only move in PlaceRelic phase';
  }

  override isLegalTarget(toHex: Hex2, ctx: DragContext): boolean {
    if (toHex == this.foundation.onTile?.chex) return true; // Relic is not 'on' a Hex or Tile; is on its Foundation.
    if ((['Base', 'Mtn', 'Lake'] as TERRAIN[]).includes(toHex.ctile?.terrain ?? 'Base')) return false;
    return !!toHex.tile && !toHex.tile.foundations[1] && !this.isAdjacentCurPlayerBaseFoundations(toHex);
  }

  override dropFunc(targetHex: Hex2, ctx: DragContext): void {
    this.placeRelic(targetHex);
    if (!targetHex) this.gamePlay.hexMap.showMark();
  }

  // on targetHex (on map), place on Foundation
  placeRelic(targetHex: Hex2)  {
    const f = this.foundation;
    if (!targetHex) {
      this.sendHome();
    } else {
      // move foundation to new mapTile:
      if (f.onTile !== targetHex.ctile) {
        f.onTile?.removeFoundation(f);
        targetHex.ctile?.addFoundation(f); // sets f.scaleX, f.scaleY
      }
      this.scaleX = this.scaleY = Foundation.mapScale;
      this.x = f.x; this.y = f.y;
      f.parent.addChild(this);
      return;
    }
  }
}

// Meeple has unMove & faceUp

// These are more Tile-like: See also: Foundation (TODO: merge)
/** each subclass has a slot on ChaosHex, but does not confer faction 'presence' */
class ChaosToken extends Tile {
  declare gamePlay: GamePlay;
  declare player: Player;
  homeXY!: XY;                // sendHome location, if needed

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
type PT_Status = 'avail' | 'inplay' | 'invault' | 'pending'; // pending-->avail at end of round (or: after SetPrices phase)
// Auto-move during SetPrices phase (just click on track, place token)

class PTMark extends RectShape {
  constructor(wh = TP.meepleRad * 1.9) {
    super({x: -wh/2, y: -wh/2, w: wh, h: wh}, 'rgba(130, 130, 130, 0.4)', '');
    this.name = 'TargetMark';
    this.visible = false;
  }

  get inUse() { return this.visible && this.parent }
}


export class PriceToken extends ChaosMeeple {
  bColor = 'rgb(150, 70, 0)';
  nColor = 'rgb(255, 140, 0)'; // neutral color

  static bonus35 = [ ['^', 'C'], ['>', '%']] as PriceBonus[][];
  static bonus_2 = [ ['^'], ['^']] as PriceBonus[][];

  // distinguish for number of players;
  // 3-5 players: 1 & 2 contribnute to player; only 1 has '^' retrieval bonus
  static dist35 = [
    // ^ C [> %]    3      4      5     [6]
    [1,0], [1,1], [1,2], [2,2], [2,3], [3,3],
  ]
  // 2 players: 1 & 2 vdist --> Bank; have '^' retreival bonus
  static dist2 = [
    // ^     [^]     3      4      5     [6]
    [0,1], [0,2], [1,2], [2,2], [2,3], [3,3],
  ]
  // elt 4 = eject: round when token is removed; coded in 'gamePlay.setPriceNeutral()'
  static neutral = [
      [], [0, 0, 1, 1, 2], [0, 3, 0, 0, 4], [0, 2, 1 ,1], [0, 5, 0, 0], [],
  ]

  declare baseShape: PTokenShape;

  facId: FactionId;    // undefined for Neutral Tokens

  /** distribution of funds */
  readonly vdist: VDIST;
  // string[] indicating each PriceBonus:
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
  onPhase?: PriceName; // subset of GameState.state.Aname

  /** some would have called it 'rad' or 'size' */
  wh: number;

  /**
   *
   * @param vid  ValueId: 1 .. 6 (or: 2, 3, 4, 5) (or: 3, 5)
   * @param xy homeXY for sendHome()
   * @param player for super; (& to get facId)
   */
  constructor(public vid: PriceId, xy: XY = { x: 0, y: 0 }, player: Player) {
    const facId = player.facId ?? -1;           // -1 was fallback for Neutral Player (vs facId = 6?)
    super(`F${facId}:PT${vid}`, player);        // construct baseShape
    this.wh = this.gamePlay.hexMap.xywh().dxdc;
    this.homeXY = xy;
    this.facId = facId;
    const np = TP.numPlayers
    if (facId <= 5) {
      this.vdist = (np == 2 ? PriceToken.dist2 : PriceToken.dist35)[vid-1] as VDIST;
    } else {
      this.vdist = (PriceToken.neutral)[vid-1] as VDIST;
    }
    this.bTexts = ((np == 2) ? PriceToken.bonus_2 : PriceToken.bonus35)[this.vid-1];
    this.fillCont(this);
    this.status = ['avail', 'invault', 'avail', 'avail', 'avail', 'invault'][vid-1] as PT_Status;
    if (facId == 5 + 1) this.status = 'avail';
    if (this.status == 'avail') { this.setAvailable() } else { this.moveToVault() }
    // TODO: implement expiration, and (%) and retrieve(^) and card(C)
    this.effect = () => {};
  }

  // add content above the PricingToken baseShape:
  fillCont(cont: NamedContainer, size = (this.baseShape).getBounds().width) {
    const bgcolor = C.nameToRgbaString(this.player!.color, .5)
    const base = this.baseShape as PTokenShape;
    const over = new RectShape(base._rect)
    over.paint(bgcolor, true);
    cont.addChild(over)

    // make TextRect for number/icon:
    const setTR = (tr: TextInRect, w = 10, x = 0, y = 0) => {
      tr.rectShape.setRectRad({ w, x: tr.rectShape.x - w/2 }) ;
      tr.x = x; tr.y = y;
      cont.addChild(tr);
      tr.paint(tr.bgColor, true)
    }
    const [ toFac, toBank, left, right, eject ] = this.vdist ?? [];
    const s = size*.92, x1 = -s/4, x2 = +s/4, y1 = +s/4, y2 = -s/4;
    const fontSize = s * .2;
    const neutral = (left !== undefined);
    if (neutral && left > 0) {
      const lt = new TextInRect(`${left}`, { bgColor: 'black', fontSize })
      setTR(lt, s*.45, x1, y2)
      const rt = new TextInRect(`${right}`, { bgColor: 'white', fontSize })
      setTR(rt, s*.45, x2, y2)
    }
    if (toFac > 0 && toBank > 0) {
      const tf = new TextInRect(`${toFac}`, { bgColor: this.pColor, fontSize })
      setTR(tf, s*.45, x1, y1);
      const tb = new TextInRect(`${toBank}`, { bgColor: PTokenShape.nColor, fontSize })
      setTR(tb, s*.45, x2, y1);
    } else if (toFac > 0) {  // single payment to Faction:
      const tf = new TextInRect(`${toFac}`, { bgColor: this.pColor, fontSize })
      setTR(tf, s*.7, 0, y1)
    } else if (toBank > 0) { // single payment to Bank
      const tb = new TextInRect(`${toBank}`, { bgColor: PTokenShape.nColor, fontSize })
      setTR(tb, s*.7, 0, y1)
    }
    if (neutral && eject !== undefined) {
      const tir = new TextInRect(`X  ${eject}`, { bgColor: C.transparent, fontSize })
      setTR(tir, s*.7, 0, toBank > 0 ? y2 : y1)
    }
    if (!neutral && this.bTexts) {
      const text = this.bTexts.join('  ')
      const tir = new TextInRect(text, { bgColor: C.rgba(this.pColor!, .6), fontSize })
      setTR(tir, s*.7, 0, y2);
    }
    // TODO: use bonusIcon(^, C, >, %)
    return cont;
  }
  override makeShape(size = TP.meepleRad * 1.0): Paintable {
    return new PTokenShape(size)
  }

  /** the TargetMark for PricingToken  */
  static mark = new PTMark();

  override showTargetMark(hex: IHex2 | undefined, ctx: DragContext): void {
    const map = (ctx.targetHex ? ctx.targetHex.map : this.gamePlay.hexMap) as HexMap2;
    map?.showMark(ctx.targetHex, PriceToken.mark);
    map?.mapCont.overCont?.addChild(PriceToken.mark); // move to overCont
  }

  override isLegalTarget(toHex: Hex2, ctx?: DragContext): boolean {
    return (toHex instanceof TokenHex);
  }

  // return token to place on panel
  override sendHome(): void {
    this.x = this.homeXY.x;
    this.y = this.homeXY.y;
    this.player!.panel.addChild(this);
  }

  override dragStart(ctx: DragContext): void {
    if (this.status !== 'avail' && !ctx.lastShift) this.gamePlay.table.dragger.stopDrag();
  }

  // For unknown reason, the PricingToken.mark interferes with normal hexUnderObj()
  // workaround: showTargetMark puts PTMark on hexMap.overCont (instead of .markCont)

  override dragFunc0(hex: IHex2 | undefined, ctx: DragContext): void {
    ctx.targetHex = hex?.isLegal ? hex : this.fromHex;
    this.showTargetMark(hex, ctx);      // move mark to target = this.fromHex
    this.dragFunc(hex, ctx);
  }

  override dropFunc(targetHex: IHex2, ctx: DragContext): void {
    if (!targetHex) {
      this.sendHome();
    } else {
      this.x = 0; this.y = 0;
      const priceIndex = this.gamePlay.table.priceHex.findIndex(ph => ph == targetHex)
      this.setTokenOnPhase(priceIndex);
      // do not advance state when Shift used by alternate player...
      if (this.player == this.gamePlay.curPlayer) {
        this.gamePlay.gameState.state.done!(this.player.index);
      }
    }
  }

  // TODO: add code for moveTokenToVault, gainTokenFromVault
  setTokenOnPhase(priceIndex: number) {
    const priceName = priceNames[priceIndex];
    this.moveTo(this.gamePlay.table.priceHex[priceIndex]);
    this.onPhase = priceName;
    this.status = 'inplay';
    this.gamePlay.gameState.phasePrices[priceName] = this;

    const facName = factionNeutral[this.facId];
    console.log(stime(this, `.setTokenOnPhase: ${facName} w/${this.Aname} ->`), priceName, this )
  }

  /** remove from pricing, place in vault */
  moveToVault() {
    this.moveTo(undefined);   // release priceHex
    this.x = this.y = 0;
    this.player.panel.vault.addChild(this);
    this.status = 'invault';
    this.visible = false;
    this.stage.update();
  }

  /** put on panel, but stats = 'pending' */
  retrieveFromVault() {
    this.sendHome();
    this.status = 'pending';  // flipped down...
    this.visible = true;      // TODO: visually dim, disable mouse
    this.faceUp(false)
  }

  /** mark token available for use */
  setAvailable() {
    this.status = 'avail';
    // TODO: full visiblitiy & mouse enable
    this.faceUp(true);
  }

  override cantBeMovedBy(player: Player, ctx: DragContext): string | boolean | undefined {
    if (this.status == 'pending') return "Not available until next round";
    if (this.status == 'invault') return "In Vault -- Not available";
    return undefined;
  }
}

export class PTokenShape extends RectShape {
  static bColor = 'rgb(150, 70, 0)';
  static nColor = 'rgb(255, 140, 0)'; // neutral color

  constructor(public size = 10, strokec = 'black', g0 = new Graphics) {
    super({ x: -size/2, y: -size/2,  w: size, h: size }, PTokenShape.bColor, strokec, g0);
  }
  override paint(colorn?: string, force?: boolean): Graphics {
    return super.paint(colorn ?? this.colorn, force)
  }
  backSide = new RectShape(this.getBounds(), 'rgba(225,255,255,.5)', 'black');
}

// Also: factory, outposts, stronghold, foundation, relic, discovery-marker?, fame-marker?
// and cardboard: rhy-zu-token, morale {fame, strength}, ai-trap,
