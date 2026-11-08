/* Everything you are likely to change lives here. Edit, save, push — no build step.
   Empty values hide their button (WhatsApp, email) or make the form fall back to WhatsApp/email. */
window.TARMEZ = {
  // the address the hero QR code opens. Empty = this page's own live demo (demo/), so scanning it tries the ordering.
  qrUrl: '',

  // WhatsApp in international form, digits only, e.g. '9665XXXXXXXX'
  whatsapp: '966555304556',
  // where demo requests and the email button go
  email: '',
  // Formspree form id (the part after formspree.io/f/), e.g. 'xayzabcd'. Empty = the form opens WhatsApp or email instead.
  formspreeId: '',

  currency: { ar: 'ر.س', en: 'SAR' },
  // true shows «prices are indicative» under the plans. Set to false once the prices below are final.
  pricesAreDraft: false,
  // yearly price is per month when paid yearly
  plans: [
    {
      id: 'start',
      name: { ar: 'البداية', en: 'Start' },
      blurb: { ar: 'منيو QR وطلبات الطاولات', en: 'QR menu and table orders' },
      monthly: 199, yearly: 166,
      features: {
        ar: ['منيو QR بالصور والأسعار', 'الطلب من الطاولة والاستلام', 'لوحة الطلبات وشاشة المطبخ', 'فاتورة برمز QR', 'عربي وإنجليزي'],
        en: ['QR menu with photos and prices', 'Table and pickup orders', 'Order board and kitchen screen', 'Invoice with a QR code', 'Arabic and English'],
      },
    },
    {
      id: 'grow',
      featured: true,
      name: { ar: 'النمو', en: 'Grow' },
      blurb: { ar: 'كل اللي في البداية، ومعه أدوات تجيب الضيف مرة ثانية', en: 'Everything in Start, plus tools that bring guests back' },
      monthly: 349, yearly: 291,
      features: {
        ar: ['كل مميزات البداية', 'نقاط الولاء والكوبونات', 'تقييمات الضيوف', 'استيراد وتصدير المنيو بإكسل', 'ألوان وثيمات مطعمك'],
        en: ['Everything in Start', 'Loyalty points and coupons', 'Guest ratings', 'Menu import and export with Excel', 'Your own colours and themes'],
      },
    },
    {
      id: 'pro',
      name: { ar: 'الاحترافي', en: 'Pro' },
      blurb: { ar: 'للمطاعم اللي تبي تسوّق لنفسها', en: 'For restaurants that market themselves' },
      monthly: 549, yearly: 458,
      features: {
        ar: ['كل مميزات النمو', 'عروض القريبين من المطعم', 'حملات وإشعارات مجدولة', 'الحجوزات', 'صلاحيات لكل موظف'],
        en: ['Everything in Grow', 'Offers for guests nearby', 'Scheduled campaigns and notifications', 'Table reservations', 'Permissions for every staff member'],
      },
    },
  ],
};
