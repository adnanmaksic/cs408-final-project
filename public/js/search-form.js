// Assignment Search: once a course is picked, only offer that course's categories.
(function () {
  const course = document.getElementById('course_id');
  const category = document.getElementById('category_id');
  if (!course || !category) return;

  function syncCategories() {
    Array.from(category.options).forEach((option) => {
      if (!option.value) return;
      const show = !course.value || option.dataset.course === course.value;
      option.hidden = !show;
      option.disabled = !show;
    });
    const selected = category.selectedOptions[0];
    if (selected && selected.disabled) category.value = '';
  }

  course.addEventListener('change', syncCategories);
  syncCategories();
})();
