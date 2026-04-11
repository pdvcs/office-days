// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from 'vitest'

function buildDom () {
  document.body.innerHTML = `
    <div id="selection-actions" class="selection-action-bar"></div>
    <div id="selection-count"></div>
    <a id="export-html-link" href="/export/html/old"></a>
    <a id="export-json-link" href="/export/json/old"></a>
    <div class="stat-card"><span id="stat-working"></span></div>
    <div class="stat-card"><span id="stat-required"></span></div>
    <div class="stat-card"><span id="stat-office"></span></div>
    <div class="stat-card"><span id="stat-balance"></span></div>
    <div id="shortcuts-modal" class="modal hidden"></div>
    <div class="calendar-period" data-period-start="2026-03-30">
      <div class="day" data-date="2026-04-06">
        <span class="day-number">6</span>
        <span class="day-status" id="status-2026-04-06"></span>
      </div>
      <div class="day" data-date="2026-04-07">
        <span class="day-number">7</span>
        <span class="day-status" id="status-2026-04-07"></span>
      </div>
    </div>
  `
}

describe('browser interactions', () => {
  beforeEach(async () => {
    vi.resetModules()
    buildDom()

    global.fetch = vi.fn(async () => ({ ok: true }))
    await import('../public/stats.js')
    await import('../public/ui.js')
  })

  it('shows selection state when a date is toggled', () => {
    window.toggleDateSelection('2026-04-06')

    expect(document.querySelector('.day[data-date="2026-04-06"]').classList.contains('selected')).toBe(true)
    expect(document.getElementById('selection-actions').classList.contains('visible')).toBe(true)
    expect(document.getElementById('selection-count').innerText).toBe('1 day selected')
  })

  it('applies a status optimistically and sends the expected API payload', async () => {
    window.toggleDateSelection('2026-04-06')
    await window.applyStatusToSelected('office')

    expect(document.querySelector('.day[data-date="2026-04-06"]').classList.contains('status-office')).toBe(true)
    expect(document.getElementById('status-2026-04-06').innerText).toBe('office')
    expect(global.fetch).toHaveBeenCalledWith('/api/status', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        updates: {
          '2026-04-06': 'office'
        }
      })
    })
    expect(document.getElementById('selection-actions').classList.contains('visible')).toBe(false)
  })

  it('syncs export links to the currently displayed period', () => {
    window.syncExportLinks()

    expect(document.getElementById('export-html-link').getAttribute('href')).toBe('/export/html/2026-03-30')
    expect(document.getElementById('export-json-link').getAttribute('href')).toBe('/export/json/2026-03-30')
  })
})
