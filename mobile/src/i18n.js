/**
 * Bilingual label tables, copied verbatim from the standalone HTML so the
 * Arabic wording the warehouse already reads is unchanged.
 */

export const AR = {
  orders: "الأوردرات", search: "ابحث برقم الأوردر أو البوليصة", items: "قطعة", scan: "مسح الباركود",
  close: "إغلاق", scanHint: "وجّه الكاميرا على الباركود أو الـ QR", scanNow: "مسح الآن",
  awb: "بوليصة", call: "اتصال", wa: "واتساب", photo: "صورة", edit: "تعديل", contents: "محتويات الأوردر",
  cod: "الدفع عند الاستلام", subtotal: "قيمة المنتجات", shipping: "الشحن", markReady: "جاهز للتحميل",
  editOrder: "تعديل الأوردر", addProduct: "إضافة منتج", save: "حفظ", attached: "صور مرفقة",
  modes: "الأوضاع", modesHint: "اختر وضع المسح المتواصل قبل ما تبدأ", pickup: "تحميل الشاحنة",
  pickupHint: "امسح كل أوردر داخل على العربية · صوت تنبيه مع كل مسح",
  cancelMode: "إلغاء أوردرات", cancelHint: "امسح الأوردرات الملغية عشان ترجع للمخزن",
  shift: "ملخص الوردية", loaded: "على الشاحنة", cancelled: "ملغي", open: "مفتوح",
  exit: "خروج", beep: "الصوت", tapScan: "امسح", undo: "رجوع", finish: "إنهاء", confirmEach: "تأكيد كل مسح",
  templates: "رسائل جاهزة", recording: "جاري تسجيل المكالمة", endCall: "إنهاء المكالمة", attach: "إرفاق",
  rank: "تقييم العميل", clarity: "وضوح العنوان", deliverTo: "عنوان التسليم",
  track: "تتبع الأوردر", trackTitle: "تتبع الشحنة", courier: "المندوب", noCourier: "لم يتم تعيين مندوب بعد",
  callCourier: "اتصال بالمندوب", waCourier: "واتساب المندوب", cancelOrder: "إلغاء الأوردر",
  history: "سجل التواصل", noHistory: "لا يوجد تواصل بعد", orderCancelled: "تم إلغاء الأوردر",
  readyPickup: "جاهز للاستلام",
  shipStatus: "حالة الشحن", shipStatusHint: "دوّر برقم تليفون العميل عشان تعرف مرحلة الشحن والمندوب",
  searchPhone: "رقم التليفون", noResults: "مافيش نتائج", notAssigned: "لسه ملهوش مندوب",
  // Added for the live build — the mockup had no failure states to label.
  loading: "جاري التحميل…", loadFailed: "تعذر تحميل الأوردرات", retry: "إعادة المحاولة",
  offline: "بيانات تجريبية — غير متصل", readySynced: "تم تحديث الأوردر",
};

export const EN = {
  orders: "Orders", search: "Search order, AWB or phone", items: "items", scan: "Scan barcode",
  close: "Close", scanHint: "Point the camera at the barcode or QR", scanNow: "Scan now",
  awb: "AWB", call: "Call", wa: "WhatsApp", photo: "Photo", edit: "Edit", contents: "Order contents",
  cod: "Cash on delivery", subtotal: "Subtotal", shipping: "Shipping", markReady: "Mark ready to load",
  editOrder: "Edit order", addProduct: "Add product", save: "Save", attached: "Attached photos",
  modes: "Modes", modesHint: "Pick a burst-scan mode before you start", pickup: "Truck loading",
  pickupHint: "Scan every order going on the truck · beep on each scan",
  cancelMode: "Cancel orders", cancelHint: "Scan cancelled orders back into stock",
  shift: "Shift summary", loaded: "on truck", cancelled: "cancelled", open: "open",
  exit: "Exit", beep: "Sound", tapScan: "Scan", undo: "Undo", finish: "Finish", confirmEach: "Confirm each",
  templates: "Ready messages", recording: "Recording call", endCall: "End call", attach: "Attach",
  rank: "Customer ranking", clarity: "Address clarity", deliverTo: "Delivery address",
  track: "Track order", trackTitle: "Shipment tracking", courier: "Courier", noCourier: "Courier not assigned yet",
  callCourier: "Call courier", waCourier: "WhatsApp courier", cancelOrder: "Cancel order",
  history: "Contact history", noHistory: "No contact yet", orderCancelled: "Order cancelled",
  readyPickup: "Ready for pickup",
  shipStatus: "Shipping status", shipStatusHint: "Search by customer phone to see shipping stage and courier",
  searchPhone: "Phone number", noResults: "No results", notAssigned: "Not assigned yet",
  loading: "Loading…", loadFailed: "Could not load orders", retry: "Retry",
  offline: "Sample data — not connected", readySynced: "Order updated",
};

/** Bosta's delivery phases, in the order the tracking timeline draws them. */
export const PHASES = [
  { ar: "تم الإنشاء", en: "Created" },
  { ar: "تم الاستلام", en: "Picked up" },
  { ar: "في الطريق", en: "In transit" },
  { ar: "خرج للتوصيل", en: "Out for delivery" },
  { ar: "تم التسليم", en: "Delivered" },
];

export const labels = (lang) => (lang === "ar" ? AR : EN);
export const isRtl = (lang) => lang === "ar";

/** WhatsApp message templates, parameterised by the selected order. */
export function waTemplates({ lang, contactTarget, waContext, sel }) {
  const ar = lang === "ar";
  const { awbTail = "", name = "", phone = "", cod = "", address = "" } = sel || {};

  if (contactTarget === "courier" && waContext === "shipdetail") {
    return ar
      ? [{ title: "فين حضرتك", body: `فين حضرتك ووصول إمتى لأوردر رقم ${awbTail} لاسم ${name}؟ العميل محتاج الأوردر، اتصل بيه على ${phone}`, tone: "#0F9D58" }]
      : [{ title: "Location check", body: `Where are you and when will you arrive at order #${awbTail} for ${name}? The customer needs the order, call him on ${phone}`, tone: "#0F9D58" }];
  }

  if (contactTarget === "courier") {
    return ar
      ? [
          { title: "فين الأوردر", body: `أوردر ${awbTail} فين دلوقتي؟`, tone: "#0F9D58" },
          { title: "اتصل بالعميل", body: "برجاء تحاول تتصل بالعميل قبل التوصيل.", tone: "#0B7C46" },
          { title: "رجّع للمخزن", body: `برجاء ترجيع أوردر ${awbTail} للمخزن.`, tone: "#A63A3A" },
        ]
      : [
          { title: "Where is it", body: `Where is order ${awbTail} right now?`, tone: "#0F9D58" },
          { title: "Call the customer", body: "Please try calling the customer before delivery.", tone: "#0B7C46" },
          { title: "Return to warehouse", body: `Please return order ${awbTail} to the warehouse.`, tone: "#A63A3A" },
        ];
  }

  return ar
    ? [
        { title: "تأكيد الأوردر", body: `أهلاً، بنأكد أوردر ${awbTail} وقيمته ${cod} جنيه.`, tone: "#0F9D58" },
        { title: "خارج للتوصيل", body: "أوردرك خرج مع المندوب النهاردة، برجاء تجهيز المبلغ.", tone: "#0B7C46" },
        { title: "مش بنرد", body: "حاولنا نتصل بك ولم نتمكن من الوصول. متاح إمتى للتوصيل؟", tone: "#8A6520" },
        { title: "تأكيد العنوان", body: `برجاء تأكيد العنوان: ${address}`, tone: "#1C2321" },
      ]
    : [
        { title: "Confirm order", body: `Hi, confirming order ${awbTail} for ${cod} EGP.`, tone: "#0F9D58" },
        { title: "Out for delivery", body: "Your order is out with the courier today. Please have the cash ready.", tone: "#0B7C46" },
        { title: "No answer", body: "We tried calling and could not reach you. When are you available?", tone: "#8A6520" },
        { title: "Confirm address", body: `Please confirm your address: ${address}`, tone: "#1C2321" },
      ];
}
