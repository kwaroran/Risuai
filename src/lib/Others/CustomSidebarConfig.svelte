<script lang="ts">
    import { customSideBarConfigDialogStore, DBState } from "src/ts/stores.svelte";
    import Button from "../UI/GUI/Button.svelte";
    import { language } from "src/lang";
    import { getFullSettingsData } from "src/ts/setting/utils";
    import TextInput from "../UI/GUI/TextInput.svelte";


    let configPage: "list" | "add" | "addSettingsSubmenu" = $state("list");
    let search = $state("");
</script>

<!-- svelte-ignore a11y_click_events_have_key_events -->
<!-- svelte-ignore a11y_no_static_element_interactions -->
<div
    class="fixed inset-0 bg-black/50 z-50 flex items-center justify-center"
    onclick={() => (customSideBarConfigDialogStore.open = false)}
>
    <div
        class="bg-darkbg p-4 rounded max-h-full overflow-auto flex flex-col gap-2"
        onclick={(e) => e.stopPropagation()}
    >
        {#if configPage === "list"}
            <div
                class="m-4 border-darkborderc p-2 border rounded-sm flex flex-col w-xl max-w-full"
            >
                {#if DBState.db.customSidebarItems.length === 0}
                    <div class="text-textcolor2">
                        No custom sidebar items configured
                    </div>
                {/if}

                {#each DBState.db.customSidebarItems as item}
                    <div
                        class="border-darkborderc p-2 border rounded-sm flex items-start"
                    >
                        <div class="flex-1">{item.label}</div>

                        <button
                            class="ml-2"
                            onclick={() => {
                                DBState.db.customSidebarItems =
                                    DBState.db.customSidebarItems.filter(
                                        (i) => i.id !== item.id,
                                    );
                            }}
                        >
                            Delete
                        </button>
                    </div>
                {/each}
            </div>

            <Button
                onclick={() => {
                    configPage = "add";
                }}
            >
                Add Item
            </Button>

            <Button
                onclick={() => {
                    customSideBarConfigDialogStore.open = false;
                }}
            >
                Close
            </Button>
        {/if}

        {#if configPage === "add"}
            <Button
                onclick={() => {
                    DBState.db.customSidebarItems.push({
                        id: crypto.randomUUID(),
                        type: "model",
                        subType: "none",
                        label: language.model,
                    });
                    configPage = "list";
                }}
            >
                {language.model}
            </Button>

            <Button
                onclick={() => {
                    DBState.db.customSidebarItems.push({
                        id: crypto.randomUUID(),
                        type: "preset",
                        subType: "none",
                        label: language.presets,
                    });
                    configPage = "list";
                }}
            >
                {language.presets}
            </Button>

            <Button
                onclick={() => {
                    DBState.db.customSidebarItems.push({
                        id: crypto.randomUUID(),
                        type: "loadout",
                        subType: "none",
                        label: language.loadouts,
                    });
                    configPage = "list";
                }}
            >
                {language.loadouts}
            </Button>

            <Button
                onclick={() => {
                    DBState.db.customSidebarItems.push({
                        id: crypto.randomUUID(),
                        type: "persona",
                        subType: "none",
                        label: language.persona,
                    });
                    configPage = "list";
                }}
            >
                {language.persona}
            </Button>

            <Button
                onclick={() => {
                    search = "";
                    configPage = "addSettingsSubmenu";
                }}
            >
                {language.settings}
            </Button>

            <Button
                onclick={() => {
                    configPage = "list";
                }}
            >
                Back to List
            </Button>
        {/if}

        {#if configPage === "addSettingsSubmenu"}
            <div class="flex flex-col gap-2">
                <TextInput bind:value={search} placeholder="Search..." />
                <Button
                    onclick={() => {
                        configPage = "add";
                    }}
                >
                    Back
                </Button>

                {#each getFullSettingsData(search) as type}
                    <Button
                        onclick={() => {
                            DBState.db.customSidebarItems.push({
                                id: crypto.randomUUID(),
                                type: "setting",
                                subType: type.id,
                                label: language[type.labelKey] || type.id,
                            });
                            configPage = "list";
                        }}
                    >
                        {language[type.labelKey] || type.id}
                    </Button>
                {/each}
            </div>
        {/if}
    </div>
</div>
