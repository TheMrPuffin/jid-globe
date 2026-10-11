// Wraps a function so that, however often it is called while the globe is moving,
// the real work only happens once things have been still for `settleMs`
// (or, during a long continuous movement, at most every `maxWaitMs`).
export function waitUntilSettled<Args extends unknown[]>(
  work: (...args: Args) => void,
  settleMs: number,
  maxWaitMs: number,
): (...args: Args) => void {
  let timer: number | undefined;
  let waitingSince = 0;

  return (...args) => {
    window.clearTimeout(timer);
    const now = performance.now();
    if (!waitingSince) waitingSince = now;
    const run = () => {
      waitingSince = 0;
      work(...args);
    };
    if (now - waitingSince >= maxWaitMs) run();
    else timer = window.setTimeout(run, settleMs);
  };
}
