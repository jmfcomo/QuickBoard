import { Component, ChangeDetectionStrategy } from '@angular/core';
import { TimelineEditor } from '../timeline-editor/timeline-editor';
import { TimelineMenu } from '../timeline-menu/timeline-menu';

@Component({
  selector: 'app-timeline',
  templateUrl: './timeline.component.html',
  styleUrls: ['./timeline.component.css'],
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [TimelineEditor, TimelineMenu],
})
export class TimelineComponent {}
