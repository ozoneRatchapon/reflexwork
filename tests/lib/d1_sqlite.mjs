// A D1 stand-in on Node's built-in SQLite (real SQL, in memory): prepare().bind().first/all/run, prepare().first/all/run, exec.
import { DatabaseSync } from 'node:sqlite';
export function d1() {
  const db = new DatabaseSync(':memory:');
  const stmt = (sql, args) => ({
    first: async () => db.prepare(sql).get(...args) ?? null,
    all: async () => ({ results: db.prepare(sql).all(...args) }),
    run: async () => { const r = db.prepare(sql).run(...args); return { meta: { changes: Number(r.changes), last_row_id: Number(r.lastInsertRowid) } }; },
  });
  return { exec: async sql => { db.exec(sql); return {}; }, prepare: sql => ({ bind: (...a) => stmt(sql, a), ...stmt(sql, []) }), raw: db };
}
