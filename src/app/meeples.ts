import { C, F, S, stime, type XY, type XYWH } from "@thegraid/common-lib";
import { CenterText, CircleShape, EllipseShape, NamedContainer, PathShape, RectShape, TextInRect, type Paintable, type RectWithDispOptions, type TextInRectOptions } from "@thegraid/easeljs-lib";
import type { Container, MouseEvent, Rectangle } from "@thegraid/easeljs-module";
import { Graphics } from "@thegraid/easeljs-module";
import { Meeple, MeepleShape, NumCounterBox, Tile, TP, type DragContext, type Hex, type HexM, type IHex2 } from "@thegraid/hexlib";
import { CardShape } from "./card-shape";
import { TokenHex, type ChaosHex2 as Hex2, type HexMap2 } from "./chaos-hex";
import { ChaosTile, type BONUS, type FactionOnTile, type TERRAIN } from "./chaos-tile";
import { factionNeutral, type FactionId } from "./factions";
import { BgFound, Foundation } from "./foundation";
import type { GamePlay } from "./game-play";
import type { GameState } from "./game-state";
import type { Player } from "./player";
import { bonusIcon, CO, priceNames, type PhaseName, type PriceName } from "./table-params";


type BackSide = ChaosUnit['baseShape']['backSide'];
/** an [x, y] pair or tuple */
type XYp = [x: number, y: number];

const chaosUnitType = ['Fighter', 'Leader'] as const;
export type ChaosUnitType = typeof chaosUnitType[number];

const chaosBuildingType = ['Factory', 'Outposts', 'Stronghold'] as const;
export type ChaosBuildingType = typeof chaosBuildingType[number];
export class PaintableCont extends NamedContainer implements Paintable {

  constructor(Aname = '', cx = 0, cy = 0) {
    super(Aname, cx, cy);
  }
  paint(colorn?: string, force?: boolean): Graphics {
    let rv = new Graphics();
    this.children.forEach(child => {
      const pc = child as Paintable;
      if (typeof pc.paint == 'function') {
        rv = pc.paint(colorn, force); // capture the last Paintable Graphics
      }
    })
    return rv;
  }

  calcBounds(): XYWH {
    const { x, y, width: w, height: h } = this.getBounds();
    return {x, y, w, h};
  }

  /** ensure PaintableCont is cached; uses getBounds() ?? calcBounds().
   *
   * copied from PaintableShape
   *
   * @param scale [1] scale to use if cache is created
   */
  setCacheID(scale = 1) {
    if (this.cacheID) return;  // also: if already cached, get/setBounds is useless
    let b = this.getBounds() as Pick<Rectangle, 'x' | 'y' | 'width' | 'height'>
    if (!b) {
      const { x, y, w, h } = this.calcBounds();
      b = { x, y, width: w, height: h }
    }
    this.cache(b.x, b.y, b.width, b.height, scale);
  }
}

/** constructor sets this.pColor, this.radius.
 *
 * subclass can override static pointAry, static get points, or mscgf(...)
 */
class PathShapeMeeple extends MeepleShape {
  /** points returned by static get points() */
  static pointAry: XYp[] = [[-1,0], [1,0], [1,1], [-1,1]];

  /** return this.pointAry [static] */
  static get points(): XYp[] { return  this.pointAry};

  morph(points: XYp[], radius = TP.meepleRad/4) {
    return points.map(([x,y]) => [x * radius, (y + 1) * radius] as XYp)
  }

  /** subclass override mscgf(...) for non-PathShape */
  override mscgf(fillc = this.pColor, ss?: number, rs?: number): Graphics {
    const points0 = (this.constructor as typeof PathShapeMeeple).points;
    const points = this.morph(points0, this.radius)
    return new PathShape({ points, fillc}, this.graphics).graphics;
  }

  // TODO: makeOverlay for backside Shape
  override makeOverlay(y0?: number) {
    return super.makeOverlay(y0); // make an overlay shape for the backside of baseShape.
  }
}
class FactoryShape extends PathShapeMeeple {
  /** flatish pentagon */
  static override pointAry = [[-1,0], [-1, -1], [0, -1.25], [1,-1], [1, 0]] as XYp[];
}
class OutpostShape extends PathShapeMeeple {
  static makePointAry() {
    // enforce symmetry:
    const leftPts = [[-1, 0], [-1, -1.4], [-.8, -1.4], [-.8, -1], [0, -1.5]] as XYp[];
    const rightPts = leftPts.map(([x, y]) => [-x, y]).slice(0, -1).reverse() as XYp[];
    return leftPts.concat(rightPts);
  }
  /** larger, w/walls */
  static override pointAry = OutpostShape.makePointAry();
}
class StrongholdShape extends PathShapeMeeple {
  /** larget, w/tower */
  static override pointAry = [[-1, 0], [-1, -2], [-.8, -2], [-.8, -1.5], [0, -2], [1, -1.5], [1, 0]] as XYp[];
}




// change moveTo->unitCollision to allow send multiple meeps on hex:
// put a TileSource<Fighter> on each hex? then .get & .put & .available
// if !!meep.hex;  sourceHexUnit is the only one actually *on* the hex.
// the others are stacked on 'available'
// Plan B: Fighters are just a 'count' of units on that FactionOnTile

// most ChaosMeeples have a TileSource<ChaosMeeple>
// homeHex = TileSource.hex
// other have unitary homeHex (LeaderCard)

/** ChaosMeeple [moveable/dragable objects] comprises:
 * - ChaosPresence: ChaosUnit(Leader, Fighter) & ChaosBuilding(Factory, Outposts, Stronghold)
 * - Relic
 * - PriceToken
 *
 * Note: ChaosToken (Trap, Morale, Foundation), PriceToken, 'Relic', is NOT Presence
 */
export class ChaosMeeple extends Meeple {
  declare gamePlay: GamePlay;
  declare player: Player;
  homeXY!: XY;                // sendHome location, if needed

  /** invoke from startDrag() to prevent movement */
  stopDrag() {
    this.player.gamePlay.table.stopDragging()
  }

}
/** marker class denoting Faction presence in a Region */
export class ChaosPresence extends ChaosMeeple {}

class ChaosUnit extends ChaosPresence {
}

/** A PaintaableCont holding a counter: NumCounterBox */
class FighterCounter extends PaintableCont {
  counter: NumCounterBox;

  constructor(player?: Player, name = 'FighterBaseShape', fontSize = TP.hexRad * .2) {
    super(name);
    const color = player?.color;
    const counter = new NumCounterBox('fighters', 0, color, fontSize);
    this.counter = counter;
    this.addChild(counter);
  }
}

/** A ChasoUnit that displays as a counter.
 *
 * becomes the FoT.fighterIcon */
export class Fighter extends ChaosUnit {
  declare baseShape: FighterCounter;
  get counter() { return this.baseShape.counter }
  constructor(Aname: string, player?: Player) {
    super(Aname, player);
  }

  override makeShape (fontSize = TP.hexRad * .2) {
    return new FighterCounter(this.player);
  }
}

// Meeple has unMove & faceUp

// These are more Tile-like: See also: Foundation (TODO: merge)
/** subclass may have a slot on ChaosHex, but does not confer faction 'presence' */
class ChaosToken extends Tile {
  declare gamePlay: GamePlay;
  declare player: Player;
  homeXY!: XY;                // sendHome location, if needed

}

/** maybe someday itemize them */
export type LeaderName = string;

type CombatStats = [ str: number, atk: number, shield: number ];

interface LeaderSpec {
  facId: FactionId;
  name: string;
  stats0: CombatStats; // initial
  stats2: CombatStats; // ugraded
  t1?: string;         // Text on card
  t2?: string;         // Upgrade Text; default: same as T1
  P?: PhaseName,       // default: 'Combat'
  isRhyzu?: number;    // default 0 (not a Rhyzu) 1, 3, 6 --> PriceToken to summon
  plGem?: number;        // default: 0, isRhyzu --> 0
  upGem?: number;        // default: 0
  upPlace?: number;      // upPlace: 1 (except: Injura = 2, Demo = 0, isRhyzu = 0)
}
export interface ILeader extends LeaderSpec {
  stats: CombatStats;    // current/actual
  upgraded: boolean;
  onBoard: boolean;     // false: not recruited/deployed
  special: () => CombatStats; // also effects before-during-after combat, or move or recruit or ...
  // specialByPhase: Map<phase, function>
}

// canonize and publish for typing field & return type
type LeaderCard = InstanceType<typeof Leader.LeaderCard>;

//  ' F ' --> Fist (strength), * --> Attack, # --> Shield/Defense
export class Leader extends ChaosUnit implements LeaderSpec {

  static leaderSpecs: LeaderSpec[] = [
    // Circadian: 0
    { facId: 0, name: 'Sable', stats0: [2, 0, 1], stats2: [4, 2, 1],
      t1: "OPPONENTS MUST REVEAL THEIR COMBAT WHEEL AND TACTICS CARD FIRST", },
    { facId: 0, name: 'Akira', stats0: [2, 0, 2], stats2: [4, 0, 4], upGem: 1, P: 'Recruit',
      t1: "MAY SPEND 1 ENERGY TO GAIN 1 GEM",
      t2: "GAIN ONE GEM", },
    { facId: 0, name: 'Renzo', stats0: [3, 2, 0], stats2: [5, 3, 0], upGem: 1,
      t1: "PINS 3 OPPOSING UNITS AND REQUIRES 3 OPPOSING UNITS TO BE PINNED",
      t2: "PINS 5 OPPOSING UNITS AND REQUIRES 5 OPPOSING UNITS TO BE PINNED", },
    { facId: 0, name: 'Zoey',  stats0: [2, 2, 0], stats2: [3, 3, 0],
      t1: "MAY STAY WITH FIGHTERS IF RETREATING. THIS MAY BE TO NON-ADJACENT REGIONS", },
    { facId: 0, name: 'Melvan', stats0: [2, 0, 0], stats2: [3, 1, 1],
      t1: "2 F IF NOT ADJACENT TO THE DROP SHIP",
      t2: "3 F IF NOT ADJACENT TO THE DROP SHIP", },
    // AI: 1
    { facId: 1, name: 'Adecai', stats0: [3, 0, 0], stats2: [5, 0, 0], plGem: 1,
      t1: "WOUND 1 OPPOSING FIGHTER AFTER EACH VICTORY", }, // (limit 4) },
    { facId: 1, name: 'Injura', stats0: [-2, 3, 0], stats2: [2, 4, 0], plGem: 1, upGem: 1,
      t1: "1 * AFTER EACH VICTORY", }, // (Shieldable, limit 4)
    { facId: 1, name: 'Xiao',   stats0: [2, 1, 1], stats2: [3, 3, 1], upGem: 1,
      t1: "GAIN 1 RESEARCH IF NO OPPOSING FIGHTERS ARE WOUNDED IN BATTLE",
      t2: "GAIN 2 RESEARCH IF NO OPPOSING FIGHTERS ARE WOUNDED IN BATTLE", },
    { facId: 1, name: 'Phoros', stats0: [-2, 3, 0], stats2: [2, 4, 0], plGem: 1,
      t1: "MAY USE * * SECTION OF THE WHEEL OR PAY NO GEM IF ROLLING A DIE", },
    { facId: 1, name: 'Demo', stats0: [2, 1, 0], stats2: [4, 2, 0], upGem: 2,
      t1: "RETURN TO BASE IF DEFEATED", },
    // Zcharo: 2
    { facId: 2, name: 'Oachra', stats0: [2, 2, 0], stats2: [3, 3, 0], plGem: 1,
      t1: "ZCHARO ATTACKS ARE RESOLVED BEFORE RESOLVING STRENGTH", },
    { facId: 2, name: 'Cahzor', stats0: [2, 0, 0], stats2: [4, 0, 0],
      t1: "1 F IF IN A REGION WITH 1 OR MORE OPPOSING BUILDINGS",
      t2: "1 F PER OPPOSING BUILDING", },
    { facId: 2, name: 'Zucalah', stats0: [3, 0, 0], stats2: [6, 0, 0], P: 'Harvest',
      t1: "MAY SPEND 1 ENERGY TO GAIN 1 TACTICS CARD",
      t2: "GAIN 1 TACTICS CARD", },
    { facId: 2, name: 'Ejax', stats0: [1, 1, 0], stats2: [2, 1, 2],
      t1: "GAIN F EQUAL TO THE CURRENT ROUND", },    // +str per Round
    { facId: 2, name: 'Urzo', stats0: [3, 0, 0], stats2: [5, 0, 0], plGem: 1,
      t1: "GAIN OPPONENT'S USED TACTICS CARD UNLESS YOU CHOOSE TO RETREAT", }, // gain oppo Card (unless Urzo retreats)
    // Leyrien: 3
    { facId: 3, name: 'Niruveh', stats0: [2, 0, 1], stats2: [3, 0, 3], P: 'Build',
      t1: "DOUBLE ALL LOCATION REWARDS",
      t2: "DOUBLE ALL LOCATION REWARDS. FOUNDATIONS ARE NOT REQUIRED", }, // Build: double found rewards, no found req'd
    { facId: 3, name: 'Eeyla', stats0: [2, 2, 0], stats2: [4, 3, 0], plGem: 1,
      t1: "GAIN ONE FAME AFTER EACH VICTORY", },
    { facId: 3, name: 'Vehlac', stats0: [3, 0, 0], stats2: [6, 0, 0], plGem: 1, P: "Move",
      t1: "MAY MAKE A FREE MOVE WITHOUT OTHER UNITS [END OF PHASE]", },
    { facId: 3, name: 'Ivi', stats0: [2, 0, 0], stats2: [3, 1, 1], P: 'Move',
      t1: "MAY MOVE AND ATTACK WITH AN ALLIED LEADER", },
    { facId: 3, name: 'Rylach', stats0: [1, 0, 1], stats2: [3, 0, 2], plGem: 1, P: 'Move',
      t1: "BOOST MORALE IF ENDING MOVEMENT ON A CLIFFS OR PLAINS REGION", },
    // Jrayek: 4
    { facId: 4, name: 'Jayen', stats0: [4, 0, 1], stats2: [7, 0, 2], plGem: 1,
      t1: "LOSE HALF HIS FIGHTERS [ROUNDED UP] AFTER EACH VICTORY", }, // (before atk v shields)
    { facId: 4, name: 'Ikryla', stats0: [2, 0, 0], stats2: [4, 2, 0], P: "Income",
      t1: "GAIN 1 TACTICS CARD OR 1 GEM IF IN A RELIC REGION",  },
    { facId: 4, name: 'Lynke', stats0: [1, 2, 0], stats2: [3, 4, 0], upGem: 1,
      t1: "1 F PER 2 *", }, // 1 str per 2 atk
    { facId: 4, name: 'Vahla', stats0: [2, 0, 0], stats2: [2, 0, 2], upGem: 2,
      t1: "4 F IF FIGHTING AN OPPOSING RHY-ZU",
      t2: "4 F IF FIGHTING WITH 1 OR MORE ALLIED OR OPPOSING RHY-ZU", },  // +4 str against, (or with) a Rhyzu
    { facId: 4, name: 'Kajali', stats0: [2, 1, 0], stats2: [4, 2, 0], plGem: 1,
      t1: "OPPONENT CANNOT SELECT ANY BATTLES IN THIS REGION", },
    // Rhyzu: 4
    { facId: 4, name: 'Uryk', stats0: [2, 2, 0], stats2: [3, 3, 0], isRhyzu: 1,    // -E3, +E1
      t1: "CANNOT ENTER LAKES BATTLE VICTOR GAINS CONTROL OF URYK", },
    { facId: 4, name: 'Halke', stats0: [2, 0, 2], stats2: [3, 0, 3], isRhyzu: 3,   // -E2, +E1
      t1: "CANNOT ENTER LAKES BATTLE VICTOR GAINS CONTROL OF HALKE", },
    { facId: 4, name: 'Katarin', stats0: [3, 0, 0], stats2: [5, 0, 0], isRhyzu: 6, // -G1, +G1
      t1: "CANNOT ENTER LAKES BATTLE VICTOR GAINS CONTROL OF KATARIN", },
    // Oxataya: 5
    { facId: 5, name: 'Tovati', stats0: [1, 2, 0], stats2: [3, 3, 0], upGem: 1,
      t1: "2 F IF FIGHTING WITHOUT ALLIED LEADERS OR RHY-ZU", },
    { facId: 5, name: 'Azaru', stats0: [2, 0, 0], stats2: [3, 0, 0], plGem: 1,
      t1: "GAIN 1 TACTICS CARD BEFORE EACH BATTLE", t2: "GAIN 1 TACTICS CARD AND 1 GEM BEFORE EACH BATTLE"},
    { facId: 5, name: 'Xanya', stats0: [2, 0, 1], stats2: [4, 0, 2], P: 'Recruit',
      t1: "MAY MAKE A FREE MOVE WITHOUT OTHER UNITS [END OF PHASE]",
      t2: "MAY MAKE A FREE MOVE WITH ANY NUMBER OF FIGHTERS [END OF PHASE]", },
    { facId: 5, name: 'Rhan', stats0: [2, 0, 2], stats2: [3, 0, 2], plGem: 1, upGem: 1,
      t1: "2 F FOR EACH OTHER OXATAYA LEADER",
      t2: "3 F FOR EACH OTHER OXATAYA LEADER", },
    { facId: 5, name: 'Onari', stats0: [1, 1, 0], stats2: [3, 2, 1], plGem: 1, P: 'Move',
      t1: "MOVING OFF LAKES WITH ANY NUMBER OF UNITS IS A FREE MOVE", },
    { facId: 5, name: 'Latanja', stats0: [2, 0, 0], stats2: [3, 1, 0], upGem: 1,
      t1: "MAY REDEPLOY UP TO 4 FIGHTERS FROM HER REGION IF VICTORIOUS",
      t2: "MAY REDEPLOY UP TO 10 FIGHTERS FROM HER REGION IF VICTORIOUS", }, // may redploy 4, 10 fighters when victorious
  ];

  static allLeaders: Leader[] = [];
  static allLeadersByName = new Map<LeaderName, Leader>();

  /** src & dst for D&D */
  factOnTile?: FactionOnTile; // TODO: construct on a newHex2(the Leader card on Panel)

  facId: FactionId;
  get stats() { return this.upgraded ? this.stats2 : this.stats0 }
  stats0: CombatStats;
  stats2: CombatStats;
  t1: string;
  t2: string;
  tp: PhaseName;
  upgraded = false;  // set true when upgraded
  onBoard = false;   // in play: on map, on a ctile/fac vs waiting on Leader.homeHex
  plGem = 0;
  upGem = 0;
  upPlace = 0;
  isRhyzu = 0;   // maybe subclass...
  isaRhyzu(): this is Rhyzu {
    return this.isRhyzu > 0;   // versus instanceof
  }

  card: LeaderCard;       // InstanceType<typeof Leader.LeaderCard>;

  constructor(Aname: string, player: Player) {
    super(`${Aname}`, player); // Note: Tile/Meeple (Container) caches itself. so it all drags & drops
    Leader.allLeaders.push(this);
    Leader.allLeadersByName.set(Aname, this);

    const lspec = Leader.leaderSpecs.find(spec => spec.name == Aname)!
    const { name, facId, stats0, stats2, t1, t2, P, isRhyzu, plGem, upGem } = lspec;
    this.facId = facId;
    this.stats0 = stats0;
    this.stats2 = stats2;
    this.t1 = t1 ?? 'Leader Text';
    this.t2 = t2 ?? this.t1;
    this.tp = P ?? 'Combat';
    this.isRhyzu = isRhyzu ?? 0;
    this.plGem = plGem ?? 0;
    this.upGem = upGem ?? 0;
    this.upPlace = (name == 'Injura' ? 2 : name == 'Demo' ? 0 : isRhyzu ? 0 : 1);
    this.card = this.makeCard();
    this.rightClickable()
  }

  // make card visible, and scale up:
  override onRightClick(evt: MouseEvent) {
    const tile = this.factOnTile!.tile;
    const card = this.card, parCont = tile.hex!.map.mapCont.overCont;
    this.baseShape.parent.localToLocal(this.baseShape.x, this.baseShape.y, parCont, card);
    parCont.addChild(card);  // baseTile.FoT or overCont
    card.scale = 1.6;        //
    card.visible = true;
    card.reCache(0);
    card.stage.update();
    card.on(S.click, () => { card.visible = false; card.reCache(0); card.stage.update()}, this, true)
  }

  /**
   * A TextInRect: increase border [dx] to fill to wide
   * @param ntext
   * @param font
   * @param wide desired width of rect
   * @param opts; opts.border sets only [ , , dy1, dy2]
   * - bgColor: [WHITE]
   * - corner: [.1]
   * - border: [5]
   * - strokec: ['']
   * - ss: [1]
   * @returns
   */
  static TextInBox = class TextInBox extends TextInRect {
    constructor(ntext: string, font: string | number, wide: number, opts: TextInRectOptions & RectWithDispOptions = {}) {
      const ctext = new CenterText(ntext, font, opts.textColor ?? C.WHITE), mw = ctext.getMeasuredWidth();
      const fontSize = F.fontSize(ctext.font);  // extract from full fontSpec
      const dx = Math.max((wide - mw) / 2, 1) / fontSize;
      const ob = opts.border;
      const border: [number, number, number, number] = (typeof ob == 'number')
        ? [dx, dx, ob, ob]
        : [dx, dx, ob?.[2] ?? .15, ob?.[3] ?? 0];
        delete opts.border;
      super(ctext, { fontSize, border, corner: .1, ...opts })
    }
  }

  /** the small, D&D/on-map shape; it can expand to the larger leaderCard */
  static LeaderIcon = class LeaderIcon2 extends PaintableCont {
    constructor(inst: Leader, opts?: RectWithDispOptions) {
      const { strokec, ss } = { strokec: '', ss: 1, ...opts };
      const ntext = `${inst.Aname.substring(0,2)}`, wide = inst.radius * .35, fontSize = inst.radius * .25;
      const bgColor = inst.player.color;
      super(`${inst.Aname}_icon`);
      const rs = new RectShape({ x: -wide/2, y: -wide/2, w: wide, h: wide, s: ss, r: 2}, bgColor, strokec)
      const text = new CenterText(ntext, fontSize, C.WHITE);
      this.addChild(rs, text);
    }
  }
  declare baseShape: TextInRect & { backSide: Paintable };
  override makeShape(size?: number, opts?: RectWithDispOptions) {
    return new Leader.LeaderIcon(this, opts);
  }

  /** Used as baseShape for LeaderTile and as pop-up enlargement for LeaderIcon */
  static LeaderCard = class LeaderCardC extends PaintableCont {
    cardShape: CardShape;
    rzIcon?: Paintable;

    constructor(Aname: string, public leader: Leader, vis = false) {
      super(Aname);
      const color = leader.isRhyzu ? CO.rhy_zu : leader.pColor;
      const cardShape = this.cardShape = new CardShape(color, C.WHITE)
      cardShape.paint(color, true);
      const fontSize = leader.radius * .3;
      const top = -cardShape._rect.h/2, left = cardShape._rect.x, right = -left;
      const nText = new CenterText(this.Aname, fontSize, C.WHITE);
      nText.y = fontSize * .9 + top;
      // TODO: move the addXXX() methods from Leader to LeaderCard
      const card = this;
      card.addChild(cardShape);
      card.addChild(nText);
      leader.addStats(this, fontSize, 2 * fontSize + top);
      if (leader.plGem) card.addChild(leader.plGemIcon(fontSize, top, left))
      if (leader.upGem) card.addChild(leader.upGemIcon(fontSize, top, left))
      leader.addText(card, fontSize, top, left);
      card.scale = .45;
      card.visible = vis;
    }
    set scale(xy: number)  { this.scaleX = this.scaleY = xy; }
  }

  /** Fill a container with the info from a Leader card.
   *
   * ILeader: facId/isRhyzu (bgColor), Name, stats, upgraded (border: gold),
   *
   * plGem, upGem, upPlace
   *
   * onBoard: obvious from location of baseShape (baseShape on Card OR Card [popup] on baseShape)
   */
  makeCard() {
    return new Leader.LeaderCard(`${this.Aname}`, this);
  }

  homeTile?: ReturnType<this['makeLeaderTile']>;    // typically on Panel, start & return Tile on this.homeHex
  /** make LeaderTile and place on this.homeHex
   *
   * Use LeaderCard as baseShape of LeaderTile
   *
   * called from Panel.makeLeaders();
   *
   * @param name appears on the LeaderTile
   * @param player owner of LeaderTile [this.player]
   * @param pColor color to paint LeaderTile [player.color]
   * @returns LeaderTile on this.homeHex with this Leader on LeaderTile
   */
  makeLeaderTile(name: string, player = this.player, pColor = player.color) {
    const ldr = this;
    /** a place to drop Leader on Panel when not recruited to map */
    const LeaderTile = class LeaderTile extends ChaosTile {
      declare baseShape: LeaderCard;
      constructor(Aname: string) {
        super(Aname, 'Ldr', '-', player); // isBase: paints (baseShape) { 'Ldr': C.WHITE }
        this.paint(pColor)
        const fot = this.getFoT(player);
        fot.setXY(-this.radius * .66);    // Note: fot.isBase == true; --> x = 0; set y to place Icon btw stats & PhaseIcon
      }
      // disable cache, need full zoom/resolution
      override reCache(scale?: number): void { super.reCache(0)  }
      // LeaderCard for this Leader:
      override makeShape(): Paintable {
        return new Leader.LeaderCard(ldr.Aname, ldr, true);
      }
      // not a drop target for Foundations
      override ndxForFoundation(): number | undefined { return undefined }
    }

    const homeTile = new LeaderTile(name);
    homeTile.moveTo(this.homeHex);  // homeTile on hex on map with mapCont
    homeTile.addLeader(ldr);        // add to mapCont.overCont
    this.homeTile = homeTile as any;// tsc needs reassurance that we can assign to this.homeTile.
    return homeTile;
  }

  addText(card: Container, fontSize = 16, top = -80, left = -55) {
    const tt = this.upgraded ? this.t2 : this.t1;
    const t1 = new CenterText(tt || 'Leader text', fontSize * .5, C.WHITE);
    t1.lineWidth = -left * 1.8;
    t1.textAlign = 'left';
    const { width, height } = t1.getBounds(), mlh = t1.getMeasuredLineHeight();
    t1.x = left + .3 * fontSize;
    t1.y = -top - Math.max(height, 3 * mlh);
    card.addChild(t1);
    const tpIcon = this.phaseIcon(card, this.tp);
    tpIcon.y = t1.y - tpIcon.label.getMeasuredLineHeight() * 1.1;
    card.addChild(tpIcon);
  }
  /** Rhy-zu indicator on Card */
  rhyzuIcon(card: Container, ntext = 'Rhy-zu') {
    const font = F.fontSpec(this.radius * .3, undefined, 'bold');
    const wide = card.children[0].getBounds().width * .8; // extract the baseShape
    const border = [0, 0, .1, -.0] as [number, number, number, number];
    return new Leader.TextInBox(ntext, font, wide, { bgColor: C.grey128, border, textColors: [C.WHITE] });
  }
  /** Phase indicator on Card */
  phaseIcon(card: Container, ntext: PhaseName, ) {
    const font = F.fontSpec(this.radius * .3, 'sans-serif', '500');
    const wide = card.children[0].getBounds().width * .8; // extract the baseShape
    const border = [0, 0, .15, -.05] as [number, number, number, number];
    return new Leader.TextInBox(ntext, font, wide, { bgColor: C.transparent, border, textColors: [CO.orange] });  // could be simple CenterText
  }

  plGemIcon(fontSize = 16, top = -80, left = -55) {
    const icon = new NamedContainer('plGem');
    const gem = new CircleShape(CO.gColor, fontSize*.33, '');
    gem.y = (2 * fontSize + top); gem.x = left + fontSize * .7;
    const circ = new EllipseShape('grey', fontSize * .35, fontSize * .12 ,'white')
    const arr1 = new CenterText('v', fontSize * .55, 'white');
    const arr2 = new CenterText('V', fontSize * 1.0, 'white');
    circ.y = gem.y + fontSize * 1.3;
    arr1.y = gem.y + fontSize * .55;
    arr2.y = gem.y + fontSize;
    circ.x = arr1.x = arr2.x = gem.x;
    icon.addChild(gem, circ, arr1, arr2);
    return icon;
  }

  upGemIcon(fontSize = 16, top = -80, left = -55) {
    const icon = new NamedContainer('plGem');
    const gem = new CircleShape(CO.gColor, fontSize*.33, '');
    gem.y = (3 * fontSize + top); gem.x = -(left + fontSize * .7);
    const arr2 = new CenterText('V', fontSize * 1.0, 'white');
    arr2.scaleY = -1;  // to get inverted V
    gem.y + fontSize * 1.3;
    gem.y + fontSize * .55;
    arr2.y = gem.y - fontSize;// arr2.scaleY = -1;
    arr2.x = gem.x;
    icon.addChild(gem, arr2);
    return icon;
  }

  addStats(card: Container, fontSize = this.radius * .3, y = 0 ) {
    const [str, atk, shld] = this.stats;
    const stats1 = new CenterText(`S     A     D`, fontSize*.7, C.WHITE);
    const stats2 = new CenterText(`\n${str}   ${atk}   ${shld}`, fontSize, C.WHITE) ;
    stats1.y = stats2.y = y;
    card.addChild(stats1, stats2);
  }
  // show with gold border:
  upgrade() {
    this.upgraded = true;
    const bg = this.card.children[0] as RectShape;   // from this.makeCard()
    bg.strokec = C.coinGold; bg.paint(bg.colorn, true);
  }

  // Note: common pattern in PriceToken (below)
  /** the TargetMark for Leader  */
  static targetMark = new class LeaderMark extends CardShape {
    constructor(rad = TP.hexRad * 1.1) {
      super('rgba(130, 130, 130, 0.4)', '', rad);
      this.visible = false;
    }
  }();

  override showTargetMark(hex: IHex2 | undefined, ctx: DragContext): void {
    const map = (ctx.targetHex ? ctx.targetHex.map : this.gamePlay.hexMap) as HexMap2;
    const mark = (this.constructor as typeof Leader).targetMark;
    map?.showMark(ctx.targetHex, mark);
    map?.mapCont.overCont?.addChild(mark); // move to overCont
  }

  /** the ChaosTile the was holding Leader before dragStart. */
  ctxCtile(ctx?: DragContext) {
    return this.factOnTile?.tile ?? (ctx?.info.srcCont as FactionOnTile).tile;
  }

  override isLegalTarget(toHex: Hex2, ctx?: DragContext): boolean {
    if (toHex == this.ctxCtile(ctx).hex) return true;
    if (!toHex.ctile || (toHex.ctile.terrain == 'Mtn')) return false;
    if (toHex.ctile.terrain == 'Lake' && this.facId !== 5) return false;
    return true
  }

  override dragStart(ctx: DragContext): void {
    super.dragStart(ctx);
    // remove leaderIcon from ctile:
    this.ctxCtile(ctx)?.addLeader(this, false);
  }

  override dropFunc(targetHex: Hex2, ctx: DragContext): void {
    const ctile = targetHex?.ctile ?? this.ctxCtile(ctx);
    // place leaderIcon on ctile:
    ctile.getFoT(this.player).addLeader(this);
  }
}

export class Rhyzu extends Leader {
  // cost/benefit during Income phase:
  static rhyzuCost: BONUS[] = ['-', 'E3', '-', 'E2', '-', '-', 'G1']; // if Jrayek controls
  static rhyzuInc:  BONUS[] = ['-', 'E1', '-', 'E1', '-', '-', 'G1']; // if opponent controls
  /** Each Rhyzu(1, 3, 6) in order [0, 1, 2] */
  static get allRhyzu() { return (Leader.allLeaders.filter(ldr => ldr.isaRhyzu()) as Rhyzu[]).sort((a, b) => a.isRhyzu - b.isRhyzu);}

  // -------- created by Panel; not on Hex ---------
  // Drop the Rhy-zu Leader on a Faction's Base|Panel and game can handle the token.
  // move it to JReyek Panel in correct orientation (faceUp)
  static Token = class Token extends ChaosToken {
    static radius = TP.meepleRad * .8;
    cost: NamedContainer;
    inc: NamedContainer;
    constructor(public leader: Rhyzu ) {
      super(leader.Aname);    // player is undefined: blocks Tile.paintInConstructor
      this.cost = new NamedContainer(`rhyzu_cost`);
      const icon = bonusIcon(Rhyzu.rhyzuCost[leader.index])!
      // this.cost.addChild(icon); // new CenterText(Rhyzu.rhyzuCost[leader.isRhyzu], undefined, 'red')
      this.cost.addChild(new CenterText(Rhyzu.rhyzuCost[leader.isRhyzu], undefined, C.RED));
      this.inc = new NamedContainer(`rhyzu_inc`);
      this.inc.addChild(new CenterText(Rhyzu.rhyzuInc[leader.isRhyzu], undefined, C.coinGold))
      this.addChild(this.cost, this.inc);
      this.paint(); // set cost/inc not visible
    }
    override makeShape(size?: number): Paintable {
      const ts = TP.meepleRad * .8;
      return new RectShape({ x: -ts/2, y: -ts/2, w: ts, h: ts }, C.grey128, C.BLACK)
    }
    /** show cost/income (& controller?) */
    override paint(colorn?: string, force?: boolean): void {
      this.inc.visible = this.cost.visible = false;  // it is possible to remove Rhyzu from board...
      if (this.leader.onBoard) {
        const isJrayek = (this.leader.player?.facId == 4);
        this.inc.visible = !isJrayek;
        this.cost.visible = isJrayek;
      }
      super.paint(colorn, force);
      this.reCache(0);
    }
  }

  index: number; // index of Token
  token: InstanceType<typeof Rhyzu.Token>;

  constructor(Aname: string, player: Player) {
    super(Aname, player);   // player initially Jrayek!
    this.index = Rhyzu.allRhyzu.indexOf(this);
    this.token = new Rhyzu.Token(this);

    this.addRzIcon(this.card); // fields (rzIcon) get [re]initialized after super()
    this.paint(CO.rhy_zu, true);   // paint this.rzIcon
    this.baseShape.paint(undefined, true); // Icon
  }
  override makeShape(size?: number) {
    return super.makeShape(size, { strokec: C.BLACK, ss: .5 });  // Rhyzu Icon distinguished by black outline
  }

  // update rzIcon color when setPlayer()
  override paint(colorn?: string, force?: boolean): void {
    if (this.card.rzIcon) {       // super.constructor invokes paint before setRzIcon()
      const iColor = this.onBoard ? this.pColor : CO.rhy_zu
      this.card.rzIcon.paint(iColor);
      this.card.reCache(0);
      const homeTileBase = this.homeTile?.baseShape as LeaderCard | undefined;
      homeTileBase?.rzIcon?.paint(iColor);
      this.homeHex?.tile?.reCache(0);
      this.factOnTile?.update();
    }
    super.paint(CO.rhy_zu, force);   // --> baseShape.paint()
  }

  // Specialize player and color of LeaderTile
  override makeLeaderTile(name: string, player = this.gamePlay.neutralPlayer, pColor = CO.rhy_zu) {
    this.player = player;
    const rv = super.makeLeaderTile(name, player, pColor);
    this.addRzIcon(rv.baseShape);  // after this.makeShape in LeaderTile constructor
    this.paint(pColor);            // and re-paint
    return rv
  }

  /** rzIcon of this.card... set after return from super() */
  addRzIcon(card = this.card) {
    const rzIcon = card.rzIcon = this.rhyzuIcon(card);
    rzIcon.y = 0;
    card.addChild(rzIcon)
  }

  setPlayer(player: Player) {
    this.player = player;
    this.onBoard = (player.facId <= 5);   // NeutralPlayer signifies Rhyzu was returned from board (Jrayek fails to pay)
    this.token.paint();   // show cost/income (& controller?)
    this.paint();
  }

  override isLegalTarget(toHex: Hex2, ctx?: DragContext): boolean {
    const ctile = toHex?.ctile;
    if (ctile?.terrain == 'Ldr') return (ctile == this.homeTile);
    if (ctile?.terrain == 'Base') return true;
    return super.isLegalTarget(toHex, ctx);
  }
  override dropFunc(targetHex: Hex2, ctx: DragContext): void {
    if (targetHex == this.homeHex) {
      this.setPlayer((ctx.gameState as GameState).gamePlay.neutralPlayer)
    } else
    if (targetHex?.ctile?.terrain == 'Base') {
      this.setPlayer(targetHex.ctile.player!)
    }
    super.dropFunc(targetHex, ctx);
  }
}

// methods in common to Buildings
// TerraMystica-like filling of homeAry
//
// player moves during Build phase, auto-move during Combat phase
// subtypes may contribute Strength
//
// Panel has FHex[9], FoundationTile has a FHex (when face up)
//
export class ChaosBuilding extends ChaosPresence {
  addStrength = 0;    // maybe something more general with Effects or Advice

  override get radius() { return TP.meepleRad; }
  readonly bText!: BONUS;           // 'E2' 'C' 'G1'
  homeAry!: Foundation[];  // buildings in residence (take/put from left)

  _found!: Foundation;
  /** Assert Building is always assigned to *some* Foundation: panel or map */
  get found() { return this._found }
  set found(f: Foundation) {
    if (this._found && this._found != f) {
      this._found.bldg = undefined;   // release that foundation.
    }
    this._found = f;
    f.bldg = this;       // inform foundation it is occupied.
  }

  constructor(Aname: string, player: Player, f: Foundation, homeAry: Foundation[]) {
    super(Aname, player);
    this.homeAry = homeAry;
    this.nameText.y += this.radius/4;
  }

  override makeShape(size = this.radius/2): Paintable {
    const bShape = this.makeShape0(size);
    return bShape;
  }

  makeShape0(size = 20): Paintable {
    return new RectShape({ x: -size/2, y: -size/2, w: size, h: size, }, 'rgba(0, 0, 0, 0.3)', 'black')
  }

  override isLegalTarget(toHex: Hex2, ctx?: DragContext): boolean {
    const tile = toHex.ctile;
    return !!tile?.foundations.find(f => f && (!f.bldg || f.bldg == this))
  }

  override sendHome(): void {
    super.sendHome
    const lim = this.homeAry.length - 1;
    // ASSERT there is always an open slot
    const rndx = this.homeAry.toReversed().findIndex(f => f.bldg == undefined || f.bldg == this);
    const ndx = lim - (rndx < 0 ? 0 : rndx);
    this.found = this.homeAry[ndx];
  }

  override dragStart(ctx: DragContext): void {
    const ndx = this.homeAry.findIndex(f => f.bldg == this); // Panel slot of this Building's current Foundation
    if (ndx < 0) {
      this.scaleX = this.scaleY = 1;  // not coming from Panel, undo mapScale
      return;        // OK to drag
    }
    const fndx = this.homeAry.findIndex(f => f.bldg !== undefined)
    if (ndx == fndx) {
      this.homeAry[ndx].bldg = undefined; // OK to drag; remove from Panel
    } else {
      this.stopDrag();          // leave on Panel
    }
  }

  zoomed = false;
  zoom(z = true, zf = Foundation.mapScale) {
    if (this.zoomed == z) return; // nothing to do
    if (this.zoomed) {
      this.zoomed = z; // true
      this.gamePlay.table.zoom(zf);
    } else {
      this.zoomed = z; // false
      this.gamePlay.table.zoom(1/zf);
    }
  }

  markMap?: HexM<Hex>;
  override showTargetMark(hex: IHex2 | undefined, ctx: DragContext) {
    if (ctx.targetHex) {
      this.markMap = ctx.targetHex.map;
      this.markMap.showMark(ctx.targetHex)
      // this.zoom(true);
    } else {
      this.markMap?.showMark(undefined);
      // this.zoom(false)
    }
  }

  override dropFunc(targetHex: Hex2, ctx: DragContext): void {
    this.placeBuilding(targetHex);
  }

  placeBuilding(targetHex?: Hex2) {
    if (!targetHex) {
      this.sendHome();
    } else {
      // ASSERT: there is a Foundation! from isLegalTarget()
      // on targetHex (on map), place on Foundation.
      const f = this.findFoundation(targetHex)
      f.bldg = this;   // mark Foundation occupied
      this.scaleX = this.scaleY = Foundation.mapScale
      this.x = f.x; this.y = f.y;
      f.parent.addChild(this);
    }
  }
  // invoke before super.dropFunc -> moveTo(hex)
  // but after dragger.drop: dropCont.addChild(dobj)
  // this.parent = tileCont ie: meepleCont
  // this.hex = hexMap@[r,c]
  findFoundation(hex2: Hex2) {
    const ctile = hex2.ctile!;
    const p = this.parent.localToLocal(this.x, this.y, ctile.parent);
    // ASSERT: there is an empty Foundation, else not isLegalTarget!
    const fs = ctile?.foundations.filter(f => f && (!f.bldg || f.bldg == this)) as Foundation[];
    const f = fs.sort((a, b) => Math.abs(a.x - p.x) - Math.abs(b.x - p.x))[0];
    return f;  // the nearest Foundation
  }
}

export class Factory extends ChaosBuilding {
  override bText = 'E2' as BONUS;
  override makeShape0(size = TP.meepleRad): Paintable {
    const bs = new FactoryShape(undefined, size)
    return bs;
  }
}

export class Outposts extends ChaosBuilding {
  override bText = 'C' as BONUS;
  override makeShape0(size = TP.meepleRad): Paintable {
    return new OutpostShape(undefined, size)
  }
  override addStrength = 2;
}

export class Stronghold extends ChaosBuilding {
  override bText = 'G1' as BONUS;
  override makeShape0(size = TP.meepleRad): Paintable {
    return new StrongholdShape(undefined, size);
  }
}

// Player moves only during initial game startup;
// Auto moves during Relics phase
export class Relic extends ChaosMeeple {
  static bonus = ['E2', 'G1', 'C', '%', '%', '-'] as BONUS[];

  static allRelics: Relic[] = [];

  bText = '%' as BONUS;   // placeholder

  override makeShape(size = TP.meepleRad): Paintable {
    const rc = size * .4;
    return new RectShape({ x: -size/2, y: -size * .5, w: size, h: size, rr: [rc, rc, 2, 2] }, C.grey32);
  }
  readonly foundation: Foundation; // placed on map hex by placeRelic(hex)

  /**
   *
   * @param n Relic number (1..6)
   * @param player NeutralPlayer
   * @param homeXY location for sendHome
   */
  constructor(n: number, player: Player, homeXY: XY) {
    const Aname = `Relic${n}`;
    super(Aname, player);
    const {y: bsy, width: bsh} = this.baseShape.getBounds()
    const dy = bsh/2 + bsy;
    homeXY.y -= dy;
    this.homeXY = homeXY;
    const fs = this.baseShape.getBounds().height*.9;
    const label = new CenterText(`${n}`, F.fontSpec(fs, 'Arial Rounded MT Bold'), C.WHITE);
    label.y = dy + this.radius * .1;
    this.addChild(label);
    this.foundation = new BgFound(`RF_${n}`, Relic.bonus[n]);
    Relic.allRelics.push(this);
    this.sendHome();
    this.rightClickable()
  }

  override onRightClick(evt: MouseEvent): void {
    // super.onRightClick(evt);
    this.toMapScale(false);
    this.stage.update();
    this.on(S.click, () => { this.toMapScale(true); setTimeout(this.stage.update, 4)}, this, true)
  }

  override sendHome(): void {
    const f = this.foundation;
    f.onTile?.removeFoundation(f);
    f.x = this.homeXY.x; f.y = this.homeXY.y;
    this.player.panel.addChild(this);
    this.scaleX = this.scaleY = 1;
    this.x = f.x; this.y = f.y;
    this.fromHex = undefined!;
  }

  isAdjacentCurPlayerBaseFoundations(toHex: Hex2) {
    const cpbf = this.player.gamePlay.curPlayer?.panel.baseTile.baseRegions;
    if (!cpbf) return false;
    return cpbf[0].linkHexes.includes(toHex) || cpbf[1].linkHexes.includes(toHex);
  }

  override cantBeMovedBy(player: Player, ctx: DragContext): string | boolean | undefined {
    if (ctx.lastShift) return false;
    if (this.foundation.onTile) {
      this.fromHex = this.foundation.onTile.chex; // table.stopDragging() will drop this on this.fromHex!
      return 'already in place';
    }
    if (ctx.gameState.isPhase('PlaceRelic') && ctx.gameState.curPlayer == player) return false;
    return 'only move in PlaceRelic phase';
  }

  override isLegalTarget(toHex: Hex2, ctx: DragContext): boolean {
    if (toHex == this.foundation.onTile?.chex) return true; // Relic is not 'on' a Hex or Tile; is on its Foundation.
    if ((['Base', 'Mtn', 'Lake'] as TERRAIN[]).includes(toHex.ctile?.terrain ?? 'Base')) return false;
    const adjacent = this.isAdjacentCurPlayerBaseFoundations(toHex) && !ctx.lastCtrl;
    return !!toHex.tile && !toHex.tile.foundations[1] && !adjacent;
  }

  override dragStart(ctx: DragContext): void {
    super.dragStart(ctx)
    this.toMapScale(false);
  }

  override dropFunc(targetHex: Hex2, ctx: DragContext): void {
    this.placeRelic(targetHex);
    this.toMapScale(!this.gamePlay.gameState.isPhase('PlaceRelic'));
    if (!targetHex) this.gamePlay.hexMap.showMark();
  }

  // on targetHex (on map), place on Foundation
  placeRelic(targetHex: Hex2)  {
    const f = this.foundation;
    if (!targetHex) {
      this.sendHome();
    } else {
      // move foundation to new mapTile:
      if (f.onTile !== targetHex.ctile) {
        f.onTile?.removeFoundation(f);
        targetHex.ctile?.addFoundation(f); // sets f.scaleX, f.scaleY
      }
      this.x = f.x; this.y = f.y;
      f.parent.addChild(this);
      return;
    }
  }

  toMapScale(shrink = true) {
    Relic.allRelics.forEach(rel => {
      if (!!rel.foundation.parent) {
        rel.scaleX = rel.scaleY = shrink ? Foundation.mapScale : 1;
      }
    })
  }
}

// Has a slot on ChaosHex
// Auto-drop mostly; player selects Strength or Fame when there is a choice.
export class Morale extends ChaosToken {
  status = 'M1' as "M1" | "M2";  // M2 when it flips? (Atk+2)
}

// Drop Stronghold on hex/foundation and game can move the Trap.
// resetTile() during Income phase
export class AI_Trap extends ChaosToken {
  status = 'T1' as "T1" | "T0";   // T0 when triggered
}


export type PriceId = 1 | 2 | 3 | 4 | 5 | 6;
export type PriceBonus = '^'|'C'|'>'|'%';
type VDIST = [ toFac: number, toBank: number, toLeft?: number, toRight?: number, expire?: number ];
type PT_Status = 'avail' | 'inplay' | 'invault' | 'pending'; // pending-->avail at end of round (or: after SetPrices phase)
// Auto-move during SetPrices phase (just click on track, place token)


export class PriceToken extends ChaosMeeple {

  static bonus35 = [ ['^', 'C'], ['>', '%']] as PriceBonus[][];
  static bonus_2 = [ ['^'], ['^']] as PriceBonus[][];

  // distinguish for number of players;
  // 3-5 players: 1 & 2 contribnute to player; only 1 has '^' retrieval bonus
  static dist35 = [
    // ^ C [> %]    3      4      5     [6]
    [1,0], [1,1], [1,2], [2,2], [2,3], [3,3],
  ]
  // 2 players: 1 & 2 vdist --> Bank; have '^' retreival bonus
  static dist2 = [
    // ^     [^]     3      4      5     [6]
    [0,1], [0,2], [1,2], [2,2], [2,3], [3,3],
  ]
  // elt 4 = eject: round when token is removed; coded in 'gamePlay.setPriceNeutral()'
  static neutral = [
      [], [0, 0, 1, 1, 2], [0, 3, 0, 0, 4], [0, 2, 1 ,1], [0, 5, 0, 0], [],
  ]

  declare baseShape: PTokenShape;

  facId: FactionId;    // undefined for Neutral Tokens

  /** distribution of funds */
  readonly vdist: VDIST;
  // string[] indicating each PriceBonus:
  readonly bTexts?: PriceBonus[];

  // extra things that happen when used to price a phase; for ex: gain ('%' or 'C'), place Rhyzu or retrieve from vault
  effect() { }

  // when played to price: move to 'inplay'
  // at end of SetPrices phase: if vid==1 is 'inplay', move Tokens from 'invault' to 'avail'
  // at end of 'Move' (or 'Income' ?) phase: move from 'inplay' to 'invault'
  _status: PT_Status = 'avail';
  get status() { return this._status }
  set status(state: PT_Status) {
    this._status = state;
    // TODO: move to right place? remove from Panel?
  }
  // when 'inplay' onPhase is set:
  onPhase?: PriceName; // subset of GameState.state.Aname

  /** some would have called it 'rad' or 'size' */
  wh: number;

  /**
   *
   * @param vid  ValueId: 1 .. 6 (or: 2, 3, 4, 5) (or: 3, 5)
   * @param xy homeXY for sendHome()
   * @param player for super; (& to get facId)
   */
  constructor(public vid: PriceId, xy: XY = { x: 0, y: 0 }, player: Player) {
    const facId = player.facId ?? -1;           // -1 was fallback for Neutral Player (vs facId = 6?)
    super(`F${facId}:PT${vid}`, player);        // construct baseShape
    this.wh = this.gamePlay.hexMap.xywh().dxdc;
    this.homeXY = xy;
    this.facId = facId;
    const np = TP.numPlayers
    if (facId <= 5) {
      this.vdist = (np == 2 ? PriceToken.dist2 : PriceToken.dist35)[vid-1] as VDIST;
    } else {
      this.vdist = (PriceToken.neutral)[vid-1] as VDIST;
    }
    this.bTexts = ((np == 2) ? PriceToken.bonus_2 : PriceToken.bonus35)[this.vid-1];
    this.fillCont(this);
    this.status = ['avail', 'invault', 'avail', 'avail', 'avail', 'invault'][vid-1] as PT_Status;
    if (facId == 5 + 1) this.status = 'avail';
    if (this.status == 'avail') { this.setAvailable() } else { this.moveToVault() }
    // TODO: implement expiration, and (%) and retrieve(^) and card(C)
    this.effect = () => {};
  }

  // add content above the PricingToken baseShape:
  fillCont(cont: NamedContainer, size = (this.baseShape).getBounds().width) {
    const bgcolor = C.nameToRgbaString(this.player!.color, .7)
    const base = this.baseShape;
    const over = new RectShape(base._rect)
    over.paint(bgcolor, true);
    cont.addChild(over)

    const textBlock = (text: string, bgColor: string, fs = s * .5) => {
      const fontSpec = F.fontSpec(fs, 'sans-serif', '600');
      const border = [0, 0, .13, -.09] as [number, number, number, number];
      return new TextInRect(text, { bgColor, fontSpec, border })
    }
    // make TextRect for number/icon:
    const setTR = (tr: TextInRect, w = 10, x = 0, y = 0) => {
      tr.rectShape.setRectRad({ w, x: tr.rectShape.x - w/2 }) ;
      tr.x = x; tr.y = y;
      cont.addChild(tr);
      tr.paint(tr.bgColor, true);  // repaint with new width
    }
    const [ toFac, toBank, left, right, eject ] = this.vdist ?? [];
    const s = size*.92, x1 = -s/4, x2 = +s/4, y1 = +s/4, y2 = -s/4;
    const neutral = (left !== undefined);
    if (neutral && left > 0) {
      const lt = textBlock(`${left}`, C.BLACK)
      setTR(lt, s*.45, x1, y2)
      const rt = textBlock(`${right}`, C.WHITE)
      setTR(rt, s*.45, x2, y2)
    }
    if (toFac > 0 && toBank > 0) {
      const tf = textBlock(`${toFac}`, this.pColor!)
      setTR(tf, s*.45, x1, y1);
      const tb = textBlock(`${toBank}`, CO.bColor)
      setTR(tb, s*.45, x2, y1);
    } else if (toFac > 0) {  // single payment to Faction:
      const tf = textBlock(`${toFac}`, this.pColor!)
      setTR(tf, s*.7, 0, y1)
    } else if (toBank > 0) { // single payment to Bank
      const tb = textBlock(`${toBank}`, CO.bColor)
      setTR(tb, s*.7, 0, y1)
    }
    if (neutral && eject !== undefined) {
      const tir = textBlock(`x${eject}`, C.transparent, s * .3)
      setTR(tir, s*.7, 0, toBank > 0 ? y2 : y1)
    }
    if (!neutral && this.bTexts) {
      const text = this.bTexts.join(' ')
      const tir = textBlock(text, C.nameToRgbaString(this.pColor!, .6), s * .4)
      setTR(tir, s*.7, 0, y2);
    }
    // TODO: use bonusIcon(^, C, >, %)
    return cont;
  }
  override makeShape(size = TP.meepleRad): Paintable {
    return new PTokenShape(size)
  }

  /** the TargetMark for PriceToken  */
  static targetMark = new class PTMark extends RectShape {
    constructor(wh = TP.meepleRad * 1.9) {
      super({x: -wh/2, y: -wh/2, w: wh, h: wh}, 'rgba(130, 130, 130, 0.4)', '');
      this.visible = false;
    }
  }();

  override showTargetMark(hex: IHex2 | undefined, ctx: DragContext): void {
    const map = (ctx.targetHex ? ctx.targetHex.map : this.gamePlay.hexMap) as HexMap2;
    const mark = (this.constructor as typeof PriceToken).targetMark
    map?.showMark(ctx.targetHex, mark);
    map?.mapCont.overCont?.addChild(mark); // move to overCont
  }

  override isLegalTarget(toHex: Hex2, ctx?: DragContext): boolean {
    return ((toHex instanceof TokenHex) && !toHex.meep && !toHex.otherMoveHex?.meep);
  }

  // return token to place on panel
  override sendHome(): void {
    this.x = this.homeXY.x;
    this.y = this.homeXY.y;
    this.player!.panel.avail.addChild(this);
  }

  override dragStart(ctx: DragContext): void {
    if (this.status !== 'avail' && !ctx.lastShift) this.stopDrag();
  }

  // For unknown reason, the PricingToken.mark interferes with normal hexUnderObj()
  // workaround: showTargetMark puts PTMark on hexMap.overCont (instead of .markCont)

  override dragFunc0(hex: IHex2 | undefined, ctx: DragContext): void {
    ctx.targetHex = hex?.isLegal ? hex : this.fromHex;
    this.showTargetMark(hex, ctx);      // move mark to target = this.fromHex
    this.dragFunc(hex, ctx);
  }

  override dropFunc(targetHex: IHex2, ctx: DragContext): void {
    if (!targetHex) {
      this.sendHome();
    } else {
      this.x = 0; this.y = 0;
      const priceIndex = this.gamePlay.table.priceHex.findIndex(ph => ph == targetHex)
      this.setTokenOnPhase(priceIndex);
      // do not advance state when Shift used by alternate player...
      if (this.player == this.gamePlay.curPlayer) {
        this.gamePlay.gameState.state.done!(this.player.index);
      }
    }
  }

  // TODO: add code for moveTokenToVault, gainTokenFromVault
  setTokenOnPhase(priceIndex: number) {
    const priceName = priceNames[priceIndex];
    this.moveTo(this.gamePlay.table.priceHex[priceIndex]);
    this.onPhase = priceName;
    this.status = 'inplay';
    this.gamePlay.gameState.phasePrices[priceName] = this;
    if (priceName.startsWith('Move')) this.advanceGun();

    const facName = factionNeutral[this.facId];
    console.log(stime(this, `.setTokenOnPhase: ${facName} w/${this.Aname} ->`), priceName )
  }

  advanceGun() {
    const gs = this.gamePlay.gameState;
    const pnxt = gs.nextNdx(this.player.index);
    const pndx = (pnxt != gs.gunPlayer.index) ? pnxt : gs.nextNdx(pnxt);
    gs.gunPlayer = this.gamePlay.allPlayers[pndx];
  }

  /** remove from pricing, place in vault */
  moveToVault() {
    this.moveTo(undefined);   // release priceHex
    this.x = this.y = 0;
    this.player.panel.vault.addChild(this);
    this.status = 'invault';
    this.visible = false;
    this.stage.update();
  }

  /** put on panel, but stats = 'pending' */
  retrieveFromVault() {
    this.sendHome();
    this.status = 'pending';  // flipped down...
    this.visible = true;      // TODO: visually dim, disable mouse
    this.faceUp(false)
  }

  /** mark token available for use */
  setAvailable() {
    this.status = 'avail';
    // TODO: full visiblitiy & mouse enable
    this.faceUp(true);
  }

  override cantBeMovedBy(player: Player, ctx: DragContext): string | boolean | undefined {
    if (this.status == 'pending') return "Not available until next round";
    if (this.status == 'invault') return "In Vault -- Not available";
    return undefined;
  }
}

export class PTokenShape extends RectShape {

  constructor(public size = TP.meepleRad, strokec = 'black', g0 = new Graphics) {
    super({ x: -size/2, y: -size/2,  w: size, h: size }, CO.dColor, strokec, g0);
  }
  override paint(colorn?: string, force?: boolean): Graphics {
    return super.paint(colorn ?? this.colorn, force)
  }
}

// Also: factory, outposts, stronghold, foundation, relic, discovery-marker?, fame-marker?
// and cardboard: rhy-zu-token, morale {fame, strength}, ai-trap,
