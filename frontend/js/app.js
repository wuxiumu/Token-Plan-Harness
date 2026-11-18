/* 应用入口：hash 路由 + 导航切换 + 视图初始化
 * 视图地址：#/stats  #/keys  #/trial；统计页内部 tab：#/stats/{tabId}
 * 刷新后从 hash 恢复当前视图与 tab；访问记录随视图切换上报（URL 带 hash）。 */
window.App = { Views: {} };

const VIEW_NAMES = ["stats", "keys", "trial", "service", "domains", "manual"];
let currentView = null;

function parseHash() {
  const h = location.hash.replace(/^#\/?/, "");
  const parts = h.split("/").filter(Boolean);
  let view = parts[0] || "stats";
  if (!VIEW_NAMES.includes(view)) view = "stats";
  const tab = parts.length > 1 ? parts[1] : null;
  return { view, tab };
}

function renderView(name, tab) {
  const prev = currentView;
  currentView = name;
  document.querySelectorAll(".nav-btn").forEach((b) =>
    b.classList.toggle("active", b.dataset.view === name));
  document.querySelectorAll(".view").forEach((v) =>
    v.classList.toggle("active", v.id === `view-${name}`));
  const view = App.Views[name];
  if (view) {
    // 同一视图内仅参数(tab)变化：交给视图自己的 onHash，不重复拉数据/上报
    if (name === prev && tab && typeof view.onHash === "function") {
      view.onHash(tab);
      return;
    }
    if (tab && typeof view.setActiveTab === "function") view.setActiveTab(tab);
    view.init();
    // 上报访问记录（异步，不阻塞 UI）
    try {
      API.post("/api/access", { view: name, url: location.href }).catch(() => {});
    } catch (_) {}
  }
}

function switchView(name, tab) {
  const target = tab ? `#/${name}/${tab}` : `#/${name}`;
  if (location.hash !== target) location.hash = target;
  renderView(name, tab);
}

window.addEventListener("hashchange", () => {
  const { view, tab } = parseHash();
  renderView(view, tab);
});

document.addEventListener("DOMContentLoaded", async () => {
  document.querySelectorAll(".nav-btn").forEach((btn) => {
    btn.onclick = () => switchView(btn.dataset.view);
  });

  const cacheInput = document.getElementById("cache-minutes");
  const cacheResult = document.getElementById("cache-result");
  try { cacheInput.value = (await API.get("/api/settings/cache")).minutes; }
  catch (_) { cacheResult.textContent = "读取设置失败"; }
  document.getElementById("cache-settings").onsubmit = async (event) => {
    event.preventDefault();
    try {
      const result = await API.put("/api/settings/cache", { minutes: Number(cacheInput.value) });
      cacheInput.value = result.minutes;
      cacheResult.textContent = "已保存";
    } catch (e) { cacheResult.textContent = e.message; }
  };

  // 系统信息
  try {
    const h = await API.get("/api/health");
    document.getElementById("sys-info").textContent =
      `存储: ${h.storage_mode} · ${h.primary_account ? "主账号: " + h.primary_account.label : "工作空间: " + h.workspace_id}`;
  } catch (e) {
    document.getElementById("sys-info").textContent = "后端未连接";
  }

  // 按 hash 恢复视图
  const { view, tab } = parseHash();
  renderView(view, tab);
});
