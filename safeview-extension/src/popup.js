const $ = (id) => document.getElementById(id);
const status = $('status');
const model = $('model');

async function refreshModel() {
  const r = await new Promise((res) => chrome.runtime.sendMessage({ type: 'status' }, (x) => res(chrome.runtime.lastError ? null : x)));
  model.classList.remove('err');
  if (!r) { model.textContent = 'Model: yanıt yok (eklentiyi yeniden yükleyin)'; model.classList.add('err'); }
  else if (r.state === 'ready') model.textContent = `Model: hazır (${r.backend})`;
  else if (r.state === 'loading') { model.textContent = 'Model: yükleniyor…'; setTimeout(refreshModel, 1500); }
  else { model.textContent = 'Model HATA: ' + r.error; model.classList.add('err'); }
}

async function refresh() {
  const { enabled = true, sensitivity = 'high', unverified = 'blur' } = await chrome.storage.sync.get(['enabled', 'sensitivity', 'unverified']);
  $('enabled').checked = enabled;
  $('sensitivity').value = sensitivity;
  $('unverified').value = unverified;
  if (!enabled) { status.textContent = 'Filtre kapalı.'; model.textContent = ''; return; }
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    const r = await chrome.tabs.sendMessage(tab.id, { type: 'get-stats' });
    status.textContent = `Bu sayfada ${r.blurred} görsel gizlendi, ${r.unverified} görsel kontrol edilemedi.`;
  } catch (_) {
    status.textContent = 'Filtre açık (bu sayfada çalışmıyor olabilir).';
  }
  refreshModel();
}
$('enabled').addEventListener('change', async (e) => { await chrome.storage.sync.set({ enabled: e.target.checked }); refresh(); });
$('sensitivity').addEventListener('change', (e) => chrome.storage.sync.set({ sensitivity: e.target.value }));
$('unverified').addEventListener('change', (e) => chrome.storage.sync.set({ unverified: e.target.value }));
refresh();
