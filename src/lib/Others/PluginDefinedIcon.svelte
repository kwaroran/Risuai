<script lang="ts">
    import DOMPurify from 'dompurify';
    import IrisImage from "../../etc/Airisu.webp";
    import { DBState } from 'src/ts/stores.svelte';

    let {
        ico,
        className
    }: {
        ico: {
            iconType:'html'|'img'|'none',
            icon:string
        },
        className?:string
    } = $props()

    
    const iconPurify = (icon:string) => {
        
        return DOMPurify.sanitize(icon, {
            FORBID_TAGS: ['script', 'style', 'iframe', 'object', 'embed'],
            FORBID_ATTR: ['onerror', 'onclick', 'onload', 'onmouseover', 'style', 'class']
        });
    }

    const isSafeSchema = (url:string) => {
        try {
            const parsedUrl = new URL(url);
            const allowedProtocols = ['http:', 'https:', 'data:', 'blob:'];
            if (allowedProtocols.includes(parsedUrl.protocol)) {
                return url;
            } else {
                console.warn(`Blocked URL with unsafe protocol: ${parsedUrl.protocol}`);
                return '';
            }
        } catch (e) {
            console.warn(`Invalid URL: ${url}`);
            return '';
        }
    }

</script>

<div class={{
    "w-12 h-12": ico.icon === 'iconAprilFoolsSpinner',
    "w-5 h-5": !className && ico.icon !== 'iconAprilFoolsSpinner',
    [className]: className,
    "hidden": ico.icon === 'iconAprilFoolsSpinner' && DBState?.db?.disableAprilFools
}}>
    {#if ico.iconType === 'html'}
        {@html iconPurify(ico.icon)}
    {:else if ico.icon === 'iconAprilFoolsSpinner'}
        <!-- Spinning Image -->
        <img src={IrisImage} alt="April Fools Spinner" class="w-full h-full min-w-12 min-h-12 animate-spin" />
    {:else if ico.iconType === 'img'}
        <img src={isSafeSchema(ico.icon)} alt="icon" />
    {/if}
</div>