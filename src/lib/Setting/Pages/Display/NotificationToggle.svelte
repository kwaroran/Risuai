<script lang="ts">
    import { language } from 'src/lang';
    import { alertError } from 'src/ts/alert';
    import { DBState } from 'src/ts/stores.svelte';
    import Check from 'src/lib/UI/GUI/CheckInput.svelte';
</script>

<div class="flex items-center mt-2">
    <Check
        bind:check={DBState.db.notification}
        name={language.notification}
        onChange={async () => {
            let hasPermission = { state: 'denied' };
            try {
                hasPermission = await navigator.permissions.query({ name: 'notifications' });
            } catch (error) {
                // Some browsers do not support the Permissions API.
            }
            if (!DBState.db.notification) {
                return;
            }
            if (hasPermission.state === 'denied') {
                const permission = await Notification.requestPermission();
                if (permission === 'denied') {
                    alertError(language.permissionDenied);
                    DBState.db.notification = false;
                }
            }
        }}
    />
</div>
