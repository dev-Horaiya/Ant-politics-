// Ant Politics: the ant avatar maker.
// An avatar is only a small list of part choices (never a picture), for example:
//   { body: "red", eyes: "wink", hat: "cap", bg: "mint" }
// This file turns that list into a small SVG drawing. The list of allowed parts and the rank
// each one needs MUST match avatar_catalog() in supabase.sql (the database enforces it too).

(function () {
  "use strict";

  var INK = "#1c1917";
  var CREAM = "#fef3c7";

  var BODY = { ink: "#1c1917", red: "#b91c1c", brown: "#78350f", green: "#15803d", blue: "#1d4ed8", pink: "#db2777", gold: "#eab308" };
  var BG = { yellow: "#fde047", rose: "#fecdd3", mint: "#bbf7d0", sky: "#bae6fd", stone: "#d6d3d1", soil: "#78350f", night: "#1e1b4b" };

  var TIERS = ["Worker", "Scout", "Soldier"];

  // [id, label, tier needed]
  var CATS = [
    { key: "body", label: "Body", swatch: BODY, opts: [["ink", "Ink", 0], ["red", "Red", 0], ["brown", "Brown", 0], ["green", "Green", 0], ["blue", "Blue", 0], ["pink", "Pink", 0], ["gold", "Gold", 2]] },
    { key: "marks", label: "Marks", opts: [["none", "None", 0], ["freckles", "Freckles", 0], ["blush", "Blush", 0], ["stripes", "Stripes", 0]] },
    { key: "eyes", label: "Eyes", opts: [["round", "Round", 0], ["sleepy", "Sleepy", 0], ["angry", "Angry", 0], ["wink", "Wink", 0]] },
    { key: "mouth", label: "Mouth", opts: [["smile", "Smile", 0], ["flat", "Flat", 0], ["shout", "Shout", 0], ["smirk", "Smirk", 0]] },
    { key: "antennae", label: "Antennae", opts: [["straight", "Straight", 0], ["curly", "Curly", 0], ["bent", "Bent", 1]] },
    { key: "hat", label: "Hat", opts: [["none", "None", 0], ["cap", "Cap", 0], ["party", "Party", 0], ["hard", "Hard hat", 1], ["crown", "Crown", 2]] },
    { key: "eyewear", label: "Glasses", opts: [["none", "None", 0], ["round", "Round", 0], ["shades", "Shades", 1]] },
    { key: "outfit", label: "Outfit", opts: [["none", "None", 0], ["bow", "Bow tie", 0], ["tie", "Tie", 0], ["gamcha", "Gamcha", 1], ["medal", "Medal", 2]] },
    { key: "item", label: "Item", opts: [["none", "Nothing", 0], ["crumb", "Crumb", 0], ["cha", "Cha", 0], ["mega", "Megaphone", 1], ["signsrc", "Sign: SOURCE?", 1], ["signvote", "Sign: VOTE", 1]] },
    { key: "bg", label: "Background", swatch: BG, opts: [["yellow", "Yellow", 0], ["rose", "Rose", 0], ["mint", "Mint", 0], ["sky", "Sky", 0], ["stone", "Stone", 0], ["soil", "Soil", 0], ["night", "Night", 0]] },
    { key: "pattern", label: "Pattern", opts: [["none", "None", 0], ["dots", "Dots", 0], ["stripes", "Stripes", 1], ["burst", "Burst", 1]] }
  ];

  var HEX = /^#[0-9a-fA-F]{6}$/;

  function hash(text) {
    var h = 0;
    var s = String(text || "");
    for (var i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
    return h;
  }

  function lum(hex) {
    var r = parseInt(hex.slice(1, 3), 16);
    var g = parseInt(hex.slice(3, 5), 16);
    var b = parseInt(hex.slice(5, 7), 16);
    return 0.299 * r + 0.587 * g + 0.114 * b;
  }

  function findCat(key) {
    for (var i = 0; i < CATS.length; i++) if (CATS[i].key === key) return CATS[i];
    return null;
  }

  function isOption(cat, id) {
    for (var i = 0; i < cat.opts.length; i++) if (cat.opts[i][0] === id) return true;
    return false;
  }

  // Fills in every missing part. With a seed (the ant's handle) the body, eyes, mouth and
  // background start as a stable, different look for each ant, always using free parts.
  function normalize(av, seed) {
    var src = (av && typeof av === "object") ? av : {};
    var out = {};
    var h = hash(seed);
    var seeded = { body: 0, eyes: 1, mouth: 2, bg: 3 };
    CATS.forEach(function (cat) {
      var v = src[cat.key];
      if (typeof v === "string" && isOption(cat, v)) { out[cat.key] = v; return; }
      var free = cat.opts.filter(function (o) { return o[2] === 0; });
      if (seed && seeded.hasOwnProperty(cat.key)) {
        var pick = free[Math.floor(h / Math.pow(7, seeded[cat.key])) % free.length];
        out[cat.key] = pick[0];
      } else {
        out[cat.key] = cat.opts[0][0];
      }
    });
    if (typeof src.bodyHex === "string" && HEX.test(src.bodyHex)) out.bodyHex = src.bodyHex.toLowerCase();
    if (typeof src.bgHex === "string" && HEX.test(src.bgHex)) out.bgHex = src.bgHex.toLowerCase();
    return out;
  }

  function randomize(level, keepHex) {
    var out = {};
    CATS.forEach(function (cat) {
      var ok = cat.opts.filter(function (o) { return o[2] <= level; });
      out[cat.key] = ok[Math.floor(Math.random() * ok.length)][0];
    });
    return out;
  }

  // ---------- drawing ----------

  function patternSvg(kind, bgHex) {
    var dark = lum(bgHex) < 110;
    var c = dark ? "#ffffff" : INK;
    var o = dark ? ".14" : ".12";
    var s = "";
    var i, j;
    if (kind === "dots") {
      for (i = 0; i < 8; i++) for (j = 0; j < 8; j++) {
        s += '<circle cx="' + (7 + i * 14 + (j % 2) * 7) + '" cy="' + (7 + j * 14) + '" r="2.4" fill="' + c + '" opacity="' + o + '"/>';
      }
    } else if (kind === "stripes") {
      for (i = -100; i < 120; i += 18) {
        s += '<path d="M' + i + " 100 L" + (i + 100) + ' 0" stroke="' + c + '" stroke-width="7" opacity="' + o + '"/>';
      }
    } else if (kind === "burst") {
      for (i = 0; i < 16; i += 2) {
        var a1 = (i / 16) * Math.PI * 2;
        var a2 = ((i + 1) / 16) * Math.PI * 2;
        s += '<path d="M50 56 L' + (50 + Math.cos(a1) * 120).toFixed(1) + " " + (56 + Math.sin(a1) * 120).toFixed(1) +
          " L" + (50 + Math.cos(a2) * 120).toFixed(1) + " " + (56 + Math.sin(a2) * 120).toFixed(1) + ' Z" fill="' + c + '" opacity="' + o + '"/>';
      }
    }
    return s;
  }

  function eyeBase(cx) {
    return '<circle cx="' + cx + '" cy="54" r="6.5" fill="#fff" stroke="' + INK + '" stroke-width="2.5"/>' +
      '<circle cx="' + (cx + 1) + '" cy="55" r="2.8" fill="' + INK + '"/>';
  }

  function stroke(color, width) {
    return ' fill="none" stroke="' + color + '" stroke-width="' + width + '" stroke-linecap="round" stroke-linejoin="round"';
  }

  function build(av, seed) {
    var a = normalize(av, seed);
    var B = a.bodyHex || BODY[a.body];
    var BGC = a.bgHex || BG[a.bg];
    var F = lum(B) < 110 ? CREAM : INK;          // face-line colour that shows on the body
    var OL = lum(BGC) < 90 ? CREAM : INK;        // outline colour that shows on the background
    var G = lum(B) < 90 ? CREAM : INK;           // glasses colour
    var s = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" focusable="false">';

    s += '<rect width="100" height="100" fill="' + BGC + '"/>';
    s += patternSvg(a.pattern, BGC);

    // antennae (behind the head)
    var ant = {
      straight: ["M38 34 L28 12 M62 34 L72 12", [[28, 12], [72, 12]]],
      curly: ["M38 34 C30 24 44 20 36 11 M62 34 C70 24 56 20 64 11", [[36, 11], [64, 11]]],
      bent: ["M38 34 L36 20 L22 16 M62 34 L64 20 L78 16", [[22, 16], [78, 16]]]
    }[a.antennae];
    s += '<path d="' + ant[0] + '"' + stroke(OL, 3);
    s += "/>";
    ant[1].forEach(function (p) { s += '<circle cx="' + p[0] + '" cy="' + p[1] + '" r="3.6" fill="' + OL + '"/>'; });

    // torso and head
    s += '<path d="M14 100 C14 84 30 78 50 78 C70 78 86 84 86 100 Z" fill="' + B + '" stroke="' + OL + '" stroke-width="3" stroke-linejoin="round"/>';
    s += '<ellipse cx="50" cy="56" rx="28" ry="26" fill="' + B + '" stroke="' + OL + '" stroke-width="3"/>';

    // marks
    if (a.marks === "freckles") {
      [[31, 62], [35, 66], [30, 67], [69, 62], [65, 66], [70, 67]].forEach(function (p) {
        s += '<circle cx="' + p[0] + '" cy="' + p[1] + '" r="1.5" fill="' + F + '" opacity=".8"/>';
      });
    } else if (a.marks === "blush") {
      s += '<ellipse cx="32" cy="65" rx="5.5" ry="3.2" fill="#fb7185" opacity=".7"/><ellipse cx="68" cy="65" rx="5.5" ry="3.2" fill="#fb7185" opacity=".7"/>';
    } else if (a.marks === "stripes") {
      s += '<path d="M44 33 V43 M50 32 V43 M56 33 V43"' + stroke(F, 3) + ' opacity=".8"/>';
    }

    // eyes
    if (a.eyes === "round") {
      s += eyeBase(39) + eyeBase(61);
    } else if (a.eyes === "sleepy") {
      s += eyeBase(39) + eyeBase(61);
      [39, 61].forEach(function (cx) {
        s += '<path d="M' + (cx - 6.5) + " 54 A6.5 6.5 0 0 1 " + (cx + 6.5) + ' 54 Z" fill="' + B + '" stroke="' + INK + '" stroke-width="2.5" stroke-linejoin="round"/>';
      });
    } else if (a.eyes === "angry") {
      s += eyeBase(39) + eyeBase(61);
      s += '<path d="M31 45 L46 50 M69 45 L54 50"' + stroke(F, 3.6) + "/>";
    } else if (a.eyes === "wink") {
      s += eyeBase(39);
      s += '<path d="M54 55 Q61 48 68 55"' + stroke(F, 3.2) + "/>";
    }

    // mouth
    if (a.mouth === "smile") {
      s += '<path d="M40 68 Q50 79 60 68"' + stroke(F, 3.2) + "/>";
    } else if (a.mouth === "flat") {
      s += '<path d="M42 71 L58 71"' + stroke(F, 3.2) + "/>";
    } else if (a.mouth === "shout") {
      s += '<ellipse cx="50" cy="72" rx="7" ry="8" fill="' + INK + '" stroke="' + F + '" stroke-width="2.5"/><ellipse cx="50" cy="76" rx="4" ry="3" fill="#dc2626"/>';
    } else if (a.mouth === "smirk") {
      s += '<path d="M41 71 Q52 75 60 66"' + stroke(F, 3.2) + "/>";
    }

    // glasses
    if (a.eyewear === "round") {
      s += '<circle cx="39" cy="54" r="10" fill="#ffffff" fill-opacity=".25" stroke="' + G + '" stroke-width="3"/>';
      s += '<circle cx="61" cy="54" r="10" fill="#ffffff" fill-opacity=".25" stroke="' + G + '" stroke-width="3"/>';
      s += '<path d="M49 54 H51"' + stroke(G, 3) + "/>";
    } else if (a.eyewear === "shades") {
      s += '<path d="M28 48 H49 V56 Q49 63 38.5 63 Q28 63 28 56 Z" fill="' + INK + '" stroke="' + G + '" stroke-width="2" stroke-linejoin="round"/>';
      s += '<path d="M51 48 H72 V56 Q72 63 61.5 63 Q51 63 51 56 Z" fill="' + INK + '" stroke="' + G + '" stroke-width="2" stroke-linejoin="round"/>';
      s += '<path d="M32 52 L36 52 M55 52 L59 52"' + stroke("#ffffff", 2) + ' opacity=".6"/>';
    }

    // hats
    var join = ' stroke="' + OL + '" stroke-width="3" stroke-linejoin="round"';
    if (a.hat === "cap") {
      s += '<path d="M25 40 C25 18 75 18 75 40 Z" fill="#dc2626"' + join + "/>";
      s += '<path d="M56 40 Q82 38 92 46 L58 46 Z" fill="#b91c1c"' + join + "/>";
    } else if (a.hat === "party") {
      s += '<path d="M34 38 L50 5 L66 38 Z" fill="#fde047"' + join + "/>";
      s += '<path d="M40 26 L60 26 M37 33 L63 33"' + stroke("#dc2626", 3) + "/>";
      s += '<circle cx="50" cy="5" r="4.5" fill="#dc2626" stroke="' + OL + '" stroke-width="2.5"/>';
    } else if (a.hat === "hard") {
      s += '<path d="M25 40 C25 14 75 14 75 40 Z" fill="#f59e0b"' + join + "/>";
      s += '<rect x="20" y="38" width="60" height="7" rx="3" fill="#f59e0b"' + join + "/>";
      s += '<path d="M50 17 V38"' + stroke(OL, 3) + "/>";
    } else if (a.hat === "crown") {
      s += '<path d="M26 40 L24 14 L38 26 L50 8 L62 26 L76 14 L74 40 Z" fill="#fde047"' + join + "/>";
      s += '<circle cx="50" cy="31" r="3" fill="#dc2626"/><circle cx="36" cy="34" r="2.3" fill="#15803d"/><circle cx="64" cy="34" r="2.3" fill="#15803d"/>';
    }

    // outfit
    var ol25 = ' stroke="' + OL + '" stroke-width="2.5" stroke-linejoin="round"';
    if (a.outfit === "bow") {
      s += '<path d="M50 86 L35 78 V94 Z M50 86 L65 78 V94 Z" fill="#dc2626"' + ol25 + "/>";
      s += '<circle cx="50" cy="86" r="4" fill="#b91c1c"' + ol25 + "/>";
    } else if (a.outfit === "tie") {
      s += '<path d="M46 82 H54 L56 90 L50 100 L44 90 Z" fill="#1d4ed8"' + ol25 + "/>";
    } else if (a.outfit === "gamcha") {
      s += '<path d="M24 80 Q50 94 76 80 L78 90 Q50 104 22 90 Z" fill="#dc2626"' + ol25 + "/>";
      s += '<path d="M30 84 V90 M40 87 V94 M50 89 V96 M60 87 V94 M70 84 V90"' + stroke("#ffffff", 2) + "/>";
    } else if (a.outfit === "medal") {
      s += '<path d="M40 80 L50 94 L60 80"' + stroke("#1d4ed8", 4) + "/>";
      s += '<circle cx="50" cy="95" r="6" fill="#fde047"' + ol25 + "/>";
      s += '<path d="M50 91 L51.5 94 H54.5 L52 96 L53 99 L50 97 L47 99 L48 96 L45.5 94 H48.5 Z" fill="#dc2626"/>';
    }

    // item in hand
    if (a.item === "crumb") {
      s += '<circle cx="82" cy="88" r="6" fill="#d6a35c"' + ol25 + '/><circle cx="90" cy="80" r="3.5" fill="#d6a35c" stroke="' + OL + '" stroke-width="2"/>';
    } else if (a.item === "cha") {
      s += '<path d="M72 78 H90 V90 Q90 98 81 98 Q72 98 72 90 Z" fill="#ffffff"' + ol25 + "/>";
      s += '<rect x="74" y="80" width="14" height="4" fill="#b45309"/>';
      s += '<path d="M90 81 Q97 82 96 88 Q95 92 90 91"' + stroke(OL, 2.5) + "/>";
      s += '<path d="M78 74 Q76 70 79 67 M85 74 Q83 70 86 67"' + stroke(OL, 2) + ' opacity=".7"/>';
    } else if (a.item === "mega") {
      s += '<path d="M68 80 L90 66 V92 L68 86 Z" fill="#dc2626"' + ol25 + "/>";
      s += '<rect x="62" y="79" width="8" height="8" rx="2" fill="#fde047"' + ol25 + "/>";
      s += '<path d="M94 74 Q98 79 94 84"' + stroke(OL, 2.5) + "/>";
    } else if (a.item === "signsrc" || a.item === "signvote") {
      var vote = a.item === "signvote";
      s += '<path d="M84 70 V100"' + stroke(OL, 3) + "/>";
      s += '<rect x="68" y="55" width="30" height="16" rx="3" fill="' + (vote ? "#fde047" : "#ffffff") + '"' + ol25 + "/>";
      s += '<text x="83" y="67" text-anchor="middle" font-size="9" font-weight="700" font-family="Anton,Impact,sans-serif" fill="' + INK + '" textLength="' + (vote ? 18 : 22) + '" lengthAdjust="spacingAndGlyphs">' + (vote ? "VOTE" : "SOURCE?") + "</text>";
    }

    s += "</svg>";
    return s;
  }

  // A round avatar element. The ring changes with rank (0 Worker, 1 Scout, 2 Soldier).
  function make(av, seed, size, level) {
    var n = document.createElement("span");
    n.className = "av av-l" + (level === 1 || level === 2 ? level : 0);
    n.style.width = size + "px";
    n.style.height = size + "px";
    n.setAttribute("aria-hidden", "true");
    n.innerHTML = build(av, seed); // build() only emits fixed shapes and validated #rrggbb colours
    return n;
  }

  window.AntAvatar = {
    CATS: CATS,
    TIERS: TIERS,
    BODY: BODY,
    BG: BG,
    normalize: normalize,
    randomize: randomize,
    build: build,
    make: make,
    findCat: findCat
  };
})();
