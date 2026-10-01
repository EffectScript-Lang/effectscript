# Voice and music prompts

Paste-ready setups for the "Introducing EffectScript" film (160 s, 120 BPM grid).
Timings refer to the picture cut; see `../TREATMENT.md`. Generate these separately;
the editor conforms the music to the cue points and places each voice line on its
timestamp, ducking the music under the voice.

---

## 1. Suno v6: score

| Field                       | Value                                                                  |
| --------------------------- | ---------------------------------------------------------------------- |
| Surface / model             | Create → Advanced (Custom), **v6**                                     |
| Instrumental                | **On**; Lyrics empty                                                   |
| Duration                    | Custom, **2:40**                                                       |
| Variety                     | **0 / Off** (set it after selecting v6; switching models can reset it) |
| Max Mode                    | **On** (recommended for a long, arc-driven piece; check the cost)      |
| Weirdness / Style Influence | 30% / 75%, if exposed                                                  |
| Vocal Gender / Voice        | none                                                                   |
| Takes                       | 2 submissions (4 takes); compare the 0:54 stop and the 1:10 impact     |

**Styles** (paste as-is, 995 characters):

```text
Cinematic instrumental launch-film score. Felt piano and strings like Olafur Arnalds and Johann Johannsson, growing into a driving modern electronic section, Apple-keynote style. D major / B minor, 120 BPM. A simple piano motif, B C# D F#, is the heart. 0:00 near silence, one soft felt-piano note. 0:12 intimate felt-piano theme over Bm G D A, warm pad. 0:30 anxiety builds: ticking clock, pulsing sub, tightening string ostinato, dissonant clusters, a relentless riser that peaks and stops dead at 0:54, then 2 s of total silence. 0:56 one high piano note, slow swelling strings, reversed piano. 1:10 huge cinematic impact, the theme in full, glorious but restrained. 1:20 driving electronic groove: four-on-the-floor kick, crisp hats, side-chained pads, plucked arpeggio of the motif, deep sub bass, climax at 1:44. 2:06 sudden drop to solo piano and a soft clock tick, nocturnal and tender; warm major resolve at 2:17. 2:24 final swell, cadence at 2:34, last piano note rings out to silence.
```

**Exclude styles:**

```text
vocals, choir, spoken word, vocal chops, dubstep drop, trap hi-hats, guitar solo, lo-fi vinyl crackle, cheesy synth brass
```

**What to listen for:** a hook you can hum after one listen; a clean dead stop near
0:54 (if it rings on, the editor cuts it); a real impact near 1:10; a groove that
stays out of the voice's frequency range (no busy mids from 1:20 to 2:06); a
tender, sparse 2:06 drop. Suno won't hit the timestamps exactly; the editor conforms
the take to the picture, so pick on musical quality, not timing.

---

## 2. ElevenLabs Voice Design: the narrator

An original voice. Deep, warm, quick-witted developer-educator energy: the friend
who explains hard things simply and is quietly delighted by them. Not modelled on
any real person.

| Field                      | Value                                                       |
| -------------------------- | ----------------------------------------------------------- |
| Tool                       | Voices → Voice Design (latest design model shown in the UI) |
| Guidance / prompt strength | 5 (default); revise the description before raising it       |
| Loudness                   | 0.5 (default)                                               |
| Preview text               | Your own (below); auto-generate text **off**                |
| Candidates                 | Generate 3, save the best as "EffectScript Narrator"        |

**Voice description:**

```text
A man in his early thirties with a deep, warm baritone and real chest resonance. Native American English, neutral West Coast accent. Relaxed, intelligent and quietly playful: the voice of a brilliant engineer who loves teaching and lets a small smile into his words. Unhurried, conversational pacing with clean consonants and natural breaths. He can drop to an intimate near-whisper without losing warmth and rise to calm, confident authority without ever shouting or sounding like a movie-trailer cliché. No vocal fry, no announcer polish. Close-mic, dry, intimate studio recording with no background noise or music.
```

**Preview text** (auditions the whole range of the film):

```text
Every great idea starts as one line. You write it, and it just works. Then the real world arrives, and the line disappears under everything you had to add to keep it safe. So here's a small question. What if the language understood what you meant? Three in the morning, the database blinks, and your code already knows what to do. You sleep through it. That's the whole point.
```

Pick the candidate that sounds like a person talking to one listener, not
presenting to a room. Then audition the 0:56 and 2:18 lines below before rendering
the full script.

---

## 3. ElevenLabs Eleven v4: the voice script

How v4 reads direction (from ElevenLabs' v4 docs and audio-tag guide):

- Tags go in square brackets **before** the words they affect, and the emotion
  **carries forward** until the next tag. So tag a shift, not every line.
- Combine within one set of brackets with commas: `[whispers, thoughtful]`.
  One emotion per clause; contrasting tags on the same words blur.
- Natural-language direction works: `[as if sharing a secret]`.
- Punctuation shapes the read: ellipses slow it, a dash cuts it, `[pause]` and
  `[long pause]` hold.
- v4 performs best on whole passages, so generate **one passage per act**
  (blocks A–H). The editor slices the lines and places them on the timestamps.
- Leave out sound-effect tags; the film has its own sound design.
- Settings: start at the most natural/balanced stability preset for blocks A–C
  and E–H. If block D (the whisper) is too flat, try the most expressive preset.
  These are untested starting points; audition them.

Timestamps are where each line should **start** in the film (m:ss.s). They are
cue notes for the editor; don't paste them.

### A: Cold open (0:01–0:12)

| Start  | Line                     |
| ------ | ------------------------ |
| 0:01.8 | Every great idea…        |
| 0:03.6 | starts as one line.      |
| 0:08.6 | One line. One intention. |

```text
[softly, thoughtful] Every great idea... [pause] starts as one line. [long pause] [quietly, warm] One line. [pause] One intention.
```

### B: The promise (0:12–0:30)

| Start  | Line                         |
| ------ | ---------------------------- |
| 0:12.8 | You found Effect.            |
| 0:16.0 | Typed errors.                |
| 0:18.0 | Retries.                     |
| 0:20.0 | Resources that never leak.   |
| 0:22.0 | Concurrency that just works. |
| 0:24.4 | It felt like a superpower.   |
| 0:28.1 | …Then you wrote it down.     |

```text
[warm, a little in awe] You found Effect. [pause] [growing excitement] Typed errors. [pause] Retries. [pause] Resources that never leak. [pause] Concurrency... that just works. [long pause] [proud, with a quiet smile] It felt like a superpower. [long pause] [slower, hesitant] ...Then you wrote it down.
```

### C: The ceremony (0:34–0:49)

| Start  | Line                                                 |
| ------ | ---------------------------------------------------- |
| 0:34.6 | Generators. Pipes. Layers. Wrappers around wrappers. |
| 0:42.0 | You wanted reliability.                              |
| 0:46.0 | You got ceremony.                                    |

```text
[dry, increasingly tired, speeding up] Generators. Pipes. Layers. Tags. Wrappers... around wrappers. [long pause] [weary] You wanted reliability. [pause] [flat, heavy] You got ceremony.
```

### D: The question (0:56–1:02)

The film's turning point. It comes right after two seconds of total silence.

| Start  | Line                  |
| ------ | --------------------- |
| 0:56.6 | What if the language… |
| 0:58.6 | just understood?      |

```text
[barely above a whisper, wondering, as if the idea just arrived] What if the language... [pause] just understood?
```

### E: Introducing (1:12–1:20)

| Start  | Line                                             |
| ------ | ------------------------------------------------ |
| 1:12.6 | Introducing…                                     |
| 1:16.6 | EffectScript.                                    |
| 1:18.6 | TypeScript, with Effect built into the language. |

```text
[calm, confident] Introducing... [long pause] [warm, proud] EffectScript. [pause] [clear, simple] TypeScript... with Effect built into the language.
```

### F: The language (1:21–2:06)

Snappy and bright, riding the beat. Each line lands just after its morph completes.

| Start  | Line                                                        |
| ------ | ----------------------------------------------------------- |
| 1:23.6 | An effect is just a function. And await is yield star.      |
| 1:29.6 | Errors live in the signature. Throw means fail.             |
| 1:35.6 | Catch by type. Whatever you don't handle stays in the type. |
| 1:41.4 | Behaviour reads left to right.                              |
| 1:48.6 | Services and layers, without the incantation.               |
| 1:54.3 | Cleanup you can't forget.                                   |
| 1:59.3 | Schemas. Pattern matching. Built in.                        |
| 2:02.4 | And it all compiles to plain, idiomatic Effect.             |

```text
[bright, confident, conversational] An effect is just a function. And await... is yield star. [pause] Errors live in the signature. Throw means fail. [pause] Catch by type. Whatever you don't handle... stays in the type. [pause] Behaviour reads left to right. [pause] [lightly amused] Services and layers... without the incantation. [pause] [crisp] Cleanup you can't forget. [pause] Schemas. Pattern matching. Built in. [pause] [satisfied, confident] And it all compiles to plain, idiomatic Effect.
```

### G: 3:07 AM (2:06–2:24)

| Start  | Line                               |
| ------ | ---------------------------------- |
| 2:06.8 | Three-oh-seven A.M.                |
| 2:08.5 | The database blinks.               |
| 2:15.0 | Your code already knew what to do. |
| 2:18.3 | You slept through it.              |
| 2:20.9 | Because you wrote… what you meant. |

```text
[hushed, intimate, late at night] Three-oh-seven A.M. [pause] The database blinks. [long pause] [softly, reassuring] Your code already knew what to do. [long pause] [warm, tender, with a small smile] You slept through it. [pause] [slow, sincere] Because you wrote... what you meant.
```

### H: Finale (2:25–2:37)

| Start  | Line                  |
| ------ | --------------------- |
| 2:25.0 | All of Effect.        |
| 2:27.5 | None of the ceremony. |
| 2:34.6 | EffectScript.         |
| 2:36.4 | Built on Effect.      |

```text
[resolute, quietly powerful] All of Effect. [pause] [warm, certain] None of the ceremony. [long pause] [warm, inviting] EffectScript. [pause] [softly] Built on Effect.
```

### Pronunciation

- "EffectScript": one word, stress on EF: _EF-ect-script_.
- "yield star": say it as written; don't let the model read `yield*`.
- "Three-oh-seven A.M.": written out so it isn't read as "three hundred seven".
- If "idiomatic" or "incantation" stumble, regenerate block F alone.

### Hand-off

Export each block as WAV (48 kHz if offered) named `vo-A.wav` … `vo-H.wav`, and
the Suno take as `score-suno.wav`. Drop them in `build/audio-in/`; the editor
slices the lines, places them on the timestamps above, conforms the music to the
cut, and ducks the music about 6–8 dB under the voice.
