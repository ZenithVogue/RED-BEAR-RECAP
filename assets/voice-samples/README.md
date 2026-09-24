# Voice persona preview samples

Static, pre-rendered preview clips for the Step 3 / Auto Recap voice cards.

`app.js` maps every persona code to one of these files (`VOICE_SAMPLES`) and plays it
with `new Audio(sampleUrl)`. Nothing here is fetched from a third-party TTS service at
runtime, which is what used to cause `Voice Preview failed: Failed to fetch` whenever
CORS or the network blocked the request.

| File | Persona | Character |
| --- | --- | --- |
| `bb.mp3` | BB | male · natural |
| `nl.mp3` | NL | female · clear |
| `pw.mp3` | PW | male · excited |
| `km.mp3` | KM | male · deep |
| `zk.mp3` | ZK | male · storyteller |
| `hs.mp3` | HS | female · soft |
| `sl.mp3` | SL | male · fast |
| `ys.mp3` | YS | female · natural |
| `ec.mp3` | EC | male · news anchor |
| `ts.mp3` | TS | female · energetic |

Spoken line (Burmese):

> မင်္ဂလာပါ၊ ဒါကတော့ နမူနာ စကားပြော အသံဖိုင် ဖြစ်ပါတယ်။ Red Bear Recap နဲ့ သင့်ဗီဒီယိုကို မြန်မာလို ဇာတ်ကြောင်းပြော ပေးပါမယ်။

Format: MP3, mono, 44.1 kHz, 48 kbps, loudness-normalised to about -16 LUFS, 6–9 s each
(~500 KB for the whole set).

## Regenerating

Each clip comes from one male and one female Burmese master recording, re-shaped per
persona with ffmpeg's `rubberband` filter so the pitch/tempo match the `rate` and `pitch`
values declared in the `VOICES` table in `app.js`:

```sh
ffmpeg -i base-male.wav \
  -af "rubberband=pitch=0.85:tempo=0.85:pitchq=quality,loudnorm=I=-16:TP=-1.5:LRA=11" \
  -ac 1 -ar 44100 -b:a 48k km.mp3
```

| Persona | Base | pitch | tempo |
| --- | --- | --- | --- |
| BB | male | 1.000 | 0.95 |
| NL | female | 1.033 | 1.00 |
| PW | male | 1.060 | 1.15 |
| KM | male | 0.850 | 0.85 |
| ZK | male | 0.940 | 0.90 |
| HS | female | 1.100 | 0.95 |
| SL | male | 1.000 | 1.30 |
| YS | female | 1.000 | 1.00 |
| EC | male | 0.970 | 1.05 |
| TS | female | 1.067 | 1.20 |

If you replace a clip, keep the file name — the mapping in `app.js` is by persona code.
