# ✅ Comments & Validation System - Quick Start

## What You Have ✓

Your AMR database already has **fully implemented** comments and validation systems. Here's what's ready to use:

### Components Built
- ✅ `CommentsSection` - Full comment UI with add/edit/delete
- ✅ `CurationActions` - Approve/reject buttons for curators
- ✅ `StatusBadge` - Visual indicators for curated/rejected records
- ✅ All backend server actions
- ✅ Database schema and RLS policies (in migration file)

### Database Tables
- ✅ `amr_genes` - Already has `status` field (pending/curated/rejected)
- ✅ `amr_mutations` - Already has `status` field
- ✅ `curation_history` - Tracks all curation actions
- ✅ `curation_notes` - Stores curator notes
- ⏳ `comments` - **NEEDS TO BE CREATED** (one-time setup)

## One-Time Setup Required

### Create Comments Table (Choose One)

#### 🎯 Fastest: Copy-Paste SQL

1. Go to: https://app.supabase.com → Your Project → SQL Editor → New Query
2. Paste this:
```sql
CREATE TABLE IF NOT EXISTS comments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  target_type TEXT NOT NULL,
  target_id TEXT NOT NULL,
  user_id UUID,
  user_email TEXT,
  user_name TEXT,
  content TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE comments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read comments" ON comments FOR SELECT USING (true);
CREATE POLICY "Anyone can insert comments" ON comments FOR INSERT WITH CHECK (true);

CREATE INDEX IF NOT EXISTS comments_target_idx ON comments(target_type, target_id);
```
3. Click **Execute**
4. Done! ✅

#### Alternative: Run Script
```bash
cd b_KNfmUgaXkR6
node scripts/create-comments-table.mjs
```

## Using the Systems

### For End Users: Adding Comments
1. Go to any gene/mutation page
2. Scroll to "Comments" section
3. Type your comment
4. Click "Post"
5. Your comment appears instantly

### For Curators: Marking as Verified
1. Click the **✓** button to approve (mark as curated)
2. Click the **✗** button to reject
3. Optionally add a note
4. Record status updates

## File Locations

| Feature | File |
|---------|------|
| Comments UI | `components/comments/comments-section.tsx` |
| Curation UI | `components/curator/curation-actions.tsx` |
| Comment Actions | `lib/actions/comments.ts` |
| Curator Actions | `lib/actions/curator.ts` |
| Setup Guide | `VALIDATION_COMMENTS_GUIDE.md` |
| SQL Script | `scripts/comments-migration.sql` |

## Status Values

Records can have these values:
- **pending** - Not yet reviewed
- **curated** - Verified ✅
- **rejected** - Rejected ❌

## Verify Setup

After creating the comments table, test it:

1. Visit a gene detail page: `/browse/genes/[id]`
2. Scroll to Comments section
3. Add a test comment
4. Check Supabase Dashboard → Table Editor → `comments`
5. Your comment should appear there

## Troubleshooting

**"Error fetching comments"?**
- Comments table not created yet (follow setup above)

**Comments not showing?**
- Hard refresh browser (Ctrl+Shift+R)
- Check Supabase dashboard for errors

**Can't approve/reject?**
- You need to be logged in as a curator
- Your user must be in the `curators` table

## Ready to Go! 🚀

Everything is implemented and ready. Just create the comments table and you're done!

For more details, see: `VALIDATION_COMMENTS_GUIDE.md`
