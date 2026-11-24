import { Component, type ErrorInfo, type ReactNode } from "react";

interface SurfaceErrorBoundaryProps {
  surfaceLabel: string;
  onNavigateHome?: () => void;
  children: ReactNode;
}

interface SurfaceErrorBoundaryState {
  hasError: boolean;
  errorMessage: string;
}

/**
 * Catches render errors inside a single workspace surface so one broken view
 * cannot white-screen the whole app. Offers retry and return-home recovery.
 */
class SurfaceErrorBoundary extends Component<SurfaceErrorBoundaryProps, SurfaceErrorBoundaryState> {
  state: SurfaceErrorBoundaryState = { hasError: false, errorMessage: "" };

  static getDerivedStateFromError(error: unknown): SurfaceErrorBoundaryState {
    return {
      hasError: true,
      errorMessage: error instanceof Error ? error.message : "Unknown render error",
    };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error(`SpaceViewer surface crashed (${this.props.surfaceLabel})`, error, info.componentStack);
  }

  handleRetry = () => {
    this.setState({ hasError: false, errorMessage: "" });
  };

  handleHome = () => {
    this.setState({ hasError: false, errorMessage: "" });
    this.props.onNavigateHome?.();
  };

  render() {
    if (!this.state.hasError) {
      return this.props.children;
    }

    return (
      <div className="surface-error" role="alert">
        <div className="surface-error__card">
          <p className="eyebrow">WORKSPACE ERROR</p>
          <h2>{this.props.surfaceLabel} hit a problem</h2>
          <p className="surface-error__message">
            Something went wrong while rendering this workspace. Your saved collections, notes, and bookmarks are not
            affected.
          </p>
          <p className="surface-error__detail">{this.state.errorMessage}</p>
          <div className="surface-error__actions">
            <button type="button" onClick={this.handleRetry}>
              Try again
            </button>
            {this.props.onNavigateHome ? (
              <button type="button" className="ghost" onClick={this.handleHome}>
                Back to Home
              </button>
            ) : null}
          </div>
        </div>
      </div>
    );
  }
}

export default SurfaceErrorBoundary;
