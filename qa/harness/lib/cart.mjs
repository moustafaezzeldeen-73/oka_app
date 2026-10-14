/**
 * Stateful cart, mirroring Shopify's Cart AJAX API shapes and errors, with the
 * store's REAL automatic discounts (exported read-only) evaluated client-side.
 *
 * Discount engine (approximation of Shopify's, documented in README):
 *  - all 4 automatic discounts have combinesWith = false → the single best one wins
 *  - a code discount also doesn't combine → whichever saves more applies; the
 *    other code shows {applicable:false}
 */
import crypto from 'node:crypto';

export class CartError extends Error {
  constructor(status, description, message = 'Cart Error') { super(description); this.status = status; this.body = { status, message, description }; }
}

export function newCart() {
  return { token: `qa${crypto.randomBytes(12).toString('hex')}?key=${crypto.randomBytes(16).toString('hex')}`, note: '', attributes: {}, lines: [], codes: [] };
}

const lineKey = (variantId, props) => `${variantId}:${crypto.createHash('md5').update(JSON.stringify(props || {})).digest('hex')}`;

export class CartService {
  constructor(store) { this.store = store; }

  lookup(id) {
    const hit = this.store.variantIndex.get(Number(id));
    if (!hit || !this.store.isLive(hit.product)) throw new CartError(422, 'Cannot find variant');
    return hit;
  }
  /** Max quantity allowed for a variant, or Infinity. */
  maxQty(v) { return v.inventory_management === 'shopify' && v.inventory_policy === 'deny' ? Math.max(0, v.inventory_quantity) : Infinity; }
  checkQty(hit, wanted) {
    const { product: p, variant: v } = hit;
    const max = this.maxQty(v);
    if (!v.available || max === 0) throw new CartError(422, `The product '${p.title}' is already sold out.`);
    if (wanted > max) throw new CartError(422, `You can only add ${max} ${p.title} to the cart.`);
  }

  add(cart, items) {
    if (!Array.isArray(items) || !items.length) throw new CartError(400, 'Required parameter missing or invalid: items', 'Parameter Missing or Invalid');
    const staged = cart.lines.map((l) => ({ ...l }));
    const added = [];
    for (const it of items) {
      if (it.id == null || it.id === '' || Number.isNaN(Number(it.id))) throw new CartError(400, 'Required parameter missing or invalid: items', 'Parameter Missing or Invalid');
      const qty = it.quantity == null || it.quantity === '' ? 1 : parseInt(it.quantity, 10);
      if (Number.isNaN(qty) || qty < 0) throw new CartError(422, 'Quantity must be a positive number');
      if (qty === 0) continue;
      const hit = this.lookup(it.id);
      const props = it.properties && Object.keys(it.properties).length ? it.properties : {};
      const key = lineKey(hit.variant.id, props);
      const existing = staged.find((l) => l.key === key);
      const inCart = staged.filter((l) => l.variant_id === hit.variant.id).reduce((a, l) => a + l.quantity, 0);
      const max = this.maxQty(hit.variant);
      if (inCart > 0 && inCart >= max) throw new CartError(422, `You can't add more ${hit.product.title} to the cart.`);
      this.checkQty(hit, inCart + qty);
      if (existing) existing.quantity += qty;
      else staged.push({ key, variant_id: hit.variant.id, quantity: qty, properties: props });
      added.push(key);
    }
    cart.lines = staged;
    return added;
  }
  change(cart, { id, line, quantity, properties }) {
    let target = null;
    if (line != null && line !== '') target = cart.lines[parseInt(line, 10) - 1];
    else if (id != null && id !== '') {
      const s = String(id);
      target = s.includes(':') ? cart.lines.find((l) => l.key === s) : cart.lines.find((l) => l.variant_id === Number(s));
    }
    if (!target) throw new CartError(400, 'Cannot change line item that does not exist', 'Cart Error');
    const qty = quantity == null || quantity === '' ? target.quantity : parseInt(quantity, 10);
    if (Number.isNaN(qty) || qty < 0) throw new CartError(400, 'Invalid quantity', 'Cart Error');
    if (qty === 0) cart.lines = cart.lines.filter((l) => l !== target);
    else {
      const hit = this.store.variantIndex.get(target.variant_id);
      const others = cart.lines.filter((l) => l !== target && l.variant_id === target.variant_id).reduce((a, l) => a + l.quantity, 0);
      if (qty > target.quantity) this.checkQty(hit, others + qty);
      target.quantity = qty;
      if (properties) { target.properties = properties; target.key = lineKey(target.variant_id, properties); }
    }
  }
  update(cart, { updates, note, attributes, discount }) {
    if (updates) {
      const entries = Array.isArray(updates) ? updates.map((q, i) => [i, q, 'line']) : Object.entries(updates).map(([k, q]) => [k, q, 'id']);
      const next = cart.lines.map((l) => ({ ...l }));
      for (const [k, q, mode] of entries) {
        const qty = parseInt(q, 10);
        if (Number.isNaN(qty) || qty < 0) continue;
        if (mode === 'line') { if (next[k]) next[k].quantity = qty; continue; }
        const s = String(k);
        const line = s.includes(':') ? next.find((l) => l.key === s) : next.find((l) => l.variant_id === Number(s));
        if (line) {
          if (qty > line.quantity) this.checkQty(this.store.variantIndex.get(line.variant_id), qty);
          line.quantity = qty;
        } else if (qty > 0) {
          const hit = this.lookup(s);
          this.checkQty(hit, qty);
          next.push({ key: lineKey(hit.variant.id, {}), variant_id: hit.variant.id, quantity: qty, properties: {} });
        }
      }
      cart.lines = next.filter((l) => l.quantity > 0);
    }
    if (note != null) cart.note = String(note);
    if (attributes && typeof attributes === 'object') {
      for (const [k, v] of Object.entries(attributes)) { if (v === '' || v == null) delete cart.attributes[k]; else cart.attributes[k] = v; }
    }
    if (discount != null) cart.codes = String(discount).split(',').map((c) => c.trim()).filter(Boolean);
  }
  clear(cart) { cart.lines = []; cart.note = ''; cart.attributes = {}; }

  /* ── discounts ─────────────────────────────────────────────────────── */
  inCollections(handle, colls) { const p = this.store.byHandle.get(handle); return p && colls.some((c) => p.collections.includes(c)); }
  entitled(items, spec, handle) {
    if (!spec) return false;
    if (spec.__typename === 'AllDiscountItems') return true;
    if (spec.__typename === 'DiscountProducts') return spec.products.nodes.some((n) => n.handle === handle) || spec.productVariants.nodes.some((n) => Number(n.legacyResourceId) === items);
    if (spec.__typename === 'DiscountCollections') return this.inCollections(handle, spec.collections.nodes.map((n) => n.handle));
    return false;
  }
  /** → { title, type:'automatic'|'discount_code', allocations: Map(lineKey → cents) , total } */
  evalAutomatic(d, lines) {
    const alloc = new Map();
    const add = (k, c) => alloc.set(k, (alloc.get(k) || 0) + c);
    if (d.__typename === 'DiscountAutomaticBasic') {
      const ent = lines.filter((l) => this.entitled(l.variant_id, d.customerGets.items, l.handle));
      const qty = ent.reduce((a, l) => a + l.quantity, 0);
      const sub = ent.reduce((a, l) => a + l.price * l.quantity, 0);
      const mr = d.minimumRequirement;
      if (mr?.__typename === 'DiscountMinimumQuantity' && qty < Number(mr.greaterThanOrEqualToQuantity)) return null;
      if (mr?.__typename === 'DiscountMinimumSubtotal' && sub < Number(mr.greaterThanOrEqualToSubtotal.amount) * 100) return null;
      if (!ent.length) return null;
      const val = d.customerGets.value;
      if (val.__typename === 'DiscountAmount') {
        let amt = Math.min(Math.round(Number(val.amount.amount) * 100) * (val.appliesOnEachItem ? qty : 1), sub);
        if (val.appliesOnEachItem) ent.forEach((l) => add(l.key, Math.round(Number(val.amount.amount) * 100) * l.quantity));
        else { let left = amt; ent.forEach((l, i) => { const share = i === ent.length - 1 ? left : Math.floor((amt * l.price * l.quantity) / sub); add(l.key, share); left -= share; }); }
      } else if (val.__typename === 'DiscountPercentage') ent.forEach((l) => add(l.key, Math.round(l.price * l.quantity * val.percentage)));
    } else if (d.__typename === 'DiscountAutomaticBxgy') {
      const buys = d.customerBuys;
      const buyLines = lines.filter((l) => this.entitled(l.variant_id, buys.items, l.handle));
      const getUnits = [];
      for (const l of lines) if (this.entitled(l.variant_id, d.customerGets.items, l.handle)) for (let i = 0; i < l.quantity; i++) getUnits.push(l);
      getUnits.sort((a, b) => a.price - b.price); // Shopify discounts the cheapest eligible items first
      const perSet = Number(d.customerGets.value.quantity.quantity);
      let sets;
      if (buys.value.__typename === 'DiscountQuantity') sets = Math.floor(buyLines.reduce((a, l) => a + l.quantity, 0) / Number(buys.value.quantity));
      else sets = buyLines.reduce((a, l) => a + l.price * l.quantity, 0) >= Number(buys.value.amount) * 100 ? 1 : 0;
      if (d.usesPerOrderLimit) sets = Math.min(sets, Number(d.usesPerOrderLimit));
      if (buys.value.__typename !== 'DiscountQuantity') sets = Math.min(sets, 1);
      const eff = d.customerGets.value.effect;
      getUnits.slice(0, sets * perSet).forEach((l) => add(l.key, eff.__typename === 'DiscountPercentage' ? Math.round(l.price * eff.percentage) : Math.min(l.price, Math.round(Number(eff.amount.amount) * 100))));
    }
    const total = [...alloc.values()].reduce((a, b) => a + b, 0);
    return total > 0 ? { title: d.title, type: 'automatic', allocations: alloc, total, level: 'line' } : null;
  }
  evalCode(code, lines, subtotal) {
    const d = this.store.discounts.codes.find((c) => c.code.toLowerCase() === code.toLowerCase());
    if (!d || d.expired || subtotal < (d.min_subtotal || 0) || !lines.length) return null;
    if (d.type === 'free_shipping') return { title: d.code, code: d.code, type: 'discount_code', allocations: new Map(), total: 0, level: 'shipping', shipping: true };
    const amt = d.type === 'percentage' ? Math.round((subtotal * d.value) / 100) : Math.min(d.value, subtotal);
    const alloc = new Map(); let left = amt;
    lines.forEach((l, i) => { const share = i === lines.length - 1 ? left : Math.floor((amt * l.price * l.quantity) / subtotal); alloc.set(l.key, share); left -= share; });
    return { title: d.code, code: d.code, type: 'discount_code', allocations: alloc, total: amt, level: 'cart', value_type: d.type, value: d.value };
  }

  /** The /cart.js JSON. `view` is a model View (for URLs/images/translations). */
  toJSON(cart, view) {
    const lines = cart.lines.map((l) => {
      const { product: p, variant: v } = this.store.variantIndex.get(l.variant_id);
      return { ...l, p, v, handle: p.handle, price: v.price };
    });
    const subtotal = lines.reduce((a, l) => a + l.price * l.quantity, 0);
    const autos = this.store.discounts.automatic.filter((d) => d.status === 'ACTIVE').map((d) => this.evalAutomatic(d, lines)).filter(Boolean);
    const codes = cart.codes.map((c) => ({ code: c, res: this.evalCode(c, lines, subtotal) }));
    const candidates = [...autos, ...codes.map((c) => c.res).filter(Boolean)];
    const best = candidates.sort((a, b) => b.total - a.total)[0] || null;
    const discount_codes = codes.map((c) => ({ code: c.code, applicable: Boolean(c.res && best && c.res === best) }));
    const app = best ? { type: best.type, key: best.code || best.title, title: best.title, description: null, value: String(best.value ?? ''), created_at: new Date().toISOString(), value_type: best.value_type || 'fixed_amount', allocation_method: best.level === 'line' ? 'each' : 'across', target_selection: best.level === 'line' ? 'entitled' : 'all', target_type: best.shipping ? 'shipping_line' : 'line_item', total_allocated_amount: best.total } : null;
    const items = lines.map((l) => {
      const disc = best && best.level === 'line' ? best.allocations.get(l.key) || 0 : 0;
      const cartDisc = best && best.level === 'cart' ? best.allocations.get(l.key) || 0 : 0;
      const img = l.p.media.find((m) => m.media_type === 'image');
      const title = view.tr(l.p, 'title', l.p.title);
      return {
        id: l.v.id, properties: l.properties || {}, quantity: l.quantity, variant_id: l.v.id, key: l.key,
        title: l.p.has_only_default_variant ? title : `${title} - ${l.v.title}`,
        price: l.v.price, original_price: l.v.price, presentment_price: l.v.price / 100,
        discounted_price: l.v.price - Math.floor(disc / l.quantity), line_price: l.v.price * l.quantity - disc, original_line_price: l.v.price * l.quantity,
        total_discount: disc, discounts: disc ? [{ amount: disc, title: best.title }] : [],
        sku: l.v.sku, grams: Math.round(l.v.weight * 1000), vendor: l.p.vendor, taxable: l.v.taxable, product_id: l.p.id,
        product_has_only_default_variant: l.p.has_only_default_variant, gift_card: false,
        final_price: l.v.price - Math.floor(disc / l.quantity), final_line_price: l.v.price * l.quantity - disc,
        url: view.url(`/products/${l.p.handle}?variant=${l.v.id}`),
        featured_image: img ? { aspect_ratio: img.width / img.height, alt: img.alt || title, height: img.height, url: view.imgCdn(img).replace(/^\/\//, 'http://'), width: img.width } : null,
        image: img ? view.imgCdn(img).replace(/^\/\//, 'http://') : null,
        handle: l.p.handle, requires_shipping: l.v.requires_shipping, product_type: l.p.product_type, product_title: title,
        product_description: view.tr(l.p, 'body_html', l.p.body_html), variant_title: l.p.has_only_default_variant ? null : l.v.title,
        variant_options: [l.v.option1, l.v.option2, l.v.option3].filter((x) => x != null),
        options_with_values: l.p.options.map((o, i) => ({ name: o.name, value: [l.v.option1, l.v.option2, l.v.option3][i] })),
        line_level_discount_allocations: disc ? [{ amount: disc, discount_application: app }] : [], line_level_total_discount: disc,
        quantity_rule: { min: 1, max: null, increment: 1 }, has_components: false,
        __cart_level_discount: cartDisc,
      };
    });
    const lineDisc = items.reduce((a, i) => a + i.total_discount, 0);
    const cartDisc = items.reduce((a, i) => a + i.__cart_level_discount, 0);
    items.forEach((i) => delete i.__cart_level_discount);
    return {
      token: cart.token, note: cart.note || '', attributes: cart.attributes,
      original_total_price: subtotal, total_price: subtotal - lineDisc - cartDisc, total_discount: lineDisc + cartDisc,
      total_weight: items.reduce((a, i) => a + i.grams * i.quantity, 0), item_count: items.reduce((a, i) => a + i.quantity, 0),
      items, requires_shipping: items.some((i) => i.requires_shipping), currency: 'EGP',
      items_subtotal_price: subtotal - lineDisc,
      cart_level_discount_applications: best && best.level !== 'line' ? [{ ...app, discounted_amount: best.total }] : [],
      discount_codes,
    };
  }
}
