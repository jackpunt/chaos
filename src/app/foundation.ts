import { type XY } from "@thegraid/common-lib";
import { CenterText, CircleShape, RectShape, type Paintable } from "@thegraid/easeljs-lib";
import type { DisplayObject } from "@thegraid/easeljs-module";
import { Tile, TP, type DragContext, type Table } from "@thegraid/hexlib";
import { ChaosHex2 as Hex2 } from "./chaos-hex";
import type { RESOURCE } from "./chaos-tile";
import type { ChaosBuilding } from "./meeples";

// the Relic Foundations & extra non-Relic Foundations
// the per-player starter Foundations,
// the per-player bonus Foundations: (player.ts: foundationIds)
// Moves during Build phase (or Discover bonus)
export class Foundation extends Tile {
  static wh = TP.hexRad * .8;   // square!
  static color1 = 'rgb(149, 90, 159)';
  static color2 = 'rgba(188, 188, 188, 0.52)';
  // typically a building must land on a Foundation
  // one Leader allows to create a null-Foundation [it goes away if building dies]
  bldg?: ChaosBuilding;
  bonus: RESOURCE = '-'; // upgrade Foundations (none); other startup & Relic Foundations have a bonus RESOURCE
  // buildings have an income bonus (Ex, C, G1)
  icon!: DisplayObject;
  gemlock?: DisplayObject;
  homeXY?: XY;

  override get radius() { return TP.meepleRad; }

  /**
   *
   * @param Aname container identification
   * @param bonus underlying bonus text (S2, H, [Region, Trap, S1, Morale, D2+S, Recruit])
   * @param fs fontSize of icon text
   */
  constructor(Aname: string, bonus: RESOURCE = '-', fs?: number) {
    super(Aname)
    this.bonus = bonus;
    const ctext = new CenterText(bonus, fs ?? this.radius * .5, 'white');
    ctext.y = (ctext.getMeasuredLineHeight() -ctext.getMeasuredHeight())/2; // raise to center: TODO count the newlines...
    this.icon = ctext;
    this.addChild(this.icon);
    this.nameText.y -= 6
  }

  // repaint to suit: this.baseShape.paint(...)
  override makeShape(size = this.radius): Paintable {
    return new RectShape({ x: -size/2, y: -size/2, w: size, h: size, s: 1 }, 'tan', '');
  }

  addGemLock(dx = .35, dy = 0) {
    const rad = this.radius;
    const gl = new CircleShape('red', rad * .09, '');
    gl.x += rad * dx;
    gl.y += rad * dy;
    this.addChild(this.gemlock = gl)
    this.reCache();
  }

  faceup = true; // Used for Player Bonus Foundations
  faceUp(up = !this.faceup) {
    this.faceup = up;
    this.icon.visible = up;
    this.gemlock && (this.gemlock.visible = !up);
    this.paint(up ? Foundation.color1 : Foundation.color2)
  }

  override dragStart(ctx: DragContext): void {
    this.faceUp(true);
    super.dragStart(ctx);
  }

  override isLegalTarget(toHex: Hex2, ctx: DragContext): boolean {
    if (!toHex) return false;
    const tile = toHex.ctile!;
    if (!tile) return false;
    if (tile.terrain == 'Mtn' || tile.terrain == 'Base') return false;
    if (!tile.canAddFoundation(this)) return false;  // TODO: extend number of Foundations, also: Relic
    return true;
  }

  override dropFunc(targetHex: Hex2, ctx: DragContext): void {
    if (!targetHex) {
      this.sendHome(); // Note: once placed on map, home is on HexMap, not Panel
      return;
    }
    targetHex.ctile?.addFoundation(this); // may set scaleX, scaleY
  }

  override sendHome(): void {
    this.x = this.homeXY?.x ?? 0;
    this.y = this.homeXY?.y ?? 0;
    this.scaleX = this.scaleY = 1;
    this.faceUp(false);
  }
}

/** background Foundation on Panel; marking homeXY position. */
export class BgFound extends Foundation {
  /** not draggable */
  override makeDragable(table: Table): void {  }
}

/** for Foundation Tiles */ // see also: tactics-card.ts: CardHex
export class FHex extends Hex2 {

}
