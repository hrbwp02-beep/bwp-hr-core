// hrcore-password.jsx — เปลี่ยนรหัสผ่านของตัวเอง
const { useState: usePW } = React;

// ประเมินความแข็งแรงของรหัสผ่าน
function pwStrength(p) {
  const s = String(p || "");
  const checks = [
    { ok: s.length >= 8,            label: "ยาวอย่างน้อย 8 ตัวอักษร" },
    { ok: /[a-z]/.test(s),          label: "มีตัวพิมพ์เล็ก" },
    { ok: /[A-Z]/.test(s),          label: "มีตัวพิมพ์ใหญ่" },
    { ok: /[0-9]/.test(s),          label: "มีตัวเลข" },
    { ok: !/^BW/i.test(s),          label: "ไม่ขึ้นต้นด้วย BW (รหัสตั้งต้นที่เดาง่าย)" },
  ];
  return { checks, passed: checks.filter((c) => c.ok).length, total: checks.length };
}

function HRCPassword() {
  const email = (HRC.user && HRC.user.email) || "";
  const [cur, setCur] = usePW("");
  const [nw, setNw] = usePW("");
  const [cf, setCf] = usePW("");
  const [show, setShow] = usePW(false);
  const [busy, setBusy] = usePW(false);
  const [err, setErr] = usePW("");
  const [ok, setOk] = usePW(false);

  const st = pwStrength(nw);
  const allOk = st.passed === st.total;

  const save = async () => {
    setErr(""); setOk(false);

    if (!cur) { setErr("กรุณากรอกรหัสผ่านปัจจุบัน"); return; }
    if (!allOk) { setErr("รหัสผ่านใหม่ยังไม่ผ่านเงื่อนไขครบทุกข้อ"); return; }
    if (nw !== cf) { setErr("รหัสผ่านใหม่กับการยืนยันไม่ตรงกัน"); return; }
    if (nw === cur) { setErr("รหัสผ่านใหม่ต้องไม่ซ้ำกับรหัสผ่านเดิม"); return; }

    setBusy(true);
    try {
      // ยืนยันตัวตนด้วยรหัสผ่านเดิมก่อน กันกรณีลืมล็อกเอาต์แล้วมีคนมาเปลี่ยนรหัสให้
      const { error: authErr } = await window.sb.auth.signInWithPassword({ email, password: cur });
      if (authErr) { setErr("รหัสผ่านปัจจุบันไม่ถูกต้อง"); setBusy(false); return; }

      const { error } = await window.sb.auth.updateUser({ password: nw });
      if (error) { setErr("เปลี่ยนรหัสผ่านไม่สำเร็จ: " + error.message); setBusy(false); return; }

      try { await HRC.audit("เปลี่ยนรหัสผ่านตนเอง", "UPDATE", "auth", email, null, null); } catch (e) { /* ไม่ให้ล้ม */ }

      setOk(true); setCur(""); setNw(""); setCf("");
      toast("เปลี่ยนรหัสผ่านเรียบร้อยแล้ว", "check");
    } catch (e) {
      setErr("เปลี่ยนรหัสผ่านไม่สำเร็จ: " + String(e.message || e));
    } finally { setBusy(false); }
  };

  const field = (label, value, setter, hint) => (
    <div className="field">
      <label>{label}</label>
      <input className="input" type={show ? "text" : "password"} value={value}
        autoComplete="new-password" disabled={busy}
        onChange={(e) => { setter(e.target.value); setErr(""); setOk(false); }} />
      {hint ? <div className="muted" style={{ fontSize: 12, marginTop: 4 }}>{hint}</div> : null}
    </div>
  );

  return (
    <div className="grid">
      <Crumb items={[{ label: "HR Core" }, { label: "เปลี่ยนรหัสผ่าน" }]} />
      <div className="page-head">
        <div>
          <h1>เปลี่ยนรหัสผ่าน</h1>
          <p>เปลี่ยนรหัสผ่านของบัญชี {email || "ของคุณ"}</p>
        </div>
      </div>

      <div className="card card-pad" style={{ maxWidth: 520 }}>
        {ok ? (
          <div style={{ padding: "11px 14px", borderRadius: 10, background: "var(--green-soft, #e7f6ec)",
                        color: "#15803d", fontSize: 13, marginBottom: 14, lineHeight: 1.7 }}>
            เปลี่ยนรหัสผ่านเรียบร้อยแล้ว · ครั้งต่อไปให้ใช้รหัสผ่านใหม่เข้าสู่ระบบ
          </div>
        ) : null}

        {err ? (
          <div style={{ padding: "11px 14px", borderRadius: 10, background: "var(--red-soft, #fde8ec)",
                        color: "#be123c", fontSize: 13, marginBottom: 14 }}>{err}</div>
        ) : null}

        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          {field("รหัสผ่านปัจจุบัน", cur, setCur)}
          {field("รหัสผ่านใหม่", nw, setNw)}
          {field("ยืนยันรหัสผ่านใหม่", cf, setCf,
            cf && nw !== cf ? "⚠️ ยังไม่ตรงกับรหัสผ่านใหม่" : "")}

          <label style={{ display: "flex", alignItems: "center", gap: 7, fontSize: 13, cursor: "pointer" }}>
            <input type="checkbox" checked={show} onChange={(e) => setShow(e.target.checked)} />
            แสดงรหัสผ่าน
          </label>

          <div style={{ borderTop: "1px solid var(--border-2)", paddingTop: 12 }}>
            <div className="muted" style={{ fontSize: 12, fontWeight: 700, marginBottom: 7 }}>
              เงื่อนไขรหัสผ่านใหม่ ({st.passed}/{st.total})
            </div>
            <ul style={{ margin: 0, paddingLeft: 2, listStyle: "none", lineHeight: 1.95, fontSize: 12.5 }}>
              {st.checks.map((c, i) => (
                <li key={i} style={{ color: c.ok ? "#15803d" : "var(--text-3)" }}>
                  {c.ok ? "✓" : "○"} {c.label}
                </li>
              ))}
            </ul>
          </div>

          <div className="row" style={{ gap: 9 }}>
            <button className="btn btn-pri" onClick={save} disabled={busy}>
              {busy ? "กำลังเปลี่ยน…" : "เปลี่ยนรหัสผ่าน"}
            </button>
          </div>
        </div>
      </div>

      <div className="card card-pad muted" style={{ fontSize: 12, lineHeight: 1.9, maxWidth: 520 }}>
        <b style={{ color: "var(--text)" }}>ทำไมควรเปลี่ยน</b><br />
        รหัสผ่านตั้งต้นของระบบเป็นรูปแบบ BW ตามด้วยรหัสพนักงาน ซึ่งคนอื่นเดาได้ทันที
        ถ้ายังไม่เคยเปลี่ยน ควรเปลี่ยนตั้งแต่วันนี้<br />
        ระบบจะถามรหัสผ่านปัจจุบันก่อนทุกครั้ง และบันทึกไว้ในประวัติการใช้งานว่ามีการเปลี่ยนรหัสผ่าน
        แต่ <b style={{ color: "var(--text)" }}>ไม่เก็บตัวรหัสผ่านไว้ที่ใดเลย</b>
      </div>
    </div>
  );
}
