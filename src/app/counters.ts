import { type PaintableShape, PolyShape } from "@thegraid/easeljs-lib";
import type { MouseEvent } from "@thegraid/easeljs-module";
import { NumCounterBox, rightClickable } from "@thegraid/hexlib";


/** a hexagonal shape around counter value; incValue never goes negative */
export class NumCounterHex extends NumCounterBox {
  protected override makeBox0(color: string, high: number, wide: number): PaintableShape {
    const rv = new PolyShape({ rad: Math.max(high, wide)/2, nsides: 6, fillc: color })
    rightClickable(this, (evt) => this.incValueOnClick(evt, -5, -1))
    return rv;
  }
  // Expose boxSize so we can find width (radius)
  override boxSize(text: createjs.Text = this.text): { width: number; height: number; } {
    const { width, height } = super.boxSize(text)
    return { width: height, height: 1.5 * width }
  }
  override incValue(incr: number): void {
    super.incValue(incr < 0 ? Math.max(incr, -this.value) : incr)
  }
  // shiftVal = 5
  override incValueOnClick(evt: MouseEvent, shiftVal = 5, baseVal?: number): void {
    super.incValueOnClick(evt, shiftVal, baseVal)
  }
}
