import { computed, Signal } from '@angular/core';
import { AppStore } from '../../../data/store/app.store';
import { formatTime } from './format-time';

export function createTimelineData(store: InstanceType<typeof AppStore>, scale: Signal<number>) {
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
    return Math.max((endSecond + 5) * s, 800);
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
    const stepSeconds = 5;
    const s = scale();
    const stepPx = stepSeconds * s;
    const count = Math.ceil(width / stepPx);

    for (let i = 0; i < count; i++) {
      ticks.push({
        time: i * stepSeconds,
        left: i * stepPx,
        label: formatTime(i * stepSeconds),
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
