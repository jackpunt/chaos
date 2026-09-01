import { C } from "@thegraid/common-lib";
import { CenterText, CircleShape, EllipseShape, PaintableShape, PathShape, RectShape } from "@thegraid/easeljs-lib";
import { Container } from "@thegraid/easeljs-module";
import { TP as TPLib, } from "@thegraid/hexlib";
import type { HARVEST } from "./chaos-tile";
import type { PriceBonus } from "./meeples";

// some types & constants moved out of GameState:
export const phaseNames = ['SetPrices', 'Discovery', 'Build', 'Harvest', 'Recruit', 'Move', 'Combat', 'Income', 'Relics'] as const;
export type PhaseName = typeof phaseNames[number];
export const priceNames = ['Discovery', 'Build', 'Harvest', 'Recruit', 'MoveFirst', 'MoveLast'] as const;
export type PriceName = typeof priceNames[number];
export const pricePhases = ['Discovery', 'Build', 'Harvest', 'Recruit', 'Move'] as const;
export type PricePhase = typeof pricePhases[number];

export class TP extends TPLib {
  static {
    const tp = TPLib;
    // do not 'override' --> set lib value
    tp.useEwTopo = false;    // Use NS Topo
    tp.maxPlayers = 6;       // allows space for CardPanel
    tp.numPlayers = 4;
    tp.cacheTiles = 2.5;
    PaintableShape.defaultRadius = tp.hexRad;
  }

  // timeout: see also 'autoEvent'
  static stepDwell:  number = 150
}


/** colors for ChaosOrder */
export namespace CO {
  export const btColor = 'rgb(203, 135, 183)'; // baseTile color (lighter mauve-ish)
  export const mauve = 'rgb(166, 78, 129)'; // bold mauve
  export const dmauve = 'rgb(138, 105, 138)'; // dark mauve
  export const orange = 'rgb(255, 140, 0)'; // color for phase Icons
  export const nColor = 'rgb(255, 140, 0)'; // neutral color
  export const bColor = 'rgb(255, 140, 0)'; // bank color
  export const dColor = 'rgb(150, 70, 0)'; // default background color? for PTokenShape
  export const gColor = 'rgb(240, 30, 0)'; // gem Color
  export const rhy_zu = 'rgb(210, 75, 41)'; // Rhyzu.pColor

}

/** A PathShape: pentagon with a right-angle point */
export function pentagon (xs: number, ys: number, fillc: string, tilt = 0, strokec = '') {
  const points = [
      [-xs/2, ys/2],
      [ xs/2, ys/2],
      [ xs/2, 0],
      [ 0, -ys/2],
      [-xs/2, 0 ],
      [-xs/2, ys/2],
    ] as [x: number, y: number][];

  const pent = new PathShape({ points, fillc, strokec});
  pent.rotation = tilt;
  pent.mouseEnabled = false;
  return pent;
};

// TODO: maybe use TextTweaks to place the glyphs?
/** Foundation bonus; also use for Income icons */
/** E: energy, G: gem, C: card, R: recruit, U: upgrade(gold), *: gemlock
 *
 * harv:
 * - 'F' Fame
 * - 'Up' Upgrade Attribute (Circadians)
 * - 'M0' Leyrien's Morale in Base
 * fs: fontSize
 * tc: textColor
 */
export function bonusIcon(harv?: HARVEST | PriceBonus, fs = TP.hexRad * .15, tc?: string ) {
    if (!harv || harv.length > 3) return undefined;  // panel foundations
    const spotmap = { E: 'yellow', G: CO.gColor, C: 'white', R: 'orange', U: 'gold', '.': 'grey',
       '%': C.GREEN, F: 'rgb(127,127,127)' };
    const cardRot = 12;
    const miniCard = (bc = C.grey128) => {
      const cardRect = { x: -w / 2, y: -h / 2, w, h, r: 2, s: 1 }; // maybe use TextInRect?
      const card = new RectShape(cardRect, cHarv, bc);
      card.scaleX = card.scaleY = Math.cos(cardRot * Math.PI/180);
      return card;
    }
    const icon = new Container();
    const h0 = harv[0] as keyof typeof spotmap;
    const cHarv = spotmap[h0] ?? C.transparent;
    const w = fs * .22/.15, h = (h0 == 'F' || h0 == 'U') ? w : w * 2.5/1.75; // 1.4;
    // TODO: F -> FameShape (grey with white text)
    const shape = (h0 == 'C' || h0 == 'U') ? miniCard() : (h0 == 'F') ? miniCard(C.grey224) : new CircleShape(cHarv, fs, '');
    const tColor = tc ?? C.pickTextColor(cHarv, ['black', 'white']);
    const harvp = harv.replace('F', '+');
    const iText = new CenterText(h0 == 'C' ? '+' : harvp, fs, tColor);
    if (harv !== '-') icon.addChild(shape, iText);
    if (h0 == 'C') icon.rotation = cardRot;
    return icon
  }


export function gemlockIcon(dx = .35, dy = 0) {
  const rad = TP.hexRad * .1
  const bi = bonusIcon('.' as HARVEST, rad, CO.gColor)!;  // grey dot
  const gem = new EllipseShape(CO.gColor, rad * .5, rad * .7, ''); // elongated gem
  gem.x += rad * .45;
  gem.y += rad * .25;
  bi.addChild(gem)
  bi.x = dx;
  bi.y = dy;
  return bi
}

