# แยกตัวละครที่ยืนชิดกันในชีต (มือของตัวหนึ่งเกยหางอีกตัว): ใช้เส้นหมึก (ไม่รวมขอบขาว) แบ่งก้อน → ใส่ขอบขาวคืน
# ใช้: python3 -c "from seg_touching import seg; seg(src, out, y_top, y_bottom_เหนือเส้นพื้น, จำนวนเฟรม)"
from PIL import Image
import numpy as np
from scipy import ndimage as ndi
BG=np.array([238,248,244])
def seg(src,out,y0,y1,n):
    a=np.asarray(Image.open(src).convert('RGB')).astype(int)[y0:y1]
    bg=a[-5,-5]; ink=(np.abs(a-bg).sum(2)>45)&(a.min(2)<215)
    m=ndi.binary_fill_holes(ndi.binary_closing(ink,iterations=3))
    lab,k=ndi.label(m); s=ndi.sum(m,lab,range(1,k+1))
    big=[i+1 for i in range(k) if s[i]>0.25*s.max()]
    comps=[lab==i for i in big]
    def wid(c): xs=np.where(c.any(0))[0]; return xs.max()-xs.min()
    widths=[wid(c) for c in comps]; med=sorted(widths)[len(widths)//2]
    out_c=[]
    for c,w in zip(comps,widths):
        if w>1.6*med:
            xs=np.where(c.any(0))[0]; lo,hi=xs.min()+int(w*.35),xs.min()+int(w*.65)
            cut=lo+int(np.argmin(c[:,lo:hi].sum(0)))
            l=c.copy(); l[:,cut:]=False; r=c.copy(); r[:,:cut]=False; out_c+=[l,r]
        else: out_c.append(c)
    out_c.sort(key=lambda c: np.where(c.any(0))[0].mean())
    assert len(out_c)==n,len(out_c)
    for j in range(1,k+1):
        if j in big: continue
        cm=lab==j
        if cm.sum()<15: continue
        sl=ndi.find_objects(cm.astype(int))[0]
        for q,c in enumerate(out_c):
            bs=ndi.find_objects(c.astype(int))[0]
            dx=max(bs[1].start-sl[1].stop,0,sl[1].start-bs[1].stop); dy=max(bs[0].start-sl[0].stop,0,sl[0].start-bs[0].stop)
            if dx<25 and dy<25 and sl[0].start<bs[0].stop-20: out_c[q]=c|cm; break
    crops=[]
    for cm in out_c:
        full=ndi.binary_dilation(cm,iterations=7)
        c=a.copy(); c[~full]=BG; ys,xs=np.where(full); crops.append(c[ys.min():ys.max()+1,xs.min():xs.max()+1])
    H=max(c.shape[0] for c in crops); W=sum(c.shape[1] for c in crops)+80*(len(crops)+1)
    o=np.zeros((H+160,W,3),int)+BG; x=80
    for c in crops: o[80+H-c.shape[0]:80+H,x:x+c.shape[1]]=c; x+=c.shape[1]+80
    Image.fromarray(o.astype('uint8')).save(out)
