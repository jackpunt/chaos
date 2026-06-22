import { selectN, stime, uniq, type Constructor } from '@thegraid/common-lib';
import { AliasLoader, TileExporter } from '@thegraid/easeljs-lib';
import type { Container } from '@thegraid/easeljs-module';
import { GameSetup as GameSetupLib, H, HexMap, MapCont, PlayerPanel, Tile, TP, type Hex, type SetupElt, type StartElt as StartEltLib } from '@thegraid/hexlib';
import { ChaosHex2, HexMap2 } from './chaos-hex';
import { ChaosTable as Table } from './chaos-table';
import { FactionId, FactionName, factionNames } from './factions';
import { GamePlay } from './game-play';
import { mixins } from './mixins';
import { Panel, Player } from './player';
import { TacticsCard } from './tactics-card';

// TODO: you can run a tool like dpdm or madge from your terminal window
// (npx madge --circular --extensions ts .) to map the dependency graph layout

declare module '@thegraid/hexlib' {
  interface MapCont {
    overCont: Container;
  }
}

/** extend with required FactionIds! */
export interface StartElt extends StartEltLib {
  facIds: FactionId[];
}


type Params = Record<string, any>; // until common-lib supplies
export interface Scenario extends StartEltLib {
  nFacs?: FactionId;
  facNames: FactionName[];
};

/** initialize & reset & startup the application/game.
 *
 * NullGameSetup is our local implementation.
 */
class NullGameSetup extends GameSetupLib {
  declare hexMap: HexMap2;

  static {
    // insert methods of HexMap2: Panel extends HexMap2 & PlayerPanel {...}
    const bOverA1 = mixins.clonePrototypeChain(HexMap2, PlayerPanel.prototype);
    Object.setPrototypeOf(Panel.prototype, bOverA1);   // now Panel ISA HexMap2 & PlayerPanel
  }
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
    TP.hexRad = 120 / H.sqrt3;   // 69.28
    TacticsCard.nextRadius = TacticsCard.onScreenRadius;
    TP.useEwTopo = false;
    TP.numPlayers = 4;    // default until qParams (for ex: ?n=3)
    TP.ghost = host || TP.ghost
    TP.gport = Number.parseInt(port || TP.gport.toString(10), 10)
    TP.networkGroup = 'chaos:game1';
    TP.networkUrl = TP.buildURL(undefined);
    TP.meepleRad = TP.hexRad * .8;  // scale size of Meeples (factory...Leader, Fighter)
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

  /** presentation name of each Faction in play, in table order; survives restart */
  facNames: FactionName[] = [];
  /** Faction ID for each Player(faction), in table order. */
  facIds: FactionId[] = [3, 4];  // default for 2 players

  /** set this.facIds & facNames; return facIds.length */
  override getNPlayers(qParams: { [x: string]: any; } = this.qParams, nDefault = 4): number {
    const fid = [ 5, 4, 3, 2, 1, 0 ] as FactionId[];       // faction ids in default selection order
    const qn = qParams?.['n'] as string; // "3" OR user-specified number of players
    const pn = qn ? Math.min(TP.maxPlayers, Math.max(0, Number.parseInt(qn))) : undefined;
    const np = pn || nDefault; // fallback default number of players

    const pf = qParams?.['f'] as string; // "4,3,2" user-specified selection
    let fids = (pf ? pf.split(',').map(fs => Number.parseInt(fs)).filter(id => id >=0 && id < 6) : fid.slice(0, np)) as FactionId[];
    if (pn && fids.length != pn) {
      fids = [...fids, ...fid.filter(id => !fids.includes(id))].slice(0, pn);
    }

    this.facIds = fids
    this.facNames = this.facIds.map(ndx => factionNames[ndx]);  // faction names
    console.log(stime(this, `.new:`), "factions Names playing:", this.facNames);
    return this.facIds.length;
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
    const n = TP.numPlayers =this.getNPlayers(qParams, nDefault);   // retain previous value if not supplied
    return { Aname: 'defaultScenario', n, facIds: this.facIds, ...qParams, turn: 0, };
  }

  nPlayers!: number;
  scenario!: Scenario;  // last scenario loaded

  override startScenario(scenario: Scenario) {

    this.scenario = scenario;
    TP.numPlayers = this.nPlayers = scenario.nFacs ?? this.nPlayers;
    this.facNames = scenario.facNames ?? this.facNames;
    const table = this.table = new Table(this.stage)        // EventDispatcher, ScaleCont, GUI-Player

    // use n= or f=[...] fill to n= with default faction order
    const fillFacNames = (nfacs: number, facNames: string[]) => {
      const uniqFacs = uniq(facNames);
      const nToFind = (nfacs - facNames.length);
      const fullNames = (nToFind > 0)
        ? [...uniqFacs].concat(selectN(factionNames.filter(gn => !uniqFacs.includes(gn)), nfacs - uniqFacs.length))
        : (nToFind < 0) ? selectN(uniqFacs, nfacs) : uniqFacs;
      fullNames.length = Math.min(fullNames.length, TP.maxPlayers);
      return fullNames as FactionName[];
    }
    if (scenario.turn === undefined || scenario.facNames === undefined) {
      scenario.facNames = fillFacNames(scenario.nFacs ?? this.nPlayers, this.facNames); // inject requested Facs.
    }

    return super.startScenario(scenario)
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
    cNames.splice(cNames.indexOf('tileCont')+1, 0, 'overCont')
    const hexMap = super.makeHexMap(hexMC, hexC, cNames) as HexMap2; // hexMap.makeAllHexes(nh=TP.nHexes, mh=TP.mHexes)
    return hexMap;
  }

  override makeTable(): NullTable {
    return new NullTable(this.stage);
  }

  override makeGamePlay(startElt: SetupElt): GamePlay {
    const gp = new GamePlay(this, startElt);
    Tile.gamePlay = gp;
    this.hexMap.setupMapTiles();   // TODO: move this to ScenarioParser.parseScenario()
    return gp;
  }

  /** hack a neutral 'Player' so we can build the neutral Panel (the Research tracks)  */
  makeNeutralPlayer(gamePlay: GamePlay) {
    const np = TP.numPlayers;
    const nid = (6) as FactionId;
    this.facIds.push(nid);
    this.facNames[nid] = ('neutral' as FactionName);
    const plyr = gamePlay.neutralPlayer = new Player(np, gamePlay)
    ;(plyr as any).Aname = 'P:neutral';
    plyr.color = 'brown';
    delete this.facIds[nid];
    TP.numPlayers = np;
  }

  override makeAllPlayers(gamePlay: GamePlay): void {
    this.makeNeutralPlayer(gamePlay);
    super.makeAllPlayers(gamePlay);
  }

  // invoked by makeAllPlayers; faction = this.facIds[ndx]
  override makePlayer(ndx: number, gamePlay: GamePlay): Player {
    const p = new Player(ndx, gamePlay);
    // console.log(stime(p, `.new: ${p.Aname}`), p.index, p.facId, p.facName, p.color)
    return p;
  }
}

/** the class instantiated by stage.components.ts
 *
 * for reasons, we wrap it this way:
 */
export class GameSetup extends NullGameSetup {
}

/** Table used by NullGameSetup */
class NullTable extends Table {
  // These methods should move to ChaosTable
  // override makePerPlayer(): void {
  // }

  override makeGUIs(scale?: number, cx = -154, cy = 210, dy?: number): void {
    this.guisToMake = []
    if (!this.stage.canvas) return;
    super.makeGUIs(scale, cx, cy);
  }
}
