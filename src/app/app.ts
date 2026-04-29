import { Component, signal } from '@angular/core';
import { Title } from '@angular/platform-browser';
import { RouterOutlet } from '@angular/router';
import { stime } from '@thegraid/common-lib';
import { StageComponent } from './stage/stage.component';

@Component({
  selector: 'app-root',
  imports: [StageComponent, RouterOutlet],
  templateUrl: './app.html',
  styleUrl: './app.css'
})
export class App {
  protected readonly title = signal('chaos');
  timestamp = `${new Date().toLocaleTimeString('en-US')}`;
  linkUrl = 'https://github.com/jackpunt/chaos?tab=readme-ov-file#readme';
  linkName!: string;

  constructor(private titleService: Title) {
    console.log(stime(this, `.App`), this.titleService)
    this.linkName = `${this.titleService?.getTitle()} - User Guide`;
  }
}
