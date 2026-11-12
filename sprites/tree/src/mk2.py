from PIL import Image, ImageDraw; import numpy as np
from scipy import ndimage
exec(open('mk.py').read().split('tc=')[0])  # ได้ cut(), D
R=Image.open('reach.jpg').convert('RGB'); T2=Image.open('tree2.jpg').convert('RGB')
tc=[73,199,323,446,569,697]
trees=[cut(T2,(c-62,513,c+62,774)) for c in tc]     # ฐานต้นไม้ y=261
bare=trees[0].copy(); a=np.asarray(bare).copy(); a[:100,72:,3]=0; bare=Image.fromarray(a,'RGBA')  # ลบบอลที่ลอย
S=0.42
def sc(im): return im.resize((int(im.width*S),int(im.height*S)),Image.LANCZOS)
def noline(im):
    a=np.asarray(im).copy(); h=a.shape[0]
    for y in range(h-14,h):
        row=a[y]; dark=(row[:,:3].sum(1)<300)&(row[:,3]>0)
        # เส้นพื้น = ช่วงมืดที่แตะขอบซ้ายหรือขวา
        x=0
        while x<len(dark) and (dark[x] or row[x,3]==0): 
            if dark[x]: a[y,x,3]=0
            x+=1
        x=len(dark)-1
        while x>=0 and (dark[x] or row[x,3]==0):
            if dark[x]: a[y,x,3]=0
            x-=1
    a[-4:,:,3]=0
    return Image.fromarray(a,'RGBA')
hold=sc(noline(cut(R,(28,476,328,880)))); reach=sc(noline(cut(R,(368,452,668,880))))
ch={2:cut(D,(220,935,340,1100)),3:cut(D,(395,880,525,1100))}
fin=cut(D,(552,875,755,1100))
W,H,G=330,300,280; BG=(238,248,244)
def frame(tree=None,c=None,cx=55,cdy=0,front=True,whole=None,wx=0):
    im=Image.new('RGBA',(W,H),BG+(255,))
    if whole: im.alpha_composite(whole,(wx,G-whole.height)); return im
    if tree: im.alpha_composite(tree,(178,G-261))
    if c: im.alpha_composite(c,(cx,G-c.height+cdy))
    return im
seq=[(frame(bare,hold,cx=30),900),
 (frame(bare,reach,cx=128),800),
 (frame(trees[2],ch[2]),500),
 (frame(trees[4],ch[2]),500),
 (frame(trees[5],ch[3],cdy=-6),800),
 (frame(trees[5],ch[2]),300),
 (frame(whole=fin,wx=60),1800)]
seqT=[]
for i,t in enumerate([trees[k] for k in (0,1,2,4,5)]):
    im=Image.new('RGBA',(W,H),BG+(255,)); im.alpha_composite(t,(W//2-62,G-261)); seqT.append((im,[600,450,500,500,1800][i]))
def save(seq,name):
    fr=[f.convert('RGB').resize((W*2,H*2),Image.LANCZOS) for f,_ in seq]
    fr[0].save(name,save_all=True,append_images=fr[1:],duration=[d for _,d in seq],loop=0)
save(seq,'tree-dino.gif'); save(seqT,'tree-only.gif')
st=Image.new('RGB',(W*7,H*2),BG)
for i,(f,_) in enumerate(seq): st.paste(f.convert('RGB'),(i*W,0))
for i,(f,_) in enumerate(seqT): st.paste(f.convert('RGB'),(i*W,H))
st.save('strip.png')

# ---- ชั้นภาพแยกสำหรับเล่นแบบลื่นบนเว็บ ----
import base64, io, json
def b64(im):
    bb=im.getbbox(); 
    buf=io.BytesIO(); im.save(buf,'PNG'); return 'data:image/png;base64,'+base64.b64encode(buf.getvalue()).decode()
L={'bare':bare,'t2':trees[2],'t4':trees[4],'t5':trees[5],'hold':hold,'reach':reach,'clasp':ch[2],'jump':ch[3]}
json.dump({k:[b64(v),v.width,v.height] for k,v in L.items()},open('layers.json','w'))
import os
OUT='../../../public/themes/xmas/celebrate'   # รันจากโฟลเดอร์ sprites/tree/src
for k,v in L.items(): v.save(f'{OUT}/{k}.webp','WEBP',quality=88,method=6)
print({k:(v.width,v.height) for k,v in L.items()})
