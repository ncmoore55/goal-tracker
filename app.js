/* ============================================================
   Discipline Tracker — Data layer & computations
   ============================================================ */

const STORAGE_KEY = 'goalTrackerData';

const DEFAULT_HABITS = [
  { id: 'h1', name: 'Wake Up at 6:00 AM' },
  { id: 'h2', name: 'Meditation / Stretch' },
  { id: 'h3', name: 'Hit the Gym' },
  { id: 'h4', name: 'Cold Shower' },
  { id: 'h5', name: 'Read 10 Pages' },
  { id: 'h6', name: 'Pray' },
  { id: 'h7', name: 'Deep Work' },
  { id: 'h8', name: 'Limit Social Media' }
];

function monthKeyOf(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

function daysInMonth(monthKey) {
  const [y, m] = monthKey.split('-').map(Number);
  return new Date(y, m, 0).getDate();
}

function prevMonthKey(monthKey) {
  let [y, m] = monthKey.split('-').map(Number);
  m -= 1;
  if (m === 0) { m = 12; y -= 1; }
  return `${y}-${String(m).padStart(2, '0')}`;
}

function monthName(monthKey) {
  const [y, m] = monthKey.split('-').map(Number);
  return new Date(y, m - 1, 1).toLocaleString('en-US', { month: 'long', year: 'numeric' });
}

function defaultData() {
  return {
    habits: DEFAULT_HABITS.map(h => ({ ...h })),
    nextHabitId: DEFAULT_HABITS.length + 1,
    currentMonth: monthKeyOf(new Date()),
    days: {},
    history: {}
  };
}

function loadData() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return defaultData();
    const parsed = JSON.parse(raw);
    if (!parsed.habits || !parsed.currentMonth || !parsed.days) return defaultData();
    if (!parsed.history) parsed.history = {};
    if (!parsed.nextHabitId) parsed.nextHabitId = parsed.habits.length + 1;
    return parsed;
  } catch (e) {
    return defaultData();
  }
}

function saveData() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
}

/** Archives the previous month into history if the calendar month has rolled over. */
function ensureCurrentMonth(d) {
  const nowKey = monthKeyOf(new Date());
  if (d.currentMonth !== nowKey) {
    d.history[d.currentMonth] = {
      habits: d.habits.map(h => ({ ...h })),
      days: d.days
    };
    d.currentMonth = nowKey;
    d.days = {};
  }
}

function getViewContext() {
  if (viewMonth === 'current' || !data.history[viewMonth]) {
    return { habits: data.habits, days: data.days, monthKey: data.currentMonth, readOnly: false };
  }
  const h = data.history[viewMonth];
  return { habits: h.habits, days: h.days, monthKey: viewMonth, readOnly: true };
}

function getDayData(ctx, dayNum) {
  return ctx.days[String(dayNum)] || { checks: {}, mental: null, motivation: null };
}

function isCurrentMonthView(ctx) {
  return ctx.monthKey === monthKeyOf(new Date());
}

function throughDayFor(ctx) {
  return isCurrentMonthView(ctx) ? new Date().getDate() : daysInMonth(ctx.monthKey);
}

/* ---------- Core metrics ---------- */

function dailyScore(ctx, dayNum) {
  if (ctx.habits.length === 0) return 0;
  const dd = getDayData(ctx, dayNum);
  let count = 0;
  ctx.habits.forEach(h => { if (dd.checks[h.id]) count++; });
  return Math.round((count / ctx.habits.length) * 100);
}

function countChecksForDay(ctx, dayNum) {
  const dd = getDayData(ctx, dayNum);
  return ctx.habits.filter(h => dd.checks[h.id]).length;
}

/** Walks backward from `endDay` in `monthKey`/`days`, optionally chaining into earlier
 *  archived months via `data.history` for unbroken streaks. */
function streakEndingAt(monthKey, days, habitId, endDay, chain) {
  let streak = 0;
  let curMonthKey = monthKey;
  let curDays = days;
  let d = endDay;
  while (true) {
    if (d < 1) {
      if (!chain) break;
      curMonthKey = prevMonthKey(curMonthKey);
      const hist = data.history[curMonthKey];
      if (!hist) break;
      curDays = hist.days;
      d = daysInMonth(curMonthKey);
    }
    const dd = curDays[String(d)];
    if (dd && dd.checks[habitId]) {
      streak++;
      d--;
    } else {
      break;
    }
  }
  return streak;
}

/** Current streak ending "now": if today hasn't been checked off yet, falls back to the
 *  streak ending yesterday so an unmarked today doesn't zero out an active streak. */
function currentStreak(ctx, habitId, throughDay, isCurrent) {
  let endDay = throughDay;
  if (isCurrent && !getDayData(ctx, throughDay).checks[habitId]) endDay -= 1;
  return streakEndingAt(ctx.monthKey, ctx.days, habitId, endDay, true);
}

function bestStreakThisMonth(ctx, habitId, throughDay) {
  let best = 0, run = 0;
  for (let d = 1; d <= throughDay; d++) {
    if (getDayData(ctx, d).checks[habitId]) {
      run++;
      best = Math.max(best, run);
    } else {
      run = 0;
    }
  }
  return best;
}

function habitCompletionPct(ctx, habitId, throughDay) {
  if (throughDay <= 0) return 0;
  let count = 0;
  for (let d = 1; d <= throughDay; d++) {
    if (getDayData(ctx, d).checks[habitId]) count++;
  }
  return Math.round((count / throughDay) * 100);
}

function monthlyTotals(ctx, throughDay) {
  let totalChecks = 0;
  for (let d = 1; d <= throughDay; d++) {
    const dd = getDayData(ctx, d);
    ctx.habits.forEach(h => { if (dd.checks[h.id]) totalChecks++; });
  }
  const totalPossible = ctx.habits.length * throughDay;
  const pct = totalPossible > 0 ? Math.round((totalChecks / totalPossible) * 100) : 0;
  return { totalChecks, totalPossible, pct };
}

function levelClass(pct) {
  if (pct >= 90) return 'level-4';
  if (pct >= 70) return 'level-3';
  if (pct >= 50) return 'level-2';
  if (pct > 0) return 'level-1';
  return 'level-0';
}

function colorForPct(pct) {
  if (pct >= 80) return '#22c55e';
  if (pct >= 50) return '#94a3b8';
  return '#dc2626';
}

/* ---------- Weekly breakdown (Sun–Sat calendar weeks) ---------- */

function weekIndexOf(monthKey, dayNum) {
  const [y, m] = monthKey.split('-').map(Number);
  const firstWeekday = new Date(y, m - 1, 1).getDay();
  return Math.floor((dayNum - 1 + firstWeekday) / 7);
}

function buildWeeks(ctx, throughDay) {
  const totalDays = daysInMonth(ctx.monthKey);
  const numWeeks = weekIndexOf(ctx.monthKey, totalDays) + 1;
  const weeks = [];
  for (let w = 0; w < numWeeks; w++) weeks.push({ index: w, days: [] });
  for (let d = 1; d <= totalDays; d++) {
    weeks[weekIndexOf(ctx.monthKey, d)].days.push(d);
  }
  return weeks.map(w => {
    const elapsedDays = w.days.filter(d => d <= throughDay);
    let completion = 0;
    let mostConsistent = null;
    let needsImprovement = null;
    if (elapsedDays.length) {
      completion = Math.round(
        elapsedDays.reduce((s, d) => s + dailyScore(ctx, d), 0) / elapsedDays.length
      );
      if (ctx.habits.length) {
        let best = -1, worst = 101;
        ctx.habits.forEach(h => {
          let cnt = 0;
          elapsedDays.forEach(d => { if (getDayData(ctx, d).checks[h.id]) cnt++; });
          const pct = Math.round((cnt / elapsedDays.length) * 100);
          if (pct > best) { best = pct; mostConsistent = { name: h.name, pct }; }
          if (pct < worst) { worst = pct; needsImprovement = { name: h.name, pct }; }
        });
      }
    }
    return {
      index: w.index,
      label: `Week ${w.index + 1}`,
      days: w.days,
      elapsedDays,
      completion,
      score: completion,
      mostConsistent,
      needsImprovement
    };
  });
}

/* ============================================================
   Rendering
   ============================================================ */

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

function renderAll() {
  renderHeader();
  renderDashboard();
  renderBarCharts();
  renderTrackingGrid();
  renderWeeklyTable();
  renderMonthlyStats();
  renderComparisonCharts();
}

function renderHeader() {
  const select = document.getElementById('historySelect');
  select.innerHTML = '';

  const curOpt = document.createElement('option');
  curOpt.value = 'current';
  curOpt.textContent = monthName(data.currentMonth) + ' (Current)';
  select.appendChild(curOpt);

  Object.keys(data.history).sort().reverse().forEach(k => {
    const o = document.createElement('option');
    o.value = k;
    o.textContent = monthName(k) + ' (Archived)';
    select.appendChild(o);
  });
  select.value = viewMonth;

  const ctx = getViewContext();
  document.getElementById('monthLabel').textContent = monthName(ctx.monthKey).toUpperCase();
  document.getElementById('historyBanner').classList.toggle('visible', ctx.readOnly);

  const settingsBtn = document.getElementById('settingsBtn');
  settingsBtn.disabled = ctx.readOnly;
  settingsBtn.style.opacity = ctx.readOnly ? '0.4' : '1';
}

function setProgress(prefix, pct, valueText, subText) {
  const fill = document.getElementById(prefix + 'Fill');
  const val = document.getElementById(prefix + 'Value');
  fill.style.width = Math.max(0, Math.min(100, pct)) + '%';
  fill.classList.remove('tier-mid', 'tier-high');
  if (pct >= 80) fill.classList.add('tier-high');
  else if (pct >= 50) fill.classList.add('tier-mid');
  val.innerHTML = `${valueText} <span class="sub">${subText}</span>`;
}

function renderDashboard() {
  const ctx = getViewContext();
  const totalDays = daysInMonth(ctx.monthKey);
  const isCurrent = isCurrentMonthView(ctx);
  const throughDay = throughDayFor(ctx);

  // Daily
  const dScore = dailyScore(ctx, throughDay);
  setProgress('daily', dScore, `${countChecksForDay(ctx, throughDay)} / ${ctx.habits.length}`, isCurrent ? 'today' : 'last day');

  // Weekly (current/last week)
  const weeks = buildWeeks(ctx, throughDay);
  const curWeekIdx = weekIndexOf(ctx.monthKey, throughDay);
  const curWeek = weeks[curWeekIdx];
  setProgress('weekly', curWeek.completion, `${curWeek.completion}%`, isCurrent ? 'this week' : 'final week');

  // Monthly
  const totals = monthlyTotals(ctx, throughDay);
  setProgress('monthly', totals.pct, `${totals.pct}%`, isCurrent ? 'month to date' : 'final');

  renderStreaks(ctx, throughDay, isCurrent);
  renderHeatmap(ctx, totalDays, isCurrent, throughDay);
  renderCalendar(ctx, totalDays, isCurrent, throughDay);
}

function renderStreaks(ctx, throughDay, isCurrent) {
  const card = document.getElementById('streakList').closest('.card');
  card.querySelector('.card-label').textContent = isCurrent ? 'Current Streaks' : 'Streaks at Month End';

  const list = document.getElementById('streakList');
  list.innerHTML = '';
  if (ctx.habits.length === 0) {
    list.innerHTML = '<div class="streak-item">No goals yet — add some in Edit Goals.</div>';
    return;
  }
  ctx.habits.forEach(h => {
    const streak = currentStreak(ctx, h.id, throughDay, isCurrent);
    const item = document.createElement('div');
    item.className = 'streak-item' + (streak > 0 ? ' has-streak' : '');
    item.innerHTML = `<span class="streak-name">${escapeHtml(h.name)}</span><span class="streak-count">${streak}</span>`;
    list.appendChild(item);
  });
}

function renderHeatmap(ctx, totalDays, isCurrent, throughDay) {
  const el = document.getElementById('heatmap');
  el.innerHTML = '';
  for (let d = 1; d <= totalDays; d++) {
    const cell = document.createElement('div');
    const isFuture = isCurrent && d > throughDay;
    let cls = 'heat-cell';
    if (isFuture) {
      cls += ' level-0 future';
      cell.title = `Day ${d} — upcoming`;
    } else {
      const score = dailyScore(ctx, d);
      cls += ' ' + levelClass(score);
      cell.title = `Day ${d} — ${score}%`;
    }
    if (isCurrent && d === throughDay) cls += ' today';
    cell.className = cls;
    cell.textContent = d;
    el.appendChild(cell);
  }
}

function renderCalendar(ctx, totalDays, isCurrent, throughDay) {
  const el = document.getElementById('calendarGrid');
  el.innerHTML = '';
  const [y, m] = ctx.monthKey.split('-').map(Number);
  const firstWeekday = new Date(y, m - 1, 1).getDay();

  for (let i = 0; i < firstWeekday; i++) {
    const empty = document.createElement('div');
    empty.className = 'cal-cell empty';
    el.appendChild(empty);
  }

  for (let d = 1; d <= totalDays; d++) {
    const cell = document.createElement('div');
    const isFuture = isCurrent && d > throughDay;
    let cls = 'cal-cell';
    let pctText = '';
    if (isFuture) {
      cls += ' level-0 future';
    } else {
      const score = dailyScore(ctx, d);
      cls += ' ' + levelClass(score);
      pctText = score + '%';
    }
    if (isCurrent && d === throughDay) cls += ' today';
    cell.className = cls;
    cell.innerHTML = `<div class="cal-day-num">${d}</div>${pctText ? `<div class="cal-pct">${pctText}</div>` : ''}`;
    el.appendChild(cell);
  }
}

/* ---------- Daily tracking grid ---------- */

function buildDropdownRow(ctx, field, label, totalDays, throughDay, isCurrent) {
  const tr = document.createElement('tr');
  const td = document.createElement('td');
  td.className = 'row-label';
  td.textContent = label;
  tr.appendChild(td);

  for (let d = 1; d <= totalDays; d++) {
    const tdc = document.createElement('td');
    tdc.className = 'day-col' + (isCurrent && d === throughDay ? ' today' : '');
    const dd = getDayData(ctx, d);
    const select = document.createElement('select');

    const optEmpty = document.createElement('option');
    optEmpty.value = '';
    optEmpty.textContent = '-';
    select.appendChild(optEmpty);

    for (let i = 1; i <= 10; i++) {
      const o = document.createElement('option');
      o.value = String(i);
      o.textContent = String(i);
      select.appendChild(o);
    }
    select.value = dd[field] != null ? String(dd[field]) : '';

    if (ctx.readOnly) {
      select.disabled = true;
    } else {
      select.addEventListener('change', e => {
        setDayField(d, field, e.target.value ? Number(e.target.value) : null);
      });
    }
    tdc.appendChild(select);
    tr.appendChild(tdc);
  }
  return tr;
}

function renderTrackingGrid() {
  const ctx = getViewContext();
  const table = document.getElementById('trackingTable');
  table.innerHTML = '';
  const totalDays = daysInMonth(ctx.monthKey);
  const isCurrent = isCurrentMonthView(ctx);
  const throughDay = throughDayFor(ctx);

  // Header row
  const thead = document.createElement('thead');
  const headRow = document.createElement('tr');
  const thHabit = document.createElement('th');
  thHabit.className = 'habit-name';
  thHabit.textContent = 'Habit';
  headRow.appendChild(thHabit);

  const [y, m] = ctx.monthKey.split('-').map(Number);
  for (let d = 1; d <= totalDays; d++) {
    const th = document.createElement('th');
    th.className = 'day-col' + (isCurrent && d === throughDay ? ' today' : '');
    const wd = ['S', 'M', 'T', 'W', 'T', 'F', 'S'][new Date(y, m - 1, d).getDay()];
    th.innerHTML = `${d}<br>${wd}`;
    headRow.appendChild(th);
  }
  thead.appendChild(headRow);
  table.appendChild(thead);

  const tbody = document.createElement('tbody');

  // Habit rows
  ctx.habits.forEach(h => {
    const tr = document.createElement('tr');
    const td = document.createElement('td');
    td.className = 'habit-name';
    const pct = habitCompletionPct(ctx, h.id, throughDay);
    const streak = currentStreak(ctx, h.id, throughDay, isCurrent);
    const best = bestStreakThisMonth(ctx, h.id, throughDay);
    td.innerHTML = `<div class="habit-meta"><div class="habit-title">${escapeHtml(h.name)}</div>` +
      `<div class="habit-stats">${pct}% &middot; streak ${streak} &middot; best ${best}</div></div>`;
    tr.appendChild(td);

    for (let d = 1; d <= totalDays; d++) {
      const tdc = document.createElement('td');
      tdc.className = 'day-col' + (isCurrent && d === throughDay ? ' today' : '');
      const dd = getDayData(ctx, d);
      const checked = !!dd.checks[h.id];
      const cell = document.createElement('div');
      cell.className = 'check-cell' + (checked ? ' checked' : '') + (ctx.readOnly ? ' disabled' : '');
      cell.textContent = '✓';
      if (!ctx.readOnly) {
        cell.addEventListener('click', () => toggleCheck(d, h.id));
      }
      tdc.appendChild(cell);
      tr.appendChild(tdc);
    }
    tbody.appendChild(tr);
  });

  // Daily score row
  const scoreRow = document.createElement('tr');
  const scoreLabel = document.createElement('td');
  scoreLabel.className = 'row-label';
  scoreLabel.textContent = 'Daily Score';
  scoreRow.appendChild(scoreLabel);
  for (let d = 1; d <= totalDays; d++) {
    const tdc = document.createElement('td');
    tdc.className = 'day-col' + (isCurrent && d === throughDay ? ' today' : '');
    if (isCurrent && d > throughDay) {
      tdc.textContent = '—';
    } else {
      const score = dailyScore(ctx, d);
      tdc.innerHTML = `<span class="day-score-cell ${levelClass(score)}">${score}%</span>`;
    }
    scoreRow.appendChild(tdc);
  }
  tbody.appendChild(scoreRow);

  // Mental state / motivation rows
  tbody.appendChild(buildDropdownRow(ctx, 'mental', 'Mental State', totalDays, throughDay, isCurrent));
  tbody.appendChild(buildDropdownRow(ctx, 'motivation', 'Motivation', totalDays, throughDay, isCurrent));

  table.appendChild(tbody);
}

/* ---------- Weekly & monthly panels ---------- */

function renderWeeklyTable() {
  const ctx = getViewContext();
  const isCurrent = isCurrentMonthView(ctx);
  const throughDay = throughDayFor(ctx);
  const curWeekIdx = weekIndexOf(ctx.monthKey, throughDay);
  const weeks = buildWeeks(ctx, throughDay);

  const table = document.getElementById('weeklyTable');
  table.innerHTML = '';

  const thead = document.createElement('thead');
  thead.innerHTML = '<tr><th>Week</th><th>Days</th><th>Completion</th><th>Score /100</th>' +
    '<th>Most Consistent</th><th>Needs Improvement</th></tr>';
  table.appendChild(thead);

  const tbody = document.createElement('tbody');
  weeks.forEach(w => {
    const tr = document.createElement('tr');
    if (isCurrent && w.index === curWeekIdx) tr.className = 'current-week';
    const dayRange = w.days.length > 1 ? `${w.days[0]}–${w.days[w.days.length - 1]}` : `${w.days[0]}`;
    tr.innerHTML = `
      <td>${w.label}</td>
      <td>${dayRange}</td>
      <td>${w.elapsedDays.length ? w.completion + '%' : '—'}</td>
      <td>${w.elapsedDays.length ? w.score : '—'}</td>
      <td>${w.mostConsistent ? `${escapeHtml(w.mostConsistent.name)} (${w.mostConsistent.pct}%)` : '—'}</td>
      <td>${w.needsImprovement ? `${escapeHtml(w.needsImprovement.name)} (${w.needsImprovement.pct}%)` : '—'}</td>
    `;
    tbody.appendChild(tr);
  });
  table.appendChild(tbody);
}

function renderMonthlyStats() {
  const ctx = getViewContext();
  const throughDay = throughDayFor(ctx);
  const totals = monthlyTotals(ctx, throughDay);

  const habitPcts = ctx.habits.map(h => ({
    name: h.name,
    pct: habitCompletionPct(ctx, h.id, throughDay)
  }));
  let best = null, worst = null;
  habitPcts.forEach(hp => {
    if (!best || hp.pct > best.pct) best = hp;
    if (!worst || hp.pct < worst.pct) worst = hp;
  });

  let longest = 0, longestHabit = null;
  ctx.habits.forEach(h => {
    const b = bestStreakThisMonth(ctx, h.id, throughDay);
    if (b > longest) { longest = b; longestHabit = h.name; }
  });

  const items = [
    { label: 'Monthly Completion', value: totals.pct + '%' },
    { label: 'Total Check-ins', value: `${totals.totalChecks} / ${totals.totalPossible}` },
    { label: 'Longest Streak', value: longestHabit ? `${longest} days (${longestHabit})` : '0 days' },
    { label: 'Best Performing', value: best ? `${best.name} (${best.pct}%)` : '—' },
    { label: 'Worst Performing', value: worst ? `${worst.name} (${worst.pct}%)` : '—' },
    { label: 'Monthly Score', value: `${totals.pct} / 100`, score: true }
  ];

  const container = document.getElementById('monthlyStats');
  container.innerHTML = '';
  items.forEach(it => {
    const div = document.createElement('div');
    div.className = 'stat-item' + (it.score ? ' score' : '');
    div.innerHTML = `<div class="stat-label">${it.label}</div><div class="stat-value">${it.value}</div>`;
    container.appendChild(div);
  });
}

/* ============================================================
   Canvas charts (no external dependencies)
   ============================================================ */

function prepareCanvas(canvas) {
  const dctx = canvas.getContext('2d');
  const dpr = window.devicePixelRatio || 1;
  const rect = canvas.getBoundingClientRect();
  canvas.width = rect.width * dpr;
  canvas.height = rect.height * dpr;
  dctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  dctx.clearRect(0, 0, rect.width, rect.height);
  return { dctx, W: rect.width, H: rect.height };
}

function truncateLabel(s, n) {
  return s.length > n ? s.slice(0, n - 1) + '…' : s;
}

function drawBarChart(canvas, labels, values) {
  const { dctx, W, H } = prepareCanvas(canvas);
  const n = values.length;
  if (n === 0) {
    dctx.fillStyle = '#6b7280';
    dctx.font = '12px Segoe UI';
    dctx.textAlign = 'center';
    dctx.fillText('No goals yet', W / 2, H / 2);
    return;
  }
  const padding = { top: 20, right: 10, bottom: 54, left: 20 };
  const chartW = W - padding.left - padding.right;
  const chartH = H - padding.top - padding.bottom;
  const gap = 14;
  const barW = (chartW - gap * (n - 1)) / n;

  dctx.strokeStyle = '#2a2e37';
  dctx.lineWidth = 1;
  [0, 0.25, 0.5, 0.75, 1].forEach(f => {
    const y = padding.top + chartH * (1 - f);
    dctx.beginPath();
    dctx.moveTo(padding.left, y);
    dctx.lineTo(padding.left + chartW, y);
    dctx.stroke();
  });

  values.forEach((v, i) => {
    const barH = Math.max(1, (Math.max(0, v) / 100) * chartH);
    const x = padding.left + i * (barW + gap);
    const y = padding.top + (chartH - barH);
    dctx.fillStyle = colorForPct(v);
    dctx.fillRect(x, y, barW, barH);

    dctx.fillStyle = '#e5e7eb';
    dctx.font = '11px Segoe UI';
    dctx.textAlign = 'center';
    dctx.fillText(Math.round(v) + '%', x + barW / 2, y - 6);

    dctx.save();
    dctx.translate(x + barW / 2, padding.top + chartH + 6);
    dctx.rotate(-Math.PI / 5);
    dctx.fillStyle = '#94a3b8';
    dctx.font = '10px Segoe UI';
    dctx.textAlign = 'right';
    dctx.fillText(truncateLabel(labels[i], 12), 0, 0);
    dctx.restore();
  });
}

function drawLineChart(canvas, labels, seriesA, seriesB) {
  const { dctx, W, H } = prepareCanvas(canvas);
  const padding = { top: 14, right: 14, bottom: 24, left: 30 };
  const chartW = W - padding.left - padding.right;
  const chartH = H - padding.top - padding.bottom;
  const n = labels.length;

  dctx.strokeStyle = '#2a2e37';
  dctx.fillStyle = '#6b7280';
  dctx.font = '10px Segoe UI';
  dctx.textAlign = 'right';
  dctx.lineWidth = 1;
  [0, 25, 50, 75, 100].forEach(v => {
    const y = padding.top + chartH * (1 - v / 100);
    dctx.beginPath();
    dctx.moveTo(padding.left, y);
    dctx.lineTo(padding.left + chartW, y);
    dctx.stroke();
    dctx.fillText(String(v), padding.left - 4, y + 3);
  });

  if (n === 0) return;
  const stepX = n > 1 ? chartW / (n - 1) : 0;

  function plot(series, color) {
    dctx.strokeStyle = color;
    dctx.fillStyle = color;
    dctx.lineWidth = 2;
    dctx.beginPath();
    let started = false;
    series.forEach((v, i) => {
      if (v == null) { started = false; return; }
      const x = padding.left + i * stepX;
      const y = padding.top + chartH * (1 - v / 100);
      if (!started) { dctx.moveTo(x, y); started = true; } else { dctx.lineTo(x, y); }
    });
    dctx.stroke();
    series.forEach((v, i) => {
      if (v == null) return;
      const x = padding.left + i * stepX;
      const y = padding.top + chartH * (1 - v / 100);
      dctx.beginPath();
      dctx.arc(x, y, 2.5, 0, Math.PI * 2);
      dctx.fill();
    });
  }
  plot(seriesA, '#dc2626');
  plot(seriesB, '#94a3b8');

  dctx.fillStyle = '#6b7280';
  dctx.textAlign = 'center';
  const labelStep = Math.max(1, Math.ceil(n / 10));
  labels.forEach((l, i) => {
    if (i % labelStep === 0) {
      dctx.fillText(l, padding.left + i * stepX, H - 6);
    }
  });
}

function renderBarCharts() {
  const ctx = getViewContext();
  const throughDay = throughDayFor(ctx);

  const habitLabels = ctx.habits.map(h => h.name);
  const habitValues = ctx.habits.map(h => habitCompletionPct(ctx, h.id, throughDay));
  drawBarChart(document.getElementById('habitBarChart'), habitLabels, habitValues);

  const weeks = buildWeeks(ctx, throughDay);
  const weekLabels = weeks.map(w => w.label);
  const weekValues = weeks.map(w => w.score);
  drawBarChart(document.getElementById('weekBarChart'), weekLabels, weekValues);
}

function renderComparisonCharts() {
  const ctx = getViewContext();
  const throughDay = throughDayFor(ctx);

  const labels = [], completion = [], mental = [], motivation = [];
  for (let d = 1; d <= throughDay; d++) {
    labels.push(String(d));
    completion.push(dailyScore(ctx, d));
    const dd = getDayData(ctx, d);
    mental.push(dd.mental != null ? dd.mental * 10 : null);
    motivation.push(dd.motivation != null ? dd.motivation * 10 : null);
  }
  drawLineChart(document.getElementById('mentalChart'), labels, completion, mental);
  drawLineChart(document.getElementById('motivationChart'), labels, completion, motivation);
}

/* ============================================================
   Mutations
   ============================================================ */

function toggleCheck(dayNum, habitId) {
  const key = String(dayNum);
  if (!data.days[key]) data.days[key] = { checks: {}, mental: null, motivation: null };
  data.days[key].checks[habitId] = !data.days[key].checks[habitId];
  saveData();
  renderAll();
}

function setDayField(dayNum, field, value) {
  const key = String(dayNum);
  if (!data.days[key]) data.days[key] = { checks: {}, mental: null, motivation: null };
  data.days[key][field] = value;
  saveData();
  renderAll();
}

/* ============================================================
   Settings modal
   ============================================================ */

function renderHabitEditList() {
  const container = document.getElementById('habitEditList');
  container.innerHTML = '';
  data.habits.forEach((h, idx) => {
    const row = document.createElement('div');
    row.className = 'habit-edit-row';

    const input = document.createElement('input');
    input.type = 'text';
    input.value = h.name;
    input.addEventListener('change', e => {
      h.name = e.target.value.trim() || h.name;
      saveData();
      renderAll();
    });
    row.appendChild(input);

    const reorder = document.createElement('div');
    reorder.className = 'reorder-btns';

    const up = document.createElement('button');
    up.textContent = '▲';
    up.disabled = idx === 0;
    up.addEventListener('click', () => {
      [data.habits[idx - 1], data.habits[idx]] = [data.habits[idx], data.habits[idx - 1]];
      saveData();
      renderHabitEditList();
      renderAll();
    });

    const down = document.createElement('button');
    down.textContent = '▼';
    down.disabled = idx === data.habits.length - 1;
    down.addEventListener('click', () => {
      [data.habits[idx + 1], data.habits[idx]] = [data.habits[idx], data.habits[idx + 1]];
      saveData();
      renderHabitEditList();
      renderAll();
    });

    reorder.appendChild(up);
    reorder.appendChild(down);
    row.appendChild(reorder);

    const del = document.createElement('button');
    del.className = 'danger-outline';
    del.textContent = '✕';
    del.title = 'Remove goal';
    del.addEventListener('click', () => {
      if (confirm(`Remove "${h.name}"? This month's check marks for it will no longer be shown.`)) {
        data.habits.splice(idx, 1);
        saveData();
        renderHabitEditList();
        renderAll();
      }
    });
    row.appendChild(del);

    container.appendChild(row);
  });
}

/* ============================================================
   Event wiring
   ============================================================ */

document.getElementById('historySelect').addEventListener('change', e => {
  viewMonth = e.target.value;
  renderAll();
});

document.getElementById('settingsBtn').addEventListener('click', () => {
  if (getViewContext().readOnly) return;
  renderHabitEditList();
  document.getElementById('settingsModal').classList.add('open');
});

document.getElementById('closeSettingsBtn').addEventListener('click', () => {
  document.getElementById('settingsModal').classList.remove('open');
});

document.getElementById('settingsModal').addEventListener('click', e => {
  if (e.target.id === 'settingsModal') {
    document.getElementById('settingsModal').classList.remove('open');
  }
});

document.getElementById('addHabitBtn').addEventListener('click', () => {
  const id = 'h' + (data.nextHabitId++);
  data.habits.push({ id, name: 'New Goal' });
  saveData();
  renderHabitEditList();
  renderAll();
});

document.getElementById('resetMonthBtn').addEventListener('click', () => {
  if (confirm('Clear all check marks, mental state, and motivation entries for this month? This cannot be undone.')) {
    data.days = {};
    saveData();
    renderAll();
  }
});

document.getElementById('exportBtn').addEventListener('click', () => {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `discipline-tracker-${data.currentMonth}.json`;
  a.click();
  URL.revokeObjectURL(url);
});

document.getElementById('importBtn').addEventListener('click', () => {
  document.getElementById('importFile').click();
});

document.getElementById('importFile').addEventListener('change', e => {
  const file = e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const imported = JSON.parse(reader.result);
      if (!imported.habits || !imported.days) throw new Error('File is missing expected fields');
      if (!imported.history) imported.history = {};
      if (!imported.nextHabitId) imported.nextHabitId = imported.habits.length + 1;
      data = imported;
      ensureCurrentMonth(data);
      viewMonth = 'current';
      saveData();
      renderAll();
    } catch (err) {
      alert('Could not import file: ' + err.message);
    }
  };
  reader.readAsText(file);
  e.target.value = '';
});

let resizeTimer = null;
window.addEventListener('resize', () => {
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(() => {
    renderBarCharts();
    renderComparisonCharts();
  }, 150);
});

/* ============================================================
   Init
   ============================================================ */

let data = loadData();
ensureCurrentMonth(data);
saveData();
let viewMonth = 'current';

renderAll();
