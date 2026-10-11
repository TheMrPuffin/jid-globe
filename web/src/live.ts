// Live sync: listens to the server's event stream so other devices' pins show up here.
import { fetchPins, type Pin } from './api';
import { byId } from './dom';
import { store } from './store';

/** `onPinAdded` is called for each entry that arrives while the page is open (not for the first load). */
export function startLiveSync(onPinAdded: (pin: Pin) => void): void {
  const badge = byId('live');
  const setState = (state: 'live' | 'connecting', text: string) => {
    badge.dataset.state = state;
    badge.textContent = text;
  };

  // EventSource reconnects by itself if the Wi-Fi drops or the server restarts.
  const source = new EventSource('/api/events');

  // On every (re)connect, reload the full list in case events were missed while offline.
  source.addEventListener('open', async () => {
    setState('live', 'Live');
    let pins: Pin[];
    try {
      pins = await fetchPins();
    } catch {
      return; // The next reconnect will try again.
    }
    store.replaceAll(pins);
  });

  source.addEventListener('error', () => setState('connecting', 'Reconnecting…'));
  source.addEventListener('pin-added', (event) => {
    const pin = JSON.parse(event.data) as Pin;
    store.add(pin);
    onPinAdded(pin);
  });
  source.addEventListener('pins-moved', (event) => store.update(JSON.parse(event.data) as Pin[]));
  source.addEventListener('pin-deleted', (event) => store.remove((JSON.parse(event.data) as { id: string }).id));
}
