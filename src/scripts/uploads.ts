import { requestJson } from "./browser";

export async function upload(
  file: File,
  kind: "product" | "banner",
  csrf: string,
) {
  if (file.size > 2 * 1024 * 1024)
    throw new Error("A imagem deve ter até 2 MB.");
  const result = await requestJson<{ id: string }>(
    `painel/imagens?kind=${kind}`,
    {
      method: "POST",
      headers: { "Content-Type": file.type, "X-CSRF-Token": csrf },
      body: file,
    },
  );
  return result.id;
}
