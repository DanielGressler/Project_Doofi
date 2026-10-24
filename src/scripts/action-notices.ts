// Ephemeral UI messages only. Never put order contacts or session data in storage.
const duration = 20_000;
const fadeDuration = 400;
type Notice = { node: HTMLElement; dismiss: (restoreFocus?: boolean) => void };
const notices: Notice[] = [];
let home: Comment | undefined;

function host() {
  const root = document.getElementById("action-notices");
  if (!root) return null;
  if (!home) {
    home = document.createComment("action-notices");
    root.before(home);
  }
  const dialog = document.querySelector<HTMLDialogElement>("dialog[open]");
  if (dialog) {
    (dialog.querySelector(".queue-card") ?? dialog).append(root);
    root.dataset.hosted = "true";
  } else {
    home.after(root);
    delete root.dataset.hosted;
  }
  return root;
}

export function notifyAction(message: string) {
  const root = host();
  if (!root) return;
  while (notices.length >= 3) {
    const oldest = notices.find(
      (notice) => !notice.node.contains(document.activeElement),
    );
    if (!oldest) break;
    oldest.dismiss();
  }
  const source =
    document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null;
  const node = document.createElement("div");
  node.className = "action-notice";
  const text = document.createElement("p");
  text.textContent = message;
  const close = document.createElement("button");
  close.type = "button";
  close.className = "guide-close";
  close.setAttribute("aria-label", "Fechar aviso");
  close.textContent = "×";
  node.append(text, close);
  root.append(node);
  let timer: ReturnType<typeof setTimeout> | undefined;
  let fade: ReturnType<typeof setTimeout> | undefined;
  let remaining = duration;
  let started = performance.now();
  let hovered = false;
  let focused = false;
  let removed = false;
  const notice: Notice = { node, dismiss };
  notices.push(notice);
  function dismiss(restoreFocus = false) {
    if (removed) return;
    removed = true;
    clearTimeout(timer);
    clearTimeout(fade);
    if (restoreFocus && node.contains(document.activeElement)) {
      const fallback =
        source?.isConnected &&
        source !== document.body &&
        source.getClientRects().length > 0 &&
        !source.closest("[hidden],[inert]") &&
        !source.matches(":disabled")
          ? source
          : document.querySelector<HTMLElement>("main h1");
      if (fallback) {
        if (fallback.matches("h1")) fallback.tabIndex = -1;
        fallback.focus({ preventScroll: true });
      }
    }
    node.remove();
    notices.splice(notices.indexOf(notice), 1);
  }
  function expire() {
    // Keep the announcement accessible for the full 20 seconds; fading is decoration.
    node.inert = true;
    node.setAttribute("aria-hidden", "true");
    node.classList.add("is-leaving");
    fade = setTimeout(
      () => dismiss(),
      matchMedia("(prefers-reduced-motion: reduce)").matches ? 0 : fadeDuration,
    );
  }
  function pause() {
    if (removed || node.inert) return;
    clearTimeout(timer);
    remaining = Math.max(0, remaining - (performance.now() - started));
  }
  function resume() {
    if (removed || node.inert || hovered || focused) return;
    started = performance.now();
    clearTimeout(timer);
    timer = setTimeout(expire, remaining);
  }
  close.onclick = () => dismiss(true);
  node.addEventListener("pointerenter", () => {
    if (!focused && !hovered) pause();
    hovered = true;
  });
  node.addEventListener("pointerleave", () => {
    hovered = false;
    resume();
  });
  node.addEventListener("focusin", () => {
    if (!focused && !hovered) pause();
    focused = true;
  });
  node.addEventListener("focusout", (event) => {
    if (node.contains(event.relatedTarget as Node | null)) return;
    focused = false;
    resume();
  });
  resume();
}

if (typeof document !== "undefined") {
  document.addEventListener(
    "close",
    () => {
      if (notices.length) host();
    },
    true,
  );
  window.addEventListener("pagehide", () =>
    [...notices].forEach((notice) => notice.dismiss()),
  );
}
