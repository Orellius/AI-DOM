/** Returns a CSS calc() expression that scales px by --ui-scale */
export function scaled(px: number): string {
  return `calc(var(--ui-scale) * ${px}px)`
}
