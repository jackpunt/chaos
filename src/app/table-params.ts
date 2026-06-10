import { PaintableShape } from "@thegraid/easeljs-lib";
import { TP as TPLib, } from "@thegraid/hexlib";


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

  // timeout: see also 'autoEvent'
  static stepDwell:  number = 150
}
