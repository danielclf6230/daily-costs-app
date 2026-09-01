import dotenv from "dotenv";
dotenv.config();

import express from "express";
import cors from "cors";
import { z } from "zod";
import bcrypt from "bcrypt";
import crypto from "crypto";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import { makePool } from "./db.js";
import { loginHandler, requireAuth } from "./auth.js";

if (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 32) {
  throw new Error("JWT_SECRET must be configured with at least 32 characters.");
}

const app = express();
app.disable("x-powered-by");
app.use(helmet({ crossOriginResourcePolicy: { policy: "cross-origin" } }));
app.use(express.json({ limit: "2mb" }));

const allowedOrigins = [
  process.env.FRONTEND_ORIGIN,
  "http://localhost:5173",
  "https://daily-costs-6u5rawl-danielcf6230s-projects.vercel.app",
  "https://daily-costs-app.vercel.app",
].filter(Boolean);

app.use(cors({
  origin(origin, callback) {
    if (!origin || allowedOrigins.includes(origin)) return callback(null, true);
    return callback(new Error("Not allowed by CORS"));
  },
  credentials: true,
}));

const pool = makePool();

const id = z.string().min(1).max(100);
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).or(z.literal(""));
const time = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/).or(z.literal(""));
const TripSchema = z.object({
  tripName: z.string().max(120),
  startDate: date,
  endDate: date,
  shopping: z.array(z.object({ id, text: z.string().max(240), checked: z.boolean() })).max(500),
  days: z.array(z.object({
    id,
    date,
    completed: z.boolean(),
    items: z.array(z.object({
      id,
      place: z.string().max(160),
      time,
      duration: z.string().max(80),
      note: z.string().max(500),
      checked: z.boolean(),
    })).max(100),
  })).max(60),
  travelers: z.array(z.object({ id, name: z.string().max(80) })).max(30),
  notes: z.string().max(20000),
});

app.get("/health", async (_req, res) => {
  try {
    const [rows] = await pool.query("SELECT 1 AS ok");
    res.json({ ok: true, db: rows?.[0]?.ok === 1 });
  } catch (error) {
    res.status(500).json({ ok: false, error: error.message });
  }
});

const authLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 20, standardHeaders: "draft-7", legacyHeaders: false, message: { message: "Too many attempts. Please wait and try again." } });
app.post("/api/auth/login", authLimiter, (req, res) => loginHandler(req, res, pool));

app.post("/api/auth/register", authLimiter, async (req, res) => {
  const parsed = z.object({
    name: z.string().trim().min(2).max(80),
    password: z.string().min(10).max(100).regex(/[a-z]/).regex(/[A-Z]/).regex(/[0-9]/),
    inviteCode: z.string().trim().min(8).max(32),
  }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ message: "Use your invite code and a 10+ character password with upper/lowercase letters and a number." });

  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const { name, password, inviteCode } = parsed.data;
    let invitedTrip = null;
    if (inviteCode) {
      const [invites] = await connection.execute(
        "SELECT id, trip_id FROM trip_tools_invites WHERE code = ? AND used_at IS NULL AND expires_at > NOW() FOR UPDATE",
        [inviteCode.toUpperCase()],
      );
      if (!invites.length) {
        await connection.rollback();
        return res.status(400).json({ message: "This invitation is invalid, expired, or already used." });
      }
      invitedTrip = invites[0];
    }
    const passwordHash = await bcrypt.hash(password, 12);
    const [created] = await connection.execute("INSERT INTO trip_users (name, password) VALUES (?, ?)", [name, passwordHash]);
    let tripId;
    tripId = invitedTrip.trip_id;
    await connection.execute("INSERT INTO trip_tools_members (trip_id, user_id, role) VALUES (?, ?, 'member')", [tripId, created.insertId]);
    await connection.execute("UPDATE trip_tools_invites SET used_by = ?, used_at = NOW() WHERE id = ?", [created.insertId, invitedTrip.id]);
    await connection.commit();
    req.body = { name, password };
    return loginHandler(req, res, pool);
  } catch (error) {
    await connection.rollback();
    if (error?.code === "ER_DUP_ENTRY") return res.status(409).json({ message: "That traveler name is already registered." });
    console.error("Registration failed:", error);
    return res.status(500).json({ message: "Could not create the account." });
  } finally {
    connection.release();
  }
});

app.patch("/api/auth/password", authLimiter, requireAuth, async (req, res) => {
  const parsed = z.object({
    currentPassword: z.string().min(1).max(100),
    newPassword: z.string().min(10).max(100).regex(/[a-z]/).regex(/[A-Z]/).regex(/[0-9]/),
    confirmPassword: z.string().min(1).max(100),
  }).refine((data) => data.newPassword === data.confirmPassword, {
    message: "New passwords do not match.",
    path: ["confirmPassword"],
  }).safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ ok: false, error: "Use a matching 10+ character password with uppercase, lowercase, and a number." });
  }

  try {
    const [users] = await pool.execute("SELECT password FROM trip_users WHERE id = ?", [req.user.id]);
    if (!users.length || !(await bcrypt.compare(parsed.data.currentPassword, users[0].password))) {
      return res.status(400).json({ ok: false, error: "The current password is incorrect." });
    }
    if (await bcrypt.compare(parsed.data.newPassword, users[0].password)) {
      return res.status(400).json({ ok: false, error: "Choose a password different from your current password." });
    }
    const passwordHash = await bcrypt.hash(parsed.data.newPassword, 12);
    await pool.execute("UPDATE trip_users SET password = ? WHERE id = ?", [passwordHash, req.user.id]);
    res.json({ ok: true });
  } catch (error) {
    console.error("Password change failed:", error);
    res.status(500).json({ ok: false, error: "Could not update the password." });
  }
});

app.use("/api/admin", requireAuth, async (req, res, next) => {
  try {
    const [rows] = await pool.execute("SELECT role FROM trip_users WHERE id = ?", [req.user.id]);
    if (rows[0]?.role !== "admin") return res.status(403).json({ ok: false, error: "Administrator access required." });
    next();
  } catch (error) {
    next(error);
  }
});

app.get("/api/admin/users", async (_req, res) => {
  const [users] = await pool.query(`
    SELECT u.id, u.name, u.role, u.created_at, COUNT(m.trip_id) AS trip_count
    FROM trip_users u LEFT JOIN trip_tools_members m ON m.user_id = u.id
    GROUP BY u.id ORDER BY u.created_at, u.id
  `);
  res.json({ ok: true, users });
});

app.get("/api/admin/overview", async (_req, res) => {
  const [users] = await pool.query(`
    SELECT u.id, u.name, u.role, u.created_at, m.trip_id, m.role AS membership_role
    FROM trip_users u LEFT JOIN trip_tools_members m ON m.user_id = u.id
    ORDER BY u.created_at, u.id
  `);
  const [groups] = await pool.query(`
    SELECT t.id, t.owner_user_id,
      COALESCE(JSON_UNQUOTE(JSON_EXTRACT(t.trip_data, '$.tripName')), CONCAT('Trip #', t.id)) AS name,
      t.updated_at
    FROM trip_tools_trips t ORDER BY t.created_at, t.id
  `);
  res.json({
    ok: true,
    users,
    groups: groups.map((group) => ({
      ...group,
      members: users.filter((user) => user.trip_id === group.id).map((user) => ({ id: user.id, name: user.name, role: user.membership_role })),
    })),
  });
});

app.post("/api/admin/users", async (req, res) => {
  const parsed = z.object({
    name: z.string().trim().min(2).max(80),
    password: z.string().min(10).max(100).regex(/[a-z]/).regex(/[A-Z]/).regex(/[0-9]/),
  }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ ok: false, error: "Password must have 10+ characters, upper/lowercase letters, and a number." });
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const hash = await bcrypt.hash(parsed.data.password, 12);
    const [created] = await connection.execute("INSERT INTO trip_users (name, password, role) VALUES (?, ?, 'user')", [parsed.data.name, hash]);
    const data = JSON.stringify({ tripName: `${parsed.data.name}'s Japan Trip`, startDate: "", endDate: "", shopping: [], days: [], travelers: [], notes: "" });
    const [trip] = await connection.execute("INSERT INTO trip_tools_trips (owner_user_id, trip_data) VALUES (?, ?)", [created.insertId, data]);
    await connection.execute("INSERT INTO trip_tools_members (trip_id, user_id, role) VALUES (?, ?, 'owner')", [trip.insertId, created.insertId]);
    await connection.commit();
    res.status(201).json({ ok: true, id: created.insertId });
  } catch (error) {
    await connection.rollback();
    if (error?.code === "ER_DUP_ENTRY") return res.status(409).json({ ok: false, error: "That traveler name already exists." });
    throw error;
  } finally {
    connection.release();
  }
});

app.patch("/api/admin/users/:id/password", async (req, res) => {
  const parsed = z.object({ password: z.string().min(10).max(100).regex(/[a-z]/).regex(/[A-Z]/).regex(/[0-9]/) }).safeParse(req.body);
  const userId = Number(req.params.id);
  if (!parsed.success || !Number.isSafeInteger(userId) || userId < 1) return res.status(400).json({ ok: false, error: "Use a strong password with 10+ characters." });
  const hash = await bcrypt.hash(parsed.data.password, 12);
  const [result] = await pool.execute("UPDATE trip_users SET password = ? WHERE id = ?", [hash, userId]);
  if (!result.affectedRows) return res.status(404).json({ ok: false, error: "User not found." });
  res.json({ ok: true });
});

async function detachFromCurrentGroup(connection, userId) {
  const [memberships] = await connection.execute(
    `SELECT m.trip_id, m.role, t.owner_user_id FROM trip_tools_members m
     JOIN trip_tools_trips t ON t.id = m.trip_id WHERE m.user_id = ? FOR UPDATE`,
    [userId],
  );
  const current = memberships[0];
  if (!current) return;

  if (current.owner_user_id === userId) {
    const [others] = await connection.execute(
      "SELECT user_id FROM trip_tools_members WHERE trip_id = ? AND user_id <> ? ORDER BY joined_at LIMIT 1 FOR UPDATE",
      [current.trip_id, userId],
    );
    if (others.length) {
      await connection.execute("UPDATE trip_tools_trips SET owner_user_id = ? WHERE id = ?", [others[0].user_id, current.trip_id]);
      await connection.execute("UPDATE trip_tools_members SET role = 'owner' WHERE trip_id = ? AND user_id = ?", [current.trip_id, others[0].user_id]);
      await connection.execute("DELETE FROM trip_tools_members WHERE trip_id = ? AND user_id = ?", [current.trip_id, userId]);
    } else {
      await connection.execute("DELETE FROM trip_tools_trips WHERE id = ?", [current.trip_id]);
    }
  } else {
    await connection.execute("DELETE FROM trip_tools_members WHERE trip_id = ? AND user_id = ?", [current.trip_id, userId]);
  }
}

app.patch("/api/admin/users/:id/group", async (req, res) => {
  const userId = Number(req.params.id);
  const parsed = z.object({ groupId: z.number().int().positive().nullable() }).safeParse(req.body);
  if (!Number.isSafeInteger(userId) || userId < 1 || !parsed.success) return res.status(400).json({ ok: false, error: "Choose a valid user and group." });

  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const [users] = await connection.execute("SELECT id, name FROM trip_users WHERE id = ? FOR UPDATE", [userId]);
    if (!users.length) {
      await connection.rollback();
      return res.status(404).json({ ok: false, error: "User not found." });
    }
    const [current] = await connection.execute("SELECT trip_id FROM trip_tools_members WHERE user_id = ?", [userId]);
    if (parsed.data.groupId && current[0]?.trip_id === parsed.data.groupId) {
      await connection.commit();
      return res.json({ ok: true });
    }
    if (parsed.data.groupId) {
      const [target] = await connection.execute("SELECT id FROM trip_tools_trips WHERE id = ?", [parsed.data.groupId]);
      if (!target.length) {
        await connection.rollback();
        return res.status(404).json({ ok: false, error: "Group not found." });
      }
    }
    await detachFromCurrentGroup(connection, userId);
    if (parsed.data.groupId) {
      await connection.execute("INSERT INTO trip_tools_members (trip_id, user_id, role) VALUES (?, ?, 'member')", [parsed.data.groupId, userId]);
    } else {
      const data = JSON.stringify({ tripName: `${users[0].name}'s Japan Trip`, startDate: "", endDate: "", shopping: [], days: [], travelers: [], notes: "" });
      const [trip] = await connection.execute("INSERT INTO trip_tools_trips (owner_user_id, trip_data) VALUES (?, ?)", [userId, data]);
      await connection.execute("INSERT INTO trip_tools_members (trip_id, user_id, role) VALUES (?, ?, 'owner')", [trip.insertId, userId]);
    }
    await connection.commit();
    res.json({ ok: true });
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
});

app.delete("/api/admin/users/:id", async (req, res) => {
  const userId = Number(req.params.id);
  if (!Number.isSafeInteger(userId) || userId < 1) return res.status(400).json({ ok: false, error: "Invalid user." });
  if (userId === req.user.id) return res.status(400).json({ ok: false, error: "You cannot delete your own administrator account." });
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const [users] = await connection.execute("SELECT id FROM trip_users WHERE id = ? FOR UPDATE", [userId]);
    if (!users.length) {
      await connection.rollback();
      return res.status(404).json({ ok: false, error: "User not found." });
    }
    await detachFromCurrentGroup(connection, userId);
    await connection.execute("DELETE FROM trip_users WHERE id = ?", [userId]);
    await connection.commit();
    res.json({ ok: true });
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
});

app.use("/api/trip", requireAuth);

async function getMembership(userId) {
  const [rows] = await pool.execute(
    `SELECT m.trip_id, m.role, t.trip_data, t.updated_at
     FROM trip_tools_members m JOIN trip_tools_trips t ON t.id = m.trip_id
     WHERE m.user_id = ? ORDER BY m.joined_at LIMIT 1`,
    [userId],
  );
  return rows[0] ?? null;
}

app.get("/api/trip", async (req, res) => {
  try {
    const membership = await getMembership(req.user.id);
    if (!membership) return res.status(404).json({ ok: false, error: "No trip is connected to this account." });
    res.json({ ok: true, trip: membership.trip_data, role: membership.role, canInvite: membership.role === "owner", updatedAt: membership.updated_at });
  } catch (error) {
    console.error("Load trip failed:", error);
    res.status(500).json({ ok: false, error: error.message });
  }
});

app.put("/api/trip", async (req, res) => {
  const parsed = TripSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ ok: false, error: parsed.error.flatten() });
  try {
    const membership = await getMembership(req.user.id);
    if (!membership) return res.status(404).json({ ok: false, error: "No trip is connected to this account." });
    await pool.execute("UPDATE trip_tools_trips SET trip_data = ? WHERE id = ?", [JSON.stringify(parsed.data), membership.trip_id]);
    res.json({ ok: true });
  } catch (error) {
    console.error("Save trip failed:", error);
    res.status(500).json({ ok: false, error: error.message });
  }
});

app.get("/api/trip/members", async (req, res) => {
  try {
    const membership = await getMembership(req.user.id);
    if (!membership) return res.status(404).json({ ok: false, error: "No shared trip found." });
    const [members] = await pool.execute(
      `SELECT u.id, u.name, u.avatarUrl, m.role FROM trip_tools_members m
       JOIN trip_users u ON u.id = m.user_id WHERE m.trip_id = ? ORDER BY m.joined_at`,
      [membership.trip_id],
    );
    res.json({ ok: true, members });
  } catch (error) {
    res.status(500).json({ ok: false, error: error.message });
  }
});

app.post("/api/trip/invites", async (req, res) => {
  try {
    const membership = await getMembership(req.user.id);
    if (!membership) return res.status(404).json({ ok: false, error: "No shared trip found." });
    if (membership.role !== "owner") return res.status(403).json({ ok: false, error: "Only the group owner can invite new members." });
    const code = crypto.randomBytes(4).toString("hex").toUpperCase();
    await pool.execute(
      "INSERT INTO trip_tools_invites (trip_id, code, created_by, expires_at) VALUES (?, ?, ?, DATE_ADD(NOW(), INTERVAL 7 DAY))",
      [membership.trip_id, code, req.user.id],
    );
    res.json({ ok: true, code, expiresInDays: 7 });
  } catch (error) {
    res.status(500).json({ ok: false, error: error.message });
  }
});

app.use((err, _req, res, _next) => {
  if (err?.message === "Not allowed by CORS") return res.status(403).json({ ok: false, error: err.message });
  console.error(err);
  res.status(500).json({ ok: false, error: "Server error" });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Trip Tools API running on ${PORT}`));
