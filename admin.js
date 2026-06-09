'use strict';

const REPOSITORY = { owner: 'redmarine84', repo: 'JeffFoldsHomeImprovement.github.io' };
const API_ROOT = 'https://api.github.com';
const TOKEN_KEY = 'jeff-folds-github-token';

const loginPanel = document.getElementById('loginPanel');
const uploadPanel = document.getElementById('uploadPanel');
const loginForm = document.getElementById('loginForm');
const uploadForm = document.getElementById('uploadForm');
const tokenInput = document.getElementById('tokenInput');
const loginStatus = document.getElementById('loginStatus');
const uploadStatus = document.getElementById('uploadStatus');
const accountSummary = document.getElementById('accountSummary');
const photoInput = document.getElementById('photoInput');
const titleInput = document.getElementById('titleInput');
const previewGrid = document.getElementById('previewGrid');
const publishButton = document.getElementById('publishButton');
const progressWrap = document.getElementById('progressWrap');
const progressBar = document.getElementById('progressBar');
const photoLibrary = document.getElementById('photoLibrary');
const libraryStatus = document.getElementById('libraryStatus');
const refreshLibraryButton = document.getElementById('refreshLibraryButton');
let session = null;

function setStatus(element, message, type = '') {
  element.textContent = message;
  element.className = `form-status ${type}`.trim();
}

async function github(path, options = {}) {
  if (!session?.token) throw new Error('Please sign in again.');
  const response = await fetch(`${API_ROOT}${path}`, {
    ...options,
    headers: {
      Accept: 'application/vnd.github+json',
      Authorization: `Bearer ${session.token}`,
      'X-GitHub-Api-Version': '2022-11-28',
      ...(options.headers || {})
    }
  });
  const data = response.status === 204 ? null : await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data?.message || `GitHub returned ${response.status}.`);
  return data;
}

async function authenticate(token) {
  session = { token: token.trim() };
  const [user, repository] = await Promise.all([
    github('/user'),
    github(`/repos/${REPOSITORY.owner}/${REPOSITORY.repo}`)
  ]);
  if (!repository.permissions?.push) throw new Error('This token does not have write access to the website repository.');
  session.user = user.login;
  session.branch = repository.default_branch || 'main';
  sessionStorage.setItem(TOKEN_KEY, session.token);
  loginPanel.hidden = true;
  uploadPanel.hidden = false;
  accountSummary.textContent = `Signed in as ${user.login}. Publishing to ${REPOSITORY.owner}/${REPOSITORY.repo} on the ${session.branch} branch.`;
  await loadPhotoLibrary();
}

loginForm.addEventListener('submit', async event => {
  event.preventDefault();
  setStatus(loginStatus, 'Checking repository access…');
  try {
    await authenticate(tokenInput.value);
    tokenInput.value = '';
    setStatus(loginStatus, '');
  } catch (error) {
    sessionStorage.removeItem(TOKEN_KEY);
    session = null;
    setStatus(loginStatus, error.message, 'error');
  }
});

document.getElementById('logoutButton').addEventListener('click', () => {
  sessionStorage.removeItem(TOKEN_KEY);
  session = null;
  uploadPanel.hidden = true;
  loginPanel.hidden = false;
  uploadForm.reset();
  previewGrid.replaceChildren();
  setStatus(uploadStatus, '');
});

photoInput.addEventListener('change', () => {
  previewGrid.replaceChildren();
  [...photoInput.files].forEach(file => {
    const card = document.createElement('div');
    card.className = 'preview-card';
    const image = document.createElement('img');
    image.alt = '';
    image.src = URL.createObjectURL(file);
    image.onload = () => URL.revokeObjectURL(image.src);
    const name = document.createElement('span');
    name.textContent = file.name;
    card.append(image, name);
    previewGrid.appendChild(card);
  });
});

function slugify(value) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60) || 'project';
}

function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error(`Could not read ${file.name}.`));
    reader.readAsDataURL(file);
  });
}

async function optimizeImage(file) {
  const source = await fileToDataUrl(file);
  const image = new Image();
  await new Promise((resolve, reject) => {
    image.onload = resolve;
    image.onerror = () => reject(new Error(`${file.name} is not a valid image.`));
    image.src = source;
  });
  const max = 1800;
  const scale = Math.min(1, max / Math.max(image.naturalWidth, image.naturalHeight));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(image.naturalWidth * scale);
  canvas.height = Math.round(image.naturalHeight * scale);
  canvas.getContext('2d', { alpha: false }).drawImage(image, 0, 0, canvas.width, canvas.height);
  const dataUrl = canvas.toDataURL('image/jpeg', 0.84);
  return dataUrl.split(',')[1];
}

async function getRepositoryFile(path) {
  try {
    return await github(`/repos/${REPOSITORY.owner}/${REPOSITORY.repo}/contents/${encodeURI(path)}?ref=${encodeURIComponent(session.branch)}`);
  } catch (error) {
    if (/Not Found/i.test(error.message)) return null;
    throw error;
  }
}

async function putRepositoryFile(path, content, message, sha = undefined) {
  return github(`/repos/${REPOSITORY.owner}/${REPOSITORY.repo}/contents/${encodeURI(path)}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message, content, branch: session.branch, ...(sha ? { sha } : {}) })
  });
}

function utf8ToBase64(value) {
  const bytes = new TextEncoder().encode(value);
  let binary = '';
  bytes.forEach(byte => { binary += String.fromCharCode(byte); });
  return btoa(binary);
}

function decodeGitHubText(content) {
  const binary = atob(content.replace(/\n/g, ''));
  const bytes = Uint8Array.from(binary, char => char.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}


async function deleteRepositoryFile(path, sha, message) {
  return github(`/repos/${REPOSITORY.owner}/${REPOSITORY.repo}/contents/${encodeURI(path)}`, {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message, sha, branch: session.branch })
  });
}

async function readJsonFile(path, fallback) {
  const file = await getRepositoryFile(path);
  if (!file?.content) return { file, data: fallback };
  try { return { file, data: JSON.parse(decodeGitHubText(file.content)) }; }
  catch { return { file, data: fallback }; }
}

async function writeJsonFile(path, data, message) {
  const current = await getRepositoryFile(path);
  return putRepositoryFile(path, utf8ToBase64(JSON.stringify(data, null, 2)), message, current?.sha);
}

async function listRepositoryImages() {
  const rootItems = await github(`/repos/${REPOSITORY.owner}/${REPOSITORY.repo}/contents/assets/images?ref=${encodeURIComponent(session.branch)}`);
  const photos = Array.isArray(rootItems)
    ? rootItems.filter(item => item.type === 'file' && /\.(jpe?g|png|webp|gif)$/i.test(item.name))
    : [];

  try {
    const uploads = await github(`/repos/${REPOSITORY.owner}/${REPOSITORY.repo}/contents/assets/images/uploads?ref=${encodeURIComponent(session.branch)}`);
    if (Array.isArray(uploads)) photos.push(...uploads.filter(item => item.type === 'file' && /\.(jpe?g|png|webp|gif)$/i.test(item.name)));
  } catch (error) {
    if (!/Not Found/i.test(error.message)) throw error;
  }
  return photos.sort((a, b) => a.path.localeCompare(b.path, undefined, { numeric: true }));
}

function createLibraryCard(photo) {
  const card = document.createElement('article');
  card.className = 'library-card';
  card.dataset.path = photo.path;

  const image = document.createElement('img');
  image.src = `${photo.download_url}?v=${Date.now()}`;
  image.alt = photo.name;
  image.loading = 'lazy';

  const body = document.createElement('div');
  body.className = 'library-card-body';
  const title = document.createElement('div');
  title.className = 'library-card-title';
  title.textContent = photo.path.replace('assets/images/', '');

  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'delete-photo-button';
  button.textContent = 'Delete Photo';
  button.addEventListener('click', () => removePhoto(photo, card, button));
  body.append(title, button);
  card.append(image, body);
  return card;
}

async function loadPhotoLibrary() {
  if (!session || !photoLibrary) return;
  setStatus(libraryStatus, 'Loading existing photos…');
  refreshLibraryButton.disabled = true;
  try {
    const photos = await listRepositoryImages();
    photoLibrary.replaceChildren();
    if (!photos.length) {
      const empty = document.createElement('p');
      empty.className = 'library-empty';
      empty.textContent = 'No photos are currently stored in the website repository.';
      photoLibrary.appendChild(empty);
    } else {
      const fragment = document.createDocumentFragment();
      photos.forEach(photo => fragment.appendChild(createLibraryCard(photo)));
      photoLibrary.appendChild(fragment);
    }
    setStatus(libraryStatus, `${photos.length} photo${photos.length === 1 ? '' : 's'} available.`);
  } catch (error) {
    setStatus(libraryStatus, `Could not load photos: ${error.message}`, 'error');
  } finally {
    refreshLibraryButton.disabled = false;
  }
}

async function removePhoto(photo, card, button) {
  const confirmed = window.confirm(`Delete ${photo.path}?\n\nThis removes it from GitHub and from the public website. The action cannot be undone from this page.`);
  if (!confirmed) return;

  button.disabled = true;
  button.textContent = 'Deleting…';
  setStatus(libraryStatus, `Deleting ${photo.name}…`);
  try {
    if (photo.path.startsWith('assets/images/uploads/')) {
      const { data: gallery } = await readJsonFile('gallery.json', { photos: [] });
      gallery.photos = Array.isArray(gallery.photos) ? gallery.photos.filter(item => item?.path !== photo.path) : [];
      await writeJsonFile('gallery.json', gallery, `Remove ${photo.name} from project gallery`);
    } else {
      const { data: deleted } = await readJsonFile('deleted-photos.json', { paths: [] });
      const paths = Array.isArray(deleted.paths) ? deleted.paths : [];
      if (!paths.includes(photo.path)) paths.push(photo.path);
      await writeJsonFile('deleted-photos.json', { paths }, `Hide deleted website photo ${photo.name}`);
    }

    const fresh = await getRepositoryFile(photo.path);
    if (fresh?.sha) await deleteRepositoryFile(photo.path, fresh.sha, `Delete website photo ${photo.name}`);
    card.remove();
    const remaining = photoLibrary.querySelectorAll('.library-card').length;
    setStatus(libraryStatus, `${photo.name} was deleted. ${remaining} photo${remaining === 1 ? '' : 's'} remain. GitHub Pages normally updates within a few minutes.`, 'success');
    if (!remaining) {
      const empty = document.createElement('p');
      empty.className = 'library-empty';
      empty.textContent = 'No photos are currently stored in the website repository.';
      photoLibrary.appendChild(empty);
    }
  } catch (error) {
    button.disabled = false;
    button.textContent = 'Delete Photo';
    setStatus(libraryStatus, `Delete failed: ${error.message}`, 'error');
  }
}

refreshLibraryButton.addEventListener('click', loadPhotoLibrary);

uploadForm.addEventListener('submit', async event => {
  event.preventDefault();
  const files = [...photoInput.files];
  if (!files.length) return setStatus(uploadStatus, 'Choose at least one photo.', 'error');
  if (!session) return setStatus(uploadStatus, 'Please sign in again.', 'error');

  publishButton.disabled = true;
  progressWrap.hidden = false;
  progressBar.style.width = '0%';
  setStatus(uploadStatus, 'Preparing photos…');

  try {
    const galleryFile = await getRepositoryFile('gallery.json');
    let gallery = { photos: [] };
    if (galleryFile?.content) {
      try { gallery = JSON.parse(decodeGitHubText(galleryFile.content)); } catch { gallery = { photos: [] }; }
    }
    if (!Array.isArray(gallery.photos)) gallery.photos = [];

    const titleBase = titleInput.value.trim() || 'Recent home improvement project';
    const timestamp = Date.now();
    const newPhotos = [];

    for (let i = 0; i < files.length; i += 1) {
      setStatus(uploadStatus, `Optimizing and uploading photo ${i + 1} of ${files.length}…`);
      const content = await optimizeImage(files[i]);
      const suffix = files.length > 1 ? `-${i + 1}` : '';
      const filename = `${timestamp}-${slugify(titleBase)}${suffix}.jpg`;
      const path = `assets/images/uploads/${filename}`;
      await putRepositoryFile(path, content, `Add project photo: ${titleBase}${suffix}`);
      newPhotos.push({
        title: files.length > 1 ? `${titleBase} ${i + 1}` : titleBase,
        path,
        uploadedAt: new Date().toISOString()
      });
      progressBar.style.width = `${Math.round(((i + 1) / (files.length + 1)) * 100)}%`;
    }

    gallery.photos = [...newPhotos.reverse(), ...gallery.photos];
    const galleryContent = utf8ToBase64(JSON.stringify(gallery, null, 2));
    const freshGalleryFile = await getRepositoryFile('gallery.json');
    await putRepositoryFile('gallery.json', galleryContent, `Update project gallery with ${files.length} new photo${files.length === 1 ? '' : 's'}`, freshGalleryFile?.sha);

    progressBar.style.width = '100%';
    setStatus(uploadStatus, `Published ${files.length} photo${files.length === 1 ? '' : 's'} successfully. GitHub Pages normally updates within a few minutes.`, 'success');
    uploadForm.reset();
    previewGrid.replaceChildren();
    await loadPhotoLibrary();
  } catch (error) {
    setStatus(uploadStatus, `Upload stopped: ${error.message}`, 'error');
  } finally {
    publishButton.disabled = false;
  }
});

(async () => {
  const saved = sessionStorage.getItem(TOKEN_KEY);
  if (!saved) return;
  setStatus(loginStatus, 'Restoring your session…');
  try { await authenticate(saved); } catch (error) {
    sessionStorage.removeItem(TOKEN_KEY);
    session = null;
    setStatus(loginStatus, `Please sign in again. ${error.message}`, 'error');
  }
})();
