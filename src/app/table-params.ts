import { PaintableShape } from "@thegraid/easeljs-lib";
import { TP as TPLib, playerColorRecord } from "@thegraid/hexlib";
export { otherColor, playerColor0, playerColor1, playerColorRecord, playerColorRecordF, playerColors } from "@thegraid/hexlib";

declare type Params = Record<string, any>;

export class TP extends TPLib {
  static {
    const tp = TPLib;
    // do not 'override' --> set lib value
    tp.useEwTopo = true;
    tp.maxPlayers = 6;       // allows space for CardPanel
    tp.numPlayers = 2;
    tp.cacheTiles = 2.5;
    PaintableShape.defaultRadius = tp.hexRad;
  }
  static override setParams(qParams?: Params, force?: boolean, target?: Params) {
    const TP0 = TP, TPlib = TPLib; // inspectable in debugger
    const rv = TPLib.setParams(qParams, force, target); // also set in local 'override' copy.
    // console.log(`TP.setParams:`, { qParams, TP0, TPlib, ghost: TP.ghost, gport: TP.gport, networkURL: TP.networkUrl });
    return rv;
  }

  static Black_White = playerColorRecord<'BLACK' | 'WHITE'>('BLACK', 'WHITE')
  static Blue_Red = playerColorRecord<'BLUE' | 'RED'>('BLUE', 'RED')
  static Red_Blue = playerColorRecord<'RED' | 'BLUE'>('RED', 'BLUE')
  /** ColorScheme names allowed in choice selector */
  static schemeNames = ['Red_Blue']

  // timeout: see also 'autoEvent'
  static stepDwell:  number = 150

  static override bgColor: string = 'tan' //'wheat'// C.BROWN
  static borderColor: string = 'peru'//TP.bgColor; //'burlywood'
  static override meepleY0 = 0;

  static initialCoins = 0;
  static afSize = .5;   // * TP.hexRad
  static afWide = 3;    // pixels
  static afSquare = false as boolean | number; // .87 ? 1.35
  static afSCF = [3, 2, 2]; // nShapes, nColors, nFills
}
