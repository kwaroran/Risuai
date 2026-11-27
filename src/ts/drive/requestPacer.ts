/**
 * Returns a function that resolves once another request fits, keeping the
 * requests in any `windowMs` long stretch at `limit` or fewer.
 */
export function createRequestPacer(limit:number, windowMs:number) {
    const times: number[] = []
    return async () => {
        for(;;){
            const now = Date.now()
            while(times.length > 0 && times[0] <= now - windowMs){
                times.shift()
            }
            if(times.length < limit){
                times.push(now)
                return
            }
            //another waiter may take the slot first, so check again after waking
            await new Promise((resolve) => setTimeout(resolve, times[0] + windowMs - now))
        }
    }
}
