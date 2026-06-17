import { Component, inject } from '@angular/core';
import { AppStore } from '../../../data/store/app.store';
import { BoilControlComponent } from './boil-control/boil-control.component';
import { OnionControlComponent } from './onion-control/onion-control.component';
import { PlaybackControlsComponent } from './playback-controls/playback-controls.component';
import { TimelineZoomComponent } from './timeline-zoom/timeline-zoom.component';
import { DurationControlComponent } from './duration-control/duration-control.component';
import { formatTime as formatTimeUtil } from '../helpers/format-time';

@Component({
  selector: 'app-timeline-menu',
  imports: [
    BoilControlComponent,
    OnionControlComponent,
    PlaybackControlsComponent,
    TimelineZoomComponent,
    DurationControlComponent,
  ],
  templateUrl: './timeline-menu.html',
  styleUrl: './timeline-menu.css',
})
export class TimelineMenu {
  readonly store = inject(AppStore);

  formatTime(seconds: number, hundredths = false): string {
    return formatTimeUtil(seconds, hundredths);
  }
}
