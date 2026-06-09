# Quick Reference Guide

## 🏃 Super Quick Start (TL;DR)

### Prerequisites (One-time setup)
```bash
# 1. Database setup in Supabase
# - Go to SQL Editor
# - Run: supabase_migration.sql
# - Wait for completion

# 2. Create curator account
# INSERT INTO curators (id, name, email, institution, role)
# VALUES ('<USER_ID>', 'Name', 'email@domain.com', 'Org', 'curator');

# 3. Start server
cd /home/argis/Desktop/austin/reslit/site/b_KNfmUgaXkR6
pnpm dev
```

### To Import Data (Every time)
```
1. Go to http://localhost:3000/curator/login
2. Sign in
3. Go to http://localhost:3000/curator/import
4. Paste QWEN3_small.txt or QWEN3_big.txt content
5. Click "Import Data"
6. Go to http://localhost:3000/curator/dashboard
7. Approve entries
8. Browse at http://localhost:3000/browse/genes or /mutations
```

---

## 📍 Key URLs

| Page | URL | Purpose |
|------|-----|---------|
| Home | http://localhost:3000 | Landing page with stats |
| Browse Genes | http://localhost:3000/browse/genes | Search/filter genes |
| Browse Mutations | http://localhost:3000/browse/mutations | Search/filter mutations |
| Download | http://localhost:3000/download | Export as CSV |
| Curator Login | http://localhost:3000/curator/login | Authenticate |
| Curator Import | http://localhost:3000/curator/import | Import data |
| Curator Dashboard | http://localhost:3000/curator/dashboard | Approve entries |

---

## 📁 Important Files

| File | Location | Purpose |
|------|----------|---------|
| QWEN3 Small | `/home/argis/Desktop/austin/reslit/site/QWEN3_small.txt` | Test dataset |
| QWEN3 Big | `/home/argis/Desktop/austin/reslit/site/QWEN3_big.txt` | Full dataset |
| Database Schema | `b_KNfmUgaXkR6/supabase_migration.sql` | DB setup |
| Import Logic | `b_KNfmUgaXkR6/lib/actions/import.ts` | Import functions |
| Import UI | `b_KNfmUgaXkR6/app/curator/import/page.tsx` | Web interface |
| Credentials | `b_KNfmUgaXkR6/.env.local` | Supabase keys |

---

## 🔑 Key Commands

```bash
# Start development server
pnpm dev

# Build for production
pnpm build

# Run linter
pnpm lint

# Analyze QWEN3 file
node scripts/import-qwen3.js analyze ../QWEN3_small.txt

# Extract JSON from QWEN3
node scripts/import-qwen3.js extract ../QWEN3_small.txt data.json
```

---

## 💾 Database Tables

| Table | Contains | Status Field |
|-------|----------|--------------|
| papers | Paper metadata (PMID, findings, methods) | - |
| amr_genes | Gene entries | pending / curated / rejected |
| amr_mutations | Mutation entries | pending / curated / rejected |
| curators | Curator accounts | - |
| comments | Public comments | - |
| curation_notes | Curator review notes | - |
| curation_history | Audit log of changes | - |

---

## 🔍 Useful SQL Queries

```sql
-- Count pending genes
SELECT COUNT(*) FROM amr_genes WHERE status = 'pending';

-- See pending genes
SELECT gene_name, status FROM amr_genes 
WHERE status = 'pending' LIMIT 10;

-- Count genes by mechanism
SELECT resistance_mechanism_class, COUNT(*) as count 
FROM amr_genes WHERE status = 'curated' 
GROUP BY resistance_mechanism_class;

-- See all genes for a paper
SELECT gene_name FROM amr_genes WHERE paper_pmid = '22660700';

-- Count mutations by type
SELECT mutation_type, COUNT(*) as count 
FROM amr_mutations WHERE status = 'curated' 
GROUP BY mutation_type;
```

---

## 🎨 Frontend Routes

```
/                          Home page with statistics
/about                     About page
/browse/genes              Gene browsing interface
/browse/mutations          Mutation browsing interface
/download                  Data download/export
/collaborators             Team/collaborators page
/auth/login               Authentication
/auth/callback            OAuth callback
/auth/error               Auth error page
/curator/login            Curator login
/curator/import           Data import interface
/curator/dashboard        Curation interface
```

---

## 📊 Import Status Flow

```
New Import
    ↓
status: 'pending'  ← Awaiting curator review
    ↓
Curator clicks "Approve"
    ↓
status: 'curated'  ← Visible to all users
    ↓
Appears in /browse/genes or /browse/mutations

Alternative:
Curator clicks "Reject"
    ↓
status: 'rejected'  ← Hidden from public
```

---

## 🔐 Roles

### Public User
- View curated genes and mutations
- Search and filter
- Download data
- Add comments
- No approval permissions

### Curator
- All public permissions +
- Login required
- View pending entries
- Approve/reject entries
- Add curation notes
- Track history

### Admin
- All curator permissions +
- User management
- System configuration

---

## ⚠️ Common Errors & Fixes

```
ERROR: "Not authenticated"
FIX: Login at /curator/login

ERROR: "Not authorized"
FIX: Add to curators table

ERROR: "No valid QWEN3 records found"
FIX: Use complete QWEN3 file (not excerpt)

ERROR: Database connection failed
FIX: Run supabase_migration.sql first

ERROR: Empty browse pages
FIX: Approve entries in curator dashboard
```

---

## 📈 What Gets Created Per Import

For each QWEN3 file imported:

- **1 Paper entry** (with PMID, findings, methods)
- **Multiple Gene entries** (usually 3-10+ per paper)
- **Multiple Mutation entries** (usually 5-50+ per paper)
- **All linked together** via foreign keys
- **All marked pending** for curator review

Example result:
```
Papers: +1
Genes: +7
Mutations: +23
```

---

## 🎯 Typical Workflow

1. **Import** → Paste QWEN3 data
2. **Review** → See pending in dashboard
3. **Approve** → Mark as curated
4. **Publish** → Shows on website
5. **Browse** → Users can search
6. **Download** → Export as CSV
7. **Repeat** → Import more data

---

## 📱 Features Available

- ✅ Full-text search on genes and mutations
- ✅ Multiple filter options (antibiotic, organism, mechanism, year, country)
- ✅ Table and card views
- ✅ Pagination for large datasets
- ✅ PubMed links to original papers
- ✅ CSV export with filters
- ✅ Public comments and discussion
- ✅ Curator workflow and approval
- ✅ Curation history and audit trail
- ✅ Role-based access control

---

## 🚀 Performance Tips

- Import small files first to test
- Extract JSON for files >10MB
- Approve in batches to speed up curation
- Use filters to narrow browse results
- Build indexes with Supabase for large datasets

---

## 📞 Need Help?

1. **Data Format:** See [DATA_FORMAT_GUIDE.md](DATA_FORMAT_GUIDE.md)
2. **Import Steps:** See [IMPORT_INSTRUCTIONS.md](IMPORT_INSTRUCTIONS.md)
3. **Full Setup:** See [SETUP_COMPLETE.md](SETUP_COMPLETE.md)
4. **Project Overview:** See [README.md](README.md)

---

**Last Updated:** May 6, 2026  
**Ready to Import:** ✅ Yes
