import { C, permute, S, stime, type Constructor, type XY } from "@thegraid/common-lib";
import { CenterText, NamedContainer, RectShape, type DragInfo, type NamedObject, type Paintable } from "@thegraid/easeljs-lib";
import { Container, DisplayObject, Graphics, MouseEvent } from "@thegraid/easeljs-module";
import { H, HexCont, LegalMark, MapCont, NumCounter, Tile, TileSource, type DragContext, type HexDir, type IHex2, type Player as PlayerLib } from "@thegraid/hexlib";
import { CardShape } from "./card-shape";
import { type GamePlay } from "./game-play";
import type { GameState } from "./game-state";
import { ChaosHex2 as Hex2, type ChaosHex, type ChaosHex2, type ChaosHex as Hex1, type HexMap2 } from "./chaos-hex";
import { type ChaosTable, type ChaosTable as Table } from "./chaos-table";
import type { ChaosPlayerPanel, Player } from "./player";
import { TP } from "./table-params";
import type { CountClaz } from "./tile-exporter";
import type { Text } from "@thegraid/easeljs-module";

// Temporary, should be in GamePlay
const phaseNames = ['SetPrices', 'Discovery', 'Build', 'Harvest', 'Recruit', 'Move', 'Combat', 'Income', 'Relic',] as const;
type ChaosPhase = typeof phaseNames[number];

// TODO: define rectange 'Tiles' to hold the Rule/Constraint/Bonus items.
type PhaseEffect = {
  phase: ChaosPhase | 'back';   // one of ChaosPhase: SetPrices, Discovery, Build, Harvest, Recruit, Move, Combat, Income, Relics
  text: string;    // presentation to Player
  eFunc: Function; // TBD
}
type CombatEffect = {
  text: string;    // presentation to Player
  eFunc: Function; // executable to implement whatever (before, during, after combat...)
}

/** id: ident, d: description, pE: PhaseEffect, cE: combatEffect, nL: left#, nR: right#, */
type CardSpec = {
  id: string, d: string, pE: PhaseEffect, cE?: CombatEffect, nL?: number, nR?: number,
}
const Hdirs = TP.useEwTopo ? H.ewDirs : H.nsDirs;
const Hdir2 = Hdirs.slice(0, 3); // half of Hdirs

class SpecGen {
  // helper methods that are in scope here:
  m1() {}

  cardSpecs: CardSpec[] = [
    { id: "card1", d: "redloy", pE: { phase: 'Move', text: '1 Redeploy before moving', eFunc: () => {}}, cE: { text: 'combat1', eFunc: () =>{}} },
    { id: "card2", d: "5 Energy", nL: 1, nR: 3, pE: { phase: 'Harvest', text: 'Gain 5 energy if you do not act in this phase', eFunc: ()=>{}}, cE: { text: 'combat2', eFunc: () =>{}} },
    { id: "card3", d: "Gain Fame", nL: 5, nR: 0, pE: { phase: 'Relic', text: 'Gain 1 Fame', eFunc: ()=>{}}, cE: { text: 'combat3', eFunc: () =>{}} },
  ];

  /** new TacticsCard(cardSpec) for each cardSpec. */
  allSpecs(specs = this.cardSpecs) {
    return specs.map(cs => new TacticsCard(cs));
  }
}


export class TacticsCard extends Tile {
  static get allCards() { return Array.from(this.cardByName.values()) }
  // map from phase to a color

  static colorMap: Partial<Record<ChaosPhase | 'back', string>> = {
    Discovery: 'lavender', Build: 'blue', Harvest: 'lightgreen', back: 'lightblue',
    Recruit: 'orange', Move: 'yellow', Combat: 'pink', Income: 'green', Relic: C.grey224,
  };
  /** recompute if TP.hexRad has been changed */
  static get onScreenRadius() { return TP.hexRad * H.sqrt3 };
  /** out-of-scope parameter to this.makeShape(); vs trying to tweak TP.hexRad for: get radius() */
  static nextRadius = TacticsCard.onScreenRadius; // when super() -> this.makeShape()
  _radius = TacticsCard.nextRadius;           // when ChaosCard.constructor eventually runs
  override get radius() { return (this?._radius !== undefined) ? this._radius : TacticsCard.nextRadius }
  override get isMeep() { return true; }
  declare gamePlay: GamePlay;

  dText!: Text;            // descriptive text, name? id?
  nLeft!: number;          // set once: rs.nLeft
  nRight!: number;         // set once: rs.nRight
  phaseEffect!: PhaseEffect;
  combatEffect?: CombatEffect;

  // Tile { baseShape: RectShape , nameText, descr }
  // TileExporter supplies args = ...[rs, 750]
  constructor(cs: CardSpec, size?: number) {
    if (size !== undefined) TacticsCard.nextRadius = size; // set before super calls makeShape()
    super(TacticsCard.uniqueId(cs.id!))      // Note: may need to tweak cache/reCache algo
    this.nameText.y += this.radius * .12;    // = radius * (.5 + .12)
    // maybe paint() per phaseEffect:
    this.addChildren(cs)
    this.paint(TacticsCard.colorMap[this.phaseEffect?.phase])
    TacticsCard.cardByName.set(this.Aname, this);  // Aname from CardSpec.id
    this.homeHex = TacticsCard.discard.hex; // unitCollision will stack if necessary.
  }

  // invoked by constructor.super()
  override makeShape() {
    return new CardShape('lavender', C.BLACK, this.radius); // color reset by colorMap[phaseEffect.phase]
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
  addChildren(cs: CardSpec) {
    const { x, y, width, height } = this.getBounds()
    const dSize = Math.min(height, width) * .04;
    const fSize = dSize * 3;
    const setText = (txt: string, x = 0, y = 0, fs = fSize) => {
      const ctext = new CenterText(txt, fs);   // center & middle
      ctext.lineWidth = width * .9;   // wrap when needed; we may want textTweaks (citymap, hexcity, whist, cubitos, gambit)
      ctext.x = x; ctext.y = y;
      this.addChild(ctext);
      return ctext;
    }
    const xc = x + width/2;
    const xn = width * .35;
    const xl = xc - xn;
    const xr = xc + xn;
    const ytop = y + fSize * .95;  // for numbers
    const ycom = y + height - fSize * 8.1;   // y for combat effect
    const ypha = y + height - fSize * 5.1;   // y for phase effect
    const ybot = y + height - 1 * fSize;
    const itext = cs.d ?? cs.id ?? '??';
    const ctext = `${cs.cE?.text ?? ''}`;
    const ptext = `${cs.pE.phase}: ${cs.pE.text}`;

    this.nLeft = cs.nL ?? 0;       // combat buff value
    this.nRight = cs.nR ?? 0;      // combat buff value
    setText(`${cs.nL ?? '0' }`, xl, ytop);
    setText(`${cs.nR ?? '0' }`, xr, ytop);

    setText(ctext, xc, ycom);
    setText(ptext ?? '', xc, ypha);
    this.dText = setText(itext, xc, ytop, fSize - 2); // describe/id the card; CardBack.dim()
    this.phaseEffect = cs.pE;
    this.combatEffect = cs.cE;
  }

  // Identify il-legal sources of fromHex:
  override cantBeMovedBy(player: Player, ctx: DragContext): string | boolean | undefined {
    if (this.fromHex === TacticsCard.source.hex) return undefined;
    const gameState = ctx.gameState as GameState, table = gameState.table as ChaosTable;
    if (this.fromHex === table.cardDiscard.hex) return 'discarded';
    return undefined; // player.cardRack OR (discard && isDoneCard)
  }

  override markLegal(table: Table, setLegal = (hex: Hex2) => { hex.setIsLegal(false); }, ctx?: DragContext): void {
    table.gamePlay.curPlayer.cardRack.forEach(setLegal)
    setLegal(TacticsCard.discard.hex as Hex2)
  }

  // The only "card moves" are:
  // Gain TacticsCard: table.cardDeck -> auto-drop(player.cardRack)
  // Discard Card:    player.cardRack -> discard(Play)
  // Rearrange Cards: player.cardRack -> player.cardRack(rearrange)
  // Play phase Card: player.cardRack -> table.discard (in Phase)
  // Use Combat Card: player.cardRack -> player.combatWheel(for Combat)
  // Spurious click:  table.discard   -> discard, player.cardRack (undo-discard?, look behind?)
  override isLegalTarget(toHex: Hex2, ctx: DragContext): boolean {
    // Ok to move from player.cardRack (to rearrange?)
    const gameState = ctx.gameState as GameState;
    return true;
  }

  override showTargetMark(hex: IHex2 | undefined, ctx: DragContext): void {
    if (ctx.targetHex == TacticsCard.source.hex) ctx.targetHex = TacticsCard.discard.hex as Hex2
    super.showTargetMark(hex, ctx)
  }

  // TODO: draw card to player's 'hand'
  // Player can drag it to discard pile during appropriate phase: eval effect
  // or drag it to combat wheel during Combat (discard after Combat)
  //
  override dropFunc(targetHex: IHex2, ctx: DragContext): void {
    const toHex = targetHex as Hex2, card = toHex.card;
    if (card && card !== this) card.moveCard(toHex, ctx);
    super.dropFunc(targetHex ?? TacticsCard.discard.hex, ctx);
    if (this.hex === TacticsCard.discard.hex) {
      TacticsCard.discard.availUnit(this);
    }
    if (!TacticsCard.discard.sourceHexUnit) TacticsCard.discard.nextUnit(); // reveal discard
    TacticsCard.discard.updateCounter();
    TacticsCard.source.updateCounter();
    ctx.targetHex?.map.showMark(undefined); // if (this.fromHex === undefined)
  }

  override moveTo(hex: Hex1 | undefined): void {
    super.moveTo(hex)
  }

  /** hex contains card, which needs to be moved: */
  moveCard(hex: Hex2, ctx: DragContext) {
    // if hex is 'discards' --> let unitCollision stack them on source.available
    // if hex in player.cardRack[]: card.sendHome()
    // if hex is table.cardRack[0]: shift all cards up
    if (hex == TacticsCard.discard.hex) return;
    const plyr = ctx.gameState?.curPlayer as Player | undefined;
    if (plyr?.cardRack.includes(hex)) {
      const alt = plyr.cardRack.findIndex(hex => !hex.card)
      if (alt < 0) {
        this.sendHome(); // move player card to discards
      } else {
        this.moveTo(plyr.cardRack[alt]); // swap into empty slot
      }
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
  /** make draw pile and discard pile for TacticsCard */
  static makeCardSources(table: Table, rowcol: { row?: number, col?: number }) {
    CardHex.allCardHex.length = 0; // clear before we make all the new CardHex.
    const { row, col } = { row: 1.9, col: 1, ...rowcol }
    table.makeSourceAtRowCol(TacticsCard.makeSource, 'discards', row + 0.0, col + 1.5, { x: .5, y: 1.0 }, CardHex)
    TacticsCard.discard = TacticsCard.source;
    // overwrite readonly Aname; else: class DiscardHex { that names itself... }
    ;(TacticsCard.discard as any as NamedContainer).Aname = 'TacticsCardDiscard';
    table.makeSourceAtRowCol(TacticsCard.makeSource, 'cardDeck', row + 0.0, col, { x: .5, y: 1.0 }, CardHex)

    const discback = new CardBack(table, 'discard', '', '#aabbcc59');
    discback.moveTo(TacticsCard.discard.hex as Hex1); // set position above source.hex
    discback.moveTo(undefined);
    discback.removeAllChildren(); discback.addChild(discback.baseShape); // just the baseShape

    const cardback = table.cardBack = new CardBack(table, 'cardback'); // it a Button, mostly.
    cardback.moveTo(TacticsCard.source.hex as Hex1); // set position above source.hex
    cardback.moveTo(undefined);
    cardback.on(S.click, (evt) => cardback.clicked(evt), cardback )
    return [TacticsCard.source, TacticsCard.discard];
  }

  static makeAllCards(...specs: CardSpec[]) {
    const specGen = new SpecGen();
    if (specs.length === 0) specs = specGen.cardSpecs;
    TacticsCard.cardByName.clear();
    const allCards = specGen.allSpecs(specs); // are injected into TacticsCard.allCards
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

  // invoked by Table.makeSourceAtRowCol()
  static makeSource(hex: IHex2) {
    const src = TacticsCard.makeSource0(TacticsTileSource, TacticsCard, hex);
    ;(src as any as NamedContainer).Aname = `${src.hex.Aname}Source`; // rename readonly Aname
    return src;
  }
}

class TacticsTileSource<T extends TacticsCard> extends TileSource<T> {
  /** adjust fontsize and color of counter */
  override makeCounter(name: string, initValue?: number, color?: string, fontSize?: number, fontName?: string, textColors?: string[]): NumCounter {
    return new NumCounter('cardCounter', initValue, 'white', 12);
  }
}

/** special TacticsCard with no rule, never gets picked/placed,
 * just sits on TacticsCard.source.hex; acts as a button: clickToDraw
 */
export class CardBack extends TacticsCard {
  static bColor = TacticsCard.colorMap.back;
  static oText = 'click\nto\ndraw';
  static nText = 'DIM\n';
  dim(dim = true) {
    this.dText.text = dim ? CardBack.nText : CardBack.oText;
    this.stage?.update()
  }

  constructor(public table: Table, id = 'cardback', text = CardBack.oText, color = CardBack.bColor) {
    const backEffect: PhaseEffect = {
      phase: 'back',
      text: CardBack.oText,
      eFunc: () => {},
    }
    super({ id, d: text, pE: backEffect })
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
    const source = TacticsCard.source;
    if (source.numAvailable === 0) TacticsCard.reshuffle();
    const card = source.nextUnit();  // card.moveTo(srchex)
    console.log(stime(this, `.clicked`), `source.numAvailable: ${source.numAvailable}`)
    if (source.numAvailable === 0) {
      this.dim(true); // indicate stack is empty
    }
    if (card) {
      const pt = { x: evt?.localX ?? 0, y: evt?.localY ?? 0 }
      setTimeout(() => {
        this.dragNextCard(card, pt)
      }, 4);   // exit click context, new thread for dragging
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
  override unitCollision(unitOnHex: Tile, unitToHex: Tile, isMeep?: boolean): void {
    const disc = TacticsCard.discard;
    if (this === disc.hex) {   // sendHome preempts to do this path:
      disc.availUnit(unitOnHex as TacticsCard);    // stack previous card; hexUnit.visible = false;
      disc.availUnit(unitToHex as TacticsCard);    // push new card (redundant: nextUnit() does it implicity)
      disc.nextUnit(unitToHex as TacticsCard);     // pop into sourceHexUnit [unit.source = PC.discard]
    } else {
      unitOnHex.moveTo(disc.hex);// discard previous card === hexUnit.sendHome()
    }
  }
}


/** auxiliary Panel to position a cardRack on the Table (or PlayerPanel). */
// TODO: review how Ankh made hidden panels
// TODO: move to player.ts (coresident with its parent ChaosPlayerPanel)
export class CardPanel extends MapCont {

  /**
   * A Container on table.map.mapCont.hexMap
   * @param table
   * @param high rows high
   * @param wide columns wide
   * @param row place panel at [row, col]
   * @param col
   */
  constructor(public table: Table, public high: number, public wide: number, row = 0, col = 0) {
    super(`CardPanel`)
    this.addContainers(['hexCont', 'tileCont', 'markCont']);

    const { dxdc, dydr } = table.hexMap.xywh()
    const w = dxdc * wide, h = dydr * high;
    this.disp = new RectShape({ w, h }, C.grey224, '');
    this.addChildAt(this.disp, 0);
    table.hexMap.mapCont.addChild(this);
  }

  disp!: RectShape;

  paint(colorn: string, force?: boolean): Graphics {
    return this.disp.paint(colorn, force)
  }

  // TODO: extend table.dragFunc and/or objectUnderPoint to scan our playerPanel.cardPanel (& buildingPanels)
  // buildings don't need much D&D, just need self-drop, but then same for tacticsCards,
  // except for rearrange; which is handled by unitCollision & tileSource?
  //
  // The goal is to have cards on cardPanel that we can scale up to view,
  // and drag the cards from there to play/discard or use/combat or rearrange.
  // So: TacticsCard.dragFunc & TacticsCard.dropFunc should suffice?
  // The only 'legalTarget' is discard; else self-drop.
  // Note: table.dragStart sets Tile.fromHex and start of drag, and inserts as ctx.targetHex
  // then updates ctx.targetHex when object[0,0] is over a legal target.
  // using hex.hexUnderObj(x,y,legalOnly) <--- specialize to look at playerPanel.cardPanel (then super for discard on markCont)

  // treat cardPanel as a mapCont, with sub-cont for hexCont & markCont


  /** fill hexAry with row of CardHex above panel */
  fillAryWithCardHex(panel: ChaosPlayerPanel, hexAry: IHex2[], row = 0, ncols = 4) {
    const { w } = panel.hexMap.xywh(); // hex WH (per hexRad & topoNS/EW)
    const { width } = (new CardShape()).getBounds(); // TacticsCard.onScreenRadius
    const gap = .1 + (width / w) - 1;  // allocate space to fill
    const hexes = panel.hexesOnMapCont(row, ncols, CardHex, { gap }); // was hexesOnPanel()
    hexAry.splice(0, hexAry.length, ...hexes);
  }

  isCardHex(hex: Hex2): hex is CardHex {
    return (hex instanceof CardHex)
  }

  readonly cardRack: CardHex[] = [];

  /** make this CardPanel dragable. */
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
