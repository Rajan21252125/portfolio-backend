import { pool } from "./postgreSQL.ts";
async function migrate() {
    await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id SERIAL PRIMARY KEY,
      email TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );
  `);
    await pool.query(`
    CREATE TABLE IF NOT EXISTS profile (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL,
      gmail TEXT NOT NULL,
      about TEXT NOT NULL,
      profile_picture_url TEXT,
      tech_stack TEXT[] DEFAULT '{}',
      skills TEXT[] DEFAULT '{}',
      roles TEXT[] DEFAULT '{}',
      urls JSONB DEFAULT '{}'::jsonb
    );
  `);
    await pool.query(`
    CREATE TABLE IF NOT EXISTS projects (
      id SERIAL PRIMARY KEY,
      profile_id INT REFERENCES profile(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      tools TEXT[] DEFAULT '{}',
      description TEXT NOT NULL,
      image_url TEXT,
      video_url TEXT,
      live_link TEXT,
      github_url TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );
  `);
    // table to store temporary OTPs for login verification
    await pool.query(`
    CREATE TABLE IF NOT EXISTS login_otps (
      id SERIAL PRIMARY KEY,
      email TEXT NOT NULL,
      otp_hash TEXT NOT NULL,          
      expires_at TIMESTAMPTZ NOT NULL,
      attempts INT DEFAULT 0,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );`);
    // -- index to quickly find by email
    await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_login_otps_email ON login_otps(email);
  `);
    // await pool.query(`
    //    ALTER TABLE projects
    //   ADD COLUMN image_public_id TEXT,
    //   ADD COLUMN video_public_id TEXT;
    // `)
    // await pool.query(`
    //    ALTER TABLE profile
    //   ADD COLUMN IF NOT EXISTS user_id INT REFERENCES users(id);
    //   CREATE UNIQUE INDEX IF NOT EXISTS ux_profile_user_id ON profile(user_id);
    // `)
    // await pool.query(`
    //   ALTER TABLE projects
    //   ADD COLUMN IF NOT EXISTS user_id INT REFERENCES users(id);
    //   CREATE UNIQUE INDEX IF NOT EXISTS ux_profile_user_id ON profile(user_id);
    // `)
    // await pool.query(`
    //   ALTER TABLE projects
    //   ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ;
    // `)
    // await pool.query(`
    //   ALTER TABLE profile
    //   ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ;
    // `)
    // await pool.query(`
    //   ALTER TABLE profile
    //   ADD COLUMN IF NOT EXISTS pdf_url TEXT;
    // `)
    // await pool.query(`
    //    ALTER TABLE profile
    //   ADD COLUMN pdf_public_id TEXT;
    // `)
    // await pool.query(`
    //   ALTER TABLE users
    //   ADD COLUMN IF NOT EXISTS is_verified BOOLEAN DEFAULT FALSE,
    //   ADD COLUMN IF NOT EXISTS is_approved BOOLEAN DEFAULT FALSE,
    //   ADD COLUMN IF NOT EXISTS verification_token TEXT,
    //   ADD COLUMN IF NOT EXISTS verification_token_expires_at TIMESTAMPTZ;
    // `)
    // await pool.query(`
    //   CREATE TABLE IF NOT EXISTS admin_notifications (
    //     id SERIAL PRIMARY KEY,
    //     user_id INT REFERENCES users(id) ON DELETE CASCADE,
    //     type TEXT NOT NULL,                 -- e.g. 'signup'
    //     payload JSONB DEFAULT '{}'::jsonb,  -- any extra data (email,name)
    //     read BOOLEAN DEFAULT FALSE,
    //     created_at TIMESTAMPTZ DEFAULT NOW()
    //   );
    // `)
    // await pool.query(`
    //   ALTER TABLE users
    //   ADD COLUMN IF NOT EXISTS is_admin BOOLEAN DEFAULT FALSE;
    // `)
    await pool.query(`
    ALTER TABLE users
    ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ;
  `);
    console.log("Migration completed!");
    pool.end();
}
migrate();
