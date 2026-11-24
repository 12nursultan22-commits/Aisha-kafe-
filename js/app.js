(function () {
  "use strict";

  const $ = (s) => document.querySelector(s);
  const fmt = (n) => n.toLocaleString("ru-RU").replace(/,/g, " ") + " " + CAFE.currency;
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const TAGS = { hit: "Хит", new: "Новинка", spicy: "Острое", veg: "Вег" };
  const CART_KEY = "aisha-cart-v2";

  // items — блюда (для поиска), prods — позиции, которые можно добавить в заказ
  const items = {};
  const prods = {};
  MENU.forEach((cat) => cat.items.forEach((it, i) => {
    it.key = cat.id + ":" + i;
    items[it.key] = it;
    if (it.variants) {
      it.variants.forEach((v, vi) => {
        v.key = it.key + "/" + vi;
        prods[v.key] = { name: it.name + " (" + v.label + ")", price: v.price, off: it.off };
      });
    } else {
      prods[it.key] = { name: it.name + (it.weight ? " (" + it.weight + ")" : ""), price: it.price, off: it.off };
    }
  }));

  let cart = {};
  try { cart = JSON.parse(localStorage.getItem(CART_KEY)) || {}; } catch (e) { cart = {}; }
  Object.keys(cart).forEach((k) => { if (!prods[k] || prods[k].off) delete cart[k]; });
  const saveCart = () => { try { localStorage.setItem(CART_KEY, JSON.stringify(cart)); } catch (e) {} };

  // ---------- Шапка и подвал ----------
  $("#heroMeta").textContent = [CAFE.city, CAFE.hours].filter(Boolean).join(" · ");
  const links = [];
  if (CAFE.phone) links.push(`<a class="btn btn--ghost" href="tel:${esc(CAFE.phone.replace(/[^\d+]/g, ""))}">📞 Позвонить</a>`);
  if (CAFE.whatsapp) links.push(`<a class="btn btn--ghost" href="https://wa.me/${esc(CAFE.whatsapp)}" target="_blank" rel="noopener">💬 WhatsApp</a>`);
  if (CAFE.instagram) links.push(`<a class="btn btn--ghost" href="https://instagram.com/${esc(CAFE.instagram)}" target="_blank" rel="noopener">📷 Instagram</a>`);
  $("#footer").innerHTML = `
    <p><strong style="color:var(--text)">${esc(CAFE.name)}</strong> — ${esc(CAFE.subtitle.toLowerCase())}</p>
    ${CAFE.address ? `<p>${esc(CAFE.address)}</p>` : ""}
    ${CAFE.hours ? `<p>${esc(CAFE.hours)}</p>` : ""}
    ${links.length ? `<div class="footer__links">${links.join("")}</div>` : ""}
    <p class="footer__note">${esc(CAFE.serviceNote)}</p>`;

  // ---------- Меню ----------
  const qtySlot = (key, off) => (off ? "" : `<div class="qty" data-qty="${key}"></div>`);

  function itemHTML(it) {
    const tags = (it.tags || []).map((t) => `<span class="tag tag--${t}">${TAGS[t] || t}</span>`);
    if (it.off) tags.push(`<span class="tag tag--off">Нет в наличии</span>`);
    const foot = it.variants
      ? `<div class="vars">${it.variants.map((v) => `
          <div class="var">
            <span class="var__label">${esc(v.label)}</span>
            <span class="item__price">${fmt(v.price)}</span>
            ${qtySlot(v.key, it.off)}
          </div>`).join("")}</div>`
      : `<div class="item__foot">
          <span class="item__price">${fmt(it.price)}</span>
          ${it.weight ? `<span class="item__weight">${esc(it.weight)}</span>` : ""}
          ${qtySlot(it.key, it.off)}
        </div>`;
    return `
      <article class="item${it.off ? " is-off" : ""}" data-key="${it.key}">
        ${it.img ? `<img class="item__img" src="${esc(it.img)}" alt="" loading="lazy">` : ""}
        <div class="item__body">
          <h3 class="item__name">${esc(it.name)}${tags.length ? `<span class="tags">${tags.join("")}</span>` : ""}</h3>
          ${it.kz ? `<p class="item__kz">${esc(it.kz)}</p>` : ""}
          ${it.desc ? `<p class="item__desc">${esc(it.desc)}</p>` : ""}
          ${foot}
        </div>
      </article>`;
  }

  $("#menu").innerHTML = MENU.map((cat) => `
    <section class="section" id="${cat.id}">
      <h2 class="section__title"><span>${esc(cat.title)}${cat.kz ? `<small>${esc(cat.kz)}</small>` : ""}</span></h2>
      ${cat.items.map(itemHTML).join("")}
    </section>`).join("");

  $("#tabsRow").innerHTML = MENU.map((c) =>
    `<button class="tab" data-target="${c.id}">${c.icon ? c.icon + " " : ""}${esc(c.title)}</button>`).join("");

  // ---------- Шторка заказа ----------
  const sheet = $("#sheet");
  function openSheet() { sheet.hidden = false; document.body.style.overflow = "hidden"; }
  function closeSheet() { sheet.hidden = true; document.body.style.overflow = ""; }

  // ---------- Кол-во / корзина ----------
  const qtyBtns = (key, n) => n
    ? `<button class="qty__btn" data-dec="${key}" aria-label="Убрать">−</button><span class="qty__n">${n}</span><button class="qty__btn qty__btn--add" data-inc="${key}" aria-label="Добавить">+</button>`
    : `<button class="qty__btn qty__btn--add" data-inc="${key}" aria-label="Добавить в заказ">+</button>`;

  function renderQty(key) {
    const el = document.querySelector(`[data-qty="${CSS.escape(key)}"]`);
    if (el) el.innerHTML = qtyBtns(key, cart[key] || 0);
  }

  const cartEntries = () => Object.entries(cart).filter(([, n]) => n > 0).map(([k, n]) => [k, prods[k], n]);

  function renderCart() {
    const entries = cartEntries();
    const count = entries.reduce((s, [, , n]) => s + n, 0);
    const total = entries.reduce((s, [, p, n]) => s + p.price * n, 0);
    $("#cartBtn").hidden = count === 0;
    $("#cartCount").textContent = count;
    $("#cartSum").textContent = fmt(total);
    $("#cartTotal").textContent = fmt(total);
    $("#cartList").innerHTML = entries.map(([k, p, n]) => `
      <li>
        <span class="name">${esc(p.name)}</span>
        <div class="qty">${qtyBtns(k, n)}</div>
        <span class="sum">${fmt(p.price * n)}</span>
      </li>`).join("");
    const wa = $("#cartWa");
    if (CAFE.whatsapp) {
      const text = `Здравствуйте! Заказ в кафе ${CAFE.name}:\n` +
        entries.map(([, p, n]) => `• ${p.name} × ${n} = ${fmt(p.price * n)}`).join("\n") +
        `\nИтого: ${fmt(total)}`;
      wa.href = `https://wa.me/${CAFE.whatsapp}?text=${encodeURIComponent(text)}`;
    }
    wa.hidden = !CAFE.whatsapp;
    $(".sheet__hint").textContent = CAFE.whatsapp
      ? "Покажите этот список официанту или отправьте заказ в WhatsApp."
      : "Покажите этот список официанту.";
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

  Object.keys(prods).forEach(renderQty);
  renderCart();

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
      if (on) { const row = t.parentElement; row.scrollTo({ left: t.offsetLeft - (row.clientWidth - t.offsetWidth) / 2, behavior: "smooth" }); }
    });
  }
  let lockUntil = 0;
  $("#tabsRow").addEventListener("click", (e) => {
    const t = e.target.closest(".tab"); if (!t) return;
    setActive(t.dataset.target);
    lockUntil = Date.now() + 1500;
    const sec = document.getElementById(t.dataset.target);
    const y = sec.getBoundingClientRect().top + window.scrollY - $("#tabs").offsetHeight - 4;
    window.scrollTo({ top: y, behavior: "smooth" });
  });
  const io = new IntersectionObserver((entries) => {
    if (Date.now() < lockUntil) return;
    entries.forEach((en) => { if (en.isIntersecting) setActive(en.target.id); });
  }, { rootMargin: "-130px 0px -65% 0px" });
  document.querySelectorAll(".section").forEach((s) => io.observe(s));

  // ---------- Поиск (по-русски и по-казахски) ----------
  const norm = (s) => String(s || "").toLowerCase().replace(/ё/g, "е");
  $("#search").addEventListener("input", (e) => {
    const q = norm(e.target.value.trim());
    let any = false;
    document.querySelectorAll(".section").forEach((sec) => {
      let shown = 0;
      sec.querySelectorAll(".item").forEach((el) => {
        const it = items[el.dataset.key];
        const ok = !q || norm([it.name, it.kz, it.desc].join(" ")).includes(q);
        el.hidden = !ok; if (ok) shown++;
      });
      sec.hidden = shown === 0; if (shown) any = true;
    });
    $("#empty").hidden = any;
    $("#tabsRow").hidden = !!q;
  });
})();
