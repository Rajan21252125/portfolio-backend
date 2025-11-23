import dotenv from "dotenv";
dotenv.config();

import pg from "pg";
const { Pool } = pg;

// runtime imports done. Import types only for TS:
import type { PoolClient, PoolConfig, QueryResult, QueryResultRow } from "pg";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error("Missing DATABASE_URL in environment");
}

const poolConfig: PoolConfig = {
  connectionString,
  max: process.env.PG_MAX_CLIENTS ? parseInt(process.env.PG_MAX_CLIENTS, 10) : 5,
  idleTimeoutMillis: process.env.PG_IDLE_MS ? parseInt(process.env.PG_IDLE_MS, 10) : 30000,
  ssl: { rejectUnauthorized: false },
};

export const pool = new Pool(poolConfig);

pool.on("error", (err: unknown) => {
  console.error("Unexpected pg idle error:", err);
});

export const query = async <T extends QueryResultRow = any>(
  text: string,
  params?: any[]
): Promise<QueryResult<T>> => {
  return pool.query<T>(text, params);
};

export const getClient = async (): Promise<PoolClient> => {
  return pool.connect();
};
