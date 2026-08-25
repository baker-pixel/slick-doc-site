import { Component, type ReactNode } from "react";

interface Props {
  children: ReactNode;
  /** "inline" fits inside an existing layout (e.g. a portal tab) instead of taking over the viewport. */
  variant?: "full" | "inline";
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: { componentStack: string }) {
    console.error("Uncaught error:", error, info.componentStack);

    // Stale-deploy recovery: after a new deploy the old chunk files 404.
    // Reload once to pick up the fresh index.html; the sessionStorage guard
    // prevents a reload loop if the error persists.
    const isChunkError = /Failed to fetch dynamically imported module|Importing a module script failed|error loading dynamically imported module|ChunkLoadError/i.test(
      error.message
    );
    if (isChunkError && !sessionStorage.getItem("chunk_reload_attempted")) {
      sessionStorage.setItem("chunk_reload_attempted", "1");
      window.location.reload();
    }
  }

  render() {
    if (this.state.hasError) {
      const isInline = this.props.variant === "inline";
      return (
        <div
          className={
            isInline
              ? "flex items-center justify-center py-16 px-4"
              : "min-h-screen flex items-center justify-center bg-background p-4"
          }
        >
          <div className="text-center max-w-md">
            <h1 className="text-2xl font-semibold text-foreground mb-2">Something went wrong</h1>
            <p className="text-muted-foreground mb-6 text-sm">
              {isInline
                ? "This section hit an error. Try another tab, or refresh the page if it keeps happening."
                : "An unexpected error occurred. Please refresh the page."}
            </p>
            <button
              onClick={() => window.location.reload()}
              className="px-4 py-2 bg-primary text-primary-foreground rounded-md text-sm hover:opacity-90 transition-opacity"
            >
              Refresh Page
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
