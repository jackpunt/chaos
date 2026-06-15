import { C, Random, stime, type Constructor } from "@thegraid/common-lib";
import { NamedContainer, PathShape, RectShape } from "@thegraid/easeljs-lib";
import type { DisplayObject } from "@thegraid/easeljs-module";
import { H, Hex1 as Hex1Lib, Hex2Mixin, HexMap, HexMark, TileSource, TP, type HexDir, type HexM, type IHex2, type Tile } from "@thegraid/hexlib";
import { ChaosTile, type HARVEST, type TERRAIN } from "./chaos-tile";
import { Fighter } from "./meeples";
import type { TacticsCard } from "./tactics-card";
import { Foundation } from "./foundation";


// Hex1 has get/set tile/meep -> _tile/_meep
// Hex1 has get/set -> setUnit(unit, isMeep) & unitCollision(unit1, unit2)
export class ChaosHex extends Hex1Lib {

  constructor(map: HexM<Hex1Lib>, row: number, col: number, Aname?: string) {
    super(map, row, col, Aname);
  }

  // each unit type has it's own 'slot', per Faction in most cases.
  // each dropFunc override to inc unit counter for the Faction.
  //
  override setUnit(unit?: Tile, isMeep?: boolean | undefined): void {
    if (unit instanceof Fighter) {
      super.setUnit(unit, isMeep);
    } else {
      super.setUnit(unit, isMeep);   // TODO handle ChaosMeeple & PlayerBitsOnHex
    }
  }
  // all the Fighters on this Hex;
  // Fighters.source[ndx] is the recruitHex for player[ndx] (hospital on player board)

  FightersSources!: TileSource<Fighter>[];  // initialized in parseScenario

  override unitCollision(this_unit: Tile, unit: Tile, isMeep = false) {
    if (unit instanceof Fighter && this_unit instanceof Fighter) {
      this.FightersSources[unit.player!.index].availUnit(this_unit);
      return; // continue with setUnit(): this.meep = unit;
    }
    super.unitCollision(this_unit, unit, isMeep); // fall through
    // if (this === this_unit.source?.hex && this === unit.source?.hex) {
    //   this_unit.source.availUnit(this_unit);
    // } else if ((this.constructor as typeof ChaosHex).debugCollision) debugger;
  }

  override toString(color = (this.tile ?? this.meep)?.player?.plyrId) {
    color = color ?? (this.tile as ChaosTile)?.terrain.slice(0, 5) ?? 'Empty';
    return `${color}@${this.rcs}` // hex.toString => COLOR@[r,c] | COLOR@Skip , COLOR@Resign
  }
  // cannot override set/get tile(); prevents other components from setting a simple Tile.
  // Type 'Hex1 | undefined' is not assignable to type 'ChaosHex | undefined'.
  /** read hex.tile as ChaosTile */
  get ctile() { return super.tile as ChaosTile | undefined; }

  // TacticsCard is modeled as a Tile, placed on CardHex [tactics-card.ts] (from HexPath);
  // hexcity uses the way old CardContainer and card.useDropFunc
  // See CardPanel.makeDragable(table) -> table.dragger.makeDragable(... dropFunc)
  get card() { return super.meep as TacticsCard | undefined }
  set card(card) { super.meep = card; }
}

class ChaosHex2Lib extends Hex2Mixin(ChaosHex) {};

export class ChaosHex2 extends ChaosHex2Lib {
  // declare tile: ChaosTile | undefined; // uses get/set from Hex2Mixin(ChaosHex)
  // declare meep: ChaosCard | undefined;
}

/////////////////////////////////// HexMap2 ///////////////////////////////////////////////

/** specify Terrain & Harvest of map Region hexes */
type TileSpec = { row: number, col: number, t: TERRAIN, h: HARVEST }

/** HexMap2 holds the playable ChaosTile for each Region, plus Base Regions & some Base Regions (2-3-4 Player) */
export class HexMap2 extends HexMap<ChaosHex2> {
  constructor(radius?: number, addToMapCont?: boolean, hexC: Constructor<ChaosHex2> = ChaosHex2, Aname?: string) {
    super(radius, addToMapCont, hexC, Aname)
  }

  // temp: (rh, rc coming in next hexlib)
  override makeMark(rh = this.radius, rc = this.radius / 2.5): DisplayObject {
    return new HexMark(rh, rc);
  }

  // TODO: types for headless/non-GUI HexMap<ChaosHex>
  /** remove given hex from Stage */
  rmHex2(hex: ChaosHex2) {
    hex.cont?.parent.removeChild(hex.cont); // fine even if no hex.cont
  }

  rmHex(hexMap: HexMap<ChaosHex2>, row: number, col: number) {
    this.rmHex2(hexMap[row][col] as ChaosHex2); // remove hex.cont from display list
    delete hexMap[row][col];       // remove hex element from hexMap
  }

  /** remove each hex not used by Chaos map */
  sculptMap(hexMap = this) {
    hexMap[1].forEach(hex => this.rmHex(hexMap, hex.row, hex.col));
    this.rmHex(hexMap, 2, 1);
    this.rmHex(hexMap, 2, 2);
    this.rmHex(hexMap, 2, 4);
    this.rmHex(hexMap, 2, 6);
    this.rmHex(hexMap, 2, 7);
    this.rmHex(hexMap, 3, 7);
    this.rmHex(hexMap, 4, 7);
    this.rmHex(hexMap, 5, 7);
  }

  /* place a purple mountain between two Hexes */
  placeMtn(hex1: IHex2, hex2: IHex2) {
    const dir12 = hex1.findLinkHex(hex => (hex == hex2));
    if (!dir12) {
      console.log(stime(this, '.placeMtn: hexes not adjacent'), hex1, hex2);
      return;
    }
    const dx = TP.hexRad * .9, dy = dx/11;
    const mtn = new RectShape({x: -dx/2, y: -dy/2, w: dx, h: dy}, C.PURPLE, '');
    mtn.rotation = (H.dirRot[dir12]);
    hex1.edgePoint(dir12, 1, mtn);           // set mountain on edge of Hex
    this.mapCont.overCont.addChild(mtn); // mtn piece on top of other tiles
    // remove adjacency links:
    delete hex1.links[dir12];
    delete hex2.links[H.dirRev[dir12]];
  }

  /** placeTile(row, col) after removing existing tile at row, col */
  replaceTile(tile: ChaosTile, row: number, col: number) {
    const hex = this.getHex({row, col});
    hex?.tile?.sendHome();
    tile.moveTo(hex);
  }

  /**
   * configure hexMap with terrain tiles, mountains, adjust adjacency, mark open base locations
   *
   * @param hexMap on which to put the ChaosTiles
   * @param p6ary permutation for xtraTiles for (3, 4, 5)-players; set by ScenarioParser
   * @param np = TP.numPlayers 2..5
   */
  setupMapTiles(p6ary = [-1, -1, -1], np = TP.numPlayers) {
    const map = this;
    /** return the Nth (of 6) permutation of a 3 element array*/
    const permute6 = (ary3: any[], ndx: number) => {
      if (ndx < 0 || ndx > 5) ndx = Random.random(6);
      const p = [[0,1,2], [0,2,1], [1,0,2], [1,2,0], [2,0,1], [2,1,0]][ndx]
      return [ary3[p[0]], ary3[p[1]], ary3[p[2]]];  // could use ary3.reduce(), but why bother?
    }
    // splice in t & h
    const rct = (nspec: [number, number, { t: TERRAIN, h?: HARVEST }][]) => nspec.map(([row, col, thid]) => ({ row, col, h: '-', ...thid } as TileSpec))

    // 'Base' terrain are placeholders, not actual Faction Bases
    const initTiles: TileSpec[] = [
      {row: 2, col: 5, t: 'Base', h: '-'}, // Base
      {row: 4, col: 1, t: 'Base', h: '-'}, // Base(2)|Mtn(3-5)

      {row: 3, col: 3, t: 'Plains', h: 'G1'}, // Plain:gem
      {row: 3, col: 4, t: 'Swamp', h: 'C'}, // Swamp:card
      {row: 3, col: 5, t: 'Hills', h: 'G1'}, // Hills:gem
      {row: 4, col: 2, t: 'Swamp', h: 'E2'}, // S:energy
      {row: 4, col: 3, t: 'Swamp', h: 'C'}, // S:card
      {row: 4, col: 4, t: 'Hills', h: 'E2'}, // H:energy
      {row: 4, col: 5, t: 'Swamp', h: 'G1'}, // swamp:gem
      {row: 5, col: 2, t: 'Plains', h: 'C'}, // Plain:card
      {row: 5, col: 4, t: 'Plains', h: 'E2'}, // Plain:energy

      {row: 4, col: 6, t: 'Lake', h: '-'}, // Lake:none
      {row: 5, col: 3, t: 'Lake', h: '-'}, // Lake:none
      {row: 5, col: 5, t: 'Hills', h: 'C'}, // Hills:card
      {row: 6, col: 4, t: 'Base', h: '-'}, // Base(2)|xtile3
    ];
    const xtile3 = permute6([{t: 'Hills', h: 'E2'}, {t: 'Swamp', h: 'G1'}, {t: 'Plains', h: 'C' }], p6ary[0])
    const xtile4 = permute6([{t: 'Hills', h: 'C' }, {t: 'Swamp', h: 'E2'}, {t: 'Plains', h: 'G1'}], p6ary[1])
    const xtile5 = permute6([{t: 'Hills', h: 'G1'}, {t: 'Swamp', h: 'C' }, {t: 'Plains', h: 'E2'}], p6ary[2])
    const xbase = (tid: TERRAIN) => ({ t: tid });

    const tiles3: TileSpec[] = rct([
      [6, 2, xtile3[0]], [6, 3, xtile3[1]], [6, 4, xtile3[2]],
      [7, 4, xbase('Base')] , [3, 2, xbase('Base')], [5, 1, xbase('Base')], [4,  1, xbase('Mtn')], [5, 6, xbase('Base')],
    ]);
    const tiles4: TileSpec[] = rct([
      [6, 5, xtile4[0]], [6, 6, xtile4[1]], [3, 6, xtile4[2]],
    ]);
    const tiles5: TileSpec[] = rct([
      [3, 1, xtile5[0]], [4, 1, xtile5[1]], [2, 3, xtile5[2]],
    ]);
    const  xtraTileAry = [[], [], [], tiles3, tiles4, tiles5, []]

    const placeTunnel = (dir12: HexDir, hex1: IHex2, hex2: IHex2, fillc = C.BLUE) => {
      const points = (xs = TP.hexRad * .33, ys = TP.hexRad * .4) => {
        return [
          [-xs/2, ys/2],
          [ xs/2, ys/2],
          [ xs/2, 0],
          [ 0, -ys/2],
          [-xs/2, 0 ],
          [-xs/2, ys/2],
        ] as [x: number, y: number][];
      }
      const pent = (rad: number, fillc: string, tilt = 0, strokec = '') => {
        const cont = new NamedContainer('tunnel');
        const pent = new PathShape({ points: points(rad), fillc, strokec});
        cont.addChild(pent);
        cont.rotation = tilt;
        return cont;
      };

      const tunnelFrom = (dir12: HexDir, hex1: IHex2, hex2: IHex2, fillc = C.BLUE) => {
        hex1.links[dir12] = hex2;
        hex2.links[H.dirRev[dir12]] = hex1;
        const tilt = H.dirRot[dir12], rad = TP.hexRad/3;
        const icon = pent(rad, fillc, tilt)
        hex1.edgePoint(dir12, 1.35, icon);
        map.mapCont.tileCont.addChild(icon); // QQQ: Is .tileCont the correct layer?
      }
      tunnelFrom(dir12, hex1, hex2, fillc)
      tunnelFrom(H.dirRev[dir12], hex2, hex1, fillc)
    }

    const placeTile = (tileSpec: TileSpec) => {
      const { row, col, t, h } = tileSpec;
      const tile = new ChaosTile(`T${row},${col}:${t.slice(0,1)}:${h}`, t, h);
      map.replaceTile(tile, row, col);
    }
    map.sculptMap();                                 // reshape to basic hexes
    initTiles.forEach(ts => placeTile(ts));          // place fixed tiles on basic hexes
    for (let ndx = 3; ndx <= np; ndx++ ) {
      xtraTileAry[ndx].forEach(ts => placeTile(ts)); // place extra (per player count) tiles, randomized
    }

    map.forEachHex(hex => {
      hex.tile || placeTile({ ... hex, t: 'Mtn', h: '-' });   // cover unused hexes with Mtn
    })

    // place 3 standard adjacency-breaking mountains:
    this.placeMtn(map.getHex({row: 4, col: 4}), map.getHex({row: 3, col: 4}) );
    this.placeMtn(map.getHex({row: 4, col: 4}), map.getHex({row: 4, col: 5}) );
    this.placeMtn(map.getHex({row: 4, col: 2}), map.getHex({row: 5, col: 2}) );
    placeTunnel(H.N, map.getHex({row: 3, col: 6}), map.getHex({row: 6, col: 2}), C.BLUE)
    placeTunnel(H.WN, map.getHex({row: 3, col: 1}), map.getHex({row: 6, col: 6}), C.RED)

    // set all Mtn & Base Tiles unreachable: (will re-link when actual Base is placed)
    map.forEachHex(hex => {
      const tile = hex.tile as ChaosTile;
      if (tile?.terrain == 'Mtn' || tile?.terrain == 'Base') {
        hex.forEachLinkHex((hex2: ChaosHex2, dir, hex0: ChaosHex2) => {
          delete hex0.links[dir!]
          delete hex2.links[H.dirRev[dir!]]
        })
      }
    })

    map.forEachHex(hex => {
      if (hex.ctile?.terrain == 'Swamp') {
        const f = new Foundation('Base!', 'C', 20)
        hex.ctile.addFoundation(f, true);    // hack to add some Foundation to map:
      }
    })

    // map.forEachHex(hex => {
    //   if (hex.ctile?.terrain == 'Base') hex.ctile.sendHome(); // remove 'Base' cover tiles
    // })

  }
}
