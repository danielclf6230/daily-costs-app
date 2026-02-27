import mysql from "mysql2/promise";

export function createPoolFromEnv() {
  const { DB_HOST, DB_PORT = "3306", DB_USER, DB_PASS, DB_NAME } = process.env;

  if (!DB_HOST || !DB_USER || !DB_PASS || !DB_NAME) {
    throw new Error(
      "Missing DB env vars. Need DB_HOST, DB_USER, DB_PASS, DB_NAME.",
    );
  }

  return mysql.createPool({
    host: DB_HOST,
    port: Number(DB_PORT),
    user: DB_USER,
    password: DB_PASS,
    database: DB_NAME,
    waitForConnections: true,
    connectionLimit: 10,
  });
}
