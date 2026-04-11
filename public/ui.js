/* eslint-env browser */

const { collectDayStates, computeStats } = globalThis.OfficeDaysStats
const selectedDates = new Set();
let hoveredDate = null;

// Initialize on HTMX load
document.body.addEventListener('htmx:afterOnLoad', function (evt) {
  if (evt.detail.target.id === 'calendar-container') {
    calculateStats();
    attachHoverListeners();
    clearSelection();
    syncExportLinks();
  }
});

function attachHoverListeners () {
  const days = document.querySelectorAll('.day:not(.empty)');
  days.forEach(day => {
    day.addEventListener('mouseenter', () => {
      hoveredDate = day.getAttribute('data-date');
    });
    day.addEventListener('mouseleave', () => {
      hoveredDate = null;
    });
  });
}

// Global Keyboard Shortcuts
window.addEventListener('keydown', (e) => {
  const key = e.key.toLowerCase();
  const statusMap = {
    o: 'office',
    w: 'wfh',
    h: 'holiday',
    e: 'exception',
    a: 'absent',
    p: 'public-holiday',
    c: null
  };

  if (statusMap.hasOwnProperty(key)) {
    // Apply to selected dates if any, otherwise to hovered date
    if (selectedDates.size > 0) {
      applyStatusToSelected(statusMap[key]);
    } else if (hoveredDate) {
      selectedDates.add(hoveredDate);
      updateSelectionUI();
      applyStatusToSelected(statusMap[key]);
    }
  }

  // Escape key to clear selection and close modals
  if (key === 'escape') {
    clearSelection();
    closeShortcuts();
  }
});

function toggleDateSelection (date) { // eslint-disable-line no-unused-vars
  if (selectedDates.has(date)) {
    selectedDates.delete(date);
  } else {
    selectedDates.add(date);
  }
  updateSelectionUI();
}

function clearSelection () {
  selectedDates.clear();
  updateSelectionUI();
}

function updateSelectionUI () {
  // Remove selected class from all days
  document.querySelectorAll('.day.selected').forEach(day => {
    day.classList.remove('selected');
  });

  // Add selected class to selected days
  selectedDates.forEach(date => {
    const dayEl = document.querySelector(`.day[data-date="${date}"]`);
    if (dayEl) {
      dayEl.classList.add('selected');
    }
  });

  // Show/hide action bar based on selection
  const actionBar = document.getElementById('selection-actions');
  const selectionCount = document.getElementById('selection-count');

  if (selectedDates.size > 0) {
    actionBar.classList.add('visible');
    selectionCount.innerText = `${selectedDates.size} day${selectedDates.size > 1 ? 's' : ''} selected`;
  } else {
    actionBar.classList.remove('visible');
    selectionCount.innerText = '';
  }
}

async function applyStatusToSelected (status) {
  if (selectedDates.size === 0) return;

  const updates = {};
  selectedDates.forEach(date => {
    updates[date] = status;
    updateDayUI(date, status);
  });

  // Optimistic UI updates
  calculateStats();
  clearSelection();

  // Background sync to server
  try {
    await fetch('/api/status', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ updates })
    });
  } catch (e) {
    console.error("Failed to sync to database:", e);
  }
}

function openShortcuts () { // eslint-disable-line no-unused-vars
  document.getElementById('shortcuts-modal').classList.add('active');
  document.getElementById('shortcuts-modal').classList.remove('hidden');
}

function closeShortcuts () {
  document.getElementById('shortcuts-modal').classList.remove('active');
  setTimeout(() => {
    document.getElementById('shortcuts-modal').classList.add('hidden');
  }, 300);
}

function updateDayUI (date, status) {
  const dayEl = document.querySelector(`.day[data-date="${date}"]`);
  if (!dayEl) return;

  // Clear existing status classes (but preserve selected class)
  const isSelected = dayEl.classList.contains('selected');
  dayEl.className = dayEl.className.replace(/status-\S+/g, '').trim();
  if (isSelected) {
    dayEl.classList.add('selected');
  }

  const statusEl = document.getElementById(`status-${date}`);

  if (status) {
    dayEl.classList.add(`status-${status}`);
    statusEl.innerText = status.replace('-', ' ');
  } else {
    statusEl.innerText = '';
  }
}

function calculateStats () {
  const daysElements = document.querySelectorAll('.day[data-date]');
  if (!daysElements.length) return;

  const stats = computeStats(collectDayStates(daysElements));

  const workingEl = document.getElementById('stat-working');
  const requiredEl = document.getElementById('stat-required');
  const officeEl = document.getElementById('stat-office');
  const balanceEl = document.getElementById('stat-balance');

  workingEl.innerText = stats.workingDays;
  requiredEl.innerText = stats.officeRequired;
  officeEl.innerText = stats.officeCount;
  balanceEl.innerText = `${stats.balance}%`;

  // Conditional Styling
  const officeCard = officeEl.closest('.stat-card');
  const workingCard = workingEl.closest('.stat-card');

  // In Office & Balance Cards: Red if < required, Green if >=
  const balanceCard = balanceEl.closest('.stat-card');

  officeCard.classList.remove('status-red', 'status-green');
  balanceCard.classList.remove('status-red', 'status-green');

  if (stats.officeCount >= stats.officeRequired && stats.workingDays > 0) {
    officeCard.classList.add('status-green');
    balanceCard.classList.add('status-green');
  } else if (stats.workingDays > 0) {
    officeCard.classList.add('status-red');
    balanceCard.classList.add('status-red');
  }

  // Working Days Card: Yellow if any weekday is unmarked
  workingCard.classList.remove('status-yellow');
  if (!stats.allWeekdaysMarked && stats.hasWeekdays) {
    workingCard.classList.add('status-yellow');
  }
}

function getCurrentPeriodStart () {
  return document.querySelector('.calendar-period')?.getAttribute('data-period-start');
}

function syncExportLinks () {
  const periodStart = getCurrentPeriodStart();
  if (!periodStart) return;

  const htmlLink = document.getElementById('export-html-link');
  const jsonLink = document.getElementById('export-json-link');

  if (htmlLink) {
    htmlLink.href = `/export/html/${periodStart}`;
  }

  if (jsonLink) {
    jsonLink.href = `/export/json/${periodStart}`;
  }
}

function importData (event) { // eslint-disable-line no-unused-vars
  const file = event.target.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = async function (e) {
    try {
      const content = e.target.result;
      const parsed = JSON.parse(content);
      
      await fetch('/api/status', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ updates: parsed })
      });

      location.reload(); // Hard reload to fetch new UI
    } catch (err) {
      alert('Error parsing JSON file or syncing to server. Please make sure it is a valid export.');
    }
  };
  reader.readAsText(file);
  // Reset input so the same file can be uploaded again if needed
  event.target.value = '';
}

// Initial render for page load
window.onload = () => {
  calculateStats();
  attachHoverListeners();
  syncExportLinks();
};

Object.assign(globalThis, {
  applyStatusToSelected,
  closeShortcuts,
  getCurrentPeriodStart,
  importData,
  openShortcuts,
  syncExportLinks,
  toggleDateSelection
});
