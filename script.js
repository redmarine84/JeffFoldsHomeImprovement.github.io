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


async function loadDynamicGallery() {
  const section = document.getElementById('latestUploads');
  const grid = document.getElementById('dynamicGallery');
  if (!section || !grid) return;

  try {
    const response = await fetch(`gallery.json?v=${Date.now()}`, { cache: 'no-store' });
    if (!response.ok) return;
    const data = await response.json();
    const photos = Array.isArray(data.photos) ? data.photos : [];
    if (!photos.length) return;

    const fragment = document.createDocumentFragment();
    photos.forEach((photo, index) => {
      if (!photo || !photo.path) return;
      const link = document.createElement('a');
      link.className = 'photo-thumb uploaded-photo';
      link.href = photo.path;
      link.target = '_blank';
      link.rel = 'noopener';
      link.setAttribute('aria-label', `Open larger photo: ${photo.title || 'Recent project'}`);

      const image = document.createElement('img');
      image.src = photo.path;
      image.alt = photo.title || `Jeff Folds home improvement project ${index + 1}`;
      image.loading = 'lazy';
      image.decoding = 'async';
      link.appendChild(image);

      if (photo.title) {
        const caption = document.createElement('span');
        caption.className = 'photo-caption';
        caption.textContent = photo.title;
        link.appendChild(caption);
      }
      fragment.appendChild(link);
    });

    grid.appendChild(fragment);
    section.hidden = false;
  } catch (error) {
    console.warn('The latest project gallery could not be loaded.', error);
  }
}

document.addEventListener('DOMContentLoaded', loadDynamicGallery);
