import { C, type XY } from "@thegraid/common-lib";
import { CenterText, RectShape, type Paintable } from "@thegraid/easeljs-lib";
import type { DisplayObject } from "@thegraid/easeljs-module";
import { Tile, type DragContext, type HasDragger } from "@thegraid/hexlib";
import { ChaosHex2 as Hex2 } from "./chaos-hex";
import { type BONUS, type ChaosTile } from "./chaos-tile";
import { bonusIcon, gemlockIcon } from "./functions";
import type { ChaosBuilding } from "./meeples";
import type { Player } from "./player";
import { TP } from "./table-params";


// the Relic Foundations & extra non-Relic Foundations
// the per-player starter Foundations,
// the per-player bonus Foundations: (player.ts: foundationIds)
// Moves during Build phase (or Discover bonus)
export class Foundation extends Tile {
  static upColor = 'rgb(160, 102, 171)';
  static dnColor = 'rgba(188, 188, 188, 0.52)';
  static mapScale = .3;  // scale when on main map

  declare player: Player;

  /** cTile this Foundation has been placed upon; in tile.foundations[] */
  onTile?: ChaosTile;

  // typically a building must land on a Foundation
  // one Leader allows to create a null-Foundation [it goes away if building dies]
  _bldg?: ChaosBuilding;
  get bldg() { return this._bldg; }
  set bldg(b: ChaosBuilding | undefined) {
    if (b == this._bldg) return;  // nothing to change
    if (b && this._bldg) debugger;     // collision!
    this._bldg = b;
    if (b) {
      b.x = this.x; b.y = this.y;
      b.found = this;
      b.scaleX = b.scaleY = this.scaleX;
      this.parent?.addChild(b);
    }
  }
  // panel Foundations ('-'); other startup & Relic Foundations have a BONUS with icon
  bonus: BONUS;
  // Panel slots for Buildings have an income bonus Icon (Ex, C, G1/%)
  icon!: DisplayObject;
  gemlock?: DisplayObject;
  homeXY?: XY;    // set by ChaosTile.addFoundation to account for ndxForFoundation()

  override get radius() { return TP.meepleRad; }

  /**
   * Foundation with maybe a BONUS.
   * @param Aname container identification
   * @param bonus underlying bonus text (S2, H, [Region, Trap, S1, Morale, D2+S, Recruit])
   * @param fs fontSize of icon text
   */
  constructor(Aname: string, bonus: BONUS = '-', fs?: number) {
    super(Aname)
    this.bonus = bonus;
    this.icon = bonus.includes('\n') ? this.textBonus(bonus, fs) : bonusIcon(bonus, TP.hexRad * .3);
    this.addChild(this.icon);
    this.nameText.y -= 6
  }

  /** for the bonus Foundations: */
  textBonus(bonus: BONUS, fs = this.radius * .5) {
    const ctext = new CenterText(bonus, fs, C.WHITE);
    ctext.y = (ctext.getMeasuredLineHeight() -ctext.getMeasuredHeight())/2; // raise to center: TODO count the newlines...
    return ctext;
  }

  // repaint to suit: this.baseShape.paint(...)
  override makeShape(size = this.radius): Paintable {
    return new RectShape({ x: -size/2, y: -size/2, w: size, h: size, s: 1 }, 'tan', '');
  }

  addGemLock(dx = .35, dy = 0) {
    const gl = gemlockIcon(dx * this.radius, dy * this.radius);
    this.addChild(this.gemlock = gl)
    this.reCache(0);
  }

  faceup = true; // Used for Player Bonus Foundations
  /** toggle this.faceup */
  faceUp(up = !this.faceup) {
    this.faceup = up;       // onTile(up) shows mauve or Icon; on Panel(!up) show transparent to see bgFound
    this.icon.visible = up;
    this.gemlock && (this.gemlock.visible = !up);
    this.paint(up ? Foundation.upColor : Foundation.dnColor); // light-mauve : grey@.5
  }

  override isDragable(ctx?: DragContext): boolean {
    return !this.onTile;
  }

  /** set to true if resetMove moves Foundation from onTile to Panel */
  fromMap = false;
  override dragStart(ctx: DragContext): void {
    this.fromMap = !!this.onTile;   // expect 'false'
    this.faceUp(true);
    super.dragStart(ctx);
  }

  override isLegalTarget(toHex: Hex2, ctx: DragContext): boolean {
    if (!toHex) return false;
    const tile = toHex.ctile!;
    if (!tile) return false;
    if (tile.isLdr || tile.isBase) return false;
    // the only draggable Foundation is from player.Panel:
    if (!this.player.isOnHex(toHex)) return false; // player.baseTile already excluded
    return (tile.canAddFoundation());
  }


  override dropFunc(targetHex: Hex2, ctx: DragContext): void {
    if (!targetHex) {
      this.sendHome(); // Note: once placed on map, home is on HexMap, not Panel
      return;
    }
    this.placeFoundation(targetHex);
  }

  placeFoundation(targetHex: Hex2) {
    targetHex.ctile?.addFoundation(this); // may set scaleX, scaleY
    TP.whenBuildingPlaced(this, targetHex); // place or remove foundation
  }

  override sendHome(): void {
    this.x = this.homeXY?.x ?? 0;
    this.y = this.homeXY?.y ?? 0;
    const onTile = !!this.onTile;
    this.scaleX = this.scaleY = onTile ? Foundation.mapScale : 1;
    this.faceUp(onTile);
  }
}

/** background Foundation on Panel; marking homeXY position. [not Dragable] */
export class BgFound extends Foundation {
  /** not draggable */
  override makeDragable(table: HasDragger): void {  }
  // alteratively, this is checked by table.dragFunc0()
  override isDragable(ctx?: DragContext): boolean { return false; }
}

/** for Foundation Tiles */ // see also: tactics-card.ts: CardHex
export class FHex extends Hex2 {

}
