import { QUOTE_TRANSLATION } from '../data/quotes';
import { formatDay, today } from '../lib/dates';
import { quoteForDay } from '../lib/quote';
import { SourceLine } from './Sources';

export function QuoteCard() {
  const day = today();
  const quote = quoteForDay(day);

  return (
    <section className="panel panel--quote" aria-label="Verse of the day">
      <div>
        <p className="eyebrow eyebrow--onDark">Verse of the day</p>
        <blockquote className="quote__text">
          <span className="quote__mark" aria-hidden="true">
            “
          </span>
          {quote.text}
        </blockquote>
        <p className="quote__context">{quote.context}</p>
        <SourceLine sources={quote.sources} />
      </div>
      <div className="quote__ref">
        <b>
          {quote.ref} <span className="quote__translation">{QUOTE_TRANSLATION}</span>
        </b>
        <span>{formatDay(day, { weekday: 'short' })}</span>
      </div>
    </section>
  );
}
