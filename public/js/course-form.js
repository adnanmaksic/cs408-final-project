// Add/Edit Course: add and remove category rows, and keep a running weight total.
(function () {
  const rows = document.getElementById('categoryRows');
  const template = document.getElementById('categoryRowTemplate');
  const addButton = document.getElementById('addCategory');
  const totalBadge = document.getElementById('weightTotal');
  if (!rows || !template) return;

  function updateTotal() {
    let total = 0;
    rows.querySelectorAll('.category-weight').forEach((input) => {
      const n = parseFloat(input.value);
      if (Number.isFinite(n)) total += n;
    });
    total = Math.round(total * 100) / 100;
    const ok = Math.abs(total - 100) < 0.001;
    totalBadge.textContent = `Total: ${total}%`;
    totalBadge.className = `badge rounded-pill ${ok ? 'text-bg-success' : 'text-bg-warning'}`;
  }

  addButton.addEventListener('click', () => {
    rows.appendChild(template.content.cloneNode(true));
    rows.lastElementChild.querySelector('input[name="category_name"]').focus();
    updateTotal();
  });

  rows.addEventListener('click', (event) => {
    const button = event.target.closest('[data-remove-category]');
    if (!button) return;
    const row = button.closest('.category-row');
    if (rows.querySelectorAll('.category-row').length > 1) {
      row.remove();
    } else {
      row.querySelectorAll('input:not([type="hidden"])').forEach((input) => { input.value = ''; });
    }
    updateTotal();
  });

  rows.addEventListener('input', updateTotal);
  updateTotal();
})();
