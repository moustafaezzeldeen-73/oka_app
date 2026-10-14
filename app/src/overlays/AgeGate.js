import React from 'react';
import { StyleSheet, View } from 'react-native';
import { BlurView } from 'expo-blur';

import { useActions, useDerived } from '../state/store';
import { C, W } from '../theme';
import { FadeIn } from '../components/anim';
import { Press, Txt } from '../components/ui';
import { Cta } from '../components/parts';

/**
 * Shown once, before anything else: parts of the catalogue are tobacco
 * products, which may only be sold to adults. The answer is remembered on
 * the device.
 */
export default function AgeGate() {
  const actions = useActions();
  const d = useDerived();
  return (
    <View style={StyleSheet.absoluteFill}>
      <BlurView intensity={40} tint="light" style={StyleSheet.absoluteFill} />
      <View style={styles.center}>
        <FadeIn style={styles.card}>
          <Txt center style={styles.title}>{d.isRtl ? 'عندك ١٨ سنة أو أكتر؟' : 'Are you 18 or older?'}</Txt>
          <Txt center style={styles.body}>
            {d.isRtl
              ? 'بعض منتجات أوكا فيها تبغ، وبنبيعها للكبار بس.'
              : 'Some OKA products contain tobacco and are sold to adults only.'}
          </Txt>
          <Cta label={d.isRtl ? 'أيوه، عندي ١٨+' : 'Yes, I’m 18+'} onPress={actions.confirmAge} />
          <Press onPress={actions.toggleLang} style={styles.lang}>
            <Txt center style={styles.langTxt}>{d.isRtl ? 'English' : 'العربية'}</Txt>
          </Press>
        </FadeIn>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, justifyContent: 'center', paddingHorizontal: 28 },
  card: {
    backgroundColor: '#ffffff',
    borderRadius: 24,
    padding: 24,
    gap: 14,
    shadowColor: '#000',
    shadowOpacity: 0.12,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 10 },
  },
  title: { fontSize: 20, fontWeight: W.heavy, color: C.ink },
  body: { fontSize: 14, lineHeight: 21, color: C.inkSoft },
  lang: { paddingVertical: 6 },
  langTxt: { fontSize: 13, color: C.accent, fontWeight: W.semibold },
});
