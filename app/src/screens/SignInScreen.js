import React, { useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, TextInput, View } from 'react-native';

import { useActions, useDerived, useStore } from '../state/store';
import { startOtp, verifyOtp } from '../api/auth';
import { success } from '../lib/haptics';
import { C, W } from '../theme';
import { textDir } from '../lib/rtl';
import { FadeIn } from '../components/anim';
import { Press, Txt } from '../components/ui';
import { Cta, ScreenHeader } from '../components/parts';
// TESTING ONLY — delete this import and <TestLoginPanel /> below before launch.
import TestLoginPanel from '../components/TestLoginPanel';

/**
 * Sign in with a phone number and a one-time code.
 *
 * The first sign-in creates the account. A verified phone is what lets the
 * courier reach the customer, so checkout requires it.
 */
export default function SignInScreen() {
  const { state } = useStore();
  const actions = useActions();
  const d = useDerived();
  const [step, setStep] = useState('phone'); // phone | code
  const [phone, setPhone] = useState('');
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const otpAvailable = state.config.signIn?.otp;

  const sendCode = async () => {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const r = await startOtp(phone.trim());
      setPhone(r.phone);
      setStep('code');
    } catch (err) {
      setError(String(err.message ?? err));
    } finally {
      setBusy(false);
    }
  };

  const confirm = async () => {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const r = await verifyOtp({ phone, code: code.trim(), name: name.trim() || undefined });
      success();
      actions.signedIn({ token: r.token, customer: r.customer, via: r.via });
    } catch (err) {
      setError(String(err.message ?? err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <FadeIn style={styles.root}>
      <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
        <ScreenHeader title={d.isRtl ? 'تسجيل الدخول' : 'Sign in'} onBack={actions.goBack} isRtl={d.isRtl} />

        <View style={styles.body}>
          <Txt isRtl={d.isRtl} style={styles.lead}>
            {d.isRtl
              ? 'ادخل برقم موبايلك. هنبعتلك كود على واتساب.'
              : 'Sign in with your mobile number. We’ll send you a code on WhatsApp.'}
          </Txt>

          {!otpAvailable ? (
            <View style={styles.notice}>
              <Txt isRtl={d.isRtl} style={styles.noticeTxt}>
                {d.isRtl
                  ? 'الدخول برقم الموبايل مش متفعّل على السيرفر لسه.'
                  : 'Phone sign-in isn’t switched on for this server yet.'}
              </Txt>
            </View>
          ) : step === 'phone' ? (
            <>
              <Txt isRtl={d.isRtl} style={styles.label}>{d.isRtl ? 'رقم الموبايل' : 'Mobile number'}</Txt>
              <TextInput
                value={phone}
                onChangeText={setPhone}
                placeholder="01X XXXX XXXX"
                placeholderTextColor="rgba(110,110,115,0.6)"
                keyboardType="phone-pad"
                textContentType="telephoneNumber"
                autoComplete="tel"
                style={[styles.input, textDir(false)]}
              />
              <Txt isRtl={d.isRtl} style={styles.label}>
                {d.isRtl ? 'اسمك (لو أول مرة)' : 'Your name (first time only)'}
              </Txt>
              <TextInput
                value={name}
                onChangeText={setName}
                placeholder={d.isRtl ? 'الاسم' : 'Name'}
                placeholderTextColor="rgba(110,110,115,0.6)"
                textContentType="name"
                style={[styles.input, textDir(d.isRtl)]}
              />
              {error ? <Txt isRtl={d.isRtl} style={styles.error}>{error}</Txt> : null}
              <Cta label={busy ? '' : d.isRtl ? 'ابعت الكود' : 'Send code'} onPress={sendCode} style={{ marginTop: 8 }}>
                {busy ? <ActivityIndicator color="#ffffff" /> : undefined}
              </Cta>
            </>
          ) : (
            <>
              <Txt isRtl={d.isRtl} style={styles.label}>
                {d.isRtl ? `الكود اللي وصل على ${phone}` : `The code sent to ${phone}`}
              </Txt>
              <TextInput
                value={code}
                onChangeText={(v) => setCode(v.replace(/\D/g, '').slice(0, 6))}
                placeholder="••••••"
                placeholderTextColor="rgba(110,110,115,0.6)"
                keyboardType="number-pad"
                textContentType="oneTimeCode"
                autoComplete="sms-otp"
                style={[styles.input, styles.codeInput]}
              />
              {error ? <Txt isRtl={d.isRtl} style={styles.error}>{error}</Txt> : null}
              <Cta label={busy ? '' : d.isRtl ? 'تأكيد' : 'Confirm'} onPress={confirm} style={{ marginTop: 8 }}>
                {busy ? <ActivityIndicator color="#ffffff" /> : undefined}
              </Cta>
              <Press onPress={() => { setStep('phone'); setCode(''); setError(null); }} style={styles.link}>
                <Txt center style={styles.linkTxt}>
                  {d.isRtl ? 'غيّر الرقم أو ابعت كود جديد' : 'Change number or resend'}
                </Txt>
              </Press>
            </>
          )}

          <TestLoginPanel />
        </View>
      </ScrollView>
    </FadeIn>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  body: { paddingHorizontal: 22, paddingBottom: 30, gap: 12 },
  lead: { fontSize: 14.5, lineHeight: 21, color: C.inkSoft, marginBottom: 6 },
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
  codeInput: { fontSize: 22, letterSpacing: 8, textAlign: 'center' },
  error: { fontSize: 12.5, color: '#b3261e', lineHeight: 18 },
  link: { paddingVertical: 8 },
  linkTxt: { fontSize: 13, color: C.accent, fontWeight: W.semibold },
  notice: {
    marginTop: 4,
    padding: 13,
    borderRadius: 14,
    backgroundColor: 'rgba(0,0,0,0.04)',
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.09)',
  },
  noticeTxt: { fontSize: 12.5, lineHeight: 18, color: C.inkSoft },
});
