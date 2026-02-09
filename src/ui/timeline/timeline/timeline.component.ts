import { Component, ChangeDetectionStrategy } from '@angular/core';
import { TimelineEditor } from '../timeline-editor/timeline-editor';

@Component({
  selector: 'app-timeline',
  templateUrl: './timeline.component.html',
  styleUrls: ['./timeline.component.css'],
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [TimelineEditor],
})
export class TimelineComponent {}
