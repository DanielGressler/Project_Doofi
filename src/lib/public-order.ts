import type { publicStatus } from "./orders";
export type PublicOrder = Awaited<ReturnType<typeof publicStatus>>;
