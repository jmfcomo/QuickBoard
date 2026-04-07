import { computed, Signal } from '@angular/core';
import { AppStore } from '../../../data/store/app.store';
import { formatTime } from './format-time';

export function createTimelineData(
  store: InstanceType<typeof AppStore>,
  scale: Signal<number>,
  containerWidth: Signal<number>,
) {
  const timelineBoards = computed(() => {
    let currentTime = 0;
    return store.boards().map((board) => {
      const duration = board.duration ?? 3;
      const startTime = currentTime;
      currentTime += duration;

      const s = scale();

      return {
        ...board,
        startTime,
        duration,
        leftPx: startTime * s,
        widthPx: duration * s,
      };
    });
  });

  const totalWidth = computed(() => {
    const lastBoard = timelineBoards().slice(-1)[0];
    const endSecond = lastBoard ? lastBoard.startTime + lastBoard.duration : 0;
    const s = scale();
    return Math.max((endSecond + 5) * s, containerWidth());
  });

  const addButtonLeftPx = computed(() => {
    const boards = timelineBoards();
    if (boards.length === 0) return 8;
    const lastBoard = boards[boards.length - 1];
    return lastBoard.leftPx + lastBoard.widthPx + 8;
  });

  const rulerTicks = computed(() => {
    const ticks: { time: number; left: number; label: string }[] = [];
    const width = totalWidth();
    const s = scale();
    // Smaller zoom scales use larger time steps and therefore sparser ticks;
    // larger scales use smaller time steps and therefore denser ticks.
    const stepSeconds = getRulerStepSeconds(s);
    const stepPx = stepSeconds * s;
    const count = Math.ceil(width / stepPx);
    const showHundredths = stepSeconds < 1;

    for (let i = 0; i < count; i++) {
      ticks.push({
        time: i * stepSeconds,
        left: i * stepPx,
        label: formatTime(i * stepSeconds, showHundredths),
      });
    }
    return ticks;
  });

  return {
    timelineBoards,
    totalWidth,
    addButtonLeftPx,
    rulerTicks,
    formatTime,
  } as const;
}

function getRulerStepSeconds(scale: number): number {
  if (scale <= 15) return 30;
  if (scale <= 30) return 15;
  if (scale <= 60) return 10;
  if (scale <= 120) return 5;
  if (scale <= 240) return 2;
  if (scale <= 400) return 0.5;
  return 0.25;
}
