import { createClient } from '@supabase/supabase-js';
import { Database } from '@/lib/database.types';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

// 导出 supabase 客户端，并指定 Database 类型，这样以后写代码会有自动提示！
export const supabase = createClient<Database>(supabaseUrl, supabaseAnonKey);