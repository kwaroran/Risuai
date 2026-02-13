import { MCPClientLike } from "./internalmcp";
import type { MCPTool, RPCToolCallContent } from "./mcplib";

export const registeredCustomPluginMCPs: Map<string, CustomPluginMCPClient> = new Map();

export class CustomPluginMCPClient extends MCPClientLike {

    #getToolList: () => Promise<MCPTool[]>;
    #callTool: (toolName: string, content: any) => Promise<RPCToolCallContent[]>;
    constructor(arg: {
        identifier: string;
        name: string;
        version: string;
        description: string;
        getToolList: () => Promise<MCPTool[]>;
        callTool: (toolName: string, content: any) => Promise<RPCToolCallContent[]>;
    }) {
        super(arg.identifier);
        this.serverInfo.serverInfo.name = arg.name;
        this.serverInfo.serverInfo.version = arg.version;
        this.serverInfo.instructions = arg.description;
        this.#getToolList = arg.getToolList;
        this.#callTool = arg.callTool;
    }

    async getToolList() {
        return await this.#getToolList();
    }

    async callTool(toolName: string, args: any) {
        return await this.#callTool(toolName, args);
    }

}

export async function registerMCPModule(arg: {
    identifier: string;
    name: string;
    version: string;
    description: string;
}, 
    getToolList: () => Promise<MCPTool[]>,
    callTool: (toolName: string, content: any) => Promise<RPCToolCallContent[]>,
) {
    if (!arg.identifier.startsWith('plugin:')) {
        throw new Error(`MCP module identifier must start with 'plugin:'.`);
    }
    const client = new CustomPluginMCPClient({
        ...arg,
        getToolList,
        callTool,
    });
    registeredCustomPluginMCPs.set(arg.identifier, client);
}

export async function unregisterMCPModule(identifier: string) {
    registeredCustomPluginMCPs.delete(identifier);
}