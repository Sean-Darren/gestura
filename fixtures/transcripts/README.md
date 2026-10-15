# Intent benchmark fixtures

`p3.2-commands.csv` is a synthetic, hand-authored regression set: 20 cases each for English, colloquial Cantonese and mixed speech. It covers all 17 intents plus spelling/width/script variants, spoken references and non-command fallbacks. Many examples intentionally overlap the catalogue; results are regression coverage, not independent user-study accuracy or ASR accuracy. No user data was collected and no models were trained.

`p3.2-audio-smoke.csv` references the published sherpa Cantonese sample already fetched in P3.1. It is a non-command rejection test through real ASR and matching, not a measurement of voice-command accuracy. The team has not supplied consented command recordings; English and mixed audio-command coverage remain pending.

CSV required columns: `id,utterance,expected intent,slots,lang`. `expected_intent` is accepted as an alias for `expected intent`. Slots must be a CSV-quoted JSON object, for example `"{""range"":""B2""}"`. Language groups are `en`, `yue`, `mixed`; use the fixture's known language, not the model's currently empty language field.

Optional columns: `context` (`excel`/`other`, default other), `pending` (`true`/`false`, default false), and `audio` (WAV path relative to fixtures/audio). Confirm/cancel cases need pending=true. Audio is constrained to that fixture directory, including symlink checks; team recordings also need the existing consent manifest. WAVs must be mono 16 kHz PCM16/Float32. Rows without audio are skipped explicitly in audio mode. ASR/read/validation errors count as incorrect, not skipped. Text mode never loads the speech addon or models.

Text mode supplies a synthetic speech-start timestamp solely to classify explicit confirmation fixtures. It never instantiates ActionGate, inserts anything, executes an intent or grants a real confirmation. A future gaze-selection consumer must never synthesize voice evidence for a suggestion.
