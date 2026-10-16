import { fetchModel, bundleVisionAssets } from './model-assets.mjs'
import { fetchSpeechAssets, bundleSpeechAssets } from './speech-assets.mjs'
await fetchModel()
await bundleVisionAssets()
await fetchSpeechAssets()
await bundleSpeechAssets()
console.log('Verified face_landmarker.task and bundled matching local WASM files.')
console.log('Verified and bundled SenseVoice int8 and Silero VAD; upstream WAV fixtures verified.')
