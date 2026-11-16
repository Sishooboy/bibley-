import { useEffect, useState } from 'react';
import { useReminder } from '../state/useReminder';
import { useStore } from '../state/useStore';
import { Flame } from './icons';

/**
 * Runs shorter than this are not mourned. Losing a two day streak is not a loss,
 * and saying so would make the app sound like it is grieving on your behalf over
 * nothing.
 */
const MOURN_FROM = 3;

const LOSS_KEY = 'bible-journey/streak-lost';
const readLoss = (): string | null => {
  try {
    return localStorage.getItem(LOSS_KEY);
  } catch {
    return null;
  }
};
const writeLoss = (key: string): void => {
  try {
    localStorage.setItem(LOSS_KEY, key);
  } catch {
    /* A private window cannot remember, and will say it twice. Harmless. */
  }
};

/**
 * The two lines that can open the day's card: the streak at risk tonight, and a
 * streak that has ended. Shared by the today card and the mix card, so whichever
 * kind of plan somebody is on, the app says the same thing about their streak.
 */
export function TodayAlerts() {
  const { derived } = useStore();
  const { risk } = useReminder();

  /*
   * What a streak was, said once, when it is gone. Keyed by the run and the day
   * it ended, so a second break is mourned again but the same one never is.
   * Device-local: telling you on your laptop and again on your phone is a small
   * redundancy, and putting it in the journal would mean a `normalize()` entry
   * for a string nothing else needs.
   */
  const { current, lastRun, lastReadDay } = derived.streak;
  const lost = current === 0 && lastRun >= MOURN_FROM && lastReadDay ? lastRun : null;
  const lossKey = lost ? `${lastReadDay}|${lost}` : null;
  const [mourn, setMourn] = useState<number | null>(null);
  useEffect(() => {
    if (!lossKey || !lost) {
      setMourn(null);
      return;
    }
    if (readLoss() === lossKey) return;
    setMourn(lost);
    writeLoss(lossKey);
  }, [lossKey, lost]);

  return (
    <>
      {/*
        One line, and it escalates: `streakRisk` decides the wording from the
        clock and from whether a rest day is in hand. The tone is an attribute
        rather than three components, so the copy and the colour cannot drift
        apart.
      */}
      {risk && (
        <p className="riskNote" data-level={risk.level}>
          <Flame size={14} />
          {risk.text}
        </p>
      )}

      {/*
        A broken streak used to become "No active streak" in the hero and
        nothing else: twelve days gone without a word. This says it once, plainly
        and without ceremony, and then never again.
      */}
      {mourn !== null && (
        <p className="lossNote">Your {mourn} day streak ended. Today starts a new one.</p>
      )}
    </>
  );
}
