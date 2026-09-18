import { afterEach, describe, expect, it, vi } from "vitest";
import { mount, tick, unmount } from "svelte";
import FolderSettings from "./FolderSettings.svelte";
import { language } from "src/lang";
import type { folder } from "src/ts/storage/database.svelte";

let mounted: ReturnType<typeof mount>;
async function render(
  initial: folder,
  onsave = vi.fn().mockResolvedValue(undefined),
) {
  const onclose = vi.fn();
  mounted = mount(FolderSettings, {
    target: document.body,
    props: { initial, onsave, onclose },
  });
  await tick();
  return { onsave, onclose };
}
function button(label: string) {
  return Array.from(document.querySelectorAll("button")).find(
    (el) =>
      el.getAttribute("aria-label") === label ||
      el.textContent?.trim() === label,
  )!;
}
function initial(): folder {
  return {
    id: "folder",
    name: "Original",
    color: "red",
    data: ["character"],
    imgFile: "old.png",
    img: "old-url",
  };
}
async function inputName(value: string) {
  const input = document.querySelector<HTMLInputElement>("input:not([type])")!;
  input.value = value;
  input.dispatchEvent(new Event("input", { bubbles: true }));
  await tick();
}
async function submit() {
  document
    .querySelector("form")!
    .dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
  await tick();
  await Promise.resolve();
  await tick();
}
afterEach(async () => {
  if (mounted) await unmount(mounted);
  document.body.replaceChildren();
  vi.restoreAllMocks();
});

describe("folder settings draft lifecycle", () => {
  it("discards edits on cancel without changing saved data or writing assets", async () => {
    const source = initial();
    const { onsave, onclose } = await render(source);
    await inputName("Draft");
    button(language.folderSettings.defaultIcon).click();
    await tick();
    button(`${language.folderSettings.background}: blue`).click();
    button(language.cancel).click();
    expect(source).toEqual(initial());
    expect(onsave).not.toHaveBeenCalled();
    expect(onclose).toHaveBeenCalledOnce();
  });

  it("resets the image and saves the selected icon and legacy color only on submit", async () => {
    const { onsave, onclose } = await render(initial());
    button(language.folderSettings.defaultIcon).click();
    await tick();
    button(`${language.folderSettings.background}: blue`).click();
    button("heart").click();
    await tick();
    expect(onsave).not.toHaveBeenCalled();
    await submit();
    expect(onsave.mock.calls[0][0]).toEqual({
      name: "Original",
      color: "blue",
      appearance: { icon: "heart" },
      imgFile: undefined,
      img: undefined,
    });
    expect(onclose).toHaveBeenCalledOnce();
  });
});
