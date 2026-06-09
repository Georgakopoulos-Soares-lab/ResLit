# ✅ Implementation Checklist

## Comments & Validation System Status

### 🎯 Completed (Ready to Use)

- [x] **Database Schema**
  - Status field on genes and mutations
  - Curation history tracking
  - Migration SQL created

- [x] **Backend (Server Actions)**
  - `lib/actions/comments.ts` - Full CRUD operations
  - `lib/actions/curator.ts` - Curation workflow
  - All error handling implemented
  - Revalidation paths configured

- [x] **Frontend (UI Components)**
  - `CommentsSection` - Add/edit/delete comments
  - `CurationActions` - Approve/reject buttons
  - `StatusBadge` - Visual status indicators
  - Responsive design

- [x] **Security (RLS Policies)**
  - Comments: Public read, anyone can post
  - Genes: Public read, curator-only updates
  - Mutations: Public read, curator-only updates

- [x] **Documentation**
  - Setup guide created
  - Quick start guide created
  - Comprehensive guide created
  - System architecture documented

### ⏳ Needs One-Time Setup

- [ ] **Create Comments Table**
  - Run: SQL from `QUICK_START_VALIDATION.md`
  - Time: ~2 minutes
  - Location: Supabase → SQL Editor

- [ ] **Test Comments Feature**
  - Add a test comment
  - Verify it saves to database
  - Verify it displays on page

- [ ] **Test Curation Feature** (optional)
  - Setup curator account (if needed)
  - Test approve/reject
  - Verify status updates

## Setup Instructions

### Step 1: Create Comments Table
```
✅ Go to Supabase Dashboard
✅ Click: SQL Editor → New Query
✅ Paste SQL from: QUICK_START_VALIDATION.md
✅ Click: Execute
✅ Done!
```

### Step 2: Verify Setup
```
✅ Go to: Table Editor → comments
✅ Should see empty table with columns
✅ Verify columns:
   - id, target_type, target_id
   - user_id, user_email, user_name
   - content, created_at, updated_at
```

### Step 3: Test
```
✅ Visit gene page: /browse/genes/[id]
✅ Find Comments section at bottom
✅ Add test comment
✅ Check Supabase → comments table
✅ Comment should appear there
```

## File Inventory

### Documentation Files
- ✅ `QUICK_START_VALIDATION.md` - START HERE
- ✅ `VALIDATION_COMMENTS_GUIDE.md` - Comprehensive guide
- ✅ `COMMENTS_VALIDATION_SETUP.md` - Reference
- ✅ `SYSTEM_SUMMARY.md` - Architecture overview
- ✅ `IMPLEMENTATION_CHECKLIST.md` - This file

### Code Files (Already Complete)
- ✅ `lib/actions/comments.ts` - 127 lines
- ✅ `lib/actions/curator.ts` - 321 lines
- ✅ `components/comments/comments-section.tsx` - 218 lines
- ✅ `components/curator/curation-actions.tsx` - 211 lines
- ✅ `lib/types.ts` - All types defined

### Script Files
- ✅ `scripts/comments-migration.sql` - Standalone SQL
- ✅ `scripts/create-comments-table.mjs` - Node.js script
- ✅ `supabase_migration.sql` - Full schema (updated)

## Features by Component

### CommentsSection
- [x] Display comments
- [x] Add new comment
- [x] Edit own comment
- [x] Delete own comment
- [x] Show author/timestamp
- [x] Pagination/loading states

### CurationActions
- [x] Approve button (✓)
- [x] Reject button (✗)
- [x] Optional notes
- [x] Confirmation dialog
- [x] Loading states
- [x] Error handling

### StatusBadge
- [x] Pending badge (gray)
- [x] Curated badge (green)
- [x] Rejected badge (red)

## Database Tables Status

| Table | Status | Purpose |
|-------|--------|---------|
| amr_genes | ✅ Ready | Gene data with status |
| amr_mutations | ✅ Ready | Mutation data with status |
| papers | ✅ Ready | Paper metadata |
| curators | ✅ Ready | Curator accounts |
| curation_history | ✅ Ready | Audit trail |
| curation_notes | ✅ Ready | Curator notes |
| comments | ⏳ Setup | Public comments |

## Testing Checklist

### Before Going Live
- [ ] Comments table created
- [ ] Can add a comment
- [ ] Comment appears in table
- [ ] Comment displays on page
- [ ] Can edit comment
- [ ] Can delete comment
- [ ] Timestamps work
- [ ] User info saves
- [ ] Curator can approve/reject
- [ ] Status updates on UI
- [ ] Curation notes save
- [ ] No console errors

## Success Criteria

✅ All Complete When:
1. Comments table created in Supabase
2. Can add comment to gene → appears in table ✓
3. Can add comment to mutation → appears in table ✓
4. Can approve record as curator ✓
5. Status changes to "curated" on UI ✓
6. Can see all comments in table ✓
7. Edit/delete comments works ✓
8. No error messages in console ✓

## Rollout Plan

**Phase 1** (Day 1)
- Create comments table
- Test commenting feature
- Verify no errors

**Phase 2** (Day 2)
- Enable curation workflows
- Train curators on approval process
- Monitor for issues

**Phase 3** (Day 3+)
- Full production use
- Monitor database performance
- Collect user feedback

## Troubleshooting Quick Links

| Issue | Solution |
|-------|----------|
| "Could not find 'comments' table" | Run setup SQL (QUICK_START_VALIDATION.md) |
| Comments not showing | Hard refresh + check table exists |
| Can't add comment | Check RLS policies applied |
| Can't approve/reject | Verify curator login + user in curators table |
| Slow performance | Check indexes created in SQL |

## Support Resources

- **Quick Help**: `QUICK_START_VALIDATION.md`
- **Full Guide**: `VALIDATION_COMMENTS_GUIDE.md`
- **Architecture**: `SYSTEM_SUMMARY.md`
- **Reference**: `COMMENTS_VALIDATION_SETUP.md`

---

## Sign-Off

- [x] All backend code complete
- [x] All frontend components complete
- [x] Database schema defined
- [x] RLS policies configured
- [x] Documentation written
- [x] Setup scripts created
- ⏳ Comments table setup (pending)
- ⏳ Production testing (pending)

**Status**: Ready for deployment after comments table setup ✅
