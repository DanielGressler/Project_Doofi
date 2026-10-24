document
  .querySelectorAll<HTMLButtonElement>("[data-open-dialog]")
  .forEach((button) => {
    button.addEventListener("click", () => {
      const dialog = document.getElementById(
        button.dataset.openDialog!,
      ) as HTMLDialogElement;
      if (!dialog.open) dialog.showModal();
      document.dispatchEvent(
        new CustomEvent("catalog:dialog-open", { detail: dialog.id }),
      );
    });
  });
document
  .querySelectorAll<HTMLButtonElement>("[data-close-dialog]")
  .forEach((button) => {
    button.addEventListener("click", () => button.closest("dialog")?.close());
  });
