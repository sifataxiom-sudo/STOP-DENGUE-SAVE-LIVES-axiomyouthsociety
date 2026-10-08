import { timingSafeEqual } from 'node:crypto';

const TABLE = 'submissions';
const VALID_TYPES = new Set(['audit', 'volunteer']);

function response(statusCode, payload) {
  return {
    statusCode,
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
    body: statusCode === 204 ? '' : JSON.stringify(payload)
  };
}

function safeEquals(actual, expected) {
  const actualBuffer = Buffer.from(actual);
  const expectedBuffer = Buffer.from(expected);
  return actualBuffer.length === expectedBuffer.length && timingSafeEqual(actualBuffer, expectedBuffer);
}

function isAdminAuthorized(header = '') {
  const expectedUsername = process.env.ADMIN_USERNAME;
  const expectedPassword = process.env.ADMIN_PASSWORD;
  if (!expectedUsername || !expectedPassword || !header.startsWith('Basic ')) return false;

  try {
    const [username, ...passwordParts] = Buffer.from(header.slice(6), 'base64').toString('utf8').split(':');
    const password = passwordParts.join(':');
    return safeEquals(username, expectedUsername) && safeEquals(password, expectedPassword);
  } catch {
    return false;
  }
}

function getSupabaseConfig() {
  const url = process.env.SUPABASE_URL?.replace(/\/$/, '');
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) throw new Error('Supabase environment variables are not configured.');
  return { url, serviceKey };
}

async function supabaseRequest(path, options = {}) {
  const { url, serviceKey } = getSupabaseConfig();
  const result = await fetch(`${url}/rest/v1/${TABLE}${path}`, {
    ...options,
    headers: {
      apikey: serviceKey,
      Authorization: 'Bearer ' + serviceKey,
      'Content-Type': 'application/json',
      ...(options.headers || {})
    }
  });

  if (!result.ok) {
    const detail = await result.text();
    console.error('Supabase request failed:', result.status, detail);
    throw new Error(`Database request failed with status ${result.status}.`);
  }
  if (result.status === 204) return null;
  return result.json();
}

function parseBody(event) {
  if (!event.body) return {};
  const body = event.isBase64Encoded
    ? Buffer.from(event.body, 'base64').toString('utf8')
    : event.body;
  return JSON.parse(body);
}

function getRoutePath(event) {
  const functionPrefix = '/.netlify/functions/api';
  const path = event.path || new URL(event.rawUrl).pathname;
  if (path.startsWith(functionPrefix)) return path.slice(functionPrefix.length) || '/';
  if (path.startsWith('/api/')) return path.slice(4);
  return path;
}

export const handler = async (event) => {
  try {
    const method = event.httpMethod;
    const route = getRoutePath(event);

    if (method === 'POST' && route === '/admin/login') {
      if (!process.env.ADMIN_USERNAME || !process.env.ADMIN_PASSWORD) {
        return response(503, { message: 'Admin credentials are not configured.' });
      }
      return isAdminAuthorized(event.headers?.authorization || event.headers?.Authorization || '')
        ? response(200, { ok: true })
        : response(401, { message: 'Invalid admin credentials.' });
    }

    const match = route.match(/^\/(audit|volunteer)(?:\/([^/]+))?$/);
    if (!match) return response(404, { message: 'Not found.' });

    const [, kind, encodedId] = match;
    if (!VALID_TYPES.has(kind)) return response(404, { message: 'Not found.' });
    const needsAdmin = method === 'GET' || method === 'DELETE';
    const authorization = event.headers?.authorization || event.headers?.Authorization || '';
    if (needsAdmin && !isAdminAuthorized(authorization)) {
      return response(401, { message: 'Admin login is required.' });
    }

    if (method === 'GET' && !encodedId) {
      const submissions = [];
      const pageSize = 1000;
      for (let offset = 0; ; offset += pageSize) {
        const rows = await supabaseRequest(
          `?select=data&kind=eq.${kind}&order=created_at.desc,id.asc`,
          { headers: { Range: `${offset}-${offset + pageSize - 1}` } }
        );
        submissions.push(...rows.map((row) => row.data));
        if (rows.length < pageSize) break;
      }
      return response(200, submissions);
    }

    if (method === 'POST' && !encodedId) {
      const submission = parseBody(event);
      if (!submission || typeof submission !== 'object' || Array.isArray(submission) ||
          typeof submission.id !== 'string' || submission.id.length === 0) {
        return response(400, { message: 'Submission is invalid.' });
      }

      const rows = await supabaseRequest('?on_conflict=kind,id', {
        method: 'POST',
        headers: { Prefer: 'resolution=merge-duplicates,return=representation' },
        body: JSON.stringify([{ kind, id: submission.id, data: submission }])
      });
      return response(201, rows[0].data);
    }

    if (method === 'DELETE') {
      const id = encodedId ? decodeURIComponent(encodedId) : null;
      const query = new URLSearchParams({ kind: `eq.${kind}` });
      if (id) query.set('id', `eq.${id}`);
      await supabaseRequest(`?${query.toString()}`, {
        method: 'DELETE',
        headers: { Prefer: 'return=minimal' }
      });
      return response(204);
    }

    return response(405, { message: 'Method not allowed.' });
  } catch (error) {
    console.error('API function failed:', error);
    return response(500, { message: 'The request could not be completed.' });
  }
};
