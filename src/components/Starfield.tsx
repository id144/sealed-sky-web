import { useMemo } from "react";

/**
 * SVG starfield with true motion-blur trails.
 *
 * Each star is a fixed point on a circle around the rotation centre. As the
 * whole SVG rotates around that centre, each star traces an arc — so we draw
 * each star's trail as a small arc of that exact circle, with a stroke that
 * fades from transparent (tail) to bright (head). Add a head dot on top and
 * the result is a continuous, smooth comet-tail behind every star, the
 * length and curvature of which scales naturally with the star's distance
 * from the rotation centre — same geometry as a long-exposure photograph.
 *
 * One SVG element rotates as a whole; everything inside is composed once
 * and GPU-rotated, so the cost per frame is negligible.
 *
 * Stars are generated deterministically from a seeded LCG so the pattern is
 * stable across hot reloads / refreshes but still looks irregular.
 */

const VB = 1000; // viewBox edge — abstract square coordinate system
const CX = VB / 2;
const CY = VB / 2;

const STAR_COUNT = 2480;
const SEED = 0xc0ffee;

const TRAIL_DEG = 7; // arc swept by each star's trail behind itself
const TRAIL_RAD = (TRAIL_DEG * Math.PI) / 180;

// Stars closer to the rotation centre than this radius are drawn as plain
// dots — at tiny radii the arc would be sub-pixel and a stroke just smears.
const MIN_TRAIL_RADIUS = 22;

interface Star {
  px: number;
  py: number;
  r: number;
  angle: number;
  size: number;
  opacity: number;
  color: string;
  tailX: number;
  tailY: number;
}

function lcg(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 0x100000000;
  };
}

function generateStars(count: number, seed: number): Star[] {
  const rand = lcg(seed);
  const out: Star[] = [];
  for (let i = 0; i < count; i++) {
    const px = rand() * VB;
    const py = rand() * VB;
    const dx = px - CX;
    const dy = py - CY;
    const r = Math.hypot(dx, dy);
    const angle = Math.atan2(dy, dx);
    const tailAngle = angle - TRAIL_RAD;
    const tailX = CX + r * Math.cos(tailAngle);
    const tailY = CY + r * Math.sin(tailAngle);
    // 20% of the previous 0.9–2.6 range — pinprick-sized heads.
    const size = 0.03 + rand() * 0.24; // 0.18 – 0.52
    // Push opacity high so the tiny heads still pop on the dark sky.
    const opacity = 0.45 + rand() * 0.15; // 0.85 – 1.00
    const u = rand();
    // ~5% gold-tinted, ~7% faint violet, rest white — for tonal variety
    const color = u < 0.05 ? "#fdd400" : u < 0.12 ? "#c9b8e0" : "#ffffff";
    out.push({ px, py, r, angle, size, opacity, color, tailX, tailY });
  }
  return out;
}

export function Starfield() {
  const stars = useMemo(() => generateStars(STAR_COUNT, SEED), []);
  return (
    <div className="starfield" aria-hidden="true">
      <svg
        className="starfield-svg"
        viewBox={`0 0 ${VB} ${VB}`}
        preserveAspectRatio="xMidYMid slice"
        xmlns="http://www.w3.org/2000/svg"
      >
        <defs>
          {stars.map((s, i) =>
            s.r < MIN_TRAIL_RADIUS ? null : (
              <linearGradient
                key={i}
                id={`tg-${i}`}
                gradientUnits="userSpaceOnUse"
                x1={s.tailX}
                y1={s.tailY}
                x2={s.px}
                y2={s.py}
              >
                <stop offset="0" stopColor={s.color} stopOpacity="0" />
                <stop offset="1" stopColor={s.color} stopOpacity={s.opacity * 0.25} />
              </linearGradient>
            ),
          )}
        </defs>
        <g>
          {stars.map((s, i) => {
            if (s.r < MIN_TRAIL_RADIUS) {
              return (
                <circle
                  key={i}
                  cx={s.px}
                  cy={s.py}
                  r={s.size}
                  fill={s.color}
                  fillOpacity={s.opacity}
                />
              );
            }
            const d = `M ${s.tailX.toFixed(2)} ${s.tailY.toFixed(2)} A ${s.r.toFixed(2)} ${s.r.toFixed(2)} 0 0 1 ${s.px.toFixed(2)} ${s.py.toFixed(2)}`;
            return (
              <g key={i}>
                <path
                  d={d}
                  stroke={`url(#tg-${i})`}
                  /* Thin hair-line trail, with a small floor so it stays
                     visible at sub-pixel sizes. Brighter stars get marginally
                     thicker trails — same point-spread relationship a real
                     long exposure would have. */
                  strokeWidth={Math.max(0.1, s.size * 0.6)}
                  strokeLinecap="round"
                  fill="none"
                />
                <circle
                  cx={s.px}
                  cy={s.py}
                  r={s.size}
                  fill={s.color}
                  fillOpacity={s.opacity}
                />
              </g>
            );
          })}
        </g>
      </svg>
    </div>
  );
}
