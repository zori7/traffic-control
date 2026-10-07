/** Deepened pastel palette for class breakdowns — legible on light and dark. */
export const CLASS_COLORS = [
  '#5cc4a8',
  '#7aa9d8',
  '#e2a583',
  '#b59bd8',
  '#e39cb0',
  '#93c2a3',
] as const

export function classColor(index: number): string {
  return CLASS_COLORS[index % CLASS_COLORS.length]
}