export const SPEECH_EXPORT: string
export const SPEECH_ARCHIVE_SHA256: string
export const SPEECH_FILES: Record<string, string>
export const SPEECH_SAMPLES: Record<string, string>
export function verifySpeechAsset(bytes: Uint8Array, hash: string): void
export function fetchSpeechAssets(): Promise<void>
export function bundleSpeechAssets(destination?: string): Promise<void>
