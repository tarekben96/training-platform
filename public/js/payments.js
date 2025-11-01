/* payments.js - cash & ECCP (BaridiMob) mediator (frontend) */
const Payments = (function(){
  function openEnroll(courseId){
    const courses = JSON.parse(localStorage.getItem('demo_courses_v1')||'[]');
    const c = courses.find(x=>x.id===courseId);
    if(!c) return alert('غير موجود');
    UI.openModal(`
      <div style="display:flex;justify-content:space-between;align-items:center"><strong>دفع — ${c.title}</strong><button class="btn-ghost" onclick="UI.closeModal()">إغلاق</button></div>
      <div style="margin-top:12px">
        <label>الاسم</label><input id="pay-name" placeholder="الاسم الكامل" />
        <label style="margin-top:8px">الإيميل</label><input id="pay-email" placeholder="email@example.com" />
        <label style="margin-top:8px">طريقة الدفع</label>
        <select id="pay-method"><option value="cash">كاش (عند الحضور)</option><option value="eccp">BaridiMob / ECCP</option></select>
        <div style="margin-top:12px;display:flex;gap:8px"><button class="btn-primary" onclick="Payments.pay('${c.id}')">ادفع الآن</button></div>
      </div>
    `);
  }

  async function pay(courseId){
    const name = document.getElementById('pay-name').value.trim();
    const email = document.getElementById('pay-email').value.trim();
    const method = document.getElementById('pay-method').value;
    if(!name||!email) return alert('الاسم والإيميل مطلوبان');
    const courses = JSON.parse(localStorage.getItem('demo_courses_v1')||'[]');
    const c = courses.find(x=>x.id===courseId);
    if(!c) return alert('دورة غير موجودة');

    if(method === 'cash'){
      const payments = JSON.parse(localStorage.getItem('demo_payments_v1')||'[]');
      payments.push({ id:'cash-'+Date.now(), courseId, name, email, amount:c.price, method:'cash', status:'paid', time:new Date().toISOString() });
      localStorage.setItem('demo_payments_v1', JSON.stringify(payments));
      const leads = JSON.parse(localStorage.getItem('demo_leads_v1')||'[]');
      if(!leads.find(l=>l.email===email)) leads.push({ id:'l'+Date.now(), name, email, phone:'', source:'cash' });
      localStorage.setItem('demo_leads_v1', JSON.stringify(leads));
      UI.addActivity(`تم التسجيل نقدًا: ${name} - ${c.title}`); UI.closeModal(); UI.renderDashboard(); UI.renderCourses();
      return;
    }

    try{
      const resp = await fetch('/api/baridimob/create-payment',{
        method:'POST', headers:{ 'Content-Type':'application/json' },
        body: JSON.stringify({ courseId, name, email, amount: c.price })
      });
      const data = await resp.json(); if(!resp.ok) throw new Error(data.error||'خطأ من الخادم');
      const orderId = data.orderId || ('ORD-'+Date.now());
      const paymentUrl = data.payment_url || data.paymentUrl || '';
      const deeplink = data.deeplink || '';
      UI.openModal(`<div style="display:flex;justify-content:space-between;align-items:center"><strong>أكمل الدفع</strong><button class="btn-ghost" onclick="UI.closeModal()">إغلاق</button></div>
        <div style="margin-top:10px">رقم الطلب: <b>${orderId}</b><div style="margin-top:8px">${deeplink?`<a class="btn-primary" href="${deeplink}">فتح التطبيق</a>`:`<a class="btn-primary" href="${paymentUrl}" target="_blank">فتح صفحة الدفع</a>`} <button class="btn-ghost" onclick="Payments.poll('${orderId}')">تحقق الآن</button></div><div id="qr-holder" style="margin-top:8px">${paymentUrl?`<img src="https://chart.googleapis.com/chart?chs=220x220&cht=qr&chl=${encodeURIComponent(paymentUrl)}">`:''}</div></div>`);
      Payments._startPolling(orderId);
    }catch(e){
      console.error(e); alert('تعذر الاتصال بالخادم. سيتم المحاكاة محليًا.');
      const orderId = 'LORD-'+Date.now();
      const payments = JSON.parse(localStorage.getItem('demo_payments_v1')||'[]');
      payments.push({ id:orderId, courseId, name, email, amount:c.price, method:'sim', status:'pending', time:new Date().toISOString() });
      localStorage.setItem('demo_payments_v1', JSON.stringify(payments));
      UI.addActivity('تم إنشاء طلب محاكاة محلي'); UI.closeModal();
    }
  }

  let _interval = null;
  function _startPolling(orderId){ if(_interval) clearInterval(_interval); _interval = setInterval(()=>Payments.poll(orderId, true), 3000); }
  async function poll(orderId, silent){
    try{
      const resp = await fetch(`/api/payments/status?orderId=${encodeURIComponent(orderId)}`);
      if(!resp.ok){ if(!silent) alert('تعذر الحصول على الحالة'); return; }
      const j = await resp.json(); const status = j.status || 'unknown';
      if(status==='paid'){ if(_interval) clearInterval(_interval); UI.addActivity(`تأكيد الدفع: ${orderId}`); UI.closeModal(); UI.renderDashboard(); }
      else if(status==='failed'){ if(_interval) clearInterval(_interval); if(!silent) alert('فشل الدفع'); }
    }catch(e){ if(!silent) console.warn(e); }
  }

  return { openEnroll, pay, poll, _startPolling };
})();
window.Payments = Payments;
