import { DB } from './db.js';

/* ---------- helpers ---------- */
const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => Array.from(document.querySelectorAll(sel));
const money = (n) => (Number(n) || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const escapeHtml = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const STATUS_META = {
  pendente: { label: 'Pendente', color: 'var(--status-pendente)' },
  transito: { label: 'Em rota', color: 'var(--status-transito)' },
  entregue: { label: 'Entregue', color: 'var(--status-entregue)' },
  problema: { label: 'Problema', color: 'var(--status-problema)' },
};

function toast(msg, kind = '') {
  const el = document.createElement('div');
  el.className = `toast ${kind}`.trim();
  el.textContent = msg;
  $('#toastStack').appendChild(el);
  setTimeout(() => el.remove(), 3200);
}

/* ---------- boot / auth (offline-first: sempre libera o app local) ---------- */
function boot() {
  setTimeout(() => {
    $('#bootScreen').classList.add('hidden');
    const seenAuth = localStorage.getItem('orbita_auth_dismissed');
    if (seenAuth) {
      startApp();
    } else {
      $('#authScreen').classList.remove('hidden');
    }
  }, 500);

  $('#continueOfflineBtn').addEventListener('click', () => {
    localStorage.setItem('orbita_auth_dismissed', '1');
    $('#authScreen').classList.add('hidden');
    startApp();
  });

  $('#authForm').addEventListener('submit', (e) => {
    e.preventDefault();
    // Sincronização em nuvem é o próximo passo (ver README) — por ora,
    // qualquer usuário/senha preenchidos liberam o modo local autenticado.
    localStorage.setItem('orbita_auth_dismissed', '1');
    $('#authScreen').classList.add('hidden');
    startApp();
  });

  updateConnection();
  window.addEventListener('online', updateConnection);
  window.addEventListener('offline', updateConnection);
}

function updateConnection() {
  const dot = $('#connDot');
  const label = $('#connLabel');
  if (navigator.onLine) {
    dot.className = 'conn-dot online';
    label.textContent = 'Online • salvando neste aparelho';
  } else {
    dot.className = 'conn-dot offline';
    label.textContent = 'Offline • dados seguros neste aparelho';
  }
}

/* ---------- app state ---------- */
let currentView = 'today';

function startApp() {
  $('#appShell').classList.remove('hidden');
  wireNav();
  wireGlobalActions();
  render();
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
}

function wireGlobalActions() {
  $('#newDeliveryBtn').addEventListener('click', () => openDeliveryModal());
  $('#modalClose').addEventListener('click', closeModal);
  $('#modalWrap').addEventListener('click', (e) => { if (e.target.id === 'modalWrap') closeModal(); });

  $('#backupBtn').addEventListener('click', async () => {
    const rows = await DB.all();
    const blob = new Blob([JSON.stringify(rows, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `orbita-backup-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
    toast('Backup gerado.', 'success');
  });

  $('#restoreInput').addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    try {
      const text = await file.text();
      const rows = JSON.parse(text);
      if (!Array.isArray(rows)) throw new Error('Formato inválido');
      await DB.replaceAll(rows);
      toast('Backup restaurado.', 'success');
      render();
    } catch (err) {
      toast('Não foi possível ler esse arquivo de backup.', 'error');
    }
    e.target.value = '';
  });
}

/* ---------- render router ---------- */
async function render() {
  const view = $('#view');
  const title = $('#viewTitle');
  const sub = $('#viewSubtitle');

  if (currentView === 'today') {
    title.textContent = 'Central Operacional';
    sub.textContent = 'Todas as entregas do dia, por status.';
    view.innerHTML = await renderBoard();
    wireBoardEvents();
  } else if (currentView === 'dashboard') {
    title.textContent = 'Dashboard';
    sub.textContent = 'Panorama geral da operação.';
    view.innerHTML = await renderDashboard();
  } else if (currentView === 'trash') {
    title.textContent = 'Lixeira';
    sub.textContent = 'Entregas removidas — nada aqui é apagado de verdade até você esvaziar.';
    view.innerHTML = await renderTrash();
    wireTrashEvents();
  }

  updateBadges();
}

async function updateBadges() {
  const rows = await DB.active();
  const pending = rows.filter((r) => r.status === 'pendente' || r.status === 'problema').length;
  $('#pendingBadge').textContent = pending;
  const trashed = await DB.trashed();
  $('#trashBadge').textContent = trashed.length;
}

/* ---------- board (Central Operacional) ---------- */
async function renderBoard() {
  const rows = await DB.active();
  const cols = ['pendente', 'transito', 'entregue', 'problema'];

  const colsHtml = cols.map((status) => {
    const meta = STATUS_META[status];
    const items = rows.filter((r) => r.status === status).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    const cards = items.length
      ? items.map(ticketHtml).join('')
      : `<div class="board-empty">Nenhuma entrega aqui.</div>`;
    return `
      <div class="board-col">
        <div class="board-col-head">
          <span class="dot" style="background:${meta.color}"></span>
          <strong>${meta.label}</strong>
          <span>${items.length}</span>
        </div>
        <div class="board-cards">${cards}</div>
      </div>`;
  }).join('');

  if (!rows.length) {
    return `<div class="empty-state"><strong>Nenhuma entrega registrada ainda</strong>Clique em "Registrar entrega" para começar o dia.</div>`;
  }

  return `<div class="board">${colsHtml}</div>`;
}

function ticketHtml(r) {
  return `
    <div class="ticket st-${r.status}" data-id="${r.id}">
      <div class="t-name">${escapeHtml(r.cliente)}</div>
      <div class="t-addr">${escapeHtml(r.bairro || '')}${r.bairro && r.endereco ? ' • ' : ''}${escapeHtml(r.endereco || '')}</div>
      <div class="t-foot">
        <span>${escapeHtml(r.motorista || 'Sem motorista')}</span>
        <span class="t-value">${money(r.valor)}</span>
      </div>
    </div>`;
}

function wireBoardEvents() {
  $$('.ticket').forEach((el) => {
    el.addEventListener('click', async () => {
      const rows = await DB.all();
      const record = rows.find((r) => r.id === el.dataset.id);
      if (record) openDeliveryModal(record);
    });
  });
}

/* ---------- dashboard ---------- */
async function renderDashboard() {
  const rows = await DB.active();
  const total = rows.length;
  const entregues = rows.filter((r) => r.status === 'entregue').length;
  const problemas = rows.filter((r) => r.status === 'problema').length;
  const valorTotal = rows.reduce((sum, r) => sum + (Number(r.valor) || 0), 0);

  return `
    <div class="stat-row">
      <div class="stat-card"><small>Total de entregas</small><strong>${total}</strong></div>
      <div class="stat-card"><small>Entregues</small><strong>${entregues}</strong></div>
      <div class="stat-card"><small>Com problema</small><strong>${problemas}</strong></div>
      <div class="stat-card accent"><small>Valor total</small><strong>${money(valorTotal)}</strong></div>
    </div>
    ${total === 0 ? `<div class="empty-state"><strong>Sem dados ainda</strong>Os números aparecem assim que você registrar entregas.</div>` : ''}
  `;
}

/* ---------- trash ---------- */
async function renderTrash() {
  const rows = (await DB.trashed()).sort((a, b) => (b.deletedAt || '').localeCompare(a.deletedAt || ''));
  if (!rows.length) {
    return `<div class="empty-state"><strong>Lixeira vazia</strong>Entregas removidas aparecem aqui e podem ser restauradas.</div>`;
  }
  const trs = rows.map((r) => `
    <tr data-id="${r.id}">
      <td><strong>${escapeHtml(r.cliente)}</strong><br><span style="color:var(--text-muted);font-size:11.5px">${escapeHtml(r.endereco || '')}</span></td>
      <td>${money(r.valor)}</td>
      <td>${new Date(r.deletedAt).toLocaleDateString('pt-BR')}</td>
      <td><button class="btn-ghost btn-small restore-btn">Restaurar</button></td>
    </tr>`).join('');
  return `
    <div class="table-wrap">
      <table>
        <thead><tr><th>Cliente</th><th>Valor</th><th>Removido em</th><th></th></tr></thead>
        <tbody>${trs}</tbody>
      </table>
    </div>`;
}

function wireTrashEvents() {
  $$('.restore-btn').forEach((btn) => {
    btn.addEventListener('click', async (e) => {
      const id = e.target.closest('tr').dataset.id;
      await DB.restore(id);
      toast('Entrega restaurada.', 'success');
      render();
    });
  });
}

/* ---------- delivery modal (create/edit) ---------- */
function openDeliveryModal(record = null) {
  const isEdit = !!record;
  $('#modalTitle').textContent = isEdit ? 'Editar entrega' : 'Registrar entrega';
  $('#modalSubtitle').textContent = isEdit ? `Criada em ${new Date(record.createdAt).toLocaleString('pt-BR')}` : 'Preencha os dados do cliente e da entrega.';

  $('#modalBody').innerHTML = `
    <form id="deliveryForm">
      <label>Cliente
        <input name="cliente" required value="${escapeHtml(record?.cliente || '')}" placeholder="Nome do cliente" />
      </label>
      <div class="field-row">
        <label>Bairro
          <input name="bairro" value="${escapeHtml(record?.bairro || '')}" placeholder="Ex: Centro" />
        </label>
        <label>Valor (R$)
          <input name="valor" type="number" step="0.01" min="0" value="${record?.valor ?? ''}" placeholder="0,00" />
        </label>
      </div>
      <label>Endereço
        <input name="endereco" value="${escapeHtml(record?.endereco || '')}" placeholder="Rua, número" />
      </label>
      <div class="field-row">
        <label>Motorista
          <input name="motorista" value="${escapeHtml(record?.motorista || '')}" placeholder="Nome do entregador" />
        </label>
        <label>Status
          <select name="status">
            ${Object.entries(STATUS_META).map(([k, v]) => `<option value="${k}" ${record?.status === k ? 'selected' : ''}>${v.label}</option>`).join('')}
          </select>
        </label>
      </div>
      <label>Observações
        <textarea name="obs" rows="2" placeholder="Opcional">${escapeHtml(record?.obs || '')}</textarea>
      </label>
    </form>
  `;

  const actions = isEdit
    ? `<button class="btn-danger-text" id="deleteBtn">Remover entrega</button>
       <span style="flex:1"></span>
       <button class="btn-ghost" id="cancelBtn">Cancelar</button>
       <button class="btn-primary" id="saveBtn">Salvar alterações</button>`
    : `<button class="btn-ghost" id="cancelBtn">Cancelar</button>
       <button class="btn-primary" id="saveBtn">Registrar</button>`;
  $('#modalActions').innerHTML = actions;

  $('#cancelBtn').addEventListener('click', closeModal);
  $('#saveBtn').addEventListener('click', async () => {
    const form = $('#deliveryForm');
    if (!form.reportValidity()) return;
    const data = Object.fromEntries(new FormData(form).entries());
    data.valor = data.valor ? Number(data.valor) : 0;
    try {
      if (isEdit) {
        await DB.update(record.id, data);
        toast('Entrega atualizada.', 'success');
      } else {
        await DB.add(data);
        toast('Entrega registrada.', 'success');
      }
      closeModal();
      render();
    } catch (err) {
      toast('Não foi possível salvar. Tente novamente.', 'error');
    }
  });

  if (isEdit) {
    $('#deleteBtn').addEventListener('click', async () => {
      await DB.softDelete(record.id);
      toast('Entrega enviada para a lixeira.', 'success');
      closeModal();
      render();
    });
  }

  $('#modalWrap').classList.remove('hidden');
  $('#modalWrap').setAttribute('aria-hidden', 'false');
}

function closeModal() {
  $('#modalWrap').classList.add('hidden');
  $('#modalWrap').setAttribute('aria-hidden', 'true');
}

/* ---------- PWA install ---------- */
let deferredInstall = null;
window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  deferredInstall = e;
  $('#installBtn').hidden = false;
});
document.addEventListener('DOMContentLoaded', () => {
  $('#installBtn').addEventListener('click', async () => {
    if (!deferredInstall) return;
    deferredInstall.prompt();
    await deferredInstall.userChoice;
    deferredInstall = null;
    $('#installBtn').hidden = true;
  });
});

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').catch(() => {});
  });
}

boot();
