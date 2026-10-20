"""Scientific/geometry projection of exported simulator data; no WebGL claims.

MPLCONFIGDIR=/tmp/terra-mpl python tests/render-terrain-evidence.py
"""
import json
from pathlib import Path
import numpy as np
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
from matplotlib.colors import LightSource
from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
data = json.loads(Path('/tmp/terra-terrain-evidence.json').read_text())
plt.rcParams.update({'font.family': 'DejaVu Sans', 'font.size': 10, 'axes.titleweight': 'bold', 'axes.titlesize': 14, 'axes.labelcolor': '#344139', 'text.color': '#26362e', 'xtick.color': '#657168', 'ytick.color': '#657168', 'axes.edgecolor': '#bbc2b8'})
fig = plt.figure(figsize=(17, 11.8), facecolor='#f2f1e9')
grid = fig.add_gridspec(2, 3, left=.055, right=.975, bottom=.09, top=.835, hspace=.32, wspace=.24, width_ratios=[1.20, 1, 1])
fig.text(.055, .952, 'TERRA DRIVE', fontsize=12, fontweight='bold', color='#64755b')
fig.text(.055, .916, 'Persistent soil, visible trails and pressure-sensitive ruts', fontsize=23, fontweight='bold')
fig.text(.055, .886, 'Offline terrain geometry projection • actual Wrangler physics runs: 6.5 s, 4L, axle locks, 34% throttle', fontsize=11, color='#667063')

m = data['map']; H = np.array(m['height']).reshape(m['nz'], m['nx']); RGB = np.array(m['color']).reshape(m['nz'], m['nx'], 3)
light = LightSource(azdeg=315, altdeg=32)
shade = light.hillshade(H, vert_exag=1, dx=m['step'], dy=m['step'])
ax = fig.add_subplot(grid[0, 0]); ax.set_title('Trails and terrain regions', loc='left', pad=13)
extent = [m['minX'], m['minX']+(m['nx']-1)*m['step'], m['minZ'], m['minZ']+(m['nz']-1)*m['step']]
ax.imshow(np.clip(RGB*(.54+.68*shade[..., None]), 0, 1), origin='lower', extent=extent)
for label, x, z in [('PAVED ROAD',-180,-184),('EARTH TRAIL',-30,-54),('DARK WET MUD',46,-115),('PALE SAND',199,-85),('GREY ROCK',117,130),('MARSH',-28,166)]:
    ax.text(x,z,label,ha='center',va='center',fontsize=8,fontweight='bold',color='#ffffff',bbox={'boxstyle':'round,pad=.38','facecolor':'#27382b','alpha':.82,'edgecolor':'none'})
ax.set_xlim(-225,270); ax.set_ylim(-240,245); ax.set_aspect('equal'); ax.set_xlabel('World X (m)'); ax.set_ylabel('World Z (m)')

def material(run):
    h = np.array(run['height']).reshape(run['nz'], run['nx']); d = np.array(run['displacement']).reshape(h.shape)
    c = np.array(run['compaction']).reshape(h.shape); tread = np.array(run['tread']).reshape(h.shape)
    x = run['minX'] + np.arange(run['nx'])*run['step']; z = run['minZ'] + np.arange(run['nz'])*run['step']; X,Z=np.meshgrid(x,z)
    asset,tint,tile,wet = ('brown_mud_02', '#51372a', 1.3, .48) if run['surface']=='mud' else ('sand_03', '#e4c391', 2., 0.)
    img = np.array(Image.open(ROOT/'dist/assets/terrain'/f'{asset}_diff_1k.jpg').convert('RGB'))/255.
    def linear(v): return np.where(v <= .04045, v/12.92, ((v+.055)/1.055)**2.4)
    image = linear(img); base=image[((1-(Z/tile)%1)*1023).astype(int),((X/tile)%1*1023).astype(int)]
    tint=linear(np.array([int(tint[i:i+2],16)/255 for i in (1,3,5)])); lum=base@np.array([.2126,.7152,.0722])
    albedo=base*.17+tint*(.61+lum[...,None]*2.9)*.83
    damp=np.clip(wet+c*wet*.48,0,1); berm=np.clip(np.maximum(d,0)*9,0,1)
    albedo*=((1-damp*.33)*(1-c*.29-tread*.20+berm*.17))[...,None]
    # CPU geometric lighting uses the actual sampled height; no fake height or
    # cosmetic ruts are added to this evidence projection.
    illumination=light.hillshade(h, vert_exag=1, dx=run['step'], dy=run['step'])
    rgb=np.clip(albedo*(.40+illumination[...,None]*1.1),0,1)
    rgb=np.where(rgb <= .0031308, rgb*12.92, 1.055*rgb**(1/2.4)-.055)
    return h,d,rgb,X-run['x'],Z-(run['z']+.5)

for column, pressure in [(1,14),(2,42)]:
    run=next(r for r in data['runs'] if r['surface']=='mud' and r['pressure']==pressure)
    h,d,rgb,X,Z=material(run)
    ax=fig.add_subplot(grid[0,column]); ax.imshow(rgb,origin='lower',extent=[-2.5,2.5,0,11],aspect='equal')
    ax.set_title(f'Mud · {pressure} psi',loc='left',pad=13); ax.set_xlabel('Across vehicle path (m)'); ax.set_ylabel('Travel window (m)')
    ax.text(.03,.98,f'{run["deepest"]*100:.1f} cm deepest rut\n{run["berm"]*100:.1f} cm maximum berm',transform=ax.transAxes,va='top',fontsize=9,color='white',bbox={'boxstyle':'round,pad=.35','facecolor':'#31271e','alpha':.85,'edgecolor':'none'})

ax=fig.add_subplot(grid[1,0]); ax.set_facecolor('#fcfbf6'); ax.set_title('Controlled wheel-footprint cross-section',loc='left',pad=13)
for run,color in zip(data['controlled'],['#29887c','#b86842']):
    p=np.array(run['profile']); ax.plot(p[:,0]*100,p[:,1]*100,lw=2.7,color=color,label=f'{run["pressure"]} psi · {run["sink"]*100:.1f} cm centre depth'); ax.fill_between(p[:,0]*100,p[:,1]*100,0,color=color,alpha=.075)
ax.axhline(0,color='#646e63',lw=.9,linestyle='--'); ax.set_xlim(-60,60); ax.set_ylim(-12,7); ax.grid(alpha=.2); ax.set_xlabel('Across one tire (cm)'); ax.set_ylabel('Height change from undriven ground (cm)'); ax.legend(loc='lower left',frameon=False,fontsize=9)
ax.text(.03,.96,'Same 4.5 kN load, 3 m/s, 0.25 slip\nFootprint width and length respond to pressure',transform=ax.transAxes,va='top',fontsize=9,color='#626d60')
ax.annotate('Displaced soil',xy=(25,2.4),xytext=(21,5.1),arrowprops={'arrowstyle':'->','color':'#586c50'},fontsize=10,color='#53664c')

for column, pressure in [(1,14),(2,42)]:
    run=next(r for r in data['runs'] if r['surface']=='sand' and r['pressure']==pressure)
    h,d,rgb,X,Z=material(run); ax=fig.add_subplot(grid[1,column],projection='3d'); ax.set_facecolor('#f2f1e9')
    ax.plot_surface(X,Z,h,facecolors=rgb,rstride=2,cstride=1,linewidth=0,antialiased=False,shade=False)
    ax.view_init(elev=41,azim=-69); ax.set_box_aspect((5,11,3)); ax.set_title(f'Sand · {pressure} psi',loc='left',pad=13)
    ax.set_xlabel('Across (m)',labelpad=3); ax.set_ylabel('Travel (m)',labelpad=5); ax.set_zlabel('Surface height (m)',labelpad=5); ax.tick_params(labelsize=8); ax.set_zticks(np.linspace(h.min(),h.max(),3).round(2))
    ax.text2D(.02,.97,f'Actual deformed surface\n{run["deepest"]*100:.1f} cm deepest rut',transform=ax.transAxes,fontsize=9,va='top',color='#675c46')
    for axis in [ax.xaxis,ax.yaxis,ax.zaxis]: axis.pane.fill=False

fig.text(.055,.044,'Geometry and pressure trends are reproducible simulator outputs. The lower plots use labeled axis scales; this is an offline projection, not a WebGL screenshot.',fontsize=10,color='#62705d')
fig.text(.055,.024,'Soil and damage coefficients remain estimates. Photographic ground color uses the bundled CC0 Poly Haven assets; GPU lighting, reflections and frame rate are not evaluated here.',fontsize=9,color='#727c6c')
output=ROOT/'docs/terrain-v1.2-evidence.png'; fig.savefig(output,dpi=160,facecolor=fig.get_facecolor()); print(output)
