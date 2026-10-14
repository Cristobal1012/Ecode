import { useSyncExternalStore } from 'react';

export const COOKIE_CONSENT_KEY = 'ecode_cookie_consent';

const listeners = new Set();
const initialSnapshot = { consent: 'pending', isBannerOpen: true, storageError: '' };
let snapshot;

export function isAdminRoute(pathname) {
  let normalized = pathname.toLowerCase();
  try {
    normalized = decodeURIComponent(pathname).toLowerCase();
  } catch {
    // Una URL mal codificada no debe interrumpir el control de consentimiento.
  }
  return normalized === '/admin' || normalized.startsWith('/admin/');
}

function readStoredConsent() {
  try {
    const saved = window.localStorage.getItem(COOKIE_CONSENT_KEY);
    if (saved === 'accepted') {
      // No habilitar una aceptación antigua si ahora no se puede guardar su retirada.
      window.localStorage.setItem(COOKIE_CONSENT_KEY, saved);
    }
    return {
      consent: saved === 'accepted' || saved === 'rejected' ? saved : 'pending',
      storageError: '',
    };
  } catch {
    return {
      consent: 'pending',
      storageError: 'No pudimos acceder a tus preferencias de cookies. El seguimiento sigue bloqueado.',
    };
  }
}

function getSnapshot() {
  if (!snapshot) {
    const stored = readStoredConsent();
    snapshot = { ...stored, isBannerOpen: stored.consent === 'pending' };
  }
  return snapshot;
}

function publish(next) {
  snapshot = { ...getSnapshot(), ...next };
  listeners.forEach((listener) => listener());
}

// También se consulta desde los efectos para impedir que un render anterior
// reactive los proveedores después de una retirada síncrona del consentimiento.
export function isCookieConsentAccepted() {
  return getSnapshot().consent === 'accepted';
}

export function suspendTracking() {
  for (const id of window.__ecodeGaInitialized || []) {
    window[`ga-disable-${id}`] = true;
  }

  // Conservar js/config, pero nunca reproducir visitas pendientes al reanudar.
  if (Array.isArray(window.dataLayer) && !window.__ecodeGaScriptLoaded) {
    const commands = window.dataLayer.filter((command) => command?.[0] !== 'event');
    window.dataLayer.splice(0, window.dataLayer.length, ...commands);
  }

  if (typeof window.fbq === 'function') {
    if (!window.fbq.callMethod && Array.isArray(window.fbq.queue)) {
      const commands = window.fbq.queue.filter((command) => (
        command?.[0] !== 'consent' && !String(command?.[0]).startsWith('track')
      ));
      // Revoke debe preceder a init si la librería todavía está descargándose.
      window.fbq.queue = [['consent', 'revoke'], ...commands];
    } else {
      window.fbq('consent', 'revoke');
    }
  }
}

function removeTrackingScripts() {
  document.getElementById('ecode-google-analytics-script')?.remove();
  document.getElementById('ecode-meta-pixel-script')?.remove();
}

function hasInitializedTracking() {
  return Boolean(window.__ecodeGaInitialized?.length || window.__ecodeMetaPixelInitialized?.length);
}

function chooseConsent(consent) {
  const mustReload = getSnapshot().consent === 'accepted' || hasInitializedTracking();
  let storageError = '';

  try {
    window.localStorage.setItem(COOKIE_CONSENT_KEY, consent);
    if (window.localStorage.getItem(COOKIE_CONSENT_KEY) !== consent) {
      throw new Error('La decisión de cookies no se guardó.');
    }
  } catch {
    storageError = 'No pudimos guardar tu elección. El seguimiento sigue bloqueado. Inténtalo nuevamente.';
  }

  const nextConsent = consent === 'accepted' && storageError ? 'pending' : consent;
  publish({ consent: nextConsent, isBannerOpen: Boolean(storageError), storageError });

  if (nextConsent !== 'accepted') {
    suspendTracking();
    removeTrackingScripts();
    // Sin persistencia, recargar podría restaurar una aceptación anterior.
    if (mustReload && !storageError) window.location.reload();
  }
}

function syncStoredConsent(event) {
  const current = getSnapshot();
  const next = readStoredConsent();

  // Una página restaurada no debe recuperar una aceptación cuya retirada falló.
  if (current.storageError && next.consent === 'accepted' && event.type !== 'storage') return;
  if (current.consent === next.consent && current.storageError === next.storageError) return;

  publish({ ...next, isBannerOpen: next.consent === 'pending' || Boolean(next.storageError) });
  if (next.consent !== 'accepted') {
    suspendTracking();
    removeTrackingScripts();
    if ((current.consent === 'accepted' || hasInitializedTracking()) && !next.storageError) {
      window.location.reload();
    }
  }
}

function handleStorage(event) {
  if (event.key !== COOKIE_CONSENT_KEY && event.key !== null) return;
  try {
    if (event.storageArea !== window.localStorage) return;
  } catch {
    // Si el navegador retiró acceso al almacenamiento, sincronizar también bloquea el seguimiento.
  }
  syncStoredConsent(event);
}

function subscribe(listener) {
  listeners.add(listener);
  if (listeners.size === 1) {
    window.addEventListener('storage', handleStorage);
    window.addEventListener('pageshow', syncStoredConsent);
    syncStoredConsent({ type: 'subscribe' });
  }
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0) {
      window.removeEventListener('storage', handleStorage);
      window.removeEventListener('pageshow', syncStoredConsent);
    }
  };
}

const acceptCookies = () => chooseConsent('accepted');
const rejectCookies = () => chooseConsent('rejected');
const openPreferences = () => publish({ isBannerOpen: true });
const closePreferences = () => {
  if (getSnapshot().consent !== 'pending') publish({ isBannerOpen: false });
};
const getServerSnapshot = () => initialSnapshot;

export default function useCookieConsent() {
  const state = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  return { ...state, acceptCookies, rejectCookies, openPreferences, closePreferences };
}
