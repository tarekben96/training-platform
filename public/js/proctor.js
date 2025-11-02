/* public/js/proctor.js
   Client-side Proctoring module (capture + events + upload)
   - Exposes global `Proctor` object with methods:
     start(testId), stop(), stopAndUpload(), listLocal(), getLocal(id)
   - Saves fallback local reports under key: 'proctor_reports_v1'
   - Uploads to POST /api/proctor/upload as { report: <reportObject> }
*/

(function () {
  const LOCAL_KEY = 'proctor_reports_v1';

  // internal state for current monitoring session
  let _state = null;

  // default options
  const DEFAULTS = {
    maxScreenshots: 8,
    intervalMs: 10000, // كل 10s
    screenshotQuality: 0.6, // جودة JPEG
    videoWidth: 320,
    videoHeight: 240,
    uploadEndpoint: '/api/proctor/upload'
  };

  // helper: safe JSON parse
  function safeParse(json) {
    try { return JSON.parse(json); } catch (e) { return null; }
  }

  // helper: push to local storage array
  function pushLocal(report) {
    try {
      const arr = JSON.parse(localStorage.getItem(LOCAL_KEY) || '[]');
      arr.push(report);
      localStorage.setItem(LOCAL_KEY, JSON.stringify(arr, null, 2));
    } catch (e) {
      console.warn('Proctor pushLocal failed', e);
    }
  }

  // helper: create minimal report metadata
  function _createReportSkeleton(testId) {
    return {
      id: 'r' + Date.now(),
      testId: testId || null,
      startTime: new Date().toISOString(),
      endTime: null,
      events: [],
      screenshots: []
      // note: screenshots are objects { t: <iso>, img: <dataURL> }
    };
  }

  // register an event inside the current state
  function _log(type, details) {
    if (!_state) return;
    _state.report.events.push({ t: new Date().toISOString(), type, details: details || {} });
  }

  // Start monitoring for a given testId
  async function start(testId, opts = {}) {
    if (_state) {
      console.warn('Proctor already running, will stop previous session first.');
      stop();
    }
    const conf = Object.assign({}, DEFAULTS, opts);

    _state = {
      report: _createReportSkeleton(testId),
      opts: conf,
      intervalId: null,
      stream: null,
      videoEl: null,
      handlers: []
    };

    _log('proctor_start', {});

    // Try to get camera
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { width: conf.videoWidth, height: conf.videoHeight }, audio: false });
      _state.stream = stream;

      // create video element (not appended to body by default; will append to #proctor-area if exists)
      const video = document.createElement('video');
      video.autoplay = true;
      video.muted = true;
      video.playsInline = true;
      video.srcObject = stream;
      video.width = conf.videoWidth / 2; // small preview
      video.height = conf.videoHeight / 2;
      video.style.objectFit = 'cover';
      video.style.borderRadius = '6px';
      video.style.boxShadow = '0 6px 20px rgba(2,6,23,0.08)';
      _state.videoEl = video;

      // append to proctor-area if present
      const area = document.getElementById('proctor-area');
      if (area) area.appendChild(video);

      // canvas for screenshots
      const canvas = document.createElement('canvas');
      canvas.width = conf.videoWidth;
      canvas.height = conf.videoHeight;
      const ctx = canvas.getContext('2d');

      // start interval for screenshots
      _state.intervalId = setInterval(() => {
        try {
          ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
          const dataUrl = canvas.toDataURL('image/jpeg', conf.screenshotQuality);
          // keep limited number
          if (_state.report.screenshots.length >= conf.maxScreenshots) _state.report.screenshots.shift();
          _state.report.screenshots.push({ t: new Date().toISOString(), img: dataUrl });
          _log('screenshot', { count: _state.report.screenshots.length });
        } catch (err) {
          console.warn('Proctor: screenshot failed', err);
          _log('screenshot_error', { message: err && err.message });
        }
      }, conf.intervalMs);

    } catch (err) {
      console.warn('Proctor: camera denied or error', err);
      _log('camera_denied', { message: err && err.message });
      // continue without video: still register events
    }

    // Register browser events
    const handlers = [];

    const onVisibility = () => _log('visibility', { state: document.visibilityState });
    document.addEventListener('visibilitychange', onVisibility);
    handlers.push({ el: document, type: 'visibilitychange', fn: onVisibility });

    const onBlur = () => _log('blur', {});
    const onFocus = () => _log('focus', {});
    window.addEventListener('blur', onBlur);
    window.addEventListener('focus', onFocus);
    handlers.push({ el: window, type: 'blur', fn: onBlur });
    handlers.push({ el: window, type: 'focus', fn: onFocus });

    const onCopy = () => _log('copy', {});
    const onPaste = () => _log('paste', {});
    const onCtx = () => _log('contextmenu', {});
    document.addEventListener('copy', onCopy);
    document.addEventListener('paste', onPaste);
    document.addEventListener('contextmenu', onCtx);
    handlers.push({ el: document, type: 'copy', fn: onCopy });
    handlers.push({ el: document, type: 'paste', fn: onPaste });
    handlers.push({ el: document, type: 'contextmenu', fn: onCtx });

    _state.handlers = handlers;

    // mark ready
    _log('proctor_ready', {});
    return _state.report;
  }

  // stop monitoring and return the report object (without uploading)
  function stop() {
    if (!_state) return null;

    // remove event listeners
    try {
      _state.handlers.forEach(h => {
        try { h.el.removeEventListener(h.type, h.fn); } catch (e) { /* ignore */ }
      });
    } catch (e) { /* ignore */ }

    // stop interval
    if (_state.intervalId) {
      clearInterval(_state.intervalId);
      _state.intervalId = null;
    }

    // stop camera tracks
    try {
      if (_state.stream && _state.stream.getTracks) {
        _state.stream.getTracks().forEach(t => {
          try { t.stop(); } catch (e) { /* ignore */ }
        });
      }
    } catch (e) { /* ignore */ }

    // remove video element from DOM if we appended it
    try {
      if (_state.videoEl && _state.videoEl.parentNode) _state.videoEl.parentNode.removeChild(_state.videoEl);
    } catch (e) { /* ignore */ }

    // finalize report
    _state.report.endTime = new Date().toISOString();
    _log('proctor_stop', {});
    const rep = _state.report;
    _state = null;
    return rep;
  }

  // stop and upload report to server. returns server response if success, else null.
  async function stopAndUpload() {
    const rep = stop();
    if (!rep) return null;

    // try upload
    try {
      const resp = await fetch(DEFAULTS.uploadEndpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ report: rep })
      });
      if (!resp.ok) {
        const txt = await resp.text();
        throw new Error('Upload failed: ' + resp.status + ' - ' + txt);
      }
      const json = await resp.json();
      // store server reference in local log
      if (json && json.id) {
        // optional: mark as uploaded
        rep._uploadedTo = json.id;
        addLocalMetadata(rep, { uploaded: true, serverId: json.id });
      }
      return json;
    } catch (err) {
      console.warn('Proctor upload failed, saving locally', err);
      // save locally as fallback
      try { pushLocal(rep); } catch (e) { console.error('Proctor local save failed', e); }
      return null;
    }
  }

  // helper to add metadata to local stored report file (if needed)
  function addLocalMetadata(rep, meta) {
    try {
      const arr = JSON.parse(localStorage.getItem(LOCAL_KEY) || '[]');
      const idx = arr.findIndex(r => r.id === rep.id);
      if (idx === -1) { arr.push(Object.assign({}, rep, { meta })); }
      else { arr[idx] = Object.assign({}, arr[idx], { meta: Object.assign({}, arr[idx].meta || {}, meta) }); }
      localStorage.setItem(LOCAL_KEY, JSON.stringify(arr, null, 2));
    } catch (e) { console.warn('addLocalMetadata failed', e); }
  }

  // list local stored reports
  function listLocal() {
    try {
      return JSON.parse(localStorage.getItem(LOCAL_KEY) || '[]');
    } catch (e) {
      return [];
    }
  }

  // get single local report by id
  function getLocal(id) {
    try {
      const arr = JSON.parse(localStorage.getItem(LOCAL_KEY) || '[]');
      return arr.find(r => r.id === id) || null;
    } catch (e) {
      return null;
    }
  }

  // expose API
  const Proctor = {
    start: start,
    stop: stop,
    stopAndUpload: stopAndUpload,
    listLocal: listLocal,
    getLocal: getLocal
  };

  // global export
  window.Proctor = Proctor;
})();
