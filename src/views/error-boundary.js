import { Component } from "react";

import { initState } from "../actions/init";

// Failure UI shared with src/index.js, which needs it before the boundary can
// mount (a failed initState means there is no app tree to catch errors in).
export const ErrorFallback = ({ error, onRetry }) => (
  <div className="error-boundary">
    <h2>Something went wrong</h2>
    <p>{error?.message || String(error)}</p>
    <button className="btn" onClick={onRetry} type="button">
      Try again
    </button>
  </div>
);

export class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, errorInfo) {
    console.error("ErrorBoundary caught an error:", error, errorInfo);
  }

  handleRetry = async () => {
    try {
      await initState();
      this.setState({ error: null });
    } catch (error) {
      // Keep the fallback UI showing the current failure instead of leaving an
      // unhandled rejection and a seemingly dead button.
      console.error("filter-bubble: initState() failed:", error);
      this.setState({ error });
    }
  };

  render() {
    if (this.state.error) {
      return (
        <ErrorFallback error={this.state.error} onRetry={this.handleRetry} />
      );
    }
    return this.props.children;
  }
}
