import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { runCli, checkedWorkspace } from './cli.mjs';

const server = new McpServer({ name: 'codex-doubao-desktop-gateway', version: '0.1.0' });
const id = z.string().regex(/^\d{12,24}$/);
const permission = z.enum(['AlwaysAsk', 'AskOnRisk', 'FullAccess']).default('AskOnRisk');

function result(value) { return { content: [{ type: 'text', text: JSON.stringify(value, null, 2) }] }; }
function tool(action) {
  return async input => {
    try { return result(await action(input)); }
    catch (error) { return { ...result({ ok: false, error: error.message }), isError: true }; }
  };
}

server.tool('doubao_desktop_status', 'Check whether the localhost CDP endpoint belongs to the Doubao desktop app. Does not restart it.', {}, tool(async () => runCli(['cdp', 'status'])));
server.tool('doubao_desktop_sessions', 'List existing Doubao desktop conversations. Treat titles and messages as private user data.', {}, tool(async () => runCli(['sessions', 'list'])));
server.tool('doubao_desktop_create_task', 'Send a new task to a real Doubao desktop conversation in an existing local workspace. Returns conversationId and runId; inspect task result independently.', {
  objective: z.string().min(1).max(50_000),
  workspace: z.string().min(1),
  permission,
}, tool(async ({ objective, workspace, permission }) => runCli([
  'sessions', 'create', objective, '--runtime', 'local', '--workspace', checkedWorkspace(workspace), '--permission', permission,
], { timeoutMs: 60_000 })));
server.tool('doubao_desktop_continue_task', 'Send a follow-up to a specified existing Doubao desktop conversation. Does not choose a conversation automatically.', {
  conversationId: id,
  message: z.string().min(1).max(50_000),
  permission,
}, tool(async ({ conversationId, message, permission }) => runCli([
  'sessions', 'send', conversationId, message, '--runtime', 'local', '--permission', permission,
], { timeoutMs: 60_000 })));
server.tool('doubao_desktop_wait', 'Wait for an already submitted desktop run. A completed reply still requires independent artifact review.', {
  conversationId: id,
  runId: id,
  timeoutSeconds: z.number().int().min(1).max(55).default(20),
}, tool(async ({ conversationId, runId, timeoutSeconds }) => runCli([
  'sessions', 'wait', conversationId, '--run', runId, '--timeout', String(timeoutSeconds),
], { timeoutMs: (timeoutSeconds + 10) * 1000 })));
server.tool('doubao_desktop_read', 'Read messages from a specified Doubao desktop conversation.', {
  conversationId: id,
  limit: z.number().int().min(1).max(100).default(20),
}, tool(async ({ conversationId, limit }) => runCli([
  'sessions', 'read', conversationId, '--limit', String(limit),
], { timeoutMs: 45_000 })));

await server.connect(new StdioServerTransport());
