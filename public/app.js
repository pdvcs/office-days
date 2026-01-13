let currentSelectedDate = null;
let hoveredDate = null;

// Initialize on HTMX load
document.body.addEventListener('htmx:afterOnLoad', function (evt) {
  if (evt.detail.target.id === 'calendar-container') {
    renderStoredStatuses();
    calculateStats();
    attachHoverListeners();
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
    a: 'absent',
    p: 'public-holiday',
    c: null
  };

  if (statusMap.hasOwnProperty(key)) {
    // If modal is open, use the selected date
    const modal = document.getElementById('status-modal');
    const targetDate = (modal && !modal.classList.contains('hidden')) ? currentSelectedDate : hoveredDate;

    if (targetDate) {
      // Temporarily set currentSelectedDate if we're using hover
      const prevSelected = currentSelectedDate;
      currentSelectedDate = targetDate;
      setStatus(statusMap[key]);
      currentSelectedDate = prevSelected;
    }
  }

  // Escape key to close modals
  if (key === 'escape') {
    closeModal();
    closeShortcuts();
  }
});

function formatDateDisplay (dateStr) {
  const [year, month, day] = dateStr.split('-');
  const date = new Date(year, month - 1, day);
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return `${parseInt(day)} ${months[date.getMonth()]} ${year}`;
}

function openModal (date) {
  currentSelectedDate = date;
  document.getElementById('modal-date-display').innerText = formatDateDisplay(date);
  document.getElementById('status-modal').classList.add('active');
  document.getElementById('status-modal').classList.remove('hidden');
}

function closeModal () {
  document.getElementById('status-modal').classList.remove('active');
  setTimeout(() => {
    document.getElementById('status-modal').classList.add('hidden');
  }, 300);
}

function openShortcuts () {
  document.getElementById('shortcuts-modal').classList.add('active');
  document.getElementById('shortcuts-modal').classList.remove('hidden');
}

function closeShortcuts () {
  document.getElementById('shortcuts-modal').classList.remove('active');
  setTimeout(() => {
    document.getElementById('shortcuts-modal').classList.add('hidden');
  }, 300);
}

function setStatus (status) {
  const data = JSON.parse(localStorage.getItem('wfh-data') || '{}');
  if (status) {
    data[currentSelectedDate] = status;
  } else {
    delete data[currentSelectedDate];
  }
  localStorage.setItem('wfh-data', JSON.stringify(data));

  updateDayUI(currentSelectedDate, status);
  calculateStats();
  closeModal();
}

function updateDayUI (date, status) {
  const dayEl = document.querySelector(`.day[data-date="${date}"]`);
  if (!dayEl) return;

  // Clear existing status classes
  dayEl.className = dayEl.className.replace(/status-\S+/g, '').trim();
  const statusEl = document.getElementById(`status-${date}`);

  if (status) {
    dayEl.classList.add(`status-${status}`);
    statusEl.innerText = status.replace('-', ' ');
  } else {
    statusEl.innerText = '';
  }
}

function renderStoredStatuses () {
  const data = JSON.parse(localStorage.getItem('wfh-data') || '{}');
  Object.keys(data).forEach(date => {
    updateDayUI(date, data[date]);
  });
}

function calculateStats () {
  const data = JSON.parse(localStorage.getItem('wfh-data') || '{}');

  // Get year and month from calendar header
  const headerEl = document.querySelector('.calendar-header h2');
  if (!headerEl) return;

  const headerText = headerEl.innerText;
  const [monthName, year] = headerText.split(' ');
  const month = new Date(`${monthName} 1, ${year}`).getMonth();
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  let weekdayCount = 0;
  let officeCount = 0;
  let skipCount = 0; // Holidays, Absences, Public Holidays
  let allWeekdaysMarked = true;

  for (let d = 1; d <= daysInMonth; d++) {
    const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    const dateObj = new Date(year, month, d);
    const dayOfWeek = dateObj.getDay();
    const status = data[dateStr];

    // Only count/check weekdays
    if (dayOfWeek !== 0 && dayOfWeek !== 6) {
      weekdayCount++;

      if (status === 'holiday' || status === 'absent' || status === 'public-holiday') {
        skipCount++;
      } else if (status === 'office') {
        officeCount++;
      } else if (status === 'wfh') {
        // counted in stats implicitly by not being skipped
      } else {
        // No status marked for this weekday
        allWeekdaysMarked = false;
      }
    }
  }

  const workingDays = weekdayCount - skipCount;
  const officeRequired = Math.round(workingDays * 0.60);

  const workingEl = document.getElementById('stat-working');
  const requiredEl = document.getElementById('stat-required');
  const officeEl = document.getElementById('stat-office');
  const balanceEl = document.getElementById('stat-balance');

  workingEl.innerText = workingDays;
  requiredEl.innerText = officeRequired;
  officeEl.innerText = officeCount;

  const balance = workingDays === 0 ? 0 : Math.round((officeCount / workingDays) * 100);
  balanceEl.innerText = `${balance}%`;

  // Conditional Styling
  const officeCard = officeEl.closest('.stat-card');
  const workingCard = workingEl.closest('.stat-card');

  // In Office & Balance Cards: Red if < required, Green if >=
  const balanceCard = balanceEl.closest('.stat-card');

  officeCard.classList.remove('status-red', 'status-green');
  balanceCard.classList.remove('status-red', 'status-green');

  if (officeCount >= officeRequired && workingDays > 0) {
    officeCard.classList.add('status-green');
    balanceCard.classList.add('status-green');
  } else if (workingDays > 0) {
    officeCard.classList.add('status-red');
    balanceCard.classList.add('status-red');
  }

  // Working Days Card: Yellow if any weekday is unmarked
  workingCard.classList.remove('status-yellow');
  if (!allWeekdaysMarked && weekdayCount > 0) {
    workingCard.classList.add('status-yellow');
  }
}

function readableTimestamp () {
  return new Date().toISOString().replace('T', '_').slice(0, 19).replace(/:/g, '-');
}

function exportData () {
  const data = localStorage.getItem('wfh-data') || '{}';
  const blob = new Blob([data], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `wfh-tracker-backup-${readableTimestamp()}.json`;
  a.style.display = 'none'; // Explicitly hide
  document.body.appendChild(a);
  a.click();

  // Delay removal to ensure download starts
  setTimeout(() => {
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, 500);
}

function importData (event) {
  const file = event.target.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = function (e) {
    try {
      const content = e.target.result;
      // Validate JSON
      JSON.parse(content);
      localStorage.setItem('wfh-data', content);

      // Refresh UI
      renderStoredStatuses();
      calculateStats();
      alert('Data imported successfully!');
    } catch (err) {
      alert('Error parsing JSON file. Please make sure it is a valid export.');
    }
  };
  reader.readAsText(file);
  // Reset input so the same file can be uploaded again if needed
  event.target.value = '';
}

// Initial render for page load
window.onload = () => {
  renderStoredStatuses();
  calculateStats();
};
