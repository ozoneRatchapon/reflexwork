# 005 — Knowledge entries that need an owner decision

Prepared 2026-11-04 from plan 003 (findings 85, 12, 18). Nothing here was changed: whether an entry is publishable is the owner's call.

## A. 30 entries with `status: draft` but `approval_status: approved`
All 30 pass the publish gate (approval_status approved) and are served to students today. `status: draft` is a separate field; its meaning is not documented in the repo. Question for the owner: is `draft` a leftover (then set it to `current`) or a real warning (then set approval_status back to pending)?

| id | title |
|---|---|
| gm_admissions_office_contacts | ช่องทางติดต่องานรับนักศึกษา |
| gm_application_documents_upload | เอกสารสมัครและรูปแบบไฟล์ที่ต้องอัปโหลด |
| gm_application_fee | ค่าสมัครและการสมัครมากกว่าหนึ่งหลักสูตร |
| gm_application_overview | เริ่มสมัครเข้าศึกษาระดับบัณฑิตศึกษาอย่างไร |
| gm_dormitory_navigation | หอพักและบ้านมหิดลต้องดูข้อมูลที่ไหน |
| gm_english_requirements_sources | ตรวจเกณฑ์และยื่นผลภาษาอังกฤษสำหรับการสมัคร |
| gm_forms_directory | แบบฟอร์มที่เกี่ยวกับการสมัครและนักศึกษาใหม่ |
| gm_health_check_cancellation_2568 | ประกาศตรวจสุขภาพที่ลิงก์ไว้เป็นประกาศยกเลิก — ภาคปลาย 2568 |
| gm_health_service_navigation | หาข้อมูลบริการสุขภาพและแบบฟอร์มเบิกค่ารักษาที่ไหน |
| gm_mental_wellbeing_navigation | ช่องทางให้คำปรึกษาด้านสุขภาพใจ |
| gm_military_deferment_directory_2570 | ค้นประกาศผ่อนผันทหารประจำปี 2570 |
| gm_programme_availability | การตรวจว่าหลักสูตรใดกำลังเปิดรับสมัคร |
| gm_sample_2018DG00_2570_documents | ตัวอย่างประกาศ 2018DG00 ปี 2570: เอกสารและการคัดเลือก |
| gm_sample_2018DG00_2570_eligibility | ตัวอย่างประกาศรับสมัคร 2018DG00 ปี 2570: แผนและคุณสมบัติ |
| gm_schedule_2570_round1 | กำหนดการรับสมัครปีการศึกษา 2570 ภาคต้น รอบ 1 |
| gm_scholarship_directory | ค้นทุนการศึกษาและรางวัลวิทยานิพนธ์อย่างไร |
| gm_selection_and_new_student_reporting | การสอบคัดเลือกและการรายงานตัวนักศึกษาใหม่ |
| gm_service_overview | งานกิจการนักศึกษามีบริการอะไรบ้าง |
| gm_softskills_activity_hours | การนับชั่วโมงและทักษะจากกิจกรรม Soft Skills |
| gm_softskills_eight_domains | Soft Skills มีทักษะอะไรบ้างตามประกาศ 2569 |
| gm_softskills_existing_results | ผล Soft Skills เดิมและคำขอเทียบเคียงที่ค้างอยู่ |
| gm_softskills_muce_equivalence | เรียน MUCE ออนไลน์แล้วขอเทียบเคียง Soft Skills ได้อย่างไร |
| gm_softskills_profile_channels | สมัครกิจกรรมและตรวจผล Soft Skills ได้ที่ไหน |
| gm_softskills_programme_equivalence | หลักสูตรขอเทียบเคียงกิจกรรม Soft Skills อย่างไร |
| gm_softskills_voluntary_2569 | Soft Skills เป็นเงื่อนไขจบหรือไม่ — ประกาศ พ.ศ. 2569 |
| gm_student_affairs_contacts | ติดต่องานกิจการนักศึกษาและเรื่อง Soft Skills |
| gm_student_support_directory | เงินสงเคราะห์และการช่วยเหลือนักศึกษา |
| gm_travel_navigation | Shuttle Bus และ Salaya Link ดูตารางที่ไหน |
| gm_tuition_fee_sources | เลือกประกาศค่าเล่าเรียนให้ตรงปีและหลักสูตร |
| gm_welfare_directory | สวัสดิการนักศึกษามีข้อมูลเรื่องใดบ้าง |

Note: `gm_mental_wellbeing_navigation` is one of these 30 and is the entry the new wellbeing reply cites. Worth deciding first.

## B. 3 entries whose body mentions an owner-review state
- gm_thesis_submission_05_committee_names
- gm_thesis_submission_07_title_change
- gm_thesis_submission_13_review_time

## C. Production exposure (finding F43, checked 2026-11-04 with read-only curl)
- `https://reflexwork.pages.dev/knowledge/registration_2569.md` and `.../thesis_submission_01_template.md` return 200 text/markdown with `approval_status: pending_owner_approval`.
- The latest production deployment (cafb77f4, commit a620576) does NOT contain them: its own URL returns the HTML fallback for both paths. The custom alias serves an old copy from the Cloudflare edge cache (`cf-cache-status: HIT`, age ~42 h, `s-maxage=604800` = 7 days), so it should expire by itself within about 5 days.
- Root cause (uploading the working folder) was already fixed by commit 62af473 (deploy_pages.sh deploys committed files only). No action taken. Option if sooner removal matters: purge the cache for those two URLs in the Cloudflare dashboard (owner account).

## D. Entries written for the bot or the reviewer, not the student
About 35 entries (finding 12). Rewrite needs the content owner; list them with `node scripts/…` once a lint exists (see tests/voice_lint.test.mjs for the current rules).
