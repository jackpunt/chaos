import { type PaintableShape, PolyShape } from "@thegraid/easeljs-lib";
import type { MouseEvent } from "@thegraid/easeljs-module";
import { NumCounterBox, rightClickable } from "@thegraid/hexlib";


/** a hexagonal shape around counter value; rightClick -> decrement */
export class NumCounterHex extends NumCounterBox {
  /** a hexagonal shape around counter value */
  constructor(name: string, initValue: number | string = 0, color?: string, fontSize?: number, fontName?: string, textColors?: string[]) {
    super(name, initValue, color, fontSize, fontName, textColors)
  }

  protected override makeBox0(color: string, high: number, wide: number): PaintableShape {
    return new PolyShape({ rad: Math.max(high, wide)/2, nsides: 6, fillc: color })
  }
  // Expose boxSize so we can find width (radius)
  override boxSize(text: createjs.Text = this.text): { width: number; height: number; } {
    const { width, height } = super.boxSize(text)
    return { width: height, height: 1.5 * width }
  }
  // shiftVal = 5
  override incValueOnClick(evt: MouseEvent, shiftVal = 5, baseVal?: number): void {
    super.incValueOnClick(evt, shiftVal, baseVal)
  }
}
