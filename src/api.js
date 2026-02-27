const base = import.meta.env.VITE_API_BASE_URL;

export async function createCost(payload) {
  const res = await fetch(`${base}/api/costs`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const data = await res.json();
  if (!res.ok || !data.ok)
    throw new Error(data?.error ? JSON.stringify(data.error) : "Failed");
  return data;
}

export async function getAvailableMonths() {
  const res = await fetch(`${base}/api/costs/available-months`);
  const data = await res.json();
  if (!res.ok || !data.ok) throw new Error(data?.error || "Failed");
  return data.months;
}

export async function getCostsByMonth(year, month) {
  const res = await fetch(`${base}/api/costs?year=${year}&month=${month}`);
  const data = await res.json();
  if (!res.ok || !data.ok) throw new Error(data?.error || "Failed");
  return data.items;
}
