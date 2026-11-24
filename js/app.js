(function () {
  "use strict";

  const $ = (s) => document.querySelector(s);
  const fmt = (n) => n.toLocaleString("ru-RU").replace(/,/g, " ") + " " + CAFE.currency;
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const TAGS = { hit: "Хит", new: "Новинка", spicy: "Острое", veg: "Вег" };
  const CART_KEY = "aisha-cart-v1";

  // Каждому блюду — стабильный ключ
  MENU.forEach((cat) => cat.items.forEach((it, i) => { it.key = cat.id + ":" + i; it.cat = cat.id; }));
  const byKey = {};
  MENU.forEach((c) => c.items.forEach((it) => (byKey[it.key] = it)));

  let cart = {};
  try { cart = JSON.parse(localStorage.getItem(CART_KEY)) || {}; } catch (e) { cart = {}; }
  Object.keys(cart).forEach((k) => { if (!byKey[k] || byKey[k].off) delete cart[k]; });
  const saveCart = () => { try { localStorage.setItem(CART_KEY, JSON.stringify(cart)); } catch (e) {} };

  // ---------- Шапка и подвал ----------
  $("#heroMeta").textContent = [CAFE.city, CAFE.hours].filter(Boolean).join(" · ");
  $("#footer").innerHTML = `
    <p><strong style="color:var(--text)">${esc(CAFE.name)}</strong> — ${esc(CAFE.subtitle.toLowerCase())}</p>
    <p>${esc(CAFE.address)}</p>
    <p>${esc(CAFE.hours)}</p>
    <div class="footer__links">
      <a class="btn btn--ghost" href="tel:${esc(CAFE.phone.replace(/[^\d+]/g, ""))}">📞 Позвонить</a>
      <a class="btn btn--ghost" href="https://instagram.com/${esc(CAFE.instagram)}" target="_blank" rel="noopener">📷 Instagram</a>
    </div>
    <p class="footer__note">${esc(CAFE.serviceNote)}</p>`;

  // ---------- Меню ----------
  function itemHTML(it) {
    const tags = (it.tags || []).map((t) => `<span class="tag tag--${t}">${TAGS[t] || t}</span>`);
    if (it.off) tags.push(`<span class="tag tag--off">Нет в наличии</span>`);
    return `
      <article class="item${it.off ? " is-off" : ""}" data-key="${it.key}">
        ${it.img ? `<img class="item__img" src="${esc(it.img)}" alt="" loading="lazy">` : ""}
        <div class="item__body">
          <h3 class="item__name">${esc(it.name)}${tags.length ? `<span class="tags">${tags.join("")}</span>` : ""}</h3>
          ${it.desc ? `<p class="item__desc">${esc(it.desc)}</p>` : ""}
          <div class="item__foot">
            <span class="item__price">${fmt(it.price)}</span>
            ${it.weight ? `<span class="item__weight">${esc(it.weight)}</span>` : ""}
            ${it.off ? "" : `<div class="qty" data-qty="${it.key}"></div>`}
          </div>
        </div>
      </article>`;
  }

  $("#menu").innerHTML = MENU.map((cat) => `
    <section class="section" id="${cat.id}" data-cat="${cat.id}">
      <h2 class="section__title">${esc(cat.title)}</h2>
      ${cat.items.map(itemHTML).join("")}
    </section>`).join("");

  $("#tabsRow").innerHTML = MENU.map((c) =>
    `<button class="tab" data-target="${c.id}">${c.icon ? c.icon + " " : ""}${esc(c.title)}</button>`).join("");

  const sheet = $("#sheet");
  function openSheet() { sheet.hidden = false; document.body.style.overflow = "hidden"; }
  function closeSheet() { sheet.hidden = true; document.body.style.overflow = ""; }

  // ---------- Кол-во / корзина ----------
  function renderQty(key) {
    const el = document.querySelector(`[data-qty="${CSS.escape(key)}"]`);
    if (!el) return;
    const n = cart[key] || 0;
    el.innerHTML = n
      ? `<button class="qty__btn" data-dec="${key}" aria-label="Убрать">−</button><span class="qty__n">${n}</span><button class="qty__btn qty__btn--add" data-inc="${key}" aria-label="Добавить">+</button>`
      : `<button class="qty__btn qty__btn--add" data-inc="${key}" aria-label="Добавить в заказ">+</button>`;
  }

  function cartEntries() { return Object.entries(cart).filter(([, n]) => n > 0).map(([k, n]) => [byKey[k], n]); }

  function renderCart() {
    const entries = cartEntries();
    const count = entries.reduce((s, [, n]) => s + n, 0);
    const total = entries.reduce((s, [it, n]) => s + it.price * n, 0);
    $("#cartBtn").hidden = count === 0;
    $("#cartCount").textContent = count;
    $("#cartSum").textContent = fmt(total);
    $("#cartTotal").textContent = fmt(total);
    $("#cartList").innerHTML = entries.map(([it, n]) => `
      <li>
        <span class="name">${esc(it.name)}</span>
        <div class="qty"><button class="qty__btn" data-dec="${it.key}" aria-label="Убрать">−</button><span class="qty__n">${n}</span><button class="qty__btn qty__btn--add" data-inc="${it.key}" aria-label="Добавить">+</button></div>
        <span class="sum">${fmt(it.price * n)}</span>
      </li>`).join("");
    const text = `Здравствуйте! Заказ в кафе ${CAFE.name}:\n` +
      entries.map(([it, n]) => `• ${it.name} × ${n} = ${fmt(it.price * n)}`).join("\n") +
      `\nИтого: ${fmt(total)}`;
    $("#cartWa").href = `https://wa.me/${CAFE.whatsapp}?text=${encodeURIComponent(text)}`;
    if (count === 0) closeSheet();
  }

  function change(key, d) {
    cart[key] = Math.max(0, (cart[key] || 0) + d);
    if (!cart[key]) delete cart[key];
    saveCart(); renderQty(key); renderCart();
  }

  document.addEventListener("click", (e) => {
    const inc = e.target.closest("[data-inc]");
    const dec = e.target.closest("[data-dec]");
    if (inc) change(inc.dataset.inc, +1);
    if (dec) change(dec.dataset.dec, -1);
  });

  Object.keys(byKey).forEach(renderQty);
  renderCart();

  // ---------- Шторка заказа ----------
  $("#cartBtn").addEventListener("click", openSheet);
  sheet.addEventListener("click", (e) => { if (e.target.closest("[data-close]")) closeSheet(); });
  document.addEventListener("keydown", (e) => { if (e.key === "Escape") closeSheet(); });
  $("#cartClear").addEventListener("click", () => {
    const keys = Object.keys(cart); cart = {}; saveCart(); keys.forEach(renderQty); renderCart();
  });

  // ---------- Вкладки и подсветка активной категории ----------
  const tabs = [...document.querySelectorAll(".tab")];
  function setActive(id) {
    tabs.forEach((t) => {
      const on = t.dataset.target === id;
      t.classList.toggle("is-active", on);
      if (on) t.scrollIntoView({ block: "nearest", inline: "center", behavior: "smooth" });
    });
  }
  let lockUntil = 0;
  $("#tabsRow").addEventListener("click", (e) => {
    const t = e.target.closest(".tab"); if (!t) return;
    setActive(t.dataset.target);
    lockUntil = Date.now() + 800;
    document.getElementById(t.dataset.target).scrollIntoView({ behavior: "smooth" });
  });
  const io = new IntersectionObserver((entries) => {
    if (Date.now() < lockUntil) return;
    entries.forEach((en) => { if (en.isIntersecting) setActive(en.target.id); });
  }, { rootMargin: "-130px 0px -65% 0px" });
  document.querySelectorAll(".section").forEach((s) => io.observe(s));

  // ---------- Поиск ----------
  const norm = (s) => String(s || "").toLowerCase().replace(/ё/g, "е");
  $("#search").addEventListener("input", (e) => {
    const q = norm(e.target.value.trim());
    let any = false;
    document.querySelectorAll(".section").forEach((sec) => {
      let shown = 0;
      sec.querySelectorAll(".item").forEach((el) => {
        const it = byKey[el.dataset.key];
        const ok = !q || norm(it.name + " " + (it.desc || "")).includes(q);
        el.hidden = !ok; if (ok) shown++;
      });
      sec.hidden = shown === 0; if (shown) any = true;
    });
    $("#empty").hidden = any;
    $("#tabsRow").hidden = !!q;
  });
})();
