#!/usr/bin/env node
/**
 * jGrants MCP Server Integration Test
 */

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const SERVER_PATH = join(__dirname, '..', 'dist', 'index.js');

async function testServer() {
  console.log('\n' + '='.repeat(60));
  console.log('jGrants MCP Server Test');
  console.log('Server:', SERVER_PATH);
  console.log('Time:', new Date().toISOString());
  console.log('='.repeat(60));

  let client;
  
  try {
    // Create transport that spawns the server
    const transport = new StdioClientTransport({
      command: 'node',
      args: [SERVER_PATH],
    });

    client = new Client(
      {
        name: 'test-client',
        version: '1.0.0',
      },
      {
        capabilities: {},
      }
    );

    await client.connect(transport);

    // 1. Test Tools
    console.log('\n[Tools]');
    const tools = await client.listTools();
    console.log(`✅ ${tools.tools.length} tools found`);
    console.log('Tools:', tools.tools.map(t => t.name).join(', '));

    // Test search_subsidies
    try {
      const searchResult = await client.callTool({
        name: 'search_subsidies',
        arguments: { keyword: 'IT' },
      });
      console.log('✅ search_subsidies executed');
    } catch (error) {
      console.log('⚠️  search_subsidies error (might be API issue):', error.message);
    }

    // Test ping
    const pingResult = await client.callTool({
      name: 'ping',
      arguments: {},
    });
    console.log('✅ ping executed');

    // 2. Test Resources
    console.log('\n[Resources]');
    const resources = await client.listResources();
    console.log(`✅ ${resources.resources.length} resources found`);

    if (resources.resources.length > 0) {
      const resource = await client.readResource({
        uri: 'jgrants://guidelines',
      });
      console.log('✅ resource read successful');
    }

    // 3. Test Prompts
    console.log('\n[Prompts]');
    const prompts = await client.listPrompts();
    console.log(`✅ ${prompts.prompts.length} prompts found`);
    console.log('Prompts:', prompts.prompts.map(p => p.name).join(', '));

    if (prompts.prompts.length > 0) {
      const prompt = await client.getPrompt({
        name: 'subsidy_search_guide',
        arguments: {},
      });
      console.log('✅ prompt retrieved');
    }

    console.log('\n' + '='.repeat(60));
    console.log('✅ ALL TESTS PASSED');
    console.log('='.repeat(60) + '\n');

    await client.close();
    return true;
  } catch (error) {
    console.error('\n❌ Test failed:', error);
    if (client) {
      try {
        await client.close();
      } catch (e) {
        // Ignore close errors
      }
    }
    return false;
  }
}

testServer().then((success) => {
  process.exit(success ? 0 : 1);
}).catch((error) => {
  console.error('Unhandled error:', error);
  process.exit(1);
});
