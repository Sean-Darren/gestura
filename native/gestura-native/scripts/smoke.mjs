import assert from 'node:assert/strict'
import { loadNativeBinding } from '../index.mjs'

const input = loadNativeBinding()
for (const name of [
  'elementAt',
  'elementsNear',
  'foregroundApp',
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
assert.throws(() => input.elementAt(Number.NaN, 0))
assert.throws(() => input.elementsNear(0, 0, -1))
assert.throws(() => input.moveTo(Number.NaN, 0))
assert.throws(() => input.click('invalid'))
assert.throws(() => input.typeText('\0'))
assert.throws(() => input.keyCombo(['not-a-key']))
if (!input.hasInputPermission()) {
  for (const operation of [
    () => input.elementAt(0, 0),
    () => input.elementsNear(0, 0, 100),
    () => input.foregroundApp()
  ]) {
    const promise = operation()
    assert.ok(promise instanceof Promise, 'UI queries must return Promises')
    await assert.rejects(promise, /Accessibility permission is required/)
  }
}
console.log(`Native exports and rejection smoke check passed: ${process.platform}-${process.arch}`)
