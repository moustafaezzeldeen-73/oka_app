import React, { useState } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { CATS } from '../data';
import { useActions, useDerived, useStore } from '../store';
import { C, D, W } from '../theme';
import { FadeIn } from '../components/anim';
import { Img, Press, Txt } from '../components/ui';
import { QtyStepper, SumRow } from '../components/parts';
import { Close } from '../components/Icons';
import { editShopifyOrder } from '../api/auth';

/** The "Edit Order" bottom sheet: scrim + panel, both fading in as in the web build. */
export default function EditOrderSheet() {
  const { state, products } = useStore();
  const actions = useActions();
  const d = useDerived();
  const rowDir = { flexDirection: d.isRtl ? 'row-reverse' : 'row' };
  const editCart = state.editCart || {};
  const [saving, setSaving] = useState(false);

  /**
   * Commits the edit to the real Shopify order. The desired end state is sent
   * as a list of variant/quantity pairs and Shopify recalculates the totals,
   * restocks removed units and emails the customer.
   */
  const accept = async () => {
    if (saving) return;
    const orderName = state.order?.number;
    const lines = d.editCartEntries
      .map((e) => ({ variantId: e.p.variantId, quantity: e.qty }))
      .filter((l) => l.variantId);

    if (!orderName || !lines.length) {
      actions.acceptEditOrder();
      return;
    }

    setSaving(true);
    try {
      await editShopifyOrder(orderName, lines, state.session?.token);
      actions.acceptEditOrder();
    } catch (err) {
      Alert.alert(
        d.isRtl ? 'تعذّر حفظ التعديل' : 'Could not save the edit',
        String(err.message ?? err),
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <FadeIn
        duration={D.fadeInOverlay}
        fromY={0}
        style={styles.scrim}
      >
        <Pressable style={StyleSheet.absoluteFill} onPress={actions.closeEditOrder} />
      </FadeIn>

      <FadeIn duration={D.fadeInFast} style={styles.sheet}>
        <View style={styles.grabberWrap}>
          <View style={styles.grabber} />
        </View>

        <View style={[styles.head, rowDir]}>
          <Txt style={styles.headTitle}>{d.isRtl ? 'تعديل الطلب' : 'Edit Order'}</Txt>
          <Press onPress={actions.closeEditOrder} style={styles.closeBtn} hitSlop={8}>
            <Close size={15} />
          </Press>
        </View>

        <ScrollView style={styles.body} showsVerticalScrollIndicator={false}>
          <Txt isRtl={d.isRtl} style={styles.sectionLabel}>
            {d.isRtl ? 'عناصر طلبك' : 'YOUR ORDER ITEMS'}
          </Txt>

          {d.editCartEntries.length > 0 ? (
            d.editCartEntries.map((e) => (
              <View key={e.id} style={[styles.itemRow, rowDir]}>
                <View style={styles.itemImg}>
                  <Img source={e.p.img} contentFit="contain" style={styles.fill} />
                </View>
                <View style={styles.itemMeta}>
                  <Txt isRtl={d.isRtl} style={styles.itemTitle}>
                    {d.title(e.p)}
                  </Txt>
                  <Txt isRtl={d.isRtl} style={styles.itemTotal}>
                    {d.fmtPrice(e.p.price * e.qty)}
                  </Txt>
                </View>
                <QtyStepper
                  isRtl={d.isRtl}
                  size={26}
                  fontSize={14}
                  gap={8}
                  qty={d.num(e.qty)}
                  onDec={() => actions.editSetQty(e.id, e.qty - 1)}
                  onInc={() => actions.editSetQty(e.id, e.qty + 1)}
                />
              </View>
            ))
          ) : (
            <View style={styles.empty}>
              <Txt center style={styles.emptyTxt}>
                {d.isRtl ? 'لا توجد عناصر في الطلب' : 'No items in this order'}
              </Txt>
            </View>
          )}

          <View style={styles.rule} />
          <Txt isRtl={d.isRtl} style={styles.sectionLabel}>
            {d.isRtl ? 'كل المنتجات' : 'ALL PRODUCTS'}
          </Txt>

          {CATS.map((c) => {
            const group = products.filter((p) => p.cat === c.id);
            if (!group.length) return null;
            return (
              <View key={c.id}>
                <Txt isRtl={d.isRtl} style={styles.groupLabel}>
                  {d.isRtl ? c.ar : c.en}
                </Txt>
                {group.map((p) => {
                  const qty = editCart[p.id] || 0;
                  return (
                    <View key={p.id} style={[styles.catalogRow, rowDir]}>
                      <View style={styles.catalogImg}>
                        <Img source={p.img} contentFit="contain" style={styles.fill} />
                      </View>
                      <View style={styles.catalogMeta}>
                        <Txt isRtl={d.isRtl} style={styles.catalogTitle}>
                          {d.title(p)}
                        </Txt>
                        <Txt isRtl={d.isRtl} style={styles.catalogPrice}>
                          {d.fmtPrice(p.price)}
                        </Txt>
                      </View>
                      <QtyStepper
                        isRtl={d.isRtl}
                        size={24}
                        fontSize={13}
                        gap={7}
                        qty={d.num(qty)}
                        onDec={() => actions.editSetQty(p.id, qty - 1)}
                        onInc={() => actions.editSetQty(p.id, qty + 1)}
                      />
                    </View>
                  );
                })}
              </View>
            );
          })}
          <View style={{ height: 16 }} />
        </ScrollView>

        <View style={styles.foot}>
          <SumRow
            isRtl={d.isRtl}
            label={d.t('subtotal')}
            value={d.fmtPrice(d.editSubtotalRaw)}
            style={{ paddingVertical: 3 }}
            labelStyle={styles.footSub}
            valueStyle={styles.footSub}
          />
          <SumRow
            isRtl={d.isRtl}
            label={d.t('total')}
            value={d.fmtPrice(d.editTotalRaw)}
            style={{ paddingTop: 5, paddingBottom: 12 }}
            labelStyle={styles.footTotal}
            valueStyle={styles.footTotal}
          />
          <Press onPress={accept} activeScale={0.98} style={styles.accept}>
            {saving ? (
              <ActivityIndicator color="#ffffff" />
            ) : (
              <Txt center style={styles.acceptTxt}>
                {d.isRtl ? 'قبول التعديلات' : 'Accept Changes'}
              </Txt>
            )}
          </Press>
        </View>
      </FadeIn>
    </>
  );
}

const styles = StyleSheet.create({
  fill: { width: '100%', height: '100%' },
  scrim: { ...StyleSheet.absoluteFillObject, zIndex: 30, backgroundColor: 'rgba(0,0,0,0.32)' },
  sheet: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    top: '9%',
    zIndex: 31,
    backgroundColor: C.sheetBg,
    borderTopLeftRadius: 26,
    borderTopRightRadius: 26,
    overflow: 'hidden',
    boxShadow: '0 -14px 40px rgba(0,0,0,0.25)',
  },
  grabberWrap: { paddingTop: 10, alignItems: 'center' },
  grabber: { width: 38, height: 4, borderRadius: 3, backgroundColor: 'rgba(0,0,0,0.18)' },
  head: {
    paddingVertical: 12,
    paddingHorizontal: 20,
    alignItems: 'center',
    justifyContent: 'space-between',
    borderBottomWidth: 1,
    borderBottomColor: C.cardBorder,
  },
  headTitle: { fontWeight: W.heavy, fontSize: 19 },
  closeBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(0,0,0,0.06)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  body: { flex: 1 },
  sectionLabel: {
    paddingTop: 16,
    paddingHorizontal: 20,
    paddingBottom: 8,
    fontSize: 12.5,
    fontWeight: W.bold,
    color: 'rgba(110,110,115,0.9)',
    letterSpacing: 0.4,
  },
  itemRow: {
    gap: 12,
    marginHorizontal: 20,
    marginBottom: 10,
    padding: 10,
    borderRadius: 16,
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: C.cardBorder,
    alignItems: 'center',
  },
  itemImg: {
    width: 52,
    height: 52,
    borderRadius: 10,
    overflow: 'hidden',
    backgroundColor: 'rgba(0,0,0,0.03)',
  },
  itemMeta: { flex: 1, minWidth: 0, gap: 4 },
  itemTitle: { fontSize: 13.5, fontWeight: W.semibold, lineHeight: 18 },
  itemTotal: { fontSize: 12.5, fontWeight: W.bold, color: 'rgba(110,110,115,0.9)' },

  empty: {
    marginHorizontal: 20,
    marginBottom: 8,
    padding: 16,
    borderRadius: 16,
    backgroundColor: 'rgba(0,0,0,0.03)',
  },
  emptyTxt: { fontSize: 13, color: 'rgba(110,110,115,0.9)' },

  rule: { height: 1, backgroundColor: C.cardBorder, marginHorizontal: 20, marginTop: 12, marginBottom: 4 },
  groupLabel: { paddingTop: 10, paddingHorizontal: 20, paddingBottom: 6, fontSize: 15, fontWeight: W.heavy },
  catalogRow: {
    gap: 12,
    marginHorizontal: 20,
    marginBottom: 8,
    paddingVertical: 9,
    paddingHorizontal: 10,
    borderRadius: 14,
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.07)',
    alignItems: 'center',
  },
  catalogImg: {
    width: 44,
    height: 44,
    borderRadius: 9,
    overflow: 'hidden',
    backgroundColor: 'rgba(0,0,0,0.03)',
  },
  catalogMeta: { flex: 1, minWidth: 0, gap: 2 },
  catalogTitle: { fontSize: 13, fontWeight: W.semibold, lineHeight: 17 },
  catalogPrice: { fontSize: 12, color: 'rgba(110,110,115,0.9)' },

  foot: {
    paddingTop: 14,
    paddingHorizontal: 20,
    paddingBottom: 20,
    borderTopWidth: 1,
    borderTopColor: C.cardBorder,
    backgroundColor: C.sheetBg,
  },
  footSub: { fontSize: 13, color: 'rgba(110,110,115,0.9)' },
  footTotal: { fontSize: 15, fontWeight: W.heavy },
  accept: { paddingVertical: 15, borderRadius: 999, backgroundColor: '#1a1a1a' },
  acceptTxt: { fontWeight: W.bold, fontSize: 14.5, color: '#fff' },
});
