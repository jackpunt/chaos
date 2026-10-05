import { arrayN, C, F } from "@thegraid/common-lib";
import { CenterText, CircleShape, EllipseShape, NamedContainer, PathShape, RectShape } from "@thegraid/easeljs-lib";
import { Container } from "@thegraid/easeljs-module";
import type { HARVEST } from "./chaos-tile";
import { Leader, type PriceBonus } from "./meeples";
import { CO, TP, type PhaseName } from "./table-params";


/** A PathShape: an up-pointing pentagon with a right-angle point */

export function pentagon(xs: number, ys: number, fillc: string, tilt = 0, strokec = '') {
  const y0 = xs;
  const points = [
    [-xs, ys],
    [xs, ys],
    [xs, -y0],
    [0, -y0 - xs],
    [-xs, -y0],
    [-xs, ys],
  ] as [x: number, y: number][];

  const pent = new PathShape({ points, fillc, strokec });
  pent.rotation = tilt;
  pent.mouseEnabled = false;
  return pent;
}// TODO: maybe use TextTweaks to place the glyphs?
/** Bonus Icon:
 * Foundation (Base pair & Relic), ProdToken (Harvest),
 * SetPrices bonus, PriceToken icons(^, >), RelicBonus row, gemlockIcon
 * FAME_BONUS (on Fame track) M1 (redeploy, win)
 *
 * Ev: energy, Gv: gem, C: card, Rv: recruit, U: upgrade(gold), .: gemlock
 *
 * harv:
 * - 'F' Fame (for RelicBonus)
 * - 'Up' Upgrade Attribute (Circadians)
 * - 'M0' Leyrien's Morale in Base (may need 'Atk' graphic when it flips: M2)
 * fs: fontSize
 * tc: textColor
 */

export function bonusIcon(harv: HARVEST | PriceBonus, fs = TP.hexRad * .15, tc?: string) {
  // Color for each bonus CircleShape:
  const spotmap = {
    E: 'yellow', G: CO.gColor, C: 'white', R: 'orange', U: 'gold', '.': 'grey',
    '%': C.GREEN, F: 'rgb(127,127,127)'
  };
  const cardRot = 12;
  const miniCard = (bc = C.grey128) => {
    const cardRect = { x: -w / 2, y: -h / 2, w, h, r: 2, s: 1 }; // maybe use TextInRect?
    const card = new RectShape(cardRect, cHarv, bc);
    card.scaleX = card.scaleY = Math.cos(cardRot * Math.PI / 180);
    return card;
  };
  const icon = new Container();
  const h0 = harv[0] as keyof typeof spotmap;
  const cHarv = spotmap[h0] ?? C.transparent;
  const w = fs * .22 / .15, h = (h0 == 'F' || h0 == 'U') ? w : w * 2.5 / 1.75; // 1.4;

  // TODO: F -> FameShape (grey with white text); some icon for 'U'
  const shape = (h0 == 'C' || h0 == 'U') ? miniCard() : (h0 == 'F') ? miniCard(C.grey224) : new CircleShape(cHarv, fs, '');
  const tColor = tc ?? C.pickTextColor(cHarv, ['black', 'white']);
  const harvp = harv.replace('F', '+');
  const iText = new CenterText(h0 == 'C' ? '+' : harvp, fs, tColor);
  if (harv !== '-') icon.addChild(shape, iText);
  if (h0 == 'C') icon.rotation = cardRot;
  return icon;
}

/** generic icon to represent a Gem Lock */
export function gemlockIcon(dx = .35, dy = 0) {
  const rad = TP.hexRad * .1;
  const bi = bonusIcon('.' as HARVEST, rad, CO.gColor)!; // grey dot
  const gem = new EllipseShape(CO.gColor, rad * .5, rad * .7, ''); // elongated gem
  gem.x += rad * .45;
  gem.y += rad * .25;
  bi.addChild(gem);
  bi.x = dx;
  bi.y = dy;
  return bi;
}

/** Phase indicator on Card (TextInBox for now) */
export function phaseIcon(ntext: PhaseName, fontSize = TP.meepleRad * .3) {
  const font = F.fontSpec(fontSize, 'sans-serif', '500');
  const wide = TP.meepleRad * .8; // less wide that a LeaderCard
  const border = [0, 0, .15, -.05] as [number, number, number, number];
  return new Leader.TextInBox(ntext, font, wide, { bgColor: C.transparent, border, textColors: [CO.orange] });  // could be simple CenterText
}

/** left-side icon for placement cost */
export function plGemIcon(nGem = 1, fontSize = 16, top = -80, left = -55) {
  const icon = new NamedContainer('plGem');
  const x0 = left + fontSize * .7;
  const y0 = (2 * fontSize + top), dydg = fontSize * .9;
  arrayN(nGem).forEach(n =>{
    const gem = new CircleShape(CO.gColor, fontSize*.33, '');
    gem.x = x0;
    gem.y = y0 + n * dydg;
    icon.addChild(gem);
  })
  const gemy = y0 + (nGem - 1) * dydg;
  const circ = new EllipseShape('grey', fontSize * .35, fontSize * .12 ,'white')
  const arr1 = new CenterText('v', fontSize * .55, 'white');
  const arr2 = new CenterText('V', fontSize * 1.0, 'white');
  circ.y = gemy + fontSize * 1.3;
  arr1.y = gemy + fontSize * .55;
  arr2.y = gemy + fontSize;
  circ.x = arr1.x = arr2.x = x0;
  icon.addChild(circ, arr1, arr2);
  return icon;
}

/** right-side icon for upgrade cost */
export function upGemIcon(nGem = 1, fontSize = 16, top = -80, left = -55) {
  fontSize = Math.round(fontSize);
  const icon = new NamedContainer('plGem');
  const mlh = fontSize;  //arr2.getMeasuredHeight();

  const x0 = -(left + fontSize * .7);
  const y0 = (2 * mlh + top);
  const xs = fontSize/2;
  const ys = nGem * mlh + mlh/2;
  const pent = pentagon(xs, ys, C.briteGold)
  pent.x = x0;
  pent.y = y0;
  icon.addChild(pent);

  const font = F.fontSpec(fontSize, undefined, 'bold');
  const arr2 = new CenterText('V', font, C.white);
  arr2.scaleY = -1;  // to get inverted V
  arr2.y = y0;
  arr2.x = x0;
  icon.addChild(arr2);
  arrayN(nGem).forEach(n => {
    const gem = new CircleShape(CO.gColor, fontSize*.33, '');
    gem.x = x0;
    gem.y = y0 + mlh * (n + 1);
    icon.addChild(gem)
  })
  return icon;
}
