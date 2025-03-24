export const cubicBezier = (t) => {
  const p0 = 0;
  const p1 = 0.001;
  const p2 = 0.999;
  const p3 = 1;

  return (
    (1 - t) ** 3 * p0
    + 3 * (1 - t) ** 2 * t * p1
    + 3 * (1 - t) * t ** 2 * p2
    + t ** 3 * p3
  );
};
