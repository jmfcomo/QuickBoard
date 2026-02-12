export function formatTime(seconds: number, hundredths = false): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  if (!hundredths) {
    return `${m}:${s.toString().padStart(2, '0')}`;
  }

  const h = Math.floor((seconds % 1) * 100);
  return `${m}:${s.toString().padStart(2, '0')}.${h.toString().padStart(2, '0')}`;
}
