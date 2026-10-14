import { DatabaseSync } from "node:sqlite";
import { mkdirSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
let instance: DatabaseSync;
export function db() {
  if (instance) return instance;
  const path = process.env.DATABASE_PATH || "./data/attendance.sqlite";
  if (path !== ":memory:")
    mkdirSync(dirname(resolve(path)), { recursive: true });
  instance = new DatabaseSync(path);
  instance.exec("PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000;");
  instance.exec(readFileSync(resolve("migrations/001_initial.sql"), "utf8"));
  instance
    .prepare("INSERT OR IGNORE INTO courses VALUES (?,?)")
    .run("LAWS7701", "Data Applications and Regulation in Digital Society");
  for (let i = 1; i <= 25; i++) {
    const id = `S${String(i).padStart(3, "0")}`;
    instance
      .prepare("INSERT OR IGNORE INTO students VALUES (?,?)")
      .run(id, `Demo Student ${i}`);
    instance
      .prepare("INSERT OR IGNORE INTO enrollments VALUES (?,?)")
      .run("LAWS7701", id);
  }
  return instance;
}
export const all = (sql: string, ...args: any[]) =>
  db()
    .prepare(sql)
    .all(...args) as any[];
export const one = (sql: string, ...args: any[]) =>
  db()
    .prepare(sql)
    .get(...args) as any;
export const run = (sql: string, ...args: any[]) =>
  db()
    .prepare(sql)
    .run(...args);
export function prune() {
  const days = Number(process.env.LOCATION_RETENTION_DAYS || 30);
  if (!Number.isFinite(days) || days < 1)
    throw new Error("Invalid retention days");
  return run(
    "UPDATE attendance SET raw_latitude=NULL,raw_longitude=NULL,corrected_latitude=NULL,corrected_longitude=NULL WHERE timestamp<? AND raw_latitude IS NOT NULL",
    Date.now() - days * 86400000,
  ).changes;
}
