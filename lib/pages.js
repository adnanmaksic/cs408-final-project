// Every page in the app. `checkpoint` marks pages that are planned but not
// built yet; they show a placeholder until that checkpoint replaces them.
// `nav: true` puts the page in the navbar; `auth: true` requires logging in.
module.exports = [
  { title: 'Home', path: '/', icon: 'house', nav: true },
  { title: 'Dashboard', path: '/dashboard', icon: 'speedometer2', nav: true, auth: true },
  { title: 'Courses', path: '/courses', icon: 'journal-bookmark', nav: true, auth: true },
  { title: 'Add Course', path: '/courses/new', icon: 'plus-square', auth: true },
  { title: 'Add Assignment', path: '/assignments/new', icon: 'list-check', auth: true, checkpoint: 4 },
  { title: 'Search', path: '/assignments/search', icon: 'search', nav: true, auth: true, checkpoint: 6 },
  { title: 'About', path: '/about', icon: 'info-circle', nav: true },
  { title: 'Log In', path: '/login', icon: 'box-arrow-in-right' },
  { title: 'Register', path: '/register', icon: 'person-plus' },
];
