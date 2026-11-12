import uuid,os,requests,subprocess,shutil,re
SU=os.environ["SUPABASE_URL"];SK=os.environ["SUPABASE_SERVICE_ROLE_KEY"]
H={"apikey":SK,"Content-Type":"application/json","User-Agent":"curl/8"}
r=requests.post(f"{SU}/rest/v1/categories",headers={**H,"Prefer":"return=representation"},json={"name":"User Manual"});r.raise_for_status()
cat=r.json()[0]["id"];print("cat",cat)
for mid in ["a4051372-fcc1-4a64-8394-5d7c75d04fa8","af595d36-9a69-4c55-8dbe-d88d7fee856b"]:
  r=requests.patch(f"{SU}/rest/v1/catalogs?id=eq.{mid}",headers=H,json={"category_id":cat});r.raise_for_status()
f="hr2.pdf";n=44;cid=str(uuid.uuid4())
shutil.copy(f,f"/dev-server/public/catalogs/{cid}.pdf")
subprocess.run(["pdftoppm","-jpeg","-r","80","-f","1","-l","1","-singlefile",f,f"/dev-server/public/catalogs/{cid}"],check=True,stderr=subprocess.DEVNULL)
r=requests.post(f"{SU}/rest/v1/catalogs",headers=H,json={"id":cid,"title":"دليل تشغيل هايثيوم HiTHIUM ESM HV Series","description":"دليل التشغيل والتركيب (User Manual) لبطاريات الجهد العالي HeroEE ESM HV","keywords":"HiTHIUM, Hithium, HeroEE, ESM HV, ESM-HV, high voltage battery, بطارية جهد عالي, دليل التشغيل, user manual, operation manual, هايثيوم, تركيب","category_id":cat,"file_path":f"/catalogs/{cid}.pdf","cover_path":f"/catalogs/{cid}.jpg","page_count":n,"language":"ar"});r.raise_for_status()
bidi=re.compile('[\u200e\u200f\u202a-\u202e]')
rows=[]
for p in range(1,n+1):
  t=subprocess.run(["pdftotext","-f",str(p),"-l",str(p),f,"-"],capture_output=True,text=True).stdout
  t=bidi.sub('',t).strip()
  if t: rows.append({"catalog_id":cid,"page":p,"content":t})
r=requests.post(f"{SU}/rest/v1/catalog_chunks",headers=H,json=rows);r.raise_for_status()
print(cid,len(rows))
