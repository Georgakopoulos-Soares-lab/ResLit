# AMR Database: Comments & Validation System

## Overview

Your AMR database now includes comprehensive **comments** and **validation** systems. Here's what you have:

### ✅ What's Already Implemented

#### 1. **Validation/Curation System**
- Records can be marked as: `pending`, `curated`, or `rejected`
- Curators can approve or reject genes and mutations
- Curation actions include optional notes
- Full audit trail in `curation_history` table
- Status badges display in the UI

**Files:**
- `components/curator/curation-actions.tsx` - UI buttons for curators
- `lib/actions/curator.ts` - Backend curation logic
- Database tables: `curation_history`, `curation_notes`

#### 2. **Comments System** 
- Users can add, edit, delete public comments
- Comments show author name, email, and timestamp
- Supports anonymous comments
- Comments belong to specific genes or mutations
- Real-time updates

**Files:**
- `components/comments/comments-section.tsx` - Comment UI
- `lib/actions/comments.ts` - Backend comment logic
- Database table: `comments` (needs to be created)

### 🔧 What Needs Setup

#### Create the Comments Table

The `comments` table needs to be created in your Supabase database. You can do this in two ways:

**Option 1: Manual SQL (Easiest)**

1. Go to [Supabase Dashboard](https://app.supabase.co) → Your Project
2. Click **SQL Editor** → **New Query**
3. Copy and paste this SQL:

```sql
CREATE TABLE IF NOT EXISTS comments (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  target_type       TEXT NOT NULL,
  target_id         TEXT NOT NULL,
  user_id           UUID,
  user_email        TEXT,
  user_name         TEXT,
  content           TEXT NOT NULL,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE comments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Anyone can read comments" ON comments;
DROP POLICY IF EXISTS "Anyone can insert comments" ON comments;

CREATE POLICY "Anyone can read comments"
  ON comments FOR SELECT USING (true);

CREATE POLICY "Anyone can insert comments"
  ON comments FOR INSERT WITH CHECK (true);

CREATE INDEX IF NOT EXISTS comments_target_idx 
  ON comments(target_type, target_id);
```

4. Click **Execute** ✓

**Option 2: Using Script**

```bash
cd b_KNfmUgaXkR6
node scripts/create-comments-table.mjs
```

### 📋 Database Schema

#### Comments Table
```
id              UUID (primary key)
target_type     TEXT ('gene' or 'mutation')
target_id       TEXT (gene/mutation ID)
user_id         UUID (optional, null for anonymous)
user_email      TEXT (commenter email)
user_name       TEXT (commenter name)
content         TEXT (comment content)
created_at      TIMESTAMP
updated_at      TIMESTAMP
```

#### Status Values (on amr_genes and amr_mutations)
- `pending` - New record, not yet reviewed
- `curated` - Verified by a curator
- `rejected` - Rejected by a curator

### 🎨 UI Components

#### CommentsSection Component
Shows comments and lets users add new ones:

```tsx
import { CommentsSection } from '@/components/comments/comments-section'
import { getComments } from '@/lib/actions/comments'

export default async function GeneDetailPage({ params }) {
  const comments = await getComments('gene', params.id)
  
  return (
    <>
      <h1>Gene Detail</h1>
      <CommentsSection
        targetType="gene"
        targetId={params.id}
        initialComments={comments}
      />
    </>
  )
}
```

#### CurationActions Component
Compact buttons for approve/reject (for curators):

```tsx
import { CurationActions } from '@/components/curator/curation-actions'

export default function GeneDetailPage({ params }) {
  return (
    <>
      <h1>Gene Detail</h1>
      <CurationActions
        type="gene"
        id={params.id}
        compact={true}
      />
    </>
  )
}
```

### 🔐 Permissions & Security

#### Comments
- **Read:** Anyone (public)
- **Write:** Anyone (anonymous or authenticated)
- **Edit:** Only comment author
- **Delete:** Only comment author

#### Curation
- **Read:** Anyone
- **Update Status:** Only authenticated curators
- **Curators:** Managed in `curators` table

### 🚀 How to Use

#### For End Users: Adding Comments

1. Navigate to a gene or mutation page
2. Scroll to "Comments" section
3. Enter your comment in the text box
4. Click "Post Comment"
5. Your comment appears immediately

#### For Curators: Marking as Curated

1. View a gene or mutation detail page
2. Click the green **✓** button to approve
3. Or click the red **✗** button to reject
4. Optionally add a note
5. The record status updates to "curated" or "rejected"

### ⚙️ Server Actions (Backend)

#### Comment Actions (`lib/actions/comments.ts`)

```typescript
// Get comments for a record
getComments(targetType: 'gene' | 'mutation', targetId: string): Promise<Comment[]>

// Add a new comment
addComment(targetType: 'gene' | 'mutation', targetId: string, content: string)

// Update a comment
updateComment(commentId: string, content: string)

// Delete a comment
deleteComment(commentId: string)
```

#### Curator Actions (`lib/actions/curator.ts`)

```typescript
// Get current curator info
getCurrentCurator(): Promise<Curator | null>

// Get curation statistics
getCuratorStats()

// Update gene status
updateGeneStatus(geneId: string, status: 'curated' | 'rejected', note?: string)

// Update mutation status  
updateMutationStatus(mutationId: string, status: 'curated' | 'rejected', note?: string)
```

### 📊 Monitoring Comments

1. Go to Supabase Dashboard
2. Select **Table Editor**
3. Click **comments** table
4. View all comments with timestamps and authors
5. Filter by `target_type` and `target_id`

### 🐛 Troubleshooting

#### Error: "Could not find the 'comments' table"

**Solution:** Apply the comments table migration (see Option 1 or 2 above)

#### Comments not showing

1. Verify the `comments` table exists in Supabase
2. Check browser console for errors (F12)
3. Ensure RLS policies are applied correctly
4. Try adding a comment to test

#### Can't mark as curated

1. Verify you're logged in as a curator
2. Check that your user ID is in the `curators` table
3. Verify your authentication is working

#### Changes not showing in UI

1. Hard refresh browser (Ctrl+Shift+R)
2. Check network tab in DevTools for errors
3. Verify data was saved in Supabase dashboard

### 📝 Files Modified/Created

**Modified:**
- `supabase_migration.sql` - Added comments table definition

**Created:**
- `COMMENTS_VALIDATION_SETUP.md` - Setup guide
- `scripts/comments-migration.sql` - Standalone migration SQL
- `scripts/create-comments-table.mjs` - Node.js migration script

**Already Existing:**
- `lib/actions/comments.ts` - Comment operations
- `lib/actions/curator.ts` - Curation operations
- `components/comments/comments-section.tsx` - Comment UI
- `components/curator/curation-actions.tsx` - Curation UI

### ✨ Next Steps

1. **Create the comments table** (see setup instructions above)
2. **Test adding a comment** on a gene/mutation page
3. **Set up curator permissions** if needed
4. **Monitor and manage comments** through the dashboard

---

**Need help?** Check the setup guide in `COMMENTS_VALIDATION_SETUP.md`
