import { useEffect, useState } from 'react';
import { today, type DayKey } from './dates';

/*
 * Today's date, kept current while the app is open.
 *
 * Most screens never needed this: the next chapter of an order does not depend
 * on the date. The mix does, since its psalm and proverb move at midnight, and a
 * phone left on the bedside table overnight would otherwise show yesterday's.
 * A minute check rather than one timer set for midnight, because a timer set
 * for eight hours ahead on a phone that sleeps fires whenever it likes; and a
 * check on becoming visible, because a backgrounded tab's timers barely run at
 * all. Setting the same string again is a no-op, so the other 1,439 checks a
 * day cost nothing.
 */
export function useToday(): DayKey {
  const [day, setDay] = useState(today);
  useEffect(() => {
    const check = () => setDay(today());
    const timer = setInterval(check, 60_000);
    document.addEventListener('visibilitychange', check);
    return () => {
      clearInterval(timer);
      document.removeEventListener('visibilitychange', check);
    };
  }, []);
  return day;
}
