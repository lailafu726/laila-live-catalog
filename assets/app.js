/* 日常滋补 · 达人合作货盘 —— 纯前端静态页，数据来自 ./data.json，无后端、不保存修改 */
(function () {
  "use strict";

  var state = { fine: "全部", q: "", data: null };

  var SALES_WINDOW = "统计：2026-09-23 — 2026-10-22";

  /* ---------- 工具 ---------- */
  function esc(s) {
    if (s === null || s === undefined) return "";
    return String(s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function isUrl(s) {
    return typeof s === "string" && /^https?:\/\//i.test(s.trim());
  }

  function dash(v) {
    return v === null || v === undefined || v === "" ? "—" : esc(v);
  }

  /* 展示类目归并为六组；原始商品细类和数据保持不变。 */
  var CATEGORY_ORDER = ["蜂蜜蜂胶", "养生茶饮", "膏方滋补", "冲饮食补", "食养零食", "草本护理"];
  var CATEGORY_GROUP = {
    "蜂蜜": "蜂蜜蜂胶", "蜂胶营养": "蜂蜜蜂胶", "口腔护理": "蜂蜜蜂胶",
    "养生茶": "养生茶饮", "食养饮品": "养生茶饮",
    "膏方": "膏方滋补", "滋补原料": "膏方滋补",
    "食补粉": "冲饮食补", "营养补充": "冲饮食补", "咖啡冲饮": "冲饮食补",
    "食养零食": "食养零食", "食养油脂": "食养零食", "草本护理": "草本护理"
  };
  function groupOf(fineCategory) {
    return CATEGORY_GROUP[fineCategory] || fineCategory;
  }

  /* 商家在指定类目下的商品：
     优先读主数据预分组的 m.categoryProducts[cat]；旧数据无该字段时按商品 fineCategory 映射兜底。
     不借其他类目商品填数量。 */
  function categoryProductList(m, cat) {
    if (m.categoryProducts && Object.prototype.hasOwnProperty.call(m.categoryProducts, cat)) {
      return Array.isArray(m.categoryProducts[cat]) ? m.categoryProducts[cat] : [];
    }
    return (m.products || []).filter(function (p) { return groupOf(p.fineCategory) === cat; });
  }

  /* 商家所属类目：categoryProducts 存在时取其非空 keys（保持固定顺序），否则回退旧 fineCategories 映射 */
  function fineCats(m) {
    if (m.categoryProducts) {
      return CATEGORY_ORDER.filter(function (c) {
        return Array.isArray(m.categoryProducts[c]) && m.categoryProducts[c].length > 0;
      });
    }
    var raw = Array.isArray(m.fineCategories) && m.fineCategories.length ? m.fineCategories : [m.subcategory || m.category || "未分类"];
    return Array.from(new Set(raw.filter(Boolean).map(groupOf)));
  }

  /* 店铺标签：选中类目且提供了该类目关键词时优先用类目关键词，否则用原 keywords。不编造。 */
  function keywordsOf(m) {
    if (state.fine !== "全部" && m.categoryKeywords &&
        Array.isArray(m.categoryKeywords[state.fine]) && m.categoryKeywords[state.fine].length) {
      return m.categoryKeywords[state.fine].filter(Boolean);
    }
    return Array.isArray(m.keywords) ? m.keywords.filter(Boolean) : [];
  }

  function bySales30Desc(a, b) {
    var sa = typeof a.sales30 === "number" ? a.sales30 : -1;
    var sb = typeof b.sales30 === "number" ? b.sales30 : -1;
    return sb - sa;
  }

  /* 商品：选中类目时只取该类目商品按近30天销量降序；「全部」时沿用全店精选 m.products。最多5款 */
  function sortedProducts(m) {
    var ps = state.fine === "全部" ? (m.products || []).slice() : categoryProductList(m, state.fine).slice();
    ps.sort(bySales30Desc);
    return ps.slice(0, 5);
  }

  /* 默认口径（全部）商品数，用于头部统计，不随筛选变化 */
  function defaultProductCount(m) {
    return Math.min((m.products || []).length, 5);
  }

  /* 不展示库存或销量，相关数据仅用于选品排序。 */
  function productMeta(p) {
    var parts = [];
    return parts.length ? parts.join(" · ") : "";
  }

  /* 历史达人明细：只在详情里展开，不上首页主要标签位 */
  function historyText(p) {
    var parts = [];
    if (p.partners) parts.push("历史合作达人：" + p.partners);
    if (Array.isArray(p.liveHistory) && p.liveHistory.length) {
      parts.push(p.liveHistory.map(function (h) { return (h.name || "") + (h.liveCount ? "（" + h.liveCount + "场）" : ""); }).join("、"));
    }
    return parts.join(" · ");
  }

  /* ---------- 数据加载 ---------- */
  function load() {
    return fetch("./data.json", { cache: "no-cache" })
      .then(function (r) {
        if (!r.ok) throw new Error("HTTP " + r.status);
        return r.json();
      })
      .then(function (d) {
        if (!d || !Array.isArray(d.merchants)) throw new Error("data.json 格式不正确");
        state.data = d;
        renderAll();
      })
      .catch(function (e) {
        var list = document.getElementById("merchantList");
        list.innerHTML =
          '<div class="empty-state"><p>数据加载失败</p><p class="empty-sub">' +
          esc(e.message) +
          ' — 请确认页面与 data.json 一同部署（需通过 http 访问，直接双击打开本地文件无法读取）</p></div>';
        document.getElementById("headSub").textContent = "数据加载失败";
      });
  }

  /* ---------- 筛选 ---------- */
  function filtered() {
    var merchants = state.data.merchants;
    var q = state.q.trim().toLowerCase();
    return merchants.filter(function (m) {
      if (state.fine !== "全部") {
        if (m.categoryProducts) {
          /* 有预分组数据：该类目必须有真实商品才展示，不借其他类填数量 */
          if (categoryProductList(m, state.fine).length === 0) return false;
        } else if (fineCats(m).indexOf(state.fine) === -1) {
          return false;
        }
      }
      if (q) {
        if (searchHaystack(m).indexOf(q) === -1) return false;
      }
      return true;
    });
  }

  /* 搜索范围：全店精选 m.products + 预分组的各类目商品（含新补商品），两者都覆盖 */
  function searchHaystack(m) {
    var pool = (m.products || []).slice();
    if (m.categoryProducts) {
      CATEGORY_ORDER.forEach(function (c) {
        if (Array.isArray(m.categoryProducts[c])) pool = pool.concat(m.categoryProducts[c]);
      });
    }
    return [
      m.name, m.originalName,
      (m.aliases || []).join(" "),
      fineCats(m).join(" "),
      keywordsOf(m).join(" "),
      m.category, m.subcategory, m.note, m.historicalPartners,
      Array.isArray(m.sourceSheets) ? m.sourceSheets.join(" ") : ""
    ]
      .concat(pool.map(function (p) {
        return [p.name, p.partners, Array.isArray(p.tags) ? p.tags.join(" ") : ""].join(" ");
      }))
      .join(" ")
      .toLowerCase();
  }

  /* ---------- 渲染 ---------- */
  function renderAll() {
    renderHead();
    renderChips();
    renderList();
  }

  function renderHead() {
    var d = state.data;
    var fines = {};
    var productCount = 0;
    d.merchants.forEach(function (m) {
      fineCats(m).forEach(function (c) { fines[c] = true; });
      productCount += defaultProductCount(m);
    });
    var parts = [d.merchants.length + " 家货盘商家", Object.keys(fines).length + " 个类目"];
    if (productCount > 0) parts.push(productCount + " 款精选商品");
    if (d.updatedAt) parts.push("数据更新：" + d.updatedAt);
    document.getElementById("headSub").textContent = parts.join(" · ");
  }

  function renderChips() {
    // 细类 chips：商家可属多个细类，各细类分别计数（计数口径=商家数）
    var fineCount = {};
    state.data.merchants.forEach(function (m) {
      fineCats(m).forEach(function (c) { fineCount[c] = (fineCount[c] || 0) + 1; });
    });
    var fineEl = document.getElementById("fineChips");
    var html = chipHtml("全部", state.data.merchants.length, state.fine === "全部");
    CATEGORY_ORDER.filter(function(c) { return fineCount[c]; }).forEach(function (c) {
      html += chipHtml(c, fineCount[c], state.fine === c);
    });
    fineEl.innerHTML = html;

    if (!fineEl.dataset.bound) {
      fineEl.addEventListener("click", function (e) {
        var btn = e.target.closest("button[data-cat]");
        if (!btn) return;
        state.fine = btn.dataset.cat;
        renderChips();
        renderList();
      });
      fineEl.dataset.bound = "1";
    }
  }

  function chipHtml(label, count, active) {
    return (
      '<button class="chip' + (active ? " active" : "") + '" data-cat="' + esc(label) + '">' + esc(label) +
      '<span class="chip-count">' + count + "</span></button>"
    );
  }

  /* keywords 标签：客单项带统计口径 tooltip（数据来自真实统计，不编造） */
  function kwTagHtml(k) {
    var t = /客单/.test(k) ? ' title="2026-09-23—2026-10-22，苍穹客单价"' : "";
    return '<span class="kw-tag"' + t + ">" + esc(k) + "</span>";
  }

  function productItemHtml(p, detailed, rank) {
    var img = p.image
      ? '<img class="product-thumb" loading="lazy" src="' + esc(p.image) + '" alt="' + esc(p.name || "商品图") + '">'
      : '<div class="product-thumb-empty">□</div>';
    var nameHtml = esc(p.name || "（未提供商品名）");
    if (detailed && isUrl(p.sourceUrl)) {
      nameHtml = '<a href="' + esc(p.sourceUrl.trim()) + '" target="_blank" rel="noopener noreferrer">' + nameHtml + " ↗</a>";
    }
    var rankHtml = rank ? '<span class="top-mark" title="精选第 ' + rank + '">Top' + rank + "</span>" : "";
    // 功效/卖点标签：product.tags 数组，合规措辞
    var tagsHtml = Array.isArray(p.tags) && p.tags.length
      ? '<p class="p-tags">' + p.tags.map(function (t) { return '<span class="p-tag">' + esc(t) + "</span>"; }).join("") + "</p>"
      : "";
    var meta = productMeta(p);
    var metaHtml = meta
      ? '<p class="p-meta" title="' + SALES_WINDOW + '">' + esc(meta) + "</p>"
      : "";
    // 详情展开：历史达人 / 佣金 / 专属链接等，不上首页
    var detailHtml = "";
    if (detailed) {
      var bits = [];
      var hist = historyText(p);
      if (hist) bits.push(esc(hist));
      if (p.commission) bits.push("佣金 " + esc(p.commission));
      if (p.status) bits.push(esc(p.status) + (p.exclusive ? " · 专属链接，机制需重谈" : ""));
      if (bits.length) detailHtml = '<p class="p-history">' + bits.join(" · ") + "</p>";
    }
    return (
      '<div class="product-item">' + img +
      '<div class="product-info"><p class="p-name">' + rankHtml + nameHtml + "</p>" + tagsHtml + metaHtml + detailHtml + "</div>" +
      '<span class="p-price">' + (p.price !== null && p.price !== undefined && p.price !== "" ? esc(p.price) : "") + "</span>" +
      "</div>"
    );
  }

  function cardHtml(m) {
    var products = sortedProducts(m); // 选中类目时=该类目商品；全部=全店精选
    var shown = products.slice(0, 3);
    var kws = keywordsOf(m);
    var inCategory = state.fine !== "全部";

    var introHtml =
      '<div class="merchant-intro">' +
      '<div class="mc-head"><div class="mc-title">' +
      "<h3>" + esc(m.name || "（未命名商家）") + "</h3>" +
      '<div class="cat-tags">' + fineCats(m).map(function (c) { return '<span class="cat-tag">' + esc(c) + "</span>"; }).join("") + "</div>" +
      "</div>" +
      (isUrl(m.shopUrl)
        ? '<a class="mc-shop" href="' + esc(m.shopUrl.trim()) + '" target="_blank" rel="noopener noreferrer">店铺主页 ↗</a>'
        : "") +
      "</div>" +
      (kws.length ? '<div class="kw-tags">' + kws.map(kwTagHtml).join("") + "</div>" : "") +
      "</div>";

    var productsHtml = "";
    if (shown.length) {
      productsHtml =
        '<div class="merchant-products">' +
        (inCategory ? '<p class="cat-note">本类精选 · ' + esc(state.fine) + "</p>" : "") +
        '<div class="mc-products">' +
        shown.map(function (p, i) { return productItemHtml(p, false, i + 1); }).join("") +
        "</div>";
      if (products.length > 3) {
        productsHtml += '<p class="p-unknown">还有 ' + (products.length - 3) + " 款，见详情</p>";
      }
      productsHtml +=
        '<div class="mc-foot">' +
        '<button class="btn-detail" data-merchant="' + esc(m.name || "") + '">查看详情</button></div>' +
        "</div>";
    } else {
      productsHtml =
        '<div class="merchant-products">' +
        (inCategory ? '<p class="cat-note">本类精选 · ' + esc(state.fine) + "</p>" : "") +
        '<p class="p-unknown">' + esc(m.emptyReason || "本次查询未找到可展示商品，详见原始货盘资料") + "</p>" +
        '<div class="mc-foot">' +
        '<button class="btn-detail" data-merchant="' + esc(m.name || "") + '">查看详情</button></div>' +
        "</div>";
    }

    return '<article class="merchant-card">' + introHtml + productsHtml + "</article>";
  }

  function renderList() {
    var list = filtered();
    var el = document.getElementById("merchantList");
    el.innerHTML = list.map(cardHtml).join("");
    document.getElementById("emptyState").hidden = list.length > 0;
    document.getElementById("countLine").textContent =
      "当前展示 " + list.length + " / " + state.data.merchants.length + " 家商家";

    if (!el.dataset.bound) {
      el.addEventListener("click", function (e) {
        var btn = e.target.closest("button[data-merchant]");
        if (!btn) return;
        var m = state.data.merchants.find(function (x) { return (x.name || "") === btn.dataset.merchant; });
        if (m) openDrawer(m);
      });
      el.dataset.bound = "1";
    }
  }

  /* ---------- 抽屉 ---------- */
  function kvRow(k, vHtml) {
    return '<div class="kv"><span class="k">' + k + '</span><span class="v">' + vHtml + "</span></div>";
  }

  function openDrawer(m) {
    var products = sortedProducts(m); // 选中类目时=该类目商品，最多5款，不借其他类
    var kws = keywordsOf(m);
    var inCategory = state.fine !== "全部";
    var body = "";

    // 基本信息
    body += '<div class="drawer-section"><h4>基本信息</h4><div class="kv-list">';
    body += kvRow("细类", fineCats(m).map(function (c) { return '<span class="cat-tag">' + esc(c) + "</span>"; }).join(" ") || "—");
    body += kvRow(
      "店铺",
      isUrl(m.shopUrl)
        ? '<a href="' + esc(m.shopUrl.trim()) + '" target="_blank" rel="noopener noreferrer">打开店铺主页 ↗</a>'
        : "—"
    );
    if (m.owner) body += kvRow("负责人", esc(m.owner));
    if (m.originalName && m.originalName !== m.name) body += kvRow("清单名称", esc(m.originalName));
    body += "</div></div>";

    // 店铺标签
    if (kws.length) {
      body += '<div class="drawer-section"><h4>店铺标签</h4><div class="kw-tags">' +
        kws.map(kwTagHtml).join("") + "</div></div>";
    }

    // 历史合作与备注（低调保留在抽屉）
    if (m.historicalPartners || m.note) {
      body += '<div class="drawer-section"><h4>历史合作与备注</h4><div class="kv-list">';
      if (m.historicalPartners) body += kvRow("历史合作", esc(m.historicalPartners));
      if (m.note) body += kvRow("备注", esc(m.note));
      body += "</div></div>";
    }

    // 精选商品：选中类目时只展示该类目商品
    var headTitle = inCategory
      ? "本类精选（" + esc(state.fine) + " · " + products.length + " 款）"
      : "精选商品（" + products.length + " 款）";
    body += '<div class="drawer-section"><h4>' + headTitle + "</h4>";
    if (products.length) {
      body +=
        '<div class="drawer-products">' +
        products.map(function (p, i) { return productItemHtml(p, true, i + 1); }).join("") +
        "</div>";
    } else {
      body += '<div class="drawer-empty">' + esc(m.emptyReason || "本次查询未找到可展示商品") + " 可打开原始货盘资料或联系莱拉。</div>";
    }
    body += "</div>";

    // 原始货盘资料
    body += '<div class="drawer-section"><h4>原始货盘资料</h4>';
    if (m.materials && m.materials.length) {
      body += m.materials.map(function (a) { return '<p class="material-link"><a href="' + esc(a.url) + '" target="_blank" rel="noopener noreferrer">' + esc(a.title) + " ↗</a></p>"; }).join("");
      body += '<p class="p-unknown">链接来自原表，未核实资料的最新版本；部分资料需原文档权限。</p>';
    } else if (m.originalMaterial) {
      if (isUrl(m.originalMaterial)) {
        body += '<p class="material-link"><a href="' + esc(m.originalMaterial.trim()) + '" target="_blank" rel="noopener noreferrer">打开实际货盘链接 ↗</a></p>';
      } else {
        body += '<div class="drawer-empty">原始资料为文件：《' + esc(m.originalMaterial) + "》（仅有文件名，未附线上链接，请线下向莱拉索取）</div>";
      }
    } else {
      body += '<div class="drawer-empty">未登记原始资料</div>';
    }
    body += "</div>";

    document.getElementById("drawerTitle").textContent = m.name || "商家详情";
    document.getElementById("drawerSub").textContent = inCategory ? fineCats(m).join(" · ") + "（当前类目：" + state.fine + "）" : fineCats(m).join(" · ");
    document.getElementById("drawerBody").innerHTML = body;
    document.getElementById("drawer").hidden = false;
    document.getElementById("drawerMask").hidden = false;
    document.body.style.overflow = "hidden";
  }

  function closeDrawer() {
    document.getElementById("drawer").hidden = true;
    document.getElementById("drawerMask").hidden = true;
    document.body.style.overflow = "";
  }

  // 抽屉内图片加载失败降级
  document.addEventListener("error", function (e) {
    if (e.target && e.target.classList && e.target.classList.contains("product-thumb")) {
      var div = document.createElement("div");
      div.className = "product-thumb-empty";
      div.textContent = "□";
      e.target.replaceWith(div);
    }
  }, true);

  document.getElementById("drawerClose").addEventListener("click", closeDrawer);
  document.getElementById("drawerMask").addEventListener("click", closeDrawer);
  document.addEventListener("keydown", function (e) {
    if (e.key === "Escape") closeDrawer();
  });

  document.getElementById("searchInput").addEventListener("input", function (e) {
    state.q = e.target.value;
    renderList();
  });

  /* ---------- 企微二维码浮动 ---------- */
  var qrFloat = document.getElementById("qrFloat");
  document.getElementById("qrToggle").addEventListener("click", function (e) {
    e.stopPropagation();
    qrFloat.classList.toggle("open");
  });
  document.addEventListener("click", function (e) {
    if (qrFloat.classList.contains("open") && !qrFloat.contains(e.target)) {
      qrFloat.classList.remove("open");
    }
  });

  load();
})();
