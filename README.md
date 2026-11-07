# Ant Politics (tablet version)

A plain website plus Supabase. No Node, no npm, no terminal. Everything is done in a browser.

Files: `index.html`, `style.css`, `app.js`, `favicon.svg`, `vercel.json`, `supabase.sql`.

## Step 1: Supabase (about 10 minutes)

1. Open your Supabase project.
2. Turn on anonymous sign-ins: **Authentication**, then **Sign In / Providers** (or **Providers**), find **Anonymous** and switch **Allow anonymous sign-ins** on. Save.
3. Open **SQL Editor**, then **New query**. Paste the whole `supabase.sql` file and press **Run**. It should say success.
4. Check **Table Editor**: you should see `ants`, `chambers`, `trails`, `votes`, `follows`. The `chambers` table has 9 rows.
5. Get your keys: **Project Settings**, then **API** (or press **Connect**). Copy the **Project URL** and the **anon public** key (it may be called the publishable key).
   Never use the `service_role` or secret key in this website.

## Step 2: Put the keys into the website

1. Open `app.js` in any editor (on GitHub you can open the file and tap the pencil icon).
2. At the top, replace `PASTE_YOUR_PROJECT_URL_HERE` and `PASTE_YOUR_ANON_PUBLIC_KEY_HERE` with your two values. Keep the quote marks.
3. Save (on GitHub: **Commit changes**).

## Step 3: GitHub (anonymous)

1. Use a separate GitHub account with no real name, photo or personal email.
2. In GitHub **Settings, Emails**, turn on **Keep my email addresses private**.
3. Create a new repository, for example `ant-politics`.
4. **Add file, then Upload files**. Upload `index.html`, `style.css`, `app.js`, `favicon.svg` and `vercel.json`. Do NOT upload `supabase.sql` (it is not needed on the site, and it is fine to leave it out).
5. **Commit changes**.

## Step 4: Vercel

1. Sign in to Vercel with the same anonymous GitHub account.
2. **Add New**, then **Project**, and import your repository.
3. Framework Preset: **Other**. Leave every build setting empty. Press **Deploy**.
4. Open the link Vercel gives you. Tap **Join**, get an Ant ID, and post a trail.

## Updating later

Edit a file on GitHub (pencil icon), commit, and Vercel redeploys automatically in about a minute.

## If something breaks

- Page says "Almost there": you have not pasted the keys into `app.js` yet.
- "Anonymous sign-ins are disabled": repeat Step 1, part 2.
- "relation ... does not exist" or "permission denied": run `supabase.sql` again in the SQL Editor.
- Votes or posts fail: open the browser menu, find Developer tools if available, or tell me the exact message shown at the bottom of the screen.

## Honest limits

- There is no password. Your ant lives in your browser. If someone clears site data or taps Leave, that ant is gone. A recovery option can be added later.
- Someone could create many anonymous accounts. Turn on CAPTCHA in Supabase (**Authentication**, then **Attack Protection**) before a public launch.
- Supabase and Vercel keep their own logs (including IP addresses). Say the site "collects as little as possible", never "no logs".
- Google Fonts and the jsDelivr library are loaded from the internet, so those services can see visitor IPs.
- Soldier elections, moderation tools, Debate Arena and Adda rooms are not built yet.
- Operating a political platform carries legal duties in Bangladesh. Talk to a lawyer before a public launch.
