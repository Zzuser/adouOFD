export type PageRotation = 0 | 90 | 180 | 270

export type RotationMap = Record<number, PageRotation>

export function normalizeRotation(value: number): PageRotation {
  const normalized = ((Math.round(value / 90) * 90) % 360 + 360) % 360
  return normalized as PageRotation
}

export function isPageRotation(value: number): value is PageRotation {
  return value === 0 || value === 90 || value === 180 || value === 270
}

export function rotationOf(map: RotationMap | undefined, page: number): PageRotation {
  const value = map?.[page] ?? 0
  return isPageRotation(value) ? value : 0
}

export function rotateBy(current: PageRotation, delta: number): PageRotation {
  return normalizeRotation(current + delta)
}

export function isQuarterTurn(rotation: PageRotation): boolean {
  return rotation === 90 || rotation === 270
}

export function displaySize(
  width: number,
  height: number,
  rotation: PageRotation
): { width: number; height: number } {
  return isQuarterTurn(rotation) ? { width: height, height: width } : { width, height }
}

export function displayYForRotation(
  rotation: PageRotation,
  x: number,
  y: number
): number {
  switch (rotation) {
    case 90:
      return x
    case 180:
      return 1 - y
    case 270:
      return 1 - x
    default:
      return y
  }
}
