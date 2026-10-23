import { expect, it } from "vitest";
import { env } from "cloudflare:workers";
import jpeg from "jpeg-js";
import { encode as pngEncode } from "fast-png";
import {
  saveProduct,
  getProducts,
  saveStore,
  getStore,
} from "../src/lib/catalog";
import {
  createOrder,
  issueIntent,
  orderDetails,
  publicOrder,
} from "../src/lib/orders";
import { normalizeImage, uploadImage } from "../src/lib/media";
import { handleApi } from "../src/lib/api";
import { login } from "../src/lib/auth";
import type { Session } from "../src/lib/types";
import { GET as getImage } from "../src/pages/media/[id]";

const owner: Session = {
  user_id: "user-a",
  store_id: "store-a",
  role: "owner",
  csrf_token: "test",
  token_hash: "test",
  email: "forno@demo.doofi.test",
};
const product = {
  title: "Café e pão",
  description: "Um pão e um café",
  category: "  lanches  ",
  price: 2900,
  image: "bread",
  unavailable: false,
};
const makeCombo = () =>
  saveProduct(env.DB, owner, {
    ...product,
    is_combo: true,
    componentIds: ["a-pao", "a-cafe"],
  });
const input = async (id: string, fulfillment = "PICKUP") => ({
  intent: (await issueIntent(env.DB, "casa-do-forno")).intent,
  items: [{ productId: id, quantity: 1 }],
  fulfillment,
  payment: "PIX_SIMULATED",
  name: "Cliente teste",
  phone: "00000000",
  email: "teste.invalid",
  consent: true,
  syntheticData: true,
  address: "Rua de teste, 1",
  neighborhood: "Centro",
  postalCode: "00000000",
});
const photo = () =>
  new Uint8Array(
    jpeg.encode(
      { width: 4, height: 3, data: new Uint8Array(4 * 3 * 4).fill(255) },
      80,
    ).data,
  );

it("disponibilidade contraditória ou booleana malformada não altera o anúncio", async () => {
  for (const flags of [
    { available: true, unavailable: true },
    { available: false, unavailable: false },
    { available: true, unavailable: "false" },
  ]) {
    await expect(
      saveProduct(env.DB, owner, { ...product, ...flags, version: 0 }, "a-pao"),
    ).rejects.toMatchObject({ status: 422 });
  }
  expect((await getProducts(env.DB, "store-a", ["a-pao"]))[0].version).toBe(0);
});

it("versão de edição não herda o limite monetário de cem mil centavos", async () => {
  await env.DB.prepare(
    "UPDATE products SET version=100001 WHERE id='a-pao'",
  ).run();
  await saveProduct(env.DB, owner, { ...product, version: 100001 }, "a-pao");
  expect((await getProducts(env.DB, "store-a", ["a-pao"]))[0].version).toBe(
    100002,
  );
});

it("upload simultâneo respeita a capacidade de memória e libera a vaga ao terminar", async () => {
  let stream!: ReadableStreamDefaultController<Uint8Array>;
  const pending = uploadImage(
    env.DB,
    owner,
    new Request("http://localhost", {
      method: "POST",
      headers: { "content-type": "image/jpeg" },
      body: new ReadableStream<Uint8Array>({
        start(controller) {
          stream = controller;
        },
      }),
    }),
    "product",
  );
  await expect(
    uploadImage(
      env.DB,
      owner,
      new Request("http://localhost", {
        method: "POST",
        headers: { "content-type": "image/jpeg" },
        body: photo(),
      }),
      "product",
    ),
  ).rejects.toMatchObject({
    status: 503,
    code: "IMAGE_CAPACITY",
    retryAfter: 2,
  });
  stream.enqueue(photo());
  stream.close();
  expect((await pending).id).toBeTruthy();
  expect(
    (
      await uploadImage(
        env.DB,
        owner,
        new Request("http://localhost", {
          method: "POST",
          headers: { "content-type": "image/jpeg" },
          body: photo(),
        }),
        "product",
      )
    ).id,
  ).toBeTruthy();
});

it("combo reúne dois itens, tem preço próprio e preserva composição no pedido", async () => {
  const { id } = await makeCombo();
  const combo = (await getProducts(env.DB, "store-a")).find(
    (p) => p.id === id,
  )!;
  expect(combo.category).toBe("Lanches");
  expect(combo.components).toHaveLength(2);
  expect(combo.orderable).toBe(1);
  const order = await createOrder(env.DB, "casa-do-forno", await input(id));
  const detail = await orderDetails(
    env.DB,
    await publicOrder(env.DB, order.token),
  );
  expect(detail.items).toHaveLength(1);
  expect(detail.items[0].price).toBe(2900);
  expect(detail.items[0].title).toContain("Café coado especial");
  await env.DB.prepare(
    "UPDATE products SET title='Café novo',price=9999 WHERE id='a-cafe'",
  ).run();
  const preserved = await orderDetails(
    env.DB,
    await publicOrder(env.DB, order.token),
  );
  expect(preserved.items[0]).toEqual(detail.items[0]);
});
it("indisponibilidade de componente bloqueia combo no catálogo e no checkout", async () => {
  const { id } = await makeCombo();
  await saveProduct(
    env.DB,
    owner,
    { ...product, title: "Café coado especial", unavailable: true, version: 0 },
    "a-cafe",
  );
  expect(
    (await getProducts(env.DB, "store-a")).find((p) => p.id === id)?.orderable,
  ).toBe(0);
  await expect(
    createOrder(env.DB, "casa-do-forno", await input(id)),
  ).rejects.toMatchObject({ status: 422 });
  await saveProduct(
    env.DB,
    owner,
    {
      ...product,
      title: "Café coado especial",
      unavailable: false,
      version: 1,
    },
    "a-cafe",
  );
  expect(
    (await getProducts(env.DB, "store-a")).find((p) => p.id === id)?.orderable,
  ).toBe(1);
});
it("não aceita combos repetidos, aninhados ou com produtos de outra loja", async () => {
  for (const componentIds of [
    ["a-pao", "a-pao"],
    ["a-pao", "b-bowl"],
  ]) {
    await expect(
      saveProduct(env.DB, owner, { ...product, is_combo: true, componentIds }),
    ).rejects.toMatchObject({ status: 422 });
  }
  const { id } = await makeCombo();
  await expect(
    saveProduct(env.DB, owner, {
      ...product,
      is_combo: true,
      componentIds: [id, "a-pao"],
    }),
  ).rejects.toMatchObject({ status: 422 });
});
it("edição concorrente de combo não sobrescreve composição nem duplica auditoria", async () => {
  const { id } = await makeCombo();
  await saveProduct(
    env.DB,
    owner,
    {
      ...product,
      is_combo: true,
      componentIds: ["a-pao", "a-croissant"],
      version: 0,
    },
    id,
  );
  await expect(
    saveProduct(
      env.DB,
      owner,
      {
        ...product,
        is_combo: true,
        componentIds: ["a-pao", "a-cafe"],
        version: 0,
      },
      id,
    ),
  ).rejects.toMatchObject({ status: 409 });
  const combo = (await getProducts(env.DB, "store-a")).find(
    (p) => p.id === id,
  )!;
  expect(combo.components.map((c) => c.id).sort()).toEqual([
    "a-croissant",
    "a-pao",
  ]);
  expect(
    (await env.DB.prepare(
      "SELECT count(*) AS n FROM audit_events WHERE entity_id=? AND action='PRODUCT_UPDATED'",
    )
      .bind(id)
      .first<{ n: number }>())!.n,
  ).toBe(1);
});
it("sem entregador próprio não permite taxa fixa, mas permite retirada e cotação", async () => {
  const store = await getStore(env.DB, "casa-do-forno");
  await saveStore(env.DB, owner, {
    ...store,
    is_open: true,
    has_own_delivery: false,
  });
  await expect(
    createOrder(env.DB, "casa-do-forno", await input("a-pao", "FIXED")),
  ).rejects.toMatchObject({ status: 422 });
  for (const mode of ["PICKUP", "QUOTE"])
    expect(
      (await createOrder(env.DB, "casa-do-forno", await input("a-pao", mode)))
        .id,
    ).toBeTruthy();
});
it("personalização persiste na loja certa e rejeita CSS arbitrário", async () => {
  const store = await getStore(env.DB, "casa-do-forno");
  await saveStore(env.DB, owner, {
    ...store,
    is_open: true,
    palette: "ocean",
    font: "simple",
    has_own_delivery: true,
  });
  expect((await getStore(env.DB, "casa-do-forno")).palette).toBe("ocean");
  expect((await getStore(env.DB, "verde-mesa")).palette).toBe("forest");
  await expect(
    saveStore(env.DB, owner, {
      ...store,
      is_open: true,
      palette: "url(https://example.invalid)",
    }),
  ).rejects.toMatchObject({ status: 422 });
});
it("backend normaliza JPG e PNG, com tamanho padronizado e remoção de metadados", async () => {
  const normalized = await normalizeImage(photo(), "product");
  expect([normalized.width, normalized.height]).toEqual([960, 720]);
  expect(jpeg.decode(normalized.data).width).toBe(960);
  const png = pngEncode({
    width: 3,
    height: 3,
    data: new Uint8Array(36).fill(255),
    channels: 4,
    depth: 8,
  });
  const banner = await normalizeImage(png, "banner");
  expect([banner.width, banner.height]).toEqual([1600, 600]);
  expect(jpeg.decode(banner.data).height).toBe(600);
});

it("redimensionamento mantém cores e compõe transparência sobre branco", async () => {
  const pixels = new Uint8Array(4 * 3 * 4);
  for (let index = 0; index < pixels.length; index += 4)
    pixels.set([10, 100, 220, 128], index);
  const result = await normalizeImage(
    pngEncode({ width: 4, height: 3, data: pixels, channels: 4, depth: 8 }),
    "product",
  );
  const decoded = jpeg.decode(result.data);
  const center = (360 * 960 + 480) * 4;
  for (const [channel, expected] of [132, 177, 237].entries())
    expect(Math.abs(decoded.data[center + channel] - expected)).toBeLessThan(5);
});

it("orientação EXIF é aplicada antes do recorte e removida da imagem final", async () => {
  const pixels = new Uint8Array(16 * 12 * 4);
  for (let y = 0; y < 12; y++)
    for (let x = 0; x < 16; x++)
      pixels.set(
        x < 8 ? [230, 20, 20, 255] : [20, 20, 230, 255],
        (y * 16 + x) * 4,
      );
  const original = jpeg.encode(
    { width: 16, height: 12, data: pixels },
    100,
  ).data;
  const exif = new Uint8Array([
    255, 225, 0, 34, 69, 120, 105, 102, 0, 0, 73, 73, 42, 0, 8, 0, 0, 0, 1, 0,
    18, 1, 3, 0, 1, 0, 0, 0, 6, 0, 0, 0, 0, 0, 0, 0,
  ]);
  const image = new Uint8Array(original.length + exif.length);
  image.set(original.subarray(0, 2));
  image.set(exif, 2);
  image.set(original.subarray(2), 2 + exif.length);
  const normalized = await normalizeImage(image, "product");
  const decoded = jpeg.decode(normalized.data);
  const top = (100 * 960 + 480) * 4,
    bottom = (620 * 960 + 480) * 4;
  expect(decoded.data[top]).toBeGreaterThan(200);
  expect(decoded.data[top + 2]).toBeLessThan(50);
  expect(decoded.data[bottom]).toBeLessThan(50);
  expect(decoded.data[bottom + 2]).toBeGreaterThan(200);
  expect(new TextDecoder().decode(normalized.data)).not.toContain("Exif");
});
it("upload valida autenticação, conteúdo e propriedade antes de associar a foto", async () => {
  const bytes = photo();
  const noAuth = await handleApi(
    new Request("http://localhost/api/v1/painel/imagens?kind=product", {
      method: "POST",
      headers: { origin: "http://localhost", "content-type": "image/jpeg" },
      body: bytes,
    }),
    env.DB,
    "local-demo",
  );
  expect(noAuth.status).toBe(401);
  const auth = await login(env.DB, new Request("http://localhost"), {
    email: owner.email,
    password: "demo-doofi-P1!",
  });
  const headers = {
    origin: "http://localhost",
    "content-type": "image/jpeg",
    cookie: auth.setCookie.split(";")[0],
    "x-csrf-token": auth.csrfToken,
  };
  const uploaded = await handleApi(
    new Request("http://localhost/api/v1/painel/imagens?kind=product", {
      method: "POST",
      headers,
      body: bytes,
    }),
    env.DB,
    "local-demo",
  );
  expect(uploaded.status).toBe(201);
  const asset = (await uploaded.json()) as { id: string };
  const { id } = await saveProduct(env.DB, owner, {
    ...product,
    image_id: asset.id,
  });
  expect(
    (await getProducts(env.DB, "store-a")).find((p) => p.id === id)?.image_id,
  ).toBe(asset.id);
  const served = await getImage({
    params: { id: asset.id },
    request: new Request(`http://localhost/media/${asset.id}`),
  });
  expect(served.status).toBe(200);
  expect(jpeg.decode(new Uint8Array(await served.arrayBuffer())).width).toBe(
    960,
  );
  const foreign = { ...owner, user_id: "user-b", store_id: "store-b" };
  await expect(
    saveProduct(env.DB, foreign, { ...product, image_id: asset.id }),
  ).rejects.toMatchObject({ status: 422 });
  const store = await getStore(env.DB, "casa-do-forno");
  await expect(
    saveStore(env.DB, owner, { ...store, is_open: true, banner_id: asset.id }),
  ).rejects.toMatchObject({ status: 422 });
  await expect(
    normalizeImage(
      new TextEncoder().encode('<svg onload="alert(1)"></svg>'),
      "product",
    ),
  ).rejects.toMatchObject({ status: 422 });
  await expect(
    uploadImage(
      env.DB,
      owner,
      new Request("http://localhost", {
        method: "POST",
        headers: { "content-type": "image/jpeg" },
        body: "not an image",
      }),
      "product",
    ),
  ).rejects.toMatchObject({ status: 422 });
});

it("layout é validado no backend e acompanha o pedido sem alterar outra loja", async () => {
  const store = await getStore(env.DB, "casa-do-forno");
  await expect(
    saveStore(env.DB, owner, {
      ...store,
      is_open: true,
      has_own_delivery: !!store.has_own_delivery,
      layout: "arbitrary-layout",
    }),
  ).rejects.toMatchObject({ status: 422 });
  await saveStore(env.DB, owner, {
    ...store,
    is_open: true,
    has_own_delivery: !!store.has_own_delivery,
    layout: "showcase",
    font: "classic",
    palette: "plum",
  });
  expect((await getStore(env.DB, "casa-do-forno")).layout).toBe("showcase");
  expect((await getStore(env.DB, "verde-mesa")).layout).toBe("cozy");
  const order = await createOrder(
    env.DB,
    "casa-do-forno",
    await input("a-pao"),
  );
  const { publicStatus } = await import("../src/lib/orders");
  expect((await publicStatus(env.DB, order.token)).store).toMatchObject({
    layout: "showcase",
    font: "classic",
    palette: "plum",
  });
});
