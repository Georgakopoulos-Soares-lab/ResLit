# ⚡ COMPLETE SETUP IN 5 MINUTES

Follow these steps to get your site running with data loaded.

## Step 1: Database Setup (Supabase)

1. Open your Supabase project: https://app.supabase.com
2. Go to **SQL Editor** → **New Query**
3. Copy and paste the entire file: `supabase_migration.sql`
4. Click **Run** and wait

✓ Done. Database tables are created.

## Step 2: Check Environment Variables

Your `.env.local` file in the project folder should have:

```env
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_key_here
```

Copy these from Supabase: **Settings** → **API**

✓ If already set, skip this.

## Step 3: Import Your Data (One Command!)

```bash
cd /home/argis/Desktop/austin/reslit/site/b_KNfmUgaXkR6
node scripts/seed-database.js ../QWEN3_small.txt
```

Wait for it to finish (shows "✅ Database is now ready to use!")

✓ All your data is now in the database, approved and ready.

## Step 4: Start the Website

```bash
pnpm dev
```

Open http://localhost:3000

✓ Your site is running with all data loaded!

## Step 5: Browse Your Data

- **Genes:** http://localhost:3000/browse/genes
- **Mutations:** http://localhost:3000/browse/mutations
- **Download:** http://localhost:3000/download

✓ All data is searchable, filterable, and ready to use.

---

## 🎉 That's It!

Your website is complete and working. The database contains all your AMR data.

Next time you start, just run `pnpm dev` - no re-importing needed!

---

## 📚 Optional: Full Setup Info

See **SEED_DATABASE.md** for more details about the one-time seed approach.

---

**Status:** ✅ Ready to use
