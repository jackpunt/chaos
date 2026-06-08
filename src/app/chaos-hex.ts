import { type Constructor } from "@thegraid/common-lib";
import { NamedContainer } from "@thegraid/easeljs-lib";
import { Hex1 as Hex1Lib, Hex2Mixin, HexMap, TileSource, type Tile } from "@thegraid/hexlib";
import { type ChaosTile } from "./chaos-tile";
import { Fighter, type Barracks, type Factory, type Leader, type Stronghold } from "./meeples";
import type { Player } from "./player";
import type { TacticsCard } from "./tactics-card";


/** per-Player bit on map Hex */
class PlayerOnHex extends NamedContainer {
  constructor(player: Player) {
    super(`plyr-${player.facId}`);
  }
  leaders: Leader[] = [ ];              // 2 slots (own + Rhyzu), Zcharo: 3, Oxytaya: 4
  Fighters!: TileSource<Fighter>;       // Fighter in slot, followed by Leader(s)
  factorys!: TileSource<Factory>;       // Players share same xy offsets
  barracks!: TileSource<Barracks>;      // Players share same xy offsets
  strongholds!: TileSource<Stronghold>; // Players share same xy offsets
}


// Hex1 has get/set tile/meep -> _tile/_meep
// Hex1 has get/set -> setUnit(unit, isMeep) & unitCollision(unit1, unit2)
export class ChaosHex extends Hex1Lib {
  /** hold all the player Units & Buildings */
  playerOnHex: PlayerOnHex[] = [];

  // each unit type has it's own 'slot', per Player in most cases.
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

export class HexMap2 extends HexMap<ChaosHex2> {
  constructor(radius?: number, addToMapCont?: boolean, hexC: Constructor<ChaosHex2> = ChaosHex2, Aname?: string) {
    super(radius, addToMapCont, hexC, Aname)
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
}
