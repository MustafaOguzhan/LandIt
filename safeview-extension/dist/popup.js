const $ = (id) => document.getElementById(id);
const status = $('status');

async function refresh() {
  const { enabled = true, sensitivity = 'high' } = await chrome.storage.sync.get(['enabled', 'sensitivity']);
  $('enabled').checked = enabled;
  $('sensitivity').value = sensitivity;
  if (!enabled) { status.textContent = 'Filtre kapalı.'; return; }
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    const r = await chrome.tabs.sendMessage(tab.id, { type: 'get-stats' });
    status.textContent = `Filtre açık · bu sayfada ${r.blurred} görsel gizlendi.`;
  } catch (_) {
    status.textContent = 'Filtre açık.';
  }
}
$('enabled').addEventListener('change', async (e) => { await chrome.storage.sync.set({ enabled: e.target.checked }); refresh(); });
$('sensitivity').addEventListener('change', async (e) => { await chrome.storage.sync.set({ sensitivity: e.target.value }); });
refresh();
