import { getDatabase } from "../storage/database.svelte";

export const RADIUS_SCALE_MIN = 0
export const RADIUS_SCALE_MAX = 1.5

export function normalizeRadiusScale(value: unknown): number | null {
    if(typeof value !== 'number' || !Number.isFinite(value)){
        return null
    }
    return Math.min(RADIUS_SCALE_MAX, Math.max(RADIUS_SCALE_MIN, value))
}

export function updateRadiusScale(){
    const db = getDatabase();
    const scale = normalizeRadiusScale(db.radiusScale) ?? 1
    document.documentElement.style.setProperty('--risu-radius-scale', String(scale));
}
