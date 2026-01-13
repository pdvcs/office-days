const express = require('express');
const app = express();
const port = 3000;

app.set('view engine', 'ejs');
app.use(express.static('public'));
app.use(express.json());

// Helper to get days in month
function getDaysInMonth (year, month) {
  return new Date(year, month + 1, 0).getDate();
}

// Helper to get start day of month (Monday = 0, Sunday = 6)
function getStartDayOfMonth (year, month) {
  const day = new Date(year, month, 1).getDay();
  // Convert Sunday (0) -> 6, Monday (1) -> 0, etc.
  return (day + 6) % 7;
}

app.get('/', (req, res) => {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth();

  const daysInMonth = getDaysInMonth(year, month);
  const startDay = getStartDayOfMonth(year, month);
  const monthName = now.toLocaleString('default', { month: 'long' });

  res.render('index', {
    year,
    month,
    monthName,
    daysInMonth,
    startDay
  });
});

app.get('/calendar/:year/:month', (req, res) => {
  const year = parseInt(req.params.year);
  const month = parseInt(req.params.month);

  const daysInMonth = getDaysInMonth(year, month);
  const startDay = getStartDayOfMonth(year, month);

  const monthName = new Date(year, month).toLocaleString('default', { month: 'long' });

  res.render('partials/calendar', {
    year,
    month,
    monthName,
    daysInMonth,
    startDay
  });
});

app.listen(port, () => {
  console.log(`Office Days app listening at http://localhost:${port}`);
});
