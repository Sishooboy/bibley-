/**
 * The app's five sounds, synthesised rather than shipped.
 *
 * Nothing here loads a file. Every cue is built from oscillators and one noise
 * buffer, for three reasons that all matter to this project: no audio asset
 * carries a licence into an App Store build, the bundle stays where it is when
 * 4.4 MB of Bible text is already kept out of it, and a chime that needs twenty
 * passes to feel right is a number to edit rather than a wav to re-export.
 *
 * **Web Audio and nothing else, which is what respects the iOS silent switch.**
 * An `<audio>` element is the known way to play through a silenced phone, and a
 * reading app that does that in a quiet church has broken something no setting
 * can apologise for. Synthesis honours the switch for free. Do not introduce an
 * element here. The Capacitor shell decides this natively instead, through the
 * audio session category, and will need checking when it lands.
 */

import {
  BOOK,
  MILESTONE,
  PLAN,
  STREAK,
  reelLand,
  reelStart,
  type ReelTiming,
} from './celebration';
import { mulberry32 } from './rng';

/**
 * The five moments worth a sound.
 *
 * `undo` covers clearing as well as the undo bar: taking a chapter back is the
 * same gesture from the app's point of view, and marking that made a sound while
 * unmarking made none felt like the tap had failed.
 */
export type Cue = 'chapter' | 'streak' | 'book' | 'plan' | 'undo';

/*
 * Cues, plus the variants a caller may upgrade one to.
 *
 * `chooseCue` still answers with a `Cue` and the ladder is still five rungs:
 * a milestone is not a sixth thing that can happen on a tap, it is the streak
 * rung when the number it landed on is one scripture keeps. Keeping the two
 * types apart is what stops the ladder quietly growing a rung nobody scored.
 */
export type Playable = Cue | 'milestone';

/** What one marking change did, which is all the cue choice depends on. */
export type CueSignal = {
  /** Books that went from unfinished to finished on this change. */
  booksFinished: number;
  /** True when this change completed the whole track. */
  planFinished: boolean;
  streakBefore: number;
  streakAfter: number;
  /** Chapters written by this change, re-dated ones included. */
  chaptersMarked: number;
};

/**
 * One tap, one sound.
 *
 * Finishing a book on a day that also extends a streak is three cues at once
 * otherwise, and they arrive as noise rather than as three pieces of good news.
 * The ladder keeps the largest and drops the rest.
 *
 * The streak rung is a strict increase on purpose. A second chapter on a day
 * already read leaves the streak where it was, and backdating a chapter that
 * fills no gap does too. Neither is the moment the sound is for.
 */
export function chooseCue(signal: CueSignal): Cue | null {
  if (signal.planFinished) return 'plan';
  if (signal.booksFinished > 0) return 'book';
  if (signal.streakAfter > signal.streakBefore) return 'streak';
  if (signal.chaptersMarked > 0) return 'chapter';
  return null;
}

/* -------------------------------------------------------------------------- */
/* The synth                                                                   */
/* -------------------------------------------------------------------------- */

/**
 * Everything is mixed under this, so one number moves the whole app's volume.
 *
 * Set by measuring rather than by ear: rendered offline, this puts the finished
 * book around -9 dBFS and the chapter tick around -15, which is where ordinary
 * interface sound sits. At 0.5 the tick peaked at -20 and disappeared under a
 * phone speaker in a room. The loudest cue still leaves better than 9 dB of
 * headroom, so two overlapping cues cannot clip.
 */
const MASTER = 0.9;

type Maker = typeof AudioContext;

let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let enabled = true;

/*
 * Cached against the sample rate it was generated at, not globally. An offline
 * context used for measuring can run at a different rate, and reusing a buffer
 * across the two would resample it into a different sound from the one shipped.
 */
let noise: { rate: number; buffer: AudioBuffer } | null = null;

function maker(): Maker | null {
  if (typeof window === 'undefined') return null;
  const w = window as unknown as { AudioContext?: Maker; webkitAudioContext?: Maker };
  return w.AudioContext ?? w.webkitAudioContext ?? null;
}

/**
 * The one context for the app's lifetime, created on demand.
 *
 * Returns null rather than throwing wherever Web Audio is missing, which covers
 * jsdom under the tests and any browser old enough not to have it. A silent app
 * is a fine outcome; a crashed mark is not.
 */
function context(): AudioContext | null {
  if (ctx) return ctx;
  const AC = maker();
  if (!AC) return null;
  try {
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = MASTER;
    master.connect(ctx.destination);
  } catch {
    ctx = null;
    master = null;
  }
  return ctx;
}

/** White noise, generated once and reused: it is the body of every tick. */
function noiseBuffer(c: BaseAudioContext): AudioBuffer {
  if (noise?.rate === c.sampleRate) return noise.buffer;
  const length = Math.floor(c.sampleRate * 0.12);
  const buffer = c.createBuffer(1, length, c.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < length; i++) data[i] = Math.random() * 2 - 1;
  noise = { rate: c.sampleRate, buffer };
  return buffer;
}

/**
 * Partials of the bell, as [ratio of the strike tone, share of the level, share
 * of the decay].
 *
 * A single sine is a beep. What makes a bell is the inharmonic partials above
 * the strike tone and the fact that they die away faster than it does, so the
 * sound gets warmer as it fades rather than only getting quieter. The ratios are
 * loosely a small struck bell rather than a harmonic series, which is why 2.98
 * and 4.12 are not 3 and 4.
 */
const PARTIALS: readonly (readonly [number, number, number])[] = [
  [1, 1, 1],
  [2.01, 0.4, 0.62],
  [2.98, 0.19, 0.42],
  [4.12, 0.08, 0.26],
];

function bell(
  c: BaseAudioContext,
  out: AudioNode,
  at: number,
  freq: number,
  dur: number,
  level: number,
): void {
  for (const [ratio, share, decay] of PARTIALS) {
    const osc = c.createOscillator();
    osc.type = 'sine';
    osc.frequency.value = freq * ratio;

    const gain = c.createGain();
    const life = dur * decay;
    // Ramps are exponential because loudness is, and they never reach zero:
    // exponentialRampToValueAtTime refuses a target of 0.
    gain.gain.setValueAtTime(0.0001, at);
    gain.gain.exponentialRampToValueAtTime(level * share, at + 0.006);
    gain.gain.exponentialRampToValueAtTime(0.0001, at + life);

    osc.connect(gain).connect(out);
    osc.start(at);
    osc.stop(at + life + 0.02);
  }
}

/**
 * A small wooden tap: a filtered noise burst with a pitched thud under it.
 *
 * The noise alone is a click and the sine alone is a beep. Together they read as
 * something being touched, which is what marking a chapter is.
 */
function tick(
  c: BaseAudioContext,
  out: AudioNode,
  at: number,
  freq: number,
  colour: number,
  level: number,
): void {
  const body = c.createBufferSource();
  body.buffer = noiseBuffer(c);
  const band = c.createBiquadFilter();
  band.type = 'bandpass';
  band.frequency.value = colour;
  band.Q.value = 1.1;
  const bodyGain = c.createGain();
  bodyGain.gain.setValueAtTime(level * 0.7, at);
  bodyGain.gain.exponentialRampToValueAtTime(0.0001, at + 0.05);
  body.connect(band).connect(bodyGain).connect(out);
  body.start(at);
  body.stop(at + 0.08);

  const osc = c.createOscillator();
  osc.type = 'sine';
  // The drop is what turns a tone into a tap. A flat sine sounds electronic.
  osc.frequency.setValueAtTime(freq, at);
  osc.frequency.exponentialRampToValueAtTime(freq * 0.62, at + 0.05);
  const oscGain = c.createGain();
  oscGain.gain.setValueAtTime(0.0001, at);
  oscGain.gain.exponentialRampToValueAtTime(level, at + 0.004);
  oscGain.gain.exponentialRampToValueAtTime(0.0001, at + 0.07);
  osc.connect(oscGain).connect(out);
  osc.start(at);
  osc.stop(at + 0.09);
}

/*
 * Octaves and fifths on A, so any two of these sit together and no cue can
 * clash with another if two ever overlap at the edges. There is no third here
 * on purpose: it is what keeps the whole set closer to a bell tower than to a
 * major key.
 *
 * The upper notes stay between 220 and 880, because a phone speaker has almost
 * nothing below that and gets shrill above. Two notes break that rule. A2 and
 * E3 are only ever used by `drone`, felt under the rest rather than heard, with
 * the filter keeping them from turning to mud, and by `bloom` for a moment
 * under an arrival. E6 appears only in the celebrations' flourishes, the
 * sparkle off a landing and the glints, brief and quiet, where a little shimmer
 * at the top is the point and a sustained note there would not be.
 */
const A2 = 110;
const E3 = 164.81;
const A3 = 220;
const E4 = 329.63;
const A4 = 440;
const E5 = 659.25;
const A5 = 880;
const E6 = 1318.51;

/**
 * A low note that swells instead of striking, and brightens while it holds.
 *
 * Two triangles a few cents apart rather than one: the beating between them is
 * what stops a long note sitting dead still for three seconds. The filter
 * opening as it swells is the same idea, so the sound arrives somewhere rather
 * than simply being loud for a while.
 */
function drone(
  c: BaseAudioContext,
  out: AudioNode,
  at: number,
  freq: number,
  dur: number,
  level: number,
): void {
  const filter = c.createBiquadFilter();
  filter.type = 'lowpass';
  filter.frequency.setValueAtTime(240, at);
  filter.frequency.linearRampToValueAtTime(1500, at + dur * 0.62);
  filter.Q.value = 0.7;

  /*
   * The swell is linear and the decay is exponential, which is not a stylistic
   * choice. An exponential ramp climbing from near zero spends almost all of
   * its length inaudible: rising to full over a second, it is still 50 dB down
   * a third of the way in. Two of those in a row left a hole in this cue right
   * where the reels start turning. Decay stays exponential because that is how
   * a real thing stops.
   */
  const gain = c.createGain();
  gain.gain.setValueAtTime(0, at);
  gain.gain.linearRampToValueAtTime(level * 0.55, at + dur * 0.13);
  gain.gain.linearRampToValueAtTime(level, at + dur * 0.5);
  // Held to four fifths and only then let go, so the bed is still under the
  // screen when it starts to leave rather than gone a second before it.
  gain.gain.setValueAtTime(level, at + dur * 0.8);
  gain.gain.exponentialRampToValueAtTime(0.0001, at + dur);
  filter.connect(gain).connect(out);

  for (const detune of [-6, 6]) {
    const osc = c.createOscillator();
    osc.type = 'triangle';
    osc.frequency.value = freq;
    osc.detune.value = detune;
    osc.connect(filter);
    osc.start(at);
    osc.stop(at + dur + 0.05);
  }
}

/**
 * Filtered noise climbing through the spectrum while the reels turn, and cut
 * off the instant the last one locks.
 *
 * Deliberately not a ratchet or a click track. A literal slot machine would be
 * the one moment in this app that sounds like a casino, and everything else
 * here is closer to a bell tower. This is tension without a genre, and the
 * point of it is the end: it peaks on the lock and drops away in under a tenth
 * of a second, so the chord arrives into the space it leaves. That is the
 * difference between a chord that is played and one that is a release.
 *
 * It replaced `sweep`, which rose and fell back on its own before the reels
 * had stopped, so the arrival landed after the tension had already gone.
 *
 * The noise buffer is a tenth of a second, so it has to loop to cover the roll.
 */
function riser(c: BaseAudioContext, out: AudioNode, at: number, dur: number, level: number): void {
  const source = c.createBufferSource();
  source.buffer = noiseBuffer(c);
  source.loop = true;

  const band = c.createBiquadFilter();
  band.type = 'bandpass';
  band.frequency.setValueAtTime(600, at);
  band.frequency.exponentialRampToValueAtTime(4200, at + dur);
  band.Q.value = 3;

  // Linear on the way up, for the same reason as `drone`: an exponential climb
  // from near nothing is silent for most of its length.
  const gain = c.createGain();
  gain.gain.setValueAtTime(0, at);
  gain.gain.linearRampToValueAtTime(level * 0.35, at + dur * 0.35);
  gain.gain.linearRampToValueAtTime(level, at + dur - 0.02);
  gain.gain.exponentialRampToValueAtTime(0.0001, at + dur + 0.09);

  source.connect(band).connect(gain).connect(out);
  source.start(at);
  source.stop(at + dur + 0.12);
}

/**
 * A match being struck: a bright scrape of noise that falls in pitch and is
 * gone in a tenth of a second. The first thing a streak does, with the point
 * of light it makes on screen.
 */
function strike(c: BaseAudioContext, out: AudioNode, at: number, level: number): void {
  const source = c.createBufferSource();
  source.buffer = noiseBuffer(c);

  const band = c.createBiquadFilter();
  band.type = 'bandpass';
  band.frequency.setValueAtTime(5200, at);
  band.frequency.exponentialRampToValueAtTime(2200, at + 0.09);
  band.Q.value = 0.9;

  const gain = c.createGain();
  gain.gain.setValueAtTime(0, at);
  gain.gain.linearRampToValueAtTime(level, at + 0.003);
  gain.gain.exponentialRampToValueAtTime(level * 0.25, at + 0.03);
  gain.gain.exponentialRampToValueAtTime(0.0001, at + 0.11);

  source.connect(band).connect(gain).connect(out);
  source.start(at);
  source.stop(at + 0.12);
}

/**
 * The flame catching. Noise through a lowpass that throws itself open and then
 * settles, which is the shape of the sound gas makes when it lights, with a
 * low thump of moving air under it.
 *
 * The thump falls in pitch for the same reason `tick` does: a flat sine is a
 * beep, a falling one is a body.
 */
function kindle(c: BaseAudioContext, out: AudioNode, at: number, dur: number, level: number): void {
  const source = c.createBufferSource();
  source.buffer = noiseBuffer(c);
  source.loop = true;

  const low = c.createBiquadFilter();
  low.type = 'lowpass';
  low.frequency.setValueAtTime(160, at);
  low.frequency.exponentialRampToValueAtTime(2600, at + 0.28);
  low.frequency.exponentialRampToValueAtTime(700, at + dur);
  low.Q.value = 1.2;

  const gain = c.createGain();
  gain.gain.setValueAtTime(0, at);
  gain.gain.linearRampToValueAtTime(level, at + 0.16);
  gain.gain.exponentialRampToValueAtTime(0.0001, at + dur);

  source.connect(low).connect(gain).connect(out);
  source.start(at);
  source.stop(at + dur + 0.05);

  const air = c.createOscillator();
  air.type = 'sine';
  air.frequency.setValueAtTime(A2, at);
  air.frequency.exponentialRampToValueAtTime(70, at + 0.45);
  const airGain = c.createGain();
  airGain.gain.setValueAtTime(0, at);
  airGain.gain.linearRampToValueAtTime(level * 0.9, at + 0.05);
  airGain.gain.exponentialRampToValueAtTime(0.0001, at + 0.6);
  air.connect(airGain).connect(out);
  air.start(at);
  air.stop(at + 0.65);
}

/**
 * The fire, while it burns: small pops of bright noise at uneven intervals,
 * most of them quiet and the odd one not, which is what wood does.
 *
 * Seeded rather than random, so the crackle under a measured peak is the
 * crackle that ships. Kept dry, out of the hall, because a fire is close and a
 * crackle with a two second echo on it is applause.
 */
function crackle(
  c: BaseAudioContext,
  out: AudioNode,
  at: number,
  dur: number,
  level: number,
  seed: number,
): void {
  const rng = mulberry32(seed);
  const high = c.createBiquadFilter();
  high.type = 'highpass';
  high.frequency.value = 1800;
  high.Q.value = 0.7;
  high.connect(out);

  for (let t = at + 0.04 + rng() * 0.2; t < at + dur; t += 0.04 + rng() * 0.22) {
    const pop = c.createBufferSource();
    pop.buffer = noiseBuffer(c);
    // Squaring the draw is what makes most pops quiet and a few of them loud.
    const peak = level * (0.3 + 0.7 * rng() * rng());
    const len = 0.004 + rng() * 0.012;
    const gain = c.createGain();
    gain.gain.setValueAtTime(0, t);
    gain.gain.linearRampToValueAtTime(peak, t + 0.001);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + len);
    pop.connect(gain).connect(high);
    pop.start(t, rng() * 0.09);
    pop.stop(t + len + 0.01);
  }
}

/**
 * Pages riffling shut, the first thing a finished book does.
 *
 * Each page is a short breath of bandpassed noise, and each comes a little
 * later than the last by more, so the riffle slows the way a thumb lets the
 * last few pages go one at a time. That slowing is what reads as a book rather
 * than as rain. Seeded like the crackle, so it is measured as it ships.
 */
function riffle(
  c: BaseAudioContext,
  out: AudioNode,
  at: number,
  dur: number,
  pages: number,
  level: number,
  seed: number,
): void {
  const rng = mulberry32(seed);
  for (let k = 0; k < pages; k++) {
    const t = at + dur * Math.pow(k / pages, 1.7);
    const page = c.createBufferSource();
    page.buffer = noiseBuffer(c);
    const band = c.createBiquadFilter();
    band.type = 'bandpass';
    band.frequency.value = 2400 + rng() * 1800;
    band.Q.value = 0.8;
    const gain = c.createGain();
    const peak = level * (0.55 + 0.45 * rng()) * (1 - 0.35 * (k / pages));
    gain.gain.setValueAtTime(0, t);
    gain.gain.linearRampToValueAtTime(peak, t + 0.004);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.03);
    page.connect(band).connect(gain).connect(out);
    page.start(t, rng() * 0.08);
    page.stop(t + 0.04);
  }
}

/**
 * Low weight under an arrival: the root and its octave, falling a little as
 * they fade, felt in the chest more than heard. On a phone speaker it is the
 * octave that survives; on headphones it is the root that lands.
 */
function bloom(c: BaseAudioContext, out: AudioNode, at: number, level: number): void {
  for (const [freq, share] of [
    [A2, 1],
    [A3, 0.35],
  ] as const) {
    const osc = c.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(freq, at);
    osc.frequency.exponentialRampToValueAtTime(freq * 0.86, at + 0.8);
    const gain = c.createGain();
    gain.gain.setValueAtTime(0, at);
    gain.gain.linearRampToValueAtTime(level * share, at + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.0001, at + 1.6);
    osc.connect(gain).connect(out);
    osc.start(at);
    osc.stop(at + 1.65);
  }
}

/**
 * Somewhere left or right of centre. A single bell is better in the middle,
 * but a run of small high ones placed alternately reads as light scattering
 * rather than as one instrument playing a scale. Falls back to the centre
 * wherever a browser has no panner, which costs width and nothing else.
 */
function placed(c: BaseAudioContext, out: AudioNode, pan: number): AudioNode {
  if (typeof c.createStereoPanner !== 'function') return out;
  const panner = c.createStereoPanner();
  panner.pan.value = pan;
  panner.connect(out);
  return panner;
}

/** A quick run of small bells, left and right in turn, for light scattering. */
function sparkle(
  c: BaseAudioContext,
  out: AudioNode,
  at: number,
  notes: readonly number[],
  gap: number,
  level: number,
): void {
  notes.forEach((freq, i) => {
    bell(c, placed(c, out, i % 2 === 0 ? -0.45 : 0.45), at + i * gap, freq, 0.7, level);
  });
}

/*
 * The room the big moments ring in, as a convolution with a tail of noise:
 * two seconds and a bit, darkening as it decays because stone takes the top
 * off a sound first, and slightly different in each ear so it has width.
 * Cached against the sample rate like the noise, and seeded so the room is the
 * same room every time it is measured.
 */
let impulse: { rate: number; buffer: AudioBuffer } | null = null;

function hallImpulse(c: BaseAudioContext): AudioBuffer {
  if (impulse?.rate === c.sampleRate) return impulse.buffer;
  const seconds = 2.4;
  const length = Math.floor(c.sampleRate * seconds);
  const buffer = c.createBuffer(2, length, c.sampleRate);
  const rng = mulberry32(1189);
  // A short gap before the first reflection, which is what says "room" rather
  // than "blur".
  const gap = Math.floor(c.sampleRate * 0.014);
  for (let ch = 0; ch < 2; ch++) {
    const data = buffer.getChannelData(ch);
    let low = 0;
    for (let i = gap; i < length; i++) {
      const t = (i - gap) / c.sampleRate;
      // A one pole lowpass closing as the tail goes on.
      low += (0.55 - 0.4 * (t / seconds)) * (rng() * 2 - 1 - low);
      data[i] = low * Math.exp(-t * 2.9);
    }
  }
  impulse = { rate: c.sampleRate, buffer };
  return buffer;
}

/**
 * Where a celebration's voices go: straight through, and also into the hall.
 *
 * **Only the two celebrations and the milestone ring in it.** The chapter tick
 * fires three times a day and a reverb on it would turn a tap into an event;
 * the arrival chimes are an invitation and stay close. The hall is what makes
 * the bells sound like they were struck somewhere, which is the whole register
 * this set has been reaching for, and it is the reason the arrivals no longer
 * stop dead when the envelopes do.
 *
 * A failed convolver leaves the dry path standing. A bell with no room is
 * still a bell.
 */
function hall(c: BaseAudioContext, out: AudioNode, wet: number): AudioNode {
  const input = c.createGain();
  input.connect(out);
  try {
    const verb = c.createConvolver();
    verb.buffer = hallImpulse(c);
    const send = c.createGain();
    send.gain.value = wet;
    input.connect(verb).connect(send).connect(out);
  } catch {
    /* Dry is fine. */
  }
  return input;
}

/** Milliseconds on the shared timeline, as a time in this context. */
const when = (at: number, ms: number) => at + ms / 1000;

/*
 * The pitches the reels lock on, left to right, so a long number climbs to its
 * last digit. Read from the end, so a one digit number locks on A4, the same
 * note its chord is built on.
 */
const LOCKS = [A3, E4, A4];

/**
 * One small wooden click per reel, as it locks, the last one under the chord.
 * They are what make the stop feel mechanical rather than faded, and there is
 * one per digit on screen because `play` is told how many digits there are.
 */
function locks(c: BaseAudioContext, out: AudioNode, at: number, digits: number, t: ReelTiming) {
  for (let i = 0; i < digits; i++) {
    const freq = LOCKS[Math.max(0, LOCKS.length - digits + i)];
    tick(c, out, when(at, reelLand(i, digits, t)), freq, 1500, 0.08);
  }
}

/** The tension that runs from the first reel turning to the last one locking. */
function reels(c: BaseAudioContext, out: AudioNode, at: number, digits: number, t: ReelTiming) {
  const first = reelStart(0, digits, t);
  riser(c, out, when(at, first), (t.land - first) / 1000, 0.05);
  locks(c, out, at, digits, t);
}

/**
 * The streak, scored against `STREAK` in `celebration.ts`, which the screen
 * reads too. Shared by the plain streak and the milestone, which is the same
 * moment with a name added; `hold` is how long the one being played stays up.
 *
 *   spark   a match is struck
 *   ignite  the flame catches, with a bell under it, and starts to crackle
 *   ...     the reels turn under a riser
 *   land    the last reel locks: the riser cuts, the chord, weight under it,
 *           and light scattering off the top
 *   today   the newest day of the run catches
 *
 * The arrival is root, fifth and octave rather than a major chord. A major
 * third here would read as a game rewarding you; open fifths read as a bell
 * tower, which is the company this app keeps.
 */
function kindled(
  c: BaseAudioContext,
  out: AudioNode,
  at: number,
  digits: number,
  hold: number,
): void {
  const room = hall(c, out, 0.3);
  const end = hold / 1000;

  drone(c, room, at, A2, end - 0.1, 0.085);
  strike(c, room, when(at, STREAK.spark), 0.15);
  kindle(c, room, when(at, STREAK.ignite), 1.1, 0.16);
  bell(c, room, when(at, STREAK.ignite) + 0.02, A3, 1.4, 0.1);
  crackle(c, out, when(at, STREAK.ignite) + 0.25, end - STREAK.ignite / 1000 - 0.6, 0.05, 7);

  reels(c, room, at, digits, STREAK);

  const land = when(at, STREAK.land);
  bell(c, room, land, A4, 1.8, 0.16);
  bell(c, room, land + 0.05, E5, 1.9, 0.12);
  bell(c, room, land + 0.12, A5, 1.7, 0.1);
  bloom(c, room, land, 0.08);
  sparkle(c, room, land + 0.16, [E6, A5, E6], 0.07, 0.03);

  bell(c, placed(c, room, 0.2), when(at, STREAK.today), A5, 0.7, 0.06);
}

type Voice = (c: BaseAudioContext, out: AudioNode, at: number, digits: number) => void;

const VOICES: Record<Playable, Voice> = {
  /*
   * The workhorse. It fires more than everything else put together, so it is
   * the least musical thing here on purpose: at three chapters a day for a year,
   * anything with a tune in it becomes something to switch off.
   */
  chapter: (c, out, at) => tick(c, out, at, 660, 1900, 0.2),

  /** The chapter tap, lower and softer. Taking something back, not doing it. */
  undo: (c, out, at) => tick(c, out, at, 380, 1150, 0.15),

  streak: (c, out, at, digits) => kindled(c, out, at, digits, STREAK.hold),

  /**
   * Scored against `BOOK` the way the streak is scored against its own, and
   * bigger in every direction the moment is: a longer hold, a fifth under the
   * drone, a wetter room, and two arrivals rather than one, the name and then
   * the count.
   *
   *   0       the pages riffle shut, slowing
   *   close   the cross lands and the book closes: a thud, a bell, weight
   *           under it, and three small strikes as the rings leave, left,
   *           centre, right
   *   name    the name rises, first chord
   *   sheen   one glint as light crosses it
   *   ...     the reels turn under a riser
   *   land    the count locks and the book's square catches: second chord an
   *           octave up, weight, and light scattering off the top
   */
  book: (c, out, at, digits) => {
    const room = hall(c, out, 0.34);
    const end = BOOK.hold / 1000;
    const close = when(at, BOOK.close);

    riffle(c, room, at, BOOK.close / 1000 - 0.12, 16, 0.2, 40);
    drone(c, room, at, A2, end - 0.1, 0.09);
    drone(c, room, at, E3, end - 0.4, 0.05);

    tick(c, room, close, 150, 480, 0.24);
    bloom(c, room, close, 0.1);
    bell(c, room, close + 0.02, A3, 1.6, 0.11);
    [E5, A5, E6].forEach((freq, r) => {
      bell(c, placed(c, room, (r - 1) * 0.4), close + r * 0.15, freq, 0.5, 0.055);
    });

    const name = when(at, BOOK.name);
    bell(c, room, name + 0.05, A4, 1.6, 0.18);
    bell(c, room, name + 0.13, E5, 1.7, 0.14);
    bell(c, placed(c, room, 0.3), when(at, BOOK.sheen) + 0.3, E6, 0.6, 0.025);

    reels(c, room, at, digits, BOOK);

    const land = when(at, BOOK.land);
    bell(c, room, land, A4, 1.9, 0.09);
    bell(c, room, land, A5, 1.9, 0.11);
    bell(c, room, land + 0.08, E6, 1.6, 0.06);
    bloom(c, room, land, 0.06);
    sparkle(c, room, land + 0.14, [A5, E6, A5, E6], 0.065, 0.03);
  },

  /**
   * The whole plan, scored against `PLAN` and the longest thing the app ever
   * plays, because it is once in a reading life.
   *
   *   0       a bed on the root and its fifth, swelling as the dawn comes up
   *   close   the cross lands: a struck octave and weight under it, and three
   *           small strikes as the rings leave
   *   name    the plan's name, first chord
   *   wave    a peal: rounds rung down the octave and fifth, one bell for every
   *           sixteenth of the wave, walking left to right across the room as
   *           the shelf catches left to right on screen
   *   land    the count locks: the fullest chord in the set, every octave and
   *           fifth on A from A3 up, with light scattering off the top
   *
   * Rounds and not a tune. Change ringing is how a tower says something has
   * happened that the whole town should know about, and rounds descending is
   * the first thing every peal rings. Still octaves and fifths on A and no
   * third, so it belongs to the same tower as every other bell here.
   */
  plan: (c, out, at, digits) => {
    const room = hall(c, out, 0.4);
    const end = PLAN.hold / 1000;

    drone(c, room, at, A2, end - 0.1, 0.09);
    drone(c, room, at, E3, end - 0.4, 0.05);
    // One toll, far off, as the light starts to come up. Without it the first
    // second is a drone too low for a phone to play, which is silence.
    bell(c, room, when(at, PLAN.dawn), A3, 2.4, 0.07);

    const close = when(at, PLAN.close);
    bell(c, room, close, A3, 2.2, 0.12);
    bell(c, room, close + 0.02, A4, 1.8, 0.1);
    bloom(c, room, close, 0.1);
    [E5, A5, E6].forEach((freq, r) => {
      bell(c, placed(c, room, (r - 1) * 0.4), close + r * 0.15, freq, 0.5, 0.05);
    });

    const name = when(at, PLAN.name);
    bell(c, room, name + 0.05, A4, 1.6, 0.16);
    bell(c, room, name + 0.13, E5, 1.7, 0.12);

    const ROUNDS = [E6, A5, E5, A4];
    const BELLS = 16;
    for (let i = 0; i < BELLS; i++) {
      const pan = -0.6 + (1.2 * i) / (BELLS - 1);
      const t = when(at, PLAN.wave) + (PLAN.waveFor / 1000) * (i / BELLS);
      bell(c, placed(c, room, pan), t, ROUNDS[i % ROUNDS.length], 0.9, 0.04);
    }

    reels(c, room, at, digits, PLAN);

    const land = when(at, PLAN.land);
    bell(c, room, land, A3, 2.6, 0.075);
    bell(c, room, land, A4, 2.4, 0.075);
    bell(c, room, land + 0.04, E5, 2.3, 0.065);
    bell(c, room, land + 0.08, A5, 2.2, 0.065);
    bell(c, room, land + 0.14, E6, 1.8, 0.04);
    bloom(c, room, land, 0.07);
    sparkle(c, room, land + 0.2, [A5, E6, A5, E6, A5], 0.07, 0.028);
  },

  /**
   * The streak, and then one thing more.
   *
   * It is the streak's own score note for note, because that is what it is:
   * the same flame, the same arrival. What marks it is the fifth under the
   * drone, borrowed from `book` where the same trick says "this one is larger",
   * a glint as the rule draws, and a second quieter chord an octave up as the
   * number's name rises.
   *
   * It resolves rather than climbing. A ladder would say "keep going", and this
   * is an arrival, the same reasoning that ends the tour on a chord instead of
   * a sixth rung. The streak's drone and crackle are stretched to this hold, so
   * the last third of a longer card is not left in silence.
   */
  milestone: (c, out, at, digits) => {
    kindled(c, out, at, digits, MILESTONE.hold);
    const room = hall(c, out, 0.3);
    drone(c, room, at, E3, MILESTONE.hold / 1000 - 0.4, 0.05);
    bell(c, placed(c, room, -0.3), when(at, MILESTONE.rule), E5, 0.8, 0.05);
    const name = when(at, MILESTONE.name);
    bell(c, room, name, A5, 2.6, 0.1);
    bell(c, room, name + 0.08, E6, 2.2, 0.07);
    bloom(c, room, name, 0.06);
  },
};

/**
 * Schedules one cue into any context, which is what lets these be measured
 * rather than only listened to. Rendering the real voices through an
 * `OfflineAudioContext` is the only way to check a sound is not silent, not
 * clipping and not three seconds of drone without being able to hear it.
 *
 * `digits` is how many reels the screen is turning, so there is one lock per
 * reel. The cues with no reels ignore it.
 */
export function schedule(
  cue: Playable,
  c: BaseAudioContext,
  out: AudioNode,
  at: number,
  digits = 1,
): void {
  VOICES[cue](c, out, at, digits);
}

/**
 * Two soft sounds for something arriving to be read, apart from the cues.
 *
 * They are not on the ladder because they are not the reducer's business:
 * nothing in the journal changed. A book introducing itself is quieter than a
 * book being finished, an invitation rather than a reward, and a chapter's note
 * is a single touch. Both play once, the first time, and never for a re-open.
 */
const ARRIVALS = {
  // Measured offline like the cues: at 0.11 and 0.07 these peaked at -17.3
  // and -21.5 dBFS, under the chapter tick, and the tick at -20 was the one
  // that vanished on a phone. Lifted by a fixed factor, which moves a bell's
  // peak exactly: about -15.2 and -18.4 now, still well under every cue.
  open: (c: BaseAudioContext, out: AudioNode, at: number) => {
    bell(c, out, at, A4, 0.9, 0.14);
    bell(c, out, at + 0.14, E5, 1.0, 0.115);
  },
  note: (c: BaseAudioContext, out: AudioNode, at: number) => {
    bell(c, out, at, A5, 0.5, 0.1);
  },
} as const;

export type Arrival = keyof typeof ARRIVALS;

export function chime(kind: Arrival): void {
  if (!enabled) return;
  const c = context();
  if (!c || !master) return;
  if (c.state === 'suspended') void c.resume().catch(() => {});
  try {
    ARRIVALS[kind](c, master, c.currentTime + 0.02);
  } catch {
    /* Never worth an exception on the path that opens a chapter. */
  }
}

/** For the offline measurement, the same way `schedule` serves the cues. */
export function scheduleArrival(
  kind: Arrival,
  c: BaseAudioContext,
  out: AudioNode,
  at: number,
): void {
  ARRIVALS[kind](c, out, at);
}

/* ── The tap ──────────────────────────────────────────── */
/**
 * Noise through a closing lowpass, and nothing else.
 *
 * **It has no pitch on purpose.** Every other sound here is tuned, because every
 * other sound here means something: a chapter, a book, a streak. A tap means
 * nothing happened, someone touched something, and the moment it carries a note
 * it starts competing with the cues for the same job. A dull knock is the sound
 * of contact rather than the sound of news, which is why a keyboard makes one
 * and a doorbell does not.
 *
 * 35ms, so it is over well before a cue triggered by the same press arrives.
 */
function thock(c: BaseAudioContext, out: AudioNode, at: number, level: number): void {
  const source = c.createBufferSource();
  source.buffer = noiseBuffer(c);

  const lp = c.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.setValueAtTime(2400, at);
  lp.frequency.exponentialRampToValueAtTime(620, at + 0.03);
  lp.Q.value = 0.5;

  // Linear in, exponential out, the same rule as everything else here: an
  // exponential attack on a 4ms ramp would be inaudible for most of it.
  const gain = c.createGain();
  gain.gain.setValueAtTime(0, at);
  gain.gain.linearRampToValueAtTime(level, at + 0.004);
  gain.gain.exponentialRampToValueAtTime(0.0001, at + 0.035);

  source.connect(lp).connect(gain).connect(out);
  source.start(at);
  source.stop(at + 0.06);
}

/**
 * Level and rate limit for the tap.
 *
 * The level is the whole design. This fires on every press in the app, hundreds
 * of times a session against the chapter tick's three, so it has to sit far
 * enough under the cues that it reads as the texture of pressing rather than as
 * a sound the app is making at you. Measured, not judged, like `MASTER`:
 * `sound.test.ts` pins it below the quietest cue by a real margin.
 *
 * The rate limit is for the drag that turns into six pointerdowns and for a
 * double tap, which should knock once rather than machine-gun. It is measured
 * on the wall clock and **not** on `currentTime`: an audio clock stops
 * advancing while its context is suspended, which is what iOS does the moment
 * the app goes to the background, so a gap measured that way would still be
 * reading the moment before the phone was pocketed and would refuse every tap
 * from then on. A muted app that never explains itself is the worst version of
 * this feature.
 */
const TAP_LEVEL = 0.055;
const TAP_GAP_MS = 50;

let lastTap = -Infinity;

/**
 * The press. Never a cue: nothing in the journal changed, so it is not the
 * reducer's business, the same reasoning as the two insight chimes.
 */
export function tap(): void {
  if (!enabled) return;
  const c = context();
  if (!c || !master) return;

  const now = performance.now();
  if (now - lastTap < TAP_GAP_MS) return;
  lastTap = now;

  if (c.state === 'suspended') void c.resume().catch(() => {});
  try {
    thock(c, master, c.currentTime + 0.004, TAP_LEVEL);
  } catch {
    /* A press must never be able to throw. */
  }
}

/** For the offline measurement, the same way `schedule` serves the cues. */
export function scheduleTap(c: BaseAudioContext, out: AudioNode, at: number): void {
  thock(c, out, at, TAP_LEVEL);
}

/* ── The tour ─────────────────────────────────────── */
/**
 * A rung of the ladder the tour climbs, one per stop.
 *
 * It borrowed the insight bell at first, which meant the same note six times.
 * That is the difference between a sound and a score: an identical chime on
 * every step tells you something happened and nothing else, so by the third one
 * you have stopped hearing it. A line that climbs tells you where you are in
 * the walk without anyone having to read "4 of 6", and it is the reason the
 * last step lands rather than merely stopping.
 *
 * Octaves and fifths on A and no third, the same rule the rest of the set
 * follows, and every rung inside the 220 to 880 window a phone speaker can
 * actually reproduce.
 */
const TOUR_LADDER = [A3, E4, A4, E5, A5];

/**
 * Which rung a climbing stop rings.
 *
 * The five rungs are stretched over the stops rather than handed out one each
 * with the top one clamped. Clamping was right at six stops and wrong at seven:
 * it repeated A5 on the stop immediately before the arrival, which is the worst
 * place a repeat can land, since the arrival is built on A and the ear had just
 * heard the top of the climb stall.
 *
 * Stretching is over the gaps rather than the stops, which is what guarantees
 * the two ends: the first stop is always the bottom rung and the last stop
 * before the arrival is always the top one, at any length. With more stops than
 * rungs a rung repeats somewhere in the middle, where a plateau passes for
 * pacing, and never against the arrival.
 *
 * **Six stops still ring exactly what they rang before**, one rung each, which
 * is what makes this safe to change under a tour nobody wanted to re-score.
 * Exported so that is a test rather than a claim.
 */
export function tourRung(index: number, total: number): number {
  const gaps = Math.max(1, total - 2);
  const rung = Math.round((index * (TOUR_LADDER.length - 1)) / gaps);
  return TOUR_LADDER[Math.max(0, Math.min(TOUR_LADDER.length - 1, rung))];
}

export function tourStep(index: number, total: number): void {
  if (!enabled) return;
  const c = context();
  if (!c || !master) return;
  if (c.state === 'suspended') void c.resume().catch(() => {});
  try {
    scheduleTourStep(index, total, c, master, c.currentTime + 0.02);
  } catch {
    /* A step of a tour is never worth an exception. */
  }
}

/** Exported whole so the ladder can be rendered offline and measured. */
export function scheduleTourStep(
  index: number,
  total: number,
  c: BaseAudioContext,
  out: AudioNode,
  at: number,
): void {
  /*
   * The last stop is the arrival, so it stops climbing and resolves instead:
   * root, fifth and octave, spread by fifty milliseconds so it reads as a bell
   * being struck rather than a chord being played. Same shape the streak cue
   * lands on, and no third there either.
   */
  if (index >= total - 1) {
    bell(c, out, at, A4, 1.15, 0.15);
    bell(c, out, at + 0.05, E5, 1.0, 0.12);
    bell(c, out, at + 0.1, A5, 0.85, 0.1);
    return;
  }

  bell(c, out, at, tourRung(index, total), 0.8, 0.14);
}

/** Mirrors the reader's preference, so a muted app never even builds a voice. */
export function setSoundEnabled(on: boolean): void {
  enabled = on;
}

/**
 * Creates and resumes the context inside a real gesture.
 *
 * Browsers hand back a suspended context until a user has interacted, and
 * Safari is strictest about the resume happening in the gesture itself. Every
 * cue is downstream of a tap, but React flushes effects after the handler has
 * returned, which is late enough to be refused. Taking the first pointerdown on
 * the document sidesteps the question entirely.
 */
export function primeSound(): void {
  if (ctx || !maker()) return;

  const open = () => {
    window.removeEventListener('pointerdown', open, true);
    window.removeEventListener('keydown', open, true);
    const c = context();
    if (c?.state === 'suspended') void c.resume().catch(() => {});
  };

  window.addEventListener('pointerdown', open, { capture: true });
  window.addEventListener('keydown', open, { capture: true });
}

/**
 * Plays a cue, or does nothing at all. It must never be able to break a mark.
 *
 * `digits` is how many reels the celebration is turning, so the voice can put
 * one lock under each. The cues without reels ignore it.
 */
export function play(cue: Playable, digits = 1): void {
  if (!enabled) return;
  const c = context();
  if (!c || !master) return;
  if (c.state === 'suspended') void c.resume().catch(() => {});

  try {
    // A small lead, so every voice is scheduled ahead of the clock rather than
    // exactly on it. Scheduling at currentTime lands a fraction late and the
    // envelope's attack is clipped into a click.
    VOICES[cue](c, master, c.currentTime + 0.02, digits);
  } catch {
    /* A sound is never worth an exception on the path that records reading. */
  }
}
