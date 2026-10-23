import { afterEach, expect, it, vi } from "vitest";
import { createPoller } from "../src/scripts/poller";
import { api } from "../src/scripts/browser";

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

it("leitura lenta não se sobrepõe e atualização após mutação aguarda uma leitura nova", async () => {
  vi.useFakeTimers();
  vi.spyOn(Math, "random").mockReturnValue(0);
  let release!: () => void;
  const task = vi
    .fn()
    .mockImplementationOnce(
      () =>
        new Promise<void>((resolve) => {
          release = resolve;
        }),
    )
    .mockResolvedValue(undefined);
  const poller = createPoller(task, { enabled: () => true, onError: vi.fn() });
  try {
    const first = poller.refresh();
    const repeated = poller.refresh();
    const afterMutation = poller.refresh(true);
    await vi.advanceTimersByTimeAsync(60_000);
    expect(task).toHaveBeenCalledTimes(1);
    release();
    await Promise.all([first, repeated, afterMutation]);
    expect(task).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(20_000);
    expect(task).toHaveBeenCalledTimes(3);
  } finally {
    poller.stop();
  }
});

it("falhas espaçam as consultas e uma resposta válida restaura o intervalo normal", async () => {
  vi.useFakeTimers();
  vi.spyOn(Math, "random").mockReturnValue(0);
  const task = vi
    .fn()
    .mockRejectedValueOnce(new Error("offline"))
    .mockRejectedValueOnce(new Error("offline"))
    .mockResolvedValue(undefined);
  const onError = vi.fn();
  const poller = createPoller(task, { enabled: () => true, onError });
  try {
    await poller.refresh();
    await vi.advanceTimersByTimeAsync(39_999);
    expect(task).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(task).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(80_000);
    expect(task).toHaveBeenCalledTimes(3);
    await vi.advanceTimersByTimeAsync(20_000);
    expect(task).toHaveBeenCalledTimes(4);
    expect(onError).toHaveBeenCalledTimes(2);
  } finally {
    poller.stop();
  }
});

it("polling respeita Retry-After e pausa consultas automáticas quando a aba não está disponível", async () => {
  vi.useFakeTimers();
  vi.spyOn(Math, "random").mockReturnValue(0);
  let visible = false;
  const task = vi
    .fn()
    .mockRejectedValueOnce(Object.assign(new Error("busy"), { retryAfter: 90 }))
    .mockResolvedValue(undefined);
  const poller = createPoller(task, {
    enabled: () => visible,
    onError: vi.fn(),
  });
  try {
    await vi.advanceTimersByTimeAsync(60_000);
    expect(task).not.toHaveBeenCalled();
    visible = true;
    await vi.advanceTimersByTimeAsync(20_000);
    expect(task).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(89_999);
    expect(task).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(task).toHaveBeenCalledTimes(2);
  } finally {
    poller.stop();
  }
});

it("cliente explica resposta HTML de acesso e mantém o Retry-After da API", async () => {
  const fetch = vi.spyOn(globalThis, "fetch");
  fetch.mockResolvedValueOnce(
    new Response("Access required", {
      status: 403,
      headers: { "content-type": "text/html" },
    }),
  );
  await expect(api("pedidos/example")).rejects.toMatchObject({
    code: "INVALID_RESPONSE",
    status: 403,
  });
  fetch.mockResolvedValueOnce(
    Response.json(
      { error: "Aguarde", code: "RATE_LIMIT" },
      { status: 429, headers: { "Retry-After": "45" } },
    ),
  );
  await expect(api("pedidos/example")).rejects.toMatchObject({
    code: "RATE_LIMIT",
    retryAfter: 45,
  });
});

it("requisição sem resposta tem prazo e não deixa a interface esperando indefinidamente", async () => {
  vi.useFakeTimers();
  vi.spyOn(globalThis, "fetch").mockImplementation(
    (_input, options) =>
      new Promise((_resolve, reject) => {
        options?.signal?.addEventListener("abort", () =>
          reject(new DOMException("Aborted", "AbortError")),
        );
      }),
  );
  const result = api("pedidos/example").catch((error) => error);
  await vi.advanceTimersByTimeAsync(30_000);
  expect(await result).toMatchObject({ code: "TIMEOUT", status: 0 });
});
