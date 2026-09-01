import crypto from "crypto";
import { readFile, writeFile } from "fs/promises";

const envUrl = new URL("./.env", import.meta.url);
const source = await readFile(envUrl, "utf8");
const secret = crypto.randomBytes(48).toString("base64url");
const updated = /^JWT_SECRET=.*$/m.test(source)
  ? source.replace(/^JWT_SECRET=.*$/m, `JWT_SECRET=${secret}`)
  : `${source.replace(/\s*$/, "")}\nJWT_SECRET=${secret}\n`;
await writeFile(envUrl, updated, { encoding: "utf8", mode: 0o600 });
console.log("JWT secret rotated successfully (64 characters). Existing sessions are now invalid.");
