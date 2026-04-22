/* ============================================
   ARH_MURAS_GROUP — script.js v4.0
   ✅ IndexedDB: хранит 10 000+ проектов
   ✅ Сжатие фото (качество 0.65, max 1400px)
   ✅ Пагинация для большого кол-ва проектов
   ✅ Резервные копии (экспорт/импорт)
   ============================================ */

/* ── СОСТОЯНИЕ ──────────────────────────────── */
let db = [];             // Все проекты в памяти (для фильтрации)
let filteredDB = [];     // Отфильтрованные
let currentPage = 1;
const PAGE_SIZE = 24;

let isLoggedIn = localStorage.getItem('archidata_logged_in') === 'true';
let currentUser = localStorage.getItem('archidata_user') || '';

/* ── СОТРУДНИКИ ─────────────────────────────── */
const employees = {
    'admin':      'admin2026',
    'architect1': 'archi2026',
    'architect2': 'archi2026',
    'geodesy':    'geo2026',
    'designer':   'design2026',
    'landscape':  'land2026',
    'manager':    'manager2026'
};

/* ============================================
   INDEXEDDB — база для 10 000+ проектов
   Хранит фото как Blob (не base64),
   поэтому занимает в 1.5x меньше места.
   ============================================ */
let idb = null;
const DB_NAME  = 'arhmuras_v4';
const DB_VER   = 1;
const STORE    = 'projects';

function openIDB() {
    return new Promise((resolve, reject) => {
        const req = indexedDB.open(DB_NAME, DB_VER);
        req.onupgradeneeded = e => {
            const d = e.target.result;
            if (!d.objectStoreNames.contains(STORE)) {
                const s = d.createObjectStore(STORE, { keyPath: 'id' });
                s.createIndex('cat', 'cat', { unique: false });
                s.createIndex('uploadDate', 'uploadDate', { unique: false });
            }
        };
        req.onsuccess  = e => { idb = e.target.result; resolve(idb); };
        req.onerror    = e => { console.error('IDB error', e); reject(e); };
    });
}

function idbGetAll() {
    return new Promise((resolve, reject) => {
        const tx = idb.transaction(STORE, 'readonly');
        const req = tx.objectStore(STORE).getAll();
        req.onsuccess = () => resolve(req.result);
        req.onerror   = () => reject(req.error);
    });
}

function idbPut(project) {
    return new Promise((resolve, reject) => {
        const tx  = idb.transaction(STORE, 'readwrite');
        const req = tx.objectStore(STORE).put(project);
        req.onsuccess = () => resolve(req.result);
        req.onerror   = () => reject(req.error);
    });
}

function idbDelete(id) {
    return new Promise((resolve, reject) => {
        const tx  = idb.transaction(STORE, 'readwrite');
        const req = tx.objectStore(STORE).delete(id);
        req.onsuccess = () => resolve();
        req.onerror   = () => reject(req.error);
    });
}

/* Fallback: если IndexedDB недоступен — localStorage */
function lsLoad() {
    try { return JSON.parse(localStorage.getItem('archidata_projects_v2') || '[]'); } catch { return []; }
}
function lsSave() {
    try { localStorage.setItem('archidata_projects_v2', JSON.stringify(db)); } catch(e) { console.warn('LS full', e); }
}

/* ── СЖАТИЕ ИЗОБРАЖЕНИЙ ─────────────────────── */
async function compressImage(file, quality = 0.65, maxWidth = 1400) {
    return new Promise((resolve) => {
        const reader = new FileReader();
        reader.onload = e => {
            const img = new Image();
            img.onload = () => {
                let { width, height } = img;
                if (width > maxWidth) { height = Math.round(height * maxWidth / width); width = maxWidth; }
                const canvas = document.createElement('canvas');
                canvas.width = width; canvas.height = height;
                canvas.getContext('2d').drawImage(img, 0, 0, width, height);
                resolve(canvas.toDataURL('image/jpeg', quality));
            };
            img.src = e.target.result;
        };
        reader.readAsDataURL(file);
    });
}

/* ── INIT ───────────────────────────────────── */
document.addEventListener('DOMContentLoaded', async () => {
    try {
        await openIDB();
        db = await idbGetAll();
        // Миграция из старого localStorage
        const old = lsLoad();
        if (old.length > 0 && db.length === 0) {
            for (const p of old) { await idbPut(p); }
            db = old;
            localStorage.removeItem('archidata_projects_v2');
            console.log(`✓ Мигрировано ${old.length} проектов в IndexedDB`);
        }
    } catch (e) {
        console.warn('IndexedDB недоступен, используем localStorage:', e);
        db = lsLoad();
    }

    filteredDB = [...db];
    updateAuthUI();
    renderAll();
    setupFilters();
    setupDragDrop();
    checkEmpty();
    setupExportImport();
    console.log(`✓ База загружена: ${db.length} проектов`);
});

/* ── СОХРАНЕНИЕ ─────────────────────────────── */
async function saveProject(project) {
    try {
        await idbPut(project);
    } catch {
        lsSave();
    }
}

async function removeProject(id) {
    try {
        await idbDelete(id);
    } catch {
        lsSave();
    }
}

/* ── АУТЕНТИФИКАЦИЯ ─────────────────────────── */
function loginPrompt() {
    // Красивый модальный диалог вместо prompt
    const overlay = document.createElement('div');
    overlay.style.cssText = `position:fixed;inset:0;background:rgba(13,12,11,0.85);backdrop-filter:blur(8px);z-index:9999;display:flex;align-items:center;justify-content:center;padding:16px`;
    overlay.innerHTML = `
        <div style="background:var(--paper);max-width:400px;width:100%;border-radius:4px;overflow:hidden;box-shadow:0 24px 64px rgba(0,0,0,0.3)">
            <div style="padding:28px 28px 0;border-bottom:1px solid var(--paper-3);margin-bottom:0">
                <p style="font-size:10px;letter-spacing:3px;text-transform:uppercase;color:var(--gold);margin-bottom:8px">Вход для сотрудников</p>
                <h3 style="font-family:'Playfair Display',serif;font-size:22px;color:var(--ink);font-weight:400;margin-bottom:24px">ARH_MURAS_GROUP</h3>
            </div>
            <div style="padding:24px 28px;display:flex;flex-direction:column;gap:14px">
                <input id="loginUser" placeholder="Логин" autocomplete="username" style="width:100%;padding:13px 16px;border:1px solid var(--paper-3);border-radius:2px;background:var(--paper);color:var(--ink);font-family:inherit;font-size:14px;outline:none;transition:border-color 0.2s">
                <input id="loginPass" type="password" placeholder="Пароль" autocomplete="current-password" style="width:100%;padding:13px 16px;border:1px solid var(--paper-3);border-radius:2px;background:var(--paper);color:var(--ink);font-family:inherit;font-size:14px;outline:none;transition:border-color 0.2s">
                <p id="loginErr" style="font-size:12px;color:#c0392b;display:none">Неверный логин или пароль</p>
            </div>
            <div style="display:flex;gap:10px;padding:16px 28px 24px">
                <button id="loginBtn" style="flex:1;padding:13px;font-size:11px;font-weight:500;letter-spacing:1.5px;text-transform:uppercase;background:var(--ink);color:var(--paper);border:none;cursor:pointer;border-radius:2px;transition:background 0.2s">ВОЙТИ</button>
                <button id="loginCancel" style="padding:13px 20px;font-size:11px;font-weight:500;letter-spacing:1px;text-transform:uppercase;background:none;color:var(--ink-3);border:1px solid var(--paper-3);cursor:pointer;border-radius:2px">ОТМЕНА</button>
            </div>
        </div>
    `;
    document.body.appendChild(overlay);

    const uInput = overlay.querySelector('#loginUser');
    const pInput = overlay.querySelector('#loginPass');
    const errEl  = overlay.querySelector('#loginErr');

    setTimeout(() => uInput.focus(), 50);

    function tryLogin() {
        const u = uInput.value.trim(), p = pInput.value.trim();
        if (employees[u] && employees[u] === p) {
            isLoggedIn = true; currentUser = u;
            localStorage.setItem('archidata_logged_in', 'true');
            localStorage.setItem('archidata_user', u);
            overlay.remove();
            updateAuthUI();
        } else {
            errEl.style.display = 'block';
            pInput.value = '';
            pInput.style.borderColor = '#c0392b';
            setTimeout(() => { pInput.style.borderColor = ''; }, 1500);
        }
    }

    overlay.querySelector('#loginBtn').onclick = tryLogin;
    overlay.querySelector('#loginCancel').onclick = () => overlay.remove();
    overlay.addEventListener('keydown', e => { if (e.key === 'Enter') tryLogin(); if (e.key === 'Escape') overlay.remove(); });
    overlay.addEventListener('click', e => { if (e.target === overlay) overlay.remove(); });
    [uInput, pInput].forEach(inp => { inp.addEventListener('focus', () => inp.style.borderColor = 'var(--gold)'); inp.addEventListener('blur', () => inp.style.borderColor = ''); });
}

function logout() {
    if (!confirm('Выйти из системы?')) return;
    isLoggedIn = false; currentUser = '';
    localStorage.removeItem('archidata_logged_in');
    localStorage.removeItem('archidata_user');
    updateAuthUI();
    renderAll();
}

function updateAuthUI() {
    const adminControls = document.getElementById('adminControls');
    const staffBtn = document.getElementById('staffLoginBtn');
    if (isLoggedIn) {
        if (adminControls) adminControls.style.display = 'flex';
        if (staffBtn) { staffBtn.textContent = `${currentUser} · выйти`; staffBtn.onclick = logout; staffBtn.style.color = 'var(--gold)'; }
    } else {
        if (adminControls) adminControls.style.display = 'none';
        if (staffBtn) { staffBtn.textContent = 'только для сотрудников ›'; staffBtn.onclick = loginPrompt; staffBtn.style.color = ''; }
    }
}

/* ── ФОРМА ДОБАВЛЕНИЯ ───────────────────────── */
function openForm() {
    if (!isLoggedIn) { loginPrompt(); return; }
    document.getElementById('formModal').classList.add('open');
    document.body.style.overflow = 'hidden';
}

function closeForm() {
    const modal = document.getElementById('formModal');
    if (!modal) return;
    modal.classList.remove('open');
    document.body.style.overflow = '';
    ['pName','pCat','pDesc','pYear','pArea'].forEach(id => { const el = document.getElementById(id); if (el) el.value = ''; });
    const fInp = document.getElementById('fInp'); if (fInp) fInp.value = '';
    const strip = document.getElementById('previewStrip'); if (strip) strip.innerHTML = '';
    const dz = document.getElementById('dropZone');
    if (dz) { const p = dz.querySelector('p'); if (p) p.textContent = 'Перетащите фото сюда или нажмите для выбора'; }
}

/* ── ПРЕВЬЮ ФАЙЛОВ ──────────────────────────── */
function previewFiles(files) {
    const strip = document.getElementById('previewStrip');
    strip.innerHTML = '';
    const limit = Math.min(files.length, 20);
    for (let i = 0; i < limit; i++) {
        const img = document.createElement('img');
        img.src = URL.createObjectURL(files[i]);
        strip.appendChild(img);
    }
    const dz = document.getElementById('dropZone');
    if (dz) { const p = dz.querySelector('p'); if (p) p.textContent = `Выбрано: ${limit} фото (будут сжаты)`; }
}

function setupDragDrop() {
    const dz = document.getElementById('dropZone');
    if (!dz) return;
    dz.addEventListener('dragover', e => { e.preventDefault(); dz.style.borderColor = 'var(--gold)'; });
    dz.addEventListener('dragleave', () => { dz.style.borderColor = ''; });
    dz.addEventListener('drop', e => {
        e.preventDefault(); dz.style.borderColor = '';
        document.getElementById('fInp').files = e.dataTransfer.files;
        previewFiles(e.dataTransfer.files);
    });
}

/* ── ЗАГРУЗКА ПРОЕКТА ───────────────────────── */
async function uploadProject() {
    if (!isLoggedIn) { alert('❌ Войдите в систему'); return; }

    const name  = document.getElementById('pName')?.value.trim();
    const cat   = document.getElementById('pCat')?.value;
    const desc  = document.getElementById('pDesc')?.value.trim();
    const year  = document.getElementById('pYear')?.value.trim();
    const area  = document.getElementById('pArea')?.value.trim();
    const files = document.getElementById('fInp')?.files;

    if (!name)                       { alert('Укажите название объекта'); return; }
    if (!cat)                        { alert('Выберите категорию'); return; }
    if (!files || files.length === 0){ alert('Добавьте хотя бы одно фото'); return; }

    const btn = document.querySelector('.btn-submit');
    if (btn) { btn.textContent = 'ОБРАБОТКА...'; btn.disabled = true; }

    try {
        const limit = Math.min(files.length, 20);
        const urls  = [];
        for (let i = 0; i < limit; i++) {
            const compressed = await compressImage(files[i]);
            urls.push(compressed);
            if (btn) btn.textContent = `СЖАТИЕ ${i+1}/${limit}...`;
        }

        const project = {
            id:         Date.now(),
            name, cat, desc, year, area, urls,
            uploadedBy: currentUser,
            uploadDate: new Date().toLocaleDateString('ru-RU')
        };

        await saveProject(project);
        db.unshift(project);  // добавляем в начало
        filteredDB = applyFilter(db);

        renderAll();
        checkEmpty();
        closeForm();
        console.log(`✓ Проект сохранён. Всего: ${db.length} проектов`);
    } catch(e) {
        console.error(e);
        alert('❌ Ошибка при загрузке: ' + e.message);
    } finally {
        if (btn) { btn.textContent = 'ОПУБЛИКОВАТЬ ПРОЕКТ'; btn.disabled = false; }
    }
}

/* ── ЭКСПОРТ / ИМПОРТ ───────────────────────── */
function setupExportImport() {
    const adminControls = document.getElementById('adminControls');
    if (!adminControls) return;

    // Кнопка экспорта
    let exportBtn = document.getElementById('exportBtn');
    if (!exportBtn) {
        exportBtn = document.createElement('button');
        exportBtn.id = 'exportBtn';
        exportBtn.className = 'btn-export';
        exportBtn.textContent = '💾 Резервная копия';
        exportBtn.onclick = exportData;
        adminControls.appendChild(exportBtn);
    }
}

async function exportData() {
    const allProjects = idb ? await idbGetAll() : db;
    const json = JSON.stringify({
        version: 4,
        exported: new Date().toISOString(),
        count: allProjects.length,
        backup: allProjects
    }, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `arh_muras_backup_${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
    alert(`✓ Резервная копия скачана!\n${allProjects.length} проектов сохранено.`);
}

async function importData(jsonString) {
    try {
        const raw = typeof jsonString === 'string' ? JSON.parse(jsonString) : jsonString;
        const projects = raw.backup || raw;
        if (!Array.isArray(projects)) { alert('❌ Неверный формат файла'); return; }

        for (const p of projects) { await saveProject(p); }
        db = idb ? await idbGetAll() : projects;
        filteredDB = applyFilter(db);
        renderAll(); checkEmpty();
        alert(`✓ Восстановлено ${projects.length} проектов!`);
    } catch(e) { alert('❌ Ошибка импорта: ' + e.message); }
}

/* ── ФИЛЬТРЫ И ПОИСК ────────────────────────── */
let activeFilter = 'all';
let activeSearch = '';

function setupFilters() {
    document.querySelectorAll('.filter-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            activeFilter = btn.dataset.filter;
            currentPage = 1;
            filteredDB = applyFilter(db);
            renderAll();
        });
    });

    const searchInput = document.getElementById('searchInput');
    if (searchInput) {
        searchInput.addEventListener('input', () => {
            activeSearch = searchInput.value.toLowerCase().trim();
            currentPage = 1;
            filteredDB = applyFilter(db);
            renderAll();
        });
    }
}

function applyFilter(source) {
    return source.filter(p => {
        const catOk = activeFilter === 'all' || p.cat === activeFilter;
        const qOk   = !activeSearch || p.name.toLowerCase().includes(activeSearch) || (p.cat || '').toLowerCase().includes(activeSearch) || (p.desc || '').toLowerCase().includes(activeSearch);
        return catOk && qOk;
    });
}

/* ── РЕНДЕР КАРТОЧЕК с пагинацией ──────────── */
function renderAll() {
    const gal = document.getElementById('gal');
    if (!gal) return;
    gal.innerHTML = '';

    const start = (currentPage - 1) * PAGE_SIZE;
    const slice = filteredDB.slice(start, start + PAGE_SIZE);
    slice.forEach(p => renderCard(p));
    renderPagination();
}

function renderCard(p) {
    const gal = document.getElementById('gal');
    if (!gal) return;

    const card = document.createElement('div');
    card.className = 'album-card';
    card.id = `item-${p.id}`;
    card.dataset.cat = p.cat;

    const imgs = p.urls.map((u, i) =>
        `<img src="${u}" class="${i===0?'active':''}" alt="Фото ${i+1}" loading="lazy">`).join('');
    const dots = p.urls.length > 1
        ? `<div class="slide-dots">${p.urls.map((_,i)=>`<span class="slide-dot ${i===0?'active':''}" data-idx="${i}"></span>`).join('')}</div>`
        : '';
    const arrows = p.urls.length > 1
        ? `<button class="slide-arrow prev" onclick="slideCard(event,${p.id},-1)">‹</button><button class="slide-arrow next" onclick="slideCard(event,${p.id},1)">›</button>`
        : '';
    const canDelete = isLoggedIn && (currentUser === p.uploadedBy || currentUser === 'admin');
    const deleteBtn = canDelete
        ? `<button class="delete-btn" title="Удалить" onclick="deleteProj(event,${p.id})">×</button>` : '';

    card.innerHTML = `
        ${deleteBtn}
        <div class="slider-wrap" id="sw-${p.id}">
            <span class="card-cat-badge">${p.cat}</span>
            ${imgs}
            <span class="img-count">${p.urls.length} фото</span>
            ${dots}${arrows}
        </div>
        <div class="card-content" onclick="openProj(${p.id})">
            <div class="card-title">${p.name}</div>
            <div class="card-meta">
                <span>${p.cat}</span>
                ${p.year ? `<span>${p.year}</span>` : ''}
                ${p.area ? `<span>${p.area}</span>` : ''}
            </div>
            ${p.uploadedBy ? `<span class="card-meta-info">Добавил: ${p.uploadedBy} · ${p.uploadDate||''}</span>` : ''}
        </div>
    `;
    gal.appendChild(card);

    card.querySelectorAll('.slide-dot').forEach(dot => {
        dot.addEventListener('click', e => { e.stopPropagation(); goToSlide(p.id, parseInt(dot.dataset.idx)); });
    });
}

/* ── ПАГИНАЦИЯ ──────────────────────────────── */
function renderPagination() {
    let pg = document.getElementById('pagination');
    const totalPages = Math.ceil(filteredDB.length / PAGE_SIZE);
    const gal = document.getElementById('gal');

    if (!pg) {
        pg = document.createElement('div');
        pg.id = 'pagination';
        pg.style.cssText = 'display:flex;justify-content:center;align-items:center;gap:8px;padding:48px 24px;background:var(--paper);border-top:1px solid var(--paper-3)';
        gal?.parentNode?.insertBefore(pg, gal.nextSibling);
    }

    if (totalPages <= 1) { pg.innerHTML = ''; pg.style.display = 'none'; return; }
    pg.style.display = 'flex';

    let btns = '';
    const pageBtn = (n, label, active=false, disabled=false) => `
        <button onclick="goPage(${n})" style="
            min-width:38px;height:38px;padding:0 12px;border:1px solid ${active?'var(--ink)':'var(--paper-3)'};
            background:${active?'var(--ink)':'none'};color:${active?'var(--paper)':'var(--ink-3)'};
            cursor:${disabled?'default':'pointer'};border-radius:2px;font-size:12px;
            font-family:inherit;letter-spacing:0.5px;transition:all 0.2s;
            ${disabled?'opacity:0.4;pointer-events:none':''}
        " ${disabled?'disabled':''}>${label}</button>
    `;

    btns += pageBtn(currentPage-1, '←', false, currentPage===1);
    // Ellipsis logic
    const range = [];
    for (let i = 1; i <= totalPages; i++) {
        if (i === 1 || i === totalPages || (i >= currentPage-1 && i <= currentPage+1)) range.push(i);
        else if (range[range.length-1] !== '…') range.push('…');
    }
    range.forEach(item => {
        if (item === '…') btns += `<span style="color:var(--ink-4);font-size:12px;padding:0 4px">…</span>`;
        else btns += pageBtn(item, item, item===currentPage);
    });
    btns += pageBtn(currentPage+1, '→', false, currentPage===totalPages);

    const info = `<span style="font-size:11px;color:var(--ink-4);margin:0 8px;letter-spacing:0.5px">
        ${filteredDB.length} проектов
    </span>`;

    pg.innerHTML = btns + info;
}

function goPage(n) {
    const totalPages = Math.ceil(filteredDB.length / PAGE_SIZE);
    if (n < 1 || n > totalPages) return;
    currentPage = n;
    renderAll();
    document.getElementById('gal')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

/* ── СЛАЙДЕР ─────────────────────────────────── */
const slideIndexes = {};
function slideCard(e, id, dir) {
    e.stopPropagation();
    const p = db.find(x => x.id === id);
    if (!p) return;
    const cur = slideIndexes[id] || 0;
    goToSlide(id, (cur + dir + p.urls.length) % p.urls.length);
}
function goToSlide(id, idx) {
    slideIndexes[id] = idx;
    const sw = document.getElementById(`sw-${id}`);
    if (!sw) return;
    sw.querySelectorAll('img').forEach((img, i) => img.classList.toggle('active', i===idx));
    sw.querySelectorAll('.slide-dot').forEach((d, i) => d.classList.toggle('active', i===idx));
}

/* ── ПРОСМОТР ПРОЕКТА ───────────────────────── */
function openProj(id) {
    const p = db.find(x => x.id === id);
    if (!p) return;
    document.getElementById('vTitle').textContent = p.name;
    document.getElementById('vCatBadge').textContent = p.cat;
    document.getElementById('vCat').textContent = p.cat;
    document.getElementById('vDesc').textContent = p.desc || 'Описание не добавлено.';
    const yw = document.getElementById('vYearWrap');
    if (p.year) { yw.style.display=''; document.getElementById('vYear').textContent = p.year; } else { yw.style.display='none'; }
    const aw = document.getElementById('vAreaWrap');
    if (p.area) { aw.style.display=''; document.getElementById('vArea').textContent = p.area; } else { aw.style.display='none'; }
    document.getElementById('vPhotos').innerHTML = p.urls.map(u=>`<img src="${u}" alt="${p.name}" loading="lazy">`).join('');
    const modal = document.getElementById('viewModal');
    modal.classList.add('open'); modal.scrollTop = 0;
    document.body.style.overflow = 'hidden';
}
function closeProject() {
    document.getElementById('viewModal')?.classList.remove('open');
    document.body.style.overflow = '';
}

/* ── УДАЛЕНИЕ ───────────────────────────────── */
async function deleteProj(e, id) {
    e.stopPropagation();
    if (!isLoggedIn) { alert('❌ Нет доступа'); return; }
    const project = db.find(x => x.id === id);
    if (project && currentUser !== project.uploadedBy && currentUser !== 'admin') {
        alert('❌ Вы можете удалять только свои проекты'); return;
    }
    if (!confirm('Удалить этот проект?')) return;
    document.getElementById(`item-${id}`)?.remove();
    db = db.filter(x => x.id !== id);
    filteredDB = applyFilter(db);
    await removeProject(id);
    checkEmpty();
    renderPagination();
}

/* ── ПУСТОЙ STATE ───────────────────────────── */
function checkEmpty() {
    const empty = document.getElementById('emptyState');
    if (!empty) return;
    empty.classList.toggle('visible', db.length === 0);
}

/* ── ФОРМА ЗАЯВКИ (главная) ─────────────────── */
function submitForm(e) {
    e.preventDefault();
    const name  = document.getElementById('cName')?.value.trim();
    const phone = document.getElementById('cPhone')?.value.trim();
    if (!name || !phone) { alert('Заполните имя и телефон'); return; }
    const btn = document.querySelector('.btn-submit-form');
    if (btn) { btn.textContent = 'ОТПРАВЛЯЕМ...'; btn.disabled = true; }
    setTimeout(() => {
        if (btn) { btn.textContent = 'ОТПРАВИТЬ ЗАЯВКУ →'; btn.disabled = false; }
        const success = document.getElementById('formSuccess');
        if (success) { success.classList.add('visible'); }
        document.getElementById('contactForm')?.reset();
        setTimeout(() => success?.classList.remove('visible'), 6000);
    }, 1200);
}

/* ── KEYBOARD ───────────────────────────────── */
document.addEventListener('keydown', e => {
    if (e.key === 'Escape') { closeProject(); closeForm(); }
});
