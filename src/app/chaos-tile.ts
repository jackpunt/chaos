import { C, permute } from "@thegraid/common-lib";
import { CenterText, CircleShape, NamedContainer, PaintableShape, RectShape } from "@thegraid/easeljs-lib";
import { Container } from "@thegraid/easeljs-module";
import { type DragContext, type HexDir, HexShape, type IHex2, MapTile, Player as PlayerLib, type Table, TP } from "@thegraid/hexlib";
import { type ChaosHex2 as Hex2, type HexMap2 } from "./chaos-hex";
import { type ChaosTable } from "./chaos-table";
import { Foundation } from "./foundation";
import type { GamePlay } from "./game-play";
import type { AI_Trap, Factory, Leader, Morale, Outposts, PriceBonus, Relic, Stronghold } from "./meeples";
import type { Player } from "./player";
import type { FactionOnTileState } from "./scenario-parser";

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
const terrainIds = ['Mtn', 'Hills', 'Swamp', 'Plains', 'Lake', 'Base'] as const;

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


// TODO: maybe use TextTweaks to place the glyphs?
/** Foundation bonus; also use for Income icons */
/** E: energy, G: gem, C: card, R: recruit, U: upgrade(gold), *: gemlock */
export function bonusIcon(harv?: HARVEST | PriceBonus, fs = TP.hexRad * .15, tc?: string ) {
    if (!harv || harv.length > 3) return undefined;
    const spotmap = { E: 'yellow', G: 'red', C: 'white', R: 'orange', U: 'gold', '.': 'grey' };
    const cardRot = 12;
    const miniCard = () => {
      const cardRect = { x: -w / 2, y: -h / 2, w, h, r: 2, s: 1 }; // maybe use TextInRect?
      const card = new RectShape(cardRect, cHarv, 'grey');
      card.scaleX = card.scaleY = Math.cos(cardRot * Math.PI/180);
      return card;
    }
    const icon = new Container();
    const h0 = harv[0] as keyof typeof spotmap;
    const cHarv = spotmap[h0] ?? C.transparent;
    const w = fs * .22/.15, h = w * 2.5/1.75;// 1.4;
    const shape = (h0 == 'C' || h0 == 'U' ) ? miniCard() : new CircleShape(cHarv, fs, '');
    const tColor = tc ?? C.pickTextColor(cHarv, ['black', 'white']);
    const iText = new CenterText(h0 == 'C' ? '+' : harv, fs, tColor);
    if (harv !== '-') icon.addChild(shape, iText);
    if (h0 == 'C') icon.rotation = cardRot;
    return icon
  }

const colorOfTerrain: Record<TERRAIN, string> = {
  Mtn: C.grey64,
  Hills: C.nameToRgbaString(C.dimYellow, .5),
  Swamp: C.nameToRgbaString(C.lightgreen, .5),
  Plains: C.nameToRgbaString(C.BROWN, .5),
  Lake: C.lightblue,
  Base: C.WHITE,  // color of temp Tiles placed on hexes reserved for 'Base' Tiles
}


/** per-Player bits on map Tile/Hex; add one for each Faction, in apprpriate place */
class FactionOnTile extends NamedContainer {
  constructor(public player: Player, public tile: ChaosTile) {
    super(`fac-${player.facId}`);
  }
  leaders: Leader[] = [ ];              // 2+ slots (own + Rhyzu), Zcharo: 4, Oxytaya: 4
  fighters = 0;                         // number of fighters in slot, followed by Leader(s)
  strength = 0;                         // Apparent strength of Faction
  pins = 0;
  buildings: ('F'|'P'|'S')[] = [];      // if this Faction has buildings on tile, ordered by foundation index
  // TODO: methods to add/remove elements

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
    icon.y = this.radius * .37;
    this.addChild(icon);
  }

  override makeShape(): PaintableShape {
    return new HexShape(); // basic HexShape, not the TileShape
  }

  static makeAllTiles() {
    // GameSetup.initialize() -> AfHex.makeAllAfHex()
    // GameSetup.startScenario() -> layoutTable() -> makeAllPlayers()
    // make a Tile for each AfHex.
  }

  // The only draggable ChaosTile will be the BaseTiles;
  // Leaving this code for when we build them
  // Also drag Building (as meeps) to Build and self-drop
  override cantBeMovedBy(player: PlayerLib, ctx: DragContext): string | boolean | undefined {
    if (this.hex?.isOnMap && !ctx.lastShift) return 'tile on map';
    return super.cantBeMovedBy(player, ctx);
  }

  // Note: Foundations are never removed
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
      f.onTile = this;
      // Graphically above this.hex:
      const hex = this.chex, dx = f.radius * 1.03, dy = f.radius * 1.25;
      f.scaleX = f.scaleY = Foundation.mapScale;  // scale down when drop on map
      f.x = hex.x + (ndx-1) * dx * f.scaleX;
      f.y = hex.y + hex.radius - dy * f.scaleY;
      f.faceUp(true);
      f.homeXY = { x: f.x, y: f.y }
      this.chex.mapCont.overCont.addChild(f);
      f.mouseEnabled = false;
    }
    return ndx;
  }

  override isDragable(ctx?: DragContext): boolean {
    return !this.hex?.isOnMap || this.terrain == 'Base';
  }

  override dragStart(ctx: DragContext): void {
    super.dragStart(ctx); // --> cantBeMovedBy()
    if (this.DragData) {
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
    if (targetHex.tile) {
      targetHex.tile.sendHome();
    }
    super.dropFunc(targetHex, ctx);
    // TODO: choose hexes for base foundations
    this.addBaseFoundationsAndLink(targetHex, ctx)
  }

  /**
   * Link base Hex to map.
   *
   * If this Base is adjacent to > 2 Regions, select which to use (and place mountains)
   *
   * Then place faction's bf on the two Regions.
   */
  addBaseFoundationsAndLink(hex: Hex2, ctx: DragContext) {
    // link base to adjacent non-Mtn Hexes
    const map = this.hex!.map as HexMap2;
    map.link(hex);                                         // link to all adjacent hexes (Mtn & Lake!)
    const pairs = this.getAdjacentPairs(hex);              // find each pair of adjacent regions
    if (pairs.length > 1) {
      // and edge(s) to place mountain(s) to block other(s)
      // put GUI selector on each pair; on(click) -->
      // --> place mountains on other side(s) of Base
      // --> placeFactionBaseFoundations(pairs[n])
      const cb = (ndx: number) => {
        const pair = pairs[ndx];
        const xpairs = pairs.filter((p, n) => n != ndx);
        xpairs.forEach(hexes => hexes.filter(hex => !pair.includes(hex)).forEach(hex2 => map.placeMtn(hex, hex2)))
        this.placeFactionBaseFoundations(pair); hex.map.update()
      }
      setTimeout(cb, 300, 1);
      return;
    }
    // map.unlink(hex, (hex) => hex.tile?.terrain == 'Mtn');  // unlink from Mtn
    this.placeFactionBaseFoundations(pairs[0]);
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
  chooseAdjacentPair(hex: Hex2) {
    const pairs = this.getAdjacentPairs(hex);

  }

  // ASSERT: adjRegions.length == 2
  placeFactionBaseFoundations(adjRegions: Hex2[]) {
    const faction = this.player!.faction;
    const founds = permute(faction.bf).map((bonus, i) => new Foundation(`${faction.name}bf${i}`, bonus))
    adjRegions.slice(0, 2).forEach((hex, n) => hex.tile?.addFoundation(founds[n]))
  }

  /** on this.dragStart() */
  rmBaseFoundationsAndUnlink(ctx: DragContext) {
    const hex = this.fromHex, map = hex.map as HexMap2;
    hex.forEachLinkHex((nHex: Hex2) => {
      // remove any Mtn between hex and nHex:
      map.removeMtn(hex, nHex);
      // remove any foundation in nHex:
      nHex?.tile?.foundations.forEach((elt, n, ary) => {
        elt?.parent?.removeChild(elt);
        ary[n] = undefined;
      })
    });
    map.unlink(hex, nh => true);
  }
}
