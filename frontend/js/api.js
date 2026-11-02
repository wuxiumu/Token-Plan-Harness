/* 统一 API 封装 */
const API = {
  async request(method, path, body) {
    const opt = { method, headers: {} };
    if (body !== undefined) {
      opt.headers["Content-Type"] = "application/json";
      opt.body = JSON.stringify(body);
    }
    const res = await fetch(path, opt);
    if (!res.ok) {
      let msg = `HTTP ${res.status}`;
      try { const j = await res.json(); msg = j.detail || msg; } catch (e) {}
      throw new Error(msg);
    }
    return res.json();
  },
  get: (p) => API.request("GET", p),
  post: (p, b) => API.request("POST", p, b),
  put: (p, b) => API.request("PUT", p, b),
  del: (p) => API.request("DELETE", p),
};

const fmt = {
  num: (n) => (n ?? 0).toLocaleString("zh-CN"),
  pct: (n) => ((n ?? 0) * 100).toFixed(1) + "%",
  maskTime: (ts) => {
    if (!ts) return "—";
    const t = typeof ts === "number" && ts > 1e12 ? new Date(ts) : new Date(ts);
    return isNaN(t) ? String(ts) : t.toLocaleString("zh-CN");
  },
  esc: (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  }[c])),
};
