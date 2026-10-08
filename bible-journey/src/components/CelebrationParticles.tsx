import { useEffect, useRef, type RefObject } from 'react';
import { alive, ember, fade, leaf, spark, step, type Particle } from '../lib/particles';
import { mulberry32 } from '../lib/rng';

/**
 * Embers for a streak and gold leaf for a book, drawn on one canvas.
 *
 * **A canvas and not a hundred elements**, because a hundred absolutely placed
 * spans each animating their own transform is a hundred layers for a phone to
 * composite, and the fire is the part nobody should notice costing anything.
 * One canvas is one layer whatever is on it.
 *
 * It is never rendered under reduced motion: the parent leaves it out rather
 * than this checking, so a calm celebration has no animation frame running at
 * all rather than one that draws nothing.
 *
 * Positions come from the live element, measured every frame, so the embers
 * leave the flame wherever layout put it, on a phone, a laptop, or a rotation
 * half way through. The same reasoning as the tour's spotlight.
 */
type Props = {
  mode: 'embers' | 'leaf';
  /** What the embers rise from and the landing sparks burst out of. */
  origin: RefObject<HTMLElement | null>;
  /** When embers start rising, or leaf starts falling, in ms from mount. */
  from: number;
  /** When the sparks burst. The count landing. */
  burstAt: number;
  /** When it stops making anything new. What is already falling finishes. */
  until: number;
  /** How much leaf falls. The plan gets more than a book. */
  leaves?: number;
};

/** Embers a second, which with their lifetimes keeps about forty in the air. */
const EMBER_RATE = 24;
const BURST = 44;
const LEAVES = 54;
/** Never more than this much time in one step, or a tab coming back from the background throws everything off the screen at once. */
const MAX_DT = 0.05;

/*
 * Three glows, prerendered once. Drawing a radial gradient per ember per frame
 * is the slow way; stamping a small bitmap is the fast one, and additive
 * blending makes overlapping embers brighten the way real ones do.
 */
type Sprites = { gold: HTMLCanvasElement; orange: HTMLCanvasElement; red: HTMLCanvasElement };

function sprite(r: number, g: number, b: number): HTMLCanvasElement {
  const s = document.createElement('canvas');
  s.width = s.height = 32;
  const x = s.getContext('2d');
  if (!x) return s;
  const grad = x.createRadialGradient(16, 16, 0, 16, 16, 16);
  grad.addColorStop(0, `rgba(255, 250, 235, 1)`);
  grad.addColorStop(0.18, `rgba(${r}, ${g}, ${b}, 0.95)`);
  grad.addColorStop(0.5, `rgba(${r}, ${g}, ${b}, 0.28)`);
  grad.addColorStop(1, `rgba(${r}, ${g}, ${b}, 0)`);
  x.fillStyle = grad;
  x.fillRect(0, 0, 32, 32);
  return s;
}

/** Where on the element the fire is: the middle, a little below centre. */
function anchor(el: HTMLElement | null, mode: Props['mode']) {
  if (!el) return null;
  const r = el.getBoundingClientRect();
  if (r.width === 0 && r.height === 0) return null;
  return {
    x: r.left + r.width / 2,
    y: mode === 'embers' ? r.top + r.height * 0.6 : r.top + r.height / 2,
    spread: r.width * 0.18,
  };
}

export function CelebrationParticles({ mode, origin, from, burstAt, until, leaves = LEAVES }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const g = canvas?.getContext('2d');
    if (!canvas || !g) return;

    // Seeded per mode, so the same moment throws the same fire every time.
    const rng = mulberry32(mode === 'embers' ? 7 : 40);
    const sprites: Sprites = {
      gold: sprite(255, 205, 80),
      orange: sprite(255, 136, 36),
      red: sprite(220, 58, 40),
    };
    const parts: Particle[] = [];
    let width = 0;
    let height = 0;

    const resize = () => {
      // Capped at two: a third pixel per pixel is invisible on an ember and
      // costs half as much again to fill.
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      width = window.innerWidth;
      height = window.innerHeight;
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
      g.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();
    window.addEventListener('resize', resize);

    const start = performance.now();
    let last = start;
    let owed = 0;
    let fell = false;
    let burst = false;
    let frame = 0;

    const draw = (p: Particle) => {
      const a = fade(p);
      if (a <= 0) return;
      if (p.kind === 'leaf') {
        // The flip is a squash across one axis; the face catches the light
        // and the back does not, which is what makes it read as metal.
        const face = Math.cos(p.spin);
        g.globalCompositeOperation = 'source-over';
        g.globalAlpha = a * 0.92;
        const lit = face > 0 ? 0.55 + 0.45 * face : 0.25;
        const r = Math.round(150 + 105 * lit);
        const gg = Math.round(105 + 110 * lit * (0.8 + 0.2 * p.tone));
        const b = Math.round(10 + 70 * lit * lit);
        g.fillStyle = `rgb(${r}, ${gg}, ${b})`;
        g.save();
        g.translate(p.x, p.y);
        g.rotate(p.phase + p.age * 0.7);
        g.scale(Math.max(0.08, Math.abs(face)), 1);
        g.fillRect(-p.size / 2, -p.size * 0.36, p.size, p.size * 0.72);
        g.restore();
        return;
      }

      g.globalCompositeOperation = 'lighter';
      const life = p.age / p.life;
      // An ember cools as it climbs: gold, then orange, then a red that fades.
      const tint =
        p.kind === 'spark' || life < 0.32 ? sprites.gold : life < 0.66 ? sprites.orange : sprites.red;
      if (p.kind === 'spark') {
        g.globalAlpha = a * 0.85;
        g.strokeStyle = `rgba(255, 214, 110, ${a})`;
        g.lineWidth = p.size * 0.7;
        g.lineCap = 'round';
        g.beginPath();
        g.moveTo(p.x - p.vx * 0.035, p.y - p.vy * 0.035);
        g.lineTo(p.x, p.y);
        g.stroke();
      }
      g.globalAlpha = a;
      const s = p.size * (p.kind === 'spark' ? 5 : 6.5);
      g.drawImage(tint, p.x - s / 2, p.y - s / 2, s, s);
    };

    const tick = (now: number) => {
      const t = now - start;
      const dt = Math.min(MAX_DT, (now - last) / 1000);
      last = now;
      const at = anchor(origin.current, mode);

      if (mode === 'embers' && at && t >= from && t < until) {
        owed += EMBER_RATE * dt;
        while (owed >= 1) {
          parts.push(ember(rng, at.x, at.y, at.spread));
          owed -= 1;
        }
      }
      if (mode === 'leaf' && !fell && t >= from) {
        fell = true;
        for (let i = 0; i < leaves; i++) parts.push(leaf(rng, width, height));
      }
      if (!burst && t >= burstAt && at) {
        burst = true;
        for (let i = 0; i < BURST; i++) parts.push(spark(rng, at.x, at.y));
      }

      g.clearRect(0, 0, width, height);
      for (let i = parts.length - 1; i >= 0; i--) {
        const p = parts[i];
        step(p, dt);
        if (!alive(p) || p.y > height + 40) {
          parts.splice(i, 1);
          continue;
        }
        draw(p);
      }
      g.globalAlpha = 1;

      // Stop once nothing is left and nothing more is coming.
      if (t < Math.max(until, burstAt, from) || parts.length > 0) {
        frame = requestAnimationFrame(tick);
      }
    };
    frame = requestAnimationFrame(tick);

    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener('resize', resize);
    };
  }, [mode, origin, from, burstAt, until, leaves]);

  return <canvas ref={canvasRef} className="celebrate__sky" aria-hidden="true" />;
}
