import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || 'https://bbdyexsaqnlremprfmph.supabase.co';
const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY || 'sb_publishable_7lextLm1cEOuRlz4XMiV9w_F01aZaho';

export const supabase = createClient(supabaseUrl, supabaseKey);
