import React from 'react'
import { createRoot } from 'react-dom/client'
import App from './supreme_layout.jsx'
import { ToastProvider } from './providers/ToastProvider.jsx'
import ToastLayer from './components/ToastLayer.jsx'

// Global Frontend Error Handling
if (window.electronLog) {
  window.addEventListener('error', (event) => {
    window.electronLog.write('error', `[Renderer] Uncaught Error: ${event.message}`, {
      filename: event.filename,
      lineno: event.lineno,
      colno: event.colno,
      stack: event.error?.stack
    });
  });

  window.addEventListener('unhandledrejection', (event) => {
    window.electronLog.write('error', `[Renderer] Unhandled Promise Rejection`, {
      reason: event.reason?.stack || event.reason
    });
  });

  // Long Task Detection
  try {
    const observer = new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        if (entry.duration > 100) {
          window.electronLog.write('warn', `[Renderer] Long Task Detected: ${entry.duration.toFixed(2)}ms`, {
            name: entry.name,
            entryType: entry.entryType
          });
        }
      }
    });
    observer.observe({ entryTypes: ['longtask'] });
  } catch (e) {
    // longtask might not be supported in all environments
  }
}

class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }
  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }
  componentDidCatch(error, errorInfo) {
    console.error("ErrorBoundary caught an error", error, errorInfo);
    if (window.electronLog) {
      window.electronLog.write('error', `[Renderer] ErrorBoundary caught error: ${error.toString()}`, {
        stack: error.stack,
        componentStack: errorInfo.componentStack
      });
    }
  }
  render() {
    if (this.state.hasError) {
      return (
        <div style={{ padding: 20, color: 'white', backgroundColor: 'red', minHeight: '100vh' }}>
          <h2>Something went wrong.</h2>
          <pre>{this.state.error.toString()}</pre>
        </div>
      );
    }
    return this.props.children;
  }
}

const root = createRoot(document.getElementById('root'))
root.render(
  <React.StrictMode>
    <ErrorBoundary>
      <ToastProvider>
        <App />
        <ToastLayer />
      </ToastProvider>
    </ErrorBoundary>
  </React.StrictMode>
)
