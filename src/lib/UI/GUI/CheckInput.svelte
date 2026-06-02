<script lang="ts">

    interface Props {
        check?: boolean;
        onChange?: (check:boolean) => any;
        margin?: boolean;
        name?: string;
        hiddenName?: boolean;
        reverse?: boolean;
        className?: string;
        grayText?: boolean;
        children?: import('svelte').Snippet;
    }

    let {
        check = $bindable(),
        onChange = (check:boolean) => {},
        margin = true,
        name = '',
        hiddenName = false,
        reverse = false,
        className = '',
        grayText = false,
        children
    }: Props = $props();

    let stateLabel = $derived(name ? `${name} ${check ? 'enabled' : 'disabled'}` : check ? 'enabled' : 'disabled');
</script>

<label 
    class={"flex items-center gap-2 cursor-pointer select-none" + (className ? " " + className : "") + (grayText ? " text-textcolor2" : " text-textcolor")}
    class:mr-2={margin}
    aria-label={hiddenName ? stateLabel : undefined}
>
    {#if reverse}
        <span class="min-w-0">{name} {@render children?.()}</span>
    {/if}
    <input 
        class="peer sr-only" 
        type="checkbox" 
        alt={name}
        bind:checked={check}
        onchange={() => {
            onChange(check)
        }}
        role="switch"
        aria-checked={check}
        aria-label={stateLabel}
    />
    <span 
        class="relative inline-flex h-6 w-[2.625rem] min-w-[2.625rem] shrink-0 items-center rounded-full border {check ? 'border-textcolor bg-textcolor' : 'border-darkborderc bg-darkbutton'} transition-colors duration-200 peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-borderc"
        aria-hidden="true"
    >
        <span
            class="absolute left-0.5 h-5 w-5 rounded-full shadow-sm transition-all duration-200 {check ? 'translate-x-4 bg-bgcolor' : 'translate-x-0 bg-textcolor'}"
            aria-hidden="true"
        ></span>
    </span>
    {#if !hiddenName && !reverse}
        <span class="min-w-0">{name} {@render children?.()}</span>
    {/if}
</label>
