/** Dock/menu-bar work-area changes do not change our full-display coordinates. */
export function affectsPointerCoordinates(changedMetrics: readonly string[]): boolean {
  return changedMetrics.some((metric) => ['bounds', 'scaleFactor', 'rotation'].includes(metric))
}
