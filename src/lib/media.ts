import jpeg from "jpeg-js";
import { decode as decodePng } from "fast-png";
import { AppError, now } from "./core";
import type { Session } from "./types";

const MAX_BYTES = 2 * 1024 * 1024;
const MAX_PIXELS = 4_000_000;
const invalid = () =>
  new AppError(
    422,
    "Imagem inválida. Envie JPG ou PNG de até 2 MB e 4 megapixels.",
  );

// JPEG EXIF is read only for orientation; all original metadata is discarded.
function orientation(bytes: Uint8Array) {
  const v = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  try {
    for (let p = 2; p + 4 < bytes.length;) {
      if (bytes[p] !== 255 || bytes[p + 1] === 218 || bytes[p + 1] === 217)
        break;
      const length = v.getUint16(p + 2);
      if (length < 2 || p + 2 + length > bytes.length) break;
      if (bytes[p + 1] === 225 && v.getUint32(p + 4) === 0x45786966) {
        const start = p + 10,
          little = v.getUint16(start) === 0x4949;
        const ifd = start + v.getUint32(start + 4, little);
        const count = v.getUint16(ifd, little);
        for (let n = 0; n < count; n++) {
          const entry = ifd + 2 + n * 12;
          if (v.getUint16(entry, little) === 274)
            return v.getUint16(entry + 8, little);
        }
      }
      p += length + 2;
    }
  } catch {
    /* Invalid EXIF must not interfere with image decoding. */
  }
  return 1;
}

export async function normalizeImage(
  bytes: Uint8Array,
  kind: "product" | "banner",
) {
  if (!bytes.length || bytes.length > MAX_BYTES) throw invalid();
  let width: number,
    height: number,
    data: Uint8Array,
    rotate = 1;
  try {
    if (bytes[0] === 255 && bytes[1] === 216) {
      const decoded = jpeg.decode(bytes, {
        useTArray: true,
        tolerantDecoding: false,
        maxResolutionInMP: 4,
        maxMemoryUsageInMB: 64,
      });
      ({ width, height, data } = decoded);
      rotate = orientation(bytes);
    } else if (
      bytes.length > 33 &&
      new DataView(bytes.buffer, bytes.byteOffset).getUint32(0) === 0x89504e47
    ) {
      const view = new DataView(
        bytes.buffer,
        bytes.byteOffset,
        bytes.byteLength,
      );
      width = view.getUint32(16);
      height = view.getUint32(20);
      if (
        !width ||
        !height ||
        width * height > MAX_PIXELS ||
        bytes[24] !== 8 ||
        bytes[28] !== 0
      )
        throw invalid();
      const chunks: Uint8Array[] = [bytes.subarray(0, 8)],
        compressed: Uint8Array[] = [];
      for (let p = 8; p + 12 <= bytes.length;) {
        const length = view.getUint32(p);
        if (p + length + 12 > bytes.length) throw invalid();
        const type = String.fromCharCode(...bytes.subarray(p + 4, p + 8));
        if (
          (p === 8 && type !== "IHDR") ||
          (type === "IHDR" && (p !== 8 || length !== 13))
        )
          throw invalid();
        if (["IHDR", "PLTE", "tRNS", "IDAT", "IEND"].includes(type))
          chunks.push(bytes.subarray(p, p + length + 12));
        if (type === "IDAT")
          compressed.push(bytes.slice(p + 8, p + 8 + length));
        p += length + 12;
      }
      // Bound decompression before passing bytes to the PNG decoder.
      const reader = new Blob(compressed.map((c) => new Uint8Array(c)))
        .stream()
        .pipeThrough(new DecompressionStream("deflate"))
        .getReader();
      let inflated = 0;
      try {
        for (;;) {
          const chunk = await reader.read();
          if (chunk.done) break;
          inflated += chunk.value.length;
          if (inflated > (width * 4 + 1) * height) throw invalid();
        }
      } finally {
        await reader.cancel();
      }
      const clean = new Uint8Array(chunks.reduce((n, c) => n + c.length, 0));
      let offset = 0;
      for (const chunk of chunks) {
        clean.set(chunk, offset);
        offset += chunk.length;
      }
      const png = decodePng(clean, { checkCrc: true });
      data = new Uint8Array(width * height * 4);
      for (let i = 0; i < width * height; i++) {
        const c = png.channels,
          p = i * c;
        const color = png.palette?.[Number(png.data[p])];
        const gray = Number(png.data[p]);
        data.set(
          color
            ? [color[0], color[1], color[2], color[3] ?? 255]
            : c <= 2
              ? [gray, gray, gray, c === 2 ? Number(png.data[p + 1]) : 255]
              : [
                  Number(png.data[p]),
                  Number(png.data[p + 1]),
                  Number(png.data[p + 2]),
                  c === 4 ? Number(png.data[p + 3]) : 255,
                ],
          i * 4,
        );
      }
    } else throw invalid();
    if (!width || !height || width * height > MAX_PIXELS) throw invalid();
    const targetWidth = kind === "banner" ? 1600 : 960,
      targetHeight = kind === "banner" ? 600 : 720;
    const swapped = rotate >= 5 && rotate <= 8,
      orientedWidth = swapped ? height : width,
      orientedHeight = swapped ? width : height;
    const scale = Math.max(
      targetWidth / orientedWidth,
      targetHeight / orientedHeight,
    );
    const output = new Uint8Array(targetWidth * targetHeight * 4);
    for (let y = 0; y < targetHeight; y++)
      for (let x = 0; x < targetWidth; x++) {
        const ox = Math.min(
          orientedWidth - 1,
          Math.max(
            0,
            Math.floor((x + (orientedWidth * scale - targetWidth) / 2) / scale),
          ),
        );
        const oy = Math.min(
          orientedHeight - 1,
          Math.max(
            0,
            Math.floor(
              (y + (orientedHeight * scale - targetHeight) / 2) / scale,
            ),
          ),
        );
        const [sx, sy] =
          rotate === 2
            ? [width - 1 - ox, oy]
            : rotate === 3
              ? [width - 1 - ox, height - 1 - oy]
              : rotate === 4
                ? [ox, height - 1 - oy]
                : rotate === 5
                  ? [oy, ox]
                  : rotate === 6
                    ? [oy, height - 1 - ox]
                    : rotate === 7
                      ? [width - 1 - oy, height - 1 - ox]
                      : rotate === 8
                        ? [width - 1 - oy, ox]
                        : [ox, oy];
        const source = (sy * width + sx) * 4,
          dest = (y * targetWidth + x) * 4,
          alpha = data[source + 3] / 255;
        for (let c = 0; c < 3; c++)
          output[dest + c] = Math.round(
            data[source + c] * alpha + 255 * (1 - alpha),
          );
        output[dest + 3] = 255;
      }
    const result = jpeg.encode(
      { width: targetWidth, height: targetHeight, data: output },
      80,
    ).data;
    if (result.length > 1_500_000) throw invalid();
    return {
      data: new Uint8Array(result),
      width: targetWidth,
      height: targetHeight,
    };
  } catch (error) {
    if (error instanceof AppError) throw error;
    throw invalid();
  }
}

export async function uploadImage(
  db: D1Database,
  session: Session,
  request: Request,
  kind: string,
) {
  if (kind !== "product" && kind !== "banner")
    throw new AppError(422, "Tipo de imagem inválido.");
  if (kind === "banner" && session.role !== "owner")
    throw new AppError(403, "Somente o proprietário pode alterar o banner.");
  if (
    !["image/jpeg", "image/png"].includes(
      request.headers.get("content-type") ?? "",
    )
  )
    throw invalid();
  if (Number(request.headers.get("content-length") ?? 0) > MAX_BYTES)
    throw invalid();
  const reader = request.body?.getReader();
  if (!reader) throw invalid();
  const chunks: Uint8Array[] = [];
  let length = 0;
  for (;;) {
    const part = await reader.read();
    if (part.done) break;
    length += part.value.length;
    if (length > MAX_BYTES) {
      await reader.cancel();
      throw invalid();
    }
    chunks.push(part.value);
  }
  const bytes = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.length;
  }
  const normalized = await normalizeImage(bytes, kind),
    id = crypto.randomUUID();
  // Keep storage bounded, including uploads abandoned before saving a form.
  const writes = await db.batch([
    db
      .prepare(
        "INSERT INTO media_assets SELECT ?,?,?,?,?,?,? WHERE (SELECT COUNT(*) FROM media_assets WHERE store_id=?)<150",
      )
      .bind(
        id,
        session.store_id,
        kind,
        normalized.data.buffer,
        normalized.width,
        normalized.height,
        now(),
        session.store_id,
      ),
    db
      .prepare(
        "INSERT INTO audit_events SELECT ?,?,?,?,?,?,?,? WHERE changes()>0",
      )
      .bind(
        crypto.randomUUID(),
        session.store_id,
        session.user_id,
        "IMAGE_UPLOADED",
        id,
        "{}",
        crypto.randomUUID(),
        now(),
      ),
  ]);
  if (!writes[0].meta.changes)
    throw new AppError(422, "Limite de 150 imagens da demonstração atingido.");
  return {
    id,
    url: `/media/${id}`,
    width: normalized.width,
    height: normalized.height,
  };
}
