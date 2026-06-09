import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('Missing Supabase environment variables');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function setupCurator() {
  try {
    console.log('Setting up curator account...');

    // Create or update the auth user
    const { data: authData, error: authError } = await supabase.auth.admin.createUser({
      email: 'asskulakis@gmail.com',
      password: 'Test123',
      email_confirm: true,
    });

    if (authError && !authError.message.includes('already exists')) {
      throw authError;
    }

    const userId = authData?.user?.id;
    if (!userId) {
      console.error('Failed to get user ID');
      process.exit(1);
    }

    console.log('Auth user created/updated:', userId);

    // Add or update curator record
    const { error: curatorError } = await supabase
      .from('curators')
      .upsert(
        {
          id: userId,
          email: 'asskulakis@gmail.com',
        },
        { onConflict: 'id' }
      );

    if (curatorError) {
      throw curatorError;
    }

    console.log('✅ Curator account setup complete!');
    console.log('Email: asskulakis@gmail.com');
    console.log('Password: Test123');
    console.log('');
    console.log('You can now login at: /curator/login');
  } catch (error) {
    console.error('Error setting up curator:', error);
    process.exit(1);
  }
}

setupCurator();
