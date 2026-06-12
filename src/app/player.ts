import { arrayN, C, Constructor, stime } from "@thegraid/common-lib";
import { CenterText, NamedContainer, RectShape } from "@thegraid/easeljs-lib";
import { HexMap, newPlanner, NumCounter, Player as PlayerLib, PlayerPanel, type IHex2, type MapCont, type TileSource } from "@thegraid/hexlib";
import { ChaosHex2 as Hex2, type ChaosHex2 } from "./chaos-hex";
import { type ChaosTable, type ChaosTable as Table } from "./chaos-table";
import { ChaosTile, type RESOURCE } from "./chaos-tile";
import { BgFound, Foundation } from "./foundation";
import { type GamePlay } from "./game-play";
import { ChaosPresence, type Barracks, type ChaosBuildingType, type ChaosUnitType, type Factory, type Fighter, type Leader, type Stronghold } from "./meeples";
import { TP } from "./table-params";
import { CardBack, CardPanel } from "./tactics-card";

/** Canonical Faction colors, aligned with gameSetup.factionNames.
 *
 * Each canonical color is mapped to an HTML color string for display: Player.colorScheme[cname]
 */
//                  Circadian   AI   Zcharo   Leyrein   JRayek   Oxytaya
const playerColors = ['gold', 'grey', 'blue', 'green', 'orange', 'violet', ] as const;
export type PlayerColor = typeof playerColors[number];

// 5 Bonus Foundations, named for the bonus they give; stronghold & one other have gemlock
const foundationIds = ['research', 'harvest', 'adjacent', 'unlock', 'handlimit'] as const;
type FoundationId = typeof foundationIds[number];

/** presentation name of each Faction */  // TODO: move these to Scenario & parser?
export const factionNames = ['Circadian', 'AI', 'Zcharo', 'Leyrein', 'Jrayek', 'Oxytaya'] as const;
export type FactionName = typeof factionNames[number];
export type FactionId = 0 | 1 | 2 | 3 | 4;  // at most 5 Factions in game

/** rb: RelicBonus, fg: foundation w/gem, serial [0..4], bg: building w/gemlock (index per type), nr: number in recruit, bi: income0 */
type FacSpec = {name: FactionName, rb: string[], fg: number, bg: number[][], nr?: number[], bi?: number };
type BaseSpec = {name: FactionName, bh?: RESOURCE, bf: [RESOURCE, RESOURCE] }

/** per-Player bits on PlayerPanel */
class PlayerBits {
  leaders: Leader[] = [ ];              // LeaderCard is a Tile, leader.homeHex is tile.hex (tile: card, meep: leader)
  fighters!: TileSource<Fighter>[];     // TileSource[n] for each stage of Recruit (Base is ChaosTile, sans foundations)
  factorys!: TileSource<Factory>;       // Spread TileSource.filterUnits((u)=>!u.hex.isOnMap) across board
  barracks!: TileSource<Barracks>;      // Spread TileSource.filterUnits((u)=>!u.hex.isOnMap) across board
  strongholds!: TileSource<Stronghold>; // Spread TileSource.filterUnits((u)=>!u.hex.isOnMap) across board
  foundations!: Record<FoundationId, ChaosHex2>; // the 5 foundations in their places
  // extend with Morale[], AI_Trap[], RhyzuToken[]
}

export class Player extends PlayerLib {
  static initialCoins = 6;
  static initialGems = 0;

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
  declare table: ChaosTable;

  facName: FactionName;
  facId: FactionId;

  constructor(index: number, gamePlay: GamePlay) {
    super(index, gamePlay); // <-- index is 'table ordinal'
    this.facName = gamePlay.gameSetup.facNames[index];
    this.facId = gamePlay.gameSetup.facIds[index];     // Aname and HTML color should be aligned with facId
    const cname = playerColors[this.facId];
    ;(this as any).Aname = `P${index}:${cname}*`
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
    // TODO: make racks for: factory, barracks, stronghold, foundations, relics
    this.makeUnitRack(this.gamePlay.table, .75, 3);
    // this.makeCardRack(this.gamePlay.table, undefined, 6); // Player's cards on playerPanel
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
  readonly unitRack: Hex2[] = [];
  makeUnitRack(table: Table, row = 0, ncols = 4) {
    const hexes = table.hexesOnPanel(this.panel, row, ncols) as Hex2[];
    hexes.forEach((hex, n) => hex.Aname = `${this.index}R${n}`)
    this.unitRack.splice(0, this.unitRack.length, ...hexes); // replace all elements
  }
  /** all Buildings on panel? make racks for each Building type? use simple array/stack? */
  get units() { return this.unitRack.map(hex => hex.tile) }
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
  static byName = new Map<string, Panel>(); // by god.name, not className(god): 'Set' not 'SetGod'

  // Relic bonus = rb: G: Gem, F: Fame, E: Energy, M: Morale, Up: Upgrade Attribute(flip),
  // Bldg gemlock= bg: [[0, 1, 1], [0, 0, 1, 1], [0, 1]] <== Zcharo! always 9 there are
  // Base income = bi?: 3 | undefined => 2/G
  // Num recruit = nr: [8, 6, 6] initial number of Fighters in each stage & base
  // Foundation w/gem = fg: 1-4 (0 is implicit) [gem->res, ubiq harv, ubiq adj, gemlock, handlim]
  //
  // Factory: Energy2, Baracks: Card, Stronghold: Gem (--> %)
  // Stronghold = sf?: () => void;
  // Circadian: Build:restrict, Income: +region
  // Zcharo: Combat: strength
  // AI: Move: trap, Income: reset
  // Leyrein: Build: restrict, Combat: +strength, Income: +Fame
  // Jrayek: Combat: +str, +shield
  // Oxytaya: Recruit: placement option

  static facSpecs: FacSpec[] = [
    { name: 'Circadian', rb: ['G1', 'Up', 'G1', 'Up', 'Up', ], fg: 2, bg: [[0,0,0], [0,0,0], [1,1,1]], nr: [6, 2, 0, 2], bi: 3, }, // no base; 10 Fighters
    { name: 'AI',        rb: ['F1', 'F2', 'F2', 'F3', 'F4', ], fg: 2, bg: [[0,1,1], [0,0,1,1], [0,1]], nr: [12, 8], }, // +10 on copious
    { name: 'Zcharo',    rb: ['G1', 'G1', 'G1', 'G1', 'G1', ], fg: 3, bg: [[0,0,0], [1,1,1], [0,1,1]], nr: [9, 5, 6], bi: 3, },
    { name: 'Leyrein',   rb: ['M0', 'F2', 'F2', 'F3', 'F3', ], fg: 1, bg: [[0,0,1], [0,0,1], [1,1,1]], nr: [8, 6, 6], },
    { name: 'Jrayek',    rb: ['E2', 'F1', 'E3', 'F1', 'F1', ], fg: 2, bg: [[0,0,1], [0,1,1], [0,0,1]], nr: [10, 4, 6], },
    { name: 'Oxytaya',   rb: ['F1', 'F1', 'F1', 'F2', 'F3', ], fg: 1, bg: [[0,1,1], [0,0,1], [0,1,1]], nr: [12, 3, 5], },
  ]

  // Base harvest= bh?: E1, E2, G1, R1
  // Base foundations = bf: [string, string]
  static baseSpecs: BaseSpec[] = [
    { name: 'Circadian', bh: '-', bf: ['%', 'E2'] }, // no base
    { name: 'AI',        bh: 'E1', bf: ['G1', 'E2'] },
    { name: 'Zcharo',    bh: 'E2', bf: ['C', 'G1'] },
    { name: 'Leyrein',   bh: 'E2', bf: ['C', 'E2'] },
    { name: 'Jrayek',    bh: 'G1', bf: ['G1', '%'] },
    { name: 'Oxytaya',   bh: 'R1', bf: ['C', 'C'] },
  ]
  facName: FactionName;
  baseSpec!: BaseSpec;
  facSpec!:FacSpec;

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
  readonly buildingHomes: Partial<Record<ChaosBuildingType, Hex2[]>> = {};

  /** the 'hand' of TacticsCards */
  readonly cardRack: Hex2[] = [];
  cardPanel!: CardPanel;

  constructor(table: Table, player: Player, high: number, wide: number, row: number, col: number, dir?: number) {
    const hexMap = table.hexMap;
    super(table, player, high, wide, row, col, dir); // make a PlayerPanel
    Object.assign(this, hexMap);       // assign hexMap instance variables
    this.Aname = player.Aname;         // reset Aname
    this.player.color = Player.playerColor(this.player.cname!); // override Player.colorScheme
    this.bg0 = C.grey64; 'rgb(56, 56, 56)';
    this.bg1 = this.bg0;
    const facName = this.facName = this.player.facName;
    this.facSpec = Panel.facSpecs.find(spec => (spec.name == facName))!;
    this.baseSpec = Panel.baseSpecs.find(spec => (spec.name == facName))!;
    console.log(stime(this, `.constructor: factionId=${this.factionId} cname=${this.player.cname} ${facName}`))
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
    this.cardPanel = this.addCardPanel(table);
    this.addRelics(this.facSpec);
    this.addBuildings(this.facSpec);
    this.addFoundations(this.facSpec, table)
    this.setupBase(this.baseSpec);
    this.player.gamePlay.hexMap
    return this.children;
  }

  addRelics(spec: FacSpec) {
    const { x, y, width, height } = this.getBounds();
    const w = width / (6.5), h = w / 2, gap = 4;
    const x0 = x + w * 2, y0 = y + h / 2;
    const sp = spec.rb;
    arrayN(5).forEach(n => {
      const cont = new NamedContainer(`Relic${n}`)
      const foreColor = C.nameToRgbaString(this.player.color, .7);
      const bgrect = new RectShape({ x: -w/2, y: -h/2, w: w-gap, h, s: 0 }, foreColor, '');
      const fs = h / 2, dx = w * .23;
      const resIcon = new CenterText('%', fs, C.white);
      resIcon.x = - dx; resIcon.y = 0;
      const specIcon = new CenterText(sp[n], fs, C.white);
      specIcon.x = + dx; specIcon.y = 0;
      cont.addChild(bgrect, resIcon, specIcon);
      cont.x = x0 + n * w - gap/2;
      cont.y = y0;
      this.addChild(cont);
    });
    return;
  }

  // add Income & Buildings; set playerColor & Harvest icon on Base.
  addBuildings(spec: FacSpec) {

  }

  addFoundations(spec: FacSpec, table: Table) {
    const fg = spec.fg, r = [ 1, 2, 3, 2, 3 ], c = [ 1, 1, 1, 0, 0 ];
    const fn: Record<FoundationId, string> = {
      research: 'Gem\nto\nResearch',
      harvest: 'All\n\nHarvest',
      adjacent: 'All\n\nadjacent',
      unlock: '-E2\nV\nunlock',
      handlimit: '+E2\n\n5 Cards'
    }
    const s = Foundation.xy, x0 = s * .55, y0 = s * .55;
    const s1 = s * 1.1;
    const nc = this.numChildren;
    arrayN(5).forEach(ndx => {
      const fx = x0 + s1 * c[ndx];
      const fy = y0 + s1 * r[ndx];
      const fid = foundationIds[ndx];
      const bg = new BgFound(fid, fn[fid] as RESOURCE, s * .2);
      bg.x = fx;
      bg.y = fy;
      bg.icon.y -= (bg.icon as CenterText).getMeasuredLineHeight() * 1.0; // raise to center
      this.addChildAt(bg, nc);

      const f = new Foundation(fid, '-', s * .2);
      if (ndx == 0 || ndx == fg) {
        f.addGemLock();
      }
      f.homeXY = { x: fx, y: fy };
      f.x = fx; f.y = fy;
      f.faceUp()
      this.addChild(f);
    })
  }

  baseTile!: ChaosTile;
  // make ChaosTile, set color, set Harvest token
  setupBase(spec: BaseSpec) {
    const h = spec.bh ?? '-';
    const baseTile = new ChaosTile(`${this.facName}Base`, 'Base', h, this.player);
    baseTile.paint(this.pColor)
  }

  addCardPanel(table: Table, row = 0, ncols = 6) {
    // ChaosPlayerPanel { this.mapCont = new CardPanel(table); this.addChild(this.mapCont); }
    const dydr = table.hexMap.xywh().dydr;
    const cardH = CardBack.bounds.height;
    const high = cardH * 1.05 / dydr;  // units of hex.dydr
    const wide = table.panelWidth;
    const cardPanel = new CardPanel(table, high, wide, row, 0); // directly on table.mapCont! (so localToLocal works?)
    const pHeight = this.getBounds().height;
    row = (row !== 0) ? row : - high * 1.045;   // up by high, align CardPanel bottom to Panel bottom
    cardPanel.y = (row < 0 ? row + pHeight/dydr : row) * dydr;
    cardPanel.makeDragable(table);
    this.mapCont = cardPanel;
    this.addChild(cardPanel);
    cardPanel.fillAryWithCardHex(this, this.cardRack, high/2, ncols)
    cardPanel.visible = true;
    return cardPanel;
  }

  // maybe a super-class of CardPanel? *any* mapCont?
  /**
   * array of colN hexes across the width of mapCont (CardPanel is the mapCont of ChaosPlayerPanel);
   *
   * Uses mapCont.getBounds(), to that must be set.
   *
   * @param cPanel panel to hold the row of hexes
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
    // verify prototype functions and instance variables are installed:
    // GameSetup.static{} & ChaosPlayerPanel.constructor conspire to do this.
    // With backup in: table.makePlayerPanel(), and here: ChaosPlayerPanel.hexesOnMapCont
    // if (!map.topo) {
    //   console.log(stime(this, `.assign(map=${map.name}, this.hexMap=${table.hexMap.Aname}`));
    //   Object.assign(map, table.hexMap);
    //   // assume for now that PlayerPanel has mixinAB(PlayerPanel, HexMap<Hex2>)
    //   if (typeof map.addToMapCont !== 'function') {
    //     debugger;
    //     mixins.mixinHexMap(PlayerPanel, HexMap2)
    //   }
    // }
    const { width: panelw } = cPanel.getBounds();
    const { x: xn, dydr, dxdc } = this.hexMap.xywh(undefined, 0, colN - 1); // x of last cell
    const gpix = gap < 1 ? gap * dxdc : gap;
    const dx = (panelw - xn - (colN - 1) * gpix) / 2; // allocate any extra space (width-xn) to either side
    const dy = row0 * dydr;   // y for row0
    for (let col = 0; col < colN; col++) {
        // make hex at row=0, then offset by row0 !? legacy from hextowns half-offset?
        const hex = table.newHex2(0, col, `CardPanel`, hexC, map); // child of map.mapCont.hexCont
        rv.push(hex);
        hex.cont.x += (dx + col * gpix);
        hex.cont.y = (dy);
        hex.cont.visible = vis;
        hex.legalMark.setOnHex(hex);
    }
    return rv;
  }

}
