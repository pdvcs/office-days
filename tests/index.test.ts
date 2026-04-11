import { describe, expect, it } from 'vitest'

import { buildExportCycles, createApp, getPeriodData, parseUpdates, rowsToStatusMap } from '../src/index'

type DbCall = {
  sql: string
  args: unknown[]
}

function createDbMock (options?: {
  allResults?: unknown[]
}) {
  const calls: DbCall[] = []
  const runs: DbCall[] = []
  const allResults = options?.allResults ?? []

  return {
    calls,
    runs,
    prepare (sql: string) {
      return {
        bind (...args: unknown[]) {
          calls.push({ sql, args })

          return {
            all: async () => ({ results: allResults }),
            run: async () => {
              runs.push({ sql, args })
              return { success: true }
            }
          }
        }
      }
    }
  }
}

describe('period helpers', () => {
  it('clamps dates before the base date', () => {
    const period = getPeriodData('2026-03-01')

    expect(period.startDateStr).toBe('2026-03-30')
    expect(period.prevDateStr).toBeNull()
    expect(period.nextDateStr).toBe('2026-04-27')
  })

  it('formats cross-year periods with years included', () => {
    const period = getPeriodData('2026-12-30')

    expect(period.startDateStr).toBe('2026-12-07')
    expect(period.endDateStr).toBe('2027-01-03')
    expect(period.periodName).toContain('26')
    expect(period.periodName).toContain('27')
  })

  it('builds three export cycles from the selected period start', () => {
    const cycles = buildExportCycles('2026-03-30', {
      '2026-03-30': 'office',
      '2026-04-29': 'wfh',
      '2026-06-21': 'holiday'
    })

    expect(cycles).toHaveLength(3)
    expect(cycles[0]?.startDateStr).toBe('2026-03-30')
    expect(cycles[1]?.startDateStr).toBe('2026-04-27')
    expect(cycles[2]?.startDateStr).toBe('2026-05-25')
    expect(cycles[0]?.dates[0]).toEqual({
      date: '2026-03-30',
      day: 'Mon',
      status: 'office'
    })
    expect(cycles[1]?.dates[2]?.status).toBe('wfh')
    expect(cycles[2]?.dates[27]?.status).toBe('holiday')
  })
})

describe('payload helpers', () => {
  it('accepts valid updates and preserves null deletions', () => {
    expect(parseUpdates({
      '2026-04-10': 'office',
      '2026-04-11': null
    })).toEqual({
      '2026-04-10': 'office',
      '2026-04-11': null
    })
  })

  it('rejects malformed dates and unknown statuses', () => {
    expect(parseUpdates({ nope: 'office' })).toBeNull()
    expect(parseUpdates({ '2026-04-10': 'remote' })).toBeNull()
    expect(parseUpdates([])).toBeNull()
  })

  it('maps D1 rows into the status object used by the UI', () => {
    expect(rowsToStatusMap([
      { date: '2026-04-10', status: 'office' },
      { date: '2026-04-11', status: 'wfh' }
    ])).toEqual({
      '2026-04-10': 'office',
      '2026-04-11': 'wfh'
    })
  })
})

describe('app routes', () => {
  it('uses the fallback email when access headers are missing', async () => {
    const db = createDbMock({
      allResults: [{ date: '2026-04-10', status: 'office' }]
    })

    const res = await createApp().request('/api/status', {}, { DB: db } as never)

    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ '2026-04-10': 'office' })
    expect(db.calls[0]?.args).toEqual(['dev_user@example.com'])
  })

  it('returns 400 and does not write for invalid status payloads', async () => {
    const db = createDbMock()

    const res = await createApp().request('/api/status', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        updates: {
          '2026-04-10': 'not-a-real-status'
        }
      })
    }, { DB: db } as never)

    expect(res.status).toBe(400)
    expect(await res.json()).toEqual({ error: 'Invalid updates payload' })
    expect(db.runs).toEqual([])
  })

  it('inserts and deletes statuses for a valid payload using the authenticated email', async () => {
    const db = createDbMock()

    const res = await createApp().request('/api/status', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'cf-access-authenticated-user-email': 'alice@example.com'
      },
      body: JSON.stringify({
        updates: {
          '2026-04-10': 'wfh',
          '2026-04-11': null
        }
      })
    }, { DB: db } as never)

    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ success: true })
    expect(db.runs).toEqual([
      {
        sql: 'INSERT INTO user_status (email, date, status) VALUES (?, ?, ?) ON CONFLICT (email, date) DO UPDATE SET status = excluded.status',
        args: ['alice@example.com', '2026-04-10', 'wfh']
      },
      {
        sql: 'DELETE FROM user_status WHERE email = ? AND date = ?',
        args: ['alice@example.com', '2026-04-11']
      }
    ])
  })

  it('renders the calendar for the requested period with status classes', async () => {
    const db = createDbMock({
      allResults: [{ date: '2026-04-10', status: 'office' }]
    })

    const res = await createApp().request('/calendar/2026-04-10', {
      headers: {
        'cf-access-authenticated-user-email': 'alice@example.com'
      }
    }, { DB: db } as never)

    const text = await res.text()

    expect(res.status).toBe(200)
    expect(text).toContain('30 Mar - 26 Apr')
    expect(text).toContain('status-office')
    expect(db.calls[0]?.args).toEqual(['alice@example.com', '2026-03-30', '2026-04-26'])
  })

  it('renders export links on the main page', async () => {
    const db = createDbMock()

    const res = await createApp().request('/', {}, { DB: db } as never)
    const text = await res.text()

    expect(res.status).toBe(200)
    expect(text).toContain('Export HTML')
    expect(text).toContain('Export JSON')
    expect(text).toContain('/export/html/')
    expect(text).toContain('/export/json/')
  })

  it('exports three cycles of JSON for the selected period', async () => {
    const db = createDbMock({
      allResults: [
        { date: '2026-03-30', status: 'office' },
        { date: '2026-04-27', status: 'wfh' },
        { date: '2026-06-21', status: 'holiday' }
      ]
    })

    const res = await createApp().request('/export/json/2026-04-10', {
      headers: {
        'cf-access-authenticated-user-email': 'alice@example.com'
      }
    }, { DB: db } as never)

    expect(res.status).toBe(200)
    expect(res.headers.get('content-disposition')).toContain('office-days-2026-03-30.json')

    const payload = await res.json() as {
      currentCycleStart: string
      cycles: Array<{ startDateStr: string, dates: Array<{ date: string, status: string | null }> }>
    }

    expect(payload.currentCycleStart).toBe('2026-03-30')
    expect(payload.cycles).toHaveLength(3)
    expect(payload.cycles[0]?.startDateStr).toBe('2026-03-30')
    expect(payload.cycles[2]?.dates[27]).toEqual({
      date: '2026-06-21',
      day: 'Sun',
      status: 'holiday'
    })
    expect(db.calls[0]?.args).toEqual(['alice@example.com', '2026-03-30', '2026-06-21'])
  })

  it('renders an HTML export page for three cycles', async () => {
    const db = createDbMock({
      allResults: [
        { date: '2026-03-30', status: 'office' },
        { date: '2026-04-27', status: 'wfh' }
      ]
    })

    const res = await createApp().request('/export/html/2026-04-10', {
      headers: {
        'cf-access-authenticated-user-email': 'alice@example.com'
      }
    }, { DB: db } as never)

    const text = await res.text()

    expect(res.status).toBe(200)
    expect(text).toContain('<table>')
    expect(text).toContain('Office Days Export')
    expect(text).toContain('<th>Mon</th>')
    expect(text).toContain('<th>Sun</th>')
    expect(text).toContain('30 Mar')
    expect(text).toContain('27 Apr')
    expect(text).toContain('office')
    expect(text).toContain('wfh')
    expect(db.calls[0]?.args).toEqual(['alice@example.com', '2026-03-30', '2026-06-21'])
  })
})
