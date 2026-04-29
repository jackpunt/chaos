import { stime, type Constructor } from '@thegraid/common-lib';
import { AliasLoader, TileExporter } from '@thegraid/easeljs-lib';
import { GameSetup as GameSetupLib, Hex2, HexMap, MapCont, Scenario as Scenario0, Table, Tile, TP, type Hex, type StartElt } from '@thegraid/hexlib';

type Params = Record<string, any>; // until common-lib supplies
export interface Scenario extends Scenario0 {
  nPlayers?: number;
};

// TODO:
// ChaosHex, ChaosMap (makeHexMap),

/** initialize & reset & startup the application/game. */
class NullGameSetup extends GameSetupLib {

  constructor(canvasId?: string, qParam?: Params) {
    super(canvasId, qParam);
    const exp = qParam?.['t'] ?? 0;
    const tileExp = [TileExporter, TileExporter][exp]
    this.tileExporter = new tileExp(); // enable 'Make Pages' buttons
  }

  tileExporter: TileExporter; // enable 'Make Pages' buttons

  // allow qParams as opt arg:
  override initialize(canvasId: string, qParams = this.qParams): void {
    console.log(stime(this, `---------------------   GameSetup.initialize ${canvasId} ----------------`))
    // Enable right-click:
    window.addEventListener('contextmenu', (evt: MouseEvent) => evt.preventDefault())
    // useEwTopo, size 3.
    const { host, port, file, nH } = qParams;
    TP.useEwTopo = false;
    TP.numPlayers = 4;    // default until qParams (for ex: ?n=3)
    TP.nHexes = nH || 3;
    TP.ghost = host || TP.ghost
    TP.gport = Number.parseInt(port || TP.gport.toString(10), 10)
    TP.networkGroup = 'chaos:game1';
    TP.networkUrl = TP.buildURL(undefined);
    super.initialize(canvasId);
    let rfn = document.getElementById('readFileName') as HTMLInputElement;
    rfn.value = file ?? 'setup@0';

    return;
  }

  override loadImagesThenStartup() {
    const demo = ['Recycle'];
    AliasLoader.loader.fnames = [...demo];
    super.loadImagesThenStartup();    // loader.loadImages(() => this.startup(qParams));
  }

  // TODO: move these to Scenario & parser
  factionNames = ['Circadian', 'AI', 'Zcharo', 'Leyrein', 'Jrayek', 'Oxytaya'];
  playerFactions = ['Oxytaya', 'Jrayek'];

  override getNPlayers(qParams?: { [x: string]: any; }, nDefault?: number): number {
    let fn = (qParams?.['f'] || [4, 3, 2, 1]) as number[];
    this.playerFactions = fn.map(ndx => this.factionNames[ndx]);
    console.log("playerFactions:", this.playerFactions);
    return this.playerFactions.length;
  }

  override startup(scenario: Scenario): void {
    super.startup(scenario);
    Tile.gamePlay = this.gamePlay;
    // this.initialScenario();
    // initialScenario produces a StartupElt from qParams (which could be a SetupElt)
    // const startElt = this.initialScenario(qParams);
    // this.startupScenario = startElt;   // retain for future reference
    // this.startScenario(startElt);    // this.clickButton('makePage'); // app.component.html
    // setTimeout(() => this.setScale('.1'), 300);
  }

  // see also: gameSetup.resetState() which can cleanup or extend the Scenario.
  // for Chaos do it like Ankh: np & Faction names (use index number)
  // /?f=[0,2,3,1] --> ['Circadian', 'Zcharo', 'Leyrein', 'AI']
  override initialScenario(qParams = this.qParams): StartElt {
    // qParams may have: np,
    const n = this.getNPlayers(qParams)
    return { Aname: 'defaultScenario', n, ...qParams, turn: 0, };
  }

  setScale(newScale: string) {
    const canvasDiv = document.getElementById('canvasDiv') as HTMLCanvasElement;
    canvasDiv.style.setProperty('scale', newScale);
  }

  clickButton(id: string) {
    const anchor = document.getElementById(id) as HTMLAnchorElement;
    anchor?.onclick?.call(window, {} as any); // no MouseEvent, its not used; -> TileExporter.makeImagePages()
  }
  override makeHexMap(
    hexMC: Constructor<HexMap<Hex>> = HexMap,
    hexC: Constructor<Hex> = Hex2, // (radius, addToMapCont, hexC, Aname)
    cNames = MapCont.cNames.concat() as string[], // the default layers
  ) {
    TP.nHexes = 1;
    TP.mHexes = 1;
    const hexMap = super.makeHexMap(hexMC, hexC, cNames); // hexMap.makeAllHexes(nh=TP.nHexes, mh=TP.mHexes)
    return hexMap;
  }

  override makeTable(): NullTable {
    return new NullTable(this.stage);
  }
}

export class GameSetup extends NullGameSetup {

}

class NullTable extends Table {
  // override makePerPlayer(): void {
  // }
  override setupUndoButtons(): void {
  }
  override makeGUIs(scale?: number, cx = -154, cy = 210, dy?: number): void {
    this.guisToMake = []
    if (!this.stage.canvas) return;
    super.makeGUIs(scale, cx, cy);
  }
}
