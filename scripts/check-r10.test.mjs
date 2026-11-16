import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { findViolations } from "./check-r10.mjs";

function withTree(files, fn) {
  const root = mkdtempSync(join(tmpdir(), "r10-"));
  try {
    for (const [p, content] of Object.entries(files)) {
      mkdirSync(join(root, p, ".."), { recursive: true });
      writeFileSync(join(root, p), content);
    }
    return fn(root);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

const paths = (v) => v.map(([p]) => p).sort();

test("чистое дерево проходит", () => {
  withTree({ "a.txt": "hi", "src/b.ts": "x" }, (r) => assert.deepEqual(findViolations(r), []));
});

test("test.db ловится по расширению", () => {
  withTree({ "test.db": "x" }, (r) => assert.deepEqual(paths(findViolations(r)), ["test.db"]));
});

test("WAL/SHM/bak/dmg ловятся", () => {
  withTree({ "x.db-wal": "", "y-shm": "", "z.bak": "", "app.dmg": "" }, (r) =>
    assert.equal(findViolations(r).length, 4),
  );
});

test("файл без расширения с сигнатурой SQLite ловится", () => {
  withTree({ "data/blob": "SQLite format 3\0rest" }, (r) =>
    assert.deepEqual(paths(findViolations(r)), ["data/blob"]),
  );
});

test("файл из каталога backups ловится", () => {
  withTree({ "Backups/note.txt": "x", "sub/backups/y.txt": "x" }, (r) =>
    assert.equal(findViolations(r).length, 2),
  );
});
