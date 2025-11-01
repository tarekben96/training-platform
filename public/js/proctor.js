/* proctor.js - client-side proctoring + automatic upload to server */
const Proctor = (function(){
  const STORAGE = 'proctor_reports_v1';
  let state = null;

  async function start(testId){
    if(state) stop();
    state = { id: 'r'+Date.now(), testId, startTime: new Date().toISOString(), events:[], screenshots:[] , maxScreenshots:10, intervalMs:10000, intervalId:null, stream:null, handlers:[] };
    log('proctor_start', {});
    try{
      const stream = await navigator.mediaDevices.getUserMedia({ video:{ width:320, height:240 }, audio:false });
      state.stream = stream;
      const video = document.createElement('video'); video.autoplay=true; video.muted=true; video.playsInline=true; video.srcObject = stream;
      video.style.width='160px'; video.style.height='120px';
      const area = document.getElementById('proctor-area'); if(area) area.appendChild(video);
      const canvas = document.createElement('canvas'); canvas.width=320; canvas.height=240;
      state.intervalId = setInterval(()=>{
        try{
          const ctx = canvas.getContext('2d'); ctx.drawImage(video,0,0,canvas.width,canvas.height);
          const img = canvas.toDataURL('image/jpeg',0.6);
          state.screenshots.push({ t: new Date().toISOString(), img });
          if(state.screenshots.length > state.maxScreenshots) state.screenshots.shift();
          log('screenshot',{count:state.screenshots.length});
        }catch(e){ console.warn(e); }
      }, state.intervalMs);
    }catch(err){
      log('camera_denied',{message:err.message});
    }

    const visibilityHandler = ()=> log('visibility',{state:document.visibilityState});
    const blurHandler = ()=> log('blur',{});
    const focusHandler = ()=> log('focus',{});
    const copyHandler = ()=> log('copy',{});
    const pasteHandler = ()=> log('paste',{});
    const ctxHandler = ()=> log('contextmenu',{});
    document.addEventListener('visibilitychange', visibilityHandler);
    window.addEventListener('blur', blurHandler);
    window.addEventListener('focus', focusHandler);
    document.addEventListener('copy', copyHandler);
    document.addEventListener('paste', pasteHandler);
    document.addEventListener('contextmenu', ctxHandler);
    state.handlers = [
      {el:document,type:'visibilitychange',fn:visibilityHandler},
      {el:window,type:'blur',fn:blurHandler},
      {el:window,type:'focus',fn:focusHandler},
      {el:document,type:'copy',fn:copyHandler},
      {el:document,type:'paste',fn:pasteHandler},
      {el:document,type:'contextmenu',fn:ctxHandler}
    ];
  }

  function log(type, details){ if(!state) return; state.events.push({ t:new Date().toISOString(), type, details }); }

  async function stopAndUpload(){
    const rep = stop();
    if(!rep) return null;
    try{
      const r = await fetch('/api/proctor/upload',{ method:'POST', headers:{ 'Content-Type':'application/json' }, body: JSON.stringify({ report: rep }) });
      if(!r.ok) throw new Error('upload failed');
      const json = await r.json();
      UI.addActivity(`تقرير مراقبة مرفوع: ${json.id}`);
      return json;
    }catch(e){
      console.warn('proctor upload failed', e);
      const store = JSON.parse(localStorage.getItem(STORAGE)||'[]'); store.push(rep); localStorage.setItem(STORAGE, JSON.stringify(store,null,2));
      UI.addActivity('تقرير مراقبة محفوظ محليًا');
      return null;
    }
  }

  function stop(){
    if(!state) return null;
    state.endTime = new Date().toISOString();
    state.handlers?.forEach(h => h.el.removeEventListener(h.type, h.fn));
    if(state.intervalId) clearInterval(state.intervalId);
    try{ state.stream?.getTracks?.forEach(t=>t.stop()); }catch(e){}
    const final = state;
    state = null;
    return final;
  }

  function listReports(){ return JSON.parse(localStorage.getItem(STORAGE)||'[]'); }
  function getReport(id){ return listReports().find(r=>r.id === id); }

  return { start, stop, stopAndUpload, listReports, getReport };
})();
window.Proctor = Proctor;
