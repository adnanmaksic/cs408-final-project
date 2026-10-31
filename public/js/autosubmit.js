// Submits a filter form as soon as a [data-autosubmit] dropdown changes.
document.querySelectorAll('[data-autosubmit]').forEach((select) => {
  select.addEventListener('change', () => select.form.submit());
});
