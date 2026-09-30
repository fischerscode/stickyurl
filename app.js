(() => {
  'use strict';

  const HASH_PREFIX = '#r=';
  const STORAGE_PREFIX = 'sticky-random-router:';

  function encodeBase64Url(value) {
    const bytes = new TextEncoder().encode(value);
    let binary = '';
    for (const byte of bytes) binary += String.fromCharCode(byte);
    return btoa(binary)
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/g, '');
  }

  function decodeBase64Url(value) {
    const normalized = value.replace(/-/g, '+').replace(/_/g, '/');
    const padded = normalized + '='.repeat((4 - (normalized.length % 4)) % 4);
    const binary = atob(padded);
    const bytes = Uint8Array.from(binary, char => char.charCodeAt(0));
    return new TextDecoder().decode(bytes);
  }

  function normalizeUrl(raw) {
    const value = raw.trim();
    if (!value) throw new Error('Leere URL');

    const parsed = new URL(value);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      throw new Error('Nur http:// und https:// sind erlaubt.');
    }
    return parsed.href;
  }

  function parseRouteFromHash() {
    if (!location.hash.startsWith(HASH_PREFIX)) return null;

    try {
      const encoded = location.hash.slice(HASH_PREFIX.length);
      if (!encoded) throw new Error('Keine Routendaten vorhanden.');

      const payload = JSON.parse(decodeBase64Url(encoded));
      if (!payload || payload.v !== 1 || !Array.isArray(payload.urls) || payload.urls.length === 0) {
        throw new Error('Ungültige Routendaten.');
      }

      const urls = payload.urls.map(normalizeUrl);
      return { encoded, urls };
    } catch (error) {
      console.warn('Router-Link konnte nicht gelesen werden:', error);
      return { error: true };
    }
  }

  function randomIndex(max) {
    if (max <= 1) return 0;

    if (window.crypto && crypto.getRandomValues) {
      const maxUint = 0x100000000;
      const limit = maxUint - (maxUint % max);
      const buffer = new Uint32Array(1);
      do {
        crypto.getRandomValues(buffer);
      } while (buffer[0] >= limit);
      return buffer[0] % max;
    }

    return Math.floor(Math.random() * max);
  }

  function redirectIfNeeded() {
    const route = parseRouteFromHash();
    if (!route || route.error) return route;

    const storageKey = STORAGE_PREFIX + route.encoded;
    let target = null;

    try {
      const stored = localStorage.getItem(storageKey);
      if (stored && route.urls.includes(stored)) target = stored;
    } catch (error) {
      console.warn('localStorage ist nicht verfügbar:', error);
    }

    if (!target) {
      target = route.urls[randomIndex(route.urls.length)];
      try {
        localStorage.setItem(storageKey, target);
      } catch (error) {
        console.warn('Auswahl konnte nicht gespeichert werden:', error);
      }
    }

    location.replace(target);
    return route;
  }

  const route = redirectIfNeeded();
  if (route && !route.error) return;

  document.addEventListener('DOMContentLoaded', () => {
    const app = document.getElementById('app');
    const footer = document.getElementById('footer');
    const form = document.getElementById('router-form');
    const list = document.getElementById('url-list');
    const addButton = document.getElementById('add-url');
    const clearButton = document.getElementById('clear-form');
    const errorBox = document.getElementById('form-error');
    const result = document.getElementById('result');
    const resultUrl = document.getElementById('result-url');
    const copyButton = document.getElementById('copy-link');
    const copyStatus = document.getElementById('copy-status');

    app.hidden = false;
    footer.hidden = false;

    if (route && route.error) {
      errorBox.textContent = 'Der Router-Link ist ungültig oder beschädigt. Du kannst unten einen neuen Link erzeugen.';
      errorBox.hidden = false;
    }

    function addUrlField(value = '') {
      const row = document.createElement('div');
      row.className = 'url-row';

      const input = document.createElement('input');
      input.type = 'url';
      input.placeholder = 'https://example.com';
      input.autocomplete = 'url';
      input.value = value;
      input.setAttribute('aria-label', 'Ziel-URL');

      const remove = document.createElement('button');
      remove.type = 'button';
      remove.className = 'icon-button';
      remove.textContent = 'Entfernen';
      remove.addEventListener('click', () => {
        row.remove();
        if (list.children.length === 0) addUrlField();
      });

      row.append(input, remove);
      list.appendChild(row);
    }

    addButton.addEventListener('click', () => addUrlField());

    clearButton.addEventListener('click', () => {
      list.innerHTML = '';
      addUrlField();
      addUrlField();
      addUrlField();
      result.hidden = true;
      errorBox.hidden = true;
      copyStatus.textContent = '';
    });

    form.addEventListener('submit', event => {
      event.preventDefault();
      errorBox.hidden = true;
      copyStatus.textContent = '';

      const inputs = [...list.querySelectorAll('input')];
      const nonEmpty = inputs.map(input => input.value.trim()).filter(Boolean);

      if (nonEmpty.length === 0) {
        errorBox.textContent = 'Bitte gib mindestens eine Ziel-URL ein.';
        errorBox.hidden = false;
        return;
      }

      try {
        const urls = nonEmpty.map(normalizeUrl);
        const payload = { v: 1, urls };
        const encoded = encodeBase64Url(JSON.stringify(payload));
        const base = location.href.split('#')[0];
        const shareUrl = `${base}${HASH_PREFIX}${encoded}`;

        resultUrl.value = shareUrl;
        result.hidden = false;
        result.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      } catch (error) {
        errorBox.textContent = error.message || 'Mindestens eine URL ist ungültig.';
        errorBox.hidden = false;
      }
    });

    copyButton.addEventListener('click', async () => {
      if (!resultUrl.value) return;
      try {
        await navigator.clipboard.writeText(resultUrl.value);
        copyStatus.textContent = 'Link wurde kopiert.';
      } catch {
        resultUrl.select();
        document.execCommand('copy');
        copyStatus.textContent = 'Link wurde kopiert.';
      }
    });

    addUrlField();
    addUrlField();
    addUrlField();
  });
})();
