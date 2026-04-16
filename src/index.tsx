import { Hono } from 'hono'
import type { Context } from 'hono'
import { html } from 'hono/html'

type Bindings = {
  DB: D1Database
}

type AppContext = {
  Bindings: Bindings
}

type Status =
  | 'office'
  | 'wfh'
  | 'holiday'
  | 'exception'
  | 'absent'
  | 'public-holiday'

type PeriodData = {
  startDateStr: string
  endDateStr: string
  prevDateStr: string | null
  nextDateStr: string
  periodName: string
  startDate: Date
  daysInPeriod: number
}

type StatusRow = {
  date: string
  status: string
}

type StatusMap = Record<string, string>
type ExportCycle = {
  startDateStr: string
  endDateStr: string
  periodName: string
  dates: Array<{
    date: string
    day: string
    status: string | null
  }>
}

const VALID_STATUSES = new Set<Status>([
  'office',
  'wfh',
  'holiday',
  'exception',
  'absent',
  'public-holiday'
])

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/

export const app = createApp()

const BASE_DATE = new Date('2026-03-30T00:00:00Z')
const MS_PER_DAY = 1000 * 60 * 60 * 24
const PERIOD_DAYS = 28

export function getEmail (c: Context<AppContext>) {
  return c.req.header('cf-access-authenticated-user-email') || 'dev_user@example.com'
}

export function isValidDateString (value: string) {
  return ISO_DATE_RE.test(value) && !Number.isNaN(Date.parse(`${value}T00:00:00Z`))
}

export function isValidStatus (value: unknown): value is Status {
  return typeof value === 'string' && VALID_STATUSES.has(value as Status)
}

export function parseUpdates (value: unknown): Record<string, Status | null> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null
  }

  const parsed: Record<string, Status | null> = {}
  for (const [date, status] of Object.entries(value)) {
    if (!isValidDateString(date)) {
      return null
    }
    if (status !== null && !isValidStatus(status)) {
      return null
    }
    parsed[date] = status
  }

  return parsed
}

export function rowsToStatusMap (results: unknown[] | undefined): StatusMap {
  const statusMap: StatusMap = {}
  if (!results) {
    return statusMap
  }

  for (const row of results as StatusRow[]) {
    statusMap[row.date] = row.status
  }

  return statusMap
}

export async function loadStatusesForPeriod (c: Context<AppContext>, periodData: PeriodData) {
  const email = getEmail(c)
  const { results } = await c.env.DB
    .prepare('SELECT date, status FROM user_status WHERE email = ? AND date >= ? AND date <= ?')
    .bind(email, periodData.startDateStr, periodData.endDateStr)
    .all()

  return rowsToStatusMap(results)
}

export async function loadStatusesForDateRange (c: Context<AppContext>, startDateStr: string, endDateStr: string) {
  const email = getEmail(c)
  const { results } = await c.env.DB
    .prepare('SELECT date, status FROM user_status WHERE email = ? AND date >= ? AND date <= ?')
    .bind(email, startDateStr, endDateStr)
    .all()

  return rowsToStatusMap(results)
}

export function getPeriodData (inputDateStr?: string | null): PeriodData {
  let inputDate = inputDateStr ? new Date(inputDateStr + 'T00:00:00Z') : new Date()

  inputDate = new Date(inputDate.toISOString().split('T')[0] + 'T00:00:00Z')

  if (inputDate < BASE_DATE) {
    inputDate = new Date(BASE_DATE)
  }

  const diffDays = Math.round((inputDate.valueOf() - BASE_DATE.valueOf()) / MS_PER_DAY)
  const periodCount = Math.floor(diffDays / PERIOD_DAYS)
  const startOffset = periodCount * PERIOD_DAYS

  const startDate = new Date(BASE_DATE.getTime() + startOffset * MS_PER_DAY)
  const endDate = new Date(startDate.getTime() + (PERIOD_DAYS - 1) * MS_PER_DAY)

  const prevDate = new Date(startDate.getTime() - PERIOD_DAYS * MS_PER_DAY)
  const nextDate = new Date(startDate.getTime() + PERIOD_DAYS * MS_PER_DAY)

  const startDateStr = startDate.toISOString().split('T')[0]
  const endDateStr = endDate.toISOString().split('T')[0]

  const prevDateStr = prevDate >= BASE_DATE ? prevDate.toISOString().split('T')[0] : null
  const nextDateStr = nextDate.toISOString().split('T')[0]

  const formatterNoYear = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' })
  const formatterShortYear = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: '2-digit', timeZone: 'UTC' })

  let periodName: string
  if (startDate.getUTCFullYear() === endDate.getUTCFullYear()) {
    periodName = `${formatterNoYear.format(startDate)} - ${formatterNoYear.format(endDate)}`
  } else {
    periodName = `${formatterShortYear.format(startDate)} - ${formatterShortYear.format(endDate)}`
  }

  return {
    startDateStr,
    endDateStr,
    prevDateStr,
    nextDateStr,
    periodName,
    startDate,
    daysInPeriod: PERIOD_DAYS
  }
}

export function buildExportCycles (startDateStr: string, statuses: StatusMap): ExportCycle[] {
  const dayFormatter = new Intl.DateTimeFormat('en-GB', { weekday: 'short', timeZone: 'UTC' })

  return Array.from({ length: 3 }, (_, offset) => {
    const periodData = getPeriodData(offset === 0 ? startDateStr : addDays(startDateStr, offset * PERIOD_DAYS))

    return {
      startDateStr: periodData.startDateStr,
      endDateStr: periodData.endDateStr,
      periodName: periodData.periodName,
      dates: Array.from({ length: periodData.daysInPeriod }, (_, dayOffset) => {
        const currentDate = addDays(periodData.startDateStr, dayOffset)
        return {
          date: currentDate,
          day: dayFormatter.format(new Date(`${currentDate}T00:00:00Z`)),
          status: statuses[currentDate] ?? null
        }
      })
    }
  })
}

function addDays (dateStr: string, days: number) {
  const date = new Date(`${dateStr}T00:00:00Z`)
  return new Date(date.getTime() + days * MS_PER_DAY).toISOString().split('T')[0]
}

function buildExportHtml (startDateStr: string, cycles: ExportCycle[]) {
  const dateLabelFormatter = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' })
  const weeksByCycle = cycles.map((cycle) => {
    return Array.from({ length: cycle.dates.length / 7 }, (_, weekIndex) =>
      cycle.dates.slice(weekIndex * 7, weekIndex * 7 + 7)
    )
  })

  return html`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Office Days Export</title>
  <style>
    body {
      font-family: Arial, sans-serif;
      margin: 24px;
      color: #111827;
    }
    h1, h2, p {
      margin: 0 0 12px;
    }
    table {
      border-collapse: collapse;
      width: 100%;
      margin-top: 12px;
      margin-bottom: 28px;
    }
    th, td {
      border: 1px solid #d1d5db;
      padding: 8px 10px;
      text-align: left;
      vertical-align: top;
      width: 14.28%;
      min-height: 56px;
    }
    th {
      background: #f3f4f6;
    }
    .date-label {
      font-weight: 700;
      color: #111827;
    }
    .status-label {
      color: #1f2937;
      text-transform: capitalize;
    }
    .empty-status {
      color: #9ca3af;
    }
    .status-office {
      background: #d1fae5;
    }
    .status-office .status-label {
      color: #065f46;
    }
    .status-wfh {
      background: #dbeafe;
    }
    .status-wfh .status-label {
      color: #1d4ed8;
    }
    .status-holiday {
      background: #fef3c7;
    }
    .status-holiday .status-label {
      color: #92400e;
    }
    .status-exception {
      background: #ffedd5;
    }
    .status-exception .status-label {
      color: #c2410c;
    }
    .status-absent {
      background: #fee2e2;
    }
    .status-absent .status-label {
      color: #b91c1c;
    }
    .status-public-holiday {
      background: #f3e8ff;
    }
    .status-public-holiday .status-label {
      color: #7e22ce;
    }
  </style>
</head>
<body>
  <h1>Office Days Export</h1>
  <p>Starting cycle: ${cycles[0]?.periodName ?? startDateStr}</p>
  <p>Included range: ${cycles[0]?.startDateStr} to ${cycles[2]?.endDateStr}</p>
  ${cycles.map((cycle, cycleIndex) => html`
    <section>
      <h2>${cycle.periodName}</h2>
      <table>
        <thead>
          <tr>
            <th>Mon</th>
            <th>Tue</th>
            <th>Wed</th>
            <th>Thu</th>
            <th>Fri</th>
            <th>Sat</th>
            <th>Sun</th>
          </tr>
        </thead>
        <tbody>
          ${weeksByCycle[cycleIndex]?.map((week) => html`
            <tr>
              ${week.map((entry, dayIndex) => {
                const currentDate = new Date(`${entry.date}T00:00:00Z`)
                const previousEntry = cycle.dates[(Math.floor((week[0] ? cycle.dates.indexOf(week[0]) : 0)) + dayIndex) - 1]
                const previousDate = previousEntry ? new Date(`${previousEntry.date}T00:00:00Z`) : null
                const showMonth = !previousDate || previousDate.getUTCMonth() !== currentDate.getUTCMonth()
                const dateLabel = showMonth
                  ? dateLabelFormatter.format(currentDate)
                  : String(currentDate.getUTCDate())

                return html`
                <td class="${entry.status ? `status-${entry.status}` : ''}">
                  <span class="date-label">${dateLabel}</span>
                  <span class="${entry.status ? 'status-label' : 'empty-status'}">${entry.status ? ` - ${entry.status}` : ''}</span>
                </td>
              `})}
            </tr>
          `)}
        </tbody>
      </table>
    </section>
  `)}
</body>
</html>`
}

// Reusable Calendar Component mapped from EJS
export const CalendarFragment = (pd: PeriodData, statuses: StatusMap) => html`
<div class="calendar-period" data-period-start="${pd.startDateStr}">
  <div class="calendar-header">
      ${pd.prevDateStr ? html`
      <button class="nav-btn" hx-get="/calendar/${pd.prevDateStr}" hx-target="#calendar-container">
          &larr; Previous
      </button>
      ` : html`
      <button class="nav-btn" disabled style="opacity: 0.5; cursor: not-allowed;">
          &larr; Previous
      </button>
      `}
      <h2>${pd.periodName}</h2>
      <button class="nav-btn" hx-get="/calendar/${pd.nextDateStr}" hx-target="#calendar-container">
          Next &rarr;
      </button>
  </div>

  <div class="calendar-grid">
      <div class="weekday-label">Mon</div>
      <div class="weekday-label">Tue</div>
      <div class="weekday-label">Wed</div>
      <div class="weekday-label">Thu</div>
      <div class="weekday-label">Fri</div>
      <div class="weekday-label">Sat</div>
      <div class="weekday-label">Sun</div>

      ${Array.from({ length: pd.daysInPeriod }).map((_, d) => {
          const currentDate = new Date(pd.startDate.getTime() + d * 24 * 60 * 60 * 1000);
          const dateStr = currentDate.toISOString().split('T')[0];
          const dayOfWeek = currentDate.getUTCDay();
          const isWeekend = dayOfWeek === 6 || dayOfWeek === 0;
          const dayNumber = currentDate.getUTCDate();
          const serverStatus = statuses[dateStr];

          return html`
          <div class="day ${isWeekend ? 'weekend' : ''} ${serverStatus ? `status-${serverStatus}` : ''}" data-date="${dateStr}"
              onclick="toggleDateSelection('${dateStr}')">
              <span class="day-number">${dayNumber}</span>
              <span class="day-status" id="status-${dateStr}">
                 ${serverStatus ? serverStatus.replace('-', ' ') : ''}
              </span>
          </div>`
      })}
  </div>
</div>
`

export function createApp () {
  const app = new Hono<{ Bindings: Bindings }>()

  app.get('/api/status', async (c) => {
    const email = getEmail(c)
    const { results } = await c.env.DB.prepare('SELECT date, status FROM user_status WHERE email = ?').bind(email).all()
    return c.json(rowsToStatusMap(results))
  })

  app.post('/api/status', async (c) => {
    const email = getEmail(c)
    const data = await c.req.json()
    // data expected: { updates: { "2026-04-10": "wfh", "2026-04-11": null } }

    const updates = parseUpdates(data?.updates)
    if (!updates) {
      return c.json({ error: 'Invalid updates payload' }, 400)
    }

    for (const [date, status] of Object.entries(updates)) {
      if (status === null) {
        await c.env.DB.prepare('DELETE FROM user_status WHERE email = ? AND date = ?').bind(email, date).run()
      } else {
        await c.env.DB.prepare('INSERT INTO user_status (email, date, status) VALUES (?, ?, ?) ON CONFLICT (email, date) DO UPDATE SET status = excluded.status').bind(email, date, status).run()
      }
    }

    return c.json({ success: true })
  })

  app.get('/calendar/:date', async (c) => {
    const periodData = getPeriodData(c.req.param('date'))
    const statuses = await loadStatusesForPeriod(c, periodData)

    return c.html(CalendarFragment(periodData, statuses))
  })

  app.get('/export/json/:date', async (c) => {
    const currentPeriod = getPeriodData(c.req.param('date'))
    const finalPeriod = getPeriodData(addDays(currentPeriod.startDateStr, PERIOD_DAYS * 2))
    const statuses = await loadStatusesForDateRange(c, currentPeriod.startDateStr, finalPeriod.endDateStr)
    const cycles = buildExportCycles(currentPeriod.startDateStr, statuses)

    c.header('Content-Type', 'application/json; charset=utf-8')
    c.header('Content-Disposition', `attachment; filename="office-days-${currentPeriod.startDateStr}.json"`)
    return c.json({
      currentCycleStart: currentPeriod.startDateStr,
      generatedAt: new Date().toISOString(),
      cycles
    })
  })

  app.get('/export/html/:date', async (c) => {
    const currentPeriod = getPeriodData(c.req.param('date'))
    const finalPeriod = getPeriodData(addDays(currentPeriod.startDateStr, PERIOD_DAYS * 2))
    const statuses = await loadStatusesForDateRange(c, currentPeriod.startDateStr, finalPeriod.endDateStr)
    const cycles = buildExportCycles(currentPeriod.startDateStr, statuses)

    return c.html(buildExportHtml(currentPeriod.startDateStr, cycles))
  })

  app.get('/', async (c) => {
    const periodData = getPeriodData(null)
    const email = getEmail(c)
    const statuses = await loadStatusesForPeriod(c, periodData)

    const content = html`
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Office Days (Cloudflare Edge)</title>
    <link rel="stylesheet" href="/style.css">
    <script src="/stats.js"></script>
    <script src="https://unpkg.com/htmx.org@1.9.10"></script>
    <script>
      window.INITIAL_DATA = ${JSON.stringify(statuses)};
    </script>
</head>
<body>
    <main class="glass-container">
        <header>
            <h1>Office Days</h1>
            <div class="stats-grid" id="stats-summary">
                <div class="stat-card">
                    <span class="label">Total Working Days</span>
                    <span class="value" id="stat-working">0</span>
                </div>
                <div class="stat-card">
                    <span class="label">Office Required</span>
                    <span class="value" id="stat-required">0</span>
                </div>
                <div class="stat-card">
                    <span class="label">In Office</span>
                    <span class="value" id="stat-office">0</span>
                </div>
                <div class="stat-card">
                    <span class="label">In Office %</span>
                    <span class="value" id="stat-balance">0%</span>
                </div>
            </div>
        </header>

        <section id="calendar-container">
            ${CalendarFragment(periodData, statuses)}
        </section>

        <!-- Selection Action Bar -->
        <div id="selection-actions" class="selection-action-bar">
            <div class="action-bar-content">
                <div class="action-bar-header">
                    <span id="selection-count">0 days selected</span>
                    <button class="clear-selection-btn" onclick="clearSelection()">Close</button>
                </div>
                <div class="action-buttons">
                    <button class="action-btn office" onclick="applyStatusToSelected('office')">
                        <span class="btn-emoji">🏢</span>
                        <span class="btn-label">Office</span>
                    </button>
                    <button class="action-btn wfh" onclick="applyStatusToSelected('wfh')">
                        <span class="btn-emoji">🏠</span>
                        <span class="btn-label">WFH</span>
                    </button>
                    <button class="action-btn holiday" onclick="applyStatusToSelected('holiday')">
                        <span class="btn-emoji">🌴</span>
                        <span class="btn-label">Holiday</span>
                    </button>
                    <button class="action-btn exception" onclick="applyStatusToSelected('exception')">
                        <span class="btn-emoji">🚂</span>
                        <span class="btn-label">Exception</span>
                    </button>
                    <button class="action-btn absent" onclick="applyStatusToSelected('absent')">
                        <span class="btn-emoji">🤒</span>
                        <span class="btn-label">Absent</span>
                    </button>
                    <button class="action-btn public-holiday" onclick="applyStatusToSelected('public-holiday')">
                        <span class="btn-emoji">🗓️</span>
                        <span class="btn-label">Public Hol</span>
                    </button>
                    <button class="action-btn clear" onclick="applyStatusToSelected(null)">
                        <span class="btn-emoji">🗑️</span>
                        <span class="btn-label">Clear</span>
                    </button>
                </div>
            </div>
        </div>

        <div id="shortcuts-modal" class="modal hidden" style="font-size: 1.5rem;">
            <div class="modal-content" style="background: #222; backdrop-filter: none;">
                <h3>Keyboard Shortcuts</h3>
                <p style="font-size: 1rem;"><br>Tip: Hover over a date and press the shortcut key to set the status.</p>
                <div class="shortcuts-list">
                    <div class="shortcut-item"><span class="shortcut-desc">In Office</span><kbd class="shortcut-key">O</kbd></div>
                    <div class="shortcut-item"><span class="shortcut-desc">WFH</span><kbd class="shortcut-key">W</kbd></div>
                    <div class="shortcut-item"><span class="shortcut-desc">Holiday</span><kbd class="shortcut-key">H</kbd></div>
                    <div class="shortcut-item"><span class="shortcut-desc">Exception</span><kbd class="shortcut-key">E</kbd></div>
                    <div class="shortcut-item"><span class="shortcut-desc">Absent</span><kbd class="shortcut-key">A</kbd></div>
                    <div class="shortcut-item"><span class="shortcut-desc">Public Holiday</span><kbd class="shortcut-key">P</kbd></div>
                    <div class="shortcut-item"><span class="shortcut-desc">Clear Status</span><kbd class="shortcut-key">C</kbd></div>
                </div>
                <button class="close-btn" onclick="closeShortcuts()">Close</button>
            </div>
        </div>

        <div class="data-actions">
            <button class="secondary-btn" onclick="openShortcuts()">Shortcuts</button>
            <a class="secondary-btn export-link" id="export-html-link" href="/export/html/${periodData.startDateStr}" target="_blank" rel="noopener noreferrer">Export HTML</a>
            <a class="secondary-btn export-link" id="export-json-link" href="/export/json/${periodData.startDateStr}">Export JSON</a>
        </div>
    </main>
    <footer>
        <p>${email}</p>
        <p>Copyright &copy; ${new Date().getFullYear()} Office Days</p>
    </footer>

    <script src="/ui.js"></script>
</body>
</html>`

    return c.html(content)
  })

  return app
}

export default app
