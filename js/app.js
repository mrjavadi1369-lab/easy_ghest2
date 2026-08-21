    // ============================================================
    //  TOAST + GLASS CONFIRM (پیام‌های شیشه‌ای یکدست — بالای صفحه)
    // ============================================================
    let toastTimer = null;
    let glassConfirmResolver = null;

    function showToast(message, type = 'success') {
      const toast = document.getElementById('toast');
      if (!toast) return;
      const icon = toast.querySelector('.toast-icon');
      const msg = document.getElementById('toast-message');
      
      icon.className = 'toast-icon fa-solid';
      if (type === 'success') {
        icon.classList.add('fa-circle-check');
        toast.className = 'toast-success';
      } else if (type === 'error') {
        icon.classList.add('fa-circle-xmark');
        toast.className = 'toast-error';
      } else if (type === 'warning') {
        icon.classList.add('fa-triangle-exclamation');
        toast.className = 'toast-warning';
      } else {
        icon.classList.add('fa-circle-info');
        toast.className = 'toast-info';
      }
      
      msg.textContent = message;
      toast.classList.remove('hidden');
      
      if (toastTimer) clearTimeout(toastTimer);
      toastTimer = setTimeout(() => {
        toast.classList.add('hidden');
      }, 3200);
    }

    function closeGlassConfirm(result) {
      const overlay = document.getElementById('glass-confirm-overlay');
      if (overlay) {
        overlay.classList.add('hidden');
      }
      if (glassConfirmResolver) {
        const r = glassConfirmResolver;
        glassConfirmResolver = null;
        r(!!result);
      }
    }

    /** تأیید شیشه‌ای — جایگزین confirm مرورگر. Promise<boolean> */
    function showConfirmGlass(message, options = {}) {
      return new Promise((resolve) => {
        // اگر تأیید قبلی باز است، آن را ببند
        if (glassConfirmResolver) {
          glassConfirmResolver(false);
          glassConfirmResolver = null;
        }
        glassConfirmResolver = resolve;
        const overlay = document.getElementById('glass-confirm-overlay');
        const body = document.getElementById('glass-confirm-body');
        const titleEl = document.getElementById('glass-confirm-title-text');
        const okBtn = document.getElementById('glass-confirm-ok');
        const cancelBtn = document.getElementById('glass-confirm-cancel');
        if (!overlay || !body) {
          resolve(window.confirm(message));
          return;
        }
        titleEl.textContent = options.title || 'تأیید';
        body.textContent = message;
        okBtn.textContent = options.okText || 'تأیید';
        cancelBtn.textContent = options.cancelText || 'انصراف';
        okBtn.onclick = () => closeGlassConfirm(true);
        cancelBtn.onclick = () => closeGlassConfirm(false);
        overlay.onclick = (e) => {
          if (e.target === overlay) closeGlassConfirm(false);
        };
        overlay.classList.remove('hidden');
        // فوکوس دکمه تأیید برای دسترسی‌پذیری
        setTimeout(() => okBtn.focus(), 50);
      });
    }

    // ============================================================
    //  DIGIT HELPERS (function decl — hoisted, safe for early use)
    // ============================================================
    function toEnglishDigits(str) {
      if (str === undefined || str === null) return '';
      const map = {
        '۰':'0','۱':'1','۲':'2','۳':'3','۴':'4','۵':'5','۶':'6','۷':'7','۸':'8','۹':'9',
        '٠':'0','١':'1','٢':'2','٣':'3','٤':'4','٥':'5','٦':'6','٧':'7','٨':'8','٩':'9'
      };
      return String(str).replace(/[۰-۹٠-٩]/g, d => map[d] || d);
    }

    function toPersianDigits(num) {
      if (num === undefined || num === null) return '۰';
      const persianDigits = ['۰', '۱', '۲', '۳', '۴', '۵', '۶', '۷', '۸', '۹'];
      return num.toString().replace(/\d/g, d => persianDigits[d]);
    }

    // ============================================================
    //  STATE
    // ============================================================
    function safeParseJSON(key, fallback) {
      try {
        const raw = localStorage.getItem(key);
        if (!raw) return fallback;
        const data = JSON.parse(raw);
        return data ?? fallback;
      } catch (e) {
        console.warn('localStorage parse failed for', key, e);
        return fallback;
      }
    }
    let loans = safeParseJSON('loans', []);
    if (!Array.isArray(loans)) loans = [];
    // نرمال‌سازی ساختاری وام‌ها (جلوگیری از داده خراب + هم‌تراز تعداد اقساط)
    loans = loans.map(l => {
      if (!l || typeof l !== 'object') return null;
      const id = l.id != null ? l.id : Date.now();
      let installments = Array.isArray(l.installments) ? l.installments.map((inst, idx) => ({
        number: Number(inst.number) || (idx + 1),
        date: (() => {
          const raw = inst.date || '';
          const n = normalizeJalaliDateString(toEnglishDigits(String(raw)).replace(/[\/\.\s]/g, '-'));
          return n || String(raw);
        })(),
        amount: Number(inst.amount) || Number(l.installmentAmount) || 0,
        paid: !!inst.paid
      })) : [];
      // شماره‌گذاری یکنواخت ۱..n
      installments = installments
        .sort((a, b) => (a.number || 0) - (b.number || 0))
        .map((inst, idx) => ({ ...inst, number: idx + 1 }));
      const countFromArr = installments.length;
      let installmentCount = Number(l.installmentCount) || 0;
      // هم‌تراز: اگر آرایه اقساط موجود است، منبع حقیقت همان است
      if (countFromArr > 0) installmentCount = countFromArr;
      else if (installmentCount < 0) installmentCount = 0;
      const startRaw = l.startDate || '';
      const startNorm = normalizeJalaliDateString(toEnglishDigits(String(startRaw)).replace(/[\/\.\s]/g, '-')) || String(startRaw || '');
      return {
        id,
        name: String(l.name || 'بدون نام'),
        amount: Number(l.amount) || 0,
        installmentAmount: Number(l.installmentAmount) || 0,
        installmentCount,
        startDate: startNorm,
        installments
      };
    }).filter(Boolean);
    let currentLoan = null;
    let chartProgress = null;
    let loanOrder = safeParseJSON('loanOrder', []);
    if (!Array.isArray(loanOrder)) loanOrder = [];
    // فقط شناسه‌های موجود در loans را نگه دار
    (function normalizeLoanOrder() {
      const idSet = new Set(loans.map(l => String(l.id)));
      loanOrder = loanOrder.filter(id => idSet.has(String(id)));
      loans.forEach(l => {
        if (!loanOrder.some(id => String(id) === String(l.id))) loanOrder.push(l.id);
      });
    })();
    let editingLoanId = null;

    // ============================================================
    //  CACHE
    // ============================================================
    let cachedLoanCards = {};
    let debounceTimer = null;
    let draggedElement = null;
    let dragOverElement = null;

    // ============================================================
    //  UTILS
    // ============================================================
    const numberWithCommas = x => x?.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",") ?? "0";

    /** جلوگیری از XSS در innerHTML */
    function escapeHtml(str) {
      if (str === undefined || str === null) return '';
      return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
    }

    /** نام امن برای فایل (ویندوز/اندروید/مک) */
    function safeFilename(name, fallback = 'loan') {
      const s = String(name || '')
        .replace(/[\/\\:\*\?"<>\|\x00-\x1f]/g, '_')
        .replace(/\s+/g, '_')
        .replace(/_+/g, '_')
        .replace(/^\.+|\.+$/g, '')
        .slice(0, 80);
      return s || fallback;
    }

    /** تبدیل ارقام فارسی/عربی به انگلیسی */
    /** فرمت مبلغ با ارقام فارسی و جداکننده هزارگان */
    const formatNumber = (input) => {
      const eng = toEnglishDigits(input.value || '').replace(/\D/g, '');
      input.value = eng ? toPersianDigits(numberWithCommas(eng)) : '';
    };

    /** فقط ارقام (برای تعداد اقساط) با نمایش فارسی */
    const formatCountInput = (input) => {
      const eng = toEnglishDigits(input.value || '').replace(/\D/g, '');
      input.value = eng ? toPersianDigits(eng) : '';
    };

    /** نرخ سود: ارقام فارسی + یک نقطه اعشار */
    const formatRateInput = (input) => {
      let s = toEnglishDigits(input.value || '').replace(/[^\d.]/g, '');
      const parts = s.split('.');
      if (parts.length > 2) s = parts[0] + '.' + parts.slice(1).join('');
      if (s.includes('.')) {
        const [a, b = ''] = s.split('.');
        s = a + '.' + b.slice(0, 4);
      }
      if (!s) { input.value = ''; return; }
      if (s.endsWith('.')) {
        input.value = toPersianDigits(s.slice(0, -1)) + '.';
      } else if (s.includes('.')) {
        const [a, b] = s.split('.');
        input.value = toPersianDigits(a) + '.' + toPersianDigits(b);
      } else {
        input.value = toPersianDigits(s);
      }
    };

    const parseNumber = (str) => {
      if (!str) return 0;
      const eng = toEnglishDigits(String(str)).replace(/,/g, '').replace(/[^\d.]/g, '');
      return parseFloat(eng) || 0;
    };

    /**
     * پارس تاریخ ورودی کاربر:
     * - ۱۴۰۵/۰۱/۰۱ یا 1405-01-01 → YYYY-MM-DD
     * - ۰۱-۰۱-۱۴۰۵ (روز-ماه-سال) → ۱۴۰۵-۰۱-۰۱
     * خروجی همیشه انگلیسی YYYY-MM-DD برای ذخیره
     */
    function parseUserDateInput(raw) {
      const s = toEnglishDigits(String(raw || '').trim()).replace(/[\/\.\s]/g, '-');
      if (!s) return '';
      const parts = s.split('-').filter(Boolean);
      if (parts.length !== 3) return '';
      let y, m, d;
      if (parts[0].length === 4) {
        // YYYY-MM-DD یا YYYY/MM/DD
        y = Number(parts[0]); m = Number(parts[1]); d = Number(parts[2]);
      } else if (parts[2].length === 4) {
        // DD-MM-YYYY (مثل ۰۱-۰۱-۱۴۰۵ → ۱۴۰۵/۰۱/۰۱)
        d = Number(parts[0]); m = Number(parts[1]); y = Number(parts[2]);
      } else {
        return '';
      }
      if (!Number.isFinite(y) || !Number.isFinite(m) || !Number.isFinite(d)) return '';
      return normalizeJalaliDateString(`${y}-${m}-${d}`);
    }

    /** تاریخ تسویه وام: اولویت با آخرین قسط، در غیر این صورت محاسبه از شروع */
    function getLoanSettlementDate(loan) {
      if (!loan) return '';
      const insts = loan.installments || [];
      if (insts.length) {
        const last = insts[insts.length - 1];
        if (last && last.date) {
          const n = normalizeJalaliDateString(toEnglishDigits(String(last.date)).replace(/[\/\.\s]/g, '-'));
          if (n) return n;
        }
      }
      const startNorm = normalizeJalaliDateString(
        toEnglishDigits(String(loan.startDate || '')).replace(/[\/\.\s]/g, '-')
      );
      if (!startNorm) return '';
      const start = parseLocalDate(startNorm);
      if (isNaN(start.getTime())) return '';
      const endDate = addMonths(start, Math.max((loan.installmentCount || 1) - 1, 0));
      return toLocalISO(endDate) || '';
    }
    // ============================================================
    //  STORAGE (localStorage + IndexedDB dual-write for durability)
    // ============================================================
    const IDB_NAME = 'EasyVAM_DB';
    const IDB_STORE = 'kv';
    let idbReady = null;

    function openIDB() {
      if (idbReady) return idbReady;
      idbReady = new Promise((resolve, reject) => {
        if (!window.indexedDB) { resolve(null); return; }
        const req = indexedDB.open(IDB_NAME, 1);
        req.onupgradeneeded = () => {
          const db = req.result;
          if (!db.objectStoreNames.contains(IDB_STORE)) {
            db.createObjectStore(IDB_STORE);
          }
        };
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => resolve(null);
      });
      return idbReady;
    }

    async function idbSet(key, value) {
      try {
        const db = await openIDB();
        if (!db) return;
        return new Promise((resolve) => {
          const tx = db.transaction(IDB_STORE, 'readwrite');
          tx.objectStore(IDB_STORE).put(value, key);
          tx.oncomplete = () => resolve(true);
          tx.onerror = () => resolve(false);
        });
      } catch (e) { return false; }
    }

    async function idbGet(key) {
      try {
        const db = await openIDB();
        if (!db) return null;
        return new Promise((resolve) => {
          const tx = db.transaction(IDB_STORE, 'readonly');
          const req = tx.objectStore(IDB_STORE).get(key);
          req.onsuccess = () => resolve(req.result ?? null);
          req.onerror = () => resolve(null);
        });
      } catch (e) { return null; }
    }

    const persist = () => {
      try {
        localStorage.setItem('loans', JSON.stringify(loans));
        localStorage.setItem('loanOrder', JSON.stringify(loanOrder));
        // Dual-write to IndexedDB (more durable, larger quota)
        idbSet('loans', loans);
        idbSet('loanOrder', loanOrder);
      } catch (e) {
        console.error('persist failed', e);
        try { showToast('ذخیره داده ناموفق بود (حافظه پر؟). لطفاً پشتیبان بگیرید.', 'error'); } catch (_) {}
      }
    };

    /** بازیابی از IndexedDB اگر localStorage خالی یا ناقص باشد */
    async function tryRecoverFromIDB() {
      try {
        const idbLoans = await idbGet('loans');
        const idbOrder = await idbGet('loanOrder');
        if (Array.isArray(idbLoans) && idbLoans.length > 0) {
          if (!loans.length || idbLoans.length > loans.length) {
            loans = idbLoans;
            if (Array.isArray(idbOrder)) loanOrder = idbOrder;
            // sync back to localStorage
            try {
              localStorage.setItem('loans', JSON.stringify(loans));
              localStorage.setItem('loanOrder', JSON.stringify(loanOrder));
            } catch (_) {}
            return true;
          }
        }
      } catch (e) {}
      return false;
    }
    function formatDateToPersian(dateString) {
      if (!dateString) return '';
      // YYYY-MM-DD → YYYY/MM/DD با ارقام فارسی (جلوگیری از برعکس‌شدن در RTL)
      const normalized = toEnglishDigits(String(dateString).trim()).replace(/[\/\.\s]/g, '-');
      const parts = normalized.split('-');
      if (parts.length === 3) {
        const [y, m, d] = parts;
        return toPersianDigits(y) + '/' + toPersianDigits(m) + '/' + toPersianDigits(d);
      }
      return toPersianDigits(normalized.replace(/-/g, '/'));
    }

    // ============================================================
    //  JALALI DATE CORE
    //  همه تاریخ‌های برنامه به صورت YYYY-MM-DD شمسی ذخیره می‌شوند.
    //  برای محاسبات داخلی، تاریخ به Gregorian Date تبدیل و دوباره
    //  به شمسی برگردانده می‌شود. این کار جلوی محاسبه اشتباه سال ۱۴۰۵
    //  به عنوان سال میلادی را می‌گیرد.
    // ============================================================
    const jalaliFormatter = new Intl.DateTimeFormat('en-US-u-ca-persian-nu-latn', {
      timeZone: 'UTC', year: 'numeric', month: '2-digit', day: '2-digit'
    });

    function normalizeJalaliDateString(str) {
      if (!str) return '';
      const cleaned = toEnglishDigits(String(str).trim()).replace(/[\/\.\s]/g, '-');
      const parts = cleaned.split('-').map(Number);
      if (parts.length !== 3 || parts.some(n => !Number.isFinite(n))) return '';
      const [y,m,d] = parts;
      if (y < 1200 || y > 1600 || m < 1 || m > 12 || d < 1 || d > 31) return '';
      return `${String(y).padStart(4,'0')}-${String(m).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
    }

    function jalaliPartsFromDate(date) {
      const n = date instanceof Date ? date : new Date(date);
      if (Number.isNaN(n.getTime())) return null;
      const parts = jalaliFormatter.formatToParts(n);
      const out = {};
      parts.forEach(p => { if (p.type === 'year' || p.type === 'month' || p.type === 'day') out[p.type] = Number(p.value); });
      return out.year && out.month && out.day ? out : null;
    }

    function jalaliNumber(parts) {
      return parts.year * 10000 + parts.month * 100 + parts.day;
    }

    function gregorianDateFromJalali(str) {
      const normalized = normalizeJalaliDateString(str);
      if (!normalized) return new Date(NaN);
      const [jy, jm, jd] = normalized.split('-').map(Number);
      const target = jy * 10000 + jm * 100 + jd;
      // سال شمسی موردنظر تقریباً از مارس سال jy+621 شروع می‌شود.
      // بازه را کمی بزرگ‌تر می‌گیریم و با جست‌وجوی دودویی تاریخ دقیق را پیدا می‌کنیم.
      let lo = Date.UTC(jy + 621, 0, 1);
      let hi = Date.UTC(jy + 622, 11, 31);
      while (lo <= hi) {
        const mid = lo + Math.floor((hi - lo) / 2 / 86400000) * 86400000;
        const got = jalaliPartsFromDate(new Date(mid));
        if (!got) break;
        const num = jalaliNumber(got);
        if (num === target) return new Date(mid);
        if (num < target) lo = mid + 86400000;
        else hi = mid - 86400000;
      }
      return new Date(NaN);
    }

    function jalaliDaysInMonth(year, month) {
      if (month <= 6) return 31;
      if (month <= 11) return 30;
      // با بررسی روز ۳۰ و ۲۹، طول اسفند را بدون وابستگی به الگوریتم جداگانه تعیین می‌کنیم.
      return jalaliPartsFromDate(gregorianDateFromJalali(`${year}-12-30`))?.year === year ? 30 : 29;
    }

    function jalaliToDateString(year, month, day) {
      return `${String(year).padStart(4,'0')}-${String(month).padStart(2,'0')}-${String(day).padStart(2,'0')}`;
    }

    // Format a Gregorian Date as local Jalali YYYY-MM-DD.
    const toLocalISO = (date) => {
      const p = jalaliPartsFromDate(date);
      if (!p) return '';
      return jalaliToDateString(p.year, p.month, p.day);
    };

    // Parse a stored Jalali YYYY-MM-DD into a Gregorian Date object for arithmetic.
    const parseLocalDate = (str) => gregorianDateFromJalali(str);

    // Jalali today (YYYY-MM-DD)
    const todayISO = () => toLocalISO(new Date());
    // خروجی‌های رسمی برنامه: تمام تاریخ‌ها فقط شمسی و با ارقام فارسی نمایش داده می‌شوند.
    const reportDateJalali = () => formatDateToPersian(todayISO());
    const reportDateForFilename = () => toPersianDigits(todayISO());

    // Compare two plain Jalali date strings safely.
    const compareDateStrings = (a, b) => String(a || '').localeCompare(String(b || ''));
    const isOverdue = inst => (!inst.paid) && inst.date && compareDateStrings(inst.date, todayISO()) < 0;


    // ============================================================
    //  APP SETTINGS + CURRENCY + AUTOLOCK + NOTIFICATIONS
    // ============================================================
    let appSettings = safeParseJSON('vam_app_settings', {
      currency: 'toman',
      autoLockMinutes: 5,
      notifOverdue: true,
      compactCards: false
    });
    let swWaitingRegistration = null;
    let dashFilter = 'all';
    let autoLockTimer = null;
    let lastActivity = Date.now();

    function currencyLabel() {
      return appSettings.currency === 'rial' ? 'ریال' : 'تومان';
    }
    function formatMoney(n) {
      let v = Number(n) || 0;
      if (appSettings.currency === 'rial') v = v * 10;
      return toPersianDigits(numberWithCommas(v)) + ' ' + currencyLabel();
    }
    /** به‌روزرسانی لیبل‌های واحد پول در فرم محاسبه و ثبت وام */
    function refreshCurrencyLabels() {
      const unit = currencyLabel();
      function setLabelText(labelId, text) {
        const el = document.getElementById(labelId);
        if (!el) return;
        // فقط نود متنی اول را عوض کن تا input داخل label حفظ شود
        for (let i = 0; i < el.childNodes.length; i++) {
          if (el.childNodes[i].nodeType === Node.TEXT_NODE) {
            el.childNodes[i].textContent = text;
            return;
          }
        }
        // اگر نود متنی نبود، اضافه کن
        el.insertBefore(document.createTextNode(text), el.firstChild);
      }
      setLabelText('calc-amount-label', 'مبلغ وام (' + unit + ')\n');
      setLabelText('loan-amount-label', 'مبلغ کل وام (' + unit + ')\n');
      setLabelText('installment-amount-label', 'مبلغ هر قسط (' + unit + ')\n');
      const payHeader = document.getElementById('installment-pay-header');
      if (payHeader) payHeader.textContent = 'پرداخت (' + unit + ')';
    }
    function openSettingsModal() {
      closeSideMenu();
      document.getElementById('set-currency').value = appSettings.currency || 'toman';
      document.getElementById('set-autolock').value = String(appSettings.autoLockMinutes ?? 5);
      document.getElementById('set-notif-overdue').checked = !!appSettings.notifOverdue;
      const c = document.getElementById('set-compact');
      if (c) c.checked = !!appSettings.compactCards;
      document.getElementById('settings-modal').classList.add('open');
    }
    function closeSettingsModal() {
      document.getElementById('settings-modal')?.classList.remove('open');
    }
    function saveAppSettings() {
      appSettings.currency = document.getElementById('set-currency')?.value || 'toman';
      appSettings.autoLockMinutes = parseInt(document.getElementById('set-autolock')?.value || '5', 10);
      appSettings.notifOverdue = !!document.getElementById('set-notif-overdue')?.checked;
      appSettings.compactCards = !!document.getElementById('set-compact')?.checked;
      localStorage.setItem('vam_app_settings', JSON.stringify(appSettings));
      document.body.classList.toggle('compact-cards', !!appSettings.compactCards);
      resetAutoLockTimer();
      refreshCurrencyLabels();
      renderDashboard();
      if (currentLoan) updateManageInstallmentTable();
      // اگر نتیجه محاسبه باز است، دوباره با واحد جدید نمایش بده
      if (lastCalcResult && !document.getElementById('calc-result-box')?.classList.contains('hidden')) {
        runLoanCalculator();
      }
      showToast('تنظیمات ذخیره شد.', 'success');
    }

    function applyCompactFromSettings() {
      document.body.classList.toggle('compact-cards', !!appSettings.compactCards);
    }

    function quickPayFab() {
      showPage('register-loan');
      setTimeout(() => {
        const typeEl = document.getElementById('calc-loan-type');
        if (typeEl) {
          typeEl.focus();
          try { typeEl.scrollIntoView({ behavior: 'smooth', block: 'center' }); } catch (_) {}
        }
      }, 200);
    }
    function goHomeFab() {
      const dash = document.getElementById('dashboard');
      const already = dash && !dash.classList.contains('hidden');
      showPage('dashboard');
      const scrollTop = () => {
        try {
          window.scrollTo({ top: 0, behavior: 'smooth' });
          document.documentElement.scrollTop = 0;
          document.body.scrollTop = 0;
        } catch (e) {
          window.scrollTo(0, 0);
        }
      };
      if (already) scrollTop();
      else setTimeout(scrollTop, 50);
    }

    let boostBusy = false;
    /** موشک: پاک‌سازی کش / آزادسازی حافظه — داده‌های وام حفظ می‌شوند */
    async function boostAppSpeed() {
      if (boostBusy) return;
      boostBusy = true;
      const btn = document.getElementById('fab-boost');
      if (btn) btn.classList.add('boosting');

      try {
        // ۱) کش موقت در حافظه
        if (typeof cachedLoanCards === 'object') cachedLoanCards = {};
        if (typeof debounceTimer !== 'undefined' && debounceTimer) {
          clearTimeout(debounceTimer);
          debounceTimer = null;
        }

        // ۲) نابود کردن نمودارهای Chart.js (حافظه)
        try {
          if (typeof chartProgress !== 'undefined' && chartProgress) {
            chartProgress.destroy();
            chartProgress = null;
          }
          if (typeof chartAllLoans !== 'undefined' && chartAllLoans) {
            chartAllLoans.destroy();
            chartAllLoans = null;
          }
        } catch (e) {}

        // ۳) پاک کردن Cache Storage سرویس‌ورکر (دارایی‌های قدیمی)
        let cacheCount = 0;
        if (typeof caches !== 'undefined') {
          const keys = await caches.keys();
          await Promise.all(keys.map(k => { cacheCount++; return caches.delete(k); }));
        }

        // ۴) sessionStorage سبک (به‌جز وضعیت ورود)
        try {
          const keep = ['vam_logged_in', 'vam_user_id'];
          const toRemove = [];
          for (let i = 0; i < sessionStorage.length; i++) {
            const k = sessionStorage.key(i);
            if (k && !keep.includes(k)) toRemove.push(k);
          }
          toRemove.forEach(k => sessionStorage.removeItem(k));
        } catch (e) {}

        // ۵) رندر دوباره سبک + اسکرول بالا
        try {
          renderDashboard();
        } catch (e) {}
        try {
          window.scrollTo({ top: 0, behavior: 'smooth' });
        } catch (e) { window.scrollTo(0, 0); }

        // ۶) اگر SW هست، کش را دوباره پر می‌کند در پس‌زمینه
        if ('serviceWorker' in navigator) {
          try {
            const regs = await navigator.serviceWorker.getRegistrations();
            for (const reg of regs) {
              try { await reg.update(); } catch (e) {}
            }
          } catch (e) {}
        }

        showToast('🚀 سرعت بهینه شد — کش پاک شد' + (cacheCount ? ` (${toPersianDigits(cacheCount)} کش)` : ''), 'success');
      } catch (err) {
        console.error(err);
        showToast('بهینه‌سازی با خطا مواجه شد.', 'error');
      } finally {
        setTimeout(() => {
          if (btn) btn.classList.remove('boosting');
          boostBusy = false;
        }, 900);
      }
    }

    function applySwUpdate() {
      const banner = document.getElementById('sw-update-banner');
      if (swWaitingRegistration && swWaitingRegistration.waiting) {
        swWaitingRegistration.waiting.postMessage({ type: 'SKIP_WAITING' });
      }
      if (banner) banner.classList.remove('show');
      setTimeout(() => location.reload(), 400);
    }

    function registerServiceWorkerWithUpdate() {
      if (!('serviceWorker' in navigator)) return;
      navigator.serviceWorker.register('./sw.js').then(reg => {
        console.log('SW registered', reg.scope);
        if (reg.waiting) {
          swWaitingRegistration = reg;
          document.getElementById('sw-update-banner')?.classList.add('show');
        }
        reg.addEventListener('updatefound', () => {
          const nw = reg.installing;
          if (!nw) return;
          nw.addEventListener('statechange', () => {
            if (nw.state === 'installed' && navigator.serviceWorker.controller) {
              swWaitingRegistration = reg;
              document.getElementById('sw-update-banner')?.classList.add('show');
            }
          });
        });
      }).catch(err => console.log('SW failed', err));

      let refreshing = false;
      navigator.serviceWorker.addEventListener('controllerchange', () => {
        if (refreshing) return;
        refreshing = true;
        location.reload();
      });
    }

    function setDashFilter(f) {
      dashFilter = f;
      document.querySelectorAll('.dash-filter-btn').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.filter === f);
      });
      renderLoanCards();
    }
    function loanMatchesFilter(loan) {
      const paidCount = (loan.installments || []).filter(i => i.paid).length;
      const total = loan.installmentCount || 0;
      const hasOverdue = (loan.installments || []).some(i => isOverdue(i));
      if (dashFilter === 'active') return paidCount < total;
      if (dashFilter === 'done') return total > 0 && paidCount >= total;
      if (dashFilter === 'overdue') return hasOverdue;
      return true;
    }
    function loanMatchesSearch(loan) {
      const q = (document.getElementById('dash-search')?.value || '').trim().toLowerCase();
      if (!q) return true;
      return String(loan.name || '').toLowerCase().includes(q);
    }

    function resetAutoLockTimer() {
      lastActivity = Date.now();
      if (autoLockTimer) clearTimeout(autoLockTimer);
      const mins = Number(appSettings.autoLockMinutes) || 0;
      if (mins <= 0) return;
      autoLockTimer = setTimeout(() => {
        if (sessionStorage.getItem('vam_logged_in') === '1') {
          const users = getUsers();
          if (users.some(u => u.passwordHash)) {
            sessionStorage.removeItem('vam_logged_in');
            sessionStorage.removeItem('vam_user_id');
            showLoginScreen();
            showToast('به دلیل عدم فعالیت، برنامه قفل شد.', 'info');
          }
        }
      }, mins * 60 * 1000);
    }
    function setupActivityWatchers() {
      const events = ['pointerdown', 'keydown', 'touchstart', 'scroll', 'mousemove'];
      events.forEach(ev => {
        document.addEventListener(ev, () => {
          if (Date.now() - lastActivity > 15000) resetAutoLockTimer();
          else lastActivity = Date.now();
        }, { passive: true });
      });
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') resetAutoLockTimer();
      });
    }

    function notifIconUrl() {
      try {
        return new URL('icons/icon-192.png', window.location.href).href;
      } catch (e) {
        return 'icons/icon-192.png';
      }
    }

    async function showSystemNotification(title, options = {}) {
      const opts = {
        body: options.body || '',
        icon: options.icon || notifIconUrl(),
        badge: options.badge || notifIconUrl(),
        tag: options.tag || ('vam-' + Date.now()),
        dir: 'rtl',
        lang: 'fa',
        renotify: !!options.renotify,
        data: options.data || {},
        silent: false
      };
      // اولویت با Service Worker (موبایل / PWA پایدارتر است)
      try {
        if ('serviceWorker' in navigator) {
          const reg = await navigator.serviceWorker.ready;
          if (reg && typeof reg.showNotification === 'function') {
            await reg.showNotification(title, opts);
            return true;
          }
        }
      } catch (e) {
        console.warn('SW notification failed', e);
      }
      // fallback: Notification سازنده صفحه
      try {
        if ('Notification' in window && Notification.permission === 'granted') {
          const n = new Notification(title, opts);
          n.onclick = () => {
            try { window.focus(); } catch (_) {}
            try { n.close(); } catch (_) {}
          };
          return true;
        }
      } catch (e) {
        console.warn('Page notification failed', e);
      }
      return false;
    }

    async function requestNotifPermission() {
      if (!('Notification' in window)) {
        return showToast('این مرورگر از اعلان پشتیبانی نمی‌کند.', 'warning');
      }
      // بعضی محیط‌ها (مثل content://) secure context نیستند
      if (typeof window.isSecureContext === 'boolean' && !window.isSecureContext) {
        showToast('برای اعلان، برنامه را از طریق HTTPS یا نصب PWA باز کنید.', 'warning');
      }
      try {
        const perm = await Notification.requestPermission();
        if (perm === 'granted') {
          showToast('مجوز اعلان داده شد.', 'success');
          // اعلان آزمایشی تا کاربر ببیند کار می‌کند
          await showSystemNotification('سیستم مدیریت وام', {
            body: 'اعلان‌ها فعال شد. برای اقساط معوق و نزدیک سررسید مطلع می‌شوید.',
            tag: 'vam-permission-ok',
            renotify: true
          });
          await maybeShowOverdueNotifications(true);
        } else if (perm === 'denied') {
          showToast('مجوز اعلان رد شد. از تنظیمات مرورگر فعال کنید.', 'warning');
        } else {
          showToast('مجوز اعلان داده نشد.', 'warning');
        }
      } catch (e) {
        console.error(e);
        showToast('خطا در درخواست مجوز اعلان.', 'error');
      }
    }

    async function maybeShowOverdueNotifications(forceFeedback = false) {
      if (!appSettings.notifOverdue) {
        if (forceFeedback) showToast('اعلان اقساط معوق در تنظیمات خاموش است.', 'info');
        return;
      }
      if (!('Notification' in window) || Notification.permission !== 'granted') {
        if (forceFeedback) showToast('مجوز اعلان فعال نیست.', 'warning');
        return;
      }
      // معوق + امروز + تا ۳ روز آینده
      const items = buildNotifications().filter(n => n.type === 'overdue' || n.type === 'soon');
      if (!items.length) {
        if (forceFeedback) showToast('قسط معوق یا نزدیک سررسیدی برای اعلان نیست.', 'info');
        return;
      }
      // حداکثر ۵ اعلان
      const batch = items.slice(0, 5);
      let shown = 0;
      for (let idx = 0; idx < batch.length; idx++) {
        const item = batch[idx];
        await new Promise(r => setTimeout(r, idx === 0 ? 400 : 700));
        const ok = await showSystemNotification(item.title || 'یادآوری قسط', {
          body: item.body || '',
          tag: 'vam-' + item.type + '-' + item.id,
          renotify: true,
          data: { loanId: item.loanId, notifId: item.id }
        });
        if (ok) shown++;
      }
      if (forceFeedback) {
        if (shown > 0) showToast(toPersianDigits(shown) + ' اعلان ارسال شد.', 'success');
        else showToast('مرورگر اعلان را نشان نداد. اگر PWA است، یک‌بار برنامه را ببندید و دوباره باز کنید.', 'warning');
      }
    }

    function payAllOverdue() {
      if (!currentLoan) return showToast('یک وام انتخاب کنید.', 'error');
      let count = 0;
      (currentLoan.installments || []).forEach(inst => {
        if (isOverdue(inst) && !inst.paid) {
          inst.paid = true;
          count++;
        }
      });
      if (!count) return showToast('قسط معوقی وجود ندارد.', 'info');
      persist();
      updateManageInstallmentTable();
      renderDashboard();
      showToast(toPersianDigits(count) + ' قسط معوق پرداخت شد.', 'success');
    }

    function startEditInstAmount(num) {
      if (!currentLoan) return;
      const inst = (currentLoan.installments || []).find(x => x.number === num);
      if (!inst) return;
      const cell = document.querySelector(`[data-inst-amount="${num}"]`);
      if (!cell) return;
      const current = inst.amount || 0;
      cell.innerHTML = `<input class="inst-amount-edit" type="text" inputmode="numeric" value="${toPersianDigits(numberWithCommas(current))}" oninput="formatNumber(this)" onkeydown="if(event.key==='Enter')saveInstAmount(${num}, this)" onblur="saveInstAmount(${num}, this)" />`;
      const inp = cell.querySelector('input');
      if (inp) { inp.focus(); inp.select(); }
    }
    function saveInstAmount(num, input) {
      if (!currentLoan) return;
      const inst = (currentLoan.installments || []).find(x => x.number === num);
      if (!inst) return;
      const val = parseNumber(input.value);
      if (val < 0) return showToast('مبلغ نامعتبر است.', 'error');
      inst.amount = val;
      persist();
      updateManageInstallmentTable();
      renderDashboard();
      showToast('مبلغ قسط ' + toPersianDigits(num) + ' به‌روز شد.', 'success');
    }

    function updateLastBackupInfo() {
      const el = document.getElementById('last-backup-info');
      if (!el) return;
      const ts = localStorage.getItem('vam_last_backup');
      if (!ts) {
        el.textContent = 'هنوز پشتیبان گرفته نشده است.';
        return;
      }
      try {
        const d = new Date(ts);
        el.textContent = 'آخرین پشتیبان: ' + toPersianDigits(d.toLocaleString('fa-IR'));
      } catch (e) {
        el.textContent = 'آخرین پشتیبان: ' + ts;
      }
    }

    function exportFullExcelBackup() {
      if (typeof XLSX === 'undefined') return showToast('کتابخانه اکسل در دسترس نیست.', 'error');
      if (!loans.length) return showToast('وامی برای خروجی وجود ندارد.', 'warning');
      const wb = XLSX.utils.book_new();
      // sheet 1: summary
      const summary = [
        ['گزارش کامل سیستم مدیریت وام'],
        ['تاریخ', reportDateJalali()],
        ['تعداد وام‌ها', loans.length],
        [],
        ['نام وام', 'مبلغ کل', 'مبلغ قسط', 'تعداد اقساط', 'پرداخت‌شده', 'مانده', 'تاریخ شروع', 'تاریخ تسویه']
      ];
      loans.forEach(loan => {
        const paid = (loan.installments || []).filter(i => i.paid).length;
        const remain = Math.max((loan.installmentCount || 0) - paid, 0);
        const settle = getLoanSettlementDate(loan);
        summary.push([
          loan.name, loan.amount, loan.installmentAmount, loan.installmentCount,
          paid, remain, formatDateToPersian(loan.startDate), settle ? formatDateToPersian(settle) : '—'
        ]);
      });
      XLSX.utils.book_append_sheet(wb, excelSheetFromAoA(summary, 'خلاصه'), 'خلاصه');
      // per-loan sheets (limit to avoid huge files)
      loans.slice(0, 20).forEach((loan, idx) => {
        const aoa = [
          ['اقساط وام: ' + (loan.name || '')],
          ['شماره', 'تاریخ', 'مبلغ', 'وضعیت']
        ];
        (loan.installments || []).forEach(inst => {
          aoa.push([inst.number, formatDateToPersian(inst.date), inst.amount, inst.paid ? 'پرداخت‌شده' : 'پرداخت‌نشده']);
        });
        const name = ('قسط' + (idx + 1)).slice(0, 28);
        XLSX.utils.book_append_sheet(wb, excelSheetFromAoA(aoa, name), name);
      });
      downloadWorkbook(wb, `vam_full_backup_${reportDateForFilename()}_${loans.length}loans.xlsx`);
      localStorage.setItem('vam_last_backup', new Date().toISOString());
      updateLastBackupInfo();
      showToast('خروجی اکسل کامل ذخیره شد.', 'success');
    }

    async function shareLoanReport() {
      const sel = document.getElementById('report-loan-select');
      const id = sel?.value;
      if (!id) return showToast('یک وام انتخاب کنید.', 'error');
      const loan = loans.find(l => String(l.id) === String(id));
      if (!loan) return;
      const paid = (loan.installments || []).filter(i => i.paid).length;
      const remain = Math.max((loan.installmentCount || 0) - paid, 0);
      const text = `گزارش وام «${loan.name}»\nمبلغ کل: ${formatMoney(loan.amount)}\nاقساط: ${paid}/${loan.installmentCount}\nمانده: ${remain} قسط\nسیستم مدیریت وام`;
      try {
        if (navigator.share) {
          await navigator.share({ title: 'گزارش وام', text });
          showToast('اشتراک‌گذاری انجام شد.', 'success');
        } else {
          await navigator.clipboard.writeText(text);
          showToast('متن گزارش در کلیپ‌بورد کپی شد.', 'success');
        }
      } catch (e) {
        if (e.name !== 'AbortError') showToast('اشتراک‌گذاری لغو یا ناموفق بود.', 'info');
      }
    }


    // ============================================================
    //  NOTIFICATIONS (bell)
    // ============================================================
    function daysUntilDate(dateStr) {
      if (!dateStr) return null;
      const target = parseLocalDate(dateStr);
      const today = parseLocalDate(todayISO());
      if (isNaN(target.getTime()) || isNaN(today.getTime())) return null;
      return Math.round((target.getTime() - today.getTime()) / 86400000);
    }
    function getSeenNotificationIds() {
      const arr = safeParseJSON('vam_notif_seen', []);
      return Array.isArray(arr) ? arr : [];
    }
    function saveSeenNotificationIds(ids) {
      // keep list from growing forever
      const trimmed = ids.slice(-500);
      localStorage.setItem('vam_notif_seen', JSON.stringify(trimmed));
    }
    function buildNotifications() {
      const items = [];
      (loans || []).forEach(loan => {
        (loan.installments || []).forEach(inst => {
          if (inst.paid || !inst.date) return;
          const days = daysUntilDate(inst.date);
          if (days === null) return;
          if (days < 0) {
            items.push({
              id: `${loan.id}-${inst.number}-overdue`,
              type: 'overdue',
              loanId: loan.id,
              loanName: loan.name,
              instNumber: inst.number,
              date: inst.date,
              amount: inst.amount,
              days,
              title: 'قسط سررسید شده',
              body: `وام «${loan.name}» — قسط ${toPersianDigits(inst.number)} · ${formatDateToPersian(inst.date)} · ${formatMoney(inst.amount)} · ${toPersianDigits(Math.abs(days))} روز تأخیر`
            });
          } else if (days <= 3) {
            items.push({
              id: `${loan.id}-${inst.number}-soon`,
              type: 'soon',
              loanId: loan.id,
              loanName: loan.name,
              instNumber: inst.number,
              date: inst.date,
              amount: inst.amount,
              days,
              title: days === 0 ? 'قسط امروز سررسید می‌شود' : `فقط ${toPersianDigits(days)} روز تا سررسید`,
              body: `وام «${loan.name}» — قسط ${toPersianDigits(inst.number)} · ${formatDateToPersian(inst.date)} · ${formatMoney(inst.amount)}`
            });
          }
        });
      });
      // overdue first (most delayed first), then soon (soonest first)
      items.sort((a, b) => {
        if (a.type !== b.type) return a.type === 'overdue' ? -1 : 1;
        if (a.type === 'overdue') return a.days - b.days; // more negative (older) first
        return a.days - b.days; // smaller days first
      });
      return items;
    }
    function updateNotificationBadge() {
      const items = buildNotifications();
      const seen = new Set(getSeenNotificationIds());
      const unseen = items.filter(i => !seen.has(i.id)).length;
      const badge = document.getElementById('notif-badge');
      if (!badge) return;
      if (unseen > 0) {
        badge.textContent = toPersianDigits(unseen > 99 ? '99+' : String(unseen));
        badge.classList.remove('hidden');
      } else {
        badge.classList.add('hidden');
      }
    }
    function renderNotificationList() {
      const list = document.getElementById('notif-list');
      if (!list) return;
      const items = buildNotifications();
      const seen = new Set(getSeenNotificationIds());
      if (!items.length) {
        list.innerHTML = '<div class="notif-empty"><i class="fa-regular fa-bell-slash mb-2" style="font-size:1.4rem;display:block;"></i>اعلان فعالی نیست</div>';
        return;
      }
      list.innerHTML = items.map(item => {
        const isSeen = seen.has(item.id);
        const delayOrSoon = item.type === 'overdue'
          ? `<span class="meta-delay"><i class="fa-solid fa-hourglass-end"></i> ${toPersianDigits(Math.abs(item.days))} روز تأخیر</span>`
          : `<span class="meta-soon"><i class="fa-solid fa-hourglass-half"></i> ${item.days === 0 ? 'امروز' : toPersianDigits(item.days) + ' روز مانده'}</span>`;
        return `
          <div class="notif-item ${item.type} ${isSeen ? 'seen' : ''}" data-notif-id="${item.id}" onclick="onNotificationClick('${item.loanId}','${item.id}')">
            <div class="notif-item-title">
              <i class="fa-solid ${item.type === 'overdue' ? 'fa-circle-exclamation text-rose-500' : 'fa-clock text-amber-500'}"></i>
              ${item.title}
            </div>
            <div class="notif-item-loan">وام «${escapeHtml(item.loanName)}» — قسط ${toPersianDigits(item.instNumber)}</div>
            <div class="notif-item-meta">
              <span><i class="fa-regular fa-calendar"></i> ${formatDateToPersian(item.date)}</span>
              <span class="meta-amount"><i class="fa-solid fa-coins"></i> ${formatMoney(item.amount)}</span>
              ${delayOrSoon}
            </div>
          </div>`;
      }).join('');
    }
    function toggleNotifPanel() {
      const panel = document.getElementById('notif-panel');
      const overlay = document.getElementById('notif-overlay');
      if (!panel) return;
      const opening = panel.classList.contains('hidden');
      if (opening) {
        closeSideMenu();
        renderNotificationList();
        panel.classList.remove('hidden');
        overlay?.classList.remove('hidden');
        // mark visible as seen when opened
        markVisibleNotificationsSeen(false);
        updateNotificationBadge();
        renderNotificationList();
      } else {
        closeNotifPanel();
      }
    }
    function closeNotifPanel() {
      document.getElementById('notif-panel')?.classList.add('hidden');
      document.getElementById('notif-overlay')?.classList.add('hidden');
    }
    function markVisibleNotificationsSeen(updateUi = true) {
      const items = buildNotifications();
      const seen = new Set(getSeenNotificationIds());
      items.forEach(i => seen.add(i.id));
      saveSeenNotificationIds([...seen]);
      if (updateUi) {
        updateNotificationBadge();
        renderNotificationList();
      }
    }
    function markAllNotificationsSeen() {
      markVisibleNotificationsSeen(true);
      showToast('همه اعلان‌ها خوانده شد.', 'info');
    }
    function onNotificationClick(loanId, notifId) {
      const seen = new Set(getSeenNotificationIds());
      seen.add(notifId);
      saveSeenNotificationIds([...seen]);
      updateNotificationBadge();
      renderNotificationList();
      closeNotifPanel();
      // show neat detail box
      const items = buildNotifications();
      const item = items.find(i => i.id === notifId) || {
        id: notifId,
        loanId,
        title: 'اعلان',
        loanName: '',
        instNumber: '',
        date: '',
        amount: 0,
        days: 0,
        type: 'overdue'
      };
      // if not found in current (already paid?), still try to show from seen data, but simple: rebuild from loans
      showNotifDetail(item);
    }

    function showNotifDetail(item) {
      const overlay = document.getElementById('notif-detail-overlay');
      const box = document.getElementById('notif-detail-box');
      if (!overlay || !box) return;

      // if item incomplete, try to rebuild full info
      if (!item.loanName && item.loanId) {
        const full = buildNotifications().find(i => i.id === item.id);
        if (full) item = full;
        else {
          const loan = (loans || []).find(l => String(l.id) === String(item.loanId));
          if (loan) {
            item.loanName = loan.name;
            const inst = (loan.installments || []).find(i => String(i.number) === String(item.instNumber));
            if (inst) {
              item.date = inst.date;
              item.amount = inst.amount;
              item.days = daysUntilDate(inst.date);
            }
          }
        }
      }

      const isOverdue = item.type === 'overdue' || (item.days != null && item.days < 0);
      const statusText = isOverdue
        ? `${toPersianDigits(Math.abs(item.days || 0))} روز تأخیر`
        : (item.days === 0 ? 'امروز سررسید می‌شود' : `${toPersianDigits(item.days)} روز مانده`);
      const statusColor = isOverdue ? '#ef4444' : '#d97706';

      box.innerHTML = `
        <div class="notif-detail-header">
          <div class="notif-detail-title">
            <i class="fa-solid ${isOverdue ? 'fa-circle-exclamation' : 'fa-clock'}" style="color:${statusColor}"></i>
            ${item.title || (isOverdue ? 'قسط سررسید شده' : 'یادآوری قسط')}
          </div>
          <button type="button" class="notif-detail-close" onclick="closeNotifDetail()" aria-label="بستن">
            <i class="fa-solid fa-xmark"></i>
          </button>
        </div>
        <div class="notif-detail-body">
          <div class="notif-detail-row">
            <span class="notif-detail-label">نام وام</span>
            <span class="notif-detail-value">«${escapeHtml(item.loanName || '—')}»</span>
          </div>
          <div class="notif-detail-row">
            <span class="notif-detail-label">شماره قسط</span>
            <span class="notif-detail-value">${toPersianDigits(item.instNumber || '—')}</span>
          </div>
          <div class="notif-detail-row">
            <span class="notif-detail-label">تاریخ سررسید</span>
            <span class="notif-detail-value">${item.date ? formatDateToPersian(item.date) : '—'}</span>
          </div>
          <div class="notif-detail-row">
            <span class="notif-detail-label">مبلغ قسط</span>
            <span class="notif-detail-value">${formatMoney(item.amount || 0)}</span>
          </div>
          <div class="notif-detail-row">
            <span class="notif-detail-label">وضعیت</span>
            <span class="notif-detail-value" style="color:${statusColor}">${statusText}</span>
          </div>
        </div>
        <div class="notif-detail-actions">
          <button type="button" class="notif-detail-btn-secondary" onclick="closeNotifDetail()">بستن</button>
          <button type="button" class="notif-detail-btn-primary" onclick="closeNotifDetail(); selectAndShowPage('${item.loanId}','manage-loans')">
            <i class="fa-solid fa-arrow-left me-1"></i>رفتن به وام
          </button>
        </div>
      `;
      overlay.classList.remove('hidden');
    }

    function closeNotifDetail() {
      document.getElementById('notif-detail-overlay')?.classList.add('hidden');
    }

    function addMonths(date, months) {
      const base = date instanceof Date ? date : new Date(date);
      const p = jalaliPartsFromDate(base);
      if (!p) return new Date(NaN);
      const total = (p.year * 12 + (p.month - 1)) + Number(months || 0);
      const year = Math.floor(total / 12);
      const month = (total % 12) + 1;
      const day = Math.min(p.day, jalaliDaysInMonth(year, month));
      return gregorianDateFromJalali(jalaliToDateString(year, month, day));
    }

    function debounce(func, wait) {
      return function executedFunction(...args) {
        const later = () => {
          clearTimeout(debounceTimer);
          func(...args);
        };
        clearTimeout(debounceTimer);
        debounceTimer = setTimeout(later, wait);
      };
    }

    // ============================================================
    //  CHART PLUGIN
    // ============================================================
    const shadowPlugin = {
      id: 'shadowPlugin',
      beforeDatasetsDraw(chart, args, opts){
        const { ctx } = chart;
        ctx.save();
        ctx.shadowColor = 'rgba(0,0,0,.04)';
        ctx.shadowBlur = 12;
        ctx.shadowOffsetX = 4;
        ctx.shadowOffsetY = 6;
      },
      afterDatasetsDraw(chart){
        chart.ctx.restore();
      }
    };
    Chart.register(shadowPlugin);
    Chart.register(ChartDataLabels);
    Chart.defaults.font.family = 'Vazirmatn, Tahoma, Arial, sans-serif';
    Chart.defaults.font.size = 12;

    // ============================================================
    //  NAVIGATION + SIDE MENU
    // ============================================================
    function openSideMenu() {
      closeNotifPanel();
      document.getElementById('side-menu')?.classList.add('open');
      document.getElementById('side-menu-overlay')?.classList.add('open');
      document.getElementById('menu-toggle')?.classList.add('active');
      const menu = document.getElementById('side-menu');
      if (menu) menu.setAttribute('aria-hidden', 'false');
      document.body.style.overflow = 'hidden';
    }
    function closeSideMenu() {
      document.getElementById('side-menu')?.classList.remove('open');
      document.getElementById('side-menu-overlay')?.classList.remove('open');
      document.getElementById('menu-toggle')?.classList.remove('active');
      const menu = document.getElementById('side-menu');
      if (menu) menu.setAttribute('aria-hidden', 'true');
      document.body.style.overflow = '';
    }
    function toggleSideMenu() {
      const menu = document.getElementById('side-menu');
      if (menu?.classList.contains('open')) closeSideMenu();
      else openSideMenu();
    }
    function navigateTo(id) {
      closeSideMenu();
      showPage(id);
    }

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') closeSideMenu();
    });

    function showPage(id){
      closeSideMenu();
      document.querySelectorAll('main > section').forEach(s=>s.classList.add('hidden'));
      document.getElementById(id)?.classList.remove('hidden');
      if (id==='dashboard') renderDashboard();
      if (id==='manage-loans') { updateSelects(); loadLoanForManagement(); }
      if (id==='reports') { updateSelects(); }
      if (id==='register-loan') clearRegisterForm();
      if (id==='backup-delete') { updateSelects(); updateLastBackupInfo(); updateBackupFolderStatus(); }
    }

    function updateSelects(){
      const ids = ['manage-loan-select','report-loan-select','delete-loan-select'];
      ids.forEach(id=>{
        const sel = document.getElementById(id); if (!sel) return;
        const prev = sel.value;
        sel.innerHTML = '<option value="">-- انتخاب وام --</option>';
        loans.forEach(loan=>{ 
          const opt=document.createElement('option'); 
          opt.value=loan.id; 
          opt.textContent=loan.name; 
          sel.appendChild(opt); 
        });
        if (prev) sel.value = prev;
      });
    }

    // ============================================================
    //  EDIT NAME - FIXED
    // ============================================================
    function startEditName(loanId) {
      editingLoanId = loanId;
      renderDashboard();
      // فوکوس روی input بعد از رندر
      setTimeout(() => {
        const input = document.querySelector(`.loan-name-input[data-loan-id="${loanId}"]`);
        if (input) {
          input.disabled = false;
          input.focus();
          input.select();
        }
      }, 150);
    }

    function saveNameEdit(loanId, input) {
      const newName = input.value.trim();
      if (!newName) {
        showToast('نام وام نمی‌تواند خالی باشد.', 'error');
        const loan = loans.find(l => l.id === loanId);
        if (loan) input.value = loan.name;
        return;
      }
      
      const loan = loans.find(l => l.id === loanId);
      if (loan) {
        loan.name = newName;
        persist();
        editingLoanId = null;
        // به‌روزرسانی همه جای برنامه
        updateSelects();
        renderDashboard();
        showToast('نام وام با موفقیت ویرایش شد.', 'success');
      }
    }

    function cancelNameEdit(loanId) {
      editingLoanId = null;
      renderDashboard();
    }

    // ============================================================
    //  LOAN CALCULATOR (فرمول بانکی / قرض‌الحسنه — مشابه باحساب)
    // ============================================================
    let lastCalcResult = null;

    /**
     * اقساط مساوی بانکی (PMT):
     * i = نرخ هر دوره، A = P * i(1+i)^n / ((1+i)^n - 1)
     * نرخ هر دوره از سود سالانه و فاصله اقساط به‌ماه به‌دست می‌آید.
     */
    function calcBankEqualInstallment(principal, annualRatePercent, count, intervalMonths) {
      const P = Number(principal) || 0;
      const n = Math.floor(Number(count) || 0);
      const m = Math.max(1, Number(intervalMonths) || 1);
      const annual = Number(annualRatePercent) || 0;
      if (P <= 0 || n <= 0) return null;
      if (annual <= 0) {
        const inst = Math.round(P / n);
        return { installment: inst, totalPay: inst * n, extra: inst * n - P, type: 'bank' };
      }
      const i = (annual / 100) * (m / 12); // نرخ هر دوره
      let inst;
      if (Math.abs(i) < 1e-12) {
        inst = P / n;
      } else {
        const factor = Math.pow(1 + i, n);
        inst = P * (i * factor) / (factor - 1);
      }
      inst = Math.round(inst);
      const totalPay = inst * n;
      return { installment: inst, totalPay, extra: totalPay - P, type: 'bank' };
    }

    /**
     * قرض‌الحسنه با کارمزد (روش استاندارد بانکی ایران — مشابه باحساب):
     * - هر سال: ۱ قسط کارمزد + ۱۱ قسط اصل
     * - تعداد اقساط اصل = n − years
     * - قسط اصل = اصل ÷ تعداد اقساط اصل
     * - کارمزد هر سال = نرخ٪ × مانده اصل در ابتدای آن سال
     * - کارمزد در اقساط ۱، ۱۳، ۲۵، ... دریافت می‌شود
     */
    function calcQarzInstallment(principal, feeRatePercent, count, intervalMonths) {
      const P = Number(principal) || 0;
      const n = Math.floor(Number(count) || 0);
      const m = Math.max(1, Number(intervalMonths) || 1);
      const fee = Number(feeRatePercent) || 0;
      if (P <= 0 || n <= 0) return null;

      // فقط برای فاصله ماهانه استاندارد (۱ ماه) روش بانکی اعمال می‌شود
      if (m !== 1) {
        // fallback ساده برای فاصله غیرماهانه
        const years = (n * m) / 12;
        const totalFee = Math.round(P * (fee / 100) * years);
        const totalPay = P + totalFee;
        const inst = Math.round(totalPay / n);
        return { installment: inst, totalPay: inst * n, extra: inst * n - P, type: 'qarz', totalFee, schedule: null };
      }

      const years = Math.ceil(n / 12);
      const principalCount = n - years; // تعداد اقساط اصل
      if (principalCount <= 0) return null;

      const principalInst = Math.round(P / principalCount); // مبلغ قسط اصل (رند شده)

      // ساخت جدول اقساط و محاسبه کارمزد بر اساس مانده
      const schedule = [];
      let remaining = P;
      let totalFee = 0;
      let totalPay = 0;
      let principalPaidCount = 0;

      for (let i = 1; i <= n; i++) {
        const isFeeInstallment = ((i - 1) % 12 === 0); // اقساط ۱، ۱۳، ۲۵، ...
        let amount = 0;
        let feePart = 0;
        let principalPart = 0;

        if (isFeeInstallment && fee > 0) {
          // کارمزد سال جاری بر اساس مانده فعلی
          feePart = Math.round(remaining * (fee / 100));
          amount = feePart;
          totalFee += feePart;
        } else {
          // قسط اصل
          principalPart = principalInst;
          // آخرین قسط اصل را تنظیم کن تا جمع دقیقاً P شود
          if (principalPaidCount === principalCount - 1) {
            principalPart = remaining; // باقی‌مانده دقیق
          }
          amount = principalPart;
          remaining -= principalPart;
          if (remaining < 0) remaining = 0;
          principalPaidCount++;
        }

        totalPay += amount;
        schedule.push({
          number: i,
          amount,
          isFee: isFeeInstallment && fee > 0,
          feePart,
          principalPart,
          remainingAfter: Math.max(0, remaining)
        });
      }

      // مبلغ نمایشی «هر قسط» = قسط اصل (چون در باحساب هم همین‌طور نشان داده می‌شود)
      return {
        installment: principalInst,
        totalPay,
        extra: totalFee,
        type: 'qarz',
        totalFee,
        schedule,
        principalCount,
        years
      };
    }

    function runLoanCalculator() {
      const type = document.getElementById('calc-loan-type')?.value || 'bank';
      const amount = parseNumber(document.getElementById('calc-amount')?.value);
      const rate = parseNumber(document.getElementById('calc-rate')?.value);
      const count = parseNumber(document.getElementById('calc-count')?.value);
      const interval = parseNumber(document.getElementById('calc-interval')?.value) || 1;

      if (amount <= 0) return showToast('مبلغ وام را وارد کنید.', 'error');
      if (count <= 0) return showToast('تعداد اقساط را وارد کنید.', 'error');
      if (type === 'bank' && rate < 0) return showToast('نرخ سود نامعتبر است.', 'error');
      if (type === 'qarz' && rate < 0) return showToast('نرخ کارمزد نامعتبر است.', 'error');

      const result = type === 'qarz'
        ? calcQarzInstallment(amount, rate, count, interval)
        : calcBankEqualInstallment(amount, rate, count, interval);

      if (!result) return showToast('محاسبه ناموفق بود.', 'error');

      lastCalcResult = {
        ...result,
        amount,
        rate,
        count: Math.floor(count),
        interval,
        type
      };

      const box = document.getElementById('calc-result-box');
      if (box) box.classList.remove('hidden');
      const elInst = document.getElementById('calc-out-installment');
      const elTotal = document.getElementById('calc-out-total');
      const elExtra = document.getElementById('calc-out-extra');
      const elExtraLabel = document.getElementById('calc-out-extra-label');
      const elHint = document.getElementById('calc-out-hint');
      if (elInst) elInst.textContent = formatMoney(result.installment);
      if (elTotal) elTotal.textContent = formatMoney(result.totalPay);
      if (elExtra) elExtra.textContent = formatMoney(Math.max(0, result.extra));
      if (elExtraLabel) elExtraLabel.textContent = type === 'qarz' ? 'جمع کارمزد' : 'جمع سود';

      // نمایش اقساط کارمزد برای قرض‌الحسنه (مشابه باحساب)
      let feeScheduleHtml = '';
      if (type === 'qarz' && result.schedule && result.schedule.length) {
        const feeRows = result.schedule.filter(s => s.isFee && s.feePart > 0);
        if (feeRows.length) {
          feeScheduleHtml = '<div class="mt-3 text-xs border-t border-indigo-200/50 pt-3">' +
            '<div class="font-semibold text-slate-600 mb-1">به جز اقساط زیر (کارمزد سالانه):</div>' +
            feeRows.map(s =>
              '<div class="flex justify-between py-0.5"><span>مبلغ قسط ' + toPersianDigits(s.number) + '</span>' +
              '<span class="font-medium">' + formatMoney(s.amount) + '</span></div>'
            ).join('') +
            '</div>';
        }
      }

      if (elHint) {
        if (type === 'qarz') {
          elHint.innerHTML =
            'فرمول استاندارد بانکی: هر سال ۱ قسط کارمزد (بر اساس مانده) + ۱۱ قسط اصل. ' +
            'قسط اصل = اصل ÷ (تعداد اقساط − تعداد سال). می‌توانید قبل از ثبت، مبلغ قسط را دستی اصلاح کنید.' +
            feeScheduleHtml;
        } else {
          elHint.textContent = 'فرمول بانکی اقساط مساوی (PMT) با نرخ متناسب فاصله اقساط. ارقام رند شده‌اند؛ در صورت نیاز در فرم ثبت ویرایش کنید.';
        }
      }
      showToast('محاسبه انجام شد. در صورت تأیید، به فرم ثبت منتقل می‌شود.', 'success');
    }

    function applyCalcToRegisterForm() {
      if (!lastCalcResult) return showToast('ابتدا محاسبه را انجام دهید.', 'warning');
      const amountEl = document.getElementById('loan-amount');
      const instEl = document.getElementById('installment-amount');
      const countEl = document.getElementById('installment-count');
      if (amountEl) {
        amountEl.value = toPersianDigits(numberWithCommas(lastCalcResult.amount));
      }
      if (instEl) {
        instEl.value = toPersianDigits(numberWithCommas(lastCalcResult.installment));
      }
      if (countEl) {
        countEl.value = toPersianDigits(String(lastCalcResult.count));
      }
      // فوکوس روی نام وام برای تکمیل
      document.getElementById('loan-name')?.focus();
      showToast('مقادیر به فرم ثبت منتقل شد. در صورت نیاز ویرایش کنید و سپس ثبت کنید.', 'success');
      // اسکرول به فرم ثبت
      try {
        document.getElementById('loan-name')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      } catch (_) {}
    }

    function clearLoanCalculator() {
      lastCalcResult = null;
      ['calc-amount', 'calc-rate', 'calc-count'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.value = '';
      });
      const box = document.getElementById('calc-result-box');
      if (box) box.classList.add('hidden');
      showToast('محاسبه پاک شد.', 'info');
    }

    // به‌روزرسانی برچسب نرخ هنگام تغییر نوع
    document.addEventListener('change', (e) => {
      if (e.target && e.target.id === 'calc-loan-type') {
        const label = document.getElementById('calc-rate-label');
        if (!label) return;
        const isQarz = e.target.value === 'qarz';
        // حفظ input داخل label
        const input = document.getElementById('calc-rate');
        label.childNodes[0].textContent = isQarz ? 'نرخ کارمزد سالانه (٪) ' : 'نرخ سود سالانه (٪) ';
        if (input && !input.value) input.placeholder = isQarz ? 'مثلاً: ۴' : 'مثلاً: ۱۸';
      }
    });

    // ============================================================
    //  REGISTER
    // ============================================================
    function clearRegisterForm(){
      ['loan-name','loan-amount','installment-amount','installment-count','start-date'].forEach(id=>{ 
        const el=document.getElementById(id); 
        if(el) el.value=''; 
      });
      document.getElementById('installment-table-body').innerHTML='';
      currentLoan = null;
      updateSelects();
    }

    function createInstallmentTable(){
      const name = document.getElementById('loan-name').value.trim();
      const amount = parseNumber(document.getElementById('loan-amount').value);
      const installmentAmount = parseNumber(document.getElementById('installment-amount').value);
      const installmentCount = parseNumber(document.getElementById('installment-count').value) || 0;
      const rawDate = document.getElementById('start-date').value.trim();
      const startDateStr = parseUserDateInput(rawDate);

      if (!name) return showToast('نام وام را وارد کنید.', 'error');
      if (amount<=0) return showToast('مبلغ وام معتبر نیست.', 'error');
      if (installmentAmount<=0) return showToast('مبلغ قسط معتبر نیست.', 'error');
      if (installmentCount<=0) return showToast('تعداد اقساط معتبر نیست.', 'error');
      if (!startDateStr) return showToast('فرمت تاریخ نامعتبر است. مثال: ۰۱-۰۱-۱۴۰۵ یا ۱۴۰۵/۰۱/۰۱', 'error');
      const startDate = parseLocalDate(startDateStr);
      if (isNaN(startDate.getTime())) return showToast('تاریخ شروع نامعتبر است.', 'error');

      // نمایش تاریخ نرمال‌شده با ارقام فارسی در فیلد
      const startDateEl = document.getElementById('start-date');
      if (startDateEl) startDateEl.value = formatDateToPersian(startDateStr);

      currentLoan = {
        id: currentLoan?.id || Date.now(),
        name, amount, installmentAmount, installmentCount, startDate: startDateStr,
        installments: []
      };

      // اگر محاسبه قرض‌الحسنه با جدول اقساط موجود باشد:
      // - اقساط کارمزد: مبلغ محاسبه‌شده (ثابت)
      // - اقساط اصل: مبلغ ویرایش‌شده‌ی فرم (installmentAmount)
      const useQarzSchedule = lastCalcResult &&
        lastCalcResult.type === 'qarz' &&
        Array.isArray(lastCalcResult.schedule) &&
        lastCalcResult.schedule.length === installmentCount &&
        lastCalcResult.amount === amount;

      for (let i = 0; i < installmentCount; i++) {
        const d = addMonths(startDate, i);
        let amt = installmentAmount;
        if (useQarzSchedule) {
          const s = lastCalcResult.schedule[i];
          // اگر قسط کارمزد است → مبلغ کارمزد محاسبه‌شده؛ وگرنه مبلغ ویرایش‌شده‌ی اصل
          amt = (s && s.isFee) ? (s.amount || 0) : installmentAmount;
        }
        currentLoan.installments.push({
          number: i + 1,
          date: toLocalISO(d),
          amount: amt,
          paid: false
        });
      }

      const tbody = document.getElementById('installment-table-body');
      tbody.innerHTML = (currentLoan.installments || []).map(inst=>`
        <tr class="border-b border-white/30 hover:bg-white/30">
          <td class="p-2 text-slate-700 text-center">${toPersianDigits(numberWithCommas(inst.number))}</td>
          <td class="p-2 text-slate-700 text-center">${formatDateToPersian(inst.date)}</td>
          <td class="p-2 text-slate-700 text-center">${formatMoney(inst.amount)}</td>
        </tr>`).join('');
      
      showToast('جدول اقساط با موفقیت ساخته شد.', 'success');
    }

    function saveLoanRegister(resetForm){
      const name = document.getElementById('loan-name').value.trim();
      const amount = parseNumber(document.getElementById('loan-amount').value);
      const installmentAmount = parseNumber(document.getElementById('installment-amount').value);
      const installmentCount = parseNumber(document.getElementById('installment-count').value) || 0;
      const startDateStr = parseUserDateInput(document.getElementById('start-date').value.trim())
        || (currentLoan && currentLoan.startDate) || '';

      if (!name || amount<=0 || installmentAmount<=0 || installmentCount<=0 || !startDateStr) {
        return showToast('اطلاعات فرم کامل نیست.', 'error');
      }

      const loan = {
        id: currentLoan?.id || Date.now(),
        name, amount, installmentAmount, installmentCount, startDate: startDateStr,
        installments: currentLoan?.installments?.length ? currentLoan.installments : []
      };

      const idx = loans.findIndex(l => String(l.id) === String(loan.id));
      if (idx>-1) loans[idx]=loan; else {
        loans.push(loan);
        loanOrder.push(loan.id);
      }
      persist(); 
      updateSelects(); 
      renderDashboard();
      showToast('وام با موفقیت ذخیره شد.', 'success');
      if (resetForm) clearRegisterForm();
    }

    // ساخت جدول اقساط + ذخیره در یک مرحله
    function createAndSaveLoan() {
      createInstallmentTable();
      if (!currentLoan || !(currentLoan.installments || []).length) return;
      saveLoanRegister(true);
    }

    // ============================================================
    //  DRAG & DROP
    // ============================================================
    function initDragDrop() {
      const cards = document.querySelectorAll('.glass-card[draggable="true"]');
      
      cards.forEach(card => {
        card.addEventListener('dragstart', handleDragStart);
        card.addEventListener('dragend', handleDragEnd);
        card.addEventListener('dragover', handleDragOver);
        card.addEventListener('dragenter', handleDragEnter);
        card.addEventListener('dragleave', handleDragLeave);
        card.addEventListener('drop', handleDrop);
      });
    }

    function handleDragStart(e) {
      draggedElement = this;
      this.classList.add('dragging');
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('text/html', this.innerHTML);
    }

    function handleDragEnd(e) {
      this.classList.remove('dragging');
      document.querySelectorAll('.glass-card.drag-over').forEach(el => el.classList.remove('drag-over'));
    }

    function handleDragOver(e) {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
    }

    function handleDragEnter(e) {
      e.preventDefault();
      if (this !== draggedElement) {
        this.classList.add('drag-over');
      }
    }

    function handleDragLeave(e) {
      this.classList.remove('drag-over');
    }

    function handleDrop(e) {
      e.preventDefault();
      this.classList.remove('drag-over');
      
      if (draggedElement && this !== draggedElement) {
        const container = document.getElementById('loans-cards-container');
        const children = Array.from(container.children);
        const fromIndex = children.indexOf(draggedElement);
        const toIndex = children.indexOf(this);
        
        if (fromIndex < 0 || toIndex < 0) {
          draggedElement = null;
          return;
        }
        
        if (fromIndex < toIndex) {
          this.parentNode.insertBefore(draggedElement, this.nextSibling);
        } else {
          this.parentNode.insertBefore(draggedElement, this);
        }
        
        // Re-read order from DOM after move (fixes incorrect saved order)
        const newOrder = Array.from(container.children)
          .map(card => card.dataset.loanId)
          .filter(id => id != null && id !== '');
        // حفظ نوع id اصلی در صورت امکان
        loanOrder = newOrder.map(id => {
          const n = Number(id);
          return Number.isFinite(n) && String(n) === String(id) ? n : id;
        });
        
        persist();
        showToast('ترتیب کارت‌ها ذخیره شد.', 'success');
      }
      
      draggedElement = null;
    }

    // ============================================================
    //  MANAGE
    // ============================================================
    function loadLoanForManagement(){
      const sel = document.getElementById('manage-loan-select');
      const id = sel.value;
      const tbody = document.getElementById('manage-installment-table-body');
      const listEl = document.getElementById('manage-installments-list');
      if (!id){
        currentLoan=null;
        if (tbody) tbody.innerHTML='';
        if (listEl) listEl.innerHTML='';
        return;
      }
      currentLoan = loans.find(l=> String(l.id) === String(id));
      // پاک کردن فیلتر جستجو هنگام انتخاب وام جدید تا اسکرول درست کار کند
      const filterEl = document.getElementById('manage-filter');
      if (filterEl) filterEl.value = '';
      updateManageInstallmentTable(true);
    }

    const debouncedUpdateManageInstallmentTable = debounce(updateManageInstallmentTable, 300);

    function updateManageInstallmentTable(autoScroll = false){
      const tbody = document.getElementById('manage-installment-table-body');
      const listEl = document.getElementById('manage-installments-list');
      const q = (document.getElementById('manage-filter').value || '').trim();
      if (!currentLoan){
        if (tbody) tbody.innerHTML='';
        if (listEl) listEl.innerHTML='';
        return;
      }

      const list = (currentLoan.installments || []).filter(inst =>
        !q || String(inst.number).includes(q) || String(inst.date).includes(q) || formatDateToPersian(inst.date).includes(q)
      );

      // قسط هدف برای اسکرول: اولویت با سررسیدشده، بعد اولین پرداخت‌نشده
      let targetNum = null;
      if (autoScroll && !q) {
        const overdueInst = (currentLoan.installments || []).find(i => !i.paid && isOverdue(i));
        const nextUnpaid = (currentLoan.installments || []).find(i => !i.paid);
        targetNum = overdueInst ? overdueInst.number : (nextUnpaid ? nextUnpaid.number : null);
      }

      // --- جدول دسکتاپ ---
      if (tbody) {
        const fragment = document.createDocumentFragment();
        list.forEach(inst=>{
          const overdue = isOverdue(inst);
          let rowCls = 'border-b border-white/30 hover:bg-white/30';
          if (inst.paid) rowCls += ' bg-emerald-50/50';
          else if (overdue) rowCls += ' animate-pulseDanger';
          
          let statusBadge = '';
          if (inst.paid) {
            statusBadge = '<span class="status-badge status-badge-paid">پرداخت‌شده</span>';
          } else if (overdue) {
            statusBadge = '<span class="status-badge status-badge-overdue">سررسید شده</span>';
          } else {
            statusBadge = '<span class="status-badge status-badge-unpaid">پرداخت‌نشده</span>';
          }
          
          const row = document.createElement('tr');
          row.className = rowCls;
          row.dataset.instNum = String(inst.number);
          row.innerHTML = `
            <td class="p-3 text-slate-700">${toPersianDigits(numberWithCommas(inst.number))}</td>
            <td class="p-3 text-slate-700">${formatDateToPersian(inst.date)}</td>
            <td class="p-3 text-slate-700" data-inst-amount="${inst.number}" onclick="startEditInstAmount(${inst.number})" title="کلیک برای ویرایش مبلغ" style="cursor:pointer;">${formatMoney(inst.amount)} <i class="fa-solid fa-pen text-xs text-slate-400 ms-1"></i></td>
            <td class="p-3">${statusBadge}</td>
            <td class="p-3">
              <button class="btn-glass text-xs px-3 py-1.5 ${inst.paid?'opacity-50 cursor-not-allowed':'btn-glass-success'}" ${inst.paid?'disabled':''} onclick="payInstallment(${inst.number})">
                <i class="fa-solid fa-check me-1"></i>ثبت
              </button>
              <button class="btn-glass text-xs px-3 py-1.5" onclick="toggleInstallment(${inst.number})">
                <i class="fa-solid fa-rotate me-1"></i>تغییر
              </button>
            </td>
          `;
          fragment.appendChild(row);
        });
        tbody.innerHTML = '';
        tbody.appendChild(fragment);
      }

      // --- کارت‌های موبایل ---
      if (listEl) {
        const cardsFrag = document.createDocumentFragment();
        if (list.length === 0) {
          const empty = document.createElement('div');
          empty.className = 'text-center text-glass-light py-8 text-sm';
          empty.textContent = currentLoan ? 'قسطی یافت نشد.' : 'ابتدا یک وام انتخاب کنید.';
          cardsFrag.appendChild(empty);
        } else {
          list.forEach(inst => {
            const overdue = isOverdue(inst);
            let cardCls = 'inst-card';
            if (inst.paid) cardCls += ' paid';
            else if (overdue) cardCls += ' overdue';

            let statusBadge = '';
            if (inst.paid) {
              statusBadge = '<span class="status-badge status-badge-paid">پرداخت‌شده</span>';
            } else if (overdue) {
              statusBadge = '<span class="status-badge status-badge-overdue">سررسید شده</span>';
            } else {
              statusBadge = '<span class="status-badge status-badge-unpaid">پرداخت‌نشده</span>';
            }

            const card = document.createElement('div');
            card.className = cardCls;
            card.dataset.instNum = String(inst.number);
            card.innerHTML = `
              <div class="inst-card-top">
                <span class="inst-card-num">قسط ${toPersianDigits(numberWithCommas(inst.number))}</span>
                ${statusBadge}
              </div>
              <div class="inst-card-date"><i class="fa-regular fa-calendar me-1"></i>${formatDateToPersian(inst.date)}</div>
              <div class="inst-card-amount" data-inst-amount="${inst.number}" onclick="startEditInstAmount(${inst.number})" title="کلیک برای ویرایش" style="cursor:pointer;">${formatMoney(inst.amount)} <i class="fa-solid fa-pen text-xs text-slate-400"></i></div>
              <div class="inst-card-actions">
                <button class="btn-glass ${inst.paid?'opacity-50 cursor-not-allowed':'btn-glass-success'}" ${inst.paid?'disabled':''} onclick="payInstallment(${inst.number})">
                  <i class="fa-solid fa-check me-1"></i>ثبت پرداخت
                </button>
                <button class="btn-glass" onclick="toggleInstallment(${inst.number})">
                  <i class="fa-solid fa-rotate me-1"></i>تغییر وضعیت
                </button>
              </div>
            `;
            cardsFrag.appendChild(card);
          });
        }
        listEl.innerHTML = '';
        listEl.appendChild(cardsFrag);
      }

      // اسکرول خودکار به قسطی که باید پرداخت شود
      if (targetNum != null) {
        requestAnimationFrame(() => {
          setTimeout(() => {
            const isMobile = window.innerWidth < 768;
            const selector = isMobile
              ? `#manage-installments-list [data-inst-num="${targetNum}"]`
              : `#manage-installment-table-body tr[data-inst-num="${targetNum}"]`;
            const el = document.querySelector(selector);
            if (el) {
              el.scrollIntoView({ behavior: 'smooth', block: 'center' });
              el.style.transition = 'box-shadow 0.3s ease';
              el.style.boxShadow = '0 0 0 3px rgba(99,102,241,0.45)';
              setTimeout(() => { el.style.boxShadow = ''; }, 1800);
            }
          }, 80);
        });
      }
    }

    function payInstallment(num){
      if (!currentLoan) return;
      const inst = (currentLoan.installments || []).find(x=>x.number===num);
      if (inst && !inst.paid){ 
        inst.paid = true; 
        persist(); 
        updateManageInstallmentTable(); 
        renderDashboard();
        showToast(`قسط شماره ${toPersianDigits(num)} پرداخت شد.`, 'success');
      }
    }
    
    function toggleInstallment(num){
      if (!currentLoan) return;
      const inst = (currentLoan.installments || []).find(x=>x.number===num);
      if (inst){ 
        inst.paid = !inst.paid; 
        persist(); 
        updateManageInstallmentTable(); 
        renderDashboard();
        showToast(`وضعیت قسط ${toPersianDigits(num)} تغییر کرد.`, 'info');
      }
    }

    function saveManage(){
      if (!currentLoan) return showToast('ابتدا یک وام انتخاب کنید.', 'error');
      const idx = loans.findIndex(l => String(l.id) === String(currentLoan.id));
      if (idx>-1) loans[idx] = currentLoan;
      persist(); 
      renderDashboard();
      showToast('تغییرات اقساط ذخیره شد.', 'success');
    }

    function batchPayInstallments(){
      if (!currentLoan) return showToast('یک وام انتخاب کنید.', 'error');
      const startRaw = document.getElementById('batch-pay-start')?.value;
      const countRaw = document.getElementById('batch-pay-count')?.value;
      let start = parseNumber(startRaw);
      const count = parseNumber(countRaw);
      if (!count || count <= 0) return showToast('تعداد اقساط نامعتبر است.', 'error');
      if (!start || start <= 0) {
        const idx = (currentLoan.installments || []).findIndex(x => !x.paid);
        start = idx >= 0 ? (currentLoan.installments[idx].number || (idx + 1)) : 1;
      }
      let paid = 0;
      (currentLoan.installments || []).forEach(inst => {
        if (inst.number >= start && !inst.paid && paid < count) { inst.paid = true; paid++; }
      });
      persist();
      updateManageInstallmentTable();
      renderDashboard();
      showToast(`${toPersianDigits(paid)} قسط با موفقیت پرداخت شد.`, 'success');
    }

    // ============================================================
    //  REPORTS
    // ============================================================
    function showLoanReport(){
      const sel = document.getElementById('report-loan-select');
      const id = sel.value;
      document.getElementById('loan-report').classList.add('hidden');
      document.getElementById('all-loans-report').classList.add('hidden');
      if (!id) return;
      currentLoan = loans.find(l=> String(l.id) === String(id));
      if (!currentLoan) return;

      const paidCount = (currentLoan.installments || []).filter(i=>i.paid).length;
      const remainingCount = Math.max(currentLoan.installmentCount - paidCount, 0);
      const progress = (currentLoan.installmentCount > 0
        ? ((paidCount / currentLoan.installmentCount) * 100)
        : 0).toFixed(1);
      const settleDate = getLoanSettlementDate(currentLoan);

      document.getElementById('report-loan-name').textContent = currentLoan.name;
      document.getElementById('report-loan-amount').textContent = formatMoney(currentLoan.amount);
      document.getElementById('report-installment-amount').textContent = formatMoney(currentLoan.installmentAmount);
      document.getElementById('report-paid-count').textContent = toPersianDigits(numberWithCommas(paidCount));
      document.getElementById('report-remaining-count').textContent = toPersianDigits(numberWithCommas(remainingCount));
      document.getElementById('report-progress').textContent = toPersianDigits(progress) + '%';
      document.getElementById('report-end-date').textContent = settleDate ? formatDateToPersian(settleDate) : '—';

      const tbody = document.getElementById('report-installments-body');
      tbody.innerHTML = (currentLoan.installments || []).map(inst=>{
        const overdue = isOverdue(inst);
        let rowCls = 'border-b border-white/30 hover:bg-white/30';
        if (inst.paid) rowCls += ' bg-emerald-50/50';
        else if (overdue) rowCls += ' animate-pulseDanger';
        
        let statusBadge = '';
        if (inst.paid) {
          statusBadge = '<span class="status-badge status-badge-paid">پرداخت‌شده</span>';
        } else if (overdue) {
          statusBadge = '<span class="status-badge status-badge-overdue">سررسید شده</span>';
        } else {
          statusBadge = '<span class="status-badge status-badge-unpaid">پرداخت‌نشده</span>';
        }
        
        return `
          <tr class="${rowCls}">
            <td class="p-2 md:p-3 text-slate-700 text-center">${toPersianDigits(numberWithCommas(inst.number))}</td>
            <td class="p-2 md:p-3 text-slate-700 text-center whitespace-nowrap">${formatDateToPersian(inst.date)}</td>
            <td class="p-2 md:p-3 text-slate-700 text-center whitespace-nowrap">${formatMoney(inst.amount)}</td>
            <td class="p-2 md:p-3 text-center">${statusBadge}</td>
          </tr>`;
      }).join('');

      if (chartProgress) chartProgress.destroy();
      chartProgress = new Chart(document.getElementById('progress-chart'), {
        type: 'doughnut',
        data: { labels:['پرداخت‌شده','مانده'], datasets:[{
          data:[paidCount, remainingCount],
          offset: [4,10],
          borderWidth: 1,
          borderColor: ['#22c55e','#ef4444'],
          backgroundColor: ['rgba(34,197,94,0.2)', 'rgba(239,68,68,0.2)']
        }] },
        options: { 
          responsive: true, 
          plugins: { 
            legend: { labels: { color: '#475569' } },
            datalabels: {
              color: '#0f172a',
              font: { weight: 'bold', size: 10, family: 'Vazirmatn, Tahoma, Arial, sans-serif' },
              formatter: (value) => toPersianDigits(numberWithCommas(value))
            }
          }, 
          cutout: '55%' 
        }
      });

      document.getElementById('loan-report').classList.remove('hidden');
    }

    function showAllLoansReport(){
      document.getElementById('loan-report').classList.add('hidden');
      const tbody = document.getElementById('all-loans-table-body');
      const cards = document.getElementById('all-loans-cards');
      const box = document.getElementById('all-loans-report');
      if (tbody) tbody.innerHTML = '';
      if (cards) cards.innerHTML = '';

      if (!loans.length) {
        if (cards) cards.innerHTML = '<p class="text-center text-glass-light py-6">هیچ وامی ثبت نشده است.</p>';
        box.classList.remove('hidden');
        return;
      }

      const fragment = document.createDocumentFragment();
      let cardsHtml = '';

      loans.forEach(loan=>{
        const paid = (loan.installments || []).filter(i=>i.paid).length;
        const remainCount = Math.max((loan.installmentCount||0) - paid, 0);
        const settle = getLoanSettlementDate(loan);
        const settleStr = settle ? formatDateToPersian(settle) : '—';
        const progress = (loan.installmentCount > 0 ? ((paid / loan.installmentCount) * 100) : 0).toFixed(1);

        const tr = document.createElement('tr');
        tr.className = "border-b border-white/30 hover:bg-white/30";
        tr.innerHTML = `
          <td class="p-3 text-slate-700">${escapeHtml(loan.name)}</td>
          <td class="p-3 text-slate-700">${formatMoney(loan.amount)}</td>
          <td class="p-3 text-slate-700">${formatMoney(loan.installmentAmount)}</td>
          <td class="p-3 text-slate-700">${toPersianDigits(numberWithCommas(loan.installmentCount))}</td>
          <td class="p-3 text-slate-700">${toPersianDigits(numberWithCommas(paid))}</td>
          <td class="p-3 text-slate-700">${toPersianDigits(numberWithCommas(remainCount))}</td>
          <td class="p-3 text-slate-700">${settleStr}</td>
        `;
        fragment.appendChild(tr);

        cardsHtml += `
          <div class="glass rounded-xl p-4 border border-white/30">
            <div class="flex items-center justify-between mb-3 gap-2">
              <h4 class="font-bold text-slate-800 text-base">${escapeHtml(loan.name)}</h4>
              <span class="text-xs px-2 py-1 rounded-full bg-indigo-100/60 text-indigo-700">${toPersianDigits(progress)}%</span>
            </div>
            <div class="grid grid-cols-2 gap-2 text-sm">
              <div class="text-glass-light">مبلغ وام</div>
              <div class="text-slate-800 font-medium text-left">${formatMoney(loan.amount)}</div>
              <div class="text-glass-light">مبلغ قسط</div>
              <div class="text-slate-800 font-medium text-left">${formatMoney(loan.installmentAmount)}</div>
              <div class="text-glass-light">تعداد اقساط</div>
              <div class="text-slate-800 font-medium text-left">${toPersianDigits(numberWithCommas(loan.installmentCount))}</div>
              <div class="text-glass-light">پرداختی</div>
              <div class="text-emerald-600 font-medium text-left">${toPersianDigits(numberWithCommas(paid))}</div>
              <div class="text-glass-light">مانده</div>
              <div class="text-rose-600 font-medium text-left">${toPersianDigits(numberWithCommas(remainCount))}</div>
              <div class="text-glass-light">تاریخ تسویه</div>
              <div class="text-slate-800 font-medium text-left">${settleStr}</div>
            </div>
          </div>`;
      });

      if (tbody) tbody.appendChild(fragment);
      if (cards) cards.innerHTML = cardsHtml;
      box.classList.remove('hidden');
    }

    function printRepayment(){
      const sel = document.getElementById('report-loan-select');
      const id = sel.value;
      if (!id) return showToast('یک وام انتخاب کنید.', 'error');
      const loan = loans.find(l=> String(l.id) === String(id));
      if (!loan) return showToast('وام یافت نشد.', 'error');

      const paidCount = (loan.installments || []).filter(i => i.paid).length;
      const remain = Math.max((loan.installmentCount || 0) - paidCount, 0);
      const paidAmount = (loan.installments || []).filter(i => i.paid).reduce((s,i)=>s+(i.amount||0), 0);
      const remainAmount = (loan.installments || []).filter(i => !i.paid).reduce((s,i)=>s+(i.amount||0), 0);
      const settle = getLoanSettlementDate(loan);

      const rows = (loan.installments || []).map(inst=>{
        const rowStyle = inst.paid ? 'style="background:#ecfdf5;"' : (isOverdue(inst) ? 'style="background:#fef2f2;"' : '');
        return `
          <tr ${rowStyle}>
            <td>${toPersianDigits(numberWithCommas(inst.number))}</td>
            <td>${formatDateToPersian(inst.date)}</td>
            <td>${formatMoney(inst.amount)}</td>
            <td>${inst.paid ? 'پرداخت‌شده' : (isOverdue(inst) ? 'سررسید شده' : 'پرداخت‌نشده')}</td>
          </tr>`;
      }).join('');

      const htmlDoc = buildPrintDocument({
        title: 'جدول بازپرداخت وام',
        subtitle: loan.name || '',
        meta: [
          ['مبلغ کل', formatMoney(loan.amount)],
          ['تعداد اقساط', toPersianDigits(loan.installmentCount)],
          ['پرداخت‌شده', toPersianDigits(paidCount) + ' قسط · ' + formatMoney(paidAmount)],
          ['مانده', toPersianDigits(remain) + ' قسط · ' + formatMoney(remainAmount)],
          ['تاریخ شروع', formatDateToPersian(loan.startDate)],
          ['تاریخ تسویه', settle ? formatDateToPersian(settle) : '—']
        ],
        tableHeaders: ['شماره', 'تاریخ', 'مبلغ', 'وضعیت'],
        tableRowsHtml: rows
      });

      openPrintWindow(htmlDoc);
    }

    function printAllLoansReport(){
      if (!loans.length) return showToast('هیچ وامی ثبت نشده است.', 'error');
      const rows = loans.map(loan=>{
        const paid = (loan.installments || []).filter(i=>i.paid).length;
        const remainCount = Math.max((loan.installmentCount||0) - paid, 0);
        const settle = getLoanSettlementDate(loan);
        const endDateStr = settle ? formatDateToPersian(settle) : '—';
        return `
          <tr>
            <td>${escapeHtml(loan.name || '—')}</td>
            <td>${toPersianDigits(numberWithCommas(loan.amount))}</td>
            <td>${toPersianDigits(numberWithCommas(loan.installmentAmount))}</td>
            <td>${toPersianDigits(numberWithCommas(loan.installmentCount))}</td>
            <td>${toPersianDigits(numberWithCommas(paid))}</td>
            <td>${toPersianDigits(numberWithCommas(remainCount))}</td>
            <td>${endDateStr}</td>
          </tr>`;
      }).join('');

      const htmlDoc = buildPrintDocument({
        title: 'گزارش وضعیت کل وام‌ها',
        subtitle: 'سیستم مدیریت وام',
        meta: [
          ['تعداد وام‌ها', toPersianDigits(loans.length)],
          ['تاریخ گزارش', reportDateJalali()]
        ],
        tableHeaders: ['نام وام', 'مبلغ کل', 'مبلغ قسط', 'تعداد', 'پرداختی', 'مانده', 'تسویه'],
        tableRowsHtml: rows
      });
      openPrintWindow(htmlDoc);
    }

    function buildPrintDocument({ title, subtitle, meta, tableHeaders, tableRowsHtml }) {
      const safeTitle = escapeHtml(title || '');
      const safeSub = escapeHtml(subtitle || '');
      const metaHtml = (meta || []).map(([k,v]) =>
        `<div class="meta-row"><span>${escapeHtml(k)}</span><strong>${escapeHtml(v)}</strong></div>`
      ).join('');
      const th = (tableHeaders || []).map(h => `<th>${escapeHtml(h)}</th>`).join('');
      // فونت‌های فارسی سیستم برای چاپ (Vazirmatn اگر نصب باشد، وگرنه Tahoma)
      return `<!DOCTYPE html><html lang="fa" dir="rtl"><head><meta charset="UTF-8">
<title>${safeTitle}</title>
<style>
  @page { size: A4; margin: 12mm; }
  * { box-sizing: border-box; }
  body { font-family: Vazirmatn, 'Vazir', Tahoma, 'Segoe UI', Arial, sans-serif; direction: rtl; color: #0f172a; margin: 0; padding: 16px; -webkit-font-smoothing: antialiased; }
  .header { text-align: center; border-bottom: 3px solid #4f46e5; padding-bottom: 12px; margin-bottom: 16px; }
  .header .logo { font-size: 28px; color: #4f46e5; }
  .header h1 { margin: 8px 0 4px; font-size: 20px; }
  .header .sub { color: #64748b; font-size: 14px; }
  .meta-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 6px 16px; margin-bottom: 16px; font-size: 13px; }
  .meta-row { display: flex; justify-content: space-between; gap: 8px; padding: 6px 10px; background: #f8fafc; border-radius: 8px; border: 1px solid #e2e8f0; }
  table { width: 100%; border-collapse: collapse; font-size: 12px; }
  th, td { border: 1px solid #cbd5e1; padding: 7px 6px; text-align: center; font-variant-numeric: tabular-nums; }
  th { background: #4f46e5; color: #fff; font-weight: 700; }
  tr:nth-child(even) td { background: #f8fafc; }
  .footer { margin-top: 18px; text-align: center; color: #94a3b8; font-size: 11px; border-top: 1px solid #e2e8f0; padding-top: 10px; }
  @media print {
    body { padding: 0; }
    .no-print { display: none !important; }
    tr { break-inside: avoid; }
  }
</style></head><body>
  <div class="header">
    <div class="logo">🏦</div>
    <h1>${safeTitle}</h1>
    <div class="sub">${safeSub}</div>
  </div>
  <div class="meta-grid">${metaHtml}</div>
  <table>
    <thead><tr>${th}</tr></thead>
    <tbody>${tableRowsHtml || ''}</tbody>
  </table>
  <div class="footer">سیستم مدیریت وام · نسخه 2026-08-v3.5.4 · ${reportDateJalali()} · ${new Date().toLocaleTimeString('fa-IR', {hour:'2-digit', minute:'2-digit'})}</div>
</body></html>` + '<' + 'script>window.onload=function(){setTimeout(function(){window.print()},200)}<' + '/script>';
    }

    function openPrintWindow(htmlDoc) {
      const win = window.open('', '_blank');
      if (!win) return showToast('پنجره چاپ مسدود شده است. اجازه پاپ‌آپ بدهید.', 'error');
      win.document.open();
      win.document.write(htmlDoc);
      win.document.close();
      try { setTimeout(() => { try { win.focus(); win.print(); } catch(e){} }, 300); } catch(e){}
    }

    function exportLoanPDF() {
      // PDF از طریق چاپ مرورگر (Save as PDF) — بدون وابستگی خارجی
      printRepayment();
      showToast('در پنجره چاپ، خروجی را «ذخیره به PDF» انتخاب کنید.', 'info');
    }

    function exportAllLoansPDF() {
      printAllLoansReport();
      showToast('در پنجره چاپ، خروجی را «ذخیره به PDF» انتخاب کنید.', 'info');
    }

    function renderDashboard(){
      updateSelects();
      
      const totalLoans = loans.length;
      const sumAmount = loans.reduce((s,l)=>s + (Number(l.amount)||0), 0);

      // مبالغ واقعی از خود اقساط (اگر مبلغ قسط ویرایش شده باشد درست محاسبه می‌شود)
      let paidTotal = 0, remainingTotal = 0, totalInstallmentsAmount = 0;
      let paidCountAll = 0, allCount = 0;
      (loans || []).forEach(l => {
        const insts = l.installments || [];
        const fallback = Number(l.installmentAmount) || 0;
        if (insts.length) {
          allCount += insts.length;
          insts.forEach(i => {
            const amt = Number(i.amount) || fallback;
            totalInstallmentsAmount += amt;
            if (i.paid) { paidTotal += amt; paidCountAll++; }
            else remainingTotal += amt;
          });
        } else {
          const n = Number(l.installmentCount) || 0;
          allCount += n;
          totalInstallmentsAmount += fallback * n;
          remainingTotal += fallback * n;
        }
      });
      const remainingCountAll = Math.max(allCount - paidCountAll, 0);

      const el = (id) => document.getElementById(id);
      if (el('kpi-total-loans')) el('kpi-total-loans').textContent = toPersianDigits(numberWithCommas(totalLoans));
      if (el('kpi-sum-amount')) el('kpi-sum-amount').textContent = formatMoney(sumAmount);
      if (el('kpi-paid')) el('kpi-paid').textContent = formatMoney(paidTotal);
      if (el('kpi-remaining')) el('kpi-remaining').textContent = formatMoney(remainingTotal);
      if (el('kpi-remaining-count')) el('kpi-remaining-count').textContent = toPersianDigits(numberWithCommas(remainingCountAll));
      if (el('kpi-total-installments')) el('kpi-total-installments').textContent = formatMoney(totalInstallmentsAmount);

      renderLoanCards();
    }


    function getNextUnpaidInstallment(loan) {
      if (!loan || !loan.installments) return null;
      const unpaid = loan.installments.filter(i => !i.paid && i.date);
      if (!unpaid.length) return null;
      unpaid.sort((a, b) => String(a.date).localeCompare(String(b.date)));
      return unpaid[0];
    }

    function quickPayFromDashboard(loanId, event) {
      if (event) {
        event.stopPropagation();
        event.preventDefault();
      }
      const loan = (loans || []).find(l => String(l.id) === String(loanId));
      if (!loan) return showToast('وام یافت نشد.', 'error');
      const next = getNextUnpaidInstallment(loan);
      if (!next) {
        showToast('همه اقساط این وام پرداخت شده‌اند.', 'info');
        return;
      }
      const msg = `پرداخت قسط شماره ${toPersianDigits(next.number)} وام «${loan.name}»\nمبلغ: ${formatMoney(next.amount)}\nتاریخ سررسید: ${formatDateToPersian(next.date)}`;
      showConfirmGlass(msg, { title: 'پرداخت سریع', okText: 'پرداخت', cancelText: 'انصراف' }).then(ok => {
        if (!ok) return;
        next.paid = true;
        persist();
        renderDashboard();
        showToast(`قسط ${toPersianDigits(next.number)} پرداخت شد.`, 'success');
      });
    }

    function renderLoanCards() {
      const container = document.getElementById('loans-cards-container');
      if (!container) return;

      if (loans.length === 0) {
        container.innerHTML = `
          <div class="col-span-full text-center py-12 glass-card rounded-2xl p-12 border border-white/30">
            <i class="fa-solid fa-file-invoice text-6xl text-slate-300 mb-4"></i>
            <p class="text-slate-500 text-lg">هیچ وامی ثبت نشده است</p>
            <button class="mt-4 btn-glass btn-glass-primary" onclick="showPage('register-loan')">
              <i class="fa-solid fa-plus me-2"></i>ثبت اولین وام
            </button>
          </div>
        `;
        return;
      }

      // مرتب‌سازی بر اساس ترتیب ذخیره شده
      let sortedLoans = [...loans];
      if (loanOrder.length > 0) {
        const orderMap = new Map(loanOrder.map((id, i) => [String(id), i]));
        sortedLoans.sort((a, b) => {
          const indexA = orderMap.has(String(a.id)) ? orderMap.get(String(a.id)) : 999999;
          const indexB = orderMap.has(String(b.id)) ? orderMap.get(String(b.id)) : 999999;
          return indexA - indexB;
        });
      }
      // فیلتر و جستجو
      sortedLoans = sortedLoans.filter(loan => loanMatchesFilter(loan) && loanMatchesSearch(loan));

      if (sortedLoans.length === 0) {
        container.innerHTML = `
          <div class="col-span-full text-center py-10 glass-card rounded-2xl p-8 border border-white/30">
            <i class="fa-solid fa-filter-circle-xmark text-5xl text-slate-300 mb-3"></i>
            <p class="text-slate-500">وامی با این فیلتر/جستجو یافت نشد</p>
            <button class="mt-3 btn-glass" onclick="setDashFilter('all'); document.getElementById('dash-search').value=''; renderLoanCards();">نمایش همه</button>
          </div>`;
        return;
      }

      const tempDiv = document.createElement('div');
      tempDiv.className = 'grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6';
      
      for (let i = 0; i < sortedLoans.length; i++) {
        const loan = sortedLoans[i];
        const insts = loan.installments || [];
        const paidCount = insts.filter(i => i.paid).length;
        const totalInst = loan.installmentCount || insts.length || 0;
        const remainingCount = Math.max(totalInst - paidCount, 0);
        const progressPercent = (totalInst > 0 ? ((paidCount / totalInst) * 100) : 0).toFixed(1);
        
        // مبلغ واقعی از اقساط (پشتیبانی از مبلغ ویرایش‌شده هر قسط)
        const fallbackAmt = Number(loan.installmentAmount) || 0;
        let paidAmount = 0, remainingAmount = 0;
        if (insts.length) {
          insts.forEach(i => {
            const amt = Number(i.amount) || fallbackAmt;
            if (i.paid) paidAmount += amt; else remainingAmount += amt;
          });
        } else {
          remainingAmount = fallbackAmt * remainingCount;
          paidAmount = fallbackAmt * paidCount;
        }
        
        const endDateStr = (() => {
          const s = getLoanSettlementDate(loan);
          return s ? formatDateToPersian(s) : '—';
        })();

        // سررسید بعدی (اولین قسط پرداخت‌نشده بر اساس تاریخ)
        const nextInst = getNextUnpaidInstallment(loan);
        let nextDueHtml = '';
        if (nextInst) {
          const days = daysUntilDate(nextInst.date);
          const isOd = days !== null && days < 0;
          const isToday = days === 0;
          let dueLabel = 'سررسید بعدی';
          let dueClass = 'text-indigo-600';
          let dueExtra = '';
          if (isOd) {
            dueLabel = 'سررسید معوق';
            dueClass = 'text-rose-600';
            dueExtra = `<span class="overdue-delay">${toPersianDigits(Math.abs(days))} روز تأخیر</span>`;
          } else if (isToday) {
            dueLabel = 'سررسید امروز';
            dueClass = 'text-amber-600';
          } else if (days !== null && days <= 3) {
            dueExtra = `<span class="due-soon-text">${toPersianDigits(days)} روز مانده</span>`;
            dueClass = 'text-amber-600';
          }
          if (isOd) {
            // همه اقساط معوق این وام
            const overdueList = (loan.installments || [])
              .filter(inst => isOverdue(inst))
              .map(inst => {
                const d = daysUntilDate(inst.date);
                return {
                  number: inst.number,
                  date: inst.date,
                  amount: Number(inst.amount) || 0,
                  daysLate: d !== null ? Math.abs(d) : 0
                };
              })
              .sort((a, b) => (Number(a.number) || 0) - (Number(b.number) || 0)); // از قسط کمتر به بیشتر

            const odCount = overdueList.length;
            const odTotalAmount = overdueList.reduce((s, x) => s + x.amount, 0);
            const maxLate = overdueList.length ? Math.max(...overdueList.map(x => x.daysLate)) : Math.abs(days);

            if (odCount <= 1) {
              // یک قسط معوق — نمایش ساده
              const delayDays = toPersianDigits(maxLate);
              nextDueHtml = `
              <div class="next-due-row next-due-overdue">
                <div class="od-title">
                  <i class="fa-solid fa-triangle-exclamation"></i>
                  <span>سررسید معوق</span>
                </div>
                <div class="od-grid">
                  <div class="od-item">
                    <span class="od-key">تاریخ</span>
                    <span class="od-val od-date">${formatDateToPersian(nextInst.date)}</span>
                  </div>
                  <div class="od-item">
                    <span class="od-key">تعداد روز</span>
                    <span class="od-val overdue-delay">${delayDays} روز</span>
                  </div>
                  <div class="od-item">
                    <span class="od-key">مبلغ معوقه</span>
                    <span class="od-val od-amount">${formatMoney(nextInst.amount)}</span>
                  </div>
                </div>
              </div>`;
            } else {
              // چند قسط معوق — خلاصه + لیست کشویی
              const rowsHtml = overdueList.map(item => `
                  <div class="od-detail-row">
                    <span class="od-detail-num">${toPersianDigits(item.number)}</span>
                    <span class="od-detail-date">${formatDateToPersian(item.date)}</span>
                    <span class="od-detail-days overdue-delay">${toPersianDigits(item.daysLate)} روز</span>
                    <span class="od-detail-amt od-amount">${formatMoney(item.amount)}</span>
                  </div>`).join('');

              nextDueHtml = `
              <div class="next-due-row next-due-overdue">
                <div class="od-title">
                  <i class="fa-solid fa-triangle-exclamation"></i>
                  <span>${toPersianDigits(odCount)} قسط معوق</span>
                </div>
                <div class="od-grid">
                  <div class="od-item">
                    <span class="od-key">بیشترین تأخیر</span>
                    <span class="od-val overdue-delay">${toPersianDigits(maxLate)} روز</span>
                  </div>
                  <div class="od-item">
                    <span class="od-key">جمع مبلغ معوقه</span>
                    <span class="od-val od-amount">${formatMoney(odTotalAmount)}</span>
                  </div>
                </div>
                <details class="od-details" onclick="event.stopPropagation()" onmousedown="event.stopPropagation()">
                  <summary class="od-summary">
                    <i class="fa-solid fa-calendar-days"></i>
                    مشاهده تاریخ اقساط معوق
                    <i class="fa-solid fa-chevron-down od-chevron"></i>
                  </summary>
                  <div class="od-detail-list">
                    <div class="od-detail-head">
                      <span>#</span>
                      <span>تاریخ</span>
                      <span>تأخیر</span>
                      <span>مبلغ</span>
                    </div>
                    ${rowsHtml}
                  </div>
                </details>
              </div>`;
            }
          } else {
            nextDueHtml = `
              <div class="next-due-row next-due-normal">
                <span class="text-slate-500 shrink-0">${dueLabel}:</span>
                <span class="font-medium ${dueClass} next-due-normal-val">
                  <span class="od-date">${formatDateToPersian(nextInst.date)}</span>${dueExtra ? ` · ${dueExtra}` : ''}
                  <br><span class="text-slate-700 od-amount">${formatMoney(nextInst.amount)}</span>
                </span>
              </div>`;
          }
        } else if (remainingCount === 0 && totalInst > 0) {
          nextDueHtml = `
              <div class="flex justify-between">
                <span class="text-slate-500">سررسید بعدی:</span>
                <span class="font-medium text-emerald-600">تسویه کامل ✓</span>
              </div>`;
        }

        let statusColor = 'bg-rose-100/60 border-rose-200/60 text-rose-700';
        if (progressPercent >= 75) statusColor = 'bg-emerald-100/60 border-emerald-200/60 text-emerald-700';
        else if (progressPercent >= 50) statusColor = 'bg-amber-100/60 border-amber-200/60 text-amber-700';
        else if (progressPercent >= 25) statusColor = 'bg-blue-100/60 border-blue-200/60 text-blue-700';

        const isEditing = editingLoanId === loan.id;

        const cardHTML = `
          <div class="glass-card rounded-2xl p-6 border border-white/30" draggable="true" data-loan-id="${loan.id}">
            <div class="flex justify-between items-start mb-4">
              <div class="flex items-center gap-2 flex-1">
                <i class="fa-solid fa-grip-lines drag-handle text-xs"></i>
                <div class="flex items-center gap-2 flex-1">
                  ${isEditing ? `
                    <input 
                      type="text" 
                      class="loan-name-input" 
                      data-loan-id="${loan.id}" 
                      value="${escapeHtml(loan.name)}" 
                      disabled
                      onkeydown="if(event.key==='Enter') saveNameEdit(${loan.id}, this)"
                      onblur="setTimeout(() => { if(editingLoanId === ${loan.id}) cancelNameEdit(${loan.id}); }, 200)"
                    />
                    <button class="edit-name-btn text-emerald-500" onclick="saveNameEdit(${loan.id}, document.querySelector('.loan-name-input[data-loan-id=\\'${loan.id}\\']'))">
                      <i class="fa-solid fa-check"></i>
                    </button>
                    <button class="edit-name-btn text-rose-500" onclick="cancelNameEdit(${loan.id})">
                      <i class="fa-solid fa-xmark"></i>
                    </button>
                  ` : `
                    <h3 class="text-lg font-bold text-slate-800">${escapeHtml(loan.name)}</h3>
                    <button class="edit-name-btn" onclick="startEditName(${loan.id})" title="ویرایش نام وام">
                      <i class="fa-solid fa-pen text-xs"></i>
                    </button>
                  `}
                </div>
              </div>
              <span class="px-3 py-1 rounded-full text-sm ${statusColor} border shrink-0">
                ${toPersianDigits(progressPercent)}%
              </span>
            </div>
            
            <div class="loan-details space-y-3">
              <div class="flex justify-between">
                <span class="text-slate-500">مبلغ وام:</span>
                <span class="font-medium text-slate-800">${formatMoney(loan.amount)}</span>
              </div>
              <div class="flex justify-between">
                <span class="text-slate-500">مبلغ قسط:</span>
                <span class="font-medium text-slate-800">${formatMoney(loan.installmentAmount)}</span>
              </div>
              <div class="flex justify-between">
                <span class="text-slate-500">تعداد اقساط:</span>
                <span class="font-medium text-slate-800">${toPersianDigits(numberWithCommas(loan.installmentCount))}</span>
              </div>
              <div class="flex justify-between">
                <span class="text-slate-500">پرداختی:</span>
                <span class="font-medium text-emerald-600">${toPersianDigits(numberWithCommas(paidCount))} قسط</span>
              </div>
              <div class="flex justify-between">
                <span class="text-slate-500">مانده:</span>
                <span class="font-medium text-rose-600">${toPersianDigits(numberWithCommas(remainingCount))} قسط</span>
              </div>
              <div class="flex justify-between">
                <span class="text-slate-500">مبلغ پرداختی:</span>
                <span class="font-medium text-emerald-600">${formatMoney(paidAmount)}</span>
              </div>
              <div class="flex justify-between">
                <span class="text-slate-500">مبلغ مانده:</span>
                <span class="font-medium text-rose-600">${formatMoney(remainingAmount)}</span>
              </div>
              <div class="flex justify-between">
                <span class="text-slate-500">تاریخ تسویه:</span>
                <span class="font-medium text-slate-800">${endDateStr}</span>
              </div>
              ${nextDueHtml}
            </div>

            <div class="mt-4 pt-4 border-t border-slate-200/50">
              <div class="flex justify-between text-xs text-slate-400 mb-1">
                <span>پیشرفت بازپرداخت</span>
                <span>${toPersianDigits(progressPercent)}%</span>
              </div>
              <div class="w-full bg-slate-200/50 rounded-full h-2">
                <div class="h-2 rounded-full ${statusColor.replace('text','bg').replace('border','bg')}" style="width: ${progressPercent}%"></div>
              </div>
            </div>

            <div class="mt-4 flex flex-wrap gap-2">
              ${nextInst ? `
              <button class="flex-1 min-w-[40%] btn-glass btn-glass-success text-sm" onclick="quickPayFromDashboard('${loan.id}', event)" title="ثبت پرداخت قسط بعدی">
                <i class="fa-solid fa-check me-1"></i>پرداخت سریع
              </button>` : ''}
              <button class="flex-1 min-w-[40%] btn-glass btn-glass-primary text-sm" onclick="selectAndShowPage('${loan.id}', 'manage-loans')">
                <i class="fa-solid fa-edit me-1"></i>مدیریت
              </button>
              <button class="flex-1 min-w-[40%] btn-glass text-sm" onclick="selectAndShowPage('${loan.id}', 'reports')">
                <i class="fa-solid fa-chart-bar me-1"></i>گزارش
              </button>
            </div>
          </div>
        `;
        
        tempDiv.innerHTML += cardHTML;
      }

      container.innerHTML = tempDiv.innerHTML;
      
      // راه‌اندازی Drag & Drop
      setTimeout(initDragDrop, 50);
      
      // فوکوس روی input در حال ویرایش
      if (editingLoanId) {
        setTimeout(() => {
          const input = document.querySelector(`.loan-name-input[data-loan-id="${editingLoanId}"]`);
          if (input) {
            input.disabled = false;
            input.focus();
            input.select();
          }
        }, 150);
      }
    }

    function selectAndShowPage(loanId, pageId) {
      const select = document.getElementById(pageId === 'manage-loans' ? 'manage-loan-select' : 'report-loan-select');
      if (select) {
        select.value = loanId;
        if (pageId === 'manage-loans') {
          loadLoanForManagement();
        } else if (pageId === 'reports') {
          showLoanReport();
        }
      }
      showPage(pageId);
    }

    // ============================================================
    //  DELETE & BACKUP
    // ============================================================
    function deleteLoan(){
      const sel = document.getElementById('delete-loan-select'); 
      const id = sel.value;
      if (!id) return showToast('یک وام انتخاب کنید.', 'error');
      showConfirmGlass('حذف این وام قطعی است و قابل بازگشت نیست.\nادامه می‌دهید؟', {
        title: 'حذف وام',
        okText: 'حذف',
        cancelText: 'انصراف'
      }).then(ok => {
        if (!ok) return;
        loans = loans.filter(l=> String(l.id) !== String(id));
        loanOrder = loanOrder.filter(lid => String(lid) !== String(id));
        persist(); 
        updateSelects(); 
        renderDashboard();
        showToast('وام با موفقیت حذف شد.', 'success');
      });
    }

    async function backupData(opts = {}){
      // Full app backup (loans + settings + users + order) for safer recovery
      const payload = {
        version: '2026-08-v3.5.4',
        exportedAt: new Date().toISOString(),
        loans: loans,
        loanOrder: loanOrder,
        settings: safeParseJSON('vam_app_settings', {}),
        users: safeParseJSON('vam_users', []),
        theme: localStorage.getItem('vam_theme') || 'light'
      };
      if (!payload.loans || payload.loans.length === 0) {
        return showToast('هیچ وامی برای پشتیبان‌گیری وجود ندارد.', 'warning');
      }

      // اول سعی می‌کنیم در پوشه انتخاب‌شده کاربر بنویسیم
      let savedToFolder = false;
      try {
        savedToFolder = await writeBackupToFolder(payload);
      } catch (e) {
        console.warn(e);
      }

      if (savedToFolder) {
        localStorage.setItem('vam_last_backup', new Date().toISOString());
        updateLastBackupInfo();
        showToast('نسخه پشتیبان در پوشه انتخاب‌شده (حافظه داخلی) ذخیره شد.', 'success');
        return;
      }

      // اگر پوشه در دسترس نبود → دانلود معمولی
      if (opts.preferFolder) {
        // کاربر تازه پوشه انتخاب کرده ولی نوشتن شکست خورده
        showToast('نوشتن در پوشه ممکن نشد. فایل به صورت دانلود ذخیره می‌شود.', 'warning');
      }
      const dataStr = JSON.stringify(payload, null, 2);
      const blob = new Blob([dataStr], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a'); 
      a.href = url; 
      a.download = `easyvam_full_backup_v3.5.4_${toLocalISO(new Date())}_${loans.length}loans.json`; 
      a.click();
      URL.revokeObjectURL(url);
      localStorage.setItem('vam_last_backup', new Date().toISOString());
      updateLastBackupInfo();
      showToast('نسخه پشتیبان کامل با موفقیت دانلود شد.', 'success');
    }

    /** یادآوری پشتیبان اگر بیش از ۷ روز گذشته یا هرگز گرفته نشده */
    function maybeRemindBackup() {
      try {
        if (!loans || loans.length === 0) return;
        const ts = localStorage.getItem('vam_last_backup');
        const now = Date.now();
        const sevenDays = 7 * 24 * 60 * 60 * 1000;
        if (!ts || (now - new Date(ts).getTime()) > sevenDays) {
          setTimeout(() => {
            showToast('پیشنهاد: برای جلوگیری از از دست رفتن داده‌ها، نسخه پشتیبان تهیه کنید.', 'warning');
          }, 4000);
        }
      } catch (e) {}
    }


    // ============================================================
    //  FILE SYSTEM ACCESS API — ذخیره مستقیم در پوشه کاربر
    // ============================================================
    let backupDirHandle = null; // in-memory cache of directory handle

    function isFileSystemAccessSupported() {
      return typeof window.showDirectoryPicker === 'function';
    }

    async function pickBackupFolder() {
      if (!isFileSystemAccessSupported()) {
        showToast('مرورگر شما از انتخاب پوشه پشتیبانی نمی‌کند. از Chrome یا Edge استفاده کنید.', 'warning');
        return;
      }
      try {
        const handle = await window.showDirectoryPicker({
          mode: 'readwrite',
          id: 'easyvam-backup-folder',
          startIn: 'documents'
        });
        // Request permission explicitly
        const perm = await handle.requestPermission({ mode: 'readwrite' });
        if (perm !== 'granted') {
          showToast('دسترسی نوشتن به پوشه داده نشد.', 'error');
          return;
        }
        backupDirHandle = handle;
        await idbSet('backupDirHandle', handle);
        updateBackupFolderStatus();
        showToast('پوشه ذخیره با موفقیت انتخاب شد. از این به بعد بکاپ‌ها آنجا ذخیره می‌شوند.', 'success');
        // Immediately write one backup
        await backupData({ preferFolder: true });
      } catch (e) {
        if (e && e.name === 'AbortError') return; // user cancelled
        console.error(e);
        showToast('انتخاب پوشه ناموفق بود: ' + (e.message || 'خطای ناشناخته'), 'error');
      }
    }

    async function clearBackupFolder() {
      backupDirHandle = null;
      try { await idbSet('backupDirHandle', null); } catch (_) {}
      // Also remove key if possible
      try {
        const db = await openIDB();
        if (db) {
          const tx = db.transaction(IDB_STORE, 'readwrite');
          tx.objectStore(IDB_STORE).delete('backupDirHandle');
        }
      } catch (_) {}
      updateBackupFolderStatus();
      showToast('پوشه ذخیره لغو شد. بکاپ‌ها دوباره به صورت دانلود ذخیره می‌شوند.', 'info');
    }

    async function restoreBackupDirHandle() {
      try {
        if (!isFileSystemAccessSupported()) return;
        const stored = await idbGet('backupDirHandle');
        if (!stored) return;
        // Verify we still have permission
        let perm = await stored.queryPermission({ mode: 'readwrite' });
        if (perm !== 'granted') {
          perm = await stored.requestPermission({ mode: 'readwrite' });
        }
        if (perm === 'granted') {
          backupDirHandle = stored;
        } else {
          backupDirHandle = null;
        }
      } catch (e) {
        console.warn('Could not restore directory handle', e);
        backupDirHandle = null;
      }
      updateBackupFolderStatus();
    }

    function updateBackupFolderStatus() {
      const el = document.getElementById('backup-folder-status');
      const btnClear = document.getElementById('btn-clear-folder');
      if (!el) return;
      if (!isFileSystemAccessSupported()) {
        el.innerHTML = '<span style="color:#f59e0b;">مرورگر از این قابلیت پشتیبانی نمی‌کند (Chrome/Edge پیشنهاد می‌شود)</span>';
        if (btnClear) btnClear.style.display = 'none';
        return;
      }
      if (backupDirHandle) {
        el.innerHTML = '<span style="color:#10b981;"><i class="fa-solid fa-circle-check me-1"></i>پوشه انتخاب شده — بکاپ‌ها مستقیماً در حافظه داخلی ذخیره می‌شوند</span>';
        if (btnClear) btnClear.style.display = '';
      } else {
        el.innerHTML = '<span style="color:#94a3b8;">هنوز پوشه‌ای انتخاب نشده (بکاپ به صورت دانلود ذخیره می‌شود)</span>';
        if (btnClear) btnClear.style.display = 'none';
      }
    }

    /** تلاش برای نوشتن فایل بکاپ داخل پوشه انتخاب‌شده */
    async function writeBackupToFolder(payload) {
      try {
        let handle = backupDirHandle;
        if (!handle) {
          handle = await idbGet('backupDirHandle');
          if (handle) backupDirHandle = handle;
        }
        if (!handle) return false;

        let perm = 'granted';
        try {
          if (typeof handle.queryPermission === 'function') {
            perm = await handle.queryPermission({ mode: 'readwrite' });
          }
          if (perm !== 'granted' && typeof handle.requestPermission === 'function') {
            perm = await handle.requestPermission({ mode: 'readwrite' });
          }
        } catch (permErr) {
          console.warn('permission check failed', permErr);
        }
        if (perm !== 'granted') return false;

        // نام فایل فقط با ارقام انگلیسی و کاراکتر امن
        const datePart = toEnglishDigits(toLocalISO(new Date()) || '').replace(/[^\d\-]/g, '') || String(Date.now());
        const countPart = String((payload.loans || []).length);
        const fileName = `easyvam_backup_v3.5.4_${datePart}_${countPart}loans.json`;

        const jsonStr = JSON.stringify(payload, null, 2);
        if (!jsonStr || jsonStr.length < 2) {
          console.warn('empty payload stringify');
          return false;
        }
        // Uint8Array قابل‌اعتمادتر از string روی اندروید/WebView
        const bytes = new TextEncoder().encode(jsonStr);

        const fileHandle = await handle.getFileHandle(fileName, { create: true });
        let wrote = false;

        // روش ۱: createWritable + Uint8Array
        try {
          const writable = await fileHandle.createWritable({ keepExistingData: false });
          try {
            await writable.write(bytes);
            // اطمینان از طول نهایی فایل
            if (typeof writable.truncate === 'function') {
              await writable.truncate(bytes.byteLength);
            }
            await writable.close();
            wrote = true;
          } catch (wErr) {
            try { await writable.abort(); } catch (_) {}
            throw wErr;
          }
        } catch (e1) {
          console.warn('writable write failed, trying Blob', e1);
          // روش ۲: Blob
          try {
            const writable = await fileHandle.createWritable({ keepExistingData: false });
            try {
              await writable.write(new Blob([bytes], { type: 'application/json;charset=utf-8' }));
              await writable.close();
              wrote = true;
            } catch (wErr2) {
              try { await writable.abort(); } catch (_) {}
              throw wErr2;
            }
          } catch (e2) {
            console.warn('Blob write failed', e2);
            return false;
          }
        }

        if (!wrote) return false;

        // تأیید: فایل نباید ۰ بایت باشد
        try {
          const file = await fileHandle.getFile();
          if (!file || file.size < 2) {
            console.warn('backup file size is 0 after write', file && file.size);
            // تلاش آخر: نوشتن با seek
            try {
              const writable = await fileHandle.createWritable({ keepExistingData: false });
              await writable.seek(0);
              await writable.write(bytes);
              await writable.truncate(bytes.byteLength);
              await writable.close();
              const file2 = await fileHandle.getFile();
              if (!file2 || file2.size < 2) return false;
            } catch (e3) {
              console.warn('retry write failed', e3);
              return false;
            }
          }
        } catch (verErr) {
          // بعضی محیط‌ها getFile بعد از write محدود است؛ اگر نوشتن بدون خطا بود قبول می‌کنیم
          console.warn('could not verify file size', verErr);
        }

        return true;
      } catch (e) {
        console.warn('writeBackupToFolder failed', e);
        return false;
      }
    }


    function coerceNumber(v, fallback = 0) {
      if (typeof v === 'number' && Number.isFinite(v)) return v;
      if (v === undefined || v === null || v === '') return fallback;
      const n = parseNumber(String(v));
      return Number.isFinite(n) ? n : fallback;
    }

    function normalizeImportedLoan(l) {
      if (!l || typeof l !== 'object' || Array.isArray(l)) return null;
      // پشتیبانی از نام فیلدهای قدیمی / جایگزین
      const id = (l.id != null && l.id !== '') ? l.id
        : (l.loanId != null ? l.loanId : (Date.now() + Math.floor(Math.random() * 10000)));
      const rawInst = l.installments || l.installmentList || l.qs || l.aghsat || [];
      let installments = Array.isArray(rawInst) ? rawInst.map((inst, idx) => {
        if (!inst || typeof inst !== 'object') {
          return { number: idx + 1, date: '', amount: 0, paid: false };
        }
        const rawDate = inst.date || inst.dueDate || inst.due || inst.tarikh || '';
        let dateStr = '';
        try {
          const n = normalizeJalaliDateString(toEnglishDigits(String(rawDate)).replace(/[\/\.\s]/g, '-'));
          dateStr = n || String(rawDate || '');
        } catch (_) {
          dateStr = String(rawDate || '');
        }
        return {
          number: coerceNumber(inst.number ?? inst.num ?? inst.no ?? (idx + 1), idx + 1),
          date: dateStr,
          amount: coerceNumber(inst.amount ?? inst.mablagh ?? inst.value, coerceNumber(l.installmentAmount ?? l.installment_amount)),
          paid: !!(inst.paid ?? inst.isPaid ?? inst.pardakht)
        };
      }) : [];
      installments = installments
        .sort((a, b) => (a.number || 0) - (b.number || 0))
        .map((inst, idx) => ({ ...inst, number: idx + 1 }));
      const countFromArr = installments.length;
      let installmentCount = coerceNumber(
        l.installmentCount ?? l.installment_count ?? l.count ?? l.aqsatCount,
        0
      );
      if (countFromArr > 0) installmentCount = countFromArr;
      const startRaw = l.startDate || l.start_date || l.start || l.tarikhShoru || '';
      let startNorm = String(startRaw || '');
      try {
        startNorm = (typeof parseUserDateInput === 'function' ? parseUserDateInput(String(startRaw)) : '')
          || normalizeJalaliDateString(toEnglishDigits(String(startRaw)).replace(/[\/\.\s]/g, '-'))
          || String(startRaw || '');
      } catch (_) {}
      return {
        id,
        name: String(l.name || l.title || l.loanName || 'بدون نام'),
        amount: coerceNumber(l.amount ?? l.total ?? l.mablagh ?? l.loanAmount),
        installmentAmount: coerceNumber(l.installmentAmount ?? l.installment_amount ?? l.qestAmount),
        installmentCount,
        startDate: startNorm,
        installments
      };
    }

    /** استخراج آرایه وام از انواع ساختار بکاپ قدیمی/جدید */
    function extractLoansFromBackup(data) {
      if (!data) return { loans: null, loanOrder: null, settings: null, theme: null };
      if (typeof data === 'string') {
        try { data = JSON.parse(data); } catch (_) { return { loans: null, loanOrder: null, settings: null, theme: null }; }
      }
      if (Array.isArray(data)) {
        return { loans: data, loanOrder: null, settings: null, theme: null };
      }
      if (typeof data !== 'object') {
        return { loans: null, loanOrder: null, settings: null, theme: null };
      }
      const candidates = [
        data.loans,
        data.data,
        data.items,
        data.loanList,
        data.vamha,
        data.backup && data.backup.loans,
        data.payload && data.payload.loans
      ];
      let loansArr = null;
      for (const c of candidates) {
        if (Array.isArray(c)) { loansArr = c; break; }
      }
      if (!loansArr && (data.name || data.startDate || data.installments) && (data.amount != null || data.installmentAmount != null)) {
        loansArr = [data];
      }
      return {
        loans: loansArr,
        loanOrder: Array.isArray(data.loanOrder) ? data.loanOrder
          : (Array.isArray(data.order) ? data.order : null),
        settings: data.settings || data.appSettings || null,
        theme: data.theme || null
      };
    }

    function importData(event){
      const file = event.target.files?.[0];
      if (!file) return showToast('فایل JSON را انتخاب کنید.', 'error');
      const name = (file.name || '').toLowerCase();
      if (name && !name.endsWith('.json') && !name.endsWith('.txt') && !name.endsWith('.backup')) {
        showToast('بهتر است فایل JSON پشتیبان را انتخاب کنید.', 'warning');
      }
      const reader = new FileReader();
      reader.onload = async (e) => {
        try {
          let raw = e.target.result;
          if (raw == null) return showToast('فایل خالی است.', 'error');
          raw = String(raw).replace(/^\uFEFF/, '').trim();
          if (!raw) return showToast('فایل خالی است.', 'error');

          let data;
          try {
            data = JSON.parse(raw);
          } catch (parseErr) {
            try {
              data = JSON.parse(JSON.parse(raw));
            } catch (_) {
              throw new Error('فایل JSON معتبر نیست. مطمئن شوید بکاپ EasyVAM را انتخاب کرده‌اید.');
            }
          }

          const extracted = extractLoansFromBackup(data);
          let importedLoans = extracted.loans;
          let importedOrder = extracted.loanOrder;
          let importedSettings = extracted.settings;
          let importedTheme = extracted.theme;

          if (!importedLoans || !Array.isArray(importedLoans)) {
            return showToast('ساختار فایل نامعتبر است (آرایه وام پیدا نشد).', 'error');
          }
          if (!importedLoans.length) {
            return showToast('هیچ وامی داخل فایل پشتیبان نیست.', 'warning');
          }

          const normalized = importedLoans.map(normalizeImportedLoan).filter(Boolean);
          if (!normalized.length) {
            return showToast('وام‌های فایل قابل خواندن نبودند (فرمت ناشناخته).', 'error');
          }

          let updateCount = 0;
          let addCount = 0;
          normalized.forEach(nl => {
            if (loans.some(l => String(l.id) === String(nl.id))) updateCount++;
            else addCount++;
          });

          const msg = updateCount > 0
            ? `${toPersianDigits(normalized.length)} وام در فایل است: ${toPersianDigits(addCount)} جدید و ${toPersianDigits(updateCount)} جایگزین می‌شود. ادامه می‌دهید؟`
            : `${toPersianDigits(addCount)} وام جدید اضافه می‌شود. ادامه می‌دهید؟`;

          let ok = false;
          try {
            ok = await showConfirmGlass(msg, {
              title: 'بازیابی از پشتیبان',
              okText: 'تأیید و ادغام',
              cancelText: 'انصراف'
            });
          } catch (_) {
            ok = window.confirm(msg);
          }
          if (!ok) {
            showToast('بازیابی لغو شد.', 'info');
            return;
          }

          if (importedSettings && typeof importedSettings === 'object') {
            try {
              localStorage.setItem('vam_app_settings', JSON.stringify(importedSettings));
              appSettings = { ...appSettings, ...importedSettings };
            } catch(_){}
          }
          if (importedTheme) {
            try { localStorage.setItem('vam_theme', importedTheme); applyTheme(importedTheme); } catch(_){}
          }

          let addedCount = 0;
          let updatedCount = 0;
          normalized.forEach(newLoan => {
            const idx = loans.findIndex(l => String(l.id) === String(newLoan.id));
            if (idx > -1) {
              loans[idx] = newLoan;
              updatedCount++;
            } else {
              loans.push(newLoan);
              if (!loanOrder.some(id => String(id) === String(newLoan.id))) {
                loanOrder.push(newLoan.id);
              }
              addedCount++;
            }
          });
          if (importedOrder && importedOrder.length) {
            const idSet = new Set(loans.map(l => String(l.id)));
            loanOrder = importedOrder.filter(id => idSet.has(String(id)));
            loans.forEach(l => {
              if (!loanOrder.some(id => String(id) === String(l.id))) loanOrder.push(l.id);
            });
          }
          persist();
          try { updateSelects(); } catch(_){}
          try { renderDashboard(); } catch(_){}
          showToast(`${toPersianDigits(addedCount)} وام جدید · ${toPersianDigits(updatedCount)} به‌روزرسانی شد.`, 'success');
        } catch (err) {
          console.error('importData failed', err);
          showToast(`خطا در خواندن فایل: ${err.message || 'نامشخص'}`, 'error');
        }
      };
      reader.onerror = () => showToast('خواندن فایل ناموفق بود.', 'error');
      reader.readAsText(file, 'UTF-8');
      setTimeout(() => { try { event.target.value = ''; } catch(_){} }, 500);
    }

    // ============================================================
    //  THEME
    // ============================================================
    function applyTheme(theme) {
      const isDark = theme === 'dark';
      document.body.classList.toggle('dark-theme', isDark);
      localStorage.setItem('vam_theme', isDark ? 'dark' : 'light');
      const icon = document.getElementById('theme-icon');
      const label = document.getElementById('theme-label');
      if (icon) icon.className = isDark ? 'fa-solid fa-sun' : 'fa-solid fa-moon';
      if (label) label.textContent = isDark ? 'تم روشن' : 'تم تاریک';
    }
    function toggleTheme() {
      const next = document.body.classList.contains('dark-theme') ? 'light' : 'dark';
      applyTheme(next);
      showToast(next === 'dark' ? 'تم تاریک فعال شد' : 'تم روشن فعال شد', 'info');
    }

    // ============================================================
    //  ACCOUNT / AUTH (multi-user)
    // ============================================================
    function migrateUsersIfNeeded() {
      let users = safeParseJSON('vam_users', null);
      if (Array.isArray(users)) return users;
      // migrate old single account
      const old = safeParseJSON('vam_account', null);
      users = [];
      if (old && old.username) {
        users.push({
          id: Date.now(),
          username: old.username,
          passwordHash: old.passwordHash || '',
          fingerprint: !!old.fingerprint,
          fingerprintRegistered: !!old.fingerprintRegistered
        });
      }
      localStorage.setItem('vam_users', JSON.stringify(users));
      return users;
    }
    function getUsers() {
      return migrateUsersIfNeeded();
    }
    function saveUsers(users) {
      localStorage.setItem('vam_users', JSON.stringify(users));
    }
    function getAccount() {
      // current logged-in user, or first user (compat)
      const users = getUsers();
      const uid = sessionStorage.getItem('vam_user_id') || localStorage.getItem('vam_last_user_id');
      if (uid) {
        const u = users.find(x => String(x.id) === String(uid));
        if (u) return u;
      }
      return users[0] || null;
    }
    function getUserById(id) {
      return getUsers().find(u => String(u.id) === String(id)) || null;
    }
    function getUserCredKey(userId) {
      return 'vam_webauthn_cred_' + userId;
    }
    const PBKDF2_ITERS = 100000;

    function bytesToHex(buf) {
      return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
    }
    function hexToBytes(hex) {
      const out = new Uint8Array(Math.floor(String(hex || '').length / 2));
      for (let i = 0; i < out.length; i++) out[i] = parseInt(hex.substr(i * 2, 2), 16) || 0;
      return out;
    }

    /** هش legacy (نسخه‌های قدیمی): SHA-256 بدون salt */
    async function hashPasswordLegacy(pw) {
      if (!pw) return '';
      try {
        const enc = new TextEncoder().encode(pw);
        const buf = await crypto.subtle.digest('SHA-256', enc);
        return bytesToHex(buf);
      } catch (e) {
        // fallback ضعیف‌تر فقط وقتی WebCrypto نیست
        return fallbackIterHash(pw, 'legacy-salt', 5000);
      }
    }

    /** هش تکرارشونده بدون WebCrypto (بهتر از یک حلقه ساده) */
    function fallbackIterHash(pw, salt, rounds) {
      let s = String(salt) + '|' + String(pw);
      for (let r = 0; r < rounds; r++) {
        let h = 2166136261;
        for (let i = 0; i < s.length; i++) {
          h ^= s.charCodeAt(i);
          h = Math.imul(h, 16777619);
        }
        s = (h >>> 0).toString(16) + s.slice(0, 48);
      }
      let out = '';
      for (let i = 0; i < 32; i++) {
        let h = 0;
        const chunk = s + ':' + i;
        for (let j = 0; j < chunk.length; j++) h = ((h << 5) - h + chunk.charCodeAt(j)) | 0;
        out += ((h >>> 0) & 0xff).toString(16).padStart(2, '0');
      }
      return out;
    }

    /**
     * هش امن رمز: PBKDF2-SHA256 + salt تصادفی
     * فرمت ذخیره: pbkdf2$<iters>$<saltHex>$<hashHex>
     * سازگار با هش‌های قدیمی (SHA-256 خالص) در verifyPassword
     */
    async function hashPassword(pw, existingSaltHex) {
      if (!pw) return '';
      try {
        if (!crypto?.subtle) throw new Error('no-subtle');
        const salt = existingSaltHex
          ? hexToBytes(existingSaltHex)
          : crypto.getRandomValues(new Uint8Array(16));
        const keyMaterial = await crypto.subtle.importKey(
          'raw', new TextEncoder().encode(pw), 'PBKDF2', false, ['deriveBits']
        );
        const bits = await crypto.subtle.deriveBits(
          { name: 'PBKDF2', salt, iterations: PBKDF2_ITERS, hash: 'SHA-256' },
          keyMaterial,
          256
        );
        return `pbkdf2$${PBKDF2_ITERS}$${bytesToHex(salt)}$${bytesToHex(bits)}`;
      } catch (e) {
        const saltHex = existingSaltHex || bytesToHex(
          (typeof crypto !== 'undefined' && crypto.getRandomValues)
            ? crypto.getRandomValues(new Uint8Array(16))
            : Uint8Array.from({ length: 16 }, (_, i) => (Date.now() + i * 17) & 0xff)
        );
        const hash = fallbackIterHash(pw, saltHex, 12000);
        return `fbk$${saltHex}$${hash}`;
      }
    }

    async function verifyPassword(pw, stored) {
      if (!stored) return !pw;
      if (!pw) return false;
      // فرمت جدید PBKDF2
      if (stored.startsWith('pbkdf2$')) {
        const parts = stored.split('$');
        if (parts.length !== 4) return false;
        const saltHex = parts[2];
        const recomputed = await hashPassword(pw, saltHex);
        return recomputed === stored;
      }
      // fallback بدون WebCrypto
      if (stored.startsWith('fbk$')) {
        const parts = stored.split('$');
        if (parts.length !== 3) return false;
        const saltHex = parts[1];
        const hash = fallbackIterHash(pw, saltHex, 12000);
        return `fbk$${saltHex}$${hash}` === stored;
      }
      // سازگاری با هش قدیمی SHA-256
      const legacy = await hashPasswordLegacy(pw);
      return legacy === stored;
    }

    function fillLoginUserSelect() {
      const sel = document.getElementById('login-username');
      if (!sel) return;
      const users = getUsers();
      const prev = sel.value;
      sel.innerHTML = '';
      if (!users.length) {
        const opt = document.createElement('option');
        opt.value = '';
        opt.textContent = '— هنوز کاربری نیست —';
        sel.appendChild(opt);
        updateLoginAvatarUI(null);
        return;
      }
      users.forEach(u => {
        const opt = document.createElement('option');
        opt.value = u.id;
        opt.textContent = u.username;
        sel.appendChild(opt);
      });
      const last = localStorage.getItem('vam_last_user_id');
      if (prev && users.some(u => String(u.id) === String(prev))) sel.value = prev;
      else if (last && users.some(u => String(u.id) === String(last))) sel.value = last;
      updateLoginAvatarUI(getUserById(sel.value));
    }
    function onLoginUserChange() {
      updateLoginAvatarUI(getUserById(document.getElementById('login-username')?.value));
      checkFingerprintUi();
    }
    function updateLoginAvatarUI(user) {
      const img = document.getElementById('login-avatar-img');
      const fb = document.getElementById('login-avatar-fallback');
      const nameEl = document.getElementById('login-welcome-name');
      if (nameEl) nameEl.textContent = user?.username ? ('سلام، ' + user.username) : 'خوش آمدید';
      if (!img || !fb) return;
      if (user?.avatar) {
        img.src = user.avatar;
        img.classList.add('show');
        fb.classList.add('hide');
      } else {
        img.removeAttribute('src');
        img.classList.remove('show');
        fb.classList.remove('hide');
      }
    }
    function compressImageFile(file, maxSize, quality) {
      return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onerror = () => reject(new Error('خواندن فایل ناموفق بود'));
        reader.onload = () => {
          const img = new Image();
          img.onload = () => {
            let w = img.width, h = img.height;
            const scale = Math.min(1, (maxSize || 240) / Math.max(w, h));
            w = Math.round(w * scale);
            h = Math.round(h * scale);
            const canvas = document.createElement('canvas');
            canvas.width = w; canvas.height = h;
            canvas.getContext('2d').drawImage(img, 0, 0, w, h);
            resolve(canvas.toDataURL('image/jpeg', quality || 0.72));
          };
          img.onerror = () => reject(new Error('تصویر نامعتبر است'));
          img.src = reader.result;
        };
        reader.readAsDataURL(file);
      });
    }
    async function onLoginAvatarSelected(event) {
      const file = event.target.files?.[0];
      event.target.value = '';
      if (!file) return;
      const user = getUserById(document.getElementById('login-username')?.value);
      if (!user) return showToast('ابتدا یک کاربر انتخاب کنید.', 'warning');
      try {
        const dataUrl = await compressImageFile(file, 240, 0.7);
        saveUsers(getUsers().map(u => String(u.id) === String(user.id) ? { ...u, avatar: dataUrl } : u));
        updateLoginAvatarUI(getUserById(user.id));
        renderUsersList();
        showToast('عکس پروفایل ذخیره شد.', 'success');
      } catch (e) {
        showToast(e.message || 'خطا در ذخیره عکس', 'error');
      }
    }
    async function onAccountAvatarSelected(event) {
      const file = event.target.files?.[0];
      event.target.value = '';
      if (!file) return;
      try {
        const dataUrl = await compressImageFile(file, 240, 0.7);
        document.getElementById('acc-avatar-data').value = dataUrl;
        const img = document.getElementById('acc-avatar-img');
        const fb = document.getElementById('acc-avatar-fallback');
        if (img) { img.src = dataUrl; img.classList.add('show'); }
        if (fb) fb.classList.add('hide');
      } catch (e) {
        showToast(e.message || 'خطا در انتخاب عکس', 'error');
      }
    }
    function setAccountAvatarPreview(avatar) {
      const img = document.getElementById('acc-avatar-img');
      const fb = document.getElementById('acc-avatar-fallback');
      const hidden = document.getElementById('acc-avatar-data');
      if (hidden) hidden.value = avatar || '';
      if (!img || !fb) return;
      if (avatar) {
        img.src = avatar;
        img.classList.add('show');
        fb.classList.add('hide');
      } else {
        img.removeAttribute('src');
        img.classList.remove('show');
        fb.classList.remove('hide');
      }
    }

    async function openAccountModal(userId) {
      closeSideMenu();
      closeUsersModal();
      const isNew = userId === null || userId === undefined || userId === '';
      const user = isNew ? null : (userId ? getUserById(userId) : getAccount());
      document.getElementById('acc-user-id').value = user ? user.id : '';
      document.getElementById('acc-username').value = user ? user.username : '';
      document.getElementById('acc-password').value = '';
      document.getElementById('acc-password2').value = '';
      document.getElementById('acc-fingerprint').checked = !!(user && user.fingerprint);
      setAccountAvatarPreview(user?.avatar || '');
      document.getElementById('account-modal-title').innerHTML = user
        ? '<i class="fa-solid fa-user-shield me-2 text-indigo-500"></i>ویرایش کاربر'
        : '<i class="fa-solid fa-user-plus me-2 text-indigo-500"></i>افزودن کاربر';
      const delBtn = document.getElementById('btn-delete-account');
      if (delBtn) delBtn.style.display = user ? 'inline-flex' : 'none';

      const statusEl = document.getElementById('webauthn-status');
      if (statusEl) {
        statusEl.textContent = 'در حال بررسی پشتیبانی دستگاه...';
        const avail = await isWebAuthnAvailable();
        const stored = user ? safeParseJSON(getUserCredKey(user.id), null) : null;
        if (!avail.ok) {
          const map = {
            secure: '⚠️ WebAuthn فقط روی HTTPS یا localhost فعال است.',
            api: '⚠️ این مرورگر از WebAuthn پشتیبانی نمی‌کند.',
            platform: '⚠️ بیومتریک این دستگاه در دسترس نیست.'
          };
          statusEl.textContent = map[avail.reason] || '⚠️ WebAuthn در دسترس نیست.';
          statusEl.style.color = '#f59e0b';
        } else if (stored?.rawId && user?.fingerprintRegistered) {
          statusEl.textContent = '✓ اثر انگشت برای این کاربر ثبت شده است.';
          statusEl.style.color = '#22c55e';
        } else {
          statusEl.textContent = '✓ دستگاه آماده ثبت اثر انگشت است.';
          statusEl.style.color = '#22c55e';
        }
      }
      document.getElementById('account-modal').classList.add('open');
    }
    function closeAccountModal() {
      document.getElementById('account-modal').classList.remove('open');
    }
    function openAccountModalFromLogin() {
      // allow editing selected user or create new
      const sel = document.getElementById('login-username');
      const id = sel?.value;
      if (id) openAccountModal(id);
      else openAccountModal(null);
    }
    function openUsersModalFromLogin() {
      openUsersModal();
    }

    async function saveAccountSettings() {
      const editId = document.getElementById('acc-user-id').value;
      const username = document.getElementById('acc-username').value.trim();
      const pw = document.getElementById('acc-password').value;
      const pw2 = document.getElementById('acc-password2').value;
      const fingerprint = document.getElementById('acc-fingerprint').checked;
      if (!username) return showToast('نام کاربری را وارد کنید.', 'error');

      let users = getUsers();
      const isNew = !editId;
      if (users.some(u => u.username === username && String(u.id) !== String(editId))) {
        return showToast('این نام کاربری قبلاً ثبت شده است.', 'error');
      }

      let passwordHash = '';
      if (isNew) {
        if (!pw || pw.length < 4) return showToast('برای کاربر جدید رمز حداقل ۴ کاراکتر لازم است.', 'error');
        if (pw !== pw2) return showToast('تکرار رمز مطابقت ندارد.', 'error');
        passwordHash = await hashPassword(pw);
      } else {
        const existing = getUserById(editId);
        passwordHash = existing?.passwordHash || '';
        if (pw || pw2) {
          if (pw.length < 4) return showToast('رمز باید حداقل ۴ کاراکتر باشد.', 'error');
          if (pw !== pw2) return showToast('تکرار رمز مطابقت ندارد.', 'error');
          passwordHash = await hashPassword(pw);
        }
      }

      const existingUser = isNew ? null : getUserById(editId);
      const avatarData = document.getElementById('acc-avatar-data')?.value || existingUser?.avatar || '';

      let user = {
        id: isNew ? Date.now() : Number(editId) || editId,
        username,
        passwordHash,
        avatar: avatarData,
        fingerprint: false,
        fingerprintRegistered: false
      };

      if (fingerprint) {
        try {
          await registerFingerprint(username, user.id);
          user.fingerprint = true;
          user.fingerprintRegistered = true;
        } catch (e) {
          console.warn(e);
          user.fingerprint = false;
          user.fingerprintRegistered = false;
          showToast(webAuthnErrorMessage(e) + ' — کاربر بدون اثر انگشت ذخیره شد.', 'warning');
        }
      } else {
        localStorage.removeItem(getUserCredKey(user.id));
      }

      if (isNew) users.push(user);
      else users = users.map(u => String(u.id) === String(user.id) ? user : u);
      saveUsers(users);
      // keep legacy single-account key in sync with first/current user
      localStorage.setItem('vam_account', JSON.stringify(user));
      fillLoginUserSelect();
      closeAccountModal();
      renderUsersList();
      showToast(isNew ? 'کاربر جدید اضافه شد.' : 'کاربر به‌روزرسانی شد.', 'success');
    }

    function deleteCurrentEditingUser() {
      const editId = document.getElementById('acc-user-id').value;
      if (!editId) return;
      showConfirmGlass('این کاربر حذف شود؟', {
        title: 'حذف کاربر',
        okText: 'حذف',
        cancelText: 'انصراف'
      }).then(ok => {
        if (!ok) return;
        let users = getUsers().filter(u => String(u.id) !== String(editId));
        saveUsers(users);
        localStorage.removeItem(getUserCredKey(editId));
        if (sessionStorage.getItem('vam_user_id') === String(editId)) {
          sessionStorage.removeItem('vam_logged_in');
          sessionStorage.removeItem('vam_user_id');
        }
        closeAccountModal();
        fillLoginUserSelect();
        renderUsersList();
        showToast('کاربر حذف شد.', 'success');
      });

    }
    function clearAccountSettings() {
      deleteCurrentEditingUser();
    }

    function openUsersModal() {
      closeSideMenu();
      closeAccountModal();
      renderUsersList();
      document.getElementById('users-modal').classList.add('open');
    }
    function closeUsersModal() {
      document.getElementById('users-modal')?.classList.remove('open');
    }
    function renderUsersList() {
      const box = document.getElementById('users-list');
      if (!box) return;
      const users = getUsers();
      const currentId = sessionStorage.getItem('vam_user_id');
      if (!users.length) {
        box.innerHTML = '<p class="text-sm" style="color:#94a3b8;text-align:center;padding:12px;">هنوز کاربری ثبت نشده است.</p>';
        return;
      }
      box.innerHTML = users.map(u => {
        const isCurrent = String(u.id) === String(currentId);
        const av = u.avatar
          ? `<img src="${u.avatar}" alt="" style="width:42px;height:42px;border-radius:50%;object-fit:cover;border:2px solid rgba(99,102,241,.35);" />`
          : `<div style="width:42px;height:42px;border-radius:50%;background:linear-gradient(135deg,#e0e7ff,#c7d2fe);display:flex;align-items:center;justify-content:center;color:#4f46e5;"><i class="fa-solid fa-user"></i></div>`;
        return `
          <div class="glass rounded-xl p-3 border border-white/30 flex items-center justify-between gap-2">
            <div class="flex items-center gap-3 min-w-0">
              ${av}
              <div class="min-w-0">
                <div class="font-semibold text-slate-800 truncate">${u.username}${isCurrent ? ' <span class="text-xs text-indigo-500">(فعلی)</span>' : ''}</div>
                <div class="text-xs" style="color:#94a3b8;">
                  ${u.passwordHash ? 'رمز: دارد' : 'رمز: ندارد'}
                  ${u.fingerprintRegistered ? ' · اثر انگشت: فعال' : ''}
                </div>
              </div>
            </div>
            <div class="flex gap-1 shrink-0">
              <button class="btn-glass text-xs px-2 py-1" onclick="openAccountModal('${u.id}')" title="ویرایش">
                <i class="fa-solid fa-pen"></i>
              </button>
              <button class="btn-glass btn-glass-danger text-xs px-2 py-1" onclick="deleteUserById('${u.id}')" title="حذف">
                <i class="fa-solid fa-trash"></i>
              </button>
            </div>
          </div>`;
      }).join('');
    }
    function deleteUserById(id) {
      showConfirmGlass('این کاربر حذف شود؟', {
        title: 'حذف کاربر',
        okText: 'حذف',
        cancelText: 'انصراف'
      }).then(ok => {
        if (!ok) return;
        let users = getUsers().filter(u => String(u.id) !== String(id));
        saveUsers(users);
        localStorage.removeItem(getUserCredKey(id));
        if (sessionStorage.getItem('vam_user_id') === String(id)) {
          sessionStorage.removeItem('vam_logged_in');
          sessionStorage.removeItem('vam_user_id');
        }
        fillLoginUserSelect();
        renderUsersList();
        showToast('کاربر حذف شد.', 'success');
      });

    }

    // ---------- WebAuthn helpers ----------
    function bufferToBase64url(buf) {
      const bytes = new Uint8Array(buf);
      let str = '';
      for (let i = 0; i < bytes.length; i++) str += String.fromCharCode(bytes[i]);
      return btoa(str).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    }
    function base64urlToBuffer(base64url) {
      const pad = '='.repeat((4 - (base64url.length % 4)) % 4);
      const base64 = (base64url + pad).replace(/-/g, '+').replace(/_/g, '/');
      const raw = atob(base64);
      const buf = new ArrayBuffer(raw.length);
      const view = new Uint8Array(buf);
      for (let i = 0; i < raw.length; i++) view[i] = raw.charCodeAt(i);
      return buf;
    }
    function getRpId() {
      const host = location.hostname;
      if (!host || host === 'localhost' || host === '127.0.0.1') return host || undefined;
      return host;
    }
    async function isWebAuthnAvailable() {
      if (!window.isSecureContext) return { ok: false, reason: 'secure' };
      if (!window.PublicKeyCredential) return { ok: false, reason: 'api' };
      try {
        if (typeof PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable === 'function') {
          const uvpa = await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable();
          if (!uvpa) return { ok: false, reason: 'platform' };
        }
      } catch (e) {
        return { ok: false, reason: 'platform' };
      }
      return { ok: true };
    }
    function webAuthnErrorMessage(err) {
      const name = err?.name || '';
      if (name === 'NotAllowedError') return 'عملیات توسط کاربر لغو شد یا زمان آن تمام شد.';
      if (name === 'InvalidStateError') return 'این اثر انگشت قبلاً ثبت شده است.';
      if (name === 'NotSupportedError') return 'اثر انگشت در این دستگاه پشتیبانی نمی‌شود.';
      if (name === 'SecurityError') return 'برای اثر انگشت باید برنامه روی HTTPS یا localhost اجرا شود.';
      return err?.message || 'خطای ناشناخته در WebAuthn';
    }
    async function registerFingerprint(username, userId) {
      const avail = await isWebAuthnAvailable();
      if (!avail.ok) {
        const map = {
          secure: 'برای اثر انگشت باید از HTTPS یا localhost استفاده کنید.',
          api: 'مرورگر از WebAuthn پشتیبانی نمی‌کند.',
          platform: 'احراز هویت بیومتریک روی این دستگاه در دسترس نیست.'
        };
        throw new Error(map[avail.reason] || 'WebAuthn در دسترس نیست');
      }
      const challenge = crypto.getRandomValues(new Uint8Array(32));
      const uid = userId || Date.now();
      const userIdBytes = new TextEncoder().encode(String(uid));
      const rpId = getRpId();
      const publicKey = {
        challenge,
        rp: { name: 'سیستم مدیریت وام', ...(rpId ? { id: rpId } : {}) },
        user: { id: userIdBytes, name: username || 'user', displayName: username || 'کاربر' },
        pubKeyCredParams: [
          { type: 'public-key', alg: -7 },
          { type: 'public-key', alg: -257 }
        ],
        authenticatorSelection: {
          authenticatorAttachment: 'platform',
          userVerification: 'required',
          residentKey: 'discouraged',
          requireResidentKey: false
        },
        timeout: 60000,
        attestation: 'none'
      };
      const existing = safeParseJSON(getUserCredKey(uid), null);
      if (existing?.rawId) {
        publicKey.excludeCredentials = [{
          type: 'public-key',
          id: base64urlToBuffer(existing.rawId),
          transports: existing.transports || ['internal']
        }];
      }
      const cred = await navigator.credentials.create({ publicKey });
      if (!cred) throw new Error('ثبت اثر انگشت انجام نشد.');
      const rawId = bufferToBase64url(cred.rawId);
      const transports = cred.response?.getTransports?.() || ['internal'];
      localStorage.setItem(getUserCredKey(uid), JSON.stringify({
        id: cred.id,
        rawId,
        transports,
        type: cred.type,
        username: username || 'user',
        userId: uid,
        createdAt: new Date().toISOString()
      }));
      return true;
    }
    async function loginWithFingerprint() {
      try {
        const avail = await isWebAuthnAvailable();
        if (!avail.ok) {
          const map = {
            secure: 'اثر انگشت فقط روی HTTPS یا localhost کار می‌کند.',
            api: 'مرورگر از WebAuthn پشتیبانی نمی‌کند.',
            platform: 'بیومتریک این دستگاه در دسترس نیست.'
          };
          return showToast(map[avail.reason] || 'WebAuthn در دسترس نیست', 'error');
        }
        const sel = document.getElementById('login-username');
        const userId = sel?.value;
        const user = getUserById(userId);
        if (!user) return showToast('کاربر را انتخاب کنید.', 'error');
        const stored = safeParseJSON(getUserCredKey(user.id), null);
        if (!stored?.rawId) return showToast('برای این کاربر اثر انگشت ثبت نشده است.', 'warning');

        const challenge = crypto.getRandomValues(new Uint8Array(32));
        const rpId = getRpId();
        const assertion = await navigator.credentials.get({
          publicKey: {
            challenge,
            timeout: 60000,
            userVerification: 'required',
            allowCredentials: [{
              type: 'public-key',
              id: base64urlToBuffer(stored.rawId),
              transports: stored.transports || ['internal']
            }],
            ...(rpId ? { rpId } : {})
          }
        });
        if (!assertion) return showToast('ورود با اثر انگشت انجام نشد.', 'error');
        sessionStorage.setItem('vam_logged_in', '1');
        sessionStorage.setItem('vam_user_id', String(user.id));
        localStorage.setItem('vam_last_user_id', String(user.id));
        closeUsersModal();
        closeAccountModal();
        hideLoginScreen();
        showToast('ورود با اثر انگشت موفق بود. خوش آمدید ' + user.username, 'success');
      } catch (e) {
        console.warn('WebAuthn login error:', e);
        showToast(webAuthnErrorMessage(e), 'error');
      }
    }
    async function checkFingerprintUi() {
      const fpBtn = document.getElementById('btn-fingerprint-login');
      const pwBtn = document.getElementById('btn-password-login');
      if (!fpBtn) return;
      const sel = document.getElementById('login-username');
      const user = getUserById(sel?.value);
      const stored = user ? safeParseJSON(getUserCredKey(user.id), null) : null;
      const avail = await isWebAuthnAvailable();
      const show = !!(user?.fingerprint && stored?.rawId && avail.ok);
      fpBtn.style.display = show ? 'inline-flex' : 'none';
      // وقتی اثرانگشت فعال است، دکمه رمز را ثانویه نشان بده تا اولویت با اثرانگشت باشد
      if (pwBtn) {
        if (show) {
          pwBtn.classList.remove('login-btn-primary');
          pwBtn.classList.add('login-btn-secondary');
        } else {
          pwBtn.classList.remove('login-btn-secondary');
          pwBtn.classList.add('login-btn-primary');
        }
      }
    }
    function showLoginScreen() {
      const users = getUsers();
      const screen = document.getElementById('login-screen');
      // if no users at all, don't block app
      if (!users.length) {
        screen.classList.add('hidden');
        return;
      }
      // if users exist but none has password, still show for selection? require at least one passwordHash
      const needAuth = users.some(u => u.passwordHash);
      if (!needAuth) {
        screen.classList.add('hidden');
        return;
      }
      fillLoginUserSelect();
      screen.classList.remove('hidden');
      checkFingerprintUi().then(() => {
        // اولویت ورود با اثرانگشت: اگر در دسترس باشد، سریع پرامپت اثرانگشت را نشان بده
        const fpBtn = document.getElementById('btn-fingerprint-login');
        if (fpBtn && fpBtn.style.display !== 'none') {
          // کمی تاخیر تا UI کاملاً آماده شود، سپس خودکار درخواست اثرانگشت
          setTimeout(() => {
            if (!document.getElementById('login-screen')?.classList.contains('hidden')) {
              loginWithFingerprint();
            }
          }, 350);
        } else {
          document.getElementById('login-password')?.focus();
        }
      });
    }
    function hideLoginScreen() {
      document.getElementById('login-screen')?.classList.add('hidden');
    }
    async function doLogin() {
      const users = getUsers();
      if (!users.length) { hideLoginScreen(); return; }
      const sel = document.getElementById('login-username');
      const user = getUserById(sel?.value);
      if (!user) return showToast('کاربر را انتخاب کنید.', 'error');
      if (!user.passwordHash) {
        sessionStorage.setItem('vam_logged_in', '1');
        sessionStorage.setItem('vam_user_id', String(user.id));
        localStorage.setItem('vam_last_user_id', String(user.id));
        closeUsersModal();
        closeAccountModal();
        hideLoginScreen();
        return showToast('خوش آمدید ' + user.username, 'success');
      }
      const pw = document.getElementById('login-password').value;
      const ok = await verifyPassword(pw, user.passwordHash);
      if (ok) {
        // ارتقای خودکار هش قدیمی به PBKDF2
        if (user.passwordHash && !String(user.passwordHash).startsWith('pbkdf2$') && !String(user.passwordHash).startsWith('fbk$')) {
          try {
            const users = getUsers();
            const idx = users.findIndex(u => String(u.id) === String(user.id));
            if (idx > -1) {
              users[idx].passwordHash = await hashPassword(pw);
              localStorage.setItem('vam_users', JSON.stringify(users));
            }
          } catch (_) {}
        }
        sessionStorage.setItem('vam_logged_in', '1');
        sessionStorage.setItem('vam_user_id', String(user.id));
        localStorage.setItem('vam_last_user_id', String(user.id));
        closeUsersModal();
        closeAccountModal();
        hideLoginScreen();
        showToast('خوش آمدید ' + user.username, 'success');
      } else {
        showToast('رمز عبور نادرست است.', 'error');
      }
    }
    function exitApp() {
      closeSideMenu();
      showConfirmGlass('از برنامه خارج می‌شوید؟', {
        title: 'خروج',
        okText: 'خروج',
        cancelText: 'انصراف'
      }).then(ok => {
        if (!ok) return;
        sessionStorage.removeItem('vam_logged_in');
        sessionStorage.removeItem('vam_user_id');
        const users = getUsers();
        if (users.some(u => u.passwordHash)) {
          showLoginScreen();
          showToast('از حساب خارج شدید.', 'info');
        } else {
          forceCloseApp(true);
        }
      });

    }
    function forceCloseApp(skipConfirm) {
      const runClose = () => {
        sessionStorage.removeItem('vam_logged_in');
        sessionStorage.removeItem('vam_user_id');
        try {
          if (navigator.app && typeof navigator.app.exitApp === 'function') {
            navigator.app.exitApp();
            return;
          }
        } catch (e) {}
        try { window.close(); } catch (e) {}
        try {
          window.open('', '_self');
          window.close();
        } catch (e) {}
        document.body.innerHTML = '<div style="display:flex;align-items:center;justify-content:center;min-height:100vh;font-family:Vazirmatn,Tahoma,sans-serif;background:#0f172a;color:#e2e8f0;text-align:center;padding:24px"><div><div style="font-size:40px;margin-bottom:12px">👋</div><p>می‌توانید این تب را ببندید.</p></div></div>';
      };
      if (skipConfirm) {
        runClose();
        return;
      }
      showConfirmGlass('خروج کامل از برنامه؟', {
        title: 'خروج',
        okText: 'خروج',
        cancelText: 'انصراف'
      }).then(ok => { if (ok) runClose(); });
    }

    // ============================================================
    //  EXCEL EXPORT (Persian RTL + bordered tables)
    // ============================================================
    function excelSheetFromAoA(aoa, sheetName) {
      const ws = XLSX.utils.aoa_to_sheet(aoa);

      // approximate column widths (RTL friendly)
      const colWidths = [];
      aoa.forEach(row => {
        (row || []).forEach((cell, i) => {
          const len = String(cell ?? '').length;
          colWidths[i] = Math.max(colWidths[i] || 14, Math.min(len + 4, 48));
        });
      });
      // ensure at least width for all columns in range
      const maxCols = Math.max(0, ...aoa.map(r => (r || []).length));
      for (let i = 0; i < maxCols; i++) {
        if (!colWidths[i]) colWidths[i] = 14;
      }
      ws['!cols'] = colWidths.map(w => ({ wch: w }));

      // RTL sheet view
      if (!ws['!views']) ws['!views'] = [];
      ws['!views'].push({ rightToLeft: true, showGridLines: true });

      const range = XLSX.utils.decode_range(ws['!ref'] || 'A1');
      // ارتفاع ردیف‌ها برای وسط‌چین عمودی
      ws['!rows'] = [];
      for (let R = range.s.r; R <= range.e.r; ++R) {
        ws['!rows'][R] = { hpt: 22, hpx: 22 };
      }

      const border = {
        top:    { style: 'thin', color: { rgb: '94A3B8' } },
        bottom: { style: 'thin', color: { rgb: '94A3B8' } },
        left:   { style: 'thin', color: { rgb: '94A3B8' } },
        right:  { style: 'thin', color: { rgb: '94A3B8' } }
      };
      const centerAlign = {
        horizontal: 'center',
        vertical: 'center',
        wrapText: true,
        readingOrder: 2
      };

      for (let R = range.s.r; R <= range.e.r; ++R) {
        for (let C = range.s.c; C <= range.e.c; ++C) {
          const addr = XLSX.utils.encode_cell({ r: R, c: C });
          // سلول خالی هم بساز تا استایل وسط‌چین اعمال شود
          if (!ws[addr]) {
            ws[addr] = { t: 's', v: '' };
          }
          if (typeof ws[addr] === 'object') {
            ws[addr].s = ws[addr].s || {};
            ws[addr].s.alignment = { ...centerAlign };
            ws[addr].s.border = border;
            // ردیف عنوان / هدر جدول
            const row0 = aoa[R] && aoa[R][0];
            const isHeader =
              R === 0 ||
              (typeof row0 === 'string' && (
                row0.includes('شماره') ||
                row0.includes('نام وام') ||
                row0.includes('گزارش')
              ));
            if (isHeader) {
              ws[addr].s.font = { bold: true };
              ws[addr].s.fill = { patternType: 'solid', fgColor: { rgb: 'EEF2FF' } };
            }
          }
        }
      }

      return ws;
    }
    function downloadWorkbook(wb, filename) {
      // force workbook-level RTL
      if (!wb.Workbook) wb.Workbook = {};
      if (!wb.Workbook.Views) wb.Workbook.Views = [];
      wb.Workbook.Views[0] = { RTL: true };
      XLSX.writeFile(wb, filename, { bookType: 'xlsx', compression: true, cellStyles: true });
    }
    function exportLoanExcel() {
      if (typeof XLSX === 'undefined') return showToast('کتابخانه اکسل در دسترس نیست.', 'error');
      const sel = document.getElementById('report-loan-select');
      const id = sel?.value;
      if (!id) return showToast('یک وام انتخاب کنید.', 'error');
      const loan = loans.find(l => String(l.id) === String(id));
      if (!loan) return showToast('وام یافت نشد.', 'error');

      const paidCount = (loan.installments || []).filter(i => i.paid).length;
      const remain = Math.max((loan.installmentCount || 0) - paidCount, 0);
      const settle = getLoanSettlementDate(loan);

      const header = [
        ['گزارش بازپرداخت وام'],
        ['نام وام', loan.name],
        ['مبلغ وام (' + currencyLabel() + ')', loan.amount],
        ['مبلغ هر قسط (' + currencyLabel() + ')', loan.installmentAmount],
        ['تعداد اقساط', loan.installmentCount],
        ['پرداخت‌شده', paidCount],
        ['مانده', remain],
        ['تاریخ تسویه', settle ? formatDateToPersian(settle) : '—'],
        ['تاریخ گزارش', reportDateJalali()],
        [],
        ['شماره قسط', 'تاریخ قسط', 'مبلغ (' + currencyLabel() + ')', 'وضعیت']
      ];
      const rows = (loan.installments || []).map(inst => [
        inst.number,
        formatDateToPersian(inst.date),
        inst.amount,
        inst.paid ? 'پرداخت‌شده' : (isOverdue(inst) ? 'سررسید شده' : 'پرداخت‌نشده')
      ]);
      const aoa = header.concat(rows);
      const ws = excelSheetFromAoA(aoa, 'بازپرداخت');
      // merge title
      ws['!merges'] = [{ s: { r: 0, c: 0 }, e: { r: 0, c: 3 } }];
      // print setup A4
      ws['!pageSetup'] = { paperSize: 9, orientation: 'portrait', fitToWidth: 1, fitToHeight: 0 };
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'بازپرداخت');
      downloadWorkbook(wb, `bazpardakht_${safeFilename(loan.name, 'loan')}.xlsx`);
      showToast('فایل اکسل ذخیره شد.', 'success');
    }
    function exportAllLoansExcel() {
      if (typeof XLSX === 'undefined') return showToast('کتابخانه اکسل در دسترس نیست.', 'error');
      if (!loans.length) return showToast('هیچ وامی ثبت نشده است.', 'error');
      const aoa = [
        ['گزارش کل وام‌ها'],
        ['تاریخ گزارش', reportDateJalali()],
        [],
        ['نام وام', 'مبلغ وام', 'مبلغ قسط', 'تعداد اقساط', 'پرداختی', 'مانده', 'تاریخ تسویه']
      ];
      loans.forEach(loan => {
        const paid = (loan.installments || []).filter(i => i.paid).length;
        const remain = Math.max((loan.installmentCount || 0) - paid, 0);
        const settle = getLoanSettlementDate(loan);
        aoa.push([
          loan.name,
          loan.amount,
          loan.installmentAmount,
          loan.installmentCount,
          paid,
          remain,
          settle ? formatDateToPersian(settle) : '—'
        ]);
      });
      const ws = excelSheetFromAoA(aoa, 'وام‌ها');
      ws['!merges'] = [{ s: { r: 0, c: 0 }, e: { r: 0, c: 6 } }];
      ws['!pageSetup'] = { paperSize: 9, orientation: 'portrait', fitToWidth: 1, fitToHeight: 0 };
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'وام‌ها');
      downloadWorkbook(wb, `gozaresh_vamha_${reportDateForFilename()}.xlsx`);
      showToast('فایل اکسل کل وام‌ها ذخیره شد.', 'success');
    }

    // ============================================================
    //  INIT
    // ============================================================
    (function init(){
      if (loanOrder.length === 0 && loans.length > 0) {
        loanOrder = loans.map(l => l.id);
        localStorage.setItem('loanOrder', JSON.stringify(loanOrder));
      }
      // theme
      applyTheme(localStorage.getItem('vam_theme') || 'light');
      // migrate users + auth gate
      migrateUsersIfNeeded();
      const users = getUsers();
      const needAuth = users.some(u => u.passwordHash);
      if (needAuth && sessionStorage.getItem('vam_logged_in') !== '1') {
        showLoginScreen();
      } else {
        hideLoginScreen();
      }
      applyCompactFromSettings();
      refreshCurrencyLabels();
      renderDashboard();
      showPage('dashboard');

      // Enter key on login
      document.getElementById('login-password')?.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') doLogin();
      });

      // Register Service Worker + soft update
      window.addEventListener('load', () => registerServiceWorkerWithUpdate());

      // Auto-lock + notifications + backup info
      setupActivityWatchers();
      resetAutoLockTimer();
      updateLastBackupInfo();
      // بازیابی handle پوشه بکاپ (اگر قبلاً انتخاب شده)
      restoreBackupDirHandle().then(() => updateBackupFolderStatus()).catch(() => {});
      // بازیابی از IndexedDB در صورت نیاز + یادآوری پشتیبان
      tryRecoverFromIDB().then((recovered) => {
        if (recovered) {
          try { updateSelects(); renderDashboard(); } catch(_){}
          showToast('داده‌ها از حافظه پایدار بازیابی شدند.', 'info');
        }
        maybeRemindBackup();
      }).catch(() => { maybeRemindBackup(); });
      setTimeout(() => { try { maybeShowOverdueNotifications(); } catch(e){} }, 2500);
    })();
