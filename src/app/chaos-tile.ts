import { C, permute, removeEltFromArray, S, stime } from "@thegraid/common-lib";
import { AliasLoader, NamedContainer, type Paintable, PolyShape, RectShape, TextInRect, type ValueEvent } from "@thegraid/easeljs-lib";
import type { DisplayObject, MouseEvent } from "@thegraid/easeljs-module";
import { type DragContext, type DragFuncs, H, type HasDragger, type HexDir, HexShape, type IHex2, MapTile, NumCounter, Player as PlayerLib, rightClickable, type Table, Tile, TP } from "@thegraid/hexlib";
import { type ChaosHex2, type ChaosHex2 as Hex2 } from "./chaos-hex";
import { type ChaosTable } from "./chaos-table";
import { NumCounterHex } from "./counters";
import { type Faction, type FactionId } from "./factions";
import { Foundation } from "./foundation";
import { dist } from "./functions";
import type { GamePlay } from "./game-play";
import { type baseProdTokenIds, type ChaosBuilding, ChaosToken, type Factory, Leader, LeaderCard, type Outpost, ProdToken, type Relic, type Stronghold, type upgradeProdTokenIds } from "./meeples";
import { superMethod } from "./mixins";
import { MoveInPlay, type Player } from "./player";
import type { FactionOnTileState, Special } from "./scenario-parser";
import { CO } from "./table-params";

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

export type HexPair = [Hex2, Hex2];

/** A Graphic target straddling the border between two Regions */
export class PairTarget extends NamedContainer {
  static targets: PairTarget[] = [];

  /** Container with dObj; add to PairTarget.targets; rotate to align with edge; show on overCont. */
  constructor(public pair: HexPair, public dObj: DisplayObject, isTarget = true) {
    const [fHex, tHex] = pair;
    const dir01 = fHex.findLinkHex(hex => (hex == tHex));
    if (!dir01) {
      throw(`new PairTarget: hexes ${pair} are not adjacent`);
    }
    super(`PairTarget#${PairTarget.targets.length}`);
    this.addChild(dObj);
    if (isTarget) PairTarget.targets.push(this);

    this.rotation = (H.dirRot[dir01]);
    fHex.edgePoint(dir01, 1, this);      // set RectShape on edge of Hex
    fHex.map.mapCont.overCont.addChild(this); // place on top of other tiles
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
// energy1 on AI Base; 'recruit1' on Oxataya Base
// Note: Tile.setNameText() converts '-' to newline
// board_HARVEST:          ['E2', 'G1', 'C']
// relic_Foundation bonus: ['E2', 'G1', 'C', '%', '-', ]  ('-' on Relic-6: never claimed)
// panel_Foundation bonus: ['-']
// panel_BgFound bonus:    [... various text...]
// panel_Building income:  ['E3', 'E2', 'G1', 'C']    // E3 for BldgFoundation[0] (base Income)
/** basic Bonus for Foundation and Harvest */
const bonusIds = ['-', 'E3', 'E2', 'E1', 'C', 'G1', 'R1', '%'] as const; //

// %, Energy, Gem, Card, Build, Recruit, Leader, Harvest, Move, Upgrade(leader), Attribute(upgrade)

export type TERRAIN = typeof terrainIds[number];
export type BONUS = typeof bonusIds[number];
export type BASE_PROD_TOKEN = typeof baseProdTokenIds[number];
export type UPGRADE_PROD_TOKEN = typeof upgradeProdTokenIds[number];
export type PROD_TOKEN = BASE_PROD_TOKEN | UPGRADE_PROD_TOKEN;
export type HARVEST = BONUS | PROD_TOKEN;
export type FAME_BONUS = 'E1' | 'E2' | 'C' | 'G1' | '%' | 'R1' | 'R2' | 'M1' | 'Win' | 'End'; // M1 is Redeploy

const colorOfTerrain: Record<TERRAIN, string> = {
  Mtn: C.grey64,
  Hills: C.nameToRgbaString('rgb(190, 152, 0)', .35),
  Swamp: C.nameToRgbaString('rgb(20, 100, 0)', .35),
  Plains: C.nameToRgbaString('rgb(130, 61, 0)', .35),
  Lake: C.lightblue,
  Base: C.WHITE,  // color of temp Tiles placed on hexes reserved for 'Base' Tiles
  Ldr: C.WHITE,
}

export class MoveIcon extends ChaosToken {
  color: string;
  color2: string;
  constructor(player: Player, public srcTile: ChaosTile) {
    super(`FoT_${player.facId}-mover`, player)
    this.color = C.nameToRgbaString(this.player.color, .2);
    this.color2 = C.nameToRgbaString(C.white, .7);
    this.paint(this.color)
    this.makeDragable(player.gamePlay.table);
    this.mouseChildren = false;
    this.visible = false;  // only visible in Move phase
  }
  override makeShape(size?: number) {
    const rad = TP.hexRad * .14, fillc = C.WHITE;
    return new  PolyShape({ rad, nsides: 6, fillc })
  }
  override sendHome(): void {
    this.srcTile.getFoT(this.player).addChildOver(this);
  }
  override dragStart(ctx: DragContext): void {
    this.paint(this.player.hasMP ? this.color : this.color2)
    super.dragStart(ctx);
    this.fromHex = this.srcTile.chex;
  }
  get isFromSwamp() {
    return (this.srcTile.isSwampCnx)
  }
  isToSwamp(ctile: ChaosTile) {
    return ctile.isSwamp;
  }
  override isLegalTarget(toHex: Hex2, ctx: DragContext): boolean {
    if (toHex.ctile?.isBase) return false;
    // No direct reciprocal MoveInPlay:
    if (this.player.movesInPlay.find(mip => mip.from == toHex.ctile && mip.to == this.srcTile)) return false;
    if (this.player.facId !== 5 && toHex.ctile?.isLake) return false; // vs: !faction.canEnterLake
    if (this.player.facId === 3 && toHex.ctile?.isSwampCnx && this.isFromSwamp) return true; // Leyrein connects Swamps
    if (this.player.facId === 0 && this.srcTile.isBase) return true; // TODO: && isAdj(dropShip)
    return this.fromHex.linkHexes.includes(toHex);
  }
  override dropFunc(targetHex: Hex2, ctx: DragContext) {
    if (this.player.hasMP) {
      const toRegion = targetHex?.ctile, srcTile = this.srcTile;
      if (toRegion && toRegion != srcTile) {
        this.player.newMoveInPlay(srcTile, toRegion);
      }
    }
    this.paint(this.color);
    this.sendHome();
  }
}
      // TODO: MoveInPlay details:
      // Arrow from FoT to Fot. Add FoT on dest
      // with a FighterCounter (FC) t0 show number of Fighters transfered.
      // Move [all] Units from src to dest;
      // rightclick to return units to srcTile
      // Internally: an FoT with the moved Leaders recorded but shown only on the toRegion.
      // click the arrow/FC to increment/decrement the by local FC and the target FC.
      // record state of Units before; keybinder to reset Units to beginning of phase.

/** used by MoveInPlay to count Fighters transfered from FoT to FoT */
export class FighterCounter extends NumCounterHex {
  constructor(public mip: MoveInPlay, name: string, initValue: number | string = 0, color?: string, fontSize = TP.hexRad * .2, fontName?: string, textColors?: string[]) {
    super(name, initValue, color, fontSize, fontName, textColors)
    // rightClick OR ctrl-key causes -5/-1 decrement:  [right & shift would result in +5/+1]
    rightClickable(this, (evt) => this.incValueOnClick(evt, -5, -1))
  }

  // transfer fighter(s) fromFot --> toFot; counting the number transfered.
  override incValue(incr: number) {
    const mip = this.mip;
    const incv = incr > 0 ? Math.min(incr, mip.fromFot.fighters) : -Math.min(-incr, mip.toFot.fighters, mip.toFot.fighters - mip.toFot.preFighters);
    mip.fromFot.fighterIcon.incValue(-incv);
    mip.toFot.fighterIcon.incValue(incv);
    super.incValue(incv);
    mip.toFot.update();
    mip.fromFot.update();
    mip.toFot.setFighterVis();    // set visible
    mip.fromFot.setFighterVis();  // set visible
  }
}


/** NumCounterHex that is non-negative. */
export class FighterIcon extends NumCounterHex {
  hexRad!: number;

  constructor(player?: Player, name = 'FighterIcon', fontSize = TP.hexRad * .2) {
    super(name, 0, player?.color, fontSize);
  }
  override incValue(incr: number): void {
    super.incValue(incr)
    if (this.value < 0) this.value = 0;   // and maybe put watchpoint here, should not happen!
  }
}

/** per-Player bits in Region/ChaosTile; add one for each Player, in apprpriate place.
 *
 * @param player: indicates color of glyphs and sector (unless tile.isBase) for the Faction
 * @param tile: parent of FoT; (glyphs are on overCont above tile)
 */
export class FactionOnTile extends NamedContainer {

  buildings: ChaosBuilding[] = [];      // if this Faction has buildings on tile [on South edge]
  /**  number of fighters on tile */
  get fighters() { return this.fighterIcon.value };
  set fighters(n: number) { this.fighterIcon.value = Math.max(n, 0) }

  leaders: Leader[] = [ ];              // 2+ slots (own + Rhyzu), Zcharo: 4, Oxataya: 4
  strength = 0;                         // Apparent strength of Faction
  pins = 0;

  get facId() { return this.player.facId; }
  get index() { return this.player.index; }

  player: Player;
  tile: ChaosTile;
  fighterIcon: FighterIcon;
  moveIcon: MoveIcon;
  strIcon: TextInRect;
  strText: TextInRect;  // 'card' showing sources of strength

  constructor(player: Player, tile: ChaosTile) {
    super(`FoT_${player.facId}-${tile.Aname}`);
    this.player = player;
    this.tile = tile;
    this.setXY();   // move to sector for player
    this.fighterIcon = new FighterIcon(player);
    this.tile.reCache(0);
    this.tile.addChild(this);
    this.moveIcon = new MoveIcon(player, tile);
    this.addChild(this.fighterIcon, this.moveIcon);  // update after BaseTile moves...
    const border = [.1, .1, .09, -.15] as [number, number, number, number];
    const bgColor = 'rgba(251, 251, 251, 0.5)';
    this.strIcon = new TextInRect(`0`, { fontSize: TP.meepleRad * .2, border })
    this.strText = new TextInRect(`0`, { fontSize: TP.meepleRad * .2, border, bgColor })
    this.strIcon.visible = false;
    const rightClickStrIcon = (evt: MouseEvent) => {
      evt.stopImmediatePropagation();     // cribbed from Leader -> LeaderCard
      const card = this.strText, parCont = this.tile.hex!.map.mapCont.overCont;
      const { height } = card.getBounds();
      this.strIcon.parent.localToLocal(this.strIcon.x, this.strIcon.y - height/2, parCont, card);
      parCont.addChild(card);
      card.visible = true;
      card.on(S.click, () => { card.visible = false; card.stage.update()}, this, true)
      card.stage.update();
    }
    rightClickable(this.strIcon, rightClickStrIcon)
    this.addChild(this.strIcon);
  }

  /** if (FoT.isBase) addChild(dObj) so dObj moves with Base Tile. */
  addChildOver(dObj: DisplayObject, x = 0, y = 0): DisplayObject {
    dObj.x = x; dObj.y = y;
    if (this.isBase) {
      return super.addChild(dObj);
    } else {
      const overCont = this.tile.hex!.map.mapCont.overCont
       // re-parent from non-dragable mapTile.FoT to overCont:
      this.localToLocal(dObj.x, dObj.y, overCont, dObj);
      return overCont.addChild(dObj);
    }
  }


  // methods to add/remove elements
  /**
   * Add or Remove a Leader from FoT
   * @param ldr
   * @param add true/false => add/remove
   */
  addLeader(ldr: Leader, add = true) {
    if (add) {
      if (!this.leaders.includes(ldr)) {
        // similar to Hex with tile/meep; we have array of slots for Leaders:
        this.leaders.push(ldr);
      }
      ldr.factOnTile = this;
    } else {
      removeEltFromArray(ldr, this.leaders);
      this.removeChild(ldr)
      // ldr.factOnTile = undefined;
    }
    this.update()
  }

  // undoMove set isMoving false to erase the empty FoT, so it is not a source of moveIcon.
  setFighterVis(isMoving = (this.player.gamePlay.movePlayer == this.player)) {
    // const isMoving = (this.player.gamePlay.movePlayer == this.player)
    // const isMoving = !!this.player.movesInPlay.find(mip => mip.toFot == this);
    this.fighterIcon.visible = isMoving || (this.fighters > 0) || this.leaders.length > 0;
    this.moveIcon.visible = isMoving;
    return this;
  }

  addFighter(n = 1) {
    this.fighters += n;  // this entrypoint used by panel.recruitToBase; faction.addFighter
    this.setFighterVis();
    this.update();
  }

  addBuilding(bldg: ChaosBuilding, add = true) {
    // building graphics handled by ctile.foundations
    if (add) {
      this.buildings.push(bldg);
    } else {
      removeEltFromArray(bldg, this.buildings);
    }
    this.update();
  }
  /*  Sector layout:
  //  L1 L2 L3 .. LN
  //     <FC>
  //      TS


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
  */
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
  /** place where we always use top-center sector */
  get isBase() { return this.tile.isBase || this.tile.isLdr }
  /** move FoT to sector for isBase ? Base : player.index */
  setXY(rad = this.tile.radius) {
    const index = this.index;     // table order determines FoT placement
    // sx, sy: sector placement;
    const sx = (this.isBase ?  0 : this.offset); // -1: left side; offset[][] = 0
    const sy = (this.isBase ? -1 : [0, 1].includes(index) ? -1 : [3, 4].includes(index) ? 1 : (TP.numPlayers == 5) ? -1 : 1);
    this.x = sx * rad / 2;
    this.y = sy * rad * H.sqrt3_2/2;
  }

  /** update graphics */
  update() {
    const rad = this.tile.radius, overCont = this.tile.hex!.map.mapCont.overCont;
    // invert: 1 --> leaders on top;  -1 --> leaders on bottom;
    const yh = (this.isBase ? -1 : this.invert) * rad * H.sqrt3_2;
    this.fighterIcon.y = yh * 0;
    const yl = yh * .33; // assuming 2 of 5 orientation == Base!
    const ll = this.leaders.length;
    if (ll > 0) {
      // location of leader line:
      const lineWidth = rad * (ll * .29); // Leader.box_width = (.2 * 1.4) * hex.radius
      const gap = lineWidth/ll;
      const xl = gap/2 - lineWidth/2;
      this.leaders.forEach((ldr, n) => {
        this.addChildOver(ldr, xl + n * gap, yl); // to overCont or this depending on this.isBase
      })
    }
    const [str, txt] = this.player.faction.strengthInRegion(this.tile);
    this.strIcon.label_text = `${str}`;
    this.strIcon.y = -yl * .81;
    this.strIcon.visible = (str > 0);
    this.strText.label_text = txt;
    this.stage.update();
  }

  preLeaders: Leader[] = [];
  preFighters = 0;
  /** record leaders & fighters */
  setPreMove() {
    this.preLeaders = this.leaders.slice();
    this.preFighters = this.fighters;
  }
  /** reset to preMove values; Note: must reset ALL presence FoTs */
  resetMove() {
    this.fighters = this.preFighters;
    this.leaders = this.preLeaders.slice();
    this.leaders.forEach(ldr => this.addLeader(ldr))
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


/**
 * A MapTile with Terrain & Harvest icon; AKA: Region
 *
 * Has a FactionOnTile(player) for each Faction present.
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
    super.toString;
    return `${this.Aname}`;
  }

  readonly terrain!: TERRAIN; // immutable
  prodToken!: ProdToken;      // can drop ProdToken to upgrade
  origToken!: ProdToken;
  get harvest() { return this.prodToken.harvest }

  /** Details of Faction Presence on Tile; index by FactionId */
  factions: FactionOnTile[] = [];

  /** set if there is a Relic on this Tile; */
  relic?: Relic;

  special?: Special; // Morale | AI_Trap;

  get isLdr() {return this.terrain == "Ldr"}
  get isMtn() {return this.terrain == "Mtn"}
  get isLake() {return this.terrain == "Lake"}
  get isHills() {return this.terrain == "Hills"}
  get isPlains() {return this.terrain == "Plains"}
  get isBase() {return this.terrain == "Base"}
  get isSwamp() {return this.terrain == "Swamp"}
  get isOnMap() { return this.chex.isOnMap}
  // Leyrien Base is not Swamp, but can be connected,
  // as can Leyrien Strongholds
  // caller must verify that Leyrien is the Faction in question
  get isSwampCnx() {
    return this.isSwamp ;  // for Leyrein tunneling || this.hasFot().buildings.includes('Stronghold')
  }

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
  Outpost!: Outpost;        //
  Stronghold!: Stronghold;  //

  constructor(Aname: string, t: TERRAIN, h: HARVEST, player?: PlayerLib) {
    super(Aname, player);
    this.terrain = t;
    this.prodToken = this.origToken = new ProdToken(h);
    this.nameText.y = this.radius * .66;
    this.addChild(this.nameText);        // re-add above afHex
    this.addHarvest(this.origToken);
    // this.setPlayerAndPaint(player);
    this.paint();
    ChaosTile.allChaosTiles.push(this);
  }

  // paint the [terrain or base] color onto the baseShape;
  override paint(colorn = colorOfTerrain[this.terrain], force?: boolean): void {
    super.paint(colorn, force)
  }

  // similar to pToken.moveTo(this.hex)
  addHarvest(pToken: ProdToken) {
    this.removeChild(this.prodToken);   // retain referene in this.origToken
    this.prodToken.hex = undefined;     // one meep per hex...
    if (this.hex) this.hex.meep = undefined; // Note: all ChaosTile have a hex.
    if (pToken !== this.origToken) {
      pToken.hex = this.hex;            // superMethod(this, 'moveTo', hex) --> this.hex = hex
      // --> this.hex.meep = pToken;
    }
    pToken.x = pToken.y = 0;
    this.prodToken = pToken;
    this.addChild(pToken)
    this.updateCache();
  }

  override textVis(vis?: boolean): void {
    this.prodToken?.textVis(vis);  // update prodToken before this.reCache()
    super.textVis(vis);
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
  // --> Leader: no Foundation required: cons a null-foundation; (still limit 3 buildings?)
  addFoundation(f: Foundation, commit = true) {
    const ndx = this.ndxForFoundation();
    if (commit && ndx != undefined) {
      this.foundations[ndx] = f;
      f.onTile = this;   // record Foundation is onTile on the map.
      // Graphically above this.hex:
      const hex = this.chex, dx = f.radius * 1.3, dy = hex.radius * 2.34;   // <<< foundation.y
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

  override makeDragable(table: HasDragger & DragFuncs): void {
    return; // ChaosTile not generally Dragable
  }
  override isDragable(ctx?: DragContext): boolean {
    return false;   // User/GUI cannot rearrange MapTile
  }

  /** return the FoT(player) if this tile has one. */
  hasFoT(facId: FactionId) {
    return this.factions[facId]
  }
  // TODO: specialize LeaderTile.getFoT() to provide FoT at Center
  /** get FoT(player) creating it if mecessary. */
  getFoT(plyr: Player) {
    const facId = plyr.facId;
    const fot = this.factions[facId] ?? (this.factions[facId] = new FactionOnTile(plyr, this));
    return fot;
  }
  // Delegate FoT actions to the associated FoT.
  /** add or remove Leader on FoT */
  addLeader(ldr: Leader, add?: boolean) {
    this.getFoT(ldr.player).addLeader(ldr, add)
  }
  /** add or remove n Figheters on FoT */
  addFighter(player: Player, n = 1 ) {
    this.getFoT(player).addFighter(n)
  }
  /** add or remove a Building on FoT (graphically on ctile.foundations) */
  addBuilding(bldg: ChaosBuilding, add?: boolean) {
    this.getFoT(bldg.player).addBuilding(bldg, add)
  }
}

export class BaseTile extends ChaosTile {
  declare player: Player;    // Assert that player is defined in super constructor
  override get isBase() { return true }
  override get isSwampCnx() { return this.player.facId == 3 && !!this.player.faction.attributes['expeditious']?.upgraded }
  constructor(faction: Faction) {
    super(`${faction.name}Base`, 'Base', faction.bh, faction.player);

    const image = AliasLoader.loader.getBitmap(faction.name);
    const si = .75;      // scale of Image
    image.scaleX *= si;
    image.scaleY *= si;
    image.y += this.radius * .1;
    this.addChild(image)
    this.addMoveCounter()
  }

  moveCounter!: NumCounter;
  addMoveCounter(y0 = this.radius * .1) {
    const counter = this.moveCounter = new NumCounter(`movePoints`, 0, C.WHITE, TP.hexRad * .3, );
    counter.visible = false;
    counter.y = y0;
    this.addChild(counter);
    counter.clickToInc(true, 5);   // temp for testing
    const incMP = ((ve: ValueEvent) => {
      this.gamePlay.movePoints += Math.max(0, (ve.value as number)) // ignore decrements
    }) as ((evt: Object) => void)
    counter.on('incr', incMP)
  }

 override addHarvest(pToken: ProdToken) {
    super.addHarvest(pToken)
    pToken.y = this.radius * .2; // move down, below Image
  }

  // no Foundations allowed in Base
  override ndxForFoundation() {
    return undefined;
  }

  // The only draggable ChaosTile will be the BaseTiles;
  // Leaving this code for when we build them
  // Also drag Building (as meeps) to Build and self-drop
  override cantBeMovedBy(player: PlayerLib, ctx: DragContext): string | boolean | undefined {
    if (this.hex?.isOnMap && !ctx.lastShift) return 'Base is on map'; // TODO: disable Shift after PlaceBase phase
    return super.cantBeMovedBy(player, ctx);
  }

  override makeDragable(table: HasDragger & DragFuncs): void {
    superMethod(this, Tile, 'makeDragable', table); // Dragable & clickToDrag
  }

  override isDragable(ctx?: DragContext): boolean {
    return true;
  }

  // Table.dragStart: if (!tile.cantBeMovedBy()) --> { tile.dragStart(); table.markLegalHexes(); ... }
  override dragStart(ctx: DragContext): void {
    super.dragStart(ctx); // pro-forma
    // unlink base & remove baseFoundations! (because shiftkey-move)
    this.rmBaseFoundationsAndUnlink(ctx); // if is dragging...
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
    const dragMoved = dist(this, this.fromHex) > 1; // coordinate tranlation causes minor change
    super.dropFunc(targetHex, ctx);     // this.placeTile(targetHex)
    if (!dragMoved) return;  // not dragged (cantbemoved/dragStop), do not reset foundations
    if (!targetHex) return;
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
    const map = this.chex!.map;
    map.link(hex);      // link to all adjacent hexes
    map.unlink(hex, (nHex) => !!nHex.ctile?.isMtn); // rm links to Mtn tiles
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
    const mapDirs = hex.map.linkDirs;  // assume length == 6; [N, EN, ES, S, WS, WN ]
    const pairs: HexPair[] = [];  // push [hex1, hex2]
    const isRegion = (hex?: Hex2) => { return hex?.ctile && hex.ctile.terrain != 'Mtn' && hex.ctile.terrain != 'Lake'};
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
  chooseAdjacentPair(hex: Hex2, pairs: HexPair[]) {
    // put GUI selector on each pair; on(click) -->
    // --> place mountains on other side(s) of Base
    // --> placeFactionBaseFoundations(pairs[n])
    pairs.forEach(pair => {
      try {
        // Graphic target to indicate which Region Pair user wants for base foundations
        const dx = TP.hexRad * .3, dy = dx*2;
        const rect = new RectShape({ x: -dx/2, y: -dy/2, w: dx, h: dy }, CO.mauve, '');
        const pairTarget = new PairTarget(pair, rect);
        pairTarget.on(S.click, (evt) => this.chooseGivenPair(pair))
      } catch (msg) {
        console.warn(stime(this, `.addBaseFoundationsAndLink: ${msg}`))
      }
    });
  }

  /** establish Base Foundations on given pairTarget. */
  chooseGivenPair(pair: [ChaosHex2, ChaosHex2]) {
    // const pair = pairTarget.pair;
    const hex = this.chex!;   // assert: BaseTile has dropped on map
    const map = hex.map;
    this.gamePlay.removeTargets();  // all PairTargets
    const hexes = this.getAdjacentPairs(this.chex).flat();
    hexes.forEach(hex2 => pair.includes(hex2) || map.placeMtn(hex, hex2));
    this.placeFactionBaseFoundations(pair);
  }

  /** The two Regions adjacent to BaseTile: starting base foundations (factions.bf). */
  baseRegions?: HexPair;  // Note: only used by ChaosTile('Base') - constraint on PlaceRelic
  // ASSERT: adjRegions.length == 2
  placeFactionBaseFoundations(adjRegions: HexPair) {
    this.baseRegions = adjRegions;
    const faction = this.player.faction;
    const founds = permute(faction.bf).map((bonus, i) => new Foundation(`${faction.name}_bf${i}`, bonus))
    const baseFot = this.getFoT(this.player);
    adjRegions.forEach((hex, n) => {
      const adjTile = hex.ctile!, adjFot = adjTile.getFoT(this.player);
      adjTile.addFoundation(founds[n]);
      // Require 1 Fighter in each baseRegion:
      baseFot.fighterIcon.incValue(-1);
      adjFot.fighterIcon.incValue(1);     //
      adjFot.setFighterVis();
      adjFot.update();
    });
    baseFot.setFighterVis();
    baseFot.update();
    faction.afterPlaceBase(this.hex as Hex2, adjRegions);
    this.hex?.map.update();
  }

  /** on this.dragStart(); undo previous placement, recall leaders, fighters & movesInPlay */
  rmBaseFoundationsAndUnlink(ctx: DragContext) {
    this.gamePlay.removeTargets(); // adjPairTargets or movesInPlay from stage
    const hex = this.fromHex;
    if (!hex?.isOnMap) return;
    const map = hex.map;
    // remove any Mtn between hex and nHex; link thru Mtn is already removed...
    map.adjacentToRowCol(hex).forEach(({ hex: nHex, dir }) => map.removeMtn(hex, nHex))

    const movePlayer = this.gamePlay.movePlayer;
    this.gamePlay.movePlayer = undefined;       // indicate player is not moving (hide 0-fighters)
    const baseFot = this.getFoT(this.player);
    // return fighters and Leaders: (not just the adj foundation locations: all the map! for PlaceBaseAndMove tests)
    this.player.fotPresence.forEach(fot => {
      if (fot == baseFot) return;
      const nf = fot.fighters;
      baseFot.fighterIcon.incValue(nf);        // send fighters back to base
      fot.fighters = 0;
      fot.leaders.forEach(ldr => ldr.sendHome()); // return to LeaderCard
      fot.leaders.length = 0;
      fot.update();
    })
    this.player.movesInPlay.length = 0;    // clear move-counter (re-enable Moves)
    this.player.setAllFighterVis();               // vis on 0-sized fighters
    this.gamePlay.movePlayer = movePlayer; // restore curent movePlayer

    // remove Foundations that were placed adjacent to Base;
    this.baseRegions?.forEach(nHex => {
      // remove any foundation in nHex:
      nHex.ctile?.foundations.forEach((elt, n, ary) => {
        elt?.parent?.removeChild(elt);
        ary[n] = undefined;
      })
    });
    this.baseRegions = undefined; // remove historical references
    map.unlink(hex);
    map.update();
  }
}

export class LeaderTile extends ChaosTile {
  declare baseShape: LeaderCard;
  constructor(ldr: Leader, player: Player, pColor = player.color) {
    const Aname = `${ldr.Aname.substring(0,2)}_tile`
    // (name, terrain, harvest, player)
    super(Aname, 'Ldr', '-', player); // isBase: paints (baseShape) { 'Ldr': C.WHITE }
    this.baseShape.setLeader(ldr, true);

    this.paint(pColor)
    const fot = this.getFoT(player);
    fot.setXY(-this.radius * .66);    // Note: fot.isBase == true; --> x = 0; set y to place Icon btw stats & PhaseIcon
  }

  // disable cache, need full zoom/resolution
  override reCache(scale?: number): void { super.reCache(0)  }

  // LeaderCard for this Leader:
  override makeShape(): Paintable {
    return new LeaderCard();
  }
  // not a drop target for Foundations
  override ndxForFoundation(): number | undefined { return undefined }
}
