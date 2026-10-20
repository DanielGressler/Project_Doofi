export const $ = <T extends HTMLElement = HTMLElement>(
  selector: string,
  root: ParentNode = document,
) => root.querySelector<T>(selector)!;
export function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  text = "",
  className = "",
) {
  const node = document.createElement(tag);
  node.textContent = text;
  if (className) node.className = className;
  return node;
}
export class ApiError extends Error {
  constructor(
    message: string,
    public code: string,
    public status: number,
  ) {
    super(message);
  }
}
export async function api<T = Record<string, unknown>>(
  path: string,
  data?: unknown,
  method = "POST",
  csrf?: string,
): Promise<T> {
  const response = await fetch(`/api/v1/${path}`, {
    method: data === undefined ? "GET" : method,
    credentials: "same-origin",
    headers:
      data === undefined
        ? {}
        : {
            "Content-Type": "application/json",
            ...(csrf ? { "X-CSRF-Token": csrf } : {}),
          },
    ...(data === undefined ? {} : { body: JSON.stringify(data) }),
  });
  const result = (await response.json()) as { error?: string; code: string };
  if (!response.ok) {
    if (response.status === 401 && path.startsWith("painel/"))
      location.assign("/painel/entrar");
    throw new ApiError(
      result.error ?? "Não foi possível concluir a operação.",
      result.code,
      response.status,
    );
  }
  return result as T;
}
export function feedback(
  message: string,
  error = false,
  selector = "#feedback",
) {
  const node = $(selector);
  if (node) {
    node.textContent = message;
    node.classList.toggle("error", error);
  }
}
export async function busy(
  button: HTMLButtonElement,
  task: () => Promise<void>,
) {
  const label = button.textContent;
  button.disabled = true;
  button.setAttribute("aria-busy", "true");
  try {
    await task();
  } catch (error) {
    feedback(
      error instanceof Error
        ? error.message
        : "Algo deu errado. Tente novamente.",
      true,
    );
  } finally {
    button.disabled = false;
    button.removeAttribute("aria-busy");
    if (label && !button.isConnected) button.textContent = label;
  }
}
export function readCart(slug: string): Record<string, number> {
  try {
    const value = JSON.parse(
      localStorage.getItem(`doofi.cart.${slug}`) ?? "{}",
    );
    if (!value || typeof value !== "object" || Array.isArray(value)) return {};
    return Object.fromEntries(
      Object.entries(value).filter(
        ([, qty]) =>
          Number.isInteger(qty) && Number(qty) > 0 && Number(qty) <= 10,
      ),
    ) as Record<string, number>;
  } catch {
    return {};
  }
}
export function saveCart(slug: string, cart: Record<string, number>) {
  try {
    localStorage.setItem(`doofi.cart.${slug}`, JSON.stringify(cart));
  } catch {
    throw new Error(
      "O navegador bloqueou o armazenamento do carrinho. Permita o armazenamento local e tente novamente.",
    );
  }
}
