import {
  SHOP_DOMAIN,
  STOREFRONT_API_VERSION,
  STOREFRONT_TOKEN,
  hasStorefront,
  withTimeout,
} from './config';

/**
 * Storefront API client.
 *
 * Reads the live catalogue (collections, products, search) and owns the cart —
 * Shopify's Cart API is the canonical place for a mobile cart, and it is what
 * the order service later turns into a real order.
 */

const endpoint = () =>
  `https://${SHOP_DOMAIN}/api/${STOREFRONT_API_VERSION}/graphql.json`;

async function gql(query, variables) {
  if (!hasStorefront()) throw new Error('storefront-not-configured');

  const res = await withTimeout((signal) =>
    fetch(endpoint(), {
      method: 'POST',
      signal,
      headers: {
        'Content-Type': 'application/json',
        'X-Shopify-Storefront-Access-Token': STOREFRONT_TOKEN,
      },
      body: JSON.stringify({ query, variables }),
    }),
  );

  if (!res.ok) throw new Error(`storefront-http-${res.status}`);
  const json = await res.json();
  if (json.errors?.length) throw new Error(json.errors[0].message);
  return json.data;
}

/** Maps a Storefront product node onto the shape the screens already consume. */
function toProduct(node, catId) {
  const variant = node.variants?.edges?.[0]?.node;
  const price = Number(variant?.price?.amount ?? node.priceRange?.minVariantPrice?.amount ?? 0);
  const arTitle = node.titleAr?.value;
  const arDesc = node.descriptionAr?.value;

  return {
    id: node.handle,
    shopifyId: node.id,
    variantId: variant?.id ?? null,
    cat: catId,
    price: Math.round(price),
    stock: variant?.quantityAvailable ?? (variant?.availableForSale ? 99 : 0),
    titleEn: node.title,
    titleAr: arTitle || node.title,
    descEn: node.description ?? '',
    descAr: arDesc || node.description || '',
    img: node.featuredImage?.url ? { uri: node.featuredImage.url } : undefined,
    available: variant?.availableForSale ?? true,
  };
}

const PRODUCT_FIELDS = `
  id
  handle
  title
  description
  featuredImage { url }
  priceRange { minVariantPrice { amount currencyCode } }
  titleAr: metafield(namespace: "oka", key: "title_ar") { value }
  descriptionAr: metafield(namespace: "oka", key: "description_ar") { value }
  variants(first: 1) {
    edges { node { id availableForSale quantityAvailable price { amount currencyCode } } }
  }
`;

/**
 * Loads the collections the app surfaces, each with its products, in one round
 * trip. `handles` keeps the app's navigation order stable and independent of
 * how collections happen to be sorted in the admin.
 */
export async function fetchCatalogue(handles) {
  const query = `
    query Catalogue {
      ${handles
        .map(
          (h, i) => `
        c${i}: collection(handle: ${JSON.stringify(h)}) {
          id
          handle
          title
          image { url }
          titleAr: metafield(namespace: "oka", key: "title_ar") { value }
          products(first: 40) { edges { node { ${PRODUCT_FIELDS} } } }
        }`,
        )
        .join('\n')}
    }
  `;

  const data = await gql(query);

  const cats = [];
  const products = [];

  handles.forEach((handle, i) => {
    const c = data[`c${i}`];
    if (!c) return;
    cats.push({
      id: c.handle,
      en: c.title,
      ar: c.titleAr?.value || c.title,
      img: c.image?.url ? { uri: c.image.url } : undefined,
      shopifyId: c.id,
    });
    c.products.edges.forEach(({ node }) => {
      if (!products.some((p) => p.id === node.handle)) {
        products.push(toProduct(node, c.handle));
      }
    });
  });

  return { cats, products };
}

/** Full-text product search, pushed to Shopify rather than filtered locally. */
export async function searchProducts(term, first = 20) {
  const data = await gql(
    `query Search($term: String!, $first: Int!) {
       products(query: $term, first: $first) {
         edges { node { ${PRODUCT_FIELDS} } }
       }
     }`,
    { term, first },
  );
  return data.products.edges.map(({ node }) => toProduct(node, 'search'));
}

/* ── Cart ──────────────────────────────────────────────────────────────── */

const CART_FIELDS = `
  id
  checkoutUrl
  totalQuantity
  cost { subtotalAmount { amount } totalAmount { amount } }
  lines(first: 50) {
    edges { node { id quantity merchandise { ... on ProductVariant { id product { handle } } } } }
  }
`;

export async function createCart(lines = []) {
  const data = await gql(
    `mutation CartCreate($lines: [CartLineInput!]) {
       cartCreate(input: { lines: $lines }) {
         cart { ${CART_FIELDS} }
         userErrors { message }
       }
     }`,
    { lines },
  );
  const { cart, userErrors } = data.cartCreate;
  if (userErrors?.length) throw new Error(userErrors[0].message);
  return cart;
}

/** Mirrors the local cart into Shopify so abandoned-cart flows see it. */
export async function setCartLines(cartId, lines) {
  const data = await gql(
    `mutation CartLinesUpdate($cartId: ID!, $lines: [CartLineInput!]!) {
       cartLinesAdd(cartId: $cartId, lines: $lines) {
         cart { ${CART_FIELDS} }
         userErrors { message }
       }
     }`,
    { cartId, lines },
  );
  const { cart, userErrors } = data.cartLinesAdd;
  if (userErrors?.length) throw new Error(userErrors[0].message);
  return cart;
}

export async function applyDiscountCode(cartId, code) {
  const data = await gql(
    `mutation CartDiscount($cartId: ID!, $codes: [String!]!) {
       cartDiscountCodesUpdate(cartId: $cartId, discountCodes: $codes) {
         cart { ${CART_FIELDS} discountCodes { code applicable } }
         userErrors { message }
       }
     }`,
    { cartId, codes: [code] },
  );
  return data.cartDiscountCodesUpdate.cart;
}
