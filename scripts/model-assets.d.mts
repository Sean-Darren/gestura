export const repoRoot: string
export const MODEL_URL: string
export const MODEL_SHA256: string
export const VISION_VERSION: string
export function verifyVisionRuntime(version: string, source: string): void
export function verifyModel(bytes: Uint8Array): void
export function fetchModel(fetcher?: typeof fetch, directory?: string): Promise<string>
export function bundleVisionAssets(destination?: string): Promise<void>
