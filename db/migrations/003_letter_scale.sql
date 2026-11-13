-- Per-course letter-grade cutoffs: a JSON list of minimum percentages for
-- A, A-, B+, B, B-, C+, C, C-, D+, D and D- (F is everything lower).
-- NULL means the standard scale (A >= 93, A- >= 90, ...).
ALTER TABLE courses ADD COLUMN letter_scale TEXT;
