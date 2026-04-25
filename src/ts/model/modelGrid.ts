/** Normalized model item for the generic ModelGrid component */
export type ModelGridItem = {
    id: string
    displayName: string
    providerName: string
    description: string
    context_length: number
    /** Used for price-sort; use Infinity when price is unknown */
    sortPrice: number
    /** Price rows to display on the card, e.g. [{label:'In', value:'$1.00'}] */
    prices: { label: string; value: string }[]
}

/** Pinned/special entries shown above the main list, unaffected by search/sort */
export type ModelGridPinnedItem = {
    id: string
    displayName: string
    providerName: string
}
