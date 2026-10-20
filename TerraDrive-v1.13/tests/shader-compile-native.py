"""Real Mesa EGL / OpenGL ES compile-link gate, plus optional terrain pixels.

Only the compiler needs Python stdlib and native libEGL/Mesa. Pillow is loaded
only when --render is requested. No browser, WebGL emulation, network or server.
The JavaScript companion emits sources using the unchanged Three assembler.
"""
import os,sys,ctypes as C,json
from pathlib import Path
os.environ.setdefault('MESA_SHADER_CACHE_DISABLE','true')
import os,ctypes as C,json
os.environ.setdefault('EGL_PLATFORM','surfaceless')
os.environ.setdefault('LIBGL_ALWAYS_SOFTWARE','1')
try:
 egl=C.CDLL('libEGL.so.1')
except OSError as exc:
 raise SystemExit('UNSUPPORTED native shader gate: libEGL/Mesa is required. '+str(exc))
def bind(name,result,args):
 f=getattr(egl,name);f.restype=result;f.argtypes=args;return f
getproc=bind('eglGetProcAddress',C.c_void_p,[C.c_char_p])
geterr=bind('eglGetError',C.c_int,[])
platform=C.CFUNCTYPE(C.c_void_p,C.c_uint,C.c_void_p,C.POINTER(C.c_int))(getproc(b'eglGetPlatformDisplayEXT'))
display=platform(0x31DD,None,None)
major,minor=C.c_int(),C.c_int()
initialize=bind('eglInitialize',C.c_uint,[C.c_void_p,C.POINTER(C.c_int),C.POINTER(C.c_int)])
assert initialize(display,C.byref(major),C.byref(minor)),hex(geterr())
assert bind('eglBindAPI',C.c_uint,[C.c_uint])(0x30A0),hex(geterr())
attrs=(C.c_int*15)(0x3033,0x0001,0x3040,0x0040,0x3024,8,0x3023,8,0x3022,8,0x3021,8,0x3025,24,0x3038)
config=C.c_void_p();num=C.c_int()
assert bind('eglChooseConfig',C.c_uint,[C.c_void_p,C.POINTER(C.c_int),C.POINTER(C.c_void_p),C.c_int,C.POINTER(C.c_int)])(display,attrs,C.byref(config),1,C.byref(num)) and num.value,hex(geterr())
context=bind('eglCreateContext',C.c_void_p,[C.c_void_p,C.c_void_p,C.c_void_p,C.POINTER(C.c_int)])(display,config,None,(C.c_int*3)(0x3098,3,0x3038))
assert context,hex(geterr())
surface=bind('eglCreatePbufferSurface',C.c_void_p,[C.c_void_p,C.c_void_p,C.POINTER(C.c_int)])(display,config,(C.c_int*5)(0x3057,64,0x3056,64,0x3038))
assert surface,hex(geterr())
assert bind('eglMakeCurrent',C.c_uint,[C.c_void_p,C.c_void_p,C.c_void_p,C.c_void_p])(display,surface,surface,context),hex(geterr())
def gl(name,result,args):
 p=getproc(name.encode());assert p,name
 return C.CFUNCTYPE(result,*args)(p)
getstring=gl('glGetString',C.c_char_p,[C.c_uint])
info={n:getstring(v).decode() for n,v in [('vendor',0x1F00),('renderer',0x1F01),('version',0x1F02),('shading_language',0x8B8C)]}
info['egl']=f'{major.value}.{minor.value}'

GL_VERTEX_SHADER=0x8B31;GL_FRAGMENT_SHADER=0x8B30
create_shader=gl('glCreateShader',C.c_uint,[C.c_uint])
shader_source=gl('glShaderSource',None,[C.c_uint,C.c_int,C.POINTER(C.c_char_p),C.POINTER(C.c_int)])
compile_shader=gl('glCompileShader',None,[C.c_uint])
shader_iv=gl('glGetShaderiv',None,[C.c_uint,C.c_uint,C.POINTER(C.c_int)])
shader_log=gl('glGetShaderInfoLog',None,[C.c_uint,C.c_int,C.POINTER(C.c_int),C.c_char_p])
create_program=gl('glCreateProgram',C.c_uint,[])
attach_shader=gl('glAttachShader',None,[C.c_uint,C.c_uint])
link_program=gl('glLinkProgram',None,[C.c_uint])
program_iv=gl('glGetProgramiv',None,[C.c_uint,C.c_uint,C.POINTER(C.c_int)])
program_log=gl('glGetProgramInfoLog',None,[C.c_uint,C.c_int,C.POINTER(C.c_int),C.c_char_p])
delete_shader=gl('glDeleteShader',None,[C.c_uint])
delete_program=gl('glDeleteProgram',None,[C.c_uint])

def compile_stage(source,stage):
 shader=create_shader(stage);data=source.encode();ptr=C.c_char_p(data);length=C.c_int(len(data));shader_source(shader,1,C.byref(ptr),C.byref(length));compile_shader(shader)
 status=C.c_int();loglength=C.c_int();shader_iv(shader,0x8B81,C.byref(status));shader_iv(shader,0x8B84,C.byref(loglength));buffer=C.create_string_buffer(max(1,loglength.value));shader_log(shader,len(buffer),None,buffer)
 return shader,{'ok':bool(status.value),'log':buffer.value.decode(errors='replace')}

def compile_pair(vertex,fragment,keep=False):
 vs,vresult=compile_stage(vertex,GL_VERTEX_SHADER);fs,fresult=compile_stage(fragment,GL_FRAGMENT_SHADER);program=create_program();attach_shader(program,vs);attach_shader(program,fs);link_program(program)
 status=C.c_int();loglength=C.c_int();program_iv(program,0x8B82,C.byref(status));program_iv(program,0x8B84,C.byref(loglength));buffer=C.create_string_buffer(max(1,loglength.value));program_log(program,len(buffer),None,buffer)
 result={'vertex':vresult,'fragment':fresult,'link':{'ok':bool(status.value),'log':buffer.value.decode(errors='replace')}}
 if status.value:
  samplers=active_samplers(program)
  result['activeSamplers']=samplers
  result['samplerCount']=sum(sampler['size'] for sampler in samplers)
 delete_shader(vs);delete_shader(fs)
 if keep:return program,result
 delete_program(program);return result


def proc(name,restype,*args):return gl(name,restype,list(args))
u=C.c_uint;i=C.c_int;f=C.c_float;p=C.c_void_p;b=C.c_ubyte
use=proc('glUseProgram',None,u);geterr=proc('glGetError',u)
gen_tex=proc('glGenTextures',None,i,C.POINTER(u));bind_tex=proc('glBindTexture',None,u,u);active_tex=proc('glActiveTexture',None,u)
texparam=proc('glTexParameteri',None,u,u,i);teximage=proc('glTexImage2D',None,u,i,i,i,i,i,u,u,p);mipmap=proc('glGenerateMipmap',None,u);pixelstore=proc('glPixelStorei',None,u,i)
texparamf=proc('glTexParameterf',None,u,u,f);getfloat=proc('glGetFloatv',None,u,C.POINTER(f))
has_anisotropy='GL_EXT_texture_filter_anisotropic' in (getstring(0x1F03) or b'').decode()
max_anisotropy=f(1)
if has_anisotropy:getfloat(0x84FF,C.byref(max_anisotropy))
gen_fb=proc('glGenFramebuffers',None,i,C.POINTER(u));bind_fb=proc('glBindFramebuffer',None,u,u);attach_tex=proc('glFramebufferTexture2D',None,u,u,u,u,i);check_fb=proc('glCheckFramebufferStatus',u,u)
gen_rb=proc('glGenRenderbuffers',None,i,C.POINTER(u));bind_rb=proc('glBindRenderbuffer',None,u,u);storage_rb=proc('glRenderbufferStorage',None,u,u,i,i);attach_rb=proc('glFramebufferRenderbuffer',None,u,u,u,u)
storage_rb_multisample=proc('glRenderbufferStorageMultisample',None,u,i,u,i,i)
blit_framebuffer=proc('glBlitFramebuffer',None,i,i,i,i,i,i,i,i,u,u)
get_integer=proc('glGetIntegerv',None,u,C.POINTER(i))
viewport=proc('glViewport',None,i,i,i,i);clearcolor=proc('glClearColor',None,f,f,f,f);clear=proc('glClear',None,u);enable=proc('glEnable',None,u);disable=proc('glDisable',None,u);depth=proc('glDepthFunc',None,u)
depthmask=proc('glDepthMask',None,b);blendfunc=proc('glBlendFunc',None,u,u);cullface=proc('glCullFace',None,u)
polygonoffset=proc('glPolygonOffset',None,f,f)
gen_vao=proc('glGenVertexArrays',None,i,C.POINTER(u));bind_vao=proc('glBindVertexArray',None,u);gen_buf=proc('glGenBuffers',None,i,C.POINTER(u));bind_buf=proc('glBindBuffer',None,u,u);buf_data=proc('glBufferData',None,u,C.c_ssize_t,p,u)
attrloc=proc('glGetAttribLocation',i,u,C.c_char_p);enable_attr=proc('glEnableVertexAttribArray',None,u);attrptr=proc('glVertexAttribPointer',None,u,i,u,b,i,p)
uniloc=proc('glGetUniformLocation',i,u,C.c_char_p);getuniform=proc('glGetActiveUniform',None,u,u,i,C.POINTER(i),C.POINTER(i),C.POINTER(u),C.c_char_p);getprogram=proc('glGetProgramiv',None,u,u,C.POINTER(i))
uniform1i=proc('glUniform1i',None,i,i);uniform1f=proc('glUniform1f',None,i,f)
uniform_f={n:proc(f'glUniform{n}fv',None,i,i,C.POINTER(f)) for n in range(1,5)}
uniform_m={n:proc(f'glUniformMatrix{n}fv',None,i,i,b,C.POINTER(f)) for n in [2,3,4]}
draw=proc('glDrawElements',None,u,i,u,p);read=proc('glReadPixels',None,i,i,i,i,u,u,p);finish=proc('glFinish',None)
del_buf=proc('glDeleteBuffers',None,i,C.POINTER(u));del_tex=proc('glDeleteTextures',None,i,C.POINTER(u));del_vao=proc('glDeleteVertexArrays',None,i,C.POINTER(u))

def active_samplers(program):
 # Same sampler enum family handled by the vendored Three WebGLUniforms.
 # Count actual linked uniforms, including array sizes, rather than declarations
 # removed by the GLSL compiler. The app keeps a conservative 16-unit budget.
 sampler_types={0x8b5e,0x8d66,0x8dca,0x8dd2,0x8b62,0x8b5f,0x8dcb,0x8dd3,
                0x8b60,0x8dcc,0x8dd4,0x8dc5,0x8dc1,0x8dcf,0x8dd7,0x8dc4}
 count=i();getprogram(program,0x8B86,C.byref(count));result=[]
 for index in range(count.value):
  name=C.create_string_buffer(256);size=i();kind=u()
  getuniform(program,index,len(name),None,C.byref(size),C.byref(kind),name)
  if kind.value in sampler_types:result.append({'name':name.value.decode(),'size':size.value,'type':hex(kind.value)})
 return result

def error(where):
 e=geterr()
 if e:raise RuntimeError(f'{where}: GL error {e:#x}')
def object_id(gen):
 value=u();gen(1,C.byref(value));return value.value

def framebuffer(width,height):
 fb=object_id(gen_fb);bind_fb(0x8D40,fb)
 tex=object_id(gen_tex);bind_tex(0x0DE1,tex);teximage(0x0DE1,0,0x8058,width,height,0,0x1908,0x1401,None);texparam(0x0DE1,0x2801,0x2601);texparam(0x0DE1,0x2800,0x2601);attach_tex(0x8D40,0x8CE0,0x0DE1,tex,0)
 rb=object_id(gen_rb);bind_rb(0x8D41,rb);storage_rb(0x8D41,0x81A6,width,height);attach_rb(0x8D40,0x8D00,0x8D41,rb)
 assert check_fb(0x8D40)==0x8CD5,'Incomplete framebuffer'
 return fb

def multisample_framebuffer(width,height,samples):
 maximum=i();get_integer(0x8D57,C.byref(maximum))
 assert samples<=maximum.value,f'Native capture requested {samples} samples, driver supports {maximum.value}'
 resolve=framebuffer(width,height)
 fb=object_id(gen_fb);bind_fb(0x8D40,fb)
 color=object_id(gen_rb);bind_rb(0x8D41,color);storage_rb_multisample(0x8D41,samples,0x8058,width,height);attach_rb(0x8D40,0x8CE0,0x8D41,color)
 depth_buffer=object_id(gen_rb);bind_rb(0x8D41,depth_buffer);storage_rb_multisample(0x8D41,samples,0x81A6,width,height);attach_rb(0x8D40,0x8D00,0x8D41,depth_buffer)
 assert check_fb(0x8D40)==0x8CD5,'Incomplete native multisample framebuffer'
 return fb,resolve
texture_cache={}
render_targets={}
def create_render_target(spec):
 fb=object_id(gen_fb);bind_fb(0x8D40,fb)
 tex=object_id(gen_tex);bind_tex(0x0DE1,tex)
 floating=spec.get('component')=='float16'
 teximage(0x0DE1,0,0x881A if floating else 0x8058,spec['width'],spec['height'],0,0x1908,0x140B if floating else 0x1401,None)
 texparam(0x0DE1,0x2801,0x2600 if spec.get('minFilter')==1003 else 0x2601);texparam(0x0DE1,0x2800,0x2600 if spec.get('magFilter')==1003 else 0x2601)
 texparam(0x0DE1,0x2802,0x812F);texparam(0x0DE1,0x2803,0x812F)
 attach_tex(0x8D40,0x8CE0,0x0DE1,tex,0)
 if spec.get('depth',False):
  rb=object_id(gen_rb);bind_rb(0x8D41,rb);storage_rb(0x8D41,0x81A6,spec['width'],spec['height']);attach_rb(0x8D40,0x8D00,0x8D41,rb)
 assert check_fb(0x8D40)==0x8CD5,'Incomplete native target '+spec['id']
 render_targets[spec['id']]={'framebuffer':fb,'texture':tex,**spec}
 return render_targets[spec['id']]

def texture(spec,assets,base):
 if spec.get('renderTarget'):
  assert spec['renderTarget'] in render_targets,'Unknown native target '+spec['renderTarget']
  return render_targets[spec['renderTarget']]['texture']
 key=tuple(spec.get(name) for name in ['texture','textureFile','rawTexture','colorSpace','component','flipY','clamp','wrapS','wrapT','minFilter','magFilter','anisotropy'])
 if key in texture_cache:return texture_cache[key]
 component=spec.get('component','uint8');channels=spec.get('channels',4)
 if spec.get('rawTexture'):
  raw=(base/spec['rawTexture']).read_bytes();size=(spec['width'],spec['height'])
  stride=size[0]*channels*{'uint8':1,'float16':2,'float32':4}[component]
  if spec.get('flipY',False):raw=b''.join(raw[y*stride:(y+1)*stride] for y in range(size[1]-1,-1,-1))
 elif spec.get('textureFile'):
  image=Image.open(base/spec['textureFile']).convert('RGBA')
  if spec.get('flipY',True):image=image.transpose(Image.Transpose.FLIP_TOP_BOTTOM)
  raw=image.tobytes();size=image.size
 elif key[0]:
  image=Image.open(assets/key[0]).convert('RGBA')
  if spec.get('flipY',True):image=image.transpose(Image.Transpose.FLIP_TOP_BOTTOM)
  raw=image.tobytes();size=image.size
 else:raw=bytes([255,255,255,255]);size=(1,1)
 buffer=C.create_string_buffer(raw);tex=object_id(gen_tex);bind_tex(0x0DE1,tex);pixelstore(0x0CF5,1)
 # Color photographs use the same sRGB decode as Three; normals/roughness linear.
 internal=0x8814 if component=='float32' else 0x881A if component=='float16' else 0x8C43 if spec.get('colorSpace')=='srgb' else 0x8058
 if channels==1:internal=0x822E if component=='float32' else 0x822D if component=='float16' else 0x8229
 teximage(0x0DE1,0,internal,*size,0,0x1903 if channels==1 else 0x1908,0x1406 if component=='float32' else 0x140B if component=='float16' else 0x1401,buffer)
 wrap=0x812F if spec.get('clamp') else 0x2901
 wraps={1000:0x2901,1001:0x812F,1002:0x8370}
 filters={1003:0x2600,1004:0x2700,1005:0x2702,1006:0x2601,1007:0x2701,1008:0x2703}
 min_filter=filters.get(spec.get('minFilter'),0x2601 if spec.get('rawTexture') or spec.get('textureFile') else 0x2703)
 texparam(0x0DE1,0x2802,wraps.get(spec.get('wrapS'),wrap));texparam(0x0DE1,0x2803,wraps.get(spec.get('wrapT'),wrap));texparam(0x0DE1,0x2801,min_filter);texparam(0x0DE1,0x2800,filters.get(spec.get('magFilter'),0x2601))
 if spec.get('generateMipmaps',True) or min_filter in [0x2700,0x2701,0x2702,0x2703]:mipmap(0x0DE1)
 if has_anisotropy and spec.get('anisotropy',1)>1:texparamf(0x0DE1,0x84FE,min(spec['anisotropy'],max_anisotropy.value))
 texture_cache[key]=tex;return tex

def uniforms(program,values,assets,base):
 count=i();getprogram(program,0x8B86,C.byref(count));sampler=0;missing=[]
 for index in range(count.value):
  name=C.create_string_buffer(256);size=i();kind=u();getuniform(program,index,len(name),None,C.byref(size),C.byref(kind),name);key=name.value.decode();location=uniloc(program,name.value);value=values.get(key,values.get(key.removesuffix('[0]')))
  if kind.value==0x8B5E:
   active_tex(0x84C0+sampler);tex=texture(value if isinstance(value,dict) else {},assets,base);bind_tex(0x0DE1,tex);uniform1i(location,sampler);sampler+=1
  elif value is None:
   missing.append(key)
  elif kind.value in [0x1404,0x8B56]:uniform1i(location,int(value))
  elif kind.value==0x1406:
   if isinstance(value,list):uniform_f[1](location,size.value,(f*len(value))(*value))
   else:uniform1f(location,float(value))
  elif kind.value in [0x8B50,0x8B51,0x8B52]:
   n={0x8B50:2,0x8B51:3,0x8B52:4}[kind.value];assert len(value)>=size.value*n,(key,'uniform array too short',len(value),size.value*n);uniform_f[n](location,size.value,(f*len(value))(*value))
  elif kind.value in [0x8B5A,0x8B5B,0x8B5C]:
   n={0x8B5A:2,0x8B5B:3,0x8B5C:4}[kind.value];uniform_m[n](location,size.value,0,(f*len(value))(*value))
  else:raise RuntimeError(f'Unsupported uniform type {key}: {kind.value:#x}')
 error('uniforms')
 if missing:raise RuntimeError('Unbound active uniforms: '+', '.join(missing))
 return sampler

def replay_pmrem(recipe,base,assets):
 """Execute unchanged Three PMREM passes with floating radiance intact."""
 compiled={};results={}
 for spec in recipe['targets']:
  create_render_target(spec);viewport(0,0,spec['width'],spec['height']);clearcolor(0,0,0,1);clear(0x4000)
 for shader in recipe['shaders']:
  program,result=compile_pair((base/shader['vertex']).read_text(),(base/shader['fragment']).read_text(),True)
  assert all(result[stage]['ok'] for stage in ['vertex','fragment','link']),(shader['name'],result)
  compiled[shader['name']]=program;results[shader['name']]=result
 disable(0x0B71);disable(0x0BE2);disable(0x0B44);depthmask(0)
 for step in recipe['passes']:
  target=render_targets[step['target']];bind_fb(0x8D40,target['framebuffer']);viewport(*map(int,step['viewport']))
  program=compiled[step['shader']];use(program);uniforms(program,step['uniforms'],assets,base)
  vao=object_id(gen_vao);bind_vao(vao);buffers=[]
  for name,attribute in step['attributes'].items():
   location=attrloc(program,name.encode())
   if location<0:continue
   raw=(base/attribute['file']).read_bytes();data=C.create_string_buffer(raw);buffer=object_id(gen_buf);buffers.append(buffer);bind_buf(0x8892,buffer);buf_data(0x8892,len(raw),data,0x88E4);enable_attr(location);attrptr(location,attribute['itemSize'],0x1406,0,0,None)
  raw=(base/step['index']).read_bytes();data=C.create_string_buffer(raw);buffer=object_id(gen_buf);buffers.append(buffer);bind_buf(0x8893,buffer);buf_data(0x8893,len(raw),data,0x88E4)
  draw(0x0004,step['count'],0x1405,None);error('PMREM '+step['shader']);del_buf(len(buffers),(u*len(buffers))(*buffers));del_vao(1,C.byref(u(vao)))
 finish();depthmask(1)
 for program in compiled.values():delete_program(program)
 print(f"Native PMREM PASS: {len(recipe['passes'])} actual Three passes, RGBA16F radiance, {recipe['name']}",flush=True)
 return {'name':recipe['name'],'method':recipe['method'],'passes':len(recipe['passes']),'output':recipe['output'],'compile':results,'outdoorRadiance':recipe.get('outdoorRadiance')}

render_program_cache={}
def render(case,base,assets):
 width,height=case['width'],case['height'];samples=case.get('samples',0)
 if samples:fb,resolve=multisample_framebuffer(width,height,samples)
 else:fb=resolve=framebuffer(width,height)
 viewport(0,0,width,height);depthmask(1);clearcolor(*case['clearColor']);clear(0x4000|0x0100);enable(0x0B71);depth(0x0203);enable(0x0B44);cullface(0x0405);disable(0x0BE2)
 programs={};results={};sampler_count=0;expected=case.get('expectedCompileFailure',False)
 def program_for(name):
  if name not in programs:
   key=(str(base),name)
   if key not in render_program_cache:render_program_cache[key]=compile_pair((base/(name+'.vert')).read_text(),(base/(name+'.frag')).read_text(),True)
   program,result=render_program_cache[key]
   programs[name]=program;results[name]=result
   assert bool(result['link']['ok'])!=expected,(case['name'],name,result)
  return programs[name],results[name]
 if case.get('shader'):program_for(case['shader'])
 def draw_mesh(mesh,multisampled=False):
  nonlocal sampler_count
  program,result=program_for(mesh.get('shader',case.get('shader')))
  if not result['link']['ok']:return
  use(program);sampler_count=max(sampler_count,uniforms(program,mesh.get('uniforms',case.get('uniforms',{})),assets,base))
  if mesh.get('side',0)==2:disable(0x0B44)
  else:enable(0x0B44);cullface(0x0404 if mesh.get('side',0)==1 else 0x0405)
  (enable if mesh.get('depthTest',True) else disable)(0x0B71)
  if mesh.get('polygonOffset',False):enable(0x8037);polygonoffset(mesh.get('polygonOffsetFactor',0),mesh.get('polygonOffsetUnits',0))
  else:disable(0x8037)
  depthmask(1 if mesh.get('depthWrite',True) else 0)
  if mesh.get('transparent',False):enable(0x0BE2);blendfunc(0x0302,0x0303)
  else:disable(0x0BE2)
  (enable if multisampled and mesh.get('alphaToCoverage',False) else disable)(0x809E)
  vao=object_id(gen_vao);bind_vao(vao);buffers=[]
  for name,attr in mesh['attributes'].items():
   location=attrloc(program,name.encode())
   if location<0:continue
   raw=(base/attr['file']).read_bytes();data=C.create_string_buffer(raw);buffer=object_id(gen_buf);buffers.append(buffer);bind_buf(0x8892,buffer);buf_data(0x8892,len(raw),data,0x88E4);enable_attr(location);attrptr(location,attr['itemSize'],0x1406,0,0,None)
  raw=(base/mesh['index']).read_bytes();data=C.create_string_buffer(raw);buffer=object_id(gen_buf);buffers.append(buffer);bind_buf(0x8893,buffer);buf_data(0x8893,len(raw),data,0x88E4)
  draw(0x0004,mesh['count'],0x1405,None);error('draw '+mesh['sourceMesh']);del_buf(len(buffers),(u*len(buffers))(*buffers));del_vao(1,C.byref(u(vao)))
 for shadow in case.get('shadows',[]):
  target=create_render_target(shadow['target']);bind_fb(0x8D40,target['framebuffer']);viewport(0,0,target['width'],target['height']);depthmask(1);clearcolor(1,1,1,1);clear(0x4000|0x0100)
  for mesh in shadow['draws']:draw_mesh(mesh)
 bind_fb(0x8D40,fb);viewport(0,0,width,height)
 for mesh in case['draws']:draw_mesh(mesh,bool(samples))
 finish()
 if samples:
  bind_fb(0x8CA8,fb);bind_fb(0x8CA9,resolve);blit_framebuffer(0,0,width,height,0,0,width,height,0x4000,0x2600);bind_fb(0x8D40,resolve);error('multisample resolve')
 pixels=(b*(width*height*4))();read(0,0,width,height,0x1908,0x1401,pixels);error('read pixels');image=Image.frombytes('RGBA',(width,height),bytes(pixels)).transpose(Image.Transpose.FLIP_TOP_BOTTOM).convert('RGB');output=base/(case['name']+'.png');image.save(output)
 # These immutable linked programs are reused by subsequent camera/control
 # replays, just as Three reuses a material program. Uniforms are rebound for
 # every draw; source-based emitter dedup never aliases unlike shader strings.
 stat=ImageStat.Stat(image);stddev=stat.stddev;assert expected or max(stddev)>1,'Successful scene program must draw nonuniform textured pixels'
 print('Rendered',case['name'],flush=True)
 return {'name':case['name'],'image':str(output),'compile':results,'samplers':sampler_count,'nativeSamples':samples,'pixelMean':stat.mean,'pixelStddev':stddev,'metadata':case['metadata']}


if __name__ == '__main__':
 if len(sys.argv) < 2:
  raise SystemExit('Usage: shader-compile-native.py manifest.json [--render render-scenes.json]')
 manifest_path = Path(sys.argv[1])
 manifest = json.loads(manifest_path.read_text())
 cases, failures = [], []
 for case in manifest['cases']:
  result = compile_pair((manifest_path.parent / case['vertex']).read_text(), (manifest_path.parent / case['fragment']).read_text())
  if case['expected'] == 'pass':
   passed = all(result[stage]['ok'] for stage in ['vertex', 'fragment', 'link']) and result.get('samplerCount',0) <= 16
  else:
   passed = result['vertex']['ok'] and not result['fragment']['ok'] and not result['link']['ok'] and 'patch' in result['fragment']['log']
  cases.append({**case, 'matchedExpectation': passed, 'result': result})
  if not passed:
   failures.append(case['name'])
   print('FAIL', case['name'], json.dumps(result), flush=True)
 report = {
  'backend': info, 'sourceHashes': manifest.get('sourceHashes', {}), 'harnessHashes':manifest.get('harnessHashes',{}), 'cases': cases,
  'method': 'Actual vendored Three shader assembly, native Mesa EGL/OpenGL ES compile and link. Not a browser test.',
  'activeSamplerBudget':16,
  'maximumActiveSamplers':max((case['result'].get('samplerCount',0) for case in cases),default=0),
 }
 (manifest_path.parent / 'compile-report.json').write_text(json.dumps(report, indent=2))
 if failures:
  raise SystemExit('Native shader gate failed: ' + ', '.join(failures))
 positive = sum(c['expected'] == 'pass' for c in cases)
 negative = len(cases) - positive
 print(f"Native shader gate PASS: {positive} programs compile/link; {negative} original-token variants fail as required. Backend: {info['renderer']} / {info['version']}", flush=True)
 if '--render' in sys.argv:
  try:
   from PIL import Image, ImageDraw, ImageFont, ImageStat, ImageChops
  except ImportError:
   raise SystemExit('UNSUPPORTED native pixel gate: Pillow is required for photographic image upload and PNG output.')
  source = Path(sys.argv[sys.argv.index('--render') + 1])
  scenes = json.loads(source.read_text())
  environment_reports=[replay_pmrem(recipe,source.parent,Path(scenes['assets'])) for recipe in scenes.get('pmrem',[])]
  rendered = [render(case, source.parent, Path(scenes['assets'])) for case in scenes['cases']]
  comparisons = []
  # An ordinary-driving check must exercise VehiclePhysics -> finite bearing
  # envelope -> live tiles -> production mesh/materials. Direct hand-authored
  # deform() stamps cannot establish that this full runtime path is visible.
  by_name = {case['name']: case for case in rendered}
  for driven in rendered:
   metadata = driven.get('metadata', {})
   if not metadata.get('rutDriving') or metadata.get('terrainResetControl'):
    continue
   control_name = driven['name'].removesuffix('-driven') + '-reset-control'
   assert control_name in by_name, 'Every actual-driving view needs its own terrain-reset control'
   control = by_name[control_name]['metadata']
   for key in ['camera', 'cameraMatrix', 'projectionMatrix', 'shadowAnchor', 'timeOfDay', 'toneMappingExposure', 'quality', 'preset', 'transientWaterState']:
    assert metadata[key] == control[key], f'Ordinary rut control changed {key}'
   assert metadata['physics'] == control['physics'], 'Terrain reset must retain the exact final vehicle pose and input record'
   assert metadata['directStampCalls'] == 0 and metadata['physics']['loadedCalls'] > 0
   assert metadata['physics']['supportPlaneCalls'] == metadata['physics']['loadedCalls']
   assert metadata['sourceSoilState']['maxSink'] > 0 and control['sourceSoilState']['maxSink'] == 0
   assert metadata['soil']['maximumRenderHeightError'] < 2e-6
   before = Image.open(source.parent / (control_name + '.png')).convert('RGB')
   after = Image.open(source.parent / (driven['name'] + '.png')).convert('RGB')
   difference = ImageChops.difference(before, after)
   channels = difference.split()
   maximum = ImageChops.lighter(ImageChops.lighter(channels[0], channels[1]), channels[2])
   changed = sum(maximum.histogram()[3:])
   assert changed >= 8, 'Actual ordinary-driving tracks must affect visible pixels: ' + driven['name']
   comparisons.append({'effect': 'ordinary-driving-persistent-ruts', 'route': metadata['route'],
    'cameraRig': metadata['cameraRig'], 'cameraTracksVehicle': metadata['cameraTracksVehicle'],
    'before': control_name, 'after': driven['name'], 'cameraIdentical': True, 'transientWaterIdentical': True,
    'preset': metadata['preset'], 'quality': metadata['quality'],
    'pixelsChangedByAtLeast3': changed, 'meanAbsolutePixelDifference': ImageStat.Stat(difference).mean,
    'changedBounds': difference.getbbox(), 'physics': metadata['physics'], 'soil': metadata['soil'],
    'method': 'Same-source, same-camera reset control after ordinary standing-start driving. Tracking chase views are not fixed-camera cross-version comparisons; pixel counts are not quality ratings.'})
  stone_name='native-hdr-ground-stone-detail'
  stone_case=next((case for case in rendered if case['name']==stone_name),None)
  if stone_case and stone_case['metadata'].get('productionImportedRockCount',0)>0:
   control=stone_name+'-no-imported-rocks'
   assert any(case['name']==control for case in rendered),'A production stone study needs its batch-hidden control'
   before=Image.open(source.parent/(control+'.png'));after=Image.open(source.parent/(stone_name+'.png'))
   difference=ImageChops.difference(before,after);delta=ImageStat.Stat(difference)
   if max(delta.mean)<.005:raise SystemExit('Production imported rocks must visibly contribute to the fixed close-inspection camera')
   comparisons.append({'effect':'production-imported-ground-rocks','before':control,'after':stone_name,'meanAbsolutePixelDifference':delta.mean,'changedBounds':difference.getbbox()})
  if scenes.get('focusedViews'):
   report={'backend':info,'sourceHashes':manifest.get('sourceHashes',{}),'harnessHashes':manifest.get('harnessHashes',{}),'environments':environment_reports,'cases':rendered,'comparisons':comparisons,'completePixelGate':False,'focusedViews':scenes['focusedViews'],'method':'Focused native diagnostic study of actual captured production programs and inputs. The full terrain, water, temporal and shadow pixel gate was not run; not release signoff or a browser screenshot.'}
   (source.parent/'render-report.json').write_text(json.dumps(report,indent=2))
   print(f'Focused native study PASS: {len(rendered)} selected frames; full pixel gate not requested.',flush=True)
   raise SystemExit(0)
  for surface in ['dirt', 'mud']:
   before = Image.open(source.parent / f'native-{surface}-undisturbed.png')
   after = Image.open(source.parent / f'native-{surface}-rutted.png')
   difference = ImageChops.difference(before, after)
   delta = ImageStat.Stat(difference)
   if max(delta.mean) < .1:
    raise SystemExit(f'Native pixel gate failed: {surface} wheel tracks must change visible terrain pixels.')
   comparisons.append({'surface': surface, 'meanAbsolutePixelDifference': delta.mean, 'changedBounds': difference.getbbox()})
  for name,before_name,after_name,minimum in [
    ('planar-scene-reflection','native-water-wetland-no-reflection','native-water-wetland-still',.5),
    ('localized-contact-ripples','native-water-wetland-wake-off','native-water-wetland-wake',.005),
    ('mud-pool-and-rut-response','native-water-mud-still','native-water-mud-wake',.1),
    ('dense-trail-verge-and-grit','native-trail-distant-detail-control','native-trail-dense-verge',.5),
  ]:
   before=Image.open(source.parent/(before_name+'.png'));after=Image.open(source.parent/(after_name+'.png'));difference=ImageChops.difference(before,after);delta=ImageStat.Stat(difference)
   if max(delta.mean)<minimum:raise SystemExit(f'Native pixel gate failed: {name} must visibly affect actual rendered pixels ({delta.mean}).')
   comparisons.append({'effect':name,'before':before_name,'after':after_name,'meanAbsolutePixelDifference':delta.mean,'changedBounds':difference.getbbox()})
  temporal = {}
  for variant in ['legacy','fixed']:
   changes = []
   for frame in range(1,4):
    before=Image.open(source.parent/f'native-temporal-{variant}-water-{frame-1:02}.png').convert('RGB')
    after=Image.open(source.parent/f'native-temporal-{variant}-water-{frame:02}.png').convert('RGB')
    difference=ImageChops.difference(before,after);delta=ImageStat.Stat(difference)
    changes.append({'from':frame-1,'to':frame,'meanAbsolutePixelDifference':delta.mean,'changedBounds':difference.getbbox()})
   temporal[variant]=changes
  if not all(change['changedBounds'] is None for change in temporal['fixed']):
   raise SystemExit('Native temporal gate failed: fixed stationary water must render identically across repeated mirror captures.')
  if max(max(change['meanAbsolutePixelDifference']) for change in temporal['legacy'])<.1:
   raise SystemExit('Native temporal negative fixture did not reproduce visible v1.3 reflection flashing.')
  comparisons.append({'effect':'stationary-reflection-temporal-stability','frames':4,'cameraAndWaterTimeFrozen':True,'variants':temporal})
  if (source.parent/'native-hdr-bank-tree.png').exists():
   before=Image.open(source.parent/'native-hdr-bank-tree-no-scenery.png');after=Image.open(source.parent/'native-hdr-bank-tree.png')
   difference=ImageChops.difference(before,after);delta=ImageStat.Stat(difference)
   if max(delta.mean)<1:raise SystemExit('Native HDR scenery negative control must visibly remove actual foliage/trunk/ground-detail geometry.')
   comparisons.append({'effect':'HDR-runtime-scenery-contribution','before':'native-hdr-bank-tree-no-scenery','after':'native-hdr-bank-tree','meanAbsolutePixelDifference':delta.mean,'changedBounds':difference.getbbox()})
   before=Image.open(source.parent/'native-hdr-bank-tree-no-shadows.png');after=Image.open(source.parent/'native-hdr-bank-tree.png')
   difference=ImageChops.difference(before,after);delta=ImageStat.Stat(difference)
   # The shadow occupies the tree/ground region, not the large unchanged sky.
   # Keep this fixed camera ROI identical for all models; report the full image
   # difference too. A thinner valid crown must not fail solely on sky dilution.
   roi=(330,120,820,690);roi_delta=ImageStat.Stat(difference.crop(roi))
   if max(roi_delta.mean)<.1:raise SystemExit('Native HDR sun shadows must visibly affect the fixed bank-tree/ground region.')
   comparisons.append({'effect':'HDR-runtime-sun-shadow-contribution','before':'native-hdr-bank-tree-no-shadows','after':'native-hdr-bank-tree','meanAbsolutePixelDifference':delta.mean,'changedBounds':difference.getbbox(),'fixedRegion':roi,'regionMeanAbsolutePixelDifference':roi_delta.mean})
  # Evidence is assembled only from the actual native renders, never painted
  # stand-ins. Header and frame labels sit outside the pixel comparison region.
  try:font=ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf',18)
  except OSError:font=ImageFont.load_default()
  frames=[]
  sheet=Image.new('RGB',(1280,516),'#182323');pen=ImageDraw.Draw(sheet)
  pen.text((16,10),'Stationary mirror captures | actual scene + GLSL | frozen camera, water and light',(229,238,229),font=font)
  for frame in range(4):
   comparison=Image.new('RGB',(1280,472),'#182323');labels=ImageDraw.Draw(comparison)
   for row,variant in enumerate(['legacy','fixed']):
    picture=Image.open(source.parent/f'native-temporal-{variant}-water-{frame:02}.png').convert('RGB')
    comparison.paste(picture,(row*640,48))
    labels.text((row*640+14,14),('v1.3 mutable normal' if variant=='legacy' else 'v1.4 owned normal')+f' | capture {frame+1}',(229,238,229),font=font)
    sheet.paste(picture.resize((320,210),Image.Resampling.LANCZOS),(frame*320,65+row*238))
    pen.text((frame*320+10,40+row*238),f'{variant} / {frame+1}',(229,238,229),font=font)
   frames.append(comparison)
  frames[0].save(source.parent/'native-water-temporal-comparison.gif',save_all=True,append_images=frames[1:],duration=240,loop=0)
  sheet.save(source.parent/'native-water-temporal-contact-sheet.png')
  render_report = {
   'backend': info, 'sourceHashes': manifest.get('sourceHashes', {}), 'harnessHashes':manifest.get('harnessHashes',{}), 'environments':environment_reports, 'cases': rendered, 'comparisons': comparisons, 'completePixelGate':True,
   'method': 'Native EGL/OpenGL ES software render, not a browser screenshot. Actual world geometry, soil/depth attributes, shaders, photographed textures, scene lights and planar mirror captures. Water controls isolate reflection and contact wake contribution. HDR study scenes replay runtime outdoor HDR PMREM in floating radiance, actual sun depth/shadow settings and 4-sample native antialiasing. Original material mechanism scenes omit IBL and shadows.',
  }
  (source.parent / 'render-report.json').write_text(json.dumps(render_report, indent=2))
  print('Native pixel gate PASS: real ruts, reflections and contact wakes affect pixels; fixed stationary captures are identical while the original shared-normal fixture flashes. Images:', source.parent, flush=True)
