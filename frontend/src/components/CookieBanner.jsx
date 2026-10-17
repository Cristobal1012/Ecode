import { useEffect, useRef } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { isAdminRoute } from '../hooks/useCookieConsent';
import './CookieBanner.css';

export default function CookieBanner({ consent, isOpen, storageError, onAccept, onReject, onClose }) {
  const { pathname } = useLocation();
  const bannerRef = useRef(null);
  const visible = isOpen && !isAdminRoute(pathname);

  useEffect(() => {
    if (!visible) return;
    const previousFocus = document.activeElement;
    const banner = bannerRef.current;
    banner?.focus({ preventScroll: true });

    return () => {
      if (
        previousFocus?.isConnected &&
        (banner?.contains(document.activeElement) || document.activeElement === document.body)
      ) {
        previousFocus.focus({ preventScroll: true });
      }
    };
  }, [visible]);

  if (!visible) return null;

  const closeOnEscape = (event) => {
    if (event.key === 'Escape' && consent !== 'pending') {
      event.preventDefault();
      onClose();
    }
  };

  return (
    <section
      ref={bannerRef}
      className="cookie-banner"
      role="region"
      aria-labelledby="cookie-banner-title"
      aria-describedby="cookie-banner-description"
      tabIndex={-1}
      onKeyDown={closeOnEscape}
    >
      <div className="cookie-banner__content">
        <div className="cookie-banner__information">
          <h2 id="cookie-banner-title" className="cookie-banner__title">Tus preferencias de cookies</h2>
          <p id="cookie-banner-description" className="cookie-banner__text">
            Usamos cookies de análisis y marketing de Google Analytics y Meta Pixel solo con tu autorización.
            Puedes aceptar o rechazar y cambiar tu elección en cualquier momento desde el pie de página.{' '}
            <Link className="cookie-banner__link" to="/legal/privacidad">Política de Privacidad</Link>.
          </p>
          {consent === 'accepted' && (
            <p className="cookie-banner__notice">
              Si rechazas, esta página se recargará y se reiniciarán los formularios abiertos.
            </p>
          )}
          {storageError && <p className="cookie-banner__error" role="alert">{storageError}</p>}
        </div>
        <div className="cookie-banner__actions">
          <button type="button" className="cookie-banner__button" onClick={onAccept}>Aceptar</button>
          <button type="button" className="cookie-banner__button" onClick={onReject}>Rechazar</button>
          {consent !== 'pending' && (
            <button type="button" className="cookie-banner__close" onClick={onClose}>Cerrar preferencias</button>
          )}
        </div>
      </div>
    </section>
  );
}
