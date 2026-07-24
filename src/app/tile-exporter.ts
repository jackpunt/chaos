import { ImageGrid, TileExporter as TileExporterLib, type CountClaz, type PageSpec } from "@thegraid/easeljs-lib";
import { CardBack, TacticsCard } from "./tactics-card";
// end imports

export class TileExporter extends TileExporterLib {
  override makeImagePages() {
    const u = undefined;
    const pc = TacticsCard.colorMap;
    const cardSingle = [
      ...TacticsCard.countClaz(3), // [count, claz, ...constructorArgs]
      [0, CardBack, u, '', pc.back],
    ] as CountClaz[];
    const circDouble = [ // [count, class],
    ] as CountClaz[];

    const pageSpecs: PageSpec[] = [];
    this.clazToTemplate(cardSingle, ImageGrid.cardSingle_1_75, pageSpecs);
    // this.clazToTemplate(hexSingle, ImageGrid.hexSingle_1_19, pageSpecs);
    return pageSpecs;
  }

}
