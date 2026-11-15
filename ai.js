(function () {
  'use strict';

  // --- BIẾN TOÀN CỤC ĐỂ TRÁNH CHẠY NHIỀU LẦN ---
  if (window.apaLoading || document.getElementById('apa-ui')) {
    if (document.getElementById('apa-ui')) document.getElementById('apa-ui').classList.toggle('open');
    return;
  }
  window.apaLoading = true;

  // --- TOÀN BỘ LOGIC CỦA USERSCRIPT ĐÃ ĐƯỢC SỬA ĐỔI ĐỂ CHẠY TRÊN TRÌNH DUYỆT ---
  // (Nội dung này giống hệt script Tampermonkey nhưng được bọc trong IIFE)
  
  const CFG = { COV: .82, NEAR: .9 };
  const norm = s => String(s == null ? '' : s).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
    .replace(/đ/g, 'd').replace(/([+=<>%^\/*~-])/g, ' $1 ').replace(/[^a-z0-9\s+=<>%^\/*~-]/g, ' ').replace(/\s+/g, ' ').trim();
  const stripLabel = s => String(s == null ? '' : s).replace(/^\s*(?:[A-Da-d])\s*[\.\):]\s*/, '').trim();
  
  function tok(s) {
    const t = norm(s).replace(/\bcau \d+\b/g, '').trim();
    const w = (t ? t.split(' ') : []).filter(x => x.length > 1 || /\d/.test(x)), o = w.slice();
    for (let i = 0; i < w.length - 1; i++) o.push(w[i] + '_' + w[i + 1]);
    return o;
  }
  
  let IDF = new Map(), IDFMAX = 1, BK = [], INV = new Map(), TOT = new Float64Array(0);

  function vec(s) {
    const m = new Map();
    for (const t of tok(s)) m.set(t, (m.get(t) || 0) + 1);
    for (const [k, v] of m) m.set(k, (1 + Math.log(v)) * (IDF.get(k) || IDFMAX));
    return m;
  }
  
  function resolveAns(a, opts) {
    const arr = Array.isArray(a) ? a : [a], out = [];
    for (const x of arr) {
      if (typeof x === 'number') { if (opts[x] != null) out.push(x); continue; }
      const s = String(x).trim();
      if (/^[A-Ha-h]$/.test(s)) { const i = s.toUpperCase().charCodeAt(0) - 65; if (opts[i] != null) out.push(i); continue; }
      const n = norm(stripLabel(s)), i = opts.findIndex(o => norm(o) === n);
      if (i >= 0) out.push(i);
    }
    return [...new Set(out)];
  }

  function canon(raw) {
    const out = [];
    for (const r of raw || []) {
      if (!r || !r.q) continue;
      if (r.type === 'sa' || r.answers) {
        const ans = (r.answers || [].concat(r.a == null ? [] : r.a)).map(x => String(x).trim()).filter(Boolean);
        if (ans.length) out.push({ type: 'sa', q: String(r.q), ans, parts: [String(r.q)] });
        continue;
      }
      if (r.type === 'tf' || r.stmts) {
        const st = (r.stmts || []).map(s => ({ t: stripLabel(s.t), v: !!s.v })).filter(s => s.t);
        if (st.length) out.push({ type: 'tf', q: String(r.q), st, parts: [String(r.q), ...st.map(s => s.t)] });
      } else {
        const opts = (r.opts || []).map(stripLabel), a = resolveAns(r.a, opts);
        if (opts.length >= 2 && a.length) out.push({ type: 'mc', q: String(r.q), opts, a, parts: [String(r.q), ...opts] });
      }
    }
    return out;
  }

  const fingerprint = it => it.type + '|' + norm(it.q) + '|' + (it.type === 'tf' ? it.st.map(s => norm(s.t)) : it.type === 'mc' ? it.opts.map(norm) : []).sort().join('|');
  const toRaw = it => it.type === 'sa' ? { type: 'sa', q: it.q, answers: it.ans.slice() } : it.type === 'tf' ? { type: 'tf', q: it.q, stmts: it.st.map(s => ({ t: s.t, v: s.v })) } : { type: 'mc', q: it.q, opts: it.opts.slice(), a: it.a.slice() };

  function loadBank(raw) {
    const items = [], dup = new Set();
    for (const it of canon(raw)) { const k = fingerprint(it); if (!dup.has(k)) { dup.add(k); items.push(it); } }
    const df = new Map(); let N = 0;
    for (const it of items) for (const p of it.parts) { N++; for (const t of new Set(tok(p))) df.set(t, (df.get(t) || 0) + 1); }
    IDF = new Map();
    for (const [k, v] of df) IDF.set(k, Math.log((N + 1) / (v + 1)) + 1);
    IDFMAX = Math.log(N + 1) + 1;
    for (const it of items) { 
      const m = new Map();
      for (const p of it.parts) for (const [k, v] of vec(p)) m.set(k, (m.get(k) || 0) + v);
      it.fv = m;
    }
    INV = new Map(); TOT = new Float64Array(items.length);
    items.forEach((it, i) => { let t = 0; for (const [k, v] of it.fv) { t += v; let a = INV.get(k); if (!a) INV.set(k, a = []); a.push(i, v); } TOT[i] = t; });
    BK = items;
    return items.length;
  }

  function rank(text) {
    const set = new Set(tok(text)), hit = new Float64Array(BK.length), touched = [];
    for (const t of set) {
      const a = INV.get(t); if (!a) continue;
      for (let k = 0; k < a.length; k += 2) { const i = a[k]; if (!hit[i]) touched.push(i); hit[i] += a[k + 1]; }
    }
    const out = touched.map(i => ({ i, c: TOT[i] ? hit[i] / TOT[i] : 0 }));
    out.sort((a, b) => b.c - a.c);
    return out;
  }
  
  function decide(rk) {
    const acc = [], seen = new Set();
    for (const r of rk) {
      if (r.c < CFG.COV) break;
      const it = BK[r.i]; let t = 0, e = 0;
      for (const [k, v] of it.fv) { t += v; if (!seen.has(k)) e += v; }
      if (acc.length && e / t < .3) continue;
      acc.push(r.i); for (const k of it.fv.keys()) seen.add(k);
    }
    return acc;
  }

  // --- GIAO DIỆN ---
  const css = `
  .apa-ui{position:fixed;right:0;z-index:2147483647;display:flex;align-items:flex-start;font:13px/1.35 system-ui,sans-serif;touch-action:none}
  .apa-tab{width:34px;height:34px;border:0;border-radius:10px 0 0 10px;background:#546e7a;color:#fff;font-size:16px;opacity:.9;padding:0}
  .apa-tab.on{background:#2e7d32}
  .apa-body{width:232px;max-height:80vh;overflow:auto;background:rgba(255,255,255,.97);color:#1b1f2a;border:1px solid #cfd4dc;border-radius:10px 0 0 10px;padding:8px;display:none;box-shadow:0 2px 10px rgba(0,0,0,.25);touch-action:pan-y}
  .apa-ui.open .apa-body{display:block}
  .apa-body button,.apa-body select,.apa-body input[type=text],.apa-body input[type=password]{border:1px solid #cfd4dc;background:#f3f4f8;color:#1b1f2a;border-radius:8px;padding:6px 4px;font-size:13px;box-sizing:border-box}
  .apa-body select,.apa-body input[type=text],.apa-body input[type=password]{width:100%;margin:2px 0 6px}
  .apa-r{display:flex;gap:6px;margin-bottom:6px}.apa-r button{flex:1}
  .apa-big{font-weight:700}.apa-s{color:#555;font-size:12px;margin:4px 0}
  .apa-res{font-size:12px;max-height:130px;overflow:auto;background:#f3f4f8;border-radius:8px;padding:4px 6px;margin:4px 0;display:none;white-space:pre-wrap}
  .apa-sec{display:none;border-top:1px solid #e3e6ee;margin-top:6px;padding-top:6px}.apa-sec.show{display:block}
  .apa-body textarea{width:100%;height:90px;font-size:12px;margin:4px 0;box-sizing:border-box}
  .apa-ok{outline:3px solid #2e7d32!important;background:rgba(46,125,50,.18)!important}
  .apa-t{outline:2px solid #2e7d32!important}.apa-f{outline:2px solid #c62828!important}
  .apa-badge{display:inline-block;margin-left:6px;padding:0 6px;border-radius:8px;font-size:12px;font-weight:700;color:#fff;pointer-events:none;vertical-align:middle}
  .apa-b-ok{background:#2e7d32}.apa-b-no{background:#c62828}`;
  
  const st = document.createElement('style'); st.id = 'apa-css'; st.textContent = css; document.head.appendChild(st);
  
  const h = (tag, cls, txt) => { const e = document.createElement(tag); if (cls) e.className = cls; if (txt) e.textContent = txt; return e; };
  const row = (...c) => { const r = h('div', 'apa-r'); r.append(...c); return r; };
  
  const ui = h('div', 'apa-ui'); ui.id = 'apa-ui';
  const tab = h('button', 'apa-tab', '🎯');
  const body = h('div', 'apa-body');
  ui.style.top = (localStorage.getItem('apa_top') || 40) + '%';

  const bOn = h('button', 'apa-big', 'ON'), bScan = h('button', '', 'Quét lại');
  const stats = h('div', 'apa-s'), status = h('div', 'apa-s'), res = h('div', 'apa-res');
  const bData = h('button', '', 'Dữ liệu'), bDbg = h('button', '', 'Gỡ lỗi'), bFold = h('button', '', 'Thu gọn');
  const secData = h('div', 'apa-sec'), bPaste = h('button', '', 'Dán & nạp nội dung đã sao chép'), bClr = h('button', '', 'Xóa dữ liệu nạp'), dInfo = h('div', 'apa-s');
  const bExport = h('button', '', 'Xuất JSON'), bSample = h('button', '', 'Mẫu định dạng');
  const fmt = h('div', 'apa-s', 'Dạng JSON: mảng các câu. Trắc nghiệm {type:"mc", q, opts:[...], a: số thứ tự đáp án đúng}. Đúng/Sai {type:"tf", q, stmts:[...]}. Điền ô {type:"sa", q, answers:[...]}.');
  
  secData.append(dInfo, row(bPaste), row(bExport, bSample), row(bClr), fmt);
  body.append(row(bOn, bScan), stats, status, res, row(bData), row(bDbg, bFold), secData);
  ui.append(body, tab);
  document.body.appendChild(ui);

  // --- BIẾN TRẠNG THÁI ---
  let on = true;
  let userBank = JSON.parse(localStorage.getItem('apa_bank') || '[]');
  let bankCount = loadBank(userBank);

  function setStatus(t) { status.textContent = t; }
  function setResults(lines) { res.style.display = lines.length ? 'block' : 'none'; res.textContent = lines.join('\n'); }
  
  function renderStats() {
    stats.textContent = 'Ngân hàng: ' + bankCount + ' câu';
    bOn.textContent = on ? 'ON' : 'OFF'; bOn.style.color = on ? '#2e7d32' : '#c62828';
    tab.classList.toggle('on', on);
  }

  // --- CÁC HÀM XỬ LÝ (Giữ nguyên logic cũ) ---
  const cut = (s, n) => s.length > n ? s.slice(0, n - 1) + '…' : s;
  
  function locate(t, nodes) {
    if (!t) return null;
    const lim = t.length + 20, found = new Set();
    for (const key of [t.length > 24 ? t.slice(0, 24) : t, t.split(' ')[0]]) {
      if (found.size) break;
      for (const x of nodes) {
        if (!x.nt.includes(key)) continue;
        let el = x.n.parentElement, d = 0;
        while (el && el !== document.body && d < 8 && !normOf(el).includes(t)) { el = el.parentElement; d++; }
        if (!el || el === document.body || normOf(el).length > lim) continue;
        
        let best = el;
        while (best.children.length > 0) {
            let foundChild = false;
            for(let c of best.children) {
                if (normOf(c).includes(t)) { best = c; foundChild = true; break; }
            }
            if (!foundChild) break;
        }
        found.add(best);
      }
    }
    const arr = [...found].filter(a => ![...found].some(b => b !== a && a.contains(b)));
    return arr.length === 1 ? arr[0] : null;
  }

  const NM = new Map(); 
  const normOf = el => { let v = NM.get(el); if (v === undefined) { v = norm(textOf(el)); NM.set(el, v); } return v; };
  function textOf(el) {
    let s = '';
    const w = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    let n;
    while ((n = w.nextNode())) { const p = n.parentElement; if (p && !p.closest('.apa-badge,script,style')) s += n.nodeValue + ' '; }
    return s;
  }

  function screenNodes() { 
    const nodes = [], vis = new Map(); let text = '';
    const w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    let n;
    while ((n = w.nextNode())) {
      const v = n.nodeValue; if (!v || !v.trim()) continue;
      const p = n.parentElement;
      if (!p || /^(SCRIPT|STYLE|NOSCRIPT|TEXTAREA)$/.test(p.tagName)) continue;
      let ok = vis.get(p); if (ok === undefined) { ok = !p.closest('.apa-ui,.apa-badge'); vis.set(p, ok); }
      if (!ok) continue;
      nodes.push({ n, nt: norm(v) }); text += v.trim() + ' ';
    }
    return { nodes, text, norm: norm(text) };
  }

  function clearMarks() {
    document.querySelectorAll('.apa-ok,.apa-t,.apa-f').forEach(e => e.classList.remove('apa-ok', 'apa-t', 'apa-f'));
    document.querySelectorAll('.apa-badge').forEach(b => b.remove());
  }
  function badge(el, text, cls) { const s = document.createElement('span'); s.className = 'apa-badge ' + cls; s.textContent = text; el.appendChild(s); }

  function paint(ids, S) {
    const lines = []; let marking = true;
    try {
      clearMarks();
      for (const i of ids) {
        const b = BK[i];
        if (b.type === 'sa') {
          const el = locate(norm(b.q), S.nodes);
          if (el) badge(el, 'Đáp án: ' + b.ans.join(' | '), 'apa-b-ok');
          lines.push('✎ Điền: ' + b.ans.join(' | '));
        } else if (b.type === 'mc') {
          for (const j of b.a) {
            const el = locate(norm(b.opts[j]), S.nodes);
            if (el) { el.classList.add('apa-ok'); badge(el, '✓ ĐÚNG', 'apa-b-ok'); }
            lines.push('✓ ' + cut(b.opts[j], 80));
          }
        } else {
          for (const s of b.st) {
            const el = locate(norm(s.t), S.nodes);
            if (el) { el.classList.add(s.v ? 'apa-t' : 'apa-f'); badge(el, s.v ? 'ĐÚNG' : 'SAI', s.v ? 'apa-b-ok' : 'apa-b-no'); }
            lines.push((s.v ? 'ĐÚNG' : 'SAI') + ' – ' + cut(s.t, 60));
          }
        }
      }
    } finally { marking = false; }
    return lines;
  }

  function scan() {
    if (!on) return;
    NM.clear();
    const S = screenNodes();
    if (!S.norm) { setStatus('Không thấy nội dung.'); return; }
    const rk = rank(S.text), ids = decide(rk);
    if (!ids.length) { setStatus('Chưa khớp dữ liệu.'); clearMarks(); return; }
    const lines = paint(ids, S);
    setResults(lines);
    setStatus('Đã tìm thấy ' + ids.length + ' câu.');
  }

  // --- SỰ KIỆN GIAO DIỆN ---
  bOn.onclick = () => { on = !on; renderStats(); if (on) scan(); else { clearMarks(); setResults([]); } };
  bScan.onclick = () => scan();
  bFold.onclick = () => ui.classList.remove('open');
  bData.onclick = () => secData.classList.toggle('show');
  
  bPaste.onclick = async () => {
    try {
      const raw = await navigator.clipboard.readText();
      if (!raw) return;
      const j = JSON.parse(raw);
      if (Array.isArray(j)) {
        userBank = userBank.concat(j);
        localStorage.setItem('apa_bank', JSON.stringify(userBank));
        bankCount = loadBank(userBank); 
        renderStats();
        setStatus('Đã nạp thêm ' + j.length + ' câu. Tổng: ' + bankCount);
        scan();
      }
    } catch (e) { setStatus('Lỗi: ' + e.message); }
  };

  bClr.onclick = () => { 
    if (confirm('Xóa toàn bộ ngân hàng đã nạp?')) {
      userBank = []; localStorage.setItem('apa_bank', '[]'); 
      bankCount = loadBank([]); renderStats(); clearMarks(); setResults([]); 
    }
  };
  
  const toClip = (t, ok) => navigator.clipboard.writeText(t).then(() => setStatus(ok));
  bExport.onclick = () => toClip(JSON.stringify(BK, null, 2), 'Đã copy JSON ngân hàng.');
  bSample.onclick = () => toClip('[\n {"type":"mc","q":"Thủ đô của Việt Nam là gì?","opts":["Huế","Hà Nội","Đà Nẵng","Hải Phòng"],"a":1}\n]', 'Đã copy mẫu.');

  // Kéo thả
  let drag = null;
  tab.addEventListener('pointerdown', e => { drag = { y: e.clientY, top: ui.getBoundingClientRect().top, moved: false }; tab.setPointerCapture(e.pointerId); });
  tab.addEventListener('pointermove', e => {
    if (!drag) return;
    if (Math.abs(e.clientY - drag.y) > 6) drag.moved = true;
    if (drag.moved) ui.style.top = Math.max(0, Math.min(window.innerHeight - 40, drag.top + e.clientY - drag.y)) + 'px';
  });
  tab.addEventListener('pointerup', () => {
    if (drag && !drag.moved) ui.classList.toggle('open');
    else if (drag) localStorage.setItem('apa_top', Math.round(100 * ui.getBoundingClientRect().top / window.innerHeight));
    drag = null;
  });

  renderStats();
  scan(); // Quét ngay lần đầu
  
  window.apaLoading = false;
})();
