/**
 * Colour maps, stretches, and robust autoscaling.
 *
 * Mirrors src/framesig/display.py so the two viewers show the same frame the
 * same way. Definitions live as a handful of control points rather than 256
 * baked triples, so the two copies stay comparable by eye.
 *
 * Autoscaling a diffraction frame is not autoscaling a photograph. Almost every
 * pixel is background -- a narrow, low-count population -- and the information
 * is in a tiny tail of Bragg peaks up to four orders of magnitude brighter.
 * Scaling to [min, max] gives a black frame with a few white dots; scaling to
 * mean +/- sd of the whole image is dragged around by that same tail. So the
 * window comes from a robust background estimate: median and MAD, which the
 * bright tail cannot move.
 */

export const COLORMAPS = {
  // Detector convention: dark background, bright spots.
  grey: [[0, [0, 0, 0]], [1, [255, 255, 255]]],
  // The look of a diffraction photograph: dark spots on a light ground, as
  // they appear on developed film.
  film: [[0, [255, 255, 255]], [1, [0, 0, 0]]],
  // Black-body ramp: brightness rises monotonically while hue adds resolution.
  hot: [
    [0.0, [0, 0, 0]],
    [0.35, [178, 24, 0]],
    [0.66, [255, 130, 0]],
    [0.88, [255, 225, 60]],
    [1.0, [255, 255, 255]],
  ],
  // Perceptually uniform and colour-blind safe; the right choice for figures.
  viridis: [
    [0.0, [68, 1, 84]],
    [0.25, [59, 82, 139]],
    [0.5, [33, 145, 140]],
    [0.75, [94, 201, 98]],
    [1.0, [253, 231, 37]],
  ],
  ice: [
    [0.0, [0, 0, 0]],
    [0.4, [0, 60, 130]],
    [0.72, [0, 160, 210]],
    [1.0, [255, 255, 255]],
  ],
};

export const DEFAULT_COLORMAP = "grey";
export const STRETCHES = ["log", "sqrt", "linear"];
// Linear, and deliberately so. A log stretch is the standard answer to a huge
// dynamic range, but the *window* has already solved that here: it is set from
// the background, so the visible range is only a few tens of sigma wide. Log on
// top of that lands the background at 63% brightness -- a washed-out grey frame
// with white blobs. Linear puts it at 8%. Log stays available for when someone
// wants the beamstop halo and the strongest peak visible at once.
export const DEFAULT_STRETCH = "linear";
export const DEFAULT_SIGMA_FACTOR = 12;

/** Dead and masked pixels are negative by CBF convention; give them a colour
 *  no ramp produces, so "no data" is never read as "zero counts". */
export const MASKED_COLOUR = [40, 70, 150];

const LUT_CACHE = new Map();

export function colormapLut(name) {
  if (LUT_CACHE.has(name)) return LUT_CACHE.get(name);
  const stops = COLORMAPS[name] || COLORMAPS[DEFAULT_COLORMAP];
  const lut = new Uint8Array(256 * 3);
  for (let i = 0; i < 256; i++) {
    const t = i / 255;
    for (let j = 0; j < stops.length - 1; j++) {
      const [t0, c0] = stops[j];
      const [t1, c1] = stops[j + 1];
      if (t >= t0 && t <= t1) {
        const f = (t - t0) / ((t1 - t0) || 1);
        lut[i * 3] = Math.round(c0[0] + (c1[0] - c0[0]) * f);
        lut[i * 3 + 1] = Math.round(c0[1] + (c1[1] - c0[1]) * f);
        lut[i * 3 + 2] = Math.round(c0[2] + (c1[2] - c0[2]) * f);
        break;
      }
    }
  }
  LUT_CACHE.set(name, lut);
  return lut;
}

export function applyStretch(x, stretch) {
  const v = x < 0 ? 0 : x > 1 ? 1 : x;
  if (stretch === "linear") return v;
  if (stretch === "sqrt") return Math.sqrt(v);
  return Math.log1p(999 * v) / Math.log(1000);
}

function medianOf(sorted) {
  const n = sorted.length;
  if (!n) return 0;
  const mid = n >> 1;
  return n % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

/**
 * Display limits from a robust background estimate.
 *
 * Negative values are excluded: they are masked pixels, not measurements, and
 * including them drags the estimate below zero.
 */
export function robustWindow(values, sigmaFactor = DEFAULT_SIGMA_FACTOR) {
  const positive = [];
  for (const v of values) if (v >= 0) positive.push(v);
  if (!positive.length) return [0, 1];
  positive.sort((a, b) => a - b);
  const median = medianOf(positive);

  const deviations = new Float64Array(positive.length);
  for (let i = 0; i < positive.length; i++) deviations[i] = Math.abs(positive[i] - median);
  deviations.sort();
  // 1.4826 makes MAD match sigma for a normal distribution.
  let sigma = 1.4826 * medianOf(deviations);
  if (sigma <= 0) {
    // MAD collapses when more than half the pixels share a value, which is
    // common on frames with large flat regions. Counting statistics give a
    // usable fallback; a zero-width window would paint the frame one colour.
    sigma = median > 0 ? Math.sqrt(median) : 1;
  }
  const low = median - sigma;
  const high = median + sigmaFactor * sigma;
  return [low, high > low ? high : low + 1];
}
