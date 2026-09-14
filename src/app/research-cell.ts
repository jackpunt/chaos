import { C, F, type WH } from "@thegraid/common-lib";
import { CenterText, NamedContainer, RectShape, type DragInfo, type Paintable } from "@thegraid/easeljs-lib";
import type { Container, DisplayObject } from "@thegraid/easeljs-module";
import type { ChaosTable } from "./chaos-table";
import { type Faction } from "./factions";
import { CO, gemlockIcon, TP, type PricePhase } from "./table-params";


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

/** RectShape that appears on ResearchCell to indicate its level in the given phaseRow */
export class ResearchLevel extends RectShape {
  _level = 0;
  get level() { return this._level }
  set level(level: number) {
    this._level = level;
    // set location within ResearchCell:
    const { width, height } = this.getBounds()
    this.x = (this.faction.player.index - (TP.numPlayers-1)/2) * width;
    this.y = - height * .5;
    this.phaseRow[level].addChild(this); // phaseRow contains ResearchCell
  }
  /** parent container holding the ResearchCells. (coordinate base) */
  refCont!: Container;

  constructor(public faction: Faction, public phaseRow: ResearchCell[], level = 0) {
    const dx = TP.hexRad * .9/5-2, dy = dx;
    super({ x: -dx/2, y: -dy/2, w: dx, h: dy });
    this.level = level;    // place in ResearchCell per level
    // TODO: just click to advance curPlayer's token to next level
    this.makeDragable(faction.player.gamePlay.table); // maybe not
    this.paint(faction.player.color);
  }

  showTokenAtLevel(faction: Faction) {
  }

  makeDragable(table: ChaosTable) {
    this.refCont = table.neutralPanel.researchLines;
    table.dragger.makeDragable(this, this, this.dragFunc, this.dropFunc)
  }
  override_makeShape(size?: number): Paintable {
    const dx = TP.hexRad * .9/5-2, dy = dx;
    return new RectShape({ x: -dx/2, y: -dy/2, w: dx, h: dy })
  }

  dragFunc(dispObj: DisplayObject, info?: DragInfo): void {
  }
  dropFunc(dispObj: DisplayObject, info?: DragInfo): void {
    if (!info) { debugger; return }
    // Assert dispObj == this (unless it is a Container(this)...)
    const parent = info.srcCont.parent; // ResearchCell holding the RectShape
    const pt = dispObj.parent.localToLocal(dispObj.x, dispObj.y, parent); // dragCont --> parent
    const objs = parent.getObjectsUnderPoint(pt.x, pt.y, 1).filter(obj => obj !=dispObj);
    const rect = objs.find(obj => this.phaseRow.includes(obj.parent as ResearchCell));
    const cell = rect?.parent as ResearchCell | undefined;
    this.level = cell?.level ?? this.level;  // ResearchCell.addChild(this)
  }

}

export class ResearchCell extends NamedContainer {
  level = 0;

  ps: string;      // primary
  as: string;      // auxilliary
  is?: string;     // immediate (middle row)

  fs = 10;         // fontsize
  font: string;    // fontSpec

  gemlock = false; // true if gemLock req'd to achieve
  gemlockIcon?: DisplayObject;

  constructor(Aname: string, level: number, spec: ResSpec, public wh: WH = { width: TP.hexRad * .8, height: TP.hexRad*1 }) {
    super(Aname);
    this.level = level;
    const [p, a, i, gl] = spec;
    this.ps = p;
    this.as = a;
    this.is = i;

    const fs = this.fs = Math.round(this.wh.height*.2);
    this.font = F.fontSpec(fs); // TODO: font family & weight

    const w = this.wh.width, h = this.wh.height;
    const box = new RectShape({ x: -w/2, y: -w/2, w, h }, CO.dmauve); // dark...
    this.addChild(box);
    this.fill();
    if (gl) {
      this.gemlock = true;
      const gl = this.gemlockIcon = gemlockIcon(-.55 * wh.width, .15 * wh.height);
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

