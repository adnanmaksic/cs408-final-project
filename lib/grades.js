// Grade math: weighted course grade, letter grade and the score needed on
// remaining work. Pure functions with no database access, so the same file
// runs on the server (require) and in the browser (/js/grades.js) for the
// Grade Calculator's live what-if updates.
//
// Inputs use the database's shapes:
//   categories:  [{ id, name, weight }]           weights total 100
//   assignments: [{ id, category_id, points_possible, points_earned }]
//                points_earned is null until the work is graded
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.Grades = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  // Standard scale from the spec. Each letter is earned at or above `min`.
  const DEFAULT_SCALE = Object.freeze([
    { letter: 'A', min: 93 },
    { letter: 'A-', min: 90 },
    { letter: 'B+', min: 87 },
    { letter: 'B', min: 83 },
    { letter: 'B-', min: 80 },
    { letter: 'C+', min: 77 },
    { letter: 'C', min: 73 },
    { letter: 'C-', min: 70 },
    { letter: 'D+', min: 67 },
    { letter: 'D', min: 63 },
    { letter: 'D-', min: 60 },
    { letter: 'F', min: 0 },
  ]);

  // Letters a course can set cutoffs for (F is always everything below D-).
  const SCALE_LETTERS = DEFAULT_SCALE.slice(0, -1).map((s) => s.letter);

  const EPSILON = 1e-9;

  function round(n, places = 2) {
    const f = 10 ** places;
    return Math.round((n + Number.EPSILON) * f) / f;
  }

  // "83.75%", "90%", or an em dash when there is no grade yet.
  function formatPercent(n) {
    return n === null || n === undefined || !Number.isFinite(n) ? '—' : `${round(n)}%`;
  }

  function isGraded(a) {
    return a.points_earned !== null && a.points_earned !== undefined && a.points_earned !== '';
  }

  // Puts what-if scores ({ [assignmentId]: pointsEarned }) on ungraded items.
  // Real grades are never replaced. Returns new objects; inputs are unchanged.
  function applyWhatIf(assignments, whatIf = {}) {
    return assignments.map((a) => {
      const value = whatIf[a.id];
      if (isGraded(a) || value === undefined || value === null || value === '') return a;
      const n = Number(value);
      if (!Number.isFinite(n) || n < 0) return a;
      return { ...a, points_earned: n, whatIf: true };
    });
  }

  // Per-category totals. `percent` is earned ÷ possible over graded items,
  // or null when nothing in the category is graded (or it has 0 points possible).
  function categoryGrades(categories, assignments) {
    return categories.map((cat) => {
      let earned = 0;
      let possible = 0;
      let remaining = 0;
      let graded = 0;
      let ungraded = 0;
      for (const a of assignments) {
        if (a.category_id !== cat.id) continue;
        if (isGraded(a)) {
          earned += Number(a.points_earned);
          possible += Number(a.points_possible);
          graded += 1;
        } else {
          remaining += Number(a.points_possible);
          ungraded += 1;
        }
      }
      return {
        ...cat,
        earned,
        possible,
        remaining,
        graded,
        ungraded,
        percent: possible > 0 ? (earned / possible) * 100 : null,
      };
    });
  }

  // Current grade: each category's weight × its percent, counting only graded
  // items, rescaled to the categories that have grades so far.
  function currentGrade(categories, assignments) {
    const cats = categoryGrades(categories, assignments);
    let weighted = 0;
    let weight = 0;
    for (const c of cats) {
      if (c.percent === null) continue;
      weighted += c.weight * c.percent;
      weight += c.weight;
    }
    return { percent: weight > 0 ? weighted / weight : null, gradedWeight: weight, categories: cats };
  }

  // Average percentage needed on all remaining work to finish at `target`.
  // Remaining work is every ungraded item, plus the whole weight of any
  // category with nothing entered yet (e.g. a final exam not added yet).
  // If every remaining point is scored at x%, the final grade is base + slope × x.
  function neededScore(categories, assignments, target) {
    const cats = categoryGrades(categories, assignments);
    const totalWeight = cats.reduce((sum, c) => sum + c.weight, 0);
    if (!(totalWeight > 0) || !Number.isFinite(target)) {
      return { status: 'unknown', needed: null, min: null, max: null, remainingWeight: 0 };
    }

    let base = 0;
    let slope = 0;
    for (const c of cats) {
      const share = c.weight / totalWeight;
      const total = c.possible + c.remaining;
      if (total > 0) {
        base += share * (c.earned / total) * 100;
        slope += share * (c.remaining / total);
      } else {
        slope += share;
      }
    }

    const min = base;
    const max = base + slope * 100;
    const remainingWeight = slope * 100;
    if (slope <= EPSILON) {
      return { status: 'complete', needed: null, min, max, remainingWeight: 0 };
    }

    const needed = (target - base) / slope;
    let status = 'reachable';
    if (needed > 100 + EPSILON) status = 'unreachable';
    else if (needed <= EPSILON) status = 'secured';
    return { status, needed, min, max, remainingWeight };
  }

  // Letter for a percentage. Compared at 2 decimals, the precision the app
  // displays, so "93%" on screen is always an A on the default scale.
  function letterGrade(percent, scale = DEFAULT_SCALE) {
    if (percent === null || percent === undefined || !Number.isFinite(percent)) return null;
    const p = round(percent);
    const sorted = [...scale].sort((a, b) => b.min - a.min);
    for (const step of sorted) {
      if (p >= step.min) return step.letter;
    }
    return sorted.length ? sorted[sorted.length - 1].letter : null;
  }

  // Checks cutoffs for SCALE_LETTERS (A down to D-). Returns an error message or null.
  function checkScale(mins) {
    if (!Array.isArray(mins) || mins.length !== SCALE_LETTERS.length) {
      return `Enter a cutoff for each letter from ${SCALE_LETTERS[0]} to ${SCALE_LETTERS[SCALE_LETTERS.length - 1]}.`;
    }
    for (let i = 0; i < mins.length; i += 1) {
      const n = mins[i];
      if (!Number.isFinite(n) || n <= 0 || n > 100) {
        return `The ${SCALE_LETTERS[i]} cutoff must be a number above 0 and up to 100.`;
      }
      if (i > 0 && n >= mins[i - 1]) {
        return `The ${SCALE_LETTERS[i]} cutoff must be lower than the ${SCALE_LETTERS[i - 1]} cutoff.`;
      }
    }
    return null;
  }

  // Builds a full scale (with F at 0) from cutoffs for A down to D-.
  function buildScale(mins) {
    return [...SCALE_LETTERS.map((letter, i) => ({ letter, min: mins[i] })), { letter: 'F', min: 0 }];
  }

  // A course's stored scale (JSON list of cutoffs, A down to D-) or the default.
  function parseScale(stored) {
    if (!stored) return DEFAULT_SCALE;
    try {
      const mins = JSON.parse(stored);
      return checkScale(mins) ? DEFAULT_SCALE : buildScale(mins);
    } catch (err) {
      return DEFAULT_SCALE;
    }
  }

  // One sentence explaining a neededScore() result.
  function describeNeeded(result, target) {
    const goal = formatPercent(target);
    switch (result.status) {
      case 'reachable':
        return `You need an average of ${formatPercent(result.needed)} on the remaining work to reach ${goal}.`;
      case 'secured':
        return `You'll reach ${goal} even with 0% on the remaining work.`;
      case 'unreachable':
        return `${goal} is out of reach: even 100% on the remaining work ends at ${formatPercent(result.max)}.`;
      case 'complete':
        return `Everything is graded. Your final grade is ${formatPercent(result.min)}.`;
      default:
        return 'Add grading categories to work out the score you need.';
    }
  }

  // Everything a page needs about one course's grade.
  function summarize({ categories, assignments, target, scale = DEFAULT_SCALE, whatIf = {} }) {
    const scored = applyWhatIf(assignments, whatIf);
    const current = currentGrade(categories, scored);
    const needed = neededScore(categories, scored, target);
    return {
      percent: current.percent,
      letter: letterGrade(current.percent, scale),
      gradedWeight: current.gradedWeight,
      categories: current.categories,
      needed,
      neededText: describeNeeded(needed, target),
      whatIfCount: scored.filter((a) => a.whatIf).length,
    };
  }

  return {
    DEFAULT_SCALE,
    SCALE_LETTERS,
    round,
    formatPercent,
    isGraded,
    applyWhatIf,
    categoryGrades,
    currentGrade,
    neededScore,
    letterGrade,
    checkScale,
    buildScale,
    parseScale,
    describeNeeded,
    summarize,
  };
});
