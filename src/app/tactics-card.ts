import { C, permute, S, stime, type XY } from "@thegraid/common-lib";
import { CenterText, RectShape, type CountClaz, type DragInfo, type Paintable } from "@thegraid/easeljs-lib";
import type { Text } from "@thegraid/easeljs-module";
import { DisplayObject, Graphics, MouseEvent } from "@thegraid/easeljs-module";
import { H, LegalMark, MapCont, NumCounter, Tile, TileSource, TP, type DragContext, type HasDragger, type IHex2 } from "@thegraid/hexlib";
import { CardShape } from "./card-shape";
import { ChaosHex2 as Hex2, type ChaosHex as Hex1, type HexMap2 } from "./chaos-hex";
import type { ChaosTable as Table } from "./chaos-table";
import type { Battle, BattleSAD, GamePlay } from "./game-play";
import type { GameState } from "./game-state";
import type { Panel, Player } from "./player";

// Temporary, should be in GamePlay
const phaseNames = ['SetPrices', 'Discovery', 'Build', 'Harvest', 'Recruit', 'Move', 'Combat', 'Income', 'Relic',] as const;
type ChaosPhase = typeof phaseNames[number];

/** id: ident, d: description, pE: PhaseEffect, cE: combatEffect, nL: left#, nR: right#, */
type CardSpec = {
  id?: string, phase: ChaosPhase, ptext: string, ctext?: string, nL: number, nR: number,
  // Note: nL, nR code 'X' as 8;
  pFunc?: Function; // TBD
  cFunc?: Function; // executable to implement whatever (before, during, after combat...)
}

export class SpecGen {
  constructor(gamePlay: GamePlay) {
    this.gamePlay = gamePlay;
  }

  gamePlay!: GamePlay; // context for pE when Played during phase
  setBattle(battle: Battle, sad: BattleSAD) {
    this.battle = battle;
    this.sad = sad;
  }
  sad!: BattleSAD;     // context for cE when Used during Combat
  battle!: Battle;
  // helper methods that are in scope here:
  m1() {}

  cardSpecs: CardSpec[] = [
    { phase: 'Discovery', nL: 3, nR: 1, ptext: "*TAKE THE DISCOVER ACTION WITHOUT PAYING ANY ENERGY", ctext: "GAIN 2 TACTICS CARDS IF YOU LOSE WITHOUT RETREATING", },
    { phase: 'Discovery', nL: 4, nR: 1, ptext: "*RESEARCH POINTS MAY BE SPENT TO DEPLOY OR UPGRADE LEADERS", ctext: "RETURN 1 OF YOUR LEADERS TO BASE IF THEY ARE DEFEATED", },
    { phase: 'Discovery', nL: 5, nR: 0, ptext: "*GAIN 1 RESEARCH ON THE DISCOVER TRACK BEFORE ACTING OR PASSING", ctext: "", },
    { phase: 'Discovery', nL: 0, nR: 4, ptext: "SPEND 2 ENERGY TO GAIN 2 GEMS IF YOU ACT IN THIS PHASE", ctext: "GAIN 1 TACTICS CARD IF YOU ROLL ANY $D", },
    { phase: 'Discovery', nL: 0, nR: 3, ptext: "GAIN 2 TACTICS CARDS IF YOU DO NOT ACT IN THIS PHASE", ctext: "GAIN 1 RESEARCH IF VICTORIOUS AGAINST AN OPPOSING LEADER OR RHY-ZU", },
    { phase: 'Discovery', nL: 1, nR: 3, ptext: "GAIN 4 ENERGY IF YOU DO NOT ACT IN THIS PHASE", ctext: "GAIN 3 ENERGY IF YOU LOSE WITHOUT RETREATING", },
    { phase: 'Build', nL: 0, nR: 3, ptext: "*TAKE THE BUILD ACTION WITHOUT PAYING ANY ENERGY", ctext: "2 $S IF THERE IS AT LEAST 1 OPPOSING BUILDING IN THIS BATTLE", },
    { phase: 'Build', nL: 2, nR: 2, ptext: "*CONSTRUCT 1 OUTPOST IF YOU DO NOT ACT IN THIS PHASE", ctext: "GAIN 1 ENERGY PER FIGHTER YOU WOUND", },
    { phase: 'Build', nL: 2, nR: 2, ptext: "*GAIN 1 RESEARCH ON THE BUILD TRACK BEFORE ACTING OR PASSING THIS PHASE", ctext: "1 $S PER OPPOSING BUILDING IN THIS BATTLE", },
    { phase: 'Build', nL: 3, nR: 1, ptext: "DOUBLE THE BUILDING LOCATION REWARD WHEN CONSTRUCTING A BUILDING", ctext: "2 $A IF YOU HAVE A BUILDING PRESENT", },
    { phase: 'Build', nL: 3, nR: 0, ptext: "CONSTRUCT 1 FOUNDATION IF YOU DO NOT ACT IN THIS PHASE", ctext: "1 $S + 1 $A", },
    { phase: 'Build', nL: 1, nR: 4, ptext: "GAIN 4 ENERGY IF YOU DO NOT ACT IN THIS PHASE", ctext: "", },
    { phase: 'Build', nL: 3, nR: 0, ptext: "GAIN 1 GEM AND PAY 1 FEWER GEM WHEN CONSTRUCTING A BUILDING", ctext: "3 $D IF YOU HAVE A BUILDING PRESENT", },
    { phase: 'Build', nL: 3, nR: 0, ptext: "PAY 3 FEWER ENERGY WHEN TAKING THE AUXILLARY ACTION", ctext: "GAIN 1 RESEARCH IF YOU RAZE 1 OR MORE BUILDINGS", },
    { phase: 'Build', nL: 0, nR: 4, ptext: "YOU HAVE A TEMPORARY BOOST OF 2 RESEARCH ON THE BUILD TRACK FOR THIS ACTION", ctext: "2 $D IF YOU HAVE FEWER UNITS THAN YOUR OPPONENT", },
    { phase: 'Harvest', nL: 2, nR: 2, ptext: "*TAKE THE HARVEST ACTION WITHOUT PAYING ANY ENERGY", ctext: "KEEP THIS TACTICS CARD IF YOU ARE VICTORIOUS", },
    { phase: 'Harvest', nL: 0, nR: 4, ptext: "*UPGRADE 1 LEADER IF YOU DO NOT ACT IN THIS PHASE", ctext: "YOU MAY UPGRADE A LEADER WITH A 1-GEM DISCOUNT IF THEY ARE DEFEATED", },
    { phase: 'Harvest', nL: 2, nR: 8, ptext: "*GAIN 1 RESEARCH ON THE BUILD HARVEST BEFORE ACTING OR PASSING THIS PHASE", ctext: "X = ROLLED $S\n(X = 1 IF FIGHTING WITHOUT A DIE)", },
    { phase: 'Harvest', nL: 1, nR: 3, ptext: "GAIN 1 ENERGY AND 1 HARVEST POINT IF YOU ACT IN THIS PHASE", ctext: "GAIN 1 GEM IF YOU LOSE WITHOUT RETREATING", },
    { phase: 'Harvest', nL: 0, nR: 3, ptext: "GAIN 2 GEMS AND 1 TACTICS CARDS IF YOU DO NOT ACT IN THIS PHASE", ctext: "IF ROLLING A DIE IN THIS BATTLE ALL ROLLED $S ALSO COUNT AS $D", },
    { phase: 'Harvest', nL: 0, nR: 3, ptext: "GAIN 4 ENERGY IF YOU DO NOT ACT IN THIS PHASE", ctext: "IF ROLLING A DIE IN THIS BATTLE ALL ROLLED $S ALSO COUNT AS $A", },
    { phase: 'Harvest', nL: 2, nR: 2, ptext: "GAIN 2 ENERGY AND 1 RECRUITMENT POINT IF YOU ACT IN THIS PHASE", ctext: "KEEP THIS TACTICS CARD IF YOU LOSE WITHOUT RETREATING", },
    { phase: 'Harvest', nL: 1, nR: 3, ptext: "FOR EACH GEM YOU HARVEST FROM THE MAP, GAIN 1 MORE", ctext: "2 $A IF ROLLING A DIE IN THIS BATTLE", },
    { phase: 'Recruit', nL: 2, nR: 2, ptext: "*TAKE THE RECRUIT ACTION WITHOUT PAYING ANY ENERGY", ctext: "2 $D", },
    { phase: 'Recruit', nL: 1, nR: 3, ptext: "*GAIN 1 RESEARCH ON THE RECRUIT TRACK BEFORE ACTING OR PASSING THIS PHASE", ctext: "2 $A IF YOU COMMAND AT LEAST 1 LEADER OR RHY-ZU IN THIS BATTLE", },
    { phase: 'Recruit', nL: 3, nR: 1, ptext: "GAIN 2 ADDITIONAL RECRUITMENT POINTS IF YOU ACT IN THIS PHASE", ctext: "GAIN 2 RECRUITMENT POINTS IF YOU LOSE WITHOUT RETREATING", },
    { phase: 'Recruit', nL: 8, nR: 2, ptext: "RECRUIT A LEADER IF YOU DO NOT ACT IN THIS PHASE", ctext: "X = ROLLED $S\n(X = 1 IF FIGHTING WITHOUT A DIE)", },
    { phase: 'Recruit', nL: 3, nR: 2, ptext: "GAIN 4 ENERGY IF YOU DO NOT ACT IN THIS PHASE", ctext: "GAIN 3 ENERGY IF FIGHTING WITHOUT A DIE", },
    { phase: 'Recruit', nL: 3, nR: 1, ptext: "MAKE 1 REDEPLOYMENT IF YOU ACT IN THIS PHASE", ctext: "GAIN 1 RECRUITMENT POINT FOR EACH OF YOUR WOUNDED FIGHTERS", },
    { phase: 'Recruit', nL: 3, nR: 0, ptext: "IMMEDIATELY GAIN 1 GEM AND PAY 1 FEWER GEM IF YOU RECRUIT A LEADER", ctext: "2 $S IF YOU HAVE NO FIGHTERS OR BUILDINGS PRESENT", },
    { phase: 'Recruit', nL: 4, nR: 0, ptext: "PAY 3 FEWER ENERGY WHEN RECRUITING A LEADER", ctext: "2 $D IF YOU COMMAND AT LEAST 1 LEADER OR RHY-ZU IN THIS BATTLE", },
    { phase: 'Recruit', nL: 2, nR: 2, ptext: "SWAP THE POSITION OF ANY OF YOUR LEADERS IF YOU ACT IN THIS PHASE", ctext: "2 $A IF YOUR OPPONENT HAS CHOSEN TO RETREAT", },
    { phase: 'Recruit', nL: 1, nR: 3, ptext: "YOU MAY SPEND 3 RECRUITMENT POINTS TO GAIN 1 RESEARCH", ctext: "GAIN 1 RESEARCH IF YOU WOUND 2 OR MORE FIGHTERS", },
    { phase: 'Recruit', nL: 2, nR: 3, ptext: "PAY 3 FEWER ENERGY WHEN FAST-TRACKING FIGHTERS", ctext: "", },
    { phase: 'Move', nL: 2, nR: 2, ptext: "*TAKE THE MOVE ACTION WITHOUT PAYING ANY ENERGY", ctext: "GAIN 3 ENERGY IF YOU RETREAT", },
    { phase: 'Move', nL: 0, nR: 2, ptext: "*GAIN 1 RESEARCH ON THE MOVE TRACK BEFORE ACTING OR PASSING THIS PHASE", ctext: "", },
    { phase: 'Move', nL: 0, nR: 5, ptext: "GAN 1 ADDITIONAL MOVEMENT POINT IF YOU ACT IN THIS PHASE", ctext: "", },
    { phase: 'Move', nL: 4, nR: 1, ptext: "GAIN 5 ENERGY IF YOU DO NOT ACT IN THIS PHASE", ctext: "", },
    { phase: 'Move', nL: 3, nR: 0, ptext: "SEND ANY OF YOUR UNPINNED UNITS FROM UP TO 2 REGIONS TO YOUR BASE IF YOU ACT IN THIS PHASE", ctext: "GAIN 1 GEM IF YOU RETREAT", },
    { phase: 'Move', nL: 3, nR: 1, ptext: "REDEPLOY FROM A REGION YOU CONTROL BEFORE ACTING OR PASSING", ctext: "GAIN 1 GEM OR 1 TACTICS CARD IF YOU LOSE 1 OR MORE BUILDINGS", },
    { phase: 'Move', nL: 1, nR: 3, ptext: "PAY 3 FEWER ENERGY AND 1 FEW GEM WHEN UPGRADING A LEADER OR RHY-ZU", ctext: "", },
    { phase: 'Move', nL: 2, nR: 3, ptext: "UPGRADE A LEADER OR RHY-ZU IF YOU DO NOT ACT IN THIS PHASE", ctext: "", },
    { phase: 'Income', nL: 4, nR: 0, ptext: "*GAIN 3 ENERGY PER RELIC REGION YOU CONTROL", ctext: "2 $D IF ON A RELIC REGION", },
    { phase: 'Income', nL: 5, nR: 0, ptext: "*ADD 1 TO YOUR REGION COUNT", ctext: "", },
    { phase: 'Income', nL: 3, nR: 2, ptext: "*CONSTRUCT A FOUNDATION", ctext: "GAIN 1 GEM IF YOUR OPPONENT ROLLS A DIE", },
    { phase: 'Income', nL: 3, nR: 2, ptext: "PAY 2 FEWER GEMS WHEN UPGRADING ATTRIBUTES", ctext: "", },
    { phase: 'Income', nL: 2, nR: 2, ptext: "DEDUCT 2 FROM YOUR REGION COUNT", ctext: "KEEP THIS TACTICS CARD IF YOU ROLL 1 OR 2 $S", },
    { phase: 'Income', nL: 3, nR: 1, ptext: "GAIN 4 ENERGY", ctext: "GAIN 1 TACTICS CARD IF YOU DO NOT COMMAND ANY LEADER OR RHY-ZU IN THIS BATTLE", },
    { phase: 'Income', nL: 4, nR: 0, ptext: "GAIN 1 GEM PER PLAINS REGION YOU CONTROL", ctext: "GAIN 1 GEM IF FIGHTING WITHOUT A DIE", },
    { phase: 'Income', nL: 2, nR: 2, ptext: "GAIN 1 GEM PER SWAMP REGION YOU CONTROL", ctext: "IGNORE THE GEM COST IF ROLLING A DIE IN THIS BATTLE", },
    { phase: 'Income', nL: 1, nR: 3, ptext: "GAIN 1 GEM PER CLIFFS REGION YOU CONTROL", ctext: "2 $S IF YOU HAVE FEWER UNITS THAN YOUR OPPONENT", },
    { phase: 'Income', nL: 1, nR: 3, ptext: "GAIN 1 GEM PER RELIC REGION YOU CONTROL", ctext: "2 $A IF ON A RELIC REGION", },
    { phase: 'Income', nL: 2, nR: 2, ptext: "GAIN 1 TACTICS CARD PER PLAINS REGION YOU CONTROL", ctext: "2 $S ON PLAINS", },
    { phase: 'Income', nL: 2, nR: 2, ptext: "GAIN 1 TACTICS CARD PER SWAMP REGION YOU CONTROL", ctext: "2 $S ON SWAMPS", },
    { phase: 'Income', nL: 2, nR: 2, ptext: "GAIN 1 TACTICS CARD PER CLIFFS REGION YOU CONTROL", ctext: "2 $S ON CLIFFS", },
    { phase: 'Income', nL: 2, nR: 2, ptext: "GAIN 1 TACTICS CARD PER RELIC REGION YOU CONTROL", ctext: "2 $S IF ON A RELIC REGION", },
    { phase: 'Relic', nL: -1, nR: 3, ptext: "IF YOU HAVE 0-5 ENERGY, INCREASE THE ENERGY IN YOUR SUPPLY UP TO 6", ctext: "3 $A IF YOU HAVE NO LEADER PRESENT", },
    { phase: 'Relic', nL: 3, nR: -1, ptext: "IF YOU HAVE 0-1 GEMS, INCREASE THE GEMS IN YOUR SUPPLY UP TO 2", ctext: "3 $A IF OPPOSING A LEADER", },
    { phase: 'Relic', nL: 3, nR: 3, ptext: "MAKE 1 REDEPLOYMENT", ctext: "-2 $D IF YOU CHOOSE TO RETREAT", },
    { phase: 'Relic', nL: 2, nR: 2, ptext: "GAIN 2 TACTICS CARDS", ctext: "GAIN 1 GEM FOR EACH BUILDING THAT YOU RAZE", },
    { phase: 'Relic', nL: -1, nR: 6, ptext: "ALL YOUR UNITS REMAIN IN THE REGION WHEN COLLECTING A RELIC", ctext: "YOUR OPPONENT GAIN 2 $A + 1 $D", },
    { phase: 'Relic', nL: 6, nR: -2, ptext: "GAIN 1 RESEARCH WHEN COLLECTING A RELIC", ctext: "YOUR OPPONENT GAIN 1 $A + 1 $D", },
  ]

  /** new TacticsCard(cardSpec) for each cardSpec. */
  newCards(specs = this.cardSpecs) {
    return specs.map(cs => new TacticsCard(cs));
  }
}


export class TacticsCard extends Tile {
  static get allCards() { return Array.from(this.cardByName.values()) }

  static cardByName: Map<string,TacticsCard> = new Map();
  static uniqueId(cs: CardSpec, pI = cs.phase.substring(0, 1)) {
    if (cs.phase == 'Relic') pI = 'C'; // Check Relics (not Recruit)
    const n = Array.from(this.cardByName.keys()).filter(key => key.startsWith(pI)).length + 1;
    cs.id = `${pI}${n}_${cs.nL ?? 0}_${cs.nR ?? 0}`;
    return cs.id;
  }

  // map from phase to a color

  static colorMap: Partial<Record<ChaosPhase | 'back', string>> = {
    Discovery: 'rgb(246, 154, 254)', Build: 'rgb(163, 197, 255)', Harvest: 'rgb(174, 255, 221)', back: 'lightblue',
    Recruit: 'rgb(253, 233, 123)', Move: 'rgb(255, 184, 114)', Combat: 'rgb(255, 164, 164)', Income: 'rgb(170, 255, 159)', Relic: C.grey224,
  };
  /** recompute if TP.hexRad has been changed */
  static get onScreenRadius() { return TP.hexRad * H.sqrt3 };
  /** out-of-scope parameter to this.makeShape(); vs trying to tweak TP.hexRad for: get radius() */
  static nextRadius = TacticsCard.onScreenRadius; // when super() -> this.makeShape()
  _radius = TacticsCard.nextRadius;           // when ChaosCard.constructor eventually runs

  static cardMark: CardShape; // wait for gameSetup to configure TP.hexRad
  static makeCardMark() {
    TacticsCard.cardMark = new CardShape('rgba(118, 118, 118, 0.5)', '', TacticsCard.onScreenRadius);
  }

  override get radius() { return (this?._radius !== undefined) ? this._radius : TacticsCard.nextRadius }
  override get isMeep() { return true; }
  declare gamePlay: GamePlay;

  idText!: Text;            // descriptive text, name? id?
  phase!: ChaosPhase;
  nLeft!: number;          // set once: rs.nLeft
  nRight!: number;         // set once: rs.nRight
  cText!: Text;
  phaseText!: Text;
  pText!: Text;
  pFunc?: Function;
  cFunc?: Function;

  // Tile { baseShape: RectShape , nameText, descr }
  // TileExporter supplies args = ...[rs, 750]
  constructor(cs: CardSpec, size?: number) {
    if (size !== undefined) TacticsCard.nextRadius = size; // set before super calls makeShape()
    if (!TacticsCard.cardMark) TacticsCard.makeCardMark();
    super(TacticsCard.uniqueId(cs));  // Tile with Aname = Pn_L_R
    this.nameText.y += this.radius * .12;    // = radius * (.5 + .12)
    // maybe paint() per phaseEffect:
    this.addChildren(cs)
    this.paint(TacticsCard.colorMap[this.phase])
    TacticsCard.cardByName.set(this.Aname, this);  // Aname from CardSpec.id
    this.homeHex = TacticsCard.discards.hex; // unitCollision will stack if necessary.
  }

  // invoked by constructor.super()
  override makeShape() {
    return new CardShape('lavender', C.BLACK, this.radius, true, .02); // color reset by colorMap[phaseEffect.phase]
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
    const fSize = dSize * 1.8;
    const tmarg = .20;
    const setText = (txt: string, x = 0, y = 0, opts: { ta?: 'left' | 'center' | 'right', bl?: 'top' | 'middle' | 'bottom', fs?: number } = {}) => {
      const { ta, bl, fs } = { ta: 'center', bl: 'middle', fs: fSize, ...opts }
      const ctext = new CenterText(txt, fs);   // center & middle
      ctext.textAlign = ta;
      ctext.textBaseline = bl;
      ctext.lineWidth = width * (.95-tmarg);   // wrap when needed; we may want textTweaks (citymap, hexcity, whist, cubitos, gambit)
      ctext.x = x; ctext.y = y;
      this.addChild(ctext);
      return ctext;
    }
    const xc = x + width/2;
    const xn = width * .33;
    const xl = xc - xn;
    const xr = xc + xn;
    const x0 = x + width * tmarg;
    const ytop = y + dSize * 3 * .95;   // for numbers
    const ycom = y + height * .3;    // y for combat text
    const ypha = y + height * .6;    // y for phase:
    const ypht = ypha + fSize;       // y for phase text
    const ybot = y + height - 2 * dSize;
    const itext = cs.id!;
    const ctext = `${cs.ctext ?? ''}`;
    const ptext = cs.ptext;

    this.phase = cs.phase;
    this.nLeft = cs.nL;       // combat buff value
    this.nRight = cs.nR;      // combat buff value
    setText(cs.nL == 8 ? 'X' : cs.nL == 9 ? '' : `${cs.nL}`, xl, ytop, { fs: dSize * 3 });
    setText(cs.nR == 8 ? 'X' : cs.nR == 9 ? '' : `${cs.nR}`, xr, ytop, { fs: dSize * 3 });

    this.cText = setText(ctext, x0, ycom, { ta: 'left' });       // combat text
    this.phaseText = setText(`${cs.phase}:`, xc, ypha);
    this.pText = setText(ptext ?? '', x0, ypht, { ta: 'left' });
    this.idText = setText(itext, xc, ybot, { fs: dSize * 1.5 }); // describe/id the card; CardBack.dim()
    this.pFunc = cs.pFunc;
    this.cFunc = cs.cFunc;
  }

  // Identify il-legal sources of fromHex:
  override cantBeMovedBy(player: Player, ctx: DragContext): string | boolean | undefined {
    if (this.fromHex === TacticsCard.cardDeck.hex) return undefined;
    const table = (ctx.gameState as GameState).table;
    if (this.fromHex === table.cardDiscard.hex) return 'discarded';
    return undefined; // player.cardRack OR (discard && isDoneCard)
  }

  // TacticsCard.discard is Legal; here we add/include empty spots on curPlayer.cardRack
  override markLegal(table: Table, setLegal = (hex: Hex2) => { hex.setIsLegal(false); }, ctx?: DragContext): void {
    table.gamePlay.curPlayer.cardRack.forEach(setLegal)
    setLegal(TacticsCard.discards.hex as Hex2)
  }

  // The only "card moves" are:
  // Gain TacticsCard: table.cardDeck -> auto-drop(player.cardRack)
  // Discard Card:    player.cardRack -> discard(Play)
  // Rearrange Cards: player.cardRack -> player.cardRack(rearrange)
  // Play phase Card: player.cardRack -> table.discard (in Phase)
  // Use Tactic Card: player.cardRack -> player.combatWheel(for Battle)
  // Spurious click:  table.discard   -> discard, player.cardRack (undo-discard?, look behind?)
  override isLegalTarget(toHex: Hex2, ctx: DragContext): boolean {
    // Ok to move from player.cardRack (to rearrange?)
    const gameState = ctx.gameState as GameState;
    // TODO: legal per phase & toHex
    return true;
  }

  override showTargetMark(hex: IHex2 | undefined, ctx: DragContext) {
    const cardMark = TacticsCard.cardMark
    ctx.targetHex?.map.showMark(ctx.targetHex, cardMark); // if no targetHex: leave prev mark still showing
    cardMark.parent.addChildAt(cardMark, 0);              // do not occlude any LegalMark.hitArea
  }

  /**
   * TacticsCards are dragable to curPlayer.panel
   *
   * gameStart: allTiles.makeDragable(table); CardBack.isDragable(ctx) -> false
   */
  override makeDragable(table: HasDragger): void {
    table.dragger.makeDragable(this, this, this.tactics_dragFunc, this.tactics_dropFunc)
    table.dragger.clickToDrag(this, true); // also enable clickToDrag;
  }

  /** look for LegalMark in curPlayer.panel.cardPanel */
  hexUnderObj(dragObj: DisplayObject, legalOnly = true) {
    const markCont = this.gamePlay.curPlayer.panel.mapCont.markCont;   // == panel.cardPanel
    const dragCont = dragObj.parent; //= this.gamePlay.table.dragger.dragCont;
    const pt = dragCont.parent.localToLocal(dragCont.x, dragCont.y, markCont); // mouse coords on markCont
    // as if (panel as HexMap).hexUnderPoint(py.x, pt.y, legalOnly) {
    const mark = markCont.getObjectUnderPoint(pt.x, pt.y, 1); // find mark on PlayerPanel.cardPanel
    if (mark instanceof LegalMark) return mark.hex2;
    // check table.hexMap for discard (or other) suitable hex;
    const rv = this.gamePlay.table.hexUnderObj(dragCont, legalOnly);
    return rv
  }

  /** drag object curPlayer.panel.cardPanel */
  tactics_dragFunc(dragObj: DisplayObject, info?: DragInfo) {
    const hex2 = this.hexUnderObj(dragObj); // find mark on PlayerPanel.cardPanel
    this.gamePlay.table.dragFunc0(this, info, hex2);
  }
  /** enlarge for click and drag */
  scaleXY = 1.8;
  override dragStart(ctx: DragContext): void {
    this.x *=  this.scaleXY;
    this.y *=  this.scaleXY;
    this.scaleX = this.scaleY = this.scaleXY;
  }

  /** use table.dropFunc */
  tactics_dropFunc(dobj: DisplayObject, info?: DragInfo, hex = this.hexUnderObj(dobj)) {
    this.scaleX = this.scaleY = 1;
    this.gamePlay.table.dropFunc(dobj, info, hex)
  }

  // table.dragger.makeDragable(tile, tile, undefined->table.dragFunc, tile.dropFunc):
  // when 'tile' is dragged:
  // table.dragFunc(tile, info) {
  // hex = table.hexUnderObject(dObj=tile, undef) --> table.hexMap.hexUnderObj(dObj, legalOnly) --> table.hexMap.hexUnderPoint(x,y, legalOnly) {
  //     --> hex.mapCont.markCont.getObjectUnderPoint(x,y,1) for LegalMark
  //     --> hex.mapCont.hexCont.getObjectUnderPoint(x,y,1) for HexCont
  //     }
  //  --> table.dragFunc0(tile, hex) --> [table.dragStart(tile, ctx)] --> tile.dragFunc0(hex, ctx) --> tile.dragFunc(hex, ctx)
  // }
  // tile.dragFunc() does nothing, the interesting bits are in isLegal() & dropFunc

  // TODO: draw card to player's 'hand'
  // Player can drag it to discard pile during appropriate phase: eval effect
  // or drag it to combat wheel during Combat (discard after Combat)
  //
  override dropFunc(targetHex: IHex2, ctx: DragContext): void {
    const cardHex = (targetHex as CardHex);
    const card = cardHex?.card;
    if (card && card !== this) card.moveCard(cardHex, ctx);
    super.dropFunc(targetHex ?? TacticsCard.discards.hex, ctx);
    if (this.hex === TacticsCard.discards.hex) {
      TacticsCard.discards.availUnit(this);
    }
    if (!TacticsCard.discards.sourceHexUnit) TacticsCard.discards.nextUnit(); // reveal discard
    TacticsCard.discards.updateCounter();
    TacticsCard.cardDeck.updateCounter();
    ctx.targetHex?.map.showMark(undefined); // if (this.fromHex === undefined)
  }

  override moveTo(hex: Hex1 | undefined): void {
    super.moveTo(hex)
  }

  /** hex contains card, which needs to be moved: */
  moveCard(hex: CardHex, ctx: DragContext) {
    // if hex is 'discards' --> let unitCollision stack them on source.available
    // if hex in player.cardRack[]: card.sendHome()
    // if hex is table.cardRack[0]: shift all cards up
    if (hex == TacticsCard.discards.hex) return;
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
  /** make draw pile and discard pile for TacticsCard */
  static makeCardSources(table: Table, rowcol: { row?: number, col?: number }) {
    CardHex.allCardHex.length = 0; // clear before we make all the new CardHex.
    const { row, col } = { row: 1.9, col: 1, ...rowcol }
    const cardDeck = table.makeSourceAtRowCol(TacticsCard.makeSource, 'cardDeck', row + 0, col - .75, { x: .5, y: 1.0 }, CardHex)
    const discards = table.makeSourceAtRowCol(TacticsCard.makeSource, 'discards', row + 0, col + .75, { x: .5, y: 1.0 }, CardHex)
    ;(discards.hex as Hex2).legalMark.setOnHex(discards.hex as Hex2);
    discards.Aname = 'TacticsCardDiscards';
    TacticsCard.cardDeck = cardDeck;
    TacticsCard.discards = discards;

    const discback = new CardBack(table, 'discard', '', '#aabbcc59');
    discback.moveTo(discards.hex as Hex1); // set position above source.hex
    discback.moveTo(undefined);
    discback.removeAllChildren(); discback.addChild(discback.baseShape); // just the baseShape

    const cardback = table.cardBack = new CardBack(table, 'cardback'); // it a Button, mostly.
    cardback.moveTo(cardDeck.hex as Hex1); // set position above source.hex
    cardback.moveTo(undefined);
    cardback.on(S.click, (evt) => cardback.clicked(evt), cardback )

    return [cardDeck, discards];
  }

  static makeAllCards(gamePlay: GamePlay, specs?: CardSpec[]) {
    TacticsCard.cardByName.clear();
    const specGen = gamePlay.specGen = new SpecGen(gamePlay);
    const allSpecs = specs ?? specGen.cardSpecs;
    const allCards = specGen.newCards(allSpecs); // are injected into TacticsCard.allCards
    permute(allCards);
    // enqueue all the cards on source:
    const source = TacticsCard.cardDeck;
    allCards.forEach(card => source.availUnit(card, true));
  }

  static reshuffle() {
    // assert: src.sourceHexUnit === undefined [else we would not be shuffling...]
    const disc = TacticsCard.discards, src = TacticsCard.cardDeck;
    const discarded = disc.filterUnits() // extract all available units (with sourceHexUnit)
    discarded.forEach(card => {
      disc.deleteUnit(card);
      src.availUnit(card);
    });
    src.permuteAvailable()
  }

  /** sendHome (or drop card) on discard to accumulate for later reshuffle. */
  static discards: TileSource<TacticsCard>;
  static cardDeck: TileSource<TacticsCard>;
  static source: TileSource<TacticsCard>;     // pro-forma 'source' for makeSource0

  // invoked by Table.makeSourceAtRowCol()
  static makeSource(hex: IHex2) {
    const src = TacticsCard.makeSource0(TacticsTileSource, TacticsCard, hex);
    src.Aname = `${src.hex.Aname}Source`; // rename 'readonly' Aname
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
  // cache the bounds of a CardBack
  static _bounds?: {x: number, y: number, width: number, height: number}
  /** getBounds of a CardBack (or any TacticsCard) */
  static get bounds() {
    return CardBack._bounds ?? (CardBack._bounds = new CardBack(undefined as any as Table, 'temp_bounds', '').getBounds())
  }
  static bColor = TacticsCard.colorMap.back;
  static oText = 'click\nto\ndraw';
  static nText = 'DIM\n';
  dim(dim = true) {
    this.idText.text = dim ? CardBack.nText : CardBack.oText;
    this.stage?.update()
  }

  constructor(public table: Table, id = 'cardback', text = CardBack.oText, color = CardBack.bColor) {

    super({ id, phase: 'SetPrices', nL: 9, nR: 9, ptext: '' })
    this.phaseText.text = text;
    this.phaseText.textBaseline = 'bottom'
    this.idText.text = id;
    this.baseShape.paint(color)
    if (!CardBack._bounds) CardBack._bounds = this.getBounds(); // dubious optimization, only make 2 CardBacks
  }

  // CardBack is not dragable:
  override makeDragable(table: HasDragger): void {
    return;
  }
  clicked(evt?: MouseEvent) {
    if (!this.table) return; // printable CardBack...
    const source = TacticsCard.cardDeck;
    if (source.numAvailable === 0) TacticsCard.reshuffle();
    const card = source.nextUnit();  // card.moveTo(srchex)
    console.log(stime(this, `.clicked`), `source.numAvailable: ${source.numAvailable}`)
    if (source.numAvailable === 0) {
      this.dim(true); // indicate stack is empty
    }
    if (card) {
      // card appears under mouse, no need for snap to dxy
      // const pt = { x: evt?.localX ?? 0, y: evt?.localY ?? 0 }
      setTimeout(() => {
        this.dragNextCard(card)
      }, 14);   // exit click context, new thread for dragging
    }
    return;
  }

  dragNextCard(card: TacticsCard, dxy?: XY) {
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
    const disc = TacticsCard.discards;
    if (this === disc.hex) {   // sendHome preempts to do this path:
      disc.availUnit(unitOnHex as TacticsCard);    // stack previous card; hexUnit.visible = false;
      disc.availUnit(unitToHex as TacticsCard);    // push new card (redundant: nextUnit() does it implicity)
      disc.nextUnit(unitToHex as TacticsCard);     // pop into sourceHexUnit [unit.source = PC.discard]
    } else {
      unitOnHex.moveTo(disc.hex);// discard previous card === hexUnit.sendHome()
    }
  }

  // TacticsCard is modeled as a Tile, placed on CardHex [tactics-card.ts] (from HexPath);
  // hexcity uses the way old CardContainer and card.useDropFunc
  // See CardPanel.makeDragable(table) -> table.dragger.makeDragable(... dropFunc)
  get card() { return super.meep as TacticsCard | undefined }
  set card(card) { super.meep = card; }
}


/** auxiliary Panel to position a cardRack on the Table (or PlayerPanel). */
// TODO: review how Ankh made hidden panels
// TODO: move to player.ts (coresident with its parent ChaosPlayerPanel)
export class CardPanel extends MapCont {
  // QQQ: include panel in constructor?
  get panel() { return (this.parent as Panel) }

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
    this.disp = new RectShape({ w, h }, 'rgba(224,224,224,.5)', ''); // handle to grab and drag this CardPanel
    this.disp.name = 'dragCardPanel';
    this.addChildAt(this.disp, 0);
    this.y = row * dydr;
    this.x = col * dxdc;
    table.hexMap.mapCont.addChild(this);
  }

  // readonly cardRack: CardHex[] = [];
  get cardRack() { return this.panel.cardRack }
  get cards() { return this.cardRack.map(hex=> hex.card).filter(card => !!card) }

  /** background shape, so one can see the panel and drag it. */
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
  fillAryWithCardHex(panel: Panel, hexAry: IHex2[], row = 0, ncols = 4) {
    const { w } = panel.hexMap.xywh(); // hex WH (per hexRad & topoNS/EW)
    const { width } = (new CardShape()).getBounds(); // TacticsCard.onScreenRadius
    const gap = .1 + (width / w) - 1;  // allocate space to fill
    const hexes = panel.hexesOnMapCont(row, ncols, CardHex, { gap }); // was hexesOnPanel()
    hexAry.splice(0, hexAry.length, ...hexes);
  }

  isCardHex(hex: Hex2): hex is CardHex {
    return (hex instanceof CardHex)
  }

  /** make this CardPanel dragable. */
  makeDragable(table: HasDragger) {
    table.dragger.makeDragable(this, this, this.cardPanel_dragStart0, this.dropFunc);
    table.dragger.clickToDrag(this, true);
  }

  scaleXY = 1.6; // scale up while dragging
  cardPanel_dragStart0(c: DisplayObject, info?: DragInfo) {
    if (info?.first) {
      const s = this.scaleX = this.scaleY = this.scaleXY;
      const { x, y } = info?.dxy ?? { x: 0, y: 0 }
      const dxy = { x: x / s, y: y / s }
      if (info) info.dxy = dxy;
      this.parent.globalToLocal(info.stageX0, info.stageY0, this) // move obj to stageX, stageY
      this.x -= x;
      this.y -= y;
    }
    // what pressmove does:
    // obj.parent.globalToLocal(event.stageX, event.stageY, obj) // move obj to stageX, stageY
    // obj.x -= dragInfo.dxy.x * obj.scaleX;       // offset by dxy
    // obj.y -= dragInfo.dxy.y * obj.scaleY;
    // what pressup does:
    // obj.parent.localToLocal(obj.x, obj.y, dropCont, obj); // dragCont -> dropCont (= srcCont)

  }

  /** drag & drop the whole panel: */
  dropFunc(dobj: DisplayObject, ctx?: DragInfo) {
    this.scaleX = this.scaleY = 1.0;  // return to original scale
  }

  addCard(card?: TacticsCard) {
    const cardRack = this.cardRack;
    const hex = cardRack.find(hex => !hex.card)
    card?.placeTile(hex);
    const nCards = cardRack.filter(h => !!h.card).length;
    this.panel.cButton.label_text = `${nCards} Card${nCards == 1 ? '' : 's'}`;
    // TODO: set 'Cards' label button to include number of cards
    // TODO: auxillary hex for new card (> hand limit) & choose
  }

  /** discard Cards not included in cards */
  resetCards(cards: TacticsCard[]) {
      this.cards.forEach(card => (cards.includes(card) || card.sendHome())); // discard extra cards

  }
}
