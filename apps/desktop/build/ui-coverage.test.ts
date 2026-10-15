import { expect, it } from 'vitest'
import { parsePoorCoverage } from './ui-coverage'
it('bundles only explicit poor rows by OS and exact identity', () => {
  expect(
    parsePoorCoverage('| OS | app | element types found | problems |\n| --- | --- | --- | --- |')
  ).toEqual([])
  expect(
    parsePoorCoverage(
      '| macOS | `com.example.app` | buttons | poor: custom drawing |\n| Windows | EXAMPLE.EXE | none | poor: unavailable |\n| macOS | com.example.good | buttons | empty label |'
    )
  ).toEqual([
    { os: 'darwin', appId: 'com.example.app', reason: 'custom drawing' },
    { os: 'win32', appId: 'example.exe', reason: 'unavailable' }
  ])
  expect(() => parsePoorCoverage('| Other | app | none | poor: bad |')).toThrow()
  expect(() => parsePoorCoverage('| Windows | display name | none | poor: bad |')).toThrow()
})
