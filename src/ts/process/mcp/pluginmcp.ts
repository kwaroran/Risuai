import { MCPClientLike } from "./internalmcp";
import type { MCPTool, RPCToolCallContent } from "./mcplib";

export const registeredCustomPluginMCPs: Map<string, CustomPluginMCPClient> = new Map();

export class CustomPluginMCPClient extends MCPClientLike {

    readonly owner: string;
    #getToolList: () => Promise<MCPTool[]>;
    #callTool: (toolName: string, content: any) => Promise<RPCToolCallContent[]>;
    constructor(arg: {
        owner: string;
        identifier: string;
        name: string;
        version: string;
        description: string;
        getToolList: () => Promise<MCPTool[]>;
        callTool: (toolName: string, content: any) => Promise<RPCToolCallContent[]>;
    }) {
        super(arg.identifier);
        this.owner = arg.owner;
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

type PluginMCPInfo = {
    identifier: string;
    name: string;
    version: string;
    description: string;
}

export function assertMCPRegistrationAllowed(owner: string, arg: PluginMCPInfo) {
    if (typeof arg.identifier !== 'string' || !/^plugin:.*$/.test(arg.identifier)) {
        throw new Error(`MCP module identifier must be a single-line string starting with 'plugin:'.`);
    }
    if (typeof arg.name !== 'string' || arg.name === '') {
        throw new Error(`MCP module name must be a non-empty string.`);
    }
    const registered = registeredCustomPluginMCPs.get(arg.identifier);
    if (registered && registered.owner !== owner) {
        throw new Error(`MCP module identifier '${arg.identifier}' is already registered by another plugin.`);
    }
}

export function registerMCPModule(owner: string, arg: PluginMCPInfo,
    getToolList: () => Promise<MCPTool[]>,
    callTool: (toolName: string, content: any) => Promise<RPCToolCallContent[]>,
) {
    assertMCPRegistrationAllowed(owner, arg);
    const client = new CustomPluginMCPClient({
        ...arg,
        owner,
        getToolList,
        callTool,
    });
    registeredCustomPluginMCPs.set(arg.identifier, client);
    return client;
}

export function unregisterMCPModule(owner: string, identifier: string) {
    if (registeredCustomPluginMCPs.get(identifier)?.owner === owner) {
        registeredCustomPluginMCPs.delete(identifier);
    }
}
