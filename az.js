/*! Azota Practice Assistant v3.3.3: bản chạy bằng bookmarklet / GitHub Pages.
 *  Lưu trữ: localStorage của azota.vn (khóa apa_bank, apa_on, apa_top). Không dùng API, AI hay máy chủ nào.
 *  Chỉ chạy trong chế độ luyện tập (đường dẫn có /take-training/). */
(function () {
  'use strict';
  if (!window.__APA_TEST__ && !/(^|\.)azota\.vn$/i.test(location.hostname)) { alert('Công cụ này chỉ chạy trên azota.vn'); return; }
  if (window.__APA_LOADED__) { const u = document.querySelector('.apa-ui'); if (u) u.classList.add('open'); return; } // bấm bookmarklet lần nữa: chỉ mở menu
  window.__APA_LOADED__ = true;

  /* =====================================================================
   * 1. NGÂN HÀNG ĐÁP ÁN (có thể nạp thêm bằng ô JSON trong menu)
   *  Trắc nghiệm: {"type":"mc","q":"Câu hỏi","opts":["PA 1","PA 2","PA 3","PA 4"],"a":2}
   *     a = chỉ số 0-based (0=A), hoặc "C", hoặc nội dung phương án đúng, hoặc mảng.
   *  Đúng/Sai:    {"type":"tf","q":"Nội dung chung","stmts":[{"t":"nhận định a","v":true}]}
   * ===================================================================== */
  const BUILTIN = []; // ngân hàng nằm trong localStorage (apa_bank): nạp bằng nút "Dán & nạp"

  /* Chuyển văn bản đã sao chép từ trang xem đáp án thành ngân hàng.
     Chỉ nhận câu có dấu hiệu đáp án đúng rõ ràng; không suy đoán từ lựa chọn của người làm. */
  /* Trang "xem đáp án" của Azota: nhãn A./a) nằm riêng một dòng, đáp án đúng/sai nằm ở khối "Đáp án đúng:",
     câu điền ô có "Đáp án được chấp nhận". Chỉ lấy đáp án hiển thị rõ, không suy đoán. */
  function parseAzotaReview(raw) {
    const NOISE = /^(?:Giải thích|Thí sinh chọn\b.*|Thí sinh trả lời|Thí sinh không nhập.*|Câu làm sai\b.*|error\.\.\.|Đề đảo|Bỏ quảng cáo|Trắc nghiệm|Đúng\s*&\s*sai|Phần\s*\d+\..*)$/i;
    const lines = String(raw).replace(/\r/g, '').split('\n').map(x => x.replace(/\s+/g, ' ').trim()).filter(Boolean);
    const L = [];
    for (let i = 0; i < lines.length; i++) { // ghép dòng nhãn "A." / "a)" với dòng nội dung ngay sau
      const m = lines[i].match(/^([A-Ha-h])\s*[\.\)]$/);
      if (m && i + 1 < lines.length && !/^[A-Ha-h]\s*[\.\)]$/.test(lines[i + 1])) { L.push(m[1] + (/[A-H]/.test(m[1]) ? '. ' : ') ') + lines[i + 1]); i++; }
      else L.push(lines[i]);
    }
    const heads = [];
    L.forEach((x, i) => { if (/^Câu\s*\d+\b.*\bID\s*:\s*\d+/i.test(x)) heads.push(i); });
    if (!heads.length) return [];
    heads.push(L.length);
    const clean = x => x.replace(/\s+/g, ' ').trim();
    const stripTag = t => { t = t.trim(); for (let k = 0; k < 3; k++) { const m = t.match(/^\(([^)]{1,25})\)\s*/); if (!m) break; t = t.slice(m[0].length); } return t.trim(); };
    const out = [];
    for (let k = 0; k < heads.length - 1; k++) {
      const b = L.slice(heads[k], heads[k + 1]);
      const q = [], opts = [], stmts = [], tfAns = {}, sa = []; let letters = [], cur = null, mode = 'q', ansFirst = false, m;
      const head = b[0].replace(/^Câu\s*\d+\s*(?:ID\s*:\s*\d+)?\s*/i, '').trim(); if (head) q.push(head);
      for (const line of b.slice(1)) {
        if (mode === 'done') break;
        if (mode === 'ans') {
          if (/^Thí sinh/i.test(line)) { mode = 'done'; continue; }
          if ((m = line.match(/^([a-d])\s*[\)\.]\s*(Đúng|Sai)\s*$/i))) tfAns[m[1].toLowerCase()] = /^đúng$/i.test(m[2]);
          else if (/^[A-H](?:\s*[,;&]\s*[A-H])*$/.test(line) && ansFirst && !letters.length) letters = line.match(/[A-H]/g); // bỏ qua dãy nút A B C D phía sau
          ansFirst = false;
          continue;
        }
        if (mode === 'sa') { if (/^Thí sinh/i.test(line)) { mode = 'done'; continue; } sa.push(line); continue; }
        if (/^Đáp án được chấp nhận/i.test(line)) { mode = 'sa'; continue; }
        if ((m = line.match(/^Đáp án đúng\s*:?\s*(.*)$/i))) { mode = 'ans'; ansFirst = true; if (m[1] && /^[A-H](?:\s*[,;&]\s*[A-H])*$/.test(m[1].trim())) letters = m[1].match(/[A-H]/g); continue; }
        if (NOISE.test(line)) { cur = null; continue; }
        if ((m = line.match(/^([A-H])\s*[\.\):]\s*(.+)$/))) { cur = { t: m[2] }; opts.push(cur); continue; }
        if ((m = line.match(/^([a-d])\s*[\.\)]\s*(.+)$/))) { cur = { t: m[2] }; stmts.push(cur); continue; }
        if (/^[A-H]$/.test(line)) { cur = null; continue; } // nút chọn A B C D
        if (cur) cur.t += ' ' + line; else if (!opts.length && !stmts.length) q.push(line);
      }
      const qt = stripTag(clean(q.join(' ')));
      if (!qt) continue;
      if (stmts.length >= 2 && Object.keys(tfAns).length) {
        const st = stmts.map((s, i) => ({ t: stripTag(clean(s.t)), v: tfAns['abcd'[i]] })).filter(s => s.t && typeof s.v === 'boolean');
        if (st.length) out.push({ type: 'tf', q: qt, stmts: st });
      } else if (opts.length >= 2 && letters.length) {
        const a = [...new Set(letters.map(x => x.charCodeAt(0) - 65).filter(i => i < opts.length))];
        if (a.length) out.push({ type: 'mc', q: qt, opts: opts.map(o => clean(o.t)), a });
      } else if (sa.length) {
        out.push({ type: 'sa', q: qt, answers: sa.map(clean).filter(Boolean) });
      }
    }
    return out;
  }
  // Khi sao chép bị dính liền ("...Đáp án đúng: ACâu 2 ID:..."): chèn xuống dòng trước các mốc cấu trúc
  const unglue = t => t.replace(/([^\n])(Câu\s*\d+\s*ID\s*:\s*\d+)/g, '$1\n$2').replace(/([^\n])(Đáp án đúng\s*:)/g, '$1\n$2')
    .replace(/([^\n])(Đáp án được chấp nhận)/g, '$1\n$2').replace(/([^\n])(Thí sinh (?:chọn|trả lời))/g, '$1\n$2');
  function parseCopiedText(input) {
    const raw = String(input || '').replace(/\r/g, '').trim();
    if (!raw) throw new Error('Clipboard đang trống.');
    try { const j = JSON.parse(raw); if (Array.isArray(j)) return j; if (j && Array.isArray(j.questions)) return j.questions; } catch (_) {}
    const a = parseAzotaReview(unglue(raw));
    return a.length ? a : parseGeneric(raw);
  }

  function parseGeneric(input) {
    const raw = String(input || '').replace(/\r/g, '').trim();
    if (!raw) throw new Error('Clipboard đang trống.');
    // Nếu người dùng đã sao chép JSON thì dùng trực tiếp.
    try {
      const j = JSON.parse(raw);
      if (Array.isArray(j)) return j;
      if (j && Array.isArray(j.questions)) return j.questions;
    } catch (_) {}

    const lines = raw.split('\n').map(x => x.trim()).filter(Boolean);
    const starts = [];
    for (let i = 0; i < lines.length; i++) {
      if (/^(?:Câu|Cau)\s*\d+\b/i.test(lines[i])) starts.push(i);
    }
    if (!starts.length) throw new Error('Không tìm thấy dòng bắt đầu câu hỏi (Câu 1, Câu 2...).');
    starts.push(lines.length);
    const out = [];
    const answerLine = /(?:đáp\s*án(?:\s*đúng)?|đáp\s*án\s*chính\s*xác|answer\s*key|correct\s*answer)\s*[:：\-]?\s*(.*)$/i;
    const optLine = /^\s*([A-H])\s*[\).:]\s*(.+)$/i;
    const stmtLine = /^\s*([a-d])\s*[\).:]\s*(.+)$/i;
    const clean = x => x.replace(/\s+/g, ' ').trim();

    for (let k = 0; k < starts.length - 1; k++) {
      const block = lines.slice(starts[k], starts[k + 1]);
      if (!block.length) continue;
      let qHead = clean(block[0].replace(/^(?:Câu|Cau)\s*\d+\s*[:.)-]?\s*/i, '').replace(/\bID\s*:\s*\d+\b/i, ''));
      const qLines = qHead ? [qHead] : [];
      let answer = null;
      const opts = [];
      const stmts = [];
      let explicitTF = false, answerSection = false;
      for (const line of block.slice(1)) {
        const am = line.match(answerLine);
        if (am) { answer = clean(am[1]); answerSection = true; continue; }
        if (answerSection) continue;
        const sm = line.match(stmtLine);
        if (sm && /(đúng|sai)\s*$/i.test(sm[2])) {
          explicitTF = true;
          const v = /đúng\s*$/i.test(sm[2]);
          stmts.push({ t: clean(sm[2].replace(/\s*(đúng|sai)\s*$/i, '')), v });
          continue;
        }
        const om = line.match(optLine);
        if (om) {
          let value = clean(om[2]);
          const marked = /(?:✓|✔|☑|\[x\]|\(đúng\)|\bđáp án đúng\b)/i.test(value);
          value = clean(value.replace(/(?:✓|✔|☑|\[x\]|\(đúng\)|\bđáp án đúng\b)/ig, ''));
          opts.push({ key: om[1].toUpperCase(), text: value, correct: marked });
          continue;
        }
        // Các dòng nằm giữa tiêu đề câu và phương án/nhận định là phần nội dung câu hỏi.
        if (!opts.length && !stmts.length && !/^ID\s*:/i.test(line)) qLines.push(line);
      }
      const q = clean(qLines.join(' '));
      if (!q) continue;
      if (explicitTF && stmts.length) {
        out.push({ type: 'tf', q, stmts });
        continue;
      }
      if (opts.length >= 2) {
        let keys = [];
        if (answer) {
          const letters = answer.match(/\b[A-H]\b/gi);
          if (letters) keys = letters.map(x => x.toUpperCase());
          if (!keys.length) {
            const found = opts.filter(o => answer.toLowerCase().includes(o.text.toLowerCase()));
            keys = found.map(o => o.key);
          }
        }
        if (!keys.length) keys = opts.filter(o => o.correct).map(o => o.key);
        const indices = [...new Set(keys.map(x => opts.findIndex(o => o.key === x)).filter(x => x >= 0))];
        if (indices.length) out.push({ type: 'mc', q, opts: opts.map(o => o.text), a: indices });
      }
    }
    if (!out.length) throw new Error('Đã đọc được văn bản nhưng không nhận diện được đáp án đúng. Hãy sao chép phần có nhãn “Đáp án đúng” hoặc dấu ✓.');
    return out;
  }

  /* CORE-START: đối chiếu, không đụng DOM, có thể kiểm thử riêng */
  const CFG = { COV: .82 };
  const norm = s => String(s == null ? '' : s).normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
    .replace(/đ/g, 'd').replace(/([+=<>%^\/*])/g, ' $1 ').replace(/[^a-z0-9\s+=<>%^\/*]/g, ' ').replace(/\s+/g, ' ').trim();
  const stripLabel = s => String(s == null ? '' : s).replace(/^\s*(?:[A-Da-d])\s*[\.\):]\s*/, '').trim();
  function tok(s) { // từ đơn + cặp từ liền kề (bỏ "Câu 12")
    const t = norm(s).replace(/\bcau \d+\b/g, '').trim();
    const raw = t ? t.split(' ') : [], mg = [];
    for (let i = 0; i < raw.length; i++) { // KaTeX tách đơn vị thành từng chữ ("a t m", "P a", "l í t"): ghép lại
      if (/^[a-z]$/.test(raw[i])) { let j = i, run = ''; while (j < raw.length && /^[a-z]$/.test(raw[j])) run += raw[j++]; if (j - i >= 2) { mg.push(run); i = j - 1; continue; } }
      mg.push(raw[i]);
    }
    const w = mg.filter(x => x.length > 1 || /\d/.test(x)), o = w.slice();
    for (let i = 0; i < w.length - 1; i++) o.push(w[i] + '_' + w[i + 1]);
    // Công thức: KaTeX tách "p_1" thành "p" + "1": ghép chữ đơn + chỉ số ("p1"), chuỗi "p1v1" và tách ngược "p1v1" gõ liền
    const f = []; let changed = false;
    for (let i = 0; i < raw.length; i++) {
      if (/^[a-z]$/.test(raw[i]) && i + 1 < raw.length && /^\d{1,3}$/.test(raw[i + 1])) { f.push(raw[i] + raw[i + 1]); i++; changed = true; } else f.push(raw[i]);
    }
    const G = /^[a-z]\d{1,3}$/;
    for (const x of f) if (G.test(x)) o.push(x);
    for (let i = 0; i < f.length; i++) { // chuỗi nhóm liền nhau: p1v1
      if (!G.test(f[i])) continue; let j = i, run = ''; while (j < f.length && G.test(f[j])) run += f[j++];
      if (j - i >= 2) o.push(run); i = j - 1;
    }
    for (const x of raw) { const m = /^(?:[a-z]\d{1,3}){2,}$/.test(x) && x.match(/[a-z]\d{1,3}/g); if (m) o.push(...m); }
    if (changed) { const ff = f.filter(x => x.length > 1 || /\d/.test(x)); for (let i = 0; i < ff.length - 1; i++) o.push(ff[i] + '_' + ff[i + 1]); }
    return o;
  }
  let IDF = new Map(), IDFMAX = 1, BK = [];
  let INV = new Map(), TOT = new Float64Array(0); // chỉ mục ngược: token -> [chỉ số câu, trọng số, ...]
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
  // Chuẩn hóa dữ liệu thô thành mục chuẩn (chưa lập chỉ mục)
  function canon(raw) {
    const out = [];
    for (const r of raw || []) {
      if (!r || !r.q) continue;
      if (r.type === 'sa' || r.answers) { // điền ô / trả lời ngắn: có thể có nhiều đáp án được chấp nhận
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
  // Dấu vân tay không phụ thuộc thứ tự phương án/nhận định (Azota hay đảo)
  const fingerprint = it => it.type + '|' + norm(it.q) + '|' + (it.type === 'tf' ? it.st.map(s => norm(s.t)) : it.type === 'mc' ? it.opts.map(norm) : []).sort().join('|');
  const answerSig = it => it.type === 'sa' ? it.ans.map(norm).sort().join('|') : it.type === 'tf' ? it.st.map(s => norm(s.t) + ' ' + (s.v ? 1 : 0)).sort().join('|') : it.a.map(i => norm(it.opts[i])).sort().join('|');
  const toRaw = it => it.type === 'sa' ? { type: 'sa', q: it.q, answers: it.ans.slice() } : it.type === 'tf' ? { type: 'tf', q: it.q, stmts: it.st.map(s => ({ t: s.t, v: s.v })) } : { type: 'mc', q: it.q, opts: it.opts.slice(), a: it.a.slice() };
  function loadBank(raw) {
    const items = [], dup = new Set();
    for (const it of canon(raw)) { const k = fingerprint(it); if (!dup.has(k)) { dup.add(k); items.push(it); } }
    const df = new Map(); let N = 0;
    for (const it of items) for (const p of it.parts) { N++; for (const t of new Set(tok(p))) df.set(t, (df.get(t) || 0) + 1); }
    IDF = new Map();
    for (const [k, v] of df) IDF.set(k, Math.log((N + 1) / (v + 1)) + 1);
    IDFMAX = Math.log(N + 1) + 1;
    for (const it of items) { // gộp vector từng phần để không sinh cặp từ nối giữa các phần
      const m = new Map();
      for (const p of it.parts) for (const [k, v] of vec(p)) m.set(k, (m.get(k) || 0) + v);
      it.fv = m;
      it.nums = new Set(tok(it.parts.join(' ')).filter(t => /^\d+$/.test(t)));
    }
    INV = new Map(); TOT = new Float64Array(items.length);
    items.forEach((it, i) => { let t = 0; for (const [k, v] of it.fv) { t += v; let a = INV.get(k); if (!a) INV.set(k, a = []); a.push(i, v); } TOT[i] = t; });
    BK = items;
    return items.length;
  }
  // ---- Bộ lọc câu đã có khi dán: trùng hẳn / gần giống / trùng trong chính lần dán
  const tset = it => it._ts || (it._ts = new Set(tok(it.parts.join(' '))));
  function jaccard(a, b) {
    const A = tset(a), B = tset(b); let c = 0;
    const [s, l] = A.size < B.size ? [A, B] : [B, A];
    for (const t of s) if (l.has(t)) c++;
    return c / (A.size + B.size - c || 1);
  }
  const jacStr = (a, b) => { const A = new Set(tok(a)), B = new Set(tok(b)); let c = 0; for (const t of A) if (B.has(t)) c++; return c / (A.size + B.size - c || 1); };
  CFG.NEAR = .9; CFG.SOFT = .65; CFG.GAP = .25; CFG.REV = .5;
  // existing = ngân hàng hiện tại (BK đã nạp). Trả về các câu thật sự mới + thống kê.
  function filterNew(raw, existing) {
    const seen = new Map(existing.map(it => [fingerprint(it), it]));
    const fresh = [], bucket = new Map(), stat = { added: 0, dup: 0, near: 0, conflict: 0, invalid: 0 };
    const cand = canon(raw); stat.invalid = (raw || []).length - cand.length;
    for (const it of cand) {
      const fp = fingerprint(it), old = seen.get(fp);
      if (old) { stat.dup++; if (answerSig(old) !== answerSig(it)) stat.conflict++; continue; }
      let twin = null; // gần giống: tra chỉ mục ngược trong ngân hàng + nhóm theo đầu câu trong lần dán
      for (const r of rank(it.parts.join(' ')).slice(0, 5)) { const e = BK[r.i]; if (e.type === it.type && jaccard(e, it) >= CFG.NEAR) { twin = e; break; } }
      const bk = it.type + norm(it.q).slice(0, 30);
      if (!twin) for (const e of bucket.get(bk) || []) if (jaccard(e, it) >= CFG.NEAR) { twin = e; break; }
      if (twin) { stat.near++; if (jacStr(answerSig(twin), answerSig(it)) < .8) stat.conflict++; continue; }
      seen.set(fp, it); fresh.push(it); if (!bucket.has(bk)) bucket.set(bk, []); bucket.get(bk).push(it); stat.added++;
    }
    return { fresh, stat };
  }
  // Xuất ngân hàng ra JSON đúng dạng để nạp lại (mỗi câu một dòng)
  const exportBank = () => '[\n' + BK.map(it => ' ' + JSON.stringify(toRaw(it))).join(',\n') + '\n]';
  const SAMPLE = '[\n {"type":"mc","q":"Thủ đô của Việt Nam là gì?","opts":["Huế","Hà Nội","Đà Nẵng","Hải Phòng"],"a":1},\n {"type":"tf","q":"Cho các nhận định về nước ở áp suất tiêu chuẩn.","stmts":[{"t":"Nước sôi ở 100 độ C","v":true},{"t":"Nước đóng băng ở 10 độ C","v":false}]},\n {"type":"sa","q":"Nước sôi ở bao nhiêu độ C?","answers":["100"]}\n]';
  // Tỉ lệ nội dung của câu trong ngân hàng xuất hiện trên màn hình (không phụ thuộc thứ tự/vị trí)
  function coverage(it, set) {
    let t = 0, h = 0;
    for (const [k, v] of it.fv) { t += v; if (set.has(k)) h += v; }
    return t ? h / t : 0;
  }
  // Tra cứu bằng chỉ mục ngược: chỉ chạm vào các câu có chung từ với màn hình (độ phủ giữ nguyên kết quả cũ)
  function rank(text) {
    const set = new Set(tok(text)), hit = new Float64Array(BK.length), touched = [];
    for (const t of set) {
      const a = INV.get(t); if (!a) continue;
      for (let k = 0; k < a.length; k += 2) { const i = a[k]; if (!hit[i]) touched.push(i); hit[i] += a[k + 1]; }
    }
    const out = touched.map(i => ({ i, c: TOT[i] ? hit[i] / TOT[i] : 0 }));
    out.sort((a, b) => b.c - a.c);
    out.screen = set;
    return out;
  }
  // Nhận các câu phủ đủ nội dung; loại câu "ăn theo" (nội dung đã được giải thích bởi các câu tốt hơn)
  function decide(rk) {
    const acc = [], seen = new Set();
    for (const r of rk) {
      if (r.c < CFG.COV) break;
      const it = BK[r.i]; let t = 0, e = 0;
      for (const [k, v] of it.fv) { t += v; if (!seen.has(k)) e += v; }
      if (acc.length && e / t < .3) continue;
      acc.push(r.i); for (const k of it.fv.keys()) seen.add(k);
    }
    if (!acc.length && rk.length && rk.screen) { // chữ màn hình bị méo: chấp nhận người dẫn đầu rõ rệt, số liệu phải khớp
      const t = rk[0], n = rk[1], it = BK[t.i], set = rk.screen;
      let a = 0, b = 0; for (const x of set) { const w = IDF.get(x) || IDFMAX; b += w; if (it.fv.has(x)) a += w; }
      let h = 0; for (const x of it.nums) if (set.has(x)) h++;
      if (t.c >= CFG.SOFT && (!n || t.c - n.c >= CFG.GAP) && b && a / b >= CFG.REV && (!it.nums.size || h / it.nums.size >= .6)) acc.push(t.i);
    }
    return acc;
  }
  /* CORE-END */

  /* =====================================================================
   * 2. LƯU TRỮ (localStorage của azota.vn)
   * ===================================================================== */
  const TEST = !!window.__APA_TEST__;
  const store = {
    get(k, d) { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} }
  };
  let userBank = store.get('apa_bank', []); if (!Array.isArray(userBank)) userBank = [];
  let on = store.get('apa_on', true);
  let bankCount = loadBank(BUILTIN.concat(userBank));

  /* =====================================================================
   * 3. ĐỌC MÀN HÌNH + TÌM VỊ TRÍ ĐỂ TÔ (không phụ thuộc cấu trúc/class của Azota)
   * ===================================================================== */
  const MATH_SKIP = '.katex-mathml,annotation,mjx-assistive-mml,.MJX_Assistive_MathML'; // bản MathML ẩn: trùng với bản hiển thị
  const inUi = el => !!(el && el.closest && el.closest('.apa-ui,.apa-badge'));
  const cut = (s, n) => s.length > n ? s.slice(0, n - 1) + '…' : s;
  function textOf(el) {
    let s = '';
    const w = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    let n;
    while ((n = w.nextNode())) { const p = n.parentElement; if (p && !p.closest('.apa-badge,script,style,' + MATH_SKIP)) s += n.nodeValue + ' '; }
    return s;
  }
  const NM = new Map(); // nhớ chữ chuẩn hóa của phần tử trong một lần quét
  const normOf = el => { let v = NM.get(el); if (v === undefined) { v = norm(textOf(el)); NM.set(el, v); } return v; };
  const PERF = { nodes: 0, full: 0, scans: 0 };
  const TIMER_NODE = /^\s*\d{1,2}\s*:\s*\d{2}(?:\s*:\s*\d{2})?\s*$/, TIMER_RE = /\b\d{1,2}\s*:\s*\d{2}(?:\s*:\s*\d{2})?\b/g;
  function screenNodes(root) { // chỉ các đoạn chữ đang nằm trong màn hình; root = vùng câu hỏi đã biết (nhanh)
    const nodes = [], vis = new Map(); let text = '';
    const w = document.createTreeWalker(root || document.body, NodeFilter.SHOW_TEXT);
    let n;
    while ((n = w.nextNode())) {
      const v = n.nodeValue; if (!v || !v.trim() || TIMER_NODE.test(v)) continue; // bỏ đồng hồ đếm giờ
      const p = n.parentElement;
      if (!p || /^(SCRIPT|STYLE|NOSCRIPT|TEXTAREA)$/.test(p.tagName)) continue;
      let ok = vis.get(p); // kiểm tra hiển thị một lần cho mỗi phần tử cha
      if (ok === undefined) {
        ok = !inUi(p) && !p.closest(MATH_SKIP);
        if (ok && !TEST) { const r = p.getBoundingClientRect(); ok = r.height > 0 && r.bottom >= 0 && r.top <= window.innerHeight * 1.2; }
        vis.set(p, ok);
      }
      if (!ok) continue;
      nodes.push({ n, nt: norm(v) }); text += v.trim() + ' ';
    }
    text = text.replace(TIMER_RE, ' ');
    PERF.nodes = nodes.length; if (!root) PERF.full++;
    return { nodes, text, norm: norm(text) };
  }
  // Từ các dòng đáp án đã tô, tìm "khung câu hỏi" nhỏ nhất chứa cả đề; lần sau chỉ quét vùng này
  function pickRoot(els, b) {
    if (!els.length || !b) return null;
    const qk = norm(b.q).slice(0, 30); let a = els[0];
    for (let d = 0; d < 14 && a && a !== document.body; d++) {
      if (els.every(e => a.contains(e)) && normOf(a).includes(qk)) { const up = a.parentElement; return up && up !== document.body ? up : a; }
      a = a.parentElement;
    }
    return null;
  }
  // Tìm phần tử "dòng" chứa đúng văn bản t (so khớp không tính khoảng trắng, vì KaTeX tách từng chữ/đơn vị);
  // trả null nếu không chắc chắn
  const CMM = new Map();
  const cm = el => { let v = CMM.get(el); if (v === undefined) { v = normOf(el).replace(/[ \/]/g, ''); CMM.set(el, v); } return v; };
  function locate(t, nodes, others) {
    if (!t) return null;
    const tc = t.replace(/[ \/]/g, ''); if (!tc) return null;
    const oth = (others || []).map(o => o.replace(/[ \/]/g, '')).filter(o => o && o !== tc);
    const lim = tc.length + (tc.length < 12 ? 6 : 20), short = tc.length < 8, found = new Set();
    const rival = el => oth.some(o => !tc.includes(o) && cm(el).includes(o)); // đã chứa phương án khác = leo quá dòng
    for (const x of nodes) {
      const c = x.c !== undefined ? x.c : (x.c = x.nt.replace(/[ \/]/g, ''));
      if (!c || !(tc.startsWith(c) || (!short && c.includes(tc)))) continue; // câu ngắn ("4.") chỉ nhận đoạn chữ trùng đầu đáp án, không nhận "Câu 4"
      let el = x.n.parentElement, d = 0;
      while (el && el !== document.body && d < 8 && !cm(el).includes(tc)) { el = el.parentElement; d++; }
      if (!el || el === document.body || cm(el).length > lim || rival(el)) continue;
      while (el.parentElement && el.parentElement !== document.body && cm(el.parentElement).length <= lim && !rival(el.parentElement)) el = el.parentElement;
      if (oth.length) { // dòng phải nằm trong một nhóm chứa đủ các phương án còn lại (loại số "3" trong đề bài)
        let p = el.parentElement; while (p && p.children.length === 1 && p.parentElement) p = p.parentElement;
        if (!p || !oth.every(o => tc.includes(o) || cm(p).includes(o))) continue;
      }
      found.add(el);
    }
    let arr = [...found].filter(a => ![...found].some(b => b !== a && a.contains(b)));
    if (arr.length > 1) { // đáp án là đuôi của phương án khác ("5 lít" trong "0,5 lít"): chọn dòng ngắn nhất
      arr.sort((a, b) => cm(a).length - cm(b).length);
      if (cm(arr[0]).length < cm(arr[1]).length) arr = [arr[0]];
    }
    return arr.length === 1 ? arr[0] : null;
  }

  /* =====================================================================
   * 5. TÔ ĐÁP ÁN, QUÉT, CACHE
   * ===================================================================== */
  const isTraining = () => true; //? !!window.__APA_TRAIN__ : /\/take-training\//.test(location.pathname);
  function clearMarks() {
    document.querySelectorAll('.apa-ok,.apa-t,.apa-f').forEach(e => e.classList.remove('apa-ok', 'apa-t', 'apa-f'));
    document.querySelectorAll('.apa-badge').forEach(b => b.remove());
  }
  function badge(el, text, cls) { const s = document.createElement('span'); s.className = 'apa-badge ' + cls; s.textContent = text; el.appendChild(s); }
  let marking = false, obs;
  function paint(ids, S, keep) {
    const lines = []; if (!keep) lastEls = []; marking = true;
    try {
      if (!keep) clearMarks();
      for (const i of ids) {
        const b = BK[i];
        if (b.type === 'sa') {
          const el = locate(norm(b.q), S.nodes) || (S.head && S.head.parentElement); // chữ công thức/đơn vị bị tách nên không định vị được câu: gắn vào tiêu đề
          if (el) { lastEls.push(el); badge(el, 'Đáp án: ' + b.ans.join(' | '), 'apa-b-ok'); }
          lines.push('✎ Điền: ' + b.ans.join(' | '));
        } else if (b.type === 'mc') {
          for (const j of b.a) {
            const el = locate(norm(b.opts[j]), S.nodes, b.opts.filter((_, k) => k !== j).map(norm)); if (el) lastEls.push(el);
            if (el) { el.classList.add('apa-ok'); badge(el, '✓ ĐÚNG', 'apa-b-ok'); }
            lines.push('✓ ' + cut(b.opts[j], 80) + (el ? '' : ' (không xác định được vị trí)'));
          }
        } else {
          for (const s of b.st) {
            const el = locate(norm(s.t), S.nodes, b.st.filter(x => x !== s).map(x => norm(x.t))); if (el) lastEls.push(el);
            if (el) { el.classList.add(s.v ? 'apa-t' : 'apa-f'); badge(el, s.v ? 'ĐÚNG' : 'SAI', s.v ? 'apa-b-ok' : 'apa-b-no'); }
            lines.push((s.v ? 'ĐÚNG' : 'SAI') + ' – ' + cut(s.t, 60) + (el ? '' : ' (?)'));
          }
        }
      }
    } finally { marking = false; if (obs) obs.takeRecords(); }
    return lines;
  }
  const cache = new Map(), matched = new Set(), missed = new Set();
  let timer = null, lastDbg = null, lastEls = [], rootEl = null;
  const hash = s => { let h = 5381; for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0; return h + ':' + s.length; };

  function finish(key, S) {
    const ids = cache.get(key) || [];
    if (!ids.length) {
      rootEl = null; missed.add(key); setResults([]); marking = true; clearMarks(); marking = false; obs.takeRecords();
      setStatus('Chưa khớp dữ liệu trong ngân hàng'); renderStats(); return;
    }
    ids.forEach(i => matched.add(i)); missed.delete(key);
    const lines = paint(ids, S);
    rootEl = lines.length ? pickRoot(lastEls, BK[ids[0]]) : null;
    if (!lines.length) { missed.add(key); setResults([]); setStatus('Không xác định được vị trí đáp án'); renderStats(); return; }
    setResults(lines); setStatus('Đã đối chiếu ' + ids.length + ' câu từ ngân hàng.'); renderStats();
  }
  const sigOf = S => hash(S.norm.slice(0, 1500));
  // ---- Chế độ lướt: cả đề nằm trên một trang, mỗi tiêu đề "Câu N" mở ra một khối câu hỏi riêng
  const HEAD_RE = /^\s*Câu\s*\d+\s*$/i;
  let lastMode = 'fallback', lastPaintKey = '';
  function findBlocks() {
    const heads = [], w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    let n;
    while ((n = w.nextNode())) {
      if (!HEAD_RE.test(n.nodeValue)) continue;
      const p = n.parentElement;
      if (!p || inUi(p) || /^(SCRIPT|STYLE|NOSCRIPT|TEXTAREA)$/.test(p.tagName)) continue;
      heads.push(n);
    }
    const cnt = el => { let c = 0; for (const h of heads) if (el.contains(h)) c++; return c; };
    return heads.map(h => { // khối = tổ tiên lớn nhất chỉ chứa đúng một tiêu đề câu
      let el = h.parentElement;
      while (el.parentElement && el.parentElement !== document.body && cnt(el.parentElement) === 1) el = el.parentElement;
      return { head: h, el, no: h.nodeValue.replace(/\D+/g, '') };
    });
  }
  function blockNodes(el) {
    const nodes = [], ok = new Map(); let text = '';
    const w = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    let n;
    while ((n = w.nextNode())) {
      const v = n.nodeValue; if (!v || !v.trim() || TIMER_NODE.test(v)) continue;
      const p = n.parentElement; if (!p || /^(SCRIPT|STYLE|NOSCRIPT|TEXTAREA)$/.test(p.tagName)) continue;
      let g = ok.get(p); if (g === undefined) { g = !p.closest('.apa-badge,.apa-ui,' + MATH_SKIP); ok.set(p, g); }
      if (!g) continue;
      nodes.push({ n, nt: norm(v) }); text += v.trim() + ' ';
    }
    text = text.replace(TIMER_RE, ' ');
    return { nodes, text, norm: norm(text) };
  }
  function scanBlocks(blocks) {
    lastMode = 'blocks'; rootEl = null;
    const items = blocks.map(b => { const S = blockNodes(b.el), key = sigOf(S); S.head = b.head; return { b, S, key, ids: S.norm ? resolveIds(S, key) : [] }; });
    const pageKey = items.map(x => x.key).join(',') + '#' + bankCount;
    if (pageKey === lastPaintKey && document.querySelector('.apa-badge')) return; // không đổi: giữ nguyên dấu đã tô
    marking = true; clearMarks(); marking = false;
    const lines = [], bad = []; let ok = 0; lastEls = [];
    for (const x of items) {
      if (!x.ids.length) {
        bad.push(x.b.no); missed.add(x.key);
        marking = true; badge(x.b.head.parentElement, 'Chưa khớp', 'apa-b-un'); marking = false;
        continue;
      }
      ok++; x.ids.forEach(i => matched.add(i)); missed.delete(x.key);
      paint(x.ids, x.S, true).forEach(l => lines.push('Câu ' + x.b.no + ': ' + l));
    }
    lastPaintKey = pageKey; obs.takeRecords();
    setResults(lines);
    setStatus('Đã đối chiếu ' + ok + '/' + items.length + ' câu' + (bad.length ? ' · Chưa khớp: Câu ' + bad.join(', ') : '') + '.');
    renderStats();
  }
  function resolveIds(S, key) { // tra chỉ mục ngược, nhớ theo chữ ký màn hình
    let ids = cache.get(key);
    if (ids === undefined) { const rk = rank(S.text); ids = decide(rk); lastDbg = { rk: rk.slice(0, 3), S }; cache.set(key, ids); }
    return ids;
  }
  function scan() {
    if (!on) return;
    try {
      if (!bankCount) { setStatus('Ngân hàng trống: dán JSON ở mục Dữ liệu.'); return; }
      if (!isTraining()) { setStatus('Chỉ hoạt động trong chế độ luyện tập.'); return; }
      PERF.scans++; NM.clear(); CMM.clear();
      const blocks = findBlocks();
      if (blocks.length) { scanBlocks(blocks); return; }
      lastMode = 'fallback'; lastPaintKey = '';
      const root = rootEl && document.body.contains(rootEl) ? rootEl : null;
      let S = screenNodes(root);
      if (!S.norm && root) { rootEl = null; S = screenNodes(null); }
      if (!S.norm) { setStatus('Không thấy nội dung trên màn hình.'); return; }
      let key = sigOf(S), ids = resolveIds(S, key);
      if (!ids.length && root) { // vùng nhanh không đủ: quét toàn trang một lần rồi nhớ lại vùng mới
        const S2 = screenNodes(null), k2 = sigOf(S2), ids2 = resolveIds(S2, k2);
        if (ids2.length) cache.set(key, ids2);
        S = S2; key = k2;
      }
      finish(key, S);
    } catch (e) { setStatus('Lỗi: ' + e.message); }
  }
  const schedule = () => { clearTimeout(timer); timer = setTimeout(scan, 60); };

  /* =====================================================================
   * 6. GIAO DIỆN
   * ===================================================================== */
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
.apa-b-ok{background:#2e7d32}  .apa-b-no{background:#c62828}.apa-b-un{background:#78909c}`;
  const st = document.createElement('style'); st.textContent = css; document.head.appendChild(st);
  const h = (tag, cls, txt) => { const e = document.createElement(tag); if (cls) e.className = cls; if (txt) e.textContent = txt; return e; };
  const row = (...c) => { const r = h('div', 'apa-r'); r.append(...c); return r; };
  const ui = h('div', 'apa-ui'), tab = h('button', 'apa-tab', '🎯'), body = h('div', 'apa-body');
  ui.style.top = store.get('apa_top', 40) + '%';

  const bOn = h('button', 'apa-big'), bScan = h('button', '', 'Quét lại');
  const stats = h('div', 'apa-s'), status = h('div', 'apa-s'), res = h('div', 'apa-res');
  const bData = h('button', '', 'Dữ liệu'), bDbg = h('button', '', 'Gỡ lỗi'), bFold = h('button', '', 'Thu gọn');
  // Mục dữ liệu
  const secData = h('div', 'apa-sec'), bPaste = h('button', '', 'Dán & nạp nội dung đã sao chép'), bClr = h('button', '', 'Xóa dữ liệu nạp'), dInfo = h('div', 'apa-s');
  const bExport = h('button', '', 'Xuất JSON'), bDl = h('button', '', 'Tải file .json'), bSample = h('button', '', 'Mẫu định dạng'), fmt = h('div', 'apa-s', 'Dạng JSON: mảng các câu. Trắc nghiệm {type:"mc", q, opts:[...], a: số thứ tự đáp án đúng, 0=A}. Đúng/Sai {type:"tf", q, stmts:[{t, v:true/false}]}. Điền ô {type:"sa", q, answers:["30","30,0"]}. Dán lại bằng nút nạp: câu trùng được tự bỏ qua.');
  secData.append(dInfo, row(bPaste), row(bExport, bDl), row(bSample, bClr), fmt);
  body.append(row(bOn, bScan), stats, status, res, row(bData), row(bDbg, bFold), secData);
  ui.append(body, tab);

  function setStatus(t) { status.textContent = t; }
  function setResults(lines) { res.style.display = lines.length ? 'block' : 'none'; res.textContent = lines.join('\n'); }
  function renderStats() {
    stats.textContent = '✓ Đã đối chiếu: ' + matched.size + ' câu · ✗ Chưa khớp: ' + missed.size;
    dInfo.textContent = 'Ngân hàng: ' + bankCount + ' câu (nhúng sẵn ' + BUILTIN.length + ' + nạp ' + userBank.length + ')';
    bOn.textContent = on ? 'ON' : 'OFF'; bOn.style.color = on ? '#2e7d32' : '#c62828';
    tab.classList.toggle('on', on);
  }
  bOn.onclick = () => { on = !on; store.set('apa_on', on); if (on) scan(); else { marking = true; clearMarks(); marking = false; obs.takeRecords(); setResults([]); setStatus('Đã tắt.'); } renderStats(); };
  bScan.onclick = () => { cache.clear(); matched.clear(); missed.clear(); rootEl = null; lastPaintKey = ''; scan(); };
  bFold.onclick = () => ui.classList.remove('open');
  bData.onclick = () => secData.classList.toggle('show');
  bPaste.onclick = async () => {
    try {
      if (!navigator.clipboard || !navigator.clipboard.readText) throw new Error('Trình duyệt chưa cho phép đọc clipboard. Hãy dùng menu Dán của trình duyệt hoặc mở Azota bằng trình duyệt hỗ trợ clipboard.');
      const copied = await navigator.clipboard.readText();
      const incoming = parseCopiedText(copied);
      const { fresh, stat } = filterNew(incoming, BK);
      userBank = userBank.concat(fresh.map(toRaw));
      store.set('apa_bank', userBank);
      bankCount = loadBank(BUILTIN.concat(userBank)); cache.clear(); matched.clear(); missed.clear(); rootEl = null; lastPaintKey = ''; renderStats();
      const report =       ('Thêm ' + stat.added + ' câu mới · bỏ qua ' + (stat.dup + stat.near) + ' câu đã có' + (stat.near ? ' (' + stat.near + ' gần giống)' : '') +
        (stat.conflict ? ' · ' + stat.conflict + ' câu khác đáp án, giữ bản cũ' : '') + (stat.invalid ? ' · ' + stat.invalid + ' mục không đọc được' : '') + '. Tổng ' + bankCount + ' câu.');
      if (on && isTraining()) scan();
      setStatus(report);
    } catch (e) { setStatus('Không nạp được: ' + e.message); }
  };
  const toClip = (t, ok) => (navigator.clipboard && navigator.clipboard.writeText ? navigator.clipboard.writeText(t) : Promise.reject()).then(() => setStatus(ok), () => prompt('Sao chép:', t));
  bExport.onclick = () => { if (!BK.length) toClip(SAMPLE, 'Ngân hàng trống: đã sao chép mẫu định dạng.'); else toClip(exportBank(), 'Đã sao chép ' + BK.length + ' câu (JSON).'); };
  bDl.onclick = () => { // tải toàn bộ ngân hàng (đang lưu trong localStorage) về thành file .json
    const text = BK.length ? exportBank() : SAMPLE, a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
    a.download = 'azota-ngan-hang-' + new Date().toISOString().slice(0, 10) + '.json';
    document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 4000);
    setStatus(BK.length ? 'Đã tải file ' + BK.length + ' câu.' : 'Ngân hàng trống: đã tải mẫu định dạng.');
  };
  bSample.onclick = () => toClip(SAMPLE, 'Đã sao chép mẫu định dạng JSON.');
  bClr.onclick = () => { userBank = []; store.set('apa_bank', []); bankCount = loadBank(BUILTIN); cache.clear(); matched.clear(); missed.clear(); rootEl = null; lastPaintKey = ''; renderStats(); scan(); };
  bDbg.onclick = () => { // sao chép thông tin để gửi lại cho người hỗ trợ chỉnh script
    const S = lastDbg ? lastDbg.S : screenNodes();
    const top = (lastDbg ? lastDbg.rk : rank(S.text).slice(0, 3)).map(r => r.i + ':' + r.c.toFixed(2) + ' ' + cut(BK[r.i].q, 40)).join('\n');
    const info = 'URL: ' + location.href + '\nNgân hàng: ' + bankCount + '\nTop khớp:\n' + top + '\nVăn bản màn hình:\n' + cut(S.text, 1500);
    (navigator.clipboard ? navigator.clipboard.writeText(info) : Promise.reject()).then(() => setStatus('Đã sao chép thông tin gỡ lỗi.'), () => prompt('Sao chép:', info));
  };

  // Tab: chạm để mở/đóng, kéo dọc để đổi vị trí (không che nút Kiểm tra/chuyển câu)
  let drag = null;
  tab.addEventListener('pointerdown', e => { drag = { y: e.clientY, top: ui.getBoundingClientRect().top, moved: false }; tab.setPointerCapture(e.pointerId); });
  tab.addEventListener('pointermove', e => {
    if (!drag) return;
    if (Math.abs(e.clientY - drag.y) > 6) drag.moved = true;
    if (drag.moved) ui.style.top = Math.max(0, Math.min(window.innerHeight - 40, drag.top + e.clientY - drag.y)) + 'px';
  });
  tab.addEventListener('pointerup', () => {
    if (drag && !drag.moved) ui.classList.toggle('open');
    else if (drag) store.set('apa_top', Math.round(100 * ui.getBoundingClientRect().top / window.innerHeight));
    drag = null;
  });
  document.body.appendChild(ui);

  obs = new MutationObserver(recs => {
    if (marking) return;
    if (!document.body.contains(ui)) document.body.appendChild(ui);
    const ignorable = r => inUi(r.target) || (r.type === 'characterData'
      ? /^[\d\s:.]{1,16}$/.test(r.target.nodeValue || '') // chỉ đồng hồ/số đếm đổi
      : (r.addedNodes.length + r.removedNodes.length > 0 && [...r.addedNodes, ...r.removedNodes].every(n => n.nodeType === 1 && inUi(n))));
    if (recs.every(ignorable)) return;
    schedule();
  });
  obs.observe(document.body, { childList: true, subtree: true, characterData: true });
  const onView = () => { if (lastMode === 'fallback') schedule(); }; // chế độ lướt đã quét cả trang, cuộn không cần quét lại
  window.addEventListener('scroll', onView, { passive: true, capture: true });
  window.addEventListener('resize', onView, { passive: true });

  renderStats();
  if (TEST) window.__APA__ = { setBank: b => { bankCount = loadBank(b); cache.clear(); lastPaintKey = ''; }, parse: parseCopiedText, userBank: () => userBank, scan, rank, decide, loadBank, filterNew, exportBank, coverage, canon, toRaw, getBK: () => BK, perf: () => PERF, root: () => rootEl, SAMPLE, status: () => status.textContent, results: () => res.textContent, setBank: b => { bankCount = loadBank(b); cache.clear(); } };
  if (on) scan(); else setStatus('Đã tắt.');
})();
