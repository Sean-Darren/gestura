import { fetchModel, bundleVisionAssets } from './model-assets.mjs'
await fetchModel()
await bundleVisionAssets()
console.log('Verified face_landmarker.task and bundled matching local WASM files.')
