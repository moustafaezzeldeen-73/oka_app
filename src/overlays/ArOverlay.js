import React from 'react';
import { StyleSheet, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Svg, { Defs, Ellipse, RadialGradient, Stop } from 'react-native-svg';

import { useActions, useDerived, useStore } from '../store';
import { success } from '../haptics';
import { C, D, EASE, W } from '../theme';
import { insetStart } from '../rtl';
import { FadeIn, Pop } from '../components/anim';
import { Img, Press, Txt } from '../components/ui';
import { ArCross, Close } from '../components/Icons';

/**
 * "See it on your table" — a simulated AR placement view.
 *
 * The web build painted the scene with layered radial gradients; those become
 * SVG radial gradients here, which is the only way to get a true elliptical
 * falloff in React Native.
 */
export default function ArOverlay() {
  const { state } = useStore();
  const actions = useActions();
  const d = useDerived();
  const p = d.byId(state.arProductId);
  const rowDir = { flexDirection: d.isRtl ? 'row-reverse' : 'row' };

  if (!p) return null;

  const controls = [
    { glyph: '⤢', label: d.isRtl ? 'اسحب للتحريك' : 'Drag to move' },
    { glyph: '⟳', label: d.isRtl ? 'لف للدوران' : 'Twist to rotate' },
    { glyph: '⤡', label: d.isRtl ? 'قرّب للتحجيم' : 'Pinch to scale' },
  ];

  const facts = [
    { label: d.isRtl ? 'السعر' : 'Price', value: d.fmtPrice(p.price) },
    { label: d.isRtl ? 'التوصيل' : 'Delivery', value: d.cityDays[state.city] },
    {
      label: d.isRtl ? 'التوفر' : 'Availability',
      value: p.stock <= 5 ? d.t('onlyLeft', { n: p.stock }) : d.t('inStock'),
    },
  ];

  return (
    <FadeIn duration={D.fadeInFast} fromY={0} style={styles.root}>
      <LinearGradient
        colors={['#6f6a63', '#8d8579', '#b3a795', '#8a7a63']}
        locations={[0, 0.38, 0.66, 1]}
        style={StyleSheet.absoluteFill}
      />
      {/* the pool of light on the table surface */}
      <Svg style={StyleSheet.absoluteFill} pointerEvents="none">
        <Defs>
          <RadialGradient id="pool" cx="50%" cy="62%" rx="70%" ry="45%">
            <Stop offset="0" stopColor="#ffffff" stopOpacity={0.34} />
            <Stop offset="0.65" stopColor="#ffffff" stopOpacity={0} />
          </RadialGradient>
        </Defs>
        <Ellipse cx="50%" cy="62%" rx="90%" ry="60%" fill="url(#pool)" />
      </Svg>
      <LinearGradient
        colors={['rgba(126,101,70,0.32)', 'rgba(74,57,38,0.66)']}
        style={styles.tableTop}
        pointerEvents="none"
      />
      <LinearGradient
        colors={['transparent', 'rgba(255,255,255,0.35)', 'transparent']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 0 }}
        style={styles.horizon}
        pointerEvents="none"
      />

      {/* top chrome */}
      <View style={[styles.topBar, rowDir]}>
        <Press onPress={actions.closeAr} activeScale={0.94} style={styles.closeBtn}>
          <Close size={17} color="#ffffff" width={2.1} />
        </Press>
        <View style={[styles.statusPill, rowDir]}>
          <View style={styles.statusDot} />
          <Txt style={styles.statusTxt}>{d.isRtl ? 'تم تحديد السطح' : 'Surface detected'}</Txt>
        </View>
      </View>

      {/* the placed object */}
      <View style={styles.stage}>
        <View style={{ alignItems: 'center' }}>
          <Pop duration={D.pop} easing={EASE.out} style={styles.objectCard}>
            <Img source={p.img} contentFit="cover" style={styles.objectImg} />
            <View style={[styles.scaleBadge, rowDir, insetStart(d.isRtl, 10)]}>
              <ArCross size={12} />
              <Txt style={styles.scaleTxt}>
                {d.isRtl ? 'بالمقاس الحقيقي' : 'Shown at actual size'}
              </Txt>
            </View>
          </Pop>
          <Svg width={196} height={28} style={{ marginTop: -6 }}>
            <Defs>
              <RadialGradient id="contact" cx="50%" cy="50%" rx="50%" ry="50%">
                <Stop offset="0" stopColor="#281c10" stopOpacity={0.42} />
                <Stop offset="0.72" stopColor="#281c10" stopOpacity={0} />
              </RadialGradient>
            </Defs>
            <Ellipse cx={98} cy={14} rx={98} ry={14} fill="url(#contact)" />
          </Svg>
        </View>
      </View>

      {/* gesture hints */}
      <View style={[styles.controls, rowDir]}>
        {controls.map((c) => (
          <View key={c.label} style={styles.control}>
            <View style={styles.controlBtn}>
              <Txt style={styles.controlGlyph}>{c.glyph}</Txt>
            </View>
            <Txt center style={styles.controlLabel}>
              {c.label}
            </Txt>
          </View>
        ))}
      </View>

      {/* product panel */}
      <View style={styles.panelWrap}>
        <View style={styles.panel}>
          <View style={[styles.panelHead, rowDir]}>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Txt isRtl={d.isRtl} style={styles.panelTitle}>
                {d.title(p)}
              </Txt>
              <Txt isRtl={d.isRtl} style={styles.panelPrice}>
                {d.fmtPrice(p.price)}
              </Txt>
            </View>
            <Press
              onPress={() => {
                actions.addToCart(p.id, 1);
                success();
              }}
              activeScale={0.96}
              style={styles.panelCta}
            >
              <Txt style={styles.panelCtaTxt}>{d.t('add')}</Txt>
            </Press>
          </View>
          <View style={styles.panelRule} />
          <View style={{ gap: 7 }}>
            {facts.map((f) => (
              <View key={f.label} style={[styles.factRow, rowDir]}>
                <Txt style={styles.factLabel}>{f.label}</Txt>
                <Txt style={styles.factValue}>{f.value}</Txt>
              </View>
            ))}
          </View>
        </View>
      </View>
    </FadeIn>
  );
}

const styles = StyleSheet.create({
  root: { ...StyleSheet.absoluteFillObject, zIndex: 20, overflow: 'hidden' },
  tableTop: { position: 'absolute', left: 0, right: 0, top: '56%', bottom: 0 },
  horizon: { position: 'absolute', left: 0, right: 0, top: '60%', height: 2 },

  topBar: {
    zIndex: 3,
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 10,
    paddingTop: 18,
    paddingHorizontal: 18,
  },
  closeBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: 'rgba(24,20,16,0.55)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.25)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  statusPill: {
    alignItems: 'center',
    gap: 7,
    paddingVertical: 9,
    paddingHorizontal: 14,
    borderRadius: 20,
    backgroundColor: 'rgba(24,20,16,0.55)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.25)',
  },
  statusDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: '#4ade80',
    boxShadow: '0 0 8px rgba(74,222,128,0.9)',
  },
  statusTxt: { fontSize: 11, fontWeight: W.bold, color: '#ffffff', letterSpacing: 0.3 },

  stage: { zIndex: 3, flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 24 },
  objectCard: {
    width: 238,
    borderRadius: 26,
    overflow: 'hidden',
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.85)',
    boxShadow: '0 26px 44px rgba(38,26,14,0.42), 0 3px 10px rgba(38,26,14,0.28)',
  },
  objectImg: { width: '100%', height: 272 },
  scaleBadge: {
    position: 'absolute',
    top: 10,
    alignItems: 'center',
    gap: 6,
    paddingVertical: 5,
    paddingHorizontal: 10,
    borderRadius: 12,
    backgroundColor: 'rgba(24,20,16,0.62)',
  },
  scaleTxt: { fontSize: 10.5, fontWeight: W.bold, color: '#ffffff' },

  controls: { zIndex: 3, justifyContent: 'center', gap: 10, paddingHorizontal: 20, paddingBottom: 14 },
  control: { alignItems: 'center', gap: 7, width: 82 },
  controlBtn: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: 'rgba(255,255,255,0.82)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.95)',
    alignItems: 'center',
    justifyContent: 'center',
    boxShadow: '0 6px 16px rgba(0,0,0,0.2)',
  },
  controlGlyph: { fontSize: 20, color: C.ink, fontWeight: W.semibold },
  controlLabel: {
    fontSize: 11,
    fontWeight: W.bold,
    color: C.ink,
    backgroundColor: 'rgba(255,255,255,0.86)',
    borderRadius: 10,
    paddingVertical: 4,
    paddingHorizontal: 8,
    lineHeight: 14,
    overflow: 'hidden',
  },

  panelWrap: { zIndex: 3, paddingHorizontal: 18, paddingBottom: 24 },
  panel: {
    padding: 18,
    borderRadius: 26,
    backgroundColor: 'rgba(24,20,16,0.62)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.22)',
    boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.18), 0 14px 34px rgba(0,0,0,0.3)',
  },
  panelHead: { alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 },
  panelTitle: { fontSize: 16, fontWeight: W.bold, color: '#ffffff', lineHeight: 21 },
  panelPrice: { fontSize: 14.5, fontWeight: W.semibold, color: 'rgba(255,255,255,0.92)', marginTop: 5 },
  panelCta: {
    paddingVertical: 11,
    paddingHorizontal: 18,
    borderRadius: 999,
    backgroundColor: '#ffffff',
    boxShadow: '0 6px 16px rgba(0,0,0,0.2)',
  },
  panelCtaTxt: { fontSize: 13, fontWeight: W.bold, color: C.ink },
  panelRule: { height: 1, backgroundColor: 'rgba(255,255,255,0.28)', marginVertical: 14 },
  factRow: { alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  factLabel: { fontSize: 12.5, color: 'rgba(255,255,255,0.85)' },
  factValue: { fontSize: 12, fontWeight: W.bold, color: '#ffffff' },
});
