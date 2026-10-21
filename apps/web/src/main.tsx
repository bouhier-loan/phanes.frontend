import './trusted-types';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './app.css';
import './pages.css';
import { AuthGate } from './auth/AuthGate';
import { App } from './ui/App';

const container = document.getElementById('root');
if (!container) throw new Error('Missing #root element');

createRoot(container).render(
  <StrictMode>
    <AuthGate>
      <App />
    </AuthGate>
  </StrictMode>,
);
