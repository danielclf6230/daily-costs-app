const base = import.meta.env.VITE_API_BASE_URL || "http://localhost:3000";

function getToken() {
  try { return JSON.parse(localStorage.getItem("user"))?.token ?? null; }
  catch { return null; }
}

async function request(path, { method = "GET", body } = {}) {
  const token = getToken();
  const response = await fetch(`${base}${path}`, {
    method,
    headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const raw = await response.text();
  let data = {};
  try { data = raw ? JSON.parse(raw) : {}; } catch { data = { error: raw }; }
  if (!response.ok) {
    const detail = typeof data.error === "string" ? data.error : JSON.stringify(data.error);
    throw new Error(data.message || detail || `Request failed (${response.status})`);
  }
  return data;
}

export function login(name, password) {
  return request("/api/auth/login", { method: "POST", body: { name, password } });
}

export function register(name, password, inviteCode = "") {
  return request("/api/auth/register", { method: "POST", body: { name, password, inviteCode: inviteCode || undefined } });
}

export function changePassword(currentPassword, newPassword, confirmPassword) {
  return request("/api/auth/password", {
    method: "PATCH",
    body: { currentPassword, newPassword, confirmPassword },
  });
}

export async function loadTrip() {
  const data = await request("/api/trip");
  return { trip: data.trip, canInvite: Boolean(data.canInvite), membershipRole: data.role };
}

export function saveTrip(trip) {
  return request("/api/trip", { method: "PUT", body: trip });
}

export async function loadMembers() {
  const data = await request("/api/trip/members");
  return data.members;
}

export async function createInvite() {
  return request("/api/trip/invites", { method: "POST" });
}

export async function loadAdminUsers() {
  const data = await request("/api/admin/users");
  return data.users;
}

export async function loadAdminOverview() {
  const data = await request("/api/admin/overview");
  return { users: data.users, groups: data.groups };
}

export function createAdminUser(name, password) {
  return request("/api/admin/users", { method: "POST", body: { name, password } });
}

export function resetUserPassword(id, password) {
  return request(`/api/admin/users/${id}/password`, { method: "PATCH", body: { password } });
}

export function moveUserToGroup(id, groupId) {
  return request(`/api/admin/users/${id}/group`, { method: "PATCH", body: { groupId } });
}

export function deleteAdminUser(id) {
  return request(`/api/admin/users/${id}`, { method: "DELETE" });
}
