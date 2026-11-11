import { useEffect, useState } from "react";
import { Settings, X } from "lucide-react";
import { toast } from "sonner";
import { getSavedBaseUrl, setSavedBaseUrl, syncBaseUrl } from "@/lib/site-url";
import { setPublishUrl } from "@/lib/settings.functions";

export function PublishUrlSettings() {
  const [open, setOpen] = useState(false);
  const [val, setVal] = useState("");
  useEffect(() => { if (open) { setVal(getSavedBaseUrl()); syncBaseUrl().then(() => setVal(getSavedBaseUrl())); } }, [open]);
  const persist = async (v: string) => {
    try { await setPublishUrl({ data: { url: v } }); setSavedBaseUrl(v); return true; }
    catch { toast.error("تعذّر الحفظ، حاول مرة أخرى"); return false; }
  };
  const preview = (val.trim().replace(/\/+$/, "") || (typeof window !== "undefined" ? window.location.origin : "")) + "/catalog/…";
  const save = async () => {
    const v = val.trim();
    if (v && !/^https?:\/\/[^\s/]+/.test(v)) { toast.error("اكتب رابطاً صحيحاً يبدأ بـ https://"); return; }
    if (!(await persist(v))) return;
    toast.success(v ? "تم حفظ رابط النشر" : "تمت العودة للرابط الافتراضي");
    setOpen(false);
  };
  return (
    <>
      <button onClick={() => setOpen(true)} aria-label="إعدادات رابط النشر" className="absolute left-0 top-0 rounded-full p-2 text-muted-foreground hover:text-primary">
        <Settings className="h-5 w-5" />
      </button>
      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 p-4" onClick={() => setOpen(false)}>
          <div dir="rtl" className="w-full max-w-md space-y-4 rounded-2xl border border-border bg-card p-5 text-right" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-bold">رابط النشر</h2>
              <button onClick={() => setOpen(false)} aria-label="إغلاق"><X className="h-5 w-5" /></button>
            </div>
            <p className="text-sm text-muted-foreground">كل روابط مشاركة الكتالوجات ستستخدم هذا الرابط على كل الأجهزة.</p>
            <input dir="ltr" value={val} onChange={(e) => setVal(e.target.value)} placeholder="https://example.lovable.app" className="w-full rounded-xl border border-input bg-background px-3 py-3 text-base outline-none focus:border-primary" />
            <p dir="ltr" className="break-all text-left text-xs text-muted-foreground">{preview}</p>
            <div className="flex gap-2">
              <button onClick={save} className="flex-1 rounded-xl bg-primary py-3 font-semibold text-primary-foreground">حفظ</button>
              <button onClick={async () => { if (!(await persist(""))) return; setVal(""); toast.success("تمت العودة للرابط الافتراضي"); setOpen(false); }} className="rounded-xl border border-border px-4 py-3">افتراضي</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
