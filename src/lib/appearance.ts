import type { StoreAppearance } from "./types";

export const palettes = {
  terracotta: {
    label: "Terracota",
    accent: "#bc4a2b",
    dark: "#a13b20",
    paper: "#fffefa",
    background: "#f9f8f4",
    ink: "#353a31",
    muted: "#626957",
    line: "#ded5ca",
    hero: "#f0e6d7",
    soft: "#f6e9dd",
  },
  forest: {
    label: "Verde",
    accent: "#406839",
    dark: "#31522c",
    paper: "#fcfff9",
    background: "#f3f7ef",
    ink: "#293b2c",
    muted: "#52624f",
    line: "#cfddc9",
    hero: "#e1ebda",
    soft: "#eaf1e3",
  },
  ocean: {
    label: "Azul",
    accent: "#23638a",
    dark: "#194d6e",
    paper: "#fbfeff",
    background: "#f0f6fa",
    ink: "#233b4a",
    muted: "#526574",
    line: "#cadce7",
    hero: "#dcecf5",
    soft: "#e6f1f7",
  },
  plum: {
    label: "Ameixa",
    accent: "#79456e",
    dark: "#603456",
    paper: "#fffcff",
    background: "#f8f1f7",
    ink: "#3e2d3c",
    muted: "#6b5366",
    line: "#dfcfdb",
    hero: "#efe0ec",
    soft: "#f3e7f0",
  },
} as const;

export const layouts = {
  cozy: {
    label: "Acolhedor",
    description: "Cartões arredondados e espaçamento confortável.",
  },
  compact: {
    label: "Compacto",
    description: "Cartões e espaços menores para um cardápio direto.",
  },
  showcase: {
    label: "Vitrine",
    description: "Banner centralizado e produtos em destaque.",
  },
} as const;

export function appearanceStyles(appearance: StoreAppearance) {
  const palette = palettes[appearance.palette] ?? palettes.terracotta;
  const font = fonts[appearance.font] ?? fonts.editorial;
  return Object.entries({
    "--accent": palette.accent,
    "--accent-dark": palette.dark,
    "--paper": palette.paper,
    "--background": palette.background,
    "--ink": palette.ink,
    "--muted": palette.muted,
    "--line": palette.line,
    "--hero": palette.hero,
    "--soft": palette.soft,
    "--font-body": font.body,
    "--font-heading": font.heading,
    "--serif": font.heading,
  })
    .map(([key, value]) => `${key}:${value}`)
    .join(";");
}
export const fonts = {
  editorial: {
    label: "Acolhedora",
    heading: '"Fraunces Variable", Georgia, serif',
    body: '"DM Sans Variable", sans-serif',
  },
  simple: {
    label: "Moderna",
    heading: '"DM Sans Variable", sans-serif',
    body: '"DM Sans Variable", sans-serif',
  },
  classic: {
    label: "Clássica",
    heading: "Georgia, serif",
    body: "Georgia, serif",
  },
} as const;
