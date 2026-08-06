/**
 * Catalogue, categories, offers and copy — a straight port of the prototype's
 * PRODUCTS / CATS / OFFERS / STR tables, with the placeholder image URLs
 * swapped for the real photography that shipped inside the prototype bundle.
 */

export const PRODUCT_IMAGES = {
  cobra: require('../assets/products/cobra.jpg'),
  'carbon-black': require('../assets/products/carbon-black.jpg'),
  'cobra-led': require('../assets/products/cobra-led.jpg'),
  'stem-3': require('../assets/products/stem-3.jpg'),
  'stem-1': require('../assets/products/stem-1.jpg'),
  hose: require('../assets/products/hose.jpg'),
  tongs: require('../assets/products/tongs.jpg'),
  'bowl-cantaloupe': require('../assets/products/bowl-cantaloupe.jpg'),
  'bowl-mint': require('../assets/products/bowl-mint.jpg'),
  'bowl-lady-killer': require('../assets/products/bowl-lady-killer.jpg'),
  'bowl-pistachio': require('../assets/products/bowl-pistachio.jpg'),
  'bowl-gum': require('../assets/products/bowl-gum.jpg'),
  'silicon-gourmets': require('../assets/products/silicon-gourmets.jpg'),
  'steel-plate': require('../assets/products/steel-plate.jpg'),
  'standard-hose': require('../assets/products/standard-hose.jpg'),
  'coconut-coal': require('../assets/products/coconut-coal.jpg'),
  'foil-1pc': require('../assets/products/foil-1pc.jpg'),
  'tongs-steel': require('../assets/products/tongs-steel.jpg'),
  'black-tobacco': require('../assets/products/black-tobacco.jpg'),
  'black-tobacco-plate': require('../assets/products/black-tobacco-plate.jpg'),
  'bowl-glazed-15g': require('../assets/products/bowl-glazed-15g.jpg'),
  'coal-gaze-protector': require('../assets/products/coal-gaze-protector.jpg'),
};

export const CATEGORY_IMAGES = {
  'oka-parts': require('../assets/categories/oka-parts.png'),
  hoses: require('../assets/categories/hoses.png'),
  coal: require('../assets/categories/coal.jpg'),
  'dark-tobacco': require('../assets/categories/dark-tobacco.jpg'),
  bowls: require('../assets/categories/bowls.png'),
};

export const OFFER_IMAGES = {
  promo1: require('../assets/offers/promo1.jpg'),
  promo2: require('../assets/offers/promo2.jpg'),
  promo3: require('../assets/offers/promo3.jpg'),
  promo4: require('../assets/offers/promo4.jpg'),
  promo5: require('../assets/offers/promo5.jpg'),
};

export const SHOP_LOGO = require('../assets/brand/logo.png');

export const PRODUCTS = [
  {
    id: 'cobra', cat: 'hookahs', price: 189, stock: 12,
    titleEn: 'OKA Cobra', titleAr: 'أوكا كوبرا',
    descEn: 'A futuristic angular hookah with heavy-duty construction and standout style.',
    descAr: 'شيشة بتصميم مستقبلي حاد وبناء متين يميزك عن الجميع.',
  },
  {
    id: 'carbon-black', cat: 'hookahs', price: 189, stock: 8,
    titleEn: 'OKA Carbon Black', titleAr: 'أوكا كاربون بلاك',
    descEn: 'Easy Pro hookah delivering a smooth, flavorful session with great heat retention.',
    descAr: 'شيشة إيزي برو لجلسة سلسة وغنية بالنكهة مع احتفاظ ممتاز بالحرارة.',
  },
  {
    id: 'cobra-led', cat: 'accessories', price: 189, stock: 3,
    titleEn: 'OKA Cobra LED Base', titleAr: 'قاعدة أوكا كوبرا المضيئة',
    descEn: 'Elegant pine-wood rechargeable LED base for the Cobra, USB-C charging.',
    descAr: 'قاعدة خشبية أنيقة قابلة لإعادة الشحن بإضاءة LED لكوبرا، شحن USB-C.',
  },
  {
    id: 'stem-3', cat: 'oka-parts', price: 110, stock: 40,
    titleEn: 'OKA Stem — 3 Pack', titleAr: 'عمود أوكا - ٣ قطع',
    descEn: 'Three brand-new OKA stems to refresh your setup.',
    descAr: 'ثلاثة أعمدة أوكا جديدة لتجديد طقمك.',
  },
  {
    id: 'stem-1', cat: 'oka-parts', price: 59, stock: 25,
    titleEn: 'OKA Stem — Single', titleAr: 'عمود أوكا - قطعة',
    descEn: 'One replacement OKA stem for a fresh session.',
    descAr: 'عمود أوكا واحد بديل لجلسة جديدة.',
  },
  {
    id: 'hose', cat: 'hoses', price: 45, stock: 60,
    titleEn: 'Premium 1.5m Hose', titleAr: 'خرطوم فاخر ١.٥ متر',
    descEn: 'Easy-draw, transparent hose built for comfort.',
    descAr: 'خرطوم شفاف سهل السحب مصمم للراحة.',
  },
  {
    id: 'tongs', cat: 'accessories', price: 69, stock: 30,
    titleEn: 'Tongs & Foil Combo', titleAr: 'طقم ملقط وفويل',
    descEn: 'Foil and coal tongs combo to elevate your session.',
    descAr: 'طقم فويل وملقط فحم لرفع مستوى جلستك.',
  },
  {
    id: 'bowl-cantaloupe', cat: 'tobacco', price: 49, stock: 100,
    titleEn: 'Tobacco Bowl — Cantaloupe 12g', titleAr: 'بولّ تبغ - كانتالوب ١٢ جم',
    descEn: 'Ready-to-smoke bowl, 45–60 min sessions, Al Kabeer tobacco.',
    descAr: 'بول جاهز للتدخين، جلسة ٤٥-٦٠ دقيقة، تبغ الكبير.',
  },
  {
    id: 'bowl-mint', cat: 'tobacco', price: 49, stock: 80,
    titleEn: 'Tobacco Bowl — Gum Mint 12g', titleAr: 'بولّ تبغ - نعناع علكة ١٢ جم',
    descEn: 'Ready-to-smoke bowl, 45–60 min sessions, Al Kabeer tobacco.',
    descAr: 'بول جاهز للتدخين، جلسة ٤٥-٦٠ دقيقة، تبغ الكبير.',
  },
  {
    id: 'bowl-lady-killer', cat: 'tobacco', price: 49, stock: 70,
    titleEn: 'Tobacco Bowl — Lady Killer 12g', titleAr: 'بولّ تبغ - ليدي كيلر ١٢ جم',
    descEn: 'Ready-to-smoke bowl, 45–60 min sessions, Al Kabeer tobacco.',
    descAr: 'بول جاهز للتدخين، جلسة ٤٥-٦٠ دقيقة، تبغ الكبير.',
  },
  {
    id: 'bowl-pistachio', cat: 'tobacco', price: 49, stock: 50,
    titleEn: 'Tobacco Bowl — Pistachio 12g', titleAr: 'بولّ تبغ - فستق ١٢ جم',
    descEn: 'Ready-to-smoke bowl, 45–60 min sessions, Al Kabeer tobacco.',
    descAr: 'بول جاهز للتدخين، جلسة ٤٥-٦٠ دقيقة، تبغ الكبير.',
  },
  {
    id: 'bowl-gum', cat: 'tobacco', price: 49, stock: 20,
    titleEn: 'Tobacco Bowl — Gum 12g', titleAr: 'بولّ تبغ - علكة ١٢ جم',
    descEn: 'Ready-to-smoke bowl, 45–60 min sessions, Al Kabeer tobacco.',
    descAr: 'بول جاهز للتدخين، جلسة ٤٥-٦٠ دقيقة، تبغ الكبير.',
  },
  {
    id: 'silicon-gourmets', cat: 'oka-parts', price: 10, stock: 80,
    titleEn: 'Silicon Gourmets — Hose / Bowl', titleAr: 'جوامد سيليكون - خرطوم / بول',
    descEn: 'Lightweight silicon gourmets for a tight, leak-free fit.',
    descAr: 'جوامد سيليكون خفيفة لتثبيت محكم بدون تسريب.',
  },
  {
    id: 'steel-plate', cat: 'oka-parts', price: 39, stock: 60,
    titleEn: 'Steel Plate', titleAr: 'طبق ستيل',
    descEn: 'Stainless steel plate that keeps your session tidy.',
    descAr: 'طبق ستانلس ستيل يحافظ على نظافة جلستك.',
  },
  {
    id: 'standard-hose', cat: 'hoses', price: 30, stock: 40,
    titleEn: 'Standard 1.5m Hose', titleAr: 'خرطوم عادي ١.٥ متر',
    descEn: 'Durable everyday hose with a standard draw.',
    descAr: 'خرطوم متين للاستخدام اليومي بسحب عادي.',
  },
  {
    id: 'coconut-coal', cat: 'coal', price: 25, stock: 90,
    titleEn: 'Coconut Coal — 3 Pcs', titleAr: 'فحم جوز الهند - ٣ قطع',
    descEn: 'Three premium coconut coal cubes, enough for one session.',
    descAr: 'ثلاث مكعبات فحم جوز هند فاخر تكفي جلسة واحدة.',
  },
  {
    id: 'foil-1pc', cat: 'coal', price: 5, stock: 200,
    titleEn: 'Foil — 1 Pc', titleAr: 'فويل - قطعة',
    descEn: 'One pre-cut foil sheet for a single OKA session.',
    descAr: 'ورقة فويل مقصوصة لجلسة أوكا واحدة.',
  },
  {
    id: 'tongs-steel', cat: 'coal', price: 31, stock: 70,
    titleEn: 'Steel Coal Tongs', titleAr: 'ملقط فحم ستيل',
    descEn: 'Precision steel tongs for safe coal handling.',
    descAr: 'ملقط ستيل دقيق للتعامل الآمن مع الفحم.',
  },
  {
    id: 'black-tobacco', cat: 'dark-tobacco', price: 199, stock: 25,
    titleEn: 'OKA Black Tobacco', titleAr: 'تبغ أوكا الأسود',
    descEn: 'Dark leaf blend with a deep, full-bodied finish.',
    descAr: 'خلطة تبغ داكنة بنهاية عميقة وممتلئة.',
  },
  {
    id: 'black-tobacco-plate', cat: 'dark-tobacco', price: 209, stock: 18,
    titleEn: 'OKA Black Tobacco + Plate', titleAr: 'تبغ أوكا الأسود + طبق',
    descEn: 'Dark tobacco bundled with a steel serving plate.',
    descAr: 'تبغ داكن مع طبق ستيل للتقديم.',
  },
  {
    id: 'bowl-glazed-15g', cat: 'bowls', price: 29, stock: 55,
    titleEn: 'Standard 15g Bowl — Glazed', titleAr: 'بول عادي ١٥ جم - مزجج',
    descEn: 'Glazed ceramic bowl built for even heat.',
    descAr: 'بول سيراميك مزجج لتوزيع حرارة متساوٍ.',
  },
  {
    id: 'coal-gaze-protector', cat: 'bowls', price: 94, stock: 32,
    titleEn: 'Coal Gaze Protector + Free Bowl', titleAr: 'حامي الفحم + بول مجاناً',
    descEn: 'Metal gaze protector that replaces foil crowns.',
    descAr: 'حامي فحم معدني يغنيك عن تاج الفويل.',
  },
].map((p) => ({ ...p, img: PRODUCT_IMAGES[p.id] }));

export const CATS = [
  { id: 'hookahs', en: 'Hookahs', ar: 'الشيشة' },
  { id: 'tobacco', en: 'Tobacco Bowls', ar: 'بولّات التبغ' },
  { id: 'accessories', en: 'Accessories', ar: 'إكسسوارات' },
  { id: 'oka-parts', en: 'OKA Parts', ar: 'قطع أوكا', img: CATEGORY_IMAGES['oka-parts'] },
  { id: 'hoses', en: 'Hoses', ar: 'خراطيم', img: CATEGORY_IMAGES.hoses },
  { id: 'coal', en: 'Coal', ar: 'فحم', img: CATEGORY_IMAGES.coal },
  { id: 'dark-tobacco', en: 'Dark Tobacco', ar: 'تبغ داكن', img: CATEGORY_IMAGES['dark-tobacco'] },
  { id: 'bowls', en: 'Bowls', ar: 'بولات', img: CATEGORY_IMAGES.bowls },
];

export const OFFERS = [
  { id: 'promo1', cat: 'hookahs', addId: 'cobra', img: OFFER_IMAGES.promo1 },
  { id: 'promo2', cat: 'hookahs', addId: 'cobra-led', img: OFFER_IMAGES.promo2 },
  { id: 'promo3', cat: 'hookahs', addId: 'carbon-black', img: OFFER_IMAGES.promo3 },
  { id: 'promo4', cat: 'dark-tobacco', addId: 'black-tobacco', img: OFFER_IMAGES.promo4 },
  { id: 'promo5', cat: 'oka-parts', addId: 'stem-3', img: OFFER_IMAGES.promo5 },
];

export const STR = {
  en: {
    brand: 'OKA', search: 'Search hookahs, bowls & accessories', heroKicker: 'NEW SEASON',
    heroTitle: 'Session ready.', heroSub: 'Fresh hookahs & flavors just landed.',
    shopByCategory: 'Shop by Category', bestSellers: 'Best Sellers',
    loyaltyGuest: 'Earn points on every order',
    loyaltyCta: 'Sign in to start earning', add: 'Add', tabHome: 'Home', tabCategories: 'Categories',
    tabCart: 'Cart', tabOrders: 'Orders', tabAccount: 'Account',
    categoriesTitle: 'Categories', productsCount: 'products',
    sortBestSelling: 'Best selling', filters: 'Filters', noMatch: 'No products in this category',
    inStock: 'In stock', onlyLeft: 'Only {n} left', outOfStock: 'Out of stock',
    freeShipProgress: 'Add {n} EGP more for free shipping', freeShipReached: 'This order ships free',
    qty: 'Quantity', customize: 'Customize', addToCart: 'Add to Cart', buyNow: 'Add to Cart',
    deliverTo: 'Deliver to', estDelivery: 'Estimated delivery', shippingFee: 'Shipping fee',
    payMethods: 'COD · Card · Wallet accepted', description: 'Description',
    pointsNote: 'Earn ~{n} points when delivered',
    related: 'You may also like', share: 'Share',
    cartTitle: 'Cart', emptyCart: 'Your cart is empty', browse: 'Browse best sellers',
    subtotal: 'Subtotal', discount: 'Discount', shipping: 'Shipping', total: 'Total',
    earnOnDelivery: "You'll earn {n} points on delivery",
    discountPlaceholder: 'Discount code', apply: 'Apply', applied: 'Applied', checkout: 'Checkout',
    remove: 'Remove', addressTitle: 'Delivery details', name: 'Nourhan Adel', phone: '+20 100 123 4567',
    street: '14 Al Nasr St, Nasr City', change: 'Change', paymentTitle: 'Payment method',
    cod: 'Cash on Delivery', card: 'Card', wallet: 'Mobile Wallet',
    codNote: 'Have this amount ready for the courier',
    reviewTitle: 'Review & place order', items: 'Items', placeOrder: 'Place Order',
    orderPlaced: 'Order placed', orderNumber: 'Order number', deliveryWindow: 'Expected delivery',
    trackOrder: 'Track Order', continueShopping: 'Continue Shopping', timelineConfirmed: 'Confirmed',
    timelinePacked: 'Packed', timelineShipped: 'Shipped', timelineOut: 'Out for delivery',
    timelineDelivered: 'Delivered',
    ordersTitle: 'Orders', noOrders: 'No orders yet', active: 'Active', accountTitle: 'Account',
    guestPrompt: 'Sign in to see orders, points & saved addresses', language: 'Language',
    signOut: 'Sign out',
    faq: 'FAQ & Support', legal: 'Legal', myAddresses: 'My addresses', myWishlist: 'Wishlist',
    loyaltyRow: 'Loyalty & referrals', notifRow: 'Notification settings', cityCairo: 'Cairo',
    cityGiza: 'Giza',
    cityAlex: 'Alexandria', cityOther: 'Other governorate', days12: '1–2 days', days23: '2–3 days',
    days35: '3–5 days',
    all: 'All',
  },
  ar: {
    brand: 'أوكا', search: 'ابحث عن شيشة، بولّات وإكسسوارات', heroKicker: 'موسم جديد',
    heroTitle: 'الجلسة جاهزة.', heroSub: 'شيش وأشكال جديدة وصلت لتوها.',
    shopByCategory: 'تسوق حسب الفئة', bestSellers: 'الأكثر مبيعاً', loyaltyGuest: 'اكسب نقاط مع كل طلب',
    loyaltyCta: 'سجّل دخولك لتبدأ الكسب', add: 'إضافة', tabHome: 'الرئيسية', tabCategories: 'الفئات',
    tabCart: 'السلة', tabOrders: 'الطلبات', tabAccount: 'حسابي',
    categoriesTitle: 'الفئات', productsCount: 'منتج',
    sortBestSelling: 'الأكثر مبيعاً', filters: 'فلاتر', noMatch: 'لا توجد منتجات في هذه الفئة',
    inStock: 'متوفر', onlyLeft: 'باقي {n} فقط', outOfStock: 'غير متوفر',
    freeShipProgress: 'أضف {n} ج.م للحصول على شحن مجاني', freeShipReached: 'هذا الطلب يشحن مجاناً',
    qty: 'الكمية', customize: 'تخصيص', addToCart: 'أضف إلى السلة', buyNow: 'أضف إلى السلة',
    deliverTo: 'التوصيل إلى', estDelivery: 'موعد التوصيل المتوقع', shippingFee: 'رسوم الشحن',
    payMethods: 'الدفع عند الاستلام · بطاقة · محفظة', description: 'الوصف',
    pointsNote: 'اكسب ~{n} نقطة عند التوصيل',
    related: 'قد يعجبك أيضاً', share: 'مشاركة',
    cartTitle: 'السلة', emptyCart: 'سلتك فارغة', browse: 'تصفح الأكثر مبيعاً',
    subtotal: 'الإجمالي الفرعي', discount: 'الخصم', shipping: 'الشحن', total: 'الإجمالي',
    earnOnDelivery: 'ستكسب {n} نقطة عند التوصيل',
    discountPlaceholder: 'كود الخصم', apply: 'تطبيق', applied: 'مُطبّق', checkout: 'الدفع',
    remove: 'إزالة', addressTitle: 'تفاصيل التوصيل', name: 'نورهان عادل', phone: '+20 100 123 4567',
    street: '١٤ شارع النصر، مدينة نصر', change: 'تغيير', paymentTitle: 'طريقة الدفع',
    cod: 'الدفع عند الاستلام', card: 'بطاقة', wallet: 'محفظة إلكترونية',
    codNote: 'جهّز هذا المبلغ للمندوب',
    reviewTitle: 'مراجعة وتأكيد الطلب', items: 'العناصر', placeOrder: 'تأكيد الطلب',
    orderPlaced: 'تم تأكيد الطلب', orderNumber: 'رقم الطلب', deliveryWindow: 'موعد التوصيل المتوقع',
    trackOrder: 'تتبع الطلب', continueShopping: 'متابعة التسوق', timelineConfirmed: 'تم التأكيد',
    timelinePacked: 'تم التجهيز', timelineShipped: 'تم الشحن', timelineOut: 'قيد التوصيل',
    timelineDelivered: 'تم التسليم',
    ordersTitle: 'الطلبات', noOrders: 'لا توجد طلبات بعد', active: 'نشط', accountTitle: 'حسابي',
    guestPrompt: 'سجّل دخولك لرؤية الطلبات والنقاط والعناوين المحفوظة', language: 'اللغة',
    signOut: 'تسجيل الخروج',
    faq: 'الأسئلة الشائعة والدعم', legal: 'قانوني', myAddresses: 'عناويني', myWishlist: 'المفضلة',
    loyaltyRow: 'الولاء والإحالات', notifRow: 'إعدادات الإشعارات', cityCairo: 'القاهرة',
    cityGiza: 'الجيزة',
    cityAlex: 'الإسكندرية', cityOther: 'محافظة أخرى', days12: '١-٢ يوم', days23: '٢-٣ أيام',
    days35: '٣-٥ أيام',
    all: 'الكل',
  },
};

export const CITY_FEES = { cityCairo: 50, cityGiza: 50, cityAlex: 70, cityOther: 90 };
export const FREE_SHIPPING_THRESHOLD = 300;
export const REWARD_COSTS = { ship: 500, off50: 750, coal: 1200, hose: 2000 };
export const LOYALTY_BASE = 1240;
export const GOLD_TIER = 2000;

export const LOYALTY_REWARDS = [
  { id: 'ship', pts: 500, en: 'Free shipping on next order', ar: 'شحن مجاني على الطلب القادم' },
  { id: 'off50', pts: 750, en: 'EGP 50 off', ar: 'خصم ٥٠ ج.م' },
  { id: 'coal', pts: 1200, en: 'Free coconut coal', ar: 'فحم جوز هند مجاناً' },
  { id: 'hose', pts: 2000, en: 'Free OKA hose', ar: 'خرطوم أوكا مجاناً' },
];
