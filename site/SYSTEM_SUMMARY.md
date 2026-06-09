# 📋 AMR Database System Summary

## System Architecture

```
┌─────────────────────────────────────────────────────────┐
│              AMR Database System                         │
├─────────────────────────────────────────────────────────┤
│                                                           │
│  ┌──────────────────────────────────────────────────┐   │
│  │  DATA MANAGEMENT                                 │   │
│  ├──────────────────────────────────────────────────┤   │
│  │  • Genes (amr_genes)                             │   │
│  │  • Mutations (amr_mutations)                     │   │
│  │  • Papers (papers)                               │   │
│  │  • Curators (curators)                           │   │
│  └──────────────────────────────────────────────────┘   │
│                                                           │
│  ┌──────────────────────────────────────────────────┐   │
│  │  VALIDATION SYSTEM ✅                            │   │
│  ├──────────────────────────────────────────────────┤   │
│  │  Status: pending | curated | rejected            │   │
│  │  • curation_history - Audit trail                │   │
│  │  • curation_notes - Curator notes                │   │
│  │  • CurationActions component                     │   │
│  │  • Curator approval workflow                     │   │
│  └──────────────────────────────────────────────────┘   │
│                                                           │
│  ┌──────────────────────────────────────────────────┐   │
│  │  COMMENTS SYSTEM 💬                              │   │
│  ├──────────────────────────────────────────────────┤   │
│  │  ⏳ SETUP NEEDED: Create comments table          │   │
│  │  • Public comments on genes/mutations            │   │
│  │  • User tracking (name, email)                   │   │
│  │  • Edit/delete support                           │   │
│  │  • CommentsSection component                     │   │
│  │  • Real-time updates                             │   │
│  └──────────────────────────────────────────────────┘   │
│                                                           │
└─────────────────────────────────────────────────────────┘
```

## Quick Reference

### Data Flow

#### Adding a Comment
```
User Types Comment
    ↓
CommentsSection Component
    ↓
addComment() Server Action
    ↓
Insert into comments table
    ↓
Page Revalidates
    ↓
Comment Shows Immediately
```

#### Marking as Curated
```
Curator Clicks ✓
    ↓
CurationActions Component
    ↓
updateGeneStatus() Server Action
    ↓
Update amr_genes status
    ↓
Insert into curation_history
    ↓
Optionally insert into curation_notes
    ↓
Page Revalidates
    ↓
Status Updates on UI
```

## Implementation Status

### ✅ Complete
- [x] Gene and mutation database tables
- [x] Status field (pending/curated/rejected)
- [x] Curation history tracking
- [x] CurationActions UI component
- [x] Curator server actions
- [x] Comment server actions
- [x] CommentsSection UI component
- [x] RLS policies for all tables
- [x] Database indexes

### ⏳ Needs One-Time Setup
- [ ] Create comments table in Supabase
  - See: `QUICK_START_VALIDATION.md`
  - Takes: 2 minutes

### 📚 Documentation
- `QUICK_START_VALIDATION.md` - Start here! Quick setup guide
- `VALIDATION_COMMENTS_GUIDE.md` - Comprehensive guide
- `COMMENTS_VALIDATION_SETUP.md` - Detailed reference

## Key Features

### Comments
```
✅ Add comments to any gene/mutation
✅ Anonymous or authenticated
✅ Edit your own comments
✅ Delete your own comments
✅ Timestamps and user info
✅ Real-time display
```

### Validation/Curation
```
✅ Mark records as curated (verified)
✅ Reject records with reason
✅ Full audit trail
✅ Curator notes
✅ Status badges in UI
✅ Filter by status
```

## Database Tables

```
amr_genes
├── id (PK)
├── gene_name
├── status ← pending | curated | rejected
├── ... other fields

amr_mutations
├── id (PK)
├── gene_id (FK)
├── status ← pending | curated | rejected
├── ... other fields

curation_history ✓ (exists)
├── id (PK)
├── target_type
├── target_id
├── curator_id
├── action (approve/reject)
├── previous_status
├── new_status
└── timestamp

curation_notes ✓ (exists)
├── id (PK)
├── target_type
├── target_id
├── curator_id
├── note
└── timestamp

comments ⏳ (NEEDS SETUP)
├── id (PK)
├── target_type (gene/mutation)
├── target_id
├── user_id (optional)
├── user_email
├── user_name
├── content
├── created_at
└── updated_at
```

## User Flows

### For End Users
```
Browse Site
    ↓
Click on Gene/Mutation
    ↓
View Details
    ↓
See Comments Section
    ↓
Add Comment (Anonymous/Authenticated)
    ↓
See Your Comment Posted
```

### For Curators
```
Login as Curator
    ↓
View Gene/Mutation
    ↓
See Curation Buttons (✓ / ✗)
    ↓
Click Approve/Reject
    ↓
Optional: Add Note
    ↓
Confirm Action
    ↓
Status Updates
```

## Environment Variables

Your `.env.local` has:
```
NEXT_PUBLIC_SUPABASE_URL=https://...
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
```

Optional for migrations:
```
SUPABASE_SERVICE_ROLE_KEY=... (not required)
```

## Next Steps

1. **Setup** (2 minutes)
   - Open `QUICK_START_VALIDATION.md`
   - Follow the SQL copy-paste instructions
   - Create the comments table

2. **Test** (5 minutes)
   - Visit a gene page
   - Add a test comment
   - Approve/reject a record

3. **Deploy** (whenever ready)
   - No code changes needed
   - Everything works once comments table exists

## Support

- 🔍 Check `QUICK_START_VALIDATION.md` for setup
- 📖 Read `VALIDATION_COMMENTS_GUIDE.md` for details
- 🐛 See troubleshooting sections in guides
