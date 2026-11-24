/*
 * Админка меню Aisha.
 * Меню хранится в data/menu.json в GitHub-репозитории сайта.
 * Админка читает этот файл через GitHub API и сохраняет изменения
 * (вместе с новыми фото) одним коммитом. GitHub Pages сам пересобирает сайт.
 */
(function () {
  "use strict";

  const $ = (s) => document.querySelector(s);
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const fmt = (n) => Number(n || 0).toLocaleString("ru-RU").replace(/,/g, " ") + " ₸";
  const MENU_PATH = "data/menu.json";
  const store = {
    get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } },
    set(k, v) { try { localStorage.setItem(k, v); } catch (e) {} },
    del(k) { try { localStorage.removeItem(k); } catch (e) {} }
  };

  const S = {
    token: "", repo: "", branch: "main", demo: false,
    data: null, loadedText: "", dirty: false,
    pending: {},   // новые фото: путь → base64
    previews: {},  // новые фото: путь → dataURL для показа
    open: new Set(), view: "menu", edit: null, saving: false
  };

  // ---------- GitHub ----------
  const seg = (s) => s.split("/").map(encodeURIComponent).join("/");
  async function gh(path, opts = {}) {
    const res = await fetch("https://api.github.com" + path, {
      method: opts.method || "GET",
      cache: "no-store",
      headers: {
        Authorization: "Bearer " + S.token,
        Accept: opts.raw ? "application/vnd.github.raw+json" : "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
        ...(opts.body ? { "Content-Type": "application/json" } : {})
      },
      body: opts.body ? JSON.stringify(opts.body) : undefined
    });
    if (!res.ok) {
      const msg = {
        401: "Ключ доступа не подходит или истёк.",
        403: "У ключа нет прав на запись. Нужно право Contents: Read and write.",
        404: "Не найдены репозиторий, ветка или файл меню. Проверьте настройки входа.",
        409: "Сайт изменился во время сохранения. Обновите страницу.",
        422: "Сайт изменился во время сохранения. Обновите страницу."
      }[res.status] || "Ошибка GitHub (" + res.status + ").";
      const err = new Error(msg); err.status = res.status; throw err;
    }
    return opts.raw ? res.text() : res.json();
  }
  const readMenu = () => gh(`/repos/${seg(S.repo)}/contents/${MENU_PATH}?ref=${encodeURIComponent(S.branch)}`, { raw: true });

  async function commitFiles(files, message) {
    const r = `/repos/${seg(S.repo)}`;
    const ref = await gh(`${r}/git/ref/heads/${seg(S.branch)}`);
    const head = ref.object.sha;
    const base = await gh(`${r}/git/commits/${head}`);
    const tree = [];
    for (const f of files) {
      const blob = await gh(`${r}/git/blobs`, { method: "POST", body: { content: f.content, encoding: "base64" } });
      tree.push({ path: f.path, mode: "100644", type: "blob", sha: blob.sha });
    }
    const newTree = await gh(`${r}/git/trees`, { method: "POST", body: { base_tree: base.tree.sha, tree } });
    const commit = await gh(`${r}/git/commits`, { method: "POST", body: { message, tree: newTree.sha, parents: [head] } });
    await gh(`${r}/git/refs/heads/${seg(S.branch)}`, { method: "PATCH", body: { sha: commit.sha } });
  }

  function b64bytes(bytes) {
    let s = "";
    for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
    return btoa(s);
  }
  const b64text = (t) => b64bytes(new TextEncoder().encode(t));
  const toText = () => JSON.stringify(S.data, null, 1) + "\n";

  // ---------- Вход ----------
  function guessRepo() {
    const h = location.hostname;
    if (!h.endsWith(".github.io")) return "";
    const owner = h.split(".")[0];
    const first = location.pathname.split("/")[1];
    return owner + "/" + (first && !first.includes(".") ? first : h);
  }

  function showLogin(err) {
    $("#app").hidden = true;
    $("#login").hidden = false;
    $("#fRepo").value = S.repo || guessRepo();
    $("#fBranch").value = S.branch || "main";
    $("#loginError").hidden = !err;
    $("#loginError").textContent = err || "";
  }

  async function connect() {
    const btn = $("#loginBtn");
    btn.disabled = true; btn.textContent = "Загрузка…";
    try {
      const text = await readMenu();
      S.data = JSON.parse(text);
      S.loadedText = text;
      S.demo = false;
      start();
    } catch (e) {
      showLogin(e.message || "Не удалось загрузить меню.");
    } finally {
      btn.disabled = false; btn.textContent = "Войти";
    }
  }

  async function startDemo() {
    try {
      const res = await fetch(MENU_PATH, { cache: "no-cache" });
      const text = await res.text();
      S.data = JSON.parse(text);
      S.loadedText = text;
      S.demo = true;
      start();
    } catch (e) {
      showLogin("Не удалось открыть демо.");
    }
  }

  function start() {
    $("#login").hidden = true;
    $("#app").hidden = false;
    $("#repoLabel").textContent = S.demo ? "Демо — изменения не сохраняются" : S.repo + " · " + S.branch;
    S.dirty = false; S.pending = {}; S.previews = {};
    renderAll();
  }

  // ---------- Отрисовка ----------
  const cats = () => S.data.categories;
  const priceText = (it) => it.variants && it.variants.length
    ? it.variants.map((v) => `${v.label}: ${fmt(v.price)}`).join(" · ")
    : fmt(it.price);
  const imgSrc = (p) => S.previews[p] || p;

  function renderAll() { renderMenu(); renderStop(); renderCafe(); renderSave(); setView(S.view); }

  function setView(v) {
    S.view = v;
    document.querySelectorAll(".segmented button").forEach((b) => b.setAttribute("aria-selected", b.dataset.view === v));
    $("#viewMenu").hidden = v !== "menu";
    $("#viewStop").hidden = v !== "stop";
    $("#viewCafe").hidden = v !== "cafe";
  }

  function renderMenu() {
    const list = cats();
    $("#viewMenu").innerHTML = list.map((c, ci) => {
      const open = S.open.has(c.id);
      return `
      <div class="cat${open ? " is-open" : ""}">
        <button class="cat__head" data-act="toggle-cat" data-ci="${ci}" aria-expanded="${open}">
          <span>${esc(c.icon || "•")}</span>
          <span class="t">${esc(c.title || "Без названия")}<small>${esc(c.kz || "")}</small></span>
          <span class="n">${c.items.length}</span>
          <span class="chev">›</span>
        </button>
        ${open ? `
        <div class="cat__body">
          <div class="row2">
            <label class="field"><span>Название раздела (рус)</span><input data-cat="${ci}" data-k="title" value="${esc(c.title)}"></label>
            <label class="field"><span>Бөлім атауы (қаз)</span><input data-cat="${ci}" data-k="kz" value="${esc(c.kz)}"></label>
          </div>
          <div class="field"><span>Фото на заголовке раздела</span>
            <div class="photo">
              ${c.img ? `<img class="photo--wide" src="${esc(imgSrc(c.img))}" alt="">` : ""}
              <div class="photo__btns">
                <label class="btn btn--ghost btn--sm">${c.img ? "Заменить фото" : "Загрузить фото"}<input type="file" accept="image/*" data-cat-photo="${ci}" hidden></label>
                ${c.img ? `<button class="btn btn--danger btn--sm" data-act="del-cat-photo" data-ci="${ci}">Убрать фото</button>` : ""}
              </div>
            </div>
          </div>
          <ul class="ilist">
            ${c.items.map((it, ii) => `
            <li class="irow${it.off ? " is-off" : ""}">
              ${it.img ? `<img class="irow__img" src="${esc(imgSrc(it.img))}" alt="">` : ""}
              <div class="irow__main">
                <div class="irow__name">${esc(it.name || "Без названия")}</div>
                <div class="irow__price">${esc(priceText(it))}${it.off ? " · нет в наличии" : ""}</div>
              </div>
              <div class="irow__btns">
                <button class="mini" data-act="item-up" data-ci="${ci}" data-ii="${ii}" aria-label="Выше" ${ii === 0 ? "disabled" : ""}>↑</button>
                <button class="mini" data-act="item-down" data-ci="${ci}" data-ii="${ii}" aria-label="Ниже" ${ii === c.items.length - 1 ? "disabled" : ""}>↓</button>
                <button class="mini" data-act="edit" data-ci="${ci}" data-ii="${ii}" aria-label="Изменить">✎</button>
              </div>
            </li>`).join("")}
          </ul>
          <button class="btn btn--gold" data-act="add-item" data-ci="${ci}">+ Добавить блюдо</button>
          <div class="cat__tools">
            <button class="btn btn--ghost btn--sm" data-act="cat-up" data-ci="${ci}" ${ci === 0 ? "disabled" : ""}>↑ Раздел выше</button>
            <button class="btn btn--ghost btn--sm" data-act="cat-down" data-ci="${ci}" ${ci === list.length - 1 ? "disabled" : ""}>↓ Раздел ниже</button>
            <button class="btn btn--danger btn--sm" data-act="del-cat" data-ci="${ci}">Удалить раздел</button>
          </div>
        </div>` : ""}
      </div>`;
    }).join("") + `<button class="btn btn--ghost btn--block" data-act="add-cat">+ Добавить раздел</button>`;
  }

  function renderStop() {
    const q = ($("#stopSearch").value || "").trim().toLowerCase().replace(/ё/g, "е");
    $("#stopList").innerHTML = cats().map((c, ci) => {
      const rows = c.items.map((it, ii) => ({ it, ii }))
        .filter(({ it }) => !q || [it.name, it.kz].join(" ").toLowerCase().replace(/ё/g, "е").includes(q));
      if (!rows.length) return "";
      return `<h3 class="stop-cat">${esc(c.title)}</h3>` + rows.map(({ it, ii }) => `
        <div class="srow${it.off ? " is-off" : ""}">
          <div class="srow__name">${esc(it.name)}<div class="srow__state">${it.off ? "Нет в наличии" : "В наличии"}</div></div>
          <label class="switch"><input type="checkbox" data-stop="${ci}:${ii}" ${it.off ? "" : "checked"} aria-label="${esc(it.name)} — в наличии"><span></span></label>
        </div>`).join("");
    }).join("") || `<p class="muted">Ничего не найдено</p>`;
  }

  const CAFE_FIELDS = [
    ["address", "Адрес (рус)"], ["addressKz", "Мекенжай (қаз)"],
    ["phone", "Телефон (как показывать)"], ["whatsapp", "WhatsApp — только цифры, начиная с 7"],
    ["hours", "Часы работы (рус)"], ["hoursKz", "Жұмыс уақыты (қаз)"],
    ["city", "Город (рус)"], ["cityKz", "Қала (қаз)"],
    ["instagram", "Instagram (без @)"]
  ];
  function renderCafe() {
    const c = S.data.cafe || (S.data.cafe = {});
    $("#viewCafe").innerHTML = `<div class="card form">
      <div class="inline-toggle">
        <span>Принимаем заказы на доставку<br><small class="muted">цену доставки гость уточняет в WhatsApp</small></span>
        <label class="switch"><input type="checkbox" data-cafe-bool="delivery" ${c.delivery ? "checked" : ""} aria-label="Доставка"><span></span></label>
      </div>` + CAFE_FIELDS.map(([k, label]) => `
      <label class="field"><span>${label}</span><input data-cafe="${k}" value="${esc(c[k])}" ${k === "whatsapp" ? 'inputmode="numeric"' : ""}></label>`).join("") +
      `<p class="muted small">Пустые поля на сайте не показываются.</p></div>`;
  }

  function renderSave() {
    const n = Object.keys(S.pending).length;
    $("#saveStatus").textContent = S.saving ? "Сохраняем…" : S.dirty ? "Есть несохранённые изменения" + (n ? ` · фото: ${n}` : "") : "Все изменения сохранены";
    $(".savebar").classList.toggle("is-dirty", S.dirty);
    $("#saveBtn").disabled = !S.dirty || S.saving;
    $("#saveBtn").textContent = S.demo ? "Скачать файл" : "Сохранить";
  }

  function dirty() { S.dirty = true; renderSave(); }

  let toastTimer;
  function toast(msg, isError) {
    const el = $("#toast");
    el.textContent = msg; el.hidden = false;
    el.classList.toggle("is-error", !!isError);
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => (el.hidden = true), isError ? 6000 : 3500);
  }

  // ---------- Редактор блюда ----------
  const TAGS = [["hit", "Хит"], ["new", "Новинка"], ["spicy", "Острое"], ["veg", "Вегетарианское"]];

  function openEditor(ci, ii) {
    S.edit = { ci, ii };
    renderEditor();
    $("#editor").hidden = false;
    document.body.style.overflow = "hidden";
  }
  function closeEditor() {
    if (!S.edit) return;
    S.edit = null;
    $("#editor").hidden = true;
    document.body.style.overflow = "";
    renderMenu(); renderStop();
  }

  function renderEditor() {
    const { ci, ii } = S.edit;
    const it = cats()[ci].items[ii];
    const hasVars = !!(it.variants && it.variants.length);
    $("#edTitle").textContent = it.name || "Новое блюдо";
    $("#edBody").innerHTML = `
      <div class="row2">
        <label class="field"><span>Название (рус)</span><input id="edName" data-f="name" value="${esc(it.name)}"></label>
        <label class="field"><span>Атауы (қаз)</span><input data-f="kz" value="${esc(it.kz)}"></label>
      </div>
      <div class="row2">
        <label class="field"><span>Состав / описание (рус)</span><textarea data-f="desc" rows="2">${esc(it.desc)}</textarea></label>
        <label class="field"><span>Құрамы (қаз)</span><textarea data-f="descKz" rows="2">${esc(it.descKz)}</textarea></label>
      </div>

      <div class="inline-toggle card">
        <span>Несколько размеров с разной ценой<br><small class="muted">например 1 л / 1,5 л</small></span>
        <label class="switch"><input type="checkbox" data-act="toggle-vars" ${hasVars ? "checked" : ""} aria-label="Несколько размеров"><span></span></label>
      </div>
      ${hasVars ? `
        <div class="form">
          ${it.variants.map((v, vi) => `
          <div class="vrow">
            <label class="field"><span>Размер</span><input data-v="${vi}" data-k="label" value="${esc(v.label)}"></label>
            <label class="field"><span>Цена, ₸</span><input data-v="${vi}" data-k="price" type="number" inputmode="numeric" min="0" step="10" value="${esc(v.price)}"></label>
            <button class="mini" data-act="del-var" data-vi="${vi}" aria-label="Удалить размер" ${it.variants.length < 2 ? "disabled" : ""}>✕</button>
          </div>`).join("")}
          <button class="btn btn--ghost btn--sm" data-act="add-var">+ Размер</button>
        </div>` : `
        <div class="row2">
          <label class="field"><span>Цена, ₸</span><input data-f="price" type="number" inputmode="numeric" min="0" step="10" value="${esc(it.price)}"></label>
          <label class="field"><span>Выход / кол-во (необязательно)</span><input data-f="weight" value="${esc(it.weight)}" placeholder="например, 8 шт"></label>
        </div>`}

      <div class="field"><span>Метки</span>
        <div class="checks">${TAGS.map(([k, l]) => `
          <label class="chip"><input type="checkbox" data-tag="${k}" ${(it.tags || []).includes(k) ? "checked" : ""}>${l}</label>`).join("")}
        </div>
      </div>

      <div class="field"><span>Фото</span>
        <div class="photo">
          ${it.img ? `<img src="${esc(imgSrc(it.img))}" alt="">` : ""}
          <div class="photo__btns">
            <label class="btn btn--ghost btn--sm">${it.img ? "Заменить фото" : "Загрузить фото"}<input type="file" accept="image/*" data-photo hidden></label>
            ${it.img ? `<button class="btn btn--danger btn--sm" data-act="del-photo">Убрать фото</button>` : ""}
          </div>
        </div>
      </div>

      <div class="inline-toggle card">
        <span>В наличии</span>
        <label class="switch"><input type="checkbox" data-act="toggle-off" ${it.off ? "" : "checked"} aria-label="В наличии"><span></span></label>
      </div>

      <label class="field"><span>Раздел</span>
        <select data-act="move-cat">${cats().map((c, i) => `<option value="${i}" ${i === ci ? "selected" : ""}>${esc(c.title)}</option>`).join("")}</select>
      </label>

      <div class="editor__foot">
        <button class="btn btn--danger" data-act="del-item">Удалить блюдо</button>
        <button class="btn btn--gold" data-close-editor>Готово</button>
      </div>`;
  }

  async function loadPhoto(file) {
    const url = URL.createObjectURL(file);
    try {
      const img = new Image();
      img.src = url;
      await img.decode();
      const max = 1000, k = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight));
      const cv = document.createElement("canvas");
      cv.width = Math.round(img.naturalWidth * k); cv.height = Math.round(img.naturalHeight * k);
      cv.getContext("2d").drawImage(img, 0, 0, cv.width, cv.height);
      const dataURL = cv.toDataURL("image/jpeg", 0.82);
      return { dataURL, b64: dataURL.split(",")[1] };
    } finally { URL.revokeObjectURL(url); }
  }

  // ---------- Действия ----------
  const newId = (p) => p + Date.now().toString(36) + Math.random().toString(36).slice(2, 5);
  const move = (arr, i, d) => { const j = i + d; if (j < 0 || j >= arr.length) return; [arr[i], arr[j]] = [arr[j], arr[i]]; };
  let armed = null;
  function confirmTwice(btn, label) {
    if (armed === btn) { armed = null; return true; }
    if (armed) { armed.classList.remove("is-armed"); armed.textContent = armed.dataset.orig; }
    armed = btn; btn.dataset.orig = btn.textContent; btn.textContent = label; btn.classList.add("is-armed");
    setTimeout(() => { if (armed === btn) { armed = null; btn.classList.remove("is-armed"); btn.textContent = btn.dataset.orig; } }, 4000);
    return false;
  }

  document.addEventListener("click", (e) => {
    const tab = e.target.closest(".segmented button");
    if (tab) return setView(tab.dataset.view);
    if (e.target.closest("[data-close-editor]")) return closeEditor();

    const b = e.target.closest("[data-act]");
    if (!b || b.tagName === "INPUT" || b.tagName === "SELECT") return;
    const act = b.dataset.act, ci = +b.dataset.ci, ii = +b.dataset.ii;
    const list = cats();

    switch (act) {
      case "toggle-cat": {
        const id = list[ci].id;
        S.open.has(id) ? S.open.delete(id) : S.open.add(id);
        return renderMenu();
      }
      case "item-up": move(list[ci].items, ii, -1); dirty(); return renderMenu();
      case "item-down": move(list[ci].items, ii, +1); dirty(); return renderMenu();
      case "cat-up": move(list, ci, -1); dirty(); return renderMenu();
      case "cat-down": move(list, ci, +1); dirty(); return renderMenu();
      case "edit": return openEditor(ci, ii);
      case "add-item": {
        list[ci].items.push({ id: newId("d"), name: "", kz: "", price: 0 });
        dirty(); renderMenu(); openEditor(ci, list[ci].items.length - 1);
        return $("#edName").focus();
      }
      case "add-cat": {
        const c = { id: newId("c"), title: "Новый раздел", kz: "Жаңа бөлім", icon: "🍽️", items: [] };
        list.push(c); S.open.add(c.id); dirty(); renderMenu();
        return document.querySelector(`[data-cat="${list.length - 1}"][data-k="title"]`).select();
      }
      case "del-cat-photo": {
        const c = list[ci];
        delete S.pending[c.img]; delete S.previews[c.img]; delete c.img;
        dirty(); return renderMenu();
      }
      case "del-cat": {
        if (!confirmTwice(b, list[ci].items.length ? `Удалить вместе с ${list[ci].items.length} блюдами?` : "Точно удалить?")) return;
        list.splice(ci, 1); dirty(); renderMenu(); renderStop(); return toast("Раздел удалён");
      }
    }

    if (!S.edit) return;
    const it = list[S.edit.ci].items[S.edit.ii];
    switch (act) {
      case "add-var": it.variants.push({ label: "", price: 0 }); break;
      case "del-var": it.variants.splice(+b.dataset.vi, 1); break;
      case "del-photo":
        delete S.pending[it.img]; delete S.previews[it.img]; delete it.img; break;
      case "del-item": {
        if (!confirmTwice(b, "Точно удалить?")) return;
        if (it.img) { delete S.pending[it.img]; delete S.previews[it.img]; }
        list[S.edit.ci].items.splice(S.edit.ii, 1); dirty(); closeEditor(); return toast("Блюдо удалено");
      }
      default: return;
    }
    dirty(); renderEditor();
  });

  document.addEventListener("input", (e) => {
    const el = e.target;
    if (el.id === "stopSearch") return renderStop();
    if (el.dataset.cat !== undefined) { cats()[+el.dataset.cat][el.dataset.k] = el.value; return dirty(); }
    if (el.dataset.cafe) { S.data.cafe[el.dataset.cafe] = el.dataset.cafe === "whatsapp" ? el.value.replace(/\D/g, "") : el.value; return dirty(); }
    if (!S.edit) return;
    const it = cats()[S.edit.ci].items[S.edit.ii];
    if (el.dataset.f) {
      const k = el.dataset.f;
      if (k === "price") it.price = Math.max(0, Math.round(+el.value || 0));
      else if (el.value.trim()) it[k] = el.value;
      else delete it[k];
      if (k === "name") $("#edTitle").textContent = el.value || "Новое блюдо";
      if (k === "name" && !el.value.trim()) it.name = "";
      return dirty();
    }
    if (el.dataset.v !== undefined) {
      const v = it.variants[+el.dataset.v];
      v[el.dataset.k] = el.dataset.k === "price" ? Math.max(0, Math.round(+el.value || 0)) : el.value;
      return dirty();
    }
  });

  document.addEventListener("change", async (e) => {
    const el = e.target;
    if (el.dataset.cat !== undefined) return renderMenu();
    if (el.dataset.catPhoto !== undefined && el.files && el.files[0]) {
      const c = cats()[+el.dataset.catPhoto];
      try {
        const { dataURL, b64 } = await loadPhoto(el.files[0]);
        if (c.img && S.pending[c.img]) { delete S.pending[c.img]; delete S.previews[c.img]; }
        const path = `img/sections/${c.id}-${Date.now().toString(36)}.jpg`;
        S.pending[path] = b64; S.previews[path] = dataURL; c.img = path;
      } catch (err) { return toast("Не удалось прочитать фото. Попробуйте JPG или PNG.", true); }
      dirty(); return renderMenu();
    }
    if (el.dataset.cafeBool) { S.data.cafe[el.dataset.cafeBool] = el.checked; return dirty(); }
    if (el.dataset.stop) {
      const [ci, ii] = el.dataset.stop.split(":").map(Number);
      const it = cats()[ci].items[ii];
      if (el.checked) delete it.off; else it.off = true;
      dirty(); renderStop(); return renderMenu();
    }
    if (!S.edit) return;
    const { ci, ii } = S.edit;
    const it = cats()[ci].items[ii];
    if (el.dataset.tag) {
      const tags = new Set(it.tags || []);
      el.checked ? tags.add(el.dataset.tag) : tags.delete(el.dataset.tag);
      if (tags.size) it.tags = [...tags]; else delete it.tags;
      return dirty();
    }
    switch (el.dataset.act) {
      case "toggle-off": if (el.checked) delete it.off; else it.off = true; break;
      case "toggle-vars":
        if (el.checked) { it.variants = [{ label: it.weight || "", price: it.price || 0 }, { label: "", price: 0 }]; delete it.price; delete it.weight; }
        else { it.price = it.variants && it.variants[0] ? it.variants[0].price : 0; delete it.variants; }
        break;
      case "move-cat": {
        const to = +el.value; if (to === ci) return;
        cats()[ci].items.splice(ii, 1);
        cats()[to].items.push(it);
        S.edit = { ci: to, ii: cats()[to].items.length - 1 };
        S.open.add(cats()[to].id);
        toast("Перенесено в «" + cats()[to].title + "»");
        break;
      }
      default:
        if (el.dataset.photo !== undefined && el.files && el.files[0]) {
          try {
            const { dataURL, b64 } = await loadPhoto(el.files[0]);
            if (it.img && S.pending[it.img]) { delete S.pending[it.img]; delete S.previews[it.img]; }
            const path = `img/dishes/${it.id}-${Date.now().toString(36)}.jpg`;
            S.pending[path] = b64; S.previews[path] = dataURL; it.img = path;
          } catch (err) { return toast("Не удалось прочитать фото. Попробуйте JPG или PNG.", true); }
          break;
        }
        return;
    }
    dirty(); renderEditor();
  });

  // ---------- Сохранение ----------
  function validate() {
    for (const c of cats()) {
      if (!String(c.title || "").trim()) return "У одного из разделов нет названия.";
      for (const it of c.items) {
        if (!String(it.name || "").trim()) return `В разделе «${c.title}» есть блюдо без названия.`;
        if (it.variants && it.variants.some((v) => !String(v.label || "").trim())) return `У блюда «${it.name}» не указан размер.`;
      }
    }
    return "";
  }

  async function save() {
    const problem = validate();
    if (problem) return toast(problem, true);
    const text = toText();

    if (S.demo) {
      const a = document.createElement("a");
      a.href = URL.createObjectURL(new Blob([text], { type: "application/json" }));
      a.download = "menu.json"; a.click();
      return toast("Демо: файл menu.json скачан. Чтобы сохранять на сайт, войдите с ключом.");
    }

    S.saving = true; renderSave();
    try {
      const remote = await readMenu();
      if (remote !== S.loadedText) throw new Error("Меню уже изменили в другом окне или на другом телефоне. Скопируйте свои правки, обновите страницу и внесите их заново.");
      const files = [{ path: MENU_PATH, content: b64text(text) }]
        .concat(Object.entries(S.pending).map(([path, content]) => ({ path, content })));
      await commitFiles(files, "Меню: изменения из админки");
      S.loadedText = text; S.pending = {}; S.dirty = false;
      toast("Сохранено! Сайт обновится через 1–2 минуты.");
    } catch (e) {
      toast(e.message || "Не удалось сохранить.", true);
    } finally {
      S.saving = false; renderSave();
    }
  }

  // ---------- Запуск ----------
  $("#saveBtn").addEventListener("click", save);
  $("#loginForm").addEventListener("submit", (e) => {
    e.preventDefault();
    S.token = $("#fToken").value.trim();
    S.repo = $("#fRepo").value.trim().replace(/^https?:\/\/github\.com\//, "").replace(/\/+$/, "");
    S.branch = $("#fBranch").value.trim() || "main";
    store.set("aisha-admin", JSON.stringify({ token: S.token, repo: S.repo, branch: S.branch }));
    connect();
  });
  $("#demoBtn").addEventListener("click", startDemo);
  $("#logoutBtn").addEventListener("click", () => {
    if (S.dirty && !confirmTwice($("#logoutBtn"), "Есть несохранённое — выйти?")) return;
    store.del("aisha-admin");
    S.token = ""; S.data = null;
    showLogin();
  });
  document.addEventListener("keydown", (e) => { if (e.key === "Escape") closeEditor(); });
  window.addEventListener("beforeunload", (e) => { if (S.dirty) { e.preventDefault(); e.returnValue = ""; } });

  try {
    const saved = JSON.parse(store.get("aisha-admin") || "null");
    if (saved) Object.assign(S, { token: saved.token || "", repo: saved.repo || "", branch: saved.branch || "main" });
  } catch (e) {}
  if (S.token && S.repo) { showLogin(); $("#login").hidden = true; connect(); }
  else showLogin();
})();
