#!/usr/bin/env node
// Проверка R10: в дереве репозитория не должно быть файлов данных.
// Падает (exit 1) и печатает путь, если найден файл:
//  - с запрещённым расширением/именем (БД, WAL/SHM, .bak, .dmg);
//  - из каталога Backups/ или backups/;
//  - с сигнатурой SQLite ("SQLite format 3\0") независимо от расширения.
// Проверяются файлы, которые попадут в коммит (отслеживаемые + неигнорируемые
// новые); вне git — обход каталога.
import { execFileSync } from "node:child_process";
import { closeSync, openSync, readSync, readdirSync, statSync } from "node:fs";
import { join, relative, resolve, sep } from "node:path";
import { pathToFileURL } from "node:url";

const FORBIDDEN_NAME = /(\.(sqlite|sqlite3|db|bak|dmg)|\.db-wal|\.db-shm|-wal|-shm)$/i;
const BACKUP_DIR = /(^|\/)[Bb]ackups\//;
const SQLITE_MAGIC = Buffer.from("SQLite format 3\0", "latin1");
const SKIP_DIRS = new Set([".git", "node_modules", "target", "dist"]);

export function listFiles(root) {
  try {
    const out = execFileSync(
      "git",
      ["ls-files", "-z", "--cached", "--others", "--exclude-standard"],
      { cwd: root, stdio: ["ignore", "pipe", "ignore"], maxBuffer: 1 << 28 },
    ).toString("utf8");
    return out.split("\0").filter(Boolean);
  } catch {
    const res = [];
    const walk = (dir) => {
      for (const e of readdirSync(dir, { withFileTypes: true })) {
        if (e.isDirectory()) {
          if (!SKIP_DIRS.has(e.name)) walk(join(dir, e.name));
        } else if (e.isFile()) {
          res.push(relative(root, join(dir, e.name)).split(sep).join("/"));
        }
      }
    };
    walk(root);
    return res;
  }
}

function hasSqliteSignature(path) {
  let fd;
  try {
    if (!statSync(path).isFile()) return false;
    fd = openSync(path, "r");
    const buf = Buffer.alloc(SQLITE_MAGIC.length);
    const n = readSync(fd, buf, 0, buf.length, 0);
    return n === buf.length && buf.equals(SQLITE_MAGIC);
  } catch {
    return false;
  } finally {
    if (fd !== undefined) closeSync(fd);
  }
}

export function findViolations(root) {
  const violations = [];
  for (const rel of listFiles(root)) {
    if (FORBIDDEN_NAME.test(rel)) violations.push([rel, "запрещённое расширение/имя"]);
    else if (BACKUP_DIR.test(rel)) violations.push([rel, "каталог бэкапов"]);
    else if (hasSqliteSignature(join(root, rel))) violations.push([rel, "сигнатура SQLite"]);
  }
  return violations;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  const root = resolve(process.argv[2] ?? ".");
  const violations = findViolations(root);
  if (violations.length > 0) {
    console.error("R10: найдены файлы данных, которых не должно быть в репозитории:");
    for (const [path, why] of violations) console.error(`  ${path} — ${why}`);
    process.exit(1);
  }
  console.log("R10: OK, файлов данных в дереве нет.");
}
