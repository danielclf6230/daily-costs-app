import dotenv from "dotenv";
dotenv.config();
import { makePool } from "./db.js";

const pool = makePool();
const initialTrip = JSON.stringify({
  tripName: "Our Tokyo Adventure", startDate: "", endDate: "", shopping: [],
  days: [], travelers: [], notes: "",
});

try {
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    await connection.query("CREATE TABLE IF NOT EXISTS trip_users LIKE users");
    await connection.query(`INSERT IGNORE INTO trip_users (id, name, password, avatarUrl, bannerUrl, created_at)
      SELECT id, name, password, avatarUrl, bannerUrl, created_at FROM users`);
    const [roleColumns] = await connection.query("SHOW COLUMNS FROM trip_users LIKE 'role'");
    if (!roleColumns.length) await connection.query("ALTER TABLE trip_users ADD COLUMN role ENUM('admin', 'user') NOT NULL DEFAULT 'user' AFTER password");
    await connection.execute("UPDATE trip_users SET name = 'daniel.chow', role = 'admin' WHERE name = 'daniel'");
    await connection.execute("UPDATE trip_users SET role = 'admin' WHERE name = 'daniel.chow'");
    await connection.query(`CREATE TABLE IF NOT EXISTS trip_tools_trips (
      id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
      owner_user_id INT NOT NULL,
      trip_data JSON NOT NULL,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      CONSTRAINT fk_trip_owner FOREIGN KEY (owner_user_id) REFERENCES trip_users(id) ON DELETE RESTRICT
    )`);
    await connection.query(`CREATE TABLE IF NOT EXISTS trip_tools_members (
      trip_id INT NOT NULL,
      user_id INT NOT NULL,
      role ENUM('owner', 'member') NOT NULL DEFAULT 'member',
      joined_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (trip_id, user_id),
      CONSTRAINT fk_member_trip FOREIGN KEY (trip_id) REFERENCES trip_tools_trips(id) ON DELETE CASCADE,
      CONSTRAINT fk_member_user FOREIGN KEY (user_id) REFERENCES trip_users(id) ON DELETE CASCADE
    )`);
    await connection.query(`CREATE TABLE IF NOT EXISTS trip_tools_invites (
      id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
      trip_id INT NOT NULL,
      code VARCHAR(32) NOT NULL UNIQUE,
      created_by INT NOT NULL,
      expires_at DATETIME NOT NULL,
      used_by INT NULL,
      used_at DATETIME NULL,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT fk_invite_trip FOREIGN KEY (trip_id) REFERENCES trip_tools_trips(id) ON DELETE CASCADE,
      CONSTRAINT fk_invite_creator FOREIGN KEY (created_by) REFERENCES trip_users(id) ON DELETE CASCADE,
      CONSTRAINT fk_invite_user FOREIGN KEY (used_by) REFERENCES trip_users(id) ON DELETE SET NULL
    )`);
    await connection.query(`CREATE TABLE IF NOT EXISTS trip_tools_migrations (
      migration_key VARCHAR(100) NOT NULL PRIMARY KEY,
      applied_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`);

    const [memberIndexes] = await connection.query("SHOW INDEX FROM trip_tools_members WHERE Key_name = 'uq_trip_member_user'");
    if (!memberIndexes.length) await connection.query("ALTER TABLE trip_tools_members ADD UNIQUE KEY uq_trip_member_user (user_id)");

    const [members] = await connection.query("SELECT COUNT(*) AS count FROM trip_tools_members");
    if (!Number(members[0].count)) {
      const [users] = await connection.query("SELECT id FROM trip_users ORDER BY id");
      if (users.length) {
        const [trip] = await connection.execute("INSERT INTO trip_tools_trips (owner_user_id, trip_data) VALUES (?, ?)", [users[0].id, initialTrip]);
        for (const [index, user] of users.entries()) {
          await connection.execute("INSERT INTO trip_tools_members (trip_id, user_id, role) VALUES (?, ?, ?)", [trip.insertId, user.id, index === 0 ? "owner" : "member"]);
        }
      }
    }

    const [groupMigration] = await connection.execute("SELECT migration_key FROM trip_tools_migrations WHERE migration_key = 'separate_admin_created_users_v3'");
    if (!groupMigration.length) {
      const [standaloneUsers] = await connection.query(`
        SELECT DISTINCT u.id, u.name
        FROM trip_users u
        JOIN trip_tools_members m ON m.user_id = u.id
        JOIN trip_tools_trips t ON t.id = m.trip_id
        JOIN trip_users owner ON owner.id = t.owner_user_id
        WHERE u.role = 'user' AND owner.role = 'admin' AND t.owner_user_id <> u.id
      `);
      for (const user of standaloneUsers) {
        const data = JSON.stringify({ tripName: `${user.name}'s Japan Trip`, startDate: "", endDate: "", shopping: [], days: [], travelers: [], notes: "" });
        await connection.execute("DELETE FROM trip_tools_members WHERE user_id = ?", [user.id]);
        const [newTrip] = await connection.execute("INSERT INTO trip_tools_trips (owner_user_id, trip_data) VALUES (?, ?)", [user.id, data]);
        await connection.execute("INSERT INTO trip_tools_members (trip_id, user_id, role) VALUES (?, ?, 'owner')", [newTrip.insertId, user.id]);
      }
      await connection.execute("INSERT INTO trip_tools_migrations (migration_key) VALUES ('separate_admin_created_users_v3')");
    }
    await connection.commit();
    const [[userCount]] = await connection.query("SELECT COUNT(*) AS count FROM trip_users");
    const [[tripCount]] = await connection.query("SELECT COUNT(*) AS count FROM trip_tools_trips");
    const [[adminCount]] = await connection.query("SELECT COUNT(*) AS count FROM trip_users WHERE role = 'admin' AND name = 'daniel.chow'");
    console.log(`Trip Tools ready: ${userCount.count} users, ${tripCount.count} shared trip(s), daniel.chow admin: ${adminCount.count === 1}.`);
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
} finally {
  await pool.end();
}
