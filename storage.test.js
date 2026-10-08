import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createSubmissionStore } from './storage.js';

test('stores and returns submissions across writes', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'axiom-store-'));
  const store = createSubmissionStore(path.join(root, 'submissions.json'));

  await store.save('audit', { id: 'A-1', name: 'Test User' });
  await store.save('audit', { id: 'A-2', name: 'Second User' });

  const submissions = await store.list('audit');
  assert.deepEqual(submissions.map((item) => item.id), ['A-2', 'A-1']);

  await rm(root, { recursive: true, force: true });
});

test('preserves concurrent submissions and replaces duplicate IDs', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'axiom-store-'));
  const store = createSubmissionStore(path.join(root, 'submissions.json'));

  await Promise.all(
    Array.from({ length: 20 }, (_, index) =>
      store.save('audit', { id: `A-${index}`, name: `User ${index}` })
    )
  );
  await store.save('audit', { id: 'A-0', name: 'Updated User' });

  const submissions = await store.list('audit');
  assert.equal(submissions.length, 20);
  assert.equal(submissions.filter((item) => item.id === 'A-0').length, 1);
  assert.equal(submissions.find((item) => item.id === 'A-0').name, 'Updated User');

  await rm(root, { recursive: true, force: true });
});

test('persists data to disk for later reads', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'axiom-store-'));
  const filePath = path.join(root, 'submissions.json');
  await writeFile(filePath, JSON.stringify({ audit: [{ id: 'A-1', name: 'Persisted' }] }));

  const store = createSubmissionStore(filePath);
  const submissions = await store.list('audit');
  assert.equal(submissions[0].name, 'Persisted');

  await rm(root, { recursive: true, force: true });
});

test('removes the requested submission and preserves other data', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'axiom-store-'));
  const store = createSubmissionStore(path.join(root, 'submissions.json'));

  await store.save('audit', { id: 'A-1', name: 'One' });
  await store.save('audit', { id: 'A-2', name: 'Two' });
  await store.remove('audit', 'A-1');

  assert.deepEqual((await store.list('audit')).map((item) => item.id), ['A-2']);

  await rm(root, { recursive: true, force: true });
});
