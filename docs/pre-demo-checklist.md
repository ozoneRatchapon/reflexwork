# Pre-Demo Checklist

> รันก่อนขึ้นเวที/ต่อหน้ากรรมการ ~10 นาที ให้ครบทุกข้อ

## 1. Local AI พร้อม (ถ้าจะโชว์ 0-token local)
```bash
# ollama + model
curl -s http://127.0.0.1:11434/api/tags >/dev/null && echo "ollama OK" || ollama serve &
ollama list | grep typhoon

# ngrok tunnel (ถ้าจะให้ chatbot บน Pages ใช้ local)
pgrep -f "ngrok http" >/dev/null && echo "ngrok running" || \
  ngrok http 11434 --host-header=localhost:11434 &
# เอา URL ใหม่ (ngrok free เปลี่ยนทุกครั้ง) ไปตั้ง secret ถ้า URL เปลี่ยน:
#   curl -s http://127.0.0.1:4040/api/tunnels   # ดู public_url
#   cd integrations/llm-proxy
#   echo '<URL>/v1/chat/completions' | npx wrangler secret put OLLAMA_URL && npx wrangler deploy
```

## 2. เช็กสุขภาพ path ครบวงจร
```bash
./integrations/llm-proxy/health-check.sh
# ต้องเห็น: → LOCAL AI PATH HEALTHY ✓  (source=ollama)
# ถ้า DOWN: ngrok URL เปลี่ยน → ตั้ง OLLAMA_URL ใหม่ (ข้อ 1)
```

## 3. เปิด health-check cron กลับ (ถ้า pause ไว้)
- resume cron `4e76b1c8` (local-AI health) — หรือบอก agent "เปิด cron health-check"

## 4. เช็ก endpoints สด
```bash
curl -s https://reflexwork-kernel.solana-thailand.workers.dev/health        # {"ok":true}
curl -s https://reflexwork-line.solana-thailand.workers.dev/health           # ok
curl -s -o /dev/null -w "%{http_code}\n" https://reflexwork.pages.dev/chatbot.html   # 200
```

## 5. เปิด 3 แท็บไว้
- จอหลัก: https://reflexwork.pages.dev/chatbot.html
- สำรอง: https://reflexwork.pages.dev/dashboard.html
- สำรอง: https://reflexwork.pages.dev/slides.html  (16 หน้า)

## 6. Staff token พร้อม (ถ้าจะโชว์ approve/auto-draft)
- dashboard → ปุ่ม 🔑 ตั้ง Staff Token → วางค่าที่ตั้งไว้ (จาก production-hardening-runbook)

## Fallback ถ้าของพัง
- local AI ล่ม → Gemini fallback ตอบแทนอัตโนมัติ (demo ไม่ตาย)
- gap จริงน้อย → dashboard มี demo data โชว์ได้อยู่แล้ว
- ngrok ล่ม → demo local บน laptop แทน: `./integrations/llm-proxy/demo-local.sh`
  แล้วเปิด http://127.0.0.1:5173/chatbot.html?api=http://127.0.0.1:8787

## ลำดับ demo (ดู docs/ สำหรับ flow เต็ม)
1. ปัญหา (สไลด์ 1-2) → 2. FastPath 0-token → 3. grounded hybrid →
4. intake → 5. voice → 6. self-learning (dashboard) → 7. root-cause report →
8. Kiro AI-SDLC (สไลด์ 16)
