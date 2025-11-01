/* app.js - UI and core features (CRM, courses, dashboard) */
const UI = (function(){
  const LS = {
    COURSES: 'demo_courses_v1',
    LEADS: 'demo_leads_v1',
    SESSIONS: 'demo_sessions_v1',
    PAYMENTS: 'demo_payments_v1',
    TESTS: 'demo_tests_v1',
    ACTIVITY: 'demo_activity_v1'
  };
  function load(k,f){ try{ const r = localStorage.getItem(k); return r?JSON.parse(r):f; }catch(e){return f;} }
  function save(k,v){ localStorage.setItem(k, JSON.stringify(v)); }

  function showTab(id){
    document.querySelectorAll('.tab').forEach(t=>t.hidden=true);
    const el = document.getElementById(id); if(el) el.hidden=false;
    document.querySelectorAll('.nav button').forEach(b=>b.classList.remove('active'));
    const btn = document.getElementById('tab-'+id); if(btn) btn.classList.add('active');
    if(id==='dashboard') renderDashboard();
    if(id==='courses') renderCourses();
    if(id==='classroom') renderSessions();
    if(id==='assessments') renderTests();
    if(id==='crm') CRM.renderLeads();
  }

  let usersChart, deviceChart;
  function renderDashboard(){
    const leads = load(LS.LEADS, []);
    const courses = load(LS.COURSES, []);
    const sessions = load(LS.SESSIONS, []);
    const payments = load(LS.PAYMENTS, []);
    document.getElementById('metric-students').innerText = leads.length;
    document.getElementById('metric-courses').innerText = courses.length;
    document.getElementById('metric-sessions').innerText = sessions.filter(s=> new Date(s.datetime) > new Date()).length;
    const rev = payments.reduce((s,p)=>s+(p.amount||0), 0);
    document.getElementById('metric-revenue').innerText = rev + ' USD';

    const activity = load(LS.ACTIVITY, []);
    const recent = document.getElementById('recent-activity'); recent.innerHTML='';
    activity.slice(-10).reverse().forEach(a=>{
      const li=document.createElement('li'); li.style.padding='8px 0'; li.style.borderBottom='1px dashed rgba(2,6,23,0.04)';
      li.innerHTML = `${a.text} <span style="float:left;color:#64748b">${new Date(a.time).toLocaleString()}</span>`;
      recent.appendChild(li);
    });

    const months=['مايو','يونيو','يوليو','أغسطس','سبتمبر','أكتوبر'];
    const users=[120,180,270,350,420, leads.length + 80];
    if(usersChart) usersChart.destroy();
    usersChart = new Chart(document.getElementById('chartUsers').getContext('2d'), { type:'line', data:{ labels:months, datasets:[{ data:users, borderColor:'#6a5af9', backgroundColor:'rgba(106,90,249,0.12)', fill:true, tension:0.35 }]}, options:{ responsive:true, maintainAspectRatio:false, plugins:{legend:{display:false}} } });

    const deviceData=[60,30,10];
    if(deviceChart) deviceChart.destroy();
    deviceChart = new Chart(document.getElementById('chartDevice').getContext('2d'), { type:'doughnut', data:{ labels:['دسكتوب','موبايل','تابلت'], datasets:[{ data:deviceData, backgroundColor:['#6a5af9','#8b5cf6','#c084fc'] }]}, options:{ responsive:true, maintainAspectRatio:false, plugins:{legend:{display:false}} } });

    document.getElementById('current-date').innerText = new Date().toLocaleDateString();
  }

  function renderCourses(){
    const list = document.getElementById('courses-list'); const courses = load(LS.COURSES, []);
    list.innerHTML = '';
    courses.forEach(c=>{ const div=document.createElement('div'); div.className='course-card';
      div.innerHTML = `<h4>${c.title}</h4><div style="color:#64748b">${c.description}</div>
        <div style="margin-top:8px;display:flex;gap:8px"><div style="font-weight:800">${c.price} USD</div>
        <div style="margin-left:auto"><button class="btn-primary" onclick="UI.openCourse('${c.id}')">عرض</button>
        <button class="btn-ghost" onclick="Payments.openEnroll('${c.id}')">اشترك</button></div></div>`;
      list.appendChild(div);
    });
  }

  function openCourse(id){
    const courses = load(LS.COURSES, []); const c = courses.find(x=>x.id===id); if(!c) return;
    openModal(`<div style="display:flex;justify-content:space-between;align-items:center"><strong>${c.title}</strong><button class="btn-ghost" onclick="UI.closeModal()">إغلاق</button></div><div style="margin-top:12px">${c.description}</div>`);
  }

  function openCreateCourse(){
    openModal(`<div style="display:flex;justify-content:space-between;align-items:center"><strong>إنشاء دورة</strong><button class="btn-ghost" onclick="UI.closeModal()">إغلاق</button></div>
      <div style="margin-top:12px"><label>العنوان</label><input id="new-course-title" /><label>السعر</label><input id="new-course-price" type="number" />
      <label>الوصف</label><textarea id="new-course-desc"></textarea><div style="margin-top:8px"><button class="btn-primary" onclick="UI.createCourse()">حفظ</button></div></div>`);
  }

  function createCourse(){
    const title=document.getElementById('new-course-title').value.trim();
    const price=parseFloat(document.getElementById('new-course-price').value)||0; const desc=document.getElementById('new-course-desc').value.trim();
    if(!title) return alert('عنوان مطلوب');
    const courses = load(LS.COURSES, []); courses.push({id:'c'+Date.now(), title, price, description:desc, video:''}); localStorage.setItem(LS.COURSES, JSON.stringify(courses)); addActivity(`انشاء دورة ${title}`); closeModal(); renderCourses();
  }

  function renderSessions(){
    const sessions = load(LS.SESSIONS, []); const tbody = document.querySelector('#sessions-table tbody'); tbody.innerHTML='';
    const courses = load(LS.COURSES, []);
    sessions.forEach(s=>{ const course=courses.find(c=>c.id===s.courseId); const tr=document.createElement('tr');
      tr.innerHTML=`<td>${s.title}</td><td>${new Date(s.datetime).toLocaleString()}</td><td>${course?course.title:''}</td><td><button class="btn-primary" onclick="window.open('${s.link}')">انضم</button></td>`;
      tbody.appendChild(tr);
    });
  }

  function openModal(html){ document.getElementById('modal-content').innerHTML = html; document.getElementById('modal').style.display='block'; }
  function closeModal(){ document.getElementById('modal').style.display='none'; }

  function addActivity(text){ const a=load(LS.ACTIVITY,[]); a.push({text,time:new Date().toISOString()}); localStorage.setItem(LS.ACTIVITY,JSON.stringify(a)); renderDashboard(); }

  return { showTab, renderDashboard, renderCourses, renderSessions, openCreateCourse, createCourse, openCourse, openModal, closeModal, addActivity };
})();

window.UI = UI;

/* CRM module */
const CRM = (function(){
  const KEY='demo_leads_v1';
  function load(){ try{ return JSON.parse(localStorage.getItem(KEY))||[] }catch{return []} }
  function save(v){ localStorage.setItem(KEY, JSON.stringify(v)); }
  function addLead(){
    const name=document.getElementById('crm-name').value.trim(); const email=document.getElementById('crm-email').value.trim();
    const phone=document.getElementById('crm-phone').value.trim(); const source=document.getElementById('crm-source').value;
    if(!name||!email) return alert('الاسم والإيميل مطلوبان');
    const leads=load(); leads.push({id:'l'+Date.now(), name,email,phone,source}); save(leads); renderLeads(); UI.addActivity(`إضافة متدرب ${name}`); document.getElementById('crm-name').value=''; document.getElementById('crm-email').value=''; document.getElementById('crm-phone').value='';
  }
  function renderLeads(){ const container=document.getElementById('leads-table'); container.innerHTML=''; const leads=load(); leads.forEach(l=>{ const tr=document.createElement('tr'); tr.innerHTML=`<td>${l.name}</td><td>${l.email}</td><td>${l.phone}</td><td>${l.source}</td><td><button class="btn-ghost" onclick="CRM.deleteLead('${l.id}')">حذف</button></td>`; container.appendChild(tr); }); document.getElementById('metric-students').innerText = load().length; }
  function deleteLead(id){ if(!confirm('حذف؟')) return; const leads=load().filter(l=>l.id!==id); save(leads); renderLeads(); }
  function exportCSV(){ const leads=load(); if(leads.length===0) return alert('لا يوجد'); const header='name,email,phone,source\n'; const rows=leads.map(l=>`"${l.name.replace(/"/g,'""')}","${l.email}","${l.phone}","${l.source}"`).join('\n'); const blob=new Blob([header+rows],{type:'text/csv'}); const a=document.createElement('a'); a.href=URL.createObjectURL(blob); a.download='leads.csv'; a.click(); }
  return { addLead, renderLeads, deleteLead, exportCSV };
})();
window.CRM = CRM;

document.addEventListener('DOMContentLoaded', ()=>{ UI.showTab('dashboard'); UI.renderDashboard(); UI.renderCourses(); UI.renderSessions(); CRM.renderLeads(); });
