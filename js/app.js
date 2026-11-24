(function () {
  "use strict";

  // ---------- Тексты интерфейса ----------
  const T = {
    ru: {
      menu: "Меню", search: "Поиск блюда…", empty: "Ничего не найдено",
      order: "Мой заказ", total: "Итого", clear: "Очистить", close: "Закрыть",
      hintWa: "Покажите этот список официанту или отправьте заказ в WhatsApp.",
      hint: "Покажите этот список официанту.",
      call: "Позвонить", prices: "Цены указаны в тенге",
      add: "Добавить", remove: "Убрать", off: "Нет в наличии",
      tags: { hit: "Хит", new: "Новинка", spicy: "Острое", veg: "Вег" },
      hall: "В зале", takeaway: "С собой", delivery: "Доставка",
      table: "Номер стола", tablePh: "например, 5",
      addr: "Адрес доставки", addrPh: "улица, дом, квартира",
      comment: "Комментарий (необязательно)",
      takeNote: (a) => `Заберёте заказ в кафе${a ? ": " + a : ""}.`,
      delivNote: "Стоимость доставки уточним в WhatsApp — она не входит в итог.",
      totalNoDeliv: "Итого без доставки",
      needTable: "Укажите номер стола", needAddr: "Укажите адрес доставки",
      waHall: (n) => `🍽️ В зале, стол № ${n}`, waTake: "🛍️ С собой", waDeliv: (a) => `🚗 Доставка: ${a}`,
      waDelivPrice: "Подскажите, пожалуйста, стоимость доставки.", waComment: "Комментарий",
      waHello: (n) => `Здравствуйте! Заказ в кафе ${n}:`, loadErr: "Не удалось загрузить меню. Обновите страницу."
    },
    kz: {
      menu: "Мәзір", search: "Тағамды іздеу…", empty: "Ештеңе табылмады",
      order: "Менің тапсырысым", total: "Барлығы", clear: "Тазалау", close: "Жабу",
      hintWa: "Бұл тізімді даяшыға көрсетіңіз немесе тапсырысты WhatsApp арқылы жіберіңіз.",
      hint: "Бұл тізімді даяшыға көрсетіңіз.",
      call: "Қоңырау шалу", prices: "Бағалар теңгемен көрсетілген",
      add: "Қосу", remove: "Алып тастау", off: "Қазір жоқ",
      tags: { hit: "Хит", new: "Жаңа", spicy: "Ащы", veg: "Вег" },
      hall: "Залда", takeaway: "Өзіммен", delivery: "Жеткізу",
      table: "Үстел нөмірі", tablePh: "мысалы, 5",
      addr: "Жеткізу мекенжайы", addrPh: "көше, үй, пәтер",
      comment: "Пікір (міндетті емес)",
      takeNote: (a) => `Тапсырысты кафеден алып кетесіз${a ? ": " + a : ""}.`,
      delivNote: "Жеткізу құнын WhatsApp арқылы нақтылаймыз — ол жалпы сомаға кірмейді.",
      totalNoDeliv: "Жеткізусіз барлығы",
      needTable: "Үстел нөмірін көрсетіңіз", needAddr: "Жеткізу мекенжайын көрсетіңіз",
      waHall: (n) => `🍽️ Залда, ${n}-үстел`, waTake: "🛍️ Өзіммен алып кетемін", waDeliv: (a) => `🚗 Жеткізу: ${a}`,
      waDelivPrice: "Жеткізу құнын айтып жіберіңізші.", waComment: "Пікір",
      waHello: (n) => `Сәлеметсіз бе! ${n} кафесіне тапсырыс:`, loadErr: "Мәзір жүктелмеді. Бетті жаңартыңыз."
    }
  };

  const $ = (s) => document.querySelector(s);
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const store = {
    get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } },
    set(k, v) { try { localStorage.setItem(k, v); } catch (e) {} }
  };

  let lang = store.get("aisha-lang") === "kz" ? "kz" : "ru";
  let DATA, CAFE, cart = {};
  // способ получения заказа: в зале / с собой / доставка
  let order = { mode: "hall", table: "", addr: "", comment: "" };
  try { Object.assign(order, JSON.parse(store.get("aisha-order")) || {}); } catch (e) {}
  const urlTable = new URLSearchParams(location.search).get("table");
  if (urlTable) { order.mode = "hall"; order.table = urlTable.slice(0, 6); }
  const saveOrder = () => store.set("aisha-order", JSON.stringify({ mode: order.mode, table: order.table, addr: order.addr }));
  const items = {}, prods = {};

  const t = (k) => T[lang][k];
  const fmt = (n) => Number(n).toLocaleString("ru-RU").replace(/,/g, " ") + " " + (CAFE.currency || "₸");
  // текст на текущем языке (если казахского нет — показываем русский)
  const L = (ru, kz) => (lang === "kz" && kz ? kz : ru) || "";
  // название на втором языке — мелкой строкой
  const other = (ru, kz) => (lang === "kz" ? (kz ? ru : "") : kz) || "";
  const units = (s) => (lang === "kz" ? String(s || "").replace(/шт\.?/g, "дана") : s || "");

  // ---------- Загрузка ----------
  function load() {
    if (window.MENU_DATA) return Promise.resolve(window.MENU_DATA);
    return fetch("data/menu.json", { cache: "no-cache" }).then((r) => {
      if (!r.ok) throw new Error(r.status);
      return r.json();
    });
  }

  load().then((d) => {
    DATA = d; CAFE = d.cafe || {};
    DATA.categories.forEach((cat) => cat.items.forEach((it) => {
      items[it.id] = it;
      if (it.variants && it.variants.length) it.variants.forEach((v, vi) => (prods[it.id + "/" + vi] = { it, v }));
      else prods[it.id] = { it };
    }));
    try { cart = JSON.parse(store.get("aisha-cart-v3")) || {}; } catch (e) { cart = {}; }
    Object.keys(cart).forEach((k) => { if (!prods[k] || prods[k].it.off) delete cart[k]; });
    if (order.mode === "delivery" && !CAFE.delivery) order.mode = "hall";
    bind();
    render();
  }).catch(() => {
    $("#menu").innerHTML = `<p class="empty">${T[lang].loadErr}</p>`;
  });

  const saveCart = () => store.set("aisha-cart-v3", JSON.stringify(cart));
  const prodName = (p) => L(p.it.name, p.it.kz) + (p.v ? " (" + units(p.v.label) + ")" : p.it.weight ? " (" + units(p.it.weight) + ")" : "");
  const prodPrice = (p) => (p.v ? p.v.price : p.it.price);

  // ---------- Отрисовка ----------
  function render() {
    document.documentElement.lang = lang === "kz" ? "kk" : "ru";
    document.querySelectorAll(".lang__btn").forEach((b) => b.setAttribute("aria-pressed", b.dataset.lang === lang));
    $("#heroTitle").textContent = t("menu");
    $("#heroMeta").textContent = [L(CAFE.city, CAFE.cityKz), L(CAFE.hours, CAFE.hoursKz)].filter(Boolean).join(" · ");
    $("#search").placeholder = t("search");
    $("#search").setAttribute("aria-label", t("search"));
    $("#empty").textContent = t("empty");
    $("#cartLabel").textContent = t("order");
    $("#sheetTitle").textContent = t("order");
    $("#totalLabel").textContent = t("total");
    $("#cartClear").textContent = t("clear");
    $("#mHall").textContent = t("hall"); $("#mTake").textContent = t("takeaway"); $("#mDeliv").textContent = t("delivery");
    $("#tableLbl").textContent = t("table"); $("#tableNo").placeholder = t("tablePh");
    $("#addrLbl").textContent = t("addr"); $("#addr").placeholder = t("addrPh");
    $("#commentLbl").textContent = t("comment");
    $("#tableNo").value = order.table; $("#addr").value = order.addr; $("#comment").value = order.comment;
    document.querySelectorAll("[data-close]").forEach((b) => b.setAttribute("aria-label", t("close")));

    const links = [];
    if (CAFE.phone) links.push(`<a class="btn btn--ghost" href="tel:${esc(CAFE.phone.replace(/[^\d+]/g, ""))}">📞 ${t("call")}</a>`);
    if (CAFE.whatsapp) links.push(`<a class="btn btn--ghost" href="https://wa.me/${esc(CAFE.whatsapp)}" target="_blank" rel="noopener">💬 WhatsApp</a>`);
    if (CAFE.instagram) links.push(`<a class="btn btn--ghost" href="https://instagram.com/${esc(CAFE.instagram)}" target="_blank" rel="noopener">📷 Instagram</a>`);
    const addr = L(CAFE.address, CAFE.addressKz), hours = L(CAFE.hours, CAFE.hoursKz);
    $("#footer").innerHTML = `
      <p><strong class="footer__name">${esc(CAFE.name)}</strong> — ${esc(L(CAFE.subtitle, CAFE.subtitleKz).toLowerCase())}</p>
      ${addr ? `<p>📍 ${esc(addr)}</p>` : ""}
      ${CAFE.phone ? `<p>☎️ ${esc(CAFE.phone)}</p>` : ""}
      ${hours ? `<p>🕒 ${esc(hours)}</p>` : ""}
      ${links.length ? `<div class="footer__links">${links.join("")}</div>` : ""}
      <p class="footer__note">${t("prices")}</p>`;

    const cats = DATA.categories.filter((c) => c.items.length);
    $("#menu").innerHTML = cats.map((cat) => {
      const title = L(cat.title, cat.kz), sub = other(cat.title, cat.kz);
      return `
      <section class="section" id="${esc(cat.id)}">
        <h2 class="section__title"><span>${esc(title)}${sub && sub !== title ? `<small>${esc(sub)}</small>` : ""}</span></h2>
        ${cat.items.map(itemHTML).join("")}
      </section>`;
    }).join("");
    $("#tabsRow").innerHTML = cats.map((c) =>
      `<button class="tab" data-target="${esc(c.id)}">${c.icon ? esc(c.icon) + " " : ""}${esc(L(c.title, c.kz))}</button>`).join("");

    Object.keys(prods).forEach(renderQty);
    renderCart();
    observe();
    applySearch();
  }

  const qtySlot = (key, off) => (off ? "" : `<div class="qty" data-qty="${esc(key)}"></div>`);

  function itemHTML(it) {
    const tags = (it.tags || []).map((g) => `<span class="tag tag--${esc(g)}">${esc(t("tags")[g] || g)}</span>`);
    if (it.off) tags.push(`<span class="tag tag--off">${t("off")}</span>`);
    const name = L(it.name, it.kz), sub = other(it.name, it.kz);
    const desc = L(it.desc, it.descKz);
    const foot = it.variants && it.variants.length
      ? `<div class="vars">${it.variants.map((v, vi) => `
          <div class="var">
            <span class="var__label">${esc(units(v.label))}</span>
            <span class="item__price">${fmt(v.price)}</span>
            ${qtySlot(it.id + "/" + vi, it.off)}
          </div>`).join("")}</div>`
      : `<div class="item__foot">
          <span class="item__price">${fmt(it.price)}</span>
          ${it.weight ? `<span class="item__weight">${esc(units(it.weight))}</span>` : ""}
          ${qtySlot(it.id, it.off)}
        </div>`;
    return `
      <article class="item${it.off ? " is-off" : ""}" data-key="${esc(it.id)}">
        ${it.img ? `<img class="item__img" src="${esc(it.img)}" alt="" loading="lazy">` : ""}
        <div class="item__body">
          <h3 class="item__name">${esc(name)}${tags.length ? `<span class="tags">${tags.join("")}</span>` : ""}</h3>
          ${sub && sub !== name ? `<p class="item__kz">${esc(sub)}</p>` : ""}
          ${desc ? `<p class="item__desc">${esc(desc)}</p>` : ""}
          ${foot}
        </div>
      </article>`;
  }

  // ---------- Заказ ----------
  const sheet = $("#sheet");
  function openSheet() { sheet.hidden = false; document.body.style.overflow = "hidden"; }
  function closeSheet() { sheet.hidden = true; document.body.style.overflow = ""; }

  const qtyBtns = (key, n) => n
    ? `<button class="qty__btn" data-dec="${esc(key)}" aria-label="${t("remove")}">−</button><span class="qty__n">${n}</span><button class="qty__btn qty__btn--add" data-inc="${esc(key)}" aria-label="${t("add")}">+</button>`
    : `<button class="qty__btn qty__btn--add" data-inc="${esc(key)}" aria-label="${t("add")}">+</button>`;

  function renderQty(key) {
    const el = document.querySelector(`[data-qty="${CSS.escape(key)}"]`);
    if (el) el.innerHTML = qtyBtns(key, cart[key] || 0);
  }

  function renderCart() {
    const entries = Object.entries(cart).filter(([k, n]) => n > 0 && prods[k]).map(([k, n]) => [k, prods[k], n]);
    const count = entries.reduce((s, [, , n]) => s + n, 0);
    const total = entries.reduce((s, [, p, n]) => s + prodPrice(p) * n, 0);
    $("#cartBtn").hidden = count === 0;
    $("#cartCount").textContent = count;
    $("#cartSum").textContent = fmt(total);
    $("#cartTotal").textContent = fmt(total);
    lastEntries = entries; lastTotal = total;
    $("#cartList").innerHTML = entries.map(([k, p, n]) => `
      <li>
        <span class="name">${esc(prodName(p))}</span>
        <div class="qty">${qtyBtns(k, n)}</div>
        <span class="sum">${fmt(prodPrice(p) * n)}</span>
      </li>`).join("");
    $("#cartWa").hidden = !CAFE.whatsapp;
    $("#sheetHint").textContent = CAFE.whatsapp ? t("hintWa") : t("hint");
    renderOrder();
    if (count === 0) closeSheet();
  }

  let lastEntries = [], lastTotal = 0;
  function renderOrder() {
    const m = order.mode;
    $("#mDelivBtn").hidden = !CAFE.delivery;
    document.querySelectorAll(".mode__btn").forEach((b) => b.setAttribute("aria-checked", b.dataset.mode === m));
    $("#tableField").hidden = m !== "hall";
    $("#addrField").hidden = m !== "delivery";
    $("#takeNote").hidden = m !== "takeaway";
    $("#takeNote").textContent = t("takeNote")(L(CAFE.address, CAFE.addressKz));
    $("#delivNote").hidden = m !== "delivery";
    $("#delivNote").textContent = t("delivNote");
    $("#totalLabel").textContent = m === "delivery" ? t("totalNoDeliv") : t("total");
    updateWa();
  }

  function updateWa() {
    if (!CAFE.whatsapp) return;
    const m = order.mode, lines = [t("waHello")(CAFE.name)];
    if (m === "hall") lines.push(t("waHall")(order.table.trim() || "—"));
    else if (m === "takeaway") lines.push(t("waTake"));
    else lines.push(t("waDeliv")(order.addr.trim() || "—"));
    lines.push("");
    lastEntries.forEach(([, p, n]) => lines.push(`• ${prodName(p)} × ${n} = ${fmt(prodPrice(p) * n)}`));
    lines.push("", `${m === "delivery" ? t("totalNoDeliv") : t("total")}: ${fmt(lastTotal)}`);
    if (m === "delivery") lines.push(t("waDelivPrice"));
    if (order.comment.trim()) lines.push(`${t("waComment")}: ${order.comment.trim()}`);
    $("#cartWa").href = `https://wa.me/${CAFE.whatsapp}?text=${encodeURIComponent(lines.join("\n"))}`;
  }

  // перед отправкой в WhatsApp проверяем номер стола / адрес
  function checkOrder() {
    const need = order.mode === "hall" && !order.table.trim() ? ["#tableField", "#tableNo", "needTable"]
      : order.mode === "delivery" && !order.addr.trim() ? ["#addrField", "#addr", "needAddr"] : null;
    if (!need) return true;
    $(need[0]).classList.add("is-invalid");
    $(need[0]).querySelector("span").textContent = t(need[2]);
    $(need[1]).focus();
    return false;
  }

  function change(key, d) {
    cart[key] = Math.max(0, (cart[key] || 0) + d);
    if (!cart[key]) delete cart[key];
    saveCart(); renderQty(key); renderCart();
  }

  // ---------- Вкладки ----------
  let io, lockUntil = 0;
  function setActive(id) {
    document.querySelectorAll(".tab").forEach((tb) => {
      const on = tb.dataset.target === id;
      tb.classList.toggle("is-active", on);
      if (on) { const row = tb.parentElement; row.scrollTo({ left: tb.offsetLeft - (row.clientWidth - tb.offsetWidth) / 2, behavior: "smooth" }); }
    });
  }
  function observe() {
    if (io) io.disconnect();
    io = new IntersectionObserver((entries) => {
      if (Date.now() < lockUntil) return;
      entries.forEach((en) => { if (en.isIntersecting) setActive(en.target.id); });
    }, { rootMargin: "-130px 0px -65% 0px" });
    document.querySelectorAll(".section").forEach((s) => io.observe(s));
  }

  // ---------- Поиск (по обоим языкам) ----------
  const norm = (s) => String(s || "").toLowerCase().replace(/ё/g, "е");
  function applySearch() {
    const q = norm($("#search").value.trim());
    let any = false;
    document.querySelectorAll(".section").forEach((sec) => {
      let shown = 0;
      sec.querySelectorAll(".item").forEach((el) => {
        const it = items[el.dataset.key];
        const ok = !q || norm([it.name, it.kz, it.desc, it.descKz].join(" ")).includes(q);
        el.hidden = !ok; if (ok) shown++;
      });
      sec.hidden = shown === 0; if (shown) any = true;
    });
    $("#empty").hidden = any;
    $("#tabsRow").hidden = !!q;
  }

  // ---------- События ----------
  function bind() {
    document.addEventListener("click", (e) => {
      const inc = e.target.closest("[data-inc]"), dec = e.target.closest("[data-dec]");
      if (inc) change(inc.dataset.inc, +1);
      if (dec) change(dec.dataset.dec, -1);
      const lb = e.target.closest(".lang__btn");
      if (lb && lb.dataset.lang !== lang) { lang = lb.dataset.lang; store.set("aisha-lang", lang); render(); }
    });
    $("#cartBtn").addEventListener("click", openSheet);
    sheet.addEventListener("click", (e) => { if (e.target.closest("[data-close]")) closeSheet(); });
    document.addEventListener("keydown", (e) => { if (e.key === "Escape") closeSheet(); });
    $("#cartClear").addEventListener("click", () => {
      const keys = Object.keys(cart); cart = {}; saveCart(); keys.forEach(renderQty); renderCart();
    });
    $("#tabsRow").addEventListener("click", (e) => {
      const tb = e.target.closest(".tab"); if (!tb) return;
      setActive(tb.dataset.target);
      lockUntil = Date.now() + 1500;
      const sec = document.getElementById(tb.dataset.target);
      window.scrollTo({ top: sec.getBoundingClientRect().top + window.scrollY - $("#tabs").offsetHeight - 4, behavior: "smooth" });
    });
    $("#search").addEventListener("input", applySearch);

    $("#modeGroup").addEventListener("click", (e) => {
      const b = e.target.closest(".mode__btn"); if (!b) return;
      order.mode = b.dataset.mode; saveOrder(); renderOrder();
    });
    [["#tableNo", "table", "#tableField", "table"], ["#addr", "addr", "#addrField", "addr"], ["#comment", "comment"]].forEach(([sel, key, field, lbl]) => {
      $(sel).addEventListener("input", (e) => {
        order[key] = e.target.value; saveOrder(); updateWa();
        if (field && $(field).classList.contains("is-invalid")) {
          $(field).classList.remove("is-invalid"); $(field).querySelector("span").textContent = t(lbl);
        }
      });
    });
    $("#cartWa").addEventListener("click", (e) => { if (!checkOrder()) e.preventDefault(); });
  }
})();
