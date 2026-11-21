// Every page in the app, for the navbar and the landing page's quick links.
// `nav: true` puts the page in the navbar; `auth: true` requires logging in.
module.exports = [
  { title: 'Home', path: '/', icon: 'house', nav: true },
  { title: 'Dashboard', path: '/dashboard', icon: 'speedometer2', nav: true, auth: true },
  { title: 'Courses', path: '/courses', icon: 'journal-bookmark', nav: true, auth: true },
  { title: 'Add Course', path: '/courses/new', icon: 'plus-square', auth: true },
  { title: 'Add Assignment', path: '/assignments/new', icon: 'list-check', auth: true },
  { title: 'Search', path: '/assignments/search', icon: 'search', nav: true, auth: true },
  { title: 'About', path: '/about', icon: 'info-circle', nav: true },
  { title: 'Log In', path: '/login', icon: 'box-arrow-in-right' },
  { title: 'Register', path: '/register', icon: 'person-plus' },
];
