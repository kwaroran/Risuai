import { language } from 'src/lang'
import { alertConfirm } from 'src/ts/alert'
import { type character, type groupChat, type loreBook } from 'src/ts/storage/database.svelte'
import { DBState } from 'src/ts/stores.svelte'
import { pickHashRand } from 'src/ts/util'
import { type MCPTool, MCPToolHandler, type RPCToolCallContent } from '../mcplib'
import { getCharacter } from './utils'

export class CharacterHandler extends MCPToolHandler {
  private promptAccess(tool: string, action: string) {
    return alertConfirm(language.mcpAccessPrompt.replace('{{tool}}', tool).replace('{{action}}', action))
  }

  getTools(): MCPTool[] {
    return [
      {
        description: 'Get basic information about a Risuai character.',
        inputSchema: {
          properties: {
            fields: {
              description: 'Specific fields to include in the result.',
              items: {
                enum: [
                  'alternateGreetings',
                  'backgroundEmbedding',
                  'description',
                  'greeting',
                  'id',
                  'name',
                  'replaceGlobalNote',
                ],
                type: 'string',
              },
              type: 'array',
            },
            id: {
              description: 'The ID or name of the character. Use an empty string for the currently selected character.',
              type: 'string',
            },
          },
          required: ['id'],
          type: 'object',
        },
        name: 'risu-get-character-info',
      },
      {
        description: 'List the lorebooks of a Risuai character.',
        inputSchema: {
          properties: {
            count: {
              default: 100,
              description: 'The maximum number of lorebooks to return.',
              type: 'integer',
            },
            id: {
              description: 'The ID or name of the character. Use an empty string for the currently selected character.',
              type: 'string',
            },
            offset: {
              description: 'The number of lorebooks to skip for pagination.',
              type: 'integer',
            },
          },
          required: ['id'],
          type: 'object',
        },
        name: 'risu-list-character-lorebooks',
      },
      {
        description: 'Get lorebooks with specific names from a Risuai character.',
        inputSchema: {
          properties: {
            id: {
              description: 'The ID or name of the character. Use an empty string for the currently selected character.',
              type: 'string',
            },
            names: {
              description: 'The names of the lorebooks to retrieve.',
              items: { type: 'string' },
              type: 'array',
            },
          },
          required: ['id', 'names'],
          type: 'object',
        },
        name: 'risu-get-character-lorebook',
      },
      {
        description: 'Set basic information about a Risuai character.',
        inputSchema: {
          properties: {
            data: {
              description: 'A map of fields to their new values.',
              properties: {
                alternateGreetings: {
                  items: { type: 'string' },
                  type: 'array',
                },
                backgroundEmbedding: { type: 'string' },
                description: { type: 'string' },
                greeting: { type: 'string' },
                name: { type: 'string' },
                replaceGlobalNote: { type: 'string' },
              },
              type: 'object',
            },
            id: {
              description: 'The ID or name of the character. Use an empty string for the currently selected character.',
              type: 'string',
            },
          },
          required: ['data', 'id'],
          type: 'object',
        },
        name: 'risu-set-character-info',
      },
      {
        description: 'Update an existing lorebook of a Risuai character, or create a new one if it does not exist.',
        inputSchema: {
          properties: {
            alwaysActive: {
              default: false,
              description: 'If true, the lorebook is always active regardless of keywords.',
              type: 'boolean',
            },
            content: {
              description: 'The text content to be inserted into the context.',
              type: 'string',
            },
            id: {
              description: 'The ID or name of the character. Use an empty string for the currently selected character.',
              type: 'string',
            },
            keys: {
              description: 'An array of keywords that activate this lorebook.',
              items: { type: 'string' },
              type: 'array',
            },
            name: {
              description: 'The name of the lorebook to update.',
              type: 'string',
            },
            newName: {
              description: 'Optional new name for the lorebook.',
              type: 'string',
            },
          },
          required: ['id', 'name'],
          type: 'object',
        },
        name: 'risu-set-character-lorebook',
      },
      {
        description: 'Delete a lorebook from a Risuai character.',
        inputSchema: {
          properties: {
            id: {
              description: 'The ID or name of the character. Use an empty string for the currently selected character.',
              type: 'string',
            },
            name: {
              description: 'The name of the lorebook to delete.',
              type: 'string',
            },
          },
          required: ['id', 'name'],
          type: 'object',
        },
        name: 'risu-delete-character-lorebook',
      },
      {
        description: 'Get regex scripts from a Risuai character.',
        inputSchema: {
          properties: {
            id: {
              description: 'The ID or name of the character. Use an empty string for the currently selected character.',
              type: 'string',
            },
          },
          required: ['id'],
          type: 'object',
        },
        name: 'risu-get-character-regex-scripts',
      },
      {
        description: 'Update an existing regex script in a Risuai character, or create a new one if it does not exist.',
        inputSchema: {
          properties: {
            ableFlag: {
              default: false,
              description: 'Set to true to use the custom "flag" string.',
              type: 'boolean',
            },
            flag: {
              description: 'Regex flags (e.g., "g", "i", "m") used when "ableFlag" is true.',
              type: 'string',
            },
            id: {
              description: 'The ID or name of the character. Use an empty string for the currently selected character.',
              type: 'string',
            },
            in: {
              description: 'The regex pattern to match.',
              type: 'string',
            },
            name: {
              description: 'The name of the script to update.',
              type: 'string',
            },
            newName: {
              description: 'Optional new name for the script.',
              type: 'string',
            },
            out: {
              description: 'The string to replace matches with.',
              type: 'string',
            },
            type: {
              description: 'The hook where the regex is applied.',
              enum: ['editdisplay', 'editinput', 'editoutput', 'editprocess'],
              type: 'string',
            },
          },
          required: ['id', 'name'],
          type: 'object',
        },
        name: 'risu-set-character-regex-scripts',
      },
      {
        description: 'Delete a regex script from a Risuai character.',
        inputSchema: {
          properties: {
            id: {
              description: 'The ID or name of the character. Use an empty string for the currently selected character.',
              type: 'string',
            },
            name: {
              description: 'The name of the regex script to delete.',
              type: 'string',
            },
          },
          required: ['id', 'name'],
          type: 'object',
        },
        name: 'risu-delete-character-regex-scripts',
      },
      {
        description: 'Get additional assets from a Risuai character.',
        inputSchema: {
          properties: {
            id: {
              description: 'The ID or name of the character. Use an empty string for the currently selected character.',
              type: 'string',
            },
          },
          required: ['id'],
          type: 'object',
        },
        name: 'risu-get-character-additional-assets',
      },
      {
        description: 'Get the Lua script from a Risuai character trigger.',
        inputSchema: {
          properties: {
            id: {
              description: 'The ID or name of the character. Use an empty string for the currently selected character.',
              type: 'string',
            },
          },
          required: ['id'],
          type: 'object',
        },
        name: 'risu-get-character-lua-script',
      },
      {
        description: 'Update the Lua script of a Risuai character.',
        inputSchema: {
          properties: {
            code: {
              description: 'The new Lua code.',
              type: 'string',
            },
            id: {
              description: 'The ID or name of the character. Use an empty string for the currently selected character.',
              type: 'string',
            },
          },
          required: ['code', 'id'],
          type: 'object',
        },
        name: 'risu-set-character-lua-script',
      },
      {
        description: 'Delete an additional asset from a Risuai character.',
        inputSchema: {
          properties: {
            assetName: {
              description: 'The name of the asset to delete.',
              type: 'string',
            },
            id: {
              description: 'The ID or name of the character. Use an empty string for the currently selected character.',
              type: 'string',
            },
          },
          required: ['assetName', 'id'],
          type: 'object',
        },
        name: 'risu-delete-character-additional-assets',
      },
      {
        description: 'List all Risuai characters.',
        inputSchema: {
          properties: {
            count: {
              default: 100,
              description: 'The maximum number of characters to return.',
              type: 'integer',
            },
            offset: {
              description: 'The number of characters to skip for pagination.',
              type: 'integer',
            },
          },
          required: [],
          type: 'object',
        },
        name: 'risu-list-characters',
      },
    ]
  }

  async handle(toolName: string, args: any): Promise<RPCToolCallContent[] | null> {
    switch (toolName) {
      case 'risu-get-character-info':
        return await this.getCharacterInfo(args.id, args.fields)
      case 'risu-list-character-lorebooks':
        return await this.getCharacterLorebooks(args.id, args.count, args.offset)
      case 'risu-get-character-lorebook':
        return await this.getCharacterLorebook(args.id, args.names)
      case 'risu-set-character-info':
        return await this.setCharacterInfo(args.id, args.data)
      case 'risu-set-character-lorebook':
        return await this.setCharacterLorebook(
          args.id,
          args.name,
          args.content,
          args.keys,
          args.newName,
          args.alwaysActive
        )
      case 'risu-delete-character-lorebook':
        return await this.deleteCharacterLorebook(args.id, args.name)
      case 'risu-get-character-regex-scripts':
        return await this.getCharacterRegexScripts(args.id)
      case 'risu-set-character-regex-scripts':
        return await this.setCharacterRegexScripts(
          args.id,
          args.name,
          args.newName,
          args.in,
          args.out,
          args.type,
          args.flag,
          args.ableFlag
        )
      case 'risu-delete-character-regex-scripts':
        return await this.deleteCharacterRegexScripts(args.id, args.name)
      case 'risu-get-character-additional-assets':
        return await this.getCharacterAdditionalAssets(args.id)
      case 'risu-get-character-lua-script':
        return await this.getCharacterLuaScript(args.id)
      case 'risu-set-character-lua-script':
        return await this.setCharacterLuaScript(args.id, args.code)
      case 'risu-delete-character-additional-assets':
        return await this.deleteCharacterAdditionalAssets(args.id, args.assetName)
      case 'risu-list-characters':
        return await this.listCharacters(args.count, args.offset)
    }
    return null
  }

  async getCharacterInfo(id: string, fields: string[]): Promise<RPCToolCallContent[]> {
    const char: character | groupChat = getCharacter(id)
    if (!char) {
      return [
        {
          type: 'text',
          text: `Error: Character with ID ${id} not found.`,
        },
      ]
    }
    if (char.type === 'group') {
      return [
        {
          type: 'text',
          text: `Error: The id pointed to a group chat, not a character.`,
        },
      ]
    }

    let response: Record<string, any> = {}

    const fieldRemap = {
      name: 'name',
      greeting: 'firstMessage',
      description: 'desc',
      id: 'chaId',
      replaceGlobalNote: 'replaceGlobalNote',
      alternateGreetings: 'alternateGreetings',
      backgroundEmbedding: 'backgroundHTML',
    } as const

    for (const field of fields) {
      if (fieldRemap[field as keyof typeof fieldRemap]) {
        const realField = fieldRemap[field as keyof typeof fieldRemap]
        response[field] = char[realField]
      } else {
        return [
          {
            type: 'text',
            text: `Error: Field ${field} does not exist on character ${char.chaId} or it isn't allowed to be accessed.`,
          },
        ]
      }
    }

    return [
      {
        type: 'text',
        text: JSON.stringify(response),
      },
    ]
  }

  async getCharacterLorebooks(id: string, count: number = 100, offset: number = 0): Promise<RPCToolCallContent[]> {
    const char: character | groupChat = getCharacter(id)
    if (!char) {
      return [
        {
          type: 'text',
          text: `Error: Character with ID ${id} not found.`,
        },
      ]
    }
    if (char.type === 'group') {
      return [
        {
          type: 'text',
          text: `Error: The id pointed to a group chat, not a character.`,
        },
      ]
    }

    if (count > 100) count = 100
    if (count < 1) count = 1
    if (offset < 0) offset = 0

    const lorebook = char.globalLore.slice(offset, offset + count)
    const organized = lorebook.map((entry) => {
      return {
        alwaysActive: entry.alwaysActive,
        keys: entry.key,
        name: entry.comment || 'Unnamed ' + pickHashRand(5515, entry.content),
      }
    })

    return [
      {
        type: 'text',
        text: JSON.stringify(organized),
      },
    ]
  }

  async getCharacterLorebook(id: string, entryNames: string[]): Promise<RPCToolCallContent[]> {
    const char: character | groupChat = getCharacter(id)
    if (!char) {
      return [
        {
          type: 'text',
          text: `Error: Character with ID ${id} not found.`,
        },
      ]
    }
    if (char.type === 'group') {
      return [
        {
          type: 'text',
          text: `Error: The id pointed to a group chat, not a character.`,
        },
      ]
    }

    const entries = char.globalLore.filter((entry) => {
      const displayName = entry.comment || 'Unnamed ' + pickHashRand(5515, entry.content)
      return entryNames.includes(displayName)
    })

    if (entries.length === 0) {
      return [
        {
          type: 'text',
          text: `Error: Lorebook entries with names "${entryNames.join(', ')}" not found.`,
        },
      ]
    }

    const result = entries.map((entry) => ({
      alwaysActive: entry.alwaysActive,
      content: entry.content,
      keys: entry.key,
      name: entry.comment || 'Unnamed ' + pickHashRand(5515, entry.content),
    }))

    return [
      {
        type: 'text',
        text: JSON.stringify(result),
      },
    ]
  }

  async setCharacterInfo(id: string, data: any): Promise<RPCToolCallContent[]> {
    const char: character | groupChat = getCharacter(id)
    if (!char) {
      return [
        {
          type: 'text',
          text: `Error: Character with ID ${id} not found.`,
        },
      ]
    }
    if (char.type === 'group') {
      return [
        {
          type: 'text',
          text: `Error: The id pointed to a group chat, not a character.`,
        },
      ]
    }

    if (!(await this.promptAccess('risu-set-character-info', `modify character (${char.name}) information`))) {
      return [
        {
          type: 'text',
          text: 'Access denied by user.',
        },
      ]
    }

    const fieldRemap = {
      name: 'name',
      greeting: 'firstMessage',
      description: 'desc',
      replaceGlobalNote: 'replaceGlobalNote',
      alternateGreetings: 'alternateGreetings',
      backgroundEmbedding: 'backgroundHTML',
    } as const

    for (const [field, value] of Object.entries(data)) {
      if (fieldRemap[field as keyof typeof fieldRemap]) {
        const realField = fieldRemap[field as keyof typeof fieldRemap]
        // @ts-ignore
        char[realField] = value
      } else {
        return [
          {
            type: 'text',
            text: `Error: Field ${field} does not exist on character ${char.chaId} or it isn't allowed to be modified.`,
          },
        ]
      }
    }

    return [
      {
        type: 'text',
        text: `Successfully updated character ${char.name || char.chaId}`,
      },
    ]
  }

  async setCharacterLorebook(
    id: string,
    name: string,
    content?: string,
    keys?: string[],
    newName?: string,
    alwaysActive?: boolean
  ): Promise<RPCToolCallContent[]> {
    const char: character | groupChat = getCharacter(id)
    if (!char) {
      return [
        {
          type: 'text',
          text: `Error: Character with ID ${id} not found.`,
        },
      ]
    }
    if (char.type === 'group') {
      return [
        {
          type: 'text',
          text: `Error: The id pointed to a group chat, not a character.`,
        },
      ]
    }

    if (
      !(await this.promptAccess(
        'risu-set-character-lorebook',
        `add/modify character (${char.name}) global lorebook (${name})`
      ))
    ) {
      return [
        {
          type: 'text',
          text: 'Access denied by user.',
        },
      ]
    }

    const entryIndex = char.globalLore.findIndex((entry) => {
      const displayName = entry.comment || 'Unnamed ' + pickHashRand(5515, entry.content)
      return displayName === name
    })
    if (entryIndex === -1) {
      const newEntry: loreBook = {
        key: alwaysActive ? '' : keys?.join(',') || '',
        content: content || '',
        comment: newName || name,
        alwaysActive: alwaysActive || false,
        secondkey: '',
        selective: false,
        insertorder: 100,
        mode: 'normal',
      }
      char.globalLore.push(newEntry)
      return [
        {
          type: 'text',
          text: `Successfully added lorebook entry "${newName || name}" to character ${char.name || char.chaId}`,
        },
      ]
    }

    const entry = char.globalLore[entryIndex]

    if (content !== undefined) {
      entry.content = content
    }
    if (keys !== undefined) {
      entry.key = alwaysActive ? '' : keys.join(',')
    }
    if (newName !== undefined) {
      entry.comment = newName
    }
    if (alwaysActive !== undefined) {
      entry.alwaysActive = alwaysActive
      if (alwaysActive) {
        entry.key = ''
      }
    }

    return [
      {
        type: 'text',
        text: `Successfully updated lorebook entry "${name}" for character ${char.name || char.chaId}`,
      },
    ]
  }

  async deleteCharacterLorebook(id: string, name: string): Promise<RPCToolCallContent[]> {
    const char: character | groupChat = getCharacter(id)
    if (!char) {
      return [
        {
          type: 'text',
          text: `Error: Character with ID ${id} not found.`,
        },
      ]
    }
    if (char.type === 'group') {
      return [
        {
          type: 'text',
          text: `Error: The id pointed to a group chat, not a character.`,
        },
      ]
    }

    if (
      !(await this.promptAccess(
        'risu-delete-character-lorebook',
        `delete character (${char.name}) global lorebook (${name})`
      ))
    ) {
      return [
        {
          type: 'text',
          text: 'Access denied by user.',
        },
      ]
    }

    const entryIndex = char.globalLore.findIndex((entry) => {
      const displayName = entry.comment || 'Unnamed ' + pickHashRand(5515, entry.content)
      return displayName === name
    })
    if (entryIndex === -1) {
      return [
        {
          type: 'text',
          text: `Error: Lorebook entry with name "${name}" not found.`,
        },
      ]
    }

    char.globalLore.splice(entryIndex, 1)

    return [
      {
        type: 'text',
        text: `Successfully deleted lorebook entry "${name}" from character ${char.name || char.chaId}`,
      },
    ]
  }

  async getCharacterRegexScripts(id: string): Promise<RPCToolCallContent[]> {
    const char: character | groupChat = getCharacter(id)
    if (!char) {
      return [
        {
          type: 'text',
          text: `Error: Character with ID ${id} not found.`,
        },
      ]
    }
    if (char.type === 'group') {
      return [
        {
          type: 'text',
          text: `Error: The id pointed to a group chat, not a character.`,
        },
      ]
    }

    const organized = (char.customscript || []).map((script) => {
      return {
        comment: script.comment || 'Unnamed ' + pickHashRand(5515, script.in + script.out),
        in: script.in,
        out: script.out,
        type: script.type,
        flag: script.flag,
        ableFlag: script.ableFlag,
      }
    })

    return [
      {
        type: 'text',
        text: JSON.stringify(organized),
      },
    ]
  }

  async setCharacterRegexScripts(
    id: string,
    name: string,
    newName?: string,
    regexIn?: string,
    regexOut?: string,
    type?: string,
    flag?: string,
    ableFlag?: boolean
  ): Promise<RPCToolCallContent[]> {
    const char: character | groupChat = getCharacter(id)
    if (!char) {
      return [
        {
          type: 'text',
          text: `Error: Character with ID ${id} not found.`,
        },
      ]
    }
    if (char.type === 'group') {
      return [
        {
          type: 'text',
          text: `Error: The id pointed to a group chat, not a character.`,
        },
      ]
    }

    if (
      !(await this.promptAccess(
        'risu-set-character-regex-scripts',
        `add/modify character (${char.name}) regex script (${name})`
      ))
    ) {
      return [
        {
          type: 'text',
          text: 'Access denied by user.',
        },
      ]
    }

    if (!char.customscript) {
      char.customscript = []
    }

    const scriptIndex = char.customscript.findIndex((script) => {
      const displayName = script.comment || 'Unnamed ' + pickHashRand(5515, script.in + script.out)
      return displayName === name
    })
    if (scriptIndex === -1) {
      const newScript = {
        comment: newName || name,
        in: regexIn || '',
        out: regexOut || '',
        type: type || 'editdisplay',
        flag: flag || '',
        ableFlag: ableFlag !== undefined ? ableFlag : true,
      }

      char.customscript.push(newScript)
      return [
        {
          type: 'text',
          text: `Successfully added regex script "${newName || name}" to character ${char.name || char.chaId}`,
        },
      ]
    }

    const script = char.customscript[scriptIndex]

    if (newName !== undefined) script.comment = newName
    if (regexIn !== undefined) script.in = regexIn
    if (regexOut !== undefined) script.out = regexOut
    if (type !== undefined) script.type = type
    if (flag !== undefined) script.flag = flag
    if (ableFlag !== undefined) script.ableFlag = ableFlag

    return [
      {
        type: 'text',
        text: `Successfully updated regex script "${name}" for character ${char.name || char.chaId}`,
      },
    ]
  }

  async deleteCharacterRegexScripts(id: string, name: string): Promise<RPCToolCallContent[]> {
    const char: character | groupChat = getCharacter(id)
    if (!char) {
      return [
        {
          type: 'text',
          text: `Error: Character with ID ${id} not found.`,
        },
      ]
    }
    if (char.type === 'group') {
      return [
        {
          type: 'text',
          text: `Error: The id pointed to a group chat, not a character.`,
        },
      ]
    }

    if (
      !(await this.promptAccess(
        'risu-delete-character-regex-scripts',
        `delete character (${char.name}) regex script (${name})`
      ))
    ) {
      return [
        {
          type: 'text',
          text: 'Access denied by user.',
        },
      ]
    }

    if (!char.customscript) {
      char.customscript = []
    }

    const scriptIndex = char.customscript.findIndex((script) => {
      const displayName = script.comment || 'Unnamed ' + pickHashRand(5515, script.in + script.out)
      return displayName === name
    })
    if (scriptIndex === -1) {
      return [
        {
          type: 'text',
          text: `Error: Regex script with name "${name}" not found.`,
        },
      ]
    }

    char.customscript.splice(scriptIndex, 1)

    return [
      {
        type: 'text',
        text: `Successfully deleted regex script "${name}" from character ${char.name || char.chaId}`,
      },
    ]
  }

  async getCharacterAdditionalAssets(id: string): Promise<RPCToolCallContent[]> {
    const char: character | groupChat = getCharacter(id)
    if (!char) {
      return [
        {
          type: 'text',
          text: `Error: Character with ID ${id} not found.`,
        },
      ]
    }
    if (char.type === 'group') {
      return [
        {
          type: 'text',
          text: `Error: The id pointed to a group chat, not a character.`,
        },
      ]
    }

    const assets = (char.additionalAssets || []).map((asset) => ({
      name: asset[0] || 'Unnamed ' + pickHashRand(5515, asset[1] + asset[2]),
      path: asset[1],
      ext: asset[2],
    }))

    return [
      {
        type: 'text',
        text: JSON.stringify(assets),
      },
    ]
  }

  async deleteCharacterAdditionalAssets(id: string, assetName: string): Promise<RPCToolCallContent[]> {
    const char: character | groupChat = getCharacter(id)
    if (!char) {
      return [
        {
          type: 'text',
          text: `Error: Character with ID ${id} not found.`,
        },
      ]
    }
    if (char.type === 'group') {
      return [
        {
          type: 'text',
          text: `Error: The id pointed to a group chat, not a character.`,
        },
      ]
    }

    if (
      !(await this.promptAccess(
        'risu-delete-character-additional-assets',
        `delete character (${char.name}) additional asset (${assetName})`
      ))
    ) {
      return [
        {
          type: 'text',
          text: 'Access denied by user.',
        },
      ]
    }

    if (!char.additionalAssets) {
      char.additionalAssets = []
    }

    const assetIndex = char.additionalAssets.findIndex((asset) => {
      const displayName = asset[0] || 'Unnamed ' + pickHashRand(5515, asset[1] + asset[2])
      return displayName === assetName
    })
    if (assetIndex === -1) {
      return [
        {
          type: 'text',
          text: `Error: Additional asset with name "${assetName}" not found.`,
        },
      ]
    }

    char.additionalAssets.splice(assetIndex, 1)

    return [
      {
        type: 'text',
        text: `Successfully deleted additional asset "${assetName}" from character ${char.name || char.chaId}`,
      },
    ]
  }

  async getCharacterLuaScript(id: string): Promise<RPCToolCallContent[]> {
    const char: character | groupChat = getCharacter(id)
    if (!char) {
      return [
        {
          type: 'text',
          text: `Error: Character with ID ${id} not found.`,
        },
      ]
    }
    if (char.type === 'group') {
      return [
        {
          type: 'text',
          text: `Error: The id pointed to a group chat, not a character.`,
        },
      ]
    }

    const firstTrigger = char.triggerscript?.[0]
    if (firstTrigger?.effect?.[0]?.type === 'triggerlua' && firstTrigger.effect[0].code.trim().length > 0) {
      return [
        {
          type: 'text',
          text: firstTrigger.effect[0].code,
        },
      ]
    }

    return [
      {
        type: 'text',
        text: 'Error: This character does not contain a Lua trigger as the first trigger.',
      },
    ]
  }

  async setCharacterLuaScript(id: string, code: string): Promise<RPCToolCallContent[]> {
    const char: character | groupChat = getCharacter(id)
    if (!char) {
      return [
        {
          type: 'text',
          text: `Error: Character with ID ${id} not found.`,
        },
      ]
    }
    if (char.type === 'group') {
      return [
        {
          type: 'text',
          text: `Error: The id pointed to a group chat, not a character.`,
        },
      ]
    }

    if (!(await this.promptAccess('risu-set-character-lua-script', `modify character (${char.name}) lua script`))) {
      return [
        {
          type: 'text',
          text: 'Access denied by user.',
        },
      ]
    }

    const firstTrigger = char.triggerscript?.[0]
    if (firstTrigger?.effect?.[0]?.type === 'triggerlua') {
      firstTrigger.effect[0].code = code
      return [
        {
          type: 'text',
          text: `Successfully updated Lua script for character ${char.name || char.chaId}`,
        },
      ]
    }

    return [
      {
        type: 'text',
        text: 'Error: User must first change the first trigger type to Lua manually.',
      },
    ]
  }

  async listCharacters(count: number = 100, offset: number = 0): Promise<RPCToolCallContent[]> {
    if (count > 100) count = 100
    if (count < 1) count = 1
    if (offset < 0) offset = 0

    const characters = DBState.db.characters.slice(offset, offset + count).map((char) => ({
      id: char.chaId,
      name: char.name || 'Unnamed',
      type: char.type,
    }))

    return [
      {
        type: 'text',
        text: JSON.stringify(characters),
      },
    ]
  }
}
