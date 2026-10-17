import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './app/App';
import { refresh as refreshFriends, uploadSave } from './app/friends';
import { store } from './app/store';
import './ui/styles/app.css';
import './ui/styles/screens.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

// Test hook: automated UI tests can drive the store when the page is opened with ?debug=1.
if (new URLSearchParams(window.location.search).has('debug')) (window as unknown as { pushLegends: typeof store }).pushLegends = store;

// Logged in: check for friend requests and duels, and back the save up to the cloud now and then.
void refreshFriends(true);
window.setInterval(() => {
  if (document.hidden) return;
  void refreshFriends();
  void uploadSave();
}, 60_000);
document.addEventListener('visibilitychange', () => {
  if (document.hidden) void uploadSave();
});
