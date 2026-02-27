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
].filter(Boolean);

app.use(
  cors({
    origin(origin, cb) {
      if (!origin) return cb(null, true);
      if (allowedOrigins.includes(origin)) return cb(null, true);
      return cb(new Error(`CORS blocked for origin: ${origin}`));
    },
    methods: ["GET", "POST", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
  }),
);

app.options("*", cors());

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
    const [rows] = await pool.query(`
      SELECT
        YEAR(cost_date) AS year,
        MONTH(cost_date) AS month,
        COUNT(*) AS count
      FROM daily_costs
      GROUP BY YEAR(cost_date), MONTH(cost_date)
      ORDER BY year DESC, month DESC
    `);

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

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log("API running on", PORT);
  console.log("JWT_SECRET loaded:", !!process.env.JWT_SECRET);
});
