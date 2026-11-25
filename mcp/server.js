#!/usr/bin/env node
// MCP server for creating Mira cards. It talks to the Mira HTTP API, so roles,
// card numbering, hierarchy, priority limits and notifications all still apply.
import { readFile, writeFile, chmod } from 'fs/promises';
import { fileURLToPath } from 'url';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';

const trimSlash = (url) => url.replace(/\/+$/, '');
const API_URL = trimSlash(process.env.MIRA_API_URL || 'http://localhost:3001');
const APP_URL = trimSlash(process.env.MIRA_APP_URL || 'http://localhost:5173/mira');
const SESSION_FILE =
  process.env.MIRA_SESSION_FILE || fileURLToPath(new URL('./.session.json', import.meta.url));

// A token is only ever sent back to the server that issued it.
async function readToken() {
  try {
    const session = JSON.parse(await readFile(SESSION_FILE, 'utf8'));
    return session.apiUrl === API_URL ? session.token : null;
  } catch {
    return null;
  }
}

async function api(path, { method = 'GET', body, auth = true } = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (auth) {
    const token = await readToken();
    if (!token) throw new Error('Not signed in. Use request_login_code, then verify_login_code.');
    headers.Authorization = `Bearer ${token}`;
  }

  let res;
  try {
    res = await fetch(`${API_URL}/api${path}`, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(30000),
    });
  } catch (err) {
    throw new Error(`Could not reach Mira at ${API_URL} (${err.message}). Is it running?`);
  }

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const hint = auth && res.status === 401 ? ' Sign in again with request_login_code.' : '';
    throw new Error(`${data.error || `Request failed (${res.status})`}${hint}`);
  }
  return data;
}

const same = (a, b) => String(a).trim().toLowerCase() === String(b).trim().toLowerCase();

// Turn a human name into exactly one record, or explain what the choices are.
function pick(items, value, fields, what) {
  const matches = items.filter((item) => fields.some((f) => same(item[f], value)));
  if (matches.length === 1) return matches[0];
  const choices = (matches.length ? matches : items).map((i) => fields.map((f) => i[f]).join(' / '));
  throw new Error(
    `${matches.length ? 'More than one' : 'No'} ${what} matches "${value}". Choices: ${choices.join(', ') || 'none'}`
  );
}

async function findProject(value) {
  const { projects } = await api('/projects');
  return pick(projects, value, ['key', 'name'], 'project');
}

const cardUrl = (projectKey, cardKey) => `${APP_URL}/projects/${projectKey}/board/${cardKey}`;

const server = new McpServer({ name: 'mira', version: '1.0.0' });

function tool(name, description, inputSchema, handler) {
  server.registerTool(name, { description, inputSchema }, async (args) => {
    try {
      const result = await handler(args);
      return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
    } catch (err) {
      return { isError: true, content: [{ type: 'text', text: err.message }] };
    }
  });
}

tool(
  'request_login_code',
  'Email a 6-digit Mira sign-in code. Only needed when not signed in or the session has expired.',
  { email: z.string().email() },
  async ({ email }) => {
    const data = await api('/auth/request-otp', { method: 'POST', body: { email }, auth: false });
    return {
      message: data.devConsole
        ? 'Mail is not configured: the code is in the Mira server log.'
        : `Code sent to ${email}.`,
    };
  }
);

tool(
  'verify_login_code',
  'Sign in to Mira with the 6-digit code the user provides.',
  { email: z.string().email(), code: z.string().regex(/^\d{6}$/) },
  async ({ email, code }) => {
    const { token, user } = await api('/auth/verify-otp', {
      method: 'POST',
      body: { email, otp: code },
      auth: false,
    });
    await writeFile(SESSION_FILE, JSON.stringify({ apiUrl: API_URL, token }), { mode: 0o600 });
    await chmod(SESSION_FILE, 0o600);
    return { signedInAs: user.email, role: user.role };
  }
);

tool('list_projects', 'List the Mira projects that cards can be created in.', {}, async () => {
  const { projects } = await api('/projects');
  return projects.map((p) => ({ key: p.key, name: p.name }));
});

tool(
  'get_project_options',
  'List the card types, statuses and assignable users for a project.',
  { project: z.string().describe('Project key or name') },
  async ({ project }) => {
    const found = await findProject(project);
    const [{ issueTypes }, { statuses }, { users }] = await Promise.all([
      api('/issue-types'),
      api(`/projects/${found.id}/statuses`),
      api('/users'),
    ]);
    return {
      project: found.key,
      types: issueTypes.map((t) => t.name),
      statuses: statuses.map((s) => s.name),
      users: users.filter((u) => !u.deactivatedAt).map((u) => ({ name: u.name, email: u.email })),
    };
  }
);

tool(
  'search_cards',
  'Search a project by card title or key. Use it to check for duplicates before creating a card.',
  { project: z.string().describe('Project key or name'), query: z.string().min(1) },
  async ({ project, query }) => {
    const found = await findProject(project);
    const { issues } = await api(`/projects/${found.id}/issues?q=${encodeURIComponent(query)}`);
    return issues.map((i) => ({
      key: i.key,
      title: i.title,
      priority: i.priority,
      assignee: i.assigneeName,
      url: cardUrl(found.key, i.key),
    }));
  }
);

tool(
  'create_card',
  'Create a card on a Mira project board. Assigning it notifies the assignee.',
  {
    project: z.string().describe('Project key or name'),
    title: z.string().min(1),
    description: z.string().optional(),
    type: z.string().default('Task').describe('Epic, Story, Task, Bug or Subtask'),
    priority: z.enum(['urgent', 'high', 'medium', 'low']).default('medium'),
    status: z.string().optional().describe('Column name; defaults to the project default'),
    assignee: z.string().optional().describe('User email or full name'),
    dueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().describe('YYYY-MM-DD'),
    storyPoints: z.number().int().min(0).optional(),
    parentKey: z.string().optional().describe('Key of the parent card, e.g. ENG-1'),
  },
  async ({ project, type, status, assignee, parentKey, ...fields }) => {
    const found = await findProject(project);
    const { issueTypes } = await api('/issue-types');
    const body = { ...fields, issueTypeId: pick(issueTypes, type, ['name'], 'card type').id };

    if (status) {
      const { statuses } = await api(`/projects/${found.id}/statuses`);
      body.statusId = pick(statuses, status, ['name'], 'status').id;
    }
    if (assignee) {
      const { users } = await api('/users');
      const active = users.filter((u) => !u.deactivatedAt);
      body.assigneeId = pick(active, assignee, ['email', 'name'], 'user').id;
    }
    if (parentKey) {
      const { issues } = await api(`/projects/${found.id}/issues?q=${encodeURIComponent(parentKey)}`);
      body.parentId = pick(issues, parentKey, ['key'], 'parent card').id;
    }

    const { issue } = await api(`/projects/${found.id}/issues`, { method: 'POST', body });
    return { key: issue.key, title: issue.title, url: cardUrl(found.key, issue.key) };
  }
);

await server.connect(new StdioServerTransport());
