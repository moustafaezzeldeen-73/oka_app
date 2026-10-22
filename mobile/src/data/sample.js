/**
 * The mockup's own dataset, kept verbatim.
 *
 * Two jobs: it's what the app renders when no credentials are configured, so
 * the UI is fully explorable out of the box, and it's the reference the live
 * mapper is checked against — a live order must produce the same shape these
 * do.
 */

export const IMG = {
  "OKA white": "https://cdn.shopify.com/s/files/1/0812/4881/3354/files/Copy_of_Untitled.png?v=1763023890",
  "OKA Carbon Black": "https://cdn.shopify.com/s/files/1/0812/4881/3354/files/2_1f9192f3-c412-4c2f-8612-45d50568b911.png?v=1763048134",
  "OKA Pink": "https://cdn.shopify.com/s/files/1/0812/4881/3354/files/5.png?v=1762673426",
  "OKA-STEM 3 pieces": "https://cdn.shopify.com/s/files/1/0812/4881/3354/files/IMG-0180.png?v=1759830426",
  "Tongs": "https://cdn.shopify.com/s/files/1/0812/4881/3354/files/IMG-0179.png?v=1759830220",
  "Tongs, Foil Combo": "https://cdn.shopify.com/s/files/1/0812/4881/3354/files/IMG-0182.png?v=1759829962",
  "Coal gaze protector + Bowl Free": "https://cdn.shopify.com/s/files/1/0812/4881/3354/files/IMG-0178.png?v=1759830189",
  "Premium 1.5 m Hose": "https://cdn.shopify.com/s/files/1/0812/4881/3354/files/IMG-0174.png?v=1759830384",
  "Tobacco Bowls · Grapes 12g": "https://cdn.shopify.com/s/files/1/0812/4881/3354/files/20250923_2021_Grapes_Spreading_Naturally_remix_01k5vsbpf0fvxs2xvwhsvehcb4.png?v=1758657825",
  "Tobacco Bowls · Blue Cloud 12g": "https://cdn.shopify.com/s/files/1/0812/4881/3354/files/20250923_2033_Blueberry_Cloud_Formation_remix_01k5vt49x2fae92n74exjanh51.png?v=1758657478",
  "Tobacco Bowls · Iced Lemon Mint 12g": "https://cdn.shopify.com/s/files/1/0812/4881/3354/files/20250923_2252_Dewed_Mint_Leaves_remix_01k5w2154qfj2bpnp7pzvnya0y.png?v=1758657973",
  "Tobacco Bowls · Two apples 12g": "https://cdn.shopify.com/s/files/1/0812/4881/3354/files/20250923_2239_Fruits_with_Dewed_Mint_remix_01k5w1am89e94sqqtbt13f3d81.png?v=1758658003",
  "Tobacco Bowls · Mega berry 12g": "https://cdn.shopify.com/s/files/1/0812/4881/3354/files/20250923_2038_Juicy_Cantaloupe_Slice_remix_01k5vtcawafm7tb0pnphmtb1bz.png?v=1758657921",
};

export const CATALOG = [
  { name: "Tongs", unit: "31" },
  { name: "Premium 1.5 m Hose", unit: "45" },
  { name: "Tobacco Bowls · Iced Lemon Mint 12g", unit: "49" },
  { name: "Coal gaze protector + Bowl Free", unit: "94" },
];

export const TIMES = ["Aug 10 · 09:02", "Aug 10 · 14:40", "Aug 11 · 08:15", "Aug 11 · 15:50", "Aug 11 · 18:20"];

export const TRACK = {
  1: { phase: 0 },
  2: { phase: 1, courier: { name: "كريم عادل", nameEn: "Karim Adel", phone: "+201223456780" } },
  3: { phase: 2, courier: { name: "محمود سعيد", nameEn: "Mahmoud Saeed", phone: "+201098765432" } },
  4: { phase: 3, courier: { name: "يوسف طارق", nameEn: "Youssef Tarek", phone: "+201156789012" } },
  5: { phase: 4, courier: { name: "عمرو حسن", nameEn: "Amr Hassan", phone: "+201234988765" } },
  6: { phase: 0 },
  7: { phase: 2, courier: { name: "محمود سعيد", nameEn: "Mahmoud Saeed", phone: "+201098765432" } },
  8: { phase: 3, courier: { name: "يوسف طارق", nameEn: "Youssef Tarek", phone: "+201156789012" } },
};

export const HISTORY = {
  2: [
    { type: "call", time: "Aug 10 · 10:12", dur: "00:42", ar: "تم الرد - تأكيد الأوردر", en: "Answered - order confirmed" },
    { type: "wa", time: "Aug 10 · 10:15", ar: "رسالة: تأكيد الأوردر", en: "Message: Confirm order" },
  ],
  4: [{ type: "call", time: "Aug 9 · 16:40", dur: "00:00", ar: "لم يتم الرد", en: "No answer" }],
  5: [
    { type: "call", time: "Aug 11 · 09:05", dur: "01:12", ar: "تم الرد - تأكيد العنوان", en: "Answered - address confirmed" },
    { type: "wa", time: "Aug 11 · 09:10", ar: "رسالة: تأكيد العنوان", en: "Message: Confirm address" },
    { type: "call", time: "Aug 11 · 14:20", dur: "00:00", ar: "لم يتم الرد", en: "No answer" },
  ],
};

export const ORDERS = [
  { id: 1, sh: "#2615321", awb: "2537186873", name: "احمد ايمن", nameEn: "Ahmed Ayman", phone: "+201110727746", city: "القاهره", cityEn: "Cairo", address: "٥ شارع البطراوي", addressEn: "5 El Batrawy St", cod: "229", subtotal: "169", ship: "60", status: "ready", carrier: "Bosta", rank: null, clarity: 34,
    items: [{ name: "OKA white", qty: 1, unit: "169" }] },
  { id: 2, sh: "#2615621", awb: "5447216081", name: "احمد رمضان", nameEn: "Ahmed Ramadan", phone: "+201012501994", city: "القليوبيه", cityEn: "El Kalioubia", address: "قليوب، مزلقان عرب العراقي بجوار بنزينة موبيل", addressEn: "Qalyub, Arab El Eraqi crossing", cod: "607", subtotal: "561", ship: "46", status: "ready", carrier: "Bosta", rank: 97, clarity: 85,
    items: [
      { name: "Tobacco Bowls · Grapes 12g", qty: 2, unit: "49" },
      { name: "Tobacco Bowls · Two apples 12g", qty: 2, unit: "49" },
      { name: "Tobacco Bowls · Mega berry 12g", qty: 2, unit: "49" },
      { name: "Tobacco Bowls · Iced Lemon Mint 12g", qty: 2, unit: "49" },
      { name: "OKA Pink", qty: 1, unit: "169" },
    ] },
  { id: 3, sh: "#2616621", awb: "3087393833", name: "محمد فتحى", nameEn: "Mohamed Fathy", phone: "+201024678261", city: "القليوبيه", cityEn: "El Kalioubia", address: "العبور الجديدة، حى الفيروز، عمارة ١٠٩، شقة ١", addressEn: "New Obour, El Fayrouz, bld 109", cod: "337", subtotal: "267", ship: "70", status: "ready", carrier: "Bosta", rank: 80, clarity: 85,
    items: [
      { name: "Tobacco Bowls · Iced Lemon Mint 12g", qty: 1, unit: "49" },
      { name: "Tobacco Bowls · Blue Cloud 12g", qty: 1, unit: "49" },
      { name: "OKA white", qty: 1, unit: "169" },
    ] },
  { id: 4, sh: "#2616821", awb: "7362806355", name: "عبدالله الغايش", nameEn: "Abdallah El Ghayesh", phone: "+201099361354", city: "البحيره", cityEn: "Behira", address: "البحيره", addressEn: "Behira", cod: "353", subtotal: "283", ship: "70", status: "badaddr", carrier: "Bosta", rank: 100, clarity: 0,
    items: [
      { name: "OKA Carbon Black", qty: 1, unit: "189" },
      { name: "Coal gaze protector + Bowl Free", qty: 1, unit: "94" },
    ] },
  { id: 5, sh: "#2617121", awb: "6263431035", name: "باسم حسن", nameEn: "Basem Hassan", phone: "+201111354545", city: "الغربيه", cityEn: "Gharbia", address: "١٤ شارع ٢٣ يوليو، أمام مجلس المدينة، المحلة الكبرى", addressEn: "14 St 23 July, Mahalla El Kobra", cod: "405", subtotal: "359", ship: "46", status: "ready", carrier: "Bosta", rank: 100, clarity: 100,
    items: [
      { name: "Tongs", qty: 1, unit: "31" },
      { name: "Premium 1.5 m Hose", qty: 1, unit: "45" },
      { name: "Coal gaze protector + Bowl Free", qty: 1, unit: "94" },
      { name: "OKA Carbon Black", qty: 1, unit: "189" },
    ] },
  { id: 6, sh: "#2617221", awb: "854703486", name: "ابراهيم البساطي", nameEn: "Ibrahim El Basaty", phone: "+201515140814", city: "دمياط", cityEn: "Damietta", address: "أمام الموقف", addressEn: "In front of the station", cod: "180", subtotal: "110", ship: "70", status: "badaddr", carrier: "Bosta", rank: 100, clarity: 0,
    items: [{ name: "OKA-STEM 3 pieces", qty: 1, unit: "110" }] },
  { id: 7, sh: "#2617421", awb: "2067121383", name: "Aya Hazem", nameEn: "Aya Hazem", phone: "+201140980144", city: "الجيزه", cityEn: "Giza", address: "حدائق اكتوبر، مشروع ٦٤٥، عمارة ٢٦٧", addressEn: "Hadayek October, prj 645, bld 267", cod: "368", subtotal: "332", ship: "36", status: "ready", carrier: "Bosta", rank: 100, clarity: 85,
    items: [
      { name: "Tongs, Foil Combo", qty: 1, unit: "69" },
      { name: "Coal gaze protector + Bowl Free", qty: 1, unit: "94" },
      { name: "OKA white", qty: 1, unit: "169" },
    ] },
  { id: 8, sh: "#2617521", awb: "4303206020", name: "احمد عبدالعزيز محمد", nameEn: "Ahmed Abdelaziz", phone: "+201062081166", city: "قنا", cityEn: "Qena", address: "نجع حمادى", addressEn: "Nag Hammadi", cod: "269", subtotal: "189", ship: "80", status: "ready", carrier: "Bosta", rank: 67, clarity: 75,
    items: [{ name: "OKA Carbon Black", qty: 1, unit: "189" }] },
];
