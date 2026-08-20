# Call recording on Android

Short version: **this app cannot record calls, and neither can any other
third-party Android app.** Salestrail — which OKA already runs — does the
recording, and the warehouse app reads its log and plays back its audio.

## Why the app can't do it

### 1. Expo Go rules it out immediately

Expo Go is a fixed, pre-built binary. It cannot load custom native modules or
declare extra permissions. Call recording is native work by definition, so
nothing that records calls can ever run in Expo Go. It would need a
development build via EAS, which is a different distribution story from the
"scan a QR code" testing setup the app uses today.

### 2. Android itself blocks it, build or no build

This is the part that doesn't have a workaround:

| Android version | Status |
|---|---|
| 9 and earlier (API ≤ 28) | `MediaRecorder.AudioSource.VOICE_CALL` worked with permissions |
| **10 (API 29)** | `VOICE_CALL`, `VOICE_DOWNLINK`, `VOICE_UPLINK` restricted — they now require `CAPTURE_AUDIO_OUTPUT`, which is `signature\|privileged`. Only system, carrier, and preloaded OEM apps can hold it |
| 11+ | Same restriction, plus the `AccessibilityService` workaround was closed by Google Play policy in **May 2022** — apps using accessibility APIs to record calls are removed from the Play Store |

An ordinary app on Android 10+ can still open the **microphone**
(`AudioSource.MIC` / `VOICE_COMMUNICATION`). That captures the rep's own voice
plus whatever leaks out of the earpiece. On speakerphone it is poor; on the
earpiece the customer is close to inaudible. It is not a usable record of what
the customer agreed to, which is the whole reason to record a sales call.

The apps still doing real two-way recording fall into three buckets, none of
which apply here: preloaded OEM dialers (Xiaomi, Samsung in some regions),
carrier-side recording, or rooted devices.

### 3. What Salestrail actually gives you

Worth separating, because the two halves have very different replacement
costs:

- **Call logging** — who called which number, when, answered or not, how long.
  This never depended on the recording APIs and is straightforward to replace.
- **Call audio** — subject to every limit above. Salestrail's own recording is
  device-dependent on Android 10+ for exactly the same reasons; it is not
  exempt from the platform rules.

### 4. Salestrail currently solves this

OKA already runs Salestrail, whose Android app captures these calls and
exposes them over an API:

```
GET /export/calls/json                  the call log
GET /export/calls/{callId}/recording    the audio for one call
```

Building a second, worse recorder inside the warehouse app would produce
half a conversation and a Play Store problem, while the good recording of the
same call already exists in Salestrail.

## What was built instead

`src/lib/salestrail.js` plus two routes:

- `GET /api/calls?phone=<number>&days=14` — that customer's call history:
  time, answered, inbound/outbound, duration, the rep, and whether audio
  exists.
- `GET /api/calls/:callId/recording` — the playable reference for one call.

The mobile app's contact-history rows are fed from this. Before it, that
section rendered fixture data; now each row is a real logged call, and rows
with audio get a play button.

Two implementation details worth keeping:

- The date parameters are `from` / `to`. `start_date` / `end_date` return
  HTTP 400.
- The log is fetched **one day at a time**. Multi-day ranges get truncated,
  and a truncated log reports customers as "never called" when they were
  called — a silent wrong answer rather than an error.

Matching is on the normalized phone number (see `src/domain/phone.js`), so a
Shopify record holding `+201110727746` still matches a call logged as
`01110727746`.

## Consent

The design already shows a "Recording call" indicator during a call, which is
the right behaviour — the rep can see recording is active and say so. Egypt's
Penal Code (Art. 309 bis) treats recording a private conversation without
consent as an offence, so the announcement at the start of the call is what
makes the recording sound. That disclosure is Salestrail's job and the rep's,
not something this app can assert on their behalf.

Note that the indicator in this app reflects **Salestrail's** recording state,
not this app's — the warehouse app never captures audio.


---

# Retiring Salestrail

Nothing above `src/lib/callProvider.js` imports Salestrail any more. Routes and
the mobile app talk to that module and receive one normalized shape, so
swapping providers is `CALL_PROVIDER=<name>` plus one new file — not a rewrite.

```
CALL_PROVIDER=salestrail   # current
CALL_PROVIDER=voip         # recommended replacement (not implemented)
CALL_PROVIDER=device       # Android call log, OEM audio (not implemented)
CALL_PROVIDER=none         # history renders empty
```

A provider implements three functions:

```js
isConfigured() -> boolean
callsForPhone(phone, { days }) -> [{
  id, startTime, answered, inbound, duration, durationLabel, rep,
  hasRecording, recordingUrl
}]
getRecording(callId) -> { url } | null
```

## The three replacement options

### A. VoIP — calls placed through the app (recommended)

The rep dials from inside the app over a telephony provider (Twilio, Vonage,
MessageBird, or an Egyptian carrier partner) instead of the native dialer. The
provider bridges to the customer's normal mobile number, so nothing changes for
the customer.

- **Audio:** clean two-way, recorded server-side. No Android limits apply,
  because the OS is never in the media path.
- **Platforms:** Android *and* iOS. The only option that works on iPhone.
- **Logging:** complete and authoritative — the provider places every call.
- **Cost:** per-minute rates plus a number. Calls consume data, not GSM
  minutes.
- **Work:** a provider account, a small server-side call-control service, and
  a dialer screen in the app. This is the largest build of the three and the
  only one that fully replaces Salestrail.

### B. Device — native build reading the Android call log

A development build (EAS, not Expo Go) with `READ_CALL_LOG` and
`READ_PHONE_STATE` reads the system call log directly.

- **Audio:** none reliably. Microphone-only capture gets the rep's half and
  little of the customer's. Some OEM dialers (Xiaomi, some Samsung regions)
  write recordings to storage that the app could read, but the path, format,
  and availability vary per device and per OS update.
- **Platforms:** Android only. iOS exposes no call log to apps at all.
- **Play Store:** reading the call log requires a Play Console declaration and
  review; using accessibility APIs to record is grounds for removal.
- **Work:** moderate. Replaces the *logging* half of Salestrail well and the
  *recording* half poorly.

### C. Keep a recorder, drop the rest

Retire Salestrail's subscription but keep some recorder on the device, with the
app reading audio files from shared storage. Fragile, needs broad storage
permissions, and breaks whenever an OEM changes its layout. Listed for
completeness, not recommended.

## The honest summary

If recordings matter — and the design puts a recording indicator on the call
screen, so they clearly do — **option A is the only one that actually
delivers them** on current Android and on iOS at all. Options B and C replace
the call log and leave the audio worse than it is today.
