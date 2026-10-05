import { PaintableShape } from "@thegraid/easeljs-lib";
import { TP as TPLib, } from "@thegraid/hexlib";
import type { ChaosHex2 } from "./chaos-hex";
import type { Foundation } from "./foundation";
import type { ChaosBuilding } from "./meeples";

// some types & constants moved out of GameState:
/** generic callback */
export type CB = (... arg: any[]) => void;
export const phaseNames = ['SetPrices', 'Discovery', 'Build', 'Harvest', 'Recruit', 'Move', 'Combat', 'Income', 'Relics'] as const;
export type PhaseName = typeof phaseNames[number];
export const priceNames = ['Discovery', 'Build', 'Harvest', 'Recruit', 'MoveFirst', 'MoveLast'] as const;
export type PriceName = typeof priceNames[number];
export const pricePhases = ['Discovery', 'Build', 'Harvest', 'Recruit', 'Move'] as const;
export type PricePhase = typeof pricePhases[number];

export class TP extends TPLib {
  static {
    const tp = TPLib;
    // do not 'override' --> set lib value
    tp.useEwTopo = false;    // Use NS Topo
    tp.maxPlayers = 6;       // allows space for CardPanel
    tp.numPlayers = 4;
    tp.cacheTiles = 2.5;
    PaintableShape.defaultRadius = tp.hexRad;
  }
  /** reset each round */
  static freeAuxForOxataya = true;
  static aButtonEvent?: MouseEvent = undefined;
  // timeout: see also 'autoEvent'
  static stepDwell:  number = 150

  /** used to track Build actions */
  static newlyBuilt: (ChaosBuilding | Foundation)[] = [];

  /** Build action: Before-Advice callback on placeBuilding(hex) or placeFoundation(hex)  */
  static whenBuildingPlacedCB?: (building: ChaosBuilding | Foundation, hex?: ChaosHex2) => void;
  static whenBuildingPlaced(built: Foundation | ChaosBuilding, hex?: ChaosHex2) {
    if (TP.whenBuildingPlacedCB) TP.whenBuildingPlacedCB(built, hex);
  }
}


/** colors for ChaosOrder */
export namespace CO {
  export const btColor = 'rgb(203, 135, 183)'; // baseTile color (lighter mauve-ish)
  export const mauve = 'rgb(166, 78, 129)'; // bold mauve
  export const dmauve = 'rgb(138, 105, 138)'; // dark mauve
  export const orange = 'rgb(255, 140, 0)'; // color for phase Icons
  export const nColor = 'rgb(255, 140, 0)'; // neutral color
  export const bColor = 'rgb(255, 140, 0)'; // bank color
  export const dColor = 'rgb(150, 70, 0)'; // default background color? for PTokenShape
  export const gColor = 'rgb(240, 30, 0)'; // gem Color
  export const rhy_zu = 'rgb(210, 75, 41)'; // Rhyzu.pColor

}


