export function distance(
  a: { latitude: number; longitude: number },
  b: { latitude: number; longitude: number },
) {
  const rad = (n: number) => (n * Math.PI) / 180;
  const p = rad(b.latitude - a.latitude),
    l = rad(b.longitude - a.longitude);
  return (
    6371000 *
    2 *
    Math.asin(
      Math.sqrt(
        Math.min(
          1,
          Math.sin(p / 2) ** 2 +
            Math.cos(rad(a.latitude)) *
              Math.cos(rad(b.latitude)) *
              Math.sin(l / 2) ** 2,
        ),
      ),
    )
  );
}
