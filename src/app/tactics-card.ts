import { C, permute, S, stime, type XY } from "@thegraid/common-lib";
import { CenterText, NamedContainer, RectShape, type DragInfo, type NamedObject, type Paintable } from "@thegraid/easeljs-lib";
import { Container, DisplayObject, Graphics, MouseEvent } from "@thegraid/easeljs-module";
import { H, Tile, TileSource, type DragContext, type HexDir, type IHex2 } from "@thegraid/hexlib";
import { CardShape } from "./card-shape";
import { type GamePlay } from "./game-play";
import type { GameState } from "./game-state";
import { ChaosHex2 as Hex2, type ChaosHex as Hex1, type HexMap2 } from "./chaos-hex";
import { type ChaosTable, type ChaosTable as Table } from "./chaos-table";
import { ChaosTile } from "./chaos-tile";
import type { Player } from "./player";
import { TP } from "./table-params";
import type { CountClaz } from "./tile-exporter";
import type { Text } from "@thegraid/easeljs-module";


// TODO: define rectange 'Tiles' to hold the Rule/Constraint/Bonus items.
type PhaseEffect = {
  phase: string;   // one of ChaosPhase: SetPrices, Discovery, Build, Harvest, Recruit, Move, Combat, Income, Relics
  text: string;    // presentation to Player
  eFunc: Function; // TBD
}
type CombatEffect = {
  text: string;    // presentation to Player
  eFunc: Function; // executable to implement whatever (before, during, after combat...)
}
// TODO: nLeft, nRight, combatEffect, phaseAndEffect
/** id: ident, d: description, nL: left#, nR: right#, cE: combatEffect, pE: PhaseEffect */
type CardSpec = {
  id: string, d: string, nL?: number, nR?: number, pE?: PhaseEffect, cE?: CombatEffect,
}
const Hdirs = TP.useEwTopo ? H.ewDirs : H.nsDirs;
const Hdir2 = Hdirs.slice(0, 3); // half of Hdirs

class SpecGen {
  // helper methods that are in scope here:
  m1() {}

  cardSpecs: CardSpec[] = [
    { id: "card1", d: "a card" },
    { id: "card2", d: "second card", nL: 1, nR: 3, pE: { phase: 'Harvest', text: 'gain 5 energy if you do not act in this phase', eFunc: ()=>{}} },
    { id: "card3", d: "third card", nL: 5, nR: 0, pE: { phase: 'Relics', text: 'gain 1 fame', eFunc: ()=>{}} },
  ];

  allSpecs(specs = this.cardSpecs) {
    return specs.map(cs => new TacticsCard(cs));
  }
}


export class TacticsCard extends Tile {
  static get allCards() { return Array.from(this.cardByName.values()) }
  static colorMap = { edge: 'lavender', own: 'yellow', atk: 'pink', spcl: C.grey224, };
  /** recompute if TP.hexRad has been changed */
  static get onScreenRadius() { return TP.hexRad * H.sqrt3 };
  /** out-of-scope parameter to this.makeShape(); vs trying to tweak TP.hexRad for: get radius() */
  static nextRadius = TacticsCard.onScreenRadius; // when super() -> this.makeShape()
  _radius = TacticsCard.nextRadius;           // when ChaosCard.constructor eventually runs
  override get radius() { return (this?._radius !== undefined) ? this._radius : TacticsCard.nextRadius }
  override get isMeep() { return true; }
  declare gamePlay: GamePlay;

  dText!: Text;
  nLeft!: number;          // set once: rs.nLeft
  nRight!: number;         // set once: rs.nRight
  phaseEffect?: PhaseEffect;
  combatEffect?: CombatEffect;

  // Tile { baseShape: RectShape , nameText, descr }
  // TileExporter supplies args = ...[rs, 750]
  constructor(rs: CardSpec, size?: number) {
    if (size !== undefined) TacticsCard.nextRadius = size; // set before super calls makeShape()
    super(TacticsCard.uniqueId(rs.id))      // Note: may need to tweak cache/reCache algo
    this.nameText.y += this.radius * .12;
    // maybe paint() per phaseEffect:
    // this.paint(TacticsCard.colorMap[this.rule.type])
    this.addChildren(rs)
    TacticsCard.cardByName.set(this.Aname, this);  // Aname from CardSpec.id
    this.homeHex = TacticsCard.discard.hex; // unitCollision will stack if necessary.
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

  /**
   * Put bits for CardSpec into this TacticsCard.
   *
   * build up image of TacticsCard in this Tile > NamedContainer.
   */
  addChildren(rs: CardSpec) {
    const { x, y, width, height } = this.getBounds()
    const rad = width * .5, textX = width / 2 * .72, textY = height / 2 * .72;
    const dSize = Math.min(height, width) * .2;
    const setText = (txt: string, x = 0, y = 0, fs = dSize) => {
      const ctext = new CenterText(txt, fs);   // center & middle
      ctext.lineWidth = width * .9;   // wrap when needed; we may want textTweaks (citymap, hexcity, whist, cubitos, gambit)
      ctext.x = x; ctext.y = y;
      this.addChild(ctext);
      return ctext;
    }
    const xc = x + width/2;
    const xl = x + dSize + 2 * dSize;
    const xr = x + width - 2 * dSize;
    const ytop = y + dSize + 20;  //
    const ycom = y - 4 * dSize;   // y for combat effect
    const ypha = y + height - 40;   // y for phase effect
    const ybot = y + width - 1 * dSize;

    this.nLeft = rs.nL ?? 0;       // combat buff value
    this.nRight = rs.nR ?? 0;      // combat buff value
    setText(`${rs.nL}`, xl, ytop);
    setText(`${rs.nR}`, xr, ytop);

    // a description?
    this.dText = setText(rs.d ?? rs.id, xc, ybot, dSize - 2);
    setText(rs.cE?.text ?? '', xl, ycom);
    setText(rs.pE?.text ?? '', xl, ypha);
    this.phaseEffect = rs.pE;
    this.combatEffect = rs.cE;
  }

  // Identify il-legal sources of fromHex:
  override cantBeMovedBy(player: Player, ctx: DragContext): string | boolean | undefined {
    if (this.fromHex === TacticsCard.source.hex) return undefined;
    const gameState = ctx.gameState as GameState, table = gameState.table as ChaosTable;
    if (table.cardRack.includes(this.fromHex as Hex2)) return 'rule in play';
    const isDoneCard = (gameState.cardDone === this);
    if (!isDoneCard && this.fromHex === table.cardDiscard.hex) return 'discarded';
    return undefined; // player.cardRack OR (discard && isDoneCard)
  }

  override markLegal(table: Table, setLegal = (hex: Hex2) => { hex.setIsLegal(false); }, ctx?: DragContext): void {
    table.gamePlay.curPlayer.cardRack.forEach(setLegal)
    setLegal(table.cardRack[0])
    setLegal(TacticsCard.discard.hex as Hex2)
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
    if (ctx.targetHex == TacticsCard.source.hex) ctx.targetHex = TacticsCard.discard.hex as Hex2
    super.showTargetMark(hex, ctx)
  }

  override dropFunc(targetHex: IHex2, ctx: DragContext): void {
    const toHex = targetHex as Hex2, card = toHex.card;
    if (card && card !== this) card.moveCard(toHex, ctx);
    super.dropFunc(targetHex ?? TacticsCard.discard.hex, ctx);
    if (!TacticsCard.discard.sourceHexUnit) TacticsCard.discard.nextUnit(); // reveal discard
    TacticsCard.discard.updateCounter();
    TacticsCard.source.updateCounter();
    ctx.targetHex?.map.showMark(undefined); // if (this.fromHex === undefined)
    // maybe set gameState.cardDone
    const gameState = ctx.gameState as GameState, fromHex = this.fromHex as Hex2;
    const plyr = (gameState.curPlayer as Player)
    const selfDrop = (fromHex == toHex);
    const rackSwap = plyr.rackSwap(this.fromHex, targetHex, plyr.cardRack)
    const discard = plyr.cardRack.includes(fromHex) && (toHex == TacticsCard.discard.hex)
    if (selfDrop || rackSwap || discard) return;
    {
      setTimeout(() => {
        gameState.cardDone = this; // triggers setNextPlayer; which confuses markLegal()
      }, 0);
    }
  }

  override moveTo(hex: Hex1 | undefined): void {
    super.moveTo(hex)
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

      const move1 = (card: TacticsCard, ndx: number) => {
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
    const specs = [] as CardSpec[];    // TODO: find all the CardSpec and iterate
    return specs.map(rs => [n, TacticsCard, rs, 525] as CountClaz)
  }
  static cardByName: Map<string,TacticsCard> = new Map();
  static uniqueId(rsid: string) {
    let id = rsid, n = 1;
    while (TacticsCard.cardByName.has(id)) { id = `${rsid}#${++n}` }
    return id;
  }
  // TODO: we need one CardSource as the draw pile of TacticsCard.
  static makeCardSources(table: Table, rowcol: { row?: number, col?: number }) {
    CardHex.allCardHex.length = 0; // clear before we make all the new CardHex.
    const { row, col } = { row: 1.9, col: 1, ...rowcol }
    table.makeSourceAtRowCol(TacticsCard.makeSource, 'discards', row + 1.8, col, { x: 0, y: .6 }, CardHex)
    TacticsCard.discard = TacticsCard.source;
    ;(TacticsCard.discard as any as NamedContainer).Aname = 'PathCardDiscard';
    table.makeSourceAtRowCol(TacticsCard.makeSource, 'cardDeck', row + 0.0, col, { x: 0, y: .6 }, CardHex)

    const cardback = table.cardBack = new CardBack(table); // it a Button, mostly.
    cardback.moveTo(TacticsCard.source.hex as Hex1); // set position above source.hex
    cardback.moveTo(undefined);
    cardback.on(S.click, (evt) => cardback.clicked(evt), cardback )
    return [TacticsCard.source, TacticsCard.discard];
  }

  static makeAllCards(...specs: CardSpec[]) {
    TacticsCard.cardByName.clear();
    const allCards = new SpecGen().allSpecs(specs); // are injected into TacticsCard.allCards
    permute(allCards);
    // enqueue all the cards on source:
    const source = TacticsCard.source;
    allCards.forEach(card => source.availUnit(card, true));
  }

  static reshuffle() {
    // assert: src.sourceHexUnit === undefined [else we would not be shuffling...]
    const disc = TacticsCard.discard, src = TacticsCard.source;
    const discarded = disc.filterUnits() // extract all available units (with sourceHexUnit)
    discarded.forEach(card => {
      disc.deleteUnit(card);
      src.availUnit(card);
    });
    src.permuteAvailable()
  }

  /** sendHome (or drop card) on discard to accumulate for later reshuffle. */
  static discard: TileSource<TacticsCard>;
  static source: TileSource<TacticsCard>;

  static makeSource(hex: IHex2) {
    const src = TacticsCard.makeSource0(TileSource<TacticsCard>, TacticsCard, hex);
    ;(src as any as NamedContainer).Aname = `${src.hex.Aname}Source`; // put an Aname on it
    return src;
  }
}

/** special PathCard with no rule, never gets picked/placed,
 * just sits on PathCard.source.hex; acts as a button
 */
export class CardBack extends TacticsCard {
  static bColor = 'lightgreen'
  static oText = 'click\nto\ndraw';
  static nText = '\n';
  dim(dim = true) {
    this.dText.text = dim ? CardBack.nText : CardBack.oText;
    this.stage?.update()
  }

  constructor(public table: Table, text = CardBack.oText, color = CardBack.bColor) {
    super({ id: 'cardback', d: text })
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

    if (TacticsCard.source.numAvailable === 0) TacticsCard.reshuffle();
    const card = TacticsCard.source.nextUnit();  // card.moveTo(srchex)
    if (card) {
      const pt = { x: evt?.localX ?? 0, y: evt?.localY ?? 0 }
      setTimeout(() => {
        this.dragNextCard(card, pt)
      }, 4);
    }
    return;
  }

  dragNextCard(card: TacticsCard, dxy = { x: 10, y: 10 }) {
    // this.table.dragger.clickToDrag(card);
    this.table.dragTarget(card, dxy)
  }
}

/** CardShape'd "Hex" for placement of TacticsCard */
export class CardHex extends Hex2 {
  /** record all CardHex for TacticsCard.markLegal() */
  static allCardHex = [] as CardHex[];
  constructor(map: HexMap2, row = 0, col = 0, Aname = '') {
    super(map, row, col, Aname)
    CardHex.allCardHex.push(this);
  }

  override makeHexShape(colorn = C.grey224): Paintable {
    return new CardShape(colorn);
  }

  // get card() { return this.tile as any as TacticsCard | undefined }

  // when sendHome() hits top of discard:
  // when dropFunc() hits C0
  override unitCollision(hexUnit: Tile, unit: Tile, isMeep?: boolean): void {
    const disc = TacticsCard.discard;
    if (this === disc.hex) {   // sendHome preempts to do this path:
      disc.availUnit(hexUnit as TacticsCard); // stack previous card; hexUnit.visible = false;
      disc.availUnit(unit as TacticsCard);    // push new card
      disc.nextUnit(unit as TacticsCard);     // pop into sourceHexUnit [unit.source = PC.discard]
    } else {
      hexUnit.moveTo(disc.hex);// discard previous card === hexUnit.sendHome()
    }
  }
}


/** auxiliary Panel to position a cardRack on the Table (or PlayerPanel). */
// TODO: review how Ankh made hidden panels
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

  addCard(card?: TacticsCard) {
    const hex = this.cardRack.find(hex => !hex.tile)
    card?.placeTile(hex);
  }

  /** get all the phaseEffects */  // TODO: change the name or maybe remove
  get rules() {
    return (this.cardRack.map(hex => hex.card).filter(card => !!card) as TacticsCard[]).map(card => card.phaseEffect)
  }
}
