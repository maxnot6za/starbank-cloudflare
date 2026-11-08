-- บันทึกการรวมผู้ปกครองซ้ำ (ไว้ทำซ้ำอัตโนมัติหลังนำเข้าข้อมูลใหม่วันย้ายจริง)
CREATE TABLE IF NOT EXISTS MergeLog (
  from_id TEXT, into_id TEXT, family_id TEXT, merged_by TEXT, merged_at TEXT
);
