// hrcore-attendance.jsx — เวลาทำงานและการลา : นำเข้าไฟล์ Excel/CSV รายเดือน + ดูข้อมูลย้อนหลัง
const { useState: useAT, useEffect: useATE } = React;

// หัวตารางในไฟล์ → คีย์ที่ระบบใช้  (ต้องตรงกับแบบฟอร์มที่แจก)
const ATT_MAP = {
  "รหัสพนักงาน": "employee_id",
  "วันทำงาน": "work_days",
  "ขาดงาน": "absent_days",
  "มาสาย (ครั้ง)": "late_count",
  "มาสาย (นาที)": "late_minutes",
  "กลับก่อน (ครั้ง)": "early_count",
  "กลับก่อน (นาที)": "early_minutes",
  "ลาป่วย": "sick_days",
  "ลากิจ": "personal_days",
  "พักผ่อนประจำปี": "annual_days",
  "ลาคลอด": "maternity_days",
  "ลาทหาร": "military_days",
  "ลาบวช": "ordination_days",
  "ลาอบรม": "training_days",
  "ลาเพื่อทำหมัน": "sterilize_days",
  "ลาเพื่อสมรส": "marriage_days",
  "ลาเพื่องานศพ": "funeral_days",
  "อุบัติเหตุในงาน": "accident_days",
  "ลาอื่นๆ": "other_days",
  "OT x1": "ot1_hours",
  "OT x1.5": "ot15_hours",
  "OT x2": "ot2_hours",
  "OT x3": "ot3_hours",
  "หมายเหตุ": "note",
};
const ATT_NUMKEYS = Object.values(ATT_MAP).filter((k) => k !== "employee_id" && k !== "note");
const TH_MONTHS = ["ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.", "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค."];

// อ่าน CSV ที่มีเครื่องหมายคำพูดและคอมมาในข้อความได้
function attParseCsv(text) {
  const rows = []; let cur = [], val = "", q = false;
  text = String(text || "").replace(/^﻿/, "");
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) {
      if (c === '"' && text[i + 1] === '"') { val += '"'; i++; }
      else if (c === '"') q = false;
      else val += c;
    } else if (c === '"') q = true;
    else if (c === ",") { cur.push(val); val = ""; }
    else if (c === "\n") { cur.push(val); rows.push(cur); cur = []; val = ""; }
    else if (c !== "\r") val += c;
  }
  if (val !== "" || cur.length) { cur.push(val); rows.push(cur); }
  return rows.filter((r) => r.some((x) => String(x).trim() !== ""));
}

function HRCAttendance() {
  const canImport = HRC.can("employee.edit") || (HRC.user && HRC.user.role === "admin");
  const nowY = new Date().getFullYear() + 543;

  const [periods, setPeriods] = useAT(null);
  const [sel, setSel] = useAT("");
  const [rows, setRows] = useAT(null);
  const [err, setErr] = useAT("");

  // ---- ฟอร์มนำเข้า ----
  const [open, setOpen] = useAT(false);
  const [year, setYear] = useAT(nowY);
  const [mFrom, setMFrom] = useAT(1);
  const [mTo, setMTo] = useAT(1);
  const [note, setNote] = useAT("");
  const [preview, setPreview] = useAT(null);   // { ok:[], empty:[], fileName }
  const [busy, setBusy] = useAT(false);
  const [result, setResult] = useAT(null);

  const loadPeriods = async () => {
    const { data, error } = await window.sb.from("attendance_periods").select("*").order("id", { ascending: false });
    if (error) { setErr(error.message); setPeriods([]); return; }
    setPeriods(data || []);
    if (!sel && data && data.length) setSel(data[0].id);
  };
  useATE(() => { loadPeriods(); }, []);

  useATE(() => {
    if (!sel) { setRows(null); return; }
    (async () => {
      setRows(null);
      const { data, error } = await window.sb.from("attendance_monthly")
        .select("*").eq("period_id", sel).order("employee_id");
      if (error) { setErr(error.message); setRows([]); return; }
      setRows(data || []);
    })();
  }, [sel]);

  // ---- อ่านไฟล์ที่เลือก ----
  const onFile = async (e) => {
    const file = e.target.files && e.target.files[0];
    if (!file) return;
    setResult(null); setErr("");
    let text = "";
    try { text = await file.text(); } catch (_) { setErr("อ่านไฟล์ไม่ได้"); return; }

    const raw = attParseCsv(text);
    if (!raw.length) { setErr("ไฟล์ว่าง"); return; }
    const head = raw[0].map((h) => String(h).trim());
    const idx = {};
    head.forEach((h, i) => { if (ATT_MAP[h]) idx[ATT_MAP[h]] = i; });
    const missing = Object.values(ATT_MAP).filter((k) => !(k in idx));
    if (missing.length) {
      setErr("หัวตารางไม่ตรงกับแบบฟอร์ม — ขาดคอลัมน์: " + missing.slice(0, 5).join(", ") + (missing.length > 5 ? " …" : ""));
      setPreview(null); return;
    }

    const ok = [], empty = [];
    for (const r of raw.slice(1)) {
      const emp = String(r[idx.employee_id] ?? "").trim();
      if (!emp) continue;
      const o = { employee_id: emp };
      let hasNum = false;
      for (const k of ATT_NUMKEYS) {
        const v = String(r[idx[k]] ?? "").trim();
        if (v !== "") { o[k] = v; if (Number(v.replace(/,/g, "")) !== 0) hasNum = true; }
      }
      const nt = String(r[idx.note] ?? "").trim();
      if (nt) o.note = nt;
      if (!hasNum) { empty.push({ id: emp, note: nt }); continue; }
      ok.push(o);
    }
    setPreview({ ok, empty, fileName: file.name });
  };

  const doImport = async () => {
    if (!preview || !preview.ok.length) return;
    setBusy(true); setErr(""); setResult(null);
    const { data, error } = await window.sb.rpc("attendance_import", {
      p_year_th: Number(year), p_month: Number(mFrom), p_month_to: Number(mTo),
      p_rows: preview.ok, p_note: note || null,
    });
    setBusy(false);
    if (error) { setErr(error.message); return; }
    setResult(data);
    setPreview(null);
    await loadPeriods();
    if (data && data.period) setSel(data.period);
  };

  const cur = (periods || []).find((p) => p.id === sel);
  const sum = (f) => (rows || []).reduce((t, r) => t + Number(r[f] || 0), 0);
  const round1 = (n) => Math.round(n * 10) / 10;

  const empMap = {};
  (HRC.employees || []).forEach((e) => { empMap[e.id] = e; });

  const cols = [
    { key: "employee_id", label: "รหัส", width: 90 },
    { key: "_name", label: "ชื่อ-สกุล", render: (r) => (empMap[r.employee_id] && empMap[r.employee_id].name) || r.employee_id },
    { key: "_dept", label: "หน่วยงาน", render: (r) => (empMap[r.employee_id] ? HRC.deptName(empMap[r.employee_id].dept) : "—") },
    { key: "work_days", label: "วันทำงาน", align: "right" },
    { key: "absent_days", label: "ขาดงาน", align: "right" },
    { key: "late_count", label: "มาสาย", align: "right", render: (r) => (r.late_count || 0) + " ครั้ง" },
    { key: "total_leave_days", label: "ลารวม", align: "right" },
    { key: "total_ot_hours", label: "OT (ชม.)", align: "right" },
    { key: "note", label: "หมายเหตุ" },
  ];

  return (
    <div className="grid">
      <Crumb items={[{ label: "HR Core" }, { label: "เวลาทำงานและการลา" }]} />
      <div className="page-head">
        <div>
          <h1>เวลาทำงานและการลา</h1>
          <p>นำเข้าข้อมูลจากรายงานตอกบัตรรายเดือน · ใช้เป็นข้อมูลของการ์ด "การเข้างานและการลา" ในแดชบอร์ด</p>
        </div>
        {canImport ? (
          <button className="btn btn-pri" onClick={() => { setOpen(true); setResult(null); setPreview(null); setErr(""); }}>
            ＋ นำเข้าไฟล์
          </button>
        ) : null}
      </div>

      {err ? <ErrorState text={err} /> : null}

      {periods === null ? <LoadingState text="กำลังโหลดงวดข้อมูล…" /> : null}

      {periods && periods.length === 0 ? (
        <EmptyState icon="clock" title="ยังไม่มีข้อมูลเวลาทำงาน"
          sub={canImport ? "กดปุ่ม “นำเข้าไฟล์” แล้วเลือกไฟล์ที่กรอกตามแบบฟอร์ม" : "รอฝ่ายบุคคลนำเข้าข้อมูล"} />
      ) : null}

      {periods && periods.length > 0 ? (
        <div className="card">
          <div className="card-pad" style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
            <label style={{ fontSize: 13, fontWeight: 600 }}>งวดข้อมูล</label>
            <select value={sel} onChange={(e) => setSel(e.target.value)} style={{ padding: "7px 10px", minWidth: 220 }}>
              {periods.map((p) => (
                <option key={p.id} value={p.id}>{p.label || p.id} · {p.row_count} คน</option>
              ))}
            </select>
            {cur ? (
              <span style={{ fontSize: 12.5, color: "#5b6b86" }}>
                นำเข้าโดย {cur.imported_by || "—"} · {new Date(cur.imported_at).toLocaleString("th-TH")}
                {cur.note ? " · " + cur.note : ""}
              </span>
            ) : null}
          </div>
        </div>
      ) : null}

      {rows && rows.length > 0 ? (
        <>
          <div className="grid" style={{ gridTemplateColumns: "repeat(auto-fit,minmax(180px,1fr))" }}>
            <Stat icon="users" label="พนักงานในงวด" value={rows.length} tone="#2563eb" soft="#e8effb" />
            <Stat icon="clock" label="วันทำงานเฉลี่ย" value={round1(sum("work_days") / rows.length)} tone="#0d9488" soft="#e3f5f2" />
            <Stat icon="alert" label="ขาดงานรวม (วัน)" value={round1(sum("absent_days"))} tone="#e11d48" soft="#fde8ec" />
            <Stat icon="clock" label="มาสายรวม (ครั้ง)" value={sum("late_count")} tone="#e08a00" soft="#fdf1dc" />
            <Stat icon="calendar" label="ลารวม (วัน)" value={round1(sum("total_leave_days"))} tone="#7c3aed" soft="#f0e9fd" />
            <Stat icon="chart" label="OT รวม (ชม.)" value={round1(sum("total_ot_hours"))} tone="#0891b2" soft="#e3f3f7" />
          </div>
          <div className="card">
            <DataTable rows={rows} columns={cols} rowKey="id"
              searchFields={["employee_id", "note"]}
              exportName={"เวลาทำงาน-" + sel} pageSize={25} />
          </div>
        </>
      ) : null}

      {rows && rows.length === 0 && sel ? <EmptyState icon="clock" title="งวดนี้ยังไม่มีข้อมูล" /> : null}

      {open ? (
        <HRCDrawer title="นำเข้าข้อมูลเวลาทำงานและการลา"
          sub="ไฟล์ .csv ตามแบบฟอร์ม · นำเข้าซ้ำงวดเดิมจะทับข้อมูลเดิม"
          width={620}
          onClose={() => setOpen(false)}
          footer={
            <>
              <button className="btn" onClick={() => setOpen(false)}>ปิด</button>
              <button className="btn btn-pri" disabled={busy || !preview || !preview.ok.length} onClick={doImport}>
                {busy ? "กำลังนำเข้า…" : preview ? "นำเข้า " + preview.ok.length + " คน" : "เลือกไฟล์ก่อน"}
              </button>
            </>
          }>
          <div className="grid" style={{ gap: 14 }}>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10 }}>
              <div>
                <label style={{ display: "block", fontSize: 12, color: "#5b6b86", marginBottom: 5 }}>ปี (พ.ศ.)</label>
                <input type="number" value={year} onChange={(e) => setYear(e.target.value)} />
              </div>
              <div>
                <label style={{ display: "block", fontSize: 12, color: "#5b6b86", marginBottom: 5 }}>เดือนเริ่ม</label>
                <select value={mFrom} onChange={(e) => { setMFrom(+e.target.value); if (+e.target.value > mTo) setMTo(+e.target.value); }}>
                  {TH_MONTHS.map((m, i) => <option key={i} value={i + 1}>{m}</option>)}
                </select>
              </div>
              <div>
                <label style={{ display: "block", fontSize: 12, color: "#5b6b86", marginBottom: 5 }}>ถึงเดือน</label>
                <select value={mTo} onChange={(e) => setMTo(+e.target.value)}>
                  {TH_MONTHS.map((m, i) => <option key={i} value={i + 1} disabled={i + 1 < mFrom}>{m}</option>)}
                </select>
              </div>
            </div>
            <div style={{ fontSize: 12, color: "#8a97ab", marginTop: -8 }}>
              ถ้าไฟล์เป็นข้อมูลเดือนเดียว ให้เลือกเดือนเริ่มกับถึงเดือนเป็นเดือนเดียวกัน
            </div>

            <div>
              <label style={{ display: "block", fontSize: 12, color: "#5b6b86", marginBottom: 5 }}>หมายเหตุของงวด (ไม่บังคับ)</label>
              <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="เช่น จากรายงาน TMUSR339" />
            </div>

            <div style={{ border: "1.5px dashed #c9d4e5", borderRadius: 12, padding: 18, textAlign: "center", background: "#f8fafd" }}>
              <input type="file" accept=".csv,text/csv" onChange={onFile} style={{ fontSize: 13 }} />
              <div style={{ fontSize: 12, color: "#8a97ab", marginTop: 8 }}>
                บันทึกจาก Excel เป็น <b>CSV UTF-8</b> เพื่อให้ภาษาไทยไม่เพี้ยน
              </div>
            </div>

            {preview ? (
              <div style={{ border: "1px solid #e4e9f2", borderRadius: 12, padding: 14, background: "#fff" }}>
                <div style={{ fontWeight: 700, fontSize: 13.5, marginBottom: 8 }}>ตรวจก่อนนำเข้า · {preview.fileName}</div>
                <div style={{ fontSize: 13, color: "#16a34a", marginBottom: 4 }}>
                  ✓ พร้อมนำเข้า <b>{preview.ok.length}</b> คน
                </div>
                {preview.empty.length ? (
                  <div style={{ fontSize: 12.5, color: "#e08a00" }}>
                    ⚠ ไม่มีตัวเลขเลย {preview.empty.length} คน — จะถูกข้าม ไม่บันทึกเป็น 0
                    <div style={{ marginTop: 5, color: "#6b7a94", maxHeight: 110, overflow: "auto" }}>
                      {preview.empty.map((e) => (
                        <div key={e.id}>· {e.id}{e.note ? " — " + e.note : ""}</div>
                      ))}
                    </div>
                  </div>
                ) : null}
              </div>
            ) : null}

            {result ? (
              <div style={{ border: "1.5px solid #16a34a", borderRadius: 12, padding: 14, background: "#f2fbf5" }}>
                <div style={{ fontWeight: 700, color: "#16a34a" }}>นำเข้าสำเร็จ · งวด {result.label || result.period}</div>
                <div style={{ fontSize: 13, marginTop: 5 }}>บันทึก {result.imported} คน</div>
                {result.skipped > 0 ? (
                  <div style={{ fontSize: 12.5, color: "#e11d48", marginTop: 6 }}>
                    ข้าม {result.skipped} แถว (ไม่มีรหัสนี้ในฐานข้อมูลพนักงาน):
                    <div style={{ marginTop: 4, color: "#6b7a94", maxHeight: 110, overflow: "auto" }}>
                      {(result.skipped_rows || []).map((s, i) => <div key={i}>· {s.employee_id}</div>)}
                    </div>
                  </div>
                ) : null}
              </div>
            ) : null}
          </div>
        </HRCDrawer>
      ) : null}
    </div>
  );
}
