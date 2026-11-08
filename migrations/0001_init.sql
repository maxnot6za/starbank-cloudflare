-- ธนาคารดาว — โครงสร้างฐานข้อมูล D1 (ตาราง/คอลัมน์ตรงกับแท็บใน Google Sheet เดิม)
CREATE TABLE IF NOT EXISTS Families (
  family_id TEXT PRIMARY KEY, family_name TEXT, join_code TEXT, created_at TEXT,
  wheel_enabled INTEGER, wheel_started_at TEXT, wheel_prizes TEXT
);
CREATE INDEX IF NOT EXISTS idx_families_code ON Families(join_code);

CREATE TABLE IF NOT EXISTS Members (
  member_id TEXT PRIMARY KEY, family_id TEXT, name TEXT, role TEXT, avatar TEXT,
  line_user_id TEXT, web_token TEXT, created_at TEXT, notify_submission INTEGER
);
CREATE INDEX IF NOT EXISTS idx_members_family ON Members(family_id);
CREATE INDEX IF NOT EXISTS idx_members_token ON Members(web_token);
CREATE INDEX IF NOT EXISTS idx_members_line ON Members(line_user_id);

CREATE TABLE IF NOT EXISTS Missions (
  mission_id TEXT PRIMARY KEY, family_id TEXT, title TEXT, description TEXT,
  base_stars REAL, multiplier REAL, icon TEXT, is_active INTEGER, created_by TEXT, created_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_missions_family ON Missions(family_id);

CREATE TABLE IF NOT EXISTS Submissions (
  submission_id TEXT PRIMARY KEY, mission_id TEXT, child_id TEXT, family_id TEXT, mission_title TEXT,
  status TEXT, stars_earned REAL, submitted_at TEXT, reviewed_by TEXT, reviewed_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_subs_family ON Submissions(family_id);
CREATE INDEX IF NOT EXISTS idx_subs_child ON Submissions(child_id);

CREATE TABLE IF NOT EXISTS Rewards (
  reward_id TEXT PRIMARY KEY, family_id TEXT, title TEXT, description TEXT, stars_cost REAL, type TEXT,
  secret_data TEXT, quantity REAL, icon TEXT, is_active INTEGER, created_by TEXT, created_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_rewards_family ON Rewards(family_id);

CREATE TABLE IF NOT EXISTS Redemptions (
  redemption_id TEXT PRIMARY KEY, reward_id TEXT, child_id TEXT, family_id TEXT, reward_title TEXT,
  stars_spent REAL, secret_revealed TEXT, redeemed_at TEXT, acknowledged_at TEXT, acknowledged_by TEXT
);
CREATE INDEX IF NOT EXISTS idx_redeem_family ON Redemptions(family_id);
CREATE INDEX IF NOT EXISTS idx_redeem_child ON Redemptions(child_id);

CREATE TABLE IF NOT EXISTS LineState (
  user_id TEXT PRIMARY KEY, state TEXT, data TEXT, updated_at TEXT
);

CREATE TABLE IF NOT EXISTS DailyLog (
  log_id TEXT PRIMARY KEY, family_id TEXT, date TEXT, child_id TEXT, child_name TEXT,
  stars_earned_today REAL, stars_spent_today REAL, balance REAL, missions_completed_today INTEGER, logged_at TEXT
);

CREATE TABLE IF NOT EXISTS Spins (
  spin_id TEXT PRIMARY KEY, child_id TEXT, family_id TEXT, round_key TEXT, earned_at TEXT,
  used_at TEXT, prize_stars REAL, prize_index INTEGER, request_id TEXT
);
CREATE INDEX IF NOT EXISTS idx_spins_family ON Spins(family_id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_spins_round ON Spins(child_id, round_key);

-- ใช้ตรวจว่าแถวที่จะแก้ยังไม่ถูกเครื่องอื่นแก้ไปก่อน (ถ้าไม่ผ่าน ทั้งชุดจะยกเลิก)
CREATE TABLE IF NOT EXISTS _guard (ok INTEGER CHECK (ok > 0));

-- กันดาวติดลบ แม้มีการแลกรางวัลพร้อมกันหลายเครื่อง
CREATE TRIGGER IF NOT EXISTS trg_no_overspend AFTER INSERT ON Redemptions
BEGIN
  SELECT RAISE(ABORT, 'ดาวไม่พอ')
  WHERE (SELECT COALESCE(SUM(stars_earned), 0) FROM Submissions WHERE child_id = NEW.child_id AND status = 'approved')
      + (SELECT COALESCE(SUM(prize_stars), 0) FROM Spins WHERE child_id = NEW.child_id AND COALESCE(used_at, '') <> '')
      - (SELECT COALESCE(SUM(stars_spent), 0) FROM Redemptions WHERE child_id = NEW.child_id) < 0;
END;
