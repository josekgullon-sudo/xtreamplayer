import { ProviderRow } from "./db";
import { SITE_NAME } from "./site";

/**
 * Marca blanca: cada proveedor puede vestir la parte que ven sus clientes
 * (acceso y reproductor) con su nombre, su color y su logotipo.
 */

export interface Branding {
  name: string;
  color: string;
  logo: string;
  support: string;
  slug: string;
  isWhiteLabel: boolean;
}

export const DEFAULT_BRANDING: Branding = {
  name: SITE_NAME,
  color: "",
  logo: "",
  support: "",
  slug: "",
  isWhiteLabel: false,
};

export function brandingOf(provider: ProviderRow | null | undefined): Branding {
  if (!provider) return DEFAULT_BRANDING;
  const name = (provider.brand_name || "").trim();
  const color = normalizeHexColor(provider.brand_color);
  return {
    name: name || SITE_NAME,
    color,
    logo: provider.brand_logo || "",
    support: provider.brand_support || "",
    slug: provider.brand_slug || "",
    isWhiteLabel: Boolean(name || color || provider.brand_logo),
  };
}

export function normalizeHexColor(input: string | null | undefined): string {
  const value = (input || "").trim();
  if (!value) return "";
  const hex = value.startsWith("#") ? value : `#${value}`;
  return /^#[0-9a-fA-F]{6}$/.test(hex) ? hex.toLowerCase() : "";
}

export function isValidSlug(slug: string): boolean {
  return /^[a-z0-9][a-z0-9-]{1,30}[a-z0-9]$/.test(slug);
}

export function normalizeSlug(input: string): string {
  return (input || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9-]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 32);
}

/* ---------- Derivación de la paleta a partir de un solo color ---------- */

function hexToRgb(hex: string): [number, number, number] {
  return [
    parseInt(hex.slice(1, 3), 16),
    parseInt(hex.slice(3, 5), 16),
    parseInt(hex.slice(5, 7), 16),
  ];
}

function clamp(n: number): number {
  return Math.max(0, Math.min(255, Math.round(n)));
}

function mix(rgb: [number, number, number], target: number, amount: number): string {
  const [r, g, b] = rgb;
  return `#${[r, g, b]
    .map((c) => clamp(c + (target - c) * amount).toString(16).padStart(2, "0"))
    .join("")}`;
}

/**
 * A partir del color elegido genera las variables CSS necesarias.
 * Así el proveedor solo elige un color y el resto se calcula.
 */
export function brandCssVars(color: string): string {
  const hex = normalizeHexColor(color);
  if (!hex) return "";
  const rgb = hexToRgb(hex);
  const [r, g, b] = rgb;
  const rgba = (a: number) => `rgba(${r}, ${g}, ${b}, ${a})`;

  return [
    `--accent:${hex}`,
    `--accent-bright:${mix(rgb, 255, 0.25)}`,
    `--accent-deep:${mix(rgb, 0, 0.38)}`,
    `--accent-soft:${mix(rgb, 255, 0.55)}`,
    `--accent-glow:${rgba(0.35)}`,
    `--accent-tint-soft:${rgba(0.1)}`,
    `--accent-tint:${rgba(0.18)}`,
    `--accent-tint-strong:${rgba(0.28)}`,
    `--accent-halo:${rgba(0.2)}`,
    `--accent-halo-deep:${rgba(0.12)}`,
  ].join(";");
}
