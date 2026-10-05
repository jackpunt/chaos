import { C, F, S, stime, type WH, type XYWH } from "@thegraid/common-lib";
import { CenterText, NamedContainer, RectShape, UtilButton, type DragInfo, type Paintable, type TextInRectOptions } from "@thegraid/easeljs-lib";
import type { DisplayObject } from "@thegraid/easeljs-module";
import type { HasDragger } from "@thegraid/hexlib";
import { type Faction } from "./factions";
import { type PriceToken } from "./meeples";
import type { Player } from "./player";
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
  Harvest:[['E4_H1', 'E2:G1'], ['E5_H2', 'E2:G1'], ['E6_H2', 'E2:G1', 'PT'], ['E7_H3', 'E2:G1'], ['E9_H3', 'E4:G2', 'UT']],
  Recruit:     [['R2', 'E4:L'], ['R4', 'E5:L'], ['R5', 'E4:L', 'G1 | C'], ['R7', 'E4:L'], ['R9', 'E3:L', 'E3']],
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
  // pon: after_primary; aon=after_aux
  // TODO: confirm ability to pay before activating?
  activateForAction(faction: Faction, pcb?: CB, acb?: CB) {
    const panel = faction.player.gamePlay.table.neutralPanel; // faction.player.panel;
    console.log(stime(this, `.activateForAction(${this.pName}):`), !!pcb, !!acb, faction.name);
    if (pcb) {
      this.pButton.on(S.click, () => {
        this.pButton.activate(false);
        this.primary(faction, pcb);
      }, this, true)
      this.pButton.activate(true);
    } else {
      this.pButton.activate(false);
    }
    if (acb) {
      this.aButton.on(S.click, (evt) => {
        TP.aButtonEvent = evt;
        if (this.pButton.isActive) {
          panel.areYouSure(`Skip primary action?`, () => {
            this.pButton.activate(false);
            this.auxillary(faction, acb);
          }, () => {
            this.activateForAction(faction);             // disable both
            this.activateForAction(faction, pcb, acb);   // reenable both
          });
        } else {
          this.auxillary(faction, acb);
        }
      }, this, true);
      this.aButton.activate(true);
    } else {
      this.aButton.activate(false);
    }
  }

  // i (%-action, disc-phase); Advance a Token, gemLock, iBonus
  /** enable iButton; click -> set faction to selected level
   * @param activate [true] to enable iButton -> immediate() -> cb(); false to deactivate iButton.
   */
  activateForDiscovery(faction: Faction, activate = true, cb: () => void) {
    if (activate) {
      // TODO: stash state of pButton & aButton while selecting iButton;
      // cb should restore or recompute aButton
      this.iButton.on(S.click, () => this.immediate(faction, cb), this, true); // once!
    }
    this.iButton.activate(activate);
  }

  payAction(pt: PriceToken, player: Player) {
    const gamePlay = pt.gamePlay;
    // pay for action
    const [toFac, toBank, toLeft, toRight] = pt.vdist;
    if (toLeft !== undefined || toRight !== undefined) {
      const lNdx = gamePlay.gameState.nextNdx(+1), lplyr = gamePlay.allPlayers[lNdx];
      const rNdx = gamePlay.gameState.nextNdx(-1), rplyr = gamePlay.allPlayers[rNdx];
      player.payEnergy(toLeft, lplyr);
      player.payEnergy(toRight, rplyr);
    }
    player.payEnergy(toFac, gamePlay.playerByFacId(pt.facId));
    player.payEnergy(toBank);
  }
  /** @return tokenOnPhase[pName] */
  getPriceToken(faction: Faction) {
    return faction.player.gamePlay.gameState.priceToken(this.pName)!;
  }

  /** enable doing primary action for this phase at this level; pay Bank/Pricer */
  primary(faction: Faction, cb: CB = () => {}) {
    this.pButton.activate(false); // redundant? see above: activateForAction
    const player = faction.player;
    const gamePlay = player.gamePlay;
    const pt = this.getPriceToken(faction);
    console.log(stime(this, `.primary(${faction.name}) ${this.pName}: ${this.ps}`));
    // pt.facId gets the primary action for free:
    if (pt.facId !== faction.facId) {
      if (pt.vid > player.coins) {
        console.log(stime(this, `.primary: (${pt.vid} > ${player.coins})`))
        return; // unable to pay
      }
      this.payAction(pt, player)
    }
    // % B E H R M
    let match: RegExpMatchArray | null, pv0 = 0, pv = 0, hv = 0;
    const matchv = (p: '%'|'B'|'E'|'R'|'M', ps = this.ps) => {
      match = ps.match(`${p}(\\d)?(_H(\\d))?`); // (p)_H(hv)
      if (!match) return;
      const np = ps.split(' ').length;
      pv = pv0 = Number.parseInt(match[1] ?? `${np}`); // repetions of p: 'M3' or 'B B B'
      if (Number.isNaN(pv)) debugger;
      hv = (match[3] !== undefined) ? Number.parseInt(match[3]) : 1; // assert: (bv > 1) only if (b == 'G')
      if (Number.isNaN(hv)) debugger;
      return pv;
    }
    // parse ps; do it;
    if (matchv('%')) {         // Discovery
      const pvcb = () => {
        if (pv-- > 0) {
          faction.offerDiscoveryAction(1, pvcb); // TODO: set Panel Buttons (ex: use only 1 of 2 Discovery)
        } else {
          cb();
        }
      }
      pvcb();
    } else if (matchv('B')) {
      faction.offerBuildAction(pv, cb); // Build: pv actions; TODO; check Foundation placement
    } else if (matchv('E')) {
      player.coins += pv;               // Harvest: pv Energy & hv actions
      faction.offerHarvestActions(hv, cb);
    } else if (matchv('R')) {
      faction.offerRecruit(pv, cb);     // Recruit: pv Recruits
    } else {

    }
  }

  /** advance ResearchLevel, apply Bonus; pay gemLock */
  immediate(faction: Faction, cb: CB = () => {}) {
    const player = faction.player;
    if (this.gemlock) {
      const unlock = !!player.panel.foundations['unlock']!.hex?.isOnMap && (player.coins >= 2);
      const agem = (player.gems >= 1)
      if (!(agem || unlock)) return;
      const gf = () => player.payGems(1), ef = () => player.payEnergy(2);
      if (agem && unlock) {
        player.gamePlay.neutralPlayer.panel.popupChoice('gem', 'E2', gf, ef);
      } else if (agem) { gf() } else { ef() }
    }
    faction.researchLevelOfPhase[this.pName].level = this.level;  // RL is moved!
    this.iButton.activate(false);
    // check for immediate bonus:
    if (this.is) {
      const bs = this.is;
      if (bs.includes(' | ')) {
        const [lb, rb] = bs.split(' | ');
        const lf = () => faction.doImmediateBonus(lb, cb)
        const rf = () => faction.doImmediateBonus(rb, cb)
        faction.player.gamePlay.neutralPlayer.panel.popupChoice(lb, rb, lf, rf)
      } else {
        faction.doImmediateBonus(this.is, cb);
      }
    } else {
      cb();   // outer caller can clean up.
    }
    this.stage.update();
  }

  // TODO: exception for Oxataya (TODO: only once when 2-player)
  /** enable doing aux action; pay Bank */
  auxillary(faction: Faction, cb: () => void = () => {}) {
    const player = faction.player;
    const pt = this.getPriceToken(faction);
    const fao = TP.freeAuxForOxataya && (faction.facId == 5) && (pt.facId == 5);

    // use match to determine cost(c) and benefit(b)
    let match: RegExpMatchArray | null, cv!: number, bv!: number;
    const matchv = (c: 'E'|'G'|'R', b: '%'|'G'|'C'|'B'|'L'|'U') => {
      match = this.as.match(`${c}(\\d):${b}(\\d)?`); // cost : benefit
      if (!match) return;
      cv = Number.parseInt(match[1])
      if (Number.isNaN(cv)) debugger;
      bv = (match[2] !== undefined) ? Number.parseInt(match[2]) : 1; // assert: (bv > 1) only if (b == 'G')
      if (Number.isNaN(bv)) debugger;
      return cv;
    }
    const npcb = (v?: any) => {
      console.log(stime(this, `.aux: ${this.as} no pay! ${v}`), faction.name);
      cb();
    }
    this.aButton.activate(false);
    // parse as; do it;
    console.log(stime(this, `.auxillary: as=${this.as}`));
    if (matchv('G', '%')) {
      if (fao || faction.player.payGems(cv)) {
        setTimeout(() => faction.offerDiscoveryAction(1, cb), 10); // QQQ: do we *need* setTimeout?
      } else {
        npcb(cv);
      }
    } else if (matchv('G','C')) {
      if (fao || player.payGems(cv)) {
        player.gainCard();
        cb();
      } else {
        npcb(cv);
      }
      // Aux Build
    } else if (matchv('E', 'B')) {
      if (fao || player.payEnergy(cv)) {
        console.log(stime(this, `.auxillary: faction.offerBuildAction(1, cb)`));
        faction.offerBuildAction(1, cb);
      } else {
        npcb(cv);
      }
    } else if (matchv('E', 'C')) {
      if (fao || player.payEnergy(cv)) {
        player.gainCard();
        cb();
      } else {
        npcb(cv);
      }
      // Aux Harvest
    } else if (matchv('E', 'G')) {  // En:Gm
      if (fao || player.payEnergy(cv)) {
        player.gems += bv;
        cb();
      } else {
        npcb(cv);
      }
      // Aux Recruit
    } else if (matchv('E', 'L')) {
      if (fao || player.payEnergy(cv)) {
        console.log(stime(this, `.auxillary: faction.offerRecruitLeader(1, cb)`));
        cb();
      } else {
        npcb(cv);
      }
      // Aux Move
    } else if (matchv ('E', 'U')) {
      if (fao || player.payEnergy(cv)) {
        // faction.offerUpgradLeader(cb);
        cb();
      } else {
        npcb(cv);
      }
    }
  }

  makeButton(xywh: XYWH) {
    // use UtilButton, but tweak the borders to get the desired size. (see also LeaderIcon: TextInBox)
    const { x, y, w, h } = xywh;
    const bgColor = 'rgba(255, 255, 255, 0.3)';
    const button = new class RC_Button extends UtilButton {
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

