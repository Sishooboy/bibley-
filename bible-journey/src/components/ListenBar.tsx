import { useCallback, useEffect, useRef, useState } from 'react';
import { AUDIO_CREDIT, audioUrl, clock } from '../lib/audio';
import { Pause, Play } from './icons';

type Props = { book: string; chapter: number; onClose: () => void };

/**
 * Listening to the chapter on screen.
 *
 * A slim strip under the reader's bar rather than a panel over the text,
 * because the whole point is to read along while it plays: anything that
 * covered the words would be a worse version of reading them yourself.
 *
 * **It is an `<audio>` element, which `sound.ts` forbids for everything else.**
 * The cues are Web Audio so that a silenced phone stays silent, since an
 * interface chime talking over somebody who asked for quiet is the app being
 * rude. This is the opposite: somebody pressed play, so it belongs on the media
 * channel and behaves like a podcast. That distinction is the rule, not an
 * exception to it.
 */
export function ListenBar({ book, chapter, onClose }: Props) {
  const url = audioUrl(book, chapter);
  const ref = useRef<HTMLAudioElement>(null);
  const [playing, setPlaying] = useState(false);
  const [at, setAt] = useState(0);
  const [length, setLength] = useState(0);
  const [failed, setFailed] = useState(false);
  const [loading, setLoading] = useState(false);

  /*
   * A new chapter is a new recording. The element is reloaded and played
   * straight away, because arriving here at all means listening was asked for
   * and making somebody press play again on every chapter would be the
   * feature's main cost.
   *
   * `play()` returns a promise that rejects when a browser refuses to start
   * without a fresh gesture. That is a legitimate answer, not an error: the
   * catch leaves the strip paused with a working button rather than throwing.
   */
  useEffect(() => {
    const el = ref.current;
    if (!el || !url) return;
    setFailed(false);
    setAt(0);
    setLength(0);
    setLoading(true);
    el.load();
    void el
      .play()
      .then(() => setPlaying(true))
      .catch(() => setPlaying(false));
  }, [url]);

  const toggle = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    if (el.paused) {
      void el
        .play()
        .then(() => setPlaying(true))
        .catch(() => setFailed(true));
    } else {
      el.pause();
      setPlaying(false);
    }
  }, []);

  if (!url) {
    return (
      <div className="listen listen--none">
        <p className="listen__note">
          {/* Named rather than hidden: a control that is simply absent reads as
              a bug, and the reason here is a real one worth one sentence. */}
          No recording of {book} {chapter}. The reading covers the sixty six books, so the
          deuterocanon, the Greek additions and Thessalonians are silent.
        </p>
        <button type="button" className="listen__close" onClick={onClose} aria-label="Stop listening">
          ✕
        </button>
      </div>
    );
  }

  return (
    <div className="listen">
      <audio
        ref={ref}
        src={url}
        // Nothing is fetched until somebody asks, since a chapter is about a
        // megabyte and most opens are for reading.
        preload="none"
        onLoadedMetadata={(e) => {
          setLength(e.currentTarget.duration);
          setLoading(false);
        }}
        onTimeUpdate={(e) => setAt(e.currentTarget.currentTime)}
        onEnded={() => setPlaying(false)}
        onError={() => {
          setFailed(true);
          setLoading(false);
          setPlaying(false);
        }}
        onWaiting={() => setLoading(true)}
        onPlaying={() => setLoading(false)}
      />

      <button
        type="button"
        className="listen__play"
        onClick={toggle}
        aria-label={playing ? 'Pause' : 'Play'}
      >
        {playing ? <Pause size={14} /> : <Play size={14} />}
      </button>

      <div className="listen__middle">
        <input
          className="listen__scrub"
          type="range"
          min={0}
          max={length || 0}
          step={1}
          value={Math.min(at, length || 0)}
          disabled={!length}
          aria-label="Position in the chapter"
          onChange={(e) => {
            const el = ref.current;
            if (!el) return;
            el.currentTime = Number(e.target.value);
            setAt(Number(e.target.value));
          }}
        />
        <p className="listen__meta">
          {failed ? (
            <span className="listen__failed">That recording would not load.</span>
          ) : loading && !length ? (
            'Loading'
          ) : (
            <>
              <span className="listen__time">
                {clock(at)} / {clock(length)}
              </span>
              <span className="listen__credit">{AUDIO_CREDIT}</span>
            </>
          )}
        </p>
      </div>

      <button type="button" className="listen__close" onClick={onClose} aria-label="Stop listening">
        ✕
      </button>
    </div>
  );
}
