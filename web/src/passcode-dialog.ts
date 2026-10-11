// The app's small pop-up for typing one thing in: a passcode (with the typing hidden,
// shown as dots) or a piece of text such as a station name. It is built here in code,
// rather than in each page's HTML, so every page gets the same one.
import { el } from './dom';

interface AskOptions {
  title: string;
  /** A line of explanation under the title. */
  hint?: string;
  /** True to hide what is typed. */
  secret: boolean;
  /** The wording on the confirm button. */
  confirm: string;
  maxLength?: number;
  /**
   * Given what was typed. It should throw an Error if that is no good; the message is
   * shown in the pop-up and the person can try again.
   */
  accept(value: string): Promise<void> | void;
}

/** Shows the pop-up. Returns true once something has been accepted, or false if it is cancelled. */
export function ask(options: AskOptions): Promise<boolean> {
  return new Promise((resolve) => {
    const dialog = el('dialog', 'passcode-dialog');
    const form = el('form');
    const input = el('input');
    input.type = options.secret ? 'password' : 'text';
    input.autocomplete = 'off';
    input.spellcheck = false;
    if (options.maxLength) input.maxLength = options.maxLength;
    input.setAttribute('aria-label', options.title);
    const error = el('p', 'message error');
    error.hidden = true;
    const cancel = el('button', 'secondary', 'Cancel');
    cancel.type = 'button';
    const submit = el('button', '', options.confirm);
    submit.type = 'submit';
    const buttons = el('div', 'passcode-buttons');
    buttons.append(cancel, submit);
    form.append(el('h2', '', options.title));
    if (options.hint) form.append(el('p', 'message hint ask-hint', options.hint));
    form.append(input, error, buttons);
    dialog.append(form);

    let accepted = false;

    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      if (!input.value) return;
      submit.disabled = true;
      try {
        await options.accept(input.value);
        accepted = true;
        dialog.close();
      } catch (problem) {
        error.textContent = problem instanceof Error ? problem.message : 'That did not work.';
        error.hidden = false;
        input.select();
      } finally {
        submit.disabled = false;
      }
    });

    cancel.addEventListener('click', () => dialog.close());
    // Runs however the pop-up closes: the confirm button, Cancel, or the Escape key.
    dialog.addEventListener('close', () => {
      dialog.remove();
      resolve(accepted);
    });

    document.body.append(dialog);
    dialog.showModal();
    input.focus();
  });
}

/**
 * Asks for a passcode and hands it to `tryPasscode`, which should throw if it is wrong.
 * Returns true once a passcode has been accepted, or false if they cancel.
 */
export function askPasscode(title: string, tryPasscode: (passcode: string) => Promise<void>): Promise<boolean> {
  return ask({ title, secret: true, confirm: 'Unlock', accept: tryPasscode });
}
