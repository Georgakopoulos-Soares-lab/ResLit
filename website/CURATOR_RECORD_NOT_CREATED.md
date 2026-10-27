# Why Curator Record Isn't Being Created

## The Issue

When you sign up:
1. ✅ User is created in **Authentication → Users** (auth.users)
2. ❌ But curator record is NOT created in **Table Editor → curators**

## Why This Happens

The curator record is **only created when you click the email verification link**.

### The Flow:
1. Sign up → User created in auth.users ✅
2. Email sent with verification link
3. You click the link → `/auth/callback` triggered
4. In callback: Curator record created ✅
5. You're redirected to dashboard

## Solution: Make Sure You Click the Email Link

1. Go to `/curator/signup`
2. Sign up with your email
3. **Check your email** for verification link
4. **Click the verification link** in the email
5. Wait for redirect to dashboard
6. NOW the curator record should appear in the `curators` table

## To Verify It Worked

1. Open Supabase Dashboard
2. Go to **SQL Editor**
3. Run this query:
   ```sql
   SELECT id, email, name FROM curators LIMIT 10;
   ```
4. You should see your record!

## If It Still Doesn't Appear

### Check 1: Did you actually click the email link?
- The link is required to verify your email
- Without clicking it, the callback isn't triggered

### Check 2: Is the callback working?
- Go to Supabase Dashboard
- **Logs** → Check for any errors on `/auth/callback`
- Should see successful execution

### Check 3: Check RLS Policies
- Go to **Authentication** → **Policies** → Find **curators** table
- Make sure policy **"Users can self-register as curator"** exists
- If not, run `supabase_add_curator_self_register.sql` in SQL Editor

## Manual Fix (If Policy Missing)

1. Go to Supabase Dashboard
2. Click **SQL Editor**
3. Click **New Query**
4. Paste this:
   ```sql
   DROP POLICY IF EXISTS "Users can self-register as curator" ON curators;
   CREATE POLICY "Users can self-register as curator"
     ON curators FOR INSERT
     WITH CHECK (auth.uid() = id);
   ```
5. Click **Run**

## Testing the Complete Flow

1. Sign up at `/curator/signup`
2. Get email with link
3. **Click the link** (this is important!)
4. Should redirect to dashboard
5. Check `curators` table in Supabase - your record should be there

The updated code now also:
- ✅ Creates curator record even if name is missing
- ✅ Uses email as default name
- ✅ Logs errors if record creation fails
- ✅ Doesn't break if RLS blocks the insert

Try signing up and **clicking the email link** - that's the key step! 🔑
