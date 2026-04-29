import { Component, HostListener, Inject, Input, OnInit } from '@angular/core';
import { Title } from '@angular/platform-browser';
import { ActivatedRoute, Params } from '@angular/router';
import { stime } from '@thegraid/common-lib';
import { KeyBinder } from '@thegraid/easeljs-lib';
import { } from 'wicg-file-system-access';
import { GameSetup } from '../game-setup';

// Our application main entry point.
// StageComponent sets up KeyBinder and creates a new GameSetup(qParams)
@Component({
  standalone: true,
  selector: 'stage-comp',
  providers: [KeyBinder, Title],
  templateUrl: './stage.component.html',
  styleUrls: ['./stage.component.css']
})
export class StageComponent implements OnInit {

  static idnum: number = 0;
  getId(): string {
    return `T${(StageComponent.idnum = StageComponent.idnum + 1)}`;
  };

  /** the query string: ?a=...&b=...&c=... =>{a: ..., b: ..., c:...} */
  @Input('params')
  qParams: Params = {};

  @Input('width')
  width = 1600.0;   // [pixels] size of "Viewport" of the canvas / Stage
  @Input('height')
  height = 800.0;   // [pixels] size of "Viewport" of the canvas / Stage

  /** HTML make a \<canvas/> with this ID: */
  mapCanvasId = `mapCanvas${this.getId()}`; // argument to new Stage(this.canvasId)

  constructor(
    @Inject(KeyBinder) private keyBinder: KeyBinder,
    private activatedRoute: ActivatedRoute,
    private titleService: Title,
  ) { }

  ngOnInit() {
    console.log(stime(this, ".noOnInit---"))
    this.activatedRoute.params.subscribe(params => {
      console.log(stime(this, ".ngOnInit: params="), params)
    })
    this.activatedRoute.queryParams.subscribe(params => {
      console.log(stime(this, ".ngOnInit: queryParams="), params);
      this.qParams = params;
    });
  }

  ngAfterViewInit() {
    setTimeout(()=>this.ngAfterViewInit2(), 250) // https://bugs.chromium.org/p/chromium/issues/detail?id=1229541
  }

  ngAfterViewInit2() {
    const href: string = document.location.href, title = this.titleService.getTitle();
    const qParams = { ...this.qParams, title };
    console.log(stime(this, ".ngAfterViewInit---"), href, "qParams=", qParams)
    const gs = new GameSetup(this.mapCanvasId, qParams);
    this.titleService.setTitle(`${title} ${gs.pageLabel}`)
    gs.loadImagesThenStartup();     // loadImages -> startup: new GamePlay(qParams);
  }

  // see: stream-writer.setButton
  /** Set the HTML (fsOpenFileButton) button to do a wicg-file-system-access action */
  static enableOpenFilePicker(method: 'showOpenFilePicker' | 'showSaveFilePicker' | 'showDirectoryPicker',
    options: OpenFilePickerOptions & { multiple?: boolean } & SaveFilePickerOptions & DirectoryPickerOptions,
    cb: (fileHandleAry: any) => void) {
    const picker = window[method]       // showSaveFilePicker showDirectoryPicker
    const fsOpenButton = document.getElementById("fsOpenFileButton")
    if (fsOpenButton) fsOpenButton.onclick = async () => {
      picker(options).then((value: any) => cb(value), (rej: any) => {
        console.warn(`showOpenFilePicker failed: `, rej)
      });
    }
  }

  // app.component has access to the 'Host', so we use @HostListener here
  // Listen to all Host events and forward them to our internal EventDispatcher
  @HostListener('document:keyup', ['$event'])
  @HostListener('document:keydown', ['$event'])
  @HostListener('mouseenter', ['$event'])
  @HostListener('mouseleave', ['$event'])
  @HostListener('focus', ['$event'])
  @HostListener('blur', ['$event'])
  dispatchAnEvent(event: Object) {
    // ask before [Cmd-W] closing browser tab: blocks auto-reload!
    // addEventListener(
    //   'beforeunload',
    //   e => { e.stopPropagation(); e.preventDefault(); return false; },
    //   true
    // );
    //console.log("dispatch: "+event.type);
    this.keyBinder.dispatchEvent(event);
  }
}
