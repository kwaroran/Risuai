import { alertConfirm, alertWait } from "./alert";
import { language } from "../lang";
import {
    check,
} from '@tauri-apps/plugin-updater'
import { relaunch } from '@tauri-apps/plugin-process'

export async function checkRisuUpdate(){
    try {
        const checked = await check()     
        if(checked){
            const conf = await alertConfirm(language.newVersion)
            if(conf){
                alertWait(`Updating to ${checked.version}...`)
                await checked.downloadAndInstall()
                await relaunch()
            }
        }
    } catch (error) {
        console.error(error)
    }
}
