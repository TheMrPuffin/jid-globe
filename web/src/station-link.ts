// The "Set station" link, on the pages that add JIDs. It is there only when the address
// doesn't already name a station. It asks for a name in a pop-up and reopens the page with
// ?station=<name> added, which is what tags every JID saved from this machine (see station.ts).
import { byId } from './dom';
import { ask } from './passcode-dialog';
import { currentStation, parseStation } from './station';

export function setupStationLink(): void {
  const link = byId<HTMLButtonElement>('station-link');
  link.hidden = currentStation() !== null;

  link.addEventListener('click', () => {
    ask({
      title: 'Set station',
      hint: 'A name for this machine, such as PC01. Every JID added from here will be tagged with it.',
      secret: false,
      confirm: 'Set',
      maxLength: 30,
      accept(name) {
        // Run it through the same tidying the page will apply when it reads the address.
        const station = parseStation(`?${new URLSearchParams({ station: name })}`);
        if (!station) throw new Error('Type a name for this machine.');
        const address = new URLSearchParams(window.location.search);
        address.set('station', station);
        window.location.assign(`${window.location.pathname}?${address}`);
      },
    });
  });
}
