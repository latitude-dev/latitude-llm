export const VERTEX_SHADER = `
attribute vec2 a_position;
void main() {
  gl_Position = vec4(a_position, 0.0, 1.0);
}
`

// Palette from the Latitude design system's marketing gradients: the logo trio over a
// near-black anchor, blue dominant, red/yellow only as beam accents. The LIGHT_* set is
// the lighter counterpart used when the app is in light mode (u_light = 1).
// Border treatment adapted from @paper-design/shaders "pulsing-border" (Apache-2.0).
const FRAGMENT_PRELUDE = `
precision mediump float;

uniform vec2 u_resolution;
uniform float u_time;
uniform float u_coverage;
uniform float u_intensity;
uniform float u_focus;
uniform float u_light;
uniform float u_radius;
uniform float u_bleed;

const float PI = 3.14159265359;
const float TWO_PI = 6.28318530718;
const float HALF_PI = 1.57079632679;

const vec3 BRAND_BLUE = vec3(0.0, 0.502, 1.0);
const vec3 BRAND_RED = vec3(0.898, 0.224, 0.282);
const vec3 BRAND_YELLOW = vec3(0.996, 0.878, 0.102);
const vec3 LIGHT_BLUE = vec3(0.25, 0.60, 1.0);
const vec3 LIGHT_RED = vec3(0.95, 0.50, 0.56);
const vec3 LIGHT_YELLOW = vec3(1.0, 0.84, 0.35);
const vec3 LIGHT_ANCHOR = vec3(0.975, 0.985, 1.0);

const float THICKNESS_IDLE = 1.0;
const float THICKNESS_FOCUS = 2.0;
const float SPOT_SIZE_IDLE = 0.2;
const float SPOT_SIZE_FOCUS = 0.5;
const float SPOT_INTENSITY = 0.75;
const float PULSE = 0.25;
const float SMOKE_FOCUS = 0.3;
const float SMOKE_SCALE_IDLE = 120.0;
const float SMOKE_SCALE_FOCUS = 60.0;
const float BLOOM = 0.33;
const float BASE_RING_ALPHA = 0.5;
const float POOL_HEIGHT = 0.45;
`

const HELPERS = `
float sdRoundedRect(vec2 p, vec2 halfSize, float r) {
  vec2 q = abs(p) - halfSize + r;
  return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - r;
}

float hash21(vec2 p) {
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}

float valueNoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  float a = hash21(i);
  float b = hash21(i + vec2(1.0, 0.0));
  float c = hash21(i + vec2(0.0, 1.0));
  float d = hash21(i + vec2(1.0, 1.0));
  return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
}

float linstep(float a, float b, float t) {
  return clamp((t - a) / (b - a), 0.0, 1.0);
}

// Exact radial stops of the design system's marketing gradient preset A (gradients/A.json).
vec3 rampDark(float t) {
  vec3 c = vec3(0.0);
  c = mix(c, vec3(0.0, 0.020, 0.039), linstep(0.30288, 0.33954, t));
  c = mix(c, vec3(0.0, 0.039, 0.082), linstep(0.33954, 0.3762, t));
  c = mix(c, vec3(0.0, 0.082, 0.165), linstep(0.3762, 0.44952, t));
  c = mix(c, vec3(0.0, 0.122, 0.247), linstep(0.44952, 0.52284, t));
  c = mix(c, vec3(0.0, 0.165, 0.325), linstep(0.52284, 0.59615, t));
  c = mix(c, vec3(0.0, 0.251, 0.502), linstep(0.59615, 0.73317, t));
  c = mix(c, vec3(0.0, 0.337, 0.675), linstep(0.73317, 0.87019, t));
  c = mix(c, vec3(0.0, 0.420, 0.839), linstep(0.87019, 0.9351, t));
  c = mix(c, BRAND_BLUE, linstep(0.9351, 1.0, t));
  return c;
}

// Same offsets re-anchored on white: each stop keeps its fraction of the dark ramp's
// progress toward full blue.
vec3 rampLight(float t) {
  vec3 c = LIGHT_ANCHOR;
  c = mix(c, vec3(0.937, 0.966, 1.0), linstep(0.30288, 0.33954, t));
  c = mix(c, vec3(0.899, 0.947, 1.0), linstep(0.33954, 0.3762, t));
  c = mix(c, vec3(0.815, 0.906, 1.0), linstep(0.3762, 0.44952, t));
  c = mix(c, vec3(0.739, 0.868, 1.0), linstep(0.44952, 0.52284, t));
  c = mix(c, vec3(0.655, 0.827, 1.0), linstep(0.52284, 0.59615, t));
  c = mix(c, vec3(0.488, 0.744, 1.0), linstep(0.59615, 0.73317, t));
  c = mix(c, vec3(0.320, 0.660, 1.0), linstep(0.73317, 0.87019, t));
  c = mix(c, vec3(0.160, 0.581, 1.0), linstep(0.87019, 0.9351, t));
  c = mix(c, BRAND_BLUE, linstep(0.9351, 1.0, t));
  return c;
}

vec3 poolColor(int index) {
  int m = index - (index / 5) * 5;
  if (m == 1) return mix(BRAND_RED, LIGHT_RED, u_light);
  if (m == 2) return mix(mix(BRAND_BLUE, vec3(1.0), 0.55), mix(LIGHT_BLUE, vec3(1.0), 0.6), u_light);
  if (m == 4) return mix(BRAND_YELLOW, LIGHT_YELLOW, u_light);
  return mix(BRAND_BLUE, LIGHT_BLUE, u_light);
}

// Loading fill after marketing gradient preset E: a quiet slice of the preset ramp with
// soft pools of light along the bottom edge, rising and falling like a slowed-down voice
// meter. Pool centers roam the full width at incommensurate speeds and all pools pour
// into one weighted-average field, so the union reads as a single shifting mass.
// Everything is in box fractions so the composition survives any textarea aspect ratio.
vec3 pools(vec2 p, vec2 halfSize) {
  vec2 box = 2.0 * halfSize;
  float yDown = (halfSize.y - p.y) / box.y;
  float tBase = mix(0.15, 0.62, yDown);
  vec3 dark = rampDark(tBase);
  vec3 light = rampLight(tBase);

  float yUp = p.y + halfSize.y;
  float px = p.x + 0.07 * box.x * sin(2.4 * yUp / box.y + 0.35 * u_time + 1.3 * p.x / box.x);

  vec3 rgbSum = vec3(0.0);
  float weightSum = 0.0;
  for (int i = 0; i < 5; i++) {
    float fi = float(i);
    float path = 0.5 + 0.3 * sin(u_time * (0.14 + 0.03 * fi) + fi * 2.4)
      + 0.14 * sin(u_time * (0.06 + 0.02 * fi) + fi * 5.1);
    float cx = (path - 0.5) * box.x;
    float voice = 0.5 + 0.3 * sin(u_time * (0.55 + 0.17 * fi) + fi * 1.9)
      + 0.2 * sin(u_time * (0.83 + 0.11 * fi) + fi * 4.1);
    float sigmaX = (0.16 + 0.04 * sin(fi * 5.7)) * box.x;
    float dx = (px - cx) / sigmaX;
    float reach = max(POOL_HEIGHT * box.y * voice, 1.0);
    float dy = yUp / reach;
    float w = voice * exp(-0.5 * dx * dx - 2.3 * dy * dy);
    rgbSum += poolColor(i) * w;
    weightSum += w;
  }

  // Weighted-average hue with saturating energy: overlaps blend color instead of
  // stacking toward white, and the union has one smooth intensity field.
  vec3 blend = rgbSum / max(weightSum, 0.001);
  float energy = 1.0 - exp(-1.4 * weightSum);
  dark = min(dark + blend * energy, vec3(1.0));
  light = mix(light, blend, 0.85 * energy);
  return mix(dark, light, u_light);
}

// Position along the rounded-rect contour as a 0..1 arc-length fraction (CCW from the
// right-edge midpoint). Callers pass the corner radius of the offset contour through the
// fragment (base radius + distance), so spot width and speed stay constant at corners —
// projecting onto the base boundary instead fans the pattern out radially there.
float perimeterCoord(vec2 p, vec2 inner, float r) {
  float lh = 2.0 * inner.x;
  float lv = 2.0 * inner.y;
  float lc = HALF_PI * r;
  float total = 2.0 * lh + 2.0 * lv + 4.0 * lc;

  vec2 e = abs(p) - inner;
  float s;
  if (e.x > 0.0 && e.y > 0.0) {
    vec2 rel = p - sign(p) * inner;
    float ang = atan(rel.y, rel.x);
    if (p.x > 0.0 && p.y > 0.0) s = 0.5 * lv + (ang / HALF_PI) * lc;
    else if (p.x < 0.0 && p.y > 0.0) s = 0.5 * lv + lc + lh + ((ang - HALF_PI) / HALF_PI) * lc;
    else if (p.x < 0.0 && p.y < 0.0) s = 0.5 * lv + 2.0 * lc + lh + lv + ((ang + PI) / HALF_PI) * lc;
    else s = 0.5 * lv + 3.0 * lc + 2.0 * lh + lv + ((ang + HALF_PI) / HALF_PI) * lc;
  } else if (e.x > e.y) {
    float y = clamp(p.y, -inner.y, inner.y);
    if (p.x > 0.0) s = y >= 0.0 ? y : 0.5 * lv + 4.0 * lc + 2.0 * lh + lv + (y + inner.y);
    else s = 0.5 * lv + 2.0 * lc + lh + (inner.y - y);
  } else {
    float x = clamp(p.x, -inner.x, inner.x);
    if (p.y > 0.0) s = 0.5 * lv + lc + (inner.x - x);
    else s = 0.5 * lv + 3.0 * lc + lh + lv + (x + inner.x);
  }
  return fract(s / total);
}

float beat(float time) {
  float first = pow(abs(sin(time * TWO_PI)), 10.0);
  float second = pow(abs(sin((time - 0.15) * TWO_PI)), 10.0);
  return clamp(first + 0.6 * second, 0.0, 1.0);
}

// The border shows the fill's perceived palette: slot 1 pre-bakes the lavender that the
// fill gets from pooling red light over the deep blue base.
vec3 brandColor(int index) {
  int m = index - (index / 5) * 5;
  if (m == 1) return mix(vec3(0.62, 0.35, 0.66), vec3(0.80, 0.62, 0.88), u_light);
  return poolColor(index);
}

vec4 pulsingBorder(vec2 p, vec2 halfSize, float d, float px1) {
  float t = 1.2 * (u_time + 109.0);
  float pulse = beat(0.18 * u_time);
  // Entering loading, the border shrinks back into its hairline while it fades.
  float shrink = 1.0 - u_coverage;
  float thickness = mix(THICKNESS_IDLE, THICKNESS_FOCUS, u_focus) * px1 * shrink;
  float reach = thickness * 2.5 + 1.5 * px1;
  float band = pow(1.0 - smoothstep(0.0, reach, abs(d)), 1.75);
  float smokeBand = 1.0 - smoothstep(0.0, reach + 6.0 * px1, abs(d));
  // Nearly every interior pixel resolves to zero: skip the noise and spot loops there.
  if (band + smokeBand < 0.004) return vec4(0.0);

  vec2 smokeUV = p / (mix(SMOKE_SCALE_IDLE, SMOKE_SCALE_FOCUS, u_focus) * px1);
  float smoke = clamp(3.0 * valueNoise(2.7 * smokeUV + 0.5 * t), 0.0, 1.0) - valueNoise(3.4 * smokeUV - 0.5 * t);
  smoke = clamp(30.0 * smoke * smoke, 0.0, 1.0) * smokeBand * smokeBand;
  float smokeAmount = SMOKE_FOCUS * u_focus;
  smoke *= 0.5 * smokeAmount * smokeAmount;
  smoke *= mix(1.0, pulse, PULSE);
  band = clamp(band + smoke, 0.0, 1.0);

  vec2 inner = max(halfSize - vec2(u_radius), vec2(0.001));
  float angle = perimeterCoord(p, inner, max(u_radius + d, 0.5));
  float spotSizeBase = (0.05 + 0.6 * pow(mix(SPOT_SIZE_IDLE, SPOT_SIZE_FOCUS, u_focus), 2.0)) * shrink;

  vec3 rgbSum = vec3(0.0);
  float weightSum = 0.0;
  for (int colorIdx = 0; colorIdx < 5; colorIdx++) {
    float ci = float(colorIdx);
    vec3 col = brandColor(colorIdx);
    for (int spotIdx = 0; spotIdx < 3; spotIdx++) {
      float si = float(spotIdx);
      float rnd = hash21(vec2(si * 10.0 + 2.0, 40.0 + ci));
      float rndDir = hash21(vec2(ci * 7.0 + 1.0, si * 3.0 + 9.0));
      float speed = 0.1 + 0.15 * abs(sin((si + 1.0) * (2.0 + ci)) * cos((si + 1.0) * (2.0 + 2.5 * ci)));
      float spotTime = mix(1.0, -1.0, step(0.5, rndDir)) * speed * t + rnd * 3.0;
      float mask = 0.5 + 0.5 * mix(
        sin(t + si * (5.0 - 1.5 * ci)),
        cos(t + si * (3.0 + 1.3 * ci)),
        step(mod(ci, 2.0), 0.5)
      );
      mask = mix(mask, pulse, clamp(2.0 * PULSE - rnd, 0.0, 1.0));
      float atg = fract(angle + spotTime);
      float size = spotSizeBase + 0.05 * rnd;
      float sector = smoothstep(0.5 - size, 0.5, atg) * (1.0 - smoothstep(0.5, 0.5 + size, atg));
      float weight = sector * mask * band * SPOT_INTENSITY;
      rgbSum += col * weight;
      weightSum += weight;
    }
  }

  // Weighted-average color so overlapping spots blend hues instead of adding up to white.
  vec3 spotColor = rgbSum / max(weightSum, 0.001);
  spotColor = min(spotColor * (1.0 + BLOOM * clamp(weightSum - 1.0, 0.0, 1.0)), vec3(1.0));
  float spotAlpha = 1.0 - exp(-1.3 * weightSum);

  // Constant hairline under the spots — the component's actual border.
  float ring = 1.0 - smoothstep(0.5 * px1, 1.8 * px1, abs(d));
  vec3 ringColor = mix(vec3(0.149), vec3(0.848), u_light);
  float ringAlpha = ring * BASE_RING_ALPHA;

  float outAlpha = spotAlpha + ringAlpha * (1.0 - spotAlpha);
  vec3 outRgb = spotColor * spotAlpha + ringColor * ringAlpha * (1.0 - spotAlpha);
  return vec4(outRgb, outAlpha);
}
`

const MAIN = `
void main() {
  float px1 = u_bleed / 8.0;
  vec2 p = gl_FragCoord.xy - 0.5 * u_resolution;
  vec2 halfSize = 0.5 * u_resolution - vec2(u_bleed);
  float d = sdRoundedRect(p, halfSize, u_radius);

  // Loading floods in as a tide rising from the bottom border while the whole fill also
  // fades in; the waterline undulates only mid-transition.
  float yUp01 = (p.y + halfSize.y) / (2.0 * halfSize.y);
  float wave = sin(p.x * 9.42 / (2.0 * halfSize.x) + 0.8 * u_time)
    + 0.5 * sin(p.x * 21.7 / (2.0 * halfSize.x) - 1.3 * u_time);
  float level = 1.2 * u_coverage - 0.02 + 0.16 * wave * u_coverage * (1.0 - u_coverage);
  float front = smoothstep(0.0, 0.12, level - yUp01);

  vec4 border = pulsingBorder(p, halfSize, d, px1);
  float borderFade = (1.0 - u_coverage) * u_intensity;

  float inside = 1.0 - smoothstep(-1.5 * px1, 1.5 * px1, d);
  float fillMask = inside * front * u_coverage;

  // The fill only paints where the composition departs from its anchor color, so the
  // page surface stays the component background and loading reads as added light.
  float fillAlpha = 0.0;
  vec3 fillColor = vec3(0.0);
  if (fillMask > 0.001) {
    float grain = hash21(floor(gl_FragCoord.xy / px1)) - 0.5;
    fillColor = clamp(pools(p, halfSize) + grain * mix(0.06, 0.03, u_light), 0.0, 1.0);
    vec3 anchor = mix(vec3(0.0), LIGHT_ANCHOR, u_light);
    vec3 departure = abs(fillColor - anchor);
    float presence = smoothstep(0.0, 0.3, max(departure.r, max(departure.g, departure.b)));
    fillAlpha = fillMask * presence * 0.96;
  }

  float alpha = clamp(border.a * borderFade + fillAlpha, 0.0, 1.0);
  vec3 colorPremultiplied = min(border.rgb * borderFade + fillColor * fillAlpha, vec3(1.0));
  gl_FragColor = vec4(colorPremultiplied, alpha);
}
`

export const FRAGMENT_SHADER = FRAGMENT_PRELUDE + HELPERS + MAIN
