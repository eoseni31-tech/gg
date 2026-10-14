CREATE TABLE password_credentials (couple_id TEXT PRIMARY KEY NOT NULL REFERENCES couples(id), salt TEXT NOT NULL, password_hash TEXT NOT NULL);
