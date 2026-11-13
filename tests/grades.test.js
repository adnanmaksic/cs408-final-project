// Unit tests for the grade math in lib/grades.js.
const G = require('../lib/grades');

// Builds categories and assignments from a compact description:
//   { Homework: [30, [[18, 20], [null, 20]]] }  -> weight 30, one graded, one ungraded
function course(spec) {
  const categories = [];
  const assignments = [];
  let nextId = 1;
  Object.entries(spec).forEach(([name, [weight, items]], i) => {
    const catId = i + 1;
    categories.push({ id: catId, name, weight });
    for (const [earned, possible] of items) {
      assignments.push({ id: nextId++, category_id: catId, points_earned: earned, points_possible: possible });
    }
  });
  return { categories, assignments };
}

describe('worked example: About page (Homework 30%, Exams 50%, Final 20%)', () => {
  // Homework at 90%, Exams at 80%, Final not taken:
  // (0.30 × 90 + 0.50 × 80) ÷ (0.30 + 0.50) = 67 ÷ 0.80 = 83.75%
  const { categories, assignments } = course({
    Homework: [30, [[18, 20], [27, 30]]],
    Exams: [50, [[80, 100]]],
    Final: [20, []],
  });

  test('category grades', () => {
    const cats = G.categoryGrades(categories, assignments);
    expect(cats.map((c) => c.percent)).toEqual([90, 80, null]);
    expect(cats[0]).toMatchObject({ earned: 45, possible: 50, graded: 2, ungraded: 0 });
  });

  test('current grade is rescaled to the categories with grades', () => {
    const { percent, gradedWeight } = G.currentGrade(categories, assignments);
    expect(percent).toBeCloseTo(83.75, 10);
    expect(gradedWeight).toBe(80);
    expect(G.letterGrade(percent)).toBe('B');
  });

  test('the Final with nothing entered counts as remaining work', () => {
    // Locked in: 0.30 × 90 + 0.50 × 80 = 67, and the Final is the other 20%.
    const r = G.neededScore(categories, assignments, 85);
    expect(r.status).toBe('reachable');
    expect(r.needed).toBeCloseTo(90, 10); // 67 + 0.20 × 90 = 85
    expect(r.min).toBeCloseTo(67, 10);
    expect(r.max).toBeCloseTo(87, 10);
    expect(r.remainingWeight).toBeCloseTo(20, 10);
  });

  test('a target above the maximum is out of reach', () => {
    const r = G.neededScore(categories, assignments, 90);
    expect(r.status).toBe('unreachable');
    expect(r.needed).toBeCloseTo(115, 10);
    expect(G.describeNeeded(r, 90)).toBe('90% is out of reach: even 100% on the remaining work ends at 87%.');
  });

  test('ungraded items inside a category share its weight', () => {
    // A second 100-point exam is still to come: Exams is 80/200 so far.
    const more = course({
      Homework: [30, [[18, 20], [27, 30]]],
      Exams: [50, [[80, 100], [null, 100]]],
      Final: [20, []],
    });
    const r = G.neededScore(more.categories, more.assignments, 80);
    // base = 27 + 0.5 × 40 = 47, slope = 0.5 × 0.5 + 0.2 = 0.45, (80 - 47) ÷ 0.45
    expect(r.needed).toBeCloseTo(73.3333333, 6);
    // Check it: scoring that on everything left gives exactly 80%.
    const x = r.needed;
    expect(27 + 0.5 * ((80 + x) / 200) * 100 + 0.2 * x).toBeCloseTo(80, 10);
  });
});

describe('worked example: CS 408 checkpoint rubric (Tag 5, Live 5, Progress 10, Demo 10, two peer reviews 10 each)', () => {
  // One checkpoint is 50 points. Everything graded except the second peer review.
  const { categories, assignments } = course({
    'Checkpoint 5': [100, [[5, 5], [5, 5], [5, 10], [10, 10], [10, 10], [null, 10]]],
  });

  test('current grade is points earned over points graded', () => {
    const { percent } = G.currentGrade(categories, assignments);
    expect(percent).toBeCloseTo(87.5, 10); // 35 / 40
    expect(G.letterGrade(percent)).toBe('B+');
  });

  test('reaching 90% needs exactly full marks on the last review', () => {
    const r = G.neededScore(categories, assignments, 90);
    expect(r.status).toBe('reachable');
    expect(r.needed).toBeCloseTo(100, 10); // (35 + 10) / 50 = 90%
  });

  test('93% is out of reach', () => {
    const r = G.neededScore(categories, assignments, 93);
    expect(r.status).toBe('unreachable');
    expect(r.max).toBeCloseTo(90, 10);
  });

  test('a what-if score on the last review gives the final grade', () => {
    const s = G.summarize({ categories, assignments, target: 90, whatIf: { 6: 5 } });
    expect(s.percent).toBeCloseTo(80, 10); // 40 / 50
    expect(s.letter).toBe('B-');
    expect(s.whatIfCount).toBe(1);
    expect(s.needed.status).toBe('complete');
    expect(s.neededText).toBe('Everything is graded. Your final grade is 80%.');
  });
});

describe('categories with no grades yet', () => {
  test('a course with nothing graded has no grade or letter', () => {
    const { categories, assignments } = course({ Homework: [40, [[null, 10]]], Exams: [60, []] });
    const s = G.summarize({ categories, assignments, target: 90 });
    expect(s.percent).toBeNull();
    expect(s.letter).toBeNull();
    expect(s.needed.status).toBe('reachable');
    expect(s.needed.needed).toBeCloseTo(90, 10); // everything is still to come
  });

  test('a category with no grades does not drag the grade down', () => {
    const { categories, assignments } = course({ Homework: [40, [[10, 10]]], Exams: [60, [[null, 100]]] });
    expect(G.currentGrade(categories, assignments).percent).toBe(100);
  });

  test('a course with no categories has nothing to work out', () => {
    const r = G.neededScore([], [], 90);
    expect(r.status).toBe('unknown');
    expect(G.describeNeeded(r, 90)).toBe('Add grading categories to work out the score you need.');
  });
});

describe('needed score', () => {
  test('a target you already have locked in needs 0%', () => {
    const { categories, assignments } = course({ All: [100, [[90, 100], [null, 10]]] });
    const r = G.neededScore(categories, assignments, 70);
    expect(r.status).toBe('secured');
    expect(r.needed).toBeLessThanOrEqual(0);
    expect(G.describeNeeded(r, 70)).toBe("You'll reach 70% even with 0% on the remaining work.");
  });

  test('describes the average needed', () => {
    const { categories, assignments } = course({ All: [100, [[40, 50], [null, 50]]] });
    const r = G.neededScore(categories, assignments, 85);
    expect(r.needed).toBeCloseTo(90, 10);
    expect(G.describeNeeded(r, 85)).toBe('You need an average of 90% on the remaining work to reach 85%.');
  });

  test('when everything is graded, the final grade is fixed', () => {
    const { categories, assignments } = course({ A: [50, [[8, 10]]], B: [50, [[10, 10]]] });
    const r = G.neededScore(categories, assignments, 95);
    expect(r).toMatchObject({ status: 'complete', needed: null });
    expect(r.min).toBeCloseTo(90, 10);
  });
});

describe('letter grades', () => {
  test.each([
    [100, 'A'], [93, 'A'], [92.99, 'A-'], [90, 'A-'], [89.99, 'B+'], [87, 'B+'], [83, 'B'], [80, 'B-'],
    [77, 'C+'], [73, 'C'], [70, 'C-'], [67, 'D+'], [63, 'D'], [60, 'D-'], [59.99, 'F'], [0, 'F'], [-5, 'F'],
  ])('%p%% is %s on the standard scale', (percent, letter) => {
    expect(G.letterGrade(percent)).toBe(letter);
  });

  test('compares at the 2 decimals shown on screen', () => {
    expect(G.formatPercent(92.996)).toBe('93%');
    expect(G.letterGrade(92.996)).toBe('A');
    expect(G.letterGrade(92.994)).toBe('A-');
  });

  test('no grade means no letter', () => {
    expect(G.letterGrade(null)).toBeNull();
    expect(G.letterGrade(NaN)).toBeNull();
  });

  test('a course can use its own cutoffs', () => {
    const scale = G.buildScale([90, 88, 86, 80, 78, 76, 70, 68, 66, 60, 58]);
    expect(G.letterGrade(90, scale)).toBe('A');
    expect(G.letterGrade(89, scale)).toBe('A-');
    expect(G.letterGrade(58, scale)).toBe('D-');
    expect(G.letterGrade(57.9, scale)).toBe('F');
  });

  test('checkScale rejects missing, out-of-range and out-of-order cutoffs', () => {
    const good = [93, 90, 87, 83, 80, 77, 73, 70, 67, 63, 60];
    expect(G.checkScale(good)).toBeNull();
    expect(G.checkScale(good.slice(1))).toMatch(/each letter/);
    expect(G.checkScale([101, ...good.slice(1)])).toMatch(/A cutoff must be a number above 0/);
    expect(G.checkScale([...good.slice(0, 10), 0])).toMatch(/D- cutoff/);
    expect(G.checkScale([93, 95, ...good.slice(2)])).toBe('The A- cutoff must be lower than the A cutoff.');
    expect(G.checkScale([93, NaN, ...good.slice(2)])).toMatch(/A- cutoff/);
  });

  test('parseScale falls back to the standard scale for missing or bad data', () => {
    expect(G.parseScale(null)).toBe(G.DEFAULT_SCALE);
    expect(G.parseScale('not json')).toBe(G.DEFAULT_SCALE);
    expect(G.parseScale('[1,2,3]')).toBe(G.DEFAULT_SCALE);
    const custom = G.parseScale(JSON.stringify([90, 88, 86, 80, 78, 76, 70, 68, 66, 60, 58]));
    expect(custom[0]).toEqual({ letter: 'A', min: 90 });
    expect(custom[custom.length - 1]).toEqual({ letter: 'F', min: 0 });
  });
});

describe('edge cases', () => {
  test('a category whose only graded work is worth 0 points has no grade', () => {
    const { categories, assignments } = course({ Participation: [10, [[0, 0]]], Exams: [90, [[45, 50]]] });
    const cats = G.categoryGrades(categories, assignments);
    expect(cats[0].percent).toBeNull();
    expect(G.currentGrade(categories, assignments).percent).toBeCloseTo(90, 10);
  });

  test('extra credit worth 0 points possible still adds points', () => {
    const { categories, assignments } = course({ Homework: [100, [[10, 10], [2, 0]]] });
    expect(G.currentGrade(categories, assignments).percent).toBeCloseTo(120, 10);
  });

  test('scores can be decimals', () => {
    const { categories, assignments } = course({ Quizzes: [100, [[7.5, 10], [9.25, 10]]] });
    expect(G.currentGrade(categories, assignments).percent).toBeCloseTo(83.75, 10);
  });

  test('what-if scores never replace real grades and ignore bad input', () => {
    const { assignments } = course({ A: [100, [[5, 10], [null, 10], [null, 10], [null, 10]]] });
    const out = G.applyWhatIf(assignments, { 1: 10, 2: 8, 3: -1, 4: 'abc' });
    expect(out.map((a) => a.points_earned)).toEqual([5, 8, null, null]);
    expect(out[1].whatIf).toBe(true);
    expect(assignments[1].points_earned).toBeNull(); // input left unchanged
  });

  test('formatPercent rounds to 2 decimals and shows a dash for no grade', () => {
    expect(G.formatPercent(83.75)).toBe('83.75%');
    expect(G.formatPercent(73.33333)).toBe('73.33%');
    expect(G.formatPercent(90)).toBe('90%');
    expect(G.formatPercent(null)).toBe('—');
  });
});
