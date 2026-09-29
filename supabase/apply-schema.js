const fs = require("fs");
const path = require("path");
const { Client } = require("pg");

const projectId = "yteynpbwnmywoqfgrrxj";
const migrationsDir = path.join(__dirname, "migrations");

async function main() {
  const password = process.env.SUPABASE_DB_PASSWORD;

  if (!password) {
    throw new Error("SUPABASE_DB_PASSWORD is required.");
  }

  const migrationFiles = fs
    .readdirSync(migrationsDir)
    .filter((file) => file.endsWith(".sql"))
    .sort();

  if (migrationFiles.length === 0) {
    throw new Error("No SQL migration files found.");
  }

  const client = new Client({
    host: `db.${projectId}.supabase.co`,
    port: 5432,
    database: "postgres",
    user: "postgres",
    password,
    ssl: { rejectUnauthorized: false },
  });

  await client.connect();

  for (const file of migrationFiles) {
    const sql = fs.readFileSync(path.join(migrationsDir, file), "utf8");
    await client.query(sql);
    console.log(`Applied ${file}`);
  }

  const tables = await client.query(`
    select table_name
    from information_schema.tables
    where table_schema = 'public'
      and table_name in (
        'staff_profiles',
        'event_tables',
        'guest_parties',
        'import_batches',
        'guests',
        'attendance_events',
        'audit_log',
        'event_assets',
        'feedback_links',
        'app_settings'
      )
    order by table_name
  `);

  const views = await client.query(`
    select table_name
    from information_schema.views
    where table_schema = 'public'
      and table_name in (
        'dashboard_attendance_summary',
        'category_attendance_summary',
        'table_attendance_summary'
      )
    order by table_name
  `);

  const functions = await client.query(`
    select proname
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and proname in (
        'claim_first_admin',
        'record_attendance_action',
        'record_party_attendance_action'
      )
    order by proname
  `);

  await client.end();

  console.log(JSON.stringify({
    tables: tables.rows.map((row) => row.table_name),
    views: views.rows.map((row) => row.table_name),
    functions: functions.rows.map((row) => row.proname),
  }, null, 2));
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
