use pii_mask::mask_pii;

#[test]
fn masks_values_with_a_shape() {
    let cases = [
        ("ส่งไปที่ somchai.j@student.mahidol.ac.th ได้ไหม", "ส่งไปที่ [email] ได้ไหม"),
        ("เลขบัตร 1-2345-67890-12-3 ใช้สมัครได้ไหม", "เลขบัตร [national-id] ใช้สมัครได้ไหม"),
        ("เลขบัตร 1234567890123", "เลขบัตร [national-id]"),
        ("โทร 081-234-5678 ด่วน", "โทร [phone] ด่วน"),
        ("โทร0812345678", "โทร[phone]"),
        ("call +66 81 234 5678", "call [phone]"),
        ("รหัส 6512345 ลงทะเบียนไม่ได้", "รหัส [id] ลงทะเบียนไม่ได้"),
        ("user u6512345 login ไม่ได้", "user [id] login ไม่ได้"),
        ("line id: somchai_88 ติดต่อกลับ", "line id: [line] ติดต่อกลับ"),
        ("ไลน์ @abc123 ค่ะ", "ไลน์ [line] ค่ะ"),
        ("นางสาวสมหญิง ใจดี ขอใบรับรอง", "[name] ขอใบรับรอง"),
        ("ผมนาย สมชาย ใจดี ขอถาม", "ผม[name] ขอถาม"),
        ("ผมนาย สมชาย ขอถาม", "ผม[name]"), // no surname: the next word is taken as one (over-masks, the safe side)
        ("I am Mr. John Smith, a student", "I am [name], a student"),
        ("ระบบล่ม ผมชื่อ สมชาย ใจดี รหัส 6537001", "ระบบล่ม ผมชื่อ [name] รหัส [id]"),
        ("ชื่อ-สกุล: Somchai Jaidee", "ชื่อ-สกุล: [name]"),
    ];
    for (input, want) in cases {
        assert_eq!(mask_pii(input), want, "input {input:?}");
    }
}

#[test]
fn keeps_what_staff_and_the_search_need() {
    let unchanged = [
        "ติดต่อนายทะเบียนที่ไหน",
        "ค่าเทอม 100000 บาท ต่อปีไหม",
        "สอบ online exam ได้ไหม",
        "ปีการศึกษา 2569 ภาค 1 เปิดเมื่อไหร่",
        "ส่งรูปเล่มภายในกี่วัน",
        "เกรด 3.25 สมัครได้ไหม",
        "how many credits for plan A",
        "เปลี่ยนชื่อวิทยานิพนธ์ได้ไหม",
        "ค่าสมัคร 500 บาท ภาคต้น 2570",
    ];
    for q in unchanged {
        assert_eq!(mask_pii(q), q);
    }
}
