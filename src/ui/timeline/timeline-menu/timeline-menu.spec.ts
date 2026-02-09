import { ComponentFixture, TestBed } from '@angular/core/testing';

import { TimelineMenu } from './timeline-menu';

describe('TimelineMenu', () => {
  let component: TimelineMenu;
  let fixture: ComponentFixture<TimelineMenu>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [TimelineMenu]
    })
    .compileComponents();

    fixture = TestBed.createComponent(TimelineMenu);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
