/* ANDNEEDS ERP 권한 (멤버별 메뉴) — 모든 페이지 <head>의 로그인 확인 바로 다음에서 실행
   멤버·권한 관리는 /app/members (Supabase erp_members 테이블). 대표(owner)는 전체, 멤버는 허용된 메뉴만. */
(function () {
  if (window.self !== window.top) return; // iframe 안의 앱은 바깥 페이지가 처리
  var SB = "https://nifytqcqfattzpwlzpmb.supabase.co";
  var ANON = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5pZnl0cWNxZmF0dHpwd2x6cG1iIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODA4NTQxMzQsImV4cCI6MjA5NjQzMDEzNH0.0kE9ypuxzVNLuXwjHRTEsMxQ80vitqXjTUretQKXHUs";
  var PAGE_MENU = {
    "home.html": "home", "calendar.html": "calendar", "calendar-legacy.html": "calendar", "planner-app.html": "calendar",
    "sales.html": "performance", "index.html": "performance", "sku.html": "performance", "margin.html": "performance",
    "unitmargin.html": "performance", "cafe24.html": "performance", "29cm.html": "performance", "influencer.html": "performance", "seongsu.html": "performance",
    "production.html": "collection", "studio.html": "collection", "cody.html": "collection", "cody-tool.html": "collection",
    "video.html": "collection", "linesheet.html": "collection", "linesheet-app.html": "collection",
    "inventory.html": "stock", "reorder.html": "stock", "purchase.html": "stock", "orders.html": "stock",
    "secretary.html": "business", "taxsecretary.html": "business", "invoice.html": "business", "receivables.html": "business",
    "expenses.html": "business", "vat.html": "business", "taxreport.html": "business", "vault.html": "business",
    "marketing.html": "marketing"
  };
  var FIRST = [["home", "home.html"], ["calendar", "calendar.html"], ["performance", "sales.html"], ["collection", "production.html"],
    ["stock", "inventory.html"], ["business", "secretary.html"], ["marketing", "/app/influencers"]];
  var GROUP_LABEL = { performance: "PERFORMANCE", collection: "COLLECTION", stock: "STOCK", business: "BUSINESS", marketing: "MARKETING" };

  var auth = null;
  try { auth = JSON.parse(localStorage.getItem("anniz_auth") || "null"); } catch (e) {}
  if (!auth || !auth.access_token) return; // 로그인 확인 스크립트가 처리
  var email = (auth.email || "").toLowerCase();
  var CK = "anniz_member";
  function fileOf(href) {
    if (!href) return "";
    if (href.indexOf("/app/") === 0 || href === "/app") return "@app";
    return href.split("?")[0].split("#")[0].split("/").pop() || "home.html";
  }
  function menuOf(href) {
    var f = fileOf(href);
    if (f === "@app") return href.indexOf("/app/members") === 0 ? "owner" : "marketing";
    return PAGE_MENU[f] || null;
  }

  function apply(m) {
    document.documentElement.style.visibility = "";
    if (!m) { location.replace("/app/influencers"); return; } // 멤버 아님 → 안내 화면
    var owner = m.role === "owner" && m.active !== false;
    var allowed = {}; (m.menus || []).forEach(function (k) { allowed[k] = 1; });
    function ok(k) { return owner || !k || allowed[k]; }
    if (m.active === false) { location.replace("/app/influencers"); return; }
    // 이 페이지 권한
    var here = PAGE_MENU[fileOf(location.pathname)];
    if (here && !ok(here)) {
      for (var i = 0; i < FIRST.length; i++) if (ok(FIRST[i][0])) { location.replace(FIRST[i][1]); return; }
      location.replace("/app/influencers"); return;
    }
    function tidy() {
      var name = m.name || email.split("@")[0];
      document.querySelectorAll(".anv-rlabel").forEach(function (el) {
        if (el.textContent !== name) el.textContent = name;
        if (!el.getAttribute("data-acct")) {
          el.setAttribute("data-acct", "1"); el.style.cursor = "pointer"; el.title = "내 계정 · 비밀번호 변경";
          el.addEventListener("click", function () { location.href = "/app/account"; });
        }
      });
      var mp = document.getElementById("mobileMenuPanel");
      if (mp && !document.getElementById("anvAcctLink")) {
        var a = document.createElement("a"); a.id = "anvAcctLink"; a.href = "/app/account"; a.className = "mobile-menu-item"; a.textContent = "내 계정 · 비밀번호 변경";
        mp.appendChild(a);
      }
      if (owner) return;
      document.querySelectorAll(".anv-tn[data-key]").forEach(function (b) { if (!ok(b.getAttribute("data-key"))) b.style.display = "none"; });
      document.querySelectorAll("a[href]").forEach(function (a) {
        if (a.closest(".anv-logo")) return;
        var k = menuOf(a.getAttribute("href"));
        if (k && !ok(k)) a.style.display = "none";
      });
      document.querySelectorAll(".mobile-menu-section").forEach(function (s) {
        var k = Object.keys(GROUP_LABEL).filter(function (g) { return GROUP_LABEL[g] === s.textContent.trim(); })[0];
        if (k && !ok(k)) s.style.display = "none";
      });
      var first = FIRST.filter(function (f) { return ok(f[0]); })[0];
      if (first && !ok("home")) document.querySelectorAll(".anv-logo, a.anv-logo").forEach(function (a) { a.setAttribute("href", first[1]); });
    }
    function run() {
      tidy();
      // 드롭다운·검색 결과는 나중에 그려지므로 변화를 지켜보며 계속 정리
      new MutationObserver(tidy).observe(document.body, { childList: true, subtree: true });
    }
    if (document.body) run(); else document.addEventListener("DOMContentLoaded", run);
  }

  var cached = null;
  try { cached = JSON.parse(sessionStorage.getItem(CK) || "null"); } catch (e) {}
  var fresh = cached && cached.email === email && Date.now() - cached.t < 5 * 60 * 1000;
  if (fresh) apply(cached.member);
  else document.documentElement.style.visibility = "hidden";
  var failSafe = setTimeout(function () { document.documentElement.style.visibility = ""; }, 9000); // 네트워크 문제 시 화면은 보이게
  function currentToken() {
    try { var x = JSON.parse(localStorage.getItem("anniz_auth") || "null"); return x && x.access_token; } catch (e) { return null; }
  }
  function lookup(token) {
    return fetch(SB + "/rest/v1/erp_members?select=email,name,role,menus,active&email=eq." + encodeURIComponent(email), {
      headers: { apikey: ANON, Authorization: "Bearer " + token }
    });
  }
  function done(m) {
    clearTimeout(failSafe);
    try { sessionStorage.setItem(CK, JSON.stringify({ email: email, member: m, t: Date.now() })); } catch (e) {}
    if (!fresh || JSON.stringify(m) !== JSON.stringify(cached.member)) apply(m);
  }
  function fallback() {
    // 확인 실패: 예전에 확인한 권한이 있으면 그걸로, 없으면 화면만 보이게
    clearTimeout(failSafe);
    if (cached && cached.email === email) apply(cached.member);
    else document.documentElement.style.visibility = "";
  }
  function attempt(token, tries) {
    lookup(token).then(function (r) {
      if (r.status === 401 && tries > 0) {
        // 로그인 토큰이 막 만료된 경우: 로그인 확인 스크립트가 새 토큰을 받을 때까지 기다렸다가 다시
        var waited = 0, iv = setInterval(function () {
          var t = currentToken(); waited += 300;
          if ((t && t !== token) || waited >= 6000) { clearInterval(iv); attempt(t || token, tries - 1); }
        }, 300);
        return;
      }
      if (!r.ok) throw new Error(r.status);
      return r.json().then(function (rows) { done(rows && rows[0] ? rows[0] : null); });
    }).catch(fallback);
  }
  attempt(auth.access_token, 1);
})();
