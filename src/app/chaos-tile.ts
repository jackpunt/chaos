import { C, permute, removeEltFromArray, S, stime } from "@thegraid/common-lib";
import { AliasLoader, NamedContainer, type Paintable, RectShape, TextInRect } from "@thegraid/easeljs-lib";
import { type DragContext, H, type HexDir, HexShape, type IHex2, MapTile, Player as PlayerLib, type Table, TP } from "@thegraid/hexlib";
import { type ChaosHex2, type ChaosHex2 as Hex2, type HexMap2 } from "./chaos-hex";
import { type ChaosTable } from "./chaos-table";
import { type Faction } from "./factions";
import { Foundation } from "./foundation";
import type { GamePlay } from "./game-play";
import { AI_Trap, ChaosBuilding, Factory, Leader, Morale, Outposts, Relic, Stronghold } from "./meeples";
import type { Player } from "./player";
import type { FactionOnTileState } from "./scenario-parser";
import { bonusIcon, CO } from "./table-params";

declare module '@thegraid/easeljs-module' {
  interface Graphics {
    /**
    * Draws a polygon from array of point arrays.
    *
    *      myGraphics.beginFill("#FF0").drawPolygon([100, 100], [150, 50], [200,100], [200,200], [100,200]);
    *      // makes a house shape
    *
    * A tiny API method "pg" also exists.
    *
    * @method drawPolygon
    * @param {Array} points An array of [x,y] points.
    * @param {Boolean} close Whether to close the polygon - default is true.
    * @return {Graphics} The Graphics instance the method is called on (useful for chaining calls.)
    * @chainable
    **/
    drawPolygon(points: [number, number][], close: boolean): void;
    /** short form of drawPolygon */
    pg(points: [number, number][], close: boolean): void;
  }
}


/** Graphic target to indicate which Region Pair user wants for base foundations */
class PairTarget extends RectShape {
  static targets: PairTarget[] = [];
  static removeTargets() {
    PairTarget.targets.forEach(pt => pt.parent.removeChild(pt));
    PairTarget.targets.length = 0;
  }

  /** create PairTarget and add to PairTarget.targets; and show on overCont. */
  constructor(public pair: [ChaosHex2, ChaosHex2]) {
    const map = pair[0].map as HexMap2;
    const dir01 = pair[0].findLinkHex(hex => (hex == pair[1]));
    if (!dir01) {
      throw(`new PairTarget: hexes ${pair} are not adjacent`);
    }

    const dx = TP.hexRad * .3, dy = dx*2;
    super({ x: -dx/2, y: -dy/2, w: dx, h: dy }, CO.mauve, '');
    PairTarget.targets.push(this);

    this.rotation = (H.dirRot[dir01]);
    pair[0].edgePoint(dir01, 1, this);      // set RectShape on edge of Hex
    map.mapCont.overCont.addChild(this); // place on top of other tiles
  }
}

/** the resource and/or action that can be harvested from a ChaosTile */
class HarvestToken {
  harvestId!: HARVEST;
  getValue(player: Player, id = this.harvestId): boolean {
    switch(id) {
      case 'E2':
        player.coins += 2;
        return false;
      case 'E1':
        player.coins += 1;
        return false;
      case 'G1':
        player.gems += 1;
        return false;
      case 'R1':
        // single recruit action (AI Base)
        return true;
      case 'R3':
        // 3 recruit actions (the buff)
        return true;
    }
    return false;
  }
}

// 'Base' tile marks space where a Faction Base can be placed (replacing the place-keeper)
const terrainIds = ['Mtn', 'Hills', 'Swamp', 'Plains', 'Lake', 'Base', 'Ldr'] as const;

// 'energy' is E2, 'energy1' is E1, 'recruit1' is 'R1'
// energy1 on AI Base; 'recruit1' on Oxytaya Base
// Note: Tile.setNameText() converts '-' to newline
// board_HARVEST:          ['E2', 'G1', 'C']
// relic_Foundation bonus: ['E2', 'G1', 'C', '%', '-', ]  ('-' on Relic-6: never claimed)
// panel_Foundation bonus: ['-']
// panel_BgFound bonus:    [... various text...]
// panel_Building income:  ['E3', 'E2', 'G1', 'C']    // E3 for BldgFoundation[0] (base Income)
/** basic Bonus for Foundation and Harvest */
const bonusIds = ['-', 'E3', 'E2', 'E1', 'C', 'G1', 'R1', '%'] as const; //

// %, Energy, Gem, Card, Build, Recruit, Leader, Harvest, Move, Upgrade(leader), Attribute(upgrade)
/** upgrade tokens which can be flipped; Lm2: Leader deploy/upgrade for -2E; Bm1: Build for -1E */
const baseProdTokenIds = ['%', 'R3', 'G2', 'E4', 'E1C', 'R1C', 'Lm2', 'Bm1'] as const; // 8 basic
const upgradeProdTokenIds = ['%E2', 'R4', 'G2R1', 'E6', 'E3C', 'R2C', 'LE0', 'BG0'] as const;
// BG0: Build w/free gemlock (~B -2E if you have the unlock Foundation)

export type TERRAIN = typeof terrainIds[number];
export type BONUS = typeof bonusIds[number];
export type BASE_PROD_TOKEN = typeof baseProdTokenIds[number];
export type UPGRADE_PROD_TOKEN = typeof upgradeProdTokenIds[number];
export type PROD_TOKEN = BASE_PROD_TOKEN | UPGRADE_PROD_TOKEN;
export type HARVEST = BONUS | PROD_TOKEN;
export type FAME_BONUS = 'E1' | 'E2' | 'C' | 'G1' | '%' | 'R1' | 'R2' | 'M1' | 'Win' | 'End'; // M1 is Redeploy

// the harvest token when upgraded gains the second
const flipBuff: Partial<Record<PROD_TOKEN, string>> = {
  '%': '%E2',
  R3: 'R4',
  G2: 'G2R1',
  E4: 'E6',
  E1C: 'E3C',
  R1C: 'R2C',
  Lm2: 'LE0',
  Bm1: 'BG0',
};


const colorOfTerrain: Record<TERRAIN, string> = {
  Mtn: C.grey64,
  Hills: C.nameToRgbaString(C.dimYellow, .5),
  Swamp: C.nameToRgbaString(C.lightgreen, .5),
  Plains: C.nameToRgbaString(C.BROWN, .5),
  Lake: C.lightblue,
  Base: C.WHITE,  // color of temp Tiles placed on hexes reserved for 'Base' Tiles
  Ldr: C.WHITE,
}


/** per-Player bits on map Tile/Hex; add one for each Faction, in apprpriate place
 *
 * @param player: indicates color of glyphs and sector (unless tile.isBase) for this Faction
 * @param tile: parent of FoT; (glyphs are on overCont above tile)
 */
export class FactionOnTile extends NamedContainer {

  leaders: Leader[] = [ ];              // 2+ slots (own + Rhyzu), Zcharo: 4, Oxytaya: 4
  fighters = 0;                         // number of fighters in slot, followed by Leader(s)
  strength = 0;                         // Apparent strength of Faction
  pins = 0;
  buildings: ChaosBuilding[] = [];      // if this Faction has buildings on tile

  get facId() { return this.player.facId; }
  get index() { return this.player.index; }

  fighterIcon: TextInRect;

  constructor(public player: Player, public tile: ChaosTile) {
    super(`FoT-${player.facId}`);
    const fontSize = tile.radius * .2;
    this.fighterIcon = new TextInRect('0', { bgColor: this.player.color, fontSize, border: [.2, .2, .2, 0], corner: .1 } )
    this.addChild(this.fighterIcon); // at (0, 0)
    this.setXY();   // move to sector for player
    this.tile.addChild(this);
    // this.update();
  }

  // methods to add/remove elements
  addLeader(ldr: Leader, add = true) {
    if (add) {
      if (!this.leaders.includes(ldr)) {
        this.leaders.push(ldr);
        ldr.factOnTile = this;
      }
      this.addChild(ldr); // move to top...
    } else {
      removeEltFromArray(ldr, this.leaders);
      this.removeChild(ldr)
      // ldr.factOnTile = undefined;
    }
    this.update()
  }

  addFighter(n = 1) {
    this.fighters = Math.max(0, this.fighters + n);
    this.fighterIcon.label_text = `${this.fighters}`;
    this.update();
  }

  addBuilding(bldg: ChaosBuilding, add = true) {
    // building graphics handled by ctile.foundations
    if (add) {
      this.buildings.push(bldg);
    } else {
      removeEltFromArray(bldg, this.buildings);
    }
  }

  //  L1 L2 L3 .. LN
  //    ------
  //      FC


  //  2 -- 4 Players:
  //     11            22
  //    1111          2222
  //  11111111      22222222
  //
  //  44444444      33333333
  //    4444          3333
  //     44            33
  //
  //  5 Players:
  //     11  22222222  33
  //    1111   2222   3333
  //  11111111  22  33333333
  //
  //  55555555      44444444
  //    5555          4444
  //     55            44
  //
  //                2  3  4  5
  static invert = [[2, 2, 2, 2],
                   [2, 2, 2, 0],
                   [0, 0, 0, 2],
                   [0, 0, 0, 0],
                   [0, 0, 0, 0],
                  ];
  static offset = [[0, 0, 0, 0],
                   [2, 2, 2, 1],
                   [0, 0, 2, 2],
                   [0, 0, 0, 2],
                   [0, 0, 0, 0],
                  ];
  // y orientation within the sector:
  get invert() { return -1 + (FactionOnTile.invert[this.index][TP.numPlayers - 2] ?? 0)};
  // x-offset of sector:
  get offset() { return -1 + (FactionOnTile.offset[this.index][TP.numPlayers - 2] ?? 0)};
  get isBase() { return this.tile.terrain == 'Base' || this.tile.terrain == 'Ldr' }

  /** move FoT to sector for isBase ? Base : player.index */
  setXY(rad = this.tile.radius) {
    const index = this.index;     // table order determines FoT placement
    // sx, sy: sector placement;
    const sx = (this.isBase ?  0 : this.offset) * rad; // -1: left side; offset[][] = 0
    const sy = (this.isBase ? -1 : [0, 1].includes(index) ? -1 : [3, 4].includes(index) ? 1 : TP.numPlayers == 5 ? -1 : 1);
    this.x = sx/2;
    this.y = sy * rad * H.sqrt3_2/2;
  }

  /** update graphics */
  update() {
    const rad = this.tile.radius, overCont = this.tile.hex!.map.mapCont.overCont;
    // invert: 1 --> leaders on top;  -1 --> leaders on bottom;
    const yh = (this.isBase ? -1 : this.invert) * rad * H.sqrt3_2;
    this.fighterIcon.y = yh * 0;
    this.fighterIcon.visible = (this.fighters > 0);
    if (this.leaders.length > 0) {
      // location of leader line:
      const yl = yh * .33; // assuming 2 of 5 orientation == Base!
      const lineWidth = rad * (this.leaders.length * .29); // Leader.box_width = (.2 * 1.4) * hex.radius
      const gap = lineWidth/this.leaders.length;
      const xl = gap/2 - lineWidth/2;
      this.leaders.forEach((ldr, n) => {
        ldr.x = xl + n * gap;
        ldr.y = yl;
        if (!this.isBase) {
          // re-parent from non-dragable mapTile to overCont:
          this.localToLocal(ldr.x, ldr.y, overCont, ldr);
          overCont.addChild(ldr);
        } // during setup: Base is movable & we want Leaders to move with it
      })
    }
    this.tile.cacheID && this.tile.updateCache();
    this.stage.update();
  }

  /** maybe/beginning what we need to saveState of Map.
   *
   * @return FactionOnTileState for this Player.
   */
  getState() {
    const buildings = this.tile.buildings;
    const rv = {
      l: this.leaders.map(l => `${l.Aname}${l.upgraded ? '*': ''}`),
      f: this.fighters,
    } as FactionOnTileState;

    if (buildings && buildings[0].player == this.player) {
      rv.b = buildings.map(b => b.Aname[0]) as ('F'|'P'|'S')[];
    }
    if (this.tile.special) {
      rv.s = this.tile.special.status;
    }
    return rv
  }
}


/** MapTile
 * ChaosTile: Tile with Terrain & Harvest icon.
 *
 * also: the extension tiles: 3 each of Yellow, Blue, Red
 *
 * Chaos does not need a 'source' of tiles.
 */
export class ChaosTile extends MapTile {

  static readonly allChaosTiles: ChaosTile[] = [];

  declare gamePlay: GamePlay;
  declare player: Player | undefined;
  declare fromHex: Hex2;
  /** this.hex as ChaosHex */
  get chex() { return super.hex as Hex2; }

  static curTable: ChaosTable;

  override toString(): string {
    super.toString();
    return `${this.Aname}`;
  }

  readonly terrain!: TERRAIN; // immutable
  harvest!: HARVEST;          // can place harvest buff token to change
  harvest_buff?: HARVEST;     // TODO: need additional HARVEST types

  /** hold all the Faction Units; index by FactionId (or PlayerId?) */
  factions: FactionOnTile[] = [];

  /** set if there is a Relic on this Tile; */
  relic?: Relic;

  special?: Morale| AI_Trap;

  // Note: "Zcharo may have up to 2 Outposts in each Region";
  // one [Zcharo?] Leader can build w/o foundation! we will place a pseudo-Foundation and remove if bldg is destroyed.
  // saveState reduces buildings to ('F'|'P'|'S')[]
  get buildings() {
    return this.foundations.map(f => f?.bldg).filter(b => !!b);
  }

  // Tiles: isLegalTarget(hex, ctx) => (hex.foundations.length < 3)
  foundations: [Foundation?, Foundation?, Foundation?] = [undefined, undefined, undefined]; // Factory, Baracks, Stronghold

  // Meeples: isLegalTarget(hex, ctx) => !hex[this.type] && foundations.find(f=>!f.bldg)
  Factory!: Factory;        //
  Outposts!: Outposts;      //
  Stronghold!: Stronghold;  //

  constructor(Aname: string, t: TERRAIN, h: HARVEST, player?: PlayerLib) {
    super(Aname, player);
    this.terrain = t;
    this.harvest = h;
    this.nameText.y = this.radius * .66;
    this.addChild(this.nameText);        // re-add above afHex
    this.addHarvest();
    // this.setPlayerAndPaint(player);
    this.paint();
    ChaosTile.allChaosTiles.push(this);
  }

  // paint the [terrain or base] color onto the baseShape;
  override paint(colorn = colorOfTerrain[this.terrain], force?: boolean): void {
    super.paint(colorn, force)
  }

  addHarvest() {
    const icon = bonusIcon(this.harvest)!;
    icon.y = this.radius * .41;
    this.addChild(icon);
  }

  override makeShape(): Paintable {
    return new HexShape(); // basic HexShape, not the TileShape
  }

  static makeAllTiles() {
    // GameSetup.initialize() -> AfHex.makeAllAfHex()
    // GameSetup.startScenario() -> layoutTable() -> makeAllPlayers()
    // make a Tile for each AfHex.
  }

  // Note: Foundations are ~never removed.
  ndxForFoundation() {
    return [1, 2, 0].find(ndx => this.foundations[ndx] == undefined);
  }

  canAddFoundation() {
    return this.ndxForFoundation() !== undefined;
  }

  // allocate room for 3 foundations; TODO: if user places more...?
  // "Each Region can contain no more than 3 Foundations"
  addFoundation(f: Foundation, commit = true) {
    const ndx = this.ndxForFoundation();
    if (commit && ndx != undefined) {
      this.foundations[ndx] = f;
      f.onTile = this;   // record Foundation is onTile on the map.
      // Graphically above this.hex:
      const hex = this.chex, dx = f.radius * 1.03, dy = hex.radius * 2.34;   // <<< foundation.y
      f.scaleX = f.scaleY = Foundation.mapScale;  // scale down when drop on map
      f.x = hex.x + (ndx-1) * dx * f.scaleX;
      f.y = hex.y + dy * f.scaleY;
      f.faceUp(true);
      f.homeXY = { x: f.x, y: f.y };    // see Foundation.sendHome()
      this.chex.mapCont.overCont.addChild(f);
      f.mouseEnabled = false;
    }
    return ndx;
  }

  /** for Relic Foundations when Relic is D&D moved: */
  removeFoundation(f: Foundation) {
    f.parent?.removeChild(f);
    this.foundations[this.foundations.indexOf(f)] = undefined;
    f.onTile = undefined;
    f.sendHome();
  }

  override isDragable(ctx?: DragContext): boolean {
    return false;   // User/GUI cannot rearrange MapTile
  }

  // Delegate FoT actions to the associated FoT: TODO: set FoT location on creation, not every fot.update!
  getFoT(player: Player) {
    return this.factions[player.index] ?? (this.factions[player.index] = new FactionOnTile(player, this));
  }
  addLeader(ldr: Leader, add?: boolean) {
    this.getFoT(ldr.player).addLeader(ldr, add)
  }
  addFighter(player: Player, n = 1 ) {
    this.getFoT(player).addFighter(n)
  }
  addBuilding(bldg: ChaosBuilding, add?: boolean) {
    this.getFoT(bldg.player).addBuilding(bldg, add)
  }
}

export class BaseTile extends ChaosTile {
  constructor(faction: Faction) {
    super(`${faction.name}Base`, 'Base', faction.bh, faction.player);

    const image = AliasLoader.loader.getBitmap(faction.name);
    const si = .8;
    image.scaleX *= si;
    image.scaleY *= si;
    image.x -= TP.hexRad * .15;
    image.y += TP.hexRad * .4;
    this.addChild(image)
  }
 override addHarvest() {
    const icon = bonusIcon(this.harvest)!;
    icon.x = this.radius * .37;
    icon.y = this.radius * .37;
    this.addChild(icon);
  }

  // no Foundations allowed in Base
  override ndxForFoundation() {
    return undefined;
  }

  // The only draggable ChaosTile will be the BaseTiles;
  // Leaving this code for when we build them
  // Also drag Building (as meeps) to Build and self-drop
  override cantBeMovedBy(player: PlayerLib, ctx: DragContext): string | boolean | undefined {
    if (this.hex?.isOnMap && !ctx.lastShift) return 'Base is on map';
    return super.cantBeMovedBy(player, ctx);
  }

  override isDragable(ctx?: DragContext): boolean {
    return true;
  }

  override dragStart(ctx: DragContext): void {
    super.dragStart(ctx); // --> cantBeMovedBy()
    {
      PairTarget.removeTargets();
      // unlink base & remove baseFoundations! (because shiftkey-move)
      this.rmBaseFoundationsAndUnlink(ctx); // if is dragging...
    }
  }

  // dragStart -> markLegal; dragFunc(ctx.info.first) -> setLegalColors
  override markLegal(table: Table, setLegal = (hex: IHex2) => { hex.setIsLegal(false); }, ctx = table.dragContext) {
    table.hexMap.forEachHex(setLegal); // --> .isLegalTarget(toHex, ctx)
  }

  // constraints to drag/drop a ChaosTile (place a Base)
  override isLegalTarget(toHex: Hex2, ctx: DragContext): boolean {
    return !toHex.tile;
  }

  override dropFunc(targetHex: Hex2, ctx: DragContext): void {
    if (targetHex == this.hex) return;
    super.dropFunc(targetHex, ctx);
    // TODO: choose hexes for base foundations
    this.addBaseFoundationsAndLink(targetHex, ctx);
  }

  /**
   * Link base Hex to map.
   *
   * If this Base is adjacent to > 2 Regions, select which to use (and place mountains)
   *
   * Then place faction's bf on the two Regions.
   */
  addBaseFoundationsAndLink(hex: Hex2, ctx: DragContext) {
    // link base hex to adjacent non-Mtn Hexes
    const map = this.hex!.map as HexMap2;
    map.link(hex);      // link to all adjacent hexes
    map.unlink(hex, (nHex) => nHex.tile?.terrain == 'Mtn'); // rm links to Mtn tiles
    const pairs = this.getAdjacentPairs(hex);  // find each pair of adjacent regions
    if (pairs.length == 0) {
      // on player panel; do nothing
    } else if (pairs.length == 1) {
      this.placeFactionBaseFoundations(pairs[0]);
    } else {
      this.chooseAdjacentPair(hex, pairs);
    }
  }

  getAdjacentPairs(hex: Hex2) {
    // cycle through hex.linkDirs[i], [i+1 % 6]
    const mapDirs = (hex.map as HexMap2).linkDirs;  // assume length == 6; [N, EN, ES, S, WS, WN ]
    const pairs: [Hex2, Hex2][] = [];  // push [hex1, hex2]
    const isRegion = (hex?: Hex2) => { return hex?.tile && hex.tile.terrain != 'Mtn' && hex.tile.terrain != 'Lake'};
    const links = hex.links as Partial<Record<HexDir, Hex2>>; // avoid & Partial<Record<HexDir, any>>
    mapDirs.forEach((dir, ndx) => {
      const hex1 = links[dir];
      const hex2 = links[mapDirs[(ndx + 1) % 6]]; // next hex in rotation
      if (isRegion(hex1) && isRegion(hex2)) {
        pairs.push([hex1!, hex2!]);
      }
    })
    return pairs;
  }

  // Base must choose which pair of Hexes to use & add mountains
  chooseAdjacentPair(hex: Hex2, pairs: [Hex2, Hex2][]) {
    const map = this.hex!.map as HexMap2;
    // and to place mountain(s) to block other(s)
    // put GUI selector on each pair; on(click) -->
    // --> place mountains on other side(s) of Base
    // --> placeFactionBaseFoundations(pairs[n])
    const cb = (pairTarget: PairTarget) => {
      PairTarget.removeTargets();
      const pair = pairTarget.pair;
      const hexes = pairs.flat();
      hexes.forEach(hex2 => pair.includes(hex2) || map.placeMtn(hex, hex2));
      this.placeFactionBaseFoundations(pair); hex.map.update()
    }
    pairs.forEach(pair => {
      try {
        const pairTarget = new PairTarget(pair);
        pairTarget.on(S.click, (evt) => cb(pairTarget))
      } catch (msg) {
        console.warn(stime(this, `.addBaseFoundataionsAndLink: ${msg}`))
      }
    });
  }

  baseRegions?: [Hex2, Hex2];  // Note: only used by ChaosTile('Base')
  // ASSERT: adjRegions.length == 2
  placeFactionBaseFoundations(adjRegions: [Hex2, Hex2]) {
    this.baseRegions = adjRegions;
    const faction = this.player!.faction;
    const founds = permute(faction.bf).map((bonus, i) => new Foundation(`${faction.name}bf${i}`, bonus))
    adjRegions.forEach((hex, n) => hex.tile?.addFoundation(founds[n]));
    // block Oxataya from any adjacent Lake:
    if (this.player?.facId == 5) {
      const hex0 = this.hex as Hex2, map = hex0.map as HexMap2;
      hex0.forEachLinkHex(hex1 => hex1.tile.terrain == 'Lake' && map.placeMtn(hex0, hex1))
    }
    // block Circadians from all adjacent:
    if (this.player?.facId == 0) {
      const hex0 = this.hex as Hex2, map = hex0.map as HexMap2;
      hex0.forEachLinkHex(hex1 => hex1.tile.terrain != 'Mtn' && map.placeMtn(hex0, hex1))
    }
  }

  /** on this.dragStart(); undo previous placement */
  rmBaseFoundationsAndUnlink(ctx: DragContext) {
    const hex = this.fromHex, map = hex.map as HexMap2;
    if (!hex.isOnMap) return;
    // remove any Mtn between hex and nHex; link thru Mtn is already removed...
    map.linkDirs.forEach(dir => {
      const nHex = map.getHex(map.nextRowCol(hex, dir));
      if (nHex) map.removeMtn(hex, nHex)
    })
    // remove Foundations that were placed adjacent to Base;
    this.baseRegions?.forEach(nHex => {
      // remove any foundation in nHex:
      nHex.tile?.foundations.forEach((elt, n, ary) => {
        elt?.parent?.removeChild(elt);
        ary[n] = undefined;
      })
    });
    this.baseRegions = undefined; // remove historical references
    map.unlink(hex);
    map.update();
  }
}
