import { C, permute, S, stime } from "@thegraid/common-lib";
import { CenterText, NamedContainer, RectShape, type DragInfo, type NamedObject, type Paintable } from "@thegraid/easeljs-lib";
import { Container, DisplayObject, Graphics, MouseEvent } from "@thegraid/easeljs-module";
import { H, Tile, TileSource, type DragContext, type HexDir, type IHex2 } from "@thegraid/hexlib";
import { CardShape } from "./card-shape";
import { type GamePlay } from "./game-play";
import type { GameState } from "./game-state";
import { PathHex2 as Hex2, type PathHex as Hex1, type HexMap2 } from "./path-hex";
import { type PathTable, type PathTable as Table } from "./path-table";
import { PathTile } from "./path-tile";
import type { Player } from "./player";
import { TP } from "./table-params";
import type { CountClaz } from "./tile-exporter";


// TODO: define rectange 'Tiles' to hold the Rule/Constraint/Bonus items.
/** @return value of placement [-1 if proscribed]  */
type Vfunc = (tile: PathTile, hex: Hex1, commit?: boolean) => number;
/** @return value of edge in placement [-1 if proscribed]  */
type Efunc = (tile: PathTile, hex: Hex1, dir: HexDir) => number;

type Rtype = 'edge' | 'own' | 'spcl' | 'atk'; // special: 'veto'
/** id: ident, c: cost, t: type, d: description, vf: value_f, ef: edge_f, l: level */
type RuleSpec = {
  id: string, c: number, t?: Rtype, d?: string, e?: string, vf?: Vfunc, l?: number,
}
const Hdirs = TP.useEwTopo ? H.ewDirs : H.nsDirs;
const Hdir2 = Hdirs.slice(0, 3); // half of Hdirs
/**
 * A rule/constraint: determine isLegal & value of a placement (tile, rotation, location)
 *
 */
export class PathRule implements NamedObject {
  Aname?: string | undefined;
  text = ''; // description
  etext= ''; // eval descr
  cost = 0; // purchase or placement cost, value multiplier
  type: Rtype = 'edge'; //vs 'own'
  level = 1; // [cost]

  constructor(public card: PathCard, rs: RuleSpec) {
    this.Aname = rs.id;
    this.text = rs.d ?? rs.id;
    this.cost = rs.c;
    this.level = rs.l ?? rs.c;
    this.type = rs.t ?? 'edge';    // edge | own | atk | spcl
    this.etext = rs.e ?? (this.type == 'edge' ? `Σ match` : this.type == 'own' ? `Σ adj` : '');
    if (rs.vf) this.valuef = rs.vf;
  }

  /** apply ef to edge/join in each dir; return [ef(NE), ef(E),...,ef(NW)] */
  edgeMap(tile: PathTile, hex: Hex1, ef: Efunc) {
    return Hdirs.map(dir => ef(tile, hex, dir))
  }

  /** replace with some EFunc... */
  edgef: Efunc = (tile: PathTile, hex: Hex1) => 0;

  /**
   * base template: Hdirs.map(edgef(dir));
   * overwritten by rs.vf
   * @return -1 if any edge fails, else map(edgef).reduce(sum);
   */
  valuef: Vfunc = (tile: PathTile, hex: Hex1) => {
    const ev = this.edgeMap(tile, hex, this.edgef) // [ef(NE), ef[E], ef[SE], ef[SW], ef[W], ef[NW]]
    return ev.find(v => v < 0) ? -1 : ev.reduce((pv, cv) => pv + cv, 0);
  }

  /**
   * invoked to see if this Rule is satisfied, and if so to what value.
   *
   * set that value in this.card.ruleValueAtRot[rot]
   *
   * @param commit [false] set true to commit attack
   * @return \<0 if bad placement, else (valuef * cost) >= 0
   */
  value(tile: PathTile, hex: Hex1, commit = false) {
    const v = this.valuef(tile, hex, commit) * this.cost;
    return v
  }
}

type SCF = (0 | 1 | 2);
class PRgen {
  vfunc_matches_n(n: number, tile: PathTile, hex: Hex1) {
    // all joins match on N+ factors (from AfKey = ['aShapes', 'aColors', 'aFills'])
    // fail if any join matches on 0 or 1 factor
    const ev = Hdirs.map(dir => this.efunc_matches_n(n, tile, hex, dir)) as number[];
    return ev.find(v => v < 0) ? -1 : Math.sum(...ev);
  }
  /** @return -1: bad OR 0: no join OR nm: nm >= n factors match on this edge */
  efunc_matches_n = (n: number, tile: PathTile, hex: Hex1, dir: HexDir) => {
    return 0;
  }

  vfunc_match_sum(n: number, tile: PathTile, hex: Hex1) {
    const ev = Hdirs.map(dir => this.efunc_match_sum(tile, hex, dir)); // [ef(NE), ef(E)...ef(NW)]
    const sum = Math.sum(...ev); // an edge may be 0, but never -1;
    return sum < n ? -1 : sum;
  }
  // @return number of matching facets [0..3] on join of given dir (OR 0 if no join)
  efunc_match_sum = (tile: PathTile, hex: Hex1, dir: HexDir) => {
    return 0;  // num of matches: [0..3] OR (0 if no join)
  }

  // the indicated factor must match:
  vfunc_match_scf(n: SCF, tile: PathTile, hex: Hex1) {
    const ev = Hdirs.map(dir => this.efunc_match_scf(n, tile, hex, dir)); // [ef(NE), ef(E)...ef(NW)]
    const fail = ev.find(v => v < 0);
    if (fail) return -1;
    const sum = Math.sum(...ev); // an edge may be 0, but never -1;
    const nm = ev.filter(v => v > 0).length;
    return sum;
  }
  /** each join matches on scf[ndx] (shape,color,fill); return nm */
  efunc_match_scf = (ndx: SCF, tile: PathTile, hex: Hex1, dir: HexDir): number => {
    return 0;
  }

  // check for line-of-3 in at least one dir; score line length in each dir (if len > n)
  vfunc_make_line(n: number, tile: PathTile, hex: Hex1) {
    const ev = Hdirs.map(dir => 1 + this.efunc_line_len(tile, hex, dir)); // [ef(NE), ef(E)...ef(NW)]
    const evN = ev.filter(v => v >= n)
    const sum = Math.sum(...evN); // an edge may be 0, but never -1;
    return sum > 0 ? sum : -1;
  }
  /** number of segments in given dir; given hex + len others */
  efunc_line_len = (tile: PathTile, hex: Hex1, dir: HexDir) => {
    const plyr = tile?.player as Player;
    if (!plyr) debugger; // hex is not on map?
    let len = 0, hexN = hex.nextHex(dir);
    for (; hexN?.ptile?.player === plyr; len++, hexN = hexN?.nextHex(dir));
    return len
  }

  vfunc_fill_in(n: number, tile: PathTile, hex: Hex1) {
    const ev = Hdirs.map(dir => this.efunc_line_len(tile, hex, dir)); // [ef(NE), ef(E)...ef(NW)]
    const evN = Hdir2.map((dir, n) => (ev[n] > 0 && ev[n + 3] > 0) ? (ev[n] + ev[n + 3] + 1) : 0)
    const sum = Math.sum(...evN); // an edge may be 0, but never -1;
    return sum > 0 ? sum : -1;
  }

  /** adjacent to n tiles player does NOT own */
  vfunc_adj_other_n(n: number, tile: PathTile, hex: Hex1) {
    const plyr = tile?.player; // assert: (plyr !== undefined)
    const ev = Hdirs.filter(dir => {
      const aTile = hex.links[dir]?.ptile;
      return aTile && (aTile.player !== plyr)
    })
    const evn = ev.length;
    return (evn >= n) ? evn : -1;
  }

  /** adjacent to n tiles player DOES own. */
  vfunc_adj_own_n(n: number, tile: PathTile, hex: Hex1) {
    const plyr = tile?.player; // assert: (plyr !== undefined)
    const ev = Hdirs.filter(dir => hex.links[dir]?.ptile?.player === plyr)
    const evn = ev.length;
    return (evn >= n) ? evn : -1;
  }

  efunc_atk_n(tile: PathTile, hex: Hex1, dir: HexDir, n: number) {
    const plyr = tile?.player as Player;
    let len = 0, hexN = hex.nextHex(dir); // generally: (n > 0)
    for (; hexN?.ptile?.player === plyr; len++, hexN = hexN?.nextHex(dir));
    // last player tile was: hex.nexHex(dir, len); hexN?.tile?.player !== plyr

    if (len >= n && hexN?.ptile) {
      hexN.ptile.setPlayerAndPaint(plyr); // TODO: graphic feedback (ala hexline)
      return len;
    }
    return 0;
  }

  /** value of 'atk' is 0 unless attack works (there is an opponent at end of row to capture) */
  vfunc_atk_n(n: number, tile: PathTile, hex: Hex1, commit = false) {
    // value = len+1 IFF (line_of_n && nextHex.tile)
    const ev = Hdirs.map(dir => 1 + this.efunc_line_len(tile, hex, dir)); // [ef(NE), ef(E)...ef(NW)]
    const evN = ev.map((len, nth) => {
      if (len >= n) {
        const nTile = hex.nextHex(Hdirs[nth], len)?.ptile;
        const plyr = tile.player as Player, nPlyr = nTile?.player as Player;
        if (!plyr || nPlyr == plyr) { debugger; return 0 }
        if (nTile) {
          if (commit) {
            nTile.setPlayerAndPaint(plyr);
            plyr.adjustNetwork(nTile);
            nPlyr?.mapAllNetworks();
          }
          return len; // successful attack
        }
      }
      return 0;
    })
    const sum = Math.sum(...evN)
    return sum > 0 ? sum : -1;
  }
  sigma = 'Σ';

  ruleSpecs: RuleSpec[] = [
    // each edge matches 2 (of the 3) factors:
    { id: 'matches2', c: 1, vf: (t, h) => this.vfunc_matches_n(2, t, h), d: 'All joins 2+ matches' },
    // at least 5 total matches:
    { id: 'match5', c: 1, vf: (t, h) => this.vfunc_match_sum(5, t, h), d: '5+ total matches' },

    { id: 'shapes', c: 1, vf: (t, h) => this.vfunc_match_scf(0, t, h), d: 'All shapes match' },
    { id: 'colors', c: 1, vf: (t, h) => this.vfunc_match_scf(1, t, h), d: 'All colors match' },
    { id: 'fills', c: 1, vf: (t, h) => this.vfunc_match_scf(2, t, h), d: 'All fills match' },
    // own
    { id: 'other1', c: 2, l: 1, vf: (t, h) => this.vfunc_adj_other_n(1, t, h), d: 'adjacent 1+ other', t: 'own' },
    { id: 'adj1', c: 2, l: 1, vf: (t, h) => this.vfunc_adj_own_n(1, t, h), d: 'adjacent 1+ own', t: 'own' },
    { id: 'adj2', c: 2, vf: (t, h) => this.vfunc_adj_own_n(2, t, h), d: 'adjacent 2+ own', t: 'own' },
    { id: 'line3', c: 2, vf: (t, h) => this.vfunc_make_line(3, t, h), d: 'line of 3+', t: 'own' },
    { id: 'fill-in', c: 2, vf: (t, h) => this.vfunc_fill_in(2, t, h), d: 'fill-in gap', t: 'own' },
    // veto
    { id: 'veto', c: 2, vf: (t, h) => 0, d: 'VETO\n---->', t: 'spcl' },
    // status rules: examine state of the board to have effects, give point
    { id: 'attack3', t: 'atk', c: 3, vf: (t, h, c) => this.vfunc_atk_n(3, t, h, c), d: '-attack-\nline of 3+'},
  ]
  // edge rules:
  // 3 shapes, 2-3 colors, 2 fills
  // match all colors; match all shapes; match all fills

  // owner rules:
  // line-of-3: line-length; fill-in-line: line-length;
  // diamond-4: 2-connected-cluster-size; 2-connected: network size
  // adj-to-opp: num-opp-edges;

}

export class PathCard extends Tile {
  static get allCards() { return Array.from(this.cardByName.values()) }
  static colorMap = { edge: 'lavender', own: 'yellow', atk: 'pink', spcl: C.grey224, };
  /** recompute if TP.hexRad has been changed */
  static get onScreenRadius() { return TP.hexRad * H.sqrt3 };
  /** out-of-scope parameter to this.makeShape(); vs trying to tweak TP.hexRad for: get radius() */
  static nextRadius = PathCard.onScreenRadius; // when super() -> this.makeShape()
  _radius = PathCard.nextRadius;           // when PathCard.constructor eventually runs
  override get radius() { return (this?._radius !== undefined) ? this._radius : PathCard.nextRadius }
  override get isMeep() { return true; }
  declare gamePlay: GamePlay;
  rule!: PathRule
  dText!: CenterText       // set once: rs.d ?? rs.id

  cost!: number;           // set once: rs.c
  cText!: CenterText
  eText!: CenterText

  _value?: number;         // set per tile placement
  vText!: CenterText
  /** value of rule @ current rotation OR maxV */
  get value() { return this._value; }
  set value(v) {
    this._value = v;
    this.vText.visible = (v !== undefined);
    if (v === undefined) v = -1;
    this.vText.text = `${v >= 0 ? v : 0}`
    this.vText.color = v >= 0 ? C.BLACK : C.RED;
  }
  /** value of this.rule at each HexDir for latest PathTile evaluation */
  ruleValueAtRot: number[] = [];

  // Tile { baseShape: RectShape , nameText, descr }
  // TileExporter supplies args = ...[rs, 750]
  constructor(rs: RuleSpec, size?: number) {
    if (size !== undefined) PathCard.nextRadius = size; // set before super calls makeShape()
    super(PathCard.uniqueId(rs.id))      // Note: may need to tweak cache/reCache algo
    this.nameText.y += this.radius * .12;
    this.rule = new PathRule(this, rs)
    this.paint(PathCard.colorMap[this.rule.type])
    this.addChildren(rs)
    PathCard.cardByName.set(this.Aname, this);
    this.homeHex = PathCard.discard.hex; // unitCollision will stack if necessary.
  }

  // invoked by constructor.super()
  override makeShape(): RectShape {
    return new CardShape('lavender', C.BLACK, this.radius);
  }

  override makeBleed(bleed: number): DisplayObject {
    const rv = super.makeBleed(bleed) as CardShape
    rv.paint(C.BLACK)
    return rv
  }

  // descr=rs.d, cost=rs.c, value=-1
  addChildren(rs: RuleSpec) {
    const { x, y, width, height } = this.getBounds()
    const rad = width * .5, textX = width / 2 * .72, textY = height / 2 * .72;
    const dSize = Math.min(height, width) * .2
    const dText = this.dText = new CenterText(rs.d ?? rs.id, dSize)
    dText.y = y + dSize;             // descr.textBaseline = 'top'
    dText.lineWidth = width * .9
    this.addChild(dText)

    this.cost = rs.c;
    const cText = this.cText = new CenterText(rs.c > 0 ? `${rs.c}` : '', dSize);
    cText.x = -textX; cText.y = textY;
    this.addChild(cText);

    const estr = this.rule.etext;
    const eText = new CenterText(estr, dSize)
    eText.y = textY - dSize * 1.1;
    this.addChild(eText);

    const vText = this.vText = new CenterText('', dSize)
    vText.x = +textX; vText.y = textY;
    this.addChild(vText)
  }
  override reCache(scale?: number): void {
    super.reCache(0); // no cache?
  }

  // Identify il-legal sources of fromHex:
  override cantBeMovedBy(player: Player, ctx: DragContext): string | boolean | undefined {
    if (this.fromHex === PathCard.source.hex) return undefined;
    const gameState = ctx.gameState as GameState, table = gameState.table as PathTable;
    if (table.cardRack.includes(this.fromHex as Hex2)) return 'rule in play';
    const isDoneCard = (gameState.cardDone === this);
    if (!isDoneCard && this.fromHex === table.cardDiscard.hex) return 'discarded';
    return undefined; // player.cardRack OR (discard && isDoneCard)
  }

  override markLegal(table: Table, setLegal = (hex: Hex2) => { hex.setIsLegal(false); }, ctx?: DragContext): void {
    table.gamePlay.curPlayer.cardRack.forEach(setLegal)
    setLegal(table.cardRack[0])
    setLegal(PathCard.discard.hex as Hex2)
  }
  // cardDeck -> discard, table.cardPanel[0], player.cardRack
  // cardRack -> discard, table.cardPanel[0], player.cardRack
  // discard (== gameState.cardDone) -> discard, table.cardPanel, player.cardRack
  override isLegalTarget(toHex: Hex2, ctx: DragContext): boolean {
    // Ok to move from player.cardRack but not to table.cardRack (unless == cardDone)
    const gameState = ctx.gameState as GameState;
    if (gameState.notDoneTile(this, true) &&
      gameState.table.cardRack.includes(toHex)) return false;
    return true;
  }

  override showTargetMark(hex: IHex2 | undefined, ctx: DragContext): void {
    if (ctx.targetHex == PathCard.source.hex) ctx.targetHex = PathCard.discard.hex as Hex2
    super.showTargetMark(hex, ctx)
  }

  override dropFunc(targetHex: IHex2, ctx: DragContext): void {
    const toHex = targetHex as Hex2, card = toHex.card;
    if (card && card !== this) card.moveCard(toHex, ctx);
    super.dropFunc(targetHex ?? PathCard.discard.hex, ctx);
    if (!PathCard.discard.sourceHexUnit) PathCard.discard.nextUnit(); // reveal discard
    PathCard.discard.updateCounter();
    PathCard.source.updateCounter();
    ctx.targetHex?.map.showMark(undefined); // if (this.fromHex === undefined)
    // maybe set gameState.cardDone
    const gameState = ctx.gameState as GameState, fromHex = this.fromHex as Hex2;
    const plyr = (gameState.curPlayer as Player)
    const selfDrop = (fromHex == toHex);
    const rackSwap = plyr.rackSwap(this.fromHex, targetHex, plyr.cardRack)
    const discard = plyr.cardRack.includes(fromHex) && (toHex == PathCard.discard.hex)
    if (selfDrop || rackSwap || discard) return;
    {
      setTimeout(() => {
        gameState.cardDone = this; // triggers setNextPlayer; which confuses markLegal()
      }, 0);
    }
  }

  override moveTo(hex: Hex1 | undefined): void {
    super.moveTo(hex)
    if (hex?.Aname === 'discards') this.value = undefined;
  }

  /** hex contains card, which needs to be moved: */
  moveCard(hex: Hex2, ctx: DragContext) {
    // if hex is 'discards' --> let unitCollision stack them
    // if hex in player.cardRack[]: card.sendHome()
    // if hex is table.cardRack[0]: shift all cards up
    if (hex.Aname == 'discards') return;
    const plyr = ctx.gameState?.curPlayer as Player | undefined;
    if (plyr?.cardRack.includes(hex)) {
      const alt = plyr.cardRack.findIndex(hex => !hex.card)
      if (alt < 0) {
        this.sendHome(); // move player card to discards
      } else {
        this.moveTo(plyr.cardRack[alt]); // swap into empty slot
      }
    } else {
      const hexAry = plyr?.gamePlay.table.cardRack ?? [];
      const len = hexAry.length, ndx0 = hexAry.indexOf(hex);
      if (ndx0 !== 0) debugger; // not allowed to drop on other slots...

      const move1 = (card: PathCard, ndx: number) => {
        if (ndx == len) { card.sendHome(); return }
        const hex1 = hexAry[ndx], card1 = hex1.card;
        if (card1) move1(card1, ndx + 1);
        hex1.card = card;
        card.moveTo(hex1)
      }
      move1(this, ndx0 + 1);
    }
  }

  /** how many of which Claz to construct & print */
  static countClaz(n = 2) {
    const rules = new PRgen().ruleSpecs;
    return rules.map(rs => [n, PathCard, rs, 525] as CountClaz)
  }
  static cardByName: Map<string,PathCard> = new Map();
  static uniqueId(rsid: string) {
    let id = rsid, n = 1;
    while (PathCard.cardByName.has(id)) { id = `${rsid}#${++n}` }
    return id;
  }
  static makeCardSources(table: Table, rowcol: { row?: number, col?: number }) {
    CardHex.allCardHex.length = 0; // clear before we make all the new CardHex.
    const { row, col } = { row: 1.9, col: 1, ...rowcol }
    table.makeSourceAtRowCol(PathCard.makeSource, 'discards', row + 1.8, col, { x: 0, y: .6 }, CardHex)
    PathCard.discard = PathCard.source;
    ;(PathCard.discard as any as NamedContainer).Aname = 'PathCardDiscard';
    table.makeSourceAtRowCol(PathCard.makeSource, 'cardDeck', row + 0.0, col, { x: 0, y: .6 }, CardHex)

    const cardback = table.cardBack = new CardBack(table); // it a Button, mostly.
    cardback.moveTo(PathCard.source.hex as Hex1); // set position above source.hex
    cardback.moveTo(undefined);
    cardback.on(S.click, (evt) => cardback.clicked(evt), cardback )
    return [PathCard.source, PathCard.discard];
  }

  static makeAllCards(...prgs: PRgen[]) {
    if (prgs.length === 0) prgs = [new PRgen()];
    PathCard.cardByName.clear();
    prgs.forEach(prg => {
      prg.ruleSpecs.map(ps => new PathCard(ps))
      prg.ruleSpecs.map(ps => new PathCard(ps))
    })
    this.initialSort(PathCard.allCards, PathCard.source)
  }

  static initialSort(cards = PathCard.allCards, source = PathCard.source) {
    permute(cards)
    const levels = [1, 2, 3].map(level =>
      cards.filter(card => card.rule.level == level)
    )
    console.log(`PathCard.initialSort: levels=`, levels.map(ary => ary.slice()))
    // [[levelNdx, num], ...] // !num --> all
    const plans: [ndx: number, len: number][][] = [
      [[0, 2]],
      [[2, 0], [1, levels[1].length / 2], [0, 5]],
      [[1, 0], [0, 2]],
      [[0, 0]],
    ]

    const stacks = plans.map(plan => {
      const rv: PathCard[] = []
      return rv.concat(...plan.map(([ndx, len]) => levels[ndx].splice(0, len || levels[ndx].length)))
    }).reverse()
    stacks.forEach(s => permute(s))
    // enqueue all the stacks on source:
    stacks.forEach(stack => stack.forEach(card => source.availUnit(card, true)))
    // filterUnits(allUnits) reports units in the order they were added:
    console.log(stime(`PathCard.initialSort: stacks=`), stacks, 'source=', source.filterUnits().map(u => `${u.rule.level}:${u.Aname}`))
    console.log(`PathCard.initialSort: levels=`, levels)
  }

  static reshuffle() {
    // assert: src.sourceHexUnit === undefined [else we would not be shuffling...]
    const disc = PathCard.discard, src = PathCard.source;
    const discarded = disc.filterUnits() // extract all available units (with sourceHexUnit)
    discarded.forEach(card => {
      disc.deleteUnit(card);
      src.availUnit(card);
    });
    src.permuteAvailable()
  }

  /** sendHome (or drop card) on discard to accumulate for later reshuffle. */
  static discard: TileSource<PathCard>;
  static source: TileSource<PathCard>;

  static makeSource(hex: IHex2) {
    const src = PathCard.makeSource0(TileSource<PathCard>, PathCard, hex);
    ;(src as any as NamedContainer).Aname = `${src.hex.Aname}Source`;
    return src;
  }
}

/** special PathCard with no rule, never gets picked/placed,
 * just sits on PathCard.source.hex; acts as a button
 */
export class CardBack extends PathCard {
  static bColor = 'lightgreen'
  static oText = 'click\nto\ndraw';
  static nText = '\n';
  dim(dim = true) {
    this.dText.text = dim ? CardBack.nText : CardBack.oText;
    this.stage?.update()
  }

  constructor(public table: Table, text = CardBack.oText, color = CardBack.bColor) {
    super({ id: 'cardback', c: 0, d: text, e: '' })
    this.baseShape.paint(color)
  }
  // makeDragable(), but do not let it actually drag:
  override isDragable(ctx?: DragContext): boolean {
    return false;
  }
  override dropFunc(targetHex: IHex2, ctx: DragContext): void {
    // do not move or place this card...
  }
  clicked(evt?: MouseEvent) {
    if (!this.table) return; // printable CardBack...
    if (this.table.gamePlay.gameState.cardDone) return;

    if (PathCard.source.numAvailable === 0) PathCard.reshuffle();
    const card = PathCard.source.nextUnit();  // card.moveTo(srchex)
    if (card) {
      const pt = { x: evt?.localX ?? 0, y: evt?.localY ?? 0 }
      setTimeout(() => {
        this.dragNextCard(card, pt)
      }, 4);
    }
    return;
  }

  dragNextCard(card: PathCard, dxy = { x: 10, y: 10 }) {
    // this.table.dragger.clickToDrag(card);
    this.table.dragTarget(card, dxy)
  }
}

/** CardShape'd "Hex" for placement of PathCard */
export class CardHex extends Hex2 {
  /** record all CardHex for PathCard.markLegal() */
  static allCardHex = [] as CardHex[];
  constructor(map: HexMap2, row = 0, col = 0, Aname = '') {
    super(map, row, col, Aname)
    CardHex.allCardHex.push(this);
  }

  override makeHexShape(colorn = C.grey224): Paintable {
    return new CardShape(colorn);
  }

  // get card() { return this.tile as any as PathCard | undefined }

  // when sendHome() hits top of discard:
  // when dropFunc() hits C0
  override unitCollision(hexUnit: Tile, unit: Tile, isMeep?: boolean): void {
    const disc = PathCard.discard;
    if (this === disc.hex) {   // sendHome preempts to do this path:
      disc.availUnit(hexUnit as PathCard); // stack previous card; hexUnit.visible = false;
      disc.availUnit(unit as PathCard);    // push new card
      disc.nextUnit(unit as PathCard);     // pop into sourceHexUnit [unit.source = PC.discard]
    } else {
      hexUnit.moveTo(disc.hex);// discard previous card === hexUnit.sendHome()
    }
  }
}


/** auxiliary Panel to position a cardRack on the Table (or PlayerPanel). */
export class CardPanel extends NamedContainer {
  /**
   *
   * @param table
   * @param high rows high
   * @param wide columns wide
   * @param row place panel at [row, col]
   * @param col
   */
  constructor(public table: Table, public high: number, public wide: number, row = 0, col = 0) {
    super(`CardPanel`)
    const { dxdc, dydr } = table.hexMap.xywh()
    const w = dxdc * wide, h = dydr * high;
    const disp = this.disp = new RectShape({ w, h }, C.grey224, '');
    this.addChild(disp)
    table.hexMap.mapCont.hexCont.addChild(this);
    this.table.setToRowCol(this, row, col);
  }

  disp!: RectShape;

  paint(colorn: string, force?: boolean): Graphics {
    return this.disp.paint(colorn, force)
  }

  /** fill hexAry with row of CardHex above panel */
  fillAryWithCardHex(table: Table, panel: Container, hexAry: IHex2[], row = 0, ncols = 4) {
    const { w } = table.hexMap.xywh(); // hex WH
    const { width } = (new CardShape()).getBounds(); // PathCard.onScreenRadius
    const gap = .1 + (width / w) - 1;
    const hexes = table.hexesOnPanel(panel, row, ncols, CardHex, { gap });
    hexes.forEach((hex, n) => { hex.Aname = `C${n}`})
    hexAry.splice(0, hexAry.length, ...hexes);
  }

  isCardHex(hex: Hex2): hex is CardHex {
    return (hex instanceof CardHex)
  }

  readonly cardRack: CardHex[] = [];
  makeDragable(table: Table) {
    table.dragger.makeDragable(this, this, undefined, this.dropFunc);
  }
  /**
   * cardRack hexes are not children of this CardPanel.
   * Move them to realign when panel is dragged & dropped
   */
  dropFunc(dobj: DisplayObject, ctx?: DragInfo) {
    if (!ctx) return
    const orig = this.table.scaleCont.localToLocal(ctx.objx, ctx.objy, dobj.parent)
    const dx = dobj.x - orig.x, dy = dobj.y - orig.y;
    this.cardRack.forEach(hex => {
      hex.legalMark.x += dx;
      hex.legalMark.y += dy;
      hex.x += dx;
      hex.y += dy;
      if (hex.tile) { hex.tile.x += dx; hex.tile.y += dy }
      if (hex.meep) { hex.meep.x += dx; hex.meep.y += dy }
      hex.tile?.moveTo(hex); // trigger repaint/update?
    })
  }

  addCard(card?: PathCard) {
    const hex = this.cardRack.find(hex => !hex.tile)
    card?.placeTile(hex);
  }

  get rules() {
    return (this.cardRack.map(hex => hex.card).filter(card => !!card) as PathCard[]).map(card => card.rule)
  }
}
