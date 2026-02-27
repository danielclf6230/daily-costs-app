const base = import.meta.env.VITE_API_BASE_URL;

function getToken() {
  try {
    const raw = localStorage.getItem("user");
    if (!raw) return null;
    const user = JSON.parse(raw);
    return user?.token ?? null;
  } catch {
    return null;
  }
}

async function request(path, { method = "GET", body } = {}) {
  const token = getToken();

  const res = await fetch(`${base}${path}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  const data = await res.json().catch(() => ({}));

  if (!res.ok) {
    throw new Error(data?.message || data?.error || "Request failed");
  }

  return data;
}

export async function login(name, password) {
  // matches Couple App endpoint + payload style
  return request("/api/auth/login", {
    method: "POST",
    body: { name, password },
  });
}

export async function createCost(payload) {
  const data = await request("/api/costs", { method: "POST", body: payload });
  if (!data.ok)
    throw new Error(data?.error ? JSON.stringify(data.error) : "Save failed");
  return data;
}

export async function getAvailableMonths() {
  const data = await request("/api/costs/available-months");
  if (!data.ok) throw new Error(data?.error || "Load months failed");
  return data.months;
}

export async function getCostsByMonth(year, month) {
  const data = await request(`/api/costs?year=${year}&month=${month}`);
  if (!data.ok) throw new Error(data?.error || "Load costs failed");
  return data.items;
}

export async function updateCost(id, payload) {
  const data = await request(`/api/costs/${id}`, {
    method: "PATCH",
    body: payload,
  });
  if (!data.ok) throw new Error(data?.error || "Update failed");
  return data;
}

export async function deleteCost(id) {
  const data = await request(`/api/costs/${id}`, { method: "DELETE" });
  if (!data.ok) throw new Error(data?.error || "Delete failed");
  return data;
}
