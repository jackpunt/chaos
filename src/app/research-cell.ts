import { C, F, S, stime, type WH, type XYWH } from "@thegraid/common-lib";
import { CenterText, NamedContainer, RectShape, UtilButton, type DragInfo, type Paintable, type TextInRectOptions } from "@thegraid/easeljs-lib";
import type { DisplayObject } from "@thegraid/easeljs-module";
import type { HasDragger } from "@thegraid/hexlib";
import { type Faction } from "./factions";
import { CO, gemlockIcon, TP, type CB, type PricePhase } from "./table-params";


// %, Energy, Gem, Card, Build, Recruit, Leader, Harvest, Move,
// Upgrade(leader), Attribute(upgrade), Token(place), Flip(token)
// Primary:  %    B     E+H   R    M+C
// Auxilly: E:G, E:B | C, E:G, E:L, E:U,
// Immedia: E2 | G1, E3 | C, E4 | G2; F | C, T, F, G1 | C, E3, R2 | C
export type ResSpec = [ P: string, A: string, I?: string, gl?: boolean ];  // tuple; Default: ResSpecs[4].I = -G;
export type ResSpecs = ResSpec[];
export type ResGrid = Record<PricePhase, ResSpecs>;
export const ResGrid: ResGrid = {
  Discovery:   [['%', 'G2:%'], ['%', 'G2:%', 'E2 | G1' ], ['%', 'G1:%', 'E3 | C' ], ['%', 'G1:%', 'E4 | G2' ], ['% %', 'G1:C', 'C' ]],
  Build:       [['B', 'E4:B'], ['B', 'E3:B', 'F | C'], ['B B', 'E4:B'], ['B B', 'E3:B', 'F | C'], ['B B B', 'E2:C']],
  Harvest:[['E4+H1', 'E2:G1'], ['E5+H2', 'E2:G1'], ['E6+H2', 'E2:G1', 'PT'], ['E7+H3', 'E2:G1'], ['E9+H3', 'E4:G2', 'UT']],
  Recruit:     [['R2', 'E4:L'], ['R4', 'E5:L'], ['R5', 'E4:L', 'G1 | C'], ['R7', 'E4:L'], ['R9', 'E4:L', 'E3']],
  Move:        [['M2', 'E5:U'], ['M3', 'E5:U'], ['M4', 'E4:U', '', true], ['M5', 'E4:U', 'R2 | C'], ['M6', 'E4:U']],
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

  constructor(public faction: Faction, public phaseRow: ResearchCell[], public pricePhase: PricePhase, level = 0) {
    const dx = TP.hexRad * .9/5-2, dy = dx;
    super({ x: -dx/2, y: -dy/2, w: dx, h: dy });
    this.level = level;    // place in ResearchCell per level
    // TODO: just click to advance curPlayer's token to next level
    this.makeDragable(faction.player.gamePlay.table); // maybe not
    this.paint(faction.player.color);
  }

  showTokenAtLevel(faction: Faction) {
  }

  makeDragable(table: HasDragger) {
    table.dragger.makeDragable(this, this, this.dragFunc, this.dropFunc)
  }
  override_makeShape(size?: number): Paintable {
    const dx = TP.hexRad * .9/5-2, dy = dx;
    return new RectShape({ x: -dx/2, y: -dy/2, w: dx, h: dy })
  }

  dragFunc(dispObj: DisplayObject, info?: DragInfo): void {
  }
  // for manual patching
  // dispObj is 'this' ResearchLevel
  dropFunc(dispObj: DisplayObject, info?: DragInfo): void {
    if (!info) { debugger; return }
    // Assert dispObj == this (unless it is a Container(this)...)
    const parent = info.srcCont.parent; // ResLines Container of all ResearchCells
    const pt = dispObj.parent.localToLocal(dispObj.x, dispObj.y, parent); // srcCont = RCPhase_n --> ResLines
    const objs = parent.getObjectsUnderPoint(pt.x, pt.y, 1).filter(obj => obj !=dispObj);
    const rect = objs.find(obj => this.phaseRow.includes(obj.parent as ResearchCell));
    const cell = rect?.parent as ResearchCell | undefined;
    this.level = cell?.level ?? this.level;  // ResearchCell.addChild(this)
  }

}

export class ResearchCell extends NamedContainer {
  pName: PricePhase;
  level = 0;

  ps: string;      // primary
  as: string;      // auxilliary
  is?: string;     // immediate (middle row)

  fs = 10;         // fontsize
  font: string;    // fontSpec

  gemlock = false; // true if gemLock req'd to achieve
  gemlockIcon?: DisplayObject;

  pButton: UtilButton;
  iButton: UtilButton;
  aButton: UtilButton;

  constructor(pName: PricePhase, level: number, spec: ResSpec, public wh: WH = { width: TP.hexRad * .8, height: TP.hexRad*1 }) {
    super(`RC${pName}_${level}`);
    this.pName = pName;
    this.level = level;
    const [p, a, i, gl] = spec; // primary, auxiallary, immediate, gemlock
    this.ps = p;
    this.as = a;
    this.is = i;

    const fs = this.fs = Math.round(this.wh.height*.2);  // fontSize
    this.font = F.fontSpec(fs); // TODO: font family & weight

    const w = this.wh.width, h = this.wh.height;
    const box = new RectShape({ x: -w/2, y: -w/2, w, h }, CO.dmauve); // dark...
    this.addChild(box);
    this.fillBox();
    if (gl) {
      this.gemlock = true;
      const gl = this.gemlockIcon = gemlockIcon(-.55 * wh.width, .15 * wh.height);
      this.addChild(gl)
    }
    const opts: TextInRectOptions = {}
    this.pButton = this.makeButton({ x: -fs*.4, w: w * .6, h: fs*.7, y: + fs * .3 - h * .5 });
    this.iButton = this.makeButton({ x: -fs*.4, w: w * .6, h: fs*.7, y: + fs * .3 + h * .0 });
    this.aButton = this.makeButton({ x: -fs*.4, w: w * .6, h: fs*.5, y: - fs * 1. + h * .5 });
    this.addChild(this.pButton, this.iButton, this.aButton);
  }

  // Faction needs to do this, consulting faction.researchLevelOfPhase
  // pa (row-phase), a (row-phase)
  // first light them both; pay priceToken; (a-> are you sure?)
  // then light only aux (); pay to bank;
  activateForAction(faction: Faction, pon?: CB, aon?: CB) {
    const panel = faction.player.gamePlay.table.neutralPanel; // faction.player.panel;
    if (pon) {
      this.pButton.on(S.click, () => {
        this.pButton.activate(false);
        pon();
      }, this, true)
      this.pButton.activate(true);
    } else {
      this.pButton.activate(false);
    }
    if (aon) {
      this.aButton.on(S.click, () => {
        if (this.pButton.isActive) {
          panel.areYouSure(`Skip primary action?`, () => {
            this.pButton.activate(false);
            aon();
          }, () => {
            this.activateForAction(faction);             // disable both
            this.activateForAction(faction, pon, aon);   // reenable both
          });
        } else {
          aon();
        }
      }, this, true);
      this.aButton.activate(true);
    } else {
      this.aButton.activate(false);
    }
  }

  // i (%-action, disc-phase); Advance a Token, gemLock, iBonus
  /** enable iButton; click -> set faction to selected level */
  activateForDiscovery(faction: Faction, activate = true, cb: () => void) {
    if (activate) {
      // TODO: stash state of pButton & aButton while selecting iButton;
      // cb should restore or recompute aButton
      this.iButton.on(S.click, () => this.immediate(faction, cb), this, true); // once!
    }
    this.iButton.activate(activate);
  }

  /** enable doing primary action for this phase at this level; pay Bank/Pricer */
  primary(faction: Faction, cb: CB = () => {}) {
    this.pButton.activate(false); // redundant? see above: activateForAction
    // parse ps; do it;
    // use gameState.pricePhase & this.level
    if (this.ps == '%') {
      faction.offerDiscoveryAction(true, cb); // --> forEachPhase: activateForDiscovery()
    } else if (this.ps == 'B') {
      // count build points from this.ps
      // enable D&D on Buildings & Foundations
    }
  }
  /** advance ResearchLevel, apply Bonus */
  immediate(faction: Faction, cb: CB = () => {}) {
    faction.researchLevelOfPhase[this.pName].level = this.level;  // RL is moved!
    this.iButton.activate(false);
    // check for immediate bonus:
    if (this.is) {
      this.doImmediateBonus(this.is);
    }
    cb();   // outer caller can clean up.
    this.stage.update();
  }
  doImmediateBonus(bs: string) {
    if (bs == 'PT') {
      // TODO: select and Place a ProdToken.
    }
  }
  /** enable doing aux action; pay Bank */
  auxillary(faction: Faction, cb: () => void = () => {}) {
    this.aButton.activate(false);
    // parse as; do it;
    if (this.as == "G2:%") {
      if (faction.player.gems >= 2) {
        faction.player.gems -= 2;
        faction.offerDiscoveryAction(true, cb);
      } else {
        cb();
      }
    }
  }

  makeButton(xywh: XYWH) {
    // use UtilButton, but tweak the borders to get the desired size. (see also LeaderIcon: TextInBox)
    const { x, y, w, h } = xywh;
    const bgColor = 'rgba(255, 255, 255, 0.3)';
    const button = new class extends UtilButton {
      override activate(active?: boolean, vis?: boolean, update?: boolean): this {
        super.activate(active, vis, update);
        if (!active) this.removeAllEventListeners(S.click);
        return this;
      }
    } ('', { bgColor, fontSize: 1, border: [w/2, w/2, h/2, h/2] })
    button.x = x; button.y = y;
    return button;
  }
  addText(str: string, dy = 0) {
    const txt = new CenterText(str, this.font, C.white);
    txt.y = dy;
    this.addChild(txt);
    return txt;
  }
  fillBox() {
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

