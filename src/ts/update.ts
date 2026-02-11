import { alertConfirm, alertSelect, alertWait } from "./alert";
import { language } from "../lang";
import {
    check,
} from '@tauri-apps/plugin-updater'
import { relaunch } from '@tauri-apps/plugin-process'

const UPDATE_REMINDER_KEY = 'risu_update_reminder'

interface UpdateReminder {
    until: number
}

function getUpdateReminder(): UpdateReminder | null {
    try {
        const stored = localStorage.getItem(UPDATE_REMINDER_KEY)
        if (stored) {
            return JSON.parse(stored)
        }
    } catch {
        // Ignore parse errors
    }
    return null
}

function setUpdateReminder(days: number): void {
    const until = Date.now() + days * 24 * 60 * 60 * 1000
    localStorage.setItem(UPDATE_REMINDER_KEY, JSON.stringify({ until }))
}

function clearUpdateReminder(): void {
    localStorage.removeItem(UPDATE_REMINDER_KEY)
}

function isUpdateReminderActive(): boolean {
    const reminder = getUpdateReminder()
    if (reminder && reminder.until > Date.now()) {
        return true
    }
    if (reminder) {
        clearUpdateReminder()
    }
    return false
}

export async function checkRisuUpdate(){
    try {
        const checked = await check()     
        if(checked){
            if (isUpdateReminderActive()) {
                return
            }

            const conf = await alertConfirm(language.newVersion)
            if(conf){
                clearUpdateReminder()
                alertWait(`Updating to ${checked.version}...`)
                await checked.downloadAndInstall()
                await relaunch()
            } else {
                const options = [
                    language.remindIgnore,
                    language.remindLater1Day,
                    language.remindLater3Days,
                    language.remindLater5Days,
                    language.remindLater1Week,
                ]
                
                const selected = await alertSelect(options, language.remindLaterQuestion)
                const selectedIndex = parseInt(selected)

                switch (selectedIndex) {
                    case 0:
                        break
                    case 1:
                        setUpdateReminder(1)
                        break
                    case 2:
                        setUpdateReminder(3)
                        break
                    case 3:
                        setUpdateReminder(5)
                        break
                    case 4:
                        setUpdateReminder(7)
                        break
                }
            }
        }
    } catch (error) {
        console.error(error)
    }
}

// Test function for web console
// @ts-ignore
if (typeof window !== 'undefined') {
    (window as any).testUpdateReminder = async () => {
        const { alertConfirm, alertSelect } = await import('./alert')
        const { language } = await import('../lang')
        
        const conf = await alertConfirm(language.newVersion)
        if (conf) {
            console.log('User chose to install')
        } else {
            const options = [
                language.remindIgnore,
                language.remindLater1Day,
                language.remindLater3Days,
                language.remindLater5Days,
                language.remindLater1Week,
            ]
            
            const selected = await alertSelect(options, language.remindLaterQuestion)
            console.log('Selected index:', selected)
        }
    }
}

