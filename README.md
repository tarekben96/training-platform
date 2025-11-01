# Training Platform (separated files) - Demo

ملف المشروع مقسّم: CSS واحد، كل JS في ملفه الخاص، وخادم Node.js.

## إنشاء وتشغيل
1. فك الضغط أو افتح المجلد.
2. تشغيل الخادم:
   ```bash
   cd server
   npm install
   cp .env.example .env
   node server.js
   ```
3. افتح: http://localhost:3000

## الدفع BaridiMob / ECCP
- عدّل القيم في `.env` إذا توفرت لديك بيانات ECCP الحقيقية (TOKEN_URL/CREATE_ENDPOINT/CLIENT_ID/SECRET/MERCHANT_ID).
- إن لم تتوفر، استخدم صفحة المحاكاة `/simulate-pay` التي يوفّرها الخادم.

## كشف الغش (Proctoring)
- وحدة `public/js/proctor.js` تلتقط لقطات (بإذن المستخدم) وتُسجّل أحداث المتصفح.
- عند الإنهاء يمكن استدعاء `Proctor.stopAndUpload()` لرفع التقرير إلى الخادم.
