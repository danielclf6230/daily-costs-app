import React, { useEffect, useMemo, useState } from "react";
import { createCost, getAvailableMonths, getCostsByMonth } from "./api";

function yyyyMmDd(d = new Date()) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export default function DailyCostApp() {
  const [tab, setTab] = useState("today");

  // Today
  const [costDate, setCostDate] = useState(yyyyMmDd());
  const [type, setType] = useState("");
  const [price, setPrice] = useState("");
  const [note, setNote] = useState("");
  const [saveMsg, setSaveMsg] = useState("");
  const [saving, setSaving] = useState(false);

  // History
  const [months, setMonths] = useState([]);
  const [selectedKey, setSelectedKey] = useState("");
  const [items, setItems] = useState([]);
  const [historyErr, setHistoryErr] = useState("");
  const [loadingHistory, setLoadingHistory] = useState(false);

  const monthOptions = useMemo(() => {
    return months.map((m) => {
      const key = `${m.year}-${m.month}`;
      const label = `${m.year}-${String(m.month).padStart(2, "0")} (${m.count})`;
      return { key, label, year: m.year, month: m.month };
    });
  }, [months]);

  useEffect(() => {
    if (tab !== "history") return;

    (async () => {
      try {
        setHistoryErr("");
        const list = await getAvailableMonths();
        setMonths(list);
        if (list.length > 0) {
          const firstKey = `${list[0].year}-${list[0].month}`;
          setSelectedKey((prev) => prev || firstKey);
        }
      } catch (e) {
        setHistoryErr(String(e?.message || e));
      }
    })();
  }, [tab]);

  useEffect(() => {
    if (tab !== "history" || !selectedKey) return;

    const [year, month] = selectedKey.split("-").map(Number);

    (async () => {
      setLoadingHistory(true);
      try {
        setHistoryErr("");
        const rows = await getCostsByMonth(year, month);
        setItems(rows);
      } catch (e) {
        setHistoryErr(String(e?.message || e));
      } finally {
        setLoadingHistory(false);
      }
    })();
  }, [tab, selectedKey]);

  async function onSave(e) {
    e.preventDefault();
    setSaveMsg("");

    const p = Number(price);
    if (!type.trim()) return setSaveMsg("Type is required.");
    if (!Number.isFinite(p)) return setSaveMsg("Price must be a number.");

    setSaving(true);
    try {
      await createCost({
        cost_date: costDate,
        type: type.trim(),
        price: p,
        note: note.trim() ? note.trim() : null,
      });
      setSaveMsg("Saved ✔️");
      setType("");
      setPrice("");
      setNote("");
    } catch (e) {
      setSaveMsg(`Save failed: ${String(e?.message || e)}`);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div style={{ maxWidth: 720, margin: "0 auto", padding: 16 }}>
      <h2>Daily Cost Record</h2>

      <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
        <button onClick={() => setTab("today")} disabled={tab === "today"}>
          Today
        </button>
        <button onClick={() => setTab("history")} disabled={tab === "history"}>
          History
        </button>
      </div>

      {tab === "today" && (
        <form onSubmit={onSave} style={{ display: "grid", gap: 12 }}>
          <label>
            Date
            <input
              type="date"
              value={costDate}
              onChange={(e) => setCostDate(e.target.value)}
            />
          </label>

          <label>
            Type
            <input
              value={type}
              onChange={(e) => setType(e.target.value)}
              placeholder="Food, Transport..."
            />
          </label>

          <label>
            Price
            <input
              value={price}
              onChange={(e) => setPrice(e.target.value)}
              inputMode="decimal"
              placeholder="12.50"
            />
          </label>

          <label>
            Note (optional)
            <input
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Optional note"
            />
          </label>

          <button type="submit" disabled={saving}>
            {saving ? "Saving..." : "Save"}
          </button>

          {saveMsg && <div>{saveMsg}</div>}
        </form>
      )}

      {tab === "history" && (
        <div style={{ display: "grid", gap: 12 }}>
          <label>
            Month
            <select
              value={selectedKey}
              onChange={(e) => setSelectedKey(e.target.value)}
            >
              {monthOptions.map((o) => (
                <option key={o.key} value={o.key}>
                  {o.label}
                </option>
              ))}
            </select>
          </label>

          {loadingHistory && <div>Loading...</div>}
          {historyErr && <div style={{ color: "crimson" }}>{historyErr}</div>}

          {!loadingHistory && !historyErr && (
            <div style={{ display: "grid", gap: 8 }}>
              {items.length === 0 ? (
                <div>No records.</div>
              ) : (
                items.map((it) => (
                  <div
                    key={it.id}
                    style={{
                      padding: 12,
                      border: "1px solid #ddd",
                      borderRadius: 8,
                      display: "flex",
                      justifyContent: "space-between",
                      gap: 12,
                    }}
                  >
                    <div>
                      <div>
                        <b>{it.cost_date}</b> — {it.type}
                      </div>
                      {it.note ? (
                        <div style={{ opacity: 0.8 }}>{it.note}</div>
                      ) : null}
                    </div>
                    <div style={{ fontWeight: 700 }}>
                      ${Number(it.price).toFixed(2)}
                    </div>
                  </div>
                ))
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
