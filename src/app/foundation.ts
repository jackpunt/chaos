import { Meeple, Tile, TP, type DragContext, type Table } from "@thegraid/hexlib";
import { ChaosHex2 } from "./chaos-hex";
import { CenterText, type Paintable, RectShape, CircleShape } from "@thegraid/easeljs-lib";
import type { DisplayObject } from "@thegraid/easeljs-module";
import type { RESOURCE } from "./chaos-tile";
import type { ChaosBuilding } from "./meeples";
import type { XY } from "@thegraid/common-lib";

// the Relic Foundations & extra non-Relic Foundations
// the per-player starter Foundations,
// the per-player bonus Foundations: (player.ts: foundationIds)
// Moves during Build phase (or Discover bonus)
export class Foundation extends Tile {
  static xy = TP.hexRad;
  static color1 = 'rgb(149, 90, 159)';
  static color2 = 'rgba(188, 188, 188, 0.52)';
  // typically a building must land on a Foundation
  // one Leader allows to create a null-Foundation [it goes away if building dies]
  bldg?: ChaosBuilding;
  bonus: RESOURCE = '-'; // upgrade Foundations (none); other startup & Relic Foundations have a bonus RESOURCE
  icon!: DisplayObject;
  homeXY?: XY;

  constructor(Aname: string, bonus: RESOURCE = '-', fs = Foundation.xy/2) {
    super(Aname)
    this.bonus = bonus;
    this.icon = new CenterText(bonus, fs, 'white');
    this.addChild(this.icon);
  }
  override makeShape(size = Foundation.xy): Paintable {
    return new RectShape({ x: -size/2, y: -size/2, w: size, h: size, s: 1 }, 'tan', '');
  }
  gemlock?: DisplayObject;
  addGemLock() {
    const s = Foundation.xy * .18;
    const gem = this.gemlock = new CircleShape('red', s, '');
    // gem.x = s/2;
    // gem.y = s/2;
    this.addChild(gem)
  }
  faceup = true;
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

  override isLegalTarget(toHex: ChaosHex2, ctx: DragContext): boolean {
    if (!toHex) return false;
    const tile = toHex.ctile!;
    if (!tile) return false;
    if (tile.terrain == 'Mtn' || tile.terrain == 'Base') return false;
    if (!tile.canAddFoundation(this)) return false;  // TODO: extend number of Foundations, also: Relic
    return true;
  }

  override dropFunc(targetHex: ChaosHex2, ctx: DragContext): void {
    const tile = targetHex?.ctile;
    if (!targetHex) {
      this.faceUp(false)
      this.x = this.homeXY?.x ?? 0;
      this.y = this.homeXY?.y ?? 0;
    }
    if (tile) {
      tile.addFoundation(this)
    }
  }
}

/** background Foundation on Panel */
export class BgFound extends Foundation {
  /** not draggable */
  override makeDragable(table: Table): void {  }
}

/** for Foundation Tiles */ // see also: tactics-card.ts: CardHex
export class FHex extends ChaosHex2 {

}
