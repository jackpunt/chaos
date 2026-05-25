import { C, Constructor, stime } from "@thegraid/common-lib";
import { Container, DisplayObject } from "@thegraid/easeljs-module";
import { ImageGrid, type GridSpec, type PageSpec } from "@thegraid/easeljs-lib";
import { CardBack, TacticsCard } from "./tactics-card";
import { PrintTile } from "./chaos-tile";
import { Player } from "./player";
// end imports


/** "Tile" in this case is any DisplayObject with a makeBleed() */
interface Tile extends DisplayObject {
  makeBleed(bleed: number): DisplayObject;
}

interface Claz extends Constructor<Tile> {
  /** 0 => flip-on-horiz-axiz, 180 => flip-on-vert-axis, undefined => blank */
  rotateBack?: number | undefined; // static: indicates of a special Back tile is used
}

/** [number of copies, Constructor, ... constructor args] */
export type CountClaz = [count: number, claz: Claz, ...args: any];
class TileExporterLib {

  imageGrid = new ImageGrid(() => { return this.makeImagePages() });

  makeImagePages() {
    const pageSpecs: PageSpec[] = [];
    return pageSpecs;
  }

  /** rotate card to align with template orientation */
  setOrientation(card: Tile, gridSpec: GridSpec, rot = 90) {
    const { width, height } = card.getBounds(), c_land = width > height;
    const t_land = gridSpec.delx > gridSpec.dely;
    if (c_land !== t_land) {
      card.rotation += rot;
      card.updateCache()
    }
  }

  /** Compose tile = new claz(...args) with bleedShape = makeBleed(tile)
   * @returns Container[bleedShape, tile]
   */
  composeTile(claz: Constructor<Tile>, args: any[], gridSpec: GridSpec, back = false, edge: 'L' | 'R' | 'C' = 'C') {
    const cont = new Container();

    const tile = new claz(...args);
    this.setOrientation(tile, gridSpec);
    const bleedShape = this.makeBleed(tile, gridSpec, back, edge)
    cont.addChild(bleedShape, tile);

    return cont;
  }

  /**
   * Make outer bleed for the given tile. Trim bounds of on L or R edge
   */
  makeBleed(tile: Tile, gridSpec: GridSpec, back: boolean, edge: 'L' | 'R' | 'C' = 'C') {
    const bleed = gridSpec.bleed ?? 0;
    const bleedShape = tile.makeBleed(bleed) // 0 or -10 to hide bleed

    if (gridSpec.trimLCR) { // for close-packed shapes, exclude bleed on C edges
      // trim bleedShape to base.bounds; allow extra on first/last column of row:
      const dx0 = (edge === 'L') ? bleed : 0, dw = (edge === 'R') ? bleed : 0;
      const { x, y, width, height } = tile.getBounds(), dy = -3;
      bleedShape.setBounds(x, y, width, height);
      bleedShape.cache(x - dx0, y - dy, width + dx0 + dw, height + 2 * dy);
    }
    return bleedShape;
  }

  /** each PageSpec will identify the canvas that contains the Tile-Images */
  clazToTemplate(countClaz: CountClaz[], gridSpec = ImageGrid.hexDouble_1_19, pageSpecs: PageSpec[] = []) {
    const frontAry = [] as DisplayObject[][];
    const backAry = [] as (DisplayObject[] | undefined)[];
    const page = pageSpecs.length, double = gridSpec.double ?? true;
    const { nrow, ncol } = gridSpec, perPage = nrow * ncol;
    let nt = page * perPage;
    countClaz.forEach(([count, claz, ...args]) => {
      const nreps = Math.abs(count);
      for (let i = 0; i < nreps; i++) {
        const n = nt % perPage, pagen = Math.floor(nt++ / perPage);
        if (!frontAry[pagen]) frontAry[pagen] = [];
        const col = n % ncol, lcr = (col === 0) ? 'L' : (col === ncol - 1) ? 'R' : 'C';
        const frontTile = this.composeTile(claz, args, gridSpec, false, lcr);
        frontAry[pagen].push(frontTile);
        if (double) {
          const backAryPagen = backAry[pagen] ?? (backAry[pagen] = []) as (DisplayObject | undefined)[];
          let backTile = undefined;
          if (claz.rotateBack !== undefined) {
            backTile = this.composeTile(claz, args, gridSpec, true, lcr);
            const tile = backTile.getChildAt(1); // [bleed, tile]
            tile.rotation = claz.rotateBack;
          }
          backAryPagen.push(backTile);
        }
      }
    });
    frontAry.forEach((ary, pagen) => {
      const frontObjs = frontAry[pagen], backObjs = double ? backAry[pagen] : undefined;
      const canvasId = `canvas_P${pagen}`;
      const pageSpec = { gridSpec, frontObjs, backObjs };
      pageSpecs[pagen] = pageSpec;
      console.log(stime(this, `.makePage: canvasId=${canvasId}, pageSpec=`), pageSpec);
      this.imageGrid.makePage(pageSpec, canvasId);  // make canvas with images, but do not download [yet]
    })
    return pageSpecs;
  }

}

export class TileExporter extends TileExporterLib {
  override makeImagePages() {
    const u = undefined;
    const pc = TacticsCard.colorMap;
    const cardSingle = [
      ...TacticsCard.countClaz(3), // [count, claz, ...constructorArgs]
      [0, CardBack, u, '', pc['edge']],
      [0, CardBack, u, '', pc['own']],
      [0, CardBack, u, '', pc['atk']],
      [0, CardBack, u, '', pc['spcl']],
      // [36, CardBack, u, '', C.BLUE],
    ] as CountClaz[];
    const circDouble = [ // [count, class],
    ] as CountClaz[];

    const pageSpecs: PageSpec[] = [];
    this.clazToTemplate(cardSingle, ImageGrid.cardSingle_1_75, pageSpecs);
    // this.clazToTemplate(hexSingle, ImageGrid.hexSingle_1_19, pageSpecs);
    return pageSpecs;
  }

}
