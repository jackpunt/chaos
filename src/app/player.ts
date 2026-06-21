import { arrayN, C, Constructor, stime, type XY } from "@thegraid/common-lib";
import { CenterText, CircleShape, NamedContainer, RectShape, UtilButton } from "@thegraid/easeljs-lib";
import { HexMap, newPlanner, NumCounter, Player as PlayerLib, PlayerPanel, TP, type IHex2, type MapCont, type Tile, type TileSource } from "@thegraid/hexlib";
import { ChaosHex2 as Hex2, type ChaosHex2 } from "./chaos-hex";
import { type ChaosTable, type ChaosTable as Table } from "./chaos-table";
import { ChaosTile, type BONUS } from "./chaos-tile";
import { Faction, factionColors, type FactionId, type FactionName } from "./factions";
import { BgFound, Foundation } from "./foundation";
import { type GamePlay } from "./game-play";
import { Outposts, ChaosPresence, Factory, PricingToken, Stronghold, type ChaosUnitType, type Fighter, type Leader, type PriceId } from "./meeples";
import { CardBack, CardPanel, TacticsCard } from "./tactics-card";

/** Canonical Faction colors, aligned with gameSetup.factionNames.
 *
 * Each canonical color is mapped to an HTML color string for display: Player.colorScheme[cname]
 */
const playerColors = factionColors;
export type PlayerColor = typeof playerColors[number];

export const chaosOrange = 'rgb(255, 140, 0)';

// 5 Bonus Foundations, named for the bonus they give; stronghold & one other have gemlock
const foundationIds = ['research', 'harvest', 'adjacent', 'unlock', 'handlimit'] as const;
export type FoundationId = typeof foundationIds[number];

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
  static override colorScheme = {
      ... playerColors.reduce((pv, cv) => (pv[cv] = cv, pv), {} as typeof PlayerLib.colorScheme),
      'yellow': 'tan',// 'rgb(255, 213, 0)',
      'blue': 'rgb(1, 161, 230)',
      'orange': 'rgb(255, 98, 0)'
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

  readonly facId: FactionId;
  readonly faction: Faction;
  readonly facName: FactionName;

  priceTokens: PricingToken[] = [];

  constructor(index: number, gamePlay: GamePlay) {
    super(index, gamePlay); // <-- index is 'table ordinal'
    const facId = gamePlay.gameSetup.facIds[index];     // Aname and HTML color should be aligned with facId
    this.facId = facId;
    this.faction = Faction.factionById.get(facId) ?? new Faction(facId);
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

  // addCard(card?: TacticsCard) {
  //   const hex2 = this.cardRack.find(hex => !hex.tile) as Hex2;
  //   if (!hex2) return;
  //   if (!card) card = TacticsCard.source.takeUnit();
  //   card?.placeTile(hex2);
  //   return card;

  /** for ScenarioParser.saveState() */ // TODO: code cards with index, or string->card
  get cards() { return this.cardRack.map(hex => hex.tile) }

  /** rules in Player's cardRack */
  get cardRules() {
    return this.cardRack.filter(h => h.card).map(h => h.card!.phaseEffect);
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
  readonly cardRack: Hex2[] = [];
  cardPanel!: CardPanel;

  constructor(table: Table, player: Player, high: number, wide: number, row: number, col: number, dir?: number) {
    const hexMap = table.hexMap;
    super(table, player, high, wide, row, col, dir); // make a PlayerPanel
    Object.assign(this, hexMap);       // assign hexMap instance variables
    this.Aname = player.Aname;         // reset Aname
    // this.player.color = Player.playerColor(this.player.cname!); // override Player.colorScheme
    this.bg0 = C.grey64; 'rgb(56, 56, 56)';
    this.bg1 = this.bg0;
    const faction = this.faction = this.player.faction;
    console.log(stime(this, `.constructor: factionId=${this.factionId} cname=${this.player.cname} ${faction.name}`))
    player.panel = this;       // set it so layout can easily find the Player
    this.layoutPanel(table);
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
    this.addPriceTokens(table, 4);
    this.setupBase(faction);
    return this.children;
  }

  /** common wh for relics & foundations & buildings */
  wh = TP.meepleRad;

  /** a row of icon pairs: [ % bonus ] */
  addRelics(spec: Faction) {
    const { x, y, width, height } = this.getBounds();
    const h = this.wh, w = h * 2, gap = h * .15;
    const x0 = x + w * 1.76, y0 = y + h * .65;
    const sp = spec.rb;
    arrayN(5).forEach(n => {
      const cont = new NamedContainer(`Relic${n}`)
      const foreColor = C.nameToRgbaString(this.player.color, .7);
      const bgrect = new RectShape({ x: -w/2, y: -h/2, w, h, s: 0 }, foreColor, '');
      const fs = h / 2, dx = w * .23;
      const resIcon = new CenterText('%', fs, C.white);
      resIcon.x = - dx; resIcon.y = 0;
      const specIcon = new CenterText(sp[n], fs, C.white);
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
    const wh = this.wh, x0 = wh * 2.95, y0 = wh * 1.65, fs = wh * .2;
    const inx = wh * .54, iny = wh * 1.32;
    const stripe = new RectShape({ x: inx, y: iny, w: this.getBounds().width - wh, h: wh * .6 }, chaosOrange, '')
    const circ = new CircleShape(chaosOrange, wh/2, ''); circ.x = inx; circ.y = iny + wh/4;
    this.addChild(stripe, circ);
    const specBg = spec.bg;
    let x00 = x0;
    specBg.forEach((spec, btype) => {  // btype: 0: Factory, 1: Outposts, 2: Stronghold
      const nbldgs = spec.length;
      const homeAry = new Array<Foundation>(nbldgs); // each Factory instance shares the same homeAry
      const [BC, bText, bid] = [
        [Factory, 'E2', 'F'],    // Foundry
        [Outposts, 'C', 'P'],    // outPost
        [Stronghold, 'G1', 'S'], // Stronghold
      ][btype] as [typeof Factory|typeof Outposts|typeof Stronghold, BONUS, number]

      spec.toReversed().forEach((gl, rndx) => {
        const ndx = nbldgs - 1 - rndx; // actual ndx in homeAry
        const x = x00 + ndx * wh * 1.01; // place bg from left-to-right
        const y = y0;
        // TODO: use TextTweaks to convert E*, C, G* to glyphs?
        const bonus = gl < 2 ? bText : [ 'E2  /    \n/\n    /  G1', 'E3'][gl-2] as BONUS;
        const Aname = `${bid}${this.player.facId}.${ndx}`;
        const bg = homeAry[ndx] = new BgFound(Aname, bonus, fs);
        if (gl == 1) bg.addGemLock(.35, .65);
        this.addChild(bg); bg.x = x; bg.y = y;
        if (gl == 2 || gl == 3) {
          bg.reCache();
          return; // no building in Factory slot 0
        }
        const fg = new BC(Aname, this.player, bg, homeAry);
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
   * @param produce { bg, fg }
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
    const wh = this.wh, x0 = wh * .55, y0 = wh * .55;
    const s1 = wh * 1.1;
    foundationIds.forEach((fid, ndx) => {
      const bText = fn[fid] as BONUS;
      const x = x0 + s1 * c[ndx];
      const y = y0 + s1 * r[ndx];
      const maker = (fs: number) => {
        const bg = new BgFound(fid, bText as BONUS, fs);;
        const fg = new Foundation(fid, '-', fs);
        if (ndx == 0 || ndx == gl) {
          fg.addGemLock();
        }
        return { bg, fg };
      }
      this.makePair({ x, y }, maker);
    })
  }

  /** a Counters & Buttons to move recruits into Base */
  addRecruits(spec: Faction, tw = this.wh * 5) {
    const nr = spec.nr, ft = spec.ft, c = this.pColor, wh = this.wh, fs = wh * .5, bfs = wh * .25;
    const x0 = wh * 3, y0 = wh * 4, dx = tw / nr.length, base = nr.length - 1;
    const cont = new NamedContainer(`recruits`, x0, y0);
    this.addChild(cont);
    cont.addChild(new RectShape({ x: -wh/2, y: -wh/2, w: tw + wh, h: wh }, 'black', ''))
    const addButton = (name: string, x: number, y: number) => {
      const button = new UtilButton(name, { bgColor: chaosOrange, active: true, fontSize: bfs});
      button.x = x;
      button.y = y;
      cont.addChild(button);
      return button;
    }
    // count the available recruit actions
    const ravail = new NumCounter(`ravail`, 0, C.white, fs)
    ravail.clickToInc();
    ravail.x += 0;
    ravail.y -= wh * .6;
    cont.addChild(ravail)

    const r3button = addButton(`R3->${spec.r3}`, wh, -wh * .6);
    r3button.on('click', () => {
      if (ravail.value >= 3) {
        ravail.incValue(-3);
        if (spec.r3 == 'G1') {
          this.player.gems += 1;
        } else if (spec.r3 == 'C') {
          // if (spec.r3 == 'C') draw a card into hand
          const source = this.player.gamePlay.table.cardSource; // TacticsCard.source;
          if (source.numAvailable == 0) TacticsCard.reshuffle();
          source.nextUnit();
          const card = source.takeUnit(false);
          this.cardPanel.addCard(card);
          this.stage.update()
        }
      }
    })
    if (ft > 0) { // AI does not have a FT button.
    const ft_button = addButton(`FT:${ft}`, wh * 2, -wh * .6);
    ft_button.on('click', () => {
      if (ravail.value > 0 && this.player.coins >= spec.ft) {
        this.player.coinCounter.incValue(-spec.ft);
        ravail.incValue(-1);
        rctrs[0].incValue(-1);
        rctrs[base].incValue(1); // <-- into base
      }
    });
    }
    // counters at each stage of recruit; last one represents the Base.
    const rctrs = [] as NumCounter[];
    nr.forEach((nr, i, ary) =>  {
      const rc = new NumCounter(`nr[${i}]`, nr, c, fs, undefined, [C.BLACK, C.WHITE]);
      rctrs[i] = rc; // rctrs.push(rc);
      rc.x = i * dx;
      cont.addChild(rc);
      if (i == base) {
        rc.x += dx;
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

  baseTile!: ChaosTile;
  // make ChaosTile, set color, set Harvest token
  setupBase(spec: Faction) {
    const h = spec.bh ?? '-';
    const baseTile = new ChaosTile(`${spec.name}Base`, 'Base', h, this.player);
    baseTile.paint(this.pColor)
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
    const cButton = new UtilButton('CCCC', { active: true, corner: .1, fontSize: dxdc * .2 });
    cButton.x = dxdc * .5;
    cButton.y = height - 1.7 * dydr;
    this.addChild(cButton);
    cButton.on('click', () => { cardPanel.visible = !cardPanel.visible; this.stage.update() })
    return cardPanel;
  }

  /**
   * A row of 6 PricingToken with a home on this Panel
   */
  addPriceTokens(table: Table, row = 0) {
    const np = this.player.gamePlay.allPlayers.length;
    const { x, y, width, height } = this.getBounds();
    const h = this.wh, w = h * 2, gap = h * .25;
    const x0 = x + w * 0.76 - gap;
    const y0 = y + height - h * .75;

    for (let i = 1; i <= 6; i++) {
      const xy = { x: x0 + i * (w/2 + gap), y: y0 };
      const pt = new PricingToken(np, i as PriceId, xy, this.player);
      pt.sendHome()
    }
  }

  // maybe a super-class of CardPanel? *any* mapCont? see game-setup where we Panel.mixin(HexMap2, PlayerPanel)
  /**
   * array of colN hexes across the width of mapCont (CardPanel is the mapCont of ChaosPlayerPanel);
   *
   * Uses mapCont.getBounds(), to that must be set.
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
