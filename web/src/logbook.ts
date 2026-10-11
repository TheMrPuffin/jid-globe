// The logbook: one row per JID, most recently entered first, with a filter box and
// passcode-protected move and delete. A JID entered more than once gets a "×3" count on its row.
import { asAdmin, isUnlocked, lock, onAdminChange, unlock } from './admin';
import { ApiError, deletePin, type Pin } from './api';
import { countryFor } from './countries';
import { arrange, byId, el, setMessage } from './dom';
import { groupByJid, type JidGroup } from './entries';
import { regionColor, regionFor } from './regions';
import { stationOf, stationsInUse } from './station';

interface LogbookOptions {
  onSelect(pin: Pin): void;
  /** The Move button was pressed on this JID's row. */
  onMove(pin: Pin): void;
  onDeleted(id: string): void;
  /**
   * Called whenever the filter box changes what is listed. `shownJids` is the JIDs still
   * listed, or null when the filter box is empty (everything is listed).
   */
  onFilter(shownJids: Set<string> | null, totalJids: number): void;
}

/** A row that has been built, plus a summary of what it shows, used to tell whether it has changed. */
interface BuiltRow {
  contents: string;
  element: HTMLLIElement;
}

export function setupLogbook(options: LogbookOptions) {
  const filterInput = byId<HTMLInputElement>('filter');
  const list = byId('log-list');
  const empty = byId('log-empty');
  let groups: JidGroup[] = [];
  let labelsInUse = false; // whether any entry has a station label (see station.ts)
  let builtRows = new Map<string, BuiltRow>(); // the rows made so far, by JID

  filterInput.addEventListener('input', render);

  // ---- Admin lock ----------------------------------------------------------
  // Move and Delete are only shown while this device is unlocked (see admin.ts).
  const section = byId('logbook');
  const adminButton = byId<HTMLButtonElement>('admin-toggle');

  function showAdminState(): void {
    const unlocked = isUnlocked();
    section.classList.toggle('admin-locked', !unlocked);
    adminButton.classList.toggle('active', unlocked);
    adminButton.textContent = unlocked ? 'Lock admin' : 'Admin';
    adminButton.title = unlocked
      ? 'Hide Move and Delete again on this device'
      : 'Enter the admin passcode to show Move and Delete';
  }

  adminButton.addEventListener('click', () => (isUnlocked() ? lock() : unlock()));
  onAdminChange(showAdminState);
  showAdminState();

  function render(): void {
    const words = filterInput.value.toLowerCase().split(/\s+/).filter(Boolean);
    const shown = groups.filter((group) => {
      const text = searchText(group);
      return words.every((word) => text.includes(word));
    });
    options.onFilter(words.length > 0 ? new Set(shown.map((group) => group.jid)) : null, groups.length);

    // Rows are kept from one update to the next and only rebuilt when their JID changes,
    // so a new entry costs one row instead of the whole list.
    const stillUsed = new Map<string, BuiltRow>();
    const wanted = shown.map((group) => {
      const contents =
        `${labelsInUse}|` + group.entries.map((entry) => `${entry.id}:${entry.city ?? ''}:${entry.lat},${entry.lng}`).join('|');
      const before = builtRows.get(group.jid);
      const built = before?.contents === contents ? before : { contents, element: row(group) };
      stillUsed.set(group.jid, built);
      return built.element;
    });
    // Rows that are filtered out are kept too, so clearing the filter is instant.
    for (const group of groups) {
      const built = builtRows.get(group.jid);
      if (built && !stillUsed.has(group.jid)) stillUsed.set(group.jid, built);
    }
    builtRows = stillUsed;
    arrange(list, wanted);
    setMessage(
      empty,
      shown.length > 0 ? null : groups.length === 0 ? 'No JIDs yet. Add the first one above!' : 'Nothing matches the filter.',
    );
  }

  function row(group: JidGroup): HTMLLIElement {
    const { jid, entries } = group;
    const newest = entries[0];
    const item = el('li');
    // Remember every entry behind this row, so tapping a pin on the globe can find it.
    item.dataset.ids = entries.map((entry) => entry.id).join(' ');

    const main = el('button', 'log-row');
    main.type = 'button';
    const dot = el('span', 'dot');
    dot.style.background = regionColor(jid[0]);

    const title = el('strong', '', jid);
    if (entries.length > 1) {
      const count = el('span', 'log-count', `×${entries.length}`);
      count.title = `Entered ${entries.length} times`;
      title.append(count);
    }

    const text = el('span', 'log-text');
    text.append(title, el('span', '', placeText(newest)));
    for (const note of unique(entries.map((entry) => entry.note))) text.append(el('span', '', `“${note}”`));
    // Entries are newest first, so the first time it was seen is the last one in the list.
    // Each line also says which machine entered it (set with ?station=... in the address),
    // once labels are in use; an entry without one then counts as "Unknown".
    const oldest = entries[entries.length - 1];
    const seen = (entry: Pin) => timeText(entry.created_at) + (labelsInUse ? ` by ${stationOf(entry)}` : '');
    text.append(el('span', '', `First seen ${seen(oldest)}`));
    if (entries.length > 1) text.append(el('span', '', `Last seen ${seen(newest)}`));

    main.append(dot, text);
    main.addEventListener('click', () => options.onSelect(newest));

    const move = el('button', 'log-action', 'Move');
    move.type = 'button';
    move.setAttribute('aria-label', `Move ${jid} to a different place`);
    move.addEventListener('click', () => options.onMove(newest));

    const actions = el('span', 'log-actions');
    actions.append(move, deleteButton(group));
    item.append(main, actions);
    return item;
  }

  // First tap asks "Sure?", second tap (within 4 seconds) deletes.
  // On a JID entered several times this removes the most recent entry, taking the count down by one.
  function deleteButton(group: JidGroup): HTMLButtonElement {
    const several = group.entries.length > 1;
    const idleText = several ? 'Delete 1' : 'Delete';
    const button = el('button', 'log-action', idleText);
    button.type = 'button';
    button.setAttribute('aria-label', several ? `Delete the latest entry of ${group.jid}` : `Delete ${group.jid}`);
    let resetTimer: number | undefined;

    button.addEventListener('click', async () => {
      if (!button.classList.contains('confirm')) {
        button.classList.add('confirm');
        button.textContent = 'Sure?';
        resetTimer = window.setTimeout(() => {
          button.classList.remove('confirm');
          button.textContent = idleText;
        }, 4000);
        return;
      }
      window.clearTimeout(resetTimer);
      button.disabled = true;
      await removePin(group.entries[0]);
      button.disabled = false;
      button.classList.remove('confirm');
      button.textContent = idleText;
    });
    return button;
  }

  async function removePin(pin: Pin): Promise<void> {
    try {
      await asAdmin(async () => {
        await deletePin(pin.id);
        options.onDeleted(pin.id);
      });
    } catch (error) {
      // Someone else already deleted it: just make it disappear here too.
      if (error instanceof ApiError && error.status === 404) return options.onDeleted(pin.id);
      window.alert(error instanceof Error ? error.message : 'Could not delete the pin.');
    }
  }

  return {
    setPins(pins: Pin[]): void {
      groups = groupByJid(pins);
      labelsInUse = stationsInUse(pins);
      render();
    },
    /** Empties the filter box, so everything is listed (and shown on the globe) again. */
    clearFilter(): void {
      filterInput.value = '';
      render();
    },
    /** Scrolls to the rows for these pins and flashes them (used when a pin on the globe is tapped). */
    reveal(ids: string[], scroll = true): void {
      const items = [...list.children].filter((child) => {
        const rowIds = ((child as HTMLElement).dataset.ids ?? '').split(' ');
        return rowIds.some((id) => ids.includes(id));
      });
      // (Not when announcing someone else's new pin: that would move the list under your finger.)
      if (scroll) items[0]?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
      for (const item of items) {
        item.classList.add('flash');
        window.setTimeout(() => item.classList.remove('flash'), 2000);
      }
    },
  };
}

/** The different non-empty values, in the order they first appear. */
function unique(values: (string | null)[]): string[] {
  return [...new Set(values.filter((value): value is string => Boolean(value)))];
}

function placeText(pin: Pin): string {
  const country = countryFor(pin.jid.slice(1, 3))?.name ?? pin.jid.slice(1, 3);
  return [pin.city, country].filter(Boolean).join(', ');
}

function searchText(group: JidGroup): string {
  const parts = group.entries.flatMap((entry) => [placeText(entry), entry.note, stationOf(entry)]);
  // The region's name is included too, so typing "european" or "africa" works.
  const region = regionFor(group.jid[0])?.name;
  return [group.jid, region, ...parts].filter(Boolean).join(' ').toLowerCase();
}

function timeText(iso: string): string {
  return new Date(iso).toLocaleString([], { weekday: 'short', hour: '2-digit', minute: '2-digit' });
}
