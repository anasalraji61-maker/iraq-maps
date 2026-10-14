import { Component, type ErrorInfo, type ReactNode } from 'react';
import type { ErrorReporter } from '@iraq-maps/observability';

interface Props {
  children: ReactNode;
  /** Optional fallback UI — receives the error that was caught. */
  fallback?: (err: Error) => ReactNode;
  /** Optional reporter — if provided, exceptions are forwarded to it. */
  reporter?: ErrorReporter;
}

interface State {
  error: Error | null;
}

/**
 * React error boundary that catches render-phase errors.
 * Reports to an optional ErrorReporter and shows a fallback when provided.
 */
export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  override componentDidCatch(error: Error, info: ErrorInfo) {
    this.props.reporter?.captureException(error, {
      componentStack: info.componentStack ?? undefined,
    });
  }

  override render() {
    if (this.state.error) {
      return this.props.fallback?.(this.state.error) ?? null;
    }
    return this.props.children;
  }
}
