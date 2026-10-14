// F: on an /ar/… URL (the store's published Arabic locale; primary is English) the inline script in
// layout/theme.liquid forces Arabic before first paint, overriding the shopper's saved choice. Every
// routes.* link on an /ar page keeps the /ar prefix, so a shopper who switches to English is flipped
// back to Arabic on every navigation.
const fs = require('fs');
const src = fs.readFileSync(require('path').resolve(__dirname, '../../../theme/layout/theme.liquid'), 'utf8');
const block = src.match(/\/\* Language before first paint[\s\S]*?\}\)\(\);/)[0];
function render(isPrimary, iso, defaultLang) {
  // Expand the Liquid used in that block exactly as Shopify would.
  let js = block.replace(/\{\{ settings\.default_lang \| json \}\}/g, JSON.stringify(defaultLang));
  js = js.replace(/\{%- unless request\.locale\.primary %\}([\s\S]*?)\{%- endunless %\}/, isPrimary ? '' : '$1');
  js = js.replace(/\{\{ request\.locale\.iso_code \| json \}\}/g, JSON.stringify(iso));
  return js;
}
function run(isPrimary, iso, saved) {
  const html = { lang: '', dir: '' };
  const localStorage = { getItem: () => saved };
  new Function('localStorage', 'document', render(isPrimary, iso, 'ar'))(localStorage, { documentElement: html });
  return html.lang;
}
console.log('Live store: primary locale en, published alternate ar, theme default_lang ar');
console.log('Unprefixed URL, shopper chose EN  →', run(true, 'en', 'en'));
console.log('/ar/... URL,     shopper chose EN  →', run(false, 'ar', 'en'), '  <- saved choice ignored');
console.log('/ar/... URL,     no choice saved   →', run(false, 'ar', null));
console.log('BUG REPRODUCED: toggling to English on an /ar page reverts to Arabic on the next page load (routes.* links keep /ar).');
