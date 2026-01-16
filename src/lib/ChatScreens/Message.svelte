<!--
    A rewrite of Chat.svelte for future-proofing and better maintainability.

    Unlike Chat.svelte, this component doesn't have side-effects,
    and all data is passed in as props and only renders based on that data.
-->

<script lang="ts">

    interface Props {
        characterIcon: string;
        characterName: string;
        characterIconType: 'normal'|'portrait'

        onCopy: () => void;
        onBookmark: () => void;
        onRegenerate: () => void;
        onDegenerate: () => void;
        onRemove: () => void;
        onDisableButtonClick: () => void;
        onCutButtonClick: () => void;
        pagesString: string;
        isTranslation: boolean;
        isBookmarked: boolean;
        isComment: boolean;
        isDisabled: boolean;
        message: string;
    }

    const props: Props = $props();

</script>

<!-- TODO -->