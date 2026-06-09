# One-Time Database Setup Guide

This is the **recommended approach**: Import your data once, then the website uses the database.

## 🚀 Complete Setup (Start to Finish)

### Step 1: Set Up Supabase Database Schema

1. Go to your Supabase project: https://app.supabase.com
2. Click **SQL Editor** (left sidebar)
3. Click **New Query**
4. Open and copy the entire contents of `supabase_migration.sql`
5. Paste into Supabase SQL Editor
6. Click **Run**
7. Wait for completion (creates tables, indexes, RLS policies)

### Step 2: Verify Environment Variables

Make sure `.env.local` has your Supabase credentials:

```env
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_anon_key_here
```

Find these in Supabase: **Settings** → **API** → **Project URL & Keys**

### Step 3: Run the Seed Script (One Command!)

```bash
cd /home/argis/Desktop/austin/reslit/site/b_KNfmUgaXkR6

# Import QWEN3_small.txt (test data)
node scripts/seed-database.js ../QWEN3_small.txt

# Or import the full dataset
node scripts/seed-database.js ../QWEN3_big.txt
```

The script will:
- ✓ Read the QWEN3 file
- ✓ Parse all JSON
- ✓ Import to database
- ✓ Auto-approve all entries
- ✓ Show results

Expected output:
```
📊 Results:
   Papers imported:    4
   Genes imported:     25
   Time taken:         3.2s

✅ Database is now ready to use!
```

### Step 4: Start Development Server

```bash
pnpm dev
```

Server runs at `http://localhost:3000`

### Step 5: View Your Data

Open in browser:
- Browse genes: http://localhost:3000/browse/genes
- Browse mutations: http://localhost:3000/browse/mutations
- Download data: http://localhost:3000/download

**Your data is already there, approved, and visible!** ✓

---

## 📊 What Happens

```
Run seed-database.js
        ↓
Parse QWEN3 file
        ↓
Insert into Supabase
        ↓
All entries auto-approved (status: curated)
        ↓
Data visible immediately on website
        ↓
Users browse directly from database
```

**No curator dashboard needed for approval** - everything is pre-approved!

---

## 💾 After Setup

### To Add More Data Later

Just run the seed script again with a different file:
```bash
node scripts/seed-database.js ../QWEN3_big.txt
```

It will add more data to the existing database.

### To Clear Database

(Rarely needed, but if you want to start fresh)

In Supabase SQL Editor:
```sql
-- Delete all imported data
DELETE FROM amr_mutations;
DELETE FROM amr_genes;
DELETE FROM papers;

-- Then run seed script again
```

---

## 🎯 Comparison: Two Approaches

### Approach 1: One-Time Seed (Recommended for You ✓)
```
$ node scripts/seed-database.js ../QWEN3_small.txt
✓ Done! Data in database
→ Website fetches from DB (fast)
→ QWEN3 file no longer needed
```

### Approach 2: Manual Import via Web UI
```
$ pnpm dev
→ Go to /curator/import
→ Paste file content manually
→ Approve in dashboard
→ More steps, slower
```

**You chose the right one!** The seed script is much faster and cleaner.

---

## ⚡ Quick Reference

| Command | Purpose |
|---------|---------|
| `node scripts/seed-database.js ../QWEN3_small.txt` | Import test data |
| `node scripts/seed-database.js ../QWEN3_big.txt` | Import full dataset |
| `pnpm dev` | Start website |

---

## ✅ Verification

After running the seed script, verify data is in database:

### Check in Supabase Dashboard
1. Go to your Supabase project
2. Click **Table Editor**
3. Select `papers` table → should see your PMIDs
4. Select `amr_genes` table → should see gene entries
5. Select `amr_mutations` table → should see mutations

### Check on Website
1. Open http://localhost:3000/browse/genes
2. Should see gene list with search/filter
3. Click on a gene to see details
4. Go to http://localhost:3000/browse/mutations
5. Should see mutation list

---

## 🔄 Update Existing Data

The seed script uses database `upsert`, which means:

```
If paper (PMID) already exists
  → Update it with new data
Else
  → Create new entry

If gene already exists
  → Create new entry (allows duplicates across papers)
```

So you can safely run the script multiple times without breaking anything.

---

## 📈 Performance

- **QWEN3_small.txt**: ~2-5 seconds to import
- **QWEN3_big.txt**: ~10-30 seconds to import
- After import: Website is **instant** (queries database, not files)

---

## 🎉 Done!

Your database is now seeded and ready to use. The website will:
- ✓ Start fast
- ✓ Load data from database (not files)
- ✓ Support search and filtering
- ✓ Allow downloads
- ✓ Display all your AMR data

**That's it! No more manual steps needed.**

---

**Created:** May 6, 2026  
**Status:** Ready to use ✓
