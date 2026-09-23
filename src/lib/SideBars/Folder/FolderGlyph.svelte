<script lang="ts">
  import { FolderOpenIcon } from "@lucide/svelte";
  import { type FolderAppearance } from "src/ts/gui/folderAppearance";
  import { getFolderIcon } from "./icons";
  let {
    appearance,
    open = false,
    size = 24,
  }: {
    appearance?: FolderAppearance;
    open?: boolean;
    size?: number;
  } = $props();
  const Icon = $derived(
    open && (!appearance?.icon || appearance.icon === "folder")
      ? FolderOpenIcon
      : getFolderIcon(appearance?.icon),
  );
</script>

<span class="flex items-center justify-center" aria-hidden="true">
  <Icon {size} />
</span>
