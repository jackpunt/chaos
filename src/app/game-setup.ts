import { stime, type Constructor } from '@thegraid/common-lib';
import { AliasLoader, TileExporter } from '@thegraid/easeljs-lib';
import { GameSetup as GameSetupLib, Hex2, HexMap, MapCont, Scenario as Scenario0, Table, Tile, TP, type Hex, type IHex2, type SetupElt, type StartElt } from '@thegraid/hexlib';
import { ChaosTile } from './chaos-tile';
import { ChaosHex2, HexMap2 } from './chaos-hex';
import { GamePlay } from './game-play';
import { ChaosTable } from './chaos-table';
import { Player } from './player';

type Params = Record<string, any>; // until common-lib supplies
export interface Scenario extends Scenario0 {
  nPlayers?: number;
};

// TODO:
// ChaosHex, ChaosMap (makeHexMap),

/** initialize & reset & startup the application/game.
 *
 * NullGameSetup is our local implementation.
 */
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
    const { host, port, file } = qParams;
    TP.hexRad = 70;
    TP.useEwTopo = false;
    TP.numPlayers = 4;    // default until qParams (for ex: ?n=3)
    TP.nHexes = 4;
    TP.ghost = host || TP.ghost
    TP.gport = Number.parseInt(port || TP.gport.toString(10), 10)
    TP.networkGroup = 'chaos:game1';
    TP.networkUrl = TP.buildURL(undefined);
    TP.meepleRad = TP.hexRad * .3;  // scale size of Meeples (factory...Leader, warrior)
    TP.meepleY0 = 0;                // each is different, put it at {0, 0}
    super.initialize(canvasId);
    let rfn = document.getElementById('readFileName') as HTMLInputElement;
    rfn.value = file ?? 'setup@0';

    return;
  }

  override loadImagesThenStartup() {
    const fnames: string[] = [];
    AliasLoader.loader.fnames = [...fnames];
    super.loadImagesThenStartup();    // loader.loadImages(() => this.startup(qParams));
  }

  /** presentation name of each Faction */  // TODO: move these to Scenario & parser?
  factionNames = ['Circadian', 'AI', 'Zcharo', 'Leyrein', 'Jrayek', 'Oxytaya'];
  /** Faction ID for each Player, in table order. */
  factionIds = [5, 4];  // default for 2 players

  /** set this.factionIds, return factionIds.length */
  override getNPlayers(qParams?: { [x: string]: any; }, nDefault = 4): number {
    const fid = [ 4, 3, 2, 1, 0];        // faction ids in default selection order
    const pf = qParams?.['f'] as string; // "4,3,2" user-specified selection
    const pn = qParams?.['n'] as string; // "3" OR user-specified number of players
    const np = pn ? Number.parseInt(pn) : nDefault; // fallback default number of players
    this.factionIds = pf ? pf.split(',').map(fs => Number.parseInt(fs)) : fid.slice(-np); // factionIds in table order
    const fns = this.factionIds.map(ndx => this.factionNames[ndx]);  // faction names
    console.log("factions Names:", fns);
    return this.factionIds.length;
  }

  override startup(scenario: Scenario): void {
    super.startup(scenario);        // --> startScenario(StartElt: this.initialScenario(qParms)) -->
    Tile.gamePlay = this.gamePlay;  // so Tile drags can find gamePlay
    // super.startup(scenario) {
    //   const startElt = this.initialScenario(qParams); // produces a StartupElt from qParams (which could be a SetupElt)
    //   this.startupScenario = startElt;   // retain for future reference
    //   this.startScenario(startElt);    // this.clickButton('makePage'); // app.component.html
    // }
    //
    // GameSetup.startScenario(startElt) {
    // --- TP.numPlayers = this.getNPlayers();
    // --- makeHexMap();
    // --- makeTable();
    // --- makeGamePlay();
    // --- makeAllPlayers();
    // --- layoutTable(); --> table.layoutTable2();
    // --- --- table.makePerPlayer()
    // --- --- --- table.makePlayerPanel(this, player, high, wide, row, col, dir); -> new PlayerPanel(...)
    // --- --- --- table.makePlayerBits();
    // --- --- --- table.setPlayerScore();
    // --- gamePlay.parseScenario();
    // --- makeGUIs();
    // --- gamePlay.forEachPlayer.newGame(gamePlay);
    // --- startGame();
    // }

    // setTimeout(() => this.setScale('.1'), 300);
  }

  // see also: gameSetup.resetState() which can cleanup or extend the Scenario.
  // for Chaos do it like Ankh: np & Faction names (use index number)
  // /?f=[0,2,3,1] --> ['Circadian', 'Zcharo', 'Leyrein', 'AI']
  // /?n=3 --> use fn.slice(0, n)
  override initialScenario(qParams = this.qParams): StartElt {
    let nDefault = TP.numPlayers ?? 4;
    TP.numPlayers = 0;             // reset; use value from getNPlayers
    // qParams may have: f=2,3,4 OR n=3 (--> [4,3,2])
    const n = this.getNPlayers(qParams, nDefault);   // retain previous value if not supplied
    TP.numPlayers = n;
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
    hexMC: Constructor<HexMap<Hex>> = HexMap2,
    hexC: Constructor<Hex> = ChaosHex2, // (radius, addToMapCont, hexC, Aname)
    cNames = MapCont.cNames.concat() as string[], // the default layers
  ) {
    TP.nHexes = 4;
    TP.mHexes = 1;
    const hexMap = super.makeHexMap(hexMC, hexC, cNames) as HexMap<IHex2>; // hexMap.makeAllHexes(nh=TP.nHexes, mh=TP.mHexes)
    return hexMap;
  }

  override makeTable(): NullTable {
    return new NullTable(this.stage);
  }

  /** remove given hex from Stage */
  rmHex2(hex: Hex) {
    (hex as IHex2).cont?.parent.removeChild((hex as IHex2).cont);
  }
  rmHex(hexMap: HexMap<IHex2>, row: number, col: number) {
    this.rmHex2(hexMap[row][col]);
    delete hexMap[row][col];
  }
  /** remove each hex not used by Chaos map */
  sculptMap(hexMap: HexMap<IHex2>) {
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

  override makeGamePlay(startElt: SetupElt): GamePlay {
    const gp = new GamePlay(this, startElt);
    Tile.gamePlay = gp;
    const hexMap = this.hexMap as HexMap<IHex2>;
    this.sculptMap(hexMap);
    ChaosTile.setupMapTiles(hexMap);   // TODO: move this to ScenarioParser.parseScenario()
    return gp;
  }

  // invoked by makeAllPlayers
  override makePlayer(ndx: number, gamePlay: GamePlay): Player {
    return new Player(ndx, gamePlay); // TODO: define our class Player {}
  }
}

/** the class instantiated by stage.components.ts
 *
 * for reasons, we wrap it this way:
 */
export class GameSetup extends NullGameSetup {
}

/** Table used by NullGameSetup */
class NullTable extends ChaosTable {
  // These methods should move to ChaosTable
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
