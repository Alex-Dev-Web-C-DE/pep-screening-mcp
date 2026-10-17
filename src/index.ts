import express from 'express';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';

const PORT = Number(process.env.PORT) || 8080;
const API = 'https://compliance-engine.boring-saas-infra.workers.dev';

function createServer() {
  const server = new Server(
    { name: 'pep-screening', version: '1.0.0' },
    { capabilities: { tools: {} } }
  );

  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: [
      {
        name: 'screen_pep',
        description: 'Screen a person against PEP (Politically Exposed Persons) database. 16K+ records from WikiData.',
        inputSchema: { type: 'object', properties: { query: { type: 'string' }, threshold: { type: 'number' } }, required: ['query'] }
      },
      {
        name: 'screen_pep_batch',
        description: 'Batch PEP screening (up to 50 queries)',
        inputSchema: { type: 'object', properties: { queries: { type: 'array', items: { type: 'string' }, maxItems: 50 } }, required: ['queries'] }
      }
    ]
  }));

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;
    const input = (args ?? {}) as Record<string, any>;
    let url = '';

    if (name === 'screen_pep') {
      url = `${API}/check/pep?q=${encodeURIComponent(input.query || '')}&threshold=${input.threshold || 0.82}&limit=10`;
    } else if (name === 'screen_pep_batch') {
      const res = await fetch(`${API}/check/batch`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ queries: input.queries })
      });
      const data = await res.json();
      return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
    } else {
      throw new Error('Unknown tool: ' + name);
    }

    const res = await fetch(url);
    const data = await res.json();
    return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
  });

  return server;
}

const app = express();
app.use(express.json());

app.post('/mcp', async (req, res) => {
  try {
    const server = createServer();
    const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: () => crypto.randomUUID() });
    res.on('close', () => transport.close());
    await server.connect(transport);
    await transport.handleRequest(req, res, req.body);
  } catch (error) {
    console.error('Error handling MCP request:', error);
    if (!res.headersSent) {
      res.status(500).json({ error: 'Internal server error' });
    }
  }
});

app.listen(PORT, () => {
  console.log(`PEP Screening MCP running on port ${PORT}`);
});