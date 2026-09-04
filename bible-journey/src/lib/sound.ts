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

/**
 * The five moments worth a sound.
 *
 * `undo` covers clearing as well as the undo bar: taking a chapter back is the
 * same gesture from the app's point of view, and marking that made a sound while
 * unmarking made none felt like the tap had failed.
 */
export type Cue = 'chapter' | 'streak' | 'book' | 'plan' | 'undo';

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
 * the filter keeping them from turning to mud. E6 appears only in the finished
 * book's flourishes, brief and quiet, where a little shimmer at the top is the
 * point and a sustained note there would not be.
 */
const A2 = 110;
const E3 = 164.81;
const A3 = 220;
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
  gain.gain.setValueAtTime(level, at + dur * 0.62);
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
 * Filtered noise climbing through the spectrum, for the stretch where the
 * digits are turning and nothing has landed yet.
 *
 * Deliberately not a ratchet or a click track. A literal slot machine would be
 * the one moment in this app that sounds like a casino, and everything else
 * here is closer to a bell tower. This is tension without a genre.
 *
 * The noise buffer is a tenth of a second, so it has to loop to cover the roll.
 */
function sweep(
  c: BaseAudioContext,
  out: AudioNode,
  at: number,
  dur: number,
  level: number,
): void {
  const source = c.createBufferSource();
  source.buffer = noiseBuffer(c);
  source.loop = true;

  const band = c.createBiquadFilter();
  band.type = 'bandpass';
  band.frequency.setValueAtTime(700, at);
  band.frequency.exponentialRampToValueAtTime(3400, at + dur);
  band.Q.value = 2.4;

  // Linear both ways: this is a swell of air, not something struck, and the
  // same exponential trap as `drone` applies to the way in.
  const gain = c.createGain();
  gain.gain.setValueAtTime(0, at);
  gain.gain.linearRampToValueAtTime(level, at + dur * 0.58);
  gain.gain.linearRampToValueAtTime(0, at + dur);

  source.connect(band).connect(gain).connect(out);
  source.start(at);
  source.stop(at + dur + 0.05);
}

type Voice = (c: BaseAudioContext, out: AudioNode, at: number) => void;

const VOICES: Record<Cue, Voice> = {
  /*
   * The workhorse. It fires more than everything else put together, so it is
   * the least musical thing here on purpose: at three chapters a day for a year,
   * anything with a tune in it becomes something to switch off.
   */
  chapter: (c, out, at) => tick(c, out, at, 660, 1900, 0.2),

  /** The chapter tap, lower and softer. Taking something back, not doing it. */
  undo: (c, out, at) => tick(c, out, at, 380, 1150, 0.15),

  /**
   * The only cue written against something on screen, because it is the only
   * one with something on screen: `StreakCelebration` holds for 3.6 seconds and
   * this used to be over in 0.7, so the cross landed, the reels turned and the
   * number arrived in silence. The timings below are that animation's.
   *
   *   0.00  scrim, and the drone begins to swell
   *   0.08  the cross lands
   *   0.42  the reels start turning
   *   1.88  the first reel stops, and the chord arrives
   *   3.28  the scrim starts to leave, the bells still ringing out
   *
   * The arrival is root, fifth and octave rather than a major chord. A major
   * third here would read as a game rewarding you; open fifths read as a bell
   * tower, which is the company this app keeps.
   */
  streak: (c, out, at) => {
    drone(c, out, at, A2, 3.2, 0.1);
    bell(c, out, at + 0.06, A3, 1.4, 0.1);
    // Begins before the reels do, so the tension is already there when they
    // start turning rather than fading up after them.
    sweep(c, out, at + 0.3, 1.62, 0.05);
    bell(c, out, at + 1.88, A4, 1.8, 0.2);
    bell(c, out, at + 1.94, E5, 1.9, 0.15);
    bell(c, out, at + 2.06, A5, 1.7, 0.12);
  },

  /**
   * Scored against the book celebration the way `streak` is scored against its
   * own, and bigger in every direction that the moment is: a longer hold, a
   * fifth under the drone, and two arrivals rather than one, the name and then
   * the count. The timings are that animation's.
   *
   *   0.00  scrim, drone on the root and its fifth
   *   0.08  the cross lands
   *   0.32  rings leave the cross, a quick shimmer up through the octave
   *   0.62  the name rises, first chord
   *   1.50  the reels turn
   *   3.00  the count lands, second chord an octave up
   *   4.28  the scrim starts to leave, everything still ringing out
   */
  book: (c, out, at) => {
    drone(c, out, at, A2, 4.0, 0.1);
    drone(c, out, at, E3, 3.7, 0.055);
    bell(c, out, at + 0.06, A3, 1.5, 0.1);
    // The rings: three short high strikes climbing, quiet, gone in half a second.
    bell(c, out, at + 0.32, E5, 0.45, 0.06);
    bell(c, out, at + 0.46, A5, 0.45, 0.06);
    bell(c, out, at + 0.6, E6, 0.5, 0.045);
    // The name.
    bell(c, out, at + 0.62, A4, 1.6, 0.2);
    bell(c, out, at + 0.7, E5, 1.7, 0.15);
    // The reels turning.
    sweep(c, out, at + 1.4, 1.62, 0.05);
    // The count landing, an octave above where the name arrived.
    bell(c, out, at + 3.0, A4, 1.5, 0.14);
    bell(c, out, at + 3.0, A5, 1.5, 0.17);
    bell(c, out, at + 3.08, E6, 1.3, 0.09);
  },

  /**
   * Once in a lifetime, and the only cue with a low root under it. The octave
   * at the end is the point of it: it arrives somewhere rather than stopping.
   */
  plan: (c, out, at) => {
    bell(c, out, at, A3, 3.2, 0.15);
    bell(c, out, at, A4, 2.2, 0.2);
    bell(c, out, at + 0.2, E5, 2.4, 0.18);
    bell(c, out, at + 0.42, A5, 3, 0.16);
  },
};

/**
 * Schedules one cue into any context, which is what lets these be measured
 * rather than only listened to. Rendering the real voices through an
 * `OfflineAudioContext` is the only way to check a sound is not silent, not
 * clipping and not three seconds of drone without being able to hear it.
 */
export function schedule(cue: Cue, c: BaseAudioContext, out: AudioNode, at: number): void {
  VOICES[cue](c, out, at);
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

/** Plays a cue, or does nothing at all. It must never be able to break a mark. */
export function play(cue: Cue): void {
  if (!enabled) return;
  const c = context();
  if (!c || !master) return;
  if (c.state === 'suspended') void c.resume().catch(() => {});

  try {
    // A small lead, so every voice is scheduled ahead of the clock rather than
    // exactly on it. Scheduling at currentTime lands a fraction late and the
    // envelope's attack is clipped into a click.
    VOICES[cue](c, master, c.currentTime + 0.02);
  } catch {
    /* A sound is never worth an exception on the path that records reading. */
  }
}
