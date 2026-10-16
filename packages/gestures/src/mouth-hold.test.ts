import { describe, expect, it } from 'vitest'
import { MouthHold } from './mouth-hold'
describe('fresh mouth confirmation/listening hold', () => {
  it('requires closed mouth, continuous stable hold, releases to rearm and a full confirmation second', () => {
    const hold = new MouthHold()
    for (let t = 0; t < 1200; t += 100) expect(hold.update(t, 0.8, true, 1000).fired).toBe(false)
    hold.update(1200, 0, true, 1000)
    for (let t = 1300; t < 2300; t += 100) expect(hold.update(t, 0.8, true, 1000).fired).toBe(false)
    expect(hold.update(2300, 0.8, true, 1000)).toEqual({ fired: true, progress: 1 })
    expect(hold.update(2400, 0.8, true, 1000).fired).toBe(false)
  })
  it('rejects speech, unknown signals, frame gaps and varying jaw, and requires a fresh closure after reset', () => {
    const hold = new MouthHold()
    hold.update(0, 0, true, 800)
    for (let t = 100; t < 2000; t += 100)
      expect(hold.update(t, t % 200 ? 0.65 : 0.9, true, 800).fired).toBe(false)
    expect(hold.update(2000, 0.8, false, 800).progress).toBe(0)
    for (let t = 2100; t < 3100; t += 100) expect(hold.update(t, 0.8, true, 800).fired).toBe(false)
    hold.update(3100, 0, true, 800)
    hold.update(3200, 0.8, true, 800)
    expect(hold.update(4000, 0.8, true, 800).fired).toBe(false)
    expect(hold.update(4100, undefined, true, 800).progress).toBe(0)
  })
})
