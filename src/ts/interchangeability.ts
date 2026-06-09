import { v4 } from 'uuid';
import type { RisuModule} from './process/modules.ts'
import type { character, RisuPersona } from './storage/database.svelte.js';
import { createBlankChar } from "src/ts/characters";

export function convertModuleToCharacter(m: RisuModule): character {
    const char = createBlankChar()

    if(m.mcp){
        throw new Error("MCP modules are not supported for character conversion.")
    }

    char.name = m.name
    char.creatorNotes = m.description
    char.globalLore = m.lorebook || []
    char.customscript = m.regex || []
    char.triggerscript = m.trigger || []
    char.lowLevelAccess = m.lowLevelAccess || false
    char.hideChatIcon = m.hideIcon || false
    char.backgroundHTML = m.backgroundEmbedding || ""
    char.additionalAssets = m.assets || []
    char.customModuleToggle = m.customModuleToggle || ""

    return safeStructuredClone(char)
}

export function convertCharacterToModule(c: character): RisuModule {
    const mod: RisuModule = {
        name: c.name,
        description: c.creatorNotes,
        lorebook: c.globalLore,
        regex: c.customscript,
        trigger: c.triggerscript,
        lowLevelAccess: c.lowLevelAccess,
        hideIcon: c.hideChatIcon,
        backgroundEmbedding: c.backgroundHTML,
        assets: c.additionalAssets,
        customModuleToggle: c.customModuleToggle,
        id: v4()
    }

    return safeStructuredClone(mod)
}

export function convertPersonaToCharacter(p: RisuPersona): character {
    let char = createBlankChar()

    if(p.embeddedModule){
        char = convertModuleToCharacter(p.embeddedModule)
    }
    char.name = p.name
    char.image = p.icon
    char.largePortrait = p.largePortrait || false
    char.creatorNotes = p.note || ""
    char.desc = p.personaPrompt
    return safeStructuredClone(char)
}

export function convertCharacterToPersona(c: character): RisuPersona {
    const p: RisuPersona = {
        name: c.name,
        icon: c.image,
        personaPrompt: c.desc,
        note: c.creatorNotes,
        embeddedModule: convertCharacterToModule(c)
    }
    return safeStructuredClone(p)
}

export function convertPersonaToModule(p: RisuPersona): RisuModule {
    let baseModule: RisuModule = {
        name: "",
        description: "",
        id: v4()
    }
    
    if(p.embeddedModule){
        baseModule = safeStructuredClone(p.embeddedModule)
    }

    baseModule.name = p.name
    baseModule.description = p.note || ""
    baseModule.lorebook = [{
        key:"",
        secondkey:"",
        insertorder: 0,
        comment: "From Persona Prompt",
        content: `@@indicator persona\n\n${p.personaPrompt}`,
        mode: 'constant',
        alwaysActive: true,
        selective: false
    }]

    return baseModule
}

export function convertModuleToPersona(m: RisuModule): RisuPersona {
    let basePersona: RisuPersona = {
        name: "",
        icon: "",
        personaPrompt: "",
        embeddedModule: safeStructuredClone(m)
    }

    basePersona.name = m.name
    basePersona.embeddedModule.lorebook ??= []
    basePersona.embeddedModule.lorebook = basePersona?.embeddedModule?.lorebook?.filter((a) => {
        if(a.content.startsWith('@@indicator persona')){
            basePersona.personaPrompt = a.content.replace('@@indicator persona', '').trim()
            return false
        }
        return true
    })
    return safeStructuredClone(basePersona)
}