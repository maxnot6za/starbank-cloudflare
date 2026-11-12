from PIL import Image; import numpy as np
from scipy import ndimage
D=Image.open('dino.jpg').convert('RGB'); T=Image.open('tree.jpg').convert('RGB')
def cut(im,box):
    c=im.crop(box); a=np.asarray(c).astype(int); bg=a[2,2]
    near=np.abs(a-bg).sum(2)<34
    lab,_=ndimage.label(near); edge=set(np.unique(np.r_[lab[0],lab[-1],lab[:,0],lab[:,-1]]))-{0}
    bgm=np.isin(lab,list(edge))
    al=np.where(bgm,0,255).astype(np.uint8)
    al=ndimage.gaussian_filter(al.astype(float),0.6).clip(0,255).astype(np.uint8)
    out=np.dstack([np.asarray(c),al]); return Image.fromarray(out,'RGBA')
tc=[75,199,322,446,570,697]
trees=[cut(T,(c-62,520,c+62,779)) for c in tc]   # ฐาน y=260 ใน crop
ch={1:cut(D,(30,925,150,1100)),2:cut(D,(220,935,340,1100)),3:cut(D,(395,880,525,1100))}
f0=cut(D,(5,595,182,777)); f0=f0.resize((int(f0.width*1.28),int(f0.height*1.28)),Image.LANCZOS); fin=cut(D,(552,875,755,1100))
W,H,G=330,300,280; BG=(238,248,244)
def frame(tree=None,c=None,cdy=0,whole=None,wx=0):
    im=Image.new('RGBA',(W,H),BG+(255,))
    if whole: im.alpha_composite(whole,(wx,G-whole.height)); return im
    if tree: im.alpha_composite(tree,(170,G-260))
    if c: im.alpha_composite(c,(55,G-c.height+cdy))
    return im
# แบบมีไดโน
seq=[(frame(trees[0],ch[1]),700),
 (frame(trees[1],ch[1]),350),(frame(trees[2],ch[1]),350),(frame(trees[3],ch[2]),450),
 (frame(trees[4],ch[2]),500),(frame(trees[5],ch[3],cdy=-6),700),(frame(trees[5],ch[2]),300),(frame(whole=fin,wx=60),1600)]
# แบบต้นไม้อย่างเดียว
seqT=[]
for i,t in enumerate(trees):
    im=Image.new('RGBA',(W,H),BG+(255,)); im.alpha_composite(t,(W//2-62,G-260)); seqT.append((im,[600,450,500,500,600,1600][i]))
def save(seq,name):
    fr=[f.convert('RGB').resize((W*2,H*2),Image.LANCZOS) for f,_ in seq]
    fr[0].save(name,save_all=True,append_images=fr[1:],duration=[d for _,d in seq],loop=0)
save(seq,'tree-dino.gif'); save(seqT,'tree-only.gif')
# ภาพเทียบนิ่ง
st=Image.new('RGB',(W*len(seq),H*2),BG)
for i,(f,_) in enumerate(seq): st.paste(f.convert('RGB'),(i*W,0))
for i,(f,_) in enumerate(seqT): st.paste(f.convert('RGB'),(i*W,H))
st.save('strip.png')
