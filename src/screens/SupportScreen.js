import React from 'react';
import { Alert, Linking, ScrollView, StyleSheet, View } from 'react-native';

import { useActions, useDerived, useStore } from '../store';
import { C, W } from '../theme';
import { FadeIn } from '../components/anim';
import { Divider, Press, Txt } from '../components/ui';
import { ScreenHeader } from '../components/parts';
import { WhatsApp } from '../components/Icons';

/**
 * Help, answers and the store's policies. The WhatsApp number and policy
 * links come from the server (SUPPORT_WHATSAPP, POLICIES_BASE_URL), so they
 * can change without an app release.
 */
const FAQ = [
  {
    en: ['How long does delivery take?', 'Cairo, Giza and Alexandria: 1–2 days. Delta and Canal: 2–3 days. Upper Egypt, Sinai, Red Sea and Matrouh: 3–5 days.'],
    ar: ['التوصيل بياخد قد إيه؟', 'القاهرة والجيزة والإسكندرية: ١-٢ يوم. الدلتا والقناة: ٢-٣ أيام. الصعيد وسيناء والبحر الأحمر ومطروح: ٣-٥ أيام.'],
  },
  {
    en: ['How much is delivery?', 'A flat {fee} anywhere in Egypt, and free on orders of {free} or more. The minimum order is {min}.'],
    ar: ['التوصيل بكام؟', '{fee} لأي مكان في مصر، ومجاني للطلبات من {free}. أقل طلب {min}.'],
  },
  {
    en: ['How do I pay?', 'Cash on delivery. Please have the exact amount ready for the courier.'],
    ar: ['بدفع إزاي؟', 'الدفع عند الاستلام. جهّز المبلغ للمندوب من فضلك.'],
  },
  {
    en: ['Can I change or cancel my order?', 'Yes, from the Orders tab, until it has been handed to the courier.'],
    ar: ['أقدر أعدّل أو ألغي طلبي؟', 'أيوه، من تبويب الطلبات، لحد ما يتسلم للمندوب.'],
  },
  {
    en: ['How do loyalty points work?', 'You earn 1 point for every 10 EGP of products once your order is delivered. Redeem points for discount codes from the Loyalty screen.'],
    ar: ['نقاط الولاء بتشتغل إزاي؟', 'بتكسب نقطة لكل ١٠ ج.م منتجات بعد ما طلبك يوصل. استبدل النقاط بأكواد خصم من صفحة الولاء.'],
  },
  {
    en: ['What if something arrives damaged?', 'Message us on WhatsApp within 48 hours with a photo and your order number and we’ll replace it.'],
    ar: ['لو حاجة وصلت مكسورة؟', 'ابعتلنا على واتساب خلال ٤٨ ساعة بصورة ورقم الطلب وهنبدلها.'],
  },
];

const POLICIES = [
  { path: 'refund-policy', en: 'Returns & refunds', ar: 'الاسترجاع والاسترداد' },
  { path: 'shipping-policy', en: 'Shipping', ar: 'الشحن' },
  { path: 'privacy-policy', en: 'Privacy', ar: 'الخصوصية' },
  { path: 'terms-of-service', en: 'Terms of service', ar: 'شروط الخدمة' },
];

export default function SupportScreen() {
  const { state } = useStore();
  const actions = useActions();
  const d = useDerived();
  const whatsapp = state.config.support?.whatsapp;
  const base = state.config.support?.policiesBaseUrl ?? 'https://www.okaegypt.com/policies';

  const open = async (url) => {
    try {
      await Linking.openURL(url);
    } catch {
      Alert.alert(d.isRtl ? 'تعذّر الفتح' : 'Could not open', url);
    }
  };

  const chat = () => {
    const order = state.remoteOrders?.[0]?.name;
    const text = order
      ? (d.isRtl ? `مرحباً، بخصوص طلب ${order}` : `Hi, about order ${order}`)
      : d.isRtl ? 'مرحباً' : 'Hi';
    open(`https://wa.me/${String(whatsapp).replace(/\D/g, '')}?text=${encodeURIComponent(text)}`);
  };

  return (
    <FadeIn style={styles.root}>
      <ScrollView showsVerticalScrollIndicator={false}>
        <ScreenHeader title={d.t('faq')} onBack={actions.goBack} isRtl={d.isRtl} />

        {whatsapp ? (
          <Press onPress={chat} activeScale={0.98} style={[styles.wa, { flexDirection: d.isRtl ? 'row-reverse' : 'row' }]}>
            <WhatsApp size={18} />
            <Txt style={styles.waTxt}>{d.isRtl ? 'كلّمنا على واتساب' : 'Chat with us on WhatsApp'}</Txt>
          </Press>
        ) : null}

        <Txt isRtl={d.isRtl} style={styles.section}>{d.isRtl ? 'أسئلة شائعة' : 'Common questions'}</Txt>
        {FAQ.map((f, i) => {
          const [q, raw] = d.isRtl ? f.ar : f.en;
          const a = raw
            .replace('{fee}', d.fmtPrice(d.shippingFee))
            .replace('{free}', d.fmtPrice(d.freeShippingMin))
            .replace('{min}', d.fmtPrice(d.minOrder));
          return (
            <View key={i} style={styles.qa}>
              <Txt isRtl={d.isRtl} style={styles.q}>{q}</Txt>
              <Txt isRtl={d.isRtl} style={styles.a}>{a}</Txt>
              {i < FAQ.length - 1 ? <Divider style={{ marginTop: 14 }} /> : null}
            </View>
          );
        })}

        <Txt isRtl={d.isRtl} style={styles.section}>{d.t('legal')}</Txt>
        {POLICIES.map((p) => (
          <Press key={p.path} onPress={() => open(`${base}/${p.path}`)} style={styles.policy}>
            <Txt isRtl={d.isRtl} style={styles.policyTxt}>{d.isRtl ? p.ar : p.en}</Txt>
          </Press>
        ))}
        <View style={{ height: 30 }} />
      </ScrollView>
    </FadeIn>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  wa: {
    marginHorizontal: 22,
    marginBottom: 8,
    paddingVertical: 15,
    borderRadius: 999,
    backgroundColor: '#1f8f4e',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
  },
  waTxt: { color: '#ffffff', fontSize: 15, fontWeight: W.bold },
  section: { paddingHorizontal: 22, paddingTop: 22, paddingBottom: 10, fontSize: 16, fontWeight: W.heavy },
  qa: { paddingHorizontal: 22, paddingTop: 12 },
  q: { fontSize: 14.5, fontWeight: W.semibold, lineHeight: 21 },
  a: { fontSize: 13.5, color: C.inkSoft, lineHeight: 21, marginTop: 4 },
  policy: { paddingHorizontal: 22, paddingVertical: 13 },
  policyTxt: { fontSize: 14.5, color: C.accent, fontWeight: W.semibold },
});
