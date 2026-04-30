let rerolls:{[key:string]:string[]} = {};

export function addRerolls(genId:string, values:string[]){
    rerolls[genId] = values;
}

export function getRerolls(genId:string):string[]|null{
    return rerolls[genId] ?? null
}
