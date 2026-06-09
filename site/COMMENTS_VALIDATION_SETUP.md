# Comments and Validation System Setup

This guide explains how to set up the comments and validation system for the AMR database.

## System Overview

The AMR database now includes two key features:

### 1. **Curation/Validation System**
- Records have a `status` field: `pending`, `curated`, or `rejected`
- Authorized curators can mark records as curated (verified) or rejected
- Curated records are highlighted in the UI
- Implemented via `CurationActions` component and `curator` actions

### 2. **Comments System**
- Users can add public comments to genes and mutations
- Comments are stored in the `comments` table
- Comments include user info (name, email) and timestamp
- Implemented via `CommentsSection` component and `comments` actions

## Database Setup

### Step 1: Create the Comments Table

You need to manually apply the comments table migration to your Supabase database. There are two ways to do this:

#### Option A: Using Supabase Dashboard (Recommended)

1. Go to [Supabase Dashboard](https://app.supabase.com/)
2. Select your project
3. Go to **SQL Editor**
4. Create a new query and copy the contents of `scripts/comments-migration.sql`
5. Execute the query

#### Option B: Using SQL Files

The migration is already included in `supabase_migration.sql`. If you haven't applied this yet:

1. Go to **SQL Editor** in Supabase Dashboard
2. Copy the entire contents of `supabase_migration.sql`
3. Execute it

### Step 2: Verify the Tables

Check that the tables were created successfully:

```sql
-- Check comments table
SELECT table_name FROM information_schema.tables 
WHERE table_schema = 'public' AND table_name = 'comments';

-- Check columns
SELECT column_name, data_type FROM information_schema.columns 
WHERE table_name = 'comments';
```

## UI Components

### Comments Section

Located: `components/comments/comments-section.tsx`

Usage in a page:
```tsx
import { CommentsSection } from '@/components/comments/comments-section'
import { getComments } from '@/lib/actions/comments'

export default async function GenePage({ params }) {
  const comments = await getComments('gene', params.id)
  
  return (
    <CommentsSection
      targetType="gene"
      targetId={params.id}
      initialComments={comments}
    />
  )
}
```

### Curation Actions

Located: `components/curator/curation-actions.tsx`

Usage in a page (for curators only):
```tsx
import { CurationActions } from '@/components/curator/curation-actions'

export default function GenePage({ params }) {
  return (
    <CurationActions
      type="gene"
      id={params.id}
      compact={true}
      onSuccess={() => {
        // Refresh page or update UI
      }}
    />
  )
}
```

## Server Actions

### Comments Actions

File: `lib/actions/comments.ts`

- `getComments(targetType, targetId)` - Fetch comments
- `addComment(targetType, targetId, content)` - Add a new comment
- `updateComment(id, content)` - Update a comment
- `deleteComment(id)` - Delete a comment

### Curator Actions

File: `lib/actions/curator.ts`

- `updateGeneStatus(id, status, note?)` - Update gene status
- `updateMutationStatus(id, status, note?)` - Update mutation status

## Status Values

Records can have these status values:

- **pending** - New record, not yet verified
- **curated** - Verified by a curator
- **rejected** - Curator has rejected this record

## Permissions

### Comments
- Anyone can read comments
- Anyone can add comments (anonymous or authenticated)
- Users can edit/delete their own comments

### Curation
- Only authenticated curators can update status
- Curator list is managed in the `curators` table

## Next Steps

1. Apply the comments table migration via SQL Editor
2. Test adding a comment in the UI
3. Test curator actions if you're an admin
4. Monitor comments in the Supabase Dashboard under the `comments` table

## Troubleshooting

### Error: "Could not find the 'comments' table"

**Solution:** You need to apply the migration. Go to SQL Editor and run `scripts/comments-migration.sql`

### Comments not showing up

**Solution:** 
1. Check that the `comments` table exists in Supabase
2. Verify RLS policies are set correctly
3. Check browser console for errors

### Can't update curation status

**Solution:**
1. Verify you're logged in as a curator
2. Check the `curators` table has your user ID
3. Check RLS policies on the `amr_genes` table

## Files Involved

- `supabase_migration.sql` - Full schema including comments table
- `lib/actions/comments.ts` - Comment server actions
- `lib/actions/curator.ts` - Curation server actions
- `components/comments/comments-section.tsx` - UI for comments
- `components/curator/curation-actions.tsx` - UI for curation
- `lib/types.ts` - TypeScript interfaces
