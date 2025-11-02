```javascript
/* public/js/payments.js
   إدارة الدفع (واجهة العميل)
   - يدعم: كاش (محلي) + ECCP / BaridiMob عبر الخادم الوسيط
   - يقوم بعرض مودال الدفع، إنشاء طلب عبر الخادم، عرض رابط/QRCode، وpoll لحالة الطلب
   - fallback: إنشاء طلب محلي (محاكاة) عند تعذر الاتصال بالخادم
*/

const Payments = (function () {
  const PAYMENTS_KEY = 'demo_payments_v1';
  const LEADS_KEY = 'demo_leads_v1';
  let pollingMap = {}; // orderId -> intervalId

  // مساعدة: قراءة JSON أو رمي خطأ
  async function fetchJson(url, opts = {}) {
    const resp = await fetch(url, opts);
    const text = await resp.text();
    let json = {};
    try { json = text ? JSON.parse(text) : {}; } catch (e) { json = { raw: text }; }
    if (!resp.ok) {
      const err = new Error(json.error || resp.statusText || 'HTTP error');
      err.response = json;
      throw err;
    }
    return json;
  }

  // افتح مودال الدفع للدورة (يطالب الاسم و الايميل و اختيار الوسيلة)
  async function openEnroll(courseId) {
    try {
      const courses = JSON.parse(localStorage.getItem('demo_courses_v1') || '[]');
      const course = courses.find(c => c.id === courseId);
      if (!course) return alert('الدورة غير موجودة');
      APP.openModal(`
        <div style="display:flex;justify-content:space-between;align-items:center">
          <strong>دفع — ${course.title}</strong>
          <button class="btn-ghost" onclick="APP.closeModal()">إغلاق</button>
        </div>
        <div style="margin-top:12px">
          <label>الاسم</label><input id="pay-name" placeholder="الاسم الكامل" />
          <label style="margin-top:8px">الإيميل</label><input id="pay-email" placeholder="email@example.com" />
          <label style="margin-top:8px">طريقة الدفع</label>
          <select id="pay-method"><option value="cash">كاش (عند الحضور)</option><option value="eccp">BaridiMob / ECCP</option></select>
          <div style="margin-top:12px;display:flex;gap:8px">
            <button class="btn-primary" onclick="Payments.pay('${course.id}')">ادفع الآن — ${course.price} USD</button>
            <button class="btn-ghost" onclick="APP.closeModal()">إلغاء</button>
          </div>
        </div>
      `);
    } catch (e) {
      console.error('openEnroll error', e);
      alert('خطأ داخلي');
    }
  }

  // تنفيذ الدفع حسب الطريقة المختارة
  async function pay(courseId) {
    try {
      const name = (document.getElementById('pay-name') || {}).value?.trim();
      const email = (document.getElementById('pay-email') || {}).value?.trim();
      const method = (document.getElementById('pay-method') || {}).value;
      if (!name || !email) return alert('الاسم والإيميل مطلوبان');

      const courses = JSON.parse(localStorage.getItem('demo_courses_v1') || '[]');
      const course = courses.find(c => c.id === courseId);
      if (!course) return alert('الدورة غير موجودة');

      // طريقة نقدية: سجل مباشرة كمدفوع
      if (method === 'cash') {
        const payments = JSON.parse(localStorage.getItem(PAYMENTS_KEY) || '[]');
        const rec = { id: 'cash-' + Date.now(), courseId, name, email, amount: course.price, method: 'cash', status: 'paid', time: new Date().toISOString() };
        payments.push(rec);
        localStorage.setItem(PAYMENTS_KEY, JSON.stringify(payments));
        // أضف lead إن لم يكن موجودًا
        addLeadIfNeeded(name, email, 'cash');
        APP.addActivity(`تسجيل نقدي: ${name} — ${course.title}`);
        APP.closeModal(); APP.renderDashboard(); APP.renderCourses();
        return;
      }

      // ECCP / BaridiMob: اسأل السيرفر لإنشاء طلب
      const payload = { courseId, name, email, amount: course.price };
      const resp = await fetchJson('/api/baridimob/create-payment', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      // نجاح: استلم بيانات الدفع (orderId, payment_url, deeplink, qr)
      const orderId = resp.orderId || resp.order_id || ('ORD-' + Date.now());
      const paymentUrl = resp.payment_url || resp.paymentUrl || resp.url || '';
      const deeplink = resp.deeplink || resp.deep_link || '';

      // عرض مودال الدفع مع QR و زر فحص الحالة
      APP.openModal(`
        <div style="display:flex;justify-content:space-between;align-items:center">
          <strong>أكمل الدفع عبر BaridiMob</strong>
          <button class="btn-ghost" onclick="APP.closeModal()">إغلاق</button>
        </div>
        <div style="margin-top:12px">
          <div>رقم الطلب: <b>${orderId}</b></div>
          <div style="margin-top:8px;display:flex;gap:8px;flex-wrap:wrap;align-items:center">
            ${deeplink ? `<a class="btn-primary" href="${deeplink}">فتح تطبيق BaridiMob</a>` : (paymentUrl ? `<a class="btn-primary" href="${paymentUrl}" target="_blank">فتح صفحة الدفع</a>` : `<span class="note">لا يوجد رابط دفع متاح.</span>`)}
            <button class="btn-ghost" onclick="Payments.poll('${orderId}')">تحقق من حالة الدفع الآن</button>
          </div>
          <div id="qr-holder" style="margin-top:10px">${paymentUrl ? `<img src="https://chart.googleapis.com/chart?chs=220x220&cht=qr&chl=${encodeURIComponent(paymentUrl)}" alt="QR">` : ''}</div>
          <div style="margin-top:10px;color:#64748b">يمكنك إغلاق هذه النافذة وسيستمر التحقق تلقائياً (كل 3 ثوانٍ عند الضغط على تحقق).</div>
        </div>
      `);

      // Start polling for this orderId
      startPolling(orderId);

      // سجل طلب مبدئي في الذاكرة (بحالة pending) — ليس ضروريًا إذا سيرفرك سيرسل webhook، لكنه مفيد للمحاكاة
      const payments = JSON.parse(localStorage.getItem(PAYMENTS_KEY) || '[]');
      payments.push({ id: orderId, courseId, name, email, amount: course.price, method: 'eccp', status: 'pending', time: new Date().toISOString() });
      localStorage.setItem(PAYMENTS_KEY, JSON.stringify(payments));
      APP.addActivity(`إنشاء طلب دفع ${orderId} — ${course.title}`);

    } catch (err) {
      console.warn('pay error', err);
      // fallback: محاكاة طلب محلي مع إمكانية "وضع كمؤكد"
      const orderId = 'LORD-' + Date.now();
      const payments = JSON.parse(localStorage.getItem(PAYMENTS_KEY) || '[]');
      // course lookup
      const courses = JSON.parse(localStorage.getItem('demo_courses_v1') || '[]');
      const course = courses.find(c => c.id === courseId) || { title: 'دورة' };
      payments.push({ id: orderId, courseId, name: (document.getElementById('pay-name')||{}).value || '', email: (document.getElementById('pay-email')||{}).value || '', amount: course.price, method: 'sim', status: 'pending', time: new Date().toISOString() });
      localStorage.setItem(PAYMENTS_KEY, JSON.stringify(payments));
      APP.openModal(`
        <div style="display:flex;justify-content:space-between;align-items:center">
          <strong>محاكاة الدفع المحلي</strong>
          <button class="btn-ghost" onclick="APP.closeModal()">إغلاق</button>
        </div>
        <div style="margin-top:12px">
          <div>تم إنشاء طلب محلي (محاكاة). رقم الطلب: <b>${orderId}</b></div>
          <div style="margin-top:8px;display:flex;gap:8px;">
            <button class="btn-primary" onclick="Payments.markLocalPaymentPaid('${orderId}')">وضع كمدفوع (محاكاة)</button>
            <button class="btn-ghost" onclick="APP.closeModal()">إلغاء</button>
          </div>
        </div>
      `);
      APP.addActivity(`تم إنشاء طلب محاكاة محلي ${orderId}`);
    }
  }

  // تحقق من حالة الدفع عبر السيرفر
  async function poll(orderId, silent = false) {
    try {
      const resp = await fetchJson(`/api/payments/status?orderId=${encodeURIComponent(orderId)}`);
      const status = resp.status || resp.data?.status || 'unknown';
      // تحديث واجهة الحالة إن وُجد عنصر
      const statusEl = document.getElementById('payment-status');
      if (statusEl) {
        statusEl.className = 'status-pill ' + (status === 'paid' ? 'status-paid' : (status === 'failed' ? 'status-failed' : 'status-pending'));
        statusEl.innerText = (status === 'paid' ? 'مدفوع' : (status === 'failed' ? 'فشل' : 'معلق'));
      }
      if (status === 'paid') {
        // أضف سجل الدفع النهائي إلى localStorage إذا لم يكن موجودا
        const payments = JSON.parse(localStorage.getItem(PAYMENTS_KEY) || '[]');
        if (!payments.find(p => p.id === orderId)) {
          // try to build from resp.info or fallback
          const info = resp.info || resp.data || {};
          const courseId = info.courseId || info.course || null;
          const amount = info.amount || info.total || (info.amount_cents ? info.amount_cents / 100 : 0) || 0;
          const name = info.name || info.customer?.name || '---';
          const email = info.email || info.customer?.email || '---';
          payments.push({ id: orderId, courseId, name, email, amount, method: 'eccp', status: 'paid', time: new Date().toISOString() });
          localStorage.setItem(PAYMENTS_KEY, JSON.stringify(payments));
        } else {
          // mark existing record as paid
          const payments2 = payments.map(p => p.id === orderId ? { ...p, status: 'paid', time: new Date().toISOString() } : p);
          localStorage.setItem(PAYMENTS_KEY, JSON.stringify(payments2));
        }

        // أضف lead إذا لم يكن موجودًا
        const paymentsList = JSON.parse(localStorage.getItem(PAYMENTS_KEY) || '[]');
        const p = paymentsList.find(pp => pp.id === orderId);
        if (p) addLeadIfNeeded(p.name || '---', p.email || '---', 'eccp');

        APP.addActivity(`تم تأكيد الدفع للطلب ${orderId}`);
        // إغلاق المودال وتحديث الواجهة
        APP.closeModal();
        APP.renderDashboard();
        stopPolling(orderId);
      } else if (status === 'failed') {
        APP.addActivity(`فشل الدفع للطلب ${orderId}`);
        stopPolling(orderId);
        if (!silent) alert('فشل الدفع. تحقق من الطلب على الخادم.');
      } else {
        // pending - do nothing
      }
    } catch (err) {
      if (!silent) console.warn('poll error', err);
    }
  }

  // start/stop polling helpers
  function startPolling(orderId) {
    stopPolling(orderId);
    const id = setInterval(() => {
      poll(orderId, true);
    }, 3000);
    pollingMap[orderId] = id;
    // do an immediate check too
    poll(orderId, true);
  }
  function stopPolling(orderId) {
    const iid = pollingMap[orderId];
    if (iid) { clearInterval(iid); delete pollingMap[orderId]; }
  }

  // mark a local simulated payment as paid (used in fallback modal)
  function markLocalPaymentPaid(orderId) {
    const payments = JSON.parse(localStorage.getItem(PAYMENTS_KEY) || '[]');
    const idx = payments.findIndex(p => p.id === orderId);
    if (idx !== -1) {
      payments[idx].status = 'paid';
      payments[idx].time = new Date().toISOString();
      localStorage.setItem(PAYMENTS_KEY, JSON.stringify(payments));
      addLeadIfNeeded(payments[idx].name || '---', payments[idx].email || '---', 'sim');
      APP.addActivity(`محاكاة: تم تأكيد الدفع للمطلب ${orderId}`);
      APP.closeModal();
      APP.renderDashboard();
      return;
    } else {
      alert('لم يتم العثور على الطلب المحلي');
    }
  }

  // إضافة متدرب إن لم يكن موجوداً (مساعد)
  function addLeadIfNeeded(name, email, source = 'eccp') {
    try {
      const leads = JSON.parse(localStorage.getItem(LEADS_KEY) || '[]');
      if (!leads.find(l => l.email === email)) {
        leads.push({ id: 'l' + Date.now(), name: name || '', email: email || '', phone: '', source });
        localStorage.setItem(LEADS_KEY, JSON.stringify(leads));
      }
    } catch (e) { console.warn('addLeadIfNeeded error', e); }
  }

  // expose API
  const pub = {
    openEnroll,
    pay,
    poll,
    markLocalPaymentPaid
  };

  // attach to window
  window.Payments = pub;
  return pub;
})();
```
