import type { GuideScene } from "../lib/guide-scenes";

document.querySelectorAll<HTMLElement>("[data-novel-guide]").forEach((root) => {
  const scenes = JSON.parse(root.dataset.scenes!) as GuideScene[];
  const floating = root.classList.contains("floating-guide");
  const home = document.createComment("guide-position");
  root.before(home);
  const explanation = root.querySelector<HTMLElement>("[data-guide-text]")!;
  explanation.id = `${root.id}-explanation`;
  let chapter = Number(root.dataset.chapter) || 0;
  let target: HTMLElement | null = null;
  let frame = 0;
  let hostedDialog: HTMLDialogElement | null = null;

  function clearTarget() {
    if (!target) return;
    target.classList.remove("guide-target");
    const descriptions = (target.getAttribute("aria-describedby") ?? "")
      .split(" ")
      .filter((id) => id && id !== explanation.id);
    if (descriptions.length)
      target.setAttribute("aria-describedby", descriptions.join(" "));
    else target.removeAttribute("aria-describedby");
    target = null;
  }
  function returnHome() {
    hostedDialog?.removeAttribute("data-guided");
    hostedDialog = null;
    home.after(root);
  }
  function position() {
    frame = 0;
    if (!floating || root.hidden || !root.getClientRects().length) return;
    const width = root.offsetWidth,
      height = root.offsetHeight;
    const viewport = {
      width: innerWidth,
      height: visualViewport?.height ?? innerHeight,
    };
    const rect = target?.getBoundingClientRect();
    let left = Math.max(12, viewport.width - width - 20);
    let top = Math.max(12, viewport.height - height - 12);
    let side = "bottom";
    if (rect && viewport.width > 700) {
      if (rect.right + width + 28 < viewport.width) {
        left = rect.right + 16;
        top = rect.top;
        side = "right";
      } else if (rect.left > width + 28) {
        left = rect.left - width - 16;
        top = rect.top;
        side = "left";
      } else if (rect.top > height + 28) {
        left = rect.left;
        top = rect.top - height - 16;
        side = "above";
      } else if (rect.bottom + height + 28 < viewport.height) {
        left = rect.left;
        top = rect.bottom + 16;
        side = "below";
      }
    }
    root.style.left = `${Math.max(12, Math.min(left, viewport.width - width - 12))}px`;
    root.style.top = `${Math.max(12, Math.min(top, viewport.height - height - 12))}px`;
    root.dataset.side = side;
    document.documentElement.style.setProperty(
      "--guide-space",
      `${height + 32}px`,
    );
  }
  function schedulePosition() {
    if (!frame) frame = requestAnimationFrame(position);
  }
  function show(next: number, focus = false) {
    next = Math.min(scenes.length - 1, Math.max(0, next));
    if (
      !root.dispatchEvent(
        new CustomEvent("guide:beforechange", {
          cancelable: true,
          detail: { chapter: next, scene: scenes[next] },
        }),
      )
    )
      return;
    chapter = next;
    clearTarget();
    root.hidden = false;
    root.dataset.chapter = String(chapter);
    const scene = scenes[chapter];
    root.querySelector<HTMLElement>("[data-guide-title]")!.textContent =
      scene.title;
    explanation.textContent = scene.text;
    root.querySelector<HTMLElement>("[data-guide-chapter]")!.textContent =
      `Passo ${chapter + 1} de ${scenes.length}`;
    const back = root.querySelector<HTMLButtonElement>("[data-guide-back]");
    if (back) back.disabled = chapter === 0;
    const nextButton = root.querySelector<HTMLElement>("[data-guide-next]");
    if (nextButton) nextButton.hidden = chapter === scenes.length - 1;
    const finish = root.querySelector<HTMLElement>("[data-guide-finish]");
    if (finish) finish.hidden = chapter !== scenes.length - 1;
    root.dispatchEvent(
      new CustomEvent("guide:change", { detail: { chapter, scene } }),
    );
    if (floating) {
      const dialog = scene.dialog
        ? (document.getElementById(scene.dialog) as HTMLDialogElement)
        : null;
      const previous = hostedDialog;
      if (dialog !== previous) {
        returnHome();
        if (previous?.open) previous.close("guide-next");
      }
      if (dialog) {
        hostedDialog = dialog;
        dialog.dataset.guided = "true";
        dialog.append(root);
        if (!dialog.open) dialog.showModal();
      }
      target = scene.target
        ? document.querySelector<HTMLElement>(scene.target)
        : null;
      if (target) {
        target.classList.add("guide-target");
        const descriptions =
          target.getAttribute("aria-describedby")?.split(" ").filter(Boolean) ??
          [];
        target.setAttribute(
          "aria-describedby",
          [...new Set([...descriptions, explanation.id])].join(" "),
        );
        target.scrollIntoView({ block: "center", behavior: "instant" });
      }
      document.documentElement.dataset.guideActive = "true";
      position();
      if (target && root.dataset.side === "bottom") {
        const rect = target.getBoundingClientRect();
        const overlap = rect.bottom - root.getBoundingClientRect().top + 16;
        if (overlap > 0)
          (hostedDialog ?? window).scrollBy({
            top: overlap,
            behavior: "instant",
          });
      }
      schedulePosition();
    }
    if (focus) {
      root
        .querySelector<HTMLElement>("[data-guide-title]")!
        .focus({ preventScroll: true });
      if (
        root.dataset.motion !== "paused" &&
        !matchMedia("(prefers-reduced-motion: reduce)").matches
      )
        root
          .querySelector<HTMLElement>(".novel-dialogue")!
          .animate([{ opacity: 0 }, { opacity: 1 }], { duration: 180 });
    }
    if (root.id === "catalog-guide") {
      const url = new URL(location.href);
      url.searchParams.set("capitulo", String(chapter));
      history.replaceState(null, "", url);
    }
  }
  function hide() {
    clearTarget();
    returnHome();
    root.hidden = true;
    if (floating) {
      delete document.documentElement.dataset.guideActive;
      document.documentElement.style.removeProperty("--guide-space");
    }
  }
  root
    .querySelector("[data-guide-next]")
    ?.addEventListener("click", () => show(chapter + 1, true));
  root
    .querySelector("[data-guide-back]")
    ?.addEventListener("click", () => show(chapter - 1, true));
  root.addEventListener("guide:scene", (event) =>
    show((event as CustomEvent<number>).detail),
  );
  root.addEventListener("guide:hide", hide);
  root.querySelector<HTMLButtonElement>("[data-guide-motion]")!.onclick = (
    event,
  ) => {
    const button = event.currentTarget as HTMLButtonElement;
    const paused = root.dataset.motion !== "paused";
    root.dataset.motion = paused ? "paused" : "playing";
    button.setAttribute("aria-pressed", String(paused));
    button.textContent = paused ? "Retomar animações" : "Pausar animações";
    if (paused)
      root
        .querySelector<HTMLElement>(".novel-dialogue")!
        .getAnimations()
        .forEach((animation) => animation.cancel());
  };
  if (floating) {
    addEventListener("resize", schedulePosition);
    addEventListener("scroll", schedulePosition, true);
    visualViewport?.addEventListener("resize", schedulePosition);
    new ResizeObserver(schedulePosition).observe(root);
    document
      .querySelectorAll<HTMLDialogElement>(".editor-dialog")
      .forEach((dialog) => {
        dialog.addEventListener("close", () => {
          if (!root.hidden && scenes[chapter].dialog === dialog.id) {
            let previous = chapter;
            while (previous > 0 && scenes[previous].dialog) previous--;
            show(previous, true);
          }
        });
      });
    document.addEventListener("catalog:dialog-open", (event) => {
      if (root.hidden) return;
      const index = scenes.findIndex(
        (scene) => scene.dialog === (event as CustomEvent<string>).detail,
      );
      if (index >= 0) show(index);
    });
    document.addEventListener("catalog:saved", (event) => {
      if (root.hidden || root.id !== "catalog-guide") return;
      const combo = (event as CustomEvent<{ combo: boolean }>).detail.combo;
      const index = scenes.findIndex(
        (scene) =>
          scene.target === (combo ? ".site-footer" : "#products-title"),
      );
      if (index >= 0) {
        const url = new URL(location.href);
        url.searchParams.set("capitulo", String(index));
        history.replaceState(null, "", url);
      }
    });
  }
  requestAnimationFrame(() => show(chapter));
});
