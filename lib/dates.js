// Due dates are wall-clock strings like "2026-11-20T23:59" (the format of a
// datetime-local input). These helpers keep them free of timezone conversion.

const WALL_CLOCK = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/;

// A Date as a wall-clock string in the server's timezone.
function toWallClock(date = new Date()) {
  const pad = (n) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
    + `T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

// True for a real date and time; rejects impossible ones like February 31.
function isValidDue(value) {
  if (typeof value !== 'string' || !WALL_CLOCK.test(value)) return false;
  const date = new Date(`${value}Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 16) === value;
}

// "2026-11-20T23:59" -> "Fri, Nov 20, 11:59 PM"
function formatDue(value) {
  return new Date(`${value.slice(0, 16)}Z`).toLocaleString('en-US', {
    timeZone: 'UTC',
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

module.exports = { toWallClock, isValidDue, formatDue };
