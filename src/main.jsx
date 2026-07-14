import React from 'react'
import { createRoot } from 'react-dom/client'
import App from './supreme_layout.jsx'
import { GlobalPlayerProvider } from './providers/GlobalPlayerProvider.jsx'
import { ToastProvider } from './providers/ToastProvider.jsx'
import ToastLayer from './components/ToastLayer.jsx'

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
  <ErrorBoundary>
    <ToastProvider>
      <GlobalPlayerProvider>
        <App />
        <ToastLayer />
      </GlobalPlayerProvider>
    </ToastProvider>
  </ErrorBoundary>
)

