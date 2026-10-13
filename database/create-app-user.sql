-- Run once as the MySQL root/admin user, AFTER schema.sql.
-- Gives the website its own limited account (it can read/write the guco database and nothing else).
-- Change the password, and put the same one in .env (DB_USER / DB_PASSWORD).
CREATE USER IF NOT EXISTS 'guco_app'@'localhost' IDENTIFIED BY 'ChangeThisPassword!1';
GRANT SELECT, INSERT, UPDATE, DELETE ON guco.* TO 'guco_app'@'localhost';
FLUSH PRIVILEGES;
