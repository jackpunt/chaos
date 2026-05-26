import { C, type Constructor } from "@thegraid/common-lib";
import { CenterText, CircleShape, type Paintable } from "@thegraid/easeljs-lib";
import { Hex1 as Hex1Lib, Hex2Mixin, HexMap, LegalMark, type Hex } from "@thegraid/hexlib";
import { CardShape } from "./card-shape";
import type { TacticsCard } from "./tactics-card";
import type { ChaosTile } from "./chaos-tile";


// Hex1 has get/set tile/meep -> _tile/_meep
// Hex1 has get/set -> setUnit(unit, isMeep) & unitCollision(unit1, unit2)
export class ChaosHex extends Hex1Lib {

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
}
