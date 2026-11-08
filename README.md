# Ant Politics (v2: feed, comments, avatars)

Static site (no build) + Supabase. Files: index.html, style.css, config.js, avatar.js, app.js,
favicon.svg, vercel.json, supabase.sql.

## Upgrade order (do it in this order)
1. Supabase > SQL Editor > New query: paste ALL of supabase.sql and press Run. Safe to run again.
2. On GitHub, create config.js with your Project URL and anon public key
   (copy the same two values from your old app.js).
3. Upload/replace index.html, style.css, avatar.js, app.js (config.js too). Vercel redeploys.
4. Open the site, hard refresh.

## What is in
Infinite feed (Hot / New / Following / Sourced), chambers sidebar, icon menu, trails with
Agree / Disagree / Convince me, nested comments with agree, search, profiles, follow, ranks,
part-based ant avatar studio (rank-locked parts, checked by the database).

## Not built yet
Elections, Debate Arena, Rumor Hunt, Adda rooms (placeholder pages), moderation/report tools,
tunnels. Turn on CAPTCHA (Supabase > Authentication > Attack Protection) before a public launch.

Never put the service_role key anywhere in this site.
