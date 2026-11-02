export type Edge = 'n' | 's' | 'e' | 'w' | 'ne' | 'nw' | 'se' | 'sw';
export type Bounds = { left: number; top: number; width: number; height: number };
export const MIN_WIDTH = 320, MIN_HEIGHT = 300, MAX_WIDTH = 900, MARGIN = 10;
const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(n, Math.max(lo, hi)));
// Keep the opposite edge stationary, even when the pointer crosses the minimum size.
export function resizeBounds(b: Bounds, edge: Edge, dx: number, dy: number, viewport: { width: number; height: number }): Bounds {
  const minW = Math.min(MIN_WIDTH, Math.max(1, viewport.width - 2 * MARGIN));
  const minH = Math.min(MIN_HEIGHT, Math.max(1, viewport.height - 2 * MARGIN));
  let left = b.left, top = b.top, right = b.left + b.width, bottom = b.top + b.height;
  if (edge.includes('w')) left = clamp(left + dx, Math.max(MARGIN, right - MAX_WIDTH), right - minW);
  if (edge.includes('e')) right = clamp(right + dx, left + minW, Math.min(viewport.width - MARGIN, left + MAX_WIDTH));
  if (edge.includes('n')) top = clamp(top + dy, MARGIN, bottom - minH);
  if (edge.includes('s')) bottom = clamp(bottom + dy, top + minH, viewport.height - MARGIN);
  return { left, top, width: right - left, height: bottom - top };
}
