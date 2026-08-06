import React from 'react';
import { StyleSheet, View } from 'react-native';

import { C, W } from '../theme';
import { chevronFlip } from '../rtl';
import { DarkFill, Img, Press, Txt } from './ui';
import { Glow } from './anim';
import { ChevronLeft } from './Icons';

/**
 * `grid-template-columns: 40px 1fr 40px` header with a back chevron and a
 * centred title — shared by checkout, orders, addresses, loyalty.
 */
export function ScreenHeader({ title, onBack, isRtl }) {
  return (
    <View style={[styles.header, { flexDirection: isRtl ? 'row-reverse' : 'row' }]}>
      <Press onPress={onBack} style={[styles.headerBtn, chevronFlip(isRtl)]} hitSlop={10}>
        <ChevronLeft size={20} />
      </Press>
      <Txt center style={styles.headerTitle} numberOfLines={1}>
        {title}
      </Txt>
      <View style={styles.headerBtn} />
    </View>
  );
}

/** The dark pill CTA. `glow` adds the 2.6s `okaGlow` pulse. */
export function Cta({ label, onPress, glow, style, textStyle, children }) {
  const button = (
    <Press onPress={onPress} activeScale={0.98} style={glow ? undefined : style}>
      <DarkFill borderRadius={999} style={styles.ctaFill}>
        {children ?? (
          <Txt center style={[styles.ctaTxt, textStyle]}>
            {label}
          </Txt>
        )}
      </DarkFill>
    </Press>
  );
  // The glow lives on a wrapper so the shadow isn't clipped by the pill's own
  // rounded overflow, and so the press-scale and the pulse don't fight.
  return glow ? (
    <Glow radius={999} style={style}>
      {button}
    </Glow>
  ) : (
    button
  );
}

/** −/qty/+ stepper. `size` matches the three variants in the prototype. */
export function QtyStepper({ qty, onDec, onInc, size = 32, fontSize = 16, gap = 10, isRtl }) {
  const btn = {
    width: size,
    height: size,
    borderRadius: size / 2,
  };
  return (
    <View
      style={[
        styles.stepper,
        { gap, flexDirection: isRtl ? 'row-reverse' : 'row' },
      ]}
    >
      <Press onPress={onDec} activeScale={0.9} style={[styles.stepBtn, btn]} hitSlop={6}>
        <Txt style={{ fontSize }}>–</Txt>
      </Press>
      <Txt center style={[styles.stepQty, { width: size < 28 ? 18 : 22 }]}>
        {qty}
      </Txt>
      <Press onPress={onInc} activeScale={0.9} style={[styles.stepBtn, btn]} hitSlop={6}>
        <Txt style={{ fontSize }}>+</Txt>
      </Press>
    </View>
  );
}

/** The 2-up grid card used on the collection screen. */
export function GridCard({ product, d, onOpen, onAdd }) {
  return (
    <Press onPress={onOpen} style={styles.gridCard}>
      <View style={styles.gridImgWrap}>
        <Img source={product.img} contentFit="contain" style={styles.fill} />
      </View>
      <View style={styles.gridBody}>
        <Txt isRtl={d.isRtl} style={styles.gridTitle}>
          {d.title(product)}
        </Txt>
        <View style={[styles.gridRow, { flexDirection: d.isRtl ? 'row-reverse' : 'row' }]}>
          <Txt style={styles.gridPrice}>{d.fmtPrice(product.price)}</Txt>
          <Press onPress={onAdd} activeScale={0.9} hitSlop={8}>
            <DarkFill borderRadius={12} style={styles.gridAdd}>
              <Txt style={styles.gridAddTxt}>+</Txt>
            </DarkFill>
          </Press>
        </View>
      </View>
    </Press>
  );
}

/** A row in the totals block: label on the start edge, value on the end edge. */
export function SumRow({ label, value, isRtl, style, labelStyle, valueStyle }) {
  return (
    <View style={[styles.sumRow, { flexDirection: isRtl ? 'row-reverse' : 'row' }, style]}>
      <Txt style={labelStyle}>{label}</Txt>
      <Txt style={valueStyle}>{value}</Txt>
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { width: '100%', height: '100%' },

  header: {
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 6,
    paddingHorizontal: 16,
    paddingBottom: 18,
  },
  headerBtn: { width: 40, height: 36, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { flex: 1, fontWeight: W.bold, fontSize: 17 },

  ctaFill: {
    paddingVertical: 16,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ctaTxt: { color: '#ffffff', fontWeight: W.heavy, fontSize: 16 },

  stepper: { alignItems: 'center' },
  stepBtn: {
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.14)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepQty: { fontWeight: W.bold },

  gridCard: {
    flex: 1,
    borderRadius: 20,
    backgroundColor: C.cardBg,
    borderWidth: 1,
    borderColor: C.cardBorder,
    overflow: 'hidden',
  },
  gridImgWrap: { aspectRatio: 1 },
  gridBody: { paddingHorizontal: 12, paddingTop: 8, paddingBottom: 14 },
  gridTitle: { fontSize: 12, fontWeight: W.semibold, lineHeight: 15 },
  gridRow: { alignItems: 'center', justifyContent: 'space-between', marginTop: 8 },
  gridPrice: { fontSize: 13, fontWeight: W.heavy, color: C.ink },
  gridAdd: { width: 24, height: 24, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  gridAddTxt: { fontWeight: W.heavy, fontSize: 13, color: '#ffffff', lineHeight: 15 },

  sumRow: { justifyContent: 'space-between', alignItems: 'center', paddingVertical: 4 },
});
