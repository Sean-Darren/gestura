import { describe, expect, it } from 'vitest'
import { packageName } from './index'

describe('@gestura/vscode', () => {
  it('is scaffolded as a workspace package', () => {
    expect(packageName).toBe('@gestura/vscode')
  })
})
