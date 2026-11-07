// Ant Politics: the whole website in one file. No build step.
// All user text is shown with textContent (never innerHTML), so posts cannot inject code.

(function () {
  "use strict";

  // ===================================================================
  // 1. PASTE YOUR SUPABASE DETAILS HERE (Supabase > Project Settings > API)
  //    Use the Project URL and the "anon public" key. NEVER paste the service_role key.
  // ===================================================================
  var SUPABASE_URL = "https://dozfyffvsakrijcddilx.supabase.co/rest/v1/";
  var SUPABASE_ANON_KEY = "sb_publishable_LNdcHemQM0UF4msNHTBZJQ_h37NckbJ";
  // ===================================================================

  var SCOUT_AT = 100;
  var SOLDIER_AT = 1000;

  var app = document.getElementById("app");
  var navRight = document.getElementById("nav-right");
  var toastBox = document.getElementById("toast");

  var sb = null;
  var me = null; // { id, handle, rank } when joined
  var renderId = 0;
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

  function day(value) {
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

  function rankFor(followers, stored) {
    if (stored === "soldier") return { label: "Soldier", blurb: "Protects the colony. Elected, not assigned." };
    if (followers >= SCOUT_AT) return { label: "Scout", blurb: "Finds sources before the screenshot arrives." };
    return { label: "Worker", blurb: "Posts. Gets ratioed. Learns." };
  }

  function nextGoal(followers, stored) {
    if (stored === "soldier") return null;
    if (followers < SCOUT_AT) return (SCOUT_AT - followers) + " more followers to become a Scout.";
    if (followers < SOLDIER_AT) return (SOLDIER_AT - followers) + " more followers to become eligible for a Soldier vote.";
    return "Eligible for a Soldier vote. Colony elections arrive in the next update.";
  }

  function mount(nodes) {
    var y = window.scrollY;
    clear(app);
    nodes.forEach(function (n) { app.appendChild(n); });
    window.scrollTo(0, y);
  }

  function pageWrap(kids) {
    return el("main", { class: "wrap page" }, kids);
  }

  // ---------- account ----------

  async function loadMe() {
    var s = await sb.auth.getSession();
    var session = s.data && s.data.session;
    if (!session) { me = null; return; }
    var r = await sb.from("ants").select("id, handle, rank, created_at").eq("id", session.user.id).maybeSingle();
    if (r.data) { me = r.data; return; }
    var made = await sb.rpc("create_ant");
    me = made.error ? null : made.data;
  }

  async function joinColony() {
    var signed = await sb.auth.signInAnonymously();
    if (signed.error) throw signed.error;
    var made = await sb.rpc("create_ant");
    if (made.error) throw made.error;
    me = made.data;
  }

  function renderNav() {
    clear(navRight);
    navRight.appendChild(el("a", { href: "#/", text: "Colony" }));
    if (me) {
      navRight.appendChild(el("a", { href: "#/ant/" + encodeURIComponent(me.handle), text: me.handle }));
      navRight.appendChild(el("a", { href: "#/leave", text: "Leave" }));
    } else {
      navRight.appendChild(el("a", { href: "#/join", class: "btn btn-red btn-small", text: "Join" }));
    }
  }

  // ---------- trail card ----------

  async function castVote(trail, kind) {
    if (!me) { location.hash = "#/join"; return; }
    var r;
    if (trail.my_vote === kind) {
      r = await sb.from("votes").delete().eq("trail_id", trail.id).eq("ant_id", me.id);
    } else {
      r = await sb.from("votes").upsert(
        { trail_id: trail.id, ant_id: me.id, kind: kind },
        { onConflict: "trail_id,ant_id" }
      );
    }
    if (r.error) { say(failMessage(r.error), true); return; }
    render();
  }

  function trailCard(t) {
    var kinds = [["agree", "Agree"], ["disagree", "Disagree"], ["convince", "Convince me"]];
    var sourced = !!t.source_url && isHttpUrl(t.source_url);

    return el("article", { class: "card" }, [
      el("div", { class: "post-head" }, [
        el("div", { class: "post-who" }, [
          el("a", { class: "post-handle", href: "#/ant/" + encodeURIComponent(t.handle), text: t.handle }),
          el("a", { class: "post-colony", href: "#/chamber/" + encodeURIComponent(t.chamber_slug), text: "in " + t.chamber_name })
        ]),
        el("span", { class: sourced ? "badge badge-ok" : "badge", text: sourced ? "Sourced" : "Needs source" })
      ]),
      el("p", { class: "post-text", text: t.body }),
      el("div", { class: "post-meta" }, [
        el("span", { text: day(t.created_at) }),
        sourced ? el("a", { href: t.source_url, target: "_blank", rel: "noopener noreferrer nofollow", text: "Source: " + hostOf(t.source_url) }) : null
      ]),
      el("div", { class: "votes" }, kinds.map(function (pair) {
        var kind = pair[0];
        return el("button", {
          type: "button",
          class: "vote",
          "data-vote": kind,
          "aria-pressed": String(t.my_vote === kind),
          onclick: function () { castVote(t, kind); }
        }, [pair[1], el("span", { class: "count", text: String(t[kind]) })]);
      }))
    ]);
  }

  function trailList(trails, emptyText) {
    if (!trails || trails.length === 0) return el("div", { class: "empty", text: emptyText });
    return el("div", { class: "stack" }, trails.map(trailCard));
  }

  // ---------- views ----------

  async function viewHome(id) {
    var results = await Promise.all([
      sb.from("chambers").select("id, slug, name, name_bn, kind"),
      sb.from("trail_feed").select("*").order("created_at", { ascending: false }).limit(20)
    ]);
    if (id !== renderId) return;
    if (results[0].error) throw results[0].error;
    if (results[1].error) throw results[1].error;

    var chambers = results[0].data.slice().sort(function (a, b) {
      if (a.kind !== b.kind) return a.kind === "national" ? -1 : 1;
      return a.name.localeCompare(b.name);
    });

    var heroKids = [
      el("div", { class: "pill", text: "Bangladesh anthill" }),
      el("h1", { class: "meme-text", text: "Small voices. Big colony." }),
      el("p", { class: "hero-bangla bangla", lang: "bn", text: "ছোট পিঁপড়া, বড় কলোনি" }),
      el("p", { class: "hero-text", text: "A political playground for ants. Pick a chamber, leave a trail, and let the colony vote. Everyone starts as a Worker. Grow your followers to climb the ladder." })
    ];
    if (!me) {
      heroKids.push(el("div", { class: "btn-row" }, [
        el("a", { href: "#/join", class: "btn btn-red", text: "Join anonymously" })
      ]));
    }

    var chamberCards = chambers.map(function (c) {
      return el("a", { href: "#/chamber/" + encodeURIComponent(c.slug), class: c.kind === "national" ? "chamber-card national" : "chamber-card" }, [
        el("span", { class: "chamber-name", text: c.name }),
        c.name_bn ? el("span", { class: "chamber-bn bangla", lang: "bn", text: c.name_bn }) : null
      ]);
    });

    mount([
      el("section", { class: "hero" }, [el("div", { class: "wrap" }, heroKids)]),
      pageWrap([
        el("section", { class: "stack" }, [
          el("h2", { class: "section-title", text: "Chambers" }),
          el("div", { class: "chamber-grid" }, chamberCards)
        ]),
        el("section", { class: "stack" }, [
          el("h2", { class: "section-title", text: "Latest trails" }),
          trailList(results[1].data, "No trails yet. Be the first ant to leave one in any chamber.")
        ])
      ])
    ]);
  }

  async function viewChamber(id, slug) {
    var cr = await sb.from("chambers").select("id, slug, name, name_bn").eq("slug", slug).maybeSingle();
    if (id !== renderId) return;
    if (cr.error) throw cr.error;
    if (!cr.data) { mount([pageWrap([el("p", { text: "That chamber does not exist." }), el("a", { href: "#/", text: "Back to the colony" })])]); return; }
    var chamber = cr.data;

    var tr = await sb.from("trail_feed").select("*").eq("chamber_slug", slug).order("created_at", { ascending: false }).limit(50);
    if (id !== renderId) return;
    if (tr.error) throw tr.error;

    var composer;
    if (me) {
      var bodyBox = el("textarea", { id: "body", class: "input", maxlength: "500", placeholder: "Say your opinion. Short and sourced beats loud.", required: true });
      var sourceBox = el("input", { id: "source", class: "input", type: "url", inputmode: "url", placeholder: "https://" });
      var submit = el("button", { type: "submit", class: "btn btn-red", text: "Post trail" });
      var form = el("form", { class: "card stack" }, [
        el("div", { class: "field" }, [el("label", { for: "body", text: "Leave a trail" }), bodyBox]),
        el("div", { class: "field" }, [el("label", { for: "source", text: "Source link (optional, earns the Sourced badge)" }), sourceBox]),
        el("div", {}, [submit])
      ]);
      form.addEventListener("submit", async function (e) {
        e.preventDefault();
        var body = bodyBox.value.trim();
        var source = sourceBox.value.trim();
        if (body.length < 1 || body.length > 500) { say("Write between 1 and 500 characters.", true); return; }
        if (source && !isHttpUrl(source)) { say("The source must be a valid http or https link.", true); return; }
        submit.disabled = true;
        var r = await sb.from("trails").insert({ ant_id: me.id, chamber_id: chamber.id, body: body, source_url: source || null });
        submit.disabled = false;
        if (r.error) { say(failMessage(r.error), true); return; }
        say("Trail posted.");
        render();
      });
      composer = form;
    } else {
      composer = el("div", { class: "card stack" }, [
        el("p", { text: "Join the colony to leave trails and vote." }),
        el("div", { class: "btn-row" }, [el("a", { href: "#/join", class: "btn btn-red", text: "Join anonymously" })])
      ]);
    }

    mount([
      pageWrap([
        el("div", { class: "stack" }, [
          el("a", { href: "#/", class: "muted", text: "Back to all chambers" }),
          el("h1", { class: "section-title", text: chamber.name }),
          chamber.name_bn ? el("p", { class: "hero-bangla bangla", lang: "bn", text: chamber.name_bn }) : null
        ]),
        composer,
        trailList(tr.data, "No trails in " + chamber.name + " yet. Start the first one.")
      ])
    ]);
  }

  async function viewAnt(id, handle) {
    var pr = await sb.from("ant_profiles").select("*").eq("handle", handle).maybeSingle();
    if (id !== renderId) return;
    if (pr.error) throw pr.error;
    if (!pr.data) { mount([pageWrap([el("p", { text: "No ant with that ID." }), el("a", { href: "#/", text: "Back to the colony" })])]); return; }
    var p = pr.data;

    var tr = await sb.from("trail_feed").select("*").eq("handle", handle).order("created_at", { ascending: false }).limit(30);
    if (id !== renderId) return;
    if (tr.error) throw tr.error;

    var isMe = me && me.id === p.id;
    var rank = rankFor(p.followers, p.rank);
    var goal = nextGoal(p.followers, p.rank);

    var action = null;
    if (me && !isMe) {
      action = el("button", {
        type: "button",
        class: p.i_follow ? "btn" : "btn btn-red",
        text: p.i_follow ? "Following" : "Follow",
        onclick: async function () {
          var r = p.i_follow
            ? await sb.from("follows").delete().eq("follower_id", me.id).eq("followee_id", p.id)
            : await sb.from("follows").insert({ follower_id: me.id, followee_id: p.id });
          if (r.error) { say(failMessage(r.error), true); return; }
          render();
        }
      });
    } else if (!me) {
      action = el("a", { href: "#/join", class: "btn btn-red", text: "Join to follow" });
    }

    mount([
      pageWrap([
        el("div", { class: "card" }, [
          el("div", { class: "profile-head" }, [
            el("div", { class: "stack", style: "gap:8px" }, [
              el("h1", { class: "section-title", text: p.handle }),
              el("span", { class: "rank-tag", text: rank.label }),
              el("p", { class: "muted", text: rank.blurb })
            ]),
            action
          ]),
          el("div", { class: "stats" }, [
            el("span", {}, [el("b", { text: String(p.followers) }), " worker ants following"]),
            el("span", {}, [el("b", { text: String(p.trails) }), " trails"]),
            el("span", { text: "Joined " + day(p.created_at) })
          ]),
          goal ? el("div", { class: "alert", text: goal }) : null
        ]),
        el("section", { class: "stack" }, [
          el("h2", { class: "section-title", text: "Trails" }),
          trailList(tr.data, "This ant has not left a trail yet.")
        ])
      ])
    ]);
  }

  function viewJoin() {
    if (me) {
      mount([pageWrap([
        el("h1", { class: "section-title", text: "You are in" }),
        el("div", { class: "card stack", style: "max-width:640px" }, [
          el("div", { class: "key-box" }, [el("span", { class: "label", text: "Your Ant ID" }), el("span", { class: "key-line", text: me.handle })]),
          el("div", { class: "btn-row" }, [el("a", { href: "#/", class: "btn btn-red", text: "Enter the colony" })])
        ])
      ])]);
      return;
    }

    var button = el("button", { type: "button", class: "btn btn-red", text: "Get my Ant ID" });
    button.addEventListener("click", async function () {
      button.disabled = true;
      button.textContent = "Digging...";
      try {
        await joinColony();
        renderNav();
        render();
      } catch (err) {
        button.disabled = false;
        button.textContent = "Get my Ant ID";
        say(failMessage(err), true);
      }
    });

    mount([pageWrap([
      el("h1", { class: "section-title", text: "Join the colony" }),
      el("div", { class: "card stack", style: "max-width:640px" }, [
        el("p", { text: "Press the button and the colony gives you a random Ant ID. No email, no phone, no real name." }),
        el("div", { class: "alert", text: "Your ant lives in this browser only. There is no password. If you clear site data or leave the colony, this ant is gone for good." }),
        el("div", {}, [button])
      ])
    ])]);
  }

  function viewLeave() {
    if (!me) { location.hash = "#/"; return; }
    var button = el("button", { type: "button", class: "btn btn-red", text: "Leave and delete access" });
    button.addEventListener("click", async function () {
      button.disabled = true;
      await sb.auth.signOut();
      me = null;
      renderNav();
      say("You left the colony.");
      location.hash = "#/";
    });
    mount([pageWrap([
      el("h1", { class: "section-title", text: "Leave the colony?" }),
      el("div", { class: "card stack", style: "max-width:640px" }, [
        el("p", { text: "You are " + me.handle + ". Anonymous ants have no password, so once you leave, nobody can get back into this ant, including you. Your old trails stay posted." }),
        el("div", { class: "btn-row" }, [button, el("a", { href: "#/", class: "btn", text: "Stay" })])
      ])
    ])]);
  }

  // ---------- router ----------

  function parseRoute() {
    var raw = location.hash.replace(/^#\/?/, "");
    var parts = raw.split("/").filter(Boolean).map(function (s) {
      try { return decodeURIComponent(s); } catch (e) { return s; }
    });
    return parts;
  }

  async function render() {
    var id = ++renderId;
    var parts = parseRoute();
    try {
      if (parts[0] === "chamber" && parts[1]) await viewChamber(id, parts[1]);
      else if (parts[0] === "ant" && parts[1]) await viewAnt(id, parts[1]);
      else if (parts[0] === "join") viewJoin();
      else if (parts[0] === "leave") viewLeave();
      else await viewHome(id);
    } catch (err) {
      if (id !== renderId) return;
      mount([pageWrap([
        el("div", { class: "alert alert-bad", role: "alert", text: "Could not load this page: " + failMessage(err) }),
        el("a", { href: "#/", text: "Back to the colony" })
      ])]);
    }
  }

  // ---------- start ----------

  async function start() {
    var configured = SUPABASE_URL.indexOf("https://") === 0 && SUPABASE_ANON_KEY.length > 20;
    if (!configured) {
      clear(app);
      app.appendChild(pageWrap([
        el("h1", { class: "section-title", text: "Almost there" }),
        el("div", { class: "card stack" }, [
          el("p", { text: "Open app.js and paste your Supabase Project URL and anon public key at the top, then save and reload." })
        ])
      ]));
      return;
    }
    if (!window.supabase || !window.supabase.createClient) {
      clear(app);
      app.appendChild(pageWrap([el("div", { class: "alert alert-bad", role: "alert", text: "The Supabase library did not load. Check your internet connection and reload." })]));
      return;
    }

    sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: { persistSession: true, autoRefreshToken: true }
    });

    try { await loadMe(); } catch (e) { me = null; }
    renderNav();
    window.addEventListener("hashchange", render);
    render();
  }

  start();
})();
