import React, { Component } from 'react';
import { AlertTriangle, RefreshCw, Home, ChevronDown, ChevronUp } from 'lucide-react';

export class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { 
      hasError: false, 
      error: null, 
      errorInfo: null,
      showDetails: false 
    };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    this.setState({ errorInfo });
    console.error(`[ErrorBoundary] Caught error in ${this.props.name || 'Component'}:`, error, errorInfo);
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null, errorInfo: null });
    if (this.props.onReset) {
      this.props.onReset();
    }
  };

  handleReload = () => {
    window.location.reload();
  };

  render() {
    if (this.state.hasError) {
      const isGlobal = this.props.isGlobal;
      return (
        <div style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '2.5rem 1.5rem',
          height: isGlobal ? '100vh' : '100%',
          width: '100%',
          boxSizing: 'border-box',
          background: isGlobal ? 'var(--bg, #0b0f19)' : 'rgba(239, 68, 68, 0.03)',
          borderRadius: isGlobal ? 0 : '1rem',
          border: isGlobal ? 'none' : '1px solid rgba(239, 68, 68, 0.2)',
          textAlign: 'center'
        }}>
          <div style={{
            width: '3.5rem',
            height: '3.5rem',
            borderRadius: '50%',
            background: 'rgba(239, 68, 68, 0.12)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            marginBottom: '1.25rem',
            color: 'var(--danger, #ef4444)'
          }}>
            <AlertTriangle style={{ width: '1.8rem', height: '1.8rem' }} />
          </div>

          <h2 style={{
            fontSize: isGlobal ? '1.3rem' : '1.1rem',
            fontWeight: 700,
            color: 'var(--text-1, #f8fafc)',
            margin: '0 0 0.5rem 0'
          }}>
            {this.props.name ? `${this.props.name} encountered an unexpected issue` : 'Something went wrong'}
          </h2>

          <p style={{
            fontSize: '0.85rem',
            color: 'var(--text-2, #94a3b8)',
            maxWidth: '480px',
            lineHeight: 1.5,
            margin: '0 0 1.5rem 0'
          }}>
            The application intercepted the error safely to prevent crashing. You can recover this section without losing other work.
          </p>

          <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', justifyContent: 'center' }}>
            <button
              onClick={this.handleReset}
              className="btn-primary"
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.45rem',
                padding: '0.55rem 1.25rem',
                fontSize: '0.82rem',
                fontWeight: 600,
                borderRadius: '0.5rem',
                cursor: 'pointer'
              }}
            >
              <RefreshCw style={{ width: '0.9rem', height: '0.9rem' }} /> Try Again
            </button>

            {isGlobal && (
              <button
                onClick={this.handleReload}
                className="btn-outline"
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.45rem',
                  padding: '0.55rem 1.25rem',
                  fontSize: '0.82rem',
                  fontWeight: 600,
                  borderRadius: '0.5rem',
                  cursor: 'pointer'
                }}
              >
                <Home style={{ width: '0.9rem', height: '0.9rem' }} /> Reload App
              </button>
            )}
          </div>

          {/* Collapsible Error Diagnostics */}
          <div style={{ marginTop: '1.5rem', maxWidth: '600px', width: '100%', textAlign: 'left' }}>
            <button
              onClick={() => this.setState(prev => ({ showDetails: !prev.showDetails }))}
              style={{
                background: 'none',
                border: 'none',
                color: 'var(--text-3, #64748b)',
                fontSize: '0.72rem',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '0.3rem',
                padding: '0.25rem 0'
              }}
            >
              {this.state.showDetails ? <ChevronUp style={{ width: '0.8rem', height: '0.8rem' }} /> : <ChevronDown style={{ width: '0.8rem', height: '0.8rem' }} />}
              {this.state.showDetails ? 'Hide Diagnostics' : 'Show Error Details'}
            </button>

            {this.state.showDetails && (
              <pre style={{
                marginTop: '0.5rem',
                padding: '0.75rem 1rem',
                background: 'rgba(0, 0, 0, 0.4)',
                borderRadius: '0.5rem',
                border: '1px solid rgba(255, 255, 255, 0.08)',
                color: '#fca5a5',
                fontSize: '0.72rem',
                fontFamily: 'monospace',
                overflowX: 'auto',
                whiteSpace: 'pre-wrap',
                wordBreak: 'break-all',
                maxHeight: '180px'
              }}>
                {this.state.error?.toString()}
                {this.state.errorInfo?.componentStack}
              </pre>
            )}
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
export default ErrorBoundary;
