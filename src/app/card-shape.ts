import { C } from "@thegraid/common-lib";
import { RectShape } from "@thegraid/easeljs-lib";
import { H, TP } from "@thegraid/hexlib";


export class CardShape extends RectShape {
  /** recompute if TP.hexRad has been changed */
  static get onScreenRadius() { return TP.hexRad * H.sqrt3 };

  /**
   * Modified RectShape: place border stroke inside the WH perimeter.
   * @param fillc base color of card
   * @param strokec [C.grey64] supply '' for no stroke
   * @param rad [CardShape.onScreenRadius] size of shorter side [longer is (rad * 1.4)]
   * @param portrait [false] height is shorter; true -> width is shorter
   * @param ss [rad * .04] StrokeSize for outer border.
   * @param rr [max(w,h) * .05] rounded corner radius
   */
  constructor(fillc = 'lavender', strokec = C.grey64, rad = CardShape.onScreenRadius, portrait = false, ss?: number, rr?: number) {
    if (rad <= 1) rad = rad * CardShape.onScreenRadius;
    const s = ss ?? rad * .04;
    const a = 3.5 / 2.5; // aspect: length of long side relative to short side = 1.4
    const w = (portrait ? rad : rad * a) - 2 * s, h = (portrait ? rad * a : rad) - 2 * s;
    const r = rr ?? Math.max(h, w) * .05;
    super({ x: -w / 2, y: -h / 2, w, h, r, s }, fillc, strokec);
  }

  /** modify _cgf to produce 2 vertical rectangles */
  dualCgf(strokec: string, ...colors: string[]) {
    const [c1, c2] = colors;
    // h0 = rad - 2 * (.04 * rad) = .92 * rad
    const { w: w0, h: h0 } = this._rect, rad = h0 / .92;
    const s = rad * .04;
    const w = w0 + s, h = h0 + s;
    const w2 = w / 2, rr = Math.max(w0, h0) * .05;
    this._cgf = (colorn: string, g = this.g0) => {
      g.s(strokec).ss(s);
      g.f(c1).rc(-w2, -h / 2, w2, h, rr, 0, 0, rr);
      g.f(c2).rc(0  , -h / 2, w2, h, 0, rr, rr, 0);
      return g
    }
  }
}
