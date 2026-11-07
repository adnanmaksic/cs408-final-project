// Add/Edit Assignment: only offer categories from the chosen course.
(function () {
  const course = document.getElementById('course_id');
  const category = document.getElementById('category_id');
  if (!course || !category) return;

  function syncCategories() {
    const options = Array.from(category.options).filter((o) => o.value);
    options.forEach((option) => {
      const matches = option.dataset.course === course.value;
      option.hidden = !matches;
      option.disabled = !matches;
    });
    const selected = category.selectedOptions[0];
    if (selected && selected.disabled) category.value = '';

    const available = options.filter((o) => !o.disabled);
    if (!category.value && available.length === 1) category.value = available[0].value;
  }

  course.addEventListener('change', syncCategories);
  syncCategories();
})();
