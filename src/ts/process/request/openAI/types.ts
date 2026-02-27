import type { MultiModal, OpenAIChat } from '../../index.svelte'

export interface ResponseInputItem {
    content: (
        | {
              type: 'input_text'
              text: string
          }
        | {
              detail: 'high' | 'low' | 'auto'
              type: 'input_image'
              image_url: string
          }
        | {
              type: 'input_file'
              file_data: string
              filename?: string
          }
    )[]
    role: 'user' | 'system' | 'developer'
}

export interface ResponseOutputItem {
    content: {
        type: 'output_text'
        text: string
        annotations: []
    }[]
    type: 'message'
    status: 'in_progress' | 'complete' | 'incomplete'
    role: 'assistant'
}

export type ResponseItem = ResponseInputItem | ResponseOutputItem

interface TextContents {
    type: 'text'
    text: string
}

interface ImageContents {
    type: 'image' | 'image_url'
    image_url: {
        url: string
        detail: string
    }
}

export type Contents = TextContents | ImageContents

export interface ToolCall {
    function: {
        name: string
        arguments: string
    }
    id: string
    type: 'function'
}

export interface OpenAIChatFull extends OpenAIChat {
    function_call?: {
        name: string
        arguments: string
    }
    tool_calls?: ToolCall[]
}

export interface OpenAIChatExtra {
    role: 'system' | 'user' | 'assistant' | 'function' | 'developer' | 'tool'
    content: string | Contents[]
    memo?: string
    name?: string
    removable?: boolean
    attr?: string[]
    multimodals?: MultiModal[]
    thoughts?: string[]
    prefix?: boolean
    reasoning_content?: string
    cachePoint?: boolean
    function?: {
        name: string
        description?: string
        parameters: any
        strict: boolean
    }
    tool_call_id?: string
    tool_calls?: ToolCall[]
}
