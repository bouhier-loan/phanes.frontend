#!/usr/bin/env node
import { parseArgs } from 'node:util';
import { inventoryCommand } from './commands/inventory';

const USAGE = `Usage: phanes <command> <path> [--json]

Commands:
  inventory <dir>   List files, archives and their content`;

async function main(argv: string[]): Promise<number> {
  const { values, positionals } = parseArgs({
    args: argv,
    allowPositionals: true,
    options: { json: { type: 'boolean', default: false }, help: { type: 'boolean', short: 'h' } },
  });
  const [command, path] = positionals;
  if (values.help || !command || !path) {
    console.log(USAGE);
    return command ? 1 : 0;
  }
  switch (command) {
    case 'inventory':
      console.log(await inventoryCommand(path, values.json));
      return 0;
    default:
      console.error(`Unknown command: ${command}\n\n${USAGE}`);
      return 1;
  }
}

process.exitCode = await main(process.argv.slice(2));
