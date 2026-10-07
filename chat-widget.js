/*!
 * ANDNEEDS 상담톡 위젯 (채널톡 대체)
 * 카페24 스킨에 아래 한 줄만 넣으면 됩니다:
 *   <script src="https://andneeds-erp.vercel.app/chat-widget.js" defer></script>
 *
 * ▼▼▼ 인사말 / 자주 묻는 질문 / 상담시간은 바로 아래 CONFIG 에서 고치세요 ▼▼▼
 */
(function () {
  'use strict';
  if (window.__ANV_CHAT__) return;
  window.__ANV_CHAT__ = true;

  /* =========================== CONFIG =========================== */
  var CONFIG = {
    brand: 'ANDNEEDS',
    subtitle: '보통 1시간 내에 답변드려요',

    // 상담 가능 시간 (24시간제). 주말·공휴일은 자동으로 '상담시간 아님'
    hours: { days: [1, 2, 3, 4, 5], start: 10, end: 17 }, // 평일 10:00~17:00

    greeting: '안녕하세요, 앤니즈입니다 :)\n궁금한 점을 편하게 남겨주세요.',
    offHours: '지금은 상담시간이 아니에요.\n메시지를 남겨주시면 평일 10시~17시에 순서대로 답변드립니다.',

    // 자주 묻는 질문 — 버튼을 누르면 바로 답이 뜹니다 (상담 접수 안 됨)
    faq: [
      { q: '배송은 얼마나 걸리나요?',
        a: '평일 오후 2시 이전 결제 건은 당일 출고되며, 보통 1~3일 내에 받아보실 수 있어요.\n출고 후 운송장은 문자로 안내드립니다.' },
      { q: '교환 / 반품 하고 싶어요',
        a: '상품 수령 후 7일 이내 신청 가능합니다.\n단순 변심은 왕복 배송비 6,000원이 부과되며, 착용·세탁·택 제거 시에는 어려워요.\n마이페이지 > 주문내역에서 신청하시거나 여기에 주문번호를 남겨주세요.' },
      { q: '사이즈가 고민돼요',
        a: '각 상품 상세페이지 하단에 실측 사이즈표가 있어요.\n평소 사이즈와 비교해보시고, 그래도 애매하시면 키·몸무게·평소 사이즈를 남겨주시면 추천해드릴게요!' },
      { q: '품절 상품 재입고 되나요?',
        a: '상품명을 남겨주시면 재입고 계획을 확인해 알려드릴게요.\n상세페이지의 [재입고 알림] 신청도 가능합니다.' }
    ],

    // Supabase (앤니즈 프로젝트) — 공개용 anon 키라 노출되어도 안전합니다
    sbUrl: 'https://nifytqcqfattzpwlzpmb.supabase.co',
    sbAnon: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5pZnl0cWNxZmF0dHpwd2x6cG1iIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODA4NTQxMzQsImV4cCI6MjA5NjQzMDEzNH0.0kE9ypuxzVNLuXwjHRTEsMxQ80vitqXjTUretQKXHUs',

    accent: '#2E2E2E',
    pollOpenMs: 3500,
    pollIdleMs: 30000
  };
  /* ========================= /CONFIG ============================ */

  var LS_TOKEN = 'anv_chat_token';
  var LS_LAST = 'anv_chat_lastid';
  var LS_SEEN = 'anv_chat_seen';

  var state = {
    open: false,
    token: null,
    lastId: 0,
    unread: 0,
    starting: false,
    timer: null,
    msgs: []
  };
  try {
    state.token = localStorage.getItem(LS_TOKEN) || null;
    state.lastId = parseInt(localStorage.getItem(LS_LAST) || '0', 10) || 0;
  } catch (e) {}

  /* --------------------------- utils --------------------------- */
  function esc(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function fmtBody(s) {
    return esc(s)
      .replace(/(https?:\/\/[^\s<]+)/g, '<a href="$1" target="_blank" rel="noopener">$1</a>')
      .replace(/\n/g, '<br>');
  }
  function fmtTime(iso) {
    var d = iso ? new Date(iso) : new Date();
    var h = d.getHours(), m = d.getMinutes();
    var ap = h < 12 ? '오전' : '오후';
    var hh = h % 12; if (hh === 0) hh = 12;
    return ap + ' ' + hh + ':' + (m < 10 ? '0' + m : m);
  }
  function isOpenHours() {
    var d = new Date();
    return CONFIG.hours.days.indexOf(d.getDay()) !== -1 &&
           d.getHours() >= CONFIG.hours.start && d.getHours() < CONFIG.hours.end;
  }
  function rpc(fn, body) {
    return fetch(CONFIG.sbUrl + '/rest/v1/rpc/' + fn, {
      method: 'POST',
      headers: {
        'apikey': CONFIG.sbAnon,
        'Authorization': 'Bearer ' + CONFIG.sbAnon,
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      },
      body: JSON.stringify(body || {})
    }).then(function (r) {
      if (!r.ok) return r.text().then(function (t) { throw new Error(t || r.status); });
      return r.json();
    });
  }

  /* ----------------------------- UI ---------------------------- */
  var host = document.createElement('div');
  host.id = 'anv-chat-host';
  host.style.cssText = 'position:fixed;z-index:2147483000;right:0;bottom:0;width:0;height:0;';
  var root = host.attachShadow ? host.attachShadow({ mode: 'open' }) : host;

  var CSS = [
    ':host,*{box-sizing:border-box}',
    '.wrap{position:fixed;right:20px;bottom:20px;font-family:"Helvetica Neue",Helvetica,"Apple SD Gothic Neo","Noto Sans KR",sans-serif;-webkit-font-smoothing:antialiased}',
    '.btn{width:56px;height:56px;border-radius:50%;background:' + CONFIG.accent + ';border:0;cursor:pointer;display:flex;align-items:center;justify-content:center;box-shadow:0 6px 24px rgba(0,0,0,.22);transition:transform .18s ease,opacity .18s ease;position:relative}',
    '.btn:hover{transform:translateY(-2px)}',
    '.btn svg{width:26px;height:26px}',
    '.badge{position:absolute;top:-2px;right:-2px;min-width:20px;height:20px;border-radius:10px;background:#E5484D;color:#fff;font-size:11px;line-height:20px;text-align:center;padding:0 6px;font-weight:600;border:2px solid #fff}',
    '.panel{position:absolute;right:0;bottom:70px;width:352px;max-width:calc(100vw - 32px);height:540px;max-height:calc(100vh - 120px);background:#fff;border-radius:16px;border:1px solid rgba(0,0,0,.11);box-shadow:0 18px 60px rgba(0,0,0,.18);display:flex;flex-direction:column;overflow:hidden;opacity:0;transform:translateY(10px) scale(.98);pointer-events:none;transition:opacity .18s ease,transform .18s ease}',
    '.panel.on{opacity:1;transform:none;pointer-events:auto}',
    '.hd{background:' + CONFIG.accent + ';color:#fff;padding:18px 18px 16px;flex:0 0 auto;position:relative}',
    '.hd h3{margin:0;font-size:16px;font-weight:300;letter-spacing:.14em}',
    '.hd p{margin:5px 0 0;font-size:12px;opacity:.68;font-weight:300}',
    '.hd .x{position:absolute;top:14px;right:12px;width:28px;height:28px;border:0;background:transparent;color:#fff;opacity:.6;cursor:pointer;font-size:19px;line-height:1;border-radius:6px}',
    '.hd .x:hover{opacity:1;background:rgba(255,255,255,.12)}',
    '.body{flex:1 1 auto;overflow-y:auto;padding:16px;background:#FAFAFA}',
    '.row{display:flex;margin-bottom:12px}',
    '.row.me{justify-content:flex-end}',
    '.bub{max-width:78%;padding:10px 13px;border-radius:14px;font-size:13.5px;line-height:1.62;word-break:break-word;white-space:normal}',
    '.row.them .bub{background:#fff;border:1px solid rgba(0,0,0,.09);color:#222;border-top-left-radius:4px}',
    '.row.me .bub{background:' + CONFIG.accent + ';color:#fff;border-top-right-radius:4px}',
    '.bub a{color:inherit;text-decoration:underline}',
    '.tm{font-size:10.5px;color:#9A9A9A;margin:0 6px;align-self:flex-end;flex:0 0 auto;padding-bottom:2px}',
    '.chips{display:flex;flex-wrap:wrap;gap:7px;margin:2px 0 14px}',
    '.chip{border:1px solid rgba(0,0,0,.16);background:#fff;color:#333;border-radius:999px;padding:8px 13px;font-size:12.5px;cursor:pointer;font-family:inherit;transition:all .15s}',
    '.chip:hover{border-color:' + CONFIG.accent + ';background:' + CONFIG.accent + ';color:#fff}',
    '.notice{text-align:center;font-size:11.5px;color:#8A8A8A;margin:0 0 12px;line-height:1.6}',
    '.ft{flex:0 0 auto;border-top:1px solid rgba(0,0,0,.09);background:#fff;padding:10px 12px;display:flex;align-items:flex-end;gap:8px}',
    'textarea{flex:1;border:0;outline:0;resize:none;font-family:inherit;font-size:13.5px;line-height:1.5;max-height:96px;padding:8px 4px;color:#222;background:transparent}',
    'textarea::placeholder{color:#B0B0B0}',
    '.send{flex:0 0 auto;width:34px;height:34px;border-radius:50%;border:0;background:' + CONFIG.accent + ';cursor:pointer;display:flex;align-items:center;justify-content:center;opacity:.3;transition:opacity .15s}',
    '.send.on{opacity:1}',
    '.send svg{width:16px;height:16px}',
    '.credit{text-align:center;font-size:10px;color:#BDBDBD;padding:0 0 8px;background:#fff;letter-spacing:.06em}',
    '.dots{display:inline-block}',
    '.dots i{display:inline-block;width:5px;height:5px;margin:0 1.5px;border-radius:50%;background:#BBB;animation:bl 1.2s infinite}',
    '.dots i:nth-child(2){animation-delay:.2s}.dots i:nth-child(3){animation-delay:.4s}',
    '@keyframes bl{0%,60%,100%{opacity:.25}30%{opacity:1}}',
    '@media (max-width:420px){.wrap{right:14px;bottom:14px}.panel{width:calc(100vw - 28px);height:calc(100vh - 100px)}}'
  ].join('\n');

  var ICON_CHAT = '<svg viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"/></svg>';
  var ICON_X = '<svg viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="1.8" stroke-linecap="round"><path d="M18 6 6 18M6 6l12 12"/></svg>';
  var ICON_SEND = '<svg viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="m22 2-7 20-4-9-9-4 20-7z"/></svg>';

  var wrap = document.createElement('div');
  wrap.className = 'wrap';
  wrap.innerHTML =
    '<div class="panel" part="panel">' +
      '<div class="hd">' +
        '<h3>' + esc(CONFIG.brand) + '</h3>' +
        '<p class="sub">' + esc(CONFIG.subtitle) + '</p>' +
        '<button class="x" aria-label="닫기">' + ICON_X + '</button>' +
      '</div>' +
      '<div class="body"></div>' +
      '<div class="ft">' +
        '<textarea rows="1" placeholder="메시지를 입력하세요"></textarea>' +
        '<button class="send">' + ICON_SEND + '</button>' +
      '</div>' +
      '<div class="credit">ANDNEEDS</div>' +
    '</div>' +
    '<button class="btn" aria-label="상담 문의">' + ICON_CHAT + '</button>';

  var style = document.createElement('style');
  style.textContent = CSS;
  root.appendChild(style);
  root.appendChild(wrap);

  var elPanel = wrap.querySelector('.panel');
  var elBody = wrap.querySelector('.body');
  var elBtn = wrap.querySelector('.btn');
  var elClose = wrap.querySelector('.x');
  var elTa = wrap.querySelector('textarea');
  var elSend = wrap.querySelector('.send');

  /* --------------------------- render -------------------------- */
  function bubble(sender, body, iso) {
    var me = sender === 'user';
    var row = document.createElement('div');
    row.className = 'row ' + (me ? 'me' : 'them');
    var b = '<div class="bub">' + fmtBody(body) + '</div>';
    var t = '<div class="tm">' + fmtTime(iso) + '</div>';
    row.innerHTML = me ? (t + b) : (b + t);
    return row;
  }
  function push(sender, body, iso, noScroll) {
    elBody.appendChild(bubble(sender, body, iso));
    if (!noScroll) scrollDown();
  }
  function scrollDown() {
    var go = function () { elBody.scrollTop = elBody.scrollHeight; };
    go();
    requestAnimationFrame(go);
    setTimeout(go, 60);
  }
  function typing(on) {
    var t = elBody.querySelector('.typing');
    if (on) {
      if (t) return;
      var row = document.createElement('div');
      row.className = 'row them typing';
      row.innerHTML = '<div class="bub"><span class="dots"><i></i><i></i><i></i></span></div>';
      elBody.appendChild(row);
      scrollDown();
    } else if (t) { t.remove(); }
  }
  function renderChips() {
    var old = elBody.querySelector('.chips');
    if (old) old.remove();
    var c = document.createElement('div');
    c.className = 'chips';
    CONFIG.faq.forEach(function (f, i) {
      var b = document.createElement('button');
      b.className = 'chip'; b.type = 'button'; b.textContent = f.q;
      b.addEventListener('click', function () { onFaq(i); });
      c.appendChild(b);
    });
    var live = document.createElement('button');
    live.className = 'chip'; live.type = 'button'; live.textContent = '직접 문의하기';
    live.addEventListener('click', function () { elTa.focus(); });
    c.appendChild(live);
    elBody.appendChild(c);
    scrollDown();
  }
  function notice(text) {
    var n = document.createElement('div');
    n.className = 'notice';
    n.innerHTML = fmtBody(text);
    elBody.appendChild(n);
  }

  function onFaq(i) {
    var f = CONFIG.faq[i];
    push('user', f.q);
    var chips = elBody.querySelector('.chips');
    if (chips) chips.remove();
    typing(true);
    setTimeout(function () {
      typing(false);
      push('bot', f.a);
      setTimeout(renderChips, 250);
    }, 550);
  }

  /* ------------------------- conversation ---------------------- */
  function firstOpen() {
    elBody.innerHTML = '';
    push('bot', CONFIG.greeting, null, true);
    if (!isOpenHours()) notice(CONFIG.offHours);
    renderChips();
  }

  function ensureRoom() {
    if (state.token) return Promise.resolve(state.token);
    if (state.starting) return state.starting;
    state.starting = rpc('chat_start', {
      p_page: (location.href || '').slice(0, 300),
      p_ua: (navigator.userAgent || '').slice(0, 300)
    }).then(function (tok) {
      state.token = tok;
      try { localStorage.setItem(LS_TOKEN, tok); } catch (e) {}
      state.starting = null;
      return tok;
    }).catch(function (e) {
      state.starting = null;
      throw e;
    });
    return state.starting;
  }

  function send() {
    var v = elTa.value.trim();
    if (!v) return;
    elTa.value = '';
    autosize();
    toggleSend();
    var chips = elBody.querySelector('.chips');
    if (chips) chips.remove();
    push('user', v);

    ensureRoom()
      .then(function (tok) { return rpc('chat_send', { p_token: tok, p_body: v }); })
      .then(function (id) {
        if (id && id > state.lastId) {
          state.lastId = id;
          try { localStorage.setItem(LS_LAST, String(id)); } catch (e) {}
        }
        if (!isOpenHours() && !elBody.querySelector('.notice')) {
          notice(CONFIG.offHours);
          scrollDown();
        }
        poll();
      })
      .catch(function () {
        notice('메시지 전송에 실패했어요. 잠시 후 다시 시도해주세요.');
        scrollDown();
      });
  }

  function poll() {
    if (!state.token) return Promise.resolve();
    return rpc('chat_poll', { p_token: state.token, p_since: state.lastId })
      .then(function (rows) {
        if (!rows || !rows.length) return;
        var gotAdmin = false;
        rows.forEach(function (m) {
          if (m.sender === 'admin') { push('admin', m.body, m.created_at); gotAdmin = true; }
          if (m.id > state.lastId) state.lastId = m.id;
        });
        try { localStorage.setItem(LS_LAST, String(state.lastId)); } catch (e) {}
        if (gotAdmin && !state.open) {
          state.unread++;
          renderBadge();
        }
      })
      .catch(function () {});
  }

  function renderBadge() {
    var old = elBtn.querySelector('.badge');
    if (old) old.remove();
    if (state.unread > 0 && !state.open) {
      var b = document.createElement('span');
      b.className = 'badge';
      b.textContent = state.unread > 9 ? '9+' : String(state.unread);
      elBtn.appendChild(b);
    }
  }

  function schedule() {
    if (state.timer) clearInterval(state.timer);
    state.timer = setInterval(poll, state.open ? CONFIG.pollOpenMs : CONFIG.pollIdleMs);
  }

  /* -------------------------- open/close ----------------------- */
  var booted = false;
  function open() {
    state.open = true;
    state.unread = 0;
    renderBadge();
    elPanel.classList.add('on');
    if (!booted) {
      booted = true;
      firstOpen();
      if (state.token) {
        // 이전 대화가 있으면 처음부터 다시 불러옵니다
        rpc('chat_poll', { p_token: state.token, p_since: 0 }).then(function (rows) {
          if (!rows || !rows.length) return;
          elBody.innerHTML = '';
          push('bot', CONFIG.greeting, null, true);
          rows.forEach(function (m) {
            push(m.sender === 'user' ? 'user' : 'admin', m.body, m.created_at, true);
            if (m.id > state.lastId) state.lastId = m.id;
          });
          try { localStorage.setItem(LS_LAST, String(state.lastId)); } catch (e) {}
          renderChips();
        }).catch(function () {});
      }
    }
    schedule();
    setTimeout(function () { elTa.focus(); }, 220);
    scrollDown();
  }
  function close() {
    state.open = false;
    elPanel.classList.remove('on');
    schedule();
  }

  /* --------------------------- events -------------------------- */
  function autosize() {
    elTa.style.height = 'auto';
    elTa.style.height = Math.min(elTa.scrollHeight, 96) + 'px';
  }
  function toggleSend() {
    if (elTa.value.trim()) elSend.classList.add('on');
    else elSend.classList.remove('on');
  }
  elBtn.addEventListener('click', function () { state.open ? close() : open(); });
  elClose.addEventListener('click', close);
  elSend.addEventListener('click', send);
  elTa.addEventListener('input', function () { autosize(); toggleSend(); });
  elTa.addEventListener('keydown', function (e) {
    if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) { e.preventDefault(); send(); }
  });
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && state.open) close();
  });

  /* --------------------------- 외부 API ------------------------- */
  window.ANVChat = { open: open, close: close, toggle: function () { state.open ? close() : open(); } };

  /* ---------------------------- boot --------------------------- */
  function mount() {
    document.body.appendChild(host);
    if (state.token) { poll(); }
    schedule();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mount);
  else mount();
})();
