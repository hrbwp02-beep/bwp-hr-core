// hrcore-empsync.jsx — นำเข้าทะเบียนพนักงานจาก Bplus : ตรวจก่อน แล้วค่อยบันทึก
const { useState: useES } = React;

// หัวตารางในไฟล์ → คีย์ที่ระบบใช้
const EMP_MAP = {
  "รหัสพนักงาน": "employee_id",
  "ชื่อ-สกุล": "name",
  "ตำแหน่ง": "position",
  "หน่วยงาน": "dept",
  "ระดับตำแหน่ง": "level",
  "วันเริ่มงาน": "hire_date",
  "สถานะ": "employment_status",
  "วันลาออก": "resign_date",
  "เหตุผลลาออก": "resign_reason",
  "เพศ": "gender",
  "วันเกิด": "birth_date",
  "ประเภทการจ้าง": "employment_type",
  "รหัสหัวหน้างาน": "supervisor_id",
  "อีเมล": "email",
  "เบอร์โทร": "phone",
  "วุฒิการศึกษา": "education",
  "สัญชาติ": "nationality",
  "สถานที่ทำงาน": "work_location",
};
const EMP_HEADS = Object.keys(EMP_MAP);
const EMP_REQUIRED = ["รหัสพนักงาน", "ชื่อ-สกุล", "ตำแหน่ง"];

const EMP_STATUS_TH = {
  ACTIVE: "ทำงานอยู่", PROBATION: "ทดลองงาน", RESIGNED: "ลาออก",
  TERMINATED: "เลิกจ้าง", RETIRED: "เกษียณ", ON_LEAVE: "ลาพัก", SUSPENDED: "พักงาน",
};

// วันที่ ค.ศ. → dd/mm/พ.ศ. (รูปแบบเดียวกับที่ Bplus ใช้)
function esThaiDate(d) {
  if (!d) return "";
  const t = new Date(d);
  if (isNaN(t)) return "";
  const p = (n) => String(n).padStart(2, "0");
  return p(t.getDate()) + "/" + p(t.getMonth() + 1) + "/" + (t.getFullYear() + 543);
}

function HRCEmpSync() {
  const canImport = HRC.can("employee.edit") || (HRC.user && HRC.user.role === "admin");

  const [preview, setPreview] = useES(null);   // ผลตรวจจากโหมดทดลอง
  const [rows, setRows] = useES(null);         // แถวที่อ่านได้จากไฟล์
  const [fileName, setFileName] = useES("");
  const [busy, setBusy] = useES(false);
  const [err, setErr] = useES("");
  const [result, setResult] = useES(null);     // ผลบันทึกจริง

  // ---------- ดาวน์โหลดแบบฟอร์มพร้อมข้อมูลปัจจุบัน ----------
  const downloadTemplate = () => {
    const esc = (v) => {
      const s = v == null ? "" : String(v);
      return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
    };
    const lines = [EMP_HEADS.join(",")];
    (HRC.employees || []).slice()
      .sort((a, b) => String(a.id).localeCompare(String(b.id)))
      .forEach((e) => {
        lines.push([
          e.id, e.name, e.position, HRC.deptName(e.dept), e.level,
          esThaiDate(e.hire_date),
          EMP_STATUS_TH[String(e.employment_status || "ACTIVE").toUpperCase()] || e.employment_status,
          esThaiDate(e.resign_date), e.resign_reason, e.gender, esThaiDate(e.birth_date),
          HRC.etypeName ? HRC.etypeName(e.employment_type_id) : "",
          e.supervisor_id, e.email, e.phone, e.education, e.nationality, e.work_location,
        ].map(esc).join(","));
      });
    const blob = new Blob(["﻿" + lines.join("\r\n")], { type: "text/csv;charset=utf-8;" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "ทะเบียนพนักงาน-สำหรับเทียบกับ Bplus.csv";
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  };

  // ---------- อ่านไฟล์ แล้วส่งตรวจแบบไม่บันทึก ----------
  const onFile = async (e) => {
    const file = e.target.files && e.target.files[0];
    if (!file) return;
    setErr(""); setResult(null); setPreview(null); setRows(null);

    let text = "";
    try { text = await file.text(); } catch (_) { setErr("อ่านไฟล์ไม่ได้"); return; }

    const raw = attParseCsv(text);          // ใช้ตัวอ่าน CSV ตัวเดียวกับหน้าเวลาทำงาน
    if (!raw.length) { setErr("ไฟล์ว่าง"); return; }

    const head = raw[0].map((h) => String(h).trim());
    const idx = {};
    head.forEach((h, i) => { if (EMP_MAP[h]) idx[EMP_MAP[h]] = i; });

    const missing = EMP_REQUIRED.filter((h) => !(EMP_MAP[h] in idx));
    if (missing.length) {
      setErr("หัวตารางไม่ตรงกับแบบฟอร์ม — ขาดคอลัมน์ที่จำเป็น: " + missing.join(", ")
        + " (กดปุ่ม “ดาวน์โหลดแบบฟอร์ม” เพื่อดูหัวตารางที่ถูกต้อง)");
      return;
    }

    const out = [];
    for (const r of raw.slice(1)) {
      const o = {};
      Object.entries(idx).forEach(([k, i]) => {
        const v = String(r[i] == null ? "" : r[i]).trim();
        if (v !== "") o[k] = v;
      });
      if (o.employee_id) out.push(o);
    }
    if (!out.length) { setErr("ไม่พบแถวข้อมูลที่มีรหัสพนักงาน"); return; }

    setRows(out); setFileName(file.name);
    setBusy(true);
    const { data, error } = await window.sb.rpc("employee_import", { p_rows: out, p_dry_run: true });
    setBusy(false);
    if (error) { setErr(error.message); return; }
    setPreview(data);
  };

  // ---------- บันทึกจริง ----------
  const doImport = async () => {
    if (!rows || !rows.length) return;
    setBusy(true); setErr("");
    const { data, error } = await window.sb.rpc("employee_import", {
      p_rows: rows, p_dry_run: false, p_note: fileName || null,
    });
    setBusy(false);
    if (error) { setErr(error.message); return; }
    setResult(data); setPreview(null); setRows(null);
    if (window.loadHRData) { try { await window.loadHRData(); } catch (_) { /* ไม่ให้ล้มทั้งหน้า */ } }
  };

  const cancel = () => { setPreview(null); setRows(null); setErr(""); };

  const P = preview;
  const R = result;

  return (
    <div className="grid">
      <Crumb items={[{ label: "HR Core" }, { label: "นำเข้าทะเบียนพนักงาน" }]} />
      <div className="page-head">
        <div>
          <h1>นำเข้าทะเบียนพนักงาน</h1>
          <p>อัปเดตข้อมูลพนักงานจากไฟล์ที่ส่งออกจาก Bplus · ระบบจะให้ตรวจผลก่อนเสมอ แล้วค่อยบันทึก</p>
        </div>
        <button className="btn" onClick={downloadTemplate}>⭳ ดาวน์โหลดแบบฟอร์ม</button>
      </div>

      {!canImport ? (
        <div className="card card-pad">
          <EmptyState icon="lock" text="คุณไม่มีสิทธิ์นำเข้าข้อมูลพนักงาน"
            sub="ต้องเป็นผู้ดูแลระบบหรือฝ่ายบุคคล" />
        </div>
      ) : (
        <React.Fragment>
          {err ? <div className="card card-pad" style={{ color: "var(--danger)" }}>{err}</div> : null}

          {/* ---------- ขั้นที่ 1 เลือกไฟล์ ---------- */}
          {!P && !R ? (
            <div className="card card-pad">
              <div style={{ fontWeight: 700, marginBottom: 6 }}>ขั้นที่ 1 — เลือกไฟล์จาก Bplus</div>
              <p className="muted" style={{ fontSize: 12.5, lineHeight: 1.8, marginTop: 0 }}>
                ไฟล์ต้องเป็น <b>.csv</b> และมีหัวตารางตรงกับแบบฟอร์ม ถ้ายังไม่มี ให้กด
                “ดาวน์โหลดแบบฟอร์ม” ด้านบน — ไฟล์ที่ได้จะมีข้อมูลพนักงานปัจจุบัน {(HRC.employees || []).length} คน
                ให้คุณใช้เทียบกับ Bplus ได้เลย<br />
                คอลัมน์ที่ขาดไม่ได้คือ <b>รหัสพนักงาน · ชื่อ-สกุล · ตำแหน่ง</b> ที่เหลือเว้นว่างได้
                ช่องที่เว้นว่างระบบจะไม่แตะของเดิม<br />
                วันที่ใส่ได้ทั้ง <b>31/01/2569</b> (พ.ศ.) และ <b>2026-01-31</b>
              </p>
              <input type="file" accept=".csv,text/csv" onChange={onFile} disabled={busy} />
              {busy ? <div className="muted" style={{ marginTop: 10 }}>กำลังตรวจข้อมูล…</div> : null}
            </div>
          ) : null}

          {/* ---------- ขั้นที่ 2 ตรวจผล ---------- */}
          {P ? (
            <React.Fragment>
              <div className="card card-pad">
                <div style={{ fontWeight: 700, marginBottom: 10 }}>
                  ขั้นที่ 2 — ตรวจผลก่อนบันทึก <span className="muted" style={{ fontWeight: 400 }}>({fileName})</span>
                </div>
                <div className="row wrap" style={{ gap: 18 }}>
                  <Stat label="เพิ่มใหม่" value={P.inserted} unit="คน" />
                  <Stat label="แก้ไข" value={P.updated} unit="คน" />
                  <Stat label="ไม่เปลี่ยนแปลง" value={P.unchanged} unit="คน" />
                </div>
                <div className="muted" style={{ fontSize: 12, marginTop: 10 }}>
                  ยังไม่มีการบันทึกใดๆ ลงฐานข้อมูล — ตรวจรายการด้านล่างแล้วกดยืนยัน
                </div>
                <div className="row" style={{ gap: 8, marginTop: 14 }}>
                  <button className="btn btn-primary" onClick={doImport} disabled={busy}>
                    {busy ? "กำลังบันทึก…" : "ยืนยันบันทึก"}
                  </button>
                  <button className="btn" onClick={cancel} disabled={busy}>ยกเลิก</button>
                </div>
              </div>

              {(P.resigned || []).length ? (
                <div className="card card-pad">
                  <div style={{ fontWeight: 700, marginBottom: 8, color: "var(--danger)" }}>
                    พนักงานที่จะถูกบันทึกว่าลาออก ({P.resigned.length} คน)
                  </div>
                  <ul style={{ margin: 0, paddingLeft: 18, lineHeight: 1.9, fontSize: 13 }}>
                    {P.resigned.map((x) => (
                      <li key={x.employee_id}>{x.employee_id} · {x.name} — ลาออก {x.resign_date}</li>
                    ))}
                  </ul>
                </div>
              ) : null}

              {(P.new_rows || []).length ? (
                <div className="card card-pad">
                  <div style={{ fontWeight: 700, marginBottom: 8 }}>พนักงานใหม่ ({P.new_rows.length} คน)</div>
                  <ul style={{ margin: 0, paddingLeft: 18, lineHeight: 1.9, fontSize: 13 }}>
                    {P.new_rows.map((x) => (
                      <li key={x.employee_id}>{x.employee_id} · {x.name} — {x.position} ({HRC.deptName(x.dept)})</li>
                    ))}
                  </ul>
                </div>
              ) : null}

              {(P.changed_rows || []).length ? (
                <div className="card card-pad">
                  <div style={{ fontWeight: 700, marginBottom: 8 }}>ข้อมูลที่จะเปลี่ยน ({P.changed_rows.length} คน)</div>
                {(() => {
                  const byField = {};
                  P.changed_rows.forEach((x) => (x.changes || []).forEach((c) => {
                    byField[c.f] = (byField[c.f] || 0) + 1;
                  }));
                  const list = Object.entries(byField).sort((a, b) => b[1] - a[1]);
                  const many = list.filter(([, n]) => n > P.changed_rows.length * 0.5);
                  return (
                    <div style={{ marginBottom: 12 }}>
                      <div className="row wrap" style={{ gap: 6 }}>
                        {list.map(([f, n]) => (
                          <span key={f} className="chip" style={{ cursor: "default" }}>{f} <b>{n}</b></span>
                        ))}
                      </div>
                      {many.length ? (
                        <div style={{ fontSize: 12, marginTop: 8, lineHeight: 1.7, color: "var(--danger)" }}>
                          ⚠️ ฟิลด์ “{many.map((x) => x[0]).join("”, “")}” จะถูกเปลี่ยนเกือบทุกคน
                          — ตรวจดูสักสิบรายการด้านล่างก่อนว่าเป็นการแก้ข้อมูลจริง
                          หรือเป็นแค่รูปแบบที่ต่างกัน (เช่น ช่องว่างหรือคำนำหน้าชื่อ)
                          ถ้าเป็นแค่รูปแบบ ควรแก้ที่ไฟล์ก่อนแล้วอัปโหลดใหม่
                        </div>
                      ) : null}
                    </div>
                  );
                })()}
                  <div style={{ maxHeight: 420, overflowY: "auto" }}>
                    {P.changed_rows.map((x) => (
                      <div key={x.employee_id} style={{ padding: "8px 0", borderBottom: "1px solid var(--border-2)" }}>
                        <div style={{ fontSize: 13, fontWeight: 600 }}>{x.employee_id} · {x.name}</div>
                        <ul style={{ margin: "4px 0 0", paddingLeft: 18, lineHeight: 1.8, fontSize: 12.5 }}>
                          {x.changes.map((c, i) => (
                            <li key={i}>
                              {c.f}: <span className="muted" style={{ textDecoration: "line-through" }}>{c.old}</span>
                              {" → "}<b>{c.new}</b>
                            </li>
                          ))}
                        </ul>
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}

              {(P.unknown_dept || []).length ? (
                <div className="card card-pad">
                  <div style={{ fontWeight: 700, marginBottom: 8, color: "var(--warn, #e08a00)" }}>
                    หน่วยงานที่ระบบไม่รู้จัก ({P.unknown_dept.length} รายการ) — จะไม่เปลี่ยนหน่วยงานให้
                  </div>
                  <ul style={{ margin: 0, paddingLeft: 18, lineHeight: 1.9, fontSize: 13 }}>
                    {P.unknown_dept.map((x, i) => (
                      <li key={i}>{x.employee_id} — “{x.dept}”</li>
                    ))}
                  </ul>
                  <div className="muted" style={{ fontSize: 12, marginTop: 8 }}>
                    แก้ชื่อหน่วยงานในไฟล์ให้ตรงกับที่ตั้งไว้ในระบบ หรือเพิ่มหน่วยงานใหม่ที่หน้า “หน่วยงาน”
                  </div>
                </div>
              ) : null}

              {(P.skipped || []).length ? (
                <div className="card card-pad">
                  <div style={{ fontWeight: 700, marginBottom: 8 }}>แถวที่ข้าม ({P.skipped.length} แถว)</div>
                  <ul style={{ margin: 0, paddingLeft: 18, lineHeight: 1.9, fontSize: 13 }}>
                    {P.skipped.map((x, i) => (
                      <li key={i}>{x.employee_id ? x.employee_id + " — " : ""}{x.reason}</li>
                    ))}
                  </ul>
                </div>
              ) : null}
            </React.Fragment>
          ) : null}

          {/* ---------- ผลบันทึก ---------- */}
          {R ? (
            <div className="card card-pad">
              <div style={{ fontWeight: 700, marginBottom: 10, color: "var(--ok, #16a34a)" }}>บันทึกเรียบร้อย</div>
              <div className="row wrap" style={{ gap: 18 }}>
                <Stat label="เพิ่มใหม่" value={R.inserted} unit="คน" />
                <Stat label="แก้ไข" value={R.updated} unit="คน" />
                <Stat label="ไม่เปลี่ยนแปลง" value={R.unchanged} unit="คน" />
              </div>
              <button className="btn" style={{ marginTop: 14 }} onClick={() => setResult(null)}>
                นำเข้าไฟล์อื่น
              </button>
            </div>
          ) : null}

          <div className="card card-pad muted" style={{ fontSize: 12, lineHeight: 1.9 }}>
            <b style={{ color: "var(--text)" }}>ข้อมูลที่ระบบนี้เป็นเจ้าของ — การนำเข้าจะไม่เขียนทับ</b><br />
            ผลประเมิน KPI · สมรรถนะ · ศักยภาพ · ใบเตือน · JD · รูปพนักงาน · ข้อมูลฝั่งสรรหา<br />
            <b style={{ color: "var(--text)" }}>ข้อมูลที่ Bplus เป็นเจ้าของ — จะถูกอัปเดตตามไฟล์</b><br />
            ชื่อ-สกุล · ตำแหน่ง · หน่วยงาน · ระดับ · วันเริ่มงาน · สถานะ · วันลาออก · เพศ · วันเกิด ·
            ประเภทการจ้าง · หัวหน้างาน · อีเมล · เบอร์โทร · วุฒิการศึกษา · สัญชาติ · สถานที่ทำงาน
          </div>
        </React.Fragment>
      )}
    </div>
  );
}
