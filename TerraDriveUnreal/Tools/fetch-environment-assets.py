"""Download the pinned CC0 scan sources once. The native game runs offline."""
import hashlib, json, pathlib, urllib.request
ROOT=pathlib.Path(__file__).resolve().parent.parent
HEADERS={'User-Agent':'TerraDrive offline asset preparation/1.0','Referer':'https://polyhaven.com/'}
def get(url):
    with urllib.request.urlopen(urllib.request.Request(url,headers=HEADERS),timeout=90) as r:return r.read()
out=ROOT/'Vendor'/'Environment';out.mkdir(parents=True,exist_ok=True)
records=[]
for asset in ['rock_moss_set_02','shrub_sorrel_01']:
    meta=json.loads(get('https://api.polyhaven.com/files/'+asset))
    chosen=meta['gltf']['1k']['gltf']
    entries={asset+'_1k.gltf':chosen,**chosen['include']}
    for name,d in entries.items():
        p=out/asset/name;p.parent.mkdir(parents=True,exist_ok=True)
        if not p.exists() or hashlib.md5(p.read_bytes()).hexdigest()!=d['md5']:p.write_bytes(get(d['url']))
        blob=p.read_bytes()
        assert hashlib.md5(blob).hexdigest()==d['md5'],name
        records.append({'path':str(p.relative_to(out)).replace('\\','/'),'url':d['url'],'bytes':len(blob),'sha256':hashlib.sha256(blob).hexdigest(),'asset':asset,'license':'CC0-1.0','page':'https://polyhaven.com/a/'+asset})
    print('Downloaded and verified',asset,flush=True)
asset='kloofendal_48d_partly_cloudy_puresky'
d=json.loads(get('https://api.polyhaven.com/files/'+asset))['hdri']['1k']['hdr']
p=out/(asset+'_1k.hdr')
if not p.exists():p.write_bytes(get(d['url']))
blob=p.read_bytes();assert hashlib.md5(blob).hexdigest()==d['md5']
records.append({'path':p.name,'url':d['url'],'bytes':len(blob),'sha256':hashlib.sha256(blob).hexdigest(),'asset':asset,'license':'CC0-1.0','page':'https://polyhaven.com/a/'+asset})
(out/'manifest.json').write_text(json.dumps({'provider':'Poly Haven','license':'CC0-1.0','licenseURL':'https://polyhaven.com/license','files':records},indent=2))
