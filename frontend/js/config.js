/**
 * Talk Sasa - Client API Configuration & Interceptor Engine
 * Automatically routes /api requests to the decoupled backend server
 * Supports Web, Mobile (Capacitor/Android), and Cloud PaaS deployments
 */
(function() {
  'use strict';

  // 1. Determine Default Backend URL based on runtime environment
  function detectDefaultApiUrl() {
    const isLocalhost = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
    const isCapacitorAndroid = window.location.protocol === 'capacitor:' || 
                              (isLocalhost && (window.location.port === '' || window.location.port === '80' || window.location.protocol === 'https:'));

    // Check meta tag override
    const metaTag = document.querySelector('meta[name="api-base-url"]');
    if (metaTag && metaTag.content && !metaTag.content.startsWith('%')) {
      return metaTag.content.replace(/\/+$/, '');
    }

    // Check localStorage saved preference
    const saved = localStorage.getItem('TALK_SASA_API_URL');
    if (saved !== null) {
      return saved.replace(/\/+$/, '');
    }

    // Monolithic same-origin mode (served by backend on port 3000)
    if (window.location.port === '3000') {
      return '';
    }

    // Android Capacitor environment: default to live Render backend
    if (isCapacitorAndroid) {
      return 'https://sema-sasa-africa.onrender.com';
    }

    // Standalone frontend dev server (e.g. port 5000, 5173, 8080)
    if (isLocalhost) {
      return 'http://localhost:3000';
    }

    // Production standalone frontend (e.g. Vercel, Netlify, custom domain)
    return 'https://sema-sasa-africa.onrender.com';
  }

  // 2. Global State & API URL Resolver
  window.API_BASE_URL = detectDefaultApiUrl();

  window.getApiUrl = function(endpoint) {
    if (!endpoint) return '';
    if (endpoint.startsWith('http://') || endpoint.startsWith('https://') || endpoint.startsWith('blob:') || endpoint.startsWith('data:')) {
      return endpoint;
    }
    const cleanBase = (window.API_BASE_URL || '').replace(/\/+$/, '');
    let cleanPath = endpoint;
    if (!cleanPath.startsWith('/')) {
      cleanPath = '/' + cleanPath;
    }
    return cleanBase ? `${cleanBase}${cleanPath}` : cleanPath;
  };

  window.resolveAssetUrl = function(path) {
    if (!path) return '';
    if (path.startsWith('http://') || path.startsWith('https://') || path.startsWith('blob:') || path.startsWith('data:')) {
      return path;
    }
    // If it's an uploaded asset (uploads/...), ensure it points to backend API host
    if (path.startsWith('uploads/') || path.startsWith('/uploads/')) {
      return window.getApiUrl(path);
    }
    return path;
  };

  window.setApiBaseUrl = function(newUrl) {
    if (typeof newUrl === 'string') {
      const trimmed = newUrl.trim().replace(/\/+$/, '');
      if (trimmed) {
        localStorage.setItem('TALK_SASA_API_URL', trimmed);
        window.API_BASE_URL = trimmed;
      } else {
        localStorage.removeItem('TALK_SASA_API_URL');
        window.API_BASE_URL = '';
      }
      console.log('🔗 [Talk Sasa] API Base URL set to:', window.API_BASE_URL || '(Same Origin)');
      checkApiHealth();
    }
  };

  // 3. Transparent Fetch Interceptor for /api/ and /uploads/
  const originalFetch = window.fetch;
  window.fetch = function(input, init) {
    if (typeof input === 'string') {
      if (input.startsWith('/api/') || input.startsWith('api/') || input.startsWith('/uploads/') || input.startsWith('uploads/')) {
        input = window.getApiUrl(input);
      }
    } else if (input instanceof Request) {
      const url = input.url;
      if (url.includes('/api/') || url.includes('/uploads/')) {
        const parsed = new URL(url);
        if (parsed.origin === window.location.origin && window.API_BASE_URL) {
          const newUrl = window.getApiUrl(parsed.pathname + parsed.search);
          input = new Request(newUrl, input);
        }
      }
    }
    return originalFetch.call(this, input, init);
  };

  // 4. Download helper for file downloads
  window.downloadApiFile = function(endpoint, fileName) {
    const fullUrl = window.getApiUrl(endpoint);
    const link = document.createElement('a');
    link.href = fullUrl;
    if (fileName) link.download = fileName;
    link.target = '_blank';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // 5. Health Check & UI Status Manager
  async function checkApiHealth() {
    const dot = document.getElementById('apiStatusDot');
    if (!dot) return;

    try {
      const healthUrl = window.getApiUrl('/health');
      const res = await originalFetch(healthUrl, { method: 'GET', signal: AbortSignal.timeout(3500) });
      if (res.ok) {
        dot.style.background = '#10b981'; // green
        dot.title = `API Connected: ${window.API_BASE_URL || 'Same Origin'}`;
      } else {
        dot.style.background = '#f59e0b'; // amber
        dot.title = `API Status ${res.status}: ${window.API_BASE_URL || 'Same Origin'}`;
      }
    } catch (err) {
      dot.style.background = '#ef4444'; // red
      dot.title = `API Disconnected (${err.message}): ${window.API_BASE_URL || 'Same Origin'}`;
    }
  }

  // 6. Initialize UI Modal Listeners
  document.addEventListener('DOMContentLoaded', () => {
    // Check initial health
    setTimeout(checkApiHealth, 500);

    const btnOpen = document.getElementById('btnOpenApiConfig');
    const inputUrl = document.getElementById('inputBackendApiUrl');
    const btnTest = document.getElementById('btnTestApiConnection');
    const btnSave = document.getElementById('btnSaveApiConfig');
    const testResult = document.getElementById('apiTestResult');

    if (btnOpen) {
      btnOpen.addEventListener('click', () => {
        if (inputUrl) {
          inputUrl.value = window.API_BASE_URL || '';
        }
        if (testResult) {
          testResult.style.display = 'none';
        }
        if (typeof window.openModal === 'function') {
          window.openModal('modalApiConfig');
        } else {
          const m = document.getElementById('modalApiConfig');
          if (m) m.classList.add('active');
        }
      });
    }

    if (btnTest) {
      btnTest.addEventListener('click', async () => {
        const target = (inputUrl ? inputUrl.value.trim() : '') || window.location.origin;
        if (testResult) {
          testResult.style.display = 'block';
          testResult.style.background = 'rgba(255, 173, 0, 0.15)';
          testResult.style.color = 'var(--text-primary)';
          testResult.innerHTML = `Testing connection to <code>${target}</code>...`;
        }

        try {
          const cleanTarget = target.replace(/\/+$/, '');
          const res = await originalFetch(`${cleanTarget}/health`, { signal: AbortSignal.timeout(4000) });
          if (res.ok) {
            const data = await res.json();
            testResult.style.background = 'rgba(16, 185, 129, 0.15)';
            testResult.style.color = '#059669';
            testResult.innerHTML = `✅ Connected successfully! Service: <strong>${data.service || 'Talk Sasa API'}</strong> (v${data.version || '1.0'})`;
          } else {
            testResult.style.background = 'rgba(239, 68, 68, 0.15)';
            testResult.style.color = '#dc2626';
            testResult.innerHTML = `⚠️ Server returned HTTP ${res.status}. Verify endpoint.`;
          }
        } catch (e) {
          testResult.style.background = 'rgba(239, 68, 68, 0.15)';
          testResult.style.color = '#dc2626';
          testResult.innerHTML = `❌ Failed to connect: ${e.message}. Ensure backend is running and CORS allows this domain.`;
        }
      });
    }

    if (btnSave) {
      btnSave.addEventListener('click', () => {
        const val = inputUrl ? inputUrl.value.trim() : '';
        window.setApiBaseUrl(val);
        if (typeof window.closeModal === 'function') {
          window.closeModal('modalApiConfig');
        } else {
          const m = document.getElementById('modalApiConfig');
          if (m) m.classList.remove('active');
        }
        if (typeof window.showToast === 'function') {
          window.showToast(`API Server configured: ${val || 'Same Origin'}`, 'success');
        }
        // Refresh overview data
        if (typeof window.fetchStats === 'function') window.fetchStats();
      });
    }
  });

  console.log('⚡ [Talk Sasa] API Client Initialized | Target Backend:', window.API_BASE_URL || '(Same Origin / Relative)');
})();
