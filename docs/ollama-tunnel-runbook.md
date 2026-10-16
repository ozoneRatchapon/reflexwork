# Runbook: Pages chatbot → local Ollama via Cloudflare Tunnel

> เป้าหมาย: ให้ chatbot บน Cloudflare Pages ตอบ LLM-path จาก **local model**
> (Gemma/Typhoon) แทน Gemini — 0 ค่า token, ข้อมูลไม่ขึ้น cloud ของเจ้าอื่น

## ทำไมต้องมี tunnel

chatbot (Pages) → `llm-proxy` **Worker** (รันบน edge Cloudflare) → model
Worker ไม่มีเส้นทางไปถึง `localhost:11434` ของเครื่องคุณ **tunnel** จึงเปิด
Ollama ให้เป็น public HTTPS URL ที่ Worker เรียกได้

```
chatbot (Pages) ──▶ llm-proxy Worker ──(HTTPS)──▶ trycloudflare.com URL ──▶ cloudflared ──▶ Ollama :11434 (เครื่องคุณ)
```

## วิธีตั้ง (quick tunnel — demo, ไม่ต้องมีบัญชี)

```bash
brew install cloudflared                 # ครั้งเดียว
cd integrations/llm-proxy
./setup-ollama-tunnel.sh gemma2:9b       # หรือ scb10x/typhoon2.1-gemma3-4b
# สคริปต์จะ pull model + serve ollama + เปิด tunnel แล้วพิมพ์ URL ออกมา
```

เมื่อเห็น `https://<random>.trycloudflare.com` ให้ตั้ง secret บน proxy:

```bash
cd integrations/llm-proxy
echo 'https://<random>.trycloudflare.com/v1/chat/completions' | npx wrangler secret put OLLAMA_URL
echo 'gemma2:9b' | npx wrangler secret put OLLAMA_MODEL
npx wrangler deploy
```

เสร็จแล้ว chatbot จะส่ง LLM-path ไป local model โดยอัตโนมัติ (proxy เลือก
Ollama ก่อน ถ้า local ล่มจะ fall back ไป Gemini ให้เอง เมื่อยังตั้ง key ไว้)

ปิดใช้ local: `npx wrangler secret delete OLLAMA_URL` → กลับไปใช้ Gemini

## ⚠️ ข้อจำกัด quick tunnel
- URL **เปลี่ยนทุกครั้งที่รันใหม่** → ต้อง `secret put OLLAMA_URL` ใหม่ทุกครั้ง
- เครื่องต้องเปิด + `cloudflared` + `ollama` ค้างไว้ตลอด
- เหมาะ **demo** ไม่เหมาะ production

## Named tunnel (URL คงที่ — ใกล้ production)
ต้องมีบัญชี Cloudflare (ฟรี) + โดเมนใน Cloudflare:
```bash
cloudflared tunnel login
cloudflared tunnel create reflexwork-ollama
cloudflared tunnel route dns reflexwork-ollama ollama.yourdomain.com
cloudflared tunnel run --url http://127.0.0.1:11434 reflexwork-ollama
# OLLAMA_URL = https://ollama.yourdomain.com/v1/chat/completions (คงที่)
```
แนะนำตั้ง `OLLAMA_TOKEN` (bearer) ด้วย แล้วให้ Ollama/relay ตรวจ เพื่อกันคนอื่นยิง endpoint

## แล้วยังฟรีอยู่ไหม? (คำตอบตรง)

**ตัว Cloudflare Tunnel = ฟรี** ทั้ง quick และ named (รวมใน free plan, ไม่คิดตาม bandwidth สำหรับการใช้ปกติ) **ไม่มีค่า tunnel เพิ่ม**

สิ่งที่ "ไม่ฟรี" คือ **เครื่องที่รัน Ollama** — ไม่ใช่ค่า Cloudflare:

| ส่วน | ฟรีไหม | หมายเหตุ |
|---|---|---|
| Cloudflare Tunnel | ✅ ฟรี | quick = ฟรีไม่ต้องบัญชี · named = ฟรีใน free plan |
| Pages + Worker (proxy) | ✅ ฟรี | ยังอยู่ใน free tier เดิม |
| **เครื่องรัน Ollama** | ⚠️ "ฟรี" แบบมีเงื่อนไข | laptop คุณ = ฟรี (จ่ายแค่ค่าไฟ) · ถ้าเช่า GPU cloud = เสียเงินรายชั่วโมง |
| ค่า token | ✅ **0** | local model ไม่คิด per-token (นี่คือจุดที่ประหยัดจริง) |

**สรุป:**
- **demo บน laptop:** ฟรีจริง 100% (ไฟฟ้าอย่างเดียว) — tunnel ฟรี, token 0
- **production 24/7:** tunnel ยังฟรี แต่ต้องมี "เครื่องเปิดตลอด" — ถ้าใช้ server
  มหาวิทยาลัยที่มีอยู่แล้ว = ฟรี, ถ้าเช่า GPU cloud = เสียค่าเครื่อง (แต่ยัง
  0 ค่า token และข้อมูลไม่ออกนอกเครื่องที่ควบคุมเอง)

เทียบกับ Gemini cloud: จ่าย per-token ตลอด + ข้อมูลขึ้น Google — local+tunnel
ย้ายค่าใช้จ่ายจาก "per-token แปรผันตามการใช้" ไปเป็น "ค่าเครื่องคงที่ (หรือ 0 ถ้ามีเครื่องอยู่แล้ว)"
