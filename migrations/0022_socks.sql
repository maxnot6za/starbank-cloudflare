-- กิจกรรมคริสต์มาส "ถุงเท้าซานต้า" (เปิด/ปิด + ค่าทั้งหมดอยู่ที่ AppConfig key = 'event_socks' เป็น JSON)
-- SocksPlays: เล่นจริงคนละ 1 รอบต่อวัน (play_id = member|day) · day = วันที่นับเข้าตะกร้า (เวลาไทย)
CREATE TABLE IF NOT EXISTS SocksPlays (
  play_id TEXT PRIMARY KEY,
  family_id TEXT NOT NULL,
  member_id TEXT NOT NULL,
  season TEXT,
  play_date TEXT,          -- วันที่กดเล่น (โควตา)
  day TEXT,                -- วันที่นับเข้าตะกร้า (เปิดถุงวันนี้ไปแล้ว → นับเป็นพรุ่งนี้)
  status TEXT,             -- playing | done
  socks INTEGER DEFAULT 0,
  golds INTEGER DEFAULT 0,
  clocks INTEGER DEFAULT 0,
  bad INTEGER DEFAULT 0,
  taps INTEGER DEFAULT 0,
  played_ms INTEGER DEFAULT 0,
  started_at TEXT,
  ended_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_socksplays_family ON SocksPlays(family_id, season);

-- SocksBags: ถุงของขวัญรายวัน (bag_id = family|day) และรางวัลหมุดถุงเท้ายักษ์ (bag_id = family|season|m25 ...)
CREATE TABLE IF NOT EXISTS SocksBags (
  bag_id TEXT PRIMARY KEY,
  family_id TEXT NOT NULL,
  season TEXT,
  day TEXT,
  kind TEXT,               -- bag | milestone
  tier TEXT,               -- s | m | l | m25 | m50 | m75 | m100
  total INTEGER DEFAULT 0,
  items TEXT,              -- JSON [{kind:'purple',n}|{kind:'item',id}|{kind:'coupon',pct}]
  opened_by TEXT,
  opened_at TEXT,
  created_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_socksbags_family ON SocksBags(family_id, season);
