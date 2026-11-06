import { Component, type ErrorInfo, type ReactNode } from "react";

interface Props {
  children: ReactNode;
}

interface State {
  error: Error | null;
}

export default class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("Uncaught error:", error, info);
  }

  reset = () => {
    this.setState({ error: null });
  };

  render() {
    if (!this.state.error) return this.props.children;

    return (
      <div className="flex min-h-screen items-center justify-center bg-background px-4">
        <div className="w-full max-w-md rounded-md border border-border bg-card p-8 text-center">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-danger/10 text-2xl text-danger">
            ⚠️
          </div>
          <h1 className="mb-2 text-lg font-semibold text-foreground">
            Something went sideways
          </h1>
          <p className="mb-6 text-sm text-muted-foreground">
            Antroph hit a snag. Reload the page — if it keeps happening, try
            signing out and back in.
          </p>
          <div className="flex gap-2">
            <button
              onClick={this.reset}
              className="flex-1 rounded-md border border-border bg-background py-2.5 text-sm text-muted-foreground hover:border-muted-foreground/40"
            >
              Try again
            </button>
            <button
              onClick={() => window.location.reload()}
              className="flex-1 rounded-md border border-border bg-background py-2.5 text-sm font-medium text-foreground hover:border-muted-foreground/40 hover:bg-accent"
            >
              Reload page
            </button>
          </div>
        </div>
      </div>
    );
  }
}
