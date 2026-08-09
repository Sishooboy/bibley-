import { Component, type ErrorInfo, type ReactNode } from 'react';

type Props = {
  children: ReactNode;
  /** Named in the message, so "the Stats screen" beats "something". */
  what?: string;
};

type State = { error: Error | null };

/**
 * Catches a render that throws, so it costs a panel rather than the whole app.
 *
 * Without one, React unmounts the entire tree on any error thrown while
 * rendering and leaves a white page, which looks exactly like lost data. Nothing
 * is lost: the journal is in localStorage and on the server before any of this
 * paints. The panel exists mostly to say so.
 *
 * A class, because `getDerivedStateFromError` has no hook equivalent. It is the
 * one component in the app that has to be one.
 */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    // The stack is the only record of what happened, and it is gone on reload.
    console.error('Bibley could not render through an error.', error, info.componentStack);
  }

  render(): ReactNode {
    const { error } = this.state;
    if (!error) return this.props.children;

    return (
      <div className="crash" role="alert">
        <div className="crash__inner">
          <p className="eyebrow">Something broke</p>
          <h2 className="crash__title">
            {this.props.what ? `${this.props.what} stopped drawing` : 'Bibley stopped drawing'}
          </h2>
          <p className="crash__body">
            Your reading is safe. Every chapter you have marked is saved on this device and against
            your account, and none of it goes through this screen.
          </p>

          <div className="crash__actions">
            <button
              type="button"
              className="btn btn--sm btn--primary"
              onClick={() => window.location.reload()}
            >
              Reload Bibley
            </button>
            {/* Clearing the error retries the same render, which is worth one
                go: a transient failure recovers without losing the session. */}
            <button
              type="button"
              className="btn btn--sm"
              onClick={() => this.setState({ error: null })}
            >
              Try again
            </button>
          </div>

          <details className="crash__detail">
            <summary>What went wrong</summary>
            <pre>{error.message || String(error)}</pre>
          </details>
        </div>
      </div>
    );
  }
}
