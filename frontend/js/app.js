/* 应用入口：导航切换 + 视图初始化 */
window.App = { Views: {} };

document.addEventListener("DOMContentLoaded", async () => {
  // 导航
  document.querySelectorAll(".nav-btn").forEach((btn) => {
    btn.onclick = () => switchView(btn.dataset.view);
  });

  // 系统信息
  try {
    const h = await API.get("/api/health");
    document.getElementById("sys-info").textContent =
      `存储: ${h.storage_mode} · 工作空间: ${h.workspace_id}`;
  } catch (e) {
    document.getElementById("sys-info").textContent = "后端未连接";
  }

  // 默认视图
  App.Views.stats.init();
});

function switchView(name) {
  document.querySelectorAll(".nav-btn").forEach((b) =>
    b.classList.toggle("active", b.dataset.view === name));
  document.querySelectorAll(".view").forEach((v) =>
    v.classList.toggle("active", v.id === `view-${name}`));
  const view = App.Views[name];
  if (view) view.init();
  // 上报访问记录（异步，不阻塞 UI）
  try {
    API.post("/api/access", { view: name, url: location.href }).catch(() => {});
  } catch (_) {}
}
