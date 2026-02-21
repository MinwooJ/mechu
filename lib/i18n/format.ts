function needsUnitSpace(locale: string): boolean {
  const base = locale.toLowerCase().split("-")[0];
  return new Set(["en", "de", "fr", "es", "it", "pt"]).has(base);
}

function unitSuffix(value: string, unit: "m" | "km", locale: string): string {
  return needsUnitSpace(locale) ? `${value} ${unit}` : `${value}${unit}`;
}

export function formatDistance(distanceMeters: number, locale: string): string {
  const nf = new Intl.NumberFormat(locale);
  if (distanceMeters >= 1000) {
    const value = (distanceMeters / 1000).toFixed(distanceMeters % 1000 === 0 ? 0 : 1);
    return unitSuffix(value, "km", locale);
  }
  return unitSuffix(nf.format(distanceMeters), "m", locale);
}

export function formatRadius(radiusMeters: number, locale: string): string {
  const nf = new Intl.NumberFormat(locale);
  if (radiusMeters >= 1000) {
    const value = (radiusMeters / 1000).toFixed(radiusMeters % 1000 === 0 ? 0 : 1);
    return unitSuffix(value, "km", locale);
  }
  return unitSuffix(nf.format(radiusMeters), "m", locale);
}
