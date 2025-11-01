/* server.js - Express mediator */
require('dotenv').config();
const express = require('express');
const axios = require('axios');
const bodyParser = require('body-parser');
const path = require('path');
const fs = require('fs');
const mkdirp = require('mkdirp');
const crypto = require('crypto');

const app = express();
app.use(bodyParser.json({ limit:'20mb' }));
app.use(bodyParser.urlencoded({ extended:true }));
app.use(require('cors')());

// serve public
app.use('/', express.static(path.join(__dirname, '..', 'public')));

// in-memory stores
const payments = {};
const proctorStoreDir = path.join(__dirname, 'data', 'proctor');
mkdirp.sync(proctorStoreDir);

// ECCP helpers (placeholder)
async function getECCPToken(){
  if(!process.env.ECCP_CLIENT_ID || !process.env.ECCP_CLIENT_SECRET || !process.env.ECCP_TOKEN_URL){
    throw new Error('ECCP credentials not configured');
  }
  const resp = await axios.post(process.env.ECCP_TOKEN_URL,{
    client_id: process.env.ECCP_CLIENT_ID,
    client_secret: process.env.ECCP_CLIENT_SECRET,
    grant_type: 'client_credentials'
  },{ headers:{ 'Content-Type':'application/json' }});
  return resp.data.access_token || resp.data.token;
}

async function createECCPPayment(payload){
  if(!process.env.ECCP_CREATE_ENDPOINT) throw new Error('ECCP_CREATE_ENDPOINT not configured');
  const token = await getECCPToken();
  const resp = await axios.post(process.env.ECCP_CREATE_ENDPOINT, payload, { headers:{ Authorization:`Bearer ${token}`, 'Content-Type':'application/json' }});
  return resp.data;
}

// create payment
app.post('/api/baridimob/create-payment', async (req,res)=>{
  try{
    const { courseId, name, email, amount } = req.body;
    if(!courseId||!name||!email||!amount) return res.status(400).json({ error:'missing' });
    const orderId = 'ORD-'+Date.now();
    payments[orderId] = { orderId, courseId, name, email, amount, status:'pending', createdAt: new Date().toISOString() };

    if(process.env.ECCP_CREATE_ENDPOINT && process.env.ECCP_CLIENT_ID){
      try{
        const payload = {
          merchant_id: process.env.ECCP_MERCHANT_ID || 'demo',
          order_id: orderId,
          amount,
          currency: 'DZD',
          customer: { name, email },
          callback_url: `${process.env.PUBLIC_BASE}/api/baridimob/webhook`,
          return_url: `${process.env.PUBLIC_BASE}/baridimob/return?order_id=${orderId}`
        };
        const r = await createECCPPayment(payload);
        return res.json({ orderId, payment_url: r.payment_url || r.url || null, deeplink: r.deeplink || null, raw: r });
      }catch(e){
        console.warn('ECCP create failed:', e.message);
      }
    }

    // fallback simulate
    const fakeUrl = `${process.env.PUBLIC_BASE}/simulate-pay?order_id=${orderId}`;
    res.json({ orderId, payment_url: fakeUrl });
  }catch(err){
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// payments status
app.get('/api/payments/status',(req,res)=>{
  const orderId = req.query.orderId;
  if(!orderId) return res.status(400).json({ error:'orderId required' });
  const p = payments[orderId];
  if(!p) return res.status(404).json({ status:'not_found' });
  res.json({ status: p.status, info: p });
});

// webhook
app.post('/api/baridimob/webhook',(req,res)=>{
  const signature = req.headers['x-baridimob-signature'] || '';
  if(process.env.WEBHOOK_SECRET){
    const payloadRaw = JSON.stringify(req.body || {});
    const expected = require('crypto').createHmac('sha256', process.env.WEBHOOK_SECRET).update(payloadRaw).digest('hex');
    try{
      if(!require('crypto').timingSafeEqual(Buffer.from(expected), Buffer.from(signature))){ console.warn('Invalid signature'); return res.status(400).send('invalid signature'); }
    }catch(e){}
  }
  const { order_id, status, transaction_id } = req.body;
  if(!order_id) return res.status(400).send('order_id required');
  payments[order_id] = payments[order_id] || {};
  payments[order_id].status = status || 'unknown';
  payments[order_id].transactionId = transaction_id || null;
  payments[order_id].raw = req.body;
  console.log('Webhook:', order_id, payments[order_id].status);
  res.json({ ok:true });
});

// simulate-pay
app.get('/simulate-pay',(req,res)=>{
  const orderId = req.query.order_id || 'ORD-demo';
  res.send(`<h3>Simulate payment for ${orderId}</h3><form method="POST" action="/simulate-pay/${orderId}"><button name="action" value="pay">Mark as paid</button><button name="action" value="fail">Mark as failed</button></form>`);
});
app.post('/simulate-pay/:orderId', bodyParser.urlencoded({ extended:true }), (req,res)=>{
  const id = req.params.orderId; const action = req.body.action;
  payments[id] = payments[id] || {}; payments[id].status = (action === 'pay') ? 'paid' : 'failed';
  res.redirect(`/baridimob/return?order_id=${id}`);
});
app.get('/baridimob/return',(req,res)=>{ const id = req.query.order_id; const p = payments[id]||{}; res.send(`<h3>Payment ${id}</h3><div>Status: ${p.status||'unknown'}</div><a href="/">Back</a>`); });

// proctor upload
app.post('/api/proctor/upload', async (req,res)=>{
  try{
    const { report } = req.body;
    if(!report || !report.id) return res.status(400).json({ error:'report.id required' });
    const dir = path.join(proctorStoreDir, report.id);
    mkdirp.sync(dir);
    const reportCopy = { ...report }; const screenshots = reportCopy.screenshots || [];
    reportCopy.screenshots = screenshots.map((s,i) => `screenshot-${i}.jpg`);
    fs.writeFileSync(path.join(dir, 'report.json'), JSON.stringify(reportCopy, null, 2), 'utf8');
    screenshots.forEach((s,i)=>{
      try{
        const parts = s.img.split(','); const base64 = parts[1]; const buffer = Buffer.from(base64, 'base64');
        fs.writeFileSync(path.join(dir, `screenshot-${i}.jpg`), buffer);
      }catch(e){ console.warn('save screenshot fail', e.message); }
    });
    res.json({ ok:true, id: report.id });
  }catch(e){ console.error(e); res.status(500).json({ error: e.message }); }
});

// proctor list
app.get('/api/proctor/list',(req,res)=>{
  try{
    const dirs = fs.readdirSync(proctorStoreDir);
    const reports = dirs.map(d=>{ const p = path.join(proctorStoreDir,d,'report.json'); if(fs.existsSync(p)) return JSON.parse(fs.readFileSync(p,'utf8')); return null; }).filter(Boolean);
    res.json({ reports });
  }catch(e){ res.status(500).json({ error: e.message }); }
});

// serve screenshot
app.get('/api/proctor/:id/screenshot/:name', (req,res)=>{
  const f = path.join(proctorStoreDir, req.params.id, req.params.name);
  if(!fs.existsSync(f)) return res.status(404).send('not found');
  res.sendFile(f);
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, ()=>console.log(`Server running at http://localhost:${PORT}`));
