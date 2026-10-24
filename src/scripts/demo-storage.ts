import { datasetMarker, syncDemoStorage } from "../lib/browser-state";
const epoch =
  typeof document === "undefined"
    ? undefined
    : document.documentElement.dataset.doofiEpoch;
if (epoch) {
  for (const name of ["localStorage", "sessionStorage"] as const) {
    try {
      syncDemoStorage(window[name], epoch);
    } catch {
      /* Browsing remains possible when storage is disabled. */
    }
  }
  // A reset seen in another tab also discards this tab's in-memory cart/draft.
  window.addEventListener("storage", (event) => {
    if (
      event.key === datasetMarker &&
      event.newValue &&
      event.newValue !== epoch
    )
      location.reload();
  });
}
