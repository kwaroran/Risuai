import { describe, expect, it } from "vitest";
import { applyFolderSettings, folderBackground } from "./folderAppearance";
import type { folder } from "../storage/database.svelte";

describe("folder appearance compatibility", () => {
  it("keeps legacy backgrounds and falls back for unknown saved values", () => {
    expect(folderBackground("red")).toBe(
      "color-mix(in oklab, var(--color-red-700) 50%, transparent)",
    );
    expect(folderBackground("unknown")).toContain("--risu-theme-darkbg");
    expect(folderBackground("default")).toContain("--risu-theme-darkbg");
  });

  it("updates the intended folder after reordering while preserving its live contents", () => {
    const target: folder = {
      id: "target",
      name: "Old",
      color: "red",
      data: ["new-character"],
      imgFile: "old.png",
    };
    const other: folder = {
      id: "other",
      name: "Other",
      color: "blue",
      data: [],
    };
    const order = [other, "character", target];
    expect(
      applyFolderSettings(order, "target", {
        name: "New",
        color: "blue",
        imgFile: undefined,
        img: undefined,
      }),
    ).toBe(true);
    expect(target.data).toEqual(["new-character"]);
    expect(target.color).toBe("blue");
    expect(target.name).toBe("New");
    expect(target.imgFile).toBeUndefined();
    expect(other.name).toBe("Other");
    const before = JSON.stringify(order);
    expect(
      applyFolderSettings(order, "deleted", { name: "Lost", color: "red" }),
    ).toBe(false);
    expect(JSON.stringify(order)).toBe(before);
  });
});
