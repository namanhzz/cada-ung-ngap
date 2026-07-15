import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { readFileSync } from 'node:fs';

// Gốc repo — luôn dùng đường dẫn tuyệt đối (thư mục có dấu tiếng Việt)
export const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

export const CONFIG = JSON.parse(
  readFileSync(join(ROOT, 'config', 'pipeline.config.json'), 'utf8')
);

export const p = (...segs) => join(ROOT, ...segs);
