import { arrayN, C, Constructor, stime, type XY } from "@thegraid/common-lib";
import { AliasLoader, CenterText, CircleShape, NamedContainer, RectShape, TextInRect, UtilButton, type Paintable, type PaintableShape } from "@thegraid/easeljs-lib";
import type { DisplayObject } from "@thegraid/easeljs-module";
import { HexMap, LegalMark, newPlanner, NumCounter, Player as PlayerLib, PlayerPanel, TP, type IHex2, type MapCont, type Tile, type TileSource } from "@thegraid/hexlib";
import { CardShape } from "./card-shape";
import { ChaosHex2, ChaosHex2 as Hex2 } from "./chaos-hex";
import { type ChaosTable, type ChaosTable as Table } from "./chaos-table";
import { BaseTile, ChaosTile, type BONUS, type HARVEST } from "./chaos-tile";
import { Faction, factionColors, type FactionId, type FactionName } from "./factions";
import { BgFound, Foundation } from "./foundation";
import { type Battle, type GamePlay } from "./game-play";
import { type PlayerId } from "./game-state";
import { ChaosPresence, Factory, Leader, Outposts, PriceToken, PTokenShape, Rhyzu, Stronghold, type ChaosUnitType, type Fighter, type PriceId } from "./meeples";
import { ResearchCell, ResGrid } from "./research-cell";
import { bonusIcon, CO, pricePhases } from "./table-params";
import { CardBack, CardHex, CardPanel, TacticsCard } from "./tactics-card";

/** Canonical Faction colors, aligned with gameSetup.factionNames.
 *
 * Each canonical color is mapped to an HTML color string for display: Player.colorScheme[cname]
 */
const playerColors = factionColors;
export type PlayerColor = typeof playerColors[number];

// 5 Bonus Foundations, named for the bonus they give; stronghold & one other have gemlock
const foundationIds = ['research', 'harvest', 'adjacent', 'unlock', 'handlimit'] as const;
export type FoundationId = typeof foundationIds[number];

/** strings to annotate PricingSlot */
export const PriceBonus = ['', 'G1', '', 'E2', 'C'];

/** per-Player bits on PlayerPanel */
class PlayerBits {
  leaders: Leader[] = [ ];              // LeaderCard is a Tile, leader.homeHex is tile.hex (tile: card, meep: leader)
  fighters!: TileSource<Fighter>[];     // TileSource[n] for each stage of Recruit (Base is ChaosTile, sans foundations)
  factorys!: TileSource<Factory>;       // Spread TileSource.filterUnits((u)=>!u.hex.isOnMap) across board
  outposts!: TileSource<Outposts>;      // Spread TileSource.filterUnits((u)=>!u.hex.isOnMap) across board
  strongholds!: TileSource<Stronghold>; // Spread TileSource.filterUnits((u)=>!u.hex.isOnMap) across board
  foundations!: Record<FoundationId, ChaosHex2>; // the 5 foundations in their places
  // extend with Morale[], AI_Trap[], RhyzuToken[], Intel Cards
}

export class Player extends PlayerLib {
  static initialCoins = 6;
  static initialGems = 1;

  // {gold: 'gold', lightblue: 'lightblue', violet: 'Violet', blue: 'blue', orange: 'orange' };
  /** Record<FactionColors: HTML_Color\> */
  static override colorScheme = {
      // start with 6 key factionColors:
      ... playerColors.reduce((pv, cv) => (pv[cv] = cv, pv), {} as typeof PlayerLib.colorScheme),
      // overwrite a few to get a better color
      'gold': 'rgb(235, 186, 26)',    // Circadians
      'grey': 'rgb(168, 167, 167)',   // AI: between 128 & 224
      'blue': 'rgb(1, 161, 230)',     // Zcharo
      'orange': 'rgb(195, 34, 34)',   // Jrayek
      'violet': 'rgb(123, 91, 153)', // Oxataya
      'brown' : 'brown',                // Neutral
  } as typeof PlayerLib.colorScheme;

  // QQQ: Player.color -> PlayerPanel, or PlayerPanel.color -> Player
  // QQQ: the distinction of Player is their Panel? or do we also subclass the Player?
  // If so: we don't need to subclass Player, put all the specialization into the Panel
  // which is going to be distinct in every case.
  // override get color(): PlayerColor { return super.color as PlayerColor; }
  // override set color(c: PlayerColor) { super.color = c; }
  // factionId!: number; // TODO: remove/change to get from Panel

  declare gamePlay: GamePlay;
  declare panel: Panel;

  declare index: PlayerId;
  readonly facId: FactionId;
  readonly faction: Faction;
  readonly facName: FactionName;

  constructor(index: number, gamePlay: GamePlay) {
    super(index, gamePlay); // <-- index is 'table ordinal'
    const facId = gamePlay.gameSetup.facIds[index];     // Aname and HTML color should be aligned with facId
    this.facId = facId;
    // Or: make subclass for each Faction; map from facId --> Constructor<Faction>; new facClass()
    this.faction = Faction.factionById.get(facId) ?? new Faction(facId, this);
    this.facName = this.faction.name;
    const cname = playerColors[this.facId];
    ;(this as any).Aname = `P${index}:${cname}`
    this.color = (this.constructor as typeof Player).playerColor(cname); // canonical name --> html Color
  }

  /**
   * Before start each new game.
   *
   * [make newPlanner for this Player]
   */
  override newGame(gamePlay: GamePlay, url = TP.networkUrl) {
    super.newGame(gamePlay, url);
    this.planner = newPlanner(gamePlay.hexMap, this.index)
  }
  // only invoked on the newly curPlayer!
  override newTurn() {
    // nothing to do... until 'Move' action.
    // this.ships.forEach(ship => ship.newTurn());
    // return;
  }

  /** if Planner is not running, maybe start it; else wait for GUI */ // TODO: move Table.dragger to HumanPlanner
  override playerMove(useRobo = this.useRobo, incb = 0) {
    let running = this.plannerRunning
    // feedback for KeyMove:

    TP.log > 0 && console.log(stime(this, `(${this.plyrId}).playerMove(${useRobo}): useRobo=${this.useRobo}, running=${running}`))
    if (running) return
    if (useRobo || this.useRobo) {
      // continue any semi-auto moves
    }
    return      // robo or GUI will invoke gamePlay.doPlayerMove(...)
  }

  // Test/demo EditNumber
  override makePlayerBits(): void {
    super.makePlayerBits();  // this.coinCounter = new NumCounter('coins', 0)
    // display coin counter:
    const { wide, gap } = this.panel.metrics;
    const fs = TP.hexRad * .5;
    const ic = Player.initialCoins;

    const cc = this.coinCounter = new NumCounter('coins', ic, C.YELLOW, fs); // TODO: lightening bolt?
    cc.x = 2 * gap; cc.y = cc.high / 2 + 2 * gap;
    cc.boxAlign('left');
    this.panel.addChild(cc);

    const ig = Player.initialGems;
    const gc = this.gemCounter = new NumCounter('gems', ig, C.RED, fs);
    gc.x = cc.wide + 3 * gap; gc.y = cc.high / 2 + 2 * gap;
    gc.boxAlign('left');
    this.panel.addChild(gc);
    this.faction.researchLevels = ResearchCell.initializeResearchCells(this.faction)
  }

  /** count gems for this player */
  gemCounter!: NumCounter;
  get gems() { return this.gemCounter?.value; }
  set gems(v) { this.gemCounter?.updateValue(v); }

  /** IHex2[] where player has presence */
  get hexPresence() {
    const presence = this.presence;
    return this.gamePlay.hexMap.filterEachHex(hex => !!presence.find(p => (p.hex == hex)))
  }

  /** units providing presence on map */
  get presence() { return this.allOnMap(ChaosPresence) } // player.allOnMap(ChaosPresence)

  /** where player has presence but not control (multip players present) */
  get conflict() { return [] as Hex2[] } // presence.filter( !control )

  /** where player has presence and no conflict */
  get control() { return [] as Hex2[] }  // presence.filter( ... )

  /** Hex2[] on which to place Tiles */

  // /** all Buildings on panel? make racks for each Building type? use simple array/stack? */
  get units() { return /*this.unitRack.map(hex => hex.tile) */ [] }
  get buildings() { return this.panel.buildingHomes}

  /** shortcut to panel.cardRack */
  get cardRack() { return this.panel.cardRack; }
  /** put cardRack on a movable CardPanel; PlayerPanel ISA HexMap, and cardPanel is its mapCont. */
  makeCardRack(table: Table, row?: number, ncols = 6) {
  }

  addCard(card?: TacticsCard) {
    const hex2 = this.cardRack.find(hex => !hex.tile) as Hex2;
    if (!hex2) return;                               // TODO: auxillary hex for new card & choose
    if (!card) card = TacticsCard.source.nextUnit(); // sourcHexUnit assured to be undefined (see takeUnit())
    card?.placeTile(hex2);
    return card;
  }

  /** for ScenarioParser.saveState() */ // TODO: code cards with index, or string->card
  get cards() { return this.cardRack.map(hex => hex.card).filter(card => !!card) }

  /** rules in Player's cardRack */
  get cardRules() {
    return this.cardRack.filter(h => h.card).map(h => h.card!.phaseEffect);
  }

  // include: facId, coins, gems, cards[], pricingTokens[],
  saveState() {
    const coins = this.coins;
    const gems = this.gems;
    const cards = this.cards.map(card => card?.name);
    const recruits = this.panel.recruits.map(ctr => ctr.value);
    return {coins, gems, cards, recruits }
  }

  chooseBattle(battles: Battle[], cb: (battle: Battle) => void) {
    // TODO: choose from GUI
    cb(battles[0]);
  }

  setBattlePlan(battle: Battle, cb: () => void) {
    // oh, sure: plyr2 can see the stat1.wheel & card...
    const stat = (battle.stat1.plyr == this) ? battle.stat1 : battle.stat2;
    // dummy reply:
    stat.wheel = "retreat";    // or whatever
    stat.card = this.cards[0];
    setTimeout(cb, 50)
  }
}

/** PlayerPanel with its own mapCont;
 * GameSetup hacks PlayerPanel.prototype to inherit HexMap
 * so ancillary methods can be found (topo, xywh)
 */
export class Panel extends PlayerPanel {

  faction: Faction;

  declare mapCont: MapCont;            // player.makeCardRack() will set mapCont = cardPanel
  declare player: Player;
  declare table: ChaosTable;

  /** faction id (0..5) */
  get factionId() { return this.player.facId }
  /** player color (HTML) */
  get pColor() { return this.player.color }

  // TODO: remove Partial<>
  // QQQ: is UnitRack based on Hex2[] or TileSource?
  // ANS: Hex2[], and ChaosMeeple has specialized unit.sendHome()
  readonly unitHomes: Partial<Record<ChaosUnitType, Hex2[]>> = {};
  readonly buildingHomes: Hex2[][] = [];  // fill per spec -> Building.homeAry

  /** the 'hand' of TacticsCards */
  readonly cardRack: CardHex[] = [];
  cardPanel!: CardPanel;
  avail: NamedContainer;
  vault: NamedContainer;

  constructor(table: Table, player: Player, high: number, wide: number, row: number, col: number, dir?: number) {
    const hexMap = table.hexMap;
    super(table, player, high, wide, row, col, dir); // make a PlayerPanel
    Object.assign(this, hexMap);       // assign hexMap instance variables
    this.Aname = player.Aname;         // reset Aname
    // this.player.color = Player.playerColor(this.player.cname!); // override Player.colorScheme
    const faction = this.faction = this.player.faction;
    console.log(stime(this, `.constructor: factionId=${this.factionId} cname=${this.player.cname} ${faction.name}`))
    player.panel = this;       // set it so layout can easily find the Player
    this.avail = new NamedContainer('PT_avail'); // place to show available PriceToken[]
    this.addChild(this.avail)
    this.vault = table.tokenVault[faction.facId];// place to show 'invault' PriceToken (faction.image)
    this.vault.visible = true;
  }

  /** common wh for relics & foundations & buildings & PriceToken */
  wh = TP.meepleRad;


  // TODO: table.vault
  layoutNeutralPanel(table: ChaosTable) {
    this.setOutline(4, 'rgba(241, 226, 165, 0.3)');
    const np = table.gamePlay.allPlayers.length, wh = this.wh;
    const ptIds = [[],[], [5, 3], [5, 4, 3, 2], [5, 3], [], []][np];
    this.addPriceTokens(table, -1.16, ptIds); // make the row, then stack them on the edge:
    const y = wh * (.55 - 1.16); // row = -1.16
    const x = wh * .55;  // stack the Neutral tiles above phase pricing slots
    // stack in order (TODO: two stacks for 3-player)
    ptIds.forEach(pid => {
      const pt = this.priceTokens[pid];
      pt.homeXY = { ...pt.homeXY, x };
      pt.sendHome()
    });
    this.addPriceSlots()
    this.addResearchLines()
    this.localToLocal(wh * 2.93, y, table.vault.parent, table.vault); // position vault above Panel
    return;
  }

  /** set disp on this.parent @ panel's wh grid(xy)
   * disp: DisplayObject with parent (on stage)
   * x, y: offsets in units of this.wh (TP.meepleRad)
   */
  moveToWH(disp: DisplayObject, x = 0, y = 0) {
    const wh = this.wh, x0 = wh * .55, y0 = wh * .55, s1 = wh * 1.1;
    this.localToLocal(x0 + x * s1, y0 + y * s1, disp.parent, disp);
  }

  rowh = 1.35;
  addPriceSlots() {
    const wh = this.wh, fs = wh * .15, x0 = wh * .5, y0 = wh * .5, rowh = this.rowh * wh;
    pricePhases.forEach((pName, i) => {
      // place a tokenShape suitable for PricingToken
      const tokenShape = (dy = 0, label4 = (i == 4) ? 'FIRST' : '') => {
        const isLast = (label4 == 'LAST');   // as given parametar
        const tShape = new PTokenShape(wh, C.white);
        tShape.paint(C.grey224);
        slot.addChild(tShape);
        const cx = tShape.x = x0;
        const cy = tShape.y = y0 + dy; // 'LAST' is moved down on slot
        const bonusTxt = PriceBonus[i];
        if (bonusTxt && !isLast) {
          const bonus = bonusIcon(bonusTxt as HARVEST, fs)!;
          bonus.x = cx;
          bonus.y = cy - wh * .2;
          slot.addChild(bonus)
        }
        if (label4) {   // 'FIRST' or 'LAST' aka: (i == 4)
          const mtext = new CenterText(label4, fs);
          mtext.x = cx;
          mtext.y = cy + wh * .2;
          slot.addChild(mtext)
        }
        const thex = this.table.makeTokenHexForObj(tShape, `${label4 ?? pName}`);
        const di = (isLast ? i + 1 : i);
        this.table.priceHex[di] = thex;
      }
      const slot = new NamedContainer(`p_${pName}`)
      slot.x = wh * .6;
      slot.y = wh * .3 + i * rowh;
      this.addChild(slot)
      tokenShape();
      if (i == 4) {
        tokenShape(wh * 1.1, 'LAST');
        // cross link for isLegalHex:
        this.table.priceHex[4].otherMoveHex = this.table.priceHex[5];
        this.table.priceHex[5].otherMoveHex = this.table.priceHex[4];
      }
      const label = new CenterText(pName, fs, C.white )
      label.textAlign = 'left';
      label.textBaseline = 'bottom'
      const name = new TextInRect(label, { bgColor: CO.mauve })
      name.x = -wh * .1;
      name.y = -wh * .07;     // ~fs/2;
      slot.addChild(name);    // TODO: show Phase Icons!
    })
  }


  addResearchLines() {
    const rls = new NamedContainer('ResLines');
    const wh = this.wh;
    const dy = wh * this.rowh;
    const dx = wh * 1.35;
    pricePhases.forEach((pName, i) => {
      const row = ResearchCell.researchCells[i] = [] as ResearchCell[];
      const resSpecs = ResGrid[pName];
      resSpecs.forEach((rs, j) => {
        rs[3] ||=  (j == 4);   // add gemLock to level-4
        const cell = new ResearchCell(`RC${pName}_${j}`, rs, { width: wh * 1.2, height: wh * 1.2 })
        row.push(cell);        // cell into next column
        cell.x = j * dx;
        cell.y = i * dy;
        rls.addChild(cell);
      })
    })
    this.addChild(rls);
    rls.x = wh * 3;
    rls.y = wh * .9;

    return rls;
  }



  /**
   * add components:
   * - place for Relics [bonus: Fame, Gem, Flip]
   * - Income stripe & Buildings (Factory, Baracks, Strongholds)
   * - - Each cell: Shape, Gemlock, Features
   * - Foundations
   * - Handlimit
   * - Recruit counters 3 -> 2 -> 1 -> 0 = Base
   * - Special: Ry-zhu status, Trap status, Morale status
   *
   * Also: setup Base hex: [Ship, E1, E2, E2, G1, R1]
   */
  layoutPanel(table: ChaosTable) {
    const faction = this.faction;
    this.wh = TP.meepleRad; // TODO: integrate with panel.metrics (so counters align with wh & gap)
    this.cardPanel = this.addCardPanel(table);
    this.addRelics(faction);
    this.addBuildings(faction);
    this.addFoundations(faction, table);
    this.addRecruits(faction);
    this.addPriceTokens(table, 7);
    this.setupBase(faction);
    return this.children;
  }
  override bg0 = 'rgb(82, 81, 81)';
  override bg1 = this.bg0;

  addImage(x = this.wh, y = this.wh * 3) {
    const img = AliasLoader.loader.getBitmap(this.player.facName);
    img.x = x;
    img.y = y;
    this.addChild(img);
  }
  /** a row of icon pairs: [ % bonus ] */  // TODO: create Foundations for the Relic targets on Panel
  addRelics(spec: Faction) {
    const { x, y } = this.getBounds();
    const h = this.wh, w = h * 2, gap = h * .15;
    const x0 = x + w * 1.76, y0 = y + h * .65;
    const rb = spec.rb;
    arrayN(5).forEach(n => {
      const cont = new NamedContainer(`Relic${n}`)
      const foreColor = C.nameToRgbaString(this.player.color, .2);
      const bgrect = new RectShape({ x: -w/2, y: -h/2, w, h, s: 0 }, foreColor, '');
      const fs = h / 2, dx = w * .23;
      const resIcon = bonusIcon('%', fs*.8)!;
      resIcon.x = - dx; resIcon.y = 0;
      const specIcon = bonusIcon(rb[n], fs*.8) ?? new CenterText(rb[n], fs, C.white);
      specIcon.x = + dx; specIcon.y = 0;
      cont.addChild(bgrect, resIcon, specIcon);
      cont.x = x0 + n * (w + gap);
      cont.y = y0;
      this.addChild(cont);
    });
    return;
  }

  // add Income & Buildings; set playerColor & Harvest icon on Base.
  // FacSpec.bg: number[][] building w/gemlock (index per type); // indicates number of slots for each type
  /** 10 Foundations and 9 Buildings */
  addBuildings(spec: Faction) {
    const wh = this.wh, x0 = wh * 2.95, y0 = wh * 1.65, fs = wh * .2; // fs = foundation size
    const inx = wh * .54, iny = wh * 1.32;
    const stripe = new RectShape({ x: inx, y: iny, w: this.getBounds().width - wh, h: wh * .6 }, CO.orange, '')
    const circ = new CircleShape(CO.orange, wh/2, ''); circ.x = inx; circ.y = iny + wh/4;
    this.addChild(stripe, circ);
    const specBg = spec.bg;      // buildings with gemLocks
    let x00 = x0;
    specBg.forEach((bldgs, btype) => {  // btype: 0: Factory, 1: Outposts, 2: Stronghold
      const nbldgs = bldgs.length;
      const homeAry = new Array<Foundation>(nbldgs); // each Factory instance shares the same homeAry
      const [BC, bText, bid] = [
        [Factory, 'E2', 'F'],    // Foundry
        [Outposts, 'C', 'P'],    // outPost
        [Stronghold, 'G1', 'S'], // Stronghold
      ][btype] as [typeof Factory|typeof Outposts|typeof Stronghold, BONUS, number]

      bldgs.toReversed().forEach((bldg, rndx) => {
        const ndx = nbldgs - 1 - rndx; // actual ndx in homeAry
        const x = x00 + ndx * wh * 1.01; // place bg from left-to-right
        const y = y0;
        // TODO: use TextTweaks to convert E*, C, G* to glyphs?
        const bonus = bldg < 2 ? bText : [ 'E2  /    \n/\n    /  G1', 'E3'][bldg-2] as BONUS;
        const Aname = `${bid}${this.player.facId}.${ndx}`;
        const bgf = homeAry[ndx] = new BgFound(Aname, bonus, fs); // background Foundation on Panel
        if (bldg == 1) bgf.addGemLock(-.25, .65);
        this.addChild(bgf); bgf.x = x; bgf.y = y;
        if (bldg == 2 || bldg == 3) {
          bgf.reCache();
          return; // no building in Factory slot 0
        }
        const fg = new BC(Aname, this.player, bgf, homeAry);
        fg.sendHome();
        fg.paint(this.pColor);
        const bs = fg.backSide;
        // if (bs) bs.visible = true
      })
      x00 += (wh) * nbldgs + wh * .29;
    })
  }

  /**
   * turned out we do not re-use this...
   * @param fxy Panel location of bg & fg
   * @param produce { bg: Foundation, fg: Tile }
   * @returns
   */
  makePair(fxy: XY, maker: (fs: number) => { bg: Foundation, fg: Tile & { homeXY?: XY} }) {
    const fs = this.wh * .2
    const { bg, fg } = maker(fs);
    bg.x = fxy.x;
    bg.y = fxy.y;
    fg.homeXY = fxy;
    fg.sendHome();
    this.addChild(bg, fg);
    return { bg, fg }
  }

  /** the 5 left-side bonus Foundations */
  addFoundations(spec: Faction, table: Table) {
    const gl = spec.fg, r = [ 1, 2, 3, 2, 3 ], c = [ 1, 1, 1, 0, 0 ];
    const fn: Record<FoundationId, string> = {
      research: 'Gem\n---->\nResearch',
      harvest: 'All\n\nHarvest',
      adjacent: 'All\n\nadjacent',
      unlock: '-E2\nv\nunlock',
      handlimit: '+E2\n\n5 Cards'
    }
    const wh = this.wh, x0 = wh * .55, y0 = wh * .55, s1 = wh * 1.1;
    foundationIds.forEach((fid, ndx) => {
      const bText = fn[fid];
      const x = x0 + s1 * c[ndx];
      const y = y0 + s1 * r[ndx];
      const maker = (fs: number) => {
        const bg = new BgFound(fid, bText as BONUS, fs);;
        const fg = new Foundation(fid, '-', fs);
        if (ndx == 0 || ndx == gl) {
          fg.addGemLock(.35, 0);
        }
        return { bg, fg };
      }
      this.makePair({ x, y }, maker);
    })
    this.addImage(x0 + s1 * 2, y0 + s1 * 3)
  }

  /** fighters available in each stage of recruiting; [0] is fast-trackable; [lim] is in Base */
  recruits = [] as NumCounter[];
  /** a Counters & Buttons to move recruits into Base */
  addRecruits(spec: Faction, tw = this.wh * 4) {
    const wh = this.wh, x0 = wh * .55, y0 = wh * .55, s1 = wh * 1.1;
    const nr = spec.nr, ft = spec.ft, c = this.pColor, fs = wh * .5, bfs = wh * .25;
    const dx = tw / (nr.length - 1), base = nr.length - 1;
    const by = - wh * .6;
    const cont = new NamedContainer(`recruits`, x0 + s1 * 3, y0 + s1 * 3);
    this.addChild(cont);     // A black bar to hold the recruit counters & buttons:
    cont.addChild(new RectShape({ x: -wh/2, y: -y0, w: tw + wh, h: 2 * y0 }, 'black', ''))
    const addButton = (name: string, x: number, y: number) => {
      const button = new UtilButton(name, { bgColor: CO.orange, active: true, fontSize: bfs});
      button.x = x;
      button.y = y;
      cont.addChild(button);
      return button;
    }
    // count the available recruit actions
    const ravail = new NumCounter(`ravail`, 0, C.white, fs)
    ravail.clickToInc();
    ravail.x += 0;
    ravail.y = by;
    cont.addChild(ravail)

    // Exchange 3 recruits for a Card:
    const r3button = addButton(`R3->${spec.r3}`, wh, by);
    r3button.on('click', () => {
      if (ravail.value >= 3) {
        ravail.incValue(-3);
        if (spec.r3 == 'G1') {
          this.player.gems += 1;
        } else if (spec.r3 == 'C') {
          // if (spec.r3 == 'C') draw a card into hand
          const card = this.player.gamePlay.table.takeCard();
          this.cardPanel.addCard(card);
          this.stage.update()
        }
      }
    })
    // Fast track:
    if (ft > 0) { // AI does not have a FT button.
    const ft_button = addButton(`FT:${ft}`, wh * 2, by);
    const ftc = spec.ft;      // fast track cost
    ft_button.on('click', () => {
      if (ravail.value > 0 && this.player.coins >= ftc) {
        this.player.coinCounter.incValue(-ftc); // pay fast-track cost
        ravail.incValue(-1);     // consume a Recruit action
        rctrs[0].incValue(-1);   // decrement Unit count is left-most fighter supply.
        rctrs[base].incValue(1); // <-- into base
      }
    });
    }
    // counters at each stage of recruit; last one represents the Base.
    const rctrs = this.recruits;
    nr.forEach((nr, i, ary) =>  {
      const rc = new NumCounter(`nr[${i}]`, nr, c, fs, undefined, [C.BLACK, C.WHITE]);
      rctrs[i] = rc; // rctrs.push(rc);
      rc.x = i * dx;
      cont.addChild(rc);
      if (i == base) {
        rc.x += 0;
      } else {
        const rcb = addButton(`->`, rc.x + dx/2, 0);
        rcb.on('click', () => {
          if (ravail.value > 1) {
            rctrs[i].incValue(-1);
            rctrs[i+1].incValue(1);
          }
        })
      }
    })
  }

  // increase fighters in Base by n (presumably also decrement some recruit counter)
  // override for Circadians, also for Oxytaya: allow recruit to Stronghold
  // at end of Recruit phase/action
  recruitToBase(n = this.recruits[this.recruits.length - 1].value) {
    this.baseTile.addFighter(this.player, n);
    this.recruits[this.recruits.length - 1].setValue(0);
  }

  /** place for baseTile on panel */
  baseHex!: IHex2;
  /** Faction's baseTile */
  baseTile!: BaseTile;
  // make ChaosTile, set color, set Harvest token
  setupBase(faction: Faction) {
    const baseTile = this.baseTile = new BaseTile(faction);
    const bColor = faction.facId == 0 ? this.pColor : CO.btColor;
    const color = C.nameToRgbaString(bColor, .8), wh = this.wh;
    baseTile.paint(bColor);
    const hex = this.baseHex = this.table.newHex2(0, 0, `${this.faction.name}Base`);
    // move hex to center-center of this Panel:
    this.localToLocal(6.5 * wh, 5.7 * wh, hex.cont.parent, hex.cont)
    hex.legalMark.setOnHex(hex);
    baseTile.moveTo(hex);
    this.recruitToBase(); // the left-over fighters

    // TODO: move to layoutPanel ?
    this.makeLeaders();
  }

  // Make a homeHex for 3 or 4 leaders (TODO: 3 for Rhyzu)
  // Also: a 'recycle' Hex to remove a Leader from game.
  // (a legalTarget only during setup: PlaceBase ? move 2 to Recycle, rest to homeHex[i])
  /** make Leaders for this.player.facId */
  makeLeaders(player = this.player ) {
    const facId = player.facId, wh = this.wh;
    const leaders = Leader.leaderSpecs.filter(lspec => lspec.facId == facId);
    const leaderRad = TP.hexRad * .8; // width of leader.card

    /** a Hex to hold a LeaderTile */
    const LeaderHex = class LeaderHex extends Hex2 {
      override makeHexShape(colorn?: string): Paintable {
        return new CardShape(colorn, '', leaderRad)
      }
      override makeLegalMark(): LegalMark {
        return new class extends LegalMark {
          override doGraphics(): void {
            this.removeAllChildren();
            this.addChild(new CardShape(C.legalGreen, '', leaderRad/2)); // @(0, 0)
          }
        }
      }
    }
    /** a place to drop Leader on Panel when not recruited to map */
    const LeaderTile = class LeaderTile extends ChaosTile {
      constructor(Aname: string) {
        super(Aname, 'Base', '-', player); // paints (baseShape) WHITE [Base]
        this.paint(C.grey224)
        const fot = this.getFoT(player);
        fot.setXY(-this.radius * .6);    // Note: fot.isBase == true; --> x = 0
      }
      override makeShape(): PaintableShape {
        return new CardShape(player.color, undefined, leaderRad);
      }
    }
    this.faction.leaders = leaders.map((lspec, n) => {
      const ldr = !lspec.isRhyzu ? new Leader(lspec.name, player) : new Rhyzu(lspec.name, player);
      const name = `${this.Aname.substring(0,2)}_home`;
      const cn = ldr.isRhyzu ? n + 1 : n;
      const hx = (10 + cn % 3) * wh, hy = (3.3 * wh + Math.floor(cn / 3) * leaderRad*1.4);
      const homeHex = ldr.homeHex = this.table.newHex2(0, 0, name, LeaderHex, );
      this.localToLocal(hx, hy, homeHex.cont.parent, homeHex.cont);
      homeHex.legalMark.setOnHex(homeHex);

      const homeTile = new LeaderTile(name);
      homeTile.moveTo(homeHex);  // homeTile on hex on map with mapCont
      homeTile.addLeader(ldr);   // add to mapCont.overCont
      return ldr;
    });
    return this.faction.leaders
  }

  /** discard 2; can supply indices of one or two to automate */
  discardLeaders(disc: number[] = []) {
    // TODO: make a leaderPanel, populate with (UtilButtons holding a) leaderCard, click to discard.
    // move to panel with (3 or 4) newHex for each leader/leaderCard
  }

  /** a sub-panel that holds the hand of TacticsCards */
  /**
   *
   * @param table for hexMap & dydr, dxdc
   * @param row [0 = align to bottom of Panel] else row * dydr
   * @param ncols [6] number of card spaces to allocate
   * @returns
   */
  addCardPanel(table: Table, row = 0, ncols = 6) {
    // ChaosPlayerPanel { this.mapCont = new CardPanel(table); this.addChild(this.mapCont); }
    const wh = this.wh, x0 = wh * .55, y0 = wh * .55, s1 = wh * 1.1;
    const { dydr, dxdc } = table.hexMap.xywh();
    const cardH = CardBack.bounds.height;
    const { width, height } = this.getBounds();
    const high = cardH * 1.05 / dydr;  // units of hex.dydr
    const wide = table.panelWidth;
    const cardPanel = new CardPanel(table, high, wide, row, 0); // directly on table.mapCont! (so localToLocal works?)
    row = (row !== 0) ? row : - high * 1.045;   // up by high, align CardPanel bottom to Panel bottom
    cardPanel.y = (row < 0 ? row + height/dydr : row) * dydr;
    cardPanel.makeDragable(table);
    this.mapCont = cardPanel;
    this.addChild(cardPanel);
    cardPanel.fillAryWithCardHex(this, this.cardRack, high/2, ncols)
    cardPanel.visible = false;
    // a Button to toggle visibility:
    const cButton = new UtilButton('Cards', { active: true, corner: .1, fontSize: dxdc * .2, border: [.1, .1, .2, 0] });
    cButton.x = x0 + s1 * 1;
    cButton.y = y0 + s1 * 3.8; //height - 1.7 * dydr;
    this.addChild(cButton);
    cButton.on('click', () => {
      cardPanel.visible = !cardPanel.visible;  // toggle visibility
      this.avail.visible = !cardPanel.visible; // cardPanel & avail mutually exclusive
      this.stage.update()
    })
    return cardPanel;
  }

  priceTokens = [] as PriceToken[];
  /**
   * A row of 6 PricingToken with a home on this Panel.avail
   * @param table (not used)
   * @param row vertical offset on this panel
   * @param pids PriceToken ids (1--6) or subset for neutralPlayer
   */
  addPriceTokens(table: Table, row = 0, pids = arrayN(6, (i)=>i+1)) {
    const wh = this.wh, gap = wh * .1;
    const x0 = wh * .55, y0 = wh * .55;
    const x = x0 + wh * 0;
    const y = y0 + row * wh;
    this.avail.x = x; this.avail.y = y;

    this.priceTokens.length = 0;
    pids.forEach(i => {
      const xy = { x: i * (1.1 * wh), y: 0 };
      const pt = new PriceToken(i as PriceId, xy, this.player);
      pt.sendHome()
      this.priceTokens[i] = pt;
    })
  }

  // maybe a super-class of CardPanel? *any* mapCont? see game-setup where we Panel.mixin(HexMap2, PlayerPanel)
  /**
   * array[colN] of newHex2 across the width of mapCont (CardPanel is the mapCont of ChaosPlayerPanel);
   *
   * Uses mapCont.getBounds(), so that must be set.
   *
   * cPanel: panel to hold the row of hexes (this as HexMap).mapCont
   *
   * @param row0 y coordinate of the row of hexes
   * @param colN number of hexes in the row
   * @param hexC class of hexes to create
   * @param opts { vis, gap }
   * @param gap - [0] either absolute dx OR per-unit fraction of dxdc
   * @param vis - [false] set hex.visibility
   * @returns IHex2[]
   */
  hexesOnMapCont(row0 = .75, colN = 4, hexC: Constructor<IHex2>, opts?: { vis?: boolean, gap?: number }) {
    const { vis, gap } = { vis: false, gap: 0, ...opts };
    const rv = [];
    const map = this as any as Panel & HexMap<Hex2>; // put hexes here
    const cPanel = map.mapCont;
    const table = this.player.gamePlay.table;

    const { width: panelw } = cPanel.getBounds();
    const { x: xn, dydr, dxdc } = this.hexMap.xywh(undefined, 0, colN - 1); // x of last cell
    const gpix = gap < 1 ? gap * dxdc : gap;
    const dx = (panelw - xn - (colN - 1) * gpix) / 2; // allocate any extra space (width-xn) to either side
    const dy = row0 * dydr;   // y for row0
    for (let col = 0; col < colN; col++) {
        // make hex at row=0, then offset by dx; constant dy (vs per-column displacement)
        const hex = table.newHex2(0, col, `CardSlot`, hexC, map); // child of map.mapCont.hexCont
        rv.push(hex);
        hex.cont.x += (dx + col * gpix);
        hex.cont.y = (dy);
        hex.cont.visible = vis;
        hex.legalMark.setOnHex(hex);
    }
    return rv;
  }
}
