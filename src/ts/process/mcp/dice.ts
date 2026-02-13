import { MCPClientLike } from "./internalmcp";
import type { RPCToolCallContent } from "./mcplib";

export class DiceClient extends MCPClientLike {
    constructor() {
        super("internal:dice");
        this.serverInfo.serverInfo.name = "Dice";
        this.serverInfo.serverInfo.version = "1.0.0";
        this.serverInfo.instructions = "A tool to roll dice in various formats. like '2d6+3' or 'd20'.";
    }
    async getToolList() {
        return [{
            name: 'rollDice',
            description: 'Roll dice based on the given notation.',
            inputSchema: {
                type: 'object',
                properties: {
                    notation: {
                        type: 'string',
                        description: 'The dice notation to roll, e.g., "2d6+3".'
                    }
                },
                required: ['notation']
            }
        }];
    }
    async callTool(toolName: string, args: any): Promise<RPCToolCallContent[]> {
        if (toolName === 'rollDice') {
            const notation: string = args.notation;
            const result = rollDice(notation);
            return [{
                type: 'text',
                text: `Rolled ${notation}: ${result.total} (Details: ${result.details})`
            }]
        }
        throw new Error(`Unknown tool: ${toolName}`);
    }
}

function rollDice(notation: string): { total: number, details: string } {
    const dicePattern = /(\d*)d(\d+)([+-]\d+)?/g;
    let match;
    let total = 0;
    let details = [];
    while ((match = dicePattern.exec(notation)) !== null) {
        const count = parseInt(match[1]) || 1;
        const sides = parseInt(match[2]);
        const modifier = match[3] ? parseInt(match[3]) : 0;
        let rollTotal = 0;
        let rolls = [];
        for (let i = 0; i < count; i++) {
            const roll = Math.floor(Math.random() * sides) + 1;
            rolls.push(roll);
            rollTotal += roll;
        }
        rollTotal += modifier;
        total += rollTotal;
        details.push(`${count}d${sides}${modifier ? match[3] : ''}: [${rolls.join(', ')}]${modifier ? ` ${match[3]}` : ''} = ${rollTotal}`);
    }
    return { total, details: details.join('; ') };
}