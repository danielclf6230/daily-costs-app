import React, { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  createCost,
  getAvailableMonths,
  getCostsByMonth,
  updateCost,
  deleteCost,
} from "./api";
import { getUser, logout } from "./auth";

function yyyyMmDd(d = new Date()) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export default function DailyCostApp() {
  const nav = useNavigate();
  const user = getUser();
  const [tab, setTab] = useState("today");
  const [editingId, setEditingId] = useState(null);
  const [editValues, setEditValues] = useState({
    type: "",
    price: "",
    note: "",
  });
  const [savingEditId, setSavingEditId] = useState(null);
  const [deletingId, setDeletingId] = useState(null);
  const [deleteModalId, setDeleteModalId] = useState(null);
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [expandedHistoryIds, setExpandedHistoryIds] = useState({});
  const [successModalOpen, setSuccessModalOpen] = useState(false);
  const [successMessage, setSuccessMessage] = useState("");

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
    // months come from server already scoped to the authenticated user via token
    return months.map((m) => {
      const key = `${m.year}-${m.month}`;
      const label = `${m.year}-${String(m.month).padStart(2, "0")}`; // remove count display
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

  async function startEdit(item) {
    setEditingId(item.id);
    setEditValues({
      type: item.type,
      price: String(item.price),
      note: item.note || "",
    });
  }

  async function saveEdit(id) {
    setSavingEditId(id);
    try {
      await updateCost(id, {
        type: editValues.type,
        price: Number(editValues.price),
        note: editValues.note || null,
      });
      // re-fetch current month
      try {
        const [year, month] = selectedKey.split("-").map(Number);
        const rows = await getCostsByMonth(year, month);
        setItems(rows);
      } catch (e) {
        setItems((prev) =>
          prev.map((it) =>
            it.id === id
              ? { ...it, ...editValues, price: Number(editValues.price) }
              : it,
          ),
        );
      }
      setEditingId(null);
      setSuccessMessage("Data updated");
      setSuccessModalOpen(true);
      setTimeout(() => setSuccessModalOpen(false), 2000);
    } catch (e) {
      console.error("update failed", e);
    } finally {
      setSavingEditId(null);
    }
  }

  async function onSave(e) {
    e.preventDefault();

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
      setType("");
      setPrice("");
      setNote("");
      setSuccessMessage("Cost added");
      setSuccessModalOpen(true);
      setTimeout(() => setSuccessModalOpen(false), 2000);
    } catch (e) {
      setSaveMsg(`Save failed: ${String(e?.message || e)}`);
    } finally {
      setSaving(false);
    }
  }
  function confirmDelete(id) {
    setDeleteModalId(id);
    setDeleteModalOpen(true);
  }

  // perform deletion after confirmation
  async function performDelete(id) {
    setDeletingId(id);
    try {
      await deleteCost(id);
      setItems((prev) => prev.filter((it) => it.id !== id));
      if (editingId === id) {
        setEditingId(null);
      }
      setSuccessMessage("Item deleted");
      setSuccessModalOpen(true);
      setTimeout(() => setSuccessModalOpen(false), 2000);
    } catch (e) {
      console.error("delete failed", e);
    } finally {
      setDeletingId(null);
      setDeleteModalOpen(false);
      setDeleteModalId(null);
    }
  }

  function toggleHistoryRow(id) {
    setExpandedHistoryIds((prev) => ({
      ...prev,
      [id]: !prev[id],
    }));
  }

  return (
    <div className="container">
      <div className="page-header">
        <button
          type="button"
          className="logout-button"
          onClick={() => {
            logout();
            nav("/", { replace: true });
          }}
        >
          Logout
        </button>
      </div>

      <div className="title-row">
        <h2>Daily Cost Record</h2>
        <div className="user-avatar-chip" aria-label={`${user?.name || "User"} avatar`}>
          {user?.avatarUrl ? (
            <img
              src={user.avatarUrl}
              alt={`${user?.name || "User"} avatar`}
              className="user-avatar-image"
            />
          ) : (
            <span className="user-avatar-fallback">
              {(user?.name || "U").trim().charAt(0).toUpperCase()}
            </span>
          )}
        </div>
      </div>

      <nav className="tab-nav" aria-label="Cost sections">
        <button
          type="button"
          role="tab"
          aria-selected={tab === "today"}
          className={`tab-link ${tab === "today" ? "active" : ""}`}
          onClick={() => setTab("today")}
        >
          Today
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === "history"}
          className={`tab-link ${tab === "history" ? "active" : ""}`}
          onClick={() => setTab("history")}
        >
          History
        </button>
      </nav>

      {tab === "today" && (
        <form onSubmit={onSave} className="form-grid">
          <label>
            Date
            <input
              type="date"
              className="date-input"
              value={costDate}
              onChange={(e) => setCostDate(e.target.value)}
              lang="en-CA"
              required
            />
          </label>

          <label>
            Type
            <input
              required
              value={type}
              onChange={(e) => setType(e.target.value)}
              placeholder="Food, Transport..."
            />
          </label>

          <label>
            Price
            <input
              required
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
            {saving ? "Adding..." : "Add"}
          </button>

          {saveMsg && <div className="message">{saveMsg}</div>}
        </form>
      )}
      {/* Success modal */}
      {successModalOpen && (
        <div className="modal-overlay">
          <div className="modal success-modal">
            <div
              style={{
                textAlign: "center",
                fontSize: "1.2em",
                color: "#28a745",
              }}
            >
              ✓ {successMessage}
            </div>
          </div>
        </div>
      )}
      {/* Delete confirmation modal */}
      {deleteModalOpen && (
        <div className="modal-overlay">
          <div className="modal">
            <h3>Confirm delete</h3>
            <p>Delete this record? This action cannot be undone.</p>
            <div className="modal-actions">
              <button
                className="modal-cancel-btn"
                onClick={() => {
                  setDeleteModalOpen(false);
                  setDeleteModalId(null);
                }}
                disabled={deletingId !== null}
              >
                Cancel
              </button>
              <button
                className="modal-delete-btn"
                onClick={() => performDelete(deleteModalId)}
                disabled={deletingId !== null}
              >
                {deletingId === deleteModalId ? "Deleting..." : "Delete"}
              </button>
            </div>
          </div>
        </div>
      )}

      {tab === "history" && (
        <div className="history-container">
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
          {historyErr && <div className="error">{historyErr}</div>}

          {!loadingHistory && !historyErr && (
            <div className="history-items-grid">
              {items.length === 0 ? (
                <div>No records.</div>
              ) : (
                (() => {
                  const total = items.reduce(
                    (sum, it) => sum + Number(it.price),
                    0,
                  );
                  return (
                    <div
                      className={`history-list ${editingId ? "show-delete" : ""}`}
                    >
                      <div className="history-header">
                        <div>Date</div>
                        <div>Type</div>
                        <div>Note</div>
                        <div className="price-amount">Price</div>
                        <div>Actions</div>
                        {editingId ? <div>Delete</div> : null}
                      </div>
                      {items.map((it) => {
                        const onlyDate = it.cost_date.split("T")[0];
                        const isEditing = editingId === it.id;
                        const isExpanded = Boolean(expandedHistoryIds[it.id]) || isEditing;
                        return (
                          <div
                            key={it.id}
                            className={`history-row ${isExpanded ? "mobile-expanded" : "mobile-collapsed"}`}
                          >
                            <button
                              type="button"
                              className="mobile-history-summary"
                              onClick={() => toggleHistoryRow(it.id)}
                              aria-expanded={isExpanded}
                            >
                              <span className="mobile-summary-date">{onlyDate}</span>
                              <span className="mobile-summary-type">{it.type}</span>
                              <span className="mobile-summary-price">
                                ${Number(it.price).toFixed(2)}
                              </span>
                              <span className="mobile-summary-arrow" aria-hidden>
                                <svg
                                  width="14"
                                  height="14"
                                  viewBox="0 0 24 24"
                                  fill="none"
                                  stroke="currentColor"
                                  strokeWidth="2"
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                >
                                  <polyline points="6 9 12 15 18 9" />
                                </svg>
                              </span>
                            </button>
                            <div className="history-cell-date">{onlyDate}</div>
                            <div className="history-cell-type">
                              {isEditing ? (
                                <input
                                  value={editValues.type}
                                  onChange={(e) =>
                                    setEditValues((v) => ({
                                      ...v,
                                      type: e.target.value,
                                    }))
                                  }
                                />
                              ) : (
                                it.type
                              )}
                            </div>
                            <div className="history-cell-note">
                              {isEditing ? (
                                <input
                                  value={editValues.note}
                                  onChange={(e) =>
                                    setEditValues((v) => ({
                                      ...v,
                                      note: e.target.value,
                                    }))
                                  }
                                  placeholder="note"
                                />
                              ) : it.note ? (
                                <div className="note-text">{it.note}</div>
                              ) : null}
                            </div>
                            <div className="history-cell-price price-amount">
                              {isEditing ? (
                                <input
                                  value={editValues.price}
                                  onChange={(e) =>
                                    setEditValues((v) => ({
                                      ...v,
                                      price: e.target.value,
                                    }))
                                  }
                                  inputMode="decimal"
                                />
                              ) : (
                                `$${Number(it.price).toFixed(2)}`
                              )}
                            </div>
                            <div className="history-cell-actions actions">
                              <button
                                type="button"
                                className={`edit-btn ${isEditing ? "save" : ""}`}
                                onClick={() =>
                                  isEditing ? saveEdit(it.id) : startEdit(it)
                                }
                                disabled={
                                  savingEditId === it.id || deletingId === it.id
                                }
                                aria-label={isEditing ? "Save" : "Edit"}
                              >
                                {savingEditId === it.id ? (
                                  "Saving..."
                                ) : isEditing ? (
                                  <svg
                                    width="16"
                                    height="16"
                                    viewBox="0 0 24 24"
                                    fill="none"
                                    stroke="currentColor"
                                    strokeWidth="2"
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                    aria-hidden
                                  >
                                    <polyline points="20 6 9 17 4 12" />
                                  </svg>
                                ) : (
                                  <svg
                                    width="16"
                                    height="16"
                                    viewBox="0 0 24 24"
                                    fill="none"
                                    stroke="currentColor"
                                    strokeWidth="2"
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                    aria-hidden
                                  >
                                    <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                                    <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                                  </svg>
                                )}
                              </button>
                            </div>
                            {editingId ? (
                              <div className="history-cell-delete delete-col">
                                {isEditing ? (
                                  <button
                                    type="button"
                                    className="delete-btn"
                                    onClick={() => confirmDelete(it.id)}
                                    disabled={
                                      deletingId === it.id ||
                                      savingEditId === it.id
                                    }
                                    aria-label="Delete"
                                  >
                                    {deletingId === it.id ? (
                                      "..."
                                    ) : (
                                      <svg
                                        width="16"
                                        height="16"
                                        viewBox="0 0 24 24"
                                        fill="none"
                                        stroke="currentColor"
                                        strokeWidth="2"
                                        strokeLinecap="round"
                                        strokeLinejoin="round"
                                        aria-hidden
                                      >
                                        <polyline points="3 6 5 6 21 6" />
                                        <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
                                        <path d="M10 11v6" />
                                        <path d="M14 11v6" />
                                        <path d="M9 6V4a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2" />
                                      </svg>
                                    )}
                                  </button>
                                ) : null}
                              </div>
                            ) : null}
                          </div>
                        );
                      })}
                      <div className="history-footer">
                        <div className="total-row">
                          <div style={{ fontWeight: 700, marginRight: 8 }}>
                            Total
                          </div>
                          <div className="price-amount">
                            ${total.toFixed(2)}
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })()
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
