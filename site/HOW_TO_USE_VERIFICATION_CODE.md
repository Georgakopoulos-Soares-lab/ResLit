# How to Use the Verification Code Box

The curator signup page now has a **verification code input box** that appears after you sign up.

## Step-by-Step Instructions

### 1. Go to Curator Signup
Navigate to: **http://localhost:3000/curator/signup**

### 2. Fill in Your Details
- **Full Name**: Your name (e.g., Dr. Jane Smith)
- **Institution**: Your organization (e.g., University of Athens)
- **Email**: Your email address (e.g., askoulakis@utexas.edu)
- **Password**: At least 8 characters

### 3. Click "Create Account"
You'll see a message: **"Verify your email"**

### 4. Check Your Email
Supabase will send you an email with a **6-digit verification code** (or a link).

Examples:
- Code: `123456`
- Or a confirmation link

### 5. Paste the Code (If You Received One)
If Supabase sent a code:
1. Return to the signup page (it should still show the verification form)
2. Look for the input field labeled **"Verification Code"**
3. Copy the 6-digit code from your email
4. Paste it into the box
5. Click **"Verify Email"**

### 6. You're In!
After verification, you'll be automatically:
- ✅ Logged in as a curator
- ✅ Redirected to the curator dashboard
- ✅ Added to the `curators` table

## What the Verification Code Box Looks Like

```
Verify your email

We sent a verification code to askoulakis@utexas.edu

Enter the 6-digit code from the email below. The code expires in 15 minutes.

┌─────────────────┐
│   [000000]      │  ← Paste your 6-digit code here
└─────────────────┘

[Verify Email] button
[Resend verification code] button

Wrong email? Go back and change it
```

## If Something Goes Wrong

### "Invalid verification code"
- Copy the code again from the email carefully
- Make sure there are no extra spaces
- The code expires in 15 minutes, so request a new one if needed

### "Verification code placeholder shows but nothing happens"
- Make sure you've entered exactly 6 digits
- Check that the email address is correct
- Clear browser cache and try again

### Didn't receive the code?
- Click **"Resend verification code"** button
- Check your spam/junk folder
- Verify your email address is correct in the form

### Want to use the email link instead?
- If Supabase sent a link in the email, just click it
- You'll be automatically logged in and redirected to the dashboard
- No need to enter the code

## Testing Locally

To test this feature:

1. Make sure you have `.env.local` with your Supabase credentials
2. Start the dev server: `pnpm dev`
3. Go to http://localhost:3000/curator/signup
4. Sign up with a test email
5. Check Supabase email (or console if using fake SMTP) for the code
6. Paste it and verify

## Technical Details

The verification process:
1. ✅ You sign up with email/password/name/institution
2. ✅ Supabase sends a verification code to your email
3. ✅ You enter the 6-digit code in the input box
4. ✅ The system verifies the code with Supabase
5. ✅ Automatically creates your curator record
6. ✅ Logs you in and redirects to dashboard

The input box:
- Only accepts 6 digits (0-9)
- Auto-cleans any non-digit characters
- Displays text larger for easy reading
- Verify button only enables when you have 6 digits
- Shows loading state while verifying
- Displays errors if verification fails

## See Also

- Signup page: `app/curator/signup/page.tsx`
- Callback handler: `app/auth/callback/route.ts`
- Curator actions: `lib/actions/curator.ts`
