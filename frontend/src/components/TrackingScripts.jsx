import { useEffect, useRef } from 'react';
import { useLocation } from 'react-router-dom';
import { isAdminRoute, isCookieConsentAccepted, suspendTracking } from '../hooks/useCookieConsent';

function TrackingScripts({ googleAnalyticsId, metaPixelId, consent }) {
  const { pathname, search, key } = useLocation();
  const allowed = consent === 'accepted' && !isAdminRoute(pathname);
  const lastPageView = useRef({ ga: null, meta: null });

  useEffect(() => {
    if (!allowed || !isCookieConsentAccepted()) {
      suspendTracking();
      return;
    }

    // Google Analytics 4
    if (googleAnalyticsId) {
      window[`ga-disable-${googleAnalyticsId}`] = false;
      window.__ecodeGaInitialized ??= [];

      if (!window.__ecodeGaInitialized.includes(googleAnalyticsId)) {
        window.dataLayer = window.dataLayer || [];

        if (!window.gtag) {
          window.gtag = function () {
            window.dataLayer.push(arguments);
          };
          window.gtag('js', new Date());
        }

        if (!document.getElementById('ecode-google-analytics-script')) {
          const script = document.createElement('script');
          script.id = 'ecode-google-analytics-script';
          script.async = true;
          script.src = `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(googleAnalyticsId)}`;
          script.onload = () => { window.__ecodeGaScriptLoaded = true; };
          document.head.appendChild(script);
        }

        window.gtag('config', googleAnalyticsId, {
          send_page_view: false,
        });

        window.__ecodeGaInitialized.push(googleAnalyticsId);
      }
    }

    // Meta Pixel
    if (metaPixelId) {
      window.__ecodeMetaPixelInitialized ??= [];

      if (!window.__ecodeMetaPixelInitialized.includes(metaPixelId)) {
        if (!window.fbq) {
          const fbq = function () {
            if (fbq.callMethod) {
              fbq.callMethod.apply(fbq, arguments);
            } else {
              fbq.queue.push(arguments);
            }
          };

          fbq.push = fbq;
          fbq.loaded = true;
          fbq.version = '2.0';
          fbq.queue = [];
          window.fbq = fbq;
          window._fbq = fbq;
        }

        window.fbq('consent', 'grant');
        if (!document.getElementById('ecode-meta-pixel-script')) {
          const script = document.createElement('script');
          script.id = 'ecode-meta-pixel-script';
          script.async = true;
          script.src = 'https://connect.facebook.net/en_US/fbevents.js';
          document.head.appendChild(script);
        }

        window.fbq('init', metaPixelId);
        window.__ecodeMetaPixelInitialized.push(metaPixelId);
      } else {
        window.fbq('consent', 'grant');
      }
    }
  }, [allowed, googleAnalyticsId, metaPixelId]);

  // Registrar visitas en la navegación entre páginas de React.
  useEffect(() => {
    if (!allowed || !isCookieConsentAccepted()) return;

    const navigation = `${key}:${pathname}${search}`;
    const gaVisit = `${googleAnalyticsId}:${navigation}`;
    const metaVisit = `${metaPixelId}:${navigation}`;

    if (
      googleAnalyticsId &&
      window.gtag &&
      window.__ecodeGaInitialized?.includes(googleAnalyticsId) &&
      lastPageView.current.ga !== gaVisit
    ) {
      window.gtag('event', 'page_view', {
        page_path: `${pathname}${search}`,
        page_location: window.location.href,
        send_to: googleAnalyticsId,
      });
      lastPageView.current.ga = gaVisit;
    }

    if (
      metaPixelId &&
      window.fbq &&
      window.__ecodeMetaPixelInitialized?.includes(metaPixelId) &&
      lastPageView.current.meta !== metaVisit
    ) {
      window.fbq('track', 'PageView');
      lastPageView.current.meta = metaVisit;
    }
  }, [key, pathname, search, allowed, googleAnalyticsId, metaPixelId]);

  return null;
}

export default TrackingScripts;
