import React, { useMemo, useState } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { WebView } from 'react-native-webview';

import { C, D, W } from '../theme';
import { FadeIn } from '../components/anim';
import { Press, Txt } from '../components/ui';
import { Close, Cube } from '../components/Icons';
import { canOpenInSpace, glbUrlFor, openInSpace } from '../ar';

/**
 * In-app AR.
 *
 * The live camera is the backdrop; the product's GLB is rendered on top of it
 * in a transparent WebView running Google's <model-viewer>, which handles GLTF
 * loading, orbit, pinch-zoom and lighting. Both pieces ship in Expo Go, so
 * this needs no development build.
 *
 * What this is not: surface-anchored ARKit. Pinning a model to a detected
 * plane requires native ARKit, which Expo Go cannot load — that needs a
 * development build. The "real size on your floor" button below hands off to
 * iOS AR Quick Look, which does exactly that, at the cost of leaving the app.
 */
export default function ArViewer({ product, title, price, isRtl, onClose }) {
  const [permission, requestPermission] = useCameraPermissions();
  const [loading, setLoading] = useState(true);

  const html = useMemo(() => buildHtml(glbUrlFor(product)), [product]);

  const granted = permission?.granted;

  return (
    <FadeIn duration={D.fadeInFast} fromY={0} style={styles.root}>
      {granted ? (
        <CameraView style={StyleSheet.absoluteFill} facing="back" />
      ) : (
        <View style={[StyleSheet.absoluteFill, styles.noCam]} />
      )}

      {/* the model, floating over the camera feed */}
      {html ? (
        <WebView
          source={{ html }}
          style={styles.web}
          containerStyle={styles.web}
          originWhitelist={['*']}
          javaScriptEnabled
          domStorageEnabled
          allowFileAccess
          scrollEnabled={false}
          backgroundColor="transparent"
          opaque={false}
          onLoadEnd={() => setLoading(false)}
        />
      ) : null}

      {loading && html ? (
        <View style={styles.loading} pointerEvents="none">
          <ActivityIndicator color="#ffffff" />
        </View>
      ) : null}

      {/* chrome */}
      <View style={styles.top} pointerEvents="box-none">
        <Press onPress={onClose} activeScale={0.94} style={styles.close} hitSlop={10}>
          <Close size={18} color="#ffffff" width={2.2} />
        </Press>
      </View>

      {!granted ? (
        <View style={styles.permWrap}>
          <Txt center style={styles.permTxt}>
            {isRtl
              ? 'محتاجين إذن الكاميرا عشان تشوف المنتج في مكانك'
              : 'Camera access is needed to place the product in your space'}
          </Txt>
          <Press onPress={requestPermission} activeScale={0.97} style={styles.permBtn}>
            <Txt center style={styles.permBtnTxt}>
              {isRtl ? 'السماح بالكاميرا' : 'Allow camera'}
            </Txt>
          </Press>
        </View>
      ) : null}

      <View style={styles.bottom} pointerEvents="box-none">
        <View style={styles.card}>
          <Txt isRtl={isRtl} style={styles.cardTitle} numberOfLines={1}>
            {title}
          </Txt>
          <Txt isRtl={isRtl} style={styles.cardPrice}>
            {price}
          </Txt>
        </View>
        {canOpenInSpace(product) ? (
          <Press onPress={() => openInSpace(product)} activeScale={0.97} style={styles.quicklook}>
            <Cube size={16} color={C.ink} />
            <Txt style={styles.quicklookTxt}>
              {isRtl ? 'ثبّتها على الأرض بالمقاس الحقيقي' : 'Pin it to the floor at real size'}
            </Txt>
          </Press>
        ) : null}
        <Txt center style={styles.hint}>
          {isRtl ? 'اسحب للف · قرّب للتكبير' : 'Drag to rotate · pinch to zoom'}
        </Txt>
      </View>
    </FadeIn>
  );
}

/**
 * A minimal page hosting <model-viewer> with a transparent canvas so the
 * camera shows through. The component is fetched from Google's CDN, which the
 * device can reach even though the model itself comes from Shopify's.
 */
function buildHtml(modelUrl) {
  if (!modelUrl) return null;
  return `<!doctype html>
<html>
<head>
<meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no">
<style>
  html,body{margin:0;height:100%;background:transparent;overflow:hidden}
  model-viewer{width:100%;height:100%;background-color:transparent;--poster-color:transparent}
</style>
<script type="module" src="https://ajax.googleapis.com/ajax/libs/model-viewer/3.5.0/model-viewer.min.js"></script>
</head>
<body>
  <model-viewer
    src="${modelUrl}"
    camera-controls
    touch-action="none"
    interaction-prompt="none"
    shadow-intensity="1"
    exposure="1.1"
    environment-image="neutral"
    camera-orbit="25deg 75deg auto">
  </model-viewer>
</body>
</html>`;
}

const styles = StyleSheet.create({
  root: { ...StyleSheet.absoluteFillObject, zIndex: 40, backgroundColor: '#000' },
  noCam: { backgroundColor: '#1a1a1d' },
  web: { ...StyleSheet.absoluteFillObject, backgroundColor: 'transparent' },
  loading: { ...StyleSheet.absoluteFillObject, alignItems: 'center', justifyContent: 'center' },

  top: { position: 'absolute', top: 58, left: 18, right: 18, flexDirection: 'row' },
  close: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(20,18,16,0.55)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.28)',
    alignItems: 'center',
    justifyContent: 'center',
  },

  permWrap: {
    position: 'absolute',
    left: 28,
    right: 28,
    top: '42%',
    gap: 14,
  },
  permTxt: { color: '#ffffff', fontSize: 14.5, fontWeight: W.semibold, lineHeight: 21 },
  permBtn: { paddingVertical: 13, borderRadius: 999, backgroundColor: '#ffffff' },
  permBtnTxt: { color: C.ink, fontSize: 14, fontWeight: W.bold },

  bottom: { position: 'absolute', left: 18, right: 18, bottom: 34, gap: 10 },
  card: {
    paddingVertical: 14,
    paddingHorizontal: 18,
    borderRadius: 22,
    backgroundColor: 'rgba(20,18,16,0.6)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.22)',
  },
  cardTitle: { color: '#ffffff', fontSize: 16, fontWeight: W.bold },
  cardPrice: { color: 'rgba(255,255,255,0.92)', fontSize: 14.5, fontWeight: W.semibold, marginTop: 4 },
  quicklook: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 9,
    paddingVertical: 14,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.94)',
  },
  quicklookTxt: { fontSize: 14, fontWeight: W.bold, color: C.ink },
  hint: { color: 'rgba(255,255,255,0.75)', fontSize: 11.5, fontWeight: W.semibold },
});
