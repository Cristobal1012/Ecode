import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';

function TrackingScripts({ googleAnalyticsId, metaPixelId }) {
  const { pathname } = useLocation();
  const isAdmin = pathname === '/admin' || pathname.startsWith('/admin/');

  useEffect(() => {
    if (isAdmin) {
      document.getElementById('ecode-google-analytics-script')?.remove();
      document.getElementById('ecode-meta-pixel-script')?.remove();

      window.__ecodeGaInitialized = [];
      window.__ecodeMetaPixelInitialized = [];
      return;
    }

    // Google Analytics 4
    if (googleAnalyticsId) {
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

        if (!document.getElementById('ecode-meta-pixel-script')) {
          const script = document.createElement('script');
          script.id = 'ecode-meta-pixel-script';
          script.async = true;
          script.src = 'https://connect.facebook.net/en_US/fbevents.js';
          document.head.appendChild(script);
        }

        window.fbq('init', metaPixelId);
        window.__ecodeMetaPixelInitialized.push(metaPixelId);
      }
    }
  }, [isAdmin, googleAnalyticsId, metaPixelId]);

  // Registrar visitas en la navegación entre páginas de React.
  useEffect(() => {
    if (isAdmin) return;

    if (
      googleAnalyticsId &&
      window.gtag &&
      window.__ecodeGaInitialized?.includes(googleAnalyticsId)
    ) {
      window.gtag('event', 'page_view', {
        page_path: pathname,
        page_location: window.location.href,
      });
    }

    if (
      metaPixelId &&
      window.fbq &&
      window.__ecodeMetaPixelInitialized?.includes(metaPixelId)
    ) {
      window.fbq('track', 'PageView');
    }
  }, [pathname, isAdmin, googleAnalyticsId, metaPixelId]);

  return null;
}

export default TrackingScripts;