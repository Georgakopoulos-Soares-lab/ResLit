# QWEN3 Data Import Instructions

This guide walks you through importing your QWEN3 AMR data into the ResLit database.

## 📋 Prerequisites

✅ Development server running (`pnpm dev`)  
✅ Supabase project set up and database migrations applied  
✅ Curator account created and authenticated  
✅ QWEN3 data file (QWEN3_small.txt or QWEN3_big.txt)

---

## Step 1: Verify Database Setup

### 1a. Run Supabase Migrations

The database schema must be set up first. Go to your Supabase dashboard:

1. Open https://app.supabase.com and select your project
2. Go to **SQL Editor** (left sidebar)
3. Click **New Query**
4. Open `supabase_migration.sql` from your project
5. Copy the **entire contents**
6. Paste into the Supabase SQL editor
7. Click **Run** and wait for completion

This creates:
- `papers` table - paper metadata
- `amr_genes` table - gene entries
- `amr_mutations` table - mutation entries
- `curators` table - curator accounts
- Views for filter dropdowns
- Row-Level Security (RLS) policies
- Indexes for performance

### 1b. Create Your Curator Account

If you haven't already, add yourself as a curator:

1. In Supabase SQL Editor, create a new query
2. Replace `<USER_ID>` with your Supabase auth user ID:

```sql
INSERT INTO curators (id, name, email, institution, role)
VALUES (
  '<YOUR_USER_ID>',
  'Your Name',
  'your.email@example.com',
  'Your Institution',
  'curator'
)
ON CONFLICT (id) DO NOTHING;
```

To find your user ID:
- Go to **Authentication** → **Users** in Supabase
- Click your user
- Copy the **User ID** value

3. Run the query

---

## Step 2: Authenticate as Curator

1. Go to http://localhost:3000/curator/login
2. Click **Sign In with Email** (or use OAuth if configured)
3. Enter your email and password
4. You should be redirected to the curator dashboard

If you get "Not authorized" error:
- Your curator account wasn't created in Step 1b
- Go back and add yourself to the `curators` table

---

## Step 3: Import QWEN3 Data

### Method A: Import via Web Interface (Recommended)

1. Go to http://localhost:3000/curator/import
2. Click the **QWEN3 Data** tab
3. Open the file `/home/argis/Desktop/austin/reslit/site/QWEN3_small.txt` in your text editor
4. Select all content (`Ctrl+A` or `Cmd+A`)
5. Copy the content (`Ctrl+C` or `Cmd+C`)
6. Back in the browser, paste into the textarea
7. Click **Import Data**
8. Wait for the import to complete

Expected output:
```
✓ Import successful
  - Papers processed: X
  - Genes imported: Y
  - Mutations imported: Z
```

### Method B: Extract JSON First (Optional)

If pasting large files is slow, extract JSON first:

```bash
cd /home/argis/Desktop/austin/reslit/site/b_KNfmUgaXkR6

# Analyze the file
node scripts/import-qwen3.js analyze ../QWEN3_small.txt

# Extract JSON to a separate file
node scripts/import-qwen3.js extract ../QWEN3_small.txt extracted.json

# Now paste extracted.json content into the import page
```

---

## Step 4: Review Import Results

After import completes, you'll see:

| Metric | Meaning |
|--------|---------|
| **Papers processed** | QWEN3 paper records found and inserted |
| **Genes imported** | Individual gene entries created |
| **Mutations imported** | Mutation records linked to genes |

**All imported data starts with status: "pending"** and requires your approval.

---

## Step 5: Approve Data in Curator Dashboard

1. Go to http://localhost:3000/curator/dashboard
2. You'll see **Pending Entries** list
3. Each entry shows:
   - Type (Gene or Mutation)
   - Name
   - Status
   - Paper/PMID
   - Related information

4. Click on an entry to review details
5. You can:
   - **✓ Approve** - Makes it visible to public users
   - **✗ Reject** - Hides from public view
   - **📝 Add Note** - Comment on the entry (optional)

### Bulk Approval

To quickly approve all entries:
1. Click the checkbox next to each entry
2. (Or use "Select All" if available)
3. Click "Approve Selected"

---

## Step 6: View Data on Website

### For Curated Data (Public)

1. Go to http://localhost:3000/browse/genes
   - Shows only **curated (approved)** genes
   - Includes search and filtering

2. Go to http://localhost:3000/browse/mutations
   - Shows only **curated (approved)** mutations
   - Includes PubMed links

### For Admin/Curator View (All)

In the curator dashboard, you can see:
- Pending entries awaiting approval
- Rejected entries
- All entry details
- Curation history

---

## Data Structure After Import

Your data will be organized as:

```
📄 Paper (PMID: 22660700)
  ├─ 🧬 Gene: aac(2')-IIa
  │  ├─ Allele: IIa
  │  ├─ Encodes: Kasugamycin 2′-N-acetyltransferase
  │  ├─ Mechanism: enzymatic_inactivation
  │  ├─ Confers resistance to: kasugamycin
  │  ├─ Organisms tested in: Burkholderia glumae, Acidovorax avenae
  │  └─ Validation method: Cloning, transformation, activity assays
  │
  └─ 🧬 Mutations (of aac(2')-IIa gene)
     └─ 🔬 S146T
        ├─ Type: substitution
        ├─ Position: 146
        ├─ Nucleotide change: T436A
        ├─ Protein change: S146T
        ├─ Effect: Increases MIC to kasugamycin
        └─ Origin: naturally_occurring
```

---

## Troubleshooting

### "Not authenticated" error
**Problem:** Import button shows authentication error  
**Solution:** 
- Go to /curator/login and sign in
- Verify your Supabase credentials in .env.local

### "Not authorized" / "Only curators can import"
**Problem:** Even after signing in, import is blocked  
**Solution:**
- You need to be in the `curators` table (Step 1b)
- Verify your user was added correctly

### "No valid QWEN3 records found"
**Problem:** Import page says it can't parse the data  
**Solution:**
- Make sure you copied the **entire** QWEN3 file
- File should contain sections like "Processing X/X: PMID XXXXX"
- Try using Method B to extract JSON first

### Import appears to hang
**Problem:** Import button is stuck loading  
**Solution:**
- For large files (>10MB), use Method B to extract JSON first
- Try importing a smaller subset first
- Check browser console for errors (F12)

### Database connection errors
**Problem:** Import fails with database errors  
**Solution:**
- Verify migrations were run (supabase_migration.sql)
- Check that RLS policies are enabled
- Verify .env.local has correct SUPABASE_URL and ANON_KEY
- Check Supabase dashboard for table creation

---

## What Happens During Import

1. **Parser** extracts JSON from QWEN3 output
2. **Papers** inserted into `papers` table
3. **Genes** inserted into `amr_genes` table with `status: 'pending'`
4. **Mutations** inserted into `amr_mutations` table with `status: 'pending'`
5. All foreign key relationships established
6. Curator receives notification of pending entries

### Database Flow

```
QWEN3 File
    ↓
Parser (parseQwen3Text)
    ↓
[{pmid, genes, mutations, ...}, ...]
    ↓
Insert Paper → pmid
    ↓
Insert Genes → gene_id, paper_pmid, status: pending
    ↓
Insert Mutations → mutation_id, gene_id, status: pending
    ↓
Available in curator dashboard ✓
    ↓
Curator approves
    ↓
Visible to public ✓
```

---

## Monitoring Imports

### Via Supabase Dashboard

1. Go to your Supabase project
2. Click **Table Editor**
3. Select each table to verify data:
   - `papers` - should have your PMID entries
   - `amr_genes` - should have gene entries with status 'pending'
   - `amr_mutations` - should have mutation entries

### Via SQL Queries

```sql
-- Count papers imported
SELECT COUNT(*) FROM papers;

-- Count pending genes
SELECT COUNT(*) FROM amr_genes WHERE status = 'pending';

-- See gene details
SELECT gene_name, resistance_mechanism_class, 
       confers_resistance_to, status 
FROM amr_genes 
WHERE status = 'pending'
LIMIT 10;

-- Count mutations by type
SELECT mutation_type, COUNT(*) as count 
FROM amr_mutations 
WHERE status = 'pending' 
GROUP BY mutation_type;
```

---

## Approving Data

### Single Entry Approval

1. Curator Dashboard → Click entry
2. Review all details
3. Click **✓ Approve**
4. Entry now visible to public

### Bulk Approval

For importing many papers, approve in batches:

1. Go to curator dashboard
2. Select entries to approve (checkboxes)
3. Click **Approve Selected**
4. Confirm the batch

---

## Next Steps

After importing data:

1. ✅ Navigate to http://localhost:3000/browse/genes
2. ✅ Use filters to search by antibiotic, organism, mechanism
3. ✅ Click PubMed links to verify paper citations
4. ✅ Download filtered data as CSV

---

## File Reference

| File | Purpose |
|------|---------|
| `QWEN3_small.txt` | Test dataset (~4 papers) |
| `QWEN3_big.txt` | Full dataset |
| `supabase_migration.sql` | Database schema & RLS |
| `lib/actions/import.ts` | Import functions |
| `app/curator/import/page.tsx` | Import UI |
| `app/curator/dashboard/page.tsx` | Curation interface |
| `.env.local` | Supabase credentials |

---

## Questions?

Check the [DATA_FORMAT_GUIDE.md](DATA_FORMAT_GUIDE.md) for detailed information about:
- Input data format and structure
- Database field mappings
- Allowed values for enums
- Complete examples

---

**Last Updated:** May 6, 2026  
**Status:** Ready for import ✓
