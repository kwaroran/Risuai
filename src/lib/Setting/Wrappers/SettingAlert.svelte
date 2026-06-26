<script lang="ts">
    import type { SettingItem, SettingContext } from 'src/ts/setting/types';
    import { getLabel } from 'src/ts/setting/utils';
    import { language } from 'src/lang';
    import AlertCallout from 'src/lib/UI/Alert/AlertCallout.svelte';

    interface Props {
        item: SettingItem;
        ctx: SettingContext;
    }

    let { item }: Props = $props();

    const severity = $derived(item.options?.severity ?? 'info');
    const title = $derived.by(() => {
        const titleKey = item.options?.titleKey;
        if (titleKey && Object.prototype.hasOwnProperty.call(language, titleKey)) {
            const localizedTitle = language[titleKey as keyof typeof language];
            if (typeof localizedTitle === 'string') {
                return localizedTitle;
            }
        }

        return item.options?.title;
    });
</script>

<AlertCallout {severity} {title} className={item.classes ?? 'my-2'}>
    {getLabel(item)}
</AlertCallout>
