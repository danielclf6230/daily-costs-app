import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import { z } from "zod";
import { createPoolFromEnv } from "./db.js";

dotenv.config();

const app = express();
app.use(cors({ origin: true })); // you can lock this down later to your frontend domain
app.use(express.json());

const pool = createPoolFromEnv();

app.get("/health", async (req, res) => {
  try {
    const [rows] = await pool.query("SELECT 1 AS ok");
    res.json({ ok: true, db: rows?.[0]?.ok === 1 });
  } catch (e) {
    res.status(500).json({ ok: false, error: String(e?.message || e) });
  }
});

const CreateCostSchema = z.object({
  cost_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), // YYYY-MM-DD
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
    const [result] = await pool.execute(
      "INSERT INTO daily_costs (cost_date, type, price, note) VALUES (?, ?, ?, ?)",
      [cost_date, type, price, note ?? null],
    );
    res.json({ ok: true, id: result.insertId });
  } catch (e) {
    res.status(500).json({ ok: false, error: String(e?.message || e) });
  }
});

// list costs for a given year + month
// GET /api/costs?year=2026&month=2
app.get("/api/costs", async (req, res) => {
  const year = Number(req.query.year);
  const month = Number(req.query.month);

  if (
    !Number.isInteger(year) ||
    !Number.isInteger(month) ||
    month < 1 ||
    month > 12
  ) {
    return res
      .status(400)
      .json({ ok: false, error: "Provide year and month (1-12)." });
  }

  const start = `${year}-${String(month).padStart(2, "0")}-01`;
  // end date = first day of next month
  const nextMonth = month === 12 ? 1 : month + 1;
  const nextYear = month === 12 ? year + 1 : year;
  const end = `${nextYear}-${String(nextMonth).padStart(2, "0")}-01`;

  try {
    const [rows] = await pool.execute(
      `
      SELECT id, cost_date, type, price, note, created_at
      FROM daily_costs
      WHERE cost_date >= ? AND cost_date < ?
      ORDER BY cost_date DESC, id DESC
      `,
      [start, end],
    );
    res.json({ ok: true, items: rows });
  } catch (e) {
    res.status(500).json({ ok: false, error: String(e?.message || e) });
  }
});

// dropdown data for history: available Year-Month list
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
    res.status(500).json({ ok: false, error: String(e?.message || e) });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`API listening on ${PORT}`));
