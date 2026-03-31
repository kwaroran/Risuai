import { defaultCBSRegisterArg, registerCBS } from 'src/ts/cbs';

function getMacroData(): { [key: string]: { isBlock: boolean, args: string[] } } {

    let dictionary: { [key: string]: { isBlock: boolean, args: string[] } } = {};

    registerCBS({
        ...defaultCBSRegisterArg,
        registerFunction: (arg) => {
            if(arg.internalOnly){
                return
            }
            const name = arg.name.startsWith('#') ? arg.name.slice(1) : arg.name;
            dictionary[name] = {
                isBlock: arg.name.startsWith('#'),
                args: []
            };
        }
    })
    return dictionary;
}
export function registerCBSMonaco() {
    
}