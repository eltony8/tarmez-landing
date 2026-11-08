/* =========================================================
   Tarmez — Full-Stack Complete App
   js/api.js — thin fetch wrapper around the backend REST API
   ========================================================= */

const SavoriaAPI = (function () {
  'use strict';

  // Every http(s) layout (the Java backend, Nginx/Render) serves the
  // API on the same origin under /api. Only a page opened from disk needs
  // the absolute address of the backend.
  const BASE_URL = window.SAVORIA_API_BASE
    || (location.protocol === 'file:' ? 'http://localhost:8000' : '/api');
  const TOKEN_KEY = 'savoria_token';
  const USER_KEY = 'savoria_user';

  function getToken() {
    return localStorage.getItem(TOKEN_KEY);
  }

  function setSession(token, user) {
    localStorage.setItem(TOKEN_KEY, token);
    localStorage.setItem(USER_KEY, JSON.stringify(user));
  }

  function clearSession() {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
  }

  function getCurrentUser() {
    const raw = localStorage.getItem(USER_KEY);
    return raw ? JSON.parse(raw) : null;
  }

  function isLoggedIn() {
    return !!getToken();
  }

  /**
   * Core request helper. Always attaches the bearer token when present
   * so guest-friendly endpoints (like POST /orders) still get linked to
   * an account if the visitor happens to be logged in.
   *
   * Read requests carry the visitor's language so the API can answer in
   * the same language (the payload still contains both languages, so the
   * page can switch instantly without another round trip).
   */
  async function request(path, { method = 'GET', body = null, auth = false } = {}) {
    const headers = { 'Content-Type': 'application/json' };
    const token = getToken();
    if (token) headers['Authorization'] = `Bearer ${token}`;

    let url = `${BASE_URL}${path}`;
    if (method === 'GET' && !/[?&]lang=/.test(url)) {
      const lang = (window.SavoriaI18n && window.SavoriaI18n.getLang()) || 'en';
      url += (url.includes('?') ? '&' : '?') + 'lang=' + encodeURIComponent(lang);
    }

    let response, json;
    try {
      response = await fetch(url, {
        method,
        headers,
        body: body ? JSON.stringify(body) : undefined,
      });
      json = await response.json();
    } catch (networkErr) {
      throw new Error('Could not reach the Tarmez server. Is the backend running on ' + BASE_URL + '?');
    }

    if (!response.ok) {
      const msg = json?.message || `Request failed (${response.status})`;
      const err = new Error(msg);
      err.errors = json?.errors || {};
      err.status = response.status;
      if (response.status === 401 && auth) clearSession();
      throw err;
    }

    return json.data;
  }

  return {
    // ---- Menu ----
    getCategories: () => request('/categories'),
    getMenuItems: (params = {}) => {
      const qs = new URLSearchParams(params).toString();
      return request(`/menu-items${qs ? '?' + qs : ''}`);
    },

    // ---- Orders ----
    createOrder: (payload) => request('/orders', { method: 'POST', body: payload }),
    getOrder: (id, phone = null, code = null) => {
      const qs = new URLSearchParams();
      if (phone) qs.set('phone', phone);
      if (code) qs.set('code', code);
      return request(`/orders/${id}${qs.toString() ? '?' + qs.toString() : ''}`);
    },
    getInvoice: (id, phone = null, code = null) => {
      const qs = new URLSearchParams();
      if (phone) qs.set('phone', phone);
      if (code) qs.set('code', code);
      return request(`/orders/${id}/invoice${qs.toString() ? '?' + qs.toString() : ''}`);
    },
    getRatingForm: (id, phone = null, code = null) => {
      const qs = new URLSearchParams();
      if (phone) qs.set('phone', phone);
      if (code) qs.set('code', code);
      return request(`/orders/${id}/rating${qs.toString() ? '?' + qs.toString() : ''}`);
    },
    saveRating: (id, body, phone = null, code = null) => {
      const qs = new URLSearchParams();
      if (phone) qs.set('phone', phone);
      if (code) qs.set('code', code);
      return request(`/orders/${id}/rating${qs.toString() ? '?' + qs.toString() : ''}`, { method: 'PUT', body });
    },
    getMyRatings: () => request('/me/ratings', { auth: true }),
    getDishRatings: () => request('/ratings/dishes'),
    getAdminRatings: (params = {}) => request('/admin/ratings?' + new URLSearchParams(params).toString(), { auth: true }),
    publishRating: (id) => request(`/admin/ratings/${id}/publish`, { method: 'POST', auth: true }),
    unpublishRating: (id) => request(`/admin/ratings/${id}/publish`, { method: 'DELETE', auth: true }),
    getPushKey: () => request('/push/key'),
    subscribePush: (body) => request('/me/push', { method: 'POST', body, auth: true }),
    unsubscribePush: (endpoint) => request('/me/push', { method: 'DELETE', body: { endpoint }, auth: true }),
    getInvoiceSettings: () => request('/admin/invoice-settings', { auth: true }),
    saveInvoiceSettings: (body) => request('/admin/invoice-settings', { method: 'PUT', body, auth: true }),
    trackOrders: (phone, code = null) => {
      const qs = new URLSearchParams({ phone });
      if (code) qs.set('code', code);
      return request(`/orders/track?${qs.toString()}`);
    },
    getMyOrders: () => request('/my/orders', { auth: true }),
    hideMyOrder: (id) => request(`/my/orders/${id}/hide`, { method: 'POST', auth: true }),

    // ---- Reservations ----
    createReservation: (payload) => request('/reservations', { method: 'POST', body: payload }),
    getMyReservations: () => request('/me/reservations', { auth: true }),
    getReservation: (id) => request(`/reservations/${id}`),
    trackReservations: (phone) => request(`/reservations/track?phone=${encodeURIComponent(phone)}`),

    // ---- Auth ----
    login: async (payload) => {
      const data = await request('/auth/login', { method: 'POST', body: payload });
      setSession(data.token, data.user);
      return data;
    },
    /** Public customer registration — always creates a customer account. */
    register: async (payload) => {
      const data = await request('/auth/register', { method: 'POST', body: payload });
      setSession(data.token, data.user);
      return data;
    },
    logout: async () => {
      try { await request('/auth/logout', { method: 'POST', auth: true }); }
      finally { clearSession(); }
    },
    getMe: () => request('/auth/me', { auth: true }),
    updateMyProfile: async (payload) => {
      const data = await request('/auth/me', { method: 'PATCH', body: payload, auth: true });
      const token = getToken();
      if (token) setSession(token, Object.assign({}, getCurrentUser() || {}, data));
      return data;
    },
    changePassword: (payload) => request('/auth/change-password', { method: 'POST', body: payload, auth: true }),
    forgotPassword: (payload) => request('/auth/forgot-password', { method: 'POST', body: payload }),
    resetPassword: (payload) => request('/auth/reset-password', { method: 'POST', body: payload }),

    // ---- Admin / staff ----
    getAdminSummary: () => request('/admin/summary', { auth: true }),
    getAllOrders: () => request('/orders', { auth: true }),
    updateOrderStatus: (id, status) => request(`/orders/${id}`, { method: 'PATCH', body: { status }, auth: true }),
    patchOrder: (id, body) => request(`/orders/${id}`, { method: 'PATCH', body, auth: true }),
    getAllReservations: () => request('/reservations', { auth: true }),
    getOrderBoard: () => request('/admin/order-board', { auth: true }),
    updateReservationStatus: (id, status) => request(`/reservations/${id}`, { method: 'PATCH', body: { status }, auth: true }),

    // ---- Site Management: today's orders ----
    getOrdersToday: (params = {}) => {
      const qs = new URLSearchParams(params).toString();
      return request(`/admin/orders-today${qs ? '?' + qs : ''}`, { auth: true });
    },

    // ---- Site Management: menu & categories ----
    getAdminCategories: () => request('/admin/categories', { auth: true }),
    createCategory: (body) => request('/categories', { method: 'POST', body, auth: true }),
    updateCategory: (id, body) => request(`/categories/${id}`, { method: 'PUT', body, auth: true }),
    reorderCategories: (order) => request('/categories/order', { method: 'PUT', body: { order }, auth: true }),
    deleteCategory: (id, moveTo = null) => request(`/categories/${id}`, {
      method: 'DELETE', body: moveTo ? { move_items_to: moveTo } : {}, auth: true,
    }),
    createMenuItem: (body) => request('/menu-items', { method: 'POST', body, auth: true }),
    updateMenuItem: (id, body) => request(`/menu-items/${id}`, { method: 'PUT', body, auth: true }),
    deleteMenuItem: (id) => request(`/menu-items/${id}`, { method: 'DELETE', auth: true }),

    /**
     * Multipart image upload — bypasses request() on purpose: fetch must
     * set its own Content-Type so the multipart boundary is included.
     */
    uploadImage: async (formData) => {
      const token = getToken();
      const headers = {};
      if (token) headers['Authorization'] = `Bearer ${token}`;
      let response, json;
      try {
        response = await fetch(`${BASE_URL}/admin/upload`, { method: 'POST', headers, body: formData });
        json = await response.json();
      } catch (networkErr) {
        throw new Error('Could not reach the Tarmez server for the image upload.');
      }
      if (!response.ok) {
        const err = new Error(json?.message || `Upload failed (${response.status})`);
        err.errors = json?.errors || {};
        err.status = response.status;
        throw err;
      }
      return json.data;
    },

    // ---- Site Management: accounts ----
    getAdminUsers: () => request('/admin/users', { auth: true }),
    createAdminUser: (body) => request('/admin/users', { method: 'POST', body, auth: true }),
    patchAdminUser: (id, body) => request(`/admin/users/${id}`, { method: 'PATCH', body, auth: true }),
    setUserPassword: (id, body) => request(`/admin/users/${id}/password`, { method: 'POST', body, auth: true }),

    // ---- Site Management: loyalty ----
    getLoyaltySettings: () => request('/admin/loyalty/settings', { auth: true }),
    updateLoyaltySettings: (body) => request('/admin/loyalty/settings', { method: 'PUT', body, auth: true }),
    getSiteTheme: () => request('/site-theme'),
    getMyPoints: () => request('/me/points', { auth: true }),
    validatePromo: (code, subtotal) => request('/promo-codes/validate', { method: 'POST', body: { code, subtotal }, auth: true }),
    getPointsSettings: () => request('/admin/points/settings', { auth: true }),
    savePointsSettings: (body) => request('/admin/points/settings', { method: 'PUT', body, auth: true }),
    searchPointsCustomers: (search = '') => request('/admin/points/customers' + (search ? '?search=' + encodeURIComponent(search) : ''), { auth: true }),
    getPointsCustomer: (id) => request(`/admin/points/customers/${id}`, { auth: true }),
    adjustPoints: (body) => request('/admin/points/adjust', { method: 'POST', body, auth: true }),
    listPromos: () => request('/admin/promo-codes', { auth: true }),
    getPromo: (id) => request(`/admin/promo-codes/${id}`, { auth: true }),
    createPromo: (body) => request('/admin/promo-codes', { method: 'POST', body, auth: true }),
    updatePromo: (id, body) => request(`/admin/promo-codes/${id}`, { method: 'PUT', body, auth: true }),
    setPromoActive: (id, isActive) => request(`/admin/promo-codes/${id}/status`, { method: 'PATCH', body: { is_active: isActive }, auth: true }),
    deletePromo: (id) => request(`/admin/promo-codes/${id}`, { method: 'DELETE', auth: true }),
    saveSiteTheme: (palette) => request('/admin/site-theme', { method: 'PUT', body: { palette }, auth: true }),
    listSiteThemes: () => request('/admin/site-themes', { auth: true }),
    createSiteTheme: (body) => request('/admin/site-themes', { method: 'POST', body, auth: true }),
    updateSiteTheme: (id, body) => request(`/admin/site-themes/${id}`, { method: 'PUT', body, auth: true }),
    deleteSiteTheme: (id) => request(`/admin/site-themes/${id}`, { method: 'DELETE', auth: true }),
    getLoyaltyAccounts: (search = '') => request(`/admin/loyalty/accounts${search ? '?search=' + encodeURIComponent(search) : ''}`, { auth: true }),
    getLoyaltyCustomer: (phone) => request(`/admin/loyalty/customer?phone=${encodeURIComponent(phone)}`, { auth: true }),
    getLoyaltyRules: () => request('/loyalty/rules'),
    loyaltyAdjust: (body) => request('/admin/loyalty/adjust', { method: 'POST', body, auth: true }),
    loyaltyRedeem: (body) => request('/admin/loyalty/redeem', { method: 'POST', body, auth: true }),
    loyaltyZero: (body) => request('/admin/loyalty/zero', { method: 'POST', body, auth: true }),

    // ---- Customer rewards: coupons ----
    getMyCoupons: () => request('/me/coupons', { auth: true }),
    getMyLoyalty: () => request('/me/loyalty', { auth: true }),
    lookupCouponsByPhone: (phone) => request(`/coupons/lookup?phone=${encodeURIComponent(phone)}`),
    validateCoupon: (code, phone = '', subtotal = 0) => request('/coupons/validate', {
      method: 'POST', body: { code, phone, subtotal },
    }),

    // ---- Customer notifications ----
    getNotifications: ({ limit = 50, unreadOnly = false } = {}) => request(
      `/me/notifications?limit=${limit}${unreadOnly ? '&unread_only=true' : ''}`,
      { auth: true }
    ),
    getUnreadNotificationCount: () => request('/me/notifications/unread-count', { auth: true }),
    markNotificationRead: (id) => request(`/me/notifications/${id}/read`, { method: 'POST', auth: true }),
    markAllNotificationsRead: () => request('/me/notifications/read-all', { method: 'POST', auth: true }),

    // ---- Site Management: coupons ----
    getAdminCoupons: (params = {}) => {
      const qs = new URLSearchParams(params).toString();
      return request(`/admin/coupons${qs ? '?' + qs : ''}`, { auth: true });
    },
    getAdminCoupon: (id) => request(`/admin/coupons/${id}`, { auth: true }),
    createAdminCoupon: (body) => request('/admin/coupons', {
      method: 'POST', body, auth: true,
    }),
    toggleAdminCouponActive: (id, is_active) => request(`/admin/coupons/${id}/status`, {
      method: 'PATCH', body: { is_active }, auth: true,
    }),
    deleteAdminCoupon: (id) => request(`/admin/coupons/${id}`, {
      method: 'DELETE', auth: true,
    }),
    cancelAdminCoupon: (id, reason) => request(`/admin/coupons/${id}/cancel`, {
      method: 'POST', body: { reason }, auth: true,
    }),

    // ---- Site Management: system ----
    getAuditLog: (limit = 60) => request(`/admin/audit-log?limit=${limit}`, { auth: true }),
    getFeatures: () => request('/features'),
    getMyPermissions: () => request('/me/permissions', { auth: true }),
    getAdminFeatures: () => request('/admin/features', { auth: true }),
    saveFeatures: (body) => request('/admin/features', { method: 'PUT', body, auth: true }),
    getPermissions: () => request('/admin/permissions', { auth: true }),
    savePermissions: (roles) => request('/admin/permissions', { method: 'PUT', body: { roles }, auth: true }),

    // ---- Restaurant tables & QR codes ----
    getAdminTables: () => request('/admin/tables', { auth: true }),
    createAdminTable: (body) => request('/admin/tables', { method: 'POST', body, auth: true }),
    updateAdminTable: (id, body) => request(`/admin/tables/${id}`, { method: 'PUT', body, auth: true }),
    deleteAdminTable: (id) => request(`/admin/tables/${id}`, { method: 'DELETE', auth: true }),
    /** Public: turn the token printed on a table's QR code into that table. */
    resolveTable: (token) => request(`/tables/resolve?token=${encodeURIComponent(token)}`),

    // ---- Site Management: order-number counter ----
    getOrderCounter: () => request('/admin/order-counter', { auth: true }),
    resetOrderCounter: () => request('/admin/order-counter/reset', { method: 'POST', auth: true }),

    // ---- Site Management: website content (CMS) ----
    getAdminSiteContent: () => request('/admin/site-content', { auth: true }),
    saveSiteContent: (body) => request('/admin/site-content', { method: 'PUT', body, auth: true }),
    resetSiteContent: (group) => request('/admin/site-content/reset', { method: 'POST', body: { group }, auth: true }),
    setSiteImage: (body) => request('/admin/site-content/image', { method: 'POST', body, auth: true }),
    resetSiteImage: (key) => request(`/admin/site-content/image/${encodeURIComponent(key)}`, { method: 'DELETE', auth: true }),

    /**
     * Multipart website-image upload — the server crops the picture to the
     * aspect ratio of the slot it belongs to before saving it.
     */
    uploadSiteImage: async (formData) => {
      const token = getToken();
      const headers = {};
      if (token) headers['Authorization'] = `Bearer ${token}`;
      let response, json;
      try {
        response = await fetch(`${BASE_URL}/admin/site-content/image`, { method: 'POST', headers, body: formData });
        json = await response.json();
      } catch (networkErr) {
        throw new Error('Could not reach the Tarmez server for the image upload.');
      }
      if (!response.ok) {
        const err = new Error(json?.message || `Upload failed (${response.status})`);
        err.errors = json?.errors || {};
        err.status = response.status;
        throw err;
      }
      return json.data;
    },

    // ---- Site Management: reviews ----
    getAdminReviews: () => request('/admin/reviews', { auth: true }),
    createReview: (body) => request('/admin/reviews', { method: 'POST', body, auth: true }),
    updateReview: (id, body) => request(`/admin/reviews/${id}`, { method: 'PATCH', body, auth: true }),
    deleteReview: (id) => request(`/admin/reviews/${id}`, { method: 'DELETE', auth: true }),

    // ---- Session helpers ----
    isLoggedIn,
    getCurrentUser,
    clearSession,
    request,
    baseUrl: BASE_URL,
  };
})();
