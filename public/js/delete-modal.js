// Fills the "Delete ...?" modals from the data-* attributes of the Delete button that was clicked.
(function () {
  const courseModal = document.getElementById('deleteCourseModal');
  if (courseModal) {
    courseModal.addEventListener('show.bs.modal', (event) => {
      const button = event.relatedTarget;
      const categories = Number(button.dataset.courseCategories || 0);
      const assignments = Number(button.dataset.courseAssignments || 0);
      const count = (n, one, many) => `${n} ${n === 1 ? one : many}`;

      courseModal.querySelector('[data-field="name"]').textContent = button.dataset.courseName;
      courseModal.querySelector('[data-field="form"]').action = button.dataset.courseAction;
      courseModal.querySelector('[data-field="details"]').textContent =
        `This also deletes its ${count(categories, 'grading category', 'grading categories')} ` +
        `and ${count(assignments, 'assignment', 'assignments')}. This can't be undone.`;
    });
  }

  const assignmentModal = document.getElementById('deleteAssignmentModal');
  if (assignmentModal) {
    assignmentModal.addEventListener('show.bs.modal', (event) => {
      const button = event.relatedTarget;
      assignmentModal.querySelector('[data-field="name"]').textContent = button.dataset.deleteName;
      assignmentModal.querySelector('[data-field="form"]').action = button.dataset.deleteAction;
      // Search results and the dashboard ask to come back to the same page.
      assignmentModal.querySelector('[data-field="return"]').value = button.dataset.returnTo || '';
    });
  }
})();
