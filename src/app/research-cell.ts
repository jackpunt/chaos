import { C, F, type WH } from "@thegraid/common-lib";
import { CenterText, EllipseShape, NamedContainer, RectShape } from "@thegraid/easeljs-lib";
import type { DisplayObject } from "@thegraid/easeljs-module";
import { bonusIcon, type HARVEST } from "./chaos-tile";
import type { PricePhase } from "./game-state";
import { TP } from "./table-params";


/** colors for ChaosOrder */
export namespace CO {
  export const mauve = 'rgb(166, 78, 129)';   // bold mauve
  export const dmauve = 'rgb(138, 105, 138)'; // dark mauve
  export const orange = 'rgb(255, 140, 0)';   // color for phase Icons
}

export function gemlockIcon() {
  const rad = TP.hexRad * .1;
  const bi = bonusIcon('.' as HARVEST, rad, 'red')!;
  const gem = new EllipseShape('red', rad * .5, rad * .7, '');
  gem.x += rad * .45;
  gem.y += rad * .25;
  bi.addChild(gem)
  return bi
}

// %, Energy, Gem, Card, Build, Recruit, Leader, Harvest, Move,
// Upgrade(leader), Attribute(upgrade), Token(place), Flip(token)
// Primary:  %    B     E+H   R    M+C
// Auxilly: E:G, E:B | C, E:G, E:L, E:U,
// Immedia: E2 | G1, E3 | C, E4 | G2; F | C, T, F, G1 | C, E3, R2 | C
export type ResSpec = [ P: string, A: string, I?: string, gl?: boolean ];  // tuple; Default: ResSpecs[4].I = -G;
export type ResSpecs = ResSpec[];
export type ResGrid = Record<PricePhase, ResSpecs>;
export const ResGrid: ResGrid = {
  Discovery: [['%', 'E2:G1'], ['%', 'G2:%', 'E2 | G1' ], ['%', 'G2:%', 'E3 | C' ], ['%', 'G1:%', 'E4 | G2' ], ['% %', 'G1:C', 'C' ]],
  Build: [['B', 'E4:B'], ['B', 'E3:B', 'F | C'], ['B B', 'E4:B'], ['B B', 'E3:B', 'F | C'], ['B B B', 'E2:C']],
  Harvest: [['E4+H1', 'E2:G1'], ['E5+H2', 'E2:G1'], ['E6+H2', 'E2:G1', 'PT'], ['E7+H3', 'E2:G1'], ['E9+H3', 'E4:G2', 'UT']],
  Recruit: [['R2', 'E4:L'], ['R4', 'E5:L'], ['R5', 'E4:L', 'G1 | C'], ['R7', 'E4:L'], ['R9', 'E4:L', 'E3']],
  Move: [['M2', 'E5:U'], ['M3', 'E5:U'], ['M4', 'E4:U', '', true], ['M5', 'E4:U', 'R2 | C'], ['M6', 'E4:U']],
}

export class ResearchCell extends NamedContainer {

  ps: string;
  as: string;
  is?: string;

  fs = 10;
  font: string;

  gemlock = false;
  gemlockIcon?: DisplayObject;

  constructor(Aname: string, spec: ResSpec, public wh: WH = { width: TP.hexRad * .8, height: TP.hexRad*1 }) {
    super(Aname);
    const [p, a, i, gl] = spec;
    this.ps = p;
    this.as = a;
    this.is = i;

    const fs = this.fs = Math.round(this.wh.height/5);
    this.font = F.fontSpec(fs); // TODO: font family & weight

    const w = this.wh.width, h = this.wh.height;
    const box = new RectShape({ x: -w/2, y: -w/2, w, h }, CO.dmauve); // dark...
    this.addChild(box);
    this.fill();
    if (gl) {
      this.gemlock = true;
      const gl = this.gemlockIcon = gemlockIcon();
      gl.x = -wh.width * .55; // addResearchLines.dx / 2
      this.addChild(gl)
    }
  }
  addText(str: string, dy = 0) {
    const txt = new CenterText(str, this.font, C.white);
    txt.y = dy;
    this.addChild(txt);
    return txt;
  }
  fill() {
    const mdy = -.33 * this.wh.height;
    const pdy = +.4 * this.wh.height;
    const l0 = this.addText(this.ps, mdy)
    const l3 = this.addText(this.as, pdy)
    if (this.is) {
      const mlh = l3.getMeasuredLineHeight();
      this.addText(this.is, pdy - mlh * 1.2)
    }
  }

  arrive() {
    // detect and do from this.is
  }

  prime() {
    // detect and do from this.ps
  }

  aux() {
    // detect and do from this.as
  }
}

