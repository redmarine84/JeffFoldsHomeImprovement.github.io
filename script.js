document.addEventListener('DOMContentLoaded', () => {
  const menuButton = document.querySelector('.menu-toggle');
  const nav = document.querySelector('.site-nav');
  const form = document.getElementById('estimateForm');
  const status = document.getElementById('formStatus');
  const email = window.SITE_CONFIG?.businessEmail || '';

  document.getElementById('year').textContent = new Date().getFullYear();

  menuButton.addEventListener('click', () => {
    const open = nav.classList.toggle('open');
    menuButton.setAttribute('aria-expanded', String(open));
    menuButton.textContent = open ? '✕' : '☰';
  });

  nav.querySelectorAll('a').forEach(link => link.addEventListener('click', () => {
    nav.classList.remove('open');
    menuButton.setAttribute('aria-expanded', 'false');
    menuButton.textContent = '☰';
  }));

  const emailReady = email && !email.includes('CHANGE-ME');
  if (emailReady) {
    form.action = `https://formsubmit.co/${encodeURIComponent(email)}`;
  }

  form.addEventListener('submit', event => {
    if (!emailReady) {
      event.preventDefault();
      status.textContent = 'Online email requests are not active yet. Please call or text Jeff at (334) 332-3727.';
      status.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    } else {
      status.textContent = 'Sending your request…';
    }
  });
});
