(() => {
  const filterButtons = Array.from(document.querySelectorAll('[data-filter]'));
  const projectCards = Array.from(document.querySelectorAll('.cards .card[data-cat]'));

  function applyProjectFilter(category) {
    projectCards.forEach((card) => {
      card.classList.toggle('hidden', category !== 'all' && card.dataset.cat !== category);
    });

    filterButtons.forEach((button) => {
      const isActive = button.dataset.filter === category;
      button.classList.toggle('active', isActive);
      button.setAttribute('aria-pressed', String(isActive));
    });
  }

  filterButtons.forEach((button) => {
    button.addEventListener('click', () => applyProjectFilter(button.dataset.filter || 'all'));
  });

  const yearEl = document.querySelector('#year');
  if (yearEl) yearEl.textContent = new Date().getFullYear();

  const STORAGE_KEY = 'carritoCBE';
  const WHATSAPP_NUMBER = '51960139960';
  const MAX_QUANTITY = 999;
  const EPP_PRODUCT_IDS = new Set([
    'lentes-seguridad-sobrelentes',
    'zapatos-industriales',
    'guantes-seguridad',
    'respirador-doble-via',
    'respirador-polvos',
    'chaleco-drill-naranja',
    'chaleco-panople-nacional',
    'camisa-oxford-azul-marino',
    'camisa-oxford-blanco',
    'camisa-oxford-azul-italiano',
    'camisa-oxford-celeste',
  ]);
  let carrito = [];
  let lastFocusedElement = null;
  let previousBodyOverflow = '';

  const panel = document.getElementById('cartModalPanel');
  const overlay = document.getElementById('cartModalOverlay');
  const itemList = document.getElementById('cartItemsContainer');
  const badge = document.getElementById('cartBadgeCount');
  const totalDisplay = document.getElementById('cartTotalDisplay');
  const quoteNotice = document.getElementById('cartQuoteNotice');
  const closeButton = panel ? panel.querySelector('[data-cart-close]') : null;

  function formatMoney(value) {
    return Number(value).toFixed(2);
  }

  function normalizeStoredCart(value) {
    if (!Array.isArray(value)) return [];

    const normalized = [];
    value.forEach((item) => {
      if (!item || typeof item !== 'object' || Array.isArray(item)) return;

      const name = typeof item.nombre === 'string' ? item.nombre : '';
      const idValue = typeof item.id === 'string' ? item.id : '';
      const priceValue = item.precioUnitario !== undefined ? item.precioUnitario : item.precio;
      const price = Number(priceValue);
      const quantity = Number(item.cantidad);
      const quoteOnly = item.requiereCotizacion === true || price === 0;
      const unit = typeof item.unidad === 'string' ? item.unidad.trim() : '';
      const legacySlug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
      const id = idValue || `legacy-${legacySlug || 'producto'}-${Math.round(price * 100)}`;

      if (
        !name.trim() || name.length > 150 ||
        !/^[a-z0-9][a-z0-9-]{0,79}$/.test(id) ||
        !Number.isFinite(price) || price < 0 || price > 1000000 ||
        !Number.isInteger(quantity) || quantity < 1 || quantity > MAX_QUANTITY ||
        (item.requiereCotizacion !== undefined && typeof item.requiereCotizacion !== 'boolean') ||
        (item.controlesCantidad !== undefined && typeof item.controlesCantidad !== 'boolean') ||
        (item.unidad !== undefined && typeof item.unidad !== 'string') ||
        unit.length > 60 || /[\u0000-\u001f\u007f]/.test(unit)
      ) return;

      const entry = {
        id,
        nombre: name,
        precioUnitario: Math.round(price * 100) / 100,
        cantidad: quantity,
        requiereCotizacion: quoteOnly,
        controlesCantidad: item.controlesCantidad === undefined
          ? !EPP_PRODUCT_IDS.has(id)
          : item.controlesCantidad,
      };
      if (unit) entry.unidad = unit;
      const existing = normalized.find((product) => product.id === entry.id);
      if (existing) {
        if (
          existing.nombre === entry.nombre &&
          existing.precioUnitario === entry.precioUnitario &&
          existing.requiereCotizacion === entry.requiereCotizacion &&
          existing.controlesCantidad === entry.controlesCantidad &&
          (existing.unidad || '') === (entry.unidad || '')
        ) {
          existing.cantidad = Math.min(MAX_QUANTITY, existing.cantidad + entry.cantidad);
        }
      } else {
        normalized.push(entry);
      }
    });

    return normalized;
  }

  function restoreCart(serializedValue) {
    try {
      const rawValue = serializedValue === undefined
        ? window.localStorage.getItem(STORAGE_KEY)
        : serializedValue;
      if (!rawValue) return [];
      return normalizeStoredCart(JSON.parse(rawValue));
    } catch (_error) {
      // El carrito sigue disponible en memoria si el almacenamiento está bloqueado o dañado.
      return [];
    }
  }

  function saveCart() {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(carrito));
    } catch (_error) {
      // No se muestran detalles del navegador ni del almacenamiento al visitante.
    }
  }

  function updateBadge() {
    if (!badge) return;
    const itemCount = carrito.length;
    badge.textContent = String(itemCount);
    badge.setAttribute('aria-label', `${itemCount} productos en el carrito`);
  }

  function createButton(label, accessibleName, action, productId, styles) {
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = label;
    button.setAttribute('aria-label', accessibleName);
    button.dataset.cartAction = action;
    button.dataset.cartId = productId;
    Object.assign(button.style, styles);
    return button;
  }

  function renderCart() {
    updateBadge();
    if (!itemList || !totalDisplay) return;

    itemList.replaceChildren();
    if (carrito.length === 0) {
      const emptyMessage = document.createElement('p');
      emptyMessage.textContent = 'Tu carrito está vacío.';
      emptyMessage.style.marginTop = '40px';
      emptyMessage.style.fontSize = '15px';
      itemList.appendChild(emptyMessage);
      totalDisplay.textContent = 'S/ 0.00';
      if (quoteNotice) {
        quoteNotice.hidden = true;
        quoteNotice.style.display = 'none';
      }
      return;
    }

    let estimatedTotal = 0;
    let hasQuoteOnlyItems = false;

    carrito.forEach((item) => {
      const subtotal = item.precioUnitario * item.cantidad;
      if (item.requiereCotizacion) hasQuoteOnlyItems = true;
      else estimatedTotal += subtotal;

      const row = document.createElement('article');
      row.setAttribute('role', 'listitem');
      Object.assign(row.style, {
        display: 'flex',
        flexDirection: 'column',
        padding: '12px 0',
        borderBottom: '1px solid #f1f5f9',
        textAlign: 'left',
        gap: '8px',
      });

      const heading = document.createElement('div');
      Object.assign(heading.style, {
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'flex-start',
      });

      const name = document.createElement('div');
      name.textContent = item.nombre;
      Object.assign(name.style, {
        fontWeight: '700',
        color: '#1e293b',
        fontSize: '14px',
        paddingRight: '10px',
      });
      heading.appendChild(name);
      heading.appendChild(createButton('×', `Eliminar ${item.nombre}`, 'remove', item.id, {
        background: 'none',
        border: 'none',
        color: '#ef4444',
        fontSize: '20px',
        lineHeight: '1',
        cursor: 'pointer',
      }));
      row.appendChild(heading);

      const details = document.createElement('div');
      Object.assign(details.style, {
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        gap: '10px',
      });

      const price = document.createElement('div');
      Object.assign(price.style, {
        fontSize: '13px',
        color: '#ff6600',
        fontWeight: '600',
      });
      if (item.requiereCotizacion) {
        price.textContent = 'Precio unitario y subtotal: por cotizar';
      } else {
        price.appendChild(document.createTextNode(
          item.controlesCantidad === false
            ? `Subtotal: S/ ${formatMoney(subtotal)} `
            : `S/ ${formatMoney(subtotal)} `
        ));
        const unitPrice = document.createElement('span');
        unitPrice.textContent = item.controlesCantidad === false
          ? `Precio unitario: S/ ${formatMoney(item.precioUnitario)}${item.unidad ? ` / ${item.unidad}` : ''}`
          : `(S/ ${formatMoney(item.precioUnitario)} c/u)`;
        if (item.controlesCantidad !== false && item.unidad) {
          unitPrice.textContent = `(S/ ${formatMoney(item.precioUnitario)} c/u · ${item.unidad})`;
        }
        unitPrice.style.fontSize = '11px';
        unitPrice.style.color = '#64748b';
        price.appendChild(unitPrice);
      }
      details.appendChild(price);

      if (item.controlesCantidad === false) {
        const quantityText = document.createElement('span');
        quantityText.textContent = item.unidad
          ? `Cantidad: ${item.cantidad} ${item.unidad}`
          : `Cantidad: ${item.cantidad} ${item.cantidad === 1 ? 'unidad' : 'unidades'}`;
        quantityText.setAttribute('aria-label', quantityText.textContent);
        Object.assign(quantityText.style, {
          fontSize: '13px',
          fontWeight: '700',
          color: '#1e293b',
          flexShrink: '0',
        });
        details.appendChild(quantityText);
      } else {
        const quantityControls = document.createElement('div');
        Object.assign(quantityControls.style, {
          display: 'flex',
          alignItems: 'center',
          border: '1px solid #cbd5e1',
          borderRadius: '6px',
          overflow: 'hidden',
          background: '#f8fafc',
          flexShrink: '0',
        });
        quantityControls.appendChild(createButton('−', `Reducir cantidad de ${item.nombre}`, 'decrement', item.id, {
          background: '#e2e8f0',
          border: 'none',
          padding: '4px 10px',
          cursor: 'pointer',
          fontWeight: 'bold',
          color: '#1e293b',
        }));
        const quantity = document.createElement('span');
        quantity.textContent = String(item.cantidad);
        quantity.setAttribute('aria-label', `Cantidad: ${item.cantidad}`);
        Object.assign(quantity.style, {
          padding: '0 12px',
          fontSize: '13px',
          fontWeight: '700',
          color: '#1e293b',
        });
        quantityControls.appendChild(quantity);
        quantityControls.appendChild(createButton('+', `Aumentar cantidad de ${item.nombre}`, 'increment', item.id, {
          background: '#e2e8f0',
          border: 'none',
          padding: '4px 10px',
          cursor: 'pointer',
          fontWeight: 'bold',
          color: '#1e293b',
        }));
        details.appendChild(quantityControls);
      }
      row.appendChild(details);
      itemList.appendChild(row);
    });

    totalDisplay.textContent = `${hasQuoteOnlyItems ? 'Parcial: ' : ''}S/ ${formatMoney(estimatedTotal)}`;
    if (quoteNotice) {
      quoteNotice.hidden = !hasQuoteOnlyItems;
      quoteNotice.style.display = hasQuoteOnlyItems ? 'block' : 'none';
      quoteNotice.textContent = hasQuoteOnlyItems
        ? 'Los productos por cotizar no están incluidos en el total.'
        : '';
    }
  }

  function setCartOpen(open, restoreFocus = true) {
    if (!panel || !overlay) return;

    if (open) {
      if (panel.getAttribute('aria-hidden') === 'false') return;
      lastFocusedElement = document.activeElement;
      previousBodyOverflow = document.body.style.overflow;
      panel.inert = false;
      panel.setAttribute('aria-hidden', 'false');
      panel.style.right = '0px';
      overlay.style.display = 'block';
      overlay.setAttribute('aria-hidden', 'false');
      document.body.style.overflow = 'hidden';
      document.querySelectorAll('[data-cart-trigger]').forEach((trigger) => {
        trigger.setAttribute('aria-expanded', 'true');
      });
      if (closeButton) closeButton.focus();
      return;
    }

    if (panel.getAttribute('aria-hidden') === 'true') return;
    panel.style.right = '-420px';
    panel.setAttribute('aria-hidden', 'true');
    panel.inert = true;
    overlay.style.display = 'none';
    overlay.setAttribute('aria-hidden', 'true');
    document.body.style.overflow = previousBodyOverflow;
    document.querySelectorAll('[data-cart-trigger]').forEach((trigger) => {
      trigger.setAttribute('aria-expanded', 'false');
    });

    if (restoreFocus && lastFocusedElement && lastFocusedElement.isConnected) {
      lastFocusedElement.focus();
    }
  }

  function toggleCart() {
    setCartOpen(panel && panel.getAttribute('aria-hidden') !== 'false');
  }

  function addProduct(button, forcedQuantity) {
    const id = button.dataset.cartId || '';
    const name = button.dataset.cartName || '';
    const price = Number(button.dataset.cartPrice);
    const quoteOnly = button.dataset.cartQuote === 'true';
    const unit = typeof button.dataset.cartUnit === 'string' ? button.dataset.cartUnit.trim() : '';
    const showQuantityControls = button.dataset.cartQuantityControls === undefined
      ? !EPP_PRODUCT_IDS.has(button.dataset.cartId || '')
      : button.dataset.cartQuantityControls === 'true';
    const quantityInputId = button.dataset.cartQuantityInput;
    const quantityInput = quantityInputId ? document.getElementById(quantityInputId) : null;
    const requestedQuantity = forcedQuantity === undefined
      ? (quantityInput ? Number.parseInt(quantityInput.value, 10) : 1)
      : Number(forcedQuantity);
    const quantity = Number.isInteger(requestedQuantity)
      ? Math.max(1, Math.min(MAX_QUANTITY, requestedQuantity))
      : 1;

    if (
      !/^[a-z0-9][a-z0-9-]{0,79}$/.test(id) || !name.trim() || name.length > 150 ||
      !Number.isFinite(price) || price < 0 || price > 1000000 ||
      unit.length > 60 || /[\u0000-\u001f\u007f]/.test(unit)
    ) return;

    const existing = carrito.find((item) => item.id === id);
    if (existing) {
      if (
        existing.nombre !== name || existing.precioUnitario !== price ||
        existing.requiereCotizacion !== quoteOnly ||
        existing.controlesCantidad !== showQuantityControls ||
        (existing.unidad || '') !== unit
      ) return;
      existing.cantidad = Math.min(MAX_QUANTITY, existing.cantidad + quantity);
    } else {
      const newItem = {
        id,
        nombre: name,
        precioUnitario: Math.round(price * 100) / 100,
        cantidad: quantity,
        requiereCotizacion: quoteOnly,
        controlesCantidad: showQuantityControls,
      };
      if (unit) newItem.unidad = unit;
      carrito.push(newItem);
    }

    if (quantityInput && button.closest('.epp-card')) quantityInput.value = '1';
    saveCart();
    renderCart();
    setCartOpen(true, false);
  }

  function updateQuantity(id, change) {
    const item = carrito.find((product) => product.id === id);
    if (!item) return;
    const nextQuantity = item.cantidad + change;
    if (nextQuantity < 1) {
      carrito = carrito.filter((product) => product.id !== id);
    } else {
      item.cantidad = Math.min(MAX_QUANTITY, nextQuantity);
    }
    saveCart();
    renderCart();
  }

  function removeProduct(id) {
    carrito = carrito.filter((item) => item.id !== id);
    saveCart();
    renderCart();
  }

  // API compartida para cualquier catálogo que use el carrito central.
  window.CBECart = Object.freeze({
    add: (product, quantity = 1, showQuantityControls = !EPP_PRODUCT_IDS.has(product.id)) => {
      const button = document.createElement('button');
      button.dataset.cartId = product.id;
      button.dataset.cartName = product.nombre;
      button.dataset.cartPrice = String(product.precioUnitario);
      button.dataset.cartQuote = product.requiereCotizacion ? 'true' : 'false';
      if (typeof product.unidad === 'string' && product.unidad.trim()) {
        button.dataset.cartUnit = product.unidad.trim();
      }
      button.dataset.cartQuantityControls = String(showQuantityControls);
      addProduct(button, quantity);
    },
    setQuantity: (id, quantity) => {
      const value = Number(quantity);
      const item = carrito.find((product) => product.id === id);
      if (!item || !Number.isInteger(value) || value < 1 || value > MAX_QUANTITY) return;
      item.cantidad = value;
      saveCart();
      renderCart();
    },
    remove: removeProduct,
    subtotal: (id) => {
      const item = carrito.find((product) => product.id === id);
      return item ? item.precioUnitario * item.cantidad : 0;
    },
    total: () => carrito.reduce((sum, item) => sum + item.precioUnitario * item.cantidad, 0),
    items: () => carrito.map((item) => ({ ...item })),
  });

  function adjustSelectedQuantity(button) {
    const targetId = button.dataset.cartInputId;
    const input = targetId
      ? document.getElementById(targetId)
      : button.closest('.epp-card')?.querySelector('.input-cant-epp');
    if (!input) return;
    const currentValue = Number.parseInt(input.value, 10) || 1;
    const step = Number(button.dataset.cartQuantityStep) || 0;
    input.value = String(Math.max(1, Math.min(MAX_QUANTITY, currentValue + step)));
  }

  function sendOrderToWhatsApp() {
    if (carrito.length === 0) {
      window.alert('Tu carrito está vacío. Agrega productos para cotizar.');
      return;
    }

    let estimatedTotal = 0;
    const lines = ['Hola CBE SOLUCIONES E.I.R.L., deseo solicitar una cotización:', ''];
    carrito.forEach((item, index) => {
      const subtotal = item.precioUnitario * item.cantidad;
      lines.push(`${index + 1}. ${item.nombre}`);
      lines.push(`Cantidad: ${item.cantidad}${item.unidad ? ` ${item.unidad}` : ''}`);
      lines.push(`Precio unitario: ${item.requiereCotizacion ? 'Por cotizar' : `S/ ${formatMoney(item.precioUnitario)}${item.unidad ? ` / ${item.unidad}` : ''}`}`);
      lines.push(`Subtotal: ${item.requiereCotizacion ? 'Por cotizar' : `S/ ${formatMoney(subtotal)}`}`);
      lines.push('');
      if (!item.requiereCotizacion) estimatedTotal += subtotal;
    });

    const hasQuoteOnlyItems = carrito.some((item) => item.requiereCotizacion);
    lines.push(
      hasQuoteOnlyItems
        ? `Total estimado parcial (no incluye productos por cotizar): S/ ${formatMoney(estimatedTotal)}`
        : `Total estimado: S/ ${formatMoney(estimatedTotal)}`
    );

    const url = `https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(lines.join('\n'))}`;
    window.open(url, '_blank', 'noopener,noreferrer');
  }

  document.addEventListener('click', (event) => {
    const target = event.target;
    if (!(target instanceof Element)) return;

    const trigger = target.closest('[data-cart-trigger]');
    if (trigger) {
      toggleCart();
      return;
    }

    if (target.closest('[data-cart-close]') || target.closest('[data-cart-overlay]')) {
      setCartOpen(false);
      return;
    }

    const quantityStep = target.closest('[data-cart-quantity-step]');
    if (quantityStep) {
      adjustSelectedQuantity(quantityStep);
      return;
    }

    const addButton = target.closest('[data-cart-add]');
    if (addButton) {
      const eppCard = addButton.closest('.epp-card');
      if (eppCard) {
        const quantityInput = eppCard.querySelector('.input-cant-epp');
        const selectedQuantity = quantityInput ? Number.parseInt(quantityInput.value, 10) : 1;
        window.CBECart.add({
          id: addButton.dataset.cartId,
          nombre: addButton.dataset.cartName,
          precioUnitario: Number(addButton.dataset.cartPrice),
          requiereCotizacion: addButton.dataset.cartQuote === 'true',
          unidad: addButton.dataset.cartUnit,
        }, selectedQuantity, false);
        if (quantityInput) quantityInput.value = '1';
        return;
      }
      addProduct(addButton);
      return;
    }

    const cartAction = target.closest('[data-cart-action]');
    if (cartAction) {
      const { cartAction: action, cartId: id } = cartAction.dataset;
      if (action === 'increment') updateQuantity(id, 1);
      if (action === 'decrement') updateQuantity(id, -1);
      if (action === 'remove') removeProduct(id);
      return;
    }

    if (target.closest('[data-cart-checkout]')) sendOrderToWhatsApp();
  });

  document.addEventListener('keydown', (event) => {
    if (!panel || panel.getAttribute('aria-hidden') !== 'false') return;

    if (event.key === 'Escape') {
      event.preventDefault();
      setCartOpen(false);
      return;
    }

    if (event.key !== 'Tab') return;
    const focusable = Array.from(panel.querySelectorAll(
      'button:not([disabled]), a[href], input:not([disabled]), [tabindex]:not([tabindex="-1"])'
    )).filter((element) => !element.hidden);
    if (focusable.length === 0) {
      event.preventDefault();
      panel.focus();
      return;
    }

    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  });

  window.addEventListener('storage', (event) => {
    if (event.key !== STORAGE_KEY) return;
    carrito = restoreCart(event.newValue);
    renderCart();
  });

  if (panel) {
    panel.inert = true;
    panel.setAttribute('aria-hidden', 'true');
  }
  carrito = restoreCart();
  renderCart();
})();
