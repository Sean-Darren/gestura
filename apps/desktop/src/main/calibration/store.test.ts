import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { CalibrationStore } from './store'
import {
  scriptedWizard,
  completeBlinkPhase,
  completeTargets
} from '../../../../../packages/pointer/src/calibration-fixture'
export function validProfile(): ReturnType<ReturnType<typeof scriptedWizard>['wizard']['profile']> {
  const s = scriptedWizard()
  completeBlinkPhase(s)
  completeTargets(s)
  return s.wizard.profile(s.time())
}
describe('local calibration storage', () => {
  it('round-trips validated profile, logs only duration metadata and clears the local log', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'gestura-cal-'))
    try {
      const store = new CalibrationStore(dir),
        p = validProfile()
      expect(await store.load()).toBeUndefined()
      await store.save(p)
      expect(await store.load()).toEqual(p)
      expect(await readFile(join(dir, 'calibration-profile.json'), 'utf8')).not.toContain(
        'landmarks'
      )
      await store.logDuration(p)
      expect(
        JSON.parse((await readFile(join(dir, 'calibration-durations.jsonl'), 'utf8')).trim())
      ).toEqual({ createdAt: p.createdAt, durationMs: p.durationMs })
      await store.clearLog()
      expect(await readFile(join(dir, 'calibration-durations.jsonl'), 'utf8')).toBe('')
      await writeFile(join(dir, 'calibration-profile.json'), 'broken json')
      expect(await store.load()).toBeUndefined()
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  })
  it('does not replace a valid profile with invalid data and reports write failures', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'gestura-cal-'))
    try {
      const store = new CalibrationStore(dir),
        p = validProfile()
      await store.save(p)
      await expect(store.save({ ...p, version: 2 } as unknown as typeof p)).rejects.toThrow()
      expect(await store.load()).toEqual(p)
      const file = join(dir, 'not-a-directory')
      await writeFile(file, 'fixture')
      await expect(new CalibrationStore(file).save(p)).rejects.toThrow()
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  })
})
