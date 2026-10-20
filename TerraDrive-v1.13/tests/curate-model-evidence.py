"""Arrange exact final native framebuffers; never retouch rendered model pixels."""
import argparse, collections, hashlib, json, shutil, subprocess
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont

parser=argparse.ArgumentParser()
parser.add_argument('source',type=Path)
parser.add_argument('output',type=Path)
parser.add_argument('--repo',type=Path,default=Path('/workspace/scratch/a0b76dc19fff/terra-drive'))
parser.add_argument('--baseline-source',type=Path,required=True)
parser.add_argument('--identity-source',type=Path,required=True)
parser.add_argument('--brake-source',type=Path,required=True)
a=parser.parse_args();src=a.source;out=a.output
out.mkdir(parents=True,exist_ok=False)
report=json.loads((src/'model-render-report.json').read_text())
manifest=json.loads((src/'model-source-manifest.json').read_text())
cases={c['name']:c for c in report['cases']}
assert len(cases)==134, f'Expected complete 134-view bundle, got {len(cases)}'
assert not report.get('sourceStudy'), 'Release evidence must use the exact live source snapshot, not a source-isolated variant'
assert len(report['signalChecks'])==12
assert all(s['pixelsChangedByAtLeastThree8BitLevels']>=8 for s in report['signalChecks'])
for program in report['compile'].values():assert all(stage['ok'] for stage in program.values())
assert report['baselineRevision']==(a.baseline_source/'revision.txt').read_text().strip()
baseline_label=manifest['baselineLabel']
current_label='Revised v'+json.loads((a.repo/'package.json').read_text())['version']
assert current_label=='Revised v1.6.0', current_label
for name in ['model-render-report.json','model-source-manifest.json']:
 shutil.copy2(src/name,out/name)
for name in ['model-comparison.png','model-upgrades.png','model-underbody.png','model-winch-fronts.png']:
 shutil.copy2(src/name,out/name)
models={'wrangler-rubicon':'Jeep Wrangler Rubicon','bronco-badlands':'Ford Bronco Badlands','civic-sport':'Honda Civic Sport sedan','sprinter-2500':'Mercedes-Benz Sprinter 2500'}
for vehicle in models:
 for kind in ['orthographic','details','detail-comparison','signals','cabins']:
  name=f'model-{vehicle}-{kind}.png';shutil.copy2(src/name,out/name)
 for view in ['front','rear','detail-front','detail-side-rear','detail-rear','cabin-through-windscreen','cabin-through-side','cabin-interior']:
  name=f'current-{vehicle}-{view}.png';shutil.copy2(src/name,out/name)
for vehicle,view in [('sprinter-2500','detail-front'),('civic-sport','detail-side-rear'),('wrangler-rubicon','front'),('bronco-badlands','front')]:
 name=f'baseline-{vehicle}-{view}.png';shutil.copy2(src/name,out/name)
shutil.copy2(a.baseline_source/'snapshot-manifest.json',out/'published-baseline-snapshot.json')
shutil.copy2(a.identity_source/'baseline-isolation-check.json',out/'baseline-isolation-check.json')
# The final stylesheet is a publication source, not a native rendering input.
css=a.repo/'dist/style.css'
presentation={'file':'dist/style.css','sha256':hashlib.sha256(css.read_bytes()).hexdigest(),'note':'Publication presentation source only. Native model images do not render DOM/CSS and do not validate this stylesheet.'}
(out/'presentation-provenance.json').write_text(json.dumps(presentation,indent=2)+'\n')
signals={'criterion':'At least eight framebuffer pixels must differ by >=3 of 255 levels in any RGB channel, using actual VehicleView.update() light states with the same camera and settled pose.','checks':report['signalChecks'],'allPassed':True,'sourceReport':'model-render-report.json'}
(out/'signal-results.json').write_text(json.dumps(signals,indent=2)+'\n')
# Record the actual compiled tangent-space lens input rather than inferring its
# presence from a smooth-looking, minified red surface in a garage frame.
scenes=json.loads((src/'model-scenes.json').read_text())
rear=next(case for case in scenes['cases'] if case['name']=='current-sprinter-2500-detail-rear')
normal_maps=[]
for draw in rear['draws']:
 uniform=draw['uniforms'];texture=uniform.get('normalMap')
 if not texture:continue
 data=(src/texture['rawTexture']).read_bytes();shader=(src/(draw['shader']+'.frag')).read_text()
 assert texture['component']=='uint8' and texture['channels']==4 and texture['colorSpace']=='', 'Lens tangent normals must be linear RGBA data'
 assert '#define USE_NORMALMAP_TANGENTSPACE' in shader and 'getTangentFrame' in shader
 normal_maps.append({'materialTags':draw['material']['surfaceTags'],'texture':texture,'textureSha256':hashlib.sha256(data).hexdigest(),'channelMinMax':[[min(data[k::4]),max(data[k::4])] for k in range(4)],'normalScale':uniform['normalScale'],'normalMapTransform':uniform['normalMapTransform'],'actualTangentSpaceDefine':True,'actualDerivativeTangentFrame':True,'shader':draw['shader']})
assert len(normal_maps)==2, 'Expected the actual clear and ruby prismatic lens material inputs'
(out/'prismatic-texture-check.json').write_text(json.dumps({'sourceCase':rear['name'],'records':normal_maps,'note':'Actual exported bytes and assembled Three material code. Fine prismatic detail is intentionally filtered at garage distance; no alternate shader or magnified replacement image is used.'},indent=2)+'\n')
del scenes,rear
fontroot=Path('/usr/share/fonts/truetype/dejavu')
regular=lambda size:ImageFont.truetype(str(fontroot/'DejaVuSans.ttf'),size)
bold=lambda size:ImageFont.truetype(str(fontroot/'DejaVuSans-Bold.ttf'),size)
background='#f4f6f7';text='#1d2d36';muted='#475b68';line='#b8c4cb'

def pair(vehicle, view, title, filename):
 names=[f'baseline-{vehicle}-{view}',f'current-{vehicle}-{view}']
 labels=[baseline_label+' geometry',current_label+' geometry']
 assert cases[names[0]]['metadata']['camera']==cases[names[1]]['metadata']['camera']
 cellw=1000;cellh=round(720*cellw/1100);gap=22;pad=28;head=113;foot=91
 im=Image.new('RGB',(pad*2+cellw*2+gap,head+cellh+foot),background);d=ImageDraw.Draw(im)
 d.text((pad,18),title,font=bold(29),fill=text)
 d.text((pad,58),'Exact model geometry • Identical camera, settled pose and current studio lighting',font=regular(20),fill=muted)
 for i,(name,label) in enumerate(zip(names,labels)):
  x=pad+i*(cellw+gap)
  d.text((x,87),label,font=bold(18),fill=text)
  raw=Image.open(src/(name+'.png')).convert('RGB');raw=raw.resize((cellw,cellh),Image.Resampling.LANCZOS);im.paste(raw,(x,head))
  scale=cases[name]['metadata'].get('scaleBar')
  y=head+cellh+23
  if scale:
   length=scale['pixels']*cellw/1100
   d.line([(x,y),(x+length,y)],fill=text,width=3)
   for end in [x,x+length]:d.line([(end,y-6),(end,y+6)],fill=text,width=3)
   d.text((x+length+12,y-12),'1 metre',font=regular(17),fill=text)
 d.text((pad,head+cellh+58),'Native EGL/GLES render of application meshes and shaders; not a browser screenshot.',font=regular(17),fill=muted)
 im.save(out/filename)
 return {'file':filename,'inputs':[name+'.png' for name in names],'method':'Identical full native frames, resized uniformly; labels and any exact orthographic metre bars added only outside the frame.'}
curation=[]
curation.append(pair('sprinter-2500','detail-front','Sprinter fascia and cabin: published and revised models','sprinter-front-comparison.png'))
curation.append(pair('civic-sport','detail-side-rear','Civic formed side panels and rear optics','civic-panel-comparison.png'))
curation.append(pair('bronco-badlands','front','Bronco exterior: published and revised models','bronco-front-comparison.png'))
curation.append(pair('wrangler-rubicon','front','Wrangler exterior: published and revised models','wrangler-front-comparison.png'))
# Eight-view current overview with human-readable model names and unretouched frames.
cellw=740;cellh=round(720*cellw/1100);pad=24;gap=18;rowhead=35;head=95;footer=39
im=Image.new('RGB',(pad*2+cellw*2+gap,head+4*(rowhead+cellh+gap)+footer),background);d=ImageDraw.Draw(im)
d.text((pad,17),'Terra Drive • Revised vehicle models',font=bold(31),fill=text)
d.text((pad,59),'Actual application geometry, materials and shared studio lighting',font=regular(20),fill=muted)
for row,(vehicle,name) in enumerate(models.items()):
 y=head+row*(rowhead+cellh+gap)
 for col,view in enumerate(['front','rear']):
  x=pad+col*(cellw+gap)
  d.text((x,y),name+(' — front' if col==0 else ' — rear'),font=bold(19),fill=text)
  raw=Image.open(src/f'current-{vehicle}-{view}.png').convert('RGB').resize((cellw,cellh),Image.Resampling.LANCZOS)
  im.paste(raw,(x,y+rowhead))
d.text((pad,im.height-30),'Native EGL/GLES images. Uniform resizing and captions only; no rendered pixels retouched.',font=regular(16),fill=muted)
im.save(out/'model-current-overview.png')
curation.append({'file':'model-current-overview.png','inputs':[f'current-{v}-{view}.png' for v in models for view in ['front','rear']],'method':'Uniform resize of complete native frames with captions outside image area.'})
(out/'curation-manifest.json').write_text(json.dumps({'sourceBundle':str(src),'baselineRevision':manifest['baselineRevision'],'baselineLabel':baseline_label,'currentLabel':current_label,'curatorSha256':hashlib.sha256(Path(__file__).read_bytes()).hexdigest(),'rawImagePolicy':'Copied native PNGs unchanged. Composite images only resize, arrange and add captions outside rendered pixels.','composites':curation},indent=2)+'\n')
# Final source match: independently compare every repository-backed export input.
mismatches=[];checked=[]
canvas_package=Path(subprocess.check_output(['node','-p',"require('path').join(require('path').dirname(require.resolve('@napi-rs/canvas')), 'package.json')"],cwd=a.repo,text=True).strip())
for name,digest in report['sourceHashes'].items():
 relative=name.removeprefix('current/') if name.startswith('current/') else name
 if name.startswith('baseline/'):
  p=a.baseline_source/'published-tree'/name.removeprefix('baseline/')
 elif name.startswith('qa-font/'):p=Path('/usr/share/fonts/opentype/urw-base35')/name.removeprefix('qa-font/')
 elif name=='qa-dependency/@napi-rs/canvas/package.json':p=canvas_package
 else:p=a.repo/relative
 assert p.is_file(), 'Missing exact source input: '+name
 actual=hashlib.sha256(p.read_bytes()).hexdigest();checked.append({'sourceKey':name,'file':str(p),'sha256':actual})
 if actual!=digest:mismatches.append(name)
for name,digest in report['replaySourceHashes'].items():
 actual=hashlib.sha256((a.repo/'tests'/name).read_bytes()).hexdigest()
 assert actual==digest,'Native replay source changed: '+name
assert not mismatches, 'Final source no longer matches export: '+str(mismatches)
brake=json.loads((a.brake_source/'model-render-report.json').read_text())
assert len(brake['cases'])==4 and len(brake['signalChecks'])==2
assert brake['sourceHashes']==report['sourceHashes'], 'Side-brake evidence must use the same final source hashes'
for name in ['model-render-report.json','model-source-manifest.json']:
 shutil.copy2(a.brake_source/name,out/('civic-brake-'+name))
shutil.copy2(a.brake_source/'model-civic-sport-brake-details.png',out/'model-civic-sport-brake-details.png')
for case in brake['cases']:
 name=Path(case['image']).name;shutil.copy2(a.brake_source/name,out/name)
summary={'nativeModelViews':len(cases),'additionalBrakeViews':len(brake['cases']),'additionalBrakeChecks':len(brake['signalChecks']),'caseVersions':dict(collections.Counter(c['version'] for c in cases.values())),'assembledMaterialPrograms':len(report['compile']),'pmremPasses':sum(e['passes'] for e in report['environments']),'signalChecks':len(report['signalChecks']),'allSignalsPassed':True,'backend':report['backend'],'baselineRevision':report['baselineRevision'],'sourceHashMatches':checked,'sourceHashMismatches':mismatches,'sourceReportSha256':hashlib.sha256((src/'model-render-report.json').read_bytes()).hexdigest()}
(out/'release-evidence-summary.json').write_text(json.dumps(summary,indent=2)+'\n')
shutil.copy2(Path(__file__),out/'curate-evidence.py')
files=[p for p in out.iterdir() if p.is_file()]
print(json.dumps({'output':str(out),'files':len(files),'bytes':sum(p.stat().st_size for p in files),'sourceHashMismatches':mismatches},indent=2))
