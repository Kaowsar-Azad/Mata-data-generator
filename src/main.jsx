import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'
import { ErrorBoundary } from './components/common/ErrorBoundary'

window.onerror = function(message, source, lineno, colno, error) {
  console.error("[Global Error Caught]:", message, { source, lineno, colno, error });
};
window.addEventListener('unhandledrejection', function(event) {
  console.error("[Unhandled Promise Rejection]:", event.reason);
});

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <ErrorBoundary isGlobal={true} name="Application">
      <App />
    </ErrorBoundary>
  </StrictMode>,
)
