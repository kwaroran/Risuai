import { getChatVar, setChatVar } from "src/ts/parser/chatVar.svelte";
import { MCPClientLike } from "./internalmcp";
import type { MCPTool, RPCToolCallContent } from "./mcplib";
import { HypaProcesser } from "../memory/hypamemory";

type GraphIndex = {
    name: string;
    summary: string;
    connections: string[];
};

export class GraphMemClient extends MCPClientLike {
    constructor() {
        super("internal:graphmem");
        this.serverInfo.serverInfo.name = "GraphMem";
        this.serverInfo.serverInfo.version = "1.0.0";
        this.serverInfo.instructions = "Memory management using graph database.";
    }

    async getToolList(): Promise<MCPTool[]> {
        return [{
            name: 'writeMemory',
            description: 'Write a memory entry to the graph database.',
            inputSchema: {
                type: 'object',
                properties: {
                    name: {
                        type: 'string',
                        description: 'The name of the memory entry.'
                    },
                    summary: {
                        type: 'string',
                        description: 'A brief summary of the memory entry.'
                    },
                    connections: {
                        type: 'array',
                        items: {
                            type: 'string',
                            description: 'Names of related memory entries.'
                        },
                        description: 'Connections to other memory entries.'
                    }
                },
                required: ['name', 'summary']
            }
        }, {
            name: 'readMemory',
            description: 'Read a memory entry from the graph database.',
            inputSchema: {
                type: 'object',
                properties: {
                    query: {
                        type: 'array',
                        items: {
                            type: 'string'
                        },
                        description: 'The query terms to search for memory entries.'
                    },
                    search_depth: {
                        type: 'number',
                        description: 'The depth of connections to explore in the graph. default is 2.',
                    }
                },
                required: ['query']
            }
        }];
    }

    async callTool(toolName: string, args: any): Promise<RPCToolCallContent[]> {
        try {
            switch (toolName) {
                case "writeMemory": {
                    return await this.handleWriteMemory(args);
                }
                case "readMemory": {
                    return await this.handleReadMemory(args);
                }
                default:
                    return [{ type: 'text', text: `Unknown tool: ${toolName}` }];
            }
        } catch (error: unknown) {
            const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
            return [{ type: 'text', text: `Error: ${errorMessage}` }];
        }
    }

    private async handleWriteMemory(args: any): Promise<RPCToolCallContent[]> {
        
        const {
            name,
            summary,
            connections = []
        }: {
            name: string;
            summary: string;
            connections: string[];
        } = args;
        
        let graph: GraphIndex[] = []

        try {
            graph = JSON.parse(getChatVar("graphmem_graph")) as GraphIndex[];
        } catch (error) {}

        graph.push({ name, summary, connections });

        setChatVar("graphmem_graph", JSON.stringify(graph));
        return [{ type: 'text', text: `Memory entry "${name}" written successfully.` }];
    }

    private async handleReadMemory(args: any): Promise<RPCToolCallContent[]> {
        const {
            query,
            search_depth = 2,
        }: {
            query: string[];
            search_depth?: number;
            threshold?: number;
        } = args;

        let graph: GraphIndex[] = []

        try {
            graph = JSON.parse(getChatVar("graphmem_graph")) as GraphIndex[];
        } catch (error) {}

        if(!Array.isArray(query) || query.length === 0){
            return [{ type: 'text', text: `Query must be a non-empty array of strings.` }];
        }

        if(!Array.isArray(graph) || graph.length === 0){
            return [{ type: 'text', text: `No memory entries found in the graph database.` }];
        }

        const processer = new HypaProcesser();
        await processer.embedDocuments(graph.map(g => g.name));

        let results: {
            queryTerm: string;
            entries: GraphIndex[];
        }[] = [];
        for(let i=0;i<query.length;i++){
            
            let currentEntries: GraphIndex[] = [];
            let toSearch: string[] = [query[i]];
            for(let depth = 0; depth < search_depth; depth++){
                const newEntries: GraphIndex[] = [];
                for(const searchTerm of toSearch){
                    const searched = await processer.similaritySearch(searchTerm);
                    for(const entry of searched){
                        const found = graph.find(g => g.name === entry);
                        if(found && !currentEntries.includes(found)){
                            newEntries.push(found);
                        }
                    }
                }
                currentEntries = currentEntries.concat(newEntries);
                toSearch = newEntries.flatMap(e => e.connections);
            }

            results.push({ queryTerm: query[i], entries: currentEntries });
        }

        return [{ type: 'text', text: JSON.stringify(results, null, 2) }];
    }
}