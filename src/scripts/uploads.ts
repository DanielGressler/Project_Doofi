export async function upload(
  file: File,
  kind: "product" | "banner",
  csrf: string,
) {
  if (file.size > 2 * 1024 * 1024)
    throw new Error("A imagem deve ter até 2 MB.");
  const response = await fetch(`/api/v1/painel/imagens?kind=${kind}`, {
    method: "POST",
    credentials: "same-origin",
    headers: { "Content-Type": file.type, "X-CSRF-Token": csrf },
    body: file,
  });
  const result = (await response.json()) as { id: string; error?: string };
  if (!response.ok)
    throw new Error(result.error ?? "Não foi possível enviar a imagem.");
  return result.id;
}
