-- Fictional Sample Data for UCU Campus Lost and Found System
USE ucu_lost_and_found;

-- The administrator password is set from ADMIN_PASSWORD when the backend starts.
-- Student sample accounts use 'Student@1234'; these are pre-computed bcrypt hashes (10 rounds).
INSERT INTO users (id, full_name, student_or_staff_id, email, phone, password_hash, role) VALUES
(1, 'UCU Student Affairs Desk', 'STAFF-UCU-001', 'admin@ucu.ac.ug', '+256700100200', '$2a$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy', 'admin'),
(2, 'Okello David', 'S24B13/045', 'okello.david@students.ucu.ac.ug', '+256772345678', '$2a$10$8K1p/a0dL1LXMIgoEDFrwOfMQ1T3z/6o2M1oQ1P4P7r/4dG9H2e8K', 'student'),
(3, 'Namusoke Sarah', 'S24B13/112', 'namusoke.sarah@students.ucu.ac.ug', '+256752987654', '$2a$10$8K1p/a0dL1LXMIgoEDFrwOfMQ1T3z/6o2M1oQ1P4P7r/4dG9H2e8K', 'student'),
(4, 'Mugisha Brian', 'S23D11/089', 'mugisha.brian@students.ucu.ac.ug', '+256781234567', '$2a$10$8K1p/a0dL1LXMIgoEDFrwOfMQ1T3z/6o2M1oQ1P4P7r/4dG9H2e8K', 'student');

-- Sample Lost & Found Reports (Including the N5B Blue Keyring Scenario)
INSERT INTO items (id, reporter_id, report_type, title, category, public_description, private_details, campus_location, incident_date, status) VALUES
(1, 3, 'FOUND', 'Set of Room Keys with Blue Keyring', 'Keys & Access Cards',
 'Found a set of three metallic keys attached to a blue plastic keyring under a chair right after the Health and Wholeness lecture. Handed safely to the Student Affairs office.',
 'Back of the blue keyring has a faint silver engraving reading "PH-204" and a small brass padlock key with serial number 408.',
 'Lecture Room N5B', '2026-11-23', 'OPEN'),

(2, 2, 'LOST', 'Hostel Room Keys on Blue Keyring', 'Keys & Access Cards',
 'Lost my room keys between N5B lecture room, Touch of Class Restaurant, and Hamu Mukasa Library. Has a blue keyring attached.',
 NULL,
 'Lecture Room N5B', '2026-11-23', 'OPEN'),

(3, 4, 'FOUND', 'Black HP 65W Laptop Charger', 'Electronics',
 'Found an HP blue-tip laptop power adapter left plugged into a study desk socket on the second floor.',
 'Has a small green electrical tape wrap near the AC plug and initials "M.K." written on the brick.',
 'Hamu Mukasa Library', '2026-11-22', 'OPEN'),

(4, 2, 'LOST', 'Scientific Calculator (Casio fx-991EX)', 'Books & Stationery',
 'Misplaced my black Casio ClassWiz calculator after an afternoon tutorial session.',
 NULL,
 'Technology Park / Lab 2', '2026-11-20', 'OPEN'),

(5, 3, 'FOUND', 'UCU Student Identity Card', 'ID Cards & Documents',
 'Found a student ID card near the main dining entrance during lunch hours. Submitted to the campus security & admin desk.',
 'Card belongs to Faculty of Engineering, Design and Technology, Year 1, Card No. ending in 8821.',
 'Touch of Class Restaurant', '2026-11-18', 'RETURNED');

-- Sample Claim on Item #1 (Okello claiming the keys Namusoke found)
INSERT INTO claims (id, item_id, claimant_id, evidence_description, status, admin_notes, collection_instructions) VALUES
(1, 1, 2,
 'These are my Premium Hostel keys. The back of the blue keyring has "PH-204" engraved on it, and there are 3 keys total including a small brass padlock key.',
 'PENDING', NULL, NULL);
