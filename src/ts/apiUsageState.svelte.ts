import type { ApiUsageStats } from './apiUsage'

export const ApiUsageState = $state<ApiUsageStats>({
    daily: {},
    recentRequests: [],
})

let usageChanged = () => {}

export function replaceApiUsageState(value: ApiUsageStats) {
    ApiUsageState.daily = value.daily
    ApiUsageState.recentRequests = value.recentRequests
}

export function notifyApiUsageChanged() {
    usageChanged()
}

export function setApiUsageChangeListener(listener: () => void) {
    usageChanged = listener
}
