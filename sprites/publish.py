#!/usr/bin/env python3
"""คัดลอกเฉพาะไฟล์ที่แอปใช้จริงไปไว้ใน public/sprites/ (ขึ้นเว็บตอน deploy)
   python3 sprites/publish.py
ไม่คัดลอก src/ (ภาพต้นฉบับ), *.check.png, preview.html
หลังแก้ตัวละคร/ตัวเล่น/ฉาก ต้องรันคำสั่งนี้ทุกครั้ง (test/sprites.test.js ตรวจว่าตรงกัน)"""
import json, os, shutil

ROOT = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(os.path.dirname(ROOT), 'public', 'sprites')


def main():
    if os.path.isdir(OUT):
        shutil.rmtree(OUT)
    os.makedirs(os.path.join(OUT, 'scenes'))
    for f in ('sprite-actor.js', 'scene.js'):
        shutil.copy(os.path.join(ROOT, f), os.path.join(OUT, f))
    for f in os.listdir(os.path.join(ROOT, 'scenes')):
        if f.endswith('.json'):
            shutil.copy(os.path.join(ROOT, 'scenes', f), os.path.join(OUT, 'scenes', f))
    total = 0
    for c in sorted(os.listdir(os.path.join(ROOT, 'characters'))):
        src = os.path.join(ROOT, 'characters', c)
        m = json.load(open(os.path.join(src, 'character.json'), encoding='utf-8'))
        dst = os.path.join(OUT, 'characters', c)
        os.makedirs(dst)
        for s in m['sheets'].values():
            s.pop('cut', None)                      # คำสั่งตัดภาพ ไม่ต้องใช้บนเว็บ
            shutil.copy(os.path.join(src, s['file']), os.path.join(dst, s['file']))
            total += os.path.getsize(os.path.join(dst, s['file']))
        json.dump(m, open(os.path.join(dst, 'character.json'), 'w', encoding='utf-8'), ensure_ascii=False, separators=(',', ':'))
    print('public/sprites พร้อม (%d KB รูป)' % (total // 1024))


if __name__ == '__main__':
    main()
