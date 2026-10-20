import { $, api } from "./browser";
import { upload } from "./uploads";
document.querySelectorAll<HTMLFormElement>(".product-form").forEach((form) => {
  form.onsubmit = async (event) => {
    event.preventDefault();
    const button = $<HTMLButtonElement>('button[type="submit"]', form),
      output = $(".feedback", form),
      csrf = $("#panel-app").dataset.csrf!;
    button.disabled = true;
    output.textContent = "Salvando...";
    try {
      const fields = new FormData(form),
        id = form.dataset.id,
        combo = form.dataset.isCombo === "true";
      const file = fields.get("photo");
      let imageId: string | null | undefined =
        fields.get("remove_photo") === "on" ? null : undefined;
      if (file instanceof File && file.size) {
        const signature = `${file.name}:${file.size}:${file.lastModified}`;
        if (form.dataset.uploadSignature !== signature) {
          form.dataset.uploadId = await upload(file, "product", csrf);
          form.dataset.uploadSignature = signature;
        }
        imageId = form.dataset.uploadId;
      }
      await api(
        `painel/produtos${id ? `/${id}` : ""}`,
        {
          title: fields.get("title"),
          description: fields.get("description"),
          category: fields.get("category"),
          image: fields.get("image"),
          price: Math.round(Number(fields.get("price")) * 100),
          unavailable: fields.get("unavailable") === "on",
          is_combo: combo,
          ...(imageId !== undefined ? { image_id: imageId } : {}),
          ...(combo
            ? {
                componentIds: [
                  fields.get("component1"),
                  fields.get("component2"),
                ],
              }
            : {}),
          ...(id ? { version: Number(form.dataset.version) } : {}),
        },
        id ? "PATCH" : "POST",
        csrf,
      );
      location.reload();
    } catch (e) {
      output.textContent = (e as Error).message;
      output.classList.add("error");
    } finally {
      button.disabled = false;
    }
  };
});
