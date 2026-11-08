// Ant Politics: the whole website logic, no build step.
// All user text is shown with textContent (never innerHTML), so posts cannot inject code.
// Your Supabase keys live in config.js, not here.

(function () {
  "use strict";

  var CFG = window.ANT_CONFIG || {};
  var AV = window.AntAvatar;

  var SCOUT_AT = 100;
  var SOLDIER_AT = 1000;
  var PAGE = 12;
  var LEVELS = ["Worker", "Scout", "Soldier"];

  var view = document.getElementById("view");
  var railIn = document.getElementById("rail-in");
  var acct = document.getElementById("acct");
  var toastBox = document.getElementById("toast");
  var searchForm = document.getElementById("searchform");
  var searchBox = document.getElementById("searchbox");

  var sb = null;
  var me = null;          // { id, handle, rank, avatar, level, followers, trails }
  var chambers = [];
  var renderId = 0;
  var io = null;
  var toastTimer = null;

  // ---------- tiny helpers ----------

  function el(tag, props, kids) {
    var node = document.createElement(tag);
    var p = props || {};
    Object.keys(p).forEach(function (k) {
      var v = p[k];
      if (v === null || v === undefined || v === false) return;
      if (k === "class") node.className = v;
      else if (k === "text") node.textContent = v;
      else if (k.slice(0, 2) === "on") node.addEventListener(k.slice(2), v);
      else node.setAttribute(k, v === true ? "" : String(v));
    });
    (kids || []).forEach(function (c) {
      if (c === null || c === undefined || c === false) return;
      node.appendChild(typeof c === "string" ? document.createTextNode(c) : c);
    });
    return node;
  }

  function clear(node) {
    while (node.firstChild) node.removeChild(node.firstChild);
  }

  function say(message, bad) {
    toastBox.textContent = message;
    toastBox.className = bad ? "toast bad" : "toast";
    toastBox.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { toastBox.hidden = true; }, 4500);
  }

  function failMessage(error) {
    return (error && error.message) ? error.message : "Something went wrong. Please try again.";
  }

  function timeAgo(value) {
    var s = Math.max(0, Math.floor((Date.now() - new Date(value).getTime()) / 1000));
    if (s < 45) return "just now";
    if (s < 3600) return Math.max(1, Math.round(s / 60)) + "m ago";
    if (s < 86400) return Math.round(s / 3600) + "h ago";
    if (s < 86400 * 7) return Math.round(s / 86400) + "d ago";
    return String(value).slice(0, 10);
  }

  function hostOf(url) {
    try { return new URL(url).hostname.replace(/^www\./, ""); } catch (e) { return url; }
  }

  function isHttpUrl(value) {
    try {
      var u = new URL(value);
      return u.protocol === "http:" || u.protocol === "https:";
    } catch (e) {
      return false;
    }
  }

  var store = {
    get: function (k) { try { return window.localStorage.getItem(k); } catch (e) { return null; } },
    set: function (k, v) { try { window.localStorage.setItem(k, v); } catch (e) { /* private mode */ } }
  };

  // Static icon drawings (our own fixed strings, never user text).
  var ICONS = {
    home: '<path d="M3 11 L12 3 L21 11"/><path d="M5 10 V21 H19 V10"/><path d="M10 21 V14 H14 V21"/>',
    fresh: '<circle cx="12" cy="12" r="9"/><path d="M12 7 V12 L16 14"/>',
    following: '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20 C2.5 15.5 6 14 9 14 C12 14 15.5 15.5 15.5 20"/><path d="M17 5 C19.5 5.5 20.5 8 19 10"/><path d="M18.5 14.5 C21 15.5 21.5 18 21.5 20"/>',
    sourced: '<path d="M12 3 L20 6 V12 C20 16.5 16.5 20 12 21 C7.5 20 4 16.5 4 12 V6 Z"/><path d="M8.5 12 L11 14.5 L15.5 9.5"/>',
    rooms: '<rect x="3" y="4" width="7" height="7" rx="2"/><rect x="14" y="4" width="7" height="7" rx="2"/><rect x="3" y="14" width="7" height="7" rx="2"/><rect x="14" y="14" width="7" height="7" rx="2"/>',
    elections: '<path d="M5 9 H19 L17 20 H7 Z"/><path d="M9 9 L12 3 L15 9"/><path d="M9 14 H15"/>',
    arena: '<path d="M4 14 V10 L16 5 V19 Z"/><path d="M7 15 L8.5 20 H11 L10 16"/><path d="M19 9 C20.5 10.5 20.5 13.5 19 15"/>',
    rumors: '<circle cx="10" cy="10" r="6"/><path d="M15 15 L21 21"/>',
    adda: '<path d="M4 5 H20 V16 H11 L6 20 V16 H4 Z"/>',
    me: '<circle cx="12" cy="8" r="4"/><path d="M4 21 C4 16 8 14 12 14 C16 14 20 16 20 21"/>',
    plus: '<path d="M12 5 V19 M5 12 H19"/>',
    comment: '<path d="M4 5 H20 V16 H11 L6 20 V16 H4 Z"/>'
  };

  function icon(name, size) {
    var holder = document.createElement("span");
    holder.innerHTML = '<svg width="' + size + '" height="' + size + '" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">' + ICONS[name] + "</svg>";
    return holder.firstChild;
  }

  function antIcon(size) {
    var holder = document.createElement("span");
    holder.innerHTML = '<svg width="' + size + '" height="' + size + '" aria-hidden="true" focusable="false"><use href="#ant"/></svg>';
    return holder.firstChild;
  }

  function loader(text) {
    return el("div", { class: "loader" }, [
      el("div", { class: "row" }, [antIcon(28), antIcon(28), antIcon(28)]),
      el("span", { text: text || "Digging more trails..." })
    ]);
  }

  function avatarFor(person, size) {
    return AV.make(person.avatar, person.handle, size, person.level || 0);
  }

  function avatarLink(person, size) {
    return el("a", { class: "avlink", href: "#/ant/" + encodeURIComponent(person.handle), "aria-label": person.handle }, [avatarFor(person, size)]);
  }

  function levelTag(level) {
    var l = level === 1 || level === 2 ? level : 0;
    return el("span", { class: "tag lv" + l, text: LEVELS[l] });
  }

  function sourceBadge(url) {
    if (url && isHttpUrl(url)) {
      return el("a", { class: "badge ok", href: url, target: "_blank", rel: "noopener noreferrer nofollow", title: url, text: "Sourced: " + hostOf(url) });
    }
    return el("span", { class: "badge", text: "Needs source" });
  }

  function escLike(text) {
    return text.replace(/[\\%_]/g, "\\$&");
  }

  // ---------- account ----------

  async function loadMe() {
    var s = await sb.auth.getSession();
    var session = s.data && s.data.session;
    if (!session) { me = null; return; }
    var r = await sb.from("ant_profiles").select("*").eq("id", session.user.id).maybeSingle();
    if (r.data) { me = r.data; return; }
    var made = await sb.rpc("create_ant");
    if (made.error) { me = null; return; }
    r = await sb.from("ant_profiles").select("*").eq("id", session.user.id).maybeSingle();
    me = r.data || null;
  }

  async function joinColony() {
    var signed = await sb.auth.signInAnonymously();
    if (signed.error) throw signed.error;
    var made = await sb.rpc("create_ant");
    if (made.error) throw made.error;
    await loadMe();
    if (!me) throw new Error("Could not create your ant. Please try again.");
  }

  async function loadChambers() {
    var r = await sb.from("chambers").select("id, slug, name, name_bn, kind").order("id");
    chambers = r.data || [];
  }

  function chamberBySlug(slug) {
    for (var i = 0; i < chambers.length; i++) if (chambers[i].slug === slug) return chambers[i];
    return null;
  }

  // ---------- top bar and icon menu ----------

  function renderTop() {
    clear(acct);
    if (me) {
      acct.appendChild(el("a", { class: "acct-me", href: "#/ant/" + encodeURIComponent(me.handle), title: "My profile" }, [
        avatarFor(me, 38),
        el("span", { class: "acct-name", text: me.handle })
      ]));
    } else {
      acct.appendChild(el("a", { class: "btn btn-red btn-sm", href: "#/join", text: "Join the colony" }));
    }
  }

  function renderRail(active) {
    clear(railIn);
    function item(key, label, href, ic, extra) {
      var cls = (key === active ? "on " : "") + (extra || "");
      railIn.appendChild(el("a", { class: cls.trim(), href: href, "aria-current": key === active ? "page" : false }, [
        icon(ic, 26), el("span", { text: label })
      ]));
    }
    function rule() { railIn.appendChild(el("hr")); }
    item("home", "Home", "#/", "home");
    item("new", "New", "#/new", "fresh");
    item("post", "Post", "#/post", "plus", "new");
    item("following", "Following", "#/following", "following", "hide-m");
    item("sourced", "Sourced", "#/sourced", "sourced", "hide-m");
    item("rooms", "Rooms", "#/rooms", "rooms");
    rule();
    item("elections", "Vote", "#/soon/elections", "elections", "hide-m");
    item("arena", "Arena", "#/soon/arena", "arena", "hide-m");
    item("rumors", "Rumors", "#/soon/rumors", "rumors", "hide-m");
    item("adda", "Adda", "#/soon/adda", "adda", "hide-m");
    rule();
    if (me) item("me", "Me", "#/ant/" + encodeURIComponent(me.handle), "me");
    else item("me", "Join", "#/join", "me");
  }

  // ---------- layout pieces ----------

  function cols(nodes, withSide) {
    var left = el("div", { class: "colmain" }, nodes);
    var kids = [left];
    if (withSide !== false) kids.push(sidebar());
    return el("div", { class: "cols" }, kids);
  }

  function narrow(nodes) {
    return el("div", { class: "narrow" }, nodes);
  }

  function activeSlug() {
    var p = parts();
    return p[0] === "chamber" ? p[1] : null;
  }

  function sidebar() {
    var box = el("aside", { class: "side", "aria-label": "Sidebar" });

    if (me) {
      var target = me.level >= 2 ? null : (me.level === 1 ? SOLDIER_AT : SCOUT_AT);
      var pct = target ? Math.min(100, Math.round((me.followers / target) * 100)) : 100;
      var goal = !target ? "You are a Soldier. Protect the colony."
        : (target - me.followers > 0 ? (target - me.followers) + " more followers to become a " + (me.level === 1 ? "Soldier candidate." : "Scout.") : "Ready for the next rank.");
      box.appendChild(el("section", { class: "card" }, [
        el("h2", { text: "My anthill" }),
        el("div", { class: "me-row" }, [
          avatarLink(me, 52),
          el("div", {}, [
            el("a", { class: "t-handle", href: "#/ant/" + encodeURIComponent(me.handle), text: me.handle }),
            el("div", {}, [levelTag(me.level)])
          ])
        ]),
        el("div", { class: "prog", role: "img", "aria-label": me.followers + " followers" + (target ? " of " + target : "") }, [
          el("div", { class: "prog-fill", style: "width:" + pct + "%" }),
          el("div", { class: "prog-ant", style: "left:calc(" + pct + "% - 20px)" }, [antIcon(34)])
        ]),
        el("p", { class: "muted", style: "font-size:15px", text: me.followers + (target ? " / " + target : "") + " followers. " + goal })
      ]));
    } else {
      box.appendChild(el("section", { class: "card" }, [
        el("h2", { text: "Join the colony" }),
        el("p", { style: "font-size:16px", text: "No email, no phone, no NID. One press and you are a random ant." }),
        el("a", { class: "btn btn-red btn-sm", href: "#/join", text: "Become an ant" })
      ]));
    }

    var cur = activeSlug();
    var list = el("section", { class: "card" }, [el("h2", { text: "Chambers" })]);
    chambers.forEach(function (c) {
      list.appendChild(el("a", { class: "crow" + (c.slug === cur ? " on" : ""), href: "#/chamber/" + c.slug }, [
        el("span", { text: c.name }),
        el("span", { class: "bn", text: c.name_bn || "" })
      ]));
    });
    box.appendChild(list);

    box.appendChild(el("section", { class: "card" }, [
      el("h2", { text: "House rules" }),
      el("ol", { class: "rules" }, [
        el("li", { text: "Attack ideas, not ants." }),
        el("li", { text: "No real names, photos or doxxing." }),
        el("li", { text: "Add a source when you can. It earns the green badge." }),
        el("li", { text: "Parody, not impersonation." })
      ])
    ]));
    return box;
  }

  function chips() {
    var cur = activeSlug();
    var row = el("div", { class: "chips", "aria-label": "Chambers" });
    row.appendChild(el("a", { href: "#/", class: !cur && (parts()[0] || "") === "" ? "on" : "", text: "All" }));
    chambers.forEach(function (c) {
      row.appendChild(el("a", { href: "#/chamber/" + c.slug, class: c.slug === cur ? "on" : "", text: c.name }));
    });
    return row;
  }

  function feedTabs(active) {
    var tabs = [["hot", "Hot", "#/"], ["new", "New", "#/new"], ["following", "Following", "#/following"], ["sourced", "Sourced", "#/sourced"]];
    return el("div", { class: "tabs", role: "navigation", "aria-label": "Feed" }, tabs.map(function (t) {
      return el("a", { href: t[2], class: t[0] === active ? "on" : "", "aria-current": t[0] === active ? "page" : false, text: t[1] });
    }));
  }

  function needJoin(text) {
    return el("div", { class: "empty" }, [
      el("p", { text: text }),
      el("a", { class: "btn btn-red btn-sm", href: "#/join", text: "Join the colony" })
    ]);
  }

  function notFound(text) {
    return narrow([el("div", { class: "empty" }, [
      el("h1", { class: "d", text: "Lost in the tunnels" }),
      el("p", { text: text || "That page does not exist." }),
      el("a", { class: "btn btn-yel btn-sm", href: "#/", text: "Back to the surface" })
    ])]);
  }

  // ---------- follow button ----------

  function followButton(antId, startFollowing, onChange) {
    var on = !!startFollowing;
    var busy = false;
    var b = el("button", { type: "button", class: "follow" });
    function paint() {
      b.textContent = on ? "Following" : "Follow";
      b.setAttribute("aria-pressed", on ? "true" : "false");
    }
    paint();
    b.addEventListener("click", async function () {
      if (!me) { say("Join the colony first, then you can follow ants.", true); return; }
      if (busy) return;
      busy = true;
      var res = on
        ? await sb.from("follows").delete().eq("follower_id", me.id).eq("followee_id", antId)
        : await sb.from("follows").insert({ follower_id: me.id, followee_id: antId });
      busy = false;
      if (res.error) { say(failMessage(res.error), true); return; }
      on = !on;
      paint();
      if (onChange) onChange(on);
    });
    return b;
  }

  // ---------- trail card ----------

  function trailCard(t, opts) {
    opts = opts || {};
    var counts = { agree: t.agree || 0, disagree: t.disagree || 0, convince: t.convince || 0 };
    var mine = t.my_vote || null;
    var busy = false;
    var person = { handle: t.handle, avatar: t.avatar, level: t.level };

    var meter = el("div", { class: "meter", role: "img" });
    var segAgree = el("span", { style: "background:#15803d" });
    var segDis = el("span", { style: "background:#dc2626" });
    var segCon = el("span", { style: "background:#fde047" });
    meter.appendChild(segAgree); meter.appendChild(segDis); meter.appendChild(segCon);

    var buttons = {};
    var votes = el("div", { class: "votes" });
    [["agree", "Agree"], ["disagree", "Disagree"], ["convince", "Convince me"]].forEach(function (k) {
      var n = el("span", { class: "n" });
      var b = el("button", { type: "button", class: "vote " + k[0], onclick: function () { cast(k[0]); } }, [el("span", { text: k[1] }), n]);
      buttons[k[0]] = { b: b, n: n };
      votes.appendChild(b);
    });

    function paint() {
      var total = counts.agree + counts.disagree + counts.convince;
      segAgree.style.flex = total ? String(counts.agree) : "0";
      segDis.style.flex = total ? String(counts.disagree) : "0";
      segCon.style.flex = total ? String(counts.convince) : "0";
      meter.setAttribute("aria-label", "Agree " + counts.agree + ", Disagree " + counts.disagree + ", Convince me " + counts.convince);
      Object.keys(buttons).forEach(function (k) {
        buttons[k].n.textContent = String(counts[k]);
        buttons[k].b.setAttribute("aria-pressed", mine === k ? "true" : "false");
      });
    }

    async function cast(kind) {
      if (!me) { say("Join the colony first, then you can vote.", true); return; }
      if (busy) return;
      busy = true;
      var prev = mine;
      if (prev) counts[prev]--;
      if (prev === kind) mine = null; else { mine = kind; counts[kind]++; }
      paint();
      var res = mine
        ? await sb.from("votes").upsert({ trail_id: t.id, ant_id: me.id, kind: mine }, { onConflict: "trail_id,ant_id" })
        : await sb.from("votes").delete().eq("trail_id", t.id).eq("ant_id", me.id);
      busy = false;
      if (res.error) {
        if (mine) counts[mine]--;
        if (prev) counts[prev]++;
        mine = prev;
        paint();
        say(failMessage(res.error), true);
      }
    }

    var chamber = el("a", { href: "#/chamber/" + t.chamber_slug, text: t.chamber_name });
    var timeLink = el("a", { href: "#/trail/" + t.id, text: timeAgo(t.created_at), title: String(t.created_at).slice(0, 16).replace("T", " ") + " UTC" });

    var line = [
      el("a", { class: "t-handle", href: "#/ant/" + encodeURIComponent(t.handle), text: t.handle }),
      levelTag(t.level)
    ];
    if (me && me.id !== t.ant_id) line.push(followButton(t.ant_id, t.i_follow_author));

    var head = el("div", { class: "t-head" }, [
      el("div", { class: "t-id" }, [
        avatarLink(person, 46),
        el("div", { class: "t-who" }, [
          el("div", { class: "t-line" }, line),
          el("span", { class: "t-in" }, ["in ", chamber, " · ", timeLink])
        ])
      ]),
      sourceBadge(t.source_url)
    ]);

    var foot = el("div", { class: "t-foot" }, [
      el("a", { class: "vote cm", href: "#/trail/" + t.id }, [icon("comment", 18), el("span", { text: opts.full ? "Comments" : "Comments" }), el("span", { class: "n", text: String(t.comment_count || 0) })])
    ]);
    if (me && me.id === t.ant_id) {
      foot.appendChild(el("button", {
        type: "button", class: "del", text: "Delete",
        onclick: async function () {
          if (!window.confirm("Delete this trail and its comments?")) return;
          var res = await sb.from("trails").delete().eq("id", t.id);
          if (res.error) { say(failMessage(res.error), true); return; }
          say("Trail deleted.");
          if (opts.onDeleted) opts.onDeleted(); else if (card.parentNode) card.parentNode.removeChild(card);
        }
      }));
    }

    var card = el("article", { class: "card" + (opts.hot ? " hot" : "") }, [
      opts.hot ? el("span", { class: "tape", text: "Hot trail" }) : null,
      head,
      el("p", { class: "t-body", text: t.body }),
      meter,
      votes,
      foot
    ]);
    paint();
    return card;
  }

  // ---------- infinite feed ----------

  function stopFeed() {
    if (io) { io.disconnect(); io = null; }
  }

  // fetchPage(from, to) must return a Supabase query result with trail rows.
  function feedList(fetchPage, emptyNode, hotFirst) {
    var myRender = renderId;
    var box = el("div", { class: "feed" });
    var foot = el("div", { class: "feed-foot" });
    var wrap = el("div", { class: "colmain" }, [box, foot]);
    var from = 0, done = false, busy = false, seen = {}, shown = 0;
    var supportsIO = "IntersectionObserver" in window;

    function showLoader() { clear(foot); foot.appendChild(loader()); }

    function showMoreButton() {
      clear(foot);
      if (supportsIO) { foot.appendChild(el("span", { text: " " })); return; }
      foot.appendChild(el("button", { type: "button", class: "btn btn-yel btn-sm", text: "Load more", onclick: more }));
    }

    async function more() {
      if (busy || done || myRender !== renderId) return;
      busy = true;
      showLoader();
      var r;
      try { r = await fetchPage(from, from + PAGE - 1); } catch (e) { r = { error: e }; }
      if (myRender !== renderId) return;
      busy = false;
      if (r.error) {
        clear(foot);
        foot.appendChild(el("p", { text: failMessage(r.error) }));
        foot.appendChild(el("button", { type: "button", class: "btn btn-yel btn-sm", text: "Try again", onclick: more }));
        return;
      }
      var rows = r.data || [];
      from += rows.length;
      rows.forEach(function (t) {
        if (seen[t.id]) return;
        seen[t.id] = true;
        box.appendChild(trailCard(t, { hot: hotFirst && shown === 0 && (t.hot_score || 0) > 0.5 }));
        shown++;
      });
      if (rows.length < PAGE) {
        done = true;
        clear(foot);
        if (!shown) {
          foot.appendChild(emptyNode || el("div", { class: "empty" }, [el("p", { text: "No trails here yet." })]));
        } else {
          foot.appendChild(el("span", { text: "You reached the bottom of the anthill." }));
        }
        if (io) { io.disconnect(); io = null; }
        return;
      }
      showMoreButton();
      if (io) { io.unobserve(foot); io.observe(foot); }
    }

    if (supportsIO) {
      io = new IntersectionObserver(function (entries) {
        if (entries.some(function (e) { return e.isIntersecting; })) more();
      }, { rootMargin: "700px 0px" });
      io.observe(foot);
    }
    more();
    return wrap;
  }

  function trailQuery() {
    return sb.from("trail_feed").select("*");
  }

  // ---------- pages: feeds ----------

  function homePage(kind) {
    var emptyNode = null;
    var fetchPage;
    if (kind === "following") {
      if (!me) return cols([feedTabs(kind), chips(), needJoin("Join the colony to follow ants and see their trails here.")]);
      emptyNode = el("div", { class: "empty" }, [el("p", { text: "You are not following anyone yet. Tap Follow on a trail you like." }), el("a", { class: "btn btn-yel btn-sm", href: "#/", text: "Browse hot trails" })]);
      fetchPage = function (a, b) { return trailQuery().eq("i_follow_author", true).order("created_at", { ascending: false }).order("id", { ascending: false }).range(a, b); };
    } else if (kind === "sourced") {
      fetchPage = function (a, b) { return trailQuery().not("source_url", "is", null).order("created_at", { ascending: false }).order("id", { ascending: false }).range(a, b); };
    } else if (kind === "new") {
      fetchPage = function (a, b) { return trailQuery().order("created_at", { ascending: false }).order("id", { ascending: false }).range(a, b); };
    } else {
      emptyNode = el("div", { class: "empty" }, [el("p", { text: "The colony is quiet. Be the first ant to leave a trail." }), el("a", { class: "btn btn-red btn-sm", href: "#/post", text: "Leave a trail" })]);
      fetchPage = function (a, b) { return trailQuery().order("hot_score", { ascending: false }).order("id", { ascending: false }).range(a, b); };
    }
    document.title = "Ant Politics";
    return cols([feedTabs(kind === "following" || kind === "sourced" || kind === "new" ? kind : "hot"), chips(), feedList(fetchPage, emptyNode, kind === "hot")]);
  }

  function chamberPage(slug, sort) {
    var c = chamberBySlug(slug);
    if (!c) return notFound("That chamber does not exist.");
    document.title = c.name + " · Ant Politics";
    var isNew = sort === "new";
    var fetchPage = function (a, b) {
      var q = trailQuery().eq("chamber_slug", slug);
      q = isNew ? q.order("created_at", { ascending: false }) : q.order("hot_score", { ascending: false });
      return q.order("id", { ascending: false }).range(a, b);
    };
    var head = el("div", { style: "display:flex;flex-direction:column;gap:2px" }, [
      el("span", { class: "depth", text: c.kind === "national" ? "the main hall" : "division chamber" }),
      el("h1", { class: "meme", style: "font-size:clamp(36px,8vw,56px);line-height:1", text: c.name }),
      el("span", { class: "bn", style: "font-weight:700;font-size:20px;color:#fff", text: c.name_bn || "" })
    ]);
    var tabs = el("div", { class: "tabs" }, [
      el("a", { href: "#/chamber/" + slug, class: isNew ? "" : "on", text: "Hot" }),
      el("a", { href: "#/chamber/" + slug + "/new", class: isNew ? "on" : "", text: "New" }),
      el("a", { class: "", href: "#/post?chamber=" + slug, text: "Post here" })
    ]);
    var empty = el("div", { class: "empty" }, [el("p", { text: "No trails in " + c.name + " yet." }), el("a", { class: "btn btn-red btn-sm", href: "#/post?chamber=" + slug, text: "Leave the first trail" })]);
    return cols([head, tabs, chips(), feedList(fetchPage, empty, !isNew)]);
  }

  async function searchPage(q) {
    q = (q || "").trim().slice(0, 60);
    document.title = "Search · Ant Politics";
    if (!q) return cols([el("h1", { class: "meme", style: "font-size:40px", text: "Search" }), el("div", { class: "empty" }, [el("p", { text: "Type something in the box at the top." })])]);
    var like = "%" + escLike(q) + "%";
    var ants = await sb.from("ant_profiles").select("handle, avatar, level, followers").ilike("handle", like).order("followers", { ascending: false }).limit(6);
    var antRow = el("div", { style: "display:flex;flex-wrap:wrap;gap:10px" });
    (ants.data || []).forEach(function (a) {
      antRow.appendChild(el("a", { class: "feature", href: "#/ant/" + encodeURIComponent(a.handle) }, [avatarFor(a, 40), el("span", { text: a.handle })]));
    });
    var fetchPage = function (a, b) { return trailQuery().ilike("body", like).order("created_at", { ascending: false }).order("id", { ascending: false }).range(a, b); };
    var empty = el("div", { class: "empty" }, [el("p", { text: "No trails match that. Maybe nobody has said it yet." })]);
    return cols([
      el("h1", { class: "meme", style: "font-size:clamp(30px,7vw,44px)", text: "Search: " + q }),
      (ants.data && ants.data.length) ? el("div", { class: "colmain" }, [el("span", { class: "label on-soil", text: "Ants" }), antRow]) : null,
      el("span", { class: "label on-soil", text: "Trails" }),
      feedList(fetchPage, empty, false)
    ]);
  }

  // ---------- pages: trail with comments ----------

  function commentForm(cfg) {
    // cfg: { placeholder, button, onSend(body, source) -> error|null, onCancel }
    var box = el("textarea", { class: "input", maxlength: "500", rows: cfg.compact ? "2" : "3", placeholder: cfg.placeholder, "aria-label": cfg.placeholder });
    var src = el("input", { class: "input", type: "url", maxlength: "500", placeholder: "https://source-link (optional)", "aria-label": "Source link", style: "font-size:16px" });
    var srcWrap = el("div", { class: "field", hidden: true }, [src]);
    var count = el("span", { class: "count", text: "0 / 500" });
    var send = el("button", { type: "submit", class: "btn btn-red btn-sm", text: cfg.button || "Send" });
    var toggle = el("button", { type: "button", class: "linkbtn", text: "Add a source", onclick: function () { srcWrap.hidden = !srcWrap.hidden; toggle.textContent = srcWrap.hidden ? "Add a source" : "Hide source"; } });
    box.addEventListener("input", function () { count.textContent = box.value.length + " / 500"; });
    var extra = [];
    if (cfg.onCancel) extra.push(el("button", { type: "button", class: "linkbtn", text: "Cancel", onclick: cfg.onCancel }));
    var form = el("form", { class: "reply-form" }, [
      box, srcWrap,
      el("div", { class: "form-row" }, [el("div", { style: "display:flex;gap:14px;align-items:center;flex-wrap:wrap" }, [toggle, count]), el("div", { style: "display:flex;gap:12px;align-items:center" }, extra.concat([send]))])
    ]);
    form.addEventListener("submit", async function (e) {
      e.preventDefault();
      var text = box.value.trim();
      var link = src.value.trim();
      if (!text) { say("Write something first.", true); return; }
      if (link && !isHttpUrl(link)) { say("The source must start with http:// or https://", true); return; }
      send.disabled = true;
      var err = await cfg.onSend(text, link || null);
      send.disabled = false;
      if (err) { say(failMessage(err), true); return; }
      box.value = ""; src.value = ""; count.textContent = "0 / 500";
    });
    return form;
  }

  function buildThread(trailId, headingCount) {
    var wrap = el("section", { class: "card", "aria-label": "Comments" });
    var title = el("h2", { class: "d", style: "font-size:26px", text: "Comments" });
    var list = el("div", { class: "thread" });
    var sort = "best";
    var comments = [];
    var token = 0;

    var sortBtns = {};
    var sorts = el("div", { class: "sorts", role: "group", "aria-label": "Sort comments" });
    [["best", "Best"], ["new", "New"], ["sourced", "Sourced first"]].forEach(function (s) {
      var b = el("button", { type: "button", text: s[1], onclick: function () { sort = s[0]; paintSorts(); draw(); } });
      sortBtns[s[0]] = b;
      sorts.appendChild(b);
    });
    function paintSorts() {
      Object.keys(sortBtns).forEach(function (k) { sortBtns[k].setAttribute("aria-pressed", k === sort ? "true" : "false"); });
    }

    function compare(a, b) {
      if (sort === "new") return new Date(b.created_at) - new Date(a.created_at);
      if (sort === "sourced") {
        var sa = a.source_url ? 1 : 0, sb2 = b.source_url ? 1 : 0;
        if (sa !== sb2) return sb2 - sa;
      }
      if (b.agree !== a.agree) return b.agree - a.agree;
      return new Date(a.created_at) - new Date(b.created_at);
    }

    function commentNode(c, depth, kids) {
      var holder = el("div", { class: "cthread" });
      var person = { handle: c.handle, avatar: c.avatar, level: c.level };
      var counts = c.agree || 0, iAgree = !!c.i_agree, busy = false;
      var agreeBtn = el("button", { type: "button", class: "c-btn" });
      function paintAgree() {
        agreeBtn.textContent = "Agree " + counts;
        agreeBtn.setAttribute("aria-pressed", iAgree ? "true" : "false");
      }
      paintAgree();
      agreeBtn.addEventListener("click", async function () {
        if (!me) { say("Join the colony first, then you can agree.", true); return; }
        if (busy) return;
        busy = true;
        var was = iAgree;
        iAgree = !was; counts += was ? -1 : 1; paintAgree();
        var res = was
          ? await sb.from("comment_agrees").delete().eq("comment_id", c.id).eq("ant_id", me.id)
          : await sb.from("comment_agrees").insert({ comment_id: c.id, ant_id: me.id });
        busy = false;
        if (res.error) { iAgree = was; counts += was ? 1 : -1; paintAgree(); say(failMessage(res.error), true); }
      });

      var body = el("div", { class: "c-body" }, [
        el("div", { class: "c-head" }, [
          el("a", { class: "t-handle", style: "font-size:17px", href: "#/ant/" + encodeURIComponent(c.handle), text: c.handle }),
          levelTag(c.level),
          el("span", { class: "t-in", text: timeAgo(c.created_at) }),
          c.source_url ? sourceBadge(c.source_url) : null
        ]),
        el("p", { class: "c-text", text: c.body })
      ]);

      var actions = el("div", { class: "c-actions" }, [agreeBtn]);
      var replyHolder = el("div");
      actions.appendChild(el("button", {
        type: "button", class: "c-btn", text: "Reply",
        onclick: function () {
          if (!me) { say("Join the colony first, then you can reply.", true); return; }
          if (replyHolder.firstChild) { clear(replyHolder); return; }
          var parentId = depth >= 2 ? c.parent_id : c.id;
          replyHolder.appendChild(commentForm({
            compact: true, placeholder: "Reply to " + c.handle, button: "Reply",
            onCancel: function () { clear(replyHolder); },
            onSend: function (text, link) { return postComment(text, link, parentId); }
          }));
          var ta = replyHolder.querySelector("textarea");
          if (ta) ta.focus();
        }
      }));
      if (me && me.id === c.ant_id) {
        actions.appendChild(el("button", {
          type: "button", class: "del", text: "Delete",
          onclick: async function () {
            if (!window.confirm("Delete this comment and its replies?")) return;
            var res = await sb.from("comments").delete().eq("id", c.id);
            if (res.error) { say(failMessage(res.error), true); return; }
            load();
          }
        }));
      }
      body.appendChild(actions);
      body.appendChild(replyHolder);

      holder.appendChild(el("div", { class: "comment" }, [avatarLink(person, 38), body]));
      if (kids[c.id] && kids[c.id].length) {
        var sub = el("div", { class: "replies" });
        kids[c.id].slice().sort(function (a, b) {
          return sort === "new" ? new Date(a.created_at) - new Date(b.created_at) : compare(a, b);
        }).forEach(function (k) { sub.appendChild(commentNode(k, depth + 1, kids)); });
        holder.appendChild(sub);
      }
      return holder;
    }

    function draw() {
      clear(list);
      title.textContent = comments.length === 1 ? "1 comment" : comments.length + " comments";
      if (headingCount) headingCount(comments.length);
      if (!comments.length) {
        list.appendChild(el("p", { class: "muted", text: "No comments yet. Start the argument politely." }));
        return;
      }
      var kids = {};
      var ids = {};
      comments.forEach(function (c) { ids[c.id] = true; });
      comments.forEach(function (c) {
        var key = (c.parent_id && ids[c.parent_id]) ? c.parent_id : "root";
        (kids[key] = kids[key] || []).push(c);
      });
      (kids.root || []).slice().sort(compare).forEach(function (c) { list.appendChild(commentNode(c, 0, kids)); });
    }

    async function load() {
      var mine = ++token;
      var r = await sb.from("comment_feed").select("*").eq("trail_id", trailId).order("created_at", { ascending: true }).limit(500);
      if (mine !== token) return;
      if (r.error) { clear(list); list.appendChild(el("p", { text: failMessage(r.error) })); return; }
      comments = r.data || [];
      draw();
    }

    async function postComment(text, link, parentId) {
      var res = await sb.from("comments").insert({ trail_id: trailId, parent_id: parentId || null, ant_id: me.id, body: text, source_url: link });
      if (res.error) return res.error;
      say("Comment added.");
      await load();
      return null;
    }

    wrap.appendChild(title);
    if (me) {
      wrap.appendChild(commentForm({ placeholder: "Add to the trail. Be sharp, be kind.", button: "Comment", onSend: function (t, l) { return postComment(t, l, null); } }));
    } else {
      wrap.appendChild(needJoin("Join the colony to comment."));
    }
    wrap.appendChild(sorts);
    wrap.appendChild(list);
    paintSorts();
    list.appendChild(loader("Loading comments..."));
    load();
    return wrap;
  }

  async function trailPage(id) {
    if (!/^\d+$/.test(id)) return notFound("That trail does not exist.");
    var r = await sb.from("trail_feed").select("*").eq("id", id).maybeSingle();
    if (!r.data) return notFound("That trail was washed away.");
    var t = r.data;
    document.title = t.handle + " · Ant Politics";
    var card = trailCard(t, { full: true, onDeleted: function () { location.hash = "#/"; } });
    return cols([
      el("a", { class: "badge", href: "#/chamber/" + t.chamber_slug, text: "< Back to " + t.chamber_name }),
      card,
      buildThread(Number(id))
    ]);
  }

  // ---------- pages: post ----------

  function queryParam(name) {
    var h = location.hash.split("?")[1] || "";
    var found = null;
    h.split("&").forEach(function (pair) {
      var kv = pair.split("=");
      if (kv[0] === name) found = decodeURIComponent(kv[1] || "");
    });
    return found;
  }

  function postPage() {
    document.title = "New trail · Ant Politics";
    if (!me) return narrow([el("h1", { class: "meme", style: "font-size:44px", text: "Leave a trail" }), needJoin("Join the colony first. It takes one press.")]);
    var pick = queryParam("chamber") || store.get("ap_chamber") || "national";
    var select = el("select", { class: "input", id: "pc" });
    chambers.forEach(function (c) {
      var o = el("option", { value: String(c.id), text: c.name + (c.name_bn ? " · " + c.name_bn : "") });
      if (c.slug === pick) o.selected = true;
      select.appendChild(o);
    });
    var body = el("textarea", { class: "input", id: "pb", maxlength: "500", rows: "5", placeholder: "What is your take? One idea per trail." });
    var count = el("span", { class: "count", text: "0 / 500" });
    var src = el("input", { class: "input", id: "ps", type: "url", maxlength: "500", placeholder: "https://... (optional, earns the green Sourced badge)" });
    var go = el("button", { type: "submit", class: "btn btn-red", text: "Drop the trail" });
    body.addEventListener("input", function () { count.textContent = body.value.length + " / 500"; });
    var form = el("form", { class: "card" }, [
      el("div", { class: "field" }, [el("label", { for: "pc", text: "Chamber" }), select]),
      el("div", { class: "field" }, [el("label", { for: "pb", text: "Your trail" }), body, el("div", { class: "form-row" }, [count])]),
      el("div", { class: "field" }, [el("label", { for: "ps", text: "Source link" }), src]),
      el("div", { class: "form-row" }, [el("span", { class: "muted", style: "font-size:15px", text: "Do not post real names, photos or private details." }), go])
    ]);
    form.addEventListener("submit", async function (e) {
      e.preventDefault();
      var text = body.value.trim();
      var link = src.value.trim();
      if (!text) { say("Write something first.", true); return; }
      if (link && !isHttpUrl(link)) { say("The source must start with http:// or https://", true); return; }
      go.disabled = true;
      var r = await sb.from("trails").insert({ ant_id: me.id, chamber_id: Number(select.value), body: text, source_url: link || null }).select("id").single();
      go.disabled = false;
      if (r.error) { say(failMessage(r.error), true); return; }
      var chosen = chambers.filter(function (c) { return String(c.id) === select.value; })[0];
      if (chosen) store.set("ap_chamber", chosen.slug);
      say("Trail dropped.");
      location.hash = "#/trail/" + r.data.id;
    });
    return narrow([el("h1", { class: "meme", style: "font-size:clamp(34px,8vw,52px)", text: "Leave a trail" }), form]);
  }

  // ---------- pages: profile and avatar studio ----------

  async function antPage(handleRaw) {
    var handle = decodeURIComponent(handleRaw || "").replace(/[^A-Za-z0-9-]/g, "");
    if (!handle) return notFound("That ant does not exist.");
    var r = await sb.from("ant_profiles").select("*").ilike("handle", handle).maybeSingle();
    if (!r.data) return notFound("No ant with that name lives here.");
    var a = r.data;
    var mineProfile = me && me.id === a.id;
    document.title = a.handle + " · Ant Politics";

    var followersTile = el("b", { text: String(a.followers) });
    var target = a.level >= 2 ? null : (a.level === 1 ? SOLDIER_AT : SCOUT_AT);
    var pct = target ? Math.min(100, Math.round((a.followers / target) * 100)) : 100;

    var actions = el("div", { style: "display:flex;flex-wrap:wrap;gap:10px;align-items:center" });
    if (mineProfile) {
      actions.appendChild(el("a", { class: "btn btn-yel btn-sm", href: "#/avatar", text: "Edit my ant" }));
      actions.appendChild(el("a", { class: "btn btn-sm", href: "#/leave", text: "Leave" }));
    } else {
      actions.appendChild(followButton(a.id, a.i_follow, function (on) {
        a.followers += on ? 1 : -1;
        followersTile.textContent = String(a.followers);
      }));
    }

    var header = el("section", { class: "card" }, [
      el("div", { class: "profile-top" }, [
        avatarFor(a, 120),
        el("div", { style: "display:flex;flex-direction:column;gap:8px;min-width:0" }, [
          el("h1", { class: "d", style: "font-size:clamp(28px,6vw,40px);line-height:1", text: a.handle }),
          el("div", {}, [levelTag(a.level)]),
          el("p", { class: "muted", style: "font-size:16px", text: "In the colony since " + String(a.created_at).slice(0, 10) }),
          actions
        ])
      ]),
      el("div", { class: "stats" }, [
        el("div", { class: "tile" }, [followersTile, el("span", { text: "Followers" })]),
        el("div", { class: "tile" }, [el("b", { text: String(a.trails) }), el("span", { text: "Trails" })])
      ]),
      target ? el("div", {}, [
        el("div", { class: "prog", role: "img", "aria-label": a.followers + " of " + target + " followers" }, [
          el("div", { class: "prog-fill", style: "width:" + pct + "%" }),
          el("div", { class: "prog-ant", style: "left:calc(" + pct + "% - 20px)" }, [antIcon(34)])
        ]),
        el("p", { class: "muted", style: "font-size:15px;margin-top:6px", text: a.followers + " / " + target + " followers" + (a.level === 1 ? " to reach Soldier candidacy (colony vote coming soon)." : " to become a Scout.") })
      ]) : null
    ]);

    var fetchPage = function (x, y) { return trailQuery().eq("ant_id", a.id).order("created_at", { ascending: false }).order("id", { ascending: false }).range(x, y); };
    var empty = el("div", { class: "empty" }, [el("p", { text: mineProfile ? "You have not left a trail yet." : "No trails from this ant yet." })]);
    return cols([header, el("span", { class: "label on-soil", text: "Trails" }), feedList(fetchPage, empty, false)]);
  }

  function avatarPage() {
    document.title = "My ant · Ant Politics";
    if (!me) return narrow([el("h1", { class: "meme", style: "font-size:44px", text: "My ant" }), needJoin("Join the colony to design your ant.")]);

    var draft = AV.normalize(me.avatar, me.handle);
    var current = AV.CATS[0].key;
    var previewBox = el("div");
    var panel = el("div", { class: "card" });
    var catbar = el("div", { class: "catbar", role: "group", "aria-label": "Parts" });
    var catBtns = {};

    function drawPreview() {
      clear(previewBox);
      var big = AV.make(draft, me.handle, 220, me.level);
      big.setAttribute("role", "img");
      big.setAttribute("aria-hidden", "false");
      big.setAttribute("aria-label", "Preview of your ant");
      previewBox.appendChild(big);
    }

    function drawPanel() {
      clear(panel);
      var cat = AV.findCat(current);
      Object.keys(catBtns).forEach(function (k) { catBtns[k].setAttribute("aria-pressed", k === current ? "true" : "false"); });
      panel.appendChild(el("h2", { class: "d", style: "font-size:24px", text: cat.label }));
      var grid = el("div", { class: "optgrid" });
      cat.opts.forEach(function (o) {
        var locked = o[2] > me.level;
        var kids = [];
        if (cat.swatch) kids.push(el("span", { class: "dot", style: "background:" + cat.swatch[o[0]] }));
        kids.push(el("span", { text: o[1] }));
        if (locked) kids.push(el("span", { class: "lock", text: AV.TIERS[o[2]] + " only" }));
        var b = el("button", {
          type: "button", class: "opt", disabled: locked,
          "aria-pressed": draft[cat.key] === o[0] ? "true" : "false",
          onclick: function () {
            draft[cat.key] = o[0];
            if (cat.key === "body") delete draft.bodyHex;
            if (cat.key === "bg") delete draft.bgHex;
            drawPreview(); drawPanel();
          }
        }, kids);
        grid.appendChild(b);
      });
      panel.appendChild(grid);

      if (cat.key === "body" || cat.key === "bg") {
        var hexKey = cat.key === "body" ? "bodyHex" : "bgHex";
        var picker = el("input", { type: "color", value: draft[hexKey] || (cat.key === "body" ? AV.BODY[draft.body] : AV.BG[draft.bg]), "aria-label": "Custom " + cat.label + " colour" });
        picker.addEventListener("input", function () { draft[hexKey] = picker.value.toLowerCase(); drawPreview(); });
        panel.appendChild(el("div", { class: "colorrow" }, [
          el("span", { class: "label", text: "Custom colour" }), picker,
          draft[hexKey] ? el("button", { type: "button", class: "linkbtn", text: "Use the preset", onclick: function () { delete draft[hexKey]; drawPreview(); drawPanel(); } }) : null
        ]));
      }
      if (me.level < 2) {
        panel.appendChild(el("p", { class: "muted", style: "font-size:15px", text: "Locked parts open as you rank up: Scout at 100 followers, Soldier after a colony vote." }));
      }
    }

    AV.CATS.forEach(function (c) {
      var b = el("button", { type: "button", text: c.label, onclick: function () { current = c.key; drawPanel(); } });
      catBtns[c.key] = b;
      catbar.appendChild(b);
    });

    var save = el("button", { type: "button", class: "btn btn-red btn-sm", text: "Save my ant" });
    save.addEventListener("click", async function () {
      save.disabled = true;
      var r = await sb.from("ants").update({ avatar: draft }).eq("id", me.id).select("id").maybeSingle();
      save.disabled = false;
      if (r.error) { say(failMessage(r.error), true); return; }
      if (!r.data) { say("Could not save. Please reload and try again.", true); return; }
      me.avatar = JSON.parse(JSON.stringify(draft));
      renderTop();
      say("Your ant is saved.");
    });

    var side = el("div", { class: "preview" }, [
      previewBox,
      el("div", { class: "t-line", style: "justify-content:center" }, [el("span", { class: "t-handle", style: "color:#fff", text: me.handle }), levelTag(me.level)]),
      el("div", { style: "display:flex;flex-wrap:wrap;gap:8px;justify-content:center" }, [
        el("button", { type: "button", class: "btn btn-yel btn-sm", text: "Surprise me", onclick: function () { draft = AV.randomize(me.level); drawPreview(); drawPanel(); } }),
        el("button", { type: "button", class: "btn btn-sm", text: "Reset", onclick: function () { draft = AV.normalize({}, me.handle); drawPreview(); drawPanel(); } })
      ]),
      save
    ]);

    drawPreview();
    drawPanel();
    return narrow([
      el("h1", { class: "meme", style: "font-size:clamp(34px,8vw,52px)", text: "My ant" }),
      el("div", { class: "studio" }, [side, el("div", { style: "display:flex;flex-direction:column;gap:14px;min-width:0" }, [catbar, panel])]),
      el("a", { class: "badge", href: "#/ant/" + encodeURIComponent(me.handle), text: "< Back to my profile" })
    ]);
  }

  // ---------- pages: rooms, soon, join, leave ----------

  var SOON = {
    elections: ["Soldier Elections", "Scouts who reach 1,000 followers can stand for Soldier. Every ant in the chamber gets one vote, and the colony decides. No campaign ads, only trails."],
    arena: ["Debate Arena", "Two ants, one topic, one clock. The colony judges with Agree and Convince me. The winner gets a banner on their profile."],
    rumors: ["Rumor Hunt", "Post a rumor, send the colony to hunt for sources, and see it end as True, False or Still unclear."],
    adda: ["Adda Rooms", "Live chat rooms for each chamber. Tea not included."]
  };

  function soonPage(name) {
    var info = SOON[name];
    if (!info) return notFound("That room has not been dug yet.");
    document.title = info[0] + " · Ant Politics";
    return narrow([
      el("div", { class: "card soon" }, [
        el("span", { class: "tape", text: "Coming soon" }),
        antIcon(64),
        el("h1", { class: "d", style: "font-size:clamp(30px,7vw,44px)", text: info[0] }),
        el("p", { style: "max-width:46ch", text: info[1] }),
        el("a", { class: "btn btn-yel btn-sm", href: "#/", text: "Back to the feed" }),
        el("div", { class: "march", "aria-hidden": "true" }, [antIcon(36), antIcon(36), antIcon(36)])
      ])
    ]);
  }

  function roomsPage() {
    document.title = "Rooms · Ant Politics";
    var grid = el("div", { class: "rooms" });
    chambers.forEach(function (c) {
      grid.appendChild(el("a", { class: "room", href: "#/chamber/" + c.slug }, [
        el("span", { class: "room-name", text: c.name }),
        el("span", { class: "room-bn", text: c.name_bn || "" })
      ]));
    });
    var feats = el("div", { class: "features" });
    [["following", "Following", "#/following"], ["sourced", "Sourced trails", "#/sourced"], ["elections", "Soldier Elections", "#/soon/elections"], ["arena", "Debate Arena", "#/soon/arena"], ["rumors", "Rumor Hunt", "#/soon/rumors"], ["adda", "Adda Rooms", "#/soon/adda"]].forEach(function (f) {
      feats.appendChild(el("a", { class: "feature", href: f[2] }, [icon(f[0], 26), el("span", { text: f[1] })]));
    });
    return narrow([
      el("h1", { class: "meme", style: "font-size:clamp(34px,8vw,52px)", text: "Chambers" }),
      grid,
      el("span", { class: "label on-soil", text: "More of the colony" }),
      feats
    ]);
  }

  function joinPage() {
    document.title = "Join · Ant Politics";
    if (me) return narrow([el("div", { class: "card" }, [
      el("h1", { class: "d", style: "font-size:34px", text: "You are already an ant" }),
      el("p", { text: "You are " + me.handle + "." }),
      el("a", { class: "btn btn-yel btn-sm", href: "#/", text: "Go to the feed" })
    ])]);
    var go = el("button", { type: "button", class: "btn btn-red", text: "Join the colony" });
    go.addEventListener("click", async function () {
      go.disabled = true;
      try {
        await joinColony();
        renderTop();
        say("Welcome, " + me.handle + ".");
        location.hash = "#/";
      } catch (e) {
        say(failMessage(e), true);
      }
      go.disabled = false;
    });
    return narrow([
      el("h1", { class: "meme", style: "font-size:clamp(34px,8vw,52px)", text: "Become an ant" }),
      el("div", { class: "card" }, [
        el("p", { text: "No email. No phone. No NID. Press the button and the colony gives you a random name like Ant-7f3k9." }),
        el("p", { class: "muted", style: "font-size:16px", text: "There is no password, so your ant lives in this browser. If you clear your browser data or switch phones, you start again as a new ant." }),
        go
      ])
    ]);
  }

  function leavePage() {
    document.title = "Leave · Ant Politics";
    if (!me) return narrow([needJoin("You are not signed in.")]);
    var wipe = el("button", { type: "button", class: "btn btn-sm", text: "Delete all my trails and comments" });
    wipe.addEventListener("click", async function () {
      if (!window.confirm("Delete everything you have posted? This cannot be undone.")) return;
      wipe.disabled = true;
      var a = await sb.from("comments").delete().eq("ant_id", me.id);
      var b = await sb.from("trails").delete().eq("ant_id", me.id);
      wipe.disabled = false;
      if (a.error || b.error) { say(failMessage(a.error || b.error), true); return; }
      say("Your trails and comments are gone.");
    });
    var out = el("button", { type: "button", class: "btn btn-red", text: "Sign out of this ant" });
    out.addEventListener("click", async function () {
      if (!window.confirm("You cannot get this ant back after signing out. Continue?")) return;
      await sb.auth.signOut();
      me = null;
      renderTop();
      say("You left the colony.");
      location.hash = "#/";
    });
    return narrow([
      el("h1", { class: "meme", style: "font-size:clamp(34px,8vw,52px)", text: "Leave the colony" }),
      el("div", { class: "card" }, [
        el("p", { text: "Because there is no password, signing out means nobody, including you, can get " + me.handle + " back." }),
        el("p", { class: "muted", style: "font-size:16px", text: "Want your words gone first? Delete your trails and comments, then sign out." }),
        wipe, out
      ])
    ]);
  }

  function setupPage() {
    clear(view);
    view.appendChild(narrow([el("div", { class: "card" }, [
      el("h1", { class: "d", style: "font-size:34px", text: "Almost there" }),
      el("p", { text: "The site needs your Supabase details. Open config.js on GitHub, press the pencil, and paste your Project URL and your anon public key between the quotes." }),
      el("p", { class: "muted", style: "font-size:16px", text: "The URL looks like https://abcdefgh.supabase.co with nothing after .co. Never paste the service_role key." })
    ])]));
  }

  // ---------- router ----------

  function parts() {
    var h = location.hash.replace(/^#/, "").split("?")[0];
    return h.split("/").filter(Boolean);
  }

  function routeKey(p) {
    var head = p[0] || "";
    if (head === "") return "home";
    if (head === "new") return "new";
    if (head === "following") return "following";
    if (head === "sourced") return "sourced";
    if (head === "rooms" || head === "chamber") return "rooms";
    if (head === "post") return "post";
    if (head === "soon") return p[1] || "";
    if (head === "avatar" || head === "join" || head === "leave") return "me";
    if (head === "ant" && me && decodeURIComponent(p[1] || "").toLowerCase() === me.handle.toLowerCase()) return "me";
    return "";
  }

  async function route() {
    var id = ++renderId;
    stopFeed();
    var p = parts();
    var head = p[0] || "";
    renderRail(routeKey(p));
    var node;
    try {
      if (head === "") node = homePage("hot");
      else if (head === "new") node = homePage("new");
      else if (head === "following") node = homePage("following");
      else if (head === "sourced") node = homePage("sourced");
      else if (head === "chamber") node = chamberPage(p[1] || "", p[2]);
      else if (head === "trail") node = await trailPage(p[1] || "");
      else if (head === "ant") node = await antPage(p[1] || "");
      else if (head === "avatar") node = avatarPage();
      else if (head === "rooms") node = roomsPage();
      else if (head === "search") node = await searchPage(decodeURIComponent(p[1] || ""));
      else if (head === "post") node = postPage();
      else if (head === "join") node = joinPage();
      else if (head === "leave") node = leavePage();
      else if (head === "soon") node = soonPage(p[1] || "");
      else node = notFound();
    } catch (e) {
      node = narrow([el("div", { class: "empty" }, [el("h1", { class: "d", text: "The tunnel collapsed" }), el("p", { text: failMessage(e) }), el("a", { class: "btn btn-yel btn-sm", href: "#/", text: "Back to the surface" })])]);
    }
    if (id !== renderId) return;
    if (head !== "" && head !== "new" && head !== "following" && head !== "sourced" && head !== "chamber" && head !== "trail" && head !== "ant" && head !== "avatar" && head !== "rooms" && head !== "search" && head !== "post" && head !== "join" && head !== "leave" && head !== "soon") document.title = "Not found · Ant Politics";
    clear(view);
    view.appendChild(node);
    window.scrollTo(0, 0);
  }

  searchForm.addEventListener("submit", function (e) {
    e.preventDefault();
    var q = searchBox.value.trim();
    if (q) location.hash = "#/search/" + encodeURIComponent(q);
  });

  // ---------- start ----------

  function configured() {
    return CFG.url && CFG.key && /^https:\/\/[a-z0-9-]+\.supabase\.(co|in)\/?$/i.test(CFG.url) && CFG.key.indexOf("PASTE_") !== 0;
  }

  async function boot() {
    renderRail("");
    if (!window.supabase || !window.AntAvatar) {
      clear(view);
      view.appendChild(narrow([el("div", { class: "card" }, [el("h1", { class: "d", text: "Could not load" }), el("p", { text: "A needed script did not load. Check your connection and refresh." })])]));
      return;
    }
    if (!configured()) { setupPage(); return; }
    sb = window.supabase.createClient(CFG.url.replace(/\/$/, ""), CFG.key, { auth: { persistSession: true, autoRefreshToken: true } });
    try { await loadMe(); } catch (e) { me = null; }
    try { await loadChambers(); } catch (e) { chambers = []; }
    renderTop();
    window.addEventListener("hashchange", route);
    route();
  }

  boot();
})();
