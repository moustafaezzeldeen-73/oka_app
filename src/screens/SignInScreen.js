import React, { useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';

import { useActions, useDerived } from '../store';
import { signIn } from '../api/auth';
import { success } from '../haptics';
import { C, W } from '../theme';
import { textDir } from '../rtl';
import { FadeIn } from '../components/anim';
import { Press, Txt } from '../components/ui';
import { Cta, ScreenHeader } from '../components/parts';

/**
 * Sign-in — testing stage.
 *
 * The Google and Apple buttons are placeholders: they sign in as whatever
 * identifier is typed, with no verification. The password field takes the
 * master password, which opens any customer's real account. Both paths are
 * clearly marked and must be replaced before release.
 */
export default function SignInScreen() {
  const actions = useActions();
  const d = useDerived();
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  const attempt = async (provider) => {
    if (busy) return;
    if (!identifier.trim()) {
      setError(d.isRtl ? 'اكتب الإيميل أو رقم الموبايل' : 'Enter an email or phone number');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const r = await signIn({ identifier: identifier.trim(), password, provider });
      success();
      actions.signedIn({ token: r.token, customer: r.customer, staff: r.staff, via: r.via });
    } catch (err) {
      setError(String(err.message ?? err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <FadeIn style={styles.root}>
      <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
        <ScreenHeader
          title={d.isRtl ? 'تسجيل الدخول' : 'Sign in'}
          onBack={actions.goBack}
          isRtl={d.isRtl}
        />

        <View style={styles.body}>
          <Txt isRtl={d.isRtl} style={styles.lead}>
            {d.isRtl
              ? 'سجّل دخولك لمتابعة طلباتك ونقاطك وعناوينك'
              : 'Sign in to follow your orders, points and addresses'}
          </Txt>

          <Press onPress={() => attempt('apple')} activeScale={0.98} style={styles.apple}>
            <AppleMark />
            <Txt style={styles.appleTxt}>
              {d.isRtl ? 'المتابعة باستخدام Apple' : 'Continue with Apple'}
            </Txt>
          </Press>

          <Press onPress={() => attempt('google')} activeScale={0.98} style={styles.google}>
            <GoogleMark />
            <Txt style={styles.googleTxt}>
              {d.isRtl ? 'المتابعة باستخدام Google' : 'Continue with Google'}
            </Txt>
          </Press>

          <View style={[styles.orRow, { flexDirection: d.isRtl ? 'row-reverse' : 'row' }]}>
            <View style={styles.orLine} />
            <Txt style={styles.orTxt}>{d.isRtl ? 'أو' : 'or'}</Txt>
            <View style={styles.orLine} />
          </View>

          <Txt isRtl={d.isRtl} style={styles.label}>
            {d.isRtl ? 'الإيميل أو رقم الموبايل' : 'Email or phone number'}
          </Txt>
          <TextInput
            value={identifier}
            onChangeText={setIdentifier}
            placeholder={d.isRtl ? 'name@email.com' : 'name@email.com'}
            placeholderTextColor="rgba(110,110,115,0.6)"
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="email-address"
            style={[styles.input, textDir(d.isRtl)]}
          />

          <Txt isRtl={d.isRtl} style={styles.label}>
            {d.isRtl ? 'كلمة المرور' : 'Password'}
          </Txt>
          <TextInput
            value={password}
            onChangeText={setPassword}
            placeholder="••••"
            placeholderTextColor="rgba(110,110,115,0.6)"
            secureTextEntry
            style={[styles.input, textDir(d.isRtl)]}
          />

          {error ? (
            <Txt isRtl={d.isRtl} style={styles.error}>
              {error}
            </Txt>
          ) : null}

          <Cta
            label={busy ? '' : d.isRtl ? 'تسجيل الدخول' : 'Sign in'}
            onPress={() => attempt('password')}
            style={{ marginTop: 8 }}
          >
            {busy ? <ActivityIndicator color="#ffffff" /> : undefined}
          </Cta>

          <View style={styles.notice}>
            <Txt isRtl={d.isRtl} style={styles.noticeTxt}>
              {d.isRtl
                ? 'وضع الاختبار: الدخول بكلمة المرور الرئيسية يفتح حساب أي عميل، وأزرار Google وApple مؤقتة بدون تحقق.'
                : 'Testing mode: the master password opens any customer account, and the Google/Apple buttons are placeholders with no verification.'}
            </Txt>
          </View>
        </View>
      </ScrollView>
    </FadeIn>
  );
}

const AppleMark = () => (
  <Svg width={17} height={20} viewBox="0 0 17 20">
    <Path
      d="M14.1 10.6c0-2.3 1.9-3.4 2-3.5-1.1-1.6-2.8-1.8-3.4-1.8-1.4-.1-2.8.9-3.5.9s-1.8-.9-3-.9c-1.5 0-2.9.9-3.7 2.3-1.6 2.7-.4 6.8 1.1 9 .8 1.1 1.7 2.3 2.9 2.3 1.2 0 1.6-.7 3-.7s1.8.7 3 .7 2-1.1 2.8-2.2c.9-1.2 1.2-2.4 1.2-2.5 0 0-2.4-.9-2.4-3.6zM11.9 3.8c.6-.8 1.1-1.9 1-3-.9 0-2.1.6-2.8 1.4-.6.7-1.2 1.8-1 2.9 1 .1 2.1-.5 2.8-1.3z"
      fill="#ffffff"
    />
  </Svg>
);

const GoogleMark = () => (
  <Svg width={18} height={18} viewBox="0 0 18 18">
    <Path d="M17.6 9.2c0-.6-.05-1.2-.16-1.8H9v3.4h4.8a4.1 4.1 0 01-1.78 2.7v2.2h2.9c1.68-1.55 2.65-3.84 2.65-6.5z" fill="#4285F4" />
    <Path d="M9 18c2.4 0 4.42-.8 5.9-2.15l-2.9-2.25c-.8.54-1.83.86-3 .86-2.31 0-4.27-1.56-4.97-3.66H1.05v2.32A8.99 8.99 0 009 18z" fill="#34A853" />
    <Path d="M4.03 10.8a5.4 5.4 0 010-3.44V5.04H1.05a9 9 0 000 8.08l2.98-2.32z" fill="#FBBC05" />
    <Path d="M9 3.58c1.32 0 2.5.45 3.43 1.34l2.57-2.57C13.42.9 11.4 0 9 0A8.99 8.99 0 001.05 5.04l2.98 2.32C4.73 5.26 6.69 3.58 9 3.58z" fill="#EA4335" />
  </Svg>
);

const styles = StyleSheet.create({
  root: { flex: 1 },
  body: { paddingHorizontal: 22, paddingBottom: 30, gap: 12 },
  lead: { fontSize: 14.5, lineHeight: 21, color: C.inkSoft, marginBottom: 6 },

  apple: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    paddingVertical: 15,
    borderRadius: 999,
    backgroundColor: '#000000',
  },
  appleTxt: { color: '#ffffff', fontSize: 15.5, fontWeight: W.semibold },
  google: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    paddingVertical: 15,
    borderRadius: 999,
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.16)',
  },
  googleTxt: { color: '#1d1d1f', fontSize: 15.5, fontWeight: W.semibold },

  orRow: { alignItems: 'center', gap: 12, marginVertical: 6 },
  orLine: { flex: 1, height: 1, backgroundColor: C.hairline },
  orTxt: { fontSize: 12.5, color: C.inkSofter },

  label: { fontSize: 12.5, fontWeight: W.semibold, color: 'rgba(110,110,115,0.95)', marginBottom: -4 },
  input: {
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.14)',
    paddingVertical: 13,
    paddingHorizontal: 15,
    fontSize: 15,
    backgroundColor: 'rgba(255,255,255,0.5)',
    color: C.ink,
  },
  error: { fontSize: 12.5, color: '#b3261e', lineHeight: 18 },

  notice: {
    marginTop: 10,
    padding: 13,
    borderRadius: 14,
    backgroundColor: 'rgba(0,0,0,0.04)',
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.09)',
  },
  noticeTxt: { fontSize: 11.5, lineHeight: 17, color: C.inkSoft },
});
