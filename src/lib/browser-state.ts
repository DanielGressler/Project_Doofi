// Clear only Doofi state; Cloudflare Access and unrelated origin storage stay independent.
export const datasetMarker = "doofi.dataset";
export function syncDemoStorage(storage: Storage, epoch: string) {
  if (storage.getItem(datasetMarker) === epoch) return false;
  const keys = Array.from({ length: storage.length }, (_, index) =>
    storage.key(index),
  );
  for (const key of keys)
    if (key?.startsWith("doofi.")) storage.removeItem(key);
  storage.setItem(datasetMarker, epoch);
  return true;
}
