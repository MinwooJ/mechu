export function formatDistance(distanceMeters: number, locale: string): string {
  const nf = new Intl.NumberFormat(locale);
  if (distanceMeters >= 1000) {
    const value = (distanceMeters / 1000).toFixed(distanceMeters % 1000 === 0 ? 0 : 1);
    return locale === "en" ? `${value} km` : `${value}km`;
  }
  return locale === "en" ? `${nf.format(distanceMeters)} m` : `${nf.format(distanceMeters)}m`;
}

export function formatRadius(radiusMeters: number, locale: string): string {
  const nf = new Intl.NumberFormat(locale);
  if (radiusMeters >= 1000) {
    const value = (radiusMeters / 1000).toFixed(radiusMeters % 1000 === 0 ? 0 : 1);
    return locale === "en" ? `${value} km` : `${value}km`;
  }
  return locale === "en" ? `${nf.format(radiusMeters)} m` : `${nf.format(radiusMeters)}m`;
}
