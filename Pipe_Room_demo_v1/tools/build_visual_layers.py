"""Rebuild optional sprite overlays from the original user-supplied atlas.
Requires Pillow only when rerunning this *asset build* script; the game does not.
"""
from PIL import Image, ImageFilter
from pathlib import Path
import json
import numpy as np

ROOT=Path(__file__).resolve().parents[1]
ASSETS=ROOT/'assets'
OUTPUT=ASSETS/'overlays'
OUTPUT.mkdir(exist_ok=True)
manifest=json.loads((ASSETS/'manifest.json').read_text(encoding='utf-8'))
W=manifest['canvas']['width']; H=manifest['canvas']['height']
front=Image.new('RGBA',(W,H),(0,0,0,0))
extra=Image.new('RGBA',(W,H),(0,0,0,0))

def alpha_comp(dst,img,x,y):
    layer=Image.new('RGBA',(W,H),(0,0,0,0));layer.paste(img,(round(x),round(y)),img if img.mode!='RGBA' else None)
    return Image.alpha_composite(dst,layer)

def sprite_file(name):return Image.open(ASSETS/name).convert('RGBA')

# Repair missing 24-35 px teal tube between the upper-left curve and first pipe.
# Crop its unbraced central body so no new decorative bracket is invented.
top=sprite_file('pipes/pipe_top_straight_01.png')
patch=top.crop((42,0,90,92)).resize((47,92),Image.Resampling.NEAREST)
extra=alpha_comp(extra,patch,258,193)

# Right-side tube previously stopped above the exit grill, leaving a visual gap.
vert=sprite_file('pipes/pipe_right_vertical.png')
extension=vert.crop((0,60,104,155)).resize((104,56),Image.Resampling.NEAREST)
extra=alpha_comp(extra,extension,1487,685)

ladder=sprite_file('interactables/ladder_inside_pipe.png')
# The left wall is now a real ladder spanning the entire usable vertical rise.
extra=alpha_comp(extra,ladder.resize((62,205),Image.Resampling.NEAREST),180,269)
# Upper-right duct: the ladder remains *behind* the thief; 2 joined sections.
for y,height in [(346,198),(539,194)]:
    extra=alpha_comp(extra,ladder.resize((57,height),Image.Resampling.NEAREST),1509,y)
extra.save(OUTPUT/'pipe_repairs_ladders.png')

# Create a foreground *occlusion* layer, preserving all original brass braces.
# Critical: do NOT paint the glass center of tubes over the thief: it would hide him.
for sp in manifest['sprites']:
    name=sp['file']
    if not name.startswith('pipes/') and not name.startswith('interactables/diversion_valve'):
        continue
    im=sprite_file(name)
    sw,sh=im.size
    arr=np.asarray(im).copy()
    r=arr[:,:,0].astype(np.float32);g=arr[:,:,1].astype(np.float32);b=arr[:,:,2].astype(np.float32);a=arr[:,:,3]
    brass=(r>100)&(r>g*1.08)&(g>b*1.24)&(g>58)&(a>85)
    mask=np.zeros((sh,sw),dtype=np.uint8)
    if 'straight' in name or 'hazard_joint' in name:
        mask[:10,:]=255;mask[-13:,:]=255
        golden_columns=np.where(brass.sum(axis=0)>sh*.42)[0]
        for x in golden_columns:mask[:,max(0,x-3):min(sw,x+4)]=255
    elif any(s in name for s in ['right_vertical','ladder_vertical_shaft']):
        mask[:,:12]=255;mask[:,-12:]=255
        mask[:16,:]=255;mask[-15:,:]=255
    elif 'curve' in name:
        # Preserve only near-wall lips + gold collars; transparent interior remains visible.
        mask[:,:12]=255;mask[:,-12:]=255
        # Gold-pixel ring selected with dilation includes its dark edge.
        gold_im=Image.fromarray((brass.astype('uint8')*255),'L').filter(ImageFilter.MaxFilter(9))
        mask=np.maximum(mask,np.array(gold_im))
    else:
        gold_im=Image.fromarray((brass.astype('uint8')*255),'L').filter(ImageFilter.MaxFilter(13))
        mask=np.maximum(mask,np.array(gold_im))
    arr[:,:,3]=(a*(mask.astype(np.float32)/255)).astype(np.uint8)
    piece=Image.fromarray(arr,'RGBA')
    front=alpha_comp(front,piece,sp['original_x'],sp['original_y'])

# New ladder's handrails/rungs belong in front of a crawling silhouette only where
# they overlap it: keep alpha gentle so legs and scarf are still distinguishable.
# These are subtly translucent above the player, unlike original opaque pipe braces.
front.save(OUTPUT/'pipe_foreground_braces.png')
print('Created:', OUTPUT/'pipe_repairs_ladders.png', OUTPUT/'pipe_foreground_braces.png')
