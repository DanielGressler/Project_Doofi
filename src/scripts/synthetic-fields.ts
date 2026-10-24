import { syntheticError, type SyntheticField } from "../lib/synthetic-data";
document
  .querySelectorAll<HTMLInputElement>("[data-synthetic]")
  .forEach((input) => {
    const validate = () => {
      const error = syntheticError(
        input.dataset.synthetic as SyntheticField,
        input.value,
      );
      input.setCustomValidity(error);
      input.setAttribute("aria-invalid", String(!!error));
      const hint =
        input.parentElement?.querySelector<HTMLElement>("[data-validation]");
      if (hint) hint.textContent = error;
    };
    input.addEventListener("input", validate);
    input.addEventListener("change", validate);
    input.form?.addEventListener("reset", () => queueMicrotask(validate));
    validate();
  });
