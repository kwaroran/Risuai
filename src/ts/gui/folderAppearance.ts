import type { folder } from "../storage/database.svelte";

export interface FolderAppearance {
  icon?: string;
}

export const folderColors = [
  "red",
  "green",
  "blue",
  "yellow",
  "indigo",
  "purple",
  "pink",
  "default",
] as const;

// Use the same Tailwind colors and opacity as the existing sidebar tiles.
export function folderBackground(color: string): string {
  const base = folderColors.some(
    (value) => value === color && value !== "default",
  )
    ? `var(--color-${color}-700)`
    : "var(--risu-theme-darkbg)";
  return `color-mix(in oklab, ${base} 50%, transparent)`;
}

export type FolderSettingsValues = Pick<
  folder,
  "name" | "color" | "appearance" | "imgFile" | "img"
>;

// Resolve by stable ID at commit time: folders can move while a dialog is open.
export function applyFolderSettings(
  order: (string | folder)[],
  id: string,
  values: FolderSettingsValues,
): boolean {
  const target = order.find(
    (entry): entry is folder => typeof entry !== "string" && entry.id === id,
  );
  if (!target) return false;
  Object.assign(target, values);
  return true;
}
