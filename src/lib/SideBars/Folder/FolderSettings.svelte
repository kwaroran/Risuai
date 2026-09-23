<script lang="ts">
  import { onMount, untrack } from "svelte";
  import { CheckIcon, XIcon } from "@lucide/svelte";
  import { language } from "src/lang";
  import type { folder } from "src/ts/storage/database.svelte";
  import {
    folderBackground,
    folderColors,
    type FolderSettingsValues,
  } from "src/ts/gui/folderAppearance";
  import FolderGlyph from "./FolderGlyph.svelte";
  import { folderIcons } from "./icons";
  import SegmentedControl from "src/lib/UI/GUI/SegmentedControl.svelte";

  let {
    initial,
    imageSrc = "",
    rounded = false,
    showName = false,
    onsave,
    onclose,
  }: {
    initial: folder;
    imageSrc?: string | Promise<string>;
    rounded?: boolean;
    showName?: boolean;
    onsave: (values: FolderSettingsValues, image?: File) => Promise<void>;
    onclose: () => void;
  } = $props();
  const original = untrack(() => initial);
  const ids = $props.id();
  let name = $state(original.name);
  // Existing longer names must survive opening and saving this dialog.
  const nameLimit = Math.max(20, original.name.length);
  let icon = $state(original.appearance?.icon ?? "folder");
  const appearance = $derived({ icon });
  let background = $state(original.color);
  let mode = $state<string | number>(original.imgFile ? "image" : "icon");
  const imageMode = $derived(mode === "image");
  let selectedImage = $state<File>();
  let previewUrl = $state("");
  let saving = $state(false);
  let loadingImage = $state(false);
  let error = $state("");
  let dialog: HTMLDialogElement;
  let fileInput = $state<HTMLInputElement>();
  let active = true;
  onMount(() => {
    dialog.showModal();
    return () => {
      active = false;
      if (previewUrl) URL.revokeObjectURL(previewUrl);
      dialog.close();
    };
  });

  function close() {
    if (!saving) onclose();
  }

  async function chooseImage(event: Event) {
    const input = event.currentTarget as HTMLInputElement;
    const file = input.files?.[0];
    input.value = "";
    if (!file) return;
    error = "";
    loadingImage = true;
    let url = "";
    try {
      if (!/\.(png|jpe?g|webp)$/i.test(file.name)) throw new Error("format");
      url = URL.createObjectURL(file);
      const image = new Image();
      image.src = url;
      await image.decode();
      if (!active) return;
      if (previewUrl) URL.revokeObjectURL(previewUrl);
      previewUrl = url;
      url = "";
      selectedImage = file;
      mode = "image";
    } catch {
      if (active) error = language.folderSettings.imageError;
    } finally {
      if (url) URL.revokeObjectURL(url);
      loadingImage = false;
    }
  }

  async function save(event: SubmitEvent) {
    event.preventDefault();
    if (saving || loadingImage || !name.trim()) return;
    saving = true;
    error = "";
    try {
      await onsave(
        {
          name: name.trim(),
          color: background,
          appearance,
          imgFile: imageMode ? original.imgFile : undefined,
          img: imageMode ? original.img : undefined,
        },
        imageMode ? selectedImage : undefined,
      );
      if (active) onclose();
    } catch {
      if (active) error = language.folderSettings.saveError;
    } finally {
      saving = false;
    }
  }
</script>

<dialog
  bind:this={dialog}
  class="fixed inset-0 m-auto w-[min(480px,calc(100vw_-_24px))] max-w-none max-h-[min(860px,calc(100dvh_-_32px))] overflow-hidden rounded-md border-0 bg-darkbg p-0 text-textcolor backdrop:bg-[#0008]"
  aria-labelledby={`${ids}-title`}
  oncancel={(event) => {
    event.preventDefault();
    close();
  }}
  onkeydown={(event) => event.stopPropagation()}
>
  <form
    class="flex max-h-[min(858px,calc(100dvh_-_34px))] flex-col"
    onsubmit={save}
  >
    <header
      class="flex shrink-0 items-center justify-between gap-3 px-4 pt-3 pb-2"
    >
      <h2 id={`${ids}-title`} class="text-lg font-bold">
        {language.folderSettings.title}
      </h2>
      <button
        type="button"
        class="grid size-9 place-items-center rounded-lg text-textcolor2 hover:bg-textcolor/10"
        aria-label={language.folderSettings.close}
        disabled={saving}
        onclick={close}><XIcon size={20} /></button
      >
    </header>
    <div
      class="flex min-h-0 flex-col gap-3 overflow-y-auto overscroll-contain px-4 pb-3 [scrollbar-gutter:stable]"
    >
      <fieldset class="contents" disabled={saving || loadingImage}>
        <div class="folder-header grid grid-cols-[120px_minmax(0,1fr)] gap-3">
          <section
            aria-label={language.preview}
            class="row-span-2 flex items-center justify-center"
          >
            <div class="rounded-md border border-selected">
              <div
                class="flex size-24 items-center justify-center overflow-hidden"
                class:rounded-full={rounded}
                class:rounded-md={!rounded}
                style:background={folderBackground(background)}
              >
                {#if imageMode && (previewUrl || original.imgFile)}
                  {#await previewUrl || imageSrc then src}
                    {#if src}<img
                        class="size-full object-cover"
                        {src}
                        alt=""
                      />{/if}
                  {/await}
                {:else if showName}
                  <span class="hyphens-auto truncate font-bold">{name}</span>
                {:else}
                  <FolderGlyph {appearance} size={40} />
                {/if}
              </div>
            </div>
          </section>
          <div class="min-w-0 flex-1">
            <label for={`${ids}-name`} class="mb-2 block text-sm font-medium"
              >{language.folderName}</label
            >
            <div
              class="flex items-center gap-2 rounded-lg border border-borderc bg-bgcolor px-3 focus-within:outline-2 focus-within:outline-primary-400"
            >
              <input
                id={`${ids}-name`}
                bind:value={name}
                maxlength={nameLimit}
                required
                class="min-w-0 flex-1 bg-transparent py-2 outline-none"
              />
            </div>
          </div>
          <div class="min-w-0">
            <SegmentedControl
              bind:value={mode}
              options={[
                { value: "icon", label: language.folderSettings.defaultIcon },
                { value: "image", label: language.image },
              ]}
              size="sm"
              className="mb-0!"
            />
          </div>
        </div>
        {#if imageMode}
          <div>
            <button
              type="button"
              class="action bg-darkbutton hover:bg-textcolor/10"
              onclick={() => fileInput?.click()}
            >
              {language.folderSettings.upload}
            </button>
            <input
              bind:this={fileInput}
              type="file"
              accept=".png,.jpg,.jpeg,.webp"
              class="hidden"
              tabindex="-1"
              aria-label={language.folderSettings.upload}
              onchange={chooseImage}
            />
            <p class="mt-2 text-xs text-textcolor2">
              {language.folderSettings.imageHint}
            </p>
          </div>
        {:else}
          <fieldset class="min-w-0">
            <legend class="mb-2 text-sm font-medium"
              >{language.folderSettings.background}</legend
            >
            <div class="grid grid-cols-[repeat(8,minmax(0,32px))] gap-[5px]">
              {#each folderColors as color}
                {@const selected =
                  background === color ||
                  (color === "default" &&
                    !folderColors.some((entry) => entry === background))}
                <button
                  type="button"
                  class="swatch relative flex aspect-square w-full min-w-0 items-center justify-center rounded-[5px] border border-textcolor/20"
                  style:background={folderBackground(color)}
                  aria-label={`${language.folderSettings.background}: ${color}`}
                  aria-pressed={selected}
                  title={color}
                  onclick={() => (background = color)}
                >
                  {#if selected}<CheckIcon
                      size={17}
                      class="text-white [filter:drop-shadow(0_1px_2px_black)]"
                    />{/if}
                </button>
              {/each}
            </div>
          </fieldset>
          <fieldset class="min-w-0">
            <legend class="mb-[5px] text-sm font-medium">{language.icon}</legend
            >
            <div
              class="icons grid max-h-[122px] grid-cols-9 gap-1 overflow-y-auto overscroll-contain p-[3px] [scrollbar-gutter:stable]"
              role="group"
              aria-label={language.icon}
            >
              {#each Object.entries(folderIcons) as [key, Icon]}
                <button
                  type="button"
                  class="flex h-9 items-center justify-center rounded-[9px] border-2 border-transparent text-textcolor2 hover:bg-textcolor/10 aria-pressed:border-textcolor aria-pressed:bg-textcolor/10 aria-pressed:text-textcolor"
                  aria-pressed={icon === key}
                  aria-label={key}
                  onclick={() => (icon = key)}><Icon size={20} /></button
                >
              {/each}
            </div>
          </fieldset>
        {/if}
      </fieldset>
      {#if error}<p role="alert" class="text-sm text-draculared">
          {error}
        </p>{/if}
    </div>
    <footer class="flex shrink-0 justify-end gap-2 px-4 py-3">
      <button
        type="button"
        class="action bg-darkbutton hover:bg-textcolor/10"
        disabled={saving}
        onclick={close}>{language.cancel}</button
      >
      <button
        type="submit"
        class="action bg-primary-600 text-white hover:bg-primary-700"
        disabled={saving || loadingImage || !name.trim()}
        >{saving
          ? language.folderSettings.saving
          : language.folderSettings.save}</button
      >
    </footer>
  </form>
</dialog>

<style>
  .action {
    min-width: 80px;
    min-height: 36px;
    border-radius: 9px;
    padding: 6px 16px;
  }
  button {
    cursor: pointer;
  }
  button:disabled:not(.swatch) {
    opacity: 0.5;
    cursor: default;
  }
  .swatch[aria-pressed="true"] {
    outline: 2px solid var(--risu-theme-textcolor);
    outline-offset: 1px;
  }
  @media (max-width: 480px) {
    .folder-header {
      gap: 8px;
    }
    .folder-header input:not([type="file"]) {
      font-size: 16px;
    }
    .icons {
      grid-template-columns: repeat(8, minmax(0, 1fr));
    }
  }
</style>
