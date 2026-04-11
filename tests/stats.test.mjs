import { beforeAll, describe, expect, it } from 'vitest'

let computeStats

beforeAll(async () => {
  await import('../public/stats.js')
  computeStats = globalThis.OfficeDaysStats.computeStats
})

describe('computeStats', () => {
  it('counts weekdays, skip statuses, and office percentage correctly', () => {
    const stats = computeStats([
      { date: '2026-04-06', status: 'office' },
      { date: '2026-04-07', status: 'wfh' },
      { date: '2026-04-08', status: 'holiday' },
      { date: '2026-04-11', status: 'office' }
    ])

    expect(stats).toEqual({
      workingDays: 2,
      officeRequired: 1,
      officeCount: 1,
      balance: 50,
      allWeekdaysMarked: true,
      hasWeekdays: true
    })
  })

  it('marks incomplete weekday coverage when a weekday has no status', () => {
    const stats = computeStats([
      { date: '2026-04-06', status: 'office' },
      { date: '2026-04-07', status: null }
    ])

    expect(stats.allWeekdaysMarked).toBe(false)
    expect(stats.workingDays).toBe(2)
    expect(stats.officeRequired).toBe(1)
  })
})
