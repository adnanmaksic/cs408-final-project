// Every page in the app. `checkpoint` marks pages that are planned but not
// built yet; they show a placeholder until that checkpoint replaces them.
// `nav: true` puts the page in the navbar.
module.exports = [
  { title: 'Home', path: '/', icon: 'house', nav: true },
  { title: 'Dashboard', path: '/dashboard', icon: 'speedometer2', nav: true, checkpoint: 6 },
  { title: 'Courses', path: '/courses', icon: 'journal-bookmark', nav: true, checkpoint: 3 },
  { title: 'Add Course', path: '/courses/new', icon: 'plus-square', checkpoint: 3 },
  { title: 'Add Assignment', path: '/assignments/new', icon: 'list-check', checkpoint: 4 },
  { title: 'Search', path: '/assignments/search', icon: 'search', nav: true, checkpoint: 6 },
  { title: 'About', path: '/about', icon: 'info-circle', nav: true },
  { title: 'Log In', path: '/login', icon: 'box-arrow-in-right', checkpoint: 2 },
  { title: 'Register', path: '/register', icon: 'person-plus', checkpoint: 2 },
];
