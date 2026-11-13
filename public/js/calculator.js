// Grade Calculator: recalculates as you type, using the same lib/grades.js
// the server uses. Without JavaScript the Calculate button does the same thing.
(function () {
  const form = document.getElementById('calculator');
  const dataEl = document.getElementById('calcData');
  if (!form || !dataEl || !window.Grades) return;

  const G = window.Grades;
  const data = JSON.parse(dataEl.textContent);
  const target = document.getElementById('target');
  const percentEl = document.getElementById('whatIfPercent');
  const letterEl = document.getElementById('whatIfLetter');
  const noteEl = document.getElementById('whatIfNote');
  const neededEl = document.getElementById('neededText');
  const box = form.querySelector('.needed-box');
  const STATUSES = ['reachable', 'secured', 'unreachable', 'complete', 'unknown'];

  function update() {
    const whatIf = {};
    form.querySelectorAll('.what-if').forEach((input) => {
      const n = parseFloat(input.value);
      const valid = input.value.trim() === '' || (Number.isFinite(n) && n >= 0);
      input.classList.toggle('is-invalid', !valid);
      if (input.value.trim() !== '' && valid) whatIf[input.dataset.assignmentId] = n;
    });

    const t = parseFloat(target.value);
    const targetOk = Number.isFinite(t) && t >= 0 && t <= 100;
    target.classList.toggle('is-invalid', target.value.trim() !== '' && !targetOk);
    if (!targetOk) return;

    const result = G.summarize({
      categories: data.categories,
      assignments: data.assignments,
      target: t,
      scale: data.scale,
      whatIf,
    });

    const used = result.whatIfCount > 0;
    percentEl.textContent = used ? G.formatPercent(result.percent) : '—';
    letterEl.textContent = result.letter || '';
    letterEl.classList.toggle('d-none', !used || !result.letter);
    noteEl.textContent = used
      ? `Using ${result.whatIfCount} what-if score${result.whatIfCount === 1 ? '' : 's'}.`
      : 'Type scores below to try them out.';
    neededEl.textContent = result.neededText;
    STATUSES.forEach((s) => box.classList.remove(`needed-${s}`));
    box.classList.add(`needed-${result.needed.status}`);
  }

  form.addEventListener('input', update);
})();
