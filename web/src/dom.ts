// Tiny helpers for working with the page.

/** Finds an element by id, failing loudly if index.html and the code disagree. */
export function byId<T extends HTMLElement = HTMLElement>(id: string): T {
  const element = document.getElementById(id);
  if (!element) throw new Error(`Missing element #${id}`);
  return element as T;
}

/** Creates an element with optional class and text (text is never treated as HTML). */
export function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className = '',
  text = '',
): HTMLElementTagNameMap[K] {
  const element = document.createElement(tag);
  if (className) element.className = className;
  if (text) element.textContent = text;
  return element;
}

/** Shows a message in a <p>, or hides it when the text is empty/null. */
export function setMessage(element: HTMLElement, text: string | null): void {
  element.textContent = text ?? '';
  element.hidden = !text;
}

/**
 * Makes `list` contain exactly `wanted`, in that order, touching as little as possible:
 * elements already in the right place are left where they are. (So adding one row to a
 * long list is one small change, not a rebuild.)
 */
export function arrange(list: HTMLElement, wanted: HTMLElement[]): void {
  let current = list.firstElementChild;
  for (const element of wanted) {
    if (element === current) current = current.nextElementSibling;
    else list.insertBefore(element, current);
  }
  while (current) {
    const next = current.nextElementSibling;
    current.remove();
    current = next;
  }
}
