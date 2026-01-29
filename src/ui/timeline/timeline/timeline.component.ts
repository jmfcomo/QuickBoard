import { Component, inject } from '@angular/core';
import { AppStore } from '../../../data/store/app.store';

@Component({
  selector: 'app-timeline',
  templateUrl: './timeline.component.html',
  styleUrls: ['./timeline.component.css'],
})
export class TimelineComponent {
  readonly store = inject(AppStore);

  addFrame() {
    const newFrameId = this.store.addFrame();
    this.store.setCurrentFrame(newFrameId);
  }

  selectFrame(frameId: string) {
    this.store.setCurrentFrame(frameId);
  }

  deleteFrame(frameId: string) {
    const frames = this.store.frames();
    if (frames.length > 1) {
      this.store.deleteFrame(frameId);
      // Select another frame if the deleted one was selected
      if (this.store.currentFrameId() === frameId) {
        this.store.setCurrentFrame(frames[0].id);
      }
    }
  }
}
