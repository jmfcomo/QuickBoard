export interface BoilSegment {
  /** Perturbed canvas snapshot to render for this slice of time (null = blank board). */
  snapshot: Record<string, unknown> | null;
  /** How long this slice is held, in seconds. */
  durationSeconds: number;
}

export interface BoilParams {
  /** Number of distinct redraw variations to cycle through. */
  variations: number;
  /** How many project frames each variation is held ("on twos" = 2). */
  holdFrames: number;
  /** Maximum jitter amplitude, in canvas pixels. */
  amount: number;
}
