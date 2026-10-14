import assert from 'node:assert/strict'
import { loadNativeBinding } from '../index.mjs'

const input = loadNativeBinding()
for (const name of [
  'moveTo',
  'click',
  'doubleClick',
  'mouseDown',
  'mouseUp',
  'scroll',
  'typeText',
  'keyCombo',
  'getCursorPos',
  'getDisplays',
  'hasInputPermission',
  'requestInputPermission'
]) {
  assert.equal(typeof input[name], 'function', `${name} export`)
}
assert.equal(typeof input.hasInputPermission(), 'boolean')
assert.throws(() => input.moveTo(Number.NaN, 0))
assert.throws(() => input.click('invalid'))
assert.throws(() => input.typeText('\0'))
assert.throws(() => input.keyCombo(['not-a-key']))
console.log(`Native exports and rejection smoke check passed: ${process.platform}-${process.arch}`)
