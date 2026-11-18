document.addEventListener('DOMContentLoaded', () => {
  const dialog = document.getElementById('share-dialog');
  const select = document.getElementById('share-address');
  const link = document.getElementById('share-link');
  const qr = document.getElementById('share-qr');
  const status = document.getElementById('share-status');
  const copy = document.getElementById('share-copy');
  const update = () => {
    link.value = select.value;
    qr.src = '/api/share/qr?url=' + encodeURIComponent(select.value);
    qr.hidden = false;
    document.getElementById('share-open').href = select.value;
    document.getElementById('share-open').hidden = false;
  };
  select.onchange = update;
  qr.onerror = () => { qr.hidden = true; status.textContent = '二维码加载失败，仍可复制链接分享。'; };
  document.getElementById('share-close').onclick = () => dialog.close();
  document.getElementById('share-button').onclick = async () => {
    dialog.showModal(); status.textContent = '正在读取局域网地址…'; copy.disabled = true;
    select.replaceChildren(); link.value = ''; qr.hidden = true;
    document.getElementById('share-open').hidden = true;
    try {
      const data = await API.get('/api/share/info');
      for (const url of data.urls) { const option = document.createElement('option'); option.value = option.textContent = url; select.append(option); }
      if (!data.urls.length) { status.textContent = '未找到局域网地址，请连接 Wi-Fi 或有线网络后重试。'; return; }
      status.textContent = '同一 Wi-Fi / 局域网内可打开。多个地址时请选择当前网络的地址；若打不开，请检查防火墙或路由器设备隔离。';
      copy.disabled = false; update();
    } catch (e) { status.textContent = e.message; }
  };
  copy.onclick = async () => {
    try { await navigator.clipboard.writeText(link.value); status.textContent = '链接已复制，可以发送给同一局域网的同事。'; }
    catch (_) { link.focus(); link.select(); status.textContent = '请按 ⌘C / Ctrl+C 复制选中的链接。'; }
  };
});
