export type AlertSeverity = 'info' | 'success' | 'warning' | 'error' | 'neutral';

export type AlertSurface = 'modal' | 'inline' | 'dialog';

export type ToastKind =
    | 'export'
    | 'import'
    | 'clipboard'
    | 'backup'
    | 'settings'
    | 'model'
    | 'preset'
    | 'storage'
    | 'request'
    | 'ui';

export type ToastFailureClass =
    | 'auth'
    | 'rateLimit'
    | 'network'
    | 'provider'
    | 'validation'
    | 'unknown';

export interface ToastOptions {
    kind?: ToastKind;
    failureClass?: ToastFailureClass;
    status?: number;
    provider?: string;
    model?: string;
    source?: string;
    dedupeKey?: string;
    aggregate?: boolean;
}

export interface ToastQueueItem {
    id: number;
    message: string;
    severity: AlertSeverity;
    dedupeKey: string;
    aggregate: boolean;
    count: number;
    refreshKey: number;
    createdAt: number;
    updatedAt: number;
}

export type LegacyAlertType =
    | 'error'
    | 'normal'
    | 'none'
    | 'ask'
    | 'wait'
    | 'selectChar'
    | 'input'
    | 'wait2'
    | 'markdown'
    | 'select'
    | 'login'
    | 'tos'
    | 'cardexport'
    | 'requestdata'
    | 'addchar'
    | 'hypaV2'
    | 'selectModule'
    | 'chatOptions'
    | 'pukmakkurit'
    | 'branches'
    | 'progress'
    | 'pluginconfirm'
    | 'requestlogs';

export interface StandardAlertDescriptor {
    severity: AlertSeverity;
    surface: AlertSurface;
    blocking: boolean;
    dismissible: boolean;
    autoDismiss: boolean;
}

const dialogAlertTypes = new Set<LegacyAlertType>([
    'cardexport',
    'selectModule',
    'pukmakkurit',
    'branches',
    'requestlogs',
]);

export function getAlertDescriptor(type: LegacyAlertType): StandardAlertDescriptor {
    if (dialogAlertTypes.has(type)) {
        return {
            severity: type === 'requestlogs' ? 'info' : 'neutral',
            surface: 'dialog',
            blocking: true,
            dismissible: true,
            autoDismiss: false,
        };
    }

    return {
        severity: getLegacyAlertSeverity(type),
        surface: 'modal',
        blocking: type !== 'none',
        dismissible: type !== 'wait' && type !== 'wait2' && type !== 'progress',
        autoDismiss: false,
    };
}

export function getLegacyAlertSeverity(type: LegacyAlertType): AlertSeverity {
    switch (type) {
        case 'error':
            return 'error';
        case 'ask':
        case 'pluginconfirm':
        case 'tos':
            return 'warning';
        case 'progress':
        case 'wait':
        case 'wait2':
        case 'login':
        case 'select':
        case 'selectChar':
        case 'input':
            return 'info';
        case 'normal':
        case 'markdown':
            return 'neutral';
        default:
            return 'neutral';
    }
}
