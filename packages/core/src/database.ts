import { AsyncLocalStorage } from "node:async_hooks"
import { drizzle } from "drizzle-orm/node-postgres"
import type { NodePgDatabase } from "drizzle-orm/node-postgres"
import pg from "pg"
import type { Pool as PoolType } from "pg"
import { config } from "./config"
import { schema } from "./schema"

const { Pool } = pg

export * from "drizzle-orm"

type Db = NodePgDatabase<typeof schema>
type Effect = () => void | Promise<void>
type Store = { db: Db; effects: Effect[] }

const storage = new AsyncLocalStorage<Store>()

const state: { pool: PoolType | null; db: Db | null } = { pool: null, db: null }

function getPool() {
  if (state.pool) return state.pool
  state.pool = new Pool({ connectionString: config().database.url })
  return state.pool
}

function getDb(): Db {
  if (state.db) return state.db
  state.db = drizzle(getPool(), { schema })
  return state.db
}

export async function withDb<T>(callback: (db: Db) => Promise<T>): Promise<T> {
  const store = storage.getStore()
  if (store) return callback(store.db)
  const effects: Effect[] = []
  const db = getDb()
  const result = await storage.run({ db, effects }, () => callback(db))
  await Promise.all(effects.map((run) => run()))
  return result
}

export async function withTx<T>(callback: (db: Db) => Promise<T>): Promise<T> {
  const store = storage.getStore()
  if (store) return callback(store.db)
  const effects: Effect[] = []
  const db = getDb()
  const result = await db.transaction(async (tx) => {
    return storage.run({ db: tx as Db, effects }, () => callback(tx as Db))
  })
  await Promise.all(effects.map((run) => run()))
  return result
}

export async function afterTx(run: Effect) {
  const store = storage.getStore()
  if (!store) return run()
  store.effects.push(run)
}

export function pool() {
  return getPool()
}

export function db() {
  return getDb()
}

export function first<T>(rows: T[]): T | undefined {
  return rows[0]
}

export { schema }
