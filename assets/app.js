/* Resilience Finance Repository, the public browsing frontend.
   ---------------------------------------------------------------------------
   THE ONLY PAGE. It replaced the 2026-09-15 list page on 2026-09-16 by curator
   instruction, and that page was archived to archive/site-list-page/ in the same
   pass rather than left beside this one. Two live copies of one search, access
   state and card rule is the drift failure url_norm.py exists as one shared copy
   to prevent, so if a second page is ever wanted, the shared half is extracted
   into a third file rather than copied.

   The curated sections this page shipped with, foundational reading, question-led
   views and a Lab and partner feed, were REMOVED on 2026-09-16 by curator
   instruction. They are not missing and are not to be restored on the assumption
   that they were lost. site/README.md records what the editorial file still holds.

   It reads TWO files:
     data/repository.json  written by scripts/export_repository_site.py, machine
                           owned, overwritten on every export
     data/editorial.json   curator owned, written by hand, read by nothing else
   Counts are never stored in either. Every number on the page is computed here,
   so the editorial layer cannot go stale against the corpus. */

(function () {
  "use strict";

  var DATA = null, ED = null, EMBED = null, THUMBS = null;

  /* BUNDLED MODE. scripts/build_single_file.py inlines the three payloads and this
     file into one .html that opens from the file system with no server. It is the
     same code, not a fork: the only differences are that the data is already here
     rather than fetched, and that viewer.html does not exist beside a single file,
     so the reader that frames a PDF is not offered. A `file://` page cannot fetch
     its siblings anyway, which is what a bundle is for. */
  var BUNDLE = (typeof window !== "undefined" && window.__RFR_BUNDLE) || null;
  var PAGE = 25;

  /* `landing: false` keeps a facet off the Overview grid while leaving it on Browse.
     Access is the only one: it answers "can I read this" rather than "what is this
     about", which is a question a reader has after choosing a record, not before. */
  var FACETS = [
    { key: "themes",        param: "theme",  label: "By finance theme",  pill: "pill-theme",  multi: true },
    { key: "resource_type", param: "type",   label: "By resource type",  pill: "pill-type",   multi: false },
    { key: "geographies",   param: "geo",    label: "By geography",      pill: "pill-geo",    multi: true },
    { key: "year",          param: "year",   label: "By year",           pill: "pill-year",   multi: false,
      kind: "range" },
    { key: "access",        param: "access", label: "By access",         pill: "pill-access", multi: false,
      landing: false,
      /* The stored value stays `source`, because it is what the exporter writes and what
         the URL carries; only the wording a reader sees changes. */
      labels: { source: "Free", paywall: "Paywall", mirror: "Lab copy", dead: "Link gone", none: "No link" } }
  ];

  function facetLabel(f, value) {
    return (f.labels && f.labels[value]) || value;
  }

  /* Which facets the reader has opened past the short list, by param. Lives here rather
     than in the URL: it is a display state, not a filter, so it should not travel in a
     shared link or survive a reload as though it were one. */
  var facetOpen = {};

  /* ── US subdivisions ─────────────────────────────────────────────────────
     Written out rather than derived from the data. Whether somewhere is part of the
     United States is a fact about the world, not about how this corpus happens to be
     tagged, and a rule inferred from co-occurrence would silently reclassify a region
     the first time someone mis-tagged one. All fifty states are listed even though
     only twenty-two are in use, so a newly tagged state nests on arrival instead of
     appearing beside Europe until somebody notices.

     A label not in this set and not `US` is treated as a top level region, which is
     the safe direction to be wrong in: it stays visible rather than disappearing
     inside a group nobody has opened. */
  var US_SUB = new Set([
    "Alabama", "Alaska", "Arizona", "Arkansas", "California", "Colorado", "Connecticut",
    "Delaware", "Florida", "Georgia", "Hawaii", "Idaho", "Illinois", "Indiana", "Iowa",
    "Kansas", "Kentucky", "Louisiana", "Maine", "Maryland", "Massachusetts", "Michigan",
    "Minnesota", "Mississippi", "Missouri", "Montana", "Nebraska", "Nevada",
    "New Hampshire", "New Jersey", "New Mexico", "New York", "New York State",
    "North Carolina", "North Dakota", "Ohio", "Oklahoma", "Oregon", "Pennsylvania",
    "Rhode Island", "South Carolina", "South Dakota", "Tennessee", "Texas", "Utah",
    "Vermont", "Virginia", "Washington", "West Virginia", "Wisconsin", "Wyoming",
    "District of Columbia", "Washington DC", "Puerto Rico", "U.S. Virgin Islands",
    "US Virgin Islands", "Guam", "American Samoa", "Northern Mariana Islands"
  ]);

  function isUsPlace(g) { return g === "US" || US_SUB.has(g); }

  /* ── the year range ──────────────────────────────────────────────────────
     Held as two numbers rather than as a set of selected values, because a reader
     narrowing a fifteen-year span wants "2019 onward", not fifteen tick boxes. Null
     means unset, which is the whole span: an unset filter and a filter that happens
     to cover everything are the same result but different states, and only the first
     should put a chip on the page or a parameter in the URL. */
  var yearRange = { from: null, to: null };

  function yearBounds() {
    var c = (DATA && DATA.counts) || {};
    return [c.year_min || 0, c.year_max || 0];
  }

  function yearActive() {
    return yearRange.from !== null || yearRange.to !== null;
  }

  function yearSpan() {
    var b = yearBounds();
    return [yearRange.from === null ? b[0] : yearRange.from,
            yearRange.to === null ? b[1] : yearRange.to];
  }

  function setYear(from, to) {
    var b = yearBounds();
    from = Math.max(b[0], Math.min(b[1], from));
    to = Math.max(b[0], Math.min(b[1], to));
    if (from > to) { var t = from; from = to; to = t; }
    // Back to the full span is back to unset, so the chip and the URL clear themselves.
    if (from === b[0] && to === b[1]) { yearRange.from = yearRange.to = null; }
    else { yearRange.from = from; yearRange.to = to; }
    state.shown = PAGE;
  }

  var ACCESS = {
    source:  { action: "Open the source", note: null },
    paywall: { action: "Open the source", note: "A subscription or institutional login may be needed." },
    mirror:  { action: "Read the PDF",    note: null },
    dead:    { action: "Try the Internet Archive", note: "The publisher's link no longer resolves." },
    none:    { action: null, note: "No public link is recorded for this record." }
  };

  var state = {
    q: "",
    selected: {},
    sort: "newest",
    view: "start",
    shown: PAGE,
    open: null
  };
  FACETS.forEach(function (f) { state.selected[f.param] = new Set(); });

  /* ── helpers ─────────────────────────────────────────────────────────── */

  function $(id) { return document.getElementById(id); }

  function el(tag, cls, text) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text !== undefined && text !== null) n.textContent = text;
    return n;
  }

  function fmtDate(iso) {
    if (!iso) return null;
    var p = String(iso).split("-");
    var m = ["January","February","March","April","May","June",
             "July","August","September","October","November","December"];
    if (p.length >= 3) return m[+p[1] - 1] + " " + (+p[2]) + ", " + p[0];
    if (p.length === 2) return m[+p[1] - 1] + " " + p[0];
    return p[0];
  }

  function isPdfUrl(url) {
    if (!url) return false;
    return String(url).toLowerCase().split("?")[0].split("#")[0].slice(-4) === ".pdf";
  }

  /* THE BYLINE, IN ONE PLACE. Author, publisher, date, and the publisher dropped
     when it only repeats the author. Both the Browse all card and the Recently
     published tile call this, because the defect fixed earlier on 2026-10-05 was
     exactly two surfaces answering `who is this by` from two different fields. */
  function bylineBits(rec) {
    var bits = [];
    if (rec.authors) bits.push(rec.authors);
    var pub = rec.publisher || "", auth = rec.authors || "";
    if (pub && pub.trim().toLowerCase() !== auth.trim().toLowerCase()) bits.push(pub);
    var d = fmtDate(rec.date) || (rec.year ? String(rec.year) : null);
    if (d) bits.push(d);
    return bits;
  }

  function hostOf(url) {
    try { return new URL(url).hostname.replace(/^www\./, ""); } catch (e) { return null; }
  }

  /* Whether viewer.html can actually render this record's document in a frame.
     Measured per record by scripts/check_pdf_embedding.py, never guessed here: a
     publisher sending X-Frame-Options renders an EMPTY frame, and a button that
     leads to a blank page is the failure this site is built to avoid. An absent
     file, an absent record and an `embeddable` of null all mean no, because an
     unconfirmed check is a recorded outcome rather than a soft yes. */
  function canEmbed(rec) {
    if (!EMBED || !EMBED.records) return false;
    var e = EMBED.records[String(rec.nnn)];
    return !!(e && e.embeddable === true);
  }

  function esc(s) { return String(s).replace(/[.*+?^${}()|[\]\\]/g, "\\$&"); }

  /* Tokens match at a WORD START, so "insur" still finds "insurance" while
     "rating" no longer finds "operating". The bare-substring version of this is
     the same defect the vocabulary hit twice, with the alias `climate` on every
     document in the corpus and the canonical `Generate` matching the verb. */
  function tokenize(q) {
    var out = [], re = /"([^"]+)"|(\S+)/g, m;
    while ((m = re.exec(q))) {
      var t = (m[1] || m[2] || "").trim().toLowerCase();
      if (t) out.push(t);
    }
    return out;
  }

  function tokenRe(t) { return new RegExp("\\b" + esc(t), "i"); }

  function haystack(rec) {
    if (rec._hay) return rec._hay;
    rec._hay = {
      title: rec.title || "",
      who: [(rec.authors || ""), (rec.publisher || ""),
            (rec.institutions || []).join(" ")].join(" "),
      tags: [(rec.keywords || []).join(" "), (rec.themes || []).join(" "),
             (rec.geographies || []).join(" "), (rec.resource_type || "")].join(" "),
      body: [(rec.summary || ""), (rec.insights || []).join(" ")].join(" ")
    };
    return rec._hay;
  }

  /* title 8, author and organization 4, keywords and tags 3, summary and
     insights 1. Every token must appear somewhere or the record is out. */
  function score(rec, tokens) {
    if (!tokens.length) return 0;
    var h = haystack(rec), total = 0;
    for (var i = 0; i < tokens.length; i++) {
      var re = tokenRe(tokens[i]), s = 0;
      if (re.test(h.title)) s += 8;
      if (re.test(h.who))   s += 4;
      if (re.test(h.tags))  s += 3;
      if (re.test(h.body))  s += 1;
      if (!s) return -1;
      total += s;
    }
    return total;
  }

  /* Highlighting builds a DocumentFragment. Record text is publisher text and
     never goes in through innerHTML. */
  function highlight(text, tokens) {
    var frag = document.createDocumentFragment();
    if (!text) return frag;
    if (!tokens.length) { frag.appendChild(document.createTextNode(text)); return frag; }
    var re = new RegExp("\\b(" + tokens.map(esc).join("|") + ")", "ig");
    var last = 0, m;
    while ((m = re.exec(text))) {
      if (m.index > last) frag.appendChild(document.createTextNode(text.slice(last, m.index)));
      frag.appendChild(el("mark", null, m[0]));
      last = m.index + m[0].length;
      if (re.lastIndex === m.index) re.lastIndex++;
    }
    if (last < text.length) frag.appendChild(document.createTextNode(text.slice(last)));
    return frag;
  }

  function valuesOf(rec, key) {
    var v = rec[key];
    if (v === null || v === undefined || v === "") return [];
    return Array.isArray(v) ? v.slice() : [String(v)];
  }

  /* ── filtering ───────────────────────────────────────────────────────── */

  function passesExcept(rec, skipParam) {
    if (skipParam !== "year" && yearActive()) {
      var sp = yearSpan();
      if (!rec.year || rec.year < sp[0] || rec.year > sp[1]) return false;
    }
    for (var i = 0; i < FACETS.length; i++) {
      var f = FACETS[i];
      if (f.param === skipParam) continue;
      var sel = state.selected[f.param];
      if (!sel.size) continue;
      var vals = valuesOf(rec, f.key);
      var hit = vals.some(function (v) { return sel.has(String(v)); });
      /* `US` selected matches the country tag OR any state, because a record tagged
         only `California` is still a record about the United States. Measured
         2026-09-21: every state co-occurs with `US` except one California record,
         so this is a small correction rather than a large reinterpretation. */
      if (!hit && f.param === "geo" && sel.has("US")) {
        hit = vals.some(function (v) { return isUsPlace(String(v)); });
      }
      if (!hit) return false;
    }
    return true;
  }

  function current() {
    var tokens = tokenize(state.q);
    var out = [];
    for (var i = 0; i < DATA.records.length; i++) {
      var r = DATA.records[i];
      if (!passesExcept(r, null)) continue;
      var s = score(r, tokens);
      if (s < 0) continue;
      r._score = s;
      out.push(r);
    }
    var by = state.sort;
    if (by === "relevance" && !tokens.length) by = "newest";
    out.sort(function (a, b) {
      if (by === "relevance") return (b._score - a._score) || String(a.title).localeCompare(b.title);
      if (by === "title") return String(a.title).localeCompare(String(b.title));
      var ad = a.date || (a.year ? a.year + "-00-00" : ""), bd = b.date || (b.year ? b.year + "-00-00" : "");
      if (by === "oldest") return (ad || "9999").localeCompare(bd || "9999");
      return (bd || "").localeCompare(ad || "");
    });
    return out;
  }

  /* Counts respond to every OTHER active filter, so an option that would return
     nothing is not offered. */
  function facetCounts(f) {
    var tokens = tokenize(state.q), tally = new Map();
    for (var i = 0; i < DATA.records.length; i++) {
      var r = DATA.records[i];
      if (!passesExcept(r, f.param)) continue;
      if (score(r, tokens) < 0) continue;
      valuesOf(r, f.key).forEach(function (v) {
        v = String(v);
        tally.set(v, (tally.get(v) || 0) + 1);
      });
    }
    var rows = Array.from(tally, function (e) { return { name: e[0], count: e[1] }; });
    if (f.key === "year") rows.sort(function (a, b) { return b.name.localeCompare(a.name); });
    else rows.sort(function (a, b) { return b.count - a.count || a.name.localeCompare(b.name); });
    return rows;
  }

  /* ── URL state ───────────────────────────────────────────────────────── */

  function readUrl() {
    var sp = new URLSearchParams(location.search);
    if (location.hash.length > 1) {
      var h = new URLSearchParams(location.hash.slice(1));
      if (Array.from(h.keys()).length) sp = h;
    }
    if (sp.get("ui") === "dark") document.documentElement.setAttribute("data-ui", "dark");
    state.q = sp.get("q") || "";
    FACETS.forEach(function (f) {
      if (f.kind === "range") return;
      var raw = sp.get(f.param);
      state.selected[f.param] = new Set(raw ? raw.split(",").map(function (s) { return s.trim(); }).filter(Boolean) : []);
    });
    yearRange.from = yearRange.to = null;
    var yr = sp.get("year");
    if (yr) {
      // `2014-2020` is a span; a bare `2020` is what older links carry and still works.
      var parts = yr.split("-").map(function (n) { return parseInt(n, 10); }).filter(function (n) { return !isNaN(n); });
      if (parts.length === 2) { yearRange.from = parts[0]; yearRange.to = parts[1]; }
      else if (parts.length === 1) { yearRange.from = yearRange.to = parts[0]; }
    }
    state.sort = sp.get("sort") || (state.q ? "relevance" : "newest");
    state.open = sp.get("open");
    /* AN EXPLICIT view WINS. The inference below is for a bare or hand-written link,
       where a query obviously means the reader wants results. But it used to run even
       when the URL said otherwise, so clicking Overview with a search still active
       wrote a URL that read back as Browse, and the back button landed on the wrong
       tab. Invisible until history started working, on 2026-10-06. */
    var v = sp.get("view");
    var anyFilter = state.q || FACETS.some(function (f) { return state.selected[f.param].size; });
    if (v === "browse" || v === "start") state.view = v;
    else state.view = (anyFilter || state.open) ? "browse" : "start";
  }

  /* WHY BACK AND FORWARD DID NOTHING UNTIL 2026-10-06.
     Every state change called history.replaceState, which rewrites the one entry the
     page already owns instead of adding another, so the back button had nothing to
     return to and left the site entirely. Opening a record was worse: `open` was read
     from the URL and never written back, and go() cleared it after scrolling, so an
     expanded record was not addressable at all and could not be shared or returned to.

     Now a state change that actually changes the URL PUSHES an entry, and popstate
     re-reads the URL and re-renders. Three guards make that safe:

       suppressHistory  set while rendering in response to popstate. The browser has
                        already moved the URL at that point, so writing again would
                        corrupt the stack.
       firstRender      the initial render REPLACES, so arriving at a deep link does
                        not leave a duplicate entry under it.
       target === here  a render that does not change the URL writes nothing. go()
                        runs on sort changes, height posts and tab re-selection, and
                        an entry per render would make back useless.

     THE QUERY STRING IS USED WHERE THE PAGE IS SERVED, the hash where it is not. A
     bundle opened from the file system cannot push a new path, so it keeps the hash
     and replaces in place; readUrl has always accepted both. */
  var CAN_PUSH = location.protocol === "http:" || location.protocol === "https:";
  var suppressHistory = false;
  var firstRender = true;

  function urlState() {
    var sp = new URLSearchParams();
    if (state.q) sp.set("q", state.q);
    FACETS.forEach(function (f) {
      if (f.kind === "range") return;
      var s = state.selected[f.param];
      if (s.size) sp.set(f.param, Array.from(s).join(","));
    });
    if (yearActive()) { var ys = yearSpan(); sp.set("year", ys[0] + "-" + ys[1]); }
    if (state.sort !== "newest") sp.set("sort", state.sort);
    /* `view` is written whenever leaving it out would read back as something else:
       always for browse, and for start when a live filter would otherwise infer
       browse. That keeps every URL a faithful round trip, which is what back and
       forward depend on. */
    if (state.view === "browse") sp.set("view", "browse");
    else if (state.q || FACETS.some(function (f) { return state.selected[f.param].size; })
             || state.open) sp.set("view", "start");
    if (state.open) sp.set("open", String(state.open));
    if (document.documentElement.getAttribute("data-ui") === "dark") sp.set("ui", "dark");
    return sp.toString();
  }

  function writeUrl() {
    if (suppressHistory) return;
    var s = urlState();
    var target = CAN_PUSH ? (location.pathname + (s ? "?" + s : ""))
                          : (s ? "#" + s : location.pathname);
    var here = CAN_PUSH ? (location.pathname + location.search)
                        : (location.pathname + location.hash);
    if (target === here) return;
    /* Wrapped because a `file://` document is not guaranteed to allow a history
       entry to be written, and an exception here would take the whole page down
       before a record was ever drawn. Losing the shareable address on a local copy
       costs nothing, since nobody shares a file:// address. */
    try {
      if (firstRender) history.replaceState(null, "", target);
      else history.pushState(null, "", target);
    } catch (e) { /* a file:// document that refuses is fine */ }
  }

  /* ── cards ───────────────────────────────────────────────────────────── */

  function relatedTo(rec) {
    var themes = new Set(rec.themes || []), keys = new Set(rec.keywords || []);
    var scored = [];
    DATA.records.forEach(function (o) {
      if (o.nnn === rec.nnn) return;
      var s = 0;
      (o.themes || []).forEach(function (t) { if (themes.has(t)) s += 3; });
      (o.keywords || []).forEach(function (k) { if (keys.has(k)) s += 2; });
      if (s > 0) scored.push({ rec: o, s: s });
    });
    scored.sort(function (a, b) { return b.s - a.s || String(a.rec.title).localeCompare(b.rec.title); });
    return scored.slice(0, 3).map(function (x) { return x.rec; });
  }

  function buildDetails(rec, box) {
    box.textContent = "";

    var why = ED && ED.why_this_matters && ED.why_this_matters.records
            ? ED.why_this_matters.records[String(rec.nnn)] : null;
    if (why) {
      var wb = el("div", "why-block");
      wb.appendChild(el("p", "why-label", "Why this matters"));
      wb.appendChild(el("p", "why-text", why));
      box.appendChild(wb);
    }

    if ((rec.insights || []).length) {
      box.appendChild(el("p", "field-label", "Key insights"));
      var ul = el("ul", "insights");
      rec.insights.forEach(function (t) { ul.appendChild(el("li", null, t)); });
      box.appendChild(ul);
    }

    var grid = el("div", "field-grid");
    function field(label, value) {
      if (!value) return;
      var d = el("div");
      d.appendChild(el("p", "field-label", label));
      d.appendChild(el("p", "field-value", value));
      grid.appendChild(d);
    }
    field("Record", "NNN " + rec.nnn);
    field("Resource type", rec.resource_type);
    field("Finance theme", (rec.themes || []).join(", "));
    field("Geography", (rec.geographies || []).join(", "));
    field("Organizations", (rec.institutions || []).join(", "));
    field("Permissions", rec.permissions);
    field("Published", fmtDate(rec.date) || (rec.year ? String(rec.year) : null));
    box.appendChild(grid);

    if (reportParts(rec)) {
      var cfg = (ED && ED.feedback) || {};
      var rwrap = el("div", "report-row");
      var rbtn = el("button", "report-link", cfg.record_label || "Report a problem with this record");
      rbtn.type = "button";
      rbtn.addEventListener("click", function () { openReport(rec); });
      rwrap.appendChild(rbtn);
      box.appendChild(rwrap);
    }

    var rel = relatedTo(rec);
    if (rel.length) {
      var wrap = el("div");
      wrap.style.marginTop = "14px";
      wrap.appendChild(el("p", "field-label", "Related records, computed from shared themes and keywords"));
      var list = el("div", "related");
      rel.forEach(function (o) {
        var b = el("button", null, o.title + "  ›");
        b.type = "button";
        b.addEventListener("click", function () {
          state.q = "";
          $("q").value = "";
          state.open = String(o.nnn);
          go("browse");
        });
        list.appendChild(b);
      });
      wrap.appendChild(list);
      box.appendChild(wrap);
    }
  }

  function card(rec, tokens) {
    var node = $("tpl-card").content.firstElementChild.cloneNode(true);
    node.dataset.nnn = rec.nnn;

    var access = ACCESS[rec.access] ? rec.access : "none";
    var spec = ACCESS[access];
    /* The document itself, as opposed to the URL a button routes through. On a mirror
       that is the Lab's copy; on a dead record the button goes to an archive wrapper
       while the document is still the original. Declared once so the viewer button and
       the PDF marker cannot disagree about which file they are describing. */
    var docUrl = access === "mirror" ? rec.mirror_url : rec.url;
    var target = access === "mirror" ? rec.mirror_url
               : access === "dead" ? "https://web.archive.org/web/" + rec.url
               : rec.url;

    /* The title is a link to the same place the button goes, so the obvious thing to
       click is clickable. A record with no destination keeps a plain heading rather
       than a dead link: `access: none` means no public URL exists, and 4 records are
       in that state. Highlighting still applies, inside the link. */
    var titleEl = node.querySelector(".title");
    if (target && spec.action) {
      var titleLink = el("a", "title-link");
      titleLink.href = target;
      titleLink.target = "_blank";
      titleLink.rel = "noopener noreferrer";
      var th = hostOf(target);
      if (th) titleLink.title = "Opens " + th + " in a new tab";
      titleLink.appendChild(highlight(rec.title, tokens));
      titleEl.appendChild(titleLink);
    } else {
      titleEl.appendChild(highlight(rec.title, tokens));
    }

    node.querySelector(".card-head").insertBefore(thumbFor(rec, true),
      node.querySelector(".card-title-col"));

    /* AUTHOR, PUBLISHER, DATE, which is the order a citation is read in and the
       order a reader scans: who wrote it, where it ran, when. Curator instruction
       2026-10-05, which also took the resource type OFF the byline; it is still in
       the expanded details under `Resource type`, where it is a fact to look up
       rather than one of three things competing in a subtitle.

       THE PUBLISHER IS DROPPED WHEN IT REPEATS THE AUTHOR, which is not a rare
       case: 55 of the 92 Epicenter records are bylined to the outlet itself, and
       `The Epicenter · The Epicenter · September 25, 2026` is worse than either
       half of it. The comparison is trimmed and case-insensitive because the two
       values come from different places, Notion prose and a hand-edited map.

       `publisher` may be null, which is a real answer rather than a gap to fill:
       a DOI whose registrant we cannot name says nothing instead of saying
       `doi.org`. The byline then reads author and date, as it did before. */
    var bits = bylineBits(rec);
    var byline = node.querySelector(".byline");
    bits.forEach(function (b, i) {
      if (i) byline.appendChild(el("span", "sep", "·"));
      byline.appendChild(highlight(b, tokens));
    });
    if (!bits.length) byline.hidden = true;

    var summary = node.querySelector(".summary");
    if (rec.summary) summary.appendChild(highlight(rec.summary, tokens));
    else summary.hidden = true;

    var chips = node.querySelector(".chips");
    (rec.themes || []).forEach(function (t) {
      var c = el("button", "pill pill-theme", t);
      c.type = "button";
      c.setAttribute("aria-pressed", state.selected.theme.has(t) ? "true" : "false");
      c.addEventListener("click", function () { toggle("theme", t); });
      chips.appendChild(c);
    });
    /* Geography on the card rather than only in the details, because where a record
       applies is part of deciding whether to open it. Filterable like a theme chip. */
    (rec.geographies || []).forEach(function (g) {
      var c = el("button", "pill pill-geo", g);
      c.type = "button";
      c.setAttribute("aria-pressed", state.selected.geo.has(g) ? "true" : "false");
      c.title = "Filter by " + g;
      c.addEventListener("click", function () { toggle("geo", g); });
      chips.appendChild(c);
    });

    var link = node.querySelector(".source-link");
    var actions = node.querySelector(".card-actions");

    if (target && spec.action) {
      link.href = target;
      link.textContent = spec.action;
      if (access === "dead") link.className = "btn-secondary source-link";
      var h = hostOf(target);
      if (h) link.title = "Opens " + h + " in a new tab";
    } else {
      link.remove();
    }

    if (access === "mirror" && rec.url) {
      var alt = el("a", "btn-secondary", "Publisher's page");
      alt.href = rec.url; alt.target = "_blank"; alt.rel = "noopener noreferrer";
      actions.insertBefore(alt, node.querySelector(".toggle-details"));
    }

    /* A direct PDF hands the reader a file rather than a page, and a browser set to
       save PDFs downloads it. This opens the same document in a reader on this site
       instead, where the browser renders it with its own download and print buttons.
       Offered ONLY where framing was measured as allowed, so it is never a blank
       frame, and only for a live source, since a paywall would frame a login wall. */
    if (!BUNDLE && (access === "source" || access === "mirror") && isPdfUrl(docUrl) && canEmbed(rec)) {
      var read = el("a", "btn-secondary", "Read in browser");
      read.href = "viewer.html?nnn=" + encodeURIComponent(rec.nnn)
                + (document.documentElement.getAttribute("data-ui") === "dark" ? "&ui=dark" : "");
      read.target = "_blank";
      read.rel = "noopener noreferrer";
      read.title = "Opens the PDF in a reader on this site, rather than downloading it";
      actions.insertBefore(read, node.querySelector(".toggle-details"));
    }

    /* Name the destination before the click. Whether a .pdf opens in the
       browser's viewer or downloads is the publisher's Content-Disposition
       header and then the reader's own browser setting, never this page.
       Measured 2026-09-16: no PDF source URL in this corpus sends `attachment`,
       so a reader on default settings gets the viewer. */
    if (target && spec.action) {
      var dest = el("span", "destination");
      var dh = hostOf(target);
      if (dh) dest.appendChild(el("span", "dest-host", dh));
      if (isPdfUrl(docUrl)) {
        var p = el("span", "dest-pdf", "PDF");
        p.title = "A PDF. It opens in your browser's PDF viewer, where you can download or "
                + "print it. A browser set to download PDFs will save it instead.";
        dest.appendChild(p);
      }
      if (dest.childNodes.length) actions.insertBefore(dest, node.querySelector(".toggle-details"));
    }

    var noLink = node.querySelector(".no-link");
    if (spec.note) { noLink.hidden = false; noLink.textContent = spec.note; } else { noLink.remove(); }

    var toggle = node.querySelector(".toggle-details");
    var box = node.querySelector(".details");
    var built = false;
    toggle.addEventListener("click", function () {
      var open = box.hidden;
      if (open && !built) { buildDetails(rec, box); built = true; }
      box.hidden = !open;
      node.classList.toggle("open", open);
      toggle.textContent = open ? "Hide details" : "Details";
    });
    if (state.open && String(state.open) === String(rec.nnn)) {
      buildDetails(rec, box); built = true;
      box.hidden = false; node.classList.add("open");
      toggle.textContent = "Hide details";
    }

    return node;
  }

  /* ── facets ──────────────────────────────────────────────────────────── */

  function toggle(param, value) {
    var sel = state.selected[param];
    var f = FACETS.filter(function (x) { return x.param === param; })[0];
    if (sel.has(value)) sel.delete(value);
    else { if (f && !f.multi) sel.clear(); sel.add(value); }
    state.shown = PAGE;
    go("browse");
  }

  /* The year control: two handles to drag, two boxes to type in, and a bar per year
     behind them. The bars are not decoration: over a fifteen-year span where 2025 holds
     166 records and 2014 holds one, a reader dragging blind cannot tell which end is
     worth moving. They are drawn from the same counts every other facet uses, so they
     respond to the other filters exactly as the pills do. */
  function renderYearRange(box, f) {
    var b = yearBounds();
    if (!b[0] || !b[1] || b[0] >= b[1]) return;
    var rows = facetCounts(f);
    var counts = {};
    rows.forEach(function (r) { counts[r.name] = r.count; });
    var peak = Math.max.apply(null, rows.map(function (r) { return r.count; }).concat([1]));
    var sp = yearSpan();

    var wrap = el("div", "year-range");

    var hist = el("div", "year-hist");
    for (var y = b[0]; y <= b[1]; y++) {
      var n = counts[String(y)] || 0;
      var bar = el("span", "year-bar" + (y >= sp[0] && y <= sp[1] ? " in" : ""));
      bar.style.height = Math.max(2, Math.round((n / peak) * 100)) + "%";
      bar.title = y + ": " + n + (n === 1 ? " record" : " records");
      hist.appendChild(bar);
    }
    wrap.appendChild(hist);

    var track = el("div", "year-track");
    var fill = el("span", "year-fill");
    track.appendChild(fill);
    function place() {
      var span = b[1] - b[0];
      var s2 = yearSpan();
      fill.style.left = ((s2[0] - b[0]) / span * 100) + "%";
      fill.style.right = ((b[1] - s2[1]) / span * 100) + "%";
    }

    function slider(which) {
      var i = document.createElement("input");
      i.type = "range";
      i.min = String(b[0]); i.max = String(b[1]); i.step = "1";
      i.value = String(which === "from" ? sp[0] : sp[1]);
      i.className = "yr yr-" + which;
      i.setAttribute("aria-label", which === "from" ? "Earliest year" : "Latest year");
      i.addEventListener("input", function () {
        var cur = yearSpan();
        var v = parseInt(i.value, 10);
        // The handles may meet but not cross, which is what keeps a drag from
        // silently inverting the span under the reader's finger.
        if (which === "from") setYear(Math.min(v, cur[1]), cur[1]);
        else setYear(cur[0], Math.max(v, cur[0]));
        redraw();
      });
      return i;
    }
    var from = slider("from"), to = slider("to");
    track.appendChild(from); track.appendChild(to);
    wrap.appendChild(track);

    var boxes = el("div", "year-boxes");
    function numbox(which) {
      var i = document.createElement("input");
      i.type = "number";
      i.min = String(b[0]); i.max = String(b[1]); i.step = "1";
      i.value = String(which === "from" ? yearSpan()[0] : yearSpan()[1]);
      i.className = "year-num";
      i.setAttribute("aria-label", which === "from" ? "Earliest year" : "Latest year");
      /* `change` rather than `input`: typing 2 on the way to 2019 would otherwise
         filter to the year 2 and empty the page mid-keystroke. */
      i.addEventListener("change", function () {
        var v = parseInt(i.value, 10);
        if (isNaN(v)) { redraw(); return; }
        var cur = yearSpan();
        if (which === "from") setYear(v, cur[1]); else setYear(cur[0], v);
        redraw();
      });
      return i;
    }
    boxes.appendChild(el("span", "year-cap", "From"));
    boxes.appendChild(numbox("from"));
    boxes.appendChild(el("span", "year-cap", "to"));
    boxes.appendChild(numbox("to"));
    var reset = el("button", "year-reset", "All years");
    reset.type = "button";
    reset.hidden = !yearActive();
    reset.addEventListener("click", function () {
      yearRange.from = yearRange.to = null;
      state.shown = PAGE;
      redraw();
    });
    boxes.appendChild(reset);
    wrap.appendChild(boxes);

    place();
    box.appendChild(wrap);

    function redraw() {
      writeUrl();
      if (state.view === "browse") renderResults();
      else { renderFacets($("facets-landing"), 4); return; }
      renderFacets($("facets-browse"), null);
    }
  }

  /* Geography is the one facet with a hierarchy: the United States opens into the
     states, everything else stays flat. The states are behind a toggle because 22 of
     the 30 values are states and a flat list buries Europe and Asia under Vermont. */
  function renderGeoFacet(box, f, limit, host) {
    var rows = facetCounts(f);
    var subs = rows.filter(function (r) { return US_SUB.has(r.name); });
    var tops = rows.filter(function (r) { return !US_SUB.has(r.name) && r.name !== "US"; });

    /* The count beside `US` is the union of the country tag and every state, because
       that is what clicking it returns. Taking the raw `US` row instead would show a
       number one lower than the list it produces. */
    var tokens = tokenize(state.q), usCount = 0;
    for (var i = 0; i < DATA.records.length; i++) {
      var rec = DATA.records[i];
      if (!passesExcept(rec, f.param)) continue;
      if (score(rec, tokens) < 0) continue;
      if ((rec.geographies || []).some(isUsPlace)) usCount++;
    }

    var pills = el("div", "pills");

    if (usCount) {
      var wrap = el("span", "geo-us");
      var usBtn = el("button", "pill pill-geo");
      usBtn.type = "button";
      usBtn.appendChild(el("b", null, "US"));
      usBtn.appendChild(el("span", "n", usCount));
      usBtn.setAttribute("aria-pressed", state.selected.geo.has("US") ? "true" : "false");
      usBtn.addEventListener("click", function () { toggle("geo", "US"); });
      wrap.appendChild(usBtn);

      if (subs.length) {
        /* Opened by itself whenever a state is selected, however the reader got there:
           a shared link, the back button, a chip they have not cleared. A group that is
           quietly cutting the result count while collapsed is the same failure as a
           collapsed filter panel, and the selected pill has to be visible to be undone. */
        var stateSelected = Array.prototype.some.call(
          Array.from(state.selected.geo), function (v) { return US_SUB.has(v); });
        var open = !!facetOpen["geo:us"] || stateSelected;
        var exp = el("button", "geo-toggle", open ? "Hide states" : subs.length + " states");
        exp.type = "button";
        exp.setAttribute("aria-expanded", open ? "true" : "false");
        /* The toggle only reveals; it never filters. A reader opening a group to look
           inside has not yet said what they want. */
        exp.addEventListener("click", function () {
          facetOpen["geo:us"] = !open;
          renderFacets(host, limit);
        });
        // Closing is refused while a state is selected, because the pill doing the
        // filtering would be the thing hidden.
        if (stateSelected) { exp.disabled = true; exp.title = "A state is selected"; }
        wrap.appendChild(exp);
      }
      pills.appendChild(wrap);
    }

    tops.forEach(function (r) {
      var b = el("button", "pill pill-geo");
      b.type = "button";
      b.appendChild(el("b", null, r.name));
      b.appendChild(el("span", "n", r.count));
      b.setAttribute("aria-pressed", state.selected.geo.has(r.name) ? "true" : "false");
      b.addEventListener("click", function () { toggle("geo", r.name); });
      pills.appendChild(b);
    });
    box.appendChild(pills);

    var anyStateSelected = Array.prototype.some.call(
      Array.from(state.selected.geo), function (v) { return US_SUB.has(v); });
    if (subs.length && (facetOpen["geo:us"] || anyStateSelected)) {
      var nest = el("div", "geo-states");
      nest.appendChild(el("p", "geo-states-label", "States and territories"));
      var sp = el("div", "pills");
      subs.forEach(function (r) {
        var b = el("button", "pill pill-geo");
        b.type = "button";
        b.appendChild(el("b", null, r.name));
        b.appendChild(el("span", "n", r.count));
        b.setAttribute("aria-pressed", state.selected.geo.has(r.name) ? "true" : "false");
        b.addEventListener("click", function () { toggle("geo", r.name); });
        sp.appendChild(b);
      });
      nest.appendChild(sp);
      box.appendChild(nest);
    }
  }

  function renderFacets(host, limit) {
    host.textContent = "";
    FACETS.forEach(function (f) {
      if (limit && f.landing === false) return;   // Overview grid only
      var rows = facetCounts(f);
      if (!rows.length) return;
      var box = el("div", "facet");
      box.appendChild(el("p", "facet-label", f.label));
      if (f.kind === "range") {
        renderYearRange(box, f);
        host.appendChild(box);
        return;
      }
      if (f.param === "geo") {
        renderGeoFacet(box, f, limit, host);
        host.appendChild(box);
        return;
      }
      var pills = el("div", "pills");
      var shown = (limit && !facetOpen[f.param]) ? rows.slice(0, limit) : rows;
      shown.forEach(function (r) {
        var b = el("button", "pill " + f.pill);
        b.type = "button";
        b.appendChild(el("b", null, facetLabel(f, r.name)));
        b.appendChild(el("span", "n", r.count));
        b.setAttribute("aria-pressed", state.selected[f.param].has(r.name) ? "true" : "false");
        b.addEventListener("click", function () { toggle(f.param, r.name); });
        pills.appendChild(b);
      });
      if (limit && rows.length > limit && !facetOpen[f.param]) {
        var more = el("button", "pill pill-more", "+ " + (rows.length - limit) + " more");
        more.type = "button";
        more.addEventListener("click", function () {
          facetOpen[f.param] = true;
          renderFacets(host, limit);
        });
        pills.appendChild(more);
      } else if (limit && facetOpen[f.param] && rows.length > limit) {
        var less = el("button", "pill pill-more", "Show fewer");
        less.type = "button";
        less.addEventListener("click", function () {
          facetOpen[f.param] = false;
          renderFacets(host, limit);
        });
        pills.appendChild(less);
      }
      box.appendChild(pills);
      host.appendChild(box);
    });
  }

  /* ── reporting a problem ────────────────────────────────────────────────
     A `mailto:` rather than a form. The site is static, has no backend and makes no
     third-party request on a page load; a hosted form would need an account, a secret
     in the deploy, and would route a reader's report through somebody else. This needs
     none of that, works in the offline bundle, and the reader can see exactly what they
     are sending before it goes.

     The context lines are the point. A report saying "the date is wrong" is unactionable
     without knowing which record and which snapshot, and a reader cannot be expected to
     know the payload date or that records carry a number. Everything needed to reproduce
     is filled in; the reader writes one sentence. It is kept short because mail clients
     truncate a long mailto body, and it is plain text the reader can edit or delete. */
  function reportParts(rec) {
    var cfg = (ED && ED.feedback) || null;
    if (!cfg || !cfg.email) return null;

    var when = DATA.generated_utc ? new Date(DATA.generated_utc) : null;
    var snapshot = (when && !isNaN(when))
      ? when.toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" })
      : (DATA.generated_utc || "unknown");

    var lines = [];
    lines.push("What is wrong:");
    lines.push("");
    lines.push("");
    lines.push("---- please keep the lines below ----");
    if (rec) {
      lines.push("Record: " + rec.nnn + ", " + rec.title);
      if (rec.url) lines.push("Source: " + rec.url);
    }
    lines.push("Snapshot: " + snapshot);
    lines.push("Page: " + location.href);
    if (navigator && navigator.userAgent) lines.push("Browser: " + navigator.userAgent);

    return {
      email: cfg.email,
      subject: rec ? "Repository record " + rec.nnn + ": " + String(rec.title).slice(0, 60)
                   : "Repository site: a problem to report",
      body: lines.join("\n"),
      intro: cfg.intro || ""
    };
  }

  /* The dialog rather than a bare mailto. A `mailto:` hands control to whatever the
     machine has registered, which may be an unexpected client, a webmail handler that
     mangles the body, or nothing at all. Showing the message as text first means the
     reader can always complete the report: read it, edit it, copy it, and mail it
     however they normally would. The mail button stays, as one route out of several. */
  function openReport(rec) {
    var parts = reportParts(rec);
    var dlg = $("report-dialog");
    if (!parts || !dlg) return;

    $("report-intro").textContent = parts.intro;
    $("report-to").value = parts.email;
    $("report-subject").value = parts.subject;
    $("report-body").value = parts.body;
    $("report-status").textContent = "";

    /* Built at click time from the textarea, so anything the reader typed travels with
       it. Building it once on open would silently send the empty template instead. */
    var mail = $("report-mail");
    mail.onclick = function () {
      mail.href = "mailto:" + parts.email
                + "?subject=" + encodeURIComponent($("report-subject").value)
                + "&body=" + encodeURIComponent($("report-body").value);
    };

    if (typeof dlg.showModal === "function") dlg.showModal();
    else dlg.setAttribute("open", "");

    /* Focus lands in the message, at the top, so typing starts where the reader is
       asked to write rather than inside the context block. */
    var ta = $("report-body");
    ta.focus();
    try { ta.setSelectionRange(15, 15); } catch (e) { /* older browsers */ }
  }

  function wireReportDialog() {
    var dlg = $("report-dialog");
    if (!dlg) return;

    $("report-close").addEventListener("click", function () {
      if (typeof dlg.close === "function") dlg.close(); else dlg.removeAttribute("open");
    });
    // Clicking the backdrop closes it, which is what the dark area outside a modal implies.
    dlg.addEventListener("click", function (e) {
      if (e.target === dlg) { if (dlg.close) dlg.close(); else dlg.removeAttribute("open"); }
    });

    $("report-copy").addEventListener("click", function () {
      var ta = $("report-body");
      var status = $("report-status");
      var text = $("report-to").value + "\n" + $("report-subject").value + "\n\n" + ta.value;
      function ok() { status.textContent = "Copied. Paste it into an email to " + $("report-to").value; }

      /* Three routes, narrowing. The Clipboard API is the good one but needs a secure
         context and permission, and is refused outright in some embedded browsers and
         from file://, which is exactly where the offline bundle runs. execCommand is
         deprecated and still works in most places a real click reaches it. Selecting
         the text is the one that cannot fail: the reader presses copy themselves. */
      function legacy() {
        var scratch = document.createElement("textarea");
        scratch.value = text;
        scratch.setAttribute("readonly", "");
        scratch.style.position = "fixed";
        scratch.style.top = "-1000px";
        document.body.appendChild(scratch);
        scratch.select();
        var done = false;
        try { done = document.execCommand("copy"); } catch (e) { done = false; }
        document.body.removeChild(scratch);
        if (done) { ok(); return true; }
        return false;
      }
      function manual() {
        if (legacy()) return;
        ta.focus(); ta.select();
        status.textContent = "Select all and copy. Send it to " + $("report-to").value;
      }
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text).then(ok, manual);
      } else { manual(); }
    });
  }

  /* ── thumbnails ──────────────────────────────────────────────────────────
     DRAWN, NOT FETCHED. A thumbnail of the document itself would be a picture of
     someone else's copyrighted page, and standing rule 4 keeps anything taken from
     a source document out of what this site publishes. A publisher's own og:image
     would store nothing, but measured 2026-09-17 only a third of the pages that
     answered declare one, 46 records are direct PDFs that cannot, and the images
     that do exist are mostly stock photography and site-wide branding rather than
     the document. It would also make one page load fetch from hundreds of third
     parties, which this site currently never does, and it would leave the offline
     bundle with broken images.

     So the tile is generated from what the record already carries: its kind, its
     year, and a colour for the kind. Nothing is fetched, nothing is stored, it
     works offline, it costs the bundle nothing, and it tells a reader something
     true rather than showing them a stock photograph. Every record has a type and
     a year, so a tile is never empty. */

  var TYPE_HUE = {
    "Report": "green", "Initiative / Finance Model": "green", "Tool / Resource Hub": "green",
    "Academic Paper": "blue", "Conference Paper": "blue", "Policy Brief": "blue",
    "News Article / Blog Post": "gold", "Podcast": "gold",
    "Case Study / Deal Profile": "red", "Regulatory / Legislative Document": "red", "Book": "red"
  };
  var TYPE_SHORT = {
    "Report": "Report", "News Article / Blog Post": "News", "Academic Paper": "Paper",
    "Case Study / Deal Profile": "Case", "Podcast": "Podcast",
    "Initiative / Finance Model": "Model", "Policy Brief": "Policy",
    "Regulatory / Legislative Document": "Regulation", "Book": "Book",
    "Conference Paper": "Conference", "Tool / Resource Hub": "Tool"
  };

  function drawTile(rec, t, small) {
    var type = rec.resource_type || "";
    t.appendChild(el("span", "t-type", small ? (TYPE_SHORT[type] || type) : (type || "Record")));
    t.appendChild(el("span", "t-year", rec.year ? String(rec.year) : ""));
  }

  function thumbFor(rec, small) {
    var type = rec.resource_type || "";
    var hue = TYPE_HUE[type] || "green";
    var t = el("span", "thumb hue-" + hue + (small ? " thumb-sm" : " thumb-lg"));
    t.setAttribute("aria-hidden", "true");

    var entry = THUMBS && THUMBS.records ? THUMBS.records[String(rec.nnn)] : null;
    if (entry && entry.file) {
      /* The image can be absent even when the manifest lists it, because the renders
         are gitignored and reach a host through the deploy rather than a commit. So
         a failed load is a normal state, not an error: the tile is drawn instead,
         and a site published without thumbs/ simply looks like it did before. */
      var img = document.createElement("img");
      img.src = entry.file;
      img.alt = "";
      img.loading = "lazy";
      img.decoding = "async";
      img.addEventListener("error", function () {
        img.remove();
        t.classList.remove("thumb-img");
        drawTile(rec, t, small);
      });
      t.classList.add("thumb-img");
      t.appendChild(img);
      return t;
    }

    drawTile(rec, t, small);
    return t;
  }

  /* ── the intro, curator prose over computed numbers ──────────────────── */

  /* Numbers are never stored in editorial.json, they are written as {tokens} and
     filled here from the payload, so the copy cannot go stale against the corpus
     the way a sentence with a number typed into it would. An unknown token is left
     on the page exactly as written, so a typo is visible rather than silently
     swallowed. */
  function fillTokens(text) {
    if (!text) return "";
    var c = DATA.counts || {};
    var total = c.records || DATA.records.length;
    var yearMax = c.year_max || 0;
    var from = yearMax ? yearMax - 2 : 0;
    var recent = DATA.records.filter(function (r) { return r.year && r.year >= from; }).length;
    var map = {
      records: total,
      yearMin: c.year_min || "",
      yearMax: yearMax || "",
      themes: (DATA.facets.theme || []).length,
      sourceTypes: (DATA.facets.resource_type || []).length,
      organizations: (DATA.facets.institution || []).length,
      recentFrom: from,
      recentShare: total ? Math.round(recent * 100 / total) + " per cent" : ""
    };
    return String(text).replace(/\{(\w+)\}/g, function (whole, key) {
      return Object.prototype.hasOwnProperty.call(map, key) ? String(map[key]) : whole;
    });
  }

  function renderIntro() {
    var intro = (ED && ED.intro) || null;
    if (!intro) { $("about").hidden = true; return; }

    $("intro-lede").textContent = fillTokens(intro.lede);

    var beta = $("beta-note");
    if (intro.beta) { beta.hidden = false; beta.textContent = fillTokens(intro.beta); }
    else { beta.hidden = true; }

    var host = $("about-blocks");
    host.textContent = "";
    (intro.blocks || []).forEach(function (b) {
      var d = el("div", "about-block");
      d.appendChild(el("h3", null, fillTokens(b.heading)));
      d.appendChild(el("p", null, fillTokens(b.body)));
      host.appendChild(d);
    });

    var crit = intro.criteria;
    if (crit && (crit.items || []).length) {
      $("criteria").hidden = false;
      $("criteria-heading").textContent = fillTokens(crit.heading);
      $("criteria-lede").textContent = fillTokens(crit.lede);
      var list = $("criteria-list");
      list.textContent = "";
      crit.items.forEach(function (it) {
        var li = el("li");
        li.appendChild(el("span", "criteria-term", fillTokens(it.term)));
        li.appendChild(el("span", "criteria-gloss", fillTokens(it.gloss)));
        list.appendChild(li);
      });
    } else {
      $("criteria").hidden = true;
    }

    if (intro.updates && intro.updates.body) {
      $("updates").hidden = false;
      $("updates-heading").textContent = fillTokens(intro.updates.heading);
      $("updates-body").textContent = fillTokens(intro.updates.body);
    } else {
      $("updates").hidden = true;
    }

    $("about").hidden = !(intro.blocks || []).length && !crit && !intro.updates;
  }

  /* ── landing sections ────────────────────────────────────────────────── */

  function byNnn(nnn) {
    for (var i = 0; i < DATA.records.length; i++) {
      if (String(DATA.records[i].nnn) === String(nnn)) return DATA.records[i];
    }
    return null;
  }

  function openRecord(nnn) {
    state.q = ""; $("q").value = "";
    FACETS.forEach(function (f) { state.selected[f.param].clear(); });
    state.open = String(nnn);
    scrollToOpen = true;
    go("browse");
  }

  function feedRow(rec, metaText) {
    var b = el("button", "feed-item");
    b.type = "button";
    b.appendChild(el("p", "feed-title", rec.title));
    b.appendChild(el("p", "feed-meta", metaText));
    b.addEventListener("click", function () { openRecord(rec.nnn); });
    return b;
  }

  function renderFeeds() {
    var newest = DATA.records.slice().filter(function (r) { return r.date || r.year; });
    newest.sort(function (a, b) {
      return String(b.date || b.year + "-00-00").localeCompare(String(a.date || a.year + "-00-00"));
    });
    var host = $("feed-new");
    host.textContent = "";
    newest.slice(0, 8).forEach(function (r) {
      var item = el("button", "gallery-item");
      item.type = "button";
      item.appendChild(thumbFor(r, false));
      item.appendChild(el("span", "gallery-title", r.title));
      // WHO A RECORD IS BY IS `authors`, AND THERE IS ONE RULE FOR IT.
      // This tile read `institutions[0]` until 2026-10-05, which is the first entry of
      // `Organization(s)`: every organization NAMED IN THE CONTENT, in no meaningful
      // order. CLAUDE.md says in as many words that the field does not answer who
      // published a record, and the numbers agree. Measured over the 670 published
      // records that day, it disagreed with `authors` on 424 and matched on 78, and
      // six of the eight tiles then on the landing page named the wrong party: an
      // Epicenter newsletter was bylined `NOAA Climate Prediction Center` because the
      // article's first paragraph cites a NOAA forecast. The card in Browse all had
      // been right the whole time, so the two surfaces disagreed about the same record.
      // A record with no `authors` now shows its date alone, which is what the card
      // does. That is 166 of 670, and a bare tile is better than a confident wrong name.
      item.appendChild(el("span", "gallery-meta", bylineBits(r).join(" · ")));
      item.addEventListener("click", function () { openRecord(r.nnn); });
      host.appendChild(item);
    });
  }

  function renderStats() {
    var c = DATA.counts || {};
    var cases = DATA.records.filter(function (r) { return r.resource_type === "Case Study / Deal Profile"; }).length;
    var rows = [
      ["Records", c.records || DATA.records.length],
      ["Published", (c.year_min || "") + " to " + (c.year_max || "")],
      ["Finance themes", (DATA.facets.theme || []).length],
      ["Case studies and deals", cases]
    ];
    var host = $("stats");
    host.textContent = "";
    rows.forEach(function (r) {
      var d = el("div", "stat");
      d.appendChild(el("p", "stat-label", r[0]));
      d.appendChild(el("p", "stat-value", String(r[1])));
      host.appendChild(d);
    });
  }

  /* ── results ─────────────────────────────────────────────────────────── */

  function renderActive() {
    var host = $("active-filters");
    host.textContent = "";
    var any = false;
    if (yearActive()) {
      any = true;
      var ysp = yearSpan();
      var yb = el("button", "pill pill-year");
      yb.type = "button";
      yb.setAttribute("aria-pressed", "true");
      yb.appendChild(el("b", null, ysp[0] === ysp[1] ? String(ysp[0]) : ysp[0] + " to " + ysp[1]));
      yb.title = "Remove this filter";
      yb.addEventListener("click", function () {
        yearRange.from = yearRange.to = null;
        state.shown = PAGE;
        go("browse");
      });
      host.appendChild(yb);
    }
    FACETS.forEach(function (f) {
      if (f.kind === "range") return;
      state.selected[f.param].forEach(function (v) {
        any = true;
        var b = el("button", "pill " + f.pill);
        b.type = "button";
        b.setAttribute("aria-pressed", "true");
        b.appendChild(el("b", null, facetLabel(f, v)));
        b.title = "Remove this filter";
        b.addEventListener("click", function () { toggle(f.param, v); });
        host.appendChild(b);
      });
    });
    if (any) {
      var clear = el("button", "pill", "Clear all");
      clear.type = "button";
      clear.addEventListener("click", function () {
        FACETS.forEach(function (f) { state.selected[f.param].clear(); });
      yearRange.from = yearRange.to = null;
        yearRange.from = yearRange.to = null;
        go("browse");
      });
      host.appendChild(clear);
    }
    host.hidden = !any;
  }

  function renderResults() {
    var tokens = tokenize(state.q);
    var rows = current();

    $("count").textContent = "";
    var b = el("b", null, String(rows.length));
    $("count").appendChild(b);
    $("count").appendChild(document.createTextNode(
      rows.length === DATA.records.length ? " records in the repository"
                                          : " records of " + DATA.records.length));

    var host = $("results");
    host.textContent = "";
    rows.slice(0, state.shown).forEach(function (r) { host.appendChild(card(r, tokens)); });

    var more = $("more");
    if (rows.length > state.shown) {
      more.hidden = false;
      more.textContent = "Show " + Math.min(PAGE, rows.length - state.shown) + " more";
      more.onclick = function () { state.shown += PAGE; renderResults(); };
    } else {
      more.hidden = true;
    }

    $("empty").hidden = rows.length !== 0;
    renderActive();
    renderFacets($("facets-browse"), null);
    /* Opened whenever a filter is active: a collapsed panel that is quietly cutting
       the result count is a worse trade than a tall page. Left alone otherwise, so
       a reader who opens it to browse keeps it open. */
    var filters = $("filters-browse");
    if (filters && (yearActive() || FACETS.some(function (f) { return state.selected[f.param].size; }))) filters.open = true;
  }

  /* ── view switching ──────────────────────────────────────────────────── */

  var scrollToOpen = false;

  function go(view) {
    if (view) state.view = view;
    var browse = state.view === "browse";
    $("view-start").hidden = browse;
    $("view-browse").hidden = !browse;
    $("tab-start").setAttribute("aria-selected", browse ? "false" : "true");
    $("tab-browse").setAttribute("aria-selected", browse ? "true" : "false");
    $("sort").value = state.sort;
    /* The stats sit in the masthead, which is visible under BOTH tabs, so they
       are rendered on every pass rather than inside the landing branch. They
       describe the whole corpus and do not respond to filters. */
    renderStats();
    if (browse) renderResults();
    else { renderIntro(); renderFeeds(); renderFacets($("facets-landing"), 4); }
    writeUrl();

    /* `state.open` USED TO BE CLEARED HERE, which is why an expanded record was not
       in the URL and could not be shared or returned to. It now persists, so the
       one-shot "scroll to it" intent needs a flag of its own: go() runs again on a
       sort change and on a height post, and re-scrolling the reader then would yank
       the page out from under them. */
    if (browse && state.open && scrollToOpen) {
      var target = document.querySelector('[data-nnn="' + String(state.open).replace(/"/g, "") + '"]');
      if (target) target.scrollIntoView({ block: "start" });
    } else if (!state.open) {
      window.scrollTo({ top: 0 });
    }
    scrollToOpen = false;
    postHeight();
  }

  /* ── back to top ─────────────────────────────────────────────────────────
     Appears once there is enough behind the reader to be worth returning from.
     The jump is instant rather than smooth when the reader has asked for reduced
     motion, which a long list makes more than a nicety. */

  function wireToTop() {
    var btn = $("to-top");
    if (!btn) return;
    var reduced = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    function sync() { btn.hidden = window.scrollY < 600; }
    window.addEventListener("scroll", sync, { passive: true });
    window.addEventListener("resize", sync, { passive: true });
    btn.addEventListener("click", function () {
      window.scrollTo({ top: 0, behavior: reduced ? "auto" : "smooth" });
      /* Focus moves to the first tab so a keyboard reader carries on from the top
         rather than from a control that has just scrolled out of sight. */
      var first = $("tab-start");
      if (first) first.focus({ preventScroll: true });
    });
    sync();
  }

  /* ── embedding ───────────────────────────────────────────────────────── */

  function postHeight() {
    if (window.parent === window) return;
    try {
      window.parent.postMessage({
        source: "resilience-finance-repository",
        height: document.documentElement.scrollHeight
      }, "*");
    } catch (e) { /* a parent on another origin that refuses the message is fine */ }
  }

  /* ── boot ────────────────────────────────────────────────────────────── */

  function wire() {
    var q = $("q");
    var timer = null;
    q.addEventListener("input", function () {
      clearTimeout(timer);
      timer = setTimeout(function () {
        state.q = q.value.trim();
        state.shown = PAGE;
        if (state.q && state.sort === "newest") state.sort = "relevance";
        $("clear").hidden = !state.q;
        go("browse");
      }, 140);
    });
    $("clear").addEventListener("click", function () {
      q.value = ""; state.q = ""; $("clear").hidden = true;
      state.sort = "newest"; go("browse");
    });
    $("sort").addEventListener("change", function () {
      state.sort = $("sort").value; renderResults(); writeUrl();
    });
    function runSearch() {
      state.q = q.value.trim();
      state.shown = PAGE;
      if (state.q && state.sort === "newest") state.sort = "relevance";
      $("clear").hidden = !state.q;
      go("browse");
    }
    q.addEventListener("keydown", function (e) { if (e.key === "Enter") { clearTimeout(timer); runSearch(); } });
    $("search-go").addEventListener("click", function () { clearTimeout(timer); runSearch(); });
    /* The example chips are the explorer's "Try:" row. They fill the box rather than
       searching behind the reader's back, so the query is visible and editable. */
    Array.prototype.forEach.call(document.querySelectorAll(".try-row [data-try]"), function (b) {
      b.addEventListener("click", function () {
        q.value = b.getAttribute("data-try");
        runSearch();
      });
    });
    $("tab-start").addEventListener("click", function () { go("start"); });
    $("tab-browse").addEventListener("click", function () { go("browse"); });
    $("open-db").addEventListener("click", function () {
      FACETS.forEach(function (f) { state.selected[f.param].clear(); });
      yearRange.from = yearRange.to = null;
      state.q = ""; q.value = "";
      go("browse");
    });
    $("view-all-new").addEventListener("click", function () {
      FACETS.forEach(function (f) { state.selected[f.param].clear(); });
      yearRange.from = yearRange.to = null;
      state.q = ""; q.value = ""; state.sort = "newest";
      go("browse");
    });
    $("clear-all").addEventListener("click", function () {
      FACETS.forEach(function (f) { state.selected[f.param].clear(); });
      yearRange.from = yearRange.to = null;
      state.q = ""; q.value = "";
      go("browse");
    });
    window.addEventListener("resize", postHeight);
    wireToTop();
    wireReportDialog();
  }

  function stamp() {
    var when = DATA.generated_utc ? new Date(DATA.generated_utc) : null;
    var c = DATA.counts || {};
    var s = (c.records || DATA.records.length) + " records";
    if (when && !isNaN(when)) {
      s += ", last updated " + when.toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" });
    }
    /* `origin` says whether the payload was read from the live collection or from a
       saved copy. A reader needs that distinction, because a snapshot predates any
       edit made since, but NOT the name of the tool it came out of: which database
       the Lab keeps its records in is our plumbing, not a fact about the collection
       (curator ruling, 2026-09-29). `notion_live` and `notion_snapshot` are still
       accepted so an older payload keeps rendering. */
    var o = DATA.origin || {};
    var stale = (o.kind === "snapshot" || o.kind === "notion_snapshot");
    var host = $("stamp");
    host.textContent = "";
    host.appendChild(el("div", null, (c.records || DATA.records.length) + " records"
      + (stale ? " · from a saved copy" : "")));
    if (when && !isNaN(when)) {
      host.appendChild(el("div", null, when.toLocaleDateString(undefined,
        { year: "numeric", month: "short", day: "numeric" })));
    }
    void s;
    var fr = $("foot-report");
    if (fr && reportParts(null)) {
      var fcfg = (ED && ED.feedback) || {};
      fr.textContent = "";
      var fbtn = el("button", "report-link", fcfg.page_label || "Report a problem");
      fbtn.type = "button";
      fbtn.addEventListener("click", function () { openReport(null); });
      fr.appendChild(fbtn);
    }
    $("foot-stamp").textContent =
      "This page is a snapshot of the canonical database, not a live view. A record promoted after "
      + "the export ran is not here until scripts/export_repository_site.py runs again."
      + (o.recorded_basis ? " Counts in the payload were " + o.recorded_basis + "." : "");
    $("open-db-n").textContent = String(c.records || DATA.records.length);
  }

  function fail(msg) {
    var box = $("load-error");
    box.hidden = false;
    box.textContent = msg;
  }

  function load() {
    if (BUNDLE) {
      /* A bundle carries its thumbnails inline, re-encoded small: the 400px renders
         are 10.6 MB, which base64 would push past every mail limit, so the builder
         shrinks them to 200px WebP data URIs. Shaped here like the manifest the
         hosted page fetches, so nothing downstream has to know the difference. */
      var inlined = null;
      if (BUNDLE.thumbs) {
        inlined = { records: {} };
        Object.keys(BUNDLE.thumbs).forEach(function (nnn) {
          inlined.records[nnn] = { file: BUNDLE.thumbs[nnn] };
        });
      }
      return Promise.resolve([BUNDLE.repository, BUNDLE.editorial || null, BUNDLE.pdf_embed || null, inlined]);
    }
    /* `cache: "no-cache"` REVALIDATES rather than skipping the cache: the browser
       still sends a conditional request and still takes a 304, so an unchanged
       payload costs nothing, but a re-exported one is never served stale. Without
       it these files are cached heuristically, with no Cache-Control to bound it,
       and a reader who visited before an export keeps the old corpus with no way
       to know. Seen on 2026-09-17: the page rendered 352 records against a payload
       on disk holding 391, and a hard reload did not shift it. */
    var opts = { cache: "no-cache" };
    return Promise.all([
      fetch("data/repository.json", opts).then(function (r) {
        if (!r.ok) throw new Error("repository.json returned " + r.status);
        return r.json();
      }),
      fetch("data/editorial.json", opts).then(function (r) { return r.ok ? r.json() : null; })
        .catch(function () { return null; }),
      fetch("data/pdf_embed.json", opts).then(function (r) { return r.ok ? r.json() : null; })
        .catch(function () { return null; }),
      fetch("data/thumbnails.json", opts).then(function (r) { return r.ok ? r.json() : null; })
        .catch(function () { return null; })
    ]);
  }

  /* The back and forward buttons. The browser has already moved the URL by the time
     this runs, so the render must not write to history: suppressHistory says so. */
  window.addEventListener("popstate", function () {
    if (!DATA) return;
    suppressHistory = true;
    try {
      readUrl();
      $("q").value = state.q;
      $("clear").hidden = !state.q;
      /* The facet checkboxes need no separate sync: go() calls renderResults, which
         rebuilds facets-browse from state, and the landing branch rebuilds
         facets-landing. The sort select is set by go() too. */
      scrollToOpen = !!state.open;
      go(state.view);
    } finally {
      suppressHistory = false;
    }
  });

  load().then(function (both) {
    DATA = both[0];
    ED = both[1];
    EMBED = both[2];
    THUMBS = both[3];
    if (!ED) console.warn("data/editorial.json did not load. The curator sections are hidden and the rest of the page is unaffected.");
    if (!EMBED && !BUNDLE) console.warn("data/pdf_embed.json did not load. No Read in browser button is offered, which is the safe direction: the button is only ever shown where framing was measured as allowed.");
    readUrl();
    $("q").value = state.q;
    $("clear").hidden = !state.q;
    wire();
    stamp();
    scrollToOpen = !!state.open;
    go(state.view);
    firstRender = false;
  }).catch(function (e) {
    fail("The repository data could not be loaded (" + e.message + "). This page fetches "
       + "data/repository.json over HTTP, so it has to be served rather than opened from the file "
       + "system: python3 -m http.server 8765 --directory site");
  });

})();
