PRAGMA foreign_keys=ON;
CREATE TABLE IF NOT EXISTS courses(id TEXT PRIMARY KEY,name TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS students(id TEXT PRIMARY KEY,name TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS enrollments(course_id TEXT REFERENCES courses(id),student_id TEXT REFERENCES students(id),PRIMARY KEY(course_id,student_id));
CREATE TABLE IF NOT EXISTS sessions(id TEXT PRIMARY KEY,course_id TEXT NOT NULL REFERENCES courses(id),name TEXT NOT NULL,classroom TEXT NOT NULL,latitude REAL NOT NULL,longitude REAL NOT NULL,start INTEGER NOT NULL,end INTEGER NOT NULL,normal_radius REAL NOT NULL,review_radius REAL NOT NULL,max_adjustment REAL NOT NULL,placeholder INTEGER NOT NULL DEFAULT 0);
CREATE TABLE IF NOT EXISTS attendance(id INTEGER PRIMARY KEY,student_id TEXT NOT NULL REFERENCES students(id),course_id TEXT NOT NULL REFERENCES courses(id),session_id TEXT NOT NULL REFERENCES sessions(id),timestamp INTEGER NOT NULL,location_timestamp INTEGER NOT NULL,raw_latitude REAL,raw_longitude REAL,corrected_latitude REAL,corrected_longitude REAL,geolocation_accuracy REAL NOT NULL,correction_distance REAL NOT NULL,distance_to_classroom REAL NOT NULL,token_id TEXT NOT NULL,status TEXT NOT NULL,low_accuracy INTEGER NOT NULL,simulated INTEGER NOT NULL DEFAULT 0,UNIQUE(student_id,session_id));
CREATE INDEX IF NOT EXISTS attendance_session ON attendance(session_id);
PRAGMA user_version=1;
