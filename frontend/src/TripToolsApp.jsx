import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  changePassword,
  createAdminUser,
  createInvite,
  deleteAdminUser,
  loadAdminOverview,
  loadMembers,
  loadTrip,
  moveUserToGroup,
  resetUserPassword,
  saveTrip,
} from "./api";
import { getUser, logout } from "./auth";

const emptyTrip = {
  tripName: "Our Tokyo Adventure",
  startDate: "",
  endDate: "",
  shopping: [],
  days: [],
  travelers: [],
  notes: "",
};

const makeId = () => crypto.randomUUID?.() || `${Date.now()}-${Math.random()}`;
const emptyStop = () => ({
  id: makeId(),
  place: "",
  time: "",
  duration: "",
  note: "",
  checked: false,
});

function dateAt(value) {
  if (!value) return null;
  const [year, month, day] = value.split("-").map(Number);
  return new Date(year, month - 1, day);
}

function localDate(now = new Date()) {
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function prettyDate(value, options = {}) {
  const date = dateAt(value);
  if (!date) return "Set a date";
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    weekday: options.weekday ? "short" : undefined,
    year: options.year ? "numeric" : undefined,
  }).format(date);
}

function datesBetween(start, end) {
  const first = dateAt(start);
  const last = dateAt(end);
  if (!first || !last || last < first) return [];
  const result = [];
  for (
    let cursor = first;
    cursor <= last && result.length < 60;
    cursor = new Date(
      cursor.getFullYear(),
      cursor.getMonth(),
      cursor.getDate() + 1,
    )
  ) {
    result.push(localDate(cursor));
  }
  return result;
}

function countdown(target, now) {
  const diff = target?.getTime() - now.getTime();
  if (!target || diff <= 0) return null;
  const days = Math.floor(diff / 86400000);
  const hours = Math.floor((diff % 86400000) / 3600000);
  const minutes = Math.floor((diff % 3600000) / 60000);
  return { days, hours, minutes };
}

const Icon = ({ name }) => {
  const icons = { shop: "買いもの", plan: "予定", wheel: "くじ", note: "メモ" };
  return (
    <span className="tab-kanji" aria-hidden="true">
      {icons[name]}
    </span>
  );
};

export default function TripToolsApp() {
  const nav = useNavigate();
  const user = getUser();
  const [trip, setTrip] = useState(emptyTrip);
  const [tab, setTab] = useState("schedule");
  const [loaded, setLoaded] = useState(false);
  const [saveState, setSaveState] = useState("Loading…");
  const [now, setNow] = useState(new Date());
  const [shoppingText, setShoppingText] = useState("");
  const [editingShop, setEditingShop] = useState(null);
  const [planning, setPlanning] = useState(false);
  const [newTraveler, setNewTraveler] = useState("");
  const [winner, setWinner] = useState("");
  const [spinning, setSpinning] = useState(false);
  const [rotation, setRotation] = useState(0);
  const [shareOpen, setShareOpen] = useState(false);
  const [members, setMembers] = useState([]);
  const [invite, setInvite] = useState("");
  const [profileOpen, setProfileOpen] = useState(false);
  const [manageOpen, setManageOpen] = useState(false);
  const [canInvite, setCanInvite] = useState(false);
  const firstLoad = useRef(true);

  useEffect(() => {
    loadTrip()
      .then((data) => {
        setTrip(data.trip ? { ...emptyTrip, ...data.trip } : emptyTrip);
        setCanInvite(data.canInvite);
      })
      .catch((error) => setSaveState(`Offline: ${error.message}`))
      .finally(() => {
        setLoaded(true);
        firstLoad.current = false;
      });
  }, []);

  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 30000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    if (!loaded || firstLoad.current) return undefined;
    setSaveState("Saving…");
    const timer = setTimeout(() => {
      saveTrip(trip)
        .then(() => setSaveState("Saved"))
        .catch((error) => setSaveState(`Not saved: ${error.message}`));
    }, 650);
    return () => clearTimeout(timer);
  }, [trip, loaded]);

  const todayLocal = localDate(now);
  const localTimezone =
    Intl.DateTimeFormat().resolvedOptions().timeZone || "Local time";
  useEffect(() => {
    if (!loaded) return;
    const hasOldOpenDay = trip.days.some(
      (day) => day.date < todayLocal && !day.completed,
    );
    if (hasOldOpenDay)
      setTrip((current) => ({
        ...current,
        days: current.days.map((day) =>
          day.date < todayLocal ? { ...day, completed: true } : day,
        ),
      }));
  }, [todayLocal, loaded, trip.days]);

  const tripDates = useMemo(
    () => datesBetween(trip.startDate, trip.endDate),
    [trip.startDate, trip.endDate],
  );
  const activeIndex = trip.days.findIndex((day) => day.date === todayLocal);
  const activeDay = activeIndex >= 0 ? trip.days[activeIndex] : null;
  const tripStarted = trip.startDate && todayLocal >= trip.startDate;
  const tripEnded = trip.endDate && todayLocal > trip.endDate;
  const showActive = activeDay && !activeDay.completed && !planning;
  const beforeTrip = trip.startDate && todayLocal < trip.startDate;
  const nextDay = trip.days.find(
    (day) => day.date > todayLocal && !day.completed,
  );
  const nextCountdown =
    activeDay?.completed && nextDay
      ? countdown(dateAt(nextDay.date), now)
      : null;
  const tripCountdown = beforeTrip
    ? countdown(dateAt(trip.startDate), now)
    : null;

  function updateTripDates(startDate, endDate) {
    const dates = datesBetween(startDate, endDate);
    setTrip((current) => ({
      ...current,
      startDate,
      endDate,
      days: dates.map(
        (date) =>
          current.days.find((day) => day.date === date) || {
            id: makeId(),
            date,
            completed: false,
            items: [emptyStop()],
          },
      ),
    }));
  }

  function updateDay(dayId, callback) {
    setTrip((current) => ({
      ...current,
      days: current.days.map((day) => (day.id === dayId ? callback(day) : day)),
    }));
  }

  function addShopping(event) {
    event.preventDefault();
    if (!shoppingText.trim()) return;
    setTrip((current) => ({
      ...current,
      shopping: [
        ...current.shopping,
        { id: makeId(), text: shoppingText.trim(), checked: false },
      ],
    }));
    setShoppingText("");
  }

  function spinWheel() {
    if (trip.travelers.length < 2 || spinning) return;
    const selected = Math.floor(Math.random() * trip.travelers.length);
    const segment = 360 / trip.travelers.length;
    const desired = (360 - (selected * segment + segment / 2)) % 360;
    const delta = (desired - (rotation % 360) + 360) % 360;
    const target = rotation + 1440 + delta;
    setWinner("");
    setSpinning(true);
    setRotation(target);
    setTimeout(() => {
      setWinner(trip.travelers[selected].name);
      setSpinning(false);
    }, 3800);
  }

  async function openSharing() {
    setShareOpen(true);
    try {
      setMembers(await loadMembers());
    } catch {
      setMembers([]);
    }
  }

  async function makeInvite() {
    try {
      const result = await createInvite();
      setInvite(result.code);
    } catch (error) {
      setInvite(error.message);
    }
  }

  if (!loaded)
    return (
      <div className="app-loading">
        <span>旅</span>
        <p>Preparing your journey…</p>
      </div>
    );

  return (
    <main className="trip-shell">
      <header className="app-header">
        <div className="brand">
          <span className="brand-mark">タビ</span>
          <div>
            <strong>TRIP TOOLS</strong>
            <small>日本の旅 · JAPAN</small>
          </div>
        </div>
        <div className="header-actions">
          <span
            className={`save-state ${saveState !== "Saved" ? "working" : ""}`}
          >
            {saveState}
          </span>
          {canInvite && (
            <button className="share-btn" onClick={openSharing}>
              ＋ Invite
            </button>
          )}
          {user?.role === "admin" && (
            <button
              className="manage-users-btn"
              onClick={() => setManageOpen(true)}
            >
              Manage users
            </button>
          )}
          <button
            className="avatar"
            onClick={() => setProfileOpen(true)}
            title="Account and password"
          >
            {user?.avatarUrl ? (
              <img src={user.avatarUrl} alt="" />
            ) : (
              (user?.name || "T")[0].toUpperCase()
            )}
          </button>
          <button
            className="logout"
            onClick={() => {
              logout();
              nav("/", { replace: true });
            }}
          >
            Log out
          </button>
        </div>
      </header>

      <section className="trip-hero">
        <div className="sun-disc" aria-hidden="true" />
        <div className="hero-copy">
          <label className="eyebrow">
            YOUR NEXT JOURNEY <span>次の旅</span>
          </label>
          <input
            className="trip-name"
            value={trip.tripName}
            onChange={(e) => setTrip({ ...trip, tripName: e.target.value })}
            aria-label="Trip name"
          />
          <div className="date-range">
            <label>
              FROM
              <input
                type="date"
                value={trip.startDate}
                onChange={(e) => updateTripDates(e.target.value, trip.endDate)}
              />
            </label>
            <span className="range-line">→</span>
            <label>
              TO
              <input
                type="date"
                min={trip.startDate}
                value={trip.endDate}
                onChange={(e) =>
                  updateTripDates(trip.startDate, e.target.value)
                }
              />
            </label>
          </div>
        </div>
        <div className="countdown-card">
          {tripCountdown ? (
            <>
              <span className="count-number">{tripCountdown.days}</span>
              <span className="count-label">DAYS TO GO</span>
              <small>
                {tripCountdown.hours}h {tripCountdown.minutes}m ·{" "}
                {localTimezone}
              </small>
            </>
          ) : tripStarted && !tripEnded ? (
            <>
              <span className="count-number">{activeIndex + 1 || "タビ"}</span>
              <span className="count-label">ADVENTURE IN PROGRESS</span>
              <small>
                Today · {prettyDate(todayLocal)} · {localTimezone}
              </small>
            </>
          ) : tripEnded ? (
            <>
              <span className="count-number">✓</span>
              <span className="count-label">WHAT A JOURNEY</span>
              <small>Your memories are saved</small>
            </>
          ) : (
            <>
              <span className="count-number">—</span>
              <span className="count-label">CHOOSE YOUR DATES</span>
              <small>Your countdown starts here</small>
            </>
          )}
        </div>
      </section>

      <nav className="main-tabs">
        {[
          ["shopping", "shop", "Shopping"],
          ["schedule", "plan", "Schedule"],
          ["wheel", "wheel", "Who pays?"],
          ["notes", "note", "Notes"],
        ].map(([id, icon, label]) => (
          <button
            key={id}
            className={tab === id ? "active" : ""}
            onClick={() => setTab(id)}
          >
            <Icon name={icon} />
            <span>{label}</span>
          </button>
        ))}
      </nav>

      <section className="content-panel">
        {tab === "shopping" && (
          <Shopping
            trip={trip}
            setTrip={setTrip}
            text={shoppingText}
            setText={setShoppingText}
            add={addShopping}
            editing={editingShop}
            setEditing={setEditingShop}
          />
        )}
        {tab === "schedule" && (
          <Schedule
            trip={trip}
            dates={tripDates}
            updateDay={updateDay}
            showActive={showActive}
            activeDay={activeDay}
            activeIndex={activeIndex}
            planning={planning}
            setPlanning={setPlanning}
            nextCountdown={nextCountdown}
            ended={tripEnded}
          />
        )}
        {tab === "wheel" && (
          <Wheel
            trip={trip}
            setTrip={setTrip}
            newTraveler={newTraveler}
            setNewTraveler={setNewTraveler}
            winner={winner}
            spinning={spinning}
            rotation={rotation}
            spin={spinWheel}
          />
        )}
        {tab === "notes" && <Notes trip={trip} setTrip={setTrip} />}
      </section>
      <footer>
        <span>旅は道連れ</span> · A journey is better with company
      </footer>
      {shareOpen && (
        <div
          className="winner-modal share-modal"
          onClick={() => setShareOpen(false)}
        >
          <div onClick={(e) => e.stopPropagation()}>
            <button className="modal-close" onClick={() => setShareOpen(false)}>
              ×
            </button>
            <span className="share-symbol">なかま</span>
            <small>TRAVEL TOGETHER · いっしょに旅する</small>
            <h2>Invite a companion</h2>
            <p>
              People who join share this trip’s schedule, lists, wheel, and
              notes.
            </p>
            <div className="member-list">
              {members.map((member) => (
                <div key={member.id}>
                  <i>{member.name[0].toUpperCase()}</i>
                  <span>
                    {member.name}
                    <small>{member.role}</small>
                  </span>
                </div>
              ))}
            </div>
            {invite ? (
              <div className="invite-code">
                <small>INVITATION CODE · EXPIRES IN 7 DAYS</small>
                <strong>{invite}</strong>
                <button onClick={() => navigator.clipboard?.writeText(invite)}>
                  Copy code
                </button>
              </div>
            ) : (
              <button className="spin-button" onClick={makeInvite}>
                Create invitation code
              </button>
            )}
            <p className="privacy-note">
              Only members of this trip can see its contents.
            </p>
          </div>
        </div>
      )}
      {profileOpen && (
        <PasswordModal
          user={user}
          onClose={() => setProfileOpen(false)}
          onLogout={() => {
            logout();
            nav("/", { replace: true });
          }}
        />
      )}
      {manageOpen && user?.role === "admin" && (
        <AdminManager currentUser={user} onClose={() => setManageOpen(false)} />
      )}
    </main>
  );
}

function PasswordModal({ user, onClose, onLogout }) {
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [status, setStatus] = useState({ type: "", text: "" });
  const [saving, setSaving] = useState(false);

  async function submit(event) {
    event.preventDefault();
    setStatus({ type: "", text: "" });
    if (newPassword !== confirmPassword) {
      setStatus({ type: "error", text: "The new passwords do not match." });
      return;
    }
    setSaving(true);
    try {
      await changePassword(currentPassword, newPassword, confirmPassword);
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      setStatus({ type: "success", text: "Password updated successfully." });
    } catch (error) {
      setStatus({
        type: "error",
        text: error.message || "Could not update your password.",
      });
    } finally {
      setSaving(false);
    }
  }

  return (
    <div
      className="account-overlay"
      role="presentation"
      onMouseDown={(event) => event.target === event.currentTarget && onClose()}
    >
      <section
        className="account-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="account-title"
      >
        <header>
          <div className="account-person">
            <div className="account-avatar">
              {user?.avatarUrl ? (
                <img src={user.avatarUrl} alt="" />
              ) : (
                (user?.name || "T")[0].toUpperCase()
              )}
            </div>
            <div>
              <small>TRAVELER ACCOUNT · アカウント</small>
              <strong>{user?.name}</strong>
            </div>
          </div>
          <button
            className="account-close"
            onClick={onClose}
            aria-label="Close account window"
          >
            ×
          </button>
        </header>
        <div className="account-body">
          <span className="profile-eyebrow">SECURITY · セキュリティ</span>
          <h2 id="account-title">Change your password</h2>
          <p>Enter your current password before choosing a new one.</p>
          <form className="password-form" onSubmit={submit}>
            <label>
              CURRENT PASSWORD
              <input
                type="password"
                autoComplete="current-password"
                value={currentPassword}
                onChange={(event) => setCurrentPassword(event.target.value)}
                required
              />
            </label>
            <div className="password-pair">
              <label>
                NEW PASSWORD
                <input
                  type="password"
                  autoComplete="new-password"
                  value={newPassword}
                  onChange={(event) => setNewPassword(event.target.value)}
                  required
                />
              </label>
              <label>
                CONFIRM NEW PASSWORD
                <input
                  type="password"
                  autoComplete="new-password"
                  value={confirmPassword}
                  onChange={(event) => setConfirmPassword(event.target.value)}
                  required
                />
              </label>
            </div>
            <small className="password-rule">
              Use 10+ characters with uppercase, lowercase, and a number.
            </small>
            {status.text && (
              <div className={`profile-alert ${status.type}`}>
                {status.type === "success" ? "✓ " : ""}
                {status.text}
              </div>
            )}
            <button className="password-submit" disabled={saving}>
              {saving ? "Updating…" : "Update password"}
            </button>
          </form>
        </div>
        <footer className="account-footer">
          <button className="back-to-trip" onClick={onClose}>
            ← Back to trip
          </button>
          <button className="modal-logout" onClick={onLogout}>
            Log out <span>↗</span>
          </button>
        </footer>
      </section>
    </div>
  );
}

function SectionTitle({ eyebrow, title, text, action }) {
  return (
    <div className="section-heading">
      <div>
        <span>{eyebrow}</span>
        <h2>{title}</h2>
        <p>{text}</p>
      </div>
      {action}
    </div>
  );
}

function Shopping({ trip, setTrip, text, setText, add, editing, setEditing }) {
  const packed = trip.shopping.filter((item) => item.checked).length;
  const update = (id, values) =>
    setTrip((current) => ({
      ...current,
      shopping: current.shopping.map((item) =>
        item.id === id ? { ...item, ...values } : item,
      ),
    }));
  const remove = (id) =>
    setTrip((current) => ({
      ...current,
      shopping: current.shopping.filter((item) => item.id !== id),
    }));
  return (
    <>
      <SectionTitle
        eyebrow="PACK WITH PURPOSE · 買い物"
        title="Shopping list"
        text="Everything you need, nothing you’ll forget."
      />
      <div className="progress-row">
        <div>
          <strong>{packed}</strong> of {trip.shopping.length} packed
        </div>
        <div className="progress">
          <i
            style={{
              width: `${trip.shopping.length ? (packed / trip.shopping.length) * 100 : 0}%`,
            }}
          />
        </div>
      </div>
      <form className="shopping-composer" onSubmit={add}>
        <div className="composer-seal">
          <span>買いもの</span>
          <small>SHOPPING</small>
        </div>
        <label>
          <small>買いものを追加 · ADD AN ITEM</small>
          <input
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="What do you need for Japan?"
          />
        </label>
        <button>
          <span>追加する</span>
          <small>ADD TO LIST</small>
        </button>
      </form>
      <div className="clean-list">
        {trip.shopping.length ? (
          trip.shopping.map((item) => (
            <div
              className={`shopping-row ${item.checked ? "done" : ""}`}
              key={item.id}
            >
              <label className="round-check">
                <input
                  type="checkbox"
                  checked={item.checked}
                  onChange={(e) =>
                    update(item.id, { checked: e.target.checked })
                  }
                />
                <span>✓</span>
              </label>
              {editing === item.id ? (
                <input
                  className="inline-edit"
                  autoFocus
                  value={item.text}
                  onChange={(e) => update(item.id, { text: e.target.value })}
                  onBlur={() => setEditing(null)}
                  onKeyDown={(e) => e.key === "Enter" && setEditing(null)}
                />
              ) : (
                <button
                  className="item-text"
                  onClick={() => setEditing(item.id)}
                >
                  {item.text}
                </button>
              )}
              <button
                className="icon-btn"
                onClick={() => setEditing(item.id)}
                aria-label="Edit"
              >
                ✎
              </button>
              <button
                className="icon-btn danger"
                onClick={() => remove(item.id)}
                aria-label="Delete"
              >
                ×
              </button>
            </div>
          ))
        ) : (
          <Empty text="Your packing list is waiting." />
        )}
      </div>
    </>
  );
}

function Schedule({
  trip,
  dates,
  updateDay,
  showActive,
  activeDay,
  activeIndex,
  planning,
  setPlanning,
  nextCountdown,
  ended,
}) {
  const allStops = trip.days.flatMap((day) => day.items);
  const visited = allStops.filter((item) => item.checked).length;
  if (!dates.length)
    return (
      <>
        <SectionTitle
          eyebrow="BUILD YOUR DAYS · 旅程"
          title="Schedule"
          text="Set the trip dates above and each day will appear here."
        />
        <Empty text="Choose a start and end date to begin planning." />
      </>
    );
  if (showActive)
    return (
      <ActiveDay
        day={activeDay}
        index={activeIndex}
        updateDay={updateDay}
        onPlan={() => setPlanning(true)}
      />
    );
  if (nextCountdown && !planning)
    return (
      <>
        <SectionTitle
          eyebrow="DAY COMPLETE · お疲れ様"
          title="Beautiful work today"
          text={`${activeDay.items.filter((i) => i.checked).length} visited · ${activeDay.items.filter((i) => !i.checked).length} missed`}
          action={
            <button className="outline-btn" onClick={() => setPlanning(true)}>
              View full plan
            </button>
          }
        />
        <div className="next-count">
          <span>Next adventure in</span>
          <strong>
            {nextCountdown.hours}h {nextCountdown.minutes}m
          </strong>
          <small>
            {prettyDate(trip.days.find((d) => d.date > activeDay.date)?.date, {
              weekday: true,
            })}
          </small>
        </div>
        <Missed
          day={activeDay}
          updateDay={updateDay}
          setPlanning={setPlanning}
        />
      </>
    );
  return (
    <>
      <SectionTitle
        eyebrow={ended ? "JOURNEY COMPLETE · 思い出" : "BUILD YOUR DAYS · 旅程"}
        title={
          ended ? "Your trip at a glance" : `${dates.length}-day itinerary`
        }
        text={
          ended
            ? `${visited} of ${allStops.length} places visited.`
            : "Shape each day, then let Trip Tools guide you in Japan."
        }
        action={
          planning ? (
            <button className="primary-btn" onClick={() => setPlanning(false)}>
              Done editing ✓
            </button>
          ) : null
        }
      />
      <div className="day-stack">
        {trip.days.map((day, index) => (
          <DayEditor
            key={day.id}
            day={day}
            index={index}
            updateDay={updateDay}
          />
        ))}
      </div>
    </>
  );
}

function DayEditor({ day, index, updateDay }) {
  const addStop = () =>
    updateDay(day.id, (value) => ({
      ...value,
      items: [...value.items, emptyStop()],
    }));
  const updateStop = (id, values) =>
    updateDay(day.id, (value) => ({
      ...value,
      items: value.items.map((item) =>
        item.id === id ? { ...item, ...values } : item,
      ),
    }));
  const removeStop = (id) =>
    updateDay(day.id, (value) => ({
      ...value,
      items: value.items.filter((item) => item.id !== id),
    }));
  return (
    <article className="day-card">
      <div className="day-head">
        <div className="day-badge">
          DAY <strong>{index + 1}</strong>
        </div>
        <div>
          <h3>{prettyDate(day.date, { weekday: true })}</h3>
          <span>
            {day.items.length} {day.items.length === 1 ? "place" : "places"}
          </span>
        </div>
        {day.completed && <b className="complete-pill">COMPLETED</b>}
      </div>
      <div className="stop-editor-list">
        {day.items.map((item, itemIndex) => (
          <div className="stop-editor" key={item.id}>
            <span className="stop-number">
              {String(itemIndex + 1).padStart(2, "0")}
            </span>
            <label>
              PLACE
              <input
                value={item.place}
                onChange={(e) => updateStop(item.id, { place: e.target.value })}
                placeholder="Senso-ji Temple"
              />
            </label>
            <label>
              TIME
              <input
                type="time"
                value={item.time}
                onChange={(e) => updateStop(item.id, { time: e.target.value })}
              />
            </label>
            <label>
              DURATION
              <input
                value={item.duration}
                onChange={(e) =>
                  updateStop(item.id, { duration: e.target.value })
                }
                placeholder="1 hr"
              />
            </label>
            <label className="note-field">
              NOTE
              <input
                value={item.note}
                onChange={(e) => updateStop(item.id, { note: e.target.value })}
                placeholder="Optional details"
              />
            </label>
            <button
              className="remove-stop"
              onClick={() => removeStop(item.id)}
              aria-label="Remove stop"
            >
              ×
            </button>
          </div>
        ))}
      </div>
      <button className="add-stop" onClick={addStop}>
        ＋ Add another place
      </button>
    </article>
  );
}

function ActiveDay({ day, index, updateDay, onPlan }) {
  const done = day.items.filter((item) => item.checked).length;
  const toggle = (id, checked) =>
    updateDay(day.id, (value) => ({
      ...value,
      items: value.items.map((item) =>
        item.id === id ? { ...item, checked } : item,
      ),
    }));
  return (
    <>
      <SectionTitle
        eyebrow="TODAY IN JAPAN · 今日"
        title={`Day ${index + 1} · ${prettyDate(day.date, { weekday: true })}`}
        text={`${done} of ${day.items.length} locations visited. Check them off as you go.`}
        action={
          <button className="outline-btn" onClick={onPlan}>
            Full itinerary
          </button>
        }
      />
      <div className="active-progress">
        <i
          style={{
            width: `${day.items.length ? (done / day.items.length) * 100 : 0}%`,
          }}
        />
      </div>
      <div className="timeline">
        {day.items.map((item, i) => (
          <label
            className={`timeline-stop ${item.checked ? "done" : ""}`}
            key={item.id}
          >
            <input
              type="checkbox"
              checked={item.checked}
              onChange={(e) => toggle(item.id, e.target.checked)}
            />
            <span className="timeline-mark">{item.checked ? "✓" : i + 1}</span>
            <time>{item.time || "Any time"}</time>
            <div>
              <strong>{item.place || "Untitled place"}</strong>
              <small>
                {[item.duration, item.note].filter(Boolean).join(" · ") ||
                  "No details added"}
              </small>
            </div>
          </label>
        ))}
      </div>
      <button
        className="complete-day"
        onClick={() =>
          updateDay(day.id, (value) => ({ ...value, completed: true }))
        }
      >
        Complete Day {index + 1} <span>→</span>
      </button>
    </>
  );
}

function Missed({ day, updateDay, setPlanning }) {
  const missed = day.items.filter((item) => !item.checked);
  if (!missed.length) return null;
  return (
    <div className="missed">
      <h3>Places to reschedule</h3>
      {missed.map((item) => (
        <div key={item.id}>
          <span>{item.place || "Untitled place"}</span>
          <button
            onClick={() => {
              updateDay(day.id, (value) => ({ ...value, completed: false }));
              setPlanning(true);
            }}
          >
            Reschedule
          </button>
        </div>
      ))}
    </div>
  );
}

function Wheel({
  trip,
  setTrip,
  newTraveler,
  setNewTraveler,
  winner,
  spinning,
  rotation,
  spin,
}) {
  const colors = [
    "#e54b36",
    "#f6bd42",
    "#174c5b",
    "#df7b8b",
    "#5d7545",
    "#de8e42",
  ];
  const gradient = trip.travelers.length
    ? `conic-gradient(${trip.travelers.map((_, i) => `${colors[i % colors.length]} ${(i * 100) / trip.travelers.length}% ${((i + 1) * 100) / trip.travelers.length}%`).join(",")})`
    : "conic-gradient(#eee 0 100%)";
  const add = (e) => {
    e.preventDefault();
    if (!newTraveler.trim()) return;
    setTrip((current) => ({
      ...current,
      travelers: [
        ...current.travelers,
        { id: makeId(), name: newTraveler.trim() },
      ],
    }));
    setNewTraveler("");
  };
  return (
    <>
      <SectionTitle
        eyebrow="LEAVE IT TO LUCK · 運試し"
        title="Who’s paying?"
        text="Add everyone, spin the wheel, and let fate choose the generous one."
      />
      <div className="wheel-layout">
        <div className="wheel-wrap">
          <span className="pointer">▼</span>
          <div
            className="wheel"
            style={{
              background: gradient,
              transform: `rotate(${rotation}deg)`,
            }}
          >
            <div className="wheel-center">運</div>
          </div>
        </div>
        <div className="player-panel">
          <h3>
            Travel party <span>{trip.travelers.length}</span>
          </h3>
          <form className="person-add" onSubmit={add}>
            <input
              value={newTraveler}
              onChange={(e) => setNewTraveler(e.target.value)}
              placeholder="Traveler name"
            />
            <button>＋</button>
          </form>
          <div className="people">
            {trip.travelers.map((person, i) => (
              <div key={person.id}>
                <i style={{ background: colors[i % colors.length] }} />
                {person.name}
                <button
                  onClick={() =>
                    setTrip((current) => ({
                      ...current,
                      travelers: current.travelers.filter(
                        (p) => p.id !== person.id,
                      ),
                    }))
                  }
                >
                  ×
                </button>
              </div>
            ))}
          </div>
          <button
            className="spin-button"
            disabled={trip.travelers.length < 2 || spinning}
            onClick={spin}
          >
            {spinning ? "SPINNING…" : "SPIN THE WHEEL"}
          </button>
          <small className="wheel-hint">
            Add at least two travelers to spin
          </small>
        </div>
      </div>
      {winner && (
        <div className="winner-modal">
          <div>
            <span>🎉</span>
            <small>CONGRATULATIONS!</small>
            <h2>{winner}</h2>
            <p>It’s your lucky day — you’re paying!</p>
            <button onClick={() => location.reload()}>Done</button>
          </div>
        </div>
      )}
    </>
  );
}

function Notes({ trip, setTrip }) {
  return (
    <>
      <SectionTitle
        eyebrow="KEEP THE DETAILS · 旅の記録"
        title="Trip notes"
        text="Addresses, phrases, booking numbers, and every thought in between."
      />
      <div className="note-paper">
        <div className="paper-title">
          MEMOS <span>覚え書き</span>
        </div>
        <textarea
          value={trip.notes}
          onChange={(e) => setTrip({ ...trip, notes: e.target.value })}
          placeholder={
            "Start writing…\n\nHotel address, reservation numbers, useful Japanese phrases, or anything else for the trip."
          }
        />
        <div className="note-meta">
          <span>{trip.notes.length.toLocaleString()} characters</span>
          <span>Autosaved</span>
        </div>
      </div>
    </>
  );
}

function AdminManager({ currentUser, onClose }) {
  const [overview, setOverview] = useState({ users: [], groups: [] });
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [resets, setResets] = useState({});
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState("");
  const [draggingUserId, setDraggingUserId] = useState(null);
  const [dragTarget, setDragTarget] = useState(null);
  const refresh = () =>
    loadAdminOverview()
      .then(setOverview)
      .catch((error) => setMessage(error.message));
  useEffect(() => {
    refresh();
  }, []);

  async function create(event) {
    event.preventDefault();
    setMessage("");
    setBusy("create");
    try {
      await createAdminUser(name, password);
      setName("");
      setPassword("");
      setMessage("User created as the owner of a new private group.");
      await refresh();
    } catch (error) {
      setMessage(error.message);
    } finally {
      setBusy("");
    }
  }

  async function reset(account) {
    setMessage("");
    setBusy(`reset-${account.id}`);
    try {
      await resetUserPassword(account.id, resets[account.id] || "");
      setResets((current) => ({ ...current, [account.id]: "" }));
      setMessage(`${account.name}'s password was updated.`);
    } catch (error) {
      setMessage(error.message);
    } finally {
      setBusy("");
    }
  }

  async function move(account, value, askForConfirmation = true) {
    const groupId = value === "new" ? null : Number(value);
    const target = groupId
      ? overview.groups.find((group) => group.id === groupId)?.name
      : "a new private group";
    if (
      askForConfirmation &&
      !window.confirm(
        `Move ${account.name} to ${target}? Their visible trip data will change immediately.`,
      )
    )
      return;
    setBusy(`move-${account.id}`);
    setMessage("");
    try {
      await moveUserToGroup(account.id, groupId);
      setMessage(`${account.name}'s group was updated.`);
      await refresh();
    } catch (error) {
      setMessage(error.message);
    } finally {
      setBusy("");
    }
  }

  function startDrag(event, userId) {
    setDraggingUserId(userId);
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/plain", String(userId));
  }

  async function dropIntoGroup(event, groupId) {
    event.preventDefault();
    const userId = Number(event.dataTransfer.getData("text/plain") || draggingUserId);
    const account = overview.users.find((user) => user.id === userId);
    setDraggingUserId(null);
    setDragTarget(null);
    if (!account || (groupId && account.trip_id === groupId)) return;
    await move(account, groupId === null ? "new" : String(groupId), false);
  }

  async function remove(account) {
    if (
      !window.confirm(
        `Delete ${account.name}? This removes their Trip Tools login and cannot be undone.`,
      )
    )
      return;
    setBusy(`delete-${account.id}`);
    setMessage("");
    try {
      await deleteAdminUser(account.id);
      setMessage(`${account.name} was deleted.`);
      await refresh();
    } catch (error) {
      setMessage(error.message);
    } finally {
      setBusy("");
    }
  }

  return (
    <div
      className="manager-overlay"
      onMouseDown={(event) => event.target === event.currentTarget && onClose()}
    >
      <section
        className="manager-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="manager-title"
      >
        <header>
          <div>
            <small>ADMINISTRATION · ユーザー管理</small>
            <h2 id="manager-title">Manage users & groups</h2>
            <p>Each group has completely separate trip data.</p>
          </div>
          <button onClick={onClose} aria-label="Close user manager">
            ×
          </button>
        </header>
        <div className="manager-content">
          <form className="manager-create" onSubmit={create}>
            <div>
              <span>CREATE A GROUP OWNER</span>
              <strong>New traveler</strong>
            </div>
            <label>
              USERNAME
              <input
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder="Traveler name"
                required
              />
            </label>
            <label>
              TEMPORARY PASSWORD
              <input
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                placeholder="10+ characters"
                required
              />
            </label>
            <button disabled={busy === "create"}>
              {busy === "create" ? "Creating…" : "Create user + group"}
            </button>
          </form>
          {message && <div className="manager-message">{message}</div>}
          <section className="group-overview">
            <div className="manager-section-title">
              <span>PRIVATE GROUPS</span>
              <strong>{overview.groups.length}</strong>
            </div>
            <p className="drag-help">
              Drag a traveler into another group. Changes save immediately.
            </p>
            <div className={`group-board ${draggingUserId ? "is-dragging" : ""}`}>
              {overview.groups.map((group) => (
                <div
                  className={`group-dropzone ${dragTarget === group.id ? "drag-over" : ""}`}
                  key={group.id}
                  onDragOver={(event) => {
                    event.preventDefault();
                    event.dataTransfer.dropEffect = "move";
                    setDragTarget(group.id);
                  }}
                  onDrop={(event) => dropIntoGroup(event, group.id)}
                >
                  <div className="dropzone-heading">
                    <div><b>{group.name}</b><small>PRIVATE TRIP GROUP</small></div>
                    <span>{group.members.length}</span>
                  </div>
                  <div className="member-drag-list">
                    {group.members.map((member) => (
                      <button
                        type="button"
                        draggable
                        className={`member-drag-chip ${draggingUserId === member.id ? "dragging" : ""}`}
                        key={member.id}
                        onDragStart={(event) => startDrag(event, member.id)}
                        onDragEnd={() => { setDraggingUserId(null); setDragTarget(null); }}
                        title="Drag to another group"
                      >
                        <i>⠿</i><span>{member.name}</span>{member.role === "owner" && <b>OWNER</b>}
                      </button>
                    ))}
                    {!group.members.length && <span className="empty-dropzone">Drop a traveler here</span>}
                  </div>
                </div>
              ))}
              <div
                className={`group-dropzone new-group-dropzone ${dragTarget === "new" ? "drag-over" : ""}`}
                onDragOver={(event) => { event.preventDefault(); event.dataTransfer.dropEffect = "move"; setDragTarget("new"); }}
                onDrop={(event) => dropIntoGroup(event, null)}
              >
                <strong>＋</strong><b>New private group</b><small>Drop a traveler here to make them the owner</small>
              </div>
            </div>
          </section>
          <section className="managed-users">
            <div className="manager-section-title">
              <span>ALL USERS</span>
              <strong>{overview.users.length}</strong>
            </div>
            {overview.users.map((account) => (
              <article className="managed-user" key={account.id}>
                <div className="managed-identity">
                  <i>{account.name[0].toUpperCase()}</i>
                  <div>
                    <b>{account.name}</b>
                    <small>
                      {account.role === "admin"
                        ? "Administrator"
                        : account.membership_role === "owner"
                          ? "Group owner · can invite"
                          : "Invited member · cannot invite"}
                    </small>
                  </div>
                </div>
                <label className="group-select">
                  GROUP
                  <select
                    value={account.trip_id || ""}
                    disabled={busy === `move-${account.id}`}
                    onChange={(event) => move(account, event.target.value)}
                  >
                    {overview.groups.map((group) => (
                      <option key={group.id} value={group.id}>
                        {group.name}
                      </option>
                    ))}
                    <option value="new">＋ Create new private group</option>
                  </select>
                </label>
                <div className="managed-actions">
                  <div className="reset-box">
                    <input
                      type="password"
                      value={resets[account.id] || ""}
                      onChange={(event) =>
                        setResets((current) => ({
                          ...current,
                          [account.id]: event.target.value,
                        }))
                      }
                      placeholder="New strong password"
                    />
                    <button
                      disabled={busy === `reset-${account.id}`}
                      onClick={() => reset(account)}
                    >
                      Reset
                    </button>
                  </div>
                  {account.id !== currentUser.id && (
                    <button
                      className="delete-user"
                      disabled={busy === `delete-${account.id}`}
                      onClick={() => remove(account)}
                    >
                      Delete user
                    </button>
                  )}
                  {account.id === currentUser.id && (
                    <span className="delete-placeholder" aria-hidden="true" />
                  )}
                </div>
              </article>
            ))}
          </section>
          <p className="manager-footnote">
            ★ Group owners can create invitation codes. Invited members cannot
            invite others.
          </p>
        </div>
      </section>
    </div>
  );
}

function Empty({ text }) {
  return (
    <div className="empty-state">
      <span>ふじ</span>
      <p>{text}</p>
    </div>
  );
}
