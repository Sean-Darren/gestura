import { describe, expect, it } from 'vitest'
import { packageName } from './index'

describe('@gestura/excel-addin', () => {
  it('is scaffolded as a workspace package', () => {
    expect(packageName).toBe('@gestura/excel-addin')
  })
})
