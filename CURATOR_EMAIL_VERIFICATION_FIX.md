# Curator Email Verification Fix

## Problem
When signing up as a curator, you were receiving:
- **"Check your email"** message in the UI
- **But Supabase sent a verification code instead of an email link**

This caused confusion because the UI expected a link-based flow, but Supabase was using OTP (One-Time Password) verification.

## Solution
The curator signup page (`app/curator/signup/page.tsx`) has been updated to handle **both scenarios**:

### Scenario 1: Email Link Flow (Default)
If Supabase is configured for email confirmation links:
1. You click "Create Account"
2. You receive an email with a confirmation link
3. Click the link and you're automatically logged in
4. UI shows: **"Check your email"** (link-based)

### Scenario 2: OTP Code Flow (New)
If Supabase sends an OTP code instead:
1. You click "Create Account"
2. You receive an email with a 6-digit code
3. You enter the code in the "Verify your email" form
4. Your account is verified and you're logged in
5. UI shows: **"Verify your email"** (code-based)

## How to Use

### If you received a code in your email:
1. Look for the **6-digit verification code** in the email
2. Return to the signup page if redirected
3. You'll see a form asking for the verification code
4. Enter the code and click "Verify Email"
5. You'll be automatically logged in and redirected to the dashboard

### If you received a link in your email:
1. Simply **click the link** in the email
2. You'll be automatically logged in and redirected to the dashboard
3. No additional steps needed

### If you didn't receive anything:
- Click **"Resend"** button to get a new code or link
- Check your spam/junk folder
- Make sure you entered the correct email address

## What Changed

### New Features:
- ✅ Automatic detection of OTP vs Link flow
- ✅ OTP verification form with 6-digit code input
- ✅ Automatic curator record creation after verification
- ✅ Better error messages for both flows
- ✅ Code validation (only accepts digits)

### Files Modified:
- `app/curator/signup/page.tsx` - Enhanced signup flow

### Technical Details:
- The signup response from Supabase tells us which flow to use
- If `session` exists in response → email link was sent
- If only `user` exists → OTP code was sent
- For OTP: We call `verifyOtp()` with the code
- For Email Link: You click the link and hit `/auth/callback`
- Both flows auto-create a curator record on success

## Troubleshooting

### "Code is invalid"
- Make sure you copied the full 6-digit code
- The code expires in 15 minutes
- Try requesting a new code

### "Invalid email"
- Make sure the email is spelled correctly
- Check if it's in your spam folder
- Try resending the code

### Still on email check screen?
- You may have clicked "Back" after sign-up
- Refresh the page to check if the link worked
- Or enter your code if you received one

## Questions?
Check the email you received - it should have instructions specific to your authentication method.
