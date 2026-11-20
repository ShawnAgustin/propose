# ProPose icon: a viewfinder framing a figure posed with hand on hip, drawn in the app's marker
# style (round joints, end-dot floor line) in cream on warm near-black, with the yellow Sun marker.
CREAM='#F3E3C3'; SUN='#FFD60A'
def glyph(color=CREAM, sun=SUN, s=1.0):
    g=f'<g transform="translate(512 512) scale({s}) translate(-512 -512)" fill="none" stroke="{color}" stroke-linecap="round" stroke-linejoin="round">'
    a,b,L,w=212,812,136,38
    for (x,y,dx,dy) in [(a,a,1,1),(b,a,-1,1),(a,b,1,-1),(b,b,-1,-1)]:
        g+=f'<path d="M{x} {y+dy*L} V{y} H{x+dx*L}" stroke-width="{w}"/>'
    dot=lambda x,y,r=26: f'<circle cx="{x}" cy="{y}" r="{r}" fill="{color}" stroke="none"/>'
    g+=f'<circle cx="474" cy="330" r="62" fill="{color}" stroke="none"/>'          # head
    g+=f'<path d="M494 436 L560 600" stroke-width="34"/>'                          # leaning torso
    g+=f'<path d="M494 436 L418 524 L536 566" stroke-width="27"/>'                # arm, hand on hip
    g+=f'<path d="M560 600 L506 700 M560 600 L616 700" stroke-width="29"/>'      # legs
    g+=dot(494,436)+dot(560,600)                                                  # joints
    g+=f'<path d="M440 734 H648" stroke-width="20"/>'+dot(440,734,19)+dot(648,734,19)  # floor marker
    if sun: g+=f'<circle cx="676" cy="332" r="40" stroke="{sun}" stroke-width="22"/>'
    return g+'</g>'
BG='<defs><radialGradient id="bg" cx="35%" cy="25%" r="90%"><stop offset="0" stop-color="#3A2E25"/><stop offset=".55" stop-color="#1E1915"/><stop offset="1" stop-color="#110E0C"/></radialGradient></defs><rect width="1024" height="1024" fill="url(#bg)"/>'
def page(n, body, size):
    open(f'{n}.svg','w').write(f'<svg xmlns="http://www.w3.org/2000/svg" width="{size}" height="{size}" viewBox="0 0 1024 1024">{body}</svg>')
    open(f'{n}.html','w').write(f'<html><body style="margin:0;background:transparent"><img src="{n}.svg" width="{size}" height="{size}" style="display:block"></body></html>')
jobs={'icon':(BG+glyph(),1024),'fg':(glyph(s=0.62),512),'bg':(BG,512),'mono':(glyph(color='#000',sun='#000',s=0.62),432),'splash':(glyph(s=1.2),512),'favicon':(BG+glyph(s=1.1),48)}
for n,(b,z) in jobs.items(): page(n,b,z)
print(' '.join(f'{n}:{z}' for n,(b,z) in jobs.items()))
