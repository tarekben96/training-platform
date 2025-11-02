/* public/js/app.js
   UI core for the training platform:
   - Dashboard (charts, metrics)
   - Courses CRUD + view
   - Sessions (schedule) CRUD
   - Tests (create, take) with Proctor integration
   - CRM (leads) CRUD + CSV export
   Exposes global APP object.
*/

(function () {
  const LS_KEYS = {
    COURSES: 'demo_courses_v1',
    LEADS: 'demo_leads_v1',
    SESSIONS: 'demo_sessions_v1',
    PAYMENTS: 'demo_payments_v1',
    TESTS: 'demo_tests_v1',
    ACTIVITY: 'demo_activity_v1'
  };

  // --- helpers ---
  function el(id) { return document.getElementById(id); }
  function q(sel) { return document.querySelector(sel); }
  function qAll(sel) { return document.querySelectorAll(sel); }

  function load(key, fallback) {
    try { const raw = localStorage.getItem(key); return raw ? JSON.parse(raw) : fallback; }
    catch (e) { return fallback; }
  }
  function save(key, value) {
    localStorage.setItem(key, JSON.stringify(value));
  }

  // --- seed demo data (only if empty) ---
  (function seed() {
    if (!load(LS_KEYS.COURSES)) {
      save(LS_KEYS.COURSES, [
        { id: 'c1', title: 'أساسيات إدارة المشاريع', price: 149, description: 'دورة عملية شاملة', lessons: ['مقدمة', 'تخطيط', 'تنفيذ'], video: 'https://www.w3schools.com/html/mov_bbb.mp4' },
        { id: 'c2', title: 'تصميم واجهات المستخدم (UI/UX)', price: 199, description: 'مبادئ عملية لتصميم الواجهات', lessons: ['مبادئ', 'أدوات'], video: 'https://www.w3schools.com/html/movie.mp4' }
      ]);
    }
    if (!load(LS_KEYS.LEADS)) save(LS_KEYS.LEADS, []);
    if (!load(LS_KEYS.SESSIONS)) save(LS_KEYS.SESSIONS, []);
    if (!load(LS_KEYS.TESTS)) save(LS_KEYS.TESTS, []);
    if (!load(LS_KEYS.ACTIVITY)) save(LS_KEYS.ACTIVITY, [{ text: 'تهيئة النظام', time: new Date().toISOString() }]);
  })();

  // --- Modal helpers ---
  function openModal(html) {
    const modal = el('modal');
    el('modal-content').innerHTML = html;
    modal.style.display = 'flex';
  }
  function closeModal() {
    const modal = el('modal');
    modal.style.display = 'none';
  }

  // --- Activity log ---
  function addActivity(text) {
    const arr = load(LS_KEYS.ACTIVITY, []);
    arr.push({ text, time: new Date().toISOString() });
    save(LS_KEYS.ACTIVITY, arr);
    renderDashboard(); // refresh dashboard activity
  }

  // --- Dashboard & charts ---
  let usersChart = null, deviceChart = null;
  function renderDashboard() {
    const leads = load(LS_KEYS.LEADS, []);
    const courses = load(LS_KEYS.COURSES, []);
    const sessions = load(LS_KEYS.SESSIONS, []);
    const payments = load(LS_KEYS.PAYMENTS, []);

    el('metric-students').innerText = leads.length;
    el('metric-courses').innerText = courses.length;
    el('metric-sessions').innerText = sessions.filter(s => new Date(s.datetime) > new Date()).length;
    const rev = (payments || []).reduce((s, p) => s + (p.amount || 0), 0);
    el('metric-revenue').innerText = rev + ' USD';

    const act = load(LS_KEYS.ACTIVITY, []);
    const recent = el('recent-activity'); recent.innerHTML = '';
    act.slice(-10).reverse().forEach(a => {
      const li = document.createElement('li');
      li.style.listStyle = 'none';
      li.style.padding = '8px 0';
      li.style.borderBottom = '1px dashed rgba(2,6,23,0.04)';
      li.innerHTML = `<div style="display:flex;justify-content:space-between">${a.text} <span style="color:#64748b;font-weight:700">${new Date(a.time).toLocaleString()}</span></div>`;
      recent.appendChild(li);
    });

    const months = ['مايو', 'يونيو', 'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر'];
    const users = [120, 180, 270, 350, 420, leads.length + 80];

    try {
      if (usersChart) usersChart.destroy();
      usersChart = new Chart(el('chartUsers').getContext('2d'), {
        type: 'line',
        data: { labels: months, datasets: [{ data: users, borderColor: '#6a5af9', backgroundColor: 'rgba(106,90,249,0.12)', fill: true, tension: 0.35 }] },
        options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } } }
      });

      const deviceData = [60, 30, 10];
      el('device-desktop').innerText = deviceData[0] + '%';
      el('device-mobile').innerText = deviceData[1] + '%';
      el('device-tablet').innerText = deviceData[2] + '%';

      if (deviceChart) deviceChart.destroy();
      deviceChart = new Chart(el('chartDevice').getContext('2d'), {
        type: 'doughnut',
        data: { labels: ['دسكتوب', 'موبايل', 'تابلت'], datasets: [{ data: deviceData, backgroundColor: ['#6a5af9', '#8b5cf6', '#c084fc'] }] },
        options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } } }
      });
    } catch (e) {
      console.warn('Chart render error', e);
    }

    el('current-date').innerText = new Date().toLocaleDateString();
  }

  // --- Courses ---
  function renderCourses() {
    const list = el('courses-list');
    const courses = load(LS_KEYS.COURSES, []);
    list.innerHTML = '';
    courses.forEach(c => {
      const div = document.createElement('div');
      div.className = 'course-card';
      div.innerHTML = `<div style="display:flex;justify-content:space-between;align-items:center">
        <h4 style="margin:0">${c.title}</h4>
        <div style="font-weight:800">${c.price} USD</div>
      </div>
      <div style="color:#64748b;font-size:14px">${c.description}</div>
      <div style="display:flex;gap:8px;margin-top:10px">
        <button class="btn-primary" onclick="APP.openCourse('${c.id}')">عرض الدورة</button>
        <button class="btn-ghost" onclick="Payments.openEnroll('${c.id}')">اشترك</button>
      </div>`;
      list.appendChild(div);
    });
    el('metric-courses').innerText = courses.length;
  }

  function openCreateCourse() {
    openModal(`<div style="display:flex;justify-content:space-between;align-items:center"><strong>إنشاء دورة جديدة</strong><button class="btn-ghost" onclick="APP.closeModal()">إغلاق</button></div>
      <div style="margin-top:12px">
        <label>عنوان الدورة</label><input id="new-course-title" placeholder="مثال: دورة جديدة" />
        <label style="margin-top:8px">السعر (USD)</label><input id="new-course-price" type="number" placeholder="99" />
        <label style="margin-top:8px">وصف مختصر</label><textarea id="new-course-desc" rows="3"></textarea>
        <div style="margin-top:12px;display:flex;gap:8px">
          <button class="btn-primary" onclick="APP.createCourse()">حفظ</button>
          <button class="btn-ghost" onclick="APP.closeModal()">إلغاء</button>
        </div>
      </div>`);
  }

  function createCourse() {
    const title = document.getElementById('new-course-title').value.trim();
    const price = parseFloat(document.getElementById('new-course-price').value) || 0;
    const desc = document.getElementById('new-course-desc').value.trim();
    if (!title) return alert('المرجو إدخال عنوان');
    const courses = load(LS_KEYS.COURSES, []);
    const id = 'c' + Date.now();
    courses.push({ id, title, price, description: desc, lessons: [], video: '' });
    save(LS_KEYS.COURSES, courses);
    closeModal();
    addActivity(`تم إنشاء دورة ${title}`);
    renderCourses();
  }

  function openCourse(id) {
    const courses = load(LS_KEYS.COURSES, []);
    const c = courses.find(x => x.id === id);
    if (!c) return alert('دورة غير موجودة');
    openModal(`<div style="display:flex;justify-content:space-between;align-items:center"><div><strong>${c.title}</strong><div class="subtle">${c.description}</div></div><div><button class="btn-ghost" onclick="APP.closeModal()">إغلاق</button></div></div>
      <div style="display:flex;gap:12px;margin-top:12px;flex-wrap:wrap">
        <div style="flex:1;min-width:300px">
          <video controls style="width:100%;height:240px"><source src="${c.video}" type="video/mp4"></video>
        </div>
        <div style="min-width:260px">
          <div class="card"><strong>محتوى الدورة</strong>
            <ul style="margin:8px 0;padding:0 6px">${(c.lessons || []).map(l => `<li style="list-style:none;padding:6px 0;border-bottom:1px dashed rgba(2,6,23,0.04)">${l}</li>`).join('')}</ul>
            <div style="margin-top:8px"><button class="btn-primary" onclick="APP.startCourse('${c.id}')">بدء التعلم</button></div>
          </div>
        </div>
      </div>`);
  }

  function startCourse(id) {
    closeModal();
    addActivity(`بدأت دورة ${id}`);
    alert('تم فتح المحتوى — في نظام حقيقي سيُتحقق أولًا من حالة التسجيل.');
  }

  // --- Sessions (Classroom) ---
  function openScheduleSession() {
    const courses = load(LS_KEYS.COURSES, []);
    openModal(`<div style="display:flex;justify-content:space-between;align-items:center"><strong>جدولة جلسة</strong><button class="btn-ghost" onclick="APP.closeModal()">إغلاق</button></div>
      <div style="margin-top:12px">
        <label>موضوع الجلسة</label><input id="sess-title" />
        <label style="margin-top:8px">اختر الدورة</label>
        <select id="sess-course">${courses.map(c => `<option value="${c.id}">${c.title}</option>`).join('')}</select>
        <label style="margin-top:8px">التاريخ والوقت</label><input id="sess-datetime" type="datetime-local" />
        <div style="margin-top:12px;display:flex;gap:8px"><button class="btn-primary" onclick="APP.createSession()">حفظ</button><button class="btn-ghost" onclick="APP.closeModal()">إلغاء</button></div>
      </div>`);
  }

  function createSession() {
    const title = document.getElementById('sess-title').value.trim();
    const courseId = document.getElementById('sess-course').value;
    const datetime = document.getElementById('sess-datetime').value;
    if (!title || !datetime) return alert('اكمل الحقول');
    const sessions = load(LS_KEYS.SESSIONS, []);
    sessions.push({ id: 's' + Date.now(), title, courseId, datetime, link: `https://meet.example.com/session/${Date.now()}` });
    save(LS_KEYS.SESSIONS, sessions);
    addActivity(`تم جدولة جلسة "${title}"`);
    closeModal();
    renderSessions();
  }

  function renderSessions() {
    const sessions = load(LS_KEYS.SESSIONS, []);
    const tbody = document.querySelector('#sessions-table tbody');
    tbody.innerHTML = '';
    const courses = load(LS_KEYS.COURSES, []);
    sessions.forEach(s => {
      const course = courses.find(c => c.id === s.courseId);
      const tr = document.createElement('tr');
      tr.innerHTML = `<td>${s.title}</td><td>${new Date(s.datetime).toLocaleString()}</td><td>${course ? course.title : ''}</td><td><button class="btn-primary" onclick="window.open('${s.link}')">انضم</button></td>`;
      tbody.appendChild(tr);
    });
  }

  // --- Tests (create / take / proctor) ---
  function openCreateTest() {
    const courses = load(LS_KEYS.COURSES, []);
    openModal(`<div style="display:flex;justify-content:space-between;align-items:center"><strong>إنشاء اختبار</strong><button class="btn-ghost" onclick="APP.closeModal()">إغلاق</button></div>
      <div style="margin-top:12px">
        <label>عنوان الاختبار</label><input id="test-title" />
        <label style="margin-top:8px">اختر الدورة</label>
        <select id="test-course">${courses.map(c => `<option value="${c.id}">${c.title}</option>`).join('')}</select>
        <label style="margin-top:8px">السؤال</label><input id="test-q" />
        <label style="margin-top:8px">الخيارات (مفصولة بـ ; )</label><input id="test-options" />
        <label style="margin-top:8px">الجواب الصحيح (نص)</label><input id="test-answer" />
        <label style="margin-top:8px"><input type="checkbox" id="test-proctor" /> تفعيل كشف الغش (كاميرا)</label>
        <div style="margin-top:12px;display:flex;gap:8px"><button class="btn-primary" onclick="APP.createTest()">حفظ</button><button class="btn-ghost" onclick="APP.closeModal()">إلغاء</button></div>
      </div>`);
  }

  function createTest() {
    const title = document.getElementById('test-title').value.trim();
    const courseId = document.getElementById('test-course').value;
    const q = document.getElementById('test-q').value.trim();
    const opts = document.getElementById('test-options').value.split(';').map(s => s.trim()).filter(Boolean);
    const ans = document.getElementById('test-answer').value.trim();
    const proctor = !!document.getElementById('test-proctor').checked;
    if (!title || !q || opts.length < 2 || !ans) return alert('اكمل الحقول بشكل صحيح');
    const tests = load(LS_KEYS.TESTS, []);
    tests.push({ id: 't' + Date.now(), title, courseId, question: q, options: opts, answer: ans, proctor });
    save(LS_KEYS.TESTS, tests);
    addActivity(`أنشأ اختبار ${title}`);
    closeModal();
    renderTests();
  }

  function renderTests() {
    const tests = load(LS_KEYS.TESTS, []);
    const container = el('tests-list');
    container.innerHTML = '';
    if (!tests.length) { container.innerHTML = '<div class="note">لا توجد اختبارات حتى الآن.</div>'; return; }
    tests.forEach(t => {
      const courses = load(LS_KEYS.COURSES, []);
      const course = courses.find(c => c.id === t.courseId);
      const div = document.createElement('div'); div.className = 'card'; div.style.marginTop = '8px';
      div.innerHTML = `<div style="display:flex;justify-content:space-between;align-items:center">
        <div><strong>${t.title}</strong><div class="subtle">${course ? course.title : ''}${t.proctor ? ' • مراقبة' : ''}</div></div>
        <div style="display:flex;gap:6px">
          <button class="btn-primary" onclick="APP.takeTest('${t.id}')">أداء الاختبار</button>
          <button class="btn-ghost" onclick="APP.deleteTest('${t.id}')">حذف</button>
        </div>
      </div>`;
      container.appendChild(div);
    });
  }

  function deleteTest(id) { if (!confirm('حذف الاختبار؟')) return; const tests = load(LS_KEYS.TESTS).filter(t => t.id !== id); save(LS_KEYS.TESTS, tests); renderTests(); addActivity('حذف اختبار'); }

  async function takeTest(testId) {
    const tests = load(LS_KEYS.TESTS, []);
    const t = tests.find(x => x.id === testId); if (!t) return alert('اختبار غير موجود');
    // modal
    openModal(`<div style="display:flex;justify-content:space-between;align-items:center"><strong>أداء: ${t.title}</strong><button class="btn-ghost" onclick="APP.closeModal(); Proctor.stop && Proctor.stop()">إغلاق</button></div>
      <div style="margin-top:12px">
        <div style="font-weight:800">${t.question}</div>
        <div id="proctor-area" style="margin-top:8px"></div>
        <div id="test-options-area" style="margin-top:8px;display:flex;flex-direction:column;gap:8px"></div>
        <div style="margin-top:12px"><button class="btn-primary" onclick="APP.submitTest('${t.id}')">تسليم</button></div>
        <div id="test-result" style="margin-top:10px"></div>
      </div>`);

    const area = el('test-options-area');
    area.innerHTML = '';
    t.options.forEach(opt => {
      const btn = document.createElement('button'); btn.className = 'btn-ghost'; btn.innerText = opt;
      btn.onclick = () => { qAll('#test-options-area .btn-ghost').forEach(b => b.style.background = ''); btn.style.background = '#eef2ff'; btn.dataset.selected = opt; };
      area.appendChild(btn);
    });

    if (t.proctor && window.Proctor && typeof Proctor.start === 'function') {
      try { await Proctor.start(t.id); } catch (e) { console.warn('Proctor start failed', e); }
    }
  }

  async function submitTest(testId) {
    const t = (load(LS_KEYS.TESTS) || []).find(x => x.id === testId);
    if (!t) return;
    const selected = q('#test-options-area .btn-ghost[style*="background"]');
    const resultArea = el('test-result');
    if (!selected) { alert('اختر إجابة'); return; }
    const ans = selected.innerText;
    if (ans === t.answer) {
      resultArea.innerHTML = '<div style="color:#065f46;font-weight:800">إجابة صحيحة — تم النجاح!</div>';
      addActivity(`نجح في اختبار ${t.title}`);
    } else {
      resultArea.innerHTML = '<div style="color:#991b1b;font-weight:800">إجابة خاطئة — لم يتم النجاح.</div>';
      addActivity(`راسب في اختبار ${t.title}`);
    }
    // stop proctor and upload if available
    if (t.proctor && window.Proctor) {
      try { await Proctor.stopAndUpload(); } catch (e) { console.warn('Proctor stop/upload failed', e); }
    }
  }

  // --- CRM ---
  function addLead() {
    const name = el('crm-name').value.trim();
    const email = el('crm-email').value.trim();
    const phone = el('crm-phone').value.trim();
    const source = el('crm-source').value;
    if (!name || !email) return alert('الاسم والإيميل مطلوبان');
    const leads = load(LS_KEYS.LEADS, []);
    leads.push({ id: 'l' + Date.now(), name, email, phone, source });
    save(LS_KEYS.LEADS, leads);
    renderLeads();
    addActivity(`إضافة متدرب ${name}`);
    el('crm-name').value = ''; el('crm-email').value = ''; el('crm-phone').value = '';
  }

  function renderLeads() {
    const leads = load(LS_KEYS.LEADS, []);
    const tbody = el('leads-table'); tbody.innerHTML = '';
    leads.forEach(l => {
      const tr = document.createElement('tr');
      tr.innerHTML = `<td>${l.name}</td><td>${l.email}</td><td>${l.phone}</td><td>${l.source}</td><td style="white-space:nowrap"><button class="btn-ghost" onclick="APP.deleteLead('${l.id}')">حذف</button></td>`;
      tbody.appendChild(tr);
    });
    el('metric-students').innerText = leads.length;
  }

  function deleteLead(id) {
    if (!confirm('حذف المتدرب؟')) return;
    const leads = load(LS_KEYS.LEADS).filter(l => l.id !== id);
    save(LS_KEYS.LEADS, leads);
    renderLeads();
    addActivity('حذف متدرب');
  }

  function exportLeadsCSV() {
    const leads = load(LS_KEYS.LEADS, []);
    if (!leads.length) return alert('لا يوجد');
    const header = 'name,email,phone,source\n';
    const rows = leads.map(l => `"${(l.name || '').replace(/"/g, '""')}","${l.email}","${l.phone}","${l.source}"`).join('\n');
    const blob = new Blob([header + rows], { type: 'text/csv' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'leads.csv'; a.click();
  }

  // --- expose APP ---
  const APP = {
    // init + rendering
    init: function () { renderDashboard(); renderCourses(); renderSessions(); renderTests(); renderLeads(); },
    renderDashboard: renderDashboard,
    renderCourses: renderCourses,
    renderSessions: renderSessions,
    renderTests: renderTests,
    renderLeads: renderLeads,

    // courses
    openCreateCourse: openCreateCourse,
    createCourse: createCourse,
    openCourse: openCourse,
    startCourse: startCourse,

    // sessions
    openScheduleSession: openScheduleSession,
    createSession: createSession,

    // tests
    openCreateTest: openCreateTest,
    createTest: createTest,
    takeTest: takeTest,
    submitTest: submitTest,
    deleteTest: deleteTest,

    // crm
    addLead: addLead,
    deleteLead: deleteLead,
    exportLeadsCSV: exportLeadsCSV,

    // modal helpers
    openModal: openModal,
    closeModal: closeModal,

    // utility
    addActivity: addActivity
  };

  window.APP = APP;

  // --- initialize on DOM ready ---
  document.addEventListener('DOMContentLoaded', function () {
    try { APP.init(); }
    catch (e) { console.error('APP init error', e); }
  });

})(); // end app.js
