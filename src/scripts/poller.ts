interface PollOptions {
  enabled: () => boolean;
  onError: (error: unknown) => void;
  interval?: number;
}

export function createPoller(task: () => Promise<void>, options: PollOptions) {
  const interval = options.interval ?? 20_000;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let inFlight: Promise<void> | undefined;
  let failures = 0;
  let retryAfter = 0;
  let stopped = false;

  function schedule() {
    if (stopped) return;
    clearTimeout(timer);
    const delay = Math.max(
      retryAfter,
      Math.min(120_000, interval * 2 ** Math.min(failures, 3)),
    );
    timer = setTimeout(
      () => {
        if (options.enabled()) void refresh();
        else schedule();
      },
      delay + Math.random() * delay * 0.1,
    );
  }

  function refresh(fresh = false): Promise<void> {
    if (stopped) return Promise.resolve();
    // A refresh after a mutation waits for any older read, then starts a new one.
    if (inFlight) return fresh ? inFlight.then(() => refresh()) : inFlight;
    clearTimeout(timer);
    inFlight = Promise.resolve()
      .then(task)
      .then(() => {
        failures = 0;
        retryAfter = 0;
      })
      .catch((error: unknown) => {
        failures++;
        retryAfter =
          typeof error === "object" &&
          error !== null &&
          "retryAfter" in error &&
          typeof error.retryAfter === "number"
            ? error.retryAfter * 1000
            : 0;
        options.onError(error);
      })
      .finally(() => {
        inFlight = undefined;
        schedule();
      });
    return inFlight;
  }

  schedule();
  return {
    refresh,
    stop() {
      stopped = true;
      clearTimeout(timer);
    },
  };
}
