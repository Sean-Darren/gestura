import { readFile } from 'node:fs/promises'
import { join } from 'node:path'

export function visionAssetName(url: string): string | undefined {
  const parsed = new URL(url)
  if (parsed.protocol !== 'app:' || parsed.hostname !== 'vision' || parsed.search || parsed.hash)
    return undefined
  if (parsed.pathname === '/face_landmarker.task') return 'face_landmarker.task'
  if (/^\/wasm\/vision_wasm[a-z0-9_]*\.(wasm|js)$/.test(parsed.pathname))
    return parsed.pathname.slice(1)
  return undefined
}
export async function readVisionAsset(root: string, url: string): Promise<Response> {
  const name = visionAssetName(url)
  if (!name) return new Response('Unknown local asset', { status: 404 })
  try {
    const bytes = await readFile(join(root, name))
    return new Response(bytes, {
      headers: {
        'Content-Type': name.endsWith('.wasm')
          ? 'application/wasm'
          : name.endsWith('.js')
            ? 'text/javascript'
            : 'application/octet-stream',
        'Access-Control-Allow-Origin': '*'
      }
    })
  } catch {
    return new Response('Local vision asset missing: run pnpm models:fetch', { status: 404 })
  }
}
