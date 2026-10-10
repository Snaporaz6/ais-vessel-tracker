"""Import the complete, bounded EMODnet Mediterranean contour snapshot.
CC BY 4.0, EMODnet Bathymetry Consortium. Not for navigation.
No runtime requests to the provider are required by the map.
"""
import argparse, concurrent.futures, hashlib, json, pathlib, tempfile, urllib.request, urllib.parse, time
parser=argparse.ArgumentParser(description=__doc__)
parser.add_argument('--cache-dir', type=pathlib.Path, help='Reuse downloaded pages for a resumed import')
args=parser.parse_args()
OUT=pathlib.Path(__file__).resolve().parent.parent/'frontend/public/bathymetry'
OUT.mkdir(parents=True,exist_ok=True)
CACHE=args.cache_dir or pathlib.Path(tempfile.mkdtemp(prefix='ais-bathymetry-'))
CACHE.mkdir(parents=True,exist_ok=True)
BBOX=(-6,30,36.5,46)
STEP=200
BASE='https://ows.emodnet-bathymetry.eu/wfs'
def page(i):
 p=CACHE/f'{i}.json'
 if p.exists(): return json.loads(p.read_text())
 q=urllib.parse.urlencode(dict(service='WFS',version='2.0.0',request='GetFeature',typeNames='emodnet:contours',outputFormat='application/json',srsName='EPSG:4326',bbox=','.join(map(str,BBOX))+',EPSG:4326',count=STEP,startIndex=i))
 for attempt in range(3):
  try:
   with urllib.request.urlopen(BASE+'?'+q,timeout=60) as response: data=json.load(response)
   if data.get('numberReturned') != len(data['features']): raise ValueError('Invalid page')
   p.write_text(json.dumps(data,separators=(',',':')))
   print('Fetched',i,len(data['features']),flush=True)
   return data
  except Exception:
   if attempt==2: raise
   time.sleep(1)

def clip(a,b):
 dx=b[0]-a[0];dy=b[1]-a[1];lo=0;hi=1
 for p,q in ((-dx,a[0]-BBOX[0]),(dx,BBOX[2]-a[0]),(-dy,a[1]-BBOX[1]),(dy,BBOX[3]-a[1])):
  if p==0:
   if q<0:return None
  else:
   t=q/p
   if p<0:lo=max(lo,t)
   else:hi=min(hi,t)
   if lo>hi:return None
 return [[a[0]+lo*dx,a[1]+lo*dy],[a[0]+hi*dx,a[1]+hi*dy]]

def simplify(pts,tolerance=.0005):
 # Iterative Douglas-Peucker, applied only to the provider's generalised lines.
 keep={0,len(pts)-1};stack=[(0,len(pts)-1)];t2=tolerance*tolerance
 while stack:
  lo,hi=stack.pop();a=pts[lo];b=pts[hi];dx=b[0]-a[0];dy=b[1]-a[1];length=dx*dx+dy*dy
  far=t2;at=None
  for k in range(lo+1,hi):
   x,y=pts[k];t=max(0,min(1,((x-a[0])*dx+(y-a[1])*dy)/length)) if length else 0
   d=(x-a[0]-t*dx)**2+(y-a[1]-t*dy)**2
   if d>far:far=d;at=k
  if at is not None:keep.add(at);stack.extend(((lo,at),(at,hi)))
 return [[round(v,5) for v in pts[k]] for k in sorted(keep)]

def lines(coords):
 current=[]
 for a,b in zip(coords,coords[1:]):
  seg=clip(a,b)
  if seg:
   if current and current[-1]!=seg[0]:
    if len(current)>1:yield simplify(current)
    current=[]
   if not current:current=[seg[0]]
   if current[-1]!=seg[1]:current.append(seg[1])
  elif current:
   if len(current)>1:yield simplify(current)
   current=[]
 if len(current)>1:yield simplify(current)

if __name__=='__main__':
 first=page(0);total=int(first['numberMatched']);pages=[first]
 with concurrent.futures.ThreadPoolExecutor(max_workers=4) as pool:
  for result in pool.map(page,range(STEP,total,STEP)):pages.append(result)
 allfeatures=[f for p in pages for f in p['features']]
 assert all(int(p['numberMatched'])==total for p in pages), 'Source changed during import'
 assert len(allfeatures)==total, (len(allfeatures),total)
 assert len({f['id'] for f in allfeatures})==total, 'Duplicate/missing source features'
 features=[];rawpoints=0
 for f in allfeatures:
  geometry=f['geometry'];coords=geometry['coordinates'];rawpoints+=len(coords)
  assert geometry['type']=='LineString',geometry['type']
  for part in lines(coords):
   if len(part)>1:features.append(dict(type='Feature',properties=dict(depth=f['properties']['elevation']),geometry=dict(type='LineString',coordinates=part)))
 data=dict(type='FeatureCollection',features=features)
 out=OUT/'mediterranean-contours.json';out.write_text(json.dumps(data,separators=(',',':')))
 manifest=dict(source=BASE,layer='emodnet:contours',catalogVersion='2022',importedAt=time.strftime('%Y-%m-%dT%H:%M:%SZ',time.gmtime()),license='CC BY 4.0',attribution='EMODnet Bathymetry Consortium',bounds=BBOX,sourceFeatures=total,clippedFeatures=len(features),simplificationDegrees=.0005,bytes=out.stat().st_size,sha256=hashlib.sha256(out.read_bytes()).hexdigest(),points=sum(len(f['geometry']['coordinates']) for f in features))
 (OUT/'manifest.json').write_text(json.dumps(manifest,indent=2)+'\n');print(manifest,flush=True)
