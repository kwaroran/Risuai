import type { AlertSeverity } from 'src/ts/alertModel';

export interface AlertSeverityStyle {
    iconColor: string;
    chipBg: string;
    accent: string;
    glow: string;
}

export const alertSeverityStyles: Record<AlertSeverity, AlertSeverityStyle> = {
    success: {
        iconColor: 'rgb(52 211 153)',
        chipBg: 'rgb(52 211 153 / 0.16)',
        accent: 'rgb(52 211 153 / 0.55)',
        glow: 'rgb(52 211 153 / 0.22)',
    },
    info: {
        iconColor: 'rgb(96 165 250)',
        chipBg: 'rgb(96 165 250 / 0.16)',
        accent: 'rgb(96 165 250 / 0.55)',
        glow: 'rgb(96 165 250 / 0.22)',
    },
    warning: {
        iconColor: 'rgb(251 191 36)',
        chipBg: 'rgb(251 191 36 / 0.16)',
        accent: 'rgb(251 191 36 / 0.55)',
        glow: 'rgb(251 191 36 / 0.22)',
    },
    error: {
        iconColor: 'rgb(248 113 113)',
        chipBg: 'rgb(248 113 113 / 0.16)',
        accent: 'rgb(248 113 113 / 0.55)',
        glow: 'rgb(248 113 113 / 0.22)',
    },
    neutral: {
        iconColor: 'rgb(156 163 175)',
        chipBg: 'rgb(156 163 175 / 0.16)',
        accent: 'rgb(156 163 175 / 0.45)',
        glow: 'rgb(0 0 0 / 0.2)',
    },
};
