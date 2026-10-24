document
  .querySelectorAll<HTMLButtonElement>("[data-product-toggle]")
  .forEach((button) => {
    button.addEventListener("click", () => {
      const content = document.getElementById(
        button.getAttribute("aria-controls")!,
      )!;
      const expanded = button.getAttribute("aria-expanded") !== "true";
      button.setAttribute("aria-expanded", String(expanded));
      button.textContent = expanded ? "−" : "+";
      button.setAttribute(
        "aria-label",
        `${expanded ? "Minimizar" : "Mais detalhes de"} ${button.dataset.productToggle}`,
      );
      content.hidden = !expanded;
      button
        .closest(".catalog-card")!
        .classList.toggle("is-expanded", expanded);
      if (expanded && !matchMedia("(prefers-reduced-motion: reduce)").matches)
        content.animate(
          [
            { opacity: 0, transform: "translateY(-6px)" },
            { opacity: 1, transform: "translateY(0)" },
          ],
          { duration: 180 },
        );
    });
  });
