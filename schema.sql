CREATE TABLE IF NOT EXISTS user_status (
    email TEXT NOT NULL,
    date TEXT NOT NULL,
    status TEXT NOT NULL,
    PRIMARY KEY (email, date)
);
