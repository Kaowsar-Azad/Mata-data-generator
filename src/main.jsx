import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'

window.onerror = function(message, source, lineno, colno, error) {
  console.error("GLOBAL ERROR:", message, error);
  alert("REACT CRASH: " + message + "\n\n" + (error ? error.stack : ''));
};
window.addEventListener('unhandledrejection', function(event) {
  console.error("UNHANDLED PROMISE:", event.reason);
  alert("PROMISE CRASH: " + event.reason);
});

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
