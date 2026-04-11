(function (root, factory) {
  const logic = factory()

  if (typeof module === 'object' && module.exports) {
    module.exports = logic
  }

  root.OfficeDaysStats = logic
}(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  function getStatusFromClassList (classList) {
    for (const cls of classList) {
      if (cls.startsWith('status-') && cls !== 'status-red' && cls !== 'status-green' && cls !== 'status-yellow') {
        return cls.replace('status-', '')
      }
    }

    return null
  }

  function collectDayStates (dayElements) {
    return Array.from(dayElements).map(dayEl => ({
      date: dayEl.getAttribute('data-date'),
      status: getStatusFromClassList(dayEl.classList)
    }))
  }

  function computeStats (dayStates) {
    let weekdayCount = 0
    let officeCount = 0
    let skipCount = 0
    let allWeekdaysMarked = true

    dayStates.forEach(({ date, status }) => {
      const dateObj = new Date(date + 'T00:00:00Z')
      const dayOfWeek = dateObj.getUTCDay()

      if (dayOfWeek !== 0 && dayOfWeek !== 6) {
        weekdayCount++

        if (status === 'holiday' || status === 'absent' || status === 'public-holiday' || status === 'exception') {
          skipCount++
        } else if (status === 'office') {
          officeCount++
        } else if (status !== 'wfh') {
          allWeekdaysMarked = false
        }
      }
    })

    const workingDays = weekdayCount - skipCount
    const officeRequired = Math.round(workingDays * 0.60)
    const balance = workingDays === 0 ? 0 : Math.round((officeCount / workingDays) * 100)

    return {
      workingDays,
      officeRequired,
      officeCount,
      balance,
      allWeekdaysMarked,
      hasWeekdays: weekdayCount > 0
    }
  }

  return {
    collectDayStates,
    computeStats
  }
}))
