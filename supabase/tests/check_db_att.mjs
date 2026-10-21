import { createClient } from '@supabase/supabase-js';
import fs from 'fs';

const env = fs.readFileSync('frontend/.env', 'utf8').split('\n').reduce((acc, line) => {
  const [k, ...v] = line.trim().split('=');
  if (k) acc[k] = v.join('=');
  return acc;
}, {});

const supabase = createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY);

async function check() {
  const { data: subjects, error: subjErr } = await supabase.from('subjects').select('id, name, doctor_name');
  if (subjErr) {
    console.error('Subj error:', subjErr);
    return;
  }
  console.log('Total subjects in DB:', subjects.length);

  let totalRows = 0;
  let from = 0;
  const attBySubject = {};
  while (true) {
    const { data, error } = await supabase.from('attendance').select('subject_id, week_number, status').range(from, from + 999);
    if (error) {
      console.error('Error fetching attendance:', error);
      break;
    }
    if (!data || data.length === 0) break;
    totalRows += data.length;
    for (const r of data) {
      const k = r.subject_id;
      if (!attBySubject[k]) attBySubject[k] = { total: 0, weeks: {} };
      attBySubject[k].total++;
      attBySubject[k].weeks[r.week_number] = (attBySubject[k].weeks[r.week_number] || 0) + 1;
    }
    if (data.length < 1000) break;
    from += 1000;
  }
  console.log('Total attendance rows in Supabase DB:', totalRows);

  for (const s of subjects) {
    const stats = attBySubject[s.id];
    if (stats) {
      console.log(`[HAS DATA] ${s.name} (${s.doctor_name}): Total ${stats.total} rows | Weeks:`, stats.weeks);
    } else {
      console.log(`[NO DATA ] ${s.name} (${s.doctor_name})`);
    }
  }
}

check();
