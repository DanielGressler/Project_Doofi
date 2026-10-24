document.querySelectorAll<HTMLElement>("[data-novel-guide]").forEach((root) => {
  const scenes = JSON.parse(root.dataset.scenes!) as {
    title: string;
    text: string;
  }[];
  let chapter = Number(root.dataset.chapter) || 0;
  function show(next: number, focus = false) {
    chapter = Math.min(scenes.length - 1, Math.max(0, next));
    root.dataset.chapter = String(chapter);
    root.querySelector<HTMLElement>("[data-guide-title]")!.textContent =
      scenes[chapter].title;
    root.querySelector<HTMLElement>("[data-guide-text]")!.textContent =
      scenes[chapter].text;
    root.querySelector<HTMLElement>("[data-guide-chapter]")!.textContent =
      `Capítulo ${chapter + 1} de ${scenes.length}`;
    const back = root.querySelector<HTMLButtonElement>("[data-guide-back]");
    if (back) back.disabled = chapter === 0;
    const nextButton = root.querySelector<HTMLElement>("[data-guide-next]");
    if (nextButton) nextButton.hidden = chapter === scenes.length - 1;
    const finish = root.querySelector<HTMLElement>("[data-guide-finish]");
    if (finish) finish.hidden = chapter !== scenes.length - 1;
    root
      .querySelectorAll<HTMLElement>("[data-guide-preview]")
      .forEach(
        (node) => (node.hidden = Number(node.dataset.guidePreview) !== chapter),
      );
    if (focus) {
      root.querySelector<HTMLElement>("[data-guide-title]")!.focus();
      if (
        root.dataset.motion !== "paused" &&
        !matchMedia("(prefers-reduced-motion: reduce)").matches
      )
        root.querySelector<HTMLElement>(".novel-dialogue")!.animate(
          [
            { opacity: 0, transform: "translateY(8px)" },
            { opacity: 1, transform: "translateY(0)" },
          ],
          { duration: 260 },
        );
    }
    if (root.id === "catalog-guide") {
      const url = new URL(location.href);
      url.searchParams.set("capitulo", String(chapter));
      history.replaceState(null, "", url);
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
  show(chapter);
});
