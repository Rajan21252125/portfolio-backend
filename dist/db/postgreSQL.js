import * as dotenv from "dotenv";
import { Pool } from "pg";
dotenv.config();
const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
    throw new Error("Missing DATABASE_URL in environment");
}
const poolConfig = {
    connectionString,
    max: process.env.PG_MAX_CLIENTS ? parseInt(process.env.PG_MAX_CLIENTS, 10) : 5,
    idleTimeoutMillis: process.env.PG_IDLE_MS ? parseInt(process.env.PG_IDLE_MS, 10) : 30000,
    ssl: { rejectUnauthorized: false },
};
export const pool = new Pool(poolConfig);
pool.on("error", (err) => {
    console.error("Unexpected pg idle error:", err);
});
export const query = async (text, params) => {
    return pool.query(text, params);
};
export const getClient = async () => {
    return pool.connect();
};
