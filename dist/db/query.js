export const signUpQuery = `INSERT INTO users (email, password_hash, is_verified, is_approved, verification_token, verification_token_expires_at)
       VALUES ($1, $2, FALSE, FALSE, $3, $4)
       RETURNING id, email`;
export const getOtpByEmail = `SELECT id, otp_hash, expires_at, attempts
       FROM login_otps
       WHERE email = $1
       ORDER BY created_at DESC
       LIMIT 1`;
export const insertOTP = `INSERT INTO login_otps (email, otp_hash, expires_at)
       VALUES ($1, $2, $3)`;
export const getUserByEmail = "SELECT id, email, password_hash, is_verified, is_approved FROM users WHERE email = $1";
export const updateProfileDetails = `UPDATE profile
         SET name = $1,
             gmail = $2,
             about = $3,
             tech_stack = $4,
             skills = $5,
             roles = $6,
             urls = $7
         WHERE id = $8
         RETURNING *`;
export const addProjectDetails = `INSERT INTO projects
       (profile_id, name, tools, description, image_url, image_public_id, video_url, video_public_id, live_link, github_url)
       VALUES (1, $1, $2, $3, $4, $5, $6, $7, $8, $9)
       RETURNING *`;
export const addProfileDetails = `
        INSERT INTO profile
          (user_id, name, gmail, about, profile_picture_url, tech_stack, skills, roles, urls, pdf_url)
        VALUES
          ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
        RETURNING *`;
export const deleteProjectSql = `
  DELETE FROM projects
  WHERE id = $1
  RETURNING *;
`;
export const updateProjectDetails = `
UPDATE projects SET
  name = COALESCE($2, name),
  tools = COALESCE($3, tools),
  description = COALESCE($4, description),
  image_url = COALESCE($5, image_url),
  image_public_id = COALESCE($6, image_public_id),
  video_url = COALESCE($7, video_url),
  video_public_id = COALESCE($8, video_public_id),
  live_link = COALESCE($9, live_link),
  github_url = COALESCE($10, github_url),
  updated_at = NOW(),
  pdf_url = COALESCE($7, pdf_url),
  pdf_public_id = COALESCE($8, pdf_public_id)
WHERE id = $1
RETURNING *;
`;
export const updateProfileSql = `
  UPDATE profile SET
    name = COALESCE($2, name),
    gmail = COALESCE($3, gmail),
    about = COALESCE($4, about),
    profile_picture_url = COALESCE($5, profile_picture_url),
    tech_stack = COALESCE($6, tech_stack),
    skills = COALESCE($7, skills),
    roles = COALESCE($8, roles),
    urls = COALESCE($9, urls),
    pdf_url = COALESCE($10, pdf_url),
    pdf_public_id = COALESCE($11, pdf_public_id),
    updated_at = NOW()
  WHERE user_id = $1
  RETURNING *;
`;
export const adminNotificationInsert = `INSERT INTO admin_notifications (user_id, type, payload) VALUES ($1, 'signup', $2)`;
