import { ensureSeed, ensureUsers, Users, SyncQueue } from './db.js';
import { $, $$, toast } from './helpers.js';
import * as V from './views.js';

let currentView = 'central';
let currentRegistryTab = 'vehicles';
let environment = localStorage.getItem('orbita_env') || 'real';

export function getEnv() { return environment; }

/* ---------- boot ---------- */
function boot() {
  setTimeout(async () => {
    $('#bootScreen').classList.add('hidden');
    await ensureSeed();
    const hasUsers = await ensureUsers();
    wireGlobalActions();
    if (!hasUsers) { $('#loginHint').textContent = 'Crie o primeiro acesso de administrador neste aparelho.'; $('#loginForm button').textContent = 'Criar acesso'; }
    if (sessionStorage.getItem('orbita_session')) startApp();
    else $('#loginScreen').classList.remove('hidden');
  }, 450);

  updateConnection();
  window.addEventListener('online', updateConnection);
  window.addEventListener('offline', updateConnection);
}

function updateConnection() {
  const dot = $('#connDot'), label = $('#connLabel');
  if (!dot) return;
  if (navigator.onLine) { dot.className = 'conn-dot online'; label.textContent = 'Online • fila pronta'; retrySync(); }
  else { dot.className = 'conn-dot offline'; label.textContent = 'Offline • alterações protegidas'; }
}

async function retrySync() {
  if (!navigator.onLine) return;
  try { const count = await SyncQueue.retryAll(); if (count) toast(`${count} alteração(ões) marcadas para sincronização.`, 'success'); } catch { /* IndexedDB pode ainda estar abrindo */ }
}

/* ---------- app shell ---------- */
function startApp() {
  $('#appShell').classList.remove('hidden');
  applyPermissions();
  renderEnvPill();
  wireNav();
  $('#newDeliveryBtn')?.addEventListener('click', () => V.openDeliveryModal());
  wireSession();
  render();
}

function applyPermissions() {
  const role = JSON.parse(sessionStorage.getItem('orbita_session') || '{}').role || 'consulta';
  const adminOnly = new Set(['registry', 'audit', 'trash', 'settings']);
  $$('.nav-item[data-view]').forEach((btn) => { btn.hidden = adminOnly.has(btn.dataset.view) && !['administrador', 'lider'].includes(role); });
  if (role === 'consulta') $('#newDeliveryBtn').hidden = true;
}

function wireSession() {
  const session = JSON.parse(sessionStorage.getItem('orbita_session') || '{}');
  const chip = $('#userChip');
  if (chip) chip.textContent = `${session.name || 'Usuário'} · ${session.role || 'consulta'}`;
  $('#logoutBtn')?.addEventListener('click', () => { sessionStorage.removeItem('orbita_session'); location.reload(); });
}

function renderEnvPill() {
  $('#envPill').textContent = environment === 'treino' ? '🎓 Treinamento' : '● Operação Real';
  $('#envPill').classList.toggle('treino', environment === 'treino');
}

function wireNav() {
  $$('.nav-item[data-view]').forEach((btn) => {
    btn.addEventListener('click', () => {
      currentView = btn.dataset.view;
      $$('.nav-item[data-view]').forEach((b) => b.classList.toggle('active', b === btn));
      $('#sidebar').classList.remove('open');
      render();
    });
  });
  $('#menuBtn').addEventListener('click', () => $('#sidebar').classList.toggle('open'));
  $('#envToggleBtn').addEventListener('click', () => {
    environment = environment === 'real' ? 'treino' : 'real';
    localStorage.setItem('orbita_env', environment);
    renderEnvPill();
    toast(environment === 'treino' ? 'Modo Treinamento ativado.' : 'Voltou para Operação Real.', '');
    render();
  });
}

function wireGlobalActions() {
  $('#loginForm')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const fd = Object.fromEntries(new FormData(e.target).entries());
    const users = await Users.all();
    if (!users.length) {
      if (!fd.username || !fd.password || fd.password.length < 6) return toast('Informe usuário e senha com pelo menos 6 caracteres.', 'error');
      const created = await Users.add({ name: 'Administrador', username: fd.username.trim(), password: fd.password, role: 'administrador', active: true });
      sessionStorage.setItem('orbita_session', JSON.stringify({ id: created.id, name: created.name, role: created.role }));
      localStorage.setItem('orbita_actor_id', created.id); localStorage.setItem('orbita_actor_name', created.name);
      $('#loginScreen').classList.add('hidden'); startApp(); return;
    }
    const user = users.find((u) => u.username === fd.username && u.password === fd.password && u.active !== false);
    if (!user) return toast('Usuário ou senha inválidos.', 'error');
    sessionStorage.setItem('orbita_session', JSON.stringify({ id: user.id, name: user.name, role: user.role }));
    localStorage.setItem('orbita_actor_id', user.id); localStorage.setItem('orbita_actor_name', user.name);
    $('#loginScreen').classList.add('hidden'); startApp();
  });
}

/* ---------- modal genérico ---------- */
export function openModal({ title, subtitle = '', body, actions = [] }) {
  $('#modalTitle').textContent = title;
  $('#modalSubtitle').textContent = subtitle;
  $('#modalBody').innerHTML = body;
  $('#modalActions').innerHTML = actions.map((a, i) => `<button class="btn-${a.kind === 'primary' ? 'primary' : a.kind === 'danger' ? 'danger-text' : 'ghost'}" data-idx="${i}">${a.label}</button>`).join('');
  $$('#modalActions button').forEach((btn, i) => {
    let busy = false;
    btn.addEventListener('click', async () => {
      if (busy) return;
      busy = true; btn.disabled = true;
      try { await actions[i].onClick(); } finally { busy = false; if (btn.isConnected) btn.disabled = false; }
    });
  });
  $('#modalWrap').classList.remove('hidden');
  $('#modalWrap').setAttribute('aria-hidden', 'false');
}
export function closeModal() {
  $('#modalWrap').classList.add('hidden');
  $('#modalWrap').setAttribute('aria-hidden', 'true');
}
$_modalBackdropClose();
function $_modalBackdropClose() {
  document.addEventListener('DOMContentLoaded', () => {
    $('#modalWrap')?.addEventListener('click', (e) => { if (e.target.id === 'modalWrap') closeModal(); });
    $('#modalClose')?.addEventListener('click', closeModal);
  });
}

export function refreshApp() { render(); }

/* ---------- router ---------- */
async function render() {
  const view = $('#view');
  const title = $('#viewTitle');
  const sub = $('#viewSubtitle');

  const routes = {
    central: ['Central Operacional', 'O essencial da operação de hoje.', V.renderCentral, V.wireCentralEvents],
    dashboard: ['Dashboard', 'Panorama geral da operação.', V.renderDashboard, null],
    search: ['Busca geral', 'Pesquise por qualquer campo da entrega.', V.renderSearch, V.wireSearchEvents],
    cycles: ['Ciclos', 'Saídas em andamento e finalizadas.', V.renderCycles, V.wireCyclesEvents],
    km: ['Quilometragem', 'Controle de KM por veículo e expediente.', V.renderKm, V.wireKmEvents],
    costs: ['Custos e financeiro', 'Lançamentos e resultado financeiro.', V.renderCosts, V.wireCostsEvents],
    reports: ['Relatórios', 'Gerencial (impressão/PDF) e analítico (Excel/CSV).', V.renderReports, V.wireReportsEvents],
    audit: ['Auditoria', 'Todo evento relevante fica registrado, sem edição posterior.', V.renderAudit, null],
    trash: ['Lixeira', 'Nada é apagado de verdade até você restaurar ou excluir de vez.', V.renderTrash, V.wireTrashEvents],
    registry: ['Cadastros', 'Veículos, entregadores, bairros, categorias e motivos.', () => V.renderRegistry(currentRegistryTab), () => V.wireRegistryEvents(currentRegistryTab, (tab) => { currentRegistryTab = tab; render(); })],
    settings: ['Configurações', 'Empresa, backup e restauração.', V.renderSettings, V.wireSettingsEvents],
  };

  const [t, s, renderFn, wireFn] = routes[currentView] || routes.central;
  const role = JSON.parse(sessionStorage.getItem('orbita_session') || '{}').role || 'consulta';
  if (['registry', 'audit', 'trash', 'settings'].includes(currentView) && !['administrador', 'lider'].includes(role)) { currentView = 'central'; return render(); }
  title.textContent = t;
  sub.textContent = s;
  view.innerHTML = await renderFn();
  if (wireFn) wireFn();
  updateBadges();
  updateMascot();
}

async function updateBadges() {
  const { Deliveries, Cycles } = await import('./db.js');
  const rows = await Deliveries.active(environment);
  $('#pendingBadge').textContent = rows.filter((r) => r.status === 'na_loja').length;
  const trashed = await Deliveries.trashed(environment);
  $('#trashBadge').textContent = trashed.length;
  const cycles = (await Cycles.all()).filter((c) => c.status === 'aberto' && !c.deletedAt);
  $('#cyclesBadge').textContent = cycles.length;
}

/* ---------- mascote (humor conforme desempenho do dia) ---------- */
async function updateMascot() {
  const box = $('#mascotMood');
  if (!box) return;
  const { Deliveries } = await import('./db.js');
  const rows = await Deliveries.active(environment);
  const finalized = rows.filter((r) => r.status === 'finalizada').length;
  const problems = rows.filter((r) => ['retorno', 'cancelada'].includes(r.status)).length;
  const total = rows.length || 1;
  const ratio = finalized / total;
  const mood = problems > finalized ? '😟' : ratio > 0.7 ? '😄' : ratio > 0.3 ? '🙂' : '😐';
  box.textContent = mood;
}

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => navigator.serviceWorker.register('./sw.js').catch(() => {}));
}

boot();
