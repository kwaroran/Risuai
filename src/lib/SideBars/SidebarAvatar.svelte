<script lang="ts">
  import { tooltipRight } from "src/ts/gui/tooltip";
  import { folderBackground } from "src/ts/gui/folderAppearance";

  interface Props {
    rounded: boolean;
    src: string|Promise<string>;
    name: string;
    size?: string;
    onClick?: any;
    bordered?: boolean;
    color?: string;
    backgroundimg?: string|Promise<string>;
    children?: import('svelte').Snippet;
    oncontextmenu?: (event: MouseEvent & {
        currentTarget: EventTarget & HTMLSpanElement;
    }) => any
    chaId?: string;
  }

  let {
    rounded,
    src,
    name,
    size = "22",
    onClick = () => {},
    bordered = false,
    color = '',
    backgroundimg = '',
    children,
    oncontextmenu,
    chaId
  }: Props = $props();
</script>

{#snippet folderTile(resolvedBgImg = "", pending = false)}
  <div
    class="bg-skin-border sidebar-avatar rounded-md bg-top flex items-center justify-center"
    style:background-color={folderBackground(color)}
    style:width={size + "px"}
    style:height={size + "px"}
    style:minWidth={size + "px"}
    style:background-image={resolvedBgImg
      ? `url('${resolvedBgImg}')`
      : undefined}
    style:background-size={resolvedBgImg ? "cover" : undefined}
    style:background-position={resolvedBgImg ? "center" : undefined}
    class:rounded-md={!rounded}
    class:rounded-full={rounded}
  >
    {#if !pending && !resolvedBgImg}
      {@render children?.()}
    {/if}
  </div>
{/snippet}

<!-- svelte-ignore a11y_click_events_have_key_events -->
<span class="flex shrink-0 items-center justify-center avatar"
      class:border = {bordered}
      class:border-selected={bordered}
      class:rounded-md={bordered}
      oncontextmenu={oncontextmenu}
      onclick={onClick}
      use:tooltipRight={name}
      role="button"
      tabindex="0"
      data-char-id={chaId}
>
  {#if src}
    {#if src === "slot"}
      {#await backgroundimg}
        {@render folderTile("", true)}
      {:then resolvedBgImg}
        {@render folderTile(resolvedBgImg)}
      {/await}
    {:else}
      {#await src}
        <div
          class="bg-skin-border sidebar-avatar rounded-md bg-top"
          style:width={size + "px"}
          style:height={size + "px"}
          style:minWidth={size + "px"}
          class:rounded-md={!rounded} class:rounded-full={rounded} 
></div>
      {:then img}
        <img
          src={img}
          class="bg-skin-border sidebar-avatar rounded-md object-cover object-top"
          style:width={size + "px"}
          style:height={size + "px"}
          style:minWidth={size + "px"}
          class:rounded-md={!rounded} class:rounded-full={rounded} 
          alt="avatar"
        />
      {/await}
    {/if}
  {:else}
    <div
      class="bg-skin-border sidebar-avatar rounded-md bg-top"
      style:width={size + "px"}
      style:height={size + "px"}
      style:minWidth={size + "px"}
      class:rounded-md={!rounded} class:rounded-full={rounded} 
></div>
  {/if}
</span>
