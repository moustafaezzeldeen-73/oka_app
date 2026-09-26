/**
 * ─────────────────────────────────────────────────────────────────────────
 *  TESTING ONLY — "sign in as any real customer".  DELETE BEFORE LAUNCH.
 * ─────────────────────────────────────────────────────────────────────────
 *
 * Shown only when the build sets EXPO_PUBLIC_TEST_LOGIN=1 AND the server
 * reports test login as enabled (TEST_LOGIN_KEY set, not production). The
 * tester types the key; it is never bundled into the app.
 *
 * Removal: delete this file and its import + <TestLoginPanel /> in
 * app/src/screens/SignInScreen.js. The server half is server/auth/testLogin.js.
 */
import React, { useState } from 'react';
import { ActivityIndicator, StyleSheet, TextInput, View } from 'react-native';

import { testLogin } from '../api/auth';
import { useActions, useStore } from '../state/store';
import { C, W } from '../theme';
import { Txt } from './ui';
import { Cta } from './parts';

const ENABLED_IN_BUILD = process.env.EXPO_PUBLIC_TEST_LOGIN === '1';

export default function TestLoginPanel() {
  const { state } = useStore();
  const actions = useActions();
  const [identifier, setIdentifier] = useState('');
  const [key, setKey] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  if (!ENABLED_IN_BUILD || !state.config.signIn?.testLogin) return null;

  const go = async () => {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const r = await testLogin({ identifier: identifier.trim(), key });
      actions.signedIn({ token: r.token, customer: r.customer, via: r.via, test: true });
    } catch (err) {
      setError(String(err.message ?? err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={styles.box}>
      <Txt style={styles.title}>TESTING — sign in as a customer</Txt>
      <Txt style={styles.note}>
        Opens any real customer by phone or email. Remove before launch.
      </Txt>
      <TextInput
        value={identifier}
        onChangeText={setIdentifier}
        placeholder="+2010… or name@email.com"
        placeholderTextColor="rgba(110,110,115,0.6)"
        autoCapitalize="none"
        autoCorrect={false}
        style={styles.input}
      />
      <TextInput
        value={key}
        onChangeText={setKey}
        placeholder="Test key"
        placeholderTextColor="rgba(110,110,115,0.6)"
        autoCapitalize="none"
        autoCorrect={false}
        secureTextEntry
        style={styles.input}
      />
      {error ? <Txt style={styles.error}>{error}</Txt> : null}
      <Cta label={busy ? '' : 'Open this customer'} onPress={go}>
        {busy ? <ActivityIndicator color="#ffffff" /> : undefined}
      </Cta>
    </View>
  );
}

const styles = StyleSheet.create({
  box: {
    marginTop: 18,
    padding: 14,
    gap: 10,
    borderRadius: 14,
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderColor: '#c0392b',
    backgroundColor: 'rgba(192,57,43,0.05)',
  },
  title: { fontSize: 12.5, fontWeight: W.heavy, color: '#c0392b', letterSpacing: 0.4 },
  note: { fontSize: 12, color: C.inkSoft, lineHeight: 17 },
  input: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.14)',
    paddingVertical: 11,
    paddingHorizontal: 13,
    fontSize: 14,
    backgroundColor: '#ffffff',
    color: C.ink,
  },
  error: { fontSize: 12.5, color: '#b3261e' },
});
