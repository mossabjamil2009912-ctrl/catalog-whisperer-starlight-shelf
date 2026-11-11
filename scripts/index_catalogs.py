# Re-runnable indexer: embeds catalog chunks and builds catalog profiles that are missing (REST + service key).
# Usage: python3 scripts/index_catalogs.py chunks|profiles
import os,json,re,requests,concurrent.futures as cf,time,sys
K=os.environ["LOVABLE_API_KEY"];G="https://ai.gateway.lovable.dev/v1"
SU=os.environ["SUPABASE_URL"];SK=os.environ["SUPABASE_SERVICE_ROLE_KEY"]
H={"apikey":SK,"Content-Type":"application/json","User-Agent":"curl/8"}
def get_all(path):
  out=[];off=0
  while True:
    r=requests.get(f"{SU}/rest/v1/{path}",headers={**H,"Range":f"{off}-{off+999}"});r.raise_for_status();d=r.json();out+=d
    if len(d)<1000: return out
    off+=1000
def post(path,body):
  for a in range(6):
    r=requests.post(G+path,headers={"Authorization":"Bearer "+K},json=body,timeout=240)
    if r.ok: return r.json()
    if r.status_code==429 or r.status_code>=500: time.sleep(2**a*2);continue
    raise Exception(r.status_code,r.text[:200])
  raise Exception("gateway retries exhausted")
def emb(texts):
  d=post("/embeddings",{"model":"google/gemini-embedding-2","input":texts})["data"]
  return [x["embedding"] for x in sorted(d,key=lambda x:x["index"])]
garb=lambda t:len(re.findall(r'[\uFB50-\uFEFF]',t))>20
cats={c["id"]:c for c in get_all("catalogs?select=id,title,keywords,description")}
schema={"type":"object","additionalProperties":False,"required":["product_type","summary_en","summary_ar","models","search_terms","specs"],"properties":{
 "product_type":{"type":"string"},"summary_en":{"type":"string"},"summary_ar":{"type":"string"},
 "models":{"type":"array","items":{"type":"string"}},"search_terms":{"type":"array","items":{"type":"string"}},
 "specs":{"type":"array","items":{"type":"object","additionalProperties":False,"required":["model","key_specs"],"properties":{"model":{"type":"string"},"key_specs":{"type":"string"}}}}}}
def profile(c):
  cid,title,kw,desc=c["id"],c["title"],c["keywords"],c["description"]
  rows=get_all(f"catalog_chunks?select=page,content&catalog_id=eq.{cid}&order=page")
  txt="\n".join(f"[p{x['page']}] {x['content']}" for x in rows if not garb(x["content"]))[:40000]
  prompt=f"""Catalog title: {title}\nKeywords: {kw}\nDescription: {desc}\n\nCatalog text:\n{txt}\n\nBuild a product profile ONLY from this text (never invent). product_type: e.g. hybrid inverter, on-grid inverter, LiFePO4 battery, solar module, ESS. summary_en/summary_ar: 3-5 sentences on what it is, function, typical use (home/commercial/off-grid), key differentiators. models: every model code. search_terms: synonyms, Arabic names, Arabic transliterations of brand/series (e.g. فيدوس for FIDUS, داي for Deye, سوليس for Solis), colloquial Arabic/Yemeni terms, function descriptions, both languages. specs: per model, compact line with power kW, voltage, Ah, nominal and usable kWh (compute V*Ah if missing and mark 'calc'), MPPT, efficiency, dimensions, weight, IP, cycles, when present."""
  j=post("/chat/completions",{"model":"openai/gpt-6-astra","reasoning_effort":"low","messages":[{"role":"user","content":prompt}],"response_format":{"type":"json_schema","json_schema":{"name":"p","strict":True,"schema":schema}}})
  p=json.loads(j["choices"][0]["message"]["content"])
  doc=f"{title}\nType: {p['product_type']}\nModels: {', '.join(p['models'])}\nTerms: {', '.join(p['search_terms'])}\n{p['summary_en']}\n{p['summary_ar']}\n"+"\n".join(f"{s['model']}: {s['key_specs']}" for s in p['specs'])
  e=emb([doc[:8000]])[0]
  r=requests.post(f"{SU}/rest/v1/catalog_profiles",headers={**H,"Prefer":"resolution=merge-duplicates"},json={"catalog_id":cid,"summary_ar":p["summary_ar"],"summary_en":p["summary_en"],"specs":p,"embedding":str(e)});r.raise_for_status()
  return "ok "+title
def safe(c):
  try: return profile(c)
  except Exception as x: return "ERR "+c["title"]+" "+str(x)[:150]
if sys.argv[1]=="chunks":
  rows=get_all("catalog_chunks?select=id,catalog_id,page,content&embedding=is.null")
  print("todo",len(rows),flush=True)
  def do(b):
    try:
      v=emb([f"{cats[x['catalog_id']]['title']} | page {x['page']}\n{x['content'][:6000]}" for x in b])
      for x,e in zip(b,v):
        requests.patch(f"{SU}/rest/v1/catalog_chunks?id=eq.{x['id']}",headers=H,json={"embedding":str(e)}).raise_for_status()
      return len(b)
    except Exception as x:
      print("ERR batch",str(x)[:150],flush=True);return 0
  n=0
  for k in cf.ThreadPoolExecutor(4).map(do,[rows[i:i+40] for i in range(0,len(rows),40)]):
    n+=k;print("embedded",n,flush=True)
  print("done",n,flush=True)
else:
  have={x["catalog_id"] for x in get_all("catalog_profiles?select=catalog_id")}
  todo=[c for c in cats.values() if c["id"] not in have];print("todo",len(todo),flush=True)
  for t in cf.ThreadPoolExecutor(4).map(safe,todo): print(t,flush=True)
  print("done",flush=True)
