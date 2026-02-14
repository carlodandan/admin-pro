import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';

// Load environment variables
dotenv.config({ path: path.join(process.cwd(), '.env') });

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
    console.error('Supabase credentials missing. Please check .env file.');
}

// Create Supabase client
const supabase = createClient(supabaseUrl, supabaseKey, {
    auth: {
        persistSession: false, // For backend admin usage
        autoRefreshToken: false,
    }
});

export default supabase;
