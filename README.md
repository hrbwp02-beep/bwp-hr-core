# BWP HR Core

ศูนย์กลางข้อมูลบุคลากร (HR Master Data) — บริษัท เบสท์เวิลด์ อินเตอร์พลาส จำกัด

**เว็บ:** https://bwp-hr-core.vercel.app/

## ระบบในเครือ BWP HR Connect
| ระบบ | URL |
|---|---|
| HR Core (ที่นี่) | https://bwp-hr-core.vercel.app/ |
| ระบบประเมินผล | https://bwp-hr-eval.vercel.app/ |
| ระบบสรรหา | https://bwp-recruitment.vercel.app/admin |

ทุกระบบใช้ `employees` ใน Supabase `BWPHRConnect` เป็นแหล่งข้อมูลพนักงานเดียว (Single Source of Truth)

## พัฒนา
เปิดผ่าน HTTP (Babel คอมไพล์ .jsx ในเบราว์เซอร์):
```
powershell -ExecutionPolicy Bypass -File server.ps1 -Port 5173
```

## Deploy
push ขึ้น `main` → GitHub Actions build ด้วย esbuild แล้ว deploy ขึ้น Pages อัตโนมัติ
