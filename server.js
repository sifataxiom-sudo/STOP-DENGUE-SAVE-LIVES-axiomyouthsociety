import 'dotenv/config';
import express from 'express';
import { createServer } from 'node:http';
import { timingSafeEqual } from 'node:crypto';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createSubmissionStore } from './storage.js';

const app = express();
const port = Number(process.env.PORT || 3001);
const dataFile = process.env.DATA_FILE || path.join(process.cwd(), 'data', 'submissions.json');
const store = createSubmissionStore(dataFile);
const adminUsername = process.env.ADMIN_USERNAME;
const adminPassword = process.env.ADMIN_PASSWORD;
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const distPath = path.join(__dirname, 'dist');

app.use(express.json({ limit: '10mb' }));

function safeEquals(actual, expected) {
  const actualBuffer = Buffer.from(actual);
  const expectedBuffer = Buffer.from(expected);
  return actualBuffer.length === expectedBuffer.length && timingSafeEqual(actualBuffer, expectedBuffer);
}

function isAdminAuthorized(header = '') {
  if (!adminUsername || !adminPassword || !header.startsWith('Basic ')) return false;
  try {
    const [username, ...passwordParts] = Buffer.from(header.slice(6), 'base64').toString('utf8').split(':');
    return safeEquals(username, adminUsername) && safeEquals(passwordParts.join(':'), adminPassword);
  } catch {
    return false;
  }
}

function requireAdmin(req, res, next) {
  if (!isAdminAuthorized(req.headers.authorization)) {
    return res.status(401).json({ message: 'Admin login is required.' });
  }
  return next();
}

app.get('/api/health', (_req, res) => {
  res.json({ ok: true });
});

app.post('/api/admin/login', (req, res) => {
  if (isAdminAuthorized(req.headers.authorization)) {
    return res.json({ ok: true });
  }
  return res.status(401).json({ message: 'Invalid admin credentials.' });
});

app.get('/api/audit', requireAdmin, async (_req, res) => {
  try {
    const submissions = await store.list('audit');
    res.json(submissions);
  } catch (error) {
    res.status(500).json({ message: 'Failed to load audit submissions.' });
  }
});

app.post('/api/audit', async (req, res) => {
  try {
    const submission = req.body;
    if (!submission || typeof submission !== 'object' || !submission.id) {
      return res.status(400).json({ message: 'Audit submission is invalid.' });
    }

    const submissions = await store.save('audit', submission);
    return res.status(201).json(submissions[0]);
  } catch (error) {
    return res.status(500).json({ message: 'Failed to save audit submission.' });
  }
});

app.delete('/api/audit/:id', requireAdmin, async (req, res) => {
  try {
    await store.remove('audit', req.params.id);
    res.status(204).send();
  } catch (error) {
    res.status(500).json({ message: 'Failed to delete audit submission.' });
  }
});

app.delete('/api/audit', requireAdmin, async (req, res) => {
  try {
    await store.clear('audit');
    res.status(204).send();
  } catch (error) {
    res.status(500).json({ message: 'Failed to clear audit submissions.' });
  }
});

app.get('/api/volunteer', requireAdmin, async (_req, res) => {
  try {
    const submissions = await store.list('volunteer');
    res.json(submissions);
  } catch (error) {
    res.status(500).json({ message: 'Failed to load volunteer submissions.' });
  }
});

app.post('/api/volunteer', async (req, res) => {
  try {
    const submission = req.body;
    if (!submission || typeof submission !== 'object' || !submission.id) {
      return res.status(400).json({ message: 'Volunteer submission is invalid.' });
    }

    const submissions = await store.save('volunteer', submission);
    return res.status(201).json(submissions[0]);
  } catch (error) {
    return res.status(500).json({ message: 'Failed to save volunteer submission.' });
  }
});

app.delete('/api/volunteer/:id', requireAdmin, async (req, res) => {
  try {
    await store.remove('volunteer', req.params.id);
    res.status(204).send();
  } catch (error) {
    res.status(500).json({ message: 'Failed to delete volunteer submission.' });
  }
});

app.delete('/api/volunteer', requireAdmin, async (req, res) => {
  try {
    await store.clear('volunteer');
    res.status(204).send();
  } catch (error) {
    res.status(500).json({ message: 'Failed to clear volunteer submissions.' });
  }
});

if (existsSync(distPath)) {
  app.use(express.static(distPath));
  app.get('*', (_req, res) => {
    res.sendFile(path.join(distPath, 'index.html'));
  });
}

const server = createServer(app);
server.listen(port, '0.0.0.0', () => {
  console.log(`Axiom data API is running on http://localhost:${port}`);
});

process.on('SIGTERM', () => {
  server.close(() => process.exit(0));
});
