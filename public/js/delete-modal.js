// Fills the shared "Delete course?" modal with the course whose Delete button was clicked.
(function () {
  const modal = document.getElementById('deleteCourseModal');
  if (!modal) return;

  modal.addEventListener('show.bs.modal', (event) => {
    const button = event.relatedTarget;
    const categories = Number(button.dataset.courseCategories || 0);
    const assignments = Number(button.dataset.courseAssignments || 0);
    const count = (n, one, many) => `${n} ${n === 1 ? one : many}`;

    modal.querySelector('[data-field="name"]').textContent = button.dataset.courseName;
    modal.querySelector('[data-field="form"]').action = button.dataset.courseAction;
    modal.querySelector('[data-field="details"]').textContent =
      `This also deletes its ${count(categories, 'grading category', 'grading categories')} ` +
      `and ${count(assignments, 'assignment', 'assignments')}. This can't be undone.`;
  });
})();
