import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '@fontsource/ibm-plex-sans/400.css';
import '@fontsource/ibm-plex-sans/500.css';
import '@fontsource/ibm-plex-sans/600.css';
import '@fontsource/ibm-plex-sans/700.css';
import '@fontsource/ibm-plex-mono/400.css';
import '@fontsource/ibm-plex-mono/500.css';
import '@fontsource/ibm-plex-mono/600.css';
import './styles.css';
import { JoinPage, Landing } from './Entry';
import HostApp from './Host';
import PlayerApp from './Player';

function App() {
  const p = window.location.pathname.replace(/\/+$/, '') || '/';
  if (p === '/host') return <HostApp />;
  if (p === '/play') return <PlayerApp />;
  if (p === '/join') return <JoinPage />;
  return <Landing />;
}

createRoot(document.getElementById('root')!).render(<StrictMode><App /></StrictMode>);
