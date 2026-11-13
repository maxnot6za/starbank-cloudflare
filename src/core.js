// ธนาคารดาว — ตรรกะหลัก พอร์ตจาก Code.gs (Google Apps Script) แบบคงพฤติกรรมเดิม
// เปลี่ยนเฉพาะ: ที่เก็บข้อมูล (Sheet → D1 ผ่าน Store), การส่ง LINE (เข้าคิว ส่งหลังบันทึกสำเร็จ),
// LockService (D1 ใช้ transaction + เงื่อนไขกันแก้ทับแทน), วันที่ (เวลาไทยเสมอ)

const NO_LOCK = { waitLock() {}, tryLock() { return true; }, releaseLock() {} };

// ฟังก์ชันที่หน้าเว็บเรียกได้ (เหมือนฟังก์ชันที่ไม่มี _ ใน Apps Script)
export const PUBLIC_API = [
  'getMemberByWebToken', 'webLookupFamily', 'webReconnect', 'webRegister', 'webJoinFamily',
  'getChildDashboard', 'submitMission', 'redeemReward', 'spinWheel',
  'getParentDashboard', 'acknowledgeRedemptions', 'checkRejectImpact', 'reviewSubmission',
  'webSaveMission', 'webSaveReward', 'webDeleteMission', 'webDeleteReward',
  'toggleSubmissionNotify', 'getDailySummary', 'getWeeklySummary', 'setWheelEnabled', 'setWheelPrizes', 'getWheelStatus',
  'createUrgent', 'cancelUrgent', 'urgentSeen', 'acceptUrgent', 'submitUrgent', 'declineUrgent',
  'sendGift', 'cancelGift', 'openGift',
  'questSeen', 'treeSeen', 'setTheme', 'setFloor', 'setWall', 'saveRoom', 'setPets', 'hugEgg', 'hatchEgg', 'eggSeen', 'purpleSeen', 'newsSeen', 'claimQuest', 'getShop', 'buyItem', 'assignAvatar', 'wishItem'
];

export function createCore(S) {
  function handleLineEvent_(event) {
    const userId = event.source && event.source.userId;
    if (!userId) return;
    const replyToken = event.replyToken;

    switch(event.type) {
      case 'follow':
        handleFollow_(userId, replyToken);
        break;
      case 'message':
        if (event.message.type === 'text') {
          handleTextMessage_(userId, event.message.text.trim(), replyToken);
        }
        break;
      case 'postback':
        handlePostback_(userId, event.postback.data, replyToken);
        break;
    }
  }

  // --- Follow: ผู้ปกครอง add เพื่อน ---
  function handleFollow_(userId, replyToken) {
    lineReply_(replyToken, [
      {
        type: 'text',
        text: '🌟 สวัสดีค่ะ ยินดีต้อนรับสู่ ธนาคารดาว!\n\nแอปสำหรับให้เด็กๆ ทำภารกิจ สะสมดาว แลกรางวัล'
      },
      makeQuickReplyMenu_('เลือกสิ่งที่ต้องการ:')
    ]);
  }

  // --- Text message handler ---
  function handleTextMessage_(userId, text, replyToken) {
    const state = getUserState_(userId);

    // Check state machine first
    if (state.state === 'awaiting_family_name') {
      return handleCreateFamilyName_(userId, text, replyToken);
    }
    if (state.state === 'awaiting_join_code') {
      return handleJoinCode_(userId, text, replyToken);
    }
    if (state.state === 'awaiting_parent_name') {
      return handleParentName_(userId, text, replyToken, state.data);
    }

    // Command matching
    const t = text.toLowerCase();
    if (t === 'สร้างครอบครัว' || t === 'สร้าง') {
      setUserState_(userId, 'awaiting_family_name', {});
      lineReply_(replyToken, [{
        type: 'text',
        text: '🏠 สร้างครอบครัวใหม่\n\nกรุณาพิมพ์ชื่อครอบครัว\nเช่น "บ้านสุขสันต์"'
      }]);
    }
    else if (t === 'เข้าร่วม' || t === 'เข้าร่วมครอบครัว') {
      setUserState_(userId, 'awaiting_join_code', {});
      lineReply_(replyToken, [{
        type: 'text',
        text: '🔑 เข้าร่วมครอบครัว\n\nกรุณาพิมพ์รหัส 6 หลัก\nที่ได้จากผู้สร้างครอบครัว'
      }]);
    }
    else if (t === 'ข้อมูล' || t === 'สถานะ' || t === 'ดาว') {
      return handleStatusCheck_(userId, replyToken);
    }
    else if (t === 'เว็บ' || t === 'web' || t === 'เปิดเว็บ' || t === 'webapp') {
      return handleOpenWeb_(userId, replyToken);
    }
    else if (t === 'เมนู' || t === 'menu' || t === 'help') {
      lineReply_(replyToken, [makeQuickReplyMenu_('เลือกสิ่งที่ต้องการ:')]);
    }
    else {
      // Unknown input — show menu
      lineReply_(replyToken, [makeQuickReplyMenu_('พิมพ์ "เมนู" หรือเลือกจากตัวเลือก:')]);
    }
  }

  // --- Postback handler (approve/reject buttons) ---
  function handlePostback_(userId, data, replyToken) {
    const parts = data.split(':');
    const action = parts[0];
    const subId = parts[1];

    if (action === 'approve') {
      const result = quickApprove_(subId, userId);
      if (result.error) {
        lineReply_(replyToken, [{ type: 'text', text: '⚠️ ' + result.error }]);
      } else {
        const child = getMember_(result.childId);
        const childName = child ? child.name : 'น้อง';
        lineReply_(replyToken, [{
          type: 'text',
          text: `✅ อนุมัติแล้ว!\n${childName} ได้รับ ${result.starsEarned} ดาว\nจากภารกิจ "${result.missionTitle}"`
        }]);
      }
    }
    else if (action === 'reject') {
      var impact = { warn: false };
      try { impact = checkRejectImpact_(subId); } catch (e) {}
      const result = quickReject_(subId, userId);
      if (result.error) {
        lineReply_(replyToken, [{ type: 'text', text: '⚠️ ' + result.error }]);
      } else {
        lineReply_(replyToken, [{
          type: 'text',
          text: `❌ ปฏิเสธภารกิจ "${result.missionTitle}" แล้ว` +
            (impact.warn ? `\n🎄 ต้นคริสต์มาสของ ${impact.childName} จะเริ่มนับใหม่` : '')
        }]);
      }
    }
  }

  // ==========================================
  // CONVERSATION STATE MACHINE
  // ==========================================
  function handleCreateFamilyName_(userId, familyName, replyToken) {
    clearUserState_(userId);

    if (familyName.length < 2 || familyName.length > 30) {
      lineReply_(replyToken, [{ type: 'text', text: '❌ ชื่อต้องยาว 2-30 ตัวอักษร กรุณาลองใหม่' },
        makeQuickReplyMenu_('เลือก:')]);
      return;
    }

    const result = createFamily_(familyName);
    const webAppUrl = S.webAppUrl;

    // ลงทะเบียน parent ใน LINE โดยยังไม่ตั้งชื่อ → ถามชื่อก่อน
    setUserState_(userId, 'awaiting_parent_name', { familyId: result.familyId, joinCode: result.joinCode, familyName: familyName });

    lineReply_(replyToken, [
      {
        type: 'text',
        text: `🎉 สร้างครอบครัว "${familyName}" สำเร็จ!\n\n🔑 รหัสเข้าร่วม: ${result.joinCode}\n(ส่งรหัสนี้ให้เด็กๆ)\n\n📱 Web App สำหรับเด็ก:\n${webAppUrl}`
      },
      {
        type: 'text',
        text: 'กรุณาพิมพ์ชื่อของคุณ (ชื่อเล่น)\nเพื่อลงทะเบียนเป็นผู้ปกครอง'
      }
    ]);
  }

  function handleJoinCode_(userId, code, replyToken) {
    const cleanCode = code.toUpperCase().replace(/\s/g, '');
    if (cleanCode.length !== 6) {
      lineReply_(replyToken, [{ type: 'text', text: '❌ รหัสต้อง 6 หลัก กรุณาลองใหม่' }]);
      return;
    }

    const family = getFamilyByCode_(cleanCode);
    if (!family) {
      clearUserState_(userId);
      lineReply_(replyToken, [{ type: 'text', text: '❌ ไม่พบครอบครัวที่ใช้รหัสนี้ ลองตรวจสอบอีกครั้ง' },
        makeQuickReplyMenu_('เลือก:')]);
      return;
    }

    setUserState_(userId, 'awaiting_parent_name', { familyId: family.family_id, familyName: family.family_name });
    lineReply_(replyToken, [
      { type: 'text', text: `✅ พบครอบครัว "${family.family_name}"!\n\nกรุณาพิมพ์ชื่อของคุณ (ชื่อเล่น)\nเพื่อลงทะเบียนเป็นผู้ปกครอง` }
    ]);
  }

  function handleParentName_(userId, name, replyToken, stateData) {
    clearUserState_(userId);

    if (name.length < 1 || name.length > 20) {
      lineReply_(replyToken, [{ type: 'text', text: '❌ ชื่อต้องยาว 1-20 ตัวอักษร' }, makeQuickReplyMenu_('เลือก:')]);
      return;
    }

    // ลงทะเบียนเป็น parent
    const member = joinFamily(stateData.familyId, name, 'parent', '👨‍👩‍👧');
    // บันทึก LINE userId
    updateRow_('Members', 'member_id', member.memberId, { line_user_id: userId });

    const webAppUrl = S.webAppUrl;
    const webToken = member.memberId; // ใช้ memberId เป็น token สำหรับ auto-login

    lineReply_(replyToken, [
      {
        type: 'text',
        text: `🎉 ลงทะเบียนสำเร็จ!\n\n👤 ชื่อ: ${name}\n🏠 ครอบครัว: ${stateData.familyName}\n👨‍👩‍👧 บทบาท: ผู้ปกครอง\n\nเมื่อเด็กๆ ส่งภารกิจ จะมีข้อความแจ้งที่นี่\nพร้อมปุ่มอนุมัติให้กดได้เลย!`
      },
      {
        type: 'text',
        text: `📱 เปิดแอปเพื่อจัดการภารกิจ/รางวัล (กด "เข้าสู่ระบบด้วย LINE"):\n${webAppUrl}`,
        quickReply: {
          items: [
            { type: 'action', action: { type: 'message', label: '📊 ดูสถานะ', text: 'สถานะ' }},
            { type: 'action', action: { type: 'message', label: '📋 เมนู', text: 'เมนู' }}
          ]
        }
      }
    ]);
  }

  // ส่งลิงก์ auto-login เปิดเว็บให้ผู้ปกครอง/เด็ก
  function handleOpenWeb_(userId, replyToken) {
    const member = getMemberByLineId_(userId);
    if (!member) {
      lineReply_(replyToken, [makeQuickReplyMenu_('ยังไม่ได้ลงทะเบียน เลือก:')]);
      return;
    }
    const webAppUrl = S.webAppUrl;
    lineReply_(replyToken, [{
      type: 'text',
      text: '📱 เปิดแอปแล้วกด "เข้าสู่ระบบด้วย LINE":\n' + webAppUrl
    }]);
  }

  function handleStatusCheck_(userId, replyToken) {
    const member = getMemberByLineId_(userId);
    if (!member) {
      lineReply_(replyToken, [makeQuickReplyMenu_('ยังไม่ได้ลงทะเบียน เลือก:')]);
      return;
    }

    const familyId = member.family_id;
    const children = getFamilyMembers_(familyId).filter(m => m.role === 'child');

    if (!children.length) {
      lineReply_(replyToken, [{
        type: 'text',
        text: `🏠 ${member.name}\n\nยังไม่มีสมาชิกเด็ก\nส่งรหัสเข้าร่วมให้เด็กๆ เพื่อเริ่มต้น`
      }]);
      return;
    }

    let text = `🏠 ครอบครัว: ${getFamilyInfo_(familyId).family_name}\n\n`;
    children.forEach(c => {
      const stats = getChildStats_(c.member_id);
      text += `${c.avatar} ${c.name}: ⭐${stats.balance} ดาว (ได้ ${stats.totalEarned} / ใช้ ${stats.totalSpent})\n`;
    });

    const pending = getPendingSubmissions_(familyId);
    if (pending.length) {
      text += `\n⏳ รออนุมัติ: ${pending.length} รายการ`;
    }

    lineReply_(replyToken, [{
      type: 'text',
      text: text,
      quickReply: {
        items: [
          { type: 'action', action: { type: 'message', label: '📋 เมนู', text: 'เมนู' }}
        ]
      }
    }]);
  }

  // ==========================================
  // LINE MESSAGING API
  // ==========================================
  function lineReply_(replyToken, messages) {
    if (!replyToken) return;
    S.outbox.push({ kind: 'reply', replyToken: replyToken, messages: messages });
  }

  function linePush_(userId, messages) {
    if (!userId) return;
    S.outbox.push({ kind: 'push', to: userId, messages: messages });
  }

  function makeQuickReplyMenu_(text) {
    return {
      type: 'text',
      text: text,
      quickReply: {
        items: [
          { type: 'action', action: { type: 'message', label: '🏠 สร้างครอบครัว', text: 'สร้างครอบครัว' }},
          { type: 'action', action: { type: 'message', label: '🔑 เข้าร่วม', text: 'เข้าร่วมครอบครัว' }},
          { type: 'action', action: { type: 'message', label: '📊 ดูสถานะ', text: 'สถานะ' }},
          { type: 'action', action: { type: 'message', label: '📱 เปิดเว็บ', text: 'เว็บ' }}
        ]
      }
    };
  }

  function makeApprovalFlex_(submissionId, childName, childAvatar, missionTitle, starsDisplay) {
    return {
      type: 'flex',
      altText: `${childName} ส่งภารกิจ "${missionTitle}"`,
      contents: {
        type: 'bubble',
        size: 'kilo',
        header: {
          type: 'box', layout: 'vertical',
          backgroundColor: '#6C5CE7',
          paddingAll: '14px',
          contents: [
            { type: 'text', text: '⭐ ธนาคารดาว', color: '#FFFFFF', size: 'sm', weight: 'bold' }
          ]
        },
        body: {
          type: 'box', layout: 'vertical', spacing: 'md', paddingAll: '16px',
          contents: [
            {
              type: 'box', layout: 'horizontal', spacing: 'md',
              contents: [
                { type: 'text', text: childAvatar || '🧒', size: 'xxl', flex: 0 },
                {
                  type: 'box', layout: 'vertical',
                  contents: [
                    { type: 'text', text: childName + ' ส่งภารกิจ', weight: 'bold', size: 'md', wrap: true },
                    { type: 'text', text: missionTitle, size: 'sm', color: '#666666', wrap: true },
                  ]
                }
              ]
            },
            { type: 'separator' },
            {
              type: 'box', layout: 'horizontal', justifyContent: 'center',
              contents: [
                { type: 'text', text: '🌟 ' + starsDisplay, size: 'lg', weight: 'bold', color: '#E17055', align: 'center' }
              ]
            }
          ]
        },
        footer: {
          type: 'box', layout: 'horizontal', spacing: 'sm', paddingAll: '12px',
          contents: [
            {
              type: 'button', style: 'secondary', height: 'sm',
              action: { type: 'postback', label: '❌ ไม่อนุมัติ', data: 'reject:' + submissionId }
            },
            {
              type: 'button', style: 'primary', height: 'sm', color: '#00B894',
              action: { type: 'postback', label: '✅ อนุมัติ', data: 'approve:' + submissionId }
            }
          ]
        }
      }
    };
  }

  // Notify all parents in family via LINE push
  function notifyParentsLine_(familyId, messages) {
    const members = getAllRows_('Members');
    const parents = members.filter(m => String(m.family_id) === String(familyId) && m.role === 'parent' && m.line_user_id);
    parents.forEach(p => {
      try { linePush_(p.line_user_id, messages); }
      catch(e) { console.error('Push error for ' + p.name + ': ' + e.message); }
    });
  }

  // ==========================================
  // USER STATE (for conversation flow)
  // ==========================================
  function getUserState_(userId) {
    const row = getAllRows_('LineState').find(r => r.user_id === userId);
    if (!row) return { state: 'idle', data: {} };
    let data = {};
    try { data = row.data ? JSON.parse(row.data) : {}; } catch (e) {}
    return { state: row.state || 'idle', data: data };
  }

  function setUserState_(userId, state, data) {
    const now = new Date().toISOString();
    if (getAllRows_('LineState').find(r => r.user_id === userId)) {
      updateRow_('LineState', 'user_id', userId, { state: state, data: JSON.stringify(data || {}), updated_at: now });
      return;
    }
    appendRow_('LineState', { user_id: userId, state: state, data: JSON.stringify(data || {}), updated_at: now });
  }

  function clearUserState_(userId) {
    setUserState_(userId, 'idle', {});
  }

  // ==========================================
  // STORAGE HELPERS (D1 ผ่าน Store — ใช้งานเหมือนฟังก์ชันชีตเดิม)
  // ==========================================
  function getDB_() { return null; }
  function getAllRows_(sheetName) { return S.store.all(sheetName); }
  function clearCache_(sheetName) {}
  function appendRow_(sheetName, obj) { S.store.append(sheetName, obj); }
  function updateRow_(sheetName, idField, idValue, updates) { return S.store.update(sheetName, idField, idValue, updates); }

  function genId_() { return crypto.randomUUID().replace(/-/g, '').substring(0, 12); }

  function genJoinCode_() {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let code = '';
    for (let i = 0; i < 6; i++) code += chars[Math.floor(Math.random() * chars.length)];
    return code;
  }

  // ==========================================
  // FAMILY
  // ==========================================
  function createFamily_(familyName) {
    getDB_(); // ensure init
    const familyId = genId_();
    const joinCode = genJoinCode_();
    appendRow_('Families', { family_id: familyId, family_name: familyName, join_code: joinCode, created_at: new Date().toISOString() });

    // ภารกิจตัวอย่าง
    [
      { title: 'แปรงฟันเช้า-เย็น', description: 'แปรงฟันให้ครบ 2 นาที', base_stars: 1 },
      { title: 'อ่านหนังสือ 20 นาที', description: 'อ่านหนังสืออะไรก็ได้', base_stars: 2 },
      { title: 'เก็บที่นอน', description: 'พับผ้าห่มและจัดหมอนให้เรียบร้อย', base_stars: 1 },
      { title: 'ทำการบ้านเสร็จ', description: 'ทำการบ้านครบทุกวิชา', base_stars: 3 },
      { title: 'ช่วยงานบ้าน', description: 'ล้างจาน / กวาดบ้าน / รดน้ำต้นไม้', base_stars: 2 },
    ].forEach(m => {
      appendRow_('Missions', {
        mission_id: genId_(), family_id: familyId, title: m.title, description: m.description,
        base_stars: m.base_stars, multiplier: 1, is_active: true, created_by: 'system', created_at: new Date().toISOString()
      });
    });

    return { familyId, joinCode, familyName };
  }

  function getFamilyByCode_(joinCode) {
    return getAllRows_('Families').find(f => f.join_code === joinCode.toUpperCase()) || null;
  }

  function getFamilyInfo_(familyId) {
    return getAllRows_('Families').find(f => String(f.family_id) === String(familyId)) || null;
  }

  // เปิด/ปิดแจ้งเตือน LINE ตอนเด็กส่งภารกิจ (รายคน)
  function toggleSubmissionNotify(memberId, enabled) {
    requireParent_(memberId);
    updateRow_('Members', 'member_id', memberId, { notify_submission: enabled });
    return { notify_submission: enabled };
  }

  // ==========================================
  // MEMBERS
  // ==========================================
  function joinFamily(familyId, name, role, avatar) {
    if (!getFamilyInfo_(familyId)) throw new Error('ไม่พบครอบครัวนี้');
    if (role !== 'child' && role !== 'parent') throw new Error('บทบาทไม่ถูกต้อง');
    name = String(name || '').trim().slice(0, 40);
    if (!name) throw new Error('กรุณาใส่ชื่อ');
    const memberId = genId_();
    const webToken = genId_();
    appendRow_('Members', {
      member_id: memberId, family_id: familyId, name: name, role: role,
      avatar: avatar || (role === 'child' ? '🧒' : '👨‍👩‍👧'),
      line_user_id: '', web_token: webToken, created_at: new Date().toISOString()
    });
    return { memberId, familyId, name, role, avatar, webToken };
  }

  function getMember_(memberId) {
    return getAllRows_('Members').find(m => String(m.member_id) === String(memberId)) || null;
  }

  function getMemberByLineId_(lineUserId) {
    return getAllRows_('Members').find(m => m.line_user_id === lineUserId) || null;
  }

  function getMemberByWebToken(token) {
    return publicMember_(findMemberByToken_(token));
  }

  function findMemberByToken_(token) {
    if (!token) return null;
    return getAllRows_('Members').find(m => String(m.member_id) === String(token) || String(m.web_token) === String(token)) || null;
  }

  function getFamilyMembers_(familyId) {
    return getAllRows_('Members').filter(m => String(m.family_id) === String(familyId));
  }

  function updateMemberName_(memberId, newName) {
    return updateRow_('Members', 'member_id', memberId, { name: newName });
  }

  // ==========================================
  // MISSIONS
  // ==========================================
  function getMissions_(familyId) {
    return getAllRows_('Missions').filter(m => String(m.family_id) === String(familyId) && m.is_active === true);
  }

  function createMission_(familyId, title, description, baseStars, createdBy, icon) {
    const missionId = genId_();
    appendRow_('Missions', {
      mission_id: missionId, family_id: familyId, title: title, description: description || '',
      base_stars: Number(baseStars), multiplier: 1, icon: icon || '⭐', is_active: true, created_by: createdBy, created_at: new Date().toISOString()
    });
    return missionId;
  }

  function updateMission_(missionId, updates) { return updateRow_('Missions', 'mission_id', missionId, updates); }
  function deleteMission_(missionId) { return updateRow_('Missions', 'mission_id', missionId, { is_active: false }); }

  // ==========================================
  // SUBMISSIONS
  // ==========================================
  function submitMission(missionId, childId, familyId) {
    const childMember = requireChild_(childId);
    familyId = childMember.family_id;               // ใช้ครอบครัวจริงของเด็ก ไม่เชื่อค่าจากหน้าเว็บ
    const missions = getAllRows_('Missions');
    const mission = missions.find(m => String(m.mission_id) === String(missionId));
    if (!mission || String(mission.family_id) !== String(familyId) || mission.is_active !== true) throw new Error('ไม่พบภารกิจนี้');

    const submissionId = genId_();
    appendRow_('Submissions', {
      submission_id: submissionId, mission_id: missionId, child_id: childId, family_id: familyId,
      mission_title: mission.title, status: 'pending', stars_earned: 0,
      submitted_at: new Date().toISOString(), reviewed_by: '', reviewed_at: ''
    });

    // แจ้ง LINE ผู้ปกครอง ด้วย Flex Message + ปุ่มอนุมัติ
    const child = getMember_(childId);
    const childName = child ? child.name : 'น้อง';
    const childAvatar = child ? child.avatar : '🧒';
    const stars = Number(mission.base_stars) * Number(mission.multiplier || 1);
    const starsDisplay = Number(mission.multiplier) > 1
      ? `${mission.base_stars} x${mission.multiplier} = ${stars} ดาว`
      : `${stars} ดาว`;

    if (S.events) S.events.push({ type: 'submit', familyId: String(familyId), submissionId: submissionId, childName: childName,
      childAvatar: childAvatar, missionTitle: mission.title, starsDisplay: starsDisplay });   // แจ้งเตือนในแอป

    // ส่ง LINE เฉพาะผู้ปกครองที่เปิดแจ้งเตือนส่งภารกิจ (รายคน)
    const flexMsg = makeApprovalFlex_(submissionId, childName, childAvatar, mission.title, starsDisplay);
    const parents = getAllRows_('Members').filter(m => String(m.family_id) === String(familyId) && m.role === 'parent' && m.line_user_id);
    parents.forEach(function(p) {
      var ns = p.notify_submission;
      if (ns !== false && ns !== 'false' && ns !== 'FALSE') {
        try { linePush_(p.line_user_id, [flexMsg]); } catch(e) { console.error('Push error: ' + e.message); }
      }
    });

    return submissionId;
  }

  function getPendingSubmissions_(familyId) {
    return getAllRows_('Submissions').filter(s => String(s.family_id) === String(familyId) && s.status === 'pending');
  }

  function getChildSubmissions_(childId) {
    return getAllRows_('Submissions').filter(s => String(s.child_id) === String(childId));
  }

  function reviewSubmission(submissionId, status, reviewerId) {
    if (status !== 'approved' && status !== 'rejected') throw new Error('สถานะไม่ถูกต้อง');
    const sub = getAllRows_('Submissions').find(s => String(s.submission_id) === String(submissionId));
    if (!sub) throw new Error('ไม่พบการส่งนี้');
    requireParent_(reviewerId, sub.family_id);
    return reviewSubmission_(submissionId, status, reviewerId);
  }

  function reviewSubmission_(submissionId, status, reviewerId) {
    const submissions = getAllRows_('Submissions');
    const subId = String(submissionId);
    const sub = submissions.find(s => String(s.submission_id) === subId);
    if (!sub) throw new Error('ไม่พบการส่งนี้');
    if (sub.status !== 'pending') throw new Error('ภารกิจนี้ถูกตรวจแล้ว');

    let starsEarned = 0;
    if (status === 'approved') {
      const mission = getAllRows_('Missions').find(m => String(m.mission_id) === String(sub.mission_id));
      if (mission) starsEarned = Number(mission.base_stars) * Number(mission.multiplier || 1);
      else {   // ภารกิจด่วน: ดาวตามที่ผู้ปกครองตั้งตอนสร้าง
        var urg = getAllRows_('Urgent').find(function(u) { return String(u.urgent_id) === String(sub.mission_id); });
        if (urg) starsEarned = Number(urg.stars) || 0;
      }
      // ภารกิจประจำวัน: ผู้ปกครองอนุมัติ (นับภารกิจด่วนด้วย) · เด็กทำภารกิจทั่วไป/ด่วน/คูณดาว (นับตอนอนุมัติ)
      questBump_(sub.family_id, 'parents', 'approve');
      if (mission) {
        questBump_(sub.family_id, String(sub.child_id), 'kid_submit');
        if (Number(mission.multiplier) > 1) questBump_(sub.family_id, String(sub.child_id), 'kid_multi');
      } else if (urg) questBump_(sub.family_id, String(sub.child_id), 'kid_urgent');
      eggOnApprove_(sub.family_id, String(sub.child_id));
    }

    // หาชื่อผู้ปกครองจาก reviewerId (member_id)
    var reviewer = getMember_(reviewerId);
    var reviewerName = reviewer ? reviewer.name : 'ผู้ปกครอง';

    updateRow_('Submissions', 'submission_id', subId, {
      status: status, stars_earned: starsEarned, reviewed_by: reviewerId, reviewed_at: new Date().toISOString()
    });

    // [ตัดออก] แจ้งผู้ปกครองคนอื่นผ่าน LINE ตอนอนุมัติ — ประหยัดโควต้า LINE ~120 msg/เดือน

    return { status: status, starsEarned: starsEarned, childId: sub.child_id, missionTitle: sub.mission_title, reviewerName: reviewerName };
  }

  function quickApprove_(submissionId, lineUserId) {
    const subId = String(submissionId);
    const sub = getAllRows_('Submissions').find(s => String(s.submission_id) === subId);
    if (!sub) return { error: 'ไม่พบการส่งนี้' };
    if (sub.status !== 'pending') return { error: 'ภารกิจนี้ถูกตรวจแล้ว (' + sub.status + ')' };

    // หาชื่อผู้ปกครองที่กดอนุมัติ
    var reviewer = findParentByLineInFamily_(lineUserId, sub.family_id);
    if (!reviewer) return { error: 'บัญชี LINE นี้ไม่ใช่ผู้ปกครองของครอบครัวนี้' };
    var reviewerName = reviewer.name;
    var reviewerId = reviewer.member_id;

    var result = reviewSubmission_(submissionId, 'approved', reviewerId);
    result.reviewerName = reviewerName;
    return result;
  }

  function quickReject_(submissionId, lineUserId) {
    const subId = String(submissionId);
    const sub = getAllRows_('Submissions').find(s => String(s.submission_id) === subId);
    if (!sub) return { error: 'ไม่พบการส่งนี้' };
    if (sub.status !== 'pending') return { error: 'ภารกิจนี้ถูกตรวจแล้ว (' + sub.status + ')' };

    var reviewer = findParentByLineInFamily_(lineUserId, sub.family_id);
    if (!reviewer) return { error: 'บัญชี LINE นี้ไม่ใช่ผู้ปกครองของครอบครัวนี้' };
    var reviewerName = reviewer.name;
    var reviewerId = reviewer.member_id;

    var result = reviewSubmission_(submissionId, 'rejected', reviewerId);
    return { success: true, missionTitle: sub.mission_title, reviewerName: reviewerName };
  }

  // หาสมาชิกจาก LINE user ID
  function findMemberByLineId_(lineUserId) {
    return getAllRows_('Members').find(function(m) { return m.line_user_id === lineUserId; }) || null;
  }

  // แจ้ง LINE หาผู้ปกครองคนอื่น (ยกเว้นคนที่กดเอง)
  function notifyOtherParents_(familyId, excludeLineUserId, messages) {
    var members = getAllRows_('Members');
    var otherParents = members.filter(function(m) {
      return String(m.family_id) === String(familyId) && m.role === 'parent' && m.line_user_id && m.line_user_id !== excludeLineUserId;
    });
    otherParents.forEach(function(p) {
      try { linePush_(p.line_user_id, messages); }
      catch(e) { console.error('Push error for ' + p.name + ': ' + e.message); }
    });
  }

  // ==========================================
  // REWARDS
  // ==========================================
  function getRewards_(familyId) {
    return getAllRows_('Rewards').filter(r => String(r.family_id) === String(familyId) && r.is_active === true);
  }

  function getRewardsForChild_(familyId) {
    return getRewards_(familyId).map(r => ({
      reward_id: r.reward_id, title: r.title, description: r.description,
      stars_cost: r.stars_cost, type: r.type, quantity: r.quantity, icon: r.icon || '🎁', has_secret: !!r.secret_data
    }));
  }

  function createReward_(familyId, title, description, starsCost, type, secretData, quantity, createdBy, icon) {
    const rewardId = genId_();
    appendRow_('Rewards', {
      reward_id: rewardId, family_id: familyId, title: title, description: description || '',
      stars_cost: Number(starsCost), type: type || 'physical', secret_data: secretData || '',
      quantity: Number(quantity) || 1, icon: icon || '🎁', is_active: true, created_by: createdBy, created_at: new Date().toISOString()
    });
    return rewardId;
  }

  function updateReward_(rewardId, updates) { return updateRow_('Rewards', 'reward_id', rewardId, updates); }
  function deleteReward_(rewardId) { return updateRow_('Rewards', 'reward_id', rewardId, { is_active: false }); }

  // ==========================================
  // REDEMPTIONS
  // ==========================================
  function redeemReward(rewardId, childId, familyId) {
    // ล็อกกันกดแลกซ้ำพร้อมกัน (ไม่งั้นดาวติดลบ / จำนวนรางวัลลดเกิน)
    const lock = NO_LOCK;
    lock.waitLock(15000);
    try {
      clearCache_();
      return redeemRewardLocked_(rewardId, childId);
    } finally {
      lock.releaseLock();
    }
  }

  function redeemRewardLocked_(rewardId, childId) {
    const childMember = requireChild_(childId);
    const familyId = childMember.family_id;
    const reward = getAllRows_('Rewards').find(r => String(r.reward_id) === String(rewardId));
    if (!reward || String(reward.family_id) !== String(familyId) || reward.is_active !== true) throw new Error('ไม่พบรางวัลนี้');
    if (Number(reward.quantity) <= 0) throw new Error('รางวัลหมดแล้ว');
    const balance = getStarBalance_(childId);
    if (balance < Number(reward.stars_cost)) throw new Error('ดาวไม่พอ');

    const redemptionId = genId_();
    const secretToReveal = reward.type === 'digital' && reward.secret_data ? reward.secret_data : '';
    appendRow_('Redemptions', {
      redemption_id: redemptionId, reward_id: rewardId, child_id: childId, family_id: familyId,
      reward_title: reward.title, stars_spent: reward.stars_cost, secret_revealed: secretToReveal, redeemed_at: new Date().toISOString()
    });
    updateRow_('Rewards', 'reward_id', rewardId, { quantity: Number(reward.quantity) - 1 });

    // แจ้ง LINE
    const child = getMember_(childId);
    const childName = child ? child.name : 'น้อง';
    if (S.events) S.events.push({ type: 'redeem', familyId: String(familyId), childName: childName, rewardTitle: reward.title, stars: reward.stars_cost });
    notifyParentsLine_(familyId, [{
      type: 'text',
      text: `🎁 ${childName} แลกรางวัล "${reward.title}" (${reward.stars_cost} ดาว)`
    }]);

    return { redemptionId, secretToReveal, rewardTitle: reward.title };
  }

  function getChildRedemptions_(childId) {
    return getAllRows_('Redemptions').filter(r => String(r.child_id) === String(childId));
  }

  // ดึงรายการแลกรางวัลที่ยังไม่รับทราบ (สำหรับแจ้งเตือนในแอพผู้ปกครอง)
  function getUnacknowledgedRedemptions_(familyId) {
    var redemptions = getAllRows_('Redemptions').filter(function(r) {
      return String(r.family_id) === String(familyId) && !r.acknowledged_at;
    });
    redemptions.sort(function(a, b) { return new Date(b.redeemed_at) - new Date(a.redeemed_at); });
    return redemptions.map(function(r) {
      var child = getMember_(r.child_id);
      return {
        redemption_id: r.redemption_id,
        child_name: child ? child.name : 'น้อง',
        child_avatar: child ? child.avatar : '👤',
        reward_title: r.reward_title,
        stars_spent: r.stars_spent,
        redeemed_at: r.redeemed_at
      };
    });
  }

  // ผู้ปกครองกด "รับทราบแล้ว" — อัปเดต acknowledged_at ให้ทุกรายการที่ยังไม่รับทราบ
  function acknowledgeRedemptions(familyId, parentId) {
    familyId = requireParent_(parentId).family_id;
    var redemptions = getAllRows_('Redemptions').filter(function(r) {
      return String(r.family_id) === String(familyId) && !r.acknowledged_at;
    });
    var now = new Date().toISOString();
    redemptions.forEach(function(r) {
      updateRow_('Redemptions', 'redemption_id', r.redemption_id, {
        acknowledged_at: now, acknowledged_by: parentId
      });
    });
    return { acknowledged: redemptions.length };
  }

  // ==========================================
  // STAR BALANCE
  // ==========================================
  // ยอดภารกิจของเด็ก: ใช้ยอดสรุปจากฐานข้อมูล (เร็ว ไม่ต้องอ่านทุกแถว) ถ้ามี ไม่งั้นบวกเองแบบเดิม
  function subAgg_(childId) {
    var a = S.store && S.store.childAgg ? S.store.childAgg(childId) : null;
    if (a) return a;
    const mine = getAllRows_('Submissions').filter(s => String(s.child_id) === String(childId));
    const approved = mine.filter(s => s.status === 'approved');
    return {
      earned: approved.reduce((sum, s) => sum + Number(s.stars_earned || 0), 0),
      approved: approved.length,
      pending: mine.filter(s => s.status === 'pending').length
    };
  }

  function getStarBalance_(childId) {
    const earned = subAgg_(childId).earned;
    const spent = getAllRows_('Redemptions')
      .filter(r => String(r.child_id) === String(childId))
      .reduce((sum, r) => sum + Number(r.stars_spent || 0), 0);
    return earned + getWheelStars_(childId) + getGiftStars_(childId) - spent;
  }

  // ดาวจากของขวัญที่เปิดแล้ว (ไม่นับเป็นภารกิจ · ไม่นับในวันสะสมกงล้อ)
  function getGiftStars_(childId) {
    var g = S.store && S.store.giftStars ? S.store.giftStars(childId) : null;
    if (g !== null && g !== undefined) return g;
    return getAllRows_('Gifts').filter(function(x) { return String(x.child_id) === String(childId) && x.status === 'opened'; })
      .reduce(function(sum, x) { return sum + Number(x.stars || 0); }, 0);
  }

  function getChildStats_(childId) {
    const agg = subAgg_(childId);
    const wheelStars = getWheelStars_(childId);
    const giftStars = getGiftStars_(childId);
    const totalEarned = agg.earned + wheelStars + giftStars;
    const totalSpent = getAllRows_('Redemptions').filter(r => String(r.child_id) === String(childId))
      .reduce((sum, r) => sum + Number(r.stars_spent || 0), 0);
    return {
      balance: totalEarned - totalSpent, totalEarned, totalSpent, wheelStars, giftStars,
      missionsCompleted: agg.approved,
      pendingCount: agg.pending
    };
  }

  // ==========================================
  // DASHBOARD DATA (Web App)
  // ==========================================
  function getChildDashboard(memberId) {
    const member = getMember_(memberId);
    if (!member) throw new Error('ไม่พบสมาชิก');
    const familyId = member.family_id;
    const family = getFamilyInfo_(familyId);
    const wheel = syncChildWheel_(member, family);   // ก่อน stats: อาจเพิ่มสิทธิ์หมุนใหม่
    urgentSweep(familyId);
    return {
      urgent: childUrgent_(member), gifts: childGifts_(member), daily: dailyFor_(member), avatars: familyAvatars_(familyId), stage: familyStage_(familyId), egg: eggView_(member),
      member, family: family, wheel: wheel, stats: getChildStats_(memberId),
      missions: getMissions_(familyId), rewards: getRewardsForChild_(familyId),
      recentSubmissions: getChildSubmissions_(memberId).slice(-20).reverse(),
      recentRedemptions: getChildRedemptions_(memberId).slice(-10).reverse()
    };
  }

  // ดึงประวัติการอนุมัติ/ปฏิเสธล่าสุด (20 รายการ)
  function getReviewHistory_(familyId) {
    var submissions = getAllRows_('Submissions').filter(function(s) {
      return String(s.family_id) === String(familyId) && (s.status === 'approved' || s.status === 'rejected') && s.reviewed_at;
    });
    submissions.sort(function(a, b) { return new Date(b.reviewed_at) - new Date(a.reviewed_at); });
    return submissions.slice(0, 20).map(function(s) {
      var child = getMember_(s.child_id);
      var reviewer = getMember_(s.reviewed_by);
      var reviewerName = 'ผู้ปกครอง';
      var reviewerAvatar = '👤';
      if (s.reviewed_by === 'line-approve') {
        reviewerName = 'อนุมัติผ่าน LINE';
        reviewerAvatar = '💬';
      } else if (reviewer) {
        reviewerName = reviewer.name;
        reviewerAvatar = reviewer.avatar || '👤';
      }
      return {
        submission_id: s.submission_id,
        mission_title: s.mission_title,
        child_name: child ? child.name : 'น้อง',
        child_avatar: child ? child.avatar : '👤',
        reviewer_name: reviewerName,
        reviewer_avatar: reviewerAvatar,
        status: s.status,
        stars_earned: s.stars_earned,
        reviewed_at: s.reviewed_at
      };
    });
  }

  // ดึงประวัติแลกรางวัลทั้งหมดของครอบครัว (20 รายการล่าสุด)
  function getRedemptionHistory_(familyId) {
    var redemptions = getAllRows_('Redemptions').filter(function(r) {
      return String(r.family_id) === String(familyId);
    });
    redemptions.sort(function(a, b) { return new Date(b.redeemed_at) - new Date(a.redeemed_at); });
    return redemptions.slice(0, 20).map(function(r) {
      var child = getMember_(r.child_id);
      return {
        redemption_id: r.redemption_id,
        child_name: child ? child.name : 'น้อง',
        child_avatar: child ? child.avatar : '👤',
        reward_title: r.reward_title,
        stars_spent: r.stars_spent,
        redeemed_at: r.redeemed_at,
        acknowledged_at: r.acknowledged_at || null,
        acknowledged_by: r.acknowledged_by || null,
        acknowledged_name: r.acknowledged_by ? (function() { var m = getMember_(r.acknowledged_by); return m ? m.name : '?'; })() : null
      };
    });
  }

  function getParentDashboard(memberId) {
    const member = requireParent_(memberId);
    const familyId = member.family_id;
    const members = getFamilyMembers_(familyId);
    const wheel = getWheelParentInfo_(familyId);
    urgentSweep(familyId);
    const urgent = parentUrgent_(familyId);
    const children = members.filter(m => m.role === 'child').map(c => ({
      ...c, stats: getChildStats_(c.member_id)
    }));
    return {
      member, family: getFamilyInfo_(familyId), missions: getMissions_(familyId),
      pending: getPendingSubmissions_(familyId), rewards: getRewards_(familyId), members, children,
      recentRedemptions: getUnacknowledgedRedemptions_(familyId),
      reviewHistory: getReviewHistory_(familyId),
      redemptionHistory: getRedemptionHistory_(familyId),
      wheel: wheel, urgent: urgent, gifts: parentGifts_(familyId), serverNow: new Date(nowMs_()).toISOString(),
      daily: dailyFor_(member), avatars: familyAvatars_(familyId), stage: familyStage_(familyId), egg: eggView_(member),
      newsSeen: member.news_seen == null || member.news_seen === '' ? -1 : Number(member.news_seen)
    };
  }

  // ==========================================
  // WEB APP: REGISTRATION & AUTH
  // ==========================================

  // สร้างครอบครัวใหม่จากเว็บ + สร้างสมาชิกผู้ปกครอง
  function webRegister(familyName, parentName, avatar) {
    // createFamily_ / joinFamily คืนค่าเป็น object — ต้องดึง id ออกมา
    const created = createFamily_(String(familyName || '').trim().slice(0, 60));
    const familyId = created.familyId;
    const family = getAllRows_('Families').find(f => String(f.family_id) === String(familyId));
    const memberId = joinFamily(familyId, parentName, 'parent', avatar || '👨').memberId;
    return {
      memberId: memberId, familyId: familyId, name: parentName,
      role: 'parent', avatar: avatar || '👨',
      familyName: family ? family.family_name : familyName,
      joinCode: family ? family.join_code : ''
    };
  }

  // เข้าร่วมครอบครัวจากเว็บ (สำหรับคนที่เคยมีรหัสอยู่แล้ว)
  function webJoinFamily(joinCode, name, role, avatar) {
    const family = getFamilyByCode_(joinCode);
    if (!family) throw new Error('ไม่พบครอบครัวนี้');
    const memberId = joinFamily(family.family_id, name, role || 'child', avatar || '🧒').memberId;
    return {
      memberId: memberId, familyId: family.family_id, name: name,
      role: role || 'child', avatar: avatar || '🧒',
      familyName: family.family_name, joinCode: family.join_code
    };
  }

  // บันทึกภารกิจจากเว็บ (เพิ่ม/แก้ไข) รองรับ icon
  function webSaveMission(familyId, memberId, data) {
    familyId = requireParent_(memberId).family_id;
    if (data.mission_id) {
      requireOwnRecord_('Missions', 'mission_id', data.mission_id, familyId);
      // แก้ไข
      updateMission_(data.mission_id, {
        title: data.title, description: data.description || '',
        base_stars: Number(data.base_stars) || 1,
        multiplier: Number(data.multiplier) || 1,
        icon: data.icon || '⭐'
      });
      return { success: true, mission_id: data.mission_id };
    } else {
      // สร้างใหม่
      const id = createMission_(familyId, data.title, data.description, data.base_stars || 1, memberId, data.icon || '⭐');
      return { success: true, mission_id: id };
    }
  }

  // บันทึกรางวัลจากเว็บ (เพิ่ม/แก้ไข) รองรับ icon
  function webSaveReward(familyId, memberId, data) {
    familyId = requireParent_(memberId).family_id;
    if (data.reward_id) {
      requireOwnRecord_('Rewards', 'reward_id', data.reward_id, familyId);
      // แก้ไข
      updateReward_(data.reward_id, {
        title: data.title, description: data.description || '',
        stars_cost: Number(data.stars_cost) || 1,
        type: data.type || 'physical', secret_data: data.secret_data || '',
        quantity: Number(data.quantity) || 1, icon: data.icon || '🎁'
      });
      return { success: true, reward_id: data.reward_id };
    } else {
      // สร้างใหม่
      const id = createReward_(familyId, data.title, data.description, data.stars_cost || 10,
        data.type || 'physical', data.secret_data || '', data.quantity || 1, memberId, data.icon || '🎁');
      return { success: true, reward_id: id };
    }
  }

  // ลบภารกิจจากเว็บ
  function webDeleteMission(missionId, memberId) {
    requireOwnRecord_('Missions', 'mission_id', missionId, requireParent_(memberId).family_id);
    deleteMission_(missionId);
    return { success: true };
  }

  // ลบรางวัลจากเว็บ
  function webDeleteReward(rewardId, memberId) {
    requireOwnRecord_('Rewards', 'reward_id', rewardId, requireParent_(memberId).family_id);
    deleteReward_(rewardId);
    return { success: true };
  }

  function requireOwnRecord_(sheet, idField, id, familyId) {
    var rec = getAllRows_(sheet).find(function(r) { return String(r[idField]) === String(id); });
    if (!rec || String(rec.family_id) !== String(familyId)) throw new Error('ไม่พบรายการนี้');
    return rec;
  }

  // ค้นหาครอบครัว + ลิสต์เด็กที่มีอยู่ (สำหรับเลือกโปรไฟล์เดิม)
  function webLookupFamily(joinCode) {
    const family = getFamilyByCode_(joinCode);
    if (!family) throw new Error('ไม่พบครอบครัวนี้');
    const members = getFamilyMembers_(family.family_id);
    const children = members.filter(function(m) { return m.role === 'child'; }).map(function(c) {
      var stats = getChildStats_(c.member_id);
      return {
        member_id: c.member_id,
        name: c.name,
        avatar: c.avatar,
        stars: stats.balance
      };
    });
    return {
      family_id: family.family_id,
      family_name: family.family_name,
      join_code: family.join_code,
      children: children
    };
  }

  // เชื่อมต่อกลับเข้าสมาชิกเดิม (reconnect)
  function webReconnect(memberId) {
    var member = getMember_(memberId);
    if (!member) throw new Error('ไม่พบสมาชิก');
    return {
      memberId: member.member_id,
      familyId: member.family_id,
      name: member.name,
      role: member.role,
      avatar: member.avatar
    };
  }

  // ==========================================
  // DAILY LOG & SUMMARY
  // ==========================================

  // เรียกจากเว็บ: ดูสรุปรายวันย้อนหลัง
  function getDailySummary(familyId, days, memberId) {
    familyId = requireParent_(memberId, familyId).family_id;
    days = Math.min(Number(days) || 7, 60);
    var members = getAllRows_('Members').filter(function(m) { return String(m.family_id) === String(familyId) && m.role === 'child'; });
    var submissions = getAllRows_('Submissions').filter(function(s) { return String(s.family_id) === String(familyId) && s.status === 'approved'; });
    var redemptions = getAllRows_('Redemptions').filter(function(r) { return String(r.family_id) === String(familyId); });

    var now = new Date();
    var result = [];

    for (var d = 0; d < days; d++) {
      var dateStr = addDaysKey_(thaiDateKey_(now), -d);

      var dayData = { date: dateStr, children: [] };
      members.forEach(function(child) {
        var daySubs = submissions.filter(function(s) {
          return String(s.child_id) === String(child.member_id) && formatDate_(new Date(s.reviewed_at)) === dateStr;
        });
        var dayRedeem = redemptions.filter(function(r) {
          return String(r.child_id) === String(child.member_id) && formatDate_(new Date(r.redeemed_at)) === dateStr;
        });
        var daySpins = getSpinRows_().filter(function(x) {
          return String(x.child_id) === String(child.member_id) && x.used_at && formatDate_(new Date(x.used_at)) === dateStr;
        });
        var earned = daySubs.reduce(function(sum, s) { return sum + Number(s.stars_earned || 0); }, 0) +
          daySpins.reduce(function(sum, x) { return sum + Number(x.prize_stars || 0); }, 0);
        var spent = dayRedeem.reduce(function(sum, r) { return sum + Number(r.stars_spent || 0); }, 0);
        var stats = getChildStats_(child.member_id);
        dayData.children.push({
          member_id: child.member_id, name: child.name, avatar: child.avatar,
          earned: earned, spent: spent, missions: daySubs.length,
          balance: stats.balance
        });
      });
      result.push(dayData);
    }
    return result;
  }

  // 📊 สรุปประจำสัปดาห์ (ผู้ปกครอง): 7 วันจบที่ endKey (จันทร์–อาทิตย์) เทียบกับ 7 วันก่อนหน้า · ต่อลูกแต่ละคน
  function getWeeklySummary(memberId, endKey) {
    var familyId = requireParent_(memberId).family_id;
    endKey = /^\d{4}-\d{2}-\d{2}$/.test(String(endKey || '')) ? String(endKey) : thaiDateKey_(new Date(nowMs_()));
    var startKey = addDaysKey_(endKey, -6), prevStart = addDaysKey_(endKey, -13), prevEnd = addDaysKey_(endKey, -7);
    var days = []; for (var i = 0; i < 7; i++) days.push(addDaysKey_(startKey, i));
    var kids = getAllRows_('Members').filter(function(m) { return String(m.family_id) === String(familyId) && m.role === 'child'; });
    var missions = getAllRows_('Missions').filter(function(m) { return String(m.family_id) === String(familyId) && m.is_active === true; });
    var mById = {}; missions.forEach(function(m) { mById[String(m.mission_id)] = m; });
    var subs = getAllRows_('Submissions').filter(function(s) { return String(s.family_id) === String(familyId) && s.status === 'approved' && s.reviewed_at; });
    var urg = urgentRows_(familyId);
    var inR = function(k, a, b) { return k && k >= a && k <= b; };
    return { start: startKey, end: endKey, kids: kids.map(function(c) {
      var mine = subs.filter(function(s) { return String(s.child_id) === String(c.member_id); });
      var wk = mine.filter(function(s) { return inR(thaiDateKey_(s.reviewed_at), startKey, endKey); });
      var pv = mine.filter(function(s) { return inR(thaiDateKey_(s.reviewed_at), prevStart, prevEnd); });
      var sum = function(a) { return a.reduce(function(t, s) { return t + (Number(s.stars_earned) || 0); }, 0); };
      var perDay = days.map(function(k) { return wk.filter(function(s) { return thaiDateKey_(s.reviewed_at) === k; }).length; });
      // ภารกิจปกติ (ไม่นับภารกิจด่วน) · นับครั้ง + จำนวนวันที่ทำ
      var cnt = {};
      wk.forEach(function(s) { var m = mById[String(s.mission_id)]; if (!m) return;
        var x = cnt[m.mission_id] || (cnt[m.mission_id] = { title: m.title, icon: m.icon || '⭐', n: 0, days: {} }); x.n++; x.days[thaiDateKey_(s.reviewed_at)] = 1; });
      var top = Object.keys(cnt).map(function(k) { var x = cnt[k]; return { title: x.title, icon: x.icon, n: x.n, days: Object.keys(x.days).length }; })
        .sort(function(a, b) { return b.n - a.n; }).slice(0, 3);
      var low = missions.filter(function(m) { return !cnt[m.mission_id]; }).map(function(m) { return { title: m.title, icon: m.icon || '⭐' }; }).slice(0, 3);
      var u = urg.filter(function(x) { return String(x.child_id) === String(c.member_id) && inR(thaiDateKey_(x.created_at), startKey, endKey) && x.status !== 'cancelled' && x.status !== 'pending' && x.status !== 'running'; });
      return { member_id: c.member_id, name: c.name, avatar: c.avatar,
        missions: wk.length, stars: sum(wk), prevMissions: pv.length, prevStars: sum(pv), perDay: perDay, top: top, low: low,
        urgentTotal: u.length, urgentOnTime: u.filter(function(x) { return x.status === 'submitted'; }).length };
    }) };
  }

  function formatDate_(d) { return thaiDateKey_(d); }   // เวลาไทยเสมอ (Worker ใช้ UTC)

  // Trigger: บันทึก snapshot ดาวประจำวัน (ตั้ง Trigger ให้รันทุกวัน)
  function saveDailySnapshot() {
    var today = formatDate_(new Date());
    var families = getAllRows_('Families');
    var allMembers = getAllRows_('Members');

    families.forEach(function(fam) {
      var children = allMembers.filter(function(m) { return String(m.family_id) === String(fam.family_id) && m.role === 'child'; });
      children.forEach(function(child) {
        var stats = getChildStats_(child.member_id);
        var submissions = getAllRows_('Submissions').filter(function(s) {
          return String(s.child_id) === String(child.member_id) && s.status === 'approved' && formatDate_(new Date(s.reviewed_at)) === today;
        });
        var redemptions = getAllRows_('Redemptions').filter(function(r) {
          return String(r.child_id) === String(child.member_id) && formatDate_(new Date(r.redeemed_at)) === today;
        });
        var earnedToday = submissions.reduce(function(sum, s) { return sum + Number(s.stars_earned || 0); }, 0);
        var spentToday = redemptions.reduce(function(sum, r) { return sum + Number(r.stars_spent || 0); }, 0);

        appendRow_('DailyLog', {
          log_id: 'log-' + today + '-' + child.member_id,
          family_id: fam.family_id,
          date: today,
          child_id: child.member_id,
          child_name: child.name,
          stars_earned_today: earnedToday,
          stars_spent_today: spentToday,
          balance: stats.balance,
          missions_completed_today: submissions.length,
          logged_at: new Date().toISOString()
        });
      });
    });
  }

  // ดูประวัติจาก DailyLog sheet (backup)
  function getDailyLogHistory_(familyId, limit) {
    limit = limit || 30;
    var logs = getAllRows_('DailyLog').filter(function(l) { return String(l.family_id) === String(familyId); });
    logs.sort(function(a, b) { return b.date > a.date ? 1 : -1; });
    return logs.slice(0, limit);
  }

  // ==========================================
  // LUCKY STAR WHEEL (กงล้อดาวนำโชค)
  // ==========================================
  // กติกา: วันไหนมีภารกิจ "อนุมัติแล้ว" อย่างน้อย 1 อัน (นับตามวันที่ส่ง เวลาไทย) = 1 วัน
  // ครบ 5 วันติดกัน = สิทธิ์หมุน 1 ครั้ง แล้วเริ่มนับใหม่ · ขาดวัน = เริ่ม 0
  // วันที่ยังรออนุมัติไม่นับ แต่ก็ไม่ทำให้ขาด · เริ่มนับตั้งแต่วันที่ผู้ปกครองกดเปิด (นับทั้งวัน)
  // สิทธิ์ที่ได้เก็บสะสมได้ ไม่หมดอายุ ใช้ได้เฉพาะตอนกิจกรรมเปิดอยู่
  var WHEEL_DEFAULT_PRIZES = [1, 2, 3, 2, 5, 1, 3, 10];
  var WHEEL_ROUND_DAYS = 5;
  var SPINS_HEADERS = ['spin_id','child_id','family_id','round_key','earned_at','used_at','prize_stars','prize_index','request_id'];
  var WHEEL_FAMILY_COLS = ['wheel_enabled','wheel_started_at','wheel_prizes'];

  // วันที่ตามเวลาไทย 'yyyy-MM-dd' (ไม่พึ่ง timezone ของ Sheet)
  function thaiDateKey_(d) {
    if (d === '' || d === null || d === undefined) return '';
    var t = (d instanceof Date) ? d : new Date(d);
    if (isNaN(t.getTime())) return '';
    return new Date(t.getTime() + 7 * 3600 * 1000).toISOString().slice(0, 10);
  }
  function addDaysKey_(key, n) {
    var d = new Date(key + 'T00:00:00Z');
    d.setUTCDate(d.getUTCDate() + n);
    return d.toISOString().slice(0, 10);
  }
  function isTrue_(v) { return v === true || String(v).toUpperCase() === 'TRUE'; }
  function isoNoMs_(d) { return (d || new Date()).toISOString().replace(/\.\d{3}Z$/, 'Z'); }

  // สร้างชีต Spins + คอลัมน์ใน Families ให้อัตโนมัติ ถ้ายังไม่มี
  function ensureWheelSchema_() {}   // D1 มีตาราง Spins และคอลัมน์กงล้อครบแล้ว

  function getSpinRows_() {
    return getAllRows_('Spins');
  }

  function wheelSettings_(family) {
    var prizes = WHEEL_DEFAULT_PRIZES.slice();
    if (family && family.wheel_prizes) {
      try {
        var p = JSON.parse(String(family.wheel_prizes));
        if (Array.isArray(p) && p.length === 8 && p.every(function(x) { return Number(x) >= 1; })) {
          prizes = p.map(function(x) { return Math.round(Number(x)); });
        }
      } catch (e) {}
    }
    var raw = family ? family.wheel_started_at : '';
    var started = raw ? new Date(raw) : null;
    var validStart = started && !isNaN(started.getTime());
    return {
      enabled: !!(family && isTrue_(family.wheel_enabled) && validStart),
      prizes: prizes,
      startedAt: validStart ? isoNoMs_(started) : '',
      startKey: validStart ? thaiDateKey_(started) : ''
    };
  }

  // คำนวณความคืบหน้าของเด็ก 1 คน (ไม่เขียนอะไรลงชีต)
  // excludeSubId: ใช้จำลองว่า "ถ้าปฏิเสธภารกิจนี้" จะเป็นยังไง
  function computeWheelProgress_(childId, family, excludeSubId, todayKey) {
    var ws = wheelSettings_(family);
    todayKey = todayKey || thaiDateKey_(new Date());
    var res = { run: 0, pendingCount: 0, todayStatus: 'none', broke: false, newRounds: [], lastEnd: '' };
    if (!ws.enabled) return res;

    // รอบที่ได้สิทธิ์ไปแล้วในการเปิดกิจกรรมครั้งนี้ → นับต่อจากวันถัดไป (กันได้สิทธิ์ซ้ำ)
    var lastEnd = '';
    getSpinRows_().forEach(function(s) {
      if (String(s.child_id) !== String(childId)) return;
      var p = String(s.round_key || '').split('|');
      if (p[0] === ws.startedAt && p[1] > lastEnd) lastEnd = p[1];
    });
    res.lastEnd = lastEnd;
    var from = lastEnd ? addDaysKey_(lastEnd, 1) : ws.startKey;

    var approved = {}, pending = {};
    getAllRows_('Submissions').forEach(function(s) {
      if (String(s.child_id) !== String(childId)) return;
      if (excludeSubId && String(s.submission_id) === String(excludeSubId)) return;
      var k = thaiDateKey_(s.submitted_at);
      if (!k || k < from) return;
      if (s.status === 'approved') approved[k] = true;
      else if (s.status === 'pending') pending[k] = true;
    });

    var run = 0, pend = 0, broke = false;
    for (var d = from; d <= todayKey; d = addDaysKey_(d, 1)) {
      if (approved[d]) {
        run++; broke = false;
        if (run === WHEEL_ROUND_DAYS) { res.newRounds.push(d); run = 0; pend = 0; }
      } else if (pending[d]) {
        pend++; broke = false;
      } else if (d < todayKey) {
        if (run > 0 || pend > 0) broke = true;
        run = 0; pend = 0;
      }
    }
    res.run = run;
    res.pendingCount = pend;
    res.broke = broke;
    res.todayStatus = approved[todayKey] ? 'approved' : (pending[todayKey] ? 'pending' : 'none');
    return res;
  }

  // คำนวณ + บันทึกสิทธิ์หมุนที่เพิ่งได้ (เรียกตอนโหลดหน้า) แล้วคืนสถานะสำหรับหน้าจอ
  function syncChildWheel_(child, family) {
    var ws = wheelSettings_(family);
    if (!ws.enabled) return { enabled: false };
    var lock = NO_LOCK;
    var locked = false;
    try { locked = lock.tryLock(8000); } catch (e) {}
    try {
      var prog = computeWheelProgress_(child.member_id, family);
      if (prog.newRounds.length && locked) {
        var existing = {};
        getSpinRows_().forEach(function(s) { existing[String(s.round_key)] = true; });
        prog.newRounds.forEach(function(endKey) {
          var key = ws.startedAt + '|' + endKey;
          if (existing[key]) return;
          appendRow_('Spins', {
            spin_id: genId_(), child_id: child.member_id, family_id: child.family_id,
            round_key: key, earned_at: isoNoMs_(), used_at: '', prize_stars: '', prize_index: '', request_id: ''
          });
        });
      }
      var mine = getSpinRows_().filter(function(s) { return String(s.child_id) === String(child.member_id); });
      var used = mine.filter(function(s) { return s.used_at; })
        .sort(function(a, b) { return new Date(b.used_at) - new Date(a.used_at); });
      return {
        enabled: true, prizes: ws.prizes, startedAt: ws.startedAt,
        run: prog.run, pendingCount: prog.pendingCount, todayStatus: prog.todayStatus, broke: prog.broke,
        spins: mine.filter(function(s) { return !s.used_at; }).length,
        // ป๊อปอัปครบ 5 วัน: สิทธิ์ล่าสุดที่ได้หลังจากเห็นครั้งก่อน
        lastEarned: mine.reduce(function(m, s) { var e = String(s.earned_at || ''); return e > m ? e : m; }, ''),
        treeSeen: String(child.tree_seen || ''),
        history: used.slice(0, 10).map(function(s) { return { stars: Number(s.prize_stars || 0), used_at: s.used_at }; })
      };
    } finally {
      if (locked) lock.releaseLock();
    }
  }

  function getWheelStars_(childId) {
    return getSpinRows_()
      .filter(function(s) { return String(s.child_id) === String(childId) && s.used_at; })
      .reduce(function(sum, s) { return sum + Number(s.prize_stars || 0); }, 0);
  }

  // เด็กกดหมุน: สุ่มที่เซิร์ฟเวอร์ · requestId กันกดซ้ำ/ส่งซ้ำตอนเน็ตหลุด
  function spinWheel(childId, requestId) {
    var lock = NO_LOCK;
    lock.waitLock(15000);
    try {
      clearCache_('Spins');
      var child = getMember_(childId);
      if (!child || child.role !== 'child') throw new Error('ไม่พบสมาชิก');
      var ws = wheelSettings_(getFamilyInfo_(child.family_id));
      if (!ws.enabled) throw new Error('กิจกรรมกงล้อปิดอยู่');
      var mine = getSpinRows_().filter(function(s) { return String(s.child_id) === String(childId); });

      if (requestId) {
        var done = mine.find(function(s) { return s.used_at && String(s.request_id) === String(requestId); });
        if (done) {
          return { index: Number(done.prize_index), stars: Number(done.prize_stars), prizes: ws.prizes,
            spinsLeft: mine.filter(function(s) { return !s.used_at; }).length, balance: getStarBalance_(childId) };
        }
      }
      var avail = mine.filter(function(s) { return !s.used_at; })
        .sort(function(a, b) { return new Date(a.earned_at) - new Date(b.earned_at); });
      if (!avail.length) throw new Error('ยังไม่มีสิทธิ์หมุน');

      var idx = Math.floor(Math.random() * ws.prizes.length);
      var stars = ws.prizes[idx];
      updateRow_('Spins', 'spin_id', avail[0].spin_id, {
        used_at: isoNoMs_(), prize_stars: stars, prize_index: idx, request_id: requestId || ''
      });
      return { index: idx, stars: stars, prizes: ws.prizes, spinsLeft: avail.length - 1, balance: getStarBalance_(childId) };
    } finally {
      lock.releaseLock();
    }
  }

  function requireParent_(memberId, familyId) {
    var m = getMember_(memberId);
    if (!m || m.role !== 'parent') throw new Error('เฉพาะผู้ปกครองเท่านั้น');
    if (familyId !== undefined && familyId !== null && String(m.family_id) !== String(familyId)) throw new Error('ไม่มีสิทธิ์ในครอบครัวนี้');
    return m;
  }

  function requireChild_(memberId) {
    var m = getMember_(memberId);
    if (!m || m.role !== 'child') throw new Error('ไม่พบสมาชิก');
    return m;
  }

  // ผู้ปกครองที่ผูก LINE นี้ไว้กับครอบครัวนี้ (บัญชี LINE เดียวอาจอยู่หลายครอบครัว)
  function findParentByLineInFamily_(lineUserId, familyId) {
    if (!lineUserId) return null;
    return getAllRows_('Members').find(function(m) {
      return m.line_user_id === lineUserId && m.role === 'parent' && String(m.family_id) === String(familyId);
    }) || null;
  }

  // ส่งกลับเฉพาะข้อมูลที่หน้าเว็บใช้ (ไม่ส่ง line_user_id / web_token ของคนอื่นออกไป)
  function publicMember_(m) {
    return m ? { member_id: m.member_id, family_id: m.family_id, name: m.name, role: m.role, avatar: m.avatar } : null;
  }

  function cleanPrizes_(prizes) {
    if (!Array.isArray(prizes) || prizes.length !== 8) throw new Error('ต้องมี 8 ช่อง');
    return prizes.map(function(x) {
      var n = Math.round(Number(x));
      if (!(n >= 1 && n <= 99)) throw new Error('ดาวแต่ละช่องต้องอยู่ระหว่าง 1–99');
      return n;
    });
  }

  // ผู้ปกครองเปิด/ปิดกิจกรรม · เปิดใหม่ทุกครั้ง = เริ่มนับใหม่ (สิทธิ์ที่เก็บไว้ไม่หาย)
  function setWheelEnabled(memberId, enabled, prizes) {
    var parent = requireParent_(memberId);
    var lock = NO_LOCK;
    lock.waitLock(15000);
    try {
      ensureWheelSchema_();
      clearCache_();
      var current = wheelSettings_(getFamilyInfo_(parent.family_id));
      var unchanged = (!!enabled === current.enabled);
      var updates = {};
      if (enabled && current.enabled) {
        // เปิดอยู่แล้ว (เช่นผู้ปกครองอีกคนเปิดไว้ แต่หน้าจอนี้ยังค้างค่าเก่า) → ห้ามเริ่มนับใหม่ บันทึกแค่ดาว
        if (prizes) updates.wheel_prizes = JSON.stringify(cleanPrizes_(prizes));
      } else if (enabled) {
        updates.wheel_enabled = true;
        updates.wheel_started_at = isoNoMs_();
        updates.wheel_prizes = JSON.stringify(prizes ? cleanPrizes_(prizes) : current.prizes);
      } else if (current.enabled) {
        updates.wheel_enabled = false;
      }
      if (Object.keys(updates).length) updateRow_('Families', 'family_id', parent.family_id, updates);
      clearCache_();
      var info = getWheelParentInfo_(parent.family_id);
      info.unchanged = unchanged;   // true = สถานะเป็นแบบนั้นอยู่แล้ว
      return info;
    } finally {
      lock.releaseLock();
    }
  }

  // ให้หน้าตั้งค่าดึงสถานะล่าสุด (กันหน้าจอค้างค่าเก่าเมื่อมีผู้ปกครองหลายคน)
  function getWheelStatus(memberId) {
    return getWheelParentInfo_(requireParent_(memberId).family_id);
  }

  function setWheelPrizes(memberId, prizes) {
    var parent = requireParent_(memberId);
    ensureWheelSchema_();
    updateRow_('Families', 'family_id', parent.family_id, { wheel_prizes: JSON.stringify(cleanPrizes_(prizes)) });
    clearCache_();
    return getWheelParentInfo_(parent.family_id);
  }

  function getWheelParentInfo_(familyId) {
    var family = getFamilyInfo_(familyId);
    var ws = wheelSettings_(family);
    var kids = getFamilyMembers_(familyId).filter(function(m) { return m.role === 'child'; });
    return {
      enabled: ws.enabled, prizes: ws.prizes, startedAt: ws.startedAt,
      children: kids.map(function(c) {
        var w = ws.enabled ? syncChildWheel_(c, family) : null;
        var mine = getSpinRows_().filter(function(s) { return String(s.child_id) === String(c.member_id); });
        var last = mine.filter(function(s) { return s.used_at; })
          .sort(function(a, b) { return new Date(b.used_at) - new Date(a.used_at); })[0];
        return {
          member_id: c.member_id, name: c.name, avatar: c.avatar,
          run: w ? w.run : 0, pendingCount: w ? w.pendingCount : 0,
          spins: mine.filter(function(s) { return !s.used_at; }).length,
          lastPrize: last ? { stars: Number(last.prize_stars || 0), used_at: last.used_at } : null
        };
      })
    };
  }

  // ก่อนปฏิเสธ: เช็กว่าจะทำให้วันสะสมของเด็กหายไหม
  // (เตือนเฉพาะกรณีที่หายจริง เช่น เป็นภารกิจเดียวของวันนั้น)
  function checkRejectImpact(submissionId, memberId) {
    var s0 = getAllRows_('Submissions').find(function(s) { return String(s.submission_id) === String(submissionId); });
    if (!s0) return { warn: false };
    requireParent_(memberId, s0.family_id);
    return checkRejectImpact_(submissionId);
  }

  function checkRejectImpact_(submissionId) {
    var sub = getAllRows_('Submissions').find(function(s) { return String(s.submission_id) === String(submissionId); });
    if (!sub || sub.status !== 'pending') return { warn: false };
    var family = getFamilyInfo_(sub.family_id);
    if (!wheelSettings_(family).enabled) return { warn: false };
    var now = computeWheelProgress_(sub.child_id, family);
    var after = computeWheelProgress_(sub.child_id, family, submissionId);
    // ภารกิจของ "วันนี้" ไม่นับเป็นการสูญเสีย เพราะเด็กยังส่งใหม่ได้ภายในวัน
    var before = now.run + now.pendingCount - (now.todayStatus === 'pending' ? 1 : 0);
    var left = after.run + after.pendingCount - (after.todayStatus === 'pending' ? 1 : 0);
    if (left >= before) return { warn: false };
    var child = getMember_(sub.child_id);
    return { warn: true, childName: child ? child.name : 'น้อง', before: before, after: left, run: now.run, pending: now.pendingCount };
  }


  // ==========================================
  // ภารกิจด่วน (Urgent) — เวลาทั้งหมดใช้นาฬิกาเซิร์ฟเวอร์
  // ==========================================
  var URGENT_GRACE_MS = 5000;                // กดส่งตอน 00:00 พอดี เน็ตช้านิดหน่อยยังนับว่าทัน
  var URGENT_READ_MS = 60000;               // เห็นป้ายแล้วไม่กดรับ → เริ่มนับเองหลัง 1 นาที
  var URGENT_ACTIVE = { pending: true, running: true };
  function nowMs_() { return S.now ? S.now() : Date.now(); }
  function msIso_(ms) { return new Date(ms).toISOString(); }
  function urgentRows_(familyId) {
    return getAllRows_('Urgent').filter(function(u) { return String(u.family_id) === String(familyId); });
  }
  // เตือนเด็กก่อนหมดเวลา: งาน ≤ 1 ชม. เตือนตอนเหลือ 20% · งานยาวกว่านั้นเตือนตอนเหลือ 1 ชม. · งานสั้นกว่า 3 นาทีไม่เตือน
  function urgentRemindAt_(u) {
    if (!u.deadline_at) return null;
    var d = Number(u.duration_sec) * 1000;
    if (!(d >= 3 * 60000)) return null;
    var lead = d <= 3600000 ? Math.max(60000, Math.round(d * 0.2)) : 3600000;
    return new Date(u.deadline_at).getTime() - lead;
  }
  function urgentNameOf_(id, fallback) { var m = getMember_(id); return m ? m.name : fallback; }
  function urgentEvent_(type, u, extra) {
    if (!S.events) return;
    var kid = getMember_(u.child_id);
    S.events.push(Object.assign({
      type: type, familyId: String(u.family_id), urgentId: u.urgent_id, childId: String(u.child_id),
      childName: kid ? kid.name : 'น้อง', childAvatar: kid ? kid.avatar : '🧒',
      parentName: urgentNameOf_(u.created_by, 'ผู้ปกครอง'), title: u.title, icon: u.icon || '⚡', stars: Number(u.stars) || 0
    }, extra || {}));
  }
  function urgentWake_(ms) { if (ms && (!S.urgentWake || ms < S.urgentWake)) S.urgentWake = ms; }

  // ปิดภารกิจที่หมดเวลา + ส่งเตือนใกล้หมดเวลา → คืนเวลาที่ต้องตรวจครั้งถัดไป (ms) หรือ null
  function urgentSweep(familyId) {
    var now = nowMs_(), next = null;
    function soon(ms) { if (ms && (next === null || ms < next)) next = ms; }
    urgentRows_(familyId).forEach(function(u) {
      if (u.status === 'pending' && u.seen_at) {
        var auto = new Date(u.seen_at).getTime() + URGENT_READ_MS;
        if (auto <= now) urgentStart_(u, auto);   // เริ่มนับนับจากเวลาครบ 1 นาที (ไม่ใช่ตอนตรวจ)
        else { soon(auto); return; }
      }
      if (u.status === 'pending') {
        var until = new Date(u.open_until).getTime();
        if (!(until > now)) {
          updateRow_('Urgent', 'urgent_id', u.urgent_id, { status: 'expired', ended_at: msIso_(now) });
          urgentEvent_('urgent_expired', u, { unseen: true });
        } else soon(until);
      }
      if (u.status === 'running') {
        var dl = new Date(u.deadline_at).getTime();
        if (dl + URGENT_GRACE_MS <= now) {
          updateRow_('Urgent', 'urgent_id', u.urgent_id, { status: 'expired', ended_at: msIso_(now) });
          urgentEvent_('urgent_expired', u, { unseen: false });
          return;
        }
        var r = urgentRemindAt_(u);
        if (r && !u.reminded_at) {
          if (r <= now) {
            updateRow_('Urgent', 'urgent_id', u.urgent_id, { reminded_at: msIso_(now) });
            if (dl - now > 30000) urgentEvent_('urgent_remind', u, { minutesLeft: Math.max(1, Math.round((dl - now) / 60000)) });
          } else soon(r);
        }
        soon(dl + URGENT_GRACE_MS);
      }
    });
    return next;
  }

  function urgentView_(u, now) {
    return {
      urgent_id: u.urgent_id, batch_id: u.batch_id, child_id: u.child_id, title: u.title, icon: u.icon || '⚡',
      stars: Number(u.stars) || 0, duration_sec: Number(u.duration_sec) || 0, status: u.status,
      open_until: u.open_until, seen_at: u.seen_at || null, deadline_at: u.deadline_at || null,
      ended_at: u.ended_at || null, created_at: u.created_at, submission_id: u.submission_id || null,
      accepted_at: u.accepted_at || null, auto_start_at: (u.status === 'pending' && u.seen_at) ? msIso_(new Date(u.seen_at).getTime() + URGENT_READ_MS) : null,
      from_name: urgentNameOf_(u.created_by, 'ผู้ปกครอง'),
      left_ms: u.status === 'running' ? Math.max(0, new Date(u.deadline_at).getTime() - now) : null
    };
  }

  function createUrgent(memberId, data) {
    var parent = requireParent_(memberId);
    var familyId = parent.family_id;
    data = data || {};
    var title = String(data.title || '').trim().slice(0, 60);
    if (!title) throw new Error('ใส่ชื่อภารกิจก่อนนะ');
    var stars = Math.round(Number(data.stars));
    if (!(stars >= 1 && stars <= 100)) throw new Error('ดาวรางวัลต้องอยู่ระหว่าง 1–100');
    var d = Math.max(0, Math.floor(Number(data.days) || 0)), h = Math.max(0, Math.floor(Number(data.hours) || 0)), mi = Math.max(0, Math.floor(Number(data.minutes) || 0));
    var dur = d * 86400 + h * 3600 + mi * 60;
    if (dur < 60) throw new Error('เวลาทำต้องอย่างน้อย 1 นาที');
    if (dur > 7 * 86400) throw new Error('เวลาทำต้องไม่เกิน 7 วัน');
    var openH = Number(data.openHours) || 24;
    if (!(openH >= 1 && openH <= 168)) throw new Error('เวลาเปิดรับต้องอยู่ระหว่าง 1 ชั่วโมง – 7 วัน');
    var kids = getAllRows_('Members').filter(function(m) { return String(m.family_id) === String(familyId) && m.role === 'child'; });
    var want = Array.isArray(data.childIds) ? data.childIds.map(String) : [];
    var targets = kids.filter(function(k) { return want.indexOf(String(k.member_id)) >= 0; });
    if (!targets.length) throw new Error('เลือกลูกที่จะส่งภารกิจให้ก่อนนะ');
    var now = nowMs_();
    urgentSweep(familyId);   // ปิดของที่หมดเวลาไปแล้วก่อน จะได้ไม่ติดเงื่อนไข "ค้างอยู่"
    var busy = targets.filter(function(k) {
      return urgentRows_(familyId).some(function(u) { return String(u.child_id) === String(k.member_id) && URGENT_ACTIVE[u.status]; });
    });
    if (busy.length) throw new Error(busy.map(function(k) { return k.name; }).join(', ') + ' มีภารกิจด่วนค้างอยู่แล้ว (ทำได้ทีละ 1 อัน)');
    var batchId = genId_();
    var openUntil = msIso_(now + openH * 3600000);
    targets.forEach(function(k) {
      var row = {
        urgent_id: genId_(), batch_id: batchId, family_id: familyId, child_id: k.member_id,
        title: title, icon: String(data.icon || '⚡').slice(0, 8), stars: stars, duration_sec: dur,
        open_until: openUntil, created_by: memberId, created_at: msIso_(now), status: 'pending',
        seen_at: '', deadline_at: '', reminded_at: '', submission_id: '', ended_at: ''
      };
      appendRow_('Urgent', row);
      urgentEvent_('urgent_new', row);
    });
    urgentWake_(new Date(openUntil).getTime());
    questBump_(familyId, 'parents', 'urgent_send');   // กดส่ง 1 ครั้ง = 1 (แม้ส่งให้ลูกหลายคน)
    return { batchId: batchId, count: targets.length };
  }

  function cancelUrgent(memberId, batchId) {
    var parent = requireParent_(memberId);
    var n = 0, now = nowMs_();
    urgentRows_(parent.family_id).forEach(function(u) {
      if (String(u.batch_id) === String(batchId) && URGENT_ACTIVE[u.status]) {
        updateRow_('Urgent', 'urgent_id', u.urgent_id, { status: 'cancelled', ended_at: msIso_(now) });
        n++;
      }
    });
    if (!n) throw new Error('ภารกิจนี้จบไปแล้ว');
    return { cancelled: n };
  }

  function myUrgent_(childId, urgentId) {
    var kid = requireChild_(childId);
    var u = urgentRows_(kid.family_id).find(function(x) { return String(x.urgent_id) === String(urgentId) && String(x.child_id) === String(childId); });
    if (!u) throw new Error('ไม่พบภารกิจด่วนนี้');
    return u;
  }

  // เริ่มนับถอยหลัง (กดรับ หรือครบเวลาอ่านป้าย)
  function urgentStart_(u, startMs) {
    var dl = startMs + Number(u.duration_sec) * 1000;
    updateRow_('Urgent', 'urgent_id', u.urgent_id, { status: 'running', accepted_at: msIso_(startMs), deadline_at: msIso_(dl), seen_at: u.seen_at || msIso_(startMs) });
    urgentWake_(urgentRemindAt_(u) || dl + URGENT_GRACE_MS);
    urgentWake_(dl + URGENT_GRACE_MS);
  }

  // เด็กเห็นป้ายครั้งแรก → ยังไม่นับ ให้เวลาอ่าน 1 นาที (กดรับก่อนได้) · เรียกซ้ำได้
  function urgentSeen(childId, urgentId) {
    var u = myUrgent_(childId, urgentId);
    var now = nowMs_();
    urgentSweep(u.family_id);
    if (u.status === 'pending' && !u.seen_at) {
      updateRow_('Urgent', 'urgent_id', u.urgent_id, { seen_at: msIso_(now) });
      urgentWake_(now + URGENT_READ_MS);
    }
    return { urgent: urgentView_(u, now), serverNow: msIso_(now) };
  }

  // กด "รับภารกิจ" → เริ่มนับทันที
  function acceptUrgent(childId, urgentId) {
    var u = myUrgent_(childId, urgentId);
    var now = nowMs_();
    urgentSweep(u.family_id);
    if (u.status === 'pending') urgentStart_(u, now);
    else if (u.status !== 'running') throw new Error(u.status === 'cancelled' ? 'ผู้ปกครองยกเลิกภารกิจนี้แล้ว' : 'ภารกิจนี้จบไปแล้ว');
    return { urgent: urgentView_(u, now), serverNow: msIso_(now) };
  }

  function submitUrgent(childId, urgentId) {
    var u = myUrgent_(childId, urgentId);
    var now = nowMs_();
    urgentSweep(u.family_id);
    if (u.status === 'expired') return { expired: true };
    if (u.status === 'pending') urgentStart_(u, now);   // ส่งโดยยังไม่ได้กดรับ → ถือว่ารับตอนนี้
    if (u.status !== 'running') throw new Error(u.status === 'cancelled' ? 'ผู้ปกครองยกเลิกภารกิจนี้แล้ว' : 'ภารกิจนี้จบไปแล้ว');
    var kid = getMember_(childId);
    var submissionId = genId_();
    appendRow_('Submissions', {
      submission_id: submissionId, mission_id: u.urgent_id, child_id: childId, family_id: u.family_id,
      mission_title: '⚡ ' + u.title, status: 'pending', stars_earned: 0,
      submitted_at: msIso_(now), reviewed_by: '', reviewed_at: ''
    });
    updateRow_('Urgent', 'urgent_id', u.urgent_id, { status: 'submitted', submission_id: submissionId, ended_at: msIso_(now) });
    var starsDisplay = Number(u.stars) + ' ดาว · ⚡ ภารกิจด่วน';
    if (S.events) S.events.push({ type: 'submit', familyId: String(u.family_id), submissionId: submissionId, childName: kid ? kid.name : 'น้อง',
      childAvatar: kid ? kid.avatar : '🧒', missionTitle: '⚡ ' + u.title, starsDisplay: starsDisplay });
    var flexMsg = makeApprovalFlex_(submissionId, kid ? kid.name : 'น้อง', kid ? kid.avatar : '🧒', '⚡ ' + u.title, starsDisplay);
    getAllRows_('Members').filter(function(m) { return String(m.family_id) === String(u.family_id) && m.role === 'parent' && m.line_user_id; })
      .forEach(function(p) {
        var ns = p.notify_submission;
        if (ns !== false && ns !== 'false' && ns !== 'FALSE') { try { linePush_(p.line_user_id, [flexMsg]); } catch (e) {} }
      });
    return { submitted: true, submissionId: submissionId };
  }

  function declineUrgent(childId, urgentId) {
    var u = myUrgent_(childId, urgentId);
    urgentSweep(u.family_id);
    if (!URGENT_ACTIVE[u.status]) return { status: u.status };
    updateRow_('Urgent', 'urgent_id', u.urgent_id, { status: 'declined', ended_at: msIso_(nowMs_()) });
    urgentEvent_('urgent_declined', u);
    return { status: 'declined' };
  }

  // ข้อมูลภารกิจด่วนสำหรับหน้าเด็ก: ที่ค้างอยู่ + ที่เพิ่งจบใน 48 ชม. (ไว้แสดงป้ายผลลัพธ์ครั้งเดียว)
  function childUrgent_(member) {
    var now = nowMs_();
    var mine = urgentRows_(member.family_id).filter(function(u) { return String(u.child_id) === String(member.member_id); });
    return {
      active: mine.filter(function(u) { return URGENT_ACTIVE[u.status]; }).map(function(u) { return urgentView_(u, now); }),
      recent: mine.filter(function(u) { return !URGENT_ACTIVE[u.status] && u.ended_at && now - new Date(u.ended_at).getTime() < 48 * 3600000; })
        .map(function(u) { return urgentView_(u, now); }),
      serverNow: msIso_(now)
    };
  }

  // หน้าผู้ปกครอง: จัดกลุ่มตามครั้งที่สร้าง (ค้างอยู่ทั้งหมด + ที่สร้างใน 7 วัน)
  function parentUrgent_(familyId) {
    var now = nowMs_();
    var subs = {};
    getAllRows_('Submissions').forEach(function(s) { subs[String(s.submission_id)] = s; });
    var groups = {};
    urgentRows_(familyId).forEach(function(u) {
      var g = groups[u.batch_id];
      if (!g) g = groups[u.batch_id] = { batch_id: u.batch_id, title: u.title, icon: u.icon || '⚡', stars: Number(u.stars) || 0,
        duration_sec: Number(u.duration_sec) || 0, created_at: u.created_at, from_name: urgentNameOf_(u.created_by, 'ผู้ปกครอง'),
        open_until: u.open_until, kids: [], active: false };
      var kid = getMember_(u.child_id);
      var sub = u.submission_id ? subs[String(u.submission_id)] : null;
      var v = urgentView_(u, now);
      v.child_name = kid ? kid.name : 'น้อง'; v.child_avatar = kid ? kid.avatar : '🧒';
      v.review = sub ? sub.status : null;
      g.kids.push(v);
      if (URGENT_ACTIVE[u.status]) g.active = true;
    });
    return Object.keys(groups).map(function(k) { return groups[k]; })
      .filter(function(g) { return g.active || now - new Date(g.created_at).getTime() < 7 * 86400000; })
      .sort(function(a, b) { return (b.active - a.active) || (new Date(b.created_at) - new Date(a.created_at)); })
      .slice(0, 10);
  }


  // ==========================================
  // ของขวัญ (Gift) — ผู้ปกครองส่งดาวให้ · ดาวเข้าเมื่อเด็กเปิดกล่อง
  // ==========================================
  var GIFT_REASONS = { gift: '🎁 ของขวัญ', great: '💪 เก่งมาก', comfort: '🤗 ปลอบใจ', birthday: '🎂 วันเกิด', other: '✏️ อื่น ๆ' };
  function giftView_(g) {
    var kid = getMember_(g.child_id);
    return { gift_id: g.gift_id, child_id: g.child_id, child_name: kid ? kid.name : 'น้อง', child_avatar: kid ? kid.avatar : '🧒',
      stars: Number(g.stars) || 0, reason: g.reason || 'gift', reason_label: GIFT_REASONS[g.reason] || GIFT_REASONS.gift,
      message: g.message || '', from_name: urgentNameOf_(g.created_by, 'ผู้ปกครอง'), status: g.status,
      created_at: g.created_at, opened_at: g.opened_at || null };
  }
  function familyGifts_(familyId) { return getAllRows_('Gifts').filter(function(g) { return String(g.family_id) === String(familyId); }); }

  function sendGift(memberId, data) {
    var parent = requireParent_(memberId);
    data = data || {};
    var stars = Math.round(Number(data.stars));
    if (!(stars >= 1)) throw new Error('จำนวนดาวต้องอย่างน้อย 1');
    if (stars > 9999) throw new Error('จำนวนดาวมากเกินไป (สูงสุด 9,999)');
    var reason = GIFT_REASONS[data.reason] ? data.reason : 'gift';
    var message = String(data.message || '').trim().slice(0, 80);
    var want = Array.isArray(data.childIds) ? data.childIds.map(String) : [];
    var kids = getAllRows_('Members').filter(function(m) { return String(m.family_id) === String(parent.family_id) && m.role === 'child' && want.indexOf(String(m.member_id)) >= 0; });
    if (!kids.length) throw new Error('เลือกลูกที่จะส่งของขวัญให้ก่อนนะ');
    var now = msIso_(nowMs_());
    kids.forEach(function(k) {
      var g = { gift_id: genId_(), family_id: parent.family_id, child_id: k.member_id, stars: stars, reason: reason, message: message,
        created_by: memberId, created_at: now, status: 'sent', opened_at: '', ended_at: '' };
      appendRow_('Gifts', g);
      if (S.events) S.events.push({ type: 'gift_new', familyId: String(parent.family_id), childId: String(k.member_id), giftId: g.gift_id,
        parentName: parent.name, reasonLabel: GIFT_REASONS[reason], stars: stars });
    });
    questBump_(parent.family_id, 'parents', 'gift');
    return { count: kids.length };
  }

  function cancelGift(memberId, giftId) {
    var parent = requireParent_(memberId);
    var g = familyGifts_(parent.family_id).find(function(x) { return String(x.gift_id) === String(giftId); });
    if (!g) throw new Error('ไม่พบของขวัญนี้');
    if (g.status !== 'sent') throw new Error(g.status === 'opened' ? 'ลูกเปิดของขวัญไปแล้ว ยกเลิกไม่ได้' : 'ยกเลิกไปแล้ว');
    updateRow_('Gifts', 'gift_id', g.gift_id, { status: 'cancelled', ended_at: msIso_(nowMs_()) });
    return { cancelled: true };
  }

  function openGift(childId, giftId) {
    var kid = requireChild_(childId);
    var g = familyGifts_(kid.family_id).find(function(x) { return String(x.gift_id) === String(giftId) && String(x.child_id) === String(childId); });
    if (!g) throw new Error('ไม่พบของขวัญนี้');
    if (g.status === 'cancelled') throw new Error('ผู้ปกครองยกเลิกของขวัญนี้แล้ว');
    if (g.status === 'sent') {
      updateRow_('Gifts', 'gift_id', g.gift_id, { status: 'opened', opened_at: msIso_(nowMs_()) });
      if (S.events) S.events.push({ type: 'gift_opened', familyId: String(kid.family_id), childName: kid.name, childAvatar: kid.avatar,
        stars: Number(g.stars) || 0, giftId: g.gift_id });
    }
    return { stars: Number(g.stars) || 0, balance: getStarBalance_(childId) };
  }

  function childGifts_(member) {
    var mine = familyGifts_(member.family_id).filter(function(g) { return String(g.child_id) === String(member.member_id); });
    return {
      unopened: mine.filter(function(g) { return g.status === 'sent'; }).map(giftView_),
      opened: mine.filter(function(g) { return g.status === 'opened'; })
        .sort(function(a, b) { return String(b.opened_at).localeCompare(String(a.opened_at)); }).slice(0, 20).map(giftView_)
    };
  }
  function parentGifts_(familyId) {
    var now = nowMs_();
    return familyGifts_(familyId).filter(function(g) { return g.status === 'sent' || now - new Date(g.ended_at || g.opened_at || g.created_at).getTime() < 7 * 86400000; })
      .sort(function(a, b) { return String(b.created_at).localeCompare(String(a.created_at)); }).slice(0, 15).map(giftView_);
  }

  // ==========================================
  // ภารกิจประจำวัน + ดาวม่วง (เงินของครอบครัว) + ร้านค้าตัวละคร
  // ==========================================
  // ภารกิจผู้ปกครอง: 1 อันต่อวัน ใช้ร่วมกันทุกคน (ใครทำก็นับ) · ภารกิจเด็ก: สุ่มแยกให้เด็กแต่ละคน
  // นับเฉพาะเหตุการณ์ของวันนี้ (เวลาไทย) · ทำครบ → กดรับ · ลืมกด → ระบบเก็บให้ตอนข้ามวัน
  var QUEST_TYPES = {
    urgent_send: { who: 'parents', icon: '⚡', min: 1, max: 3, reward: 'target', title: function(n) { return 'ส่งภารกิจด่วนให้ลูก ' + n + ' ครั้ง'; } },
    approve:     { who: 'parents', icon: '✅', min: 1, max: 5, reward: 'target', title: function(n) { return 'กดอนุมัติภารกิจ ' + n + ' ครั้ง'; }, hint: 'นับภารกิจด่วนด้วย' },
    gift:        { who: 'parents', icon: '🎁', min: 1, max: 1, reward: 3,        title: function() { return 'ส่งของขวัญให้ลูก 1 ครั้ง'; } },
    kid_submit:  { who: 'kid', icon: '📝', min: 1, max: 5, reward: 'target', title: function(n) { return 'ทำภารกิจทั่วไป ' + n + ' ครั้ง'; }, hint: 'นับเมื่อผู้ปกครองอนุมัติ' },
    kid_urgent:  { who: 'kid', icon: '⚡', min: 1, max: 1, reward: 3,        title: function() { return 'ทำภารกิจด่วนสำเร็จ 1 ครั้ง'; }, hint: 'นับเมื่อผู้ปกครองอนุมัติ' },
    kid_multi:   { who: 'kid', icon: '✖️', min: 1, max: 1, reward: 2,        title: function() { return 'ทำภารกิจที่มีตัวคูณดาว 1 ครั้ง'; }, hint: 'นับเมื่อผู้ปกครองอนุมัติ' }
  };
  var PARENT_POOL = ['urgent_send', 'approve', 'gift'];
  var KID_POOL = ['kid_submit', 'kid_urgent', 'kid_multi'];

  function todayKey_() { return thaiDateKey_(new Date(nowMs_())); }
  function familyQuests_(familyId) { return getAllRows_('DailyQuests').filter(function(q) { return String(q.family_id) === String(familyId); }); }
  function randInt_(a, b) { return a + Math.floor(Math.random() * (b - a + 1)); }
  function familyRow_(familyId) { return getAllRows_('Families').find(function(f) { return String(f.family_id) === String(familyId); }); }

  // เพิ่ม/ลดเงินของครอบครัว + บันทึกสมุดบัญชี (ฐานข้อมูลกันติดลบอีกชั้น)
  function walletAdd_(familyId, currency, amount, kind, ref, memberId) {
    var fam = familyRow_(familyId);
    if (!fam) throw new Error('ไม่พบครอบครัว');
    var cur = Number(fam[currency] || 0);
    if (cur + amount < 0) throw new Error(currency === 'purple' ? 'ดาวม่วงไม่พอ' : 'เหรียญทองไม่พอ');
    var up = {}; up[currency] = cur + amount;
    updateRow_('Families', 'family_id', familyId, up);
    appendRow_('WalletLog', { log_id: genId_(), family_id: familyId, currency: currency, amount: amount, kind: kind, ref: ref || '',
      member_id: memberId || '', created_at: msIso_(nowMs_()) });
    return cur + amount;
  }

  function claimQuestRow_(q, by) {
    walletAdd_(q.family_id, 'purple', Number(q.reward) || 0, by === 'auto' ? 'quest_auto' : 'quest', q.quest_id, by === 'auto' ? '' : by);
    updateRow_('DailyQuests', 'quest_id', q.quest_id, { status: 'claimed', claimed_by: by, claimed_at: msIso_(nowMs_()) });
  }

  function newQuest_(familyId, today, owner, pool) {
    var type = pool[Math.floor(Math.random() * pool.length)], t = QUEST_TYPES[type];
    var target = randInt_(t.min, t.max);
    appendRow_('DailyQuests', { quest_id: familyId + '|' + today + '|' + owner, family_id: familyId, date: today, owner: owner,
      type: type, target: target, progress: 0, reward: t.reward === 'target' ? target : t.reward, status: 'active',
      claimed_by: '', claimed_at: '', created_at: msIso_(nowMs_()) });
  }

  // สุ่มภารกิจของวันนี้ (ครั้งแรกที่มีคนในครอบครัวใช้แอปวันนี้) + เก็บรางวัลที่ลืมกดของวันก่อน
  function ensureQuests_(familyId) {
    var today = todayKey_(), rows = familyQuests_(familyId);
    rows.forEach(function(q) { if (q.status === 'done' && q.date < today) claimQuestRow_(q, 'auto'); });
    var has = {};
    rows.forEach(function(q) { if (q.date === today) has[q.owner] = true; });
    if (!has.parents) newQuest_(familyId, today, 'parents', PARENT_POOL);
    var kids = getFamilyMembers_(familyId).filter(function(m) { return m.role === 'child'; });
    if (kids.length) {
      // ไม่มีภารกิจแบบคูณดาวในครอบครัว → ไม่สุ่ม "ทำภารกิจที่มีตัวคูณ" (ทำไม่ได้แน่นอน)
      var hasMulti = getMissions_(familyId).some(function(m) { return Number(m.multiplier) > 1; });
      var pool = hasMulti ? KID_POOL : KID_POOL.filter(function(x) { return x !== 'kid_multi'; });
      kids.forEach(function(k) { if (!has[String(k.member_id)]) newQuest_(familyId, today, String(k.member_id), pool); });
    }
  }

  // นับความคืบหน้า (เรียกจากเหตุการณ์จริง) — เฉพาะภารกิจของวันนี้ที่ยังไม่ครบ
  function questBump_(familyId, owner, type) {
    ensureQuests_(familyId);
    var today = todayKey_();
    var q = familyQuests_(familyId).find(function(x) { return x.date === today && String(x.owner) === String(owner) && x.type === type && x.status === 'active'; });
    if (!q) return;
    var p = Math.min(Number(q.target), Number(q.progress || 0) + 1);
    updateRow_('DailyQuests', 'quest_id', q.quest_id, p >= Number(q.target) ? { progress: p, status: 'done' } : { progress: p });
  }

  function questView_(q) {
    var t = QUEST_TYPES[q.type] || { icon: '⭐', title: function() { return q.type; } };
    var who = null;
    if (q.owner !== 'parents') { var k = getMember_(q.owner); who = k ? { member_id: k.member_id, name: k.name, avatar: k.avatar } : null; }
    return { quest_id: q.quest_id, owner: q.owner, type: q.type, icon: t.icon, title: t.title(Number(q.target)), hint: t.hint || '',
      target: Number(q.target), progress: Number(q.progress || 0), reward: Number(q.reward), status: q.status, date: q.date, child: who };
  }

  // ข้อมูลภารกิจ + กระเป๋า สำหรับหน้าหลัก (ใส่มากับ dashboard ไม่ต้องเรียกเพิ่ม)
  function dailyFor_(member) {
    var familyId = member.family_id, today = todayKey_();
    ensureQuests_(familyId);
    var qs = familyQuests_(familyId).filter(function(q) { return q.date === today; });
    var fam = familyRow_(familyId) || {};
    var parents = qs.filter(function(q) { return q.owner === 'parents'; }).map(questView_)[0] || null;
    var kids = qs.filter(function(q) { return q.owner !== 'parents'; }).map(questView_);
    var mine = member.role === 'child' ? kids.filter(function(q) { return String(q.owner) === String(member.member_id); }) : (parents ? [parents] : []);
    return { date: today, seen: String(member.quest_seen || '') === today, mine: mine, parents: parents, kids: kids,
      wallet: { purple: Number(fam.purple || 0), gold: Number(fam.gold || 0) },
      news: purpleNews_(member), goal: purpleGoal_(member, Number(fam.purple || 0)), got: goalGot_(member) };
  }
  // ดาวม่วงที่เข้ากระเป๋าโดยที่คนนี้ไม่ได้กดเอง (คนอื่นรับให้ / ระบบเก็บให้) และยังไม่เคยเห็น
  // เด็ก: เฉพาะภารกิจของตัวเอง · ผู้ปกครอง: ทุกภารกิจ · ยังไม่เคยตั้งค่า = ดูย้อน 24 ชม.
  function purpleNews_(member) {
    var seen = String(member.purple_seen || '') || msIso_(nowMs_() - 86400000), kid = member.role === 'child';
    var rows = familyQuests_(member.family_id).filter(function(q) {
      return q.status === 'claimed' && String(q.claimed_at || '') > seen && String(q.claimed_by) !== String(member.member_id) &&
        (!kid || String(q.owner) === String(member.member_id));
    });
    if (!rows.length) return null;
    var name = function(id) { var x = getMember_(id); return x ? x.name : ''; };
    var items = rows.map(function(q) {
      var v = questView_(q);
      return { reward: v.reward, title: v.title, icon: v.icon, owner: q.owner === 'parents' ? 'parents' : (v.child ? v.child.name : ''),
        ownerId: q.owner, by: q.claimed_by === 'auto' ? 'auto' : name(q.claimed_by), byRole: q.claimed_by === 'auto' ? '' : ((getMember_(q.claimed_by) || {}).role || '') };
    });
    return { total: items.reduce(function(a, b) { return a + b.reward; }, 0), items: items,
      until: rows.map(function(q) { return String(q.claimed_at); }).sort().pop() };
  }
  // เป้าหมาย = ของที่ "อยากได้" (มีได้คนละ 1 ชิ้น) · ลูก: ของตัวเอง → ไม่มีก็ใช้ของที่ผู้ปกครองตั้ง (เป้าหมายของบ้าน) → ไม่มี = { none }
  // ผู้ปกครอง: goal = เป้าหมายของบ้าน (ถ้าตั้ง) · kidGoals = เป้าหมายของลูกแต่ละคน
  function goalView_(fid, it, have, extra) {
    var pay = priceFor_(fid, it);
    return Object.assign({ id: it.id, name: it.name, kind: it.kind, sprite: it.sprite || '', art: it.art || '', price: pay, have: have, left: Math.max(0, pay - have) }, extra || {});
  }
  function purpleGoal_(member, have) {
    var fid = member.family_id;
    var wishes = getAllRows_('Wishes').filter(function(w) { return String(w.family_id) === String(fid); });
    var itemOf = function(w) { var it = shopItem_(w.item_id); return it && !owns_(fid, it) ? it : null; };
    var wishOf = function(id) { var w = wishes.filter(function(x) { return String(x.child_id) === String(id); }).pop(); return w ? itemOf(w) : null; };
    var parents = getFamilyMembers_(fid).filter(function(x) { return x.role === 'parent'; });
    var home = null; parents.some(function(p) { home = wishOf(p.member_id); return home; });
    if (member.role === 'child') {
      var mine = wishOf(member.member_id);
      if (mine) return goalView_(fid, mine, have, { byKid: true });
      if (home) return goalView_(fid, home, have, { home: true });
      return { none: true, have: have };
    }
    var kidGoals = getFamilyMembers_(fid).filter(function(x) { return x.role === 'child'; }).map(function(k) {
      var it = wishOf(k.member_id); return it ? goalView_(fid, it, have, { kid: k.name, byKid: true }) : null;
    }).filter(Boolean);
    var g = home ? goalView_(fid, home, have, { home: true }) : (kidGoals[0] ? Object.assign({}, kidGoals[0]) : { none: true, have: have });
    g.kidGoals = kidGoals;
    return g;
  }
  // ของที่หนูอยากได้ ผู้ปกครองซื้อให้แล้ว (ขึ้นครั้งเดียว · ล้างด้วย purpleSeen(.., .., true))
  function goalGot_(member) {
    if (member.role !== 'child' || !member.goal_got) return null;
    var p = String(member.goal_got).split('|'), it = shopItem_(p[0]), by = getMember_(p[2]);
    return it ? { id: it.id, name: it.name, kind: it.kind, sprite: it.sprite || '', art: it.art || '', by: by ? by.name : '' } : null;
  }
  // ปิดป๊อปอัป "มีอะไรใหม่" → จำเลขรุ่น (ไม่ย้อนกลับ)
  function newsSeen(memberId, ver) {
    var m = getMember_(memberId);
    if (!m) throw new Error('ไม่พบสมาชิก');
    var v = Number(ver) || 0;
    if (v > Number(m.news_seen || 0)) updateRow_('Members', 'member_id', m.member_id, { news_seen: v });
    return { seen: v };
  }
  function purpleSeen(memberId, until, gotSeen) {
    var m = getMember_(memberId);
    if (!m) throw new Error('ไม่พบสมาชิก');
    var u = String(until || '').slice(0, 40);
    if (u && u > String(m.purple_seen || '')) updateRow_('Members', 'member_id', m.member_id, { purple_seen: u });
    if (gotSeen) updateRow_('Members', 'member_id', m.member_id, { goal_got: '' });
    return { seen: u };
  }

  // ธีมของครอบครัว · ต้องตรงกับ public/themes/index.json (test/theme.test.js ตรวจให้)
  var THEMES = ['xmas'];
  function setTheme(memberId, themeId) {
    var parent = requireParent_(memberId);
    var id = String(themeId || '');
    if (THEMES.indexOf(id) < 0) throw new Error('ไม่พบธีมนี้');
    updateRow_('Families', 'family_id', parent.family_id, { theme: id });
    return { theme: id };
  }

  // เด็กปิดป๊อปอัปครบ 5 วัน → จำ earned_at ล่าสุดที่เห็น (ไม่ย้อนกลับ)
  function treeSeen(memberId, earnedAt) {
    var m = getMember_(memberId);
    if (!m) throw new Error('ไม่พบสมาชิก');
    var e = String(earnedAt || '').slice(0, 40);
    if (e && e > String(m.tree_seen || '')) updateRow_('Members', 'member_id', m.member_id, { tree_seen: e });
    return { seen: e };
  }

  function questSeen(memberId) {
    var m = getMember_(memberId);
    if (!m) throw new Error('ไม่พบสมาชิก');
    var today = todayKey_();
    if (String(m.quest_seen || '') !== today) updateRow_('Members', 'member_id', m.member_id, { quest_seen: today });
    return { seen: today };
  }

  function claimQuest(memberId, questId) {
    var m = getMember_(memberId);
    if (!m) throw new Error('ไม่พบสมาชิก');
    var q = familyQuests_(m.family_id).find(function(x) { return x.quest_id === String(questId); });
    if (!q) throw new Error('ไม่พบภารกิจนี้');
    if (q.owner === 'parents' && m.role !== 'parent') throw new Error('ภารกิจนี้เป็นของผู้ปกครอง');
    if (q.owner !== 'parents' && m.role !== 'parent' && String(q.owner) !== String(m.member_id)) throw new Error('ภารกิจนี้เป็นของคนอื่น');
    if (q.status === 'claimed') return { already: true, wallet: dailyFor_(m).wallet };
    if (q.status !== 'done') throw new Error('ยังทำภารกิจไม่ครบ');
    claimQuestRow_(q, String(m.member_id));
    var dl = dailyFor_(m), v = questView_(q);
    return { reward: Number(q.reward), wallet: dl.wallet, goal: dl.goal, owner: q.owner === 'parents' ? 'parents' : (v.child ? v.child.name : ''), title: v.title };
  }

  // ---------- ร้านค้า ----------
  // kind: avatar = ตัวละคร (type dad/mom = ผู้ปกครองใช้ · kid = เด็กใช้ · sprite = โฟลเดอร์ใน /sprites/characters/)
  //       floor = พื้นที่ตัวละครเดิน (art = /stage/floors/<art>.webp) · wall = ผนังหลังตัวละคร (/stage/walls/<art>.webp) · decor = ของตกแต่งลากวางในห้อง (art = /stage/decor/<art>.webp)
  // free = ทุกครอบครัวมีอยู่แล้ว ไม่ต้องซื้อ · เพิ่มของใหม่ = เพิ่มแถวที่นี่ + ใส่ภาพใน public/stage/
  var SHOP_ITEMS = [
    { id: 'dino_dad', kind: 'avatar', name: 'พ่อไดโน', type: 'dad', sprite: 'dad',  price: 30, currency: 'purple' },
    { id: 'dino_mom', kind: 'avatar', name: 'แม่ไดโน', type: 'mom', sprite: 'mom',  price: 30, currency: 'purple' },
    { id: 'dino_kid', kind: 'avatar', name: 'ลูกไดโน', type: 'kid', sprite: 'dino', price: 30, currency: 'purple' },
    // ครอบครัวหมี
    { id: 'bear_dad', kind: 'avatar', name: 'พ่อหมี', type: 'dad', sprite: 'beardad', price: 30, currency: 'purple' },
    { id: 'bear_mom', kind: 'avatar', name: 'แม่หมี', type: 'mom', sprite: 'bearmom', price: 30, currency: 'purple' },
    { id: 'bear_girl', kind: 'avatar', name: 'น้องหมีชมพู', type: 'kid', sprite: 'beargirl', price: 30, currency: 'purple' },
    // สัตว์เลี้ยง (ตัวละครประเภทที่ 4): ของทั้งครอบครัว · อยู่ในห้องได้สูงสุด PET_MAX ตัว · เดินนิดเดียวแล้วนั่งเล่น/หลับ
    { id: 'pet_dino', kind: 'pet', name: 'ไดโนจิ๋ว', sprite: 'petdino', price: 20, currency: 'purple' },
    { id: 'pet_dino_pink', kind: 'pet', name: 'ไดโนชมพู', sprite: 'petpink', price: 20, currency: 'purple' },
    { id: 'pet_dino_yellow', kind: 'pet', name: 'ไดโนเหลือง', sprite: 'petyellow', price: 20, currency: 'purple' },
    // สัตว์เลี้ยงจากไข่ระดับ rare (ไม่ขายในร้าน) · thumb = ชีตท่ายืน/หมอบ เฟรมแรกใช้เป็นรูปเล็ก
    { id: 'pet_godzero', kind: 'pet', name: 'ก๊อตซีโร่', sprite: 'petwalk', price: 0, currency: 'purple', egg: true, tier: 'rare', thumb: 'down', thumbFrames: 6 },
    { id: 'pet_puymek', kind: 'pet', name: 'ปุยเมฆ', sprite: 'petlamb', price: 0, currency: 'purple', egg: true, tier: 'rare', thumb: 'down', thumbFrames: 6 },
    { id: 'pet_firedragon', kind: 'pet', name: 'มังกรไฟจิ๋ว', sprite: 'petdragon', price: 0, currency: 'purple', egg: true, tier: 'rare', thumb: 'down', thumbFrames: 6 },
    { id: 'floor_wood', kind: 'floor', name: 'พื้นไม้', art: 'wood', price: 0, currency: 'purple', free: true },
    { id: 'wall_cream', kind: 'wall', name: 'ผนังครีมหน้าต่างฟ้า', art: 'cream', price: 0, currency: 'purple', free: true }
  ];
  // ของตกแต่ง · h = ความสูงเทียบตัวละคร (1 = เท่าลูกไดโน) · fx = ท่าขยับในหน้าเว็บ · set = หมวดในหน้าจัดห้อง
  // egg: true = ได้จากไข่เท่านั้น (ไม่ขายในร้าน)
  [['tree', 'ต้นคริสต์มาส', 1, 'sway twinkle'], ['gifts', 'กองของขวัญ', .55, 'hop sparkle'], ['snowman', 'ตุ๊กตาหิมะ', .9, 'sway snow'],
   ['candy', 'ไม้เท้าลูกกวาด', .6, 'wiggle'], ['fireplace', 'เตาผิง', 1, 'breathe fire'], ['sled', 'เลื่อนหิมะ', .4, 'slide snow']].forEach(function(d) {
    SHOP_ITEMS.push({ id: 'decor_' + d[0], kind: 'decor', set: 'xmas', name: d[1], art: d[0], h: d[2], fx: d[3], price: 10, currency: 'purple' });
  });
  [['plant', 'ต้นไม้กระถาง', .6, 'sway', 'room'], ['lamp', 'โคมไฟ', 1.2, 'breathe lamp', 'room'], ['bear', 'ตุ๊กตาหมี', .45, 'breathe', 'room'],
   ['toybox', 'กล่องของเล่น', .55, 'hop sparkle', 'room'], ['shelf', 'ชั้นหนังสือ', .8, 'breathe sparkle', 'room'], ['beanbag', 'บีนแบ็ก', .55, 'breathe', 'room'],
   ['ball', 'ลูกบอลชายหาด', .35, 'bounce', 'toys'], ['horse', 'ม้าโยก', .6, 'rock', 'toys'], ['rocket', 'จรวด', .8, 'hover flame', 'toys'],
   ['blocks', 'ตัวต่อ', .55, 'wiggle sparkle', 'toys'], ['drum', 'กลอง', .45, 'beat notes', 'toys'], ['tent', 'เต็นท์', 1, 'sway sparkle', 'toys']].forEach(function(d) {
    SHOP_ITEMS.push({ id: 'decor_' + d[0], kind: 'decor', set: d[4], name: d[1], art: d[0], h: d[2], fx: d[3], price: 0, currency: 'purple', egg: true });
  });
  var DEFAULT_FLOOR = 'floor_wood', DEFAULT_WALL = 'wall_cream', ROOM_MAX = 8, PET_MAX = 2, SCALE_MIN = 0.6, SCALE_MAX = 1.6;
  var FIRST_DISCOUNT = 0.5;   // ของชิ้นแรกของครอบครัว (ชนิดไหนก็ได้) ลด 50%
  function shopItem_(id) { return SHOP_ITEMS.find(function(i) { return i.id === String(id); }); }
  function familyInv_(familyId) { return getAllRows_('Inventory').filter(function(r) { return String(r.family_id) === String(familyId); }); }
  // ราคาหลังลด: ปัดเศษลง (ลดได้อย่างน้อย 1 ดาวเสมอ) · ต่ำสุด 1
  function discPrice_(price, pct) { return price > 0 ? Math.max(1, Math.floor(price * (100 - pct) / 100)) : 0; }
  function priceFor_(familyId, item) { return familyInv_(familyId).length ? item.price : discPrice_(item.price, FIRST_DISCOUNT * 100); }
  // คูปองจากไข่: ของแถมตอนฟัก · โอกาสรวม 15%
  var COUPON_DROPS = [[50, 0.02], [25, 0.05], [10, 0.08]];
  function rollCoupon_() { var r = Math.random(), acc = 0; for (var i = 0; i < COUPON_DROPS.length; i++) { acc += COUPON_DROPS[i][1]; if (r < acc) return COUPON_DROPS[i][0]; } return 0; }
  function familyCoupons_(familyId) {
    return getAllRows_('Coupons').filter(function(c) { return String(c.family_id) === String(familyId) && !c.used_at; })
      .map(function(c) { return { id: c.coupon_id, pct: Number(c.pct) }; }).sort(function(a, b) { return b.pct - a.pct; });
  }
  function fitsMember_(item, m) { return m && (item.type === 'kid' ? m.role === 'child' : m.role === 'parent'); }
  function owns_(familyId, item) { return !!item && (item.free || familyInv_(familyId).some(function(r) { return r.item_id === item.id; })); }

  // พื้น + ของตกแต่งของครอบครัว (Families.stage) · ของที่ไม่มีแล้ว/ไม่รู้จัก → กลับเป็นค่าเริ่มต้น
  function stageRaw_(familyId) {
    var st = {}; try { st = JSON.parse((familyRow_(familyId) || {}).stage || '{}') || {}; } catch (e) {}
    var floor = shopItem_(st.floor), wall = shopItem_(st.wall);
    return { floor: floor && floor.kind === 'floor' && owns_(familyId, floor) ? floor.id : DEFAULT_FLOOR,
      wall: wall && wall.kind === 'wall' && owns_(familyId, wall) ? wall.id : DEFAULT_WALL,
      decor: cleanRoom_(familyId, st.decor), pets: cleanPets_(familyId, st.pets) };
  }
  function cleanPets_(familyId, list) {
    var out = [];
    (Array.isArray(list) ? list : []).forEach(function(id) { var it = shopItem_(id); if (it && it.kind === 'pet' && out.indexOf(it.id) < 0 && out.length < PET_MAX && owns_(familyId, it)) out.push(it.id); });
    return out;
  }
  // ของในห้อง: [{id, x 0–1 (ตำแหน่งตามความกว้าง), s ขนาด}] ลำดับใน array = หลัง→หน้า · ตัดของที่ไม่มี/ซ้ำ/เกินจำนวน
  function cleanRoom_(familyId, list) {
    var seen = {}, out = [];
    (Array.isArray(list) ? list : []).forEach(function(d) {
      var it = d && shopItem_(d.id);
      if (!it || it.kind !== 'decor' || seen[it.id] || out.length >= ROOM_MAX || !owns_(familyId, it)) return;
      seen[it.id] = true;
      var x = Number(d.x), s = Number(d.s || 1);
      out.push({ id: it.id, x: Math.round(Math.min(0.96, Math.max(0.04, isFinite(x) ? x : 0.5)) * 1000) / 1000,
        s: Math.round(Math.min(SCALE_MAX, Math.max(SCALE_MIN, isFinite(s) ? s : 1)) * 100) / 100 });
    });
    return out;
  }
  function familyStage_(familyId) {
    var st = stageRaw_(familyId), f = shopItem_(st.floor), w = shopItem_(st.wall);
    return { floor: { id: f.id, art: f.art }, wall: { id: w.id, art: w.art }, max: ROOM_MAX, scaleMin: SCALE_MIN, scaleMax: SCALE_MAX,
      decor: st.decor.map(function(d) { var it = shopItem_(d.id); return { id: it.id, art: it.art, name: it.name, h: it.h, fx: it.fx, x: d.x, s: d.s }; }),
      petMax: PET_MAX, pets: st.pets.map(function(id) { var it = shopItem_(id); return { id: it.id, sprite: it.sprite, name: it.name }; }) };
  }
  function saveStage_(familyId, st) { updateRow_('Families', 'family_id', familyId, { stage: JSON.stringify(st) }); }

  function setStageBase_(memberId, itemId, kind, label) {
    var parent = requireParent_(memberId), item = shopItem_(itemId);
    if (!item || item.kind !== kind) throw new Error('ไม่พบ' + label + 'นี้');
    if (!owns_(parent.family_id, item)) throw new Error('ยังไม่ได้ซื้อ' + label + 'นี้');
    var st = stageRaw_(parent.family_id); st[kind] = item.id; saveStage_(parent.family_id, st);
    return { stage: familyStage_(parent.family_id), shop: getShop(memberId) };
  }
  function setFloor(memberId, itemId) { return setStageBase_(memberId, itemId, 'floor', 'พื้น'); }
  function setWall(memberId, itemId) { return setStageBase_(memberId, itemId, 'wall', 'ผนัง'); }
  // บันทึกการจัดห้องทั้งห้อง (ผู้ปกครอง) · list = [{id, x, s}] เรียงหลัง→หน้า
  function saveRoom(memberId, list) {
    var parent = requireParent_(memberId);
    if (typeof list === 'string') { try { list = JSON.parse(list); } catch (e) { list = null; } }
    if (!Array.isArray(list)) throw new Error('ข้อมูลห้องไม่ถูกต้อง');
    if (list.length > ROOM_MAX) throw new Error('วางได้สูงสุด ' + ROOM_MAX + ' ชิ้น');
    list.forEach(function(d) { var it = d && shopItem_(d.id); if (!it || it.kind !== 'decor') throw new Error('ไม่พบของตกแต่งนี้'); if (!owns_(parent.family_id, it)) throw new Error('ยังไม่มี' + it.name); });
    var st = stageRaw_(parent.family_id); st.decor = cleanRoom_(parent.family_id, list); saveStage_(parent.family_id, st);
    return { stage: familyStage_(parent.family_id), shop: getShop(memberId) };
  }

  // สัตว์เลี้ยงในห้อง (ผู้ปกครอง) · list = [item_id] ไม่เกิน PET_MAX
  function setPets(memberId, list) {
    var parent = requireParent_(memberId);
    if (typeof list === 'string') { try { list = JSON.parse(list); } catch (e) { list = null; } }
    if (!Array.isArray(list)) throw new Error('ข้อมูลไม่ถูกต้อง');
    if (list.length > PET_MAX) throw new Error('สัตว์เลี้ยงอยู่ในห้องได้สูงสุด ' + PET_MAX + ' ตัว');
    list.forEach(function(id) { var it = shopItem_(id); if (!it || it.kind !== 'pet') throw new Error('ไม่พบสัตว์เลี้ยงนี้'); if (!owns_(parent.family_id, it)) throw new Error('ยังไม่มี' + it.name); });
    var st = stageRaw_(parent.family_id); st.pets = cleanPets_(parent.family_id, list); saveStage_(parent.family_id, st);
    return { stage: familyStage_(parent.family_id), shop: getShop(memberId) };
  }

  // ---------- ไข่ปริศนา ----------
  var EGG_GOAL = 15, EGG_DAY_CAP = 5, EGG_CHANCE = 0.2, EGG_PITY = 8, EGG_PURPLE = 15;
  // ระดับไข่: rare 25% · การันตี rare ทุกใบที่ EGG_RARE_PITY · rare ที่ได้ของครบแล้ว = ดาวม่วง 30 + คูปองลด 50%
  var EGG_RARE_CHANCE = 0.25, EGG_RARE_PITY = 5, EGG_RARE_PURPLE = 30, EGG_RARE_COUPON = 50;
  function eggTier_(egg) { return (egg && egg.tier) || 'normal'; }
  function eggPool_(tier) { return SHOP_ITEMS.filter(function(it) { return it.egg && (it.tier || 'normal') === tier; }); }
  function familyEggs_(familyId) { return getAllRows_('Eggs').filter(function(e) { return String(e.family_id) === String(familyId); }); }
  function activeEgg_(familyId) { return familyEggs_(familyId).find(function(e) { return e.status !== 'hatched'; }) || null; }
  function jsonObj_(s) { try { return JSON.parse(s || '{}') || {}; } catch (e) { return {}; } }
  // เพิ่มความอบอุ่น (ไม่เกินวันละ EGG_DAY_CAP ทั้งครอบครัว) · คืนแต้มที่เพิ่มได้จริง
  function eggWarm_(egg, memberId, n, extra) {
    var today = todayKey_(), dw = egg.day === today ? Number(egg.day_warm || 0) : 0;
    var add = Math.min(n, EGG_DAY_CAP - dw, Number(egg.goal) - Number(egg.warm || 0));
    var up = extra || {};
    if (add > 0) {
      var c = jsonObj_(egg.contrib); c[memberId] = (c[memberId] || 0) + add;
      var w = Number(egg.warm || 0) + add;
      up.warm = w; up.day = today; up.day_warm = dw + add; up.contrib = JSON.stringify(c);
      if (w >= Number(egg.goal)) up.status = 'ready';
    }
    if (Object.keys(up).length) updateRow_('Eggs', 'egg_id', egg.egg_id, up);
    return Math.max(0, add);
  }
  // เรียกตอนผู้ปกครองอนุมัติภารกิจของเด็ก: มีไข่ → +1 · ไม่มี → สุ่มเจอไข่ (การันตีครั้งที่ EGG_PITY)
  function eggOnApprove_(familyId, childId) {
    var egg = activeEgg_(familyId);
    if (egg) { if (egg.status === 'warming') eggWarm_(egg, String(childId), 1); return; }
    var fam = familyRow_(familyId) || {}, pity = Number(fam.egg_pity || 0) + 1;
    if (Math.random() < EGG_CHANCE || pity >= EGG_PITY) {
      var rp = Number(fam.egg_rare_pity || 0) + 1, rare = Math.random() < EGG_RARE_CHANCE || rp >= EGG_RARE_PITY;
      updateRow_('Families', 'family_id', familyId, { egg_pity: 0, egg_rare_pity: rare ? 0 : rp });
      appendRow_('Eggs', { egg_id: familyId + '|' + (familyEggs_(familyId).length + 1), family_id: familyId, status: 'warming', warm: 0, goal: EGG_GOAL, tier: rare ? 'rare' : 'normal',
        day: '', day_warm: 0, contrib: '{}', hugs: '{}', found_by: String(childId), found_at: msIso_(nowMs_()), hatched_by: '', hatched_at: '', prize: '', created_at: msIso_(nowMs_()) });
      if (S.events) S.events.push({ type: 'egg_found', familyId: String(familyId), childId: String(childId), eggId: familyId + '|' + familyEggs_(familyId).length, tier: rare ? 'rare' : 'normal' });
    } else updateRow_('Families', 'family_id', familyId, { egg_pity: pity });
  }
  function hugEgg(memberId) {
    var m = getMember_(memberId);
    if (!m) throw new Error('ไม่พบสมาชิก');
    var egg = activeEgg_(m.family_id);
    if (!egg) throw new Error('ยังไม่มีไข่');
    if (egg.status !== 'warming') throw new Error('ไข่พร้อมฟักแล้ว');
    var today = todayKey_(), hugs = jsonObj_(egg.hugs);
    if (hugs[m.member_id] === today) throw new Error('วันนี้กอดไข่แล้ว');
    hugs[m.member_id] = today;
    var added = eggWarm_(egg, String(m.member_id), 1, { hugs: JSON.stringify(hugs) });
    return { added: added, egg: eggView_(m) };
  }
  // เด็กแตะฟัก → สุ่มของตกแต่งจากไข่ที่ครอบครัวยังไม่มี · มีครบแล้ว = ดาวม่วง
  function hatchEgg(memberId) {
    var m = getMember_(memberId);
    if (!m || m.role !== 'child') throw new Error('ให้ลูกเป็นคนฟักไข่นะ');
    var egg = activeEgg_(m.family_id);
    if (!egg || egg.status !== 'ready') throw new Error('ไข่ยังไม่พร้อมฟัก');
    var tier = eggTier_(egg), pool = eggPool_(tier).filter(function(it) { return !owns_(m.family_id, it); }), prize, pct = 0;
    if (pool.length) {
      var it = pool[Math.floor(Math.random() * pool.length)];
      appendRow_('Inventory', { inv_id: genId_(), family_id: m.family_id, item_id: it.id, price: 0, currency: 'egg',
        bought_by: String(m.member_id), bought_at: msIso_(nowMs_()), assigned_to: '' });
      // สัตว์เลี้ยงใหม่ → พาเข้าห้องเลยถ้ายังมีที่
      if (it.kind === 'pet') { var st0 = stageRaw_(m.family_id); if (st0.pets.length < PET_MAX) { st0.pets.push(it.id); saveStage_(m.family_id, st0); } }
      prize = it.id;
      pct = rollCoupon_();
    } else if (tier === 'rare') {
      walletAdd_(m.family_id, 'purple', EGG_RARE_PURPLE, 'egg', egg.egg_id, String(m.member_id)); prize = 'purple:' + EGG_RARE_PURPLE; pct = EGG_RARE_COUPON;
    } else { walletAdd_(m.family_id, 'purple', EGG_PURPLE, 'egg', egg.egg_id, String(m.member_id)); prize = 'purple:' + EGG_PURPLE; pct = rollCoupon_(); }
    if (pct) { appendRow_('Coupons', { coupon_id: genId_(), family_id: m.family_id, pct: pct, egg_id: egg.egg_id, created_at: msIso_(nowMs_()), used_at: '', used_on: '' }); prize += '+c' + pct; }
    updateRow_('Eggs', 'egg_id', egg.egg_id, { status: 'hatched', hatched_by: String(m.member_id), hatched_at: msIso_(nowMs_()), prize: prize });
    updateRow_('Members', 'member_id', m.member_id, { egg_seen: egg.egg_id + ':h' });
    return { prize: prizeView_(prize), egg: eggView_(m) };
  }
  function eggSeen(memberId, key) {
    var m = getMember_(memberId);
    if (!m) throw new Error('ไม่พบสมาชิก');
    updateRow_('Members', 'member_id', m.member_id, { egg_seen: String(key || '').slice(0, 80) });
    return { seen: key };
  }
  // prize = item_id | purple:15 · ต่อท้าย +c<pct> เมื่อได้คูปองด้วย
  function prizeView_(prize) {
    if (!prize) return null;
    var parts = String(prize).split('+c'), v = prizeView1_(parts[0]);
    if (v && parts[1]) v.coupon = Number(parts[1]);
    return v;
  }
  function prizeView1_(prize) {
    if (String(prize).indexOf('purple:') === 0) return { kind: 'purple', amount: Number(String(prize).split(':')[1]) || 0 };
    var it = shopItem_(prize);
    return it ? { kind: it.kind, id: it.id, name: it.name, art: it.art, h: it.h, fx: it.fx, set: it.set, sprite: it.sprite, thumb: it.thumb, thumbFrames: it.thumbFrames, tier: it.tier || 'normal' } : null;
  }
  // ข้อมูลไข่สำหรับหน้าจอ: ใบที่กำลังฟัก + เหตุการณ์ล่าสุด (เจอ/ฟัก) ที่สมาชิกคนนี้ยังไม่เห็น
  function eggView_(m) {
    var eggs = familyEggs_(m.family_id), cur = eggs.find(function(e) { return e.status !== 'hatched'; }) || null, today = todayKey_();
    var name = function(id) { var x = getMember_(id); return x ? x.name : ''; };
    var last = eggs[eggs.length - 1], event = null;
    if (last) {
      var key = last.egg_id + (last.status === 'hatched' ? ':h' : ':f');
      if (String(m.egg_seen || '') !== key && !(last.status !== 'hatched' && String(m.egg_seen || '') === last.egg_id + ':h'))
        event = { key: key, type: last.status === 'hatched' ? 'hatched' : 'found', by: name(last.status === 'hatched' ? last.hatched_by : last.found_by),
          byMe: String(last.status === 'hatched' ? last.hatched_by : last.found_by) === String(m.member_id), prize: prizeView_(last.prize), tier: eggTier_(last) };
    }
    var c = cur ? jsonObj_(cur.contrib) : {};
    return {
      current: cur ? { id: cur.egg_id, tier: eggTier_(cur), status: cur.status, warm: Number(cur.warm || 0), goal: Number(cur.goal), dayCap: EGG_DAY_CAP,
        todayLeft: cur.day === today ? Math.max(0, EGG_DAY_CAP - Number(cur.day_warm || 0)) : EGG_DAY_CAP,
        huggedToday: jsonObj_(cur.hugs)[m.member_id] === today,
        contrib: getFamilyMembers_(m.family_id).map(function(x) { return { name: x.name, role: x.role, n: c[x.member_id] || 0 }; }) } : null,
      event: event, canHatch: m.role === 'child',
      pool: eggPool_(eggTier_(cur)).map(function(it) { return { art: it.art, sprite: it.sprite, thumb: it.thumb, thumbFrames: it.thumbFrames, name: it.name, owned: owns_(m.family_id, it) }; })
    };
  }

  // ตัวละครที่ให้สมาชิกใช้แล้ว → เดินด้านล่างของจอทุกคนในครอบครัว
  function familyAvatars_(familyId) {
    return familyInv_(familyId).filter(function(r) { return r.assigned_to; }).map(function(r) {
      var it = shopItem_(r.item_id), m = getMember_(r.assigned_to);
      return it && m && String(m.family_id) === String(familyId) ? { item_id: it.id, sprite: it.sprite, member_id: m.member_id, name: m.name, role: m.role } : null;
    }).filter(Boolean);
  }

  function getShop(memberId) {
    var m = getMember_(memberId);
    if (!m) throw new Error('ไม่พบสมาชิก');
    var familyId = m.family_id, inv = familyInv_(familyId), fam = familyRow_(familyId) || {};
    var members = getFamilyMembers_(familyId);
    var wishes = getAllRows_('Wishes').filter(function(w) { return String(w.family_id) === String(familyId); });
    var first = !inv.length, stage = stageRaw_(familyId);
    return {
      stage: familyStage_(familyId),
      coupons: familyCoupons_(familyId),
      canBuy: m.role === 'parent', firstDiscount: first, discountPct: Math.round(FIRST_DISCOUNT * 100),
      wallet: { purple: Number(fam.purple || 0), gold: Number(fam.gold || 0) },
      members: members.map(function(x) { return { member_id: x.member_id, name: x.name, avatar: x.avatar, role: x.role }; }),
      items: SHOP_ITEMS.map(function(it) {
        var own = it.free || inv.find(function(r) { return r.item_id === it.id; });
        var who = own && own.assigned_to ? getMember_(own.assigned_to) : null;   // ตัวละครเท่านั้น
        var ws = wishes.filter(function(w) { return w.item_id === it.id; });
        return { id: it.id, kind: it.kind, name: it.name, type: it.type, sprite: it.sprite, art: it.art, free: !!it.free, egg: !!it.egg, tier: it.tier || 'normal', set: it.set, h: it.h, fx: it.fx, currency: it.currency, price: it.price,
          pay: first ? discPrice_(it.price, FIRST_DISCOUNT * 100) : it.price, owned: !!own,
          inUse: it.kind === 'floor' ? stage.floor === it.id : it.kind === 'wall' ? stage.wall === it.id : it.kind === 'decor' ? stage.decor.some(function(d) { return d.id === it.id; }) : it.kind === 'pet' ? stage.pets.indexOf(it.id) >= 0 : undefined,
          assigned_to: who ? { member_id: who.member_id, name: who.name, avatar: who.avatar } : null,
          wishedBy: ws.map(function(w) { var k = getMember_(w.child_id); return k ? k.name : ''; }).filter(Boolean),
          iWish: ws.some(function(w) { return String(w.child_id) === String(m.member_id); }) };
      })
    };
  }

  function assignTo_(familyId, inv, item, assignTo) {
    if (!assignTo) { updateRow_('Inventory', 'inv_id', inv.inv_id, { assigned_to: '' }); return; }
    var target = getMember_(assignTo);
    if (!target || String(target.family_id) !== String(familyId)) throw new Error('ไม่พบสมาชิกคนนี้');
    if (!fitsMember_(item, target)) throw new Error(item.type === 'kid' ? 'ตัวละครนี้ใช้ได้กับเด็กเท่านั้น' : 'ตัวละครนี้ใช้ได้กับผู้ปกครองเท่านั้น');
    // 1 คนใช้ได้ 1 ตัว → ถอดตัวเดิมของคนนั้นออกก่อน
    familyInv_(familyId).forEach(function(r) {
      if (String(r.assigned_to) === String(target.member_id) && r.inv_id !== inv.inv_id) updateRow_('Inventory', 'inv_id', r.inv_id, { assigned_to: '' });
    });
    updateRow_('Inventory', 'inv_id', inv.inv_id, { assigned_to: String(target.member_id) });
  }

  function buyItem(memberId, itemId, assignTo, couponId) {
    var parent = requireParent_(memberId);   // เด็กดูร้านได้อย่างเดียว ซื้อไม่ได้
    var familyId = parent.family_id, item = shopItem_(itemId);
    if (!item) throw new Error('ไม่พบสินค้านี้');
    if (item.egg) throw new Error('ของชิ้นนี้ได้จากไข่เท่านั้น');
    if (owns_(familyId, item)) throw new Error('ครอบครัวนี้มีของชิ้นนี้แล้ว');
    var price = priceFor_(familyId, item), coupon = null;
    // คูปองไม่ซ้อนกับส่วนลดชิ้นแรก (ชิ้นแรกลด 50% อยู่แล้ว → ไม่ใช้คูปอง)
    if (couponId && price === item.price) {
      coupon = getAllRows_('Coupons').find(function(c) { return c.coupon_id === String(couponId) && String(c.family_id) === String(familyId) && !c.used_at; });
      if (!coupon) throw new Error('คูปองนี้ใช้ไปแล้ว');
      price = discPrice_(item.price, Number(coupon.pct));
    }
    var fam = familyRow_(familyId) || {};
    if (Number(fam[item.currency] || 0) < price) throw new Error(item.currency === 'purple' ? 'ดาวม่วงไม่พอ' : 'เหรียญทองไม่พอ');
    if (coupon) updateRow_('Coupons', 'coupon_id', coupon.coupon_id, { used_at: msIso_(nowMs_()), used_on: item.id });
    walletAdd_(familyId, item.currency, -price, 'buy', item.id, memberId);
    var inv = { inv_id: genId_(), family_id: familyId, item_id: item.id, price: price, currency: item.currency,
      bought_by: memberId, bought_at: msIso_(nowMs_()), assigned_to: '' };
    appendRow_('Inventory', inv);
    // สัตว์เลี้ยงใหม่ → พาเข้าห้องเลยถ้ายังมีที่
    if (item.kind === 'pet') { var st0 = stageRaw_(familyId); if (st0.pets.length < PET_MAX) { st0.pets.push(item.id); saveStage_(familyId, st0); } }
    if (assignTo && item.kind === 'avatar') assignTo_(familyId, getAllRows_('Inventory').find(function(r) { return r.inv_id === inv.inv_id; }), item, assignTo);
    // ซื้อแล้ว → ลบคำขอ "อยากได้" ของชิ้นนี้
    getAllRows_('Wishes').filter(function(w) { return String(w.family_id) === String(familyId) && w.item_id === item.id; })
      .forEach(function(w) {
        var k = getMember_(w.child_id);
        if (k && k.role === 'child') updateRow_('Members', 'member_id', k.member_id, { goal_got: item.id + '|' + msIso_(nowMs_()) + '|' + memberId });
        S.store.remove('Wishes', 'wish_id', w.wish_id);
      });
    return { bought: item.id, paid: price, shop: getShop(memberId) };
  }

  function assignAvatar(memberId, itemId, assignTo) {
    var parent = requireParent_(memberId);
    var item = shopItem_(itemId);
    var inv = item && item.kind === 'avatar' && familyInv_(parent.family_id).find(function(r) { return r.item_id === item.id; });
    if (!inv) throw new Error('ยังไม่ได้ซื้อตัวละครนี้');
    assignTo_(parent.family_id, inv, item, assignTo || '');
    return { shop: getShop(memberId) };
  }

  // เด็กกด "อยากได้" (กดซ้ำ = ยกเลิก) → แจ้งผู้ปกครอง
  function wishItem(memberId, itemId) {
    var m = getMember_(memberId);
    if (!m) throw new Error('ไม่พบสมาชิก');
    var item = shopItem_(itemId);
    if (!item) throw new Error('ไม่พบสินค้านี้');
    if (item.egg) throw new Error('ของชิ้นนี้ได้จากไข่เท่านั้น');
    if (owns_(m.family_id, item)) throw new Error('ครอบครัวมีของชิ้นนี้แล้ว');
    var mineAll = getAllRows_('Wishes').filter(function(w) { return String(w.child_id) === String(m.member_id); });
    var mine = mineAll.find(function(w) { return w.item_id === item.id; });
    if (mine) { S.store.remove('Wishes', 'wish_id', mine.wish_id); return { wished: false, shop: getShop(memberId) }; }
    // อยากได้ได้คนละ 1 ชิ้น = เป้าหมาย → กดชิ้นใหม่แทนชิ้นเดิม
    var old = mineAll.map(function(w) { return shopItem_(w.item_id); }).filter(Boolean)[0];
    mineAll.forEach(function(w) { S.store.remove('Wishes', 'wish_id', w.wish_id); });
    appendRow_('Wishes', { wish_id: genId_(), family_id: m.family_id, child_id: m.member_id, item_id: item.id, created_at: msIso_(nowMs_()) });
    if (m.role === 'child' && S.events) S.events.push({ type: 'shop_wish', familyId: String(m.family_id), childName: m.name, itemName: item.name });
    return { wished: true, replaced: old ? old.name : '', shop: getShop(memberId) };
  }

  const api = { getMemberByWebToken, webLookupFamily, webReconnect, webRegister, webJoinFamily, getChildDashboard, submitMission, redeemReward, spinWheel, getParentDashboard, acknowledgeRedemptions, checkRejectImpact, reviewSubmission, webSaveMission, webSaveReward, webDeleteMission, webDeleteReward, toggleSubmissionNotify, getDailySummary, getWeeklySummary, setWheelEnabled, setWheelPrizes, getWheelStatus, createUrgent, cancelUrgent, urgentSeen, acceptUrgent, submitUrgent, declineUrgent, sendGift, cancelGift, openGift,
    questSeen, treeSeen, setTheme, claimQuest, getShop, buyItem, assignAvatar, wishItem, setFloor, setWall, saveRoom, setPets, hugEgg, hatchEgg, eggSeen, purpleSeen, newsSeen };
  return { api: api, urgentSweep: urgentSweep, handleLineEvent_: handleLineEvent_, saveDailySnapshot: saveDailySnapshot,
    createFamily_: createFamily_, joinFamily: joinFamily };
}
