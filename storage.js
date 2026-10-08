import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

const DEFAULT_DATA = { audit: [], volunteer: [] };

export function createSubmissionStore(filePath) {
  const resolvedPath = path.resolve(filePath);
  let operationQueue = Promise.resolve();

  function serialize(operation) {
    const result = operationQueue.then(operation);
    operationQueue = result.then(() => undefined, () => undefined);
    return result;
  }

  async function ensureFile() {
    const dir = path.dirname(resolvedPath);
    await mkdir(dir, { recursive: true });
    try {
      await readFile(resolvedPath, 'utf8');
    } catch (error) {
      if ((error).code === 'ENOENT') {
        await writeFile(resolvedPath, JSON.stringify(DEFAULT_DATA, null, 2));
      } else {
        throw error;
      }
    }
  }

  async function readData() {
    await ensureFile();
    const rawData = await readFile(resolvedPath, 'utf8');
    const parsed = JSON.parse(rawData);
    return {
      audit: Array.isArray(parsed.audit) ? parsed.audit : [],
      volunteer: Array.isArray(parsed.volunteer) ? parsed.volunteer : []
    };
  }

  async function writeData(data) {
    await ensureFile();
    await writeFile(resolvedPath, JSON.stringify(data, null, 2));
  }

  return {
    async list(type) {
      return serialize(async () => {
        const data = await readData();
        return data[type] ?? [];
      });
    },

    async save(type, item) {
      return serialize(async () => {
        const data = await readData();
        const items = data[type] ?? [];
        const updated = [item, ...items.filter((existing) => existing.id !== item.id)];
        data[type] = updated;
        await writeData(data);
        return updated;
      });
    },

    async remove(type, id) {
      return serialize(async () => {
        const data = await readData();
        const items = data[type] ?? [];
        const updated = items.filter((item) => item.id !== id);
        data[type] = updated;
        await writeData(data);
        return updated;
      });
    },

    async clear(type) {
      return serialize(async () => {
        const data = await readData();
        data[type] = [];
        await writeData(data);
        return data;
      });
    }
  };
}
