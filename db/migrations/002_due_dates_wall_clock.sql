-- Due dates are wall-clock times ("Friday 11:59 PM"), stored as YYYY-MM-DDTHH:MM
-- with no timezone, so a deadline never shifts. Trims older seconds/UTC values.
UPDATE assignments SET due_date = substr(due_date, 1, 16) WHERE length(due_date) > 16;
