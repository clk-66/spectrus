import { Component, type ReactNode, type ErrorInfo } from 'react';

interface Props {
  children: ReactNode;
}

interface State {
  error: Error | null;
}

/**
 * Catches render-time errors in the component subtree and displays a
 * fallback UI instead of leaving a blank page. The error is also logged
 * to the console so it shows up in DevTools even without React DevTools.
 */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error('[ErrorBoundary] Render error:', error.message);
    console.error('[ErrorBoundary] Component stack:', info.componentStack);
  }

  render(): ReactNode {
    if (this.state.error) {
      return (
        <div style={{ padding: '2rem', fontFamily: 'monospace', color: '#f87171' }}>
          <strong>Render error — check the browser console for details.</strong>
          <pre style={{ marginTop: '1rem', whiteSpace: 'pre-wrap', fontSize: '0.85em' }}>
            {this.state.error.message}
          </pre>
        </div>
      );
    }
    return this.props.children;
  }
}
