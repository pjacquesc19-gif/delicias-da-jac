(() => {
  'use strict';

  /* =====================================================================
     Configuração. Caminhos relativos, para funcionar no GitHub Pages
     mesmo quando o site está em um subdiretório (usuario.github.io/repo/).
     ===================================================================== */
  const DATA_URL = 'data/produtos.json';
  const IMG_DIR = 'public/images/produtos/';
  const BRAND_DIR = 'public/images/marca/';
  const DEFAULT_IMG = 'public/images/padrao.svg';
  const CART_KEY = 'delicias-da-jac:carrinho:v1';
  const OTHER_COLOR = 'Outro';
  const OTHER_THEME = 'Outros';
  const SPECIAL_COLOR_RE = /neon|dourad|pratead/; // cores que exigem orçamento (texto digitado em "Outro")

  /* ---------- Utilidades ---------- */
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const brl = (v) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  const norm = (s) => String(s).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  const plural = (n, one, many) => (n === 1 ? one : many);

  // Só nomes de arquivo simples: sem pastas, sem endereços externos.
  const okImage = (n) => typeof n === 'string' && /^[A-Za-z0-9][A-Za-z0-9._-]*\.(jpe?g|png|webp)$/i.test(n) && !n.includes('..');
  const okBrandImage = (n) => typeof n === 'string' && /^[A-Za-z0-9][A-Za-z0-9._-]*\.(jpe?g|png|webp|svg)$/i.test(n) && !n.includes('..');
  const imagesOf = (p) => (p.images || []).filter(okImage);

  let DATA = null;
  const PRODUCTS = {}; // id -> produto
  const COLORS = {};   // nome -> {name, hex, consult}
  const CATEGORIES = {};

  /* =====================================================================
     Regras de produto (tudo derivado dos dados do JSON)
     ===================================================================== */
  // Produto sem variações vira uma variação única, para o resto do código tratar tudo igual.
  const variantsOf = (p) => (p.variants.length ? p.variants : [{
    label: p.name, options: {}, price: p.price, minimumQuantity: p.minimumQuantity, quantity: p.quantity,
    maxFlavors: null, maxColors: null, flavors: null, themes: null, notes: [],
  }]);

  function cfg(p, v) {
    const flavors = v.flavors ?? p.flavors;
    return {
      flavors,
      flavorMode: flavors.length === 0 ? 'none' : flavors.length === 1 ? 'fixed' : p.flavorChoice,
      maxFlavors: v.maxFlavors ?? null,
      colors: p.colors,
      maxColors: v.maxColors ?? p.maxColors,
      themes: v.themes ?? p.themes,
      min: v.minimumQuantity || 0,
      notes: [...new Set([...(p.notes || []), ...(v.notes || [])])],
    };
  }
  const colorLimit = (c) => (c.maxColors === 'free' ? Infinity : c.maxColors || 1);
  const unitName = (p, n) => (n === 1 ? p.unit[0] : p.unit[1]);
  const qtyText = (p, n) => (p.gramsPerUnit ? `${n * p.gramsPerUnit} g (${n} ${unitName(p, n)})` : `${n} ${unitName(p, n)}`);

  function minEff(p, c, nColors) {
    const byColor = p.minPerColor && c.colors.length ? p.minPerColor * Math.max(1, nColors) : 0;
    return Math.max(c.min || 0, byColor) || 1;
  }
  function minText(p, c) {
    if (p.minPerColor && c.colors.length) return `${qtyText(p, p.minPerColor)} de cada cor`;
    return c.min ? qtyText(p, c.min) : null;
  }
  const minPrice = (p) => Math.min(...variantsOf(p).map((v) => v.price));
  const colorLabel = (c) => (c.custom && c.hex && !norm(c.name).includes(c.hex.toLowerCase()) ? `${c.name} (${c.hex})` : c.name);
  const isConsultColor = (c) => (c.custom ? SPECIAL_COLOR_RE.test(norm(c.name)) : !!(COLORS[c.name] && COLORS[c.name].consult));
  const consultColors = (colors) => colors.filter(isConsultColor);

  function optionsHint(c) {
    const a = [];
    if (c.colors.length) a.push(colorLimit(c) === 1 ? 'cor' : 'cores');
    if (c.themes.length) a.push('tema');
    if (c.flavorMode === 'one') a.push('recheio');
    if (c.flavorMode === 'many') a.push('sabores');
    return a.length ? 'Você escolhe: ' + a.join(', ') : '';
  }

  /* =====================================================================
     Imagens (com imagem padrão quando o arquivo não existe)
     ===================================================================== */
  function mediaHTML(p, cls = 'media', index = 0) {
    const name = imagesOf(p)[index];
    return `<div class="${cls}${name ? '' : ' is-prov'}"><img src="${name ? IMG_DIR + encodeURIComponent(name) : DEFAULT_IMG}" `
      + `alt="${name ? esc(p.name) : 'Imagem provisória de ' + esc(p.name)}" data-fb data-name="${esc(p.name)}" width="400" height="300" loading="lazy" decoding="async">`
      + '<span class="prov">Foto provisória</span></div>';
  }
  // Erros de carregamento não "borbulham": captura na fase de captura.
  document.addEventListener('error', (e) => {
    const img = e.target;
    if (!(img instanceof HTMLImageElement) || !img.hasAttribute('data-fb')) return;
    if (img.getAttribute('src') === DEFAULT_IMG) return;
    img.src = DEFAULT_IMG;
    img.alt = 'Imagem provisória de ' + (img.dataset.name || 'produto');
    const box = img.closest('.media, .m-main');
    if (box) box.classList.add('is-prov');
  }, true);

  /* =====================================================================
     Estado
     ===================================================================== */
  const state = { q: '', cat: 'todos', sort: 'default' };
  const cardState = {}; // id do produto -> { vi, open }
  const cs = (p) => (cardState[p.id] ||= { vi: 0, open: false });
  let cart = { items: [], note: '' };
  let draft = null;     // estado do modal de personalização

  /* ---------- Carrinho: persistência ---------- */
  function saveCart() {
    try { localStorage.setItem(CART_KEY, JSON.stringify(cart)); } catch { /* armazenamento indisponível */ }
  }
  function loadCart() {
    let raw = null;
    try { raw = JSON.parse(localStorage.getItem(CART_KEY)); } catch { /* ignora */ }
    if (!raw || !Array.isArray(raw.items)) return 0;
    let dropped = 0;
    const items = [];
    for (const it of raw.items) {
      const p = it && PRODUCTS[it.pid];
      const v = p && variantsOf(p).find((x) => x.label === it.vlabel);
      if (!p || !v || !p.available || !Number.isFinite(it.qty) || it.qty <= 0) { dropped++; continue; }
      items.push({
        uid: String(it.uid || uid()), pid: it.pid, vlabel: it.vlabel, qty: it.qty,
        colors: (Array.isArray(it.colors) ? it.colors : []).map((c) => ({ name: String(c.name || ''), custom: !!c.custom, hex: String(c.hex || '') })),
        theme: String(it.theme || ''), themeCustom: !!it.themeCustom,
        flavors: Array.isArray(it.flavors) ? it.flavors.map(String) : [], note: String(it.note || ''),
      });
    }
    cart = { items, note: String(raw.note || '') };
    return dropped;
  }

  const itemKey = (it) => JSON.stringify([
    it.pid, it.vlabel,
    it.colors.map((c) => (c.custom ? '~' + norm(c.name.trim()) : c.name)).sort(),
    norm(it.theme.trim()), [...it.flavors].sort(), norm(it.note.trim()),
  ]);

  function priceOf(it) {
    const p = PRODUCTS[it.pid];
    const v = variantsOf(p).find((x) => x.label === it.vlabel);
    const c = cfg(p, v);
    const consult = consultColors(it.colors);
    return { p, v, c, unit: v.price, consult, sub: consult.length ? null : v.price * it.qty };
  }
  function totals() {
    let sum = 0; const consultIdx = [];
    cart.items.forEach((it, i) => {
      const r = priceOf(it);
      if (r.sub === null) consultIdx.push(i + 1); else sum += r.sub;
    });
    return { sum: Math.round(sum * 100) / 100, consultIdx };
  }

  function addItem(item) {
    const k = itemKey(item);
    const same = cart.items.find((x) => itemKey(x) === k);
    if (same) same.qty += item.qty; else cart.items.push(item);
    saveCart(); renderCart();
  }
  function replaceItem(id, item) {
    const idx = cart.items.findIndex((x) => x.uid === id);
    if (idx < 0) return addItem(item);
    item.uid = id;
    cart.items[idx] = item;
    // Se a edição deixou o item igual a outro, junta os dois.
    const k = itemKey(item);
    const other = cart.items.find((x) => x.uid !== id && itemKey(x) === k);
    if (other) { other.qty += item.qty; cart.items.splice(idx, 1); }
    saveCart(); renderCart();
  }

  /* =====================================================================
     Catálogo (cards)
     ===================================================================== */
  function selectorsHTML(p, vi, attr = 'data-sel') {
    if (!p.selectors.length) return '';
    const cur = p.variants[vi].options;
    return p.selectors.map((sel) => {
      const vals = [...new Set(p.variants.map((x) => x.options[sel.key]))];
      return `<label class="f"><span>${esc(sel.label)}</span><select ${attr}="${esc(sel.key)}">`
        + vals.map((x) => `<option${x === cur[sel.key] ? ' selected' : ''}>${esc(x)}</option>`).join('') + '</select></label>';
    }).join('');
  }
  function variantIndexFor(p, current, key, value) {
    const want = { ...p.variants[current].options, [key]: value };
    const i = p.variants.findIndex((v) => Object.entries(want).every(([k, x]) => v.options[k] === x));
    return i >= 0 ? i : Math.max(0, p.variants.findIndex((v) => v.options[key] === value));
  }

  function cardHTML(p) {
    const s = cs(p), vs = variantsOf(p), v = vs[s.vi], c = cfg(p, v);
    const mt = minText(p, c);
    const meta = [v.quantity, c.maxFlavors ? `Até ${c.maxFlavors} ${plural(c.maxFlavors, 'sabor', 'sabores')}` : null].filter(Boolean).join(' · ');
    const hint = optionsHint(c);
    const fixed = c.flavorMode === 'fixed' ? `<p class="info"><strong>Recheio:</strong> ${esc(c.flavors[0])}</p>` : '';
    const details = `<div class="details"${s.open ? '' : ' hidden'}>
      ${meta ? `<h4>Quantidade / tamanho</h4><p>${esc(meta)}</p>` : ''}
      ${c.flavors.length ? `<h4>Recheios</h4><p>${c.flavors.map(esc).join(', ')}</p>` : ''}
      ${c.notes.length ? `<h4>Observações</h4><ul>${c.notes.map((n) => `<li>${esc(n)}</li>`).join('')}</ul>` : ''}
      ${vs.length > 1 ? `<h4>Todas as variações</h4><ul>${vs.map((x) => `<li>${esc(x.label)}: ${brl(x.price)}${x.minimumQuantity ? ` (mín. ${x.minimumQuantity})` : ''}</li>`).join('')}</ul>` : ''}
    </div>`;
    return `<article class="card" data-id="${esc(p.id)}">
      ${mediaHTML(p)}
      <div class="body">
        <p class="tag">${esc(p.badge || CATEGORIES[p.category].name)}</p>
        <h3>${esc(p.name)}</h3>
        <p class="desc">${esc(p.description)}</p>
        <div class="price-row"><strong class="price">${brl(v.price)}</strong><span class="unit">${esc(p.priceUnit)}</span></div>
        <p class="min">${mt ? 'Pedido mínimo: ' + esc(mt) : 'Pedido mínimo: não informado'}</p>
        ${meta ? `<p class="meta">${esc(meta)}</p>` : ''}
        ${fixed}
        ${selectorsHTML(p, s.vi)}
        ${hint ? `<p class="opts">${esc(hint)}</p>` : ''}
        <div class="actions">
          <button type="button" class="btn" data-act="add"${p.available ? '' : ' disabled'}>${p.available ? 'Adicionar ao carrinho' : 'Indisponível no momento'}</button>
          <button type="button" class="btn ghost" data-act="toggle" aria-expanded="${s.open}">${s.open ? 'Ocultar detalhes' : 'Ver detalhes'}</button>
        </div>
        ${details}
      </div></article>`;
  }
  function refreshCard(card, focusSel) {
    const t = document.createElement('template');
    t.innerHTML = cardHTML(PRODUCTS[card.dataset.id]).trim();
    const fresh = t.content.firstElementChild;
    card.replaceWith(fresh);
    if (focusSel) { const el = $(focusSel, fresh); if (el) el.focus(); }
  }

  function onCatalogClick(e) {
    const btn = e.target.closest('[data-act]'); if (!btn) return;
    const card = btn.closest('.card'), p = PRODUCTS[card.dataset.id], s = cs(p);
    if (btn.dataset.act === 'toggle') { s.open = !s.open; refreshCard(card, '[data-act="toggle"]'); }
    if (btn.dataset.act === 'add') openProduct(p.id, s.vi);
  }
  function onCatalogChange(e) {
    const key = e.target.dataset && e.target.dataset.sel; if (!key) return;
    const card = e.target.closest('.card'), p = PRODUCTS[card.dataset.id], s = cs(p);
    s.vi = variantIndexFor(p, s.vi, key, e.target.value);
    refreshCard(card, `[data-sel="${key}"]`);
  }

  function renderNav() {
    const items = [{ id: 'todos', name: 'Todos' }, ...DATA.categories];
    $('#catnav').innerHTML = items.map((c) => `<button type="button" class="chip" data-cat="${esc(c.id)}" aria-pressed="${c.id === state.cat}">${esc(c.name)}</button>`).join('');
    // Centraliza o chip ativo só na barra (sem rolar a página).
    const nav = $('#catnav'), on = $('[aria-pressed="true"]', nav);
    if (on) nav.scrollLeft = on.offsetLeft - (nav.clientWidth - on.offsetWidth) / 2;
  }
  function renderCatalog() {
    const q = norm(state.q.trim());
    let total = 0;
    $('#catalog').innerHTML = DATA.categories.filter((c) => state.cat === 'todos' || c.id === state.cat).map((c) => {
      const list = DATA.products.filter((p) => p.category === c.id
        && (!q || norm(p.name + ' ' + variantsOf(p).map((v) => v.label).join(' ')).includes(q)));
      if (state.sort === 'asc') list.sort((a, b) => minPrice(a) - minPrice(b));
      if (state.sort === 'desc') list.sort((a, b) => minPrice(b) - minPrice(a));
      total += list.length;
      return list.length
        ? `<section class="cat" id="cat-${esc(c.id)}" aria-labelledby="t-${esc(c.id)}"><h2 id="t-${esc(c.id)}">${esc(c.name)}</h2><p>${esc(c.description)}</p><div class="grid">${list.map(cardHTML).join('')}</div></section>`
        : '';
    }).join('');
    $('#empty').hidden = total > 0;
    $('#count').textContent = total === 1 ? '1 produto encontrado' : `${total} produtos encontrados`;
  }

  /* =====================================================================
     Modal de personalização
     ===================================================================== */
  const dlg = $('#product-dialog');

  function newDraft(p, vi, item, fromCart) {
    const d = { pid: p.id, vi, qty: 1, colors: [], theme: '', themeText: '', flavors: [], note: '', editUid: null, fromCart: !!fromCart, tried: false, img: 0 };
    if (item) {
      const found = variantsOf(p).findIndex((x) => x.label === item.vlabel);
      d.vi = found >= 0 ? found : 0;
      d.qty = item.qty;
      d.colors = item.colors.map((c) => ({ ...c }));
      d.theme = item.themeCustom ? OTHER_THEME : item.theme;
      d.themeText = item.themeCustom ? item.theme : '';
      d.flavors = [...item.flavors];
      d.note = item.note;
      d.editUid = item.uid;
    } else {
      d.qty = minEff(p, cfg(p, variantsOf(p)[vi]), 0);
    }
    return d;
  }
  const ctx = (d) => { const p = PRODUCTS[d.pid], v = variantsOf(p)[d.vi]; return { p, v, c: cfg(p, v) }; };

  function openProduct(pid, vi, item = null, fromCart = false) {
    const p = PRODUCTS[pid];
    draft = newDraft(p, vi, item, fromCart);
    buildModal();
    dlg.showModal();
  }

  function swatchHTML(name, hex, consult) {
    const dot = hex ? `background:${esc(hex)}` : 'background:conic-gradient(#F48FB1,#F7D54A,#5DBB63,#4A90D9,#B57EDC,#F48FB1)';
    return `<button type="button" class="swatch" data-color="${esc(name)}" aria-pressed="false"><span class="dot" style="${dot}"></span>`
      + `<span class="sw-name">${esc(name)}</span>${consult ? '<small>sob consulta</small>' : ''}</button>`;
  }

  function buildModal(focusSel) {
    const d = draft, { p, v, c } = ctx(d);
    const names = imagesOf(p);
    const thumbs = names.length > 1
      ? `<div class="m-thumbs">${names.map((n, i) => `<button type="button" data-thumb="${i}" aria-label="Foto ${i + 1} de ${names.length}"${i === d.img ? ' aria-current="true"' : ''}><img src="${IMG_DIR + encodeURIComponent(n)}" alt="" data-fb data-name="${esc(p.name)}" loading="lazy"></button>`).join('')}</div>`
      : '';
    const lim = colorLimit(c);
    const colorsBox = c.colors.length ? `
      <fieldset class="fs" id="m-colors"><legend>${lim === 1 ? 'Cor' : 'Cores'}</legend>
        <p class="hint">${lim === 1 ? 'Escolha 1 cor.' : lim === Infinity ? 'Você pode escolher mais de uma cor.' : `Escolha até ${lim} cores.`}</p>
        <div class="swatches">${c.colors.map((n) => swatchHTML(n, COLORS[n] && COLORS[n].hex, COLORS[n] && COLORS[n].consult)).join('')}${swatchHTML(OTHER_COLOR, null, false)}</div>
        <div class="other-color" id="m-other-color" hidden>
          <label class="f grow"><span>Qual cor?</span><input type="text" id="m-oc-name" maxlength="40" autocomplete="off" placeholder="Ex.: verde-água"></label>
          <label class="f"><span>Escolher visualmente</span><input type="color" id="m-oc-hex" value="#f48fb1" aria-label="Seletor visual de cor"></label>
        </div>
        <p class="hint warn" id="m-consult" hidden>Dourado, prateado e neon podem exigir orçamento específico. O preço desse item será confirmado pela confeitaria.</p>
      </fieldset>` : '';
    const themeBox = c.themes.length ? `
      <div class="fs" id="m-theme-box">
        <label class="f"><span>Tema</span><select id="m-theme"><option value="">Escolha um tema</option>${c.themes.map((t) => `<option${t === d.theme ? ' selected' : ''}>${esc(t)}</option>`).join('')}<option${d.theme === OTHER_THEME ? ' selected' : ''}>${OTHER_THEME}</option></select></label>
        <div id="m-theme-other" hidden><label class="f"><span>Qual tema?</span><input type="text" id="m-theme-text" maxlength="60" autocomplete="off" value="${esc(d.themeText)}"></label></div>
        <p class="hint">Os temas são sugestões. Temas personalizados dependem de confirmação da confeitaria.</p>
      </div>` : '';
    let flavorBox = '';
    if (c.flavorMode === 'fixed') {
      flavorBox = `<p class="info"><strong>Recheio:</strong> ${esc(c.flavors[0])}</p>`;
    } else if (c.flavorMode === 'one' || c.flavorMode === 'many') {
      const type = c.flavorMode === 'one' ? 'radio' : 'checkbox';
      const hint = c.flavorMode === 'one' ? 'Escolha 1 recheio.' : c.maxFlavors ? `Escolha até ${c.maxFlavors} ${plural(c.maxFlavors, 'sabor', 'sabores')}.` : 'Escolha um ou mais sabores.';
      flavorBox = `<fieldset class="fs" id="m-flavors"><legend>${c.flavorMode === 'one' ? 'Recheio' : 'Sabores'}</legend><p class="hint">${hint}</p>
        <div class="pills">${c.flavors.map((f) => `<label class="pill"><input type="${type}" name="flavor" value="${esc(f)}"><span>${esc(f)}</span></label>`).join('')}</div></fieldset>`;
    }
    const unit = p.gramsPerUnit ? 'em gramas' : `(${p.unit[1]})`;
    $('#m-title').textContent = d.editUid ? 'Editar item' : 'Personalizar pedido';
    $('#m-body').innerHTML = `
      <div class="m-prod">
        <div class="m-gallery">${mediaHTML(p, 'media m-main', d.img)}${thumbs}</div>
        <div class="m-info">
          <h3>${esc(p.name)}</h3>
          <p class="m-price"><strong id="m-unit">${brl(v.price)}</strong> <span>${esc(p.priceUnit)}</span></p>
          <p class="m-min">${minText(p, c) ? 'Pedido mínimo: ' + esc(minText(p, c)) : 'Pedido mínimo: não informado'}</p>
          <p class="m-desc">${esc(p.description)}</p>
        </div>
      </div>
      <form id="m-form" novalidate onsubmit="return false">
        ${p.selectors.length ? `<div class="fs sel-row">${selectorsHTML(p, d.vi, 'data-msel')}</div>` : ''}
        ${colorsBox}${themeBox}${flavorBox}
        <div class="fs" id="m-qty-box">
          <label class="lab" for="m-qty">Quantidade ${unit}</label>
          <div class="qty"><button type="button" data-act="dec" aria-label="Diminuir quantidade">−</button>
            <input type="number" id="m-qty" inputmode="numeric" min="1" step="${p.gramsPerUnit || 1}" aria-describedby="m-qhelp m-qerr">
            <button type="button" data-act="inc" aria-label="Aumentar quantidade">+</button></div>
          <p class="hint" id="m-qhelp"></p><p class="err-inline" id="m-qerr" role="alert"></p>
        </div>
        <label class="f"><span>${p.customizable ? 'Detalhes da personalização (opcional)' : 'Observações (opcional)'}</span>
          <textarea id="m-note" rows="2" maxlength="300" placeholder="Algo mais que a confeitaria precise saber?">${esc(d.note)}</textarea></label>
      </form>`;
    $('#m-foot').innerHTML = `
      <div class="m-total"><span>Subtotal</span><strong id="m-sub"></strong></div>
      <div class="m-err" id="m-err" role="alert" hidden></div>
      <div class="m-actions"><button type="button" class="btn ghost" data-close>Cancelar</button>
        <button type="button" class="btn" id="m-confirm">${d.editUid ? 'Salvar alterações' : 'Confirmar e adicionar'}</button></div>`;
    // valores iniciais dos campos
    $$('input[name="flavor"]', dlg).forEach((i) => { i.checked = d.flavors.includes(i.value); });
    const oc = d.colors.find((x) => x.custom);
    if (oc) { $('#m-oc-name').value = oc.name; if (oc.hex) $('#m-oc-hex').value = oc.hex; }
    setQtyInput();
    syncModal();
    if (focusSel) { const el = $(focusSel, dlg); if (el) el.focus(); }
  }

  function setQtyInput() {
    const { p, c } = ctx(draft);
    const input = $('#m-qty'); if (!input) return;
    const g = p.gramsPerUnit || 1;
    input.min = minEff(p, c, draft.colors.length) * g;
    input.value = Number.isFinite(draft.qty) ? Math.round(draft.qty * g * 1000) / 1000 : '';
  }

  function validate(d) {
    const { p, v, c } = ctx(d), errs = [], n = d.colors.length;
    if (c.colors.length) {
      const lim = colorLimit(c);
      if (!n) errs.push(['m-colors', 'Escolha pelo menos uma cor.']);
      else if (n > lim) errs.push(['m-colors', `Escolha no máximo ${lim} ${plural(lim, 'cor', 'cores')}.`]);
      const other = d.colors.find((x) => x.custom);
      if (other && !other.name.trim()) errs.push(['m-oc-name', 'Informe o nome da cor escolhida em "Outro".']);
    }
    if (c.themes.length) {
      if (!d.theme) errs.push(['m-theme', 'Escolha um tema.']);
      else if (d.theme === OTHER_THEME && !d.themeText.trim()) errs.push(['m-theme-text', 'Informe o tema desejado.']);
    }
    if (c.flavorMode === 'one' && d.flavors.length !== 1) errs.push(['m-flavors', 'Escolha o recheio.']);
    if (c.flavorMode === 'many') {
      if (!d.flavors.length) errs.push(['m-flavors', 'Escolha pelo menos um sabor.']);
      else if (c.maxFlavors && d.flavors.length > c.maxFlavors) errs.push(['m-flavors', `Escolha no máximo ${c.maxFlavors} ${plural(c.maxFlavors, 'sabor', 'sabores')}.`]);
    }
    const min = minEff(p, c, n), q = d.qty;
    if (!Number.isFinite(q) || q <= 0) errs.push(['m-qty', 'Informe a quantidade desejada.']);
    else if (!Number.isInteger(q)) errs.push(['m-qty', p.gramsPerUnit ? `Informe a quantidade em múltiplos de ${p.gramsPerUnit} g.` : 'Informe um número inteiro.']);
    else if (q < min) errs.push(['m-qty', `O pedido mínimo é ${qtyText(p, min)}${p.minPerColor && n > 1 ? ` (${qtyText(p, p.minPerColor)} por cor)` : ''}.`]);
    const consult = consultColors(d.colors);
    return { errs, consult, min, unit: v.price, sub: errs.some((e) => e[0] === 'm-qty') || consult.length ? null : v.price * q };
  }

  function syncModal() {
    const d = draft, { p, c } = ctx(d), r = validate(d);
    $$('[data-color]', dlg).forEach((b) => {
      const on = b.dataset.color === OTHER_COLOR ? d.colors.some((x) => x.custom) : d.colors.some((x) => !x.custom && x.name === b.dataset.color);
      b.setAttribute('aria-pressed', String(on));
    });
    if ($('#m-other-color')) $('#m-other-color').hidden = !d.colors.some((x) => x.custom);
    if ($('#m-consult')) $('#m-consult').hidden = !r.consult.length;
    if ($('#m-theme-other')) $('#m-theme-other').hidden = d.theme !== OTHER_THEME;
    if (c.flavorMode === 'many' && c.maxFlavors) {
      $$('input[name="flavor"]', dlg).forEach((i) => { i.disabled = !i.checked && d.flavors.length >= c.maxFlavors; });
    }
    // preço unitário e subtotal (cores especiais: sem preço automático)
    $('#m-unit').textContent = r.consult.length ? 'Sob consulta' : brl(r.unit);
    $('#m-sub').textContent = r.consult.length ? 'Sob consulta' : r.sub === null ? '—' : brl(r.sub);
    // ajuda e erro da quantidade
    const n = d.colors.length, g = p.gramsPerUnit;
    const help = [];
    if (p.minPerColor && c.colors.length) help.push(`Mínimo de ${qtyText(p, p.minPerColor)} por cor${n > 1 ? `: ${n} cores = ${qtyText(p, r.min)}` : ''}.`);
    else if (c.min) help.push(`Mínimo: ${qtyText(p, c.min)}.`);
    if (g) help.push(`Informe múltiplos de ${g} g.`);
    $('#m-qhelp').textContent = help.join(' ');
    const qErr = r.errs.find((e) => e[0] === 'm-qty');
    $('#m-qerr').textContent = qErr ? qErr[1] : '';
    $('#m-qty').setAttribute('aria-invalid', qErr ? 'true' : 'false');
    $('#m-qty-box').classList.toggle('has-error', !!qErr);
    renderErrors(r);
  }

  // Só mostra a lista de pendências depois da primeira tentativa de confirmar.
  function renderErrors(r) {
    const box = $('#m-err');
    $$('.has-error', dlg).forEach((el) => { if (el.id !== 'm-qty-box') el.classList.remove('has-error'); });
    if (!draft.tried || !r.errs.length) { box.hidden = true; box.textContent = ''; return; }
    box.hidden = false;
    box.innerHTML = '<strong>Falta ajustar:</strong><ul>' + r.errs.map((e) => `<li>${esc(e[1])}</li>`).join('') + '</ul>';
    r.errs.forEach(([id]) => { const el = document.getElementById(id); if (el) (el.closest('.fs') || el).classList.add('has-error'); });
  }

  function itemFromDraft(d) {
    const { p, v, c } = ctx(d);
    const order = (list, x) => list.indexOf(x);
    const colors = d.colors.map((x) => (x.custom ? { name: x.name.trim(), custom: true, hex: x.hex || '' } : { name: x.name, custom: false, hex: '' }))
      .sort((a, b) => (a.custom - b.custom) || (order(c.colors, a.name) - order(c.colors, b.name)));
    const customTheme = d.theme === OTHER_THEME;
    return {
      uid: d.editUid || uid(), pid: p.id, vlabel: v.label, qty: d.qty, colors,
      theme: c.themes.length ? (customTheme ? d.themeText.trim() : d.theme) : '', themeCustom: c.themes.length ? customTheme : false,
      flavors: c.flavorMode === 'fixed' ? [c.flavors[0]] : c.flavorMode === 'none' ? [] : [...d.flavors].sort((a, b) => order(c.flavors, a) - order(c.flavors, b)),
      note: d.note.trim(),
    };
  }

  function confirmDraft() {
    const d = draft; d.tried = true;
    const r = validate(d);
    if (r.errs.length) {
      renderErrors(r);
      const el = document.getElementById(r.errs[0][0]);
      if (el) { (el.closest('.fs') || el).scrollIntoView?.({ block: 'center' }); if (el.focus && el.tagName !== 'FIELDSET') el.focus(); }
      return;
    }
    const item = itemFromDraft(d), name = PRODUCTS[d.pid].name, editing = !!d.editUid;
    if (editing) replaceItem(d.editUid, item); else addItem(item);
    dlg.close();
    toast(editing ? 'Alterações salvas.' : `${name} adicionado ao carrinho.`, editing ? null : { label: 'Ver carrinho', fn: openCart });
  }

  function toggleColor(name) {
    const d = draft, { c } = ctx(d), lim = colorLimit(c);
    const idx = d.colors.findIndex((x) => (name === OTHER_COLOR ? x.custom : !x.custom && x.name === name));
    if (idx >= 0) { d.colors.splice(idx, 1); return true; }
    const item = name === OTHER_COLOR ? { name: '', custom: true, hex: '' } : { name, custom: false, hex: '' };
    if (lim === 1) d.colors = [item];
    else if (d.colors.length >= lim) { toast(`Você pode escolher até ${lim} cores. Desmarque uma para trocar.`); return false; }
    else d.colors.push(item);
    return true;
  }

  // Ao mudar variação/cores o mínimo pode mudar: se a quantidade estava no mínimo antigo, acompanha o novo.
  function withMinFollow(fn) {
    const { p, c } = ctx(draft), before = minEff(p, c, draft.colors.length), was = draft.qty === before;
    fn();
    const after = ctx(draft);
    const now = minEff(after.p, after.c, draft.colors.length);
    if (was && draft.qty !== now) { draft.qty = now; setQtyInput(); } else setQtyInput();
    syncModal();
  }

  function onModalClick(e) {
    const t = e.target;
    const sw = t.closest('[data-color]');
    if (sw) return withMinFollow(() => toggleColor(sw.dataset.color));
    const th = t.closest('[data-thumb]');
    if (th) { draft.img = Number(th.dataset.thumb); return buildModal(`[data-thumb="${draft.img}"]`); }
    const act = t.closest('[data-act]');
    if (act && (act.dataset.act === 'inc' || act.dataset.act === 'dec')) {
      const { p, c } = ctx(draft), min = minEff(p, c, draft.colors.length);
      const cur = Number.isFinite(draft.qty) ? draft.qty : min - 1;
      draft.qty = act.dataset.act === 'inc' ? Math.floor(cur) + 1 : Math.max(min, Math.ceil(cur) - 1);
      setQtyInput(); syncModal();
    }
    if (t.closest('#m-confirm')) confirmDraft();
  }
  function onModalChange(e) {
    const t = e.target, d = draft;
    if (t.dataset.msel) {
      const p = PRODUCTS[d.pid];
      return withMinFollow(() => {
        d.vi = variantIndexFor(p, d.vi, t.dataset.msel, t.value);
        const allowed = cfg(p, variantsOf(p)[d.vi]).flavors;
        d.flavors = d.flavors.filter((f) => allowed.includes(f));
        buildModal(`[data-msel="${t.dataset.msel}"]`);
      });
    }
    if (t.id === 'm-theme') { d.theme = t.value; syncModal(); if (t.value === OTHER_THEME) $('#m-theme-text').focus(); }
    if (t.name === 'flavor') {
      const { c } = ctx(d);
      d.flavors = $$('input[name="flavor"]', dlg).filter((i) => i.checked).map((i) => i.value);
      if (c.flavorMode === 'one') d.flavors = d.flavors.slice(0, 1);
      syncModal();
    }
  }
  function onModalInput(e) {
    const t = e.target, d = draft;
    if (t.id === 'm-qty') {
      const { p } = ctx(d), raw = t.value.trim() === '' ? NaN : Number(t.value.replace(',', '.'));
      d.qty = Number.isFinite(raw) ? raw / (p.gramsPerUnit || 1) : NaN;
      syncModal();
    } else if (t.id === 'm-note') d.note = t.value;
    else if (t.id === 'm-theme-text') { d.themeText = t.value; syncModal(); }
    else if (t.id === 'm-oc-name' || t.id === 'm-oc-hex') {
      const oc = d.colors.find((x) => x.custom); if (!oc) return;
      if (t.id === 'm-oc-name') oc.name = t.value;
      else { oc.hex = t.value; if (!oc.name.trim()) { oc.name = t.value; $('#m-oc-name').value = t.value; } }
      syncModal();
    }
  }

  /* =====================================================================
     Carrinho (painel lateral)
     ===================================================================== */
  const cdlg = $('#cart-dialog');

  function itemLines(it) {
    const { p, c } = priceOf(it), L = [];
    if (it.colors.length) L.push([it.colors.length > 1 ? 'Cores' : 'Cor', it.colors.map(colorLabel).join(', ')]);
    if (it.theme) L.push(['Tema', it.theme + (it.themeCustom ? ' (a confirmar)' : '')]);
    if (it.flavors.length) L.push([c.flavorMode === 'many' ? 'Sabores' : 'Recheio', it.flavors.join(', ')]);
    if (it.note) L.push(['Observações', it.note]);
    return L;
  }

  function renderCart() {
    const n = cart.items.length;
    $('#cart-count').textContent = n;
    $('#open-cart').setAttribute('aria-label', `Abrir carrinho, ${n} ${plural(n, 'item', 'itens')}`);
    $('#open-cart').classList.toggle('has-items', n > 0);
    const body = $('#c-body'), foot = $('#c-foot');
    if (!n) {
      body.innerHTML = '<div class="cart-empty"><p>Seu carrinho está vazio.</p><p>Escolha os doces no catálogo e personalize cada item.</p></div>';
      foot.innerHTML = '<div class="m-actions"><button type="button" class="btn" data-close>Ver catálogo</button></div>';
      return;
    }
    body.innerHTML = '<ul class="cart-list">' + cart.items.map((it, i) => {
      const r = priceOf(it), p = r.p, g = p.gramsPerUnit || 1;
      const min = minEff(p, r.c, it.colors.length);
      const priceLine = r.sub === null
        ? `<p class="ci-price consult"><strong>Preço sob consulta</strong> <span>${esc(r.consult.map(colorLabel).join(', '))}</span></p>`
        : `<p class="ci-price"><span>${brl(r.unit)} ${esc(p.priceUnit)}</span> <strong>${brl(r.sub)}</strong></p>`;
      const thumb = imagesOf(p)[0];
      return `<li class="cart-item" data-uid="${esc(it.uid)}">
        <img class="ci-img" src="${thumb ? IMG_DIR + encodeURIComponent(thumb) : DEFAULT_IMG}" alt="" data-fb data-name="${esc(p.name)}" width="72" height="72" loading="lazy">
        <div class="ci-main">
          <h3>${i + 1}. ${esc(it.vlabel)}</h3>
          ${itemLines(it).length ? `<ul class="ci-opts">${itemLines(it).map(([k, val]) => `<li><span>${k}:</span> ${esc(val)}</li>`).join('')}</ul>` : ''}
          ${priceLine}
          <div class="ci-ctl">
            <div class="qty sm"><button type="button" data-cact="dec" aria-label="Diminuir quantidade"${it.qty <= min ? ' disabled' : ''}>−</button>
              <input type="number" data-cqty min="${min * g}" step="${g}" value="${it.qty * g}" aria-label="Quantidade${p.gramsPerUnit ? ' em gramas' : ''}">
              <button type="button" data-cact="inc" aria-label="Aumentar quantidade">+</button><small>${p.gramsPerUnit ? 'g' : esc(unitName(p, it.qty))}</small></div>
            <button type="button" class="link" data-cact="edit">Editar</button>
            <button type="button" class="link danger" data-cact="remove">Remover</button>
          </div>
        </div></li>`;
    }).join('') + '</ul>';
    const t = totals();
    const totalLine = t.consultIdx.length === n
      ? '<strong>A combinar</strong>'
      : `<strong>${brl(t.sum)}</strong>`;
    foot.innerHTML = `
      <div class="m-total"><span>${t.consultIdx.length ? 'Total parcial' : 'Total estimado'}</span>${totalLine}</div>
      ${t.consultIdx.length ? `<p class="c-note warn">Este valor não inclui ${t.consultIdx.length === 1 ? 'o item' : 'os itens'} ${t.consultIdx.join(', ')}, com preço sob consulta. O total depende da confirmação da confeitaria.</p>` : ''}
      <details class="c-notes"${cart.note ? ' open' : ''}><summary>Observações do pedido (opcional)</summary>
        <textarea id="c-note" rows="2" maxlength="400" aria-label="Observações do pedido" placeholder="Data do evento, horário de retirada, dúvidas…">${esc(cart.note)}</textarea></details>
      <p class="c-legal">Enviar o pedido não o confirma. A reserva só vale após o atendimento e o pagamento de 50%.</p>
      <button type="button" class="btn wa" data-cact="finish">Finalizar pedido pelo WhatsApp</button>
      <div class="c-row"><button type="button" class="btn ghost" data-close>Continuar comprando</button><button type="button" class="link danger" data-cact="clear">Esvaziar carrinho</button></div>`;
  }

  function openCart() { renderCart(); if (!cdlg.open) cdlg.showModal(); }

  function setCartQty(id, units) {
    const it = cart.items.find((x) => x.uid === id); if (!it) return;
    const r = priceOf(it), min = minEff(r.p, r.c, it.colors.length);
    if (!Number.isInteger(units) || units < min) {
      toast(`O pedido mínimo é ${qtyText(r.p, min)}.`);
    } else it.qty = units;
    saveCart(); renderCart();
  }

  function whatsappMessage() {
    const brand = DATA.meta.brand, L = [`Olá! Gostaria de fazer uma encomenda na ${brand}.`, '', '*Meu pedido:*', ''];
    cart.items.forEach((it, i) => {
      const r = priceOf(it);
      L.push(`${i + 1}. ${it.vlabel}`, `   - Quantidade: ${qtyText(r.p, it.qty)}`);
      itemLines(it).forEach(([k, val]) => { if (k !== 'Observações') L.push(`   - ${k}: ${val}`); });
      if (r.sub === null) L.push(`   - Valor: *sob consulta* (${r.consult.map(colorLabel).join(', ')}: preço a confirmar)`);
      else L.push(`   - Valor unitário: ${brl(r.unit)}`, `   - Valor: ${brl(r.sub)}`);
      if (it.note) L.push(`   - Observações: ${it.note}`);
      L.push('');
    });
    const t = totals(), n = cart.items.length;
    if (!t.consultIdx.length) L.push(`*Total estimado: ${brl(t.sum)}*`);
    else if (t.consultIdx.length === n) L.push('*Total: a combinar (todos os itens têm preço sob consulta)*');
    else L.push(`*Total parcial: ${brl(t.sum)}* (sem os itens sob consulta: ${t.consultIdx.join(', ')}. O total final depende de orçamento.)`);
    if (cart.note.trim()) L.push('', `Observações: ${cart.note.trim()}`);
    L.push('', 'Gostaria de confirmar a disponibilidade e combinar a retirada.');
    return L.join('\n').replace(/\u00a0/g, ' ');
  }
  const waLink = (text) => `https://wa.me/${DATA.meta.whatsapp}?text=${encodeURIComponent(text)}`;

  function onCartClick(e) {
    const b = e.target.closest('[data-cact]'); if (!b) return;
    const row = b.closest('.cart-item'), id = row && row.dataset.uid, it = id && cart.items.find((x) => x.uid === id), a = b.dataset.cact;
    if (a === 'inc' || a === 'dec') { setCartQty(id, it.qty + (a === 'inc' ? 1 : -1)); }
    else if (a === 'remove') { cart.items = cart.items.filter((x) => x.uid !== id); saveCart(); renderCart(); }
    else if (a === 'edit') {
      const p = PRODUCTS[it.pid]; cdlg.close();
      openProduct(p.id, 0, it, true);
    } else if (a === 'clear') {
      if (window.confirm('Esvaziar o carrinho?')) { cart = { items: [], note: '' }; saveCart(); renderCart(); }
    } else if (a === 'finish') {
      // Sem a opção 'noopener' (ela faz window.open devolver sempre null); o opener é zerado à mão.
      const link = waLink(whatsappMessage()), w = window.open(link, '_blank');
      if (w) w.opener = null; else window.location.href = link; // pop-up bloqueado: abre na mesma aba
    }
  }
  function onCartChange(e) {
    if (e.target.matches('[data-cqty]')) {
      const id = e.target.closest('.cart-item').dataset.uid, it = cart.items.find((x) => x.uid === id);
      const g = PRODUCTS[it.pid].gramsPerUnit || 1, raw = Number(String(e.target.value).replace(',', '.'));
      setCartQty(id, Number.isFinite(raw) ? raw / g : NaN);
    }
  }

  /* =====================================================================
     Interface geral
     ===================================================================== */
  let toastTimer;
  function toast(msg, action) {
    const t = $('#toast');
    t.innerHTML = `<span>${esc(msg)}</span>`;
    if (action) {
      const b = document.createElement('button'); b.type = 'button'; b.textContent = action.label;
      b.addEventListener('click', () => { t.classList.remove('show'); action.fn(); });
      t.append(b);
    }
    t.classList.add('show');
    clearTimeout(toastTimer); toastTimer = setTimeout(() => t.classList.remove('show'), action ? 4500 : 2600);
  }

  function loadBrandImage(img, name, ok) {
    if (!okBrandImage(name)) return;
    img.addEventListener('load', () => ok(img), { once: true });
    img.src = BRAND_DIR + encodeURIComponent(name);
  }

  function initBrand() {
    const m = DATA.meta;
    const general = waLink(`Olá! Gostaria de saber mais sobre as encomendas da ${m.brand}.`);
    ['#header-wa', '#cta-wa', '#foot-wa'].forEach((id) => { $(id).href = general; });
    $('#foot-wa').textContent = `WhatsApp ${m.whatsappLabel}`;
    $('#foot-ig').href = `https://instagram.com/${m.instagram}`;
    $('#foot-ig').textContent = `Instagram @${m.instagram}`;
    // Logomarca oficial: aparece quando o arquivo existe; senão, fica o nome em texto.
    loadBrandImage($('#logo-img'), m.logo, (img) => { img.hidden = false; $('#logo-text').hidden = true; });
    loadBrandImage($('#foot-logo-img'), m.logo, () => { $('#foot-logo').hidden = false; });
    // Seção "Conheça a Delícias da Jac"
    if (m.about && m.about.length) {
      $('#story-body').innerHTML = m.about.map((t) => `<p>${esc(t)}</p>`).join('');
      const img = $('#story-img');
      img.alt = `${m.owner || 'Proprietária'}, proprietária da ${m.brand}`;
      loadBrandImage(img, m.ownerPhoto, () => { $('#story-photo').hidden = false; $('#story-grid').classList.add('has-photo'); });
    } else $('#historia').hidden = true;
  }

  function wireEvents() {
    $('#catnav').addEventListener('click', (e) => {
      const b = e.target.closest('[data-cat]'); if (!b) return;
      state.cat = b.dataset.cat; renderNav(); renderCatalog();
      $('#catalogo').scrollIntoView?.({ behavior: 'smooth', block: 'start' });
    });
    $('#search').addEventListener('input', (e) => { state.q = e.target.value; renderCatalog(); });
    $('#sort').addEventListener('change', (e) => { state.sort = e.target.value; renderCatalog(); });
    $('#clear').addEventListener('click', () => {
      Object.assign(state, { q: '', cat: 'todos', sort: 'default' });
      $('#search').value = ''; $('#sort').value = 'default'; renderNav(); renderCatalog();
    });
    const cat = $('#catalog');
    cat.addEventListener('click', onCatalogClick); cat.addEventListener('change', onCatalogChange);

    dlg.addEventListener('click', (e) => {
      if (e.target === dlg || e.target.closest('[data-close]')) return dlg.close();
      onModalClick(e);
    });
    dlg.addEventListener('change', onModalChange);
    dlg.addEventListener('input', onModalInput);
    dlg.addEventListener('close', () => { const back = draft && draft.fromCart; draft = null; if (back) openCart(); });

    $('#open-cart').addEventListener('click', openCart);
    cdlg.addEventListener('click', (e) => {
      if (e.target === cdlg || e.target.closest('[data-close]')) return cdlg.close();
      onCartClick(e);
    });
    cdlg.addEventListener('change', onCartChange);
    cdlg.addEventListener('input', (e) => { if (e.target.id === 'c-note') { cart.note = e.target.value; saveCart(); } });

    const top = $('#totop');
    window.addEventListener('scroll', () => { top.hidden = window.scrollY < 600; }, { passive: true });
    top.addEventListener('click', () => window.scrollTo({ top: 0, behavior: 'smooth' }));
  }

  async function init() {
    wireEvents();
    try {
      const res = await fetch(DATA_URL, { cache: 'no-cache' });
      if (!res.ok) throw new Error(res.status);
      DATA = await res.json();
    } catch {
      $('#catalog').innerHTML = '<p class="status error">Não foi possível carregar o catálogo. Atualize a página. Se você abriu o arquivo direto do computador, rode um servidor local (veja o README).</p>';
      return;
    }
    DATA.products.forEach((p) => { PRODUCTS[p.id] = p; });
    DATA.colors.forEach((c) => { COLORS[c.name] = c; });
    DATA.categories.forEach((c) => { CATEGORIES[c.id] = c; });
    initBrand();
    const dropped = loadCart();
    renderNav(); renderCatalog(); renderCart();
    if (dropped) toast(`${dropped} ${plural(dropped, 'item saiu', 'itens saíram')} do carrinho por não estar${dropped === 1 ? '' : 'em'} mais disponível${dropped === 1 ? '' : 'is'} no catálogo.`);
    // Se um item do carrinho mudou de preço, o carrinho já mostra o valor atual: nada é guardado no localStorage além das escolhas.
  }
  init();
})();
