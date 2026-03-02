import dotenv from "dotenv";
dotenv.config();

import express from "express";
import cors from "cors";
import { z } from "zod";
import { makePool } from "./db.js";
import { loginHandler, requireAuth } from "./auth.js";

const app = express();
app.use(express.json());

const allowedOrigins = [
  process.env.FRONTEND_ORIGIN,
  "http://localhost:5173",
  "https://daily-costs-6u5rawl-danielcf6230s-projects.vercel.app",
  "https://daily-costs-app.vercel.app",
].filter(Boolean);

const corsOptions = {
  origin: function (origin, callback) {
    if (!origin) return callback(null, true);

    if (allowedOrigins.includes(origin)) {
      return callback(null, true);
    }

    console.log("Blocked by CORS:", origin);
    return callback(new Error("Not allowed by CORS"));
  },
  credentials: true,
};

app.use(cors(corsOptions));
app.options("*", cors(corsOptions));

app.use((err, req, res, next) => {
  if (err?.message === "Not allowed by CORS") {
    return res.status(403).json({ ok: false, error: err.message });
  }

  return next(err);
});

const pool = makePool();

app.get("/health", async (req, res) => {
  try {
    const [rows] = await pool.query("SELECT 1 AS ok");
    res.json({ ok: true, db: rows?.[0]?.ok === 1 });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

/* ================= LOGIN ================= */

app.post("/api/auth/login", (req, res) => loginHandler(req, res, pool));

/* ============ PROTECT COST ROUTES ============ */

app.use("/api/costs", requireAuth);

/* ================= COST ROUTES ================= */

const CreateCostSchema = z.object({
  cost_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  type: z.string().min(1).max(50),
  price: z.number().nonnegative(),
  note: z.string().max(255).optional().nullable(),
});

app.post("/api/costs", async (req, res) => {
  const parsed = CreateCostSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ ok: false, error: parsed.error.flatten() });
  }

  const { cost_date, type, price, note } = parsed.data;

  try {
    const userId = req.user.id; // 🔥 THIS IS THE FIX

    const [result] = await pool.execute(
      `INSERT INTO daily_costs 
        (user_id, cost_date, type, price, note) 
       VALUES (?, ?, ?, ?, ?)`,
      [userId, cost_date, type, price, note ?? null],
    );

    res.json({ ok: true, id: result.insertId });
  } catch (e) {
    console.error(e);
    res.status(500).json({ ok: false, error: e.message });
  }
});

app.get("/api/costs/available-months", async (req, res) => {
  try {
    const [rows] = await pool.query(
      `
      SELECT
        YEAR(cost_date) AS year,
        MONTH(cost_date) AS month,
        COUNT(*) AS count
      FROM daily_costs
      WHERE user_id = ?
      GROUP BY YEAR(cost_date), MONTH(cost_date)
      ORDER BY year DESC, month DESC
    `,
      [req.user.id],
    );

    res.json({ ok: true, months: rows });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

app.get("/api/costs", async (req, res) => {
  const year = Number(req.query.year);
  const month = Number(req.query.month);

  if (!year || !month) {
    return res.status(400).json({ ok: false, error: "Provide year & month" });
  }

  const start = `${year}-${String(month).padStart(2, "0")}-01`;
  const nextMonth = month === 12 ? 1 : month + 1;
  const nextYear = month === 12 ? year + 1 : year;
  const end = `${nextYear}-${String(nextMonth).padStart(2, "0")}-01`;

  try {
    const userId = req.user.id;

    const [rows] = await pool.execute(
      `
      SELECT id, cost_date, type, price, note, created_at
      FROM daily_costs
      WHERE user_id = ?
        AND cost_date >= ?
        AND cost_date < ?
      ORDER BY cost_date DESC
      `,
      [userId, start, end],
    );

    res.json({ ok: true, items: rows });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

// update a single cost (only allowed on own records)
app.patch("/api/costs/:id", async (req, res) => {
  const id = Number(req.params.id);
  const updateSchema = z.object({
    type: z.string().min(1).max(50).optional(),
    price: z.number().nonnegative().optional(),
    note: z.string().max(255).optional().nullable(),
  });
  const parsed = updateSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ ok: false, error: parsed.error.flatten() });
  }

  const { type, price, note } = parsed.data;
  try {
    const userId = req.user.id;
    // build dynamic SET clause
    const fields = [];
    const params = [];
    if (type !== undefined) {
      fields.push("type = ?");
      params.push(type);
    }
    if (price !== undefined) {
      fields.push("price = ?");
      params.push(price);
    }
    if (note !== undefined) {
      fields.push("note = ?");
      params.push(note);
    }
    if (fields.length === 0) {
      return res.json({ ok: true });
    }

    params.push(userId, id);
    const sql = `UPDATE daily_costs SET ${fields.join(", ")} WHERE user_id = ? AND id = ?`;
    const [result] = await pool.execute(sql, params);
    res.json({ ok: true, affected: result.affectedRows });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

// delete cost
app.delete("/api/costs/:id", async (req, res) => {
  const id = Number(req.params.id);
  try {
    const userId = req.user.id;
    const [result] = await pool.execute(
      `DELETE FROM daily_costs WHERE user_id = ? AND id = ?`,
      [userId, id],
    );
    res.json({ ok: true, deleted: result.affectedRows });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log("API running on", PORT);
  console.log("JWT_SECRET loaded:", !!process.env.JWT_SECRET);
});
