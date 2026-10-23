document
  .querySelectorAll<HTMLButtonElement>("[data-open-dialog]")
  .forEach((button) => {
    button.addEventListener("click", () => {
      const dialog = document.getElementById(
        button.dataset.openDialog!,
      ) as HTMLDialogElement;
      dialog.showModal();
    });
  });
document
  .querySelectorAll<HTMLButtonElement>("[data-close-dialog]")
  .forEach((button) => {
    button.addEventListener("click", () => button.closest("dialog")?.close());
  });
