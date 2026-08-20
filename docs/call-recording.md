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
screen, so they clearly do — **option A is the only one that guarantees them**
on current Android and the only one that works on iOS at all. Option B gets
real recordings on handsets whose own dialer records, which in the Egyptian
market is most of them.

---

# Chosen path: option B, device-native

Decision (Mustafa): record natively on the handset, no per-minute cost, and
keep the in-app "call in progress" window.

## How it works

```
Rep taps Call in the app
   ↓  CALL_PHONE places the call, the in-app call window stays up
Phone's own system dialer records it   ← the only thing allowed to
   ↓  writes an audio file to shared storage
App reads READ_CALL_LOG + MediaStore audio
   ↓  matches file → call
History row shows a play button
```

The app never captures audio. The handset's dialer does, because it holds the
privileged permission this app cannot have. This app finds the file afterwards
and matches it to the right call.

## What it costs

Nothing recurring. No telephony account, no per-minute charges, no number
rental. Calls stay on GSM exactly as they are today.

## What it requires

1. **A development build.** `npm run android:dev` (`expo run:android`), or an
   EAS build. Expo Go is a fixed binary and can never hold `READ_CALL_LOG`.
   Local builds are free. Everything degrades to an empty history inside Expo
   Go rather than crashing, so QR testing of the rest of the app still works.
2. **Call recording switched on in the phone's own dialer.** Settings differ
   per OEM — usually Phone app → Settings → Call recording → record all calls.
3. **Sideload rather than Play Store.** `READ_CALL_LOG` needs a Play Console
   declaration and review. Installing the APK directly on warehouse-owned
   phones skips that process entirely, which is the right distribution model
   for an internal tool anyway.

## Handset support

Built-in call recording exists on most phones sold in Egypt: Xiaomi / Redmi /
POCO, Realme, Oppo, Vivo, Infinix, Tecno, and Samsung in this region. Notably
**absent on Google Pixel** and on some international Samsung firmware.

On a handset with no recorder, the call log still populates and the app works
— those rows simply never show a play button. Nothing breaks; there is just no
audio, because none was made.

## How files are found

`src/api/callProviders/device.js` reads audio assets through MediaStore
(`expo-media-library`) rather than scanning the filesystem. That deliberately
avoids `MANAGE_EXTERNAL_STORAGE`, which would drag the Play declaration back
in. Assets are kept only when their path sits under a known call-recording
directory — `RECORDING_DIRECTORIES` lists the OEM paths; add to it when a new
handset appears, no logic changes needed.

Matching a file to a call uses two signals, because OEM filename conventions
vary: a filename containing the customer's number is decisive, otherwise the
file's modification time has to fall inside the call window with two minutes
of slack for the dialer finishing the write after hang-up.

Phone numbers are compared on their **last nine digits**, so `01110727746`,
`+201110727746` and `201110727746` all match across the call log, Shopify and
Bosta without normalizing every source.

## The limit that remains

Nothing here defeats the platform restriction. If a rep's handset has no
built-in recorder, this app cannot record that call — not by trying harder,
and not at any price short of moving the call onto VoIP (option A). Check the
dialer settings on the actual warehouse phones before assuming coverage.


---

# Transcription -> Shopify

Once a recording is harvested, the phone uploads it to the backend, which
transcribes it with Gemini and attaches the result to the order.

```
handset dialer records
   ↓
app finds the file (MediaStore) and matches it to a call
   ↓  POST /api/calls/:callId/transcribe   (raw audio body)
backend → Gemini  → transcript + summary + outcome
   ↓
Shopify: order note (one line) + oka.call_transcripts metafield (full)
   ↓
history row's note becomes the call summary
```

Transcription runs server-side, not on the phone, for two reasons: the Gemini
key would otherwise be inlined into the app bundle and extractable from the
APK, and the Shopify write needs the admin token anyway.

## Where it lands on the order — and the thing that surprised me

**Shopify's Admin API cannot write an order timeline comment.** I checked the
live schema rather than assuming: of 454 mutations, the only `comment*` ones
(`commentApprove`, `commentDelete`, `commentSpam`, `commentNotSpam`) operate on
**blog article comments**, and nothing else creates a timeline entry. Timeline
comments are an admin-UI feature with no public write API.

So the transcript goes to the two places that are writable and visible:

| Destination | Content | Where it shows |
|---|---|---|
| Order **note** | one dated line: time, duration, summary, and any required action | the order page in Shopify admin |
| Order **metafield** `oka.call_transcripts` (JSON array) | full transcript, both summaries, outcome, model, size | order metafields; appended to, so multiple calls accumulate |

The note is the closest writable equivalent to a timeline comment, and it is
appended to rather than overwritten — `note` is a full-overwrite field, so the
existing value is read first.

## Cost control

Gemini bills per second of audio. Two guards:

- Every transcription is written to the `transcripts` ledger keyed by call id
  and **never repeated**. Re-uploading the same call returns the stored record
  without calling Gemini.
- The record is written to the ledger **before** the Shopify write. A
  transcription that succeeded has already been paid for, and must not be
  repeated just because attaching it failed.

The app transcribes at most 3 recorded calls per order screen, sequentially, so
a warehouse phone is never uploading several multi-megabyte files at once.

## What the model is asked for

Egyptian Arabic in, Egyptian Arabic out — the transcript keeps the words that
were actually said rather than being flattened to MSA or translated. It returns
JSON with a full transcript, a one-line summary in both languages, an
`outcome` (confirmed / cancelled / address_changed / order_changed / no_answer
/ callback_requested / other), and an `action_required` line when the warehouse
must do something.

The one-line summary is what replaces the generic “Answered” label in the
app's history rows — which is exactly what the original mockup showed there
(“Answered – order confirmed”). The design anticipated this; it just had no
data behind it.

## Audio size

Files under 12MB go inline; larger ones are pushed through Gemini's Files API
first, because a single request caps out around 20MB and base64 inflates the
payload by roughly a third. The upload route accepts up to 40MB.
